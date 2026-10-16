// 地图:浮冰碎碎 —— 一圈会被踩歪的动态浮冰(真实浮力),冰面打滑;浮冰定时开裂沉没。
import * as THREE from 'three';
import { RAPIER, groups, G } from '../physics.js';
import { TEX, mat, makeSky, makeWater, applyBuoyancy } from '../mapkit.js';

// 浮冰之间互不碰撞(贴合处像挤压冰脊),只和动物/道具碰撞
const FLOE_GROUPS = groups(G.ENV, G.BODY | G.LEG | G.PROP);

export default {
  id: 'icefloe',
  name: '浮冰碎碎',
  desc: '北冰洋上的一圈浮冰。冰面很滑,站到边缘浮冰会倾斜;隔一会儿就有一块开裂下沉,落水即出局。',
  ambient: 'snow',
  light: { sunDir: [0.5, 0.6, 0.35], sun: '#fff4e6', sunI: 2.4, sky: '#d6ecff', ground: '#7aa6c2', hemiI: 1.25, fog: ['#cfe3f2', 35, 150], exposure: 1.0 },
  build(game, B) {
    const root = B.root;
    const phys = game.phys;
    makeSky(root, { top: '#6fb2f0', horizon: '#e4f3ff', bottom: '#cde4f2', sunDir: new THREE.Vector3(0.5, 0.25, 0.35), sun: '#fff1d6' });
    const water = makeWater(root, { level: 0, color: '#2f86b0', deep: '#0b3352', amp: 0.13, freq: 0.4, foam: '#f2fbff' });

    // 远处冰山
    const bergMat = mat({ color: '#eaf6ff', roughness: 0.4, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3, d = 45 + Math.random() * 50;
      const g = new THREE.IcosahedronGeometry(4 + Math.random() * 7, 1);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.8 + Math.random() * 0.5), Math.abs(p.getY(k)) * (1 + Math.random()), p.getZ(k) * (0.8 + Math.random() * 0.5));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, bergMat); m.position.set(Math.cos(a) * d, -1, Math.sin(a) * d); root.add(m);
    }

    const snowTop = mat({ map: TEX.snow([0.5, 0.5]), roughness: 0.75 });
    const crackTop = mat({ map: TEX.ice([0.5, 0.5]), color: '#dbeeff', roughness: 0.3 });
    const side = mat({ color: '#9fd8f2', roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.95 });
    const floes = [];
    const makeFloe = (cx, cz, r, mass, seed, isCenter) => {
      const n = 10, pts = [];
      let s = seed;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const rr = r * (0.93 + rnd() * 0.14); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.0, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 2 });
      geo.rotateX(-Math.PI / 2); geo.translate(0, -0.7, 0);
      const mesh = new THREE.Mesh(geo, [snowTop, side]);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
      const body = phys.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(cx, 0, cz).setLinearDamping(0.3).setAngularDamping(0.8));
      const hull = new Float32Array(pts.length * 6);
      pts.forEach(([x, z], i) => { hull.set([x, 0.3, z, x, -0.7, z], i * 6); });
      const col = phys.world.createCollider(RAPIER.ColliderDesc.convexHull(hull).setMass(mass).setFriction(0.08).setCollisionGroups(FLOE_GROUPS), body);
      phys.setInfo(col, { kind: 'env', ice: true, slippery: true });
      const samples = [new THREE.Vector3(0, -0.7, 0), ...pts.map(([x, z]) => new THREE.Vector3(x * 0.92, -0.7, z * 0.92))];
      const f = { body, mesh, col, home: new THREE.Vector3(cx, 0, cz), samples, k: 33, sinking: -1, crackT: -1, isCenter, r, prevP: new THREE.Vector3(cx, 0, cz), prevQ: new THREE.Quaternion(), curP: new THREE.Vector3(cx, 0, cz), curQ: new THREE.Quaternion(), alive: true };
      floes.push(f);
      return f;
    };
    makeFloe(0, 0, 3.4, 620, 11, true);
    const ring = 5.75;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      makeFloe(Math.cos(a) * ring, Math.sin(a) * ring, 3.2, 420, 100 + i * 37, false);
    }
    // 冰屋和雪堆(放在中央浮冰上,视觉用,碰撞挂在浮冰刚体上)
    const center = floes[0];
    const igloo = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat({ map: TEX.tiles('#f4f9ff', '#c8dcec', 6, [2, 1]) }));
    igloo.position.set(-1.2, 0.3, -1.0); igloo.castShadow = true; center.mesh.add(igloo);
    const iglooCol = phys.world.createCollider(RAPIER.ColliderDesc.ball(1.05).setTranslation(-1.2, 0.3, -1.0).setMass(1).setFriction(0.3).setCollisionGroups(FLOE_GROUPS), center.body);
    phys.setInfo(iglooCol, { kind: 'env', ice: true });
    // 道具
    game.spawnItem('crate', new THREE.Vector3(1.4, 0.8, 1.0));
    game.spawnItem('ball', new THREE.Vector3(floes[2].home.x * 0.8, 1.0, floes[2].home.z * 0.8));

    // 雪花
    const N = 1400, sg = new THREE.BufferGeometry(), sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) sp.set([(Math.random() - 0.5) * 50, Math.random() * 24, (Math.random() - 0.5) * 50], i * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.09, transparent: true, opacity: 0.85 }));
    snow.frustumCulled = false; root.add(snow);

    const st = { next: 20, sd: false };
    const spawns = [];
    for (let i = 0; i < 8; i++) {
      if (i < 2) spawns.push([i === 0 ? -1.4 : 1.6, 0.35, i === 0 ? 1.4 : -0.6]);
      else { const f = floes[1 + ((i - 2) % 6)]; spawns.push([f.home.x, 0.35, f.home.z]); }
    }
    const crack = (f) => {
      if (!f || f.crackT >= 0 || f.sinking >= 0) return;
      f.crackT = 0;
      f.mesh.material = [crackTop, side];
      game.sfx('crack'); game.sfx('creak', { pitch: 0.8 });
    };
    return {
      killY: -4,
      water,
      spawns,
      weaponSpots: [[0.8, 0.9, 1.5], ...floes.slice(1).map((f) => [f.home.x, 0.9, f.home.z])],
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      cam: { target: [0, 0.3, 0], dist: 13 },
      floes,
      update(dt, t, time) {
        for (const f of floes) {
          if (!f.alive) continue;
          if (f.crackT >= 0) {
            f.crackT += dt;
            f.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * f.body.mass() * 0.4 * dt, y: 0, z: (Math.random() - 0.5) * f.body.mass() * 0.4 * dt }, true);
            if (f.crackT > 3) { f.crackT = -1; f.sinking = 0; game.sfx('iceBreak'); game.sfx('splash', { pitch: 0.7 }); }
          }
          if (f.sinking >= 0) { f.sinking += dt; f.k = Math.max(0, 33 * (1 - f.sinking / 2.2)); }
          applyBuoyancy(f.body, f.samples, water, time, { k: f.k, damp: 3, linDrag: 0.8 });
          // 软锚:保持阵型
          const p = f.body.translation(), v = f.body.linvel(), m = f.body.mass();
          if (f.sinking < 0) f.body.applyImpulse({ x: m * (-(p.x - f.home.x) * 0.9 - v.x * 0.6) * dt, y: 0, z: m * (-(p.z - f.home.z) * 0.9 - v.z * 0.6) * dt }, true);
          const av = f.body.angvel(), ro = f.body.rotation();
          // 扶正力矩:浮冰会被踩歪,但不至于翻
          const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(ro.x, ro.y, ro.z, ro.w));
          const kr = f.sinking >= 0 ? 0 : 9;
          f.body.applyTorqueImpulse({ x: m * (-up.z * kr - av.x * 1.2) * dt, y: -av.y * m * 0.8 * dt, z: m * (up.x * kr - av.z * 1.2) * dt }, true);
          if (p.y < -4) { f.alive = false; phys.world.removeRigidBody(f.body); phys.colliderInfo.delete(f.col.handle); f.mesh.visible = false; }
        }
        st.next -= dt;
        if (st.next <= 0) {
          const cand = floes.filter((f) => f.alive && !f.isCenter && f.crackT < 0 && f.sinking < 0);
          if (cand.length) crack(cand[Math.floor(game.rand() * cand.length)]);
          st.next = st.sd ? 4.5 : 15;
        }
      },
      afterStep() {
        for (const f of floes) {
          if (!f.alive) continue;
          f.prevP.copy(f.curP); f.prevQ.copy(f.curQ);
          const p = f.body.translation(), q = f.body.rotation();
          f.curP.set(p.x, p.y, p.z); f.curQ.set(q.x, q.y, q.z, q.w);
        }
      },
      frame(t, dt, alpha) {
        water.update(t);
        for (const f of floes) {
          if (!f.alive) continue;
          f.mesh.position.lerpVectors(f.prevP, f.curP, alpha);
          f.mesh.quaternion.slerpQuaternions(f.prevQ, f.curQ, alpha);
        }
        snow.position.y -= dt * 1.2; if (snow.position.y < -12) snow.position.y += 12;
        snow.position.x = Math.sin(t * 0.3) * 1.5;
      },
      aiHint(c) {
        const gb = c.ground?.body;
        const f = gb && floes.find((x) => x.body === gb);
        if (f && !f.isCenter && (f.crackT >= 0 || f.sinking >= 0)) return { goto: [0, 0] };
        return null;
      },
      suddenDeath() { st.sd = true; st.next = 1; game.announce('冰层崩裂!', '浮冰接连沉没'); },
    };
  },
};
