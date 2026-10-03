// lil-gui 参数面板。所有控件绑定在 app.settings 上，预设切换后 listen() 自动刷新。

import GUI from 'lil-gui';
import { PRESETS, PRESET_ORDER } from '../presets.js';
import { FLOATER_TYPES } from '../objects/floaters.js';

export function createGui(app) {
  const s = app.settings;
  const gui = new GUI({ title: '海洋参数' });
  gui.domElement.classList.add('ocean-gui');

  const presetOptions = Object.fromEntries(PRESET_ORDER.map((k) => [PRESETS[k].label, k]));
  gui.add(s, 'preset', presetOptions).name('海况预设').onChange((v) => app.applyPreset(v)).listen();

  const sea = gui.addFolder('波浪（JONSWAP 波谱）');
  const seaChange = () => app.onSeaChanged();
  sea.add(s.sea, 'windSpeed', 1, 28, 0.1).name('风速 m/s').onChange(seaChange).listen();
  sea.add(s.sea, 'windDir', 0, 360, 1).name('风向 °').onChange(seaChange).listen();
  sea.add(s.sea, 'fetch', 5, 1000, 1).name('风区 km').onChange(seaChange).listen();
  sea.add(s.sea, 'directionality', 0, 1, 0.01).name('方向集中度').onChange(seaChange).listen();
  sea.add(s.sea, 'swellHeight', 0, 4, 0.05).name('涌浪 Hs m').onChange(seaChange).listen();
  sea.add(s.sea, 'swellPeriod', 5, 18, 0.1).name('涌浪周期 s').onChange(seaChange).listen();
  sea.add(s.sea, 'swellDir', 0, 360, 1).name('涌浪方向 °').onChange(seaChange).listen();
  sea.add(s.sea, 'choppiness', 0, 1.6, 0.01).name('尖浪 λ').onChange(seaChange).listen();
  sea.add(s, 'timeScale', 0, 3, 0.05).name('时间流速').listen();
  sea.add(s, 'paused').name('暂停（空格）').listen();

  const sky = gui.addFolder('天空与光照');
  const skyChange = () => app.onSkyChanged();
  sky.add(s.sky, 'elevation', -3, 80, 0.1).name('太阳高度 °').onChange(skyChange).listen();
  sky.add(s.sky, 'azimuth', 0, 360, 0.5).name('太阳方位 °').onChange(skyChange).listen();
  sky.add(s.sky, 'coverage', 0, 1, 0.01).name('云量').onChange(skyChange).listen();
  sky.add(s.sky, 'storm', 0, 1, 0.01).name('风暴阴霾').onChange(skyChange).listen();
  sky.add(s.water, 'rain', 0, 1, 0.01).name('降雨').listen();
  sky.add(s.water, 'exposure', 0.2, 2.5, 0.01).name('曝光').listen();
  sky.add(s, 'bloom', 0, 1.5, 0.01).name('泛光').listen();
  sky.add(s, 'fogKm', 0.5, 30, 0.1).name('能见度 km').onChange(() => app.onFogChanged()).listen();

  const water = gui.addFolder('水体与泡沫');
  water.addColor(s.look, 'deepColor').name('深水色');
  water.addColor(s.look, 'scatterColor').name('散射色');
  water.add(s.look, 'sss', 0, 3, 0.01).name('浪尖透光');
  water.add(s.look, 'roughness', 0.02, 0.3, 0.005).name('微观粗糙度');
  water.add(s.look, 'foamAmount', 0, 2, 0.01).name('泡沫强度');
  water.add(s.look, 'foamThreshold', -0.2, 0.6, 0.01).name('泡沫阈值');
  water.add(s.foam, 'bias', 0, 1, 0.01).name('翻卷判定 J<');
  water.add(s.foam, 'decay', 0.05, 3, 0.01).name('泡沫消散');
  water.close();

  const floaters = gui.addFolder('浮体');
  floaters.add(s, 'spawnType', Object.fromEntries(Object.entries(FLOATER_TYPES).map(([k, v]) => [v, k]))).name('点击海面投放');
  floaters.add({ drop: () => app.dropMany(6) }, 'drop').name('空投 6 个');
  floaters.add(s, 'follow').name('镜头跟随渔船（F）').listen();
  floaters.add({ clear: () => app.clearSpawned() }, 'clear').name('清空投放物（C）');

  const debug = gui.addFolder('调试');
  debug.add(s.cascades, '0').name('cascade 0 · 500 m');
  debug.add(s.cascades, '1').name('cascade 1 · 97 m');
  debug.add(s.cascades, '2').name('cascade 2 · 21 m');
  debug.add(s, 'debugView', { 常规: 0, 法线: 1, 泡沫: 2, 菲涅尔: 3 }).name('视图');
  debug.add(s, 'wireframe').name('网格线框');
  debug.close();

  if (window.innerWidth < 760) gui.close();
  return gui;
}
