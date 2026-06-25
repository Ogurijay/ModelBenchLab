// 海面和天空的 ShaderMaterial（着色器材质）。
// 海面顶点着色器执行与 waves.js 相同的 Gerstner 位移，参数通过 uniform 数组传入。

import * as THREE from 'three';
import { MAX_WAVES } from './waves.js';

const SKY_COLOR_GLSL = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSunColor;

  vec3 skyColor(vec3 dir) {
    float elev = clamp(dir.y, 0.0, 1.0);
    vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(elev, 0.55));
    float cosSun = max(dot(normalize(dir), uSunDir), 0.0);
    float disk = pow(cosSun, 1200.0) * 6.0;   // 太阳盘
    float halo = pow(cosSun, 16.0) * 0.45;    // 太阳光晕
    return sky + uSunColor * (disk + halo);
  }
`;

const OCEAN_VERTEX = /* glsl */ `
  #define MAX_WAVES ${MAX_WAVES}
  uniform float uTime;
  uniform int uWaveCount;
  uniform vec4 uWaveA[MAX_WAVES]; // dirX, dirZ, steepness(Q), k
  uniform vec4 uWaveB[MAX_WAVES]; // omega, phase, amplitude, 0

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;

  void main() {
    vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 p = base.xz;

    vec3 disp = vec3(0.0);
    vec3 n = vec3(0.0, 1.0, 0.0);
    float crest = 0.0;

    for (int i = 0; i < MAX_WAVES; i++) {
      if (i >= uWaveCount) break;
      vec2 d = uWaveA[i].xy;
      float Q = uWaveA[i].z;
      float k = uWaveA[i].w;
      float omega = uWaveB[i].x;
      float phase = uWaveB[i].y;
      float A = uWaveB[i].z;

      float f = k * dot(d, p) - omega * uTime + phase;
      float s = sin(f);
      float c = cos(f);

      disp.x += Q * A * d.x * c;
      disp.z += Q * A * d.y * c;
      disp.y += A * s;

      // GPU Gems 1 第 1 章的 Gerstner 法线累积公式
      n.x -= d.x * k * A * c;
      n.z -= d.y * k * A * c;
      n.y -= Q * k * A * s;

      crest += Q * k * A * s; // 浪尖处水平挤压程度，驱动泡沫
    }

    vec3 displaced = base + disp;
    vWorldPos = displaced;
    vNormal = normalize(n);
    vCrest = crest;
    gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
  }
`;

const OCEAN_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform float uFoamAmount;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  ${SKY_COLOR_GLSL}

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vCrest;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos);

    // 高频法线扰动，弥补网格分辨率不足的细碎波光
    float ripple = valueNoise(vWorldPos.xz * 1.4 + uTime * 0.45)
                 + valueNoise(vWorldPos.xz * 3.1 - uTime * 0.6);
    N = normalize(N + vec3(ripple - 1.0, 0.0, ripple - 1.0) * 0.06);

    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);

    vec3 R = reflect(-V, N);
    R.y = abs(R.y); // 反射方向保持在海平面以上
    vec3 reflected = skyColor(R);

    // 浪峰偏亮偏绿（近似次表面透光），浪谷偏深
    float heightMix = clamp(vWorldPos.y * 0.22 + 0.5, 0.0, 1.0);
    float sss = pow(max(dot(V, vec3(-uSunDir.x, 0.0, -uSunDir.z)), 0.0), 2.0)
              * heightMix * 0.35;
    vec3 water = mix(uDeepColor, uShallowColor, heightMix * 0.55 + sss);

    vec3 color = mix(water, reflected, fresnel);

    // 太阳高光
    float spec = pow(max(dot(R, uSunDir), 0.0), 240.0);
    color += uSunColor * spec * 1.6;

    // 泡沫：浪尖挤压量 + 噪声破碎边缘
    float foamNoise = valueNoise(vWorldPos.xz * 0.9 + uTime * 0.18) * 0.45;
    float foam = smoothstep(0.62, 1.15, vCrest + foamNoise) * uFoamAmount;
    color = mix(color, vec3(0.93, 0.97, 1.0), clamp(foam, 0.0, 1.0));

    // 指数平方距离雾，把远处海面融进天际线
    float dist = length(cameraPosition - vWorldPos);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
  }
`;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 pos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = pos.xyww; // 深度推到最远
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  precision highp float;
  ${SKY_COLOR_GLSL}
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    gl_FragColor = vec4(skyColor(vec3(dir.x, max(dir.y, 0.0), dir.z)), 1.0);
  }
`;

const PALETTE = {
  deep: new THREE.Color('#06283d'),
  shallow: new THREE.Color('#1a7f8e'),
  zenith: new THREE.Color('#2e63a4'),
  horizon: new THREE.Color('#bcd6e6'),
  sun: new THREE.Color('#fff3d6'),
  fog: new THREE.Color('#b7cfdf'),
};

function skyUniforms() {
  return {
    uSunDir: { value: new THREE.Vector3(0, 0.4, -1).normalize() },
    uSkyZenith: { value: PALETTE.zenith.clone() },
    uSkyHorizon: { value: PALETTE.horizon.clone() },
    uSunColor: { value: PALETTE.sun.clone() },
  };
}

export function createOceanMaterial() {
  const uniforms = {
    uTime: { value: 0 },
    uWaveCount: { value: 0 },
    uWaveA: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
    uWaveB: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
    uDeepColor: { value: PALETTE.deep.clone() },
    uShallowColor: { value: PALETTE.shallow.clone() },
    uFoamAmount: { value: 0.7 },
    uFogColor: { value: PALETTE.fog.clone() },
    uFogDensity: { value: 0.0032 },
    ...skyUniforms(),
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT,
  });
}

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: skyUniforms(),
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

/** 把 waves.js 生成的波谱写入海面材质的 uniform 数组。 */
export function applyWaves(material, waves) {
  const { uWaveA, uWaveB, uWaveCount } = material.uniforms;
  uWaveCount.value = waves.length;
  for (let i = 0; i < MAX_WAVES; i += 1) {
    const w = waves[i];
    if (w) {
      uWaveA.value[i].set(w.dirX, w.dirZ, w.steepness, w.k);
      uWaveB.value[i].set(w.omega, w.phase, w.amplitude, 0);
    } else {
      uWaveA.value[i].set(0, 0, 0, 0);
      uWaveB.value[i].set(0, 0, 0, 0);
    }
  }
}

/** 根据太阳高度角/方位角（度）更新海面和天空的太阳方向。 */
export function applySun(materials, elevationDeg, azimuthDeg) {
  const elev = (elevationDeg * Math.PI) / 180;
  const azim = (azimuthDeg * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.cos(elev) * Math.cos(azim),
    Math.sin(elev),
    Math.cos(elev) * Math.sin(azim),
  ).normalize();
  for (const m of materials) {
    m.uniforms.uSunDir.value.copy(dir);
  }
}
