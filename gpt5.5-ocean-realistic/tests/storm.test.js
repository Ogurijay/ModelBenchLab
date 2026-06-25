import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STORM_SETTINGS,
  STORM_PROFILE_KEYS,
  STORM_PROFILES,
  computeStormRenderState,
  lightningPulseAt,
  resolveStormSettings,
  seaStateLabel
} from '../src/weather/storm.js';

describe('storm weather model', () => {
  it('defines the three requested storm profiles in increasing intensity', () => {
    expect(STORM_PROFILE_KEYS).toEqual(['physical', 'cinematic', 'extreme']);

    expect(STORM_PROFILES.physical.label).toMatch(/[一-龥]/);
    expect(STORM_PROFILES.cinematic.label).toMatch(/[一-龥]/);
    expect(STORM_PROFILES.extreme.label).toMatch(/[一-龥]/);
    expect(STORM_PROFILES.physical.rainDensity).toBeLessThan(STORM_PROFILES.cinematic.rainDensity);
    expect(STORM_PROFILES.cinematic.rainDensity).toBeLessThan(STORM_PROFILES.extreme.rainDensity);
    expect(STORM_PROFILES.physical.lightningFrequency).toBeLessThan(STORM_PROFILES.cinematic.lightningFrequency);
    expect(STORM_PROFILES.cinematic.waterSpoutRadius).toBeLessThan(STORM_PROFILES.extreme.waterSpoutRadius);
  });

  it('resolves profile settings with bounded user intensity', () => {
    const settings = resolveStormSettings({
      ...DEFAULT_STORM_SETTINGS,
      profile: 'unknown-profile',
      weatherIntensity: 4
    });

    expect(settings.profile).toBe('physical');
    expect(settings.weatherIntensity).toBe(1);
    expect(settings.rainDensity).toBeGreaterThan(0);
    expect(settings.cloudDarkness).toBeGreaterThan(0);
    expect(settings.windSpeed).toBeGreaterThan(0);
  });

  it('keeps manual weather controls from being overwritten by profile defaults', () => {
    const light = resolveStormSettings({
      profile: 'cinematic',
      weatherIntensity: 0.85,
      foamAmount: 0.08,
      rainDensity: 0.06,
      rainVisibility: 0.55,
      waterSpoutScale: 0.7,
      waterSpoutIntensity: 0.35,
      lightningEnergy: 0.2,
      cloudDarkness: 0.34,
      fogDensity: 0.006
    });
    const heavy = resolveStormSettings({
      profile: 'cinematic',
      weatherIntensity: 0.85,
      foamAmount: 1,
      rainDensity: 1,
      rainVisibility: 1.65,
      waterSpoutScale: 1.9,
      waterSpoutIntensity: 1.35,
      lightningEnergy: 1,
      cloudDarkness: 0.9,
      fogDensity: 0.026
    });

    expect(light.foamAmount).toBeCloseTo(0.08);
    expect(light.rainDensity).toBeCloseTo(0.06);
    expect(light.rainVisibility).toBeCloseTo(0.55);
    expect(light.waterSpoutScale).toBeCloseTo(0.7);
    expect(light.waterSpoutIntensity).toBeCloseTo(0.35);
    expect(heavy.foamAmount).toBeCloseTo(1);
    expect(heavy.rainDensity).toBeCloseTo(1);
    expect(heavy.rainVisibility).toBeCloseTo(1.65);
    expect(heavy.waterSpoutRadius).toBeGreaterThan(light.waterSpoutRadius * 2.2);
    expect(heavy.waterSpoutOpacity).toBeGreaterThan(light.waterSpoutOpacity * 3);
    expect(heavy.fogDensity).toBeGreaterThan(light.fogDensity * 3);
  });

  it('makes foam and rain controls produce visibly different render states', () => {
    const quiet = computeStormRenderState(
      resolveStormSettings({
        profile: 'cinematic',
        weatherIntensity: 0.85,
        foamAmount: 0,
        rainDensity: 0.03,
        rainVisibility: 0.5
      }),
      0
    );
    const storm = computeStormRenderState(
      resolveStormSettings({
        profile: 'cinematic',
        weatherIntensity: 0.85,
        foamAmount: 1,
        rainDensity: 1,
        rainVisibility: 1.8
      }),
      0
    );

    expect(storm.foamBoost).toBeGreaterThan(quiet.foamBoost + 0.7);
    expect(storm.rainOpacity).toBeGreaterThan(quiet.rainOpacity * 8);
    expect(storm.rain.nearCount).toBeGreaterThan(quiet.rain.nearCount + 2500);
    expect(storm.rain.near.opacity).toBeGreaterThan(quiet.rain.near.opacity * 3);
    expect(storm.rainVeilOpacity).toBeGreaterThan(quiet.rainVeilOpacity * 4);
  });

  it('produces deterministic event-like lightning pulses', () => {
    const settings = resolveStormSettings({ profile: 'cinematic', weatherIntensity: 1, seed: 12 });
    const first = Array.from({ length: 220 }, (_, i) => lightningPulseAt(i * 0.1, settings));
    const second = Array.from({ length: 220 }, (_, i) => lightningPulseAt(i * 0.1, settings));

    expect(first).toEqual(second);
    expect(Math.max(...first)).toBeLessThanOrEqual(1);
    expect(Math.min(...first)).toBeGreaterThanOrEqual(0);
    expect(first.some((pulse) => pulse > 0.35)).toBe(true);
    expect(first.some((pulse) => pulse === 0)).toBe(true);
  });

  it('computes bounded render state for each storm profile', () => {
    const states = STORM_PROFILE_KEYS.map((profile) =>
      computeStormRenderState(resolveStormSettings({ profile, weatherIntensity: 1, seed: 4 }), 8.5)
    );

    for (const state of states) {
      expect(state.rainOpacity).toBeGreaterThanOrEqual(0);
      expect(state.rainOpacity).toBeLessThanOrEqual(1);
      expect(state.lightningFlash).toBeGreaterThanOrEqual(0);
      expect(state.lightningFlash).toBeLessThanOrEqual(1);
      expect(state.fogDensity).toBeGreaterThan(0);
      expect(state.waterSpout.opacity).toBeGreaterThanOrEqual(0);
      expect(state.waterSpout.opacity).toBeLessThanOrEqual(1);
      expect(state.waterSpout.particleCount).toBeGreaterThanOrEqual(3600);
      expect(state.rain.nearCount).toBeGreaterThan(state.rain.farCount);
      expect(state.rain.splashCount).toBeGreaterThan(600);
      expect(state.lightning.branchCount).toBeGreaterThanOrEqual(8);
      expect(state.sprayRadius).toBeGreaterThan(0);
    }

    expect(states[0].cloudDarkness).toBeLessThan(states[1].cloudDarkness);
    expect(states[1].cloudDarkness).toBeLessThan(states[2].cloudDarkness);
    expect(states[0].sprayRadius).toBeLessThan(states[2].sprayRadius);
  });

  it('moves the water spout along a readable wind-driven path with a wake', () => {
    const settings = resolveStormSettings({ profile: 'cinematic', weatherIntensity: 1, seed: 4 });
    const start = computeStormRenderState(settings, 0).waterSpout;
    const mid = computeStormRenderState(settings, 14).waterSpout;
    const later = computeStormRenderState(settings, 28).waterSpout;

    const firstLeg = Math.hypot(mid.x - start.x, mid.z - start.z);
    const secondLeg = Math.hypot(later.x - mid.x, later.z - mid.z);
    const directionLength = Math.hypot(start.directionX, start.directionZ);
    const pathLength = Math.hypot(start.pathStartX - start.pathEndX, start.pathStartZ - start.pathEndZ);

    expect(firstLeg).toBeGreaterThan(10);
    expect(secondLeg).toBeGreaterThan(10);
    expect(directionLength).toBeGreaterThan(0.98);
    expect(directionLength).toBeLessThan(1.02);
    expect(pathLength).toBeGreaterThan(52);
    expect(start.wakeLength).toBeGreaterThan(start.radius * 4);
    expect(start.pathProgress).toBeGreaterThanOrEqual(0);
    expect(start.pathProgress).toBeLessThanOrEqual(1);
  });

  it('keeps the default water spout inside the first camera-readable storm field', () => {
    const settings = resolveStormSettings({ profile: 'cinematic', weatherIntensity: 0.85, seed: 1337 });
    const samples = [0, 8, 16, 24].map((time) => computeStormRenderState(settings, time).waterSpout);

    expect(samples.every((spout) => spout.z > -72 && spout.z < -12)).toBe(true);
    expect(samples.some((spout) => Math.abs(spout.x) < 24)).toBe(true);
    expect(samples.every((spout) => spout.opacity > 0.45)).toBe(true);
  });

  it('keeps lightning geometry invisible between physical flash pulses', () => {
    const settings = resolveStormSettings({ profile: 'cinematic', weatherIntensity: 1, seed: 12 });
    const quiet = computeStormRenderState(settings, 0);
    const flashes = Array.from({ length: 160 }, (_, i) => computeStormRenderState(settings, i * 0.04));

    expect(quiet.lightningFlash).toBe(0);
    expect(quiet.lightning.opacity).toBe(0);
    expect(flashes.some((state) => state.lightning.opacity > 0.5)).toBe(true);
  });

  it('returns monotonic sea-state labels as wind speed rises', () => {
    let previousLevel = -1;

    for (const windSpeed of [0, 4, 10, 18, 28, 42]) {
      const state = seaStateLabel(windSpeed);
      expect(state.level).toBeGreaterThanOrEqual(previousLevel);
      expect(state.label).toMatch(/[一-龥]/);
      previousLevel = state.level;
    }
  });
});
