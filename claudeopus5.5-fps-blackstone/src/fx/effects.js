// 视觉特效：点粒子（火/烟/尘）、拉伸条带（火花/曳光/能量弹）、贴花、闪光灯池、残骸与弹壳。

import * as THREE from 'three';
import { RNG, clamp } from '../core/util.js';

// ───────────────────────── 精灵贴图 ─────────────────────────
function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function softTexture() {
  const c = canvas(64);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function smokeTexture() {
  const c = canvas(128);
  const g = c.getContext('2d');
  const rng = new RNG(99);
  g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    const a = rng.next() * Math.PI * 2, r = rng.next() * 30;
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
    const rad = 18 + rng.next() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const v = 200 + rng.next() * 55;
    gr.addColorStop(0, `rgba(${v},${v},${v},0.22)`);
    gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  // 圆形遮罩
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function holeTexture() {
  const c = canvas(64);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  const rng = new RNG(5);
  // 崩裂外圈
  for (let i = 0; i < 14; i++) {
    const a = rng.next() * Math.PI * 2;
    g.strokeStyle = 'rgba(30,28,26,0.55)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(32, 32);
    const r = 14 + rng.next() * 16;
    g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    g.stroke();
  }
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 18);
  gr.addColorStop(0, 'rgba(5,5,5,1)');
  gr.addColorStop(0.35, 'rgba(15,14,13,0.95)');
  gr.addColorStop(0.6, 'rgba(60,55,50,0.6)');
  gr.addColorStop(1, 'rgba(60,55,50,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(32, 32, 18, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function scorchTexture() {
  const c = canvas(128);
  const g = c.getContext('2d');
  const rng = new RNG(17);
  for (let i = 0; i < 40; i++) {
    const a = rng.next() * Math.PI * 2, r = rng.next() * 36;
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
    const rad = 10 + rng.next() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(8,7,6,0.35)');
    gr.addColorStop(1, 'rgba(8,7,6,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────────────────── 点粒子 ─────────────────────────
const ptVert = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
attribute float aRot;
uniform float uScale;
varying vec4 vColor;
varying float vRot;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.05), 0.0, 900.0);
  vColor = aColor;
  vRot = aRot;
}`;
const ptFrag = /* glsl */ `
uniform sampler2D uTex;
varying vec4 vColor;
varying float vRot;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  uv = mat2(c, -s, s, c) * uv + 0.5;
  vec4 t = texture2D(uTex, uv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.003) discard;
}`;

class PointParticles {
  constructor(cap, blending, texture) {
    this.cap = cap;
    this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.rot = new Float32Array(cap);
    // CPU 状态
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.s1 = new Float32Array(cap);
    this.c0 = new Float32Array(cap * 4);
    this.c1 = new Float32Array(cap * 4);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.spin = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aColor', this.aCol);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aRot', this.aRot);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: ptVert,
      fragmentShader: ptFrag,
      uniforms: { uTex: { value: texture }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = blending === THREE.AdditiveBlending ? 6 : 5;
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, r1, g1, b1, a1, grav = 0, drag = 0, spin = 0) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1;
    this.c0[i * 4] = r; this.c0[i * 4 + 1] = g; this.c0[i * 4 + 2] = b; this.c0[i * 4 + 3] = a;
    this.c1[i * 4] = r1; this.c1[i * 4 + 1] = g1; this.c1[i * 4 + 2] = b1; this.c1[i * 4 + 3] = a1;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.spin[i] = spin;
    this.rot[i] = Math.random() * 6.283;
  }
  _copy(d, s) {
    const P = this.pos, V = this.vel;
    P[d * 3] = P[s * 3]; P[d * 3 + 1] = P[s * 3 + 1]; P[d * 3 + 2] = P[s * 3 + 2];
    V[d * 3] = V[s * 3]; V[d * 3 + 1] = V[s * 3 + 1]; V[d * 3 + 2] = V[s * 3 + 2];
    this.life[d] = this.life[s]; this.maxLife[d] = this.maxLife[s];
    this.s0[d] = this.s0[s]; this.s1[d] = this.s1[s];
    for (let k = 0; k < 4; k++) { this.c0[d * 4 + k] = this.c0[s * 4 + k]; this.c1[d * 4 + k] = this.c1[s * 4 + k]; }
    this.grav[d] = this.grav[s]; this.drag[d] = this.drag[s]; this.spin[d] = this.spin[s]; this.rot[d] = this.rot[s];
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.n--;
        if (i !== this.n) this._copy(i, this.n);
        continue;
      }
      const t = this.life[i] / this.maxLife[i];
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      for (let k = 0; k < 4; k++) this.col[i * 4 + k] = this.c0[i * 4 + k] + (this.c1[i * 4 + k] - this.c0[i * 4 + k]) * t;
      this.rot[i] += this.spin[i] * dt;
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aRot.needsUpdate = true;
  }
  clear() {
    this.n = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}

// ───────────────────────── 拉伸条带（立即模式） ─────────────────────────
const stVert = /* glsl */ `
attribute vec3 aA;
attribute vec3 aB;
attribute vec4 aColor;
attribute float aWidth;
attribute vec2 corner;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vec4 a = modelViewMatrix * vec4(aA, 1.0);
  vec4 b = modelViewMatrix * vec4(aB, 1.0);
  vec4 mv = mix(a, b, corner.x);
  vec3 dir = b.xyz - a.xyz;
  float dl = length(dir);
  dir = dl > 1e-6 ? dir / dl : vec3(1.0, 0.0, 0.0);
  vec3 cr = cross(dir, mv.xyz);
  float cl = length(cr);
  // 条带正对镜头（与视线平行）时叉积退化，改用屏幕上方向
  vec3 side = cl > 1e-6 ? cr / cl : vec3(0.0, 1.0, 0.0);
  mv.xyz += side * aWidth * corner.y * 0.5;
  // 端点沿方向外扩半个宽度，避免过短时消失
  mv.xyz += dir * aWidth * 0.5 * (corner.x * 2.0 - 1.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vUv = vec2(corner.x, corner.y);
}`;
const stFrag = /* glsl */ `
varying vec4 vColor;
varying vec2 vUv;
void main() {
  float across = clamp(1.0 - abs(vUv.y), 0.0, 1.0); // 插值误差可让其略小于 0，pow(负数) 在 D3D 上为 NaN
  float along = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
  float a = pow(across, 1.6) * mix(0.35, 1.0, along);
  gl_FragColor = vec4(vColor.rgb * (0.6 + 0.6 * across), vColor.a * a);
}`;

export class StreakRenderer {
  constructor(cap) {
    this.cap = cap;
    this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.Float32BufferAttribute([0, -1, 1, -1, 1, 1, 0, 1], 2));
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.A = new Float32Array(cap * 3);
    this.B = new Float32Array(cap * 3);
    this.C = new Float32Array(cap * 4);
    this.Wd = new Float32Array(cap);
    this.aA = new THREE.InstancedBufferAttribute(this.A, 3).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(this.B, 3).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(this.C, 4).setUsage(THREE.DynamicDrawUsage);
    this.aW = new THREE.InstancedBufferAttribute(this.Wd, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aA', this.aA);
    g.setAttribute('aB', this.aB);
    g.setAttribute('aColor', this.aC);
    g.setAttribute('aWidth', this.aW);
    g.instanceCount = 0;
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      vertexShader: stVert,
      fragmentShader: stFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
  }
  begin() {
    this.n = 0;
  }
  push(ax, ay, az, bx, by, bz, r, g, b, a, w) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.A[i * 3] = ax; this.A[i * 3 + 1] = ay; this.A[i * 3 + 2] = az;
    this.B[i * 3] = bx; this.B[i * 3 + 1] = by; this.B[i * 3 + 2] = bz;
    this.C[i * 4] = r; this.C[i * 4 + 1] = g; this.C[i * 4 + 2] = b; this.C[i * 4 + 3] = a;
    this.Wd[i] = w;
  }
  end() {
    this.geo.instanceCount = this.n;
    this.aA.needsUpdate = this.aB.needsUpdate = this.aC.needsUpdate = this.aW.needsUpdate = true;
  }
}

// ───────────────────────── 贴花 ─────────────────────────
class DecalPool {
  constructor(cap, tex, opts = {}) {
    this.cap = cap;
    this.i = 0;
    const m = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      roughness: 0.95,
      metalness: 0,
      ...opts,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.receiveShadow = true;
    this._o = new THREE.Object3D();
  }
  add(x, y, z, nx, ny, nz, size, rot) {
    const o = this._o;
    o.position.set(x + nx * 0.008, y + ny * 0.008, z + nz * 0.008);
    o.lookAt(x + nx, y + ny, z + nz);
    o.rotateZ(rot);
    o.scale.set(size, size, size);
    o.updateMatrix();
    this.mesh.setMatrixAt(this.i, o.matrix);
    this.i = (this.i + 1) % this.cap;
    this.mesh.count = Math.min(this.cap, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.mesh.count = 0;
    this.i = 0;
  }
}

// ───────────────────────── 闪光灯池 ─────────────────────────
class FlashLights {
  constructor(scene, n) {
    this.items = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffaa55, 0, 10, 2);
      scene.add(l);
      this.items.push({ light: l, t: 1, dur: 1, i0: 0 });
    }
    this.next = 0;
  }
  flash(x, y, z, color, intensity, distance, dur) {
    // 选剩余亮度最低的
    let best = this.items[0], bv = Infinity;
    for (const it of this.items) {
      const v = it.t >= it.dur ? -1 : it.i0 * (1 - it.t / it.dur);
      if (v < bv) { bv = v; best = it; }
    }
    best.light.position.set(x, y, z);
    best.light.color.set(color);
    best.light.distance = distance;
    best.i0 = intensity;
    best.t = 0;
    best.dur = dur;
    best.light.intensity = intensity;
  }
  update(dt) {
    for (const it of this.items) {
      if (it.t >= it.dur) {
        it.light.intensity = 0;
        continue;
      }
      it.t += dt;
      const k = Math.max(0, 1 - it.t / it.dur);
      it.light.intensity = it.i0 * k * k;
    }
  }
  clear() {
    for (const it of this.items) { it.t = it.dur; it.light.intensity = 0; }
  }
}

// ───────────────────────── 残骸 ─────────────────────────
class Debris {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.items = [];
    this._n = { x: 0, y: 0, z: 0 };
    this.onBounce = null;
  }
  add(obj, vx, vy, vz, life = 6, radius = 0.15, avx = 0, avy = 0, avz = 0) {
    if (obj.parent !== this.scene) this.scene.attach(obj);
    obj.castShadow = true;
    this.items.push({ obj, vel: new THREE.Vector3(vx, vy, vz), ang: new THREE.Vector3(avx, avy, avz), life, max: life, r: radius, s0: obj.scale.clone(), bounced: 0, rest: 0 });
  }
  update(dt) {
    const n = this._n;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i];
      d.life -= dt;
      if (d.life <= 0) {
        this.scene.remove(d.obj);
        if (d.obj.userData.dispose) d.obj.userData.dispose();
        this.items.splice(i, 1);
        continue;
      }
      if (d.rest < 1) {
        d.vel.y -= 18 * dt;
        const p = d.obj.position;
        p.addScaledVector(d.vel, dt);
        const pen = this.world.sphereCollide(p, d.r, n);
        if (pen > 0) {
          const vn = d.vel.x * n.x + d.vel.y * n.y + d.vel.z * n.z;
          if (vn < 0) {
            d.vel.x -= 1.45 * vn * n.x; d.vel.y -= 1.45 * vn * n.y; d.vel.z -= 1.45 * vn * n.z;
            d.vel.multiplyScalar(0.72);
            d.ang.multiplyScalar(0.6);
            if (-vn > 2 && this.onBounce && d.bounced < 3) this.onBounce(p, -vn);
            d.bounced++;
          }
          if (d.vel.lengthSq() < 0.08 && n.y > 0.6) d.rest += dt * 4;
        }
        d.obj.rotation.x += d.ang.x * dt;
        d.obj.rotation.y += d.ang.y * dt;
        d.obj.rotation.z += d.ang.z * dt;
      }
      if (d.life < 1) {
        const k = Math.max(0.01, d.life);
        d.obj.scale.copy(d.s0).multiplyScalar(k);
      }
    }
  }
  clear() {
    for (const d of this.items) {
      this.scene.remove(d.obj);
      if (d.obj.userData.dispose) d.obj.userData.dispose();
    }
    this.items.length = 0;
  }
}

// ───────────────────────── 弹壳 ─────────────────────────
class Casings {
  constructor(scene, world, cap = 48) {
    this.world = world;
    this.cap = cap;
    const g = new THREE.CylinderGeometry(0.0055, 0.0055, 0.032, 6);
    g.rotateZ(Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 0.95, roughness: 0.3 });
    this.mesh = new THREE.InstancedMesh(g, m, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.items = [];
    this.i = 0;
    this._o = new THREE.Object3D();
    this._n = { x: 0, y: 0, z: 0 };
    this.onTink = null;
  }
  setColor(c) {
    this.mesh.material.color.set(c);
  }
  spawn(x, y, z, vx, vy, vz, shell = false) {
    const it = { p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(vx, vy, vz), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), av: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30), life: 3.2, bounces: 0, s: shell ? 2.2 : 1 };
    if (this.items.length < this.cap) this.items.push(it);
    else {
      this.items[this.i] = it;
      this.i = (this.i + 1) % this.cap;
    }
  }
  update(dt) {
    const o = this._o, n = this._n;
    let k = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      if (it.bounces < 6) {
        it.v.y -= 16 * dt;
        it.p.addScaledVector(it.v, dt);
        const pen = this.world.sphereCollide(it.p, 0.012, n);
        if (pen > 0) {
          const vn = it.v.dot(n);
          if (vn < 0) {
            it.v.addScaledVector(n, -1.5 * vn).multiplyScalar(0.55);
            it.av.multiplyScalar(0.5);
            if (-vn > 0.8 && this.onTink && it.bounces < 2) this.onTink(it.p, it.s > 1);
            it.bounces++;
            if (it.v.lengthSq() < 0.05) it.bounces = 6;
          }
        }
        it.r.x += it.av.x * dt;
        it.r.y += it.av.y * dt;
        it.r.z += it.av.z * dt;
      }
      o.position.copy(it.p);
      o.rotation.copy(it.r);
      const s = it.s * Math.min(1, it.life * 2);
      o.scale.set(s, s, s);
      o.updateMatrix();
      this.mesh.setMatrixAt(k++, o.matrix);
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}

// ───────────────────────── 门面 ─────────────────────────
export class Effects {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.rng = new RNG(4242);
    this.glow = new PointParticles(5000, THREE.AdditiveBlending, softTexture());
    this.smoke = new PointParticles(2200, THREE.NormalBlending, smokeTexture());
    this.streaks = new StreakRenderer(4096);
    scene.add(this.glow.points, this.smoke.points, this.streaks.mesh);
    this.holes = new DecalPool(360, holeTexture());
    this.scorch = new DecalPool(48, scorchTexture(), { opacity: 0.9 });
    scene.add(this.holes.mesh, this.scorch.mesh);
    this.flashes = new FlashLights(scene, 3);
    this.debris = new Debris(scene, world);
    this.casings = new Casings(scene, world);
    // CPU 火花（物理）
    this.sparks = [];
    this.chunkGeo = new THREE.BoxGeometry(1, 1, 1);
    this.chunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.9, metalness: 0.3 });
  }

  setViewport(height, fovDeg) {
    const s = height / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.glow.mat.uniforms.uScale.value = s;
    this.smoke.mat.uniforms.uScale.value = s;
  }

  spark(x, y, z, vx, vy, vz, life, r, g, b, w = 0.02, len = 0.04, grav = 9) {
    if (this.sparks.length > 900) return;
    this.sparks.push({ x, y, z, vx, vy, vz, life, max: life, r, g, b, w, len, grav });
  }

  /** 每帧开始：清空条带缓冲 */
  beginFrame() {
    this.streaks.begin();
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.flashes.update(dt);
    this.debris.update(dt);
    this.casings.update(dt);
    const S = this.streaks;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.sparks[i] = this.sparks[this.sparks.length - 1];
        this.sparks.pop();
        continue;
      }
      s.vy -= s.grav * dt;
      const dr = Math.exp(-1.5 * dt);
      s.vx *= dr; s.vy *= dr; s.vz *= dr;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      if (s.y < 0.01) {
        s.y = 0.01;
        s.vy = -s.vy * 0.35;
        s.vx *= 0.6;
        s.vz *= 0.6;
      }
      const k = s.life / s.max;
      S.push(s.x, s.y, s.z, s.x - s.vx * s.len, s.y - s.vy * s.len, s.z - s.vz * s.len, s.r * k, s.g * k, s.b * k, 1, s.w);
    }
  }

  endFrame() {
    this.streaks.end();
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    this.holes.clear();
    this.scorch.clear();
    this.flashes.clear();
    this.debris.clear();
    this.casings.clear();
    this.sparks.length = 0;
  }

  // —— 高层效果 ——
  /** 子弹命中环境 */
  impact(x, y, z, nx, ny, nz, surface, decal = true) {
    const R = this.rng;
    const metal = surface === 'metal';
    const dirt = surface === 'dirt' || surface === 'ground';
    const wood = surface === 'wood';
    const nSpark = metal ? 9 : dirt || wood ? 0 : 5;
    for (let i = 0; i < nSpark; i++) {
      const sp = 3 + R.next() * 7;
      this.spark(x, y, z,
        (nx + (R.next() - 0.5) * 1.6) * sp, (ny + (R.next() - 0.3) * 1.4) * sp, (nz + (R.next() - 0.5) * 1.6) * sp,
        0.12 + R.next() * 0.22, 3.2, 2.0, 0.8, 0.018, 0.03);
    }
    // 粉尘
    const dc = dirt ? [0.42, 0.36, 0.28] : wood ? [0.4, 0.32, 0.22] : metal ? [0.3, 0.3, 0.3] : [0.55, 0.53, 0.5];
    const nd = dirt ? 4 : metal ? 1 : 3;
    for (let i = 0; i < nd; i++) {
      const sp = 0.6 + R.next() * 1.6;
      this.smoke.spawn(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05,
        nx * sp + (R.next() - 0.5) * 0.6, ny * sp + R.next() * 0.5, nz * sp + (R.next() - 0.5) * 0.6,
        0.6 + R.next() * 0.7, 0.12, 0.7 + R.next() * 0.4, dc[0], dc[1], dc[2], 0.55, dc[0], dc[1], dc[2], 0, 0.5, 3.5, (R.next() - 0.5) * 2);
    }
    // 碎屑
    const nc = dirt ? 6 : 4;
    for (let i = 0; i < nc; i++) {
      const sp = 2 + R.next() * 4;
      this.smoke.spawn(x, y, z, (nx + (R.next() - 0.5)) * sp, (ny + R.next() * 0.8) * sp, (nz + (R.next() - 0.5)) * sp,
        0.5 + R.next() * 0.4, 0.035, 0.03, dc[0] * 0.5, dc[1] * 0.5, dc[2] * 0.5, 1, dc[0] * 0.5, dc[1] * 0.5, dc[2] * 0.5, 1, 12, 0.5, 8);
    }
    if (metal) this.glow.spawn(x + nx * 0.03, y + ny * 0.03, z + nz * 0.03, 0, 0, 0, 0.06, 0.25, 0.1, 4, 2.5, 1.2, 1, 2, 1, 0.4, 0);
    if (decal) this.holes.add(x, y, z, nx, ny, nz, dirt ? 0.16 : 0.11 + R.next() * 0.04, R.next() * 6.28);
  }

  /** 子弹命中机器人 */
  robotHit(x, y, z, nx, ny, nz, heavy = false) {
    const R = this.rng;
    const n = heavy ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const sp = 3 + R.next() * 8;
      const blue = R.next() < 0.35;
      this.spark(x, y, z,
        (nx + (R.next() - 0.5) * 2) * sp, (ny + (R.next() - 0.2) * 2) * sp, (nz + (R.next() - 0.5) * 2) * sp,
        0.1 + R.next() * 0.25, blue ? 1.2 : 4, blue ? 2.6 : 2.1, blue ? 4.5 : 0.6, blue ? 0.014 : 0.02, 0.035);
    }
    this.glow.spawn(x, y, z, 0, 0, 0, 0.07, 0.35, 0.15, 5, 3, 1.4, 1, 3, 1.5, 0.5, 0);
    this.smoke.spawn(x, y, z, nx * 0.8, 0.6, nz * 0.8, 0.7, 0.15, 0.6, 0.18, 0.18, 0.2, 0.5, 0.25, 0.25, 0.26, 0, -0.5, 2);
  }

  muzzle(x, y, z, color = 0xffb060, intensity = 30) {
    this.flashes.flash(x, y, z, color, intensity, 9, 0.06);
  }

  smokePuff(x, y, z, size = 0.35, a = 0.35) {
    const R = this.rng;
    this.smoke.spawn(x, y, z, (R.next() - 0.5) * 0.4, 0.4 + R.next() * 0.3, (R.next() - 0.5) * 0.4, 0.9 + R.next() * 0.6, size * 0.5, size * 2.2, 0.6, 0.6, 0.6, a, 0.55, 0.55, 0.55, 0, -0.3, 1.5, (R.next() - 0.5));
  }

  trail(x, y, z, glowColor = [3, 1.5, 0.5]) {
    const R = this.rng;
    this.smoke.spawn(x, y, z, (R.next() - 0.5) * 0.5, (R.next() - 0.2) * 0.5, (R.next() - 0.5) * 0.5, 1.4 + R.next() * 0.8, 0.25, 1.2, 0.55, 0.55, 0.56, 0.45, 0.5, 0.5, 0.5, 0, -0.4, 1.2, (R.next() - 0.5));
    this.glow.spawn(x, y, z, 0, 0, 0, 0.12, 0.35, 0.1, glowColor[0], glowColor[1], glowColor[2], 1, 1, 0.3, 0.1, 0);
  }

  fire(x, y, z, k = 1) {
    const R = this.rng;
    this.glow.spawn(x + (R.next() - 0.5) * 0.3 * k, y, z + (R.next() - 0.5) * 0.3 * k, (R.next() - 0.5) * 0.4, 1.5 + R.next() * 1.5, (R.next() - 0.5) * 0.4,
      0.35 + R.next() * 0.3, 0.45 * k, 0.15 * k, 3.5, 1.4, 0.35, 0.9, 1.2, 0.2, 0.05, 0, -1, 1.5, (R.next() - 0.5) * 3);
    if (R.next() < 0.3) this.smoke.spawn(x, y + 0.6 * k, z, (R.next() - 0.5) * 0.3, 1.2, (R.next() - 0.5) * 0.3, 1.8, 0.4 * k, 1.6 * k, 0.12, 0.11, 0.1, 0.5, 0.2, 0.2, 0.2, 0, -0.5, 0.8, 0.5);
  }

  electric(x, y, z, n = 10) {
    const R = this.rng;
    for (let i = 0; i < n; i++) {
      const sp = 2 + R.next() * 6;
      this.spark(x, y, z, (R.next() - 0.5) * sp, (R.next() - 0.2) * sp, (R.next() - 0.5) * sp, 0.15 + R.next() * 0.2, 1.0, 2.4, 5, 0.012, 0.05, 2);
    }
    this.glow.spawn(x, y, z, 0, 0, 0, 0.12, 0.6, 0.2, 1.5, 3, 5, 1, 0.5, 1, 2, 0);
  }

  /** 爆炸：power≈1 为手雷/油桶 */
  explosion(x, y, z, power = 1, opts = {}) {
    const R = this.rng;
    this.flashes.flash(x, y + 0.8, z, 0xffa04a, 900 * power, 22 * Math.sqrt(power), 0.45);
    for (let i = 0; i < 4; i++) {
      this.glow.spawn(x, y + 0.4, z, 0, 0.5, 0, 0.16, 1.2 * power, 3.4 * power, 8, 6, 4, 1, 4, 2, 0.6, 0);
    }
    for (let i = 0; i < 30 * power; i++) {
      const a = R.next() * Math.PI * 2, e = R.next() * 1.2;
      const sp = (3 + R.next() * 6) * Math.sqrt(power);
      const vx = Math.cos(a) * Math.cos(e) * sp, vy = Math.sin(e) * sp + 1.5, vz = Math.sin(a) * Math.cos(e) * sp;
      this.glow.spawn(x, y + 0.3, z, vx, vy, vz, 0.45 + R.next() * 0.5, 0.9 * power, 2.6 * power, 5, 2.4, 0.7, 1, 1.2, 0.25, 0.05, 0, -2, 3.5, (R.next() - 0.5) * 3);
    }
    for (let i = 0; i < 22 * power; i++) {
      const a = R.next() * Math.PI * 2;
      const sp = 1 + R.next() * 3;
      this.smoke.spawn(x + Math.cos(a) * 0.5, y + 0.5 + R.next(), z + Math.sin(a) * 0.5, Math.cos(a) * sp, 1.5 + R.next() * 2.5, Math.sin(a) * sp,
        2.4 + R.next() * 2.2, 1.2 * power, 5.5 * power, 0.12, 0.1, 0.09, 0.85, 0.32, 0.31, 0.3, 0, -0.2, 1.1, (R.next() - 0.5) * 0.6);
    }
    for (let i = 0; i < 46 * power; i++) {
      const sp = 6 + R.next() * 16;
      const a = R.next() * Math.PI * 2, e = R.next() * 1.4 - 0.2;
      this.spark(x, y + 0.3, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp, 0.4 + R.next() * 0.9, 4, 2.2, 0.6, 0.03, 0.03, 12);
    }
    const chunks = opts.chunks ?? Math.round(6 * power);
    for (let i = 0; i < chunks; i++) {
      const m = new THREE.Mesh(this.chunkGeo, opts.chunkMat || this.chunkMat);
      const s = 0.06 + R.next() * 0.16;
      m.scale.set(s, s * (0.5 + R.next()), s * (0.6 + R.next()));
      m.position.set(x + (R.next() - 0.5) * 0.5, y + 0.4, z + (R.next() - 0.5) * 0.5);
      this.scene.add(m);
      const a = R.next() * Math.PI * 2, sp = 3 + R.next() * 8;
      this.debris.add(m, Math.cos(a) * sp, 4 + R.next() * 8, Math.sin(a) * sp, 4 + R.next() * 3, s * 0.6, R.next() * 20, R.next() * 20, R.next() * 20);
    }
    if (y < 1.5) this.scorch.add(x, 0.01, z, 0, 1, 0, 3.2 * Math.sqrt(power), R.next() * 6.28);
  }
}
