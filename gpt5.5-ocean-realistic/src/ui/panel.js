import GUI from 'lil-gui';
import { DEFAULT_OCEAN_SETTINGS } from '../ocean/waves.js';
import { STORM_PROFILES, resolveStormSettings, seaStateLabel } from '../weather/storm.js';

const PROFILE_OPTIONS = {
  '物理风暴': 'physical',
  '电影风暴': 'cinematic',
  '极端灾害': 'extreme'
};

export function createControlPanel({ settings, onSettingsChange, onProfileChange }) {
  const gui = new GUI({ title: '风暴海面控制' });
  gui.domElement.classList.add('ocean-gui');
  const refreshControllers = () => {
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  };
  const applyControlPreset = (changes) => {
    Object.assign(settings, changes);
    onSettingsChange();
    refreshControllers();
  };

  const storm = gui.addFolder('风暴版本');
  storm
    .add(settings, 'profile', PROFILE_OPTIONS)
    .name('版本')
    .onChange(() => {
      onProfileChange();
      refreshControllers();
    });

  const weather = gui.addFolder('天气控制');
  weather
    .add(settings, 'weatherIntensity', 0, 1, 0.01)
    .name('天气强度')
    .onChange(onSettingsChange);
  weather
    .add(settings, 'cloudDarkness', 0, 1, 0.01)
    .name('云层暗度')
    .onChange(onSettingsChange);
  weather
    .add(settings, 'fogDensity', 0.001, 0.04, 0.001)
    .name('雾气浓度')
    .onChange(onSettingsChange);
  weather
    .add(settings, 'lightningFrequency', 0.03, 1.35, 0.01)
    .name('闪电频率')
    .onChange(onSettingsChange);
  weather
    .add(settings, 'lightningEnergy', 0, 1, 0.01)
    .name('闪电强度')
    .onChange(onSettingsChange);
  weather
    .add({ surge: () => applyControlPreset({ weatherIntensity: 1, cloudDarkness: 0.92, fogDensity: 0.028, lightningFrequency: 0.88, lightningEnergy: 1 }) }, 'surge')
    .name('天气增强');
  weather
    .add({
      squall: () =>
        applyControlPreset({
          weatherIntensity: 0.96,
          windSpeed: 36,
          windDirection: 26,
          cloudDarkness: 0.88,
          fogDensity: 0.024,
          rainDensity: 0.9,
          rainVisibility: 1.65,
          lightningFrequency: 0.72,
          lightningEnergy: 0.94
        })
    }, 'squall')
    .name('飑线推进');
  weather
    .add({
      thunderCell: () =>
        applyControlPreset({
          weatherIntensity: 0.82,
          cloudDarkness: 0.78,
          fogDensity: 0.018,
          rainDensity: 0.62,
          rainVisibility: 1.15,
          lightningFrequency: 1.08,
          lightningEnergy: 1
        })
    }, 'thunderCell')
    .name('雷暴单体');
  weather
    .add({ ease: () => applyControlPreset({ weatherIntensity: 0.42, cloudDarkness: 0.36, fogDensity: 0.008, lightningFrequency: 0.08, lightningEnergy: 0.24 }) }, 'ease')
    .name('天气减弱');

  const ocean = gui.addFolder('海面物理');
  ocean
    .add(settings, 'windSpeed', 2, 42, 0.5)
    .name('风速 m/s')
    .onChange(onSettingsChange);
  ocean
    .add(settings, 'windDirection', 0, 360, 1)
    .name('风向角度')
    .onChange(onSettingsChange);
  ocean
    .add(settings, 'waveScale', 0.2, 2.5, 0.05)
    .name('浪高比例')
    .onChange(onSettingsChange);
  ocean
    .add(settings, 'choppiness', 0, 1, 0.01)
    .name('浪尖锐度')
    .onChange(onSettingsChange);
  ocean
    .add(settings, 'foamAmount', 0, 1, 0.01)
    .name('泡沫量')
    .onChange(onSettingsChange);

  const rain = gui.addFolder('降雨控制');
  rain
    .add(settings, 'rainDensity', 0, 1, 0.01)
    .name('降雨量')
    .onChange(onSettingsChange);
  rain
    .add(settings, 'rainVisibility', 0.25, 2, 0.01)
    .name('雨幕可见度')
    .onChange(onSettingsChange);
  rain
    .add({ downpour: () => applyControlPreset({ rainDensity: 1, rainVisibility: 1.9, fogDensity: 0.026 }) }, 'downpour')
    .name('暴雨模式');
  rain
    .add({ heavyBands: () => applyControlPreset({ rainDensity: 0.86, rainVisibility: 1.55, windSpeed: 34 }) }, 'heavyBands')
    .name('雨带增强');
  rain
    .add({ drizzle: () => applyControlPreset({ rainDensity: 0.18, rainVisibility: 0.62 }) }, 'drizzle')
    .name('小雨模式');

  const tornado = gui.addFolder('龙卷风控制');
  tornado
    .add(settings, 'waterSpoutScale', 0.35, 3.2, 0.01)
    .name('龙卷风尺寸')
    .onChange(onSettingsChange);
  tornado
    .add(settings, 'waterSpoutIntensity', 0, 1.8, 0.01)
    .name('龙卷风强度')
    .onChange(onSettingsChange);
  tornado
    .add({
      amplify: () =>
        applyControlPreset({
          waterSpoutScale: Math.min(3.2, settings.waterSpoutScale * 1.32),
          waterSpoutIntensity: Math.min(1.8, settings.waterSpoutIntensity * 1.22)
        })
    }, 'amplify')
    .name('增强龙卷风');
  tornado
    .add({
      giantSpout: () =>
        applyControlPreset({
          waterSpoutScale: 2.75,
          waterSpoutIntensity: 1.55,
          rainDensity: Math.max(settings.rainDensity, 0.78),
          rainVisibility: Math.max(settings.rainVisibility, 1.35),
          foamAmount: Math.max(settings.foamAmount, 0.86)
        })
    }, 'giantSpout')
    .name('巨型龙卷风');
  tornado
    .add({
      trackingSpout: () =>
        applyControlPreset({
          waterSpoutScale: Math.min(3.2, settings.waterSpoutScale * 1.12),
          waterSpoutIntensity: Math.min(1.8, settings.waterSpoutIntensity * 1.12),
          windSpeed: Math.min(42, settings.windSpeed + 6),
          windDirection: (settings.windDirection + 18) % 360
        })
    }, 'trackingSpout')
    .name('路径推进');
  tornado
    .add({
      soften: () =>
        applyControlPreset({
          waterSpoutScale: Math.max(0.35, settings.waterSpoutScale * 0.78),
          waterSpoutIntensity: Math.max(0.08, settings.waterSpoutIntensity * 0.72)
        })
    }, 'soften')
    .name('减弱龙卷风');
  tornado
    .add({ resetTornado: () => applyControlPreset({ waterSpoutScale: 1, waterSpoutIntensity: 1 }) }, 'resetTornado')
    .name('恢复龙卷风');

  gui
    .add(
      {
        reset: () => {
          Object.assign(settings, resolveStormSettings(DEFAULT_OCEAN_SETTINGS));
          onProfileChange();
          refreshControllers();
        }
      },
      'reset'
    )
    .name('重置风暴');

  storm.open();
  weather.open();
  ocean.open();
  rain.open();
  tornado.open();

  return gui;
}

export function createHudUpdater({
  fpsElement,
  seaStateElement,
  profileElement,
  vertexElement,
  vertexCount
}) {
  let frames = 0;
  let lastUpdate = performance.now();

  vertexElement.textContent = vertexCount.toLocaleString('en-US');

  return function updateHud(settings, state) {
    frames += 1;
    const now = performance.now();
    const elapsed = now - lastUpdate;

    if (elapsed >= 500) {
      const fps = Math.round((frames * 1000) / elapsed);
      fpsElement.textContent = String(fps);
      frames = 0;
      lastUpdate = now;
    }

    const seaState = seaStateLabel(settings.windSpeed);
    const profile = STORM_PROFILES[state.profile] ?? STORM_PROFILES[settings.profile];
    seaStateElement.textContent = `${seaState.label} L${seaState.level}`;
    profileElement.textContent = profile.label;
  };
}
