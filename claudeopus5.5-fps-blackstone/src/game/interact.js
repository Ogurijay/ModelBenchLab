// 交互点：靠近 + 大致面向时显示提示；支持按住读条（可中断）与单击触发。

import * as THREE from 'three';

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

export class Interactables {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.current = null;
    this.progress = 0;
  }

  add(def) {
    const it = { enabled: true, hold: 0, r: 2.2, ...def };
    this.list.push(it);
    return it;
  }

  remove(it) {
    const i = this.list.indexOf(it);
    if (i >= 0) this.list.splice(i, 1);
    if (this.current === it) this.current = null;
  }

  clear() {
    this.list.length = 0;
    this.current = null;
    this.progress = 0;
  }

  update(dt, input) {
    const G = this.G, p = G.player;
    let best = null, bs = -Infinity;
    if (p.alive) {
      const eye = p.eyePos(_v.clone());
      p.forward(_f);
      for (const it of this.list) {
        if (!it.enabled) continue;
        if (it.available && !it.available()) continue;
        const dx = it.x - eye.x, dy = (it.y ?? 1) - eye.y, dz = it.z - eye.z;
        const dh = Math.hypot(dx, dz);
        if (dh > it.r || Math.abs(dy) > 2.2) continue;
        const d = Math.hypot(dx, dy, dz);
        const dot = (dx * _f.x + dy * _f.y + dz * _f.z) / Math.max(d, 1e-3);
        if (dot < 0.55 && dh > 1.1) continue;
        const score = dot * 2 - dh;
        if (score > bs) {
          bs = score;
          best = it;
        }
      }
    }
    if (best !== this.current) {
      this.current = best;
      this.progress = 0;
    }
    const it = this.current;
    if (!it) {
      G.hud.prompt(null);
      return;
    }
    if (it.hold > 0) {
      if (input.isDown('interact')) {
        if (this.progress === 0 && it.onStart) it.onStart();
        this.progress += dt / it.hold;
        if (this.progress >= 1) {
          this.progress = 0;
          it.onUse(it);
        }
      } else if (this.progress > 0) {
        this.progress = Math.max(0, this.progress - dt * 2);
      }
    } else if (input.pressed('interact')) {
      it.onUse(it);
    }
    const label = typeof it.prompt === 'function' ? it.prompt() : it.prompt;
    G.hud.prompt(this.current ? label : null, it.hold > 0 ? this.progress : -1);
  }
}
