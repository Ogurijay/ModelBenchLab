// 情绪色彩表：每章按时间段定主色，颜色本身就是叙事。
export const PALETTES = {
  dawn: { // 黎明蓝调：孤独、重复（1、终章开头、尾声）
    label: '黎明', skyTop: '#2B3A67', skyMid: '#5f6fa3', horizon: '#f2b8c6', glow: '#ffd6e0',
    fog: '#7a82aa', fogDensity: 0.0016, sun: '#d9ddff', sunI: 1.15, sunElev: 6, sunAz: 110,
    hemiSky: '#8a98d0', hemiGround: '#2e2a3c', hemiI: 0.9, lamps: 0.6, headlights: true,
    trails: false, saturation: -0.05, contrast: 0.05, bloom: 0.55, grain: 0.04, vignette: 0.35,
    stars: 0.15, clouds: 0.45, cloudLit: '#f7c9d4', cloudDark: '#55608f', mountain: ['#45507c', '#5d6894', '#8a8fb5']
  },
  noon: { // 盛夏正午：青春、心动（2、7）
    label: '盛夏', skyTop: '#2f8fe0', skyMid: '#4FB3FF', horizon: '#eaf7ff', glow: '#ffffff',
    fog: '#cfe9ff', fogDensity: 0.0009, sun: '#fff7e6', sunI: 2.5, sunElev: 62, sunAz: 150,
    hemiSky: '#bfe4ff', hemiGround: '#6f8a4f', hemiI: 1.15, lamps: 0, headlights: false,
    trails: false, saturation: 0.18, contrast: 0.08, bloom: 0.5, grain: 0.0, vignette: 0.15,
    stars: 0, clouds: 0.55, cloudLit: '#ffffff', cloudDark: '#b7d6f2', mountain: ['#5a8fc8', '#7fb0dc', '#b5d6f0']
  },
  dusk: { // 黄昏暖橙：温暖、日常（3、5）
    label: '黄昏', skyTop: '#4a3a7a', skyMid: '#a3557a', horizon: '#F28C38', glow: '#ffd08a',
    fog: '#c98a72', fogDensity: 0.0013, sun: '#ffb070', sunI: 1.9, sunElev: 7, sunAz: 250,
    hemiSky: '#e3a07a', hemiGround: '#3a2a3a', hemiI: 0.95, lamps: 0.5, headlights: true,
    trails: false, saturation: 0.12, contrast: 0.1, bloom: 0.7, grain: 0.02, vignette: 0.3,
    stars: 0, clouds: 0.6, cloudLit: '#ffc07a', cloudDark: '#7a4a7a', mountain: ['#5a3a6a', '#8a4a6a', '#c9707a']
  },
  night: { // 夜赛：热血、紧张（4、6、8、11）
    label: '夜赛', skyTop: '#05070f', skyMid: '#0D1225', horizon: '#1f2d55', glow: '#3a4f8a',
    fog: '#0d1430', fogDensity: 0.0018, sun: '#8fa6ff', sunI: 0.42, sunElev: 38, sunAz: 40,
    hemiSky: '#3a4c96', hemiGround: '#0a0c18', hemiI: 0.85, lamps: 1, headlights: true,
    trails: true, saturation: 0.1, contrast: 0.15, bloom: 1.2, grain: 0.03, vignette: 0.45,
    stars: 1, clouds: 0.25, cloudLit: '#2c3a66', cloudDark: '#0a0f22', mountain: ['#0a0f20', '#111a33', '#1b2747']
  },
  rain: { // 雨夜灰青：痛苦、失落（9、10）
    label: '雨夜', skyTop: '#2b353b', skyMid: '#3f4c53', horizon: '#5A6B73', glow: '#6f8088',
    fog: '#4b5a61', fogDensity: 0.0042, sun: '#9fb0b8', sunI: 0.35, sunElev: 30, sunAz: 80,
    hemiSky: '#55656d', hemiGround: '#151a1d', hemiI: 0.6, lamps: 1, headlights: true,
    trails: true, saturation: -0.42, contrast: 0.05, bloom: 0.9, grain: 0.09, vignette: 0.55,
    stars: 0, clouds: 0.95, cloudLit: '#5a6b73', cloudDark: '#2b353b', mountain: ['#2f3a40', '#3c484e', '#56656c'], rain: true
  },
  finale: { // 终章出山：过曝的白 + 淡金，迷茫、释然
    label: '清晨', skyTop: '#c9d8e8', skyMid: '#eef2f5', horizon: '#fff6dc', glow: '#fff3c4',
    fog: '#f4efe0', fogDensity: 0.0022, sun: '#fff1c8', sunI: 3.2, sunElev: 12, sunAz: 95,
    hemiSky: '#fff8e8', hemiGround: '#b8a888', hemiI: 1.5, lamps: 0, headlights: false,
    trails: false, saturation: -0.2, contrast: -0.05, bloom: 1.5, grain: 0.05, vignette: 0.25,
    stars: 0, clouds: 0.3, cloudLit: '#ffffff', cloudDark: '#e8e2d0', mountain: ['#d8d8d0', '#e6e4da', '#f2efe4']
  }
};

/** 章节 → 时间段 */
export const CHAPTER_PALETTE = {
  0: 'night', 1: 'dawn', 2: 'noon', 3: 'dusk', 4: 'night', 5: 'dusk', 6: 'night',
  7: 'noon', 8: 'night', 9: 'rain', 10: 'rain', 11: 'night', 12: 'dawn', 13: 'dawn'
};

export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0');
}

/** 两个调色板插值（终章从黎明过渡到过曝白） */
export function lerpPalette(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) {
    const va = a[k], vb = b[k];
    if (typeof va === 'string' && va[0] === '#' && typeof vb === 'string') out[k] = mixHex(va, vb, t);
    else if (typeof va === 'number' && typeof vb === 'number') out[k] = va + (vb - va) * t;
    else if (Array.isArray(va)) out[k] = va.map((c, i) => mixHex(c, vb[i], t));
    else out[k] = t < 0.5 ? va : vb;
  }
  return out;
}
