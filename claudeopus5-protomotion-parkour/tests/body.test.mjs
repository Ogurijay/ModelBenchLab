// 引擎替身的无头回归:node tests/body.test.mjs(cwd = 仓库根)。
// 风格同 collision.test.mjs —— 不用测试框架,能手算的数字直接写死在断言里。
//
// 这一层的验收标准不是「看起来对」,而是**几条可以解析求解的曲线**:
//   直线加速时间 = maxSpeed / MaxAcceleration(摩擦项在同向时恒为 0,不该拖慢它);
//   刹停距离 = ∫v dt,v(t) 满足 dv/dt = -(GroundFriction × BrakingFrictionFactor)·v - BrakingDeceleration;
//   自由落体末速 = sqrt(2·g·h)。
// 加上两块砖的分水岭:Low_Step_40cm 必须迈过去,Low_Step_80cm 必须迈不过去。

import { CollisionWorld, createCourseWorld } from '../src/sim/collision.js';
import { KinematicBody } from '../src/sim/body.js';
import { ueRotatorToQuaternion } from '../src/levels/protoCourse.js';
import { CHARACTER, DERIVED, ENGINE, MOVE_MODE, TUNING } from '../src/sim/protoTypes.js';

let failures = 0;
const ok = (cond, name, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? ' — ' + extra : ''}`);
};
const section = (t) => console.log(`\n== ${t} ==`);

const R = CHARACTER.CapsuleRadius; // 42
const HH = CHARACTER.CapsuleHalfHeight; // 94
const DT = DERIVED.FixedStep; // 1/120
const G = ENGINE.Gravity; // -1960

const course = createCourseWorld();

/**
 * 最小驱动器 —— 只做 movement.js 会做的那一件事:按物理模式派发。
 * 记录轨迹给断言用;每步顺手查一次穿透,「全程不穿墙」是所有用例的公共前提。
 */
function drive(body, world, seconds, { accelDir = [0, 0, 0], maxSpeed = TUNING.RunSpeed, onStep } = {}) {
  const steps = Math.round(seconds / DT);
  const log = {
    landed: 0, blocked: 0, maxPenetration: 0, minZ: Infinity, maxZ: -Infinity,
    maxWalkZ: -Infinity, maxX: -Infinity, minX: Infinity, maxSpeed2D: 0, minVz: 0, samples: 0,
  };
  for (let i = 0; i < steps; i++) {
    const res = body.mode === MOVE_MODE.Walking
      ? body.moveWalking(DT, accelDir, maxSpeed)
      : body.moveFalling(DT, accelDir, maxSpeed, G, ENGINE.AirControl);
    if (res.landed) log.landed++;
    if (res.blocked) log.blocked++;
    const ov = world.overlapCapsule(body.position, body.radius, body.halfHeight);
    if (ov && ov.depth > log.maxPenetration) log.maxPenetration = ov.depth;
    log.minZ = Math.min(log.minZ, body.position.z);
    log.maxZ = Math.max(log.maxZ, body.position.z);
    // 「站到了多高」只能看 walking 的帧 —— 传送后的那段下坠不算
    if (body.mode === MOVE_MODE.Walking) log.maxWalkZ = Math.max(log.maxWalkZ, body.position.z);
    log.maxX = Math.max(log.maxX, body.position.x);
    log.minX = Math.min(log.minX, body.position.x);
    log.maxSpeed2D = Math.max(log.maxSpeed2D, Math.hypot(body.velocity.x, body.velocity.y));
    log.minVz = Math.min(log.minVz, body.velocity.z);
    log.samples++;
    if (onStep) onStep((i + 1) * DT, body, res, log);
  }
  return log;
}

/** 放到指定位置、清速度、切 Falling —— 与自检的传送语义一致。 */
function place(body, x, y, z, yaw = 0) {
  body.position.set(x, y, z);
  body.velocity.set(0, 0, 0);
  body.yaw = yaw;
  body.setMode(MOVE_MODE.Falling);
}

const makeBody = (world, x, y, z) =>
  new KinematicBody(world, { position: [x, y, z], radius: R, halfHeight: HH });

// ─────────────────────────────────────────────────────────────────────────────
section('1. 从 z=150 落地:停在 z = halfHeight,不抖不沉');
{
  const body = makeBody(course, 0, 0, 150);
  const log = drive(body, course, 3.0);
  ok(log.landed === 1, '恰好报告一次落地', `${log.landed} 次`);
  ok(body.mode === MOVE_MODE.Walking, '落地后物理模式 = walking', body.mode);
  ok(Math.abs(body.position.z - HH) < 0.1, `静止高度 = ${HH}`, body.position.z.toFixed(4));
  ok(log.maxPenetration === 0, '全程无穿透', log.maxPenetration.toFixed(6));
  ok(log.minZ >= HH - 0.05, '从未沉进地面', log.minZ.toFixed(4));

  // 落地后 2 秒的抖动:z 的极差与竖直速度都必须收敛到 0
  let jitter = 0;
  let maxVz = 0;
  drive(body, course, 2.0, {
    onStep: (t, b) => {
      jitter = Math.max(jitter, Math.abs(b.position.z - HH));
      maxVz = Math.max(maxVz, Math.abs(b.velocity.z));
    },
  });
  ok(jitter < 0.05, '站立 2 s 内 z 的偏移 < 0.05 cm', jitter.toFixed(6));
  ok(maxVz === 0, '站立期间竖直速度恒为 0', maxVz.toFixed(6));
  ok(body.isMovingOnGround(), 'isMovingOnGround() = true');
  ok(Math.abs(body.heightAboveFloor()) < 0.05, 'heightAboveFloor() ≈ 0', body.heightAboveFloor().toFixed(4));
  ok(body.floorId === 'Floor', '脚下地面 = Floor', String(body.floorId));
  ok(Math.abs(body.floorNormal.z - 1) < 1e-9, '地面法线 = (0,0,1)', body.floorNormal.z.toFixed(6));
}

// ─────────────────────────────────────────────────────────────────────────────
section('2. 平地全速跑:稳态速度 = maxSpeed,加速时间 = maxSpeed / MaxAcceleration');
{
  const body = makeBody(course, -2000, 1000, HH);
  body.setMode(MOVE_MODE.Walking);
  const target = TUNING.RunSpeed; // 700
  // 摩擦项 (V - AccelDir·|V|) 在速度与输入同向时恒为 0 ⇒ 直线加速是**匀加速**,
  // 到达 maxSpeed 的时间严格是 700 / 3000 = 0.2333 s,不是指数逼近。
  const expectT = target / ENGINE.MaxAcceleration;
  let reachedAt = -1;
  drive(body, course, 1.5, {
    accelDir: [1, 0, 0],
    maxSpeed: target,
    onStep: (t, b) => {
      const s = Math.hypot(b.velocity.x, b.velocity.y);
      if (reachedAt < 0 && s >= target * 0.999) reachedAt = t;
    },
  });
  const speed = Math.hypot(body.velocity.x, body.velocity.y);
  ok(Math.abs(speed - target) / target < 0.02, `稳态速度 = ${target} (±2%)`, speed.toFixed(3));
  ok(reachedAt > 0 && Math.abs(reachedAt - expectT) <= 2 * DT,
    `到达全速的时间 = ${expectT.toFixed(4)} s`, reachedAt.toFixed(4));
  ok(Math.abs(body.velocity.y) < 1e-6 && Math.abs(body.velocity.z) < 1e-9, '纯 +X 输入不产生侧向/竖直速度');
  ok(Math.abs(body.position.z - HH) < 0.1, '全速跑时仍贴着地面', body.position.z.toFixed(4));
  ok(body.mode === MOVE_MODE.Walking, '跑动中不会误判成 falling', body.mode);
  ok(Math.abs(body.yaw) < 1e-9, '朝 +X 跑,yaw 保持 0', body.yaw.toFixed(4));

  // 轻推杆(0.35):UE AnalogInputModifier 把上限也按幅度缩 —— 260 × 0.35 = 91
  const light = makeBody(course, -2000, 1200, HH);
  light.setMode(MOVE_MODE.Walking);
  drive(light, course, 1.5, { accelDir: [0.35, 0, 0], maxSpeed: TUNING.WalkSpeed });
  const lightSpeed = Math.hypot(light.velocity.x, light.velocity.y);
  const lightMax = TUNING.WalkSpeed * 0.35;
  ok(Math.abs(lightSpeed - lightMax) / lightMax < 0.02,
    `轻推杆稳态 = WalkSpeed × 0.35 = ${lightMax.toFixed(1)}`, lightSpeed.toFixed(3));

  // 朝向跟随:输入拐到 +Y,yaw 以 720 °/s 转过去
  const turn = makeBody(course, -2000, 1400, HH);
  turn.setMode(MOVE_MODE.Walking);
  drive(turn, course, 0.05, { accelDir: [0, 1, 0], maxSpeed: target });
  ok(Math.abs(turn.yaw - ENGINE.RotationRateYaw * 0.05) < 1e-6,
    `0.05 s 内 yaw 正好转 ${ENGINE.RotationRateYaw * 0.05}°`, turn.yaw.toFixed(4));
  drive(turn, course, 0.5, { accelDir: [0, 1, 0], maxSpeed: target });
  ok(Math.abs(turn.yaw - 90) < 1e-6, '转到位后停在 90°', turn.yaw.toFixed(4));
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. 松开输入:刹停(摩擦要按 BrakingFrictionFactor 翻倍)');
{
  const body = makeBody(course, -2000, 1000, HH);
  body.setMode(MOVE_MODE.Walking);
  drive(body, course, 1.0, { accelDir: [1, 0, 0], maxSpeed: TUNING.RunSpeed });
  const v0 = Math.hypot(body.velocity.x, body.velocity.y);
  const x0 = body.position.x;

  // dv/dt = -f·v - b ⇒ v(t) = (v0 + b/f)e^{-ft} - b/f
  //   T = ln(1 + f·v0/b) / f,   S = (v0 + b/f)(1 - e^{-fT})/f - (b/f)·T
  // f **不是** GroundFriction 而是它的两倍:UE ApplyVelocityBraking 的第一句把摩擦
  // 乘上 BrakingFrictionFactor(引擎默认 2.0,bUseSeparateBrakingFriction 默认 false)。
  // 这个 2 倍是硬要求,不是余量 —— 少了它 700 cm/s 松手会滑 38 cm,UE 只滑 27.5 cm。
  const BRAKING_FRICTION_FACTOR = 2.0;
  const f = ENGINE.GroundFriction * BRAKING_FRICTION_FACTOR; // 8 × 2 = 16
  const b = ENGINE.BrakingDecelerationWalking; // 2400
  const T = Math.log(1 + (f * v0) / b) / f;
  const S = ((v0 + b / f) * (1 - Math.exp(-f * T))) / f - (b / f) * T;

  let stopT = -1;
  drive(body, course, 1.0, {
    accelDir: [0, 0, 0],
    maxSpeed: TUNING.RunSpeed,
    onStep: (t, bd) => {
      if (stopT < 0 && Math.hypot(bd.velocity.x, bd.velocity.y) === 0) stopT = t;
    },
  });
  const dist = body.position.x - x0;
  ok(stopT > 0 && Math.abs(stopT - T) < 3 * DT, `刹停时间 ≈ ${T.toFixed(4)} s`, stopT.toFixed(4));

  // 同一条递推在这里**独立写第二遍**(v -= (f·v + b)·dt,位移用更新后的速度),
  // 用它做主判据而不是用解析解:f = 16 时单步 Δv 高达 113 cm/s,固定步长的离散误差
  // 本来就有十几个百分点,拿解析解卡百分比只能得到一条又松又没道理的界。
  let vRef = v0;
  let sRef = 0;
  let tRef = 0;
  for (let i = 0; i < 1000 && vRef > 0; i++) {
    const vNext = vRef - (f * vRef + b) * DT;
    vRef = vNext <= 0 ? 0 : vNext;
    sRef += vRef * DT;
    tRef = (i + 1) * DT;
  }
  ok(Math.abs(dist - sRef) < 0.02, `刹停距离 = 同一递推的独立复算 ${sRef.toFixed(3)} cm`, dist.toFixed(3));
  ok(Math.abs(stopT - tRef) < 1e-9, `  停下的帧号也一致(${tRef.toFixed(4)} s)`, stopT.toFixed(4));
  // 解析解只当上界:半隐式积分(位移用更新后的速度)系统性地少走,不会多走。
  ok(dist < S, `比解析解 ${S.toFixed(2)} cm 短(离散积分必然如此)`, dist.toFixed(3));
  // 纯 BrakingDeceleration(不叠摩擦)会滑 v0²/2b;摩擦必须把它明显拉短
  ok(dist < (v0 * v0) / (2 * b), `比只有制动减速度时更短(< ${((v0 * v0) / (2 * b)).toFixed(1)} cm)`, dist.toFixed(3));
  ok(Math.hypot(body.velocity.x, body.velocity.y) === 0, '停下后速度精确归零');
}

// ─────────────────────────────────────────────────────────────────────────────
section('4. 迈过 Low_Step_40cm(顶面 z=40 < MaxStepHeight=55)');
{
  // 砖块:中心 (1200,-800,20)、半长 (200,200,20) ⇒ x∈[1000,1400]、顶面 z=40
  const body = makeBody(course, 600, -800, 150);
  place(body, 600, -800, 150);
  let onTop = 0;
  let onTopX = -Infinity;
  const log = drive(body, course, 2.5, {
    accelDir: [1, 0, 0],
    maxSpeed: TUNING.RunSpeed,
    onStep: (t, b) => {
      // 站在砖顶:z = 40 + 94 = 134,且轴心确实在砖的范围内
      if (b.mode === MOVE_MODE.Walking && Math.abs(b.position.z - (40 + HH)) < 1
        && b.position.x > 1050 && b.position.x < 1400) {
        onTop++;
        onTopX = Math.max(onTopX, b.position.x);
      }
    },
  });
  ok(onTop > 0, '曾经站上砖顶 z ≈ 134', `${onTop} 帧,最远 x = ${onTopX.toFixed(1)}`);
  ok(onTopX > 1350, '在砖顶上一路走到远端(继续前进而不是卡住)', onTopX.toFixed(1));
  ok(log.maxX > 1600, `越过砖块继续前进(x 最大 ${log.maxX.toFixed(1)} > 1600)`);
  ok(log.maxPenetration < 0.05, '全程几乎无穿透', log.maxPenetration.toFixed(6));
  ok(Math.abs(body.position.z - HH) < 0.5, '走下砖块后回到地面 z ≈ 94', body.position.z.toFixed(3));
  // 迈台阶不该掉速:UE 靠 bJustTeleported 跳过「速度 = 位移/dt」的改写
  ok(log.maxSpeed2D <= TUNING.RunSpeed * 1.001 && log.maxSpeed2D > TUNING.RunSpeed * 0.98,
    '峰值水平速度仍是 RunSpeed 量级', log.maxSpeed2D.toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. 迈不过 Low_Step_80cm(顶面 z=80 > MaxStepHeight=55)');
{
  // 砖块:中心 (1200,-200,40)、半长 (200,200,40) ⇒ x∈[1000,1400]、顶面 z=80
  const body = makeBody(course, 600, -200, 150);
  place(body, 600, -200, 150);
  const log = drive(body, course, 2.5, { accelDir: [1, 0, 0], maxSpeed: TUNING.RunSpeed });
  ok(log.maxX < 1000 - R + 1, `被挡在砖前(x 最大 ${log.maxX.toFixed(2)} < ${1000 - R + 1})`);
  ok(log.maxWalkZ < HH + 1, `从未被抬起来(站立 z 最大 ${log.maxWalkZ.toFixed(2)} < ${HH + 1})`);
  ok(log.blocked > 100, '持续报告被阻挡', `${log.blocked} 帧`);
  ok(body.mode === MOVE_MODE.Walking, '撞墙不会误判成 falling', body.mode);
  ok(Math.hypot(body.velocity.x, body.velocity.y) < 1,
    '速度被改写成实际位移/dt ⇒ 撞死后归零(MotionState 才不会一直报 Running)',
    Math.hypot(body.velocity.x, body.velocity.y).toFixed(4));
  ok(log.maxPenetration < 0.05, '没有被挤进砖里', log.maxPenetration.toFixed(6));

  // 反过来验一次分水岭本身:同一块砖降到 55 cm 就该迈得过去
  const w = new CollisionWorld();
  w.addBox({ id: 'Floor', center: [0, 0, -100], halfSize: [20000, 20000, 100] });
  w.addBox({ id: 'Step55', center: [1200, 0, 27.5], halfSize: [200, 200, 27.5] });
  const b55 = makeBody(w, 600, 0, HH);
  b55.setMode(MOVE_MODE.Walking);
  let top55 = 0;
  drive(b55, w, 2.0, {
    accelDir: [1, 0, 0],
    maxSpeed: TUNING.RunSpeed,
    onStep: (t, b) => {
      if (b.mode === MOVE_MODE.Walking && Math.abs(b.position.z - (55 + HH)) < 1 && b.position.x > 1050) top55++;
    },
  });
  ok(top55 > 0, '恰好 55 cm(= MaxStepHeight)的台阶迈得上去', `${top55} 帧`);

  const w2 = new CollisionWorld();
  w2.addBox({ id: 'Floor', center: [0, 0, -100], halfSize: [20000, 20000, 100] });
  w2.addBox({ id: 'Step57', center: [1200, 0, 28.5], halfSize: [200, 200, 28.5] });
  const b57 = makeBody(w2, 600, 0, HH);
  b57.setMode(MOVE_MODE.Walking);
  const log57 = drive(b57, w2, 2.0, { accelDir: [1, 0, 0], maxSpeed: TUNING.RunSpeed });
  ok(log57.maxZ < HH + 1, '57 cm(> MaxStepHeight)的台阶迈不上去', log57.maxZ.toFixed(2));
}

// ─────────────────────────────────────────────────────────────────────────────
section('6. 6000 cm 高空自由落体');
{
  const body = makeBody(course, 0, 0, 6000);
  place(body, 0, 0, 6000);
  // 落差 6000 - 94 = 5906 ⇒ 末速 sqrt(2·1960·5906) ≈ 4812 cm/s,落地耗时 ≈ 2.455 s
  const vTerm = -Math.sqrt(2 * -G * (6000 - HH));
  const tFall = Math.sqrt((2 * (6000 - HH)) / -G);
  let landAt = -1;
  const log = drive(body, course, 4.0, {
    onStep: (t, b, res) => { if (res.landed && landAt < 0) landAt = t; },
  });
  ok(log.landed === 1, '恰好落地一次', `${log.landed} 次`);
  ok(landAt > 0 && Math.abs(landAt - tFall) < 0.05, `落地时刻 ≈ ${tFall.toFixed(3)} s`, landAt.toFixed(3));
  ok(Math.abs(log.minVz - vTerm) / -vTerm < 0.02, `峰值下降速度 ≈ ${vTerm.toFixed(0)} cm/s (±2%)`, log.minVz.toFixed(1));
  ok(Math.abs(body.position.z - HH) < 0.1, `落定在 z = ${HH}`, body.position.z.toFixed(4));
  ok(log.minZ >= HH - 0.05, '一步 40 cm 的末段也没穿进地板', log.minZ.toFixed(4));
  ok(log.maxPenetration === 0, '全程无穿透', log.maxPenetration.toFixed(6));
  ok(body.velocity.z === 0, '落地后竖直速度归零', body.velocity.z.toFixed(6));

  // 极端单步位移:20000 cm/s 横飞 ⇒ 一步 167 cm,远超 Climb_10m 的 100 cm 厚度。
  // 保守推进不靠子步长,所以这一步也必须停在墙前而不是穿过去。
  const fast = makeBody(course, -1500, -200, 300);
  place(fast, -1500, -200, 300);
  fast.velocity.set(-20000, 0, 0);
  const fastLog = drive(fast, course, 0.5, { maxSpeed: TUNING.SprintSpeed });
  ok(fast.position.x > -3150 - R - 1, '一步 167 cm 横撞 100 cm 厚的墙:停在墙前,没穿过去',
    fast.position.x.toFixed(2));
  ok(fastLog.maxPenetration < 0.05, '  全程无穿透', fastLog.maxPenetration.toFixed(6));
}

// ─────────────────────────────────────────────────────────────────────────────
section('6b. 空中:AirControlBoost 与朝向跟随');
{
  // UE BoostAirControl:水平速度 < AirControlBoostVelocityThreshold(25)时空中控制翻倍并钳到 1。
  // 所以静止起跳的头两帧横向加速度是 3000 × min(1, 2×0.45) = 2700,之后才回落到 3000 × 0.45 = 1350。
  const boost = makeBody(course, 0, 0, 6000);
  place(boost, 0, 0, 6000);
  const dv = [];
  drive(boost, course, 0.1, {
    accelDir: [0, 1, 0],
    maxSpeed: TUNING.SprintSpeed,
    onStep: (t, b) => dv.push(b.velocity.y),
  });
  const boosted = ENGINE.MaxAcceleration * Math.min(1, 2 * ENGINE.AirControl) * DT; // 22.5
  const plain = ENGINE.MaxAcceleration * ENGINE.AirControl * DT; // 11.25
  ok(Math.abs(dv[0] - boosted) < 1e-9, `第 1 帧横向 Δv = MaxAccel × min(1, 2×AirControl) × dt = ${boosted}`,
    dv[0].toFixed(4));
  ok(Math.abs(dv[1] - dv[0] - boosted) < 1e-9, `  第 2 帧仍在提升区(v = ${boosted} < 25)`,
    (dv[1] - dv[0]).toFixed(4));
  ok(Math.abs(dv[2] - dv[1] - plain) < 1e-9,
    `  第 3 帧速度已过 25 ⇒ 回落到 MaxAccel × AirControl × dt = ${plain}`, (dv[2] - dv[1]).toFixed(4));

  // UE PerformMovement 无条件调 PhysicsRotation ⇒ 空中也按 RotationRateYaw 朝输入方向转。
  const turnAir = makeBody(course, 0, 0, 6000);
  place(turnAir, 0, 0, 6000);
  ok(turnAir.mode === MOVE_MODE.Falling, '空中转身用例确实处于 falling', turnAir.mode);
  drive(turnAir, course, 0.05, { accelDir: [0, 1, 0], maxSpeed: TUNING.SprintSpeed });
  ok(Math.abs(turnAir.yaw - ENGINE.RotationRateYaw * 0.05) < 1e-6,
    `空中 0.05 s 内 yaw 同样转 ${ENGINE.RotationRateYaw * 0.05}°`, turnAir.yaw.toFixed(4));

  // 加速度近零时保持当前朝向(UE ComputeOrientToMovementRotation 的第一句),
  // 而不是被残余动量牵着转 —— 这是「取加速度而不是取速度」唯一能看出差别的地方。
  const keep = makeBody(course, 0, 0, 6000);
  place(keep, 0, 0, 6000);
  keep.yaw = 33;
  keep.velocity.set(0, 500, 0);
  drive(keep, course, 0.2, { accelDir: [0, 0, 0], maxSpeed: TUNING.SprintSpeed });
  ok(keep.yaw === 33, '无输入时朝向不动(哪怕速度朝着 +Y)', keep.yaw.toFixed(4));
}

// ─────────────────────────────────────────────────────────────────────────────
section('7. safeMove:贴着 Climb_10m 的面竖直上推');
{
  // Climb_10m:中心 (-3200,-200,500)、半长 (50,500,500) ⇒ +X 面在 x = -3150,顶面 z = 1000
  const body = makeBody(course, -3107, -200, 300);
  body.setMode(MOVE_MODE.Custom, 2);
  const normal = { x: 1, y: 0, z: 0 };
  // TickWallShared:Velocity = desired - normal × WallStickForce(恒定向内吸附)
  const desired = {
    x: -normal.x * TUNING.WallStickForce,
    y: 0,
    z: TUNING.ClimbUpSpeed,
  };
  const targetYaw = 180; // 正面朝 -normal
  const steps = Math.round(1.0 / DT);
  let maxPen = 0;
  let minVzUp = Infinity;
  let leftWall = 0;
  for (let i = 0; i < steps; i++) {
    body.safeMove(DT, desired, targetYaw, TUNING.WallOrientSpeed);
    const ov = course.overlapCapsule(body.position, R, HH);
    if (ov && ov.depth > maxPen) maxPen = ov.depth;
    minVzUp = Math.min(minVzUp, body.velocity.z);
    // 贴墙:胶囊表面离墙面不超过 1 cm
    const gap = body.position.x - (-3150) - R;
    if (gap > 1 || gap < -0.05) leftWall++;
  }
  ok(Math.abs(body.position.z - (300 + TUNING.ClimbUpSpeed)) < 1,
    `1 s 上滑 ClimbUpSpeed = ${TUNING.ClimbUpSpeed} cm`, body.position.z.toFixed(3));
  ok(maxPen < 0.05, '没有嵌进墙里', maxPen.toFixed(6));
  ok(leftWall === 0, '全程贴在墙面 1 cm 以内(吸附力被切平面吸收,不产生穿透)', `${leftWall} 帧脱离`);
  ok(Math.abs(minVzUp - TUNING.ClimbUpSpeed) < 1e-6,
    '竖直分量不被墙面吃掉(SlideAlongSurface 只吃掉法向那一份)', minVzUp.toFixed(4));
  ok(Math.abs(body.velocity.x) < 1, '改写后的速度里几乎没有 X 分量(实际没往墙里走)', body.velocity.x.toFixed(4));
  ok(Math.abs(body.yaw - targetYaw) < 1, `yaw 按 QInterpTo(speed=${TUNING.WallOrientSpeed}) 收敛到 ${targetYaw}°`,
    body.yaw.toFixed(3));

  // QInterpTo 的第一帧步长必须精确:alpha = clamp(speed·dt, 0, 1)
  const q = makeBody(course, 0, 0, 500);
  q.setMode(MOVE_MODE.Custom, 2);
  q.yaw = 0;
  q.safeMove(DT, { x: 0, y: 0, z: 0 }, 180, TUNING.WallOrientSpeed);
  ok(Math.abs(q.yaw - 180 * TUNING.WallOrientSpeed * DT) < 1e-9,
    `单帧 yaw 插值 = 180 × ${TUNING.WallOrientSpeed} × dt = ${(180 * TUNING.WallOrientSpeed * DT).toFixed(4)}°`,
    q.yaw.toFixed(6));
  ok(Math.abs(q.velocity.length()) < 1e-9, '零速度 safeMove 后速度仍为 0(位移/dt = 0)');
}

// ─────────────────────────────────────────────────────────────────────────────
section('8. 斜面可走性:cos(倾角) 与 WalkableFloorZ 的分界');
{
  // 造两块自带斜顶的板:pitch A 把局部 +Z 面法线转成 (sinA, 0, cosA) ⇒ n.z = cos A。
  // WalkableFloorZ = cos50° = 0.6428,所以 30° 可走、60° 不可走。
  const ramp = (deg) => {
    const w = new CollisionWorld();
    w.addBox({
      id: `Ramp_${deg}`,
      center: [0, 0, 0],
      halfSize: [800, 800, 100],
      quat: ueRotatorToQuaternion(deg, 0, 0),
    });
    return w;
  };

  {
    const w = ramp(30);
    const body = makeBody(w, 0, 0, 600);
    place(body, 0, 0, 600);
    const log = drive(body, w, 1.5);
    ok(body.mode === MOVE_MODE.Walking, '30° 斜面(n.z = 0.866 >= 0.6428)→ 落地并保持 walking', body.mode);
    ok(log.landed === 1, '  报告了一次落地');
    ok(Math.abs(body.floorNormal.z - Math.cos(30 * Math.PI / 180)) < 1e-6,
      '  地面法线 z = cos30°', body.floorNormal.z.toFixed(6));
    ok(log.maxPenetration < 0.05, '  无穿透', log.maxPenetration.toFixed(6));
  }

  {
    const w = ramp(60);
    const body = makeBody(w, 0, 0, 600);
    place(body, 0, 0, 600);
    let everWalking = 0;
    const log = drive(body, w, 1.5, {
      onStep: (t, b) => { if (b.mode === MOVE_MODE.Walking) everWalking++; },
    });
    ok(everWalking === 0, '60° 斜面(n.z = 0.5 < 0.6428)→ 从不进入 walking', `${everWalking} 帧`);
    ok(log.landed === 0, '  从不报告落地');
    ok(body.mode === MOVE_MODE.Falling, '  始终留在 falling', body.mode);
    ok(body.position.z < 0, '  沿斜面滑落并继续下坠', body.position.z.toFixed(1));
    ok(log.maxPenetration < 0.05, '  滑落全程无穿透', log.maxPenetration.toFixed(6));
  }

  // 站在可走地面上、把速度指向不可走的立面:必须仍算 walking(不能被墙面法线带成 falling)
  const wall = makeBody(course, -3107, -200, HH);
  wall.setMode(MOVE_MODE.Walking);
  const wallLog = drive(wall, course, 1.0, { accelDir: [-1, 0, 0], maxSpeed: TUNING.RunSpeed });
  ok(wall.mode === MOVE_MODE.Walking, '贴着立墙推 1 s 仍是 walking', wall.mode);
  ok(wall.position.x > -3150 - R - 1, '  没被推进墙里', wall.position.x.toFixed(3));
  ok(wallLog.maxPenetration < 0.05, '  无穿透', wallLog.maxPenetration.toFixed(6));

  // 关卡里 Angle_30deg 的**顶面**其实是可走的(n.z = cos30° = 0.866):
  // 源脚本传的是 Pitch,而那三块板的大面法线本来就朝 ±Y —— 见 protoCourse.js 的注释。
  // 记在这里以免后人误把它当成「不可走斜面」的用例。
  const top = course.lineTraceDown([1200, 4200, 5000], 5000);
  ok(!!top && top.id === 'Angle_30deg' && top.normal.z > ENGINE.WalkableFloorZ,
    'Angle_30deg 的顶面按几何是**可走**的(cos30° > cos50°),不能当不可走斜面用',
    top ? top.normal.z.toFixed(4) : 'null');
}

// ─────────────────────────────────────────────────────────────────────────────
section('9. 杂项:模式切换与边界输入');
{
  const body = makeBody(course, 0, 0, HH);
  body.setMode(MOVE_MODE.Walking);
  ok(body.moveWalking(0, [1, 0, 0], TUNING.RunSpeed).blocked === false, 'dt = 0 不做任何事');
  ok(body.position.z === HH, '  位置不变');

  // 起始就嵌在地板里 → 第一帧就被顶出来
  body.position.set(0, 0, HH - 10);
  body.moveWalking(DT, [0, 0, 0], TUNING.RunSpeed);
  ok(Math.abs(body.position.z - HH) < 0.1, '陷入地面 10 cm → 一帧解穿透并贴回 94', body.position.z.toFixed(4));

  // 走出平台边缘 → 转 falling(贴地窗口只有 2.4 cm,不会把人硬拽在空中)
  // Glide_LandingPad:中心 (3000,6000,25)、半长 (1000,1000,25) ⇒ x∈[2000,4000]、顶面 z=50
  const edge = makeBody(course, 3500, 6000, 50 + HH);
  edge.setMode(MOVE_MODE.Walking);
  ok(edge.floorId === null, '刚放上去还没查过地面');
  drive(edge, course, 0.02, { accelDir: [1, 0, 0], maxSpeed: TUNING.SprintSpeed });
  ok(edge.floorId === 'Glide_LandingPad', '站在落点板上', String(edge.floorId));
  drive(edge, course, 1.2, { accelDir: [1, 0, 0], maxSpeed: TUNING.SprintSpeed });
  ok(edge.position.z < 50 + HH - 1, '冲出落点板边缘后掉了下去', edge.position.z.toFixed(2));
  ok(Math.abs(edge.position.z - HH) < 0.2, '  落到地面 z ≈ 94', edge.position.z.toFixed(3));

  // setMode 的副作用:切进 walking 丢掉竖直速度(UE OnMovementModeChanged)
  const m = makeBody(course, 0, 0, 500);
  m.velocity.set(100, 0, 500);
  m.setMode(MOVE_MODE.Walking);
  ok(m.velocity.z === 0 && m.velocity.x === 100, '切进 walking 只丢竖直速度');
  m.setMode(MOVE_MODE.Custom, 1);
  ok(m.mode === MOVE_MODE.Custom && m.customMode === 1, 'setMode(custom, 1) 记住子模式');
  ok(m.isMovingOnGround() === false, '  custom 不算在地面上');
  m.setMode(MOVE_MODE.Falling);
  ok(m.customMode === 0, '  离开 custom 时子模式归零');

  // heightAboveFloor:打空返回 Infinity
  const far = makeBody(course, 30000, 0, 500);
  ok(far.heightAboveFloor() === Infinity, '场地之外 heightAboveFloor() = Infinity');
  const high = makeBody(course, 0, 0, 3000);
  ok(Math.abs(high.heightAboveFloor() - (3000 - HH)) < 1e-9,
    'heightAboveFloor() = 中心高度 - halfHeight', high.heightAboveFloor().toFixed(4));
}

// ─────────────────────────────────────────────────────────────────────────────
section('10. 随机压力测试:200 组 × 1.5 s,不穿透 / 不出 NaN / 不沉底');
{
  // 随机初速可以达到 1500 cm/s 水平 + 900 cm/s 竖直,再叠重力 —— 单步位移能到 40 cm 以上,
  // 正好把「保守推进 + 解穿透 + 滑动 + 台阶」这一串在各种入射角下都压一遍。
  let seed = 20260803;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let nan = 0;
  let penFrames = 0;
  let worst = 0;
  let sunk = 0;
  const CASES = 200;
  for (let c = 0; c < CASES; c++) {
    const body = makeBody(course, rnd() * 14000 - 7000, rnd() * 14000 - 7000, 200 + rnd() * 3000);
    body.setMode(MOVE_MODE.Falling);
    body.velocity.set((rnd() * 2 - 1) * 1500, (rnd() * 2 - 1) * 1500, (rnd() * 2 - 1) * 900);
    const dir = [rnd() * 2 - 1, rnd() * 2 - 1, 0];
    drive(body, course, 1.5, {
      accelDir: dir,
      maxSpeed: TUNING.SprintSpeed,
      onStep: (t, b) => {
        const sum = b.position.x + b.position.y + b.position.z
          + b.velocity.x + b.velocity.y + b.velocity.z + b.yaw;
        if (!Number.isFinite(sum)) nan++;
        const ov = course.overlapCapsule(b.position, R, HH);
        if (ov && ov.depth > 0.05) { penFrames++; worst = Math.max(worst, ov.depth); }
        // 站在地面范围内就不该沉到地板以下
        if (b.mode === MOVE_MODE.Walking && b.position.z < HH - 1
          && Math.abs(b.position.x) < 19000 && Math.abs(b.position.y) < 19000) sunk++;
      },
    });
  }
  ok(nan === 0, '没有一帧出现 NaN / Infinity', `${nan} 帧`);
  ok(penFrames === 0, '没有一帧穿进几何超过 0.05 cm', `${penFrames} 帧,最深 ${worst.toFixed(4)}`);
  ok(sunk === 0, '没有一帧沉到地板以下还报 walking', `${sunk} 帧`);
}

console.log(`\n${failures === 0 ? '✓ 全部通过' : '✗ ' + failures + ' 项失败'}`);
process.exit(failures === 0 ? 0 : 1);
