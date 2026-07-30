// 城市规划层:先有骨架(城墙 / 运河 / 街道 / 区划),再往地块上长房子。
// 坐标约定: +Z 为南(城门),-Z 为北(王座城堡),+X 为东。1 单位 = 1 米。
import { Rng } from '../core/prng.js';

/* ---------------- 宏观常量 ---------------- */

export const CITY = {
  // 城墙轮廓(顺时针),八边形棱堡:|x|≤200,|z|≤195,|x|+|z|≤345
  wall: [
    [-150, -195], [150, -195], [200, -145], [200, 145],
    [150, 195], [-150, 195], [-200, 145], [-200, -145],
  ],
  gate: { x: 0, z: 195, width: 26 },
  plaza: { x: 0, z: 80, r: 46 },
  keep: { terrace: [-78, -196, 78, -104], height: 9 },
  cathedral: { x: -122, z: -46, w: 42, d: 70 },
  park: [70, -190, 196, -34],
  harbor: [-196, 46, -152, 100],
};

/**
 * 水域(轴对齐矩形,允许互相重叠 —— 地面/驳岸都用矩形差集求,重叠反而保证水面连通)。
 * [x0,z0,x1,z1]
 */
export const CANALS = [
  [-206, 10, 206, 32],       // 主运河:东西贯通,穿两侧水门
  [-92, -60, -72, 14],       // 支渠:大教堂东侧(不能压到教堂占地上)
  [-196, 46, -152, 100],     // 西港池
  [-186, 28, -162, 50],      // 港池入渠水道
];

/** 桥梁: dir = 桥面延伸方向 */
export const BRIDGES = [
  { x: 0, z: 21, dir: 'z', width: 26, grand: true, name: '英雄桥' },
  { x: -122, z: 21, dir: 'z', width: 13, name: '圣光桥' },
  { x: 86, z: 21, dir: 'z', width: 11, name: '磨坊桥' },
  { x: -82, z: -46, dir: 'x', width: 11, name: '教区桥' },
  { x: -82, z: -18, dir: 'x', width: 9, name: '静修桥' },
  { x: -174, z: 41, dir: 'x', width: 11, name: '船坞桥' },
];

/** 街道(全部轴对齐): {a,b,w,name,frontage,depth} */
export const LANES = [
  { a: [0, 196], b: [0, 128], w: 24, name: '英雄大道' },
  { a: [0, 128], b: [0, 34], w: 20, name: '英雄大道' },
  { a: [0, 10], b: [0, -102], w: 20, name: '王庭大道' },
  { a: [-198, 41], b: [198, 41], w: 10, name: '运河南岸街', frontage: true, depth: 12 },
  { a: [-144, 1], b: [198, 1], w: 10, name: '运河北岸街', frontage: true, depth: 12 },
  { a: [-146, 82], b: [-52, 82], w: 12, name: '铁砧大街', frontage: true, depth: 13 },
  { a: [52, 82], b: [176, 82], w: 12, name: '旧城大街', frontage: true, depth: 13 },
  { a: [-140, 132], b: [140, 132], w: 10, name: '南市巷', frontage: true, depth: 12 },
  { a: [-140, 172], b: [140, 172], w: 9, name: '城根巷', frontage: true, depth: 11 },
  { a: [124, 52], b: [124, 178], w: 9, name: '东城巷', frontage: true, depth: 11 },
  { a: [-118, 52], b: [-118, 178], w: 9, name: '西城巷', frontage: true, depth: 11 },
  { a: [86, 96], b: [86, 178], w: 8, name: '钟匠巷', frontage: true, depth: 10 },
  { a: [-86, 96], b: [-86, 178], w: 8, name: '风箱巷', frontage: true, depth: 10 },
  { a: [-146, 112], b: [-52, 112], w: 9, name: '熔炉巷', frontage: true, depth: 12 },
  { a: [52, 112], b: [176, 112], w: 9, name: '老井巷', frontage: true, depth: 12 },
  { a: [-144, 46], b: [-144, 102], w: 11, name: '码头街' },
  // 大教堂占地 x∈[-146,-98],道路必须让开,不能从中殿里穿过去
  { a: [-186, -46], b: [-150, -46], w: 11, name: '大教堂道' },
  { a: [-96, -46], b: [-40, -46], w: 11, name: '大教堂道', frontage: true, depth: 12 },
  { a: [-122, 10], b: [-122, -8], w: 14, name: '圣光道' },
  { a: [114, 10], b: [114, -56], w: 11, name: '花园道' },
  { a: [-38, -96], b: [-38, -20], w: 9, name: '书院巷', frontage: true, depth: 11 },
];

/** 区划:用于 HUD 地名与建筑风格(先匹配者优先)。 */
export const DISTRICTS = [
  { id: 'keep', name: '王座城堡', sub: 'THE ROYAL KEEP', rect: [-92, -200, 92, -100], style: 'castle' },
  { id: 'cathedral', name: '大教堂广场', sub: 'CATHEDRAL SQUARE', rect: [-200, -104, -30, -6], style: 'holy' },
  { id: 'park', name: '王家花园', sub: "KING'S GARDEN", rect: [64, -200, 200, -30], style: 'garden' },
  { id: 'harbor', name: '西港码头', sub: 'WESTQUAY HARBOR', rect: [-200, 42, -136, 106], style: 'harbor' },
  { id: 'gate', name: '狮王之门', sub: 'THE LION GATE', rect: [-70, 126, 70, 200], style: 'civic' },
  { id: 'trade', name: '交易广场', sub: 'TRADE SQUARE', rect: [-62, 34, 62, 126], style: 'trade' },
  { id: 'canal', name: '运河区', sub: 'CANAL DISTRICT', rect: [-200, -6, 200, 62], style: 'canal' },
  { id: 'forge', name: '熔炉工坊区', sub: 'THE FORGE WARD', rect: [-200, 46, -62, 196], style: 'forge' },
  { id: 'old', name: '旧城民居', sub: 'OLD TOWN', rect: [62, 46, 200, 196], style: 'house' },
  { id: 'street', name: '王都街巷', sub: 'STORMHOLD', rect: [-260, -260, 260, 260], style: 'house' },
];

/** 各区建筑风格调色板。 */
export const PALETTES = {
  trade: { plaster: ['plasterWarm', 'plasterPale', 'plaster'], roof: ['roofBlue', 'roofBlue', 'roofTeal'], floors: [2, 3, 3], shop: 0.8 },
  canal: { plaster: ['plaster', 'plasterPale', 'plasterRose'], roof: ['roofBlue', 'roofTeal'], floors: [2, 3], shop: 0.4 },
  forge: { plaster: ['plasterWarm', 'plaster'], roof: ['roofSlate', 'roofSlate', 'roofTeal'], floors: [1, 2, 2], shop: 0.45, forge: 0.6 },
  house: { plaster: ['plaster', 'plasterPale', 'plasterWarm', 'plasterRose'], roof: ['roofBlue', 'roofTeal', 'roofSlate'], floors: [1, 2, 2, 3], shop: 0.22 },
  holy: { plaster: ['plasterPale', 'plaster'], roof: ['roofTeal', 'roofBlue'], floors: [2, 2, 3], shop: 0.15 },
  harbor: { plaster: ['plasterWarm', 'plaster'], roof: ['roofSlate', 'roofTeal'], floors: [1, 2], shop: 0.35 },
  garden: { plaster: ['plasterPale'], roof: ['roofTeal'], floors: [1, 2], shop: 0.1 },
  civic: { plaster: ['plasterPale', 'plasterWarm'], roof: ['roofBlue'], floors: [2, 3], shop: 0.3 },
  castle: { plaster: ['plasterPale'], roof: ['roofBlue'], floors: [2], shop: 0 },
};

/* ---------------- 工具 ---------------- */

const rectOverlap = (a, b, m = 0) =>
  a[0] - m < b[2] && a[2] + m > b[0] && a[1] - m < b[3] && a[3] + m > b[1];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const r = d.rect;
    if (x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return d;
  }
  return DISTRICTS[DISTRICTS.length - 1];
}

/** 点是否落在水面上。 */
export function inWater(x, z, margin = 0) {
  for (const c of CANALS) {
    if (x > c[0] - margin && x < c[2] + margin && z > c[1] - margin && z < c[3] + margin) return true;
  }
  return false;
}

/** 八边形城墙内测(内收 4m,房子不贴墙)。 */
export function insideWalls(x, z, inset = 4) {
  if (Math.abs(x) > 200 - inset || Math.abs(z) > 195 - inset) return false;
  if (Math.abs(x) + Math.abs(z) > 345 - inset * 1.4) return false;
  return true;
}

/** 通用矩形差集:rect 减去 holes,返回若干互不重叠的矩形。 */
export function subtractRects(rect, holes) {
  let list = [rect];
  for (const c of holes) {
    const next = [];
    for (const r of list) {
      if (r[2] <= c[0] || r[0] >= c[2] || r[3] <= c[1] || r[1] >= c[3]) { next.push(r); continue; }
      if (r[1] < c[1]) next.push([r[0], r[1], r[2], c[1]]);
      if (r[3] > c[3]) next.push([r[0], c[3], r[2], r[3]]);
      const mz0 = Math.max(r[1], c[1]), mz1 = Math.min(r[3], c[3]);
      if (r[0] < c[0]) next.push([r[0], mz0, c[0], mz1]);
      if (r[2] > c[2]) next.push([c[2], mz0, r[2], mz1]);
    }
    list = next.filter((r) => r[2] - r[0] > 0.25 && r[3] - r[1] > 0.25);
  }
  return list;
}

/* ---------------- 规划生成 ---------------- */

export function buildPlan(seed = 20260727) {
  const rng = new Rng(seed);

  // 禁建矩形
  const reserved = [
    [-16, 118, 16, 200],                     // 城门大道口
    [-14, -112, 14, 132],                    // 中轴大道
    [-96, -200, 96, -96],                    // 城堡台地
    [-152, -92, -96, -4],                    // 大教堂用地(含门前平台)
    [62, -200, 200, -26],                    // 王家花园
    [-200, 40, -148, 108],                   // 港池与码头
    [-200, -66, -150, -26],                  // 教堂道西端(临水)
    [-138, 44, -126, 102],                   // 码头仓库带(先占,后填)
  ];
  for (const c of CANALS) reserved.push([c[0] - 7, c[1] - 7, c[2] + 7, c[3] + 7]);
  for (const l of LANES) {
    const x0 = Math.min(l.a[0], l.b[0]) - l.w / 2, x1 = Math.max(l.a[0], l.b[0]) + l.w / 2;
    const z0 = Math.min(l.a[1], l.b[1]) - l.w / 2, z1 = Math.max(l.a[1], l.b[1]) + l.w / 2;
    reserved.push([x0, z0, x1, z1]);
  }
  // 禁建圆(广场需要圆形判定,方形会把环形店铺全挡掉)
  const reservedCircles = [{ x: CITY.plaza.x, z: CITY.plaza.z, r: CITY.plaza.r + 1.5 }];

  const placed = [];
  const plots = [];

  function tryPlace(cx, cz, w, d, yaw, kind, style, opts = {}) {
    const swap = Math.abs(Math.cos(yaw)) < 0.5;
    const hx = swap ? d / 2 : w / 2;
    const hz = swap ? w / 2 : d / 2;
    const rect = [cx - hx, cz - hz, cx + hx, cz + hz];
    if (!insideWalls(rect[0], rect[1]) || !insideWalls(rect[2], rect[3]) ||
      !insideWalls(rect[0], rect[3]) || !insideWalls(rect[2], rect[1])) return false;
    if (!opts.ignoreReserved) {
      for (const r of reserved) if (rectOverlap(rect, r, 0.4)) return false;
    }
    for (const c of reservedCircles) {
      const nx = Math.max(rect[0], Math.min(c.x, rect[2]));
      const nz = Math.max(rect[1], Math.min(c.z, rect[3]));
      if (Math.hypot(nx - c.x, nz - c.z) < c.r) return false;
    }
    for (const p of placed) if (rectOverlap(rect, p, 1.3)) return false;
    placed.push(rect);
    plots.push({ x: cx, z: cz, w, d, yaw, kind, style, rect, id: plots.length });
    return true;
  }

  // ---- ① 先落"指定位置"的房子,让它们优先占地 ----

  // 港口仓库(码头街东侧,山面朝港池)
  for (let i = 0; i < 3; i++) {
    tryPlace(-132, 54 + i * 17, 13, 11, -Math.PI / 2, 'warehouse', 'harbor', { ignoreReserved: true });
  }

  // 交易广场环形店铺
  {
    // 街口会切掉一部分,所以多撒几个候选,能落几家算几家
    const { x: px, z: pz, r } = CITY.plaza;
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      const dist = r + 10.5;
      const cx = px + Math.sin(a) * dist;
      const cz = pz + Math.cos(a) * dist;
      const yaw = Math.round(Math.atan2(px - cx, pz - cz) / (Math.PI / 2)) * (Math.PI / 2);
      tryPlace(cx, cz, rng.range(9, 12.5), rng.range(11, 13.5), yaw, 'shop', 'trade');
    }
  }

  // 花园区零星小屋
  for (const [cx, cz] of [[96, -66], [152, -58], [178, -108], [92, -152], [154, -168]]) {
    tryPlace(cx, cz, rng.range(8, 11), rng.range(9, 12), rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]),
      'cottage', 'garden', { ignoreReserved: true });
  }

  // ---- ② 沿街立面批量生成 ----
  for (const lane of LANES) {
    if (!lane.frontage) continue;
    const [ax, az] = lane.a, [bx, bz] = lane.b;
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const nx = uz, nz = -ux;
    const depth = lane.depth || 12;
    // 房子退到人行道之外:街道自身也在 reserved 里,不退线的话每一栋都会被自己那条街判为冲突
    const SIDEWALK = 1.6;
    for (const side of [1, -1]) {
      let t = rng.range(2, 9);
      while (t < len - 6) {
        const w = rng.range(6.8, 12.8);
        const d = depth + rng.range(-1.6, 3.2);
        const cx = ax + ux * (t + w / 2) + nx * side * (lane.w / 2 + SIDEWALK + d / 2);
        const cz = az + uz * (t + w / 2) + nz * side * (lane.w / 2 + SIDEWALK + d / 2);
        const yaw = Math.atan2(-nx * side, -nz * side);   // 正面朝向街心
        const style = districtAt(cx, cz).style;
        tryPlace(cx, cz, w, d, yaw, 'house', PALETTES[style] ? style : 'house');
        t += w + rng.range(0.3, 2.4);
      }
    }
  }

  // ---- ③ 逐块补齐生成参数 ----
  for (const p of plots) {
    const pal = PALETTES[p.style] || PALETTES.house;
    const r = rng.fork(p.id * 7 + 13);
    p.floors = p.kind === 'warehouse' ? 1 : r.pick(pal.floors);
    if (p.kind === 'cottage') p.floors = Math.min(p.floors, 2);
    p.plaster = r.pick(pal.plaster);
    p.roof = r.pick(pal.roof);
    p.roofType = p.kind === 'warehouse' ? 'gable' : (r.chance(0.74) ? 'gable' : 'hip');
    p.shop = p.kind === 'shop' || (p.kind === 'house' && r.chance(pal.shop || 0.25));
    p.forge = p.style === 'forge' && p.kind !== 'warehouse' && r.chance(pal.forge || 0);
    p.timber = r.chance(p.style === 'forge' || p.style === 'harbor' ? 0.4 : 0.78);
    p.sign = p.shop ? r.pick(['mug', 'hammer', 'bread', 'sword', 'herb']) : null;
    p.balcony = p.floors >= 2 && r.chance(0.32);
    p.chimney = r.chance(0.86);
    p.seed = r.int(1, 1e6);
    p.district = districtAt(p.x, p.z).id;
  }

  return { seed, rng, plots, reserved, lanes: LANES, canals: CANALS, bridges: BRIDGES, districts: DISTRICTS };
}
