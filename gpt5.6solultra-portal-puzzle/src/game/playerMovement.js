export const PLAYER_MOVEMENT = Object.freeze({
  walkSpeed: 4.45,
  sprintEntrySpeed: 6.4,
  sprintMaxSpeed: 12.8,
  sprintChargeSeconds: 3,
});

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

/**
 * 推进冲刺蓄力状态。
 *
 * 只有“按住 Shift 且存在移动输入”才算持续冲刺；任一条件中断时，
 * 已积累的 3 秒蓄力会立即归零。速度从旧版冲刺速度平滑提升到双倍上限。
 */
export function advanceSprintState(
  elapsed,
  {
    sprintHeld = false,
    moving = false,
    dt = 0,
  } = {},
) {
  const active = Boolean(sprintHeld && moving);
  if (!active) {
    return {
      active: false,
      elapsed: 0,
      progress: 0,
      speed: PLAYER_MOVEMENT.walkSpeed,
      maxed: false,
    };
  }

  const duration = PLAYER_MOVEMENT.sprintChargeSeconds;
  let nextElapsed = Math.min(duration, finiteNonNegative(elapsed) + finiteNonNegative(dt));
  if (duration - nextElapsed < 1e-9) nextElapsed = duration;

  const progress = duration > 0 ? nextElapsed / duration : 1;
  const speed = PLAYER_MOVEMENT.sprintEntrySpeed
    + (PLAYER_MOVEMENT.sprintMaxSpeed - PLAYER_MOVEMENT.sprintEntrySpeed) * progress;

  return {
    active: true,
    elapsed: nextElapsed,
    progress,
    speed,
    maxed: nextElapsed >= duration,
  };
}
