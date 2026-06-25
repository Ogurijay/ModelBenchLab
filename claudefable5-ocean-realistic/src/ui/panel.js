// lil-gui 参数面板和左下角 HUD（抬头显示）。

import GUI from 'lil-gui';
import { seaStateLabel } from '../ocean/waves.js';

/**
 * 创建控制面板。
 * @param {object} params 可变参数对象
 * @param {object} handlers { onWavesChanged, onSunChanged, onFoamChanged, onQualityChanged }
 */
export function createPanel(params, handlers) {
  const gui = new GUI({ title: 'Ocean Controls' });

  const sea = gui.addFolder('海浪');
  sea.add(params, 'windSpeed', 1, 30, 0.5).name('风速 m/s').onChange(handlers.onWavesChanged);
  sea.add(params, 'windDirection', 0, 360, 1).name('风向 °').onChange(handlers.onWavesChanged);
  sea.add(params, 'waveScale', 0.2, 2.5, 0.05).name('浪高比例').onChange(handlers.onWavesChanged);
  sea.add(params, 'choppiness', 0, 1, 0.01).name('浪尖锐度').onChange(handlers.onWavesChanged);
  sea.add(params, 'foam', 0, 1, 0.01).name('泡沫量').onChange(handlers.onFoamChanged);

  const sun = gui.addFolder('光照');
  sun.add(params, 'sunElevation', 2, 80, 1).name('太阳高度 °').onChange(handlers.onSunChanged);
  sun.add(params, 'sunAzimuth', 0, 360, 1).name('太阳方位 °').onChange(handlers.onSunChanged);

  gui
    .add(params, 'quality', ['low', 'medium', 'high'])
    .name('网格质量')
    .onChange(handlers.onQualityChanged);

  return gui;
}

/** 创建 HUD 更新器：FPS 每 0.5 秒刷新一次，避免数字抖动。 */
export function createHud() {
  const seaEl = document.getElementById('hud-sea');
  const fpsEl = document.getElementById('hud-fps');
  const vertsEl = document.getElementById('hud-verts');

  let frames = 0;
  let acc = 0;

  return {
    tick(delta) {
      frames += 1;
      acc += delta;
      if (acc >= 0.5) {
        fpsEl.textContent = String(Math.round(frames / acc));
        frames = 0;
        acc = 0;
      }
    },
    setSeaState(windSpeed) {
      const { level, text } = seaStateLabel(windSpeed);
      seaEl.textContent = `${level} 级 · ${text}`;
    },
    setVertexCount(count) {
      vertsEl.textContent = count.toLocaleString('en-US');
    },
  };
}
