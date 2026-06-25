import * as THREE from 'three';

export function createGameScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#77b7dc');
  scene.fog = new THREE.Fog('#77b7dc', 80, 230);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 9, 24);

  const hemi = new THREE.HemisphereLight('#dff7ff', '#49633c', 1.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight('#fff0c4', 3.2);
  sun.position.set(42, 72, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#5ba15f', roughness: 0.92, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
  };
  window.addEventListener('resize', resize);

  return {
    renderer,
    scene,
    camera,
    dispose: () => window.removeEventListener('resize', resize)
  };
}

export function updateChaseCamera(camera, kartState, deltaSeconds) {
  const heading = kartState.heading;
  const speedLean = Math.min(Math.abs(kartState.speed) / 44, 1);
  const distance = 20 + speedLean * 5;
  const behind = new THREE.Vector3(-Math.sin(heading) * distance, 8.5 + speedLean * 1.6, Math.cos(heading) * distance);
  const lookAhead = new THREE.Vector3(
    kartState.x + Math.sin(heading) * (18 + speedLean * 10),
    1.35,
    kartState.z - Math.cos(heading) * (18 + speedLean * 10)
  );
  const desired = new THREE.Vector3(kartState.x, 0, kartState.z).add(behind);
  const alpha = 1 - Math.pow(0.001, deltaSeconds);

  camera.position.lerp(desired, alpha);
  camera.lookAt(lookAhead);
}
