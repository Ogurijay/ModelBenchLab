import { describe, it, expect } from 'vitest';
import { buildPlan, islandHalfWidth, insideIsland, districtHeight, clipPoly, polyArea, CITY } from '../src/city/plan.js';

describe('城市规划(种子确定性)', () => {
  it('同种子两次规划逐字节一致', () => {
    const a = buildPlan(1337), b = buildPlan(1337);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('不同种子地块不同', () => {
    const a = buildPlan(1337), b = buildPlan(2026);
    expect(JSON.stringify(a.lots)).not.toBe(JSON.stringify(b.lots));
  });

  it('固定种子集均可生成完整城市', () => {
    for (const seed of [1337, 2026, 42]) {
      const p = buildPlan(seed);
      expect(p.lots.length).toBeGreaterThan(180);
      expect(p.wedges.length).toBeGreaterThan(4);       // 百老汇切出楔形地块
      expect(p.flatironWedge).toBeTruthy();             // 熨斗楼地块存在
      expect(p.nodes.length).toBeGreaterThan(40);       // 红绿灯路口
    }
  });

  it('所有地块都在岛内且避开公园', () => {
    const p = buildPlan(1337);
    for (const lot of p.lots) {
      expect(insideIsland(lot.x, lot.z)).toBe(true);
      const inPark = lot.x > CITY.park.x0 && lot.x < CITY.park.x1 && lot.z > CITY.park.z0 && lot.z < CITY.park.z1;
      expect(inPark).toBe(false);
    }
  });

  it('双峰天际线:中城与下城高于中间谷地', () => {
    const mid = districtHeight(0, -235, 0.5);
    const valley = districtHeight(0, 60, 0.5);
    const dwn = districtHeight(0, 330, 0.5);
    expect(mid).toBeGreaterThan(valley * 1.8);
    expect(dwn).toBeGreaterThan(valley * 1.5);
  });

  it('岛宽函数:南端收窄,北端收窄,中段最宽', () => {
    expect(islandHalfWidth(0)).toBe(250);
    expect(islandHalfWidth(600)).toBeLessThan(60);
    expect(islandHalfWidth(-580)).toBeLessThan(200);
    expect(islandHalfWidth(-700)).toBe(0);
  });

  it('半平面裁剪保留面积正确', () => {
    const rect = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
    const half = clipPoly(rect, (p) => p.x - 5);
    expect(polyArea(half)).toBeCloseTo(50, 6);
  });
});
