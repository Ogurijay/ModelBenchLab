// 地图:霓虹天台 —— 城市楼顶,矮护栏有缺口;中后期绿色毒雾从外圈收缩。
import * as THREE from 'three';
import { TEX, mat, makeSky } from '../mapkit.js';

export default {
  id: 'rooftop',
  name: '霓虹天台',
  desc: '黄昏的城市楼顶。矮护栏到处是缺口,45 秒后绿色毒雾从外圈收拢,困在雾里晕倒就出局。',
  ambient: 'city',
  light: { sunDir: [-0.6, 0.55, 0.45], sun: '#ffc79a', sunI: 2.6, sky: '#b4c6ff', ground: '#6a4b52', hemiI: 1.1, fog: ['#d9a08f', 30, 140], exposure: 1.0 },
  build(game, B) {
    const root = B.root;
    makeSky(root, { top: '#3f5ea8', horizon: '#ffb48c', bottom: '#6e5a73', sunDir: new THREE.Vector3(-0.6, 0.12, 0.45), sun: '#ffd2a0' });
    B.city({ count: 70, inner: 24, outer: 130, minH: 14, maxH: 75, baseY: -46, seed: 7 });

    const S = 8; // 半边长
    const floor = mat({ map: TEX.tiles('#d4cbbd', '#8f877c', 4, [8, 8]), roughness: 0.85 });
    B.box(S * 2, 1, S * 2, [0, -0.5, 0], floor);
    // 楼体
    const wallTex = TEX.windows('#4b4561', '#ffcf86', [4, 10]);
    const bld = mat({ map: wallTex, emissive: '#ffffff', emissiveMap: wallTex, emissiveIntensity: 0.3 });
    B.box(S * 2 - 0.2, 44, S * 2 - 0.2, [0, -23, 0], bld, { noGrab: true });
    // 护栏(带缺口)
    const par = mat({ map: TEX.concrete('#b7aea2', [4, 0.3]) });
    const wall = (x1, z1, x2, z2) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const along = Math.abs(x2 - x1) > Math.abs(z2 - z1);
      B.box(along ? len : 0.35, 0.55, along ? 0.35 : len, [cx, 0.275, cz], par);
    };
    // 北
    wall(-S, -S, -1.8, -S); wall(2.2, -S, S, -S);
    // 东
    wall(S, -S, S, -2.5); wall(S, 0, S, 4); wall(S, 6.2, S, S);
    // 南(霓虹招牌下)
    wall(-S, S, -4.5, S); wall(-1.5, S, 1.5, S); wall(4.5, S, S, S);
    // 西
    wall(-S, -S, -S, -3); wall(-S, 2, -S, S);

    // 楼梯间小屋
    const hut = mat({ map: TEX.concrete('#c9b49a', [2, 2]) });
    B.box(3, 2.6, 3, [-4.6, 1.3, -4.6], hut);
    B.box(3.4, 0.2, 3.4, [-4.6, 2.7, -4.6], mat({ color: '#6b4f3f' }));
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.9), mat({ color: '#3f6f8f', roughness: 0.4 }));
    door.position.set(-4.6, 0.95, -3.09); root.add(door);

    // 水塔
    const wood = mat({ map: TEX.planks('#8c5a36', [2, 2]) });
    for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) B.cyl(0.09, 0.09, 2.2, [4.8 + dx, 1.1, -4.8 + dz], mat({ color: '#4a4a52', metalness: 0.5, roughness: 0.5 }));
    B.box(2.2, 0.15, 2.2, [4.8, 2.25, -4.8], wood);
    B.cyl(1.15, 1.15, 1.9, [4.8, 3.3, -4.8], wood, { seg: 24 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.8, 24), mat({ color: '#5a3d2a' }));
    roof.position.set(4.8, 4.65, -4.8); roof.castShadow = true; root.add(roof);
    B.solid(1.6, 0.6, 1.6, [4.8, 4.5, -4.8]);

    // 空调外机
    const ac = mat({ color: '#e6e6e0', roughness: 0.5 });
    for (const [x, z, r] of [[-5.5, 3.5, 0], [-5.5, 5.2, 0], [1.5, -5.6, 0.0], [5.6, 2.2, Math.PI / 2]]) {
      const m = B.box(1.3, 0.95, 0.75, [x, 0.475, z], ac, { rot: [0, r, 0] });
      const grill = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), mat({ color: '#45464c' }));
      grill.position.set(0.2, 0.05, 0.38); m.add(grill);
    }
    // 霓虹招牌
    const sign = mat({ map: TEX.sign('派对火锅'), emissive: '#ffffff', emissiveMap: TEX.sign('派对火锅'), emissiveIntensity: 0.9 });
    const metal = mat({ color: '#3b3d46', metalness: 0.6, roughness: 0.4 });
    B.box(0.15, 3.5, 0.15, [-2.8, 1.75, S - 0.2], metal);
    B.box(0.15, 3.5, 0.15, [2.8, 1.75, S - 0.2], metal);
    const board = B.box(6.2, 1.7, 0.25, [0, 3.25, S - 0.2], [metal, metal, metal, metal, sign, sign]);
    const neon = new THREE.PointLight('#ff4f8a', 6, 9, 2);
    neon.position.set(0, 3.2, S - 1.2); root.add(neon);
    // 盆栽 & 灯串装饰
    const pot = mat({ color: '#b5643c' }), leaf = mat({ color: '#4f9b48' });
    for (const [x, z] of [[-7, -7], [7, 7], [-7, 7]]) {
      B.cyl(0.35, 0.28, 0.6, [x, 0.3, z], pot);
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), leaf);
      bush.position.set(x, 0.95, z); bush.castShadow = true; root.add(bush);
    }
    const bulbs = new THREE.Group();
    const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe7a3' });
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, x = -S + t * 2 * S, y = 3.2 - Math.sin(t * Math.PI) * 0.8;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bulbMat); b.position.set(x, y, -S + 0.2 + t * 4); bulbs.add(b);
    }
    root.add(bulbs);

    // 道具
    game.spawnItem('crate', new THREE.Vector3(2.5, 0.4, 3));
    game.spawnItem('crate', new THREE.Vector3(-1.5, 0.4, -6.5));
    game.spawnItem('barrel', new THREE.Vector3(-6.4, 0.45, 0.4));

    // 毒雾
    const gasMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uT; varying vec2 vUv; varying vec3 vP;
        float n(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        float sn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(n(i),n(i+vec2(1,0)),f.x), mix(n(i+vec2(0,1)),n(i+vec2(1,1)),f.x), f.y); }
        void main(){ float a = sn(vec2(vUv.x*40.0 + uT*0.6, vUv.y*4.0 - uT*0.4)) * 0.6 + sn(vec2(vUv.x*90.0 - uT, vUv.y*9.0)) * 0.4;
          float fade = smoothstep(1.0, 0.25, vUv.y);
          gl_FragColor = vec4(mix(vec3(0.45,0.85,0.25), vec3(0.75,1.0,0.4), a), (0.35 + a*0.35) * fade); }`,
    });
    const gas = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 7, 64, 1, true), gasMat);
    gas.position.y = 2.5; gas.visible = false; root.add(gas);
    const groundGas = new THREE.Mesh(new THREE.RingGeometry(1, 40, 64, 1), new THREE.MeshBasicMaterial({ color: '#8fe055', transparent: true, opacity: 0.35, depthWrite: false }));
    groundGas.rotation.x = -Math.PI / 2; groundGas.position.y = 0.6; groundGas.visible = false; root.add(groundGas);

    const state = { r: 16, start: 45, sd: false };
    return {
      killY: -7,
      spawns: [[0, 0, -4], [4, 0, 0], [0, 0, 4], [-4, 0, 0], [3, 0, -3.2], [3, 0, 3.2], [-3, 0, 3.2], [-3, 0, -3.2]],
      weaponSpots: [[0, 0.5, 0], [-3, 0.5, 2], [3.2, 0.5, -2], [-2, 0.5, -3], [2, 0.5, 5]],
      bounds: { minX: -S, maxX: S, minZ: -S, maxZ: S },
      cam: { target: [0, 0, 0], dist: 10 },
      get gasR() { return state.r; },
      update(dt, t) {
        const startAt = state.sd ? Math.min(state.start, t) : state.start;
        if (t > startAt) {
          const target = 2.6;
          state.r = Math.max(target, state.r - dt * (state.sd ? 0.35 : 0.2));
          if (!this.gasOn) { this.gasOn = true; game.announce('毒雾来袭!', '往中间跑'); game.sfx('gas'); }
        }
        if (this.gasOn) {
          for (const c of game.creatures) {
            if (!c.alive) continue;
            const d = Math.hypot(c.pos.x, c.pos.z);
            if (d > state.r) {
              c.damage(20 * dt, null, 'gas');
              if (c.ko) { c.gasT = (c.gasT || 0) + dt; if (c.gasT > 2.5) c.eliminate('gas'); }
            } else c.gasT = 0;
          }
        }
      },
      frame(t) {
        gasMat.uniforms.uT.value = t;
        const vis = state.r < 15.5;
        gas.visible = groundGas.visible = vis;
        gas.scale.set(state.r, 1, state.r);
        groundGas.scale.set(state.r, state.r, 1);
        bulbs.children.forEach((b, i) => { b.visible = Math.sin(t * 3 + i) > -0.6; });
        neon.intensity = 5 + Math.sin(t * 11) * 0.6 + (Math.random() < 0.01 ? -4 : 0);
      },
      aiHint(c) {
        if (!this.gasOn) return null;
        if (Math.hypot(c.pos.x, c.pos.z) > state.r - 1.4) return { goto: [0, 0] };
        return null;
      },
      suddenDeath() { state.sd = true; },
    };
  },
};
