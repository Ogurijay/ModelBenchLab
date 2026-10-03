// 赛道数据：龟行控制点 → 向心 Catmull-Rom 样条 → 1 米间距采样。
// 纯数据（只用 three 的曲线类），物理、AI、渲染、测试共用同一份。
import { CatmullRomCurve3, Vector3 } from 'three';
import { PROGRAM, ROAD_HALF, traceProgram, COURSES, anchorS } from './layout.js';
import { clamp } from '../core/math.js';

const DS = 1; // 采样间距（米）

export class Track {
  constructor(program = PROGRAM) {
    const { pts, segs } = traceProgram(program, 2);
    this.segs = segs;
    // 每 6 米取一个控制点，交给样条平滑（圆弧-直线接缝处曲率连续化）
    const ctrl = [];
    for (let i = 0; i < pts.length; i += 3) ctrl.push(new Vector3(pts[i].x, pts[i].y, pts[i].z));
    const last = pts[pts.length - 1];
    if (ctrl[ctrl.length - 1].distanceTo(new Vector3(last.x, last.y, last.z)) > 0.5) ctrl.push(new Vector3(last.x, last.y, last.z));
    const curve = new CatmullRomCurve3(ctrl, false, 'centripetal');
    const L = curve.getLength();
    const n = Math.floor(L / DS) + 1;
    this.length = (n - 1) * DS;
    this.n = n;
    const sp = curve.getSpacedPoints(n - 1);
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.tx = new Float32Array(n); this.tz = new Float32Array(n);
    this.curv = new Float32Array(n); this.grade = new Float32Array(n);
    this.seg = new Int16Array(n);
    this.ditch = new Int8Array(n); // 排水渠所在侧：+1 左、-1 右（主路线 +s 方向的左右），0 无
    this.national = new Uint8Array(n);
    for (let i = 0; i < n; i++) { this.x[i] = sp[i].x; this.y[i] = sp[i].y; this.z[i] = sp[i].z; }
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      const dx = this.x[b] - this.x[a], dz = this.z[b] - this.z[a];
      const l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
      this.grade[i] = -(this.y[b] - this.y[a]) / ((b - a) * DS);
    }
    // 曲率：相邻切线夹角 / 弧长，平滑 ±3 米；正值 = 左转
    const raw = new Float32Array(n);
    for (let i = 1; i < n - 1; i++) {
      const h0 = Math.atan2(-this.tz[i - 1], this.tx[i - 1]);
      const h1 = Math.atan2(-this.tz[i + 1], this.tx[i + 1]);
      let d = h1 - h0; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI;
      raw[i] = d / (2 * DS);
    }
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let k = -3; k <= 3; k++) { const j = i + k; if (j >= 0 && j < n) { s += raw[j]; c++; } }
      this.curv[i] = s / c;
    }
    // 把龟行段信息映射到采样（按弧长比例，样条与龟行总长相差极小）
    const scale = segs[segs.length - 1].s1 / this.length;
    for (let i = 0; i < n; i++) {
      const s = i * DS * scale;
      let k = segs.findIndex((g) => s >= g.s0 && s < g.s1);
      if (k < 0) k = segs.length - 1;
      this.seg[i] = k;
      if (segs[k].road === 'national') this.national[i] = 1;
    }
    // 排水渠：标记弯的弧段，入口提前 6 米，出口延后 4 米
    for (const g of segs) {
      if (!g.tag?.ditch) continue;
      const i0 = Math.max(0, Math.floor(g.s0 / scale) - 6), i1 = Math.min(n - 1, Math.ceil(g.s1 / scale) + 4);
      for (let i = i0; i <= i1; i++) this.ditch[i] = Math.sign(g.ang);
    }
    this.halfWidth = ROAD_HALF;
    this._scale = scale;
    this._buildGrid();
  }

  /** 主路线弧长 → 采样索引 */
  idx(s) { return clamp(Math.round(s / DS), 0, this.n - 1); }
  segS(g) { return { s0: g.s0 / this._scale, s1: g.s1 / this._scale }; }
  anchor(name) {
    const raw = anchorS(this.segs, name, this.segs[this.segs.length - 1].s1);
    return raw / this._scale;
  }
  course(id) {
    const c = COURSES[id];
    const a = this.anchor(c.from), b = this.anchor(c.to);
    return { id, ...c, s0: c.dir > 0 ? a : b, s1: c.dir > 0 ? b : a, length: Math.abs(b - a) };
  }
  hairpin(id) {
    const g = this.segs.find((g) => g.tag?.hairpin === id);
    return g ? this.segS(g) : null;
  }

  /** 插值采样：给定弧长返回中心点、切线、左法线、坡度、曲率 */
  sample(s, out = {}) {
    const f = clamp(s / DS, 0, this.n - 1.0001);
    const i = Math.floor(f), t = f - i;
    out.x = this.x[i] + (this.x[i + 1] - this.x[i]) * t;
    out.y = this.y[i] + (this.y[i + 1] - this.y[i]) * t;
    out.z = this.z[i] + (this.z[i + 1] - this.z[i]) * t;
    out.tx = this.tx[i]; out.tz = this.tz[i];
    out.nx = this.tz[i]; out.nz = -this.tx[i]; // 左法线
    out.curv = this.curv[i]; out.grade = this.grade[i];
    out.ditch = this.ditch[i]; out.i = i;
    return out;
  }

  /** 世界坐标 → 赛道坐标（局部搜索 + 线段投影） */
  project(x, z, hint = -1, out = {}) {
    let best = -1, bd = Infinity;
    if (hint >= 0) {
      const lo = Math.max(0, hint - 40), hi = Math.min(this.n - 1, hint + 40);
      for (let i = lo; i <= hi; i++) {
        const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2;
        if (d < bd) { bd = d; best = i; }
      }
      if (bd > 30 * 30) best = -1;
    }
    if (best < 0) best = this._gridNearest(x, z);
    // 在 best 两侧线段上精确投影
    let i = best;
    const dx = x - this.x[i], dz = z - this.z[i];
    let along = dx * this.tx[i] + dz * this.tz[i];
    let s = i * DS + along;
    s = clamp(s, 0, this.length);
    const smp = this.sample(s, out);
    out.s = s;
    out.lat = (x - smp.x) * smp.nx + (z - smp.z) * smp.nz;
    out.idx = smp.i;
    return out;
  }

  _buildGrid() {
    this.cell = 24;
    this.grid = new Map();
    for (let i = 0; i < this.n; i += 2) {
      const k = `${Math.floor(this.x[i] / this.cell)},${Math.floor(this.z[i] / this.cell)}`;
      let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(i);
    }
  }
  _gridNearest(x, z) {
    // 先查近邻网格（3×3），找不到再对 8 米粗采样暴力搜索，最后在附近 1 米精化
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    let best = -1, bd = Infinity;
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const a = this.grid.get(`${gx},${gz}`); if (!a) continue;
      for (const i of a) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    if (best < 0 || bd > this.cell * this.cell) {
      for (let i = 0; i < this.n; i += 8) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
      const lo = Math.max(0, best - 8), hi = Math.min(this.n - 1, best + 8);
      for (let i = lo; i <= hi; i++) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    const lo = Math.max(0, best - 2), hi = Math.min(this.n - 1, best + 2);
    for (let i = lo; i <= hi; i++) { const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }

  /** 最近中心线距离与高度（地形雕刻用） */
  nearest(x, z) {
    const i = this._gridNearest(x, z);
    return { i, d: Math.hypot(this.x[i] - x, this.z[i] - z), y: this.y[i] };
  }
}
