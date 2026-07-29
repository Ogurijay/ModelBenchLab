/**
 * @file tests/grid.test.js
 * @description `src/city/grid.js` 的单元测试（契约 §4.1 / §10）。
 *
 * 覆盖：
 * - 纯几何工具：`polygonArea`（已知矩形/三角形）、`polygonCentroid`、
 *   `pointInPolygon`（凸 + 凹 + 边界）、`clipPolygonByHalfPlane`（已知半平面例子）；
 * - `buildCityPlan` 的确定性（同种子数据部分深度相等 / 不同种子不同）；
 * - 结构约束：街道跳过公园、地块最小面宽、三角地块 ≥ 8；
 * - 空间约束：地块不压路面、不落入公园与水域、同街区内互不重叠；
 * - 查询方法 `isOnRoad / isInPark / isWater / isOnBroadway` 的正确性；
 * - 性能预算：构建 < 120ms。
 *
 * 注意：`CityPlan` 上挂了方法，JSON 序列化会丢弃函数，
 * 因此比较确定性时统一用 `JSON.parse(JSON.stringify(plan))` 取「数据部分」。
 */

import { describe, it, expect } from 'vitest';
import {
  CITY,
  buildCityPlan,
  pointInPolygon,
  clipPolygonByHalfPlane,
  polygonArea,
  polygonCentroid
} from '../src/city/grid.js';

/**
 * 取出计划的纯数据部分（丢掉方法）。
 * @param {Object} plan CityPlan
 * @returns {Object} 可深度比较的普通对象
 */
function dataOf(plan) {
  return JSON.parse(JSON.stringify(plan));
}

/** 全局复用一份计划，避免每个用例重复构建 */
const PLAN = buildCityPlan('manhattan');

/**
 * 遍历所有非公园街区的地块。
 * @param {Object} plan CityPlan
 * @returns {Array<{block: Object, lot: Object}>} 地块列表
 */
function allLots(plan) {
  const out = [];
  for (const block of plan.blocks) {
    for (const lot of block.lots) out.push({ block, lot });
  }
  return out;
}

describe('polygonArea', () => {
  it('已知矩形面积正确，且与顶点顺序无关', () => {
    const rect = [
      [0, 0],
      [10, 0],
      [10, 5],
      [0, 5]
    ];
    expect(polygonArea(rect)).toBeCloseTo(50, 10);
    expect(polygonArea(rect.slice().reverse())).toBeCloseTo(50, 10);
  });

  it('平移后面积不变；三角形面积正确', () => {
    const moved = [
      [-317.5, 1200],
      [-307.5, 1200],
      [-307.5, 1248],
      [-317.5, 1248]
    ];
    expect(polygonArea(moved)).toBeCloseTo(480, 9);
    expect(
      polygonArea([
        [0, 0],
        [6, 0],
        [0, 3]
      ])
    ).toBeCloseTo(9, 12);
  });

  it('顶点不足 3 个时返回 0', () => {
    expect(polygonArea([])).toBe(0);
    expect(
      polygonArea([
        [0, 0],
        [1, 1]
      ])
    ).toBe(0);
  });
});

describe('polygonCentroid', () => {
  it('矩形形心在几何中心', () => {
    const c = polygonCentroid([
      [0, 0],
      [10, 0],
      [10, 5],
      [0, 5]
    ]);
    expect(c.x).toBeCloseTo(5, 10);
    expect(c.z).toBeCloseTo(2.5, 10);
  });

  it('三角形形心为三顶点均值（面积加权公式的特例）', () => {
    const c = polygonCentroid([
      [0, 0],
      [6, 0],
      [0, 3]
    ]);
    expect(c.x).toBeCloseTo(2, 10);
    expect(c.z).toBeCloseTo(1, 10);
  });

  it('退化多边形回退为顶点平均而不是 NaN', () => {
    const c = polygonCentroid([
      [1, 1],
      [3, 3],
      [5, 5]
    ]);
    expect(Number.isFinite(c.x)).toBe(true);
    expect(c.x).toBeCloseTo(3, 10);
    expect(c.z).toBeCloseTo(3, 10);
  });
});

describe('pointInPolygon', () => {
  const square = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4]
  ];
  // 顶部开 V 形缺口的凹多边形：z=3 时内部为 x∈[0,1] ∪ [3,4]
  const concave = [
    [0, 0],
    [4, 0],
    [4, 4],
    [2, 2],
    [0, 4]
  ];

  it('凸多边形：内外判定正确', () => {
    expect(pointInPolygon(2, 2, square)).toBe(true);
    expect(pointInPolygon(0.01, 0.01, square)).toBe(true);
    expect(pointInPolygon(-0.5, 2, square)).toBe(false);
    expect(pointInPolygon(4.5, 2, square)).toBe(false);
    expect(pointInPolygon(2, -1, square)).toBe(false);
    expect(pointInPolygon(2, 5, square)).toBe(false);
  });

  it('边界与顶点视为在内部', () => {
    expect(pointInPolygon(2, 0, square)).toBe(true);
    expect(pointInPolygon(0, 0, square)).toBe(true);
    expect(pointInPolygon(4, 4, square)).toBe(true);
  });

  it('凹多边形：缺口内部判为外部', () => {
    expect(pointInPolygon(2, 1, concave)).toBe(true);
    expect(pointInPolygon(0.5, 3, concave)).toBe(true);
    expect(pointInPolygon(3.5, 3, concave)).toBe(true);
    expect(pointInPolygon(2, 3, concave)).toBe(false);
    expect(pointInPolygon(2, 3.9, concave)).toBe(false);
  });

  it('顶点顺序反转不影响判定', () => {
    const rev = concave.slice().reverse();
    expect(pointInPolygon(2, 1, rev)).toBe(true);
    expect(pointInPolygon(2, 3, rev)).toBe(false);
  });
});

describe('clipPolygonByHalfPlane', () => {
  const square = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4]
  ];

  it('竖直裁剪线：keepLeft 保留 side ≥ 0 的一侧', () => {
    const left = clipPolygonByHalfPlane(square, 2, 0, 2, 4, true);
    expect(left).toEqual([
      [0, 0],
      [2, 0],
      [2, 4],
      [0, 4]
    ]);
    expect(polygonArea(left)).toBeCloseTo(8, 10);

    const right = clipPolygonByHalfPlane(square, 2, 0, 2, 4, false);
    expect(polygonArea(right)).toBeCloseTo(8, 10);
    expect(right.every(([x]) => x >= 2 - 1e-12)).toBe(true);
  });

  it('斜裁剪线切出三角形（对角线穿顶点时保留共线顶点，面积仍精确）', () => {
    // 过 (0,0)→(4,4) 的对角线：side(p) = 4·(pz − px)，keepLeft 保留 pz ≥ px 的一半
    const half = clipPolygonByHalfPlane(square, 0, 0, 4, 4, true);
    expect(polygonArea(half)).toBeCloseTo(8, 10);
    expect(half.every(([x, z]) => z >= x - 1e-12)).toBe(true);
    const other = clipPolygonByHalfPlane(square, 0, 0, 4, 4, false);
    expect(polygonArea(other)).toBeCloseTo(8, 10);
    expect(other.every(([x, z]) => z <= x + 1e-12)).toBe(true);

    // 不穿顶点的斜线：干净切出 3 顶点三角形
    const tri = clipPolygonByHalfPlane(square, 0, 2, 2, 0, false);
    expect(tri.length).toBe(3);
    expect(polygonArea(tri)).toBeCloseTo(2, 10);
  });

  it('完全在保留侧时返回等价副本；完全在丢弃侧时返回空', () => {
    const keep = clipPolygonByHalfPlane(square, 10, 0, 10, 4, true);
    expect(polygonArea(keep)).toBeCloseTo(16, 10);
    const drop = clipPolygonByHalfPlane(square, 10, 0, 10, 4, false);
    expect(drop.length).toBe(0);
  });

  it('两次半平面裁剪可切出条带两侧的残块（百老汇的做法）', () => {
    const wide = [
      [0, 0],
      [10, 0],
      [10, 4],
      [0, 4]
    ];
    const east = clipPolygonByHalfPlane(wide, 7, 0, 7, 4, false);
    const west = clipPolygonByHalfPlane(wide, 3, 0, 3, 4, true);
    expect(polygonArea(east)).toBeCloseTo(12, 10);
    expect(polygonArea(west)).toBeCloseTo(12, 10);
  });

  it('退化输入安全返回', () => {
    expect(clipPolygonByHalfPlane([], 0, 0, 1, 1, true)).toEqual([]);
    expect(clipPolygonByHalfPlane(square, 1, 1, 1, 1, true).length).toBe(4);
  });
});

describe('CITY 常量', () => {
  it('与契约给定数值一致', () => {
    expect(CITY.minX).toBe(-800);
    expect(CITY.maxX).toBe(800);
    expect(CITY.minZ).toBe(-2400);
    expect(CITY.maxZ).toBe(2400);
    expect(CITY.avenueXs).toEqual([-700, -420, -140, 140, 420, 700]);
    expect(CITY.streetSpacing).toBe(80);
    expect(CITY.avenueRoadWidth).toBe(34);
    expect(CITY.streetRoadWidth).toBe(20);
    expect(CITY.sidewalkWidth).toBe(6);
    expect(CITY.park).toEqual({ minX: -420, maxX: 140, minZ: -2080, maxZ: -720 });
    expect(CITY.broadway).toEqual({ ax: -700, az: -2400, bx: 300, bz: 2400, width: 30 });
    expect(CITY.bridge).toEqual({ z: 1900, startX: 760, endX: 1560 });
  });
});

describe('buildCityPlan 确定性', () => {
  it('同种子两次生成的数据部分深度相等', () => {
    const a = dataOf(buildCityPlan('nyc-2026'));
    const b = dataOf(buildCityPlan('nyc-2026'));
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('不同种子结果不同，数字种子同样可复现', () => {
    const a = JSON.stringify(dataOf(buildCityPlan('seed-a')).blocks);
    const b = JSON.stringify(dataOf(buildCityPlan('seed-b')).blocks);
    expect(a).not.toBe(b);
    expect(JSON.stringify(dataOf(buildCityPlan(1234)).blocks)).toBe(
      JSON.stringify(dataOf(buildCityPlan(1234)).blocks)
    );
    expect(JSON.stringify(dataOf(buildCityPlan(1234)).blocks)).not.toBe(
      JSON.stringify(dataOf(buildCityPlan(1235)).blocks)
    );
  });

  it('返回值完全可 JSON 序列化（方法丢失后数据仍完整）', () => {
    const round = dataOf(PLAN);
    expect(round.blocks.length).toBe(PLAN.blocks.length);
    expect(round.intersections.length).toBe(PLAN.intersections.length);
    expect(round.parkPolygon.length).toBe(4);
    expect(typeof round.isOnRoad).toBe('undefined');
    expect(JSON.stringify(round)).not.toContain('NaN');
    expect(JSON.stringify(round)).not.toContain('null');
  });
});

describe('路网结构', () => {
  it('街道按 80m 排布且跳过公园内部', () => {
    const zs = PLAN.streetZs;
    expect(zs[0]).toBe(CITY.minZ);
    expect(zs[zs.length - 1]).toBe(CITY.maxZ);
    for (const z of zs) {
      expect((z - CITY.minZ) % CITY.streetSpacing).toBe(0);
      const insidePark = z > CITY.park.minZ && z < CITY.park.maxZ;
      expect(insidePark).toBe(false);
    }
    // 公园两条边界街必须保留，公园内部 16 条被跳过
    expect(zs).toContain(CITY.park.minZ);
    expect(zs).toContain(CITY.park.maxZ);
    expect(zs.length).toBe(61 - 16);
    expect(PLAN.avenueXs).toEqual(CITY.avenueXs);
  });

  it('百老汇带状多边形角度约 11.8°、宽 30m', () => {
    const bw = PLAN.broadway;
    expect(bw.angleDeg).toBeGreaterThan(11.5);
    expect(bw.angleDeg).toBeLessThan(12.1);
    expect(bw.width).toBe(30);
    expect(Math.hypot(bw.dirX, bw.dirZ)).toBeCloseTo(1, 5);
    expect(bw.polygon.length).toBe(4);
    // 带宽 = 面积 / 长度
    const len = Math.hypot(bw.bx - bw.ax, bw.bz - bw.az);
    expect(polygonArea(bw.polygon) / len).toBeCloseTo(30, 3);
  });

  it('路口覆盖所有大道×街道，并含百老汇×大道的斜交口', () => {
    const ix = PLAN.intersections;
    const grid = ix.filter((i) => i.kind === 'avenue-street');
    expect(grid.length).toBe(CITY.avenueXs.length * PLAN.streetZs.length);
    expect(ix.filter((i) => i.kind === 'broadway-avenue').length).toBeGreaterThanOrEqual(3);
    expect(new Set(ix.map((i) => i.id)).size).toBe(ix.length);
    for (const i of grid) {
      expect(i.x).toBe(CITY.avenueXs[i.avenueIndex]);
      expect(i.z).toBe(PLAN.streetZs[i.streetIndex]);
    }
    // 绝大多数路口有信号灯
    const ratio = ix.filter((i) => i.hasSignal).length / ix.length;
    expect(ratio).toBeGreaterThan(0.9);
    // 百老汇交点确实落在百老汇路面上
    for (const i of ix.filter((x) => x.kind === 'broadway-avenue')) {
      expect(PLAN.isOnBroadway(i.x, i.z)).toBe(true);
    }
  });
});

describe('街区与地块', () => {
  it('街区数量与分区标签合规', () => {
    expect(PLAN.blocks.length).toBe((CITY.avenueXs.length - 1) * (PLAN.streetZs.length - 1));
    const allowed = new Set(['midtown', 'downtown', 'uptown', 'village', 'park']);
    for (const b of PLAN.blocks) {
      expect(allowed.has(b.district)).toBe(true);
      expect(b.maxX).toBeGreaterThan(b.minX);
      expect(b.maxZ).toBeGreaterThan(b.minZ);
      if (b.isPark) {
        expect(b.district).toBe('park');
        expect(b.lots.length).toBe(0);
      }
    }
    expect(PLAN.blocks.some((b) => b.isPark)).toBe(true);
    expect(PLAN.blocks.filter((b) => b.district === 'downtown').length).toBeGreaterThan(0);
    expect(PLAN.blocks.filter((b) => b.district === 'village').length).toBeGreaterThan(0);
  });

  it('分区按 Z 分段划分', () => {
    for (const b of PLAN.blocks) {
      if (b.isPark) continue;
      const z = b.centerZ;
      const expected = z < -720 ? 'uptown' : z < 300 ? 'midtown' : z < 1200 ? 'village' : 'downtown';
      expect(b.district).toBe(expected);
    }
  });

  it('地块字段完整、面积与多边形一致、朝向角合法', () => {
    const lots = allLots(PLAN);
    expect(lots.length).toBeGreaterThan(600);
    for (const { lot } of lots) {
      expect(typeof lot.id).toBe('string');
      expect(lot.polygon.length).toBeGreaterThanOrEqual(3);
      expect(['rect', 'triangle', 'poly']).toContain(lot.shape);
      expect(typeof lot.onBroadway).toBe('boolean');
      expect(typeof lot.corner).toBe('boolean');
      expect(lot.area).toBeGreaterThanOrEqual(220);
      expect(lot.area).toBeCloseTo(polygonArea(lot.polygon), 3);
      expect(lot.frontAngleDeg).toBeGreaterThanOrEqual(0);
      expect(lot.frontAngleDeg).toBeLessThan(360);
      const c = polygonCentroid(lot.polygon);
      expect(lot.centerX).toBeCloseTo(c.x, 3);
      expect(lot.centerZ).toBeCloseTo(c.z, 3);
    }
    expect(new Set(lots.map((e) => e.lot.id)).size).toBe(lots.length);
  });

  it('矩形地块面宽 ≥ 18m 且落在所属街区可建矩形内', () => {
    for (const { block, lot } of allLots(PLAN)) {
      const xs = lot.polygon.map((p) => p[0]);
      const zs = lot.polygon.map((p) => p[1]);
      if (lot.shape === 'rect') {
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(18 - 1e-6);
      }
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(block.minX - 1e-6);
      expect(Math.max(...xs)).toBeLessThanOrEqual(block.maxX + 1e-6);
      expect(Math.min(...zs)).toBeGreaterThanOrEqual(block.minZ - 1e-6);
      expect(Math.max(...zs)).toBeLessThanOrEqual(block.maxZ + 1e-6);
    }
  });

  it('三角地块 ≥ 8，且全部登记在 blocks 里', () => {
    expect(PLAN.triangleLots.length).toBeGreaterThanOrEqual(8);
    const ids = new Set(allLots(PLAN).map((e) => e.lot.id));
    for (const t of PLAN.triangleLots) {
      expect(t.shape).toBe('triangle');
      expect(ids.has(t.id)).toBe(true);
      expect(t.onBroadway).toBe(true);
    }
    // 多种子下都要达标（含随机抖动的鲁棒性）
    for (const seed of ['a', 'b', 'seed-14', 'seed-0', 42]) {
      expect(buildCityPlan(seed).triangleLots.length).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('空间约束', () => {
  it('地块顶点与形心都不压路面、不在公园、不在水里、不压百老汇', () => {
    for (const { lot } of allLots(PLAN)) {
      expect(PLAN.isOnRoad(lot.centerX, lot.centerZ)).toBe(false);
      expect(PLAN.isInPark(lot.centerX, lot.centerZ)).toBe(false);
      expect(PLAN.isWater(lot.centerX, lot.centerZ)).toBe(false);
      for (const [x, z] of lot.polygon) {
        expect(PLAN.isOnRoad(x, z)).toBe(false);
        expect(PLAN.isInPark(x, z)).toBe(false);
        expect(PLAN.isWater(x, z)).toBe(false);
        expect(PLAN.isOnBroadway(x, z)).toBe(false);
      }
    }
  });

  it('同街区内地块互不重叠（形心互测 + 抽样点互测）', () => {
    for (const block of PLAN.blocks) {
      const lots = block.lots;
      for (let i = 0; i < lots.length; i++) {
        for (let j = i + 1; j < lots.length; j++) {
          expect(pointInPolygon(lots[i].centerX, lots[i].centerZ, lots[j].polygon)).toBe(false);
          expect(pointInPolygon(lots[j].centerX, lots[j].centerZ, lots[i].polygon)).toBe(false);
        }
      }
      // 每个地块内部随机抽样点（用形心与顶点的中点，必在凸多边形内）不得落进邻块
      for (let i = 0; i < lots.length; i++) {
        const a = lots[i];
        for (const [vx, vz] of a.polygon) {
          const px = (a.centerX + vx) * 0.5;
          const pz = (a.centerZ + vz) * 0.5;
          for (let j = 0; j < lots.length; j++) {
            if (i === j) continue;
            expect(pointInPolygon(px, pz, lots[j].polygon)).toBe(false);
          }
        }
      }
    }
  });

  it('公园区域内没有任何地块', () => {
    const park = CITY.park;
    for (const { lot } of allLots(PLAN)) {
      const inside =
        lot.centerX > park.minX &&
        lot.centerX < park.maxX &&
        lot.centerZ > park.minZ &&
        lot.centerZ < park.maxZ;
      expect(inside).toBe(false);
    }
    expect(PLAN.parkPolygon).toEqual([
      [park.minX, park.minZ],
      [park.maxX, park.minZ],
      [park.maxX, park.maxZ],
      [park.minX, park.maxZ]
    ]);
    expect(polygonArea(PLAN.parkPolygon)).toBeCloseTo(560 * 1360, 6);
  });
});

describe('查询方法', () => {
  it('isOnRoad：大道/街道中心线上为真，街区内部为假', () => {
    expect(PLAN.isOnRoad(-140, 0)).toBe(true);
    expect(PLAN.isOnRoad(-140 + 17, 0)).toBe(true);
    expect(PLAN.isOnRoad(-140 + 17.5, 40)).toBe(false);
    expect(PLAN.isOnRoad(0, 320)).toBe(true);
    expect(PLAN.isOnRoad(0, 320 + 10)).toBe(true);
    expect(PLAN.isOnRoad(0, 320 + 10.5)).toBe(false);
  });

  it('isInPark：矩形内含边界为真', () => {
    expect(PLAN.isInPark(-100, -1400)).toBe(true);
    expect(PLAN.isInPark(CITY.park.minX, CITY.park.maxZ)).toBe(true);
    expect(PLAN.isInPark(-500, -1400)).toBe(false);
    expect(PLAN.isInPark(-100, 0)).toBe(false);
  });

  it('isWater：两河为水，陆地不是，桥面区域除外', () => {
    expect(PLAN.isWater(-900, 0)).toBe(true);
    expect(PLAN.isWater(900, 0)).toBe(true);
    expect(PLAN.isWater(0, 0)).toBe(false);
    expect(PLAN.isWater(-800, 0)).toBe(false);
    expect(PLAN.isWater(800, 0)).toBe(false);
    expect(PLAN.isWater(1000, CITY.bridge.z)).toBe(false);
    expect(PLAN.isWater(1000, CITY.bridge.z + 200)).toBe(true);
    expect(PLAN.isWater(1600, CITY.bridge.z)).toBe(true);
  });

  it('isOnBroadway：中心线上为真，带外为假，线段之外不延伸', () => {
    const bw = PLAN.broadway;
    const mx = (bw.ax + bw.bx) / 2;
    const mz = (bw.az + bw.bz) / 2;
    expect(PLAN.isOnBroadway(mx, mz)).toBe(true);
    // 沿法线偏移 14m 仍在路面上，偏移 16m 已出界
    const nx = (bw.bz - bw.az) / Math.hypot(bw.bx - bw.ax, bw.bz - bw.az);
    const nz = -(bw.bx - bw.ax) / Math.hypot(bw.bx - bw.ax, bw.bz - bw.az);
    expect(PLAN.isOnBroadway(mx + nx * 14, mz + nz * 14)).toBe(true);
    expect(PLAN.isOnBroadway(mx + nx * 16, mz + nz * 16)).toBe(false);
    expect(PLAN.isOnBroadway(bw.bx + 60, bw.bz + 300)).toBe(false);
    expect(PLAN.isOnBroadway(0, 0)).toBe(false);
  });
});

describe('性能预算', () => {
  it('buildCityPlan 在 120ms 内完成', () => {
    buildCityPlan('warmup'); // 预热，排除首次 JIT 编译影响
    const t0 = performance.now();
    const plan = buildCityPlan('perf-seed');
    const ms = performance.now() - t0;
    expect(plan.blocks.length).toBeGreaterThan(150);
    expect(ms).toBeLessThan(120);
  });
});
