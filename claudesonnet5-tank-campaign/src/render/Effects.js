import * as THREE from 'three';

const PARTICLE_GEO = new THREE.BoxGeometry(0.16, 0.16, 0.16);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.active = [];
    this.pool = [];
    this.shakeTime = 0;
    this.shakeDuration = 0.0001;
    this.shakeMag = 0;
  }

  _acquire() {
    let p = this.pool.pop();
    if (!p) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xffaa33, emissiveIntensity: 1.6, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(PARTICLE_GEO, mat);
      mesh.castShadow = false;
      p = { mesh, vel: new THREE.Vector3() };
      this.group.add(mesh);
    }
    p.mesh.visible = true;
    return p;
  }

  burst(position, { count = 12, color = 0xffaa33, spread = 3.2, size = 0.16, duration = 0.5, upBias = 1.6 } = {}) {
    for (let i = 0; i < count; i++) {
      const p = this._acquire();
      p.mesh.position.copy(position);
      const ang = Math.random() * Math.PI * 2;
      const r = (0.3 + Math.random() * 0.7) * spread;
      p.vel.set(Math.cos(ang) * r, Math.random() * upBias + 0.6, Math.sin(ang) * r);
      p.mesh.material.color.setHex(color);
      p.mesh.material.emissive.setHex(color);
      p.mesh.material.opacity = 1;
      const s = size * (0.7 + Math.random() * 0.6);
      p.mesh.scale.setScalar(s);
      p.life = duration * (0.75 + Math.random() * 0.5);
      p.maxLife = p.life;
      this.active.push(p);
    }
  }

  explosion(position, big = false) {
    this.burst(position, {
      count: big ? 20 : 12,
      color: big ? 0xffd15c : 0xffaa33,
      spread: big ? 5.5 : 3.2,
      size: big ? 0.22 : 0.15,
      duration: big ? 0.65 : 0.45,
      upBias: big ? 2.6 : 1.6,
    });
    this.burst(position, { count: big ? 10 : 5, color: 0x3a3d46, spread: big ? 2.5 : 1.4, size: 0.14, duration: big ? 0.8 : 0.5, upBias: 2.2 });
    this.triggerShake(big ? 0.32 : 0.12, big ? 0.28 : 0.15);
  }

  spark(position, color = 0xf0e26a) {
    this.burst(position, { count: 6, color, spread: 1.6, size: 0.09, duration: 0.22, upBias: 0.8 });
  }

  triggerShake(mag, duration) {
    if (mag < this.shakeMag && this.shakeTime > 0) return;
    this.shakeMag = mag;
    this.shakeDuration = Math.max(duration, 0.0001);
    this.shakeTime = duration;
  }

  consumeShakeOffset(dt) {
    if (this.shakeTime <= 0) return null;
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    const t = this.shakeTime / this.shakeDuration;
    const m = this.shakeMag * t;
    return {
      x: (Math.random() * 2 - 1) * m,
      y: (Math.random() * 2 - 1) * m * 0.6,
      z: (Math.random() * 2 - 1) * m,
    };
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vel.y -= dt * 4.5; // 简单重力
      p.mesh.position.addScaledVector(p.vel, dt);
      const t = p.life / p.maxLife;
      p.mesh.material.opacity = t;
      p.mesh.scale.setScalar(p.mesh.scale.x); // 保持尺寸，仅淡出透明度，避免额外开销
    }
  }
}
