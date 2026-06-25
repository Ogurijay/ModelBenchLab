const GRAVITY = 9.81;

export const MAX_WAVES = 12;

const SETTINGS_LIMITS = {
  windSpeed: [2, 42],
  waveScale: [0.2, 2.5],
  choppiness: [0, 1],
  foamAmount: [0, 1]
};

export const DEFAULT_OCEAN_SETTINGS = {
  profile: 'cinematic',
  weatherIntensity: 0.85,
  windSpeed: 29,
  windDirection: 35,
  waveScale: 1.2,
  choppiness: 0.82,
  foamAmount: 0.72,
  quality: 'high',
  seed: 1337
};

export function clamp(value, min, max) {
  const n = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

export function wrapDegrees(degrees) {
  const n = Number.isFinite(Number(degrees)) ? Number(degrees) : 0;
  return ((n % 360) + 360) % 360;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clampOceanSettings(settings = {}) {
  const merged = { ...DEFAULT_OCEAN_SETTINGS, ...settings };

  return {
    ...merged,
    windSpeed: clamp(merged.windSpeed, ...SETTINGS_LIMITS.windSpeed),
    windDirection: wrapDegrees(merged.windDirection),
    waveScale: clamp(merged.waveScale, ...SETTINGS_LIMITS.waveScale),
    choppiness: clamp(merged.choppiness, ...SETTINGS_LIMITS.choppiness),
    foamAmount: clamp(merged.foamAmount, ...SETTINGS_LIMITS.foamAmount)
  };
}

export function createWaveSet(settings = {}) {
  const merged = clampOceanSettings(settings);
  const count = Math.max(1, Math.min(MAX_WAVES, Math.floor(settings.waveCount ?? MAX_WAVES)));
  const rand = mulberry32(settings.seed ?? merged.seed ?? DEFAULT_OCEAN_SETTINGS.seed);
  const windRad = (merged.windDirection * Math.PI) / 180;

  // Deep-water gravity-wave approximation: stronger wind supports longer dominant waves.
  const dominantLength = Math.min(
    420,
    Math.max(18, (0.82 * merged.windSpeed * merged.windSpeed * Math.PI * 2) / GRAVITY)
  );
  const slope = 0.028 + 0.04 * Math.min(1, merged.windSpeed / SETTINGS_LIMITS.windSpeed[1]);

  const waves = [];
  for (let i = 0; i < count; i += 1) {
    const wavelength = dominantLength * Math.pow(0.72, i) * (0.88 + rand() * 0.24);
    const k = (Math.PI * 2) / wavelength;
    const spread = (Math.PI / 4.1) * (0.35 + (i / count) * 1.05);
    const angle = windRad + (rand() * 2 - 1) * spread;
    const amplitude =
      ((slope * wavelength) / (Math.PI * 2)) *
      (0.72 + rand() * 0.52) *
      merged.waveScale *
      Math.pow(0.94, i);

    waves.push({
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      amplitude,
      wavelength,
      k,
      omega: Math.sqrt(GRAVITY * k),
      phase: rand() * Math.PI * 2,
      steepness: 0
    });
  }

  const rawBudget = waves.reduce((sum, wave) => sum + wave.k * wave.amplitude, 0);
  const q = rawBudget > 0 ? Math.min(1, merged.choppiness) / rawBudget : 0;
  for (const wave of waves) {
    wave.steepness = Math.min(1, q);
  }

  return waves;
}

export function sampleWaveHeight({ x, z, time, waves }) {
  return waves.reduce((height, wave) => {
    const phase = wave.k * (wave.dirX * x + wave.dirZ * z) - wave.omega * time + wave.phase;
    return height + Math.sin(phase) * wave.amplitude;
  }, 0);
}

export function sumAmplitude(waves) {
  return waves.reduce((sum, wave) => sum + wave.amplitude, 0);
}

export function steepnessBudget(waves) {
  return waves.reduce((sum, wave) => sum + wave.steepness * wave.k * wave.amplitude, 0);
}

export function getOceanGeometryConfig({ quality = 'high' } = {}) {
  const presets = {
    low: { width: 540, depth: 540, segments: 192 },
    medium: { width: 600, depth: 600, segments: 320 },
    high: { width: 720, depth: 720, segments: 560 }
  };
  const selected = presets[quality] ?? presets.high;

  return {
    ...selected,
    vertexCount: (selected.segments + 1) * (selected.segments + 1)
  };
}
