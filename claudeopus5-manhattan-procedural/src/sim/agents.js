/**
 * @file src/sim/agents.js
 * @module sim/agents
 * @description 非车辆动画体系统（契约 §6.2）：鸟群 / 直升机 / 船只 / 行人 四类。
 *
 * ---------------------------------------------------------------------------
 * 一、算法与公式出处
 * ---------------------------------------------------------------------------
 * 1. **Boids 鸟群**：Craig Reynolds, "Flocks, Herds, and Schools: A Distributed
 *    Behavioral Model", SIGGRAPH 1987。三条局部规则：
 *      - 分离 separation：`Σ (pᵢ − pⱼ) / |pᵢ − pⱼ|²`（近邻越近排斥越强）
 *      - 对齐 alignment ：邻域平均速度 − 自身速度
 *      - 聚合 cohesion  ：邻域质心 − 自身位置
 *    叠加「边界回引」「高度偏好」「楼顶避让」后限幅为转向力，再积分。
 * 2. **飞行器倾斜（coordinated turn）**：滚转角与偏航角速度成正比
 *    `φ = −k·(dψ/dt)`（转向内侧机翼下沉），直升机与鸟共用同一套基向量构造。
 * 3. **开尔文尾迹角**：Lord Kelvin (1887) 给出的深水船行波张角 arcsin(1/3) ≈ 19.47°，
 *    尾迹 V 形面片即按此半角张开。
 * 4. **步态摆动**：简谐近似 `θ(t) = A·sin(ϕ)`，同侧手脚反相（人体正常步态的对角协同）。
 * 5. **信号周期**：与契约 §6.1 一致的 30s 绿 → 4s 黄 → 24s 绿 → 4s 黄 = 62s 循环，
 *    路口相位偏移按坐标错开形成绿波。
 *
 * ---------------------------------------------------------------------------
 * 二、性能策略（契约 §6.2 要求 drawcall ≤ 10）
 * ---------------------------------------------------------------------------
 * 全部 7 个 `InstancedMesh`，无一例外：
 *   1 鸟群（翅膀扇动在顶点着色器里做）
 *   2 直升机机体（主旋翼 / 尾桨旋转也在顶点着色器里做）
 *   3 旋翼半透明旋转盘
 *   4 直升机机腹频闪灯（加性混合，逐实例颜色）
 *   5 船只（三种船型合并成一份几何，用逐实例 `aBoatType` 在顶点着色器里剔除非本型顶点）
 *   6 船只 V 形尾迹（滚动 uv）
 *   7 行人（步态摆动在顶点着色器里做）
 * `update()` 内不 `new` 任何对象：所有临时向量 / 四元数 / 矩阵在模块作用域预分配。
 *
 * ---------------------------------------------------------------------------
 * 三、契约差异说明（按 §0 要求就地记录，不改契约）
 * ---------------------------------------------------------------------------
 * - 契约 §0「依赖方向」规定 `sim/*` 不得 import `city/*`，因此本文件**不** import
 *   `city/grid.js` 的 `CITY` 常量，而是把契约 §4.1 中已写死的尺寸（路宽 / 人行道宽 /
 *   河岸 X / 桥位）在下方 `CITY_DIM` 里镜像一份；路网的**可变部分**（大道 X、街道 Z、
 *   路口表）一律从 `ctx0.plan` 读取，不重复推导。
 * - 契约 §6.1 的信号相位机在 `sim/traffic.js` 里，同为 `sim/*` 不可 import，
 *   故本文件按同一组时长常量自行实现一份**行人过街相位**（`crossingIsWalkable`）。
 *   二者相位偏移函数不必逐帧一致，视觉上只体现为「行人到路口会停走」。
 * - 本模块的材质**不调用** `patchCityMaterial`：鸟 / 人 / 船不需要积雪与水洼，且该注入器会
 *   改写 `customProgramCacheKey`，与本文件自己的顶点动画注入冲突（会导致 program 复用串味）。
 *   闪电补光与夜间自发光改为直接引用 `ctx0.env` 的 `uFlash` / `uNight` uniform 对象实现。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep, damp, mod, TWO_PI } from '../core/mathx.js';
import { makeRng } from '../core/rng.js';

/* ========================================================================== *
 * 常量
 * ========================================================================== */

/**
 * 契约 §4.1 已写死的城市尺寸（镜像副本，见文件头「契约差异说明」）。
 * 只读，不参与任何计算之外的用途。
 * @type {Readonly<Object>}
 */
const CITY_DIM = Object.freeze({
  minX: -800,
  maxX: 800,
  minZ: -2400,
  maxZ: 2400,
  streetSpacing: 80,
  avenueRoadWidth: 34,
  streetRoadWidth: 20,
  sidewalkWidth: 6,
  park: Object.freeze({ minX: -420, maxX: 140, minZ: -2080, maxZ: -720 }),
  hudsonX: -800,
  eastX: 800
});

/** 人行道顶面高度（米）——契约 §5.1 规定人行道抬高 0.18m。 */
const SIDEWALK_Y = 0.18;

/** 河面基准高度（米）。桥面在 40m，船只桅顶控制在 20m 以内保证可通航。 */
const WATER_Y = -0.35;

/** 信号灯完整周期（秒）：南北绿 30 + 黄 4 + 东西绿 24 + 黄 4（契约 §6.1）。 */
const SIGNAL_CYCLE = 62;
/** 南北向绿灯时长（秒）。 */
const SIGNAL_NS_GREEN = 30;
/** 东西向绿灯起始时刻（秒）：30 绿 + 4 黄。 */
const SIGNAL_EW_START = 34;
/** 东西向绿灯结束时刻（秒）：34 + 24。 */
const SIGNAL_EW_END = 58;

/** 船只鸣笛节流下限（秒）——契约 §6.2 要求 ≥ 40s。 */
const HORN_MIN_INTERVAL = 42;
/** 船只鸣笛的相机距离上限（米）。 */
const HORN_MAX_DISTANCE = 1500;
/** 鸣笛距离平方（避免开方）。 */
const HORN_MAX_DISTANCE_SQ = HORN_MAX_DISTANCE * HORN_MAX_DISTANCE;

/** 开尔文尾迹半角（弧度）：arcsin(1/3) ≈ 19.47°。 */
const KELVIN_HALF_ANGLE = Math.asin(1 / 3);

/* ========================================================================== *
 * 预分配的临时对象（契约 §6.2：update 内禁止 new）
 * ========================================================================== */

const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _vD = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _scaleOne = new THREE.Vector3(1, 1, 1);
const _mat = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _color = new THREE.Color();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

/* ========================================================================== *
 * 通用小工具
 * ========================================================================== */

/**
 * 把一份几何体规范化为「非索引 + 带指定自定义属性」的形态，便于 `mergeGeometries` 合并。
 * 原几何体若被转换会就地 dispose，避免泄漏。
 *
 * @param {THREE.BufferGeometry} geo 源几何体（必须含 position/normal/uv）
 * @param {Object<string, number|number[]>} attrs 自定义属性表；值为数字表示单分量常量，
 *   为数组表示多分量常量（逐顶点相同）
 * @returns {THREE.BufferGeometry} 可直接参与合并的几何体
 */
function tagGeometry(geo, attrs) {
  let g = geo;
  if (g.index) {
    const nonIndexed = g.toNonIndexed();
    g.dispose();
    g = nonIndexed;
  }
  const count = g.attributes.position.count;
  if (!g.attributes.uv) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const name in attrs) {
    const spec = attrs[name];
    if (Array.isArray(spec)) {
      const size = spec.length;
      const arr = new Float32Array(count * size);
      for (let i = 0; i < count; i++) {
        for (let k = 0; k < size; k++) arr[i * size + k] = spec[k];
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, size));
    } else {
      const arr = new Float32Array(count);
      arr.fill(spec);
      g.setAttribute(name, new THREE.BufferAttribute(arr, 1));
    }
  }
  return g;
}

/**
 * 合并一组已 `tagGeometry` 规范化的几何体，并释放中间产物。
 * @param {THREE.BufferGeometry[]} parts 零件列表
 * @returns {THREE.BufferGeometry} 合并结果
 */
function mergeParts(parts) {
  const merged = mergeGeometries(parts, false);
  for (let i = 0; i < parts.length; i++) parts[i].dispose();
  return merged;
}

/**
 * 由「前向 + 滚转角」构造正交基并写入实例矩阵。
 * 基向量满足右手系：X = Y × Z，Z = 前向，滚转按罗德里格斯公式绕前向轴旋转。
 *
 * @param {THREE.Matrix4} out 目标矩阵
 * @param {THREE.Vector3} forward 前向（可未归一化，内部归一化）
 * @param {number} roll 滚转角（弧度，正值抬起 +X 侧）
 * @param {THREE.Vector3} position 世界位置
 * @param {number} scale 统一缩放
 * @returns {THREE.Matrix4} out
 */
function composeOriented(out, forward, roll, position, scale) {
  _fwd.copy(forward);
  if (_fwd.lengthSq() < 1e-10) _fwd.set(0, 0, 1);
  _fwd.normalize();
  // 前向与世界上方几乎平行时换一个参考轴，避免叉积退化
  if (Math.abs(_fwd.y) > 0.995) {
    _right.set(1, 0, 0).cross(_fwd);
    if (_right.lengthSq() < 1e-8) _right.set(0, 0, 1).cross(_fwd);
  } else {
    _right.copy(WORLD_UP).cross(_fwd);
  }
  _right.normalize();
  _up.copy(_fwd).cross(_right).normalize();

  if (roll !== 0) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    // right' = right·cosφ + up·sinφ ；up' = up·cosφ − right·sinφ
    const rx = _right.x * c + _up.x * s;
    const ry = _right.y * c + _up.y * s;
    const rz = _right.z * c + _up.z * s;
    const ux = _up.x * c - _right.x * s;
    const uy = _up.y * c - _right.y * s;
    const uz = _up.z * c - _right.z * s;
    _right.set(rx, ry, rz);
    _up.set(ux, uy, uz);
  }

  out.makeBasis(_right, _up, _fwd);
  if (scale !== 1) {
    _vD.set(scale, scale, scale);
    out.scale(_vD);
  }
  out.setPosition(position);
  return out;
}

/**
 * 走最短弧的角度指数阻尼（弧度版，等价于 `mathx.dampAngleDeg`）。
 * @param {number} current 当前角（弧度）
 * @param {number} target 目标角（弧度）
 * @param {number} lambda 逼近速率（1/秒）
 * @param {number} dt 时间步长（秒）
 * @returns {number} 本步之后的角度（弧度）
 */
function dampAngleRad(current, target, lambda, dt) {
  const delta = mod(target - current + Math.PI, TWO_PI) - Math.PI;
  return current + delta * (1 - Math.exp(-lambda * dt));
}

/**
 * `ctx0.rng` 缺失时的兜底子流：仍然是确定性种子 RNG（绝不退化到 `Math.random`，契约 §0）。
 * @param {string} name 子流名
 * @returns {import('../core/rng.js').Rng} 兜底子流
 */
function makeFallbackRng(name) {
  return makeRng('agents-fallback', name);
}

/**
 * 行人过街相位：判断某路口在给定轴向上此刻是否可通行。
 * 时序与契约 §6.1 相同（30s / 4s / 24s / 4s），相位偏移由路口坐标决定形成绿波。
 *
 * @param {number} offset 该路口的相位偏移（秒）
 * @param {number} timeSec 当前时间（秒）
 * @param {number} axis 0 = 沿 Z 走（与南北车流平行），1 = 沿 X 走（与东西车流平行）
 * @returns {boolean} 是否可以通过路口
 */
function crossingIsWalkable(offset, timeSec, axis) {
  const p = mod(timeSec + offset, SIGNAL_CYCLE);
  if (axis === 0) return p < SIGNAL_NS_GREEN;
  return p >= SIGNAL_EW_START && p < SIGNAL_EW_END;
}

/**
 * 由路口坐标推导相位偏移（秒），沿 +Z 方向形成绿波。
 * @param {number} x 路口 X
 * @param {number} z 路口 Z
 * @returns {number} [0, SIGNAL_CYCLE)
 */
function crossingOffset(x, z) {
  return mod(z * 0.055 + x * 0.013, SIGNAL_CYCLE);
}

/**
 * 给材质挂上本模块自己的着色器注入（顶点动画 / 夜间自发光）。
 *
 * **不复用** `render/shaderpatch.js` 的 `patchCityMaterial`：那个注入器会独占
 * `customProgramCacheKey`，与这里的注入互相覆盖。这里为每种材质写死唯一 cacheKey，
 * 确保 Three 不会因 `onBeforeCompile.toString()` 相同而错误复用着色器程序。
 *
 * @param {THREE.Material} material 目标材质
 * @param {string} cacheKey 唯一程序缓存键
 * @param {Object} parts 注入片段
 * @param {Object<string, {value:*}>} [parts.uniforms] 需要合入的 uniform（按引用共享）
 * @param {string} [parts.vertexPars] 顶点着色器声明块（attribute/varying/函数）
 * @param {string} [parts.normalBody] `beginnormal_vertex` 之后的法线变换
 * @param {string} [parts.vertexBody] `begin_vertex` 之后的顶点变换
 * @param {string} [parts.fragmentPars] 片元着色器声明块
 * @param {string} [parts.colorBody] `color_fragment` 之后的漫反射调整
 * @param {string} [parts.emissiveBody] `emissivemap_fragment` 之后的自发光叠加
 * @returns {THREE.Material} 同一个 material
 */
function injectAgentShader(material, cacheKey, parts) {
  material.customProgramCacheKey = () => cacheKey;
  material.onBeforeCompile = (shader) => {
    if (parts.uniforms) {
      for (const key in parts.uniforms) {
        if (shader.uniforms[key] === undefined) shader.uniforms[key] = parts.uniforms[key];
      }
    }
    let vs = shader.vertexShader;
    if (parts.vertexPars) {
      vs = vs.replace('#include <common>', () => `#include <common>\n${parts.vertexPars}`);
    }
    if (parts.normalBody && vs.indexOf('#include <beginnormal_vertex>') !== -1) {
      vs = vs.replace(
        '#include <beginnormal_vertex>',
        () => `#include <beginnormal_vertex>\n${parts.normalBody}`
      );
    }
    if (parts.vertexBody) {
      vs = vs.replace('#include <begin_vertex>', () => `#include <begin_vertex>\n${parts.vertexBody}`);
    }
    shader.vertexShader = vs;

    let fs = shader.fragmentShader;
    if (parts.fragmentPars) {
      fs = fs.replace('#include <common>', () => `#include <common>\n${parts.fragmentPars}`);
    }
    if (parts.colorBody && fs.indexOf('#include <color_fragment>') !== -1) {
      fs = fs.replace(
        '#include <color_fragment>',
        () => `#include <color_fragment>\n${parts.colorBody}`
      );
    }
    if (parts.emissiveBody && fs.indexOf('#include <emissivemap_fragment>') !== -1) {
      fs = fs.replace(
        '#include <emissivemap_fragment>',
        () => `#include <emissivemap_fragment>\n${parts.emissiveBody}`
      );
    }
    shader.fragmentShader = fs;
  };
  material.needsUpdate = true;
  return material;
}

/* ========================================================================== *
 * 几何构建：鸟
 * ========================================================================== */

/**
 * 构建一只鸟的几何体（局部坐标：+Z 机头，+Y 背向上，翅膀沿 ±X 展开）。
 *
 * 组成：细长锥体身体 + 一片尾羽三角 + **两片薄三角面翅膀**（契约 §6.2 明文要求）。
 * 每个顶点带 `aWing`：0 = 不动，+1 / −1 = 左右翅（在顶点着色器里绕体轴 Z 反相扇动）。
 *
 * @returns {THREE.BufferGeometry} 合并后的鸟几何体
 */
function buildBirdGeometry() {
  const parts = [];

  // 身体：细长锥体，锥尖朝 +Z
  const body = new THREE.ConeGeometry(0.13, 1.05, 6, 1, false);
  body.rotateX(Math.PI / 2);
  parts.push(tagGeometry(body, { aWing: 0 }));

  // 尾羽：机尾一片小三角（水平面内）
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0.02, -0.42,
    0.24, 0.02, -0.78,
    -0.24, 0.02, -0.78
  ]), 3));
  tail.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0
  ]), 3));
  tail.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0.5, 1, 1, 0, 0, 0
  ]), 2));
  parts.push(tagGeometry(tail, { aWing: 0 }));

  // 翅膀：左右各一片薄三角面
  for (let s = 0; s < 2; s++) {
    const sign = s === 0 ? 1 : -1;
    const rootF = [0.07 * sign, 0.03, 0.22];
    const tip = [1.02 * sign, 0.07, -0.12];
    const rootB = [0.07 * sign, 0.03, -0.34];
    // 保持绕序一致（法线朝上）：右翅 F→T→B，左翅 F→B→T
    const ordered = sign > 0 ? [rootF, tip, rootB] : [rootF, rootB, tip];
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      ordered[0][0], ordered[0][1], ordered[0][2],
      ordered[1][0], ordered[1][1], ordered[1][2],
      ordered[2][0], ordered[2][1], ordered[2][2]
    ]), 3));
    wing.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([
      0, 1, 0, 0, 1, 0, 0, 1, 0
    ]), 3));
    wing.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0, 1, 0.5, 0, 1
    ]), 2));
    parts.push(tagGeometry(wing, { aWing: sign }));
  }

  return mergeParts(parts);
}

/* ========================================================================== *
 * 几何构建：直升机
 * ========================================================================== */

/** 直升机主旋翼桨毂高度（米，局部坐标）。 */
const HELI_ROTOR_Y = 2.15;
/** 直升机尾桨桨毂位置（局部坐标）。 */
const HELI_TAIL_HUB = new THREE.Vector3(0.42, 1.05, -6.85);

/**
 * 构建直升机机体几何体（局部坐标：+Z 机头，+Y 上）。整机约 14m 长、旋翼直径 11.4m。
 *
 * 逐顶点属性 `aPart`：0 = 静止部件，1 = 主旋翼（绕 Y 轴），2 = 尾桨（绕过 `HELI_TAIL_HUB` 的 X 轴）。
 * 逐顶点 `color` 提供涂装分色，`aGlow` 标记夜间发光的舷窗。
 *
 * @returns {THREE.BufferGeometry} 合并后的机体几何体
 */
function buildHelicopterGeometry() {
  const parts = [];
  const shell = [0.62, 0.66, 0.72];
  const dark = [0.14, 0.15, 0.18];
  const accent = [0.72, 0.16, 0.12];

  /**
   * 追加一个静止零件。
   * @param {THREE.BufferGeometry} g 零件
   * @param {number[]} col RGB
   * @param {number} [glow=0] 夜间发光标记
   * @returns {void}
   */
  const still = (g, col, glow = 0) => {
    parts.push(tagGeometry(g, { aPart: 0, color: col, aGlow: glow }));
  };

  // 机身：椭球
  const fuselage = new THREE.SphereGeometry(1.5, 14, 10);
  fuselage.scale(1.0, 0.94, 2.05);
  still(fuselage, shell);

  // 机鼻座舱玻璃
  const nose = new THREE.SphereGeometry(1.18, 12, 8);
  nose.scale(1.0, 0.86, 1.25);
  nose.translate(0, 0.05, 2.35);
  still(nose, [0.10, 0.13, 0.17], 1);

  // 侧舷窗
  for (let s = -1; s <= 1; s += 2) {
    const win = new THREE.BoxGeometry(0.1, 0.85, 2.2);
    win.translate(s * 1.46, 0.28, 0.35);
    still(win, [0.10, 0.13, 0.17], 1);
  }

  // 尾梁
  const boom = new THREE.CylinderGeometry(0.36, 0.2, 5.8, 10);
  boom.rotateX(Math.PI / 2);
  boom.translate(0, 0.62, -4.2);
  still(boom, shell);

  // 垂尾
  const fin = new THREE.BoxGeometry(0.14, 1.9, 1.35);
  fin.translate(0, 1.55, -6.75);
  still(fin, accent);

  // 平尾
  const stab = new THREE.BoxGeometry(2.6, 0.12, 0.75);
  stab.translate(0, 0.9, -6.1);
  still(stab, shell);

  // 旋翼主轴
  const mast = new THREE.CylinderGeometry(0.22, 0.28, 1.1, 8);
  mast.translate(0, 1.62, 0);
  still(mast, dark);

  // 起落滑橇
  for (let s = -1; s <= 1; s += 2) {
    const skid = new THREE.CylinderGeometry(0.11, 0.11, 5.4, 6);
    skid.rotateX(Math.PI / 2);
    skid.translate(s * 1.25, -2.05, -0.2);
    still(skid, dark);
    for (let k = -1; k <= 1; k += 2) {
      const strut = new THREE.CylinderGeometry(0.09, 0.09, 1.5, 6);
      strut.rotateZ(s * 0.32);
      strut.translate(s * 0.95, -1.4, k * 1.5);
      still(strut, dark);
    }
  }

  // 主旋翼：4 片桨叶，沿 +X 伸出后按 90° 复制
  for (let b = 0; b < 4; b++) {
    const blade = new THREE.BoxGeometry(5.4, 0.07, 0.34);
    blade.translate(3.0, HELI_ROTOR_Y, 0);
    blade.rotateY((b * Math.PI) / 2);
    parts.push(tagGeometry(blade, { aPart: 1, color: dark, aGlow: 0 }));
  }
  // 桨毂
  const hub = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
  hub.translate(0, HELI_ROTOR_Y, 0);
  parts.push(tagGeometry(hub, { aPart: 1, color: dark, aGlow: 0 }));

  // 尾桨：3 片桨叶，在 YZ 平面内绕 X 轴旋转
  for (let b = 0; b < 3; b++) {
    const blade = new THREE.BoxGeometry(0.06, 1.5, 0.2);
    blade.translate(0, 0.8, 0);
    blade.rotateX((b * TWO_PI) / 3);
    blade.translate(HELI_TAIL_HUB.x, HELI_TAIL_HUB.y, HELI_TAIL_HUB.z);
    parts.push(tagGeometry(blade, { aPart: 2, color: dark, aGlow: 0 }));
  }

  return mergeParts(parts);
}

/**
 * 构建旋翼半透明旋转盘几何体（主旋翼盘 + 尾桨盘）。
 * @returns {THREE.BufferGeometry} 合并结果
 */
function buildRotorDiscGeometry() {
  const parts = [];
  const main = new THREE.CircleGeometry(5.7, 28);
  main.rotateX(-Math.PI / 2);
  main.translate(0, HELI_ROTOR_Y + 0.04, 0);
  parts.push(tagGeometry(main, {}));

  const tail = new THREE.CircleGeometry(1.2, 16);
  tail.rotateY(Math.PI / 2);
  tail.translate(HELI_TAIL_HUB.x + 0.08, HELI_TAIL_HUB.y, HELI_TAIL_HUB.z);
  parts.push(tagGeometry(tail, {}));

  return mergeParts(parts);
}

/**
 * 构建机腹频闪灯几何体（小八面体，加性混合渲染）。
 * @returns {THREE.BufferGeometry} 几何体
 */
function buildStrobeGeometry() {
  const parts = [];
  const belly = new THREE.OctahedronGeometry(0.45, 0);
  belly.translate(0, -1.72, 0.35);
  parts.push(tagGeometry(belly, {}));
  const top = new THREE.OctahedronGeometry(0.3, 0);
  top.translate(0, 2.55, -6.75);
  parts.push(tagGeometry(top, {}));
  return mergeParts(parts);
}

/* ========================================================================== *
 * 几何构建：船只
 * ========================================================================== */

/**
 * 由俯视轮廓点生成船体（挤出后转到「甲板在 y=0、船体向下」的姿态，船首朝 +Z）。
 *
 * `ExtrudeGeometry` 在 XY 平面内挤出、厚度沿 +Z；`rotateX(+π/2)` 把
 * (x, y, z) 映射为 (x, −z, y)，于是轮廓的 +y 变成世界 +Z（船首），厚度变成向下的吃水。
 *
 * @param {Array<[number, number]>} outline 俯视轮廓（[半宽X, 纵向Y]，逆时针或顺时针均可）
 * @param {number} draft 型深（米）
 * @param {number} deckY 甲板相对水线的高度（米）
 * @returns {THREE.BufferGeometry} 船体几何体
 */
function buildHull(outline, draft, deckY) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: draft,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.35,
    bevelSize: 0.45,
    bevelOffset: 0,
    bevelSegments: 1,
    curveSegments: 4
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, deckY, 0);
  return geo;
}

/**
 * 构建「三种船型合并成一份几何」的船只几何体。
 *
 * 逐顶点 `aType` 标记所属船型（0 拖轮 / 1 渡轮 / 2 驳船）；顶点着色器把
 * `aType` 与逐实例的 `aBoatType` 不符的顶点塌缩到原点（退化三角形不被光栅化），
 * 从而用**一个 drawcall** 渲染三种完全不同的外形。
 *
 * @returns {THREE.BufferGeometry} 合并后的船只几何体
 */
function buildBoatGeometry() {
  const parts = [];

  /**
   * 追加一个零件。
   * @param {THREE.BufferGeometry} g 零件
   * @param {number} type 船型
   * @param {number[]} col RGB
   * @param {number} [glow=0] 夜间发光标记
   * @returns {void}
   */
  const add = (g, type, col, glow = 0) => {
    parts.push(tagGeometry(g, { aType: type, color: col, aGlow: glow }));
  };

  /* ---------------- 0：拖轮（短粗、驾驶楼高、烟囱明显） ---------------- */
  const tugHull = buildHull(
    [[0, 11.2], [2.3, 8.6], [3.5, 3.5], [3.6, -5.5], [3.0, -10.4],
      [-3.0, -10.4], [-3.6, -5.5], [-3.5, 3.5], [-2.3, 8.6]],
    3.4, 1.15
  );
  add(tugHull, 0, [0.18, 0.21, 0.26]);
  const tugStripe = new THREE.BoxGeometry(7.4, 0.5, 20.0);
  tugStripe.translate(0, 1.0, -0.5);
  add(tugStripe, 0, [0.62, 0.14, 0.11]);
  const tugDeckhouse = new THREE.BoxGeometry(4.8, 3.1, 8.2);
  tugDeckhouse.translate(0, 2.75, -1.4);
  add(tugDeckhouse, 0, [0.80, 0.79, 0.74]);
  const tugWheel = new THREE.BoxGeometry(3.6, 2.3, 3.8);
  tugWheel.translate(0, 5.4, 0.6);
  add(tugWheel, 0, [0.86, 0.85, 0.80]);
  for (let s = -1; s <= 1; s += 2) {
    const w = new THREE.BoxGeometry(0.08, 1.2, 3.0);
    w.translate(s * 1.82, 5.6, 0.6);
    add(w, 0, [0.09, 0.12, 0.16], 1);
  }
  const tugFront = new THREE.BoxGeometry(3.0, 1.2, 0.08);
  tugFront.translate(0, 5.6, 2.52);
  add(tugFront, 0, [0.09, 0.12, 0.16], 1);
  const tugFunnel = new THREE.CylinderGeometry(0.95, 1.1, 3.6, 10);
  tugFunnel.translate(0, 6.0, -4.4);
  add(tugFunnel, 0, [0.55, 0.13, 0.10]);
  const tugMast = new THREE.CylinderGeometry(0.11, 0.14, 6.5, 6);
  tugMast.translate(0, 9.5, 0.6);
  add(tugMast, 0, [0.72, 0.70, 0.66]);

  /* ---------------- 1：渡轮（长、双层客舱、橙色船体） ---------------- */
  const ferryHull = buildHull(
    [[0, 24.5], [4.2, 20.0], [5.9, 10.0], [6.0, -18.0], [5.0, -23.5],
      [-5.0, -23.5], [-6.0, -18.0], [-5.9, 10.0], [-4.2, 20.0]],
    4.2, 1.65
  );
  add(ferryHull, 1, [0.78, 0.32, 0.08]);
  const ferryBelt = new THREE.BoxGeometry(12.3, 0.6, 40.0);
  ferryBelt.translate(0, 1.5, -1.5);
  add(ferryBelt, 1, [0.14, 0.15, 0.18]);
  const ferryDeck1 = new THREE.BoxGeometry(11.0, 3.6, 36.0);
  ferryDeck1.translate(0, 3.7, -1.5);
  add(ferryDeck1, 1, [0.82, 0.81, 0.77]);
  const ferryDeck2 = new THREE.BoxGeometry(9.4, 3.0, 26.0);
  ferryDeck2.translate(0, 7.0, -2.5);
  add(ferryDeck2, 1, [0.85, 0.84, 0.80]);
  const ferryBridge = new THREE.BoxGeometry(6.0, 2.4, 6.5);
  ferryBridge.translate(0, 9.7, 5.0);
  add(ferryBridge, 1, [0.87, 0.86, 0.82]);
  // 舷窗带：两层各两侧
  for (let s = -1; s <= 1; s += 2) {
    const w1 = new THREE.BoxGeometry(0.08, 1.5, 32.0);
    w1.translate(s * 5.53, 3.9, -1.5);
    add(w1, 1, [0.09, 0.12, 0.16], 1);
    const w2 = new THREE.BoxGeometry(0.08, 1.3, 22.0);
    w2.translate(s * 4.73, 7.2, -2.5);
    add(w2, 1, [0.09, 0.12, 0.16], 1);
    const w3 = new THREE.BoxGeometry(0.08, 1.1, 5.0);
    w3.translate(s * 3.03, 9.9, 5.0);
    add(w3, 1, [0.09, 0.12, 0.16], 1);
  }
  for (let s = -1; s <= 1; s += 2) {
    const funnel = new THREE.CylinderGeometry(0.85, 0.95, 3.2, 10);
    funnel.translate(s * 2.6, 10.1, -9.0);
    add(funnel, 1, [0.52, 0.20, 0.09]);
  }
  const ferryMast = new THREE.CylinderGeometry(0.1, 0.13, 5.5, 6);
  ferryMast.translate(0, 13.4, 5.0);
  add(ferryMast, 1, [0.80, 0.79, 0.75]);

  /* ---------------- 2：驳船（低平、载集装箱、艉部推船） ---------------- */
  const bargeHull = buildHull(
    [[0, 29.0], [5.5, 26.0], [7.4, 20.0], [7.5, -26.0], [6.5, -29.0],
      [-6.5, -29.0], [-7.5, -26.0], [-7.4, 20.0], [-5.5, 26.0]],
    3.0, 1.05
  );
  add(bargeHull, 2, [0.22, 0.24, 0.25]);
  const bargeDeck = new THREE.BoxGeometry(14.4, 0.35, 54.0);
  bargeDeck.translate(0, 1.15, -0.5);
  add(bargeDeck, 2, [0.30, 0.28, 0.24]);
  const cargoColors = [
    [0.55, 0.16, 0.13], [0.16, 0.34, 0.48], [0.42, 0.44, 0.20],
    [0.50, 0.42, 0.16], [0.20, 0.42, 0.34], [0.44, 0.20, 0.36]
  ];
  let ci = 0;
  for (let row = 0; row < 5; row++) {
    for (let s = -1; s <= 1; s += 2) {
      const stack = row % 2 === 0 ? 2 : 1;
      for (let k = 0; k < stack; k++) {
        const box = new THREE.BoxGeometry(5.8, 2.6, 8.0);
        box.translate(s * 3.2, 2.6 + k * 2.65, 18.0 - row * 9.2);
        add(box, 2, cargoColors[ci % cargoColors.length]);
        ci++;
      }
    }
  }
  const bargeHouse = new THREE.BoxGeometry(6.5, 4.2, 8.0);
  bargeHouse.translate(0, 3.3, -24.0);
  add(bargeHouse, 2, [0.70, 0.69, 0.65]);
  for (let s = -1; s <= 1; s += 2) {
    const w = new THREE.BoxGeometry(0.08, 1.1, 5.0);
    w.translate(s * 3.32, 4.4, -24.0);
    add(w, 2, [0.09, 0.12, 0.16], 1);
  }
  const bargeMast = new THREE.CylinderGeometry(0.1, 0.12, 5.0, 6);
  bargeMast.translate(0, 7.8, -24.0);
  add(bargeMast, 2, [0.72, 0.70, 0.66]);

  return mergeParts(parts);
}

/**
 * 构建 V 形尾迹面片（局部坐标与船一致：+Z 船首，尾迹向 −Z 张开）。
 *
 * 张角取开尔文角 arcsin(1/3) ≈ 19.47°；顶点色的 alpha 通道做长度 / 宽度双向淡出，
 * uv 的 v 分量沿长度铺开，配合材质贴图 `offset.y` 滚动形成「浪花向后跑」的观感。
 *
 * @returns {THREE.BufferGeometry} 尾迹几何体（含 4 分量顶点色）
 */
function buildWakeGeometry() {
  const NL = 10; // 沿长度分段
  const NW = 4;  // 沿宽度分段
  const length = 78;
  const halfW0 = 1.6;
  const halfW1 = 5.2;
  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  let base = 0;

  for (let s = -1; s <= 1; s += 2) {
    const dx = Math.sin(KELVIN_HALF_ANGLE) * s;
    const dz = -Math.cos(KELVIN_HALF_ANGLE);
    // 水平面内垂直于行进方向的单位向量
    const px = -dz * s;
    const pz = dx * s;
    const sx = s * 2.2;
    const sz = -7.0;
    for (let i = 0; i <= NL; i++) {
      const t = i / NL;
      const cx = sx + dx * length * t;
      const cz = sz + dz * length * t;
      const hw = lerp(halfW0, halfW1, t);
      const fadeLen = (1 - t) * (1 - t);
      for (let j = 0; j <= NW; j++) {
        const u = j / NW;
        const off = (u - 0.5) * 2 * hw;
        positions.push(cx + px * off, 0, cz + pz * off);
        normals.push(0, 1, 0);
        uvs.push(u, t * (length / 14));
        const fadeW = Math.sin(u * Math.PI);
        colors.push(1, 1, 1, 0.62 * fadeLen * fadeW);
      }
    }
    for (let i = 0; i < NL; i++) {
      for (let j = 0; j < NW; j++) {
        const a = base + i * (NW + 1) + j;
        const b = a + 1;
        const c = a + (NW + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    base += (NL + 1) * (NW + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geo.setIndex(indices);
  return geo;
}

/**
 * 程序化生成尾迹泡沫贴图（无外部资产，契约 §0）。
 * 用带种子的抖动画出纵向拉丝的白色泡沫条纹，alpha 通道承载图案。
 *
 * @param {import('../core/rng.js').Rng} rng 种子 RNG
 * @returns {THREE.CanvasTexture} 可平铺的泡沫贴图
 */
function buildWakeTexture(rng) {
  const W = 64;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 130; i++) {
    const x = rng.range(0, W);
    const y = rng.range(0, H);
    const w = rng.range(1.2, 5.0);
    const h = rng.range(5, 26);
    const a = rng.range(0.12, 0.55);
    g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
    g.beginPath();
    g.ellipse(x, y, w * 0.5, h * 0.5, 0, 0, TWO_PI);
    g.fill();
    // 纵向平铺无缝：越界的条纹在另一侧补画
    if (y - h * 0.5 < 0) {
      g.beginPath();
      g.ellipse(x, y + H, w * 0.5, h * 0.5, 0, 0, TWO_PI);
      g.fill();
    } else if (y + h * 0.5 > H) {
      g.beginPath();
      g.ellipse(x, y - H, w * 0.5, h * 0.5, 0, 0, TWO_PI);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ========================================================================== *
 * 几何构建：行人
 * ========================================================================== */

/** 髋关节高度（米，摆腿转轴）。 */
const PED_HIP_Y = 0.86;
/** 肩关节高度（米，摆臂转轴）。 */
const PED_SHOULDER_Y = 1.44;

/**
 * 构建简化人形几何体（局部坐标：+Z 面朝方向，脚底约在 y=0，总高约 1.78m）。
 *
 * 逐顶点属性：
 * - `aLimb.x` 摆动系数：0 躯干/头，±1 左右腿，∓0.62 左右臂（同侧手脚反相）
 * - `aLimb.y` 该顶点所属关节的转轴高度（髋或肩）
 * - `aCloth`  是否属于「可换色的衣物」（逐实例 `aTint` 只作用于这些顶点）
 *
 * @returns {THREE.BufferGeometry} 合并后的人形几何体
 */
function buildPedestrianGeometry() {
  const parts = [];
  const skin = [0.76, 0.60, 0.49];
  const cloth = [0.82, 0.82, 0.84];
  const trousers = [0.30, 0.32, 0.38];
  const shoe = [0.11, 0.11, 0.13];

  /**
   * 追加一个零件。
   * @param {THREE.BufferGeometry} g 零件
   * @param {number[]} col RGB
   * @param {number} swing 摆动系数
   * @param {number} pivot 转轴高度
   * @param {number} clothMask 是否可换色
   * @returns {void}
   */
  const add = (g, col, swing, pivot, clothMask) => {
    parts.push(tagGeometry(g, { color: col, aLimb: [swing, pivot], aCloth: clothMask }));
  };

  // 躯干（分段刻意压到最低：全城 240 个实例，每多一段就多 240 份三角形）
  const torso = new THREE.CapsuleGeometry(0.155, 0.44, 2, 6);
  torso.scale(1.18, 1.0, 0.82);
  torso.translate(0, 1.16, 0);
  add(torso, cloth, 0, 0, 1);

  // 髋部
  const hips = new THREE.BoxGeometry(0.34, 0.2, 0.22);
  hips.translate(0, 0.83, 0);
  add(hips, trousers, 0, 0, 1);

  // 脖子 + 头
  const neck = new THREE.CylinderGeometry(0.06, 0.07, 0.12, 5, 1, true);
  neck.translate(0, 1.55, 0);
  add(neck, skin, 0, 0, 0);
  const head = new THREE.IcosahedronGeometry(0.125, 0);
  head.scale(0.92, 1.12, 0.98);
  head.translate(0, 1.68, 0);
  add(head, skin, 0, 0, 0);

  // 双腿（转轴在髋）
  for (let s = -1; s <= 1; s += 2) {
    const leg = new THREE.CapsuleGeometry(0.082, 0.62, 1, 5);
    leg.translate(s * 0.098, PED_HIP_Y - 0.395, 0);
    add(leg, trousers, s, PED_HIP_Y, 1);
    const foot = new THREE.BoxGeometry(0.115, 0.075, 0.27);
    foot.translate(s * 0.098, 0.05, 0.035);
    add(foot, shoe, s, PED_HIP_Y, 0);
  }

  // 双臂（转轴在肩，与同侧腿反相）
  for (let s = -1; s <= 1; s += 2) {
    const arm = new THREE.CapsuleGeometry(0.062, 0.44, 1, 5);
    arm.translate(s * 0.225, PED_SHOULDER_Y - 0.282, 0);
    add(arm, cloth, -s * 0.62, PED_SHOULDER_Y, 1);
    const hand = new THREE.IcosahedronGeometry(0.062, 0);
    hand.translate(s * 0.225, PED_SHOULDER_Y - 0.56, 0);
    add(hand, skin, -s * 0.62, PED_SHOULDER_Y, 0);
  }

  return mergeParts(parts);
}

/* ========================================================================== *
 * 画质档位
 * ========================================================================== */

/**
 * 各画质档下的规模配置。
 * @type {Object<string, {flocks:number[], helis:number, boats:number, peds:number, spotlight:boolean}>}
 */
const QUALITY_TIERS = {
  high: { flocks: [46, 38, 30], helis: 2, boats: 4, peds: 240, spotlight: true },
  medium: { flocks: [40, 32], helis: 1, boats: 3, peds: 180, spotlight: false },
  low: { flocks: [30, 25], helis: 1, boats: 2, peds: 120, spotlight: false }
};

/* ========================================================================== *
 * 工厂函数
 * ========================================================================== */

/**
 * 创建非车辆动画体系统（契约 §6.2）。
 *
 * @param {Object} ctx0 构建期上下文 BuildContext（契约 §5）
 * @param {Object} ctx0.plan CityPlan（读取大道 X / 街道 Z / 路口表）
 * @param {Object} [ctx0.heightField] 天际线高度场（鸟群避让楼顶用）
 * @param {import('../core/rng.js').Rng} ctx0.rng 根 RNG（本模块 fork 出自己的子流）
 * @param {Object} [ctx0.env] 共享环境 uniforms（uNight / uFlash 按引用复用）
 * @param {'high'|'medium'|'low'} [ctx0.quality='high'] 画质档
 * @returns {Object} SystemHandle（契约 §1）
 */
export function createAgents(ctx0) {
  const plan = ctx0 && ctx0.plan ? ctx0.plan : null;
  const heightField = ctx0 && ctx0.heightField ? ctx0.heightField : null;
  const quality = QUALITY_TIERS[ctx0 && ctx0.quality] ? ctx0.quality : 'high';
  const tier = QUALITY_TIERS[quality];
  const rootRng = ctx0 && ctx0.rng && typeof ctx0.rng.fork === 'function'
    ? ctx0.rng.fork('agents')
    : null;

  /**
   * 取一个子流；根 RNG 缺失时退化为固定种子流，保证仍然可复现。
   * @param {string} name 子流名
   * @returns {import('../core/rng.js').Rng} 子流
   */
  const forkRng = (name) => (rootRng ? rootRng.fork(name) : makeFallbackRng(name));

  // 夜间程度 / 闪电补光：优先复用共享 uniform 对象（按引用），缺失时自建
  const env = ctx0 && ctx0.env ? ctx0.env : null;
  const uNight = env && env.uNight ? env.uNight : { value: 0 };
  const uFlash = env && env.uFlash ? env.uFlash : { value: 0 };

  const group = new THREE.Group();
  group.name = 'agents';

  /** 本模块自建、需要在 dispose 里释放的资源 */
  const ownedGeometries = [];
  const ownedMaterials = [];
  const ownedTextures = [];

  /** 全局仿真时间（秒），只在 update 里累加 */
  let simTime = 0;
  /** 渲染标志是否已修正（main.js 的 mount 会统一打开 castShadow，这里按需回退） */
  let renderFlagsApplied = false;

  /* ====================================================================== *
   * 一、鸟群（Boids）
   * ====================================================================== */

  const BIRD_MAX_SPEED = 21;
  const BIRD_MIN_SPEED = 9;
  const BIRD_MAX_FORCE = 13;
  const BIRD_SEP_R2 = 22 * 22;
  const BIRD_ALI_R2 = 50 * 50;
  const BIRD_COH_R2 = 74 * 74;
  const BIRD_SCALE = 2.4;

  const birdRng = forkRng('birds');
  const birdGeometry = buildBirdGeometry();
  ownedGeometries.push(birdGeometry);

  const birdMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b2b33,
    roughness: 0.88,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  ownedMaterials.push(birdMaterial);
  injectAgentShader(birdMaterial, 'agents-bird-flap', {
    uniforms: { uFlash },
    vertexPars: [
      'attribute float aWing;',
      'attribute float aFlap;',
      '// 翅膀绕体轴（局部 Z）反相扇动：θ = A·sin(ϕ)·aWing，左右翅同上同下',
      'vec3 agentFlap( vec3 p ) {',
      '\tif ( abs( aWing ) < 0.5 ) return p;',
      '\tfloat ang = sin( aFlap ) * 1.02 * aWing;',
      '\tfloat c = cos( ang );',
      '\tfloat s = sin( ang );',
      '\treturn vec3( p.x * c - p.y * s, p.x * s + p.y * c, p.z );',
      '}'
    ].join('\n'),
    normalBody: '\tobjectNormal = agentFlap( objectNormal );',
    vertexBody: '\ttransformed = agentFlap( transformed );',
    fragmentPars: 'uniform float uFlash;',
    emissiveBody: '\ttotalEmissiveRadiance += clamp( uFlash, 0.0, 1.0 ) * 0.35 * vec3( 0.8, 0.85, 1.0 );'
  });

  const flockHomes = [
    { x: 40, z: -620 },
    { x: 140, z: 1560 },
    { x: -430, z: 420 }
  ];
  const flocks = [];
  const birds = [];
  for (let f = 0; f < tier.flocks.length; f++) {
    const home = flockHomes[f % flockHomes.length];
    const n = tier.flocks[f];
    const flock = {
      homeX: home.x,
      homeZ: home.z,
      halfX: 520,
      halfZ: 700,
      members: []
    };
    for (let i = 0; i < n; i++) {
      const bird = {
        pos: new THREE.Vector3(
          home.x + birdRng.gauss(0, 90),
          birdRng.range(180, 340),
          home.z + birdRng.gauss(0, 110)
        ),
        vel: new THREE.Vector3(
          birdRng.range(-1, 1),
          birdRng.range(-0.15, 0.15),
          birdRng.range(-1, 1)
        ),
        accX: 0,
        accY: 0,
        accZ: 0,
        roll: 0,
        flap: birdRng.range(0, TWO_PI),
        indexInFlock: i
      };
      bird.vel.normalize().multiplyScalar(birdRng.range(BIRD_MIN_SPEED + 2, BIRD_MAX_SPEED - 3));
      flock.members.push(bird);
      birds.push(bird);
    }
    flocks.push(flock);
  }

  const birdMesh = new THREE.InstancedMesh(birdGeometry, birdMaterial, birds.length);
  birdMesh.name = 'agents-birds';
  birdMesh.frustumCulled = false;
  birdMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const birdFlapAttr = new THREE.InstancedBufferAttribute(new Float32Array(birds.length), 1);
  birdFlapAttr.setUsage(THREE.DynamicDrawUsage);
  birdGeometry.setAttribute('aFlap', birdFlapAttr);
  group.add(birdMesh);

  /**
   * 推进鸟群一帧：Reynolds Boids 三规则 + 边界回引 + 高度偏好 + 楼顶避让。
   *
   * @param {number} dt 帧时长（秒）
   * @param {number} precip 降水强度 0..1（雨雪天数量减半、飞行高度下压）
   * @returns {void}
   */
  function updateBirds(dt, precip) {
    const shrink = smoothstep(0.1, 0.6, precip);
    const activeRatio = lerp(1, 0.5, shrink);
    const bandLow = lerp(150, 90, shrink);
    const bandHigh = lerp(400, 240, shrink);
    const bandMid = (bandLow + bandHigh) * 0.5;

    let written = 0;
    for (let f = 0; f < flocks.length; f++) {
      const flock = flocks[f];
      const members = flock.members;
      const n = members.length;
      const activeN = Math.max(6, Math.round(n * activeRatio));

      for (let i = 0; i < n; i++) {
        const b = members[i];
        if (b.indexInFlock >= activeN) continue;

        let sepX = 0, sepY = 0, sepZ = 0;
        let aliX = 0, aliY = 0, aliZ = 0, aliN = 0;
        let cohX = 0, cohY = 0, cohZ = 0, cohN = 0;

        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const o = members[j];
          if (o.indexInFlock >= activeN) continue;
          const dx = b.pos.x - o.pos.x;
          const dy = b.pos.y - o.pos.y;
          const dz = b.pos.z - o.pos.z;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > BIRD_COH_R2 || d2 < 1e-6) continue;
          if (d2 < BIRD_SEP_R2) {
            // 分离：斥力 ∝ 1/d²
            const inv = 1 / d2;
            sepX += dx * inv;
            sepY += dy * inv;
            sepZ += dz * inv;
          }
          if (d2 < BIRD_ALI_R2) {
            aliX += o.vel.x;
            aliY += o.vel.y;
            aliZ += o.vel.z;
            aliN++;
          }
          cohX += o.pos.x;
          cohY += o.pos.y;
          cohZ += o.pos.z;
          cohN++;
        }

        let ax = sepX * 620;
        let ay = sepY * 620;
        let az = sepZ * 620;

        if (aliN > 0) {
          ax += (aliX / aliN - b.vel.x) * 1.5;
          ay += (aliY / aliN - b.vel.y) * 1.5;
          az += (aliZ / aliN - b.vel.z) * 1.5;
        }
        if (cohN > 0) {
          ax += (cohX / cohN - b.pos.x) * 0.34;
          ay += (cohY / cohN - b.pos.y) * 0.34;
          az += (cohZ / cohN - b.pos.z) * 0.34;
        }

        // 边界回引：越界越远拉力越强
        const ox = b.pos.x - flock.homeX;
        const oz = b.pos.z - flock.homeZ;
        if (ox > flock.halfX) ax -= (ox - flock.halfX) * 0.09;
        else if (ox < -flock.halfX) ax -= (ox + flock.halfX) * 0.09;
        if (oz > flock.halfZ) az -= (oz - flock.halfZ) * 0.09;
        else if (oz < -flock.halfZ) az -= (oz + flock.halfZ) * 0.09;

        // 高度偏好：回到偏好带中线；楼顶之上至少留 45m 余量（不穿楼）
        const ground = heightField ? heightField.heightAt(b.pos.x, b.pos.z) : 0;
        const floorY = Math.max(bandLow, ground + 45);
        const ceilY = Math.max(floorY + 40, bandHigh);
        if (b.pos.y < floorY) ay += (floorY - b.pos.y) * 0.55 + 3.0;
        else if (b.pos.y > ceilY) ay += (ceilY - b.pos.y) * 0.55;
        else ay += (bandMid - b.pos.y) * 0.035;

        // 转向力限幅
        const aLen = Math.sqrt(ax * ax + ay * ay + az * az);
        if (aLen > BIRD_MAX_FORCE) {
          const k = BIRD_MAX_FORCE / aLen;
          ax *= k;
          ay *= k;
          az *= k;
        }
        b.accX = ax;
        b.accY = ay;
        b.accZ = az;

        b.vel.x += ax * dt;
        b.vel.y += ay * dt;
        b.vel.z += az * dt;

        // 速度限制
        const sp = b.vel.length();
        if (sp > BIRD_MAX_SPEED) b.vel.multiplyScalar(BIRD_MAX_SPEED / sp);
        else if (sp < BIRD_MIN_SPEED && sp > 1e-4) b.vel.multiplyScalar(BIRD_MIN_SPEED / sp);

        b.pos.addScaledVector(b.vel, dt);

        // 硬性下限：转向力只是「引导」，高速俯冲时仍可能短暂穿进楼里，
        // 这里再压一道兜底，保证任何一帧都不会低于楼顶 30m。
        const hardFloor = ground + 30;
        if (b.pos.y < hardFloor) {
          b.pos.y = hardFloor;
          if (b.vel.y < 0) b.vel.y = 0;
        }

        const speed = b.vel.length();
        // 扇翅频率随速度提高（慢飞滑翔、快飞急扇）
        b.flap += (1.35 + speed * 0.115) * TWO_PI * dt;
        if (b.flap > 1e6) b.flap = mod(b.flap, TWO_PI);

        // 侧向加速度 → 转弯侧倾（内侧翅膀下沉）
        _fwd.copy(b.vel).normalize();
        _right.copy(WORLD_UP).cross(_fwd);
        if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
        else _right.normalize();
        const lat = _right.x * b.accX + _right.y * b.accY + _right.z * b.accZ;
        b.roll = damp(b.roll, clamp(-lat * 0.075, -0.85, 0.85), 6, dt);

        composeOriented(_mat, b.vel, b.roll, b.pos, BIRD_SCALE);
        birdMesh.setMatrixAt(written, _mat);
        birdFlapAttr.array[written] = b.flap;
        written++;
      }
    }

    birdMesh.count = written;
    birdMesh.instanceMatrix.needsUpdate = true;
    birdFlapAttr.needsUpdate = true;
  }

  /* ====================================================================== *
   * 二、直升机
   * ====================================================================== */

  const heliRng = forkRng('helicopters');

  // 巡航样条：绕曼哈顿一圈，途中带明显的高度起伏（250~330m），全程避开楼群与地标
  const heliCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1150, 250, -1900),
    new THREE.Vector3(-300, 300, -2200),
    new THREE.Vector3(600, 330, -1900),
    new THREE.Vector3(1080, 260, -900),
    new THREE.Vector3(1150, 230, 400),
    new THREE.Vector3(1080, 250, 1500),
    new THREE.Vector3(620, 290, 2280),
    new THREE.Vector3(-450, 320, 2320),
    new THREE.Vector3(-1150, 280, 1500),
    new THREE.Vector3(-1300, 240, 200),
    new THREE.Vector3(-1250, 260, -900)
  ], true, 'catmullrom', 0.35);
  heliCurve.arcLengthDivisions = 400;
  const heliCurveLength = heliCurve.getLength();

  const heliGeometry = buildHelicopterGeometry();
  const heliDiscGeometry = buildRotorDiscGeometry();
  const heliStrobeGeometry = buildStrobeGeometry();
  ownedGeometries.push(heliGeometry, heliDiscGeometry, heliStrobeGeometry);

  const heliTailHubUniform = { value: HELI_TAIL_HUB.clone() };
  const heliMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.35
  });
  ownedMaterials.push(heliMaterial);
  injectAgentShader(heliMaterial, 'agents-heli-rotor', {
    uniforms: { uTailHub: heliTailHubUniform, uNight, uFlash },
    vertexPars: [
      'attribute float aPart;',
      'attribute vec2 aRotor;',
      'attribute float aGlow;',
      'uniform vec3 uTailHub;',
      'varying float vAgentGlow;',
      '// aPart: 0 静止 / 1 主旋翼（绕 Y） / 2 尾桨（绕过 uTailHub 的 X 轴）',
      'vec3 agentRotor( vec3 p, vec3 pivot ) {',
      '\tif ( aPart > 1.5 ) {',
      '\t\tfloat a = aRotor.y;',
      '\t\tfloat c = cos( a );',
      '\t\tfloat s = sin( a );',
      '\t\tvec3 q = p - pivot;',
      '\t\treturn vec3( q.x, q.y * c - q.z * s, q.y * s + q.z * c ) + pivot;',
      '\t}',
      '\tif ( aPart > 0.5 ) {',
      '\t\tfloat a = aRotor.x;',
      '\t\tfloat c = cos( a );',
      '\t\tfloat s = sin( a );',
      '\t\treturn vec3( p.x * c + p.z * s, p.y, - p.x * s + p.z * c );',
      '\t}',
      '\treturn p;',
      '}'
    ].join('\n'),
    normalBody: '\tobjectNormal = agentRotor( objectNormal, vec3( 0.0 ) );',
    vertexBody: [
      '\ttransformed = agentRotor( transformed, uTailHub );',
      '\tvAgentGlow = aGlow;'
    ].join('\n'),
    fragmentPars: [
      'uniform float uNight;',
      'uniform float uFlash;',
      'varying float vAgentGlow;'
    ].join('\n'),
    emissiveBody: [
      '\ttotalEmissiveRadiance += vAgentGlow * clamp( uNight, 0.0, 1.0 ) * vec3( 1.0, 0.86, 0.60 ) * 1.6;',
      '\ttotalEmissiveRadiance += clamp( uFlash, 0.0, 1.0 ) * 0.4 * vec3( 0.8, 0.85, 1.0 );'
    ].join('\n')
  });

  const heliDiscMaterial = new THREE.MeshBasicMaterial({
    color: 0xc3ccd6,
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true
  });
  ownedMaterials.push(heliDiscMaterial);

  const heliStrobeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false
  });
  ownedMaterials.push(heliStrobeMaterial);

  const heliCount = tier.helis;
  const heliMesh = new THREE.InstancedMesh(heliGeometry, heliMaterial, heliCount);
  heliMesh.name = 'agents-helicopters';
  heliMesh.frustumCulled = false;
  heliMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const heliRotorAttr = new THREE.InstancedBufferAttribute(new Float32Array(heliCount * 2), 2);
  heliRotorAttr.setUsage(THREE.DynamicDrawUsage);
  heliGeometry.setAttribute('aRotor', heliRotorAttr);
  group.add(heliMesh);

  const heliDiscMesh = new THREE.InstancedMesh(heliDiscGeometry, heliDiscMaterial, heliCount);
  heliDiscMesh.name = 'agents-rotor-discs';
  heliDiscMesh.frustumCulled = false;
  heliDiscMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heliDiscMesh.renderOrder = 2;
  group.add(heliDiscMesh);

  const heliStrobeMesh = new THREE.InstancedMesh(heliStrobeGeometry, heliStrobeMaterial, heliCount);
  heliStrobeMesh.name = 'agents-strobes';
  heliStrobeMesh.frustumCulled = false;
  heliStrobeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  heliStrobeMesh.renderOrder = 3;
  group.add(heliStrobeMesh);

  const helicopters = [];
  for (let i = 0; i < heliCount; i++) {
    const spot = tier.spotlight
      ? new THREE.SpotLight(0xfff0cf, 0, 1200, 0.115, 0.55, 1.4)
      : null;
    if (spot) {
      spot.castShadow = false;
      spot.target.position.set(0, 0, 0);
      group.add(spot);
      group.add(spot.target);
    }
    helicopters.push({
      u: i / heliCount + heliRng.range(0, 0.05),
      speed: heliRng.range(46, 58),
      yaw: 0,
      roll: 0,
      rotorMain: heliRng.range(0, TWO_PI),
      rotorTail: heliRng.range(0, TWO_PI),
      strobePhase: heliRng.range(0, 1),
      sweepPhase: heliRng.range(0, TWO_PI),
      spot,
      initialised: false
    });
  }

  // 预建 instanceColor，避免首帧因属性突然出现而触发着色器重编译
  _color.setRGB(0, 0, 0);
  for (let i = 0; i < heliCount; i++) heliStrobeMesh.setColorAt(i, _color);

  /** 计算样条切线用的采样间隔（归一化弧长） */
  const HELI_TANGENT_EPS = 0.0015;

  /**
   * 推进直升机一帧：沿样条巡航、按偏航角速度做协调转弯倾斜、旋翼高速旋转、
   * 夜间机腹频闪（0.8Hz）与探照灯地面扫动。
   *
   * @param {number} dt 帧时长（秒）
   * @param {number} night 夜晚程度 0..1
   * @returns {void}
   */
  function updateHelicopters(dt, night) {
    for (let i = 0; i < helicopters.length; i++) {
      const h = helicopters[i];
      h.u = mod(h.u + (h.speed * dt) / heliCurveLength, 1);

      heliCurve.getPointAt(h.u, _pos);
      heliCurve.getPointAt(mod(h.u + HELI_TANGENT_EPS, 1), _vA);
      heliCurve.getPointAt(mod(h.u - HELI_TANGENT_EPS + 1, 1), _vB);
      _vC.copy(_vA).sub(_vB);
      if (_vC.lengthSq() < 1e-8) _vC.set(0, 0, 1);
      _vC.normalize();

      // 偏航角与角速度 → 协调转弯滚转角 φ = −k·(dψ/dt)
      const yaw = Math.atan2(_vC.x, _vC.z);
      let dYaw = 0;
      if (h.initialised && dt > 1e-5) {
        dYaw = yaw - h.yaw;
        if (dYaw > Math.PI) dYaw -= TWO_PI;
        else if (dYaw < -Math.PI) dYaw += TWO_PI;
        dYaw /= dt;
      } else {
        h.initialised = true;
      }
      h.yaw = yaw;
      h.roll = damp(h.roll, clamp(-dYaw * 1.9, -0.62, 0.62), 3.5, dt);

      composeOriented(_mat, _vC, h.roll, _pos, 1);
      heliMesh.setMatrixAt(i, _mat);
      heliDiscMesh.setMatrixAt(i, _mat);
      heliStrobeMesh.setMatrixAt(i, _mat);

      // 旋翼相位（主旋翼 ≈ 250rpm 观感、尾桨约 2.4 倍转速）
      h.rotorMain = mod(h.rotorMain + 26 * dt, TWO_PI);
      h.rotorTail = mod(h.rotorTail + 62 * dt, TWO_PI);
      heliRotorAttr.array[i * 2] = h.rotorMain;
      heliRotorAttr.array[i * 2 + 1] = h.rotorTail;

      // 机腹频闪红灯：0.8Hz，占空比约 11%
      const blink = mod(simTime * 0.8 + h.strobePhase, 1) < 0.11 ? 1 : 0;
      const strobe = blink * night;
      _color.setRGB(strobe * 1.0, strobe * 0.06, strobe * 0.04);
      heliStrobeMesh.setColorAt(i, _color);

      // 探照灯：照向地面并缓慢扫动（仅 high 画质）
      if (h.spot) {
        h.spot.position.copy(_pos);
        h.spot.position.y -= 1.6;
        const sweep = simTime * 0.32 + h.sweepPhase;
        const radius = _pos.y * 0.5;
        h.spot.target.position.set(
          _pos.x + Math.sin(sweep) * radius,
          0,
          _pos.z + Math.cos(sweep) * radius * 0.7
        );
        // 注意：不切换 spot.visible —— 增删可见灯光会改变灯光数量并触发全场景着色器重编译，
        // 白天用 intensity = 0 关灯即可。
        h.spot.intensity = night * 3.2e5;
      }
    }

    heliMesh.instanceMatrix.needsUpdate = true;
    heliDiscMesh.instanceMatrix.needsUpdate = true;
    heliStrobeMesh.instanceMatrix.needsUpdate = true;
    heliRotorAttr.needsUpdate = true;
    if (heliStrobeMesh.instanceColor) heliStrobeMesh.instanceColor.needsUpdate = true;
  }

  /* ====================================================================== *
   * 三、船只
   * ====================================================================== */

  const boatRng = forkRng('boats');

  /**
   * 河道航线（闭合航路：沿一侧下行、掉头后沿另一侧上行，即「往返」）。
   * 全部航点的 |x| > 800，落在契约 §4.1 定义的水域内。
   * @type {Array<Array<[number, number]>>}
   */
  const RIVER_Z_N = CITY_DIM.minZ + 150;
  const RIVER_Z_S = CITY_DIM.maxZ - 250;
  const BOAT_ROUTES = [
    // 哈德逊河（西岸外侧）：南下走近岸航道，掉头后北上走外侧航道
    [
      [CITY_DIM.hudsonX - 80, RIVER_Z_N], [CITY_DIM.hudsonX - 80, RIVER_Z_S],
      [CITY_DIM.hudsonX - 210, RIVER_Z_S], [CITY_DIM.hudsonX - 210, RIVER_Z_N]
    ],
    // 东河（东岸外侧）：途中从悬索桥下穿过（桥面 40m，船桅 < 20m）
    [
      [CITY_DIM.eastX + 100, RIVER_Z_N], [CITY_DIM.eastX + 100, RIVER_Z_S],
      [CITY_DIM.eastX + 230, RIVER_Z_S], [CITY_DIM.eastX + 230, RIVER_Z_N]
    ]
  ];
  /** 各船型的巡航速度（m/s）：拖轮 / 渡轮 / 驳船 */
  const BOAT_SPEEDS = [7.2, 9.4, 5.4];
  /** 各船型尾迹的宽度缩放 */
  const BOAT_WAKE_SCALE = [0.85, 1.15, 1.35];

  const boatGeometry = buildBoatGeometry();
  const wakeGeometry = buildWakeGeometry();
  ownedGeometries.push(boatGeometry, wakeGeometry);

  const boatMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.12
  });
  ownedMaterials.push(boatMaterial);
  injectAgentShader(boatMaterial, 'agents-boat-typemask', {
    uniforms: { uNight, uFlash },
    vertexPars: [
      'attribute float aType;',
      'attribute float aGlow;',
      'attribute float aBoatType;',
      'varying float vAgentGlow;'
    ].join('\n'),
    vertexBody: [
      '\tvAgentGlow = aGlow;',
      '\t// 三种船型共用一份几何：把不属于本实例船型的顶点塌缩成退化三角形（不被光栅化）',
      '\tif ( abs( aType - aBoatType ) > 0.5 ) transformed = vec3( 0.0 );'
    ].join('\n'),
    fragmentPars: [
      'uniform float uNight;',
      'uniform float uFlash;',
      'varying float vAgentGlow;'
    ].join('\n'),
    emissiveBody: [
      '\ttotalEmissiveRadiance += vAgentGlow * clamp( uNight, 0.0, 1.0 ) * vec3( 1.0, 0.84, 0.55 ) * 2.1;',
      '\ttotalEmissiveRadiance += clamp( uFlash, 0.0, 1.0 ) * 0.45 * vec3( 0.8, 0.85, 1.0 );'
    ].join('\n')
  });

  const wakeTexture = buildWakeTexture(forkRng('wake-texture'));
  ownedTextures.push(wakeTexture);
  const wakeMaterial = new THREE.MeshBasicMaterial({
    map: wakeTexture,
    color: 0xdfeaf2,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    vertexColors: true,
    side: THREE.DoubleSide
  });
  ownedMaterials.push(wakeMaterial);

  const boatCount = tier.boats;
  const boatMesh = new THREE.InstancedMesh(boatGeometry, boatMaterial, boatCount);
  boatMesh.name = 'agents-boats';
  boatMesh.frustumCulled = false;
  boatMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const boatTypeAttr = new THREE.InstancedBufferAttribute(new Float32Array(boatCount), 1);
  boatGeometry.setAttribute('aBoatType', boatTypeAttr);
  group.add(boatMesh);

  const wakeMesh = new THREE.InstancedMesh(wakeGeometry, wakeMaterial, boatCount);
  wakeMesh.name = 'agents-wakes';
  wakeMesh.frustumCulled = false;
  wakeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wakeMesh.renderOrder = 1;
  group.add(wakeMesh);

  const boats = [];
  for (let i = 0; i < boatCount; i++) {
    const route = BOAT_ROUTES[i % BOAT_ROUTES.length];
    const type = i % 3;
    // 同一航线上的船错开出发点，避免叠在一起
    const wpIdx = (Math.floor(i / BOAT_ROUTES.length) * 2) % route.length;
    const from = route[wpIdx];
    const to = route[(wpIdx + 1) % route.length];
    const t = boatRng.range(0.1, 0.85);
    const x = lerp(from[0], to[0], t);
    const z = lerp(from[1], to[1], t);
    boats.push({
      route,
      wpIdx: (wpIdx + 1) % route.length,
      type,
      x,
      z,
      heading: Math.atan2(to[0] - from[0], to[1] - from[1]),
      speed: BOAT_SPEEDS[type],
      cruise: BOAT_SPEEDS[type],
      bobPhase: boatRng.range(0, TWO_PI),
      rollPhase: boatRng.range(0, TWO_PI)
    });
    boatTypeAttr.array[i] = type;
  }
  boatTypeAttr.needsUpdate = true;

  const hornRng = forkRng('horn');
  /** 距离上次鸣笛的秒数（全局节流，契约 §6.2 要求 ≥ 40s） */
  let hornTimer = HORN_MIN_INTERVAL * 0.6;

  /**
   * 推进船只一帧：沿航线航行、到端点掉头、随水面起伏与横摇、拖出 V 形尾迹，
   * 并按节流条件鸣笛。
   *
   * @param {Object} ctx FrameContext
   * @param {number} dt 帧时长（秒）
   * @returns {void}
   */
  function updateBoats(ctx, dt) {
    hornTimer += dt;
    let hornCandidate = -1;
    const camera = ctx.camera;

    for (let i = 0; i < boats.length; i++) {
      const b = boats[i];
      let wp = b.route[b.wpIdx];
      let dx = wp[0] - b.x;
      let dz = wp[1] - b.z;
      // 到达航点半径内即切换到下一个航点（航线闭合，因此表现为「到端点掉头往返」）
      if (dx * dx + dz * dz < 26 * 26) {
        b.wpIdx = (b.wpIdx + 1) % b.route.length;
        wp = b.route[b.wpIdx];
        dx = wp[0] - b.x;
        dz = wp[1] - b.z;
      }

      // 转向：朝当前航点缓慢转舵；转向越急速度越低（掉头时明显减速）
      const targetHeading = Math.atan2(dx, dz);
      const prevHeading = b.heading;
      b.heading = dampAngleRad(b.heading, targetHeading, 0.55, dt);
      let turn = mod(b.heading - prevHeading + Math.PI, TWO_PI) - Math.PI;
      if (dt > 1e-5) turn /= dt;
      const turnSlow = clamp(1 - Math.abs(turn) * 2.6, 0.35, 1);
      b.speed = damp(b.speed, b.cruise * turnSlow, 0.8, dt);

      b.x += Math.sin(b.heading) * b.speed * dt;
      b.z += Math.cos(b.heading) * b.speed * dt;

      // 水面起伏：垂荡（sin 上下）+ 横摇 roll + 轻微纵摇
      const heave = Math.sin(simTime * 0.9 + b.bobPhase) * 0.32
        + Math.sin(simTime * 1.7 + b.rollPhase) * 0.14;
      const roll = Math.sin(simTime * 0.62 + b.rollPhase) * 0.045
        + Math.sin(simTime * 1.11 + b.bobPhase) * 0.018;
      const pitch = Math.sin(simTime * 0.75 + b.bobPhase * 1.4) * 0.016;

      _pos.set(b.x, WATER_Y + heave, b.z);
      _euler.set(pitch, b.heading, roll, 'YXZ');
      _quat.setFromEuler(_euler);
      _mat.compose(_pos, _quat, _scaleOne);
      boatMesh.setMatrixAt(i, _mat);

      // 尾迹贴着水面，不跟随横摇；长度/宽度随速度伸缩
      const speedRatio = clamp(b.speed / Math.max(b.cruise, 0.001), 0, 1);
      _pos.set(b.x, WATER_Y + 0.12, b.z);
      _euler.set(0, b.heading, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _vD.set(
        BOAT_WAKE_SCALE[b.type] * (0.6 + 0.4 * speedRatio),
        1,
        BOAT_WAKE_SCALE[b.type] * (0.35 + 0.65 * speedRatio)
      );
      _mat.compose(_pos, _quat, _vD);
      wakeMesh.setMatrixAt(i, _mat);

      // 鸣笛候选：相机 1500m 以内
      if (camera && hornCandidate < 0) {
        const cdx = camera.position.x - b.x;
        const cdy = camera.position.y - WATER_Y;
        const cdz = camera.position.z - b.z;
        if (cdx * cdx + cdy * cdy + cdz * cdz < HORN_MAX_DISTANCE_SQ) hornCandidate = i;
      }
    }

    boatMesh.instanceMatrix.needsUpdate = true;
    wakeMesh.instanceMatrix.needsUpdate = true;

    // 尾迹泡沫向船尾滚动（滚动 uv）
    wakeTexture.offset.y = mod(wakeTexture.offset.y - dt * 0.55, 1);

    if (hornCandidate >= 0 && hornTimer >= HORN_MIN_INTERVAL) {
      // 满足节流后每秒约 12% 概率鸣笛，避免整点齐鸣
      if (hornRng.next() < 0.12 * Math.min(dt * 60, 3)) {
        hornTimer = 0;
        const audio = ctx.audio;
        if (audio && typeof audio.boatHorn === 'function') audio.boatHorn();
      }
    }
  }

  /* ====================================================================== *
   * 四、行人
   * ====================================================================== */

  const pedRng = forkRng('pedestrians');

  const avenueXs = plan && Array.isArray(plan.avenueXs) && plan.avenueXs.length
    ? plan.avenueXs
    : [-700, -420, -140, 140, 420, 700];
  let streetZs = plan && Array.isArray(plan.streetZs) && plan.streetZs.length
    ? plan.streetZs
    : null;
  if (!streetZs) {
    streetZs = [];
    for (let z = CITY_DIM.minZ; z <= CITY_DIM.maxZ; z += CITY_DIM.streetSpacing || 80) {
      if (z > CITY_DIM.park.minZ && z < CITY_DIM.park.maxZ) continue;
      streetZs.push(z);
    }
  }

  /** 人行道中心线相对路面中心线的偏移：半路宽 + 半人行道宽 */
  const AVENUE_WALK_OFFSET = CITY_DIM.avenueRoadWidth * 0.5 + CITY_DIM.sidewalkWidth * 0.5;
  const STREET_WALK_OFFSET = CITY_DIM.streetRoadWidth * 0.5 + CITY_DIM.sidewalkWidth * 0.5;
  /** 沿大道走的行人在路口前的停止线距离（半横街宽 + 半人行道宽） */
  const AVENUE_STOP_GAP = CITY_DIM.streetRoadWidth * 0.5 + CITY_DIM.sidewalkWidth * 0.5;
  /** 沿横街走的行人在路口前的停止线距离 */
  const STREET_STOP_GAP = CITY_DIM.avenueRoadWidth * 0.5 + CITY_DIM.sidewalkWidth * 0.5;

  /**
   * 人行道车道表。`axis`: 0 = 沿 Z 走（大道两侧人行道），1 = 沿 X 走（横街两侧人行道）。
   * `crossings` 升序排列，`offsets` 为对应路口的信号相位偏移。
   * @type {Array<Object>}
   */
  const pedLanes = [];

  for (let a = 0; a < avenueXs.length; a++) {
    const avX = avenueXs[a];
    for (let s = -1; s <= 1; s += 2) {
      const laneX = avX + s * AVENUE_WALK_OFFSET;
      // 公园内的大道没有常规人行道铺装（地形另行雕刻），按 Z 分段跳过
      const insidePark = laneX >= CITY_DIM.park.minX - 4 && laneX <= CITY_DIM.park.maxX + 4;
      const spans = insidePark
        ? [[CITY_DIM.minZ + 30, CITY_DIM.park.minZ - 14], [CITY_DIM.park.maxZ + 14, CITY_DIM.maxZ - 30]]
        : [[CITY_DIM.minZ + 30, CITY_DIM.maxZ - 30]];
      for (let k = 0; k < spans.length; k++) {
        const [lo, hi] = spans[k];
        if (hi - lo < 200) continue;
        const crossings = [];
        const offsets = [];
        for (let i = 0; i < streetZs.length; i++) {
          const z = streetZs[i];
          if (z <= lo || z >= hi) continue;
          crossings.push(z);
          offsets.push(crossingOffset(avX, z));
        }
        if (crossings.length === 0) continue;
        pedLanes.push({ axis: 0, fixed: laneX, min: lo, max: hi, crossings, offsets, stopGap: AVENUE_STOP_GAP });
      }
    }
  }

  for (let i = 0; i < streetZs.length; i++) {
    const stZ = streetZs[i];
    if (stZ > CITY_DIM.park.minZ && stZ < CITY_DIM.park.maxZ) continue;
    for (let s = -1; s <= 1; s += 2) {
      const laneZ = stZ + s * STREET_WALK_OFFSET;
      // 紧贴公园南北边界的街道，其靠公园一侧的人行道会伸进公园范围，按 X 分段避开
      const insidePark = laneZ > CITY_DIM.park.minZ && laneZ < CITY_DIM.park.maxZ;
      const spans = insidePark
        ? [[CITY_DIM.minX + 22, CITY_DIM.park.minX - 4], [CITY_DIM.park.maxX + 4, CITY_DIM.maxX - 22]]
        : [[CITY_DIM.minX + 22, CITY_DIM.maxX - 22]];
      for (let k = 0; k < spans.length; k++) {
        const [lo, hi] = spans[k];
        if (hi - lo < 120) continue;
        const crossings = [];
        const offsets = [];
        for (let a = 0; a < avenueXs.length; a++) {
          const x = avenueXs[a];
          if (x <= lo || x >= hi) continue;
          crossings.push(x);
          offsets.push(crossingOffset(x, stZ));
        }
        if (crossings.length === 0) continue;
        pedLanes.push({ axis: 1, fixed: laneZ, min: lo, max: hi, crossings, offsets, stopGap: STREET_STOP_GAP });
      }
    }
  }

  /**
   * 重算某行人在其车道上「前方最近的路口」。
   * 车道 crossings 已升序，绕行到端点时回卷到另一端。
   * @param {Object} p 行人
   * @returns {void}
   */
  function refreshNextCrossing(p) {
    const lane = p.lane;
    const list = lane.crossings;
    const n = list.length;
    if (p.dir > 0) {
      for (let i = 0; i < n; i++) {
        if (list[i] > p.t) {
          p.crossCoord = list[i];
          p.crossOffset = lane.offsets[i];
          return;
        }
      }
      p.crossCoord = list[0];
      p.crossOffset = lane.offsets[0];
    } else {
      for (let i = n - 1; i >= 0; i--) {
        if (list[i] < p.t) {
          p.crossCoord = list[i];
          p.crossOffset = lane.offsets[i];
          return;
        }
      }
      p.crossCoord = list[n - 1];
      p.crossOffset = lane.offsets[n - 1];
    }
  }

  const pedGeometry = buildPedestrianGeometry();
  ownedGeometries.push(pedGeometry);

  const pedMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.0
  });
  ownedMaterials.push(pedMaterial);
  injectAgentShader(pedMaterial, 'agents-ped-gait', {
    uniforms: { uFlash },
    vertexPars: [
      'attribute vec2 aLimb;',
      'attribute float aCloth;',
      'attribute float aPhase;',
      'attribute vec3 aTint;',
      'varying vec3 vAgentTint;',
      '// 四肢绕关节做简谐摆动 θ = A·sin(ϕ)·aLimb.x（同侧手脚反相）；aLimb.y 为关节高度',
      'vec3 agentGait( vec3 p, float pivot ) {',
      '\tif ( abs( aLimb.x ) < 0.001 ) return p;',
      '\tfloat ang = sin( aPhase ) * 0.62 * aLimb.x;',
      '\tfloat c = cos( ang );',
      '\tfloat s = sin( ang );',
      '\tfloat y = p.y - pivot;',
      '\treturn vec3( p.x, y * c - p.z * s + pivot, y * s + p.z * c );',
      '}'
    ].join('\n'),
    normalBody: '\tobjectNormal = agentGait( objectNormal, 0.0 );',
    vertexBody: [
      '\ttransformed = agentGait( transformed, aLimb.y );',
      '\t// 躯干与手臂随步频轻微上下起伏，双腿保持踩地不抬升',
      '\ttransformed.y += abs( sin( aPhase ) ) * 0.028 * ( 1.0 - step( 0.9, abs( aLimb.x ) ) );',
      '\tvAgentTint = mix( vec3( 1.0 ), aTint, aCloth );'
    ].join('\n'),
    fragmentPars: [
      'uniform float uFlash;',
      'varying vec3 vAgentTint;'
    ].join('\n'),
    colorBody: '\tdiffuseColor.rgb *= vAgentTint;',
    emissiveBody: '\ttotalEmissiveRadiance += clamp( uFlash, 0.0, 1.0 ) * 0.35 * vec3( 0.8, 0.85, 1.0 );'
  });

  const pedCount = pedLanes.length > 0 ? tier.peds : 0;
  const pedMesh = new THREE.InstancedMesh(pedGeometry, pedMaterial, Math.max(pedCount, 1));
  pedMesh.name = 'agents-pedestrians';
  pedMesh.frustumCulled = false;
  pedMesh.count = pedCount;
  pedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const pedPhaseAttr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(pedCount, 1)), 1);
  pedPhaseAttr.setUsage(THREE.DynamicDrawUsage);
  pedGeometry.setAttribute('aPhase', pedPhaseAttr);
  const pedTintAttr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(pedCount, 1) * 3), 3);
  pedGeometry.setAttribute('aTint', pedTintAttr);
  group.add(pedMesh);

  /** 行人衣着色板（低饱和都市色调） */
  const PED_TINTS = [
    [0.20, 0.22, 0.28], [0.34, 0.30, 0.27], [0.16, 0.24, 0.32], [0.45, 0.44, 0.42],
    [0.52, 0.24, 0.22], [0.24, 0.32, 0.26], [0.60, 0.56, 0.48], [0.14, 0.14, 0.16],
    [0.38, 0.26, 0.34], [0.28, 0.36, 0.44]
  ];

  const pedestrians = [];
  for (let i = 0; i < pedCount; i++) {
    // 大道人行道更宽更显眼、路口也更密（每 80m 一个），因此加大权重，
    // 否则数量占多数的横街车道会把人稀释掉，看不出「路口停走」。
    const lane = pedRng.weighted(pedLanes, (l) => (l.axis === 0 ? 8 : 1));
    const dir = pedRng.bool() ? 1 : -1;
    // 60% 概率落在中城/村区一带（默认机位可见），其余全线均匀分布
    let t;
    if (pedRng.bool(0.6)) {
      const lo = Math.max(lane.min, lane.axis === 0 ? -1000 : lane.min);
      const hi = Math.min(lane.max, lane.axis === 0 ? 800 : lane.max);
      t = hi > lo ? pedRng.range(lo, hi) : pedRng.range(lane.min, lane.max);
    } else {
      t = pedRng.range(lane.min, lane.max);
    }
    const tint = pedRng.pick(PED_TINTS);
    const p = {
      lane,
      t,
      dir,
      lateral: pedRng.range(-2.1, 2.1),
      cruise: pedRng.range(1.15, 1.65),
      speed: pedRng.range(1.15, 1.65),
      phase: pedRng.range(0, TWO_PI),
      crossCoord: 0,
      crossOffset: 0
    };
    refreshNextCrossing(p);
    pedestrians.push(p);
    pedTintAttr.array[i * 3] = tint[0];
    pedTintAttr.array[i * 3 + 1] = tint[1];
    pedTintAttr.array[i * 3 + 2] = tint[2];
  }
  pedTintAttr.needsUpdate = true;

  /**
   * 推进行人一帧：沿人行道方向行走、路口按信号相位停走、步态相位随速度推进。
   * @param {number} dt 帧时长（秒）
   * @returns {void}
   */
  function updatePedestrians(dt) {
    for (let i = 0; i < pedestrians.length; i++) {
      const p = pedestrians[i];
      const lane = p.lane;

      // 到达/越过当前路口后换下一个
      if ((p.dir > 0 && p.t > p.crossCoord + 6) || (p.dir < 0 && p.t < p.crossCoord - 6)) {
        refreshNextCrossing(p);
      }

      // 路口红灯 → 在停止线前站住
      const stopLine = p.crossCoord - p.dir * lane.stopGap;
      const gap = (stopLine - p.t) * p.dir;
      let target = p.cruise;
      if (gap >= -0.4 && gap <= 2.2 && !crossingIsWalkable(p.crossOffset, simTime, lane.axis)) {
        target = 0;
      }
      p.speed = damp(p.speed, target, 7, dt);
      if (p.speed < 0.02) p.speed = 0;

      p.t += p.dir * p.speed * dt;
      if (p.t > lane.max) {
        p.t = lane.min + (p.t - lane.max);
        refreshNextCrossing(p);
      } else if (p.t < lane.min) {
        p.t = lane.max - (lane.min - p.t);
        refreshNextCrossing(p);
      }

      // 步频与步速挂钩（步幅约 0.78m/步）
      p.phase += p.speed * 3.6 * dt;
      if (p.phase > 1e6) p.phase = mod(p.phase, TWO_PI);
      pedPhaseAttr.array[i] = p.phase;

      let angle;
      if (lane.axis === 0) {
        _pos.set(lane.fixed + p.lateral, SIDEWALK_Y, p.t);
        angle = p.dir > 0 ? 0 : Math.PI;
      } else {
        _pos.set(p.t, SIDEWALK_Y, lane.fixed + p.lateral);
        angle = p.dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      }
      _quat.setFromAxisAngle(WORLD_UP, angle);
      _mat.compose(_pos, _quat, _scaleOne);
      pedMesh.setMatrixAt(i, _mat);
    }

    pedMesh.instanceMatrix.needsUpdate = true;
    pedPhaseAttr.needsUpdate = true;
  }

  /* ====================================================================== *
   * 五、渲染标志 / 帧更新 / 释放
   * ====================================================================== */

  /**
   * 修正阴影标志。main.js 的 `mount()` 会对本模块所有网格统一打开 `castShadow`，
   * 而半透明的旋翼盘、频闪灯、尾迹若参与阴影投射会产生「实心黑块」。
   * 因此在首帧把它们回退掉，只保留行人这种贴地、对画面真正有贡献的投影。
   * @returns {void}
   */
  function applyRenderFlags() {
    renderFlagsApplied = true;
    birdMesh.castShadow = false;
    birdMesh.receiveShadow = false;
    heliMesh.castShadow = false;
    heliMesh.receiveShadow = false;
    heliDiscMesh.castShadow = false;
    heliDiscMesh.receiveShadow = false;
    heliStrobeMesh.castShadow = false;
    heliStrobeMesh.receiveShadow = false;
    boatMesh.castShadow = false;
    boatMesh.receiveShadow = true;
    wakeMesh.castShadow = false;
    wakeMesh.receiveShadow = false;
    pedMesh.castShadow = true;
    pedMesh.receiveShadow = true;
  }

  /**
   * 每帧推进全部动画体（契约 §1 的 `SystemHandle.update`）。
   * 本函数及其调用链**不创建任何对象**，所有中间量走模块级预分配变量。
   *
   * @param {Object} ctx FrameContext（契约 §2）
   * @returns {void}
   */
  function update(ctx) {
    if (!ctx) return;
    if (!renderFlagsApplied) applyRenderFlags();

    const rawDt = typeof ctx.dt === 'number' && Number.isFinite(ctx.dt) ? ctx.dt : 0;
    const dt = clamp(rawDt, 0, 0.1);
    simTime += dt;

    const params = ctx.weather && ctx.weather.params ? ctx.weather.params : null;
    const rain = params && Number.isFinite(params.rainIntensity) ? params.rainIntensity : 0;
    const snow = params && Number.isFinite(params.snowIntensity) ? params.snowIntensity : 0;
    const precip = clamp(Math.max(rain, snow), 0, 1);
    const night = clamp(
      Number.isFinite(ctx.nightFactor) ? ctx.nightFactor : uNight.value,
      0,
      1
    );

    updateBirds(dt, precip);
    updateHelicopters(dt, night);
    updateBoats(ctx, dt);
    updatePedestrians(dt);
  }

  /**
   * 释放本模块自建的全部 GPU 资源（契约 §1：重建城市时会调用）。
   * 不触碰 `ctx0.textures` 中的共享贴图，也不释放 `ctx0.env` 的 uniform 对象。
   * @returns {void}
   */
  function dispose() {
    for (let i = 0; i < helicopters.length; i++) {
      const h = helicopters[i];
      if (h.spot) {
        if (h.spot.target && h.spot.target.parent) h.spot.target.parent.remove(h.spot.target);
        if (h.spot.parent) h.spot.parent.remove(h.spot);
        h.spot.dispose();
        h.spot = null;
      }
    }

    const meshes = [birdMesh, heliMesh, heliDiscMesh, heliStrobeMesh, boatMesh, wakeMesh, pedMesh];
    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      if (m.parent) m.parent.remove(m);
      m.dispose();
    }

    for (let i = 0; i < ownedGeometries.length; i++) ownedGeometries[i].dispose();
    for (let i = 0; i < ownedMaterials.length; i++) ownedMaterials[i].dispose();
    for (let i = 0; i < ownedTextures.length; i++) ownedTextures[i].dispose();
    ownedGeometries.length = 0;
    ownedMaterials.length = 0;
    ownedTextures.length = 0;

    birds.length = 0;
    flocks.length = 0;
    helicopters.length = 0;
    boats.length = 0;
    pedestrians.length = 0;
    pedLanes.length = 0;

    group.clear();
  }

  const instanceTotal = birds.length + heliCount * 3 + boatCount * 2 + pedCount;

  return {
    object3D: group,
    update,
    dispose,
    stats: {
      instances: instanceTotal,
      draws: 7,
      birds: birds.length,
      flocks: flocks.length,
      helicopters: heliCount,
      boats: boatCount,
      pedestrians: pedCount
    }
  };
}
