import { describe, expect, it } from 'vitest';
import { createTrack } from '../src/sim/track.js';
import { createKart } from '../src/sim/kart.js';
import { createAiController } from '../src/sim/ai.js';

describe('ai 控制器', () => {
  const track = createTrack();
  const control = createAiController(track);

  it('沿切线方向行驶时基本不打方向、全油门', () => {
    const p = track.points[0];
    const kart = createKart({ x: p.x, z: p.z, heading: track.headingAt(0) });
    const input = control(kart);
    expect(Math.abs(input.steer)).toBeLessThan(0.4);
    expect(input.throttle).toBe(1);
  });

  it('目标在左侧时输出左转（steer > 0）', () => {
    const p = track.points[0];
    // 车头相对切线向右偏，AI 应往左修正。
    const kart = createKart({ x: p.x, z: p.z, heading: track.headingAt(0) - 0.5 });
    expect(control(kart).steer).toBeGreaterThan(0);
  });

  it('车头偏差很大时收油', () => {
    const p = track.points[0];
    const kart = createKart({ x: p.x, z: p.z, heading: track.headingAt(0) + 2.5 });
    expect(control(kart).throttle).toBeLessThan(1);
  });
});
