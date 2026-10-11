// 通用数学与随机工具。游戏逻辑一律走种子随机数，便于 __bench 复现。

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** 帧率无关的指数趋近：lambda 越大越快 */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const angleDiff = (from, to) => wrapAngle(to - from);
export const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.reseed(seed);
  }
  reseed(seed) {
    this.seed = seed >>> 0;
    this._f = mulberry32(this.seed);
  }
  next() {
    return this._f();
  }
  range(a, b) {
    return a + (b - a) * this._f();
  }
  int(a, b) {
    return a + Math.floor(this._f() * (b - a + 1));
  }
  pick(arr) {
    return arr[Math.floor(this._f() * arr.length)];
  }
  chance(p) {
    return this._f() < p;
  }
  sign() {
    return this._f() < 0.5 ? -1 : 1;
  }
  /** 近似正态（Irwin–Hall 3 项），范围约 [-1.7, 1.7]σ */
  gauss() {
    return (this._f() + this._f() + this._f() - 1.5) * 2;
  }
}

/** 二阶弹簧（欠阻尼可调），用于视角模型的后坐、摇摆、落地等 */
export class Spring {
  constructor(stiffness = 120, damping = 14, value = 0) {
    this.k = stiffness;
    this.c = damping;
    this.value = value;
    this.velocity = 0;
    this.target = value;
  }
  impulse(v) {
    this.velocity += v;
  }
  update(dt) {
    // 半隐式欧拉，按小步推进保证稳定
    let t = dt;
    while (t > 0) {
      const h = Math.min(t, 1 / 240);
      const a = (this.target - this.value) * this.k - this.velocity * this.c;
      this.velocity += a * h;
      this.value += this.velocity * h;
      t -= h;
    }
    return this.value;
  }
  reset(v = 0) {
    this.value = v;
    this.target = v;
    this.velocity = 0;
  }
}

/** 线段上离点最近的参数 t∈[0,1] */
export function closestTOnSegment(ax, ay, az, bx, by, bz, px, py, pz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  if (len2 < 1e-12) return 0;
  return clamp(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2, 0, 1);
}

/**
 * 射线与球求交，返回最近的 t（>=0）或 -1。dir 需归一化。
 */
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t >= 0 ? t : -1;
}

/**
 * 射线与胶囊体（线段 a-b，半径 r）求交，返回 t 或 -1。
 * 解析做法：先求无限圆柱，再对两端球帽补测。
 */
export function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const oax = ox - ax, oay = oy - ay, oaz = oz - az;
  const baba = bax * bax + bay * bay + baz * baz;
  const bard = bax * dx + bay * dy + baz * dz;
  const baoa = bax * oax + bay * oay + baz * oaz;
  const rdoa = dx * oax + dy * oay + dz * oaz;
  const oaoa = oax * oax + oay * oay + oaz * oaz;
  const a = baba - bard * bard;
  let b = baba * rdoa - baoa * bard;
  let c = baba * oaoa - baoa * baoa - r * r * baba;
  let h = b * b - a * c;
  if (h >= 0 && a > 1e-9) {
    const t = (-b - Math.sqrt(h)) / a;
    const y = baoa + t * bard;
    if (y > 0 && y < baba && t >= 0) return t;
  }
  // 球帽
  const t1 = raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, r);
  const t2 = raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, r);
  if (t1 < 0) return t2;
  if (t2 < 0) return t1;
  return Math.min(t1, t2);
}

/** 两线段最近距离的平方（用于弹丸 vs 玩家胶囊） */
export function segSegDist2(p1x, p1y, p1z, q1x, q1y, q1z, p2x, p2y, p2z, q2x, q2y, q2z) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d1z = q1z - p1z;
  const d2x = q2x - p2x, d2y = q2y - p2y, d2z = q2z - p2z;
  const rx = p1x - p2x, ry = p1y - p2y, rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-9 && e <= 1e-9) {
    s = t = 0;
  } else if (a <= 1e-9) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-9) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const cx = p1x + d1x * s - (p2x + d2x * t);
  const cy = p1y + d1y * s - (p2y + d2y * t);
  const cz = p1z + d1z * s - (p2z + d2z * t);
  return cx * cx + cy * cy + cz * cz;
}

export function formatTime(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
