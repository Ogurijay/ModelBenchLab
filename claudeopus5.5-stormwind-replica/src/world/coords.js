// 暴风城布局 —— 全项目唯一的坐标数据源。
// 单位：米。Y 向上；北 = -Z，东 = +X；原点 = 贸易区市集广场中心。
// 纯数据 + 纯函数，不 import three：平面图脚本（tools/floorplan.mjs）和所有 3D 模块共用这一份。
// 方位参考：英雄谷入口在东南，贸易区居中，法师区西南，旧城区东，大教堂广场北，
// 矮人区东北，暴风要塞最东北（高台），雄狮安息地西北，港口在北城墙外。

export const SEED = 20261015;

export const WATER_Y = -2.5; // 运河 / 海面
export const CANAL_BED_Y = -5.5;
export const SEA_BED_Y = -8;
export const KEEP_Y = 12; // 要塞高台
export const VALLEY_FLOOR_Y = -14; // 英雄谷盆地
export const QUAY_STREET = 8; // 岛沿滨河街宽
export const STEP_MAX = 0.5; // 玩家自动抬腿上限

export const WALL = { thickness: 8, height: 14, crenel: 1.6 }; // 城墙：顶面（马道）y = height

// ---------- 工具 ----------
export const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export const inRect = (x, z, r) => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3];

// 确定性随机：同种子同城市
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function rngFor(name, seed = SEED) {
  let h = seed ^ 0x9e3779b9;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
  return mulberry32(h >>> 0);
}

// ---------- 英雄谷：沿东南 45° 斜轴的峡谷 ----------
// 局部坐标：lz 沿谷轴（0 = 谷口靠城一端，180 = 城门），lx 横向（+ = 东北侧）。
// three 里用 Group：position = (VALLEY.origin[0], 0, VALLEY.origin[1])，rotation.y = π/4。
const S2 = Math.SQRT1_2;
export const VALLEY = {
  name: '英雄谷',
  origin: [86, 76],
  yaw: Math.PI / 4,
  length: 180, // 谷口 → 城门
  halfWidth: 28, // 盆地半宽
  bridge: { width: 16, from: -21.2, to: 196 }, // 主桥：从贸易区东南角登岸点一直通到城门外
  gateZ: 180,
  statues: [30, 65, 100, 135].flatMap((lz) => [
    { lx: -11.5, lz },
    { lx: 11.5, lz },
  ]),
};
export function valleyToWorld(lx, lz) {
  const [ox, oz] = VALLEY.origin;
  return [ox + (lz + lx) * S2, oz + (lz - lx) * S2];
}
export function worldToValley(x, z) {
  const [ox, oz] = VALLEY.origin;
  const dx = x - ox;
  const dz = z - oz;
  return [(dx - dz) * S2, (dx + dz) * S2]; // [lx, lz]
}

// ---------- 街区岛（运河分隔）----------
// poly 顶面高度 = top；blocks = 建筑街块 [x0,z0,x1,z1] + 临街方向（N/S/E/W）；plaza = 广场。
export const DISTRICTS = {
  trade: {
    name: '贸易区',
    style: 'trade',
    top: 0,
    // 东南角切角，作为英雄谷主桥的登岸点
    poly: [[-80, -60], [80, -60], [80, 52], [62, 70], [-80, 70]],
    plaza: { name: '贸易区市集广场', rect: [-28, -22, 28, 22] },
    blocks: [
      { r: [-72, -52, -5, -30], sides: 'NS' },
      { r: [5, -52, 72, -30], sides: 'NS' },
      { r: [-72, 30, -5, 62], sides: 'NS' },
      { r: [5, 30, 56, 62], sides: 'NS' },
      { r: [-72, -22, -36, 22], sides: 'WE' },
      { r: [36, -22, 72, 22], sides: 'WE' },
    ],
    floors: [2, 3],
    named: ['暴风城银行', '拍卖行', '金狮旅店', '武器铺', '裁缝铺'],
  },
  mage: {
    name: '法师区',
    style: 'mage',
    top: 0,
    poly: rect(-240, -30, -98, 150),
    plaza: { name: '法师区圣所广场', rect: [-196, 33, -142, 87] },
    blocks: [
      { r: [-232, -22, -174, 17], sides: 'NS' },
      { r: [-164, -22, -106, 17], sides: 'NS' },
      { r: [-232, 103, -174, 142], sides: 'NS' },
      { r: [-164, 103, -106, 142], sides: 'NS' },
      { r: [-232, 33, -204, 87], sides: 'WE' },
      { r: [-134, 33, -106, 87], sides: 'WE' },
    ],
    floors: [2, 3],
    named: ['屠宰之羊酒馆', '奥术商店', '炼金房'],
  },
  oldtown: {
    name: '旧城区',
    style: 'oldtown',
    top: 0,
    poly: rect(110, -80, 250, 40),
    plaza: { name: '旧城广场', rect: [160, -30, 200, 0] },
    blocks: [
      { r: [118, -72, 175, -46], sides: 'NS' },
      { r: [185, -72, 242, -46], sides: 'NS' },
      { r: [118, -38, 144, 8], sides: 'WE' },
      { r: [216, -38, 242, 8], sides: 'WE' },
      { r: [118, 16, 175, 32], sides: 'NS' },
      { r: [185, 16, 242, 32], sides: 'NS' },
    ],
    floors: [1, 2],
    named: ['猪与哨子酒馆', '军情七处', '勇士大厅'],
  },
  cathedral: {
    name: '大教堂广场',
    style: 'cathedral',
    top: 0,
    poly: rect(-150, -230, 40, -78),
    plaza: { name: '大教堂广场', rect: [-110, -150, 0, -94] },
    blocks: [
      { r: [-142, -222, -92, -160], sides: 'NSWE' },
      { r: [-18, -222, 32, -160], sides: 'NSWE' },
      { r: [-142, -150, -118, -94], sides: 'WE' },
      { r: [8, -150, 32, -94], sides: 'WE' },
    ],
    floors: [2, 3],
    named: ['市政厅', '孤儿院'],
  },
  dwarven: {
    name: '矮人区',
    style: 'dwarven',
    top: 0,
    poly: rect(58, -250, 198, -98),
    plaza: { name: '熔炉广场', rect: [100, -200, 156, -150] },
    blocks: [
      { r: [66, -242, 190, -208], sides: 'NS' },
      { r: [66, -142, 190, -106], sides: 'NS' },
      { r: [66, -200, 92, -150], sides: 'WE' },
      { r: [164, -200, 178, -150], sides: 'W' },
    ],
    floors: [1, 2],
    named: ['铁炉堡商栈', '矮人工坊'],
  },
  keep: {
    name: '暴风要塞',
    style: 'keep',
    top: KEEP_Y,
    // 南缘开一道阶梯槽：桥从 y=0 登岸，大台阶升到 y=12
    poly: [[228, -330], [370, -330], [370, -98], [247, -98], [247, -124], [233, -124], [233, -98], [228, -98]],
    stairs: { rect: [233, -124, 247, -98], fromY: 0, toY: KEEP_Y, ascend: 'N' },
    blocks: [],
  },
  lionsrest: {
    name: '雄狮安息地',
    style: 'park',
    top: 0,
    poly: rect(-258, -230, -168, -48),
    blocks: [],
  },
  harbor: {
    name: '暴风港',
    style: 'harbor',
    top: 0,
    poly: rect(-300, -300, 140, -266), // 北城墙外的码头
    piers: [-240, -170, -60, 40].map((x) => ({ x, z0: -300, z1: -372, w: 8 })),
    blocks: [],
  },
};

// ---------- 外城墙（顺时针）----------
const V1 = valleyToWorld(VALLEY.halfWidth, 0); // 谷口东北角
const V2 = valleyToWorld(VALLEY.halfWidth, VALLEY.gateZ); // 城门东北角
const V3 = valleyToWorld(-VALLEY.halfWidth, VALLEY.gateZ); // 城门西南角
const V4 = valleyToWorld(-VALLEY.halfWidth, 0); // 谷口西南角
export const WALL_POLY = [
  [-276, -262], [216, -262], [216, -352], [392, -352], [392, -82], [270, -82], [270, 54], [122, 54],
  V1, V2, V3, V4,
  [60, 104], [-84, 104], [-84, 168], [-276, 168],
];
// 城门在 V2→V3 这一段的中点；北墙 x = -110 处有通往港口的隧道
export const GATE = { a: V2, b: V3, center: valleyToWorld(0, VALLEY.gateZ), width: 12, height: 13 };
export const HARBOR_TUNNEL = { x: -110, z: -262, width: 8, height: 6 };
// 马道入口：城墙内侧的登城阶梯（沿墙内侧走，坡长 ≈ 28 m）
export const WALL_STAIRS = [
  { seg: 0, t: 0.32 }, // 北墙，大教堂一侧
  { seg: 4, t: 0.5 }, // 东墙，要塞南
  { seg: 13, t: 0.55 }, // 南墙，法师区南
  { seg: 15, t: 0.5 }, // 西墙
];

// 运河水面范围 = 城墙多边形，但把英雄谷切掉（谷底低于水面）
export const WATER_POLY = [
  [-276, -262], [216, -262], [216, -352], [392, -352], [392, -82], [270, -82], [270, 54], [122, 54],
  V1, V4,
  [60, 104], [-84, 104], [-84, 168], [-276, 168],
];
// 北城墙外的海面（港口码头盖在上面）
export const SEA_RECT = [-760, -900, 216, -266];

// ---------- 桥（桥面 y = 0，平桥 + 拱腹）----------
export const BRIDGES = [
  { id: 'trade-mage', a: [-80, 0], b: [-98, 0], w: 8 },
  { id: 'trade-old', a: [80, 0], b: [110, 0], w: 10 },
  { id: 'trade-cathedral', a: [0, -60], b: [0, -78], w: 10 },
  { id: 'cathedral-dwarven', a: [40, -175], b: [58, -175], w: 8 },
  { id: 'old-dwarven', a: [150, -80], b: [150, -98], w: 8 },
  { id: 'old-keep', a: [240, -80], b: [240, -98], w: 14 },
  { id: 'cathedral-lion', a: [-150, -140], b: [-168, -140], w: 8 },
  { id: 'lion-mage', a: [-213, -48], b: [-213, -30], w: 8 },
  { id: 'cathedral-harbor', a: [-110, -230], b: [-110, -258], w: 8 }, // 接北墙隧道
];

// ---------- 地标（D 模块）----------
export const LANDMARKS = {
  cathedral: { name: '光明大教堂', center: [-55, -186], size: [30, 66], facing: 'S', entranceZ: -153, spireH: 62 },
  keep: { name: '暴风要塞王座厅', center: [300, -238], size: [26, 52], facing: 'S', entranceZ: -212, courtyard: [233, -210, 367, -124] },
  sanctum: { name: '巫师圣所', center: [-169, 60], radius: 10, height: 44 },
  fountain: { name: '贸易区喷泉', center: [0, 0], radius: 7 },
  cathedralStatue: { name: '大教堂广场圣光喷泉', center: [-55, -122], radius: 6 },
  greatForge: { name: '大熔炉', center: [128, -175], size: [30, 22] },
  tram: { name: '矿道地铁入口', center: [190, -175], size: [14, 22] },
  lionsMemorial: { name: '雄狮安息地纪念碑', center: [-213, -139] },
};

// ---------- 地块（民居 / 店铺）----------
const LOT_MIN = 8;
function runs(a0, a1, rng, cb) {
  let a = a0;
  while (a1 - a >= LOT_MIN) {
    let w = 12 + rng() * 6;
    if (a1 - (a + w) < LOT_MIN) w = a1 - a;
    cb(a, a + w);
    a += w;
  }
}
// face = 门朝向（N 朝 -Z 街道）
function lotsOf(block, rng) {
  const [x0, z0, x1, z1] = block.r;
  const s = block.sides;
  const out = [];
  const dNS = Math.min(12, s.includes('N') && s.includes('S') ? (z1 - z0) / 2 : z1 - z0);
  const dEW = Math.min(12, s.includes('W') && s.includes('E') ? (x1 - x0) / 2 : x1 - x0);
  if (s.includes('N')) runs(x0, x1, rng, (a, b) => out.push({ r: [a, z0, b, z0 + dNS], face: 'N' }));
  if (s.includes('S')) runs(x0, x1, rng, (a, b) => out.push({ r: [a, z1 - dNS, b, z1], face: 'S' }));
  const za = s.includes('N') ? z0 + dNS : z0;
  const zb = s.includes('S') ? z1 - dNS : z1;
  if (s.includes('W')) runs(za, zb, rng, (a, b) => out.push({ r: [x0, a, x0 + dEW, b], face: 'W' }));
  if (s.includes('E')) runs(za, zb, rng, (a, b) => out.push({ r: [x1 - dEW, a, x1, b], face: 'E' }));
  return out;
}

// 所有可进入建筑的地块：{ id, district, style, r:[x0,z0,x1,z1], face, floors, named? }
export const LOTS = (() => {
  const all = [];
  for (const [key, d] of Object.entries(DISTRICTS)) {
    const rng = rngFor(`lots:${key}`);
    const lots = d.blocks.flatMap((b) => lotsOf(b, rng));
    // 命名建筑：挑最宽的几个地块
    const byWidth = [...lots].sort((p, q) => q.r[2] - q.r[0] + (q.r[3] - q.r[1]) - (p.r[2] - p.r[0] + (p.r[3] - p.r[1])));
    (d.named || []).forEach((name, i) => byWidth[i] && (byWidth[i].named = name));
    lots.forEach((lot, i) => {
      const [f0, f1] = d.floors || [1, 2];
      all.push({
        id: `${key}-${i}`,
        district: key,
        style: d.style,
        ...lot,
        floors: lot.named ? f1 : f0 + Math.floor(rng() * (f1 - f0 + 1)),
      });
    });
  }
  return all;
})();

// ---------- 路灯（沿滨河街 + 广场四角）----------
export const LAMPS = (() => {
  const out = [];
  const inset = 1.6;
  for (const [key, d] of Object.entries(DISTRICTS)) {
    if (key === 'keep') continue;
    const poly = d.poly;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i];
      const [bx, bz] = poly[(i + 1) % poly.length];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 10) continue;
      const tx = (bx - ax) / len;
      const tz = (bz - az) / len;
      // 选指向岛内的法线
      let nx = -tz;
      let nz = tx;
      if (!pointInPoly((ax + bx) / 2 + nx * 2, (az + bz) / 2 + nz * 2, poly)) {
        nx = -nx;
        nz = -nz;
      }
      const n = Math.max(1, Math.floor(len / 26));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        out.push({ x: ax + tx * len * t + nx * inset, z: az + tz * len * t + nz * inset, y: d.top, district: key });
      }
    }
    if (d.plaza) {
      const [x0, z0, x1, z1] = d.plaza.rect;
      for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) out.push({ x, z, y: d.top, district: key });
    }
  }
  return out;
})();

// ---------- 区域判定与地面高度 ----------
// 返回 { region, district?, y }：玩家与地形共用；碰撞盒顶面另由碰撞系统叠加（取 max）。
const DISTRICT_ENTRIES = Object.entries(DISTRICTS);
export function regionAt(x, z) {
  const [lx, lz] = worldToValley(x, z);
  if (lz > 0 && lz < VALLEY.gateZ && Math.abs(lx) < VALLEY.halfWidth) return { region: 'valley', y: VALLEY_FLOOR_Y };
  for (const [key, d] of DISTRICT_ENTRIES) {
    if (pointInPoly(x, z, d.poly)) return { region: 'island', district: key, y: d.top };
  }
  if (pointInPoly(x, z, WATER_POLY)) return { region: 'canal', y: CANAL_BED_Y };
  const h = terrainHeight(x, z);
  return h < WATER_Y ? { region: 'sea', y: h } : { region: 'outside', y: h };
}
export const groundHeight = (x, z) => regionAt(x, z).y;

// 城外艾尔文森林：城墙附近平坦，远处缓丘
export function elwynnHeight(x, z) {
  const d = Math.max(0, Math.hypot(x - 60, z + 90) - 520);
  const n = Math.sin(x * 0.011) * Math.cos(z * 0.013) + 0.5 * Math.sin((x + z) * 0.023);
  return Math.min(1, d / 160) * (6 + 10 * n + d * 0.04);
}


// ---------- 城外地形：艾尔文森林 + 自然海岸线 + 城门外土路（原 terrain/shore.js，搬到这里让玩家高度与可视地形同源）----------
const [SX0, , SX1, SZ1] = SEA_RECT; // 西岸 x=-760、东岸 x=216、南岸 z=-266；北边界不用——海面一直向北伸进雾里
const HALF_WALL = WALL.thickness / 2;

// 真正"靠陆地"的海岸线段（其余边界是城墙 / 港口，海水直接拍墙）
const LAND_SEGS = [
  [SX0, -1e5, SX0, SZ1], // 西岸
  [SX0, SZ1, -276 - HALF_WALL - 1, SZ1], // 南岸：城墙西北角以西
  [SX1, -1e5, SX1, -352 - HALF_WALL - 4], // 东岸：要塞北墙角以北
];

function segDist(px, pz, [ax, az, bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// 平滑 max（k = 过渡宽度）
function smax(a, b, k) {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return a + (b - a) * h + k * h * (1 - h);
}

// 海岸线起伏 0..1（几组不同方向 / 频率的正弦叠加，沿岸看是自然的岬角和海湾）
function shoreNoise(x, z) {
  const n =
    0.5 * Math.sin(x * 0.0071 + z * 0.0093 + 1.7) +
    0.32 * Math.sin(x * 0.019 - z * 0.023 + 0.4) +
    0.18 * Math.sin(x * 0.047 + z * 0.041 + 2.2);
  return 0.5 + 0.5 * n;
}

// 是否落在海的影响范围：海矩形，北边界无限延伸；城墙脚下额外让海水伸进墙基 4 m（墙会盖住）
function inSeaDomain(x, z) {
  const zMax = x > -276 - HALF_WALL - 1 ? SZ1 + HALF_WALL : SZ1;
  const xMax = z > -352 - HALF_WALL ? SX1 + HALF_WALL : SX1;
  return x > SX0 && x < xMax && z < zMax;
}

/**
 * 海岸：返回 { h 地面高度, w 海岸影响权重 0..1（0 = 纯 elwynnHeight，用于沙滩着色遮罩）}。
 * 海矩形以外 = elwynnHeight 原值；海矩形内从陆地边界往里先保持原地形，再经 20–40 m 的沙滩缓坡入水，最后落到海床。
 */
export function shoreSample(x, z) {
  const base = elwynnHeight(x, z);
  if (!inSeaDomain(x, z)) return { h: base, w: 0 };
  let inner = Infinity;
  for (const s of LAND_SEGS) inner = Math.min(inner, segDist(x, z, s));
  const W = 22 + 2.2 * Math.max(0, base); // 陆地 → 沙滩的过渡宽度（高地越高坡越长，坡度 ≤ 约 1:2）
  const shore = W + 4 + 34 * shoreNoise(x, z); // 海岸线离陆地边界的距离（始终 ≥ W，保证边界处连续）
  const t = inner - shore; // < 0 陆侧，> 0 海侧
  if (t <= -W) return { h: base, w: 0 };
  const beach = WATER_Y + 0.55 - 0.11 * t; // 沙滩 1:9 缓坡，t = 5 处入水
  const bed = SEA_BED_Y + 0.45 * Math.sin(x * 0.021 + z * 0.017) + 0.3 * Math.sin(x * 0.053 - z * 0.037);
  const sea = smax(bed, beach, 3);
  const w = smoothstep(-W, -0.35 * W, t);
  return { h: base + (Math.min(base, sea) - base) * w, w };
}

// 城外（非岛、非运河、非英雄谷）地面高度：建议 coords.regionAt 的 sea / outside 分支改用它
export const terrainHeight = (x, z) => shoreSample(x, z).h;

// ---------- 城门外土路（中线 = 沿英雄谷轴线向东南，缓慢蜿蜒）----------
export const ROAD = {
  origin: GATE.center,
  dir: [Math.SQRT1_2, Math.SQRT1_2],
  halfWidth: 3.6,
};
// 中线横向偏移 f(u)，u = 离城门的距离。GLSL 里有同一份公式（ground.js 的 ROAD_GLSL），改这里要同步改那里。
export function roadOffset(u) {
  return smoothstep(30, 160, u) * (22 * Math.sin(u * 0.0045) + 9 * Math.sin(u * 0.013));
}
// 世界坐标 → 离路中线的距离（城门以内返回 Infinity）
export function roadDistance(x, z) {
  const dx = x - ROAD.origin[0];
  const dz = z - ROAD.origin[1];
  const u = dx * ROAD.dir[0] + dz * ROAD.dir[1];
  if (u < -2) return Infinity;
  const v = -dx * ROAD.dir[1] + dz * ROAD.dir[0];
  const f = roadOffset(u);
  const fp = (roadOffset(u + 1) - roadOffset(u - 1)) / 2;
  return Math.abs(v - f) / Math.sqrt(1 + fp * fp);
}

// 城市包围盒（相机 / 阴影 / 小地图用）
export const CITY_BOUNDS = [-300, -380, 400, 240];

// 出生点：英雄谷主桥上、城门内侧，面朝城区（大地标都在视野里）
export const SPAWN = (() => {
  const [x, z] = valleyToWorld(0, 168);
  return { x, y: 0, z, yaw: Math.PI / 4 }; // 相机 rotation.y：前方 = (-sin, -cos) = 西北，朝城区
})();
