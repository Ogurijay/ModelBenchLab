// lil-gui 控制面板 + 左下 HUD（Grok 版）。
// 暴露海况等级、FPS、顶点数；参数改动实时回调主程序重建波谱或更新 uniform。

import GUI from 'lil-gui';
import { seaStateLabel } from '../ocean/waves.js';

export function createPanel(params, handlers) {
  const gui = new GUI({ title: 'Grok Ocean • 控制' });

  const waveF = gui.addFolder('🌊 海浪');
  waveF.add(params, 'windSpeed', 1, 28, 0.5).name('风速 m/s').onChange(handlers.onWavesChanged);
  waveF.add(params, 'windDirection', 0, 360, 1).name('风向 °').onChange(handlers.onWavesChanged);
  waveF.add(params, 'waveScale', 0.15, 2.8, 0.05).name('浪高倍率').onChange(handlers.onWavesChanged);
  waveF.add(params, 'choppiness', 0, 1, 0.01).name('浪尖锐度').onChange(handlers.onWavesChanged);
  waveF.add(params, 'foam', 0, 1, 0.01).name('泡沫强度').onChange(handlers.onFoamChanged);

  const lightF = gui.addFolder('☀ 光照');
  lightF.add(params, 'sunElevation', 3, 78, 1).name('太阳高度角 °').onChange(handlers.onSunChanged);
  lightF.add(params, 'sunAzimuth', 0, 360, 1).name('太阳方位角 °').onChange(handlers.onSunChanged);

  gui
    .add(params, 'quality', ['low', 'medium', 'high'])
    .name('网格密度')
    .onChange(handlers.onQualityChanged);

  // 重置视角
  gui.add({ resetView: handlers.onResetView || (() => {}) }, 'resetView').name('重置相机视角');

  // 新增：物理 & 落体交互
  const physF = gui.addFolder('🧊 物理效果');
  physF.add(params, 'shape', ['box', 'sphere', 'cylinder', 'cone']).name('落体形状');
  physF.add(params, 'objectSize', 0.6, 5.5, 0.1).name('物体尺寸');
  physF.add(params, 'dropHeight', 4, 110, 1).name('投放高度');
  physF.add(params, 'gravity', 1, 22, 0.1).name('重力 g');
  physF.add(params, 'vesselSailing').name('演示船航行');
  physF.add(params, 'vesselSpeed', 0.1, 2.2, 0.1).name('船速');

  physF.add(params, 'autoRain').name('自动落雨');
  physF.add({ drop: handlers.onDropRandom || (() => {}) }, 'drop').name('随机投放 1 个');
  physF.add({ burst: handlers.onDropBurst || (() => {}) }, 'burst').name('投放 9 个');
  physF.add({ clear: handlers.onClearObjects || (() => {}) }, 'clear').name('清空物体');

  return gui;
}

export function createHud() {
  const seaEl = document.getElementById('hud-sea');
  const fpsEl = document.getElementById('hud-fps');
  const vertsEl = document.getElementById('hud-verts');

  let frameCount = 0;
  let accTime = 0;

  return {
    tick(dt) {
      frameCount += 1;
      accTime += dt;
      if (accTime >= 0.5) {
        fpsEl.textContent = String(Math.round(frameCount / accTime));
        frameCount = 0;
        accTime = 0;
      }
    },
    setSeaState(windSpeed) {
      const { level, text } = seaStateLabel(windSpeed);
      seaEl.textContent = `${level} 级 · ${text}`;
    },
    setVertexCount(n) {
      vertsEl.textContent = n.toLocaleString('en-US');
    },
  };
}
