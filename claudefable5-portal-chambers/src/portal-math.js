// 传送门穿越数学 — 纯函数模块(零依赖,不引 three/DOM,可单独自测)
// 约定与 benchmark/tasks/code-to-3d/portal.md 冻结口径一致:
//   传送门框架 = 门面中心 P + 外法线 N(垂直门面指向房间) + 上向量 U(⟂N);右向量 X = U × N。
//   局部坐标:local = ((p−P)·X, (p−P)·U, (p−P)·N),门正面 local z > 0。
//   穿越 A→B:local 绕上轴翻转 (x,y,z)→(−x,y,−z),再变换到 B 的世界系;
//   方向/速度同理(无平移项)。语义:A 背面(z<0)映射到 B 正面(z>0),模长不变。

export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);

export function makeFrame(P, N, U) {
  return { P, N, U, X: cross(U, N) };
}

export function toLocalPoint(f, p) {
  const d = sub(p, f.P);
  return [dot(d, f.X), dot(d, f.U), dot(d, f.N)];
}

export function toLocalDir(f, v) {
  return [dot(v, f.X), dot(v, f.U), dot(v, f.N)];
}

export function toWorldDir(f, l) {
  return [
    f.X[0] * l[0] + f.U[0] * l[1] + f.N[0] * l[2],
    f.X[1] * l[0] + f.U[1] * l[1] + f.N[1] * l[2],
    f.X[2] * l[0] + f.U[2] * l[1] + f.N[2] * l[2],
  ];
}

export function toWorldPoint(f, l) {
  const v = toWorldDir(f, l);
  return [f.P[0] + v[0], f.P[1] + v[1], f.P[2] + v[2]];
}

export const flipLocal = (l) => [-l[0], l[1], -l[2]];

// 位置穿越:A 门局部 → 绕上轴翻转 → B 门世界
export function transformPoint(a, b, p) {
  return toWorldPoint(b, flipLocal(toLocalPoint(a, p)));
}

// 方向/速度穿越(无平移,模长不变)
export function transformDir(a, b, v) {
  return toWorldDir(b, flipLocal(toLocalDir(a, v)));
}
