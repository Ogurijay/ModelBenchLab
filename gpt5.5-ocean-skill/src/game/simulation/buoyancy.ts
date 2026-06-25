import type { OceanState, Vec3 } from "./oceanTypes";
import { sampleOceanField, type OceanSample } from "./oceanField";

export interface BuoyState {
  anchorX: number;
  anchorZ: number;
  position: Vec3;
  velocity: Vec3;
  normal: Vec3;
}

export function createBuoyState(): BuoyState {
  return {
    anchorX: 0,
    anchorZ: 9,
    position: { x: 0, y: 1.1, z: 9 },
    velocity: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
  };
}

export function updateBuoy(state: BuoyState, ocean: OceanState, dt: number): OceanSample {
  const sample = sampleOceanField(state.anchorX, state.anchorZ, ocean);
  const targetY = sample.height + 0.62;
  const spring = 18;
  const damping = Math.exp(-4.6 * dt);
  const horizontalFollow = 1 - Math.exp(-3.2 * dt);

  state.velocity.y += (targetY - state.position.y) * spring * dt;
  state.velocity.y *= damping;
  state.position.y += state.velocity.y * dt;
  state.position.x += (state.anchorX + sample.horizontal.x * 0.36 - state.position.x) * horizontalFollow;
  state.position.z += (state.anchorZ + sample.horizontal.y * 0.36 - state.position.z) * horizontalFollow;
  state.normal = sample.normal;

  return sample;
}
