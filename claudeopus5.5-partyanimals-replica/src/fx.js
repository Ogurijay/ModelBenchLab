// 特效:命中烟团、晕眩星星、水花、爆炸、彩带、冰块外壳。全部用对象池的 Sprite / Mesh。
import * as THREE from 'three';

function softTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); return t;
}
function starTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffe14d'; g.strokeStyle = '#c98a00'; g.lineWidth = 4;
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 12 : 28; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.closePath(); g.fill(); g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function ringTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 10;
  g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(255,230,120,0.7)'; g.lineWidth = 4;
  g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(cv);
}
function wordTex(text) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const g = cv.getContext('2d');
  g.font = '900 82px "Microsoft YaHei", "PingFang SC", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#7a2e52'; g.strokeText(text, 128, 66);
  g.fillStyle = '#ffd23f'; g.fillText(text, 128, 66);
  g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText(text, 128, 66);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.soft = softTex();
    this.star = starTex();
    this.ring = ringTex();
    this.words = ['砰!', '咚!', 'POW!', 'BAM!', '啪!'].map(wordTex);
    this.parts = [];
    this.pool = [];
    this.stars = new Map();
    this.iceShells = new Map();
    this.iceMat = new THREE.MeshStandardMaterial({ color: '#cdf3ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, emissive: '#6fd8ff', emissiveIntensity: 0.25 });
    this.iceGeo = new THREE.IcosahedronGeometry(0.85, 0);
  }

  sprite(tex, color, onTop = false) {
    let s = this.pool.pop();
    if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); }
    s.material.map = tex;
    s.material.depthTest = !onTop;
    s.renderOrder = onTop ? 20 : 0;
    s.material.color.set(color);
    s.material.opacity = 1;
    s.material.rotation = Math.random() * Math.PI * 2;
    s.visible = true;
    this.scene.add(s);
    return s;
  }

  emit(p, n, { color = '#ffffff', speed = 2, up = 1, life = 0.5, size = 0.3, grow = 1.5, grav = -2, tex = this.soft, spread = 1, drag = 2, onTop = false } = {}) {
    for (let i = 0; i < n; i++) {
      const s = this.sprite(tex, Array.isArray(color) ? color[i % color.length] : color, onTop);
      s.position.copy(p);
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * up, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8) * spread);
      v.y += up * speed * 0.3;
      const l = life * (0.7 + Math.random() * 0.6);
      s.scale.setScalar(size);
      this.parts.push({ s, v, life: l, max: l, size, grow, grav, drag, spin: (Math.random() - 0.5) * 6 });
    }
  }

  hit(p, power = 1, big = false) {
    // 白色绒毛烟团 + 星星 + 冲击波环,重击再加漫画拟声字
    this.emit(p, 8 + Math.floor(power * 8), { color: ['#fffaf0', '#ffe9f2'], speed: 3.2 * power, life: 0.4, size: 0.26 * (0.8 + power * 0.5), grow: 2.4, onTop: true });
    this.emit(p, 3 + Math.floor(power * 3), { color: '#ffe14d', tex: this.star, speed: 3.5 + power * 2, up: 1.5, life: 0.55, size: 0.2, grow: 0.5, grav: -7, onTop: true });
    const r = this.sprite(this.ring, '#ffffff', true);
    r.position.copy(p); r.material.rotation = 0;
    this.parts.push({ s: r, v: new THREE.Vector3(), life: 0.22, max: 0.22, size: 0.25, grow: 3.5 + power * 2.5, grav: 0, drag: 0, spin: 0 });
    if (big) {
      const w = this.sprite(this.words[Math.floor(Math.random() * this.words.length)], '#ffffff', true);
      w.position.copy(p); w.position.y += 0.35;
      w.material.rotation = (Math.random() - 0.5) * 0.5;
      this.parts.push({ s: w, v: new THREE.Vector3(0, 1.2, 0), life: 0.6, max: 0.6, size: 0.55 + power * 0.15, grow: 1.35, grav: 0, drag: 3, spin: 0, pop: true });
    }
  }
  dust(p) { this.emit(p, 5, { color: '#d9cfc2', speed: 1.2, up: 0.4, life: 0.5, size: 0.25, grow: 2 }); }
  splash(p) {
    this.emit(p, 26, { color: ['#e8f8ff', '#bfe7ff', '#ffffff'], speed: 5, up: 3, life: 0.9, size: 0.2, grow: 0.6, grav: -14, drag: 0.5 });
    this.emit(p, 8, { color: '#ffffff', speed: 1.5, up: 0.3, life: 1.0, size: 0.6, grow: 2.5, grav: 0 });
  }
  explosion(p) {
    this.emit(p, 30, { color: ['#ffd36b', '#ff8a3d', '#ff5a2d'], speed: 7, up: 1, life: 0.55, size: 0.6, grow: 2.2, grav: 1 });
    this.emit(p, 18, { color: ['#5a5560', '#7b7480'], speed: 3, up: 1.5, life: 1.4, size: 0.8, grow: 2.5, grav: 1.5, drag: 1 });
    this.emit(p, 10, { color: '#ffe14d', tex: this.star, speed: 8, life: 0.6, size: 0.2, grow: 0.3, grav: -10 });
  }
  confetti(p) {
    this.emit(p, 60, { color: ['#ff5d8f', '#ffd23f', '#3fa7ff', '#5fe08a', '#b47cff'], speed: 6, up: 4, life: 2.2, size: 0.12, grow: 0.2, grav: -6, drag: 1.2 });
  }
  ice(p) { this.emit(p, 14, { color: ['#e8fbff', '#9fe3ff'], speed: 3, life: 0.6, size: 0.16, grow: 0.5, grav: -8 }); }
  sparkle(p) { this.emit(p, 10, { color: '#fff6b0', tex: this.star, speed: 1.6, up: 2, life: 0.8, size: 0.15, grow: 0.2, grav: -1 }); }

  // 每帧:晕眩星星、冰壳、粒子
  update(dt, creatures, t) {
    for (const c of creatures) {
      let ring = this.stars.get(c);
      const want = c.alive && c.ko;
      if (want && !ring) {
        ring = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.star, depthWrite: false }));
          s.scale.setScalar(0.2); ring.add(s);
        }
        this.scene.add(ring); this.stars.set(c, ring);
      }
      if (ring) {
        ring.visible = want;
        if (want) {
          ring.position.copy(c.vis.head.position); ring.position.y += 0.5;
          ring.children.forEach((s, i) => { const a = t * 4 + (i / 4) * Math.PI * 2; s.position.set(Math.cos(a) * 0.38, Math.sin(a * 2) * 0.05, Math.sin(a) * 0.38); });
        }
      }
      let ice = this.iceShells.get(c);
      const iced = c.alive && c.frozen > 0;
      if (iced && !ice) { ice = new THREE.Mesh(this.iceGeo, this.iceMat); ice.scale.set(0.8, 1.05, 0.8); this.scene.add(ice); this.iceShells.set(c, ice); }
      if (ice) {
        ice.visible = iced;
        if (iced) { ice.position.copy(c.vis.torso.position); ice.position.y += 0.2; ice.quaternion.copy(c.vis.torso.quaternion); }
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; this.scene.remove(p.s); this.pool.push(p.s); this.parts.splice(i, 1); continue; }
      const k = 1 - p.life / p.max;
      p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.v.y += p.grav * dt;
      p.s.position.addScaledVector(p.v, dt);
      if (p.pop) { const s = p.size * (k < 0.15 ? 0.4 + k / 0.15 * 0.8 : 1.2 - (k - 0.15) * 0.25); p.s.scale.set(s * 2, s, 1); }
      else p.s.scale.setScalar(p.size * (1 + (p.grow - 1) * k));
      p.s.material.opacity = Math.min(1, (1 - k) * 1.6);
      p.s.material.rotation += p.spin * dt;
    }
  }

  clear() {
    for (const p of this.parts) { this.scene.remove(p.s); this.pool.push(p.s); }
    this.parts = [];
    for (const r of this.stars.values()) this.scene.remove(r);
    for (const r of this.iceShells.values()) this.scene.remove(r);
    this.stars.clear(); this.iceShells.clear();
  }
}
