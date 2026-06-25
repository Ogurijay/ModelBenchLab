import "./styles.css";

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createBuoyState, updateBuoy } from "./game/simulation/buoyancy";
import type { OceanPreset } from "./game/simulation/oceanTypes";
import { applyOceanPreset, createOceanState, rebuildWaveSpectrum } from "./game/simulation/waveSpectrum";
import { createFpsCounter } from "./diagnostics/perf";
import { exposeDebugApi } from "./diagnostics/debugApi";
import { createCamera } from "./render/app/createCamera";
import { createLoop } from "./render/app/createLoop";
import { createRenderer } from "./render/app/createRenderer";
import { createScene, SUN_DIRECTION } from "./render/app/createScene";
import { bindResize } from "./render/app/resize";
import { createSkyDome } from "./render/materials/skyMaterial";
import { createBuoy } from "./render/objects/createBuoy";
import { createOceanSurface } from "./render/objects/createOceanSurface";
import { createSeafloor } from "./render/objects/createSeafloor";
import { createHud, type HudPatch } from "./ui/hud/createHud";

const container = document.querySelector<HTMLElement>("#app");
if (!container) {
  throw new Error("Missing #app container");
}

const oceanState = createOceanState("windy");
const buoyState = createBuoyState();
const renderer = createRenderer(container);
const camera = createCamera(container);
const scene = createScene();
const controls = new OrbitControls(camera, renderer.domElement);
const fpsCounter = createFpsCounter();

controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.maxDistance = 165;
controls.minDistance = 14;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0, 0.5, 3);

const skyDome = createSkyDome(SUN_DIRECTION);
const seafloor = createSeafloor();
const ocean = createOceanSurface(oceanState, SUN_DIRECTION);
const buoy = createBuoy();

scene.add(skyDome, seafloor.mesh, ocean.mesh, buoy.group);

function resetCamera(): void {
  camera.position.set(0, 10, 32);
  controls.target.set(0, 0.5, 3);
  controls.update();
}

function applyPatch(patch: HudPatch): void {
  const shouldRebuildSpectrum = "windSpeed" in patch || "windDirectionDegrees" in patch;

  if (patch.windDirectionDegrees !== undefined) {
    oceanState.windDirection = THREE.MathUtils.degToRad(patch.windDirectionDegrees);
  }
  if (patch.windSpeed !== undefined) oceanState.windSpeed = patch.windSpeed;
  if (patch.swell !== undefined) oceanState.swell = patch.swell;
  if (patch.choppiness !== undefined) oceanState.choppiness = patch.choppiness;
  if (patch.foam !== undefined) oceanState.foam = patch.foam;
  if (patch.timeScale !== undefined) oceanState.timeScale = patch.timeScale;

  oceanState.preset = "windy";
  if (shouldRebuildSpectrum) {
    rebuildWaveSpectrum(oceanState);
  }
}

const hud = createHud({
  onPatch: applyPatch,
  onPreset: (preset: OceanPreset) => applyOceanPreset(oceanState, preset),
  onResetCamera: resetCamera,
});

container.appendChild(hud.element);
bindResize(container, camera, renderer);
exposeDebugApi(camera, oceanState);

renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  hud.setWarning("WebGL context lost. Reload after the GPU context returns.");
});

renderer.domElement.addEventListener("webglcontextrestored", () => {
  hud.setWarning(null);
  window.location.reload();
});

const loop = createLoop(renderer, (dt, now) => {
  oceanState.time += dt * oceanState.timeScale;

  const sample = updateBuoy(buoyState, oceanState, dt);
  buoy.sync(buoyState, dt);
  seafloor.update(oceanState.time);
  ocean.update(oceanState);
  controls.update();
  renderer.render(scene, camera);

  hud.update({
    state: oceanState,
    fps: fpsCounter.update(now),
    rendererInfo: renderer.info,
    sample,
  });
});

window.addEventListener("beforeunload", () => {
  loop.stop();
  seafloor.dispose();
  ocean.dispose();
  buoy.dispose();
  renderer.dispose();
});
