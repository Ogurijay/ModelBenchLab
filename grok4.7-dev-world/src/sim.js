export const GRID = 36;
export const CELL = 2;
export const HEIGHT = 8;
export const WATER_LEVEL = 1.35;
export const TICK_SECONDS = 2.5;
export const DAY_SECONDS = 120;
export const SAVE_VERSION = 1;

export const WATCHES = ['夜半', '鸡鸣', '平旦', '日出', '食时', '隅中', '日中', '日昃', '晡时', '日入', '黄昏', '人定'];

export const RESOURCE_NAMES = {
  timber: '木料',
  clay: '陶土',
  grain: '口粮',
  coin: '铜钱',
};

const HOUSING = { hut: 3, hall: 5, well: 2 };
const FOOTPRINT = {
  hut: 0.82,
  hall: 1.05,
  farm: 0.9,
  grove: 0.85,
  kiln: 0.75,
  pier: 0.7,
  orchard: 0.9,
  well: 0.55,
  lamp: 0.32,
  tower: 0.7,
};

export const BUILDINGS = {
  road: {
    name: '土路',
    key: '1',
    cost: { clay: 1 },
    blurb: '铺在空草坡或沙地上',
    verb: '铺上了一段土路。',
  },
  hut: {
    name: '茅舍',
    key: '2',
    cost: { timber: 8 },
    blurb: '容纳 3 人',
    verb: '立起了一间茅舍。',
  },
  farm: {
    name: '田垄',
    key: '3',
    cost: { timber: 5 },
    blurb: '每轮产出口粮',
    verb: '开出了一垄田。',
  },
  grove: {
    name: '林场',
    key: '4',
    cost: { timber: 6 },
    blurb: '立在树丛里，产出木料',
    verb: '圈下了一片林场。',
  },
  kiln: {
    name: '陶窑',
    key: '5',
    cost: { timber: 8, clay: 4 },
    blurb: '立在沙地，产出陶土',
    verb: '砌好了一座陶窑。',
  },
  pier: {
    name: '栈桥',
    key: '6',
    cost: { timber: 10 },
    blurb: '靠水而建，带来铜钱',
    verb: '把栈桥伸进了水里。',
  },
  orchard: {
    name: '果林',
    key: '7',
    cost: { timber: 5, grain: 2 },
    blurb: '草坡上结出口粮',
    verb: '种下了一片果林。',
  },
  well: {
    name: '水井',
    key: '8',
    cost: { clay: 6 },
    blurb: '多容纳 2 人',
    verb: '打出了一口水井。',
  },
  lamp: {
    name: '路灯',
    key: '9',
    cost: { clay: 2 },
    blurb: '草坡、沙地或岩石上',
    verb: '点起了一盏路灯。',
  },
  hall: {
    name: '公所',
    key: '0',
    cost: { timber: 16, clay: 8 },
    blurb: '容纳 5 人，人多时生钱',
    verb: '盖起了洲上公所。',
  },
  tower: {
    name: '望楼',
    key: 'T',
    cost: { timber: 12, clay: 5 },
    blurb: '岩石或草坡，每轮有望钱',
    verb: '立起了望楼。',
  },
};

const RANK_STEPS = [
  { name: '营地', min: 0 },
  { name: '村落', min: 28 },
  { name: '圩镇', min: 60 },
  { name: '开洲', min: 96 },
];

export function cameraPlan(yaw) {
  return {
    fx: -Math.sin(yaw),
    fz: -Math.cos(yaw),
    rx: Math.cos(yaw),
    rz: -Math.sin(yaw),
  };
}

export function headingName(yaw) {
  const { fx, fz } = cameraPlan(yaw);
  const turned = (Math.atan2(fx, fz) * 180 / Math.PI + 360) % 360;
  const labels = ['南', '东南', '东', '东北', '北', '西北', '西', '西南'];
  return labels[Math.round(turned / 45) % 8];
}

export function watchName(time) {
  const t = ((time % 1) + 1) % 1;
  return WATCHES[Math.min(11, Math.floor(t * 12))];
}

export function keyOf(ix, iz) {
  return `${ix},${iz}`;
}

export function inBounds(ix, iz) {
  return ix >= 0 && iz >= 0 && ix < GRID && iz < GRID;
}

export function cellCenter(ix, iz) {
  const half = (GRID * CELL) / 2;
  return {
    x: -half + (ix + 0.5) * CELL,
    z: -half + (iz + 0.5) * CELL,
  };
}

export function worldToCell(x, z) {
  const half = (GRID * CELL) / 2;
  return {
    ix: Math.floor((x + half) / CELL),
    iz: Math.floor((z + half) / CELL),
  };
}

function hash2(ix, iz, seed) {
  let n = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 1440662683);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, z, seed) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = x - x0;
  const tz = z - z0;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return a * (1 - sx) * (1 - sz) + b * sx * (1 - sz) + c * (1 - sx) * sz + d * sx * sz;
}

function fbm(x, z, seed) {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < 4; i += 1) {
    sum += amp * (valueNoise(x * freq, z * freq, seed + i * 17) * 2 - 1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.05;
  }
  return sum / norm;
}

export function relief(x, z, seed) {
  const half = (GRID * CELL) / 2;
  const d = Math.hypot(x / half, z / half);
  const dome = Math.max(0, 1 - d * d);
  const n = fbm(x * 0.045, z * 0.045, seed);
  const ridge = fbm(x * 0.09 + 12, z * 0.09, seed + 3);
  return Math.max(0, 0.07 + dome * 0.64 + n * 0.15 * (0.35 + dome) + Math.max(0, ridge) * 0.08 * dome);
}

export function classify(x, z, seed) {
  const h = relief(x, z, seed);
  let kind = 'deep';
  if (h > 0.72) kind = 'rock';
  else if (h > 0.3) kind = 'grass';
  else if (h > 0.18) kind = 'sand';
  else if (h > 0.105) kind = 'shallow';
  const half = (GRID * CELL) / 2;
  const d = Math.hypot(x / half, z / half);
  const clump = valueNoise(x * 0.08, z * 0.08, seed + 23);
  const forest = kind === 'grass' && clump > 0.56 && d < 0.78;
  return { h, kind, forest };
}

export function forEachCell(seed, fn) {
  for (let iz = 0; iz < GRID; iz += 1) {
    for (let ix = 0; ix < GRID; ix += 1) {
      const p = cellCenter(ix, iz);
      fn(ix, iz, classify(p.x, p.z, seed), p);
    }
  }
}

function neighbors(ix, iz) {
  return [
    [ix + 1, iz],
    [ix - 1, iz],
    [ix, iz + 1],
    [ix, iz - 1],
  ];
}

export function findStart(seed) {
  let best = null;
  let bestD = Infinity;
  forEachCell(seed, (ix, iz, info, p) => {
    if (info.kind !== 'grass' || info.forest) return;
    const d = p.x * p.x + p.z * p.z;
    if (d < bestD) {
      bestD = d;
      best = { ix, iz };
    }
  });
  if (best) return best;
  let high = null;
  let highH = -1;
  forEachCell(seed, (ix, iz, info) => {
    if (info.h > highH) {
      highH = info.h;
      high = { ix, iz };
    }
  });
  return high;
}

function blank(seed) {
  return {
    seed,
    time: 0.32,
    speed: 1,
    paused: false,
    resources: { timber: 26, clay: 14, grain: 22, coin: 4 },
    pop: 2,
    hunger: 0,
    buildings: [],
    roads: [],
    cleared: [],
    log: [],
    tickCount: 0,
    celebrated: false,
    spawn: { ix: 0, iz: 0 },
  };
}

export function pushLog(state, text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 6);
}

export function createGame(seed = 20260922) {
  const state = blank(seed);
  const spot = findStart(seed);
  state.spawn = { ix: spot.ix, iz: spot.iz };
  state.buildings.push({ type: 'hut', ix: spot.ix, iz: spot.iz, rot: 0, free: true });
  pushLog(state, '勘测员在淤洲上岸，册子从第一页写起。');
  return state;
}

export function cellInfo(state, ix, iz) {
  const p = cellCenter(ix, iz);
  const info = classify(p.x, p.z, state.seed);
  if (state.cleared.includes(keyOf(ix, iz))) info.forest = false;
  return info;
}

export function occupant(state, ix, iz) {
  const key = keyOf(ix, iz);
  if (state.roads.includes(key)) return 'road';
  const found = state.buildings.find((b) => b.ix === ix && b.iz === iz);
  return found ? found.type : null;
}

export function housingOf(state) {
  return state.buildings.reduce((sum, b) => sum + (HOUSING[b.type] || 0), 0);
}

export function development(state) {
  const kinds = new Set(state.buildings.map((b) => b.type)).size;
  return state.pop * 4
    + state.buildings.length * 5
    + state.roads.length
    + kinds * 4
    + Math.floor(state.resources.coin / 3);
}

export function rankName(score) {
  let name = RANK_STEPS[0].name;
  for (const step of RANK_STEPS) {
    if (score >= step.min) name = step.name;
  }
  return name;
}

export function rankProgress(score) {
  const top = RANK_STEPS[RANK_STEPS.length - 1].min;
  return Math.max(0, Math.min(1, score / top));
}

export function noteRank(state) {
  if (!state.celebrated && rankName(development(state)) === '开洲') {
    state.celebrated = true;
    pushLog(state, '册上落印：这片淤洲，开了。');
    return true;
  }
  return false;
}

function terrainOk(state, type, ix, iz) {
  const c = cellInfo(state, ix, iz);
  const near = (pred) => neighbors(ix, iz).some(([x, z]) => inBounds(x, z) && pred(cellInfo(state, x, z)));
  if (type === 'road') return (c.kind === 'grass' || c.kind === 'sand') && !c.forest;
  if (type === 'grove') return c.kind === 'grass' && c.forest;
  if (type === 'kiln') return c.kind === 'sand';
  if (type === 'pier') {
    return (c.kind === 'sand' || c.kind === 'shallow') && near((n) => n.kind === 'shallow' || n.kind === 'deep');
  }
  if (type === 'lamp') return c.kind === 'grass' || c.kind === 'sand' || c.kind === 'rock';
  if (type === 'tower') return c.kind === 'rock' || (c.kind === 'grass' && !c.forest);
  if (type === 'hut' || type === 'farm' || type === 'orchard' || type === 'well' || type === 'hall') {
    return c.kind === 'grass' && !c.forest;
  }
  return false;
}

function terrainReason(type) {
  if (type === 'grove') return '林场要立在树丛里。';
  if (type === 'pier') return '栈桥得靠着水。';
  if (type === 'kiln') return '陶窑要立在沙地上。';
  if (type === 'road') return '土路只能铺在没有树的草坡或沙地。';
  if (type === 'tower') return '望楼要立在岩石或空草坡上。';
  if (type === 'lamp') return '路灯只能立在草坡、沙地或岩石上。';
  return '这块地立不住。';
}

export function whyNot(state, type, ix, iz) {
  const spec = BUILDINGS[type];
  if (!spec) return '没有这种印。';
  if (!inBounds(ix, iz)) return '出了洲界。';
  if (state.buildings.length >= 80 && type !== 'road') return '册子上的屋子写满了。';
  if (state.roads.length >= 220 && type === 'road') return '路已经铺得够远了。';
  if (occupant(state, ix, iz)) return '这里已经有东西了。';
  if (!terrainOk(state, type, ix, iz)) return terrainReason(type);
  for (const [id, amount] of Object.entries(spec.cost)) {
    if ((state.resources[id] || 0) < amount) return `${RESOURCE_NAMES[id]}不够。`;
  }
  return '';
}

function pay(state, cost) {
  for (const [id, amount] of Object.entries(cost)) state.resources[id] -= amount;
}

function gain(state, id, amount) {
  state.resources[id] = Math.max(0, Math.min(999, state.resources[id] + amount));
}

export function suggestRot(state, type, ix, iz) {
  if (type !== 'pier') return 0;
  const order = [
    [0, 1, 0],
    [1, 0, 1],
    [0, -1, 2],
    [-1, 0, 3],
  ];
  for (const [dx, dz, rot] of order) {
    const x = ix + dx;
    const z = iz + dz;
    if (!inBounds(x, z)) continue;
    const kind = cellInfo(state, x, z).kind;
    if (kind === 'deep' || kind === 'shallow') return rot;
  }
  return 0;
}

export function place(state, type, ix, iz, rot = 0) {
  const reason = whyNot(state, type, ix, iz);
  if (reason) return { ok: false, reason };
  const spec = BUILDINGS[type];
  pay(state, spec.cost);
  const turned = ((rot % 4) + 4) % 4;
  if (type === 'road') state.roads.push(keyOf(ix, iz));
  else {
    state.buildings.push({ type, ix, iz, rot: turned, free: false });
    if (type === 'grove') state.cleared.push(keyOf(ix, iz));
  }
  pushLog(state, spec.verb);
  return { ok: true, celebrated: noteRank(state) };
}

export function canDemolish(state, ix, iz) {
  return Boolean(occupant(state, ix, iz));
}

export function demolish(state, ix, iz) {
  const key = keyOf(ix, iz);
  const roadAt = state.roads.indexOf(key);
  if (roadAt >= 0) {
    state.roads.splice(roadAt, 1);
    gain(state, 'clay', 1);
    pushLog(state, '把土路铲平，陶土收回来了。');
    return { ok: true, refund: { clay: 1 } };
  }
  const index = state.buildings.findIndex((b) => b.ix === ix && b.iz === iz);
  if (index < 0) return { ok: false, reason: '这里没有可拆的东西。' };
  const building = state.buildings[index];
  state.buildings.splice(index, 1);
  const refund = {};
  if (!building.free) {
    for (const [id, amount] of Object.entries(BUILDINGS[building.type].cost)) {
      const back = Math.floor(amount * 0.4);
      if (back > 0) {
        refund[id] = back;
        gain(state, id, back);
      }
    }
  }
  pushLog(state, building.free ? '最初那间茅舍拆掉了。' : '拆掉了一处建筑，退回四成材料。');
  return { ok: true, refund };
}

function producers(state) {
  const got = { timber: 0, clay: 0, grain: 0, coin: 0 };
  for (const b of state.buildings) {
    if (b.type === 'farm') got.grain += 2;
    if (b.type === 'orchard') got.grain += 1;
    if (b.type === 'grove') {
      const beside = neighbors(b.ix, b.iz).some(([x, z]) => inBounds(x, z) && cellInfo(state, x, z).forest);
      got.timber += beside ? 2 : 1;
    }
    if (b.type === 'kiln') {
      const beside = neighbors(b.ix, b.iz).some(([x, z]) => {
        if (!inBounds(x, z)) return false;
        const kind = cellInfo(state, x, z).kind;
        return kind === 'sand' || kind === 'shallow';
      });
      got.clay += beside ? 2 : 1;
    }
    if (b.type === 'pier') got.coin += 2;
    if (b.type === 'hall' && state.pop >= 4) got.coin += 1;
    if (b.type === 'tower') got.coin += 1;
  }
  return got;
}

export function tick(state) {
  state.tickCount += 1;
  const got = producers(state);
  for (const id of Object.keys(got)) gain(state, id, got[id]);
  const eat = Math.max(1, Math.floor(state.pop / 2));
  if (state.resources.grain >= eat) {
    state.resources.grain -= eat;
    state.hunger = 0;
  } else {
    state.resources.grain = 0;
    state.hunger += 1;
    if (state.hunger >= 2 && state.pop > 1) {
      state.pop -= 1;
      state.hunger = 0;
      pushLog(state, '口粮断了，有人离开了淤洲。');
    }
  }
  if (state.pop < housingOf(state) && state.resources.grain >= 8) {
    state.resources.grain -= 4;
    state.pop += 1;
    pushLog(state, '又有一家在洲上落下了脚。');
  }
  return noteRank(state);
}

export function blocked(state, x, z) {
  const { ix, iz } = worldToCell(x, z);
  if (!inBounds(ix, iz)) return true;
  const info = cellInfo(state, ix, iz);
  const pierHere = state.buildings.some((b) => b.type === 'pier' && b.ix === ix && b.iz === iz);
  if (info.kind === 'deep' && !pierHere) return true;
  for (const b of state.buildings) {
    const radius = FOOTPRINT[b.type];
    if (!radius) continue;
    const p = cellCenter(b.ix, b.iz);
    const reach = radius + 0.36;
    if ((x - p.x) ** 2 + (z - p.z) ** 2 < reach * reach) return true;
  }
  return false;
}

export function spawnPoint(state) {
  const home = state.buildings.find((b) => b.type === 'hut') || state.buildings[0];
  const origin = home ? cellCenter(home.ix, home.iz) : cellCenter(state.spawn.ix, state.spawn.iz);
  const tries = [
    [CELL, 0],
    [-CELL, 0],
    [0, CELL],
    [0, -CELL],
    [CELL, CELL],
    [-CELL, CELL],
    [CELL * 1.5, 0],
    [0, 0],
  ];
  for (const [dx, dz] of tries) {
    const x = origin.x + dx;
    const z = origin.z + dz;
    if (!blocked(state, x, z)) return { x, z };
  }
  return { x: origin.x, z: origin.z };
}

export function pack(state) {
  return {
    v: SAVE_VERSION,
    seed: state.seed,
    time: state.time,
    speed: state.speed,
    paused: state.paused,
    resources: { ...state.resources },
    pop: state.pop,
    hunger: state.hunger,
    buildings: state.buildings.map((b) => ({
      type: b.type,
      ix: b.ix,
      iz: b.iz,
      rot: b.rot,
      free: Boolean(b.free),
    })),
    roads: [...state.roads],
    cleared: [...state.cleared],
    log: state.log.slice(0, 6),
    tickCount: state.tickCount,
    celebrated: Boolean(state.celebrated),
  };
}

function finiteResource(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(999, Math.floor(value))) : fallback;
}

export function unpack(raw) {
  if (!raw || raw.v !== SAVE_VERSION || !Number.isInteger(raw.seed)) return null;
  const state = blank(raw.seed);
  state.time = Number.isFinite(raw.time) ? ((raw.time % 1) + 1) % 1 : state.time;
  state.speed = [1, 2, 4].includes(raw.speed) ? raw.speed : 1;
  state.paused = Boolean(raw.paused);
  state.resources = {
    timber: finiteResource(raw.resources?.timber, 0),
    clay: finiteResource(raw.resources?.clay, 0),
    grain: finiteResource(raw.resources?.grain, 0),
    coin: finiteResource(raw.resources?.coin, 0),
  };
  state.pop = Number.isInteger(raw.pop) ? Math.max(1, Math.min(36, raw.pop)) : 1;
  state.hunger = Number.isInteger(raw.hunger) ? Math.max(0, Math.min(4, raw.hunger)) : 0;
  state.tickCount = Number.isInteger(raw.tickCount) ? Math.max(0, raw.tickCount) : 0;
  state.celebrated = Boolean(raw.celebrated);
  const seen = new Set();
  for (const item of Array.isArray(raw.buildings) ? raw.buildings : []) {
    if (!item || !BUILDINGS[item.type] || item.type === 'road') continue;
    if (!Number.isInteger(item.ix) || !Number.isInteger(item.iz) || !inBounds(item.ix, item.iz)) continue;
    const key = keyOf(item.ix, item.iz);
    if (seen.has(key)) continue;
    seen.add(key);
    state.buildings.push({
      type: item.type,
      ix: item.ix,
      iz: item.iz,
      rot: Number.isInteger(item.rot) ? ((item.rot % 4) + 4) % 4 : 0,
      free: Boolean(item.free),
    });
    if (item.type === 'grove') state.cleared.push(key);
  }
  for (const road of Array.isArray(raw.roads) ? raw.roads : []) {
    if (typeof road !== 'string' || seen.has(road)) continue;
    const [ix, iz] = road.split(',').map((n) => Number(n));
    if (!Number.isInteger(ix) || !Number.isInteger(iz) || !inBounds(ix, iz)) continue;
    seen.add(road);
    state.roads.push(road);
  }
  state.cleared = [...new Set(state.cleared)];
  state.log = Array.isArray(raw.log) ? raw.log.filter((line) => typeof line === 'string').slice(0, 6) : [];
  const spot = state.buildings.find((b) => b.type === 'hut') || findStart(state.seed);
  state.spawn = { ix: spot.ix, iz: spot.iz };
  if (!state.buildings.length) {
    state.buildings.push({ type: 'hut', ix: spot.ix, iz: spot.iz, rot: 0, free: true });
  }
  return state;
}
