import { clamp, wrapDegrees } from '../ocean/waves.js';
import { createRainLayerConfig } from './effects.js';

export const STORM_PROFILE_KEYS = ['physical', 'cinematic', 'extreme'];

export const STORM_PROFILES = {
  physical: {
    label: '物理风暴',
    description: '克制、可信的暴雨、海浪、闪电和海龙卷。',
    windSpeed: 23,
    windDirection: 42,
    waveScale: 1,
    choppiness: 0.72,
    foamAmount: 0.64,
    rainDensity: 0.46,
    lightningFrequency: 0.24,
    lightningEnergy: 0.58,
    lightningDuration: 0.12,
    cloudDarkness: 0.48,
    fogDensity: 0.011,
    waterSpoutRadius: 6.2,
    waterSpoutHeight: 92,
    waterSpoutOpacity: 0.48,
    sprayRadius: 11
  },
  cinematic: {
    label: '电影风暴',
    description: '更密的暴雨和更强的闪光，但仍与海况参数联动。',
    windSpeed: 29,
    windDirection: 35,
    waveScale: 1.22,
    choppiness: 0.82,
    foamAmount: 0.74,
    rainDensity: 0.68,
    lightningFrequency: 0.43,
    lightningEnergy: 0.88,
    lightningDuration: 0.18,
    cloudDarkness: 0.67,
    fogDensity: 0.016,
    waterSpoutRadius: 10.8,
    waterSpoutHeight: 128,
    waterSpoutOpacity: 0.66,
    sprayRadius: 17.5
  },
  extreme: {
    label: '极端灾害',
    description: '灾害级展示效果，仍由同一套风暴物理参数驱动。',
    windSpeed: 38,
    windDirection: 28,
    waveScale: 1.55,
    choppiness: 0.96,
    foamAmount: 0.88,
    rainDensity: 0.92,
    lightningFrequency: 0.68,
    lightningEnergy: 1,
    lightningDuration: 0.22,
    cloudDarkness: 0.86,
    fogDensity: 0.024,
    waterSpoutRadius: 16.5,
    waterSpoutHeight: 166,
    waterSpoutOpacity: 0.84,
    sprayRadius: 28
  }
};

export const DEFAULT_STORM_SETTINGS = {
  profile: 'cinematic',
  weatherIntensity: 0.85,
  seed: 1337
};

function profileFor(profile) {
  return STORM_PROFILES[profile] ? profile : 'physical';
}

function hash(value) {
  return Math.sin(value * 127.1 + 311.7) * 43758.5453123 % 1;
}

function positiveHash(value) {
  return Math.abs(hash(value));
}

export function resolveStormSettings(settings = {}) {
  const profile = profileFor(settings.profile ?? DEFAULT_STORM_SETTINGS.profile);
  const base = STORM_PROFILES[profile];
  const weatherIntensity = clamp(
    settings.weatherIntensity ?? DEFAULT_STORM_SETTINGS.weatherIntensity,
    0,
    1
  );
  const energy = 0.38 + weatherIntensity * 0.62;
  const rainDensity = clamp(settings.rainDensity ?? base.rainDensity * energy, 0, 1);
  const rainVisibility = clamp(settings.rainVisibility ?? 1, 0.25, 2);
  const waterSpoutScale = clamp(settings.waterSpoutScale ?? 1, 0.35, 3.2);
  const waterSpoutIntensity = clamp(settings.waterSpoutIntensity ?? 1, 0, 1.8);
  const baseSpoutRadius = base.waterSpoutRadius * (0.65 + weatherIntensity * 0.35);
  const baseSpoutHeight = base.waterSpoutHeight * (0.78 + weatherIntensity * 0.22);
  const baseSpoutOpacity = clamp(base.waterSpoutOpacity * energy, 0, 1);
  const baseSprayRadius = base.sprayRadius * (0.68 + weatherIntensity * 0.32);

  return {
    ...base,
    ...settings,
    profile,
    profileLabel: base.label,
    profileDescription: base.description,
    weatherIntensity,
    seed: Math.floor(settings.seed ?? DEFAULT_STORM_SETTINGS.seed),
    windSpeed: clamp(settings.windSpeed ?? base.windSpeed * energy, 2, 42),
    windDirection: wrapDegrees(settings.windDirection ?? base.windDirection),
    waveScale: clamp(settings.waveScale ?? base.waveScale * (0.72 + weatherIntensity * 0.28), 0.2, 2.5),
    choppiness: clamp(settings.choppiness ?? base.choppiness * (0.7 + weatherIntensity * 0.3), 0, 1),
    foamAmount: clamp(settings.foamAmount ?? base.foamAmount * (0.7 + weatherIntensity * 0.3), 0, 1),
    rainDensity,
    rainVisibility,
    lightningFrequency: clamp(settings.lightningFrequency ?? base.lightningFrequency * energy, 0.03, 1.35),
    lightningEnergy: clamp(settings.lightningEnergy ?? base.lightningEnergy * (0.55 + weatherIntensity * 0.45), 0, 1),
    lightningDuration: base.lightningDuration,
    cloudDarkness: clamp(settings.cloudDarkness ?? base.cloudDarkness * (0.72 + weatherIntensity * 0.28), 0, 1),
    fogDensity: clamp(settings.fogDensity ?? base.fogDensity * (0.75 + weatherIntensity * 0.25), 0.001, 0.04),
    waterSpoutScale,
    waterSpoutIntensity,
    waterSpoutRadius: clamp(baseSpoutRadius * waterSpoutScale, 1, 42),
    waterSpoutHeight: clamp(baseSpoutHeight * (0.78 + waterSpoutScale * 0.22), 36, 220),
    waterSpoutOpacity: clamp(baseSpoutOpacity * waterSpoutIntensity, 0, 1),
    sprayRadius: clamp(baseSprayRadius * (0.86 + waterSpoutScale * 0.24), 3, 62)
  };
}

export function lightningPulseAt(time, stormSettings = DEFAULT_STORM_SETTINGS) {
  const settings = resolveStormSettings(stormSettings);
  const frequency = Math.max(0.03, settings.lightningFrequency);
  const period = 1 / frequency;
  const cycle = Math.floor(time / period);
  const local = (time - cycle * period) / period;
  const jitter = (positiveHash(cycle + settings.seed * 0.013) - 0.5) * 0.28;
  const strikeAt = clamp(0.42 + jitter, 0.18, 0.78);
  const width = settings.lightningDuration;
  const distance = Math.abs(local - strikeAt);

  if (distance > width) {
    return 0;
  }

  const envelope = Math.pow(1 - distance / width, 1.7);
  const flicker = 0.82 + 0.18 * Math.sin((local - strikeAt) * Math.PI * 44);
  return clamp(envelope * flicker * settings.lightningEnergy, 0, 1);
}

export function computeStormRenderState(stormSettings = DEFAULT_STORM_SETTINGS, time = 0) {
  const settings = resolveStormSettings(stormSettings);
  const lightningFlash = lightningPulseAt(time, settings);
  const windRad = (settings.windDirection * Math.PI) / 180;
  const directionX = Math.cos(windRad);
  const directionZ = Math.sin(windRad);
  const crossX = Math.cos(windRad + Math.PI * 0.5);
  const crossZ = Math.sin(windRad + Math.PI * 0.5);
  const trackLength = 58 + settings.weatherIntensity * 24 + settings.windSpeed * 0.55;
  const originX = Math.cos(windRad + Math.PI * 0.62) * 22;
  const originZ = Math.sin(windRad + Math.PI * 0.62) * 14 - 38;
  const pathCycle = (time * (0.022 + settings.windSpeed * 0.0009) + settings.seed * 0.017) % 1;
  const pathProgress = pathCycle < 0.5 ? pathCycle * 2 : 2 - pathCycle * 2;
  const trackOffset = (pathProgress - 0.5) * trackLength;
  const meander =
    Math.sin(time * 0.21 + settings.seed * 0.33) * 6.2 +
    Math.sin(time * 0.07 + settings.seed * 0.91) * 3.8;
  const spoutX = originX + directionX * trackOffset + crossX * meander;
  const spoutZ = originZ + directionZ * trackOffset + crossZ * meander * 0.75;
  const pathStartX = originX - directionX * trackLength * 0.5;
  const pathStartZ = originZ - directionZ * trackLength * 0.5;
  const pathEndX = originX + directionX * trackLength * 0.5;
  const pathEndZ = originZ + directionZ * trackLength * 0.5;
  const rain = createRainLayerConfig({
    rainDensity: settings.rainDensity,
    windSpeed: settings.windSpeed,
    rainVisibility: settings.rainVisibility
  });
  const rainOpacity = clamp(
    (settings.rainDensity * 0.95 + lightningFlash * 0.08) * settings.rainVisibility,
    0,
    1
  );
  const rainVeilOpacity = clamp(rainOpacity * (0.24 + settings.rainDensity * 0.52), 0, 0.92);

  return {
    profile: settings.profile,
    profileLabel: settings.profileLabel,
    rainOpacity,
    rain: {
      ...rain,
      nearCount: rain.near.count,
      midCount: rain.mid.count,
      farCount: rain.far.count,
      splashCount: rain.splash.count
    },
    rainDensity: settings.rainDensity,
    rainVisibility: settings.rainVisibility,
    rainSpeed: 24 + settings.windSpeed * 1.18 + settings.rainDensity * 8,
    rainSlant: clamp(0.18 + settings.windSpeed / 82, 0.1, 0.72),
    rainVeilOpacity,
    cloudDarkness: clamp(settings.cloudDarkness + lightningFlash * 0.08, 0, 1),
    skyFlash: lightningFlash,
    lightningFlash,
    lightning: {
      branchCount: Math.round(8 + settings.lightningEnergy * 12),
      opacity: clamp(lightningFlash * 1.18, 0, 1),
      glow: clamp(lightningFlash * 1.4, 0, 1)
    },
    fogDensity: settings.fogDensity,
    foamBoost: clamp(settings.foamAmount * (0.86 + settings.rainDensity * 0.12) + settings.rainDensity * 0.08 + lightningFlash * 0.08, 0, 1),
    waterSpout: {
      visible: settings.waterSpoutOpacity > 0.03,
      opacity: clamp(settings.waterSpoutOpacity + lightningFlash * 0.06, 0, 1),
      particleCount: Math.round(3600 + settings.waterSpoutOpacity * 3000),
      radius: settings.waterSpoutRadius,
      height: settings.waterSpoutHeight,
      twist: time * (0.42 + settings.weatherIntensity * 0.44),
      x: spoutX,
      z: spoutZ,
      directionX,
      directionZ,
      pathProgress,
      pathStartX,
      pathStartZ,
      pathEndX,
      pathEndZ,
      wakeLength: settings.sprayRadius * 3.6 + settings.windSpeed * 1.35 + settings.waterSpoutRadius * 1.8
    },
    sprayRadius: settings.sprayRadius,
    sprayOpacity: clamp(0.24 + settings.rainDensity * 0.42 + lightningFlash * 0.12, 0, 1)
  };
}

const SEA_STATES = [
  { max: 3.4, label: '镜面微波' },
  { max: 8, label: '轻风细浪' },
  { max: 13.8, label: '风浪增强' },
  { max: 20.8, label: '粗糙涌浪' },
  { max: 28.5, label: '风暴海况' },
  { max: 42, label: '猛烈风暴' },
  { max: Infinity, label: '极端海况' }
];

export function seaStateLabel(windSpeed) {
  const speed = Math.max(0, Number(windSpeed) || 0);
  for (let level = 0; level < SEA_STATES.length; level += 1) {
    if (speed <= SEA_STATES[level].max) {
      return { level, label: SEA_STATES[level].label };
    }
  }
  return { level: SEA_STATES.length - 1, label: SEA_STATES[SEA_STATES.length - 1].label };
}
