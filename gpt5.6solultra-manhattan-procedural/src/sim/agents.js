import * as THREE from 'three';

export const AGENT_FIXED_STEP = 1 / 60;

function seedToUint(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  let hash = 2166136261;
  for (const character of String(seed ?? 1337)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seedToUint(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
    else if (object.material) materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function createBird(shared, index) {
  const root = new THREE.Group();
  root.name = `Bird-${index}`;
  root.userData.benchRole = 'bird';

  const body = new THREE.Mesh(shared.birdBodyGeometry, shared.birdMaterial);
  body.rotation.z = -Math.PI / 2;
  root.add(body);

  const leftPivot = new THREE.Group();
  const rightPivot = new THREE.Group();
  leftPivot.position.z = 0.12;
  rightPivot.position.z = -0.12;
  const leftWing = new THREE.Mesh(shared.wingGeometry, shared.birdMaterial);
  const rightWing = new THREE.Mesh(shared.wingGeometry, shared.birdMaterial);
  leftWing.position.z = 0.55;
  rightWing.position.z = -0.55;
  leftPivot.add(leftWing);
  rightPivot.add(rightWing);
  root.add(leftPivot, rightPivot);
  root.userData.leftWing = leftPivot;
  root.userData.rightWing = rightPivot;
  return root;
}

function createHelicopter(shared) {
  const root = new THREE.Group();
  root.name = 'ProceduralHelicopter';
  root.userData.benchRole = 'helicopter';

  const fuselage = new THREE.Mesh(shared.heliBodyGeometry, shared.heliMaterial);
  fuselage.scale.set(2.4, 1, 1.05);
  root.add(fuselage);
  const cabin = new THREE.Mesh(shared.heliCabinGeometry, shared.glassMaterial);
  cabin.position.x = 1.25;
  cabin.scale.set(1.15, 0.78, 0.92);
  root.add(cabin);
  const tail = new THREE.Mesh(shared.tailGeometry, shared.heliMaterial);
  tail.position.x = -3.3;
  tail.rotation.z = Math.PI / 2;
  root.add(tail);

  const mainRotor = new THREE.Group();
  mainRotor.name = 'MainRotor';
  mainRotor.userData.benchRole = 'helicopter-main-rotor';
  mainRotor.position.y = 1.35;
  const bladeA = new THREE.Mesh(shared.rotorGeometry, shared.darkMaterial);
  const bladeB = bladeA.clone();
  bladeB.rotation.y = Math.PI / 2;
  mainRotor.add(bladeA, bladeB);
  root.add(mainRotor);

  const tailRotor = new THREE.Group();
  tailRotor.name = 'TailRotor';
  tailRotor.userData.benchRole = 'helicopter-tail-rotor';
  tailRotor.position.set(-4.35, 0.35, 0);
  tailRotor.rotation.x = Math.PI / 2;
  const tailBladeA = new THREE.Mesh(shared.tailRotorGeometry, shared.darkMaterial);
  const tailBladeB = tailBladeA.clone();
  tailBladeB.rotation.y = Math.PI / 2;
  tailRotor.add(tailBladeA, tailBladeB);
  root.add(tailRotor);
  root.userData.mainRotor = mainRotor;
  root.userData.tailRotor = tailRotor;
  return root;
}

function createBoat(shared, index) {
  const root = new THREE.Group();
  root.name = `Boat-${index}`;
  root.userData.benchRole = 'boat';
  const hull = new THREE.Mesh(shared.hullGeometry, shared.boatMaterials[index % shared.boatMaterials.length]);
  hull.scale.set(1.3 + index * 0.18, 0.65, 0.85);
  hull.rotation.z = Math.PI / 2;
  root.add(hull);
  const cabin = new THREE.Mesh(shared.boatCabinGeometry, shared.cabinMaterial);
  cabin.position.set(-0.4, 1.2, 0);
  cabin.scale.set(1.25, 0.75, 0.8);
  root.add(cabin);
  return root;
}

function buildSharedAssets() {
  return {
    birdBodyGeometry: new THREE.ConeGeometry(0.32, 1.15, 7),
    wingGeometry: new THREE.BoxGeometry(0.13, 0.08, 1.05),
    birdMaterial: new THREE.MeshStandardMaterial({ color: 0x18202a, roughness: 0.85 }),
    heliBodyGeometry: new THREE.SphereGeometry(1.25, 12, 8),
    heliCabinGeometry: new THREE.SphereGeometry(0.9, 12, 8),
    tailGeometry: new THREE.CylinderGeometry(0.18, 0.55, 4.9, 7),
    rotorGeometry: new THREE.BoxGeometry(8.5, 0.07, 0.18),
    tailRotorGeometry: new THREE.BoxGeometry(2.1, 0.06, 0.14),
    heliMaterial: new THREE.MeshStandardMaterial({ color: 0xe7b32c, roughness: 0.38, metalness: 0.28 }),
    glassMaterial: new THREE.MeshStandardMaterial({ color: 0x79b8d7, roughness: 0.12, metalness: 0.15 }),
    darkMaterial: new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.7 }),
    hullGeometry: new THREE.ConeGeometry(2.1, 6.8, 5),
    boatCabinGeometry: new THREE.BoxGeometry(2.2, 1.6, 2.1),
    boatMaterials: [
      new THREE.MeshStandardMaterial({ color: 0xe7e2d2, roughness: 0.62 }),
      new THREE.MeshStandardMaterial({ color: 0x9e2e32, roughness: 0.58 }),
      new THREE.MeshStandardMaterial({ color: 0x244f78, roughness: 0.55 }),
    ],
    cabinMaterial: new THREE.MeshStandardMaterial({ color: 0xf2c84b, roughness: 0.55 }),
  };
}

/** 鸟群、直升机、船、广告牌和井盖蒸汽的确定性环境动画。 */
export function createAmbientAgents(scene, { seed = 1337, birdCount = 24, boatCount = 3 } = {}) {
  const group = new THREE.Group();
  group.name = 'AmbientAgents';
  group.userData.benchRole = 'ambient-agents';
  scene?.add?.(group);

  const shared = buildSharedAssets();
  const birds = Array.from({ length: Math.max(18, birdCount) }, (_, index) => createBird(shared, index));
  const helicopter = createHelicopter(shared);
  const boats = Array.from({ length: Math.max(3, boatCount) }, (_, index) => createBoat(shared, index));
  const birdGroup = new THREE.Group();
  birdGroup.name = 'BirdFlock';
  birdGroup.userData.benchRole = 'bird-flock';
  birdGroup.add(...birds);
  group.add(birdGroup, helicopter, ...boats);

  const billboardGeometry = new THREE.PlaneGeometry(28, 11);
  const billboards = [];
  for (let index = 0; index < 3; index += 1) {
    const material = new THREE.MeshBasicMaterial({ color: 0x42c5f5, toneMapped: false, side: THREE.DoubleSide });
    const billboard = new THREE.Mesh(billboardGeometry, material);
    billboard.name = `ProceduralBillboard-${index}`;
    billboard.userData.benchRole = 'animated-billboard';
    billboard.position.set(-90 + index * 32, 24 + index * 8, -85);
    group.add(billboard);
    billboards.push(billboard);
  }

  const steamCount = 96;
  const steamPositions = new Float32Array(steamCount * 3);
  const steamGeometry = new THREE.BufferGeometry();
  steamGeometry.setAttribute('position', new THREE.BufferAttribute(steamPositions, 3));
  const steamMaterial = new THREE.PointsMaterial({
    color: 0xcbd4dc,
    size: 2.4,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const steam = new THREE.Points(steamGeometry, steamMaterial);
  steam.name = 'ManholeSteam';
  steam.userData.benchRole = 'steam';
  group.add(steam);

  let currentSeed = seed;
  let elapsed = 0;
  let accumulator = 0;
  let birdParameters = [];
  let boatParameters = [];
  let steamParameters = [];
  let lastWingAngle = 0;

  function reset(nextSeed = currentSeed) {
    currentSeed = nextSeed;
    const random = mulberry32(nextSeed);
    elapsed = 0;
    accumulator = 0;
    birdParameters = birds.map((_, index) => ({
      phase: random() * Math.PI * 2,
      radiusX: 210 + random() * 190,
      radiusZ: 150 + random() * 120,
      altitude: 82 + random() * 52,
      speed: 0.045 + random() * 0.026,
      flock: index % 2,
      offsetX: (random() - 0.5) * 42,
      offsetZ: (random() - 0.5) * 34,
      flap: 7.5 + random() * 3,
    }));
    boatParameters = boats.map((_, index) => ({
      phase: random() * 900,
      speed: 8.2 + index * 2.1 + random() * 1.5,
      x: 610 + index * 25,
      bobPhase: random() * Math.PI * 2,
    }));
    steamParameters = Array.from({ length: steamCount }, () => ({
      phase: random(),
      radius: random() * 4.2,
      theta: random() * Math.PI * 2,
      speed: 2.8 + random() * 4.5,
    }));
    advance(0);
  }

  function advance(dt) {
    elapsed += Math.max(0, Number(dt) || 0);
    for (let index = 0; index < birds.length; index += 1) {
      const bird = birds[index];
      const params = birdParameters[index];
      const angle = elapsed * params.speed + params.phase;
      const centerOffset = params.flock ? 240 : -150;
      bird.position.set(
        centerOffset + Math.cos(angle) * params.radiusX + params.offsetX,
        params.altitude + Math.sin(angle * 2.4) * 7,
        Math.sin(angle) * params.radiusZ + params.offsetZ,
      );
      bird.rotation.y = angle + Math.PI / 2;
      const flap = Math.sin(elapsed * params.flap + params.phase) * 0.72;
      bird.userData.leftWing.rotation.x = 0.18 + flap;
      bird.userData.rightWing.rotation.x = -0.18 - flap;
      if (index === 0) lastWingAngle = flap;
    }

    const heliAngle = elapsed * 0.055;
    helicopter.position.set(Math.cos(heliAngle) * 390, 122 + Math.sin(heliAngle * 2) * 12, Math.sin(heliAngle) * 285);
    helicopter.rotation.y = -heliAngle;
    helicopter.userData.mainRotor.rotation.y = positiveModulo(elapsed * 38, Math.PI * 2);
    helicopter.userData.tailRotor.rotation.y = positiveModulo(elapsed * 51, Math.PI * 2);

    for (let index = 0; index < boats.length; index += 1) {
      const params = boatParameters[index];
      const span = 1760;
      const z = positiveModulo(params.phase + elapsed * params.speed, span) - span / 2;
      const boat = boats[index];
      boat.position.set(params.x, 1.1 + Math.sin(elapsed * 1.2 + params.bobPhase) * 0.35, z);
      boat.rotation.set(0, index % 2 ? Math.PI : 0, Math.sin(elapsed * 0.9 + params.bobPhase) * 0.035);
    }

    billboards.forEach((billboard, index) => {
      const hue = positiveModulo(elapsed * 0.07 + index / billboards.length, 1);
      billboard.material.color.setHSL(hue, 0.84, 0.58);
      billboard.scale.x = 0.92 + Math.sin(elapsed * 1.8 + index) * 0.08;
    });

    for (let index = 0; index < steamCount; index += 1) {
      const params = steamParameters[index];
      const life = positiveModulo(params.phase + elapsed * 0.12 * params.speed, 1);
      const radius = params.radius * (0.4 + life);
      steamPositions[index * 3] = 34 + Math.cos(params.theta + elapsed * 0.15) * radius;
      steamPositions[index * 3 + 1] = 0.7 + life * 18;
      steamPositions[index * 3 + 2] = -26 + Math.sin(params.theta + elapsed * 0.12) * radius;
    }
    steamGeometry.attributes.position.needsUpdate = true;
  }

  function update(dt) {
    accumulator += THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.25);
    while (accumulator + 1e-8 >= AGENT_FIXED_STEP) {
      advance(AGENT_FIXED_STEP);
      accumulator -= AGENT_FIXED_STEP;
    }
  }

  function step(dt = AGENT_FIXED_STEP, iterations = 1) {
    for (let index = 0; index < Math.max(0, Math.floor(iterations)); index += 1) advance(dt);
  }

  function getMetrics() {
    return {
      seed: currentSeed,
      elapsed,
      birdCount: birds.length,
      helicopterCount: 1,
      boatCount: boats.length,
      billboardCount: billboards.length,
      steamParticleCount: steamCount,
      wingAngle: lastWingAngle,
      mainRotorAngle: helicopter.userData.mainRotor.rotation.y,
      fixedStep: AGENT_FIXED_STEP,
    };
  }

  function dispose() {
    scene?.remove?.(group);
    disposeTree(group);
    group.clear();
  }

  reset(seed);
  return { group, update, step, reset, getMetrics, dispose };
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}
