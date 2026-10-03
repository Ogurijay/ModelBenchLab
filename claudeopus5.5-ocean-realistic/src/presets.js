// 海况预设：海（波谱）、天（太阳/云）、水体与雾一起切换。

export const PRESETS = {
  calm: {
    label: '平静晨海',
    sea: { windSpeed: 3.5, fetch: 40, windDir: 15, swellHeight: 0.45, swellPeriod: 9, swellDir: 50, choppiness: 0.6 },
    sky: { elevation: 32, azimuth: 120, coverage: 0.18, storm: 0 },
    water: { fog: 1 / 14000, rain: 0, exposure: 0.62 }
  },
  breeze: {
    label: '晴朗和风',
    sea: { windSpeed: 9, fetch: 150, windDir: 25, swellHeight: 0.6, swellPeriod: 11, swellDir: 70, choppiness: 0.9 },
    sky: { elevation: 14, azimuth: 205, coverage: 0.42, storm: 0 },
    water: { fog: 1 / 9000, rain: 0, exposure: 0.62 }
  },
  sunset: {
    label: '落日长涌',
    sea: { windSpeed: 6, fetch: 120, windDir: 200, swellHeight: 1.3, swellPeriod: 13, swellDir: 175, choppiness: 0.8 },
    sky: { elevation: 2.2, azimuth: 188, coverage: 0.36, storm: 0 },
    water: { fog: 1 / 8000, rain: 0, exposure: 0.85 }
  },
  rough: {
    label: '大浪强风',
    sea: { windSpeed: 13, fetch: 200, windDir: 35, swellHeight: 1.4, swellPeriod: 12, swellDir: 60, choppiness: 1.05 },
    sky: { elevation: 24, azimuth: 230, coverage: 0.66, storm: 0.25 },
    water: { fog: 1 / 5000, rain: 0, exposure: 0.7 }
  },
  storm: {
    label: '风暴',
    sea: { windSpeed: 19, fetch: 250, windDir: 45, swellHeight: 2.4, swellPeriod: 13, swellDir: 30, choppiness: 1.2 },
    sky: { elevation: 18, azimuth: 250, coverage: 0.97, storm: 1 },
    water: { fog: 1 / 1600, rain: 1, exposure: 1.05 }
  }
};

export const PRESET_ORDER = ['calm', 'breeze', 'sunset', 'rough', 'storm'];
