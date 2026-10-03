// 改装零件目录与性能换算。纯数据 + 纯函数，可在 Node 中测试。
// 单位：长度 m、质量 kg、速度 m/s；马达参数为 3.0 V 标称值（负载估算，非实测曲线）。

export const SLOTS = ['motor', 'gear', 'tire', 'roller', 'battery', 'brake', 'damper'];

export const PARTS = {
  motor: {
    label: '马达', en: 'MOTOR',
    hint: '马达决定空载转速与扭矩。转速越高极速越高，但耗电更快、起步扭矩可能不足。',
    options: [
      { id: 'normal', name: '原厂马达', jp: 'ノーマルモーター', rpm: 12500, torque: 1.20, current: 0.9, label: 0xbfc4ca, end: 0x23252a },
      { id: 'torque2', name: '扭矩调校 2', jp: 'トルクチューン2', rpm: 14500, torque: 1.55, current: 1.15, label: 0x2c8a4b, end: 0x1d1f23 },
      { id: 'atomic2', name: '原子调校 2', jp: 'アトミックチューン2', rpm: 15500, torque: 1.35, current: 1.05, label: 0xd8b73a, end: 0x1d1f23 },
      { id: 'hyperdash3', name: '超级冲刺 3', jp: 'ハイパーダッシュ3', rpm: 19500, torque: 1.45, current: 1.65, label: 0xd23b3b, end: 0x1d1f23 },
      { id: 'machdash', name: '马赫冲刺 PRO', jp: 'マッハダッシュPRO', rpm: 23000, torque: 1.35, current: 2.1, label: 0x2a63d6, end: 0x1d1f23 },
    ],
  },
  gear: {
    label: '齿轮比', en: 'GEAR',
    hint: '齿比越小越偏极速，越大越偏扭矩。车型原厂齿比见车辆资料。',
    options: [
      { id: 'stock', name: '原厂齿比', ratio: null },
      { id: 'g35', name: '超速齿轮 3.5:1', ratio: 3.5 },
      { id: 'g37', name: '超速齿轮 3.7:1', ratio: 3.7 },
      { id: 'g40', name: '高速齿轮 4:1', ratio: 4.0 },
      { id: 'g42', name: '扭矩齿轮 4.2:1', ratio: 4.2 },
      { id: 'g50', name: '扭矩齿轮 5:1', ratio: 5.0 },
    ],
  },
  tire: {
    label: '轮胎', en: 'TIRES',
    hint: '大径胎极速高、重心高；小径胎加速好、重心低；硬质胎减少过弯损耗。',
    options: [
      { id: 'stock', name: '原厂轮胎', tire: null, grip: 1.0, rolling: 0.032, bounce: 0.35 },
      { id: 'low26', name: '26 mm 低扁平胎', tire: 'low26', grip: 0.98, rolling: 0.030, bounce: 0.30 },
      { id: 'low24', name: '24 mm 小径低扁平胎', tire: 'low24', grip: 0.95, rolling: 0.027, bounce: 0.26 },
      { id: 'hard26', name: '26 mm 超硬胎', tire: 'slick26', grip: 0.86, rolling: 0.022, bounce: 0.40 },
      { id: 'large31', name: '31 mm 大径胎', tire: 'large31', grip: 1.05, rolling: 0.036, bounce: 0.48 },
    ],
  },
  roller: {
    label: '导轮', en: 'ROLLERS',
    hint: '导轮贴着护墙过弯。轴承导轮摩擦小；19 mm 导轮加宽车身，抗翻转更强。',
    options: [
      { id: 'stock', name: '原厂 13 mm 导轮', mu: 0.060, stability: 1.0, width: 0.0 },
      { id: 'bearing13', name: '13 mm 铝合金轴承导轮', mu: 0.024, stability: 1.05, width: 0.0, color: 0xc7ccd3, bearing: true },
      { id: 'alu19', name: '19 mm 铝合金导轮', mu: 0.020, stability: 1.25, width: 6.0, color: 0xd4a843, bearing: true, d: 19 },
      { id: 'double', name: '双层塑料导轮', mu: 0.050, stability: 1.35, width: 0.0, double: true },
    ],
  },
  battery: {
    label: '电池', en: 'BATTERY',
    hint: '两节 AA。碱性电池电压随耗电下降明显；镍氢电池电压平稳。',
    options: [
      { id: 'alkaline', name: '碱性电池 ×2', volts: 3.0, sag: 0.32, capacity: 1800, mass: 0.046, kind: 'alkaline' },
      { id: 'nimh', name: '镍氢 NEO Champ ×2', volts: 2.6, sag: 0.08, capacity: 1900, mass: 0.054, kind: 'nimh' },
      { id: 'light', name: '轻量镍氢 ×2', volts: 2.5, sag: 0.14, capacity: 900, mass: 0.040, kind: 'light' },
    ],
  },
  brake: {
    label: '刹车海绵', en: 'BRAKE',
    hint: '海绵在下坡与落地时接触赛道减速，防止飞台冲出，但会损失平路速度。',
    options: [
      { id: 'none', name: '不装刹车', strength: 0, color: null },
      { id: 'blue', name: '蓝色海绵（弱）', strength: 0.9, color: 0x3b7bd8 },
      { id: 'red', name: '红色海绵（强）', strength: 1.8, color: 0xd8363b },
    ],
  },
  damper: {
    label: '配重阻尼', en: 'MASS DAMPER',
    hint: '黄铜配重在落地时吸收弹跳，提高稳定，但增加重量。',
    options: [
      { id: 'none', name: '不装配重', mass: 0, damping: 0 },
      { id: 'side2', name: '侧置配重 ×2', mass: 0.010, damping: 0.45 },
      { id: 'full4', name: '前后配重 ×4', mass: 0.020, damping: 0.75 },
    ],
  },
};

export const defaultBuild = () => Object.fromEntries(SLOTS.map(k => [k, 0]));
export function normalizeBuild(raw = {}) {
  return Object.fromEntries(SLOTS.map(k => [k, Number.isInteger(raw?.[k]) && PARTS[k].options[raw[k]] ? raw[k] : 0]));
}
export const pick = (build, slot) => PARTS[slot].options[normalizeBuild(build)[slot]];

// 车型基础参数（kit 资料 + 估计）：质量不含电池（kg）、原厂齿比、轮胎、重心高度（mm）
export const CHASSIS_SPEC = {
  AR: { mass: 0.092, gear: 3.5, cg: 17.0, stability: 1.0 },
  'Super-II': { mass: 0.094, gear: 4.0, cg: 17.5, stability: 0.98 },
  'Super-1': { mass: 0.088, gear: 4.0, cg: 16.5, stability: 0.94 },
  'FM-A': { mass: 0.098, gear: 3.5, cg: 16.0, stability: 1.04 },
};
export const TIRE_D = { low26: 0.026, low24: 0.024, narrow24: 0.024, tread24: 0.0244, slick26: 0.026, large31: 0.031 };

// 由车型 + 改装算出性能参数（供模拟与面板使用）
export function getSetup(car, raw = {}) {
  const b = normalizeBuild(raw);
  const P = Object.fromEntries(SLOTS.map(k => [k, PARTS[k].options[b[k]]]));
  const cs = CHASSIS_SPEC[car.chassis] || CHASSIS_SPEC.AR;
  const tireId = P.tire.tire || car.wheels.tire;
  const D = TIRE_D[tireId] || 0.026;
  const ratio = P.gear.ratio || car.gearRatio || cs.gear;
  const mass = cs.mass + (car.bodyMass || 0.018) + P.battery.mass + P.damper.mass + (P.roller.double ? 0.004 : 0) + (P.roller.bearing ? 0.003 : 0);
  const cg = cs.cg + (D - 0.026) * 1000 * 0.5 + (car.cgOffset || 0) - (P.damper.mass > 0 ? 0.4 : 0);
  const freeSpeed = P.motor.rpm / 60 / ratio * Math.PI * D;                                     // m/s @3V
  const wheelForce = P.motor.torque * 2.6e-3 * ratio / (D / 2) * 0.8;                           // N（失速扭矩估算 × 齿轮效率）
  const stability = cs.stability * P.roller.stability * (1 + P.damper.damping * 0.18) * (17 / cg) * (car.aero || 1);
  return {
    build: b, parts: P, mass, ratio, diameter: D, tire: tireId, cg,
    freeSpeed, wheelForce, stability,
    rollerMu: P.roller.mu, rolling: P.tire.rolling, grip: P.tire.grip,
    bounce: P.tire.bounce * (1 - P.damper.damping), brake: P.brake.strength,
    volts: P.battery.volts, sag: P.battery.sag, capacity: P.battery.capacity, current: P.motor.current,
  };
}

// 面板四维（0–100）：极速、加速、过弯稳定、续航
export function getStats(car, raw = {}) {
  const s = getSetup(car, raw);
  const top = s.freeSpeed * (s.volts / 3) * 3.6;                 // km/h（空载）
  const acc = s.wheelForce / s.mass;                              // m/s²
  const clamp = v => Math.round(Math.max(5, Math.min(100, v)));
  return {
    values: [clamp((top - 12) * 2.6), clamp(acc * 2.0), clamp(s.stability * 62 + (s.brake * 6)), clamp(s.capacity / s.current / 22)],
    topKmh: top, accel: acc, massG: s.mass * 1000,
  };
}
export const STAT_NAMES = ['极速', '加速', '稳定', '续航'];
