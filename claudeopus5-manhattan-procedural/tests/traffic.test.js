/**
 * @file tests/traffic.test.js
 * @description `src/sim/traffic.js` 的单元测试（契约 §6.1 / §10）。
 *
 * 覆盖三块：
 * 1. **IDM 跟车模型**：自由流收敛、静止起步、前车极近时强制动、s* 公式逐项复核、单调性；
 * 2. **信号相位机**：四相时长、周期性、南北与东西**不同时为绿**（安全性断言）、
 *    不同相位偏移错峰、绿波偏移的相位不变性；
 * 3. **系统句柄轻量集成**：用真实 `CityPlan` 建仿真、推进若干帧，验证车辆有限、在城市范围内、
 *    确实在动，并且 `dispose()` 能彻底清场（不创建 WebGLRenderer，符合契约 §10）。
 */

import { describe, it, expect } from 'vitest';

import {
  idmAcceleration,
  signalStateAt,
  phaseOffsetForZ,
  createTraffic,
  IDM_DEFAULTS,
  SIGNAL_TIMING,
  SIGNAL_CYCLE,
  GREEN_WAVE_SPEED
} from '../src/sim/traffic.js';
import { buildCityPlan } from '../src/city/grid.js';
import { makeRng } from '../src/core/rng.js';
import { createEnvUniforms } from '../src/render/shaderpatch.js';

/** 契约 §6.1 规定的 IDM 标定参数。 */
const P = { aMax: 1.6, b: 2.2, delta: 4, s0: 2.5, T: 1.4 };

/**
 * 参考实现：直接照公式算一遍，用于交叉验证被测函数。
 * a = aMax·[1 − (v/v0)^δ − (s* / s)²]，s* = s0 + max(0, v·T + v·Δv/(2√(aMax·b)))
 * @param {number} v 车速
 * @param {number} v0 期望车速
 * @param {number} gap 净间距
 * @param {number} dv 速度差
 * @returns {number} 加速度
 */
function referenceIdm(v, v0, gap, dv) {
  const sStar = P.s0 + Math.max(0, v * P.T + (v * dv) / (2 * Math.sqrt(P.aMax * P.b)));
  return P.aMax * (1 - Math.pow(v / v0, P.delta) - Math.pow(sStar / gap, 2));
}

describe('IDM 参数与导出', () => {
  it('标定参数与契约 §6.1 一致', () => {
    expect(IDM_DEFAULTS.aMax).toBe(1.6);
    expect(IDM_DEFAULTS.b).toBe(2.2);
    expect(IDM_DEFAULTS.delta).toBe(4);
    expect(IDM_DEFAULTS.s0).toBe(2.5);
    expect(IDM_DEFAULTS.T).toBe(1.4);
    expect(IDM_DEFAULTS.v0).toBeCloseTo(13.4, 10);
  });

  it('必需的导出都在', () => {
    expect(typeof idmAcceleration).toBe('function');
    expect(typeof signalStateAt).toBe('function');
    expect(typeof createTraffic).toBe('function');
  });
});

describe('IDM · 自由流（无前车）', () => {
  it('v = v0 时加速度为 0', () => {
    expect(idmAcceleration({ v: 13.4, v0: 13.4 })).toBeCloseTo(0, 12);
    expect(idmAcceleration({ v: 9, v0: 9, gap: Number.POSITIVE_INFINITY })).toBeCloseTo(0, 12);
  });

  it('v = 0 时以最大加速度起步', () => {
    expect(idmAcceleration({ v: 0, v0: 13.4 })).toBeCloseTo(P.aMax, 12);
  });

  it('v → v0 时加速度单调趋近 0（且始终为正）', () => {
    const v0 = 13.4;
    let prev = Number.POSITIVE_INFINITY;
    for (const v of [0, 4, 8, 11, 12.5, 13.2, 13.39]) {
      const a = idmAcceleration({ v, v0 });
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThan(prev);
      prev = a;
    }
    expect(idmAcceleration({ v: 13.399, v0 })).toBeLessThan(1e-3);
  });

  it('超速时加速度为负（自由流减速回落到 v0）', () => {
    expect(idmAcceleration({ v: 18, v0: 13.4 })).toBeLessThan(0);
  });
});

describe('IDM · 跟车项 s* 与间距响应', () => {
  it('s* 公式逐项与参考实现一致', () => {
    const cases = [
      { v: 10, v0: 13.4, gap: 30, dv: 2 },
      { v: 6, v0: 9, gap: 12, dv: -1.5 },
      { v: 13.4, v0: 13.4, gap: 60, dv: 0 },
      { v: 2.5, v0: 9, gap: 8, dv: 2.5 }
    ];
    for (const c of cases) {
      const expected = referenceIdm(c.v, c.v0, c.gap, c.dv);
      expect(idmAcceleration({ ...c, ...P })).toBeCloseTo(expected, 10);
    }
  });

  it('静止前车（dv = v）时 s* = s0 + v·T + v²/(2√(aMax·b))', () => {
    const v = 10;
    const sStar = P.s0 + v * P.T + (v * v) / (2 * Math.sqrt(P.aMax * P.b));
    expect(sStar).toBeCloseTo(2.5 + 14 + 100 / (2 * Math.sqrt(3.52)), 10);
    // 令 gap 恰好等于 s*，此时交互项为 1
    const a = idmAcceleration({ v, v0: 13.4, gap: sStar, dv: v, ...P });
    expect(a).toBeCloseTo(P.aMax * (1 - Math.pow(v / 13.4, 4) - 1), 10);
  });

  it('前车极近时是强负加速度，并被夹在 −9 m/s²（0.9g）', () => {
    const a = idmAcceleration({ v: 12, v0: 13.4, gap: 0.2, dv: 12, ...P });
    expect(a).toBeLessThan(-5);
    expect(a).toBeGreaterThanOrEqual(-9);
    // gap 为 0 或负（已发生侵入）也不能返回 NaN/−Infinity
    expect(idmAcceleration({ v: 12, v0: 13.4, gap: 0, dv: 12 })).toBe(-9);
    expect(idmAcceleration({ v: 12, v0: 13.4, gap: -3, dv: 12 })).toBe(-9);
  });

  it('间距越小加速度越小（严格单调）', () => {
    let prev = Number.NEGATIVE_INFINITY;
    for (const gap of [12, 18, 25, 60, 200]) {
      const a = idmAcceleration({ v: 10, v0: 13.4, gap, dv: 3, ...P });
      expect(a).toBeGreaterThan(prev);
      prev = a;
    }
    // 间距足够大时退化为自由流
    expect(idmAcceleration({ v: 10, v0: 13.4, gap: 1e6, dv: 0, ...P })).toBeCloseTo(
      idmAcceleration({ v: 10, v0: 13.4 }),
      6
    );
  });

  it('前车更慢（正速差）比同速更保守', () => {
    const closing = idmAcceleration({ v: 12, v0: 13.4, gap: 20, dv: 6, ...P });
    const same = idmAcceleration({ v: 12, v0: 13.4, gap: 20, dv: 0, ...P });
    const opening = idmAcceleration({ v: 12, v0: 13.4, gap: 20, dv: -6, ...P });
    expect(closing).toBeLessThan(same);
    expect(same).toBeLessThan(opening);
  });

  it('雨雪天参数（T = 1.9）比干燥（T = 1.4）跟得更远', () => {
    const dry = idmAcceleration({ v: 11, v0: 13.4, gap: 25, dv: 1, ...P, T: 1.4 });
    const wet = idmAcceleration({ v: 11, v0: 13.4, gap: 25, dv: 1, ...P, T: 1.9 });
    expect(wet).toBeLessThan(dry);
  });
});

describe('信号相位机', () => {
  it('周期为 62s，四相时长 30 / 4 / 24 / 4', () => {
    expect(SIGNAL_CYCLE).toBe(62);
    expect(SIGNAL_TIMING.nsGreen).toBe(30);
    expect(SIGNAL_TIMING.nsYellow).toBe(4);
    expect(SIGNAL_TIMING.ewGreen).toBe(24);
    expect(SIGNAL_TIMING.ewYellow).toBe(4);
  });

  it('各相位的边界时刻正确', () => {
    expect(signalStateAt(0, 0)).toMatchObject({ ns: 'green', ew: 'red' });
    expect(signalStateAt(0, 29.999)).toMatchObject({ ns: 'green', ew: 'red' });
    expect(signalStateAt(0, 30)).toMatchObject({ ns: 'yellow', ew: 'red' });
    expect(signalStateAt(0, 33.999)).toMatchObject({ ns: 'yellow', ew: 'red' });
    expect(signalStateAt(0, 34)).toMatchObject({ ns: 'red', ew: 'green' });
    expect(signalStateAt(0, 57.999)).toMatchObject({ ns: 'red', ew: 'green' });
    expect(signalStateAt(0, 58)).toMatchObject({ ns: 'red', ew: 'yellow' });
    expect(signalStateAt(0, 61.999)).toMatchObject({ ns: 'red', ew: 'yellow' });
  });

  it('按 0.01s 步长统计出的四相时长与配时表一致', () => {
    const step = 0.01;
    const tally = { nsGreen: 0, nsYellow: 0, ewGreen: 0, ewYellow: 0 };
    for (let i = 0; i < SIGNAL_CYCLE / step; i++) {
      const st = signalStateAt(0, i * step);
      if (st.ns === 'green') tally.nsGreen += step;
      else if (st.ns === 'yellow') tally.nsYellow += step;
      else if (st.ew === 'green') tally.ewGreen += step;
      else tally.ewYellow += step;
    }
    expect(tally.nsGreen).toBeCloseTo(30, 6);
    expect(tally.nsYellow).toBeCloseTo(4, 6);
    expect(tally.ewGreen).toBeCloseTo(24, 6);
    expect(tally.ewYellow).toBeCloseTo(4, 6);
    // 绿灯总占比 = 54 / 62 ≈ 87%，通行效率合理
    expect((tally.nsGreen + tally.ewGreen) / SIGNAL_CYCLE).toBeCloseTo(54 / 62, 6);
  });

  it('严格周期循环，且负时刻同样成立', () => {
    /**
     * 只比较灯色与相位号（`cycleTime` 会带浮点尾差）。
     * @param {{ns: string, ew: string, phase: number}} st 状态
     * @returns {string} 归一化描述
     */
    const key = (st) => `${st.ns}|${st.ew}|${st.phase}`;
    for (let t = 0; t < 62; t += 0.37) {
      const a = key(signalStateAt(3.5, t));
      expect(key(signalStateAt(3.5, t + SIGNAL_CYCLE * 3))).toBe(a);
      expect(key(signalStateAt(3.5, t - SIGNAL_CYCLE * 2))).toBe(a);
    }
    // 相位偏移本身也按周期归一
    expect(key(signalStateAt(5, 12))).toBe(key(signalStateAt(5 + SIGNAL_CYCLE, 12)));
  });

  it('安全性：任意时刻南北与东西都不同时为绿（也不同时为黄）', () => {
    for (const offset of [0, 7.3, 21, 45.5, -13.2, 1000]) {
      for (let t = 0; t < 200; t += 0.05) {
        const st = signalStateAt(offset, t);
        expect(st.ns === 'green' && st.ew === 'green').toBe(false);
        expect(st.ns === 'yellow' && st.ew === 'yellow').toBe(false);
        // 黄灯期间对向必须是红
        if (st.ns === 'yellow') expect(st.ew).toBe('red');
        if (st.ew === 'yellow') expect(st.ns).toBe('red');
      }
    }
  });

  it('不同相位偏移形成错峰（不会全城同步）', () => {
    let differs = 0;
    for (let t = 0; t < SIGNAL_CYCLE; t += 0.5) {
      if (signalStateAt(0, t).ns !== signalStateAt(17, t).ns) differs++;
    }
    expect(differs).toBeGreaterThan(20);
    // 偏移相差整周期则完全同步
    for (let t = 0; t < SIGNAL_CYCLE; t += 0.5) {
      expect(signalStateAt(0, t).phase).toBe(signalStateAt(SIGNAL_CYCLE, t).phase);
    }
  });

  it('绿波：以设计车速沿 +Z 行驶时看到的相位恒定', () => {
    const z0 = -1200;
    const t0 = 6;
    const base = signalStateAt(phaseOffsetForZ(z0), t0);
    for (let k = 1; k <= 12; k++) {
      const z = z0 + k * 80; // 每 80m 一条横街
      const t = t0 + (z - z0) / GREEN_WAVE_SPEED;
      expect(signalStateAt(phaseOffsetForZ(z), t).phase).toBe(base.phase);
    }
  });

  it('phaseOffsetForZ 落在 [0, 62) 内且随 z 线性错开', () => {
    for (const z of [-2400, -800, 0, 137.5, 2400]) {
      const o = phaseOffsetForZ(z);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThan(SIGNAL_CYCLE);
    }
    expect(phaseOffsetForZ(GREEN_WAVE_SPEED * 10)).toBeCloseTo(10, 10);
  });
});

describe('createTraffic 系统句柄（轻量集成，不涉及 WebGL 渲染）', () => {
  const plan = buildCityPlan('traffic-test');
  const ctx0 = {
    plan,
    rng: makeRng('traffic-test', 'city'),
    env: createEnvUniforms(),
    quality: 'low',
    seed: 'traffic-test'
  };

  it('句柄形状符合契约 §1 / §6.1', () => {
    const h = createTraffic(ctx0);
    expect(h.object3D.name).toBe('traffic');
    expect(typeof h.update).toBe('function');
    expect(typeof h.dispose).toBe('function');
    expect(h.stats.cars).toBe(90); // low 画质 90 辆
    expect(h.stats.instances).toBeGreaterThan(h.stats.cars);
    // 5 类车各一个 InstancedMesh + 1 个车灯 InstancedMesh = 6 个 drawcall
    expect(h.object3D.children.length).toBe(6);
    h.dispose();
  });

  it('推进 300 帧后车辆位置有限、位于城市范围内且确实在移动', () => {
    const h = createTraffic(ctx0);
    const ctx = { dt: 1 / 60, nightFactor: 0.8, weather: { params: { rainIntensity: 0 } } };

    /**
     * 读出全部车辆的 (x, z)。
     * @returns {Array<[number, number]>} 位置数组
     */
    const sample = () => {
      const out = [];
      for (const mesh of h.object3D.children) {
        if (!mesh.isInstancedMesh || mesh.name === 'traffic-lights') continue;
        const e = mesh.instanceMatrix.array;
        for (let i = 0; i < mesh.count; i++) out.push([e[i * 16 + 12], e[i * 16 + 14]]);
      }
      return out;
    };

    for (let f = 0; f < 300; f++) h.update(ctx);
    const before = sample();
    for (let f = 0; f < 120; f++) h.update(ctx);
    const after = sample();

    expect(before.length).toBe(90);
    let movedFar = 0;
    for (let i = 0; i < before.length; i++) {
      for (const p of [before[i], after[i]]) {
        expect(Number.isFinite(p[0])).toBe(true);
        expect(Number.isFinite(p[1])).toBe(true);
        expect(Math.abs(p[0])).toBeLessThanOrEqual(760);
        expect(Math.abs(p[1])).toBeLessThanOrEqual(2460);
      }
      if (Math.hypot(after[i][0] - before[i][0], after[i][1] - before[i][1]) > 5) movedFar++;
    }
    // 2 秒内多数车辆应当跑出 5m 以上（其余在红灯前排队）
    expect(movedFar).toBeGreaterThan(before.length * 0.5);
    h.dispose();
  });

  it('雨天降低车速（v₀ ×0.75）', () => {
    /**
     * 跑一段时间后统计 1 秒位移之和。
     * @param {number} rain 雨强 0..1
     * @returns {number} 全部车辆 1 秒位移之和（米）
     */
    const travel = (rain) => {
      const h = createTraffic(ctx0);
      const ctx = { dt: 1 / 60, nightFactor: 0, weather: { params: { rainIntensity: rain } } };
      for (let f = 0; f < 900; f++) h.update(ctx);
      const read = () => {
        const out = [];
        for (const mesh of h.object3D.children) {
          if (!mesh.isInstancedMesh || mesh.name === 'traffic-lights') continue;
          const e = mesh.instanceMatrix.array;
          for (let i = 0; i < mesh.count; i++) out.push([e[i * 16 + 12], e[i * 16 + 14]]);
        }
        return out;
      };
      const a = read();
      for (let f = 0; f < 60; f++) h.update(ctx);
      const b = read();
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += Math.hypot(b[i][0] - a[i][0], b[i][1] - a[i][1]);
      h.dispose();
      return sum;
    };
    expect(travel(1)).toBeLessThan(travel(0) * 0.95);
  });

  it('夜间才显示车灯（nightFactor > 0.25）', () => {
    const h = createTraffic(ctx0);
    const glow = h.object3D.children.find((c) => c.name === 'traffic-lights');
    h.update({ dt: 1 / 60, nightFactor: 0.1, weather: { params: {} } });
    expect(glow.visible).toBe(false);
    h.update({ dt: 1 / 60, nightFactor: 0.9, weather: { params: {} } });
    expect(glow.visible).toBe(true);
    h.dispose();
  });

  it('灯色只在变化时回调，且南北/东西不会同时为绿', () => {
    const calls = [];
    const h = createTraffic({
      ...ctx0,
      signalSlots: plan.intersections.map((ix) => ({
        x: ix.x,
        z: ix.z,
        angleDeg: 0,
        intersectionId: ix.id
      })),
      setSignalColor: (id, axis, color) => calls.push([id, axis, color])
    });
    const initial = calls.length;
    expect(initial).toBeGreaterThan(0);

    const ctx = { dt: 1 / 60, nightFactor: 0, weather: { params: {} } };
    for (let f = 0; f < 30; f++) h.update(ctx); // 0.5s：远小于最短相位 4s
    // 半秒内变化极少，绝不可能每帧每路口都回调
    expect(calls.length - initial).toBeLessThan(plan.intersections.length);

    const id = plan.intersections[0].id;
    const ns = h.signalColorFor(id, 'ns');
    const ew = h.signalColorFor(id, 'ew');
    expect(['green', 'yellow', 'red']).toContain(ns);
    expect(ns === 'green' && ew === 'green').toBe(false);
    h.dispose();
  });

  it('dispose() 清空场景节点，可重复调用', () => {
    const h = createTraffic(ctx0);
    expect(h.object3D.children.length).toBe(6);
    h.dispose();
    expect(h.object3D.children.length).toBe(0);
    expect(() => h.dispose()).not.toThrow();
  });
});
