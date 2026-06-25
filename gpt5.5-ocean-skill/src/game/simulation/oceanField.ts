import type { OceanState, Vec2, Vec3 } from "./oceanTypes";
import { TWO_PI } from "./oceanTypes";

export interface OceanSample {
  height: number;
  horizontal: Vec2;
  normal: Vec3;
  foam: number;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalize3(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function sampleOceanField(x: number, z: number, state: OceanState): OceanSample {
  const activeWaveCount = Math.max(state.waves.length, 1);
  const horizontal = { x: 0, y: 0 };
  const dPdx = { x: 1, y: 0, z: 0 };
  const dPdz = { x: 0, y: 0, z: 1 };
  let height = 0;
  let foamEnergy = 0;

  for (const wave of state.waves) {
    const k = TWO_PI / wave.wavelength;
    const omega = Math.sqrt(state.gravity * k);
    const amplitude = wave.amplitude * state.swell;
    const steepness = wave.steepness * state.choppiness;
    const phase = k * (wave.direction.x * x + wave.direction.y * z) - omega * state.time + wave.phase;
    const sinPhase = Math.sin(phase);
    const cosPhase = Math.cos(phase);
    const q = Math.min(steepness / Math.max(k * amplitude * activeWaveCount, 0.0001), 1.55);

    horizontal.x += q * amplitude * wave.direction.x * cosPhase;
    horizontal.y += q * amplitude * wave.direction.y * cosPhase;
    height += amplitude * sinPhase;

    dPdx.x += -q * amplitude * k * wave.direction.x * wave.direction.x * sinPhase;
    dPdx.y += amplitude * k * wave.direction.x * cosPhase;
    dPdx.z += -q * amplitude * k * wave.direction.x * wave.direction.y * sinPhase;

    dPdz.x += -q * amplitude * k * wave.direction.x * wave.direction.y * sinPhase;
    dPdz.y += amplitude * k * wave.direction.y * cosPhase;
    dPdz.z += -q * amplitude * k * wave.direction.y * wave.direction.y * sinPhase;

    const crest = Math.min(Math.max((sinPhase - 0.72) / 0.26, 0), 1);
    foamEnergy += crest * Math.min(steepness, 1) * amplitude;
  }

  let normal = normalize3(cross(dPdz, dPdx));
  if (normal.y < 0) {
    normal = { x: -normal.x, y: -normal.y, z: -normal.z };
  }

  const slopeFoam = Math.pow(Math.max(0, 1 - normal.y), 1.35);
  const foam = clamp01((foamEnergy * 0.23 + slopeFoam) * state.foam);

  return {
    height,
    horizontal,
    normal,
    foam,
  };
}
