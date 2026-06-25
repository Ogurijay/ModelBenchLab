import * as THREE from "three";
import type { BuoyState } from "../../game/simulation/buoyancy";

const UP = new THREE.Vector3(0, 1, 0);
const NORMAL = new THREE.Vector3();
const TARGET_QUATERNION = new THREE.Quaternion();

export interface BuoyObject {
  group: THREE.Group;
  sync: (state: BuoyState, dt: number) => void;
  dispose: () => void;
}

export function createBuoy(): BuoyObject {
  const group = new THREE.Group();
  group.name = "SurfaceBuoy";

  const red = new THREE.MeshStandardMaterial({
    color: "#e35f47",
    roughness: 0.58,
    metalness: 0.05,
  });
  const white = new THREE.MeshStandardMaterial({
    color: "#f5efe7",
    roughness: 0.52,
    metalness: 0.03,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: "#26323a",
    roughness: 0.45,
    metalness: 0.15,
  });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.16, 18, 56), red);
  ring.rotation.x = Math.PI / 2;
  ring.castShadow = true;
  group.add(ring);

  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.5, 0.36, 32), white);
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.65, 12), dark);
  mast.position.y = 0.92;
  mast.castShadow = true;
  group.add(mast);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 12), red);
  cap.position.y = 1.8;
  cap.castShadow = true;
  group.add(cap);

  function sync(state: BuoyState, dt: number): void {
    group.position.set(state.position.x, state.position.y, state.position.z);
    NORMAL.set(state.normal.x, state.normal.y, state.normal.z).normalize();
    TARGET_QUATERNION.setFromUnitVectors(UP, NORMAL);
    group.quaternion.slerp(TARGET_QUATERNION, 1 - Math.exp(-9 * dt));
  }

  return {
    group,
    sync,
    dispose: () => {
      group.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            material.dispose();
          }
        }
      });
    },
  };
}
