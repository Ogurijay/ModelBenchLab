import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_COUNT,
  createRaceState,
  collectBoostPad,
  updateCheckpointProgress
} from '../src/simulation/race.js';

describe('race state', () => {
  it('advances checkpoints in order and starts the next lap after the final gate', () => {
    let race = createRaceState({ totalLaps: 3 });

    for (let index = 0; index < CHECKPOINT_COUNT; index += 1) {
      race = updateCheckpointProgress(race, index, 12.5 + index);
    }

    expect(race.lap).toBe(2);
    expect(race.nextCheckpoint).toBe(0);
    expect(race.bestLapMs).toBe(12.5 + CHECKPOINT_COUNT - 1);
  });

  it('ignores checkpoints reached out of order', () => {
    const race = createRaceState({ totalLaps: 3 });
    const updated = updateCheckpointProgress(race, 2, 900);

    expect(updated).toEqual(race);
  });

  it('marks the race complete after the target lap count', () => {
    let race = createRaceState({ totalLaps: 1 });

    for (let index = 0; index < CHECKPOINT_COUNT; index += 1) {
      race = updateCheckpointProgress(race, index, 3000);
    }

    expect(race.finished).toBe(true);
    expect(race.lap).toBe(1);
  });

  it('collects each boost pad only once until reset', () => {
    let race = createRaceState({ totalLaps: 3 });

    race = collectBoostPad(race, 'boost-1', 4200);
    const repeated = collectBoostPad(race, 'boost-1', 4600);

    expect(race.boostUntilMs).toBe(5700);
    expect(repeated.boostUntilMs).toBe(5700);
    expect(repeated.collectedBoostPads).toContain('boost-1');
  });
});
