// 80 年代数码液晶：七段数码管（含未点亮的"鬼影"段）与条形转速表，纯 SVG。
const SEG = {
  a: 'M2,1 L8,1 L7,2.2 L3,2.2 Z', b: 'M8.3,1.5 L8.3,8.6 L7.2,7.8 L7.2,2.6 Z', c: 'M8.3,9.4 L8.3,16.5 L7.2,15.4 L7.2,10.2 Z',
  d: 'M2,17 L8,17 L7,15.8 L3,15.8 Z', e: 'M1.7,9.4 L1.7,16.5 L2.8,15.4 L2.8,10.2 Z', f: 'M1.7,1.5 L1.7,8.6 L2.8,7.8 L2.8,2.6 Z',
  g: 'M2.2,9 L3,8.4 L7,8.4 L7.8,9 L7,9.6 L3,9.6 Z'
};
const MAP = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  '-': 'g', ' ': '', N: 'abcef', R: 'eg', E: 'adefg', P: 'abefg'
};

export function seg7(str, opts = {}) {
  const on = opts.on || '#9dff6a', off = opts.off || 'rgba(157,255,106,0.08)';
  const chars = String(str).split('');
  const w = chars.filter((c) => c !== '.' && c !== ':').length * 10.5 + chars.filter((c) => c === '.' || c === ':').length * 3;
  let x = 0, out = '';
  for (const c of chars) {
    if (c === '.') { out += `<rect x="${x}" y="15.6" width="1.6" height="1.6" fill="${on}"/>`; x += 3; continue; }
    if (c === ':') { out += `<rect x="${x}" y="5" width="1.6" height="1.6" fill="${on}"/><rect x="${x}" y="11.5" width="1.6" height="1.6" fill="${on}"/>`; x += 3; continue; }
    const lit = MAP[c] ?? '';
    for (const k of 'abcdefg') out += `<path transform="translate(${x} 0) skewX(-6)" d="${SEG[k]}" fill="${lit.includes(k) ? on : off}"/>`;
    x += 10.5;
  }
  return `<svg viewBox="-1 0 ${w + 1} 18" class="seg7" preserveAspectRatio="xMinYMid meet">${out}</svg>`;
}

/** 条形转速表：n 段，红区从 redFrom 开始 */
export function tachBar(frac, n = 24, redFrom = 0.8) {
  let out = '';
  const lit = Math.round(frac * n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const h = 5 + t * 13;
    const col = t >= redFrom ? '#ff4d4d' : t >= 0.6 ? '#ffd24d' : '#9dff6a';
    out += `<rect x="${i * 6}" y="${18 - h}" width="4.4" height="${h}" fill="${i < lit ? col : 'rgba(157,255,106,0.08)'}"/>`;
  }
  return `<svg viewBox="0 0 ${n * 6} 18" class="tach">${out}</svg>`;
}
