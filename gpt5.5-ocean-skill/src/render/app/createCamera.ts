import * as THREE from "three";

export function createCamera(container: HTMLElement): THREE.PerspectiveCamera {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  const camera = new THREE.PerspectiveCamera(56, width / height, 0.4, 1500);
  camera.position.set(0, 10, 32);
  camera.lookAt(0, 0.5, 3);
  return camera;
}
