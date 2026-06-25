import './styles.css';
import * as THREE from 'three';
import { createKartState, getInputVector, integrateKart } from './simulation/kart.js';
import {
  CHECKPOINT_COUNT,
  collectBoostPad,
  createRaceState,
  resetBoostPads,
  updateCheckpointProgress
} from './simulation/race.js';
import { createGameScene, updateChaseCamera } from './render/scene.js';
import { createKartModel, updateKartModel } from './render/kartModel.js';
import { createTrackWorld, getNearestTrackInfo, getTrackHeading, getTrackPoint } from './render/track.js';
import { createHud, updateHud } from './ui/hud.js';

const canvas = document.querySelector('#game-canvas');
const { renderer, scene, camera } = createGameScene(canvas);
const track = createTrackWorld();
scene.add(track.group);

const kartModel = createKartModel();
scene.add(kartModel);

const hud = createHud();
hud.prompt.classList.add('visible');

const keys = {};
const touchInput = {
  throttleUntil: 0,
  steerLeftUntil: 0,
  steerRightUntil: 0,
  driftUntil: 0
};
function createStartingKart() {
  const start = getTrackPoint(0.045);
  return createKartState({ x: start.x, z: start.z, heading: getTrackHeading(0.045) });
}

let kart = createStartingKart();
let race = createRaceState({ totalLaps: 3 });
let raceStartedAt = performance.now();

function resetGame() {
  kart = createStartingKart();
  race = createRaceState({ totalLaps: 3 });
  raceStartedAt = performance.now();
  track.boostMeshes.forEach((mesh) => {
    mesh.visible = true;
  });
  hud.prompt.classList.add('visible');
  hud.prompt.querySelector('strong').textContent = 'GPT Kart Circuit';
  hud.prompt.querySelector('span').textContent = 'WASD / Arrow keys drive · Space drift · R reset';
}

window.addEventListener('keydown', (event) => {
  keys[event.code] = true;
  if (event.code === 'KeyR') {
    resetGame();
  }
});

window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

document.querySelectorAll('[data-drive]').forEach((button) => {
  const drive = button.dataset.drive;
  const pulse = () => {
    const until = performance.now() + 520;
    if (drive === 'gas') touchInput.throttleUntil = until;
    if (drive === 'left') touchInput.steerLeftUntil = until;
    if (drive === 'right') touchInput.steerRightUntil = until;
    if (drive === 'drift') touchInput.driftUntil = until;
  };

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    pulse();
  });
  button.addEventListener('click', pulse);
});

function getDriveInput(now) {
  const keyboard = getInputVector(keys);
  const touchSteer =
    (touchInput.steerRightUntil > now ? 1 : 0) - (touchInput.steerLeftUntil > now ? 1 : 0);
  const diagnosticThrottle = autoDrive && now - raceStartedAt < 2200 ? 1 : 0;

  return {
    throttle: Math.max(keyboard.throttle, touchInput.throttleUntil > now ? 1 : 0, diagnosticThrottle),
    brake: keyboard.brake,
    steer: keyboard.steer !== 0 ? keyboard.steer : touchSteer,
    drift: keyboard.drift || touchInput.driftUntil > now
  };
}

function updateCheckpointAndBoost(nowMs) {
  const nowRaceMs = nowMs - raceStartedAt;

  track.checkpoints.forEach((checkpoint) => {
    if (checkpoint.index !== race.nextCheckpoint) {
      return;
    }
    const distance = Math.hypot(kart.x - checkpoint.position.x, kart.z - checkpoint.position.z);
    if (distance < 7.2) {
      race = updateCheckpointProgress(race, checkpoint.index, nowRaceMs);
      if (race.nextCheckpoint === 0) {
        race = resetBoostPads(race);
        track.boostMeshes.forEach((mesh) => {
          mesh.visible = true;
        });
      }
    }
  });

  track.boosts.forEach((boost, index) => {
    if (race.collectedBoostPads.includes(boost.id)) {
      return;
    }
    const distance = Math.hypot(kart.x - boost.position.x, kart.z - boost.position.z);
    if (distance < 3.2) {
      race = collectBoostPad(race, boost.id, nowRaceMs);
      kart.boostTime = 1.5;
      track.boostMeshes[index].visible = false;
    }
  });
}

const clock = new THREE.Clock();
const query = new URLSearchParams(window.location.search);
const captureStill = query.get('capture') === 'still';
const autoDrive = query.get('autodrive') === '1';
let frameCount = 0;

function animate() {
  frameCount += 1;
  const delta = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  const nowRaceMs = now - raceStartedAt;
  const input = race.finished ? { throttle: 0, brake: 1, steer: 0, drift: false } : getDriveInput(now);
  const nearest = getNearestTrackInfo(kart.x, kart.z);

  kart = integrateKart(kart, input, delta, {
    trackDistance: nearest.distance,
    signedTrackDistance: nearest.signedTrackDistance,
    nearestPoint: { x: nearest.point.x, z: nearest.point.z },
    normal: { x: nearest.normal.x, z: nearest.normal.z },
    boostActive: race.boostUntilMs > nowRaceMs
  });

  updateCheckpointAndBoost(now);
  updateKartModel(kartModel, kart, delta);
  updateChaseCamera(camera, kart, delta);
  updateHud(hud, race, kart, nowRaceMs);

  track.boostMeshes.forEach((mesh, index) => {
    mesh.rotation.z += delta * 2.8;
    mesh.position.y = track.boosts[index].position.y + 1.15 + Math.sin(now * 0.004 + index) * 0.16;
  });

  renderer.render(scene, camera);
  if (!captureStill || frameCount < 120) {
    requestAnimationFrame(animate);
  }
}

animate();
