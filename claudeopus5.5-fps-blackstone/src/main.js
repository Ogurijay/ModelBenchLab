// 黑石行动 BLACKSTONE —— Three.js 第一人称射击。入口与主循环。

import * as THREE from 'three';
import { RNG, clamp, damp, lerp, DEG } from './core/util.js';
import { Input } from './core/input.js';
import { AudioSys } from './audio/audio.js';
import { CollisionWorld, SIGHT } from './world/collision.js';
import { LevelBuilder } from './world/builder.js';
import { buildFacility, WORLD_BOUNDS, zoneAt } from './world/map.js';
import { NavGrid } from './world/nav.js';
import { generateTextures } from './world/textures.js';
import { createMaterials } from './world/materials.js';
import { Environment } from './world/environment.js';
import { Effects } from './fx/effects.js';
import { Post } from './fx/post.js';
import { Player } from './player/player.js';
import { ViewModel } from './weapons/viewmodel.js';
import { Arsenal } from './weapons/arsenal.js';
import { WEAPONS } from './weapons/defs.js';
import { EnemyManager, TYPES } from './ai/enemies.js';
import { Projectiles } from './game/projectiles.js';
import { Grenades, Barrels, Pickups, SupplyCrates, Door } from './game/props.js';
import { Interactables } from './game/interact.js';
import { Helicopter } from './game/heli.js';
import { Mission } from './game/mission.js';
import { Survival } from './game/survival.js';
import { HUD } from './ui/hud.js';
import { Menu, loadSettings } from './ui/menu.js';

const nextFrame = () => new Promise((r) => setTimeout(r, 16));

const DIFF_LABEL = { easy: '新兵', normal: '老兵', hard: '精英' };

class Game {
  constructor() {
    this.settings = loadSettings();
    this.quality = this.settings.quality;
    this.rng = new RNG(20871);
    this.state = 'loading';
    this.time = 0;
    this.stats = this.freshStats();
    this.modeId = null;
    this.difficulty = 'normal';
    this.alarmT = 0;
    this.alarmSnd = null;
  }

  freshStats() {
    return { shots: 0, hits: 0, kills: 0, headshots: 0, damage: 0, taken: 0, time: 0, grenadeKills: 0, meleeKills: 0, score: 0 };
  }

  setLoad(k, text) {
    (this.loadTimes ||= []).push([text, Math.round(performance.now())]);
    document.getElementById('load-fill').style.width = `${Math.round(k * 100)}%`;
    if (text) document.getElementById('load-sub').textContent = text;
  }

  async init() {
    const q = this.quality;
    // 渲染器
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 1.25 : q === 'medium' ? 1 : 0.85));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = q !== 'low';
    renderer.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById('canvas-root').appendChild(renderer.domElement);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 700);
    this.camera.rotation.order = 'YXZ';
    this.audio = new AudioSys();
    this.input = new Input(renderer.domElement);
    this.G = this;

    this.setLoad(0.05, '生成程序化贴图……');
    await nextFrame();
    const aniso = renderer.capabilities.getMaxAnisotropy();
    this.T = generateTextures(Math.min(8, aniso));

    this.setLoad(0.35, '构建设施……');
    await nextFrame();
    const B0 = WORLD_BOUNDS;
    this.world = new CollisionWorld(B0.minX, B0.minZ, B0.maxX, B0.maxZ, 4);
    this.world.groundSurface = (x, z) => zoneAt(x, z).surface;
    const builder = new LevelBuilder(this.world);
    this.markers = buildFacility(builder);
    this.mats = createMaterials(this.T);
    this.level = builder.build(this.mats);
    this.scene.add(this.level);

    this.setLoad(0.55, '计算导航网格……');
    await nextFrame();
    for (const d of Object.values(this.markers.doors)) d.collider.enabled = false;
    this.nav = new NavGrid(this.world, { minX: -42, minZ: -46, maxX: 42, maxZ: 60 }).build();
    for (const d of Object.values(this.markers.doors)) d.collider.enabled = true;

    this.setLoad(0.65, '布置灯光……');
    await nextFrame();
    this.env = new Environment(renderer, this.scene, q);
    this.env.addMapLights(this.markers.lights);
    this.buildReactorCore();
    this.buildProps();

    this.setLoad(0.75, '装配武器与机器人……');
    await nextFrame();
    this.effects = new Effects(this.scene, this.world);
    this.vm = new ViewModel(this.T, this.env.envTex);
    this.player = new Player(this.world);
    this.hud = new HUD(this);
    this.arsenal = new Arsenal(this);
    this.enemies = new EnemyManager(this, this.T);
    this.enemies.onKilledCb = (e, info) => this.onEnemyKilled(e, info);
    this.projectiles = new Projectiles(this);
    this.grenades = new Grenades(this);
    this.barrels = new Barrels(this, this.markers.barrels);
    this.pickups = new Pickups(this, this.vm.M);
    this.supplies = new SupplyCrates(this, this.markers.supplies);
    this.doors = {};
    for (const [k, spec] of Object.entries(this.markers.doors)) this.doors[k] = new Door(this, spec, this.mats);
    this.interact = new Interactables(this);
    this.heli = new Helicopter(this);
    this.hud.buildRadar(this.world, { minX: -46, minZ: -50, maxX: 46, maxZ: 64 });
    this.post = new Post(renderer, this.scene, this.camera, this.vm.scene, this.vm.camera, q);
    this.wirePlayerSounds();

    this.setLoad(0.9, '预热着色器……');
    await nextFrame();
    // 预编译：让首帧不卡
    this.camera.position.set(0, 20, 60);
    this.camera.lookAt(0, 0, 0);
    renderer.compile(this.scene, this.camera);
    renderer.compile(this.vm.scene, this.vm.camera);

    this.menu = new Menu(this);
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.input.onEscape = () => {
      if (this.state === 'playing') this.pause();
    };
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.bench) this.pause();
    };
    document.getElementById('clicklock').addEventListener('click', () => this.resume());

    this.setLoad(1, '就绪');
    this.state = 'menu';
    document.getElementById('loading').classList.add('done');
    this.last = performance.now();
    this.lastFrameT = this.last;
    const loop = (now) => {
      requestAnimationFrame(loop);
      this.frame(now);
    };
    requestAnimationFrame(loop);
    // 标签页被隐藏时 rAF 停止：保留低频兜底，便于无头测试
    setInterval(() => {
      if (performance.now() - this.lastFrameT > 300 && !this.bench?.manual) this.frame(performance.now());
    }, 120);
    this.installBench();
  }

  buildReactorCore() {
    const r = this.markers.reactor;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uAlarm: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vP; varying vec2 vUv;
        void main() { vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAlarm; varying vec3 vN; varying vec3 vP; varying vec2 vUv;
        void main() {
          float fres = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(-vP))), 0.0, 1.0), 2.0);
          float bands = sin(vUv.y * 40.0 - uTime * 4.0) * 0.5 + 0.5;
          float swirl = sin(vUv.x * 18.85 + vUv.y * 12.0 + uTime * 2.0) * 0.5 + 0.5;
          float k = 0.55 + 0.45 * bands * swirl;
          vec3 calm = vec3(0.35, 2.4, 3.2);
          vec3 hot = vec3(4.0, 0.9, 0.3);
          float flick = 0.75 + 0.25 * sin(uTime * 23.0);
          vec3 col = mix(calm, hot * flick, uAlarm) * k + fres * mix(vec3(1.5, 3.5, 4.0), vec3(5.0, 1.5, 0.5), uAlarm);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r.r, r.r, r.h, 32, 1, true), mat);
    core.position.set(r.x, r.y + r.h / 2, r.z);
    this.scene.add(core);
    this.core = core;
  }

  buildProps() {
    const radar = this.markers.props.find((p) => p.kind === 'radar');
    if (radar) {
      const g = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.6, roughness: 0.4 });
      const dish = new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3.2), m);
      dish.rotation.x = -Math.PI / 2.4;
      dish.material.side = THREE.DoubleSide;
      dish.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1.2), m);
      arm.position.z = 0.4;
      g.add(dish, arm);
      g.position.set(radar.x, radar.y, radar.z);
      this.scene.add(g);
      this.radarDish = g;
    }
  }

  wirePlayerSounds() {
    const p = this.player;
    p.footstep = (surface, vol) => {
      const name = surface === 'metal' ? 'step_metal' : surface === 'dirt' || surface === 'ground' ? 'step_dirt' : 'step_concrete';
      this.audio.play(name, { volume: vol * (surface === 'metal' ? 0.6 : 0.75), rateVar: 0.1, reverbSend: 0.6 });
    };
    p.onLand = (v) => {
      this.audio.play('land', { volume: clamp(v / 12, 0.2, 0.9) });
      this.vm.landImpact(v);
    };
    p.onJump = () => this.audio.play('step_dirt', { volume: 0.35, rate: 0.8 });
    p.onSlide = () => this.audio.play('melee_swing', { volume: 0.5, rate: 0.55 });
    this.effects.casings.onTink = (pos, shell) => this.audio.play(shell ? 'impact_dirt' : 'casing', { pos, volume: shell ? 0.35 : 0.18, ref: 1.2, rateVar: 0.15 });
    this.effects.debris.onBounce = (pos, v) => {
      if (Math.random() < 0.35) this.audio.play('impact_metal', { pos, volume: Math.min(0.35, v * 0.05), ref: 2, rate: 0.7 });
    };
  }

  applySettings() {
    const S = this.settings;
    this.audio.volume.master = S.volume;
    this.audio.volume.music = S.music;
    this.audio.applyVolume();
    this.hud && (this.hud.fpsShow = S.showFps);
    this.baseFov = this.hfovToV(S.fov);
  }

  hfovToV(h) {
    const aspect = window.innerWidth / window.innerHeight;
    return (2 * Math.atan(Math.tan((h * DEG) / 2) / aspect)) / DEG;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h);
    this.post.setSize(w, h);
    this.baseFov = this.hfovToV(this.settings.fov);
  }

  // ───────── 流程 ─────────
  start(modeId, difficulty) {
    this.audio.init();
    this.cleanupRun();
    this.modeId = modeId;
    this.difficulty = difficulty;
    this.enemies.setDifficulty(difficulty);
    this.stats = this.freshStats();
    this.player.reset(this.markers.playerSpawn);
    if (modeId === 'survival') this.player.reset({ x: 0, y: 0, z: 14, yaw: 0 });
    this.arsenal.reset({ pistol: true, rifle: true }, difficulty === 'easy' ? 3 : 2);
    this.barrels.reset();
    this.mode = modeId === 'mission' ? new Mission(this) : new Survival(this);
    // 补给箱交互
    for (const c of this.supplies.list) {
      this.interact.add({
        x: c.spec.x, y: 0.8, z: c.spec.z, r: 2.0,
        available: () => c.uses > 0,
        prompt: '按 [E] 补给弹药与手雷',
        onUse: () => {
          if (this.supplies.use(c)) {
            this.arsenal.addAmmo(1, 2);
            this.player.addArmor(20);
            this.audio.play('pickup_ammo', { volume: 0.9 });
            this.audio.play('pickup_armor', { volume: 0.5 });
            this.hud.pickup('弹药已补满 · +2 手雷 · +20 护甲', '#ffd25a');
          }
        },
      });
    }
    this.mode.start();
    this.hud.show(true);
    this.hud.setTimer(null);
    this.menu.show(null);
    document.getElementById('menu').classList.add('hidden');
    this.state = 'playing';
    this.env.coreAlarm = false;
    this.audio.startMusic();
    this.ambient();
    if (!this.bench?.manual) this.input.lock();
  }

  ambient() {
    if (this.ambWind) return;
    this.ambWind = this.audio.play('amb_wind', { loop: true, volume: 0.35, bus: 'amb', rateVar: 0, reverb: false });
    for (const h of this.markers.hum) {
      this.audio.play(h.kind === 'reactor' ? 'amb_hum' : 'amb_generator', { loop: true, pos: h, volume: h.kind === 'reactor' ? 1.2 : 0.8, ref: h.kind === 'reactor' ? 6 : 3, bus: 'amb', rateVar: 0 });
    }
  }

  cleanupRun() {
    if (this.mode && this.mode.dispose) this.mode.dispose();
    this.mode = null;
    this.enemies.clear();
    this.projectiles.clear();
    this.grenades.clear();
    this.pickups.clear();
    this.interact.clear();
    this.effects.clear();
    this.heli.reset();
    this.hud.clearSubs();
    this.hud.setWave('');
    this.hud.setScore('');
    this.hud.setTimer(null);
    this.hud.setWaypoint(null);
    if (this.alarmSnd) {
      this.alarmSnd.stop(0.1);
      this.alarmSnd = null;
    }
    this.alarmT = 0;
    this.endT = 0;
    this.meltdown = 0;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.unlock();
    this.input.releaseAll();
    const s = this.stats;
    document.getElementById('pause-stats').innerHTML = `${this.modeId === 'mission' ? '剧情任务' : '生存模式'} · ${DIFF_LABEL[this.difficulty]}<br>击杀 ${s.kills} · 爆头 ${s.headshots} · 命中率 ${s.shots ? Math.round((s.hits / s.shots) * 100) : 0}%`;
    this.menu.show('pause');
    if (this.audio.ctx) this.audio.ctx.suspend();
  }

  resume() {
    if (this.state !== 'paused') return;
    if (this.audio.ctx) this.audio.ctx.resume();
    this.menu.show(null);
    document.getElementById('clicklock').classList.add('hidden');
    this.state = 'playing';
    this.last = performance.now();
    this.input.lock().then?.(() => {
      if (!this.input.locked && !this.bench?.manual) document.getElementById('clicklock').classList.remove('hidden');
    });
    setTimeout(() => {
      if (this.state === 'playing' && !this.input.locked && !this.bench?.manual) {
        this.state = 'paused';
        document.getElementById('clicklock').classList.remove('hidden');
      }
    }, 400);
  }

  quitToMenu() {
    if (this.mode && this.mode.end) this.mode.end();
    this.cleanupRun();
    this.state = 'menu';
    this.hud.show(false);
    this.menu.show('menu');
    this.input.unlock();
    if (this.audio.ctx) this.audio.ctx.resume();
    this.audio.setMusicIntensity(0);
  }

  finish(win, title, sub) {
    if (this.state === 'ended') return;
    this.state = 'ended';
    this.endT = 2.8;
    this.endInfo = { win, title, sub };
    if (this.mode && this.mode.end) this.mode.end();
    if (win && this.modeId === 'mission') {
      const t = this.stats.time;
      const prev = localStorage.getItem('blackstone.missionBestSec');
      if (!prev || t < Number(prev)) {
        localStorage.setItem('blackstone.missionBestSec', String(t));
        localStorage.setItem('blackstone.missionBest', `${Math.floor(t / 60)}分${Math.floor(t % 60)}秒（${DIFF_LABEL[this.difficulty]}）`);
      }
      this.heli.leave();
    }
    this.hud.banner(title, sub, 3);
    this.audio.play(win ? 'objective' : 'objective_fail', { volume: 0.9, reverb: false });
    this.audio.setMusicIntensity(0);
  }

  showResults() {
    const s = this.stats, { win, title, sub } = this.endInfo;
    this.input.unlock();
    this.hud.show(false);
    const acc = s.shots ? Math.round((s.hits / s.shots) * 100) : 0;
    const rows = [
      ['用时', `${Math.floor(s.time / 60)}:${String(Math.floor(s.time % 60)).padStart(2, '0')}`],
      ['难度', DIFF_LABEL[this.difficulty]],
      ['击杀', s.kills],
      ['爆头', s.headshots],
      ['命中率', `${acc}%`],
      ['造成伤害', Math.round(s.damage)],
      ['承受伤害', Math.round(s.taken)],
      ['手雷/爆炸击杀', s.grenadeKills],
    ];
    if (this.modeId === 'survival') rows.push(['到达波次', this.mode?.wave ?? '-'], ['得分', this.mode?.score ?? 0]);
    this.menu.showResults(win, title, sub, rows);
  }

  // ───────── 事件 ─────────
  onPlayerNoise(radius) {
    this.enemies.noise(this.player.body.pos.x, this.player.body.pos.y, this.player.body.pos.z, radius);
  }

  onEnemyHit(e, res, hit, explosive = false) {
    if (!res || !(res.damage > 0)) return;
    this.stats.damage += res.damage;
    this.hud.hitmarker(res.killed, res.headshot);
    if (!explosive && hit && hit.point) {
      const n = hit.normal || new THREE.Vector3().subVectors(this.camera.position, hit.point).normalize();
      this.effects.robotHit(hit.point.x, hit.point.y, hit.point.z, n.x, n.y, n.z, e.type === 'heavy');
      this.audio.play('hit_robot', { pos: hit.point, volume: 0.45, ref: 3 });
    }
    if (res.killed) this.audio.play('kill', { volume: 0.6, reverb: false });
    else if (res.headshot) this.audio.play('headshot', { volume: 0.45, reverb: false });
    else this.audio.play('hitmarker', { volume: 0.35, reverb: false });
  }

  onEnemyKilled(e, info) {
    const s = this.stats;
    s.kills++;
    const head = info.part === 'head' && e.type !== 'drone';
    if (head) s.headshots++;
    if (info.explosive) s.grenadeKills++;
    if (info.weapon === 'melee') s.meleeKills++;
    const wname = info.weapon === 'melee' ? '近战' : info.explosive ? '爆炸' : WEAPONS[info.weapon]?.name ?? '';
    this.hud.killfeed(`${wname} ▸ <em>${TYPES[e.type].name}</em>${head ? ' <b>爆头</b>' : ''}`, head);
    if (this.mode && this.mode.onEnemyKilled) this.mode.onEnemyKilled(e, { headshot: head, ...info });
    // 掉落
    const p = this.player;
    const R = this.rng;
    const dropMul = this.difficulty === 'easy' ? 1.3 : this.difficulty === 'hard' ? 0.75 : 1;
    const n = e.type === 'heavy' ? 3 : R.next() < TYPES[e.type].drop * dropMul ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const needHp = 1 - p.health / p.maxHealth, needAmmo = this.arsenal.needsAmmo(), needAr = 1 - p.armor / p.maxArmor;
      const w = [['ammo', 0.35 + needAmmo * 1.2], ['health', 0.12 + needHp * 1.1], ['armor', 0.08 + needAr * 0.4], ['grenade', 0.07]];
      let tot = w.reduce((a, b) => a + b[1], 0), r = R.next() * tot, kind = 'ammo';
      for (const [k, v] of w) {
        r -= v;
        if (r <= 0) {
          kind = k;
          break;
        }
      }
      const c = e.center(new THREE.Vector3());
      const gy = this.world.groundAt(c.x, c.z, 0.2, c.y + 0.5);
      this.pickups.spawn(kind, c.x + (R.next() - 0.5) * 0.8, Math.max(gy, 0), c.z + (R.next() - 0.5) * 0.8, { life: 35, toss: true });
    }
  }

  damagePlayer(dmg, fx, fz, kind) {
    if (this.state !== 'playing' || !this.player.alive) return;
    const hadArmor = this.player.armor > 0;
    const d = this.player.takeDamage(dmg, fx, fz);
    this.stats.taken += dmg;
    this.post.pulseDamage(Math.min(0.9, dmg / 25));
    this.hud.flashDamage(Math.min(0.6, dmg / 30));
    this.audio.play(hadArmor ? 'impact_metal' : 'impact_dirt', { volume: 0.55, rate: hadArmor ? 0.8 : 0.6, reverb: false });
    if (this.player.armorBroke) {
      this.audio.play('shield_break', { volume: 0.7, reverb: false });
      this.hud.flashMessage('护甲已击穿', 1.2);
    }
    if (!this.player.alive) this.onPlayerDeath(kind);
    return d;
  }

  onPlayerDeath(kind) {
    this.audio.play('heartbeat', { volume: 0.9, rate: 0.7, reverb: false });
    this.finish(false, '任务失败', kind === 'meltdown' ? '反应堆爆炸吞没了一切' : '幽灵-1 信号丢失');
  }

  explode(x, y, z, radius, damage, source, quiet = false) {
    const power = radius / 6;
    this.effects.explosion(x, y, z, power);
    this.audio.play('explosion', { pos: { x, y, z }, volume: Math.min(1.3, 0.6 + power * 0.5), ref: 9, rolloff: 0.8 });
    this.enemies.explosionDamage(x, y, z, radius, damage, source === 'player' || source === 'barrel-player' ? 'player' : source);
    this.barrels.blast(x, y, z, radius, source);
    const p = this.player;
    const c = p.chestPos(new THREE.Vector3());
    const d = Math.hypot(c.x - x, c.y - y, c.z - z);
    if (d < radius && this.world.segmentClear(x, y + 0.3, z, c.x, c.y, c.z, SIGHT)) {
      const k = 1 - d / radius;
      const selfMul = source === 'player' || source === 'barrel-player' ? 0.55 : 1;
      this.damagePlayer(damage * k * k * selfMul, x, z, 'explosion');
      const dir = new THREE.Vector3(c.x - x, 0, c.z - z).normalize();
      p.body.vel.x += dir.x * 7 * k;
      p.body.vel.z += dir.z * 7 * k;
      p.body.vel.y += 3 * k;
    }
    p.addTrauma(clamp(1.2 - d / 18, 0, 0.9));
    if (d < 8) this.post.pulseFlash(0.25 * (1 - d / 8));
    if (!quiet) this.enemies.noise(x, y, z, 40);
  }

  alarm(sec) {
    this.alarmT = Math.max(this.alarmT, sec);
    if (!this.alarmSnd) this.alarmSnd = this.audio.play('alarm', { loop: true, volume: 0.22, reverb: true, rateVar: 0 });
  }

  reactorMeltdown() {
    this.meltdown = 0.001;
    this.post.pulseFlash(1.4);
    this.audio.play('explosion', { volume: 1.5, rate: 0.6, reverb: false });
    this.player.addTrauma(1);
    this.damagePlayer(9999, 5, -30, 'meltdown');
  }

  // ───────── 主循环 ─────────
  frame(now) {
    this.lastFrameT = now;
    let dt = (now - (this.last ?? now)) / 1000;
    this.last = now;
    if (this.bench?.manual) return; // 手动步进时由 __bench 驱动
    dt = clamp(dt, 0, 0.05);
    this.tick(dt);
    this.render(dt);
  }

  tick(dt) {
    this.time += dt;
    if (this.state === 'playing' || this.state === 'ended') this.updateGame(this.state === 'ended' ? dt * 0.6 : dt);
    else if (this.state === 'menu') this.updateMenuCam(dt);
    this.env.update(dt, this.time);
    this.input.endFrame();
  }

  updateMenuCam(dt) {
    const t = this.time * 0.045;
    const cam = this.camera;
    cam.position.set(Math.sin(t) * 46 + 4, 15 + Math.sin(t * 2.3) * 2, Math.cos(t) * 46 - 6);
    cam.lookAt(2, 3, -8);
    cam.fov = 55;
    cam.updateProjectionMatrix();
    this.effects.beginFrame();
    this.effects.update(dt);
    this.effects.endFrame();
    this.effects.setViewport(this.renderer.domElement.height, cam.fov);
    if (this.radarDish) this.radarDish.rotation.y += dt * 0.6;
    this.core.material.uniforms.uTime.value = this.time;
    this.vm.root.visible = false;
    this.post.update(dt, this.time, 0, false);
    this.audio.updateListener(cam);
  }

  updateGame(dt) {
    const p = this.player, A = this.arsenal, inp = this.input, S = this.settings;
    const playing = this.state === 'playing';
    if (playing) this.stats.time += dt;
    this.effects.beginFrame();
    // 视角
    const m = inp.consumeMouse();
    const zoom = lerp(1, A.def.adsZoom, A.ads);
    const sens = 0.0022 * S.sens * (A.ads > 0.5 ? S.adsSens / Math.pow(zoom, 0.9) : 1);
    if (p.alive && playing) p.look(m.dx, m.dy * (S.invert ? -1 : 1), sens);
    // 移动（子步）
    const mv = {
      fwd: (inp.isDown('forward') ? 1 : 0) - (inp.isDown('back') ? 1 : 0),
      strafe: (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0),
      jump: inp.pressed('jump'),
      sprint: inp.isDown('sprint'),
      crouch: inp.isDown('crouch'),
      crouchPressed: inp.pressed('crouch'),
      firing: inp.isDown('fire') && A.clip.mag > 0,
    };
    if (!playing) mv.fwd = mv.strafe = 0;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < steps; i++) {
      p.update(dt / steps, mv, A.def.recoil.recover);
      mv.jump = false;
      mv.crouchPressed = false;
    }
    p.speedMul = A.def.moveMul;
    A.update(dt, inp, playing);
    if (playing) this.interact.update(dt, inp);
    else this.hud.prompt(null);
    this.enemies.update(dt);
    this.projectiles.update(dt);
    this.grenades.update(dt);
    this.barrels.update(dt);
    this.pickups.update(dt);
    for (const d of Object.values(this.doors)) d.update(dt);
    this.heli.update(dt);
    if (this.mode && playing) this.mode.update(dt);
    if (this.radarDish) this.radarDish.rotation.y += dt * 0.6;

    // 警报
    if (this.alarmT > 0) {
      this.alarmT -= dt;
      if (this.alarmT <= 0 && this.alarmSnd) {
        this.alarmSnd.stop(0.5);
        this.alarmSnd = null;
      }
    }
    // 反应堆芯
    const cu = this.core.material.uniforms;
    cu.uTime.value = this.time;
    cu.uAlarm.value = damp(cu.uAlarm.value, this.env.coreAlarm ? 1 : 0, 1.5, dt);
    if (this.env.coreLight) this.env.coreLight.color.setRGB(lerp(0.44, 1, cu.uAlarm.value), lerp(0.9, 0.35, cu.uAlarm.value), lerp(1, 0.2, cu.uAlarm.value));

    // 镜头
    p.applyCamera(this.camera, this.time);
    const fov = this.baseFov / zoom;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.env.follow(p.body.pos.x, p.body.pos.z);

    // 区域：混响 / 视图模型亮度 / 地点名
    const zn = zoneAt(p.body.pos.x, p.body.pos.z);
    this.zoneName = zn.name;
    this.audio.setReverb(zn.indoor ? 0.42 : 0.16);

    // 视图模型
    const vs = A.viewState();
    const scoped = !!(A.def.scope && A.ads > 0.85);
    this.vm.root.visible = p.alive && !scoped;
    this.vm.update({
      dt,
      mdx: m.dx,
      mdy: m.dy,
      move: clamp(p.moveK, 0, 1.2),
      grounded: p.body.grounded,
      bobPhase: p.bobPhase,
      ads: A.ads,
      sprint: p.sprinting ? 1 : 0,
      crouch: p.crouchK,
      reload: vs.reload,
      switchK: vs.switchK,
      melee: vs.melee,
      throwK: vs.throwK,
      cycle: vs.cycle,
      slideLock: vs.slideLock,
      ambient: zn.indoor ? 0.62 : 1,
    });

    this.effects.update(dt);
    this.projectiles.draw();
    this.effects.endFrame();
    this.effects.setViewport(this.renderer.domElement.height, this.camera.fov);

    this.hud.update(dt, this.camera);
    this.audio.updateListener(this.camera);
    // 音乐强度：近期交火
    let combat = 0;
    for (const e of this.enemies.list) {
      if (!e.alive || !e.alerted) continue;
      const d = e.body.pos.distanceTo(p.body.pos);
      if (d < 45) combat = Math.max(combat, e.seen ? 1 : 0.6);
    }
    this.audio.setMusicIntensity(combat);
    this.audio.update(dt);
    const lowHp = p.alive ? clamp((45 - p.health) / 45, 0, 1) : 0;
    this.post.update(dt, this.time, lowHp, !p.alive);
    if (lowHp > 0.3 && p.alive) {
      this.hbT = (this.hbT ?? 0) - dt;
      if (this.hbT <= 0) {
        this.hbT = 1.1 - lowHp * 0.4;
        this.audio.play('heartbeat', { volume: 0.4 * lowHp, reverb: false, rateVar: 0 });
      }
    }
    if (this.meltdown > 0) {
      this.meltdown += dt;
      this.post.pulseFlash(Math.max(0, 1.2 - this.meltdown * 0.4));
      if (Math.random() < dt * 6) {
        const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 30;
        this.effects.explosion(p.body.pos.x + Math.cos(a) * r, 0.5, p.body.pos.z + Math.sin(a) * r, 2);
      }
    }
    // 结算倒计时
    if (this.state === 'ended') {
      this.endT -= dt / 0.6;
      if (this.endT <= 0) {
        this.state = 'results';
        this.showResults();
      }
    }
  }

  render(dt) {
    this.post.render(dt);
  }

  // ───────── 无头测试接口 ─────────
  installBench() {
    const G = this;
    const keyMap = {};
    this.bench = {
      manual: false,
      ready: true,
      start(mode = 'mission', diff = 'normal') {
        G.bench.manual = true;
        G.start(mode, diff);
        return G.bench.state();
      },
      step(frames = 1, dt = 1 / 60, render = false) {
        for (let i = 0; i < frames; i++) G.tick(dt);
        if (render) G.render(dt);
        return G.bench.state();
      },
      render() {
        G.render(1 / 60);
        return true;
      },
      hold(action, on = true) {
        if (on) G.input.virtualPress(action);
        else G.input.virtualRelease(action);
        keyMap[action] = on;
      },
      tap(action, frames = 2) {
        G.input.virtualPress(action);
        G.bench.step(frames);
        G.input.virtualRelease(action);
        return G.bench.state();
      },
      look(dx, dy) {
        G.input.virtualLook(dx, dy);
      },
      aimAt(x, y, z) {
        const e = G.player.eyePos(new THREE.Vector3());
        G.player.yaw = Math.atan2(-(x - e.x), -(z - e.z));
        G.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z));
      },
      teleport(x, y, z, yaw) {
        G.player.body.pos.set(x, y, z);
        G.player.body.vel.set(0, 0, 0);
        G.player.eyeSmoothY = y;
        if (yaw !== undefined) G.player.yaw = yaw;
      },
      spawn(type, x, y, z, opts = {}) {
        return G.enemies.spawn(type, x, y, z, opts).id;
      },
      god(on = true) {
        G.player.maxHealth = on ? 1e6 : 100;
        G.player.health = G.player.maxHealth;
      },
      phase(name) {
        const m = G.mode;
        if (!m || m.id !== 'mission') return null;
        if (name === 'breach') m.gateHacked();
        if (name === 'download') {
          if (m.phase === 'infiltrate') m.gateHacked();
          m.startDownload();
        }
        if (name === 'reactor') {
          if (m.phase === 'infiltrate') m.gateHacked();
          if (m.phase === 'breach') m.startDownload();
          m.completeDownload();
        }
        if (name === 'extract') {
          G.bench.phase('reactor');
          m.plant(0);
          m.plant(1);
          m.plant(2);
        }
        return m.phase;
      },
      state() {
        const p = G.player;
        return {
          state: G.state,
          mode: G.modeId,
          phase: G.mode?.phase ?? G.mode?.state,
          wave: G.mode?.wave,
          t: +G.time.toFixed(2),
          pos: [+p.body.pos.x.toFixed(2), +p.body.pos.y.toFixed(2), +p.body.pos.z.toFixed(2)],
          yaw: +p.yaw.toFixed(3),
          pitch: +p.pitch.toFixed(3),
          hp: Math.round(p.health),
          armor: Math.round(p.armor),
          weapon: G.arsenal.cur,
          mag: G.arsenal.clip.mag,
          reserve: G.arsenal.clip.reserve,
          grenades: G.arsenal.grenades,
          enemies: G.enemies.alive,
          kills: G.stats.kills,
          shots: G.stats.shots,
          hits: G.stats.hits,
          zone: G.zoneName,
          progress: G.mode?.progress,
          heli: G.heli.state,
          calls: G.renderer.info.render.calls,
          tris: G.renderer.info.render.triangles,
        };
      },
      enemies() {
        return G.enemies.list.filter((e) => e.alive).map((e) => ({ id: e.id, type: e.type, pos: e.body.pos.toArray().map((v) => +v.toFixed(2)), hp: Math.round(e.hp), alerted: e.alerted, seen: e.seen }));
      },
      snapshot(type = 'image/jpeg', q = 0.85) {
        G.render(1 / 60);
        return G.renderer.domElement.toDataURL(type, q);
      },
      perf(frames = 120) {
        const t0 = performance.now();
        for (let i = 0; i < frames; i++) {
          G.tick(1 / 60);
          G.render(1 / 60);
        }
        const gl = G.renderer.getContext();
        const px = new Uint8Array(4);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return { msPerFrame: +((performance.now() - t0) / frames).toFixed(2), calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles };
      },
      quit() {
        G.quitToMenu();
        G.bench.manual = false;
      },
      G,
    };
    window.__bench = this.bench;
  }
}

const game = new Game();
game.init().catch((e) => {
  console.error(e);
  document.getElementById('load-sub').textContent = '载入失败：' + e.message;
});
window.__game = game;
