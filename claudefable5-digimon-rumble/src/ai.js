// CPU 控制器:分层状态机(接近 / 压制 / 后撤 / 防御反应 / 远程 / 进化),
// 带反应延迟与决策抖动,输出与键盘一致的虚拟输入。
import { RULES } from './config.js';
import { PLATFORMS } from './arena.js';

export class AiController {
  constructor(fighter, opponent, difficulty = 1) {
    this.f = fighter;
    this.op = opponent;
    this.diff = difficulty;            // 0.6 简单 / 1 普通 / 1.4 困难
    this.mode = 'approach';
    this.modeTimer = 0;
    this.reactTimer = 0;
    this.jumpCooldown = 0;
    this.specialCooldown = 1.5;
    this.guardHold = 0;
  }

  update(dt) {
    const f = this.f, op = this.op;
    const inp = f.input;
    for (const k in inp) inp[k] = 0;
    if (f.controlLocked) return;

    this.modeTimer -= dt;
    this.reactTimer -= dt;
    this.jumpCooldown -= dt;
    this.specialCooldown -= dt;
    this.guardHold -= dt;

    const dx = op.pos.x - f.pos.x;
    const adx = Math.abs(dx);
    const dy = op.pos.y - f.pos.y;
    const dir = Math.sign(dx) || 1;
    const meleeRange = 1.5 + f.bodyRadius + op.bodyRadius;

    // —— 进化优先 ——
    if (f.canEvolve && this.reactTimer <= 0) {
      inp.evolve = 1;
      return;
    }

    // —— 对手攻击/弹幕时概率防御 ——
    const opThreat = (op.state === 'attack' || op.state === 'special') && adx < meleeRange * 1.6;
    if (opThreat && this.guardHold <= 0 && Math.random() < 0.02 * this.diff * 60 * dt) {
      this.guardHold = 0.35 + Math.random() * 0.3;
    }
    if (this.guardHold > 0 && f.onGround) {
      inp.guard = 1;
      return;
    }

    // —— 模式切换 ——
    if (this.modeTimer <= 0) {
      const r = Math.random();
      const lowHp = f.hp < f.maxHp * 0.3;
      if (lowHp && r < 0.3) this.mode = 'retreat';
      else if (adx > 5 && r < 0.35 && f.energy >= 1) this.mode = 'zone';
      else if (r < 0.75) this.mode = 'approach';
      else this.mode = 'retreat';
      this.modeTimer = 0.7 + Math.random() * 1.1;
    }

    switch (this.mode) {
      case 'approach': {
        // 走向对手
        if (adx > meleeRange * 0.72) {
          if (dir > 0) inp.right = 1; else inp.left = 1;
        }
        // 对手在上方平台:跳追
        if (dy > 1.6 && this.jumpCooldown <= 0 && f.onGround) {
          inp.up = 1;
          this.jumpCooldown = 0.5;
        }
        // 追击空中二段跳
        if (!f.onGround && dy > 1.2 && f.jumpsLeft > 0 && this.jumpCooldown <= 0) {
          inp.up = 1;
          this.jumpCooldown = 0.5;
        }
        // 进入攻击范围出手(反应延迟随难度;出手后概率拉开,避免无限压制)
        if (adx <= meleeRange && Math.abs(dy) < 1.4) {
          if (this.reactTimer <= 0) {
            inp.attack = 1;
            this.reactTimer = (0.62 - 0.18 * this.diff) + Math.random() * 0.45;
            if (Math.random() < 0.35) { this.mode = 'retreat'; this.modeTimer = 0.5; }
          }
        }
        // 偶尔近身必杀
        if (adx < 4 && this.specialCooldown <= 0 && f.energy >= 1 && Math.random() < 0.3) {
          inp.special = 1;
          this.specialCooldown = 2.4 - this.diff * 0.6;
        }
        break;
      }
      case 'zone': {
        // 拉开距离放弹幕
        if (adx < 4.5) { if (dir > 0) inp.left = 1; else inp.right = 1; }
        if (this.specialCooldown <= 0 && f.energy >= 1 && Math.abs(dy) < 1.2) {
          inp.special = 1;
          this.specialCooldown = 1.6 - this.diff * 0.4 + Math.random();
        }
        break;
      }
      case 'retreat': {
        if (dir > 0) inp.left = 1; else inp.right = 1;
        // 撤到平台上回避
        const nearPlat = PLATFORMS.find((p) => Math.abs(p.x - f.pos.x) < 2.5);
        if (nearPlat && f.onGround && this.jumpCooldown <= 0) {
          inp.up = 1;
          this.jumpCooldown = 0.8;
        }
        // 贴边就别再退
        if (Math.abs(f.pos.x) > RULES.stageHalfWidth - 1.2) {
          inp.left = inp.right = 0;
          this.mode = 'approach';
        }
        break;
      }
    }

    // 台边保命:自己在空中且不在台上方 → 往回跳
    if (!f.onGround && Math.abs(f.pos.x) > RULES.stageHalfWidth - 0.4) {
      if (f.pos.x > 0) { inp.left = 1; inp.right = 0; } else { inp.right = 1; inp.left = 0; }
      if (f.jumpsLeft > 0 && f.vel.y < -2 && this.jumpCooldown <= 0) {
        inp.up = 1;
        this.jumpCooldown = 0.4;
      }
    }
  }
}
