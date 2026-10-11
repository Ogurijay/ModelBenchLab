// 艾泽拉斯·无限:阵营、种族、职业、技能、阵营 NPC、任务线与商人数据。
// 故事框架致敬《魔兽世界:无限》(原初 60 级艾泽拉斯的 If 线、无服务器、阵营彻底隔离、名+姓、天裔种族);
// 文本与数值均为本作原创,种族/职业特性为 2D 玩法改编。
import { BIOME } from './worldgen.js';

export const LEVEL_CAP = 60;
export const FUSION_LEVEL = 20;

export const FACTIONS = {
  alliance: { name: '联盟', color: '#3a72e0', dark: '#16245a', accent: '#f2c84a', enemy: 'horde', banner: 'alliance_banner', insignia: 'alliance_insignia', motto: '为了联盟!' },
  horde: { name: '部落', color: '#d23a2a', dark: '#3a0c0a', accent: '#2a2420', enemy: 'alliance', banner: 'horde_banner', insignia: 'horde_insignia', motto: '为了部落!' },
};

// —— 种族
// body: 体型(art 像素)  feat: 外形特征  home: 偏好出生群系  zone: 起始区域名
export const RACES = {
  human: {
    name: '人类', faction: 'alliance', classes: ['warrior', 'paladin', 'rogue', 'priest', 'mage', 'warlock'],
    skins: ['#f2d0b0', '#e6b892', '#c8916a', '#9e6a48', '#744830'], eyes: ['#2a5ad8', '#3a7a3a', '#6a4a2a', '#4a4a5a'],
    body: 'normal', ears: 'round', home: [BIOME.FOREST, BIOME.PLAINS], zone: '艾尔文森林',
    passive: '人类精神:获得的经验与金钱 +10%。', racial: { id: 'every_man', name: '不屈意志', cd: 120, desc: '立即解除减速与昏迷,并恢复 20% 生命。' },
    desc: '坚韧而多才的王国子民,在无尽的新大陆上重建家园。',
  },
  dwarf: {
    name: '矮人', faction: 'alliance', classes: ['warrior', 'paladin', 'hunter', 'rogue', 'priest'],
    skins: ['#f0c8a8', '#e0a888', '#c88868', '#a06848'], eyes: ['#2a5ad8', '#5a3a1a', '#3a6a3a'],
    body: 'stocky', ears: 'round', beardDefault: 2, home: [BIOME.TAIGA, BIOME.MOUNTAINS], zone: '丹莫罗',
    passive: '采矿专精:挖掘速度 +20%,寒冷不影响移动。', racial: { id: 'stoneform', name: '石像形态', cd: 120, desc: '8 秒内受到的伤害降低 60%。' },
    desc: '来自雪山深处的坚毅民族,天生的矿工与铁匠。',
  },
  nightelf: {
    name: '暗夜精灵', faction: 'alliance', classes: ['warrior', 'hunter', 'rogue', 'priest', 'druid'],
    skins: ['#b8a2e8', '#9e88d6', '#8a76c6', '#7466ae', '#a6a0d8'], eyes: ['#e8f4ff', '#f0ffd8'], glowEyes: true,
    body: 'tall', ears: 'long', home: [BIOME.FOREST], zone: '泰达希尔',
    passive: '迅捷:夜晚移动速度 +10%,闪避 +5%。', racial: { id: 'shadowmeld', name: '影遁', cd: 60, desc: '隐入暗影 12 秒,怪物会失去你的踪迹(攻击或移动过快会打破)。' },
    desc: '古老森林的守望者,在月光下行走无声。',
  },
  gnome: {
    name: '侏儒', faction: 'alliance', classes: ['warrior', 'rogue', 'mage', 'warlock'],
    skins: ['#f8dcc8', '#f0c8b0', '#e8b8a0', '#d8a888'], eyes: ['#3a8ad8', '#8a4ad8', '#3aa860'],
    body: 'small', ears: 'round', home: [BIOME.MOUNTAINS, BIOME.TAIGA], zone: '诺莫瑞根外围',
    passive: '奇思妙想:法力上限 +10%,合成时有概率节省材料。', racial: { id: 'escape_artist', name: '逃命专家', cd: 60, desc: '4 秒内移动速度 +80%,并解除减速。' },
    desc: '聪明绝顶的发明家,个子小但点子多。',
  },
  skyborn_a: {
    name: '高阶会天裔', faction: 'alliance', classes: ['druid', 'hunter', 'mage', 'rogue', 'warrior'],
    skins: ['#eef2fa', '#dce8f6', '#c8d8f0', '#f2e8f6'], eyes: ['#7ad8ff', '#a8f0ff'], glowEyes: true,
    body: 'slim', ears: 'long', home: 'island', zone: '泽风岛',
    passive: '风灵护佑:免疫摔落伤害;踏空而行:空中按住空格可滑翔 10 秒。', racial: { id: 'wind_step', name: '风之跃', cd: 30, desc: '借风势向光标方向腾跃。' },
    desc: '与风灵缔约的流放精灵后裔,在天空之墙的文明中长大。',
  },
  orc: {
    name: '兽人', faction: 'horde', classes: ['warrior', 'hunter', 'rogue', 'shaman', 'warlock'],
    skins: ['#6aa040', '#5a8a30', '#7aa858', '#8a7a40', '#4a7030'], eyes: ['#c83020', '#e0a020', '#3a2a1a'],
    body: 'broad', ears: 'round', tusks: 1, home: [BIOME.DESERT, BIOME.PLAINS], zone: '杜隆塔尔',
    passive: '坚韧:受到的伤害降低 5%。', racial: { id: 'blood_fury', name: '血性狂怒', cd: 120, desc: '15 秒内造成的伤害提高 30%。' },
    desc: '骁勇的战士民族,以荣耀与力量立足于荒原。',
  },
  undead: {
    name: '亡灵', faction: 'horde', classes: ['warrior', 'rogue', 'priest', 'mage', 'warlock'],
    skins: ['#a8b0a0', '#8a9888', '#9aa0b0', '#b0a890'], eyes: ['#f0e040', '#c8f0ff'], glowEyes: true,
    body: 'thin', ears: 'round', undead: true, home: [BIOME.FOREST, BIOME.TAIGA], zone: '提瑞斯法林地',
    passive: '水下呼吸:氧气消耗速度降低 75%;不受腐肉的恶心效果影响。', racial: { id: 'cannibalize', name: '食尸', cd: 90, desc: '5 秒内恢复 35% 生命。' },
    desc: '挣脱了控制的被遗忘者,以冰冷的意志选择自己的道路。',
  },
  tauren: {
    name: '牛头人', faction: 'horde', classes: ['warrior', 'hunter', 'shaman', 'druid'],
    skins: ['#7a5030', '#5a3a20', '#a07850', '#e8e0d0', '#3a2a20'], eyes: ['#2a1a10', '#4a3a2a'],
    body: 'huge', ears: 'cow', horns: true, home: [BIOME.PLAINS], zone: '莫高雷',
    passive: '耐久:生命上限 +10%。', racial: { id: 'war_stomp', name: '战争践踏', cd: 90, desc: '震击大地,使 4 格内的敌人昏迷 2 秒。' },
    desc: '敬奉大地母亲的高大民族,平原上的守护者。',
  },
  troll: {
    name: '巨魔', faction: 'horde', classes: ['warrior', 'hunter', 'rogue', 'priest', 'shaman', 'mage'],
    skins: ['#5a9ab8', '#4a8aa0', '#6aa8a0', '#7a90b8', '#5ab08a'], eyes: ['#e0c020', '#e04040', '#40c0e0'],
    body: 'tall', ears: 'troll', tusks: 2, home: [BIOME.JUNGLE, BIOME.BEACH], zone: '回音群岛',
    passive: '再生:生命恢复速度翻倍。', racial: { id: 'berserking', name: '狂暴', cd: 120, desc: '10 秒内伤害 +20%,移动速度 +15%。' },
    desc: '敏捷而狡黠的丛林部族,信奉古老的洛阿神灵。',
  },
  skyborn_h: {
    name: '塑风者天裔', faction: 'horde', classes: ['druid', 'hunter', 'rogue', 'shaman', 'warrior'],
    skins: ['#eef2fa', '#dce8f6', '#d8e0ee', '#e8eef8'], eyes: ['#7ad8ff', '#a8ffe0'], glowEyes: true,
    body: 'slim', ears: 'long', home: 'island', zone: '泽风岛',
    passive: '风灵护佑:免疫摔落伤害;踏空而行:空中按住空格可滑翔 10 秒。', racial: { id: 'wind_step', name: '风之跃', cd: 30, desc: '借风势向光标方向腾跃。' },
    desc: '驾驭风暴的天裔一支,加入部落以寻求自由。',
  },
};
export const RACE_ORDER = { alliance: ['human', 'dwarf', 'nightelf', 'gnome', 'skyborn_a'], horde: ['orc', 'undead', 'tauren', 'troll', 'skyborn_h'] };

export const HAIR_STYLES = ['短发', '长发', '马尾', '莫西干', '光头', '发髻', '刺猬头', '双马尾', '脏辫', '精灵长发'];
export const HAIR_COLORS = ['#2a1a10', '#6a3a1a', '#a0622a', '#d8b050', '#f0e0a0', '#e8e8f0', '#a03a1a', '#3a6ad8', '#2a8a4a', '#8a3ac0', '#e05090', '#1a1a2a'];
export const OUTFIT_COLORS = ['#3a8ad8', '#c03a3a', '#4a8a3a', '#8a3ac0', '#d8a030', '#3a3a4a', '#e8e0d0', '#2a6a6a', '#8a5a2a', '#d05a8a'];
export const BEARDS = ['无', '短须', '浓密长须', '山羊胡'];

// —— 职业
export const CLASSES = {
  warrior: { name: '战士', color: '#c69b6d', res: 'rage', melee: 1.25, spell: 0, hp: 1.15, desc: '近战专家,以怒气驱动强力打击。' },
  paladin: { name: '圣骑士', color: '#f48cba', res: 'mana', melee: 1.15, spell: 0.8, hp: 1.1, desc: '圣光的战士,攻守兼备并能治疗。' },
  hunter: { name: '猎人', color: '#aad372', res: 'mana', melee: 0.9, spell: 0.6, ranged: 1.3, hp: 1.0, desc: '远程射手,与野兽伙伴并肩作战。' },
  rogue: { name: '盗贼', color: '#fff468', res: 'energy', melee: 1.3, spell: 0, hp: 0.95, desc: '潜行于暗影之中,以爆发致命一击。' },
  priest: { name: '牧师', color: '#ffffff', res: 'mana', melee: 0.8, spell: 1.15, hp: 0.9, desc: '神圣与暗影的施法者,强大的治疗者。' },
  shaman: { name: '萨满祭司', color: '#2a7ef0', res: 'mana', melee: 1.05, spell: 1.05, hp: 1.05, desc: '呼唤元素之力,使用图腾与闪电。' },
  mage: { name: '法师', color: '#3fc7eb', res: 'mana', melee: 0.75, spell: 1.3, hp: 0.85, desc: '奥术、火焰与冰霜的大师,擅长闪现。' },
  warlock: { name: '术士', color: '#8788ee', res: 'mana', melee: 0.75, spell: 1.2, hp: 0.9, desc: '驱使恶魔与暗影,以持续伤害折磨敌人。' },
  druid: { name: '德鲁伊', color: '#ff7c0a', res: 'mana', melee: 1.0, spell: 1.05, hp: 1.0, desc: '自然的守护者,可化身熊与猎豹。' },
};
export const RES_INFO = { rage: { name: '怒气', color: '#d02a2a', max: 100 }, mana: { name: '法力', color: '#2a6ae0', max: 100 }, energy: { name: '能量', color: '#e8d040', max: 100 } };

// —— 技能
// kind: bolt 飞弹 / melee 近战 / aoe 自身范围 / heal / buff / dash / blink / summon / form / dot / ground
export const SKILLS = {
  // 战士
  heroic_strike: { cls: 'warrior', lvl: 1, name: '英勇打击', cost: 15, cd: 1.6, kind: 'melee', mult: 2.0, glyph: '剑', color: '#d8a060', desc: '一次强力挥砍,造成 200% 武器伤害。' },
  charge: { cls: 'warrior', lvl: 2, name: '冲锋', cost: 0, gain: 20, cd: 12, kind: 'dash', range: 10, stun: 1.5, glyph: '冲', color: '#e0c060', desc: '向光标方向冲锋,撞到的第一个敌人昏迷 1.5 秒,获得 20 点怒气。' },
  whirlwind: { cls: 'warrior', lvl: 6, name: '旋风斩', cost: 25, cd: 8, kind: 'aoe', radius: 3.2, mult: 1.3, glyph: '旋', color: '#c08040', desc: '旋转攻击周围 3 格内所有敌人。' },
  shield_wall: { cls: 'warrior', lvl: 12, name: '盾墙', cost: 10, cd: 60, kind: 'buff', buff: 'shield_wall', dur: 8, glyph: '盾', color: '#a0a0b0', desc: '8 秒内受到的伤害降低 60%。' },
  execute: { cls: 'warrior', lvl: 20, name: '斩杀', cost: 20, cd: 4, kind: 'melee', mult: 1.6, execute: true, glyph: '斩', color: '#e04030', desc: '对生命低于 30% 的敌人造成 400% 伤害。' },
  // 圣骑士
  judgement: { cls: 'paladin', lvl: 1, name: '审判', cost: 12, cd: 5, kind: 'bolt', dmg: 7, speed: 26, fx: 'holy', glyph: '审', color: '#f8e070', desc: '向光标方向射出圣光之锤。' },
  holy_light: { cls: 'paladin', lvl: 2, name: '圣光术', cost: 25, cd: 6, kind: 'heal', heal: 0.35, glyph: '光', color: '#fff0a0', desc: '恢复 35% 生命。' },
  consecration: { cls: 'paladin', lvl: 6, name: '奉献', cost: 25, cd: 10, kind: 'ground', radius: 3, dps: 3, dur: 6, fx: 'holy', glyph: '献', color: '#f0d050', desc: '圣化脚下的土地,6 秒内持续灼烧范围内的敌人。' },
  divine_shield: { cls: 'paladin', lvl: 12, name: '圣盾术', cost: 15, cd: 120, kind: 'buff', buff: 'divine_shield', dur: 6, glyph: '圣', color: '#fff8d0', desc: '6 秒内免疫所有伤害。' },
  hammer_justice: { cls: 'paladin', lvl: 20, name: '制裁之锤', cost: 15, cd: 20, kind: 'bolt', dmg: 5, speed: 22, stun: 3, fx: 'holy', glyph: '锤', color: '#e8c040', desc: '投出圣锤,使目标昏迷 3 秒。' },
  // 猎人
  steady_shot: { cls: 'hunter', lvl: 1, name: '稳固射击', cost: 6, cd: 0.9, kind: 'arrow', dmg: 6, speed: 34, glyph: '射', color: '#a0d060', desc: '无需箭矢的精准射击。' },
  concussive_shot: { cls: 'hunter', lvl: 2, name: '震荡射击', cost: 10, cd: 8, kind: 'arrow', dmg: 3, speed: 30, slow: 4, glyph: '震', color: '#80b0f0', desc: '使目标减速 50%,持续 4 秒。' },
  multi_shot: { cls: 'hunter', lvl: 6, name: '多重射击', cost: 18, cd: 6, kind: 'arrow', dmg: 5, speed: 30, count: 3, glyph: '多', color: '#c0e070', desc: '扇形射出三支箭。' },
  call_pet: { cls: 'hunter', lvl: 10, name: '召唤野兽', cost: 30, cd: 30, kind: 'summon', pet: 'wolf', glyph: '兽', color: '#c08a50', desc: '召唤一只狼伙伴为你作战(再次施放可召回)。' },
  rapid_fire: { cls: 'hunter', lvl: 20, name: '急速射击', cost: 20, cd: 60, kind: 'buff', buff: 'rapid_fire', dur: 10, glyph: '速', color: '#e0f060', desc: '10 秒内射击技能冷却缩短 60%。' },
  // 盗贼
  sinister_strike: { cls: 'rogue', lvl: 1, name: '邪恶攻击', cost: 40, cd: 0.8, kind: 'melee', mult: 1.8, glyph: '邪', color: '#f0e060', desc: '迅捷一刺,造成 180% 武器伤害。' },
  stealth: { cls: 'rogue', lvl: 2, name: '潜行', cost: 0, cd: 6, kind: 'buff', buff: 'stealth', dur: 60, glyph: '潜', color: '#8a8aa0', desc: '进入潜行,怪物难以发现你;下一次攻击伤害翻倍(攻击后解除)。' },
  evasion: { cls: 'rogue', lvl: 6, name: '闪避', cost: 0, cd: 60, kind: 'buff', buff: 'evasion', dur: 8, glyph: '闪', color: '#d0d0e0', desc: '8 秒内闪避 70% 的攻击。' },
  kidney_shot: { cls: 'rogue', lvl: 12, name: '肾击', cost: 30, cd: 15, kind: 'melee', mult: 1.0, stun: 3, glyph: '肾', color: '#e0a040', desc: '击打要害,使目标昏迷 3 秒。' },
  sprint: { cls: 'rogue', lvl: 20, name: '疾跑', cost: 0, cd: 45, kind: 'buff', buff: 'sprint', dur: 8, glyph: '疾', color: '#f0f0a0', desc: '8 秒内移动速度 +70%。' },
  // 牧师
  smite: { cls: 'priest', lvl: 1, name: '惩击', cost: 10, cd: 1.2, kind: 'bolt', dmg: 6, speed: 24, fx: 'holy', glyph: '惩', color: '#fff4b0', desc: '以圣光惩戒敌人。' },
  flash_heal: { cls: 'priest', lvl: 2, name: '快速治疗', cost: 20, cd: 3, kind: 'heal', heal: 0.3, glyph: '愈', color: '#c0ffc0', desc: '恢复 30% 生命。' },
  pw_shield: { cls: 'priest', lvl: 6, name: '真言术:盾', cost: 20, cd: 12, kind: 'buff', buff: 'pw_shield', dur: 15, glyph: '盾', color: '#e0f0ff', desc: '获得可吸收 40% 最大生命值伤害的护盾。' },
  sw_pain: { cls: 'priest', lvl: 10, name: '暗言术:痛', cost: 15, cd: 2, kind: 'bolt', dmg: 2, speed: 22, dot: 2.5, dotDur: 8, fx: 'shadow', glyph: '痛', color: '#a060e0', desc: '暗影之力在 8 秒内持续侵蚀目标。' },
  psychic_scream: { cls: 'priest', lvl: 20, name: '心灵尖啸', cost: 20, cd: 25, kind: 'aoe', radius: 5, mult: 0, fear: 4, glyph: '啸', color: '#c080ff', desc: '使周围 5 格内的敌人恐惧逃跑 4 秒。' },
  // 萨满
  lightning_bolt: { cls: 'shaman', lvl: 1, name: '闪电箭', cost: 10, cd: 1.3, kind: 'bolt', dmg: 7, speed: 36, fx: 'lightning', glyph: '电', color: '#80c0ff', desc: '召唤一道闪电击打敌人。' },
  earth_shock: { cls: 'shaman', lvl: 2, name: '大地震击', cost: 12, cd: 6, kind: 'bolt', dmg: 6, speed: 30, stun: 1, fx: 'earth', glyph: '震', color: '#c09050', desc: '震击目标,使其昏迷 1 秒。' },
  healing_wave: { cls: 'shaman', lvl: 6, name: '治疗波', cost: 22, cd: 5, kind: 'heal', heal: 0.4, glyph: '波', color: '#60e0c0', desc: '恢复 40% 生命。' },
  searing_totem: { cls: 'shaman', lvl: 10, name: '灼热图腾', cost: 20, cd: 15, kind: 'summon', pet: 'totem', glyph: '腾', color: '#f08040', desc: '在脚下放置一座灼热图腾,20 秒内自动攻击附近敌人。' },
  chain_lightning: { cls: 'shaman', lvl: 20, name: '闪电链', cost: 25, cd: 8, kind: 'bolt', dmg: 9, speed: 40, chain: 3, fx: 'lightning', glyph: '链', color: '#a0d0ff', desc: '闪电在最多 3 个敌人之间跳跃。' },
  // 法师
  fireball: { cls: 'mage', lvl: 1, name: '火球术', cost: 12, cd: 1.4, kind: 'bolt', dmg: 8, speed: 24, burn: 3, fx: 'fire', glyph: '火', color: '#ff8030', desc: '投出火球,点燃目标。' },
  frostbolt: { cls: 'mage', lvl: 2, name: '寒冰箭', cost: 12, cd: 1.6, kind: 'bolt', dmg: 6, speed: 26, slow: 4, fx: 'frost', glyph: '冰', color: '#80d0ff', desc: '冰霜之箭,使目标减速 4 秒。' },
  frost_nova: { cls: 'mage', lvl: 6, name: '冰霜新星', cost: 20, cd: 18, kind: 'aoe', radius: 4, mult: 0.5, root: 3, fx: 'frost', glyph: '霜', color: '#c0f0ff', desc: '冻结周围 4 格内的敌人 3 秒。' },
  blink: { cls: 'mage', lvl: 10, name: '闪现术', cost: 15, cd: 12, kind: 'blink', range: 7, glyph: '闪', color: '#c0a0ff', desc: '向光标方向瞬移最多 7 格。' },
  pyroblast: { cls: 'mage', lvl: 20, name: '炎爆术', cost: 30, cd: 10, kind: 'bolt', dmg: 18, speed: 20, burn: 5, big: true, fx: 'fire', glyph: '炎', color: '#ff5020', desc: '巨大的火焰飞弹,造成大量伤害。' },
  // 术士
  shadow_bolt: { cls: 'warlock', lvl: 1, name: '暗影箭', cost: 12, cd: 1.5, kind: 'bolt', dmg: 8, speed: 22, fx: 'shadow', glyph: '影', color: '#9050d0', desc: '射出暗影能量。' },
  corruption: { cls: 'warlock', lvl: 2, name: '腐蚀术', cost: 12, cd: 2, kind: 'bolt', dmg: 1, speed: 26, dot: 2.5, dotDur: 10, fx: 'shadow', glyph: '蚀', color: '#70a040', desc: '腐蚀目标,10 秒内持续造成伤害。' },
  life_tap: { cls: 'warlock', lvl: 6, name: '生命分流', cost: 0, cd: 3, kind: 'buff', buff: 'life_tap', glyph: '流', color: '#d04060', desc: '消耗 10% 生命,转化为 35 点法力。' },
  summon_imp: { cls: 'warlock', lvl: 10, name: '召唤小鬼', cost: 30, cd: 30, kind: 'summon', pet: 'imp', glyph: '鬼', color: '#e06030', desc: '召唤一只投掷火球的小鬼(再次施放可召回)。' },
  fear: { cls: 'warlock', lvl: 20, name: '恐惧术', cost: 15, cd: 15, kind: 'bolt', dmg: 0, speed: 26, fear: 5, fx: 'shadow', glyph: '惧', color: '#b080e0', desc: '使目标恐惧逃跑 5 秒。' },
  // 德鲁伊
  wrath: { cls: 'druid', lvl: 1, name: '愤怒', cost: 10, cd: 1.3, kind: 'bolt', dmg: 7, speed: 26, fx: 'nature', glyph: '怒', color: '#90e060', desc: '以自然之力攻击敌人。' },
  rejuvenation: { cls: 'druid', lvl: 2, name: '回春术', cost: 15, cd: 6, kind: 'buff', buff: 'rejuv', dur: 12, glyph: '春', color: '#80f080', desc: '12 秒内持续恢复 45% 生命。' },
  bear_form: { cls: 'druid', lvl: 6, name: '熊形态', cost: 10, cd: 2, kind: 'form', form: 'bear', glyph: '熊', color: '#a07040', desc: '变为熊:生命上限 +40%、护甲提升、强力近战;无法挖掘与施法。再次施放恢复人形。' },
  cat_form: { cls: 'druid', lvl: 10, name: '猎豹形态', cost: 10, cd: 2, kind: 'form', form: 'cat', glyph: '豹', color: '#e0b040', desc: '变为猎豹:移动速度 +40%,近战迅捷。再次施放恢复人形。' },
  moonfire: { cls: 'druid', lvl: 20, name: '月火术', cost: 14, cd: 3, kind: 'bolt', dmg: 6, speed: 40, dot: 2, dotDur: 9, fx: 'arcane', glyph: '月', color: '#e0a0ff', desc: '月光灼烧目标,并持续造成伤害。' },
};
export const SKILL_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'];
export const SKILL_KEY_NAMES = ['Z', 'X', 'C', 'V', 'B'];
export const classSkills = cls => Object.entries(SKILLS).filter(([, s]) => s.cls === cls).map(([id, s]) => ({ id, ...s })).sort((a, b) => a.lvl - b.lvl);

// —— 阵营 NPC
// role: quest 任务官 / vendor 商人 / guard 近战卫兵 / ranged 射手 / caster 施法者 / elite 精英
export const NPC_TYPES = {
  a_herald: { name: '联盟传令官', faction: 'alliance', race: 'human', role: 'quest', hp: 30, dmg: 3, outfit: ['#2a5ad8', '#2a2a4a'] },
  a_quartermaster: { name: '联盟军需官', faction: 'alliance', race: 'dwarf', role: 'vendor', hp: 30, dmg: 3, outfit: ['#3a62c0', '#5a3a1a'] },
  a_footman: { name: '暴风城步兵', faction: 'alliance', race: 'human', role: 'guard', hp: 26, dmg: 4, weapon: 'iron_sword', armor: '#c8ccd8', outfit: ['#2a5ad8', '#3a3a5a'] },
  a_sentinel: { name: '暗夜精灵哨兵', faction: 'alliance', race: 'nightelf', role: 'ranged', hp: 20, dmg: 4, weapon: 'bow', outfit: ['#4a3a8a', '#2a2a4a'] },
  a_rifleman: { name: '铁炉堡火枪手', faction: 'alliance', race: 'dwarf', role: 'ranged', hp: 24, dmg: 4, weapon: 'bow', outfit: ['#2a5ad8', '#5a3a1a'] },
  a_mage: { name: '侏儒奥术师', faction: 'alliance', race: 'gnome', role: 'caster', spell: 'frostbolt', hp: 16, dmg: 4, outfit: ['#7a3ac8', '#3a2a5a'] },
  a_captain: { name: '联盟队长', faction: 'alliance', race: 'human', role: 'elite', hp: 70, dmg: 6, weapon: 'iron_sword', armor: '#f0c84a', outfit: ['#2a5ad8', '#2a2a4a'] },
  h_emissary: { name: '部落使者', faction: 'horde', race: 'orc', role: 'quest', hp: 30, dmg: 3, outfit: ['#a82a20', '#3a2a1a'] },
  h_merchant: { name: '部落商人', faction: 'horde', race: 'troll', role: 'vendor', hp: 30, dmg: 3, outfit: ['#a83a20', '#4a3a2a'] },
  h_grunt: { name: '兽人步兵', faction: 'horde', race: 'orc', role: 'guard', hp: 28, dmg: 4, weapon: 'iron_axe', armor: '#8a6a4a', outfit: ['#a82a20', '#3a2a1a'] },
  h_headhunter: { name: '巨魔猎头者', faction: 'horde', race: 'troll', role: 'ranged', hp: 20, dmg: 4, weapon: 'bow', outfit: ['#8a3a2a', '#2a3a2a'] },
  h_deathguard: { name: '亡灵卫兵', faction: 'horde', race: 'undead', role: 'guard', hp: 24, dmg: 4, weapon: 'iron_sword', armor: '#6a6a7a', outfit: ['#5a2a3a', '#2a2a2a'] },
  h_shaman: { name: '兽人萨满', faction: 'horde', race: 'orc', role: 'caster', spell: 'lightning_bolt', hp: 18, dmg: 4, outfit: ['#6a4a2a', '#3a3a2a'] },
  h_brave: { name: '牛头人勇士', faction: 'horde', race: 'tauren', role: 'elite', hp: 80, dmg: 6, weapon: 'iron_hammer', armor: '#8a5a3a', outfit: ['#a82a20', '#5a3a1a'] },
};
export const CAMP_ROSTER = {
  alliance: ['a_herald', 'a_quartermaster', 'a_footman', 'a_footman', 'a_sentinel', 'a_rifleman', 'a_mage', 'a_captain'],
  horde: ['h_emissary', 'h_merchant', 'h_grunt', 'h_deathguard', 'h_headhunter', 'h_headhunter', 'h_shaman', 'h_brave'],
};
export const OUTPOST_ROSTER = { alliance: ['a_footman', 'a_quartermaster', 'a_herald'], horde: ['h_grunt', 'h_merchant', 'h_emissary'] };
export const PATROL = { alliance: ['a_footman', 'a_sentinel', 'a_footman'], horde: ['h_grunt', 'h_headhunter', 'h_deathguard'] };
// 敌对阵营成员的掉落:[物品, 最少, 最多, 概率]
export const FACTION_DROPS = {
  alliance: [['alliance_insignia', 1, 2, 0.8], ['linen_cloth', 1, 3, 0.6], ['coin_silver', 1, 3, 0.7], ['bread', 1, 2, 0.25], ['stormwind_sword', 1, 1, 0.04], ['darnassus_bow', 1, 1, 0.03], ['alliance_tabard', 1, 1, 0.03]],
  horde: [['horde_insignia', 1, 2, 0.8], ['wool_cloth', 1, 3, 0.6], ['coin_silver', 1, 3, 0.7], ['cooked_pork', 1, 2, 0.25], ['orgrimmar_axe', 1, 1, 0.04], ['darkspear_spear', 1, 1, 0.03], ['horde_tabard', 1, 1, 0.03]],
};

// 对白
export const GREETINGS = {
  alliance: ['愿圣光指引你,{name}。', '新大陆无边无际,联盟需要你这样的拓荒者。', '小心部落的斥候,他们最近越来越活跃了。', '暴风城的旗帜终将插遍这片土地!'],
  horde: ['洛克塔尔,{name}!', '力量与荣耀,这片新土地属于部落。', '联盟的狗在东边扎了营,别让他们好过。', '为了部落!大地母亲看着我们。'],
};

// —— 任务线
// obj: { type: kill|killFaction|collect|craft|place|reach|level|banner|outpost, ... , n }
export const QUESTS = {
  alliance: [
    { id: 'a1', name: '新兵报到', text: '欢迎来到新大陆,{name}。前哨的栅栏还缺木料——去砍些原木回来。', obj: { type: 'collect', item: 'log', n: 12 }, reward: { xp: 120, money: 60, items: [['torch', 8]] } },
    { id: 'a2', name: '前哨的围墙', text: '光有木料还不够。动手建造吧,放置 30 个方块,让营地更像个家。', obj: { type: 'place', n: 30 }, reward: { xp: 160, money: 80, items: [['copper_pickaxe', 1]] } },
    { id: 'a3', name: '黑夜里的亡灵', text: '入夜后,天灾的爪牙在林间游荡。消灭 4 只僵尸,保卫拓荒者。', obj: { type: 'kill', mob: 'zombie', n: 4 }, reward: { xp: 260, money: 120, items: [['stormwind_sword', 1]] } },
    { id: 'a4', name: '矿脉勘探', text: '工程师需要铜来修理器械。熔炼 6 块铜锭交给我。', obj: { type: 'collect', item: 'copper_ingot', n: 6 }, reward: { xp: 320, money: 150, items: [['leather_chestplate', 1]] } },
    { id: 'a5', name: '部落的斥候', text: '部落在附近扎营了。击败 3 名部落成员,让他们知道这里是谁的地盘。', obj: { type: 'killFaction', faction: 'horde', n: 3 }, reward: { xp: 420, money: 200, items: [['copper_watch', 1]] } },
    { id: 'a6', name: '深入地底', text: '据说地下深处藏着古老的遗迹。下潜到深度 120 以下,回来报告见闻。', obj: { type: 'reach', depth: 120 }, reward: { xp: 450, money: 220, items: [['lantern', 2], ['bread', 4]] } },
    { id: 'a7', name: '折断战旗', text: '找到一座部落营地,砍倒他们的战旗。没有了战旗,他们的援军就不会再来。', obj: { type: 'banner', faction: 'horde', n: 1 }, reward: { xp: 650, money: 400, items: [['alliance_banner', 1]] } },
    { id: 'a8', name: '建立前哨', text: '用这面联盟旗帜建立你自己的前哨:建一间有墙壁、门和光源的房子,把旗帜插在屋里。', obj: { type: 'outpost', n: 1 }, reward: { xp: 650, money: 300, items: [['almanac', 1]] } },
    { id: 'a9', name: '风之传说', text: '高阶会的天裔说,云端漂浮着古老的岛屿。登上高度 120 以上的天空看看。', obj: { type: 'reach', height: 120 }, reward: { xp: 800, money: 450, items: [['barometer', 1]] } },
    { id: 'a10', name: '融合之道', text: '真正的英雄不拘泥于一种技艺。达到 20 级,我会教你融合第二种职业的力量。', obj: { type: 'level', n: 20 }, reward: { xp: 1000, money: 800, unlock: 'fusion' } },
  ],
  horde: [
    { id: 'h1', name: '为了部落', text: '欢迎,{name}。营地要扩建,需要大量木头。砍 12 根原木来。', obj: { type: 'collect', item: 'log', n: 12 }, reward: { xp: 120, money: 60, items: [['torch', 8]] } },
    { id: 'h2', name: '狩猎的试炼', text: '部落的勇士要会狩猎。猎杀 4 头野兽(猪、牛、羊或鸡),证明你的本领。', obj: { type: 'kill', mob: 'beast', n: 4 }, reward: { xp: 160, money: 80, items: [['copper_axe', 1]] } },
    { id: 'h3', name: '骨头里的诅咒', text: '夜里的骷髅射手骚扰我们的狼骑兵。打碎 3 只骷髅。', obj: { type: 'kill', mob: 'skeleton', n: 3 }, reward: { xp: 260, money: 120, items: [['orgrimmar_axe', 1]] } },
    { id: 'h4', name: '铁与火', text: '铁匠的炉子饿了。带 6 块粗铁回来,别磨蹭。', obj: { type: 'collect', item: 'raw_iron', n: 6 }, reward: { xp: 320, money: 150, items: [['leather_leggings', 1]] } },
    { id: 'h5', name: '联盟的入侵者', text: '联盟的士兵越界了。击败 3 名联盟成员,把他们赶回海那边去。', obj: { type: 'killFaction', faction: 'alliance', n: 3 }, reward: { xp: 420, money: 200, items: [['copper_watch', 1]] } },
    { id: 'h6', name: '大地的心脏', text: '萨满们感应到深处的元素在躁动。下潜到深度 150 以下。', obj: { type: 'reach', depth: 150 }, reward: { xp: 480, money: 230, items: [['lantern', 2], ['cooked_pork', 4]] } },
    { id: 'h7', name: '焚烧旗帜', text: '去找联盟的营地,砍倒他们的旗帜,让他们的士气崩溃!', obj: { type: 'banner', faction: 'alliance', n: 1 }, reward: { xp: 650, money: 400, items: [['horde_banner', 1]] } },
    { id: 'h8', name: '部落的前哨', text: '用这面部落旗帜建立你的据点:造一间有墙壁、门和光源的屋子,把旗帜插进去。', obj: { type: 'outpost', n: 1 }, reward: { xp: 650, money: 300, items: [['almanac', 1]] } },
    { id: 'h9', name: '黑曜之石', text: '岩浆与流水交汇之处会凝出黑曜石。带 4 块黑曜石给我,先知要用它们刻下图腾。', obj: { type: 'collect', item: 'obsidian', n: 4 }, reward: { xp: 850, money: 480, items: [['barometer', 1]] } },
    { id: 'h10', name: '先祖的双重之魂', text: '达到 20 级,先祖之灵会允许你同时掌握两种职业之道。', obj: { type: 'level', n: 20 }, reward: { xp: 1000, money: 800, unlock: 'fusion' } },
  ],
};
export const REPEAT_QUEST = {
  alliance: { id: 'ar', name: '无尽的战争', text: '战线延伸到了无尽的远方。再击败 6 名部落成员。', obj: { type: 'killFaction', faction: 'horde', n: 6 }, reward: { xp: 0, money: 300, items: [['alliance_insignia', 3]] }, repeat: true },
  horde: { id: 'hr', name: '鲜血与荣耀', text: '联盟永远不会停手,我们也不会。再击败 6 名联盟成员。', obj: { type: 'killFaction', faction: 'alliance', n: 6 }, reward: { xp: 0, money: 300, items: [['horde_insignia', 3]] }, repeat: true },
};

// —— 商人货单:[物品, 数量, 价格(铜), 徽记花费]
export const VENDOR = {
  alliance: [['bread', 4, 40], ['torch', 16, 30], ['arrow', 20, 40], ['seeds', 8, 25], ['bed', 1, 150], ['apprentice_staff', 1, 400], ['alliance_banner', 1, 500], ['copper_watch', 1, 600], ['almanac', 1, 900], ['barometer', 1, 900], ['stormwind_sword', 1, 800, 6], ['darnassus_bow', 1, 800, 6], ['arcane_staff', 1, 1200, 10], ['alliance_tabard', 1, 300, 4], ['iron_chestplate', 1, 1500, 8]],
  horde: [['cooked_pork', 4, 40], ['torch', 16, 30], ['arrow', 20, 40], ['seeds', 8, 25], ['bed', 1, 150], ['apprentice_staff', 1, 400], ['horde_banner', 1, 500], ['copper_watch', 1, 600], ['almanac', 1, 900], ['barometer', 1, 900], ['orgrimmar_axe', 1, 800, 6], ['darkspear_spear', 1, 800, 6], ['totem_staff', 1, 1200, 10], ['horde_tabard', 1, 300, 4], ['iron_chestplate', 1, 1500, 8]],
};

// —— 区域命名与等级
const ZONE_WORDS = {
  [BIOME.FOREST]: [['低语', '晨曦', '灰谷', '暮色', '银松', '月光'], ['森林', '林地']],
  [BIOME.PLAINS]: [['金色', '风暴', '西部', '贫瘠', '红岭'], ['平原', '荒野', '草原']],
  [BIOME.DESERT]: [['灼热', '千针', '塔纳利', '赤沙', '荒芜'], ['沙漠', '荒原']],
  [BIOME.TAIGA]: [['冬泉', '寒霜', '霜鬃', '冰封'], ['谷地', '雪原']],
  [BIOME.JUNGLE]: [['荆棘', '蛮荒', '翡翠', '蛇纹'], ['丛林', '谷']],
  [BIOME.MOUNTAINS]: [['石爪', '赤脊', '奥特兰克', '雷霆'], ['山脉', '高地']],
  [BIOME.BEACH]: [['碎浪', '海风', '珊瑚'], ['海岸', '滩涂']],
  [BIOME.OCEAN]: [['无尽', '迷雾', '风暴'], ['之海', '海湾']],
};
export function zoneName(biome, region, seed) {
  const w = ZONE_WORDS[biome] || ZONE_WORDS[BIOME.PLAINS];
  const h = Math.abs((region * 2654435761 + seed * 40503) | 0);
  return w[0][h % w[0].length] + w[1][(h >> 8) % w[1].length];
}

export const xpForLevel = L => Math.round(60 * Math.pow(L, 1.65));
export function mobXp(mobLvl, playerLvl, base = 1) {
  const diff = mobLvl - playerLvl;
  const k = diff <= -8 ? 0 : diff < 0 ? 1 + diff * 0.1 : 1 + Math.min(diff, 5) * 0.08;
  return Math.max(0, Math.round((12 + mobLvl * 4.5) * base * k));
}
export function fmtMoney(c) {
  const g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), cp = c % 100;
  const parts = [];
  if (g) parts.push(`<span style="color:#ffd040">${g}金</span>`);
  if (s || g) parts.push(`<span style="color:#d8d8e0">${s}银</span>`);
  parts.push(`<span style="color:#d88a4a">${cp}铜</span>`);
  return parts.join(' ');
}

// 名字生成器(按种族)
const NAME_PARTS = {
  human: [['艾', '罗', '安', '布', '凯', '莉', '维', '哈', '马', '塞'], ['德', '娜', '恩', '特', '伦', '丝', '克', '尔', '琳', '文']],
  dwarf: [['布', '格', '索', '穆', '杜', '玛', '芙'], ['兰', '林', '达', '加', '恩', '林', '德'], ['铁锤', '铜须', '石盾', '火胡', '深岩']],
  nightelf: [['伊', '泰', '玛', '希', '珊', '法', '瑟'], ['兰', '德', '瑞', '莉', '雅', '林'], ['月影', '星歌', '风语', '夜刃', '银叶']],
  gnome: [['吉', '梅', '弗', '提', '比', '诺'], ['可', '克', '布', '尔', '丁', '妮'], ['齿轮', '扳手', '火花', '螺丝', '发条']],
  orc: [['格', '萨', '杜', '加', '纳', '卓', '戈'], ['罗', '鲁', '尔', '克', '格', '什'], ['碎颅', '战歌', '雷击', '血牙', '黑石']],
  undead: [['瑟', '莫', '凡', '希', '德', '奥'], ['尔', '斯', '恩', '娜', '洛', '维'], ['寂语', '霜骨', '灰烬', '幽魂', '冷墓']],
  tauren: [['凯', '哈', '塔', '巴', '穆', '娜'], ['恩', '卡', '尔', '霍', '拉', '奥'], ['血蹄', '雷角', '风行', '大地', '高岭']],
  troll: [['沃', '赞', '金', '扎', '罗', '森'], ['金', '加', '杰', '拉', '卡', '格'], ['暗矛', '蛇语', '血须', '巫毒', '浪刃']],
  skyborn_a: [['艾', '泽', '希', '瑟', '琳'], ['菲', '莉', '雅', '尔', '岚'], ['云歌', '风翼', '天穹', '岚语', '星帆']],
  skyborn_h: [['卡', '索', '泽', '萨', '珂'], ['尔', '岚', '雷', '雅', '恩'], ['塑风', '暴翼', '雷穹', '岚刃', '旋云']],
};
const HUMAN_SURNAMES = ['温德索尔', '卡尔斯', '布莱克伍德', '沃特', '洛萨', '马林', '格雷', '斯通'];
export function randomName(race, rnd = Math.random) {
  const p = NAME_PARTS[race] || NAME_PARTS.human;
  const pick = a => a[(rnd() * a.length) | 0];
  const first = pick(p[0]) + pick(p[1]) + (rnd() < 0.4 ? pick(p[1]) : '');
  const last = p[2] ? pick(p[2]) : pick(HUMAN_SURNAMES);
  return [first, last];
}
