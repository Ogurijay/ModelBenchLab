import { describe, expect, it } from 'vitest';
import {
  KART_LIMITS,
  createKartState,
  getInputVector,
  integrateKart,
  isInsideTrackBand
} from '../src/simulation/kart.js';

describe('kart simulation', () => {
  it('accelerates the kart forward and clamps max speed', () => {
    let state = createKartState({ x: 0, z: 0, heading: 0 });

    for (let i = 0; i < 180; i += 1) {
      state = integrateKart(state, { throttle: 1, brake: 0, steer: 0, drift: false }, 1 / 60, {
        trackDistance: 0
      });
    }

    expect(state.speed).toBeGreaterThan(20);
    expect(state.speed).toBeLessThanOrEqual(KART_LIMITS.maxForwardSpeed);
    expect(state.z).toBeLessThan(-35);
  });

  it('turns faster while drifting but keeps the kart controllable', () => {
    const base = createKartState({ speed: 20, heading: 0 });

    const normal = integrateKart(base, { throttle: 1, brake: 0, steer: 1, drift: false }, 0.5, {
      trackDistance: 0
    });
    const drifting = integrateKart(base, { throttle: 1, brake: 0, steer: 1, drift: true }, 0.5, {
      trackDistance: 0
    });

    expect(drifting.heading).toBeGreaterThan(normal.heading);
    expect(drifting.speed).toBeLessThan(normal.speed);
    expect(drifting.driftCharge).toBeGreaterThan(0);
  });

  it('converts a charged drift release into a short mini turbo', () => {
    const charged = createKartState({ speed: 22, heading: 0, driftCharge: 1 });

    const released = integrateKart(charged, { throttle: 1, brake: 0, steer: 0, drift: false }, 1 / 60, {
      trackDistance: 0,
      signedTrackDistance: 0
    });

    expect(released.boostTime).toBeGreaterThan(0.45);
    expect(released.driftCharge).toBe(0);
    expect(released.event).toBe('mini-turbo');
  });

  it('slows the kart when it is far outside the road band', () => {
    const base = createKartState({ speed: 24, heading: 0 });

    const offroad = integrateKart(base, { throttle: 1, brake: 0, steer: 0, drift: false }, 1, {
      trackDistance: 10
    });

    expect(offroad.speed).toBeLessThan(17);
    expect(isInsideTrackBand(4.9)).toBe(true);
    expect(isInsideTrackBand(9.1)).toBe(false);
  });

  it('pushes the kart back from the barrier and preserves the side of the road', () => {
    const base = createKartState({ x: 18, z: 0, speed: 28, heading: Math.PI / 2 });

    const bounced = integrateKart(base, { throttle: 1, brake: 0, steer: 0, drift: false }, 0.2, {
      trackDistance: 8.4,
      signedTrackDistance: 8.4,
      nearestPoint: { x: 10, z: 0 },
      normal: { x: 1, z: 0 }
    });

    expect(bounced.x).toBeLessThanOrEqual(18.35);
    expect(bounced.speed).toBeLessThan(16);
    expect(bounced.event).toBe('barrier-hit');
  });

  it('maps keyboard state to stable drive inputs', () => {
    const input = getInputVector({
      KeyW: true,
      ArrowLeft: true,
      Space: true
    });

    expect(input).toEqual({
      throttle: 1,
      brake: 0,
      steer: -1,
      drift: true
    });
  });
});
