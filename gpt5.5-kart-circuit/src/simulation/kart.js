export const KART_LIMITS = {
  maxForwardSpeed: 38,
  maxReverseSpeed: -8,
  acceleration: 22,
  brakeForce: 28,
  rollingDrag: 2.2,
  offroadDrag: 18,
  turnRate: 2.35,
  driftTurnBoost: 1.72,
  driftSpeedPenalty: 1.4,
  roadHalfWidth: 8.2
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createKartState(overrides = {}) {
  return {
    x: 0,
    z: 26,
    y: 0,
    heading: Math.PI,
    speed: 0,
    driftCharge: 0,
    boostTime: 0,
    sideSlip: 0,
    event: null,
    ...overrides
  };
}

export function isInsideTrackBand(trackDistance) {
  return Math.abs(trackDistance) <= KART_LIMITS.roadHalfWidth;
}

export function getInputVector(keys = {}) {
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

export function integrateKart(state, input, deltaSeconds, environment = {}) {
  const totalDt = clamp(deltaSeconds, 0, 1);
  const steps = Math.max(1, Math.ceil(totalDt / 0.05));
  const dt = totalDt / steps;
  const trackDistance = environment.trackDistance ?? 0;
  const onRoad = isInsideTrackBand(trackDistance);
  let next = { ...state };
  let frameEvent = null;

  if (!input.drift && next.driftCharge >= 0.96 && Math.abs(next.speed) > 10) {
    next.boostTime = Math.max(next.boostTime, 0.72);
    next.driftCharge = 0;
    frameEvent = 'mini-turbo';
  }

  for (let step = 0; step < steps; step += 1) {
    const boostActive = next.boostTime > 0 || environment.boostActive;
    const maxSpeed = onRoad ? KART_LIMITS.maxForwardSpeed + (boostActive ? 12 : 0) : 16;
    let speed = next.speed;

    speed += input.throttle * KART_LIMITS.acceleration * dt;
    speed -= input.brake * KART_LIMITS.brakeForce * dt;

    const drag = KART_LIMITS.rollingDrag + (onRoad ? 0 : KART_LIMITS.offroadDrag);
    const dragDirection = speed > 0 ? -1 : speed < 0 ? 1 : 0;
    speed += dragDirection * drag * dt;

    if (Math.sign(speed) !== Math.sign(next.speed) && input.throttle === 0 && input.brake === 0) {
      speed = 0;
    }

    if (input.drift && Math.abs(speed) > 8 && Math.abs(input.steer) > 0.1) {
      speed -= KART_LIMITS.driftSpeedPenalty * dt;
    }

    speed = clamp(speed, KART_LIMITS.maxReverseSpeed, maxSpeed);

    const speedFactor = clamp(Math.abs(speed) / KART_LIMITS.maxForwardSpeed, 0.18, 1);
    const driftMultiplier = input.drift ? KART_LIMITS.driftTurnBoost : 1;
    const heading = next.heading + input.steer * KART_LIMITS.turnRate * speedFactor * driftMultiplier * dt;
    const x = next.x + Math.sin(heading) * speed * dt;
    const z = next.z - Math.cos(heading) * speed * dt;
    const driftCharge = input.drift
      ? clamp(next.driftCharge + Math.abs(input.steer) * Math.abs(speed) * dt * 0.15, 0, 1)
      : Math.max(0, next.driftCharge - dt * 0.7);
    const sideSlip = input.drift
      ? clamp(next.sideSlip + input.steer * speedFactor * dt * 2.4, -1, 1)
      : next.sideSlip * Math.pow(0.08, dt);

    next = {
      ...next,
      x,
      z,
      heading,
      speed,
      driftCharge,
      sideSlip,
      boostTime: Math.max(0, next.boostTime - dt)
    };
  }

  const signedTrackDistance = environment.signedTrackDistance ?? trackDistance;
  const outside = Math.abs(signedTrackDistance) > KART_LIMITS.roadHalfWidth;
  if (outside && environment.nearestPoint && environment.normal) {
    const side = Math.sign(signedTrackDistance) || 1;
    next.x = environment.nearestPoint.x + environment.normal.x * side * KART_LIMITS.roadHalfWidth;
    next.z = environment.nearestPoint.z + environment.normal.z * side * KART_LIMITS.roadHalfWidth;
    next.speed *= 0.42;
    next.sideSlip *= -0.35;
    frameEvent = 'barrier-hit';
  }

  return {
    ...next,
    event: frameEvent
  };
}
