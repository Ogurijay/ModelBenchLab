// 可交互道具：手雷、爆炸油桶、掉落物/武器拾取、补给箱、门。

import * as THREE from 'three';
import { GRENADE, WEAPONS } from '../weapons/defs.js';
import { buildGun } from '../weapons/models.js';
import { SOLID } from '../world/collision.js';

// ───────────────────────── 手雷 ─────────────────────────
export class Grenades {
  constructor(G) {
    this.G = G;
    this.list = [];
    const g = new THREE.IcosahedronGeometry(0.055, 1);
    g.scale(1, 1.25, 1);
    this.geo = g;
    this.mat = new THREE.MeshStandardMaterial({ color: 0x3f4a2e, roughness: 0.6, metalness: 0.4 });
    this.ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.4, 0.2) });
    this._n = { x: 0, y: 0, z: 0 };
  }
  spawn(pos, vel, owner) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.castShadow = true;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), this.ledMat);
    led.position.y = 0.07;
    m.add(led);
    m.position.copy(pos);
    this.G.scene.add(m);
    this.list.push({ m, led, p: m.position, v: vel.clone(), fuse: GRENADE.fuse, owner, beep: 0, rest: false });
  }
  update(dt) {
    const G = this.G;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const g = this.list[i];
      g.fuse -= dt;
      g.beep -= dt;
      const fast = g.fuse < 0.8;
      if (g.beep <= 0) {
        g.beep = fast ? 0.15 : 0.45;
        g.led.visible = true;
        G.audio.play('countdown', { pos: g.p, volume: 0.25, ref: 1.5, rate: 1.4 });
      } else if (g.beep < (fast ? 0.08 : 0.35)) g.led.visible = false;
      if (!g.rest) {
        // 子步积分，防穿薄墙
        const steps = Math.max(1, Math.ceil((g.v.length() * dt) / 0.05));
        const h = dt / steps;
        for (let s = 0; s < steps; s++) {
          g.v.y -= 18 * h;
          g.p.addScaledVector(g.v, h);
          const n = this._n;
          const pen = G.world.sphereCollide(g.p, 0.07, n);
          if (pen > 0) {
            const vn = g.v.x * n.x + g.v.y * n.y + g.v.z * n.z;
            if (vn < 0) {
              g.v.x -= 1.45 * vn * n.x;
              g.v.y -= 1.45 * vn * n.y;
              g.v.z -= 1.45 * vn * n.z;
              g.v.multiplyScalar(0.62);
              if (-vn > 2) G.audio.play('grenade_bounce', { pos: g.p, volume: Math.min(0.6, -vn * 0.08), ref: 2 });
            }
            if (n.y > 0.7 && g.v.lengthSq() < 0.4) {
              g.rest = true;
              g.v.set(0, 0, 0);
            }
          }
        }
        g.m.rotation.x += g.v.length() * dt * 6;
        g.m.rotation.z += g.v.length() * dt * 4;
      }
      if (g.fuse <= 0) {
        G.scene.remove(g.m);
        this.list.splice(i, 1);
        G.explode(g.p.x, g.p.y, g.p.z, GRENADE.radius, GRENADE.damage, g.owner);
      }
    }
  }
  clear() {
    for (const g of this.list) this.G.scene.remove(g.m);
    this.list.length = 0;
  }
}

// ───────────────────────── 爆炸油桶 ─────────────────────────
export class Barrels {
  constructor(G, specs) {
    this.G = G;
    this.specs = specs;
    this.list = [];
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#8e1d12';
    ctx.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(${40 + Math.random() * 40},${20 + Math.random() * 20},10,${Math.random() * 0.25})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 128, 2 + Math.random() * 6, 1 + Math.random() * 10);
    }
    ctx.fillStyle = '#d9a21a';
    ctx.fillRect(0, 50, 256, 26);
    ctx.fillStyle = '#111';
    for (let x = -30; x < 256; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, 76);
      ctx.lineTo(x + 13, 76);
      ctx.lineTo(x + 26, 50);
      ctx.lineTo(x + 13, 50);
      ctx.fill();
    }
    ctx.fillStyle = '#f2ead0';
    ctx.font = 'bold 22px "Microsoft YaHei",sans-serif';
    ctx.fillText('易燃 · FLAMMABLE', 60, 30);
    ctx.fillText('易燃 · FLAMMABLE', 60, 106);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.45 });
    this.geo = new THREE.CylinderGeometry(0.33, 0.33, 0.98, 18);
    this.rimGeo = new THREE.TorusGeometry(0.335, 0.02, 6, 18);
    this.rimMat = new THREE.MeshStandardMaterial({ color: 0x5a1610, roughness: 0.5, metalness: 0.6 });
    for (const s of specs) this.create(s);
  }
  create(s) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.geo, this.mat);
    body.position.y = 0.49;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    for (const y of [0.18, 0.8]) {
      const r = new THREE.Mesh(this.rimGeo, this.rimMat);
      r.rotation.x = Math.PI / 2;
      r.position.y = y;
      g.add(r);
    }
    g.position.set(s.x, 0, s.z);
    g.rotation.y = (s.x * 13.1 + s.z * 7.7) % 6.28;
    this.G.scene.add(g);
    const b = { spec: s, g, hp: 30, burning: 0, alive: true, lastSource: null };
    b.collider = this.G.world.addBox(s.x - 0.32, 0, s.z - 0.32, s.x + 0.32, 0.98, s.z + 0.32, { flags: SOLID, surface: 'metal', entity: b });
    b.onShot = (dmg, hit, src) => this.damage(b, dmg, src || 'player');
    this.list.push(b);
  }
  damage(b, dmg, src) {
    if (!b.alive) return;
    b.hp -= dmg;
    b.lastSource = src;
    if (b.hp <= 0 && b.burning <= 0) {
      b.burning = 0.55 + Math.random() * 0.4;
      this.G.audio.play('rocket_launch', { pos: b.g.position, volume: 0.45, rate: 0.65, ref: 3 });
    }
    if (b.hp > 0) {
      const p = b.g.position;
      this.G.effects.fire(p.x, 0.9, p.z, 0.4);
    }
  }
  update(dt) {
    for (const b of this.list) {
      if (!b.alive) continue;
      if (b.burning > 0) {
        b.burning -= dt;
        const p = b.g.position;
        this.G.effects.fire(p.x, 1.0, p.z, 0.8);
        this.G.effects.fire(p.x, 1.0, p.z, 0.6);
        if (b.burning <= 0) this.explode(b);
      }
    }
  }
  explode(b) {
    if (!b.alive) return;
    b.alive = false;
    b.collider.enabled = false;
    b.g.visible = false;
    const p = b.g.position;
    this.G.explode(p.x, 0.6, p.z, 6.5, 140, b.lastSource === 'player' ? 'barrel-player' : 'barrel');
  }
  /** 爆炸波及 */
  blast(x, y, z, radius, src) {
    for (const b of this.list) {
      if (!b.alive || b.burning > 0) continue;
      const p = b.g.position;
      const d = Math.hypot(p.x - x, 0.5 - y, p.z - z);
      if (d < radius * 0.8) {
        b.lastSource = src === 'player' || src === 'barrel-player' ? 'player' : 'other';
        b.hp = 0;
        b.burning = 0.12 + Math.random() * 0.25;
      }
    }
  }
  reset() {
    for (const b of this.list) {
      b.alive = true;
      b.hp = 30;
      b.burning = 0;
      b.collider.enabled = true;
      b.g.visible = true;
    }
  }
}

// ───────────────────────── 掉落物与武器拾取 ─────────────────────────
const PICKUP_INFO = {
  ammo: { label: '弹药', color: new THREE.Color(3.2, 2.4, 0.6) },
  health: { label: '医疗包', color: new THREE.Color(3.5, 0.6, 0.5) },
  armor: { label: '护甲板', color: new THREE.Color(0.6, 2.4, 3.6) },
  grenade: { label: '手雷', color: new THREE.Color(1.6, 3.2, 0.8) },
};

export class Pickups {
  constructor(G, gunMats) {
    this.G = G;
    this.gunMats = gunMats;
    this.list = [];
    this.geo = {
      ammo: new THREE.BoxGeometry(0.34, 0.18, 0.22),
      health: new THREE.BoxGeometry(0.34, 0.2, 0.26),
      armor: new THREE.BoxGeometry(0.34, 0.42, 0.08),
      grenade: new THREE.IcosahedronGeometry(0.08, 1),
    };
    this.mat = {
      ammo: new THREE.MeshStandardMaterial({ color: 0x3e4a2c, roughness: 0.7, metalness: 0.3 }),
      health: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.5 }),
      armor: new THREE.MeshStandardMaterial({ color: 0x2a4a68, roughness: 0.4, metalness: 0.6 }),
      grenade: new THREE.MeshStandardMaterial({ color: 0x3f4a2e, roughness: 0.6, metalness: 0.4 }),
    };
    this.cross = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.25) });
    this.stripe = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 1.9, 0.4) });
    this.cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 3.6) });
    const ringTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(64, 64, 20, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.7)');
      g.addColorStop(0.78, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    this.ringTex = ringTex;
  }

  _visual(kind) {
    const g = new THREE.Group();
    if (kind.startsWith('weapon:')) {
      const id = kind.slice(7);
      const gun = buildGun(id, this.gunMats, false);
      gun.group.scale.setScalar(1.25);
      gun.group.rotation.z = Math.PI / 2 * 0;
      g.add(gun.group);
    } else {
      const m = new THREE.Mesh(this.geo[kind], this.mat[kind]);
      m.castShadow = true;
      g.add(m);
      if (kind === 'health') {
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.27), this.cross);
        c1.position.y = 0.0;
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.27), this.cross);
        g.add(c1, c2);
      } else if (kind === 'ammo') {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.225), this.stripe);
        g.add(s);
      } else if (kind === 'armor') {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.085), this.cyan);
        s.position.y = 0.1;
        g.add(s);
      }
    }
    const info = PICKUP_INFO[kind] || { color: new THREE.Color(3, 3, 3) };
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: this.ringTex, color: info.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 4;
    return { g, ring };
  }

  spawn(kind, x, y, z, opts = {}) {
    const { g, ring } = this._visual(kind);
    const base = new THREE.Group();
    base.position.set(x, y, z);
    base.add(g, ring);
    g.position.y = 0.35;
    ring.position.y = 0.02;
    if (opts.groundY !== undefined) ring.position.y = opts.groundY - y + 0.02;
    this.G.scene.add(base);
    const it = { kind, base, g, ring, life: opts.life ?? Infinity, t: Math.random() * 6, vy: opts.toss ? 3 : 0, y0: y, fixed: !!opts.fixed, yaw: opts.yaw ?? 0, onPick: opts.onPick };
    if (opts.toss) {
      it.vx = (Math.random() - 0.5) * 2;
      it.vz = (Math.random() - 0.5) * 2;
      base.position.y = y + 0.6;
    }
    this.list.push(it);
    return it;
  }

  update(dt) {
    const G = this.G, p = G.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const it = this.list[i];
      it.t += dt;
      it.life -= dt;
      if (it.vy !== 0 || it.vx) {
        it.vy -= 14 * dt;
        it.base.position.x += (it.vx || 0) * dt;
        it.base.position.z += (it.vz || 0) * dt;
        it.base.position.y += it.vy * dt;
        const gy = G.world.groundAt(it.base.position.x, it.base.position.z, 0.15, it.base.position.y + 0.3);
        if (it.base.position.y <= gy) {
          it.base.position.y = gy;
          it.vy = 0;
          it.vx = it.vz = 0;
        }
      }
      it.g.rotation.y = it.yaw + it.t * 1.6;
      it.g.position.y = 0.35 + Math.sin(it.t * 2.4) * 0.06;
      it.ring.material.opacity = 0.55 + Math.sin(it.t * 3) * 0.25;
      const blink = it.life < 5 && Math.sin(it.t * 20) > 0;
      it.base.visible = !blink;
      if (it.life <= 0) {
        this.remove(i);
        continue;
      }
      if (!p.alive) continue;
      const bp = it.base.position;
      const d = Math.hypot(bp.x - p.body.pos.x, bp.z - p.body.pos.z);
      const dy = bp.y + 0.3 - (p.body.pos.y + 0.9);
      if (d < 1.25 && Math.abs(dy) < 1.4) {
        if (this.apply(it)) this.remove(i);
      }
    }
  }

  apply(it) {
    const G = this.G, p = G.player, A = G.arsenal;
    const k = it.kind;
    if (k === 'health') {
      if (p.health >= p.maxHealth) return false;
      const n = p.heal(35);
      G.audio.play('pickup_health', { volume: 0.7 });
      G.hud.pickup(`+${Math.round(n)} 生命`, '#ff7b6b');
      return true;
    }
    if (k === 'armor') {
      if (p.armor >= p.maxArmor) return false;
      const n = p.addArmor(40);
      G.audio.play('pickup_armor', { volume: 0.7 });
      G.hud.pickup(`+${Math.round(n)} 护甲`, '#6fd2ff');
      return true;
    }
    if (k === 'ammo') {
      if (!A.addAmmo(0.22)) return false;
      G.audio.play('pickup_ammo', { volume: 0.8 });
      G.hud.pickup('弹药补充', '#ffd25a');
      return true;
    }
    if (k === 'grenade') {
      if (A.grenades >= 4) return false;
      A.grenades++;
      G.audio.play('pickup', { volume: 0.7 });
      G.hud.pickup('+1 手雷', '#a8ff7a');
      return true;
    }
    if (k.startsWith('weapon:')) {
      const id = k.slice(7);
      const fresh = A.give(id);
      G.audio.play('slide_rack', { volume: 0.9 });
      G.audio.play('pickup', { volume: 0.6 });
      G.hud.pickup(fresh ? `获得 ${WEAPONS[id].name}` : `${WEAPONS[id].name} 弹药`, '#ffffff');
      if (fresh) G.hud.banner(WEAPONS[id].name, `${WEAPONS[id].kind} · 按 ${WEAPONS[id].slot} 切换`, 2.6);
      if (it.onPick) it.onPick();
      return true;
    }
    return false;
  }

  remove(i) {
    const it = this.list[i];
    this.G.scene.remove(it.base);
    it.ring.material.dispose();
    this.list.splice(i, 1);
  }

  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i);
  }
}

// ───────────────────────── 补给箱 ─────────────────────────
export class SupplyCrates {
  constructor(G, specs) {
    this.G = G;
    this.list = [];
    const body = new THREE.MeshStandardMaterial({ color: 0x3b4a32, roughness: 0.7, metalness: 0.3 });
    const trim = new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.5, metalness: 0.7 });
    this.lightOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3.4, 1.0) });
    this.lightOff = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.5, 0.3) });
    for (const s of specs) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.6), body);
      b.position.y = 0.275;
      b.castShadow = true;
      b.receiveShadow = true;
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.1, 0.64), trim);
      lid.position.y = 0.6;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), this.lightOn);
      lamp.position.set(0, 0.45, 0.31);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.01), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.6, 0.5) }));
      sign.position.set(0, 0.28, 0.305);
      g.add(b, lid, lamp, sign);
      g.position.set(s.x, 0, s.z);
      g.rotation.y = s.yaw || 0;
      G.scene.add(g);
      const col = G.world.addBox(s.x - 0.5, 0, s.z - 0.5, s.x + 0.5, 0.65, s.z + 0.5, { surface: 'metal' });
      this.list.push({ spec: s, g, lamp, uses: 1, col });
    }
  }
  setUses(n) {
    for (const c of this.list) {
      c.uses = n;
      c.lamp.material = n > 0 ? this.lightOn : this.lightOff;
    }
  }
  use(c) {
    if (c.uses <= 0) return false;
    c.uses--;
    if (c.uses <= 0) c.lamp.material = this.lightOff;
    return true;
  }
}

// ───────────────────────── 动态门 ─────────────────────────
export class Door {
  constructor(G, spec, mats) {
    this.G = G;
    this.spec = spec;
    this.panels = [];
    for (const p of spec.panels) {
      const [x0, y0, z0, x1, y1, z1] = p.box;
      const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
      const m = new THREE.Mesh(geo, mats[p.mat]);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.castShadow = true;
      m.receiveShadow = true;
      G.scene.add(m);
      this.panels.push({ mesh: m, base: m.position.clone(), slide: new THREE.Vector3(...p.slide) });
    }
    this.open = 0;
    this.target = 0;
    this.snd = null;
  }
  setOpen(on, instant = false) {
    this.target = on ? 1 : 0;
    if (instant) {
      this.open = this.target;
      this.apply();
    } else if (Math.abs(this.open - this.target) > 0.01) {
      const c = this.panels[0].base;
      this.G.audio.play('door', { pos: c, volume: 0.9, ref: 6 });
    }
  }
  apply() {
    for (const p of this.panels) p.mesh.position.copy(p.base).addScaledVector(p.slide, this.open);
    const passable = this.open > 0.7;
    this.spec.collider.enabled = !passable;
    this.G.nav.setBlockedRect(...this.spec.nav, !passable);
  }
  update(dt) {
    if (this.open === this.target) return;
    const sp = dt / this.spec.duration;
    this.open = this.target > this.open ? Math.min(this.target, this.open + sp) : Math.max(this.target, this.open - sp);
    this.apply();
  }
}
