// 地图:晃晃吊桥 —— 两座悬崖 + 中央石柱,用会晃动、会断裂的木板吊桥相连;突然死亡时峡谷刮起横风。
import * as THREE from 'three';
import { RAPIER, groups, G } from '../physics.js';
import { TEX, mat, makeSky, makeWater } from '../mapkit.js';

const PLANK_GROUPS = groups(G.ENV, G.BODY | G.LEG | G.PROP);

export default {
  id: 'bridge',
  name: '晃晃吊桥',
  desc: '峡谷上的两段木板吊桥,一踩就晃。木板会不时断裂坠落,突然死亡时峡谷刮起横风。',
  ambient: 'wind',
  light: { sunDir: [-0.4, 0.75, 0.3], sun: '#fff1d2', sunI: 2.5, sky: '#bfe0ff', ground: '#6b5a3e', hemiI: 1.15, fog: ['#c7dff0', 40, 170], exposure: 1.0 },
  build(game, B) {
    const root = B.root, phys = game.phys, W = phys.world;
    makeSky(root, { top: '#4f9be8', horizon: '#dff0ff', bottom: '#a9c6d6', sunDir: new THREE.Vector3(-0.4, 0.45, 0.3) });
    const river = makeWater(root, { level: -16, color: '#3aa0b8', deep: '#14485a', amp: 0.2, freq: 0.5, opacity: 1 });

    const rock = mat({ map: TEX.rock('#9a8466', [3, 6]), roughness: 0.95 });
    const grass = mat({ map: TEX.grass([4, 4]), roughness: 0.95 });
    const cliff = (x0, x1, z0, z1) => {
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      B.box(w, 0.4, d, [cx, -0.2, cz], grass);
      B.box(w - 0.1, 30, d - 0.1, [cx, -15.4, cz], rock, { noGrab: false });
    };
    cliff(-15, -6, -5.5, 5.5);
    cliff(6, 15, -5.5, 5.5);
    cliff(-1.7, 1.7, -2.2, 2.2);
    // 远山
    const mtn = mat({ color: '#7d8f86', flatShading: true });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, d = 70 + Math.random() * 40;
      const m = new THREE.Mesh(new THREE.ConeGeometry(14 + Math.random() * 14, 30 + Math.random() * 40, 7), mtn);
      m.position.set(Math.cos(a) * d, -14, Math.sin(a) * d); root.add(m);
    }
    // 峡谷两壁(视觉)
    for (const sz of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(60, 40, 6), rock);
      wall.position.set(0, -20, sz * 22); root.add(wall);
    }
    // 树
    const trunkM = mat({ color: '#7a5233' }), leafM = mat({ color: '#4c9a3f', flatShading: true });
    for (const [x, z] of [[-12.5, -3.8], [-13.4, 3], [12.8, 3.9], [11.8, -3.4], [-9.4, 4.4]]) {
      B.cyl(0.25, 0.32, 2.4, [x, 1.2, z], trunkM);
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), leafM); crown.position.set(x, 3.1, z); crown.castShadow = true; root.add(crown);
    }
    // 岩石掩体
    for (const [x, z, s] of [[-9, -4.0, 0.9], [9.4, 4.1, 1.0], [8.4, -3.9, 0.7]]) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock); r.position.set(x, s * 0.5, z); r.castShadow = true; root.add(r);
      B.solid(s * 1.3, s, s * 1.3, [x, s * 0.5, z]);
    }

    // 吊桥
    const plankM = mat({ map: TEX.planks('#a7774a', [1, 1]), roughness: 0.8 });
    const ropeM = new THREE.LineBasicMaterial({ color: '#6b5134' });
    const planks = [];
    const ropes = [];
    const makeBridge = (xa, xb) => {
      const n = 6, gap = xb - xa, pl = gap / n * 1.03, width = 2.8;
      let prev = null;
      const list = [];
      for (let i = 0; i < n; i++) {
        const cx = xa + (i + 0.5) * (gap / n);
        const body = W.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(cx, -0.08, 0).setLinearDamping(0.6).setAngularDamping(1.5));
        const col = W.createCollider(RAPIER.ColliderDesc.cuboid(pl / 2 * 0.96, 0.07, width / 2).setMass(16).setFriction(0.9).setCollisionGroups(PLANK_GROUPS), body);
        phys.setInfo(col, { kind: 'env', tag: 'plank' });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(pl * 0.96, 0.14, width), plankM);
        mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
        const p = { body, col, mesh, joints: [], alive: true, prevPlank: prev, prevP: new THREE.Vector3(cx, -0.08, 0), curP: new THREE.Vector3(cx, -0.08, 0), prevQ: new THREE.Quaternion(), curQ: new THREE.Quaternion(), half: pl / 2 };
        for (const z of [-width / 2 + 0.1, width / 2 - 0.1]) {
          if (prev) p.joints.push(W.createImpulseJoint(RAPIER.JointData.spherical({ x: -pl / 2, y: 0, z }, { x: prev.half, y: 0, z }), body, prev.body, true));
          else p.joints.push(W.createImpulseJoint(RAPIER.JointData.spherical({ x: -pl / 2, y: 0, z }, { x: xa, y: -0.08, z }), body, phys.ground, true));
        }
        list.push(p); planks.push(p); prev = p;
      }
      // 末端锚定
      for (const z of [-width / 2 + 0.1, width / 2 - 0.1]) prev.joints.push(W.createImpulseJoint(RAPIER.JointData.spherical({ x: prev.half, y: 0, z }, { x: xb, y: -0.08, z }), prev.body, phys.ground, true));
      // 桥头柱 + 绳索
      const post = mat({ color: '#6e4a2c' });
      for (const x of [xa, xb]) for (const z of [-1.5, 1.5]) B.cyl(0.1, 0.12, 1.4, [x, 0.6, z], post);
      for (const z of [-1.5, 1.5]) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 2) * 3), 3));
        const line = new THREE.Line(g, ropeM); line.frustumCulled = false; root.add(line);
        ropes.push({ line, list, z, xa, xb });
      }
    };
    makeBridge(-6, -1.7);
    makeBridge(1.7, 6);

    game.spawnItem('crate', new THREE.Vector3(-10.5, 0.4, 0.5));
    game.spawnItem('barrel', new THREE.Vector3(10.6, 0.45, -0.6));
    game.spawnItem('crate', new THREE.Vector3(1.0, 0.4, 0));

    const st = { next: 24, sd: false, gust: 0, gustDir: 1, gt: 0 };
    const breakPlank = (p) => {
      if (!p.alive) return;
      p.alive = false;
      for (const j of p.joints) { try { W.removeImpulseJoint(j, true); } catch (e) { /* ignore */ } }
      p.body.applyImpulse({ x: 0, y: -20, z: 0 }, true);
      game.sfx('crack'); game.sfx('creak', { pitch: 0.7 });
    };
    // 断开时也要移除其它板挂在它身上的关节
    const breakAt = (p) => {
      const neighbor = planks.find((q) => q.prevPlank === p);
      breakPlank(p);
      if (neighbor && neighbor.alive) {
        // neighbor 的前两个关节连到 p
        for (const j of neighbor.joints.splice(0, 2)) { try { W.removeImpulseJoint(j, true); } catch (e) { /* ignore */ } }
      }
    };
    const spawns = [[-10, 0, -2], [-10, 0, 2], [-8, 0, 0], [10, 0, -2], [10, 0, 2], [8, 0, 0], [0, 0, -1], [0, 0, 1]];
    return {
      killY: -9,
      water: null,
      spawns,
      weaponSpots: [[-11, 0.5, 0], [11, 0.5, 0], [0, 0.6, 0], [-8, 0.5, -4], [8, 0.5, 4]],
      bounds: { minX: -15, maxX: 15, minZ: -5.5, maxZ: 5.5 },
      cam: { target: [0, 0, 0], dist: 13 },
      update(dt, t) {
        st.next -= dt;
        if (st.next <= 0) {
          const alive = planks.filter((p) => p.alive);
          if (alive.length) breakAt(alive[Math.floor(game.rand() * alive.length)]);
          st.next = st.sd ? 3 : 12 + game.rand() * 6;
        }
        // 横风
        if (st.sd) {
          st.gt -= dt;
          if (st.gt <= 0) { st.gust = 2.4; st.gustDir = game.rand() < 0.5 ? -1 : 1; st.gt = 7; game.sfx('wind'); game.announce('峡谷横风!', st.gustDir > 0 ? '风向 →' : '风向 ←'); }
          if (st.gust > 0) {
            st.gust -= dt;
            for (const c of game.creatures) {
              if (!c.alive) continue;
              for (const b of Object.values(c.B)) { const m = b.mass(); b.applyImpulse({ x: 0, y: 0, z: st.gustDir * m * 11 * dt }, true); }
            }
          }
          game.setAmbientIntensity?.(st.gust > 0 ? 1 : 0.3);
        }
        for (const p of planks) if (p.body.translation().y < -30 && p.mesh.visible) { p.mesh.visible = false; p.body.setEnabled(false); }
      },
      afterStep() {
        for (const p of planks) {
          if (!p.mesh.visible) continue;
          p.prevP.copy(p.curP); p.prevQ.copy(p.curQ);
          const tr = p.body.translation(), q = p.body.rotation();
          p.curP.set(tr.x, tr.y, tr.z); p.curQ.set(q.x, q.y, q.z, q.w);
        }
      },
      frame(t, dt, alpha) {
        river.update(t);
        for (const p of planks) {
          if (!p.mesh.visible) continue;
          p.mesh.position.lerpVectors(p.prevP, p.curP, alpha);
          p.mesh.quaternion.slerpQuaternions(p.prevQ, p.curQ, alpha);
        }
        for (const r of ropes) {
          const a = r.line.geometry.attributes.position;
          a.setXYZ(0, r.xa, 1.25, r.z);
          r.list.forEach((p, i) => {
            const y = p.alive ? p.curP.y + 0.85 : 0.35 - Math.sin(((i + 1) / (r.list.length + 1)) * Math.PI) * 0.9;
            const x = p.alive ? p.curP.x : r.xa + (r.xb - r.xa) * ((i + 1) / (r.list.length + 1));
            a.setXYZ(i + 1, x, y, r.z + (p.alive ? p.curP.z : 0));
          });
          a.setXYZ(r.list.length + 1, r.xb, 1.25, r.z);
          a.needsUpdate = true;
        }
      },
      suddenDeath() { st.sd = true; st.gt = 2; st.next = 1; game.announce('吊桥要散架了!', '峡谷里起风了'); },
    };
  },
};
