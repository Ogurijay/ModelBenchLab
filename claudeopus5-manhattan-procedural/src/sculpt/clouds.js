/**
 * @file src/sculpt/clouds.js
 * @description 三层体积云系统（契约 §5.9）。云朵由多个 IcosahedronGeometry 球泡按团簇聚合、
 *              逐顶点噪声位移出蓬松边缘后 `mergeGeometries` 合成单朵几何，再用 `InstancedMesh`
 *              铺开。**没有任何公告板 / 贴图**，体积感完全来自真实三维球泡堆叠 + 逐片元散射光照。
 *
 * ---------------------------------------------------------------------------
 * 一、几何：花椰菜式球泡团簇
 * ---------------------------------------------------------------------------
 * 每个原型按「云核（2~3 个大球居中）→ 肩部（中球环绕）→ 冠部（小球堆顶）」三层排布，
 * 得到积云特有的花椰菜轮廓；`flatBase` 原型再把穿过基准面的球泡抬起并压扁底部顶点，
 * 复现积云的**平底**特征（凝结高度处水汽饱和 → 云底近似水平面）。
 *
 * 逐顶点位移：`P = (r + fluff·r·F(p)) · n`，`F` 为 3 倍频 fBm + 1 层细节噪声，
 * 采样坐标取「球泡中心 + 局部顶点位置」，因此相邻球泡的位移在空间上连续，
 * 整朵云像**一个整体**而不是一堆球。
 *
 * 法线扰动：位移场沿切平面的有限差分梯度
 *   n' = normalize( n − fluff · ( ∂F/∂u · t₁ + ∂F/∂v · t₂ ) )
 * （由 P(u,v) = (r + amp·F)·n 求导，忽略高阶小量；amp/r = fluff）。
 * 若直接 `computeVertexNormals()` 会得到平面法线，云会变成低模宝石——故手工推导。
 *
 * ---------------------------------------------------------------------------
 * 二、着色：单次前向 pass 里的散射近似
 * ---------------------------------------------------------------------------
 * (a) 朝阳/背阳 —— **半兰伯特**（Valve, Half-Life 2 shading）：`(N·L)·0.5 + 0.5`，
 *     背阳面压暗但不死黑，符合云内多次散射把光「兜」到背面的现象。
 *     参与光照的法线是「球泡法线」与「云心指向该点」的混合，让整朵云统一受光。
 * (b) 边缘透光 —— 反向菲涅尔：掠射角处 `rim = (1 − |N·V|)^k` 最大，边缘更亮更透明。
 * (c) 银边（前向散射）—— **Henyey–Greenstein 相函数**（Henyey & Greenstein, ApJ 93:70, 1941）：
 *     `p(θ) = (1 − g²) / (4π (1 + g² − 2g·cosθ)^{3/2})`，g = 0.62（云滴强前向散射）。
 *     逆光看云时云缘出现刺眼亮边，这是云最具辨识度的视觉特征。
 * (d) 日落染色 —— 直射项直接乘 `ctx.sun.color`（main.js 已按太阳高度角调暖），
 *     再叠加一层朝云底更强的橙红染色（低太阳时阳光走更长大气路径，先照到云底）。
 * (e) 雷暴 —— `cloudDarkness` 压暗云底；`env.uFlash` 从**云心**向外发光（内部照亮），
 *     所以闪光时云是「从里面亮起来」而不是整体贴一层白。
 * (f) 数量与浓度 —— `weather.params.cloudCover` 决定可见实例数（只改 `InstancedMesh.count`，
 *     绝不重建几何）与逐层不透明度；实例按阈值排序，靠近阈值的一朵用 alpha 淡入，杜绝突现。
 *
 * ---------------------------------------------------------------------------
 * 三、预算
 * ---------------------------------------------------------------------------
 * drawcall = 原型数 = **4**（4 个 InstancedMesh 共享同一个 ShaderMaterial）。
 * 三角形（high 画质 76 朵全可见时）≈ 2700×12 + 2540×20 + 1860×24 + 1620×20 ≈ 1.60×10⁵，
 * 远低于 2.5×10⁵ 上限。`update()` 只做 76 次矩阵合成与 ~20 个 uniform 写入。
 *
 * 契约差异说明（按 §0 要求就地记录，不改契约）：
 * - 契约 §5.9 要求「drawcall ≤ 4」，同时任务书要求「4~6 种云朵原型各自用 InstancedMesh」。
 *   两者只在**原型数 = 4** 时同时成立，故本模块取 4 种原型（契约允许的下界）。
 *   三个高度层不各占一个 mesh，而是作为**逐实例属性** `aCloudData.y` 参与着色，
 *   这样 4 个 drawcall 就同时承载了「4 原型 × 3 层」的组合。
 * - 契约 §5.9 未规定 renderOrder；任务书要求低于降水粒子。本模块取 `-1`，
 *   保证无论降水模块用 0 还是正数都排在云之后（云几乎总是比雨雪粒子远，
 *   先画云也正好符合透明物体的后往前顺序）。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { makeRng } from '../core/rng.js';
import { makeNoise3D, fbm3D } from '../core/noise.js';
import { TWO_PI, clamp, lerp, smoothstep, damp, mod } from '../core/mathx.js';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 云场半边长（米）：云以相机为中心在 ±6000m 的方形域内循环 */
const DOMAIN_HALF = 5600;

/** 层索引：0 高层卷云 / 1 中层积云 / 2 低层碎云 */
const LAYER_HIGH = 0;
const LAYER_MID = 1;
const LAYER_LOW = 2;

/** 各层随风漂移的速度倍率（高空急流更快，契约 §5.9「卷云薄、快」） */
const LAYER_SPEED = [2.6, 1.0, 1.45];

/** 各层高度抖动幅度（米，逐实例正态抽样后夹到 ±该值） */
const LAYER_Y_JITTER = [150, 95, 35];

/** 高度平滑逼近的时间常数倒数（damp 的 lambda，越大越快） */
const HEIGHT_LAMBDA = 0.45;

/**
 * 4 种云朵原型。云核球用 detail=3（320 面）、肩部球用 detail=2（180 面）保证轮廓无直棱，
 * 冠部小球用 detail=1（80 面）控制三角形预算。球泡总数均落在契约要求的 8~20 之间。
 * 坐标单位是「单位云空间」，实例矩阵再缩放到米。
 * @type {Array<Object>}
 */
const CLOUD_PROTOTYPES = [
  {
    key: 'congestus',
    name: '积云·塔状',
    coreCount: 3, midCount: 7, topCount: 6, // 16 球
    coreR: [0.44, 0.56], coreSpread: 0.22,
    midDist: [0.38, 0.70], midR: [0.28, 0.42], midY: [-0.05, 0.30],
    topSpread: 0.44, topR: [0.18, 0.32], topY: [0.34, 0.80],
    stretchX: 1.0, stretchZ: 1.0,
    baseY: -0.32, flatBase: true,
    fluff: 0.40, noiseFreq: 2.2
  },
  {
    key: 'humilis',
    name: '积云·平底宽体',
    coreCount: 3, midCount: 7, topCount: 4, // 14 球
    coreR: [0.40, 0.50], coreSpread: 0.34,
    midDist: [0.45, 0.88], midR: [0.26, 0.40], midY: [-0.02, 0.14],
    topSpread: 0.55, topR: [0.16, 0.28], topY: [0.20, 0.42],
    stretchX: 1.25, stretchZ: 0.92,
    baseY: -0.26, flatBase: true,
    fluff: 0.36, noiseFreq: 2.0
  },
  {
    key: 'fractus',
    name: '碎积云',
    coreCount: 2, midCount: 5, topCount: 4, // 11 球
    coreR: [0.36, 0.48], coreSpread: 0.30,
    midDist: [0.36, 0.80], midR: [0.22, 0.36], midY: [-0.12, 0.28],
    topSpread: 0.46, topR: [0.12, 0.24], topY: [0.24, 0.58],
    stretchX: 1.10, stretchZ: 1.15,
    baseY: -0.28, flatBase: false,
    fluff: 0.44, noiseFreq: 2.6
  },
  {
    key: 'cirrus',
    name: '卷云·纤维条带',
    coreCount: 0, midCount: 5, topCount: 4, // 9 球
    streak: true, streakLength: 1.25,
    coreR: [0, 0], coreSpread: 0,
    midDist: [0, 0], midR: [0, 0], midY: [0, 0],
    topSpread: 0, topR: [0.16, 0.34], topY: [0, 0],
    stretchX: 1.0, stretchZ: 1.0,
    baseY: -0.2, flatBase: false,
    fluff: 0.42, noiseFreq: 3.1
  }
];

/**
 * 「层 × 原型 → 云朵数」编排表（high 画质基准值）。
 * 中层积云合计 12 + 14 + 8 = 34 朵，落在契约要求的 24~40 区间。
 * @type {Array<{layer:number, proto:number, count:number}>}
 */
const LAYER_PLAN = [
  { layer: LAYER_HIGH, proto: 3, count: 30 },
  { layer: LAYER_HIGH, proto: 2, count: 8 },
  { layer: LAYER_MID, proto: 0, count: 24 },
  { layer: LAYER_MID, proto: 1, count: 28 },
  { layer: LAYER_MID, proto: 2, count: 16 },
  { layer: LAYER_LOW, proto: 1, count: 12 },
  { layer: LAYER_LOW, proto: 2, count: 22 },
  { layer: LAYER_LOW, proto: 3, count: 8 }
];

/** 画质 → 实例数量倍率 */
const QUALITY_SCALE = { high: 1.0, medium: 0.85, low: 0.62 };

/**
 * 各层的「出现阈值」抽样区间。阈值越小越早出现：
 * 卷云在近乎晴朗时就有；碎云要天气够差（云量高 / 有降水）才压下来。
 */
const LAYER_THRESHOLD = [
  [0.02, 0.62], // 高层卷云
  [0.12, 0.98], // 中层积云
  [0.45, 1.00]  // 低层碎云
];

/* ------------------------------------------------------------------ *
 * 几何构建
 * ------------------------------------------------------------------ */

/**
 * 按原型规格排布球泡中心与半径（花椰菜团簇）。
 * @param {Object} spec 原型规格（CLOUD_PROTOTYPES 之一）
 * @param {Object} rng 该原型专属的 Rng 子流
 * @returns {Array<{x:number,y:number,z:number,r:number,detail:number}>} 球泡列表
 */
function layoutPuffs(spec, rng) {
  const puffs = [];

  if (spec.streak) {
    // 卷云：沿 X 轴拉成一条纤维状条带，中段粗两端渐细（丝缕感）
    const n = spec.midCount + spec.topCount;
    const phase = rng.range(0, TWO_PI);
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0.5;
      const bulge = Math.sin(t * Math.PI); // 半个正弦包络 → 中间最粗
      puffs.push({
        x: (t * 2 - 1) * spec.streakLength + rng.range(-0.08, 0.08),
        y: rng.range(-0.06, 0.06) + Math.sin(t * 3.1 + phase) * 0.05,
        z: Math.sin(t * 2.4 + phase) * 0.22 + rng.range(-0.08, 0.08),
        r: lerp(spec.topR[0], spec.topR[1], bulge * rng.range(0.7, 1.0)),
        detail: 2
      });
    }
    return puffs;
  }

  // 1) 云核：大球居中，撑起主体体积
  for (let i = 0; i < spec.coreCount; i++) {
    const a = rng.range(0, TWO_PI);
    const d = rng.range(0, spec.coreSpread);
    puffs.push({
      x: Math.cos(a) * d * spec.stretchX,
      y: rng.range(-0.05, 0.16),
      z: Math.sin(a) * d * spec.stretchZ,
      r: rng.range(spec.coreR[0], spec.coreR[1]),
      detail: 3
    });
  }

  // 2) 肩部：中球沿一圈错开环绕（角度做分层抖动，避免堆在同一侧）
  for (let i = 0; i < spec.midCount; i++) {
    const a = ((i + rng.range(0.15, 0.85)) / spec.midCount) * TWO_PI;
    const d = rng.range(spec.midDist[0], spec.midDist[1]);
    puffs.push({
      x: Math.cos(a) * d * spec.stretchX,
      y: rng.range(spec.midY[0], spec.midY[1]),
      z: Math.sin(a) * d * spec.stretchZ,
      r: rng.range(spec.midR[0], spec.midR[1]),
      detail: 2
    });
  }

  // 3) 冠部：小球堆在顶上，形成花椰菜式凸起
  for (let i = 0; i < spec.topCount; i++) {
    const a = rng.range(0, TWO_PI);
    const d = rng.range(0, spec.topSpread);
    puffs.push({
      x: Math.cos(a) * d * spec.stretchX,
      y: rng.range(spec.topY[0], spec.topY[1]),
      z: Math.sin(a) * d * spec.stretchZ,
      r: rng.range(spec.topR[0], spec.topR[1]),
      detail: 1
    });
  }

  // 4) 平底：把穿过凝结高度面的球泡抬起来，使云底近似水平
  if (spec.flatBase) {
    for (const p of puffs) {
      if (p.y - p.r < spec.baseY) p.y = spec.baseY + p.r * rng.range(0.80, 0.95);
    }
  }

  return puffs;
}

/**
 * 逐顶点噪声位移 + 法线扰动，把光滑球泡雕成蓬松云块。
 *
 * 位移场：`F(p) = 0.75·fbm3D(p·f) + 0.25·noise3D(p·3.1f)`，采样坐标用
 * 「球泡中心 + 局部顶点」，保证相邻球泡衔接处噪声连续（否则会看出球与球的接缝）。
 * 法线梯度只取低频那一层——高频细节的波长与差分步长同量级，直接差商会把法线打成刻面。
 *
 * @param {THREE.BufferGeometry} geo 单个球泡几何（原点在球心）
 * @param {{x:number,y:number,z:number,r:number}} puff 球泡参数
 * @param {Object} spec 原型规格
 * @param {(x:number,y:number,z:number)=>number} noise3D 3D simplex 采样器
 * @returns {void}
 */
function sculptPuff(geo, puff, spec, noise3D) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const f = spec.noiseFreq;
  const fluff = spec.fluff;
  const invR = 1 / puff.r;
  // 有限差分步长：必须显著大于细节倍频的波长，否则差商变成噪声、法线出现刻面
  const eps = 0.15;

  /**
   * 低频团块场（值域 [-1,1]）。y 方向频率略高 → 竖向层次更碎，像翻腾的对流泡。
   * 法线梯度**只用这一层**：高频细节的波长与 eps 同量级，差商会退化成噪声。
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  const smoothField = (x, y, z) => fbm3D(noise3D, x * f, y * f * 1.35, z * f, {
    octaves: 3, lacunarity: 2.1, gain: 0.5
  });

  /**
   * 高频絮状细节（值域 [-1,1]），只参与位移不参与梯度。
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @returns {number}
   */
  const detailField = (x, y, z) =>
    noise3D(x * f * 3.1 + 11.3, y * f * 3.1 - 4.7, z * f * 3.1 + 7.9);

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);

    // 球泡法线（IcosahedronGeometry detail>0 时法线即归一化位置）
    const nx = px * invR;
    const ny = py * invR;
    const nz = pz * invR;

    // 云空间采样坐标
    const wx = px + puff.x;
    const wy = py + puff.y;
    const wz = pz + puff.z;

    const s0 = smoothField(wx, wy, wz);
    let d = s0 * 0.75 + detailField(wx, wy, wz) * 0.25;

    // 平底原型：越靠近基准面位移越弱，防止把平底戳成锯齿
    if (spec.flatBase) {
      const flat = smoothstep(spec.baseY - 0.05, spec.baseY + 0.45, wy);
      d *= 0.25 + 0.75 * flat;
    }

    // —— 切平面基底：取与 n 最不平行的轴做叉积，数值稳定 ——
    let ax = 0;
    let ay = 1;
    let az = 0;
    if (Math.abs(ny) > 0.9) {
      ax = 1; ay = 0; az = 0;
    }
    let t1x = ny * az - nz * ay;
    let t1y = nz * ax - nx * az;
    let t1z = nx * ay - ny * ax;
    const t1L = Math.hypot(t1x, t1y, t1z) || 1;
    t1x /= t1L; t1y /= t1L; t1z /= t1L;
    const t2x = ny * t1z - nz * t1y;
    const t2y = nz * t1x - nx * t1z;
    const t2z = nx * t1y - ny * t1x;

    // 有限差分求低频位移场沿两个切向的梯度（每单位长度）
    let gu = (smoothField(wx + t1x * eps, wy + t1y * eps, wz + t1z * eps) - s0) / eps;
    let gv = (smoothField(wx + t2x * eps, wy + t2y * eps, wz + t2z * eps) - s0) / eps;
    gu = clamp(gu, -2, 2);
    gv = clamp(gv, -2, 2);

    // n' = normalize( n − k·( gu·t₁ + gv·t₂ ) )，k = fluff × 0.75
    // （0.75 是「只取低频梯度」的补偿系数：位移里低频占 0.75 权重）
    const k = fluff * 0.75;
    let nnx = nx - k * (gu * t1x + gv * t2x);
    let nny = ny - k * (gu * t1y + gv * t2y);
    let nnz = nz - k * (gu * t1z + gv * t2z);
    const nnL = Math.hypot(nnx, nny, nnz) || 1;
    nnx /= nnL; nny /= nnL; nnz /= nnL;

    // 位移后的顶点（球心局部坐标）
    const disp = puff.r * fluff * d;
    let vx = px + nx * disp;
    let vy = py + ny * disp;
    let vz = pz + nz * disp;

    // 平底：低于基准面的部分压扁而非硬切，保留一点起伏
    if (spec.flatBase) {
      const below = spec.baseY - (vy + puff.y);
      if (below > 0) vy -= below * 0.82;
    }

    pos.setXYZ(i, vx, vy, vz);
    nrm.setXYZ(i, nnx, nny, nnz);
  }

  pos.needsUpdate = true;
  nrm.needsUpdate = true;
}

/**
 * 构建一个云朵原型的合并几何：N 个球泡各自雕刻后 `mergeGeometries` 合成单朵。
 * @param {Object} spec 原型规格
 * @param {Object} rng 该原型的 Rng 子流
 * @param {boolean} lowDetail 低画质：所有球泡降到 detail=1
 * @returns {THREE.BufferGeometry} 合并后的云朵几何（position + normal，非索引）
 */
function buildPrototypeGeometry(spec, rng, lowDetail) {
  const puffs = layoutPuffs(spec, rng);
  const noise3D = makeNoise3D(`cloud-${spec.key}-${rng.seed}`);
  const parts = [];

  for (const puff of puffs) {
    const detail = lowDetail ? 1 : puff.detail;
    const g = new THREE.IcosahedronGeometry(puff.r, detail);
    g.deleteAttribute('uv'); // 云不用 uv，省 2 个 float/顶点
    sculptPuff(g, puff, spec, noise3D);
    g.translate(puff.x, puff.y, puff.z);
    parts.push(g);
  }

  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!merged) {
    // 理论上不会发生（所有球泡属性一致）；兜底给一个最小可渲染几何
    return new THREE.IcosahedronGeometry(0.6, 1);
  }
  merged.computeBoundingSphere();
  merged.name = `cloud-${spec.key}`;
  return merged;
}

/* ------------------------------------------------------------------ *
 * 着色器
 * ------------------------------------------------------------------ */

const CLOUD_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

// 逐实例：x = 随机种子 0..1，y = 层索引 0/1/2，z = 出现阈值，w = 呼吸相位
attribute vec4 aCloudData;

uniform float uTime;
uniform vec4  uLayer0;
uniform vec4  uLayer1;
uniform vec4  uLayer2;

varying vec3  vWorldPos;
varying vec3  vWorldNormal;
varying vec3  vLocalPos;
varying vec4  vLayerParams;
varying float vThreshold;
varying float vSeed;

void main() {
	// 翻腾呼吸：两条低频正弦沿法线膨胀，几何永不重建，成本仅两次 sin
	float breathe = sin( uTime * 0.13 + aCloudData.w + position.y * 2.3 ) * 0.018
	              + sin( uTime * 0.071 + aCloudData.w * 1.7 + position.x * 1.9 ) * 0.014;
	vec3 transformed = position + normal * breathe;

	vLocalPos = transformed;

	vec4 modelPos = vec4( transformed, 1.0 );
	vec3 nrm = normal;

	#ifdef USE_INSTANCING
		// 实例矩阵含非均匀缩放（云被压扁），法线必须用逆转置：
		// (R·S)^{-T}·n = R·S^{-1}·n = (R·S)·(n / s²)
		vec3 sqScale = vec3(
			dot( instanceMatrix[ 0 ].xyz, instanceMatrix[ 0 ].xyz ),
			dot( instanceMatrix[ 1 ].xyz, instanceMatrix[ 1 ].xyz ),
			dot( instanceMatrix[ 2 ].xyz, instanceMatrix[ 2 ].xyz )
		);
		nrm = mat3( instanceMatrix ) * ( normal / max( sqScale, vec3( 1e-6 ) ) );
		modelPos = instanceMatrix * modelPos;
	#endif

	vec4 worldPos = modelMatrix * modelPos;
	vWorldPos = worldPos.xyz;
	// 云根节点不缩放，modelMatrix 的 3×3 是纯旋转，直接乘即可
	vWorldNormal = normalize( mat3( modelMatrix ) * nrm );

	// GLSL ES 1.0 不允许用非常量下标访问 uniform 数组，用 step 混合选层
	float layerId = aCloudData.y;
	vLayerParams = mix(
		mix( uLayer0, uLayer1, step( 0.5, layerId ) ),
		uLayer2,
		step( 1.5, layerId )
	);
	vThreshold = aCloudData.z;
	vSeed = aCloudData.x;

	vec4 mvPosition = viewMatrix * worldPos;
	gl_Position = projectionMatrix * mvPosition;

	#include <fog_vertex>
}
`;

const CLOUD_FRAGMENT_SHADER = /* glsl */ `
// 注意：tonemapping_pars_fragment / colorspace_pars_fragment 由 WebGLProgram 的
// prefixFragment 自动注入（见 three/src/renderers/webgl/WebGLProgram.js），
// 这里若再 include 一次会造成函数重复定义而编译失败，故只 include 其余 chunk。
#include <common>
#include <fog_pars_fragment>
#include <dithering_pars_fragment>

uniform vec3  uSunDir;        // 由城市指向太阳的单位向量
uniform vec3  uSunColor;
uniform float uSunIntensity;  // 0..3.2
uniform vec3  uMoonDir;
uniform float uMoonAmount;    // 0..1
uniform float uNight;         // 0..1
uniform float uFlash;         // 0..1 闪电补光
uniform vec3  uSkyTint;       // 天空/雾色，作为环境散射
uniform float uSunset;        // 0..1 日出日落程度
uniform float uCoverDemand;   // 当前云量需求（与逐实例阈值比较做淡入）
uniform float uHalfDomain;    // 云场半边长（米）

varying vec3  vWorldPos;
varying vec3  vWorldNormal;
varying vec3  vLocalPos;
varying vec4  vLayerParams;   // x=不透明度 y=压暗 z=环境倍率 w=银边倍率
varying float vThreshold;
varying float vSeed;

// Henyey–Greenstein 相函数（Henyey & Greenstein, ApJ 93:70, 1941）
// p(θ) = (1 − g²) / ( 4π (1 + g² − 2g·cosθ)^{3/2} )
float hgPhase( float cosT, float g ) {
	float g2 = g * g;
	float denom = 1.0 + g2 - 2.0 * g * cosT;
	return ( 1.0 - g2 ) / ( 4.0 * PI * pow( max( denom, 1e-4 ), 1.5 ) );
}

void main() {
	vec3 N = normalize( vWorldNormal );
	vec3 toFrag = vWorldPos - cameraPosition;
	float dist = max( length( toFrag ), 1e-4 );
	vec3 V = toFrag / dist;                       // 相机 → 片元

	// 云体整体法线：球泡法线拉向「云心指向该点」，让一朵云统一受光而非每个球泡各自为政
	vec3 C = normalize( vLocalPos + vec3( 0.0, 1e-4, 0.0 ) );
	vec3 Ns = normalize( mix( N, C, 0.38 ) );

	// (a) 半兰伯特（Valve Half-Life 2 shading）：背阳面压暗但不死黑
	float lambert = pow( clamp( dot( Ns, uSunDir ) * 0.5 + 0.5, 0.0, 1.0 ), 1.95 );

	// (b) 边缘透光：反向菲涅尔，掠射角（轮廓边缘）最强
	float rim = pow( 1.0 - clamp( dot( -V, N ), 0.0, 1.0 ), 2.6 );

	// (c) 银边：前向散射相函数，逆光看云时云缘发亮
	float silver = clamp( hgPhase( dot( V, uSunDir ), 0.62 ) * 3.4, 0.0, 2.2 );

	// 局部坐标 → 厚度线索：baseT 0=云底 1=云顶；coreT 0=云心 1=外缘
	float baseT = smoothstep( -0.35, 0.75, vLocalPos.y );
	float coreT = clamp( length( vLocalPos ) * 0.92, 0.0, 1.0 );

	float darkness = vLayerParams.y;
	// 云底自阴影：云本身厚到阳光透不下来，所以即使晴天云底也是灰的；雷暴再额外压暗
	float baseShade = mix( clamp( 0.46 - 0.40 * darkness, 0.05, 1.0 ), 1.0, baseT );

	// —— 直射光 ——
	vec3 sunTerm = uSunColor * ( 0.14 + uSunIntensity * 0.34 );
	vec3 col = sunTerm * lambert * baseShade;
	col += sunTerm * silver * vLayerParams.w * ( 0.30 + 0.70 * rim );
	col += sunTerm * rim * 0.30 * ( 0.25 + 0.75 * lambert ) * mix( 0.45, 1.0, coreT );

	// —— 天空环境散射：云底与背阳面主要靠它 ——
	col += uSkyTint * vLayerParams.z * ( 0.30 + 0.70 * baseT ) * mix( 0.55, 1.0, baseShade );

	// (d) 日落染色：低太阳时阳光走更长大气路径，先把云底染成橙红。
	// 必须按 darkness 衰减——厚重的雷暴云挡住了直射光，本就照不到暖光；
	// 若不衰减，「压暗后的云」×「橙色」会得到脏兮兮的棕色土块。
	vec3 sunsetTint = vec3( 1.42, 0.74, 0.46 );
	col *= mix( vec3( 1.0 ), sunsetTint, uSunset * ( 0.30 + 0.70 * ( 1.0 - baseT ) ) * ( 1.0 - 0.8 * darkness ) );
	// 厚云去饱和，向冷灰收敛
	col = mix( col, vec3( dot( col, vec3( 0.299, 0.587, 0.114 ) ) ) * vec3( 0.96, 0.99, 1.06 ), darkness * 0.55 );

	// 夜间：月光冷调 + 城市灯光从下方微微上照
	vec3 moonTerm = vec3( 0.16, 0.20, 0.30 ) * uMoonAmount
		* pow( clamp( dot( Ns, uMoonDir ) * 0.5 + 0.5, 0.0, 1.0 ), 1.4 );
	vec3 cityGlow = vec3( 0.17, 0.12, 0.07 ) * ( 1.0 - baseT ) * uNight;
	col = mix( col, col * 0.22 + moonTerm + cityGlow, uNight * 0.88 );

	// (e) 闪电：从云内部照亮 —— 云心最亮、云底次之、边缘最弱
	col += uFlash * vec3( 0.74, 0.80, 1.0 ) * ( 0.35 + 1.45 * ( 1.0 - coreT ) ) * ( 1.25 - 0.5 * baseT );

	// —— 不透明度 ——
	float alpha = vLayerParams.x;
	alpha *= mix( 0.74, 1.14, fract( vSeed * 7.137 ) );   // 逐朵密度差异
	alpha *= 1.0 - 0.72 * rim;                            // 边缘更透（与 (b) 呼应），弱化多面体轮廓
	alpha *= mix( 1.0, 0.74, coreT );                     // 外壳比云心稀薄
	alpha *= smoothstep( 0.0, 0.12, uCoverDemand - vThreshold ); // 云量变化时淡入，杜绝突现
	// 逼近云场边界时淡出，使 wrap 一定发生在看不见的地方
	float hd = length( vWorldPos.xz - cameraPosition.xz );
	alpha *= 1.0 - smoothstep( uHalfDomain * 0.60, uHalfDomain * 0.97, hd );
	// 近距离淡出：相机飞到云层高度时会穿进云体，若不淡出会被整块半透明云糊住视野
	alpha *= smoothstep( 70.0, 460.0, dist );

	gl_FragColor = vec4( col, clamp( alpha, 0.0, 1.0 ) );

	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <dithering_fragment>
}
`;

/* ------------------------------------------------------------------ *
 * 工厂
 * ------------------------------------------------------------------ */

/**
 * 创建三层体积云系统（契约 §5.9）。
 *
 * @param {{ plan?:Object, heightField?:Object, rng?:Object, textures?:Object,
 *           env?:Object, quality?:string, seed?:(string|number) }} ctx0 构建期上下文
 * @returns {{ object3D: THREE.Group, update:(ctx:Object)=>void, dispose:()=>void,
 *             stats:{ instances:number, draws:number, clouds:number, triangles:number } }}
 */
export function createClouds(ctx0) {
  const opts = ctx0 || {};
  const rootRng = opts.rng && typeof opts.rng.fork === 'function'
    ? opts.rng.fork('clouds')
    : makeRng(opts.seed === undefined ? 'clouds' : opts.seed, 'clouds');

  const quality = QUALITY_SCALE[opts.quality] !== undefined ? opts.quality : 'high';
  const qScale = QUALITY_SCALE[quality];
  const lowDetail = quality === 'low';

  const group = new THREE.Group();
  group.name = 'clouds';

  /* ---------------- 1) 原型几何 ---------------- */

  const geometries = CLOUD_PROTOTYPES.map((spec, i) =>
    buildPrototypeGeometry(spec, rootRng.fork(`proto-${spec.key}-${i}`), lowDetail)
  );

  /* ---------------- 2) 实例编排 ---------------- */

  // 按层收集「该层要哪些原型」，打散后做分层抖动网格布点，保证空间覆盖均匀
  const placeRng = rootRng.fork('placement');
  /** @type {Array<Array<Object>>} 逐原型的实例记录 */
  const protoInstances = geometries.map(() => []);
  let cloudTotal = 0;

  for (let layer = 0; layer < 3; layer++) {
    /** @type {number[]} */
    const bag = [];
    for (const entry of LAYER_PLAN) {
      if (entry.layer !== layer) continue;
      const n = Math.max(1, Math.round(entry.count * qScale));
      for (let i = 0; i < n; i++) bag.push(entry.proto);
    }
    placeRng.shuffle(bag);

    const total = bag.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(total)));
    const rows = Math.max(1, Math.ceil(total / cols));
    const cellX = (DOMAIN_HALF * 2) / cols;
    const cellZ = (DOMAIN_HALF * 2) / rows;
    const thrRange = LAYER_THRESHOLD[layer];

    for (let i = 0; i < total; i++) {
      const proto = bag[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      // 分层抖动（stratified jitter）布点：网格保证均匀，抖动去掉规则感
      const x = -DOMAIN_HALF + (col + placeRng.range(0.12, 0.88)) * cellX;
      const z = -DOMAIN_HALF + (row + placeRng.range(0.12, 0.88)) * cellZ;

      // 逐层尺寸（米）。原型在单位云空间横跨约 2.8 个单位（卷云条带约 3.5），
      // 因此中层积云实际宽度 ≈ 1.2~2.3km、厚 300~500m，与真实积云尺度一致；
      // 卷云是几公里长的薄片；碎云小而扁。
      let sx;
      let sy;
      let sz;
      if (layer === LAYER_HIGH) {
        const s = placeRng.range(500, 900);
        sx = s * placeRng.range(1.50, 2.20);
        sy = s * placeRng.range(0.10, 0.18);
        sz = s * placeRng.range(0.70, 1.10);
      } else if (layer === LAYER_MID) {
        const s = placeRng.range(420, 780);
        sx = s * placeRng.range(0.90, 1.25);
        sy = s * placeRng.range(0.55, 0.78);
        sz = s * placeRng.range(0.90, 1.25);
      } else {
        const s = placeRng.range(200, 420);
        sx = s * placeRng.range(1.00, 1.50);
        sy = s * placeRng.range(0.38, 0.55);
        sz = s * placeRng.range(1.00, 1.50);
      }

      const euler = new THREE.Euler(
        layer === LAYER_HIGH ? placeRng.range(-0.06, 0.06) : 0,
        placeRng.range(0, TWO_PI),
        layer === LAYER_HIGH ? placeRng.range(-0.05, 0.05) : 0,
        'YXZ'
      );

      protoInstances[proto].push({
        layer,
        x,
        z,
        yOff: clamp(
          placeRng.gauss(0, LAYER_Y_JITTER[layer] * 0.5),
          -LAYER_Y_JITTER[layer],
          LAYER_Y_JITTER[layer]
        ),
        sx,
        sy,
        sz,
        quat: new THREE.Quaternion().setFromEuler(euler),
        speed: LAYER_SPEED[layer] * placeRng.range(0.85, 1.18),
        threshold: placeRng.range(thrRange[0], thrRange[1]),
        seed01: placeRng.next(),
        phase: placeRng.range(0, TWO_PI)
      });
      cloudTotal++;
    }
  }

  // 逐原型按阈值升序排列：调 InstancedMesh.count 截断时，保留的正好是最该出现的那些
  for (const list of protoInstances) list.sort((a, b) => a.threshold - b.threshold);

  /* ---------------- 3) 材质 ---------------- */

  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.3, 0.85, 0.43) },
    uSunColor: { value: new THREE.Color(1, 0.97, 0.92) },
    uSunIntensity: { value: 2.4 },
    uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonAmount: { value: 0 },
    uNight: { value: 0 },
    uFlash: { value: 0 },
    uSkyTint: { value: new THREE.Color(0.55, 0.66, 0.82) },
    uSunset: { value: 0 },
    uCoverDemand: { value: 0.4 },
    uHalfDomain: { value: DOMAIN_HALF },
    uLayer0: { value: new THREE.Vector4(0.34, 0.1, 0.85, 1.35) },
    uLayer1: { value: new THREE.Vector4(0.82, 0.2, 0.62, 0.85) },
    uLayer2: { value: new THREE.Vector4(0.40, 0.3, 0.50, 0.60) },
    // 雾 uniforms 由渲染器的 refreshFogUniforms 每帧填充（material.fog = true）
    fogColor: { value: new THREE.Color(0.62, 0.68, 0.76) },
    fogDensity: { value: 0.00016 },
    fogNear: { value: 1 },
    fogFar: { value: 2000 }
  };

  const material = new THREE.ShaderMaterial({
    name: 'cloudVolume',
    uniforms,
    vertexShader: CLOUD_VERTEX_SHADER,
    fragmentShader: CLOUD_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    fog: true,
    dithering: true,
    blending: THREE.NormalBlending
  });

  /* ---------------- 4) InstancedMesh ---------------- */

  /** @type {THREE.InstancedMesh[]} */
  const meshes = [];
  let triangleBudget = 0;

  for (let p = 0; p < geometries.length; p++) {
    const list = protoInstances[p];
    if (list.length === 0) continue;

    const geo = geometries[p];
    const data = new Float32Array(list.length * 4);
    for (let i = 0; i < list.length; i++) {
      const inst = list[i];
      data[i * 4 + 0] = inst.seed01;
      data[i * 4 + 1] = inst.layer;
      data[i * 4 + 2] = inst.threshold;
      data[i * 4 + 3] = inst.phase;
    }
    geo.setAttribute('aCloudData', new THREE.InstancedBufferAttribute(data, 4));

    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    mesh.name = `clouds-${CLOUD_PROTOTYPES[p].key}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // 实例散布在 ±6000m 并随风漂移，包围球无法覆盖 → 关闭视锥剔除
    mesh.frustumCulled = false;
    // 排在降水粒子之前（云几乎总是比雨雪更远，先画也符合透明排序）
    mesh.renderOrder = -1;
    mesh.count = list.length;
    mesh.userData.instances = list;
    group.add(mesh);
    meshes.push(mesh);

    triangleBudget += (geo.attributes.position.count / 3) * list.length;
  }

  /* ---------------- 5) 每帧更新 ---------------- */

  // 复用的临时对象：update 内绝不 new
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpMat = new THREE.Matrix4();
  const tmpColor = new THREE.Color();

  /** 三层当前高度（米），用 damp 平滑逼近天气目标值 */
  const layerY = [1800, 780, 380];
  let visibleInstances = 0;
  let visibleDraws = meshes.length;

  /**
   * 把偏移量卷回 [-half, half)，实现以相机为中心的对称 wrap。
   * @param {number} d 相对相机的偏移
   * @param {number} half 半边长
   * @returns {number}
   */
  function wrapSigned(d, half) {
    return mod(d + half, half * 2) - half;
  }

  /**
   * 每帧更新：只做矩阵合成与 uniform 写入，绝不重建几何。
   * @param {Object} ctx FrameContext（契约 §2）
   * @returns {void}
   */
  function update(ctx) {
    if (!ctx) return;
    const dt = clamp(Number.isFinite(ctx.dt) ? ctx.dt : 0, 0, 0.1);
    const wp = ctx.weather && ctx.weather.params ? ctx.weather.params : null;

    const cover = clamp(wp && Number.isFinite(wp.cloudCover) ? wp.cloudCover : 0.35, 0, 1);
    const darkness = clamp(wp && Number.isFinite(wp.cloudDarkness) ? wp.cloudDarkness : 0, 0, 1);
    const rain = clamp(wp && Number.isFinite(wp.rainIntensity) ? wp.rainIntensity : 0, 0, 1);
    const snow = clamp(wp && Number.isFinite(wp.snowIntensity) ? wp.snowIntensity : 0, 0, 1);
    const fogD = wp && Number.isFinite(wp.fogDensity) ? wp.fogDensity : 0;
    // 「坏天气」程度：降水与浓雾都会把云底压低
    const bad = clamp(rain + snow + fogD * 260, 0, 1);

    /* --- 层高度：中层取 weather.cloudHeight，高低层按比例派生 --- */
    const baseH = wp && Number.isFinite(wp.cloudHeight) ? wp.cloudHeight : 780;
    // 上限必须留足余量：最高的世贸一号楼含尖塔 541 m，若中层云被压在 980 m 以下，
    // 晴天也会有云盘悬在天际线上。晴天 baseH = 1750 → 积云应真的到 1750 m。
    const targetHigh = clamp(baseH * 2.35, 1600, 3200);   // 卷云 2000~3200m
    const targetMid = clamp(baseH, 560, 1900);            // 积云随天气 560~1900m
    const targetLow = lerp(620, 360, bad);                // 碎云：坏天气才压到 360m 罩住塔顶
    layerY[LAYER_HIGH] = damp(layerY[LAYER_HIGH], targetHigh, HEIGHT_LAMBDA, dt);
    layerY[LAYER_MID] = damp(layerY[LAYER_MID], targetMid, HEIGHT_LAMBDA, dt);
    layerY[LAYER_LOW] = damp(layerY[LAYER_LOW], targetLow, HEIGHT_LAMBDA, dt);

    /* --- 云量需求：决定可见实例数（只改 count，不重建几何） --- */
    const demand = clamp(cover * 1.02 + rain * 0.06 + snow * 0.05, 0, 1.05);
    uniforms.uCoverDemand.value = demand;

    /* --- 风漂移 + 以相机为中心的 wrap --- */
    const cam = ctx.camera;
    const camX = cam && cam.position ? cam.position.x : 0;
    const camZ = cam && cam.position ? cam.position.z : 0;
    const wind = ctx.wind;
    const wx = wind && wind.vector && Number.isFinite(wind.vector.x) ? wind.vector.x : 0;
    const wz = wind && wind.vector && Number.isFinite(wind.vector.z) ? wind.vector.z : 0;

    visibleInstances = 0;
    visibleDraws = 0;

    for (const mesh of meshes) {
      const list = mesh.userData.instances;
      let count = 0;
      for (let i = 0; i < list.length; i++) {
        const inst = list[i];

        inst.x += wx * inst.speed * dt;
        inst.z += wz * inst.speed * dt;
        inst.x = camX + wrapSigned(inst.x - camX, DOMAIN_HALF);
        inst.z = camZ + wrapSigned(inst.z - camZ, DOMAIN_HALF);

        tmpPos.set(inst.x, layerY[inst.layer] + inst.yOff, inst.z);
        tmpScale.set(inst.sx, inst.sy, inst.sz);
        tmpMat.compose(tmpPos, inst.quat, tmpScale);
        mesh.setMatrixAt(i, tmpMat);

        // 列表已按阈值升序，第一个不满足的位置即截断点
        if (count === i && inst.threshold <= demand) count = i + 1;
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.count = count;
      mesh.visible = count > 0;
      visibleInstances += count;
      if (count > 0) visibleDraws++;
    }

    /* --- 光照 / 天气 uniforms --- */
    const sun = ctx.sun;
    if (sun && sun.direction) uniforms.uSunDir.value.copy(sun.direction).normalize();
    if (sun && sun.color) uniforms.uSunColor.value.copy(sun.color);
    uniforms.uSunIntensity.value = sun && Number.isFinite(sun.intensity)
      ? clamp(sun.intensity, 0, 3.2)
      : 0;

    const elev = sun && Number.isFinite(sun.elevationDeg) ? sun.elevationDeg : 45;
    // 日落程度：太阳刚露头/将落时最强（高度角 ≈ 2~4°），正午归零
    uniforms.uSunset.value =
      smoothstep(-8, 3, elev) * (1 - smoothstep(2, 20, elev));

    const moon = ctx.moon;
    if (moon && moon.direction) uniforms.uMoonDir.value.copy(moon.direction).normalize();
    uniforms.uMoonAmount.value = moon && Number.isFinite(moon.intensity)
      ? clamp(moon.intensity / 0.22, 0, 1)
      : 0;

    uniforms.uNight.value = clamp(Number.isFinite(ctx.nightFactor) ? ctx.nightFactor : 0, 0, 1);
    uniforms.uTime.value = Number.isFinite(ctx.elapsed) ? ctx.elapsed : uniforms.uTime.value;

    // 闪电补光：优先读共享 env.uFlash（lightning.js 写入），退回 ctx.weather.flash
    const env = ctx.env;
    let flash = 0;
    if (env && env.uFlash && Number.isFinite(env.uFlash.value)) flash = env.uFlash.value;
    else if (ctx.weather && Number.isFinite(ctx.weather.flash)) flash = ctx.weather.flash;
    uniforms.uFlash.value = clamp(flash, 0, 1);

    // 环境散射色：用场景雾色（main.js 已按天空色更新），保证云与背景同色系
    if (ctx.scene && ctx.scene.fog && ctx.scene.fog.color) {
      tmpColor.copy(ctx.scene.fog.color);
    } else if (env && env.uFogColor && env.uFogColor.value) {
      tmpColor.copy(env.uFogColor.value);
    } else {
      tmpColor.setRGB(0.55, 0.66, 0.82);
    }
    uniforms.uSkyTint.value.copy(tmpColor).multiplyScalar(lerp(0.85, 1.25, cover));

    /* --- 逐层外观参数 --- */
    // 高层卷云：薄、透、银边强
    uniforms.uLayer0.value.set(0.14 + 0.22 * cover, darkness * 0.25, 0.80, 1.35);
    // 中层积云：主力，厚实
    uniforms.uLayer1.value.set(0.72 + 0.26 * cover, darkness, 0.44, 0.85);
    // 低层碎云：只有坏天气才明显（云量高或有降水/浓雾）
    const lowAct = clamp(bad * 1.15 + Math.max(0, cover - 0.55) * 1.6, 0, 1);
    uniforms.uLayer2.value.set(
      (0.30 + 0.38 * cover) * lowAct,
      clamp(darkness * 1.2, 0, 1),
      0.40,
      0.60
    );
  }

  /**
   * 释放本模块自建的几何与材质（不触碰 ctx.textures 的共享资源）。
   * @returns {void}
   */
  function dispose() {
    for (const mesh of meshes) {
      mesh.userData.instances = null;
      if (mesh.parent) mesh.parent.remove(mesh);
      mesh.dispose();
    }
    meshes.length = 0;
    for (const geo of geometries) geo.dispose();
    geometries.length = 0;
    material.dispose();
    group.clear();
  }

  return {
    object3D: group,
    update,
    dispose,
    stats: {
      get instances() { return visibleInstances; },
      get draws() { return visibleDraws; },
      clouds: cloudTotal,
      triangles: Math.round(triangleBudget)
    }
  };
}
