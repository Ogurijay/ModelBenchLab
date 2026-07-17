import * as THREE from 'three';
import { tagBenchRole } from '../config.js';

export const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

export function tag(object, role, details = {}) {
  tagBenchRole(object, role, details);
  return object;
}

export function seededUnit(seed, index = 0) {
  let value = (Number(seed) || 1) ^ Math.imul(index + 1, 0x9e3779b1);
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

export function localNoise(x, z, seed = 1) {
  const a = Math.sin(x * 0.173 + z * 0.117 + seed * 0.013) * 0.52;
  const b = Math.sin(x * 0.071 - z * 0.223 + seed * 0.031) * 0.31;
  const c = Math.cos(x * 0.319 + z * 0.043 - seed * 0.019) * 0.17;
  return a + b + c;
}

export function boxMesh(name, size, material, position, parent, role, details = {}) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (role) tag(mesh, role, details);
  parent.add(mesh);
  return mesh;
}

export function cylinderBetween(start, end, radius, material, radialSegments = 8) {
  const delta = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, delta.length(), radialSegments, 1, false),
    material,
  );
  mesh.position.copy(start).addScaledVector(delta, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize());
  mesh.castShadow = true;
  return mesh;
}

export function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const candidates = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
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

export function normalizeBounds(value, fallback) {
  const source = value ?? {};
  const width = source.width ?? source.w ?? fallback.maxX - fallback.minX;
  const depth = source.depth ?? source.d ?? fallback.maxZ - fallback.minZ;
  const x = source.x ?? source.cx ?? source.center?.x ?? (source.minX != null && source.maxX != null ? (source.minX + source.maxX) * 0.5 : (fallback.minX + fallback.maxX) * 0.5);
  const z = source.z ?? source.cz ?? source.center?.z ?? (source.minZ != null && source.maxZ != null ? (source.minZ + source.maxZ) * 0.5 : (fallback.minZ + fallback.maxZ) * 0.5);
  return {
    x,
    z,
    width: source.maxX != null && source.minX != null ? source.maxX - source.minX : width,
    depth: source.maxZ != null && source.minZ != null ? source.maxZ - source.minZ : depth,
  };
}

export function lotMetrics(lot, fallbackHeight = 24) {
  const minX = lot?.minX;
  const maxX = lot?.maxX;
  const minZ = lot?.minZ;
  const maxZ = lot?.maxZ;
  return {
    x: lot?.x ?? lot?.cx ?? lot?.center?.x ?? (minX != null && maxX != null ? (minX + maxX) * 0.5 : 0),
    z: lot?.z ?? lot?.cz ?? lot?.center?.z ?? (minZ != null && maxZ != null ? (minZ + maxZ) * 0.5 : 0),
    width: Math.max(3, lot?.width ?? lot?.w ?? (minX != null && maxX != null ? maxX - minX : 10)),
    depth: Math.max(3, lot?.depth ?? lot?.d ?? (minZ != null && maxZ != null ? maxZ - minZ : 10)),
    height: Math.max(5, lot?.height ?? lot?.h ?? fallbackHeight),
    rotation: lot?.rotationY ?? lot?.rotation ?? lot?.angle ?? 0,
    style: lot?.style ?? lot?.material ?? lot?.zone ?? 'limestone',
  };
}
