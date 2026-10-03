// 表现层粒子：夜赛尾灯光轨、轮胎烟、爆缸黑烟、雨、2D 速度线。
import * as THREE from 'three';
import { canvasTex } from './toon.js';

const TRAIL_N = 40;

/** 尾灯光轨：每辆车两条竖向光带，按车辆配色（86 白、GT-R 红、FC 冰蓝、EVO 紫、奔驰金） */
export class Trails {
  constructor(scene) { this.scene = scene; this.list = []; this.enabled = false; this._v = new THREE.Vector3(); }
  add(racer, model) {
    const color = new THREE.Color(racer.spec.trail);
    const make = () => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(TRAIL_N * 2 * 3), a = new Float32Array(TRAIL_N * 2);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('alpha', new THREE.BufferAttribute(a, 1));
      const idx = [];
      for (let i = 0; i < TRAIL_N - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      geo.setIndex(idx);
      const mat = new THREE.ShaderMaterial({
        uniforms: { color: { value: color } },
        vertexShader: 'attribute float alpha; varying float va; void main(){ va = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 color; varying float va; void main(){ gl_FragColor = vec4(color * 1.4, va); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return { mesh, pts: [] };
    };
    this.list.push({ racer, model, L: make(), R: make() });
  }
  clear() { for (const t of this.list) { this.scene.remove(t.L.mesh, t.R.mesh); t.L.mesh.geometry.dispose(); t.R.mesh.geometry.dispose(); } this.list = []; }
  update() {
    for (const t of this.list) {
      for (const [side, tr] of [[1, t.L], [-1, t.R]]) {
        tr.mesh.visible = this.enabled;
        if (!this.enabled) { tr.pts.length = 0; continue; }
        const p = t.model.tailPos(this._v, side).clone();
        const last = tr.pts[0];
        if (!last || last.distanceToSquared(p) > 0.5) { tr.pts.unshift(p); if (tr.pts.length > TRAIL_N) tr.pts.pop(); }
        else tr.pts[0].copy(p);
        const pos = tr.mesh.geometry.attributes.position.array, al = tr.mesh.geometry.attributes.alpha.array;
        const n = tr.pts.length;
        for (let i = 0; i < TRAIL_N; i++) {
          const q = tr.pts[Math.min(i, n - 1)] || p;
          const f = i / (TRAIL_N - 1);
          const h = 0.07 * (1 - f * 0.6);
          pos.set([q.x, q.y + h, q.z, q.x, q.y - h, q.z], i * 6);
          const a = i < n && i > 1 ? (1 - f) * (1 - f) * 0.6 : 0;
          al[i * 2] = a; al[i * 2 + 1] = a;
        }
        tr.mesh.geometry.attributes.position.needsUpdate = true;
        tr.mesh.geometry.attributes.alpha.needsUpdate = true;
      }
    }
  }
}

const SMOKE_N = 420;
export class Smoke {
  constructor(scene) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(SMOKE_N * 3); this.size = new Float32Array(SMOKE_N); this.alpha = new Float32Array(SMOKE_N); this.dark = new Float32Array(SMOKE_N);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('dark', new THREE.BufferAttribute(this.dark, 1));
    const tex = canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, tint: { value: new THREE.Color(0xdfe3ea) }, scale: { value: innerHeight / 2 } },
      vertexShader: `attribute float size; attribute float alpha; attribute float dark; varying float va; varying float vd;
        uniform float scale;
        void main(){ va = alpha; vd = dark; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 tint; varying float va; varying float vd;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * va; if (a < 0.01) discard;
          // 赛璐璐：两阶明暗
          float lit = step(0.45, t.a + gl_PointCoord.y * 0.25);
          vec3 c = mix(tint * 0.78, tint, lit); c = mix(c, vec3(0.08), vd);
          gl_FragColor = vec4(c, a); }`,
      transparent: true, depthWrite: false
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.parts = Array.from({ length: SMOKE_N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 1, dark: 0 }));
    this.head = 0; this.acc = 0; this._v = new THREE.Vector3();
  }
  setTint(c) { this.mat.uniforms.tint.value.set(c); }
  spawn(x, y, z, vx, vy, vz, s0, life, dark = 0) {
    const p = this.parts[this.head]; this.head = (this.head + 1) % SMOKE_N;
    Object.assign(p, { x, y, z, vx, vy, vz, s0, life, max: life, dark });
  }
  emitFrom(model, sim, dt, k) {
    this.acc += dt * 34 * k;
    while (this.acc > 1) {
      this.acc -= 1;
      for (const side of [1, -1]) {
        const v = this._v.set(-model.B.wb / 2, 0.25, side * (model.B.wid / 2 - 0.1));
        model.group.localToWorld(v);
        this.spawn(v.x, v.y, v.z, (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 1.5, 1.4 + Math.random(), 1.1 + Math.random() * 0.6);
      }
    }
  }
  engine(model, dt) {
    if (Math.random() > dt * 40) return;
    const v = this._v.set(model.B.body[1][0] - 0.5, 0.9, 0);
    model.group.localToWorld(v);
    this.spawn(v.x, v.y, v.z, (Math.random() - 0.5), 1.8 + Math.random(), (Math.random() - 0.5), 1.2, 2.2, 1);
  }
  clear() { for (const p of this.parts) p.life = 0; }
  update(dt) {
    for (let i = 0; i < SMOKE_N; i++) {
      const p = this.parts[i];
      if (p.life > 0) {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 0.98;
        const f = 1 - p.life / p.max;
        this.pos.set([p.x, p.y, p.z], i * 3);
        this.size[i] = p.s0 * (1 + f * 2.2);
        this.alpha[i] = Math.max(0, (1 - f) * 0.38 * Math.min(1, f * 8));
        this.dark[i] = p.dark;
      } else this.alpha[i] = 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.size.needsUpdate = g.attributes.alpha.needsUpdate = g.attributes.dark.needsUpdate = true;
  }
}

const RAIN_N = 2600;
export class Rain {
  constructor(scene) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(RAIN_N * 6);
    this.seed = new Float32Array(RAIN_N * 3);
    for (let i = 0; i < RAIN_N; i++) this.seed.set([Math.random(), Math.random(), Math.random()], i * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xaebcc4, transparent: true, opacity: 0.45 }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.t = 0;
  }
  setActive(on) { this.lines.visible = on; }
  update(dt, cam) {
    if (!this.lines.visible) return;
    this.t += dt;
    const R = 34, H = 26;
    for (let i = 0; i < RAIN_N; i++) {
      const sx = this.seed[i * 3], sy = this.seed[i * 3 + 1], sz = this.seed[i * 3 + 2];
      const x = cam.x + (((sx * 2 * R - cam.x) % (2 * R)) + 2 * R) % (2 * R) - R;
      const z = cam.z + (((sz * 2 * R - cam.z) % (2 * R)) + 2 * R) % (2 * R) - R;
      const y = cam.y + H / 2 - (((sy * H + this.t * 22) % H));
      this.pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.03], i * 6);
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

/** 2D 速度线（漫画感），强度 0..1 */
export class SpeedLines {
  constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.k = 0; this.focus = 0; }
  resize(w, h) { const dpr = Math.min(devicePixelRatio, 1.5); this.c.width = w * dpr; this.c.height = h * dpr; this.dpr = dpr; }
  update(dt, k) {
    this.k += (k - this.k) * Math.min(1, dt * 4);
    const g = this.g, w = this.c.width, h = this.c.height;
    g.clearRect(0, 0, w, h);
    const total = Math.max(this.k, this.focus);
    if (total < 0.03) return;
    const cx = w / 2, cy = h * 0.47, R = Math.hypot(w, h) / 2;
    const n = Math.floor(30 + 50 * total);
    g.fillStyle = this.focus > 0 ? 'rgba(0,0,0,0.75)' : `rgba(255,255,255,${0.12 + 0.3 * this.k})`;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const inner = R * (this.focus > 0 ? 0.42 : 0.55 + Math.random() * 0.25);
      const wdt = (this.focus > 0 ? 0.012 : 0.004) * (0.5 + Math.random());
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      g.lineTo(cx + Math.cos(a - wdt) * R, cy + Math.sin(a - wdt) * R);
      g.lineTo(cx + Math.cos(a + wdt) * R, cy + Math.sin(a + wdt) * R);
      g.closePath(); g.fill();
    }
    if (this.focus > 0) this.focus = Math.max(0, this.focus - dt);
  }
  /** 集中线（关键瞬间） */
  burst(t = 0.8) { this.focus = t; }
}
