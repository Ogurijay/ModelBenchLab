/** 五档写实海况。时刻用 0–24 小时，方向用度，0° 指向 +X，90° 指向 +Z。 */
export const PRESETS = [
  {
    key: '1',
    id: 'glass',
    name: '镜海',
    windSpeed: 2.0,
    windDeg: 18,
    steepness: 0.2,
    swellHeight: 0.1,
    swellDeg: 78,
    hour: 6.85,
    clouds: 0.1,
    exposure: 1.02
  },
  {
    key: '2',
    id: 'breeze',
    name: '信风',
    windSpeed: 6.4,
    windDeg: 14,
    steepness: 0.48,
    swellHeight: 0.26,
    swellDeg: 74,
    hour: 10.6,
    clouds: 0.24,
    exposure: 1.0
  },
  {
    key: '3',
    id: 'gold',
    name: '金潮',
    windSpeed: 9.4,
    windDeg: 38,
    steepness: 0.7,
    swellHeight: 0.62,
    swellDeg: 108,
    hour: 17.35,
    clouds: 0.32,
    exposure: 1.08
  },
  {
    key: '4',
    id: 'run',
    name: '长浪',
    windSpeed: 12.6,
    windDeg: 46,
    steepness: 0.74,
    swellHeight: 1.0,
    swellDeg: 118,
    hour: 15.4,
    clouds: 0.52,
    exposure: 0.98
  },
  {
    key: '5',
    id: 'gale',
    name: '烈风',
    windSpeed: 18.2,
    windDeg: 58,
    steepness: 0.86,
    swellHeight: 1.4,
    swellDeg: 138,
    hour: 17.85,
    clouds: 0.8,
    exposure: 0.84
  }
];

const NAMES = ['无风', '软风', '轻风', '微风', '和风', '清风', '强风', '疾风', '大风', '烈风', '狂风', '暴风', '飓风'];
const LIMITS = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7, 99];

export function beaufort(windSpeed) {
  let level = LIMITS.findIndex((limit) => windSpeed < limit);
  if (level < 0) level = 12;
  return { level, name: NAMES[level] };
}

export function formatHour(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
