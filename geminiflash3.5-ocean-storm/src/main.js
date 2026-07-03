import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Ocean } from './Ocean.js';
import { WeatherSystem } from './WeatherSystem.js';
import { Boat } from './Boat.js';

let scene, camera, renderer, controls;
let ocean, weatherSystem, boat;
let clock;

// 状态控制
let cameraTrackMode = false; // 是否追踪小船
const cameraOffset = new THREE.Vector3(-15, 12, 15); // 追踪视角的偏移量
let skyMesh, skyMaterial;

// 初始化入口
function init() {
  clock = new THREE.Clock();

  // 1. 创建场景与雾效
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#050508');
  scene.fog = new THREE.FogExp2('#050508', 0.015);

  // 2. 创建相机
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(30, 18, 45);

  // 3. 创建渲染器
  const canvas = document.getElementById('webgl-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 4. 控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.01; // 防止镜头穿入海平面以下
  controls.minDistance = 5;
  controls.maxDistance = 180;

  // 5. 添加基础环境光源
  const ambientLight = new THREE.AmbientLight('#050e18', 0.1);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight('#fffaed', 1.5);
  dirLight.position.set(40, 80, 40);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 250;
  const d = 50;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);

  const lights = { ambient: ambientLight, directional: dirLight };

  // 6. 添加渐变天空球 (程序化渲染)
  initSky();

  // 7. 实例化海洋系统
  ocean = new Ocean(scene, { size: 350, segments: 180 });

  // 8. 实例化天气系统
  weatherSystem = new WeatherSystem(scene, ocean, lights);

  // 9. 实例化浮力小船
  boat = new Boat(scene, ocean);

  // 10. 绑定 UI 及交互事件
  bindUIEvents();

  // 11. 启动渲染循环
  animate();

  // 12. 监听缩放
  window.addEventListener('resize', onWindowResize);
}

// 初始化天空球
function initSky() {
  const skyGeo = new THREE.SphereGeometry(450, 32, 15);
  skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColorTop: { value: new THREE.Color('#08101a') },
      uColorBottom: { value: new THREE.Color('#102035') }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColorTop;
      uniform vec3 uColorBottom;
      varying vec3 vWorldPosition;
      void main() {
        // 根据高度比进行色彩混合，形成地平线晨昏渐变
        float h = normalize(vWorldPosition).y;
        float factor = max(h + 0.1, 0.0); // 略微把地平线往下拉一点
        gl_FragColor = vec4(mix(uColorBottom, uColorTop, factor), 1.0);
      }
    `,
    side: THREE.BackSide
  });

  skyMesh = new THREE.Mesh(skyGeo, skyMaterial);
  scene.add(skyMesh);
}

// 绑定中文 UI 交互事件
function bindUIEvents() {
  // 天气切换按钮绑定
  const weatherBtns = {
    sunny: document.getElementById('weather-sunny'),
    cloudy: document.getElementById('weather-cloudy'),
    rainy: document.getElementById('weather-rainy'),
    tornado: document.getElementById('weather-tornado')
  };

  const statusText = document.getElementById('status-text');
  const statusDot = document.querySelector('.status-dot');
  const alertBanner = document.getElementById('storm-alert');

  Object.entries(weatherBtns).forEach(([key, btn]) => {
    btn.addEventListener('click', () => {
      // 切换活动样式
      Object.values(weatherBtns).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 触发天气过渡
      weatherSystem.transitionTo(key);

      // 更新界面文本与警报条
      if (key === 'sunny') {
        statusText.innerText = '系统正常';
        statusDot.className = 'status-dot green';
        alertBanner.classList.add('hidden');
      } else if (key === 'cloudy') {
        statusText.innerText = '气候阴暗';
        statusDot.className = 'status-dot green';
        alertBanner.classList.add('hidden');
      } else if (key === 'rainy') {
        statusText.innerText = '狂风骤雨中';
        statusDot.className = 'status-dot red';
        alertBanner.classList.remove('hidden');
        alertBanner.querySelector('.alert-title').innerText = '极端天气警报';
        alertBanner.querySelector('.alert-desc').innerText = '当前海域正遭遇特大狂风骤雨，请注意安全！';
      } else if (key === 'tornado') {
        statusText.innerText = '致命飓风来袭';
        statusDot.className = 'status-dot red';
        alertBanner.classList.remove('hidden');
        alertBanner.querySelector('.alert-title').innerText = '特大灾害性警报';
        alertBanner.querySelector('.alert-desc').innerText = '强海龙卷风正处于活动中心，巨浪与闪电频发！';
      }

      // 同步更新滑块显示的数值
      setTimeout(() => {
        syncSlidersToParams();
      }, 50);
    });
  });

  // 海洋滑块控制
  const sliders = {
    height: { input: document.getElementById('slider-wave-height'), val: document.getElementById('val-wave-height'), suffix: 'm', param: 'waveHeightMultiplier' },
    length: { input: document.getElementById('slider-wave-length'), val: document.getElementById('val-wave-length'), suffix: 'm', param: 'waveLengthMultiplier' },
    speed: { input: document.getElementById('slider-wave-speed'), val: document.getElementById('val-wave-speed'), suffix: 'm/s', param: 'waveSpeedMultiplier' },
    sharp: { input: document.getElementById('slider-wave-sharp'), val: document.getElementById('val-wave-sharp'), suffix: '', param: 'sharpness' }
  };

  Object.values(sliders).forEach(item => {
    item.input.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      item.val.innerText = val.toFixed(1) + item.suffix;
      
      // 直接改变当前海洋参数
      ocean.params[item.param] = val;
    });
  });

  // 天气滑块控制
  const rainSlider = document.getElementById('slider-rain-density');
  const rainVal = document.getElementById('val-rain-density');
  rainSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    rainVal.innerText = val === 0 ? '0%' : `${Math.round(val / 50)}%`;
    weatherSystem.currentPreset.targetRainCount = val;
  });

  const lightningSlider = document.getElementById('slider-lightning-freq');
  const lightningVal = document.getElementById('val-lightning-freq');
  lightningSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    let desc = '无';
    if (val > 0 && val <= 30) desc = '极低';
    else if (val > 30 && val <= 60) desc = '中等';
    else if (val > 60 && val <= 90) desc = '高';
    else if (val > 90) desc = '极高';
    lightningVal.innerText = desc;
    weatherSystem.currentPreset.lightningFreq = val;
  });

  const fogSlider = document.getElementById('slider-fog-density');
  const fogVal = document.getElementById('val-fog-density');
  fogSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    fogVal.innerText = val.toFixed(3);
    weatherSystem.currentPreset.fogDensity = val;
  });

  // 小船交互
    // 场景亮度控制
  const lightSlider = document.getElementById('slider-light-intensity');
  const lightVal = document.getElementById('val-light-intensity');
  lightSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    lightVal.innerText = val.toFixed(1) + 'x';
    weatherSystem.lightMultiplier = val;
  });

  const btnResetBoat = document.getElementById('btn-reset-boat');
  btnResetBoat.addEventListener('click', () => {
    boat.reset();
  });

  const btnCameraBoat = document.getElementById('btn-camera-boat');
  btnCameraBoat.addEventListener('click', () => {
    cameraTrackMode = !cameraTrackMode;
    if (cameraTrackMode) {
      btnCameraBoat.innerText = '🎥 释放视角';
      btnCameraBoat.classList.add('active');
    } else {
      btnCameraBoat.innerText = '🎥 锁定视角';
      btnCameraBoat.classList.remove('active');
      controls.target.set(0, 0, 0);
    }
  });

  // 键盘 Esc 或右键双击等可退出追踪模式
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cameraTrackMode) {
      cameraTrackMode = false;
      btnCameraBoat.innerText = '🎥 锁定视角';
      btnCameraBoat.classList.remove('active');
      controls.target.set(0, 0, 0);
    }
  });
}

// 当天气发生大过渡时，同步更新 UI 的滑动条位置和数值
function syncSlidersToParams() {
  const p = ocean.params;
  
  const sets = {
    'slider-wave-height': { val: p.waveHeightMultiplier, labelId: 'val-wave-height', suffix: 'm' },
    'slider-wave-length': { val: p.waveLengthMultiplier * 15.0, labelId: 'val-wave-length', suffix: 'm' }, // 映射到滑块的初始基准15
    'slider-wave-speed': { val: p.waveSpeedMultiplier * 1.5, labelId: 'val-wave-speed', suffix: 'm/s' }, // 基准1.5
    'slider-wave-sharp': { val: p.sharpness, labelId: 'val-wave-sharp', suffix: '' }
  };

  Object.entries(sets).forEach(([id, item]) => {
    const slider = document.getElementById(id);
    if (slider) {
      slider.value = item.val;
      document.getElementById(item.labelId).innerText = item.val.toFixed(1) + item.suffix;
    }
  });

  // 同步天气数值
    // 同步场景亮度
  const lightSlider = document.getElementById('slider-light-intensity');
  if (lightSlider && weatherSystem) {
    lightSlider.value = weatherSystem.lightMultiplier;
    document.getElementById('val-light-intensity').innerText = weatherSystem.lightMultiplier.toFixed(1) + 'x';
  }

  const preset = weatherSystem.currentPreset;
  
  const rainSlider = document.getElementById('slider-rain-density');
  rainSlider.value = preset.targetRainCount;
  document.getElementById('val-rain-density').innerText = preset.targetRainCount === 0 ? '0%' : `${Math.round(preset.targetRainCount / 50)}%`;

  const lightningSlider = document.getElementById('slider-lightning-freq');
  lightningSlider.value = preset.lightningFreq;
  let desc = '无';
  if (preset.lightningFreq > 0 && preset.lightningFreq <= 30) desc = '极低';
  else if (preset.lightningFreq > 30 && preset.lightningFreq <= 60) desc = '中等';
  else if (preset.lightningFreq > 60 && preset.lightningFreq <= 90) desc = '高';
  else if (preset.lightningFreq > 90) desc = '极高';
  document.getElementById('val-lightning-freq').innerText = desc;

  const fogSlider = document.getElementById('slider-fog-density');
  fogSlider.value = preset.fogDensity;
  document.getElementById('val-fog-density').innerText = preset.fogDensity.toFixed(3);
}

// 动画渲染循环
function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1); // 防止后台切屏导致超级大步长发生物理穿模
  const elapsedTime = clock.getElapsedTime();

  // 1. 更新海洋
  ocean.update(elapsedTime, camera);
  if (weatherSystem && weatherSystem.lights) {
    const mult = weatherSystem.lightMultiplier;
    // 动态同步全局亮度系数到水体基色和天空反射色中
    ocean.uniforms.uDeepColor.value.copy(ocean.params.deepColor).multiplyScalar(mult);
    ocean.uniforms.uShallowColor.value.copy(ocean.params.shallowColor).multiplyScalar(mult);
    ocean.uniforms.uSkyReflectColor.value.copy(ocean.params.skyReflectColor).multiplyScalar(mult);

    // 动态同步当前光照环境（包含闪电暴闪和天气阴沉变化）到 Shader 内部，使其感知外界光照
    const amb = weatherSystem.lights.ambient;
    const dir = weatherSystem.lights.directional;
    ocean.uniforms.uAmbientLightColor.value.copy(amb.color).multiplyScalar(amb.intensity);
    ocean.uniforms.uLightColor.value.copy(dir.color).multiplyScalar(dir.intensity);
    ocean.uniforms.uLightDirection.value.copy(dir.position).normalize();
    
    // 动态同步风暴雾效
    if (scene.fog) {
      ocean.uniforms.uFogColor.value.copy(scene.fog.color);
      ocean.uniforms.uFogDensity.value = scene.fog.density;
    }
  }

  // 2. 更新天气
  weatherSystem.update(delta, elapsedTime);

  // 3. 更新小船
  boat.update(delta, elapsedTime, weatherSystem);

  // 4. 天空球颜色平滑插值（根据雾气的颜色过渡，让天空颜色与海面环境一致）
  if (skyMaterial) {
    // 天空底部颜色跟着雾效/地平线雾走
    skyMaterial.uniforms.uColorBottom.value.copy(weatherSystem.currentPreset.fogColor);
    
    // 天空顶部颜色做合理比例调暗
    const topColor = weatherSystem.currentPreset.fogColor.clone().multiplyScalar(0.7);
    skyMaterial.uniforms.uColorTop.value.copy(topColor);
  }

  // 5. UI 面板实时打印小船坐标与状态
  updateBoatUIDisplay();

  // 6. 相机追踪模式逻辑
  if (cameraTrackMode) {
    // 让控制器的观察核心紧密跟随小船
    controls.target.copy(boat.position);
    
    // 摄像机在一定偏差下平滑缓动尾随小船
    const targetCamPos = boat.position.clone().add(cameraOffset);
    camera.position.lerp(targetCamPos, 0.05);
  }

  controls.update();
  renderer.render(scene, camera);
}

// 更新 UI 上的船只数据
function updateBoatUIDisplay() {
  const labelPos = document.getElementById('boat-pos');
  const labelState = document.getElementById('boat-state');

  if (boat) {
    labelPos.innerText = `(${boat.position.x.toFixed(2)}, ${boat.position.z.toFixed(2)})`;
    
    // 根据风暴状态和到龙卷风距离来断定船只生存状态
    if (weatherSystem.targetPresetName === 'tornado' && weatherSystem.currentPreset.tornadoStrength > 0.5) {
      const tornadoX = weatherSystem.tornadoCenter.x;
      const tornadoZ = weatherSystem.tornadoCenter.y;
      const dist = new THREE.Vector2(boat.position.x - tornadoX, boat.position.z - tornadoZ).length();
      
      if (dist < 10.0) {
        labelState.innerText = '⚠️ 处于风暴眼中！';
        labelState.className = 'status-text-val highlight red';
      } else if (dist < 35.0) {
        labelState.innerText = '⚡ 遭遇飓风强拉扯';
        labelState.className = 'status-text-val highlight orange';
      } else {
        labelState.innerText = '⛈️ 巨浪起伏艰难颠簸';
        labelState.className = 'status-text-val highlight orange';
      }
    } else if (weatherSystem.targetPresetName === 'rainy') {
      labelState.innerText = '⛈️ 遭遇强暴雨冲击';
      labelState.className = 'status-text-val highlight orange';
    } else {
      labelState.innerText = '⚓ 安全稳定漂浮中';
      labelState.className = 'status-text-val highlight';
    }
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

// 执行初始化
init();
