// 体积火焰合成 pass(项目核心)。
//
// 管线:场景先渲染进 HDR RenderTarget(HalfFloat 颜色 + Float 深度),
// 再画一个全屏三角,在片元里沿视线对三维密度场做真·光线步进(ray marching):
//   - 逐像素与体积包围盒求交,并用场景深度截断步进区间 → 火焰被柴堆/石头正确遮挡;
//   - 密度场 = 收尖轮廓 × 域扭曲(domain warping)FBM,火焰与烟羽同场积分;
//   - Interleaved Gradient Noise 抖动起点消分层带;透射率 < 0.6% 提前终止;
//   - 火焰属发射介质:发射-吸收模型累积,HDR 直出,ACES 收,手动 sRGB;
//   - 顺带按"视线到火焰轴距离"计算热浪权重,扭曲背景 UV(热空气折射)。
// 步进数由质量档以 #define MARCH_STEPS 注入(单调递增),切档重编译一次。

import * as THREE from 'three';
import { GLSL_NOISE, GLSL_TONEMAP } from './shaders/chunks.js';

// 体积包围盒与火焰基座(世界坐标,和柴堆位置对齐)
const BOX_MIN = new THREE.Vector3(-1.9, 0.02, -1.9);
const BOX_MAX = new THREE.Vector3(1.9, 3.5, 1.9);

const VERT = /* glsl */ `
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
out vec2 vUv;
out vec3 vRay;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  // 由 NDC 远平面点重建世界空间视线方向(片元内再归一化)
  vec4 v = uProjInv * vec4(position.xy, 1.0, 1.0);
  v /= v.w;
  vRay = (uCamWorld * vec4(v.xyz, 0.0)).xyz;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
in vec3 vRay;
out vec4 outColor;

uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uIntensity;   // 火势
uniform float uTurb;        // 湍流
uniform vec2 uWind;         // 风向量(XZ,含风力)
uniform float uFlicker;     // CPU 火光呼吸值(与点光源同源,焰体亮度同步波动)

const vec3 BMIN = vec3(${BOX_MIN.x}, ${BOX_MIN.y}, ${BOX_MIN.z});
const vec3 BMAX = vec3(${BOX_MAX.x}, ${BOX_MAX.y}, ${BOX_MAX.z});
const vec3 FIRE_POS = vec3(0.0, 0.12, 0.0);

${GLSL_NOISE}
${GLSL_TONEMAP}

// 视线与轴对齐包围盒求交,返回 (tEnter, tExit)
vec2 boxHit(vec3 ro, vec3 rd) {
  vec3 srd = step(vec3(0.0), rd) * 2.0 - 1.0;
  vec3 ird = 1.0 / (srd * max(abs(rd), vec3(1e-6)));
  vec3 t1 = (BMIN - ro) * ird;
  vec3 t2 = (BMAX - ro) * ird;
  vec3 tmin = min(t1, t2);
  vec3 tmax = max(t1, t2);
  return vec2(max(max(tmin.x, tmin.y), tmin.z), min(min(tmax.x, tmax.y), tmax.z));
}

// 深度缓冲 → 相机到场景点的沿视线距离
float sceneDist(vec2 uv) {
  float d = texture(tDepth, uv).r;
  vec4 c = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return length(c.xyz / c.w);
}

// 温度 → 发射色(HDR):暗红 → 橙红外焰 → 金黄主焰 → 白热核心
vec3 fireColor(float T) {
  vec3 c = mix(vec3(0.45, 0.035, 0.002), vec3(1.65, 0.31, 0.02), smoothstep(0.06, 0.46, T));
  c = mix(c, vec3(3.3, 1.42, 0.20), smoothstep(0.46, 0.78, T));
  c = mix(c, vec3(4.8, 3.7, 2.5), smoothstep(0.82, 0.98, T));
  return c;
}

// 三维密度场:返回 (火焰密度, 温度, 烟密度)。
// 域扭曲让火舌自然卷曲分叉;风以高度幂次剪切采样空间,火焰倾斜、烟羽更甚。
vec3 fieldSample(vec3 wp) {
  vec3 p = wp - FIRE_POS;

  // 盒壁软化,避免大风时烟在包围盒边缘被硬切
  float edge = smoothstep(0.0, 0.4, min(1.9 - abs(wp.x), 1.9 - abs(wp.z)));

  // 风剪切:偏移随高度非线性增大,烟区响应更强
  float bend = pow(clamp(p.y, 0.0, 2.4), 1.6);
  p.xz -= uWind * bend * (0.55 + 0.55 * smoothstep(0.8, 1.8, p.y));

  float H = 1.18 * pow(uIntensity, 0.55); // 火焰名义高度
  float h = p.y / H;

  // 上升流动坐标(y 随时间下移 = 场向上流)+ 双通道域扭曲
  vec3 s = vec3(p.x * 1.6, p.y * 0.85 - uTime * 1.75, p.z * 1.6);
  float w1 = fbm2(s * 1.9);
  float w2 = fbm2(s * 1.9 + vec3(5.2, 8.3, 1.7));
  vec2 warp = (vec2(w1, w2) - 0.5) * uTurb * (0.18 + 0.62 * clamp(h, 0.0, 1.3));
  vec2 xz = p.xz + warp;

  // 火焰:收尖轮廓 + 细节 FBM
  float fire = 0.0;
  float temp = 0.0;
  float r = length(xz);
  float radius = (0.33 + 0.14 * uIntensity) * (1.0 - 0.62 * clamp(h, 0.0, 1.0))
               * smoothstep(-0.10, 0.06, p.y);
  float shell = 1.0 - r / max(radius, 1e-3);
  if (shell > -0.6 && h < 1.45 && p.y > -0.05) {
    float n = fbm3(vec3(xz.x * 3.0, s.y * 1.35, xz.y * 3.0));
    fire = clamp(shell * 1.7 + (n - 0.5) * (1.15 + 0.45 * uTurb), 0.0, 1.0);
    fire *= smoothstep(1.42, 0.88, h);     // 顶部撕裂收尖
    fire *= smoothstep(-0.05, 0.1, p.y);   // 底部从柴堆淡入
    temp = fire * (1.0 - 0.38 * clamp(h, 0.0, 1.0));
    temp *= 0.60 + 0.55 * clamp(shell, 0.0, 1.0); // 径向:核心白热,外缘转红
    temp = clamp(temp * 1.4, 0.0, 1.0);
  }

  // 烟羽:火顶以上,大尺度慢速噪声,顶部散逸;保持稀薄半透明
  float smoke = 0.0;
  if (p.y > H * 0.7) {
    vec3 m = vec3(p.x, p.y - uTime * 0.9, p.z) * 1.05;
    m.xz += warp * 1.6;
    float sn = fbm2(m + vec3(3.7, 0.0, 9.1));
    float col = 1.0 - r / (0.30 + 0.36 * clamp((p.y - H) * 0.55, 0.0, 1.2));
    smoke = clamp(col * 1.05 + (sn - 0.52) * 1.25, 0.0, 1.0);
    smoke *= smoothstep(H * 0.72, H * 1.25, p.y);
    smoke *= smoothstep(3.5, 2.1, p.y);
    smoke *= 0.55;
  }

  return vec3(fire, temp, smoke) * edge;
}

void main() {
  vec3 ro = uCamPos;
  vec3 rd = normalize(vRay);
  float sDist = sceneDist(vUv);

  // ---- 热浪折射:按视线到火焰竖直轴的最近距离估算热羽权重,扭曲背景采样 UV
  vec2 ro2 = ro.xz - FIRE_POS.xz;
  vec2 rd2 = rd.xz;
  float tAxis = clamp(-dot(ro2, rd2) / max(dot(rd2, rd2), 1e-5), 0.0, 100.0);
  float dAxis = length(ro2 + rd2 * tAxis);
  float hAxis = ro.y + rd.y * tAxis;
  float heat = exp(-dAxis * 2.4) * smoothstep(0.1, 0.8, hAxis) * smoothstep(3.9, 1.3, hAxis);
  heat *= step(tAxis, sDist + 0.4); // 前景物体挡在热羽之前则不扭曲
  vec2 duv = vec2(
    fbm2(vec3(vUv * 9.0, uTime * 1.9)) - 0.5,
    fbm2(vec3(vUv * 9.0 + 4.7, uTime * 1.9 + 2.3)) - 0.5
  );
  vec2 uvD = clamp(vUv + duv * heat * 0.012 * (0.5 + 0.9 * uIntensity),
                   vec2(0.001), vec2(0.999));

  // ---- 体积光线步进:包围盒求交 + 场景深度截断
  vec2 hit = boxHit(ro, rd);
  float t0 = max(hit.x, 0.0);
  float t1 = min(hit.y, sDist);
  vec3 vol = vec3(0.0);
  float trans = 1.0;
  if (t1 > t0) {
    float stepLen = (t1 - t0) / float(MARCH_STEPS);
    float jitter = ign(gl_FragCoord.xy);
    float H = 1.18 * pow(uIntensity, 0.55);
    for (int i = 0; i < MARCH_STEPS; i++) {
      float t = t0 + (float(i) + jitter) * stepLen;
      vec3 wp = ro + rd * t;
      vec3 f = fieldSample(wp);
      float sigma = f.x * 9.0 + f.z * 2.6;
      if (sigma > 1e-4) {
        // 发射:火焰按温度取色;烟自身近黑,底部承接火光染橙
        float glow = exp(-max(wp.y - H * 0.95, 0.0) * 1.9);
        vec3 emit = fireColor(f.y) * (f.x * 11.5 * uFlicker)
                  + (vec3(0.030, 0.027, 0.024) + vec3(1.9, 0.62, 0.10) * glow * uFlicker) * f.z * 0.55;
        float a = 1.0 - exp(-sigma * stepLen);
        vol += trans * (emit / max(sigma, 1e-4)) * a;
        trans *= 1.0 - a;
        if (trans < 0.006) break;
      }
    }
  }

  // ---- 合成:扭曲背景 × 体积透射 + 体积发射,ACES,暗角,sRGB
  vec3 scene = texture(tScene, uvD).rgb;
  vec3 col = scene * trans + vol;
  col = acesTonemap(col);
  float vig = 1.0 - 0.34 * pow(length(vUv - 0.5) * 1.16, 2.6);
  col *= vig;
  outColor = vec4(toSRGB(col), 1.0);
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
      defines: { MARCH_STEPS: 56 },
      uniforms: {
        tScene: { value: this.rt.texture },
        tDepth: { value: depthTexture },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uTurb: { value: 1 },
        uWind: { value: new THREE.Vector2() },
        uFlicker: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });

    // 全屏三角(比两三角 quad 少一条对角线接缝)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.frustumCulled = false;

    this.scene = new THREE.Scene();
    this.scene.add(mesh);
    this.camera = new THREE.Camera(); // 顶点直接输出 NDC,相机矩阵不参与
  }

  /** 质量档切换:重注入步进数并重编译(单调改变采样数)。 */
  setSteps(n) {
    if (this.material.defines.MARCH_STEPS === n) return;
    this.material.defines.MARCH_STEPS = n;
    this.material.needsUpdate = true;
  }

  get steps() { return this.material.defines.MARCH_STEPS; }

  setSize(w, h) {
    this.rt.setSize(w, h);
  }

  /** 每帧同步相机矩阵与模拟参数。 */
  update(camera, time, { intensity, turbulence, wind, flicker }) {
    // 相机矩阵通常由 renderer.render 懒更新;体积 ray 重建必须拿到本帧矩阵,
    // 否则 setView 后单帧步进(headless 取证)会用旧视角的 ray 对新深度做截断
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
  }

  /** 两段式渲染:场景 → HDR RT,再全屏合成到画布。 */
  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
