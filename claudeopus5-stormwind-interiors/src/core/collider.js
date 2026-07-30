// 场景碰撞:AABB 集合 + 均匀网格哈希。
// 设计要点:
//  · 只有与角色「垂直区间」相交的盒子才参与水平推出 —— 门楣/梁架天然从头顶掠过,不挡路。
//  · 盒顶低于脚下 stepUp 的一律当台阶,不推出而是被支撑面查询接住 —— 楼梯/门槛/台基自然可走。
//  · 支撑面取「脚下最高的盒顶」,所以二层楼板、城墙马道、屋顶平台都能站人。
export class Collision {
  constructor(cell = 8) {
    this.cell = cell;
    this.boxes = [];
    this.grid = new Map();
    this.built = false;
  }

  /** box = [x0,y0,z0,x1,y1,z1] */
  add(b) {
    if (!b) return;
    if (b[3] - b[0] < 0.02 || b[5] - b[2] < 0.02 || b[4] - b[1] < 0.02) return;
    this.boxes.push(b);
    this.built = false;
  }

  addMany(list) {
    if (!list) return;
    for (const b of list) this.add(b);
  }

  key(ix, iz) { return ix * 46337 + iz; }

  build() {
    this.grid.clear();
    const c = this.cell;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      const x0 = Math.floor(b[0] / c), x1 = Math.floor(b[3] / c);
      const z0 = Math.floor(b[2] / c), z1 = Math.floor(b[5] / c);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const k = this.key(ix, iz);
          let a = this.grid.get(k);
          if (!a) { a = []; this.grid.set(k, a); }
          a.push(i);
        }
      }
    }
    this.built = true;
    return this;
  }

  /** 收集与给定 XZ 矩形相交的盒子下标(去重)。 */
  query(x0, z0, x1, z1, out) {
    if (!this.built) this.build();
    const c = this.cell;
    const ix0 = Math.floor(x0 / c), ix1 = Math.floor(x1 / c);
    const iz0 = Math.floor(z0 / c), iz1 = Math.floor(z1 / c);
    out.length = 0;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const a = this.grid.get(this.key(ix, iz));
        if (!a) continue;
        for (let j = 0; j < a.length; j++) {
          const id = a[j];
          if (!seen.has(id)) { seen.add(id); out.push(id); }
        }
      }
    }
    return out;
  }

  /**
   * 脚下支撑高度:返回 (x,z) 附近、盒顶不高于 feetY+stepUp 的最高盒顶。
   * 找不到时返回 -Infinity(由调用方回落到地形高度)。
   */
  supportY(x, z, feetY, stepUp = 0.62, radius = 0.26) {
    const idx = this._tmpA || (this._tmpA = []);
    this.query(x - radius, z - radius, x + radius, z + radius, idx);
    let best = -Infinity;
    const ceiling = feetY + stepUp;
    for (let i = 0; i < idx.length; i++) {
      const b = this.boxes[idx[i]];
      if (b[4] > ceiling || b[4] <= best) continue;
      if (x < b[0] - radius || x > b[3] + radius || z < b[2] - radius || z > b[5] + radius) continue;
      best = b[4];
    }
    return best;
  }

  /** 头顶天花板:返回高于 headY 的最低盒底。 */
  ceilingY(x, z, headY, radius = 0.26) {
    const idx = this._tmpB || (this._tmpB = []);
    this.query(x - radius, z - radius, x + radius, z + radius, idx);
    let best = Infinity;
    for (let i = 0; i < idx.length; i++) {
      const b = this.boxes[idx[i]];
      if (b[1] < headY || b[1] >= best) continue;
      if (x < b[0] - radius || x > b[3] + radius || z < b[2] - radius || z > b[5] + radius) continue;
      best = b[1];
    }
    return best;
  }

  /**
   * 水平推出。pos 为脚底位置(会被就地修改),radius 为身体半径,height 为身高。
   * 返回是否发生了碰撞。
   */
  resolve(pos, radius, height, stepUp = 0.62) {
    const idx = this._tmpC || (this._tmpC = []);
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, idx);
      let moved = false;
      const lo = pos.y + 0.18, hi = pos.y + height;
      for (let i = 0; i < idx.length; i++) {
        const b = this.boxes[idx[i]];
        if (b[4] <= pos.y + stepUp) continue;   // 台阶:交给支撑面
        if (b[4] <= lo || b[1] >= hi) continue; // 垂直不相交:门楣 / 脚下
        const px = pos.x, pz = pos.z;
        if (px < b[0] - radius || px > b[3] + radius || pz < b[2] - radius || pz > b[5] + radius) continue;
        // 最小平移向量
        const dxL = px - (b[0] - radius);
        const dxR = (b[3] + radius) - px;
        const dzL = pz - (b[2] - radius);
        const dzR = (b[5] + radius) - pz;
        const mx = Math.min(dxL, dxR);
        const mz = Math.min(dzL, dzR);
        if (mx < mz) pos.x += dxL < dxR ? -mx : mx;
        else pos.z += dzL < dzR ? -mz : mz;
        moved = true; hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  /** 点是否落在任一盒子内部(用于出生点校验)。 */
  contains(x, y, z) {
    const idx = this._tmpD || (this._tmpD = []);
    this.query(x, z, x, z, idx);
    for (let i = 0; i < idx.length; i++) {
      const b = this.boxes[idx[i]];
      if (x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5]) return true;
    }
    return false;
  }

  /** 排障:列出包含 (x,z) 的盒子(按盒顶降序),用来定位"凭空被托住"的碰撞体。 */
  debugAt(x, z, limit = 8) {
    const idx = [];
    this.query(x, z, x, z, idx);
    return idx
      .map((i) => this.boxes[i])
      .filter((b) => x >= b[0] && x <= b[3] && z >= b[2] && z <= b[5])
      .sort((a, b) => b[4] - a[4])
      .slice(0, limit)
      .map((b) => b.map((v) => +v.toFixed(2)));
  }

  get count() { return this.boxes.length; }

  clear() {
    this.boxes.length = 0;
    this.grid.clear();
    this.built = false;
  }
}
