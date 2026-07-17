import * as THREE from 'three';
import { WORLD } from '../config.js';
import { localNoise, seededUnit, tag } from './helpers.js';

function sculptCloudPuffGeometry(seed) {
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  const position = geometry.attributes.position;
  const vector = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    vector.fromBufferAttribute(position, index);
    const displacement = 1 + localNoise(vector.x * 3.7, vector.z * 4.1 + vector.y, seed) * 0.11;
    vector.multiplyScalar(displacement);
    position.setXYZ(index, vector.x, vector.y, vector.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createClouds(materials, seed = 1337, options = {}) {
  const group = new THREE.Group();
  group.name = '顶点雕刻体积云团';
  const clusters = options.cloudClusters ?? 11;
  const puffsPerCluster = 8;
  const count = clusters * puffsPerCluster;
  const mesh = new THREE.InstancedMesh(sculptCloudPuffGeometry(seed), materials.cloudMaterial, count);
  mesh.name = '多球聚合体积云实例';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  let index = 0;
  for (let cluster = 0; cluster < clusters; cluster += 1) {
    const centerX = THREE.MathUtils.lerp(WORLD.minX - 90, WORLD.maxX + 90, seededUnit(seed, 7000 + cluster * 4));
    const centerZ = THREE.MathUtils.lerp(WORLD.minZ - 80, WORLD.maxZ + 80, seededUnit(seed, 7001 + cluster * 4));
    const centerY = 142 + seededUnit(seed, 7002 + cluster * 4) * 62;
    const clusterScale = 9 + seededUnit(seed, 7003 + cluster * 4) * 9;
    for (let puff = 0; puff < puffsPerCluster; puff += 1) {
      const angle = (puff / puffsPerCluster) * Math.PI * 2 + seededUnit(seed, 7100 + index) * 0.9;
      const radial = puff === 0 ? 0 : clusterScale * (0.45 + seededUnit(seed, 7200 + index) * 0.8);
      const x = centerX + Math.cos(angle) * radial;
      const z = centerZ + Math.sin(angle) * radial * 0.58;
      const y = centerY + (seededUnit(seed, 7300 + index) - 0.5) * clusterScale * 0.48;
      const size = clusterScale * (0.56 + seededUnit(seed, 7400 + index) * 0.54);
      matrix.compose(
        new THREE.Vector3(x, y, z),
        quaternion.setFromEuler(new THREE.Euler(0, seededUnit(seed, 7500 + index) * Math.PI, 0)),
        new THREE.Vector3(size * 1.35, size * 0.72, size),
      );
      mesh.setMatrixAt(index++, matrix);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  tag(mesh, 'volumetric-clouds', { method: 'displaced-icosahedron-clusters', clusters, instances: count });
  group.add(mesh);

  const worldWidth = WORLD.maxX - WORLD.minX;
  function update(dt) {
    const speed = options.cloudSpeed ?? 3.2;
    group.position.x += dt * speed;
    if (group.position.x > worldWidth + 220) group.position.x -= worldWidth * 2 + 440;
  }
  return { group, update, instanceCount: count };
}
