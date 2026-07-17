import * as THREE from 'three';
import { WORLD } from '../config.js';
import { localNoise, normalizeBounds, seededUnit, tag } from './helpers.js';

const smoothstep = (min, max, value) => {
  const x = THREE.MathUtils.clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
};

function gaussian(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.exp(-(dx * dx + dz * dz) * 2.4);
}

function deformedRockGeometry(seed, index) {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const position = geometry.attributes.position;
  const vector = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    vector.fromBufferAttribute(position, vertex).normalize();
    const ridge = 0.72
      + localNoise(vector.x * 4 + index, vector.z * 5 - vector.y * 2, seed + index * 23) * 0.19
      + Math.abs(vector.y) * 0.16;
    vector.multiplyScalar(ridge);
    vector.y *= 0.7 + seededUnit(seed, index * 31 + vertex) * 0.32;
    position.setXYZ(vertex, vector.x, vector.y, vector.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function createPond(materials, bounds, centerX, centerZ, radiusX, radiusZ, index) {
  const geometry = new THREE.CircleGeometry(1, 64);
  const mesh = new THREE.Mesh(geometry, materials.waterMaterial);
  mesh.name = `中央公园凹塘水面-${index + 1}`;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(bounds.x + centerX * bounds.width * 0.5, (WORLD?.roadY ?? 0) - 1.1, bounds.z + centerZ * bounds.depth * 0.5);
  mesh.scale.set(radiusX * bounds.width * 0.48, radiusZ * bounds.depth * 0.48, 1);
  mesh.receiveShadow = true;
  tag(mesh, 'park-pond', { index: index + 1, geometry: 'true-depressed-basin' });
  return mesh;
}

function createTrees(bounds, seed, materials) {
  const group = new THREE.Group();
  group.name = '中央公园树群';
  const count = 132;
  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.24, 2.7, 6);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const crownPositions = crownGeometry.attributes.position;
  for (let index = 0; index < crownPositions.count; index += 1) {
    const x = crownPositions.getX(index);
    const y = crownPositions.getY(index);
    const z = crownPositions.getZ(index);
    const scale = 1 + localNoise(x * 3, z * 3, seed) * 0.13;
    crownPositions.setXYZ(index, x * scale, y * scale * 0.92, z * scale);
  }
  crownGeometry.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.bridgeMaterial, count);
  const crowns = new THREE.InstancedMesh(crownGeometry, materials.parkMaterial, count);
  trunks.name = '公园树干实例';
  crowns.name = '顶点雕刻树冠实例';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    let nx = seededUnit(seed, index * 5) * 1.8 - 0.9;
    let nz = seededUnit(seed, index * 5 + 1) * 1.8 - 0.9;
    const nearPond = gaussian(nx, nz, -0.25, -0.18, 0.24, 0.17) + gaussian(nx, nz, 0.28, 0.3, 0.2, 0.14);
    if (nearPond > 0.45) nx *= -1;
    const x = bounds.x + nx * bounds.width * 0.5;
    const z = bounds.z + nz * bounds.depth * 0.5;
    const size = 0.82 + seededUnit(seed, index * 5 + 2) * 0.78;
    const baseY = (WORLD?.roadY ?? 0) + 1.35;
    matrix.compose(new THREE.Vector3(x, baseY, z), quaternion, new THREE.Vector3(size, 1, size));
    trunks.setMatrixAt(index, matrix);
    matrix.compose(new THREE.Vector3(x, baseY + 2.4 * size, z), quaternion, new THREE.Vector3(1.45 * size, 1.65 * size, 1.45 * size));
    crowns.setMatrixAt(index, matrix);
    color.setHSL(0.27 + seededUnit(seed, index * 5 + 3) * 0.06, 0.48, 0.25 + seededUnit(seed, index * 5 + 4) * 0.12);
    crowns.setColorAt(index, color);
  }
  [trunks, crowns].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  tag(group, 'park-trees', { count, method: 'InstancedMesh + displaced icosahedron crowns' });
  return { group, count: count * 2 };
}

export function createPark(plan, materials) {
  const fallback = {
    minX: (WORLD?.minX ?? -360) + ((WORLD?.maxX ?? 360) - (WORLD?.minX ?? -360)) * 0.34,
    maxX: (WORLD?.minX ?? -360) + ((WORLD?.maxX ?? 360) - (WORLD?.minX ?? -360)) * 0.66,
    minZ: (WORLD?.minZ ?? -600) + ((WORLD?.maxZ ?? 600) - (WORLD?.minZ ?? -600)) * 0.48,
    maxZ: (WORLD?.minZ ?? -600) + ((WORLD?.maxZ ?? 600) - (WORLD?.minZ ?? -600)) * 0.82,
  };
  const bounds = normalizeBounds(plan?.park ?? WORLD?.park, fallback);
  const seed = plan?.seed ?? plan?.stats?.seed ?? 1337;
  const group = new THREE.Group();
  group.name = '中央公园雕刻地貌';
  tag(group, 'sculpted-park', { method: 'vertex-displacement', ponds: 2, terrainBlend: 'street-edge' });

  const segmentsX = 72;
  const segmentsZ = 92;
  const geometry = new THREE.PlaneGeometry(bounds.width, bounds.depth, segmentsX, segmentsZ);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const lowColor = new THREE.Color(0x456b36);
  const highColor = new THREE.Color(0x789156);
  const dirtColor = new THREE.Color(0x665642);
  const color = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const localX = positions.getX(index);
    const localPlaneY = positions.getY(index);
    const nx = localX / (bounds.width * 0.5);
    const nz = -localPlaneY / (bounds.depth * 0.5);
    const edgeDistance = 1 - Math.max(Math.abs(nx), Math.abs(nz));
    const edgeFade = smoothstep(0, 0.13, edgeDistance);
    const hills = (
      Math.sin(nx * 7.2 + 0.4) * 1.25
      + Math.cos(nz * 8.6 - 0.7) * 0.9
      + localNoise(nx * 21, nz * 24, seed) * 1.45
    ) * edgeFade;
    const pondA = gaussian(nx, nz, -0.25, -0.18, 0.24, 0.17);
    const pondB = gaussian(nx, nz, 0.28, 0.3, 0.2, 0.14);
    const basin = Math.max(pondA * 4.1, pondB * 3.6) * edgeFade;
    const height = hills - basin;
    positions.setZ(index, height);
    if (basin > 1.2) color.copy(dirtColor);
    else color.copy(lowColor).lerp(highColor, THREE.MathUtils.clamp((height + 2) / 5.5, 0, 1));
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, materials.parkMaterial);
  terrain.name = '起伏丘陵与真实下凹塘床';
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.set(bounds.x, WORLD?.roadY ?? 0, bounds.z);
  terrain.receiveShadow = true;
  terrain.castShadow = true;
  tag(terrain, 'sculpted-terrain', { vertices: positions.count, pondDepth: 4.1, edgeBlend: true });
  group.add(terrain);
  group.add(createPond(materials, bounds, -0.25, -0.18, 0.24, 0.17, 0));
  group.add(createPond(materials, bounds, 0.28, 0.3, 0.2, 0.14, 1));

  const rocks = new THREE.Group();
  rocks.name = '曼哈顿片岩露头';
  let rockCount = 0;
  for (let index = 0; index < 18; index += 1) {
    const nx = seededUnit(seed, 400 + index * 4) * 1.7 - 0.85;
    const nz = seededUnit(seed, 401 + index * 4) * 1.7 - 0.85;
    const nearPond = gaussian(nx, nz, -0.25, -0.18, 0.24, 0.17) + gaussian(nx, nz, 0.28, 0.3, 0.2, 0.14);
    if (nearPond > 0.55) continue;
    const rock = new THREE.Mesh(deformedRockGeometry(seed, index), materials.rockMaterial);
    rock.name = `非规则片岩-${index + 1}`;
    rock.position.set(bounds.x + nx * bounds.width * 0.5, (WORLD?.roadY ?? 0) + 0.25, bounds.z + nz * bounds.depth * 0.5);
    rock.scale.set(2.2 + seededUnit(seed, 402 + index * 4) * 4.5, 1.6 + seededUnit(seed, 403 + index * 4) * 2.8, 2 + seededUnit(seed, 404 + index * 4) * 4);
    rock.rotation.set(0, seededUnit(seed, 405 + index * 4) * Math.PI, (seededUnit(seed, 406 + index * 4) - 0.5) * 0.25);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rocks.add(rock);
    rockCount += 1;
  }
  tag(rocks, 'sculpted-rock-outcrops', { count: rockCount, method: 'per-vertex multi-frequency displacement' });
  group.add(rocks);
  const trees = createTrees(bounds, seed, materials);
  group.add(trees.group);

  return { group, bounds, instanceCount: trees.count };
}
