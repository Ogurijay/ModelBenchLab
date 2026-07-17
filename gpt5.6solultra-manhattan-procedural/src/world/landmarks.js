import * as THREE from 'three';
import { WORLD } from '../config.js';
import { boxMesh, cylinderBetween, lotMetrics, tag } from './helpers.js';

const LANDMARK_ALIASES = {
  empire: ['empire', '帝国'],
  chrysler: ['chrysler', '克莱斯勒'],
  wtc: ['wtc', 'one world', 'freedom', '世贸'],
  flatiron: ['flatiron', '熨斗'],
};

function findSource(plan, key) {
  const source = plan?.landmarks;
  if (Array.isArray(source)) {
    return source.find((item) => {
      const label = String(item?.id ?? item?.key ?? item?.name ?? item?.type ?? '').toLowerCase();
      return LANDMARK_ALIASES[key].some((alias) => label.includes(alias));
    });
  }
  if (source && typeof source === 'object') {
    for (const [entryKey, value] of Object.entries(source)) {
      const label = String(entryKey).toLowerCase();
      if (LANDMARK_ALIASES[key].some((alias) => label.includes(alias))) return value;
    }
  }
  return null;
}

function landmarkPlacement(plan, key, fallback) {
  const source = findSource(plan, key);
  const metrics = lotMetrics(source ?? fallback, fallback.height);
  return {
    x: source?.position?.x ?? metrics.x ?? fallback.x,
    z: source?.position?.z ?? metrics.z ?? fallback.z,
    height: source?.height ?? source?.h ?? fallback.height,
    rotation: source?.rotation ?? source?.angle ?? fallback.rotation ?? 0,
  };
}

function markerAt(group, y, name) {
  const marker = new THREE.Object3D();
  marker.name = `${name}-最高避雷点`;
  marker.position.y = y;
  tag(marker, 'lightning-target', { landmark: name, priority: y });
  group.add(marker);
  return marker;
}

function createEmpire(materials, placement) {
  const group = new THREE.Group();
  group.name = '帝国大厦';
  group.position.set(placement.x, WORLD?.roadY ?? 0, placement.z);
  group.rotation.y = placement.rotation;
  const scale = placement.height / 92;
  const limestone = materials.buildingMaterials[0];
  const metal = materials.metalMaterial;
  let y = 0;
  const tiers = [
    [23, 31, 18],
    [18, 23, 15],
    [13, 17, 12],
    [9, 10, 9],
  ];
  for (let index = 0; index < tiers.length; index += 1) {
    const [width, height, depth] = tiers[index];
    boxMesh(`帝国大厦退台-${index + 1}`, new THREE.Vector3(width * scale, height * scale, depth * scale), limestone, new THREE.Vector3(0, y + height * scale * 0.5, 0), group, 'landmark-mass', { landmark: 'empire-state', tier: index + 1 });
    y += height * scale;
  }
  const mastBase = new THREE.Mesh(new THREE.CylinderGeometry(2.5 * scale, 4.4 * scale, 9 * scale, 8), metal);
  mastBase.position.y = y + 4.5 * scale;
  mastBase.castShadow = true;
  group.add(mastBase);
  y += 9 * scale;
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * scale, 0.7 * scale, 18 * scale, 8), metal);
  spire.position.y = y + 9 * scale;
  spire.castShadow = true;
  group.add(spire);
  y += 18 * scale;
  const marker = markerAt(group, y, 'empire-state');
  tag(group, 'landmark', { landmark: 'empire-state', label: '帝国大厦', silhouette: 'setbacks-and-spire' });
  return { group, marker, height: y };
}

function createChrysler(materials, placement) {
  const group = new THREE.Group();
  group.name = '克莱斯勒大厦';
  group.position.set(placement.x, WORLD?.roadY ?? 0, placement.z);
  group.rotation.y = placement.rotation;
  const scale = placement.height / 88;
  const stone = materials.buildingMaterials[0];
  const silver = new THREE.MeshStandardMaterial({ color: 0xbcc6cd, metalness: 0.76, roughness: 0.25 });
  let y = 0;
  for (const [index, tier] of [[0, [20, 42]], [1, [16, 17]], [2, [12, 10]]]) {
    const [width, height] = tier;
    boxMesh(`克莱斯勒塔身-${index + 1}`, new THREE.Vector3(width * scale, height * scale, width * 0.84 * scale), stone, new THREE.Vector3(0, y + height * scale * 0.5, 0), group, 'landmark-mass', { landmark: 'chrysler', tier: index + 1 });
    y += height * scale;
  }
  for (let level = 0; level < 6; level += 1) {
    const radius = (8.2 - level * 1.05) * scale;
    const height = (3.5 - level * 0.18) * scale;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(radius, height * 1.8, 8, 1, true), silver);
    crown.name = `克莱斯勒旭日冠-${level + 1}`;
    crown.position.y = y + height * 0.9;
    crown.rotation.y = Math.PI / 8 + level * 0.08;
    crown.castShadow = true;
    tag(crown, 'landmark-crown', { landmark: 'chrysler', level: level + 1, motif: 'sunburst' });
    group.add(crown);
    y += height * 1.12;
  }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * scale, 0.48 * scale, 17 * scale, 8), silver);
  spire.position.y = y + 8.5 * scale;
  group.add(spire);
  y += 17 * scale;
  const marker = markerAt(group, y, 'chrysler');
  tag(group, 'landmark', { landmark: 'chrysler', label: '克莱斯勒大厦', silhouette: 'art-deco-sunburst-crown' });
  return { group, marker, height: y };
}

function taperedTowerGeometry(height, bottomX, bottomZ, topX, topZ) {
  const levels = [
    { y: 0, x: bottomX, z: bottomZ, angle: 0 },
    { y: height * 0.46, x: bottomX * 0.84, z: bottomZ * 0.88, angle: Math.PI / 4 },
    { y: height, x: topX, z: topZ, angle: 0 },
  ];
  const vertices = [];
  for (const level of levels) {
    for (let corner = 0; corner < 4; corner += 1) {
      const angle = level.angle + Math.PI * 0.25 + corner * Math.PI * 0.5;
      vertices.push(Math.cos(angle) * level.x, level.y, Math.sin(angle) * level.z);
    }
  }
  const indices = [];
  for (let level = 0; level < levels.length - 1; level += 1) {
    for (let side = 0; side < 4; side += 1) {
      const a = level * 4 + side;
      const b = level * 4 + (side + 1) % 4;
      const c = (level + 1) * 4 + (side + 1) % 4;
      const d = (level + 1) * 4 + side;
      indices.push(a, b, d, b, c, d);
    }
  }
  indices.push(0, 2, 1, 0, 3, 2, 8, 9, 10, 8, 10, 11);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWtc(materials, placement) {
  const group = new THREE.Group();
  group.name = '世贸中心一号楼';
  group.position.set(placement.x, WORLD?.roadY ?? 0, placement.z);
  group.rotation.y = placement.rotation;
  const height = placement.height;
  const tower = new THREE.Mesh(taperedTowerGeometry(height, 15, 13, 7.6, 7.6), materials.buildingMaterials[2]);
  tower.name = 'One WTC 八面收分幕墙';
  tower.castShadow = true;
  tower.receiveShadow = true;
  tag(tower, 'landmark-mass', { landmark: 'one-wtc', form: 'faceted-taper' });
  group.add(tower);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 7.2, 5.2, 8), materials.metalMaterial);
  crown.position.y = height + 2.6;
  group.add(crown);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.46, height * 0.2, 8), materials.metalMaterial);
  mast.position.y = height + 5.2 + height * 0.1;
  group.add(mast);
  const totalHeight = height * 1.2 + 5.2;
  const marker = markerAt(group, totalHeight, 'one-wtc');
  tag(group, 'landmark', { landmark: 'one-wtc', label: '世贸中心一号楼', silhouette: 'faceted-taper-and-mast' });
  return { group, marker, height: totalHeight };
}

function triangularPrismGeometry(width, depth, height) {
  const points = [
    [-width * 0.5, -depth * 0.5],
    [width * 0.5, -depth * 0.5],
    [-width * 0.34, depth * 0.5],
  ];
  const vertices = [];
  for (const y of [0, height]) for (const [x, z] of points) vertices.push(x, y, z);
  const indices = [0, 2, 1, 3, 4, 5, 0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4, 2, 0, 5, 0, 3, 5];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createFlatiron(materials, placement) {
  const group = new THREE.Group();
  group.name = '熨斗大厦';
  group.position.set(placement.x, WORLD?.roadY ?? 0, placement.z);
  group.rotation.y = placement.rotation;
  const height = placement.height;
  const body = new THREE.Mesh(triangularPrismGeometry(18, 28, height), materials.buildingMaterials[0]);
  body.castShadow = true;
  body.receiveShadow = true;
  tag(body, 'landmark-mass', { landmark: 'flatiron', form: 'triangular-wedge' });
  group.add(body);
  for (let level = 1; level <= 4; level += 1) {
    const ledge = new THREE.Mesh(triangularPrismGeometry(18.7, 28.7, 0.48), materials.bridgeMaterial);
    ledge.position.y = (height * level) / 5;
    group.add(ledge);
  }
  const cornice = new THREE.Mesh(triangularPrismGeometry(19.5, 29.5, 1.5), materials.bridgeMaterial);
  cornice.position.y = height;
  group.add(cornice);
  const totalHeight = height + 1.5;
  const marker = markerAt(group, totalHeight, 'flatiron');
  tag(group, 'landmark', { landmark: 'flatiron', label: '熨斗大厦', silhouette: 'broadway-triangular-wedge' });
  return { group, marker, height: totalHeight };
}

export function createLandmarks(plan, materials) {
  const minX = WORLD?.minX ?? -360;
  const maxX = WORLD?.maxX ?? 360;
  const minZ = WORLD?.minZ ?? -600;
  const maxZ = WORLD?.maxZ ?? 600;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const defaults = {
    empire: { x: minX + width * 0.48, z: minZ + depth * 0.58, height: 92 },
    chrysler: { x: minX + width * 0.6, z: minZ + depth * 0.62, height: 88 },
    wtc: { x: minX + width * 0.4, z: minZ + depth * 0.17, height: 102 },
    flatiron: { x: minX + width * 0.47, z: minZ + depth * 0.43, height: 48, rotation: -0.3 },
  };
  const group = new THREE.Group();
  group.name = '曼哈顿四大地标';
  tag(group, 'landmark-collection', { count: 4 });
  const items = [
    createEmpire(materials, landmarkPlacement(plan, 'empire', defaults.empire)),
    createChrysler(materials, landmarkPlacement(plan, 'chrysler', defaults.chrysler)),
    createWtc(materials, landmarkPlacement(plan, 'wtc', defaults.wtc)),
    createFlatiron(materials, landmarkPlacement(plan, 'flatiron', defaults.flatiron)),
  ];
  items.forEach((item) => group.add(item.group));
  const highest = items.reduce((best, item) => (item.height > best.height ? item : best), items[0]);
  const landmarkPositions = Object.fromEntries(items.map((item) => [item.group.userData.landmark, item.group.position.clone()]));
  return {
    group,
    highestTarget: highest.marker,
    landmarkPositions,
    instanceCount: 0,
  };
}
