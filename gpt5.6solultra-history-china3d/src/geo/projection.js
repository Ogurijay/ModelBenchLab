/**
 * 全国沙盘所用的轻量地理投影与程序化地形函数。
 *
 * 这里刻意只保存一份低精度教学轮廓，不冒充测绘级行政边界。经纬度数据采用
 * [longitude, latitude]（经度、纬度），Three.js 世界坐标采用 x 向东、z 向南。
 */

export const GEO_BOUNDS = Object.freeze({
  minLon: 73,
  maxLon: 135,
  minLat: 18,
  maxLat: 54,
});

export const MAP_WIDTH = 150;
export const MAP_CENTER = Object.freeze({ lon: 104, lat: 36 });

const LONGITUDE_SCALE = MAP_WIDTH / (GEO_BOUNDS.maxLon - GEO_BOUNDS.minLon);
// 等距圆柱投影在中国中纬度附近的纵横修正，让全国轮廓不会被压扁。
const LATITUDE_SCALE = LONGITUDE_SCALE / Math.cos((MAP_CENTER.lat * Math.PI) / 180);
const DEFAULT_TERRAIN_SEED = 0x5a17c9e3;

const freezeOutline = (points) => Object.freeze(
  points.map(([lon, lat]) => Object.freeze([lon, lat])),
);

/**
 * 中国大陆简化轮廓。点数只服务于实时沙盘，不用于导航、测绘或边界判定。
 */
export const CHINA_OUTLINE = freezeOutline([
  [73.6, 39.4],
  [74.2, 40.8],
  [76.3, 40.9],
  [78.0, 41.7],
  [79.8, 42.1],
  [80.4, 44.8],
  [82.5, 45.5],
  [84.7, 47.0],
  [87.0, 49.1],
  [89.2, 49.4],
  [91.0, 48.0],
  [93.0, 48.0],
  [95.0, 49.1],
  [97.3, 49.0],
  [98.2, 47.8],
  [99.3, 46.8],
  [100.5, 45.2],
  [101.8, 43.6],
  [103.1, 42.65],
  [105.2, 42.35],
  [107.5, 42.4],
  [109.5, 42.5],
  [111.5, 43.7],
  [113.5, 44.8],
  [115.3, 45.3],
  [116.4, 48.6],
  [117.8, 49.75],
  [119.0, 50.2],
  [120.2, 50.0],
  [121.5, 52.5],
  [123.0, 53.5],
  [124.2, 53.0],
  [125.3, 51.25],
  [127.0, 49.8],
  [129.8, 49.5],
  [131.0, 47.7],
  [133.0, 48.0],
  [134.8, 48.4],
  [134.2, 47.1],
  [133.0, 45.2],
  [131.0, 44.8],
  [130.5, 43.4],
  [129.0, 42.5],
  [128.0, 41.6],
  [126.5, 41.4],
  [125.0, 40.4],
  [123.5, 39.8],
  [122.0, 39.0],
  [121.0, 38.5],
  [120.7, 37.8],
  [121.8, 36.8],
  [120.8, 35.5],
  [120.0, 34.5],
  [120.3, 33.0],
  [121.9, 31.2],
  [121.3, 30.3],
  [121.0, 29.0],
  [120.3, 27.8],
  [119.8, 26.2],
  [119.0, 25.4],
  [118.1, 24.5],
  [116.8, 23.1],
  [115.5, 22.8],
  [114.3, 22.3],
  [112.7, 21.6],
  [110.7, 20.9],
  [109.4, 21.5],
  [108.0, 21.5],
  [107.0, 22.0],
  [106.5, 22.7],
  [105.5, 23.1],
  [104.3, 22.7],
  [102.8, 22.4],
  [101.8, 21.2],
  [100.2, 21.5],
  [99.2, 23.0],
  [98.3, 24.1],
  [97.5, 25.2],
  [98.6, 27.4],
  [98.0, 28.2],
  [96.5, 28.4],
  [95.0, 29.2],
  [93.0, 28.6],
  [91.5, 27.8],
  [90.0, 28.0],
  [88.8, 27.3],
  [87.0, 27.9],
  [85.0, 28.2],
  [82.5, 30.0],
  [80.2, 30.6],
  [79.0, 32.2],
  [78.0, 33.4],
  [76.5, 34.5],
  [75.5, 36.0],
  [74.5, 37.3],
]);

export const HAINAN_OUTLINE = freezeOutline([
  [108.62, 19.38],
  [108.80, 18.72],
  [109.25, 18.18],
  [110.05, 18.12],
  [110.72, 18.40],
  [111.03, 19.10],
  [110.78, 19.78],
  [110.18, 20.12],
  [109.45, 20.04],
  [108.84, 19.75],
]);

export const TAIWAN_OUTLINE = freezeOutline([
  [120.02, 23.55],
  [120.18, 22.62],
  [120.65, 21.92],
  [121.12, 22.35],
  [121.58, 23.25],
  [121.95, 24.35],
  [121.74, 25.15],
  [121.18, 25.36],
  [120.62, 24.75],
  [120.25, 24.05],
]);

export const CHINA_ISLAND_OUTLINES = Object.freeze([
  HAINAN_OUTLINE,
  TAIWAN_OUTLINE,
]);

function readLonLat(lonOrPoint, latitude) {
  if (Array.isArray(lonOrPoint)) {
    return { lon: Number(lonOrPoint[0]), lat: Number(lonOrPoint[1]) };
  }
  if (lonOrPoint && typeof lonOrPoint === 'object') {
    return {
      lon: Number(lonOrPoint.lon ?? lonOrPoint.longitude),
      lat: Number(lonOrPoint.lat ?? lonOrPoint.latitude),
    };
  }
  return { lon: Number(lonOrPoint), lat: Number(latitude) };
}

function readPlanarPoint(point) {
  if (Array.isArray(point)) return { x: Number(point[0]), y: Number(point[1]) };
  if (point && typeof point === 'object') {
    return {
      x: Number(point.lon ?? point.longitude ?? point.x),
      y: Number(point.lat ?? point.latitude ?? point.z ?? point.y),
    };
  }
  return { x: Number.NaN, y: Number.NaN };
}

/**
 * 经纬度投影为 Three.js 沙盘坐标。全国东西宽度约为 150 个世界单位。
 */
export function projectLonLat(lonOrPoint, latitude) {
  const { lon, lat } = readLonLat(lonOrPoint, latitude);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new TypeError('projectLonLat 需要有效的经度和纬度');
  }
  const x = (lon - MAP_CENTER.lon) * LONGITUDE_SCALE;
  const z = (MAP_CENTER.lat - lat) * LATITUDE_SCALE;
  // 同时保留数组与命名属性，兼容 `[x, z] = projectLonLat(...)` 和 `point.x` 两种读取方式。
  return Object.assign([x, z], { x, z });
}

/**
 * Three.js 沙盘坐标反投影为经纬度。
 */
export function unprojectXZ(xOrPoint, zValue) {
  const x = Number(
    xOrPoint && typeof xOrPoint === 'object'
      ? (Array.isArray(xOrPoint) ? xOrPoint[0] : xOrPoint.x)
      : xOrPoint,
  );
  const z = Number(
    xOrPoint && typeof xOrPoint === 'object'
      ? (Array.isArray(xOrPoint) ? xOrPoint[1] : xOrPoint.z)
      : zValue,
  );
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError('unprojectXZ 需要有效的 x 和 z 坐标');
  }
  const lon = x / LONGITUDE_SCALE + MAP_CENTER.lon;
  const lat = MAP_CENTER.lat - z / LATITUDE_SCALE;
  return Object.assign([lon, lat], { lon, lat });
}

function pointOnSegment(point, start, end, epsilon = 1e-9) {
  const cross = (point.y - start.y) * (end.x - start.x)
    - (point.x - start.x) * (end.y - start.y);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (point.x - start.x) * (end.x - start.x)
    + (point.y - start.y) * (end.y - start.y);
  if (dot < -epsilon) return false;
  const squaredLength = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return dot <= squaredLength + epsilon;
}

/**
 * 射线法判断点是否位于多边形内；边界点也视为内部。
 * 点和多边形既可使用 [x, y]，也可使用 {lon, lat} / {x, z}。
 */
export function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  const target = readPlanarPoint(point);
  if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) return false;

  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = readPlanarPoint(polygon[index]);
    const b = readPlanarPoint(polygon[previous]);
    if (pointOnSegment(target, a, b)) return true;
    const crosses = ((a.y > target.y) !== (b.y > target.y))
      && target.x < ((b.x - a.x) * (target.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/**
 * 判断经纬度是否落在大陆、海南或台湾的简化展示轮廓内。
 */
export function isInsideChina(lonOrPoint, latitude) {
  const point = readLonLat(lonOrPoint, latitude);
  if (!Number.isFinite(point.lon) || !Number.isFinite(point.lat)) return false;
  const pair = [point.lon, point.lat];
  return pointInPolygon(pair, CHINA_OUTLINE)
    || pointInPolygon(pair, HAINAN_OUTLINE)
    || pointInPolygon(pair, TAIWAN_OUTLINE);
}

/**
 * FNV-1a 32 位字符串哈希（hash，稳定散列）。
 */
export function hashString(value, seed = 0x811c9dc5) {
  let hash = Number(seed) >>> 0;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * mulberry32 确定性伪随机数生成器。相同 seed 会产生完全相同的 0..1 序列。
 */
export function seededRandom(seed = 1) {
  let state = (
    typeof seed === 'number' && Number.isFinite(seed)
      ? Math.trunc(seed)
      : hashString(seed)
  ) >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smootherStep = (value) => {
  const t = clamp01(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const gaussian = (value) => Math.exp(-(value * value));

function hashUnit(x, y, seed) {
  let value = Math.imul(x | 0, 0x1f123bb5)
    ^ Math.imul(y | 0, 0x5f356495)
    ^ (seed >>> 0);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967295;
}

function valueNoise(lon, lat, frequency, seed) {
  const x = lon * frequency;
  const y = lat * frequency;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smootherStep(x - x0);
  const ty = smootherStep(y - y0);
  const a = hashUnit(x0, y0, seed);
  const b = hashUnit(x0 + 1, y0, seed);
  const c = hashUnit(x0, y0 + 1, seed);
  const d = hashUnit(x0 + 1, y0 + 1, seed);
  const north = a + (b - a) * tx;
  const south = c + (d - c) * tx;
  return (north + (south - north) * ty) * 2 - 1;
}

function fractalNoise(lon, lat, seed) {
  let sum = 0;
  let amplitude = 0.58;
  let frequency = 0.17;
  let normalizer = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    sum += valueNoise(lon, lat, frequency, seed + octave * 0x9e3779b9) * amplitude;
    normalizer += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / normalizer;
}

/**
 * 返回沙盘世界单位的程序化地形高度。
 *
 * 模型先建立“西高东低”的三级阶梯，再叠加青藏高原、喜马拉雅、天山、
 * 横断山等隆起，并压低塔里木、四川和东部平原。它追求宏观地貌可信，
 * 不是精确 DEM（数字高程模型）。
 */
export function terrainHeight(lonOrPoint, latitude, seed = DEFAULT_TERRAIN_SEED) {
  const { lon, lat } = readLonLat(lonOrPoint, latitude);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return 0;

  const westness = clamp01((GEO_BOUNDS.maxLon - lon) / (GEO_BOUNDS.maxLon - GEO_BOUNDS.minLon));
  let height = 0.20 + 1.18 * westness ** 1.55;

  const tibetanPlateau = 5.25
    * gaussian((lon - 88.7) / 10.8)
    * gaussian((lat - 32.3) / 5.8);
  const himalayaLatitude = 27.7 + (lon - 82) * 0.055;
  const himalaya = 3.65
    * gaussian((lon - 86.5) / 8.3)
    * gaussian((lat - himalayaLatitude) / 0.95);
  const tianShan = 2.55
    * gaussian((lon - 83.5) / 7.8)
    * gaussian((lat - 42.8) / 1.25);
  const kunlun = 1.75
    * gaussian((lon - 91.5) / 10.5)
    * gaussian((lat - 36.0) / 1.15);
  const hengduan = 2.35
    * gaussian((lon - 99.5) / 3.0)
    * gaussian((lat - 29.0) / 5.0);
  const qinling = 0.88
    * gaussian((lon - 108.0) / 6.8)
    * gaussian((lat - 33.7) / 0.8);
  const taiwanRange = 3.55
    * gaussian((lon - 121.05) / 0.58)
    * gaussian((lat - 23.75) / 1.75);
  const hainanHighland = 1.42
    * gaussian((lon - 109.65) / 0.72)
    * gaussian((lat - 18.85) / 0.72);

  const tarimBasin = 1.18
    * gaussian((lon - 83.0) / 6.4)
    * gaussian((lat - 39.5) / 2.1);
  const sichuanBasin = 1.48
    * gaussian((lon - 104.5) / 3.2)
    * gaussian((lat - 30.6) / 2.0);
  const easternPlain = 0.72
    * gaussian((lon - 116.5) / 7.7)
    * gaussian((lat - 34.2) / 6.2);

  height += tibetanPlateau + himalaya + tianShan + kunlun + hengduan
    + qinling + taiwanRange + hainanHighland
    - tarimBasin - sichuanBasin - easternPlain;

  const reliefStrength = 0.24 + Math.min(1.25, Math.max(0, height) * 0.16);
  height += fractalNoise(lon, lat, Number(seed) >>> 0) * reliefStrength;

  // 海岸低地随经度和距南部海岸逐渐贴近海平面。
  const coastalEase = clamp01((lon - 112) / 11) * clamp01((35 - lat) / 15);
  height -= coastalEase * 0.24;
  return Math.max(0.16, Math.min(11.5, height));
}

function shadeHex(hex, factor) {
  const red = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * factor)));
  const green = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * factor)));
  const blue = Math.max(0, Math.min(255, Math.round((hex & 255) * factor)));
  return (red << 16) | (green << 8) | blue;
}

/**
 * 按经纬度和高度返回 Three.js 可直接使用的十六进制生物群落颜色。
 */
export function terrainBiomeColor(lonOrPoint, latitude, heightValue, seed = DEFAULT_TERRAIN_SEED) {
  const { lon, lat } = readLonLat(lonOrPoint, latitude);
  const height = Number.isFinite(heightValue)
    ? Number(heightValue)
    : terrainHeight(lon, lat, seed);

  const desert = (
    (lon < 96 && lat > 35 && lat < 43)
    || (lon >= 96 && lon < 108 && lat > 39)
  );

  let color;
  if (height > 8.3) color = 0xdce3df; // 高山积雪
  else if (height > 6.0) color = 0xaaa28e; // 裸岩和高寒荒原
  else if (desert && height < 4.8) color = 0xb69a63; // 荒漠
  else if (lat < 24.0) color = 0x3f774c; // 热带、亚热带常绿植被
  else if (height > 3.8) color = 0x7a7954; // 山地灌丛
  else if (height > 2.0) color = 0x66805a; // 丘陵与高原草地
  else if (lon > 110 && lat > 30 && lat < 41) color = 0x6f935f; // 东部平原
  else if (lat > 43) color = 0x68805a; // 北方森林草原
  else color = 0x5f8757;

  const variation = valueNoise(lon, lat, 0.42, (Number(seed) + 0x45d9f3b) >>> 0);
  return shadeHex(color, 0.93 + variation * 0.055);
}
