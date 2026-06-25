import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  sanitizeOceanSettings,
  createWaveSet,
  sampleWavePositionAndNormal,
  getOceanGeometryConfig
} from './ocean/waves.js';
import { createOceanMaterial, createSkyMaterial, updateOceanMaterialWaves } from './ocean/materials.js';
import { initControlPanel, updateStatusDisplays } from './ui/panel.js';

// ----------------------------------------------------
// 全局仿真状态
// ----------------------------------------------------
let scene, camera, renderer, controls;
let oceanMesh, oceanMaterial, skyMesh, skyMaterial;
let sunLight, ambientLight;

const settings = { ...sanitizeOceanSettings() };
let time = 0;
const clock = new THREE.Clock();

// 漂浮物理参数
const GRAVITY = 9.8;
const BUOYANCY_FORCE = 16.0;
const WATER_DRAG = 3.5;
const AIR_DRAG = 0.2;
const ALIGN_SPEED = 6.0; // 物体对齐海浪法线的速度

// 物理浮体列表
const floatingObjects = [];

// 性能采样
let fps = 60;
let lastFpsUpdate = 0;
let frameCount = 0;
let lastCpuTime = 0;

// ----------------------------------------------------
// 初始化 Three.js 场景
// ----------------------------------------------------
function init() {
  const container = document.getElementById('canvas-container');
  
  // 1. 创建场景与相机
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0c1521, 0.0035);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 1000);
  camera.position.set(0, 25, 50);

  // 2. 创建渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // 3. 创建控制器
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.01; // 不允许相机穿透地表/海面
  controls.minDistance = 5;
  controls.maxDistance = 300;

  // 4. 光照系统
  ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 200;
  const d = 50;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  scene.add(sunLight);

  // 5. 构筑天空盒
  const skyGeo = new THREE.SphereGeometry(450, 32, 15);
  skyMaterial = createSkyMaterial();
  skyMesh = new THREE.Mesh(skyGeo, skyMaterial);
  scene.add(skyMesh);

  // 6. 构筑海面网格与材质
  const geoConfig = getOceanGeometryConfig('high');
  const oceanGeo = new THREE.PlaneGeometry(geoConfig.size, geoConfig.size, geoConfig.segments, geoConfig.segments);
  
  // 旋转平面网格使其平铺在 XZ 平面上
  oceanGeo.rotateX(-Math.PI / 2);
  
  const waves = createWaveSet(settings);
  oceanMaterial = createOceanMaterial(waves, settings);
  
  oceanMesh = new THREE.Mesh(oceanGeo, oceanMaterial);
  scene.add(oceanMesh);

  // 7. 绑定屏幕缩放
  window.addEventListener('resize', onWindowResize);
  
  // 8. 绑定鼠标点击射海投球事件
  window.addEventListener('pointerdown', onPointerDown);

  // 9. 初始化 UI 交互板
  initControlPanel({
    settings,
    onSettingsChange: applySettings,
    onClearBalls: clearFloatingObjects,
    onSpawnBall: () => spawnFloatingObject(0, 15, 0) // 默认在正中心上方空投
  });

  // 10. 预先投下 3 个演示漂浮球
  spawnFloatingObject(-15, 12, -10, '#f97316', 2.0); // 橘色中球
  spawnFloatingObject(12, 10, 15, '#eab308', 1.5);   // 黄色小球
  spawnFloatingObject(0, 18, 5, '#38bdf8', 2.8);    // 蓝色大球
}

// ----------------------------------------------------
// 屏幕大小改变
// ----------------------------------------------------
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----------------------------------------------------
// 射线检测：点击海面生成球
// ----------------------------------------------------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onPointerDown(event) {
  // 如果点击的是 UI 面板，则不进行投球
  if (event.clientX < 430 && window.innerWidth > 480) return;
  if (event.clientY > window.innerHeight * 0.5 && window.innerWidth <= 480) return;

  // 将鼠标位置归一化为 [-1, 1] 设备坐标
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  
  // 只与海面进行碰撞检测
  const intersects = raycaster.intersectObject(oceanMesh);
  
  if (intersects.length > 0) {
    const point = intersects[0].point;
    // 在相交点上方 10 米投下一个球，让其带有重力坠入水中
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomSize = 1.0 + Math.random() * 1.5;
    spawnFloatingObject(point.x, point.y + 12, point.z, randomColor, randomSize);
  }
}

// ----------------------------------------------------
// 生成与管理漂浮物
// ----------------------------------------------------
function spawnFloatingObject(x, y, z, hexColor = '#ff3366', size = 2.0) {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  // 1. 创建球体 Mesh
  const ballGeo = new THREE.SphereGeometry(size * 0.5, 20, 20);
  const ballMat = new THREE.MeshStandardMaterial({
    color: hexColor,
    roughness: 0.1,
    metalness: 0.1
  });
  const ballMesh = new THREE.Mesh(ballGeo, ballMat);
  ballMesh.castShadow = true;
  group.add(ballMesh);

  // 2. 创建一个环形救生圈/环圈作为浮标底盘，方便观察旋转
  const ringGeo = new THREE.TorusGeometry(size * 0.62, size * 0.12, 8, 24);
  ringGeo.rotateX(Math.PI / 2); // 扁平铺在底盘
  const ringMat = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.5
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.castShadow = true;
  group.add(ringMesh);

  scene.add(group);

  // 3. 记录物理参数与模型
  floatingObjects.push({
    mesh: group,
    size: size,
    mass: size * 1.5,
    position: new THREE.Vector3(x, y, z),
    velocity: new THREE.Vector3(0, 0, 0)
  });
}

function clearFloatingObjects() {
  floatingObjects.forEach((obj) => {
    scene.remove(obj.mesh);
  });
  floatingObjects.length = 0;
}

// ----------------------------------------------------
// 应用 UI 界面参数的变更
// ----------------------------------------------------
function applySettings() {
  // 1. 更新环境与太阳光颜色/强度的时段联动
  const tod = settings.timeOfDay;
  
  // 计算太阳方向向量
  // tod: 0=清晨, 0.25=正午, 0.5=黄昏, 0.75=夜幕, 1.0 = 清晨
  const angle = tod * Math.PI * 2 - Math.PI / 2;
  const sunDir = new THREE.Vector3(
    Math.cos(angle) * 0.75,
    Math.sin(angle), // 高度分量
    Math.cos(angle) * 0.4
  ).normalize();

  // 写入 Uniform
  oceanMaterial.uniforms.uSunDirection.value.copy(sunDir);
  skyMaterial.uniforms.uSunDirection.value.copy(sunDir);
  sunLight.position.copy(sunDir).multiplyScalar(80);

  // 根据日夜插值光照强度
  let sunColor, skyFogColor, ambientColor, sunIntensity;
  
  if (sunDir.y > 0.2) {
    // 正午/白昼
    sunIntensity = 1.3;
    sunColor = new THREE.Color('#ffffff');
    ambientColor = new THREE.Color('#1e293b');
    skyFogColor = new THREE.Color('#0c1521');
  } else if (sunDir.y > -0.1) {
    // 晨昏
    const t = (sunDir.y + 0.1) / 0.3; // 归一化为 0~1
    sunIntensity = THREE.MathUtils.lerp(0.0, 0.9, t);
    sunColor = mixColors('#f97316', '#ffedd5', t);
    ambientColor = mixColors('#111827', '#1e293b', t);
    skyFogColor = mixColors('#030712', '#0c1521', t);
  } else {
    // 夜晚
    sunIntensity = 0.05;
    sunColor = new THREE.Color('#38bdf8'); // 微弱月光
    ambientColor = new THREE.Color('#030712');
    skyFogColor = new THREE.Color('#020617');
  }

  sunLight.intensity = sunIntensity;
  sunLight.color.copy(sunColor);
  ambientLight.color.copy(ambientColor);
  scene.fog.color.copy(skyFogColor);
  renderer.setClearColor(skyFogColor);

  // 更新海水材质的颜色以配合光照
  oceanMaterial.uniforms.uSunColor.value.copy(sunColor);
  oceanMaterial.uniforms.uChoppiness.value = settings.choppiness;
  oceanMaterial.uniforms.uFoamAmount.value = settings.foamAmount;

  // 2. 重新更新海浪波浪集
  const waves = createWaveSet(settings);
  updateOceanMaterialWaves(oceanMaterial, waves);
}

// 颜色混合辅助
function mixColors(colorHexA, colorHexB, t) {
  const cA = new THREE.Color(colorHexA);
  const cB = new THREE.Color(colorHexB);
  return cA.clone().lerp(cB, t);
}

// ----------------------------------------------------
// 物理浮力计算循环
// ----------------------------------------------------
function updatePhysics(dt) {
  const cpuStart = performance.now();
  
  // dt 限幅防崩溃
  const frameDt = Math.min(dt, 0.03);

  for (let i = 0; i < floatingObjects.length; i++) {
    const obj = floatingObjects[i];
    
    // 1. 在物体的 X, Z 坐标上，用相同的物理方程在 CPU 端逆解出当前水面的真实 Y 坐标和法线
    const sample = sampleWavePositionAndNormal(obj.position.x, obj.position.z, time, settings);
    const waveY = sample.position.y;
    const waveNormal = new THREE.Vector3(sample.normal.x, sample.normal.y, sample.normal.z);

    // 2. 受力计算
    const forces = new THREE.Vector3(0, 0, 0);

    // 重力 Fg = m * g
    forces.y -= obj.mass * GRAVITY;

    // 当物体有部分侵入水下时，计算向上浮力与水阻力
    if (obj.position.y < waveY) {
      // 浸入深度 (小球中心到水面的距离)
      const immersion = waveY - obj.position.y;
      
      // 浮力 F = 浸入深度 * 浮力系数 * 质量
      const buoyancy = immersion * BUOYANCY_FORCE * obj.mass;
      forces.y += buoyancy;

      // 在水中的物理阻力 (限制弹跳振荡)
      const waterDragForce = obj.velocity.clone().multiplyScalar(-WATER_DRAG * obj.mass);
      forces.add(waterDragForce);
    } else {
      // 空气阻力
      const airDragForce = obj.velocity.clone().multiplyScalar(-AIR_DRAG * obj.mass);
      forces.add(airDragForce);
    }

    // 3. 欧拉数值积分
    // 加速度 a = F / m
    const acceleration = forces.divideScalar(obj.mass);
    obj.velocity.addScaledVector(acceleration, frameDt);
    obj.position.addScaledVector(obj.velocity, frameDt);

    // 4. 更新 3D 渲染位置
    obj.mesh.position.copy(obj.position);

    // 5. 对齐法线（浮球随着波浪倾斜）
    // 计算从世界 UP (0,1,0) 旋转到海浪 Normal 的四元数
    const upVec = new THREE.Vector3(0, 1, 0);
    const targetRotation = new THREE.Quaternion().setFromUnitVectors(upVec, waveNormal);
    
    // 平滑地插值旋转
    obj.mesh.quaternion.slerp(targetRotation, ALIGN_SPEED * frameDt);
  }

  lastCpuTime = performance.now() - cpuStart;
}

// ----------------------------------------------------
// 游戏/渲染主循环
// ----------------------------------------------------
function animate(currentTime) {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  time += dt;

  // 1. 更新 Shader 运行时间
  oceanMaterial.uniforms.uTime.value = time;

  // 2. 更新物理漂浮状态
  updatePhysics(dt);

  // 3. 更新相机轨道控制器
  controls.update();

  // 4. 执行渲染
  renderer.render(scene, camera);

  // 5. 采样和计算 FPS
  frameCount++;
  if (currentTime - lastFpsUpdate >= 1000) {
    fps = Math.round((frameCount * 1000) / (currentTime - lastFpsUpdate));
    frameCount = 0;
    lastFpsUpdate = currentTime;
    
    // 更新 UI 状态
    updateStatusDisplays({
      fps,
      ballsCount: floatingObjects.length,
      cpuTime: lastCpuTime
    });
  }
}

// ----------------------------------------------------
// 启动应用
// ----------------------------------------------------
window.onload = () => {
  init();
  applySettings(); // 首次加载同步天气
  requestAnimationFrame(animate);
};
