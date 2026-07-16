import * as THREE from 'three';

function makeNoiseTexture(size = 128) {
  const data = new Uint8Array(size * size * 4);
  let seed = 9137;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < size * size; i++) {
    const value = 58 + Math.floor(random() * 58);
    data[i * 4] = value;
    data[i * 4 + 1] = value - 3;
    data[i * 4 + 2] = value - 8;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(18, 18);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createLog(angle, material, emberMaterial) {
  const group = new THREE.Group();
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 2.25, 14, 5), material);
  log.rotation.z = Math.PI / 2;
  log.castShadow = true;
  log.receiveShadow = true;
  group.add(log);

  const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.23, 1.22, 14, 1, true), emberMaterial);
  ember.rotation.z = Math.PI / 2;
  ember.position.x = 0.12;
  group.add(ember);
  group.rotation.y = angle;
  group.rotation.z = 0.08 * Math.sin(angle * 2);
  group.position.y = 0.86;
  return group;
}

export function createStage(scene) {
  const stoneTexture = makeNoiseTexture();
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x15130f,
    map: stoneTexture,
    roughness: 0.96,
    metalness: 0.02,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 96), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const plinthMaterial = new THREE.MeshStandardMaterial({ color: 0x28231c, roughness: 0.87, metalness: 0.05 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.4, 0.42, 64), plinthMaterial);
  plinth.position.y = 0.21;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  scene.add(plinth);

  const brazierMaterial = new THREE.MeshStandardMaterial({ color: 0x32271e, roughness: 0.7, metalness: 0.18 });
  const brazier = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.16, 0.46, 64, 1, true), brazierMaterial);
  brazier.position.y = 0.64;
  brazier.castShadow = true;
  brazier.receiveShadow = true;
  scene.add(brazier);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1.42, 0.11, 16, 72),
    new THREE.MeshStandardMaterial({ color: 0x51331f, roughness: 0.42, metalness: 0.66 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.86;
  rim.castShadow = true;
  scene.add(rim);

  const coalBed = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.1, 0.18, 48),
    new THREE.MeshStandardMaterial({ color: 0x120705, emissive: 0x4f0800, emissiveIntensity: 1.3, roughness: 1 }),
  );
  coalBed.position.y = 0.77;
  scene.add(coalBed);

  const logMaterial = new THREE.MeshStandardMaterial({ color: 0x130e0b, roughness: 0.94, metalness: 0 });
  const emberMaterial = new THREE.MeshStandardMaterial({
    color: 0x301008,
    emissive: 0xff2404,
    emissiveIntensity: 2.6,
    roughness: 0.72,
  });
  const logs = new THREE.Group();
  logs.add(createLog(0.22, logMaterial, emberMaterial));
  logs.add(createLog(Math.PI / 2 + 0.12, logMaterial, emberMaterial));
  logs.children[1].position.y += 0.28;
  scene.add(logs);

  const measurementMaterial = new THREE.MeshBasicMaterial({ color: 0x4f3523, transparent: true, opacity: 0.38 });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(4.65, 0.012, 5, 160), measurementMaterial);
  halo.position.set(0, 3.25, -2.8);
  scene.add(halo);
  const tickGeometry = new THREE.BoxGeometry(0.012, 0.22, 0.012);
  const ticks = new THREE.Group();
  for (let i = 0; i < 48; i++) {
    const tick = new THREE.Mesh(tickGeometry, measurementMaterial);
    const angle = i / 48 * Math.PI * 2;
    tick.position.set(Math.cos(angle) * 4.65, 3.25 + Math.sin(angle) * 4.65, -2.8);
    tick.rotation.z = angle;
    tick.scale.y = i % 4 === 0 ? 1.8 : 0.72;
    ticks.add(tick);
  }
  scene.add(ticks);

  const fireLight = new THREE.PointLight(0xff5b16, 54, 10, 1.55);
  fireLight.position.set(0, 2.25, 0.15);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(1024, 1024);
  fireLight.shadow.bias = -0.001;
  scene.add(fireLight);

  const baseLight = new THREE.PointLight(0xff2505, 18, 4.5, 2.0);
  baseLight.position.set(0, 0.95, 0);
  scene.add(baseLight);

  const rimLight = new THREE.SpotLight(0x6f85a8, 34, 24, Math.PI * 0.22, 0.75, 1.5);
  rimLight.position.set(-5.5, 8.5, -6.0);
  rimLight.target.position.set(0, 1.3, 0);
  scene.add(rimLight, rimLight.target);

  return { fireLight, baseLight, coalBed, emberMaterial };
}
