import { MAP_SIZE, TERRAIN } from '../core/constants.js';

// features 用"地图格"矩形描述地形（x,y,w,h 均为 0..12 范围内的格子坐标）。
// mirror() 自动补齐关于中轴线 (col 6) 对称的另一半，减少手写出错的概率。
function mirror(rects) {
  const out = [];
  for (const r of rects) {
    out.push(r);
    const mx = MAP_SIZE - r.x - r.w;
    if (mx !== r.x) out.push({ ...r, x: mx });
  }
  return out;
}

const B = TERRAIN.BRICK;
const S = TERRAIN.STEEL;
const W = TERRAIN.WATER;
const T = TERRAIN.TREE;
const I = TERRAIN.ICE;

function rect(type, x, y, w, h) {
  return { type, x, y, w, h };
}

// 按类型数量生成敌军出场顺序并随机打乱（Fisher-Yates）
function buildEnemyList(counts) {
  const list = [];
  for (const type of Object.keys(counts)) {
    for (let i = 0; i < counts[type]; i++) list.push(type);
  }
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const LEVELS = [
  // ---- 第 1 关：教学关，稀疏砖墙，无钢/水/树/冰 ----
  {
    name: '新手上路',
    bonusEvery: 5,
    counts: { basic: 7, fast: 3, power: 0, armor: 0 },
    features: [
      ...mirror([rect(B, 2, 2, 2, 1), rect(B, 2, 3, 1, 2), rect(B, 4, 6, 2, 1), rect(B, 2, 9, 2, 1)]),
      rect(B, 6, 6, 1, 1),
    ],
  },
  // ---- 第 2 关：引入钢墙 ----
  {
    name: '钢铁初现',
    bonusEvery: 5,
    counts: { basic: 6, fast: 4, power: 2, armor: 0 },
    features: [
      ...mirror([rect(S, 1, 5, 1, 2), rect(B, 3, 7, 2, 1), rect(B, 2, 2, 2, 1)]),
      rect(S, 6, 4, 1, 1),
      rect(B, 5, 2, 3, 1),
    ],
  },
  // ---- 第 3 关：引入水面 ----
  {
    name: '水路縦横',
    bonusEvery: 4,
    counts: { basic: 6, fast: 4, power: 3, armor: 1 },
    features: [
      rect(W, 5, 5, 3, 2),
      ...mirror([rect(B, 3, 5, 2, 1), rect(B, 3, 7, 2, 1), rect(S, 1, 2, 1, 1), rect(S, 1, 9, 1, 1)]),
    ],
  },
  // ---- 第 4 关：引入树林，装甲坦克登场 ----
  {
    name: '林间伏击',
    bonusEvery: 4,
    counts: { basic: 5, fast: 4, power: 3, armor: 2 },
    features: [
      ...mirror([rect(T, 1, 1, 3, 2), rect(T, 1, 9, 3, 2), rect(S, 3, 6, 1, 1)]),
      rect(B, 5, 4, 3, 1),
      rect(B, 5, 7, 3, 1),
    ],
  },
  // ---- 第 5 关：引入冰面，钢墙增多 ----
  {
    name: '寒冰前线',
    bonusEvery: 4,
    counts: { basic: 5, fast: 4, power: 4, armor: 3 },
    features: [
      rect(I, 5, 9, 3, 1),
      ...mirror([rect(S, 2, 4, 1, 3), rect(B, 4, 6, 1, 1)]),
      rect(B, 5, 2, 3, 1),
      rect(S, 6, 8, 1, 1),
    ],
  },
  // ---- 第 6 关：混合地形加密 ----
  {
    name: '混战地带',
    bonusEvery: 4,
    counts: { basic: 4, fast: 5, power: 4, armor: 3 },
    features: [
      ...mirror([rect(W, 2, 3, 2, 1), rect(W, 2, 8, 2, 1), rect(S, 5, 5, 1, 1), rect(S, 5, 8, 1, 1), rect(B, 1, 6, 1, 3), rect(B, 3, 1, 1, 2)]),
      rect(T, 6, 3, 1, 1),
    ],
  },
  // ---- 第 7 关：钢墙密集，树林伏击 ----
  {
    name: '铁壁迷阵',
    bonusEvery: 4,
    counts: { basic: 4, fast: 5, power: 5, armor: 4 },
    features: [
      ...mirror([rect(S, 2, 2, 2, 1), rect(S, 2, 9, 2, 1), rect(B, 4, 4, 1, 4), rect(W, 0, 5, 1, 2)]),
      rect(T, 5, 1, 3, 1),
      rect(T, 5, 9, 3, 1),
    ],
  },
  // ---- 第 8 关：要塞加固，基地上方改为钢墙 ----
  {
    name: '要塞加固',
    bonusEvery: 3,
    counts: { basic: 3, fast: 5, power: 5, armor: 5 },
    features: [
      rect(S, 5, 11, 3, 1),
      ...mirror([rect(S, 3, 3, 2, 2), rect(S, 3, 8, 2, 2), rect(B, 1, 5, 2, 1), rect(B, 1, 7, 2, 1)]),
      rect(I, 6, 5, 1, 3),
    ],
  },
  // ---- 第 9 关：高密度地形 ----
  {
    name: '重重封锁',
    bonusEvery: 3,
    counts: { basic: 3, fast: 5, power: 6, armor: 6 },
    features: [
      ...mirror([
        rect(S, 2, 2, 1, 2),
        rect(S, 2, 8, 1, 2),
        rect(B, 1, 4, 1, 3),
        rect(B, 4, 1, 1, 2),
        rect(B, 4, 9, 1, 2),
        rect(T, 2, 5, 1, 3),
      ]),
      rect(S, 5, 4, 3, 1),
      rect(S, 5, 7, 3, 1),
      rect(W, 6, 3, 1, 1),
      rect(W, 6, 8, 1, 1),
    ],
  },
  // ---- 第 10 关：最终关，双层加固基地 + 复杂迷宫 + Boss ----
  {
    name: '最终决战',
    bonusEvery: 3,
    counts: { basic: 2, fast: 5, power: 6, armor: 6 },
    boss: true,
    features: [
      rect(S, 5, 11, 3, 1),
      rect(S, 5, 10, 3, 1),
      rect(B, 4, 4, 5, 1),
      rect(B, 4, 8, 5, 1),
      rect(I, 6, 6, 1, 1),
      ...mirror([rect(S, 1, 1, 2, 2), rect(S, 1, 10, 2, 2), rect(W, 0, 6, 1, 1), rect(T, 3, 2, 1, 1), rect(T, 3, 10, 1, 1)]),
    ],
  },
];

export function getLevelCount() {
  return LEVELS.length;
}

// 返回可直接喂给 Grid.loadLevel() 和 GameEngine 的关卡定义（每次调用重新洗牌敌军出场顺序）
export function buildLevel(levelNumber) {
  const def = LEVELS[(levelNumber - 1) % LEVELS.length];
  const enemies = buildEnemyList(def.counts);
  if (def.boss) enemies.push('boss');
  return {
    number: levelNumber,
    name: def.name,
    features: def.features,
    enemies,
    bonusEvery: def.bonusEvery,
  };
}
