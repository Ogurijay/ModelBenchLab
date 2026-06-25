import * as THREE from 'three';

function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.55,
    metalness: options.metalness ?? 0.05,
    emissive: options.emissive ?? '#000000',
    emissiveIntensity: options.emissiveIntensity ?? 0
  });
}

export function createKartModel() {
  const group = new THREE.Group();
  const bodyMat = mat('#ff4d5d', { roughness: 0.42 });
  const accentMat = mat('#ffe66d', { roughness: 0.38 });
  const tireMat = mat('#16191d', { roughness: 0.82 });
  const hubMat = mat('#d8edf7', { roughness: 0.36, metalness: 0.2 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.7, 3.4), bodyMat);
  body.position.y = 0.75;
  body.castShadow = true;
  body.receiveShadow = true;

  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.45, 1.35), accentMat);
  nose.position.set(0, 0.8, -1.65);
  nose.castShadow = true;

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.85, 1.05), mat('#2a3039'));
  seat.position.set(0, 1.2, 0.45);
  seat.castShadow = true;

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.48, 18, 12), mat('#63dcff', {
    emissive: '#0a7fb1',
    emissiveIntensity: 0.2
  }));
  helmet.position.set(0, 1.92, 0.25);
  helmet.castShadow = true;

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 0.5), mat('#1d2530'));
  spoiler.position.set(0, 1.45, 1.9);
  spoiler.castShadow = true;

  group.add(body, nose, seat, helmet, spoiler);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.5, 18);
  const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.54, 12);
  const wheelPositions = [
    [-1.55, 0.45, -1.05],
    [1.55, 0.45, -1.05],
    [-1.55, 0.45, 1.15],
    [1.55, 0.45, 1.15]
  ];

  const wheels = [];
  wheelPositions.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    group.add(wheel);
    wheels.push(wheel);
  });

  const flameMat = mat('#ff9b1f', {
    emissive: '#ff5a00',
    emissiveIntensity: 1.8,
    roughness: 0.25
  });
  const flameLeft = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 12), flameMat);
  const flameRight = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 12), flameMat);
  flameLeft.position.set(-0.55, 0.74, 2.18);
  flameRight.position.set(0.55, 0.74, 2.18);
  flameLeft.rotation.x = Math.PI / 2;
  flameRight.rotation.x = Math.PI / 2;
  flameLeft.visible = false;
  flameRight.visible = false;
  group.add(flameLeft, flameRight);

  const sparkMat = mat('#66f7ff', {
    emissive: '#1fcfff',
    emissiveIntensity: 1.5,
    roughness: 0.2
  });
  const sparkLeft = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), sparkMat);
  const sparkRight = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), sparkMat);
  sparkLeft.position.set(-1.45, 0.24, 1.25);
  sparkRight.position.set(1.45, 0.24, 1.25);
  sparkLeft.visible = false;
  sparkRight.visible = false;
  group.add(sparkLeft, sparkRight);

  group.userData.wheels = wheels;
  group.userData.flames = [flameLeft, flameRight];
  group.userData.sparks = [sparkLeft, sparkRight];
  return group;
}

export function updateKartModel(model, kartState, deltaSeconds) {
  model.position.set(kartState.x, kartState.y, kartState.z);
  model.rotation.y = -kartState.heading;
  model.rotation.z = -kartState.sideSlip * 0.12;

  const spin = kartState.speed * deltaSeconds * 2.4;
  model.userData.wheels.forEach((wheel, index) => {
    wheel.rotation.x += spin;
    if (index < 2) {
      wheel.rotation.y = kartState.sideSlip * 0.38;
    }
  });

  const boosted = kartState.boostTime > 0 || kartState.event === 'mini-turbo';
  model.userData.flames.forEach((flame, index) => {
    flame.visible = boosted;
    const pulse = 0.9 + Math.sin(performance.now() * 0.028 + index) * 0.18;
    flame.scale.setScalar(pulse);
  });

  const sparking = kartState.driftCharge > 0.42 && Math.abs(kartState.sideSlip) > 0.2;
  model.userData.sparks.forEach((spark, index) => {
    spark.visible = sparking;
    const pulse = 0.8 + Math.sin(performance.now() * 0.04 + index) * 0.25;
    spark.scale.setScalar(pulse);
  });
}
