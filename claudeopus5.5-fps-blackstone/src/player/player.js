// 玩家：竖直圆柱体移动（行走/冲刺/蹲伏/滑铲/跳跃）、生命与护甲、镜头（晃动/后坐/震屏）。

import * as THREE from 'three';
import { clamp, damp, DEG, Spring, smoothstep } from '../core/util.js';

const STAND_H = 1.8, CROUCH_H = 1.15;
const STAND_EYE = 1.64, CROUCH_EYE = 0.98;

export class Player {
  constructor(world) {
    this.world = world;
    this.body = {
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      radius: 0.34,
      height: STAND_H,
      step: 0.45,
      snap: 0.38,
      grounded: true,
      ground: null,
    };
    this.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  }

  reset(sp) {
    const b = this.body;
    b.pos.set(sp.x, sp.y ?? 0, sp.z);
    b.vel.set(0, 0, 0);
    b.height = STAND_H;
    b.grounded = true;
    this.yaw = sp.yaw ?? 0;
    this.pitch = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 25;
    this.maxArmor = 100;
    this.alive = true;
    this.crouchK = 0;
    this.crouching = false;
    this.sprinting = false;
    this.sliding = 0;
    this.slideCd = 0;
    this.eye = STAND_EYE;
    this.eyeSmoothY = b.pos.y;
    this.bobPhase = 0;
    this.moveK = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.stepDist = 0;
    this.recoilP = 0;
    this.recoilY = 0;
    this.recoilTP = 0;
    this.recoilTY = 0;
    this.lastShot = 0;
    this.trauma = 0;
    this.time = 0;
    this.lastDamage = -100;
    this.damageDirs = [];
    this.land = new Spring(160, 13);
    this.roll = 0;
    this.lastSafe = b.pos.clone();
    this.speedMul = 1;
    this.adsK = 0;
    this.footstep = null; // 回调 (surface, volume)
    this.onLand = null;
    this.noclip = false;
  }

  get pos() {
    return this.body.pos;
  }

  forward(out) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  /** 视线方向（含后坐偏移） */
  aimDir(out) {
    const p = this.pitch + this.recoilP, y = this.yaw + this.recoilY;
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }

  look(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = clamp(this.pitch, -89 * DEG, 89 * DEG);
  }

  addRecoil(pitchDeg, yawDeg) {
    this.recoilTP += pitchDeg * DEG;
    this.recoilTY += yawDeg * DEG;
    this.recoilTP = Math.min(this.recoilTP, 14 * DEG);
    this.lastShot = this.time;
  }

  addTrauma(t) {
    this.trauma = Math.min(1, this.trauma + t);
  }

  /**
   * 移动更新。inp: { fwd, strafe, jump(pressed), jumpHeld, sprint, crouch, crouchPressed, firing }
   */
  update(dt, inp, recoverRate) {
    this.time += dt;
    const b = this.body;
    if (!this.alive) {
      b.vel.x *= Math.exp(-6 * dt);
      b.vel.z *= Math.exp(-6 * dt);
      this.world.moveBody(b, dt, 22);
      this.crouchK = damp(this.crouchK, 1, 3, dt);
      this.eye = damp(this.eye, 0.3, 2.5, dt);
      return;
    }

    // 蹲伏与站起空间检查
    let wantCrouch = inp.crouch || this.sliding > 0;
    if (!wantCrouch && this.crouching) {
      const ceil = this.world.ceilingAt(b.pos.x, b.pos.z, b.radius * 0.9, b.pos.y + CROUCH_H - 0.05);
      if (ceil < b.pos.y + STAND_H) wantCrouch = true;
    }
    this.crouching = wantCrouch;
    b.height = this.crouching ? CROUCH_H : STAND_H;
    this.crouchK = damp(this.crouchK, this.crouching ? 1 : 0, 12, dt);

    // 冲刺：前进且未蹲、未开火、未开镜
    const moving = Math.abs(inp.fwd) + Math.abs(inp.strafe) > 0;
    this.sprinting = inp.sprint && inp.fwd > 0 && !this.crouching && !inp.firing && this.adsK < 0.3;

    // 滑铲
    this.slideCd -= dt;
    const hs = Math.hypot(b.vel.x, b.vel.z);
    if (inp.crouchPressed && b.grounded && hs > 6.2 && this.slideCd <= 0 && this.sliding <= 0) {
      this.sliding = 0.85;
      this.slideCd = 1.1;
      const k = Math.max(hs, 9.6) / hs;
      b.vel.x *= k;
      b.vel.z *= k;
      this.crouching = true;
      b.height = CROUCH_H;
      if (this.onSlide) this.onSlide();
    }

    // 期望速度
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = fx * inp.fwd + rx * inp.strafe;
    let wz = fz * inp.fwd + rz * inp.strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) {
      wx /= wl;
      wz /= wl;
    }
    let maxSpeed = this.sprinting ? 7.6 : this.crouching ? 2.7 : 5.0;
    if (!this.sprinting && inp.fwd < 0) maxSpeed *= 0.85;
    maxSpeed *= this.speedMul * (1 - this.adsK * (1 - (this.adsMoveMul ?? 0.7)));

    if (this.sliding > 0) {
      this.sliding -= dt;
      const dec = 5.5;
      const sp = Math.hypot(b.vel.x, b.vel.z);
      const ns = Math.max(0, sp - dec * dt);
      if (sp > 0) {
        b.vel.x *= ns / sp;
        b.vel.z *= ns / sp;
      }
      // 轻微转向
      if (wl > 0) {
        b.vel.x += wx * 4 * dt;
        b.vel.z += wz * 4 * dt;
      }
      if (ns < 3.5 || !b.grounded) this.sliding = 0;
    } else if (b.grounded) {
      const tx = wx * maxSpeed, tz = wz * maxSpeed;
      let dx = tx - b.vel.x, dz = tz - b.vel.z;
      const dl = Math.hypot(dx, dz);
      const acc = (wl > 0 ? 55 : 40) * dt;
      if (dl > acc) {
        dx *= acc / dl;
        dz *= acc / dl;
      }
      b.vel.x += dx;
      b.vel.z += dz;
    } else {
      // 空中：有限加速，不超过当前/目标速度
      const tx = wx * maxSpeed, tz = wz * maxSpeed;
      const acc = 9 * dt;
      if (wl > 0) {
        const cur = Math.hypot(b.vel.x, b.vel.z);
        b.vel.x += Math.sign(tx - b.vel.x) * Math.min(Math.abs(tx - b.vel.x), acc);
        b.vel.z += Math.sign(tz - b.vel.z) * Math.min(Math.abs(tz - b.vel.z), acc);
        const nw = Math.hypot(b.vel.x, b.vel.z);
        const lim = Math.max(cur, maxSpeed);
        if (nw > lim) {
          b.vel.x *= lim / nw;
          b.vel.z *= lim / nw;
        }
      }
    }

    // 跳跃（土狼时间 + 预输入）
    if (b.grounded) this.coyote = 0.1;
    else this.coyote -= dt;
    if (inp.jump) this.jumpBuffer = 0.12;
    else this.jumpBuffer -= dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      const ceil = this.world.ceilingAt(b.pos.x, b.pos.z, b.radius * 0.9, b.pos.y + b.height - 0.05);
      if (ceil > b.pos.y + b.height + 0.3) {
        b.vel.y = 7.1;
        b.grounded = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        if (this.sliding > 0) {
          this.sliding = 0;
          b.vel.x *= 1.05;
          b.vel.z *= 1.05;
        }
        if (this.onJump) this.onJump();
      }
    }

    const prevX = b.pos.x, prevZ = b.pos.z, prevY = b.pos.y;
    const wasGrounded = b.grounded;
    const impact = this.world.moveBody(b, dt, 22);
    if (impact > 3) {
      this.land.impulse(-Math.min(impact, 16) * 0.012);
      if (this.onLand) this.onLand(impact);
    }
    // 台阶抬升平滑：脚下突然上移时镜头缓动
    if (b.grounded && wasGrounded && b.pos.y - prevY > 0.05) this.eyeSmoothY = Math.min(this.eyeSmoothY, b.pos.y);
    this.eyeSmoothY = b.grounded ? damp(this.eyeSmoothY, b.pos.y, 18, dt) : b.pos.y;
    if (this.eyeSmoothY > b.pos.y) this.eyeSmoothY = b.pos.y;

    if (b.grounded) this.lastSafe.copy(b.pos);
    if (b.pos.y < -20) {
      b.pos.copy(this.lastSafe);
      b.vel.set(0, 0, 0);
    }

    // 步伐与脚步声
    const moved = Math.hypot(b.pos.x - prevX, b.pos.z - prevZ);
    const sp = moved / Math.max(dt, 1e-5);
    this.moveK = damp(this.moveK, b.grounded ? clamp(sp / 5, 0, 1.5) : 0, 10, dt);
    if (b.grounded && this.sliding <= 0) {
      const stride = this.sprinting ? 2.5 : this.crouching ? 1.5 : 2.05;
      this.bobPhase += (moved / stride) * Math.PI;
      this.stepDist += moved;
      if (this.stepDist > stride) {
        this.stepDist -= stride;
        if (this.footstep) this.footstep(this.surface(), this.crouching ? 0.25 : this.sprinting ? 0.8 : 0.5);
      }
    }

    // 后坐回正
    if (this.time - this.lastShot > 0.1) {
      const rec = (recoverRate ?? 8) * DEG * dt;
      this.recoilTP = Math.sign(this.recoilTP) * Math.max(0, Math.abs(this.recoilTP) - rec);
      this.recoilTY = Math.sign(this.recoilTY) * Math.max(0, Math.abs(this.recoilTY) - rec * 0.8);
    }
    this.recoilP = damp(this.recoilP, this.recoilTP, 28, dt);
    this.recoilY = damp(this.recoilY, this.recoilTY, 28, dt);

    // 侧倾
    const targetRoll = -inp.strafe * 1.1 * DEG * (b.grounded ? 1 : 0.5) + (this.sliding > 0 ? -4 * DEG : 0);
    this.roll = damp(this.roll, targetRoll, 8, dt);

    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.land.update(dt);
    const eyeT = this.crouching ? CROUCH_EYE : STAND_EYE;
    this.eye = damp(this.eye, eyeT, 14, dt);

    // 自然回复：受伤 5 秒后缓慢回到 30
    if (this.time - this.lastDamage > 5 && this.health < 30) this.health = Math.min(30, this.health + 4 * dt);
    this.damageDirs = this.damageDirs.filter((d) => this.time - d.t < 1.6);
  }

  surface() {
    const g = this.body.ground;
    if (g && g.surface) return g.surface;
    return this.world.groundSurface(this.body.pos.x, this.body.pos.z);
  }

  /** 设置相机 */
  applyCamera(cam, time) {
    const b = this.body;
    const bobAmt = this.moveK * (this.sprinting ? 1.4 : 1) * (1 - this.adsK * 0.8) * (this.sliding > 0 ? 0 : 1);
    const by = -Math.abs(Math.sin(this.bobPhase)) * 0.045 * bobAmt + 0.022 * bobAmt;
    const bx = Math.cos(this.bobPhase) * 0.025 * bobAmt;
    const sh = this.trauma * this.trauma;
    const n1 = Math.sin(time * 37.1) + Math.sin(time * 23.3) * 0.5;
    const n2 = Math.sin(time * 31.7 + 2) + Math.sin(time * 19.1) * 0.5;
    const n3 = Math.sin(time * 27.9 + 4);
    const ex = Math.cos(this.yaw) * bx, ez = -Math.sin(this.yaw) * bx;
    cam.position.set(b.pos.x + ex, this.eyeSmoothY + this.eye + by + this.land.value, b.pos.z + ez);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(
      this.pitch + this.recoilP + n1 * sh * 0.035,
      this.yaw + this.recoilY + n2 * sh * 0.035,
      this.roll + n3 * sh * 0.05 + Math.sin(this.bobPhase) * 0.004 * bobAmt,
    );
    cam.updateMatrixWorld(true);
  }

  /** 受伤。返回实际扣除的生命值 */
  takeDamage(amount, fromX, fromZ) {
    if (!this.alive) return 0;
    const absorbed = Math.min(this.armor, amount * 0.6);
    const hadArmor = this.armor > 0;
    this.armor -= absorbed;
    const dmg = amount - absorbed;
    this.health -= dmg;
    this.lastDamage = this.time;
    this.addTrauma(Math.min(0.5, amount / 50));
    if (fromX !== undefined) {
      const ang = Math.atan2(fromX - this.body.pos.x, fromZ - this.body.pos.z);
      this.damageDirs.push({ ang, t: this.time, k: Math.min(1, amount / 25) });
    }
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
    this.armorBroke = hadArmor && this.armor <= 0;
    return dmg;
  }

  heal(n) {
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + n);
    return this.health - before;
  }
  addArmor(n) {
    const before = this.armor;
    this.armor = Math.min(this.maxArmor, this.armor + n);
    return this.armor - before;
  }

  /** 视为“被看见的程度”，供 AI 判断（蹲伏 / 静止更难发现） */
  stealth() {
    return (this.crouching ? 0.6 : 1) * (0.7 + 0.3 * clamp(Math.hypot(this.body.vel.x, this.body.vel.z) / 5, 0, 1));
  }

  eyePos(out) {
    return out.set(this.body.pos.x, this.eyeSmoothY + this.eye, this.body.pos.z);
  }
  chestPos(out) {
    return out.set(this.body.pos.x, this.body.pos.y + (this.crouching ? 0.75 : 1.2), this.body.pos.z);
  }
}

export { smoothstep };
