import { describe, expect, it } from 'vitest';
import {
  MAX_WAVES,
  clampOceanSettings,
  createWaveSet,
  getOceanGeometryConfig,
  sampleWaveHeight,
  steepnessBudget,
  sumAmplitude
} from '../src/ocean/waves.js';

describe('Gerstner ocean wave helpers', () => {
  it('clamps ocean settings to stable physical ranges', () => {
    const settings = clampOceanSettings({
      windSpeed: 90,
      windDirection: 725,
      waveScale: -4,
      choppiness: 10,
      foamAmount: 2
    });

    expect(settings).toMatchObject({
      windSpeed: 42,
      windDirection: 5,
      waveScale: 0.2,
      choppiness: 1,
      foamAmount: 1
    });
  });

  it('creates deterministic Gerstner wave components from wind and seed', () => {
    const first = createWaveSet({ windSpeed: 20, windDirection: 35, seed: 17 });
    const second = createWaveSet({ windSpeed: 20, windDirection: 35, seed: 17 });
    const differentSeed = createWaveSet({ windSpeed: 20, windDirection: 35, seed: 18 });

    expect(first).toHaveLength(MAX_WAVES);
    expect(first).toEqual(second);
    expect(first).not.toEqual(differentSeed);

    for (const wave of first) {
      expect(Math.hypot(wave.dirX, wave.dirZ)).toBeCloseTo(1, 6);
      expect(wave.amplitude).toBeGreaterThan(0);
      expect(wave.wavelength).toBeGreaterThan(0);
      expect(wave.k).toBeCloseTo((Math.PI * 2) / wave.wavelength, 6);
      expect(wave.omega).toBeGreaterThan(0);
      expect(Number.isFinite(wave.phase)).toBe(true);
      expect(wave.steepness).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps Gerstner steepness budget at or below one', () => {
    for (const windSpeed of [8, 22, 42]) {
      const waves = createWaveSet({
        windSpeed,
        windDirection: 120,
        waveScale: 1.4,
        choppiness: 1,
        seed: 99
      });

      expect(steepnessBudget(waves)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('increases dominant wavelength and total amplitude as wind rises', () => {
    const calm = createWaveSet({ windSpeed: 8, seed: 5 });
    const storm = createWaveSet({ windSpeed: 32, seed: 5 });

    expect(storm[0].wavelength).toBeGreaterThan(calm[0].wavelength);
    expect(sumAmplitude(storm)).toBeGreaterThan(sumAmplitude(calm));
  });

  it('samples wave height inside the total amplitude bound', () => {
    const waves = createWaveSet({ windSpeed: 28, windDirection: 210, waveScale: 1.2, seed: 31 });
    const bound = sumAmplitude(waves) + 1e-9;

    for (let i = 0; i < 240; i += 1) {
      const height = sampleWaveHeight({
        x: i * 1.7 - 120,
        z: i * -0.8 + 50,
        time: i * 0.09,
        waves
      });

      expect(Math.abs(height)).toBeLessThanOrEqual(bound);
    }
  });

  it('offers quality presets that scale ocean geometry predictably', () => {
    const low = getOceanGeometryConfig({ quality: 'low' });
    const medium = getOceanGeometryConfig({ quality: 'medium' });
    const high = getOceanGeometryConfig({ quality: 'high' });

    expect(low.width).toBeGreaterThan(0);
    expect(low.depth).toBeGreaterThan(0);
    expect(low.segments).toBeLessThan(medium.segments);
    expect(medium.segments).toBeLessThan(high.segments);
    expect(high.segments).toBeGreaterThanOrEqual(512);
    expect(high.vertexCount).toBe((high.segments + 1) * (high.segments + 1));
  });

  it('uses the highest ocean quality by default for close physical inspection', () => {
    const defaultConfig = getOceanGeometryConfig();

    expect(defaultConfig.segments).toBeGreaterThanOrEqual(512);
    expect(defaultConfig.vertexCount).toBeGreaterThan(260_000);
  });
});
