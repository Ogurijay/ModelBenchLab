import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import { fbm2D } from "./core/NoiseKit.js";
import { Ocean } from "./ocean/Ocean.js";
import { Sailboat } from "./ocean/Sailboat.js";
import { SkyDome } from "./sky/SkyDome.js";
import { StormSystem } from "./weather/StormSystem.js";
import { RainField } from "./weather/RainField.js";
import { LightningSystem } from "./weather/LightningSystem.js";
import { AmbientAudio } from "./audio/AmbientAudio.js";
import { ControlPanel } from "./ui/ControlPanel.js";

const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 6000);

let driftHeading = Math.PI;
const driftOrigin = new THREE.Vector3(
  Math.sin(driftHeading) * 95,
  27,
  Math.cos(driftHeading) * 95
);
camera.position.set(0, 36, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(driftOrigin);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 1600;
controls.minPolarAngle = 0.05;
controls.maxPolarAngle = 1.55;
controls.update();

const ocean = new Ocean();
const sky = new SkyDome();
const stormSystem = new StormSystem();
const rain = new RainField();
const lightning = new LightningSystem();
const audio = new AmbientAudio();
const boat = new Sailboat();

// Ocean/sky are fully self-shaded custom materials and need no scene lights;
// the boat uses standard PBR materials, so it gets its own small light rig.
const sunLight = new THREE.DirectionalLight(0xfff2d9, 1.3);
const hemiLight = new THREE.HemisphereLight(0x9fc6dd, 0x0d1b26, 0.55);
const sunWarmColor = new THREE.Color(0xfff2d9);
scene.add(sunLight, sunLight.target, hemiLight);

scene.add(sky.mesh, ocean.mesh, rain.mesh, lightning.group, boat.group);

// The boat "sails in formation" with the camera's cruise path — it receives
// the same per-frame drift delta as camera/target, offset to one side, so
// it stays in view without needing its own independent navigation logic.
const boatPosition = new THREE.Vector3(driftOrigin.x + 26, 0, driftOrigin.z - 18);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55,
  0.4,
  0.86
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
window.__debugScene = { scene, camera, controls, stormSystem, lightning, ocean, sky, boat, sunLight, hemiLight, renderer, composer };

let droneSpeed = 6;
const flashWorldPos = new THREE.Vector3();
const flashDir = new THREE.Vector3();
const audioButton = document.getElementById("audio-toggle");

function setAudioEnabled(next) {
  if (!audio.ctx) audio.unlock();
  else audio.setEnabled(next);
  audioButton.classList.toggle("active", next);
  audioButton.textContent = next ? "🔊 声音开启" : "🔇 开启声音";
}

const panel = new ControlPanel({
  onAutoMode: (v) => stormSystem.setAutoMode(v),
  onManualOverride: (v) => stormSystem.setManualOverride(v),
  onTimeScale: (v) => stormSystem.setTimeScale(v),
  onDroneSpeed: (v) => (droneSpeed = v),
  onSpawnStorm: () => stormSystem.spawnStormNear(camera.position),
  onClearSkies: () => stormSystem.clearSkies(),
  onTriggerLightning: () => {
    const roll = stormSystem.triggerLightningNow(camera.position);
    const strike = lightning.forceStrike(roll);
    if (strike) audio.triggerThunder(strike.distance);
  },
  onAudioToggle: (v) => setAudioEnabled(v),
});

audioButton.addEventListener("click", () => {
  const next = !audio.enabled;
  setAudioEnabled(next);
  panel.setAudioState(next);
});

const hudState = document.getElementById("hud-state");
const hudWind = document.getElementById("hud-wind");
const hudWave = document.getElementById("hud-wave");
const hudStorm = document.getElementById("hud-storm");
const compassNeedle = document.getElementById("compass-needle");
const loadingEl = document.getElementById("loading");

const clock = new THREE.Timer();
const cameraForward = new THREE.Vector3();
let firstFrame = true;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
}
window.addEventListener("resize", resize);

function updateDrift(dt) {
  const curl = (fbm2D(clock.getElapsed() * 0.015, 42.0) - 0.5) * 0.15;
  driftHeading += curl * dt;
  const dx = Math.sin(driftHeading) * droneSpeed * dt;
  const dz = Math.cos(driftHeading) * droneSpeed * dt;
  camera.position.x += dx;
  camera.position.z += dz;
  controls.target.x += dx;
  controls.target.z += dz;
  boatPosition.x += dx;
  boatPosition.z += dz;
}

function clampAboveWater(elapsed) {
  const waterY = ocean.getSwellHeight(camera.position.x, camera.position.z, elapsed);
  const minY = waterY + 3.2;
  if (camera.position.y < minY) camera.position.y = minY;
  if (camera.position.y > 400) camera.position.y = 400;
}

function updateHud(state) {
  hudState.textContent = state.label;
  hudWind.textContent = `${state.windSpeed.toFixed(1)} m/s`;
  const waveHeight = 0.6 + state.windSpeed * 0.22 + state.stormInfluence * 2.4;
  hudWave.textContent = `${waveHeight.toFixed(1)} m`;
  if (state.nearestDistance === null) {
    hudStorm.textContent = "无";
  } else {
    hudStorm.textContent = `${(state.nearestDistance / 1000).toFixed(2)} km`;
  }

  camera.getWorldDirection(cameraForward);
  const yaw = Math.atan2(cameraForward.x, cameraForward.z);
  const bearing = state.nearestDistance === null ? yaw : state.nearestBearing;
  const rotationDeg = ((bearing - yaw) * 180) / Math.PI;
  compassNeedle.style.transform = `rotate(${rotationDeg}deg)`;
}

renderer.setAnimationLoop(() => {
  clock.update();
  const dt = Math.min(clock.getDelta(), 0.1);

  updateDrift(dt);
  stormSystem.update(dt, camera.position);
  clampAboveWater(stormSystem.scaledElapsed);

  const simTime = stormSystem.scaledElapsed;
  const state = stormSystem.state;

  ocean.followCamera(camera);
  ocean.update(simTime, state);

  sky.followCamera(camera);
  sky.update(simTime, state, stormSystem.getCellsRelative(camera.position, 3));

  rain.update(simTime, camera, state);

  boat.update(dt, simTime, ocean, boatPosition.x, boatPosition.z, driftHeading, state.windDir, state.windSpeed);

  const strike = lightning.update(dt, camera, stormSystem);
  if (strike) audio.triggerThunder(strike.distance);

  flashWorldPos.copy(lightning.flashWorldPos);
  ocean.setFlash(flashWorldPos, lightning.flashIntensity, lightning.flashColor);
  flashDir.subVectors(flashWorldPos, camera.position).normalize();
  sky.setFlash(lightning.flashIntensity, flashDir, lightning.flashColor);

  sunLight.position.copy(camera.position).addScaledVector(state.sunDirection, 300);
  sunLight.target.position.copy(camera.position);
  sunLight.intensity = 1.3 * (1 - state.skyDarkness * 0.85) + lightning.flashIntensity * 3;
  sunLight.color.copy(sunWarmColor).lerp(lightning.flashColor, lightning.flashIntensity);
  hemiLight.intensity = 0.55 * (1 - state.skyDarkness * 0.5) + lightning.flashIntensity * 1.5;
  hemiLight.color.copy(state.skyZenith);
  hemiLight.groundColor.copy(state.fogColor);

  audio.updateWeather(state);
  controls.update();
  updateHud(state);

  composer.render();

  if (firstFrame) {
    firstFrame = false;
    requestAnimationFrame(() => loadingEl.classList.add("hidden"));
  }
});
