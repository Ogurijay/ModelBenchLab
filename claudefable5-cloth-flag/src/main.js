import * as THREE from 'three';
import { createScene } from './scene.js';
import { Cloth } from './cloth.js';
import { WindField } from './wind.js';
import { DragController } from './interaction.js';
import { buildPanel } from './ui.js';
import { makeFlagTexture } from './textures.js';
import { CLOTH, DEFAULTS, segYFor } from './config.js';
import { installBench } from './bench.js';
import './style.css';

// ---------------- 装配 ----------------

const params = { ...DEFAULTS };

const container = document.getElementById('app');
const { renderer, scene, camera, controls, lineGroup, dust } = createScene(container);

const flagMaterial = new THREE.MeshStandardMaterial({
  map: makeFlagTexture(renderer.capabilities.getMaxAnisotropy()),
  side: THREE.DoubleSide, // 双面渲染 + 双面受光
  roughness: 0.72,
  metalness: 0.0,
});

const cloth = new Cloth({
  width: CLOTH.width,
  height: CLOTH.height,
  segX: params.segX,
  segY: segYFor(params.segX),
  topLeft: new THREE.Vector3(CLOTH.topX, CLOTH.topY, 0),
  material: flagMaterial,
});
scene.add(cloth.mesh);
cloth.setPinMode(params.pinMode, false);
lineGroup.visible = params.pinMode === 'corners';

const wind = new WindField(params);
new DragController({ dom: renderer.domElement, camera, cloth, controls });

// 物理环境:每帧从 params 同步(滑杆实时生效)
const env = {
  gravity: params.gravity,
  damping: params.damping,
  iterations: params.iterations,
  wind,
  tearEnabled: params.tearEnabled,
  tearThreshold: params.tearThreshold,
  poleRadius: CLOTH.poleCollisionRadius,
  poleTopY: CLOTH.poleHeight,
  poleX: 0,
  poleZ: 0,
  groundY: 0,
};

function syncEnv() {
  env.gravity = params.gravity;
  env.damping = params.damping;
  env.iterations = params.iterations;
  env.tearEnabled = params.tearEnabled;
  env.tearThreshold = params.tearThreshold;
}

const panel = buildPanel({
  root: document.getElementById('panel-root'),
  params,
  segYFor,
  onRebuild: () => {
    cloth.build(Math.round(params.segX), segYFor(Math.round(params.segX)));
  },
  onPinMode: (mode) => {
    cloth.setPinMode(mode, true);
    lineGroup.visible = mode === 'corners';
  },
  onReset: () => cloth.resetCloth(),
});

// ---------------- 主循环:固定 1/120 子步累加器 ----------------

const FIXED_DT = 1 / 120;
const MAX_STEPS = 5;
let accumulator = 0;
let frame = 0;
let fps = 0;
let fpsFrames = 0;
let fpsTime = 0;
const clock = new THREE.Clock();

function tick(dt) {
  accumulator = Math.min(accumulator + dt, FIXED_DT * MAX_STEPS);
  syncEnv();
  while (accumulator >= FIXED_DT) {
    wind.update(FIXED_DT);
    cloth.step(FIXED_DT, env);
    accumulator -= FIXED_DT;
  }
  cloth.updateGeometry();
  dust.update(dt, wind.vector);
  controls.update();
  renderer.render(scene, camera);
  frame++;
  if (!bench.ready) bench.ready = true;

  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
    panel.setStats({
      fps,
      particles: cloth.count,
      structural: cloth.structuralCount,
      shear: cloth.conCount - cloth.structuralCount,
      torn: cloth.tornCount,
    });
  }
}

function getState() {
  return {
    ready: bench.ready,
    frame,
    fps,
    resolution: { segX: cloth.segX, segY: cloth.segY },
    particles: cloth.count,
    constraints: {
      total: cloth.conCount,
      structural: cloth.structuralCount,
      shear: cloth.conCount - cloth.structuralCount,
      alive: cloth.conCount - cloth.tornCount,
      torn: cloth.tornCount,
    },
    pinMode: cloth.pinMode,
    iterations: params.iterations,
    gravity: params.gravity,
    damping: params.damping,
    wind: {
      direction: params.windDirection,
      strength: params.windStrength,
      gust: params.gust,
      effectiveSpeed: +wind.strength.toFixed(3),
    },
    tearEnabled: params.tearEnabled,
    dragging: cloth.dragIndex >= 0,
    avgSpeed: +cloth.averageSpeed(FIXED_DT).toFixed(4),
    clothCenter: cloth.samplePoint(0.5, 0.5),
    freeCorner: cloth.samplePoint(1, 1),
  };
}

const bench = installBench({ tick, getState });

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1 / 20);
  tick(dt);
}
animate();
