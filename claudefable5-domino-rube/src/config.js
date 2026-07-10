// ============================================================
// config.js — 全部布局 / 物理调参常量(单一事实来源)
// 坐标系:y 向上,桌面顶面 y = 0,机关链沿 +x 方向推进,链道 z = LANE_Z
// ============================================================

export const FIXED_DT = 1 / 120;      // 固定物理步长(与渲染解耦)
export const MAX_SUBSTEPS = 5;        // 单帧最大追帧步数(切后台回来防卡死)
export const GRAVITY = -9.82;

export const LANE_Z = 1.3;            // 机关链主车道 z 坐标

// ---------- 桌面 ----------
export const TABLE = {
  sizeX: 11.6, sizeZ: 7.4, thick: 0.5,
  rimHeight: 0.16, rimThick: 0.12,    // 桌边低围栏,防止任何刚体滚落桌外
};

// ---------- 圆形高台(多米诺舞台) ----------
export const MESA = {
  cx: -3.0, cz: -0.7,                 // 圆心(x, z)
  radius: 2.6, height: 1.2,           // 台面顶 y = height
};

// ---------- 多米诺 ----------
export const DOMINO = {
  h: 0.6, w: 0.3, t: 0.1,             // 高 / 宽 / 厚
  mass: 1.2,
  arcRadius: 2.0,                     // 弧线半径(绕 MESA 圆心)
  arcCount: 21,                       // 弧线段骨牌数
  arcStartDeg: 280,                   // 起始角(度),顺时针递减到 90°
  arcEndDeg: 90,                      // 末端角:切线正好朝 +x
  straightCount: 4,                   // 直线段骨牌数(高台 90° 点 → 发球台)
  straightSpacing: 0.34,
  impulse: 2.0,                       // 触发冲量大小(作用于第一张骨牌顶端)
  impulseYOffset: 0.26,               // 冲量作用点相对质心的 y 偏移
};

// ---------- 发球台(高台边缘伸出的木栈桥) ----------
export const LEDGE = { x0: -1.78, x1: -0.98, width: 0.66, thick: 0.12 };

// ---------- 重球(斜坡滚球) ----------
export const BIG_BALL = {
  r: 0.22, mass: 2.2,
  // 停在发球台上,由最后一张骨牌倒平时的顶边平推出发(实测推速 ~0.5 m/s)。
  // 不能停近(-1.13):末牌只能以下落弧线中段击中球背上方,冲量大半朝下,
  // 推速掉到 0.28 且末牌斜倚球背持续拖拽,球要爬行 6s 才离台(实测)。
  restX: -1.30,
  lipX: -1.13,                        // 发球位铜条标记(纯装饰,无物理)
};

// ---------- 斜坡 + 高架直道 ----------
export const RAMP = {
  // 上沿藏进发球台边缘下方 1.5cm:球滚离台缘后微降落到坡面。
  // 不能与台面齐平(1.2)——坡面盒体沿坡向两端各延伸 0.06,若齐平
  // 其上坡端顶角会凸出台面 ~1.3cm 形成暗脊,重球会在楔口振荡近停(实测)。
  topX: -1.02,  topY: 1.185,
  botX: 0.46,   botY: 0.86,           // 斜坡下沿(接高架直道)
  width: 0.62, railH: 0.16, railT: 0.05, thick: 0.08,
};
export const TRACK = {                 // 高架水平直道(末端凌空,球飞落跷跷板近端)
  x0: 0.40, x1: 1.30, y: 0.86,
  width: 0.62, railH: 0.14, railT: 0.05, thick: 0.08,
};

// ---------- 跷跷板(杠杆弹射器) ----------
export const SEESAW = {
  pivotX: 2.54, pivotY: 0.35,          // 铰链轴心
  halfLen: 1.1, width: 0.5, thick: 0.06,
  mass: 0.9,
  tiltDeg: -16.5,                      // 初始倾角:近端(-x)翘起、远端(+x)落地
  // 近端下摆到该角即撞上止挡块 → 板急停、小球出杯。10° 是实测最优:
  // 行程 26.5° 提供足够弹射能量(出杯 vy≈3.6),且近端停在低位,
  // 大球从近端后缘退场、不会穿越板面追着小球跑;更早停(≤4°)行程
  // 不足小球弹不到锤球高度,不停(翻到 18.5°)则倒飞只能擦锤(实测)。
  stopDeg: 10,
  cupOffset: 0.86,                     // 弹射杯相对板中心的 +x 偏移
  cupLipH: 0.07, cupLipT: 0.04,
};
export const SMALL_BALL = { r: 0.12, mass: 0.28 };

// ---------- 摆锤 ----------
export const PENDULUM = {
  bobR: 0.2, bobMass: 0.45,            // 减重:同样冲量下摆幅更大,响铃余量更足
  // 锤心高度对准小球实测弹道:出杯顶点 y≈0.68,锤球下移到 0.78 后
  // 小球在 y≈0.6 处带着上升速度结实命中锤球左下象限(法向朝上偏 +x)
  bobX: 3.62, bobY: 0.78,
  rodLen: 1.2,                         // 摆杆长 → 铰点 y = bobY + rodLen
  gantryHalfSpan: 0.7,                 // 龙门架横梁半跨(z 方向)
};

// ---------- 铃铛 ----------
export const BELL = {
  r: 0.26, x: 4.14, y: 0.78,           // 与摆锤同高,表面间隙约 0.06,轻碰即响
  standX: 4.14,
};

// ---------- 物理材质参数 ----------
export const PHYS = {
  solverIterations: 15,
  solverTolerance: 0.001,
  friction: {
    default: 0.35, ballWood: 0.55, dominoGround: 0.42,
    dominoDomino: 0,                // 必须为 0:>0 会摩擦自锁,链条卡死(见 physicsWorld.js)
  },
  restitution: { default: 0.05, ball: 0.12, domino: 0.05 },
  linearDamping: 0.01,
  angularDamping: 0.01,
};

// ---------- 阶段 ----------
export const STAGE_NAMES = ['待命', '多米诺骨牌', '斜坡滚球', '杠杆跷跷板', '摆锤撞击', '终点铃铛'];

// ---------- 慢动作 ----------
export const SLOW_SCALE = 0.35;

export function deg(d) { return (d * Math.PI) / 180; }
