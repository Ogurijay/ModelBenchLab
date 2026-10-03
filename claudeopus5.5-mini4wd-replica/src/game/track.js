// 日本杯式多车道赛道：由标准件（直道 / 弯道 / 换道桥 / 飞台 / 坡道 / 波浪 / 斜坡弯）拼成闭环。
// 纯数学，不依赖 Three.js。单位 m；世界坐标 x/z 为水平面，y 向上。
export const LANE_W = 0.115;       // 车道宽（日本杯赛道约 114 mm）
export const WALL_H = 0.050;       // 护墙高
export const DS = 0.02;            // 采样步长
const BANK_RAMP = 1.2;             // 斜坡弯引道长度

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// 赛道布局。len:'auto' 的两段直道由闭合条件求解。features 在所在直道上的相对位置（m）。
export const LAYOUTS = [
  {
    id: 'basic', name: '日本杯 · 基础赛道', en: 'JAPAN CUP BASIC', level: '入门',
    desc: '经典椭圆 + 换道桥 + 一组飞龙背跳台，适合检验基础调校。',
    pieces: [
      { type: 'S', len: 3.2, features: [{ type: 'start', at: 0.6 }, { type: 'dragon', at: 1.6, len: 1.2, h: 0.07 }] },
      { type: 'C', angle: 180, r: 0.9 },
      { type: 'S', len: 3.2, features: [{ type: 'lc', at: 0.6, len: 1.9 }] },
      { type: 'C', angle: 180, r: 0.9 },
    ],
  },
  {
    id: 'technical', name: '技术赛道 · 连续弯', en: 'TECHNICAL', level: '中级',
    desc: '斜坡弯、波浪段、连续 S 弯与陡坡，考验导轮与刹车。',
    pieces: [
      { type: 'S', len: 5.0, features: [{ type: 'start', at: 0.5 }, { type: 'wave', at: 2.2, len: 1.4, h: 0.008 }] },
      { type: 'C', angle: 90, r: 0.9, bank: 0.3 },
      { type: 'S', len: 3.0, features: [{ type: 'slope', at: 0.6, len: 1.8, h: 0.10 }] },
      { type: 'C', angle: 90, r: 0.9 },
      { type: 'S', len: 'auto', features: [{ type: 'lc', at: 0.4, len: 1.9 }] },
      { type: 'C', angle: 90, r: 0.9 },
      { type: 'S', len: 0.6 },
      { type: 'C', angle: -90, r: 0.9 },
      { type: 'S', len: 0.5 },
      { type: 'C', angle: 90, r: 0.9 },
      { type: 'S', len: 'auto' },
      { type: 'C', angle: 90, r: 0.9 },
    ],
  },
  {
    id: 'speed', name: '高速赛道 · 大跳台', en: 'HIGH SPEED', level: '高级',
    desc: '6 米长直道冲出极速，紧接高落差飞龙背与两个斜坡弯；不装刹车很容易飞出。',
    pieces: [
      { type: 'S', len: 6.0, features: [{ type: 'start', at: 0.6 }, { type: 'dragon', at: 2.4, len: 1.5, h: 0.11 }] },
      { type: 'C', angle: 90, r: 1.1, bank: 0.35 },
      { type: 'S', len: 'auto' },
      { type: 'C', angle: 90, r: 1.1, bank: 0.35 },
      { type: 'S', len: 'auto', features: [{ type: 'lc', at: 1.6, len: 1.9 }, { type: 'wave', at: 4.2, len: 1.2, h: 0.009 }] },
      { type: 'C', angle: 90, r: 0.9 },
      { type: 'S', len: 1.6, features: [{ type: 'slope', at: 0.1, len: 1.4, h: 0.08 }] },
      { type: 'C', angle: 90, r: 0.9 },
    ],
  },
];

export class Track {
  constructor(layout, lanes = 5) {
    if (![3, 5].includes(lanes)) throw new Error('赛道支持 3 或 5 车道');
    this.layout = layout; this.lanes = lanes; this.width = lanes * LANE_W;
    this.pieces = solveClosure(layout.pieces);
    this.build();
  }

  build() {
    // 1) 中心线采样（x,z,heading,curvature,bank）
    const S = [], X = [], Z = [], H = [], K = [], B = [], P = [];
    let x = 0, z = 0, h = 0, s = 0;
    const push = (pi, k, bank) => { S.push(s); X.push(x); Z.push(z); H.push(h); K.push(k); B.push(bank); P.push(pi); };
    this.features = [];
    this.pieceStart = [];
    this.pieces.forEach((pc, pi) => {
      this.pieceStart.push(s);
      if (pc.type === 'S') {
        for (const f of pc.features || []) this.features.push({ ...f, s0: s + f.at, s1: s + f.at + (f.len || 0) });
        const n = Math.max(1, Math.round(pc.len / DS));
        const d = pc.len / n;
        for (let i = 0; i < n; i++) { push(pi, 0, 0); x += Math.cos(h) * d; z += Math.sin(h) * d; s += d; }
      } else {
        const ang = pc.angle * Math.PI / 180, len = Math.abs(ang) * pc.r, n = Math.max(2, Math.round(len / DS)), d = len / n, k = Math.sign(ang) / pc.r;
        if (pc.bank) this.features.push({ type: 'bank', s0: s - BANK_RAMP, s1: s + len + BANK_RAMP, h: (this.width / 2 + 0.02) * Math.sin(pc.bank), bank: pc.bank, sign: Math.sign(ang) });
        for (let i = 0; i < n; i++) {
          push(pi, k, 0);
          // 圆弧精确步进
          const h2 = h + k * d, mid = h + k * d / 2;
          const chord = Math.abs(k) > 0 ? 2 * Math.sin(Math.abs(k) * d / 2) / Math.abs(k) : d;
          x += Math.cos(mid) * chord; z += Math.sin(mid) * chord; h = h2; s += d;
        }
      }
    });
    this.length = s;
    this.closure = Math.hypot(x, z);
    // 合并重叠的斜坡弯（两弯之间保持抬升，不回落）
    const banks = this.features.filter(f => f.type === 'bank').sort((a, b) => a.s0 - b.s0), merged = [];
    for (const f of banks) { const last = merged[merged.length - 1]; if (last && f.s0 <= last.s1 && f.sign === last.sign) { last.s1 = Math.max(last.s1, f.s1); last.bank = Math.max(last.bank, f.bank); last.h = Math.max(last.h, f.h); } else merged.push({ ...f }); }
    this.features = [...this.features.filter(f => f.type !== 'bank'), ...merged];
    this.n = S.length;
    Object.assign(this, { S, X, Z, H, K, B, P });
    // 2) 高程与斜坡弯倾角
    this.Y = S.map(si => this.elevation(si));
    this.B = S.map(si => this.bankAt(si));
    const lc = this.features.find(f => f.type === 'lc');
    this.lc = lc || null;
    this.start = (this.features.find(f => f.type === 'start') || { s0: 0.5 }).s0;
    // 3) 每车道长度
    this.laneLength = Array.from({ length: this.lanes }, (_, k) => this.measureLane(k));
  }

  // 斜坡弯：整段抬升（含前后引道）并按引道渐入倾角
  bankAt(s) {
    let b = 0;
    for (const f of this.features) if (f.type === 'bank' && s >= f.s0 && s <= f.s1) b = Math.max(b, f.bank * Math.min(smooth((s - f.s0) / BANK_RAMP), smooth((f.s1 - s) / BANK_RAMP)));
    return b;
  }

  // 中心线高程：飞龙背（V 形双坡 + 中间空隙）、坡道、波浪、斜坡弯整体抬升
  elevation(s) {
    let y = 0, bankRise = 0;
    for (const f of this.features) {
      if (s < f.s0 || s > f.s1) continue;
      const t = (s - f.s0) / (f.s1 - f.s0);
      // 相邻斜坡弯取最大值（中间不回落）
      if (f.type === 'bank') { bankRise = Math.max(bankRise, f.h * Math.min(smooth((s - f.s0) / BANK_RAMP), smooth((f.s1 - s) / BANK_RAMP))); continue; }
      if (f.type === 'dragon') {
        // 上坡 40% → 顶点 → 下坡 40%（顶点为尖角，造成起飞）；两端 10% 平滑过渡
        const up = t < 0.5 ? t / 0.5 : (1 - t) / 0.5;
        y += f.h * smooth(up * 1.12 - 0.06) * (up < 0.98 ? 1 : 1);
      } else if (f.type === 'slope') {
        // 爬坡 30% → 高台 40% → 下坡 30%
        const r = t < 0.3 ? smooth(t / 0.3) : t > 0.7 ? smooth((1 - t) / 0.3) : 1;
        y += f.h * r;
      } else if (f.type === 'wave') {
        y += f.h * (0.5 - 0.5 * Math.cos(t * Math.PI * 2 * 6)) * Math.min(1, smooth(t / 0.1), smooth((1 - t) / 0.1));
      }
    }
    return y + bankRise;
  }

  wrap(s) { const L = this.length; return ((s % L) + L) % L; }
  bankSign(s) { const f = this.features.find(f => f.type === 'bank' && s >= f.s0 && s <= f.s1); return f ? f.sign : 1; }
  index(s) { s = this.wrap(s); return Math.min(this.n - 1, Math.floor(s / this.length * this.n)); }

  // 中心线连续采样（线性插值）
  center(s) {
    s = this.wrap(s);
    const f = s / this.length * this.n, i = Math.floor(f) % this.n, j = (i + 1) % this.n, t = f - Math.floor(f);
    const dh = angleDiff(this.H[j], this.H[i]);
    return {
      x: lerp(this.X[i], j === 0 ? this.X[0] : this.X[j], t), z: lerp(this.Z[i], this.Z[j], t), y: this.elevation(s),
      h: this.H[i] + dh * t, k: this.K[i], bank: lerp(this.B[i], this.B[j], t), bankSign: this.bankSign(s), piece: this.P[i],
    };
  }

  // 车道横向偏移与抬升（含换道桥）：lane 为本圈起始车道
  laneShape(s, lane) {
    s = this.wrap(s);
    const N = this.lanes, off = k => (k - (N - 1) / 2) * LANE_W;
    const lc = this.lc;
    if (lc && s >= lc.s0 && s <= lc.s1) {
      const t = (s - lc.s0) / (lc.s1 - lc.s0);
      if (lane < N - 1) {
        // 其余车道向外平移一道（中段 25%–75% 完成）
        return { offset: lerp(off(lane), off(lane + 1), smooth((t - 0.25) / 0.5)), lift: 0, bridge: false };
      }
      // 最外道爬上桥面，跨越其余车道回到最内道
      const lift = 0.115 * Math.sin(Math.PI * Math.min(1, t)) ** 1.6;
      return { offset: lerp(off(N - 1), off(0), smooth((t - 0.2) / 0.6)), lift, bridge: true };
    }
    return { offset: off(lane), lift: 0, bridge: false };
  }

  // 下一圈车道（每经过换道桥 +1）
  nextLane(lane) { return (lane + 1) % this.lanes; }

  // 车道上的位置姿态
  pose(s, lane) {
    const c = this.center(s), sh = this.laneShape(s, lane);
    const nx = -Math.sin(c.h), nz = Math.cos(c.h);              // 法线（指向 +offset，弯心一侧当 k>0）
    // 斜坡弯：绕中心线横倾，外侧高、内侧低（整段已由 bank 高程抬起）
    const outer = -sh.offset * c.bankSign;
    const bankLift = c.bank > 0 ? outer * Math.sin(c.bank) : 0;
    return {
      x: c.x + nx * sh.offset, z: c.z + nz * sh.offset, y: c.y + sh.lift + bankLift,
      h: c.h, bank: c.bank * c.bankSign, k: c.k, offset: sh.offset, bridge: sh.bridge, lift: sh.lift,
    };
  }

  // 车道上局部曲率半径对应的长度比例（中心线 ds → 车道 ds）
  laneScale(s, lane) {
    const c = this.center(s), sh = this.laneShape(s, lane);
    return Math.max(0.3, 1 - c.k * sh.offset);
  }

  measureLane(lane) {
    let L = 0;
    for (let i = 0; i < this.n; i++) L += DS * this.laneScale(this.S[i], lane);
    return L;
  }

  // 坡度（dy/ds）与曲率，供物理使用
  slope(s, lane) { const e = 0.01; return (this.pose(s + e, lane).y - this.pose(s - e, lane).y) / (2 * e); }

  featureAt(s) { s = this.wrap(s); return this.features.find(f => f.type !== 'start' && f.type !== 'bank' && s >= f.s0 && s <= f.s1) || null; }
  bounds() {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < this.n; i++) { x0 = Math.min(x0, this.X[i]); x1 = Math.max(x1, this.X[i]); z0 = Math.min(z0, this.Z[i]); z1 = Math.max(z1, this.Z[i]); }
    const m = this.width / 2 + 0.1;
    return { x0: x0 - m, x1: x1 + m, z0: z0 - m, z1: z1 + m, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
  }
}

function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

// 求解两段 len:'auto' 直道使赛道闭合
export function solveClosure(pieces) {
  const autos = pieces.map((p, i) => (p.type === 'S' && p.len === 'auto' ? i : -1)).filter(i => i >= 0);
  const out = pieces.map(p => ({ ...p }));
  if (autos.length === 0) return out;
  if (autos.length !== 2) throw new Error('需要 0 或 2 段自动直道');
  // 计算固定部分终点与两段自动直道的方向
  let x = 0, z = 0, h = 0;
  const dirs = {};
  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    if (p.type === 'S') {
      if (p.len === 'auto') { dirs[i] = [Math.cos(h), Math.sin(h)]; continue; }
      x += Math.cos(h) * p.len; z += Math.sin(h) * p.len;
    } else {
      const ang = p.angle * Math.PI / 180, R = p.r, sgn = Math.sign(ang);
      // 圆弧位移
      const cx = x - Math.sin(h) * R * sgn, cz = z + Math.cos(h) * R * sgn;
      const h2 = h + ang;
      x = cx + Math.sin(h2) * R * sgn; z = cz - Math.cos(h2) * R * sgn; h = h2;
    }
  }
  const [a, b] = autos, [ax, az] = dirs[a], [bx, bz] = dirs[b];
  // a*u + b*v = -(x,z)
  const det = ax * bz - az * bx;
  if (Math.abs(det) < 1e-9) throw new Error('自动直道方向平行，无法闭合');
  const u = (-x * bz + z * bx) / det, v = (-ax * z + az * x) / det;
  if (u < 0.3 || v < 0.3) throw new Error(`闭合解为负或过短：${u.toFixed(2)}, ${v.toFixed(2)}`);
  out[a].len = u; out[b].len = v;
  return out;
}
