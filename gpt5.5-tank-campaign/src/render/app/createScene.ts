import * as THREE from "three";

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#090b08");
  scene.fog = new THREE.Fog("#090b08", 22, 48);

  const ambient = new THREE.HemisphereLight("#fff2c4", "#334433", 1.15);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight("#fff4d5", 2.4);
  sun.position.set(-9, 18, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  scene.add(sun);

  const rim = new THREE.DirectionalLight("#84f0c6", 0.5);
  rim.position.set(12, 8, -12);
  scene.add(rim);

  return scene;
}
