import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_PRESETS } from '../src/environment/presets.js';
import {
  applyStormOverlay,
  createStormState,
  setStormEnabled,
  stepStormState
} from '../src/weather/storm.js';

describe('storm overlay', () => {
  it('starts disabled and reaches full intensity smoothly', () => {
    const initial = createStormState();
    const enabled = setStormEnabled(initial, true, 2.4);
    const halfway = stepStormState(enabled, 1.2);
    const complete = stepStormState(halfway, 1.2);

    expect(initial).toMatchObject({ enabled: false, intensity: 0 });
    expect(halfway.intensity).toBeGreaterThan(0);
    expect(halfway.intensity).toBeLessThan(1);
    expect(complete).toMatchObject({ enabled: true, intensity: 1, progress: 1 });
  });

  it('fades back to zero without jumping', () => {
    const full = stepStormState(setStormEnabled(createStormState(), true, 1), 1);
    const disabling = setStormEnabled(full, false, 2.4);
    const halfway = stepStormState(disabling, 1.2);
    const complete = stepStormState(halfway, 1.2);

    expect(halfway.intensity).toBeGreaterThan(0);
    expect(halfway.intensity).toBeLessThan(1);
    expect(complete).toMatchObject({ enabled: false, intensity: 0, progress: 1 });
  });

  it('derives a darker storm environment without mutating the base preset', () => {
    const base = ENVIRONMENT_PRESETS.noon;
    const snapshot = JSON.stringify(base);
    const storm = applyStormOverlay(base, 1);

    expect(JSON.stringify(base)).toBe(snapshot);
    expect(storm.sunIntensity).toBeLessThan(base.sunIntensity);
    expect(storm.fogDensity).toBeGreaterThan(base.fogDensity);
    expect(storm.cloudAmount).toBeGreaterThan(base.cloudAmount);
    expect(storm.exposure).toBeLessThan(base.exposure);
  });

  it('returns finite environment values at partial intensity', () => {
    const environment = applyStormOverlay(ENVIRONMENT_PRESETS.dawn, 0.43);
    const numbers = Object.values(environment).flatMap((value) =>
      Array.isArray(value) ? value : typeof value === 'number' ? [value] : []
    );

    expect(numbers.every(Number.isFinite)).toBe(true);
  });
});
