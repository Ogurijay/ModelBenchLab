// 敌方弹丸：能量弹（可见、可躲）、等离子球、转管弹、火箭。与世界/玩家做线段检测，掠过时播放呼啸声。

import * as THREE from 'three';
import { SHOT } from '../world/collision.js';
import { segSegDist2, closestTOnSegment } from '../core/util.js';

const STYLE = {
  bolt: { len: 1.4, w: 0.075, c: [4.5, 1.1, 0.3], r: 0.06 },
  minigun: { len: 1.0, w: 0.055, c: [4.2, 2.3, 0.5], r: 0.05 },
  plasma: { len: 0.55, w: 0.24, c: [3.6, 0.7, 3.8], r: 0.14 },
  rocket: { len: 0, w: 0, c: [0, 0, 0], r: 0.12 },
};

export class Projectiles {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.rocketGeo = (() => {
      const g = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8);
      g.rotateX(Math.PI / 2);
      return g;
    })();
    this.rocketMat = new THREE.MeshStandardMaterial({ color: 0x5a5d52, metalness: 0.5, roughness: 0.5 });
    this.tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.5, 0.4) });
    this._seg = new THREE.Vector3();
  }

  spawn(kind, from, vel, dmg, owner) {
    const pr = { kind, p: from.clone(), v: vel.clone(), dmg, owner, life: kind === 'rocket' ? 5 : 2.5, whizzed: false, mesh: null, snd: null };
    if (kind === 'rocket') {
      const m = new THREE.Mesh(this.rocketGeo, this.rocketMat);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), this.tipMat);
      tip.position.z = -0.27;
      m.add(tip);
      m.position.copy(pr.p);
      m.lookAt(pr.p.clone().sub(pr.v));
      this.G.scene.add(m);
      pr.mesh = m;
      pr.snd = this.G.audio.play('rocket_loop', { pos: pr.p, loop: true, volume: 0.5, ref: 4 });
    }
    this.list.push(pr);
    return pr;
  }

  update(dt) {
    const G = this.G, world = G.world, p = G.player;
    const head = p.eyePos(new THREE.Vector3());
    const feetY = p.body.pos.y + 0.25;
    const headY = p.body.pos.y + p.body.height - 0.15;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pr = this.list[i];
      pr.life -= dt;
      if (pr.kind === 'rocket') {
        // 轻微追踪
        const tgt = p.chestPos(new THREE.Vector3());
        const want = tgt.sub(pr.p).normalize().multiplyScalar(pr.v.length());
        pr.v.lerp(want, Math.min(1, dt * 0.6));
        if (Math.random() < 0.9) G.effects.trail(pr.p.x, pr.p.y, pr.p.z);
      }
      if (pr.kind === 'plasma' && Math.random() < 0.7) {
        G.effects.glow.spawn(pr.p.x, pr.p.y, pr.p.z, 0, 0, 0, 0.18, 0.3, 0.05, 2.5, 0.5, 2.8, 0.8, 1, 0.1, 1, 0, 0, 0, 0);
      }
      const sx = pr.p.x, sy = pr.p.y, sz = pr.p.z;
      const ex = sx + pr.v.x * dt, ey = sy + pr.v.y * dt, ez = sz + pr.v.z * dt;
      const len = Math.hypot(ex - sx, ey - sy, ez - sz);
      const dx = (ex - sx) / len, dy = (ey - sy) / len, dz = (ez - sz) / len;
      const st = STYLE[pr.kind];
      let done = false;
      // 玩家
      if (p.alive) {
        const r = 0.36 + st.r;
        const d2 = segSegDist2(sx, sy, sz, ex, ey, ez, p.body.pos.x, feetY, p.body.pos.z, p.body.pos.x, headY, p.body.pos.z);
        if (d2 < r * r) {
          if (pr.kind === 'rocket') this.explodeRocket(pr, sx + dx * len * 0.5, sy + dy * len * 0.5, sz + dz * len * 0.5);
          else {
            G.damagePlayer(pr.dmg, pr.owner ? pr.owner.body.pos.x : sx, pr.owner ? pr.owner.body.pos.z : sz, pr.kind);
            G.effects.robotHit(p.body.pos.x + (sx - p.body.pos.x) * 0.3, sy, p.body.pos.z + (sz - p.body.pos.z) * 0.3, -dx, -dy, -dz);
          }
          done = true;
        } else if (!pr.whizzed && pr.kind !== 'rocket') {
          const t = closestTOnSegment(sx, sy, sz, ex, ey, ez, head.x, head.y, head.z);
          const cx = sx + (ex - sx) * t, cy = sy + (ey - sy) * t, cz = sz + (ez - sz) * t;
          const dd = Math.hypot(cx - head.x, cy - head.y, cz - head.z);
          if (dd < 2.2 && t > 0 && t < 1) {
            pr.whizzed = true;
            G.audio.play('whizz', { pos: { x: cx, y: cy, z: cz }, volume: 0.55, ref: 1.5 });
          }
        }
      }
      // 世界
      if (!done && world.raycast(sx, sy, sz, dx, dy, dz, len, SHOT)) {
        const h = world.hit;
        if (pr.kind === 'rocket') this.explodeRocket(pr, h.x + h.nx * 0.2, h.y + h.ny * 0.2, h.z + h.nz * 0.2);
        else {
          const c = st.c;
          for (let k = 0; k < (pr.kind === 'plasma' ? 10 : 5); k++) {
            const sp = 2 + Math.random() * 5;
            G.effects.spark(h.x, h.y, h.z, (h.nx + (Math.random() - 0.5) * 1.4) * sp, (h.ny + Math.random() * 0.8) * sp, (h.nz + (Math.random() - 0.5) * 1.4) * sp, 0.2 + Math.random() * 0.2, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 0.02, 0.03);
          }
          G.effects.glow.spawn(h.x + h.nx * 0.05, h.y + h.ny * 0.05, h.z + h.nz * 0.05, 0, 0, 0, 0.12, 0.25, 0.5, c[0], c[1], c[2], 1, c[0] * 0.3, c[1] * 0.3, c[2] * 0.3, 0, 0, 0, 0);
          if (!h.collider.entity) G.effects.holes.add(h.x, h.y, h.z, h.nx, h.ny, h.nz, pr.kind === 'plasma' ? 0.28 : 0.12, Math.random() * 6.28);
          if (Math.random() < 0.4) G.audio.play('impact_concrete', { pos: { x: h.x, y: h.y, z: h.z }, volume: 0.3, ref: 3 });
          if (h.collider.entity && h.collider.entity.onShot) h.collider.entity.onShot(pr.dmg, h, 'enemy');
        }
        done = true;
      }
      if (done || pr.life <= 0) {
        if (pr.mesh) this.G.scene.remove(pr.mesh);
        if (pr.snd) pr.snd.stop(0.05);
        if (!done && pr.kind === 'rocket') this.explodeRocket(pr, pr.p.x, pr.p.y, pr.p.z);
        this.list.splice(i, 1);
        continue;
      }
      pr.p.set(ex, ey, ez);
      if (pr.mesh) {
        pr.mesh.position.copy(pr.p);
        pr.mesh.lookAt(pr.p.x - pr.v.x, pr.p.y - pr.v.y, pr.p.z - pr.v.z);
      }
      if (pr.snd) pr.snd.setPos(pr.p.x, pr.p.y, pr.p.z);
    }
  }

  explodeRocket(pr, x, y, z) {
    if (pr.exploded) return;
    pr.exploded = true;
    this.G.explode(x, y, z, 4.5, pr.dmg, 'enemy');
  }

  draw() {
    const S = this.G.effects.streaks;
    for (const pr of this.list) {
      const st = STYLE[pr.kind];
      if (!st.len) continue;
      const sp = pr.v.length();
      const k = st.len / sp;
      S.push(pr.p.x, pr.p.y, pr.p.z, pr.p.x - pr.v.x * k, pr.p.y - pr.v.y * k, pr.p.z - pr.v.z * k, st.c[0], st.c[1], st.c[2], 1, st.w);
      // 白热核心
      S.push(pr.p.x, pr.p.y, pr.p.z, pr.p.x - pr.v.x * k * 0.5, pr.p.y - pr.v.y * k * 0.5, pr.p.z - pr.v.z * k * 0.5, 2.5, 2.2, 2, 1, st.w * 0.35);
    }
  }

  clear() {
    for (const pr of this.list) {
      if (pr.mesh) this.G.scene.remove(pr.mesh);
      if (pr.snd) pr.snd.stop(0.05);
    }
    this.list.length = 0;
  }
}
