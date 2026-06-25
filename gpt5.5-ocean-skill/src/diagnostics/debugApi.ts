import type * as THREE from "three";
import type { OceanState } from "../game/simulation/oceanTypes";

declare global {
  interface Window {
    __GPTSKILL_OCEAN__?: {
      getCameraPosition: () => { x: number; y: number; z: number };
      getOceanTime: () => number;
      getWaveCount: () => number;
    };
  }
}

export function exposeDebugApi(camera: THREE.PerspectiveCamera, state: OceanState): void {
  window.__GPTSKILL_OCEAN__ = {
    getCameraPosition: () => ({
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
    }),
    getOceanTime: () => state.time,
    getWaveCount: () => state.waves.length,
  };
}
