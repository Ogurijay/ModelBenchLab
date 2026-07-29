/**
 * @file src/core/mathx.js
 * @module core/mathx
 * @description
 * 纯数学工具库（契约 §3.3）。不依赖 three、不依赖本项目任何其他模块，
 * 全部为确定性纯函数：相同输入必得相同输出，无内部状态、不产生任何随机数。
 *
 * 主要内容：
 *  1. 角度常量与插值/重映射（clamp / lerp / invLerp / smoothstep / smootherstep）；
 *  2. 帧率无关的指数阻尼（damp / dampAngleDeg）——相机、天气参数、风向都靠它做平滑；
 *  3. 悬链线四件套（solveCatenaryA / catenaryY / catenaryPoints / catenaryLength）——
 *     桥梁主缆必须走真实悬链线方程，不得用抛物线或手写数组冒充。
 */

/** 圆周率的两倍，2π。 @type {number} */
export const TWO_PI = Math.PI * 2;

/** 角度转弧度系数，π/180。 @type {number} */
export const DEG2RAD = Math.PI / 180;

/** 弧度转角度系数，180/π。 @type {number} */
export const RAD2DEG = 180 / Math.PI;

/**
 * 牛顿迭代中允许的最大无量纲参数 u = halfSpan / a。
 * cosh(690) ≈ 2.3e299 仍在双精度范围内（上限 ~1.8e308），再大就会溢出成 Infinity，
 * 因此把初值对应的 u 夹在此上限内，保证 sag 极大时也不会出现 NaN。
 * @type {number}
 */
const CATENARY_U_MAX = 690;

/**
 * 把数值限制在 [min, max] 区间。
 * @param {number} v 输入值
 * @param {number} min 下界
 * @param {number} max 上界
 * @returns {number} 夹紧后的值
 */
export function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/**
 * 线性插值（不夹紧 t，允许外推）。
 * @param {number} a t=0 时的值
 * @param {number} b t=1 时的值
 * @param {number} t 插值参数
 * @returns {number} a + (b - a) * t
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * lerp 的逆运算：求 v 在 [a, b] 中的归一化位置（不夹紧）。
 * @param {number} a 区间起点
 * @param {number} b 区间终点
 * @param {number} v 待求值
 * @returns {number} (v - a) / (b - a)；a === b 时退化返回 0，避免除零
 */
export function invLerp(a, b, v) {
  const d = b - a;
  if (d === 0) return 0;
  return (v - a) / d;
}

/**
 * 经典 Hermite 平滑阶跃（与 GLSL smoothstep 完全一致）：t² (3 − 2t)。
 * 端点处一阶导为 0。
 * @param {number} edge0 下沿
 * @param {number} edge1 上沿
 * @param {number} x 采样点
 * @returns {number} [0, 1] 内的平滑权重
 */
export function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Ken Perlin 的改进平滑阶跃（《Texturing & Modeling》2002，Improved Noise）：
 * t³ (t (6t − 15) + 10)，端点处一阶与二阶导均为 0，比 smoothstep 更柔和。
 * @param {number} edge0 下沿
 * @param {number} edge1 上沿
 * @param {number} x 采样点
 * @returns {number} [0, 1] 内的平滑权重
 */
export function smootherstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * 帧率无关的指数逼近（exponential damping）。
 *
 * 连续形式为一阶线性微分方程 dx/dt = λ (target − x)，其解析解为
 *   x(t + Δt) = target + (x(t) − target) · e^(−λ·Δt)
 * 整理即 current + (target − current) · (1 − e^(−λ·Δt))。
 *
 * 由于误差按 e^(−λΔt) 相乘，n 次 Δt 与 1 次 nΔt 的结果在数学上完全相等，
 * 因此本函数天然帧率无关（对比朴素的 lerp(current, target, k) 会随帧率漂移）。
 *
 * @param {number} current 当前值
 * @param {number} target 目标值
 * @param {number} lambda 逼近速率（1/秒），越大越快；λ = 1/τ，τ 为时间常数
 * @param {number} dt 时间步长（秒）
 * @returns {number} 本步之后的值
 */
export function damp(current, target, lambda, dt) {
  if (!(dt > 0) || !(lambda > 0)) return current;
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/**
 * 求 target 相对 current 的最短角差（度），结果落在 (−180, 180]。
 * @param {number} currentDeg 当前角（度）
 * @param {number} targetDeg 目标角（度）
 * @returns {number} 最短弧的有符号增量（度）
 */
function shortestAngleDeltaDeg(currentDeg, targetDeg) {
  return mod(targetDeg - currentDeg + 180, 360) - 180;
}

/**
 * 角度版指数阻尼：沿**最短弧**逼近目标角，避免绕远路（例如 350° → 10° 只走 +20°）。
 * 数学核心同 {@link damp}，只是先把角差折算到 (−180, 180]。
 *
 * 注意：返回值**不做 0..360 归一化**（350° 逼近 10° 会得到 350°+ 的数，而不是倒退到 3°），
 * 这样调用方可以直接比较增减方向；需要显示时自行 `mod(value, 360)`。
 *
 * @param {number} current 当前角（度）
 * @param {number} target 目标角（度）
 * @param {number} lambda 逼近速率（1/秒）
 * @param {number} dt 时间步长（秒）
 * @returns {number} 本步之后的角（度，未归一化）
 */
export function dampAngleDeg(current, target, lambda, dt) {
  if (!(dt > 0) || !(lambda > 0)) return current;
  const delta = shortestAngleDeltaDeg(current, target);
  return current + delta * (1 - Math.exp(-lambda * dt));
}

/**
 * 取模，结果永远非负（m > 0 时）。JS 原生 `%` 对负被除数会返回负值，故封装。
 * @param {number} n 被除数
 * @param {number} m 模（应 > 0）
 * @returns {number} [0, m) 内的余数
 */
export function mod(n, m) {
  return ((n % m) + m) % m;
}

/**
 * 悬链线残差函数 f(a) = a·(cosh(halfSpan/a) − 1) − sag。
 *
 * 用恒等式 cosh(u) − 1 = 2·sinh²(u/2) 计算，避免 u 很小时
 * `cosh(u) - 1` 的灾难性抵消（u = 1e-8 时直接算会丢掉一半有效位）。
 *
 * @param {number} a 悬链线参数
 * @param {number} halfSpan 半跨（米）
 * @param {number} sag 垂度（米）
 * @returns {number} 残差；f 关于 a 单调递减且凸
 */
function catenaryResidual(a, halfSpan, sag) {
  const sh = Math.sinh(halfSpan / (2 * a));
  return 2 * a * sh * sh - sag;
}

/**
 * 由半跨与垂度反解悬链线参数 a。
 *
 * **方程**（悬链线 y = a·cosh(x/a) − a，Bernoulli / Huygens / Leibniz 1691）：
 *   f(a) = a · (cosh(halfSpan / a) − 1) − sag = 0
 * **导数**（令 u = halfSpan / a）：
 *   f'(a) = cosh(u) − 1 − u·sinh(u) = 2·sinh²(u/2) − u·sinh(u) < 0  （恒负）
 * **牛顿迭代式**：
 *   a_{k+1} = a_k − f(a_k) / f'(a_k)
 * **初值**（抛物线近似，把 cosh 展开到二阶：sag ≈ halfSpan²/(2a)）：
 *   a_0 = halfSpan² / (2·sag)
 *
 * 收敛性保证：f 在 a > 0 上单调递减且凸，且可证 a_0 ≤ a*（抛物线垂度不高于真实垂度），
 * 故牛顿迭代从左侧单调递增收敛、不会越过根。为防浮点异常（sag 极大时 u 巨大、
 * sag 极小时 a 巨大），这里采用 **牛顿 + 二分兜底**（Numerical Recipes §9.4 rtsafe）：
 * 全程维护括号区间 [lo, hi]（f(lo) > 0 > f(hi)），牛顿步一旦跳出区间或产生非有限值，
 * 立即退化为二分，保证任何输入都能收敛。典型桥梁参数下 4~6 次迭代即可达到机器精度
 * （残差相对误差 ~1e-16，远优于要求的 1e-9）。
 *
 * @param {number} halfSpan 半跨距（米，取绝对值）
 * @param {number} sag 垂度（米，端点相对最低点的高差）
 * @param {number} [iterations=60] 最大迭代次数
 * @returns {number} 悬链线参数 a（米）；sag ≤ 0 或 halfSpan ≤ 0 等退化输入返回 Infinity（即直线）
 */
export function solveCatenaryA(halfSpan, sag, iterations = 60) {
  const L = Math.abs(halfSpan);
  // 除零与退化保护：无跨度或无垂度时缆索为直线，a → ∞
  if (!Number.isFinite(L) || L <= 0) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(sag) || sag <= 0) return Number.POSITIVE_INFINITY;

  const ratio = sag / L;
  const aParabola = (L * L) / (2 * sag);
  if (!Number.isFinite(aParabola) || aParabola <= 0) return Number.POSITIVE_INFINITY;

  // sag 极小：a* = a_0 · (1 + u²/12 + …)，u ≈ 2·ratio，修正量约 ratio²/3。
  // ratio < 1e-8 时修正量 < 3e-17，已低于双精度分辨率，抛物线解析解即是最优解。
  if (ratio < 1e-8) return aParabola;

  // 抛物线初值对应 u_0 = L / a_0 = 2·ratio；夹到 U_MAX 以免 sinh/cosh 溢出。
  const u0 = Math.min(2 * ratio, CATENARY_U_MAX);
  let lo = L / u0;
  let fLo = catenaryResidual(lo, L, sag);
  if (!Number.isFinite(fLo)) return lo;
  if (fLo <= 0) return lo; // 极端 sag：夹紧后的下界已越过根，直接返回

  // 向右倍增找出 f(hi) < 0 的上界，构造括号区间
  let hi = lo * 2;
  let fHi = catenaryResidual(hi, L, sag);
  for (let e = 0; e < 200 && fHi > 0; e++) {
    lo = hi;
    fLo = fHi;
    hi *= 2;
    if (!Number.isFinite(hi)) return Number.POSITIVE_INFINITY;
    fHi = catenaryResidual(hi, L, sag);
  }
  if (fHi > 0) return hi;

  // 牛顿 + 二分兜底
  let a = lo;
  let fa = fLo;
  for (let i = 0; i < iterations; i++) {
    const u = L / a;
    const sh = Math.sinh(u * 0.5);
    const fp = 2 * sh * sh - u * Math.sinh(u); // f'(a)，恒 < 0
    let next = Number.isFinite(fp) && fp !== 0 ? a - fa / fp : Number.NaN;
    if (!Number.isFinite(next) || next <= lo || next >= hi) {
      next = 0.5 * (lo + hi); // 牛顿步越界 → 二分
    }
    const fNext = catenaryResidual(next, L, sag);
    if (fNext > 0) {
      lo = next;
      fLo = fNext;
    } else {
      hi = next;
      fHi = fNext;
    }
    const delta = Math.abs(next - a);
    a = next;
    fa = fNext;
    if (fNext === 0 || delta <= Math.abs(a) * 1e-16 || hi - lo <= lo * 1e-16) break;
  }
  return a;
}

/**
 * 悬链线取值（已平移到最低点为 0）：y(x) = a·cosh(x/a) − a。
 * 实际用等价且数值更稳的 2a·sinh²(x/(2a)) 计算（避免 x/a 很小时的抵消误差）。
 *
 * @param {number} x 水平坐标（米，相对最低点）
 * @param {number} a 悬链线参数（由 {@link solveCatenaryA} 求得）
 * @returns {number} 相对最低点的高度（米）；a 非有限或 ≤ 0（直线退化）时返回 0
 */
export function catenaryY(x, a) {
  if (!Number.isFinite(a) || a <= 0) return 0;
  const sh = Math.sinh(x / (2 * a));
  return 2 * a * sh * sh;
}

/**
 * 采样一条完整悬链线：x 从 −span/2 均匀走到 +span/2，
 * y 已平移为「最低点 y(0) = 0、两端 y(±span/2) = sag」。
 *
 * 端点值会被精确对齐到 sag（求解残差约 1e-16 量级，此处直接吸附，
 * 保证桥梁吊索与塔顶锚固点严丝合缝）。
 *
 * @param {number} span 总跨距（米）
 * @param {number} sag 垂度（米）
 * @param {number} [count=24] 采样点数（至少 2）
 * @returns {Array<{x: number, y: number}>} 采样点数组，长度为 count
 */
export function catenaryPoints(span, sag, count = 24) {
  const n = Math.max(2, Math.floor(count) || 2);
  const halfSpan = Math.abs(span) / 2;
  const a = solveCatenaryA(halfSpan, sag);
  const points = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = -halfSpan + 2 * halfSpan * t;
    points[i] = { x, y: catenaryY(x, a) };
  }
  if (halfSpan > 0 && Number.isFinite(sag) && sag > 0) {
    points[0].y = sag;
    points[n - 1].y = sag;
  }
  return points;
}

/**
 * 悬链线弧长（两端等高，全长）：s = 2a·sinh(halfSpan/a)。
 * 由 ds = √(1 + y'²) dx，y' = sinh(x/a) ⇒ ds = cosh(x/a) dx 积分而得。
 * 因 sinh(u) > u，弧长恒大于弦长 2·halfSpan。
 *
 * @param {number} halfSpan 半跨距（米）
 * @param {number} a 悬链线参数
 * @returns {number} 缆索总长（米）；a 非有限或 ≤ 0 时退化为弦长 2·halfSpan
 */
export function catenaryLength(halfSpan, a) {
  const L = Math.abs(halfSpan);
  if (!Number.isFinite(a) || a <= 0) return 2 * L;
  return 2 * a * Math.sinh(L / a);
}

/**
 * 标量 Catmull-Rom 样条插值（均匀参数化，张力 0.5）。
 * 公式（Catmull & Rom 1974）：
 *   q(t) = 0.5 · [ 2p1 + (−p0 + p2)t + (2p0 − 5p1 + 4p2 − p3)t² + (−p0 + 3p1 − 3p2 + p3)t³ ]
 * 曲线过 p1（t=0）与 p2（t=1），C¹ 连续，用于直升机航线、船只航迹等平滑。
 *
 * @param {number} p0 前控制点
 * @param {number} p1 段起点（t=0 时的返回值）
 * @param {number} p2 段终点（t=1 时的返回值）
 * @param {number} p3 后控制点
 * @param {number} t 段内参数 [0, 1]
 * @returns {number} 插值结果
 */
export function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}
