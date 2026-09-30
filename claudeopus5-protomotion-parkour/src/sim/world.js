// 装配层 —— 把「关卡 + 胶囊 + 条件图」拼成一个能自己往前走的世界。
//
// 存在的理由只有一个:**自检和渲染必须跑同一份仿真**。
// 页面上的角色和 `node tests/run.mjs` 里的角色是同一个 ProtoWorld,
// 只有这样自检的结论才对页面成立。所以这里零浏览器依赖 —— node 里 `new ProtoWorld()` 直接能跑。
//
// 单位:厘米、秒、度;Z-up、X 前 / Y 右 / Z 上,不做任何换算。

import { createCourseWorld } from './collision.js';
import { KinematicBody } from './body.js';
import { ProtoMovement } from './movement.js';
import { CHARACTER, DERIVED } from './protoTypes.js';
import { PLAYER_START } from '../levels/protoCourse.js';

function readVec(v) {
  if (!v) return null;
  if (Array.isArray(v)) return { x: v[0], y: v[1], z: v[2] };
  return v;
}

export class ProtoWorld {
  constructor() {
    /** 关卡碰撞体(protoCourse 的 17 个结构)。 */
    this.collision = createCourseWorld();

    /** 角色胶囊 + 引擎替身物理。 */
    this.body = new KinematicBody(this.collision, {
      position: PLAYER_START.position,
      radius: CHARACTER.CapsuleRadius,
      halfHeight: CHARACTER.CapsuleHalfHeight,
    });
    this.body.yaw = PLAYER_START.yawDeg;

    /** 条件图 + 探针 + 三条贴墙轨道。 */
    this.movement = new ProtoMovement(this.body, this.collision);
    this.movement.setControlYaw(PLAYER_START.yawDeg);

    /** 已仿真的时间(秒)。自检的计时用它,不用真实时钟 —— 固定步长才可复现。 */
    this.time = 0;
  }

  /** 一步固定步长。外部按 DERIVED.FixedStep 调,渲染帧内用 accumulator 追赶。 */
  step(dt = DERIVED.FixedStep) {
    this.movement.step(dt);
    this.time += dt;
  }

  /**
   * 传送。次序照 UE 自检的 BeginStep:**先**切 Falling 并把速度归零,**再**设位置与朝向。
   * 反过来做的话,旧速度会在新位置上先跑一帧,近墙的传送点会立刻误触发贴墙。
   *
   * 朝向同时写给胶囊和控制器 yaw:UE 那边 SetActorLocationAndRotation 与
   * SetControlRotation 收的是同一个角度,而输入方向是相机相对的,只改一个会让角色横着跑。
   */
  teleport(position, yawDeg = this.body.yaw) {
    this.movement.resetForTeleport();

    const p = readVec(position);
    if (p) this.body.position.set(p.x, p.y, p.z);
    this.body.yaw = yawDeg;
    this.movement.setControlYaw(yawDeg);
  }

  /** 回出生点。页面上的「重置」用;自检不用(它自己每步传送)。 */
  reset() {
    this.movement.setMoveInput(0, 0);
    this.movement.setSprintHeld(false);
    this.movement.setGlideHeld(false);
    this.movement.rollTimeRemaining = 0;
    this.movement.stopGlide();
    this.teleport(PLAYER_START.position, PLAYER_START.yawDeg);
    this.time = 0;
  }
}

export default ProtoWorld;
