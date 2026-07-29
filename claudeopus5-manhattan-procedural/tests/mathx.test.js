/**
 * @file tests/mathx.test.js
 * @description core/mathx.js 的单元测试（契约 §3.3 / §10）：
 * damp 帧率无关性、悬链线求解精度、smoothstep 边界与单调、mod 负数、dampAngleDeg 最短弧。
 */

import { describe, it, expect } from 'vitest';
import {
  TWO_PI,
  DEG2RAD,
  RAD2DEG,
  clamp,
  lerp,
  invLerp,
  smoothstep,
  smootherstep,
  damp,
  dampAngleDeg,
  mod,
  solveCatenaryA,
  catenaryY,
  catenaryPoints,
  catenaryLength,
  catmullRom
} from '../src/core/mathx.js';

describe('常量', () => {
  it('TWO_PI / DEG2RAD / RAD2DEG 取值正确', () => {
    expect(TWO_PI).toBeCloseTo(6.283185307179586, 12);
    expect(180 * DEG2RAD).toBeCloseTo(Math.PI, 12);
    expect(Math.PI * RAD2DEG).toBeCloseTo(180, 12);
    expect(DEG2RAD * RAD2DEG).toBeCloseTo(1, 12);
  });
});

describe('clamp / lerp / invLerp', () => {
  it('clamp 夹紧上下界', () => {
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(0.25, 0, 1)).toBe(0.25);
  });

  it('lerp 端点精确、可外推', () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 1)).toBe(10);
    expect(lerp(2, 10, 0.5)).toBe(6);
    expect(lerp(2, 10, 2)).toBe(18);
  });

  it('invLerp 是 lerp 的逆，且 a===b 时不除零', () => {
    expect(invLerp(2, 10, 6)).toBeCloseTo(0.5, 12);
    expect(lerp(3, 9, invLerp(3, 9, 7))).toBeCloseTo(7, 12);
    expect(invLerp(4, 4, 9)).toBe(0);
    expect(Number.isFinite(invLerp(4, 4, 9))).toBe(true);
  });
});

describe('smoothstep / smootherstep', () => {
  it('边界值精确为 0 / 1，中点为 0.5', () => {
    for (const fn of [smoothstep, smootherstep]) {
      expect(fn(0, 1, -3)).toBe(0);
      expect(fn(0, 1, 0)).toBe(0);
      expect(fn(0, 1, 1)).toBe(1);
      expect(fn(0, 1, 7)).toBe(1);
      expect(fn(0, 1, 0.5)).toBeCloseTo(0.5, 12);
      expect(fn(10, 20, 15)).toBeCloseTo(0.5, 12);
    }
  });

  it('区间内严格单调递增且值域在 [0,1]', () => {
    for (const fn of [smoothstep, smootherstep]) {
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const v = fn(-2, 6, -2 + (8 * i) / 100);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
      expect(prev).toBe(1);
    }
  });

  it('smootherstep 端点更平（一阶二阶导为 0）', () => {
    // 靠近下沿处 smootherstep 上升得比 smoothstep 更慢
    expect(smootherstep(0, 1, 0.05)).toBeLessThan(smoothstep(0, 1, 0.05));
    // 靠近上沿处 smootherstep 更接近 1
    expect(smootherstep(0, 1, 0.95)).toBeGreaterThan(smoothstep(0, 1, 0.95));
  });

  it('edge0 === edge1 时退化为硬阶跃而非 NaN', () => {
    expect(smoothstep(5, 5, 4)).toBe(0);
    expect(smoothstep(5, 5, 6)).toBe(1);
    expect(smootherstep(5, 5, 4)).toBe(0);
    expect(smootherstep(5, 5, 6)).toBe(1);
  });
});

describe('damp 帧率无关性', () => {
  it('1 步 0.1s 与 10 步 0.01s 结果一致（差 < 1e-3）', () => {
    const lambda = 6;
    const target = 100;
    const bigStep = damp(0, target, lambda, 0.1);
    let small = 0;
    for (let i = 0; i < 10; i++) small = damp(small, target, lambda, 0.01);
    expect(Math.abs(bigStep - small)).toBeLessThan(1e-3);
    // 指数逼近在数学上完全等价，实际误差应在浮点噪声量级
    expect(Math.abs(bigStep - small)).toBeLessThan(1e-9);
  });

  it('不同细分步数（1/4/25/100 步）积分到同一秒的结果一致', () => {
    const lambda = 3.7;
    const total = 1;
    const results = [1, 4, 25, 100].map((steps) => {
      let v = 5;
      for (let i = 0; i < steps; i++) v = damp(v, -20, lambda, total / steps);
      return v;
    });
    const analytic = -20 + (5 - -20) * Math.exp(-lambda * total);
    for (const r of results) expect(r).toBeCloseTo(analytic, 9);
  });

  it('dt <= 0 或 lambda <= 0 时保持原值', () => {
    expect(damp(3, 10, 5, 0)).toBe(3);
    expect(damp(3, 10, 5, -1)).toBe(3);
    expect(damp(3, 10, 0, 0.5)).toBe(3);
  });

  it('长时间迭代单调收敛到目标', () => {
    let v = 0;
    for (let i = 0; i < 600; i++) v = damp(v, 42, 5, 1 / 60);
    expect(v).toBeCloseTo(42, 6);
  });
});

describe('dampAngleDeg 最短弧', () => {
  it('350° → 10° 应增大（跨 0° 走 +20°），而不是倒退', () => {
    const next = dampAngleDeg(350, 10, 5, 0.1);
    expect(next).toBeGreaterThan(350);
    expect(next).toBeLessThan(370);
  });

  it('10° → 350° 应减小（走 −20°）', () => {
    const next = dampAngleDeg(10, 350, 5, 0.1);
    expect(next).toBeLessThan(10);
    expect(next).toBeGreaterThan(-10);
  });

  it('迭代后收敛到目标角（最短弧距离趋于 0）', () => {
    let a = 350;
    for (let i = 0; i < 400; i++) a = dampAngleDeg(a, 10, 6, 1 / 60);
    // 未归一化：应收敛到 10 + 360 = 370，最短弧距离趋于 0
    expect(Math.abs(mod(a - 10 + 180, 360) - 180)).toBeLessThan(1e-6);
    expect(a).toBeCloseTo(370, 6);
  });

  it('同角不动，dt<=0 保持原值', () => {
    expect(dampAngleDeg(123, 123, 5, 0.1)).toBeCloseTo(123, 12);
    expect(dampAngleDeg(123, 45, 5, 0)).toBe(123);
  });

  it('180° 对角差不会来回抖动（步长有界）', () => {
    const next = dampAngleDeg(0, 180, 5, 0.1);
    expect(Math.abs(next)).toBeLessThanOrEqual(180);
  });
});

describe('mod 负数', () => {
  it('负被除数返回非负余数', () => {
    expect(mod(-1, 360)).toBe(359);
    expect(mod(-370, 360)).toBe(350);
    expect(mod(-720, 360)).toBe(0);
    expect(mod(5, 360)).toBe(5);
    expect(mod(360, 360)).toBe(0);
    expect(mod(725, 360)).toBe(5);
  });

  it('小数与非 360 的模同样非负', () => {
    expect(mod(-0.25, 1)).toBeCloseTo(0.75, 12);
    expect(mod(-7, 3)).toBe(2);
    for (let n = -50; n <= 50; n += 0.5) {
      const r = mod(n, 7);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(7);
    }
  });
});

describe('catmullRom', () => {
  it('过 p1 与 p2', () => {
    expect(catmullRom(0, 1, 2, 3, 0)).toBeCloseTo(1, 12);
    expect(catmullRom(0, 1, 2, 3, 1)).toBeCloseTo(2, 12);
  });

  it('等距共线控制点退化为线性插值', () => {
    for (let t = 0; t <= 1.0001; t += 0.1) {
      expect(catmullRom(0, 1, 2, 3, t)).toBeCloseTo(1 + t, 12);
    }
  });

  it('单调控制点下曲线在区间内单调', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 50; i++) {
      const v = catmullRom(0, 2, 5, 9, i / 50);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('悬链线：solveCatenaryA 精度', () => {
  const cases = [
    { halfSpan: 260, sag: 58 },   // 大桥主跨 520m / 垂度 58m（桥梁模块实际参数）
    { halfSpan: 100, sag: 1 },    // 极平缓
    { halfSpan: 100, sag: 0.001 },// sag 极小
    { halfSpan: 50, sag: 50 },    // sag = halfSpan
    { halfSpan: 30, sag: 90 },    // sag 远大于 halfSpan（几乎垂落）
    { halfSpan: 12, sag: 240 },   // sag 极大
    { halfSpan: 1e-3, sag: 1e-4 } // 微小尺度
  ];

  it('解代回原方程 a*(cosh(halfSpan/a)-1)=sag 残差 < 1e-6', () => {
    for (const { halfSpan, sag } of cases) {
      const a = solveCatenaryA(halfSpan, sag);
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBeGreaterThan(0);
      // 契约要求：解代回原式残差 < 1e-6
      const back = a * (Math.cosh(halfSpan / a) - 1);
      expect(Math.abs(back - sag)).toBeLessThan(1e-6);
      // 用数值稳定的等价形式 2a·sinh²(u/2) 复核相对残差（naive 的 cosh(u)-1 在 u≪1 时
      // 自身就有 ~eps/u² 的抵消误差，会掩盖求解器的真实精度）
      const u = halfSpan / a;
      const sh = Math.sinh(u / 2);
      expect(Math.abs(2 * a * sh * sh - sag) / sag).toBeLessThan(1e-9);
    }
  });

  it('catenaryY 用求得的 a 在端点复现 sag', () => {
    for (const { halfSpan, sag } of cases) {
      const a = solveCatenaryA(halfSpan, sag);
      expect(catenaryY(halfSpan, a)).toBeCloseTo(sag, 9);
      expect(catenaryY(-halfSpan, a)).toBeCloseTo(sag, 9);
      expect(catenaryY(0, a)).toBe(0);
    }
  });

  it('a 略大于抛物线近似 halfSpan²/(2·sag)，且垂度越大 a 越小', () => {
    const halfSpan = 260;
    const a = solveCatenaryA(halfSpan, 58);
    const parabola = (halfSpan * halfSpan) / (2 * 58);
    expect(a).toBeGreaterThan(parabola);
    expect(a / parabola).toBeLessThan(1.2);

    let prev = Infinity;
    for (const sag of [1, 5, 20, 58, 120, 300]) {
      const cur = solveCatenaryA(halfSpan, sag);
      expect(cur).toBeLessThan(prev);
      prev = cur;
    }
  });

  it('退化输入安全（除零保护）：sag<=0 或 halfSpan<=0 返回 Infinity，且下游函数不产生 NaN', () => {
    for (const a of [
      solveCatenaryA(100, 0),
      solveCatenaryA(100, -5),
      solveCatenaryA(0, 10),
      solveCatenaryA(NaN, 10),
      solveCatenaryA(100, NaN)
    ]) {
      expect(a).toBe(Number.POSITIVE_INFINITY);
      expect(catenaryY(50, a)).toBe(0);
      expect(catenaryLength(100, a)).toBe(200);
    }
  });

  it('少量迭代次数下也已收敛（牛顿二次收敛）', () => {
    const full = solveCatenaryA(260, 58, 60);
    const few = solveCatenaryA(260, 58, 8);
    expect(Math.abs(full - few)).toBeLessThan(1e-9);
  });
});

describe('悬链线：catenaryPoints', () => {
  it('端点垂度等于 sag、中点为 0、x 覆盖 ±span/2', () => {
    const span = 520;
    const sag = 58;
    const pts = catenaryPoints(span, sag, 41);
    expect(pts).toHaveLength(41);
    expect(pts[0].x).toBeCloseTo(-span / 2, 9);
    expect(pts[40].x).toBeCloseTo(span / 2, 9);
    expect(pts[0].y).toBeCloseTo(sag, 9);
    expect(pts[40].y).toBeCloseTo(sag, 9);
    expect(pts[20].x).toBe(0);
    expect(pts[20].y).toBe(0);
  });

  it('左右对称，且右半支单调递增（最低点在中间）', () => {
    const pts = catenaryPoints(400, 30, 33);
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      expect(pts[i].y).toBeCloseTo(pts[n - 1 - i].y, 9);
      expect(pts[i].y).toBeGreaterThanOrEqual(-1e-12);
    }
    for (let i = Math.floor(n / 2); i < n - 1; i++) {
      expect(pts[i + 1].y).toBeGreaterThan(pts[i].y);
    }
  });

  it('采样点严格落在悬链线上（与解析式一致）', () => {
    const span = 520;
    const sag = 58;
    const a = solveCatenaryA(span / 2, sag);
    const pts = catenaryPoints(span, sag, 25);
    for (const p of pts) {
      expect(p.y).toBeCloseTo(a * Math.cosh(p.x / a) - a, 6);
    }
  });

  it('count 非法时退化为 2 点，sag<=0 时全为 0（直线）', () => {
    expect(catenaryPoints(100, 10, 1)).toHaveLength(2);
    expect(catenaryPoints(100, 10, 0)).toHaveLength(2);
    const flat = catenaryPoints(100, 0, 5);
    expect(flat).toHaveLength(5);
    for (const p of flat) expect(p.y).toBe(0);
  });
});

describe('悬链线：catenaryLength', () => {
  it('弧长大于弦长', () => {
    const halfSpan = 260;
    const a = solveCatenaryA(halfSpan, 58);
    const len = catenaryLength(halfSpan, a);
    expect(len).toBeGreaterThan(2 * halfSpan);
    expect(len).toBeLessThan(2 * halfSpan * 1.5);
  });

  it('与折线数值积分一致（1e-3 相对精度）', () => {
    const span = 520;
    const sag = 58;
    const a = solveCatenaryA(span / 2, sag);
    const pts = catenaryPoints(span, sag, 4001);
    let poly = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      poly += Math.hypot(dx, dy);
    }
    const len = catenaryLength(span / 2, a);
    expect(Math.abs(len - poly) / len).toBeLessThan(1e-3);
  });

  it('垂度越大弧长越长', () => {
    const halfSpan = 260;
    let prev = 0;
    for (const sag of [1, 10, 58, 150]) {
      const len = catenaryLength(halfSpan, solveCatenaryA(halfSpan, sag));
      expect(len).toBeGreaterThan(prev);
      prev = len;
    }
  });
});
