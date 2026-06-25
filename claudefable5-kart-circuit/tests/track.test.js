import { describe, expect, it } from 'vitest';
import { createTrack, isOnTrack, DEFAULT_CONTROL_POINTS } from '../src/sim/track.js';

describe('track', () => {
  const track = createTrack();

  it('按控制点 × 每段采样数生成闭合采样', () => {
    expect(track.points.length).toBe(DEFAULT_CONTROL_POINTS.length * 14);
    expect(track.total).toBeGreaterThan(0);
    expect(track.cumulative[0]).toBe(0);
    expect(track.cumulative.at(-1)).toBeLessThan(track.total);
  });

  it('pointAt 在 0 和 total 处都回到起点（闭合）', () => {
    const a = track.pointAt(0);
    const b = track.pointAt(track.total);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
    expect(a.x).toBeCloseTo(track.points[0].x, 6);
  });

  it('pointAt 里程递增时沿赛道前进', () => {
    const a = track.pointAt(10);
    const b = track.pointAt(20);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(10, 0);
  });

  it('nearest 能找回采样点本身', () => {
    const p = track.points[25];
    const near = track.nearest(p.x, p.z);
    expect(near.index).toBe(25);
    expect(near.dist).toBeLessThan(1e-9);
    expect(near.s).toBeCloseTo(track.cumulative[25], 9);
  });

  it('isOnTrack 在中心线为真、远离赛道为假', () => {
    const p = track.points[40];
    expect(isOnTrack(track, p.x, p.z)).toBe(true);
    expect(isOnTrack(track, p.x + 500, p.z + 500)).toBe(false);
  });

  it('headingAt 与切线方向一致', () => {
    const d = track.directionAt(0);
    const h = track.headingAt(0);
    expect(Math.sin(h)).toBeCloseTo(d.x, 9);
    expect(Math.cos(h)).toBeCloseTo(d.z, 9);
  });
});
