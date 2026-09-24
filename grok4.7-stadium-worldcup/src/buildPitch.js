import * as THREE from "three";

function pitchMap() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 1584;
  const g = c.getContext("2d");
  const stripes = ["#2c6a3a", "#327645"];
  for (let i = 0; i < 16; i++) {
    g.fillStyle = stripes[i % 2];
    g.fillRect(0, (i * c.height) / 16, c.width, c.height / 16 + 1);
  }
  const X = (x) => ((x + 34) / 68) * c.width;
  const Y = (z) => ((52.5 - z) / 105) * c.height;
  g.strokeStyle = "#f4f1ea";
  g.lineWidth = 7;
  g.lineJoin = "miter";
  const rect = (x0, z0, x1, z1) => {
    g.strokeRect(X(x0), Y(z1), X(x1) - X(x0), Y(z0) - Y(z1));
  };
  rect(-34, -52.5, 34, 52.5);
  g.beginPath();
  g.moveTo(X(-34), Y(0));
  g.lineTo(X(34), Y(0));
  g.stroke();
  g.beginPath();
  g.arc(X(0), Y(0), (9.15 / 68) * c.width, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.arc(X(0), Y(0), 5, 0, Math.PI * 2);
  g.fillStyle = "#f4f1ea";
  g.fill();
  rect(-20.16, -52.5, 20.16, -36);
  rect(-20.16, 36, 20.16, 52.5);
  rect(-9.16, -52.5, 9.16, -47);
  rect(-9.16, 47, 9.16, 52.5);
  for (const z of [-41.5, 41.5]) {
    g.beginPath();
    g.arc(X(0), Y(z), 4, 0, Math.PI * 2);
    g.fill();
  }
  const arc = (z, a0, a1) => {
    g.beginPath();
    g.arc(X(0), Y(z), (9.15 / 68) * c.width, a0, a1);
    g.stroke();
  };
  arc(-41.5, Math.PI * 0.18, Math.PI * 0.82);
  arc(41.5, -Math.PI * 0.82, -Math.PI * 0.18);
  for (const [x, z] of [
    [-34, -52.5],
    [34, -52.5],
    [-34, 52.5],
    [34, 52.5],
  ]) {
    g.beginPath();
    g.arc(X(x), Y(z), (1 / 68) * c.width, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function goal(zSign, mats) {
  const g = new THREE.Group();
  const post = new THREE.CylinderGeometry(0.06, 0.06, 2.44, 8);
  const bar = new THREE.CylinderGeometry(0.06, 0.06, 7.44, 8);
  const metal = mats.lib.rail;
  const a = new THREE.Mesh(post, metal);
  a.position.set(-3.66, 1.22, zSign * 52.5);
  const b = a.clone();
  b.position.x = 3.66;
  const c = new THREE.Mesh(bar, metal);
  c.rotation.z = Math.PI / 2;
  c.position.set(0, 2.44, zSign * 52.5);
  const depth = zSign * 2.05;
  const backL = a.clone();
  backL.position.set(-3.66, 1.22, zSign * 52.5 + depth);
  const backR = b.clone();
  backR.position.set(3.66, 1.22, zSign * 52.5 + depth);
  const backBar = c.clone();
  backBar.position.z = zSign * 52.5 + depth;
  const side = new THREE.Mesh(bar, metal);
  side.rotation.x = Math.PI / 2;
  side.scale.set(0.35, 1, 1);
  side.position.set(-3.66, 2.44, zSign * 52.5 + depth / 2);
  const side2 = side.clone();
  side2.position.x = 3.66;
  const netMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    roughness: 0.9,
    clippingPlanes: metal.clippingPlanes,
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(7.32, 2.44), netMat);
  net.position.set(0, 1.22, zSign * 52.5 + depth);
  net.userData.matKey = "glass";
  g.add(a, b, c, backL, backR, backBar, side, side2, net);
  g.traverse((o) => {
    if (o.isMesh && !o.userData.matKey) o.userData.matKey = "rail";
  });
  return g;
}

export function buildPitch(program, mats) {
  const group = new THREE.Group();
  group.name = "pitch";
  const grass = mats.lib.grass;
  grass.map = pitchMap();
  grass.color.set(0xffffff);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(68, 105), grass);
  field.rotation.x = -Math.PI / 2;
  field.position.y = 0.03;
  field.receiveShadow = true;
  field.userData.matKey = "grass";
  group.add(field);

  const runoff = new THREE.Mesh(new THREE.RingGeometry(0.1, 1, 4), mats.lib.soil);
  // 用一块圆角范围的草地代替：四边铺到看台挡墙
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(program.bowl0.hx * 2 - 1.2, program.bowl0.hz * 2 - 1.2), mats.lib.soil);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.01;
  apron.receiveShadow = true;
  apron.userData.matKey = "soil";
  group.add(apron);
  field.position.y = 0.045;

  group.add(goal(1, mats), goal(-1, mats));

  // 广告板，西侧通道口断开
  const boards = new THREE.Group();
  const boardMat = mats.lib.steelDark;
  const addBoard = (x0, z0, x1, z1) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.16), boardMat);
    mesh.position.set((x0 + x1) / 2, 0.7, (z0 + z1) / 2);
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.userData.matKey = "steelDark";
    mesh.castShadow = true;
    boards.add(mesh);
  };
  const m = 4.2;
  addBoard(-34 - m, -52.5, -34 - m, -6);
  addBoard(-34 - m, 6, -34 - m, 52.5);
  addBoard(34 + m, -52.5, 34 + m, 52.5);
  addBoard(-34, 52.5 + m, 34, 52.5 + m);
  addBoard(-34, -52.5 - m, 34, -52.5 - m);
  group.add(boards);
  group.remove(runoff);
  return group;
}
