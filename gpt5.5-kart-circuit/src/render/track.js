import * as THREE from 'three';

export const TRACK_POINTS = [
  [-42, 26],
  [-22, 48],
  [18, 50],
  [52, 28],
  [54, -8],
  [26, -34],
  [-8, -42],
  [-48, -24],
  [-60, 8]
];

export const ROAD_HALF_WIDTH = 8.2;
export const TRACK_SAMPLE_COUNT = 280;

const curve = new THREE.CatmullRomCurve3(
  TRACK_POINTS.map(([x, z]) => new THREE.Vector3(x, 0.04, z)),
  true,
  'catmullrom',
  0.46
);

function makeMaterial(color, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function getNormalAt(t) {
  const tangent = curve.getTangentAt(t).normalize();
  return new THREE.Vector3(-tangent.z, 0, tangent.x);
}

export function getTrackPoint(t) {
  return curve.getPointAt(((t % 1) + 1) % 1);
}

export function getTrackHeading(t) {
  const tangent = curve.getTangentAt(((t % 1) + 1) % 1).normalize();
  return Math.atan2(tangent.x, -tangent.z);
}

export function getCheckpointDefinitions() {
  return Array.from({ length: 6 }, (_, index) => {
    const t = index / 6;
    const position = getTrackPoint(t);
    const normal = getNormalAt(t);
    return {
      id: `checkpoint-${index}`,
      index,
      t,
      position,
      normal
    };
  });
}

export function getBoostDefinitions() {
  return [0.12, 0.32, 0.55, 0.76].map((t, index) => {
    const position = getTrackPoint(t);
    const normal = getNormalAt(t);
    return {
      id: `boost-${index + 1}`,
      t,
      position: position.clone().add(normal.multiplyScalar(index % 2 === 0 ? 2.3 : -2.3)),
      collected: false
    };
  });
}

export function getNearestTrackInfo(x, z) {
  let best = {
    distance: Number.POSITIVE_INFINITY,
    t: 0,
    point: getTrackPoint(0),
    normal: getNormalAt(0),
    signedTrackDistance: 0
  };
  const target = new THREE.Vector2(x, z);

  for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
    const t = i / TRACK_SAMPLE_COUNT;
    const point = getTrackPoint(t);
    const normal = getNormalAt(t);
    const offset = new THREE.Vector2(x - point.x, z - point.z);
    const signedTrackDistance = offset.x * normal.x + offset.y * normal.z;
    const distance = target.distanceTo(new THREE.Vector2(point.x, point.z));
    if (distance < best.distance) {
      best = { distance, t, point, normal, signedTrackDistance };
    }
  }

  return best;
}

function createRoadMesh() {
  const positions = [];
  const indices = [];

  for (let i = 0; i <= TRACK_SAMPLE_COUNT; i += 1) {
    const t = i / TRACK_SAMPLE_COUNT;
    const center = getTrackPoint(t);
    const normal = getNormalAt(t);
    const left = center.clone().add(normal.clone().multiplyScalar(ROAD_HALF_WIDTH));
    const right = center.clone().add(normal.clone().multiplyScalar(-ROAD_HALF_WIDTH));
    positions.push(left.x, 0.12, left.z, right.x, 0.12, right.z);
  }

  for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = makeMaterial('#2f3338', 0.78);
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function createBandMesh({ innerOffset, outerOffset, color, y = 0.09 }) {
  const positions = [];
  const indices = [];

  for (let i = 0; i <= TRACK_SAMPLE_COUNT; i += 1) {
    const t = i / TRACK_SAMPLE_COUNT;
    const center = getTrackPoint(t);
    const normal = getNormalAt(t);
    const inner = center.clone().add(normal.clone().multiplyScalar(innerOffset));
    const outer = center.clone().add(normal.clone().multiplyScalar(outerOffset));
    positions.push(inner.x, y, inner.z, outer.x, y, outer.z);
  }

  for (let i = 0; i < TRACK_SAMPLE_COUNT; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = makeMaterial(color, 0.86);
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

function createRoadMarkings(group) {
  const lineMat = new THREE.MeshStandardMaterial({
    color: '#f8e9a1',
    emissive: '#2d2300',
    emissiveIntensity: 0.12,
    roughness: 0.55
  });
  const arrowMat = new THREE.MeshStandardMaterial({
    color: '#51d7ff',
    emissive: '#138bd5',
    emissiveIntensity: 0.35,
    roughness: 0.4
  });

  for (let i = 0; i < 44; i += 1) {
    const t = i / 44;
    const center = getTrackPoint(t);
    const tangent = curve.getTangentAt(t).normalize();
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 2.6), lineMat);
    dash.position.copy(center);
    dash.position.y = 0.13;
    dash.rotation.y = Math.atan2(tangent.x, tangent.z);
    group.add(dash);
  }

  for (let i = 0; i < 12; i += 1) {
    const t = (i + 0.32) / 12;
    const center = getTrackPoint(t);
    const tangent = curve.getTangentAt(t).normalize();
    const arrow = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.065, 2.1), arrowMat);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.7, 3), arrowMat);
    stem.position.z = 0.2;
    head.position.z = -1.15;
    head.rotation.y = Math.PI;
    arrow.add(stem, head);
    arrow.position.copy(center);
    arrow.position.y = 0.16;
    arrow.rotation.y = Math.atan2(tangent.x, tangent.z);
    group.add(arrow);
  }
}

function createKerbs(group) {
  const red = makeMaterial('#db3b37', 0.68);
  const white = makeMaterial('#f3f1df', 0.68);

  for (let i = 0; i < 72; i += 1) {
    const t = i / 72;
    const center = getTrackPoint(t);
    const normal = getNormalAt(t);
    const side = i % 2 === 0 ? 1 : -1;
    const tangent = curve.getTangentAt(t).normalize();
    const block = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.24, 0.92), i % 4 < 2 ? red : white);
    block.position.copy(center).add(normal.clone().multiplyScalar(side * (ROAD_HALF_WIDTH + 0.36)));
    block.position.y = 0.24;
    block.rotation.y = Math.atan2(tangent.x, tangent.z);
    block.castShadow = true;
    block.receiveShadow = true;
    group.add(block);
  }
}

function createGuardRails(group) {
  const railMat = makeMaterial('#2c6274', 0.48);
  const postMat = makeMaterial('#f1d174', 0.42);

  for (let i = 0; i < 72; i += 1) {
    const t = i / 72;
    const center = getTrackPoint(t);
    const tangent = curve.getTangentAt(t).normalize();
    const normal = getNormalAt(t);

    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.35, 0.34), postMat);
      post.position.copy(center).add(normal.clone().multiplyScalar(side * (ROAD_HALF_WIDTH + 1.25)));
      post.position.y = 0.74;
      post.castShadow = true;
      group.add(post);
    });

    if (i % 2 === 0) {
      [-1, 1].forEach((side) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.34, 0.28), railMat);
        rail.position.copy(center).add(normal.clone().multiplyScalar(side * (ROAD_HALF_WIDTH + 1.25)));
        rail.position.y = 1.32;
        rail.rotation.y = Math.atan2(tangent.x, tangent.z);
        rail.castShadow = true;
        group.add(rail);
      });
    }
  }
}

function createCheckpointGate(definition) {
  const group = new THREE.Group();
  const mat = makeMaterial(definition.index === 0 ? '#ffe166' : '#29b6f6', 0.42);
  const poleGeo = new THREE.CylinderGeometry(0.22, 0.28, 5.8, 12);
  const beamGeo = new THREE.BoxGeometry(18.2, 0.5, 0.5);

  const left = new THREE.Mesh(poleGeo, mat);
  const right = new THREE.Mesh(poleGeo, mat);
  const beam = new THREE.Mesh(beamGeo, mat);
  left.position.set(-9.1, 2.9, 0);
  right.position.set(9.1, 2.9, 0);
  beam.position.set(0, 5.7, 0);
  group.add(left, right, beam);

  group.position.copy(definition.position);
  group.position.y = 0.2;
  group.rotation.y = Math.atan2(definition.normal.x, definition.normal.z);
  group.userData.checkpointIndex = definition.index;
  return group;
}

function createBoostRing(definition) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.18, 10, 32),
    new THREE.MeshStandardMaterial({
      color: '#64f0ff',
      emissive: '#1bb9ff',
      emissiveIntensity: 1.4,
      roughness: 0.25
    })
  );
  ring.position.copy(definition.position);
  ring.position.y = 0.42;
  ring.rotation.x = Math.PI / 2;
  ring.userData.boostId = definition.id;
  return ring;
}

function createDecor(group) {
  const trunk = makeMaterial('#775039', 0.9);
  const leaf = makeMaterial('#2f7d4a', 0.86);
  const coneMat = makeMaterial('#f07d23', 0.58);

  for (let i = 0; i < 42; i += 1) {
    const t = i / 42;
    const center = getTrackPoint(t);
    const normal = getNormalAt(t);
    const side = i % 2 === 0 ? 1 : -1;
    const offset = ROAD_HALF_WIDTH + 9 + (i % 6);

    const tree = new THREE.Group();
    const trunkMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 2.2, 8), trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.65, 3.6, 9), leaf);
    trunkMesh.position.y = 1.1;
    crown.position.y = 3.35;
    tree.add(trunkMesh, crown);
    tree.position.copy(center).add(normal.clone().multiplyScalar(side * offset));
    tree.position.y = 0;
    tree.rotation.y = (i * 0.7) % Math.PI;
    group.add(tree);
  }

  for (let i = 0; i < 30; i += 1) {
    const t = (i + 0.4) / 30;
    const center = getTrackPoint(t);
    const normal = getNormalAt(t);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.2, 12), coneMat);
    cone.position.copy(center).add(normal.clone().multiplyScalar((i % 2 === 0 ? 1 : -1) * (ROAD_HALF_WIDTH - 1.4)));
    cone.position.y = 0.65;
    cone.castShadow = true;
    group.add(cone);
  }
}

export function createTrackWorld() {
  const group = new THREE.Group();
  const road = createRoadMesh();
  const checkpoints = getCheckpointDefinitions();
  const boosts = getBoostDefinitions();

  group.add(createBandMesh({ innerOffset: ROAD_HALF_WIDTH, outerOffset: ROAD_HALF_WIDTH + 5.2, color: '#76935e' }));
  group.add(createBandMesh({ innerOffset: -ROAD_HALF_WIDTH, outerOffset: -(ROAD_HALF_WIDTH + 5.2), color: '#76935e' }));
  group.add(road);
  createRoadMarkings(group);
  createKerbs(group);
  createGuardRails(group);
  createDecor(group);

  const checkpointMeshes = checkpoints.map(createCheckpointGate);
  checkpointMeshes.forEach((mesh) => group.add(mesh));

  const boostMeshes = boosts.map(createBoostRing);
  boostMeshes.forEach((mesh) => group.add(mesh));

  return {
    group,
    checkpoints,
    checkpointMeshes,
    boosts,
    boostMeshes
  };
}
