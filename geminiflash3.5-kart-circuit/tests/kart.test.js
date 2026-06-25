import { describe, expect, it } from 'vitest';
import {
  createKartState,
  getKartInput,
  integrateKart,
  KART_PHYSICS
} from '../src/simulation/kart.js';

describe('Hoverkart Physics integration', () => {
  it('accelerates forward on throttle and respects standard max speed limit', () => {
    let state = createKartState({ speed: 0 });
    const input = { throttle: 1, brake: 0, steer: 0, drift: false };

    // 运行约 3.0 秒的加速 (以 1/60 秒为步长运行 180 步)
    for (let i = 0; i < 180; i++) {
      state = integrateKart(state, input, 1 / 60);
    }

    expect(state.speed).toBeGreaterThan(25.0);
    expect(state.speed).toBeLessThanOrEqual(KART_PHYSICS.maxForwardSpeed);
  });

  it('slows down when offroad (outside track) and respects offroad max speed limit', () => {
    let state = createKartState({ speed: 30.0 });
    const input = { throttle: 1, brake: 0, steer: 0, drift: false };
    
    // 环境参数传入 isOffroad = true
    const env = { isOffroad: true };

    for (let i = 0; i < 120; i++) {
      state = integrateKart(state, input, 1 / 60, env);
    }

    // 在出界且没有 Boost 的情况下，速度必须被限制到极速以下
    expect(state.speed).toBeLessThanOrEqual(KART_PHYSICS.offroadMaxSpeed + 0.1);
  });

  it('gathers drift charge and triggers boost on release', () => {
    let state = createKartState({ speed: 20.0 });
    
    // 1. 模拟漂移：长按 Space，带方向盘 steer
    const inputDrift = { throttle: 1, brake: 0, steer: 1.0, drift: true };
    
    for (let i = 0; i < 60; i++) {
      state = integrateKart(state, inputDrift, 1 / 60);
    }

    expect(state.wasDrifting).toBe(true);
    expect(state.driftCharge).toBeGreaterThan(0.2);
    expect(state.driftLevel).toBeGreaterThan(0);
    expect(state.slipAngle).toBeLessThan(0); // 向右拐漂移侧偏角为负

    // 2. 释放漂移：Space 释放为 false
    const inputRelease = { throttle: 1, brake: 0, steer: 0, drift: false };
    state = integrateKart(state, inputRelease, 1 / 60);

    expect(state.driftCharge).toBe(0);
    expect(state.driftLevel).toBe(0);
    expect(state.boostTime).toBeGreaterThan(0); // 成功触发 Boost
    expect(state.speed).toBeGreaterThanOrEqual(37.9); // 瞬间爆发出高速
  });

  it('correctly maps keyboard object to driving input vectors', () => {
    const input = getKartInput({
      KeyW: true,
      ArrowRight: true,
      Space: true
    });

    expect(input).toEqual({
      throttle: 1,
      brake: 0,
      steer: 1,
      drift: true
    });
  });
});
