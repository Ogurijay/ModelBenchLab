import test from 'node:test';
import assert from 'node:assert/strict';
import { runPortalComplianceTest } from '../src/game/portalCompliance.js';

test('冻结题面的 10 组传送变换断言全部通过', () => {
  const result = runPortalComplianceTest();
  assert.equal(result.total, 10);
  assert.equal(result.passed, 10, JSON.stringify(result.cases, null, 2));
});
