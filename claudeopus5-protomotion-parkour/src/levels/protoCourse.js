// 测试场 Lvl_ProtoMotion —— 坐标逐条照抄 UE 工程的 Tools/build_test_map.py。
//
// 17 个结构没有一个是装饰:每一个都对应移动系统条件图的一条边界。
// 单位:源脚本用米,这里保留 `centreM` / `sizeM` 原样,并顺带算出仿真用的厘米中心/半长。
//
// UE 侧 box(label, centre_m, size_m, material, rotation, tags):
//   centre_m 是盒中心,size_m 是完整边长,rotation 是 FRotator(Pitch, Yaw, Roll) 的度数。

import * as THREE from 'three';
import { TAGS } from '../sim/protoTypes.js';

const M = 100; // 米 → 厘米

/**
 * UE FRotator(pitch, yaw, roll) → 四元数。
 * 合成次序照 UE:Rz(yaw) * Ry(pitch) * Rx(roll)(先 roll 后 pitch 最后 yaw)。
 *
 * **pitch 与 roll 必须取反**。UE 的权威定义是 `FRotationMatrix` 的第 0 行
 * (也就是 `FRotator::Vector()`)= `(cosP·cosY, cosP·sinY, sinP)`:pitch 为正时前向**抬起**。
 * 而在右手系里绕 +Y 转正角会把 +X 压**下去**((cosθ, 0, −sinθ)),符号正好相反;
 * roll 同理 —— UE 的第 1 行 `(…, …, −sinR·cosP)` 对应绕 +X 转 −roll。
 * 所以 UE 的 (pitch, roll) 等价于右手系的 (−pitch, −roll),不取反会得到一份**镜像**几何:
 * Angle_15deg / Angle_30deg 的倾斜方向会与 UE 相反,OBB 碰撞与渲染一起错。
 * (tests/run.mjs 第 3 节按 FRotationMatrix 三行逐个钉住这条约定,别再改回去。)
 */
export function ueRotatorToQuaternion(pitch = 0, yaw = 0, roll = 0) {
  const d2r = Math.PI / 180;
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), yaw * d2r);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -pitch * d2r);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -roll * d2r);
  return qz.multiply(qy).multiply(qx);
}

/** 材质色板(UE LinearColor,线性空间)。 */
export const PALETTE = {
  floor: [0.16, 0.17, 0.19],
  climb: [0.22, 0.42, 0.68],
  wallrun: [0.85, 0.55, 0.15],
  angle: [0.30, 0.60, 0.35],
  unclimbable: [0.70, 0.14, 0.14],
  tower: [0.45, 0.35, 0.60],
  low: [0.60, 0.60, 0.25],
};

/** 出生点:PlayerStart (0, 0, 120),朝向 +X —— 正前方 42 m 就是跑墙用的高墙。 */
export const PLAYER_START = {
  position: [0, 0, 120],
  yawDeg: 0,
};

const FLOOR_SIZE = 400;
const FLOOR_THICK = 2;

/**
 * 结构表。`rotation` 缺省即 {pitch:0,yaw:0,roll:0}。
 * `tests` 是这块存在的理由 —— 删任何一块都会让某条边界失去覆盖。
 */
const RAW = [
  // ---- 地面 ----------------------------------------------------------------
  {
    id: 'Floor',
    centreM: [0, 0, -FLOOR_THICK / 2],
    sizeM: [FLOOR_SIZE, FLOOR_SIZE, FLOOR_THICK],
    material: 'floor',
    tests: '地面,上表面在 Z=0',
  },

  // ---- 冲刺跑道 + 高墙(Wallrunning)---------------------------------------
  {
    id: 'WallRun_Target',
    centreM: [42, 0, 20],
    sizeM: [1, 60, 40],
    material: 'wallrun',
    tests: '冲刺撞它 → Wallrunning,动能耗尽后交接 Climbing',
  },
  {
    id: 'WallRun_Marker_20m',
    centreM: [41, -31, 10],
    sizeM: [1, 1, 20],
    material: 'wallrun',
    tests: '跑墙墙旁的高度参照',
  },

  // ---- 攀爬阶梯:递增墙高 --------------------------------------------------
  // for index, height in enumerate((3, 6, 10, 20)): y = -30 + index * 14
  {
    id: 'Climb_03m',
    centreM: [-32, -30, 1.5],
    sizeM: [1, 10, 3],
    material: 'climb',
    tests: '爬到顶再翻越(3 m)',
  },
  {
    id: 'Climb_06m',
    centreM: [-32, -16, 3],
    sizeM: [1, 10, 6],
    material: 'climb',
    tests: '爬到顶再翻越(6 m)',
  },
  {
    id: 'Climb_10m',
    centreM: [-32, -2, 5],
    sizeM: [1, 10, 10],
    material: 'climb',
    tests: '爬到顶再翻越(10 m)—— 自检第 9/10/11 项的目标墙',
  },
  {
    id: 'Climb_20m',
    centreM: [-32, 12, 10],
    sizeM: [1, 10, 20],
    material: 'climb',
    tests: '爬到顶再翻越(20 m)',
  },

  // ---- 角度架:WallMaxNormalZ 的接受/拒绝边界 -----------------------------
  // for index, tilt in enumerate((0, 15, 30)): x = -20 + index * 16
  //
  // 源脚本的注释说「倾斜 A 度 → |法线.z| = sin(A),0/15 应贴住、30 应拒绝」。
  // 但它传的是 **Pitch**(绕 Y 轴),而这三块是沿 Y 方向薄的板(size 10 × 1 × 12),
  // 板面法线本来就朝 ±Y —— 绕 Y 旋转不会改变它,三块的 |法线.z| 实际都是 0。
  // 要做出预期效果得用 Roll(绕 X)。这里**照原样移植 Pitch**(对照实现不擅自改几何),
  // 差异记在 HANDOVER.md「与 UE 侧的差异与发现」里。
  {
    id: 'Angle_00deg',
    centreM: [-20, 42, 6],
    sizeM: [10, 1, 12],
    material: 'angle',
    rotation: { pitch: 0, yaw: 0, roll: 0 },
    tests: '倾斜 0° → |法线.z| = 0.00,应贴住',
  },
  {
    id: 'Angle_15deg',
    centreM: [-4, 42, 6],
    sizeM: [10, 1, 12],
    material: 'angle',
    rotation: { pitch: 15, yaw: 0, roll: 0 },
    tests: '源脚本意图:|法线.z| = 0.26 应贴住。实际 Pitch 不改变 ±Y 面法线,仍为 0.00',
  },
  {
    id: 'Angle_30deg',
    centreM: [12, 42, 6],
    sizeM: [10, 1, 12],
    material: 'angle',
    rotation: { pitch: 30, yaw: 0, roll: 0 },
    tests: '源脚本意图:|法线.z| = 0.50 > 0.35 应拒绝。实际 Pitch 不改变 ±Y 面法线,仍为 0.00',
  },

  // ---- 标了 unclimbable 的板 ----------------------------------------------
  {
    id: 'Unclimbable_Slab',
    centreM: [0, -42, 6],
    sizeM: [16, 1, 12],
    material: 'unclimbable',
    tags: [TAGS.Unclimbable],
    tests: '打了 `unclimbable` 标签,正面撞也必须拒绝',
  },

  // ---- 墙跳走廊 ------------------------------------------------------------
  {
    id: 'Corridor_L',
    centreM: [-60, 4, 7.5],
    sizeM: [30, 1, 15],
    material: 'climb',
    tests: '4 m 间距,左右墙跳交替上升',
  },
  {
    id: 'Corridor_R',
    centreM: [-60, -4, 7.5],
    sizeM: [30, 1, 15],
    material: 'climb',
    tests: '4 m 间距,左右墙跳交替上升',
  },

  // ---- 滑翔塔 --------------------------------------------------------------
  {
    id: 'Glide_Tower',
    centreM: [-32, 60, 30],
    sizeM: [12, 12, 60],
    material: 'tower',
    tests: '爬 60 m,再从塔顶滑翔穿过空地',
  },
  {
    id: 'Glide_LandingPad',
    centreM: [30, 60, 0.25],
    sizeM: [20, 20, 0.5],
    material: 'angle',
    tests: '距塔约 62 m 的滑翔落点',
  },

  // ---- 不该被当成墙的矮块 --------------------------------------------------
  // for index, height in enumerate((0.4, 0.8)): centre = (12, -8 + index * 6, height / 2)
  {
    id: 'Low_Step_40cm',
    centreM: [12, -8, 0.2],
    sizeM: [4, 4, 0.4],
    material: 'low',
    tests: '40 cm:低于 MaxStepHeight,应当直接迈过去',
  },
  {
    id: 'Low_Step_80cm',
    centreM: [12, -2, 0.4],
    sizeM: [4, 4, 0.8],
    material: 'low',
    tests: '80 cm:高于 MaxStepHeight(55)又矮于墙 → 只有翻越分支过得去',
  },
];

/**
 * 仿真/渲染共用的结构列表。每项:
 *   { id, center:[cm], halfSize:[cm], quat:THREE.Quaternion, material, tags, tests, centreM, sizeM }
 */
export const STRUCTURES = RAW.map((s) => {
  const r = s.rotation || { pitch: 0, yaw: 0, roll: 0 };
  return {
    id: s.id,
    centreM: s.centreM,
    sizeM: s.sizeM,
    center: [s.centreM[0] * M, s.centreM[1] * M, s.centreM[2] * M],
    halfSize: [(s.sizeM[0] * M) / 2, (s.sizeM[1] * M) / 2, (s.sizeM[2] * M) / 2],
    rotation: r,
    quat: ueRotatorToQuaternion(r.pitch, r.yaw, r.roll),
    material: s.material,
    tags: s.tags || [],
    tests: s.tests,
  };
});

/** 灯光与天空(build_test_map.py 尾部)。外观求神似,不作为对齐项。 */
export const LIGHTING = {
  sunRotation: { pitch: -42, yaw: 145, roll: 0 },
  sunIntensity: 6,
  fogDensity: 0.004,
};
