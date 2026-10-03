// 海面着色：三级 cascade 位移（按格距选 mip）+ 逐像素导数法线，
// 菲涅尔天空反射、GGX 太阳高光（远处按亚像素坡度方差加粗糙度）、
// 浪尖透光次表面散射、雅可比泡沫 × 气泡纹理、与天空一致的空气透视。

import * as THREE from 'three';

const VERT = /* glsl */ `
uniform sampler2D uDisp0;
uniform sampler2D uDisp1;
uniform sampler2D uDisp2;
uniform vec3 uLengths;
uniform vec3 uWeights;
uniform float uN;
attribute float aCell;
varying vec3 vWorld;
varying vec2 vBase;
varying float vHeight;

vec3 disp(sampler2D t, vec2 p, float L, float w) {
  if (w <= 0.0) return vec3(0.0);
  float lod = max(0.0, log2(aCell * uN / L) + 0.5);
  return textureLod(t, p / L, lod).xyz * w;
}

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 base = wp.xz;
  vec3 d = disp(uDisp0, base, uLengths.x, uWeights.x)
         + disp(uDisp1, base, uLengths.y, uWeights.y)
         + disp(uDisp2, base, uLengths.z, uWeights.z);
  // 地平线附近逐渐压平，避免远处网格边缘露底
  float far = length(base - cameraPosition.xz);
  d *= 1.0 - smoothstep(6000.0, 16000.0, far);
  wp.xyz += d;
  vWorld = wp.xyz;
  vBase = base;
  vHeight = d.y;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uDisp0;
uniform sampler2D uDisp1;
uniform sampler2D uDisp2;
uniform sampler2D uDeriv0;
uniform sampler2D uDeriv1;
uniform sampler2D uDeriv2;
uniform sampler2D uFoamTex;
uniform samplerCube uEnv;
uniform float uEnvMaxLod;
uniform vec3 uLengths;
uniform vec3 uWeights;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uDeepColor;
uniform vec3 uScatterColor;
uniform float uRoughness;
uniform float uSSS;
uniform float uFoamAmount;
uniform float uFoamThreshold;
uniform float uFoamBias;
uniform float uSpecVis;
uniform float uFogDensity;
uniform float uTime;
uniform vec2 uWindDir;
uniform float uDebug;
varying vec3 vWorld;
varying vec2 vBase;
varying float vHeight;

const float PI = 3.14159265;

float D_GGX(float NdotH, float a) {
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}
float V_SmithJoint(float NdotV, float NdotL, float a) {
  float a2 = a * a;
  float gv = NdotL * sqrt(NdotV * NdotV * (1.0 - a2) + a2);
  float gl = NdotV * sqrt(NdotL * NdotL * (1.0 - a2) + a2);
  return 0.5 / max(gv + gl, 1e-5);
}

void main() {
  vec2 p = vBase;
  vec4 dv = texture2D(uDeriv0, p / uLengths.x) * uWeights.x
          + texture2D(uDeriv1, p / uLengths.y) * uWeights.y
          + texture2D(uDeriv2, p / uLengths.z) * uWeights.z;
  float foamRaw = texture2D(uDisp0, p / uLengths.x).w * uWeights.x * 0.9
                + texture2D(uDisp1, p / uLengths.y).w * uWeights.y
                + texture2D(uDisp2, p / uLengths.z).w * uWeights.z * 0.55;

  // 三级合成后的瞬时雅可比（忽略交叉项）：单级不翻卷、叠加后翻卷的浪尖
  float Jsum = (1.0 + dv.z) * (1.0 + dv.w);
  foamRaw = max(foamRaw, clamp((uFoamBias - Jsum) * 2.0, 0.0, 1.0));

  vec2 slope = vec2(dv.x / (1.0 + dv.z), dv.y / (1.0 + dv.w));
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  // 法线背向相机时（掠射角下的法线贴图伪影）拉回可见半球
  float nv = dot(N, V);
  if (nv < 0.03) N = normalize(N + V * (0.03 - nv));
  float NdotV = max(dot(N, V), 1e-3);

  // 远处 mip 平均掉的坡度方差折算成粗糙度，太阳光斑自然拉长成光路
  float distRough = clamp(log2(1.0 + dist / 45.0) * 0.055, 0.0, 0.38);
  float rough = sqrt(uRoughness * uRoughness + distRough * distRough);
  float a = rough * rough;

  // 反射
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = textureLod(uEnv, R, rough * uEnvMaxLod * 0.9).rgb;
  float F = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  F *= mix(1.0, 0.75, smoothstep(0.1, 0.4, rough));

  // 太阳高光
  vec3 L = uSunDir;
  float NdotL = max(dot(N, L), 0.0);
  vec3 H = normalize(V + L);
  float NdotH = max(dot(N, H), 0.0);
  float VdotH = max(dot(V, H), 0.0);
  float Fh = 0.02 + 0.98 * pow(1.0 - VdotH, 5.0);
  vec3 spec = uSunColor * D_GGX(NdotH, a) * V_SmithJoint(NdotV, NdotL, a) * Fh * NdotL;
  spec *= smoothstep(-0.02, 0.04, L.y) * uSpecVis;

  // 水体散射（Atlas 式经验模型）：浪尖背光透亮 + 正视加深 + 漫射天光
  vec3 skyAmb = textureLod(uEnv, vec3(0.0, 1.0, 0.0), uEnvMaxLod).rgb;
  float crest = max(0.0, vHeight) * 0.6 + 0.08;
  float towardSun = pow(max(dot(L, -V), 0.0), 4.0);
  float back = pow(max(0.5 - 0.5 * dot(L, N), 0.0), 3.0);
  vec3 sss = uScatterColor * uSunColor * (uSSS * crest * towardSun * back * 6.0 + 0.06 * NdotV * NdotV);
  vec3 body = uDeepColor * (skyAmb * 0.9 + uSunColor * max(L.y, 0.0) * 0.08) + sss
            + uScatterColor * uSunColor * NdotL * 0.012;

  vec3 col = (1.0 - F) * body + F * refl + spec;

  // 泡沫：雅可比翻卷区 × 气泡纹理（两尺度、随风漂移）
  vec2 w = uWindDir * uTime;
  float ft = texture2D(uFoamTex, p * 0.21 + w * 0.012).r * 0.6 + texture2D(uFoamTex, p * 0.067 - w * 0.006).r * 0.55;
  float foamMask = smoothstep(uFoamThreshold, uFoamThreshold + 0.45, foamRaw * (0.55 + ft));
  foamMask *= uFoamAmount;
  foamMask = clamp(foamMask, 0.0, 1.0) * (1.0 - smoothstep(1500.0, 5000.0, dist) * 0.7);
  vec3 foamCol = vec3(0.86, 0.9, 0.92) * (uSunColor * (0.25 + 0.75 * NdotL) / PI + skyAmb * 0.95);
  col = mix(col, foamCol, foamMask);

  // 空气透视：远处融入同方向的地平线天空
  vec3 hd = normalize(vec3(-V.x, 0.0, -V.z) + vec3(0.0, 0.015, 0.0));
  vec3 fogCol = textureLod(uEnv, hd, 2.0).rgb;
  float fog = 1.0 - exp(-dist * uFogDensity);
  col = mix(col, fogCol, fog);

  if (uDebug > 0.5 && uDebug < 1.5) col = N * 0.5 + 0.5;
  else if (uDebug > 1.5 && uDebug < 2.5) col = vec3(foamRaw);
  else if (uDebug > 2.5) col = vec3(F);

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createWaterMaterial({ ocean, foamTexture, envTexture, envMaxLod }) {
  const g = ocean.gpu;
  const uniforms = {
    uDisp0: { value: g.dispTexture(0) },
    uDisp1: { value: g.dispTexture(1) },
    uDisp2: { value: g.dispTexture(2) },
    uDeriv0: { value: g.derivTexture(0) },
    uDeriv1: { value: g.derivTexture(1) },
    uDeriv2: { value: g.derivTexture(2) },
    uFoamTex: { value: foamTexture },
    uEnv: { value: envTexture },
    uEnvMaxLod: { value: envMaxLod },
    uLengths: { value: new THREE.Vector3(...ocean.layout.map((c) => c.L)) },
    uWeights: { value: new THREE.Vector3(1, 1, 1) },
    uN: { value: ocean.N },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uDeepColor: { value: new THREE.Color(0x02101c) },
    uScatterColor: { value: new THREE.Color(0x0f6f6a) },
    uRoughness: { value: 0.06 },
    uSSS: { value: 1.0 },
    uFoamAmount: { value: 1.0 },
    uFoamThreshold: { value: 0.12 },
    uFoamBias: { value: 0.5 },
    uSpecVis: { value: 1 },
    uFogDensity: { value: 1 / 9000 },
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(1, 0) },
    uDebug: { value: 0 }
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
  return material;
}

// 每帧把乒乓后的当前输出纹理接到材质上
export function bindOceanTextures(material, ocean) {
  const u = material.uniforms;
  const g = ocean.gpu;
  u.uDisp0.value = g.dispTexture(0);
  u.uDisp1.value = g.dispTexture(1);
  u.uDisp2.value = g.dispTexture(2);
  u.uDeriv0.value = g.derivTexture(0);
  u.uDeriv1.value = g.derivTexture(1);
  u.uDeriv2.value = g.derivTexture(2);
}
