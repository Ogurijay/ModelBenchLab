// Grok 版海面与天空 ShaderMaterial。
// 顶点着色器完整复现 waves.js 的 Gerstner 位移与法线，参数通过 uniform 数组同步。
// 片元包含：Fresnel、程序化天空反射、浪尖泡沫、高频扰动法线、次表面 + 太阳高光 + 距离雾。

import * as THREE from 'three';
import { MAX_WAVES } from './waves.js';

const SKY_GLSL = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSunColor;

  vec3 skyColor(vec3 dir) {
    float elev = clamp(dir.y, 0.0, 1.0);
    vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(elev, 0.58));
    float cosS = max(dot(normalize(dir), uSunDir), 0.0);
    float disk = pow(cosS, 1350.0) * 5.8;
    float halo = pow(cosS, 15.0) * 0.42;
    return sky + uSunColor * (disk + halo);
  }
`;

const OCEAN_VS = /* glsl */ `
  #define MAX_WAVES ${MAX_WAVES}
  uniform float uTime;
  uniform int uWaveCount;
  uniform vec4 uWaveA[MAX_WAVES]; // (dirX, dirZ, steepness, k)
  uniform vec4 uWaveB[MAX_WAVES]; // (omega, phase, amplitude, _)

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

      n.x -= d.x * k * A * c;
      n.z -= d.y * k * A * c;
      n.y -= Q * k * A * s;

      crest += Q * k * A * s;
    }

    vec3 displaced = base + disp;
    vWorldPos = displaced;
    vNormal = normalize(n);
    vCrest = crest;
    gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
  }
`;

const OCEAN_FS = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform float uFoamAmount;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  ${SKY_GLSL}

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

    // 高频法线扰动（模拟细碎波光，补偿网格分辨率）
    float r1 = valueNoise(vWorldPos.xz * 1.35 + uTime * 0.42);
    float r2 = valueNoise(vWorldPos.xz * 3.05 - uTime * 0.58);
    N = normalize(N + vec3((r1 + r2) * 0.5 - 1.0, 0.0, (r1 + r2) * 0.5 - 1.0) * 0.055);

    float fres = 0.018 + 0.982 * pow(1.0 - max(dot(N, V), 0.0), 5.2);

    vec3 R = reflect(-V, N);
    R.y = max(R.y, 0.01);
    vec3 reflected = skyColor(R);

    // 浪峰偏亮（次表面散射近似）+ 浪谷更深
    float hMix = clamp(vWorldPos.y * 0.21 + 0.5, 0.0, 1.0);
    float sss = pow(max(dot(V, vec3(-uSunDir.x, -0.02, -uSunDir.z)), 0.0), 1.8) * hMix * 0.32;
    vec3 water = mix(uDeepColor, uShallowColor, hMix * 0.58 + sss);

    vec3 col = mix(water, reflected, fres);

    // 太阳镜面高光
    float spec = pow(max(dot(R, uSunDir), 0.0), 260.0);
    col += uSunColor * spec * 1.55;

    // 浪尖泡沫：crest 挤压 + 噪声边缘
    float fn = valueNoise(vWorldPos.xz * 0.88 + uTime * 0.16) * 0.48;
    float foam = smoothstep(0.59, 1.12, vCrest + fn) * uFoamAmount;
    col = mix(col, vec3(0.94, 0.975, 1.0), clamp(foam, 0.0, 1.0));

    // 距离雾（平方指数），让远海自然融入天空
    float d = length(cameraPosition - vWorldPos);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * d * d);
    col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
  }
`;

const SKY_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const SKY_FS = /* glsl */ `
  precision highp float;
  ${SKY_GLSL}
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    gl_FragColor = vec4(skyColor(vec3(dir.x, max(dir.y, 0.0), dir.z)), 1.0);
  }
`;

const PALETTE = {
  deep: new THREE.Color('#05283b'),
  shallow: new THREE.Color('#17829a'),
  zenith: new THREE.Color('#2f66aa'),
  horizon: new THREE.Color('#b9d4e8'),
  sun: new THREE.Color('#fff4d8'),
  fog: new THREE.Color('#b5ccd9'),
};

function makeSkyUniforms() {
  return {
    uSunDir: { value: new THREE.Vector3(0.1, 0.35, -0.93).normalize() },
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
    uFoamAmount: { value: 0.68 },
    uFogColor: { value: PALETTE.fog.clone() },
    uFogDensity: { value: 0.0029 },
    ...makeSkyUniforms(),
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: OCEAN_VS,
    fragmentShader: OCEAN_FS,
  });
}

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: makeSkyUniforms(),
    vertexShader: SKY_VS,
    fragmentShader: SKY_FS,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

export function applyWaves(mat, waves) {
  const { uWaveA, uWaveB, uWaveCount } = mat.uniforms;
  uWaveCount.value = Math.min(waves.length, MAX_WAVES);
  for (let i = 0; i < MAX_WAVES; i++) {
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

export function applySun(mats, elevDeg, azimDeg) {
  const e = (elevDeg * Math.PI) / 180;
  const a = (azimDeg * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.cos(e) * Math.cos(a),
    Math.sin(e),
    Math.cos(e) * Math.sin(a)
  ).normalize();
  for (const m of mats) {
    m.uniforms.uSunDir.value.copy(dir);
  }
}
