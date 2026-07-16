// window.__bench 调试钩子(评测协议要求:ready / stepFrame(n) / getState())。
// ready 不依赖 rAF(隐藏标签页 rAF 停摆也能置位);stepFrame 用固定 1/60s 同步推进,
// headless 截图/回归可复现;错误收集自证"无控制台报错"。

import { params, setParam } from './params.js';

export function installBench({ clock, renderer, composite, sparks, getFps, stepFrame, resetView, setView }) {
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));

  const bench = {
    ready: false,

    /** 同步推进 n 帧(固定 dt = 1/60),暂停与否均生效,推完即渲染。 */
    stepFrame(n = 1) {
      stepFrame(Math.max(1, Math.floor(n)));
      return clock.time;
    },

    getState() {
      return {
        time: clock.time,
        paused: params.paused,
        fps: getFps(),
        params: { ...params },
        marchSteps: composite.steps,
        pixelRatio: renderer.getPixelRatio(),
        sparks: sparks.aliveCount,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        errors: errors.slice(),
      };
    },

    /** 额外便利:脚本化调参(与 UI 同源生效)。 */
    setParam(key, value) {
      return setParam(key, value);
    },

    resetView,

    /** 环绕取证:方位角/仰角(度)与距离,直接摆相机。 */
    setView,

    /** 渲染一帧后立即导出 PNG(隐藏标签页截图超时的后备通道)。 */
    snapshot() {
      stepFrame(1);
      return renderer.domElement.toDataURL('image/png');
    },
  };

  window.__bench = bench;
  return bench;
}
