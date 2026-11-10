import * as THREE from 'three';

/**
 * 根据太阳高度角、方位角、云量、风暴暗度与闪电强度，计算统一的大气散射配色与太阳向量
 * 供天空穹顶、海面菲涅尔反射、远景空气透视雾以及场景主光源共用
 */
export function computeAtmosphereState(params) {
  const {
    sunElevation = 35,
    sunAzimuth = 132,
    cloudCover = 0.34,
    cloudDarkness = 0.16,
    fogDensity = 0.00028,
    lightningFlash = 0.0
  } = params;

  const elevRad = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(sunElevation, -8, 88));
  const azimRad = THREE.MathUtils.degToRad(sunAzimuth);

  const cosElev = Math.cos(elevRad);
  const sinElev = Math.sin(elevRad);
  const sunDir = new THREE.Vector3(
    cosElev * Math.cos(azimRad),
    sinElev,
    cosElev * Math.sin(azimRad)
  ).normalize();

  // 日落/晨曦暖度因子 (太阳高度在 0~22 度之间最强)
  const goldenFactor = THREE.MathUtils.clamp(1.0 - Math.abs(sunElevation - 5.5) / 20.0, 0.0, 1.0);
  // 白昼因子
  const dayFactor = THREE.MathUtils.smoothstep(sunElevation, -4.0, 26.0);
  // 暴风乌云压暗因子
  const overcast = THREE.MathUtils.clamp(cloudCover * 0.65 + cloudDarkness * 0.65, 0.0, 0.96);

  // 天顶色
  const clearZenith = new THREE.Color('#0c3b75').lerp(new THREE.Color('#18223d'), goldenFactor * 0.55);
  const stormZenith = new THREE.Color('#0b131e');
  const zenithColor = clearZenith.clone().lerp(stormZenith, overcast);

  // 地平线大气散射色
  const clearHorizon = new THREE.Color('#7cc4f5').lerp(new THREE.Color('#f47c48'), goldenFactor * 0.85);
  const stormHorizon = new THREE.Color('#233240').lerp(new THREE.Color('#16212c'), cloudDarkness);
  const horizonColor = clearHorizon.clone().lerp(stormHorizon, overcast);

  // 太阳圆盘与直射光颜色
  const noonSun = new THREE.Color('#fff9ed');
  const sunsetSun = new THREE.Color('#ff7e36');
  const stormSun = new THREE.Color('#7c93a8');
  const sunColor = noonSun
    .clone()
    .lerp(sunsetSun, goldenFactor * 0.88)
    .lerp(stormSun, overcast * 0.78);

  // 闪电脉冲增亮
  if (lightningFlash > 0.001) {
    const boltTint = new THREE.Color('#cbe5ff');
    zenithColor.lerp(boltTint, lightningFlash * 0.42);
    horizonColor.lerp(boltTint, lightningFlash * 0.35);
  }

  // 海雾颜色与地平线严格融合，避免海天交界硬边
  const fogColor = horizonColor.clone();

  return {
    sunDir,
    zenithColor,
    horizonColor,
    sunColor,
    fogColor,
    fogDensity,
    goldenFactor,
    dayFactor,
    overcast
  };
}

/**
 * 供天空穹顶着色器与海面反射着色器共用的 GLSL 大气+云层采样函数块
 */
export const SHARED_SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;
uniform float uCloudCover;
uniform float uCloudDarkness;
uniform float uLightningFlash;
uniform vec3 uLightningPos;
uniform float uWindAngle;
uniform float uWindSpeed;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
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

float cloudFbm(vec2 p) {
  float v = 0.0;
  float amp = 0.52;
  mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += amp * valueNoise(p);
    p = rot * p * 2.04 + vec2(17.3, 9.2);
    amp *= 0.5;
  }
  return v;
}

vec3 evaluateAtmosphereAndClouds(vec3 dir, float time, bool includeSunDisk) {
  vec3 d = normalize(dir);
  float y = max(d.y, 0.001);

  // 瑞利梯度与地平线辉光
  float horizonMix = pow(1.0 - y, 2.75);
  vec3 sky = mix(uZenithColor, uHorizonColor, horizonMix);

  // 太阳方向米氏前向散射光晕
  float sunCos = max(dot(d, uSunDir), 0.0);
  float mieHalo = pow(sunCos, 6.0) * 0.36 + pow(sunCos, 48.0) * 0.45;
  float sunVis = clamp(1.0 - uCloudDarkness * 0.88, 0.08, 1.0);
  sky += uSunColor * mieHalo * sunVis;

  // 夕阳地平线暖色赤道带
  float sunsetGlow = max(0.0, 1.0 - abs(uSunDir.y) * 3.2) * pow(1.0 - y, 4.0) * (0.4 + 0.6 * sunCos);
  sky += vec3(1.0, 0.42, 0.16) * sunsetGlow * 0.48 * (1.0 - uCloudDarkness * 0.75);

  // 体积感多层程序化云层投影
  if (d.y > 0.015 && uCloudCover > 0.01) {
    vec2 windDir = vec2(cos(uWindAngle), sin(uWindAngle));
    vec2 cloudUV = (d.xz / (d.y + 0.16)) * 1.45;
    vec2 drift = windDir * (time * (0.012 + uWindSpeed * 0.0015));

    float n1 = cloudFbm(cloudUV + drift);
    float n2 = cloudFbm(cloudUV * 2.3 - drift * 1.35 + vec2(4.2, -3.1));
    float cShape = mix(n1, n2, 0.36);

    float threshold = mix(0.68, 0.22, clamp(uCloudCover, 0.0, 1.0));
    float density = smoothstep(threshold, threshold + 0.28, cShape);

    // 向太阳方向偏移采样，近似云层自阴影与银边透射
    vec2 lightOffset = uSunDir.xz * 0.09;
    float shadowSample = cloudFbm(cloudUV + drift + lightOffset);
    float selfShadow = clamp((shadowSample - cShape) * 2.8 + 0.5, 0.0, 1.0);

    vec3 cloudBright = mix(vec3(0.96, 0.97, 1.0), uSunColor * 1.08, 0.45);
    vec3 cloudDark = mix(vec3(0.32, 0.38, 0.46), vec3(0.06, 0.09, 0.14), uCloudDarkness);
    vec3 cloudCol = mix(cloudBright, cloudDark, clamp(selfShadow * 0.65 + uCloudDarkness * 0.65, 0.0, 1.0));

    // 太阳银边 (Silver lining)
    float silver = pow(sunCos, 10.0) * (1.0 - density * 0.65) * (1.0 - uCloudDarkness * 0.5);
    cloudCol += uSunColor * silver * 0.85;

    // 雷暴云内闪电透亮
    if (uLightningFlash > 0.001) {
      vec3 toBolt = normalize(vec3(uLightningPos.x, 260.0, uLightningPos.z));
      float boltFocus = pow(max(dot(d, toBolt), 0.0), 4.0);
      cloudCol += vec3(0.65, 0.82, 1.0) * uLightningFlash * (0.35 + 1.45 * boltFocus);
    }

    // 地平线处云层淡入大气雾色
    float horizonFade = smoothstep(0.015, 0.16, d.y);
    sky = mix(sky, cloudCol, density * horizonFade * 0.92);
  }

  // 太阳圆盘
  if (includeSunDisk) {
    float sunDisk = smoothstep(0.99935, 0.99985, sunCos);
    float cloudMask = clamp(1.0 - uCloudCover * 0.78, 0.05, 1.0);
    sky += uSunColor * sunDisk * 4.5 * cloudMask;
  }

  return sky;
}
`;
