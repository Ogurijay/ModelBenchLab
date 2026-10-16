// DOM 界面:菜单导航、局内 HUD、名牌、播报、结算。
import * as THREE from 'three';
import { SPECIES, speciesById } from './animals.js';
import { MAPS, mapById } from './maps/index.js';
import { audio } from './audio.js';
import { TEAM_COLORS, TEAM_NAMES } from './game.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

export class UI {
  constructor() {
    this.game = null;
    this.stack = [];
    this.plates = new Map();
    this.sel = { species: 'dog', palette: 0, mode: 'ffa', bots: 5, difficulty: 1, rounds: 3, map: 'random', name: '我' };
    try { Object.assign(this.sel, JSON.parse(localStorage.getItem('fluffy.sel') || '{}')); } catch (e) { /* ignore */ }
    this.msgT = 0; this.toastT = 0;
  }

  bind(game) {
    this.game = game;
    // 导航
    $$('[data-go]').forEach((b) => b.addEventListener('click', () => { audio.init(); audio.play('click'); this.go(b.dataset.go); }));
    $$('.btn').forEach((b) => b.addEventListener('mouseenter', () => audio.play('hover', { volume: 0.4 })));
    // 动物格子
    const grid = $('#animal-grid');
    for (const sp of SPECIES) {
      const d = document.createElement('div');
      d.className = 'card'; d.dataset.id = sp.id;
      d.innerHTML = `<div class="dot" style="background:${sp.palettes[0][0]}"></div>${sp.name}`;
      d.addEventListener('click', () => { this.sel.species = sp.id; this.sel.palette = 0; audio.play('click'); audio.vocal(sp.id, 'taunt'); this.refreshSelect(); });
      grid.appendChild(d);
    }
    const maps = $('#opt-map');
    for (const m of [{ id: 'random', name: '随机轮换', desc: '每回合换一张地图。' }, ...MAPS]) {
      const b = document.createElement('button'); b.dataset.v = m.id; b.textContent = m.name;
      b.addEventListener('click', () => { this.sel.map = m.id; audio.play('click'); this.refreshSelect(); });
      maps.appendChild(b);
    }
    for (const [id, key] of [['#opt-mode', 'mode'], ['#opt-bots', 'bots'], ['#opt-diff', 'difficulty'], ['#opt-rounds', 'rounds']]) {
      $(id).querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        this.sel[key] = key === 'mode' ? b.dataset.v : Number(b.dataset.v);
        audio.play('click'); this.refreshSelect();
      }));
    }
    $('#pname').addEventListener('input', (e) => { this.sel.name = e.target.value.trim() || '我'; });
    $('#btn-start').addEventListener('click', () => this.start());
    $('#btn-resume').addEventListener('click', () => this.resume());
    $('#btn-quit').addEventListener('click', () => { this.hideAll(); this.stack = []; game.paused = false; game.quitToMenu(); this.show('title'); $('#hud').classList.add('hidden'); });
    $('#btn-again').addEventListener('click', () => { this.hideAll(); this.startCfg(this.lastCfg); });
    $('#btn-menu').addEventListener('click', () => { this.hideAll(); game.quitToMenu(); $('#hud').classList.add('hidden'); this.show('title'); });
    // 设置
    const sens = $('#set-sens'), mv = $('#set-master'), mu = $('#set-music'), sf = $('#set-sfx');
    const applyVol = () => audio.setVolumes({ master: +mv.value, music: +mu.value, sfx: +sf.value });
    sens.addEventListener('input', () => { game.settings.sens = +sens.value; });
    [mv, mu, sf].forEach((el) => el.addEventListener('input', applyVol));
    $('#set-quality').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      $('#set-quality').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      const low = b.dataset.v === 'low';
      game.renderer.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 2));
      game.renderer.shadowMap.enabled = true;
      game.sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048);
      game.sun.shadow.map?.dispose(); game.sun.shadow.map = null;
      game.resize();
    }));
    // 局内
    game.input.onEsc = () => this.escape();
    game.input.onTab = (down) => { this.tabDown = down; };
    game.canvas.addEventListener('mousedown', (e) => {
      if (game.state !== 'menu' && (!game.player || !game.player.alive) && e.button === 0) game.cycleSpectate(1);
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Space' && game.state !== 'menu' && (!game.player || !game.player.alive)) game.cycleSpectate(1);
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && game.state !== 'menu' && game.state !== 'matchEnd' && !game.paused && this.lockLost !== false) {
        // 浏览器用 Esc 退出指针锁时同步打开暂停
        if (this.expectUnlock) { this.expectUnlock = false; return; }
        if (game.state === 'fight' || game.state === 'intro') this.pause();
      }
    });
    this.refreshSelect();
  }

  // ---------- 菜单 ----------
  hideAll() { $$('.screen').forEach((s) => s.classList.remove('show')); }
  show(id) { this.hideAll(); $('#' + id).classList.add('show'); this.cur = id; }
  go(id) {
    if (id === 'back') { const prev = this.stack.pop() || 'title'; this.show(prev); return; }
    if (id === 'practice') { this.startCfg({ mode: 'practice', map: 'rooftop', rounds: 99, bots: 3, difficulty: 0, player: this.playerCfg() }); return; }
    if (id === 'help' || id === 'settings') this.stack.push(this.cur);
    this.show(id);
    if (id === 'select') this.refreshSelect();
  }

  playerCfg() { return { species: this.sel.species, palette: this.sel.palette, name: this.sel.name }; }

  refreshSelect() {
    const s = this.sel;
    $$('#animal-grid .card').forEach((c) => c.classList.toggle('on', c.dataset.id === s.species));
    const sp = speciesById[s.species];
    const sw = $('#palettes'); sw.innerHTML = '';
    sp.palettes.forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'sw' + (i === s.palette ? ' on' : '');
      d.style.background = `linear-gradient(135deg, ${p[0]} 55%, ${p[1]} 55%)`;
      d.addEventListener('click', () => { s.palette = i; audio.play('click'); this.refreshSelect(); });
      sw.appendChild(d);
    });
    const seg = (id, v) => $(id).querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
    seg('#opt-mode', s.mode); seg('#opt-bots', s.bots); seg('#opt-diff', s.difficulty); seg('#opt-rounds', s.rounds);
    $('#opt-map').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === s.map));
    $('#map-desc').textContent = s.map === 'random' ? '每回合随机换一张地图:霓虹天台、风暴渔船、浮冰碎碎、大风车间、晃晃吊桥。' : mapById[s.map].desc;
    $('#pname').value = s.name;
    this.game?.showcase.setSelection(s.species, s.palette);
    try { localStorage.setItem('fluffy.sel', JSON.stringify(s)); } catch (e) { /* ignore */ }
  }

  start() {
    audio.init(); audio.play('click');
    const s = this.sel;
    let bots = s.bots;
    if (s.mode === 'team' && bots % 2 === 0) bots += 1; // 团队模式凑成偶数人
    this.startCfg({ mode: s.mode, map: s.map, rounds: s.rounds, bots: Math.min(7, bots), difficulty: s.difficulty, player: this.playerCfg() });
  }

  startCfg(cfg) {
    audio.init();
    this.lastCfg = cfg;
    this.hideAll();
    $('#hud').classList.remove('hidden');
    $('#feed').innerHTML = '';
    this.game.startMatch(cfg);
    this.game.input.requestLock();
  }

  escape() {
    const g = this.game;
    if (g.state === 'menu') { if (this.cur === 'help' || this.cur === 'settings') this.go('back'); else if (this.cur === 'select') this.show('title'); return; }
    if (g.state === 'matchEnd') return;
    if (g.paused) { if (this.cur === 'help' || this.cur === 'settings') this.go('back'); else this.resume(); }
    else this.pause();
  }
  pause() {
    const g = this.game;
    if (g.paused) return;
    g.paused = true;
    this.expectUnlock = true;
    g.input.exitLock();
    this.show('pause');
  }
  resume() {
    this.hideAll(); this.stack = [];
    this.game.paused = false;
    this.game.input.requestLock();
  }

  // ---------- 局内 ----------
  roundIntro(round, mdef, cfg) {
    const mode = cfg.mode === 'practice' ? '练习场' : cfg.mode === 'team' ? '团队对抗' : '个人混战';
    this.announce(cfg.mode === 'practice' ? '练习场' : `第 ${round} 回合`, `${mdef.name} · ${mode}`, 2.8);
    this.clearPlates();
  }
  countdown(x) {
    const el = $('#countdown');
    el.textContent = x;
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  announce(t, s = '', dur = 2.6) {
    const el = $('#center-msg');
    el.querySelector('.t').textContent = t;
    el.querySelector('.s').textContent = s;
    el.classList.add('show');
    this.msgT = dur;
  }
  feed(html) {
    const f = $('#feed');
    const d = document.createElement('div'); d.className = 'fe'; d.innerHTML = html;
    f.prepend(d);
    while (f.children.length > 5) f.lastChild.remove();
    setTimeout(() => d.remove(), 6000);
  }
  toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); this.toastT = 1.6; }
  hitMarker() { const el = $('#hitmark'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  suddenDeath() { this.announce('突然死亡!', '机关全面升级'); }

  roundEnd(team, g) {
    if (team === null) { this.announce('平局!', '没有动物站到最后'); return; }
    if (g.cfg.mode === 'team') this.announce(`${TEAM_NAMES[team]} 赢下本回合!`, this.scoreText(g));
    else {
      const p = g.participants.find((q) => q.team === team);
      this.announce(`${p.name} 赢了!`, p.isPlayer ? '漂亮!最后站着的就是你' : this.scoreText(g));
    }
  }
  scoreText(g) {
    if (g.cfg.mode === 'team') return `${TEAM_NAMES[0]} ${g.teamWins[0] || 0} : ${g.teamWins[1] || 0} ${TEAM_NAMES[1]}`;
    return `先拿到 ${g.cfg.rounds} 分者获胜`;
  }

  matchEnd(team, g) {
    const me = g.participants.find((p) => p.isPlayer);
    let title;
    if (g.cfg.mode === 'team') title = `${TEAM_NAMES[team]} 获得最终胜利!` + (me && me.team === team ? ' 🎉' : '');
    else { const p = g.participants.find((q) => q.team === team); title = p.isPlayer ? '🏆 你是派对之王!' : `🏆 ${p.name} 是派对之王!`; }
    $('#res-title').textContent = title;
    const rows = [...g.participants].sort((a, b) => b.wins - a.wins || b.elims - a.elims || b.kos - a.kos);
    $('#res-table').innerHTML = '<tr><th>动物</th><th>回合胜</th><th>淘汰</th><th>击晕</th><th>投掷</th><th>命中</th></tr>' +
      rows.map((p) => `<tr class="${p.isPlayer ? 'me' : ''}"><td><span class="dot" style="background:${speciesById[p.species].palettes[p.palette][0]}"></span>${p.name} <small>${speciesById[p.species].name}${g.cfg.mode === 'team' ? ' · ' + TEAM_NAMES[p.team] : ''}</small></td><td>${p.wins}</td><td>${p.elims}</td><td>${p.kos}</td><td>${p.throws}</td><td>${p.hits}</td></tr>`).join('');
    setTimeout(() => this.show('results'), 1200);
  }

  clearPlates() { for (const el of this.plates.values()) el.remove(); this.plates.clear(); }

  hud(g, dt) {
    // 播报淡出
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) $('#center-msg').classList.remove('show'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) $('#toast').classList.remove('show'); }
    this.hudT = (this.hudT || 0) - dt;
    // 名牌(每帧)
    const cam = g.camera, w = innerWidth, h = innerHeight;
    const v = new THREE.Vector3();
    const seen = new Set();
    for (const c of g.creatures) {
      if (c === g.player || !c.alive) continue;
      seen.add(c);
      let el = this.plates.get(c);
      if (!el) { el = document.createElement('div'); el.className = 'plate'; el.textContent = c.name; el.style.color = c.color; $('#plates').appendChild(el); this.plates.set(c, el); }
      v.copy(c.vis.head.position); v.y += 0.55;
      const d = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || d > 32) { el.style.display = 'none'; continue; }
      el.style.display = '';
      el.style.left = ((v.x + 1) / 2 * w) + 'px';
      el.style.top = ((1 - v.y) / 2 * h) + 'px';
      el.classList.toggle('ko', c.ko);
    }
    for (const [c, el] of this.plates) if (!seen.has(c)) { el.remove(); this.plates.delete(c); }
    if (this.hudT > 0) return;
    this.hudT = 0.1;
    // 顶栏
    const cfg = g.cfg;
    $('#round-info').textContent = cfg.mode === 'practice' ? `练习场 · ${g.mapDef.name}` : `第 ${g.round} 回合 · ${g.mapDef.name}`;
    const tm = $('#timer');
    if (cfg.mode === 'practice') tm.textContent = '';
    else {
      const sd = cfg.suddenDeath ?? 90;
      const left = Math.max(0, sd - g.roundT);
      tm.textContent = g.sdOn ? '突然死亡' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
      tm.classList.toggle('sd', !!g.sdOn);
    }
    const sc = $('#scores');
    if (cfg.mode === 'team') sc.innerHTML = [0, 1].map((t) => `<span class="score-pill" style="color:${TEAM_COLORS[t]}">${TEAM_NAMES[t]} ${g.teamWins[t] || 0}</span>`).join('') + `<span class="score-pill">目标 ${cfg.rounds}</span>`;
    else if (cfg.mode === 'practice') sc.innerHTML = '<span class="score-pill">木桩不会还手 · 掉下去会自动复活</span>';
    else sc.innerHTML = `<span class="score-pill">先赢 ${cfg.rounds} 回合</span>`;
    // 名单
    const ro = $('#roster');
    ro.innerHTML = g.creatures.map((c) => {
      const p = c.part;
      const st = !c.alive ? '出局' : c.ko ? '晕倒' : c.frozen > 0 ? '冰冻' : '';
      const wins = cfg.mode === 'ffa' ? '★'.repeat(p.wins) : '';
      return `<div class="ro ${c.alive ? '' : 'out'}" style="${tabStyle(this.tabDown)}"><span class="dot" style="background:${speciesById[c.species].palettes[c.palette][0]};border-color:${c.color}"></span><span style="color:${c.color}">${c.name}</span><span class="wins">${wins}</span><span class="st">${st}</span></div>`;
    }).join('');
    // 玩家状态
    const P = g.player;
    const cb = $('#v-consc'), gb = $('#v-grip');
    if (P && P.alive) {
      const consc = P.ko ? 0 : P.consc;
      cb.querySelector('i').style.width = consc + '%';
      cb.classList.toggle('dim', consc > 99 && !P.ko);
      cb.querySelector('span').textContent = P.ko ? `晕倒中 · 连按动作键挣扎 ${Math.max(0, P.koT).toFixed(1)}s` : P.frozen > 0 ? '被冻住了!连按挣脱' : '意识';
      gb.querySelector('i').style.width = Math.max(0, P.grip) + '%';
      gb.classList.toggle('dim', P.grip > 99);
      const w = P.weapon;
      $('#v-weapon').textContent = w ? `${w.def.name}${w.def.gun ? ' · 弹药 ' + w.ammo : ''}${w.type === 'bomb' ? ' · 快扔!' : ''}` : '';
    } else { cb.classList.add('dim'); gb.classList.add('dim'); $('#v-weapon').textContent = P && !P.alive ? `观战中:${g.focusCreature()?.name || ''}` : ''; }
    $('#lockhint').classList.toggle('show', !g.input.locked && !g.paused && g.state !== 'matchEnd');
    $('#crosshair').style.display = P && P.alive && (P.weapon?.def.gun) ? '' : 'none';
  }
}

function tabStyle(down) { return down ? 'transform:scale(1.15);transform-origin:left' : ''; }
