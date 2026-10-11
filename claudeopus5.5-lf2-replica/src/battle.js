// 战斗场景 + 五种模式控制器:VS 对战、闯关(5 关 × 5 幕,段间锁镜头 / 首领 / 生存关)、锦标赛(淘汰赛对阵图)、军团战(双方兵团)、演示。
// 功能键(同原版):F1 暂停、F2 暂停时单步、F4 回选人、F5 加速;VS 模式另有 F6 无限 MP、F7 全员回复、F8 空投武器、F9 销毁武器。Esc 打开暂停菜单。
import { W, H, HUD_H, TEAM_COLORS, DIFFICULTIES } from './config.js';
import { Controller, playerState } from './input.js';
import { World } from './world.js';
import { AI } from './ai.js';
import { CHARS, ROSTER } from './roster.js';
import { createBackground, BG_LIST } from './bg.js';
import { renderWorld, warmSprites } from './render.js';
import { drawHud, portrait } from './hud.js';
import { text, panel, menuItem, dimScreen } from './ui.js';
import { STAGES, survivalWave } from './stages.js';
import { session } from './session.js';
import { ST } from './frames.js';
import audio from './audio.js';
import { rnd, rndInt, pick, clamp } from './util.js';
import { scenes, setScene } from './scenes.js';

const randomBg = () => pick(BG_LIST).id;
const HEAL_BONUS = [200, 150, 100, 50];   // 闯关每幕结束:暗红上限回复量(Easy/Normal/Difficult/CRAZY)

export const battleScene = {
  name: 'battle',
  enter(cfg) {
    this.cfg = cfg;
    this.t = 0;
    this.paused = false; this.hardPause = false;
    this.pauseSel = 0;
    this.banner = null;
    this.world = null;
    this.slots = [];
    const M = { vs: VsMode, demo: VsMode, stage: StageMode, champ: ChampMode, battle: BattleMode }[cfg.mode] || VsMode;
    this.mode = new M(this, cfg);
    this.mode.start();
  },
  exit() { this.world = null; },

  newWorld(bgId, o = {}) {
    const id = !bgId || bgId === 'random' ? randomBg() : bgId;
    const bg = createBackground(id);
    this.world = new World(bg, { difficulty: this.cfg.difficulty, dropItems: o.dropItems ?? true });
    this.slots = [];
    this.fightT = 0;
    // 分身术:生成同队的电脑分身(MP 上限 150)
    this.world.spawnClone = (owner) => {
      const c = this.spawn({ charId: owner.def.id, team: owner.team, teamShown: owner.teamShown, x: owner.x - owner.facing * 30, z: owner.z, facing: owner.facing, lvl: Math.min(3, (owner.ai ? owner.ai.level : this.cfg.difficulty) + 1), slot: false, tag: owner.tag || owner.name, mp: 150 });
      c.def = owner.def; c.clone = true; c.cloneOf = owner; c.mpCap = 150; c.invuln = 10;
      c.hp = c.darkHp = Math.min(owner.hp, c.maxHp);
      this.world.fx.smoke(c.x, c.y - 40, c.z);
    };
    if (o.music !== null) audio.music(o.music || bg.music || pick(['battle1', 'battle2', 'battle3']));
    return this.world;
  },

  // 生成角色并接好控制器
  spawn(o) {
    const w = this.world;
    const def = CHARS[o.charId] || CHARS[ROSTER[0]];
    warmSprites(def);
    const ctrl = new Controller();
    const f = w.addFighter(def, {
      x: o.x, z: o.z, facing: o.facing ?? 1, team: o.team, teamShown: o.teamShown ?? 0, ctrl,
      human: !!o.human, playerIdx: o.playerIdx ?? -1, name: o.name || def.name, maxHp: o.hp, mp: o.mp ?? 200,
    });
    f.tag = o.tag;
    if (o.human) {
      const idx = o.playerIdx;
      f.ctrlFeed = () => ctrl.update(playerState(idx));
    } else {
      f.ai = new AI(f, clamp(o.lvl ?? this.cfg.difficulty, 0, 3));
      f.ctrlFeed = () => f.ai.feed();
    }
    if (o.slot !== false && this.slots.length < 8) this.slots.push(f);
    if (o.fromSky) { f.y = -300; f.setFrame(212, { silent: true }); }
    return f;
  },

  showBanner(str, t = 60, col = '#ffe060', sub = '') { this.banner = { str, t, max: t, col, sub }; },

  onUi(e) {
    if (this.mode.onUi && this.mode.onUi(e)) return;
    if (this.cfg.mode === 'demo' && !this.paused) { if (e.ev === 'ok' || e.ev === 'back' || e.ev === 'attack' || e.ev === 'jump') setScene(scenes.title); return; }
    const vs = this.cfg.mode === 'vs' && this.world;
    // 原版功能键
    if (e.code === 'F1') { if (this.paused && !this.hardPause) return; this.hardPause = !this.hardPause; this.paused = this.hardPause; return; }
    if (e.code === 'F2') { if (this.world) { this.hardPause = this.paused = true; this.world.step(); this.mode.update(); } return; }
    if (e.code === 'F4') { setScene(scenes.select); return; }
    if (vs && e.code === 'F6') { this.world.unlimitedMp = !this.world.unlimitedMp; this.showBanner(this.world.unlimitedMp ? 'UNLIMITED MP' : 'MP NORMAL', 30, '#80b0ff'); return; }
    if (vs && e.code === 'F7') { for (const f of this.world.fighters) if (!f.dead) { f.hp = f.darkHp = f.maxHp; f.mp = f.maxMp; } this.showBanner('RECOVER', 30, '#ff8080'); return; }
    if (vs && e.code === 'F8') { for (let i = 0; i < 3; i++) this.world.dropRandom(); return; }
    if (vs && e.code === 'F9') { for (const it of this.world.entities) if (it.kind === 'item') it.breakApart(); return; }
    if (!this.paused || this.hardPause) {
      if (e.ev === 'back' || e.ev === 'pause') { this.paused = true; this.hardPause = false; this.pauseSel = 0; audio.sfx('menu_ok'); }
      return;
    }
    const items = this.pauseItems();
    if (e.ev === 'up') { this.pauseSel = (this.pauseSel + items.length - 1) % items.length; audio.sfx('menu_move'); }
    else if (e.ev === 'down') { this.pauseSel = (this.pauseSel + 1) % items.length; audio.sfx('menu_move'); }
    else if (e.ev === 'back') { this.paused = false; }
    else if (e.ev === 'ok' || e.ev === 'attack') {
      const it = items[this.pauseSel];
      audio.sfx('menu_ok');
      if (it === 'Resume') this.paused = false;
      else if (it === 'Restart') setScene(battleScene, this.cfg);
      else if (it === 'Skip Match') { this.paused = false; this.mode.skip?.(); }
      else if (it === 'Character Select') setScene(scenes.select);
      else if (it === 'Title') setScene(scenes.title);
    }
  },
  pauseItems() { const L = ['Resume', 'Restart']; if (this.mode.skip) L.push('Skip Match'); L.push('Character Select', 'Title'); return L; },

  update() {
    this.t++;
    if (this.paused) return;
    if (this.mode.frozen) { this.mode.update(); return; }
    if (!this.world) return;
    this.world.step();
    this.fightT++;
    this.mode.update();
    if (this.banner && --this.banner.t <= 0) this.banner = null;
  },

  render(ctx) {
    if (this.mode.frozen && this.mode.renderFull) { this.mode.renderFull(ctx); return; }
    const w = this.world;
    if (!w) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
    renderWorld(ctx, w);
    drawHud(ctx, this.slots, this.t);
    if (this.mode.renderOverlay) this.mode.renderOverlay(ctx);
    if (this.banner) {
      const b = this.banner, k = b.t / b.max;
      const s = 1 + Math.max(0, (k - 0.85) * 3);
      ctx.save(); ctx.translate(W / 2, 310); ctx.scale(s, s);
      ctx.globalAlpha = Math.min(1, b.t / 10);
      text(ctx, b.str, 0, 0, { align: 'center', size: 46, color: b.col, stroke: '#000', strokeW: 6, sh: 3 });
      if (b.sub) text(ctx, b.sub, 0, 34, { align: 'center', size: 18, color: '#fff', stroke: '#000', strokeW: 4 });
      ctx.restore(); ctx.globalAlpha = 1;
    }
    if (this.cfg.mode === 'demo') text(ctx, 'DEMO  —  按任意键返回', W / 2, H - 10, { align: 'center', size: 13, color: '#ffe060' });
    if (this.world.unlimitedMp) text(ctx, 'F6 无限 MP', 8, H - 8, { size: 11, color: '#80b0ff' });
    if (this.hardPause) text(ctx, 'PAUSE (F1 继续 / F2 单步)', W / 2, HUD_H + 40, { align: 'center', size: 18, color: '#ffe060', stroke: '#000', strokeW: 4 });
    else if (this.paused) {
      dimScreen(ctx, 0.55);
      panel(ctx, W / 2 - 150, 190, 300, 60 + this.pauseItems().length * 38);
      text(ctx, 'PAUSE', W / 2, 228, { align: 'center', size: 24, color: '#ffd040' });
      this.pauseItems().forEach((s, i) => menuItem(ctx, s, W / 2, 268 + i * 38, i === this.pauseSel, { size: 18, w: 260 }));
    }
  },
};

// ---------------------------------------------------------------- 工具
function teamOf(team, idx, prefix) { return team === 0 ? 100 + prefix * 10 + idx : team; }
function aliveTeams(w) {
  const s = new Set();
  for (const f of w.fighters) if (!f.dead && !f.soldier) s.add(f.team);
  return s;
}
const fmtTime = (tu) => { const s = Math.floor(tu / 30); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function resultRows(fighters, winTeam) {
  return fighters.map((f) => ({
    id: f.baseDef.id, name: f.tag || f.name, charName: f.baseDef.name, teamShown: f.teamShown, stats: f.stats,
    status: winTeam === undefined ? '-' : f.team === winTeam ? 'Win' : 'Lose', alive: !f.dead,
  }));
}
function spreadPositions(w, n) {
  const b = w.bounds();
  const left = Math.max(b.xMin + 60, w.camX + 80), right = Math.min(b.xMax - 60, w.camX + W - 80);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push({ x: left + (right - left) * t + rndInt(-20, 20), z: rndInt(b.zMin + 10, b.zMax - 10), facing: t < 0.5 ? 1 : -1 });
  }
  return out;
}
function entrantsFromSession(demo) {
  const list = [];
  if (!demo) session.humans.forEach((h, i) => { if (h.active) list.push({ charId: h.charId, human: true, playerIdx: i, teamShown: h.team, team: teamOf(h.team, i, 0), tag: `Player${i + 1}` }); });
  session.coms.forEach((c, i) => list.push({ charId: c.charId, human: false, teamShown: c.team, team: teamOf(c.team, i, 1), tag: 'Com' }));
  return list;
}

// ---------------------------------------------------------------- VS / 演示
class VsMode {
  constructor(sc, cfg) { this.sc = sc; this.cfg = cfg; this.endT = -1; }
  start() {
    const sc = this.sc;
    const w = sc.newWorld(this.cfg.bg);
    let ents = entrantsFromSession(this.cfg.mode === 'demo');
    if (this.cfg.mode === 'demo') { // 演示:随机分组(混战 / 2v2v2v2 / 4v4 / 3v3v2)
      const n = ents.length, g = pick(['ffa', 'pairs', 'halves', 'trios']);
      ents.forEach((e, i) => { const t = g === 'ffa' ? 0 : g === 'pairs' ? (i % 4) + 1 : g === 'halves' ? (i % 2) + 1 : (i % 3) + 1; e.teamShown = t; e.team = teamOf(t, i, 1); });
      void n;
    }
    w.camX = Math.max(0, (w.bg.width - W) / 2);
    const pos = spreadPositions(w, ents.length);
    pos.sort(() => rnd() - 0.5);
    ents.forEach((e, i) => sc.spawn({ ...e, ...pos[i], lvl: this.cfg.mode === 'demo' ? 2 : this.cfg.difficulty }));
    for (const f of w.fighters) { f.setFrame(219); }
    sc.showBanner('FIGHT!', 45, '#ff6040');
    audio.sfx('go');
  }
  update() {
    const sc = this.sc, w = sc.world;
    const teams = aliveTeams(w);
    if (this.endT < 0 && teams.size <= 1) {
      this.endT = sc.t + 110;
      this.winTeam = teams.size ? [...teams][0] : undefined;
      const winners = w.fighters.filter((f) => f.team === this.winTeam && !f.clone);
      const any = winners[0];
      if (this.cfg.mode !== 'demo') sc.showBanner(any ? (winners.length > 1 ? 'TEAM WIN!' : `${any.tag === 'Com' ? any.name : any.tag} WIN!`) : 'DRAW', 100, '#ffe060');
      audio.music('victory');
    }
    if (this.endT >= 0) {
      for (const f of w.fighters) if (f.team === this.winTeam && !f.dead && f.state === ST.STAND && f.frameId !== 240) f.setFrame(240);
      if (sc.t >= this.endT) {
        if (this.cfg.mode === 'demo') { setScene(battleScene, this.cfg); return; }
        setScene(scenes.results, { title: 'RESULTS', subtitle: `VS Mode · ${w.bg.name} · ${DIFFICULTIES[this.cfg.difficulty]}`, time: fmtTime(sc.fightT), rows: resultRows(w.fighters.filter((f) => !f.soldier && !f.clone), this.winTeam), next: scenes.select });
      }
    }
  }
}

// ---------------------------------------------------------------- 闯关
class StageMode {
  constructor(sc, cfg) { this.sc = sc; this.cfg = cfg; this.stageIdx = (cfg.stage || 1) - 1; this.actIdx = 0; this.carry = null; this.wave = 0; }
  start() { this.startAct(); }
  stageDef() { return STAGES[this.stageIdx]; }
  // 每一幕重新开始于场景左端;我方状态承接上一幕(阵亡者复活,并获得暗红上限回复奖励)
  startAct() {
    const sc = this.sc;
    const S = this.stageDef();
    const actDef = S.survival ? null : S.acts[this.actIdx];
    const w = sc.newWorld(S.bg, { music: actDef && actDef.phases.some((p) => p.some((e) => e[2]?.boss)) && this.actIdx === 4 ? 'boss' : S.music, dropItems: true });
    w.dropTimer = 300;
    this.state = 'fight'; this.endT = -1; this.queue = []; this.endless = actDef?.endless || null;
    const ents = entrantsFromSession(false);
    if (!ents.some((e) => e.human)) ents.unshift({ charId: ROSTER[0], human: true, playerIdx: 0, teamShown: 1, tag: 'Player1' });
    const zc = (w.bg.zMin + w.bg.zMax) / 2;
    ents.forEach((e, i) => {
      const prev = this.carry && this.carry[i];
      const f = sc.spawn({ ...e, team: 1, teamShown: e.teamShown || 1, x: 70 + i * 36, z: zc + (i - ents.length / 2) * 14, facing: 1, lvl: Math.min(3, this.cfg.difficulty + 1), mp: 500 });
      if (prev) {
        const bonus = HEAL_BONUS[this.cfg.difficulty];
        f.darkHp = Math.min(f.maxHp, Math.max(prev.darkHp, 1) + bonus);
        f.hp = f.darkHp; f.mp = Math.max(prev.mp, 200); f.stats = prev.stats;
      }
      f.setFrame(219);
    });
    this.players = w.fighters.slice();
    this.nEff = this.players.length * (this.cfg.difficulty === 3 ? 2 : 1);
    const phases = S.survival ? [null] : actDef.phases;
    const n = phases.length;
    const span = Math.max(0, w.bg.width - 1000);
    this.regions = [];
    for (let i = 0; i < n; i++) { const x0 = n === 1 ? 0 : Math.round((span * i) / (n - 1)); this.regions.push({ xMin: x0, xMax: Math.min(w.bg.width, x0 + 1000) }); }
    if (S.survival) this.regions = [{ xMin: Math.max(0, w.bg.width / 2 - 500), xMax: Math.min(w.bg.width, w.bg.width / 2 + 500) }];
    w.lock = { ...this.regions[0] };
    w.camX = w.lock.xMin;
    for (const f of this.players) f.x += w.lock.xMin;
    if (S.survival) { this.wave++; sc.showBanner(`STAGE ${this.wave}`, 70, '#ffe060', 'Survival'); }
    else sc.showBanner(`STAGE ${this.stageIdx + 1}-${this.actIdx + 1}`, 70, '#ffe060', this.actIdx === 0 ? S.name : '');
    this.beginPhase(0);
  }
  beginPhase(i) {
    const S = this.stageDef(), w = this.sc.world;
    this.phase = i;
    const list = S.survival ? survivalWave(this.wave, rnd, ROSTER).enemies : S.acts[this.actIdx].phases[i];
    this.queue = [];
    const hpK = this.cfg.difficulty === 0 ? 0.75 : this.cfg.difficulty === 3 ? 1.5 : 1;
    for (const [id, n, o = {}] of list) {
      const count = o.boss || S.survival ? n : Math.max(1, Math.round(n * this.nEff));
      for (let k = 0; k < count; k++) this.queue.push({ id: id === 'hero' ? pick(ROSTER) : id, hp: Math.round((o.hp || 500) * hpK), boss: !!o.boss });
    }
    this.state = 'fight';
    this.spawnT = 0;
    w.lock = { ...this.regions[S.survival ? 0 : i] };
  }
  enemies() { return this.sc.world.fighters.filter((f) => f.team === 9 && !f.dead); }
  spawnEnemy(e) {
    const sc = this.sc, w = sc.world;
    const side = rnd() < 0.7 ? 1 : -1;
    const x = side > 0 ? w.lock.xMax - 20 : w.lock.xMin + 20;
    const lvl = clamp(this.cfg.difficulty + (e.boss ? 1 : 0) - (CHARS[e.id]?.soldierTier ? 1 : 0), 0, 3);
    const f = sc.spawn({ charId: e.id, team: 9, teamShown: 3, x: x + side * 30, z: rndInt(w.bg.zMin + 8, w.bg.zMax - 8), facing: -side, lvl, hp: e.hp, tag: CHARS[e.id]?.name, mp: 500, slot: e.boss && sc.slots.length < 8 });
    f.vx = -side * 4;
    f.stageEnemy = true;
    return f;
  }
  update() {
    const sc = this.sc, w = sc.world;
    // 敌人尸体闪烁后消失
    for (const f of w.fighters) if (f.team === 9 && f.dead) { f.deadBlink = true; if (++f.deadTimer > 50) f.removed = true; }
    sc.slots = sc.slots.filter((f) => !f.removed);
    const humans = this.players.filter((f) => f.human);
    if (this.state !== 'over' && !humans.some((f) => !f.dead)) {
      this.state = 'over'; this.endT = sc.t + 150;
      sc.showBanner('GAME OVER', 150, '#ff4040');
      audio.music(null); audio.sfx('game_over');
    }
    if (this.state === 'over') { if (sc.t >= this.endT) this.finish(false); return; }
    if (this.state === 'fight') {
      const alive = this.enemies().length;
      const maxAlive = 3 + Math.min(5, this.players.filter((f) => !f.dead).length * 2);
      if (this.queue.length && alive < maxAlive && sc.t >= this.spawnT) { this.spawnEnemy(this.queue.shift()); this.spawnT = sc.t + rndInt(8, 30); }
      // 首领幕:杂兵源源不断
      if (this.endless && !this.queue.length && alive < 4 && sc.t >= this.spawnT && this.enemies().some((f) => f.stageEnemy && CHARS[f.baseDef.id] && f.maxHp >= 1000)) {
        this.spawnEnemy({ id: pick(this.endless), hp: 50 }); this.spawnT = sc.t + 40;
      }
      if (!this.queue.length && alive === 0) {
        const S = this.stageDef();
        if (S.survival) { this.state = 'clear'; this.endT = sc.t + 70; sc.showBanner('CLEAR', 60, '#60ff80'); audio.sfx('stage_clear'); return; }
        if (this.phase >= S.acts[this.actIdx].phases.length - 1) {
          this.state = 'clear'; this.endT = sc.t + 120;
          sc.showBanner(this.actIdx === 4 ? 'STAGE CLEAR!' : 'CLEAR', 110, '#60ff80');
          audio.sfx('stage_clear');
        } else {
          this.state = 'go';
          const next = this.regions[this.phase + 1];
          w.lock = { xMin: w.lock.xMin, xMax: next.xMax };
        }
      }
    }
    if (this.state === 'go') {
      const next = this.regions[this.phase + 1];
      const hs = humans.filter((f) => !f.dead);
      const ax = hs.reduce((s, f) => s + f.x, 0) / Math.max(1, hs.length);
      if (ax > next.xMin + 300) this.beginPhase(this.phase + 1);
    }
    if (this.state === 'clear' && sc.t >= this.endT) {
      this.carry = this.players.map((f) => ({ darkHp: f.dead ? 0 : f.darkHp, mp: f.mp, stats: f.stats }));
      const S = this.stageDef();
      if (S.survival) { this.startAct(); return; }
      if (this.actIdx < 4) { this.actIdx++; this.startAct(); return; }
      if (this.stageIdx < 4) { this.stageIdx++; this.actIdx = 0; this.startAct(); return; }
      this.finish(true);
    }
  }
  finish(win) {
    const S = this.stageDef();
    const sub = S.survival ? `Survival · 到达第 ${this.wave} 关` : `${S.name} · ${this.stageIdx + 1}-${this.actIdx + 1} · ${DIFFICULTIES[this.cfg.difficulty]}`;
    setScene(scenes.results, { title: win ? 'ALL STAGES CLEAR!' : 'GAME OVER', subtitle: sub, time: fmtTime(this.sc.fightT), rows: resultRows(this.players, win ? 1 : 9), next: scenes.setup });
  }
  renderOverlay(ctx) {
    const sc = this.sc;
    if (this.state === 'go' && sc.t % 30 < 20) {
      text(ctx, 'GO', W - 90, 310, { size: 34, color: '#ffe060', stroke: '#000', strokeW: 5 });
      ctx.fillStyle = '#ffe060'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(W - 40, 298); ctx.lineTo(W - 62, 280); ctx.lineTo(W - 62, 316); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // 原版式信息行:我方人数/总 HP、关卡号、敌方人数/总 HP
    const S = this.stageDef();
    const mine = this.players.filter((f) => !f.dead), foes = this.enemies();
    const sum = (L) => Math.round(L.reduce((s, f) => s + f.hp, 0));
    const y = HUD_H + 16;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, HUD_H, W, 22);
    text(ctx, `Man: ${mine.length}  HP: ${sum(mine)}`, 10, y, { size: 13, color: TEAM_COLORS[1] });
    text(ctx, S.survival ? `STAGE ${this.wave}` : `STAGE ${this.stageIdx + 1}-${this.actIdx + 1}`, W / 2, y, { size: 14, color: '#fff', align: 'center' });
    text(ctx, `Man: ${foes.length + this.queue.length}  HP: ${sum(foes)}`, W - 10, y, { size: 13, color: TEAM_COLORS[3], align: 'right' });
  }
}

// ---------------------------------------------------------------- 锦标赛(1 对 1 淘汰)
class ChampMode {
  constructor(sc, cfg) { this.sc = sc; this.cfg = cfg; }
  start() {
    const ents = entrantsFromSession(false).map((e, i) => ({ ...e, team: 200 + i, seed: i }));
    ents.sort(() => rnd() - 0.5);
    this.round = ents;
    this.next = [];
    this.mi = 0;
    this.roundNo = 1;
    this.allStats = new Map();
    this.state = 'bracket';
    this.frozen = true;
    this.bt = 0;
    audio.music('select');
  }
  matchPair() { return [this.round[this.mi * 2], this.round[this.mi * 2 + 1]]; }
  onUi(e) {
    if (this.state === 'bracket' && (e.ev === 'ok' || e.ev === 'attack') && this.bt > 10) { this.beginMatch(); return true; }
    if (this.state === 'bracket' && e.ev === 'back') { setScene(scenes.select); return true; }
    return false;
  }
  beginMatch() {
    const [a, b] = this.matchPair();
    if (!b) { this.next.push(a); this.advance(); return; } // 轮空
    const sc = this.sc;
    this.state = 'fight'; this.frozen = false; this.endT = -1;
    const w = sc.newWorld(this.cfg.bg);
    w.camX = Math.max(0, (w.bg.width - W) / 2);
    const z = (w.bg.zMin + w.bg.zMax) / 2;
    this.fa = sc.spawn({ ...a, x: w.camX + 200, z, facing: 1 });
    this.fb = sc.spawn({ ...b, x: w.camX + W - 200, z, facing: -1 });
    sc.showBanner(`ROUND ${this.roundNo}`, 50, '#ffe060', `${this.fa.tag === 'Com' ? this.fa.name : this.fa.tag} VS ${this.fb.tag === 'Com' ? this.fb.name : this.fb.tag}`);
  }
  skip() { // 跳过(多用于电脑对电脑)
    if (this.state !== 'fight') return;
    const loser = rnd() < 0.5 ? this.fa : this.fb;
    loser.hp = 0; loser.die();
  }
  update() {
    if (this.state === 'bracket') { this.bt++; const [a, b] = this.matchPair(); if (this.bt > 40 && !b) { this.beginMatch(); return; } if (this.bt > 80 && a && b && !a.human && !b.human) this.beginMatch(); return; }
    if (this.state === 'fight') {
      const sc = this.sc;
      const aDead = this.fa.dead, bDead = this.fb.dead;
      if (this.endT < 0 && (aDead || bDead)) { this.endT = sc.t + 80; const win = aDead ? this.fb : this.fa; sc.showBanner(`${win.tag === 'Com' ? win.name : win.tag} WIN!`, 80); audio.sfx('win'); }
      if (this.endT >= 0 && sc.t >= this.endT) {
        const [a, b] = this.matchPair();
        const win = this.fa.dead ? b : a;
        for (const [ent, f] of [[a, this.fa], [b, this.fb]]) {
          const s = this.allStats.get(ent) || { kills: 0, attack: 0, hpLost: 0, mpUsage: 0, picking: 0 };
          for (const k in s) s[k] += f.stats[k];
          this.allStats.set(ent, s);
        }
        this.next.push(win);
        this.advance();
      }
    }
  }
  advance() {
    this.mi++;
    if (this.mi * 2 >= this.round.length) {
      if (this.next.length === 1) { this.finish(this.next[0]); return; }
      this.round = this.next; this.next = []; this.mi = 0; this.roundNo++;
    }
    this.state = 'bracket'; this.frozen = true; this.bt = 0;
    this.sc.world = null;
    audio.music('select');
  }
  finish(champ) {
    const rows = [...this.allStats.keys()].map((ent) => {
      const def = CHARS[ent.charId];
      return { id: ent.charId, name: ent.tag === 'Com' ? def.name : ent.tag, charName: def.name, teamShown: ent.teamShown, stats: this.allStats.get(ent), status: ent === champ ? 'Win' : 'Lose', alive: ent === champ };
    });
    const def = CHARS[champ.charId];
    setScene(scenes.results, { title: 'CHAMPION!', subtitle: `${champ.tag === 'Com' ? def.name : champ.tag} (${def.name}) 夺得锦标赛冠军`, rows, next: scenes.setup });
  }
  renderFull(ctx) {
    ctx.fillStyle = '#060a26'; ctx.fillRect(0, 0, W, H);
    text(ctx, `CHAMPIONSHIP · ROUND ${this.roundNo}`, W / 2, 50, { align: 'center', size: 26, color: '#ffd040' });
    const R = this.round;
    for (let i = 0; i < R.length; i += 2) {
      const y = 90 + (i / 2) * 100;
      const cur = i / 2 === this.mi;
      panel(ctx, 120, y, W - 240, 80, { border: cur ? '#ffd040' : '#34449a' });
      const side = (e, x, al) => {
        if (!e) { text(ctx, '(轮空 BYE)', x, y + 46, { align: al, size: 15, color: '#667' }); return; }
        const def = CHARS[e.charId];
        ctx.globalAlpha = i / 2 < this.mi && !this.next.includes(e) ? 0.35 : 1;
        if (al === 'left') ctx.drawImage(portrait(def), x, y + 16);
        else { ctx.save(); ctx.translate(x, y + 16); ctx.scale(-1, 1); ctx.drawImage(portrait(def), 0, 0); ctx.restore(); }
        text(ctx, e.tag === 'Com' ? def.name : `${e.tag} (${def.name})`, al === 'left' ? x + 54 : x - 54, y + 46, { align: al, size: 15, color: '#fff' });
        ctx.globalAlpha = 1;
      };
      side(R[i], 140, 'left');
      side(R[i + 1], W - 140, 'right');
      text(ctx, 'VS', W / 2, y + 48, { align: 'center', size: 22, color: '#ff6040' });
    }
    const [a, b] = this.matchPair();
    const auto = a && b && !a.human && !b.human;
    if (this.bt % 40 < 28) text(ctx, auto ? '电脑对战即将开始…(攻击键立即开始,暂停菜单可跳过)' : '按攻击键 / Enter 开始比赛', W / 2, H - 24, { align: 'center', size: 15, color: '#ffe060' });
  }
}

// ---------------------------------------------------------------- 军团战:两大阵营,各有英雄领队与兵团增援(原版兵种血量)
const UNITS = [['thug', 50], ['poacher', 50], ['hexer', 100], ['viper', 150], ['warden', 150], ['brute', 200], ['monk', 200], ['sentinel', 200], ['mira', 250]];
class BattleMode {
  constructor(sc, cfg) { this.sc = sc; this.cfg = cfg; this.endT = -1; }
  start() {
    const sc = this.sc;
    const w = sc.newWorld(this.cfg.bg);
    const ents = entrantsFromSession(false);
    const p1 = ents.find((e) => e.human) || ents[0];
    const sideTeam = p1.team;
    const army = (n) => { const L = []; for (let i = 0; i < n; i++) L.push(i < n * 0.55 ? UNITS[i % 2] : UNITS[2 + Math.floor(rnd() * (UNITS.length - 2))]); return L; };
    this.sides = [{ team: 1, pool: army(30), spawnX: 40, dir: 1, shown: 1 }, { team: 2, pool: army(30 + (this.cfg.difficulty) * 5), spawnX: w.bg.width - 40, dir: -1, shown: 3 }];
    let a = 0, b = 0;
    ents.forEach((e) => {
      const mine = e.team === sideTeam;
      const sd = mine ? this.sides[0] : this.sides[1];
      const k = mine ? a++ : b++;
      const f = sc.spawn({ ...e, team: sd.team, teamShown: e.teamShown || sd.shown, x: mine ? 120 + k * 30 : w.bg.width - 120 - k * 30, z: rndInt(w.bg.zMin + 10, w.bg.zMax - 10), facing: sd.dir, mp: 500 });
      f.setFrame(219);
    });
    if (!b) sc.spawn({ charId: pick(ROSTER), team: 2, teamShown: 3, tag: 'Com', x: w.bg.width - 140, z: (w.bg.zMin + w.bg.zMax) / 2, facing: -1, mp: 500 });
    w.camX = 0;
    this.spawnT = 0;
    sc.showBanner('BATTLE!', 50, '#ff6040');
  }
  update() {
    const sc = this.sc, w = sc.world;
    for (const f of w.fighters) if (f.soldier && f.dead) { f.deadBlink = true; if (++f.deadTimer > 50) f.removed = true; }
    if (this.endT < 0 && sc.t >= this.spawnT) {
      this.spawnT = sc.t + 20;
      for (const sd of this.sides) {
        const alive = w.fighters.filter((f) => f.soldier && f.team === sd.team && !f.dead).length;
        if (sd.pool.length && alive < 10) {
          const [id, hp] = sd.pool.shift();
          const f = sc.spawn({ charId: id, team: sd.team, teamShown: sd.shown, x: sd.spawnX, z: rndInt(w.bg.zMin + 6, w.bg.zMax - 6), facing: sd.dir, lvl: Math.max(0, this.cfg.difficulty - 1), slot: false, mp: 300, hp });
          f.soldier = true; f.tag = ''; f.hideName = true;
        }
      }
    }
    if (this.endT < 0) {
      for (const sd of this.sides) {
        const heroes = w.fighters.filter((f) => !f.soldier && f.team === sd.team && !f.dead).length;
        const soldiers = w.fighters.filter((f) => f.soldier && f.team === sd.team && !f.dead).length;
        if (heroes === 0 && soldiers === 0 && sd.pool.length === 0) {
          this.endT = sc.t + 110;
          this.winTeam = sd === this.sides[0] ? 2 : 1;
          sc.showBanner(this.winTeam === 1 ? 'VICTORY!' : 'DEFEAT', 100, this.winTeam === 1 ? '#60ff80' : '#ff4040');
          audio.music('victory');
        }
      }
    }
    if (this.endT >= 0 && sc.t >= this.endT) setScene(scenes.results, { title: 'BATTLE RESULTS', subtitle: `Battle Mode · ${w.bg.name}`, time: fmtTime(sc.fightT), rows: resultRows(w.fighters.filter((f) => !f.soldier && !f.clone), this.winTeam), next: scenes.select });
  }
  renderOverlay(ctx) {
    const [a, b] = this.sides;
    const w = this.sc.world;
    const cnt = (sd) => w.fighters.filter((f) => f.soldier && f.team === sd.team && !f.dead).length;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, HUD_H, W, 22);
    text(ctx, `友军 在场 ${cnt(a)} / 增援 ${a.pool.length}`, 10, HUD_H + 16, { size: 13, color: TEAM_COLORS[1] });
    text(ctx, `敌军 在场 ${cnt(b)} / 增援 ${b.pool.length}`, W - 10, HUD_H + 16, { size: 13, color: TEAM_COLORS[3], align: 'right' });
  }
}
