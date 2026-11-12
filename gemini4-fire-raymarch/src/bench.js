// window.__bench 评测与自动化调试钩子 (bench.js)
// 同时兼容 claudefable5-fire-raymarch 与 gpt5.5-fire-volumetric 的评测协议字段，
// 确保任意自动化回归或盲评脚本均可零误差读取状态、步进帧、切换视角与截图。

import * as THREE from 'three';
import {
  params,
  setParam,
  setParameters,
  getCoreTemperatureCelsius,
} from './params.js';

export function installBench({
  getTime,
  renderer,
  camera,
  controls,
  composite,
  sparks,
  smoke,
  getFps,
  stepFrame,
  resetView,
  setView,
  triggerStoke,
}) {
  const errors = [];
  window.addEventListener('error', (e) => {
    if (e && e.message) errors.push(String(e.message));
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (e && e.reason) errors.push(String(e.reason));
  });

  const bench = {
    ready: false,

    /** 固定 dt = 1/60s 同步推进 n 帧并立即完成渲染，支持 headless 确定性回放 */
    stepFrame(n = 1) {
      const count = Math.max(1, Math.min(600, Math.floor(n)));
      stepFrame(count);
      return Number(getTime().toFixed(4));
    },

    /** 返回完整运行时状态与渲染指标 */
    getState() {
      const t = Number(getTime().toFixed(3));
      return {
        ready: bench.ready,
        threeRevision: THREE.REVISION,
        time: t,
        elapsed: t,
        paused: params.paused,
        fps: Math.round(getFps()),
        params: { ...params },
        fire: {
          intensity: params.intensity,
          turbulence: params.turbulence,
          windAngle: params.windAngle,
          windStrength: params.windStrength,
          quality: params.quality,
          steps: composite.steps,
          temperature: getCoreTemperatureCelsius(),
        },
        marchSteps: composite.steps,
        pixelRatio: renderer.getPixelRatio(),
        sparks: sparks.aliveCount,
        particles: {
          embers: sparks.aliveCount,
          smoke: smoke.aliveCount,
        },
        camera: {
          position: camera.position.toArray().map((v) => Number(v.toFixed(3))),
          target: controls.target.toArray().map((v) => Number(v.toFixed(3))),
        },
        drawCalls: composite.lastRenderStats.calls,
        triangles: composite.lastRenderStats.triangles,
        renderInfo: {
          calls: composite.lastRenderStats.calls,
          triangles: composite.lastRenderStats.triangles,
          points: composite.lastRenderStats.points,
        },
        errors: errors.slice(),
      };
    },

    setParam(key, value) {
      return setParam(key, value);
    },

    setParameters(patch = {}) {
      setParameters(patch);
      return this.getState();
    },

    setPaused(paused) {
      setParam('paused', Boolean(paused));
      return this.getState();
    },

    resetView,
    setView,
    triggerStoke,

    /** 同步步进 1 帧后导出 PNG DataURL */
    snapshot() {
      stepFrame(1);
      return renderer.domElement.toDataURL('image/png');
    },
  };

  window.__bench = bench;
  return bench;
}
