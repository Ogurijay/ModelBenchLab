import * as THREE from 'three';

export const ISLAND = { x: -46, z: -34, radius: 8.6 };

const wood = () => new THREE.MeshStandardMaterial({ color: '#8a6842', roughness: 0.78, metalness: 0.02 });
const paint = (color, roughness = 0.62) => new THREE.MeshStandardMaterial({
  color,
  roughness,
  metalness: 0.04
});

function paintAt(y, below, boot, above, color) {
  if (y < 0.0) color.copy(below);
  else if (y < 0.14) color.copy(boot);
  else color.copy(above);
  return [color.r, color.g, color.b];
}

function hullGeometry() {
  const length = 10.2;
  const slices = 24;
  const around = 20;
  const positions = [];
  const colors = [];
  const indices = [];
  const below = new THREE.Color('#102e2b');
  const boot = new THREE.Color('#8a342e');
  const above = new THREE.Color('#f3ecdf');
  const color = new THREE.Color();

  const section = (t) => {
    const bow = Math.max(0, (t - 0.8) / 0.2);
    const stern = Math.max(0, (0.06 - t) / 0.06);
    const body = Math.sin(Math.min(1, t / 0.9) * Math.PI) ** 0.72;
    const beam = 1.38 * body * (1 - bow * 0.94) * (1 - stern * 0.35);
    const keel = -0.7 * (0.5 + 0.5 * Math.sin(Math.min(t, 1) * Math.PI) ** 0.85);
    const sheer = 0.78 + 0.22 * Math.sin(t * Math.PI) + bow * 0.85;
    return { x: (t - 0.4) * length, beam: Math.max(beam, 0.05), keel, sheer };
  };

  for (let i = 0; i <= slices; i++) {
    const s = section(i / slices);
    for (let j = 0; j < around; j++) {
      const a = (j / around) * Math.PI * 2;
      const cy = Math.cos(a);
      const y = (s.sheer + s.keel) * 0.5 + cy * (s.sheer - s.keel) * 0.5;
      const flare = 0.8 + 0.2 * Math.max(cy, 0);
      const z = Math.sin(a) * s.beam * flare;
      positions.push(s.x, y, z);
      colors.push(...paintAt(y, below, boot, above, color));
    }
  }

  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < around; j++) {
      const a = i * around + j;
      const b = i * around + (j + 1) % around;
      const c = a + around;
      const d = b + around;
      indices.push(a, b, c, b, d, c);
    }
  }

  const cap = (ring, sign) => {
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (let j = 0; j < around; j++) {
      const vi = (ring * around + j) * 3;
      ax += positions[vi];
      ay += positions[vi + 1];
      az += positions[vi + 2];
    }
    const center = positions.length / 3;
    positions.push(ax / around, ay / around, az / around);
    colors.push(...paintAt(ay / around, below, boot, above, color));
    for (let j = 0; j < around; j++) {
      const a = ring * around + j;
      const b = ring * around + (j + 1) % around;
      if (sign < 0) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  };
  cap(0, -1);
  cap(slices, 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  let agree = 0;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (Math.abs(z) < 0.35) continue;
    agree += Math.sign(nor.getZ(i)) === Math.sign(z) ? 1 : -1;
  }
  if (agree < 0) {
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) {
      const swap = index[i];
      index[i] = index[i + 1];
      index[i + 1] = swap;
    }
    geometry.index.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  return geometry;
}

function namePlate() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = '#8d3b32';
  ctx.font = '600 40px "Songti SC", "STSong", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('潮镜', 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.15, 0.28),
    new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.7 })
  );
  plate.position.set(-4.55, 0.72, 0);
  plate.rotation.y = -Math.PI / 2;
  return plate;
}

export function createBoat() {
  const group = new THREE.Group();
  group.name = 'boat';

  const hull = new THREE.Mesh(hullGeometry(), new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.06
  }));
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  const deckMat = wood();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.08, 2.15), deckMat);
  deck.position.set(-0.15, 0.7, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const cabinMat = paint('#f3f0e8', 0.55);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.15, 1.65), cabinMat);
  cabin.position.set(-1.15, 1.28, 0);
  cabin.castShadow = true;
  group.add(cabin);

  const glass = new THREE.MeshStandardMaterial({
    color: '#163040',
    roughness: 0.12,
    metalness: 0.55,
    emissive: '#0b1c28',
    emissiveIntensity: 0.25
  });
  const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.42, 1.72), glass);
  windowMesh.position.set(-1.15, 1.52, 0);
  group.add(windowMesh);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 6.4, 8), wood());
  mast.position.set(1.15, 3.55, 0);
  mast.castShadow = true;
  group.add(mast);

  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.lineTo(0.15, 5.1);
  sailShape.lineTo(3.35, 0.35);
  sailShape.closePath();
  const sail = new THREE.Mesh(
    new THREE.ShapeGeometry(sailShape),
    new THREE.MeshStandardMaterial({
      color: '#f4efe4',
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: '#8a7560',
      emissiveIntensity: 0.18
    })
  );
  sail.position.set(1.25, 1.2, 0.02);
  sail.rotation.y = -0.55;
  sail.castShadow = true;
  group.add(sail);

  group.add(namePlate());
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return group;
}

export const BOAT_SAMPLES = [
  { x: 4.1, y: -0.2, z: 0 },
  { x: -3.9, y: -0.18, z: 0 },
  { x: 0.6, y: -0.32, z: 1.05 },
  { x: 0.6, y: -0.32, z: -1.05 },
  { x: 2.2, y: -0.28, z: 0.45 },
  { x: -1.6, y: -0.28, z: -0.4 }
];

export function createBuoy(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 1.35, 16), paint(color, 0.45));
  body.position.y = 0.25;
  group.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 12), paint(color, 0.4));
  cap.position.y = 0.95;
  cap.scale.y = 0.8;
  group.add(cap);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.12, 16), paint('#f4f1ea', 0.5));
  collar.position.y = 0.45;
  group.add(collar);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    new THREE.MeshStandardMaterial({ color: '#fff1d2', emissive: '#ffb15a', emissiveIntensity: 0.4, roughness: 0.3 })
  );
  lamp.position.y = 1.45;
  lamp.name = 'lamp';
  group.add(lamp);
  group.userData.lamp = lamp.material;
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

export function createCrate() {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.72, 0.78), wood());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.08, 0.82), paint('#d7c4a2', 0.6));
  band.position.y = 0.12;
  mesh.add(band);
  return mesh;
}

export function createBarrel() {
  const group = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.92, 16), paint('#6d3d24', 0.58));
  drum.rotation.z = Math.PI / 2;
  group.add(drum);
  for (const x of [-0.28, 0.28]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.025, 8, 18), paint('#c0c4c8', 0.35));
    ring.rotation.y = Math.PI / 2;
    ring.position.x = x;
    group.add(ring);
  }
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function rock(radius, x, y, z, scale, material) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1), material);
  mesh.position.set(x, y, z);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.rotation.set(radius * 0.15, x * 0.4, z * 0.2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createIsland() {
  const group = new THREE.Group();
  group.position.set(ISLAND.x, 0, ISLAND.z);
  const dry = paint('#5c5852', 0.94);
  const wet = paint('#2a2927', 0.96);
  const rocks = [
    [5.1, 0.2, 0.35, 0.1, [1.4, 0.58, 1.22], wet],
    [3.5, -1.8, 1.7, 1.5, [1.05, 0.78, 0.95], dry],
    [3.2, 2.2, 1.25, -1.6, [1.0, 0.72, 1.05], dry],
    [2.7, 1.4, 0.15, 2.5, [1.12, 0.5, 1.0], wet],
    [2.5, -1.5, 0.05, -2.4, [1.15, 0.46, 1.05], wet],
    [2.0, 0.3, 2.55, -0.2, [0.9, 0.85, 0.82], dry]
  ];
  for (const spec of rocks) group.add(rock(...spec));

  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.15, 9.2, 16), paint('#f3f1ea', 0.48));
  tower.position.set(0.2, 7.4, -0.3);
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);

  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 1.15, 16), paint('#9c322c', 0.5));
  band.position.set(0.2, 8.7, -0.3);
  group.add(band);

  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.12, 18), paint('#d9d3c8', 0.55));
  gallery.position.set(0.2, 11.7, -0.3);
  group.add(gallery);

  const room = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 1.35, 12), paint('#24343c', 0.35));
  room.position.set(0.2, 12.45, -0.3);
  group.add(room);

  const lampMat = new THREE.MeshStandardMaterial({
    color: '#ffe1b0',
    emissive: '#ffb15a',
    emissiveIntensity: 0.2,
    roughness: 0.25
  });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), lampMat);
  lamp.position.set(0.2, 12.5, -0.3);
  lamp.name = 'beacon';
  group.add(lamp);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.15, 12), paint('#6e2d29', 0.55));
  roof.position.set(0.2, 13.55, -0.3);
  roof.castShadow = true;
  group.add(roof);

  const light = new THREE.PointLight('#ffc48a', 0, 36, 2);
  light.position.set(0.2, 12.5, -0.3);
  group.add(light);
  group.userData.lampMat = lampMat;
  group.userData.lamp = light;
  return group;
}
