import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WAVE_COUNT,
  createWaveSpectrum,
  evaluateGerstnerAtReference,
  sampleOceanSurface
} from '../src/waves.js';
import { PRESETS, PRESET_ORDER, getBeaufortScale } from '../src/presets.js';

test('createWaveSpectrum 生成确定性 24 分量且满足有效波高归一化', () => {
  const s1 = createWaveSpectrum({ seed: 4072, hs: 2.0, swellHeight: 1.5 });
  const s2 = createWaveSpectrum({ seed: 4072, hs: 2.0, swellHeight: 1.5 });

  assert.equal(s1.waves.length, WAVE_COUNT);
  assert.deepEqual(s1.waves, s2.waves);

  // 合成有效波高 sqrt(Hs_wind^2 + Hs_swell^2) = sqrt(4 + 2.25) = 2.5m
  assert.ok(Math.abs(s1.effectiveHs - 2.5) < 1e-4, `Expected 2.5m, got ${s1.effectiveHs}`);
});

test('Gerstner 陡度总和受限于防折叠安全界限内', () => {
  const stormSpec = createWaveSpectrum(PRESETS.superstorm);
  let totalSteepness = 0;
  for (const w of stormSpec.waves) {
    totalSteepness += w.steepness * w.k * w.amp;
  }
  assert.ok(totalSteepness <= 0.76, `Total steepness ${totalSteepness} exceeds safety bound`);
});

test('sampleOceanSurface 逆映射收敛且输出单位法线与有限雅可比', () => {
  const spec = createWaveSpectrum(PRESETS.trade);
  const wx = 18.4;
  const wz = -24.7;
  const time = 42.5;

  const surf = sampleOceanSurface(spec, wx, wz, time);
  const forward = evaluateGerstnerAtReference(spec, surf.reference.x, surf.reference.z, time, 18);
  const reconX = surf.reference.x + forward.dispX;
  const reconZ = surf.reference.z + forward.dispZ;

  assert.ok(Math.hypot(reconX - wx, reconZ - wz) < 0.15, '水平位移逆映射误差应足够小');
  const nLen = Math.hypot(surf.normal.x, surf.normal.y, surf.normal.z);
  assert.ok(Math.abs(nLen - 1.0) < 1e-5, '解析法线应为单位向量');
  assert.ok(surf.normal.y > 0, '法线 Y 分量应朝上');
  assert.ok(Number.isFinite(surf.jacobian));
});

test('水龙卷涡旋场对局部海面高度与切向流速产生预期调制', () => {
  const spec = createWaveSpectrum(PRESETS.calm);
  const base = sampleOceanSurface(spec, 80, -110, 10.0, null);
  const withSpout = sampleOceanSurface(spec, 85, -110, 10.0, {
    x: 80,
    z: -110,
    radius: 26,
    strength: 1.0
  });

  const baseSpeed = Math.hypot(base.velocity.x, base.velocity.z);
  const spoutSpeed = Math.hypot(withSpout.velocity.x, withSpout.velocity.z);
  assert.ok(spoutSpeed > baseSpeed + 1.0, '水龙卷应显著增加近场切向水流速度');
});

test('6 档全天候海况预设完整且蒲福风级单调递增', () => {
  assert.equal(PRESET_ORDER.length, 6);
  for (const id of PRESET_ORDER) {
    assert.ok(PRESETS[id], `Missing preset ${id}`);
    assert.ok(PRESETS[id].hs > 0);
  }
  assert.ok(getBeaufortScale(3.0) < getBeaufortScale(10.0));
  assert.ok(getBeaufortScale(10.0) < getBeaufortScale(24.0));
});
