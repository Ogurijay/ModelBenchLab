// 城市规划:路网 / 街块 / 地块 / 地标保留区 / 红绿灯节点。
// 纯数学、无 three 依赖 —— 同一种子必须给出逐字节相同的规划(可单测)。
import { Rng } from '../core/prng.js';
import { makeFbm2D } from '../core/noise.js';

export const CITY = {
  aveXs: [-180, -90, 0, 90, 180],
  aveW: 20,
  streetZ0: -560, streetGap: 56, streetCount: 21, streetW: 12, // z = -560 … 560
  colXs: [[-240, -190], [-170, -100], [-80, -10], [10, 80], [100, 170], [190, 240]],
  park: { x0: -170, x1: 170, z0: -560, z1: -392 },
  batteryZ: 448,                                    // 以南为炮台公园绿地
  broadway: { x0: -150, z0: -560, dxdz: 0.3, halfW: 10, zEnd: 460 },
  island: { zN: -596, zS: 616 },
  bridge: { z: 60, corridor: 18 },                  // 大桥引道走廊(东侧)
  floor: 3.6,                                       // 层高(米)
};

export function islandHalfWidth(z) {
  const { zN, zS } = CITY.island;
  if (z < zN || z > zS) return 0;
  if (z < -500) return 250 - ((-500 - z) / 96) * 95;     // 北端收窄 250 → 155
  if (z <= 300) return 250;
  return Math.max(36, 250 - (z - 300) * 0.68);           // 南端锥形收窄
}

export function broadwayX(z) {
  const b = CITY.broadway;
  return b.x0 + b.dxdz * (z - b.z0);
}

export function insideIsland(x, z, margin = 0) {
  return Math.abs(x) <= islandHalfWidth(z) - margin;
}

export function inPark(x, z, pad = 0) {
  const p = CITY.park;
  return x > p.x0 - pad && x < p.x1 + pad && z > p.z0 - pad && z < p.z1 + pad;
}

// 到百老汇中线的带符号垂距(东正西负)
export function broadwayDist(x, z) {
  const k = CITY.broadway.dxdz;
  return (x - broadwayX(z)) / Math.sqrt(1 + k * k);
}

// ---------- 多边形工具 ----------
export function polyArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.z - b.x * a.z;
  }
  return Math.abs(s) / 2;
}

export function polyCentroid(poly) {
  let cx = 0, cz = 0;
  for (const p of poly) { cx += p.x; cz += p.z; }
  return { x: cx / poly.length, z: cz / poly.length };
}

// 半平面裁剪(Sutherland–Hodgman):保留 distFn(p) >= 0 的部分
export function clipPoly(poly, distFn) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = distFn(a), db = distFn(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

// ---------- 双峰天际线高度场(中城 + 下城两簇,对应真实曼哈顿基岩深度分布) ----------
const gauss = (t) => Math.exp(-t * t);
export function districtHeight(x, z, n01) {
  const midtown = 175 * gauss((z + 235) / 125);
  const downtown = 135 * gauss((z - 330) / 90);
  const h = 15 + (midtown + downtown) * (0.35 + 0.65 * n01);
  return Math.min(285, Math.max(11, h));
}

// ---------- 总规划 ----------
export function buildPlan(seed) {
  const rng = new Rng(seed);
  const lotRng = rng.fork('lots');
  const fbm = makeFbm2D(rng.fork('height').int(1, 2 ** 30), 4);

  const streets = [];
  for (let i = 0; i < CITY.streetCount; i++) streets.push(CITY.streetZ0 + i * CITY.streetGap);

  const halfSW = CITY.streetW / 2, halfAW = CITY.aveW / 2;

  // 地标保留区(街块级)
  const landmarks = {
    esb: { x: 45, z: -252, col: 3, si: 5 },        // 帝国大厦
    chrysler: { x: 135, z: -252, col: 4, si: 5 },  // 克莱斯勒
    wtc: { x: -45, z: 308, col: 2, si: 15 },       // 世贸一号
    liberty: { x: -140, z: 700 },                  // 自由女神(海上小岛)
    timesSquare: { x: -90, z: -362 },              // 百老汇 × 大道交点
  };

  const blocks = [];
  const wedges = [];
  let flatironWedge = null;

  for (let ci = 0; ci < CITY.colXs.length; ci++) {
    const [cx0, cx1] = CITY.colXs[ci];
    for (let si = 0; si < streets.length - 1; si++) {
      const z0 = streets[si] + halfSW, z1 = streets[si + 1] - halfSW;
      const rect = [
        { x: cx0, z: z0 }, { x: cx1, z: z0 },
        { x: cx1, z: z1 }, { x: cx0, z: z1 },
      ];
      const c = polyCentroid(rect);

      // 出岛 / 公园 / 炮台绿地 / 大桥引道 → 不建楼
      const cornersIn = rect.every((p) => insideIsland(p.x, p.z, 4));
      if (!cornersIn) continue;
      const overlapPark = !(cx1 < CITY.park.x0 || cx0 > CITY.park.x1 || z1 < CITY.park.z0 || z0 > CITY.park.z1);
      if (overlapPark) continue;
      if (z0 >= CITY.batteryZ) continue;
      const inBridgeCorridor = ci === 5 && Math.abs(c.z - CITY.bridge.z) < CITY.streetGap;
      if (inBridgeCorridor) continue;

      const reserved =
        (ci === landmarks.esb.col && si === landmarks.esb.si) ? 'esb' :
        (ci === landmarks.chrysler.col && si === landmarks.chrysler.si) ? 'chrysler' :
        (ci === landmarks.wtc.col && si === landmarks.wtc.si) ? 'wtc' : null;

      const block = { x0: cx0, x1: cx1, z0, z1, cx: c.x, cz: c.z, ci, si, reserved, cutByBroadway: false };

      // 百老汇斜切
      if (c.z < CITY.broadway.zEnd + 40 && !reserved) {
        const ds = rect.map((p) => broadwayDist(p.x, p.z));
        const dMin = Math.min(...ds), dMax = Math.max(...ds);
        const hw = CITY.broadway.halfW;
        if (dMin < hw && dMax > -hw) {
          block.cutByBroadway = true;
          const east = clipPoly(rect, (p) => broadwayDist(p.x, p.z) - hw);
          const west = clipPoly(rect, (p) => -broadwayDist(p.x, p.z) - hw);
          for (const poly of [east, west]) {
            if (poly.length >= 3 && polyArea(poly) > 150) {
              const wc = polyCentroid(poly);
              const n01 = fbm(wc.x * 0.011, wc.z * 0.011);
              const h = Math.max(14, Math.round(districtHeight(wc.x, wc.z, n01) * 0.55 / CITY.floor) * CITY.floor);
              wedges.push({ poly, cx: wc.x, cz: wc.z, h, area: polyArea(poly) });
            }
          }
        }
      }
      blocks.push(block);
    }
  }

  // 熨斗大厦:选取最接近「百老汇 × 第 x=0 大道」交点(z≈-60)的楔形地块
  let bestD = Infinity;
  for (const w of wedges) {
    const d = Math.hypot(w.cx - 2, w.cz + 60);
    if (d < bestD && w.area > 200 && w.area < 1600) { bestD = d; flatironWedge = w; }
  }
  if (flatironWedge) wedges.splice(wedges.indexOf(flatironWedge), 1);

  // ---------- 地块与楼宇参数 ----------
  const lots = [];
  for (const b of blocks) {
    if (b.reserved || b.cutByBroadway) continue;
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    const cols = Math.max(1, Math.round(w / 34));
    const rows = Math.max(1, Math.round(d / 26));
    const cw = w / cols, cd = d / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (lotRng.chance(0.05)) continue; // 留白(停车场/空地)
        const cx = b.x0 + (i + 0.5) * cw, cz = b.z0 + (j + 0.5) * cd;
        const fw = cw * lotRng.range(0.72, 0.9);
        const fd = cd * lotRng.range(0.7, 0.88);
        const n01 = fbm(cx * 0.011, cz * 0.011);
        let h = districtHeight(cx, cz, n01) * lotRng.range(0.82, 1.18);
        h = Math.max(9, Math.round(h / CITY.floor) * CITY.floor);
        let kind;
        if (h >= 140 || (cz > 240 && h >= 100 && lotRng.chance(0.7))) kind = 'glass';
        else if (h <= 23) kind = 'brick';
        else kind = lotRng.pick(['stoneA', 'stoneA', 'stoneB', 'brick']);
        lots.push({ x: cx, z: cz, w: fw, d: fd, h, kind, r: lotRng.next() });
      }
    }
  }

  // ---------- 红绿灯节点(大道 × 街道) ----------
  const nodes = [];
  for (let ai = 0; ai < CITY.aveXs.length; ai++) {
    const x = CITY.aveXs[ai];
    for (let si = 0; si < streets.length; si++) {
      const z = streets[si];
      if (!insideIsland(x, z, 16)) continue;
      if (inPark(x, z, 8)) continue;
      // 相位偏移:沿大道做绿波
      const phaseOffset = ((z + 560) * 0.055 + (x + 180) * 0.012) % 26;
      nodes.push({ id: nodes.length, ai, si, x, z, phaseOffset });
    }
  }

  return {
    seed, streets, blocks, lots, wedges, flatironWedge, nodes, landmarks,
    stats: { blocks: blocks.length, lots: lots.length, wedges: wedges.length, nodes: nodes.length },
  };
}
