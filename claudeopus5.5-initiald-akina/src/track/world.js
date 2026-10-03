// 赛道世界：地形、路面、路肩、护栏、排水渠、弯道指示牌、路灯、树、山顶与山脚建筑。
// 全部沿样条采样挤出，只建一次；不同章节/赛制只切换调色板与起终点线。
import * as THREE from 'three';
import { toon, canvasTex, addOutline } from '../fx/toon.js';
import { fbm, rng, smoothstep, clamp } from '../core/math.js';

const W = 4.6;

export class World {
  constructor(scene, track) {
    this.scene = scene; this.track = track;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lampMats = [];
    this.poolMats = [];
    this._prepTerrainFn();
    this._terrain();
    this._road();
    this._rails();
    this._gutters();
    this._chevrons();
    this._lamps();
    this._trees();
    this._buildings();
    this._lines();
  }

  // —— 地形高度函数：远处由路面高度反距离插值 + 山坡，近处被路面雕刻
  _prepTerrainFn() {
    const t = this.track, pts = [];
    for (let i = 0; i < t.n; i += 14) pts.push([t.x[i], t.z[i], t.y[i]]);
    this.coarse = pts;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (let i = 0; i < t.n; i++) { minx = Math.min(minx, t.x[i]); maxx = Math.max(maxx, t.x[i]); minz = Math.min(minz, t.z[i]); maxz = Math.max(maxz, t.z[i]); }
    this.bbox = { minx, maxx, minz, maxz };
    // 山体中心：山路部分（非国道）的重心
    let cx = 0, cz = 0, c = 0;
    for (let i = 0; i < t.n; i += 10) if (!t.national[i]) { cx += t.x[i]; cz += t.z[i]; c++; }
    this.peak = { x: cx / c - 60, z: cz / c - 140 };
  }
  idw(x, z) {
    let s = 0, w = 0;
    for (const p of this.coarse) {
      const d2 = (p[0] - x) ** 2 + (p[1] - z) ** 2 + 900;
      const k = 1 / (d2 * Math.sqrt(d2));
      s += p[2] * k; w += k;
    }
    return s / w;
  }
  heightAt(x, z) {
    const near = this.track.nearest(x, z);
    const d = near.d, yr = near.y;
    const nat = this.track.national[near.i];
    const base = this.idw(x, z);
    // 山体：以山顶为中心的大尺度隆起，国道平原逐渐压低
    const pd = Math.hypot(x - this.peak.x, z - this.peak.z);
    const massif = 150 * Math.exp(-(pd * pd) / (2 * 420 * 420));
    const hills = (fbm(x * 0.0045 + 3.1, z * 0.0045 - 1.7, 4) - 0.45) * 90 * smoothstep(30, 260, d);
    const away = Math.max(0, d - W - 3);
    const uphill = base + massif * 0.25 > yr - 1;
    const slope = nat ? 0.06 : uphill ? 0.42 : -0.22;
    let far = base + Math.min(120, away * Math.abs(slope)) * Math.sign(slope) + hills * (nat ? 0.35 : 1) + massif * smoothstep(60, 300, d) * (nat ? 0.3 : 0.8);
    if (!uphill && !nat) far = Math.max(far, yr - 70);
    // 路面走廊（含路肩）整体压到路面以下，8 米网格插值也不会盖住路
    const low = yr - 1.1;
    const t = smoothstep(W + 7, W + 24, d);
    return low + (far - low) * t;
  }

  _terrain() {
    const b = this.bbox, M = 700, step = 8;
    const x0 = b.minx - M, x1 = b.maxx + M, z0 = b.minz - M, z1 = b.maxz + M;
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
    const hs = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const h = this.heightAt(x, z);
      const k = j * nx + i;
      hs[k] = h;
      pos.set([x, h, z], k * 3);
    }
    this.hgrid = { x0, z0, step, nx, nz, hs };
    const grass = new THREE.Color('#5f8a46'), grass2 = new THREE.Color('#3f6b3a'), rock = new THREE.Color('#7d7466'), dirt = new THREE.Color('#9a8a6a'), field = new THREE.Color('#8fae4e');
    const c = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const hx = hs[Math.min(k + 1, j * nx + nx - 1)] - hs[Math.max(k - 1, j * nx)];
      const hz = hs[Math.min(k + nx, (nz - 1) * nx + i)] - hs[Math.max(k - nx, i)];
      const slope = Math.hypot(hx, hz) / (2 * step);
      const x = pos[k * 3], z = pos[k * 3 + 2];
      const n = fbm(x * 0.02, z * 0.02, 3);
      c.copy(grass).lerp(grass2, n);
      const near = this.track.nearest(x, z);
      if (this.track.national[near.i] && near.d > 14 && near.d < 260) c.lerp(field, 0.55 + 0.3 * Math.sin(x * 0.05));
      c.lerp(rock, smoothstep(0.45, 0.9, slope));
      if (near.d < W + 9) c.lerp(dirt, 0.6);
      col.set([c.r, c.g, c.b], k * 3);
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b2 = a + 1, c2 = a + nx, d = c2 + 1;
      idx.push(a, c2, b2, b2, c2, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = toon(0xffffff, { noCache: true });
    mat.vertexColors = true;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.terrain = mesh;
    this.group.add(mesh);
  }

  /** 地形网格高度（双线性），树木摆放用 */
  terrainH(x, z) {
    const g = this.hgrid;
    const fx = (x - g.x0) / g.step, fz = (z - g.z0) / g.step;
    const i = clamp(Math.floor(fx), 0, g.nx - 2), j = clamp(Math.floor(fz), 0, g.nz - 2);
    const u = fx - i, v = fz - j;
    const h = g.hs;
    const a = h[j * g.nx + i], b = h[j * g.nx + i + 1], c = h[(j + 1) * g.nx + i], d = h[(j + 1) * g.nx + i + 1];
    // 与三角剖分一致
    return u + v < 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  _road() {
    const t = this.track, STEP = 2;
    const asphalt = roadTexture(false), national = roadTexture(true);
    const build = (pred, tex) => {
      const pos = [], uv = [], idx = [];
      let row = 0;
      for (let i = 0; i < t.n; i += STEP) {
        if (!pred(i)) { row = 0; continue; }
        const x = t.x[i], y = t.y[i] + 0.02, z = t.z[i], nx = t.tz[i], nz = -t.tx[i];
        pos.push(x - nx * W, y, z - nz * W, x + nx * W, y, z + nz * W);
        uv.push(0, i / 8, 1, i / 8);
        if (row > 0) { const b = pos.length / 3 - 4; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
        row++;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, toon(0xffffff, { map: tex, noCache: true }));
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    this.roadMesh = build((i) => !t.national[i] || (i + 2 < t.n && !t.national[i + 2]), asphalt);
    this.natMesh = build((i) => t.national[i] || (i - 2 >= 0 && t.national[i - 2]), national);
    this.roadMats = [this.roadMesh.material, this.natMesh.material];

    // 路肩：路缘 → 外侧 7 米贴到地形
    const pos = [], col = [], idx = [];
    const gravel = new THREE.Color('#8b8270'), grassC = new THREE.Color('#5b7a42');
    for (const side of [-1, 1]) {
      let row = 0;
      for (let i = 0; i < t.n; i += STEP) {
        const x = t.x[i], y = t.y[i], z = t.z[i], nx = t.tz[i] * side, nz = -t.tx[i] * side;
        const lats = [W, W + 1.1, W + 4, W + 8];
        for (let k = 0; k < lats.length; k++) {
          const L = lats[k];
          const px = x + nx * L, pz = z + nz * L;
          let py = k === 0 ? y + 0.015 : k === 1 ? y - 0.04 : k === 2 ? y - 0.25 : this.heightAt(px, pz) + 0.05;
          pos.push(px, py, pz);
          const c = k < 2 ? gravel : grassC;
          col.push(c.r, c.g, c.b);
        }
        if (row > 0) {
          const b = pos.length / 3 - 8;
          for (let k = 0; k < 3; k++) {
            const a0 = b + k, a1 = b + k + 1, c0 = b + 4 + k, c1 = b + 5 + k;
            if (side > 0) idx.push(a0, c0, a1, a1, c0, c1); else idx.push(a0, a1, c0, a1, c1, c0);
          }
        }
        row++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = toon(0xffffff, { noCache: true }); mat.vertexColors = true; mat.side = THREE.DoubleSide;
    const sh = new THREE.Mesh(geo, mat); sh.receiveShadow = true;
    this.group.add(sh);
  }

  _rails() {
    const t = this.track, STEP = 2, L = W + 0.55;
    const pos = [], col = [], idx = [];
    const white = new THREE.Color('#e9ecef'), shade = new THREE.Color('#9aa3ad');
    for (const side of [-1, 1]) {
      let row = 0;
      for (let i = 0; i < t.n; i += STEP) {
        const x = t.x[i] + t.tz[i] * side * L, z = t.z[i] - t.tx[i] * side * L, y = t.y[i];
        // 波形梁：上沿、中凸、下沿三条线 + 背面
        const prof = [[0, 0.82], [0.07, 0.7], [0.07, 0.56], [0, 0.44]];
        for (const [o, h] of prof) {
          pos.push(x + t.tz[i] * side * o, y + h, z - t.tx[i] * side * o);
          const c = h > 0.6 ? white : shade; col.push(c.r, c.g, c.b);
        }
        if (row > 0) {
          const b = pos.length / 3 - 8;
          for (let k = 0; k < 3; k++) {
            const a0 = b + k, a1 = b + k + 1, c0 = b + 4 + k, c1 = b + 5 + k;
            idx.push(a0, a1, c0, a1, c1, c0);
          }
        }
        row++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = toon(0xffffff, { noCache: true }); mat.vertexColors = true; mat.side = THREE.DoubleSide;
    const rails = new THREE.Mesh(geo, mat); rails.castShadow = true;
    this.group.add(rails);
    // 立柱
    const count = Math.floor(t.n / 4) * 2;
    const post = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.95, 0.12), toon(0x6f7782), count);
    const m = new THREE.Matrix4(); let c = 0;
    for (const side of [-1, 1]) for (let i = 0; i < t.n; i += 4) {
      const x = t.x[i] + t.tz[i] * side * (L + 0.1), z = t.z[i] - t.tx[i] * side * (L + 0.1);
      m.makeTranslation(x, t.y[i] + 0.45, z); post.setMatrixAt(c++, m);
    }
    post.count = c;
    this.group.add(post);
  }

  _gutters() {
    const t = this.track;
    const tex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#3c3f44'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1b1d21'; g.fillRect(10, 0, w - 20, h);
      g.fillStyle = '#9da3aa'; g.fillRect(0, 0, 6, h); g.fillRect(w - 6, 0, 6, h);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      for (let y = 0; y < h; y += 16) g.fillRect(10, y, w - 20, 3);
    }, { repeat: true });
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < t.n; i++) {
      const d = t.ditch[i];
      if (!d) continue;
      const nx = t.tz[i] * d, nz = -t.tx[i] * d, y = t.y[i] + 0.04;
      const a = W - 0.64, b = W - 0.02;
      pos.push(t.x[i] + nx * a, y, t.z[i] + nz * a, t.x[i] + nx * b, y, t.z[i] + nz * b);
      uv.push(0, i / 3, 1, i / 3);
      if (i > 0 && t.ditch[i - 1] === d) {
        const k = pos.length / 3 - 4;
        if (d > 0) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); else idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    const mat = toon(0xffffff, { map: tex, noCache: true });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.side = THREE.DoubleSide;
    this.gutterMesh = new THREE.Mesh(geo, mat);
    this.gutterMesh.receiveShadow = true;
    this.group.add(this.gutterMesh);
  }

  _chevrons() {
    const t = this.track;
    const tex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#d7263d';
      g.beginPath(); g.moveTo(20, 10); g.lineTo(70, 64); g.lineTo(20, 118); g.lineTo(52, 118); g.lineTo(102, 64); g.lineTo(52, 10); g.closePath(); g.fill();
      g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
    });
    const geo = new THREE.PlaneGeometry(0.9, 0.9);
    const mat = toon(0xffffff, { map: tex, side: THREE.DoubleSide, noCache: true });
    const list = [];
    for (const g of t.segs) {
      if (g.t !== 'A' || g.r > 40) continue;
      const { s0, s1 } = t.segS(g);
      for (let s = s0 + 3; s < s1 - 2; s += 7) list.push([s, -Math.sign(g.ang)]);
    }
    const inst = new THREE.InstancedMesh(geo, mat, list.length * 2);
    const post = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5), toon(0x444444), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    let c = 0;
    list.forEach(([s, out], k) => {
      const smp = t.sample(s);
      const L = W + 1.25;
      p.set(smp.x + smp.nx * out * L, smp.y + 1.25, smp.z + smp.nz * out * L);
      const yaw = Math.atan2(smp.nx * out, smp.nz * out);
      e.set(0, yaw, 0); q.setFromEuler(e);
      m.compose(p, q, sc); inst.setMatrixAt(c++, m);
      // 背面画反向箭头
      e.set(0, yaw + Math.PI, 0); q.setFromEuler(e);
      sc.set(-1, 1, 1); m.compose(p, q, sc); inst.setMatrixAt(c++, m); sc.set(1, 1, 1);
      m.makeTranslation(p.x, smp.y + 0.6, p.z); post.setMatrixAt(k, m);
    });
    this.group.add(inst, post);
  }

  _lamps() {
    const t = this.track, spots = [];
    for (const g of t.segs) {
      if (g.t === 'A' && g.r < 40) { const { s0, s1 } = t.segS(g); spots.push([(s0 + s1) / 2, -Math.sign(g.ang)]); spots.push([s0 - 25, -Math.sign(g.ang)]); }
    }
    for (let s = 20; s < 160; s += 45) spots.push([s, 1]);
    // 国道路灯
    for (let s = t.anchor('foot') + 40; s < t.length; s += 90) spots.push([s, -1]);
    const n = spots.length;
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 6.5, 6), toon(0x5d6470), n);
    const head = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.18, 0.35), new THREE.MeshBasicMaterial({ color: 0xfff1c0 }), n);
    const poolGeo = new THREE.CircleGeometry(5.5, 24).rotateX(-Math.PI / 2);
    const poolTex = canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,230,170,0.85)'); gr.addColorStop(0.5, 'rgba(255,210,140,0.35)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, n);
    const m = new THREE.Matrix4();
    spots.forEach(([s, out], k) => {
      const smp = t.sample(s);
      const L = W + 1.6;
      const x = smp.x + smp.nx * out * L, z = smp.z + smp.nz * out * L;
      m.makeTranslation(x, smp.y + 3.25, z); pole.setMatrixAt(k, m);
      const hx = smp.x + smp.nx * out * (L - 0.8), hz = smp.z + smp.nz * out * (L - 0.8);
      m.makeTranslation(hx, smp.y + 6.4, hz); head.setMatrixAt(k, m);
      m.makeTranslation(smp.x + smp.nx * out * (L - 3.5), smp.y + 0.06, smp.z + smp.nz * out * (L - 3.5)); pools.setMatrixAt(k, m);
    });
    this.lampHead = head; this.lampPools = pools;
    this.group.add(pole, head, pools);
  }

  _trees() {
    const t = this.track, r = rng(1986);
    const b = this.bbox, M = 520;
    const items = [];
    let tries = 0;
    while (items.length < 4200 && tries < 60000) {
      tries++;
      const x = b.minx - M + r() * (b.maxx - b.minx + 2 * M), z = b.minz - M + r() * (b.maxz - b.minz + 2 * M);
      const near = t.nearest(x, z);
      if (near.d < W + 9) continue;
      if (t.national[near.i] && near.d < 220 && r() < 0.9) continue; // 国道两侧是田
      if (near.d > 380 && r() < 0.6) continue;
      const y = this.terrainH(x, z);
      items.push([x, y, z, 0.7 + r() * 0.8, r()]);
    }
    const coneG = new THREE.ConeGeometry(2.2, 7, 7); coneG.translate(0, 6, 0);
    const cone2 = new THREE.ConeGeometry(1.7, 5, 7); cone2.translate(0, 9, 0);
    const trunkG = new THREE.CylinderGeometry(0.25, 0.35, 3, 5); trunkG.translate(0, 1.5, 0);
    const darkA = new THREE.InstancedMesh(coneG, toon(0x2f5a3a), items.length);
    const darkB = new THREE.InstancedMesh(cone2, toon(0x3d7044), items.length);
    const trunk = new THREE.InstancedMesh(trunkG, toon(0x5a4030), items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const ca = new THREE.Color();
    items.forEach(([x, y, z, sc, rr], i) => {
      e.set(0, rr * 6.28, 0); q.setFromEuler(e); s.set(sc, sc * (0.85 + rr * 0.4), sc); p.set(x, y - 0.3, z);
      m.compose(p, q, s);
      darkA.setMatrixAt(i, m); darkB.setMatrixAt(i, m); trunk.setMatrixAt(i, m);
      ca.setHSL(0.3 + rr * 0.06, 0.35 + rr * 0.15, 0.5 + rr * 0.15);
      darkA.setColorAt(i, ca); darkB.setColorAt(i, ca);
    });
    darkA.castShadow = true;
    this.group.add(darkA, darkB, trunk);
  }

  _buildings() {
    const t = this.track, r = rng(7);
    const box = (w, h, d, color, x, y, z, yaw = 0, outline = true) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color));
      m.position.set(x, y + h / 2, z); m.rotation.y = yaw; m.castShadow = true; m.receiveShadow = true;
      if (outline) addOutline(m, 0.08);
      this.group.add(m); return m;
    };
    const roof = (w, d, h, color, x, y, z, yaw) => {
      const g = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1); g.rotateY(Math.PI / 4);
      const m = new THREE.Mesh(g, toon(color));
      m.scale.set(w * 0.75, h, d * 0.75); m.position.set(x, y + h / 2, z); m.rotation.y = yaw;
      this.group.add(m); return m;
    };
    // 山顶酒店（终章奔驰从这里出发）与停车场
    const top = t.sample(30);
    const ox = top.x - top.nx * 32, oz = top.z - top.nz * 32;
    const yaw = Math.atan2(top.tx, top.tz);
    const hy = this.terrainH(ox, oz);
    box(34, 12, 16, 0xe8e2d6, ox, hy, oz, yaw);
    box(36, 1.2, 18, 0x7a3b2e, ox, hy + 12, oz, yaw);
    const win = new THREE.Mesh(new THREE.BoxGeometry(30, 7, 16.3), new THREE.MeshBasicMaterial({ color: 0xffe2a0 }));
    win.position.set(ox, hy + 6, oz); win.rotation.y = yaw; win.scale.set(1, 0.12, 1);
    this.hotelWin = win.material;
    this.group.add(win);
    // 山脚小镇：山脚到国道起点两侧的民居
    const foot = t.anchor('foot');
    for (let k = 0; k < 26; k++) {
      const s = foot + 30 + k * 26 + r() * 10;
      const smp = t.sample(s);
      const side = k % 2 ? 1 : -1;
      const L = W + 14 + r() * 16;
      const x = smp.x + smp.nx * side * L, z = smp.z + smp.nz * side * L;
      const y = this.terrainH(x, z);
      const w = 7 + r() * 5, d = 7 + r() * 4, h = 4 + r() * 4;
      const yaw2 = Math.atan2(smp.tx, smp.tz);
      const cols = [0xf0e6d2, 0xd9d2c5, 0xe6d3b3, 0xcfd8dc];
      box(w, h, d, cols[k % 4], x, y - 0.2, z, yaw2);
      roof(w * 1.15, d * 1.15, 2.2 + r(), [0x3b4a6b, 0x6b3b3b, 0x445a3a][k % 3], x, y + h - 0.2, z, yaw2);
    }
    // 国道电线杆
    const n = Math.floor((t.length - foot) / 45);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 9, 6), toon(0x6a5a4a), n);
    const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), toon(0x4a3a2a), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const smp = t.sample(foot + 60 + k * 45);
      const x = smp.x + smp.nx * (W + 5), z = smp.z + smp.nz * (W + 5);
      m.makeTranslation(x, smp.y + 4.5, z); pole.setMatrixAt(k, m);
      e.set(0, Math.atan2(smp.tx, smp.tz) + Math.PI / 2, 0); q.setFromEuler(e); p.set(x, smp.y + 8.4, z);
      m.compose(p, q, sc); arm.setMatrixAt(k, m);
    }
    this.group.add(pole, arm);
  }

  _lines() {
    const tex = canvasTex(256, 32, (g, w, h) => {
      const c = 16;
      for (let i = 0; i < w / c; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f5f5f5'; g.fillRect(i * c, j * c, c, c); }
    });
    const mat = toon(0xffffff, { map: tex, noCache: true });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -3;
    this.startLine = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 1.2).rotateX(-Math.PI / 2), mat);
    this.finishLine = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 1.2).rotateX(-Math.PI / 2), mat);
    // 终点拱门横幅
    const banner = canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = '#c8102e'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.font = 'bold 40px "Microsoft YaHei", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('秋 名 山  FINISH', w / 2, h / 2 + 2);
    });
    this.arch = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 2, 1.3), toon(0xffffff, { map: banner, side: THREE.DoubleSide, noCache: true }));
    bm.position.y = 5.2;
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.8, 6), toon(0x333333));
    const pr = pl.clone();
    pl.position.set(-W - 1, 2.9, 0); pr.position.set(W + 1, 2.9, 0);
    this.arch.add(bm, pl, pr);
    this.group.add(this.startLine, this.finishLine, this.arch);
  }

  setLines(sStart, sFinish, dir) {
    const t = this.track;
    const place = (obj, s, lift) => {
      const smp = t.sample(s);
      obj.position.set(smp.x, smp.y + lift, smp.z);
      obj.rotation.set(0, Math.atan2(smp.nx, smp.nz) + Math.PI / 2, 0);
      obj.visible = true;
    };
    if (sStart == null) { this.startLine.visible = this.finishLine.visible = this.arch.visible = false; return; }
    place(this.startLine, sStart, 0.05);
    place(this.finishLine, sFinish, 0.05);
    place(this.arch, sFinish, 0);
    this.arch.rotation.y += dir > 0 ? 0 : Math.PI;
  }

  applyPalette(pal) {
    const lamp = pal.lamps;
    this.lampHead.material.color.setRGB(0.25 + lamp, 0.22 + lamp * 0.9, 0.18 + lamp * 0.6);
    this.lampPools.visible = lamp > 0.3;
    this.lampPools.material.opacity = lamp;
    this.hotelWin.color.set(lamp > 0.3 ? 0xffd890 : 0x9aa6b2);
    const wet = !!pal.rain;
    for (const m of this.roadMats) m.color.set(wet ? 0x8a949c : 0xffffff);
  }
}

function roadTexture(nationalRoad) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = nationalRoad ? '#4b4d52' : '#46474b'; g.fillRect(0, 0, w, h);
    const r = rng(nationalRoad ? 5 : 9);
    for (let i = 0; i < 2400; i++) { const v = 50 + r() * 50; g.fillStyle = `rgba(${v},${v},${v + 4},0.35)`; g.fillRect(r() * w, r() * h, 2, 2); }
    // 补丁与轮胎痕
    g.fillStyle = 'rgba(20,20,22,0.25)';
    for (let i = 0; i < 5; i++) g.fillRect(r() * w, r() * h, 20 + r() * 50, 30 + r() * 80);
    g.fillStyle = 'rgba(10,10,10,0.2)'; g.fillRect(w * 0.3, 0, 10, h); g.fillRect(w * 0.68, 0, 10, h);
    g.fillStyle = '#e8e8e2'; g.fillRect(8, 0, 7, h); g.fillRect(w - 15, 0, 7, h);
    if (nationalRoad) { g.fillStyle = '#f0f0ea'; g.fillRect(w / 2 - 4, 0, 8, h * 0.5); }
    else { g.fillStyle = '#f2b33d'; g.fillRect(w / 2 - 9, 0, 6, h); g.fillRect(w / 2 + 3, 0, 6, h); }
  }, { repeat: true, aniso: 8 });
}
