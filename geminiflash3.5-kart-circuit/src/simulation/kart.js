// 反重力卡丁车物理参数
export const KART_PHYSICS = {
  maxForwardSpeed: 36.0,
  maxReverseSpeed: -10.0,
  acceleration: 20.0,
  brakeForce: 30.0,
  rollingDrag: 2.2,
  offroadDrag: 14.0,       // 出界惩罚阻力
  offroadMaxSpeed: 12.0,   // 出界限速
  turnRate: 2.1,
  driftTurnMultiplier: 1.55, // 漂移时转向率增益
  driftChargeRate: 0.55     // 漂移蓄力速度
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 创建初始赛车物理状态
 */
export function createKartState(overrides = {}) {
  return {
    x: 0,
    z: 60, // 对应样条起点
    y: 0,
    heading: Math.PI / 2, // 初始面向 X 轴正向 (朝右开)
    speed: 0,
    
    // 漂移状态
    driftCharge: 0,
    driftLevel: 0,    // 0:无, 1:蓝色小喷, 2:紫色大喷
    wasDrifting: false,
    slipAngle: 0,     // 漂移甩尾产生的偏角
    
    // 加速状态
    boostTime: 0,
    boostType: 0,     // 1: 蓝喷, 2: 紫喷, 3: 加速带
    
    ...overrides
  };
}

/**
 * 映射键盘输入状态为物理输入向量
 */
export function getKartInput(keys = {}) {
  const throttle = keys.KeyW || keys.ArrowUp ? 1 : 0;
  const brake = keys.KeyS || keys.ArrowDown ? 1 : 0;
  const steerLeft = keys.KeyA || keys.ArrowLeft ? 1 : 0;
  const steerRight = keys.KeyD || keys.ArrowRight ? 1 : 0;

  return {
    throttle,
    brake,
    steer: steerRight - steerLeft,
    drift: Boolean(keys.Space)
  };
}

/**
 * 物理积分：核心反重力车动力学模拟 (纯函数，便于测试)
 */
export function integrateKart(state, input, deltaSeconds, environment = {}) {
  const dt = clamp(deltaSeconds, 0, 0.05); // 限幅防止跳帧物理爆炸
  
  const isOffroad = environment.isOffroad ?? false;
  const boostActive = state.boostTime > 0 || environment.boostActive;
  
  // 1. 根据当前加速状态解算最大速度限制
  let maxSpeed = KART_PHYSICS.maxForwardSpeed;
  if (isOffroad && !boostActive) {
    maxSpeed = KART_PHYSICS.offroadMaxSpeed; // 出界限速
  } else if (boostActive) {
    // 根据加速档位提升最大速度限制
    const boostType = state.boostType || 3;
    if (boostType === 1) maxSpeed = 43.0;      // 蓝喷
    else if (boostType === 2) maxSpeed = 48.0; // 紫喷
    else maxSpeed = 52.0;                      // 加速带
  }

  let speed = state.speed;

  // 2. 油门与刹车积分
  speed += input.throttle * KART_PHYSICS.acceleration * dt;
  speed -= input.brake * KART_PHYSICS.brakeForce * dt;

  // 3. 阻力模拟 (出界时滚阻巨大)
  const drag = KART_PHYSICS.rollingDrag + (isOffroad && !boostActive ? KART_PHYSICS.offroadDrag : 0);
  const dragDir = speed > 0 ? -1 : speed < 0 ? 1 : 0;
  speed += dragDir * drag * dt;

  // 防抖动：如果速度在阻力下穿过 0 且没有油门刹车，强制静止
  if (Math.sign(speed) !== Math.sign(state.speed) && input.throttle === 0 && input.brake === 0) {
    speed = 0;
  }

  // 速度限幅
  speed = clamp(speed, KART_PHYSICS.maxReverseSpeed, maxSpeed);

  // 4. 漂移与侧偏角 (Slip Angle) 物理
  let driftCharge = state.driftCharge;
  let driftLevel = state.driftLevel;
  let slipAngle = 0;
  
  // 只有速度大于一定值且有转向输入时，才允许漂移
  const canDrift = Math.abs(speed) > 7.0 && Math.abs(input.steer) > 0.05;
  const isDrifting = input.drift && canDrift;

  if (isDrifting) {
    // 漂移转向率加倍
    // 漂移导致向弯道外侧侧滑甩尾
    // 如果向右打方向 (steer > 0)，车尾会往左侧偏，产生负侧滑角
    slipAngle = -input.steer * 0.38;
    
    // 累积漂移蓄力
    driftCharge = clamp(driftCharge + KART_PHYSICS.driftChargeRate * Math.abs(input.steer) * dt, 0, 1.0);
    
    // 根据蓄力百分比评定段数
    if (driftCharge >= 0.85) {
      driftLevel = 2; // 紫色大喷
    } else if (driftCharge >= 0.38) {
      driftLevel = 1; // 蓝色小喷
    } else {
      driftLevel = 0;
    }
    
    // 漂移会有少许的降速惩罚，但可以通过蓄力喷气补回
    speed -= 1.8 * dt;
  } else {
    // 没有漂移时，侧偏角迅速收回，蓄力消退
    slipAngle = 0;
    if (!input.drift) {
      driftCharge = 0;
      driftLevel = 0;
    }
  }

  // 5. 漂移释放判断 (wasDrifting 为 true 且当前 input.drift 为 false 时释放)
  let boostTime = Math.max(0, state.boostTime - dt);
  let boostType = state.boostType;
  let triggerBoostAlert = false; // 用于通知 UI 显示大字特效
  
  if (state.wasDrifting && !input.drift) {
    if (state.driftLevel > 0) {
      // 成功获得小喷！速度瞬间提升，获得短暂 Boost 时间
      boostType = state.driftLevel; // 1 或 2
      boostTime = boostType === 2 ? 1.8 : 0.95; // 喷射时间
      speed = Math.max(speed, boostType === 2 ? 44.0 : 38.0); // 瞬间提速
      triggerBoostAlert = true;
    }
    // 释放后蓄力清空
    driftCharge = 0;
    driftLevel = 0;
  }

  // 环境加速带强行 Boost
  if (environment.boostActive) {
    boostTime = 1.5;
    boostType = 3; // 3: 加速带
    speed = Math.max(speed, 50.0);
    triggerBoostAlert = true;
  }

  // 如果 Boost 结束，重置类型
  if (boostTime <= 0) {
    boostType = 0;
  }

  // 6. 转向率结算与位置更新
  // 反重力卡丁车在速度越低时转弯半径越小，但漂移时有增益
  const speedRatio = clamp(Math.abs(speed) / KART_PHYSICS.maxForwardSpeed, 0.22, 1.0);
  const driftSteerBonus = isDrifting ? KART_PHYSICS.driftTurnMultiplier : 1.0;
  
  // 车辆实际朝向更新
  let heading = state.heading + input.steer * KART_PHYSICS.turnRate * (1.2 - speedRatio * 0.45) * driftSteerBonus * dt;
  
  // 规范化 heading 到 [0, 2PI]
  heading = (heading + Math.PI * 2) % (Math.PI * 2);

  // 卡丁车实际移动方向是 heading 加上侧偏甩尾角 slipAngle
  const travelDirection = heading + slipAngle;
  const x = state.x + Math.sin(travelDirection) * speed * dt;
  const z = state.z - Math.cos(travelDirection) * speed * dt;

  // 反重力气垫悬浮：在 Y 轴产生高频且微小的正弦上下摆动
  const floatFreq = 6.0; // 摆动频率
  const timeSec = environment.time ?? 0;
  const y = 0.55 + Math.sin(timeSec * floatFreq) * 0.12;

  return {
    x,
    y,
    z,
    heading,
    speed,
    driftCharge,
    driftLevel,
    wasDrifting: isDrifting, // 留作下一帧的释放判断
    slipAngle,
    boostTime,
    boostType,
    triggerBoostAlert
  };
}
