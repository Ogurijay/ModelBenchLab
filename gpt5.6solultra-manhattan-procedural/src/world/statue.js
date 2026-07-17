import * as THREE from 'three';
import { WORLD } from '../config.js';
import { boxMesh, cylinderBetween, normalizeBounds, tag } from './helpers.js';

function sculptRobeGeometry() {
  const profile = [
    new THREE.Vector2(2.75, 0),
    new THREE.Vector2(2.55, 1.3),
    new THREE.Vector2(2.28, 3.3),
    new THREE.Vector2(2.05, 5.2),
    new THREE.Vector2(1.72, 7.4),
    new THREE.Vector2(1.48, 9.4),
    new THREE.Vector2(1.34, 11.2),
    new THREE.Vector2(1.5, 12.7),
  ];
  const geometry = new THREE.LatheGeometry(profile, 48);
  const position = geometry.attributes.position;
  const vector = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vector.fromBufferAttribute(position, index);
    const angle = Math.atan2(vector.z, vector.x);
    const normalizedY = THREE.MathUtils.clamp(vector.y / 12.7, 0, 1);
    const longFold = Math.sin(angle * 7 + vector.y * 0.82) * 0.12;
    const fineFold = Math.sin(angle * 15 - vector.y * 1.73) * 0.045;
    const fold = (longFold + fineFold) * (0.4 + normalizedY * 0.6);
    const radius = Math.hypot(vector.x, vector.z) + fold;
    vector.x = Math.cos(angle) * radius;
    vector.z = Math.sin(angle) * radius;
    position.setXYZ(index, vector.x, vector.y, vector.z);
  }
  geometry.computeVertexNormals();
  geometry.userData.sculptMethod = 'radial garment folds at two frequencies';
  return geometry;
}

function createCrown(material, headCenter) {
  const group = new THREE.Group();
  group.name = '七芒冠冕';
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.52, 1.45, 0.62, 28, 1, true), material);
  band.position.copy(headCenter).add(new THREE.Vector3(0, 0.48, 0));
  group.add(band);
  for (let index = 0; index < 7; index += 1) {
    const angle = (index / 7) * Math.PI * 2;
    const start = headCenter.clone().add(new THREE.Vector3(Math.cos(angle) * 1.32, 0.72, Math.sin(angle) * 1.32));
    const end = headCenter.clone().add(new THREE.Vector3(Math.cos(angle) * 3.05, 2.25 + Math.sin(angle * 2) * 0.25, Math.sin(angle) * 3.05));
    const ray = cylinderBetween(start, end, 0.13, material, 7);
    ray.name = `冠冕光芒-${index + 1}`;
    group.add(ray);
  }
  tag(group, 'statue-crown', { rays: 7 });
  return group;
}

export function createStatue(materials) {
  const group = new THREE.Group();
  group.name = '程序化自由女神像';
  const riverFallback = {
    minX: WORLD?.minX ?? -360,
    maxX: (WORLD?.minX ?? -360) + 70,
    minZ: WORLD?.minZ ?? -600,
    maxZ: (WORLD?.minZ ?? -600) + 150,
  };
  const river = normalizeBounds(WORLD?.eastRiver, riverFallback);
  group.position.set(river.x - river.width * 0.1, (WORLD?.seaLevel ?? -1) + 0.5, river.z - river.depth * 0.36);
  group.scale.setScalar(0.72);
  tag(group, 'sculpted-statue', { landmark: 'statue-of-liberty', features: ['crown', 'torch', 'tablet', 'vertex-folded-robe'] });

  const baseMaterial = materials.bridgeMaterial;
  boxMesh('十一角星要塞基座', new THREE.Vector3(13, 2.4, 13), baseMaterial, new THREE.Vector3(0, 1.2, 0), group, 'statue-pedestal', { form: 'fort-star abstraction' });
  boxMesh('自由女神石座', new THREE.Vector3(8.5, 7.5, 8.5), baseMaterial, new THREE.Vector3(0, 6.15, 0), group, 'statue-pedestal', { tier: 2 });

  const robe = new THREE.Mesh(sculptRobeGeometry(), materials.statueMaterial);
  robe.name = '顶点衣褶长袍';
  robe.position.y = 9.9;
  robe.castShadow = true;
  robe.receiveShadow = true;
  tag(robe, 'statue-robe-sculpt', { vertexDisplacement: true, frequencies: 2 });
  group.add(robe);

  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), materials.statueMaterial);
  shoulders.position.y = 22.4;
  shoulders.scale.set(1.15, 0.72, 0.86);
  shoulders.castShadow = true;
  group.add(shoulders);
  const headCenter = new THREE.Vector3(0, 25.25, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.35, 24, 18), materials.statueMaterial);
  head.position.copy(headCenter);
  head.scale.set(0.82, 1.15, 0.9);
  head.castShadow = true;
  tag(head, 'statue-head', { sculptedProfile: true });
  group.add(head);
  group.add(createCrown(materials.statueMaterial, headCenter));

  const raisedShoulder = new THREE.Vector3(1.35, 22.8, 0);
  const raisedElbow = new THREE.Vector3(2.5, 27.8, 0.15);
  const raisedHand = new THREE.Vector3(2.55, 32.2, 0.1);
  group.add(cylinderBetween(raisedShoulder, raisedElbow, 0.58, materials.statueMaterial, 12));
  group.add(cylinderBetween(raisedElbow, raisedHand, 0.46, materials.statueMaterial, 12));
  const torchCup = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.8, 1.45, 12), materials.statueMaterial);
  torchCup.position.set(raisedHand.x, raisedHand.y + 0.75, raisedHand.z);
  group.add(torchCup);
  const flameMaterial = new THREE.MeshStandardMaterial({ color: 0xffc04a, emissive: 0xff7a14, emissiveIntensity: 4.2, roughness: 0.28 });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.65, 2.25, 12), flameMaterial);
  flame.name = '自由女神火炬火焰';
  flame.position.set(raisedHand.x, raisedHand.y + 2.55, raisedHand.z);
  flame.rotation.z = -0.12;
  tag(flame, 'animated-torch', { procedural: true });
  group.add(flame);

  const book = boxMesh('法典石板', new THREE.Vector3(3.1, 4.2, 0.55), materials.statueMaterial, new THREE.Vector3(-2.1, 21.2, 0.95), group, 'statue-tablet', { inscription: 'JULY IV MDCCLXXVI' });
  book.rotation.z = -0.24;
  book.rotation.y = -0.2;
  group.add(cylinderBetween(new THREE.Vector3(-1.05, 22.8, 0.2), new THREE.Vector3(-2.15, 20.9, 0.85), 0.52, materials.statueMaterial, 12));

  function update(_dt, elapsed) {
    const pulse = 1 + Math.sin(elapsed * 8.2) * 0.06 + Math.sin(elapsed * 13.7) * 0.025;
    flame.scale.set(pulse, 0.96 + pulse * 0.05, pulse);
    flameMaterial.emissiveIntensity = 3.9 + pulse * 0.55;
  }

  return { group, flame, update, instanceCount: 0 };
}
