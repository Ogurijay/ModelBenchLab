import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FireVolume } from './FireVolume.js';
import { EmberSystem, SmokeSystem } from './ParticleSystems.js';
import { createStage } from './createStage.js';

const app = document.querySelector('#app');
const qualityPresets = [
  { label: '流畅', steps: 36, dpr: 1.0 },
  { label: '均衡', steps: 54, dpr: 1.25 },
  { label: '高', steps: 72, dpr: 1.5 },
];

const state = {
  elapsed: 0,
  paused: false,
  ready: false,
  intensity: 1,
  turbulence: 0.72,
  wind: 0.18,
  quality: 2,
  fps: 0,
};

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch (error) {
  app.innerHTML = `<div style="display:grid;place-items:center;height:100%;padding:32px;color:#e9e0d0">当前浏览器无法创建 WebGL 渲染器：${error.message}</div>`;
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, qualityPresets[state.quality].dpr));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
app.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080806);
scene.fog = new THREE.FogExp2(0x080806, 0.032);

const camera = new THREE.PerspectiveCamera(39, window.innerWidth / window.innerHeight, 0.08, 80);
camera.position.set(7.4, 4.35, 8.9);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.15, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 5.2;
controls.maxDistance = 16;
controls.minPolarAngle = Math.PI * 0.2;
controls.maxPolarAngle = Math.PI * 0.49;
controls.update();

scene.add(new THREE.HemisphereLight(0x293548, 0x110906, 0.38));
const stage = createStage(scene);
const fire = new FireVolume();
const embers = new EmberSystem(renderer.getPixelRatio());
const smoke = new SmokeSystem(renderer.getPixelRatio());
scene.add(smoke, fire, embers);

const resolution = new THREE.Vector2();
const defaultCamera = {
  position: new THREE.Vector3(7.4, 4.35, 8.9),
  target: new THREE.Vector3(0, 2.15, 0),
};

function applyParameters() {
  const preset = qualityPresets[state.quality];
  const pixelRatio = Math.min(window.devicePixelRatio, preset.dpr);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  fire.setParameters({
    intensity: state.intensity,
    turbulence: state.turbulence,
    wind: state.wind,
    steps: preset.steps,
  });
  embers.setParameters({ intensity: state.intensity, wind: state.wind, pixelRatio });
  smoke.setParameters({ intensity: state.intensity, wind: state.wind, pixelRatio });
  updateReadouts();
}

function updateReadouts() {
  const preset = qualityPresets[state.quality];
  document.querySelector('#temperature').textContent = `${Math.round(1180 + state.intensity * 160).toLocaleString('zh-CN')}°C`;
  document.querySelector('#steps').textContent = `${preset.steps} STEP`;
  document.querySelector('#qualityValue').textContent = preset.label;
}

function updateSimulation(dt) {
  if (!state.paused) {
    state.elapsed += dt;
    embers.update(dt, state.elapsed);
    smoke.update(dt, state.elapsed);
  }

  const t = state.elapsed;
  const flicker = 0.9
    + Math.sin(t * 8.7) * 0.055
    + Math.sin(t * 13.1 + 1.8) * 0.032
    + Math.sin(t * 3.3) * 0.045;
  stage.fireLight.intensity = 54 * state.intensity * flicker;
  stage.fireLight.position.x = Math.sin(t * 2.7) * 0.15 + state.wind * 0.08;
  stage.fireLight.position.z = Math.cos(t * 2.1) * 0.11;
  stage.baseLight.intensity = 18 * state.intensity * (0.93 + Math.sin(t * 6.2) * 0.07);
  stage.coalBed.material.emissiveIntensity = 0.72 + state.intensity * 0.82 * flicker;
  stage.emberMaterial.emissiveIntensity = 1.45 + state.intensity * 1.25 * flicker;

  renderer.getDrawingBufferSize(resolution);
  fire.update(state.elapsed, camera, resolution);
  controls.update();
}

function renderFrame(dt) {
  updateSimulation(Math.min(dt, 0.05));
  renderer.render(scene, camera);
  if (!state.ready) state.ready = true;
}

let previousTime = performance.now();
let fpsStart = previousTime;
let fpsFrames = 0;

function animate(now) {
  const dt = (now - previousTime) / 1000;
  previousTime = now;
  renderFrame(dt);

  fpsFrames++;
  if (now - fpsStart >= 600) {
    state.fps = Math.round(fpsFrames * 1000 / (now - fpsStart));
    document.querySelector('#fps').textContent = `${state.fps} FPS`;
    fpsFrames = 0;
    fpsStart = now;
  }
}

renderer.setAnimationLoop(animate);

function resetView() {
  camera.position.copy(defaultCamera.position);
  controls.target.copy(defaultCamera.target);
  controls.update();
}

function setPaused(paused) {
  state.paused = paused;
  const button = document.querySelector('#pause');
  button.textContent = paused ? '继续' : '暂停';
  button.setAttribute('aria-pressed', String(paused));
}

const bindings = [
  ['intensity', 'intensityValue', (value) => value.toFixed(2)],
  ['turbulence', 'turbulenceValue', (value) => value.toFixed(2)],
  ['wind', 'windValue', (value) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`],
];

for (const [inputId, outputId, formatter] of bindings) {
  const input = document.querySelector(`#${inputId}`);
  const output = document.querySelector(`#${outputId}`);
  input.addEventListener('input', () => {
    state[inputId] = Number(input.value);
    output.textContent = formatter(state[inputId]);
    applyParameters();
  });
}

document.querySelector('#quality').addEventListener('input', (event) => {
  state.quality = Number(event.currentTarget.value);
  applyParameters();
});
document.querySelector('#pause').addEventListener('click', () => setPaused(!state.paused));
document.querySelector('#resetView').addEventListener('click', resetView);

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && !event.repeat && document.activeElement?.tagName !== 'INPUT') {
    event.preventDefault();
    setPaused(!state.paused);
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyParameters();
});

applyParameters();

window.__bench = {
  get ready() { return state.ready; },
  stepFrame(frameCount = 1) {
    const count = Math.max(1, Math.min(600, Math.floor(frameCount)));
    for (let i = 0; i < count; i++) renderFrame(1 / 60);
    return this.getState();
  },
  getState() {
    const params = fire.getParameters();
    return {
      ready: state.ready,
      threeRevision: THREE.REVISION,
      elapsed: Number(state.elapsed.toFixed(3)),
      paused: state.paused,
      fps: state.fps,
      fire: { ...params, temperature: Math.round(1180 + state.intensity * 160) },
      particles: { embers: embers.count, smoke: smoke.count },
      camera: {
        position: camera.position.toArray().map((value) => Number(value.toFixed(3))),
        target: controls.target.toArray().map((value) => Number(value.toFixed(3))),
      },
      renderInfo: {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        points: renderer.info.render.points,
      },
    };
  },
  setParameters(parameters = {}) {
    for (const key of ['intensity', 'turbulence', 'wind']) {
      if (Number.isFinite(parameters[key])) {
        state[key] = parameters[key];
        const input = document.querySelector(`#${key}`);
        input.value = String(parameters[key]);
        input.dispatchEvent(new Event('input'));
      }
    }
    if (Number.isInteger(parameters.quality)) {
      state.quality = THREE.MathUtils.clamp(parameters.quality, 0, 2);
      const input = document.querySelector('#quality');
      input.value = String(state.quality);
      input.dispatchEvent(new Event('input'));
    }
    return this.getState();
  },
  resetView,
  setPaused,
};
