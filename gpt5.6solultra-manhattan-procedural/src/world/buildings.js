import * as THREE from 'three';
import { WORLD } from '../config.js';
import { lotMetrics, seededUnit, tag } from './helpers.js';

function materialIndexFor(style, seed, index) {
  const label = String(style ?? '').toLowerCase();
  if (label.includes('brick') || label.includes('砖')) return 1;
  if (label.includes('glass') || label.includes('玻璃')) return 2;
  if (label.includes('lime') || label.includes('stone') || label.includes('石')) return 0;
  return Math.floor(seededUnit(seed, index * 5 + 3) * 3) % 3;
}

function volumeEntry(x, y, z, width, height, depth, rotation, tone, lotIndex, tier) {
  return { x, y, z, width, height, depth, rotation, tone, lotIndex, tier };
}

function addInstancedVolumes(group, entries, material, materialName) {
  if (!entries.length) return null;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, entries.length);
  mesh.name = `程序化楼群-${materialName}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  entries.forEach((entry, index) => {
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), entry.rotation);
    position.set(entry.x, entry.y, entry.z);
    scale.set(entry.width, entry.height, entry.depth);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    color.setHSL(entry.tone, 0.08, entry.tier === 0 ? 0.9 : 0.78);
    mesh.setColorAt(index, color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  tag(mesh, 'procedural-buildings', { material: materialName, count: entries.length, method: 'InstancedMesh + setback masses' });
  group.add(mesh);
  return mesh;
}

function addRoofEquipment(group, roofs, materials, seed) {
  const selected = roofs.filter((_, index) => index % 7 === 2 || seededUnit(seed, index * 13) > 0.91).slice(0, 42);
  if (!selected.length) return { count: 0, group: null };
  const equipment = new THREE.Group();
  equipment.name = '屋顶水塔与机电设备';
  tag(equipment, 'rooftop-details', { waterTowers: selected.length });
  group.add(equipment);

  const barrelGeometry = new THREE.CylinderGeometry(1.45, 1.68, 2.8, 10, 1, false);
  const roofGeometry = new THREE.ConeGeometry(1.72, 1.15, 10);
  const legGeometry = new THREE.CylinderGeometry(0.08, 0.11, 2.3, 5);
  const barrel = new THREE.InstancedMesh(barrelGeometry, materials.bridgeMaterial, selected.length);
  const caps = new THREE.InstancedMesh(roofGeometry, materials.metalMaterial, selected.length);
  const legs = new THREE.InstancedMesh(legGeometry, materials.metalMaterial, selected.length * 4);
  barrel.name = '木质水塔桶';
  caps.name = '水塔锥顶';
  legs.name = '水塔钢架';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  let legIndex = 0;
  selected.forEach((roof, index) => {
    const jitterX = (seededUnit(seed, index * 17 + 1) - 0.5) * Math.max(0, roof.width - 5);
    const jitterZ = (seededUnit(seed, index * 17 + 2) - 0.5) * Math.max(0, roof.depth - 5);
    const x = roof.x + jitterX * 0.35;
    const z = roof.z + jitterZ * 0.35;
    const baseY = roof.y + 2.2;
    matrix.compose(new THREE.Vector3(x, baseY + 1.4, z), quaternion, scale);
    barrel.setMatrixAt(index, matrix);
    matrix.compose(new THREE.Vector3(x, baseY + 3.38, z), quaternion, scale);
    caps.setMatrixAt(index, matrix);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      matrix.compose(new THREE.Vector3(x + dx * 0.92, roof.y + 1.15, z + dz * 0.92), quaternion, scale);
      legs.setMatrixAt(legIndex++, matrix);
    }
  });
  [barrel, caps, legs].forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    equipment.add(mesh);
  });
  tag(barrel, 'water-towers', { count: selected.length, procedural: true });

  const hvacCandidates = roofs.filter((_, index) => index % 4 === 0).slice(0, 72);
  if (hvacCandidates.length) {
    const hvac = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.metalMaterial, hvacCandidates.length);
    hvac.name = '屋顶空调箱';
    hvacCandidates.forEach((roof, index) => {
      const width = 1.6 + seededUnit(seed, index * 19) * 1.8;
      const depth = 1.2 + seededUnit(seed, index * 19 + 1) * 1.5;
      matrix.compose(
        new THREE.Vector3(roof.x + roof.width * 0.18, roof.y + 0.7, roof.z - roof.depth * 0.16),
        quaternion,
        new THREE.Vector3(width, 1.4, depth),
      );
      hvac.setMatrixAt(index, matrix);
    });
    hvac.instanceMatrix.needsUpdate = true;
    hvac.castShadow = true;
    tag(hvac, 'rooftop-hvac', { count: hvacCandidates.length });
    equipment.add(hvac);
  }
  return { count: selected.length * 6 + hvacCandidates.length, group: equipment };
}

export function createBuildings(plan, materials) {
  const group = new THREE.Group();
  group.name = '程序化曼哈顿楼群';
  tag(group, 'city-buildings', { generator: 'seeded-instanced-setbacks' });
  const seed = plan?.seed ?? plan?.stats?.seed ?? 1337;
  const roadY = WORLD?.roadY ?? 0;
  const lots = Array.isArray(plan?.buildingLots) ? plan.buildingLots : [];
  const batches = [[], [], []];
  const roofs = [];

  lots.forEach((lot, index) => {
    if (lot?.reserved || lot?.landmark || lot?.kind === 'park' || lot?.kind === 'water') return;
    const metrics = lotMetrics(lot, 18 + seededUnit(seed, index) * 48);
    const materialIndex = materialIndexFor(metrics.style, seed, index);
    const tone = [0.1, 0.035, 0.55][materialIndex] + (seededUnit(seed, index * 7 + 2) - 0.5) * 0.035;
    const hasSetbacks = metrics.height > 34 || seededUnit(seed, index * 7 + 5) > 0.7;
    if (hasSetbacks) {
      const baseH = metrics.height * 0.58;
      const midH = metrics.height * 0.28;
      const crownH = metrics.height - baseH - midH;
      batches[materialIndex].push(volumeEntry(metrics.x, roadY + baseH * 0.5, metrics.z, metrics.width, baseH, metrics.depth, metrics.rotation, tone, index, 0));
      batches[materialIndex].push(volumeEntry(metrics.x, roadY + baseH + midH * 0.5, metrics.z, metrics.width * 0.79, midH, metrics.depth * 0.81, metrics.rotation, tone, index, 1));
      batches[materialIndex].push(volumeEntry(metrics.x, roadY + baseH + midH + crownH * 0.5, metrics.z, metrics.width * 0.56, crownH, metrics.depth * 0.6, metrics.rotation, tone, index, 2));
      roofs.push({ x: metrics.x, z: metrics.z, y: roadY + metrics.height, width: metrics.width * 0.56, depth: metrics.depth * 0.6 });
    } else {
      batches[materialIndex].push(volumeEntry(metrics.x, roadY + metrics.height * 0.5, metrics.z, metrics.width, metrics.height, metrics.depth, metrics.rotation, tone, index, 0));
      roofs.push({ x: metrics.x, z: metrics.z, y: roadY + metrics.height, width: metrics.width, depth: metrics.depth });
    }
  });

  const meshes = [
    addInstancedVolumes(group, batches[0], materials.buildingMaterials[0], 'limestone'),
    addInstancedVolumes(group, batches[1], materials.buildingMaterials[1], 'brick'),
    addInstancedVolumes(group, batches[2], materials.buildingMaterials[2], 'glass'),
  ].filter(Boolean);
  const equipment = addRoofEquipment(group, roofs, materials, seed);
  return {
    group,
    meshes,
    roofs,
    instanceCount: batches.reduce((sum, batch) => sum + batch.length, 0) + equipment.count,
  };
}
