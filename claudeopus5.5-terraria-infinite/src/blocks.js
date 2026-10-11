// 方块与背景墙定义。前景方块 id 存于 Uint8Array,每格另有 1 字节 meta(作物阶段、门开合、树种等)。
export const BLOCKS = [];
export const B = Object.create(null);

const DEF = {
  solid: true, opaque: true, hard: 1, tool: null, tier: 0, drop: undefined,
  light: null, map: '#888888', render: 'framed', replace: false, support: null,
  platform: false, climb: false, gravity: false, interact: null, contact: 0,
  seasonal: false, sound: 'stone', blast: 3, tree: false, decay: 0, frames: 1, slippery: false,
};

function def(key, name, p = {}) {
  const d = { ...DEF, ...p, key, name, id: BLOCKS.length };
  if (d.drop === undefined) d.drop = key;
  if (!p.hasOwnProperty('opaque')) d.opaque = d.solid && d.render === 'framed';
  BLOCKS.push(d);
  B[key] = d.id;
  return d;
}

const nonSolid = { solid: false, opaque: false };
const sprite = { ...nonSolid, render: 'sprite', hard: 0, sound: 'grass' };

def('air', '空气', { ...nonSolid, hard: 0, render: 'none', replace: true, map: null, drop: null });
// —— 地表与土壤
def('grass', '草方块', { hard: 0.6, tool: 'shovel', drop: 'dirt', seasonal: true, sound: 'grass', map: '#5aa83c' });
def('dirt', '泥土', { hard: 0.5, tool: 'shovel', sound: 'dirt', map: '#8b5e3c' });
def('stone', '石头', { hard: 1.5, tool: 'pick', tier: 1, drop: 'cobblestone', map: '#7d7d80', blast: 6 });
def('cobblestone', '圆石', { hard: 2, tool: 'pick', tier: 1, map: '#6b6b6e', blast: 6 });
def('sand', '沙子', { hard: 0.5, tool: 'shovel', gravity: true, sound: 'sand', map: '#dcc68c' });
def('sandstone', '砂岩', { hard: 0.8, tool: 'pick', tier: 1, map: '#cdb27a' });
def('gravel', '沙砾', { hard: 0.6, tool: 'shovel', gravity: true, sound: 'sand', map: '#8a8580', drop: r => (r < 0.12 ? ['flint', 1] : ['gravel', 1]) });
def('clay', '黏土块', { hard: 0.6, tool: 'shovel', sound: 'dirt', map: '#9ea6b6', drop: ['clay_ball', 4] });
def('snow', '雪块', { hard: 0.2, tool: 'shovel', sound: 'snow', map: '#eef4f8' });
def('snow_grass', '雪原草', { hard: 0.6, tool: 'shovel', drop: 'dirt', sound: 'snow', map: '#e6eef2' });
def('jungle_grass', '丛林草', { hard: 0.6, tool: 'shovel', drop: 'mud', sound: 'grass', map: '#4fc23a' });
def('mud', '泥浆块', { hard: 0.5, tool: 'shovel', sound: 'dirt', map: '#5c4a42' });
def('mushroom_grass', '发光蘑菇草', { hard: 0.6, tool: 'shovel', drop: 'mud', sound: 'grass', map: '#4a5bd0', light: [0.04, 0.08, 0.22] });
def('ice', '冰', { solid: true, opaque: false, hard: 0.5, tool: 'pick', drop: null, sound: 'glass', map: '#9fd0f0', slippery: true, decay: 0.86 });
def('deepslate', '深板岩', { hard: 3, tool: 'pick', tier: 1, drop: 'cobbled_deepslate', map: '#4c4d57', blast: 6 });
def('cobbled_deepslate', '深板岩圆石', { hard: 3.5, tool: 'pick', tier: 1, map: '#45464f', blast: 6 });
def('bedrock', '基岩', { hard: -1, map: '#2b2b2e', drop: null, blast: 1e9 });
def('obsidian', '黑曜石', { hard: 15, tool: 'pick', tier: 5, map: '#2a1f3d', blast: 1200 });
def('ash', '灰烬岩', { hard: 0.4, tool: 'pick', tier: 1, map: '#5b5450' });
// —— 矿石
def('coal_ore', '煤矿石', { hard: 3, tool: 'pick', tier: 1, drop: 'coal', map: '#3e3e42' });
def('copper_ore', '铜矿石', { hard: 3, tool: 'pick', tier: 2, drop: 'raw_copper', map: '#c07a46' });
def('iron_ore', '铁矿石', { hard: 3, tool: 'pick', tier: 3, drop: 'raw_iron', map: '#c8a890' });
def('gold_ore', '金矿石', { hard: 3, tool: 'pick', tier: 4, drop: 'raw_gold', map: '#e8c84a' });
def('diamond_ore', '钻石矿石', { hard: 3, tool: 'pick', tier: 4, drop: 'diamond', map: '#60e0e0' });
def('hellstone_ore', '狱岩矿', { hard: 4, tool: 'pick', tier: 5, drop: 'raw_hellstone', map: '#c03a20', light: [0.45, 0.12, 0.04] });
def('glowstone', '荧石', { hard: 0.3, sound: 'glass', map: '#f0d070', light: [1, 0.85, 0.55] });
def('cloud', '云块', { hard: 0.3, tool: 'shovel', sound: 'cloth', map: '#f4f8ff', opaque: false, decay: 0.84 });
// —— 树木(天然树干/树叶不挡路,砍下树干会整棵倒下)
const SPECIES = ['oak', 'birch', 'spruce', 'jungle', 'palm'];
export const SPECIES_NAMES = ['橡树', '白桦', '云杉', '丛林木', '棕榈'];
const trunkMap = ['#6b4a2b', '#d8d2c4', '#4a3220', '#5e4426', '#8a6a44'];
const leafMap = ['#3f9a35', '#6fb04a', '#2d6b3c', '#2f9a2a', '#4cae3c'];
SPECIES.forEach((s, i) => def('trunk_' + s, SPECIES_NAMES[i] + '树干', { ...nonSolid, render: 'trunk', hard: 2, tool: 'axe', drop: 'log', tree: true, sound: 'wood', map: trunkMap[i], species: i, blast: 2 }));
SPECIES.forEach((s, i) => def('leaves_' + s, SPECIES_NAMES[i] + '树叶', { ...nonSolid, render: 'leaves', hard: 0.15, tree: true, sound: 'grass', map: leafMap[i], species: i, seasonal: i < 2 || i === 2, drop: null, decay: 0.8, blast: 1 }));
def('cactus', '仙人掌', { ...nonSolid, render: 'trunk', hard: 0.4, tree: true, contact: 1, sound: 'cloth', map: '#3e8a3a', support: 'cactus', blast: 1 });
// —— 建材
def('log', '原木', { hard: 2, tool: 'axe', sound: 'wood', map: '#7a5530', blast: 2 });
def('planks', '木板', { hard: 2, tool: 'axe', sound: 'wood', map: '#b08050', blast: 3 });
def('glass', '玻璃', { opaque: false, hard: 0.3, sound: 'glass', map: '#cfe8f0', decay: 0.9, blast: 1 });
def('bricks', '红砖块', { hard: 2, tool: 'pick', tier: 1, map: '#9a4a3a', blast: 6 });
def('stone_bricks', '石砖', { hard: 1.5, tool: 'pick', tier: 1, map: '#7a7a80', blast: 6 });
def('wool', '羊毛', { hard: 0.8, sound: 'cloth', map: '#ecebe6', blast: 1 });
def('iron_block', '铁块', { hard: 5, tool: 'pick', tier: 3, sound: 'metal', map: '#d8d8d8', blast: 6 });
def('gold_block', '金块', { hard: 3, tool: 'pick', tier: 4, sound: 'metal', map: '#f5d040', blast: 6 });
def('diamond_block', '钻石块', { hard: 5, tool: 'pick', tier: 4, sound: 'metal', map: '#6ff0e8', blast: 6 });
def('farmland', '耕地', { hard: 0.6, tool: 'shovel', drop: 'dirt', sound: 'dirt', map: '#5b3b22' });
// —— 功能方块
def('crafting_table', '工作台', { opaque: false, render: 'sprite', hard: 2.5, tool: 'axe', sound: 'wood', interact: 'table', map: '#9a6b3a' });
def('furnace', '熔炉', { opaque: true, render: 'sprite', hard: 3.5, tool: 'pick', tier: 1, interact: 'furnace', map: '#6a6a6a', frames: 2 });
def('chest', '箱子', { opaque: false, render: 'sprite', hard: 2.5, tool: 'axe', sound: 'wood', interact: 'chest', map: '#a8742c' });
def('torch', '火把', { ...sprite, sound: 'wood', support: 'torch', light: [1, 0.8, 0.5], map: '#ffcc55', drop: 'torch' });
def('lantern', '提灯', { ...sprite, hard: 0.5, sound: 'metal', support: 'any', light: [1, 0.88, 0.62], map: '#f0c060' });
def('platform', '木平台', { ...nonSolid, render: 'sprite', hard: 0.4, tool: 'axe', platform: true, sound: 'wood', map: '#a07444', frames: 4 });
def('ladder', '梯子', { ...nonSolid, render: 'sprite', hard: 0.4, tool: 'axe', climb: true, support: 'any', sound: 'wood', map: '#8a6034' });
def('door', '木门', { solid: true, opaque: false, render: 'sprite', hard: 2, tool: 'axe', sound: 'wood', interact: 'door', map: '#8a5a2c', drop: null, frames: 12 });
def('bed', '床', { ...nonSolid, render: 'sprite', hard: 0.4, sound: 'cloth', interact: 'bed', support: 'floor', map: '#c03030', drop: null, frames: 4 });
def('tnt', 'TNT', { opaque: true, render: 'sprite', hard: 0, sound: 'grass', interact: 'tnt', map: '#d03030', blast: 0 });
def('gravestone', '墓碑', { ...nonSolid, render: 'sprite', hard: 0.5, sound: 'stone', interact: 'grave', map: '#8a8a8a', drop: null });
// —— 植物与装饰(可被直接替换)
def('tall_grass', '高草', { ...sprite, replace: true, support: 'soil', seasonal: true, map: null, frames: 3, drop: r => (r < 0.125 ? ['seeds', 1] : null) });
def('flower', '花', { ...sprite, replace: true, support: 'soil', map: null, frames: 3 });
def('sapling', '树苗', { ...sprite, support: 'soil', map: null, frames: 5, drop: null });
def('wheat', '小麦', { ...sprite, support: 'farmland', map: '#c8b040', frames: 8, drop: null });
def('dead_bush', '枯灌木', { ...sprite, replace: true, support: 'soil', map: null, drop: r => (r < 0.5 ? ['stick', 1 + (r * 4 | 0)] : null) });
def('mushroom', '蘑菇', { ...sprite, support: 'floor', map: null, frames: 2 });
def('glow_mushroom', '发光蘑菇', { ...sprite, support: 'floor', map: '#70a0ff', light: [0.25, 0.45, 1.0] });
def('snow_layer', '积雪', { ...sprite, replace: true, hard: 0.1, tool: 'shovel', support: 'floor', sound: 'snow', map: '#f4f8fb', drop: null });
def('vine', '藤蔓', { ...sprite, climb: true, support: 'hang', map: '#2f8a2a' });
def('berry_bush', '甜浆果丛', { ...sprite, hard: 0.2, support: 'soil', interact: 'berry', map: '#3c7a34', frames: 4, drop: null });
// —— 艾泽拉斯·无限:阵营建筑
def('alliance_banner', '联盟旗帜', { ...sprite, hard: 1.2, sound: 'cloth', support: 'floor', interact: 'banner', map: '#3a72e0' });
def('horde_banner', '部落旗帜', { ...sprite, hard: 1.2, sound: 'cloth', support: 'floor', interact: 'banner', map: '#d23a2a' });
def('alliance_bricks', '联盟石砖', { hard: 2, tool: 'pick', tier: 1, map: '#8a96b8', blast: 6 });
def('horde_wood', '部落硬木', { hard: 2, tool: 'axe', sound: 'wood', map: '#8a3a26', blast: 3 });
def('brazier', '火盆', { ...sprite, hard: 1, sound: 'metal', support: 'floor', light: [1, 0.66, 0.32], map: '#f08030' });

export const SPECIES_KEYS = SPECIES;
export const TRUNKS = SPECIES.map(s => B['trunk_' + s]);
export const LEAVES = SPECIES.map(s => B['leaves_' + s]);
export const SOIL = new Set([B.grass, B.dirt, B.snow_grass, B.jungle_grass, B.mud, B.mushroom_grass, B.sand, B.farmland]);
export const GRASSY = new Set([B.grass, B.snow_grass, B.jungle_grass, B.mushroom_grass]);

// —— 按 meta 动态变化的属性
export function solidOf(id, meta) {
  if (id === B.door) return !(meta & 2);
  return BLOCKS[id].solid;
}
// 门(3 格高,泰拉瑞亚式)meta:bit0 顶部、bit3 中部(都无为底部)、bit1 打开、bit2 朝左
export const DOOR_TOP = 1, DOOR_OPEN = 2, DOOR_LEFT = 4, DOOR_MID = 8;
export const doorPart = m => (m & DOOR_MID ? 1 : m & DOOR_TOP ? 2 : 0);
export function opaqueOf(id) { return BLOCKS[id].opaque; }
export function lightOf(id, meta) {
  if (id === B.furnace) return meta & 1 ? [0.9, 0.55, 0.25] : null;
  return BLOCKS[id].light;
}

// ———————————————————— 背景墙
export const WALLS = [];
export const W = Object.create(null);
function wall(key, name, p = {}) {
  const d = { key, name, id: WALLS.length, hard: 0.6, map: '#444', transparent: false, item: key === 'none' ? null : 'wall_' + key, ...p };
  WALLS.push(d); W[key] = d.id; return d;
}
wall('none', '无');
wall('dirt', '泥土墙', { map: '#4a3424' });
wall('stone', '石墙', { map: '#3e3e42' });
wall('deepslate', '深板岩墙', { map: '#2a2a31' });
wall('sandstone', '砂岩墙', { map: '#7a6a48' });
wall('mud', '泥浆墙', { map: '#352a26' });
wall('ash', '灰烬墙', { map: '#3a2a26' });
wall('planks', '木墙', { map: '#5e4228' });
wall('brick', '红砖墙', { map: '#5a2c22' });
wall('stone_brick', '石砖墙', { map: '#45454a' });
wall('glass', '玻璃墙', { map: '#7a98a6', transparent: true, hard: 0.3 });
wall('cobble', '圆石墙', { map: '#3c3c3f' });
