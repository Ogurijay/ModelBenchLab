// 天空：单次散射天空视图 LUT（Rayleigh + Mie + 臭氧，太阳变化时重算）
// + 逐像素太阳盘与两层程序化云。同一材质用于背景球与反射立方体贴图采集，
// 立方体贴图再经 PMREM 给浮体提供环境光。

import * as THREE from 'three';
import { ATMO, SUN_ILLUMINANCE, sunDirection, sunTransmittance } from './atmosphere.js';

const LUT_W = 256;
const LUT_H = 128;

const vec3 = (a) => `vec3(${a.map((v) => v.toExponential(6)).join(', ')})`;

const LUT_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform vec2 uRes;
out vec4 outColor;
const float PI = 3.14159265358979;
const float RG = ${ATMO.groundRadius.toFixed(1)};
const float RT = ${ATMO.topRadius.toFixed(1)};
const vec3 BR = ${vec3(ATMO.rayleigh)};
const float HR = ${ATMO.rayleighH.toFixed(1)};
const float BMS = ${ATMO.mieScatter.toExponential(6)};
const float BMA = ${ATMO.mieAbsorb.toExponential(6)};
const float HM = ${ATMO.mieH.toFixed(1)};
const float MG = ${ATMO.mieG.toFixed(3)};
const vec3 BO = ${vec3(ATMO.ozone)};
const float OC = ${ATMO.ozoneCenter.toFixed(1)};
const float OW = ${ATMO.ozoneWidth.toFixed(1)};

float raySphere(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float disc = b * b - c;
  if (disc < 0.0) return -1.0;
  float s = sqrt(disc);
  float t1 = -b - s;
  float t2 = -b + s;
  return t1 > 0.0 ? t1 : (t2 > 0.0 ? t2 : -1.0);
}

vec3 extinction(float h) {
  float r = exp(-h / HR);
  float m = exp(-h / HM);
  float o = max(0.0, 1.0 - abs(h - OC) / OW);
  return BR * r + vec3(BMS + BMA) * m + BO * o;
}

vec3 sunTransmittance(vec3 p) {
  if (raySphere(p, uSunDir, RG) > 0.0) return vec3(0.0);
  float tTop = raySphere(p, uSunDir, RT);
  const int STEPS = 12;
  float ds = tTop / float(STEPS);
  vec3 od = vec3(0.0);
  for (int i = 0; i < STEPS; i++) {
    vec3 q = p + uSunDir * (float(i) + 0.5) * ds;
    od += extinction(length(q) - RG) * ds;
  }
  return exp(-od);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float c = 2.0 * uv.y - 1.0;
  float l = sign(c) * c * c * 0.5 * PI;
  float az = (uv.x - 0.5) * 2.0 * PI;
  vec3 d = vec3(cos(l) * cos(az), sin(l), cos(l) * sin(az));
  vec3 o = vec3(0.0, RG + ${ATMO.viewHeight.toFixed(1)}, 0.0);
  float tMax = raySphere(o, d, RT);
  float tG = raySphere(o, d, RG);
  if (tG > 0.0) tMax = tG;
  tMax = min(tMax, 400000.0);
  float mu = dot(d, uSunDir);
  float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g2 = MG * MG;
  float phM = 3.0 / (8.0 * PI) * (1.0 - g2) * (1.0 + mu * mu) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * MG * mu, 1.5));
  const int STEPS = 40;
  vec3 L = vec3(0.0);
  vec3 T = vec3(1.0);
  float prevT = 0.0;
  for (int i = 0; i < STEPS; i++) {
    // 二次分布：近处采样更密
    float f = (float(i) + 0.5) / float(STEPS);
    float t = tMax * f * f;
    float ds = t - prevT;
    prevT = t;
    vec3 p = o + d * t;
    float h = length(p) - RG;
    vec3 ext = extinction(h);
    vec3 scR = BR * exp(-h / HR);
    float scM = BMS * exp(-h / HM);
    vec3 Ts = sunTransmittance(p);
    // 粗略多次散射补偿：各向同性项
    vec3 S = (scR * phR + scM * phM) * Ts + (scR + scM) * 0.012 * (0.2 + 0.8 * clamp(uSunDir.y * 4.0 + 0.3, 0.0, 1.0));
    vec3 Tstep = exp(-ext * ds);
    L += T * S * (1.0 - Tstep) / max(ext, vec3(1e-9));
    T *= Tstep;
  }
  outColor = vec4(L, 1.0);
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_COMMON = /* glsl */ `
uniform sampler2D uSkyLUT;
uniform float uSunIllum;
vec2 skyUV(vec3 d) {
  float l = asin(clamp(d.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(l) * sqrt(abs(l) / 1.5707963);
  float u = atan(d.z, d.x) / 6.2831853 + 0.5;
  return vec2(u, v);
}
vec3 skyRadiance(vec3 d) {
  return texture2D(uSkyLUT, skyUV(d)).rgb * uSunIllum;
}
`;

const SKY_FRAG = /* glsl */ `
${SKY_COMMON}
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uShowSun;
uniform float uCoverage;
uniform float uStorm;
uniform vec2 uCloudOffset;
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 6; i++) {
    s += a * noise(p);
    p = rot * p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 d = normalize(vDir);
  vec3 dh = vec3(d.x, max(d.y, 0.0), d.z);
  vec3 sky = skyRadiance(normalize(dh));
  float mu = dot(d, uSunDir);

  // 云层（1.6 km 高的薄层，平面投影）
  float cloud = 0.0;
  vec3 cloudCol = vec3(0.0);
  if (d.y > 0.0 && uCoverage > 0.001) {
    float t = 1600.0 / max(d.y, 0.02);
    vec2 p = d.xz * t * 0.00042 + uCloudOffset;
    float n = fbm(p);
    float n2 = fbm(p * 2.7 + 5.3 + uCloudOffset * 0.6);
    float shape = n * 0.75 + n2 * 0.25;
    float th = 1.0 - uCoverage;
    float dens = smoothstep(th - 0.08, th + 0.28, shape);
    float toward = fbm(p + uSunDir.xz * 0.12);
    float selfShadow = clamp(0.5 + (shape - toward) * 3.0, 0.0, 1.0);
    float hg = (1.0 - 0.36) / pow(1.0 + 0.36 - 1.2 * mu, 1.5) / 12.566;
    vec3 ambient = skyRadiance(vec3(0.0, 1.0, 0.0)) * 1.6 + skyRadiance(normalize(vec3(d.x, 0.05, d.z))) * 0.6;
    vec3 lit = uSunColor * (0.05 + 0.9 * hg) * mix(0.25, 1.0, selfShadow);
    cloudCol = lit + ambient * mix(0.55, 1.0, selfShadow);
    cloudCol *= mix(1.0, 0.32, uStorm * dens);
    // 远处云被大气淡化
    float aerial = exp(-t / 45000.0);
    cloud = dens * smoothstep(0.0, 0.14, d.y) * mix(0.15, 1.0, aerial);
    cloudCol = mix(sky, cloudCol, aerial);
  }

  // 太阳盘与日晕
  float disk = smoothstep(0.99996, 0.999985, mu);
  float limb = sqrt(max(0.0, 1.0 - (1.0 - mu) / 1.5e-5));
  vec3 sun = uSunColor * disk * (0.6 + 0.4 * limb) * 400.0 * uShowSun;
  sun += uSunColor * pow(max(mu, 0.0), 900.0) * 0.6 * uShowSun;

  vec3 col = sky + sun * (1.0 - cloud);
  col = mix(col, cloudCol, cloud);
  // 地平线以下（仅在高空时可见）：压暗的地平线色
  if (d.y < 0.0) col = mix(col, skyRadiance(normalize(vec3(d.x, 0.0, d.z))) * 0.55, smoothstep(0.0, -0.02, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class Sky {
  constructor(renderer, { cubeSize = 256 } = {}) {
    this.renderer = renderer;
    this.params = { elevation: 14, azimuth: 205, coverage: 0.42, storm: 0, cloudSpeed: 1 };

    this.lutTarget = new THREE.WebGLRenderTarget(LUT_W, LUT_H, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      generateMipmaps: false
    });
    this.lutTarget.texture.wrapS = THREE.RepeatWrapping;
    this.lutMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: 'precision highp float;\nin vec3 position;\nvoid main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: LUT_FRAG,
      uniforms: { uSunDir: { value: new THREE.Vector3() }, uRes: { value: new THREE.Vector2(LUT_W, LUT_H) } },
      depthTest: false,
      depthWrite: false
    });
    this.lutScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lutMat);
    quad.frustumCulled = false;
    this.lutScene.add(quad);
    this.lutCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.sunDir = new THREE.Vector3();
    this.sunColor = new THREE.Color(); // 透射后的太阳照度（含云遮挡）
    this.uniforms = {
      uSkyLUT: { value: this.lutTarget.texture },
      uSunIllum: { value: SUN_ILLUMINANCE },
      uSunDir: { value: this.sunDir },
      uSunColor: { value: new THREE.Color() },
      uShowSun: { value: 1 },
      uCoverage: { value: this.params.coverage },
      uStorm: { value: 0 },
      uCloudOffset: { value: new THREE.Vector2(3.7, 1.2) },
      uTime: { value: 0 }
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.material);
    this.mesh.scale.setScalar(1000);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;

    // 反射用立方体贴图：不画太阳盘（太阳高光由水面 GGX 单独计算）
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(cubeSize, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter
    });
    this.cubeScene = new THREE.Scene();
    this.cubeMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { ...this.uniforms, uShowSun: { value: 0 } },
      side: THREE.BackSide,
      depthWrite: false
    });
    const cubeMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.cubeMaterial);
    cubeMesh.scale.setScalar(50);
    cubeMesh.frustumCulled = false;
    this.cubeScene.add(cubeMesh);
    this.cubeCamera = new THREE.CubeCamera(0.1, 200, this.cubeTarget);
    this.cubeMaxLod = Math.log2(cubeSize);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
    this.envDirty = true;
    this.envTimer = 0;
    this.cubeTimer = 0;
    this.lutDirty = true;
    this.apply();
  }

  set(partial) {
    const prevSun = this.params.elevation + ',' + this.params.azimuth;
    Object.assign(this.params, partial);
    if (prevSun !== this.params.elevation + ',' + this.params.azimuth) this.lutDirty = true;
    this.apply();
  }

  // 太阳被云遮挡的比例（影响直射光、水面高光与太阳盘）
  get sunVisibility() {
    const c = this.params.coverage;
    const s = this.params.storm;
    return Math.max(0.04, 1 - Math.min(1, Math.max(0, (c - 0.5) / 0.45)) * 0.85) * (1 - s * 0.6);
  }

  apply() {
    const [x, y, z] = sunDirection(this.params.elevation, this.params.azimuth);
    this.sunDir.set(x, y, z);
    const T = sunTransmittance([x, y, z]);
    // 太阳刚落下时保留微弱余晖，避免直射光突变为 0
    const fade = Math.min(1, Math.max(0, (this.params.elevation + 1.2) / 1.2));
    const vis = this.sunVisibility;
    this.sunColor.setRGB(T[0], T[1], T[2]).multiplyScalar(SUN_ILLUMINANCE * vis * fade);
    this.uniforms.uSunColor.value.setRGB(T[0], T[1], T[2]).multiplyScalar(SUN_ILLUMINANCE * fade * (0.25 + 0.75 * vis));
    this.uniforms.uCoverage.value = this.params.coverage;
    this.uniforms.uStorm.value = this.params.storm;
    // 阴天整体压暗天空亮度
    this.uniforms.uSunIllum.value = SUN_ILLUMINANCE * (1 - this.params.storm * 0.55) * (1 - Math.max(0, this.params.coverage - 0.6) * 0.5);
    this.envDirty = true;
  }

  renderLUT() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    this.lutMat.uniforms.uSunDir.value.copy(this.sunDir);
    r.setRenderTarget(this.lutTarget);
    r.render(this.lutScene, this.lutCamera);
    r.setRenderTarget(prev);
    this.lutDirty = false;
  }

  update(dt, camera, windDirDeg, windSpeed) {
    // 云随风缓慢漂移
    const a = (windDirDeg * Math.PI) / 180;
    const speed = (0.004 + windSpeed * 0.0009) * this.params.cloudSpeed;
    this.uniforms.uCloudOffset.value.x += Math.cos(a) * speed * dt;
    this.uniforms.uCloudOffset.value.y += Math.sin(a) * speed * dt;
    this.uniforms.uTime.value += dt;
    this.mesh.position.copy(camera.position);

    if (this.lutDirty) this.renderLUT();
    this.cubeTimer -= dt;
    if (this.cubeTimer <= 0 || this.envDirty) {
      this.cubeCamera.update(this.renderer, this.cubeScene);
      this.cubeTimer = 0.25;
    }
    this.envTimer -= dt;
    if (this.envDirty && this.envTimer <= 0) {
      const next = this.pmrem.fromCubemap(this.cubeTarget.texture);
      if (this.envTarget) this.envTarget.dispose();
      this.envTarget = next;
      this.envDirty = false;
      this.envTimer = 0.4;
    }
  }

  get envMap() {
    return this.envTarget ? this.envTarget.texture : null;
  }
}
