import GUI from 'lil-gui';

/**
 * 构建 lil-gui 参数调试面板（满足 realistic 与 weather/storm 全维度可调要求）
 */
export function createParameterGUI(params, callbacks) {
  const gui = new GUI({ title: '海洋与风暴参数面板 (lil-gui)' });

  const fWave = gui.addFolder('🌊 波谱与动力学 (JONSWAP + Swell)');
  fWave.add(params, 'windSpeed', 1.0, 30.0, 0.2).name('风速 U10 (m/s)').listen().onChange(callbacks.onSpectrumChange);
  fWave.add(params, 'hs', 0.15, 7.5, 0.05).name('有效波高 Hs (m)').listen().onChange(callbacks.onSpectrumChange);
  fWave.add(params, 'windDirDeg', -180, 180, 1).name('主风浪方向 (°)').listen().onChange(callbacks.onSpectrumChange);
  fWave.add(params, 'swellHeight', 0.0, 3.2, 0.05).name('远洋涌浪高 (m)').listen().onChange(callbacks.onSpectrumChange);
  fWave.add(params, 'swellDirDeg', -180, 180, 1).name('涌浪方向 (°)').listen().onChange(callbacks.onSpectrumChange);
  fWave.add(params, 'choppiness', 0.2, 1.55, 0.02).name('波峰陡度 Q').listen().onChange(callbacks.onSpectrumChange);

  const fWeather = gui.addFolder('⛈️ 天气与极端风暴 (Weather & Storm)');
  fWeather.add(params, 'cloudCover', 0.0, 1.0, 0.01).name('云层覆盖率').listen();
  fWeather.add(params, 'cloudDarkness', 0.0, 1.0, 0.01).name('风暴乌云暗度').listen();
  fWeather.add(params, 'fogDensity', 0.00005, 0.0045, 0.00005).name('海雾浓度').listen();
  fWeather.add(params, 'rainIntensity', 0.0, 1.0, 0.02).name('降雨与涟漪强度').listen();
  fWeather.add(params, 'waterspout').name('远海水龙卷').listen().onChange(callbacks.onWaterspoutToggle);
  fWeather.add(params, 'lightningAuto').name('自动雷暴闪电').listen();
  fWeather.add({ strike: () => callbacks.onTriggerLightning() }, 'strike').name('⚡ 立即触发闪电');

  const fSun = gui.addFolder('☀️ 太阳与大气散射 (Atmosphere)');
  fSun.add(params, 'sunElevation', -4, 82, 0.5).name('太阳高度角 (°)').listen();
  fSun.add(params, 'sunAzimuth', 0, 360, 1).name('太阳方位角 (°)').listen();

  const fShade = gui.addFolder('💎 水体光学与泡沫 (Shading)');
  fShade.addColor(params, 'deepColor').name('深水吸收色').listen();
  fShade.addColor(params, 'shallowColor').name('浪尖透射色').listen();
  fShade.add(params, 'sssStrength', 0.0, 2.0, 0.05).name('次表面散射 SSS').listen();
  fShade.add(params, 'foamScale', 0.0, 2.5, 0.05).name('雅可比白沫强度').listen();

  const fDebug = gui.addFolder('🔧 船只巡航与渲染调试');
  fDebug.add(params, 'shipAutoCruise').name('科考船自动巡航').listen();
  fDebug.add(params, 'timeScale', 0.0, 2.5, 0.1).name('时间流速倍率').listen();
  fDebug.add(params, 'wireframe').name('海面网格线框').listen();
  fDebug.add(params, 'debugMode', {
    '写实综合渲染 (PBR)': 0,
    '解析+微表面法线': 1,
    '雅可比行列式与泡沫': 2,
    'Schlick 菲涅尔反射率': 3,
    '浪尖次表面散射 (SSS)': 4
  }).name('通道调试视图').listen();

  // 窄屏默认折叠，桌面展开核心分组
  if (window.innerWidth < 900) {
    gui.close();
  } else {
    fSun.close();
    fDebug.close();
  }

  return gui;
}
