export const Z_START = 12
export const Z_END = -56

// 相机飞行 + 光环隧道共用：x/y 随 z 平滑摆动，形成蜿蜒（而非笔直）的隧道。
// 相机沿这条线飞，并看向前方 ~12 个单位 —— 前方的环始终在视野正中。
export function centerline(z) {
  return [Math.sin(z * 0.16) * 1.9, Math.cos(z * 0.12) * 1.4]
}
