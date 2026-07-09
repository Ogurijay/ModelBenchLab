import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createWaveSpectrum,
  getQualityProfile,
  sampleWaveSurface
} from './ocean/spectrum.js';
import {
  ENVIRONMENT_PRESETS,
  createPresetTransition,
  selectPreset,
  stepPresetTransition
} from './environment/presets.js';
import { createSkyMaterial, updateSkyEnvironment } from './environment/sky.js';
import { createOceanMaterial, updateOceanEnvironment } from './ocean/material.js';
import { bindPresetControls } from './ui/controls.js';

const sceneShell = document.querySelector('#scene-shell');
const canvas = document.querySelector('#ocean-canvas');
const errorPanel = document.querySelector('#error-panel');
const errorMessage = document.querySelector('#error-message');
const performanceReadout = document.querySelector('#performance-readout');

const diagnostics = Object.seal({
  ready: false,
  frames: 0,
  activePreset: 'noon',
  quality: 'pending',
  webgl: false,
  fps: 0
});
window.__ocean = diagnostics;

function showError(error) {
  diagnostics.ready = false;
  sceneShell.dataset.state = 'error';
  errorMessage.textContent = error instanceof Error ? error.message : String(error);
  errorPanel.hidden = false;
  console.error('[GPT 5.6 SOL Ocean]', error);
}

function applyEnvironment({ renderer, scene, horizonMaterial, oceanMaterial, skyMaterial }, environment) {
  updateOceanEnvironment(oceanMaterial, environment);
  updateSkyEnvironment(skyMaterial, environment);
  renderer.toneMappingExposure = environment.exposure;
  scene.fog.color.fromArray(environment.skyHorizon);
  scene.fog.density = environment.fogDensity;
  horizonMaterial.color.fromArray(environment.deepColor).lerp(
    new THREE.Color().fromArray(environment.skyHorizon),
    0.46
  );
}

function startOcean() {
  if (!canvas) {
    throw new Error('页面缺少海面画布，无法建立渲染器。');
  }

  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const quality = getQualityProfile({
    width: window.innerWidth,
    devicePixelRatio: window.devicePixelRatio,
    coarsePointer
  });
  diagnostics.quality = quality.name;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.name !== 'mobile',
    alpha: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false
  });
  diagnostics.webgl = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.debug.checkShaderErrors = true;

  let pixelRatio = quality.initialPixelRatio;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  const initialEnvironment = ENVIRONMENT_PRESETS.noon;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(
    new THREE.Color().fromArray(initialEnvironment.skyHorizon),
    initialEnvironment.fogDensity
  );

  const camera = new THREE.PerspectiveCamera(
    48,
    window.innerWidth / window.innerHeight,
    0.1,
    1900
  );
  camera.position.set(17, 10.5, 28);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 112;
  controls.minPolarAngle = 0.16;
  controls.maxPolarAngle = Math.PI * 0.486;
  controls.target.set(0, 1.2, -24);

  const waves = createWaveSpectrum();
  const oceanMaterial = createOceanMaterial(waves, initialEnvironment);
  const oceanGeometry = new THREE.PlaneGeometry(
    1200,
    1200,
    quality.segments,
    quality.segments
  );
  oceanGeometry.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
  ocean.frustumCulled = false;
  ocean.renderOrder = 1;
  scene.add(ocean);

  const horizonMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color().fromArray(initialEnvironment.deepColor),
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const horizonGeometry = new THREE.RingGeometry(510, 1180, 256, 1);
  horizonGeometry.rotateX(-Math.PI / 2);
  const horizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
  horizon.position.y = -0.82;
  horizon.frustumCulled = false;
  scene.add(horizon);

  const skyMaterial = createSkyMaterial(initialEnvironment);
  const skyGeometry = new THREE.SphereGeometry(920, 64, 32);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);

  const environmentTargets = {
    renderer,
    scene,
    horizonMaterial,
    oceanMaterial,
    skyMaterial
  };
  applyEnvironment(environmentTargets, initialEnvironment);

  let transition = createPresetTransition('noon');
  const transitionDuration = reducedMotion ? 0.25 : 1.8;
  const ui = bindPresetControls({
    root: sceneShell,
    keyboardTarget: window,
    onSelect(id) {
      transition = selectPreset(transition, id, transitionDuration);
    }
  });

  renderer.compile(scene, camera);
  const brokenProgram = renderer.info.programs?.find(
    (program) => program.diagnostics && program.diagnostics.runnable === false
  );
  if (brokenProgram) {
    throw new Error('海面着色器编译失败，请检查浏览器 WebGL 支持。');
  }

  const clock = new THREE.Clock();
  let animationFrame = 0;
  let disposed = false;
  let sampleElapsed = 0;
  let sampleFrames = 0;
  let lowFpsSamples = 0;

  function updatePerformance(delta) {
    sampleElapsed += delta;
    sampleFrames += 1;
    if (sampleElapsed < 1) return;

    const fps = sampleFrames / sampleElapsed;
    diagnostics.fps = Math.round(fps);
    performanceReadout.textContent = `${quality.name.toUpperCase()} · ${Math.round(fps)} FPS`;
    lowFpsSamples = fps < 50 ? lowFpsSamples + 1 : 0;

    if (lowFpsSamples >= 3 && pixelRatio > 0.8) {
      pixelRatio = Math.max(0.8, pixelRatio - 0.15);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      lowFpsSamples = 0;
    }

    sampleElapsed = 0;
    sampleFrames = 0;
  }

  function render() {
    if (disposed) return;
    animationFrame = requestAnimationFrame(render);

    const delta = Math.min(0.05, clock.getDelta());
    const elapsed = clock.elapsedTime;
    transition = stepPresetTransition(transition, delta);
    diagnostics.activePreset = transition.progress >= 1
      ? transition.activeId
      : transition.targetId;

    applyEnvironment(environmentTargets, transition.current);
    oceanMaterial.uniforms.uTime.value = elapsed;
    skyMaterial.uniforms.uTime.value = elapsed;

    const surface = sampleWaveSurface({
      x: camera.position.x,
      z: camera.position.z,
      time: elapsed,
      waves
    });
    camera.position.y = Math.max(camera.position.y, surface.height + 2.2);
    controls.update();

    const gridCell = 24;
    const anchorX = Math.round(camera.position.x / gridCell) * gridCell;
    const anchorZ = Math.round(camera.position.z / gridCell) * gridCell;
    ocean.position.set(anchorX, 0, anchorZ);
    horizon.position.set(anchorX, -0.82, anchorZ);
    sky.position.copy(camera.position);

    renderer.render(scene, camera);
    diagnostics.frames += 1;
    updatePerformance(delta);

    if (!diagnostics.ready) {
      diagnostics.ready = true;
      sceneShell.dataset.state = 'ready';
      performanceReadout.textContent = `${quality.name.toUpperCase()} · 采样 FPS`;
    }
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pagehide', dispose);
    ui.destroy();
    controls.dispose();
    oceanGeometry.dispose();
    oceanMaterial.dispose();
    horizonGeometry.dispose();
    horizonMaterial.dispose();
    skyGeometry.dispose();
    skyMaterial.dispose();
    renderer.dispose();
  }

  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('pagehide', dispose, { once: true });
  ui.setActive('noon');
  render();
}

try {
  startOcean();
} catch (error) {
  showError(error);
}
