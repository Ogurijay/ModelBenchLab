import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/config.js';
import {
  broadwaySignedDistance,
  createCityPlan,
  insideIsland,
  intersectsRect,
} from '../src/world/plan.js';

const lotBounds = (lot) => ({
  minX: lot.x - lot.width / 2,
  maxX: lot.x + lot.width / 2,
  minZ: lot.z - lot.depth / 2,
  maxZ: lot.z + lot.depth / 2,
});

describe('createCityPlan（确定性城市规划）', () => {
  it('同种子生成完全相同的规划与稳定签名', () => {
    const first = createCityPlan(2026);
    const second = createCityPlan(2026);
    expect(first.signature).toBe(second.signature);
    expect(first.hash).toBe(second.hash);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.signature).toMatch(/^manhattan-v1-2026-[0-9a-f]{8}$/);
  });

  it('不同种子改变建筑规划，但不改变冻结路网', () => {
    const first = createCityPlan(1337);
    const second = createCityPlan(42);
    expect(first.hash).not.toBe(second.hash);
    expect(first.buildingLots).not.toEqual(second.buildingLots);
    expect(first.roads).toEqual(second.roads);
  });

  it.each([1337, 2026, 42])('固定种子 %i 满足数量门槛', (seed) => {
    const plan = createCityPlan(seed);
    expect(plan.avenues.length).toBeGreaterThanOrEqual(8);
    expect(plan.streets.length).toBeGreaterThanOrEqual(18);
    expect(plan.buildingLots.length).toBeGreaterThanOrEqual(250);
    expect(plan.landmarks.length).toBeGreaterThanOrEqual(4);
    expect(plan.stats.triangleBlockCount).toBeGreaterThanOrEqual(3);
    expect(plan.blocks.filter((block) => block.shape === 'triangle')).toHaveLength(plan.stats.triangleBlockCount);
  });

  it('Broadway 斜穿正交路网并留下真实三角多边形', () => {
    const plan = createCityPlan(2026);
    expect(plan.broadway.start.x).not.toBe(plan.broadway.end.x);
    expect(plan.broadway.start.z).not.toBe(plan.broadway.end.z);
    const triangles = plan.blocks.filter((block) => block.isTriangle);
    expect(triangles.length).toBeGreaterThanOrEqual(3);
    for (const triangle of triangles) {
      expect(triangle.polygon).toHaveLength(3);
      expect(triangle.broadwayCut).toBe(true);
    }
    expect(plan.blocks.some((block) => block.broadwayCut)).toBe(true);
  });

  it('建筑地块避开中央公园、地标保护区、岛外与 Broadway 路面', () => {
    const plan = createCityPlan(2026);
    for (const lot of plan.buildingLots) {
      const bounds = lotBounds(lot);
      expect(intersectsRect(bounds, WORLD.park, 2)).toBe(false);
      expect(insideIsland(bounds.minX, bounds.minZ, 0.9)).toBe(true);
      expect(insideIsland(bounds.maxX, bounds.minZ, 0.9)).toBe(true);
      expect(insideIsland(bounds.minX, bounds.maxZ, 0.9)).toBe(true);
      expect(insideIsland(bounds.maxX, bounds.maxZ, 0.9)).toBe(true);
      const distanceFromBroadway = Math.abs(broadwaySignedDistance(lot));
      expect(distanceFromBroadway).toBeGreaterThan(plan.broadway.width / 2);
      for (const landmark of plan.landmarks) {
        const closestX = Math.max(bounds.minX, Math.min(landmark.x, bounds.maxX));
        const closestZ = Math.max(bounds.minZ, Math.min(landmark.z, bounds.maxZ));
        expect(Math.hypot(closestX - landmark.x, closestZ - landmark.z))
          .toBeGreaterThanOrEqual(landmark.reserveRadius);
      }
    }
  });

  it('规划统计与实际集合保持一致，双峰均高于谷地', () => {
    const plan = createCityPlan(2026);
    expect(plan.stats.avenueCount).toBe(plan.avenues.length);
    expect(plan.stats.streetCount).toBe(plan.streets.length);
    expect(plan.stats.roadCount).toBe(plan.roads.length);
    expect(plan.stats.blockCount).toBe(plan.blocks.length);
    expect(plan.stats.buildingLotCount).toBe(plan.buildingLots.length);
    expect(plan.stats.landmarkCount).toBe(plan.landmarks.length);
    expect(plan.stats.downtownPeakHeight).toBeGreaterThan(plan.stats.valleyHeight * 1.5);
    expect(plan.stats.midtownPeakHeight).toBeGreaterThan(plan.stats.valleyHeight * 1.9);
  });
});
