import * as THREE from 'three';
import { WORLD } from '../config.js';
import { seededUnit, tag } from './helpers.js';

function createIslandGround(materials) {
  const shape = new THREE.Shape();
  const centerX = (WORLD.minX + WORLD.maxX) * 0.5;
  const halfWidth = (WORLD.maxX - WORLD.minX) * 0.5;
  const right = [];
  const left = [];
  for (let index = 0; index <= 42; index += 1) {
    const t = index / 42;
    const z = THREE.MathUtils.lerp(WORLD.minZ, WORLD.maxZ, t);
    const taper = 0.58 + 0.42 * Math.sin(Math.PI * Math.pow(t, 0.86));
    right.push([centerX + halfWidth * taper, z]);
    left.push([centerX - halfWidth * taper, z]);
  }
  const outline = [...right, ...left.reverse()];
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let index = 1; index < outline.length; index += 1) shape.lineTo(outline[index][0], outline[index][1]);
  shape.closePath();
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.sidewalkMaterial);
  ground.name = '曼哈顿岛基底';
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = WORLD.roadY - 0.075;
  ground.receiveShadow = true;
  tag(ground, 'manhattan-island', { proceduralOutline: true, taperedEnds: true });
  return ground;
}

function roadMetrics(road) {
  const start = road.start ?? { x: road.x ?? 0, z: WORLD.minZ };
  const end = road.end ?? { x: road.x ?? 0, z: WORLD.maxZ };
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  return {
    centerX: (start.x + end.x) * 0.5,
    centerZ: (start.z + end.z) * 0.5,
    length: Math.hypot(dx, dz),
    width: road.width ?? 8,
    rotation: -Math.atan2(dz, dx),
  };
}

function createRoads(plan, materials) {
  const group = new THREE.Group();
  group.name = '曼哈顿道路系统';
  for (const road of plan.roads ?? []) {
    const metric = roadMetrics(road);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(metric.length, 0.12, metric.width), materials.roadMaterial);
    mesh.name = road.id ?? road.type ?? '道路';
    mesh.position.set(metric.centerX, WORLD.roadY, metric.centerZ);
    mesh.rotation.y = metric.rotation;
    mesh.receiveShadow = true;
    tag(mesh, road.type === 'broadway' ? 'broadway-diagonal-road' : 'grid-road', { roadId: road.id, roadType: road.type, width: metric.width });
    group.add(mesh);
  }
  tag(group, 'manhattan-road-grid', { avenueCount: plan.avenues?.length ?? 0, streetCount: plan.streets?.length ?? 0, broadway: Boolean(plan.broadway) });
  return group;
}

function createCrosswalks(plan, materials) {
  const avenues = plan.avenues ?? [];
  const streets = plan.streets ?? [];
  const count = avenues.length * streets.length * 8;
  if (!count) return { mesh: null, count: 0 };
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.035, 1), materials.lineMaterial, count);
  mesh.name = '斑马线实例';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  let instance = 0;
  for (const avenue of avenues) {
    for (const street of streets) {
      for (let stripe = 0; stripe < 4; stripe += 1) {
        const offset = (stripe - 1.5) * 0.85;
        matrix.compose(new THREE.Vector3(avenue.x, WORLD.roadY + 0.085, street.z + street.width * 0.36 + offset), quaternion, new THREE.Vector3(avenue.width * 0.72, 1, 0.42));
        mesh.setMatrixAt(instance++, matrix);
        matrix.compose(new THREE.Vector3(avenue.x + avenue.width * 0.36 + offset, WORLD.roadY + 0.085, street.z), quaternion, new THREE.Vector3(0.42, 1, street.width * 0.72));
        mesh.setMatrixAt(instance++, matrix);
      }
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.receiveShadow = true;
  tag(mesh, 'crosswalks', { intersections: avenues.length * streets.length, stripes: count, instanced: true });
  return { mesh, count };
}

function createStreetLamps(plan, materials, seed) {
  const samples = [];
  const avenues = plan.avenues ?? [];
  const streets = plan.streets ?? [];
  for (let avenueIndex = 0; avenueIndex < avenues.length; avenueIndex += 2) {
    for (let streetIndex = 0; streetIndex < streets.length; streetIndex += 2) {
      const avenue = avenues[avenueIndex];
      const street = streets[streetIndex];
      samples.push({ x: avenue.x + avenue.width * 0.68, z: street.z + street.width * 0.72 });
      samples.push({ x: avenue.x - avenue.width * 0.68, z: street.z - street.width * 0.72 });
    }
  }
  const group = new THREE.Group();
  group.name = '路灯系统';
  if (!samples.length) return { group, count: 0 };
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.16, 5.6, 7), materials.metalMaterial, samples.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 8, 6), materials.lampMaterial, samples.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  samples.forEach((sample, index) => {
    matrix.compose(new THREE.Vector3(sample.x, WORLD.sidewalkY + 2.8, sample.z), quaternion, new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(index, matrix);
    const lean = (seededUnit(seed, 5000 + index) - 0.5) * 0.08;
    matrix.compose(new THREE.Vector3(sample.x + lean, WORLD.sidewalkY + 5.55, sample.z), quaternion, new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(index, matrix);
  });
  for (const mesh of [poles, heads]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    group.add(mesh);
  }
  tag(group, 'street-lamps', { count: samples.length, instanced: true, daylightLinked: true });
  return { group, count: samples.length * 2 };
}

function createTrafficLights(plan, materials) {
  const intersections = [];
  for (let ai = 0; ai < (plan.avenues?.length ?? 0); ai += 2) {
    for (let si = 0; si < (plan.streets?.length ?? 0); si += 3) intersections.push({ x: plan.avenues[ai].x, z: plan.streets[si].z });
  }
  const group = new THREE.Group();
  group.name = '红绿灯街具';
  if (!intersections.length) return { group, count: 0, update: () => {} };
  const signalMaterial = new THREE.MeshStandardMaterial({ color: 0x202427, roughness: 0.66 });
  const redMaterial = new THREE.MeshStandardMaterial({ color: 0x4d1713, emissive: 0xff2a18, emissiveIntensity: 3.2 });
  const greenMaterial = new THREE.MeshStandardMaterial({ color: 0x123c28, emissive: 0x28e476, emissiveIntensity: 0.15 });
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.14, 4.2, 6), materials.metalMaterial, intersections.length);
  const housings = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 1.7, 0.55), signalMaterial, intersections.length);
  const reds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), redMaterial, intersections.length);
  const greens = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), greenMaterial, intersections.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  intersections.forEach((point, index) => {
    const x = point.x + 5.1;
    const z = point.z + 4.3;
    matrix.compose(new THREE.Vector3(x, 2.1, z), quaternion, new THREE.Vector3(1, 1, 1)); poles.setMatrixAt(index, matrix);
    matrix.compose(new THREE.Vector3(x, 4.55, z), quaternion, new THREE.Vector3(1, 1, 1)); housings.setMatrixAt(index, matrix);
    matrix.compose(new THREE.Vector3(x, 5.02, z - 0.29), quaternion, new THREE.Vector3(1, 1, 1)); reds.setMatrixAt(index, matrix);
    matrix.compose(new THREE.Vector3(x, 4.08, z - 0.29), quaternion, new THREE.Vector3(1, 1, 1)); greens.setMatrixAt(index, matrix);
  });
  for (const mesh of [poles, housings, reds, greens]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    group.add(mesh);
  }
  tag(group, 'traffic-signals', { count: intersections.length, phaseAnimated: true });
  const update = (_dt, elapsed) => {
    const red = Math.sin((elapsed / 26) * Math.PI * 2) > 0;
    redMaterial.emissiveIntensity = red ? 3.2 : 0.12;
    greenMaterial.emissiveIntensity = red ? 0.12 : 3.2;
  };
  return { group, count: intersections.length * 4, update };
}

function createAnimatedBillboard(materials) {
  const group = new THREE.Group();
  group.name = '时代广场程序化广告牌';
  const support = new THREE.Mesh(new THREE.BoxGeometry(0.7, 14, 12), materials.metalMaterial);
  support.position.set(-7, 15, -27);
  group.add(support);
  const material = new THREE.MeshStandardMaterial({ color: 0x268de2, emissive: 0x1268ff, emissiveIntensity: 3.4, roughness: 0.25 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 7.5, 20, 12), material);
  panel.position.set(-7.38, 18, -27);
  panel.rotation.y = -Math.PI / 2;
  tag(panel, 'animated-billboard', { procedural: true, animation: 'color-wave' });
  group.add(panel);
  const update = (_dt, elapsed) => {
    const hue = (elapsed * 0.08) % 1;
    material.color.setHSL(hue, 0.72, 0.5);
    material.emissive.setHSL((hue + 0.08) % 1, 0.9, 0.43);
    const positions = panel.geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      positions.setZ(index, Math.sin(positions.getX(index) * 0.7 + positions.getY(index) * 0.35 + elapsed * 2.4) * 0.035);
    }
    positions.needsUpdate = true;
  };
  return { group, update };
}

export function createProps(plan, materials) {
  const group = new THREE.Group();
  group.name = '道路与城市街具';
  group.add(createIslandGround(materials));
  group.add(createRoads(plan, materials));
  const crosswalks = createCrosswalks(plan, materials);
  if (crosswalks.mesh) group.add(crosswalks.mesh);
  const lamps = createStreetLamps(plan, materials, plan.seed ?? 1337);
  group.add(lamps.group);
  const signals = createTrafficLights(plan, materials);
  group.add(signals.group);
  const billboard = createAnimatedBillboard(materials);
  group.add(billboard.group);
  tag(group, 'city-props', { crosswalks: crosswalks.count, streetLampInstances: lamps.count, trafficLightInstances: signals.count });
  const update = (dt, elapsed) => { signals.update(dt, elapsed); billboard.update(dt, elapsed); };
  return { group, update, instanceCount: crosswalks.count + lamps.count + signals.count };
}
