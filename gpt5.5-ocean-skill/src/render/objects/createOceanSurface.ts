import * as THREE from "three";
import type { OceanState } from "../../game/simulation/oceanTypes";
import { createOceanMaterial } from "../materials/oceanMaterial";

export interface OceanSurface {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  update: (state: OceanState) => void;
  dispose: () => void;
}

export function createOceanSurface(state: OceanState, sunDirection: THREE.Vector3): OceanSurface {
  const geometry = new THREE.PlaneGeometry(960, 960, 240, 240);
  geometry.rotateX(-Math.PI / 2);
  const materialHandle = createOceanMaterial(state, sunDirection);
  const mesh = new THREE.Mesh(geometry, materialHandle.material);

  mesh.name = "GerstnerOceanSurface";
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;

  return {
    mesh,
    update: materialHandle.update,
    dispose: () => {
      geometry.dispose();
      materialHandle.material.dispose();
    },
  };
}
