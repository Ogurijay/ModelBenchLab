import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  getTrackCurve,
  getSplineProjection,
  checkWrongWay,
  ROAD_HALF_WIDTH
} from '../src/simulation/trackSpline.js';
import {
  createRaceState,
  evaluateRaceProgress,
  GATE_T_COORDS,
  formatTimePeriod
} from '../src/simulation/race.js';

describe('Race and Track Progress management', () => {
  it('correctly retrieves points and project locations on the CatmullRom spline', () => {
    const curve = getTrackCurve();
    expect(curve).toBeDefined();

    // 在中心起点附近采样投影 (0, 0, 60)
    const result = getSplineProjection(2.0, 59.0, curve);
    
    expect(result.t).toBeCloseTo(0.0, 2);
    expect(result.distance).toBeLessThan(5.0);
    expect(result.isOffroad).toBe(false);
  });

  it('correctly detects wrong-way driving direction', () => {
    // 样条在 t = 0 时的正朝向切线方向 (约为 X 轴正向 1.0, 0.0)
    const tangent = new THREE.Vector3(1.0, 0, 0);

    // 顺开 (Heading = PI / 2，正对 X 轴正向)
    const forwardWrong = checkWrongWay(Math.PI / 2, tangent);
    expect(forwardWrong).toBe(false);

    // 逆行 (Heading = -Math.PI / 2 或 3*PI/2，朝向 X 轴负向)
    const backwardWrong = checkWrongWay(Math.PI * 1.5, tangent);
    expect(backwardWrong).toBe(true);
  });

  it('advances race checkpoints in sequence and updates lap count', () => {
    let race = createRaceState({ totalLaps: 3 });
    const now = 1000;

    // 依次经过 6 个 Checkpoint
    for (let index = 0; index < 6; index++) {
      const t = GATE_T_COORDS[index];
      // 传入处于赛道内 (distance = 2.0 < ROAD_HALF_WIDTH) 的坐标
      race = evaluateRaceProgress(race, t, 2.0, ROAD_HALF_WIDTH, now + index * 1000);
    }

    // 经过门 5 后，下一个目标是门 0 且进入圈 2
    expect(race.nextCheckpoint).toBe(0);
    expect(race.lap).toBe(2);
    expect(race.bestLapMs).toBeGreaterThan(0);
  });

  it('ignores checkpoint triggers out of order', () => {
    let race = createRaceState({ totalLaps: 3 });
    
    // 跳过门 0 直接过门 3
    const tGate3 = GATE_T_COORDS[3];
    const updated = evaluateRaceProgress(race, tGate3, 1.0, ROAD_HALF_WIDTH, 5000);

    // 状态应该原封不动
    expect(updated.nextCheckpoint).toBe(0);
    expect(updated.lap).toBe(1);
  });

  it('ignores checkpoint triggers when vehicle is offroad', () => {
    let race = createRaceState({ totalLaps: 3 });
    
    // 玩家虽然在门 0 附近，但是开到了护栏外（distance = 15.0 > ROAD_HALF_WIDTH）
    const tGate0 = GATE_T_COORDS[0];
    const updated = evaluateRaceProgress(race, tGate0, 15.0, ROAD_HALF_WIDTH, 5000);

    expect(updated.nextCheckpoint).toBe(0);
  });

  it('marks the race finished when reaching the lap limits', () => {
    let race = createRaceState({ totalLaps: 1 });
    
    // 过 6 个门
    for (let index = 0; index < 6; index++) {
      race = evaluateRaceProgress(race, GATE_T_COORDS[index], 1.0, ROAD_HALF_WIDTH, 1000 + index * 1000);
    }

    expect(race.finished).toBe(true);
    expect(race.totalTimeMs).toBeGreaterThan(0);
  });

  it('properly formats millisecond race times to LCD style string', () => {
    const formatted1 = formatTimePeriod(65430);
    expect(formatted1).toBe("01:05.43");

    const formatted2 = formatTimePeriod(null);
    expect(formatted2).toBe("--:--.--");
  });
});
