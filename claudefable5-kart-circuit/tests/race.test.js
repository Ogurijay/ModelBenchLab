import { describe, expect, it } from 'vitest';
import { createTrack } from '../src/sim/track.js';
import { createRace, updateRace, raceProgress, compareProgress, formatTime } from '../src/sim/race.js';

const DT = 1 / 60;

function passCheckpoint(race, k) {
  const cp = race.checkpoints[k];
  updateRace(race, { x: cp.x, z: cp.z }, DT);
}

function runFullLap(race) {
  const count = race.checkpoints.length;
  for (let k = 1; k < count; k += 1) passCheckpoint(race, k);
  passCheckpoint(race, 0);
}

describe('race', () => {
  it('生成指定数量的检查点且 0 号在起点', () => {
    const track = createTrack();
    const race = createRace(track, { checkpointCount: 10 });
    expect(race.checkpoints.length).toBe(10);
    expect(race.checkpoints[0].x).toBeCloseTo(track.points[0].x, 9);
  });

  it('按顺序通过检查点推进，跳过的检查点不计数', () => {
    const race = createRace(createTrack());
    // 直接出现在 2 号检查点：当前目标是 1 号，不应推进。
    passCheckpoint(race, 2);
    expect(race.passedTotal).toBe(0);
    passCheckpoint(race, 1);
    expect(race.passedTotal).toBe(1);
    expect(race.nextCheckpoint).toBe(2);
  });

  it('完整一圈后圈数 +1 并记录单圈时间', () => {
    const race = createRace(createTrack());
    runFullLap(race);
    expect(race.lap).toBe(2);
    expect(race.lapTimes.length).toBe(1);
    expect(race.bestLap).toBeCloseTo(race.lapTimes[0], 9);
  });

  it('跑完全部圈数后 finished，且不再推进', () => {
    const race = createRace(createTrack(), { laps: 2 });
    runFullLap(race);
    runFullLap(race);
    expect(race.finished).toBe(true);
    expect(race.lapTimes.length).toBe(2);
    const timeBefore = race.time;
    updateRace(race, { x: 0, z: 0 }, DT);
    expect(race.time).toBe(timeBefore);
  });

  it('排名：检查点多者在前，相同时离下一检查点近者在前', () => {
    const track = createTrack();
    const leader = createRace(track);
    passCheckpoint(leader, 1);
    const chaser = createRace(track);

    const cp1 = leader.checkpoints[1];
    const pLeader = raceProgress(leader, { x: cp1.x, z: cp1.z });
    const pChaser = raceProgress(chaser, { x: 0, z: 0 });
    expect(compareProgress(pLeader, pChaser)).toBeLessThan(0);

    // 同样的检查点数：距离近者在前。
    const a = { passed: 3, distToNext: 5 };
    const b = { passed: 3, distToNext: 20 };
    expect(compareProgress(a, b)).toBeLessThan(0);
  });

  it('formatTime 输出 m:ss.xx', () => {
    expect(formatTime(83.5)).toBe('1:23.50');
    expect(formatTime(5.123)).toBe('0:05.12');
  });
});
