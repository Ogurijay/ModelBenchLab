// 布料与场景几何常量 + 默认参数(单位:米 / 秒 / kg)

export const CLOTH = {
  width: 3.0,          // 旗面宽
  height: 2.0,         // 旗面高
  topX: 0.07,          // 旗面左上角 x(贴着旗杆表面)
  topY: 4.32,          // 旗面左上角 y
  poleHeight: 4.6,     // 旗杆高
  poleCollisionRadius: 0.085, // 布料与旗杆的碰撞半径
  ropeEndX: 3.45,      // 晾布绳远端(晾布桩)x
};

export const DEFAULTS = {
  segX: 32,            // 横向分段(纵向按 3:2 比例推导)
  iterations: 5,       // 约束迭代次数(= 刚度)
  gravity: 9.8,        // 重力加速度
  damping: 0.012,      // Verlet 速度阻尼(每子步)
  windDirection: 12,   // 风向(度,0 = +X)
  windStrength: 5.5,   // 基础风速 m/s
  gust: 0.45,          // 阵风强度 0~1
  pinMode: 'edge',     // 'edge' 整边固定(旗帜) | 'corners' 两角固定(晾布)
  tearEnabled: false,  // L4:超应力撕裂
  tearThreshold: 1.6,  // 撕裂应变比(长度超过 rest×阈值 时断开)
};

/** 按 3:2 旗面比例从横向分段推导纵向分段 */
export function segYFor(segX) {
  return Math.max(6, Math.round((segX * CLOTH.height) / CLOTH.width));
}
