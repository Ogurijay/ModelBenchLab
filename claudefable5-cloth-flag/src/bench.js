/**
 * 评测调试钩子:window.__bench = { ready, stepFrame(n), getState() }
 * - ready:首帧渲染完成后为 true
 * - stepFrame(n):手动推进 n 帧(每帧 dt = 1/60,含物理子步 + 渲染),
 *   隐藏标签页 / rAF 暂停时可用;返回本次推进的帧数
 * - getState():返回可 JSON 序列化的运行状态快照
 */
export function installBench({ tick, getState }) {
  const bench = {
    ready: false,
    stepFrame(n = 1) {
      const k = Math.min(Math.max(1, Math.floor(n)), 600);
      for (let i = 0; i < k; i++) tick(1 / 60);
      return k;
    },
    getState,
  };
  window.__bench = bench;
  return bench;
}
