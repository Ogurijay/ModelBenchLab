// 市民与卫兵:低模人形 + 实例化渲染(5 个 InstancedMesh 撑起整城人流,只占 5 个 drawcall)。
// 走路是真的沿街道折返,腿部摆动与身体起伏由相位驱动。
import * as THREE from 'three';
import { boxOn, cyl, sphere, cone, merge } from '../core/geom.js';
import { LANES } from './plan.js';

const CLOAKS = [0x6b4a2f, 0x3f5a7a, 0x6c3038, 0x4a5b3a, 0x7a6a44, 0x2f3b52, 0x8a6c4a, 0x54406a];

function protoGeoms() {
  // 躯干:上窄下宽的长袍
  const body = merge([
    cyl(0.19, 0.32, 0.95, 8, 0, 0.475, 0),
    boxOn(0.46, 0.3, 0.26, 0, 0.86, 0),
  ]);
  const head = merge([
    sphere(0.125, 8, 6, 0, 0, 0),
    cone(0.17, 0.16, 7, 0, 0.1, 0),
  ]);
  const leg = boxOn(0.13, 0.5, 0.15, 0, -0.5, 0);
  const arm = merge([
    boxOn(0.11, 0.52, 0.13, -0.26, -0.52, 0),
    boxOn(0.11, 0.52, 0.13, 0.26, -0.52, 0),
  ]);
  return { body, head, leg, arm };
}

export function createCitizens(M, count, rng) {
  const g = protoGeoms();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9b48f, roughness: 0.85 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const mBody = new THREE.InstancedMesh(g.body, cloth, count);
  const mHead = new THREE.InstancedMesh(g.head, skin, count);
  const mLegL = new THREE.InstancedMesh(g.leg, cloth, count);
  const mLegR = new THREE.InstancedMesh(g.leg, cloth, count);
  const mArm = new THREE.InstancedMesh(g.arm, cloth, count);
  const meshes = [mBody, mHead, mLegL, mLegR, mArm];
  for (const m of meshes) { m.castShadow = true; m.frustumCulled = false; }

  const group = new THREE.Group();
  group.name = 'citizens';
  group.add(...meshes);

  // 可行走的路径:街道 + 城墙马道
  const paths = [];
  for (const l of LANES) {
    const len = Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]);
    if (len < 20) continue;
    paths.push({ a: l.a, b: l.b, w: l.w, y: 0, len });
  }

  const agents = [];
  for (let i = 0; i < count; i++) {
    const p = paths[rng.int(0, paths.length - 1)];
    agents.push({
      path: p,
      t: rng.next() * p.len,
      dir: rng.chance(0.5) ? 1 : -1,
      off: rng.range(-1, 1) * (p.w / 2 - 1.1),
      speed: rng.range(0.9, 1.9),
      phase: rng.next() * 6.28,
      color: new THREE.Color(CLOAKS[rng.int(0, CLOAKS.length - 1)]),
      scale: rng.range(0.94, 1.08),
    });
  }

  const d = new THREE.Object3D();
  d.rotation.order = 'YXZ';     // 先偏航再俯仰,腿才会沿前进方向摆
  agents.forEach((a, i) => {
    mBody.setColorAt(i, a.color);
    mLegL.setColorAt(i, a.color);
    mLegR.setColorAt(i, a.color);
    mArm.setColorAt(i, a.color);
  });
  for (const m of [mBody, mLegL, mLegR, mArm]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  function update(dt, t) {
    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      a.t += a.speed * a.dir * dt;
      if (a.t > a.len - 2) { a.t = a.len - 2; a.dir = -1; }
      if (a.t < 2) { a.t = 2; a.dir = 1; }
      const p = a.path;
      const ux = (p.b[0] - p.a[0]) / p.len, uz = (p.b[1] - p.a[1]) / p.len;
      const nx = uz, nz = -ux;
      const x = p.a[0] + ux * a.t + nx * a.off;
      const z = p.a[1] + uz * a.t + nz * a.off;
      const yaw = Math.atan2(ux * a.dir, uz * a.dir);
      const swing = Math.sin(t * a.speed * 5.2 + a.phase);
      const bob = Math.abs(Math.cos(t * a.speed * 5.2 + a.phase)) * 0.045;
      const S = a.scale;

      d.position.set(x, p.y + 0.5 * S + bob, z);
      d.rotation.set(0, yaw, 0);
      d.scale.setScalar(S);
      d.updateMatrix();
      mBody.setMatrixAt(i, d.matrix);

      d.position.set(x, p.y + (1.52 * S) + bob, z);
      d.updateMatrix();
      mHead.setMatrixAt(i, d.matrix);

      for (const [mesh, sgn, dx] of [[mLegL, 1, -0.11], [mLegR, -1, 0.11]]) {
        d.position.set(
          x + (Math.cos(yaw) * dx * S),
          p.y + 0.55 * S + bob,
          z - (Math.sin(yaw) * dx * S)
        );
        d.rotation.set(swing * sgn * 0.55, yaw, 0);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      d.position.set(x, p.y + 1.3 * S + bob, z);
      d.rotation.set(-swing * 0.42, yaw, 0);
      d.scale.setScalar(S);
      d.updateMatrix();
      mArm.setMatrixAt(i, d.matrix);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }

  update(0, 0);
  void M;
  return { group, update, agents, dispose() { for (const m of meshes) m.dispose(); skin.dispose(); cloth.dispose(); } };
}
