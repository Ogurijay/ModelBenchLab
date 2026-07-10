/**
 * 计分自测 — 10 组冻结投球序列与标准答案(来自任务文档,评分即对答案)。
 * runScoreTests() 返回 { passed, total, results },__bench.scoreTest() 直接复用。
 */
import { score } from './scoring.js';

function rep(pattern, times) {
  const out = [];
  for (let i = 0; i < times; i++) out.push(...pattern);
  return out;
}

export const TEST_CASES = [
  { name: '① 12 × 10(全 strike 完美局)', rolls: rep([10], 12), expected: 300 },
  { name: '② [9,0] × 10', rolls: rep([9, 0], 10), expected: 90 },
  { name: '③ [5,5] × 10 + 5(全 spare)', rolls: [...rep([5, 5], 10), 5], expected: 150 },
  {
    name: '④ 经典混合局(strike/spare/普通)',
    rolls: [1, 4, 4, 5, 6, 4, 5, 5, 10, 0, 1, 7, 3, 6, 4, 10, 2, 8, 6],
    expected: 133,
  },
  { name: '⑤ [0,0] × 10(全沟)', rolls: rep([0, 0], 10), expected: 0 },
  { name: '⑥ 九轮全 strike + 9,0', rolls: [...rep([10], 9), 9, 0], expected: 267 },
  {
    name: '⑦ strike / spare 交替(第10轮 5,5,10)',
    rolls: [10, 5, 5, 10, 5, 5, 10, 5, 5, 10, 5, 5, 10, 5, 5, 10],
    expected: 200,
  },
  { name: '⑧ 前九轮全沟 + 10,10,10', rolls: [...rep([0, 0], 9), 10, 10, 10], expected: 30 },
  {
    name: '⑨ 无 strike 无 spare 混合局',
    rolls: [3, 4, 6, 2, 8, 1, 5, 3, 7, 2, 4, 4, 2, 6, 9, 0, 1, 7, 3, 5],
    expected: 82,
  },
  { name: '⑩ [4,5] × 9 + 6,4,10', rolls: [...rep([4, 5], 9), 6, 4, 10], expected: 101 },
];

export function runScoreTests() {
  const results = TEST_CASES.map((tc) => {
    let actual = null;
    let error = null;
    try {
      actual = score(tc.rolls).total;
    } catch (e) {
      error = e.message;
    }
    return {
      name: tc.name,
      expected: tc.expected,
      actual,
      error,
      pass: actual === tc.expected,
    };
  });
  return {
    passed: results.filter((r) => r.pass).length,
    total: results.length,
    results,
  };
}
