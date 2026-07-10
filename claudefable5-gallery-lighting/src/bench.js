// ============================================================
// bench.js — window.__bench 自动化调试钩子(工程要求)
//   ready      : 首帧渲染完成后置 true
//   stepFrame(n): 手动推进 n 帧(固定 1/60s 步长)并逐帧渲染,
//                 页面隐藏 / RAF 停摆时也可驱动画面
//   getState() : 返回玩家 / 天光 / 展品 / 渲染统计快照
//   setSkylight(on): 额外便捷钩子,供自动化截图切换昼夜
// ============================================================
export function installBench({ update, render, getState, setSkylight }) {
  const api = {
    ready: false,
    stepFrame(n = 1) {
      const steps = Math.max(1, Math.min(600, Math.floor(n) || 1));
      for (let i = 0; i < steps; i++) {
        update(1 / 60);
        render();
      }
      return steps;
    },
    getState,
    setSkylight,
  };
  window.__bench = api;
  return api;
}
