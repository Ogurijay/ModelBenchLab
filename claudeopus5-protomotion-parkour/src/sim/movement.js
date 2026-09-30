// 系统的心脏 —— UE 侧 `UProtoMovementComponent` 的条件图 + MagneticBoots 探针 + 三条贴墙轨道。
//
// 上面是 input/selftest 给的意图,下面是 body.js 的物理。这一层只做一件事:
// **决定这一帧归谁管**,然后把这个决定翻译成「给 body 的一次调用」。
//
// 三个必须照原文逐行抄的地方,抄错了系统行为就变了:
//
//   1) EvaluateTransitions 里每个 return 的先后 = 优先级。
//      「已贴墙 → 直接 return」排在环境争夺之前,所以贴墙期间轨道全权接管,
//      墙的条件不会被重新评估;跑酷(翻越)排在贴墙之后,所以真墙永远优先于翻越;
//      滑翔排最后,所以任何环境轨道都能抢走它。顺序换一下,行为立刻两样。
//
//   2) 两段式探针(下 -32.9 / 上 +70.5)。它是「膝高台阶 / 胸高障碍 / 真墙」的唯一分界:
//      只有下探针中 ⇒ bLedgeAhead(可翻越,不是墙);两个都中 ⇒ 墙。
//      少了上探针,40 cm 的砖都会被当成墙爬上去;少了下探针,矮障碍就是死路。
//
//   3) 轨道之间的切换是**同帧立即执行**新轨道(UE 里紧跟 SetMovementMode 就直接调 PhysXxx)。
//      跑墙掉速到交接线的那一帧就已经在爬了,不会空过一帧 —— 空过一帧会在动画层看见闪跳。
//
// 单位:厘米、秒、度;Z-up、X 前 / Y 右 / Z 上,不做任何换算。
// 本文件必须能在 node 里跑:只用 three 的数学类,不碰 window / document / 渲染器。

import * as THREE from 'three';
import {
  CUSTOM_MOVE,
  DERIVED,
  ENGINE,
  MOTION_STATE,
  MOVE_MODE,
  TAGS,
  TUNING,
  wallRunEntrySpeed,
} from './protoTypes.js';

const DEG = Math.PI / 180;

/** UE MIN_TICK_TIME:比这还短的一帧,三条贴墙轨道直接不动作。 */
const MIN_TICK_TIME = 1e-6;
/** UE KINDA_SMALL_NUMBER。FVector2D::IsNearlyZero / GetSafeNormal 的判零都用它这个量级。 */
const NEARLY_ZERO = 1e-4;
/** UE MaxSimulationIterations。轨道退出后同帧改跑新物理,靠它兜住病态的连环切换。 */
const MAX_PHYS_ITER = 8;

// 模块级临时对象。热路径(每帧 2 次球扫掠 + 若干向量运算)上不做分配。
const _preferred = new THREE.Vector3();
const _wallRight = new THREE.Vector3();
const _desired = new THREE.Vector3();
/** tickWallShared 自己的落点:三条轨道传进来的就是 _desired,不能原地改写它。 */
const _wallVel = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _away = new THREE.Vector3();
const _probeStart = new THREE.Vector3();
const _probeEnd = new THREE.Vector3();

/** 两个探针各自的命中缓存:一次 ProbeWall 里下/上探针的结果要同时存在。 */
const _lowerHit = { normal: new THREE.Vector3(), point: new THREE.Vector3(), distance: 0 };
const _upperHit = { normal: new THREE.Vector3(), point: new THREE.Vector3(), distance: 0 };

/** 角度差归一化到 (-180, 180]。 */
function wrapDeg(a) {
  let d = a % 360;
  if (d > 180) d -= 360;
  else if (d <= -180) d += 360;
  return d;
}

// ---------------------------------------------------------------------------
// ProtoMovement
// ---------------------------------------------------------------------------

export class ProtoMovement {
  /**
   * @param {import('./body.js').KinematicBody} body 角色胶囊 + 物理。
   * @param {import('./collision.js').CollisionWorld} world 碰撞世界,探针的球扫掠要用。
   */
  constructor(body, world) {
    this.body = body;
    this.world = world;

    /** 身份层。UE 的初值就是 Idling(还没跑第一帧物理时的默认答案)。 */
    this.motionState = MOTION_STATE.Idling;

    /**
     * MagneticBoots 探针结果。`normal` / `point` 是**复用**的向量,
     * 谁要留着跨帧用必须自己 clone —— 每帧都会被下一次探测覆写。
     */
    this.wallProbe = {
      valid: false,
      normal: new THREE.Vector3(),
      point: new THREE.Vector3(),
      distance: 0,
    };

    /** -1..1 的攀爬意图,给动画层选 ClimbUp / ClimbIdle。 */
    this.climbVertical = 0;
    /** 翻滚剩余时间。> 0 的整段时间里身份是 Sliding。 */
    this.rollTimeRemaining = 0;

    // --- 意图(每帧由 input / selftest 重新施加,模拟「按住」)
    this.rawMoveInput = { x: 0, y: 0 };
    this.sprintHeld = false;
    this.glideHeld = false;
    /** 已经在滑翔(不是意图,是状态)。 */
    this.gliding = false;
    /** 控制器 yaw(相机朝向)。输入是相机相对的,世界方向靠它算。 */
    this.controlYaw = 0;

    /**
     * 下探针有面、上探针没有 —— 在墙上意味着爬到顶了,在地面上意味着前方是胸高障碍。
     * 两种情形都走「翻越」,区别只在触发它的是 Phys* 还是条件图。
     */
    this.ledgeAhead = false;
    this.ledgeNormal = new THREE.Vector3();
    /** 翻越冷却,防止同一障碍在还没越过去时连发。 */
    this.vaultCooldown = 0;

    this.wallRunVerticalSpeed = 0;
    this.wallRunLateralSpeed = 0;
    /** 攀爬无输入累计时长,到 WallSlideDelay 就衰减为下滑。 */
    this.noClimbInputTime = 0;

    this.rollDirection = new THREE.Vector3();

    /**
     * UE 直接改组件上的 GravityScale / AirControl,滑翔进出时缓存与还原。
     * 这里做成两个字段,moveFalling 的实参从它们算出来。
     */
    this.gravityScale = ENGINE.GravityScale;
    this.airControl = ENGINE.AirControl;
    this.cachedGravityScale = ENGINE.GravityScale;
    this.cachedAirControl = ENGINE.AirControl;
    /** 贴墙时要关掉朝向跟随,离墙再还原成进墙前的值。 */
    this.cachedOrientToMovement = body.orientToMovement;

    // --- one-shot 事件标志。动画层每帧 consume 一次,消费即清零。
    this.wallEnterEvent = false;
    this.landEvent = false;
    this.ledgeEvent = false;
    this.jumpEvent = false;
    /** 上一帧是否在 Falling。落地沿(bLandEvent)靠它检出。 */
    this.wasFalling = false;

    /** 本帧的世界输入加速度向量(未归一化,长度 = 推杆幅度)。贴墙时不喂给 body。 */
    this._accel = new THREE.Vector3();
  }

  // -------------------------------------------------------------------------
  // 意图
  // -------------------------------------------------------------------------

  /** UE SetMoveInput(FVector2D):x = 前后,y = 左右(不是屏幕坐标)。 */
  setMoveInput(x, y) {
    this.rawMoveInput.x = x || 0;
    this.rawMoveInput.y = y || 0;
  }

  setSprintHeld(held) {
    this.sprintHeld = !!held;
  }

  /** 滑翔意图。原作是「离地后继续按住跳」,所以与跳共用一个键。 */
  setGlideHeld(held) {
    this.glideHeld = !!held;
  }

  /** 控制器 yaw(度)。输入方向是相机相对的,由 main / selftest 每帧喂进来。 */
  setControlYaw(deg) {
    this.controlYaw = deg || 0;
  }

  // -------------------------------------------------------------------------
  // 查询
  // -------------------------------------------------------------------------

  getCustomMove() {
    return this.body.mode === MOVE_MODE.Custom ? this.body.customMode : CUSTOM_MOVE.None;
  }

  isOnWall() {
    const m = this.getCustomMove();
    return m === CUSTOM_MOVE.WallRun || m === CUSTOM_MOVE.Climb || m === CUSTOM_MOVE.WallSlide;
  }

  /** 冲刺要三个条件同时成立:按住 Shift、有输入、脚在地上。空中按 Shift 不算冲刺。 */
  isSprinting() {
    return this.sprintHeld && !this._inputNearlyZero() && this.body.mode === MOVE_MODE.Walking;
  }

  isGliding() {
    return this.gliding;
  }

  /**
   * UE GetMaxSpeed()。分支顺序即优先级:贴墙 > 翻滚 > 空中 > 地面。
   * 贴墙那三档轨道自己写速度、并不走加速度通道,这三个值只是给 HUD 和 UE 对齐用。
   * 空中不钳到走速是刻意的 —— 冲刺跳的动量要能一路带到落地。
   */
  getMaxSpeed() {
    switch (this.getCustomMove()) {
      case CUSTOM_MOVE.WallRun:
        return Math.max(TUNING.WallRunUpSpeed, TUNING.ClimbLateralSpeed) + TUNING.WallStickForce;
      case CUSTOM_MOVE.Climb:
        return (
          Math.max(TUNING.ClimbUpSpeed, TUNING.ClimbDownSpeed, TUNING.ClimbLateralSpeed)
          + TUNING.WallStickForce
        );
      case CUSTOM_MOVE.WallSlide:
        return TUNING.WallSlideSpeed + TUNING.WallStickForce;
      default:
        break;
    }

    if (this.rollTimeRemaining > 0) return TUNING.RollSpeed;
    if (this.body.mode === MOVE_MODE.Falling) {
      return this.gliding ? TUNING.GlideHorizontalSpeed : TUNING.SprintSpeed;
    }
    if (this.body.mode === MOVE_MODE.Walking) {
      if (this.isSprinting()) return TUNING.SprintSpeed;
      return this._inputSize() < TUNING.WalkInputThreshold ? TUNING.WalkSpeed : TUNING.RunSpeed;
    }
    // UE 走 Super::GetMaxSpeed();构造函数里 MaxWalkSpeed = RunSpeed。本工程到不了这里。
    return TUNING.RunSpeed;
  }

  consumeWallEnterEvent() {
    const b = this.wallEnterEvent;
    this.wallEnterEvent = false;
    return b;
  }

  consumeLandEvent() {
    const b = this.landEvent;
    this.landEvent = false;
    return b;
  }

  consumeLedgeEvent() {
    const b = this.ledgeEvent;
    this.ledgeEvent = false;
    return b;
  }

  consumeJumpEvent() {
    const b = this.jumpEvent;
    this.jumpEvent = false;
    return b;
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  /**
   * 一步固定步长仿真 = UE 的 UpdateCharacterStateBeforeMovement → PerformMovement。
   * 先跑条件图定下「这一帧归谁」,再按最终的物理模式跑对应轨道。
   */
  step(dt) {
    if (!(dt > 0)) return;

    this._evaluateTransitions(dt);

    // UE OnMovementModeChanged 会在模式变化时重新派生身份。条件图内部的切换已经各自派生过了,
    // 这里补的是**物理自己**改的模式:走出平台边缘(walking → falling)、落地(falling → walking)。
    const modeBefore = this.body.mode;
    const customBefore = this.body.customMode;

    this._startNewPhysics(dt, 0);

    if (this.body.mode !== modeBefore || this.body.customMode !== customBefore) {
      this.updateMotionState();
    }
  }

  /** UE StartNewPhysics:按当前物理模式派发。轨道退出后同帧改跑新物理也走这里。 */
  _startNewPhysics(dt, iterations) {
    if (iterations > MAX_PHYS_ITER) return;

    switch (this.body.mode) {
      case MOVE_MODE.Walking:
        // 贴墙时轨道全权接管速度,所以只有非贴墙分支才把输入喂给加速度通道 —— 两边一起推会打架
        this.body.moveWalking(dt, this._accel, this.getMaxSpeed());
        break;
      case MOVE_MODE.Falling:
        this.body.moveFalling(
          dt,
          this._accel,
          this.getMaxSpeed(),
          ENGINE.GravityZ * this.gravityScale,
          this.airControl,
        );
        break;
      case MOVE_MODE.Custom:
        this._physCustom(dt, iterations);
        break;
      default:
        break;
    }
  }

  /**
   * 条件图。PORT_SPEC §2.3 的十步,顺序即优先级 —— 每个 return 都是「本帧到此为止」。
   */
  _evaluateTransitions(dt) {
    const body = this.body;

    // 1. 翻滚独占本帧速度。先判后减,所以归零那一帧仍然按翻滚速度走(UE 原样)。
    if (this.rollTimeRemaining > 0) {
      this.rollTimeRemaining = Math.max(0, this.rollTimeRemaining - dt);
      if (body.mode === MOVE_MODE.Walking) {
        body.velocity.set(
          this.rollDirection.x * TUNING.RollSpeed,
          this.rollDirection.y * TUNING.RollSpeed,
          0,
        );
      }
    }

    // 2. 落地沿。落地要停掉滑翔 —— 否则贴着地面还挂着 0.14 的重力。
    const fallingNow = body.mode === MOVE_MODE.Falling;
    if (this.wasFalling && body.mode === MOVE_MODE.Walking) {
      this.landEvent = true;
      this.stopGlide();
    }
    // 3.
    this.wasFalling = fallingNow;

    // 4. Preferred 方向:输入 → 水平速度 → 角色前向,逐级退化。
    //    退化链的意义:松手时探针仍然朝着「正在去的方向」探,贴着墙滑行不会因为松手而掉下来。
    const inputSize = this._worldInputInto(this._accel);
    if (inputSize > NEARLY_ZERO) {
      _preferred.copy(this._accel).normalize();
    } else {
      this._accel.set(0, 0, 0);
      _preferred.set(body.velocity.x, body.velocity.y, 0);
      if (_preferred.lengthSq() > NEARLY_ZERO * NEARLY_ZERO) _preferred.normalize();
      else _preferred.set(Math.cos(body.yaw * DEG), Math.sin(body.yaw * DEG), 0);
    }

    // 5. 探针必须在所有条件判断之前 —— 下面每一条分支都读它。
    this.probeWall(_preferred);

    // 6. 已贴墙:Phys* 轨道全权接管,条件图只负责「墙没了就下来」。
    if (this.isOnWall()) {
      if (!this.wallProbe.valid && !this.ledgeAhead) this.exitWall();
      this.updateMotionState();
      return;
    }

    // 7. 环境争夺:墙。翻滚中不给贴墙(翻滚是短促轨道,不能被环境打断)。
    if (this.wallProbe.valid && this.rollTimeRemaining <= 0) {
      const n = this.wallProbe.normal;
      const speedIntoWall = -(body.velocity.x * n.x + body.velocity.y * n.y);
      const pushingIntoWall = -(_preferred.x * n.x + _preferred.y * n.y + _preferred.z * n.z)
        > DERIVED.PushIntoWallDot;

      // a) 冲刺撞墙:水平动能换成一次向上的跑墙,撞得越狠蹬得越高。
      if (pushingIntoWall && speedIntoWall >= TUNING.WallRunEnterSpeed) {
        this.enterWall(CUSTOM_MOVE.WallRun);
        this.wallRunVerticalSpeed = wallRunEntrySpeed(speedIntoWall);
        this.wallRunLateralSpeed = 0;
        this.updateMotionState();
        return;
      }

      // b) 其余情况是攀爬。空中贴墙不要求速度(蹭到墙就能挂上去),地面上要有 60 的撞墙速度。
      if (pushingIntoWall
        && (body.mode === MOVE_MODE.Falling || speedIntoWall > DERIVED.ClimbEnterSpeedIntoWall)) {
        this.enterWall(CUSTOM_MOVE.Climb);
        this.updateMotionState();
        return;
      }
    }

    // 8. 跑酷:高过 MaxStepHeight 又矮于墙的障碍,不翻越就是死路
    //    —— 台阶迈不上去,两段式探针又不认它是墙。
    this.vaultCooldown = Math.max(0, this.vaultCooldown - dt);
    if (this.ledgeAhead
      && body.mode === MOVE_MODE.Walking
      && this.vaultCooldown <= 0
      && this.rollTimeRemaining <= 0
      && -(_preferred.x * this.ledgeNormal.x + _preferred.y * this.ledgeNormal.y
        + _preferred.z * this.ledgeNormal.z) > DERIVED.PushIntoWallDot) {
      this.vaultCooldown = DERIVED.VaultCooldown;
      this.mantleLedge();
      this.updateMotionState();
      return;
    }

    // 9. 持续空中轨道:滑翔。离地不够高不给起滑(否则贴地一按跳就飘)。
    const canGlide = this.glideHeld
      && body.mode === MOVE_MODE.Falling
      && this.rollTimeRemaining <= 0
      && body.heightAboveFloor() >= TUNING.GlideMinHeight;

    if (canGlide) this.startGlide();
    else if (this.gliding) this.stopGlide();

    if (this.gliding) {
      // 滑翔的终端速度。重力已经缩到 0.14,这一钳是兜住起滑前就攒下的下坠速度。
      body.velocity.z = Math.max(body.velocity.z, -TUNING.GlideMaxDescendSpeed);
    }

    // 10.
    this.updateMotionState();
  }

  // -------------------------------------------------------------------------
  // MagneticBoots 探针(PORT_SPEC §3.1)
  // -------------------------------------------------------------------------

  /**
   * 单次探针:从胶囊中心抬 `zOffset`,沿 `dir` 扫一个半径 25.2 的球,长度 42 + 60 = 102。
   * 命中后两条拒绝规则(顺序无关,都是硬拒绝):
   *   1) |normal.z| > 0.35 —— 不是近垂直面,那是地面/斜坡的地盘;
   *   2) 命中物带 unclimbable 标签。
   * 通过则把法线/命中点/距离写进 `out` 并返回 true。
   *
   * UE 侧后来又加了 grabbable 与「正在模拟物理的组件」两条拒绝(可抓的道具不该被爬上去),
   * 本次移植锚定 2026-08-03 的移动快照,关卡里没有这两类物体,故不实现。
   */
  traceWallAt(zOffset, dir, out) {
    const p = this.body.position;
    _probeStart.set(p.x, p.y, p.z + zOffset);
    _probeEnd.copy(_probeStart).addScaledVector(dir, DERIVED.ProbeReach);

    const hit = this.world.sphereSweep(_probeStart, _probeEnd, DERIVED.ProbeSphereRadius);
    if (!hit) return false;
    if (Math.abs(hit.normal.z) > TUNING.WallMaxNormalZ) return false;
    if (hit.tags && hit.tags.includes(TAGS.Unclimbable)) return false;

    out.normal.copy(hit.normal);
    out.point.copy(hit.point);
    out.distance = hit.distance;
    return true;
  }

  /**
   * 两段式探针 —— 整套设计的关键,把「膝高台阶 / 胸高障碍 / 真墙」区分开。
   *
   * 下探针(腰腹, −32.9)不中 → 前方什么都没有,直接 false。
   * 下中上不中(胸头, +70.5)→ 只有半人高的面 = 可翻越的矮障碍,不是可攀爬的墙:
   *   bLedgeAhead = true,法线记下探针的。**同一条判据在墙上意味着「爬到顶了」**,
   *   所以 PhysClimb 丢墙时也用它决定「翻越」还是「掉下去」。
   * 两个都中 → 真墙,取**上探针**的法线(胸口那一段才是真正要贴的面)。
   */
  probeWall(preferred) {
    const probe = this.wallProbe;
    probe.valid = false;
    probe.normal.set(0, 0, 0);
    probe.point.set(0, 0, 0);
    probe.distance = 0;
    this.ledgeAhead = false;

    if (!preferred || preferred.lengthSq() < NEARLY_ZERO * NEARLY_ZERO) return false;

    if (!this.traceWallAt(DERIVED.ProbeLowerZ, preferred, _lowerHit)) return false;

    if (!this.traceWallAt(DERIVED.ProbeUpperZ, preferred, _upperHit)) {
      this.ledgeAhead = true;
      this.ledgeNormal.copy(_lowerHit.normal).normalize();
      return false;
    }

    probe.valid = true;
    probe.normal.copy(_upperHit.normal).normalize();
    probe.point.copy(_upperHit.point);
    probe.distance = _upperHit.distance;
    return true;
  }

  // -------------------------------------------------------------------------
  // 三条贴墙轨道(PORT_SPEC §3.2 ~ §3.5)
  // -------------------------------------------------------------------------

  _physCustom(dt, iterations) {
    switch (this.body.customMode) {
      case CUSTOM_MOVE.WallRun:
        this.physWallRun(dt, iterations);
        break;
      case CUSTOM_MOVE.Climb:
        this.physClimb(dt, iterations);
        break;
      case CUSTOM_MOVE.WallSlide:
        this.physWallSlide(dt, iterations);
        break;
      default:
        break;
    }
  }

  /**
   * 三条轨道共用的每帧体。
   * 恒定向内吸附(MagneticBootsStickToWall)是关键:速度里永远有一份 −normal * 220,
   * 于是扫掠总是解算在墙面上,而不会因为数值误差一点点飘离墙。
   * 末尾把速度改写成「实际达成的位移 / dt」,动画层与 HUD 看到的才是真速度(body.safeMove 负责)。
   */
  tickWallShared(dt, desiredVelocity) {
    const n = this.wallProbe.normal;
    _wallVel.copy(desiredVelocity).addScaledVector(n, -TUNING.WallStickForce);
    // WallOrient:正面朝 −normal,只取 yaw(角色不会为了贴墙而躺下)
    const targetYaw = Math.atan2(-n.y, -n.x) / DEG;
    this.body.safeMove(dt, _wallVel, targetYaw, TUNING.WallOrientSpeed);
  }

  /** wallRight = normalize(cross(up, normal)):沿墙面的横向轴。 */
  _wallRightInto(out) {
    const n = this.wallProbe.normal;
    out.set(-n.y, n.x, 0);
    const len = Math.hypot(out.x, out.y);
    if (len > NEARLY_ZERO) out.multiplyScalar(1 / len);
    else out.set(0, 0, 0);
    return out;
  }

  /**
   * 跑墙:一次性把撞墙动能兑换成向上冲，然后按 1500/s 掉速。
   * 掉到 WallRunHandoffSpeed 以下就交接 —— 这就是 Wallrunning → Climbing 那条边。
   * 还推着墙(x > 0.1)交给攀爬,松手了就交给下滑。**同帧立即执行**新轨道。
   */
  physWallRun(dt, iterations) {
    if (dt < MIN_TICK_TIME) return;
    if (!this.wallProbe.valid) {
      if (this.ledgeAhead) this.mantleLedge();
      else this.exitWall();
      this._startNewPhysics(dt, iterations + 1);
      return;
    }

    this.wallRunVerticalSpeed -= TUNING.WallRunDeceleration * dt;
    this.climbVertical = 1;

    if (this.wallRunVerticalSpeed <= TUNING.WallRunHandoffSpeed) {
      if (this.rawMoveInput.x > DERIVED.InputDeadzone) {
        this._setPhysicsMode(MOVE_MODE.Custom, CUSTOM_MOVE.Climb);
        this.physClimb(dt, iterations);
      } else {
        this._setPhysicsMode(MOVE_MODE.Custom, CUSTOM_MOVE.WallSlide);
        this.physWallSlide(dt, iterations);
      }
      return;
    }

    this._wallRightInto(_wallRight);
    _desired.set(0, 0, this.wallRunVerticalSpeed)
      .addScaledVector(_wallRight, this.wallRunLateralSpeed);
    this.tickWallShared(dt, _desired);
  }

  /**
   * 攀爬:前推上升、后拉下降(下降更快)、左右沿墙横移。
   * 丢墙时用 bLedgeAhead 分岔:下探针还有面 ⇒ 是爬过了顶 ⇒ 翻越;什么都没有 ⇒ 掉下去。
   */
  physClimb(dt, iterations) {
    if (dt < MIN_TICK_TIME) return;
    if (!this.wallProbe.valid) {
      if (this.ledgeAhead) this.mantleLedge();
      else this.exitWall();
      this._startNewPhysics(dt, iterations + 1);
      return;
    }

    const ix = this.rawMoveInput.x;
    const iy = this.rawMoveInput.y;
    this.climbVertical = ix;
    const vertical = ix >= 0 ? ix * TUNING.ClimbUpSpeed : ix * TUNING.ClimbDownSpeed;

    if (Math.abs(ix) < DERIVED.InputDeadzone && Math.abs(iy) < DERIVED.InputDeadzone) {
      this.noClimbInputTime += dt;
      if (this.noClimbInputTime >= TUNING.WallSlideDelay) {
        this._setPhysicsMode(MOVE_MODE.Custom, CUSTOM_MOVE.WallSlide);
        this.physWallSlide(dt, iterations);
        return;
      }
    } else {
      this.noClimbInputTime = 0;
    }

    this._wallRightInto(_wallRight);
    _desired.set(0, 0, vertical)
      .addScaledVector(_wallRight, iy * TUNING.ClimbLateralSpeed);
    this.tickWallShared(dt, _desired);
  }

  /** 下滑:纯粹往下,任何攀爬意图都立刻把轨道交回攀爬(同帧执行)。 */
  physWallSlide(dt, iterations) {
    if (dt < MIN_TICK_TIME) return;
    if (!this.wallProbe.valid) {
      // 下滑不做翻越:一路往下滑不可能「爬过顶」,这里的丢墙只能是滑到墙根了。
      this.exitWall();
      this._startNewPhysics(dt, iterations + 1);
      return;
    }

    if (Math.abs(this.rawMoveInput.x) > DERIVED.InputDeadzone
      || Math.abs(this.rawMoveInput.y) > DERIVED.InputDeadzone) {
      this.noClimbInputTime = 0;
      this._setPhysicsMode(MOVE_MODE.Custom, CUSTOM_MOVE.Climb);
      this.physClimb(dt, iterations);
      return;
    }

    this.climbVertical = -1;
    _desired.set(0, 0, -TUNING.WallSlideSpeed);
    this.tickWallShared(dt, _desired);
  }

  // -------------------------------------------------------------------------
  // 进入 / 离开 / 翻越(PORT_SPEC §3.6)
  // -------------------------------------------------------------------------

  /**
   * 贴上墙。三条轨道之间来回切换时不重复置 bWallEnterEvent —— 那是「刚贴上」的一次性事件,
   * 不是「换了条轨道」。朝向跟随必须关掉:贴墙期间朝向由 tickWallShared 按墙面法线接管。
   */
  enterWall(mode) {
    if (!this.isOnWall()) {
      this.cachedOrientToMovement = this.body.orientToMovement;
      this.wallEnterEvent = true;
    }
    this.body.orientToMovement = false;
    this.stopGlide();
    this.noClimbInputTime = 0;
    this._setPhysicsMode(MOVE_MODE.Custom, mode);
  }

  /** 从墙上下来:还原朝向跟随,跑墙的动能作废,交回常规下落物理。 */
  exitWall() {
    this.body.orientToMovement = this.cachedOrientToMovement;
    this.wallRunVerticalSpeed = 0;
    this.wallRunLateralSpeed = 0;
    this.noClimbInputTime = 0;
    this.climbVertical = 0;
    this._setPhysicsMode(MOVE_MODE.Falling);
  }

  /**
   * 翻越:向上 760 + 沿当前朝向前冲 460,把角色抛到台面上。
   * 前向取角色朝向而不是输入方向 —— 贴墙时角色正面朝墙,这个前向正是「翻过去」的方向;
   * 地面翻越时角色也已经朝着障碍跑,同一个式子两种场合都对。
   */
  mantleLedge() {
    this.ledgeEvent = true;
    this.body.orientToMovement = this.cachedOrientToMovement;
    this.climbVertical = 0;

    const yaw = this.body.yaw * DEG;
    _forward.set(Math.cos(yaw), Math.sin(yaw), 0);
    this._setPhysicsMode(MOVE_MODE.Falling);
    this.body.velocity.set(
      _forward.x * TUNING.LedgeMantleForwardSpeed,
      _forward.y * TUNING.LedgeMantleForwardSpeed,
      TUNING.LedgeMantleUpSpeed,
    );
  }

  // -------------------------------------------------------------------------
  // 滑翔
  // -------------------------------------------------------------------------

  /** 只改重力与空中控制,物理模式仍是 Falling —— 身份与物理分离的教科书例子。 */
  startGlide() {
    if (this.gliding) return;
    this.cachedGravityScale = this.gravityScale;
    this.cachedAirControl = this.airControl;
    this.gravityScale = TUNING.GlideGravityScale;
    this.airControl = TUNING.GlideAirControl;
    this.gliding = true;
  }

  stopGlide() {
    if (!this.gliding) return;
    this.gravityScale = this.cachedGravityScale;
    this.airControl = this.cachedAirControl;
    this.gliding = false;
  }

  // -------------------------------------------------------------------------
  // 一次性意图
  // -------------------------------------------------------------------------

  /**
   * 跳。走 movement 而不是直接改速度,是为了让墙有机会先把这次按键抢走(墙跳)。
   * 空中不能二段跳:非 Walking 一律拒绝。
   */
  tryJump() {
    const body = this.body;

    if (this.isOnWall()) {
      // 墙跳:蹬着墙面往外推。探针失效时退化成「背对角色前向」——贴墙时前向就是朝墙的。
      if (this.wallProbe.valid) {
        _away.copy(this.wallProbe.normal);
      } else {
        const yaw = body.yaw * DEG;
        _away.set(-Math.cos(yaw), -Math.sin(yaw), 0);
      }
      this.exitWall();
      body.velocity.set(
        _away.x * TUNING.WallJumpAwaySpeed,
        _away.y * TUNING.WallJumpAwaySpeed,
        TUNING.WallJumpUpSpeed,
      );
      this.jumpEvent = true;
      // **刻意不再派生一次身份**。UE 的 TryJump 墙跳分支是
      //   `ExitWall(); Velocity = Away*620 + Up*800; bJumpEvent = true; return true;`
      // 身份只在 ExitWall 里的 SetMovementMode 那一刻派生,那时 Velocity 还是**墙上的旧值** ——
      // 于是「攀爬上升中起跳」派生成 Jumping、「贴墙下滑中起跳」派生成 Falling。
      // 在这里补一次 updateMotionState() 会让「墙跳 ⇒ Jumping」变成无条件成立,
      // 那是「实现得更好了」,但改变了下滑起跳那一帧的可观测身份 —— 对照移植不做这种改进。
      return true;
    }

    if (body.mode !== MOVE_MODE.Walking) return false;

    const charged = this.isSprinting();
    body.velocity.z = charged ? TUNING.SprintJumpSpeed : TUNING.JumpSpeed;
    if (charged) {
      const speed2D = Math.hypot(body.velocity.x, body.velocity.y);
      if (speed2D > NEARLY_ZERO) {
        body.velocity.x += (body.velocity.x / speed2D) * TUNING.SprintJumpForward;
        body.velocity.y += (body.velocity.y / speed2D) * TUNING.SprintJumpForward;
      } else {
        const yaw = body.yaw * DEG;
        body.velocity.x += Math.cos(yaw) * TUNING.SprintJumpForward;
        body.velocity.y += Math.sin(yaw) * TUNING.SprintJumpForward;
      }
    }

    this._setPhysicsMode(MOVE_MODE.Falling);
    this.jumpEvent = true;
    return true;
  }

  /** 翻滚:只在地面、且不能自己打断自己。方向锁定在按下那一刻。 */
  tryRoll() {
    if (this.body.mode !== MOVE_MODE.Walking || this.rollTimeRemaining > 0) return false;

    const size = this._worldInputInto(this.rollDirection);
    if (size > NEARLY_ZERO) {
      this.rollDirection.multiplyScalar(1 / size);
    } else {
      const yaw = this.body.yaw * DEG;
      this.rollDirection.set(Math.cos(yaw), Math.sin(yaw), 0);
    }
    this.rollTimeRemaining = TUNING.RollDuration;
    return true;
  }

  // -------------------------------------------------------------------------
  // 身份
  // -------------------------------------------------------------------------

  /**
   * MotionState 派生。顺序即优先级:
   * 贴墙是物理事实,压过一切;翻滚与滑翔是「正在做的事」,压过物理模式;
   * 最后才按物理模式 + 速度分档。滑翔在这里被单独拎出来,正是因为它物理上仍是 Falling。
   */
  updateMotionState() {
    switch (this.getCustomMove()) {
      case CUSTOM_MOVE.WallRun:
        this.motionState = MOTION_STATE.Wallrunning;
        return;
      case CUSTOM_MOVE.Climb:
        this.motionState = MOTION_STATE.Climbing;
        return;
      case CUSTOM_MOVE.WallSlide:
        this.motionState = MOTION_STATE.Sliding;
        return;
      default:
        break;
    }

    if (this.rollTimeRemaining > 0) {
      this.motionState = MOTION_STATE.Sliding;
      return;
    }
    if (this.gliding) {
      this.motionState = MOTION_STATE.Gliding;
      return;
    }
    if (this.body.mode === MOVE_MODE.Falling) {
      this.motionState = this.body.velocity.z > 0 ? MOTION_STATE.Jumping : MOTION_STATE.Falling;
      return;
    }
    if (this.body.mode === MOVE_MODE.Walking) {
      const speed = Math.hypot(this.body.velocity.x, this.body.velocity.y);
      if (speed < DERIVED.IdleSpeedThreshold) this.motionState = MOTION_STATE.Idling;
      else if (speed <= DERIVED.WalkStateSpeedMax) this.motionState = MOTION_STATE.Walking;
      else this.motionState = MOTION_STATE.Running;
      return;
    }
    this.motionState = MOTION_STATE.NotSet;
  }

  // -------------------------------------------------------------------------
  // 传送(自检 / 重生)
  // -------------------------------------------------------------------------

  /**
   * UE 自检 BeginStep 的前两句,逐句照抄:`SetMovementMode(MOVE_Falling); Velocity = 0;`。
   *
   * **不走 exitWall**。裸切模式一样能还原朝向跟随 —— `_setPhysicsMode` 自己带
   * 「wasOnWall && !isOnWall ⇒ 还原 orientToMovement」那一支(UE 里对应
   * `OnMovementModeChanged` 的同一个判断)。走 exitWall 会额外清掉
   * WallRunVerticalSpeed / NoClimbInputTime / ClimbVertical 三个字段,而 UE 的 BeginStep 不清,
   * 于是上一步残留的攀爬簿记会带进下一步(比如第 10 步结束在下滑 ⇒ 第 11 步带着
   * NoClimbInputTime ≥ 0.6 开跑)。这些残留是 UE 自检行为的一部分,一并移植过来。
   *
   * 位置与朝向由 world.teleport 紧接着设定;滑翔状态**刻意不清**(UE 也不清),
   * 它会在下一帧条件图里因为 glideHeld 为假而自然还原。
   */
  resetForTeleport() {
    this._setPhysicsMode(MOVE_MODE.Falling);
    this.body.velocity.set(0, 0, 0);
  }

  // -------------------------------------------------------------------------
  // 内部
  // -------------------------------------------------------------------------

  /**
   * UE SetMovementMode + OnMovementModeChanged 的合体:模式真的变了才派生身份,
   * 并在「离开墙到非墙模式」时补一次朝向跟随的还原(exitWall 之外的路径也要保证还原)。
   */
  _setPhysicsMode(mode, customMode = CUSTOM_MOVE.None) {
    const sameCustom = mode !== MOVE_MODE.Custom || this.body.customMode === customMode;
    if (this.body.mode === mode && sameCustom) return;

    const wasOnWall = this.isOnWall();
    this.body.setMode(mode, customMode);
    if (wasOnWall && !this.isOnWall()) {
      this.body.orientToMovement = this.cachedOrientToMovement;
    }
    this.updateMotionState();
  }

  /**
   * 世界输入向量 = 相机前向 * x + 相机右向 * y,**不归一化**(长度就是 UE 的推杆幅度,
   * 也就是 AnalogInputModifier 的来源)。返回长度,方便调用方自己决定要不要归一化。
   * UE FRotationMatrix(0, yaw, 0):X 轴 = (cos, sin, 0),Y 轴 = (−sin, cos, 0)。
   */
  _worldInputInto(out) {
    const ix = this.rawMoveInput.x;
    const iy = this.rawMoveInput.y;
    if (Math.abs(ix) < NEARLY_ZERO && Math.abs(iy) < NEARLY_ZERO) {
      out.set(0, 0, 0);
      return 0;
    }
    const yaw = wrapDeg(this.controlYaw) * DEG;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    out.set(c * ix - s * iy, s * ix + c * iy, 0);
    return Math.hypot(out.x, out.y);
  }

  _inputSize() {
    return Math.hypot(this.rawMoveInput.x, this.rawMoveInput.y);
  }

  /** UE FVector2D::IsNearlyZero:逐分量比容差,不是比模长。 */
  _inputNearlyZero() {
    return Math.abs(this.rawMoveInput.x) < NEARLY_ZERO
      && Math.abs(this.rawMoveInput.y) < NEARLY_ZERO;
  }
}

export default ProtoMovement;
