// 游戏外壳：渲染器、场景、灯光、天空、世界、后期、镜头与比赛表现层。
import * as THREE from 'three';
import { Track } from './track/track.js';
import { World } from './track/world.js';
import { Sky } from './fx/sky.js';
import { Post } from './fx/post.js';
import { ChaseCam } from './fx/camera.js';
import { PALETTES } from './fx/palette.js';
import { CarModel } from './car/model.js';
import { RaceSession } from './race/session.js';
import { Input } from './core/input.js';
import { Hud } from './ui/hud.js';
import { Trails, Smoke, Rain, SpeedLines } from './fx/particles.js';
import { clamp } from './core/math.js';

export class Game {
  constructor() {
    const root = document.getElementById('canvas-root');
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    root.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 9000);
    this.scene.fog = new THREE.FogExp2(0x88aacc, 0.0015);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x334433, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.headlight = new THREE.SpotLight(0xfff2d0, 0, 90, 0.42, 0.55, 1.2);
    this.scene.add(this.headlight, this.headlight.target);

    this.track = new Track();
    this.sky = new Sky(this.scene);
    this.world = new World(this.scene, this.track);
    this.post = new Post(r, this.scene, this.camera);
    this.cam = new ChaseCam(this.camera);
    this.input = new Input();
    this.hud = new Hud();
    this.trails = new Trails(this.scene);
    this.smoke = new Smoke(this.scene);
    this.rain = new Rain(this.scene);
    this.speedLines = new SpeedLines(document.getElementById('speedlines'));

    this.session = null; this.models = []; this.paused = false;
    this.mood = 0; this.emotional = false; this.hudVisible = false;
    this.palette = null;
    this.setPalette('night');
    addEventListener('resize', () => this.resize());
    this.resize();
    this.frameHooks = new Set();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.speedLines.resize(w, h);
  }

  setPalette(p) {
    const pal = typeof p === 'string' ? PALETTES[p] : p;
    this.palette = pal;
    this.sky.apply(pal);
    this.scene.fog.color.set(pal.fog); this.scene.fog.density = pal.fogDensity;
    this.hemi.color.set(pal.hemiSky); this.hemi.groundColor.set(pal.hemiGround); this.hemi.intensity = pal.hemiI;
    this.sun.color.set(pal.sun); this.sun.intensity = pal.sunI;
    const el = pal.sunElev * Math.PI / 180, az = pal.sunAz * Math.PI / 180;
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    this.world.applyPalette(pal);
    this.post.applyPalette(pal);
    this.rain.setActive(!!pal.rain);
    this.night = !!pal.headlights;
    for (const m of this.models) m.model.setNight(this.night);
    this.headlight.intensity = pal.headlights ? (pal.stars > 0.5 || pal.rain ? 60 : 25) : 0;
    this.trails.enabled = !!pal.trails;
  }

  /** 创建比赛并生成车模 */
  startSession(cfg, hooks = {}) {
    this.endSession();
    const sess = new RaceSession(this.track, cfg, hooks);
    this.session = sess;
    for (const r of sess.racers) {
      const model = new CarModel(r.spec, { passengers: r.isPlayer && cfg.player.passengers, sticker: r.isPlayer && cfg.player.sticker });
      model.setNight(this.night);
      this.scene.add(model.group);
      this.models.push({ racer: r, model });
      this.trails.add(r, model);
    }
    const s0 = this.course = sess.course;
    this.world.setLines(s0.s0, s0.s1, s0.dir);
    this.cam.mode = 'chase';
    this.cam.snap(sess.player.sim);
    for (const m of this.models) m.model.update(m.racer.sim, 0.016);
    return sess;
  }

  endSession() {
    for (const m of this.models) this.scene.remove(m.model.group);
    this.models = []; this.trails.clear(); this.smoke.clear();
    this.session = null;
  }

  /** 每帧：推进会话 + 表现层 */
  frame(dt) {
    const sess = this.session;
    if (sess && !this.paused) {
      sess.update(dt, this.input.drive());
      const p = sess.player.sim;
      for (const m of this.models) {
        m.model.update(m.racer.sim, dt, { blown: m.racer.sim.engineBlown });
        const s = m.racer.sim;
        if ((s.drifting && s.speed > 6) || (s.handbrake && s.speed > 5)) this.smoke.emitFrom(m.model, s, dt, m.racer.isPlayer ? 1 : 0.6);
        if (s.engineBlown) this.smoke.engine(m.model, dt);
      }
      this.trails.update(dt);
      this.smoke.update(dt);
      this.cam.update(dt, p);
      // 车头灯：只给玩家车一盏真实聚光
      const fx = Math.cos(p.heading), fz = -Math.sin(p.heading);
      this.headlight.position.set(p.x + fx * 1.8, p.y + 0.9, p.z + fz * 1.8);
      this.headlight.target.position.set(p.x + fx * 30, p.y - 1.5, p.z + fz * 30);
      // 阴影跟随
      this.sun.position.set(p.x + this.sunDir.x * 150, p.y + this.sunDir.y * 150, p.z + this.sunDir.z * 150);
      this.sun.target.position.set(p.x, p.y, p.z);
      const speedBlur = this.emotional ? 0 : clamp((p.speed - 26) / 30, 0, 1) * 0.06;
      this.post.update(dt, speedBlur, this.mood);
      this.speedLines.update(dt, this.emotional ? 0 : clamp((p.speed - 30) / 25, 0, 1));
      if (this.hudVisible && !this.emotional) this.hud.update(dt, sess, this.hudExtra || {});
    } else if (sess) {
      this.post.update(dt, 0, this.mood);
    } else {
      this.post.update(dt, 0, this.mood);
    }
    this.rain.update(dt, this.camera.position);
    this.sky.update(dt, this.camera.position);
    for (const h of this.frameHooks) h(dt);
    this.post.render(dt);
    if (this._cap) { const f = this._cap; this._cap = null; f(this.renderer.domElement.toDataURL('image/jpeg', 0.7)); }
  }

  /** 渲染后立即截取画面（不需要 preserveDrawingBuffer） */
  capture() { return new Promise((r) => { this._cap = r; }); }

  showHud(on) {
    this.hudVisible = on;
    this.hud.show(on && !this.emotional);
  }

  /** 情感时刻：隐藏 HUD、去饱和、颗粒、黑边（弹幕由弹幕层单独静默） */
  setEmotional(on) {
    this.emotional = on;
    this.mood = on ? 1 : 0;
    document.getElementById('letterbox').classList.toggle('on', on);
    this.hud.show(this.hudVisible && !on);
  }
}
