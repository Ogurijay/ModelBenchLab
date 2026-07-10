// 确定性伪随机:mulberry32 + FNV-1a 字符串哈希。
// 同一种子必须产出同一城市,这里是整个"计算能力"考点的地基。

export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 整数格点哈希 → [0,1),用于噪声
export function hash2(x, y, seed) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this._next = mulberry32(this.seed);
  }
  next() { return this._next(); }
  range(a, b) { return a + (b - a) * this._next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this._next() * arr.length) % arr.length]; }
  chance(p) { return this._next() < p; }
  // 派生独立子流:各子系统互不干扰,增删一处随机调用不影响其他系统
  fork(tag) { return new Rng(hashString(this.seed + ':' + tag)); }
}
