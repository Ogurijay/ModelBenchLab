// 撤离直升机“鹰眼”：程序化模型 + 进场/悬停/着陆航线。

import * as THREE from 'three';
import { smoothstep, lerp } from '../core/util.js';

export class Helicopter {
  constructor(G) {
    this.G = G;
    const body = new THREE.MeshStandardMaterial({ color: 0x3c4433, metalness: 0.5, roughness: 0.55, map: G.T?.paint?.map || null });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, metalness: 0.6, roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a2a36, metalness: 1, roughness: 0.08, envMapIntensity: 2 });
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.2) });
    const green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 5, 0.6) });
    const g = new THREE.Group();
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, rz);
      o.castShadow = true;
      g.add(o);
      return o;
    };
    const cab = add(new THREE.SphereGeometry(1.2, 20, 14), body, 0, 1.7, 0.4);
    cab.scale.set(1, 0.9, 1.9);
    add(new THREE.SphereGeometry(1.02, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), glass, 0, 1.75, 1.9, Math.PI / 2.3, 0, 0).scale.set(1, 1, 0.8);
    add(new THREE.BoxGeometry(1.9, 1.3, 2.2), body, 0, 1.55, -0.4);
    add(new THREE.CylinderGeometry(0.22, 0.36, 5.2, 10), body, 0, 2.0, -3.6, Math.PI / 2 + 0.06, 0, 0);
    add(new THREE.BoxGeometry(0.12, 1.3, 0.9), body, 0, 2.6, -6.0, 0.3, 0, 0);
    add(new THREE.BoxGeometry(1.6, 0.08, 0.5), body, 0, 2.2, -5.8);
    add(new THREE.BoxGeometry(0.5, 0.5, 1.4), dark, 0, 2.7, -0.3);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 6), dark, s * 1.05, 0.25, 0.1, Math.PI / 2, 0, 0);
      add(new THREE.BoxGeometry(0.06, 0.8, 0.06), dark, s * 0.95, 0.65, 0.9, 0, 0, s * 0.3);
      add(new THREE.BoxGeometry(0.06, 0.8, 0.06), dark, s * 0.95, 0.65, -0.7, 0, 0, s * 0.3);
      add(new THREE.SphereGeometry(0.06, 6, 4), s > 0 ? green : red, s * 1.0, 1.5, -0.6);
    }
    this.rotor = new THREE.Group();
    this.rotor.position.set(0, 3.05, -0.3);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 6.2), bladeMat);
      b.position.z = 0;
      b.rotation.y = (i * Math.PI) / 2;
      b.geometry.translate(0, 0, 3.1);
      this.rotor.add(b);
    }
    const blur = new THREE.Mesh(new THREE.CircleGeometry(6.3, 40), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    blur.rotation.x = -Math.PI / 2;
    this.rotor.add(blur);
    g.add(this.rotor);
    this.tail = new THREE.Group();
    this.tail.position.set(0.12, 2.6, -6.1);
    for (let i = 0; i < 2; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.3, 0.12), bladeMat);
      b.rotation.x = (i * Math.PI) / 2;
      this.tail.add(b);
    }
    g.add(this.tail);
    g.visible = false;
    G.scene.add(g);
    this.g = g;
    this.state = 'off';
    this.t = 0;
    this.snd = null;
  }

  /** 进场：from → 悬停点 → 着陆 */
  arrive(pad, dur = 24) {
    this.pad = new THREE.Vector3(pad.x, pad.y, pad.z);
    this.from = new THREE.Vector3(pad.x + 70, 40, pad.z - 60);
    this.hoverP = new THREE.Vector3(pad.x, pad.y + 14, pad.z);
    this.dur = dur;
    this.t = 0;
    this.state = 'arriving';
    this.g.visible = true;
    this.g.position.copy(this.from);
    this.snd = this.G.audio.play('heli_loop', { pos: this.from, loop: true, volume: 1.4, ref: 14, rolloff: 0.7, rateVar: 0 });
  }

  get landed() {
    return this.state === 'landed';
  }

  update(dt) {
    if (this.state === 'off') return;
    this.t += dt;
    this.rotor.rotation.y += dt * 24;
    this.tail.rotation.x += dt * 40;
    const g = this.g;
    if (this.state === 'arriving') {
      const fly = this.dur * 0.62;
      if (this.t < fly) {
        const k = smoothstep(0, 1, this.t / fly);
        g.position.lerpVectors(this.from, this.hoverP, k);
        const dir = new THREE.Vector3().subVectors(this.hoverP, this.from);
        g.rotation.set(0.18 * (1 - k), Math.atan2(dir.x, dir.z), 0);
      } else {
        const k = smoothstep(0, 1, (this.t - fly) / (this.dur - fly));
        g.position.set(this.pad.x + Math.sin(this.t * 0.7) * 0.3 * (1 - k), lerp(this.hoverP.y, this.pad.y, k), this.pad.z);
        g.rotation.x = lerp(g.rotation.x, 0, dt * 2);
        if (k >= 1) this.state = 'landed';
      }
      if (this.G.env.heliLight) this.G.env.heliLight.intensity = 30 + 25 * Math.sin(this.t * 6);
    } else if (this.state === 'landed') {
      g.position.y = this.pad.y + Math.sin(this.t * 3) * 0.02;
    } else if (this.state === 'leaving') {
      this.lt = (this.lt ?? 0) + dt;
      g.position.y += dt * (2 + this.lt * 4);
      g.position.z -= dt * this.lt * 6;
      g.rotation.x = Math.min(0.25, this.lt * 0.1);
    }
    if (this.snd) this.snd.setPos(g.position.x, g.position.y + 2, g.position.z);
    // 旋翼下洗气流扬尘
    const h = g.position.y - (this.pad?.y ?? 0);
    if (h < 12 && Math.random() < 0.8) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 4;
      this.G.effects.smoke.spawn(g.position.x + Math.cos(a) * r, (this.pad?.y ?? 0) + 0.2, g.position.z + Math.sin(a) * r, Math.cos(a) * 5, 0.4, Math.sin(a) * 5, 1.2, 0.6, 2.2, 0.45, 0.42, 0.38, 0.35 * (1 - h / 12), 0.45, 0.42, 0.38, 0, 0, 1.2, 0);
    }
  }

  leave() {
    this.state = 'leaving';
  }

  reset() {
    this.state = 'off';
    this.g.visible = false;
    if (this.G.env.heliLight) this.G.env.heliLight.intensity = 0;
    if (this.snd) this.snd.stop(0.2);
    this.snd = null;
    this.lt = 0;
  }
}
