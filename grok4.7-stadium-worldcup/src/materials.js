import * as THREE from "three";

export const clipPlanes = [];

function std(params) {
  return new THREE.MeshStandardMaterial({
    roughness: 0.8,
    metalness: 0.04,
    clippingPlanes: clipPlanes,
    ...params,
  });
}

export function createMaterials() {
  const clay = std({ color: 0xe7e1d6, roughness: 0.92, metalness: 0 });
  const xray = new THREE.MeshStandardMaterial({
    color: 0xc5d4e2,
    roughness: 0.35,
    metalness: 0.05,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    clippingPlanes: clipPlanes,
    side: THREE.DoubleSide,
  });
  const xraySteel = xray.clone();
  xraySteel.opacity = 0.45;
  xraySteel.color.set(0x9eb4c8);
  xraySteel.depthWrite = true;
  const xraySeat = xray.clone();
  xraySeat.opacity = 0.22;
  xraySeat.depthWrite = true;

  const lib = {
    concrete: std({ color: 0xd5cbbd, roughness: 0.9, metalness: 0.02, vertexColors: true }),
    soffit: std({ color: 0xb7aea0, roughness: 0.92, metalness: 0, vertexColors: true }),
    steel: std({ color: 0x8d97a1, roughness: 0.38, metalness: 0.72, vertexColors: true }),
    steelDark: std({ color: 0x3c4450, roughness: 0.45, metalness: 0.6 }),
    membrane: new THREE.MeshStandardMaterial({
      color: 0xf3eee4,
      roughness: 0.62,
      metalness: 0.02,
      emissive: 0xffe6c4,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      clippingPlanes: clipPlanes,
    }),
    ceramic: std({ color: 0xe4dcd0, roughness: 0.58, metalness: 0.08 }),
    copper: std({ color: 0x8d4e36, roughness: 0.46, metalness: 0.55 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xd5e4de,
      roughness: 0.08,
      metalness: 0,
      transmission: 0.65,
      thickness: 0.4,
      transparent: true,
      opacity: 0.45,
      clippingPlanes: clipPlanes,
      side: THREE.DoubleSide,
    }),
    grass: std({ color: 0x2f6d3c, roughness: 0.95, metalness: 0 }),
    soil: std({ color: 0x3e6a40, roughness: 1, metalness: 0 }),
    line: std({ color: 0xf3f0e7, roughness: 0.7, metalness: 0 }),
    seat: std({ color: 0xffffff, roughness: 0.72, metalness: 0.02 }),
    stone: std({ color: 0xcfc6b8, roughness: 0.78, metalness: 0.02, vertexColors: true }),
    wood: std({ color: 0x8a5a3c, roughness: 0.62, metalness: 0.04, vertexColors: true }),
    plaster: std({ color: 0xe7e0d4, roughness: 0.9, metalness: 0 }),
    emitWarm: std({
      color: 0x2a2118,
      emissive: 0xffb15a,
      emissiveIntensity: 0.15,
      roughness: 0.5,
    }),
    emitCool: std({
      color: 0x1a2430,
      emissive: 0xd7e6ff,
      emissiveIntensity: 0.2,
      roughness: 0.4,
    }),
    lamp: std({
      color: 0xf5f7ff,
      emissive: 0xf0f4ff,
      emissiveIntensity: 0.4,
      roughness: 0.3,
    }),
    water: std({ color: 0x6e8f92, roughness: 0.18, metalness: 0.55 }),
    pave: std({ color: 0xc8bfb2, roughness: 0.92, metalness: 0, vertexColors: true }),
    trunk: std({ color: 0x6b5344, roughness: 0.9, metalness: 0 }),
    leaf: std({ color: 0x3e6b45, roughness: 1, metalness: 0 }),
    context: new THREE.MeshStandardMaterial({
      color: 0xf6f4f0,
      roughness: 0.28,
      metalness: 0.02,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      clippingPlanes: clipPlanes,
      side: THREE.DoubleSide,
    }),
    contextEdge: new THREE.LineBasicMaterial({ color: 0xfbfaf7, transparent: true, opacity: 0.55 }),
    rail: std({ color: 0xc8beb0, roughness: 0.4, metalness: 0.45 }),
  };

  const keys = Object.keys(lib);
  return { lib, keys, clay, xray, xraySteel, xraySeat, clipPlanes };
}

export function applyLook(root, look, pack) {
  root.traverse((obj) => {
    if (!obj.isMesh && !obj.isInstancedMesh) return;
    const key = obj.userData.matKey;
    if (!key || !pack.lib[key]) return;
    if (look === "clay") {
      obj.material = key === "context" || key === "glass" || key === "membrane" ? pack.lib.context : pack.clay;
      return;
    }
    if (look === "xray") {
      obj.material = key === "steel" || key === "steelDark" ? pack.xraySteel : key === "seat" ? pack.xraySeat : pack.xray;
      return;
    }
    obj.material = pack.lib[key];
  });
}
