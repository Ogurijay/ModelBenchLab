import { describe, expect, it } from 'vitest';
import {
  ENVIRONMENT_PRESETS,
  PRESET_ORDER,
  createPresetTransition,
  selectPreset,
  stepPresetTransition
} from '../src/environment/presets.js';

const requiredFields = [
  'skyZenith',
  'skyHorizon',
  'cloudColor',
  'deepColor',
  'shallowColor',
  'foamColor',
  'sunColor',
  'sunDirection',
  'sunIntensity',
  'exposure',
  'roughness',
  'fogDensity',
  'cloudAmount'
];

describe('environment presets', () => {
  it('defines complete noon, dawn, and overcast presets', () => {
    expect(PRESET_ORDER).toEqual(['noon', 'dawn', 'overcast']);
    for (const id of PRESET_ORDER) {
      expect(Object.keys(ENVIRONMENT_PRESETS[id])).toEqual(
        expect.arrayContaining(requiredFields)
      );
    }
  });

  it('moves continuously to the selected preset and finishes exactly', () => {
    const initial = createPresetTransition('noon');
    const selected = selectPreset(initial, 'dawn', 1.8);
    const halfway = stepPresetTransition(selected, 0.9);
    const finished = stepPresetTransition(halfway, 0.9);

    expect(halfway.progress).toBeCloseTo(0.5, 6);
    expect(halfway.current.exposure).toBeGreaterThan(0);
    expect(finished.progress).toBe(1);
    expect(finished.current).toEqual(ENVIRONMENT_PRESETS.dawn);
    expect(finished.activeId).toBe('dawn');
  });

  it('normalizes the interpolated sun direction', () => {
    const transition = selectPreset(createPresetTransition('noon'), 'dawn', 1.8);
    const { sunDirection } = stepPresetTransition(transition, 0.6).current;

    expect(Math.hypot(...sunDirection)).toBeCloseTo(1, 8);
  });

  it('rejects an unknown preset id', () => {
    expect(() => selectPreset(createPresetTransition(), 'night')).toThrow(
      'Unknown ocean preset: night'
    );
  });
});
