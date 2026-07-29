import * as THREE from 'three';
import { projectLonLat, terrainHeight } from '../geo/projection.js';

const EVENT_COLORS = {
  battle: 0xd85c45,
  war: 0xd85c45,
  'war-end': 0xb68a60,
  capital: 0xe3bd67,
  regime: 0xb685d4,
  reform: 0x55ae91,
  diplomacy: 0x5d9fc6,
  terrain: 0x4aa4a5,
  infrastructure: 0xd2a14d,
  expansion: 0xc8784c,
  voyage: 0x4b9abb,
  prosperity: 0xe1b653,
  administration: 0x6ca5c2,
};

function eventColor(kind) {
  return EVENT_COLORS[kind] ?? 0xc79555;
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

export function createEventLayer(scene, initialEra) {
  const root = new THREE.Group();
  root.name = 'historical-events';
  root.userData.benchRole = 'event-layer';
  scene.add(root);

  let currentEra = initialEra;
  let pickables = [];
  let records = [];
  let targetVisible = true;
  let reveal = 1;

  function setEra(era) {
    currentEra = era;
    disposeGroup(root);
    pickables = [];
    records = [];
    reveal = 0;

    const ringGeometry = new THREE.RingGeometry(1.05, 1.24, 40);
    const stemGeometry = new THREE.CylinderGeometry(0.055, 0.085, 3.2, 8);
    const coreGeometry = new THREE.OctahedronGeometry(0.34, 0);
    const pickGeometry = new THREE.SphereGeometry(1.4, 8, 6);
    const pickMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    });

    for (const event of era.events) {
      const [x, z] = projectLonLat(event.lon, event.lat);
      const y = terrainHeight(event.lon, event.lat) + 0.62;
      const color = eventColor(event.kind);
      const group = new THREE.Group();
      group.name = `event-${event.kind}`;
      group.position.set(x, y, z);
      group.userData.benchRole = 'historical-event';
      group.userData.event = event;

      const ringMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      ringMaterial.userData.baseOpacity = 0.8;
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.12;
      ring.userData.benchRole = 'event-ring';

      const stemMaterial = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      stemMaterial.userData.baseOpacity = 0.5;
      const stem = new THREE.Mesh(stemGeometry, stemMaterial);
      stem.position.y = 1.65;
      stem.userData.benchRole = 'event-beacon';

      const coreMaterial = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.1,
        roughness: 0.35,
        metalness: 0.22,
      });
      const core = new THREE.Mesh(coreGeometry, coreMaterial);
      core.position.y = 3.35;
      core.userData.benchRole = 'event-beacon';

      const proxy = new THREE.Mesh(pickGeometry, pickMaterial);
      proxy.position.y = 2;
      proxy.scale.set(1.35, 2.4, 1.35);
      proxy.userData.type = 'event';
      proxy.userData.event = event;
      group.add(ring, stem, core, proxy);
      root.add(group);
      pickables.push(proxy);
      records.push({ event, group, ring, stem, core });
    }

    return records.length;
  }

  function setVisible(visible) {
    targetVisible = Boolean(visible);
  }

  function update(elapsed, deltaSeconds) {
    const target = targetVisible ? 1 : 0;
    reveal = THREE.MathUtils.damp(reveal, target, 4, Math.max(0, deltaSeconds));
    root.visible = reveal > 0.02;

    records.forEach((record, index) => {
      const phase = elapsed * 2 + index * 1.7;
      const pulse = 1 + Math.sin(phase) * 0.18;
      record.ring.scale.setScalar(pulse);
      record.ring.rotation.z += deltaSeconds * (0.18 + index * 0.035);
      record.ring.material.opacity = record.ring.material.userData.baseOpacity * reveal * (0.8 + Math.sin(phase) * 0.16);
      record.stem.material.opacity = record.stem.material.userData.baseOpacity * reveal;
      record.core.scale.setScalar(0.9 + Math.sin(phase * 1.25) * 0.13);
      record.core.material.emissiveIntensity = 0.5 + reveal * (0.75 + Math.sin(phase) * 0.22);
    });
  }

  function getPickables() {
    return pickables;
  }

  function getStats() {
    return {
      eventCount: records.length,
      eraId: currentEra.id,
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
    getPickables,
    getStats,
    dispose,
  };
}
