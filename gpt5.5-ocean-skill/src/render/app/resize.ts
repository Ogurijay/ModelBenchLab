import type * as THREE from "three";

export function bindResize(container: HTMLElement, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer): () => void {
  const resize = () => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false);
  };

  window.addEventListener("resize", resize);
  resize();

  return () => window.removeEventListener("resize", resize);
}
