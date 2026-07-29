import * as THREE from 'three';
import { hashString, seededRandom } from '../geo/projection.js';

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.filter(Boolean).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export function createAtmosphere(scene) {
  scene.background = new THREE.Color(0x07110f);
  scene.fog = new THREE.FogExp2(0x091513, 0.0033);

  const root = new THREE.Group();
  root.name = 'cartography-atmosphere';
  root.userData.benchRole = 'atmosphere';
  scene.add(root);

  const hemisphere = new THREE.HemisphereLight(0x9fbeb2, 0x241b13, 1.35);
  hemisphere.userData.benchRole = 'ambient-light';
  scene.add(hemisphere);

  const keyLight = new THREE.DirectionalLight(0xffd38d, 2.45);
  keyLight.position.set(-45, 95, 55);
  keyLight.userData.benchRole = 'sun-light';
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x5a9b8f, 1.15);
  rimLight.position.set(80, 50, -90);
  rimLight.userData.benchRole = 'rim-light';
  scene.add(rimLight);

  const gridMaterial = new THREE.LineBasicMaterial({
    color: 0x8d7a52,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
  });
  for (const radius of [58, 78, 102, 126]) {
    const points = [];
    for (let index = 0; index <= 128; index += 1) {
      const angle = (index / 128) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * radius, -0.75, Math.sin(angle) * radius));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const ring = new THREE.Line(geometry, gridMaterial);
    ring.userData.benchRole = 'cartography-grid';
    root.add(ring);
  }

  for (let angleIndex = 0; angleIndex < 16; angleIndex += 1) {
    const angle = (angleIndex / 16) * Math.PI * 2;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(angle) * 46, -0.76, Math.sin(angle) * 46),
      new THREE.Vector3(Math.cos(angle) * 130, -0.76, Math.sin(angle) * 130),
    ]);
    const spoke = new THREE.Line(geometry, gridMaterial);
    spoke.userData.benchRole = 'cartography-grid';
    root.add(spoke);
  }

  const rng = seededRandom(hashString('shanhai-atmosphere'));
  const dustCount = 560;
  const positions = new Float32Array(dustCount * 3);
  const colors = new Float32Array(dustCount * 3);
  const warm = new THREE.Color(0xd0ac6a);
  const cool = new THREE.Color(0x6ea594);
  for (let index = 0; index < dustCount; index += 1) {
    const radius = 28 + Math.sqrt(rng()) * 125;
    const angle = rng() * Math.PI * 2;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 7 + rng() * 72;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
    const color = warm.clone().lerp(cool, rng());
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dustGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dustMaterial = new THREE.PointsMaterial({
    size: 0.28,
    transparent: true,
    opacity: 0.42,
    vertexColors: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.userData.benchRole = 'ambient-particles';
  root.add(dust);

  const haloGeometry = new THREE.RingGeometry(132, 158, 96);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0x17443d,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.92;
  halo.userData.benchRole = 'map-halo';
  root.add(halo);

  function setEra(era) {
    const modernity = Math.max(0, Math.min(1, (era.year + 770) / 2795));
    keyLight.color.setHSL(0.103 - modernity * 0.01, 0.72, 0.7);
    rimLight.intensity = 0.9 + modernity * 0.38;
    dustMaterial.opacity = 0.34 + modernity * 0.1;
  }

  function update(elapsed, deltaSeconds) {
    dust.rotation.y += deltaSeconds * 0.005;
    halo.material.opacity = 0.16 + Math.sin(elapsed * 0.17) * 0.025;
  }

  function dispose() {
    scene.remove(root, hemisphere, keyLight, rimLight);
    disposeTree(root);
    gridMaterial.dispose();
  }

  return {
    group: root,
    setEra,
    update,
    dispose,
  };
}
