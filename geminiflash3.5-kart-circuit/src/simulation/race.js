export const GATES_COUNT = 6;

// 6个大门在闭合样条曲线上的 t 坐标映射
export const GATE_T_COORDS = [
  0.0,    // Gate 0 (起点/终点大门)
  0.14,   // Gate 1
  0.32,   // Gate 2
  0.50,   // Gate 3
  0.68,   // Gate 4
  0.84    // Gate 5
];

// 触发窗口宽度
const GATE_TRIGGER_WINDOW = 0.065;

/**
 * 初始化比赛状态机
 */
export function createRaceState({ totalLaps = 3 } = {}) {
  return {
    totalLaps,
    lap: 1,
    nextCheckpoint: 0, // 0 到 5，代表下一个必须要过的大门
    finished: false,
    raceStartedAtMs: null,
    lapStartedAtMs: null,
    bestLapMs: null,
    totalTimeMs: 0
  };
}

/**
 * 核心逻辑：根据车辆当前在样条的参数 t 和与中心轴的偏离距离，计算是否触及检查点大门
 */
export function evaluateRaceProgress(race, tProgress, distance, roadHalfWidth, nowMs) {
  if (race.finished) return race;

  // 1. 如果比赛尚未激活计时，则以首次起步开始计时
  let updatedRace = { ...race };
  if (updatedRace.raceStartedAtMs === null) {
    updatedRace.raceStartedAtMs = nowMs;
    updatedRace.lapStartedAtMs = nowMs;
  }

  // 2. 检查玩家车辆是否越出了赛道护栏。越出护栏则判定大门失效 (防止穿墙作弊)
  if (distance > roadHalfWidth) {
    return updatedRace;
  }

  const currentNextGate = updatedRace.nextCheckpoint;
  const targetT = GATE_T_COORDS[currentNextGate];

  // 3. 计算 tProgress 与目标 gate 坐标在环形 $[0, 1]$ 上的最小差值
  let diff = Math.abs(tProgress - targetT);
  if (diff > 0.5) {
    diff = 1.0 - diff; // 闭环循环轴差值
  }

  const reachedGate = diff < GATE_TRIGGER_WINDOW;

  if (reachedGate) {
    // 越过了下一个需要到达的大门，晋升大门进度
    const nextCheckpoint = (currentNextGate + 1) % GATES_COUNT;
    const crossedFinishLine = nextCheckpoint === 0; // 下一个大门重置为0说明刚越过终点大门

    let lap = updatedRace.lap;
    let lapStartedAtMs = updatedRace.lapStartedAtMs;
    let bestLapMs = updatedRace.bestLapMs;
    let finished = updatedRace.finished;

    if (crossedFinishLine) {
      // 越过终点线，核算圈速
      const lapTime = nowMs - lapStartedAtMs;
      
      // 更新最佳圈速
      bestLapMs = bestLapMs === null ? lapTime : Math.min(bestLapMs, lapTime);

      if (lap >= updatedRace.totalLaps) {
        // 完成总圈数，完赛！
        finished = true;
        updatedRace.totalTimeMs = nowMs - updatedRace.raceStartedAtMs;
      } else {
        // 进入下一圈
        lap += 1;
        lapStartedAtMs = nowMs;
      }
    }

    return {
      ...updatedRace,
      lap,
      nextCheckpoint,
      finished,
      lapStartedAtMs,
      bestLapMs
    };
  }

  return updatedRace;
}

/**
 * 时间格式化助手：将 ms 转换为 mm:ss.SS 液晶时钟格式
 */
export function formatTimePeriod(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return "--:--.--";
  }
  
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const centiseconds = Math.floor((ms % 1000) / 10);
  
  const mStr = String(minutes).padStart(2, '0');
  const sStr = String(seconds).padStart(2, '0');
  const cStr = String(centiseconds).padStart(2, '0');
  
  return `${mStr}:${sStr}.${cStr}`;
}
