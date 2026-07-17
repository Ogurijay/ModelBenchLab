import * as THREE from 'three';
import { WORLD } from '../config.js';
import { catenaryBetweenTowers } from '../core/math.js';
import { boxMesh, normalizeBounds, tag } from './helpers.js';

function makeMainCable(points, material) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const geometry = new THREE.TubeGeometry(curve, Math.max(32, points.length * 2), 0.22, 7, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

export function createBridge(materials) {
  const fallback = {
    minX: (WORLD?.maxX ?? 360) - 20,
    maxX: (WORLD?.maxX ?? 360) + 150,
    minZ: (WORLD?.minZ ?? -600) + 250,
    maxZ: (WORLD?.minZ ?? -600) + 430,
  };
  const eastRiver = WORLD?.eastRiver;
  const river = normalizeBounds(
    eastRiver?.bankX != null && eastRiver?.farX != null
      ? { minX: eastRiver.bankX, maxX: eastRiver.farX, minZ: fallback.minZ, maxZ: fallback.maxZ }
      : eastRiver,
    fallback,
  );
  const roadY = WORLD?.roadY ?? 0;
  const group = new THREE.Group();
  group.name = '程序化悬索桥';
  tag(group, 'suspension-bridge', { formula: 'catenary', structuralParts: ['deck', 'towers', 'main-cables', 'hangers'] });

  const span = THREE.MathUtils.clamp(river.width * 0.72, 96, 210);
  const centerX = river.x;
  const centerZ = river.z - river.depth * 0.18;
  const deckY = roadY + 8.5;
  const towerY = deckY + 31;
  const sag = 20;
  const leftTowerX = centerX - span * 0.5;
  const rightTowerX = centerX + span * 0.5;
  const deck = boxMesh('桥面', new THREE.Vector3(span + 42, 1.8, 15), materials.roadMaterial, new THREE.Vector3(centerX, deckY, centerZ), group, 'bridge-deck', { lanes: 4 });
  deck.receiveShadow = true;

  for (const [towerIndex, x] of [leftTowerX, rightTowerX].entries()) {
    for (const zOffset of [-5.5, 5.5]) {
      boxMesh(`桥塔-${towerIndex + 1}-${zOffset < 0 ? '南' : '北'}`, new THREE.Vector3(5.4, 39, 4.1), materials.bridgeMaterial, new THREE.Vector3(x, deckY + 19.5, centerZ + zOffset), group, 'bridge-tower', { tower: towerIndex + 1 });
    }
    boxMesh(`桥塔横梁-${towerIndex + 1}-下`, new THREE.Vector3(6.2, 3, 14.8), materials.bridgeMaterial, new THREE.Vector3(x, deckY + 11, centerZ), group, 'bridge-tower-crossbeam', { tower: towerIndex + 1 });
    boxMesh(`桥塔横梁-${towerIndex + 1}-上`, new THREE.Vector3(6.2, 3.2, 14.8), materials.bridgeMaterial, new THREE.Vector3(x, deckY + 31, centerZ), group, 'bridge-tower-crossbeam', { tower: towerIndex + 1 });
    for (const zOffset of [-5.5, 5.5]) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(3.5, 7.2, 4), materials.bridgeMaterial);
      cap.name = '哥特桥塔尖顶';
      cap.position.set(x, deckY + 42.6, centerZ + zOffset);
      cap.rotation.y = Math.PI / 4;
      cap.castShadow = true;
      group.add(cap);
    }
  }

  const cablePointsBySide = [];
  for (const zOffset of [-7.1, 7.1]) {
    const points = [];
    const samples = 48;
    for (let index = 0; index <= samples; index += 1) {
      const xLocal = -span * 0.5 + (index / samples) * span;
      const cableY = catenaryBetweenTowers(xLocal, span, sag, towerY);
      points.push(new THREE.Vector3(centerX + xLocal, cableY, centerZ + zOffset));
    }
    cablePointsBySide.push(points);
    const cable = makeMainCable(points, materials.metalMaterial);
    cable.name = zOffset < 0 ? '南侧悬链线主缆' : '北侧悬链线主缆';
    tag(cable, 'bridge-catenary-cable', { span, sag, samples, formula: 'a*cosh(x/a)-a' });
    group.add(cable);
  }

  const hangerSteps = 23;
  const hangers = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6), materials.metalMaterial, hangerSteps * 2);
  hangers.name = '悬索桥垂直吊索实例';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  let hangerIndex = 0;
  for (let side = 0; side < 2; side += 1) {
    const z = centerZ + (side === 0 ? -7.1 : 7.1);
    for (let index = 1; index <= hangerSteps; index += 1) {
      const xLocal = -span * 0.5 + (index / (hangerSteps + 1)) * span;
      const y = catenaryBetweenTowers(xLocal, span, sag, towerY);
      const length = Math.max(1, y - (deckY + 1.2));
      matrix.compose(
        new THREE.Vector3(centerX + xLocal, deckY + 1.2 + length * 0.5, z),
        quaternion,
        new THREE.Vector3(0.085, length, 0.085),
      );
      hangers.setMatrixAt(hangerIndex++, matrix);
    }
  }
  hangers.instanceMatrix.needsUpdate = true;
  hangers.castShadow = true;
  tag(hangers, 'bridge-hangers', { count: hangerSteps * 2, instanced: true });
  group.add(hangers);

  const laneGeometry = new THREE.BoxGeometry(span + 34, 0.05, 0.16);
  for (const zOffset of [-3.6, 0, 3.6]) {
    const lane = new THREE.Mesh(laneGeometry, materials.lineMaterial);
    lane.position.set(centerX, deckY + 0.94, centerZ + zOffset);
    group.add(lane);
  }

  return { group, instanceCount: hangerSteps * 2, center: new THREE.Vector3(centerX, deckY, centerZ) };
}
