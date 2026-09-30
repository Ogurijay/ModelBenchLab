// 弹簧臂相机 —— UE `USpringArmComponent` 的等价物。
//
// 逐条对着 ProtoMotionCharacter.cpp 的 CameraBoom 抄:
//   TargetArmLength 420 / SocketOffset (0,40,90) / bUsePawnControlRotation / CameraLagSpeed 12
// 参数全部从 protoTypes 的 CHARACTER 取,这里不复制任何数字。
//
// 三个容易抄错、必须照 UE 的细节:
//   1. **滞后作用在臂的原点上,不是相机位置上**。UE 注释写得很明确:lag the target,
//      这样转视角是瞬时的、只有角色平移才拖尾。反过来做会得到一台甩不动的相机。
//   2. SocketOffset 是**臂的局部空间**偏移,而且是在退臂之后再加,不是加在角色身上。
//   3. 臂长碰撞回退是必需的,不是加分项:关卡里有 60 m 高塔和 4 m 宽走廊,
//      不做 sweep 的话相机会整段埋进墙里,画面直接变成纯色。
import * as THREE from 'three';
import { CHARACTER } from '../sim/protoTypes.js';

const D2R = Math.PI / 180;

/** 俯仰钳位。±90 会让 lookAt 在 up=(0,0,1) 下退化,留 10° 余量。 */
const PITCH_LIMIT = 80;

/**
 * 臂长碰撞探针半径。UE SpringArm 默认 ProbeSize = 12;
 * 这里放宽到 20,因为我们的 CollisionWorld 只有盒,细探针容易顺着两块墙的接缝钻出去。
 */
const PROBE_RADIUS = 20;

/** UE CameraComponent 的 FieldOfView 默认 90,是**水平**视角;three 的 fov 是垂直的。 */
export const HORIZONTAL_FOV = 90;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 把 (x,y,z) / [x,y,z] / Vector3 都收成 Vector3,免得对接时被字段形状卡住。 */
function readVec3(out, v) {
  if (!v) return out.set(0, 0, 0);
  if (Array.isArray(v)) return out.set(v[0] || 0, v[1] || 0, v[2] || 0);
  return out.set(v.x || 0, v.y || 0, v.z || 0);
}

/** 按水平 90° 反解垂直 fov。窗口变宽时保持横向视野不变,这才是 UE 的观感。 */
export function setCameraAspect(camera, aspect) {
  const halfH = Math.atan(Math.tan((HORIZONTAL_FOV / 2) * D2R) / Math.max(aspect, 1e-3));
  camera.aspect = aspect;
  camera.fov = (halfH * 2) / D2R;
  camera.updateProjectionMatrix();
}

/** near/far 按 PORT_SPEC §0:厘米尺度,1 cm ~ 600 m。 */
export function createCamera(aspect = 16 / 9) {
  const camera = new THREE.PerspectiveCamera(60, aspect, 1, 60000);
  camera.up.set(0, 0, 1);
  setCameraAspect(camera, aspect);
  return camera;
}

export class SpringArmCamera {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../sim/collision.js').CollisionWorld|null} collisionWorld
   *        给 null 就退化成不做臂长回退(自动化截图时用)。
   */
  constructor(camera, collisionWorld = null) {
    this.camera = camera;
    this.collision = collisionWorld || null;

    // Z-up 世界。必须在任何 lookAt 之前设好,否则第一帧的朝向是错的。
    camera.up.set(0, 0, 1);

    this.armLength = CHARACTER.CameraArmLength;
    this.socketOffset = new THREE.Vector3().fromArray(CHARACTER.CameraSocketOffset);
    this.lagSpeed = CHARACTER.CameraLagSpeed;

    this.yawDeg = 0;
    this.pitchDeg = -10;
    /** 实际臂长(被墙压短后的值),HUD/调试可以读。 */
    this.actualArmLength = this.armLength;
    /** 本帧臂长是否被碰撞压短。 */
    this.blocked = false;

    /** null = 还没有历史,第一帧直接吸附,避免从原点飞过来。 */
    this.laggedOrigin = null;

    // 每帧复用,主循环里不产生垃圾。
    this._target = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
  }

  /** 传送 / 重开之后调用:清掉滞后历史,让相机立刻站到位。 */
  reset() {
    this.laggedOrigin = null;
  }

  /**
   * @param {number} dt 渲染帧时长(秒)。相机是表现层,跟渲染帧走,不用固定步长。
   * @param {THREE.Vector3|number[]} targetPos 胶囊中心(cm)。
   * @param {number} yawDeg 控制器 yaw(鼠标给)。
   * @param {number} pitchDeg 控制器 pitch(鼠标给),内部钳到 ±80。
   */
  update(dt, targetPos, yawDeg, pitchDeg) {
    this.yawDeg = yawDeg;
    this.pitchDeg = clamp(pitchDeg, -PITCH_LIMIT, PITCH_LIMIT);

    // 臂的原点 = 胶囊中心。UE 把 CameraBoom 挂在 RootComponent(胶囊)上,
    // 抬到胸口的那 90 cm 是 SocketOffset.z 的活儿 —— 在这里再抬一次就是双计。
    readVec3(this._target, targetPos);

    if (this.laggedOrigin === null) {
      this.laggedOrigin = this._target.clone();
    } else if (dt > 0) {
      // UE 用 FMath::VInterpTo(线性钳 dt*speed),它在 60/144 fps 下手感不同;
      // 换成同一时间常数的指数形式,帧率无关,稳态行为一致。
      this.laggedOrigin.lerp(this._target, 1 - Math.exp(-this.lagSpeed * dt));
    }

    // UE FRotationMatrix(pitch, yaw, roll=0) 的三条轴(Z-up、X 前 / Y 右 / Z 上):
    //   X = ( cp·cy,  cp·sy,  sp)
    //   Y = (   -sy,     cy,   0)
    //   Z = (-sp·cy, -sp·sy,  cp)
    const p = this.pitchDeg * D2R;
    const y = this.yawDeg * D2R;
    const cp = Math.cos(p);
    const sp = Math.sin(p);
    const cy = Math.cos(y);
    const sy = Math.sin(y);
    this._forward.set(cp * cy, cp * sy, sp);
    this._right.set(-sy, cy, 0);
    this._up.set(-sp * cy, -sp * sy, cp);

    // 先沿视线反方向退满臂长,再加局部 SocketOffset —— 次序照 UE,反了会让侧偏随俯仰乱摆。
    this._desired
      .copy(this.laggedOrigin)
      .addScaledVector(this._forward, this.socketOffset.x - this.armLength)
      .addScaledVector(this._right, this.socketOffset.y)
      .addScaledVector(this._up, this.socketOffset.z);

    // 臂长回退:从原点向目标位置扫一个球,撞到就停在命中处。
    let t = 1;
    if (this.collision && this.armLength > 0) {
      const hit = this.collision.sphereSweep(this.laggedOrigin, this._desired, PROBE_RADIUS);
      if (hit) t = clamp(hit.time, 0, 1);
    }
    this.blocked = t < 1;
    // UE 的 BlendLocations 默认不做回弹插值:收臂是瞬时的。照抄 ——
    // 相机宁可突然拉近,也不要有一帧穿到墙外去看见关卡背面。
    this.camera.position.lerpVectors(this.laggedOrigin, this._desired, t);
    this.actualArmLength = this.camera.position.distanceTo(this.laggedOrigin);

    // 朝向仍取整条臂的朝向(FollowCamera 的 bUsePawnControlRotation = false,
    // 它继承臂的旋转)—— 所以被墙压近之后视线方向不变,只是离角色更近。
    this._look.copy(this.camera.position).addScaledVector(this._forward, 1000);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(this._look);
  }
}
