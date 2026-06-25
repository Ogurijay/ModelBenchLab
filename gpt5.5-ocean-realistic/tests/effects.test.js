import { describe, expect, it } from 'vitest';
import {
  createLightningSegments,
  createRainLayerConfig,
  createSpoutParticles
} from '../src/weather/effects.js';

describe('high fidelity storm effect generators', () => {
  it('creates a dense deterministic hammer-like spiral particle field for the water spout', () => {
    const first = createSpoutParticles({ count: 2400, radius: 9, height: 120, seed: 7 });
    const second = createSpoutParticles({ count: 2400, radius: 9, height: 120, seed: 7 });

    expect(first).toHaveLength(2400);
    expect(first).toEqual(second);

    const condensation = first.filter((p) => p.kind === 'funnel' || p.kind === 'hammer');
    const hammer = first.filter((p) => p.kind === 'hammer');
    const spray = first.filter((p) => p.kind === 'spray');
    const meanRadius = (particles) => particles.reduce((sum, p) => sum + p.radius, 0) / particles.length;
    const lowerStem = condensation.filter((p) => p.normalizedHeight > 0.18 && p.normalizedHeight < 0.34);
    const waist = condensation.filter((p) => p.normalizedHeight > 0.36 && p.normalizedHeight < 0.48);
    const hammerShoulder = condensation.filter((p) => p.normalizedHeight > 0.58 && p.normalizedHeight < 0.75);
    const crown = condensation.filter((p) => p.normalizedHeight > 0.84);
    const bentStem = condensation.filter((p) => p.normalizedHeight > 0.16 && p.normalizedHeight < 0.56);
    const phaseRange = Math.max(...condensation.map((p) => p.phase)) - Math.min(...condensation.map((p) => p.phase));
    const bendMagnitudes = bentStem.map((p) => Math.hypot(p.axisBendX, p.axisBendZ));
    const warpRange = Math.max(...bentStem.map((p) => p.vortexWarp)) - Math.min(...bentStem.map((p) => p.vortexWarp));

    expect(condensation.length).toBeGreaterThan(1600);
    expect(hammer.length).toBeGreaterThan(360);
    expect(spray.length).toBeGreaterThan(350);
    expect(meanRadius(hammerShoulder)).toBeGreaterThan(meanRadius(waist) * 1.26);
    expect(meanRadius(crown)).toBeGreaterThan(meanRadius(waist) * 1.18);
    expect(meanRadius(spray)).toBeGreaterThan(meanRadius(lowerStem) * 1.08);
    expect(phaseRange).toBeGreaterThan(Math.PI * 2 * 11);
    expect(bentStem.every((p) => Number.isFinite(p.axisBendX) && Number.isFinite(p.axisBendZ))).toBe(true);
    expect(bentStem.every((p) => Number.isFinite(p.vortexWarp))).toBe(true);
    expect(Math.max(...bendMagnitudes) - Math.min(...bendMagnitudes)).toBeGreaterThan(1.1);
    expect(warpRange).toBeGreaterThan(0.22);
    expect(first.some((p) => p.alpha < 0.18)).toBe(true);
    expect(first.some((p) => p.alpha > 0.34)).toBe(true);
    expect(Math.max(...first.map((p) => p.alpha))).toBeLessThan(0.55);
  });

  it('creates branching lightning with enough jagged segments to avoid a drawn icon look', () => {
    const first = createLightningSegments({ seed: 11, height: 128, branchCount: 12 });
    const second = createLightningSegments({ seed: 11, height: 128, branchCount: 12 });

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(34);
    expect(first.some((segment) => segment.branch)).toBe(true);
    expect(first.some((segment) => Math.abs(segment.start.x - segment.end.x) > 6)).toBe(true);
  });

  it('uses layered rain plus splash points instead of a single rain-line sheet', () => {
    const config = createRainLayerConfig({ rainDensity: 0.9, windSpeed: 34 });

    expect(config.near.count).toBeGreaterThan(config.mid.count);
    expect(config.mid.count).toBeGreaterThan(config.far.count);
    expect(config.splash.count).toBeGreaterThan(900);
    expect(config.near.length).toBeGreaterThan(config.far.length);
    expect(config.slant).toBeGreaterThan(0.3);
    expect(config.near.directionJitter).toBeGreaterThan(config.mid.directionJitter);
    expect(config.mid.directionJitter).toBeGreaterThan(config.far.directionJitter);
    expect(config.near.crosswindVariance).toBeGreaterThan(8);
    expect(config.near.depthSlantVariance).toBeGreaterThan(5);
    expect(config.near.microBurstVariance).toBeGreaterThan(config.mid.microBurstVariance);
    expect(config.mid.microBurstVariance).toBeGreaterThan(config.far.microBurstVariance);
    expect(config.near.fallSpeedMax).toBeGreaterThan(config.near.fallSpeedMin);
    expect(config.near.opacityJitter).toBeGreaterThan(config.far.opacityJitter);
    expect(config.near.spriteScale).toBeGreaterThan(config.far.spriteScale);
  });
});
