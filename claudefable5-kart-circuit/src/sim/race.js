// 比赛规则：检查点按顺序通过，回到 0 号检查点（起点线）记一圈。
// 排名按「累计通过检查点数」降序 +「到下一检查点距离」升序比较。

export function createRace(track, { laps = 3, checkpointCount = 10 } = {}) {
  const count = track.points.length;
  const checkpoints = [];
  for (let k = 0; k < checkpointCount; k += 1) {
    const index = Math.round((k / checkpointCount) * count) % count;
    const p = track.points[index];
    checkpoints.push({ index, x: p.x, z: p.z });
  }
  return {
    track,
    laps,
    checkpoints,
    checkpointRadius: track.halfWidth * 1.4,
    lap: 1,
    nextCheckpoint: 1,
    passedTotal: 0,
    time: 0,
    lapStart: 0,
    lapTimes: [],
    bestLap: null,
    finished: false,
  };
}

export function updateRace(race, pos, dt) {
  if (race.finished) return race;
  race.time += dt;

  const cp = race.checkpoints[race.nextCheckpoint];
  const dist = Math.hypot(pos.x - cp.x, pos.z - cp.z);
  if (dist <= race.checkpointRadius) {
    race.passedTotal += 1;
    if (race.nextCheckpoint === 0) {
      // 跨过起点线，完成一圈。
      const lapTime = race.time - race.lapStart;
      race.lapTimes.push(lapTime);
      race.bestLap = race.bestLap === null ? lapTime : Math.min(race.bestLap, lapTime);
      race.lapStart = race.time;
      if (race.lap >= race.laps) {
        race.finished = true;
        return race;
      }
      race.lap += 1;
    }
    race.nextCheckpoint = (race.nextCheckpoint + 1) % race.checkpoints.length;
  }
  return race;
}

// 当前比赛进度，用于排名。
export function raceProgress(race, pos) {
  const cp = race.checkpoints[race.nextCheckpoint];
  return {
    passed: race.passedTotal,
    distToNext: Math.hypot(pos.x - cp.x, pos.z - cp.z),
  };
}

// 比较器：进度大者在前（返回负数表示 a 排在 b 前面）。
export function compareProgress(a, b) {
  if (a.passed !== b.passed) return b.passed - a.passed;
  return a.distToNext - b.distToNext;
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
