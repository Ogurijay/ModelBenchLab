import * as THREE from 'three';
import { createTerritoryGrid, territoryAssignments, territorySignature } from '../core/territory.js';
import { projectLonLat, terrainHeight } from '../geo/projection.js';

const CONTROL_OPACITY = {
  core: 0.64,
  administered: 0.56,
  military: 0.48,
  contested: 0.39,
  influence: 0.3,
  tributary: 0.24,
  unknown: 0.2,
};

function colorFromFaction(faction) {
  try {
    return new THREE.Color(faction.color);
  } catch {
    return new THREE.Color(0x9b7c52);
  }
}

function disposeGroup(group) {
  const geometries = new Set();
  const materials = new Set();
  group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  group.clear();
}

export function createTerritoryLayer(scene, initialEra) {
  const root = new THREE.Group();
  root.name = 'historical-territories';
  root.userData.benchRole = 'territory-layer';
  scene.add(root);

  const tiles = createTerritoryGrid();
  let currentEra = null;
  let currentSignature = null;
  let reveal = 1;
  let targetOpacity = 1;
  let instanceCount = 0;

  function setEra(era) {
    currentEra = era;
    reveal = 0;
    disposeGroup(root);

    const assignments = territoryAssignments(era, tiles);
    const byFaction = new Map();
    for (const assignment of assignments) {
      const faction = era.factions.find((candidate) => candidate.id === assignment.factionId);
      if (!faction) continue;
      if (!byFaction.has(faction.id)) byFaction.set(faction.id, { faction, tiles: [] });
      byFaction.get(faction.id).tiles.push(assignment);
    }

    const radius = 2.16;
    const geometry = new THREE.CylinderGeometry(radius, radius, 0.23, 6, 1, false);
    const dummy = new THREE.Object3D();
    instanceCount = 0;

    for (const { faction, tiles: factionTiles } of byFaction.values()) {
      const opacity = CONTROL_OPACITY[faction.controlType] ?? 0.42;
      const material = new THREE.MeshBasicMaterial({
        color: colorFromFaction(faction),
        transparent: true,
        opacity: opacity * targetOpacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -1,
      });
      material.userData.baseOpacity = opacity;

      const mesh = new THREE.InstancedMesh(geometry, material, factionTiles.length);
      mesh.name = `territory-${faction.id}`;
      mesh.userData.benchRole = 'territory';
      mesh.userData.factionId = faction.id;
      mesh.renderOrder = 3;
      mesh.frustumCulled = true;

      factionTiles.forEach((tile, index) => {
        const [x, z] = projectLonLat(tile.lon, tile.lat);
        const y = terrainHeight(tile.lon, tile.lat) + 0.35;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, Math.PI / 6, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      root.add(mesh);
      instanceCount += factionTiles.length;
    }

    currentSignature = territorySignature(era, tiles);
    return currentSignature;
  }

  function setVisible(visible) {
    targetOpacity = visible ? 1 : 0;
    root.visible = visible || reveal > 0.01;
  }

  function update(deltaSeconds) {
    const speed = 2.9;
    reveal = THREE.MathUtils.damp(reveal, targetOpacity, speed, Math.max(0, deltaSeconds));
    root.visible = reveal > 0.015;
    root.children.forEach((mesh) => {
      if (!mesh.material) return;
      mesh.material.opacity = (mesh.material.userData.baseOpacity ?? 0.4) * reveal;
    });
  }

  function getStats() {
    return {
      tileCount: tiles.length,
      instanceCount,
      factionCount: currentEra?.factions?.length ?? 0,
      signature: currentSignature,
    };
  }

  function dispose() {
    scene.remove(root);
    disposeGroup(root);
  }

  setEra(initialEra);

  return {
    group: root,
    setEra,
    setVisible,
    update,
    getStats,
    get signature() {
      return currentSignature;
    },
    dispose,
  };
}
