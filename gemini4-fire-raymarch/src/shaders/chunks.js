// GLSL3 公共着色器函数块：三维梯度/值噪声、分形布朗运动(FBM)、元胞侵蚀、
// Interleaved Gradient Noise (IGN) 抖动、黑体三层火焰光谱与 ACES 色调映射。

export const GLSL_NOISE_AND_COLOR = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// 三维 C2 连续 Value Noise
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, u.x);
  float nx10 = mix(n010, n110, u.x);
  float nx01 = mix(n001, n101, u.x);
  float nx11 = mix(n011, n111, u.x);

  float nxy0 = mix(nx00, nx10, u.y);
  float nxy1 = mix(nx01, nx11, u.y);

  return mix(nxy0, nxy1, u.z);
}

// 旋转矩阵打散轴向伪影
const mat3 FBM_ROT = mat3(
   0.00,  0.80,  0.60,
  -0.80,  0.36, -0.48,
  -0.60, -0.48,  0.64
);

float fbm2(vec3 p) {
  float v = 0.55 * noise3(p);
  p = FBM_ROT * p * 2.04 + vec3(13.7, 7.1, 19.3);
  v += 0.45 * noise3(p);
  return v;
}

float fbm3(vec3 p) {
  float v = 0.50 * noise3(p);
  p = FBM_ROT * p * 2.03 + vec3(9.2, 17.5, 4.8);
  v += 0.33 * noise3(p);
  p = FBM_ROT * p * 2.05 + vec3(21.4, 3.9, 12.6);
  v += 0.17 * noise3(p);
  return v;
}

// 快速伪元胞侵蚀项：刻画火舌边缘撕裂、分叉与收尖空腔
float flameCellularErosion(vec3 p) {
  vec3 s1 = sin(p * 3.14159265);
  vec3 s2 = cos(p.yzx * 4.71238898 + s1 * 1.15);
  return clamp(0.5 + 0.5 * dot(s1, s2) / 3.0, 0.0, 1.0);
}

// Interleaved Gradient Noise (Jimenez 2014)：消除体积步进条带伪影
float ign(vec2 pixel, float framePhase) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(pixel + framePhase * vec2(5.588238, 3.14159), magic.xy)));
}

// 三层物理火焰发射光谱（高温核心 / 明亮主焰 / 橙红外焰 + 底部富氧预混蓝晕）
vec3 evaluateFireSpectrum(float T, float premixBlue, int spectrumMode) {
  vec3 col;
  if (spectrumMode == 1) {
    // 锻炉炽焰 (1750°C 富氧高温)
    vec3 outer = vec3(0.62, 0.08, 0.01);
    vec3 mainF = vec3(3.60, 1.85, 0.38);
    vec3 coreF = vec3(6.20, 5.40, 4.50);
    col = mix(outer, vec3(2.10, 0.52, 0.05), smoothstep(0.05, 0.42, T));
    col = mix(col, mainF, smoothstep(0.42, 0.76, T));
    col = mix(col, coreF, smoothstep(0.78, 0.97, T));
    col += vec3(0.25, 0.72, 2.40) * premixBlue * 0.85;
  } else if (spectrumMode == 2) {
    // 铜盐青焰 (Cu²⁺ 翡翠碧火)
    vec3 outer = vec3(0.02, 0.38, 0.26);
    vec3 midF  = vec3(0.14, 1.85, 0.72);
    vec3 mainF = vec3(0.65, 3.55, 1.35);
    vec3 coreF = vec3(3.60, 5.20, 3.90);
    col = mix(outer, midF, smoothstep(0.05, 0.42, T));
    col = mix(col, mainF, smoothstep(0.42, 0.76, T));
    col = mix(col, coreF, smoothstep(0.78, 0.97, T));
    col += vec3(0.15, 0.55, 1.95) * premixBlue * 0.7;
  } else if (spectrumMode == 3) {
    // 幽冥魂火 (深渊紫蓝灵火)
    vec3 outer = vec3(0.22, 0.02, 0.48);
    vec3 midF  = vec3(0.75, 0.16, 1.85);
    vec3 mainF = vec3(1.45, 0.78, 3.65);
    vec3 coreF = vec3(3.90, 3.50, 5.60);
    col = mix(outer, midF, smoothstep(0.05, 0.42, T));
    col = mix(col, mainF, smoothstep(0.42, 0.76, T));
    col = mix(col, coreF, smoothstep(0.78, 0.97, T));
  } else {
    // 标准松木篝火：严格表现 ①橙红外焰 ②明亮主焰 ③白炽高温核心 三层结构
    vec3 darkTip   = vec3(0.42, 0.028, 0.002);
    vec3 outerRed  = vec3(1.82, 0.32,  0.018); // 橙红外焰层
    vec3 mainGold  = vec3(3.55, 1.52,  0.21);  // 明亮主焰层
    vec3 whiteCore = vec3(5.40, 4.15,  2.75);  // 高温核心层
    col = mix(darkTip, outerRed, smoothstep(0.05, 0.42, T));
    col = mix(col, mainGold, smoothstep(0.42, 0.76, T));
    col = mix(col, whiteCore, smoothstep(0.78, 0.97, T));
    // 柴堆根部挥发分富氧预混微蓝晕
    col += vec3(0.16, 0.38, 1.45) * premixBlue * 0.52;
  }
  return col;
}

// ACES Filmic (Narkowicz 2015) 色调映射与线性->sRGB 转换
vec3 acesTonemap(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 linearToSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
`;
