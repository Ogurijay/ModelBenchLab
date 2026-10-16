// 地图:大风车间 —— 一端是巨型风扇,警报后狂风把没躲在掩体后的动物吹出开放的另一端。
import * as THREE from 'three';
import { TEX, mat, makeSky } from '../mapkit.js';
import { groups, G } from '../physics.js';

const SHIELD_GROUPS = groups(G.BODY, G.ENV);

export default {
  id: 'windfactory',
  name: '大风车间',
  desc: '高空工厂平台。警报灯一转,尽头的巨型风扇就会刮起狂风 —— 躲在水泥块后面,或者干脆抓住柱子!',
  ambient: 'factory',
  light: { sunDir: [0.45, 0.75, 0.5], sun: '#fff0d8', sunI: 2.3, sky: '#c6d9f0', ground: '#5a5048', hemiI: 1.1, fog: ['#b9cbe0', 40, 160], exposure: 1.0 },
  build(game, B) {
    const root = B.root;
    makeSky(root, { top: '#4d8fe0', horizon: '#d8ecff', bottom: '#9fb8d0', sunDir: new THREE.Vector3(0.45, 0.4, 0.5) });
    B.city({ count: 50, inner: 40, outer: 140, minH: 10, maxH: 50, baseY: -60, seed: 21 });
    const W = 6.2, L = 11;
    const floor = mat({ map: TEX.metal('#8d969e', [6, 11]), roughness: 0.55, metalness: 0.35 });
    B.box(W * 2, 0.6, L * 2, [0, -0.3, 0], floor);
    // 下方支撑结构(视觉)
    const steel = mat({ color: '#5f6770', metalness: 0.5, roughness: 0.5 });
    for (const x of [-W + 0.5, W - 0.5]) for (const z of [-8, 0, 8]) B.box(0.6, 40, 0.6, [x, -20.6, z], steel, { collide: false });
    // 两侧护栏(带缺口)
    const rail = mat({ map: TEX.hazard([4, 0.5]), roughness: 0.6 });
    for (const sx of [-1, 1]) {
      B.box(0.3, 1.0, 6, [sx * W, 0.5, -7], rail);
      B.box(0.3, 1.0, 4.5, [sx * W, 0.5, 1.2], rail);
      B.box(0.3, 1.0, 2.5, [sx * W, 0.5, 7.5], rail);
    }
    // 风扇端:后墙 + 风扇格栅
    const wallM = mat({ map: TEX.concrete('#a39d93', [4, 2]) });
    B.box(W * 2 + 0.6, 8, 0.6, [0, 4, -L - 0.9], wallM, { collide: true, tag: 'fanwall' });
    const ringM = mat({ color: '#2d3138', metalness: 0.6, roughness: 0.4 });
    const fanRing = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.35, 12, 48), ringM);
    fanRing.position.set(0, 3.7, -L - 0.5); root.add(fanRing);
    const fan = new THREE.Group(); fan.position.set(0, 3.7, -L - 0.45); root.add(fan);
    const bladeM = mat({ color: '#d9dde2', metalness: 0.4, roughness: 0.35 });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.0, 0.08), bladeM);
      b.geometry.translate(0, 1.6, 0); b.rotation.z = (i / 5) * Math.PI * 2; b.rotation.y = 0.35; b.castShadow = true; fan.add(b);
    }
    fan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 20).rotateX(Math.PI / 2), ringM));
    const grill = new THREE.Mesh(new THREE.CircleGeometry(3.3, 40), new THREE.MeshStandardMaterial({ color: '#222', wireframe: true }));
    grill.position.set(0, 3.7, -L - 0.2); root.add(grill);
    B.solid(7, 7, 0.3, [0, 3.7, -L - 0.2], { tag: 'fan' });
    // 警报灯
    const beacons = [];
    for (const sx of [-1, 1]) {
      const bm = new THREE.MeshStandardMaterial({ color: '#ff3b2f', emissive: '#ff2010', emissiveIntensity: 0.2 });
      const bc = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), bm); bc.position.set(sx * 4.8, 7.4, -L - 0.4); root.add(bc);
      const pl = new THREE.PointLight('#ff3020', 0, 14, 2); pl.position.copy(bc.position).add(new THREE.Vector3(0, -0.5, 1)); root.add(pl);
      beacons.push({ bm, pl });
    }
    // 掩体:水泥块、柱子、货架
    const block = mat({ map: TEX.concrete('#bdb7ad', [1, 1]) });
    for (const [x, z, w] of [[-3.2, -6, 2.2], [2.8, -5.2, 2.6], [0, -1.6, 2.4], [-3.6, 2.4, 2.0], [3.4, 3.2, 2.0], [-0.6, 6.4, 2.2]]) B.box(w, 1.5, 0.9, [x, 0.75, z], block);
    const covers = [[-3.2, -5.3], [2.8, -4.5], [0, -0.9], [-3.6, 3.1], [3.4, 3.9], [-0.6, 7.1], [-1.2, -8.1], [1.6, 1.3], [-1.8, 5.1], [4.2, -0.9]];
    const pil = mat({ map: TEX.hazard([1, 3]) });
    for (const [x, z] of [[-1.2, -8.6], [1.6, 0.8], [-1.8, 4.6], [4.2, -1.4]]) B.cyl(0.32, 0.32, 3.6, [x, 1.8, z], pil);
    // 顶棚桁架(仅视觉,风扇一侧)
    for (let z = -L; z < 2; z += 3) B.box(W * 2, 0.25, 0.25, [0, 6.2, z], steel, { collide: false });
    for (const sx of [-1, 1]) B.box(0.25, 0.25, 13, [sx * (W - 0.2), 6.2, -4.5], steel, { collide: false });
    for (const sx of [-1, 1]) for (const z of [-L, -4.5, 1.5]) B.box(0.25, 6.2, 0.25, [sx * (W - 0.2), 3.1, z], steel, { collide: false });
    // 开放端的警示边
    B.box(W * 2, 0.06, 0.6, [0, 0.03, L - 0.3], mat({ map: TEX.hazard([8, 0.5]) }), { collide: false });

    game.spawnItem('crate', new THREE.Vector3(1.6, 0.4, -3.2));
    game.spawnItem('crate', new THREE.Vector3(-2.2, 0.4, 6.0));
    game.spawnItem('barrel', new THREE.Vector3(3.6, 0.5, 6.4));

    // 风流线
    const N = 260, lg = new THREE.BufferGeometry(), lp = new Float32Array(N * 6);
    const seeds = [];
    for (let i = 0; i < N; i++) seeds.push([(Math.random() - 0.5) * W * 2, Math.random() * 5 + 0.2, Math.random() * L * 2 - L]);
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }));
    lines.frustumCulled = false; root.add(lines);

    const st = { phase: 'idle', t: 0, next: 10, sd: false, power: 0, spin: 0 };
    const ray = new THREE.Vector3();
    const shielded = (p) => {
      const hit = game.phys.castRay({ x: p.x, y: p.y, z: p.z }, { x: 0, y: 0, z: -1 }, p.z + L + 0.5, SHIELD_GROUPS);
      if (!hit) return false;
      const info = game.phys.info(hit.collider);
      return !(info && (info.tag === 'fan' || info.tag === 'fanwall'));
    };
    return {
      killY: -8,
      spawns: [[-2, 0, -3.5], [2, 0, -3.5], [-2, 0, 0.6], [2.2, 0, 1.8], [0, 0, -7.5], [-4, 0, -2], [4, 0, 5], [0, 0, 4.4]],
      weaponSpots: [[0, 0.5, -4], [-4.5, 0.5, -0.5], [4.5, 0.5, 1], [1, 0.5, 5], [-2.5, 0.5, -9]],
      bounds: { minX: -W, maxX: W, minZ: -L, maxZ: L },
      cam: { target: [0, 0, 0], dist: 11 },
      update(dt) {
        st.t += dt;
        if (st.phase === 'idle') {
          st.power = Math.max(st.sd ? 0.45 : 0, st.power - dt * 0.8);
          st.next -= dt;
          if (st.next <= 0) { st.phase = 'warn'; st.t = 0; game.announce('狂风警报!', '躲到掩体后面或抓住柱子'); game.sfx('alarm'); }
        } else if (st.phase === 'warn') {
          st.power = Math.min(st.power + dt * 0.15, 0.3);
          if (st.t > 2.6) { st.phase = 'blow'; st.t = 0; game.sfx('wind', { volume: 1.3 }); }
        } else if (st.phase === 'blow') {
          st.power = Math.min(1.25, st.power + dt * 1.6);
          if (st.t > (st.sd ? 6 : 4.6)) { st.phase = 'idle'; st.next = st.sd ? 5 : 9 + Math.random() * 3; }
        }
        game.setAmbientIntensity?.(st.power);
        if (st.power > 0.05) {
          const acc = 15 * st.power;
          for (const c of game.creatures) {
            if (!c.alive || c.pos.y < -3) continue;
            if (c.pos.z < -L) continue;
            const shield = shielded(c.pos) || shielded(c.headPos);
            if (shield) continue;
            for (const b of Object.values(c.B)) { const m = b.mass(); b.applyImpulse({ x: 0, y: m * acc * 0.12 * dt, z: m * acc * dt }, true); }
          }
          for (const it of game.items) {
            if (it.holder || !it.alive) continue;
            const p = it.body.translation();
            if (shielded(p)) continue;
            const m = it.body.mass();
            it.body.applyImpulse({ x: 0, y: 0, z: m * acc * 0.7 * dt }, true);
          }
        }
      },
      frame(t, dt) {
        st.spin += dt * (1 + st.power * 22);
        fan.rotation.z = -st.spin;
        const warn = st.phase === 'warn' || st.phase === 'blow';
        beacons.forEach((b, i) => { const on = warn && Math.sin(t * 14 + i * 3) > 0; b.bm.emissiveIntensity = on ? 3 : 0.2; b.pl.intensity = on ? 10 : 0; });
        lines.material.opacity = Math.min(0.55, st.power * 0.5);
        if (st.power > 0.05) {
          for (let i = 0; i < N; i++) {
            const s = seeds[i];
            s[2] += dt * (12 + (i % 7)) * st.power;
            if (s[2] > L + 4) { s[2] = -L; s[0] = (Math.random() - 0.5) * W * 2; }
            lp.set([s[0], s[1], s[2], s[0], s[1], s[2] - 0.9 * st.power], i * 6);
          }
          lg.attributes.position.needsUpdate = true;
        }
      },
      aiHint(c) {
        if (st.phase === 'idle' && !(st.sd && st.power > 0.3)) return null;
        let best = null, bd = 1e9;
        for (const [x, z] of covers) { const d = Math.hypot(x - c.pos.x, z - c.pos.z); if (d < bd) { bd = d; best = [x, z]; } }
        return best ? { goto: best, grab: true } : null;
      },
      suddenDeath() { st.sd = true; game.announce('风扇失控!', '风越来越大了'); },
    };
  },
};
