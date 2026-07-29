export const CHARACTERS = [
  {
    id: 'agumon', name: '亚古兽', en: 'AGUMON', crest: '勇气', role: '全能型',
    color: '#ff8b21', accent: '#ffe04a', stats: { speed: 4, power: 3, range: 3, guard: 3 },
    forms: [
      { name: '亚古兽', en: 'AGUMON', model: './models/agumon.glb', height: 2.45, skill: '小型火焰' },
      { name: '暴龙兽', en: 'GREYMON', model: './models/greymon.glb', height: 3.45, skill: '超级火焰' },
      { name: '战斗暴龙兽', en: 'WARGREYMON', model: './models/wargreymon.glb', height: 3.25, skill: '盖亚能量炮' },
    ],
  },
  {
    id: 'gabumon', name: '加布兽', en: 'GABUMON', crest: '友情', role: '远程型',
    color: '#4d8cff', accent: '#7af2ff', stats: { speed: 3, power: 3, range: 5, guard: 3 },
    forms: [
      { name: '加布兽', en: 'GABUMON', model: './models/gabumon.glb', height: 3.8, skill: '爆炎火焰弹' },
      { name: '加鲁鲁兽', en: 'GARURUMON', model: './models/garurumon.glb', height: 2.8, skill: '妖狐火焰' },
      { name: '钢铁加鲁鲁兽', en: 'METALGARURUMON', model: './models/metalgarurumon.glb', height: 3.0, skill: '绝对冷冻气' },
    ],
  },
  {
    id: 'guilmon', name: '基尔兽', en: 'GUILMON', crest: '危险', role: '强攻型',
    color: '#ed344d', accent: '#ffb22e', stats: { speed: 3, power: 5, range: 3, guard: 2 },
    forms: [
      { name: '基尔兽', en: 'GUILMON', model: './models/guilmon.glb', height: 2.5, skill: '基尔火炮' },
      { name: '古拉兽', en: 'GROWLMON', model: './models/growlmon.glb', height: 3.5, skill: '魔龙火焰' },
      { name: '红莲骑士兽', en: 'GALLANTMON', model: './models/gallantmon.glb', height: 3.35, skill: '极乐净土' },
    ],
  },
  {
    id: 'patamon', name: '巴达兽', en: 'PATAMON', crest: '希望', role: '空战型',
    color: '#f5bb67', accent: '#fff3a1', stats: { speed: 5, power: 2, range: 4, guard: 2 },
    forms: [
      { name: '巴达兽', en: 'PATAMON', model: './models/patamon.glb', height: 2.15, skill: '空气炮' },
      { name: '天使兽', en: 'ANGEMON', model: './models/angemon.glb', height: 3.45, skill: '天堂之拳' },
      { name: '究极天使兽', en: 'SERAPHIMON', model: './models/seraphimon.glb', height: 3.55, skill: '七重天堂' },
    ],
  },
  {
    id: 'gatomon', name: '迪路兽', en: 'GATOMON', crest: '光明', role: '技巧型',
    color: '#f7f1e7', accent: '#ec65e6', stats: { speed: 5, power: 3, range: 2, guard: 3 },
    forms: [
      { name: '迪路兽', en: 'GATOMON', model: './models/gatomon.glb', height: 2.15, skill: '猫猫拳' },
      { name: '天女兽', en: 'ANGEWOMON', model: './models/angewomon.glb', height: 3.45, skill: '神圣弓箭' },
      { name: '神圣天女兽', en: 'OPHANIMON', model: './models/ophanimon.glb', height: 3.5, skill: '伊甸园标枪' },
    ],
  },
  {
    id: 'veemon', name: 'V仔兽', en: 'VEEMON', crest: '奇迹', role: '突进型',
    color: '#2f6ee9', accent: '#f4e84b', stats: { speed: 4, power: 4, range: 2, guard: 4 },
    forms: [
      { name: 'V仔兽', en: 'VEEMON', model: './models/veemon.glb', height: 2.35, skill: 'V仔头槌' },
      { name: 'V仔兽EX', en: 'EXVEEMON', model: './models/exveemon.glb', height: 3.3, skill: 'X光线' },
      { name: '帝皇龙甲兽FM', en: 'IMPERIALDRAMON FM', model: './models/imperialdramon.glb', height: 3.65, skill: '超级死亡' },
    ],
  },
  {
    id: 'renamon', name: '妖狐兽', en: 'RENAMON', crest: '灵巧', role: '术式型',
    color: '#e8bc3f', accent: '#a46cff', stats: { speed: 5, power: 3, range: 5, guard: 2 },
    forms: [
      { name: '妖狐兽', en: 'RENAMON', model: './models/renamon.glb', height: 2.6, skill: '狐叶楔' },
      { name: '九尾狐兽', en: 'KYUBIMON', model: './models/kyubimon.glb', height: 3.2, skill: '鬼火玉' },
      { name: '沙古牙兽', en: 'SAKUYAMON', model: './models/sakuyamon.glb', height: 3.55, skill: '金刚界曼荼罗' },
    ],
  },
  {
    id: 'tentomon', name: '甲虫兽', en: 'TENTOMON', crest: '知识', role: '防守型',
    color: '#d54842', accent: '#76f4ff', stats: { speed: 2, power: 4, range: 3, guard: 5 },
    forms: [
      { name: '甲虫兽', en: 'TENTOMON', model: './models/tentomon.glb', height: 2.3, skill: '飞翼闪电' },
      { name: '比多兽', en: 'KABUTERIMON', model: './models/kabuterimon.glb', height: 3.45, skill: '米加巨炮' },
      { name: '力神比多兽', en: 'HERCULESKABUTERIMON', model: './models/herculeskabuterimon.glb', height: 3.75, skill: '千兆冲击波' },
    ],
  },
];

export const BOSSES = [
  {
    id: 'diaboromon', name: '超恶魔兽', en: 'DIABOROMON', crest: '入侵', role: 'Boss', boss: true,
    color: '#6d32a8', accent: '#de66ff', stats: { speed: 4, power: 5, range: 5, guard: 4 },
    forms: [{ name: '超恶魔兽', en: 'DIABOROMON', model: './models/diaboromon.glb', height: 4.1, skill: '灾难炮' }],
  },
  {
    id: 'apocalymon', name: '启示录兽', en: 'APOCALYMON', crest: '终焉', role: 'Final Boss', boss: true,
    color: '#1d1734', accent: '#ff425f', stats: { speed: 2, power: 5, range: 5, guard: 5 },
    forms: [{ name: '启示录兽', en: 'APOCALYMON', model: './models/apocalymon.glb', height: 4.5, skill: '黑暗领域' }],
  },
];

export const ALL_CHARACTERS = [...CHARACTERS, ...BOSSES];
export const getCharacter = (id) => ALL_CHARACTERS.find((character) => character.id === id) || CHARACTERS[0];

export const ARENAS = [
  {
    id: 'terminal', name: '网络终端', en: 'NETWORK TERMINAL', icon: '01', hazard: 'pulse',
    description: '环形数据脉冲周期扫过外圈，中央区域最安全。',
    colors: { sky: 0x030814, fog: 0x04101e, floor: 0x162c45, primary: 0x16d9ff, secondary: 0xff6a20 },
  },
  {
    id: 'volcano', name: '熔岩核心', en: 'LAVA CORE', icon: '02', hazard: 'lava',
    description: '岩浆交替吞没半边平台，观察预警后迅速换边。',
    colors: { sky: 0x130405, fog: 0x2b0804, floor: 0x3a1815, primary: 0xff6428, secondary: 0xffd34b },
  },
  {
    id: 'factory', name: '齿轮工厂', en: 'GEAR FACTORY', icon: '03', hazard: 'laser',
    description: '工业扫描线横穿场地，被命中会损失生命与进化能量。',
    colors: { sky: 0x07100f, fog: 0x0b1717, floor: 0x26312d, primary: 0x7dff9b, secondary: 0xf5cc4e },
  },
  {
    id: 'jungle', name: '遗迹丛林', en: 'JUNGLE RUINS', icon: '04', hazard: 'rocks',
    description: '落石会锁定停留过久的斗士，古代祭坛可作为掩体。',
    colors: { sky: 0x071009, fog: 0x102516, floor: 0x243929, primary: 0x80d66c, secondary: 0xf0b95b },
  },
  {
    id: 'dark-area', name: '黑暗区域', en: 'DARK AREA', icon: 'Ω', hazard: 'void', bossOnly: true,
    description: '终焉裂隙持续侵蚀平台，只在数码杯决赛开放。',
    colors: { sky: 0x020106, fog: 0x10051c, floor: 0x171126, primary: 0xb95cff, secondary: 0xff385c },
  },
];

export const getArena = (id) => ARENAS.find((arena) => arena.id === id) || ARENAS[0];

export const RULES = {
  stock: { id: 'stock', name: '生存战', description: '每名斗士拥有固定生命数，最后存活者获胜。' },
  timed: { id: 'timed', name: '计时击倒', description: '时间结束时，以击倒得分决定胜负。' },
  race: { id: 'race', name: '进化竞速', description: '率先完成三次进化或究极技者获胜。' },
  training: { id: 'training', name: '训练', description: '无限生命和进化能量，不记录胜负。' },
};

export const ITEMS = [
  { id: 'evo-orb', name: '进化数据球', en: 'EVO ORB', effect: 'energy', value: 35, description: '立即补充 35 点进化能量。' },
  { id: 'health', name: '回复数据', en: 'RECOVERY', effect: 'health', value: 30, description: '立即恢复 30 点生命。' },
  { id: 'power', name: '力量芯片', en: 'POWER CHIP', effect: 'power', value: 1.35, duration: 8, description: '8 秒内造成 35% 额外伤害。' },
  { id: 'life', name: '生命备份', en: 'LIFE BACKUP', effect: 'life', amount: 1, description: '立即增加一条生命。' },
];

export const DIFFICULTIES = [
  { id: 'rookie', name: '成长期', en: 'ROOKIE', reaction: 0.48, aggression: 0.42, dodgeChance: 0.18, damageScale: 0.85 },
  { id: 'normal', name: '成熟期', en: 'CHAMPION', reaction: 0.32, aggression: 0.62, dodgeChance: 0.34, damageScale: 1 },
  { id: 'veteran', name: '究极体', en: 'MEGA', reaction: 0.2, aggression: 0.82, dodgeChance: 0.52, damageScale: 1.15 },
];

export const CUP_ROUTE = [
  { id: 'qualifier', tier: '01', name: '网络预选', arena: 'terminal', rule: 'stock', opponents: ['gabumon'], stocks: 2, reward: '开启熔岩核心' },
  { id: 'crossfire', tier: '02', name: '三方混战', arena: 'volcano', rule: 'timed', opponents: ['guilmon', 'patamon'], time: 75, reward: '获得 800 DATA' },
  { id: 'evo-race', tier: '03', name: '进化竞速', arena: 'jungle', rule: 'race', opponents: ['gatomon', 'renamon'], target: 2, reward: '开启齿轮工厂' },
  { id: 'semifinal', tier: '04', name: '最终四强', arena: 'factory', rule: 'stock', opponents: ['veemon', 'gabumon', 'tentomon'], stocks: 2, reward: '获得 1200 DATA' },
  { id: 'intruder', tier: '05', name: '黑客乱入', arena: 'terminal', rule: 'stock', opponents: ['diaboromon'], stocks: 3, reward: '超恶魔兽资料' },
  { id: 'final', tier: 'Ω', name: '终焉决赛', arena: 'dark-area', rule: 'stock', opponents: ['apocalymon'], stocks: 3, reward: '数码世界冠军徽章' },
];

export const GAME_MODES = [
  { id: 'cup', index: '01', name: '数码杯', en: 'DIGITAL CUP', description: '六轮战斗树、特殊规则、乱入挑战与最终 Boss。' },
  { id: 'free', index: '02', name: '自由乱斗', en: 'FREE RUMBLE', description: '选择规则、1–4 名斗士和任意已开放竞技场。' },
  { id: 'training', index: '03', name: '训练模式', en: 'TRAINING', description: '无限生命与进化能量，练习连击和三段进化。' },
  { id: 'lab', index: '04', name: '数码实验室', en: 'DIGI-LAB', description: '查看角色、进化链、招式属性与通关记录。' },
  { id: 'options', index: '05', name: '系统设定', en: 'OPTIONS', description: '调整难度、音量、镜头震动与战斗时间。' },
];
