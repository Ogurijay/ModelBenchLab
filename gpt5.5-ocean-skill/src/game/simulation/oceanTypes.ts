export const MAX_WAVES = 12;
export const TWO_PI = Math.PI * 2;

export type OceanPreset = "calm" | "windy" | "storm";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface OceanWave {
  direction: Vec2;
  wavelength: number;
  amplitude: number;
  steepness: number;
  phase: number;
}

export interface OceanState {
  time: number;
  gravity: number;
  windSpeed: number;
  windDirection: number;
  swell: number;
  choppiness: number;
  foam: number;
  timeScale: number;
  preset: OceanPreset;
  waves: OceanWave[];
}

export interface OceanPresetSettings {
  windSpeed: number;
  swell: number;
  choppiness: number;
  foam: number;
  timeScale: number;
}

export const OCEAN_PRESETS: Record<OceanPreset, OceanPresetSettings> = {
  calm: {
    windSpeed: 7,
    swell: 0.82,
    choppiness: 0.72,
    foam: 0.18,
    timeScale: 0.9,
  },
  windy: {
    windSpeed: 16.2,
    swell: 1.38,
    choppiness: 1.24,
    foam: 0.72,
    timeScale: 1.06,
  },
  storm: {
    windSpeed: 24,
    swell: 2.1,
    choppiness: 1.5,
    foam: 0.94,
    timeScale: 1.12,
  },
};
