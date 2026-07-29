import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { projectLonLat, terrainHeight } from '../geo/projection.js';

const OVERVIEW_POSITION = new THREE.Vector3(12, 138, 150);
const OVERVIEW_TARGET = new THREE.Vector3(0, 1.5, 2);

function smoothstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function createCameraRig(camera, canvas, { onModeChange } = {}) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.minDistance = 7;
  controls.maxDistance = 255;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.target.copy(OVERVIEW_TARGET);
  controls.update();

  camera.position.copy(OVERVIEW_POSITION);
  camera.lookAt(OVERVIEW_TARGET);

  let mode = 'overview';
  let flight = null;
  let userStarted = false;

  function setMode(nextMode) {
    if (mode === nextMode) return;
    mode = nextMode;
    onModeChange?.(mode);
  }

  function flyTo(position, target, nextMode = 'free', duration = 1.25) {
    flight = {
      fromPosition: camera.position.clone(),
      fromTarget: controls.target.clone(),
      toPosition: position.clone(),
      toTarget: target.clone(),
      elapsed: 0,
      duration: Math.max(0.05, duration),
      mode: nextMode,
    };
    controls.enabled = false;
    setMode(nextMode);
  }

  function overview(duration = 1.35) {
    flyTo(OVERVIEW_POSITION, OVERVIEW_TARGET, 'overview', duration);
  }

  function focusLonLat(lon, lat, {
    distance = 14,
    heightOffset = 1.8,
    mode: focusMode = 'detail',
    duration = 1.2,
  } = {}) {
    const [x, z] = projectLonLat(lon, lat);
    const terrainY = terrainHeight(lon, lat);
    const target = new THREE.Vector3(x, terrainY + heightOffset, z);
    const direction = new THREE.Vector3(0.72, 0.62, 0.86).normalize().multiplyScalar(distance);
    const position = target.clone().add(direction);
    flyTo(position, target, focusMode, duration);
  }

  function focusCity(city, options = {}) {
    const importance = THREE.MathUtils.clamp(Number(city.importance) || 2, 1, 5);
    focusLonLat(city.lon, city.lat, {
      distance: 13.5 + (5 - importance) * 0.7,
      heightOffset: 1.55,
      mode: 'city',
      ...options,
    });
  }

  function focusEvent(event, options = {}) {
    focusLonLat(event.lon, event.lat, {
      distance: 19,
      heightOffset: 2.2,
      mode: 'event',
      ...options,
    });
  }

  function update(deltaSeconds) {
    if (flight) {
      flight.elapsed += Math.max(0, deltaSeconds);
      const alpha = smoothstep(flight.elapsed / flight.duration);
      camera.position.lerpVectors(flight.fromPosition, flight.toPosition, alpha);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, alpha);
      camera.lookAt(controls.target);
      if (alpha >= 1) {
        controls.enabled = true;
        flight = null;
        controls.update();
      }
      return;
    }
    controls.update();
  }

  function cancelFlight() {
    if (!flight) return;
    flight = null;
    controls.enabled = true;
  }

  controls.addEventListener('start', () => {
    userStarted = true;
    cancelFlight();
  });
  controls.addEventListener('end', () => {
    if (!userStarted) return;
    userStarted = false;
    if (mode !== 'city' && mode !== 'event') setMode('free');
  });

  function dispose() {
    controls.dispose();
  }

  return {
    controls,
    overview,
    focusCity,
    focusEvent,
    focusLonLat,
    flyTo,
    update,
    cancelFlight,
    dispose,
    get mode() {
      return mode;
    },
    get isFlying() {
      return Boolean(flight);
    },
  };
}
