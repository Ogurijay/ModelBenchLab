import * as THREE from 'three';
import { emblemTexture } from './TextureFactory.js';

export function buildTankModel({ color = 0xffd84a, scale = 1 } = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.35 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x24262e, roughness: 0.8, metalness: 0.2 });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x3a3d46, roughness: 0.4, metalness: 0.6 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.55), bodyMat);
  hull.position.y = 0.32;
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const trackGeo = new THREE.BoxGeometry(0.26, 0.34, 1.72);
  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(trackGeo, darkMat);
    track.position.set(side * 0.78, 0.2, 0);
    track.castShadow = true;
    track.receiveShadow = true;
    group.add(track);
  }

  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.38, 8), bodyMat);
  turret.position.y = 0.76;
  turret.castShadow = true;
  group.add(turret);

  const barrelLen = 0.85;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, barrelLen, 6), barrelMat);
  barrel.rotation.x = -Math.PI / 2;
  barrel.position.set(0, 0.76, -(barrelLen / 2 + 0.32));
  barrel.castShadow = true;
  group.add(barrel);

  group.scale.setScalar(scale);
  group.userData.bodyMat = bodyMat;
  group.userData.baseColor = color;
  return group;
}

const BULLET_Y_ROT = { up: 0, down: 0, left: Math.PI / 2, right: Math.PI / 2 };

export function buildBulletMesh(color = 0xfff2b0, direction = 'up') {
  const geo = new THREE.CylinderGeometry(0.1, 0.1, 0.42, 6);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.y = BULLET_Y_ROT[direction] || 0;
  return mesh;
}

function starShape(outer = 0.34, inner = 0.15, points = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function pedestal(color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.08, 16),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, transparent: true, opacity: 0.55 })
  );
  mesh.position.y = 0.05;
  return mesh;
}

const POWERUP_COLORS = {
  grenade: 0xff5c5c,
  helmet: 0xd8c98a,
  shovel: 0xb08a4a,
  clock: 0x6fd2ff,
  tank: 0x6fe08a,
  star: 0xffd84a,
  gun: 0xff9a4a,
};

export function powerUpColor(type) {
  return POWERUP_COLORS[type] || 0xffffff;
}

export function buildPowerUpModel(type) {
  const group = new THREE.Group();
  const color = powerUpColor(type);
  group.add(pedestal(color));

  const iconMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.4, emissive: color, emissiveIntensity: 0.25 });
  let icon;

  switch (type) {
    case 'grenade': {
      icon = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), iconMat);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 6), iconMat);
      pin.position.y = 0.28;
      icon.add(body, pin);
      break;
    }
    case 'helmet': {
      icon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.7), iconMat);
      break;
    }
    case 'shovel': {
      icon = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.4), iconMat);
      blade.position.set(0, 0, 0.1);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 6), iconMat);
      handle.rotation.x = Math.PI / 2.4;
      handle.position.set(0, 0.1, -0.2);
      icon.add(blade, handle);
      break;
    }
    case 'clock': {
      icon = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 16), iconMat);
      face.rotation.x = Math.PI / 2;
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), iconMat);
      hand.position.set(0, 0.08, 0.04);
      icon.add(face, hand);
      break;
    }
    case 'tank': {
      icon = buildTankModel({ color: 0x6fe08a, scale: 0.42 });
      icon.position.y = -0.05;
      break;
    }
    case 'star': {
      const geo = new THREE.ExtrudeGeometry(starShape(0.3, 0.13, 5), { depth: 0.12, bevelEnabled: false });
      icon = new THREE.Mesh(geo, iconMat);
      icon.rotation.x = Math.PI / 2;
      icon.position.y = 0.05;
      break;
    }
    case 'gun': {
      icon = new THREE.Group();
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 6), iconMat);
      barrel.rotation.x = Math.PI / 2;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.12), iconMat);
      grip.position.set(0, -0.12, 0.12);
      icon.add(barrel, grip);
      break;
    }
    default:
      icon = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), iconMat);
  }

  icon.position.y += 0.42;
  icon.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  group.add(icon);
  group.userData.icon = icon;
  return group;
}

export function buildBaseModel() {
  const group = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x555a6b, roughness: 0.8, metalness: 0.15 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd84a, roughness: 0.4, metalness: 0.5, emissive: 0x5a4200, emissiveIntensity: 0.4 });

  const tiers = [
    { s: 1.9, h: 0.22, y: 0.11 },
    { s: 1.55, h: 0.24, y: 0.34 },
    { s: 1.15, h: 0.26, y: 0.6 },
  ];
  for (const t of tiers) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(t.s, t.h, t.s), stoneMat);
    m.position.y = t.y;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  const emblem = new THREE.Mesh(
    new THREE.PlaneGeometry(0.75, 0.75),
    new THREE.MeshStandardMaterial({ map: emblemTexture(), transparent: true, emissive: 0xffd84a, emissiveIntensity: 0.35 })
  );
  emblem.rotation.x = -Math.PI / 2;
  emblem.position.y = 0.735;
  group.add(emblem);

  group.userData.stoneMat = stoneMat;
  group.userData.goldMat = goldMat;
  group.userData.emblem = emblem;
  return group;
}

export function setBaseDestroyed(baseGroup, destroyed) {
  const mat = baseGroup.userData.stoneMat;
  if (destroyed) {
    mat.color.setHex(0x2a2620);
    baseGroup.userData.emblem.visible = false;
    baseGroup.scale.y = 0.35;
    baseGroup.position.y = -0.05;
  } else {
    mat.color.setHex(0x555a6b);
    baseGroup.userData.emblem.visible = true;
    baseGroup.scale.y = 1;
    baseGroup.position.y = 0;
  }
}
