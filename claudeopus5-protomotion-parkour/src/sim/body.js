// 引擎替身 —— UE `UCharacterMovementComponent` 里「走 / 落 / 推位移」那一层。
// 上面是 movement.js 的条件图,下面是 collision.js 的扫掠;这里只负责一件事:
// 把速度变成**合法的**新位置,并且如实报告脚下是什么。
//
// 为什么要照 UE 的算法而不是随便写个「扫掠 + 滑动」:13 项自检里绝大多数状态断言
// 都挂在这一层的三个细节上 ——
//   1) CalcVelocity 的摩擦项只影响**转向**(速度与加速度同向时它恰好为 0),
//      所以直线加速时间严格等于 maxSpeed / MaxAcceleration,不是「指数逼近」。
//      靠这条,自检 3/4 的 Running 与峰值速度才对得上。
//   2) PhysWalking 末尾把速度改写成「实际位移 / dt」。撞墙时速度会真的归零,
//      MotionState 才不会在撞死的墙前一直报 Running。
//   3) StepUp:40 cm 迈过去、80 cm 迈不过去。这是 Low_Step_* 两块砖存在的全部理由,
//      也是自检 13(翻越)成立的前提 —— 80 cm 必须挡住,才轮得到翻越分支。
//
// 单位:厘米、秒、度;Z-up、X 前 / Y 右 / Z 上,不做任何换算。
// 本文件必须能在 node 里跑:只用 three 的数学类,不碰 window / document / 渲染器。

import * as THREE from 'three';
import { CHARACTER, CUSTOM_MOVE, DERIVED, ENGINE, MOVE_MODE } from './protoTypes.js';

// ---------------------------------------------------------------------------
// 几何容差。都不是手感常量(手感常量一律在 protoTypes.js),改这些只影响数值稳定性。
// ---------------------------------------------------------------------------

/**
 * 接触后沿法线退开的皮肤厚度。collision.js 的 time 是真 TOI 的下界,间隙可以正好是 0;
 * 留一点让下一次扫掠不从「gap = 0」起步,免得法线在零间隙处来回抖。
 */
const CONTACT_SKIN = 0.02;

/**
 * 贴地窗口 = UE 的 MAX_FLOOR_DIST(2.4 cm)。
 * 这个数**不能取大**:取 MaxStepHeight 量级的话,刚迈上台阶边缘、脚下线检测还量到远处地面时,
 * 会把角色又拽回台阶下面,于是台阶永远迈不上去。走缓坡不弹起靠的是位移沿地面平面走
 * (ComputeGroundMovementDelta),不是靠大窗口 —— UE 也是这么分工的。
 */
const FLOOR_SNAP_DIST = 2.4;

/**
 * UE `BrakingFrictionFactor` 的引擎默认值。
 * `ApplyVelocityBraking` 的第一句就是 `Friction = max(0, Friction * max(0, BrakingFrictionFactor))`,
 * 而 `bUseSeparateBrakingFriction` 默认 false ⇒ 制动时用的摩擦是 GroundFriction 的**两倍**(8 → 16)。
 * 它和 FLOOR_SNAP_DIST 一样属于「UE 引擎默认值,不在 PORT_SPEC §1 的手感常量表里」,
 * 所以放在本文件而不是 protoTypes.js —— 但它必须实现:少了它刹停距离长 40%,
 * 而「刹车利落程度」正是这次对照移植要比的手感之一。
 */
const BRAKING_FRICTION_FACTOR = 2.0;

/**
 * UE `AirControlBoostMultiplier` / `AirControlBoostVelocityThreshold` 的引擎默认值。
 * `BoostAirControl`:水平速度低于阈值时 `TickAirControl = min(1, Multiplier * TickAirControl)` ——
 * 从静止起跳的头几帧空中控制是 min(1, 2×0.45) = 0.9 而不是 0.45,滑翔时是 min(1, 2×0.9) = 1.0。
 * 少了它「原地起跳后想在空中拐一下」的初始响应只有 UE 的一半。
 */
const AIR_CONTROL_BOOST_MULTIPLIER = 2.0;
const AIR_CONTROL_BOOST_SPEED = 25;

/** 单次位移最多滑几次(UE SlideAlongSurface + TwoWallAdjust 的量级)。 */
const MAX_SLIDE_ITER = 4;
/** 解穿透迭代上限。本关卡几何下 collision.js 的 MTD 一次就收敛,留余量给多盒夹角。 */
const MAX_DEPENETRATE_ITER = 4;
/** 位移平方低于此就当没有位移(cm²)。 */
const MIN_DELTA_SQ = 1e-8;
/** 速度平方低于此就当静止(cm²/s²),对应 UE ApplyVelocityBraking 的 KINDA_SMALL_NUMBER 钳零。 */
const MIN_SPEED_SQ = 1e-4;
/**
 * 输入方向的判零阈值(平方)。UE 在 `Acceleration`(已经乘过 MaxAcceleration)上比
 * KINDA_SMALL_NUMBER,而这里的 accelDir 是**未乘**的推杆向量,所以阈值要放在推杆量级上。
 * 1e-8 ⇒ 模长 1e-4,与 movement.js 的 NEARLY_ZERO 同一个量级。
 */
const MIN_INPUT_SQ = 1e-8;

/** 台阶顶面探针:从接触点往障碍**内部**推这么远再向下打,确保打在顶面上而不是擦着侧面。 */
const STEP_PROBE_IN = 2;
/** 探针起点抬到 MaxStepHeight 之上的余量。起点落在障碍体内 ⇒ 障碍高过一个台阶 ⇒ 不是台阶。 */
const STEP_PROBE_MARGIN = 1;

const DEG = Math.PI / 180;

// 模块级临时对象。按「谁用」分开命名,避免嵌套调用互相踩(_slideMove 会调 _stepUp / _findFloor)。
const _wDelta = new THREE.Vector3();
const _wBefore = new THREE.Vector3();
const _sRem = new THREE.Vector3();
const _sEnd = new THREE.Vector3();
const _fFrom = new THREE.Vector3();
const _fTo = new THREE.Vector3();
const _stepEnd = new THREE.Vector3();
const _probe = [0, 0, 0];

// 地面查询结果。两个:_floor 给外层(整帧有效),_floorB 给 _slideMove 内部校验落地点,
// 免得内层查询把外层拿着的斜面法线冲掉。
const _floor = { found: false, dist: 0, normal: null, id: null, lineTrace: false };
const _floorB = { found: false, dist: 0, normal: null, id: null, lineTrace: false };

function readVec(v, fallback = 0) {
  if (!v) return null;
  if (Array.isArray(v)) return { x: v[0], y: v[1], z: v.length > 2 ? v[2] : fallback };
  return v;
}

/** 角度差归一化到 (-180, 180],给 yaw 插值取最短弧。 */
function wrapDeg(a) {
  let d = a % 360;
  if (d > 180) d -= 360;
  else if (d <= -180) d += 360;
  return d;
}

/** 从四元数里只取 yaw(绕 Z),度。俯仰/翻滚一律丢掉 —— 角色不会躺下。 */
function yawFromQuat(q) {
  const siny = 2 * (q.w * q.z + q.x * q.y);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  return Math.atan2(siny, cosy) / DEG;
}

// ---------------------------------------------------------------------------
// KinematicBody
// ---------------------------------------------------------------------------

export class KinematicBody {
  constructor(world, { position, radius = CHARACTER.CapsuleRadius, halfHeight = CHARACTER.CapsuleHalfHeight } = {}) {
    this.world = world;
    this.radius = radius;
    this.halfHeight = halfHeight;

    const p = readVec(position) || { x: 0, y: 0, z: 0 };
    /** 胶囊**中心**(不是脚底),cm。 */
    this.position = new THREE.Vector3(p.x, p.y, p.z);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;

    /**
     * 初始为 falling:自检每一步都是「传送 → 切 Falling → 让物理自己找地面」,
     * 出生点 (0,0,120) 也悬在离地 26 cm 处。默认 walking 会凭空多出一个 Idling 帧。
     */
    this.mode = MOVE_MODE.Falling;
    this.customMode = CUSTOM_MOVE.None;

    /** bOrientRotationToMovement。贴墙轨道会临时关掉它(movement.js 负责)。 */
    this.orientToMovement = true;

    // 脚下地面缓存。movement.js / HUD 直接读;StepUp 也要用 floorDist 当抬升基准。
    this.floorNormal = new THREE.Vector3(0, 0, 1);
    this.floorId = null;
    this.floorDist = 0;
    this.hasFloor = false;

    /** 本帧实际位移。动画层与调试要看「真的走了多少」,不是「想走多少」。 */
    this.lastDelta = new THREE.Vector3();
    /** 本帧最后一次阻挡命中(null = 没被挡)。 */
    this.lastHit = null;
  }

  // -------------------------------------------------------------------------
  // 查询
  // -------------------------------------------------------------------------

  /** UE IsMovingOnGround()。贴墙(custom)不算在地面上 —— 那是墙的地盘。 */
  isMovingOnGround() {
    return this.mode === MOVE_MODE.Walking;
  }

  /**
   * UE MeasureHeightAboveFloor():从胶囊中心向下打 halfHeight + 5000,
   * 再减掉 halfHeight 得到**脚底**离地高度。打空返回 Infinity(UE 是 BIG_NUMBER)。
   * 滑翔的 GlideMinHeight 判定用它。
   */
  heightAboveFloor() {
    const hit = this.world.lineTraceDown(this.position, this.halfHeight + DERIVED.FloorTraceDistance);
    if (!hit) return Infinity;
    return Math.max(0, hit.distance - this.halfHeight);
  }

  /**
   * 切物理模式。UE OnMovementModeChanged 在切进 Walking 时会把竖直速度丢掉
   * (走路状态下 Velocity.Z 没有意义,留着会在下一次 StepUp / 贴地时诈尸)。
   */
  setMode(mode, customMode = 0) {
    this.mode = mode;
    this.customMode = mode === MOVE_MODE.Custom ? customMode : CUSTOM_MOVE.None;
    if (mode === MOVE_MODE.Walking) this.velocity.z = 0;
    if (mode !== MOVE_MODE.Walking) {
      this.hasFloor = false;
      this.floorId = null;
      this.floorDist = 0;
    }
  }

  // -------------------------------------------------------------------------
  // Walking
  // -------------------------------------------------------------------------

  /**
   * UE PhysWalking 的等价物。
   * `accelDir` 是**世界空间输入方向,幅度已含推杆量**(|accelDir| 就是 UE 的 AnalogInputModifier);
   * `maxSpeed` 是 movement.js 算好的 GetMaxSpeed()。
   * opts: { orientToMovement, stepUp } —— 都可省。
   * 返回 { landed, blocked, floorNormal, steppedUp }。landed 恒 false:落地事件只由 moveFalling 报。
   */
  moveWalking(dt, accelDir, maxSpeed, opts = {}) {
    const out = { landed: false, blocked: false, floorNormal: null, steppedUp: false };
    if (!(dt > 0)) return out;

    const orient = opts.orientToMovement === undefined ? this.orientToMovement : opts.orientToMovement;
    const allowStep = opts.stepUp === undefined ? true : opts.stepUp;

    this._depenetrate();

    // UE MaintainHorizontalGroundVelocity:走路只在水平面里算速度
    this.velocity.z = 0;
    this._calcVelocity(dt, accelDir, maxSpeed, ENGINE.GroundFriction, ENGINE.BrakingDecelerationWalking, 1);

    // 位移沿**地面平面**走(UE ComputeGroundMovementDelta):
    // 上坡不掉速、下坡不弹起,这才是「贴地」的正主。bMaintainHorizontalGroundVelocity 默认 true,
    // 所以只补 z 不重新归一化 —— 上坡时实际速率会略大于水平速率,与 UE 一致。
    this._findFloorInto(_floor, FLOOR_SNAP_DIST);
    _wDelta.set(this.velocity.x * dt, this.velocity.y * dt, 0);
    if (_floor.found && _floor.normal.z > 0 && _floor.normal.z < 1) {
      _wDelta.z = -(_wDelta.x * _floor.normal.x + _wDelta.y * _floor.normal.y) / _floor.normal.z;
    }

    _wBefore.copy(this.position);
    const move = this._slideMove(_wDelta, allowStep, false);
    out.blocked = move.blocked;
    out.steppedUp = move.steppedUp;
    this.lastHit = move.hit;
    this.lastDelta.copy(this.position).sub(_wBefore);

    // UE PhysWalking 末尾:速度 = 实际位移 / dt。撞墙就真的停下,动画层与 MotionState
    // 看到的都是真速度。唯一例外是刚迈上台阶的那一帧 —— 位移里含 40 cm 竖直抬升,
    // 换算成速度是假的 4800 cm/s(UE 靠 bJustTeleported 跳过同一帧的改写)。
    if (!move.steppedUp) {
      this.velocity.x = this.lastDelta.x / dt;
      this.velocity.y = this.lastDelta.y / dt;
    }
    this.velocity.z = 0;

    // 重新确认脚下。没有可走地面 = 走出了平台边缘 → 交给 Falling。
    this._findFloorInto(_floor, FLOOR_SNAP_DIST);
    if (_floor.found) {
      this.hasFloor = true;
      this.floorNormal.copy(_floor.normal);
      this.floorId = _floor.id;
      this.floorDist = this._snapToFloor(_floor.dist);
      out.floorNormal = this.floorNormal.clone();
    } else {
      this.setMode(MOVE_MODE.Falling);
    }

    if (orient) this._orientToMovement(dt, accelDir);
    return out;
  }

  // -------------------------------------------------------------------------
  // Falling
  // -------------------------------------------------------------------------

  /**
   * UE PhysFalling 的等价物。`gravity` 是**已经乘过 GravityScale 的实际重力**(负值),
   * `airControl` 乘在输入加速度上。横向摩擦与横向制动都取 0
   * (UE 的 FallingLateralFriction / BrakingDecelerationFalling 默认就是 0)——
   * 所以空中松手不会掉速,冲刺跳的动量能一直带到落地。
   * 返回 { landed, blocked, floorNormal }。
   */
  moveFalling(dt, accelDir, maxSpeed, gravity = ENGINE.Gravity, airControl = ENGINE.AirControl) {
    const out = { landed: false, blocked: false, floorNormal: null };
    if (!(dt > 0)) return out;

    this._depenetrate();

    this._calcVelocity(dt, accelDir, maxSpeed, 0, 0, this._airControlWithBoost(airControl));
    this.velocity.z += gravity * dt;

    _wBefore.copy(this.position);
    _wDelta.copy(this.velocity).multiplyScalar(dt);
    // landingCheck = true:命中可走面立刻停下并落地,不再往切平面滑 —— 对应 UE 的 IsValidLandingSpot。
    const move = this._slideMove(_wDelta, false, true);
    out.blocked = move.blocked;
    this.lastHit = move.hit;
    this.lastDelta.copy(this.position).sub(_wBefore);

    if (move.landed) {
      // _slideMove 已经用 _findFloorInto 校验过落地点站得住,这里直接接住
      this.setMode(MOVE_MODE.Walking);
      out.landed = true;
      this._findFloorInto(_floor, FLOOR_SNAP_DIST);
      this.hasFloor = _floor.found;
      if (_floor.found) {
        this.floorNormal.copy(_floor.normal);
        this.floorId = _floor.id;
        this.floorDist = this._snapToFloor(_floor.dist);
        out.floorNormal = this.floorNormal.clone();
      }
    }

    // UE PerformMovement 在 StartNewPhysics 之后**无条件**调 PhysicsRotation ——
    // 所以空中也会朝输入方向转身。只在 walking 里转会让空中转身完全不跟手。
    if (this.orientToMovement) this._orientToMovement(dt, accelDir);
    return out;
  }

  /**
   * UE `BoostAirControl`:水平速度还很低时给一次空中控制的爆发,上限 1.0。
   * UE 只在「有横向输入」时才走 GetAirControl,所以无输入时不必算(也算不出差别)。
   */
  _airControlWithBoost(airControl) {
    if (!(airControl > 0)) return airControl;
    const speed2DSq = this.velocity.x * this.velocity.x + this.velocity.y * this.velocity.y;
    if (speed2DSq >= AIR_CONTROL_BOOST_SPEED * AIR_CONTROL_BOOST_SPEED) return airControl;
    return Math.min(1, AIR_CONTROL_BOOST_MULTIPLIER * airControl);
  }

  // -------------------------------------------------------------------------
  // Custom(三条贴墙轨道共用)—— PORT_SPEC §3.2
  // -------------------------------------------------------------------------

  /**
   * UE SafeMoveUpdatedComponent + SlideAlongSurface + QInterpTo 的合体。
   * 速度**直接给定**(贴墙轨道自己算好,不走加速度通道),朝向按 orientSpeed 指数插值到 targetQuat。
   * 结束时把 velocity 改写成「实际达成的位移 / dt」—— UE 原样如此,动画层要看到真实速度。
   * 返回 { blocked, hit, delta }。
   */
  safeMove(dt, desiredVelocity, targetQuat, orientSpeed = 0) {
    const out = { blocked: false, hit: null, delta: null };
    if (!(dt > 0)) return out;

    const dv = readVec(desiredVelocity);
    if (dv) this.velocity.set(dv.x, dv.y, dv.z);

    this._depenetrate();

    _wBefore.copy(this.position);
    _wDelta.copy(this.velocity).multiplyScalar(dt);
    const move = this._slideMove(_wDelta, false, false);
    out.blocked = move.blocked;
    out.hit = move.hit;
    this.lastHit = move.hit;
    this.lastDelta.copy(this.position).sub(_wBefore);
    out.delta = this.lastDelta;

    if (targetQuat !== undefined && targetQuat !== null) {
      const targetYaw = typeof targetQuat === 'number' ? targetQuat : yawFromQuat(targetQuat);
      // UE FMath::QInterpTo:alpha = clamp(speed * dt, 0, 1);speed <= 0 直接到位
      const alpha = orientSpeed > 0 ? Math.min(1, Math.max(0, orientSpeed * dt)) : 1;
      this.yaw = wrapDeg(this.yaw + wrapDeg(targetYaw - this.yaw) * alpha);
    }

    this.velocity.copy(this.lastDelta).divideScalar(dt);
    return out;
  }

  // -------------------------------------------------------------------------
  // 内部:速度
  // -------------------------------------------------------------------------

  /**
   * UE CalcVelocity 的水平面版本(竖直分量由重力 / 地面平面另外管)。
   *
   * 三段结构照抄 UE:
   *   a) 无输入 或 已超速 → ApplyVelocityBraking(摩擦 + 制动减速度)
   *   b) 有输入 → 摩擦只把速度**拽向**加速度方向:Velocity -= (Velocity - AccelDir*|V|) * min(dt*f, 1)
   *      速度与输入同向时这一项恒为 0,所以直线加速不受摩擦影响。
   *   c) 加上输入加速度,再钳到 maxSpeed × 输入幅度;
   *      **已经超速的不砍回来**(NewMaxSpeed 取当前速率)—— 冲刺跳落地不会被走速钳掉。
   *
   * 制动分支的摩擦要乘 BRAKING_FRICTION_FACTOR(UE ApplyVelocityBraking 的第一句),
   * 否则 700 cm/s 松手会滑 38 cm 而 UE 只滑 27.5 cm。
   * 另:UE 把制动切成 <= 1/33 s 的子步,本工程固定步长 1/120 恒小于它,故无差别。
   */
  _calcVelocity(dt, accelDir, maxSpeed, friction, braking, accelScale) {
    const a = readVec(accelDir, 0);
    const rawSize = a ? Math.hypot(a.x, a.y) : 0;
    // UE ScaleInputAcceleration:输入向量先钳到长度 1,再乘 MaxAcceleration
    const clampScale = rawSize > 1 ? 1 / rawSize : 1;
    const analog = Math.min(1, rawSize);
    const accelMag = ENGINE.MaxAcceleration * accelScale;
    let ax = 0;
    let ay = 0;
    if (analog > 0) {
      ax = a.x * clampScale * accelMag;
      ay = a.y * clampScale * accelMag;
    }
    const zeroAccel = ax === 0 && ay === 0;
    const maxSpd = Math.max(0, maxSpeed * analog);

    let vx = this.velocity.x;
    let vy = this.velocity.y;
    let speed = Math.hypot(vx, vy);

    const overMax = speed > maxSpd;
    if (zeroAccel || overMax) {
      const oldX = vx;
      const oldY = vy;
      // UE ApplyVelocityBraking:制动时摩擦先翻 BrakingFrictionFactor 倍
      const brakingFriction = Math.max(0, friction * BRAKING_FRICTION_FACTOR);
      if (speed > 0 && (brakingFriction > 0 || braking > 0)) {
        // Velocity += (-Friction * Velocity - Braking * unit(Velocity)) * dt
        const k = 1 - brakingFriction * dt - (braking * dt) / speed;
        vx = oldX * k;
        vy = oldY * k;
        // 不许反向:越过零点就停在零点
        if (vx * oldX + vy * oldY <= 0 || vx * vx + vy * vy <= MIN_SPEED_SQ) {
          vx = 0;
          vy = 0;
        }
      }
      speed = Math.hypot(vx, vy);
      // 超速被制动到 maxSpeed 以内、且输入还在往原方向推 → 停在 maxSpeed 而不是继续掉
      if (overMax && speed < maxSpd && ax * oldX + ay * oldY > 0 && speed > 0) {
        const s = maxSpd / speed;
        vx *= s;
        vy *= s;
        speed = maxSpd;
      }
    } else if (!zeroAccel && friction > 0) {
      const inv = 1 / Math.hypot(ax, ay);
      const f = Math.min(dt * friction, 1);
      vx -= (vx - ax * inv * speed) * f;
      vy -= (vy - ay * inv * speed) * f;
      speed = Math.hypot(vx, vy);
    }

    if (!zeroAccel) {
      const newMax = speed > maxSpd ? speed : maxSpd;
      vx += ax * dt;
      vy += ay * dt;
      const s2 = vx * vx + vy * vy;
      if (s2 > newMax * newMax && s2 > 0) {
        const s = newMax / Math.sqrt(s2);
        vx *= s;
        vy *= s;
      }
    }

    this.velocity.x = vx;
    this.velocity.y = vy;
  }

  /**
   * UE PhysicsRotation + ComputeOrientToMovementRotation。
   * 目标方向取 **Acceleration(输入方向)** 而不是速度:UE 原文就是
   * `DesiredRotation = Acceleration.GetSafeNormal().Rotation()`,加速度近零时**保持当前朝向**。
   * 两者在地面直线跑时同向、看不出区别,差别在两个地方:
   *   撞墙时速度被改写成 0 而输入还在推 ⇒ UE 仍然朝输入方向转;
   *   空中松开方向键 ⇒ UE 不转(用速度的话会一直被残余动量牵着)。
   * (PORT_SPEC §6.2 写的是「转向水平速度方向」,这里按 UE 原文取加速度 —— 差异已登记。)
   */
  _orientToMovement(dt, accelDir) {
    const a = readVec(accelDir, 0);
    const ax = a ? a.x : 0;
    const ay = a ? a.y : 0;
    if (ax * ax + ay * ay < MIN_INPUT_SQ) return;
    const target = Math.atan2(ay, ax) / DEG;
    const diff = wrapDeg(target - this.yaw);
    const step = ENGINE.RotationRateYaw * dt;
    this.yaw = wrapDeg(this.yaw + (Math.abs(diff) <= step ? diff : Math.sign(diff) * step));
  }

  // -------------------------------------------------------------------------
  // 内部:位移
  // -------------------------------------------------------------------------

  /** 起始就嵌进几何里 → 沿最浅推出方向顶出来。上游约定 position += normal * depth。 */
  _depenetrate() {
    for (let i = 0; i < MAX_DEPENETRATE_ITER; i++) {
      const ov = this.world.overlapCapsule(this.position, this.radius, this.halfHeight);
      if (!ov) return;
      this.position.addScaledVector(ov.normal, ov.depth + CONTACT_SKIN);
    }
  }

  /**
   * 推位移 + SlideAlongSurface。
   * `allowStepUp` 打开时,被**不可走**面挡住会先试台阶;`landingCheck` 打开时(Falling),
   * 命中可走面就停下并报 landed,不再滑。
   * 返回 { blocked, steppedUp, landed, hit }。
   */
  _slideMove(delta, allowStepUp, landingCheck) {
    const out = { blocked: false, steppedUp: false, landed: false, hit: null };
    _sRem.copy(delta);

    for (let i = 0; i < MAX_SLIDE_ITER; i++) {
      if (_sRem.lengthSq() < MIN_DELTA_SQ) break;
      _sEnd.copy(this.position).add(_sRem);
      const hit = this.world.capsuleSweep(this.position, _sEnd, this.radius, this.halfHeight);
      if (!hit) {
        this.position.copy(_sEnd);
        break;
      }

      out.blocked = true;
      out.hit = hit;

      if (hit.startPenetrating) {
        // 还没走就已经嵌着且在往里去:先解穿透,位移一分没消耗,下一轮重来
        this.position.addScaledVector(hit.normal, hit.depth + CONTACT_SKIN);
        continue;
      }

      this.position.addScaledVector(_sRem, hit.time);
      // 退开一层皮肤:collision.js 的 time 是下界,间隙可能正好 0
      this.position.addScaledVector(hit.normal, CONTACT_SKIN);
      _sRem.multiplyScalar(1 - hit.time);

      // UE IsValidLandingSpot:法线可走**还得站得住**。只擦到一根棱的时候法线可能碰巧可走,
      // 但脚下并没有一块能承住胶囊的面 —— 那就不算落地,继续沿面滑走(否则会卡在空中抽搐)。
      if (landingCheck && hit.normal.z >= ENGINE.WalkableFloorZ
        && this._findFloorInto(_floorB, FLOOR_SNAP_DIST).found) {
        out.landed = true;
        break;
      }
      if (allowStepUp && hit.normal.z < ENGINE.WalkableFloorZ && this._stepUp(hit, _sRem)) {
        out.steppedUp = true;
        continue;
      }

      // SlideAlongSurface:剩余位移投到命中面的切平面
      _sRem.addScaledVector(hit.normal, -_sRem.dot(hit.normal));
    }
    return out;
  }

  /**
   * UE StepUp 的等价物 —— 40 cm 迈过去 / 80 cm 迈不过去的那道线。
   *
   * UE 的做法是「上抬 → 前推 → 下探,下探到不可走面就回滚」。这里换了第三步:
   * **不做下探扫掠,改成在障碍另一侧打一条向下的线检测量顶面高度**,理由是本层的
   * 胶囊扫掠给的是几何上正确的**径向**接触法线 —— 胶囊落在盒顶棱上时法线是斜的(|n.z| 可能只有 0.5),
   * 照 UE 的「下探不可走就回滚」会把每一级台阶都否掉。UE 里不出现这个问题是因为 PhysX
   * 对盒扫掠报的是**面**法线,不是径向法线(UE 自己在 ComputeFloorDist 里也留了
   * 「扫掠法线不可走 → 退回中心线检测取面法线」这条后路,_findFloorInto 里同样照做了)。
   * 线检测拿到的是真正的顶面法线与高度,判据因此干净:
   *   顶面可走 且 抬升量 <= MaxStepHeight ⇒ 这是台阶。
   *
   * 失真条件:顶面窄于 STEP_PROBE_IN(2 cm)、或障碍顶面与侧面之间有倒角时,
   * 探针可能打到障碍后面的东西而错判。本关卡最薄的可迈物是 400 cm 见方的 Low_Step_*,不受影响。
   */
  _stepUp(hit, remaining) {
    const hx = remaining.x;
    const hy = remaining.y;
    const hlen = Math.hypot(hx, hy);
    if (hlen < 1e-6) return false;

    // UE PawnInitialFloorBaseZ:脚底所站的那个面的高度
    const footZ = this.position.z - this.halfHeight - (this.hasFloor ? this.floorDist : 0);

    // (1) 接触点本身就比一个台阶还高 → 一眼否掉。80 cm 那块砖死在这一句上。
    if (hit.point.z > footZ + ENGINE.MaxStepHeight + CONTACT_SKIN) return false;

    // (2) 量障碍另一侧的落脚面
    _probe[0] = hit.point.x + (hx / hlen) * STEP_PROBE_IN;
    _probe[1] = hit.point.y + (hy / hlen) * STEP_PROBE_IN;
    _probe[2] = footZ + ENGINE.MaxStepHeight + STEP_PROBE_MARGIN;
    const top = this.world.lineTraceDown(_probe, ENGINE.MaxStepHeight + STEP_PROBE_MARGIN * 2);
    // distance 0 = 探针起点就在盒里 ⇒ 障碍高过一个台阶(UE 的 bStartPenetrating 语义)
    if (!top || top.distance <= 0) return false;
    if (top.normal.z < ENGINE.WalkableFloorZ) return false;

    const rise = top.point.z - footZ;
    if (rise <= CONTACT_SKIN || rise > ENGINE.MaxStepHeight + CONTACT_SKIN) return false;

    // (3) 抬升。抬不动(头顶被压住)就放弃 —— 对应 UE「上抬扫掠 time 0 即失败」。
    _stepEnd.copy(this.position);
    _stepEnd.z += rise + CONTACT_SKIN;
    if (this.world.capsuleSweep(this.position, _stepEnd, this.radius, this.halfHeight)) return false;

    this.position.copy(_stepEnd);
    // 抬完脚底刚好落在台面上;剩余位移原样交回 _slideMove 继续推
    return true;
  }

  // -------------------------------------------------------------------------
  // 内部:地面
  // -------------------------------------------------------------------------

  /**
   * UE FindFloor / ComputeFloorDist 的等价物,结果写进 `out`(热路径不分配)。
   *
   * 两段式,与 UE 一致:
   *   1) 胶囊向下扫掠 snapDist。法线可走 → 就是它。
   *   2) 扫掠法线不可走(典型是踩在盒顶棱上,径向法线可能只有 |n.z| = 0.5)→
   *      退回**中心线检测**取真正的面法线。这条后路 UE 里叫 bLineTrace,
   *      没有它角色站在任何台面边缘都会被判成「脚下不可走」而掉下去。
   */
  _findFloorInto(out, snapDist) {
    _fFrom.copy(this.position);
    _fTo.set(_fFrom.x, _fFrom.y, _fFrom.z - snapDist);
    const hit = this.world.capsuleSweep(_fFrom, _fTo, this.radius, this.halfHeight);
    if (hit && hit.normal.z >= ENGINE.WalkableFloorZ) {
      out.found = true;
      out.dist = hit.startPenetrating ? 0 : hit.time * snapDist;
      out.normal = hit.normal;
      out.id = hit.id;
      out.lineTrace = false;
      return out;
    }

    const line = this.world.lineTraceDown(_fFrom, this.halfHeight + snapDist);
    if (line && line.distance > 0) {
      const gap = line.distance - this.halfHeight;
      if (gap <= snapDist + CONTACT_SKIN && line.normal.z >= ENGINE.WalkableFloorZ) {
        out.found = true;
        out.dist = Math.max(0, gap);
        out.normal = line.normal;
        out.id = line.id;
        out.lineTrace = true;
        return out;
      }
    }

    out.found = false;
    out.dist = Infinity;
    out.normal = null;
    out.id = null;
    out.lineTrace = false;
    return out;
  }

  /** 公开版:给 movement.js / 调试用,返回一次性对象。 */
  findFloor(snapDist = FLOOR_SNAP_DIST) {
    this._findFloorInto(_floor, snapDist);
    return {
      found: _floor.found,
      dist: _floor.dist,
      normal: _floor.normal ? _floor.normal.clone() : null,
      id: _floor.id,
      lineTrace: _floor.lineTrace,
    };
  }

  /**
   * 贴地:把胶囊压回脚底贴面(留一层皮肤)。
   * 用扫掠而不是直接减 z —— 中心线检测那条后路量到的面可能被别的东西挡着(站在棱上),
   * 直接减 z 会把角色塞进几何里。
   *
   * 简化:UE 用 MIN_FLOOR_DIST / MAX_FLOOR_DIST(1.9 / 2.4 cm)让胶囊常态悬空约 2 cm;
   * 这里直接贴到 0。差异只体现在离地高度读数与站立 z 上(94.02 vs UE 的 ~96),
   * 不影响任何状态判定。
   *
   * 返回压下去之后**剩余**的离面距离,给 StepUp 当抬升基准(压不下去时它不是 0)。
   */
  _snapToFloor(dist) {
    if (!(dist > CONTACT_SKIN)) return dist;
    const drop = dist - CONTACT_SKIN;
    _fTo.set(this.position.x, this.position.y, this.position.z - drop);
    const hit = this.world.capsuleSweep(this.position, _fTo, this.radius, this.halfHeight);
    const travel = hit && !hit.startPenetrating ? drop * hit.time : hit ? 0 : drop;
    this.position.z -= travel;
    return dist - travel;
  }
}

export default KinematicBody;
