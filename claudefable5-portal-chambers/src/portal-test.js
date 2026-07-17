// 传送逻辑自测 — 10 组冻结用例(benchmark/tasks/code-to-3d/portal.md,评分即对答案)
// 页面「传送逻辑自测」按钮与 window.__bench.portalTest() 共用本模块。
import { makeFrame, transformPoint, transformDir, len } from './portal-math.js';

const F_A = makeFrame([0, 1, -5], [0, 0, 1], [0, 1, 0]); // 前墙
const F_B = makeFrame([0, 1, 5], [0, 0, -1], [0, 1, 0]); // 对面墙
const F_C = makeFrame([0, 0, 0], [0, 1, 0], [0, 0, -1]); // 地面
const F_D = makeFrame([0, 2, -10], [0, 0, 1], [0, 1, 0]); // 高墙
const F_E = makeFrame([-5, 1, 0], [1, 0, 0], [0, 1, 0]); // 侧墙
const F_F = makeFrame([2, 4, 2], [0, -1, 0], [0, 0, 1]); // 天花板

const TOL = 1e-6;
const near = (a, b) => Math.abs(a[0] - b[0]) < TOL && Math.abs(a[1] - b[1]) < TOL && Math.abs(a[2] - b[2]) < TOL;

export const CASES = [
  {
    name: '1 对穿门对 · 速度保向',
    run: () => transformDir(F_A, F_B, [0, 0, -5]),
    expect: [0, 0, -5],
  },
  {
    name: '2 对穿门对 · 位置映射',
    run: () => transformPoint(F_A, F_B, [0.3, 1.2, -5.1]),
    expect: [0.3, 1.2, 4.9],
  },
  {
    name: '3 地→墙飞跃 · 下落转水平',
    run: () => transformDir(F_C, F_D, [0, -12, 0]),
    expect: [0, 0, 12],
  },
  {
    name: '4 地→墙 · 位置映射',
    run: () => transformPoint(F_C, F_D, [0.5, -0.1, 0.3]),
    expect: [-0.5, 1.7, -9.9],
  },
  {
    name: '5 垂直墙对 · 速度旋转',
    run: () => transformDir(F_A, F_E, [1, 0, -5]),
    expect: [5, 0, 1],
  },
  {
    name: '6 顶→墙 · 上升转水平',
    run: () => transformDir(F_F, F_A, [0, 6, 0]),
    expect: [0, 0, 6],
  },
  {
    name: '7 对穿门对 · 侧向保向',
    run: () => transformDir(F_A, F_B, [1, 0, 0]),
    expect: [1, 0, 0],
  },
  {
    name: '8 速度模长不变(|v|=13)',
    run: () => transformDir(F_C, F_D, [3, -4, 12]),
    expect: [-3, -12, 4],
    extra: (got) => Math.abs(len(got) - 13) < TOL,
  },
  {
    name: '9 往返恒等 A→B→A',
    run: () => transformPoint(F_B, F_A, transformPoint(F_A, F_B, [0.4, 0.9, -5.2])),
    expect: [0.4, 0.9, -5.2],
  },
  {
    name: '10 上向量映射(脚先入脚先出)',
    run: () => transformDir(F_C, F_D, [0, 1, 0]),
    expect: [0, 0, -1],
  },
];

export function runPortalTests() {
  const cases = CASES.map((c) => {
    const got = c.run();
    const pass = near(got, c.expect) && (!c.extra || c.extra(got));
    return { name: c.name, expect: c.expect, got, pass };
  });
  const passed = cases.filter((c) => c.pass).length;
  return { passed, total: cases.length, cases };
}
