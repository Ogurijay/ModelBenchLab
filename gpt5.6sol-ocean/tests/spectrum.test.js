import { describe, expect, it } from 'vitest';
import {
  createWaveSpectrum,
  getQualityProfile,
  sampleWaveSurface,
  steepnessBudget
} from '../src/ocean/spectrum.js';

describe('wind-driven spectrum', () => {
  it('creates twelve deterministic, finite waves', () => {
    const first = createWaveSpectrum({ seed: 5601 });
    const second = createWaveSpectrum({ seed: 5601 });

    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    for (const wave of first) {
      expect(Object.values(wave).every(Number.isFinite)).toBe(true);
      expect(Math.hypot(wave.dirX, wave.dirZ)).toBeCloseTo(1, 8);
      expect(wave.wavelength).toBeGreaterThan(2);
      expect(wave.amplitude).toBeGreaterThan(0);
    }
  });

  it('keeps combined Gerstner steepness inside the safe budget', () => {
    expect(steepnessBudget(createWaveSpectrum())).toBeLessThanOrEqual(0.82);
  });

  it('samples a deterministic moving surface with a unit normal', () => {
    const waves = createWaveSpectrum();
    const first = sampleWaveSurface({ x: 7, z: -11, time: 0.25, waves });
    const repeated = sampleWaveSurface({ x: 7, z: -11, time: 0.25, waves });
    const later = sampleWaveSurface({ x: 7, z: -11, time: 0.9, waves });

    expect(first).toEqual(repeated);
    expect(later.height).not.toBeCloseTo(first.height, 5);
    expect(Math.hypot(first.normal.x, first.normal.y, first.normal.z)).toBeCloseTo(1, 8);
  });

  it('scales CPU wave height for storm camera clearance', () => {
    const waves = createWaveSpectrum();
    const regular = sampleWaveSurface({ x: 13, z: -19, time: 0.67, waves });
    const storm = sampleWaveSurface({
      x: 13,
      z: -19,
      time: 0.67,
      waves,
      amplitudeScale: 1.24
    });

    expect(storm.height).not.toBeCloseTo(regular.height, 8);
    expect(Math.hypot(storm.normal.x, storm.normal.y, storm.normal.z)).toBeCloseTo(1, 8);
  });

  it('selects a lighter mobile geometry profile', () => {
    const desktop = getQualityProfile({
      width: 1440,
      devicePixelRatio: 2,
      coarsePointer: false
    });
    const mobile = getQualityProfile({
      width: 390,
      devicePixelRatio: 3,
      coarsePointer: true
    });

    expect(desktop.segments).toBe(384);
    expect(desktop.maxPixelRatio).toBe(1.75);
    expect(mobile.segments).toBe(224);
    expect(mobile.maxPixelRatio).toBe(1.25);
  });
});
