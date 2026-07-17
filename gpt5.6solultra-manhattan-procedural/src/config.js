export const PROJECT = Object.freeze({
  name: 'Manhattan Storm Shift',
  version: '1.0.0',
  defaultSeed: 2026,
  latitude: 40.7128,
  longitude: -74.006,
  dayOfYear: 295,
  fixedStep: 1 / 60,
});

export const WORLD = Object.freeze({
  minX: -180,
  maxX: 180,
  minZ: -260,
  maxZ: 260,
  seaLevel: -3.2,
  roadY: 0.12,
  sidewalkY: 0.28,
  park: Object.freeze({ minX: -62, maxX: 62, minZ: 18, maxZ: 154 }),
  eastRiver: Object.freeze({ bankX: 188, farX: 330 }),
});

export const WEATHER_KINDS = Object.freeze([
  'clear',
  'cloudy',
  'fog',
  'rain',
  'storm',
  'snow',
]);

export const WEATHER_LABELS = Object.freeze({
  clear: '晴朗',
  cloudy: '多云',
  fog: '晨雾',
  rain: '降雨',
  storm: '雷暴',
  snow: '降雪',
});

export const PALETTE = Object.freeze({
  ink: 0x071116,
  asphalt: 0x14191c,
  limestone: 0xb8aa8e,
  brick: 0x6d342d,
  glass: 0x315366,
  copper: 0x718f80,
  park: 0x294a35,
  water: 0x173f55,
  taxi: 0xf2b93b,
  signal: 0xe9573f,
  snow: 0xdde5e5,
});

export const tagBenchRole = (object, role, details = {}) => {
  object.userData.benchRole = role;
  Object.assign(object.userData, details);
  return object;
};
