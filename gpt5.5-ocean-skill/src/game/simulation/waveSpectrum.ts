import {
  MAX_WAVES,
  OCEAN_PRESETS,
  type OceanPreset,
  type OceanState,
  type OceanWave,
  TWO_PI,
} from "./oceanTypes";

const WAVELENGTH_FACTORS = [0.16, 0.23, 0.32, 0.46, 0.65, 0.9, 1.18, 1.52, 1.95, 2.52, 3.18, 4.05];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalize2(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function seededNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function piersonMoskowitzWeight(omega: number, omegaPeak: number): number {
  const ratio = omegaPeak / omega;
  return Math.pow(omega, -5) * Math.exp(-1.25 * ratio * ratio * ratio * ratio);
}

export function createOceanState(preset: OceanPreset = "windy"): OceanState {
  const state: OceanState = {
    time: 0,
    gravity: 9.81,
    windDirection: (-35 * Math.PI) / 180,
    preset,
    waves: [],
    ...OCEAN_PRESETS[preset],
  };
  state.waves = buildWaveSpectrum(state);
  return state;
}

export function applyOceanPreset(state: OceanState, preset: OceanPreset): void {
  Object.assign(state, OCEAN_PRESETS[preset]);
  state.preset = preset;
  state.waves = buildWaveSpectrum(state);
}

export function rebuildWaveSpectrum(state: OceanState): void {
  state.waves = buildWaveSpectrum(state);
}

export function buildWaveSpectrum(state: Pick<OceanState, "gravity" | "windSpeed" | "windDirection">): OceanWave[] {
  const windSpeed = clamp(state.windSpeed, 2, 28);
  const gravity = state.gravity;
  const omegaPeak = (0.877 * gravity) / windSpeed;
  const peakWavelength = clamp((TWO_PI * gravity) / (omegaPeak * omegaPeak), 14, 360);
  const spread = 0.84 - clamp((windSpeed - 3) / 23, 0, 1) * 0.42;

  const weighted = WAVELENGTH_FACTORS.map((factor, index) => {
    const wavelength = clamp(peakWavelength * factor, 3.8, 430);
    const k = TWO_PI / wavelength;
    const omega = Math.sqrt(gravity * k);
    const spectralWeight = piersonMoskowitzWeight(omega, omegaPeak);
    const shortWaveBoost = 1 + clamp((16 - wavelength) / 28, 0, 0.45);
    const noise = 0.86 + seededNoise(index + windSpeed * 0.37) * 0.28;

    return {
      factor,
      wavelength,
      weight: spectralWeight * shortWaveBoost * noise,
      noise,
      index,
    };
  });

  const weightEnergy = Math.sqrt(weighted.reduce((sum, item) => sum + item.weight * item.weight, 0)) || 1;
  const significantHeight = clamp(0.024 * windSpeed * windSpeed, 0.34, 10.2);

  return weighted.slice(0, MAX_WAVES).map((item) => {
    const directionNoise = seededNoise(item.index * 5.19 + windSpeed);
    const shortWaveSpread = clamp((24 - item.wavelength) / 44, 0, 0.45);
    const offset = (directionNoise - 0.5) * spread * (0.6 + shortWaveSpread);
    const directionAngle = state.windDirection + offset;
    const direction = normalize2(Math.cos(directionAngle), Math.sin(directionAngle));
    const amplitude = (significantHeight * item.weight) / (2.16 * weightEnergy);
    const shortness = clamp((18 - item.wavelength) / 24, 0, 1);
    const steepness = clamp(0.36 + windSpeed * 0.03 + shortness * 0.3 + item.noise * 0.11, 0.3, 1.12);

    return {
      direction,
      wavelength: item.wavelength,
      amplitude,
      steepness,
      phase: seededNoise(item.index * 9.71 + 4.3) * TWO_PI,
    };
  });
}
