// 追车镜头：视角随车速变宽；漂移时向外侧摆；震屏；电影镜头接管。
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from '../core/math.js';

export class ChaseCam {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3(0, 10, 10);
    this.look = new THREE.Vector3();
    this.yaw = 0; this.swing = 0; this.shakeT = 0; this.shakeA = 0;
    this.mode = 'chase';
    this.shot = null; // 电影镜头 { pos, look, fov }
    this.orbitT = 0;
    this._v = new THREE.Vector3();
  }

  shake(a, t = 0.35) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = Math.max(this.shakeT, t); }

  snap(car) { this.yaw = car.heading; this.update(1, car, true); }

  update(dt, car, snap = false) {
    const cam = this.cam;
    if (this.mode === 'shot' && this.shot) {
      const k = snap ? 1 : 1 - Math.exp(-this.shot.lambda * dt);
      this.pos.lerp(this.shot.pos, k); this.look.lerp(this.shot.look, k);
      cam.fov = lerp(cam.fov, this.shot.fov ?? 50, k);
    } else if (this.mode === 'orbit') {
      this.orbitT += dt * 0.12;
      const r = 8.5;
      this.pos.set(car.x + Math.cos(this.orbitT) * r, car.y + 2.6, car.z + Math.sin(this.orbitT) * r);
      this.look.set(car.x, car.y + 0.8, car.z);
      cam.fov = 42;
    } else {
      const V = car.speed;
      // 朝向在车头与速度方向之间：漂移时能看到车身角度
      const moveDir = V > 2 ? car.phi : car.heading;
      const target = moveDir + wrapAngle(car.heading - moveDir) * 0.35;
      this.yaw += wrapAngle(target - this.yaw) * (snap ? 1 : 1 - Math.exp(-6 * dt));
      // 向外侧摆
      const sw = car.drifting ? -car.driftDir * clamp(Math.abs(car.beta) / 0.7, 0, 1) * 1.9 : 0;
      this.swing = snap ? sw : damp(this.swing, sw, 3, dt);
      const portrait = cam.aspect < 1; // 竖屏：拉远、抬高，保证看得到路
      const back = 6.1 + clamp(V / 50, 0, 1) * 1.3 + (portrait ? 2.6 : 0), up = 2.15 + clamp(V / 50, 0, 1) * 0.25 + (portrait ? 1.1 : 0);
      const fx = Math.cos(this.yaw), fz = -Math.sin(this.yaw);
      const lx = -fz, lz = fx; // 左
      const tx = car.x - fx * back + lx * this.swing, tz = car.z - fz * back + lz * this.swing;
      const ty = car.y + up;
      if (snap) this.pos.set(tx, ty, tz);
      else {
        this.pos.x = damp(this.pos.x, tx, 10, dt); this.pos.z = damp(this.pos.z, tz, 10, dt);
        this.pos.y = damp(this.pos.y, ty, 6, dt);
      }
      this.look.set(car.x + fx * 3.2 - lx * this.swing * 0.35, car.y + 0.9, car.z + fz * 3.2 - lz * this.swing * 0.35);
      const fov = 60 + clamp((V - 8) / 45, 0, 1) * 20 + (portrait ? 16 : 0);
      cam.fov = snap ? fov : damp(cam.fov, fov, 3, dt);
    }
    cam.position.copy(this.pos);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeA * clamp(this.shakeT / 0.35, 0, 1);
      cam.position.x += (Math.random() - 0.5) * a; cam.position.y += (Math.random() - 0.5) * a; cam.position.z += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeA = 0;
    }
    cam.lookAt(this.look);
    cam.updateProjectionMatrix();
  }
}
