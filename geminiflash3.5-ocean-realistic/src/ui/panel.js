// 天气时段预设参数映射
const PRESETS = {
  noon: {
    windSpeed: 18.0,
    swellHeight: 1.6,
    choppiness: 1.1,
    foamAmount: 0.45,
    timeOfDay: 0.25
  },
  sunset: {
    windSpeed: 14.0,
    swellHeight: 1.4,
    choppiness: 1.0,
    foamAmount: 0.35,
    timeOfDay: 0.49
  },
  moonlight: {
    windSpeed: 8.0,
    swellHeight: 0.8,
    choppiness: 0.6,
    foamAmount: 0.15,
    timeOfDay: 0.76
  },
  storm: {
    windSpeed: 38.0,
    swellHeight: 3.1,
    choppiness: 1.95,
    foamAmount: 0.85,
    timeOfDay: 0.56
  }
};

/**
 * 初始化 UI 控制面板与事件绑定
 */
export function initControlPanel({ settings, onSettingsChange, onClearBalls, onSpawnBall }) {
  const elements = {
    windSpeed: document.getElementById('slider-windSpeed'),
    swellHeight: document.getElementById('slider-swellHeight'),
    choppiness: document.getElementById('slider-choppiness'),
    foamAmount: document.getElementById('slider-foamAmount'),
    
    valWindSpeed: document.getElementById('val-windSpeed'),
    valSwellHeight: document.getElementById('val-swellHeight'),
    valChoppiness: document.getElementById('val-choppiness'),
    valFoamAmount: document.getElementById('val-foamAmount'),
    
    btnSpawn: document.getElementById('btn-spawn-ball'),
    btnClear: document.getElementById('btn-clear-balls')
  };

  // 1. 绑定滑块滑动事件
  const bindSlider = (key, sliderEl, displayEl) => {
    if (!sliderEl) return;
    sliderEl.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      settings[key] = val;
      if (displayEl) displayEl.textContent = val.toFixed(key === 'foamAmount' ? 2 : 1);
      
      // 触发更新回调
      onSettingsChange();
      
      // 改变了滑块，取消天气按钮的 active 状态 (除非它完全匹配某一个预设，但暂不深究)
      clearPresetActive();
    });
  };

  bindSlider('windSpeed', elements.windSpeed, elements.valWindSpeed);
  bindSlider('swellHeight', elements.swellHeight, elements.valSwellHeight);
  bindSlider('choppiness', elements.choppiness, elements.valChoppiness);
  bindSlider('foamAmount', elements.foamAmount, elements.valFoamAmount);

  // 2. 天气预设按钮事件绑定
  const presetButtons = document.querySelectorAll('.preset-btn');
  
  presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const presetName = btn.getAttribute('data-preset');
      const presetData = PRESETS[presetName];
      if (!presetData) return;

      // 切换 active 类
      presetButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 应用并更新 settings 对象
      Object.assign(settings, presetData);

      // 同步到滑块界面
      updateSliderUI(elements);
      
      // 触发场景更新
      onSettingsChange();
    });
  });

  function clearPresetActive() {
    presetButtons.forEach(b => b.classList.remove('active'));
  }

  // 同步数据到滑块
  function updateSliderUI(els) {
    if (els.windSpeed) {
      els.windSpeed.value = settings.windSpeed;
      els.valWindSpeed.textContent = settings.windSpeed.toFixed(1);
    }
    if (els.swellHeight) {
      els.swellHeight.value = settings.swellHeight;
      els.valSwellHeight.textContent = settings.swellHeight.toFixed(1);
    }
    if (els.choppiness) {
      els.choppiness.value = settings.choppiness;
      els.valChoppiness.textContent = settings.choppiness.toFixed(1);
    }
    if (els.foamAmount) {
      els.foamAmount.value = settings.foamAmount;
      els.valFoamAmount.textContent = settings.foamAmount.toFixed(2);
    }
  }

  // 3. 投球与清空按钮
  if (elements.btnSpawn) {
    elements.btnSpawn.addEventListener('click', onSpawnBall);
  }
  if (elements.btnClear) {
    elements.btnClear.addEventListener('click', onClearBalls);
  }

  // 首次运行，根据默认预设同步一次 UI
  updateSliderUI(elements);
}

/**
 * 实时刷新控制板 footer 的状态数据 (FPS, 浮物数, CPU 延迟)
 */
export function updateStatusDisplays({ fps, ballsCount, cpuTime }) {
  const elFps = document.getElementById('stat-fps');
  const elBalls = document.getElementById('stat-balls');
  const elCpu = document.getElementById('stat-cpu');

  if (elFps) elFps.textContent = fps;
  if (elBalls) elBalls.textContent = ballsCount;
  if (elCpu) elCpu.textContent = `${cpuTime.toFixed(1)} ms`;
}
