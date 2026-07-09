export const PRESET_ORDER = Object.freeze(['noon', 'dawn', 'overcast']);

const VECTOR_FIELDS = Object.freeze([
  'skyZenith',
  'skyHorizon',
  'cloudColor',
  'deepColor',
  'shallowColor',
  'foamColor',
  'sunColor',
  'sunDirection'
]);

const NUMBER_FIELDS = Object.freeze([
  'sunIntensity',
  'exposure',
  'roughness',
  'fogDensity',
  'cloudAmount'
]);

function normalize(values) {
  const length = Math.hypot(...values) || 1;
  return values.map((value) => value / length);
}

function definePreset(id, values) {
  const preset = {
    id,
    ...values,
    sunDirection: normalize(values.sunDirection)
  };

  for (const field of VECTOR_FIELDS) {
    Object.freeze(preset[field]);
  }
  return Object.freeze(preset);
}

export const ENVIRONMENT_PRESETS = Object.freeze({
  noon: definePreset('noon', {
    label: '清冽正午',
    skyZenith: [0.055, 0.22, 0.39],
    skyHorizon: [0.56, 0.79, 0.88],
    cloudColor: [0.92, 0.96, 0.98],
    deepColor: [0.008, 0.075, 0.12],
    shallowColor: [0.035, 0.34, 0.42],
    foamColor: [0.86, 0.97, 1],
    sunColor: [1, 0.93, 0.72],
    sunDirection: [0.38, 0.86, 0.34],
    sunIntensity: 1.2,
    exposure: 1.02,
    roughness: 0.24,
    fogDensity: 0.0016,
    cloudAmount: 0.22
  }),
  dawn: definePreset('dawn', {
    label: '低角度晨光',
    skyZenith: [0.075, 0.08, 0.2],
    skyHorizon: [0.95, 0.42, 0.24],
    cloudColor: [0.42, 0.24, 0.3],
    deepColor: [0.012, 0.035, 0.085],
    shallowColor: [0.12, 0.18, 0.25],
    foamColor: [0.98, 0.78, 0.58],
    sunColor: [1, 0.48, 0.2],
    sunDirection: [-0.7, 0.14, -0.7],
    sunIntensity: 1.55,
    exposure: 0.9,
    roughness: 0.19,
    fogDensity: 0.0024,
    cloudAmount: 0.36
  }),
  overcast: definePreset('overcast', {
    label: '银灰阴天',
    skyZenith: [0.25, 0.3, 0.34],
    skyHorizon: [0.61, 0.67, 0.68],
    cloudColor: [0.35, 0.4, 0.42],
    deepColor: [0.025, 0.095, 0.12],
    shallowColor: [0.19, 0.34, 0.37],
    foamColor: [0.8, 0.86, 0.85],
    sunColor: [0.78, 0.84, 0.86],
    sunDirection: [0.28, 0.93, -0.24],
    sunIntensity: 0.34,
    exposure: 0.88,
    roughness: 0.42,
    fogDensity: 0.0036,
    cloudAmount: 0.78
  })
});

function getPreset(id) {
  const preset = ENVIRONMENT_PRESETS[id];
  if (!preset) {
    throw new Error(`Unknown ocean preset: ${id}`);
  }
  return preset;
}

function smoothstep(value) {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function mixNumber(from, to, amount) {
  return from + (to - from) * amount;
}

function mixVector(from, to, amount) {
  return from.map((value, index) => mixNumber(value, to[index], amount));
}

function mixPreset(from, to, amount) {
  const mixed = {
    id: to.id,
    label: to.label
  };

  for (const field of VECTOR_FIELDS) {
    mixed[field] = mixVector(from[field], to[field], amount);
  }
  mixed.sunDirection = normalize(mixed.sunDirection);

  for (const field of NUMBER_FIELDS) {
    mixed[field] = mixNumber(from[field], to[field], amount);
  }

  return mixed;
}

export function createPresetTransition(initialId = 'noon') {
  const preset = getPreset(initialId);
  return {
    activeId: initialId,
    targetId: initialId,
    from: preset,
    to: preset,
    current: preset,
    elapsed: 0,
    duration: 0,
    progress: 1
  };
}

export function selectPreset(state, targetId, duration = 1.8) {
  const target = getPreset(targetId);
  return {
    ...state,
    targetId,
    from: state.current,
    to: target,
    elapsed: 0,
    duration: Math.max(0.001, duration),
    progress: 0
  };
}

export function stepPresetTransition(state, deltaSeconds) {
  if (state.progress >= 1) {
    return state;
  }

  const elapsed = Math.min(state.duration, state.elapsed + Math.max(0, deltaSeconds));
  const progress = Math.min(1, elapsed / state.duration);

  if (progress >= 1) {
    return {
      ...state,
      activeId: state.targetId,
      from: state.to,
      current: state.to,
      elapsed,
      progress: 1
    };
  }

  return {
    ...state,
    current: mixPreset(state.from, state.to, smoothstep(progress)),
    elapsed,
    progress
  };
}
