// 大气常量与 CPU 端太阳透射率。与 sky.js 中 GLSL 天空视图 LUT 使用同一组参数（Hillaire 2020 取值）。

export const ATMO = {
  groundRadius: 6360e3,
  topRadius: 6460e3,
  viewHeight: 20,
  rayleigh: [5.802e-6, 13.558e-6, 33.1e-6],
  rayleighH: 8000,
  mieScatter: 3.996e-6,
  mieAbsorb: 4.4e-6,
  mieH: 1200,
  mieG: 0.8,
  ozone: [0.65e-6, 1.881e-6, 0.085e-6],
  ozoneCenter: 25e3,
  ozoneWidth: 15e3
};

// 太阳照度（场景 HDR 单位）。天空 LUT 以单位照度计算，渲染时乘以它。
export const SUN_ILLUMINANCE = 12;

function raySphere(oy, dy, dx, r) {
  // 起点 (0, oy, 0)，方向 (dx, dy, ·)，|d| = 1
  const b = oy * dy;
  const c = oy * oy - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t1 = -b - s;
  const t2 = -b + s;
  if (t1 > 0) return t1;
  return t2 > 0 ? t2 : -1;
}

export function sunDirection(elevationDeg, azimuthDeg) {
  const e = (elevationDeg * Math.PI) / 180;
  const a = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
}

// 观察点到大气顶的透射率（被地球遮挡时为 0，近地平线平滑过渡）
export function sunTransmittance(dir, steps = 64) {
  const A = ATMO;
  const oy = A.groundRadius + A.viewHeight;
  const dy = dir[1];
  const horiz = Math.hypot(dir[0], dir[2]);
  const tTop = raySphere(oy, dy, horiz, A.topRadius);
  const tGround = raySphere(oy, dy, horiz, A.groundRadius);
  if (tGround > 0) return [0, 0, 0];
  let odR = 0;
  let odM = 0;
  let odO = 0;
  const ds = tTop / steps;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * ds;
    const px = horiz * t;
    const py = oy + dy * t;
    const h = Math.hypot(px, py) - A.groundRadius;
    odR += Math.exp(-h / A.rayleighH) * ds;
    odM += Math.exp(-h / A.mieH) * ds;
    odO += Math.max(0, 1 - Math.abs(h - A.ozoneCenter) / A.ozoneWidth) * ds;
  }
  return [0, 1, 2].map((c) =>
    Math.exp(-(A.rayleigh[c] * odR + (A.mieScatter + A.mieAbsorb) * odM + A.ozone[c] * odO))
  );
}
