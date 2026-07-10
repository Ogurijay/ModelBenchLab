// 悬索桥主缆悬链线:y = a·cosh(x/a) 形。
// 给定半跨 L 与垂度 s,解 a·(cosh(L/a) − 1) = s(牛顿迭代)。
// 纯函数、可单元测试 —— mission 要求的"真实公式"之一。

export function solveCatenaryA(halfSpan, sag, iterations = 40) {
  let a = (halfSpan * halfSpan) / (2 * sag); // 抛物线近似作初值
  for (let i = 0; i < iterations; i++) {
    const c = Math.cosh(halfSpan / a);
    const f = a * (c - 1) - sag;
    const df = c - 1 - (halfSpan / a) * Math.sinh(halfSpan / a);
    const step = f / df;
    a -= step;
    if (!Number.isFinite(a) || a <= 0) { a = halfSpan; }
    if (Math.abs(step) < 1e-9) break;
  }
  return a;
}

// 两塔之间主缆上一点:t∈[0,1] 归一化跨内位置,返回相对塔顶的下垂量(塔顶=0,跨中=sag)
export function catenaryDrop(t, halfSpan, sag) {
  const a = solveCatenaryA(halfSpan, sag);
  const x = (t * 2 - 1) * halfSpan; // [-L, L]
  return sag - a * (Math.cosh(x / a) - 1);
}
