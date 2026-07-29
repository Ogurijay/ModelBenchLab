import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROL_TYPES, ERAS } from '../src/data/eras.js';
import {
  CITIES,
  PROVINCE_LEVEL_REGIONS,
  formatYear,
  getCityNameAtYear,
} from '../src/data/cities.js';

const REQUIRED_ERA_FIELDS = [
  'id',
  'year',
  'label',
  'period',
  'summary',
  'architecture',
  'styleKey',
  'factions',
  'events',
  'external',
  'terrainNotes',
  'confidence',
];

const EXPECTED_ERA_YEARS = [-770, -300, -221, 2, 229, 750, 1142, 1279, 1421, 1759, 1912, 2025];

const REQUIRED_CITY_FIELDS = [
  'id',
  'name',
  'lon',
  'lat',
  'region',
  'biome',
  'signature',
  'founded',
  'importance',
  'historicalNames',
];

test('时代数据恰好包含十二个指定关键帧且按时间升序排列', () => {
  assert.equal(ERAS.length, 12);
  assert.deepEqual(ERAS.map((era) => era.year), EXPECTED_ERA_YEARS);
  assert.equal(new Set(ERAS.map((era) => era.id)).size, ERAS.length);
});

test('每个时代关键帧都具备完整说明、风格与可信度字段', () => {
  for (const era of ERAS) {
    for (const field of REQUIRED_ERA_FIELDS) {
      assert.ok(Object.hasOwn(era, field), `${era.id} 缺少 ${field}`);
    }

    for (const field of ['id', 'label', 'period', 'summary', 'architecture', 'styleKey', 'terrainNotes']) {
      assert.equal(typeof era[field], 'string', `${era.id}.${field} 必须是字符串`);
      assert.ok(era[field].trim().length > 0, `${era.id}.${field} 不能为空`);
    }

    assert.ok(Number.isFinite(era.year));
    assert.ok(['high', 'medium', 'inferred'].includes(era.confidence));
    assert.ok(era.factions.length > 0, `${era.id} 至少应有一个势力`);
    assert.ok(era.events.length > 0, `${era.id} 至少应有一个事件`);
    assert.ok(era.external.length > 0, `${era.id} 至少应有一个海外背景`);
  }
});

test('势力数据包含可渲染中心点、颜色、影响度和控制类型', () => {
  const cityIds = new Set(CITIES.map((city) => city.id));

  for (const era of ERAS) {
    assert.equal(new Set(era.factions.map((faction) => faction.id)).size, era.factions.length);

    for (const faction of era.factions) {
      for (const field of ['id', 'name', 'color', 'center', 'influence', 'controlType']) {
        assert.ok(Object.hasOwn(faction, field), `${era.id} 的势力缺少 ${field}`);
      }

      assert.match(faction.color, /^#[0-9a-f]{6}$/i);
      assert.ok(cityIds.has(faction.centerCityId), `${faction.id} 引用了不存在的中心城市`);
      assert.ok(Array.isArray(faction.center) && faction.center.length === 2);
      assert.ok(Number.isFinite(faction.center[0]));
      assert.ok(Number.isFinite(faction.center[1]));
      assert.ok(faction.center[0] >= -180 && faction.center[0] <= 180);
      assert.ok(faction.center[1] >= -90 && faction.center[1] <= 90);
      assert.ok(faction.influence >= 0 && faction.influence <= 1);
      assert.ok(CONTROL_TYPES.includes(faction.controlType));
    }
  }
});

test('事件与海外背景满足时间轴标记和世界地图绘制契约', () => {
  for (const era of ERAS) {
    for (const event of era.events) {
      for (const field of ['name', 'year', 'lon', 'lat', 'kind', 'summary']) {
        assert.ok(Object.hasOwn(event, field), `${era.id} 的事件缺少 ${field}`);
      }
      assert.ok(Number.isFinite(event.year));
      assert.ok(Number.isFinite(event.lon) && event.lon >= -180 && event.lon <= 180);
      assert.ok(Number.isFinite(event.lat) && event.lat >= -90 && event.lat <= 90);
      assert.ok(event.name.length > 0 && event.kind.length > 0 && event.summary.length > 0);
    }

    for (const external of era.external) {
      for (const field of ['region', 'name', 'color', 'event']) {
        assert.ok(Object.hasOwn(external, field), `${era.id} 的海外背景缺少 ${field}`);
      }
      assert.ok(external.region.length > 0 && external.name.length > 0 && external.event.length > 0);
      assert.match(external.color, /^#[0-9a-f]{6}$/i);
    }
  }
});

test('城市数据不少于四十五座、主键唯一且字段可用于程序化生成', () => {
  assert.ok(CITIES.length >= 45);
  assert.equal(new Set(CITIES.map((city) => city.id)).size, CITIES.length);

  for (const city of CITIES) {
    for (const field of REQUIRED_CITY_FIELDS) {
      assert.ok(Object.hasOwn(city, field), `${city.id} 缺少 ${field}`);
    }

    assert.match(city.id, /^[a-z0-9-]+$/);
    assert.ok(city.name.length > 0 && city.region.length > 0);
    assert.ok(city.biome.length > 0 && city.signature.length > 0);
    assert.ok(Number.isFinite(city.lon) && city.lon >= 73 && city.lon <= 136);
    assert.ok(Number.isFinite(city.lat) && city.lat >= 18 && city.lat <= 54);
    assert.ok(Number.isInteger(city.founded) && city.founded <= 2025);
    assert.ok(Number.isInteger(city.importance) && city.importance >= 1 && city.importance <= 5);
    assert.ok(city.historicalNames.length > 0);

    for (const historicalName of city.historicalNames) {
      assert.ok(historicalName.name.length > 0);
      assert.ok(Number.isInteger(historicalName.from));
      assert.ok(historicalName.to === null || Number.isInteger(historicalName.to));
      if (historicalName.to !== null) {
        assert.ok(historicalName.from <= historicalName.to);
      }
    }

    assert.equal(getCityNameAtYear(city, 2025), city.name);
  }
});

test('城市注册表覆盖全部省级行政区与主要历史古都', () => {
  const coveredRegions = new Set(CITIES.map((city) => city.region));
  for (const region of PROVINCE_LEVEL_REGIONS) {
    assert.ok(coveredRegions.has(region), `缺少省级行政区代表城市：${region}`);
  }

  const cityIds = new Set(CITIES.map((city) => city.id));
  const historicalCapitals = [
    'beijing',
    'xian',
    'xianyang',
    'luoyang',
    'kaifeng',
    'nanjing',
    'hangzhou',
    'anyang',
    'zhengzhou',
    'handan',
    'linzi',
    'datong',
    'shenyang',
    'chengdu',
    'jingzhou',
    'dali',
    'yinchuan',
  ];

  for (const id of historicalCapitals) {
    assert.ok(cityIds.has(id), `缺少主要历史古都：${id}`);
  }
});

test('年份格式与历史名称查询可直接供时间轴使用', () => {
  assert.equal(formatYear(-770), '公元前770年');
  assert.equal(formatYear(0), '公元纪年交界');
  assert.equal(formatYear(1), '公元元年');
  assert.equal(formatYear(2025), '公元2025年');
  assert.equal(formatYear(Number.NaN), '');

  assert.equal(getCityNameAtYear('beijing', 1300), '大都');
  assert.equal(getCityNameAtYear('xian', 750), '长安');
  assert.equal(getCityNameAtYear('hangzhou', 1142), '临安');
  assert.equal(getCityNameAtYear('kaifeng', -300), '大梁');
  assert.equal(getCityNameAtYear('shenyang', 1759), '奉天');
  assert.equal(getCityNameAtYear('urumqi', 1912), '迪化');
  assert.equal(getCityNameAtYear('hong-kong', 1759), null);
  assert.equal(getCityNameAtYear('not-a-city', 2025), null);
});
