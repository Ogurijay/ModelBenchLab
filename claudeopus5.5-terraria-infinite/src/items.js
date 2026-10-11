// 物品、工具、配方、冶炼与燃料。物品以字符串 key 为身份(存档稳定)。
import { B, W, BLOCKS, WALLS, SPECIES_KEYS, SPECIES_NAMES } from './blocks.js';

export const ITEMS = Object.create(null);
export const ITEM_LIST = [];

function item(key, name, p = {}) {
  const d = { key, name, stack: 64, kind: 'material', ...p };
  ITEMS[key] = d; ITEM_LIST.push(d); return d;
}

// —— 可放置方块
const blockItems = [
  ['dirt'], ['stone'], ['cobblestone'], ['sand'], ['sandstone'], ['gravel'], ['clay', '黏土块'], ['snow'],
  ['mud'], ['deepslate'], ['cobbled_deepslate'], ['obsidian'], ['ash'], ['glowstone'], ['cloud'],
  ['log'], ['planks'], ['glass'], ['bricks'], ['stone_bricks'], ['wool'], ['iron_block'], ['gold_block'], ['diamond_block'],
  ['crafting_table'], ['furnace'], ['chest'], ['torch'], ['lantern'], ['platform'], ['ladder'], ['tnt'],
  ['flower'], ['mushroom', '蘑菇', { food: { hunger: 1, sat: 0.6 } }], ['glow_mushroom'], ['cactus'], ['vine'],
];
for (const [k, n, extra] of blockItems) {
  const name = n || null;
  item(k, name, { kind: 'block', place: k, ...(extra || {}) });
}
item('door', '木门', { kind: 'block', place: 'door', stack: 16 });
item('bed', '床', { kind: 'block', place: 'bed', stack: 1 });
SPECIES_KEYS.forEach((s, i) => item('sapling_' + s, SPECIES_NAMES[i] + '树苗', { kind: 'block', place: 'sapling', placeMeta: i, fuel: 100, icon: 'block:sapling:' + i }));
item('seeds', '小麦种子', { kind: 'block', place: 'wheat', needs: 'farmland' });
item('berries', '甜浆果', { kind: 'food', place: 'berry_bush', needs: 'soil', food: { hunger: 2, sat: 0.4 } });

// —— 背景墙
const wallItems = ['dirt', 'stone', 'deepslate', 'sandstone', 'mud', 'ash', 'planks', 'brick', 'stone_brick', 'glass', 'cobble'];
for (const w of wallItems) item('wall_' + w, WALLS[W[w]].name, { kind: 'wall', placeWall: w });

// —— 材料
const mats = [
  ['stick', '木棍'], ['coal', '煤炭'], ['charcoal', '木炭'], ['raw_copper', '粗铜'], ['raw_iron', '粗铁'], ['raw_gold', '粗金'],
  ['raw_hellstone', '狱岩原矿'], ['copper_ingot', '铜锭'], ['iron_ingot', '铁锭'], ['gold_ingot', '金锭'], ['hellstone_ingot', '狱岩锭'],
  ['diamond', '钻石'], ['flint', '燧石'], ['string', '线'], ['feather', '羽毛'], ['leather', '皮革'], ['bone', '骨头'],
  ['gunpowder', '火药'], ['wheat_item', '小麦'], ['gel', '凝胶'], ['lens', '晶状体'], ['clay_ball', '黏土球'], ['brick', '红砖'],
  ['bone_meal', '骨粉'], ['egg', '鸡蛋'],
];
for (const [k, n] of mats) item(k, n);
ITEMS.bone_meal.use = 'bonemeal';
ITEMS.stick.fuel = 100; ITEMS.coal.fuel = 1600; ITEMS.charcoal.fuel = 1600;

// —— 食物
const foods = [
  ['apple', '苹果', 4, 2.4], ['golden_apple', '金苹果', 4, 9.6], ['bread', '面包', 5, 6],
  ['raw_pork', '生猪排', 3, 1.8], ['cooked_pork', '熟猪排', 8, 12.8], ['raw_beef', '生牛肉', 3, 1.8], ['steak', '牛排', 8, 12.8],
  ['raw_chicken', '生鸡肉', 2, 1.2], ['cooked_chicken', '熟鸡肉', 6, 7.2], ['raw_mutton', '生羊肉', 2, 1.2], ['cooked_mutton', '熟羊肉', 6, 9.6],
  ['rotten_flesh', '腐肉', 4, 0.8],
];
for (const [k, n, h, s] of foods) item(k, n, { kind: 'food', food: { hunger: h, sat: s } });
ITEMS.golden_apple.food.regen = 8;
ITEMS.rotten_flesh.food.sick = true;

// —— 工具
export const TIERS = [
  { key: 'wood', name: '木', tier: 1, speed: 2, dur: 60, dmg: 4, mat: 'planks', color: '#a0743c' },
  { key: 'stone', name: '石', tier: 2, speed: 4, dur: 132, dmg: 5, mat: '#cobble', color: '#8c8c90' },
  { key: 'copper', name: '铜', tier: 3, speed: 5, dur: 200, dmg: 5, mat: 'copper_ingot', color: '#d8803c' },
  { key: 'iron', name: '铁', tier: 4, speed: 6, dur: 250, dmg: 6, mat: 'iron_ingot', color: '#dcdcdc' },
  { key: 'gold', name: '金', tier: 2, speed: 12, dur: 40, dmg: 4, mat: 'gold_ingot', color: '#f6d24a' },
  { key: 'diamond', name: '钻石', tier: 5, speed: 8, dur: 1561, dmg: 7, mat: 'diamond', color: '#58e4dc' },
  { key: 'hellstone', name: '狱岩', tier: 6, speed: 10, dur: 2031, dmg: 9, mat: 'hellstone_ingot', color: '#ff6a2a', fire: true },
];
const TOOL_TYPES = [
  { key: 'pickaxe', name: '镐', type: 'pick', head: 3, sticks: 2, dmgOff: -2 },
  { key: 'axe', name: '斧', type: 'axe', head: 3, sticks: 2, dmgOff: -1 },
  { key: 'shovel', name: '锹', type: 'shovel', head: 1, sticks: 2, dmgOff: -2.5 },
  { key: 'sword', name: '剑', type: 'sword', head: 2, sticks: 1, dmgOff: 0 },
  { key: 'hoe', name: '锄', type: 'hoe', head: 2, sticks: 2, dmgOff: -3 },
  { key: 'hammer', name: '锤', type: 'hammer', head: 4, sticks: 2, dmgOff: -1.5 },
];
export const RECIPES = [];
for (const t of TIERS) for (const tt of TOOL_TYPES) {
  const key = t.key + '_' + tt.key;
  item(key, t.name + tt.name, {
    kind: 'tool', stack: 1,
    tool: { type: tt.type, tier: t.tier, speed: t.speed, dur: t.dur, tierKey: t.key, fire: !!t.fire },
    dmg: Math.max(1, t.dmg + tt.dmgOff), icon: 'tool:' + tt.key + ':' + t.key,
    fuel: t.key === 'wood' ? 200 : 0,
  });
  RECIPES.push({ out: key, n: 1, in: { [t.mat]: tt.head, stick: tt.sticks }, st: 'table' });
}
item('bow', '弓', { kind: 'bow', stack: 1, tool: { type: 'bow', dur: 384 }, dmg: 6, fuel: 300 });
item('arrow', '箭', {});
item('bucket', '铁桶', { kind: 'bucket', stack: 16, use: 'bucket' });
item('water_bucket', '水桶', { kind: 'bucket', stack: 1, use: 'pour', fluid: 1 });
item('lava_bucket', '岩浆桶', { kind: 'bucket', stack: 1, use: 'pour', fluid: 2, fuel: 20000 });
item('flint_and_steel', '打火石', { kind: 'tool', stack: 1, tool: { type: 'ignite', dur: 64 }, use: 'ignite' });
item('shears', '剪刀', { kind: 'tool', stack: 1, tool: { type: 'shears', dur: 238, speed: 5 }, use: 'shear' });
// —— 时间 / 信息类饰品(放在背包中即生效)
item('copper_watch', '铜怀表', { stack: 1, info: 'hour', desc: '放在背包里时,显示整点时刻。' });
item('gold_watch', '金怀表', { stack: 1, info: 'minute', desc: '放在背包里时,精确显示时、分。' });
item('almanac', '世界历书', { stack: 1, info: 'calendar', desc: '放在背包里时,显示季节、日期与月相。' });
item('barometer', '气压计', { stack: 1, info: 'weather', desc: '放在背包里时,预报下一次天气变化。' });

// —— 盔甲
export const ARMOR_TIERS = [
  { key: 'leather', name: '皮革', mat: 'leather', pts: [1, 3, 2, 1], dur: 5, color: '#9a6236' },
  { key: 'copper', name: '铜', mat: 'copper_ingot', pts: [2, 4, 3, 1], dur: 10, color: '#d8803c' },
  { key: 'iron', name: '铁', mat: 'iron_ingot', pts: [2, 6, 5, 2], dur: 15, color: '#d6d6d6' },
  { key: 'gold', name: '金', mat: 'gold_ingot', pts: [2, 5, 3, 1], dur: 7, color: '#f6d24a' },
  { key: 'diamond', name: '钻石', mat: 'diamond', pts: [3, 8, 6, 3], dur: 33, color: '#58e4dc' },
];
const ARMOR_SLOTS = [['helmet', '头盔', 5, 11], ['chestplate', '胸甲', 8, 16], ['leggings', '护腿', 7, 15], ['boots', '靴子', 4, 13]];
for (const a of ARMOR_TIERS) ARMOR_SLOTS.forEach(([k, n, cost, mul], slot) => {
  const key = a.key + '_' + k;
  item(key, a.name + n, { kind: 'armor', stack: 1, armor: { slot, pts: a.pts[slot], dur: a.dur * mul, color: a.color, tierKey: a.key }, icon: 'armor:' + slot + ':' + a.key });
  RECIPES.push({ out: key, n: 1, in: { [a.mat]: cost }, st: 'table' });
});
// —— 艾泽拉斯·无限:货币、徽记、布料、阵营装备、旗帜与建材
item('coin_copper', '铜币', { kind: 'coin', coin: 1, stack: 999 });
item('coin_silver', '银币', { kind: 'coin', coin: 100, stack: 999 });
item('coin_gold', '金币', { kind: 'coin', coin: 10000, stack: 999 });
item('alliance_insignia', '联盟徽记', { stack: 999, desc: '从联盟士兵身上取得。部落商人会用阵营装备交换它。' });
item('horde_insignia', '部落徽记', { stack: 999, desc: '从部落士兵身上取得。联盟军需官会用阵营装备交换它。' });
item('linen_cloth', '亚麻布', {});
item('wool_cloth', '毛料', {});
const weapon = (key, name, type, dmg, extra = {}) => item(key, name, { kind: 'tool', stack: 1, tool: { type, tier: 0, speed: 1, dur: 600 }, dmg, weapon: true, ...extra });
weapon('stormwind_sword', '暴风城长剑', 'sword', 8, { faction: 'alliance', icon: 'tool:sword:stormwind', desc: '联盟制式长剑,剑脊上刻着狮子纹章。' });
weapon('orgrimmar_axe', '奥格瑞玛战斧', 'sword', 9, { faction: 'horde', icon: 'tool:waraxe:orgrimmar', desc: '沉重的兽人战斧,挥砍范围更大。' });
weapon('darkspear_spear', '暗矛长矛', 'sword', 8, { faction: 'horde', reach: 3.6, icon: 'tool:spear:darkspear', desc: '巨魔猎手的长矛,攻击距离更远。' });
item('darnassus_bow', '达纳苏斯长弓', { kind: 'bow', stack: 1, tool: { type: 'bow', dur: 800 }, dmg: 9, weapon: true, faction: 'alliance', desc: '月光木制成的长弓。' });
weapon('apprentice_staff', '学徒法杖', 'staff', 3, { spell: 3, icon: 'tool:staff:apprentice', desc: '提升法术伤害与治疗效果。' });
weapon('arcane_staff', '奥术法杖', 'staff', 4, { spell: 8, faction: 'alliance', icon: 'tool:staff:arcane', desc: '蕴含奥术能量的法杖。' });
weapon('totem_staff', '先祖图腾杖', 'staff', 4, { spell: 8, faction: 'horde', icon: 'tool:staff:totem', desc: '雕刻着先祖之灵的图腾杖。' });
item('alliance_tabard', '联盟战袍', { kind: 'armor', stack: 1, armor: { slot: 1, pts: 3, dur: 300, color: '#3a72e0', tierKey: 'tabard_a', tabard: 'alliance' }, faction: 'alliance' });
item('horde_tabard', '部落战袍', { kind: 'armor', stack: 1, armor: { slot: 1, pts: 3, dur: 300, color: '#c03a2a', tierKey: 'tabard_h', tabard: 'horde' }, faction: 'horde' });
item('alliance_banner', '联盟旗帜', { kind: 'block', place: 'alliance_banner', stack: 8, desc: '插在有墙壁、门和光源的房屋里,建立联盟前哨。' });
item('horde_banner', '部落旗帜', { kind: 'block', place: 'horde_banner', stack: 8, desc: '插在有墙壁、门和光源的房屋里,建立部落前哨。' });
item('alliance_bricks', '联盟石砖', { kind: 'block', place: 'alliance_bricks' });
item('horde_wood', '部落硬木', { kind: 'block', place: 'horde_wood' });
item('brazier', '火盆', { kind: 'block', place: 'brazier' });
item('mining_helmet', '矿工头盔', { kind: 'armor', stack: 1, armor: { slot: 0, pts: 2, dur: 200, color: '#d0b030', light: true, tierKey: 'mining' }, desc: '佩戴时头灯照亮前方。' });

// —— 名称回填
for (const it of ITEM_LIST) {
  if (!it.name && it.place) it.name = BLOCKS[B[it.place]].name;
  if (!it.icon) it.icon = it.kind === 'block' ? 'block:' + it.place + ':' + (it.placeMeta || 0) : it.kind === 'wall' ? 'wall:' + it.placeWall : 'item:' + it.key;
  if (it.kind === 'block' && !it.fuel && ['log', 'planks', 'crafting_table', 'chest', 'ladder', 'platform'].includes(it.key)) it.fuel = 300;
}

// —— 配方
export const TAGS = { '#cobble': ['cobblestone', 'cobbled_deepslate'], '#coal': ['coal', 'charcoal'] };
const R = (out, n, inp, st = null) => RECIPES.push({ out, n, in: inp, st });
R('planks', 4, { log: 1 });
R('stick', 4, { planks: 2 });
R('crafting_table', 1, { planks: 4 });
R('torch', 4, { stick: 1, '#coal': 1 });
R('torch', 3, { stick: 1, gel: 1 });
R('platform', 2, { planks: 1 });
R('wall_planks', 4, { planks: 1 });
R('bone_meal', 3, { bone: 1 });
R('wool', 1, { string: 4 });
R('furnace', 1, { '#cobble': 8 }, 'table');
R('chest', 1, { planks: 8 }, 'table');
R('door', 1, { planks: 6 }, 'table');
R('ladder', 3, { stick: 7 }, 'table');
R('bed', 1, { wool: 3, planks: 3 }, 'table');
R('bow', 1, { stick: 3, string: 3 }, 'table');
R('arrow', 4, { flint: 1, stick: 1, feather: 1 }, 'table');
R('bucket', 1, { iron_ingot: 3 }, 'table');
R('shears', 1, { iron_ingot: 2 }, 'table');
R('flint_and_steel', 1, { iron_ingot: 1, flint: 1 }, 'table');
R('bread', 1, { wheat_item: 3 }, 'table');
R('tnt', 1, { gunpowder: 5, sand: 4 }, 'table');
R('sandstone', 1, { sand: 4 }, 'table');
R('stone_bricks', 4, { stone: 4 }, 'table');
R('bricks', 1, { brick: 4 }, 'table');
R('lantern', 1, { iron_ingot: 1, torch: 1 }, 'table');
R('golden_apple', 1, { gold_ingot: 8, apple: 1 }, 'table');
R('iron_block', 1, { iron_ingot: 9 }, 'table');
R('gold_block', 1, { gold_ingot: 9 }, 'table');
R('diamond_block', 1, { diamond: 9 }, 'table');
R('iron_ingot', 9, { iron_block: 1 });
R('gold_ingot', 9, { gold_block: 1 });
R('diamond', 9, { diamond_block: 1 });
R('copper_watch', 1, { copper_ingot: 6, glass: 1 }, 'table');
R('gold_watch', 1, { gold_ingot: 6, glass: 1 }, 'table');
R('almanac', 1, { leather: 1, wheat_item: 3, feather: 1 }, 'table');
R('barometer', 1, { copper_ingot: 3, glass: 2 }, 'table');
R('mining_helmet', 1, { iron_ingot: 5, lens: 1, torch: 1 }, 'table');
R('wall_brick', 4, { bricks: 1 }, 'table');
R('wall_stone_brick', 4, { stone_bricks: 1 }, 'table');
R('wall_glass', 4, { glass: 1 }, 'table');
R('wall_cobble', 4, { cobblestone: 1 }, 'table');
R('wall_stone', 4, { stone: 1 }, 'table');
R('wall_dirt', 4, { dirt: 1 }, 'table');
R('wall_sandstone', 4, { sandstone: 1 }, 'table');
R('wall_mud', 4, { mud: 1 }, 'table');
// 艾泽拉斯·无限
R('alliance_bricks', 4, { stone_bricks: 4 }, 'table'); RECIPES[RECIPES.length - 1].faction = 'alliance';
R('horde_wood', 4, { planks: 4, log: 1 }, 'table'); RECIPES[RECIPES.length - 1].faction = 'horde';
R('alliance_banner', 1, { wool: 3, stick: 2, gold_ingot: 1 }, 'table'); RECIPES[RECIPES.length - 1].faction = 'alliance';
R('horde_banner', 1, { wool: 3, stick: 2, gold_ingot: 1 }, 'table'); RECIPES[RECIPES.length - 1].faction = 'horde';
R('brazier', 1, { iron_ingot: 2, '#coal': 2 }, 'table');
R('apprentice_staff', 1, { stick: 4, copper_ingot: 2 }, 'table');
R('wool', 1, { linen_cloth: 3 });
R('wool', 1, { wool_cloth: 3 });
// 工具配方排在最前,常用的建材紧随
RECIPES.sort((a, b) => (a.st === b.st ? 0 : a.st ? 1 : -1));

// —— 冶炼(熔炉,每件 200 刻 = 10 秒)与燃料
export const SMELT = {
  raw_copper: 'copper_ingot', raw_iron: 'iron_ingot', raw_gold: 'gold_ingot', raw_hellstone: 'hellstone_ingot',
  sand: 'glass', cobblestone: 'stone', cobbled_deepslate: 'deepslate', clay_ball: 'brick', log: 'charcoal',
  raw_pork: 'cooked_pork', raw_beef: 'steak', raw_chicken: 'cooked_chicken', raw_mutton: 'cooked_mutton', cactus: 'gel',
};
export const SMELT_TICKS = 200;
export const fuelOf = key => (key && ITEMS[key] ? ITEMS[key].fuel || 0 : 0);

export const isTool = key => !!ITEMS[key]?.tool;
export const maxStack = key => ITEMS[key]?.stack || 64;
export function itemName(key) { return ITEMS[key]?.name || key; }
export function tagMatches(tag, key) { return tag === key || (TAGS[tag] && TAGS[tag].includes(key)); }

// 掉落物解析:字符串 / [key, n] / 函数(r) → [key, n] | null
export function resolveDrop(drop, r) {
  if (!drop) return null;
  if (typeof drop === 'string') return [drop, 1];
  if (typeof drop === 'function') return resolveDrop(drop(r), r);
  return drop;
}
