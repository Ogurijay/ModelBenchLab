// 玩家：第一人称（重力 / 跳跃 / 自动抬腿 / 游泳兜底）+ 俯瞰（OrbitControls）+ 自动巡游。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SPAWN, WATER_Y, regionAt, LANDMARKS, valleyToWorld, CITY_BOUNDS } from '../world/coords.js';

const R = 0.35; // 身体半径
const HEIGHT = 1.75;
const EYE = 1.62;
const GRAVITY = 22;
const JUMP_V = 7.4;

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.pos = new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z);
    this.vel = new THREE.Vector3();
    this.yaw = SPAWN.yaw;
    this.pitch = 0.04;
    this.keys = new Set();
    this.onGround = false;
    this.fly = false;
    this.waterTime = 0;
    this.region = regionAt(this.pos.x, this.pos.z);
  }

  teleport(x, y, z, yaw = this.yaw, pitch = this.pitch) {
    this.pos.set(x, y ?? this.ctx.collision.groundAt(x, z, R, 999), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = pitch;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0022;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - dy * 0.0022));
  }

  update(dt) {
    const k = this.keys;
    const col = this.ctx.collision;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = this.fly ? (run ? 40 : 14) : run ? 9.5 : 5.2;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let wx = 0;
    let wz = 0;
    if (k.has('KeyW')) { wx += fx; wz += fz; }
    if (k.has('KeyS')) { wx -= fx; wz -= fz; }
    if (k.has('KeyA')) { wx += fz; wz -= fx; }
    if (k.has('KeyD')) { wx -= fz; wz += fx; }
    const wl = Math.hypot(wx, wz) || 1;
    wx = (wx / wl) * speed;
    wz = (wz / wl) * speed;

    const region = (this.region = regionAt(this.pos.x, this.pos.z));
    const inWater = (region.region === 'canal' || region.region === 'sea') && this.pos.y < WATER_Y - 0.5;
    const accel = this.onGround || this.fly || inWater ? 14 : 3;
    const a = 1 - Math.exp(-accel * dt);
    this.vel.x += (wx - this.vel.x) * a;
    this.vel.z += (wz - this.vel.z) * a;

    if (this.fly) {
      const up = (k.has('Space') ? 1 : 0) - (k.has('KeyC') || k.has('ControlLeft') ? 1 : 0);
      this.vel.y = up * speed;
    } else if (inWater) {
      this.vel.y += (-1.5 - this.vel.y) * Math.min(1, dt * 3);
      if (k.has('Space')) this.vel.y = 3;
      this.vel.x *= 0.6;
      this.vel.z *= 0.6;
    } else {
      this.vel.y -= GRAVITY * dt;
      if (k.has('Space') && this.onGround) {
        this.vel.y = JUMP_V;
        this.onGround = false;
      }
    }

    // 分步积分，防止高速穿墙
    const dist = Math.hypot(this.vel.x, this.vel.y, this.vel.z) * dt;
    const n = Math.max(1, Math.ceil(dist / 0.2));
    const h = dt / n;
    const wasGround = this.onGround;
    this.onGround = false;
    for (let i = 0; i < n; i++) {
      const feet = this.pos.y;
      this.pos.x += this.vel.x * h;
      this.pos.z += this.vel.z * h;
      col.resolve(this.pos, R, HEIGHT);

      if (this.vel.y > 0) {
        const c = col.ceilingAt(this.pos.x, this.pos.z, R, this.pos.y + HEIGHT, this.vel.y * h + 0.05);
        if (c < Infinity) {
          this.pos.y = c - HEIGHT - 0.01;
          this.vel.y = 0;
        }
      }
      this.pos.y += this.vel.y * h;
      const g = col.groundAt(this.pos.x, this.pos.z, R, Math.max(feet, this.pos.y));
      if (this.pos.y <= g + 1e-3) {
        this.pos.y = g;
        if (this.vel.y < 0) this.vel.y = 0;
        this.onGround = true;
      } else if (!this.fly && wasGround && this.vel.y <= 0 && this.pos.y - g < 0.55) {
        // 下台阶时贴地，避免一级一级"弹"下去
        this.pos.y = g;
        this.vel.y = 0;
        this.onGround = true;
      }
    }

    // 兜底：泡在水里太久自动爬上最近的岸；掉出世界回出生点
    this.waterTime = inWater ? this.waterTime + dt : 0;
    if (this.waterTime > 2.5) this.climbOut();
    if (this.pos.y < -60) this.teleport(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN.yaw, 0);
  }

  climbOut() {
    const { x, z } = this.pos;
    for (let r = 2; r <= 60; r += 2) {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        const reg = regionAt(px, pz);
        if (reg.region !== 'island' && reg.region !== 'outside') continue;
        // 再往岸里走 1.5 m
        const qx = px + Math.cos(a) * 1.5;
        const qz = pz + Math.sin(a) * 1.5;
        const g = this.ctx.collision.groundAt(qx, qz, R, reg.y + 0.4);
        if (Math.abs(g - reg.y) < 0.6) {
          this.teleport(qx, g, qz);
          this.waterTime = 0;
          return;
        }
      }
    }
    this.teleport(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN.yaw, 0);
  }

  applyTo(camera) {
    camera.position.set(this.pos.x, this.pos.y + EYE, this.pos.z);
    camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}

// 自动巡游：沿地标串成的样条飞一圈
export function makeTour() {
  const L = LANDMARKS;
  const g = valleyToWorld(0, 200);
  const v = valleyToWorld(0, 90);
  const keys = [
    // [相机位置, 注视点]
    [[g[0] + 60, 60, g[1] + 60], [v[0], 0, v[1]]],
    [[v[0] + 40, 40, v[1] - 40], [0, 10, 0]],
    [[60, 55, 60], [L.fountain.center[0], 0, L.fountain.center[1]]],
    [[-90, 60, 110], [L.sanctum.center[0], 30, L.sanctum.center[1]]],
    [[-230, 70, 0], [L.lionsMemorial.center[0], 0, L.lionsMemorial.center[1]]],
    [[-60, 50, -80], [L.cathedral.center[0], 25, L.cathedral.center[1]]],
    [[-120, 70, -330], [-100, 0, -240]],
    [[60, 70, -280], [L.greatForge.center[0], 0, L.greatForge.center[1]]],
    [[230, 60, -40], [L.keep.center[0], 20, L.keep.center[1]]],
    [[420, 110, 60], [150, 0, -100]],
  ];
  const pos = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[0])), true, 'centripetal');
  const tgt = new THREE.CatmullRomCurve3(keys.map((k) => new THREE.Vector3(...k[1])), true, 'centripetal');
  return { pos, tgt, duration: 150 };
}

export function makeOverviewControls(camera, dom) {
  const c = new OrbitControls(camera, dom);
  const [x0, z0, x1, z1] = CITY_BOUNDS;
  c.target.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  c.minDistance = 30;
  c.maxDistance = 1400;
  c.maxPolarAngle = Math.PI * 0.47;
  c.enableDamping = true;
  c.dampingFactor = 0.08;
  c.enabled = false;
  return c;
}
