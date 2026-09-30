const VECTOR_FIELDS = Object.freeze([
  'skyZenith',
  'skyHorizon',
  'cloudColor',
  'deepColor',
  'shallowColor',
  'foamColor',
  'sunColor'
]);

const NUMBER_FIELDS = Object.freeze([
  'sunIntensity',
  'exposure',
  'roughness',
  'fogDensity',
  'cloudAmount'
]);

const STORM_TARGET = Object.freeze({
  skyZenith: Object.freeze([0.018, 0.026, 0.04]),
  skyHorizon: Object.freeze([0.11, 0.16, 0.19]),
  cloudColor: Object.freeze([0.055, 0.068, 0.078]),
  deepColor: Object.freeze([0.005, 0.022, 0.032]),
  shallowColor: Object.freeze([0.028, 0.082, 0.098]),
  foamColor: Object.freeze([0.72, 0.79, 0.8]),
  sunColor: Object.freeze([0.48, 0.58, 0.66]),
  sunIntensity: 0.1,
  exposure: 0.72,
  roughness: 0.53,
  fogDensity: 0.0085,
  cloudAmount: 0.96
});

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value) {
  const amount = clamp01(value);
  return amount * amount * (3 - 2 * amount);
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

function mixVector(from, to, amount) {
  return from.map((value, index) => mix(value, to[index], amount));
}

export function createStormState() {
  return {
    enabled: false,
    targetEnabled: false,
    intensity: 0,
    from: 0,
    to: 0,
    elapsed: 0,
    duration: 0,
    progress: 1
  };
}

export function setStormEnabled(state, enabled, duration = 2.4) {
  return {
    ...state,
    targetEnabled: Boolean(enabled),
    from: state.intensity,
    to: enabled ? 1 : 0,
    elapsed: 0,
    duration: Math.max(0.001, duration),
    progress: 0
  };
}

export function stepStormState(state, deltaSeconds) {
  if (state.progress >= 1) {
    return state;
  }

  const elapsed = Math.min(state.duration, state.elapsed + Math.max(0, deltaSeconds));
  const progress = Math.min(1, elapsed / state.duration);

  if (progress >= 1) {
    return {
      ...state,
      enabled: state.targetEnabled,
      intensity: state.to,
      from: state.to,
      elapsed,
      progress: 1
    };
  }

  return {
    ...state,
    intensity: mix(state.from, state.to, smoothstep(progress)),
    elapsed,
    progress
  };
}

export function applyStormOverlay(environment, intensity) {
  const amount = clamp01(intensity);
  const result = {
    ...environment,
    sunDirection: [...environment.sunDirection]
  };

  for (const field of VECTOR_FIELDS) {
    result[field] = mixVector(environment[field], STORM_TARGET[field], amount);
  }

  for (const field of NUMBER_FIELDS) {
    result[field] = mix(environment[field], STORM_TARGET[field], amount);
  }

  return result;
}
