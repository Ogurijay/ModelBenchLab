const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
// 战斗解算严格锁定在 X/Y 平面；Z 只保留给 Three.js 场景制造纵深。
const dist = (a, b) => Math.abs(a.x - b.x);
const norm = (x) => ({ x: Math.sign(x) || 1, z: 0 });

const RULES = new Set(['stock', 'timed', 'race', 'training']);
const DIFFICULTIES = new Set(['rookie', 'normal', 'veteran']);
const ITEM_TYPES = ['energy', 'health', 'power', 'life'];
const AI = {
  rookie: { think: 0.68, aggression: 0.42, speed: 0.86 },
  normal: { think: 0.4, aggression: 0.66, speed: 1 },
  veteran: { think: 0.22, aggression: 0.88, speed: 1.12 },
};
const HAZARDS = {
  pulse: { delay: 4, interval: 8, damage: 8, radius: 3.8, x: 0, z: 0, force: 1.2 },
  lava: { delay: 5, interval: 9, damage: 11, minX: -11, maxX: 11, minZ: -3.2, maxZ: -2.15 },
  laser: { delay: 3, interval: 6, damage: 13, width: 0.7, positions: [-5, 0, 5] },
  rocks: { delay: 2.5, interval: 5.5, damage: 10, radius: 1.9, force: 0.9 },
  void: { delay: 7, interval: 10, damage: 999, insetX: 1.4, insetZ: 0.45 },
};
const DEFAULT_FIGHTERS = [
  { id: 'player', name: '亚古兽', controller: 'human', x: -4.2, forms: ['亚古兽', '暴龙兽', '战斗暴龙兽'] },
  { id: 'enemy', name: '加布兽', controller: 'cpu', x: 4.2, forms: ['加布兽', '加鲁鲁兽', '钢铁加鲁鲁兽'] },
];

function formsFor(forms, name) {
  const source = Array.isArray(forms) && forms.length ? forms.slice(0, 3) : [name];
  return source.map((entry, index) => {
    const form = typeof entry === 'string' ? { name: entry } : { ...entry };
    return {
      id: form.id ?? `form-${index}`,
      name: form.name ?? `${name}·形态${index + 1}`,
      damageMultiplier: form.damageMultiplier ?? 1 + index * 0.15,
      speedMultiplier: form.speedMultiplier ?? 1 + index * 0.05,
    };
  });
}

function createFighter(config, index, count, stocks, platform) {
  const id = String(config.id ?? `fighter-${index + 1}`);
  const name = config.name ?? id;
  const spread = count <= 2 ? 4.2 : 7.2;
  const defaultX = count === 1 ? 0 : -spread + (spread * 2 * index) / (count - 1);
  const x = clamp(config.x ?? defaultX, platform.minX + 0.5, platform.maxX - 0.5);
  const z = platform.laneZ;
  const maxHp = Math.max(1, config.maxHp ?? 100);
  const lives = Math.max(1, Math.floor(config.stocks ?? stocks));
  const forms = formsFor(config.forms, name);
  return {
    id, name,
    controller: config.controller === 'cpu' ? 'cpu' : 'human',
    difficulty: DIFFICULTIES.has(config.difficulty) ? config.difficulty : 'normal',
    team: config.team ?? null,
    forms,
    formIndex: clamp(Math.floor(config.formIndex ?? 0), 0, forms.length - 1),
    spawnX: x, spawnZ: z, x, z, y: 0, vy: 0,
    yaw: index === 0 ? Math.PI / 2 : -Math.PI / 2,
    maxHp, hp: maxHp, energy: clamp(config.energy ?? 0, 0, 100),
    stocks: lives, lives, score: 0, kos: 0, deaths: 0,
    action: 'idle', actionTimer: 0, actionElapsed: 0, actionTargetId: null,
    attackCooldown: 0, skillCooldown: 0, healCooldown: 0, stun: 0, invulnerable: 0,
    overdrive: 0, powerBoost: 0, dashTimer: 0, dashX: 0, dashZ: 0,
    grounded: true, guarding: false, attackHit: false, comboStep: 0, comboWindow: 0,
    hits: 0, maxCombo: 0, lastMoveX: index === 0 ? 1 : -1, lastMoveZ: 0,
    lastAttacker: null, pendingKOReason: null,
    knockedOut: false, respawnTimer: 0, eliminated: false,
  };
}

function hazardConfigs(entries) {
  if (entries === true) entries = Object.keys(HAZARDS);
  if (typeof entries === 'string') entries = [entries];
  if (!Array.isArray(entries)) return [];
  return entries.map((entry, index) => {
    const data = typeof entry === 'string' ? { type: entry } : { ...entry };
    if (!HAZARDS[data.type]) throw new RangeError(`Unknown hazard type: ${data.type}`);
    const value = { ...HAZARDS[data.type], ...data };
    return { ...value, id: data.id ?? `${data.type}-${index + 1}`, positions: value.positions ? [...value.positions] : undefined };
  });
}

export class BattleSimulation {
  constructor(options = {}) {
    this.rule = options.rule ?? 'stock';
    if (!RULES.has(this.rule)) throw new RangeError(`Unknown battle rule: ${this.rule}`);
    const fighters = options.fighters ?? DEFAULT_FIGHTERS;
    if (!Array.isArray(fighters) || fighters.length < 1 || fighters.length > 4) {
      throw new RangeError('BattleSimulation requires between 1 and 4 fighters.');
    }
    const ids = fighters.map((f, i) => String(f.id ?? `fighter-${i + 1}`));
    if (new Set(ids).size !== ids.length) throw new RangeError('Fighter ids must be unique.');
    this.seed = (options.seed ?? 7) >>> 0;
    this.duration = options.duration === Infinity ? Infinity : Math.max(0, options.duration ?? 90);
    this.initialStocks = Math.max(1, Math.floor(options.stocks ?? options.stock ?? 3));
    this.raceTarget = Math.max(1, Math.floor(options.raceTarget ?? 3));
    this.respawnDelay = Math.max(0, options.respawnDelay ?? 1);
    this.readyTime = Math.max(0, options.readyTime ?? 2.4);
    this.ultraRadius = Math.max(0.1, options.ultraRadius ?? 6.5);
    this.ultraDamage = Math.max(0, options.ultraDamage ?? 34);
    this.platform = {
      minX: options.platform?.minX ?? -11, maxX: options.platform?.maxX ?? 11,
      minZ: options.platform?.minZ ?? -3.2, maxZ: options.platform?.maxZ ?? 3.2,
      fallY: options.platform?.fallY ?? -4,
    };
    if (this.platform.minX >= this.platform.maxX || this.platform.minZ >= this.platform.maxZ) {
      throw new RangeError('Platform bounds must have a positive width and depth.');
    }
    this.platform.laneZ = clamp(options.laneZ ?? options.platform?.laneZ ?? 0, this.platform.minZ, this.platform.maxZ);
    this.arenaRadius = Math.max(Math.abs(this.platform.minX), Math.abs(this.platform.maxX));
    this.fighterConfigs = fighters.map((f) => ({ ...f }));
    this.hazardConfigs = hazardConfigs(options.hazards);
    this.itemSpawning = options.items !== false;
    this.itemInterval = Math.max(0.1, options.itemInterval ?? 8);
    this.itemTypes = Array.isArray(options.items) ? [...options.items] : [...(options.itemTypes ?? ITEM_TYPES)];
    if (!this.itemTypes.length || this.itemTypes.some((type) => !ITEM_TYPES.includes(type))) {
      throw new RangeError('Item types must use energy, health, power, or life.');
    }
    this.reset();
  }

  reset() {
    this.randomState = this.seed;
    this.fighters = this.fighterConfigs.map((config, index) => (
      createFighter(config, index, this.fighterConfigs.length, this.initialStocks, this.platform)
    ));
    this.syncAliases();
    this.projectiles = [];
    this.energyOrbs = [];
    this.items = [];
    this.pickup = null;
    this.projectileSerial = 0;
    this.orbSerial = 0;
    this.itemSerial = 0;
    this.itemSpawnCount = 0;
    this.itemClock = Math.min(7, this.itemInterval);
    this.pickupClock = this.itemClock;
    this.hazards = this.hazardConfigs.map((h) => ({
      ...h, positions: h.positions ? [...h.positions] : undefined,
      clock: Math.max(0, h.delay), triggerCount: 0,
    }));
    this.aiStates = Object.fromEntries(this.fighters.filter((f) => f.controller === 'cpu')
      .map((f) => [f.id, { clock: 0, targetId: null }]));
    this.aiIntents = {};
    this.time = this.duration;
    this.elapsed = 0;
    this.phaseTimer = this.readyTime;
    this.phase = this.readyTime > 0 ? 'ready' : 'battle';
    this.paused = false;
    this.winner = null;
    this.endReason = null;
    this.events = [{ type: 'announce', text: this.phase === 'ready' ? 'READY' : 'FIGHT!' }];
    return this;
  }

  start() {
    if (this.phase === 'ended') return false;
    this.phaseTimer = this.readyTime;
    this.phase = this.readyTime > 0 ? 'ready' : 'battle';
    this.paused = false;
    this.events.push({ type: 'announce', text: this.phase === 'ready' ? 'READY' : 'FIGHT!' });
    return true;
  }

  pause() {
    if (this.paused || this.phase === 'ended') return false;
    this.paused = true;
    this.events.push({ type: 'paused' });
    return true;
  }

  resume() {
    if (!this.paused) return false;
    this.paused = false;
    this.events.push({ type: 'resumed' });
    return true;
  }

  togglePause() { return this.paused ? this.resume() : this.pause(); }
  setPaused(value) { return value ? this.pause() : this.resume(); }
  drainEvents() {
    const result = this.events;
    this.events = [];
    return result;
  }
  random() {
    this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }
  syncAliases() {
    this.player = this.fighters.find((f) => f.controller === 'human') ?? this.fighters[0] ?? null;
    this.enemy = this.fighters.find((f) => f !== this.player) ?? null;
  }

  step(dt, input = {}) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.pauseRequested(input)) this.togglePause();
    if (this.paused || this.phase === 'ended') return;
    dt = Math.min(dt, 1 / 30);
    if (this.phase === 'ready') {
      const previous = this.phaseTimer;
      this.phaseTimer = Math.max(0, this.phaseTimer - dt);
      if (previous > 1.25 && this.phaseTimer <= 1.25) this.events.push({ type: 'announce', text: 'DIGI-RUMBLE' });
      if (this.phaseTimer <= 0) {
        this.phase = 'battle';
        this.events.push({ type: 'announce', text: 'FIGHT!' });
      }
      return;
    }
    this.elapsed += dt;
    if (this.rule !== 'training' && Number.isFinite(this.time)) this.time = Math.max(0, this.time - dt);
    this.updateRespawns(dt);
    this.updateAI(dt);
    for (const fighter of this.fighters) {
      if (this.phase === 'ended') break;
      const intent = fighter.controller === 'cpu'
        ? this.aiIntents[fighter.id] ?? {}
        : this.humanIntent(fighter, input);
      this.updateFighter(fighter, intent, dt);
    }
    if (this.phase === 'ended') return;
    this.resolveSeparation();
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.checkDefeats();
    if (this.phase === 'ended') return;
    this.updateEnergyOrbs(dt);
    this.updateItems(dt);
    this.evaluateRules();
  }

  pauseRequested(input) {
    if (input?.pause) return true;
    const map = input?.fighters ?? input?.inputs;
    if (map && Object.values(map).some((intent) => intent?.pause)) return true;
    return this.fighters.some((fighter) => input?.[fighter.id]?.pause);
  }

  humanIntent(fighter, input) {
    const map = input?.fighters ?? input?.inputs;
    if (map?.[fighter.id]) return map[fighter.id];
    if (input?.[fighter.id] && typeof input[fighter.id] === 'object') return input[fighter.id];
    return fighter === this.player ? input : {};
  }

  isOpponent(a, b) {
    if (!a || !b || a.id === b.id || b.eliminated || b.knockedOut || b.hp <= 0) return false;
    return a.team == null || b.team == null || a.team !== b.team;
  }

  nearestOpponent(fighter, preferredId = null) {
    const preferred = preferredId ? this.fighters.find((f) => f.id === preferredId) : null;
    if (this.isOpponent(fighter, preferred)) return preferred;
    return this.fighters.filter((candidate) => this.isOpponent(fighter, candidate))
      .sort((a, b) => dist(fighter, a) - dist(fighter, b) || a.id.localeCompare(b.id))[0] ?? null;
  }

  updateAI(dt) {
    this.aiIntents = {};
    for (const fighter of this.fighters) {
      if (fighter.controller !== 'cpu' || fighter.eliminated || fighter.knockedOut) continue;
      const profile = AI[fighter.difficulty];
      const state = this.aiStates[fighter.id] ?? { clock: 0, targetId: null };
      state.clock -= dt;
      const target = this.nearestOpponent(fighter, state.targetId);
      state.targetId = target?.id ?? null;
      const intent = { moveX: 0, moveZ: 0, targetId: target?.id };
      if (target) {
        const direction = norm(target.x - fighter.x);
        const gap = dist(fighter, target);
        if (gap > 2.6) {
          intent.moveX = direction.x * profile.speed;
        } else if (gap < 1.15) {
          intent.moveX = -direction.x * 0.42;
        }
        if (state.clock <= 0 && fighter.stun <= 0) {
          state.clock = profile.think + this.random() * 0.18;
          const roll = this.random();
          if (fighter.energy >= 100 && (fighter.formIndex === fighter.forms.length - 1 || roll < profile.aggression)) intent.evolve = true;
          else if (gap < 2.25 && roll < profile.aggression) intent.attack = true;
          else if (gap < 8 && fighter.energy >= 25 && roll > 1 - profile.aggression * 0.55) intent.ranged = true;
          else if (fighter.grounded && gap > 3.5 && roll > 0.9) intent.jump = true;
        }
      }
      this.aiStates[fighter.id] = state;
      this.aiIntents[fighter.id] = intent;
    }
  }

  updateFighter(fighter, input, dt) {
    if (fighter.eliminated || fighter.knockedOut || fighter.hp <= 0) return;
    const wasGuarding = fighter.guarding;
    fighter.guarding = false;
    for (const key of ['attackCooldown', 'skillCooldown', 'healCooldown', 'stun', 'invulnerable', 'overdrive', 'powerBoost', 'comboWindow']) {
      fighter[key] = Math.max(0, fighter[key] - dt);
    }
    if (fighter.actionTimer > 0) {
      fighter.actionTimer = Math.max(0, fighter.actionTimer - dt);
      fighter.actionElapsed += dt;
      if (fighter.action === 'attack' && !fighter.attackHit && fighter.actionElapsed >= 0.16) {
        fighter.attackHit = true;
        this.performMelee(fighter);
      }
      if (fighter.actionTimer === 0 && fighter.stun <= 0) fighter.action = 'idle';
    }
    fighter.vy -= 22 * dt;
    fighter.y += fighter.vy * dt;
    if (fighter.y <= 0) {
      if (!fighter.grounded && fighter.vy < -3) this.events.push({ type: 'land', fighter: fighter.id, x: fighter.x, z: fighter.z });
      fighter.y = 0;
      fighter.vy = 0;
      fighter.grounded = true;
    }
    if (fighter.stun > 0) {
      fighter.action = 'hit';
      return;
    }
    const target = this.nearestOpponent(fighter, input.targetId);
    const toward = target ? norm(target.x - fighter.x) : norm(fighter.lastMoveX);
    if ((input.evolve || input.ultra || input.overdrive) && fighter.energy >= 100) {
      this.activateEvolution(fighter);
      if (this.phase === 'ended') return;
    }
    const wantsHeal = Boolean(input.heal || (input.guard && input.attack));
    let healed = false;
    if (wantsHeal && fighter.grounded && fighter.healCooldown <= 0
      && fighter.energy >= 25 && fighter.hp < fighter.maxHp) {
      const before = fighter.hp;
      fighter.energy -= 25;
      fighter.hp = clamp(fighter.hp + 28, 0, fighter.maxHp);
      fighter.healCooldown = 1.2;
      fighter.action = 'heal';
      fighter.actionTimer = 0.42;
      fighter.actionElapsed = 0;
      healed = true;
      this.events.push({
        type: 'heal', fighter: fighter.id, cost: 25,
        amount: fighter.hp - before, hp: fighter.hp,
      });
    }
    if (!healed && input.guard && fighter.grounded) {
      fighter.guarding = true;
      fighter.action = 'guard';
      if (!wasGuarding) this.events.push({ type: 'guard', fighter: fighter.id, active: true });
    } else if (wasGuarding && !fighter.guarding) {
      this.events.push({ type: 'guard', fighter: fighter.id, active: false });
      if (fighter.action === 'guard') fighter.action = 'idle';
    }
    if (input.jump && fighter.grounded && fighter.action !== 'attack') {
      fighter.vy = 8.2;
      fighter.grounded = false;
      this.events.push({ type: 'jump', fighter: fighter.id });
    }
    if (input.dodge && fighter.dashTimer <= 0 && fighter.attackCooldown <= 0) {
      const move = norm(input.moveX || -toward.x);
      Object.assign(fighter, {
        dashX: move.x, dashZ: 0, dashTimer: 0.22, invulnerable: 0.32,
        action: 'dodge', actionTimer: 0.26, actionElapsed: 0,
      });
      this.events.push({ type: 'dodge', fighter: fighter.id, x: fighter.x, z: fighter.z });
    }
    if (!healed && !fighter.guarding && input.attack && target) this.startAttack(fighter, target);
    if (!healed && !fighter.guarding && (input.ranged || input.skill)) this.startSkill(fighter, target);
    let moveX = clamp(input.moveX || 0, -1, 1);
    const magnitude = Math.abs(moveX);
    if (magnitude > 0.08) {
      fighter.lastMoveX = moveX;
      fighter.lastMoveZ = 0;
      if (fighter.action === 'idle') fighter.action = 'run';
    } else if (fighter.action === 'run') fighter.action = 'idle';
    const locked = fighter.action === 'attack' || fighter.action === 'skill' || fighter.action === 'heal';
    let speed = (locked ? 1.35 : 5.4) * fighter.forms[fighter.formIndex].speedMultiplier;
    if (fighter.guarding) speed *= 0.35;
    if (fighter.y > 0) speed *= 0.82;
    if (fighter.dashTimer > 0) {
      fighter.dashTimer = Math.max(0, fighter.dashTimer - dt);
      moveX = fighter.dashX;
      speed = 14;
    }
    fighter.x += moveX * speed * dt;
    fighter.z = this.platform.laneZ;
    const facingX = locked || magnitude < 0.08 ? toward.x : moveX;
    fighter.yaw = facingX >= 0 ? Math.PI / 2 : -Math.PI / 2;
  }

  startAttack(fighter, target) {
    if (fighter.attackCooldown > 0 || fighter.skillCooldown > 0 || fighter.action === 'attack') return false;
    fighter.comboStep = fighter.comboWindow > 0 ? (fighter.comboStep % 3) + 1 : 1;
    Object.assign(fighter, {
      comboWindow: 0.68, action: 'attack', actionTimer: 0.4 + fighter.comboStep * 0.04,
      actionElapsed: 0, actionTargetId: target.id, attackHit: false, attackCooldown: 0.3,
    });
    const direction = norm(target.x - fighter.x);
    fighter.x += direction.x * 0.18;
    fighter.z = this.platform.laneZ;
    this.events.push({ type: 'attack', fighter: fighter.id, target: target.id, step: fighter.comboStep });
    return true;
  }

  performMelee(fighter) {
    const target = this.nearestOpponent(fighter, fighter.actionTargetId);
    if (!target || dist(fighter, target) > 2.25 || target.y > 2 || target.invulnerable > 0) {
      this.events.push({ type: 'whiff', fighter: fighter.id });
      return;
    }
    const direction = norm(target.x - fighter.x);
    const forward = { x: Math.sin(fighter.yaw), z: Math.cos(fighter.yaw) };
    if (direction.x * forward.x + direction.z * forward.z < 0.15) {
      this.events.push({ type: 'whiff', fighter: fighter.id });
      return;
    }
    const damage = (5 + fighter.comboStep * 2)
      * fighter.forms[fighter.formIndex].damageMultiplier
      * (fighter.powerBoost > 0 ? 1.35 : 1);
    this.applyHit(fighter, target, damage, 0.18 + fighter.comboStep * 0.05, direction,
      fighter.comboStep === 3 ? 2.1 : 0.9, { source: 'melee' });
  }

  startSkill(fighter, target) {
    if (fighter.energy < 25 || fighter.skillCooldown > 0 || fighter.action === 'skill') return false;
    const direction = target ? norm(target.x - fighter.x) : norm(fighter.lastMoveX);
    fighter.energy -= 25;
    Object.assign(fighter, {
      skillCooldown: 1.15, attackCooldown: 0.5, action: 'skill', actionTimer: 0.58, actionElapsed: 0,
    });
    this.projectiles.push({
      id: `projectile-${++this.projectileSerial}`, owner: fighter.id,
      x: fighter.x + direction.x * 1.1, z: this.platform.laneZ,
      y: 1.05 + fighter.y, dx: direction.x, dz: 0,
      life: 1.8, radius: 0.55,
      power: 15 * fighter.forms[fighter.formIndex].damageMultiplier * (fighter.powerBoost > 0 ? 1.35 : 1),
    });
    this.events.push({
      type: 'skill', attackType: 'ranged', fighter: fighter.id, target: target?.id ?? null,
      x: fighter.x, z: this.platform.laneZ, dx: direction.x, dz: 0,
    });
    return true;
  }

  activateEvolution(fighter) {
    if (!fighter || fighter.eliminated || fighter.knockedOut || fighter.energy < 100) return false;
    fighter.energy = 0;
    if (fighter.formIndex < fighter.forms.length - 1) {
      const from = fighter.formIndex;
      fighter.formIndex += 1;
      fighter.invulnerable = Math.max(fighter.invulnerable, 0.8);
      fighter.overdrive = 0.8;
      const event = {
        type: 'evolution', fighter: fighter.id, from, to: fighter.formIndex,
        form: fighter.forms[fighter.formIndex].name, x: fighter.x, z: fighter.z,
      };
      this.events.push(event, { ...event, type: 'overdrive', mode: 'evolution' });
      return true;
    }
    fighter.invulnerable = Math.max(fighter.invulnerable, 0.55);
    fighter.overdrive = 0.45;
    const targets = this.fighters.filter((target) => this.isOpponent(fighter, target) && dist(fighter, target) <= this.ultraRadius);
    this.events.push({
      type: 'ultra', fighter: fighter.id, targets: targets.map((target) => target.id),
      radius: this.ultraRadius, damage: this.ultraDamage, x: fighter.x, z: fighter.z,
    });
    this.events.push({ type: 'overdrive', mode: 'ultra', fighter: fighter.id, x: fighter.x, z: fighter.z });
    for (const target of targets) {
      this.applyHit(fighter, target, this.ultraDamage, 0.65,
        norm(target.x - fighter.x), 2.8,
        { source: 'ultra', dropEnergy: false, gainEnergy: false });
    }
    if (this.rule === 'race') {
      fighter.score += 1;
      fighter.formIndex = 0;
      this.events.push({ type: 'racePoint', fighter: fighter.id, score: fighter.score, target: this.raceTarget });
      if (fighter.score >= this.raceTarget) this.finish(fighter.id, 'race-target');
    }
    return true;
  }

  forceForm(fighterId, direction = 1) {
    const fighter = this.fighters.find((candidate) => candidate.id === fighterId);
    if (!fighter || fighter.eliminated || fighter.knockedOut) return false;
    const delta = Math.sign(Number(direction) || 0);
    const from = fighter.formIndex;
    const to = clamp(from + delta, 0, fighter.forms.length - 1);
    if (to === from) return false;
    fighter.formIndex = to;
    fighter.invulnerable = Math.max(fighter.invulnerable, 0.45);
    fighter.overdrive = 0.45;
    fighter.action = 'idle';
    fighter.actionTimer = 0;
    const event = {
      type: to > from ? 'evolution' : 'devolution',
      fighter: fighter.id, from, to,
      form: fighter.forms[to].name,
      x: fighter.x, y: fighter.y, z: this.platform.laneZ,
      forced: true,
    };
    this.events.push(event);
    return { ...event };
  }

  applyHit(attacker, target, damage, stun, direction, force, options = {}) {
    if (!target || target.eliminated || target.knockedOut || target.hp <= 0 || target.invulnerable > 0) return false;
    damage = Math.max(0, damage);
    const guarded = target.guarding && target.grounded;
    if (guarded) {
      damage *= 0.4;
      stun *= 0.45;
      force *= 0.3;
      this.events.push({
        type: 'guard', fighter: target.id, attacker: attacker?.id ?? null,
        active: true, blocked: true, damage,
      });
    }
    target.hp = clamp(target.hp - damage, 0, target.maxHp);
    target.stun = Math.max(target.stun, stun);
    target.action = 'hit';
    target.actionTimer = Math.max(target.actionTimer, stun);
    target.x += direction.x * force;
    target.z = this.platform.laneZ;
    target.vy = Math.max(target.vy, force * 1.15);
    target.grounded = false;
    target.lastAttacker = attacker?.id ?? null;
    target.pendingKOReason = options.source ?? 'damage';
    if (attacker) {
      if (options.gainEnergy !== false) attacker.energy = clamp(attacker.energy + 7, 0, 100);
      attacker.hits += 1;
      attacker.maxCombo = Math.max(attacker.maxCombo, attacker.comboStep || 1);
    }
    if (options.dropEnergy !== false) this.spawnEnergyDrop(target, attacker, direction, damage);
    this.events.push({
      type: 'hit', source: options.source ?? 'damage', attacker: attacker?.id ?? null,
      target: target.id, damage, combo: attacker?.comboStep || 1,
      x: target.x, y: target.y + 0.8, z: target.z,
    });
    return true;
  }

  spawnEnergyDrop(target, attacker, direction, damage) {
    const orb = {
      id: `energy-orb-${++this.orbSerial}`,
      x: target.x - direction.x * 0.7, z: this.platform.laneZ,
      vx: -direction.x * 0.7, vz: 0,
      value: clamp(Math.round(damage * 0.5), 4, 12),
      life: 6, collectDelay: 0.18, source: target.id, attackerHint: attacker?.id ?? null,
    };
    this.energyOrbs.push(orb);
    this.events.push({ type: 'energyDrop', ...orb });
  }

  updateProjectiles(dt) {
    const next = [];
    for (const projectile of this.projectiles) {
      projectile.life -= dt;
      projectile.x += projectile.dx * 10.5 * dt;
      projectile.z = this.platform.laneZ;
      const attacker = this.fighters.find((fighter) => fighter.id === projectile.owner) ?? null;
      const target = this.fighters.filter((candidate) => this.isOpponent(attacker, candidate))
        .sort((a, b) => dist(projectile, a) - dist(projectile, b) || a.id.localeCompare(b.id))
        .find((candidate) => dist(projectile, candidate) < 1.05
          && Math.abs(candidate.y + 0.8 - projectile.y) < 1.4 && candidate.invulnerable <= 0);
      if (target) {
        this.applyHit(attacker, target, projectile.power, 0.42,
          { x: projectile.dx, z: projectile.dz }, 2.2, { source: 'projectile' });
        this.events.push({
          type: 'projectileHit', projectile: projectile.id, owner: projectile.owner,
          target: target.id, x: projectile.x, y: projectile.y, z: projectile.z,
        });
      } else if (projectile.life > 0 && this.withinPlatform(projectile.x, projectile.z, 2)) next.push(projectile);
      else this.events.push({
        type: 'projectileEnd', projectile: projectile.id, owner: projectile.owner,
        x: projectile.x, y: projectile.y, z: projectile.z,
      });
    }
    this.projectiles = next;
  }

  updateEnergyOrbs(dt) {
    const next = [];
    for (const orb of this.energyOrbs) {
      orb.life -= dt;
      orb.collectDelay = Math.max(0, orb.collectDelay - dt);
      orb.x += orb.vx * dt;
      orb.z = this.platform.laneZ;
      orb.vx *= Math.exp(-dt * 4);
      orb.vz = 0;
      const collector = orb.collectDelay > 0 ? null : this.fighters.find((fighter) => (
        !fighter.eliminated && !fighter.knockedOut && fighter.hp > 0 && dist(orb, fighter) < 1.05
      ));
      if (collector) {
        collector.energy = clamp(collector.energy + orb.value, 0, 100);
        this.events.push({
          type: 'energyPickup', orb: orb.id, fighter: collector.id,
          value: orb.value, x: orb.x, z: orb.z,
        });
      } else if (orb.life > 0 && this.withinPlatform(orb.x, orb.z, 0.75)) next.push(orb);
    }
    this.energyOrbs = next;
  }

  spawnItem(type = 'energy', x = 0, z = 0, options = {}) {
    if (!ITEM_TYPES.includes(type)) throw new RangeError(`Unknown item type: ${type}`);
    const item = {
      id: `item-${++this.itemSerial}`, type,
      x: clamp(x, this.platform.minX + 0.4, this.platform.maxX - 0.4),
      z: this.platform.laneZ,
      life: Math.max(0.1, options.life ?? 10),
    };
    this.items.push(item);
    this.syncPickup();
    this.events.push({ type: 'itemSpawn', ...item }, { type: 'pickupSpawn', ...item });
    return item;
  }

  updateItems(dt) {
    if (this.itemSpawning && this.items.length === 0) {
      this.itemClock -= dt;
      this.pickupClock = this.itemClock;
      if (this.itemClock <= 0) {
        const type = this.itemTypes[this.itemSpawnCount++ % this.itemTypes.length];
        const x = this.platform.minX + 1.5 + this.random() * (this.platform.maxX - this.platform.minX - 3);
        this.spawnItem(type, x, this.platform.laneZ);
      }
    }
    const next = [];
    let consumed = false;
    for (const item of this.items) {
      item.life -= dt;
      const collector = this.fighters.find((fighter) => (
        !fighter.eliminated && !fighter.knockedOut && fighter.hp > 0 && dist(item, fighter) < 1.15
      ));
      if (collector) {
        this.applyItem(collector, item);
        consumed = true;
      } else if (item.life > 0) next.push(item);
    }
    this.items = next;
    if (consumed || (this.items.length === 0 && this.itemClock <= 0)) {
      this.itemClock = this.itemInterval;
      this.pickupClock = this.itemClock;
    }
    this.syncPickup();
  }

  applyItem(fighter, item) {
    let amount = 0;
    if (item.type === 'energy') {
      const before = fighter.energy;
      fighter.energy = clamp(fighter.energy + 40, 0, 100);
      amount = fighter.energy - before;
    } else if (item.type === 'health') {
      const before = fighter.hp;
      fighter.hp = clamp(fighter.hp + 35, 0, fighter.maxHp);
      amount = fighter.hp - before;
    } else if (item.type === 'power') {
      fighter.powerBoost = Math.max(fighter.powerBoost, 6);
      amount = 6;
    } else if (this.rule === 'stock') {
      fighter.stocks += 1;
      fighter.lives = fighter.stocks;
      amount = 1;
    } else {
      const before = fighter.hp;
      fighter.hp = fighter.maxHp;
      amount = fighter.hp - before;
    }
    const event = {
      type: 'itemPickup', item: item.id, itemType: item.type, fighter: fighter.id,
      amount, x: item.x, z: item.z,
    };
    this.events.push(event, { ...event, type: 'pickup' });
  }

  syncPickup() { this.pickup = this.items[0] ?? null; }

  updateHazards(dt) {
    for (const hazard of this.hazards) {
      hazard.clock -= dt;
      if (hazard.clock > 0) continue;
      hazard.clock += Math.max(0.1, hazard.interval);
      this.triggerHazard(hazard);
      hazard.triggerCount += 1;
    }
  }

  triggerHazard(hazard) {
    const candidates = this.fighters.filter((f) => !f.eliminated && !f.knockedOut && f.hp > 0);
    let affected = [];
    let origin = { x: null, z: null };
    if (hazard.type === 'pulse') {
      origin = { x: hazard.x, z: this.platform.laneZ };
      affected = candidates.filter((f) => dist(f, origin) <= hazard.radius);
    } else if (hazard.type === 'lava') {
      affected = candidates.filter((f) => f.x >= hazard.minX && f.x <= hazard.maxX);
    } else if (hazard.type === 'laser') {
      const positions = hazard.positions?.length ? hazard.positions : [0];
      origin = { x: positions[hazard.triggerCount % positions.length], z: 0 };
      affected = candidates.filter((f) => Math.abs(f.x - origin.x) <= hazard.width);
    } else if (hazard.type === 'rocks') {
      const target = candidates[hazard.triggerCount % Math.max(1, candidates.length)];
      if (target) {
        origin = { x: target.x, z: this.platform.laneZ };
        affected = candidates.filter((f) => dist(f, origin) <= hazard.radius);
      }
    } else {
      const safe = {
        minX: this.platform.minX + hazard.insetX, maxX: this.platform.maxX - hazard.insetX,
      };
      affected = candidates.filter((f) => f.x < safe.minX || f.x > safe.maxX);
    }
    const targets = [];
    for (const fighter of affected) {
      if (fighter.invulnerable > 0 && hazard.type !== 'void') continue;
      fighter.hp = clamp(fighter.hp - hazard.damage, 0, fighter.maxHp);
      fighter.lastAttacker = null;
      fighter.pendingKOReason = hazard.type;
      fighter.stun = Math.max(fighter.stun, hazard.type === 'void' ? 0 : 0.25);
      if (hazard.force && origin.x != null) {
        let direction = norm(fighter.x - origin.x);
        if (dist(fighter, origin) < 0.001) direction = { x: this.fighters.indexOf(fighter) % 2 ? 1 : -1, z: 0 };
        fighter.x += direction.x * hazard.force;
        fighter.z = this.platform.laneZ;
      }
      targets.push(fighter.id);
      this.events.push({
        type: 'hazardHit', hazard: hazard.type, hazardId: hazard.id,
        fighter: fighter.id, damage: hazard.damage, hp: fighter.hp,
      });
    }
    this.events.push({
      type: 'hazard', hazard: hazard.type, hazardId: hazard.id,
      sequence: hazard.triggerCount, targets, damage: hazard.damage, x: origin.x, z: origin.z,
    });
  }

  resolveSeparation() {
    const active = this.fighters.filter((f) => !f.eliminated && !f.knockedOut && f.hp > 0);
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const gap = dist(active[i], active[j]);
        if (gap >= 1.2) continue;
        const direction = gap > 0
          ? norm(active[j].x - active[i].x)
          : { x: i % 2 ? -1 : 1, z: 0 };
        const push = (1.2 - gap) * 0.5;
        active[i].x -= direction.x * push;
        active[j].x += direction.x * push;
        active[i].z = this.platform.laneZ;
        active[j].z = this.platform.laneZ;
      }
    }
  }

  withinPlatform(x, z, margin = 0) {
    return x >= this.platform.minX - margin && x <= this.platform.maxX + margin;
  }

  checkDefeats() {
    for (const fighter of this.fighters) {
      if (fighter.eliminated || fighter.knockedOut) continue;
      if (!this.withinPlatform(fighter.x, fighter.z) || fighter.y <= this.platform.fallY) {
        this.events.push({ type: 'ringOut', fighter: fighter.id, x: fighter.x, y: fighter.y, z: fighter.z });
        this.knockout(fighter, fighter.lastAttacker, 'ringout');
      } else if (fighter.hp <= 0) {
        this.knockout(fighter, fighter.lastAttacker, fighter.pendingKOReason ?? 'damage');
      }
    }
    this.evaluateRules();
  }

  knockout(fighter, attackerId = null, reason = 'damage') {
    if (!fighter || fighter.eliminated || fighter.knockedOut) return false;
    const attacker = this.fighters.find((f) => f.id === attackerId) ?? null;
    Object.assign(fighter, {
      hp: 0, action: 'ko', actionTimer: 0, stun: 0, invulnerable: 0,
      overdrive: 0, powerBoost: 0, guarding: false,
      knockedOut: true, respawnTimer: this.respawnDelay,
      lastAttacker: null, pendingKOReason: null,
    });
    fighter.deaths += 1;
    if (attacker && attacker !== fighter) {
      attacker.kos += 1;
      if (this.rule !== 'race') attacker.score += 1;
    }
    if (fighter.formIndex > 0) {
      const from = fighter.formIndex--;
      this.events.push({
        type: 'devolve', fighter: fighter.id, from, to: fighter.formIndex,
        form: fighter.forms[fighter.formIndex].name,
      });
    }
    if (this.rule === 'stock') {
      fighter.stocks = Math.max(0, fighter.stocks - 1);
      fighter.lives = fighter.stocks;
      if (fighter.stocks === 0) {
        fighter.eliminated = true;
        fighter.knockedOut = false;
        fighter.respawnTimer = 0;
      }
    }
    this.events.push({
      type: 'ko', fighter: fighter.id, attacker: attacker?.id ?? null,
      reason, stocks: fighter.stocks, formIndex: fighter.formIndex,
    });
    if (fighter.eliminated) this.events.push({ type: 'eliminated', fighter: fighter.id });
    return true;
  }

  updateRespawns(dt) {
    for (const fighter of this.fighters) {
      if (!fighter.knockedOut || fighter.eliminated) continue;
      fighter.respawnTimer = Math.max(0, fighter.respawnTimer - dt);
      if (fighter.respawnTimer > 0) continue;
      Object.assign(fighter, {
        x: fighter.spawnX, z: this.platform.laneZ, y: 0, vy: 0, hp: fighter.maxHp,
        action: 'idle', actionTimer: 0, actionElapsed: 0, actionTargetId: null,
        attackCooldown: 0, skillCooldown: 0, healCooldown: 0, stun: 0, invulnerable: 1.15,
        dashTimer: 0, grounded: true, guarding: false, attackHit: false, comboStep: 0,
        comboWindow: 0, knockedOut: false,
      });
      this.events.push({
        type: 'respawn', fighter: fighter.id, x: fighter.x, z: fighter.z,
        stocks: fighter.stocks, formIndex: fighter.formIndex,
      });
    }
  }

  evaluateRules() {
    if (this.phase !== 'battle') return;
    if (this.rule === 'stock' && this.fighters.length > 1) {
      const survivors = this.fighters.filter((f) => !f.eliminated);
      if (survivors.length <= 1) {
        this.finish(survivors[0]?.id ?? 'draw', 'last-stock');
        return;
      }
    }
    if (this.rule === 'race') {
      const winner = this.fighters.find((f) => f.score >= this.raceTarget);
      if (winner) {
        this.finish(winner.id, 'race-target');
        return;
      }
    }
    if (this.rule !== 'training' && Number.isFinite(this.time) && this.time <= 0) this.finishFromRanking('time');
  }

  metrics(fighter) {
    if (this.rule === 'timed') return [fighter.score, fighter.hp, fighter.formIndex, fighter.energy];
    if (this.rule === 'race') return [fighter.score, fighter.formIndex, fighter.energy, fighter.hp];
    return [fighter.stocks, fighter.hp, fighter.score, fighter.formIndex, fighter.energy];
  }

  rankFighters() {
    const ranked = this.fighters.map((fighter) => ({
      id: fighter.id, score: fighter.score, stocks: fighter.stocks, hp: fighter.hp,
      formIndex: fighter.formIndex, energy: fighter.energy, eliminated: fighter.eliminated,
      metrics: this.metrics(fighter),
    }));
    ranked.sort((a, b) => {
      for (let index = 0; index < a.metrics.length; index += 1) {
        if (a.metrics[index] !== b.metrics[index]) return b.metrics[index] - a.metrics[index];
      }
      return a.id.localeCompare(b.id);
    });
    let previous = null;
    let rank = 0;
    return ranked.map((entry, index) => {
      const signature = entry.metrics.join('|');
      if (signature !== previous) rank = index + 1;
      previous = signature;
      const { metrics, ...result } = entry;
      return { ...result, rank };
    });
  }

  finishFromRanking(reason) {
    const ranking = this.rankFighters();
    this.finish(ranking.length > 1 && ranking[0].rank === ranking[1].rank ? 'draw' : ranking[0]?.id ?? 'draw', reason);
  }

  finish(winner, reason) {
    if (this.phase === 'ended') return false;
    this.phase = 'ended';
    this.winner = winner;
    this.endReason = reason;
    this.paused = false;
    this.events.push({ type: 'ended', winner, reason, ranking: this.rankFighters() });
    return true;
  }

  getState() {
    const fighters = this.fighters.map((fighter) => ({
      ...fighter,
      forms: fighter.forms.map((form) => ({ ...form })),
      currentForm: { ...fighter.forms[fighter.formIndex] },
    }));
    const byId = Object.fromEntries(fighters.map((fighter) => [fighter.id, fighter]));
    return {
      seed: this.seed, randomState: this.randomState,
      phase: this.phase, phaseTimer: this.phaseTimer, paused: this.paused,
      rule: this.rule, time: this.time, elapsed: this.elapsed,
      winner: this.winner, endReason: this.endReason,
      rules: {
        duration: this.duration, initialStocks: this.initialStocks,
        raceTarget: this.raceTarget, respawnDelay: this.respawnDelay,
      },
      platform: { ...this.platform },
      combatPlane: { horizontal: 'x', vertical: 'y', lockedDepth: this.platform.laneZ },
      arenaRadius: this.arenaRadius,
      fighters,
      player: this.player ? byId[this.player.id] : null,
      enemy: this.enemy ? byId[this.enemy.id] : null,
      projectiles: this.projectiles.map((value) => ({ ...value })),
      energyOrbs: this.energyOrbs.map((value) => ({ ...value })),
      items: this.items.map((value) => ({ ...value })),
      pickup: this.pickup ? { ...this.pickup } : null,
      hazards: this.hazards.map((value) => ({
        ...value, positions: value.positions ? [...value.positions] : undefined,
      })),
      ranking: this.rankFighters(),
      events: this.events.map((event) => ({
        ...event,
        targets: Array.isArray(event.targets) ? [...event.targets] : event.targets,
      })),
    };
  }
}
