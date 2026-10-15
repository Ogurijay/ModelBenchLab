// 主光（太阳 / 月光）+ 半球天光 + 雾 + 环境贴图 + 阴影相机跟随。
import * as THREE from 'three';
import { celestial, makeCelestialState, createSky, applySky, invACES } from './sky.js';

const CITY_CENTER = new THREE.Vector3(50, 0, -70);
const SHADOW_SIZE = 4096;

export function createLighting(ctx) {
  const { scene, renderer, settings } = ctx;
  const st = makeCelestialState();
  const sky = createSky();
  scene.add(sky.mesh);
  scene.background = null;

  // ---- 主方向光：白天是太阳，夜里切成冷色月光（切换点两者强度都≈0，无跳变）----
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'atmo-sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 900;
  scene.add(sun, sun.target);

  // 夜间冷色月光补光：不投影，方向与月光水平相反、贴近水平（主要照墙面，少照地面）——让背月的立面和屋顶也从夜空里分出来
  const fill = new THREE.DirectionalLight(0x8ea8e8, 0);
  fill.name = 'atmo-moonfill';
  fill.castShadow = false;
  scene.add(fill, fill.target);

  const hemi = new THREE.HemisphereLight(0xdfeeff, 0x6b5a45, 1);
  hemi.name = 'atmo-hemi';
  scene.add(hemi);

  const fog = new THREE.FogExp2(0xb0cce8, 0.0011);
  scene.fog = fog;

  // ---- 环境贴图：用同一个天空着色器渲进 PMREM，金饰 / 铁件才有反射；时间变化 > 0.25 h 才重算 ----
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(sky.geo, sky.material);
  envSky.scale.setScalar(50);
  envSky.onBeforeRender = () => {
    sky.uniforms.uInvTone.value = 0; // 环境贴图存的是辐亮度，不取逆
    sky.uniforms.uEnvDesat.value = 0.7;
  };
  envScene.add(envSky);
  // 环境里加一圈「地面」，让下半球是暖灰而不是天色（否则物体底面会发蓝）
  const envGroundMat = new THREE.MeshBasicMaterial({ color: 0x6a5c4a, side: THREE.BackSide });
  const envGround = new THREE.Mesh(new THREE.SphereGeometry(45, 24, 8, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), envGroundMat);
  envScene.add(envGround);
  let envRT = null;
  let envHour = -99;
  let envNight = -1;

  function refreshEnv(hour) {
    const dh = Math.abs(((hour - envHour + 36) % 24) - 12); // 环形时间差
    if (envRT && dh < 0.25 && Math.abs(envNight - st.night) < 0.05) return;
    envHour = hour;
    envNight = st.night;
    envGroundMat.color.copy(st.hemi.ground).multiplyScalar(0.9);
    // 临时把天空 uniform 的太阳显隐降一点：环境里太阳太亮会让所有金属表面一片白
    const vis = sky.uniforms.uSunVis.value;
    sky.uniforms.uSunVis.value = vis * 0.25;
    const rt = pmrem.fromScene(envScene, 0, 0.1, 200);
    sky.uniforms.uSunVis.value = vis;
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
  }

  // ---- 阴影相机跟随：在光空间里按 texel 对齐，避免移动时阴影边缘爬行 ----
  const _c = new THREE.Vector3();
  const _f = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _lightDir = new THREE.Vector3();
  let lastHalf = 0;

  function updateShadow(dir) {
    const cam = ctx.camera;
    const wide = ctx.mode !== 'walk' || cam.position.y > 60;
    const half = wide ? 470 : 80; // 第一人称 ±80 m：texel ≈ 4 cm（Critic R4：阴影边缘锯齿）
    if (wide) {
      _c.copy(CITY_CENTER);
    } else {
      // 以玩家为中心，往视线方向前移 25 m：身后需要的阴影少，前方多
      cam.getWorldDirection(_f);
      _f.y = 0;
      if (_f.lengthSq() > 1e-6) _f.normalize();
      _c.copy(cam.position).addScaledVector(_f, 25);
      _c.y = Math.min(cam.position.y, 20);
    }
    _lightDir.copy(dir);
    // 光空间基：right ⟂ lightDir，up = lightDir × right
    _right.set(0, 1, 0).cross(_lightDir);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_lightDir, _right).normalize();
    const texel = (half * 2) / SHADOW_SIZE;
    const a = _c.dot(_right);
    const b = _c.dot(_up);
    _c.addScaledVector(_right, Math.round(a / texel) * texel - a);
    _c.addScaledVector(_up, Math.round(b / texel) * texel - b);

    const dist = wide ? 1100 : 420;
    sun.position.copy(_c).addScaledVector(_lightDir, dist);
    sun.target.position.copy(_c);
    sun.target.updateMatrixWorld();
    const sc = sun.shadow.camera;
    if (half !== lastHalf) {
      sc.left = -half;
      sc.right = half;
      sc.top = half;
      sc.bottom = -half;
      sc.near = wide ? 200 : 20;
      sc.far = wide ? 2000 : 820;
      sc.updateProjectionMatrix();
      lastHalf = half;
    }
    // 偏移按 texel 尺度给：近景细、全景粗
    // 偏移按 texel 尺度：近景 normalBias ≈ 1.2 texel（再大会在墙根 / 椅脚处漏影）
    sun.shadow.normalBias = wide ? 0.6 : 0.045;
    sun.shadow.bias = wide ? -0.0005 : -0.00025;
        sun.shadow.radius = wide ? 1 : 1.25; // R5 盲比：radius 3 出现点状抖动噪点，回到接近硬边的干净 PCF
    sun.shadow.blurSamples = 12;
  }

  let indoorK = 0;
  const fogColor = new THREE.Color();

  function update(dt, t) {
    const hour = ((settings.hour % 24) + 24) % 24;
    celestial(hour, st);
    applySky(sky, st, fogColor, t);
    sky.mesh.position.copy(ctx.camera.position);

    // 室内补偿：平滑趋近（dt=0 的截图帧直接到位）
    const target = ctx.indoor ? 1 : 0;
    indoorK = dt > 0 ? indoorK + (target - indoorK) * Math.min(1, dt * 2.5) : target;

    // 主光：太阳 / 月光
    const sunY = st.sunDir.y;
    const sunK = st.sun.k * settings.sunIntensity;
    const moonK = settings.moonIntensity * THREE.MathUtils.smoothstep(-sunY, 0.02, 0.2);
    const useSun = sunY > -0.03;
    const dir = useSun ? st.sunDir : st.moonDir;
    sun.intensity = useSun ? sunK : moonK;
    if (useSun) sun.color.copy(st.sun.color);
    else sun.color.setRGB(0.55, 0.66, 1.0);
    sun.castShadow = sun.intensity > 0.02;
    updateShadow(dir);
    fill.intensity = settings.moonFill * st.night;
    fill.position.set(-st.moonDir.x, 0.25, -st.moonDir.z).normalize().multiplyScalar(100).add(ctx.camera.position);
    fill.target.position.copy(ctx.camera.position);
    fill.target.updateMatrixWorld();

    // 天光：室内时提高（模拟窗口进光 + 墙面互相反射），室外不动
    hemi.color.copy(st.hemi.sky);
    hemi.groundColor.copy(st.hemi.ground);
    hemi.intensity = st.hemi.k * settings.skyLight * (1 + 0.9 * indoorK * (1 - 0.5 * st.night));
    scene.environmentIntensity = (0.4 - 0.27 * st.night) * settings.skyLight * (1 + 0.6 * indoorK);

    // 曝光：main 每帧先写 settings.exposure，这里只在其上乘室内补偿
    renderer.toneMappingExposure = settings.exposure * (1 + 0.3 * indoorK);

    // 雾：密度基值 0.0011 × 倍率；相机越高越淡，俯瞰 / 巡游降到 1/3（Critic R2：俯瞰时钴蓝屋顶被雾冲成灰紫）
    const high = THREE.MathUtils.smoothstep(ctx.camera.position.y, 30, 220);
    const aerial = ctx.mode === 'overview' || ctx.mode === 'tour' ? 1 : high;
    fog.density = 0.0011 * settings.fog * (1 - 0.67 * aerial);
    // 离屏管线里雾在 ACES 之前混合：雾色取逆，远景才会正好融进（未经色调映射的）天空地平线
    if (sky.rtPath) invACES(fogColor, renderer.toneMappingExposure, fog.color);
    else fog.color.copy(fogColor);

    refreshEnv(hour);

    ctx.env.hour = hour;
    ctx.env.night = st.night;
    ctx.env.sunDir.copy(st.sunDir);
    ctx.mat.setNight(st.night);
    return st;
  }

  return { update, st, sun, hemi, fog, sky };
}
