// 角色阵容与平衡数值 — 对标 PS2《数码宝贝大乱斗2》(Digimon Rumble Arena 2) 主阵容:
// 9 名成长期搭档(战斗中可数码进化到究极体)+ 2 名隐藏究极体(无进化,数值更重)。
// 模型来自 Digimon Story Cyber Sleuth 提取的 GLB(骨骼动画内嵌),动画命名为 DSCS 规范:
//   bn01 待机 / br01 跑动 / ba01,ba02 攻击 / bs01 必杀 / bd01 轻受击 / bd02 重受击(击飞)
//   bd03 倒地 / bg01 防御 / bv01 胜利 / fe01 场景待机

export const MODELS_BASE = './models/';

// projectile 形状: orb=能量球 flame=火焰 beam=光束刃 missile=导弹群 shuriken=手里剑 tornado=旋风
export const ROSTER = [
  {
    id: 'agumon', name: '亚古兽', nameEn: 'AGUMON', model: 'chr050',
    height: 1.35, hp: 340, speed: 5.2, jump: 8.6, attack: 1.0, weight: 1.0,
    special: { name: '小火焰', type: 'flame', color: 0xff7722, size: 0.34, speed: 10, dmg: 30, count: 1 },
    mega: {
      id: 'wargreymon', name: '战斗暴龙兽', nameEn: 'WARGREYMON', model: 'chr027',
      height: 2.5, atkMul: 1.55, spdMul: 1.12,
      special: { name: '盖亚之力', type: 'orb', color: 0xffa030, size: 0.95, speed: 8, dmg: 62, count: 1 },
    },
  },
  {
    id: 'gabumon', name: '加布兽', nameEn: 'GABUMON', model: 'chr151',
    height: 1.3, hp: 360, speed: 4.8, jump: 8.2, attack: 1.05, weight: 1.05,
    special: { name: '小狐火', type: 'flame', color: 0x44a8ff, size: 0.34, speed: 10.5, dmg: 30, count: 1 },
    mega: {
      id: 'metalgarurumon', name: '金属加鲁鲁兽', nameEn: 'METALGARURUMON', model: 'chr135',
      height: 2.2, atkMul: 1.5, spdMul: 1.2,
      special: { name: '绝对冷冻气', type: 'missile', color: 0x9fdcff, size: 0.3, speed: 11, dmg: 24, count: 3 },
    },
  },
  {
    id: 'veemon', name: 'V仔兽', nameEn: 'VEEMON', model: 'chr114',
    height: 1.3, hp: 330, speed: 5.8, jump: 9.0, attack: 0.95, weight: 0.95,
    special: { name: 'V仔头锤', type: 'orb', color: 0x66aaff, size: 0.4, speed: 12, dmg: 28, count: 1 },
    mega: {
      id: 'imperialdramon', name: '帝皇龙甲兽', nameEn: 'IMPERIALDRAMON FM', model: 'chr419',
      height: 2.55, atkMul: 1.55, spdMul: 1.15,
      special: { name: '位面歼灭炮', type: 'beam', color: 0xb070ff, size: 0.8, speed: 13, dmg: 60, count: 1 },
    },
  },
  {
    id: 'guilmon', name: '基尔兽', nameEn: 'GUILMON', model: 'chr090',
    height: 1.4, hp: 350, speed: 5.0, jump: 8.4, attack: 1.12, weight: 1.05,
    special: { name: '火球', type: 'flame', color: 0xff4433, size: 0.4, speed: 10, dmg: 33, count: 1 },
    mega: {
      id: 'gallantmon', name: '红莲骑士兽', nameEn: 'GALLANTMON', model: 'chr126',
      height: 2.5, atkMul: 1.6, spdMul: 1.08,
      special: { name: '皇家军刀', type: 'beam', color: 0xff5566, size: 0.75, speed: 13.5, dmg: 60, count: 1 },
    },
  },
  {
    id: 'patamon', name: '巴达兽', nameEn: 'PATAMON', model: 'chr096',
    height: 1.0, hp: 300, speed: 5.4, jump: 9.6, attack: 0.9, weight: 0.8,
    special: { name: '空气炮', type: 'orb', color: 0xffffff, size: 0.36, speed: 11, dmg: 26, count: 1 },
    mega: {
      id: 'seraphimon', name: '炽天使兽', nameEn: 'SERAPHIMON', model: 'chr315',
      height: 2.45, atkMul: 1.55, spdMul: 1.12,
      special: { name: '七重天堂', type: 'orb', color: 0xffe066, size: 0.7, speed: 10, dmg: 34, count: 2 },
    },
  },
  {
    id: 'gatomon', name: '迪路兽', nameEn: 'GATOMON', model: 'chr092',
    height: 1.05, hp: 300, speed: 6.4, jump: 9.2, attack: 0.85, weight: 0.85,
    special: { name: '猫猫光波', type: 'orb', color: 0xff9ad5, size: 0.32, speed: 12.5, dmg: 25, count: 1 },
    mega: {
      id: 'magnadramon', name: '圣龙兽', nameEn: 'MAGNADRAMON', model: 'chr453',
      height: 2.35, atkMul: 1.5, spdMul: 1.18,
      special: { name: '圣之火', type: 'flame', color: 0xffb0e8, size: 0.55, speed: 11, dmg: 30, count: 2 },
    },
  },
  {
    id: 'biyomon', name: '比丘兽', nameEn: 'BIYOMON', model: 'chr307',
    height: 1.15, hp: 310, speed: 5.5, jump: 9.4, attack: 0.92, weight: 0.85,
    special: { name: '魔法火焰', type: 'flame', color: 0x66e07a, size: 0.36, speed: 10.5, dmg: 28, count: 1 },
    mega: {
      id: 'garudamon', name: '伽楼达兽', nameEn: 'GARUDAMON', model: 'chr309',
      height: 2.5, atkMul: 1.5, spdMul: 1.1,
      special: { name: '暗影之翼', type: 'flame', color: 0xffcc44, size: 0.9, speed: 11.5, dmg: 58, count: 1 },
    },
  },
  {
    id: 'terriermon', name: '大耳兽', nameEn: 'TERRIERMON', model: 'chr701',
    height: 1.05, hp: 305, speed: 5.6, jump: 9.0, attack: 0.9, weight: 0.8,
    special: { name: '小型龙卷', type: 'tornado', color: 0x9fe8b8, size: 0.5, speed: 9, dmg: 30, count: 1 },
    mega: {
      id: 'megagargomon', name: '撒多格杜兽', nameEn: 'MEGAGARGOMON', model: 'chr741',
      height: 2.6, atkMul: 1.6, spdMul: 1.0,
      special: { name: '猛烈加农炮', type: 'missile', color: 0xb8e890, size: 0.32, speed: 10.5, dmg: 22, count: 4 },
    },
  },
  {
    id: 'renamon', name: '妖狐兽', nameEn: 'RENAMON', model: 'chr391',
    height: 1.55, hp: 315, speed: 6.2, jump: 9.2, attack: 0.95, weight: 0.9,
    special: { name: '结晶狂澜', type: 'shuriken', color: 0xe8f4ff, size: 0.26, speed: 13, dmg: 14, count: 3 },
    mega: {
      id: 'sakuyamon', name: '沙古牙兽', nameEn: 'SAKUYAMON', model: 'chr425',
      height: 2.35, atkMul: 1.5, spdMul: 1.15,
      special: { name: '金刚界曼荼罗', type: 'shuriken', color: 0xd9b0ff, size: 0.4, speed: 12, dmg: 22, count: 3 },
    },
  },
  // ---- 隐藏角色(直接以究极体参战,无进化) ----
  {
    id: 'omnimon', name: '奥米加兽', nameEn: 'OMNIMON', model: 'chr088',
    height: 2.55, hp: 420, speed: 4.6, jump: 8.0, attack: 1.35, weight: 1.3,
    boss: true,
    special: { name: '至高圣剑', type: 'beam', color: 0xcfe8ff, size: 0.8, speed: 13, dmg: 55, count: 1 },
  },
  {
    id: 'diaboromon', name: '超恶魔兽', nameEn: 'DIABOROMON', model: 'chr632',
    height: 2.5, hp: 400, speed: 5.0, jump: 8.6, attack: 1.3, weight: 1.2,
    boss: true,
    special: { name: '毁灭加农炮', type: 'orb', color: 0xff3355, size: 0.9, speed: 10, dmg: 55, count: 1 },
  },
];

// 战斗全局参数
export const RULES = {
  roundsToWin: 2,          // 三局两胜
  roundTime: 99,           // 秒
  gravity: -26,
  floorY: 0,
  stageHalfWidth: 10.5,    // 主台半宽(米)
  blastX: 15.5,            // 出界即扣血弹回
  comboWindow: 0.42,       // 连段输入缓冲窗口(秒)
  specialCost: 1,          // 必杀消耗能量格
  energyMax: 3,            // 能量格数
  energyPerHit: 0.34,      // 命中回能(格)
  energyRegen: 0.06,       // 每秒自然回能
  evoMax: 100,
  evoPerHitGiven: 7,       // 命中对手 +进化值
  evoPerHitTaken: 5.5,     // 受击 +进化值
  evoDuration: 26,         // 究极体持续秒数
  evoLockTime: 2.3,        // 进化演出时长(双方定身)
  guardDamageMul: 0.16,    // 防御减伤后比例
  guardChipKnock: 0.25,    // 防御时击退比例
  hitInvulnAfterDown: 1.1, // 倒地起身无敌
  koSlowmo: 0.22,          // KO 慢镜头 timeScale
  koSlowmoTime: 1.6,       // 慢镜头持续(真实秒)
};

// 攻击段配置(全部角色共用骨架,伤害乘各自 attack 系数):
// win = [命中窗开始, 结束](动画归一化进度), range 前方判定距离, dur 秒(按动画实长缩放上限)
export const COMBO = [
  { anim: 'ba01', dmg: 16, win: [0.25, 0.55], range: 1.45, knock: 2.2, launch: 0, hitstun: 0.32 },
  { anim: 'ba02', dmg: 20, win: [0.25, 0.6], range: 1.55, knock: 3.0, launch: 0, hitstun: 0.36 },
  { anim: 'ba01', dmg: 26, win: [0.2, 0.55], range: 1.65, knock: 7.5, launch: 6.5, hitstun: 0.6 }, // 终结段击飞
];

export const AIR_ATTACK = { anim: 'ba02', dmg: 18, win: [0.2, 0.65], range: 1.5, knock: 3.5, launch: -2, hitstun: 0.38 };

// 键位
export const KEYMAP_P1 = {
  left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
  attack: 'KeyJ', special: 'KeyK', guard: 'KeyL', evolve: 'KeyI',
};
