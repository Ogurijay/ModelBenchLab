// 传送门穿越变换 —— 纯函数模块(零依赖:不引 three,不碰 DOM,可在 node 里直接跑)
//
// 冻结口径(benchmark/tasks/code-to-3d/portal.md):
//   门框架 = 门面中心 P + 外法线 N(垂直门面指向房间)+ 上向量 U(⟂N);右向量 X = U × N。
//   局部坐标 local = ((p−P)·X, (p−P)·U, (p−P)·N),门正面 local z > 0。
//   穿越 A→B:local 绕上轴翻转 (x,y,z) → (−x,y,−z),再换算到 B 的世界系;
//   方向/速度同理(无平移项)。语义:A 背面(z<0)映射到 B 正面(z>0),模长不变。

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a) => {
  const l = length(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
};

/** 构造门框架。U 会先对 N 做施密特正交化,保证 X/U/N 严格右手正交。 */
export function makeFrame(P, N, U) {
  const n = normalize(N);
  const u = normalize(sub(U, scale(n, dot(U, n))));
  return { P: [...P], N: n, U: u, X: cross(u, n) };
}

/** 世界点 → 门局部坐标 */
export function localizePoint(f, p) {
  const d = sub(p, f.P);
  return [dot(d, f.X), dot(d, f.U), dot(d, f.N)];
}

/** 世界向量 → 门局部坐标(无平移) */
export function localizeDir(f, v) {
  return [dot(v, f.X), dot(v, f.U), dot(v, f.N)];
}

/** 门局部向量 → 世界向量 */
export function worldDir(f, l) {
  return [
    f.X[0] * l[0] + f.U[0] * l[1] + f.N[0] * l[2],
    f.X[1] * l[0] + f.U[1] * l[1] + f.N[1] * l[2],
    f.X[2] * l[0] + f.U[2] * l[1] + f.N[2] * l[2],
  ];
}

/** 门局部点 → 世界点 */
export function worldPoint(f, l) {
  return add(f.P, worldDir(f, l));
}

/** 绕上轴翻转:进门的背面映射为出门的正面 */
export const flipAboutUp = (l) => [-l[0], l[1], -l[2]];

/** 穿越:世界点 p 从 A 门映射到 B 门 */
export function throughPoint(a, b, p) {
  return worldPoint(b, flipAboutUp(localizePoint(a, p)));
}

/** 穿越:世界向量 v(速度/朝向)从 A 门映射到 B 门,模长不变 */
export function throughDir(a, b, v) {
  return worldDir(b, flipAboutUp(localizeDir(a, v)));
}

/**
 * 穿越变换的 4×4 行主序矩阵(供渲染层的虚拟相机使用):
 * M = B_basis · Flip · A_basis⁻¹ · (平移到 A 原点)
 * 与 throughPoint / throughDir 完全同构,自测第 2 组会交叉校验。
 */
export function throughMatrix(a, b) {
  // 列 = 变换后的世界基向量;先取 A 的局部基,翻转,再展开到 B
  const cols = [
    throughDir(a, b, [1, 0, 0]),
    throughDir(a, b, [0, 1, 0]),
    throughDir(a, b, [0, 0, 1]),
  ];
  const t = throughPoint(a, b, [0, 0, 0]);
  // 返回 three 的列主序 elements 布局(与 Matrix4.fromArray 对应)
  return [
    cols[0][0], cols[0][1], cols[0][2], 0,
    cols[1][0], cols[1][1], cols[1][2], 0,
    cols[2][0], cols[2][1], cols[2][2], 0,
    t[0], t[1], t[2], 1,
  ];
}

/** 由朝向向量反解 yaw/pitch(本作玩家始终保持直立,滚转另行平滑处理) */
export function yawPitchFromForward(f) {
  const horiz = Math.hypot(f[0], f[2]);
  return {
    yaw: horiz > 1e-6 ? Math.atan2(-f[0], -f[2]) : 0,
    pitch: Math.asin(Math.max(-1, Math.min(1, f[1] / (length(f) || 1)))),
  };
}
