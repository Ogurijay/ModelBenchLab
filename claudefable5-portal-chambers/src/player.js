// 玩家:第一人称控制器(自写胶囊 AABB)+ 穿门姿态重定向 + 发射器视图模型
import * as THREE from 'three';
import {
  makeEntity, moveEntity, GRAVITY, WALK_SPEED, AIR_CAP, JUMP_V,
  PLAYER_HW, PLAYER_HH, PLAYER_EYE,
} from './physics.js';
import { transformPoint, transformDir } from './portal-math.js';
import { PORTAL_COLORS } from './portals.js';

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.ent = makeEntity([0, 0.9, 0], PLAYER_HW, PLAYER_HH);
    this.yaw = 0;
    this.pitch = 0;
    this.keys = Object.create(null);
    this.jumpBuf = 0;
    this.coyote = 0;
    this.gunMode = 'none'; // none | blue | dual
    this.recoil = 0;
    camera.rotation.order = 'YXZ';
    this.buildGun();
  }

  buildGun() {
    const g = new THREE.Group();
    const shellMat = new THREE.MeshStandardMaterial({ color: 0xe8ecea, roughness: 0.35, metalness: 0.25 });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 16), shellMat);
    shell.scale.set(1, 0.82, 2.3);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.045, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x30353a, roughness: 0.4, metalness: 0.8 }),
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.z = -0.2;
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0x2f9bff });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), this.coreMat);
    core.position.z = -0.29;
    // 三根爪
    const clawMat = new THREE.MeshStandardMaterial({ color: 0xd8dcda, roughness: 0.4, metalness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const claw = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.015, 0.16), clawMat);
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      claw.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, -0.26);
      claw.rotation.z = a;
      g.add(claw);
    }
    g.add(shell, barrel, core);
    g.scale.setScalar(0.55);
    g.position.set(0.34, -0.3, -0.62);
    g.visible = false;
    this.gun = g;
    this.camera.add(g);
  }

  setGunMode(mode) {
    this.gunMode = mode;
    this.gun.visible = mode !== 'none';
  }

  canShoot(color) {
    if (this.gunMode === 'dual') return true;
    return this.gunMode === color;
  }

  onShoot(color) {
    this.recoil = 1;
    this.coreMat.color.setHex(PORTAL_COLORS[color]);
  }

  onMouseMove(dx, dy) {
    const sens = 0.0023;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return [-cp * Math.sin(this.yaw), Math.sin(this.pitch), -cp * Math.cos(this.yaw)];
  }

  eye() {
    const p = this.ent.pos;
    return [p[0], p[1] + PLAYER_EYE, p[2]];
  }

  reset(pos, yaw) {
    this.ent.pos = [...pos];
    this.ent.vel = [0, 0, 0];
    this.yaw = yaw;
    this.pitch = 0;
    this.jumpBuf = 0;
    this.coyote = 0;
  }

  queueJump() { this.jumpBuf = 0.12; }

  step(dt, solids, ignore) {
    const wasGrounded = this.ent.onGround; // 台阶助爬仅限着地状态(空中不救,防止跳跃白嫖落点)
    const k = this.keys;
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let wx = 0, wz = 0;
    if (f || s) {
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      wx = -sy * f + cy * s;
      wz = -cy * f - sy * s;
      const l = Math.hypot(wx, wz);
      wx /= l; wz /= l;
    }
    const v = this.ent.vel;
    if (this.ent.onGround) {
      // 地面:指数逼近目标速度(含急停摩擦)
      const t = Math.min(1, 12 * dt);
      v[0] += (wx * WALK_SPEED - v[0]) * t;
      v[2] += (wz * WALK_SPEED - v[2]) * t;
    } else if (wx || wz) {
      // 空中:仅在意愿方向速度低于上限时增速(不吞飞跃动量)
      const cur = v[0] * wx + v[2] * wz;
      if (cur < AIR_CAP) {
        const add = Math.min(10 * dt, AIR_CAP - cur);
        v[0] += wx * add;
        v[2] += wz * add;
      }
    }
    if (this.jumpBuf > 0 && (this.ent.onGround || this.coyote > 0)) {
      v[1] = JUMP_V;
      this.jumpBuf = 0;
      this.coyote = 0;
      this.ent.onGround = false;
    }
    v[1] -= GRAVITY * dt;
    moveEntity(this.ent, dt, solids, ignore, wasGrounded);
    if (this.ent.onGround) this.coyote = 0.08;
    else this.coyote -= dt;
    this.jumpBuf -= dt;
  }

  // 穿门:位置/速度/朝向全部按传送变换映射
  teleport(A, B) {
    let p = transformPoint(A.frame, B.frame, this.ent.pos);
    p = [p[0] + B.frame.N[0] * 0.03, p[1] + B.frame.N[1] * 0.03, p[2] + B.frame.N[2] * 0.03];
    this.ent.pos = p;
    this.ent.vel = transformDir(A.frame, B.frame, this.ent.vel);
    const fwd = transformDir(A.frame, B.frame, this.forward());
    const horiz = Math.hypot(fwd[0], fwd[2]);
    if (horiz > 1e-4) this.yaw = Math.atan2(-fwd[0], -fwd[2]);
    this.pitch = Math.max(-1.55, Math.min(1.55, Math.asin(Math.max(-1, Math.min(1, fwd[1])))));
    this.ent.onGround = false;
  }

  syncCamera(dt) {
    const p = this.ent.pos;
    this.camera.position.set(p[0], p[1] + PLAYER_EYE, p[2]);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt / 0.15);
      this.gun.position.z = -0.62 + 0.06 * this.recoil;
    }
    // 移动时轻微呼吸感
    const speed = Math.hypot(this.ent.vel[0], this.ent.vel[2]);
    if (this.ent.onGround && speed > 0.5) {
      this.bobT = (this.bobT || 0) + dt * speed * 1.6;
      this.gun.position.y = -0.3 + Math.sin(this.bobT) * 0.005;
    }
  }
}
