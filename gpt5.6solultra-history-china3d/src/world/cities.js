import * as THREE from 'three';
import { assignFaction } from '../core/territory.js';
import { getCityNameAtYear } from '../data/cities.js';
import { hashString, projectLonLat, seededRandom, terrainHeight } from '../geo/projection.js';

const BIOME_COLORS = {
  plain: 0x4f604d,
  river: 0x405e58,
  coast: 0x365958,
  basin: 0x526048,
  mountain: 0x50544a,
  plateau: 0x655c4d,
  desert: 0x79684c,
  grassland: 0x58634f,
  tropical: 0x3f614e,
  island: 0x3d625a,
};

const STYLE_PRESETS = {
  bronze: {
    label: '夯土高台与早期瓦木',
    wall: 0x8b6844,
    body: 0xa17a4d,
    roof: 0x43382d,
    stone: 0x82735d,
    density: 0.72,
  },
  imperial: {
    label: '里坊、阙楼与汉式庭院',
    wall: 0x8d704f,
    body: 0xa77b4e,
    roof: 0x3e3430,
    stone: 0x716b5d,
    density: 0.85,
  },
  tang: {
    label: '唐式斗拱、寺塔与棋盘里坊',
    wall: 0x96734f,
    body: 0xb18a59,
    roof: 0x3e4a42,
    stone: 0x797261,
    density: 1,
  },
  song: {
    label: '开放街市、水巷与砖塔',
    wall: 0x8c7154,
    body: 0x967a5d,
    roof: 0x334746,
    stone: 0x777267,
    density: 1.18,
  },
  yuan: {
    label: '都城棋盘、宫帐与多元宗教建筑',
    wall: 0x897057,
    body: 0x9a7a57,
    roof: 0x3c4c47,
    stone: 0x746d62,
    density: 1.05,
  },
  ming: {
    label: '砖城、中轴宫殿与院落',
    wall: 0x82684d,
    body: 0xa07750,
    roof: 0x31463f,
    stone: 0x706c61,
    density: 1.22,
  },
  qing: {
    label: '清式宫苑、牌楼与地域官署',
    wall: 0x8c6b4d,
    body: 0xa8774d,
    roof: 0x2e4b44,
    stone: 0x767067,
    density: 1.3,
  },
  republican: {
    label: '铁路街区、石库门与早期钢筋混凝土',
    wall: 0x777064,
    body: 0x9b8e79,
    roof: 0x424746,
    stone: 0x676966,
    density: 1.55,
  },
  modern: {
    label: '现代城市群与垂直天际线',
    wall: 0x526261,
    body: 0x78918d,
    roof: 0x304b4b,
    stone: 0x626c69,
    density: 1.9,
  },
};

function styleKeyForYear(year) {
  if (year <= -221) return 'bronze';
  if (year <= 229) return 'imperial';
  if (year <= 750) return 'tang';
  if (year <= 1142) return 'song';
  if (year <= 1279) return 'yuan';
  if (year <= 1421) return 'ming';
  if (year <= 1759) return 'qing';
  if (year < 1950) return 'republican';
  return 'modern';
}

export function architectureForEra(era) {
  const key = styleKeyForYear(era.year);
  return { key, ...STYLE_PRESETS[key] };
}

function normalizedBiome(biome = '') {
  const value = String(biome).toLowerCase();
  if (/高原|plateau|tibet/.test(value)) return 'plateau';
  if (/沙|荒漠|desert|oasis/.test(value)) return 'desert';
  if (/山|mountain|hill/.test(value)) return 'mountain';
  if (/盆地|basin/.test(value)) return 'basin';
  if (/海|港|coast/.test(value)) return 'coast';
  if (/岛|island/.test(value)) return 'island';
  if (/草原|grass/.test(value)) return 'grassland';
  if (/热带|tropical/.test(value)) return 'tropical';
  if (/江|河|水|river|lake/.test(value)) return 'river';
  return 'plain';
}

export function biomeLabel(biome = '') {
  const key = normalizedBiome(biome);
  return {
    plain: '河谷平原',
    river: '江河水网',
    coast: '滨海港湾',
    basin: '山间盆地',
    mountain: '山地关隘',
    plateau: '高原河谷',
    desert: '绿洲荒漠',
    grassland: '草原台地',
    tropical: '热带丘陵',
    island: '海岛山地',
  }[key];
}

function makeMaterial(color, { roughness = 0.85, metalness = 0.02, emissive = 0x000000, emissiveIntensity = 0 } = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
}

function createPool(style, accentColor) {
  const geometries = new Map();
  const materials = new Map();
  const textures = new Set();

  const geometry = (key, factory) => {
    if (!geometries.has(key)) geometries.set(key, factory());
    return geometries.get(key);
  };

  const material = (key, factory) => {
    if (!materials.has(key)) materials.set(key, factory());
    return materials.get(key);
  };

  return {
    geometry,
    material,
    textures,
    box: geometry('box', () => new THREE.BoxGeometry(1, 1, 1)),
    cylinder8: geometry('cylinder8', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8)),
    cylinder12: geometry('cylinder12', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12)),
    roof4: geometry('roof4', () => {
      const roof = new THREE.ConeGeometry(0.75, 0.38, 4);
      roof.rotateY(Math.PI / 4);
      return roof;
    }),
    roof8: geometry('roof8', () => new THREE.ConeGeometry(0.72, 0.34, 8)),
    sphere: geometry('sphere', () => new THREE.SphereGeometry(0.5, 12, 8)),
    ring: geometry('ring', () => new THREE.RingGeometry(0.72, 0.86, 32)),
    bodyMat: material('body', () => makeMaterial(style.body)),
    wallMat: material('wall', () => makeMaterial(style.wall)),
    roofMat: material('roof', () => makeMaterial(style.roof, { roughness: 0.72 })),
    stoneMat: material('stone', () => makeMaterial(style.stone)),
    accentMat: material('accent', () => makeMaterial(accentColor, {
      roughness: 0.56,
      metalness: 0.12,
      emissive: accentColor,
      emissiveIntensity: 0.08,
    })),
    darkMat: material('dark', () => makeMaterial(0x202b29)),
    glassMat: material('glass', () => makeMaterial(0x557d7c, {
      roughness: 0.28,
      metalness: 0.22,
      emissive: 0x172c2c,
      emissiveIntensity: 0.32,
    })),
    groundMaterials: new Map(),
  };
}

function createMesh(geometry, material, position, scale, role) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.userData.benchRole = role;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function addHall(group, pool, x, z, scale, rng, tall = false) {
  const floorHeight = tall ? 0.95 : 0.58;
  const body = createMesh(
    pool.box,
    pool.bodyMat,
    [x, 0.36 + floorHeight * 0.5, z],
    [scale * 1.25, floorHeight * scale, scale * 0.82],
    'city-building',
  );
  body.rotation.y = (Math.floor(rng() * 4) * Math.PI) / 2;
  group.add(body);

  const roof = createMesh(
    pool.roof4,
    pool.roofMat,
    [x, 0.38 + floorHeight * scale, z],
    [scale * 1.12, scale * 0.66, scale * 0.85],
    'era-roof',
  );
  roof.rotation.y = body.rotation.y;
  group.add(roof);

  if (scale >= 0.56) {
    const base = createMesh(pool.box, pool.stoneMat, [x, 0.25, z], [scale * 1.46, 0.16, scale], 'city-platform');
    base.rotation.y = body.rotation.y;
    group.add(base);
  }
}

function addPagoda(group, pool, x, z, scale, floors = 4) {
  for (let floor = 0; floor < floors; floor += 1) {
    const taper = 1 - floor * 0.11;
    const y = 0.38 + floor * scale * 0.48;
    group.add(createMesh(
      pool.cylinder8,
      pool.bodyMat,
      [x, y + scale * 0.18, z],
      [scale * 0.42 * taper, scale * 0.38, scale * 0.42 * taper],
      'city-landmark',
    ));
    group.add(createMesh(
      pool.roof8,
      pool.roofMat,
      [x, y + scale * 0.39, z],
      [scale * 0.62 * taper, scale * 0.35, scale * 0.62 * taper],
      'era-roof',
    ));
  }
  const spire = createMesh(
    pool.cylinder8,
    pool.accentMat,
    [x, 0.4 + floors * scale * 0.48, z],
    [scale * 0.06, scale * 0.85, scale * 0.06],
    'city-landmark',
  );
  group.add(spire);
}

function addWalls(group, pool, radius, height = 0.72) {
  const segmentLength = radius * 1.5;
  const segments = [
    [0, height * 0.5 + 0.25, -radius, segmentLength, height, 0.16],
    [0, height * 0.5 + 0.25, radius, segmentLength, height, 0.16],
    [-radius, height * 0.5 + 0.25, 0, 0.16, height, segmentLength],
    [radius, height * 0.5 + 0.25, 0, 0.16, height, segmentLength],
  ];
  for (const [x, y, z, sx, sy, sz] of segments) {
    group.add(createMesh(pool.box, pool.wallMat, [x, y, z], [sx, sy, sz], 'city-wall'));
  }

  const towers = [
    [-radius, -radius],
    [radius, -radius],
    [-radius, radius],
    [radius, radius],
  ];
  towers.forEach(([x, z]) => {
    group.add(createMesh(pool.box, pool.wallMat, [x, 0.68, z], [0.48, 0.86, 0.48], 'city-wall'));
    group.add(createMesh(pool.roof4, pool.roofMat, [x, 1.15, z], [0.52, 0.36, 0.52], 'era-roof'));
  });
}

function addModernTower(group, pool, x, z, scale, height, rng) {
  const body = createMesh(
    rng() > 0.68 ? pool.cylinder8 : pool.box,
    pool.glassMat,
    [x, 0.32 + height * 0.5, z],
    [scale * (0.55 + rng() * 0.3), height, scale * (0.55 + rng() * 0.3)],
    'city-building',
  );
  body.rotation.y = rng() * Math.PI;
  group.add(body);

  const crown = createMesh(
    pool.roof4,
    pool.accentMat,
    [x, 0.34 + height, z],
    [scale * 0.38, scale * 0.7, scale * 0.38],
    'city-landmark',
  );
  crown.rotation.y = body.rotation.y;
  group.add(crown);
}

function addRegionalLandmark(group, pool, city, style, rng) {
  const biome = normalizedBiome(city.biome);
  if (style.key === 'modern') {
    addModernTower(group, pool, 0, 0, 0.9, 3.4 + Number(city.importance ?? 2) * 0.35, rng);
    return;
  }

  if (biome === 'plateau') {
    for (let floor = 0; floor < 4; floor += 1) {
      group.add(createMesh(
        pool.box,
        floor === 3 ? pool.accentMat : pool.stoneMat,
        [0, 0.3 + floor * 0.36, 0],
        [2.4 - floor * 0.38, 0.34, 1.9 - floor * 0.26],
        'city-landmark',
      ));
    }
    return;
  }

  if (biome === 'desert') {
    group.add(createMesh(pool.box, pool.wallMat, [0, 1.05, 0], [1.45, 1.8, 1.45], 'city-landmark'));
    group.add(createMesh(pool.cylinder8, pool.accentMat, [0, 2.03, 0], [0.34, 0.22, 0.34], 'city-landmark'));
    return;
  }

  if (biome === 'coast' || biome === 'island') {
    group.add(createMesh(pool.cylinder12, pool.stoneMat, [0, 1.15, 0], [0.72, 1.9, 0.72], 'city-landmark'));
    group.add(createMesh(pool.roof8, pool.accentMat, [0, 2.2, 0], [0.78, 0.62, 0.78], 'city-landmark'));
    return;
  }

  addPagoda(group, pool, 0, 0, 0.68, style.key === 'bronze' ? 3 : 5);
}

function createGround(group, pool, city, detail = true) {
  const biome = normalizedBiome(city.biome);
  const color = BIOME_COLORS[biome] ?? BIOME_COLORS.plain;
  let material = pool.groundMaterials.get(color);
  if (!material) {
    material = makeMaterial(color, { roughness: 1 });
    pool.groundMaterials.set(color, material);
  }
  const radius = detail ? 4.25 : 2.1;
  const geometry = pool.geometry(`ground-${detail}`, () => new THREE.CylinderGeometry(radius, radius * 1.04, 0.28, detail ? 24 : 12));
  group.add(createMesh(geometry, material, [0, 0.14, 0], [1, 1, 1], 'city-terrain'));

  if (biome === 'river' || biome === 'coast' || biome === 'island') {
    const waterMat = pool.material('water', () => new THREE.MeshStandardMaterial({
      color: 0x365f62,
      emissive: 0x102b2d,
      emissiveIntensity: 0.25,
      roughness: 0.24,
      metalness: 0.1,
      transparent: true,
      opacity: 0.8,
    }));
    const river = createMesh(pool.box, waterMat, [0.4, 0.31, 0], [detail ? 8.1 : 3.7, 0.05, detail ? 0.52 : 0.28], 'city-water');
    river.rotation.y = Math.PI * 0.18;
    group.add(river);
  }

  if (biome === 'mountain' || biome === 'plateau' || biome === 'basin') {
    const hillGeometry = pool.geometry('hill', () => new THREE.ConeGeometry(1, 1, 7));
    for (let index = 0; index < (detail ? 5 : 2); index += 1) {
      const angle = (index / 5) * Math.PI * 2;
      const radiusAt = detail ? 3.2 : 1.65;
      const hill = createMesh(
        hillGeometry,
        material,
        [Math.cos(angle) * radiusAt, 0.65, Math.sin(angle) * radiusAt],
        [0.9, 1.1 + index * 0.08, 0.72],
        'city-terrain',
      );
      hill.rotation.y = angle;
      group.add(hill);
    }
  }
}

function cityImportanceAtEra(city, era) {
  const baseline = THREE.MathUtils.clamp(Number(city.importance) || 2, 1, 5);
  const founded = Number(city.founded);
  if (Number.isFinite(founded) && era.year < founded) return Math.max(1, baseline - 2);
  return baseline;
}

function createDetailedCity(city, era, pool, style, rng) {
  const group = new THREE.Group();
  group.name = `${city.id}-detail`;
  group.userData.benchRole = 'city-detail';
  createGround(group, pool, city, true);

  const importance = cityImportanceAtEra(city, era);
  if (style.key !== 'modern' && style.key !== 'republican') addWalls(group, pool, 3.18, 0.52 + importance * 0.09);

  const roadsMat = pool.material('roads', () => makeMaterial(0x5d594f, { roughness: 1 }));
  group.add(createMesh(pool.box, roadsMat, [0, 0.34, 0], [7.2, 0.04, 0.28], 'city-road'));
  group.add(createMesh(pool.box, roadsMat, [0, 0.345, 0], [0.28, 0.04, 7.2], 'city-road'));

  const density = Math.round((5 + importance * 2) * style.density);
  for (let index = 0; index < density; index += 1) {
    const ring = 1.05 + rng() * 2.35;
    const angle = rng() * Math.PI * 2;
    const x = Math.cos(angle) * ring + (rng() - 0.5) * 0.36;
    const z = Math.sin(angle) * ring + (rng() - 0.5) * 0.36;
    const scale = 0.34 + rng() * 0.28;

    if (style.key === 'modern') {
      addModernTower(group, pool, x, z, scale, 0.95 + rng() * (1.6 + importance * 0.28), rng);
    } else if (style.key === 'republican' && rng() > 0.56) {
      addModernTower(group, pool, x, z, scale, 0.75 + rng() * 1.25, rng);
    } else {
      addHall(group, pool, x, z, scale, rng, importance >= 4 && rng() > 0.72);
    }
  }

  addRegionalLandmark(group, pool, city, style, rng);

  if (style.key === 'tang' || style.key === 'song' || style.key === 'ming' || style.key === 'qing') {
    addPagoda(group, pool, 2.15, -1.95, 0.35, 3);
  }

  return group;
}

function createMidCity(city, era, pool, style, rng) {
  const group = new THREE.Group();
  group.name = `${city.id}-mid`;
  group.userData.benchRole = 'city-mid';
  createGround(group, pool, city, false);
  const importance = cityImportanceAtEra(city, era);

  if (style.key !== 'modern' && style.key !== 'republican') addWalls(group, pool, 1.55, 0.45);
  for (let index = 0; index < 2 + importance; index += 1) {
    const angle = rng() * Math.PI * 2;
    const radius = 0.45 + rng() * 1.05;
    if (style.key === 'modern') {
      addModernTower(group, pool, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.36, 0.9 + rng() * 1.2, rng);
    } else {
      addHall(group, pool, Math.cos(angle) * radius, Math.sin(angle) * radius, 0.35, rng);
    }
  }
  return group;
}

function createFarMarker(city, era, pool, accentColor) {
  const group = new THREE.Group();
  group.name = `${city.id}-marker`;
  group.userData.benchRole = 'city-marker';
  const importance = cityImportanceAtEra(city, era);
  const size = 0.25 + importance * 0.055;

  const base = createMesh(pool.cylinder8, pool.darkMat, [0, 0.23, 0], [size * 1.7, 0.22, size * 1.7], 'city-marker');
  const core = createMesh(pool.cylinder8, pool.accentMat, [0, 0.48 + importance * 0.08, 0], [size, 0.65 + importance * 0.12, size], 'city-marker');
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const halo = new THREE.Mesh(pool.ring, haloMaterial);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.36;
  halo.scale.setScalar(0.58 + importance * 0.1);
  halo.userData.benchRole = 'city-beacon';

  group.add(base, core, halo);
  group.userData.halo = halo;
  return group;
}

function createLabelSprite(text, accentColor, pool) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(4, 14, 12, 0.78)';
  context.beginPath();
  context.roundRect(19, 12, 218, 44, 8);
  context.fill();
  context.strokeStyle = new THREE.Color(accentColor).getStyle();
  context.globalAlpha = 0.85;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(23, 56);
  context.lineTo(233, 56);
  context.stroke();
  context.globalAlpha = 1;
  context.fillStyle = '#eadfc2';
  context.font = '500 27px "STKaiti", "KaiTi", serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 128, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  pool.textures.add(texture);

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(7.2, 2.02, 1);
  sprite.center.set(0.5, 0);
  sprite.userData.benchRole = 'city-label';
  return sprite;
}

function disposeSnapshot(snapshot) {
  if (!snapshot) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set(snapshot.pool?.textures ?? []);
  snapshot.group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.filter(Boolean).forEach((material) => {
      materials.add(material);
      if (material.map) textures.add(material.map);
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  snapshot.group.removeFromParent();
  snapshot.group.clear();
}

function accentForCity(era, city) {
  const faction = assignFaction(era, city.lon, city.lat);
  const color = new THREE.Color(faction?.color ?? '#c89957');
  color.offsetHSL(0, -0.05, 0.08);
  return { faction, color: color.getHex() };
}

function buildSnapshot(cities, era) {
  const group = new THREE.Group();
  group.name = `cities-${era.id}`;
  group.userData.benchRole = 'city-layer';
  const records = new Map();
  const pickables = [];
  const style = architectureForEra(era);

  // A shared pool keeps hundreds of repeated roofs and walls cheap.
  const baseAccent = new THREE.Color(era.factions[0]?.color ?? '#c89957').getHex();
  const pool = createPool(style, baseAccent);
  const pickGeometry = new THREE.SphereGeometry(1.7, 8, 6);
  const pickMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false,
  });

  let detailMeshCount = 0;
  for (const city of cities) {
    const [x, z] = projectLonLat(city.lon, city.lat);
    const y = terrainHeight(city.lon, city.lat) + 0.48;
    const { faction, color: accentColor } = accentForCity(era, city);
    const rng = seededRandom(hashString(`${city.id}:${era.id}:city`));
    const cityPool = {
      ...pool,
      accentMat: makeMaterial(accentColor, {
        roughness: 0.54,
        metalness: 0.14,
        emissive: accentColor,
        emissiveIntensity: 0.09,
      }),
    };

    const root = new THREE.Group();
    root.name = `city-${city.id}`;
    root.position.set(x, y, z);
    root.userData.benchRole = 'city';
    root.userData.cityId = city.id;

    const lod = new THREE.LOD();
    lod.name = `${city.id}-lod`;
    lod.userData.benchRole = 'city-lod';
    const detail = createDetailedCity(city, era, cityPool, style, rng);
    const mid = createMidCity(city, era, cityPool, style, rng);
    const far = createFarMarker(city, era, cityPool, accentColor);
    lod.addLevel(detail, 0);
    lod.addLevel(mid, 29);
    lod.addLevel(far, 63);
    lod.autoUpdate = true;
    root.add(lod);

    const historicalName = getCityNameAtYear(city, era.year);
    const label = createLabelSprite(historicalName || city.name, accentColor, pool);
    label.position.set(0, 4.7, 0);
    root.add(label);

    const selectionMaterial = new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const selection = new THREE.Mesh(new THREE.RingGeometry(3.8, 4.12, 48), selectionMaterial);
    selection.rotation.x = -Math.PI / 2;
    selection.position.y = 0.44;
    selection.visible = false;
    selection.userData.benchRole = 'city-selection';
    root.add(selection);

    const proxy = new THREE.Mesh(pickGeometry, pickMaterial);
    proxy.position.y = 1.8;
    proxy.scale.set(2.4, 2.2, 2.4);
    proxy.userData.type = 'city';
    proxy.userData.cityId = city.id;
    proxy.userData.city = city;
    root.add(proxy);
    pickables.push(proxy);

    detail.traverse((object) => {
      if (object.isMesh) detailMeshCount += 1;
    });

    group.add(root);
    records.set(city.id, {
      city,
      faction,
      root,
      lod,
      far,
      label,
      selection,
      accentColor,
      historicalName,
    });
  }

  return {
    group,
    records,
    pickables,
    pool: {
      ...pool,
      extraGeometries: [pickGeometry],
      extraMaterials: [pickMaterial],
    },
    stats: {
      cityCount: cities.length,
      detailMeshCount,
      style: style.key,
      architecture: style.label,
    },
  };
}

export function createCityLayer(scene, cities, initialEra) {
  let snapshot = buildSnapshot(cities, initialEra);
  let currentEra = initialEra;
  let labelsVisible = true;
  let focusedCityId = null;
  let transition = 1;
  scene.add(snapshot.group);

  function setEra(era) {
    currentEra = era;
    const previous = snapshot;
    snapshot = buildSnapshot(cities, era);
    snapshot.group.scale.setScalar(0.9);
    snapshot.group.traverse((object) => {
      if (object.isMesh && object.material && 'opacity' in object.material && object.material.transparent) {
        object.material.userData.targetOpacity = object.material.opacity;
      }
    });
    scene.add(snapshot.group);
    transition = 0;
    disposeSnapshot(previous);
    setFocused(focusedCityId);
    return snapshot.stats;
  }

  function setFocused(cityId) {
    focusedCityId = cityId || null;
    for (const [id, record] of snapshot.records) {
      record.selection.visible = id === focusedCityId;
    }
  }

  function setVisible(visible) {
    snapshot.group.visible = Boolean(visible);
  }

  function setLabelsVisible(visible) {
    labelsVisible = Boolean(visible);
  }

  function update(camera, elapsed, deltaSeconds) {
    transition = THREE.MathUtils.damp(transition, 1, 3.6, Math.max(0, deltaSeconds));
    snapshot.group.scale.setScalar(0.9 + transition * 0.1);

    for (const record of snapshot.records.values()) {
      const worldPosition = record.root.position;
      const distance = camera.position.distanceTo(worldPosition);
      const importance = cityImportanceAtEra(record.city, currentEra);
      record.label.visible = labelsVisible
        && (record.city.id === focusedCityId || (distance < 105 && importance >= 2) || importance >= 4);
      record.label.material.opacity = THREE.MathUtils.clamp((130 - distance) / 50, 0.4, 1);

      const halo = record.far.userData.halo;
      if (halo) {
        const pulse = 1 + Math.sin(elapsed * 2.1 + hashString(record.city.id) * 0.001) * 0.11;
        halo.scale.setScalar((0.58 + importance * 0.1) * pulse);
        halo.material.opacity = 0.46 + Math.sin(elapsed * 1.7 + importance) * 0.12;
      }

      if (record.selection.visible) {
        const pulse = 1 + Math.sin(elapsed * 2.8) * 0.06;
        record.selection.scale.setScalar(pulse);
        record.selection.rotation.z += deltaSeconds * 0.2;
      }
    }
  }

  function getCityRecord(cityId) {
    return snapshot.records.get(cityId) ?? null;
  }

  function getPickables() {
    return snapshot.pickables;
  }

  function getStats() {
    let detailCities = 0;
    let midCities = 0;
    let markerCities = 0;
    for (const record of snapshot.records.values()) {
      const level = record.lod.getCurrentLevel();
      if (level === 0) detailCities += 1;
      else if (level === 1) midCities += 1;
      else markerCities += 1;
    }
    return {
      ...snapshot.stats,
      detailCities,
      midCities,
      markerCities,
    };
  }

  function dispose() {
    disposeSnapshot(snapshot);
  }

  return {
    get group() {
      return snapshot.group;
    },
    get era() {
      return currentEra;
    },
    setEra,
    setFocused,
    setVisible,
    setLabelsVisible,
    update,
    getCityRecord,
    getPickables,
    getStats,
    dispose,
  };
}
