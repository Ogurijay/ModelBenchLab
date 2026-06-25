import * as THREE from 'three';

// 渲染基础设施：renderer、相机、灯光、天空与地面。

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ecdf2);
  scene.fog = new THREE.Fog(0x8ecdf2, 180, 420);

  const camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.1,
    600,
  );
  camera.position.set(0, 30, -40);

  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x4a7a3a, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3d6, 2.2);
  sun.position.set(80, 120, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -130;
  sun.shadow.camera.right = 130;
  sun.shadow.camera.top = 130;
  sun.shadow.camera.bottom = -130;
  sun.shadow.camera.far = 350;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(420, 48),
    new THREE.MeshLambertMaterial({ color: 0x5ea84f }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera };
}

// 追车相机：平滑跟随到车后上方，并看向车头前方。
export function updateChaseCamera(camera, kart, dt) {
  const fx = Math.sin(kart.heading);
  const fz = Math.cos(kart.heading);
  const back = 9 + Math.abs(kart.speed) * 0.06;
  const desired = new THREE.Vector3(
    kart.x - fx * back,
    4.2 + Math.abs(kart.speed) * 0.02,
    kart.z - fz * back,
  );
  const blend = 1 - Math.exp(-6 * dt);
  camera.position.lerp(desired, blend);
  camera.lookAt(kart.x + fx * 7, 1.2, kart.z + fz * 7);
}
