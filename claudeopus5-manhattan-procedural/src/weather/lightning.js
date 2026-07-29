/**
 * @file src/weather/lightning.js
 * @description 雷暴闪电系统（契约 §6.5）：泊松触发、按高度加权选择打击点、
 *              递归分叉折线放电通道、多次 flicker、全局补光与雷声延迟。
 *
 * ---------------------------------------------------------------------------
 * 一、物理与算法出处
 * ---------------------------------------------------------------------------
 * 1) **泊松过程触发**：闪电在雷暴中近似为齐次泊松过程，强度 λ = lightningPerMinute / 60
 *    次/秒。一帧 dt 内至少发生一次的概率 P = 1 − e^(−λ·dt) ≈ λ·dt（λ·dt ≪ 1）。
 *    本实现直接用 `P = rate / 60 * dt`（契约明示写法），并 clamp 到 0.5 以防超大 dt。
 *    注意：一次放电事件持续约 0.2~0.7s，事件进行中不再重复触发（相当于对泊松过程做了
 *    很轻微的"死时间"稀疏化），避免多条通道在同一瞬间叠在一起变成一团白光。
 *
 * 2) **打击点选择**：真实雷击的"引雷"概率随结构高度急剧上升（滚球法 / Golde 击距模型中
 *    等效受雷面积随高度约呈超线性增长）。这里用工程上常用的经验幂律权重 w = h^2.5
 *    （契约指定），再对"相机视锥内或距相机 2500m 内"的目标乘以偏好系数，
 *    保证观众大概率能看见放电，而不是永远劈在背后。
 *
 * 3) **放电通道几何**：先导（stepped leader）以约 25~50m 的"梯级"跳跃前进，每级方向
 *    随机偏折，并不断分叉。本模块用"沿主轴的二维横向随机游走 + 端点锚定 (sin πt 包络)"
 *    近似梯级先导：起点（云底）与终点（打击点）严格固定，中间抖动。分支递归 2~3 级，
 *    每级更短、更细（亮度更低）。
 *
 * 4) **回击闪烁（flicker）**：一次落雷通常包含 1~4 次回击（return stroke），间隔约
 *    40~120ms，亮度逐次衰减（后续回击沿同一电离通道，能量更低）。本实现取 1~3 次，
 *    单次 0.06~0.18s、间隔 0.04~0.12s，几何通道复用同一条（符合真实物理）。
 *
 * 5) **雷声延迟**：声速 343 m/s（20℃ 干空气）。本模块只负责把"打击点到相机的距离"
 *    传给 `ctx.audio.thunder(distanceMeters, strength)`，延迟与音色由 core/audio.js 处理。
 *
 * 6) **云内片状闪（sheet lightning）**：约 40% 的放电发生在云内 / 云际，观众只看到整片
 *    云被内部照亮，没有可见通道；伴随的是远处闷雷。本模块此时不画几何，只推 uFlash
 *    与一盏位于云层高度的点光源。
 *
 * ---------------------------------------------------------------------------
 * 二、性能约定
 * ---------------------------------------------------------------------------
 * - 顶点缓冲**一次性预分配**（按画质 500~1400 段），每次放电只重写前 N 段并调用
 *   `setDrawRange`，绝不 `new BufferGeometry` / `new BufferAttribute`。
 * - PointLight **只有一盏**，复用实例、改位置与强度。
 * - update() 内不创建任何对象：随机游走用标量、正交基用模块级 scratch 数组、
 *   flicker 时间表用预分配的固定长度对象数组。
 * - 无放电时 `lines.visible = false`、`light.visible = false` → 0 drawcall、0 灯光开销。
 *
 * ---------------------------------------------------------------------------
 * 三、与 main.js 的数据流（契约 §2 / §3.7）
 * ---------------------------------------------------------------------------
 *   本模块 update() → 直接写 `env.uFlash.value`（当帧生效，全城材质立即响应）
 *                   → 同时把当前值挂在 `handle.flash`，main.js 下一帧读进 `ctx.weather.flash`。
 *   `ctx` 视为只读，本模块不修改 ctx 的任何字段。
 */

import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { clamp, damp, TWO_PI } from '../core/mathx.js';

/** 声速（m/s，20℃ 干空气）——此处仅用于文档说明，延迟由 audio 模块实现 */
export const SPEED_OF_SOUND = 343;

/** 打击点高度权重指数（契约 §6.5：h^2.5） */
const HEIGHT_WEIGHT_EXP = 2.5;

/** "近处/视锥内"目标的权重偏好倍率 */
const VISIBLE_BIAS = 6.0;

/** 视锥外但距相机小于此距离仍视为"近处"（米） */
const NEAR_RADIUS = 2500;

/** 云内片状闪占比 */
const SHEET_RATIO = 0.4;

/** 主干梯级长度（米） */
const TRUNK_SEG_LEN = 25;

/** 分支梯级长度（米） */
const BRANCH_SEG_LEN = 18;

/** 各画质下的线段容量 */
const SEGMENT_BUDGET = { high: 1400, medium: 900, low: 520 };

/** 各级分支的分叉概率（下标 = 当前层级） */
const BRANCH_PROB = [0.2, 0.16, 0.1];

/** 通道基色（冷白偏蓝，加性混合下主干会过曝成白色） */
const BOLT_COLOR = { r: 0.72, g: 0.82, b: 1.0 };

/** 主干亮度（>1 让核心过曝成白，分支才显出蓝调） */
const TRUNK_BRIGHTNESS = 1.7;

/** PointLight 峰值强度（candela，decay=2 → 100m 处约 12 lux） */
const LIGHT_PEAK = 1.2e5;

/** 单次放电最多 flicker 次数 */
const MAX_FLICKERS = 3;

/* --------------------------------------------------------------------- *
 * 模块级 scratch（避免 update 内分配）
 * --------------------------------------------------------------------- */

/** 主轴的两个正交基向量 */
const BASIS_U = new Float64Array(3);
const BASIS_V = new Float64Array(3);

/** 视锥剔除用的复用对象 */
const _frustum = new THREE.Frustum();
const _projMat = new THREE.Matrix4();
const _point = new THREE.Vector3();

/**
 * 由主轴方向构造一组正交基 (U, V)，写入 BASIS_U / BASIS_V。
 * 取与主轴最不平行的坐标轴做叉乘，避免退化。
 * @param {number} dx 主轴单位向量 x
 * @param {number} dy 主轴单位向量 y
 * @param {number} dz 主轴单位向量 z
 * @returns {void}
 */
function makeBasis(dx, dy, dz) {
  // 选一个与主轴夹角较大的参考轴
  let rx = 0;
  let ry = 0;
  let rz = 1;
  if (Math.abs(dz) > 0.9) {
    rx = 1;
    ry = 0;
    rz = 0;
  }
  // U = normalize(ref × dir)
  let ux = ry * dz - rz * dy;
  let uy = rz * dx - rx * dz;
  let uz = rx * dy - ry * dx;
  let len = Math.hypot(ux, uy, uz);
  if (len < 1e-6) {
    ux = 1;
    uy = 0;
    uz = 0;
    len = 1;
  }
  ux /= len;
  uy /= len;
  uz /= len;
  // V = dir × U（已是单位向量，无需再归一）
  const vx = dy * uz - dz * uy;
  const vy = dz * ux - dx * uz;
  const vz = dx * uy - dy * ux;
  BASIS_U[0] = ux;
  BASIS_U[1] = uy;
  BASIS_U[2] = uz;
  BASIS_V[0] = vx;
  BASIS_V[1] = vy;
  BASIS_V[2] = vz;
}

/**
 * 创建闪电系统（契约 §6.5）。
 *
 * @param {Object} ctx0 构建期上下文 BuildContext：{ plan, heightField, rng, textures, env, quality, seed, tallStructures, audio }
 * @returns {{
 *   object3D: THREE.Group,
 *   flash: number,
 *   update: (ctx: Object) => void,
 *   dispose: () => void,
 *   stats: { strikes: number, segments: number }
 * }} SystemHandle（额外带 `flash` 供 main.js 写入 ctx.weather.flash）
 */
export function createLightning(ctx0) {
  const cfg = ctx0 || {};
  const env = cfg.env || null;
  const quality = SEGMENT_BUDGET[cfg.quality] ? cfg.quality : 'high';
  const maxSegments = SEGMENT_BUDGET[quality];

  // 自己的随机流：同种子必得同一串放电序列（契约 §0）
  const rng =
    cfg.rng && typeof cfg.rng.fork === 'function'
      ? cfg.rng.fork('lightning')
      : makeRng(cfg.seed != null ? cfg.seed : 'lightning', 'lightning');

  /* ------------------------------------------------------------------ *
   * 几何与材质：一次性预分配，全生命周期复用
   * ------------------------------------------------------------------ */

  const positions = new Float32Array(maxSegments * 6); // 每段 2 顶点 × 3 分量
  const colors = new Float32Array(maxSegments * 6);

  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(colors, 3);
  colAttr.setUsage(THREE.DynamicDrawUsage);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('color', colAttr);
  geometry.setDrawRange(0, 0);

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    toneMapped: false // 通道亮度是"自发光"，不参与 ACES 压缩才够刺眼
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.name = 'lightning-bolt';
  lines.frustumCulled = false; // 顶点每次放电重写，包围球无意义
  lines.renderOrder = 12;
  lines.visible = false;

  // 打击点补光：全局唯一，复用实例（契约要求"不要反复 new"）
  const strikeLight = new THREE.PointLight(0xdfe8ff, 0, 1800, 2);
  strikeLight.name = 'lightning-light';
  strikeLight.castShadow = false;
  strikeLight.visible = false;

  const root = new THREE.Group();
  root.name = 'lightning';
  root.add(lines);
  root.add(strikeLight);

  /* ------------------------------------------------------------------ *
   * 运行时状态
   * ------------------------------------------------------------------ */

  /** 当前已写入的线段数 */
  let segCount = 0;

  /** flicker 时间表（预分配，复用；单位秒，相对放电起点） */
  const flickers = [];
  for (let i = 0; i < MAX_FLICKERS; i++) flickers.push({ start: 0, dur: 0, amp: 0 });
  let flickerCount = 0;

  /** 本次放电总时长 */
  let strikeTotal = 0;

  /** 放电已进行时间；< 0 表示当前空闲 */
  let strikeTime = -1;

  /** 是否为云内片状闪（无可见通道） */
  let isSheet = false;

  /** 补光位置（打击点或云内闪的云团中心） */
  const lightPos = new THREE.Vector3();

  /** 当前闪光强度 0..1 */
  let flash = 0;

  const stats = { strikes: 0, segments: 0 };

  // 句柄先建好（update / dispose 是函数声明，已提升），这样内部就能安全写 handle.flash
  const handle = {
    object3D: root,
    flash: 0,
    update,
    dispose,
    stats
  };

  /* ------------------------------------------------------------------ *
   * 几何写入
   * ------------------------------------------------------------------ */

  /**
   * 写入一条线段（超出容量则静默丢弃，保证绝不越界）。
   * @param {number} ax @param {number} ay @param {number} az 起点
   * @param {number} bx @param {number} by @param {number} bz 终点
   * @param {number} bright 亮度倍率（乘到 BOLT_COLOR 上）
   * @returns {boolean} 是否写入成功
   */
  function pushSegment(ax, ay, az, bx, by, bz, bright) {
    if (segCount >= maxSegments) return false;
    const i = segCount * 6;
    positions[i] = ax;
    positions[i + 1] = ay;
    positions[i + 2] = az;
    positions[i + 3] = bx;
    positions[i + 4] = by;
    positions[i + 5] = bz;
    const cr = BOLT_COLOR.r * bright;
    const cg = BOLT_COLOR.g * bright;
    const cb = BOLT_COLOR.b * bright;
    colors[i] = cr;
    colors[i + 1] = cg;
    colors[i + 2] = cb;
    colors[i + 3] = cr;
    colors[i + 4] = cg;
    colors[i + 5] = cb;
    segCount++;
    return true;
  }

  /**
   * 递归生成一条放电通道（梯级先导 + 分叉）。
   *
   * 中间点 = 直线插值点 + (U,V) 平面内的随机游走偏移 × sin(πt)^0.75 包络。
   * 包络在 t=0 与 t=1 处归零，因此**起点与终点严格锚定**（云底 → 打击点），
   * 中段最大偏折；随机游走里以 12% 概率给一次 2.6 倍"急拐"，模拟梯级先导的折角。
   *
   * @param {number} sx @param {number} sy @param {number} sz 起点
   * @param {number} ex @param {number} ey @param {number} ez 终点
   * @param {number} level 当前层级（0 = 主干）
   * @param {number} bright 亮度倍率
   * @param {number} jitter 单步横向抖动尺度（米）
   * @param {number} maxLevel 最大递归层级（2 或 3）
   * @returns {void}
   */
  function drawBranch(sx, sy, sz, ex, ey, ez, level, bright, jitter, maxLevel) {
    const dx = ex - sx;
    const dy = ey - sy;
    const dz = ez - sz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 4 || segCount >= maxSegments) return;

    const segLen = level === 0 ? TRUNK_SEG_LEN : BRANCH_SEG_LEN;
    const maxN = level === 0 ? 56 : 18;
    const n = Math.max(3, Math.min(maxN, Math.round(len / segLen)));

    const inv = 1 / len;
    const dirX = dx * inv;
    const dirY = dy * inv;
    const dirZ = dz * inv;
    makeBasis(dirX, dirY, dirZ);
    const ux = BASIS_U[0];
    const uy = BASIS_U[1];
    const uz = BASIS_U[2];
    const vx = BASIS_V[0];
    const vy = BASIS_V[1];
    const vz = BASIS_V[2];

    // 横向随机游走的累计偏移（U,V 平面内的二维标量）
    let offU = 0;
    let offV = 0;
    let px = sx;
    let py = sy;
    let pz = sz;

    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const kick = rng.next() < 0.12 ? 2.6 : 1.0;
      offU += rng.gauss(0, 1) * jitter * kick;
      offV += rng.gauss(0, 1) * jitter * kick;

      const envlp = Math.pow(Math.sin(Math.PI * t), 0.75);
      const lat = envlp;
      const cx = sx + dx * t + (ux * offU + vx * offV) * lat;
      const cy = sy + dy * t + (uy * offU + vy * offV) * lat;
      const cz = sz + dz * t + (uz * offU + vz * offV) * lat;

      if (!pushSegment(px, py, pz, cx, cy, cz, bright)) return;

      // 分叉：越靠近云底越容易分岔，越往下分支越短
      if (level < maxLevel && i < n - 1) {
        const prob = BRANCH_PROB[level] !== undefined ? BRANCH_PROB[level] : 0.1;
        if (rng.next() < prob) {
          const remain = len * (1 - t);
          const blen = clamp(remain * rng.range(0.3, 0.62), 12, 260);
          // 分支方向：主轴绕 (U,V) 偏折 20°~66°
          const ang = rng.range(0.35, 1.15);
          const phi = rng.range(0, TWO_PI);
          const sa = Math.sin(ang);
          const ca = Math.cos(ang);
          const cp = Math.cos(phi);
          const sp = Math.sin(phi);
          const bdx = dirX * ca + (ux * cp + vx * sp) * sa;
          const bdy = dirY * ca + (uy * cp + vy * sp) * sa;
          const bdz = dirZ * ca + (uz * cp + vz * sp) * sa;
          drawBranch(
            cx, cy, cz,
            cx + bdx * blen, cy + bdy * blen, cz + bdz * blen,
            level + 1,
            bright * 0.5,
            jitter * 0.75,
            maxLevel
          );
          if (segCount >= maxSegments) return;
        }
      }

      px = cx;
      py = cy;
      pz = cz;
    }
  }

  /* ------------------------------------------------------------------ *
   * 打击点选择
   * ------------------------------------------------------------------ */

  /**
   * 从 `ctx.tallStructures` 按 h^2.5 加权抽取打击点，视锥内 / 2500m 内的目标加权。
   * 表为空时退化为相机附近的随机高空点。
   *
   * @param {Object} ctx FrameContext
   * @param {THREE.Vector3} out 写入的打击点
   * @returns {string} 目标名称（用于调试与统计）
   */
  function pickStrikePoint(ctx, out) {
    const list = Array.isArray(ctx.tallStructures) ? ctx.tallStructures : null;
    const cam = ctx.camera || null;

    if (cam) {
      _projMat.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_projMat);
    }

    if (list && list.length > 0) {
      // 第一遍：累计总权重
      let total = 0;
      for (let i = 0; i < list.length; i++) {
        total += structureWeight(list[i], cam);
      }
      if (total > 0) {
        // 第二遍：轮盘赌
        let r = rng.next() * total;
        for (let i = 0; i < list.length; i++) {
          r -= structureWeight(list[i], cam);
          if (r <= 0) {
            const s = list[i];
            out.set(s.x || 0, s.y || 0, s.z || 0);
            return s.name || 'structure';
          }
        }
        const last = list[list.length - 1];
        out.set(last.x || 0, last.y || 0, last.z || 0);
        return last.name || 'structure';
      }
    }

    // 退化：相机前方的随机高空点
    const cx = cam ? cam.position.x : 0;
    const cz = cam ? cam.position.z : 0;
    const ang = rng.range(0, TWO_PI);
    const dist = rng.range(400, 1800);
    out.set(cx + Math.cos(ang) * dist, rng.range(160, 340), cz + Math.sin(ang) * dist);
    return '高空';
  }

  /**
   * 单个结构的引雷权重：h^2.5，视锥内或 2500m 内乘以偏好系数。
   * @param {{x:number,y:number,z:number}} s
   * @param {THREE.PerspectiveCamera|null} cam
   * @returns {number}
   */
  function structureWeight(s, cam) {
    if (!s || typeof s.y !== 'number' || !Number.isFinite(s.y)) return 0;
    const h = Math.max(1, s.y);
    let w = Math.pow(h, HEIGHT_WEIGHT_EXP);
    if (cam) {
      _point.set(s.x || 0, s.y, s.z || 0);
      const near = _point.distanceTo(cam.position) < NEAR_RADIUS;
      if (near || _frustum.containsPoint(_point)) w *= VISIBLE_BIAS;
    }
    return w;
  }

  /* ------------------------------------------------------------------ *
   * 触发一次放电
   * ------------------------------------------------------------------ */

  /**
   * 全局补光的距离衰减：6km 外的放电只应让天地微微发白，不该把整座城市打亮。
   * 用平滑过渡从 1200m 处的 1.0 降到 6500m 处的 0.42。
   * @param {number} dist 打击点到相机的距离（米）
   * @returns {number} 0.42..1
   */
  function distanceFalloff(dist) {
    const t = clamp((dist - 1200) / (6500 - 1200), 0, 1);
    const s = t * t * (3 - 2 * t); // smoothstep
    return 1 - 0.58 * s;
  }

  /**
   * 编排 flicker 时间表（1~3 次回击，亮度逐次衰减）。
   * @param {number} baseAmp 首次回击的亮度
   * @returns {void}
   */
  function scheduleFlickers(baseAmp) {
    flickerCount = rng.int(1, MAX_FLICKERS);
    let cursor = 0;
    let amp = baseAmp;
    for (let i = 0; i < flickerCount; i++) {
      const dur = rng.range(0.06, 0.18);
      flickers[i].start = cursor;
      flickers[i].dur = dur;
      flickers[i].amp = amp;
      cursor += dur + rng.range(0.04, 0.12);
      amp *= rng.range(0.5, 0.72); // 后续回击能量更低
    }
    strikeTotal = cursor;
  }

  /**
   * 触发一次放电（对地打击或云内片状闪）。
   * @param {Object} ctx FrameContext
   * @returns {void}
   */
  function trigger(ctx) {
    const cam = ctx.camera || null;
    isSheet = rng.next() < SHEET_RATIO;
    stats.strikes++;

    if (isSheet) {
      // —— 云内片状闪：无通道几何，只有整片云被内部照亮 ——
      segCount = 0;
      geometry.setDrawRange(0, 0);
      lines.visible = false;

      const params = ctx.weather && ctx.weather.params ? ctx.weather.params : null;
      const cloudY = params && Number.isFinite(params.cloudHeight) ? params.cloudHeight : 900;
      const ang = rng.range(0, TWO_PI);
      const dist = rng.range(1800, 6500);
      const cx = (cam ? cam.position.x : 0) + Math.cos(ang) * dist;
      const cz = (cam ? cam.position.z : 0) + Math.sin(ang) * dist;
      lightPos.set(cx, cloudY + rng.range(0, 220), cz);

      const d = cam ? lightPos.distanceTo(cam.position) : dist;
      scheduleFlickers(rng.range(0.26, 0.44) * distanceFalloff(d));
      strikeTime = 0;

      // 远处闷雷
      fireThunder(ctx, d, rng.range(0.28, 0.45));
      return;
    }

    // —— 对地打击 ——
    pickStrikePoint(ctx, lightPos);
    const sx = lightPos.x;
    const sy = lightPos.y;
    const sz = lightPos.z;

    // 云底：打击点上方 500~800m；起点在水平方向偏出 60~150m，让通道是斜的
    const cloudY = sy + rng.range(500, 800);
    const off = rng.range(60, 150);
    const oa = rng.range(0, TWO_PI);
    const bx = sx + Math.cos(oa) * off;
    const bz = sz + Math.sin(oa) * off;

    segCount = 0;
    const maxLevel = rng.int(2, 3);
    drawBranch(bx, cloudY, bz, sx, sy, sz, 0, TRUNK_BRIGHTNESS, 5.5, maxLevel);

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geometry.setDrawRange(0, segCount * 2);
    stats.segments = segCount;

    const d = cam ? lightPos.distanceTo(cam.position) : 1500;
    scheduleFlickers(rng.range(0.9, 1.12) * distanceFalloff(d));
    strikeTime = 0;

    fireThunder(ctx, d, rng.range(0.8, 1.0));
  }

  /**
   * 请求雷声（距离 = 打击点到相机，音频模块内部按 343 m/s 延迟）。
   * @param {Object} ctx FrameContext
   * @param {number} distance 米
   * @param {number} strength 0..1
   * @returns {void}
   */
  function fireThunder(ctx, distance, strength) {
    const audio = ctx.audio;
    if (audio && typeof audio.thunder === 'function') {
      audio.thunder(distance, strength);
    }
  }

  /* ------------------------------------------------------------------ *
   * 每帧更新
   * ------------------------------------------------------------------ */

  /**
   * @param {Object} ctx FrameContext（契约 §2，只读）
   * @returns {void}
   */
  function update(ctx) {
    if (!ctx) return;
    const dt = Number.isFinite(ctx.dt) ? clamp(ctx.dt, 0, 0.1) : 0;
    const params = ctx.weather && ctx.weather.params ? ctx.weather.params : null;
    const rate = params && Number.isFinite(params.lightningPerMinute) ? params.lightningPerMinute : 0;

    // —— 泊松触发：P(本帧发生) = λ·dt，λ = rate/60（非雷暴 rate<=0 不触发）——
    if (strikeTime < 0 && rate > 0 && dt > 0) {
      const p = Math.min(0.5, (rate / 60) * dt);
      if (rng.next() < p) trigger(ctx);
    }

    // —— 推进当前放电的 flicker 时间表 ——
    let pulse = 0;
    if (strikeTime >= 0) {
      strikeTime += dt;
      let onAmp = 0;
      for (let i = 0; i < flickerCount; i++) {
        const f = flickers[i];
        if (strikeTime >= f.start && strikeTime < f.start + f.dur) {
          const local = (strikeTime - f.start) / f.dur;
          // 单次回击内部：瞬时峰值后线性回落，叠一层高频抖动（≈29Hz 的确定性正弦，
          // 模拟回击电流的振荡余辉；用 strikeTime 而非 rng，保证同种子完全可复现）
          const shape = (1 - 0.8 * local) * (0.88 + 0.12 * Math.sin(strikeTime * 180));
          onAmp = f.amp * clamp(shape, 0, 1.2);
          break;
        }
      }
      pulse = onAmp;
      const visible = !isSheet && onAmp > 0.001 && segCount > 0;
      lines.visible = visible;
      if (visible) material.opacity = clamp(0.45 + onAmp * 0.55, 0, 1);
      if (strikeTime > strikeTotal) {
        strikeTime = -1;
        lines.visible = false;
      }
    } else if (lines.visible) {
      lines.visible = false;
    }

    // —— 全局补光：脉冲取最大值，其余时间以 λ=14 指数快速衰减 ——
    const decayed = damp(flash, 0, 14, dt);
    flash = clamp(Math.max(pulse, decayed), 0, 1);
    if (flash < 1e-4) flash = 0;

    if (env && env.uFlash) env.uFlash.value = flash;
    handle.flash = flash;

    // —— 打击点点光源（复用同一实例）——
    if (flash > 0.002) {
      strikeLight.visible = true;
      strikeLight.position.copy(lightPos);
      // 云内闪在高空，衰减半径更大、强度更柔
      strikeLight.distance = isSheet ? 3600 : 1800;
      strikeLight.intensity = flash * LIGHT_PEAK * (isSheet ? 0.55 : 1.0);
    } else if (strikeLight.visible) {
      strikeLight.visible = false;
      strikeLight.intensity = 0;
    }
  }

  /**
   * 释放自建资源与计时状态（契约 §1）。
   * @returns {void}
   */
  function dispose() {
    strikeTime = -1;
    flickerCount = 0;
    strikeTotal = 0;
    segCount = 0;
    flash = 0;
    handle.flash = 0;
    if (env && env.uFlash) env.uFlash.value = 0;

    lines.visible = false;
    strikeLight.visible = false;
    strikeLight.intensity = 0;
    if (strikeLight.shadow && strikeLight.shadow.map) {
      strikeLight.shadow.map.dispose();
      strikeLight.shadow.map = null;
    }

    root.remove(lines);
    root.remove(strikeLight);
    geometry.dispose();
    material.dispose();
  }

  return handle;
}
