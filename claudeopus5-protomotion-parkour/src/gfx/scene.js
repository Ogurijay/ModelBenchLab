// 渲染场景:关卡盒 + 太阳 + 天空 + 雾 + 阴影。
//
// 这一层只**读**关卡数据,不参与仿真 —— 仿真侧拿同一份 protoCourse 自己建 CollisionWorld。
// 两边共用数据源而不是互相传引用,是为了让 node 里的自检和浏览器里的画面永远描述同一个关卡。
//
// 坐标:直接用 protoCourse 的厘米、Z-up 数值,不做任何换算(PORT_SPEC §0)。
// 一旦在渲染层偷偷转成 Y-up,相机、阴影相机、探针可视化就得各转一次,错一处能查半天。
import * as THREE from 'three';
import { STRUCTURES, PALETTE, LIGHTING, ueRotatorToQuaternion } from '../levels/protoCourse.js';

// ---------------------------------------------------------------------------
// 外观参数。PORT_SPEC §4 末尾明确「外观求神似即可,不作为对齐项」,
// 所以下面这些数是按可读性调的,**不是**从 UE 抄的,改动它们不影响 13 项自检。
// ---------------------------------------------------------------------------

/** 阴影正交相机的半边长:覆盖 400 m 场地(PORT_SPEC §0「阴影相机范围按场地 ±20000 配」)。 */
const SHADOW_EXTENT = 20000;
/** 40000 cm / 4096 ≈ 10 cm 一个 texel。再小一档就看不清 80 cm 矮块的投影了。 */
const SHADOW_MAP_SIZE = 4096;
/** 太阳离场地中心多远。只决定阴影相机的 near/far,不影响光照方向。 */
const SUN_DISTANCE = 30000;

/**
 * UE 的 intensity 6 是 lux,three 的方向光强度不是同一套单位,只借相对量级。
 * 这个系数是按 ACES 曝光下「橙墙不过曝、地面不发灰」试出来的。
 */
const SUN_LUX_TO_THREE = 0.45;

/**
 * 雾密度 —— **非对齐项,数值是我自己定的**。
 * UE 那个 0.004 是 ExponentialHeightFog 的高度雾参数,和 three 的 FogExp2 不是一回事;
 * 把 0.004 直接当 FogExp2 密度用(距离单位是厘米)会在 10 m 外就全白。
 * 这里按目标反解:要求 200 m 处约三成雾、看得清轮廓 →
 *   1 - exp(-(d * 20000)^2) = 0.35  →  d ≈ 3.2e-5
 * 副产物:100 m 处 ~10%,400 m(场地对角)处 ~80%,正好把地面边缘藏进雾里。
 */
const FOG_DENSITY = 3.2e-5;

/** 天空渐变三段色。horizon 与雾同色,远处的盒才能真正「融进」天空而不是贴上去。 */
const SKY_HORIZON = 0x9db3c2;
const SKY_ZENITH = 0x2b5d94;
const SKY_GROUND = 0x39413f;
const SUN_TINT = 0xfff1d8;
/** 天空球半径:跟着相机走(见 onBeforeRender),所以只需落在 near/far 之间。 */
const SKY_RADIUS = 30000;

/** 地面网格:40000 cm 铺满地板,40 格 → 每格 10 m,用来目测「那面墙有多高」。 */
const GRID_SIZE = 40000;
const GRID_DIVISIONS = 40;

/**
 * UE FRotator → 前向单位向量(Z-up、X 前 / Y 右 / Z 上),即 `FRotator::Vector()`
 * = `FRotationMatrix` 的第 0 行 = (cos p · cos y, cos p · sin y, sin p)。
 * 方向光的「朝向」就是光线传播方向,所以灯要摆在 -forward 一侧。
 *
 * 实现直接借 protoCourse 的 `ueRotatorToQuaternion` 把 (1,0,0) 转过去,**不再另写一遍三角式**:
 * 之前两处各写一份,结果 pitch 的符号一处对一处错(关卡的斜板被镜像了),
 * 而两份都「看起来合理」所以谁都没发现。同一个约定只留一个实现。
 */
export function ueRotatorForward(pitchDeg, yawDeg, rollDeg = 0) {
  return new THREE.Vector3(1, 0, 0)
    .applyQuaternion(ueRotatorToQuaternion(pitchDeg, yawDeg, rollDeg));
}

/** 渲染器口味统一在一处设,createRenderer 与 createScene 都走它,免得两边漂。 */
export function configureRenderer(renderer) {
  renderer.shadowMap.enabled = true;
  // three r185 起 PCFSoftShadowMap 已废弃(内部就退回 PCFShadowMap 并打警告),直接用后者保持控制台干净。
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

/** antialias 只能在构造时给,所以渲染器的创建也放在这儿,main.js 直接用。 */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  // 4K 屏上按 devicePixelRatio 全量渲染会把 4096 阴影图的开销放大到不值得,封在 2。
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  return configureRenderer(renderer);
}

/** PALETTE 的线性色 → 共享材质。同色的盒必须共用实例,17 个盒只该有 7 份材质。 */
function buildMaterials() {
  const byKey = new Map();
  for (const [key, rgb] of Object.entries(PALETTE)) {
    const color = new THREE.Color();
    // UE 的 LinearColor 就是线性值,而 three 的工作空间也是线性 sRGB,
    // 所以显式按 LinearSRGB 灌进去 —— 走 setHex 会被当成 sRGB 再解码一次,颜色会发暗。
    color.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
    byKey.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  }
  return byKey;
}

/**
 * 装配整个可视场景。
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{ scene, sun, blocks, blocksById, sky, grid, dispose }}
 */
export function createScene(renderer) {
  if (renderer) configureRenderer(renderer);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(SKY_HORIZON, FOG_DENSITY);

  // --- 关卡盒 --------------------------------------------------------------
  const materials = buildMaterials();
  const geometries = [];
  const blocks = [];
  const blocksById = new Map();

  // 原型关卡全是同色素盒,不描棱线就看不出体积,更别提估高度。
  // 极淡的一层白边,足够读出转角又不抢主色。
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xdfe8ee,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });

  for (const s of STRUCTURES) {
    const geo = new THREE.BoxGeometry(s.sizeM[0] * 100, s.sizeM[1] * 100, s.sizeM[2] * 100);
    geometries.push(geo);

    const mesh = new THREE.Mesh(geo, materials.get(s.material) || materials.get('floor'));
    mesh.name = s.id;
    mesh.position.fromArray(s.center);
    mesh.quaternion.copy(s.quat);
    // 关卡是静态的:自己 updateMatrix 一次,省掉每帧 17 次矩阵重算。
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    // 地板不投影 —— 它是场地里最大的盒,投出去的只有阴影图边界上的浪费。
    mesh.castShadow = s.id !== 'Floor';
    mesh.receiveShadow = true;
    // 让调试时点到盒就能知道它是为哪条边界存在的(protoCourse 的 tests 字段)。
    mesh.userData.structure = s;

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMaterial);
    geometries.push(edges.geometry);
    edges.matrixAutoUpdate = false;
    mesh.add(edges);

    scene.add(mesh);
    blocks.push(mesh);
    blocksById.set(s.id, mesh);
  }

  // --- 太阳 ----------------------------------------------------------------
  const forward = ueRotatorForward(LIGHTING.sunRotation.pitch, LIGHTING.sunRotation.yaw);
  const sun = new THREE.DirectionalLight(0xfff4e2, LIGHTING.sunIntensity * SUN_LUX_TO_THREE);
  sun.position.copy(forward).multiplyScalar(-SUN_DISTANCE);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);

  const sc = sun.shadow.camera;
  // 阴影相机也在 Z-up 世界里 lookAt,up 不改的话光源正对 ±Z 时会翻转甚至退化。
  sc.up.set(0, 0, 1);
  sc.left = -SHADOW_EXTENT;
  sc.right = SHADOW_EXTENT;
  sc.top = SHADOW_EXTENT;
  sc.bottom = -SHADOW_EXTENT;
  sc.near = 100;
  sc.far = SUN_DISTANCE * 2.5;
  sc.updateProjectionMatrix();
  // 厘米尺度 + 10 cm/texel:normalBias 得按厘米给,不然 60 m 高塔的侧面会自己长出条纹。
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 15;

  scene.add(sun);
  scene.add(sun.target);

  // 天光补光:UE 那边是实时捕获的 SkyLight,这里用半球光顶替(非对齐项)。
  const hemi = new THREE.HemisphereLight(SKY_HORIZON, SKY_GROUND, 0.85);
  scene.add(hemi);

  // --- 天空 ----------------------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: new THREE.Color(SKY_ZENITH) },
      uHorizon: { value: new THREE.Color(SKY_HORIZON) },
      uGround: { value: new THREE.Color(SKY_GROUND) },
      uSunColor: { value: new THREE.Color(SUN_TINT) },
      // 指向太阳的方向 = 光线传播方向取反。
      uSunDir: { value: forward.clone().negate() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vWorld;

      void main() {
        // 用视线方向而不是顶点位置取渐变:相机在球心附近平移时地平线才不会跟着歪。
        vec3 dir = normalize(vWorld - cameraPosition);
        float up = clamp(dir.z, -1.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(max(up, 0.0), 0.55));
        col = mix(uGround, col, smoothstep(-0.10, 0.02, up));
        float s = max(dot(dir, uSunDir), 0.0);
        col += uSunColor * (pow(s, 320.0) * 2.2 + pow(s, 7.0) * 0.10);
        // 满屏渐变在 8 bit 输出上必起色带,撒半个色阶的噪声打散。
        float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        col += (n - 0.5) / 255.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  // 不写深度 + 最先画:后面所有几何体无论远近都盖得住它,于是球半径与 far 无关。
  sky.renderOrder = -1000;
  // 自己跟住相机,免得玩家跑到场地角上(离原点 290 m)时天穹被 far 平面切掉。
  // three 在 onBeforeRender 之后才算 modelViewMatrix,所以这里改位置是有效的。
  sky.onBeforeRender = (_r, _s, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld(true);
  };
  scene.add(sky);

  // --- 地面网格 ------------------------------------------------------------
  // GridHelper 默认铺在 XZ 面(Y-up 假设),转到 XY 才是我们的地面。
  const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVISIONS, 0x6f8794, 0x475560);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = 0.6; // 地板上表面在 Z=0,抬一点躲开 z-fighting
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  grid.material.depthWrite = false;
  scene.add(grid);

  function dispose() {
    for (const g of geometries) g.dispose();
    for (const m of materials.values()) m.dispose();
    edgeMaterial.dispose();
    skyGeo.dispose();
    skyMat.dispose();
    grid.geometry.dispose();
    grid.material.dispose();
    sun.shadow.dispose();
    // 只摘自己加的东西:角色 rig 是 main.js 挂上来的,不能替它决定生命周期。
    for (const mesh of blocks) scene.remove(mesh);
    scene.remove(sun);
    scene.remove(sun.target);
    scene.remove(hemi);
    scene.remove(sky);
    scene.remove(grid);
    blocks.length = 0;
    blocksById.clear();
  }

  return { scene, sun, blocks, blocksById, sky, grid, dispose };
}
