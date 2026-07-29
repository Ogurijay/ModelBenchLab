// 战斗管理器:回合流程 / 近战与弹体命中解算 / 数码进化演出 / 镜头 / 计时。
import * as THREE from 'three';
import { RULES } from './config.js';
import { sfx } from './audio.js';
import { TEX_GLOW, TEX_STAR } from './fx.js';

const PHASE = {
  INTRO: 'intro', FIGHT: 'fight', EVOLVE: 'evolve',
  KO: 'ko', ROUND_END: 'roundEnd', MATCH_END: 'matchEnd',
};

export class Battle {
  constructor({ scene, camera, fighters, fx, ui, onMatchEnd }) {
    this.scene = scene;
    this.camera = camera;
    this.fighters = fighters; // [p1, p2]
    this.fx = fx;
    this.ui = ui;
    this.onMatchEnd = onMatchEnd;

    this.round = 1;
    this.phase = PHASE.INTRO;
    this.phaseTime = 0;
    this.timer = RULES.roundTime;
    this.timeScale = 1;
    this.projectiles = [];
    this.evolving = null;   // 进化演出中的 fighter
    this.koLoser = null;
    this.camPos = new THREE.Vector3(0, 3.4, 10);
    this.camTarget = new THREE.Vector3(0, 1.6, 0);
    this._lastTickSecond = -1;

    this._startRound();
  }

  _startRound() {
    this.phase = PHASE.INTRO;
    this.phaseTime = 0;
    this.timer = RULES.roundTime;
    this.projectiles.forEach((p) => this._removeProjectile(p));
    this.projectiles = [];
    const [a, b] = this.fighters;
    a.resetForRound(-4);
    b.resetForRound(4);
    a.playIntro(); b.playIntro();
    a.controlLocked = b.controlLocked = true;
    this.ui.announce(`ROUND ${this.round}`, 'gold', 1.3);
    sfx.roundStart();
  }

  // ============ 弹体 ============
  _spawnProjectile(owner, spec) {
    const group = new THREE.Group();
    const color = new THREE.Color(spec.color);
    let core;
    switch (spec.type) {
      case 'beam': {
        core = new THREE.Mesh(
          new THREE.CapsuleGeometry(spec.size * 0.42, spec.size * 2.4, 6, 10),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
        );
        core.rotation.z = Math.PI / 2;
        break;
      }
      case 'shuriken': {
        core = new THREE.Mesh(
          new THREE.OctahedronGeometry(spec.size, 0),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
        );
        break;
      }
      case 'missile': {
        core = new THREE.Mesh(
          new THREE.ConeGeometry(spec.size * 0.6, spec.size * 2.4, 8),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
        );
        core.rotation.z = -Math.PI / 2;
        break;
      }
      case 'tornado': {
        core = new THREE.Mesh(
          new THREE.ConeGeometry(spec.size, spec.size * 2.2, 10, 3, true),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, wireframe: true }),
        );
        break;
      }
      default: { // orb / flame
        core = new THREE.Mesh(
          new THREE.SphereGeometry(spec.size, 14, 12),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 }),
        );
      }
    }
    group.add(core);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX_GLOW, color, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.9,
    }));
    glow.scale.setScalar(spec.size * 4.2);
    group.add(glow);
    const light = new THREE.PointLight(spec.color, 12, 7);
    group.add(light);

    const count = spec.count || 1;
    for (let i = 0; i < count; i++) {
      const g = i === 0 ? group : group.clone();
      const yJitter = count > 1 ? (i - (count - 1) / 2) * 0.5 : 0;
      const launchY = owner.pos.y + owner.height * 0.55 + yJitter;
      g.position.set(owner.pos.x + owner.facing * (owner.bodyRadius + 0.5), launchY, 0);
      this.scene.add(g);
      this.projectiles.push({
        mesh: g, core: g.children[0], owner, spec,
        vel: new THREE.Vector3(owner.facing * spec.speed, count > 1 ? yJitter * 0.7 : 0, 0),
        life: 2.6, t: 0,
        delay: i * 0.09, // 多发弹错开
      });
    }
    if (spec.type === 'beam') sfx.beam(); else sfx.shoot();
  }

  _removeProjectile(p) {
    this.scene.remove(p.mesh);
    p.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  // ============ 事件消费 ============
  _handleEvents(events) {
    for (const ev of events) {
      const f = ev.who;
      switch (ev.type) {
        case 'jump': sfx.jump(); this.fx.dust(f.pos, 4); break;
        case 'land': this.fx.dust(f.pos, 5); break;
        case 'swing': sfx.swing(); break;
        case 'specialStart': break;
        case 'projectile': this._spawnProjectile(f, ev.spec); break;
        case 'bounce': sfx.hit(); this.fx.dust(f.pos, 6); break;
        case 'ringout': {
          f.ringOutRespawn();
          sfx.explode();
          this.ui.announce('RING OUT!', 'blue', 1.0);
          this.fx.shake = Math.max(this.fx.shake, 0.4);
          break;
        }
        case 'evolveStart': {
          if (this.phase !== PHASE.FIGHT) break;
          this.phase = PHASE.EVOLVE;
          this.phaseTime = 0;
          this.evolving = f;
          this.fighters.forEach((x) => { x.controlLocked = true; });
          f.startEvolveCinematic();
          this.fx.evolutionBurst(f.pos);
          sfx.evolve();
          this.ui.announce('数码进化!', 'blue', RULES.evoLockTime - 0.3);
          break;
        }
        case 'devolve': {
          this.fx.dust(f.pos, 8);
          this.ui.refreshPortrait(f);
          break;
        }
      }
    }
  }

  // ============ 命中解算 ============
  _resolveMelee(attacker, defender) {
    const spec = attacker.getActiveAttack();
    if (!spec) return;
    const dx = defender.pos.x - attacker.pos.x;
    // 必须在面向方向
    if (Math.sign(dx || attacker.facing) !== attacker.facing) return;
    const reach = spec.range * (attacker.height / 1.35) + defender.bodyRadius;
    if (Math.abs(dx) > reach) return;
    const dyOk = Math.abs((defender.pos.y + defender.height * 0.5) - (attacker.pos.y + attacker.height * 0.5))
      < (attacker.height + defender.height) * 0.55;
    if (!dyOk) return;

    attacker.attackHasHit = true;
    const dir = attacker.facing;
    const result = defender.applyHit(spec.dmg, dir, spec.knock, spec.launch, spec.hitstun);
    const hitPos = defender.center.clone();
    hitPos.x -= dir * defender.bodyRadius * 0.5;

    if (result === 'guard') {
      this.fx.guardSpark(hitPos);
      sfx.guard();
      return;
    }
    if (result === 'invuln') return;
    // 命中回能 & 攒进化槽
    attacker.energy = Math.min(RULES.energyMax, attacker.energy + RULES.energyPerHit);
    attacker.evo = Math.min(RULES.evoMax, attacker.evo + RULES.evoPerHitGiven);
    const heavy = spec.launch > 0 || result === 'ko';
    this.fx.hitSpark(hitPos, heavy ? 0xffa030 : 0xffe066, heavy);
    heavy ? sfx.hitHeavy() : sfx.hit();
    this.ui.showDamage(defender, Math.round(spec.dmg));
    if (result === 'ko') this._onKo(defender);
  }

  _updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      // 自旋
      if (p.spec.type === 'shuriken') p.core.rotation.y += 14 * dt;
      if (p.spec.type === 'tornado') { p.core.rotation.y += 10 * dt; p.mesh.position.y += Math.sin(p.t * 9) * 0.01; }
      if (p.spec.type === 'flame') p.mesh.scale.setScalar(1 + Math.sin(p.t * 22) * 0.12);
      this.fx.trail(p.mesh.position, p.spec.color, p.spec.size * (p.spec.type === 'beam' ? 1.4 : 0.9));

      let dead = p.t >= p.life || Math.abs(p.mesh.position.x) > RULES.blastX + 3;
      // 对双方中非 owner 的判定
      if (!dead) {
        const target = this.fighters[0] === p.owner ? this.fighters[1] : this.fighters[0];
        const c = target.center;
        const dx = p.mesh.position.x - c.x;
        const dy = p.mesh.position.y - c.y;
        const rr = p.spec.size + target.bodyRadius + 0.15;
        if (dx * dx + dy * dy < rr * rr && target.state !== 'ko') {
          const dir = Math.sign(p.vel.x) || 1;
          const heavy = p.spec.dmg >= 40;
          const result = target.applyHit(p.spec.dmg, dir, heavy ? 6 : 3.2, heavy ? 5.5 : 0, 0.4);
          if (result === 'guard') {
            this.fx.guardSpark(p.mesh.position.clone());
            sfx.guard();
          } else if (result !== 'invuln') {
            p.owner.energy = Math.min(RULES.energyMax, p.owner.energy + RULES.energyPerHit * 0.5);
            p.owner.evo = Math.min(RULES.evoMax, p.owner.evo + RULES.evoPerHitGiven * 0.7);
            this.fx.explosion(p.mesh.position.clone(), p.spec.color, heavy);
            heavy ? sfx.explode() : sfx.hit();
            this.ui.showDamage(target, Math.round(p.spec.dmg));
            if (result === 'ko') this._onKo(target);
          }
          dead = true;
        }
      }
      if (dead) {
        this._removeProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }
  }

  _onKo(loser) {
    if (this.phase !== PHASE.FIGHT) return;
    this.phase = PHASE.KO;
    this.phaseTime = 0;
    this.koLoser = loser;
    this.timeScale = RULES.koSlowmo;
    this.fx.koBurst(loser.center);
    sfx.ko();
    this.ui.announce('K.O.!', 'gold', 2.2, true);
    this.fighters.forEach((f) => { if (f !== loser) f.controlLocked = true; });
  }

  _endRoundByTime() {
    // 时间到:按血量比例判定
    const [a, b] = this.fighters;
    const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
    const loser = ra === rb ? b : (ra < rb ? a : b);
    this.phase = PHASE.KO;
    this.phaseTime = 0;
    this.koLoser = loser;
    this.timeScale = 1;
    this.ui.announce('TIME UP!', 'blue', 1.6);
    this.fighters.forEach((f) => { f.controlLocked = true; });
  }

  // ============ 主循环 ============
  update(rawDt) {
    const dt = Math.min(rawDt, 1 / 20) * this.timeScale;
    this.phaseTime += rawDt; // 演出时间用真实时间
    const [a, b] = this.fighters;

    switch (this.phase) {
      case PHASE.INTRO: {
        if (this.phaseTime > 1.5 && this.phaseTime < 1.7) this.ui.announce('FIGHT!', 'gold', 0.8);
        if (this.phaseTime >= 1.7) {
          a.controlLocked = b.controlLocked = false;
          if (a.state === 'intro') a.releaseIntro();
          if (b.state === 'intro') b.releaseIntro();
          this.phase = PHASE.FIGHT;
          this.phaseTime = 0;
        }
        break;
      }
      case PHASE.FIGHT: {
        this.timer -= dt;
        const sec = Math.max(0, Math.ceil(this.timer));
        if (sec <= 10 && sec !== this._lastTickSecond) { sfx.timeTick(); this._lastTickSecond = sec; }
        if (this.timer <= 0) this._endRoundByTime();
        break;
      }
      case PHASE.EVOLVE: {
        if (this.phaseTime >= RULES.evoLockTime) {
          const f = this.evolving;
          f.finishEvolve();
          this.fx.evolutionBurst(f.pos);
          this.ui.announce(f.displayName, 'blue', 1.2);
          this.ui.refreshPortrait(f);
          sfx.victory();
          this.fighters.forEach((x) => { x.controlLocked = false; });
          this.evolving = null;
          this.phase = PHASE.FIGHT;
          this.phaseTime = 0;
        }
        break;
      }
      case PHASE.KO: {
        if (this.phaseTime >= RULES.koSlowmoTime) {
          this.timeScale = 1;
          const winner = this.fighters.find((f) => f !== this.koLoser);
          winner.roundsWon++;
          this.ui.setRoundPips(this.fighters);
          this.phase = PHASE.ROUND_END;
          this.phaseTime = 0;
        }
        break;
      }
      case PHASE.ROUND_END: {
        if (this.phaseTime >= 1.4) {
          const winner = this.fighters.find((f) => f !== this.koLoser);
          if (winner.roundsWon >= RULES.roundsToWin) {
            this.phase = PHASE.MATCH_END;
            this.onMatchEnd(winner, this.koLoser);
          } else {
            this.round++;
            this._startRound();
          }
        }
        break;
      }
      case PHASE.MATCH_END: return;
    }

    // 实体更新
    const events = [];
    a.update(dt, b, events);
    b.update(dt, a, events);
    this._handleEvents(events);

    if (this.phase === PHASE.FIGHT) {
      this._resolveMelee(a, b);
      this._resolveMelee(b, a);
    }
    this._updateProjectiles(dt);

    // 身体推挤(不重叠)
    const overlap = (a.bodyRadius + b.bodyRadius) - Math.abs(a.pos.x - b.pos.x);
    if (overlap > 0 && Math.abs(a.pos.y - b.pos.y) < 1) {
      const push = overlap * 0.5;
      const dir = Math.sign(b.pos.x - a.pos.x) || 1;
      a.pos.x -= dir * push;
      b.pos.x += dir * push;
    }

    this._updateCamera(rawDt);
    this.ui.updateBars(this.fighters, Math.max(0, Math.ceil(this.timer)));
  }

  _updateCamera(dt) {
    const [a, b] = this.fighters;
    let mid, spread;
    if (this.phase === PHASE.EVOLVE && this.evolving) {
      mid = this.evolving.center.clone();
      spread = 0; // 推近进化者
    } else if (this.phase === PHASE.KO && this.koLoser) {
      mid = this.koLoser.center.clone();
      spread = 2.5;
    } else {
      mid = a.center.clone().add(b.center).multiplyScalar(0.5);
      spread = Math.abs(a.pos.x - b.pos.x);
    }
    const dist = THREE.MathUtils.clamp(4.6 + spread * 0.58, 5.0, 13.5);
    const targetPos = new THREE.Vector3(mid.x * 0.82, Math.max(1.9, mid.y + 1.05), dist);
    const targetLook = new THREE.Vector3(mid.x * 0.82, Math.max(1.05, mid.y + 0.05), 0);
    const k = 1 - Math.exp(-dt * 5.5);
    this.camPos.lerp(targetPos, k);
    this.camTarget.lerp(targetLook, k);

    // 震屏
    const sh = this.fx.shake;
    const ox = (Math.random() - 0.5) * sh * 0.5;
    const oy = (Math.random() - 0.5) * sh * 0.5;
    this.camera.position.set(this.camPos.x + ox, this.camPos.y + oy, this.camPos.z);
    this.camera.lookAt(this.camTarget.x + ox * 0.5, this.camTarget.y + oy * 0.5, 0);
  }

  dispose() {
    this.projectiles.forEach((p) => this._removeProjectile(p));
    this.projectiles = [];
  }
}
