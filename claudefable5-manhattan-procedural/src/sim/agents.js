// 非车辆动画体:两群拍翅鸟(利萨茹领航 + 编队相位)、
// 中城巡航直升机(旋翼/尾桨/压弯/夜间扫掠探照灯)、河面船只(环线航路 + 浪涌起伏)。
import * as THREE from 'three';
import { Rng } from '../core/prng.js';

const BIRDS_PER_FLOCK = 12, FLOCKS = 2;

function buildBirds(scene, disposables) {
  const N = BIRDS_PER_FLOCK * FLOCKS;
  const bodyGeo = new THREE.ConeGeometry(0.32, 1.5, 5).rotateX(Math.PI / 2);
  const wingL = new THREE.PlaneGeometry(1.9, 0.6).translate(-0.98, 0, 0);
  const wingR = new THREE.PlaneGeometry(1.9, 0.6).translate(0.98, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.9, side: THREE.DoubleSide });
  const bodies = new THREE.InstancedMesh(bodyGeo, mat, N);
  const wingsL = new THREE.InstancedMesh(wingL, mat, N);
  const wingsR = new THREE.InstancedMesh(wingR, mat, N);
  for (const m of [bodies, wingsL, wingsR]) m.frustumCulled = false;
  scene.add(bodies, wingsL, wingsR);
  disposables.push(bodyGeo, wingL, wingR, mat);

  const flocks = [
    { cx: 0, cz: -470, ry: 150, rz: 90, h: 70, sp: 0.16, ph: 0 },       // 中央公园上空
    { cx: -140, cz: 620, ry: 190, rz: 130, h: 55, sp: 0.13, ph: 2.1 }, // 自由女神附近
  ];
  const birds = [];
  for (let f = 0; f < FLOCKS; f++) {
    for (let i = 0; i < BIRDS_PER_FLOCK; i++) {
      birds.push({ f, orbit: 3 + (i % 5) * 2.6, oph: (i / BIRDS_PER_FLOCK) * Math.PI * 2, wph: i * 1.3, hoff: (i % 4) * 2.2 });
    }
  }
  const m4 = new THREE.Matrix4(), mw = new THREE.Matrix4(), mloc = new THREE.Matrix4();
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

  function flockPos(fl, t, out) {
    out.set(
      fl.cx + Math.sin(t * fl.sp + fl.ph) * fl.ry,
      fl.h + Math.sin(t * fl.sp * 1.7 + fl.ph) * 9,
      fl.cz + Math.sin(t * fl.sp * 1.31 + fl.ph + 1.2) * fl.rz,
    );
  }

  return (t) => {
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const fl = flocks[b.f];
      flockPos(fl, t, p0);
      flockPos(fl, t + 0.12, p1);
      const ox = Math.cos(t * 0.9 + b.oph) * b.orbit;
      const oz = Math.sin(t * 0.9 + b.oph) * b.orbit;
      p0.x += ox; p0.z += oz; p0.y += b.hoff + Math.sin(t * 2 + b.oph) * 1.5;
      p1.x += Math.cos((t + 0.12) * 0.9 + b.oph) * b.orbit;
      p1.z += Math.sin((t + 0.12) * 0.9 + b.oph) * b.orbit;
      m4.lookAt(p1, p0, up); // cone +z 指向运动反向 → lookAt(from ahead) 修正朝向
      m4.setPosition(p0);
      bodies.setMatrixAt(i, m4);
      const flap = Math.sin(t * 9 + b.wph) * 0.85;
      mloc.makeRotationZ(flap);
      mw.multiplyMatrices(m4, mloc);
      wingsL.setMatrixAt(i, mw);
      mloc.makeRotationZ(-flap);
      mw.multiplyMatrices(m4, mloc);
      wingsR.setMatrixAt(i, mw);
    }
    bodies.instanceMatrix.needsUpdate = true;
    wingsL.instanceMatrix.needsUpdate = true;
    wingsR.instanceMatrix.needsUpdate = true;
  };
}

function buildHelicopter(scene, disposables) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2b4a73, roughness: 0.4, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5, metalness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fc4dd, roughness: 0.15, metalness: 0.7 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), hullMat);
  body.scale.set(1, 0.82, 1.7);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), glassMat);
  nose.position.set(0, -0.1, 2.6);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.55, 6.4, 8).rotateX(Math.PI / 2), hullMat);
  boom.position.set(0, 0.3, -5);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 1.1), hullMat);
  fin.position.set(0, 1.1, -8);
  const skidL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 6).rotateX(Math.PI / 2), darkMat);
  skidL.position.set(-1.2, -1.9, 0.4);
  const skidR = skidL.clone();
  skidR.position.x = 1.2;
  const rotor = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 7.4), darkMat);
    blade.rotation.y = (i / 4) * Math.PI * 2;
    blade.position.y = 0;
    rotor.add(blade);
    disposables.push(blade.geometry);
  }
  rotor.position.y = 2.1;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 8), darkMat);
  hub.position.y = 1.9;
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.34), darkMat);
  tailRotor.position.set(-0.3, 0.7, -8);
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }));
  strobe.position.y = 2.6;
  g.add(body, nose, boom, fin, skidL, skidR, rotor, hub, tailRotor, strobe);
  disposables.push(body.geometry, nose.geometry, boom.geometry, fin.geometry, skidL.geometry,
    hub.geometry, tailRotor.geometry, strobe.geometry, hullMat, darkMat, glassMat, strobe.material);

  // 探照灯
  const spot = new THREE.SpotLight(0xfff2d0, 0, 700, 0.12, 0.45, 1.6);
  g.add(spot);
  const spotTarget = new THREE.Object3D();
  scene.add(spotTarget);
  spot.target = spotTarget;

  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(170, 225, -340),
    new THREE.Vector3(270, 245, -80),
    new THREE.Vector3(120, 255, 140),
    new THREE.Vector3(-170, 240, 80),
    new THREE.Vector3(-270, 250, -180),
    new THREE.Vector3(-90, 232, -430),
  ], true, 'catmullrom', 0.6);
  const len = path.getLength();
  scene.add(g);

  let u = 0;
  const pos = new THREE.Vector3(), ahead = new THREE.Vector3(), look = new THREE.Vector3();
  return {
    update(dt, t, night) {
      u = (u + (dt * 42) / len) % 1;
      path.getPointAt(u, pos);
      path.getPointAt((u + 0.012) % 1, ahead);
      g.position.copy(pos);
      look.copy(ahead);
      g.lookAt(look);
      // 按转弯率压弯
      const yawNow = Math.atan2(ahead.x - pos.x, ahead.z - pos.z);
      path.getPointAt((u + 0.024) % 1, look);
      const yawNext = Math.atan2(look.x - ahead.x, look.z - ahead.z);
      let dy = yawNext - yawNow;
      dy = ((dy + Math.PI) % (Math.PI * 2)) - Math.PI;
      g.rotateZ(THREE.MathUtils.clamp(-dy * 9, -0.45, 0.45));

      rotor.rotation.y += dt * 34;
      tailRotor.rotation.x += dt * 42;
      strobe.material.color.setHex(Math.sin(t * 8) > 0.4 ? 0xff4030 : 0x330a06);

      spot.intensity = night * 52000;
      spotTarget.position.set(
        pos.x + Math.sin(t * 0.5) * 60 + (ahead.x - pos.x) * 3,
        0,
        pos.z + Math.cos(t * 0.62) * 60 + (ahead.z - pos.z) * 3,
      );
      spotTarget.updateMatrixWorld();
    },
    dispose() { scene.remove(g, spotTarget); },
  };
}

function buildBoats(scene, disposables) {
  const boats = [];
  const mk = (parts) => {
    const g = new THREE.Group();
    for (const p of parts) g.add(p);
    scene.add(g);
    return g;
  };
  const mat = (c, r = 0.7, m = 0.1) => {
    const mm = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    disposables.push(mm);
    return mm;
  };
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    disposables.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    return mesh;
  };

  // 渡轮(橙色,史坦顿岛风格)
  const ferry = mk([
    box(8, 2.6, 24, mat(0xe07020), 0, 1.3, 0),
    box(6.4, 2.4, 15, mat(0xf4ede2), 0, 3.6, 0),
    box(1.6, 2.2, 1.6, mat(0x2e3138), 0, 5.6, -3),
  ]);
  // 驳船 + 集装箱
  const bargeParts = [box(7, 1.8, 27, mat(0x3d4148), 0, 0.9, 0)];
  const cols = [0xa33f35, 0x2f6f9e, 0x4f7d43, 0xb08a36];
  for (let i = 0; i < 6; i++) {
    bargeParts.push(box(2.6, 2.2, 5.6, mat(cols[i % 4]), (i % 2) * 3 - 1.5, 2.9, (Math.floor(i / 2) - 1) * 6.5));
  }
  const barge = mk(bargeParts);
  // 拖船
  const tug = mk([
    box(4.4, 2.2, 10, mat(0x27333d), 0, 1.1, 0),
    box(3, 2, 4, mat(0xc8443a), 0, 3.1, 1),
  ]);

  const routeRect = (x, z0, z1, off = 10) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(x - off, 0, z0),
    new THREE.Vector3(x - off, 0, z1),
    new THREE.Vector3(x + off, 0, z1),
    new THREE.Vector3(x + off, 0, z0),
  ], true, 'catmullrom', 0.4);

  boats.push({ g: ferry, path: routeRect(-345, 560, -500), u: 0, sp: 9, ph: 0 });
  boats.push({ g: barge, path: routeRect(430, 620, -380), u: 0.4, sp: 6.5, ph: 2 });
  boats.push({
    g: tug,
    path: new THREE.CatmullRomCurve3([
      new THREE.Vector3(-60, 0, 660), new THREE.Vector3(-140, 0, 780),
      new THREE.Vector3(-260, 0, 700), new THREE.Vector3(-180, 0, 600),
    ], true, 'catmullrom', 0.7),
    u: 0.7, sp: 5, ph: 4,
  });

  const pos = new THREE.Vector3(), ahead = new THREE.Vector3();
  return {
    update(dt, t) {
      for (const b of boats) {
        const len = b.path.getLength();
        b.u = (b.u + (dt * b.sp) / len) % 1;
        b.path.getPointAt(b.u, pos);
        b.path.getPointAt((b.u + 0.01) % 1, ahead);
        pos.y = -1.1 + Math.sin(t * 0.8 + b.ph) * 0.26;
        b.g.position.copy(pos);
        ahead.y = pos.y;
        b.g.lookAt(ahead);
        b.g.rotation.z = Math.sin(t * 0.7 + b.ph * 1.7) * 0.03;
      }
    },
    dispose() { for (const b of boats) scene.remove(b.g); },
  };
}

export function buildAgents(scene, disposables) {
  const updateBirds = buildBirds(scene, disposables);
  const heli = buildHelicopter(scene, disposables);
  const boats = buildBoats(scene, disposables);
  return {
    counts: { birds: BIRDS_PER_FLOCK * FLOCKS, boats: 3, helicopters: 1 },
    update(dt, t, night) {
      updateBirds(t);
      heli.update(dt, t, night);
      boats.update(dt, t);
    },
    dispose() {
      heli.dispose();
      boats.dispose();
    },
  };
}
