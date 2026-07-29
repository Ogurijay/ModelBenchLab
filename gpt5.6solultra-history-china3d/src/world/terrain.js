import * as THREE from 'three';
import {
  CHINA_OUTLINE,
  HAINAN_OUTLINE,
  TAIWAN_OUTLINE,
  isInsideChina,
  pointInPolygon,
  projectLonLat,
  terrainBiomeColor,
  terrainHeight,
  unprojectXZ,
} from '../geo/projection.js';

const SEA_LEVEL = 0;
const LAND_SEED = 0x5a17c9e3;

function outlineBounds(outline) {
  const lons = outline.map((point) => point[0]);
  const lats = outline.map((point) => point[1]);
  return {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

function pushTriangleIfInside(indices, outline, triangle) {
  const center = [
    (triangle[0].lon + triangle[1].lon + triangle[2].lon) / 3,
    (triangle[0].lat + triangle[1].lat + triangle[2].lat) / 3,
  ];
  if (pointInPolygon(center, outline)) {
    indices.push(triangle[0].index, triangle[1].index, triangle[2].index);
    return 1;
  }
  return 0;
}

/**
 * 以规则经纬网为基底，仅保留中心位于轮廓内的三角形，形成裁剪网格。
 * 索引顶点会在相邻三角形间共享，因此 computeVertexNormals 能得到连续山体法线。
 */
function createClippedLandGeometry(outline, columns, rows, seed) {
  const bounds = outlineBounds(outline);
  const positions = [];
  const colors = [];
  const samples = [];
  const color = new THREE.Color();
  let minHeight = Infinity;
  let maxHeight = -Infinity;

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const lat = THREE.MathUtils.lerp(bounds.maxLat, bounds.minLat, v);
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const lon = THREE.MathUtils.lerp(bounds.minLon, bounds.maxLon, u);
      const projected = projectLonLat(lon, lat);
      const height = terrainHeight(lon, lat, seed);
      positions.push(projected.x, height, projected.z);
      color.setHex(terrainBiomeColor(lon, lat, height, seed));
      colors.push(color.r, color.g, color.b);
      samples.push({ lon, lat, index: row * (columns + 1) + column });
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }
  }

  const indices = [];
  let triangleCount = 0;
  const vertexAt = (column, row) => samples[row * (columns + 1) + column];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const northWest = vertexAt(column, row);
      const northEast = vertexAt(column + 1, row);
      const southWest = vertexAt(column, row + 1);
      const southEast = vertexAt(column + 1, row + 1);
      triangleCount += pushTriangleIfInside(indices, outline, [northWest, southWest, northEast]);
      triangleCount += pushTriangleIfInside(indices, outline, [northEast, southWest, southEast]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    clippedGrid: true,
    columns,
    rows,
    sourceOutlinePoints: outline.length,
  };

  return {
    geometry,
    vertexCount: positions.length / 3,
    triangleCount,
    minHeight,
    maxHeight,
  };
}

function createBoundaryLine(outline, material, name, role) {
  const points = outline.map(([lon, lat]) => {
    const { x, z } = projectLonLat(lon, lat);
    return new THREE.Vector3(x, terrainHeight(lon, lat, LAND_SEED) + 0.12, z);
  });
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.LineLoop(geometry, material);
  line.name = name;
  line.renderOrder = 4;
  line.userData.benchRole = role;
  return line;
}

function createCoastSkirt(outline, material, name) {
  const positions = [];
  for (let index = 0; index < outline.length; index += 1) {
    const current = outline[index];
    const next = outline[(index + 1) % outline.length];
    const a = projectLonLat(current);
    const b = projectLonLat(next);
    const ay = terrainHeight(current, undefined, LAND_SEED);
    const by = terrainHeight(next, undefined, LAND_SEED);
    positions.push(
      a.x, ay, a.z,
      a.x, SEA_LEVEL + 0.015, a.z,
      b.x, by, b.z,
      b.x, by, b.z,
      a.x, SEA_LEVEL + 0.015, a.z,
      b.x, SEA_LEVEL + 0.015, b.z,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  mesh.userData.benchRole = 'terrain-skirt';
  return mesh;
}

function disposeObjectTree(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const candidates = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    for (const material of candidates) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
    }
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  root.removeFromParent();
}

/**
 * 创建全国程序化地形。
 *
 * 返回的 sampleHeight 使用 Three.js 世界坐标 (x, z)，方便城市、标签和建筑
 * 无需重复处理经纬度投影即可贴合地表。
 */
export function createTerrain(scene) {
  if (!scene?.add) throw new TypeError('createTerrain 需要 THREE.Scene 或 Object3D');

  const group = new THREE.Group();
  group.name = '中国历史演变沙盘地形';
  group.userData.benchRole = 'terrain';
  group.userData.procedural = true;
  group.userData.zeroExternalResources = true;

  const landMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.91,
    metalness: 0.01,
  });
  const skirtMaterial = new THREE.MeshStandardMaterial({
    color: 0x493e2f,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const boundaryMaterial = new THREE.LineBasicMaterial({
    color: 0xe7c878,
    transparent: true,
    opacity: 0.94,
    depthTest: true,
  });
  const islandBoundaryMaterial = new THREE.LineBasicMaterial({
    color: 0xd8b765,
    transparent: true,
    opacity: 0.88,
  });

  const mainland = createClippedLandGeometry(CHINA_OUTLINE, 132, 92, LAND_SEED);
  const hainan = createClippedLandGeometry(HAINAN_OUTLINE, 22, 18, LAND_SEED);
  const taiwan = createClippedLandGeometry(TAIWAN_OUTLINE, 18, 30, LAND_SEED);
  const lands = [
    { data: mainland, name: '中国大陆起伏地形', kind: 'mainland' },
    { data: hainan, name: '海南岛起伏地形', kind: 'hainan' },
    { data: taiwan, name: '台湾岛起伏地形', kind: 'taiwan' },
  ];

  for (const land of lands) {
    const mesh = new THREE.Mesh(land.data.geometry, landMaterial);
    mesh.name = land.name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.benchRole = 'terrain';
    mesh.userData.terrainKind = land.kind;
    mesh.userData.procedural = true;
    group.add(mesh);
  }

  group.add(
    createCoastSkirt(CHINA_OUTLINE, skirtMaterial, '大陆地形侧壁'),
    createCoastSkirt(HAINAN_OUTLINE, skirtMaterial, '海南岛地形侧壁'),
    createCoastSkirt(TAIWAN_OUTLINE, skirtMaterial, '台湾岛地形侧壁'),
  );

  const mainlandBoundary = createBoundaryLine(
    CHINA_OUTLINE,
    boundaryMaterial,
    '全国展示边界线',
    'national-boundary',
  );
  const hainanBoundary = createBoundaryLine(
    HAINAN_OUTLINE,
    islandBoundaryMaterial,
    '海南岛边界线',
    'island-boundary',
  );
  const taiwanBoundary = createBoundaryLine(
    TAIWAN_OUTLINE,
    islandBoundaryMaterial,
    '台湾岛边界线',
    'island-boundary',
  );
  group.add(mainlandBoundary, hainanBoundary, taiwanBoundary);

  const waterGeometry = new THREE.PlaneGeometry(188, 138, 28, 20);
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0x173b52,
    emissive: 0x07141e,
    emissiveIntensity: 0.32,
    roughness: 0.26,
    metalness: 0.18,
    transparent: true,
    opacity: 0.91,
    depthWrite: false,
  });
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.name = '东亚近海水面';
  water.rotation.x = -Math.PI / 2;
  water.position.y = SEA_LEVEL;
  water.receiveShadow = true;
  water.renderOrder = -1;
  water.userData.benchRole = 'water';
  water.userData.procedural = true;
  group.add(water);

  const vertexCount = lands.reduce((total, land) => total + land.data.vertexCount, 0);
  const triangleCount = lands.reduce((total, land) => total + land.data.triangleCount, 0);
  const stats = Object.freeze({
    landMeshes: lands.length,
    islandCount: 2,
    outlinePoints: CHINA_OUTLINE.length + HAINAN_OUTLINE.length + TAIWAN_OUTLINE.length,
    vertexCount,
    triangleCount,
    minHeight: Math.min(...lands.map((land) => land.data.minHeight)),
    maxHeight: Math.max(...lands.map((land) => land.data.maxHeight)),
    seaLevel: SEA_LEVEL,
    procedural: true,
    externalResources: 0,
  });
  group.userData.stats = stats;

  let disposed = false;
  scene.add(group);

  function sampleHeight(xOrPoint, zValue) {
    if (xOrPoint && typeof xOrPoint === 'object' && ('lon' in xOrPoint || 'longitude' in xOrPoint)) {
      const lon = Number(xOrPoint.lon ?? xOrPoint.longitude);
      const lat = Number(xOrPoint.lat ?? xOrPoint.latitude);
      return isInsideChina(lon, lat) ? terrainHeight(lon, lat, LAND_SEED) : SEA_LEVEL;
    }
    const x = Number(
      xOrPoint && typeof xOrPoint === 'object'
        ? (Array.isArray(xOrPoint) ? xOrPoint[0] : xOrPoint.x)
        : xOrPoint,
    );
    const z = Number(
      xOrPoint && typeof xOrPoint === 'object'
        ? (Array.isArray(xOrPoint) ? xOrPoint[1] : xOrPoint.z)
        : zValue,
    );
    if (!Number.isFinite(x) || !Number.isFinite(z)) return SEA_LEVEL;
    const { lon, lat } = unprojectXZ(x, z);
    return isInsideChina(lon, lat) ? terrainHeight(lon, lat, LAND_SEED) : SEA_LEVEL;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    disposeObjectTree(group);
  }

  return {
    group,
    sampleHeight,
    dispose,
    stats,
  };
}

export default createTerrain;
