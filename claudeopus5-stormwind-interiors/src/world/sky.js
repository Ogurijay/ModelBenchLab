// 天空穹顶 + 昼夜:天顶/地平线渐变、日轮、云带、星空,以及与之联动的太阳光、雾、环境反射。
// 环境反射用 PMREM 从"当前天色"现算一张 equirect —— 金属、玻璃、水面的反射会随时辰变化。
import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_Position.z = gl_Position.w;      // 永远贴在远平面
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uZenith, uHorizon, uGround, uSunColor, uSunDir;
  uniform float uNight, uTime;

  float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    float a = hash(vec3(i,0.0)), b = hash(vec3(i+vec2(1,0),0.0));
    float c = hash(vec3(i+vec2(0,1),0.0)), d = hash(vec3(i+vec2(1,1),0.0));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(vec2 p){
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ s += noise(p)*a; p *= 2.07; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float y = dir.y;
    vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.42));
    col = mix(col, uGround, smoothstep(0.0, -0.14, y));

    // 星空
    if (uNight > 0.01 && y > -0.02) {
      vec3 q = floor(dir * 220.0);
      float s = hash(q);
      float star = smoothstep(0.9975, 1.0, s) * (0.5 + 0.5 * sin(uTime * 2.0 + s * 90.0));
      col += vec3(star) * uNight * 1.6 * smoothstep(0.0, 0.25, y);
    }

    // 日轮 / 月轮
    float sd = dot(dir, normalize(uSunDir));
    float disc = smoothstep(0.9992, 0.99955, sd);
    float glow = pow(max(sd, 0.0), 320.0) * 0.5 + pow(max(sd, 0.0), 9.0) * 0.16;
    col += uSunColor * (disc * 6.0 + glow) * (1.0 - uNight * 0.55);

    // 云带
    if (y > 0.015) {
      vec2 cp = dir.xz / (y + 0.14) * 0.55 + vec2(uTime * 0.006, uTime * 0.0035);
      float c = fbm(cp * 1.6);
      float cov = smoothstep(0.52, 0.86, c) * smoothstep(0.0, 0.16, y);
      vec3 cc = mix(vec3(0.92, 0.94, 0.98), uSunColor * 1.05, 0.35 + 0.4 * max(sd, 0.0));
      cc = mix(cc * 0.25 + vec3(0.03, 0.05, 0.09), cc, 1.0 - uNight * 0.85);
      col = mix(col, cc, cov * 0.85);
    }

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const C = (hex) => new THREE.Color(hex);

const PALETTE = {
  day: { zenith: C(0x3f74c4), horizon: C(0xbcd6f0), sun: C(0xfff3dc), ground: C(0x6b7a63), light: C(0xfff2d8), amb: C(0x9fb6d6) },
  dusk: { zenith: C(0x2a3f7a), horizon: C(0xef9a5c), sun: C(0xffb45e), ground: C(0x4a4340), light: C(0xffa860), amb: C(0x8a7f9a) },
  night: { zenith: C(0x050912), horizon: C(0x121d33), sun: C(0xc9d6f2), ground: C(0x10141c), light: C(0x6c86c4), amb: C(0x2b3a5c) },
};

export function createSky(scene, renderer) {
  const geo = new THREE.SphereGeometry(1, 32, 20);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: PALETTE.day.zenith.clone() },
      uHorizon: { value: PALETTE.day.horizon.clone() },
      uGround: { value: PALETTE.day.ground.clone() },
      uSunColor: { value: PALETTE.day.sun.clone() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uNight: { value: 0 },
      uTime: { value: 0 },
    },
  });
  const dome = new THREE.Mesh(geo, material);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  dome.scale.setScalar(600);
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 420;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.35;
  const shadowCam = sun.shadow.camera;
  shadowCam.left = -95; shadowCam.right = 95; shadowCam.top = 95; shadowCam.bottom = -95;
  scene.add(sun);
  scene.add(sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd6f0, 0x50503f, 0.85);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0x9fb6d6, 0.35);
  scene.add(amb);

  scene.fog = new THREE.Fog(PALETTE.day.horizon.clone(), 260, 1500);

  /* ---- 环境反射(PMREM) ---- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const EW = 96, EH = 48;
  const envData = new Uint8Array(EW * EH * 4);
  const envTex = new THREE.DataTexture(envData, EW, EH, THREE.RGBAFormat);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  let envRT = null;
  let lastEnvKey = -999;

  const tmp = new THREE.Color();
  function refreshEnv(state) {
    for (let j = 0; j < EH; j++) {
      const theta = (j / (EH - 1)) * Math.PI;          // 0=天顶
      const dy = Math.cos(theta);
      for (let i = 0; i < EW; i++) {
        const phi = (i / EW) * Math.PI * 2;
        const dx = Math.sin(theta) * Math.sin(phi);
        const dz = Math.sin(theta) * Math.cos(phi);
        if (dy > 0) tmp.copy(state.horizonColor).lerp(state.zenithColor, Math.pow(dy, 0.42));
        else tmp.copy(state.horizonColor).lerp(state.groundColor, Math.min(1, -dy * 6));
        const sd = dx * state.sunDir.x + dy * state.sunDir.y + dz * state.sunDir.z;
        if (sd > 0) {
          const g = Math.pow(sd, 9) * 0.5 + Math.pow(sd, 90) * 2.2;
          tmp.r += state.sunColor.r * g; tmp.g += state.sunColor.g * g; tmp.b += state.sunColor.b * g;
        }
        const k = (j * EW + i) * 4;
        envData[k] = Math.min(255, tmp.r * 255);
        envData[k + 1] = Math.min(255, tmp.g * 255);
        envData[k + 2] = Math.min(255, tmp.b * 255);
        envData[k + 3] = 255;
      }
    }
    envTex.needsUpdate = true;
    const rt = pmrem.fromEquirectangular(envTex);
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
  }

  /* ---- 状态 ---- */
  const state = {
    hours: 10.5,
    sunDir: new THREE.Vector3(0.3, 0.8, 0.5),
    sunColor: PALETTE.day.sun.clone(),
    zenithColor: PALETTE.day.zenith.clone(),
    horizonColor: PALETTE.day.horizon.clone(),
    groundColor: PALETTE.day.ground.clone(),
    night: 0,
  };

  const zc = new THREE.Color(), hc = new THREE.Color(), sc = new THREE.Color(), gc = new THREE.Color();
  const lc = new THREE.Color(), ac = new THREE.Color();

  function setTime(h, force = false) {
    state.hours = ((h % 24) + 24) % 24;
    const t = ((state.hours - 6) / 12) * Math.PI;
    const el = Math.sin(t) * 1.02;
    const az = Math.PI / 2 - ((state.hours - 6) / 12) * Math.PI;
    const cy = Math.sin(el);
    const cxz = Math.cos(el);
    state.sunDir.set(cxz * Math.sin(az), cy, cxz * Math.cos(az)).normalize();
    // 太阳落到地平线以下时改用"月光"(反方向)
    const isNight = state.sunDir.y < -0.02;
    const lightDir = isNight ? state.sunDir.clone().multiplyScalar(-1) : state.sunDir.clone();

    state.night = 1 - THREE.MathUtils.smoothstep(state.sunDir.y, -0.10, 0.16);
    const duskAmt = 1 - Math.min(1, Math.abs(state.sunDir.y) / 0.34);

    const base = state.night > 0.55 ? PALETTE.night : PALETTE.day;
    const mixNight = THREE.MathUtils.smoothstep(state.night, 0.45, 0.95);
    zc.copy(PALETTE.day.zenith).lerp(PALETTE.dusk.zenith, duskAmt).lerp(PALETTE.night.zenith, mixNight);
    hc.copy(PALETTE.day.horizon).lerp(PALETTE.dusk.horizon, duskAmt).lerp(PALETTE.night.horizon, mixNight);
    sc.copy(PALETTE.day.sun).lerp(PALETTE.dusk.sun, duskAmt).lerp(PALETTE.night.sun, mixNight);
    gc.copy(PALETTE.day.ground).lerp(PALETTE.dusk.ground, duskAmt).lerp(PALETTE.night.ground, mixNight);
    lc.copy(PALETTE.day.light).lerp(PALETTE.dusk.light, duskAmt).lerp(PALETTE.night.light, mixNight);
    ac.copy(PALETTE.day.amb).lerp(PALETTE.dusk.amb, duskAmt).lerp(PALETTE.night.amb, mixNight);
    void base;

    state.zenithColor.copy(zc); state.horizonColor.copy(hc);
    state.sunColor.copy(sc); state.groundColor.copy(gc);

    material.uniforms.uZenith.value.copy(zc);
    material.uniforms.uHorizon.value.copy(hc);
    material.uniforms.uGround.value.copy(gc);
    material.uniforms.uSunColor.value.copy(sc);
    material.uniforms.uSunDir.value.copy(state.sunDir);
    material.uniforms.uNight.value = state.night;

    sun.position.copy(lightDir).multiplyScalar(160);
    sun.color.copy(lc);
    sun.intensity = isNight ? 0.42 : 0.5 + 2.4 * Math.max(0, Math.min(1, state.sunDir.y * 2.2));
    hemi.color.copy(hc);
    hemi.intensity = 0.34 + 0.75 * (1 - state.night);
    amb.color.copy(ac);
    amb.intensity = 0.22 + 0.28 * state.night;
    scene.fog.color.copy(hc).multiplyScalar(state.night > 0.5 ? 0.55 : 1.0);

    const key = Math.round(state.hours * 4);
    if (force || key !== lastEnvKey) { lastEnvKey = key; refreshEnv(state); }
  }

  setTime(state.hours, true);

  return {
    state, sun, hemi, amb, material, dome,
    setTime,
    /** 阴影相机跟随视点,保证城市尺度下仍有清晰阴影。 */
    focusShadow(target) {
      sun.target.position.copy(target);
      sun.target.updateMatrixWorld();
      sun.position.copy(state.sunDir.y < -0.02 ? state.sunDir.clone().multiplyScalar(-1) : state.sunDir)
        .multiplyScalar(180).add(target);
      sun.updateMatrixWorld();
    },
    update(dt, elapsed) {
      material.uniforms.uTime.value = elapsed;
      void dt;
    },
    get night() { return state.night; },
    get sunDir() { return state.sunDir; },
    get sunColor() { return state.sunColor; },
    get horizonColor() { return state.horizonColor; },
    dispose() {
      geo.dispose(); material.dispose(); envTex.dispose();
      if (envRT) envRT.dispose();
      pmrem.dispose();
    },
  };
}
