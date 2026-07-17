import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const TOUR_POINTS = [
  new THREE.Vector3(-410, 260, -440),
  new THREE.Vector3(-240, 150, -220),
  new THREE.Vector3(50, 128, -42),
  new THREE.Vector3(-30, 84, 122),
  new THREE.Vector3(208, 96, 72),
  new THREE.Vector3(282, 72, -82),
  new THREE.Vector3(72, 155, -238),
];
const TOUR_TARGETS = [
  new THREE.Vector3(0, 46, -20),
  new THREE.Vector3(-18, 56, -52),
  new THREE.Vector3(18, 36, 22),
  new THREE.Vector3(0, 12, 88),
  new THREE.Vector3(145, 30, 42),
  new THREE.Vector3(42, 48, -24),
  new THREE.Vector3(0, 42, -76),
];

export function createCameraRig(camera, canvas) {
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.minDistance = 18;
  controls.maxDistance = 520;
  controls.maxPolarAngle = Math.PI * 0.485;
  controls.target.set(0, 42, -34);
  const path = new THREE.CatmullRomCurve3(TOUR_POINTS, true, 'centripetal', 0.42);
  const targetPath = new THREE.CatmullRomCurve3(TOUR_TARGETS, true, 'centripetal', 0.42);
  let mode = 'tour';
  let progress = 0.015;
  let tourSpeed = 0.0075;
  const lookTarget = new THREE.Vector3();

  const setMode = (nextMode) => {
    mode = nextMode === 'orbit' ? 'orbit' : 'tour';
    controls.enabled = mode === 'orbit';
  };
  const update = (dt) => {
    if (mode === 'tour') {
      progress = (progress + dt * tourSpeed) % 1;
      camera.position.copy(path.getPointAt(progress));
      lookTarget.copy(targetPath.getPointAt(progress));
      controls.target.lerp(lookTarget, 1 - Math.exp(-dt * 3.8));
      camera.lookAt(controls.target);
    } else controls.update();
  };
  setMode('tour');
  return {
    controls, path, update, setMode,
    setTourSpeed(value) { tourSpeed = THREE.MathUtils.clamp(value, 0.002, 0.025); },
    reset() {
      progress = 0.015;
      camera.position.copy(TOUR_POINTS[0]);
      controls.target.copy(TOUR_TARGETS[0]);
    },
    dispose() { controls.dispose(); },
    get mode() { return mode; },
  };
}
