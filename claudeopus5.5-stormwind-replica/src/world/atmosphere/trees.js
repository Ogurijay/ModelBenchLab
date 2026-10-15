// 风格化树木：3 种变体（圆冠橡树 / 塔形冷杉 / 小圆树），每种 = 树干 + 树冠两个 InstancedMesh。
// 树冠顶点色做「上亮下暗」的假 AO + 斑驳色块，实例色给每棵树不同的绿。
// 分布：雄狮安息地公园、英雄谷盆地两侧、城外艾尔文森林、法师区广场边。
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

// 有机团块：icosahedron 按位置哈希抖动顶点（共享顶点抖得一样 → 不开裂），再合并顶点算平滑法线
function blob(r, detail, jitter, seed) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (hash3(x * 3 + seed, y * 3, z * 3) - 0.5) * jitter;
    p.setXYZ(i, x * k, y * k * 0.92, z * k);
  }
  return g;
}

// 顶点色：按高度做明暗 + 随机斑块
function shadeCrown(g, y0, y1, seed) {
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getY(i) - y0) / (y1 - y0), 0, 1);
    const n = hash3(Math.round(p.getX(i) * 2) + seed, Math.round(p.getY(i) * 2), Math.round(p.getZ(i) * 2));
    const l = 0.5 + 0.55 * Math.pow(t, 0.8) + (n - 0.5) * 0.18;
    col[i * 3] = l * (0.95 + 0.1 * n);
    col[i * 3 + 1] = l;
    col[i * 3 + 2] = l * (0.85 + 0.1 * n);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function prepMerge(list) {
  return mergeGeometries(
    list.map((g) => {
      const o = g;
      if (!o.attributes.normal) o.computeVertexNormals();
      for (const n of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(n)) o.deleteAttribute(n);
      return o.index ? o.toNonIndexed() : o;
    }),
  );
}

function trunkGeo(r0, r1, h) {
  const g = new THREE.CylinderGeometry(r1, r0, h + 0.4, 7, 1);
  g.translate(0, (h + 0.4) / 2 - 0.4, 0); // 底部埋入地面 0.4 m
  return g;
}

// 变体：{ trunk, crown, h }（高度用于实例缩放参考）
function makeVariants() {
  // A 圆冠橡树：4 个团块
  const aBlobs = [
    blob(2.6, 2, 0.35, 1).translate(0, 6.2, 0),
    blob(2.0, 1, 0.35, 2).translate(1.7, 5.4, 0.6),
    blob(2.1, 1, 0.35, 3).translate(-1.5, 5.6, -0.7),
    blob(1.8, 1, 0.35, 4).translate(0.3, 7.6, -0.4),
  ];
  aBlobs.forEach((g) => g.computeVertexNormals());
  const aCrown = shadeCrown(prepMerge(aBlobs), 3.5, 9.2, 1);
  const aTrunkParts = [trunkGeo(0.42, 0.26, 5.2)];
  // 两根斜枝
  aTrunkParts.push(new THREE.CylinderGeometry(0.1, 0.16, 2.2, 5).rotateZ(-0.8).translate(0.8, 4.3, 0.2));
  aTrunkParts.push(new THREE.CylinderGeometry(0.1, 0.15, 2.0, 5).rotateZ(0.75).translate(-0.7, 4.5, -0.3));
  const aTrunk = mergeGeometries(aTrunkParts.map((g) => (g.deleteAttribute('uv'), g.index ? g.toNonIndexed() : g)));

  // B 冷杉：3 层圆锥（艾尔文森林的高树）
  const bCones = [
    [2.9, 4.2, 2.2],
    [2.3, 3.8, 4.4],
    [1.6, 3.4, 6.5],
    [0.9, 2.4, 8.5],
  ].map(([r, h, y], i) => {
    let g = new THREE.ConeGeometry(r, h, 9, 2);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k);
      const z = p.getZ(k);
      const j = 1 + (hash3(x * 5 + i, p.getY(k), z * 5) - 0.5) * 0.3;
      p.setX(k, x * j);
      p.setZ(k, z * j);
    }
    g.translate(0, y + h / 2, 0);
    g.computeVertexNormals();
    return g;
  });
  const bCrown = shadeCrown(prepMerge(bCones), 2.2, 11, 5);
  const bTrunk = trunkGeo(0.32, 0.16, 4.0);
  bTrunk.deleteAttribute('uv');

  // C 小圆树：一个大团块 + 一个小团块
  const cBlobs = [blob(2.0, 2, 0.4, 7).translate(0, 4.2, 0), blob(1.3, 1, 0.4, 8).translate(0.8, 5.4, 0.3)];
  cBlobs.forEach((g) => g.computeVertexNormals());
  const cCrown = shadeCrown(prepMerge(cBlobs), 2.4, 6.6, 9);
  const cTrunk = trunkGeo(0.24, 0.16, 3.2);
  cTrunk.deleteAttribute('uv');

  // D 密林阔叶（低面数）：两个 detail-1 团块，冠幅大、树干短——成片种时树冠连成整体
  const dBlobs = [blob(3.4, 1, 0.45, 11).translate(0, 6.4, 0), blob(2.5, 1, 0.45, 12).translate(1.2, 8.2, -0.6)];
  dBlobs.forEach((g) => g.computeVertexNormals());
  const dCrown = shadeCrown(prepMerge(dBlobs), 3.2, 10.6, 13);
  const dTrunk = new THREE.CylinderGeometry(0.22, 0.36, 4.4, 5, 1).translate(0, 4.4 / 2 - 0.4, 0);
  dTrunk.deleteAttribute('uv');

  // E 密林冷杉（低面数）：3 层 6 边圆锥，比 B 更瘦高，用来在林冠上"冒尖"
  const eCones = [
    [2.6, 4.6, 2.0],
    [1.9, 4.2, 4.9],
    [1.1, 3.6, 7.8],
  ].map(([r, h, y], i) => {
    let g = new THREE.ConeGeometry(r, h, 6, 1);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const j = 1 + (hash3(p.getX(k) * 5 + i + 20, p.getY(k), p.getZ(k) * 5) - 0.5) * 0.3;
      p.setX(k, p.getX(k) * j);
      p.setZ(k, p.getZ(k) * j);
    }
    g.translate(0, y + h / 2, 0);
    g.computeVertexNormals();
    return g;
  });
  const eCrown = shadeCrown(prepMerge(eCones), 2.0, 11.4, 21);
  const eTrunk = new THREE.CylinderGeometry(0.14, 0.28, 3.4, 5, 1).translate(0, 3.4 / 2 - 0.4, 0);
  eTrunk.deleteAttribute('uv');

  return [
    { trunk: aTrunk, crown: aCrown },
    { trunk: bTrunk, crown: bCrown },
    { trunk: cTrunk, crown: cCrown },
    { trunk: dTrunk, crown: dCrown },
    { trunk: eTrunk, crown: eCrown },
  ];
}

// ---------- 分布 ----------
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}
function polyDist(x, z, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    d = Math.min(d, segDist(x, z, ax, az, bx, bz));
  }
  return d;
}

// 简易泊松：网格加速的最小间距判定
class Spacing {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  ok(x, z, r) {
    const c = this.cell;
    const i0 = Math.floor(x / c);
    const k0 = Math.floor(z / c);
    const span = Math.ceil(r / c);
    for (let i = i0 - span; i <= i0 + span; i++) {
      for (let k = k0 - span; k <= k0 + span; k++) {
        const arr = this.map.get(i * 73856093 + k);
        if (!arr) continue;
        for (const [px, pz, pr] of arr) if (Math.hypot(px - x, pz - z) < Math.max(r, pr)) return false;
      }
    }
    return true;
  }
  add(x, z, r) {
    const key = Math.floor(x / this.cell) * 73856093 + Math.floor(z / this.cell);
    let arr = this.map.get(key);
    if (!arr) this.map.set(key, (arr = []));
    arr.push([x, z, r]);
  }
}

export function planTrees(ctx) {
  const C = ctx.coords;
  const rng = ctx.rng('atmo:trees');
  const sp = new Spacing(8);
  const out = []; // { x, y, z, v, s, ry }
  const lampNear = (x, z, r) => C.LAMPS.some((L) => Math.hypot(L.x - x, L.z - z) < r);
  const push = (x, y, z, v, s, gap) => {
    sp.add(x, z, gap);
    out.push({ x, y, z, v, s, ry: rng() * Math.PI * 2 });
  };

  // 1) 雄狮安息地公园：多边形内缩 10 m（滨河街 8 m），避开纪念碑 25 m
  {
    const poly = C.DISTRICTS.lionsrest.poly;
    const [mx, mz] = C.LANDMARKS.lionsMemorial.center;
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    let n = 0;
    for (let tries = 0; tries < 6000 && n < 78; tries++) {
      const x = Math.min(...xs) + rng() * (Math.max(...xs) - Math.min(...xs));
      const z = Math.min(...zs) + rng() * (Math.max(...zs) - Math.min(...zs));
      if (!C.pointInPoly(x, z, poly) || polyDist(x, z, poly) < 10) continue;
      if (Math.hypot(x - mx, z - mz) < 25) continue;
      // 留出纪念碑南北 / 东西两条主步道
      if (Math.abs(x - mx) < 3.5 || Math.abs(z - mz) < 3.5) continue;
      if (lampNear(x, z, 4) || !sp.ok(x, z, 6.5)) continue;
      const v = rng() < 0.6 ? 0 : rng() < 0.5 ? 2 : 1;
      push(x, C.DISTRICTS.lionsrest.top, z, v, 0.85 + rng() * 0.4, 6.5);
      n++;
    }
  }

  // 2) 英雄谷盆地两侧：盆地局部坐标，避开桥下中线 ±10 m 和雕像
  {
    const V = C.VALLEY;
    let n = 0;
    for (let tries = 0; tries < 3000 && n < 32; tries++) {
      const side = rng() < 0.5 ? -1 : 1;
      const lx = side * (13 + rng() * (V.halfWidth - 17));
      const lz = 12 + rng() * (V.gateZ - 26);
      if (V.statues.some((s) => Math.hypot(s.lx - lx, s.lz - lz) < 7)) continue;
      const [x, z] = C.valleyToWorld(lx, lz);
      if (!sp.ok(x, z, 8)) continue;
      push(x, C.VALLEY_FLOOR_Y, z, rng() < 0.7 ? 0 : 1, 1.15 + rng() * 0.35, 8);
      n++;
    }
  }

  // 3) 法师区圣所广场边：四角各一对小圆树（离开广场角上的路灯）
  {
    const [x0, z0, x1, z1] = C.DISTRICTS.mage.plaza.rect;
    const pts = [];
    for (const [cx, cz, sx, sz] of [[x0, z0, 1, 1], [x1, z0, -1, 1], [x1, z1, -1, -1], [x0, z1, 1, -1]]) {
      pts.push([cx + sx * 4, cz + sz * 11], [cx + sx * 11, cz + sz * 4]);
    }
    for (const [x, z] of pts) push(x, C.DISTRICTS.mage.top, z, 2, 0.8 + rng() * 0.2, 5);
  }

  // 4a) 城门两侧密林："城门耸立在艾尔文森林树冠之上"。离城门 300 m 内成片种低面数树（D 阔叶 / E 冷杉），
  //     间距 4.5–6 m、冠幅 6–9 m → 树冠互相搭接成整体；缩放 0.75–1.75 做出高低分层，少量林间空地。
  //     靠路的头一排用高面数的 A / B，第一人称走在路上看到的是细一些的树。
  const [gx, gz] = C.GATE.center;
  const DENSE_R = 300;
  const forestOk = (x, z, wallGap) => {
    if (C.regionAt(x, z).region !== 'outside') return null;
    if (polyDist(x, z, C.WALL_POLY) < wallGap) return null;
    if (C.roadDistance(x, z) < 9) return null;
    const h = C.terrainHeight(x, z); // 与可视地形同源（含海岸缓坡）
    if (h < C.WATER_Y + 1.2) return null; // 不种在沙滩和水里
    return h;
  };
  {
    const clearing = (x, z) => Math.sin(x * 0.031 + 0.4) * Math.cos(z * 0.027 + 1.9) + 0.5 * Math.sin((x + z) * 0.052);
    let n = 0;
    for (let tries = 0; tries < 60000 && n < 2500; tries++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * DENSE_R;
      const x = gx + Math.cos(a) * r;
      const z = gz + Math.sin(a) * r;
      // 外缘 230–300 m 逐渐稀疏，接到远处的疏林；clearing < -0.85 的地方留林间空地
      if (rng() > 1 - THREE.MathUtils.smoothstep(r, 230, DENSE_R) * 0.85) continue;
      if (clearing(x, z) < -0.85) continue;
      if (r < 38) continue; // 城门外的铺装前庭留空
      // 城墙 / 谷墙外留 40 m 林缘空地，40–80 m 逐渐变密（Critic R5：森林贴着墙脚盖住城墙轮廓）
      const wd = polyDist(x, z, C.WALL_POLY);
      if (rng() > THREE.MathUtils.smoothstep(wd, 40, 80)) continue;
      const h = forestOk(x, z, 40);
      if (h === null) continue;
      const rd = C.roadDistance(x, z);
      const edge = rd < 22;
      const gap = 4.6 + rng() * 1.2;
      if (!sp.ok(x, z, gap)) continue;
      const fir = rng() < 0.38;
      const v = edge ? (fir ? 1 : 0) : fir ? 4 : 3;
      // 冷杉略高于阔叶层冒尖；阔叶层自身 0.75–1.45 起伏
      const s = (fir ? 1.25 : 1.0) * (0.6 + rng() * 0.8); // 树高 ±40%
      push(x, h - 0.6, z, v, s, gap); // 根部埋 0.6 m：8 m 网格在坡上的线性插值比解析高度低最多约 0.5 m
      n++;
    }
  }

  // 4) 城外艾尔文森林：成片的林子（低频噪声控密度），离城墙 > 25 m、离城门外道路 > 10 m、离海 > 15 m
  {
    const [sx0, sz0, sx1, sz1] = C.SEA_RECT;
    const grove = (x, z) => Math.sin(x * 0.012 + 1.3) * Math.cos(z * 0.014 - 0.7) + 0.6 * Math.sin((x - z) * 0.021 + 2.1) + 0.35 * Math.cos(x * 0.043 + z * 0.037);
    let n = 0;
    const target = 760;
    for (let tries = 0; tries < 90000 && n < target; tries++) {
      // 以城市中心为圆心，半径 200 ~ 820 m 的环带；靠近城墙的一侧更密（从城里看得到）
      const a = rng() * Math.PI * 2;
      const r = 200 + Math.pow(rng(), 0.85) * 620;
      const x = 60 + Math.cos(a) * r;
      const z = -60 + Math.sin(a) * r;
      if (Math.hypot(x - gx, z - gz) < DENSE_R - 20) continue; // 城门密林已覆盖
      const g = grove(x, z);
      if (rng() > THREE.MathUtils.smoothstep(g, -0.15, 0.6) * 0.95 + 0.03) continue;
      if (C.regionAt(x, z).region !== 'outside') continue;
      if (x > sx0 - 15 && x < sx1 + 15 && z > sz0 - 15 && z < sz1 + 15) continue;
      if (polyDist(x, z, C.WALL_POLY) < 40) continue;
      // 城门外道路：英雄谷轴线延长线（lz > 170）两侧
      const [lx, lz] = C.worldToValley(x, z);
      if (lz > 160 && Math.abs(lx) < 16) continue;
      if (C.roadDistance(x, z) < 9) continue;
      const h = C.terrainHeight(x, z); // 与可视地形同源（含海岸缓坡）
      if (h < C.WATER_Y + 1.2) continue; // 不种在沙滩和水里
      if (!sp.ok(x, z, 6)) continue;
      const v = rng() < 0.55 ? 1 : rng() < 0.75 ? 0 : 2;
      push(x, h - 0.6, z, v, 0.9 + rng() * 0.6, 6); // 根部埋 0.6 m：8 m 网格在坡上的线性插值比解析高度低最多约 0.5 m
      n++;
    }
  }
  return out;
}

// ---------- 构建：一个 BatchedMesh 装下所有树 ----------
// Critic R2：上一版每变体一个 InstancedMesh，包围球覆盖全图 → 视锥 / 阴影都剔不掉，一帧 540 万三角形。
// 现在：树干 + 树冠烘成一份带顶点色的几何（单材质），塞进 BatchedMesh——
//   · 每棵树独立包围球，主视角、阴影相机、GTAO 法线 pass 都逐棵剔除（BatchedMesh.onBeforeShadow 也会剔）；
//   · 三级 LOD：< 75 m 高模、< 240 m 中模、更远超低模（20~40 三角形），每 0.3 s 按相机距离 setGeometryIdAt；
//   · 离城心 > 480 m 的远景树放进第二个 BatchedMesh，castShadow = false。
const BARK = new THREE.Color(0x5a4030);
const LOD_NEAR = 75;
const LOD_MID = 240;
const FAR_R = 480;

function bake(trunk, crown, green) {
  const t = trunk.index ? trunk.toNonIndexed() : trunk.clone();
  for (const n of Object.keys(t.attributes)) if (n !== 'position' && n !== 'normal') t.deleteAttribute(n);
  if (!t.attributes.normal) t.computeVertexNormals();
  const tc = new Float32Array(t.attributes.position.count * 3);
  for (let i = 0; i < tc.length; i += 3) tc.set([BARK.r, BARK.g, BARK.b], i);
  t.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const c = crown.index ? crown.toNonIndexed() : crown.clone();
  for (const n of Object.keys(c.attributes)) if (!['position', 'normal', 'color'].includes(n)) c.deleteAttribute(n);
  const col = c.attributes.color;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * green.r, col.getY(i) * green.g, col.getZ(i) * green.b);
  return mergeGeometries([t, c]);
}

// 超低模：detail-0 团块 / 单层圆锥 + 4 棱树干
function lowRound(r, cy, th) {
  let g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(1, 0.85, 1).translate(0, cy, 0);
  g.computeVertexNormals();
  g = shadeCrown(g, cy - r, cy + r, 31);
  const t = new THREE.CylinderGeometry(0.2, 0.32, th + 0.4, 4, 1).translate(0, (th + 0.4) / 2 - 0.4, 0);
  return [t, g];
}
function lowFir(r, h, y0, th) {
  let g = new THREE.ConeGeometry(r, h, 5, 1).translate(0, y0 + h / 2, 0);
  g.computeVertexNormals();
  g = shadeCrown(g, y0, y0 + h, 33);
  const t = new THREE.CylinderGeometry(0.12, 0.26, th + 0.4, 4, 1).translate(0, (th + 0.4) / 2 - 0.4, 0);
  return [t, g];
}

export function buildTrees(ctx, group) {
  const V = makeVariants();
  const plan = planTrees(ctx);
  const broad = new THREE.Color(0x52923a);
  const fir = new THREE.Color(0x2f6a3a);
  // 每变体三级：[近, 中, 远]
  const levels = [
    [bake(V[0].trunk, V[0].crown, broad), bake(V[3].trunk, V[3].crown, broad), bake(...lowRound(3.4, 6.6, 4.4), broad)],
    [bake(V[1].trunk, V[1].crown, fir), bake(V[4].trunk, V[4].crown, fir), bake(...lowFir(2.8, 8.5, 2.0, 3.0), fir)],
    [bake(V[2].trunk, V[2].crown, broad), bake(...lowRound(2.3, 4.4, 3.2), broad), bake(...lowRound(2.3, 4.4, 3.2), broad)],
    [bake(V[3].trunk, V[3].crown, broad), bake(V[3].trunk, V[3].crown, broad), bake(...lowRound(3.6, 7.0, 4.4), broad)],
    [bake(V[4].trunk, V[4].crown, fir), bake(V[4].trunk, V[4].crown, fir), bake(...lowFir(2.6, 9.0, 2.0, 2.6), fir)],
  ];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, name: 'atmo-trees' });
  const rng = ctx.rng('atmo:treecolor');
  // 实例色 = 乘到烘焙色上的色调抖动（偏黄绿 / 偏蓝绿 / 深浅），树干也会被轻微带上，幅度控制在 ±25%
  const tints = [
    [1, 1, 1], [1.12, 1.04, 0.8], [0.86, 0.98, 0.92], [0.92, 0.9, 0.95], [1.22, 1.08, 0.72], [0.8, 0.9, 0.85],
  ].map(([r, g, b]) => new THREE.Color(r, g, b));

  const bright = new THREE.Color(1.38, 1.24, 0.66);
  const [cx0, cz0] = [60, -60];
  const sets = [
    { list: plan.filter((t) => Math.hypot(t.x - cx0, t.z - cz0) <= FAR_R), shadow: true, name: 'atmo-trees' },
    { list: plan.filter((t) => Math.hypot(t.x - cx0, t.z - cz0) > FAR_R), shadow: false, name: 'atmo-trees-far' },
  ];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const batches = [];
  for (const set of sets) {
    if (!set.list.length) continue;
    let nv = 0;
    for (const lv of levels) for (const g of new Set(lv)) nv += g.attributes.position.count;
    const bm = new THREE.BatchedMesh(set.list.length, nv, 0, mat);
    bm.name = set.name;
    bm.sortObjects = false; // 不透明：省掉每帧排序
    bm.perObjectFrustumCulled = true;
    bm.castShadow = set.shadow;
    bm.receiveShadow = true;
    const ids = levels.map((lv) => {
      const map = new Map();
      return lv.map((g) => {
        if (!map.has(g)) map.set(g, bm.addGeometry(g));
        return map.get(g);
      });
    });
    const inst = [];
    const c = new THREE.Color();
    for (const t of set.list) {
      const id = bm.addInstance(ids[t.v][2]);
      q.setFromAxisAngle(up, t.ry);
      m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.s * (0.9 + rng() * 0.2), t.s, t.s * (0.9 + rng() * 0.2)));
      bm.setMatrixAt(id, m);
      // 阔叶树 35% 用亮黄绿（打破"均匀绿地毯"）
      if (t.v !== 1 && t.v !== 4 && rng() < 0.35) c.copy(bright);
      else c.copy(tints[Math.floor(rng() * tints.length)]);
      c.multiplyScalar(0.92 + rng() * 0.16);
      bm.setColorAt(id, c);
      inst.push({ id, x: t.x, z: t.z, y: t.y, lods: ids[t.v], lod: 2 });
    }
    bm.computeBoundingSphere();
    bm.computeBoundingBox();
    group.add(bm);
    batches.push({ bm, inst });
  }

  let timer = 0;
  function update(dt) {
    timer -= dt;
    if (timer > 0 && dt !== 0) return;
    timer = 0.3;
    const p = ctx.camera.position;
    for (const { bm, inst } of batches) {
      for (const it of inst) {
        const d = Math.hypot(it.x - p.x, it.y - p.y, it.z - p.z);
        const lod = d < LOD_NEAR ? 0 : d < LOD_MID ? 1 : 2;
        if (lod !== it.lod) {
          it.lod = lod;
          bm.setGeometryIdAt(it.id, it.lods[lod]);
        }
      }
    }
  }
  update(0);
  return { count: plan.length, meshes: batches.map((b) => b.bm), update };
}
