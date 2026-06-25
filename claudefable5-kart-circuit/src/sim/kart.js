// 车辆物理：街机风格，不追求真实轮胎模型。
// 输入约定：throttle ∈ [-1, 1]，steer ∈ [-1, 1]（+1 = 左转），drift = 是否按住漂移键。

export const KART_DEFAULTS = {
  maxSpeed: 32, // m/s，约 115 km/h
  maxReverseSpeed: -8,
  engineAccel: 22,
  brakeDecel: 38,
  coastDecel: 8,
  steerRate: 2.1, // rad/s，全速打满方向时的转向速率
  driftSteerBonus: 1.5, // 漂移时转向倍率
  driftSlipAngle: 0.32, // 漂移时速度方向相对车头的外滑角
  minDriftSpeed: 12,
  offTrackMaxSpeed: 10,
  offTrackDecel: 20,
  boostSpeed: 44,
  boostAccel: 70,
  // 迷你涡轮：蓄力跨过阈值后松开漂移键获得对应时长的加速。
  miniTurbo: [
    { charge: 1.0, duration: 0.7 },
    { charge: 2.0, duration: 1.2 },
  ],
};

export function createKart({ x = 0, z = 0, heading = 0, ...overrides } = {}) {
  return {
    ...KART_DEFAULTS,
    ...overrides,
    x,
    z,
    heading,
    speed: 0,
    drifting: false,
    driftDir: 0,
    driftCharge: 0,
    boostTimer: 0,
    items: [], // 道具队列，最多攒 MAX_ITEMS 个（见 items.js）
  };
}

export function applyBoost(kart, duration) {
  kart.boostTimer = Math.max(kart.boostTimer, duration);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function stepKart(kart, input, dt, env = {}) {
  let throttle = clamp(input.throttle ?? 0, -1, 1);
  const steer = clamp(input.steer ?? 0, -1, 1);
  const wantDrift = !!input.drift;
  const onTrack = env.onTrack !== false;
  // 草地上引擎牵引大减，保证越界减速占主导。
  if (!onTrack && throttle > 0) throttle *= 0.3;

  // --- 纵向速度 ---
  const boosting = kart.boostTimer > 0;
  if (boosting) {
    kart.boostTimer = Math.max(0, kart.boostTimer - dt);
    kart.speed = Math.min(kart.boostSpeed, kart.speed + kart.boostAccel * dt);
  } else if (throttle > 0) {
    kart.speed += throttle * kart.engineAccel * dt;
  } else if (throttle < 0) {
    kart.speed -= kart.brakeDecel * dt * -throttle;
  } else {
    // 松油门滑行：速度向 0 衰减。
    const decel = kart.coastDecel * dt;
    if (kart.speed > 0) kart.speed = Math.max(0, kart.speed - decel);
    else kart.speed = Math.min(0, kart.speed + decel);
  }

  if (!boosting) {
    kart.speed = clamp(kart.speed, kart.maxReverseSpeed, kart.maxSpeed);
  }

  // 越界（草地）：强力衰减到步行速度。
  if (!onTrack && Math.abs(kart.speed) > kart.offTrackMaxSpeed) {
    const decel = kart.offTrackDecel * dt;
    kart.speed = kart.speed > 0
      ? Math.max(kart.offTrackMaxSpeed, kart.speed - decel)
      : Math.min(-kart.offTrackMaxSpeed, kart.speed + decel);
  }

  // --- 漂移状态机 ---
  if (kart.drifting) {
    if (!wantDrift || Math.abs(kart.speed) < kart.minDriftSpeed * 0.6) {
      // 松开漂移键：按蓄力档位发放迷你涡轮。
      let granted = 0;
      for (const tier of kart.miniTurbo) {
        if (kart.driftCharge >= tier.charge) granted = tier.duration;
      }
      if (granted > 0) applyBoost(kart, granted);
      kart.drifting = false;
      kart.driftDir = 0;
      kart.driftCharge = 0;
    } else {
      kart.driftCharge += dt;
    }
  } else if (wantDrift && Math.abs(steer) > 0.3 && kart.speed > kart.minDriftSpeed) {
    kart.drifting = true;
    kart.driftDir = Math.sign(steer);
    kart.driftCharge = 0;
  }

  // --- 转向 ---
  // 低速时转向权重降低，倒车时转向反向。
  const grip = clamp(Math.abs(kart.speed) / 8, 0, 1);
  const reverse = kart.speed < 0 ? -1 : 1;
  let turn = steer * kart.steerRate * grip * reverse;
  if (kart.drifting) {
    // 漂移时转向偏向漂移方向且更灵敏。
    const biased = clamp(steer * 0.6 + kart.driftDir * 0.7, -1, 1);
    turn = biased * kart.steerRate * kart.driftSteerBonus * grip;
  }
  kart.heading += turn * dt;

  // --- 位移 ---
  // 漂移时速度方向相对车头向外侧滑动，呈现甩尾感。
  const moveHeading = kart.drifting
    ? kart.heading - kart.driftDir * kart.driftSlipAngle
    : kart.heading;
  kart.x += Math.sin(moveHeading) * kart.speed * dt;
  kart.z += Math.cos(moveHeading) * kart.speed * dt;

  return kart;
}
