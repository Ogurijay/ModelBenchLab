import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getTrackCurve, getSplineProjection, ROAD_HALF_WIDTH, checkWrongWay } from './simulation/trackSpline.js';
import { createKartState, getKartInput, integrateKart } from './simulation/kart.js';
import { createRaceState, evaluateRaceProgress, formatTimePeriod, GATES_COUNT, GATE_T_COORDS } from './simulation/race.js';
import { initAudio, updateEngineAudio, setDriftAudioActive, playBoostSound, playGateSound, playFinishSound } from './audio.js';
import { createCyberSkyMaterial, createNeonTrackMaterial, createJetFlameMaterial } from './render/materials.js';

// ----------------------------------------------------
// 场景与物理状态
// ----------------------------------------------------
let scene, camera, renderer, clock;
let hoverKartGroup, jetFlameLeft, jetFlameRight;
let trackCurve, trackMesh;
let wrongWayAlertCount = 0;

const keys = {};
let kartState = createKartState();
let raceState = createRaceState();
let gameStarted = false;

// 漂移霓虹胎痕 (Ribbon Trail) 系统数据
const maxTrailPoints = 85;
const leftTrailPoints = [];
const rightTrailPoints = [];
let leftTrailMesh, rightTrailMesh;
let trailMaterial;

// ----------------------------------------------------
// 3D 样条赛道动态生成 (高水准几何拉伸)
// ----------------------------------------------------
function buildTrackGeometry(curve, numSegments = 300, width = ROAD_HALF_WIDTH * 2) {
  const geom = new THREE.BufferGeometry();
  const vertices = [];
  const uvs = [];
  const indices = [];

  const up = new THREE.Vector3(0, 1, 0);

  // 1. 沿样条线采样，构建左/右侧边缘点序列
  for (let i = 0; i <= numSegments; i++) {
    const t = i / numSegments;
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    
    // 道路侧向法向 (Tangent x Up)
    const sideVec = new THREE.Vector3().crossVectors(tangent, up).normalize();
    
    // 计算左侧边缘点和右侧边缘点
    const pLeft = pos.clone().addScaledVector(sideVec, -width * 0.5);
    const pRight = pos.clone().addScaledVector(sideVec, width * 0.5);

    vertices.push(pLeft.x, pLeft.y, pLeft.z);
    vertices.push(pRight.x, pRight.y, pRight.z);

    // UV 配置：U代表横截面 0 (左) -> 1 (右)，V代表马路环线纵向进度
    uvs.push(0, t);
    uvs.push(1, t);
  }

  // 2. 生成三角形面片索引
  for (let i = 0; i < numSegments; i++) {
    const row0 = i * 2;
    const row1 = (i + 1) * 2;

    // 三角形 1: 左下 -> 右下 -> 左上
    indices.push(row0, row0 + 1, row1);
    // 三角形 2: 右下 -> 右上 -> 左上
    indices.push(row0 + 1, row1 + 1, row1);
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  return geom;
}

// ----------------------------------------------------
// 初始化 Three.js 场景
// ----------------------------------------------------
function init() {
  const container = document.getElementById('canvas-container');
  clock = new THREE.Clock();

  // 1. 场景与雾
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x030008, 0.004);

  // 2. 摄像机
  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1200);
  camera.position.set(0, 15, 30);

  // 3. 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // 4. 天空盒
  const skyGeo = new THREE.SphereGeometry(600, 32, 16);
  const skyMat = createCyberSkyMaterial();
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);

  // 5. 赛道生成
  trackCurve = getTrackCurve();
  const trackGeo = buildTrackGeometry(trackCurve, 320);
  const trackMat = createNeonTrackMaterial();
  trackMesh = new THREE.Mesh(trackGeo, trackMat);
  scene.add(trackMesh);

  // 6. 光照
  const ambient = new THREE.AmbientLight(0x1a0f30, 0.6);
  scene.add(ambient);

  const sunLight = new THREE.DirectionalLight(0xa855f7, 0.6);
  sunLight.position.set(0, 50, 0);
  scene.add(sunLight);

  // 7. 构筑 6 个发光检查点大门 (Gate)
  createCheckpointGates();

  // 8. 构筑赛车模型 (Hover Ship)
  createHoverKartMesh();

  // 9. 初始化发光胎痕系统
  initTrailSystem();

  // 10. 绑定键盘事件
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyR') resetGame();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  window.addEventListener('resize', onWindowResize);
}

// ----------------------------------------------------
// 检查点大门渲染 (3D 发光拱门)
// ----------------------------------------------------
function createCheckpointGates() {
  const curve = getTrackCurve();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < GATES_COUNT; i++) {
    const t = GATE_T_COORDS[i];
    const pos = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const sideVec = new THREE.Vector3().crossVectors(tangent, up).normalize();

    // 拱门支架组合
    const gateGroup = new THREE.Group();
    gateGroup.position.copy(pos);

    // 建立朝向切线的旋转
    const rotMat = new THREE.Matrix4().lookAt(tangent, new THREE.Vector3(0), up);
    gateGroup.rotation.setFromRotationMatrix(rotMat);

    // 左右立柱 (霓虹材质)
    const postGeo = new THREE.CylinderGeometry(0.4, 0.4, 11, 8);
    const postMat = new THREE.MeshBasicMaterial({ color: i === 0 ? 0xf43f5e : 0xa855f7 }); // 起点门红，普通门紫
    
    const leftPost = new THREE.Mesh(postGeo, postMat);
    leftPost.position.set(-ROAD_HALF_WIDTH * 0.52, 5.5, 0);
    gateGroup.add(leftPost);

    const rightPost = new THREE.Mesh(postGeo, postMat);
    rightPost.position.set(ROAD_HALF_WIDTH * 0.52, 5.5, 0);
    gateGroup.add(rightPost);

    // 横梁
    const barGeo = new THREE.CylinderGeometry(0.3, 0.3, ROAD_HALF_WIDTH * 1.04, 8);
    barGeo.rotateZ(Math.PI / 2);
    const bar = new THREE.Mesh(barGeo, postMat);
    bar.position.set(0, 11, 0);
    gateGroup.add(bar);

    // 挂个发光的标牌
    const signGeo = new THREE.BoxGeometry(4, 2, 0.2);
    const signMat = new THREE.MeshBasicMaterial({ color: i === 0 ? 0xf43f5e : 0x00ffff });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 9.5, 0);
    gateGroup.add(sign);

    scene.add(gateGroup);
  }
}

// ----------------------------------------------------
// 气垫赛车 (Hover Ship) 模型拼装 (科幻低模)
// ----------------------------------------------------
function createHoverKartMesh() {
  hoverKartGroup = new THREE.Group();
  
  // 1. 船身 (拉扁的圆锥)
  const bodyGeo = new THREE.ConeGeometry(1.6, 6.0, 5);
  bodyGeo.rotateX(Math.PI / 2); // 朝前
  bodyGeo.scale(1.0, 0.4, 1.0);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x8b5cf6, // 亮紫
    roughness: 0.15,
    metalness: 0.8
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0, 0.5);
  hoverKartGroup.add(body);

  // 2. 玻璃驾驶舱 (半球)
  const cabinGeo = new THREE.SphereGeometry(0.9, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 0.6,
    roughness: 0.05
  });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 0.35, 0.25);
  hoverKartGroup.add(cabin);

  // 3. 左右反重力侧翼 (扁三角)
  const wingGeo = new THREE.ConeGeometry(0.8, 3.2, 3);
  wingGeo.rotateX(Math.PI / 2);
  wingGeo.scale(1.2, 0.15, 0.6);
  const wingMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.9 });
  
  const leftWing = new THREE.Mesh(wingGeo, wingMat);
  leftWing.position.set(-1.6, -0.05, -0.65);
  leftWing.rotation.z = -0.15;
  hoverKartGroup.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  rightWing.position.set(1.6, -0.05, -0.65);
  rightWing.rotation.z = 0.15;
  hoverKartGroup.add(rightWing);

  // 4. 车尾双喷口与喷火 Mesh
  const exhaustGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.9, 8);
  exhaustGeo.rotateX(Math.PI / 2);
  const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 1.0 });

  const leftEx = new THREE.Mesh(exhaustGeo, exhaustMat);
  leftEx.position.set(-0.55, 0, -2.4);
  hoverKartGroup.add(leftEx);

  const rightEx = new THREE.Mesh(exhaustGeo, exhaustMat);
  rightEx.position.set(0.55, 0, -2.4);
  hoverKartGroup.add(rightEx);

  // 火焰 Mesh (圆锥)
  const flameGeo = new THREE.ConeGeometry(0.36, 2.5, 8);
  flameGeo.rotateX(-Math.PI / 2); // 火焰朝后
  flameGeo.translate(0, 0, -1.25); // 轴点对齐在喷口处
  
  const flameMat = createJetFlameMaterial();
  
  jetFlameLeft = new THREE.Mesh(flameGeo, flameMat);
  jetFlameLeft.position.set(-0.55, 0, -2.85);
  hoverKartGroup.add(jetFlameLeft);

  jetFlameRight = new THREE.Mesh(flameGeo, flameMat);
  jetFlameRight.position.set(0.55, 0, -2.85);
  hoverKartGroup.add(jetFlameRight);

  scene.add(hoverKartGroup);

  // 初始定位在赛道起点 XZ
  hoverKartGroup.position.set(kartState.x, kartState.y, kartState.z);
  hoverKartGroup.rotation.y = kartState.heading;
}

// ----------------------------------------------------
// 发光胎痕 (Ribbon Trail) 渲染器
// ----------------------------------------------------
function initTrailSystem() {
  const geometry = new THREE.BufferGeometry();
  
  // 预配空数组属性
  const positions = new Float32Array(maxTrailPoints * 2 * 3); // 左右边缘点 * 3
  const uvs = new Float32Array(maxTrailPoints * 2 * 2);
  const indices = [];

  for (let i = 0; i < maxTrailPoints - 1; i++) {
    const row0 = i * 2;
    const row1 = (i + 1) * 2;
    indices.push(row0, row0 + 1, row1);
    indices.push(row0 + 1, row1 + 1, row1);
  }

  // 预置 UV
  for (let i = 0; i < maxTrailPoints; i++) {
    const v = i / (maxTrailPoints - 1);
    uvs[i * 4 + 0] = 0; uvs[i * 4 + 1] = v;
    uvs[i * 4 + 2] = 1; uvs[i * 4 + 3] = v;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  // 胎痕使用透明发光材质 (随 UV 从头到尾逐渐淡出)
  trailMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color('#38bdf8') }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        // vUv.y 从 0 (最旧的点) 到 1 (最新的点)
        float fade = pow(vUv.y, 2.5);
        gl_FragColor = vec4(uColor, fade * 0.72);
      }
    `
  });

  leftTrailMesh = new THREE.Mesh(geometry, trailMaterial);
  rightTrailMesh = new THREE.Mesh(geometry.clone(), trailMaterial.clone());

  scene.add(leftTrailMesh);
  scene.add(rightTrailMesh);
}

/**
 * 更新漂移发光尾迹条带几何体
 */
function updateTrailGeometry(mesh, pointsList, leftEmitPos, rightEmitPos, isDrifting) {
  const geom = mesh.geometry;
  const positions = geom.attributes.position.array;

  // 1. 如果在漂移，将新尾喷管世界坐标压入数组；否则，压入当前位置做假淡出
  if (isDrifting) {
    pointsList.push({ left: leftEmitPos.clone(), right: rightEmitPos.clone() });
  } else {
    // 渐近缩小尾巴：如果不在漂移，持续剔除前面的点，并用最新的尾喷位置填充，达到缩短尾部效果
    if (pointsList.length > 0) {
      pointsList.shift();
    }
  }

  // 限制长度
  while (pointsList.length > maxTrailPoints) {
    pointsList.shift();
  }

  // 2. 将点写入 positions 数组
  const activeCount = pointsList.length;
  for (let i = 0; i < maxTrailPoints; i++) {
    // 逆向取点（尾部在最前）
    const ptIdx = Math.min(i, activeCount - 1);
    const posIndex = i * 6;

    if (activeCount > 0 && ptIdx >= 0) {
      const pt = pointsList[ptIdx];
      positions[posIndex + 0] = pt.left.x;
      positions[posIndex + 1] = pt.left.y;
      positions[posIndex + 2] = pt.left.z;

      positions[posIndex + 3] = pt.right.x;
      positions[posIndex + 4] = pt.right.y;
      positions[posIndex + 5] = pt.right.z;
    } else {
      // 填充默认值
      positions[posIndex + 0] = leftEmitPos.x;
      positions[posIndex + 1] = leftEmitPos.y;
      positions[posIndex + 2] = leftEmitPos.z;
      positions[posIndex + 3] = rightEmitPos.x;
      positions[posIndex + 4] = rightEmitPos.y;
      positions[posIndex + 5] = rightEmitPos.z;
    }
  }

  geom.attributes.position.needsUpdate = true;
  geom.computeBoundingSphere();
}

// ----------------------------------------------------
// UI 看板与大字特效绑定
// ----------------------------------------------------
function updateHUD(timeMs) {
  const lapEl = document.getElementById('hud-lap');
  const timeEl = document.getElementById('hud-time');
  const bestEl = document.getElementById('hud-best-lap');
  const gateEl = document.getElementById('hud-gate');
  const speedEl = document.getElementById('hud-speed');
  const chargeBar = document.getElementById('hud-charge-bar');
  const driftBadge = document.getElementById('hud-drift-badge');
  const alertEl = document.getElementById('boost-alert');
  const vignette = document.getElementById('speed-vignette');

  // 1. 速度和偏角仪表
  const speedKmh = Math.round(Math.abs(kartState.speed) * 3.6);
  if (speedEl) speedEl.textContent = speedKmh;

  // 2. 摄像机速度拉伸 FOV 与屏摄流光线
  const targetFov = 55 + (Math.abs(kartState.speed) / 36.0) * 16.0;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.1);
  camera.updateProjectionMatrix();

  if (vignette) {
    if (kartState.boostTime > 0 || speedKmh > 115) {
      vignette.classList.add('active');
    } else {
      vignette.classList.remove('active');
    }
  }

  // 3. 漂移能量条
  if (chargeBar) {
    chargeBar.style.width = `${kartState.driftCharge * 100}%`;
    if (kartState.driftLevel === 2) {
      chargeBar.className = 'charge-gauge-fill level-2';
    } else if (kartState.driftLevel === 1) {
      chargeBar.className = 'charge-gauge-fill level-1';
    } else {
      chargeBar.className = 'charge-gauge-fill';
    }
  }

  if (driftBadge) {
    if (kartState.driftLevel === 2) {
      driftBadge.textContent = 'BURNING';
      driftBadge.className = 'drift-level-badge level-2';
    } else if (kartState.driftLevel === 1) {
      driftBadge.textContent = 'CHARGING';
      driftBadge.className = 'drift-level-badge level-1';
    } else {
      driftBadge.textContent = 'DRIFT';
      driftBadge.className = 'drift-level-badge';
    }
  }

  // 4. 大字特效
  if (alertEl) {
    if (kartState.triggerBoostAlert && alertEl.classList.contains('hidden')) {
      alertEl.classList.remove('hidden');
      if (kartState.boostType === 2) {
        alertEl.textContent = 'DOUBLE BOOST!';
        alertEl.className = 'boost-alert level-2';
      } else if (kartState.boostType === 1) {
        alertEl.textContent = 'BOOST!';
        alertEl.className = 'boost-alert';
      } else {
        alertEl.textContent = 'ENERGY BOOST!';
        alertEl.className = 'boost-alert level-2';
      }
      
      // 触发声音
      playBoostSound(kartState.boostType === 2 ? 1.3 : 0.85);

      // 0.8秒后隐藏
      setTimeout(() => {
        alertEl.classList.add('hidden');
      }, 800);
    }
  }

  // 5. 圈数与时间
  if (lapEl) lapEl.innerHTML = `${raceState.lap}<span class="hud-slash">/</span>${raceState.totalLaps}`;
  if (gateEl) gateEl.innerHTML = `${raceState.nextCheckpoint}<span class="hud-slash">/</span>${GATES_COUNT}`;
  
  if (timeEl && raceState.raceStartedAtMs !== null && !raceState.finished) {
    const elapsed = timeMs - raceState.raceStartedAtMs;
    timeEl.textContent = (elapsed / 1000).toFixed(2);
  }
  
  if (bestEl && raceState.bestLapMs !== null) {
    bestEl.textContent = formatTimePeriod(raceState.bestLapMs);
  }
}

// ----------------------------------------------------
// 重置游戏
// ----------------------------------------------------
function resetGame() {
  kartState = createKartState();
  raceState = createRaceState();
  
  hoverKartGroup.position.set(kartState.x, kartState.y, kartState.z);
  hoverKartGroup.rotation.set(0, kartState.heading, 0);

  leftTrailPoints.length = 0;
  rightTrailPoints.length = 0;

  // 隐藏结算，显示 HUD
  document.getElementById('finish-overlay').classList.add('hidden');
  document.getElementById('game-hud').classList.remove('hidden');
  document.getElementById('hud-best-lap').textContent = "--.--";
}

// ----------------------------------------------------
// 主循环
// ----------------------------------------------------
function animate(currentTime) {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  
  if (gameStarted) {
    // 1. 获取输入向量
    const input = getKartInput(keys);

    // 2. 样条曲线轨道位置采样
    const proj = getSplineProjection(hoverKartGroup.position.x, hoverKartGroup.position.z, trackCurve);
    
    // 3. 检验逆行方向，更新 track 材质 uniform
    const isWrongWay = checkWrongWay(kartState.heading, proj.tangent);
    
    if (isWrongWay) {
      wrongWayAlertCount++;
      // 每 1.2 秒轻微提示
      trackMesh.material.uniforms.uWrongWay.value = 1.0;
    } else {
      trackMesh.material.uniforms.uWrongWay.value = 0.0;
    }
    
    trackMesh.material.uniforms.uTime.value = clock.getElapsedTime();

    // 4. 物理积分更新
    const env = {
      isOffroad: proj.isOffroad,
      time: clock.getElapsedTime()
    };
    
    // 检测是否踩到了赛道中心的加速带
    // 规则：离样条中心极近（dist < 1.2），且处于特定的样条坐标（比如黄昏大直道或起点前）
    const isNearCenter = proj.distance < 1.35;
    // 我们设定 t 在 [0.38, 0.40] 和 [0.72, 0.74] 为两个加速带区域
    const onBoostPad = isNearCenter && ((proj.t > 0.38 && proj.t < 0.40) || (proj.t > 0.72 && proj.t < 0.74));
    if (onBoostPad) {
      env.boostActive = true;
    }

    const nextKartState = integrateKart(kartState, input, dt, env);
    kartState = nextKartState;

    // 5. 比赛进程计算 (门判定)
    const prevCheckpoint = raceState.nextCheckpoint;
    raceState = evaluateRaceProgress(raceState, proj.t, proj.distance, ROAD_HALF_WIDTH, performance.now());
    
    // 如果大门进度更新了，播放叮咚吃门声
    if (raceState.nextCheckpoint !== prevCheckpoint) {
      playGateSound();
    }

    // 6. 完赛结算弹窗
    if (raceState.finished) {
      gameStarted = false;
      playFinishSound();
      
      document.getElementById('finish-total-time').textContent = formatTimePeriod(raceState.totalTimeMs);
      document.getElementById('finish-best-lap').textContent = formatTimePeriod(raceState.bestLapMs);
      
      document.getElementById('game-hud').classList.add('hidden');
      document.getElementById('finish-overlay').classList.remove('hidden');
      
      // 让引擎回归静音
      updateEngineAudio(0, 0, false);
      setDriftAudioActive(false);
    }

    // 7. 更新 3D 模型变换与悬浮高度
    hoverKartGroup.position.set(kartState.x, kartState.y, kartState.z);
    
    // 气垫车旋转：
    // 车体朝向是 heading 轴；但当侧向漂移甩尾时，模型 Mesh 本身会绕 Y 轴多旋转一个侧偏角 (slipAngle)！
    hoverKartGroup.rotation.set(0, kartState.heading + kartState.slipAngle, 0);

    // 根据运动给车体添加前后俯仰或左右侧翻效果 (低模动效细节)
    // 往左拐倾斜，往右拐偏倒，漂移时倾斜更剧烈
    const rollAngle = -input.steer * 0.12 - (kartState.slipAngle * 0.4);
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, rollAngle, 0.12);
    
    // 加速时车尾下沉，减速时车头趴地
    const pitchAngle = input.throttle * 0.04 - input.brake * 0.08;
    body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, pitchAngle, 0.12);

    // 8. 实时调节尾气喷火 Shader 的 Uniform 与缩放
    jetFlameLeft.material.uniforms.uTime.value = clock.getElapsedTime();
    jetFlameLeft.material.uniforms.uBoostType.value = kartState.boostType;
    jetFlameRight.material.uniforms.uBoostType.value = kartState.boostType;

    // 随着车速/小喷调整喷火火焰的尺寸长度
    let flameLength = 0.5 + (Math.abs(kartState.speed) / 36.0) * 1.5;
    if (kartState.boostTime > 0) flameLength *= 1.8;
    jetFlameLeft.scale.set(1, 1, flameLength);
    jetFlameRight.scale.set(1, 1, flameLength);

    // 9. 更新发光胎痕 Mesh
    // 获取左右侧翼底端的实时世界坐标
    const leftEmitWorld = new THREE.Vector3(-1.6, -0.2, -0.65).applyMatrix4(hoverKartGroup.matrixWorld);
    const rightEmitWorld = new THREE.Vector3(1.6, -0.2, -0.65).applyMatrix4(hoverKartGroup.matrixWorld);
    
    // 根据是否在漂移，将左右偏移点送入胎痕系统
    const isDrifting = Math.abs(kartState.slipAngle) > 0.05;
    updateTrailGeometry(leftTrailMesh, leftTrailPoints, leftEmitWorld, rightEmitWorld, isDrifting);
    updateTrailGeometry(rightTrailMesh, rightTrailPoints, leftEmitWorld, rightEmitWorld, isDrifting);

    if (isDrifting) {
      // 改变胎痕材质的霓虹色为蓝色或紫色以契合小喷级别
      if (kartState.driftLevel === 2) {
        trailMaterial.uniforms.uColor.value.set('#a855f7');
      } else {
        trailMaterial.uniforms.uColor.value.set('#38bdf8');
      }
    }

    // 10. Web Audio 引擎声与胎噪微调
    updateEngineAudio(kartState.speed, input.throttle, kartState.boostTime > 0);
    setDriftAudioActive(isDrifting);

    // 11. 同步 HUD 界面数据
    updateHUD(performance.now());
  }

  // 12. 相机第三人称背后跟随 (Smooth Damping)
  if (hoverKartGroup) {
    // 摄像机相对于赛车的局部目标坐标：背后 14米，高 4.5米
    const relativeCameraOffset = new THREE.Vector3(0, 4.5, -14);
    const cameraOffset = relativeCameraOffset.applyMatrix4(hoverKartGroup.matrixWorld);

    // 顺滑插值相机位置
    camera.position.lerp(cameraOffset, 0.1);
    
    // 相机投射目标是赛车前方 3 米的虚焦点，更具视觉纵深感
    const targetLookAt = new THREE.Vector3(0, 0.5, 3).applyMatrix4(hoverKartGroup.matrixWorld);
    camera.lookAt(targetLookAt);
  }

  renderer.render(scene, camera);
}

// ----------------------------------------------------
// 解锁与启动交互
// ----------------------------------------------------
function startGame() {
  // 1. 初始化并唤醒 Web Audio 合成器
  initAudio();
  
  // 2. 开启时钟
  clock.start();
  
  // 3. 关闭启动遮罩，显示 HUD
  document.getElementById('start-overlay').classList.add('hidden');
  document.getElementById('game-hud').classList.remove('hidden');
  
  gameStarted = true;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.onload = () => {
  init();
  
  document.getElementById('btn-start').addEventListener('click', startGame);
  document.getElementById('btn-restart').addEventListener('click', resetGame);
};
