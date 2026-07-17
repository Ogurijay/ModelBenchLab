import * as THREE from 'three';
import { WORLD } from '../config.js';
import { createBridge } from './bridge.js';
import { createBuildings } from './buildings.js';
import { createClouds } from './clouds.js';
import { disposeTree, tag } from './helpers.js';
import { createLandmarks } from './landmarks.js';
import { createWorldMaterials } from './materials.js';
import { createPark } from './park.js';
import { createProps } from './props.js';
import { createStatue } from './statue.js';

function createSurroundingWater(materials) {
  const eastFar = WORLD?.eastRiver?.farX ?? WORLD.maxX + 180;
  const width = Math.max(1800, WORLD.maxX - WORLD.minX + 260, eastFar - WORLD.minX + 180);
  const depth = Math.max(1800, WORLD.maxZ - WORLD.minZ + 260);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 32, 32), materials.waterMaterial);
  water.name = '哈德逊河与东河水域';
  water.rotation.x = -Math.PI / 2;
  water.position.set((WORLD.minX + eastFar) * 0.5, WORLD.seaLevel, (WORLD.minZ + WORLD.maxZ) * 0.5);
  water.receiveShadow = true;
  tag(water, 'surrounding-water', { procedural: true, bodies: ['Hudson', 'East River', 'Upper Bay'] });
  return water;
}

/**
 * Assemble the complete programmatic Manhattan world.
 * No fetches, external models, images, audio or other binary assets are used.
 */
export function createWorld(scene, plan, options = {}) {
  if (!scene?.add) throw new TypeError('createWorld requires a THREE.Scene/Object3D target');
  if (!plan || !Array.isArray(plan.buildingLots)) throw new TypeError('createWorld requires a city plan with buildingLots');

  const group = new THREE.Group();
  group.name = 'GPT-5.6 SOL Ultra 程序化曼哈顿';
  tag(group, 'world-root', {
    model: 'gpt5.6solultra',
    mission: 'manhattan',
    variant: 'procedural',
    seed: plan.seed,
    planSignature: plan.signature,
    zeroExternalAssets: true,
  });
  const materials = createWorldMaterials();
  group.add(createSurroundingWater(materials));

  const props = createProps(plan, materials);
  const buildings = createBuildings(plan, materials);
  const park = createPark(plan, materials);
  const landmarks = createLandmarks(plan, materials);
  const statue = createStatue(materials);
  const bridge = createBridge(materials);
  const clouds = createClouds(materials, plan.seed, options);
  for (const system of [props, buildings, park, landmarks, statue, bridge, clouds]) group.add(system.group);
  scene.add(group);
  group.updateMatrixWorld(true);

  const instanceCount = props.instanceCount
    + buildings.instanceCount
    + park.instanceCount
    + landmarks.instanceCount
    + statue.instanceCount
    + bridge.instanceCount
    + clouds.instanceCount;
  let internalElapsed = 0;
  let disposed = false;

  function setDaylight(factor) {
    materials.setDaylight(factor);
  }

  function setWeatherResponse(response = {}) {
    materials.setWeatherResponse(response);
    const wet = THREE.MathUtils.clamp(Number(response.wetness) || 0, 0, 1);
    const snow = THREE.MathUtils.clamp(Number(response.snow) || 0, 0, 1);
    const cloudCover = THREE.MathUtils.clamp(Number(response.cloudCover) || 0, 0, 1);
    materials.cloudMaterial.color.setHex(snow > 0.35 ? 0xd6dcdf : wet > 0.55 ? 0x6f7c86 : 0xf4f6f7);
    materials.cloudMaterial.opacity = THREE.MathUtils.lerp(0.08, 0.82, cloudCover);
  }

  function update(dt, elapsed) {
    if (disposed) return;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    internalElapsed = Number.isFinite(elapsed) ? elapsed : internalElapsed + step;
    props.update(step, internalElapsed);
    statue.update(step, internalElapsed);
    clouds.update(step, internalElapsed);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    disposeTree(group);
  }

  setDaylight(1);
  setWeatherResponse({ wetness: 0, snow: 0 });
  return {
    group,
    roadMaterial: materials.roadMaterial,
    buildingMaterials: materials.buildingMaterials,
    snowSurfaces: materials.snowSurfaces,
    highestTarget: landmarks.highestTarget,
    instanceCount,
    landmarkPositions: landmarks.landmarkPositions,
    setDaylight,
    setWeatherResponse,
    update,
    dispose,
  };
}

export default createWorld;
