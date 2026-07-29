/**
 * @file src/weather/precipitation.js
 * @description 降水系统（契约 §6.4）：雨、雪、地面雨溅涟漪三个 GPU 粒子子系统。
 *
 * 设计要点
 * --------
 * 1. **一切运动在顶点着色器里算**。JS 每帧只写若干 uniform + 一次 `setDrawRange`，
 *    不做粒子循环、不写实例矩阵、不重建任何 buffer。
 * 2. **盒形区域跟随相机**：根节点每帧吸附到相机附近的**整数米网格**（避免大坐标下
 *    float32 抖动）；shader 内用 `mod` 把粒子轨迹相对根节点做周期折叠，
 *    因此粒子在世界空间是「锚定」的（不会像贴在镜头上一样跟着人走），
 *    而折叠发生在盒子边缘——那里 alpha 已经淡出，看不到接缝。
 * 3. **强度调节只改绘制数量与不透明度**：`geometry.setDrawRange(0, n)`（雪：点数；
 *    雨/涟漪：索引数 = 粒子数 × 6）。强度为 0 时整棵子树 `visible = false`。
 *
 * 物理与公式出处
 * --------------
 * - 雨滴末速度：直径 2mm 左右的雨滴在标准大气下终端速度 ≈ 6.5~9 m/s
 *   （Gunn & Kinzer, 1949《The terminal velocity of fall for water droplets
 *   in stagnant air》, J. Meteor. 6(4)）——本系统取 9 m/s 基准并逐粒子抖动。
 * - 雪花末速度：干雪花 ≈ 0.8~1.5 m/s（Locatelli & Hobs, 1974），取 1.2 m/s。
 * - 水平位移：`Δp = wind × t_fall`（匀速平流近似，雨滴很快达到与风同速的水平分量）。
 * - 雾衰减：与 `THREE.FogExp2` 同式 `f = 1 − exp(−(density·d)²)`，
 *   保证雨丝/雪片与场景雾一致地在远处淡出。
 * - shader 内哈希：Dave Hoskins《Hash without Sine》(Shadertoy XlGcRh) 的 `hash11`，
 *   纯整数位混合、无三角函数、逐帧确定性——满足「禁止 Math.random」的要求。
 *
 * 依赖方向：仅依赖 `three` 与 `core/rng.js`（契约 §0）。
 */

import * as THREE from 'three';
import { makeRng } from '../core/rng.js';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/** 各画质下的粒子预算（雨的数量由契约 §6.4 硬性规定） */
export const PRECIP_COUNTS = {
  high: { rain: 26000, snow: 13000, ripple: 200 },
  medium: { rain: 14000, snow: 7000, ripple: 140 },
  low: { rain: 7000, snow: 3500, ripple: 90 }
};

/** 雨的跟随盒：260×160×260 m，其中相机下方 48 m、上方 112 m */
const RAIN_BOX = { x: 260, y: 160, z: 260, below: 48 };
/** 雪的跟随盒：雪下落慢、颗粒大，近场为主，盒子可以小一些 */
const SNOW_BOX = { x: 190, y: 140, z: 190, below: 44 };

/** 雨滴终端速度基准（m/s） */
const RAIN_FALL_SPEED = 9.0;
/** 雪花终端速度基准（m/s） */
const SNOW_FALL_SPEED = 1.2;

/** 雨丝在最近处 / 最远处的拉伸长度（m） */
const RAIN_LEN_NEAR = 2.6;
const RAIN_LEN_FAR = 0.75;
/** 雨丝宽度（m） */
const RAIN_WIDTH = 0.03;
/** 雨丝在屏幕上的最小宽度（px），低于此值的亚像素几何会闪烁 */
const RAIN_MIN_PIXEL_WIDTH = 1.3;

/** 雨相对风速的水平漂移系数（雨滴重、被风带走的比例低） */
const RAIN_WIND_DRIFT = 0.55;
/** 雪相对风速的水平漂移系数（雪花轻，几乎随风走） */
const SNOW_WIND_DRIFT = 0.95;

/** 雪花基准直径（m）与飘摆幅度（m） */
const SNOW_SIZE = 0.115;
const SNOW_SWAY = 1.5;

/** 涟漪生命周期（s）、最大半径（m）、分布半径（m）、每周期落点抖动（m） */
const RIPPLE_LIFE = 0.6;
const RIPPLE_MAX_RADIUS = 0.85;
const RIPPLE_FIELD_RADIUS = 32;
const RIPPLE_JUMP = 9.0;
/** 涟漪贴花离地高度（m），略高于人行道面（0.18m）避免 z-fighting */
const RIPPLE_Y = 0.22;
/** 相机高于此高度时涟漪不可能被看清，直接关闭以省开销（m） */
const RIPPLE_CAMERA_MAX_Y = 90;

/** 触发地面雨溅的雨强阈值（契约 §6.4） */
const RIPPLE_RAIN_THRESHOLD = 0.3;

/** 低于此强度视为「无降水」，整棵子树关闭 */
const OFF_EPSILON = 0.002;

/** 着色器时间的回绕周期（s）：防止长时间运行后 float32 精度退化 */
const TIME_WRAP = 7200;

/** 四边形四角：x = 横向 (−1|1)，y = 沿运动方向的拖尾参数 (0 = 头，1 = 尾) */
const QUAD_CORNER_X = [-1, 1, 1, -1];
const QUAD_CORNER_Y = [0, 0, 1, 1];

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

/**
 * 把任意输入夹到 [0,1]，非有限值返回 0。
 * @param {*} v 输入
 * @returns {number} [0,1]
 */
function clamp01(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * GLSL 公共片段：Dave Hoskins《Hash without Sine》的 32 位浮点哈希与一维 value noise。
 * 用于雪花飘摆调制与涟漪落点抖动——完全在 GPU 侧确定性生成，不用 CPU 随机。
 * @type {string}
 */
const GLSL_HASH = /* glsl */ `
float hash11( float p ) {
	p = fract( p * 0.1031 );
	p *= p + 33.33;
	p *= p + p;
	return fract( p );
}
float vnoise1( float x ) {
	float i = floor( x );
	float f = fract( x );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( hash11( i ), hash11( i + 1.0 ), f );
}
`;

/**
 * GLSL 公共片段：把「无界世界轨迹」相对根节点折叠回跟随盒内。
 * `mod(x, y)` 在 GLSL 中定义为 `x - y*floor(x/y)`，对负数同样返回非负结果，
 * 因此下式恒把坐标落在 [−half, +half) / [−below, boxY−below)。
 * @type {string}
 */
const GLSL_WRAP = /* glsl */ `
vec3 wrapIntoBox( vec3 w, vec3 origin, vec3 box, float below ) {
	vec3 local;
	local.x = mod( w.x - origin.x + box.x * 0.5, box.x ) - box.x * 0.5;
	local.z = mod( w.z - origin.z + box.z * 0.5, box.z ) - box.z * 0.5;
	local.y = mod( w.y - origin.y + below, box.y ) - below;
	return local;
}
`;

/* ------------------------------------------------------------------ *
 * 几何构建
 * ------------------------------------------------------------------ */

/**
 * 构建雨的「四顶点四边形」批量几何：每个雨滴 4 顶点 + 6 索引，全部塞进一个
 * 非实例化 BufferGeometry，从而可以用 `setDrawRange(0, n*6)` 精确控制可见粒子数
 * （契约 §6.4 要求用 drawRange 而非重建缓冲区调强度），且只占 1 个 drawcall。
 *
 * 顶点属性：
 * - `position` —— 该雨滴在盒内的初始位置（同一雨滴 4 顶点相同）
 * - `aCorner`  —— 四边形角标 (±1, 0|1)
 * - `aJitter`  —— (速度抖动, 长度/亮度抖动)，均为 [0,1)
 *
 * @param {number} count 雨滴数量
 * @param {{next: () => number, range: (a: number, b: number) => number}} rng 种子随机源
 * @param {{x: number, y: number, z: number, below: number}} box 跟随盒尺寸
 * @returns {THREE.BufferGeometry} 几何（已建索引与包围球）
 */
function buildRainGeometry(count, rng, box) {
  const vertexCount = count * 4;
  const position = new Float32Array(vertexCount * 3);
  const corner = new Float32Array(vertexCount * 2);
  const jitter = new Float32Array(vertexCount * 2);
  const index = new Uint32Array(count * 6);

  const hx = box.x * 0.5;
  const hz = box.z * 0.5;

  for (let i = 0; i < count; i++) {
    const px = rng.range(-hx, hx);
    const py = rng.range(-box.below, box.y - box.below);
    const pz = rng.range(-hz, hz);
    const jSpeed = rng.next();
    const jLen = rng.next();
    const base = i * 4;

    for (let c = 0; c < 4; c++) {
      const v = base + c;
      position[v * 3] = px;
      position[v * 3 + 1] = py;
      position[v * 3 + 2] = pz;
      corner[v * 2] = QUAD_CORNER_X[c];
      corner[v * 2 + 1] = QUAD_CORNER_Y[c];
      jitter[v * 2] = jSpeed;
      jitter[v * 2 + 1] = jLen;
    }

    const t = i * 6;
    index[t] = base;
    index[t + 1] = base + 1;
    index[t + 2] = base + 2;
    index[t + 3] = base;
    index[t + 4] = base + 2;
    index[t + 5] = base + 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geometry.setAttribute('aJitter', new THREE.BufferAttribute(jitter, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  // 手动给包围球，省掉 computeBoundingSphere 对 10 万顶点的遍历
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, box.y * 0.5 - box.below, 0),
    Math.sqrt(hx * hx + hz * hz + (box.y * 0.5) * (box.y * 0.5)) + 4
  );
  return geometry;
}

/**
 * 构建雪的点几何（`THREE.Points`）：一粒雪一个顶点，
 * `setDrawRange(0, n)` 直接就是可见雪花数。
 *
 * 顶点属性：
 * - `position` —— 盒内初始位置
 * - `aSeed`    —— (相位A, 相位B, 大小/速度抖动, 自旋方向) 全部 [0,1)
 *
 * @param {number} count 雪花数量
 * @param {{next: () => number, range: (a: number, b: number) => number}} rng 种子随机源
 * @param {{x: number, y: number, z: number, below: number}} box 跟随盒尺寸
 * @returns {THREE.BufferGeometry} 几何
 */
function buildSnowGeometry(count, rng, box) {
  const position = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  const hx = box.x * 0.5;
  const hz = box.z * 0.5;

  for (let i = 0; i < count; i++) {
    position[i * 3] = rng.range(-hx, hx);
    position[i * 3 + 1] = rng.range(-box.below, box.y - box.below);
    position[i * 3 + 2] = rng.range(-hz, hz);
    seed[i * 4] = rng.next();
    seed[i * 4 + 1] = rng.next();
    seed[i * 4 + 2] = rng.next();
    seed[i * 4 + 3] = rng.next();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, box.y * 0.5 - box.below, 0),
    Math.sqrt(hx * hx + hz * hz + (box.y * 0.5) * (box.y * 0.5)) + 2
  );
  return geometry;
}

/**
 * 构建地面涟漪贴花几何：固定位置池 + 每实例相位，缩放/淡出全部在 shader 内按相位算。
 *
 * 顶点属性：
 * - `position` —— 池中固定落点（y = 0，随根节点整体平移）
 * - `aCorner`  —— 四边形角标 (±1, ±1)，同时充当片元里的极坐标
 * - `aParam`   —— (生命周期相位偏移 0..1, 尺寸抖动 0..1)
 *
 * @param {number} count 涟漪数量（≤200）
 * @param {{next: () => number, range: (a: number, b: number) => number}} rng 种子随机源
 * @param {number} fieldRadius 落点分布半径（m）
 * @returns {THREE.BufferGeometry} 几何
 */
function buildRippleGeometry(count, rng, fieldRadius) {
  const vertexCount = count * 4;
  const position = new Float32Array(vertexCount * 3);
  const corner = new Float32Array(vertexCount * 2);
  const param = new Float32Array(vertexCount * 2);
  const index = new Uint32Array(count * 6);

  const CX = [-1, 1, 1, -1];
  const CZ = [-1, -1, 1, 1];

  for (let i = 0; i < count; i++) {
    // 极坐标取点并对半径开方，保证落点在圆盘上均匀分布
    const angle = rng.range(0, Math.PI * 2);
    const radius = fieldRadius * Math.sqrt(rng.next());
    const px = Math.cos(angle) * radius;
    const pz = Math.sin(angle) * radius;
    const phase = rng.next();
    const sizeJitter = rng.next();
    const base = i * 4;

    for (let c = 0; c < 4; c++) {
      const v = base + c;
      position[v * 3] = px;
      position[v * 3 + 1] = 0;
      position[v * 3 + 2] = pz;
      corner[v * 2] = CX[c];
      corner[v * 2 + 1] = CZ[c];
      param[v * 2] = phase;
      param[v * 2 + 1] = sizeJitter;
    }

    const t = i * 6;
    index[t] = base;
    index[t + 1] = base + 1;
    index[t + 2] = base + 2;
    index[t + 3] = base;
    index[t + 4] = base + 2;
    index[t + 5] = base + 3;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geometry.setAttribute('aParam', new THREE.BufferAttribute(param, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, 0),
    fieldRadius + RIPPLE_JUMP + RIPPLE_MAX_RADIUS + 1
  );
  return geometry;
}

/* ------------------------------------------------------------------ *
 * 着色器
 * ------------------------------------------------------------------ */

const RAIN_VERT = /* glsl */ `
uniform vec3  uOrigin;
uniform vec3  uBox;
uniform float uBelow;
uniform vec2  uWind;
uniform float uTime;
uniform float uFall;
uniform float uWidth;
uniform float uMinPixelWidth;
uniform float uPixelScale;
uniform float uLenNear;
uniform float uLenFar;
uniform float uOpacity;
uniform float uFogDensity;

attribute vec2 aCorner;
attribute vec2 aJitter;

varying vec2  vCorner;
varying float vAlpha;
varying float vFog;

${GLSL_WRAP}

void main() {

	// 逐滴速度抖动：雨滴大小不同，终端速度也不同（Gunn & Kinzer 1949）
	float speed = uFall * ( 0.82 + 0.36 * aJitter.x );

	// 无界轨迹：位置 = 初始位置 + 时间 × 速度；水平位移 = 风矢量 × 下落时间
	vec3 w = position;
	w.x += uWind.x * uTime;
	w.z += uWind.y * uTime;
	w.y -= speed * uTime;

	// 相对「吸附到整数网格的根节点」周期折叠 —— 盒子跟随相机，粒子仍世界锚定
	vec3 local = wrapIntoBox( w, uOrigin, uBox, uBelow );
	vec3 center = ( modelMatrix * vec4( local, 1.0 ) ).xyz;

	vec3 toCam = cameraPosition - center;
	float dist = length( toCam );
	vec3 viewDir = toCam / max( dist, 1e-3 );

	// 运动方向即雨丝倾角：风越大越斜
	vec3 motion = normalize( vec3( uWind.x, - speed, uWind.y ) );
	vec3 side = cross( motion, viewDir );
	float sideLen = length( side );
	side = sideLen > 1e-4 ? side / sideLen : vec3( 1.0, 0.0, 0.0 );

	// 近处雨丝拉长：距离越近，单帧屏幕位移越大，运动模糊越长
	float lenM = mix( uLenNear, uLenFar, smoothstep( 5.0, 95.0, dist ) ) * ( 0.7 + 0.6 * aJitter.y );

	// 保证雨丝在屏幕上至少 uMinPixelWidth 像素宽，避免远处亚像素几何逐帧闪烁；
	// 被撑宽的部分按比例回补 alpha，维持整体亮度不随距离虚增。
	float widthM = max( uWidth, uMinPixelWidth * dist / max( uPixelScale, 1.0 ) );
	float widen = uWidth / widthM;

	vec3 wp = center + side * ( aCorner.x * widthM * 0.5 ) - motion * ( aCorner.y * lenM );

	gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );

	// 三重淡出：盒侧壁、盒顶/盒底、贴脸粒子
	float radial = length( local.xz ) / ( uBox.x * 0.5 );
	float edge = 1.0 - smoothstep( 0.62, 1.0, radial );
	float h = ( local.y + uBelow ) / uBox.y;
	float vfade = smoothstep( 0.0, 0.10, h ) * ( 1.0 - smoothstep( 0.86, 1.0, h ) );
	float nearFade = smoothstep( 0.5, 3.5, dist );

	// 与 THREE.FogExp2 同式：f = 1 - exp( -(density*d)^2 )
	float fd = uFogDensity * dist;
	vFog = 1.0 - exp( - fd * fd );

	vCorner = aCorner;
	vAlpha = uOpacity * edge * vfade * nearFade * ( 1.0 - vFog )
		* ( 0.62 + 0.5 * aJitter.y ) * mix( 1.0, widen, 0.6 );

}
`;

const RAIN_FRAG = /* glsl */ `
uniform vec3  uColor;
uniform vec3  uFogColor;
uniform float uFlash;
uniform float uNight;

varying vec2  vCorner;
varying float vAlpha;
varying float vFog;

void main() {

	// 横向柔边 + 沿运动方向的拖尾渐隐
	float across = 1.0 - abs( vCorner.x );
	float tail = 1.0 - vCorner.y * 0.78;
	float a = vAlpha * smoothstep( 0.0, 0.7, across ) * tail;
	if ( a < 0.004 ) discard;

	vec3 col = uColor * mix( 1.0, 0.42, uNight ) + vec3( 0.30, 0.34, 0.42 ) * uFlash;
	col = mix( col, uFogColor, vFog * 0.6 );

	gl_FragColor = vec4( col, a );

	#include <tonemapping_fragment>
	#include <colorspace_fragment>

	// 输出预乘 alpha 并略压 alpha：NormalBlending 下得到「略带加性」的雨丝高光
	gl_FragColor.rgb *= gl_FragColor.a;
	gl_FragColor.a *= 0.86;

}
`;

const SNOW_VERT = /* glsl */ `
uniform vec3  uOrigin;
uniform vec3  uBox;
uniform float uBelow;
uniform vec2  uWind;
uniform float uTime;
uniform float uFall;
uniform float uSway;
uniform float uSize;
uniform float uPixelScale;
uniform float uOpacity;
uniform float uFogDensity;

attribute vec4 aSeed;

varying float vAlpha;
varying float vFog;
varying float vSpin;

${GLSL_HASH}
${GLSL_WRAP}

void main() {

	float sizeJit = 0.55 + 0.90 * aSeed.z;
	float speed = uFall * ( 0.62 + 0.70 * aSeed.z );
	float phA = aSeed.x * 6.2831853;
	float phB = aSeed.y * 6.2831853;

	// 水平飘摆：两路不同相位的正弦 × 一维 value noise 调制（雪花受紊流影响不规则）
	float n = vnoise1( uTime * 0.45 + aSeed.x * 37.0 ) * 2.0 - 1.0;
	float amp = uSway * ( 0.45 + 0.90 * aSeed.y );
	vec2 sway = vec2(
		sin( uTime * ( 0.55 + 0.45 * aSeed.y ) + phA ),
		cos( uTime * ( 0.47 + 0.38 * aSeed.x ) + phB )
	) * amp * ( 0.55 + 0.65 * n );

	vec3 w = position;
	w.x += uWind.x * uTime + sway.x;
	w.z += uWind.y * uTime + sway.y;
	w.y -= speed * uTime;

	vec3 local = wrapIntoBox( w, uOrigin, uBox, uBelow );
	vec4 world = modelMatrix * vec4( local, 1.0 );
	vec4 mv = viewMatrix * world;
	gl_Position = projectionMatrix * mv;

	// 视深度：与 THREE 的雾同口径（vFogDepth = -mvPosition.z）
	float depth = max( - mv.z, 0.05 );
	// 透视点尺寸：uPixelScale = 0.5 * 绘制高度 * projectionMatrix[1][1]
	gl_PointSize = clamp( uSize * sizeJit * uPixelScale / depth, 1.2, 72.0 );

	float radial = length( local.xz ) / ( uBox.x * 0.5 );
	float edge = 1.0 - smoothstep( 0.60, 1.0, radial );
	float h = ( local.y + uBelow ) / uBox.y;
	float vfade = smoothstep( 0.0, 0.10, h ) * ( 1.0 - smoothstep( 0.85, 1.0, h ) );
	float nearFade = smoothstep( 0.35, 2.2, depth );

	float fd = uFogDensity * depth;
	vFog = 1.0 - exp( - fd * fd );

	// 自旋：方向由 aSeed.w 决定正负，速率随粒子不同
	vSpin = ( aSeed.w * 2.0 - 1.0 ) * ( 0.7 + 1.6 * aSeed.y ) * uTime + phA;
	vAlpha = uOpacity * edge * vfade * nearFade * ( 1.0 - vFog ) * ( 0.60 + 0.55 * aSeed.y );

}
`;

const SNOW_FRAG = /* glsl */ `
uniform vec3  uColor;
uniform vec3  uFogColor;
uniform float uFlash;
uniform float uNight;

varying float vAlpha;
varying float vFog;
varying float vSpin;

void main() {

	// 把点精灵坐标绕中心旋转，自旋才看得出来
	vec2 pc = gl_PointCoord - 0.5;
	float c = cos( vSpin );
	float s = sin( vSpin );
	vec2 p = vec2( c * pc.x - s * pc.y, s * pc.x + c * pc.y );

	float r = length( p ) * 2.0;
	// 柔边圆 + 轻微六瓣结构（雪花六方晶系的极简暗示）
	float petal = 0.80 + 0.20 * cos( atan( p.y + 1e-5, p.x + 1e-5 ) * 6.0 );
	float a = vAlpha * smoothstep( 1.0, 0.05, r / max( petal, 0.2 ) );
	if ( a < 0.004 ) discard;

	vec3 col = uColor * mix( 1.0, 0.50, uNight ) + vec3( 0.32, 0.35, 0.42 ) * uFlash;
	col = mix( col, uFogColor, vFog * 0.55 );

	gl_FragColor = vec4( col, a );

	#include <tonemapping_fragment>
	#include <colorspace_fragment>

}
`;

const RIPPLE_VERT = /* glsl */ `
uniform float uTime;
uniform float uLife;
uniform float uMaxRadius;
uniform float uFieldRadius;
uniform float uJump;
uniform float uOpacity;
uniform float uFogDensity;

attribute vec2 aCorner;
attribute vec2 aParam;

varying vec2  vCorner;
varying float vAlpha;

${GLSL_HASH}

void main() {

	// 相位偏移让 200 个涟漪错开生灭；周期号参与哈希，使每一轮落点都换个地方，
	// 避免固定位置池暴露成「规则点阵」。整个过程零 JS 循环。
	float phased = uTime / uLife + aParam.x;
	float t = fract( phased );
	float cycle = floor( phased );
	vec2 jump = vec2(
		hash11( cycle * 1.7 + aParam.x * 91.3 ),
		hash11( cycle * 3.1 + aParam.y * 57.7 )
	) - 0.5;

	vec3 base = position + vec3( jump.x * uJump, 0.0, jump.y * uJump );

	// 环状扩散：半径按 sqrt(t) 增长（水面重力波前沿减速），alpha 二次方淡出
	float radius = uMaxRadius * ( 0.30 + 0.70 * aParam.y ) * ( 0.12 + 0.88 * sqrt( t ) );
	vec3 local = base + vec3( aCorner.x * radius, 0.0, aCorner.y * radius );
	vec4 world = modelMatrix * vec4( local, 1.0 );
	gl_Position = projectionMatrix * viewMatrix * world;

	float dist = distance( cameraPosition, world.xyz );
	float fd = uFogDensity * dist;
	float fog = 1.0 - exp( - fd * fd );

	float fadeIn = smoothstep( 0.0, 0.12, t );
	float fadeOut = 1.0 - t;
	float field = 1.0 - smoothstep( 0.55, 1.0, length( base.xz ) / uFieldRadius );

	vCorner = aCorner;
	vAlpha = uOpacity * fadeIn * fadeOut * fadeOut * field * ( 1.0 - fog ) * smoothstep( 0.6, 3.0, dist );

}
`;

const RIPPLE_FRAG = /* glsl */ `
uniform vec3 uColor;

varying vec2  vCorner;
varying float vAlpha;

void main() {

	float r = length( vCorner );
	if ( r > 1.0 ) discard;

	// 高斯亮环 + 内圈微弱余波
	float qOuter = ( r - 0.78 ) / 0.17;
	float qInner = ( r - 0.42 ) / 0.22;
	float a = vAlpha * ( exp( - qOuter * qOuter ) + 0.25 * exp( - qInner * qInner ) );
	if ( a < 0.004 ) discard;

	gl_FragColor = vec4( uColor, a );

	#include <tonemapping_fragment>
	#include <colorspace_fragment>

}
`;

/* ------------------------------------------------------------------ *
 * 工厂
 * ------------------------------------------------------------------ */

/**
 * 创建降水系统（契约 §6.4）。
 *
 * 返回的句柄包含：
 * - `object3D` —— 名为 `'precipitation'` 的根节点（含雨 / 雪 / 涟漪三个子对象，共 3 个 drawcall）
 * - `update(ctx)` —— 每帧只写 uniform 与 drawRange
 * - `dispose()` —— 释放本模块自建的全部 geometry / material（不碰 `ctx.textures`）
 * - `stats` —— `{ instances, draws, rain, snow, ripples }`，随强度实时反映当前可见粒子数
 *
 * @param {{quality?: string, rng?: Object, seed?: (string|number)}} [ctx0] 构建期上下文（契约 §5）
 * @returns {{object3D: THREE.Group, update: (ctx: Object) => void, dispose: () => void, stats: Object}} SystemHandle
 */
export function createPrecipitation(ctx0) {
  const opts = ctx0 || {};
  const quality = PRECIP_COUNTS[opts.quality] ? opts.quality : 'high';
  const budget = PRECIP_COUNTS[quality];

  // 契约要求用 rng.fork 派生自己的流；ctx0.rng 缺失时用 seed 兜底自建（绝不用 Math.random）
  const baseRng =
    opts.rng && typeof opts.rng.fork === 'function'
      ? opts.rng.fork('precipitation')
      : makeRng(opts.seed === undefined ? 'precipitation' : opts.seed, 'precipitation');
  const rainRng = baseRng.fork('rain');
  const snowRng = baseRng.fork('snow');
  const rippleRng = baseRng.fork('ripple');

  const root = new THREE.Group();
  root.name = 'precipitation';
  root.frustumCulled = false;

  /* ---------------- 雨 ---------------- */

  const rainGeometry = buildRainGeometry(budget.rain, rainRng, RAIN_BOX);
  const rainUniforms = {
    uOrigin: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(RAIN_BOX.x, RAIN_BOX.y, RAIN_BOX.z) },
    uBelow: { value: RAIN_BOX.below },
    uWind: { value: new THREE.Vector2(0, 0) },
    uTime: { value: 0 },
    uFall: { value: RAIN_FALL_SPEED },
    uWidth: { value: RAIN_WIDTH },
    uMinPixelWidth: { value: RAIN_MIN_PIXEL_WIDTH },
    uPixelScale: { value: 900 },
    uLenNear: { value: RAIN_LEN_NEAR },
    uLenFar: { value: RAIN_LEN_FAR },
    uOpacity: { value: 0 },
    uFogDensity: { value: 0.00016 },
    uColor: { value: new THREE.Color(0.60, 0.68, 0.82) },
    uFogColor: { value: new THREE.Color(0.62, 0.68, 0.76) },
    uFlash: { value: 0 },
    uNight: { value: 0 }
  };
  const rainMaterial = new THREE.ShaderMaterial({
    uniforms: rainUniforms,
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    premultipliedAlpha: true,
    side: THREE.DoubleSide
  });
  rainMaterial.name = 'precip-rain';

  const rainMesh = new THREE.Mesh(rainGeometry, rainMaterial);
  rainMesh.name = 'rain';
  rainMesh.frustumCulled = false; // 盒子恒定包住相机，剔除只会误伤
  rainMesh.renderOrder = 11;
  rainMesh.visible = false;
  rainGeometry.setDrawRange(0, 0);
  root.add(rainMesh);

  /* ---------------- 雪 ---------------- */

  const snowGeometry = buildSnowGeometry(budget.snow, snowRng, SNOW_BOX);
  const snowUniforms = {
    uOrigin: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(SNOW_BOX.x, SNOW_BOX.y, SNOW_BOX.z) },
    uBelow: { value: SNOW_BOX.below },
    uWind: { value: new THREE.Vector2(0, 0) },
    uTime: { value: 0 },
    uFall: { value: SNOW_FALL_SPEED },
    uSway: { value: SNOW_SWAY },
    uSize: { value: SNOW_SIZE },
    uPixelScale: { value: 900 },
    uOpacity: { value: 0 },
    uFogDensity: { value: 0.00016 },
    uColor: { value: new THREE.Color(0.94, 0.96, 1.0) },
    uFogColor: { value: new THREE.Color(0.62, 0.68, 0.76) },
    uFlash: { value: 0 },
    uNight: { value: 0 }
  };
  const snowMaterial = new THREE.ShaderMaterial({
    uniforms: snowUniforms,
    vertexShader: SNOW_VERT,
    fragmentShader: SNOW_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending
  });
  snowMaterial.name = 'precip-snow';

  const snowPoints = new THREE.Points(snowGeometry, snowMaterial);
  snowPoints.name = 'snow';
  snowPoints.frustumCulled = false;
  snowPoints.renderOrder = 11;
  snowPoints.visible = false;
  snowGeometry.setDrawRange(0, 0);
  root.add(snowPoints);

  /* ---------------- 地面雨溅涟漪 ---------------- */

  const rippleGeometry = buildRippleGeometry(budget.ripple, rippleRng, RIPPLE_FIELD_RADIUS);
  const rippleUniforms = {
    uTime: { value: 0 },
    uLife: { value: RIPPLE_LIFE },
    uMaxRadius: { value: RIPPLE_MAX_RADIUS },
    uFieldRadius: { value: RIPPLE_FIELD_RADIUS },
    uJump: { value: RIPPLE_JUMP },
    uOpacity: { value: 0 },
    uFogDensity: { value: 0.00016 },
    uColor: { value: new THREE.Color(0.74, 0.80, 0.88) }
  };
  const rippleMaterial = new THREE.ShaderMaterial({
    uniforms: rippleUniforms,
    vertexShader: RIPPLE_VERT,
    fragmentShader: RIPPLE_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide
  });
  rippleMaterial.name = 'precip-ripple';

  const rippleMesh = new THREE.Mesh(rippleGeometry, rippleMaterial);
  rippleMesh.name = 'rain-ripples';
  rippleMesh.frustumCulled = false;
  rippleMesh.renderOrder = 10;
  rippleMesh.visible = false;
  rippleMesh.position.y = RIPPLE_Y;
  rippleGeometry.setDrawRange(0, 0);
  root.add(rippleMesh);

  /* ---------------- 每帧更新 ---------------- */

  const stats = {
    instances: 0,
    draws: 0,
    rain: 0,
    snow: 0,
    ripples: 0,
    maxRain: budget.rain,
    maxSnow: budget.snow,
    maxRipples: budget.ripple
  };

  const drawBufferSize = new THREE.Vector2(1920, 1080);
  let disposed = false;

  /**
   * 每帧更新（契约 §1）：只写 uniform 与 drawRange，不新建任何对象、不重建 buffer。
   * @param {Object} ctx FrameContext（契约 §2）
   * @returns {void}
   */
  function update(ctx) {
    if (disposed || !ctx || !ctx.camera) return;

    const params = ctx.weather && ctx.weather.params ? ctx.weather.params : null;
    const rain = clamp01(params ? params.rainIntensity : 0);
    const snow = clamp01(params ? params.snowIntensity : 0);

    const rainOn = rain > OFF_EPSILON;
    const snowOn = snow > OFF_EPSILON;

    // 强度为 0 时整棵子树关闭，连遍历都省了
    root.visible = rainOn || snowOn;
    if (!root.visible) {
      rainMesh.visible = false;
      snowPoints.visible = false;
      rippleMesh.visible = false;
      stats.rain = 0;
      stats.snow = 0;
      stats.ripples = 0;
      stats.instances = 0;
      stats.draws = 0;
      return;
    }

    // 时间回绕，避免长时间运行后 float32 精度不足导致粒子「结晶」；非法值退回 0
    const elapsed = Number.isFinite(ctx.elapsed) ? ctx.elapsed : 0;
    const time = ((elapsed % TIME_WRAP) + TIME_WRAP) % TIME_WRAP;

    // 雾：与 scene.fog 同参数，保证降水和场景一起淡入雾里
    let fogDensity = 0.00016;
    const fog = ctx.scene ? ctx.scene.fog : null;
    if (fog) {
      if (typeof fog.density === 'number' && Number.isFinite(fog.density)) fogDensity = fog.density;
      if (fog.color) {
        rainUniforms.uFogColor.value.copy(fog.color);
        snowUniforms.uFogColor.value.copy(fog.color);
      }
    }

    const night = clamp01(ctx.nightFactor);
    const flash = clamp01(ctx.weather ? ctx.weather.flash : 0);

    // 风：ctx.wind.vector 是「水平单位向量 × 速度」，取其 (x, z) 分量
    const wv = ctx.wind && ctx.wind.vector ? ctx.wind.vector : null;
    const windX = wv && Number.isFinite(wv.x) ? wv.x : 0;
    const windZ = wv && Number.isFinite(wv.z) ? wv.z : 0;

    // 根节点吸附到相机附近的整数米网格：消除大坐标下的着色器抖动
    const camPos = ctx.camera.position;
    const ox = Math.round(camPos.x);
    const oy = Math.round(camPos.y);
    const oz = Math.round(camPos.z);

    // 「1 米在 1 米远处占多少像素」：projectionMatrix[1][1] = 1/tan(fov/2)
    // 雨丝最小屏幕宽度与雪花点精灵尺寸都要用它
    if (ctx.renderer && typeof ctx.renderer.getDrawingBufferSize === 'function') {
      ctx.renderer.getDrawingBufferSize(drawBufferSize);
    }
    const pixelScale = 0.5 * drawBufferSize.y * ctx.camera.projectionMatrix.elements[5];

    /* --- 雨 --- */
    rainMesh.visible = rainOn;
    if (rainOn) {
      const n = Math.max(1, Math.round(budget.rain * Math.pow(Math.min(1, rain * 1.08), 0.8)));
      rainGeometry.setDrawRange(0, n * 6);
      stats.rain = n;

      rainMesh.position.set(ox, oy, oz);
      rainUniforms.uOrigin.value.set(ox, oy, oz);
      rainUniforms.uWind.value.set(windX * RAIN_WIND_DRIFT, windZ * RAIN_WIND_DRIFT);
      rainUniforms.uTime.value = time;
      rainUniforms.uOpacity.value = 0.22 + 0.62 * rain;
      rainUniforms.uFogDensity.value = fogDensity;
      rainUniforms.uNight.value = night;
      rainUniforms.uFlash.value = flash;
      rainUniforms.uPixelScale.value = pixelScale;
    } else {
      stats.rain = 0;
    }

    /* --- 雪 --- */
    snowPoints.visible = snowOn;
    if (snowOn) {
      const n = Math.max(1, Math.round(budget.snow * Math.pow(Math.min(1, snow * 1.08), 0.8)));
      snowGeometry.setDrawRange(0, n);
      stats.snow = n;

      snowPoints.position.set(ox, oy, oz);
      snowUniforms.uOrigin.value.set(ox, oy, oz);
      snowUniforms.uWind.value.set(windX * SNOW_WIND_DRIFT, windZ * SNOW_WIND_DRIFT);
      snowUniforms.uTime.value = time;
      snowUniforms.uOpacity.value = 0.35 + 0.5 * snow;
      snowUniforms.uFogDensity.value = fogDensity;
      snowUniforms.uNight.value = night;
      snowUniforms.uFlash.value = flash;
      snowUniforms.uPixelScale.value = pixelScale;
    } else {
      stats.snow = 0;
    }

    /* --- 地面雨溅涟漪：雨强 > 0.3 且相机不在高空时才开 --- */
    const rippleOn = rain > RIPPLE_RAIN_THRESHOLD && camPos.y < RIPPLE_CAMERA_MAX_Y;
    rippleMesh.visible = rippleOn;
    if (rippleOn) {
      const n = budget.ripple;
      rippleGeometry.setDrawRange(0, n * 6);
      stats.ripples = n;

      rippleMesh.position.set(ox, RIPPLE_Y, oz);
      rippleUniforms.uTime.value = time;
      rippleUniforms.uOpacity.value =
        0.55 * Math.min(1, (rain - RIPPLE_RAIN_THRESHOLD) / 0.35);
      rippleUniforms.uFogDensity.value = fogDensity;
    } else {
      stats.ripples = 0;
    }

    stats.instances = stats.rain + stats.snow + stats.ripples;
    stats.draws = (rainOn ? 1 : 0) + (snowOn ? 1 : 0) + (rippleOn ? 1 : 0);
  }

  /**
   * 释放本模块自建的几何与材质（契约 §1：不释放 ctx.textures 的共享贴图）。
   * 幂等，可重复调用。
   * @returns {void}
   */
  function dispose() {
    if (disposed) return;
    disposed = true;
    rainGeometry.dispose();
    snowGeometry.dispose();
    rippleGeometry.dispose();
    rainMaterial.dispose();
    snowMaterial.dispose();
    rippleMaterial.dispose();
    root.clear();
    stats.instances = 0;
    stats.draws = 0;
  }

  return { object3D: root, update, dispose, stats };
}
