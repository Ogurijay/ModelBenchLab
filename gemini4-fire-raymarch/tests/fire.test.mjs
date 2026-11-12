import test from 'node:test';
import assert from 'node:assert/strict';
import {
  params,
  setParam,
  setParameters,
  QUALITY_PRESETS,
  QUALITY_ORDER,
  windVec,
  getCoreTemperatureCelsius,
} from '../src/params.js';
import {
  mulberry32,
  noise3,
  fbm3,
  curlFlow3,
  evaluateFireFlicker,
} from '../src/noise.js';

test('QUALITY_PRESETS steps increase strictly monotonically across low -> medium -> high -> ultra', () => {
  const steps = QUALITY_ORDER.map((k) => QUALITY_PRESETS[k].steps);
  assert.deepEqual(steps, [32, 48, 68, 104]);
  for (let i = 1; i < steps.length; i++) {
    assert.ok(steps[i] > steps[i - 1], `Expected ${steps[i]} > ${steps[i - 1]}`);
  }
});

test('setParam and setParameters clamp values and compute wind vector accurately', () => {
  setParam('intensity', 2.5);
  assert.equal(params.intensity, 1.8);

  setParam('intensity', 0.1);
  assert.equal(params.intensity, 0.3);

  setParam('windAngle', 0);
  setParam('windStrength', 0.5);
  const [wx, wz] = windVec();
  assert.ok(Math.abs(wx - 0.5) < 1e-9);
  assert.ok(Math.abs(wz - 0.0) < 1e-9);

  setParameters({ intensity: 1.05, turbulence: 1.0, wind: 0.24, quality: 2 });
  assert.equal(params.intensity, 1.05);
  assert.equal(params.windStrength, 0.24);
  assert.equal(params.quality, 'high');
  assert.ok(getCoreTemperatureCelsius() > 1300);
});

test('Deterministic PRNG, 3D FBM noise, and fire flicker curve are reproducible and bounded', () => {
  const r1 = mulberry32(42);
  const r2 = mulberry32(42);
  for (let i = 0; i < 10; i++) {
    assert.equal(r1(), r2());
  }

  for (let i = 0; i < 25; i++) {
    const n = noise3(i * 0.37, i * 0.71, i * 1.13);
    const f = fbm3(i * 0.37, i * 0.71, i * 1.13);
    assert.ok(n >= 0 && n <= 1);
    assert.ok(f >= 0 && f <= 1);
  }

  const flow = curlFlow3(0.5, 1.2, -0.3, 2.0);
  assert.equal(flow.length, 3);
  assert.ok(flow.every((v) => Number.isFinite(v)));

  const fl = evaluateFireFlicker(3.2, 1.0);
  assert.ok(fl.flicker >= 0.58 && fl.flicker <= 1.42);
});
