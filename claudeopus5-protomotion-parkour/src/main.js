// 装配层 —— 把 12 个模块拼成一个能跑的页面。
//
// 这里只做四件事,任何一条「业务」都不该出现在本文件:
//   1. 渲染器 / 场景 / 相机的建立,窗口尺寸与 DPR;
//   2. 载入角色 —— 失败就退化成一根胶囊。**移动系统不依赖动画**,这条必须保住:
//      GLB 是 5 MB 的外部资源,它挂了页面也得能玩、13 项自检也得能跑;
//   3. 主循环:固定步长仿真(DERIVED.FixedStep)+ 每帧一次渲染,两者解耦、渲染侧插值;
//   4. 接线:输入 → 意图 → world.step、UI 回调、window.__bench 调试口。
//
// 一条贯穿全文的原则:**仿真的时间轴只由 accumulator 决定,不由渲染帧决定**。
// 渲染帧只负责「取当前仿真状态的一个插值快照画出来」。混在一起写会让帧率变成手感参数,
// 而这是一次对照实现 —— 手感必须与 UE 侧逐条对齐,不能因为换了台显示器就不一样。

import * as THREE from 'three';

import { ProtoAnimInstance } from './anim/animInstance.js';
import { ALEX_GLB_URL, loadAlexRig } from './anim/rig.js';
import { runSelfTest } from './core/selftest.js';
import { createCamera, setCameraAspect, SpringArmCamera } from './gfx/camera.js';
import { createRenderer, createScene } from './gfx/scene.js';
import { PLAYER_START } from './levels/protoCourse.js';
import { InputState } from './sim/input.js';
import { CHARACTER, DERIVED } from './sim/protoTypes.js';
import { ProtoWorld } from './sim/world.js';
import { Hud } from './ui/hud.js';
import { Overlay } from './ui/overlay.js';

// ---------------------------------------------------------------------------
// 表现层常量。手感常量一律在 protoTypes.js —— 这里一个都不重定义。
// 下面这些只影响「画面多久刷一次」「插值怎么吸附」,不影响任何状态判定。
// ---------------------------------------------------------------------------

/** 单个渲染帧允许追赶的仿真时间上限。PORT_SPEC §6.5:单帧最多 8 步。 */
const RENDER_CATCHUP = DERIVED.FixedStep * DERIVED.MaxStepsPerFrame;

/**
 * 后台兜底 tick 的追赶上限。它不是渲染帧,所以不受「单帧 8 步」那条约束。
 * 放宽到 0.5 s 是因为隐藏标签页里定时器被节流到约 1 s 一次,只给 8 步(67 ms)
 * 等于让角色彻底冻住 —— 而本仓库的无头验证经常就在后台标签页里跑。
 * 之所以仍然要有上限:标签页藏了五分钟,回来时绝不能一次补算三万步。
 */
const BACKGROUND_CATCHUP = 0.5;

/** 兜底 tick 的间隔(ms)。 */
const FALLBACK_INTERVAL_MS = 50;
/** rAF 静默超过这么久才认为它停了,兜底才接手 —— 否则两条路会互相抢帧。 */
const FALLBACK_IDLE_MS = 200;

/** 相机滞后与 FPS 读数用的帧时长上限:单帧再长也按这个算,免得一次卡顿把相机甩飞。 */
const MAX_FRAME_DT = 0.25;
/** FPS 一阶低通系数。 */
const FPS_SMOOTHING = 0.12;

/**
 * 一步之内位移超过这么多就当「传送」,插值直接吸附到新位置。
 * 合法的单步位移上限约 (SprintSpeed + WallStickForce) / 120 ≈ 15 cm,
 * 300 cm 留了 20 倍余量:够宽,不会误判正常移动;够窄,传送时不会拖出一条横穿全场的插值。
 */
const TELEPORT_SNAP_DIST = 300;

/** 初始俯仰。与 gfx/camera.js 里 SpringArmCamera 的默认 -10° 对齐,省得第一帧自己跳一下。 */
const INITIAL_PITCH_DEG = -10;

/**
 * 掉到这个高度以下就自动回出生点 —— UE `WorldSettings.KillZ` + 世界边界检查的等价物。
 *
 * 地板只有 400 × 400 m,冲刺 1500 cm/s 十几秒就能跑出边缘;没有这道兜底的话
 * 角色会一直往下掉、永远回不来(实测掉到 −2176 m 仍在加速),只能靠暂停菜单手动重开。
 * 阈值取 −5000 cm:比最深的合法位置(地板下表面 −200)低得多,又不至于让人干等太久。
 */
const KILL_Z = -5000;

/** __bench.step() 单次最多推进的仿真时间(秒)。调试口不该有能锁死页面的本事。 */
const BENCH_MAX_STEP_SECONDS = 60;

/**
 * GLB 取件的**停滞**超时:这么久没有新字节进来就 abort(不是限制总时长,慢网不该被误杀)。
 * 5 MB 在 200 kB/s 上要 25 s,但那期间字节是一直在进来的。
 */
const GLB_STALL_TIMEOUT_MS = 20000;
/** 整个角色载入(含 GLTFLoader 直取那条退路)的最后期限。超了就落到胶囊替身,别让载入层永久盖着。 */
const CHARACTER_LOAD_DEADLINE_MS = 60000;

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
/** glTF 是 Y-up,角色要立进 Z-up 世界:meshRoot.quaternion = Rz(yaw + meshYaw) * Rx(+90°)。 */
const Z_UP_QUAT = new THREE.Quaternion().setFromAxisAngle(AXIS_X, Math.PI / 2);

// ---------------------------------------------------------------------------
// 兜底:任何未捕获的异常都要在页面上留下痕迹
// ---------------------------------------------------------------------------

const loadingEl = document.getElementById('loading');
/** #loading 里的文字节点(第二个子元素,第一个是转圈)。载入进度与致命错误都写它。 */
const loadingTextEl = loadingEl ? loadingEl.querySelector('div:last-child') : null;

let fatalShown = false;
/**
 * 启动是否已经走完(载入层收起)。
 * 启动前后对「未捕获异常」的处理必须不一样 —— 见 reportUncaught。
 */
let booted = false;

/**
 * 把一行字压在载入层上。
 * 没有这条路的话,WebGL 不可用 / 模块解析失败会表现成「永远转圈」——
 * 那是最难排查的一种失败,因为控制台之外什么线索都没有。
 *
 * @param {boolean} fatal 真:锁住这条消息,后续的载入进度不再覆盖它。
 */
function showOverlayMessage(message, fatal = false) {
  if (fatalShown) return; // 已经有更严重的消息占着位置
  if (fatal) fatalShown = true;
  if (loadingEl) loadingEl.style.display = 'flex';
  if (loadingTextEl) {
    loadingTextEl.textContent = message;
    loadingTextEl.style.color = '#f87171';
    loadingTextEl.style.maxWidth = '70vw';
    loadingTextEl.style.textAlign = 'center';
    loadingTextEl.style.lineHeight = '1.7';
  }
  const ring = loadingEl ? loadingEl.querySelector('.ring') : null;
  if (ring) ring.style.animation = 'none';
}

function showFatal(message) {
  showOverlayMessage(`启动失败:${message}`, true);
}

/**
 * 未捕获异常的唯一落地点。**启动阶段和启动之后必须分开处理**:
 *
 *   启动阶段 —— 页面上什么都没有,只能把消息压在载入层上并锁住,否则就是「永远转圈」。
 *   启动之后 —— 改用一条不挡视线的横幅。`#loading` 是不透明的全屏层(z-index 100),
 *     启动后再把它翻出来 = 「一次瞬时异常把页面永久变黑」,而底下的主循环、13 项自检、
 *     移动系统其实全都还在正常工作;而且那时写「启动失败」文案本身就是错的。
 */
function reportUncaught(message) {
  if (!booted) {
    showFatal(message);
    return;
  }
  console.error('[main] 运行期未捕获异常:', message);
  showTopBanner('runtime-error-note', `运行期异常:${message}`, message, '#f87171');
}

// 必须在其余代码之前注册:模块求值阶段抛出的错误也会走 window 的 error 事件,
// 早一步挂上监听,连「import 失败」都能显示出来。
window.addEventListener('error', (e) => {
  reportUncaught((e.error && e.error.message) || e.message || '未知错误');
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  reportUncaught((r && r.message) || String(r || '未知错误'));
});

function setLoadingText(text) {
  if (loadingTextEl && !fatalShown) loadingTextEl.textContent = text;
}

// ---------------------------------------------------------------------------
// 渲染栈
// ---------------------------------------------------------------------------

const canvas = document.getElementById('view');
const renderer = createRenderer(canvas);
const view = createScene(renderer);
const camera = createCamera(window.innerWidth / Math.max(1, window.innerHeight));

/**
 * 尺寸与 DPR。
 * DPR 在这里再钳一次(createRenderer 里已经钳过):把窗口从 4K 屏拖到 1080p 屏时
 * devicePixelRatio 会变,不重设的话渲染分辨率会一直停在搬家之前那块屏的值。
 */
function resize() {
  const w = window.innerWidth;
  const h = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  // 走 setCameraAspect 而不是直接改 camera.aspect:水平 FOV 要恒定在 90°(UE 的 FieldOfView 是水平角)。
  setCameraAspect(camera, w / h);
}
resize();
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// 仿真栈。与自检共用同一个 ProtoWorld 类 —— 页面里跑的和 node 里跑的是同一份仿真。
// ---------------------------------------------------------------------------

const world = new ProtoWorld();
const { body, movement } = world;
const arm = new SpringArmCamera(camera, world.collision);

const input = new InputState({
  // 指针锁交给 Overlay 独占:它以 pointerlockchange 为「暂停」的唯一事实源,
  // 这边再插一只手请求锁定,会出现「暂停面板开着但指针又被锁走」的分裂状态。
  autoPointerLock: false,
});
input.yawDeg = PLAYER_START.yawDeg;
input.pitchDeg = INITIAL_PITCH_DEG;
input.attach(canvas);

const hud = new Hud();
const overlay = new Overlay({ canvas });

// ---------------------------------------------------------------------------
// 主循环状态
// ---------------------------------------------------------------------------

let running = false;
/** 仿真时间欠账。渲染帧把真实时间加进来,循环按固定步长把它花掉。 */
let accumulator = 0;
let lastFrameMs = now();
let lastRafMs = -Infinity;
let fps = 0;

/**
 * 渲染插值用的两个快照。仿真是 120 Hz、渲染可能是 60 Hz 或 144 Hz,
 * 直接画 body.position 会在两者不整除时看到周期性抖动(经典的 stutter)。
 */
const prevPos = new THREE.Vector3().copy(body.position);
const currPos = new THREE.Vector3().copy(body.position);
let prevYaw = body.yaw;
let currYaw = body.yaw;
/** 本帧插出来的渲染位姿。相机与角色网格都用它,不各算一遍。 */
const renderPos = new THREE.Vector3().copy(body.position);
let renderYaw = body.yaw;

/** 角色。rig 为 null 表示还没载好;degraded 表示 GLB 没拿到、正在用胶囊顶替。 */
let rig = null;
let anim = null;
let degraded = false;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** 角度差归一化到 (-180, 180],给 yaw 插值取最短弧 —— 否则 179° → -179° 会绕一整圈。 */
function wrapDeg(a) {
  let d = a % 360;
  if (d > 180) d -= 360;
  else if (d <= -180) d += 360;
  return d;
}

// ---------------------------------------------------------------------------
// 角色视觉
// ---------------------------------------------------------------------------

/**
 * GLB 拿不到时的替身。
 * 刻意做成与 rig.js 返回值同构(meshRoot 原点在**脚底**、内容按 Y-up 摆),
 * 于是 syncCharacter 一行都不用分支 —— 退化路径和正常路径共用同一段变换代码,
 * 就不会出现「胶囊时朝向对、换成 Alex 就倒着跑」这类只在一条路径上存在的 bug。
 */
function createCapsuleStandIn() {
  const meshRoot = new THREE.Group();
  meshRoot.name = 'CapsuleStandIn';

  const r = CHARACTER.CapsuleRadius;
  const h = CHARACTER.CapsuleHalfHeight;
  // CapsuleGeometry 的 height 是中段长度(不含两端半球),轴向为 +Y。
  const geo = new THREE.CapsuleGeometry(r, 2 * h - 2 * r, 10, 24);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f8fe0, roughness: 0.55 });
  const capsule = new THREE.Mesh(geo, mat);
  capsule.position.y = h; // 原点抬到脚底
  capsule.castShadow = true;
  meshRoot.add(capsule);

  // 一根「鼻子」。没有它就读不出胶囊朝哪边,而朝向正是移动系统里最容易抄错的量。
  const noseGeo = new THREE.BoxGeometry(r * 0.9, r * 0.5, r * 0.5);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0xd9902a, roughness: 0.5 });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  // Rx(+90°) 之后局部 +X 就是世界前向,所以鼻子沿 +X 伸出去。
  nose.position.set(r * 0.9, h * 1.35, 0);
  nose.castShadow = true;
  meshRoot.add(nose);

  // 字段与 loadAlexRig 的返回值对齐(mixer 为 null ⇒ 上层不建 animInstance)。
  return { meshRoot, meshYawDeg: 0, mixer: null, clips: new Map() };
}

/**
 * 顶部横幅。styles.css 不是本文件的地盘,所以样式走内联,颜色借 :root 的变量。
 * 挂在 `#app` 上而不是 `#hud` 上:HUD 在点「开始」之前是 hidden 的,
 * 而横幅要报的事(GLB 退化 / 运行期异常)恰恰可能发生在那之前。
 * 同 id 重复调用只更新文字 —— 连续抛异常不该在页面上堆出一叠横幅。
 */
function showTopBanner(id, text, title, color) {
  const host = document.getElementById('app') || document.body;
  if (!host) return null;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = [
      'position:fixed', 'left:50%', 'top:14px', 'transform:translateX(-50%)',
      'z-index:120', // 高于 #loading(100),否则致命消息会被它盖住
      'padding:5px 14px', 'border-radius:6px', 'background:var(--panel)',
      'font-size:12px', 'letter-spacing:.5px', 'max-width:80vw',
      'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap',
    ].join(';');
    host.appendChild(el);
  }
  el.textContent = text;
  el.title = title || '';
  el.style.border = `1px solid ${color}`;
  el.style.color = color;
  return el;
}

/** GLB 拿不到时的退化提示。 */
function showDegradedBanner(reason) {
  showTopBanner(
    'degraded-note',
    'GLB 缺失,退化为胶囊 · 移动系统与 13 项自检照常',
    reason || '',
    'var(--amber)',
  );
}

/**
 * 把插值出来的位姿写给角色网格。
 *
 * 两条 UE 侧的换算必须在这里、且只在这里做一次:
 *   - 网格相对胶囊**中心**下移 CapsuleHalfHeight = 94(UE 里 Mesh 的相对位置 Z = -94),
 *     因为 rig 的原点在脚底而 body.position 是胶囊中心;
 *   - meshYaw 是模型自带的朝向偏移(rig.js 载入时量出来的),要加在角色 yaw 上。
 */
function syncCharacter() {
  if (!rig) return;
  rig.meshRoot.position.set(
    renderPos.x,
    renderPos.y,
    renderPos.z - CHARACTER.CapsuleHalfHeight,
  );
  rig.meshRoot.quaternion
    .setFromAxisAngle(AXIS_Z, THREE.MathUtils.degToRad(renderYaw + rig.meshYawDeg))
    .multiply(Z_UP_QUAT);
}

/**
 * 载入 Alex。自己 fetch 而不是直接把 URL 交给 GLTFLoader,只为了能报**字节级**进度 ——
 * 5 MB 在慢网上要等好几秒,没有进度条的等待和卡死分不清。
 * 拿到的 Blob 用 objectURL 交给 rig.js(GLB 是自包含的,没有外部贴图,换 URL 不影响解析)。
 */
async function fetchGlbAsObjectUrl(url) {
  // 退化路径只覆盖「失败」,不覆盖「挂住」:代理对 .glb 半开连接、或响应流卡在中途时,
  // 没有超时的话 readyPromise 永不 resolve ⇒ 不透明的 #loading 一直盖着,
  // 而底下的主循环、13 项自检、移动系统其实全都已经就绪。表现是「永远转圈」——
  // 正是本文件开头说要避免的那种最难排查的失败。所以按**无字节增长**计时,而不是按总时长。
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let stallTimer = null;
  const armStallTimer = () => {
    if (!controller) return;
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => controller.abort(), GLB_STALL_TIMEOUT_MS);
  };

  armStallTimer();
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);

    const total = Number(res.headers.get('content-length')) || 0;
    const mb = (n) => (n / (1024 * 1024)).toFixed(1);

    // 没有可读流(老浏览器 / 某些代理)就退回一次性读取:少个进度条,不影响结果。
    if (!res.body || typeof res.body.getReader !== 'function') {
      return URL.createObjectURL(await res.blob());
    }

    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armStallTimer(); // 有字节进来就续命
      chunks.push(value);
      loaded += value.length;
      setLoadingText(
        total > 0
          ? `正在载入 Alex … ${Math.round((loaded / total) * 100)}%(${mb(loaded)} / ${mb(total)} MB)`
          : `正在载入 Alex … ${mb(loaded)} MB`,
      );
    }
    return URL.createObjectURL(new Blob(chunks));
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
  }
}

/**
 * 给一个可能永不 settle 的 promise 加最后期限。
 * GLTFLoader 那条退路自己不带超时,而 `overlay.hideLoading()` 挂在 readyPromise 上 ——
 * 只要有**一条**路能挂住,载入层就收不起来。所以每条路都要有兜底。
 * 超时后原 promise 可能还会在后台完成,但它的结果不会被用到(赛跑输了就整段走 catch)。
 */
function withDeadline(promise, ms, label) {
  let timer = null;
  const deadline = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 超过 ${Math.round(ms / 1000)} s 未完成`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function loadCharacter() {
  let objectUrl = null;
  try {
    setLoadingText('正在载入 Alex …');
    let loaded;
    try {
      objectUrl = await fetchGlbAsObjectUrl(ALEX_GLB_URL);
      loaded = await loadAlexRig(objectUrl);
    } catch (fetchErr) {
      // fetch 走不通(file:// 协议、CSP、代理改写)时还有一条路:让 GLTFLoader 自己去取。
      console.warn('[main] 带进度的载入失败,退回 GLTFLoader 直取', fetchErr);
      setLoadingText('正在载入 Alex …(无进度)');
      loaded = await withDeadline(loadAlexRig(), CHARACTER_LOAD_DEADLINE_MS, 'GLTFLoader 直取');
    }

    // 先把 anim 建起来再挂进场景:建 action 也可能抛(片段与骨架对不上),
    // 半挂状态下走 catch 会同时出现 Alex 和退化胶囊两个角色。
    const instance = new ProtoAnimInstance(loaded.mixer, loaded.clips);
    rig = loaded;
    anim = instance;
    view.scene.add(rig.meshRoot);
    setLoadingText(`Alex 就绪 · ${rig.clips.size} 条动画 · meshYaw ${rig.meshYawDeg}°`);
    if (anim.missingClips.length > 0) {
      console.warn(`[main] ${anim.missingClips.length} 个槽位缺片段,这些状态会退回 Idle`, anim.missingClips);
    }
  } catch (err) {
    // 到这儿说明模型真的没了。**移动系统不依赖动画**,所以只降级视觉,不降级玩法。
    console.error('[main] Alex 载入失败,退化为胶囊', err);
    degraded = true;
    rig = createCapsuleStandIn();
    anim = null; // HUD 的 Clip 行会自然显示 <no anim instance>,与 UE 侧同一条文案
    view.scene.add(rig.meshRoot);
    showDegradedBanner(err && err.message ? err.message : String(err));
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
  syncCharacter();
}

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------

/** 传送 / 重开之后把插值历史清掉,否则角色会从旧位置「飞」到新位置。 */
function resetInterpolation() {
  prevPos.copy(body.position);
  currPos.copy(body.position);
  prevYaw = body.yaw;
  currYaw = body.yaw;
  renderPos.copy(body.position);
  renderYaw = body.yaw;
  accumulator = 0;
}

/**
 * 每个**仿真步**开头重新施加一次意图。
 *
 * 次序照 PORT_SPEC §7 的自检驱动:**施加意图(含 tryJump)→ step(dt)**。
 * 把 tryJump 放到 step 之后会让墙跳丢掉 Jumping 身份(蹬墙后同帧又被条件图抓回墙上),
 * 这是自检第 11 项承重的那条次序,页面这边没理由跟它不一样。
 *
 * 一次性意图(跳 / 翻滚)也在这里消费,而不是在渲染帧里 —— 两个理由:
 *   1) 帧时长不足一步时(高刷屏)那一帧跑 0 个仿真步,在帧里消费等于把这次按键扔掉;
 *   2) __bench.step() 不经过渲染帧,在帧里消费会让无头驱动永远跳不起来。
 *
 * 搬运本身走 InputState.apply()(PORT_SPEC §10 的 `input.apply(world.movement)`),
 * 本文件不再逐字段抄一遍 —— 抄两遍就会漂,而输入方向是相机相对的,漂了很难看出来。
 */
function applyIntent() {
  input.apply(movement);
}

/**
 * 推进仿真并刷新表现。
 * @param {number} nowMs 时间戳(ms)
 * @param {boolean} doRender 这次要不要真的画一帧。后台兜底 tick 传 false —— 隐藏的页面画了也看不见。
 */
function advance(nowMs, doRender) {
  const rawDt = Math.max(0, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;

  // 相机滞后与 FPS 走「表现时间」,单帧再长也钳住,免得一次 GC 把相机甩出去。
  const frameDt = Math.min(rawDt, MAX_FRAME_DT);
  if (doRender && frameDt > 0) {
    const instant = 1 / frameDt;
    fps = fps > 0 ? fps + (instant - fps) * FPS_SMOOTHING : instant;
  }

  let steps = 0;
  if (running) {
    // 防爆的关键一句:欠账**先钳上限再花**。
    // 页面被后台冻住 5 分钟、或断点停了半天,回来时欠账是几百秒;
    // 不钳的话这一帧要跑几万步(浏览器直接假死),之后还要慢动作追很久。
    // 钳掉的时间是真的丢掉了 —— 对单机移动原型来说,丢时间远好过卡死。
    const budget = doRender ? RENDER_CATCHUP : BACKGROUND_CATCHUP;
    accumulator = Math.min(accumulator + rawDt, budget);

    while (accumulator >= DERIVED.FixedStep) {
      prevPos.copy(currPos);
      prevYaw = currYaw;

      applyIntent();
      world.step(DERIVED.FixedStep);

      currPos.copy(body.position);
      currYaw = body.yaw;
      // 传送(自检点、__bench.teleport、病态的解穿透)不该被插值成一段横穿场地的滑行。
      if (currPos.distanceToSquared(prevPos) > TELEPORT_SNAP_DIST * TELEPORT_SNAP_DIST) {
        prevPos.copy(currPos);
        prevYaw = currYaw;
      }

      accumulator -= DERIVED.FixedStep;
      steps += 1;
    }

    // 动画按**仿真时间**推进,不按墙上时钟:欠账被钳掉时世界本来就在慢放,
    // 让动画跟着慢下来才对得上,否则脚步会比位移快。
    if (steps > 0 && anim) anim.update(steps * DERIVED.FixedStep, movement);

    // 掉出世界的兜底。放在步循环之后按帧查就够 —— 从地板边缘掉到 KILL_Z 要好几秒,
    // 不存在「一帧之内穿过去又没被发现」的情况。
    if (body.position.z < KILL_Z) restartToSpawn();
  }

  // 渲染插值:alpha 是「当前欠账占一步的比例」。仿真停着时直接取当前状态。
  const alpha = running ? accumulator / DERIVED.FixedStep : 1;
  renderPos.lerpVectors(prevPos, currPos, alpha);
  renderYaw = prevYaw + wrapDeg(currYaw - prevYaw) * alpha;
  syncCharacter();

  // 相机跟渲染帧走(它是表现层,不参与仿真),目标传**胶囊中心**——
  // 抬到胸口的 90 cm 是 SocketOffset.z 的活儿,在这里再抬一次相机就会飘高。
  arm.update(frameDt, renderPos, input.yawDeg, input.pitchDeg);

  // 暂停时不刷 HUD:轨迹面板每 0.25 s 一行,暂停着刷会用几十行重复内容把历史顶掉,
  // 而「停下来看刚才发生了什么」正是轨迹的用途。
  if (running) hud.update(movement, anim, fps);

  if (doRender) renderFrame();
}

function renderFrame() {
  renderer.render(view.scene, camera);
}

/**
 * 排下一帧写在**最前面**、advance 包在 try 里 —— 两件事都是为了同一个目的:
 * 一次瞬时异常(着色器编译失败、mixer 撞上坏片段、DOM 写入被扩展拦下)不能让整条循环永久停摆。
 * 反过来写(advance 抛 → 后面的 requestAnimationFrame 永远执行不到)的表现是「画面冻住、
 * 只有兜底 tick 在无渲染地推仿真」,而这种失败在控制台里只留一行,极难认。
 */
function frame(nowMs) {
  requestAnimationFrame(frame);
  lastRafMs = nowMs;
  try {
    advance(nowMs, true);
  } catch (err) {
    reportUncaught((err && err.message) || String(err));
  }
}

/**
 * rAF 在隐藏标签页里根本不触发。本仓库的并行会话经常把页面丢到后台跑无头验证,
 * 所以留一条定时器兜底:rAF 静默超过 FALLBACK_IDLE_MS 就由它接手推进仿真。
 * 不画帧 —— 看不见的帧不值得算,而 __bench.shot() 自己会在取图前补一次渲染。
 *
 * 注意隐藏标签页里定时器也会被节流到约 1 s 一次,所以后台的仿真必然是断续的、
 * 而且受 BACKGROUND_CATCHUP 限制会丢时间。要在后台精确驱动请用 __bench.step()。
 */
function fallbackTick() {
  const t = now();
  if (t - lastRafMs < FALLBACK_IDLE_MS) return;
  advance(t, false);
}
setInterval(fallbackTick, FALLBACK_INTERVAL_MS);

// 回到前台时把时间基准重置:欠账已经被钳掉了,没必要再补一次 67 ms 的猛冲。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    lastFrameMs = now();
    accumulator = 0;
  }
});

// ---------------------------------------------------------------------------
// UI 接线
// ---------------------------------------------------------------------------

/** 回出生点。world.reset() 会把意图、滑翔、翻滚一并清掉,这里补的是表现层的那几样。 */
function restartToSpawn() {
  world.reset();
  input.releaseAll();
  input.yawDeg = PLAYER_START.yawDeg;
  input.pitchDeg = INITIAL_PITCH_DEG;
  arm.reset();
  resetInterpolation();
  hud.clearTrace();
  syncCharacter();
}

function resumeLoop() {
  running = true;
  // 从暂停/开始面板回来时,墙上时钟已经走了很久 —— 基准不重置的话第一帧会一口气吃满欠账。
  lastFrameMs = now();
  accumulator = 0;
}

overlay.onStart = () => {
  hud.setVisible(true);
  // 开始面板上按空格会同时「点按钮」和「按跳跃键」——不清掉的话进场第一帧就自己跳一下。
  input.releaseAll();
  resetInterpolation();
  resumeLoop();
};
overlay.onResume = () => resumeLoop();
overlay.onPause = () => {
  running = false;
  // 松开一切:按着 W 去点菜单,回来不该还在跑。releaseAll 也会清掉攒着的跳/翻滚。
  input.releaseAll();
  accumulator = 0;
};
overlay.onRestart = () => restartToSpawn();
overlay.onToggleTrace = () => hud.toggleTrace();
overlay.onRunSelfTest = () => {
  // 自检自己建一个 ProtoWorld,不碰页面这个世界;但键还是先松开,免得跑完回来角色在乱跑。
  input.releaseAll();
  return runSelfTest();
};

/**
 * T = 轨迹开关(UE 的 -ProtoTrace 等价物)。
 * 走点按暂停面板上那颗按钮而不是直接调 hud.toggleTrace():按钮文字由 Overlay 维护,
 * 绕过它会让「T 开了轨迹,按钮上却写着关」。按钮不存在时才直接调 HUD。
 */
function toggleTrace() {
  const btn = document.getElementById('btn-trace');
  if (btn) btn.click();
  else hud.toggleTrace();
}

document.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyT' || e.repeat) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return; // 别抢 Ctrl+T 之类的浏览器快捷键
  toggleTrace();
});

// 上下文丢失(混合显卡切换、驱动重置)会让画面直接冻住而毫无提示 —— 那种失败最难认。
// 不 preventDefault 浏览器就不会再派发 restore 事件;three 的 WebGLRenderer 自己会在
// restore 时重建资源,所以这里只需要管「暂停 + 告诉人一声」。
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  overlay.pause(); // 走 overlay 而不是直接改 running,免得 UI 状态与循环状态脱节
  showOverlayMessage('WebGL 上下文丢失,正在等待恢复…');
});
canvas.addEventListener('webglcontextrestored', () => {
  if (fatalShown) return;
  if (loadingEl) loadingEl.style.display = 'none';
  resize();
});

// 指针锁可能悄悄丢掉(锁请求被策略拒、或 Overlay 还没拿到过锁所以没转暂停)。
// 运行中点一下画面就把它要回来 —— 否则表现是「能跑但转不了视角」,很难看出原因。
canvas.addEventListener('pointerdown', () => {
  if (!running) return;
  if (document.pointerLockElement === canvas) return;
  if (!canvas.requestPointerLock) return;
  const p = canvas.requestPointerLock();
  if (p && typeof p.catch === 'function') p.catch(() => {});
});

// ---------------------------------------------------------------------------
// window.__bench —— 调试 / 无头驱动口
// ---------------------------------------------------------------------------

/** 别名表:让无头脚本能写 __bench.press('w') / press('space') 而不必背 KeyboardEvent.code。 */
const BENCH_KEY_ALIASES = {
  ' ': 'Space', space: 'Space', jump: 'Space',
  shift: 'ShiftLeft', sprint: 'ShiftLeft',
  ctrl: 'ControlLeft', control: 'ControlLeft', roll: 'ControlLeft',
  alt: 'AltLeft', walk: 'AltLeft',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  esc: 'Escape', escape: 'Escape', trace: 'KeyT',
};

function normalizeKeyCode(key) {
  const raw = String(key == null ? '' : key);
  const alias = BENCH_KEY_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  if (raw.length === 1) {
    if (/[a-z]/i.test(raw)) return `Key${raw.toUpperCase()}`;
    if (/[0-9]/.test(raw)) return `Digit${raw}`;
  }
  return raw; // 已经是 code
}

/**
 * 派发到 document:InputState 与本文件的 T 监听都挂在 document 上,
 * Overlay 的 Esc 挂在 window 上 —— 事件会冒泡上去,一次派发三家都收到。
 */
function dispatchKey(type, code) {
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
  document.dispatchEvent(new KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
}

/** 同步推进若干仿真步,并把表现层刷到最新。后台标签页里唯一可靠的驱动方式。 */
function benchStep(seconds) {
  const wanted = Math.max(0, Math.min(Number(seconds) || 0, BENCH_MAX_STEP_SECONDS));
  const count = Math.round(wanted / DERIVED.FixedStep);
  for (let i = 0; i < count; i++) {
    prevPos.copy(currPos);
    prevYaw = currYaw;
    applyIntent();
    world.step(DERIVED.FixedStep);
    currPos.copy(body.position);
    currYaw = body.yaw;
  }
  if (count > 0) {
    if (anim) anim.update(count * DERIVED.FixedStep, movement);
    renderPos.copy(currPos);
    renderYaw = currYaw;
    syncCharacter();
    arm.update(DERIVED.FixedStep, renderPos, input.yawDeg, input.pitchDeg);
    hud.update(movement, anim, fps);
  }
  return count;
}

function benchTeleport(pos, yaw) {
  world.teleport(pos, yaw == null ? body.yaw : yaw);
  if (yaw != null) input.yawDeg = yaw;
  arm.reset();
  resetInterpolation();
  syncCharacter();
  return bench.state();
}

const readyPromise = loadCharacter().then(() => {
  // 有致命错误时别收载入层 —— 那上面正写着唯一的线索。
  if (!fatalShown) overlay.hideLoading();
  // 从这一刻起,「未捕获异常」改走不挡视线的横幅(见 reportUncaught)。
  booted = true;
  // #start 默认就显示着(index.html 里没给它 hidden),不需要再 showStart()。
  return bench.info();
});

const bench = {
  /** GLB 载完(或已确定退化)后 resolve。无头脚本先 await 它,再点开始。 */
  ready: readyPromise,

  info() {
    return {
      degraded,
      meshYawDeg: rig ? rig.meshYawDeg : null,
      clipCount: rig && rig.clips ? rig.clips.size : 0,
      missingClips: anim ? anim.missingClips.slice() : null,
      blocks: view.blocks.length,
      pixelRatio: renderer.getPixelRatio(),
      size: [window.innerWidth, window.innerHeight],
      fixedStep: DERIVED.FixedStep,
    };
  },

  state() {
    return {
      // --- 约定的五项
      motionState: movement.motionState,
      clip: anim ? anim.activeClipName : '<no anim instance>',
      pos: [body.position.x, body.position.y, body.position.z],
      vel: [body.velocity.x, body.velocity.y, body.velocity.z],
      onWall: movement.isOnWall(),
      mode: body.mode,
      // --- 附加读数(排查时省一次来回)
      customMode: body.customMode,
      slot: anim ? anim.activeSlot : null,
      yaw: body.yaw,
      controlYaw: input.yawDeg,
      wallDetected: !!movement.wallProbe.valid,
      ledgeAhead: !!movement.ledgeAhead,
      climbVertical: movement.climbVertical,
      sprinting: movement.isSprinting(),
      gliding: movement.isGliding(),
      rollTimeRemaining: movement.rollTimeRemaining,
      maxSpeed: movement.getMaxSpeed(),
      simTime: world.time,
      running,
      degraded,
      fps: Math.round(fps),
    };
  },

  /** 按一下键。返回 Promise,resolve 时键已松开。 */
  press(key, ms = 80) {
    const code = normalizeKeyCode(key);
    dispatchKey('keydown', code);
    return new Promise((resolve) => {
      setTimeout(() => {
        dispatchKey('keyup', code);
        resolve(code);
      }, Math.max(0, Math.floor(Number(ms) || 0)));
    });
  },

  /** 按住 / 松开。后台标签页里配 __bench.step() 用,不受定时器节流影响。 */
  hold(key, down = true) {
    const keys = Array.isArray(key) ? key : [key];
    const codes = keys.map(normalizeKeyCode);
    for (const code of codes) dispatchKey(down ? 'keydown' : 'keyup', code);
    return codes;
  },

  release() {
    input.releaseAll();
  },

  teleport(pos, yaw) {
    return benchTeleport(pos, yaw);
  },

  step(seconds) {
    return benchStep(seconds);
  },

  selfTest() {
    return runSelfTest();
  },

  /**
   * 截图。**先渲染再取图**是必须的:renderer 没开 preserveDrawingBuffer,
   * 只有在同一个任务里画完立刻读,drawing buffer 才还在(否则拿到的是空白图)。
   */
  shot(type = 'image/png') {
    renderFrame();
    return canvas.toDataURL(type);
  },

  start() {
    overlay.start();
    return running;
  },

  pause() {
    overlay.pause();
    return running;
  },

  restart() {
    restartToSpawn();
    return bench.state();
  },

  trace(on) {
    if (on === undefined) return hud.toggleTrace();
    hud.setTraceVisible(on);
    return hud.isTraceVisible();
  },

  // 逃生舱:出了怪事直接摸内部对象,不用为每个字段加一个 getter。
  internals: { world, movement, body, input, hud, overlay, view, camera, arm, renderer, get rig() { return rig; }, get anim() { return anim; } },
};

window.__bench = bench;

// 载入还在跑,循环先开起来:着色器编译、天空球、阴影贴图都能在等 GLB 的这几秒里做完,
// 玩家点「开始」时就不会撞上第一帧的编译卡顿。
requestAnimationFrame(frame);
