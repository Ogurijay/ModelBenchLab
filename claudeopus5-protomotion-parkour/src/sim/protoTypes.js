// 移植自 UE 工程 ProtoMotion_Lab 的共用词汇与手感常量。
//   ProtoMotionTypes.h        → MOTION_STATE / CUSTOM_MOVE / ANIM_SLOT / TAGS
//   ProtoMovementComponent.h  → TUNING(UPROPERTY 默认值)
//   ProtoMovementComponent.cpp→ ENGINE(构造函数里设的引擎级参数)
//
// 单位一律沿用 UE:厘米、秒、度;世界 Z-up、X 前 / Y 右 / Z 上。
// 沿用而不换算是刻意的 —— 换算是这类对照移植最大的错误来源。
// 这些数字**不要调**。想试新手感请另开变体目录(见 docs/PORT_SPEC.md §11)。

/**
 * `proto::MotionState::State` 的移动子集 —— 角色每帧带着的「身份证」。
 * 刻意不等于物理模式:滑翔在物理上仍是 Falling,但身份是 Gliding。
 * 身份与物理分离是这套系统的核心。
 */
export const MOTION_STATE = {
  NotSet: 'NotSet',
  Idling: 'Idling',
  Walking: 'Walking',
  Running: 'Running',
  Jumping: 'Jumping',
  Falling: 'Falling',
  Wallrunning: 'Wallrunning',
  Climbing: 'Climbing',
  Gliding: 'Gliding',
  Sliding: 'Sliding',
};

/** 物理模式。只有贴墙需要自定义,走和跳用通用的 walking / falling 就够。 */
export const MOVE_MODE = {
  Walking: 'walking',
  Falling: 'falling',
  Custom: 'custom',
};

/** MOVE_Custom 的子模式,数值与 UE 的 EProtoCustomMove 对齐。 */
export const CUSTOM_MOVE = {
  None: 0,
  WallRun: 1,
  Climb: 2,
  WallSlide: 3,
};

/** 原生动画代理能播的槽位。顺序与 UE 的 EProtoAnimSlot 一致。 */
export const ANIM_SLOT = {
  Idle: 'Idle',
  Walk: 'Walk',
  Run: 'Run',
  Sprint: 'Sprint',
  JumpStart: 'JumpStart',
  Fall: 'Fall',
  Land: 'Land',
  Glide: 'Glide',
  WallEnter: 'WallEnter',
  WallRun: 'WallRun',
  WallTop: 'WallTop',
  ClimbIdle: 'ClimbIdle',
  ClimbUp: 'ClimbUp',
  ClimbLedge: 'ClimbLedge',
  WallSlide: 'WallSlide',
  Roll: 'Roll',
};

/** 关卡用来标记「不可攀爬」表面的标签(UE 侧是 Actor/Component tag)。 */
export const TAGS = {
  Unclimbable: 'unclimbable',
};

// ---------------------------------------------------------------------------
// 引擎级参数:UProtoMovementComponent 构造函数里设给 UE 移动组件的那些
// ---------------------------------------------------------------------------

export const ENGINE = {
  /** UE DefaultGravityZ。乘 GravityScale 才是实际重力。 */
  GravityZ: -980,
  /** 重于默认,让跳跃有重量感。 */
  GravityScale: 2.0,
  /** 实际重力 = GravityZ * GravityScale。 */
  Gravity: -1960,

  MaxAcceleration: 3000,
  BrakingDecelerationWalking: 2400,
  GroundFriction: 8,
  AirControl: 0.45,

  /** 高于此的障碍就是「墙的地盘」了。 */
  MaxStepHeight: 55,
  /** 可走地面角度上限。 */
  WalkableFloorAngle: 50,
  /** cos(50°) —— 地面法线 z 不低于此才算可走。 */
  WalkableFloorZ: Math.cos((50 * Math.PI) / 180),

  /** bOrientRotationToMovement 打开时的转向速率(度/秒)。 */
  RotationRateYaw: 720,
};

// ---------------------------------------------------------------------------
// 角色与相机(ProtoMotionCharacter.cpp)
// ---------------------------------------------------------------------------

export const CHARACTER = {
  /** Alex 在源资源里 1.885 m,胶囊按他配而不是按引擎人偶。 */
  CapsuleRadius: 42,
  CapsuleHalfHeight: 94,

  CameraArmLength: 420,
  CameraSocketOffset: [0, 40, 90],
  CameraLagSpeed: 12,

  MeshUniformScale: 1.0,
};

// ---------------------------------------------------------------------------
// 手感常量(ProtoMovementComponent.h 的 UPROPERTY 默认值)
// ---------------------------------------------------------------------------

export const TUNING = {
  // --- 地面(doc 4.1 LocoSteer / LocoSprint)
  WalkSpeed: 260,
  RunSpeed: 700,
  /** LocoSprint。Alex 能跑过汽车,所以远高于 RunSpeed。 */
  SprintSpeed: 1500,
  /** 推杆幅度低于此则走,否则跑。 */
  WalkInputThreshold: 0.55,

  // --- 跳跃(doc 4.2)
  JumpSpeed: 900,
  /** JumpChargedSprinting:冲刺中起跳蹬得狠得多。 */
  SprintJumpSpeed: 1450,
  /** 冲刺跳沿当前朝向额外加的前冲。 */
  SprintJumpForward: 700,

  // --- 滑翔(doc 4.5:只改重力与空中控制,物理模式仍是 falling)
  GlideGravityScale: 0.14,
  GlideMaxDescendSpeed: 260,
  GlideAirControl: 0.9,
  GlideHorizontalSpeed: 1200,
  /** 离地不足这么高不给起滑。 */
  GlideMinHeight: 150,

  // --- 墙面(doc 4.3:MagneticBoots + Wall*/LocoClimb)
  /** 探针在胶囊半径之外再伸出的长度。 */
  WallProbeDistance: 60,
  /** |法线.z| 低于此才算墙。 */
  WallMaxNormalZ: 0.35,
  /** MagneticBootsStickToWall:把胶囊按在墙上的恒定向内拉力。 */
  WallStickForce: 220,
  /** 撞墙速度达到此值才转成跑墙,否则是攀爬。 */
  WallRunEnterSpeed: 900,
  WallRunUpSpeed: 1250,
  /** 跑墙会掉速,掉到 WallRunHandoffSpeed 以下就交接。 */
  WallRunDeceleration: 1500,
  WallRunHandoffSpeed: 700,

  /**
   * sensorMaxClimbUpSpeedKmh / DownSpeedKmh 的对应物。
   * 攀爬跑的是 RunSpeed(700)而不是一档专门的慢速 —— Alex 上墙跟平地跑一样快,这是原作手感。
   * (UE 侧 2026-08-03 从 320/420/240 调到 700/700/500;本项目跟到当前值,
   *  见 tests/run.mjs 里对 UE 头文件的自动比对。)
   */
  ClimbUpSpeed: 700,
  ClimbDownSpeed: 700,
  ClimbLateralSpeed: 500,

  /** 玩家不再往墙里推之后的下滑速度。 */
  WallSlideSpeed: 380,
  /** 攀爬无输入多少秒后衰减为下滑。 */
  WallSlideDelay: 0.6,

  WallJumpUpSpeed: 800,
  WallJumpAwaySpeed: 620,

  /** 爬到没墙可爬时的翻越弹射(LocoClimb → mantle)。 */
  LedgeMantleUpSpeed: 760,
  LedgeMantleForwardSpeed: 460,

  /** 胶囊转向正对墙面的速度。 */
  WallOrientSpeed: 12,

  // --- 翻滚(doc 4.4)
  RollSpeed: 1100,
  RollDuration: 0.55,
};

// ---------------------------------------------------------------------------
// 散在代码里的硬编码数值。集中在此,以免被当成「随便取的」而改动。
// ---------------------------------------------------------------------------

export const DERIVED = {
  /** ProbeWall 下探针高度:-HalfHeight * 0.35(腰腹)。 */
  ProbeLowerZ: -CHARACTER.CapsuleHalfHeight * 0.35,
  /** ProbeWall 上探针高度:+HalfHeight * 0.75(胸头)。 */
  ProbeUpperZ: CHARACTER.CapsuleHalfHeight * 0.75,
  /** TraceWallAt 的扫掠球半径:Radius * 0.6。 */
  ProbeSphereRadius: CHARACTER.CapsuleRadius * 0.6,
  /** 探针总长:Radius + WallProbeDistance。 */
  ProbeReach: CHARACTER.CapsuleRadius + TUNING.WallProbeDistance,

  /** dot(preferred, -normal) 超过此值算「在往墙里推」。 */
  PushIntoWallDot: 0.5,
  /** 非跑墙分支:地面上也能贴墙所需的最低撞墙速度。 */
  ClimbEnterSpeedIntoWall: 60,
  /** 翻越冷却,防止同一障碍连发。 */
  VaultCooldown: 0.4,
  /** 跑墙交接判据 / 攀爬无输入判据的死区。 */
  InputDeadzone: 0.1,

  /** UpdateMotionState:水平速度低于此算 Idling。 */
  IdleSpeedThreshold: 15,
  /** UpdateMotionState:水平速度不超过此算 Walking(WalkSpeed * 1.25)。 */
  WalkStateSpeedMax: TUNING.WalkSpeed * 1.25,

  /** MeasureHeightAboveFloor 的下探最远距离。 */
  FloorTraceDistance: 5000,

  /** 固定仿真步长。自检与渲染共用同一步长,保证可复现。 */
  FixedStep: 1 / 120,
  /** 单渲染帧最多追赶的仿真步数,防止卡顿后爆炸。 */
  MaxStepsPerFrame: 8,
};

/**
 * 跑墙进入时的初始上冲速度:撞墙动能越大蹬得越高。
 * UE: lerp(WallRunUpSpeed * 0.55, WallRunUpSpeed, clamp(speedIntoWall / SprintSpeed, 0, 1))
 */
export function wallRunEntrySpeed(speedIntoWall) {
  const momentum = Math.min(1, Math.max(0, speedIntoWall / Math.max(TUNING.SprintSpeed, 1)));
  return TUNING.WallRunUpSpeed * 0.55 + (TUNING.WallRunUpSpeed - TUNING.WallRunUpSpeed * 0.55) * momentum;
}

/** 单次(非循环)片段的槽位集合。 */
export const ONE_SHOT_SLOTS = new Set([
  ANIM_SLOT.JumpStart,
  ANIM_SLOT.Land,
  ANIM_SLOT.WallEnter,
  ANIM_SLOT.WallTop,
  ANIM_SLOT.ClimbLedge,
  ANIM_SLOT.Roll,
]);

/**
 * 槽位 → GLB 里的片段名。取自 UE 侧 SlotClipNames 的**当前**值,
 * 已核对 models/Alex_ProtoMotion.glb 的 118 条动画里 16 个槽位全部存在。
 *
 * Run 用 `alex_loco_run_n_3` 而不是名字更像的 `alex_loco_run_n`:后者导出时少了 5 条通道
 * (含左右小臂 Forarm_L/R),小臂整段停在绑定姿势,跑起来上半身是僵的。`_3` 是同一套跑但通道完整。
 * Sprint 同理换成 Alex 本人的 `alex_loco_trans_sprint_ndge_n`(摆臂 151° vs 跑的 85°)。
 * 这两条是 UE 侧用 audit_clip_motion.py 逐通道量出来的结论,照抄不再重新踩坑。
 */
export const SLOT_CLIP_NAMES = {
  [ANIM_SLOT.Idle]: 'alex_amb_stand',
  [ANIM_SLOT.Walk]: 'supersol_loco_walk_n',
  [ANIM_SLOT.Run]: 'alex_loco_run_n_3',
  [ANIM_SLOT.Sprint]: 'alex_loco_trans_sprint_ndge_n',
  [ANIM_SLOT.JumpStart]: 'supersol_loco_jump_tact_stand',
  [ANIM_SLOT.Fall]: 'brawler_loco_jump_fall_cycle',
  [ANIM_SLOT.Land]: 'brawler_loco_land',
  [ANIM_SLOT.Glide]: 'alex_grap_air_float_gv',
  [ANIM_SLOT.WallEnter]: 'supersol_loco_air_trans_wall',
  [ANIM_SLOT.WallRun]: 'supersol_loco_wallrun_n',
  [ANIM_SLOT.WallTop]: 'supersol_wall_run_top',
  [ANIM_SLOT.ClimbIdle]: 'infect_climb_idle',
  [ANIM_SLOT.ClimbUp]: 'infect_climb_up',
  [ANIM_SLOT.ClimbLedge]: 'infect_climb_up_ledge',
  [ANIM_SLOT.WallSlide]: 'supersol_bh_hangoff_side_idle_001',
  [ANIM_SLOT.Roll]: 'spec_evade_roll_f',
};

/** 换槽淡入时长(秒)。环境强制的切换要「脆」,不要抹开。 */
export const SLOT_BLEND_TIME = {
  [ANIM_SLOT.WallEnter]: 0.08,
  [ANIM_SLOT.WallRun]: 0.08,
  [ANIM_SLOT.ClimbLedge]: 0.08,
  [ANIM_SLOT.Roll]: 0.08,
  [ANIM_SLOT.JumpStart]: 0.08,
  [ANIM_SLOT.Land]: 0.15,
  [ANIM_SLOT.Fall]: 0.15,
  [ANIM_SLOT.Glide]: 0.15,
};
export const SLOT_BLEND_TIME_DEFAULT = 0.2;

/** 各循环片段「看起来对」的地面速度,用来缩放播放速率避免滑步。 */
export const SLOT_REFERENCE_SPEED = {
  [ANIM_SLOT.Walk]: 260,
  [ANIM_SLOT.Run]: 700,
  [ANIM_SLOT.Sprint]: 1500,
};

/** 播放速率钳制范围。 */
export const PLAY_RATE_RANGE = [0.6, 2.0];
