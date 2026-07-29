import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHINA_OUTLINE,
  HAINAN_OUTLINE,
  MAP_WIDTH,
  TAIWAN_OUTLINE,
  hashString,
  isInsideChina,
  pointInPolygon,
  projectLonLat,
  seededRandom,
  terrainBiomeColor,
  terrainHeight,
  unprojectXZ,
} from '../src/geo/projection.js';

test('全国投影宽约 150，且经纬度往返不漂移', () => {
  const west = projectLonLat(73, 36);
  const east = projectLonLat(135, 36);
  assert.ok(Math.abs((east.x - west.x) - MAP_WIDTH) < 1e-10);

  const samples = [
    [87.6177, 43.7928],
    [104.0665, 30.5728],
    [116.4074, 39.9042],
    [121.4737, 31.2304],
    [113.2644, 23.1291],
  ];
  for (const [lon, lat] of samples) {
    const projected = projectLonLat(lon, lat);
    const restored = unprojectXZ(projected.x, projected.z);
    assert.ok(Math.abs(restored.lon - lon) < 1e-10);
    assert.ok(Math.abs(restored.lat - lat) < 1e-10);
  }
});

test('简化轮廓能区分典型境内城市、岛屿与境外地点', () => {
  const inside = [
    [116.4074, 39.9042], // 北京
    [121.4737, 31.2304], // 上海
    [104.0665, 30.5728], // 成都
    [91.1322, 29.6604], // 拉萨
    [87.6177, 43.7928], // 乌鲁木齐
    [110.3312, 20.0319], // 海口
    [121.00, 23.70], // 台湾岛中部
  ];
  inside.forEach(([lon, lat]) => assert.equal(isInsideChina(lon, lat), true, `${lon},${lat} 应在轮廓内`));

  const outside = [
    [139.6917, 35.6895], // 东京
    [77.1025, 28.7041], // 新德里
    [106.9057, 47.8864], // 乌兰巴托
    [105.8342, 21.0278], // 河内
    [0, 0],
  ];
  outside.forEach(([lon, lat]) => assert.equal(isInsideChina(lon, lat), false, `${lon},${lat} 应在轮廓外`));

  assert.equal(pointInPolygon(CHINA_OUTLINE[0], CHINA_OUTLINE), true, '边界点应视为内部');
  assert.equal(pointInPolygon([110.0, 19.2], HAINAN_OUTLINE), true);
  assert.equal(pointInPolygon([121.0, 23.7], TAIWAN_OUTLINE), true);
});

test('宏观高程符合西高东低，并保留主要山地与平原差异', () => {
  const tibetanPlateau = terrainHeight(88.5, 31.5);
  const easternPlain = terrainHeight(121.0, 31.3);
  const tianShan = terrainHeight(83.5, 42.8);
  const northChinaPlain = terrainHeight(116.5, 36.0);

  assert.ok(tibetanPlateau > easternPlain + 4.0, `青藏高原 ${tibetanPlateau} 应显著高于东部 ${easternPlain}`);
  assert.ok(tianShan > northChinaPlain + 1.5, `天山 ${tianShan} 应高于华北平原 ${northChinaPlain}`);
  assert.ok(easternPlain > 0 && easternPlain < 2.0);
});

test('地形、颜色、哈希与种子随机流完全确定', () => {
  const firstHeight = terrainHeight(102.7, 25.0);
  const secondHeight = terrainHeight(102.7, 25.0);
  assert.equal(firstHeight, secondHeight);
  assert.equal(terrainBiomeColor(102.7, 25.0), terrainBiomeColor(102.7, 25.0));
  assert.equal(hashString('春秋战国'), hashString('春秋战国'));
  assert.notEqual(hashString('春秋战国'), hashString('秦汉'));

  const first = seededRandom('china-terrain');
  const second = seededRandom('china-terrain');
  const third = seededRandom('another-seed');
  const sequenceA = Array.from({ length: 8 }, () => first());
  const sequenceB = Array.from({ length: 8 }, () => second());
  const sequenceC = Array.from({ length: 8 }, () => third());
  assert.deepEqual(sequenceA, sequenceB);
  assert.notDeepEqual(sequenceA, sequenceC);
  sequenceA.forEach((value) => assert.ok(value >= 0 && value < 1));
});
