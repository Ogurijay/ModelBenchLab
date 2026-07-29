// 传送逻辑自测 —— 10 组冻结用例(benchmark/tasks/code-to-3d/portal.md,评分即对答案)
// 页面「传送逻辑自测」按钮与 window.__bench.portalTest() 共用本模块。零依赖。
import {
  makeFrame, throughPoint, throughDir, throughMatrix, length,
} from './transform.js';

// 冻结门框架
const F = {
  A: makeFrame([0, 1, -5], [0, 0, 1], [0, 1, 0]),   // 前墙
  B: makeFrame([0, 1, 5], [0, 0, -1], [0, 1, 0]),   // 对面墙
  C: makeFrame([0, 0, 0], [0, 1, 0], [0, 0, -1]),   // 地面
  D: makeFrame([0, 2, -10], [0, 0, 1], [0, 1, 0]),  // 高墙
  E: makeFrame([-5, 1, 0], [1, 0, 0], [0, 1, 0]),   // 侧墙
  G: makeFrame([2, 4, 2], [0, -1, 0], [0, 0, 1]),   // 天花板(文档记为 F_F)
};

const TOL = 1e-6;
const close = (a, b) =>
  Math.abs(a[0] - b[0]) <= TOL && Math.abs(a[1] - b[1]) <= TOL && Math.abs(a[2] - b[2]) <= TOL;

// 用 4×4 矩阵路径独立复算同一变换,校验矩阵与纯函数同构(渲染层虚拟相机走矩阵)
function viaMatrix(a, b, p) {
  const m = throughMatrix(a, b);
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

export const CASES = [
  {
    name: '1 对穿门对 · 速度保向',
    io: 'dir (0,0,−5) A→B',
    run: () => throughDir(F.A, F.B, [0, 0, -5]),
    want: [0, 0, -5],
  },
  {
    name: '2 对穿门对 · 位置映射',
    io: 'point (0.3,1.2,−5.1) A→B',
    run: () => throughPoint(F.A, F.B, [0.3, 1.2, -5.1]),
    want: [0.3, 1.2, 4.9],
  },
  {
    name: '3 地→墙飞跃 · 下落转水平',
    io: 'dir (0,−12,0) C→D',
    run: () => throughDir(F.C, F.D, [0, -12, 0]),
    want: [0, 0, 12],
  },
  {
    name: '4 地→墙 · 位置映射',
    io: 'point (0.5,−0.1,0.3) C→D',
    run: () => throughPoint(F.C, F.D, [0.5, -0.1, 0.3]),
    want: [-0.5, 1.7, -9.9],
  },
  {
    name: '5 垂直墙对 · 速度旋转',
    io: 'dir (1,0,−5) A→E',
    run: () => throughDir(F.A, F.E, [1, 0, -5]),
    want: [5, 0, 1],
    // 附加:矩阵路径(渲染层虚拟相机用)必须给出同一结果。
    // 交叉校验必须挂在这一组:A→E 的线性块非对称,把矩阵写成转置会立刻暴露;
    // 而 A→B / C→D 的线性块是单位阵/对称阵,挂在那里等于没校验。
    also: (got) => {
      const p = [1.4, 2.3, -5.7];
      const direct = throughPoint(F.A, F.E, p);
      const m = viaMatrix(F.A, F.E, p);
      return close(direct, m) && close(got, [5, 0, 1]);
    },
  },
  {
    name: '6 顶→墙 · 上升转水平',
    io: 'dir (0,6,0) F→A',
    run: () => throughDir(F.G, F.A, [0, 6, 0]),
    want: [0, 0, 6],
  },
  {
    name: '7 对穿门对 · 侧向保向',
    io: 'dir (1,0,0) A→B',
    run: () => throughDir(F.A, F.B, [1, 0, 0]),
    want: [1, 0, 0],
  },
  {
    name: '8 速度模长不变(|v|=13)',
    io: 'dir (3,−4,12) C→D',
    run: () => throughDir(F.C, F.D, [3, -4, 12]),
    want: [-3, -12, 4],
    also: (got) => Math.abs(length(got) - 13) <= TOL,
  },
  {
    name: '9 往返恒等 A→B→A',
    io: 'point (0.4,0.9,−5.2)',
    run: () => throughPoint(F.B, F.A, throughPoint(F.A, F.B, [0.4, 0.9, -5.2])),
    want: [0.4, 0.9, -5.2],
  },
  {
    name: '10 上向量映射(脚先入脚先出)',
    io: 'dir (0,1,0) C→D',
    run: () => throughDir(F.C, F.D, [0, 1, 0]),
    want: [0, 0, -1],
  },
];

export function runSelfTest() {
  const cases = CASES.map((c) => {
    let got, ok;
    try {
      got = c.run();
      ok = close(got, c.want) && (!c.also || c.also(got));
    } catch (err) {
      got = [NaN, NaN, NaN];
      ok = false;
    }
    return { name: c.name, io: c.io, want: c.want, got, pass: ok };
  });
  return { passed: cases.filter((c) => c.pass).length, total: cases.length, cases };
}
