const TAU = Math.PI * 2;
const GRAVITY = 9.81;

export const MAX_WAVES = 12;

export const DEFAULT_SPECTRUM_SETTINGS = Object.freeze({
  seed: 5601,
  windDirection: 28,
  windSpeed: 16,
  waveScale: 1,
  choppiness: 0.78
});

const WAVELENGTH_RATIOS = Object.freeze([
  1.35, 1, 0.78, 0.6, 0.46, 0.35, 0.26, 0.19, 0.14, 0.1, 0.072, 0.052
]);

const ENERGY_WEIGHTS = Object.freeze([
  0.34, 0.4, 0.36, 0.31, 0.27, 0.23, 0.2, 0.17, 0.14, 0.115, 0.09, 0.07
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizedVector(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

export function createWaveSpectrum(options = {}) {
  const settings = { ...DEFAULT_SPECTRUM_SETTINGS, ...options };
  const random = mulberry32(settings.seed);
  const windRadians = (settings.windDirection * Math.PI) / 180;
  const dominantWavelength = clamp(
    ((settings.windSpeed * settings.windSpeed * TAU) / GRAVITY) * 0.48,
    42,
    190
  );
  const baseSlope = 0.038 + clamp(settings.windSpeed / 40, 0, 1) * 0.018;

  const waves = WAVELENGTH_RATIOS.map((ratio, index) => {
    const wavelength = Math.max(
      2.4,
      dominantWavelength * ratio * (0.94 + random() * 0.12)
    );
    const k = TAU / wavelength;
    const spread = (8 + (index / (MAX_WAVES - 1)) * 42) * (Math.PI / 180);
    const crossSea = index > 6 ? Math.sin(index * 2.399) * spread * 0.28 : 0;
    const angle = windRadians + (random() * 2 - 1) * spread + crossSea;
    const amplitude =
      wavelength *
      baseSlope *
      ENERGY_WEIGHTS[index] *
      settings.waveScale *
      (0.88 + random() * 0.24);

    return {
      index,
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      wavelength,
      amplitude,
      k,
      omega: Math.sqrt(GRAVITY * k),
      phase: random() * TAU,
      q: 0
    };
  });

  const rawBudget = waves.reduce((sum, wave) => sum + wave.k * wave.amplitude, 0);
  const sharedQ = rawBudget > 0
    ? Math.min(0.98, clamp(settings.choppiness, 0, 0.82) / rawBudget)
    : 0;

  return waves.map((wave) => ({ ...wave, q: sharedQ }));
}

export function steepnessBudget(waves) {
  return waves.reduce(
    (sum, wave) => sum + wave.q * wave.k * wave.amplitude,
    0
  );
}

export function sampleWaveSurface({ x, z, time, waves, amplitudeScale = 1 }) {
  const safeAmplitudeScale = Number.isFinite(amplitudeScale)
    ? clamp(amplitudeScale, 0.1, 1.4)
    : 1;
  let height = 0;
  let horizontalX = 0;
  let horizontalZ = 0;
  let crest = 0;

  const tangentX = { x: 1, y: 0, z: 0 };
  const tangentZ = { x: 0, y: 0, z: 1 };

  for (const wave of waves) {
    const phase =
      wave.k * (wave.dirX * x + wave.dirZ * z) -
      wave.omega * time +
      wave.phase;
    const sine = Math.sin(phase);
    const cosine = Math.cos(phase);
    const verticalAmplitude = wave.amplitude * safeAmplitudeScale;
    const horizontalDifferential = wave.k * wave.amplitude;
    const verticalDifferential = horizontalDifferential * safeAmplitudeScale;
    const horizontal = wave.q * wave.amplitude * cosine;

    height += verticalAmplitude * sine;
    horizontalX += horizontal * wave.dirX;
    horizontalZ += horizontal * wave.dirZ;
    crest += wave.q * horizontalDifferential * sine;

    tangentX.x -= wave.q * horizontalDifferential * wave.dirX * wave.dirX * sine;
    tangentX.y += verticalDifferential * wave.dirX * cosine;
    tangentX.z -= wave.q * horizontalDifferential * wave.dirX * wave.dirZ * sine;

    tangentZ.x -= wave.q * horizontalDifferential * wave.dirX * wave.dirZ * sine;
    tangentZ.y += verticalDifferential * wave.dirZ * cosine;
    tangentZ.z -= wave.q * horizontalDifferential * wave.dirZ * wave.dirZ * sine;
  }

  const normal = normalizedVector(
    tangentZ.y * tangentX.z - tangentZ.z * tangentX.y,
    tangentZ.z * tangentX.x - tangentZ.x * tangentX.z,
    tangentZ.x * tangentX.y - tangentZ.y * tangentX.x
  );

  return {
    height,
    horizontalX,
    horizontalZ,
    crest,
    slope: Math.hypot(normal.x, normal.z) / Math.max(0.001, normal.y),
    normal
  };
}

export function getQualityProfile({
  width = 1280,
  devicePixelRatio = 1,
  coarsePointer = false
} = {}) {
  const mobile = coarsePointer || width < 760;
  const profile = mobile
    ? { name: 'mobile', segments: 224, maxPixelRatio: 1.25 }
    : { name: 'high', segments: 384, maxPixelRatio: 1.75 };

  return {
    ...profile,
    initialPixelRatio: Math.min(devicePixelRatio, profile.maxPixelRatio)
  };
}
