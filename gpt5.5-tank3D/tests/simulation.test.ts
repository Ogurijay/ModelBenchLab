import { describe, expect, it } from "vitest";
import { LEVELS } from "../src/game/content/levels";
import { GameSimulation, tileFromChar } from "../src/game/simulation/GameSimulation";
import { GRID_HEIGHT, GRID_WIDTH, type TileKind } from "../src/game/simulation/types";

describe("level data", () => {
  it("contains exactly the first ten campaign levels", () => {
    expect(LEVELS).toHaveLength(10);
    expect(LEVELS.map((level) => level.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("keeps every map on the classic 26 x 26 grid", () => {
    for (const level of LEVELS) {
      expect(level.layout).toHaveLength(GRID_HEIGHT);
      for (const row of level.layout) expect(row).toHaveLength(GRID_WIDTH);
      expect(level.layout.join("").match(/E/g)).toHaveLength(1);
      expect(level.enemyQueue.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("leaves a non-steel/non-water route from each enemy spawn toward the base front", () => {
    for (const level of LEVELS) {
      const tiles = level.layout.map((row) => [...row].map(tileFromChar));
      const target = { x: 12, y: 22 };
      for (const spawn of [
        { x: 1, y: 1 },
        { x: 12, y: 1 },
        { x: 24, y: 1 },
      ]) {
        expect(hasSoftRoute(tiles, spawn, target), `${level.name} spawn ${spawn.x},${spawn.y}`).toBe(true);
      }
    }
  });
});

describe("campaign progression", () => {
  it("can advance through all ten levels and reach the complete state", () => {
    const simulation = new GameSimulation();
    simulation.start();

    for (let index = 0; index < LEVELS.length; index += 1) {
      expect(simulation.snapshot().levelIndex).toBe(index);
      simulation.forceWinForDebug();
      simulation.tick(0.1, { confirm: true });
    }

    expect(simulation.snapshot().phase).toBe("complete");
  });

  it("boots every level into a playable state without immediate failure", () => {
    const simulation = new GameSimulation();
    for (let index = 0; index < LEVELS.length; index += 1) {
      simulation.loadLevel(index, false);
      for (let frame = 0; frame < 30; frame += 1) simulation.tick(1 / 30, {});
      const snapshot = simulation.snapshot();
      expect(snapshot.phase).toBe("playing");
      expect(snapshot.baseAlive).toBe(true);
      expect(snapshot.tanks.some((tank) => tank.side === "player")).toBe(true);
    }
  });
});

function hasSoftRoute(tiles: TileKind[][], start: { x: number; y: number }, target: { x: number; y: number }): boolean {
  const queue = [start];
  const seen = new Set([`${start.x},${start.y}`]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.x === target.x && current.y === target.y) return true;
    for (const next of [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ]) {
      if (next.x < 0 || next.y < 0 || next.x >= GRID_WIDTH || next.y >= GRID_HEIGHT) continue;
      const key = `${next.x},${next.y}`;
      if (seen.has(key)) continue;
      if (tiles[next.y][next.x] === "steel" || tiles[next.y][next.x] === "water" || tiles[next.y][next.x] === "base") continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
}
