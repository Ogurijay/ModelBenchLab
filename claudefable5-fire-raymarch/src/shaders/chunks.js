// GPU 侧公共 GLSL 块:哈希 / value noise / FBM / 抖动 / 色调映射 / 色彩空间。
// 火焰密度场、天空、火星共享同一套噪声原语,保证视觉语言统一。

export const GLSL_NOISE = /* glsl */ `
// Dave Hoskins 风格浮点哈希:无三角函数,移动端精度稳定
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// 三维 value noise,输出 0–1
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

// 2 倍频 FBM:域扭曲与烟羽用(低频,便宜)
float fbm2(vec3 p) {
  return vnoise(p) * 0.667 + vnoise(p * 2.03 + 17.1) * 0.333;
}

// 3 倍频 FBM:火焰细节用
float fbm3(vec3 p) {
  float v = vnoise(p) * 0.55;
  v += vnoise(p * 2.02 + 13.7) * 0.28;
  v += vnoise(p * 4.05 + 41.3) * 0.17;
  return v;
}

// Interleaved Gradient Noise:逐像素步进抖动,消除 ray marching 分层带
float ign(vec2 v) {
  return fract(52.9829189 * fract(dot(v, vec2(0.06711056, 0.00583715))));
}
`;

export const GLSL_TONEMAP = /* glsl */ `
// ACES 近似(Narkowicz):HDR 火焰高光自然滚降不糊白
vec3 acesTonemap(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// 精确 sRGB OETF(线性 → 显示)
vec3 toSRGB(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}
`;
