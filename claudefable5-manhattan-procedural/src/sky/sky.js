// 天穹:着色器渐变穹顶(太阳盘/月亮/程序化星空/云幕/闪电闪光),
// 太阳方位由真实公式驱动,平行光 + 半球光随时段与天气联动。
import * as THREE from 'three';
import { sunDirection } from '../core/solar.js';

const VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunCol;
uniform float uCloud;
uniform float uCloudDark;
uniform float uNight;
uniform float uHaze;
uniform float uFlash;
uniform float uTime;

float hash13(vec3 p) {
  p = fract(p * vec3(443.897, 441.423, 437.195));
  p += dot(p, p.yzx + 19.19);
  return fract((p.x + p.y) * p.z);
}

void main() {
  vec3 d = normalize(vDir);
  float t = pow(1.0 - max(d.y, 0.0), 3.0);
  vec3 col = mix(uZenith, uHorizon, t);

  vec3 sd = normalize(uSunDir);
  float sdd = dot(d, sd);
  float disc = smoothstep(0.99955, 0.99985, sdd);
  float glow = pow(max(sdd, 0.0), 22.0) * 0.42 + pow(max(sdd, 0.0), 300.0) * 1.1;
  col += uSunCol * (disc * 3.0 + glow) * (1.0 - uCloud * 0.85) * step(-0.06, sd.y);

  // 月亮:太阳反方向略偏移
  vec3 md = normalize(-sd + vec3(0.24, 0.2, 0.1));
  float mdd = dot(d, md);
  col += vec3(0.82, 0.88, 1.0) * smoothstep(0.99965, 0.99993, mdd) * uNight * (1.0 - uCloud * 0.9);
  col += vec3(0.5, 0.6, 0.8) * pow(max(mdd, 0.0), 160.0) * 0.18 * uNight * (1.0 - uCloud);

  // 星空(格点哈希 + 闪烁)
  if (d.y > 0.02) {
    vec3 cell = floor(d * 230.0);
    float star = step(0.9974, hash13(cell));
    float tw = 0.55 + 0.45 * sin(uTime * 2.2 + hash13(cell.zxy) * 41.0);
    col += vec3(0.85, 0.92, 1.0) * star * tw * uNight * (1.0 - uCloud) * smoothstep(0.02, 0.2, d.y);
  }

  // 云幕整体压灰
  col = mix(col, mix(uHorizon, vec3(uCloudDark), 0.6), uCloud * smoothstep(-0.05, 0.3, d.y) * 0.8);
  // 地平线雾霭
  col = mix(col, uHorizon, uHaze * pow(1.0 - max(d.y, 0.0), 3.0));
  // 闪电
  col += vec3(0.9, 0.95, 1.0) * uFlash;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// 简易渐变环境立方体(玻璃幕墙反射用)
function makeEnvCube() {
  const mk = (top, bottom) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    return cv;
  };
  const side = () => mk('#9dc2e6', '#4f5a64');
  const tex = new THREE.CubeTexture([side(), side(), mk('#7db4e6', '#8fbde8'), mk('#3c4046', '#33363b'), side(), side()]);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const C = (hex) => new THREE.Color(hex);
const PAL = {
  dayZen: C(0x3572cc), dayHor: C(0xcfe3f2),
  duskZen: C(0x3a4468), duskHor: C(0xff9e58),
  nightZen: C(0x05080f), nightHor: C(0x141d2c),
  daySun: C(0xfff2dd), duskSun: C(0xffb166), moon: C(0x93a7c8),
};

export function createSky(scene) {
  const uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() },
    uCloud: { value: 0 },
    uCloudDark: { value: 0.45 },
    uNight: { value: 0 },
    uHaze: { value: 0 },
    uFlash: { value: 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1650, 40, 20), mat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -580; sc.right = 580; sc.top = 700; sc.bottom = -760;
  sc.near = 80; sc.far = 2600;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.6;
  scene.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0x9db8d8, 0x33302c, 0.5);
  const ambient = new THREE.AmbientLight(0x404860, 0.1);
  scene.add(hemi, ambient);

  const fog = new THREE.FogExp2(0xcfe3f2, 0.0006);
  scene.fog = fog;

  const envMap = makeEnvCube();
  scene.environment = null; // 只给玻璃材质手动挂 envMap,避免全场景过亮

  const zen = new THREE.Color(), hor = new THREE.Color(), sunCol = new THREE.Color(), tmp = new THREE.Color();

  const state = { night: 0, sunH: 1, elevationDeg: 90, hours: 12 };

  return {
    dome, sun, hemi, ambient, envMap, uniforms, state,
    setFlash(v) { uniforms.uFlash.value = v; },
    update(hours, wx, camera, time) {
      const s = sunDirection(hours);
      const sunH = s.y;
      uniforms.uSunDir.value.set(s.x, s.y, s.z);
      uniforms.uTime.value = time;
      uniforms.uCloud.value = wx.cloud;
      uniforms.uCloudDark.value = wx.cloudDark;
      uniforms.uHaze.value = wx.haze;

      const dayF = THREE.MathUtils.smoothstep(sunH, -0.06, 0.3);
      const duskF = Math.exp(-(((sunH - 0.03) / 0.13) ** 2));
      const night = 1 - THREE.MathUtils.smoothstep(sunH, -0.14, 0.06);
      uniforms.uNight.value = night;

      zen.lerpColors(PAL.nightZen, PAL.dayZen, dayF);
      zen.lerp(PAL.duskZen, duskF * 0.55);
      hor.lerpColors(PAL.nightHor, PAL.dayHor, dayF);
      hor.lerp(PAL.duskHor, duskF * 0.85);
      // 阴天/暴风压灰:明度由 cloudDark 驱动(雷暴 0.3 → 铅灰压顶,雾/雪保持亮灰)
      const grayLevel = (0.22 + dayF * 0.78) * THREE.MathUtils.lerp(1.0, wx.cloudDark, THREE.MathUtils.smoothstep(wx.cloud, 0.25, 0.9));
      tmp.setRGB(grayLevel * 0.96, grayLevel, grayLevel * 1.08);
      zen.lerp(tmp, wx.cloud * 0.88);
      hor.lerp(tmp, wx.cloud * 0.78);
      uniforms.uZenith.value.copy(zen);
      uniforms.uHorizon.value.copy(hor);
      sunCol.lerpColors(PAL.duskSun, PAL.daySun, dayF);
      uniforms.uSunCol.value.copy(sunCol);

      // 雾与天空地平线一致
      scene.fog.color.copy(hor);
      scene.fog.density = wx.fog;

      // 光照:白天太阳 / 夜晚月亮共用一盏平行光
      const dim = wx.sunDim;
      if (sunH > -0.04) {
        sun.position.set(s.x, Math.max(s.y, 0.02), s.z).multiplyScalar(1000);
        sun.color.copy(sunCol);
        sun.intensity = 2.6 * THREE.MathUtils.smoothstep(sunH, -0.02, 0.18) * dim + 0.02;
      } else {
        const m = sunDirection(hours + 12);
        sun.position.set(m.x + 0.24, Math.max(m.y, 0.12) + 0.2, m.z + 0.1).multiplyScalar(1000);
        sun.color.copy(PAL.moon);
        sun.intensity = 0.28 * dim;
      }
      sun.target.position.set(0, 0, 0);

      hemi.color.copy(zen).lerp(hor, 0.4);
      hemi.groundColor.set(0x35302a).lerp(hor, night * 0.1);
      hemi.intensity = 0.24 + dayF * 0.46 * (1 - wx.cloud * 0.3) + wx.cloud * 0.1 * dayF;
      ambient.intensity = 0.09 + night * 0.12;

      // 穹顶跟随相机,永不穿帮
      this.dome.position.copy(camera.position);

      state.night = night;
      state.sunH = sunH;
      state.elevationDeg = (s.elevation * 180) / Math.PI;
      state.hours = hours;
      return state;
    },
  };
}
