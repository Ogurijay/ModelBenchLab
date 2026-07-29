// 角色实体:双形态(成长期/究极体)模型、动画状态机、平台物理、连段/必杀/防御/受击/进化。
// 输入由控制器(键盘或 AI)写入 this.input,每帧 update 消费。
import * as THREE from 'three';
import { RULES, COMBO, AIR_ATTACK } from './config.js';
import { PLATFORMS } from './arena.js';

const S = {
  IDLE: 'idle', RUN: 'run', AIR: 'air', ATTACK: 'attack', AIR_ATTACK: 'airattack',
  SPECIAL: 'special', GUARD: 'guard', HITSTUN: 'hitstun', LAUNCHED: 'launched',
  DOWN: 'down', EVOLVE: 'evolve', VICTORY: 'victory', KO: 'ko', INTRO: 'intro',
};

export class Fighter {
  /**
   * @param cfg  ROSTER 条目
   * @param baseInst instantiate() 结果(成长期)
   * @param megaInst instantiate() 结果(究极体),boss 角色为 null
   */
  constructor(cfg, baseInst, megaInst, scene, side) {
    this.cfg = cfg;
    this.side = side;               // 0 = P1(初始在左) 1 = P2
    this.scene = scene;
    this.baseInst = baseInst;
    this.megaInst = megaInst;
    this.isMega = !!cfg.boss;       // 隐藏角色常驻究极体数值(用 base 模型字段承载)
    this.form = 'base';
    this.inst = baseInst;
    scene.add(baseInst.root);
    if (megaInst) { megaInst.root.visible = false; scene.add(megaInst.root); }

    // —— 战斗数值 ——
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.energy = RULES.energyMax;  // 必杀能量(格)
    this.evo = 0;                   // 进化槽 0..100
    this.evoTimer = 0;              // 究极体剩余时间
    this.roundsWon = 0;

    // —— 物理 ——
    this.pos = new THREE.Vector3(side === 0 ? -4 : 4, 0, 0);
    this.vel = new THREE.Vector3();
    this.onGround = true;
    this.platform = null;           // 所站浮台
    this.jumpsLeft = 2;
    this.facing = side === 0 ? 1 : -1;
    this.dropThrough = 0;           // 下穿浮台计时

    // —— 状态机 ——
    this.state = S.IDLE;
    this.stateTime = 0;
    this.stateDur = 0;              // 一次性状态的时长
    this.invuln = 0;
    this.comboStep = 0;
    this.comboBuffer = false;       // 连段预输入
    this.comboLate = 0;             // 连段窗口计时
    this.attackSpec = null;         // 当前攻击段配置
    this.attackHasHit = false;
    this.specialFired = false;
    this.guardHeld = false;
    this.controlLocked = false;     // 回合演出锁

    this.input = { left: 0, right: 0, up: 0, down: 0, attack: 0, special: 0, guard: 0, evolve: 0 };
    this._prev = { up: 0, attack: 0, special: 0, evolve: 0 };

    this.currentAction = null;
    this._play('bn01', true);
    this._syncTransform();
  }

  // ============ 属性(随形态) ============
  get attackMul() { return this.cfg.attack * (this.form === 'mega' ? this.cfg.mega.atkMul : 1); }
  get speed() { return this.cfg.speed * (this.form === 'mega' ? this.cfg.mega.spdMul : 1); }
  get jumpPower() { return this.cfg.jump; }
  get height() { return this.inst.height; }
  get bodyRadius() { return Math.max(0.42, this.inst.width * 0.33); }
  get center() { return new THREE.Vector3(this.pos.x, this.pos.y + this.height * 0.5, 0); }
  get displayName() { return this.form === 'mega' ? this.cfg.mega.name : this.cfg.name; }
  get special() { return this.form === 'mega' ? this.cfg.mega.special : this.cfg.special; }
  get canEvolve() { return !this.cfg.boss && this.form === 'base' && this.evo >= RULES.evoMax; }

  // ============ 动画 ============
  _clip(name) {
    const clips = this.inst.clips;
    return clips.get(name) || clips.get('bn01') || clips.values().next().value;
  }

  _play(name, loop = false, fade = 0.12, timeScale = 1) {
    const clip = this._clip(name);
    if (!clip) return 0;
    const action = this.inst.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.timeScale = timeScale;
    if (this.currentAction && this.currentAction !== action) {
      action.crossFadeFrom(this.currentAction, fade, false);
    }
    action.play();
    this.currentAction = action;
    return clip.duration / timeScale;
  }

  _setState(st, animDur = 0) {
    this.state = st;
    this.stateTime = 0;
    this.stateDur = animDur;
  }

  // ============ 形态切换 ============
  setForm(form) {
    if (form === this.form) return;
    this.form = form;
    const next = form === 'mega' ? this.megaInst : this.baseInst;
    this.inst.root.visible = false;
    this.inst = next;
    next.root.visible = true;
    this.currentAction = null;
    this._play('bn01', true, 0);
    if (form === 'mega') this.evoTimer = RULES.evoDuration;
    this._syncTransform();
  }

  // ============ 受击(由 battle 调用) ============
  applyHit(dmg, dir, knock, launch, hitstun, isGuardable = true) {
    if (this.invuln > 0 || this.state === S.DOWN || this.state === S.KO) return 'invuln';
    const guarding = this.state === S.GUARD && isGuardable;
    if (guarding) {
      this.hp = Math.max(1, this.hp - dmg * RULES.guardDamageMul);
      this.vel.x = dir * knock * RULES.guardChipKnock * 3;
      return 'guard';
    }
    this.hp = Math.max(0, this.hp - dmg);
    this.evo = Math.min(RULES.evoMax, this.evo + RULES.evoPerHitTaken);
    this.comboStep = 0;
    // 防无限连:连续受击计数,4 次后强制挣脱(短无敌 + 大击退)
    this.stunCombo = (this.stunCombo || 0) + 1;
    if (this.stunCombo >= 4 && launch <= 0) {
      this.invuln = 0.9;
      this.stunCombo = 0;
      this.vel.x = dir * knock * 2.5;
      this._setState(S.HITSTUN, Math.max(hitstun, this._play('bd01', false, 0.06) * 0.8));
      return 'hit';
    }
    // 究极体持续时间因受击缩短
    if (this.form === 'mega') this.evoTimer = Math.max(0, this.evoTimer - 1.2);

    if (this.hp <= 0) {
      this._setState(S.KO, this._play('bd02', false, 0.06));
      this.vel.set(dir * 7, 8, 0);
      this.onGround = false;
      return 'ko';
    }
    if (launch > 0) {
      this._setState(S.LAUNCHED, this._play('bd02', false, 0.06));
      this.vel.set(dir * knock, launch, 0);
      this.onGround = false;
      return 'launched';
    }
    this._setState(S.HITSTUN, Math.max(hitstun, this._play('bd01', false, 0.06) * 0.8));
    this.vel.x = dir * knock;
    return 'hit';
  }

  // 场外坠落惩罚回场
  ringOutRespawn() {
    this.hp = Math.max(1, this.hp - this.maxHp * 0.12);
    this.pos.set(0, 5.5, 0);
    this.vel.set(0, 0, 0);
    this.invuln = 2.0;
    this._setState(S.AIR, 0);
    this._play('bn01', true);
  }

  // ============ 主更新 ============
  update(dt, opponent, events) {
    const inp = this.input;
    const pressed = {
      up: inp.up && !this._prev.up,
      attack: inp.attack && !this._prev.attack,
      special: inp.special && !this._prev.special,
      evolve: inp.evolve && !this._prev.evolve,
    };
    this._prev.up = inp.up; this._prev.attack = inp.attack;
    this._prev.special = inp.special; this._prev.evolve = inp.evolve;

    this.stateTime += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dropThrough = Math.max(0, this.dropThrough - dt);
    this.comboLate = Math.max(0, this.comboLate - dt);
    this.energy = Math.min(RULES.energyMax, this.energy + RULES.energyRegen * dt);

    // 究极体退化倒计时
    if (this.form === 'mega' && this.state !== S.EVOLVE && this.state !== S.VICTORY && this.state !== S.KO) {
      this.evoTimer -= dt;
      if (this.evoTimer <= 0) {
        this.setForm('base');
        this.evo = 0;
        events.push({ type: 'devolve', who: this });
      }
    }

    const locked = this.controlLocked;

    switch (this.state) {
      case S.IDLE:
      case S.RUN: {
        if (locked) { this._toIdle(); break; }
        // 面向对手
        this.facing = opponent.pos.x >= this.pos.x ? 1 : -1;

        const move = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
        this.vel.x = move * this.speed;
        if (move !== 0 && this.state !== S.RUN) this._setState(S.RUN, this._play('br01', true));
        if (move === 0 && this.state !== S.IDLE) this._toIdle();

        if (pressed.evolve && this.canEvolve) { events.push({ type: 'evolveStart', who: this }); break; }
        if (pressed.attack) { this._startCombo(0); break; }
        if (pressed.special && this.energy >= RULES.specialCost) { this._startSpecial(events); break; }
        if (inp.guard) { this._setState(S.GUARD, 0); this._play('bg01', false); this.vel.x = 0; break; }
        if (pressed.up) { this._jump(events); break; }
        if (inp.down && this.platform) { this.dropThrough = 0.25; this.onGround = false; this._setState(S.AIR, 0); }
        break;
      }

      case S.AIR: {
        if (!locked) {
          const move = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
          this.vel.x = THREE.MathUtils.lerp(this.vel.x, move * this.speed, 0.12);
          if (pressed.up && this.jumpsLeft > 0) this._jump(events);
          if (pressed.attack) {
            this.attackSpec = { ...AIR_ATTACK, dmg: AIR_ATTACK.dmg * this.attackMul };
            this.attackHasHit = false;
            this._setState(S.AIR_ATTACK, this._play(AIR_ATTACK.anim, false, 0.08, 1.25));
            events.push({ type: 'swing', who: this });
          }
          if (pressed.special && this.energy >= RULES.specialCost) { this._startSpecial(events); break; }
          if (inp.down) this.vel.y = Math.min(this.vel.y, -13); // 快速下落
        }
        break;
      }

      case S.ATTACK:
      case S.AIR_ATTACK: {
        // 连段预输入
        if (pressed.attack) this.comboBuffer = true;
        if (this.stateTime >= this.stateDur) {
          if (this.state === S.ATTACK && this.comboBuffer && this.comboStep < COMBO.length - 1) {
            this._startCombo(this.comboStep + 1);
          } else {
            this.comboStep = 0;
            if (this.onGround) this._toIdle();
            else { this._setState(S.AIR, 0); this._play('bn01', true, 0.15, 0.6); }
          }
        }
        // 地面攻击有轻微前移
        if (this.state === S.ATTACK) this.vel.x = this.facing * 1.2;
        break;
      }

      case S.SPECIAL: {
        const spec = this.special;
        // 在动画 32% 处发射
        if (!this.specialFired && this.stateTime >= this.stateDur * 0.32) {
          this.specialFired = true;
          events.push({ type: 'projectile', who: this, spec });
        }
        this.vel.x = 0;
        if (this.stateTime >= this.stateDur) this.onGround ? this._toIdle() : this._setState(S.AIR, 0);
        break;
      }

      case S.GUARD: {
        this.vel.x = 0;
        if (!inp.guard && !locked) this._toIdle();
        break;
      }

      case S.HITSTUN: {
        this.vel.x = THREE.MathUtils.lerp(this.vel.x, 0, 0.1);
        if (this.stateTime >= this.stateDur) this._toIdle();
        break;
      }

      case S.LAUNCHED:
      case S.KO: {
        // 空中翻滚,落地后倒地
        if (this.onGround && this.vel.y <= 0.01 && this.stateTime > 0.15) {
          if (Math.abs(this.vel.x) > 4.5) {
            // 落地弹跳一次
            this.vel.y = 4.5;
            this.vel.x *= 0.55;
            this.onGround = false;
            events.push({ type: 'bounce', who: this });
          } else {
            const dur = this._play('bd03', false, 0.1);
            this._setState(this.state === S.KO ? S.KO : S.DOWN, Math.min(dur, 1.0));
            if (this.state !== S.KO) this.vel.x = 0;
          }
        }
        break;
      }

      case S.DOWN: {
        this.vel.x = 0;
        if (this.stateTime >= this.stateDur + 0.35) {
          this.invuln = RULES.hitInvulnAfterDown;
          this._toIdle();
        }
        break;
      }

      case S.EVOLVE:
      case S.VICTORY:
      case S.INTRO: {
        this.vel.x = 0;
        break;
      }
    }

    // ============ 物理 ============
    const wasGround = this.onGround;
    if (!this.onGround) this.vel.y += RULES.gravity * dt;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;

    // 主台碰撞(台面只在半宽内)
    const onMain = Math.abs(this.pos.x) <= RULES.stageHalfWidth + 0.3;
    if (this.pos.y <= RULES.floorY && onMain && this.vel.y <= 0 && this.dropThrough <= 0) {
      this.pos.y = RULES.floorY;
      if (!wasGround) events.push({ type: 'land', who: this });
      this.vel.y = 0;
      this.onGround = true;
      this.platform = null;
      this.jumpsLeft = 2;
    } else {
      // 浮台(单向)
      let landed = false;
      if (this.vel.y <= 0 && this.dropThrough <= 0) {
        for (const p of PLATFORMS) {
          const top = p.y;
          if (Math.abs(this.pos.x - p.x) <= p.halfW + 0.2 &&
              this.pos.y <= top && this.pos.y >= top - 0.6) {
            this.pos.y = top;
            if (!wasGround) events.push({ type: 'land', who: this });
            this.vel.y = 0;
            this.onGround = true;
            this.platform = p;
            this.jumpsLeft = 2;
            landed = true;
            break;
          }
        }
      }
      if (!landed) {
        // 走出平台边缘
        if (this.onGround) {
          const stillOnMain = this.pos.y <= RULES.floorY + 0.01 && onMain;
          const stillOnPlat = this.platform &&
            Math.abs(this.pos.x - this.platform.x) <= this.platform.halfW + 0.2;
          if (!stillOnMain && !stillOnPlat) {
            this.onGround = false;
            this.platform = null;
            if (this.state === S.IDLE || this.state === S.RUN) this._setState(S.AIR, 0);
          }
        } else {
          this.onGround = false;
        }
      }
    }

    // 空中状态动画兜底
    if (!this.onGround && (this.state === S.IDLE || this.state === S.RUN)) {
      this._setState(S.AIR, 0);
      this._play('bn01', true, 0.2, 0.55);
    }

    // 场外坠落
    if (this.pos.y < -7 && this.state !== S.KO) {
      events.push({ type: 'ringout', who: this });
    }
    // 出画面横向限制(击飞除外,让 KO 飞出去)
    if (this.state !== S.KO) {
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, -RULES.blastX, RULES.blastX);
    }

    this.inst.mixer.update(dt);
    this._syncTransform();
  }

  _toIdle() {
    this.stunCombo = 0; // 回到自由状态,受击链清零
    this._setState(S.IDLE, 0);
    this._play('bn01', true);
  }

  _jump(events) {
    this.vel.y = this.jumpPower * (this.jumpsLeft === 2 ? 1 : 0.88);
    this.jumpsLeft--;
    this.onGround = false;
    this.platform = null;
    this._setState(S.AIR, 0);
    this._play('bn01', true, 0.1, 0.55);
    events.push({ type: 'jump', who: this });
  }

  _startCombo(step) {
    this.comboStep = step;
    this.comboBuffer = false;
    const c = COMBO[step];
    this.attackSpec = { ...c, dmg: c.dmg * this.attackMul };
    this.attackHasHit = false;
    const speedUp = 1.35; // DSCS 战斗动画偏慢,加速到格斗手感
    this._setState(S.ATTACK, this._play(c.anim, false, 0.07, speedUp));
    this.comboLate = this.stateDur + RULES.comboWindow;
  }

  _startSpecial(events) {
    this.energy -= RULES.specialCost;
    this.specialFired = false;
    this._setState(S.SPECIAL, this._play('bs01', false, 0.08, 1.6));
    events.push({ type: 'specialStart', who: this });
  }

  // 攻击命中窗口(battle 每帧查询)
  getActiveAttack() {
    if ((this.state !== S.ATTACK && this.state !== S.AIR_ATTACK) || this.attackHasHit) return null;
    const k = this.stateDur > 0 ? this.stateTime / this.stateDur : 1;
    const spec = this.attackSpec;
    if (k >= spec.win[0] && k <= spec.win[1]) return spec;
    return null;
  }

  startEvolveCinematic() {
    this._setState(S.EVOLVE, RULES.evoLockTime);
    this.vel.set(0, 0, 0);
  }
  finishEvolve() {
    this.setForm('mega');
    this.evo = RULES.evoMax; // 满槽表示究极体状态,槽随时间流逝
    this._toIdle();
  }

  playVictory() {
    this._setState(S.VICTORY, 0);
    this._play('bv01', true, 0.2);
  }
  playIntro() {
    this._setState(S.INTRO, 0);
    this._play('fe01', true, 0);
  }
  releaseIntro() { this._toIdle(); }

  resetForRound(x) {
    if (this.form === 'mega') this.setForm('base');
    this.hp = this.maxHp;
    this.energy = RULES.energyMax;
    this.evo = Math.min(this.evo, RULES.evoMax * 0.4); // 保留部分进化槽
    this.evoTimer = 0;
    this.pos.set(x, 0, 0);
    this.vel.set(0, 0, 0);
    this.onGround = true;
    this.jumpsLeft = 2;
    this.invuln = 0;
    this.comboStep = 0;
    this.controlLocked = false;
    this.facing = x < 0 ? 1 : -1;
    for (const k in this.input) this.input[k] = 0;
    this._toIdle();
    this._syncTransform();
  }

  _syncTransform() {
    const r = this.inst.root;
    r.position.set(this.pos.x, this.inst.baseY + this.pos.y, this.pos.z);
    // 模型原始面向 +Z:facing=+1(朝 +X)对应 rotation.y=+π/2
    const target = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    r.rotation.y = THREE.MathUtils.lerp(r.rotation.y, target,
      Math.min(1, 0.35));
    // 击飞时朝速度方向倾斜翻滚
    if (this.state === S.LAUNCHED || this.state === S.KO) {
      r.rotation.z = THREE.MathUtils.lerp(r.rotation.z, -this.facing * 0.5, 0.1);
    } else {
      r.rotation.z = THREE.MathUtils.lerp(r.rotation.z, 0, 0.2);
    }
  }
}

export { S as FighterState };
