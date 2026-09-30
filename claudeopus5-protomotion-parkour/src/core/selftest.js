// 13 项自检 —— 逐条移植 UE 侧 `Private/ProtoSelfTest.cpp` 的 `BuildSteps()` 与 `TickComponent()`。
//
// 这是整套移植的**验收标准**,也是唯一能证明「条件图真的被移过来了」的东西:
// 编译通过说明不了任何事,冲刺撞墙到底出不出 `Wallrunning`、空中按住跳到底出不出 `Gliding`、
// 打了 `unclimbable` 的板到底会不会被拒绝 —— 只有把玩家会走的那条意图通道
// (setMoveInput / setSprintHeld / setGlideHeld / tryJump)真的走一遍才知道。
//
// 三件必须照抄、抄错结论就不成立的事:
//
//   1) **帧内次序 = 施加意图(含 tryJump)→ 采样 motionState → step(dt)**。
//      UE 的 TickComponent 就是这个次序(TryJump() 之后紧接着 Observed.Add(GetMotionState()))。
//      改成「step 之后采样」第 11 项(墙跳)会漏掉 `Jumping`:蹬墙后输入还朝着墙,
//      下一帧条件图的「pushing && mode == falling → EnterWall(Climb)」会同帧把角色抓回墙上,
//      于是 Jumping 从来没有被任何一帧看见过。
//
//   2) **意图每帧重新施加**(UE 注释:"the same way input would")。这不是冗余 ——
//      `releaseInputAfter` 的松手、以及「按住」与「点按」的区别全靠它表达。
//
//   3) **一个世界跑完 13 步,靠传送换场**,不是每步新建一个世界。UE 是同一个角色被搬来搬去,
//      所以翻越冷却、滑翔状态这些跨步残留也一并被移植过来了(传送只清模式+速度+位置朝向)。
//
// 本文件是纯仿真:只 import sim 层,不碰 window / document / 渲染器 ——
// 页面上的「自检」按钮和 `node tests/run.mjs` 跑的必须是同一份代码,否则自检的结论对页面不成立。

import { DERIVED, MOTION_STATE } from '../sim/protoTypes.js';
import { ProtoWorld } from '../sim/world.js';

// ---------------------------------------------------------------------------
// 13 个场景(UE BuildSteps 的逐条移植;坐标同样来自 Tools/build_test_map.py)
// ---------------------------------------------------------------------------

/** 传送落点的高度:比站立高度(94)高一点,让物理自己把角色放到地上。 */
const STAND_Z = 150;

/**
 * Y = +10 m 是条空跑道:矮砖在 Y = −10..0 m、攀爬墙在 X = −32 m,
 * 所以从这里朝 +X 一路跑到 X = 41.5 m 的跑墙墙之前不会撞到任何东西。
 */
const LANE_Y = 1000;

/**
 * 墙面三项(9/10/11)共用的接近点。`Climb_20m` 的面朝 +X 在 x = −3150、Y 跨 700~1700,
 * 所以站 (−3000, 1200) 朝 −X 推就是正对着它走。
 *
 * 打 20 m 那面而不是 10 m 那面,是 UE 侧写在注释里的理由:攀爬现在跑 RunSpeed(700),
 * 10 m 的墙一秒半就爬到顶、角色翻越走人,下滑和墙跳根本来不及观察。
 */
const CLIMB_APPROACH = [-3000, 1200, STAND_Z];
const CLIMB_APPROACH_YAW = 180;

/**
 * 一个场景 = 一次传送 + 一组按住的意图 + 一条状态断言。
 * 字段名与 UE 的 `FProtoTestStep` 一一对应,便于两边对读。
 */
export const SELF_TEST_STEPS = [
  {
    name: 'idle',
    duration: 1.0,
    location: [-2000, LANE_Y, STAND_Z],
    expect: MOTION_STATE.Idling,
  },
  {
    name: 'walk (light stick)',
    duration: 1.5,
    location: [-2000, LANE_Y, STAND_Z],
    // 0.35 < WalkInputThreshold(0.55):推杆幅度决定走/跑,不是速度决定
    input: [0.35, 0],
    expect: MOTION_STATE.Walking,
  },
  {
    name: 'run (full stick)',
    duration: 1.5,
    location: [-1000, LANE_Y, STAND_Z],
    input: [1, 0],
    expect: MOTION_STATE.Running,
  },
  {
    name: 'sprint',
    duration: 2.0,
    location: [0, LANE_Y, STAND_Z],
    input: [1, 0],
    sprint: true,
    expect: MOTION_STATE.Running,
  },
  {
    name: 'jump',
    duration: 1.5,
    location: [-2000, LANE_Y, STAND_Z],
    input: [1, 0],
    // 跳跃等到真正站在地面才发:传送后角色在空中,tryJump 在 Falling 下正确地拒绝
    jump: true,
    expect: MOTION_STATE.Jumping,
  },
  {
    name: 'fall',
    duration: 2.0,
    location: [0, 0, 3000],
    expect: MOTION_STATE.Falling,
  },
  {
    // 空中按住跳就是滑翔意图 —— 与玩家触发它的方式完全一致
    name: 'glide',
    duration: 3.0,
    location: [0, 0, 6000],
    input: [1, 0],
    glide: true,
    expect: MOTION_STATE.Gliding,
  },
  {
    // WallRun_Target 的面在 x = 4150,这里是 16.5 m 的助跑距离 ——
    // 远超「加速到 WallRunEnterSpeed(900)」所需的约 4 m
    name: 'wall run (sprint into wall)',
    duration: 3.0,
    location: [2500, 0, STAND_Z],
    input: [1, 0],
    sprint: true,
    expect: MOTION_STATE.Wallrunning,
  },
  {
    // 同一堵墙但只用跑速(700 < WallRunEnterSpeed),所以必须解成攀爬而不是跑墙。
    // 上升速度那条断言才是它真正的目的:证明攀爬跑的是 RunSpeed,不是一档专门的慢速。
    name: 'climb at run speed',
    duration: 3.0,
    location: CLIMB_APPROACH,
    controlYaw: CLIMB_APPROACH_YAW,
    input: [1, 0],
    expect: MOTION_STATE.Climbing,
    minPeakAscent: 650,
  },
  {
    // 贴着墙松手,必须在 WallSlideDelay(0.6 s)之后把攀爬衰减成下滑
    name: 'wall slide (release input)',
    duration: 4.0,
    location: CLIMB_APPROACH,
    controlYaw: CLIMB_APPROACH_YAW,
    input: [1, 0],
    releaseInputAfter: 1.0,
    expect: MOTION_STATE.Sliding,
  },
  {
    // 在离地 7 m 上下蹬墙,离 20 m 的墙顶还远得很 ——
    // 所以这一步里出现 Jumping 只可能是墙跳,不可能是翻越
    name: 'wall jump (off the wall)',
    duration: 3.0,
    location: CLIMB_APPROACH,
    controlYaw: CLIMB_APPROACH_YAW,
    input: [1, 0],
    jumpAfter: 1.0,
    expect: MOTION_STATE.Jumping,
  },
  {
    // 同样的接近方式,但这块板打了 `unclimbable` 标签,探针必须拒绝它
    name: 'unclimbable slab is refused',
    duration: 2.5,
    location: [0, -3900, STAND_Z],
    controlYaw: -90,
    input: [1, 0],
    expect: MOTION_STATE.Climbing,
    expectAbsent: true,
  },
  {
    // Low_Step_80cm 占 X = 10..14 m、Y = −4..0 m。80 cm 高过 MaxStepHeight(55)又矮于墙,
    // 只有翻越分支过得去 —— 全程没有跳跃输入却出现 Jumping,那就是翻越在开火
    name: 'vault (chest-high block)',
    duration: 2.5,
    location: [600, -200, STAND_Z],
    input: [1, 0],
    expect: MOTION_STATE.Jumping,
  },
];

// ---------------------------------------------------------------------------
// 驱动
// ---------------------------------------------------------------------------

/**
 * UE 的 `WarmUp`:第一步之前先让世界沉淀 0.75 s。
 * 每一步都会传送,所以它对结论没有影响 —— 照抄是为了两边的步序完全同构。
 */
const WARM_UP = 0.75;

/** 跑一步。返回这一步的观察结果,不做判定(判定在 `runSelfTest` 里,与 UE FinishStep 对齐)。 */
function runStep(world, step, dt) {
  const move = world.movement;
  const body = world.body;

  // --- UE BeginStep:先切 Falling + 速度归零,再设位置与朝向,最后施加按住的意图
  world.teleport(step.location, step.controlYaw || 0);
  move.setSprintHeld(!!step.sprint);
  move.setGlideHeld(!!step.glide);
  const input = step.input || [0, 0];
  move.setMoveInput(input[0], input[1]);

  /** 出现过的所有 MotionState。UE 用的是 TSet + 字母排序,这里按**首次出现**排 —— 顺序本身就是信息。 */
  const seen = [];
  const seenSet = new Set();
  let peakSpeed = 0;
  let peakDescent = 0;
  let peakAscent = 0;
  /**
   * 只统计 `Climbing` 帧的上升峰值。
   * UE 的 `PeakAscent` 取的是整步 max(Velocity.Z),而第 9 步的 3 s 足够爬穿 20 m 墙,
   * 墙顶翻越的 LedgeMantleUpSpeed 会把那一格顶到 744 —— 于是「证明攀爬跑 RunSpeed」这条
   * 断言拿到的其实是**翻越弹射**的数。本移植额外记一格,MinPeakAscent 判定改用它
   * (UE 侧无对应字段,属于本移植的加强)。
   */
  let climbPeakAscent = 0;
  let climbFrames = 0;

  /** 「一次性按下」的两种跳:等站稳再跳 / 定时跳。各自只许开火一次。 */
  let jumpPending = !!step.jump;
  let timedJumpFired = false;

  const frames = Math.round(step.duration / dt);
  for (let i = 0; i < frames; i++) {
    // 累加会漂,时刻直接由帧号算 —— 固定步长的意义就在于可复现
    const elapsed = i * dt;

    // --- 意图每帧重新施加(模拟「按住」)。松手是把输入置零,不是停止施加。
    const released = step.releaseInputAfter > 0 && elapsed >= step.releaseInputAfter;
    move.setMoveInput(released ? 0 : input[0], released ? 0 : input[1]);
    move.setSprintHeld(!!step.sprint);
    move.setGlideHeld(!!step.glide);
    // 「不贴墙时才把输入喂给加速度通道」由 movement 内部保证(_startNewPhysics 只在
    // walking/falling 分支传 _accel),对应 UE 角色侧的 `if (!IsOnWall()) AddMovementInput(...)`。

    if (jumpPending && body.isMovingOnGround()) jumpPending = !move.tryJump();
    if (step.jumpAfter > 0 && !timedJumpFired && elapsed >= step.jumpAfter) {
      timedJumpFired = true;
      move.tryJump();
    }

    // --- 采样必须在 step 之前:见文件头第 1 条
    const state = move.motionState;
    if (!seenSet.has(state)) {
      seenSet.add(state);
      seen.push(state);
    }
    peakSpeed = Math.max(peakSpeed, Math.hypot(body.velocity.x, body.velocity.y));
    peakDescent = Math.min(peakDescent, body.velocity.z);
    peakAscent = Math.max(peakAscent, body.velocity.z);
    if (state === MOTION_STATE.Climbing) {
      climbFrames++;
      climbPeakAscent = Math.max(climbPeakAscent, body.velocity.z);
    }

    world.step(dt);
  }

  return { seen, peakSpeed, peakDescent, peakAscent, climbPeakAscent, climbFrames };
}

/**
 * 跑完 13 项自检。纯同步、无副作用(自己建世界),可在 node 与浏览器里跑同一份。
 *
 * @param {{ dt?: number, steps?: Array }} opts 只为调试留的口子;默认就是 UE 的那 13 步 + 1/120 步长。
 * @returns {{ total:number, passed:number, cases:Array }}
 *   cases[i] = { name, pass, expect, absent, seen[], peakSpeed, peakDescent, peakAscent,
 *                climbPeakAscent, climbFrames, minPeakAscent, detail }
 */
export function runSelfTest(opts = {}) {
  const dt = opts.dt || DERIVED.FixedStep;
  const steps = opts.steps || SELF_TEST_STEPS;

  const world = new ProtoWorld();

  // UE WarmUp:静置若干帧,让出生点那 26 cm 的下坠落定
  const warmFrames = Math.round(WARM_UP / dt);
  for (let i = 0; i < warmFrames; i++) world.step(dt);

  const cases = [];
  for (const step of steps) {
    const obs = runStep(world, step, dt);

    // --- UE FinishStep 的判定:见到 / 必须没见到,外加第 9 项的上升速度门槛
    const sawIt = obs.seen.includes(step.expect);
    let pass = step.expectAbsent ? !sawIt : sawIt;

    let extra = '';
    if (step.minPeakAscent > 0) {
      // 门槛判定用**攀爬阶段自身**的峰值,不用整步峰值 —— 见 runStep 里 climbPeakAscent 的注释。
      // 报告行把两个数都写出来,免得下一个读者再一次把翻越弹射当成攀爬速度。
      const fastEnough = obs.climbPeakAscent >= step.minPeakAscent;
      pass = pass && fastEnough;
      extra += ` | climb ascent ${obs.climbPeakAscent.toFixed(0)} (need ${step.minPeakAscent.toFixed(0)}`
        + `, ${obs.climbFrames} frames) | step peak ascent ${obs.peakAscent.toFixed(0)}`
        + (fastEnough ? '' : ' TOO SLOW');
    }

    cases.push({
      name: step.name,
      pass,
      expect: step.expect,
      absent: !!step.expectAbsent,
      seen: obs.seen,
      peakSpeed: obs.peakSpeed,
      peakDescent: obs.peakDescent,
      peakAscent: obs.peakAscent,
      climbPeakAscent: obs.climbPeakAscent,
      climbFrames: obs.climbFrames,
      minPeakAscent: step.minPeakAscent || 0,
      detail:
        `${step.expectAbsent ? 'must NOT reach' : 'expected'} ${step.expect}`
        + ` | saw: ${obs.seen.join(',')}`
        + ` | peak speed ${obs.peakSpeed.toFixed(0)}, descent ${obs.peakDescent.toFixed(0)}`
        + extra,
    });
  }

  return {
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    cases,
  };
}

export default runSelfTest;
