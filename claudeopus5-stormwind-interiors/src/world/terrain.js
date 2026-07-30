// 地形与地面铺装:城外丘陵 + 河谷、城内石板地、街道、广场、运河渠道、城堡台地。
// 地面不用 Shape 挖洞(运河交汇处三角化不稳),而是把城内地坪切成横向条带再做矩形差集 —— 纯矩形,永远稳。
import * as THREE from 'three';
import { fbm2D } from '../core/prng.js';
import { boxOn, aabbOn, stairs, balustrade, merge } from '../core/geom.js';
import { CITY, CANALS, LANES, subtractRects } from './plan.js';

const EXT_X = 206, EXT_Z = 201, EXT_D = 351;
export const WATER_Y = -0.42;
export const CANAL_DEPTH = 3.4;

/** 水域并集的互不重叠划分(渠底 / 水面 / 地面挖洞共用)。 */
export function waterPartition() {
  const out = [];
  for (const c of CANALS) for (const piece of subtractRects(c, out.slice())) out.push(piece);
  return out;
}

/** 城外地形高度场(城内恒为 0,河谷下切)。 */
export function makeHeightField(seed = 99) {
  const hills = fbm2D(seed, 4, 0.5, 2.1);
  const ridge = fbm2D(seed + 7, 3, 0.55, 2.3);
  return function height(x, z) {
    const d = Math.max(Math.abs(x) / (EXT_X + 2), Math.abs(z) / (EXT_Z + 2), (Math.abs(x) + Math.abs(z)) / (EXT_D + 6));
    if (d <= 1) return 0;
    const fall = Math.min(1, (d - 1) / 0.5);
    const r = Math.hypot(x, z);
    let h = (hills(x * 0.0022, z * 0.0022) - 0.42) * 62 + (ridge(x * 0.006, z * 0.006) - 0.5) * 14;
    h = Math.max(h, -1.5) * fall * fall;
    // 河谷:主运河向城外延伸成河
    const rz = Math.abs(z - 21);
    if (rz < 36) {
      const t = Math.min(1, Math.max(0, (rz - 13) / 23));
      h = h * t + (-CANAL_DEPTH - 0.8) * (1 - t);
    }
    if (r > 640) h += (r - 640) * 0.04 * (0.35 + ridge(x * 0.0016, z * 0.0016));
    return h;
  };
}

/**
 * 城内地坪的横向条带(八边形的矩形逼近)。
 * inside = 石板铺装(八边形内);outside = 城墙外那圈草地,用来补上"城外地形被挖空"的矩形角部。
 */
function cityGroundBands(bands = 92) {
  const inside = [], outside = [];
  for (let i = 0; i < bands; i++) {
    const za = -EXT_Z + (2 * EXT_Z * i) / bands;
    const zb = -EXT_Z + (2 * EXT_Z * (i + 1)) / bands;
    const zm = Math.max(Math.abs(za), Math.abs(zb));
    const xw = Math.min(EXT_X, EXT_D - zm);
    if (xw > 0.5) inside.push([-xw, za, xw, zb]);
    if (xw < EXT_X - 0.5) {
      outside.push([-EXT_X, za, -Math.max(xw, 0), zb]);
      outside.push([Math.max(xw, 0), za, EXT_X, zb]);
    }
  }
  return { inside, outside };
}

export function buildTerrain(M, heightAt) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const boxes = [];
  const water = waterPartition();

  /* ---------- 城外地形 ----------
   * 关键:城区范围内的网格整片挖空。否则这张 2800m 的大平面会从运河挖洞里顶出来,
   * 把水面盖成一条草地(教堂门前的支渠就是这么"变绿"的)。
   */
  {
    const size = 2800, seg = 144, step = size / seg, half = size / 2;
    const HX = 203, HZ = 198;                   // 挖空矩形(略小于城内地坪的 206/201,保证被盖住)
    const v = [], uv = [];
    const pt = (x, z) => { v.push(x, heightAt(x, z) - 0.06, z); uv.push(x, z); };
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg; j++) {
        const x0 = -half + i * step, x1 = x0 + step;
        const z0 = -half + j * step, z1 = z0 + step;
        const inside = Math.max(Math.abs(x0), Math.abs(x1)) <= HX && Math.max(Math.abs(z0), Math.abs(z1)) <= HZ;
        if (inside) continue;
        pt(x0, z0); pt(x0, z1); pt(x1, z1);
        pt(x0, z0); pt(x1, z1); pt(x1, z0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.grassFar);
    m.receiveShadow = true;
    m.name = 'outland';
    group.add(m);
  }

  /* ---------- 城内地坪(条带 − 水域) ---------- */
  {
    const bands = cityGroundBands();
    const parts = [], lawn = [];
    for (const band of bands.inside) {
      for (const r of subtractRects(band, CANALS)) {
        parts.push(boxOn(r[2] - r[0] + 0.02, 0.4, r[3] - r[1] + 0.02, (r[0] + r[2]) / 2, -0.38, (r[1] + r[3]) / 2));
      }
    }
    for (const band of bands.outside) {
      for (const r of subtractRects(band, CANALS)) {
        lawn.push(boxOn(r[2] - r[0] + 0.02, 0.4, r[3] - r[1] + 0.02, (r[0] + r[2]) / 2, -0.40, (r[1] + r[3]) / 2));
      }
    }
    const m = new THREE.Mesh(merge(parts), M.flagstoneDark);
    m.receiveShadow = true;
    m.name = 'cityGround';
    group.add(m);
    const lm = new THREE.Mesh(merge(lawn), M.grassFar);   // 与城外地形同材质,否则城墙外会框出一圈色差矩形
    lm.receiveShadow = true;
    lm.name = 'cityLawn';
    group.add(lm);
  }

  /* ---------- 街道铺装 ---------- */
  {
    const road = [];
    for (const l of LANES) {
      const x0 = Math.min(l.a[0], l.b[0]) - l.w / 2, x1 = Math.max(l.a[0], l.b[0]) + l.w / 2;
      const z0 = Math.min(l.a[1], l.b[1]) - l.w / 2, z1 = Math.max(l.a[1], l.b[1]) + l.w / 2;
      for (const s of subtractRects([x0, z0, x1, z1], CANALS)) {
        road.push(boxOn(s[2] - s[0], 0.07, s[3] - s[1], (s[0] + s[2]) / 2, 0.0, (s[1] + s[3]) / 2));
      }
    }
    const m = new THREE.Mesh(merge(road), M.cobble);
    m.receiveShadow = true;
    m.name = 'roads';
    group.add(m);
  }

  /* ---------- 交易广场 ---------- */
  {
    const g = new THREE.CircleGeometry(CITY.plaza.r, 60);
    g.rotateX(-Math.PI / 2);
    g.translate(CITY.plaza.x, 0.1, CITY.plaza.z);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i), pos.getZ(i));
    const m = new THREE.Mesh(g, M.flagstone);
    m.receiveShadow = true;
    group.add(m);

    const ring = new THREE.RingGeometry(CITY.plaza.r - 3.2, CITY.plaza.r - 1.6, 64);
    ring.rotateX(-Math.PI / 2);
    ring.translate(CITY.plaza.x, 0.12, CITY.plaza.z);
    const ruv = ring.attributes.uv, rpos = ring.attributes.position;
    for (let i = 0; i < ruv.count; i++) ruv.setXY(i, rpos.getX(i), rpos.getZ(i));
    group.add(new THREE.Mesh(ring, M.stoneTrim));
  }

  /* ---------- 王家花园草地 ---------- */
  {
    const [x0, z0, x1, z1] = CITY.park;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 26, 26);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i), lz = pos.getZ(i);
      const edge = Math.min(1, Math.min((x1 - x0) / 2 - Math.abs(lx), (z1 - z0) / 2 - Math.abs(lz)) / 14);
      pos.setY(i, 0.12 + Math.sin(lx * 0.055) * Math.cos(lz * 0.045) * 1.2 * Math.max(0, edge));
      uv.setXY(i, lx, lz);
    }
    g.computeVertexNormals();
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const m = new THREE.Mesh(g, M.grass);
    m.receiveShadow = true;
    group.add(m);
  }

  /* ---------- 运河:渠底 + 驳岸 + 压顶 ---------- */
  {
    const bed = [], quay = [], cap = [];
    for (const c of water) {
      bed.push(boxOn(c[2] - c[0], 0.7, c[3] - c[1], (c[0] + c[2]) / 2, -CANAL_DEPTH - 0.7, (c[1] + c[3]) / 2));
      // 渠底也能站人:跳下运河不会一路掉穿世界
      boxes.push(aabbOn((c[0] + c[2]) / 2, -CANAL_DEPTH - 0.7, (c[1] + c[3]) / 2, c[2] - c[0], 0.7, c[3] - c[1]));
    }
    const T = 1.7;
    for (const c of CANALS) {
      const others = CANALS.filter((o) => o !== c);
      const strips = [
        [c[0] - T, c[1] - T, c[0], c[3] + T],
        [c[2], c[1] - T, c[2] + T, c[3] + T],
        [c[0], c[1] - T, c[2], c[1]],
        [c[0], c[3], c[2], c[3] + T],
      ];
      for (const s of strips) {
        for (const r of subtractRects(s, others)) {
          const w = r[2] - r[0], d = r[3] - r[1];
          const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2;
          quay.push(boxOn(w, CANAL_DEPTH + 0.75, d, cx, -CANAL_DEPTH - 0.7, cz));
          cap.push(boxOn(w, 0.55, d, cx, 0.02, cz));
          boxes.push(aabbOn(cx, 0.02, cz, w, 0.57, d));
        }
      }
    }
    const bm = new THREE.Mesh(merge(bed), M.dirt); bm.receiveShadow = true; group.add(bm);
    const qm = new THREE.Mesh(merge(quay), M.stoneDark); qm.receiveShadow = true; qm.castShadow = true; group.add(qm);
    const cm = new THREE.Mesh(merge(cap), M.stoneTrim); cm.receiveShadow = true; cm.castShadow = true; group.add(cm);
  }

  /* ---------- 城堡台地 + 大台阶 ---------- */
  {
    const t = CITY.keep.terrace, H = CITY.keep.height;
    const w = t[2] - t[0], d = t[3] - t[1];
    const cx = (t[0] + t[2]) / 2, cz = (t[1] + t[3]) / 2;
    const parts = [boxOn(w, H, d, cx, 0, cz), boxOn(w + 1.8, 0.7, d + 1.8, cx, H - 0.7, cz)];
    boxes.push(aabbOn(cx, 0, cz, w, H, d));
    boxes.push(aabbOn(cx, H - 0.7, cz, w + 1.8, 0.7, d + 1.8));
    const m = new THREE.Mesh(merge(parts), M.stone);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);

    const stepN = 30, rise = H / stepN, run = 0.62;
    const st = stairs(stepN, 26, rise, run, { x: 0, y: 0, z: t[3] + stepN * run, ry: Math.PI });
    const sm = new THREE.Mesh(merge(st.geos), M.stone);
    sm.castShadow = true; sm.receiveShadow = true;
    group.add(sm);
    boxes.push(...st.boxes);

    const railGeos = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < stepN; i += 5) {
        const y = i * rise;
        const z = t[3] + (stepN - i) * run - run * 2.5;
        for (const g of balustrade(run * 5.2, 1.0, { x: s * 13.7, y: y + 0.25, z, ry: Math.PI / 2 })) railGeos.push(g);
      }
    }
    const rm = new THREE.Mesh(merge(railGeos), M.stoneTrim);
    rm.castShadow = true;
    group.add(rm);
  }

  return { group, boxes, water };
}
