export const CHECKPOINT_COUNT = 6;
export const BOOST_DURATION_MS = 1500;

export function createRaceState({ totalLaps = 3 } = {}) {
  return {
    totalLaps,
    lap: 1,
    nextCheckpoint: 0,
    finished: false,
    lapStartedAtMs: 0,
    bestLapMs: null,
    boostUntilMs: 0,
    collectedBoostPads: []
  };
}

export function updateCheckpointProgress(race, checkpointIndex, nowMs) {
  if (race.finished || checkpointIndex !== race.nextCheckpoint) {
    return race;
  }

  const nextCheckpoint = (race.nextCheckpoint + 1) % CHECKPOINT_COUNT;
  const crossedFinish = nextCheckpoint === 0;
  const lapTime = nowMs - race.lapStartedAtMs;
  const bestLapMs = crossedFinish
    ? race.bestLapMs === null
      ? lapTime
      : Math.min(race.bestLapMs, lapTime)
    : race.bestLapMs;
  const finishing = crossedFinish && race.lap >= race.totalLaps;

  return {
    ...race,
    lap: finishing ? race.lap : crossedFinish ? race.lap + 1 : race.lap,
    nextCheckpoint,
    finished: finishing,
    lapStartedAtMs: crossedFinish ? nowMs : race.lapStartedAtMs,
    bestLapMs
  };
}

export function collectBoostPad(race, padId, nowMs) {
  if (race.collectedBoostPads.includes(padId)) {
    return race;
  }

  return {
    ...race,
    boostUntilMs: nowMs + BOOST_DURATION_MS,
    collectedBoostPads: [...race.collectedBoostPads, padId]
  };
}

export function resetBoostPads(race) {
  return {
    ...race,
    collectedBoostPads: []
  };
}

export function formatRaceTime(milliseconds) {
  const seconds = Math.max(0, milliseconds) / 1000;
  return seconds.toFixed(2).padStart(5, '0');
}

