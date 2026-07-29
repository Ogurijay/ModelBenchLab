// 第一人称控制器:地面指数逼近 + 强空中操控(不吞飞跃动量)、跳跃缓冲 / 土狼时间、
// 穿门后的朝向重建与滚转平滑(L4:穿越瞬间视角不会硬切)。
import { makeEntity, GRAVITY } from './motion.js';
import { throughDir, yawPitchFromForward, cross, normalize, dot } from '../core/transform.js';

export const PLAYER_HALF = [0.3, 0.9, 0.3];
export const EYE_OFFSET = 0.65; // 眼高 1.55m
export const WALK_SPEED = 4.6;
export const AIR_ACCEL = 22; // 空中操控给足:飞跃落点可修正,也能从地面门弹出后挪开
export const JUMP_SPEED = 6.0; // 起跳高 1.0m,滞空 0.667s → 平地跳距约 3.07m
export const TERMINAL_SPEED = 45;
const COYOTE = 0.1;
const JUMP_BUFFER = 0.12;

export class Player {
  constructor() {
    this.ent = makeEntity([0, 0.9, 0], PLAYER_HALF, [0, 0, 0]);
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0; // 穿门后的临时滚转,指数衰减回 0
    this.keys = Object.create(null);
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.gun = 'none';
  }

  reset(spawn) {
    this.ent.pos = [...spawn.pos];
    this.ent.vel = [0, 0, 0];
    this.ent.onGround = false;
    this.yaw = spawn.yaw || 0;
    this.pitch = 0;
    this.roll = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
  }

  eye() {
    const p = this.ent.pos;
    return [p[0], p[1] + EYE_OFFSET, p[2]];
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return [-cp * Math.sin(this.yaw), Math.sin(this.pitch), -cp * Math.cos(this.yaw)];
  }

  look(dx, dy, sensitivity = 0.0022) {
    this.yaw -= dx * sensitivity;
    this.pitch = Math.max(-1.54, Math.min(1.54, this.pitch - dy * sensitivity));
  }

  queueJump() { this.jumpBuffer = JUMP_BUFFER; }

  wishDir() {
    const k = this.keys;
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    if (!f && !s) return null;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const x = -sy * f + cy * s;
    const z = -cy * f - sy * s;
    const l = Math.hypot(x, z) || 1;
    return [x / l, z / l];
  }

  /** 每个物理子步的加速度/跳跃处理(移动本身交给 motion.stepEntity) */
  prestep(h) {
    const v = this.ent.vel;
    const wish = this.wishDir();
    if (this.ent.onGround) {
      const t = Math.min(1, 14 * h);
      v[0] += ((wish ? wish[0] * WALK_SPEED : 0) - v[0]) * t;
      v[2] += ((wish ? wish[1] * WALK_SPEED : 0) - v[2]) * t;
    } else if (wish) {
      // 只在「意愿方向上的分速度」低于步行速度时补,飞跃的高速分量不会被削
      const along = v[0] * wish[0] + v[2] * wish[1];
      if (along < WALK_SPEED) {
        const add = Math.min(AIR_ACCEL * h, WALK_SPEED - along);
        v[0] += wish[0] * add;
        v[2] += wish[1] * add;
      }
    }
    if (this.jumpBuffer > 0 && (this.ent.onGround || this.coyote > 0)) {
      v[1] = JUMP_SPEED;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.ent.onGround = false;
    }
    v[1] -= GRAVITY * h;
    const speed = Math.hypot(v[0], v[1], v[2]);
    if (speed > TERMINAL_SPEED) {
      const k = TERMINAL_SPEED / speed;
      v[0] *= k; v[1] *= k; v[2] *= k;
    }
    this.jumpBuffer -= h;
    if (this.ent.onGround) this.coyote = COYOTE;
    else this.coyote -= h;
  }

  /** 穿门:朝向由变换后的前向量重建;上向量的偏差转成一段会自动回正的滚转 */
  onTeleport(from, to) {
    const fwd = throughDir(from.frame, to.frame, this.forward());
    const up = throughDir(from.frame, to.frame, [0, 1, 0]);
    const yp = yawPitchFromForward(fwd);
    // 出口是地面/天花板门时朝向会退化成竖直:此时用变换后的上向量定水平朝向,
    // 并把俯仰夹在 ±69°,免得弹出瞬间「仰面朝天」既晕又没法用 WASD 走开。
    const horiz = Math.hypot(fwd[0], fwd[2]);
    if (horiz < 0.25) {
      // 俯仰接近 ±90° 时相机的水平朝向由「上向量」决定:camUp 的水平投影是 (sin yaw, cos yaw),
      // 所以要取 atan2(up.x, up.z);取成反向会让朝向整整差 180°,按住 W 反而把飞跃刹停。
      const uh = Math.hypot(up[0], up[2]);
      if (uh > 1e-4) yp.yaw = Math.atan2(up[0], up[2]);
    }
    this.yaw = yp.yaw;
    this.pitch = Math.max(-1.2, Math.min(1.2, yp.pitch));
    const f = normalize(fwd);
    let right = cross(f, [0, 1, 0]);
    if (Math.hypot(right[0], right[1], right[2]) < 1e-4) right = [1, 0, 0];
    right = normalize(right);
    const camUp = cross(right, f);
    // three 的 YXZ 欧拉给出 camera_up = −sin(roll)·right + cos(roll)·camUp,
    // 因此与穿门后的上向量连续所需的 roll 是 atan2(−up·right, up·camUp);符号取反会朝反方向甩。
    const roll = Math.atan2(-dot(up, right), dot(up, camUp));
    this.roll = Math.max(-Math.PI, Math.min(Math.PI, roll));
  }

  updateVisual(dt) {
    // 滚转在 ~0.25s 内平滑归零
    this.roll *= Math.exp(-dt / 0.09);
    if (Math.abs(this.roll) < 1e-3) this.roll = 0;
  }
}
