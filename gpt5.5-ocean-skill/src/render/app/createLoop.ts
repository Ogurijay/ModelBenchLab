import type * as THREE from "three";

export interface RenderLoop {
  stop: () => void;
}

export function createLoop(renderer: THREE.WebGLRenderer, tick: (dt: number, now: number) => void): RenderLoop {
  let last = performance.now();

  renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    tick(dt, now);
  });

  return {
    stop: () => renderer.setAnimationLoop(null),
  };
}
