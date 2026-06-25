// Grok Realistic Ocean - 主场景编排
// 结构清晰：渲染器/相机/控制 → 海面网格 + 天空 → 波浪参数联动 → 轻量浮标演示（CPU 采样）
// 强调 CPU/GPU 同源数学 + 可测试波浪逻辑。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  createWaveSet,
  gridForQuality,
  sampleHeight,
  sampleHeightNormal,
  seaStateLabel,
} from './ocean/waves.js';
import {
  createOceanMaterial,
  createSkyMaterial,
  applyWaves,
  applySun,
} from './ocean/materials.js';
import { createPanel, createHud } from './ui/panel.js';

const params = {
  windSpeed: 11.5,
  windDirection: 128,
  waveScale: 1.05,
  choppiness: 0.82,
  foam: 0.68,
  sunElevation: 24,
  sunAzimuth: 262,
  quality: 'medium',

  // 增强物理效果参数
  shape: 'box',
  objectSize: 1.8,
  dropHeight: 32,
  gravity: 9.8,
  autoRain: false,
  vesselSailing: true,
  vesselSpeed: 0.8,
};

// DOM
const container = document.getElementById('app');

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Scene & Camera
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 2200);
camera.position.set(-12, 11, 44);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(6, 2, -8);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 7;
controls.maxDistance = 280;
controls.maxPolarAngle = Math.PI * 0.492;

// Materials
const oceanMat = createOceanMaterial();
const skyMat = createSkyMaterial();

// Ocean mesh (dynamic geometry on quality change)
let oceanMesh = null;

function buildOcean(quality) {
  const { size, segments } = gridForQuality(quality);
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);

  if (oceanMesh) {
    oceanMesh.geometry.dispose();
    oceanMesh.geometry = geo;
  } else {
    oceanMesh = new THREE.Mesh(geo, oceanMat);
    oceanMesh.frustumCulled = false;
    scene.add(oceanMesh);
  }
  hud.setVertexCount(geo.attributes.position.count);
}

// Sky dome
const sky = new THREE.Mesh(new THREE.SphereGeometry(880, 46, 22), skyMat);
scene.add(sky);

// Buoy demo: small floating markers driven by CPU sampleHeight (验证同源波浪)
const buoys = [];
const BUOY_COUNT = 4;
const BUOY_SPACING = 28;

function createBuoy(color = 0xffd166) {
  const g = new THREE.Group();

  // body (sphere-ish)
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 18, 14),
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 })
  );
  body.position.y = 0.6;
  g.add(body);

  // mast
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 2.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.6 })
  );
  mast.position.y = 2.1;
  g.add(mast);

  // flag
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xe63939, side: THREE.DoubleSide, roughness: 0.8 })
  );
  flag.position.set(0.85, 2.9, 0);
  flag.rotation.y = Math.PI / 2;
  g.add(flag);

  return g;
}

function initBuoys() {
  const basePositions = [
    [-BUOY_SPACING * 0.6, -BUOY_SPACING * 0.55],
    [ BUOY_SPACING * 0.55, -BUOY_SPACING * 0.6],
    [-BUOY_SPACING * 0.5,  BUOY_SPACING * 0.52],
    [ BUOY_SPACING * 0.62,  BUOY_SPACING * 0.48],
  ];
  const colors = [0xffd166, 0x4cc9f0, 0x9d4edd, 0x06d6a0];

  for (let i = 0; i < BUOY_COUNT; i++) {
    const b = createBuoy(colors[i]);
    const [bx, bz] = basePositions[i];
    b.userData = { baseX: bx, baseZ: bz, phase: i * 1.7 };
    scene.add(b);
    buoys.push(b);
  }
}

function updateBuoys(time) {
  for (const b of buoys) {
    const { baseX, baseZ } = b.userData;
    // 使用与 GPU 完全一致的 CPU 采样函数
    const h = sampleHeight(currentWaves, baseX, baseZ, time);
    b.position.set(baseX, h + 0.35, baseZ);

    // 轻微随波浪倾斜（用相邻点近似梯度）
    const hdx = sampleHeight(currentWaves, baseX + 1.6, baseZ, time);
    const hdz = sampleHeight(currentWaves, baseX, baseZ + 1.6, time);
    const tiltX = (h - hdz) * 0.9;
    const tiltZ = (hdx - h) * 0.9;
    b.rotation.x = tiltX;
    b.rotation.z = tiltZ;
    b.rotation.y = b.userData.phase * 0.1; // 轻微自转
  }
}

// ---------------------------------------------------------------------------
// 增强物理效果：可交互落体 + 飞溅 + 浮力 + 简单船只
// ---------------------------------------------------------------------------
const objects = [];
const MAX_OBJECTS = 48;
const effects = [];

const shapeNames = { box: '立方体', sphere: '球体', cylinder: '圆柱', cone: '圆锥' };

// 统计面板元素
const statsEls = {
  shape: document.getElementById('s-shape'),
  height: document.getElementById('s-height'),
  time: document.getElementById('s-time'),
  speed: document.getElementById('s-speed'),
  theo: document.getElementById('s-theo'),
};

function reportDrop(o, impactSpeed, waterY) {
  const h = Math.max(0.01, o.startY - waterY);
  const t = (window.__grokOcean && window.__grokOcean.elapsed) ? (window.__grokOcean.elapsed - o.spawnT) : 0;
  if (!statsEls.shape) return;
  statsEls.shape.textContent = shapeNames[o.shape] || o.shape;
  statsEls.height.textContent = h.toFixed(2) + ' m';
  statsEls.time.textContent = t.toFixed(3) + ' s';
  statsEls.speed.textContent = impactSpeed.toFixed(2) + ' m/s';
  statsEls.theo.textContent = Math.sqrt(2 * h / params.gravity).toFixed(3) + ' s';
}

// 简单飞溅：白色 expanding ring + 粒子
function createSplash(x, y, z, impact) {
  const strength = Math.min(impact / 14, 1.6) + 0.4;

  // 环
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.65,
    side: THREE.DoubleSide, depthWrite: false
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.6, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, y + 0.05, z);
  scene.add(ring);

  // 粒子
  const N = Math.floor(14 + strength * 20);
  const pos = new Float32Array(N * 3);
  const vel = [];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y + 0.1; pos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2;
    const sp = (0.9 + Math.random() * 2.1) * strength;
    vel.push(new THREE.Vector3(Math.cos(a) * sp, (2.2 + Math.random() * 3.2) * strength, Math.sin(a) * sp));
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dm = new THREE.PointsMaterial({ color: 0xe6f4ff, size: 0.28, transparent: true, opacity: 0.9, depthWrite: false });
  const pts = new THREE.Points(dg, dm);
  scene.add(pts);

  effects.push({ ring, ringMat, pts, dg, dm, vel, life: 0, maxRing: 2.8 + strength * 3.5 });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life += dt;
    const f = e.life / 0.95;
    const s = 1 + e.life * e.maxRing;
    e.ring.scale.set(s, s, s);
    e.ringMat.opacity = Math.max(0, 0.65 * (1 - f));

    const p = e.dg.attributes.position.array;
    for (let j = 0; j < e.vel.length; j++) {
      e.vel[j].y -= params.gravity * dt * 0.95;
      p[j * 3]     += e.vel[j].x * dt;
      p[j * 3 + 1] += e.vel[j].y * dt;
      p[j * 3 + 2] += e.vel[j].z * dt;
    }
    e.dg.attributes.position.needsUpdate = true;
    e.dm.opacity = Math.max(0, 0.9 * (1 - f));

    if (e.life > 0.95) {
      scene.remove(e.ring); scene.remove(e.pts);
      e.ring.geometry.dispose(); e.ringMat.dispose();
      e.dg.dispose(); e.dm.dispose();
      effects.splice(i, 1);
    }
  }
}

// 生成可物理交互的物体
function spawnObject(x, z) {
  const size = params.objectSize;
  let geo, half;
  const shape = params.shape;

  if (shape === 'sphere') {
    geo = new THREE.SphereGeometry(size * 0.48, 20, 16);
    half = size * 0.48;
  } else if (shape === 'cylinder') {
    geo = new THREE.CylinderGeometry(size * 0.38, size * 0.38, size * 0.9, 18);
    half = size * 0.45;
  } else if (shape === 'cone') {
    geo = new THREE.ConeGeometry(size * 0.45, size * 0.95, 18);
    half = size * 0.48;
  } else {
    geo = new THREE.BoxGeometry(size, size * 0.9, size);
    half = size * 0.45;
  }

  const hue = 0.55 + Math.random() * 0.25;
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(hue, 0.7, 0.58),
    roughness: 0.4, metalness: 0.18
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, params.dropHeight, z);
  mesh.rotation.set(Math.random() * 1.2, Math.random() * 6, Math.random() * 1.2);
  scene.add(mesh);

  const obj = {
    mesh,
    half,
    vel: new THREE.Vector3(0, 0, 0),
    ang: new THREE.Vector3((Math.random() - 0.5) * 1.8, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 1.8),
    splashed: false,
    spawnT: (window.__grokOcean && window.__grokOcean.elapsed) || 0,
    startY: params.dropHeight,
    shape,
  };
  objects.push(obj);

  if (objects.length > MAX_OBJECTS) {
    const old = objects.shift();
    scene.remove(old.mesh);
    old.mesh.geometry.dispose();
    old.mesh.material.dispose();
  }
}

// 物理更新：重力 + 浮力 + 阻尼 + 波浪跟随 + 法线对齐
function updateObjects(dt, t) {
  const g = params.gravity;

  for (const o of objects) {
    // 积分
    o.vel.y -= g * dt;
    o.mesh.position.addScaledVector(o.vel, dt);
    o.mesh.rotation.x += o.ang.x * dt;
    o.mesh.rotation.y += o.ang.y * dt;
    o.mesh.rotation.z += o.ang.z * dt;

    // 水面采样
    const s = sampleHeightNormal(currentWaves, o.mesh.position.x, o.mesh.position.z, t);
    const waterY = s.y;
    const bottom = o.mesh.position.y - o.half;

    if (bottom < waterY) {
      if (!o.splashed) {
        o.splashed = true;
        const impact = Math.abs(o.vel.y);
        createSplash(o.mesh.position.x, waterY, o.mesh.position.z, impact);
        reportDrop(o, impact, waterY);
      }

      // 浮力（简单弹簧模型）
      const submersion = waterY - bottom;
      o.vel.y += submersion * 42 * dt;

      // 水阻尼
      const drag = Math.exp(-2.9 * dt);
      o.vel.multiplyScalar(drag);
      o.ang.multiplyScalar(Math.exp(-3.1 * dt));

      // 用真实法线让物体尝试对齐波面
      const n = new THREE.Vector3(s.nx, s.ny, s.nz);
      if (n.lengthSq() > 0.0001) {
        n.normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(up, n);
        o.mesh.quaternion.slerp(q, 1 - Math.exp(-6 * dt));
      }
    }
  }
}

// 一个更显眼的演示船只（随波浪 + 可缓慢航行）
let vessel = null;
let vesselHeading = 1.8;
let vesselPos = new THREE.Vector3(18, 0, -22);

function createVessel() {
  const g = new THREE.Group();

  // 船体
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x8b2b2b, roughness: 0.55, metalness: 0.2 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(11, 2.2, 4.8), hullMat);
  hull.position.y = -0.3;
  g.add(hull);

  // 甲板
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 4.2),
    new THREE.MeshStandardMaterial({ color: 0xc2a46b, roughness: 0.7 }));
  deck.position.y = 1.1;
  g.add(deck);

  // 舱室
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 3.2),
    new THREE.MeshStandardMaterial({ color: 0xf2f4f7, roughness: 0.5 }));
  cabin.position.set(-1.5, 2.6, 0);
  g.add(cabin);

  // 烟囱
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 2.1, 14),
    new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.6 }));
  funnel.position.set(-3.2, 4.1, 0);
  g.add(funnel);

  // 小旗
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5, 6),
    new THREE.MeshStandardMaterial({ color: 0x333 }));
  mast.position.set(2.8, 3.4, 0);
  g.add(mast);

  return g;
}

function updateVessel(dt, t) {
  if (params.vesselSailing) {
    const spd = 4.2 * params.vesselSpeed;
    vesselPos.x += Math.cos(vesselHeading) * spd * dt;
    vesselPos.z += Math.sin(vesselHeading) * spd * dt;
    // 缓慢转向
    vesselHeading += Math.sin(t * 0.3) * 0.018 * dt;
  }

  const s = sampleHeightNormal(currentWaves, vesselPos.x, vesselPos.z, t);
  vessel.position.set(vesselPos.x, s.y + 0.4, vesselPos.z);

  const n = new THREE.Vector3(s.nx, s.ny, s.nz).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const qWave = new THREE.Quaternion().setFromUnitVectors(up, n);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(up, -vesselHeading + 0.4);
  const targetQ = qWave.clone().multiply(qYaw);
  vessel.quaternion.slerp(targetQ, 1 - Math.exp(-7 * dt));
}

let currentWaves = [];

function rebuildWaves() {
  currentWaves = createWaveSet({
    windSpeed: params.windSpeed,
    windDirection: params.windDirection,
    choppiness: params.choppiness,
    amplitudeScale: params.waveScale,
    seed: 202406,
  });
  applyWaves(oceanMat, currentWaves);
  hud.setSeaState(params.windSpeed);
}

// Sun & lighting sync
function updateSun() {
  applySun([oceanMat, skyMat], params.sunElevation, params.sunAzimuth);
}

// HUD + Panel
const hud = createHud();

function onResetView() {
  camera.position.set(-12, 11, 44);
  controls.target.set(6, 2, -8);
}

createPanel(params, {
  onWavesChanged: rebuildWaves,
  onFoamChanged: () => {
    oceanMat.uniforms.uFoamAmount.value = params.foam;
  },
  onSunChanged: updateSun,
  onQualityChanged: () => buildOcean(params.quality),
  onResetView,

  // 物理效果相关（按钮）
  onDropRandom: () => spawnObject((Math.random() - 0.5) * 85, (Math.random() - 0.5) * 85),
  onDropBurst: () => {
    for (let i = 0; i < 9; i++) spawnObject((Math.random() - 0.5) * 92, (Math.random() - 0.5) * 92);
  },
  onClearObjects: () => {
    while (objects.length) {
      const o = objects.pop();
      scene.remove(o.mesh);
      o.mesh.geometry.dispose();
      o.mesh.material.dispose();
    }
  },
});

// Build initial scene
buildOcean(params.quality);
initBuoys();
rebuildWaves();
updateSun();
oceanMat.uniforms.uFoamAmount.value = params.foam;

// 演示船只（更显眼的物理浮动物体）
vessel = createVessel();
scene.add(vessel);

// 简单环境光 + 太阳光
const hemi = new THREE.HemisphereLight(0xaad4ff, 0x0b1f2e, 0.65);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff1d0, 1.1);
scene.add(sunLight);

// ---------------------------------------------------------------------------
// 点击投放（区分 orbit 拖拽）
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
let downX = 0, downY = 0, downT = 0;

renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX; downY = e.clientY; downT = performance.now();
});

renderer.domElement.addEventListener('pointerup', (e) => {
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved > 7 || performance.now() - downT > 380) return; // 认为是拖拽

  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);

  if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
    const lim = 295;
    if (Math.abs(hitPoint.x) < lim && Math.abs(hitPoint.z) < lim) {
      spawnObject(hitPoint.x, hitPoint.z);
    }
  }
});

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug handle（浏览器验证用）
window.__grokOcean = {
  frames: 0,
  elapsed: 0,
  params,
  renderer,
  getWaveCount: () => currentWaves.length,
  sample: (x, z, t) => sampleHeight(currentWaves, x, z, t),
  spawn: spawnObject,
};

// Animation
const clock = new THREE.Clock();
let rainAcc = 0;

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.06);
  const t = clock.elapsedTime;
  window.__grokOcean.elapsed = t;

  // GPU 时间
  oceanMat.uniforms.uTime.value = t;

  // CPU 波浪驱动
  updateBuoys(t);
  updateVessel(dt, t);

  // 物理落体 + 飞溅
  updateObjects(dt, t);
  updateEffects(dt);

  // 自动落雨
  if (params.autoRain) {
    rainAcc += dt;
    if (rainAcc > 0.28) {
      rainAcc = 0;
      spawnObject((Math.random() - 0.5) * 88, (Math.random() - 0.5) * 88);
    }
  }

  // 灯光跟随太阳
  const sunDir = oceanMat.uniforms.uSunDir.value;
  sunLight.position.copy(sunDir).multiplyScalar(220);

  controls.update();
  hud.tick(dt);
  renderer.render(scene, camera);

  window.__grokOcean.frames += 1;
});
