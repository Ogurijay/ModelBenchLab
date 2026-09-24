import * as THREE from "three";
import { addBeam, createBuffer, meshFrom } from "./meshlib.js";

function mass(w, h, d, mats) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.lib.context);
  mesh.userData.matKey = "context";
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), mats.lib.contextEdge);
  mesh.add(edges);
  return mesh;
}

export function buildSite(program, mats) {
  const group = new THREE.Group();
  group.name = "site";

  const ground = new THREE.Mesh(new THREE.CircleGeometry(520, 64), mats.lib.soil);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  ground.userData.matKey = "soil";
  group.add(ground);

  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(168, 150), mats.lib.pave);
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.02, 168);
  plaza.receiveShadow = true;
  plaza.userData.matKey = "pave";
  group.add(plaza);

  const rill = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 96), mats.lib.water);
  rill.position.set(0, 0.08, 168);
  rill.userData.matKey = "water";
  group.add(rill);

  const trees = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 3.2, 6);
  const crownGeo = new THREE.IcosahedronGeometry(1.7, 1);
  const trunks = new THREE.InstancedMesh(trunkGeo, mats.lib.trunk, 80);
  const crowns = new THREE.InstancedMesh(crownGeo, mats.lib.leaf, 80);
  trunks.userData.matKey = "trunk";
  crowns.userData.matKey = "leaf";
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let i = 0; i < 8; i++) {
    for (const side of [-1, 1]) {
      dummy.position.set(side * (18 + (i % 3) * 1.2), 1.6, 112 + i * 12);
      dummy.rotation.set(0, i, 0);
      dummy.scale.setScalar(0.85 + (i % 3) * 0.12);
      dummy.updateMatrix();
      trunks.setMatrixAt(n, dummy.matrix);
      dummy.position.y = 4.1;
      dummy.scale.setScalar(1.1 + (i % 4) * 0.15);
      dummy.updateMatrix();
      crowns.setMatrixAt(n, dummy.matrix);
      n++;
    }
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 210 + (i % 5) * 8;
    dummy.position.set(Math.cos(a) * r, 1.7, Math.sin(a) * r);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    trunks.setMatrixAt(n, dummy.matrix);
    dummy.position.y = 4.3;
    dummy.scale.setScalar(1.3);
    dummy.updateMatrix();
    crowns.setMatrixAt(n, dummy.matrix);
    n++;
  }
  trunks.count = n;
  crowns.count = n;
  trees.add(trunks, crowns);
  group.add(trees);

  // 训练场在北
  const train = new THREE.Mesh(new THREE.PlaneGeometry(68, 105), mats.lib.soil);
  train.rotation.x = -Math.PI / 2;
  train.position.set(0, 0.03, -250);
  train.userData.matKey = "soil";
  train.receiveShadow = true;
  group.add(train);
  const lines = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.28, 4),
    mats.lib.line,
  );
  void lines;
  const frame = createBuffer();
  addBeam(frame, -34, 0.08, -302.5, 34, 0.08, -302.5, 0.12, 0.04, [0.9, 0.9, 0.85]);
  addBeam(frame, -34, 0.08, -197.5, 34, 0.08, -197.5, 0.12, 0.04, [0.9, 0.9, 0.85]);
  addBeam(frame, -34, 0.08, -302.5, -34, 0.08, -197.5, 0.12, 0.04, [0.9, 0.9, 0.85]);
  addBeam(frame, 34, 0.08, -302.5, 34, 0.08, -197.5, 0.12, 0.04, [0.9, 0.9, 0.85]);
  group.add(meshFrom(frame, mats.lib.line, "line"));

  const stand = mass(78, 8, 14, mats);
  stand.position.set(0, 4, -188);
  group.add(stand);

  const foodW = mass(36, 14, 18, mats);
  foodW.position.set(-78, 7, 150);
  const foodE = mass(36, 11, 22, mats);
  foodE.position.set(82, 5.5, 176);
  group.add(foodW, foodE);

  const transit = mass(28, 16, 86, mats);
  transit.position.set(-230, 8, 20);
  group.add(transit);
  const canopy = createBuffer();
  addBeam(canopy, -214, 6.2, -20, -120, 6.2, 8, 7.5, 0.35, [0.9, 0.9, 0.88]);
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const x = -214 + t * 94;
    const z = -20 + t * 28;
    addBeam(canopy, x, 0, z, x, 6.2, z, 0.35, 0.35, [0.8, 0.8, 0.78]);
  }
  const canopyMesh = meshFrom(canopy, mats.lib.context, "context");
  canopyMesh.castShadow = true;
  group.add(canopyMesh);

  const garage = new THREE.Group();
  for (let level = 0; level < 4; level++) {
    const slab = mass(62, 0.6, 48, mats);
    slab.position.set(230, 1.2 + level * 3.3, 30);
    garage.add(slab);
  }
  const core = mass(10, 14, 48, mats);
  core.position.set(256, 7, 30);
  garage.add(core);
  group.add(garage);

  const broadcast = mass(24, 9, 18, mats);
  broadcast.position.set(200, 4.5, -80);
  group.add(broadcast);

  // 地面停车位
  const stalls = createBuffer();
  for (let i = 0; i < 14; i++) {
    addBeam(stalls, 150, 0.05, -40 + i * 2.6, 196, 0.05, -40 + i * 2.6, 0.08, 0.02, [0.85, 0.85, 0.82]);
  }
  group.add(meshFrom(stalls, mats.lib.line, "line"));

  const benches = createBuffer();
  for (const z of [130, 200]) {
    addBeam(benches, -28, 0.45, z, -8, 0.45, z, 0.55, 0.08, [0.55, 0.4, 0.28]);
    addBeam(benches, 8, 0.45, z, 28, 0.45, z, 0.55, 0.08, [0.55, 0.4, 0.28]);
  }
  group.add(meshFrom(benches, mats.lib.wood, "wood"));

  group.userData.blocks = [
    { x: -78, z: 150, hx: 20, hz: 11 },
    { x: 82, z: 176, hx: 20, hz: 13 },
    { x: -230, z: 20, hx: 16, hz: 45 },
    { x: 230, z: 30, hx: 34, hz: 26 },
    { x: 200, z: -80, hx: 14, hz: 11 },
    { x: 0, z: -188, hx: 40, hz: 8 },
  ];
  return group;
}
