import * as THREE from 'three';
import { WAVE_COUNT, LOOP_PERIOD, packSpectrumUniforms } from './waves.js';
import { SHARED_SKY_GLSL } from './atmosphere.js';

/**
 * 构建相机跟随的无缝指数径向网格 (Radial Clip-Mesh)
 */
export function buildRadialOceanGeometry(rings = 220, segments = 256, maxRadius = 14000) {
  const vertexCount = (rings + 1) * (segments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(rings * segments * 6);

  let vIdx = 0;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    let radius;
    if (t === 0) {
      radius = 0;
    } else if (t < 0.42) {
      const u = t / 0.42;
      radius = 110.0 * Math.pow(u, 1.55);
    } else {
      const u = (t - 0.42) / 0.58;
      radius = 110.0 * Math.pow(maxRadius / 110.0, Math.pow(u, 1.9));
    }

    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * Math.PI * 2.0;
      const x = radius * Math.cos(theta);
      const z = radius * Math.sin(theta);

      positions[vIdx * 3 + 0] = x;
      positions[vIdx * 3 + 1] = 0;
      positions[vIdx * 3 + 2] = z;

      uvs[vIdx * 2 + 0] = s / segments;
      uvs[vIdx * 2 + 1] = t;
      vIdx++;
    }
  }

  let iIdx = 0;
  const stride = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = (r + 1) * stride + s;
      const d = c + 1;

      // 逆时针正面朝上 (+Y)
      indices[iIdx++] = a;
      indices[iIdx++] = b;
      indices[iIdx++] = c;

      indices[iIdx++] = b;
      indices[iIdx++] = d;
      indices[iIdx++] = c;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

export function createOceanSurface(initialSpectrum) {
  const geometry = buildRadialOceanGeometry();
  const { waveA, waveB } = packSpectrumUniforms(initialSpectrum);

  const waveAVec4 = [];
  const waveBVec4 = [];
  for (let i = 0; i < WAVE_COUNT; i++) {
    const idx = i * 4;
    waveAVec4.push(new THREE.Vector4(waveA[idx], waveA[idx + 1], waveA[idx + 2], waveA[idx + 3]));
    waveBVec4.push(new THREE.Vector4(waveB[idx], waveB[idx + 1], waveB[idx + 2], waveB[idx + 3]));
  }

  const uniforms = {
    uTime: { value: 0 },
    uGridCenter: { value: new THREE.Vector2(0, 0) },
    uWaveA: { value: waveAVec4 },
    uWaveB: { value: waveBVec4 },
    uHs: { value: initialSpectrum.effectiveHs || 2.05 },
    uSunDir: { value: new THREE.Vector3(-0.5, 0.4, -0.6).normalize() },
    uZenithColor: { value: new THREE.Color('#0c3b75') },
    uHorizonColor: { value: new THREE.Color('#7cc4f5') },
    uSunColor: { value: new THREE.Color('#fff9ed') },
    uDeepColor: { value: new THREE.Color('#031930') },
    uShallowColor: { value: new THREE.Color('#0e8f9c') },
    uCloudCover: { value: 0.34 },
    uCloudDarkness: { value: 0.14 },
    uFogDensity: { value: 0.00022 },
    uRainIntensity: { value: 0.0 },
    uFoamScale: { value: 1.15 },
    uSssStrength: { value: 1.25 },
    uWindAngle: { value: 0.44 },
    uWindSpeed: { value: 10.2 },
    uLightningFlash: { value: 0.0 },
    uLightningPos: { value: new THREE.Vector3(-28, 220, -88) },
    uTornado: { value: new THREE.Vector4(-22, -92, 22, 0) },
    uShipState: { value: new THREE.Vector4(0, 0, 0, 0) },
    uIslandPos: { value: new THREE.Vector3(-82, 0, -42) },
    uDebugMode: { value: 0 }
  };

  const vertexShader = /* glsl */ `
    precision highp float;

    uniform float uTime;
    uniform float uHs;
    uniform vec2 uGridCenter;
    uniform vec4 uWaveA[${WAVE_COUNT}];
    uniform vec4 uWaveB[${WAVE_COUNT}];
    uniform vec4 uTornado;

    varying vec3 vWorldPos;
    varying vec2 vRefXZ;
    varying vec3 vNormal;
    varying float vJacobian;
    varying float vCrest;
    varying float vGroupEnv;
    varying float vCamDist;

    // 顶点级 2D 值噪声，用于叠加非周期中尺度涌浪地貌扰动
    float vHash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float vNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(vHash(i), vHash(i + vec2(1.0, 0.0)), u.x),
        mix(vHash(i + vec2(0.0, 1.0)), vHash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    void main() {
      vec2 refXZ = position.xz + uGridCenter;
      float camDist = length(refXZ - cameraPosition.xz);
      vCamDist = camDist;

      float t = mod(uTime, ${LOOP_PERIOD.toFixed(1)});
      float ts = t * 0.18;

      // 与 CPU 完全同源的波群包络 (groupEnv) 与空间相位扭曲场 (warpXZ)
      float g1 = sin(refXZ.x * 0.017 + refXZ.y * 0.013 - ts * 1.1) * cos(refXZ.x * 0.011 - refXZ.y * 0.019 + ts * 0.7);
      float g2 = sin(refXZ.x * 0.037 - refXZ.y * 0.029 + ts * 1.6) * sin(refXZ.x * 0.023 + refXZ.y * 0.041 - ts * 1.3);
      float g3 = cos(refXZ.x * 0.071 + refXZ.y * 0.053 - ts * 2.1);
      float groupEnv = 0.96 + 0.28 * g1 + 0.16 * g2 + 0.08 * g3;
      vGroupEnv = groupEnv;

      vec2 warpXZ = vec2(
        1.65 * sin(refXZ.x * 0.029 + refXZ.y * 0.037 + ts) + 0.95 * cos(refXZ.x * 0.067 - refXZ.y * 0.051 - ts * 1.4),
        1.65 * cos(refXZ.x * 0.033 - refXZ.y * 0.027 - ts * 0.9) + 0.95 * sin(refXZ.x * 0.059 + refXZ.y * 0.073 + ts * 1.2)
      );

      vec3 disp = vec3(0.0);
      float dXdX = 1.0;
      float dXdZ = 0.0;
      float dZdX = 0.0;
      float dZdZ = 1.0;
      float dYdX = 0.0;
      float dYdZ = 0.0;
      float crestAccum = 0.0;

      for (int i = 0; i < ${WAVE_COUNT}; i++) {
        vec4 wa = uWaveA[i];
        vec4 wb = uWaveB[i];
        float dx = wa.x;
        float dz = wa.y;
        float k = wa.z;
        float omega = wa.w;

        float amp = wb.x;
        float phase = wb.y;
        float steep = wb.z;
        float wl = wb.w;

        float lodFade = 1.0 - smoothstep(wl * 16.0, wl * 65.0, camDist);

        // 局部波群振幅调制：不同分量在不同海域凸显，彻底消除等宽平行波纹
        float fi = float(i);
        float m1 = mod(fi, 5.0) + 1.0;
        float m2 = mod(fi, 3.0) + 1.0;
        float localGroup = groupEnv * (0.85 + 0.25 * sin(refXZ.x * 0.019 * m1 - refXZ.y * 0.017 * m2 + phase));
        float a = amp * localGroup * lodFade;

        // 相位空间扭曲：使波峰线自然弯曲、宽窄错落
        float warpScale = min(0.65, 0.12 + k * 1.4);
        vec2 wPos = refXZ + warpXZ * warpScale;

        float theta = k * (dx * wPos.x + dz * wPos.y) - omega * t + phase;
        float s = sin(theta);
        float c = cos(theta);

        float qa = steep * a;
        float ka = k * a;
        float qka = steep * ka;

        disp.x -= dx * qa * s;
        disp.z -= dz * qa * s;
        disp.y += a * c;

        dXdX -= dx * dx * qka * c;
        dXdZ -= dx * dz * qka * c;
        dZdX -= dz * dx * qka * c;
        dZdZ -= dz * dz * qka * c;

        dYdX -= dx * ka * s * 1.38;
        dYdZ -= dz * ka * s * 1.38;

        if (c > 0.0) {
          crestAccum += a * c * (1.0 + ka * 2.4);
        }
      }

      // 叠加两层完全非周期的 FBM 涌浪起伏（近中场），打破任何潜在的规则网格周期
      float aperiodicFade = (1.0 - smoothstep(40.0, 480.0, camDist)) * min(1.5, uHs * 0.22);
      if (aperiodicFade > 0.005) {
        vec2 np = refXZ * 0.085 + vec2(t * 0.22, -t * 0.17);
        float n0 = vNoise(np) * 2.0 - 1.0;
        float n1 = vNoise(np * 2.37 + vec2(7.3, -4.1)) * 2.0 - 1.0;
        disp.y += (n0 * 0.65 + n1 * 0.35) * aperiodicFade;
      }

      vec3 worldPos = vec3(refXZ.x + disp.x, disp.y, refXZ.y + disp.z);

      // 水龙卷低压涌升与眼区旋涡凹陷
      if (uTornado.w > 0.001) {
        vec2 dT = worldPos.xz - uTornado.xy;
        float r = length(dT) + 1e-4;
        float normR = r / max(uTornado.z, 1.0);
        float outerMound = 2.6 * exp(-normR * normR * 0.35);
        float coreDip = -3.5 * exp(-normR * normR * 2.8);
        float spiralAngle = atan(dT.y, dT.x) * 3.0 - uTime * 6.5 + normR * 2.6;
        float spiralWave = 0.75 * sin(spiralAngle) * exp(-normR * 0.65);
        worldPos.y += uTornado.w * (outerMound + coreDip + spiralWave);
      }

      vec3 n = vec3(
        dYdZ * dZdX - dZdZ * dYdX,
        dZdZ * dXdX - dXdZ * dZdX,
        dXdZ * dYdX - dYdZ * dXdX
      );
      n.y = max(0.08, n.y);

      vWorldPos = worldPos;
      vRefXZ = refXZ;
      vNormal = normalize(n);
      vJacobian = dXdX * dZdZ - dXdZ * dZdX;
      vCrest = crestAccum;

      gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
    }
  `;

  const fragmentShader = /* glsl */ `
    precision highp float;

    varying vec3 vWorldPos;
    varying vec2 vRefXZ;
    varying vec3 vNormal;
    varying float vJacobian;
    varying float vCrest;
    varying float vGroupEnv;
    varying float vCamDist;

    uniform float uTime;
    uniform float uHs;
    uniform vec3 uDeepColor;
    uniform vec3 uShallowColor;
    uniform float uFogDensity;
    uniform float uRainIntensity;
    uniform float uFoamScale;
    uniform float uSssStrength;
    uniform vec4 uTornado;
    uniform vec4 uShipState;
    uniform vec3 uIslandPos;
    uniform int uDebugMode;

    ${SHARED_SKY_GLSL}

    // 100% 非周期域扭曲尖脊波浪噪声（彻底摒弃周期性 sin(uv) 网格，使每一处碎浪宽窄、间距、走向完全随机自然）
    float aperiodicWaveRidge(vec2 p, float sharpen) {
      // 先用低频噪声对坐标做非线性域扭曲 (Domain Warping)
      vec2 warp = vec2(
        valueNoise(p * 0.52 + vec2(13.7, 4.9)) - 0.5,
        valueNoise(p * 0.52 + vec2(-8.3, 19.1)) - 0.5
      );
      float n = valueNoise(p + warp * 1.45);
      // 将平滑噪声映射为尖锐波峰、宽缓波谷的 Trochoid 轮廓
      float ridge = 1.0 - abs(n * 2.0 - 1.0);
      return pow(clamp(ridge, 0.0, 1.0), sharpen);
    }

    float detailWaveHeight(vec2 p, float t) {
      vec2 windDir = vec2(cos(uWindAngle), sin(uWindAngle));
      vec2 crossWind = vec2(-windDir.y, windDir.x);

      // 沿风向略微拉伸波峰线，同时用多组黄金角无理数旋转矩阵打破一切方向/尺度重复
      vec2 anisoP = windDir * dot(p, windDir) * 0.28 + crossWind * dot(p, crossWind) * 0.14;

      mat2 rot1 = mat2(0.78, -0.62, 0.62, 0.78);
      mat2 rot2 = mat2(-0.54, 0.84, -0.84, -0.54);

      float h = 0.0;
      float amp = 0.56;
      float sharpen = 1.85;
      vec2 uv = anisoP;

      // 6 层无理数倍频 (2.13, 2.39, 2.17...) 非周期叠加
      for (int i = 0; i < 6; i++) {
        float fi = float(i);
        vec2 drift1 = windDir * t * (0.38 + fi * 0.15) + crossWind * sin(t * 0.2 + fi) * 0.12;
        vec2 drift2 = windDir * t * (0.29 + fi * 0.11) - crossWind * 0.18 * t;

        float r1 = aperiodicWaveRidge(uv + drift1, sharpen);
        float r2 = aperiodicWaveRidge(rot2 * uv * 1.19 - drift2 + vec2(11.3 * fi, -7.1 * fi), sharpen * 0.9);

        h += (r1 * 0.62 + r2 * 0.38) * amp;

        // 非谐波倍频扩展（避免 2.0 整数倍频造成分形自相似网格感）
        uv = rot1 * uv * (2.13 + mod(fi * 0.17, 0.29)) + vec2(17.1, -9.4);
        amp *= 0.44;
        sharpen = mix(sharpen, 1.15, 0.25);
      }
      return h;
    }

    // 暴雨雨滴冲击海面的动态扩散圆环斜率
    vec2 rainRippleSlope(vec2 worldXZ, float t) {
      vec2 totalSlope = vec2(0.0);
      for (int layer = 0; layer < 2; layer++) {
        vec2 uv = worldXZ * (1.8 + float(layer) * 0.9) + float(layer) * 19.7;
        vec2 cell = floor(uv);
        vec2 f = fract(uv) - 0.5;
        float rnd = hash21(cell + float(layer) * 73.1);
        float cycle = fract(t * 1.9 + rnd);
        float radius = cycle * 0.45;
        float d = length(f);
        float ring = sin((d - radius) * 48.0) * exp(-abs(d - radius) * 28.0) * (1.0 - cycle);
        vec2 dir = d > 1e-4 ? f / d : vec2(0.0);
        totalSlope += dir * ring;
      }
      return totalSlope;
    }

    // 多孔蕾丝状海沫纹理（含大尺度域扭曲，使白沫斑块形状完全不规则）
    float foamBubblePattern(vec2 p) {
      vec2 warp = vec2(valueNoise(p * 0.35), valueNoise(p * 0.35 + vec2(9.2, 4.1))) * 1.6;
      vec2 wp = p + warp;
      float n1 = valueNoise(wp * 1.45);
      float n2 = valueNoise(wp * 4.3 + vec2(5.7, -2.3));
      float n3 = valueNoise(wp * 12.8 - vec2(1.9, 8.4));
      float base = n1 * 0.50 + n2 * 0.32 + n3 * 0.18;
      return smoothstep(0.36, 0.78, base);
    }

    void main() {
      vec3 viewVec = cameraPosition - vWorldPos;
      float dist = length(viewVec);
      vec3 V = viewVec / max(dist, 1e-4);

      // 近中场多尺度非周期尖脊细浪法线
      float detailFade = 1.0 - smoothstep(22.0, 680.0, dist);
      vec3 N = normalize(vNormal);

      if (detailFade > 0.004) {
        float eps = mix(0.14, 0.65, smoothstep(5.0, 300.0, dist));
        float h0 = detailWaveHeight(vWorldPos.xz, uTime);
        float hx = detailWaveHeight(vWorldPos.xz + vec2(eps, 0.0), uTime);
        float hz = detailWaveHeight(vWorldPos.xz + vec2(0.0, eps), uTime);
        vec2 dSlope = vec2(hx - h0, hz - h0) / eps;

        if (uRainIntensity > 0.02 && dist < 110.0) {
          float rainFade = (1.0 - smoothstep(10.0, 110.0, dist)) * uRainIntensity;
          dSlope += rainRippleSlope(vWorldPos.xz, uTime) * 0.45 * rainFade;
        }

        // 受波群包络调制：大浪群区域细浪更湍急，平缓区更柔顺
        float windFactor = clamp(0.32 + uWindSpeed * 0.022, 0.25, 0.78) * (0.75 + 0.35 * vGroupEnv);
        float microScale = windFactor * detailFade;
        N = normalize(N + vec3(-dSlope.x * microScale, 0.0, -dSlope.y * microScale));
      }

      float NdotV = max(dot(N, V), 0.002);

      // Schlick 菲涅尔反射率
      float fresnel = 0.02 + 0.98 * pow(1.0 - NdotV, 4.5);
      fresnel = clamp(fresnel, 0.02, 0.96);

      vec3 R = reflect(-V, N);
      R.y = max(R.y, 0.012);
      R = normalize(R);
      vec3 skyReflect = evaluateAtmosphereAndClouds(R, uTime, false);

      // 水体深浅与波谷吸收色
      float heightFactor = clamp((vWorldPos.y + uHs * 0.45) / max(0.5, uHs * 0.95), 0.0, 1.0);
      float facingFactor = pow(clamp(NdotV, 0.0, 1.0), 0.55);
      vec3 waterBase = mix(uDeepColor * 0.76, uShallowColor, clamp(heightFactor * 0.60 + facingFactor * 0.26, 0.0, 1.0));

      // 浪尖背光翡翠次表面散射 (SSS)
      vec3 backLightDir = normalize(uSunDir + N * 0.55);
      float backLight = pow(max(dot(V, -backLightDir), 0.0), 2.6);
      float crestNorm = clamp(vCrest / max(0.35, uHs * 0.55), 0.0, 1.6);
      float slopeFactor = clamp(1.0 - N.y, 0.0, 1.0);
      float sssMask = crestNorm * (0.28 + 0.72 * backLight) * (0.35 + 0.65 * slopeFactor) * uSssStrength;
      vec3 sssColor = mix(uShallowColor * 1.55, vec3(0.18, 0.92, 0.80), 0.48) * (0.45 + 0.55 * max(uSunDir.y, 0.1));

      // 双瓣 GGX 太阳高光
      vec3 H = normalize(uSunDir + V);
      float NdotH = max(dot(N, H), 0.0);
      float NdotL = max(dot(N, uSunDir), 0.0);
      float cloudSunAtten = clamp(1.0 - uCloudDarkness * 0.82, 0.08, 1.0);

      float roughSharp = mix(0.055, 0.16, smoothstep(10.0, 600.0, dist)) + uRainIntensity * 0.05;
      float a2Sharp = pow(roughSharp, 4.0);
      float dSharp = (NdotH * NdotH * (a2Sharp - 1.0) + 1.0);
      float specSharp = a2Sharp / max(3.14159 * dSharp * dSharp, 1e-5);

      float roughWide = 0.24 + uRainIntensity * 0.06;
      float a2Wide = pow(roughWide, 4.0);
      float dWide = (NdotH * NdotH * (a2Wide - 1.0) + 1.0);
      float specWide = a2Wide / max(3.14159 * dWide * dWide, 1e-5);

      vec3 sunSpec = uSunColor * (specSharp * 1.55 + specWide * 0.42) * fresnel * NdotL * cloudSunAtten;

      if (uLightningFlash > 0.001) {
        vec3 Lbolt = normalize(uLightningPos - vWorldPos);
        vec3 Hbolt = normalize(Lbolt + V);
        float specBolt = pow(max(dot(N, Hbolt), 0.0), 42.0);
        sunSpec += vec3(0.78, 0.90, 1.0) * specBolt * uLightningFlash * 4.5;
      }

      // 1. 雅可比压缩 + 波群高度 + 局部非周期遮罩联合生成不规则浪尖白沫
      float patchMask = smoothstep(0.32, 0.82, valueNoise(vWorldPos.xz * 0.065 + vec2(uTime * 0.05, -uTime * 0.04)));
      float jacobianCompress = clamp((0.95 - vJacobian) * 3.6, 0.0, 1.4);
      float crestHeightMask = smoothstep(0.36, 0.96, crestNorm);
      float jFoam = clamp((jacobianCompress * 0.65 + crestHeightMask * 0.55) * patchMask * uFoamScale, 0.0, 1.4);

      // 2. 强风朗缪尔非规则风成白沫条带
      vec2 windDir = vec2(cos(uWindAngle), sin(uWindAngle));
      vec2 crossWind = vec2(-windDir.y, windDir.x);
      vec2 streakWarp = vec2(
        valueNoise(vWorldPos.xz * 0.05 + uTime * 0.04) - 0.5,
        valueNoise(vWorldPos.xz * 0.05 - uTime * 0.03) - 0.5
      ) * 6.5;
      vec2 warpedXZ = vWorldPos.xz + streakWarp;
      vec2 streakUV = vec2(dot(warpedXZ, windDir) * 0.042, dot(warpedXZ, crossWind) * 0.28);
      float windStreakMask = smoothstep(9.5, 21.0, uWindSpeed) *
        smoothstep(0.60, 0.85, valueNoise(streakUV + vec2(uTime * 0.14, 0.0))) * 0.62;

      // 3. 科考船首破浪与船尾螺旋桨尾流泡沫
      vec2 toShip = vWorldPos.xz - uShipState.xy;
      float shipHeading = uShipState.z;
      vec2 shipFwd = vec2(sin(shipHeading), cos(shipHeading));
      vec2 shipRight = vec2(shipFwd.y, -shipFwd.x);
      float alongWake = -dot(toShip, shipFwd);
      float acrossWake = abs(dot(toShip, shipRight));
      float wakeFoam = 0.0;
      if (alongWake > -7.5 && alongWake < 48.0) {
        float wakeHalfWidth = 2.0 + max(0.0, alongWake + 5.0) * 0.17;
        float centerWash = exp(-pow(acrossWake / (wakeHalfWidth * 0.52), 2.0));
        float vArm = exp(-pow((acrossWake - wakeHalfWidth * 0.85) / 1.15, 2.0));
        float alongFade = smoothstep(-7.5, -2.5, alongWake) * (1.0 - smoothstep(10.0, 48.0, alongWake));
        wakeFoam = (centerWash * 0.92 + vArm * 0.65) * alongFade;
      }

      // 4. 灯塔礁石岛环绕拍岸浪花
      float islandDist = length(vWorldPos.xz - uIslandPos.xz);
      float islandAngle = atan(vWorldPos.z - uIslandPos.z, vWorldPos.x - uIslandPos.x);
      float irregularShore = valueNoise(vec2(cos(islandAngle), sin(islandAngle)) * 2.5 + uTime * 0.15) * 4.5;
      float surfWave = sin((islandDist + irregularShore) * 0.58 - uTime * 2.9) * 0.5 + 0.5;
      float islandFoam = smoothstep(37.0, 20.0, islandDist + irregularShore * 0.5) *
        smoothstep(12.0, 18.5, islandDist) * (0.5 + 0.5 * surfWave);

      // 5. 水龙卷底部剧烈旋转泡沫环
      float spoutFoam = 0.0;
      if (uTornado.w > 0.001) {
        float rSpout = length(vWorldPos.xz - uTornado.xy);
        spoutFoam = uTornado.w * exp(-pow(rSpout / (uTornado.z * 0.95), 2.0)) * 1.25;
      }

      float bubbleTex = foamBubblePattern(vWorldPos.xz * 0.45 + windDir * uTime * 0.20);
      float crestFoamMask = smoothstep(0.42, 0.98, jFoam * (0.38 + 0.82 * bubbleTex));
      float trailFoamMask = smoothstep(0.15, 0.72, max(max(windStreakMask * 0.55, wakeFoam), max(islandFoam, spoutFoam)) * (0.45 + 0.75 * bubbleTex));
      float foamMask = clamp(max(crestFoamMask, trailFoamMask), 0.0, 0.95);

      if (uDebugMode == 1) {
        gl_FragColor = vec4(N * 0.5 + 0.5, 1.0);
        return;
      } else if (uDebugMode == 2) {
        gl_FragColor = vec4(vec3(foamMask, clamp(1.0 - vJacobian, 0.0, 1.0), crestNorm * 0.6), 1.0);
        return;
      } else if (uDebugMode == 3) {
        gl_FragColor = vec4(vec3(fresnel), 1.0);
        return;
      } else if (uDebugMode == 4) {
        gl_FragColor = vec4(sssColor * sssMask, 1.0);
        return;
      }

      vec3 refracted = waterBase + sssColor * sssMask;
      vec3 surfaceCol = mix(refracted, skyReflect, fresnel * 0.88) + sunSpec;

      vec3 foamAmbient = mix(uHorizonColor, uSunColor, 0.38) * (0.78 + 0.35 * max(uSunDir.y, 0.05)) + vec3(0.75, 0.88, 1.0) * uLightningFlash * 0.65;
      vec3 foamColor = clamp(foamAmbient, vec3(0.48), vec3(1.12));
      surfaceCol = mix(surfaceCol, foamColor, foamMask);

      vec3 horDir = normalize(vec3(-V.x, max(0.015, -V.y), -V.z));
      vec3 fogTarget = evaluateAtmosphereAndClouds(horDir, uTime, false);
      float fogFactor = 1.0 - exp(-pow(dist * uFogDensity, 1.35));
      float farBlend = smoothstep(4500.0, 13500.0, dist);
      vec3 finalCol = mix(surfaceCol, fogTarget, clamp(max(fogFactor, farBlend), 0.0, 1.0));

      finalCol = finalCol / (1.0 + finalCol * 0.16);
      gl_FragColor = vec4(finalCol, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    wireframe: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    material,
    uniforms,
    updateSpectrum(spectrum) {
      const { waveA, waveB } = packSpectrumUniforms(spectrum);
      for (let i = 0; i < WAVE_COUNT; i++) {
        const idx = i * 4;
        uniforms.uWaveA.value[i].set(waveA[idx], waveA[idx + 1], waveA[idx + 2], waveA[idx + 3]);
        uniforms.uWaveB.value[i].set(waveB[idx], waveB[idx + 1], waveB[idx + 2], waveB[idx + 3]);
      }
      uniforms.uHs.value = Math.max(0.25, spectrum.effectiveHs || 2.05);
    },
    update(time, camera, atmo, params, tornadoState, shipState, lightningPos) {
      const snap = 2.0;
      const cx = Math.round(camera.position.x / snap) * snap;
      const cz = Math.round(camera.position.z / snap) * snap;
      mesh.position.set(cx, 0, cz);
      uniforms.uGridCenter.value.set(cx, cz);

      uniforms.uTime.value = time;
      uniforms.uSunDir.value.copy(atmo.sunDir);
      uniforms.uZenithColor.value.copy(atmo.zenithColor);
      uniforms.uHorizonColor.value.copy(atmo.horizonColor);
      uniforms.uSunColor.value.copy(atmo.sunColor);

      uniforms.uDeepColor.value.set(params.deepColor);
      uniforms.uShallowColor.value.set(params.shallowColor);
      uniforms.uCloudCover.value = params.cloudCover;
      uniforms.uCloudDarkness.value = params.cloudDarkness;
      uniforms.uFogDensity.value = params.fogDensity;
      uniforms.uRainIntensity.value = params.rainIntensity;
      uniforms.uFoamScale.value = params.foamScale;
      uniforms.uSssStrength.value = params.sssStrength;
      uniforms.uWindAngle.value = THREE.MathUtils.degToRad(params.windDirDeg);
      uniforms.uWindSpeed.value = params.windSpeed;
      uniforms.uLightningFlash.value = params.lightningFlash || 0.0;
      if (lightningPos) uniforms.uLightningPos.value.copy(lightningPos);

      if (tornadoState) {
        uniforms.uTornado.value.set(
          tornadoState.x,
          tornadoState.z,
          tornadoState.radius,
          tornadoState.strength
        );
      }

      if (shipState) {
        uniforms.uShipState.value.set(
          shipState.x,
          shipState.z,
          shipState.heading,
          shipState.speed
        );
      }

      uniforms.uDebugMode.value = params.debugMode || 0;
      material.wireframe = Boolean(params.wireframe);
    }
  };
}
