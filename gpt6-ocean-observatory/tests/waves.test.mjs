import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeWaves, sampleSurface, maximumElevation, periodForWind, PRESETS } from '../src/waves.js';

test('seed locks phase; different seeds generate a different sea', () => {
  assert.deepEqual(makeWaves(71), makeWaves(71));
  assert.notDeepEqual(makeWaves(71), makeWaves(72));
});

test('configured significant height agrees with spectral variance', () => {
  const waves = makeWaves(71);
  for (const height of [0.1, 1.8, 4]) {
    const hs = 4 * Math.sqrt(waves.reduce((sum, w) => sum + (w.amplitude * height) ** 2 / 2, 0));
    assert.ok(Math.abs(hs - height) < 1e-12);
  }
});

test('extreme sea remains below conservative camera limit for all sampled phases', () => {
  for (const seed of [71, 137, 2026]) {
    const waves = makeWaves(seed);
    const parameters = { ...PRESETS.squall, height: 4 };
    for (let time = 0; time < 120; time += 0.37) {
      const point = sampleSurface(time * 2.7, -time * 1.9, time, parameters, waves);
      assert.ok(Math.abs(point.y) <= maximumElevation(parameters.height, waves));
      assert.ok(point.normal.y > 0, 'surface must not fold over');
      assert.ok(Math.abs(Math.hypot(...Object.values(point.normal)) - 1) < 1e-12);
    }
  }
});

test('analytic normal matches finite-difference displaced geometry', () => {
  const waves = makeWaves(71), e = 0.0001, parameters = PRESETS.swell;
  const p = sampleSurface(3, -12, 7, parameters, waves);
  const px = sampleSurface(3 + e, -12, 7, parameters, waves);
  const pz = sampleSurface(3, -12 + e, 7, parameters, waves);
  const a = [px.x-p.x, px.y-p.y, px.z-p.z], b = [pz.x-p.x, pz.y-p.y, pz.z-p.z];
  const n = [b[1]*a[2]-b[2]*a[1], b[2]*a[0]-b[0]*a[2], b[0]*a[1]-b[1]*a[0]];
  const length = Math.hypot(...n);
  [p.normal.x, p.normal.y, p.normal.z].forEach((v, i) => assert.ok(Math.abs(v-n[i]/length) < 1e-4));
});

test('stronger wind advances the dominant wave faster', () => {
  const waves = makeWaves(71);
  assert.ok(periodForWind(17, waves) < periodForWind(2.4, waves));
});
