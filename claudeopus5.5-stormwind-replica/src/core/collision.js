// 碰撞世界：所有实体是「只绕 Y 轴旋转的盒子」（OBB），放在 8 m 空间哈希里。
// 墙体由 Builder.box(..., {collide:true}) 生成——渲染和碰撞用同一组参数，洞口处天然没有碰撞。
import { STEP_MAX, groundHeight } from '../world/coords.js';

const CELL = 8;

export class CollisionWorld {
  constructor() {
    this.cells = new Map();
    this.boxes = [];
    this._stamp = 0;
  }

  // box: { x, z, hx, hz, ry, y0, y1 }
  add(b) {
    b.c = Math.cos(b.ry || 0);
    b.s = Math.sin(b.ry || 0);
    // 世界 AABB 半径
    const ex = Math.abs(b.c) * b.hx + Math.abs(b.s) * b.hz;
    const ez = Math.abs(b.s) * b.hx + Math.abs(b.c) * b.hz;
    b.minx = b.x - ex;
    b.maxx = b.x + ex;
    b.minz = b.z - ez;
    b.maxz = b.z + ez;
    b._q = 0;
    this.boxes.push(b);
    for (let i = Math.floor(b.minx / CELL); i <= Math.floor(b.maxx / CELL); i++) {
      for (let k = Math.floor(b.minz / CELL); k <= Math.floor(b.maxz / CELL); k++) {
        const key = i * 100003 + k;
        let arr = this.cells.get(key);
        if (!arr) this.cells.set(key, (arr = []));
        arr.push(b);
      }
    }
    return b;
  }

  query(x, z, r) {
    const out = [];
    const stamp = ++this._stamp;
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++) {
      for (let k = Math.floor((z - r) / CELL); k <= Math.floor((z + r) / CELL); k++) {
        const arr = this.cells.get(i * 100003 + k);
        if (!arr) continue;
        for (const b of arr) {
          if (b._q === stamp) continue;
          b._q = stamp;
          if (x + r < b.minx || x - r > b.maxx || z + r < b.minz || z - r > b.maxz) continue;
          out.push(b);
        }
      }
    }
    return out;
  }

  // 圆（半径 r）与盒子在 XZ 平面上的最近点；返回 {dx,dz,d}（世界坐标的推离方向）
  static circleBox(b, x, z, r) {
    const wx = x - b.x;
    const wz = z - b.z;
    // 转到盒子局部（three 的 rotation.y：local→world 为 x' = c·x + s·z, z' = -s·x + c·z）
    const lx = b.c * wx - b.s * wz;
    const lz = b.s * wx + b.c * wz;
    const cx = Math.max(-b.hx, Math.min(b.hx, lx));
    const cz = Math.max(-b.hz, Math.min(b.hz, lz));
    let dlx = lx - cx;
    let dlz = lz - cz;
    let d = Math.hypot(dlx, dlz);
    if (d >= r) return null;
    if (d < 1e-6) {
      // 圆心在盒内：沿最浅的轴推出
      const px = b.hx - Math.abs(lx);
      const pz = b.hz - Math.abs(lz);
      if (px < pz) { dlx = Math.sign(lx) || 1; dlz = 0; d = -px; }
      else { dlx = 0; dlz = Math.sign(lz) || 1; d = -pz; }
    } else {
      dlx /= d;
      dlz /= d;
    }
    // 局部 → 世界
    return { nx: b.c * dlx + b.s * dlz, nz: -b.s * dlx + b.c * dlz, pen: r - d };
  }

  // 站立高度：脚下 r 范围内、顶面不高于 feet+STEP_MAX 的最高盒顶，和地形高度取 max
  groundAt(x, z, r, feetY) {
    let g = groundHeight(x, z);
    for (const b of this.query(x, z, r)) {
      if (b.y1 > feetY + STEP_MAX || b.y1 <= g) continue;
      if (CollisionWorld.circleBox(b, x, z, r * 0.7)) g = b.y1;
    }
    return g;
  }

  // 水平推离：只处理与身体（feet+STEP_MAX .. feet+height）竖向重叠的盒子
  resolve(p, r, height) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.query(p.x, p.z, r)) {
        if (b.y1 <= p.y + STEP_MAX || b.y0 >= p.y + height) continue;
        const c = CollisionWorld.circleBox(b, p.x, p.z, r);
        if (!c) continue;
        p.x += c.nx * c.pen;
        p.z += c.nz * c.pen;
        moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  // 头顶：返回 (head, head+up] 之间最低的盒底
  ceilingAt(x, z, r, headY, up) {
    let c = Infinity;
    for (const b of this.query(x, z, r)) {
      if (b.y0 >= headY - 0.05 && b.y0 <= headY + up && CollisionWorld.circleBox(b, x, z, r * 0.7)) c = Math.min(c, b.y0);
    }
    return c;
  }

  // 调试：某点脚下压着哪些盒子
  probe(x, z, r = 0.4) {
    return this.query(x, z, r)
      .filter((b) => CollisionWorld.circleBox(b, x, z, r))
      .map((b) => ({ tag: b.tag, y0: +b.y0.toFixed(2), y1: +b.y1.toFixed(2) }));
  }
}
