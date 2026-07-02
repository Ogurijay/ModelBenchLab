import { Tank } from './Tank.js';
import { ENEMY_TYPES, ENEMY_SPAWN_PROTECT, DIR_LIST } from '../core/constants.js';

// 敌方坦克 AI：周期性重新决策方向（偏向目标但保留随机性），
// 连续被阻挡时强制换向以避免卡死在角落；开火按各类型的间隔随机触发。
export class EnemyTank extends Tank {
  constructor({ type, x, z, isBonus = false }) {
    const stat = ENEMY_TYPES[type];
    super({ x, z, direction: 'down', speed: stat.speed, hp: stat.hp });
    this.team = 'enemy';
    this.type = type;
    this.stat = stat;
    this.isBonus = isBonus;
    this.invulnTimer = ENEMY_SPAWN_PROTECT; // 出生闪烁保护期：期间不可被击中，也不能移动/开火
    this.decisionTimer = 0.4 + Math.random() * 0.6;
    this.blockedStreak = 0;
    this.fireTimer = 0.6 + Math.random() * stat.fireMax;
  }

  pickDirection(targetX, targetZ) {
    const dx = targetX - this.x;
    const dz = targetZ - this.z;
    const candidates = [];
    if (Math.abs(dx) > 0.5) candidates.push(dx > 0 ? 'right' : 'left');
    if (Math.abs(dz) > 0.5) candidates.push(dz > 0 ? 'down' : 'up');
    if (candidates.length && Math.random() < 0.65) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return DIR_LIST[Math.floor(Math.random() * DIR_LIST.length)];
  }

  // ctx: { grid, blockers, target:{x,z}, frozen:boolean }
  update(dt, ctx) {
    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
      return { wantsFire: false };
    }
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    if (ctx.frozen) return { wantsFire: false };

    this.decisionTimer -= dt;
    let dir = this.direction;
    if (this.decisionTimer <= 0) {
      dir = this.pickDirection(ctx.target.x, ctx.target.z);
      this.decisionTimer = 0.6 + Math.random() * 1.3;
    }

    const moved = this.tryMove(dir, dt, ctx.grid, ctx.blockers);
    if (!moved) {
      this.blockedStreak++;
      if (this.blockedStreak >= 2) {
        const others = DIR_LIST.filter((d) => d !== dir);
        this.direction = others[Math.floor(Math.random() * others.length)];
        this.decisionTimer = 0.15;
        this.blockedStreak = 0;
      }
    } else {
      this.blockedStreak = 0;
    }

    this.fireTimer -= dt;
    let wantsFire = false;
    if (this.fireTimer <= 0) {
      wantsFire = true;
      this.fireTimer = this.stat.fireMin + Math.random() * (this.stat.fireMax - this.stat.fireMin);
    }
    return { wantsFire };
  }
}
