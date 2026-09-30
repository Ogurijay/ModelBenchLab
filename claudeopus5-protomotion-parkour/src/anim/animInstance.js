// 动画层:UE 侧 UProtoAnimInstance 的等价物(docs/PORT_SPEC.md §5)。
//
// UE 那边是原生 FAnimInstanceProxy —— 每帧自己采样最多两条 UAnimSequence 再插值,
// 因为整个工程是无头构建的,AnimGraph 状态机没法用脚本写出来。
// three 侧有 AnimationMixer 可以做同一件事(两个 AnimationAction 交叉淡化),
// 于是本文件只保留 UE 里真正含语义的那部分:**槽位怎么选、one-shot 什么时候独占轨道、
// 权重曲线和 playRate 怎么算**。这三条必须逐条等价,剩下的采样细节交给 mixer。
//
// 对应关系:
//   UE CurrentTime/PreviousTime  → 两个 AnimationAction 各自的 time
//   UE PlayRate                  → action.setEffectiveTimeScale()
//   UE BlendAlpha                → action.setEffectiveWeight(),线性,与 UE 同一条曲线
//   UE 非循环片段的 Clamp        → LoopOnce + clampWhenFinished
//
// 只读 movement 的公开 API(PORT_SPEC §10),不碰它的内部状态 —— 动画层不该有话语权。

import * as THREE from 'three';
import {
  ANIM_SLOT,
  MOTION_STATE,
  ONE_SHOT_SLOTS,
  SLOT_CLIP_NAMES,
  SLOT_BLEND_TIME,
  SLOT_BLEND_TIME_DEFAULT,
  SLOT_REFERENCE_SPEED,
  PLAY_RATE_RANGE,
  TUNING,
  DERIVED,
} from '../sim/protoTypes.js';

const NO_CLIP = '<none>';

export class ProtoAnimInstance {
  /**
   * @param {THREE.AnimationMixer} mixer 由 anim/rig.js 建好,根节点是角色骨架所在子树
   * @param {Map<string, THREE.AnimationClip>} clipsByName GLB 里的全部片段,按名字索引
   */
  constructor(mixer, clipsByName) {
    this.mixer = mixer;
    this.clips = clipsByName instanceof Map
      ? clipsByName
      : new Map(Object.entries(clipsByName ?? {}));

    /** 槽位 → AnimationAction;片段缺失的槽位存 null,后续一律退回 Idle。 */
    this.actions = new Map();
    /** 没在 GLB 里找到的片段,HUD 想显示就有得显示。 */
    this.missingClips = [];
    for (const slot of Object.values(ANIM_SLOT)) this.#resolveSlot(slot);

    this.currentSlot = ANIM_SLOT.Idle;
    this.previousSlot = null;
    this.blendDuration = 0;
    this.blendRemaining = 0;
    this.blendAlpha = 1;

    /** one-shot 独占轨道直到播完或被取消;null 表示没有。 */
    this.oneShotSlot = null;
    this.oneShotRemaining = 0;

    // 下面这些是 UE 里镜像出来给调试用的读数,HUD/轨迹直接取。
    this.motionState = MOTION_STATE.Idling;
    this.groundSpeed = 0;
    this.verticalSpeed = 0;
    this.isOnWall = false;
    this.playRate = 1;
    this.activeSlot = ANIM_SLOT.Idle;
    this.activeClipName = this.clipNameOf(ANIM_SLOT.Idle);

    const idle = this.#action(ANIM_SLOT.Idle);
    if (idle) {
      idle.reset().play();
      idle.setEffectiveWeight(1);
    }
  }

  /** 槽位对应的片段名;槽位没片段时给 `<none>`,与 UE 的 GetActiveClipName 一致。 */
  clipNameOf(slot) {
    return this.#action(slot) ? SLOT_CLIP_NAMES[slot] : NO_CLIP;
  }

  /**
   * 每**渲染**帧调一次(仿真是固定 1/120 步长,动画不需要跟着细分)。
   * 事件标志由这里独占消费:UE 侧同样是动画实例一帧读一次。
   *
   * @param {number} dt 渲染帧时长(秒)
   * @param {object} movement ProtoMovement 实例
   */
  update(dt, movement) {
    // UE: DeltaSeconds <= 0 直接 return —— 连事件都不消费,暂停一帧不会吃掉一次起跳。
    if (!movement || !(dt > 0)) return;

    this.motionState = movement.motionState ?? MOTION_STATE.NotSet;
    const velocity = movement.body?.velocity;
    this.groundSpeed = velocity ? Math.hypot(velocity.x, velocity.y) : 0;
    this.verticalSpeed = velocity ? velocity.z : 0;
    this.isOnWall = movement.isOnWall?.() === true;

    this.#consumeEvents(movement);
    this.#tickOneShot(dt);

    let desired = this.#selectSlot(movement);
    if (!this.#action(desired)) desired = ANIM_SLOT.Idle; // 片段缺失:构造时已经 warn 过
    if (desired !== this.currentSlot) this.#switchTo(desired);

    this.#applyWeights(dt);

    this.mixer.update(dt);

    this.activeSlot = this.currentSlot;
    this.activeClipName = this.clipNameOf(this.currentSlot);
  }

  // -------------------------------------------------------------------------
  // 事件 → one-shot(PORT_SPEC §5.3)
  // -------------------------------------------------------------------------

  /**
   * 四个标志**全部**先消费再排优先级。
   * 顺序不能改成「命中就返回」:留在标志位上的低优先级事件会晚一帧再放出来,
   * 表现成落地动作莫名其妙延后一帧 —— UE 的注释专门写了这点。
   */
  #consumeEvents(movement) {
    const ledge = movement.consumeLedgeEvent?.() === true;
    const wallEnter = movement.consumeWallEnterEvent?.() === true;
    const jump = movement.consumeJumpEvent?.() === true;
    const land = movement.consumeLandEvent?.() === true;

    if (ledge) this.#triggerOneShot(ANIM_SLOT.ClimbLedge);
    else if (wallEnter) this.#triggerOneShot(ANIM_SLOT.WallEnter);
    else if (jump) this.#triggerOneShot(ANIM_SLOT.JumpStart);
    else if (land) this.#triggerOneShot(ANIM_SLOT.Land);
  }

  #triggerOneShot(slot) {
    const action = this.#action(slot);
    if (!action) return; // 片段没导进来就当这次触发不存在,不能让轨道被一个空槽锁住
    this.oneShotSlot = slot;
    this.oneShotRemaining = action.getClip().duration;
    // 注:同一个 one-shot 在播放中再次触发时,UE 只重置计时不重置片段时间(片段停在
    // clamp 住的末帧继续等)。这里照抄那个行为,不"顺手修好"。
  }

  /**
   * 计时递减 + 四张额外取消表(PORT_SPEC §5.3)。
   * 取消条件存在的理由都是同一个:环境已经不再是这段动作说的那回事了。
   */
  #tickOneShot(dt) {
    if (!this.oneShotSlot) return;
    this.oneShotRemaining -= dt;

    let cancel = this.oneShotRemaining <= 0;
    switch (this.oneShotSlot) {
      case ANIM_SLOT.Land:
        // 人已经跑起来了就别再摆落地姿势;又掉下去了同理。
        cancel = cancel
          || this.groundSpeed > TUNING.WalkSpeed
          || this.motionState === MOTION_STATE.Falling;
        break;
      case ANIM_SLOT.JumpStart:
        cancel = cancel || this.motionState !== MOTION_STATE.Jumping;
        break;
      case ANIM_SLOT.WallEnter:
        cancel = cancel || !this.isOnWall;
        break;
      case ANIM_SLOT.ClimbLedge:
        cancel = cancel
          || this.motionState === MOTION_STATE.Idling
          || this.motionState === MOTION_STATE.Running;
        break;
      default:
        break;
    }

    if (cancel) {
      this.oneShotSlot = null;
      this.oneShotRemaining = 0;
    }
  }

  // -------------------------------------------------------------------------
  // 槽位选择(PORT_SPEC §5.2)
  // -------------------------------------------------------------------------

  #selectSlot(movement) {
    // one-shot 独占轨道,身份层这一帧说什么都不算。
    if (this.oneShotSlot) return this.oneShotSlot;

    if ((movement.rollTimeRemaining ?? 0) > 0) return ANIM_SLOT.Roll;

    switch (this.motionState) {
      case MOTION_STATE.Wallrunning:
        return ANIM_SLOT.WallRun;

      case MOTION_STATE.Climbing:
        return (movement.climbVertical ?? 0) > DERIVED.InputDeadzone
          ? ANIM_SLOT.ClimbUp
          : ANIM_SLOT.ClimbIdle;

      case MOTION_STATE.Gliding:
        return ANIM_SLOT.Glide;

      case MOTION_STATE.Jumping:
      case MOTION_STATE.Falling:
        return ANIM_SLOT.Fall;

      case MOTION_STATE.Sliding:
        // Sliding 一个身份盖了两件事:挂在墙上下滑,和地面翻滚。
        return this.isOnWall ? ANIM_SLOT.WallSlide : ANIM_SLOT.Roll;

      case MOTION_STATE.Running:
        return movement.isSprinting?.() ? ANIM_SLOT.Sprint : ANIM_SLOT.Run;

      case MOTION_STATE.Walking:
        return ANIM_SLOT.Walk;

      case MOTION_STATE.Idling:
      default:
        return ANIM_SLOT.Idle;
    }
    // WallTop 槽位没有选中它的分支 —— UE 侧也没有,片段留着是为了和 SlotClipNames 一一对应。
  }

  // -------------------------------------------------------------------------
  // 交叉淡化与播放速率(PORT_SPEC §5.4)
  // -------------------------------------------------------------------------

  #switchTo(desired) {
    // 只维护两条轨道。再往前那条(上一次淡出还没走完的)必须显式停掉,
    // 否则它会带着上一帧的权重一直混在结果里。
    const stale = this.previousSlot;
    this.previousSlot = this.currentSlot;
    this.currentSlot = desired;
    if (stale && stale !== this.currentSlot && stale !== this.previousSlot) {
      this.#stopAction(stale);
    }

    this.blendDuration = SLOT_BLEND_TIME[desired] ?? SLOT_BLEND_TIME_DEFAULT;
    this.blendRemaining = this.blendDuration;

    // UE 换槽时 CurrentTime = 0:新片段一定从头播。
    const action = this.#action(desired);
    if (action) {
      action.reset().play();
      action.setEffectiveWeight(0); // 真正的权重在本帧末尾统一算
    }
  }

  #applyWeights(dt) {
    this.blendRemaining = Math.max(0, this.blendRemaining - dt);
    this.blendAlpha = this.blendDuration > 1e-6
      ? 1 - this.blendRemaining / this.blendDuration
      : 1;

    // 参考速度只有 Walk/Run/Sprint 有;其余片段按 1 倍速走(爬墙/跑墙不按速度缩放)。
    const reference = SLOT_REFERENCE_SPEED[this.currentSlot] ?? 0;
    this.playRate = reference > 0
      ? THREE.MathUtils.clamp(this.groundSpeed / reference, PLAY_RATE_RANGE[0], PLAY_RATE_RANGE[1])
      : 1;

    const current = this.#action(this.currentSlot);
    if (current) {
      current.setEffectiveWeight(this.blendAlpha);
      current.setEffectiveTimeScale(this.playRate);
    }

    const previous = this.previousSlot ? this.#action(this.previousSlot) : null;
    if (previous) {
      if (this.blendAlpha >= 1) {
        // 淡完就停:留着一条权重 0 的轨道白算一份骨骼插值。
        this.#stopAction(this.previousSlot);
        this.previousSlot = null;
      } else {
        previous.setEffectiveWeight(1 - this.blendAlpha);
        // 淡出的那条按原速走完(UE 的 AdvanceTime(PreviousSlot, ..., DeltaSeconds)),
        // 不继承新槽位的 playRate。
        previous.setEffectiveTimeScale(1);
      }
    } else if (this.blendAlpha >= 1) {
      this.previousSlot = null;
    }
  }

  // -------------------------------------------------------------------------
  // 槽位 → action
  // -------------------------------------------------------------------------

  #resolveSlot(slot) {
    const clipName = SLOT_CLIP_NAMES[slot];
    const clip = clipName ? this.clips.get(clipName) : undefined;
    if (!clip) {
      this.actions.set(slot, null);
      this.missingClips.push(clipName ?? slot);
      console.warn(`[anim] 槽位 ${slot} 找不到片段 ${clipName ?? '(未配置)'},该状态退回 Idle`);
      return;
    }

    const action = this.mixer.clipAction(clip);
    if (ONE_SHOT_SLOTS.has(slot)) {
      // 单次片段播完停在末帧:UE 侧 AdvanceTime 对非循环片段是 Clamp 到片段长度。
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }
    action.enabled = true;
    action.setEffectiveWeight(0);
    this.actions.set(slot, action);
  }

  #action(slot) {
    return this.actions.get(slot) ?? null;
  }

  /** three 的 action.stop() 只是把轨道摘下来,残留权重不清 —— 顺手清掉,读状态时不误导。 */
  #stopAction(slot) {
    const action = this.#action(slot);
    if (!action) return;
    action.stop();
    action.setEffectiveWeight(0);
  }
}
