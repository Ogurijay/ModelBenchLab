// 全屏双阶段 HDR 三维体积光线步进合成管线 (FireComposite)
//
// 阶段 1：将三维场景（玄武岩祭坛、铁火盆笼、木柴炭床、铜鼎、火星粒子）渲染至
//         HalfFloat 线性 HDR RenderTarget + Float 深度纹理。
// 阶段 2：全屏三角形合成着色器：
//         - 由逆投影与相机世界矩阵重建世界视线方向 (ro, rd)；
//         - 与三维火焰/烟羽包围盒求交，并用场景线性深度精确截断步进终点 tExit，
//           使火盆铁骨、木柴、吊链与石柱对三维火焰产生真实前后穿插遮挡；
//         - 沿视线执行 MARCH_STEPS 步发射-吸收积分：
//           * 3 股螺旋纠缠火柱 + 双级域扭曲(Domain Warping) + 元胞侵蚀分叉，
//             保证 360° 任意水平观察角度均呈现立体凹凸火舌与收尖断焰；
//           * 径向与轴向连续温度场精确刻画【高温核心 / 明亮主焰 / 橙红外焰】三层结构；
//           * 火焰上方同场积分受风剪切的体积烟羽，烟底承接火光暖橙内散射，烟顶受冷月光勾边；
//         - 背景采样 UV 按视线距热流轴最近距离施加上升热浪折射扭曲；
//         - 统一 ACES Filmic 色调映射 + 自然暗角 + sRGB 输出。

import * as THREE from 'three';
import { GLSL_NOISE_AND_COLOR } from './shaders/chunks.js';

const BOX_MIN = new THREE.Vector3(-2.05, 0.01, -2.05);
const BOX_MAX = new THREE.Vector3(2.05, 3.85, 2.05);

const VERTEX_SHADER = /* glsl */ `
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
out vec2 vUv;
out vec3 vRayDir;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  vec4 clipFar = uProjInv * vec4(position.xy, 1.0, 1.0);
  clipFar /= clipFar.w;
  vRayDir = (uCamWorld * vec4(clipFar.xyz, 0.0)).xyz;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

in vec2 vUv;
in vec3 vRayDir;
out vec4 outColor;

uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uIntensity;
uniform float uTurb;
uniform vec2 uWind;
uniform float uFlicker;
uniform float uStokeBoost;
uniform int uSpectrum;

const vec3 BMIN = vec3(${BOX_MIN.x.toFixed(2)}, ${BOX_MIN.y.toFixed(2)}, ${BOX_MIN.z.toFixed(2)});
const vec3 BMAX = vec3(${BOX_MAX.x.toFixed(2)}, ${BOX_MAX.y.toFixed(2)}, ${BOX_MAX.z.toFixed(2)});
const vec3 FIRE_ORIGIN = vec3(0.0, 0.14, 0.0);

${GLSL_NOISE_AND_COLOR}

// 射线与 AABB 包围盒求交，返回 (tEnter, tExit)
vec2 intersectBox(vec3 ro, vec3 rd) {
  vec3 signRd = step(vec3(0.0), rd) * 2.0 - 1.0;
  vec3 invRd = 1.0 / (signRd * max(abs(rd), vec3(1e-6)));
  vec3 t0 = (BMIN - ro) * invRd;
  vec3 t1 = (BMAX - ro) * invRd;
  vec3 tmin = min(t0, t1);
  vec3 tmax = max(t0, t1);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

// 从非线性深度缓冲还原相机到场景表面的世界距离
float getLinearSceneDistance(vec2 uv) {
  float depthSample = texture(tDepth, uv).r;
  vec4 viewPos = uProjInv * vec4(uv * 2.0 - 1.0, depthSample * 2.0 - 1.0, 1.0);
  return length(viewPos.xyz / viewPos.w);
}

// 采样三维体积密度场：返回 vec4(fireDensity, temperature, smokeDensity, premixBlue)
vec4 sampleVolumetricField(vec3 worldPos, float effIntensity) {
  vec3 p = worldPos - FIRE_ORIGIN;

  // 包围盒水平边界柔化，防止强风下烟羽在盒壁被硬切
  float boxFade = smoothstep(0.0, 0.42, min(2.05 - abs(worldPos.x), 2.05 - abs(worldPos.z)));
  if (boxFade <= 0.001) return vec4(0.0);

  // 风剪切偏移：火焰下部受浮力主导适度倾斜，上部火尖与烟羽顺风偏转并伴随风剪切撕裂
  float heightClamped = clamp(p.y, 0.0, 3.6);
  float windShear = pow(heightClamped, 1.32);
  p.xz -= uWind * windShear * (0.34 + 0.42 * smoothstep(0.65, 2.2, p.y));

  // 名义火焰高度随火势与添柴鼓风动态伸缩（强风会压低并吹散火舌高度）
  float windMag = length(uWind);
  float flameHeight = (1.18 * pow(effIntensity, 0.54)) / (1.0 + windMag * 0.22);
  float hNorm = p.y / max(flameHeight, 0.25);

  // 热对流上升流场坐标 + 螺旋涡量旋转
  float swirlAngle = p.y * (0.85 + 0.35 * uTurb) - uTime * 1.65;
  float cs = cos(swirlAngle * 0.35);
  float sn = sin(swirlAngle * 0.35);
  vec2 swirledXZ = mat2(cs, -sn, sn, cs) * p.xz;

  vec3 flowCoord = vec3(swirledXZ.x * 1.62, p.y * 0.90 - uTime * 2.05, swirledXZ.y * 1.62);

  // 一级与二级域扭曲 (Domain Warping)：制造卷曲、分叉与翻滚火舌
  float w1x = fbm2(flowCoord * 1.9);
  float w1z = fbm2(flowCoord * 1.9 + vec3(6.1, 11.3, 2.9));
  float w1y = fbm2(flowCoord * 1.7 + vec3(14.2, 3.7, 8.4));

  float warpAmp = (0.45 + 0.75 * uTurb + 0.35 * windMag) * (0.14 + 0.56 * clamp(hNorm, 0.0, 1.35));
  vec2 warpXZ = (vec2(w1x, w1z) - 0.5) * warpAmp;
  vec2 qXZ = p.xz + warpXZ;

  // 三股交织主火舌 + 中央火心包络，确保环绕 360° 每个角度都有立体层次与分叉沟壑
  float baseRadius = (0.33 + 0.13 * effIntensity)
                   * (1.0 - 0.66 * clamp(hNorm, 0.0, 1.05))
                   * smoothstep(-0.08, 0.07, p.y);
  float rMain = length(qXZ);

  // 三股螺旋副火舌偏心距离
  float lobePhase = p.y * 2.75 - uTime * 3.35;
  vec2 lobe1 = qXZ - 0.115 * vec2(cos(lobePhase), sin(lobePhase)) * clamp(hNorm, 0.1, 1.0);
  vec2 lobe2 = qXZ - 0.115 * vec2(cos(lobePhase + 2.094), sin(lobePhase + 2.094)) * clamp(hNorm, 0.1, 1.0);
  vec2 lobe3 = qXZ - 0.115 * vec2(cos(lobePhase + 4.188), sin(lobePhase + 4.188)) * clamp(hNorm, 0.1, 1.0);
  float rLobes = min(min(length(lobe1), length(lobe2)), length(lobe3));
  float rEffective = mix(rMain, rLobes, 0.48);

  float fireDensity = 0.0;
  float temperature = 0.0;
  float premixBlue = 0.0;

  float shell = 1.0 - rEffective / max(baseRadius, 1e-3);
  if (shell > -0.62 && hNorm < 1.46 && p.y > -0.05) {
    vec3 detailPos = vec3(qXZ.x * 3.25, flowCoord.y * 1.42 + (w1y - 0.5) * 0.52, qXZ.y * 3.25);
    float fineNoise = fbm3(detailPos);
    float erosion = flameCellularErosion(detailPos * 0.90);

    // 组合包络、分形湍流与元胞撕裂，顶部形成断续跃动的分离火舌
    float turbGain = 1.18 + 0.52 * uTurb;
    float windErode = windMag * 0.28 * smoothstep(0.45, 1.25, hNorm);
    float rawFire = shell * 1.58 + (fineNoise - 0.49) * turbGain - (1.0 - erosion) * (0.28 + 0.32 * clamp(hNorm, 0.25, 1.2)) - windErode;
    fireDensity = clamp(rawFire, 0.0, 1.0);
    fireDensity *= smoothstep(1.42, 0.78, hNorm);   // 顶部收尖与断焰消散
    fireDensity *= smoothstep(-0.05, 0.09, p.y);    // 底部自炭床自然升起

    // 连续温度场 T ∈ [0, 1]：高温白炽核心集中在下部中心，中层为明亮金黄主焰，外层与火舌尖为橙红外焰
    float radialCore = smoothstep(0.0, 0.88, shell);
    float verticalCool = 1.0 - 0.52 * clamp(hNorm, 0.0, 1.15);
    temperature = fireDensity * verticalCool * (0.38 + 0.68 * pow(radialCore, 1.25));
    temperature = clamp(temperature * 1.26, 0.0, 1.0);

    // 底部挥发分富氧预混层微蓝发光掩码
    premixBlue = fireDensity * smoothstep(0.32, 0.02, p.y) * smoothstep(0.15, 0.65, shell);
  }

  // 伴随体积烟羽：从火尖上方生发，受更强的风力与湍流扩散
  float smokeDensity = 0.0;
  if (p.y > flameHeight * 0.64) {
    vec3 smokeCoord = vec3(p.x, p.y - uTime * 0.92, p.z) * 1.02;
    smokeCoord.xz += warpXZ * 1.72;
    float smokeNoise = fbm2(smokeCoord + vec3(4.3, 0.0, 9.7));
    float plumeRadius = 0.28 + 0.42 * clamp((p.y - flameHeight * 0.75) * 0.58, 0.0, 1.4);
    float smokeShell = 1.0 - length(qXZ) / plumeRadius;
    smokeDensity = clamp(smokeShell * 1.06 + (smokeNoise - 0.51) * 1.28, 0.0, 1.0);
    smokeDensity *= smoothstep(flameHeight * 0.66, flameHeight * 1.22, p.y);
    smokeDensity *= smoothstep(3.75, 2.25, p.y);
    smokeDensity *= 0.58 * clamp(0.65 + 0.35 * effIntensity, 0.5, 1.3);
  }

  return vec4(fireDensity, temperature, smokeDensity, premixBlue) * boxFade;
}

void main() {
  vec3 ro = uCamPos;
  vec3 rd = normalize(vRayDir);
  float sDist = getLinearSceneDistance(vUv);

  float effIntensity = uIntensity + uStokeBoost * 0.55;

  // ---- 1. 热浪背景折射：按视线距火焰主轴最近距离扭曲背景场景 UV ----
  vec2 roXZ = ro.xz - FIRE_ORIGIN.xz;
  vec2 rdXZ = rd.xz;
  float tClosest = clamp(-dot(roXZ, rdXZ) / max(dot(rdXZ, rdXZ), 1e-5), 0.0, 100.0);
  float distToAxis = length(roXZ + rdXZ * tClosest);
  float heightAtAxis = ro.y + rd.y * tClosest;
  float heatMask = exp(-distToAxis * 2.35)
                 * smoothstep(0.08, 0.75, heightAtAxis)
                 * smoothstep(3.9, 1.25, heightAtAxis);
  // 若前景几何遮挡在火焰轴前方，则不对其施加背景热浪扭曲
  heatMask *= step(tClosest, sDist + 0.38);

  vec2 refractOffset = vec2(
    fbm2(vec3(vUv * 9.5, uTime * 2.1)) - 0.5,
    fbm2(vec3(vUv * 9.5 + 5.1, uTime * 2.1 + 3.4)) - 0.5
  );
  vec2 refractedUv = clamp(
    vUv + refractOffset * heatMask * 0.0115 * (0.45 + 0.85 * effIntensity),
    vec2(0.001),
    vec2(0.999)
  );

  // ---- 2. 体积光线步进 (Ray Marching)：盒求交 + 深度缓冲截断 ----
  vec2 boxSpan = intersectBox(ro, rd);
  float tStart = max(boxSpan.x, 0.0);
  float tEnd = min(boxSpan.y, sDist);

  vec3 accumRadiance = vec3(0.0);
  float transmittance = 1.0;

  if (tEnd > tStart) {
    float stepSize = (tEnd - tStart) / float(MARCH_STEPS);
    float jitter = ign(gl_FragCoord.xy, fract(uTime * 0.37));
    float flameHeight = 1.24 * pow(effIntensity, 0.58);

    for (int i = 0; i < MARCH_STEPS; i++) {
      float t = tStart + (float(i) + jitter) * stepSize;
      vec3 wp = ro + rd * t;
      vec4 sampleVal = sampleVolumetricField(wp, effIntensity);

      float fireD = sampleVal.x;
      float temp  = sampleVal.y;
      float smokeD = sampleVal.z;
      float blueM = sampleVal.w;

      float sigmaExt = fireD * 7.8 + smokeD * 2.75;
      if (sigmaExt > 1e-4) {
        // 火焰自发光 + 烟羽底部受火光各向异性内散射 + 烟顶冷月微光
        vec3 fireRadiance = evaluateFireSpectrum(temp, blueM, uSpectrum) * (fireD * 10.6 * uFlicker);
        float bottomGlow = exp(-max(wp.y - flameHeight * 0.92, 0.0) * 1.85);
        vec3 smokeUnderlight = evaluateFireSpectrum(0.48, 0.0, uSpectrum) * (0.95 * bottomGlow * uFlicker);
        vec3 smokeAmbient = vec3(0.028, 0.032, 0.042);
        vec3 totalEmit = fireRadiance + (smokeAmbient + smokeUnderlight) * (smokeD * 0.62);

        float stepAlpha = 1.0 - exp(-sigmaExt * stepSize);
        accumRadiance += transmittance * (totalEmit / max(sigmaExt, 1e-4)) * stepAlpha;
        transmittance *= 1.0 - stepAlpha;

        if (transmittance < 0.005) break;
      }
    }
  }

  // ---- 3. 合成背景 HDR 场景、体积透射与发射，执行 ACES + 暗角 + sRGB ----
  vec3 sceneHdr = texture(tScene, refractedUv).rgb;
  vec3 combinedHdr = sceneHdr * transmittance + accumRadiance;

  vec3 mapped = acesTonemap(combinedHdr);
  float vignette = 1.0 - 0.32 * pow(length(vUv - 0.5) * 1.15, 2.5);
  mapped *= vignette;

  outColor = vec4(linearToSRGB(mapped), 1.0);
}
`;

export class FireComposite {
  constructor(renderer) {
    this.renderer = renderer;

    const depthTexture = new THREE.DepthTexture(2, 2, THREE.FloatType);
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthTexture,
      depthBuffer: true,
    });

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      defines: { MARCH_STEPS: 68 },
      uniforms: {
        tScene:       { value: this.rt.texture },
        tDepth:       { value: depthTexture },
        uProjInv:     { value: new THREE.Matrix4() },
        uCamWorld:    { value: new THREE.Matrix4() },
        uCamPos:      { value: new THREE.Vector3() },
        uTime:        { value: 0 },
        uIntensity:   { value: 1.05 },
        uTurb:        { value: 1.0 },
        uWind:        { value: new THREE.Vector2() },
        uFlicker:     { value: 1.0 },
        uStokeBoost:  { value: 0.0 },
        uSpectrum:    { value: 0 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
    });

    const fsTriGeo = new THREE.BufferGeometry();
    fsTriGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
    );
    const fsTriMesh = new THREE.Mesh(fsTriGeo, this.material);
    fsTriMesh.frustumCulled = false;

    this.compositeScene = new THREE.Scene();
    this.compositeScene.add(fsTriMesh);
    this.compositeCamera = new THREE.Camera();

    this.lastRenderStats = { calls: 0, triangles: 0, points: 0 };
  }

  /** 动态切换光线步进采样数（低 32 / 中 48 / 高 68 / 极 104 单调递增） */
  setSteps(steps) {
    const n = Math.max(16, Math.floor(steps));
    if (this.material.defines.MARCH_STEPS === n) return;
    this.material.defines.MARCH_STEPS = n;
    this.material.needsUpdate = true;
  }

  get steps() {
    return this.material.defines.MARCH_STEPS;
  }

  setSize(width, height) {
    this.rt.setSize(Math.max(2, width), Math.max(2, height));
  }

  update(camera, time, { intensity, turbulence, wind, flicker, stokeBoost = 0, spectrum = 0 }) {
    // 强制同步相机世界矩阵，保证 setView 后立刻单帧截图时视线与深度完全对齐
    camera.updateMatrixWorld();
    const u = this.material.uniforms;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uTime.value = time;
    u.uIntensity.value = intensity;
    u.uTurb.value = turbulence;
    u.uWind.value.set(wind[0], wind[1]);
    u.uFlicker.value = flicker;
    u.uStokeBoost.value = stokeBoost;
    u.uSpectrum.value = spectrum;
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    const sceneCalls = r.info.render.calls;
    const sceneTris = r.info.render.triangles;
    const scenePts = r.info.render.points;
    r.setRenderTarget(null);
    r.render(this.compositeScene, this.compositeCamera);
    this.lastRenderStats = {
      calls: sceneCalls + r.info.render.calls,
      triangles: sceneTris + r.info.render.triangles,
      points: scenePts + r.info.render.points,
    };
  }
}
