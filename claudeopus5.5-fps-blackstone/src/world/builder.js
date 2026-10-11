// 关卡拼装器：同一份声明同时生成渲染几何（按材质 + 区块合并）与碰撞体。
// 材质用字符串键，build() 时才解析成真实材质——地图布局因此可以在 Node 测试里无渲染构建。

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SOLID } from './collision.js';
import { smoothstep } from '../core/util.js';

const CHUNK = 40;

function ensureIndex(g) {
  if (g.index) return g;
  const n = g.attributes.position.count;
  const idx = new Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(idx);
  return g;
}

/** 按法线主轴做世界坐标盒投影 UV，使相邻物体纹理连续、密度一致 */
export function boxProjectUV(g, scale = 2, offU = 0, offV = 0) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const inv = 1 / scale;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) {
      u = x;
      v = z;
    } else if (ax >= az) {
      u = z * Math.sign(nor.getX(i) || 1);
      v = y;
    } else {
      u = -x * Math.sign(nor.getZ(i) || 1);
      v = y;
    }
    uv[i * 2] = u * inv + offU;
    uv[i * 2 + 1] = v * inv + offV;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** 顶点色：贴地处压暗（伪 AO / 脏污），可叠加整体色调 */
export function shadeVertices(g, { ao = true, tint = 1, groundY = 0 } = {}) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const tr = Array.isArray(tint) ? tint[0] : tint;
  const tg = Array.isArray(tint) ? tint[1] : tint;
  const tb = Array.isArray(tint) ? tint[2] : tint;
  for (let i = 0; i < pos.count; i++) {
    let s = 1;
    if (ao) {
      const ny = nor.getY(i);
      const h = pos.getY(i) - groundY;
      if (ny < 0.5) s = 0.58 + 0.42 * smoothstep(0, 2.4, h);
      else s = 0.94 + 0.06 * smoothstep(0, 1.5, h);
      if (ny < -0.5) s *= 0.8;
    }
    col[i * 3] = s * tr;
    col[i * 3 + 1] = s * tg;
    col[i * 3 + 2] = s * tb;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** 楔形几何（与碰撞楔一致） */
export function wedgeGeometry(x0, y0, z0, x1, y1, z1, axis, rise, yLow = y0) {
  // 先在 axis='x', rise=+1 的规范空间写出，再映射
  const L = axis === 'x' ? x1 - x0 : z1 - z0;
  const W = axis === 'x' ? z1 - z0 : x1 - x0;
  const H = y1 - y0;
  const hl = yLow - y0;
  // 规范坐标 (a 沿坡长, y, b 沿宽)
  const quads = [
    // 底面
    [[0, 0, 0], [L, 0, 0], [L, 0, W], [0, 0, W]],
    // 斜面
    [[0, hl, W], [L, H, W], [L, H, 0], [0, hl, 0]],
    // 高端竖面
    [[L, 0, 0], [L, H, 0], [L, H, W], [L, 0, W]],
    // 低端竖面（若有高度）
    hl > 1e-4 ? [[0, 0, W], [0, hl, W], [0, hl, 0], [0, 0, 0]] : null,
    // 两侧
    [[0, 0, 0], [0, hl, 0], [L, H, 0], [L, 0, 0]],
    [[L, 0, W], [L, H, W], [0, hl, W], [0, 0, W]],
  ].filter(Boolean);
  const positions = [];
  const map = (a, y, b) => {
    let aa = rise >= 0 ? a : L - a;
    if (axis === 'x') return [x0 + aa, y0 + y, z0 + b];
    return [x0 + b, y0 + y, z0 + aa];
  };
  for (const q of quads) {
    const p = q.map(([a, y, b]) => map(a, y, b));
    // 两个三角形
    positions.push(...p[0], ...p[1], ...p[2], ...p[0], ...p[2], ...p[3]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  // 绕序可能因映射镜像而翻转：用质心外向检查修正
  const pos = g.attributes.position;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  const nor = g.attributes.normal;
  for (let i = 0; i < pos.count; i += 3) {
    const mx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3 - cx;
    const my = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 - cy;
    const mz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 - cz;
    const d = mx * nor.getX(i) + my * nor.getY(i) + mz * nor.getZ(i);
    if (d < 0) {
      // 交换 1、2 号顶点
      for (const attr of [pos]) {
        const tx = attr.getX(i + 1), ty = attr.getY(i + 1), tz = attr.getZ(i + 1);
        attr.setXYZ(i + 1, attr.getX(i + 2), attr.getY(i + 2), attr.getZ(i + 2));
        attr.setXYZ(i + 2, tx, ty, tz);
      }
    }
  }
  g.computeVertexNormals();
  return g;
}

export class LevelBuilder {
  constructor(world) {
    this.world = world;
    this.buckets = new Map();
    this.count = 0;
  }

  _push(mat, g, opts) {
    if (!mat) return;
    if (opts.uvMode !== 'keep' && opts.uvMode !== 'local') {
      boxProjectUV(g, opts.uv ?? 2, opts.uvOffU ?? 0, opts.uvOffV ?? 0);
    }
    if (!g.attributes.uv) boxProjectUV(g, opts.uv ?? 2);
    shadeVertices(g, { ao: opts.ao !== false, tint: opts.tint ?? 1, groundY: opts.groundY ?? 0 });
    // 只保留统一属性集，保证可合并
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
    }
    ensureIndex(g);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    const chunk = `${Math.floor(c.x / CHUNK)},${Math.floor(c.z / CHUNK)}`;
    const cast = opts.cast !== false;
    const key = `${mat}|${cast ? 1 : 0}|${opts.receive === false ? 0 : 1}|${chunk}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { mat, cast, receive: opts.receive !== false, geos: [] };
      this.buckets.set(key, b);
    }
    b.geos.push(g);
    this.count++;
  }

  /**
   * 轴对齐盒子。opts: collide(默认 true) flags surface entity uv uvMode tint cast receive ao
   */
  box(x0, y0, z0, x1, y1, z1, mat, opts = {}) {
    const ax0 = Math.min(x0, x1), ax1 = Math.max(x0, x1);
    const ay0 = Math.min(y0, y1), ay1 = Math.max(y0, y1);
    const az0 = Math.min(z0, z1), az1 = Math.max(z0, z1);
    let col = null;
    if (opts.collide !== false) {
      col = this.world.addBox(ax0, ay0, az0, ax1, ay1, az1, {
        flags: opts.flags ?? SOLID,
        surface: opts.surface,
        entity: opts.entity,
      });
    }
    if (mat && opts.render !== false) {
      const w = ax1 - ax0, h = ay1 - ay0, d = az1 - az0;
      const hs = Math.min(6, Math.max(1, Math.ceil(h / 1.2)));
      const g = new THREE.BoxGeometry(w, h, d, 1, opts.ao === false ? 1 : hs, 1);
      g.translate((ax0 + ax1) / 2, (ay0 + ay1) / 2, (az0 + az1) / 2);
      this._push(mat, g, opts);
    }
    return col;
  }

  /** 坡道（楔形），见 CollisionWorld.addRamp */
  ramp(x0, y0, z0, x1, y1, z1, axis, rise, mat, opts = {}) {
    const col = this.world.addRamp(x0, y0, z0, x1, y1, z1, axis, rise, {
      flags: opts.flags ?? SOLID,
      surface: opts.surface ?? 'metal',
      yLow: opts.yLow,
    });
    if (mat) {
      const g = wedgeGeometry(
        Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1),
        Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1),
        axis, rise, opts.yLow ?? Math.min(y0, y1),
      );
      this._push(mat, g, opts);
    }
    return col;
  }

  /** 竖直圆柱；碰撞用外接盒近似 */
  cylinder(x, y0, z, r, h, mat, opts = {}) {
    let col = null;
    if (opts.collide !== false) {
      const k = opts.colliderScale ?? 0.9;
      col = this.world.addBox(x - r * k, y0, z - r * k, x + r * k, y0 + h, z + r * k, {
        flags: opts.flags ?? SOLID,
        surface: opts.surface ?? 'metal',
        entity: opts.entity,
      });
    }
    if (mat) {
      const g = new THREE.CylinderGeometry(opts.rTop ?? r, r, h, opts.seg ?? 20, Math.max(1, Math.ceil(h / 1.5)), opts.open ?? false);
      // 原生 UV 按周长/高度换算成世界尺度
      const uv = g.attributes.uv, s = opts.uv ?? 2;
      const circ = Math.PI * 2 * r;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / s, (uv.getY(i) * h) / s);
      g.translate(x, y0 + h / 2, z);
      this._push(mat, g, { ...opts, uvMode: 'keep' });
    }
    return col;
  }

  /** 任意装饰几何（已在世界坐标） */
  geo(g, mat, opts = {}) {
    if (opts.matrix) g.applyMatrix4(opts.matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    this._push(mat, g, { uvMode: opts.uvMode ?? 'keep', ...opts });
  }

  build(materials) {
    const group = new THREE.Group();
    group.name = 'level';
    for (const b of this.buckets.values()) {
      const m = materials[b.mat];
      if (!m) {
        console.warn('缺少材质', b.mat);
        continue;
      }
      const merged = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}
