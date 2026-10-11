// 多层导航网格：按 1m 网格对碰撞世界采样所有可站立表面（地面、走廊、坡道、箱顶），
// 以净空圆柱过滤，再按高差连接 8 邻域。A* + 视线拉直。门（动态碰撞体）通过 setBlockedRect 开关。

import { clamp } from '../core/util.js';

const NEIGH = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export class NavGrid {
  constructor(world, { minX, minZ, maxX, maxZ, cell = 1, radius = 0.45, height = 1.8, step = 0.35 }) {
    this.world = world;
    this.minX = minX;
    this.minZ = minZ;
    this.cell = cell;
    this.nx = Math.ceil((maxX - minX) / cell);
    this.nz = Math.ceil((maxZ - minZ) / cell);
    this.radius = radius;
    this.height = height;
    this.step = step;
  }

  build() {
    const { nx, nz, cell, world } = this;
    const xs = [], ys = [], zs = [], cellOf = [];
    this.cellStart = new Int32Array(nx * nz + 1);
    const surf = [];
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const ci = j * nx + i;
        this.cellStart[ci] = xs.length;
        const x = this.minX + (i + 0.5) * cell;
        const z = this.minZ + (j + 0.5) * cell;
        world.surfacesAt(x, z, surf);
        surf.sort((a, b) => a - b);
        let last = -1e9;
        for (const s of surf) {
          if (s - last < 0.25) continue;
          last = s;
          if (world.blockedCylinder(x, s, z, this.radius, this.height, this.step)) continue;
          xs.push(x);
          ys.push(s);
          zs.push(z);
          cellOf.push(ci);
        }
      }
    }
    this.cellStart[nx * nz] = xs.length;
    const n = xs.length;
    this.count = n;
    this.x = Float32Array.from(xs);
    this.y = Float32Array.from(ys);
    this.z = Float32Array.from(zs);
    this.cellOf = Int32Array.from(cellOf);
    this.blocked = new Uint8Array(n);

    // 邻接（CSR）
    const adj = [];
    const cost = [];
    this.adjStart = new Int32Array(n + 1);
    for (let a = 0; a < n; a++) {
      this.adjStart[a] = adj.length;
      const ci = cellOf[a];
      const i = ci % nx, j = (ci / nx) | 0;
      for (const [di, dj, c] of NEIGH) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const maxDy = di !== 0 && dj !== 0 ? 0.62 : 0.5;
        const b = this._nodeInCell(jj * nx + ii, ys[a], maxDy);
        if (b < 0) continue;
        if (di !== 0 && dj !== 0) {
          // 斜向需两侧正交格都可走，避免切角
          if (this._nodeInCell(j * nx + ii, ys[a], 0.62) < 0) continue;
          if (this._nodeInCell(jj * nx + i, ys[a], 0.62) < 0) continue;
        }
        const mx = (xs[a] + xs[b]) / 2, mz = (zs[a] + zs[b]) / 2;
        const lo = Math.min(ys[a], ys[b]);
        if (world.blockedCylinder(mx, lo, mz, this.radius * 0.85, this.height, this.step + Math.abs(ys[a] - ys[b]))) continue;
        adj.push(b);
        cost.push(c + Math.abs(ys[a] - ys[b]) * 0.5);
      }
    }
    this.adjStart[n] = adj.length;
    this.adj = Int32Array.from(adj);
    this.cost = Float32Array.from(cost);

    // 连通分量（门全部视为打开）
    this.comp = new Int32Array(n).fill(-1);
    let cid = 0;
    const stack = [];
    for (let s = 0; s < n; s++) {
      if (this.comp[s] >= 0) continue;
      this.comp[s] = cid;
      stack.push(s);
      while (stack.length) {
        const a = stack.pop();
        for (let k = this.adjStart[a]; k < this.adjStart[a + 1]; k++) {
          const b = this.adj[k];
          if (this.comp[b] < 0) {
            this.comp[b] = cid;
            stack.push(b);
          }
        }
      }
      cid++;
    }
    this.compCount = cid;
    const sizes = new Int32Array(cid);
    for (let a = 0; a < n; a++) sizes[this.comp[a]]++;
    this.compSize = sizes;

    // A* 缓冲
    this.g = new Float32Array(n);
    this.f = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.searchId = 0;
    this.heap = new Int32Array(n + 1);
    return this;
  }

  _nodeInCell(ci, y, maxDy) {
    const s = this.cellStart[ci], e = this.cellStart[ci + 1];
    let best = -1, bd = maxDy;
    for (let k = s; k < e; k++) {
      const d = Math.abs((this.y ? this.y[k] : 0) - y);
      if (d <= bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  cellIndex(x, z) {
    const i = Math.floor((x - this.minX) / this.cell);
    const j = Math.floor((z - this.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }

  /** 位置对应的节点（同格高差最小者；无则在 2 格半径内找最近） */
  nodeAt(x, y, z, maxDy = 1.4, allowBlocked = false) {
    const ci = this.cellIndex(x, z);
    if (ci >= 0) {
      const k = this._nodeInCell(ci, y, maxDy);
      if (k >= 0 && (allowBlocked || !this.blocked[k])) return k;
    }
    let best = -1, bd = Infinity;
    const i0 = Math.floor((x - this.minX) / this.cell), j0 = Math.floor((z - this.minZ) / this.cell);
    for (let r = 1; r <= 3 && best < 0; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const ii = i0 + di, jj = j0 + dj;
          if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue;
          const c = jj * this.nx + ii;
          for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
            if (!allowBlocked && this.blocked[k]) continue;
            const dy = Math.abs(this.y[k] - y);
            if (dy > maxDy) continue;
            const d = (this.x[k] - x) ** 2 + (this.z[k] - z) ** 2 + dy * dy * 4;
            if (d < bd) {
              bd = d;
              best = k;
            }
          }
        }
      }
    }
    return best;
  }

  setBlockedRect(x0, z0, x1, z1, blocked) {
    for (let k = 0; k < this.count; k++) {
      if (this.x[k] >= x0 && this.x[k] <= x1 && this.z[k] >= z0 && this.z[k] <= z1) this.blocked[k] = blocked ? 1 : 0;
    }
  }

  _heapPush(size, node) {
    const h = this.heap, f = this.f;
    let i = size;
    h[i] = node;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[h[p]] <= f[h[i]]) break;
      const t = h[p]; h[p] = h[i]; h[i] = t;
      i = p;
    }
    return size + 1;
  }
  _heapPop(size) {
    const h = this.heap, f = this.f;
    const top = h[0];
    size--;
    h[0] = h[size];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < size && f[h[l]] < f[h[m]]) m = l;
      if (r < size && f[h[r]] < f[h[m]]) m = r;
      if (m === i) break;
      const t = h[m]; h[m] = h[i]; h[i] = t;
      i = m;
    }
    return top;
  }

  /**
   * A*。返回节点序列（含起止），失败返回 null。maxExpand 限制展开数。
   */
  searchNodes(start, goal, maxExpand = 9000) {
    if (start < 0 || goal < 0) return null;
    if (this.comp[start] !== this.comp[goal]) return null;
    const id = ++this.searchId;
    const { g, f, parent, seen, closed, x, y, z } = this;
    const gx = x[goal], gy = y[goal], gz = z[goal];
    const hfun = (k) => {
      const dx = Math.abs(x[k] - gx), dz = Math.abs(z[k] - gz);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz) + Math.abs(y[k] - gy) * 0.5;
    };
    g[start] = 0;
    f[start] = hfun(start);
    parent[start] = -1;
    seen[start] = id;
    let size = this._heapPush(0, start);
    let expanded = 0;
    while (size > 0) {
      const a = this._heapPop(size);
      size--;
      if (closed[a] === id) continue;
      closed[a] = id;
      if (a === goal) {
        const out = [];
        for (let k = goal; k >= 0; k = parent[k]) out.push(k);
        out.reverse();
        return out;
      }
      if (++expanded > maxExpand) return null;
      for (let e = this.adjStart[a]; e < this.adjStart[a + 1]; e++) {
        const b = this.adj[e];
        if (this.blocked[b] || closed[b] === id) continue;
        const ng = g[a] + this.cost[e];
        if (seen[b] !== id || ng < g[b]) {
          seen[b] = id;
          g[b] = ng;
          f[b] = ng + hfun(b) * 1.05;
          parent[b] = a;
          size = this._heapPush(size, b);
        }
      }
    }
    return null;
  }

  /** 直线 a→b 是否全程落在可走节点上（高度连续） */
  lineWalkable(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / 0.35));
    let cy = ay;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const ci = this.cellIndex(ax + dx * t, az + dz * t);
      if (ci < 0) return false;
      const k = this._nodeInCell(ci, cy, 0.45);
      if (k < 0 || this.blocked[k]) return false;
      cy = this.y[k];
    }
    return Math.abs(cy - by) < 0.6;
  }

  /** 寻路并拉直，返回世界坐标点数组（不含起点） */
  findPath(sx, sy, sz, tx, ty, tz, maxExpand) {
    const a = this.nodeAt(sx, sy, sz);
    let b = this.nodeAt(tx, ty, tz, 2.5);
    if (a < 0 || b < 0) return null;
    if (this.comp[a] !== this.comp[b]) {
      b = this.nearestInComp(tx, ty, tz, this.comp[a], 12);
      if (b < 0) return null;
    }
    const nodes = this.searchNodes(a, b, maxExpand);
    if (!nodes) return null;
    // 拉直：从当前点尽量跳到最远的可直达节点
    const pts = [];
    let cx = sx, cy = this.y[a], cz = sz;
    let i = 0;
    while (i < nodes.length - 1) {
      let j = Math.min(nodes.length - 1, i + 14);
      for (; j > i + 1; j--) {
        const k = nodes[j];
        if (this.lineWalkable(cx, cy, cz, this.x[k], this.y[k], this.z[k])) break;
      }
      const k = nodes[j];
      pts.push({ x: this.x[k], y: this.y[k], z: this.z[k] });
      cx = this.x[k];
      cy = this.y[k];
      cz = this.z[k];
      i = j;
    }
    // 终点用真实目标坐标（若同格）
    if (pts.length && b === this.nodeAt(tx, ty, tz, 2.5)) {
      const last = pts[pts.length - 1];
      if (Math.hypot(last.x - tx, last.z - tz) < 0.8) {
        last.x = tx;
        last.z = tz;
      }
    }
    return pts;
  }

  nearestInComp(x, y, z, comp, radius) {
    let best = -1, bd = Infinity;
    const i0 = Math.floor((x - this.minX) / this.cell), j0 = Math.floor((z - this.minZ) / this.cell);
    const r = Math.ceil(radius / this.cell);
    for (let jj = Math.max(0, j0 - r); jj <= Math.min(this.nz - 1, j0 + r); jj++) {
      for (let ii = Math.max(0, i0 - r); ii <= Math.min(this.nx - 1, i0 + r); ii++) {
        const c = jj * this.nx + ii;
        for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
          if (this.comp[k] !== comp || this.blocked[k]) continue;
          const d = (this.x[k] - x) ** 2 + (this.z[k] - z) ** 2 + (this.y[k] - y) ** 2;
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
      }
    }
    return best;
  }

  /** 在环形范围内随机取一个与 (x,y,z) 同分量的节点 */
  randomNodeNear(x, y, z, rMin, rMax, rng, tries = 24) {
    const a = this.nodeAt(x, y, z, 2);
    if (a < 0) return -1;
    const comp = this.comp[a];
    for (let t = 0; t < tries; t++) {
      const ang = rng.next() * Math.PI * 2;
      const r = rMin + (rMax - rMin) * rng.next();
      const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
      const ci = this.cellIndex(px, pz);
      if (ci < 0) continue;
      for (let k = this.cellStart[ci]; k < this.cellStart[ci + 1]; k++) {
        if (this.comp[k] === comp && !this.blocked[k] && Math.abs(this.y[k] - y) < 5) return k;
      }
    }
    return -1;
  }

  clampToGrid(x, z) {
    return [clamp(x, this.minX + 0.5, this.minX + this.nx * this.cell - 0.5), clamp(z, this.minZ + 0.5, this.minZ + this.nz * this.cell - 0.5)];
  }
}
