// 游戏核心:渲染器、固定步长物理循环、回合/比赛规则、镜头、事件 -> 音效/特效/HUD。
import * as THREE from 'three';
import { Physics, initPhysics, DT, groups, G } from './physics.js';
import { Creature } from './creature.js';
import { Brain } from './ai.js';
import { Item, Projectiles, WEAPON_POOL } from './items.js';
import { FX } from './fx.js';
import { Builder } from './mapkit.js';
import { MAPS, mapById } from './maps/index.js';
import { audio } from './audio.js';
import { SPECIES, speciesById } from './animals.js';
import { Input } from './input.js';
import { Showcase } from './showcase.js';

const CAM_GROUPS = groups(G.BODY, G.ENV);
export const BOT_NAMES = ['团子', '豆包', '年糕', '芝麻', '布丁', '奶糖', '汤圆', '麻薯', '栗子', '可乐', '馒头', '花卷', '饭团', '果冻'];
export const TEAM_COLORS = ['#ff5d6c', '#4aa3ff', '#ffc93c', '#5fd68a'];
export const TEAM_NAMES = ['红队', '蓝队', '黄队', '绿队'];
const FFA_COLORS = ['#ffffff', '#ffb35c', '#7fd7ff', '#c79bff', '#7ee08a', '#ff8fb3', '#ffe16b', '#9ab0c9'];

function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Game {
  constructor(container, ui) {
    this.ui = ui;
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: /bench|shot/.test(location.search) });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
    this.hemi = new THREE.HemisphereLight('#bcd8ff', '#6b5a4a', 1.1);
    this.sun = new THREE.DirectionalLight('#fff2dd', 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.input = new Input(this.canvas);
    this.fx = new FX(this.scene);
    this.showcase = new Showcase(this.renderer);
    this.state = 'menu';
    this.time = 0; this.roundT = 0; this.acc = 0; this.timeScale = 1; this.slowT = 0;
    this.creatures = []; this.items = []; this.brains = [];
    this.cam = { yaw: 0, pitch: 0.4, dist: 8, target: new THREE.Vector3(), shake: 0 };
    this.rand = mulberry(Date.now() & 0xffff);
    this.friendlyFire = false;
    this.winnerFace = new Set();
    this.spectate = 0;
    this.settings = { sens: 1, shadows: true, quality: 'high' };
    this.paused = false;
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  async init() { await initPhysics(); }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.showcase.resize(w, h);
  }

  // ---------------- 比赛 ----------------
  // cfg: { mode:'ffa'|'team'|'practice', map:'random'|id, rounds, bots, difficulty, teamSize, player:{species,palette,name} }
  startMatch(cfg) {
    this.cfg = cfg;
    this.seed = cfg.seed ?? (Date.now() & 0xffffff);
    this.rand = mulberry(this.seed);
    const parts = [];
    const nPlayers = cfg.mode === 'practice' ? 4 : 1 + cfg.bots;
    const names = [...BOT_NAMES].sort(() => this.rand() - 0.5);
    // 电脑的物种从打乱的物种池里轮流取,尽量不和玩家/彼此重复
    const pool = SPECIES.map((s) => s.id).filter((id) => cfg.spectateOnly || id !== cfg.player.species).sort(() => this.rand() - 0.5);
    let pi = 0;
    for (let i = 0; i < nPlayers; i++) {
      const isPlayer = i === 0 && !cfg.spectateOnly;
      const sp = isPlayer ? cfg.player.species : pool[pi++ % pool.length];
      const pal = isPlayer ? cfg.player.palette : Math.floor(this.rand() * 3);
      let team = i;
      if (cfg.mode === 'team') team = i % 2;
      if (cfg.mode === 'practice') team = i === 0 ? 0 : 1;
      parts.push({
        id: i + 1, isPlayer, species: sp, palette: pal % speciesById[sp].palettes.length,
        name: isPlayer ? (cfg.player.name || '我') : names[i % names.length],
        team, wins: 0, kos: 0, throws: 0, hits: 0, elims: 0,
        color: cfg.mode === 'team' ? TEAM_COLORS[team] : FFA_COLORS[i % FFA_COLORS.length],
        difficulty: cfg.mode === 'practice' ? -1 : cfg.difficulty,
      });
    }
    this.participants = parts;
    this.teamWins = {};
    this.round = 0;
    this.mapQueue = [];
    this.showcase.active = false;
    this.input.enabled = true;
    this.nextRound();
  }

  pickMap() {
    if (this.cfg.map !== 'random') return mapById[this.cfg.map];
    if (!this.mapQueue.length) this.mapQueue = MAPS.map((m) => m.id).sort(() => this.rand() - 0.5);
    return mapById[this.mapQueue.shift()];
  }

  nextRound() {
    this.round++;
    const mdef = this.pickMap();
    this.buildWorld(mdef);
    this.state = 'intro';
    this.introT = 3.2;
    this.roundT = 0;
    this.sdOn = false;
    this.winnerFace.clear();
    this.weaponT = 4;
    this.timeScale = 1; this.slowT = 0;
    this.roundWinner = null;
    this.ui.roundIntro(this.round, mdef, this.cfg);
    audio.music('battle');
    audio.play('whistle');
  }

  buildWorld(mdef) {
    this.teardownWorld();
    this.phys = new Physics();
    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);
    this.items = []; this.creatures = []; this.brains = [];
    this.projectiles = new Projectiles(this);
    this.mapDef = mdef;
    const B = new Builder(this, this.worldRoot);
    this.map = mdef.build(this, B);
    this.applyLight(mdef.light);
    audio.ambient(mdef.ambient);
    // 出生点(把压在出生点上的道具挪开)
    const spawns = [...this.map.spawns].sort(() => this.rand() - 0.5);
    for (const it of this.items) {
      const p = it.body.translation();
      for (const s of spawns) {
        const dx = p.x - s[0], dz = p.z - s[2], d = Math.hypot(dx, dz);
        if (d < 1.1) {
          const k = (1.1 - d + 0.05) / Math.max(d, 0.01);
          it.body.setTranslation({ x: p.x + (d > 0.01 ? dx * k : 1.15), y: p.y, z: p.z + (d > 0.01 ? dz * k : 0) }, true);
          it.sync(); it.sync();
        }
      }
    }
    const C = this.map.cam.target;
    this.participants.forEach((p, i) => {
      const s = spawns[i % spawns.length];
      const yaw = Math.atan2(C[0] - s[0], C[2] - s[2]);
      const c = new Creature(this, { id: p.id, name: p.name, species: p.species, palette: p.palette, team: p.team, isPlayer: p.isPlayer, pos: new THREE.Vector3(s[0], s[1], s[2]), yaw, color: p.color });
      c.part = p;
      this.creatures.push(c);
      if (!p.isPlayer) this.brains.push(new Brain(c, this, p.difficulty < 0 ? 0 : p.difficulty));
      if (p.difficulty < 0) c.dummy = true;
    });
    this.player = this.creatures.find((c) => c.isPlayer) || null;
    const focus = this.player || this.creatures[0];
    this.cam.yaw = focus.facing; this.cam.target.copy(focus.pos);
    this.spectate = 0;
  }

  teardownWorld() {
    if (!this.phys) return;
    for (const c of this.creatures) this.scene.remove(c.root);
    for (const it of this.items) this.scene.remove(it.mesh);
    this.projectiles?.clear();
    this.fx.clear();
    if (this.worldRoot) {
      this.scene.remove(this.worldRoot);
      this.worldRoot.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) for (const m of [].concat(o.material)) { if (m.map && m.map.source && !m.map.userData.keep) m.map.dispose(); m.dispose(); }
      });
    }
    this.phys.world.free();
    this.phys = null;
    this.creatures = []; this.items = []; this.brains = [];
    this.ui.clearPlates();
  }

  applyLight(L) {
    const d = new THREE.Vector3(...L.sunDir).normalize();
    this.sunDir = d;
    this.sun.color.set(L.sun); this.sun.intensity = L.sunI;
    this.hemi.color.set(L.sky); this.hemi.groundColor.set(L.ground); this.hemi.intensity = L.hemiI;
    this.scene.fog = new THREE.Fog(L.fog[0], L.fog[1], L.fog[2]);
    this.renderer.toneMappingExposure = L.exposure;
    this.baseHemi = L.hemiI;
  }

  quitToMenu() {
    this.teardownWorld();
    this.state = 'menu';
    this.input.enabled = false;
    this.input.exitLock();
    this.showcase.active = true;
    audio.music('menu');
    audio.ambient(null);
  }

  spawnItem(type, pos, rot) {
    const it = new Item(this, type, pos, rot);
    this.items.push(it);
    return it;
  }

  // ---------------- 主循环 ----------------
  frame(dtReal) {
    const dt = Math.min(dtReal, 0.1);
    if (this.state === 'menu' || !this.phys) {
      this.showcase.render(dt);
      return;
    }
    if (!this.paused) {
      if (this.slowT > 0) { this.slowT -= dt; this.timeScale = this.slowT > 0 ? 0.35 : 1; }
      // 命中顿帧:短暂冻结物理,让打击有"咬合感"
      if (this.hitStop > 0) this.hitStop -= dt;
      else this.acc += dt * this.timeScale;
      let n = 0;
      if (this.benchDrive) { /* 评测钩子直接写 intent */ } else if (this.player && this.player.alive) this.input.apply(this.player.intent, this.cam.yaw, (0.42 - this.cam.pitch) * 1.35);
      else this.input.apply({ ...this.player?.intent || {}, mash: 0 }, 0, 0);
      while (this.acc >= DT && n < 5) { this.step(); this.acc -= DT; n++; }
      if (n === 5) this.acc = 0;
    }
    this.renderWorld(dt);
  }

  step() {
    this.time += DT;
    const st = this.state;
    if (st === 'intro') {
      this.introT -= DT;
      for (const c of this.creatures) { c.intent.moveX = c.intent.moveZ = 0; c.intent.punch = c.intent.kick = c.intent.jump = false; c.intent.grab = false; c.intent.headbutt = false; }
      const sec = Math.ceil(this.introT);
      if (sec !== this.lastBeep && sec >= 1 && sec <= 3) { this.lastBeep = sec; audio.play('beep'); this.ui.countdown(sec); }
      if (this.introT <= 0) { this.state = 'fight'; this.ui.countdown('开打!'); audio.play('go'); this.lastBeep = null; }
    } else if (st === 'fight' || st === 'roundEnd') {
      if (st === 'fight') this.roundT += DT;
      for (const b of this.brains) if (!b.c.dummy) b.step(DT); else this.dummyStep(b.c);
    }
    this.map.update?.(DT, this.roundT, this.time);
    for (let i = this.items.length - 1; i >= 0; i--) { const it = this.items[i]; it.step(DT); if (!it.alive) this.items.splice(i, 1); }
    for (const c of this.creatures) c.preStep(DT, this.time);
    this.phys.step();
    for (const c of this.creatures) c.postStep(DT, this.time);
    for (const it of this.items) if (it.alive) it.sync();
    this.map.afterStep?.();
    this.projectiles.step(DT);
    this.checkOut();
    if (st === 'fight') this.roundRules();
    else if (st === 'roundEnd') {
      this.endT -= DT;
      if (this.endT <= 0) this.afterRound();
    }
  }

  dummyStep(c) {
    // 练习场木桩:站着不动,晕倒后挣扎,被打出界后自动复活
    const it = c.intent;
    it.moveX = it.moveZ = 0; it.grab = false;
    if (c.ko || c.heldBy.size) it.mash += Math.random() < 0.03 ? 1 : 0;
  }

  checkOut() {
    const m = this.map;
    for (const c of this.creatures) {
      if (c.alive) {
        const p = c.pos;
        let out = null;
        if (p.y < m.killY) out = 'fall';
        else if (m.water) {
          const h = m.water.heightAt(p.x, p.z, this.time);
          if (p.y < h - 0.22 || c.headPos.y < h - 0.05) out = 'water';
        }
        if (out) c.eliminate(out);
      } else if (c.root.visible) {
        const t = this.time - c.eliminatedT;
        if ((c.elimReason === 'water' && t > 0.8) || t > 2.5 || c.elimReason === 'gas' && t > 0.1) {
          if (c.elimReason === 'gas') this.fx.emit(c.pos.clone(), 14, { color: '#9fe066', speed: 1.5, life: 1, size: 0.5, grow: 2 });
          c.root.visible = false;
          c.disablePhysics();
        }
      }
    }
    if (this.cfg.mode === 'practice') {
      for (const c of this.creatures) if (!c.alive && this.time - c.eliminatedT > 2.5) this.respawn(c);
    }
  }

  respawn(c) {
    const idx = this.creatures.indexOf(c);
    c.destroy();
    const s = this.map.spawns[Math.floor(this.rand() * this.map.spawns.length)];
    const p = c.part;
    const n = new Creature(this, { id: p.id, name: p.name, species: p.species, palette: p.palette, team: p.team, isPlayer: p.isPlayer, pos: new THREE.Vector3(s[0], s[1] + 1.5, s[2]), yaw: 0, color: p.color });
    n.part = p; n.dummy = c.dummy;
    this.creatures[idx] = n;
    const b = this.brains.find((br) => br.c === c);
    if (b) b.c = n;
    if (c === this.player) this.player = n;
    this.fx.sparkle(n.pos.clone());
    this.ui.clearPlates();
  }

  roundRules() {
    // 武器空投
    this.weaponT -= DT;
    const armed = this.items.filter((i) => i.def.weapon || i.type === 'bomb').length;
    if (this.weaponT <= 0) {
      this.weaponT = 8 + this.rand() * 6;
      if (armed < 2 + Math.floor(this.creatures.length / 3)) {
        const spots = this.map.weaponSpots;
        const s = spots[Math.floor(this.rand() * spots.length)];
        const type = WEAPON_POOL[Math.floor(this.rand() * WEAPON_POOL.length)];
        const it = this.spawnItem(type, new THREE.Vector3(s[0], s[1] + 5, s[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, this.rand() * 6, Math.PI / 2)));
        this.fx.sparkle(new THREE.Vector3(s[0], s[1] + 5, s[2]));
        audio.play('pickup', { pitch: 1.4, volume: 0.5 });
      }
    }
    if (this.cfg.mode === 'practice') return;
    // 突然死亡
    const sdAt = this.cfg.suddenDeath ?? 90;
    if (!this.sdOn && this.roundT > sdAt) {
      this.sdOn = true;
      this.map.suddenDeath?.(this);
      audio.music('tense');
      this.ui.suddenDeath();
    }
    // 胜负
    const aliveTeams = new Set(this.creatures.filter((c) => c.alive).map((c) => c.team));
    if (aliveTeams.size <= 1 || this.roundT > 240) {
      this.state = 'roundEnd';
      this.endT = 4.2;
      this.slowT = 1.4;
      const team = aliveTeams.size === 1 && this.roundT <= 240 ? [...aliveTeams][0] : null;
      this.roundWinner = team;
      if (team !== null) {
        this.teamWins[team] = (this.teamWins[team] || 0) + 1;
        for (const c of this.creatures) if (c.team === team) { this.winnerFace.add(c); if (c.alive) { audio.vocal(c.species, 'win'); this.fx.confetti(c.headPos.clone().add(new THREE.Vector3(0, 1, 0))); } }
        for (const p of this.participants) if (p.team === team) p.wins++;
      }
      for (const c of this.creatures) { const p = c.part; p.kos += c.stats.kos; p.throws += c.stats.throws; p.hits += c.stats.hits; }
      audio.music('victory');
      audio.play('roundWin');
      audio.play('crowd', { volume: 0.7 });
      this.ui.roundEnd(team, this);
    }
  }

  afterRound() {
    const target = this.cfg.rounds;
    const champ = Object.entries(this.teamWins).find(([t, w]) => w >= target);
    if (champ) {
      this.state = 'matchEnd';
      audio.play('matchWin');
      this.input.exitLock();
      this.ui.matchEnd(Number(champ[0]), this);
    } else this.nextRound();
  }

  // ---------------- 镜头 & 渲染 ----------------
  focusCreature() {
    if (this.player && this.player.alive) return this.player;
    const alive = this.creatures.filter((c) => c.alive);
    if (!alive.length) return this.player || this.creatures[0];
    return alive[((this.spectate % alive.length) + alive.length) % alive.length];
  }

  renderWorld(dt) {
    const alpha = Math.min(1, this.acc / DT);
    const look = this.input.takeLook();
    const cam = this.cam;
    if (!this.paused) {
      cam.yaw -= look.dx * 0.0024 * this.settings.sens;
      // Q/E 键盘转镜头(不依赖鼠标)
      const K = this.input.keys;
      if (this.input.enabled) cam.yaw += ((K.has('KeyQ') ? 1 : 0) - (K.has('KeyE') ? 1 : 0)) * 2.4 * dt;
      cam.pitch = THREE.MathUtils.clamp(cam.pitch + look.dy * 0.0021 * this.settings.sens, -0.3, 1.25);
      cam.dist = THREE.MathUtils.clamp(cam.dist + look.wheel * 0.7, 4, 18);
    }
    const f = this.focusCreature();
    for (const c of this.creatures) c.render(alpha, this.time, dt);
    for (const it of this.items) it.render(alpha);
    this.map.frame?.(this.time, dt, alpha);
    if (f) {
      const p = f.vis.torso.position;
      const goal = new THREE.Vector3(p.x, p.y + 0.75, p.z);
      if (!f.alive) goal.y = Math.max(goal.y, this.map.killY + 2);
      cam.target.lerp(goal, 1 - Math.exp(-dt * 9));
    }
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const dir = new THREE.Vector3(-Math.sin(cam.yaw) * cp, sp, -Math.cos(cam.yaw) * cp);
    let dist = cam.dist;
    if (this.phys) {
      const hit = this.phys.castRay({ x: cam.target.x, y: cam.target.y, z: cam.target.z }, { x: dir.x, y: dir.y, z: dir.z }, dist, CAM_GROUPS);
      if (hit) dist = Math.max(1.2, hit.toi - 0.25);
    }
    cam.curDist = cam.curDist === undefined ? dist : (dist < cam.curDist ? dist : THREE.MathUtils.lerp(cam.curDist, dist, 1 - Math.exp(-dt * 4)));
    this.camera.position.copy(cam.target).addScaledVector(dir, cam.curDist);
    if (cam.shake > 0) {
      cam.shake = Math.max(0, cam.shake - dt * 2.5);
      const s = cam.shake * cam.shake * 0.42;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    }
    this.camera.lookAt(cam.target);
    // 重击时视野瞬间收缩再弹回
    cam.fovKick = (cam.fovKick || 0) * Math.exp(-dt * 10);
    const fov = 55 - cam.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    // 阴影跟随镜头
    if (this.sunDir) {
      this.sun.target.position.copy(cam.target);
      this.sun.position.copy(cam.target).addScaledVector(this.sunDir, 40);
    }
    if (this.flashT > 0) { this.flashT -= dt; this.hemi.intensity = this.baseHemi * (1 + this.flashT * 8); } else this.hemi.intensity = this.baseHemi;
    this.fx.update(dt, this.creatures, this.time);
    this.renderer.render(this.scene, this.camera);
    this.ui.hud(this, dt);
  }

  // ---------------- 地图/道具接口 ----------------
  announce(title, sub) { this.ui.announce(title, sub); }
  sfx(name, opts) { audio.play(name, opts); }
  flash(x) { this.flashT = 0.18 * x; }
  setAmbientIntensity(x) { audio.setAmbientIntensity(x); }

  explosion(p, radius, dmg, owner) {
    for (const c of this.creatures) {
      if (!c.alive) continue;
      const d = c.pos.distanceTo(p);
      if (d > radius) continue;
      const k = 1 - d / radius;
      const dir = c.pos.clone().sub(p).normalize(); dir.y = Math.abs(dir.y) + 0.6; dir.normalize();
      c.addVel(dir.x * 11 * k, dir.y * 9 * k, dir.z * 11 * k);
      c.ragT = Math.max(c.ragT, 1.4 * k + 0.3);
      c.dvGrace = 0.3;
      if (owner && owner !== c) { c.lastAttacker = owner; c.lastAttackerT = this.time; }
      c.damage(dmg * k, owner, 'bomb');
    }
    for (const it of this.items) {
      if (!it.alive || it.holder) continue;
      const tp = it.curP, d = tp.distanceTo(p);
      if (d > radius) continue;
      const dir = tp.clone().sub(p).normalize(); dir.y += 0.6;
      const m = it.body.mass(), k = 1 - d / radius;
      it.body.applyImpulse({ x: dir.x * m * 9 * k, y: dir.y * m * 9 * k, z: dir.z * m * 9 * k }, true);
    }
    this.fx.explosion(p);
    this.positional('bomb', p, { volume: 1.4 });
    this.shakeAt(p, 1.2);
    this.flash(0.6);
  }

  shakeAt(p, k) {
    const d = this.camera.position.distanceTo(p);
    this.cam.shake = Math.max(this.cam.shake, k * THREE.MathUtils.clamp(1 - d / 25, 0, 1));
  }

  positional(name, p, opts = {}) {
    if (!p) { audio.play(name, opts); return; }
    const d = this.camera.position.distanceTo(p);
    const vol = THREE.MathUtils.clamp(1.15 - d / 28, 0.08, 1) * (opts.volume ?? 1);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const pan = THREE.MathUtils.clamp(p.clone().sub(this.camera.position).normalize().dot(right), -1, 1) * 0.7;
    audio.play(name, { ...opts, volume: vol, pan });
  }
  voice(c, kind, chance = 1) {
    if (Math.random() > chance) return;
    const d = this.camera.position.distanceTo(c.headPos);
    audio.vocal(c.species, kind, { volume: THREE.MathUtils.clamp(1.1 - d / 30, 0.1, 1) });
  }

  emit(type, e) {
    const c = e.c;
    switch (type) {
      case 'swing':
        this.positional('whoosh', c.pos, { pitch: e.kind === 'heavy' || e.kind === 'dropkick' ? 0.75 : e.kind === 'headbutt' ? 0.9 : 1.15, volume: 0.6 });
        if (e.kind !== 'punch') this.voice(c, 'effort', 0.6); else this.voice(c, 'effort', 0.15);
        break;
      case 'hit': {
        const k = e.kind;
        const name = e.weapon ? e.weapon.def.sound : k === 'kick' || k === 'dropkick' ? 'kick' : k === 'headbutt' ? 'headbutt' : k === 'heavy' ? 'punchHeavy' : k === 'bomb' ? null : 'punch';
        const mine = c === this.player || e.attacker === this.player;
        const near = this.camera.position.distanceTo(e.p) < 9;
        const pw = Math.min(2, e.dmg / 14);
        if (name) this.positional(name, e.p, { pitch: 0.85 + Math.random() * 0.2, volume: mine ? 1.4 : 1 });
        if (e.dmg > 18 && name !== 'punchHeavy') this.positional('punchHeavy', e.p, { volume: mine ? 0.9 : 0.6, pitch: 0.8 });
        // 特效点往镜头方向挪一点,别被两只毛球挡住
        const fp = e.p.clone().addScaledVector(this.camera.position.clone().sub(e.p).normalize(), 0.35);
        this.fx.hit(fp, pw, !!e.weapon || e.kind !== 'punch' || e.dmg > 14);
        this.voice(c, 'hurt', e.dmg > 12 ? 0.9 : 0.5);
        if (mine || (near && e.dmg > 18)) {
          this.hitStop = Math.max(this.hitStop || 0, Math.min(0.14, 0.04 + e.dmg * 0.0028) * (mine ? 1 : 0.6));
          this.shakeAt(e.p, Math.min(1.3, 0.35 + e.dmg / 28) * (mine ? 1 : 0.5));
          if (e.dmg > 18) this.cam.fovKick = Math.max(this.cam.fovKick || 0, Math.min(7, e.dmg / 6));
        }
        if (e.attacker === this.player) this.ui.hitMarker(e.dmg);
        break;
      }
      case 'ko':
        this.positional('ko', c.headPos);
        this.voice(c, 'ko');
        if (e.by) this.ui.feed(`<b style="color:${e.by.color}">${e.by.name}</b> 打晕了 <b style="color:${c.color}">${c.name}</b>`);
        break;
      case 'wake': this.positional('wake', c.headPos, { volume: 0.6 }); break;
      case 'grab': this.positional('grab', c.pos, { volume: 0.5 }); break;
      case 'release': break;
      case 'throw': this.positional('throw', c.pos); this.voice(c, 'effort', 0.8); break;
      case 'jump': this.positional('jump', c.pos, { volume: 0.35 }); break;
      case 'impact':
        this.positional('land', e.p, { volume: Math.min(1, e.dv / 18) });
        this.fx.dust(e.p);
        break;
      case 'eliminate': {
        const by = e.by && e.by !== c ? e.by : null;
        if (e.reason === 'water') { this.fx.splash(c.pos.clone()); this.positional('splash', c.pos, { volume: 1.2 }); }
        else if (e.reason === 'fall') this.positional('fallWhistle', c.pos);
        this.voice(c, 'fall');
        this.positional('eliminate', c.pos, { volume: 0.7 });
        const how = e.reason === 'water' ? '扔进了水里' : e.reason === 'gas' ? '留在了毒雾里' : '扔出了场外';
        if (by) { this.ui.feed(`<b style="color:${by.color}">${by.name}</b> 把 <b style="color:${c.color}">${c.name}</b> ${how}`); by.part && by.part.elims++; }
        else this.ui.feed(`<b style="color:${c.color}">${c.name}</b> ${e.reason === 'gas' ? '被毒雾熏晕出局' : e.reason === 'water' ? '掉进水里出局' : '掉下去了'}`);
        if (c === this.player) { this.ui.announce('你出局了', '左键/空格 切换观战'); this.cam.shake = 0.6; }
        break;
      }
      case 'pickup': this.positional('pickup', c.pos); if (c === this.player) this.ui.toast(`拾起 ${e.item.def.name}`); break;
      case 'drop': this.positional('drop', c.pos, { volume: 0.5 }); break;
      case 'shoot': this.positional('iceShot', e.p); break;
      case 'iceHit': this.fx.ice(e.p); break;
      case 'freeze': this.positional('freeze', c.pos); break;
      case 'thaw': this.positional('iceBreak', c.pos, { volume: 0.7 }); this.fx.ice(c.pos.clone()); break;
      case 'fuse': this.positional('gas', e.item.curP, { volume: 0.3, pitch: 1.6 }); break;
      case 'hitprop': this.positional('bat', e.p, { volume: 0.4, pitch: 0.7 }); break;
      case 'gripfail': if (c === this.player) this.ui.toast('手酸了!'); break;
    }
  }

  // 观战切换
  cycleSpectate(d = 1) { this.spectate += d; }
}
