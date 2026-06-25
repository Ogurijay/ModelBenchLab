import { describe, expect, it } from 'vitest';
import { createKart, stepKart, applyBoost, KART_DEFAULTS } from '../src/sim/kart.js';

const DT = 1 / 60;

function run(kart, input, seconds, env) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) stepKart(kart, input, DT, env);
  return kart;
}

describe('kart 纵向物理', () => {
  it('全油门加速并收敛到最高速度', () => {
    const kart = createKart();
    run(kart, { throttle: 1 }, 0.5);
    expect(kart.speed).toBeGreaterThan(5);
    run(kart, { throttle: 1 }, 5);
    expect(kart.speed).toBeCloseTo(KART_DEFAULTS.maxSpeed, 5);
  });

  it('刹车可倒车且倒车速度有上限', () => {
    const kart = createKart();
    run(kart, { throttle: -1 }, 4);
    expect(kart.speed).toBeCloseTo(KART_DEFAULTS.maxReverseSpeed, 5);
  });

  it('松油门时滑行减速到 0', () => {
    const kart = createKart();
    kart.speed = 20;
    run(kart, {}, 5);
    expect(kart.speed).toBe(0);
  });

  it('越界时速度被压到草地上限', () => {
    const kart = createKart();
    kart.speed = KART_DEFAULTS.maxSpeed;
    run(kart, { throttle: 1 }, 3, { onTrack: false });
    expect(kart.speed).toBeCloseTo(KART_DEFAULTS.offTrackMaxSpeed, 5);
  });

  it('boost 期间可超过常规最高速度并随计时结束衰减', () => {
    const kart = createKart();
    kart.speed = KART_DEFAULTS.maxSpeed;
    applyBoost(kart, 1.0);
    run(kart, { throttle: 1 }, 0.5);
    expect(kart.speed).toBeGreaterThan(KART_DEFAULTS.maxSpeed);
    run(kart, { throttle: 1 }, 3);
    expect(kart.speed).toBeCloseTo(KART_DEFAULTS.maxSpeed, 5);
  });
});

describe('kart 转向', () => {
  it('前进时 steer=+1 使朝向增大（左转）', () => {
    const kart = createKart();
    kart.speed = 20;
    run(kart, { throttle: 1, steer: 1 }, 0.5);
    expect(kart.heading).toBeGreaterThan(0);
  });

  it('静止时无法转向', () => {
    const kart = createKart();
    run(kart, { steer: 1 }, 1);
    expect(kart.heading).toBe(0);
  });

  it('倒车时转向反向', () => {
    const kart = createKart();
    kart.speed = -6;
    stepKart(kart, { throttle: -1, steer: 1 }, DT);
    expect(kart.heading).toBeLessThan(0);
  });
});

describe('kart 漂移与迷你涡轮', () => {
  it('高速 + 转向 + 漂移键进入漂移并蓄力', () => {
    const kart = createKart();
    kart.speed = 25;
    run(kart, { throttle: 1, steer: 1, drift: true }, 1.2);
    expect(kart.drifting).toBe(true);
    expect(kart.driftDir).toBe(1);
    expect(kart.driftCharge).toBeGreaterThan(1.0);
  });

  it('低速时不会进入漂移', () => {
    const kart = createKart();
    kart.speed = 5;
    stepKart(kart, { throttle: 1, steer: 1, drift: true }, DT);
    expect(kart.drifting).toBe(false);
  });

  it('一档蓄力松开后获得短 boost', () => {
    const kart = createKart();
    kart.speed = 25;
    run(kart, { throttle: 1, steer: 1, drift: true }, 1.2);
    stepKart(kart, { throttle: 1, steer: 1, drift: false }, DT);
    expect(kart.drifting).toBe(false);
    expect(kart.boostTimer).toBeGreaterThan(0);
    expect(kart.boostTimer).toBeLessThanOrEqual(KART_DEFAULTS.miniTurbo[0].duration);
  });

  it('二档蓄力的 boost 比一档更久', () => {
    const tier1 = createKart();
    tier1.speed = 25;
    run(tier1, { throttle: 1, steer: 1, drift: true }, 1.2);
    stepKart(tier1, { throttle: 1, drift: false }, DT);

    const tier2 = createKart();
    tier2.speed = 25;
    run(tier2, { throttle: 1, steer: 1, drift: true }, 2.4);
    stepKart(tier2, { throttle: 1, drift: false }, DT);

    expect(tier2.boostTimer).toBeGreaterThan(tier1.boostTimer);
  });

  it('蓄力不足时松开漂移不给 boost', () => {
    const kart = createKart();
    kart.speed = 25;
    run(kart, { throttle: 1, steer: 1, drift: true }, 0.4);
    stepKart(kart, { throttle: 1, drift: false }, DT);
    expect(kart.boostTimer).toBe(0);
  });
});
