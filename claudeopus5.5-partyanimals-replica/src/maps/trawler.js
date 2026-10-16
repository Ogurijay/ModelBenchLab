// 地图:风暴渔船 —— 摇晃的甲板,周期性大浪横扫甲板;突然死亡时船尾开始下沉。
import * as THREE from 'three';
import { TEX, mat, makeSky, makeWater } from '../mapkit.js';

export default {
  id: 'trawler',
  name: '风暴渔船',
  desc: '暴风雨中的拖网渔船。甲板随浪摇摆,汽笛响起后大浪会横扫甲板 —— 躲到船舱后面或抓紧桅杆!',
  ambient: 'storm',
  light: { sunDir: [0.3, 0.8, -0.4], sun: '#c9d6e8', sunI: 1.5, sky: '#9fb2c8', ground: '#2c3a46', hemiI: 1.3, fog: ['#65788a', 18, 90], exposure: 1.05 },
  build(game, B) {
    const root = B.root;
    makeSky(root, { top: '#3d4a5a', horizon: '#8a9aab', bottom: '#2b3846', sunDir: new THREE.Vector3(0.3, 0.5, -0.4), sun: '#9fb0c4' });
    const water = makeWater(root, { level: 0, color: '#2f6f86', deep: '#0d2b3b', amp: 0.55, freq: 0.28, foam: '#e3f2f7' });

    const boatBody = game.phys.kinematicBody({ x: 0, y: 0, z: 0 });
    const boat = new THREE.Group(); root.add(boat);
    const P = { body: boatBody, parent: boat };
    const DECK = 1.2;
    // 船体(视觉):挤出船形
    const shape = new THREE.Shape();
    shape.moveTo(-3.3, -7.6); shape.lineTo(3.3, -7.6); shape.lineTo(3.4, 3.5);
    shape.quadraticCurveTo(3.2, 7.2, 0, 9.4); shape.quadraticCurveTo(-3.2, 7.2, -3.4, 3.5); shape.lineTo(-3.3, -7.6);
    const hullGeo = new THREE.ExtrudeGeometry(shape, { depth: 3.0, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 2 });
    hullGeo.rotateX(Math.PI / 2); hullGeo.translate(0, DECK - 0.33, 0); // 倒角会向上凸出 0.25,压到甲板下
    const hull = new THREE.Mesh(hullGeo, mat({ color: '#c8392f', roughness: 0.55 }));
    hull.castShadow = true; hull.receiveShadow = true; boat.add(hull);
    const stripe = new THREE.Mesh(hullGeo, mat({ color: '#f1efe8', roughness: 0.5 }));
    stripe.scale.set(1.012, 0.1, 1.012); stripe.position.y = DECK * 0.9 - 0.2; boat.add(stripe);
    // 甲板(碰撞)
    const deck = mat({ map: TEX.planks('#a9794c', [3, 8]), roughness: 0.6 });
    B.box(6.6, 0.3, 15.2, [0, DECK - 0.15, 0], deck, { ...P, friction: 0.55 });
    const bowShape = new THREE.Shape();
    bowShape.moveTo(-3.3, 0); bowShape.lineTo(3.3, 0); bowShape.quadraticCurveTo(3.1, 2.4, 0, 4.4); bowShape.quadraticCurveTo(-3.1, 2.4, -3.3, 0);
    const bowGeo = new THREE.ExtrudeGeometry(bowShape, { depth: 0.3, bevelEnabled: false }); bowGeo.rotateX(Math.PI / 2); bowGeo.translate(0, DECK + 0.6, 5.0);
    const bowDeck = new THREE.Mesh(bowGeo, deck); bowDeck.castShadow = bowDeck.receiveShadow = true; boat.add(bowDeck);
    B.solid(6.4, 0.3, 2.6, [0, DECK + 0.45, 6.3], P); B.solid(3.6, 0.3, 1.6, [0, DECK + 0.45, 8.2], P);
    B.box(6.6, 0.6, 0.25, [0, DECK + 0.3, 5.0], mat({ color: '#e9e4d8' }), P); // 船首台阶
    // 舷墙(带缺口)
    const rail = mat({ color: '#f2efe6', roughness: 0.5 });
    for (const sx of [-1, 1]) {
      B.box(0.2, 0.55, 4.0, [sx * 3.25, DECK + 0.27, -5.5], rail, P);
      B.box(0.2, 0.55, 3.2, [sx * 3.25, DECK + 0.27, 0.6], rail, P);
      B.box(0.2, 0.55, 1.5, [sx * 3.25, DECK + 0.27, 4.2], rail, P);
    }
    B.box(6.6, 0.55, 0.2, [-0, DECK + 0.27, -7.55], rail, P);
    // 驾驶舱
    const cabin = mat({ map: TEX.planks('#e9e1d0', [2, 2]), roughness: 0.6 });
    B.box(3.8, 2.3, 3.2, [0, DECK + 1.15, -4.4], cabin, P);
    B.box(4.2, 0.2, 3.6, [0, DECK + 2.4, -4.4], mat({ color: '#2f5f8a' }), P);
    const glass = mat({ color: '#9ad0ff', roughness: 0.1, metalness: 0.3, emissive: '#204060', emissiveIntensity: 0.4 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), glass); win.position.set(0, DECK + 1.7, -2.79); boat.add(win);
    // 烟囱
    B.cyl(0.32, 0.38, 1.2, [1.1, DECK + 3.0, -5.3], mat({ color: '#2b2b30' }), P);
    // 桅杆 + 横杆(可以抓)
    const metal = mat({ color: '#d7d2c8', metalness: 0.4, roughness: 0.5 });
    B.cyl(0.13, 0.15, 5.2, [0, DECK + 2.6, 1.6], metal, P);
    B.box(3.6, 0.14, 0.14, [0, DECK + 3.8, 1.6], metal, P);
    // 吊臂 & 渔网堆
    const net = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat({ color: '#3f7f6f', wireframe: true }));
    net.position.set(-1.8, DECK, -0.8); net.scale.y = 0.6; boat.add(net);
    B.solid(1.6, 0.5, 1.6, [-1.8, DECK + 0.25, -0.8], P);
    // 救生圈装饰
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 8, 20), mat({ color: '#ff6a3d' }));
      ring.position.set(sx * 1.95, DECK + 1.3, -2.75); boat.add(ring);
    }
    // 舱顶灯
    const lamp = new THREE.PointLight('#ffd27a', 4, 10, 2); lamp.position.set(0, DECK + 2.8, -2.4); boat.add(lamp);

    game.spawnItem('crate', new THREE.Vector3(1.8, DECK + 0.4, -0.5));
    game.spawnItem('crate', new THREE.Vector3(-2.0, DECK + 0.4, 3.0));
    game.spawnItem('barrel', new THREE.Vector3(2.0, DECK + 0.5, 3.4));

    // 大浪
    const waveMat = new THREE.MeshStandardMaterial({ color: '#4d8ea6', roughness: 0.2, transparent: true, opacity: 0.85 });
    const waveGeo = new THREE.CylinderGeometry(2.4, 2.4, 22, 24, 1, true, 0, Math.PI);
    waveGeo.rotateX(Math.PI / 2);
    const wave = new THREE.Mesh(waveGeo, waveMat); wave.visible = false; root.add(wave);
    const foam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 22), new THREE.MeshStandardMaterial({ color: '#f2fbff', roughness: 0.9 }));
    wave.add(foam); foam.position.set(0, 2.3, 0);

    // 雨
    const rainN = 1600, rainGeo = new THREE.BufferGeometry();
    const rp = new Float32Array(rainN * 6);
    for (let i = 0; i < rainN; i++) { const x = (Math.random() - 0.5) * 40, y = Math.random() * 20, z = (Math.random() - 0.5) * 40; rp.set([x, y, z, x + 0.12, y - 0.7, z], i * 6); }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#cfe3f2', transparent: true, opacity: 0.45 }));
    rain.frustumCulled = false; root.add(rain);

    const st = { sink: 0, sinkPitch: 0, sd: false, next: 14, phase: 'idle', wt: 0, dir: 1, flash: 0 };
    const pose = new THREE.Object3D();
    const setPose = (t) => {
      const roll = Math.sin(t * 0.55) * 0.075 + Math.sin(t * 1.3) * 0.02;
      const pitch = Math.sin(t * 0.37 + 1) * 0.045 - st.sinkPitch;
      const y = Math.sin(t * 0.8) * 0.18 - st.sink;
      pose.position.set(0, y, 0);
      pose.rotation.set(pitch, 0, roll);
      pose.updateMatrix();
    };
    setPose(0);
    boatBody.setTranslation({ x: 0, y: pose.position.y, z: 0 }, true);
    boatBody.setRotation(pose.quaternion, true);
    boat.position.copy(pose.position); boat.quaternion.copy(pose.quaternion);

    const deckY = (c) => DECK - st.sink;
    return {
      killY: -6,
      water,
      spawns: [[0, DECK, -1.4], [1.8, DECK, 1.0], [-1.8, DECK, 1.2], [0, DECK, 3.6], [2, DECK, -1.8], [-2, DECK, -2.0], [1.4, DECK + 0.8, 6.4], [-1.4, DECK + 0.8, 6.4]],
      weaponSpots: [[0, DECK + 0.8, 0], [2, DECK + 0.8, 2.4], [-2, DECK + 0.8, -1.8], [0, DECK + 1.5, 6.6]],
      bounds: { minX: -3.3, maxX: 3.3, minZ: -7.6, maxZ: 9 },
      cam: { target: [0, DECK, 0], dist: 10.5 },
      update(dt, t) {
        if (st.sd) { st.sink = Math.min(st.sink + dt * 0.045, 2.6); st.sinkPitch = Math.min(st.sinkPitch + dt * 0.006, 0.12); }
        setPose(t + dt);
        boatBody.setNextKinematicTranslation({ x: 0, y: pose.position.y, z: 0 });
        boatBody.setNextKinematicRotation(pose.quaternion);
        // 大浪
        st.next -= dt;
        if (st.phase === 'idle' && st.next <= 0) {
          st.phase = 'warn'; st.wt = 0; st.dir = Math.random() < 0.5 ? 1 : -1;
          game.announce('大浪来袭!', st.dir > 0 ? '浪从右舷打来,躲到船舱背面' : '浪从左舷打来,躲到船舱背面'); game.sfx('horn');
        } else if (st.phase === 'warn') {
          st.wt += dt;
          if (st.wt > 2.6) { st.phase = 'wave'; st.wt = 0; wave.visible = true; game.sfx('splash', { volume: 1.2 }); }
        } else if (st.phase === 'wave') {
          st.wt += dt;
          const x = -st.dir * 14 + st.dir * st.wt * 15;
          wave.position.set(x, DECK - st.sink - 0.6, 0);
          wave.rotation.set(0, 0, st.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
          const push = (bodyList, sc) => {
            for (const b of bodyList) {
              const p = b.translation();
              if (Math.abs(p.x - x) < 1.8 && p.y < DECK - st.sink + 2.4) {
                // 船舱遮挡:浪从侧面来,舱体在 |x|<1.9, z∈[-6,-2.8] 范围后方
                const m = b.mass();
                b.applyImpulse({ x: st.dir * m * 26 * dt * sc, y: m * 8 * dt * sc, z: 0 }, true);
              }
            }
          };
          for (const c of game.creatures) {
            if (!c.alive) continue;
            const p = c.pos;
            const sheltered = p.z < -2.6 && p.z > -6.2 && (st.dir > 0 ? p.x > 1.9 : p.x < -1.9) || (p.y > DECK - st.sink + 2.2);
            if (!sheltered) push(Object.values(c.B), 1);
          }
          for (const it of game.items) if (!it.holder) push([it.body], 0.7);
          if (st.wt > 1.9) { st.phase = 'idle'; wave.visible = false; st.next = st.sd ? 8 : 13 + Math.random() * 4; }
        }
      },
      frame(t, dt) {
        water.update(t);
        boat.position.copy(boatBody.translation());
        boat.quaternion.copy(boatBody.rotation());
        rain.position.y -= dt * 18; if (rain.position.y < -10) rain.position.y += 10;
        st.flash -= dt;
        if (st.flash < -6 && Math.random() < 0.004) { st.flash = 0.18; game.flash(0.7); game.sfx('crack', { volume: 0.6, pitch: 0.4 }); }
        game.setAmbientIntensity?.(0.6 + (st.phase === 'wave' ? 0.4 : 0));
      },
      aiHint(c) {
        if (st.phase !== 'warn' && st.phase !== 'wave') return null;
        if (c.pos.z > 5) return null; // 船首高台上浪打不到
        return { goto: [st.dir > 0 ? 2.35 : -2.35, -4.3], grab: true };
      },
      suddenDeath() { st.sd = true; game.announce('船在下沉!', '船尾正在进水'); game.sfx('alarm'); },
    };
  },
};
