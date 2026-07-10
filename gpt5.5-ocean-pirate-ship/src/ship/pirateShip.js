import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sampleHeight } from '../ocean/waves.js';

const SHIP_URL = '/models/medium_pirate_ship.glb';
const SHIP_SCALE = 1.45;
const WATERLINE_OFFSET = 0.58;

function createStripeTexture({ base, stripe, lineColor, vertical = false, scale = 1 }) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 24; i += 1) {
    const offset = i * 12;
    ctx.fillStyle = i % 2 === 0 ? stripe : base;
    if (vertical) {
      ctx.fillRect(offset, 0, 5, canvas.height);
    } else {
      ctx.fillRect(0, offset, canvas.width, 5);
    }
  }
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i += 1) {
    ctx.beginPath();
    const a = (i * 37) % 256;
    const b = (i * 83) % 256;
    if (vertical) {
      ctx.moveTo(a, 0);
      ctx.bezierCurveTo(a + 16, 70, a - 12, 150, a + 10, 256);
    } else {
      ctx.moveTo(0, b);
      ctx.bezierCurveTo(70, b + 14, 150, b - 10, 256, b + 8);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(scale, scale);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createFabricTexture({ base, thread, scale = 3 }) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = thread;
  for (let i = 0; i < 128; i += 6) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i + 2);
    ctx.lineTo(128, i + 2);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(scale, scale);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const TEXTURES = {
  hull: createStripeTexture({ base: '#2b1108', stripe: '#5a2710', lineColor: '#d38b43', scale: 2.5 }),
  deck: createStripeTexture({ base: '#8b5526', stripe: '#c1843d', lineColor: '#3a1d0a', vertical: true, scale: 4 }),
  canvas: createFabricTexture({ base: '#aa8650', thread: '#ead6a6', scale: 2.5 }),
  blackFabric: createFabricTexture({ base: '#050404', thread: '#3a332c', scale: 2.8 }),
};

const MATERIAL_TUNING = [
  { match: 'varnished dark oak', color: '#230904', map: TEXTURES.hull, metalness: 0, roughness: 0.34, clearcoat: 0.45, clearcoatRoughness: 0.28, specularIntensity: 0.45, envMapIntensity: 0.22 },
  { match: 'warm deck planks', color: '#8b5526', map: TEXTURES.deck, metalness: 0, roughness: 0.56, clearcoat: 0.16, clearcoatRoughness: 0.42, specularIntensity: 0.25, envMapIntensity: 0.12 },
  { match: 'matte black sail cloth', color: '#050404', map: TEXTURES.blackFabric, metalness: 0, roughness: 0.94, doubleSide: true, envMapIntensity: 0.08 },
  { match: 'aged canvas sail cloth', color: '#aa8650', map: TEXTURES.canvas, metalness: 0, roughness: 0.8, doubleSide: true, envMapIntensity: 0.18 },
  { match: 'off-white skull paint', color: '#ddd0a7', metalness: 0, roughness: 0.5, envMapIntensity: 0.2 },
  { match: 'tarred rope', color: '#261407', metalness: 0, roughness: 0.86, envMapIntensity: 0.1 },
  { match: 'dark gunmetal', color: '#050608', metalness: 1, roughness: 0.22, envMapIntensity: 0.85 },
  { match: 'aged brass', color: '#d18a22', metalness: 1, roughness: 0.2, envMapIntensity: 0.8 },
  { match: 'warm lantern glass', color: '#ff9d38', metalness: 0, roughness: 0.04, transmission: 0.15, opacity: 0.58, transparent: true, envMapIntensity: 1.4 },
];

function tuneMaterial(material) {
  const rule = MATERIAL_TUNING.find((item) => material.name.includes(item.match));
  if (!rule) {
    return material;
  }
  const tuned = new THREE.MeshPhysicalMaterial({
    name: `${material.name} tuned`,
    color: rule.color,
    map: rule.map ?? null,
    metalness: rule.metalness,
    roughness: rule.roughness,
    clearcoat: rule.clearcoat ?? 0,
    clearcoatRoughness: rule.clearcoatRoughness ?? 0,
    specularIntensity: rule.specularIntensity ?? 0.5,
    transmission: rule.transmission ?? 0,
    transparent: rule.transparent ?? false,
    opacity: rule.opacity ?? 1,
    envMapIntensity: rule.envMapIntensity ?? 1,
    side: rule.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  tuned.needsUpdate = true;
  return tuned;
}

function materialFromMeshName(object) {
  const name = object.name.toLowerCase();
  if (name.includes('large black main sail') || name.includes('black_flag')) {
    return new THREE.MeshPhysicalMaterial({
      name: 'tuned black sail cloth',
      color: '#050404',
      map: TEXTURES.blackFabric,
      roughness: 0.92,
      envMapIntensity: 0.08,
      side: THREE.DoubleSide,
    });
  }
  if (name.includes('pirate_ship_hull')) {
    return new THREE.MeshPhysicalMaterial({
      name: 'tuned varnished hull',
      color: '#2b1108',
      map: TEXTURES.hull,
      metalness: 0,
      roughness: 0.34,
      clearcoat: 0.45,
      clearcoatRoughness: 0.28,
      specularIntensity: 0.45,
      envMapIntensity: 0.22,
    });
  }
  if (name.includes('aged canvas')) {
    return new THREE.MeshPhysicalMaterial({
      name: 'tuned aged canvas',
      color: '#aa8650',
      map: TEXTURES.canvas,
      roughness: 0.78,
      envMapIntensity: 0.18,
      side: THREE.DoubleSide,
    });
  }
  return null;
}

export async function loadPirateShip(scene) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(SHIP_URL);
  const ship = gltf.scene;

  ship.name = 'medium-pirate-ship';
  ship.scale.setScalar(SHIP_SCALE);
  ship.position.set(-8, 0, -8);
  ship.rotation.y = -0.5;

  ship.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const nameMaterial = materialFromMeshName(object);
      if (nameMaterial) {
        object.material = nameMaterial;
      } else {
        const tunedMaterials = materials.map((material) => (material ? tuneMaterial(material) : material));
        object.material = Array.isArray(object.material) ? tunedMaterials : tunedMaterials[0];
      }
    }
  });

  scene.add(ship);
  return ship;
}

export function inspectShipMaterials(ship) {
  const materials = [];
  ship?.traverse((object) => {
    if (!object.isMesh) {
      return;
    }
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material) {
        continue;
      }
      materials.push({
        object: object.name,
        material: material.name,
        type: material.type,
        color: material.color?.getHexString?.(),
        metalness: material.metalness,
        roughness: material.roughness,
        clearcoat: material.clearcoat,
        envMapIntensity: material.envMapIntensity,
      });
    }
  });
  return materials;
}

export function updateShipOnWaves(ship, waves, time) {
  if (!ship || waves.length === 0) {
    return;
  }

  const forward = new THREE.Vector3(Math.sin(ship.rotation.y), 0, Math.cos(ship.rotation.y));
  const right = new THREE.Vector3(Math.cos(ship.rotation.y), 0, -Math.sin(ship.rotation.y));
  const center = ship.position;
  const bow = center.clone().addScaledVector(forward, 4.9);
  const stern = center.clone().addScaledVector(forward, -4.9);
  const port = center.clone().addScaledVector(right, -1.65);
  const starboard = center.clone().addScaledVector(right, 1.65);

  const centerHeight = sampleHeight(waves, center.x, center.z, time);
  const bowHeight = sampleHeight(waves, bow.x, bow.z, time);
  const sternHeight = sampleHeight(waves, stern.x, stern.z, time);
  const portHeight = sampleHeight(waves, port.x, port.z, time);
  const starboardHeight = sampleHeight(waves, starboard.x, starboard.z, time);

  ship.position.y = THREE.MathUtils.lerp(ship.position.y, centerHeight + WATERLINE_OFFSET, 0.08);

  const targetPitch = Math.atan2(bowHeight - sternHeight, 9.8) * 0.72;
  const targetRoll = Math.atan2(starboardHeight - portHeight, 3.3) * 0.55;
  ship.rotation.x = THREE.MathUtils.lerp(ship.rotation.x, targetPitch, 0.06);
  ship.rotation.z = THREE.MathUtils.lerp(ship.rotation.z, targetRoll, 0.06);
}
