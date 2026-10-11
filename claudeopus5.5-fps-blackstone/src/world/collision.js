// 自写碰撞世界：轴对齐盒 + 楔形坡道，二维均匀网格加速。
// 关卡全部由盒子/坡道拼成，因此不用三角形八叉树（大三角形在八叉树里会被反复复制、深度爆炸）。
// 角色 = 竖直圆柱（XZ 圆 + 高度），水平/竖直分轴解算，自带台阶抬升与下坡贴地。

import { clamp } from '../core/util.js';

export const MOVE = 1; // 阻挡移动
export const SHOT = 2; // 阻挡子弹/弹丸
export const SIGHT = 4; // 阻挡 AI 视线
export const SOLID = MOVE | SHOT | SIGHT;

const BOX = 0;
const RAMP = 1;

/** 隐式地面（y=0 的无限平面）在射线结果里的占位 */
export const GROUND = { id: -1, kind: -1, flags: SOLID, surface: 'ground', entity: null, enabled: true };

export class CollisionWorld {
  constructor(minX, minZ, maxX, maxZ, cell = 4) {
    this.minX = minX;
    this.minZ = minZ;
    this.cell = cell;
    this.nx = Math.ceil((maxX - minX) / cell);
    this.nz = Math.ceil((maxZ - minZ) / cell);
    this.maxX = minX + this.nx * cell;
    this.maxZ = minZ + this.nz * cell;
    this.cells = new Array(this.nx * this.nz);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    this.colliders = [];
    this._stamp = 1;
    this._q = [];
    this.hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, collider: null };
    /** 地面材质回调：(x,z) → 'dirt' | 'concrete' ...，由地图提供 */
    this.groundSurface = () => 'ground';
  }

  _insert(c) {
    const ix0 = this._cx(c.x0), ix1 = this._cx(c.x1);
    const iz0 = this._cz(c.z0), iz1 = this._cz(c.z1);
    for (let iz = iz0; iz <= iz1; iz++)
      for (let ix = ix0; ix <= ix1; ix++) this.cells[iz * this.nx + ix].push(c);
  }
  _cx(x) {
    return clamp(Math.floor((x - this.minX) / this.cell), 0, this.nx - 1);
  }
  _cz(z) {
    return clamp(Math.floor((z - this.minZ) / this.cell), 0, this.nz - 1);
  }

  addBox(x0, y0, z0, x1, y1, z1, opts = {}) {
    const c = {
      id: this.colliders.length,
      kind: BOX,
      x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1),
      x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1),
      flags: opts.flags ?? SOLID,
      surface: opts.surface || 'concrete',
      entity: opts.entity || null,
      enabled: opts.enabled ?? true,
      stamp: 0,
    };
    this.colliders.push(c);
    this._insert(c);
    return c;
  }

  /**
   * 楔形坡道。axis: 'x' | 'z'；rise=+1 表示沿坐标增大方向升高。
   * 底面 y0，低端高度 yLow（默认 y0），高端高度 y1。
   */
  addRamp(x0, y0, z0, x1, y1, z1, axis, rise, opts = {}) {
    const c = {
      id: this.colliders.length,
      kind: RAMP,
      x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1),
      x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1),
      flags: opts.flags ?? SOLID,
      surface: opts.surface || 'metal',
      entity: opts.entity || null,
      enabled: true,
      stamp: 0,
      axis: axis === 'x' ? 0 : 2,
      rise: rise >= 0 ? 1 : -1,
      yLow: opts.yLow ?? Math.min(y0, y1),
      planes: null,
    };
    // 斜面法线（朝上外侧）
    const len = c.axis === 0 ? c.x1 - c.x0 : c.z1 - c.z0;
    const dh = c.y1 - c.yLow;
    const inv = 1 / Math.hypot(len, dh);
    let snx = 0, snz = 0;
    const sny = len * inv;
    const s = -c.rise * dh * inv;
    if (c.axis === 0) snx = s;
    else snz = s;
    // 斜面过低端边
    const lowCoord = c.rise > 0 ? (c.axis === 0 ? c.x0 : c.z0) : c.axis === 0 ? c.x1 : c.z1;
    const px = c.axis === 0 ? lowCoord : 0;
    const pz = c.axis === 2 ? lowCoord : 0;
    const sd = snx * px + sny * c.yLow + snz * pz;
    c.slope = [snx, sny, snz, sd];
    c.planes = [
      [snx, sny, snz, sd],
      [0, -1, 0, -c.y0],
      [-1, 0, 0, -c.x0],
      [1, 0, 0, c.x1],
      [0, 0, -1, -c.z0],
      [0, 0, 1, c.z1],
    ];
    this.colliders.push(c);
    this._insert(c);
    return c;
  }

  setEnabled(c, on) {
    c.enabled = on;
  }

  /** 收集与 XZ 矩形相交的启用碰撞体（结果数组复用，调用方勿长期持有） */
  query(x0, z0, x1, z1, mask = 0xff) {
    const out = this._q;
    out.length = 0;
    const st = ++this._stamp;
    const ix0 = this._cx(x0), ix1 = this._cx(x1);
    const iz0 = this._cz(z0), iz1 = this._cz(z1);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const list = this.cells[iz * this.nx + ix];
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.stamp === st || !c.enabled || !(c.flags & mask)) continue;
          c.stamp = st;
          if (c.x1 < x0 || c.x0 > x1 || c.z1 < z0 || c.z0 > z1) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  /** 碰撞体在 (x,z) 处的顶面高度 */
  topAt(c, x, z) {
    if (c.kind === BOX) return c.y1;
    let t = c.axis === 0 ? (x - c.x0) / (c.x1 - c.x0) : (z - c.z0) / (c.z1 - c.z0);
    t = clamp(t, 0, 1);
    if (c.rise < 0) t = 1 - t;
    return c.yLow + (c.y1 - c.yLow) * t;
  }

  /**
   * 圆柱体（脚底 y、半径 r、高 h）与世界的水平解算。
   * 顶面不高于 脚底+step 的物体视为可跨越台阶，交给竖直阶段抬升。
   */
  resolveHorizontal(b) {
    const r = b.radius;
    let pushX = 0, pushZ = 0;
    for (let iter = 0; iter < 4; iter++) {
      const px = b.pos.x, pz = b.pos.z, feet = b.pos.y;
      const list = this.query(px - r, pz - r, px + r, pz + r, MOVE);
      let moved = false;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.y0 >= feet + b.height - 0.02) continue; // 在头顶上方
        const cx = clamp(b.pos.x, c.x0, c.x1);
        const cz = clamp(b.pos.z, c.z0, c.z1);
        const top = c.kind === BOX ? c.y1 : this.topAt(c, cx, cz);
        if (top <= feet + b.step) continue;
        let dx = b.pos.x - cx, dz = b.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let ox, oz;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const k = (r - d) / d;
          ox = dx * k;
          oz = dz * k;
        } else {
          // 圆心落进矩形：沿最短轴推出
          const l = b.pos.x - c.x0, rr = c.x1 - b.pos.x, f = b.pos.z - c.z0, bk = c.z1 - b.pos.z;
          const m = Math.min(l, rr, f, bk);
          ox = oz = 0;
          if (m === l) ox = -(l + r);
          else if (m === rr) ox = rr + r;
          else if (m === f) oz = -(f + r);
          else oz = bk + r;
        }
        b.pos.x += ox;
        b.pos.z += oz;
        pushX += ox;
        pushZ += oz;
        moved = true;
      }
      if (!moved) break;
    }
    if (pushX !== 0 || pushZ !== 0) {
      const len = Math.hypot(pushX, pushZ);
      const nx = pushX / len, nz = pushZ / len;
      const vn = b.vel.x * nx + b.vel.z * nz;
      if (vn < 0) {
        b.vel.x -= nx * vn;
        b.vel.z -= nz * vn;
      }
      b.blocked = true;
      b.blockNx = nx;
      b.blockNz = nz;
    }
  }

  /** 圆形区域下方可站立的最高顶面（不高于 maxTop），返回高度并把碰撞体写入 this._ground */
  groundAt(x, z, r, maxTop) {
    let best = maxTop >= -1e-4 ? 0 : -Infinity;
    let col = null;
    const list = this.query(x - r, z - r, x + r, z + r, MOVE);
    const r2 = r * r;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz >= r2) continue;
      const top = c.kind === BOX ? c.y1 : this.topAt(c, cx, cz);
      if (top <= maxTop + 1e-4 && top > best) {
        best = top;
        col = c;
      }
    }
    this._ground = col;
    return best;
  }

  /** 圆形区域上方最低的底面（不低于 minBottom） */
  ceilingAt(x, z, r, minBottom) {
    let best = Infinity;
    const list = this.query(x - r, z - r, x + r, z + r, MOVE);
    const r2 = r * r;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.y0 < minBottom) continue;
      const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz >= r2) continue;
      if (c.y0 < best) best = c.y0;
    }
    return best;
  }

  /**
   * 推进一个竖直圆柱体。body: { pos, vel, radius, height, step, snap, grounded, ground }
   * 返回落地冲击速度（>0 表示这一帧落地）。
   */
  moveBody(b, dt, gravity) {
    b.blocked = false;
    const mx = b.vel.x * dt, mz = b.vel.z * dt;
    const dist = Math.hypot(mx, mz);
    const n = Math.max(1, Math.ceil(dist / (b.radius * 0.5)));
    for (let i = 0; i < n; i++) {
      b.pos.x += mx / n;
      b.pos.z += mz / n;
      this.resolveHorizontal(b);
    }
    b.vel.y -= gravity * dt;
    const prevY = b.pos.y;
    b.pos.y += b.vel.y * dt;
    let impact = 0;
    const gy = this.groundAt(b.pos.x, b.pos.z, b.radius * 0.85, prevY + b.step);
    const gcol = this._ground;
    if (b.vel.y <= 0) {
      if (b.pos.y <= gy + 1e-4) {
        if (!b.grounded) impact = -b.vel.y;
        b.pos.y = gy;
        b.vel.y = 0;
        b.grounded = true;
        b.ground = gcol;
      } else if (b.grounded && b.pos.y - gy <= (b.snap ?? 0.3)) {
        b.pos.y = gy;
        b.vel.y = 0;
        b.ground = gcol;
      } else {
        b.grounded = false;
        b.ground = null;
      }
    } else {
      b.grounded = false;
      b.ground = null;
      const ceil = this.ceilingAt(b.pos.x, b.pos.z, b.radius * 0.85, prevY + b.height - 0.05);
      if (b.pos.y + b.height > ceil) {
        b.pos.y = ceil - b.height;
        b.vel.y = 0;
      }
    }
    return impact;
  }

  /** 站在 (x,z) 处、高度 h 的圆柱是否被阻挡（导航网格净空检测用） */
  blockedCylinder(x, y, z, r, h, step) {
    const list = this.query(x - r, z - r, x + r, z + r, MOVE);
    const r2 = r * r;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.y0 >= y + h) continue;
      const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz >= r2) continue;
      const top = c.kind === BOX ? c.y1 : this.topAt(c, cx, cz);
      if (top > y + step) return true;
    }
    return false;
  }

  /** (x,z) 处所有可能站立的表面高度（含隐式地面），用于导航网格采样 */
  surfacesAt(x, z, out = []) {
    out.length = 0;
    out.push(0);
    const list = this.query(x, z, x, z, MOVE);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
      out.push(this.topAt(c, x, z));
    }
    return out;
  }

  _rayCollider(c, ox, oy, oz, dx, dy, dz, best) {
    if (c.kind === BOX) {
      let tmin = -Infinity, tmax = best, axis = -1, sgn = 0;
      // x
      if (Math.abs(dx) < 1e-12) {
        if (ox < c.x0 || ox > c.x1) return -1;
      } else {
        const inv = 1 / dx;
        let t1 = (c.x0 - ox) * inv, t2 = (c.x1 - ox) * inv;
        let s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = 0; sgn = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
      if (Math.abs(dy) < 1e-12) {
        if (oy < c.y0 || oy > c.y1) return -1;
      } else {
        const inv = 1 / dy;
        let t1 = (c.y0 - oy) * inv, t2 = (c.y1 - oy) * inv;
        let s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = 1; sgn = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
      if (Math.abs(dz) < 1e-12) {
        if (oz < c.z0 || oz > c.z1) return -1;
      } else {
        const inv = 1 / dz;
        let t1 = (c.z0 - oz) * inv, t2 = (c.z1 - oz) * inv;
        let s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = 2; sgn = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
      if (tmax < 0) return -1;
      const h = this.hit;
      if (tmin < 0) {
        // 起点在盒内：视为立即命中
        h.nx = -dx; h.ny = -dy; h.nz = -dz;
        return 0;
      }
      h.nx = axis === 0 ? sgn : 0;
      h.ny = axis === 1 ? sgn : 0;
      h.nz = axis === 2 ? sgn : 0;
      return tmin;
    }
    // 坡道：Cyrus–Beck 凸多面体裁剪
    let tE = -Infinity, tL = best, en = null;
    const P = c.planes;
    for (let i = 0; i < 6; i++) {
      const p = P[i];
      const denom = p[0] * dx + p[1] * dy + p[2] * dz;
      const dist = p[3] - (p[0] * ox + p[1] * oy + p[2] * oz);
      if (Math.abs(denom) < 1e-12) {
        if (dist < 0) return -1;
        continue;
      }
      const t = dist / denom;
      if (denom < 0) {
        if (t > tE) { tE = t; en = p; }
      } else if (t < tL) tL = t;
      if (tE > tL) return -1;
    }
    if (tL < 0) return -1;
    const h = this.hit;
    if (tE < 0 || !en) {
      h.nx = -dx; h.ny = -dy; h.nz = -dz;
      return 0;
    }
    h.nx = en[0]; h.ny = en[1]; h.nz = en[2];
    return tE;
  }

  /**
   * 射线检测。dir 需归一化。命中写入 this.hit 并返回 true。
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, mask = SHOT) {
    const h = this.hit;
    let best = maxDist;
    let hitC = null;
    let hnx = 0, hny = 1, hnz = 0;
    if (dy < -1e-9) {
      const t = -oy / dy;
      if (t >= 0 && t < best) {
        best = t;
        hitC = GROUND;
      }
    }
    const st = ++this._stamp;
    const cell = this.cell;
    // 把射线裁剪进网格 XZ 范围
    let t0 = 0, t1 = best;
    if (Math.abs(dx) < 1e-12) {
      if (ox < this.minX || ox > this.maxX) t1 = -1;
    } else {
      let a = (this.minX - ox) / dx, b = (this.maxX - ox) / dx;
      if (a > b) { const tt = a; a = b; b = tt; }
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
    }
    if (Math.abs(dz) < 1e-12) {
      if (oz < this.minZ || oz > this.maxZ) t1 = -1;
    } else {
      let a = (this.minZ - oz) / dz, b = (this.maxZ - oz) / dz;
      if (a > b) { const tt = a; a = b; b = tt; }
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
    }
    if (t0 <= t1) {
      const sx = ox + dx * t0, sz = oz + dz * t0;
      let ix = this._cx(sx), iz = this._cz(sz);
      const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
      const tdx = Math.abs(dx) < 1e-12 ? Infinity : Math.abs(cell / dx);
      const tdz = Math.abs(dz) < 1e-12 ? Infinity : Math.abs(cell / dz);
      let tmx = Math.abs(dx) < 1e-12 ? Infinity
        : ((this.minX + (dx > 0 ? ix + 1 : ix) * cell) - ox) / dx;
      let tmz = Math.abs(dz) < 1e-12 ? Infinity
        : ((this.minZ + (dz > 0 ? iz + 1 : iz) * cell) - oz) / dz;
      for (let guard = 0; guard < 4096; guard++) {
        const list = this.cells[iz * this.nx + ix];
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.stamp === st) continue;
          c.stamp = st;
          if (!c.enabled || !(c.flags & mask)) continue;
          const t = this._rayCollider(c, ox, oy, oz, dx, dy, dz, best);
          if (t >= 0 && t < best) {
            best = t;
            hitC = c;
            hnx = h.nx; hny = h.ny; hnz = h.nz;
          }
        }
        const tNext = Math.min(tmx, tmz);
        if (tNext > best || tNext > t1) break;
        if (tmx < tmz) {
          ix += stepX;
          tmx += tdx;
          if (ix < 0 || ix >= this.nx) break;
        } else {
          iz += stepZ;
          tmz += tdz;
          if (iz < 0 || iz >= this.nz) break;
        }
      }
    }
    if (!hitC) return false;
    if (hitC === GROUND) {
      hnx = 0; hny = 1; hnz = 0;
    }
    h.t = best;
    h.x = ox + dx * best;
    h.y = oy + dy * best;
    h.z = oz + dz * best;
    h.nx = hnx; h.ny = hny; h.nz = hnz;
    h.collider = hitC;
    return true;
  }

  /** a→b 线段是否畅通（不命中 mask 指定的碰撞体） */
  segmentClear(ax, ay, az, bx, by, bz, mask = SIGHT) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    return !this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 1e-3, mask);
  }

  /**
   * 球体与世界解算（手雷、残骸）。直接修改 p，返回推出向量长度；推出方向写入 outN。
   */
  sphereCollide(p, r, outN, mask = MOVE) {
    let tx = 0, ty = 0, tz = 0;
    if (p.y < r) {
      ty += r - p.y;
      p.y = r;
    }
    const list = this.query(p.x - r, p.z - r, p.x + r, p.z + r, mask);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (p.y - r > c.y1 || p.y + r < c.y0) continue;
      if (c.kind === RAMP && p.x >= c.x0 && p.x <= c.x1 && p.z >= c.z0 && p.z <= c.z1) {
        const s = c.slope;
        const sd = s[0] * p.x + s[1] * p.y + s[2] * p.z - s[3];
        if (sd < r && sd > -1.0) {
          const k = r - sd;
          p.x += s[0] * k; p.y += s[1] * k; p.z += s[2] * k;
          tx += s[0] * k; ty += s[1] * k; tz += s[2] * k;
        }
        continue;
      }
      const top = c.kind === BOX ? c.y1 : this.topAt(c, clamp(p.x, c.x0, c.x1), clamp(p.z, c.z0, c.z1));
      const qx = clamp(p.x, c.x0, c.x1), qy = clamp(p.y, c.y0, top), qz = clamp(p.z, c.z0, c.z1);
      let dx = p.x - qx, dy = p.y - qy, dz = p.z - qz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        const k = (r - d) / d;
        dx *= k; dy *= k; dz *= k;
      } else {
        const pen = [p.x - c.x0, c.x1 - p.x, p.y - c.y0, top - p.y, p.z - c.z0, c.z1 - p.z];
        let m = 0;
        for (let j = 1; j < 6; j++) if (pen[j] < pen[m]) m = j;
        dx = dy = dz = 0;
        const v = pen[m] + r;
        if (m === 0) dx = -v; else if (m === 1) dx = v;
        else if (m === 2) dy = -v; else if (m === 3) dy = v;
        else if (m === 4) dz = -v; else dz = v;
      }
      p.x += dx; p.y += dy; p.z += dz;
      tx += dx; ty += dy; tz += dz;
    }
    const len = Math.hypot(tx, ty, tz);
    if (outN) {
      if (len > 1e-9) {
        outN.x = tx / len; outN.y = ty / len; outN.z = tz / len;
      } else {
        outN.x = 0; outN.y = 1; outN.z = 0;
      }
    }
    return len;
  }
}
