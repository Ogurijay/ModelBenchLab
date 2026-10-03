// 车库：8 辆车。星级为本作平衡设定（直线 / 弯道 / 漂移，每列 1–5 星），不代表真实汽车性能。
// 原文星级为连排 ★，列界限不明确；本作按总星数拆分并在 HANDOVER 公开（见 BALANCE_NOTE）。
// 五菱宏光"前置后驱、约 100 匹"为题面给出的真实资料口径（待核），其余数值全部为游戏平衡值。

export const BALANCE_NOTE = '星级为本作平衡设定：原文每车总星数保留，按直线/弯道/漂移拆分。';

export const CARS = {
  ae86: {
    id: 'ae86', name: 'AE86 Trueno', short: '86', owner: '周董', drive: 'FR',
    stars: { straight: 2, corner: 5, drift: 5 }, unlock: { type: 'initial' },
    trait: '轻，下坡之王', traitKey: 'downhill',
    body: 'trueno', color: 0xf4f4f0, color2: 0x15161a, trail: 0xffffff, tier: 2, hp: 130,
    desc: '黑白熊猫色，车门印着"藤原豆腐店（自家用）"。'
  },
  ae85: {
    id: 'ae85', name: '阿木的 AE85', short: '85', owner: '阿木', drive: 'FR',
    stars: { straight: 2, corner: 2, drift: 3 }, unlock: { type: 'initial' },
    trait: '"是85不是86"', traitKey: 'ae85',
    body: 'levin', color: 0xd8c25a, color2: 0x2a2a2a, trail: 0xffe08a, tier: 1, hp: 83,
    desc: '加油站太子爷的车。外观像 86，但它是 85。'
  },
  wuling: {
    id: 'wuling', name: '五菱宏光', short: '宏光', owner: '人民', drive: 'FR',
    stars: { straight: 2, corner: 3, drift: 3 }, unlock: { type: 'initial' },
    trait: '遇强则强', traitKey: 'wuling',
    body: 'van', color: 0xf7f7f2, color2: 0x2d6cdf, trail: 0x9fd0ff, tier: 1, hp: 100,
    desc: '几万块的七座面包车，和一排日系名车站在同一条起跑线上。'
  },
  r32: {
    id: 'r32', name: 'R32 GT-R', short: 'GT-R', owner: '六叔', drive: 'AWD',
    stars: { straight: 4, corner: 2, drift: 2 }, unlock: { type: 'win', chapter: 6 },
    trait: '入急弯推头', traitKey: 'push',
    body: 'r32', color: 0x17181c, color2: 0x3a3c44, trail: 0xff2a2a, tier: 4, hp: 280,
    desc: '四驱信仰。直线很猛，急弯会推头。'
  },
  evo: {
    id: 'evo', name: 'EVO（刘教练）', short: 'EVO', owner: '刘教练', drive: 'AWD',
    stars: { straight: 4, corner: 3, drift: 2 }, unlock: { type: 'win', chapter: 8 },
    trait: '冲动加速，爱撞墙', traitKey: 'impulsive',
    body: 'evo', color: 0xc9ccd2, color2: 0x7b2cbf, trail: 0xb04dff, tier: 4, hp: 280,
    desc: '三菱 EVO（代次本作不指定）。油门永远踩到底。'
  },
  evo3: {
    id: 'evo3', name: 'EVO III（山鸡哥）', short: 'EVO III', owner: '山鸡哥', drive: 'AWD',
    stars: { straight: 4, corner: 4, drift: 3 }, unlock: { type: 'complete', chapter: 9 },
    trait: '全能型', traitKey: 'allround',
    body: 'evo', color: 0x111214, color2: 0xd0d0d0, trail: 0xc05cff, tier: 5, hp: 270,
    desc: '黑色 EVO III。黑皮衣，白头巾。'
  },
  fc: {
    id: 'fc', name: 'RX-7 FC', short: 'FC', owner: '陈老师', drive: 'FR',
    stars: { straight: 3, corner: 4, drift: 4 }, unlock: { type: 'win', chapter: 11 },
    trait: '最均衡', traitKey: 'balanced',
    body: 'fc', color: 0xf6f7fa, color2: 0x1a1a1a, trail: 0x8fe9ff, tier: 5, hp: 215,
    desc: '白色 RX-7 FC。理论派的车，每一个弯都算过。'
  },
  benz: {
    id: 'benz', name: '奔驰', short: '奔驰', owner: '钞能力大叔', drive: 'LUX',
    stars: { straight: 5, corner: 1, drift: 1 }, unlock: { type: 'complete', chapter: 12 },
    trait: '钞能力：撞墙不减速', traitKey: 'money',
    body: 'benz', color: 0x0c0d10, color2: 0xc8a24a, trail: 0xffc94a, tier: 8, hp: 450,
    desc: '奔驰豪华轿车（型号不指定）。车主根本不知道自己在比赛。'
  }
};

export const CAR_ORDER = ['ae86', 'ae85', 'wuling', 'r32', 'evo', 'evo3', 'fc', 'benz'];

const STRAIGHT_VMAX = [0, 46, 51, 56, 61, 70]; // m/s
const STRAIGHT_ACC = [0, 3.0, 3.7, 4.4, 5.4, 6.0]; // m/s² @0
const CORNER_MU = [0, 0.86, 0.95, 1.03, 1.1, 1.17];
const DRIFT_K = [0, 1.7, 2.3, 2.9, 3.5, 4.2];
const DRIFT_SCRUB = [0, 1.35, 1.15, 1.0, 0.88, 0.76];
const DRIFT_SLIDE = [0, 0.84, 0.88, 0.92, 0.96, 1.0];

/** 星级 → 物理参数 */
export function deriveParams(spec) {
  const st = spec.stars;
  const p = {
    vmax: STRAIGHT_VMAX[st.straight],
    accel0: STRAIGHT_ACC[st.straight],
    mu: CORNER_MU[st.corner],
    kBeta: DRIFT_K[st.drift],
    scrub: DRIFT_SCRUB[st.drift],
    slideMu: DRIFT_SLIDE[st.drift],
    betaHold: (24 + st.drift * 1.6) * Math.PI / 180,
    betaMax: (44 + st.drift * 3) * Math.PI / 180,
    brake: 9.0,
    wheelbase: 2.4,
    drive: spec.drive,
    push: 1.0, // 前轮抓地系数（推头）
    downhill: 1.0,
    gripRecover: 0.9 + st.drift * 0.08,
    wallLoss: 1,
    halfWidth: 0.84,
    length: 4.2
  };
  if (spec.drive === 'AWD') p.push = 0.88;
  if (spec.traitKey === 'push') p.push = 0.8;
  if (spec.traitKey === 'downhill') { p.downhill = 1.18; p.brake = 10.2; }
  if (spec.drive === 'LUX') { p.push = 0.85; p.brake = 8; p.length = 5.1; p.halfWidth = 0.93; }
  if (spec.traitKey === 'money') p.wallLoss = 0;
  if (spec.body === 'van') { p.length = 4.4; p.halfWidth = 0.86; }
  p.drag = p.accel0 * 0.35 / (p.vmax * p.vmax); // 极速处由引擎曲线和阻力共同收敛
  return p;
}

/** 五菱宏光"遇强则强"：对手强度表（tier）→ 隐藏加成，上限 30%，奔驰额外拉满 */
export function wulingBonus(opponents) {
  if (!opponents.length) return 0;
  const top = Math.max(...opponents.map((o) => o.tier));
  let b = Math.max(0, top - 1) * 0.045;
  if (opponents.some((o) => o.id === 'benz')) b = 0.3;
  return Math.min(0.3, b);
}

export const TRACK_ORDER = ['akina_down', 'akina_up', 'akina_rain', 'route_out'];
export const MODES = {
  duel: { name: '单挑', desc: '一对一，先到终点者胜' },
  chase: { name: '追逐赛', desc: '一前一后：后车超车或前车拉开 150 米即胜' },
  time: { name: '计时赛', desc: '单人跑最快成绩' },
  tofu: { name: '豆腐挑战', desc: '带水杯跑下坡，比谁洒得少、跑得快' },
  melee: { name: '神车混战', desc: '全车库同场，最多八辆' }
};
