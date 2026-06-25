import * as THREE from "three";

export const SUN_DIRECTION = new THREE.Vector3(-0.35, 0.58, 0.73).normalize();

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#9fc7cf", 0.0019);

  const hemisphere = new THREE.HemisphereLight("#b9ecff", "#16323a", 1.25);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight("#ffe1ad", 2.8);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  scene.add(sun);

  return scene;
}
