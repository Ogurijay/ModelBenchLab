/**
 * @file src/core/solar.js
 * @module core/solar
 * @description
 * 太阳 / 月亮位置解算（契约 §3.4）。
 *
 * 【算法来源】
 * 太阳部分严格实现 **NOAA ESRL General Solar Position Calculations**
 * （NOAA Global Monitoring Laboratory, "Solar Calculation Details"，
 *  与 Spencer 1971 的傅里叶级数赤纬/均时差拟合一致）：
 *
 *   1) 分数年角      gamma = 2π/365 · (N − 1 + (h − 12)/24)              [rad]
 *   2) 均时差        EoT = 229.18 · (0.000075 + 0.001868·cos γ − 0.032077·sin γ
 *                                    − 0.014615·cos 2γ − 0.040849·sin 2γ)  [min]
 *   3) 太阳赤纬      δ = 0.006918 − 0.399912·cos γ + 0.070257·sin γ
 *                        − 0.006758·cos 2γ + 0.000907·sin 2γ
 *                        − 0.002697·cos 3γ + 0.001480·sin 3γ               [rad]
 *   4) 时间偏移      offset = EoT + 4·lon − 60·tz                          [min]
 *      真太阳时      TST = 当地钟表时(min) + offset                        [min]
 *   5) 时角          H = TST/4 − 180                                       [deg]（正午为 0，上午为负）
 *   6) 天顶/高度角   cos θ = sin φ·sin δ + cos φ·cos δ·cos H
 *                    高度角 e = asin(sin φ·sin δ + cos φ·cos δ·cos H)
 *   7) 方位角        NOAA 给出的是 cos(180−A) 反余弦形式，存在上/下午象限二义；
 *                    本实现用等价且数值稳定的 atan2 形式（乘以 cos δ 消去 tan δ 奇点）：
 *                      A_south = atan2( sin H·cos δ,
 *                                       cos H·cos δ·sin φ − sin δ·cos φ )
 *                      A_north = (A_south + 180°) mod 360°   // 0=北，顺时针
 *   8) 日出日落      cos H₀ = cos(90.833°)/(cos φ·cos δ) − tan φ·tan δ
 *                    90.833° = 90° + 0.833°，含大气折射 34′ 与日面半径 16′ 修正。
 *
 * 月亮部分是**刻意的简化模型**，误差量级见 {@link moonPosition} 注释。
 *
 * 【坐标约定】Y 轴向上；+X 东、−X 西；+Z 南、−Z 北；方位角 0°=正北、90°=正东（顺时针）。
 * 【依赖】本文件为 core 层，除标准库外不 import 任何模块（契约 §0 依赖方向）。
 */

/** 角度 → 弧度 */
const D2R = Math.PI / 180;
/** 弧度 → 角度 */
const R2D = 180 / Math.PI;
/** 黄赤交角（IAU 2006 平均值，度） */
const OBLIQUITY_DEG = 23.4392911;
/** 朔望月长度（天），契约 §3.4 指定 */
const SYNODIC_MONTH_DAYS = 29.530588;
/**
 * 参考新月的「当地年内日序」。
 * 取 2024-01-11 11:57 UTC 的新月（JDE ≈ 2460320.998），换算到 NYC 当地时 (UTC−5)
 * 为 1 月 11 日 06:57，即 dayOfYear ≈ 11.29。由于本函数签名不含年份，
 * 该参考点只保证「相位随时间正确演化」，绝对相位对应的是 2024 年。
 */
const NEW_MOON_REF_DOY = 11.29;
/** 回归年长度（天），用于由年内日序估算太阳黄经 */
const TROPICAL_YEAR_DAYS = 365.2422;
/** 春分点对应的年内日序（3 月 20 日前后），太阳黄经 = 0° */
const VERNAL_EQUINOX_DOY = 80;

/**
 * 纽约市（曼哈顿）地理参数。
 * lat 北纬为正，lon 东经为正（纽约在西半球故为负），tzOffsetHours 为标准时区偏移（EST = UTC−5，不含夏令时）。
 * @type {{lat:number, lon:number, tzOffsetHours:number}}
 */
export const NYC = { lat: 40.7128, lon: -74.0060, tzOffsetHours: -5 };

/**
 * 取模，结果恒为非负（JS 的 % 对负数返回负值）。
 * @param {number} n 被除数
 * @param {number} m 模数（> 0）
 * @returns {number} [0, m) 区间内的值
 */
function mod(n, m) {
  return ((n % m) + m) % m;
}

/**
 * 数值夹取。
 * @param {number} v 输入
 * @param {number} min 下界
 * @param {number} max 上界
 * @returns {number} 夹取后的值
 */
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/**
 * 计算分数年角 gamma（NOAA 第 1 步）。
 * @param {number} dayOfYear 年内日序 1..365（允许小数）
 * @param {number} localHours 当地钟表时，0..24（允许小数）
 * @returns {number} gamma，单位弧度
 */
function fractionalYearAngle(dayOfYear, localHours) {
  // gamma = 2π/365 · (N − 1 + (h − 12)/24)
  return ((2 * Math.PI) / 365) * (dayOfYear - 1 + (localHours - 12) / 24);
}

/**
 * 均时差（Equation of Time），NOAA 第 2 步。
 * 物理含义：真太阳时与平太阳时之差，源于地球轨道偏心率与黄赤交角，
 * 全年在 −14.2 ~ +16.4 分钟之间振荡（八字曲线 analemma）。
 * @param {number} gamma 分数年角（弧度）
 * @returns {number} 均时差，单位分钟
 */
function equationOfTimeMinutes(gamma) {
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))
  );
}

/**
 * 太阳赤纬 delta，NOAA 第 3 步（Spencer 1971 三阶傅里叶拟合，精度约 ±0.05°）。
 * @param {number} gamma 分数年角（弧度）
 * @returns {number} 赤纬，单位弧度（约 −0.409 ~ +0.409）
 */
function solarDeclinationRad(gamma) {
  return (
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.001480 * Math.sin(3 * gamma)
  );
}

/**
 * 由赤纬 / 时角 / 纬度求地平坐标（高度角与方位角）。
 * 高度角：e = asin(sin φ·sin δ + cos φ·cos δ·cos H)
 * 方位角：A = atan2(sin H·cos δ, cos H·cos δ·sin φ − sin δ·cos φ) + 180°（0=北，顺时针）
 * @param {number} latRad 纬度（弧度）
 * @param {number} decRad 赤纬（弧度）
 * @param {number} hourAngleRad 时角（弧度，正午为 0，上午为负、下午为正）
 * @returns {{elevationDeg:number, azimuthDeg:number}} 地平坐标（度）
 */
function horizontalFromEquatorial(latRad, decRad, hourAngleRad) {
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const sinDec = Math.sin(decRad);
  const cosDec = Math.cos(decRad);
  const sinH = Math.sin(hourAngleRad);
  const cosH = Math.cos(hourAngleRad);

  const sinElev = clamp(sinLat * sinDec + cosLat * cosDec * cosH, -1, 1);
  const elevationDeg = Math.asin(sinElev) * R2D;

  // 相对正南的方位角（西为正），再 +180° 转成「0=北、顺时针」的约定。
  const azFromSouth = Math.atan2(sinH * cosDec, cosH * cosDec * sinLat - sinDec * cosLat);
  const azimuthDeg = mod(azFromSouth * R2D + 180, 360);

  return { elevationDeg, azimuthDeg };
}

/**
 * 太阳位置解算（NOAA General Solar Position Calculations）。
 *
 * @param {number} dayOfYear 年内日序 1..365（允许小数）
 * @param {number} localHours 当地钟表时（小时，0..24，允许小数）
 * @param {number} [lat=NYC.lat] 纬度（度，北为正）
 * @param {number} [lon=NYC.lon] 经度（度，东为正）
 * @param {number} [tz=NYC.tzOffsetHours] 时区偏移（小时，如 EST = −5）
 * @returns {{elevationDeg:number, azimuthDeg:number, declinationDeg:number,
 *            hourAngleDeg:number, equationOfTimeMin:number, zenithDeg:number}}
 *   elevationDeg 为**几何**高度角（未加大气折射；折射修正只在日出日落公式里以 −0.833° 体现）。
 */
export function solarPosition(
  dayOfYear,
  localHours,
  lat = NYC.lat,
  lon = NYC.lon,
  tz = NYC.tzOffsetHours
) {
  const gamma = fractionalYearAngle(dayOfYear, localHours);
  const eqTimeMin = equationOfTimeMinutes(gamma);
  const decRad = solarDeclinationRad(gamma);

  // 第 4 步：时间偏移（分钟）。4 min/° 是地球自转 15°/h 的倒数。
  const timeOffsetMin = eqTimeMin + 4 * lon - 60 * tz;
  // 真太阳时（分钟）
  const trueSolarTimeMin = localHours * 60 + timeOffsetMin;
  // 第 5 步：时角（度），正午 = 0°
  const hourAngleDeg = trueSolarTimeMin / 4 - 180;

  const { elevationDeg, azimuthDeg } = horizontalFromEquatorial(
    lat * D2R,
    decRad,
    hourAngleDeg * D2R
  );

  return {
    elevationDeg,
    azimuthDeg,
    declinationDeg: decRad * R2D,
    hourAngleDeg,
    equationOfTimeMin: eqTimeMin,
    zenithDeg: 90 - elevationDeg
  };
}

/**
 * 由高度角/方位角求「由城市指向太阳」的单位方向向量。
 * 约定：方位角 0° = 正北 = −Z，90° = 正东 = +X，Y 轴向上。
 *   x = cos(e)·sin(A)
 *   y = sin(e)
 *   z = −cos(e)·cos(A)
 * @param {number} elevationDeg 高度角（度，地平线下为负）
 * @param {number} azimuthDeg 方位角（度，0=北，顺时针为正）
 * @returns {{x:number, y:number, z:number}} 归一化方向向量
 */
export function sunDirection(elevationDeg, azimuthDeg) {
  const e = elevationDeg * D2R;
  const a = azimuthDeg * D2R;
  const cosE = Math.cos(e);
  let x = cosE * Math.sin(a);
  const y = Math.sin(e);
  let z = -cosE * Math.cos(a);

  // 三角恒等式已保证模长为 1，这里仅做浮点误差归一，避免下游光照出现能量漂移。
  const len = Math.hypot(x, y, z) || 1;
  x /= len;
  z /= len;
  return { x, y: y / len, z };
}

/**
 * 日出/日落时刻与昼长（NOAA 第 8 步）。
 *
 * 半日弧时角： H₀ = acos( cos(90.833°)/(cos φ·cos δ) − tan φ·tan δ )
 * 其中 90.833° 的 0.833° = 大气折射 34′ + 日面视半径 16′，即「日面上缘与地平线相切」。
 * UTC 分钟： sunrise = 720 − 4·(lon + H₀) − EoT，sunset = 720 − 4·(lon − H₀) − EoT
 * 当地小时 = UTC 分钟/60 + tz。昼长 = 8·H₀/60 = H₀/7.5 小时。
 *
 * @param {number} dayOfYear 年内日序 1..365
 * @param {number} [lat=NYC.lat] 纬度（度）
 * @param {number} [lon=NYC.lon] 经度（度，东为正）
 * @param {number} [tz=NYC.tzOffsetHours] 时区偏移（小时）
 * @returns {{sunriseHours:number, sunsetHours:number, dayLengthHours:number}}
 *   极昼时返回 {0, 24, 24}；极夜时日出=日落=当地太阳正午时刻，昼长 0。
 */
export function sunriseSunset(dayOfYear, lat = NYC.lat, lon = NYC.lon, tz = NYC.tzOffsetHours) {
  // 日出日落约发生在 06:00 / 18:00 附近，取当地正午求 gamma 对全年精度影响 < 0.5 分钟。
  const gamma = fractionalYearAngle(dayOfYear, 12);
  const eqTimeMin = equationOfTimeMinutes(gamma);
  const decRad = solarDeclinationRad(gamma);
  const latRad = lat * D2R;

  const cosH0 =
    Math.cos(90.833 * D2R) / (Math.cos(latRad) * Math.cos(decRad)) -
    Math.tan(latRad) * Math.tan(decRad);

  // 当地太阳正午（钟表时，小时）：真太阳时 12:00 对应的地方时。
  const solarNoonHours = (720 - 4 * lon - eqTimeMin) / 60 + tz;

  if (cosH0 <= -1) {
    // 极昼：太阳整日不落。
    return { sunriseHours: 0, sunsetHours: 24, dayLengthHours: 24 };
  }
  if (cosH0 >= 1) {
    // 极夜：太阳整日不升。
    const noon = mod(solarNoonHours, 24);
    return { sunriseHours: noon, sunsetHours: noon, dayLengthHours: 0 };
  }

  const h0Deg = Math.acos(cosH0) * R2D;
  const sunriseUtcMin = 720 - 4 * (lon + h0Deg) - eqTimeMin;
  const sunsetUtcMin = 720 - 4 * (lon - h0Deg) - eqTimeMin;

  return {
    sunriseHours: mod(sunriseUtcMin / 60 + tz, 24),
    sunsetHours: mod(sunsetUtcMin / 60 + tz, 24),
    dayLengthHours: (8 * h0Deg) / 60
  };
}

/**
 * 月相计算：以朔望月 29.530588 天线性推进（平均朔望月模型）。
 * 月龄 age = ((当前时刻 − 参考新月时刻) mod 29.530588)，
 * 相位 phase01 = age / 29.530588（0 = 新月，0.5 = 满月，0.75 = 下弦）。
 * 被照亮比例采用球体半影公式 illumination = (1 − cos(2π·phase01)) / 2，
 * 等价于 (1 − cos(相位角)) / 2，误差主要来自真实朔望月的 ±0.3 天摆动（月球轨道摄动）。
 *
 * @param {number} dayOfYear 年内日序 1..365
 * @param {number} [localHours=12] 当地钟表时（小时）
 * @returns {{phase01:number, illumination:number, ageDays:number}}
 */
export function moonPhase(dayOfYear, localHours = 12) {
  const t = dayOfYear + localHours / 24;
  const ageDays = mod(t - NEW_MOON_REF_DOY, SYNODIC_MONTH_DAYS);
  const phase01 = ageDays / SYNODIC_MONTH_DAYS;
  const illumination = (1 - Math.cos(2 * Math.PI * phase01)) / 2;
  return { phase01, illumination, ageDays };
}

/**
 * 太阳的黄经近似（度）：以春分点为 0°，按回归年线性推进。
 * 忽略地球轨道偏心率带来的真近点角修正（最大约 ±1.9°）。
 * @param {number} dayOfYear 年内日序（允许小数）
 * @returns {number} 黄经，单位度，[0,360)
 */
function sunEclipticLongitudeDeg(dayOfYear) {
  return mod(((dayOfYear - VERNAL_EQUINOX_DOY) * 360) / TROPICAL_YEAR_DAYS, 360);
}

/**
 * 由黄道坐标（黄纬取 0）求赤经/赤纬。
 *   tan α = cos ε · sin λ / cos λ
 *   sin δ = sin ε · sin λ
 * @param {number} lambdaDeg 黄经（度）
 * @returns {{raDeg:number, decRad:number}} 赤经（度）与赤纬（弧度）
 */
function eclipticToEquatorial(lambdaDeg) {
  const lam = lambdaDeg * D2R;
  const eps = OBLIQUITY_DEG * D2R;
  const raDeg = mod(Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)) * R2D, 360);
  const decRad = Math.asin(clamp(Math.sin(eps) * Math.sin(lam), -1, 1));
  return { raDeg, decRad };
}

/**
 * 月亮地平位置（**简化模型**）。
 *
 * 模型：把月球视为「沿黄道运行、黄经比太阳超前 360°·phase01 的天体」——
 *   λ_moon = λ_sun + 360°·phase01
 * 再由黄道坐标转赤道坐标得到 δ_moon / α_moon，并利用「同一瞬间恒星时相同」的关系
 *   H_moon = H_sun + (α_sun − α_moon)
 * 换算出月亮时角，最后套用与太阳相同的地平坐标公式。
 *
 * 【简化与误差】本模型忽略：
 *   1. 月球轨道相对黄道 5.145° 的倾角 → 赤纬误差最大约 ±5°；
 *   2. 轨道偏心率 e ≈ 0.0549 的中心差（最大 ±6.3° 黄经）→ 出没时刻误差可达 ±40 分钟；
 *   3. 出差/二均差等主要摄动项（±1.3° 量级）与视差（地心 → 站心，最大 ~1°）。
 * 综合定位误差量级约 ±5~8°，出没时刻误差约 ±1 小时。
 * 用于夜空渲染（月亮方位、月光方向）已足够，**不可用于天文观测或历法计算**。
 *
 * @param {number} dayOfYear 年内日序 1..365
 * @param {number} localHours 当地钟表时（小时）
 * @param {number} [lat=NYC.lat] 纬度（度）
 * @param {number} [lon=NYC.lon] 经度（度，东为正）
 * @param {number} [tz=NYC.tzOffsetHours] 时区偏移（小时）
 * @returns {{elevationDeg:number, azimuthDeg:number}} 月亮的高度角与方位角（度）
 */
export function moonPosition(
  dayOfYear,
  localHours,
  lat = NYC.lat,
  lon = NYC.lon,
  tz = NYC.tzOffsetHours
) {
  const sun = solarPosition(dayOfYear, localHours, lat, lon, tz);
  const { phase01 } = moonPhase(dayOfYear, localHours);

  const lambdaSun = sunEclipticLongitudeDeg(dayOfYear + localHours / 24);
  const lambdaMoon = mod(lambdaSun + 360 * phase01, 360);

  const sunEq = eclipticToEquatorial(lambdaSun);
  const moonEq = eclipticToEquatorial(lambdaMoon);

  // 恒星时相同 ⇒ H_moon − H_sun = α_sun − α_moon
  const hourAngleMoonDeg = sun.hourAngleDeg + (sunEq.raDeg - moonEq.raDeg);

  return horizontalFromEquatorial(lat * D2R, moonEq.decRad, hourAngleMoonDeg * D2R);
}
