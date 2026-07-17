import { PROJECT, WORLD } from '../config.js';
import { fbm2D } from '../core/noise.js';
import { createRandom, hashParts, hashString, hashToHex } from '../core/random.js';
import { skylineHeight, skylinePeaks } from '../core/math.js';

export const PLAN_CONSTANTS = Object.freeze({
  avenueCount: 9,
  streetCount: 19,
  avenueWidth: 9,
  streetWidth: 7,
  broadwayWidth: 10,
  edgeMarginX: 18,
  edgeMarginZ: 16,
  lotColumns: 2,
  lotRows: 2,
});

const EPSILON = 1e-7;
const round = (value, digits = 4) => Number(value.toFixed(digits));
const lerp = (a, b, t) => a + (b - a) * t;

const BROADWAY = (() => {
  const start = { x: -88, z: WORLD.minZ - 8 };
  const end = { x: 94, z: WORLD.maxZ + 8 };
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const direction = { x: (end.x - start.x) / length, z: (end.z - start.z) / length };
  return Object.freeze({
    start,
    end,
    direction,
    normal: { x: -direction.z, z: direction.x },
    length,
    width: PLAN_CONSTANTS.broadwayWidth,
  });
})();

export const LANDMARKS = Object.freeze([
  { id: 'one-wtc', name: 'One World Trade Center', nameZh: '世贸中心一号楼', x: -58, z: -205, height: 236, reserveRadius: 18 },
  { id: 'flatiron', name: 'Flatiron Building', nameZh: '熨斗大厦', x: -24, z: -92, height: 92, reserveRadius: 15 },
  { id: 'empire-state', name: 'Empire State Building', nameZh: '帝国大厦', x: 34, z: -44, height: 224, reserveRadius: 17 },
  { id: 'chrysler', name: 'Chrysler Building', nameZh: '克莱斯勒大厦', x: 76, z: -18, height: 205, reserveRadius: 16 },
  { id: '432-park', name: '432 Park Avenue', nameZh: '公园大道432号', x: 82, z: 6, height: 214, reserveRadius: 14 },
]);

export function broadwaySignedDistance(point) {
  return (point.x - BROADWAY.start.x) * BROADWAY.normal.x
    + (point.z - BROADWAY.start.z) * BROADWAY.normal.z;
}

function dedupePolygon(points) {
  const result = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.z - previous.z) > EPSILON) {
      result.push({ x: round(point.x), z: round(point.z) });
    }
  }
  if (result.length > 2 && Math.hypot(result[0].x - result.at(-1).x, result[0].z - result.at(-1).z) <= EPSILON) {
    result.pop();
  }
  return result;
}

export function clipPolygon(polygon, signedDistance) {
  if (!polygon.length) return [];
  const output = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[(index + polygon.length - 1) % polygon.length];
    const currentDistance = signedDistance(current);
    const previousDistance = signedDistance(previous);
    const currentInside = currentDistance >= -EPSILON;
    const previousInside = previousDistance >= -EPSILON;
    if (currentInside !== previousInside) {
      const t = previousDistance / (previousDistance - currentDistance);
      output.push({
        x: lerp(previous.x, current.x, t),
        z: lerp(previous.z, current.z, t),
      });
    }
    if (currentInside) output.push(current);
  }
  return dedupePolygon(output);
}

export function polygonArea(polygon) {
  let twiceArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    twiceArea += current.x * next.z - next.x * current.z;
  }
  return Math.abs(twiceArea) / 2;
}

function polygonCenter(polygon) {
  const total = polygon.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), { x: 0, z: 0 });
  return { x: round(total.x / polygon.length), z: round(total.z / polygon.length) };
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = ((a.z > point.z) !== (b.z > point.z))
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function islandHalfWidth(z) {
  const t = Math.max(0, Math.min(1, (z - WORLD.minZ) / (WORLD.maxZ - WORLD.minZ)));
  const fullHalfWidth = (WORLD.maxX - WORLD.minX) / 2;
  // Narrow Battery and Harlem ends, broad central Manhattan body.
  const taper = 0.58 + 0.42 * Math.sin(Math.PI * Math.pow(t, 0.86));
  return fullHalfWidth * taper;
}

export function insideIsland(x, z, margin = 0) {
  if (z < WORLD.minZ + margin || z > WORLD.maxZ - margin) return false;
  const centerX = (WORLD.minX + WORLD.maxX) / 2;
  return Math.abs(x - centerX) <= islandHalfWidth(z) - margin;
}

export function intersectsRect(bounds, rectangle, padding = 0) {
  return bounds.maxX > rectangle.minX - padding
    && bounds.minX < rectangle.maxX + padding
    && bounds.maxZ > rectangle.minZ - padding
    && bounds.minZ < rectangle.maxZ + padding;
}

function createRoads() {
  const { avenueCount, streetCount, avenueWidth, streetWidth, edgeMarginX, edgeMarginZ } = PLAN_CONSTANTS;
  const avenues = Array.from({ length: avenueCount }, (_, index) => {
    const x = lerp(WORLD.minX + edgeMarginX, WORLD.maxX - edgeMarginX, index / (avenueCount - 1));
    return {
      id: `avenue-${index + 1}`,
      type: 'avenue',
      index,
      x: round(x),
      width: avenueWidth,
      start: { x: round(x), z: WORLD.minZ },
      end: { x: round(x), z: WORLD.maxZ },
    };
  });
  const streets = Array.from({ length: streetCount }, (_, index) => {
    const z = lerp(WORLD.minZ + edgeMarginZ, WORLD.maxZ - edgeMarginZ, index / (streetCount - 1));
    return {
      id: `street-${index + 1}`,
      type: 'street',
      index,
      z: round(z),
      width: streetWidth,
      start: { x: WORLD.minX, z: round(z) },
      end: { x: WORLD.maxX, z: round(z) },
    };
  });
  const broadway = {
    id: 'broadway',
    type: 'broadway',
    width: BROADWAY.width,
    start: { ...BROADWAY.start },
    end: { ...BROADWAY.end },
    direction: { ...BROADWAY.direction },
    angleRad: Math.atan2(BROADWAY.direction.z, BROADWAY.direction.x),
  };
  return { avenues, streets, broadway, roads: [...avenues, ...streets, broadway] };
}

function createBlocks(avenues, streets) {
  const blocks = [];
  const halfBroadway = BROADWAY.width / 2;
  for (let row = 0; row < streets.length - 1; row += 1) {
    for (let column = 0; column < avenues.length - 1; column += 1) {
      const bounds = {
        minX: avenues[column].x + avenues[column].width / 2,
        maxX: avenues[column + 1].x - avenues[column + 1].width / 2,
        minZ: streets[row].z + streets[row].width / 2,
        maxZ: streets[row + 1].z - streets[row + 1].width / 2,
      };
      const rectangle = [
        { x: bounds.minX, z: bounds.minZ },
        { x: bounds.maxX, z: bounds.minZ },
        { x: bounds.maxX, z: bounds.maxZ },
        { x: bounds.minX, z: bounds.maxZ },
      ];
      const distances = rectangle.map(broadwaySignedDistance);
      const cutByBroadway = Math.min(...distances) < halfBroadway && Math.max(...distances) > -halfBroadway;
      const pieces = cutByBroadway
        ? [
            { side: 'west', polygon: clipPolygon(rectangle, (point) => broadwaySignedDistance(point) - halfBroadway) },
            { side: 'east', polygon: clipPolygon(rectangle, (point) => -broadwaySignedDistance(point) - halfBroadway) },
          ]
        : [{ side: null, polygon: rectangle }];
      for (const piece of pieces) {
        const area = polygonArea(piece.polygon);
        if (piece.polygon.length < 3 || area < 24) continue;
        const center = polygonCenter(piece.polygon);
        if (!insideIsland(center.x, center.z, 1)) continue;
        const isTriangle = piece.polygon.length === 3;
        blocks.push({
          id: `block-${row}-${column}${piece.side ? `-${piece.side}` : ''}`,
          row,
          column,
          bounds,
          polygon: piece.polygon,
          center,
          area: round(area, 2),
          broadwayCut: cutByBroadway,
          broadwaySide: piece.side,
          isTriangle,
          shape: isTriangle ? 'triangle' : cutByBroadway ? 'broadway-cut' : 'rectangle',
        });
      }
    }
  }
  return blocks;
}

function landmarkCollision(bounds, landmarks) {
  return landmarks.some((landmark) => {
    const closestX = Math.max(bounds.minX, Math.min(landmark.x, bounds.maxX));
    const closestZ = Math.max(bounds.minZ, Math.min(landmark.z, bounds.maxZ));
    return Math.hypot(closestX - landmark.x, closestZ - landmark.z) < landmark.reserveRadius;
  });
}

function createBuildingLots(seed, avenues, streets, landmarks) {
  const lots = [];
  const rng = createRandom(seed).fork('building-lots');
  const halfBroadway = BROADWAY.width / 2;
  const styles = ['limestone', 'brick', 'glass', 'stone', 'terracotta'];
  for (let row = 0; row < streets.length - 1; row += 1) {
    const minZ = streets[row].z + streets[row].width / 2 + 1.1;
    const maxZ = streets[row + 1].z - streets[row + 1].width / 2 - 1.1;
    for (let column = 0; column < avenues.length - 1; column += 1) {
      const minX = avenues[column].x + avenues[column].width / 2 + 1.1;
      const maxX = avenues[column + 1].x - avenues[column + 1].width / 2 - 1.1;
      const cellWidth = (maxX - minX) / PLAN_CONSTANTS.lotColumns;
      const cellDepth = (maxZ - minZ) / PLAN_CONSTANTS.lotRows;
      for (let lotRow = 0; lotRow < PLAN_CONSTANTS.lotRows; lotRow += 1) {
        for (let lotColumn = 0; lotColumn < PLAN_CONSTANTS.lotColumns; lotColumn += 1) {
          const id = `lot-${row}-${column}-${lotRow}-${lotColumn}`;
          const localRng = rng.fork(id);
          const nominalX = minX + (lotColumn + 0.5) * cellWidth;
          const nominalZ = minZ + (lotRow + 0.5) * cellDepth;
          const width = cellWidth * localRng.range(0.62, 0.84);
          const depth = cellDepth * localRng.range(0.62, 0.84);
          const x = nominalX + localRng.range(-0.07, 0.07) * cellWidth;
          const z = nominalZ + localRng.range(-0.07, 0.07) * cellDepth;
          const bounds = {
            minX: x - width / 2,
            maxX: x + width / 2,
            minZ: z - depth / 2,
            maxZ: z + depth / 2,
          };
          if (!insideIsland(bounds.minX, bounds.minZ, 1)
            || !insideIsland(bounds.maxX, bounds.minZ, 1)
            || !insideIsland(bounds.minX, bounds.maxZ, 1)
            || !insideIsland(bounds.maxX, bounds.maxZ, 1)) continue;
          if (intersectsRect(bounds, WORLD.park, 2.5) || landmarkCollision(bounds, landmarks)) continue;
          const broadwayProjection = Math.abs(BROADWAY.normal.x) * width / 2 + Math.abs(BROADWAY.normal.z) * depth / 2;
          if (Math.abs(broadwaySignedDistance({ x, z })) < halfBroadway + broadwayProjection + 1.2) continue;

          const ceiling = skylineHeight(x, z);
          const textureNoise = fbm2D(x * 0.018, z * 0.018, { seed: hashParts(seed, 'height'), octaves: 3 });
          const heightFactor = 0.28 + 0.7 * Math.pow(localRng.next(), 0.72);
          const height = Math.max(10, ceiling * heightFactor + textureNoise * 8);
          const district = z < -125 ? 'downtown' : z < WORLD.park.minZ ? 'midtown' : 'uptown';
          lots.push({
            id,
            row,
            column,
            x: round(x),
            z: round(z),
            width: round(width),
            depth: round(depth),
            height: round(height),
            maxHeight: round(ceiling),
            rotationY: 0,
            style: localRng.pick(styles),
            roofType: localRng.pick(['flat', 'setback', 'crown']),
            district,
            polygon: [
              { x: round(bounds.minX), z: round(bounds.minZ) },
              { x: round(bounds.maxX), z: round(bounds.minZ) },
              { x: round(bounds.maxX), z: round(bounds.maxZ) },
              { x: round(bounds.minX), z: round(bounds.maxZ) },
            ],
          });
        }
      }
    }
  }
  return lots;
}

function planHash(seed, roads, blocks, buildingLots, landmarks) {
  const payload = {
    seed,
    roads: roads.map((road) => [road.id, road.x ?? road.z ?? road.start.x, road.width]),
    blocks: blocks.map((block) => [block.id, block.shape, block.polygon]),
    lots: buildingLots.map((lot) => [lot.id, lot.x, lot.z, lot.width, lot.depth, lot.height, lot.style]),
    landmarks: landmarks.map(({ id, x, z, height }) => [id, x, z, height]),
  };
  return hashString(JSON.stringify(payload), hashParts('manhattan-plan-v1', seed));
}

export function createCityPlan(seedInput = PROJECT.defaultSeed) {
  const seed = typeof seedInput === 'number' && Number.isFinite(seedInput)
    ? seedInput >>> 0
    : hashString(String(seedInput));
  const { roads, avenues, streets, broadway } = createRoads();
  const landmarks = LANDMARKS.map((landmark) => ({ ...landmark }));
  const blocks = createBlocks(avenues, streets);
  const buildingLots = createBuildingLots(seed, avenues, streets, landmarks);
  const hash32 = planHash(seed, roads, blocks, buildingLots, landmarks);
  const hash = hashToHex(hash32);
  const peaks = skylinePeaks();
  const triangleBlockCount = blocks.filter((block) => block.isTriangle).length;
  const stats = {
    avenueCount: avenues.length,
    streetCount: streets.length,
    roadCount: roads.length,
    blockCount: blocks.length,
    triangleBlockCount,
    broadwayCutBlockCount: blocks.filter((block) => block.broadwayCut).length,
    buildingLotCount: buildingLots.length,
    landmarkCount: landmarks.length,
    downtownPeakHeight: round(skylineHeight(0, peaks.downtownZ)),
    midtownPeakHeight: round(skylineHeight(0, peaks.midtownZ)),
    valleyHeight: round(skylineHeight(0, peaks.valleyZ)),
  };
  return {
    version: 1,
    seed,
    hash,
    hash32,
    signature: `manhattan-v1-${seed}-${hash}`,
    bounds: {
      minX: WORLD.minX,
      maxX: WORLD.maxX,
      minZ: WORLD.minZ,
      maxZ: WORLD.maxZ,
    },
    park: { ...WORLD.park },
    roads,
    avenues,
    streets,
    broadway,
    blocks,
    buildingLots,
    landmarks,
    stats,
  };
}
