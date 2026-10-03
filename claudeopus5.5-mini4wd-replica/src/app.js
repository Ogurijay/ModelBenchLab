// 游戏主程序：车库（选车 / 改装 / 拆解 / 原型档案）→ 赛事设置 → 比赛（HUD / 镜头 / 事件）→ 成绩。
import { CARS, carById } from './model/cars/index.js';
import { PARTS, SLOTS, normalizeBuild, getStats, getSetup, STAT_NAMES, pick } from './game/parts.js';
import { Track, LAYOUTS } from './game/track.js';
import { Race, SPECIALS } from './game/sim.js';
import { VENUES } from './game/world.js';
import { View, makeThumbnails } from './game/view.js';
import { Sound } from './game/sound.js';

const STORE = 'mini4wd-opus55-v1';
// 对手预设调校（让比赛有来有回）
const RIVAL_BUILDS = {
  cyclone: { motor: 1, roller: 1, brake: 1 }, hurricane: { motor: 2, roller: 1, brake: 1, damper: 1 }, tridagger: { motor: 1, gear: 2, roller: 1 },
  evolution: { motor: 2, roller: 2, brake: 1 }, cobra: { motor: 1, roller: 1, damper: 1 }, spider: { motor: 2, roller: 3, brake: 2 },
  gigant: { motor: 1, roller: 1, damper: 2 }, stinger: { motor: 2, roller: 1, brake: 1, damper: 1 },
};
const CHASSIS_NOTE = { AR: '后置马达 · 一体式单体底盘', 'Super-II': '后置马达 · 强化 ABS', 'Super-1': '后置马达 · 低重心', 'FM-A': '前置马达 · 双轴马达前置' };

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => (t == null ? '--' : t.toFixed(2) + ' s');

export function startApp(params) {
  const app = new App(document.getElementById('app'), params);
  window.mini4wd = app.api();
  return app;
}

class App {
  constructor(root, params) {
    this.root = root; this.params = params;
    this.state = this.load();
    this.sound = new Sound(this.state.sound);
    this.thumbs = {};
    this.renderShell();
    this.view = new View($('#stage', root));
    this.view.enterGarage();
    this.selectCar(this.state.car, true);
    this.bindKeys();
    this.loop = this.loop.bind(this);
    this.last = performance.now();
    requestAnimationFrame(this.loop);
    // 后台兜底：标签页隐藏时 rAF 停止，模拟仍由定时器推进（便于无头测试）
    this.fallback = setInterval(() => { if (performance.now() - this.last > 250) this.tick(0.05); }, 50);
    makeThumbnails(CARS, d => this.lookFor(d, this.state.builds[d.id] || {})).then(t => { this.thumbs = t; this.renderCarList(); }).catch(e => console.warn('缩略图生成失败', e));
  }

  load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch { s = {}; }
    const builds = {};
    for (const c of CARS) builds[c.id] = normalizeBuild(s.builds?.[c.id]);
    return {
      car: carById(s.car).id, builds, layout: LAYOUTS.find(l => l.id === s.layout)?.id || LAYOUTS[0].id,
      venue: VENUES.find(v => v.id === s.venue)?.id || VENUES[0].id, lanes: [3, 5].includes(s.lanes) ? s.lanes : 5,
      mode: s.mode === 'anime' ? 'anime' : 'real', rivals: Array.isArray(s.rivals) ? s.rivals.filter(id => CARS.some(c => c.id === id)) : null,
      laps: s.laps === 2 ? 2 : 1, best: s.best && typeof s.best === 'object' ? s.best : {}, sound: s.sound !== false, history: Array.isArray(s.history) ? s.history.slice(0, 20) : [],
    };
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.state)); } catch { /* 存储不可用时仅本次会话有效 */ } }

  // 改装 → 模型外观
  lookFor(def, build) {
    const b = normalizeBuild(build), P = Object.fromEntries(SLOTS.map(k => [k, PARTS[k].options[b[k]]]));
    const look = { chassisColors: { motorLabel: P.motor.label, battery: P.battery.kind, brake: P.brake.color ?? null, dampers: P.damper.mass ? (P.damper.id === 'full4' ? 4 : 2) : 0 }, wheels: {} };
    if (P.roller.id !== 'stock') look.chassisColors.rollerSpec = { d: P.roller.d || 13, bearing: !!P.roller.bearing, double: !!P.roller.double, color: P.roller.color };
    if (P.tire.tire) look.wheels.tire = P.tire.tire;
    return look;
  }

  // ---------------- 外壳 DOM ----------------
  renderShell() {
    this.root.innerHTML = `
      <div id="stage"></div>
      <header class="topbar">
        <div class="brand"><span class="brand-mark">4WD</span><div><b>四驱兄弟 · 原型复刻赛</b><small>LET'S &amp; GO!! REPLICA CIRCUIT · Claude Opus 5.5</small></div></div>
        <nav class="tabs"><button data-act="garage" class="on">车库</button><button data-act="setup">赛场</button></nav>
        <div class="tools"><button data-act="sound" title="声音">${this.state.sound ? '🔊' : '🔇'}</button></div>
      </header>
      <aside class="cars" id="cars"></aside>
      <section class="panel" id="panel"></section>
      <div class="labels" id="labels"></div>
      <div class="garage-bar" id="garage-bar">
        <button data-act="explode" class="ghost">⇱ 拆解结构</button>
        <button data-act="spin" class="ghost">⟳ 自动旋转</button>
        <span class="hint">拖动旋转 · 滚轮缩放 · 点击零件查看</span>
      </div>
      <div class="hud" id="hud" hidden></div>
      <div class="toast" id="toast"></div>
      <div class="modal" id="modal" hidden></div>`;
    this.root.addEventListener('click', e => this.onClick(e));
    $('#stage', this.root).addEventListener('pointerdown', e => { this.downAt = [e.clientX, e.clientY]; });
    $('#stage', this.root).addEventListener('pointerup', e => {
      if (this.view.mode !== 'garage' || !this.downAt) return;
      if (Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) > 5) return;
      const part = this.view.pick(e.clientX, e.clientY);
      this.showPartInfo(part);
    });
  }

  renderCarList() {
    const el = $('#cars', this.root);
    el.innerHTML = `<h3>选择赛车 <small>${CARS.length} 台 · 田宫套件原型</small></h3>` + CARS.map(c => {
      const st = getStats(c, this.state.builds[c.id]);
      return `<button class="car-card${c.id === this.state.car ? ' on' : ''}" data-car="${c.id}">
        <span class="thumb">${this.thumbs[c.id] ? `<img alt="${esc(c.name)}" src="${this.thumbs[c.id]}">` : '<i class="spinner"></i>'}</span>
        <span class="meta"><b>${esc(c.name)}</b><small>${esc(c.en)}</small><em>${esc(c.owner)} · ${esc(c.chassis)}</em></span>
        <span class="mini-stat" title="极速">${st.topKmh.toFixed(0)}<small>km/h</small></span>
      </button>`;
    }).join('');
  }

  renderPanel() {
    const car = carById(this.state.car), build = this.state.builds[car.id], st = getStats(car, build), su = getSetup(car, build);
    const tab = this.panelTab || 'tune';
    $('#panel', this.root).innerHTML = `
      <div class="car-head">
        <div><small>${esc(car.kit)} · ${esc(car.jp)}</small><h2>${esc(car.name)}</h2><p class="en">${esc(car.en)}</p></div>
        <div class="owner">车手<b>${esc(car.owner)}</b></div>
      </div>
      <p class="intro">${esc(car.intro || '')}</p>
      <div class="specs">
        <span><small>底盘</small>${esc(car.chassis)}</span><span><small>布局</small>${esc(CHASSIS_NOTE[car.chassis] || '')}</span>
        <span><small>齿比</small>${su.ratio}:1</span><span><small>整车质量</small>${(su.mass * 1000).toFixed(0)} g</span>
      </div>
      <div class="stats">${st.values.map((v, i) => `<div class="stat"><label>${STAT_NAMES[i]}</label><div class="bar"><i style="width:${v}%"></i></div><b>${v}</b></div>`).join('')}
        <p class="stat-note">空载极速 ${st.topKmh.toFixed(1)} km/h · 起步加速度 ${st.accel.toFixed(1)} m/s²</p></div>
      <div class="ptabs"><button data-tab="tune" class="${tab === 'tune' ? 'on' : ''}">改装</button><button data-tab="proto" class="${tab === 'proto' ? 'on' : ''}">原型档案</button></div>
      <div class="ptab-body">${tab === 'tune' ? this.tuneHTML(car, build) : this.protoHTML(car)}</div>
      <div class="actions"><button data-act="reset-build" class="ghost">恢复原厂</button><button data-act="setup" class="primary">进入赛场 ▶</button></div>`;
  }

  tuneHTML(car, build) {
    return SLOTS.map(slot => {
      const P = PARTS[slot], cur = normalizeBuild(build)[slot];
      return `<div class="slot"><div class="slot-head"><b>${P.label}</b><small>${P.en}</small></div>
        <div class="opts">${P.options.map((o, i) => `<button class="opt${i === cur ? ' on' : ''}" data-slot="${slot}" data-opt="${i}" data-jp="${esc(o.jp || '')}">${esc(o.name)}</button>`).join('')}</div>
        <p class="slot-hint">${esc(P.hint)}</p></div>`;
    }).join('');
  }

  protoHTML(car) {
    return `<p class="proto-note">外形依据田宫官方商品主图与套件资料，用标定相机做多点三角测量后程序化建模（不使用外部模型或照片贴图）。下列为本车型的识别要点：</p>
      <ol class="features">${(car.features || []).map(f => `<li>${esc(f)}</li>`).join('')}</ol>
      <p class="proto-note small">单张商品照无法完全确定背面与底部细节，这部分按底盘结构推导；完整过程见项目 docs/MODELING.md。</p>`;
  }

  showPartInfo(part) {
    const el = $('#toast', this.root);
    if (!part) { el.classList.remove('show'); return; }
    el.innerHTML = `<b>${esc(part.label)}</b>`;
    el.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => el.classList.remove('show'), 2400);
  }

  toast(html, ms = 2000, cls = '') {
    const el = $('#toast', this.root);
    el.className = 'toast show ' + cls; el.innerHTML = html;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { el.className = 'toast'; }, ms);
  }

  // ---------------- 交互 ----------------
  onClick(e) {
    const b = e.target.closest('button'); if (!b) return;
    this.sound.unlock();
    if (b.dataset.car) return this.selectCar(b.dataset.car);
    if (b.dataset.slot) { const car = this.state.car; this.state.builds[car] = { ...this.state.builds[car], [b.dataset.slot]: +b.dataset.opt }; this.save(); this.sound.click(); this.selectCar(car, false, true); return; }
    if (b.dataset.tab) { this.panelTab = b.dataset.tab; this.renderPanel(); return; }
    if (b.dataset.layout) { this.state.layout = b.dataset.layout; this.save(); return this.openSetup(); }
    if (b.dataset.venue) { this.state.venue = b.dataset.venue; this.save(); return this.openSetup(); }
    if (b.dataset.lanes) { this.state.lanes = +b.dataset.lanes; this.trimRivals(); this.save(); return this.openSetup(); }
    if (b.dataset.mode) { this.state.mode = b.dataset.mode; this.save(); return this.openSetup(); }
    if (b.dataset.laps) { this.state.laps = +b.dataset.laps; this.save(); return this.openSetup(); }
    if (b.dataset.rival) { this.toggleRival(b.dataset.rival); return this.openSetup(); }
    if (b.dataset.cam) { this.view.setCameraMode(b.dataset.cam); this.renderHUD(true); return; }
    const act = b.dataset.act;
    if (act === 'garage') return this.toGarage();
    if (act === 'setup') return this.openSetup();
    if (act === 'close') return this.closeModal();
    if (act === 'start') return this.startRace();
    if (act === 'restart') return this.startRace();
    if (act === 'pause') return this.togglePause();
    if (act === 'explode') { this.exploded = !this.exploded; this.view.setExplodeTarget(this.exploded); b.classList.toggle('on', this.exploded); b.textContent = this.exploded ? '⇲ 组装还原' : '⇱ 拆解结构'; return; }
    if (act === 'spin') { this.view.controls.autoRotate = !this.view.controls.autoRotate; b.classList.toggle('on', this.view.controls.autoRotate); return; }
    if (act === 'reset-build') { this.state.builds[this.state.car] = normalizeBuild({}); this.save(); return this.selectCar(this.state.car, false, true); }
    if (act === 'sound') { this.state.sound = !this.state.sound; this.sound.setEnabled(this.state.sound); b.textContent = this.state.sound ? '🔊' : '🔇'; this.save(); return; }
  }

  selectCar(id, first = false, keepView = false) {
    const car = carById(id);
    this.state.car = car.id; this.save();
    this.view.showGarageCar(car, this.lookFor(car, this.state.builds[car.id]));
    if (!keepView && !first) this.view.enterGarage();
    this.renderCarList(); this.renderPanel();
    if (keepView && this.thumbs[car.id]) this.refreshThumb(car);
  }

  async refreshThumb(car) {
    clearTimeout(this.thumbT);
    this.thumbT = setTimeout(async () => { const t = await makeThumbnails([car], d => this.lookFor(d, this.state.builds[d.id])); Object.assign(this.thumbs, t); this.renderCarList(); }, 600);
  }

  bindKeys() {
    this.input = { boost: false, special: false };
    addEventListener('keydown', e => {
      if (e.target.closest?.('input,select,textarea')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); if (this.race) { if (this.race.state === 'ready') this.race.start(); else if (this.race.state === 'finished') this.startRace(); else this.togglePause(); } else if (!$('#modal', this.root).hidden) this.startRace(); }
      if (k === 'c' && this.race) { const order = ['follow', 'tv', 'top', 'orbit']; this.view.setCameraMode(order[(order.indexOf(this.view.cameraMode) + 1) % order.length]); this.renderHUD(true); }
      if (k === 'w' || k === 'arrowup') this.input.boost = true;
      if (k === 'shift' || k === 'e') this.input.special = true;
      if (k === 'escape') { if (this.race) this.toGarage(); else this.closeModal(); }
    });
    addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === 'w' || k === 'arrowup') this.input.boost = false; if (k === 'shift' || k === 'e') this.input.special = false; });
  }

  // ---------------- 赛事设置 ----------------
  rivalsList() {
    const max = this.state.lanes - 1;
    let r = (this.state.rivals || CARS.filter(c => c.id !== this.state.car).map(c => c.id)).filter(id => id !== this.state.car);
    return r.slice(0, max);
  }
  trimRivals() { this.state.rivals = this.rivalsList(); }
  toggleRival(id) {
    let r = this.rivalsList();
    if (r.includes(id)) r = r.filter(x => x !== id); else if (r.length < this.state.lanes - 1) r.push(id); else { r.shift(); r.push(id); }
    this.state.rivals = r; this.save();
  }

  openSetup() {
    if (this.race) this.toGarage();
    $('.tabs [data-act="setup"]', this.root).classList.add('on'); $('.tabs [data-act="garage"]', this.root).classList.remove('on');
    const S = this.state, rivals = this.rivalsList(), me = carById(S.car);
    const m = $('#modal', this.root);
    m.hidden = false;
    m.innerHTML = `<div class="sheet setup">
      <div class="sheet-head"><h2>赛事设置</h2><button data-act="close" class="x">×</button></div>
      <h4>赛道</h4><div class="cards">${LAYOUTS.map(l => `<button class="card${l.id === S.layout ? ' on' : ''}" data-layout="${l.id}"><b>${esc(l.name)}</b><small>${esc(l.en)} · ${esc(l.level)}</small><p>${esc(l.desc)}</p></button>`).join('')}</div>
      <h4>场馆</h4><div class="cards">${VENUES.map(v => `<button class="card${v.id === S.venue ? ' on' : ''}" data-venue="${v.id}"><b>${esc(v.name)}</b><small>${esc(v.en)}</small><p>${esc(v.desc)}</p></button>`).join('')}</div>
      <div class="row">
        <div><h4>车道</h4><div class="seg">${[3, 5].map(n => `<button class="${n === S.lanes ? 'on' : ''}" data-lanes="${n}">${n} 车道</button>`).join('')}</div></div>
        <div><h4>圈数</h4><div class="seg">${[1, 2].map(n => `<button class="${n === S.laps ? 'on' : ''}" data-laps="${n}">${S.lanes * n} 圈</button>`).join('')}</div></div>
        <div><h4>模式</h4><div class="seg"><button class="${S.mode === 'real' ? 'on' : ''}" data-mode="real">竞技（真实规则）</button><button class="${S.mode === 'anime' ? 'on' : ''}" data-mode="anime">动画（加油与必杀技）</button></div></div>
      </div>
      <p class="mode-note">${S.mode === 'real' ? '真实迷你四驱：比赛中不能操控，胜负取决于赛前调校。每圈经过换道桥换一次车道，跑完所有车道。' : '动画模式：按住 W/↑ 为赛车加油（加速、耗电更快）；Shift/E 发动一次必杀技「' + esc(SPECIALS[me.id] || '必杀冲刺') + '」。'}</p>
      <h4>对手 <small>（最多 ${S.lanes - 1} 台）</small></h4>
      <div class="chips">${CARS.filter(c => c.id !== S.car).map(c => `<button class="chip${rivals.includes(c.id) ? ' on' : ''}" data-rival="${c.id}">${esc(c.name)}</button>`).join('')}</div>
      <div class="sheet-foot"><span>你的赛车：<b>${esc(me.name)}</b> · 极速 ${getStats(me, S.builds[me.id]).topKmh.toFixed(1)} km/h</span><button class="primary" data-act="start">开始比赛 ▶</button></div>
    </div>`;
  }
  closeModal() { $('#modal', this.root).hidden = true; $('.tabs [data-act="setup"]', this.root).classList.remove('on'); $('.tabs [data-act="garage"]', this.root).classList.add('on'); }

  // ---------------- 比赛 ----------------
  startRace() {
    const S = this.state;
    const layout = LAYOUTS.find(l => l.id === S.layout), venue = VENUES.find(v => v.id === S.venue);
    const track = new Track(layout, S.lanes);
    const me = carById(S.car), rivals = this.rivalsList().map(carById);
    const entries = [{ car: me, build: S.builds[me.id], player: true }, ...rivals.map(c => ({ car: c, build: RIVAL_BUILDS[c.id] || {} }))];
    const seed = (Date.now() & 0xffff) ^ 0x5a5a;
    this.race = new Race({ track, entries, laps: S.lanes * S.laps, mode: S.mode, seed });
    this.view.buildRace(track, venue, this.race.racers, r => this.lookFor(r.car, r.build));
    this.view.enterRace();
    $('#modal', this.root).hidden = true;
    this.root.classList.add('racing');
    $('.tabs [data-act="setup"]', this.root).classList.add('on'); $('.tabs [data-act="garage"]', this.root).classList.remove('on');
    $('#hud', this.root).hidden = false;
    this.renderHUD(true);
    this.race.start();
    this.sound.countdown();
    this.lastCount = 4;
  }

  togglePause() { if (!this.race) return; this.race.pause(); this.renderHUD(true); }

  toGarage() {
    if (this.race) { this.race = null; this.view.disposeRace(); }
    this.sound.stopMotor();
    this.root.classList.remove('racing');
    $('#hud', this.root).hidden = true; $('#modal', this.root).hidden = true;
    $('.tabs [data-act="setup"]', this.root).classList.remove('on'); $('.tabs [data-act="garage"]', this.root).classList.add('on');
    this.view.enterGarage();
  }

  renderHUD(full = false) {
    const R = this.race, hud = $('#hud', this.root);
    if (!R) return;
    const p = R.player, st = R.standings, pos = st.indexOf(p) + 1;
    if (full || !this.hudBuilt) {
      hud.innerHTML = `
        <div class="hud-tl"><div class="pos"><b id="h-pos">-</b><small>/ ${R.racers.length}</small></div><div class="lap">LAP <b id="h-lap">0</b> / ${R.laps}</div><div class="lane">车道 <b id="h-lane">-</b></div></div>
        <div class="hud-tr"><div>TIME <b id="h-time">0.00</b></div><div>BEST <b id="h-best">--</b></div></div>
        <div class="hud-bl"><div class="speed"><b id="h-speed">0.0</b><small>km/h</small></div><div class="batt"><label>电池</label><div class="bar"><i id="h-batt"></i></div><span id="h-volt">3.00 V</span></div>
          ${R.mode === 'anime' ? `<div class="special" id="h-special">必杀技「${esc(SPECIALS[p.id] || '必杀冲刺')}」<b>Shift</b></div>` : ''}</div>
        <ol class="hud-standings" id="h-stand"></ol>
        <div class="hud-cams">${[['follow', '跟车'], ['tv', '场边'], ['top', '俯视'], ['orbit', '自由']].map(([k, n]) => `<button data-cam="${k}" class="${this.view.cameraMode === k ? 'on' : ''}">${n}</button>`).join('')}<button data-act="pause">${R.state === 'paused' ? '▶ 继续' : 'Ⅱ 暂停'}</button><button data-act="garage">退出</button></div>
        <div class="count" id="h-count"></div>
        <div class="hud-help">${R.mode === 'anime' ? 'W/↑ 加油 · Shift 必杀技 · ' : ''}C 切换镜头 · 空格 暂停 · Esc 退出</div>`;
      this.hudBuilt = true;
    }
    const set = (id, v) => { const e = hud.querySelector('#' + id); if (e && e.textContent !== String(v)) e.textContent = v; };
    set('h-pos', pos); set('h-lap', Math.min(R.laps, p.lap + (p.status === 'finished' ? 0 : 1))); set('h-lane', p.lane + 1);
    set('h-time', R.time.toFixed(2)); set('h-best', p.best ? p.best.toFixed(2) : '--');
    set('h-speed', (p.v * 3.6).toFixed(1));
    const q = Math.max(0, 1 - p.used / p.setup.capacity);
    const bat = hud.querySelector('#h-batt'); if (bat) bat.style.width = (q * 100).toFixed(1) + '%';
    set('h-volt', p.volts.toFixed(2) + ' V');
    const sp = hud.querySelector('#h-special'); if (sp) sp.classList.toggle('used', p.specialLeft <= 0), sp.classList.toggle('active', p.special > 0);
    const cnt = hud.querySelector('#h-count');
    if (cnt) { const c = R.state === 'countdown' ? Math.ceil(R.countdown) : (R.time < 0.8 && R.state === 'running' ? 'GO!' : (R.state === 'paused' ? '暂停' : '')); if (cnt.textContent !== String(c)) cnt.textContent = c; }
    const list = hud.querySelector('#h-stand');
    if (list) list.innerHTML = st.map((r, i) => `<li class="${r.player ? 'me' : ''} ${r.status}"><span>${i + 1}</span><b>${esc(r.car.name)}</b><em>${r.status === 'out' ? 'C.O.' : r.status === 'finished' ? fmt(r.finish) : 'L' + Math.min(R.laps, r.lap + 1)}</em></li>`).join('');
  }

  handleEvents() {
    const R = this.race; if (!R) return;
    while (R.events.length) {
      const e = R.events.shift();
      if (e.type === 'go') { this.sound.go(); this.sound.startMotor(); }
      if (e.type === 'lap') { this.toast(`第 ${e.lap} 圈 · ${e.time.toFixed(2)} s`, 1400); }
      if (e.type === 'out') { this.toast(`<b>COURSE OUT!</b> ${esc(carById(e.id).name)} · ${esc(e.reason)}`, 2400, e.player ? 'bad' : ''); this.sound.crash(); }
      if (e.type === 'special') { this.toast(`必杀技 · <b>${esc(e.name)}</b>！`, 1800, 'special'); this.sound.special(); }
      if (e.type === 'finish') this.showResults();
    }
  }

  showResults() {
    const R = this.race, S = this.state;
    this.sound.stopMotor();
    const st = R.standings, me = R.player, rank = st.indexOf(me) + 1;
    const key = `${S.layout}/${S.lanes}/${S.laps}`;
    let record = false;
    if (me.status === 'finished') {
      const prev = S.best[key]?.[me.id];
      if (prev == null || me.finish < prev) { S.best[key] = { ...(S.best[key] || {}), [me.id]: me.finish }; record = true; }
    }
    S.history.unshift({ date: new Date().toISOString(), car: me.id, layout: S.layout, rank, time: me.finish ?? null, out: me.reason ?? null });
    S.history = S.history.slice(0, 20); this.save();
    const m = $('#modal', this.root); m.hidden = false;
    m.innerHTML = `<div class="sheet results">
      <div class="sheet-head"><h2>${me.status === 'finished' ? (rank === 1 ? '🏆 冠军！' : `第 ${rank} 名`) : 'COURSE OUT'}</h2><button data-act="close" class="x">×</button></div>
      <p class="sub">${esc(LAYOUTS.find(l => l.id === S.layout).name)} · ${R.laps} 圈 · ${R.mode === 'anime' ? '动画模式' : '竞技模式'}${record ? ' · <b class="rec">新纪录</b>' : ''}</p>
      <table><thead><tr><th>名次</th><th>赛车</th><th>车手</th><th>总时间</th><th>最快单圈</th><th>状态</th></tr></thead>
      <tbody>${st.map((r, i) => `<tr class="${r.player ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.car.name)}</td><td>${esc(r.car.owner)}</td><td>${fmt(r.finish)}</td><td>${fmt(r.best)}</td><td>${r.status === 'out' ? '冲出 · ' + esc(r.reason) + `（第 ${r.lap + 1} 圈）` : '完赛'}</td></tr>`).join('')}</tbody></table>
      ${me.status === 'out' ? `<p class="tip">提示：${me.reason.includes('飞') ? '腾空过高越过护墙——试试刹车海绵、配重阻尼或更宽的导轮，降低马达转速也有效。' : me.reason.includes('弯') ? '过弯翻出——换轴承导轮 / 19 mm 导轮，或降低极速。' : '落地弹起失稳——配重阻尼与低反弹轮胎能吸收冲击。'}</p>` : ''}
      <div class="sheet-foot"><button class="ghost" data-act="garage">返回车库调校</button><button class="primary" data-act="restart">再来一局 ▶</button></div></div>`;
  }

  // ---------------- 主循环 ----------------
  loop(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
    requestAnimationFrame(this.loop);
  }

  tick(dt) {
    if (dt <= 0) return;
    const R = this.race;
    if (R) {
      R.update(dt, this.input);
      this.view.syncRace(R, dt);
      this.view.updateRaceCamera(R, dt);
      this.handleEvents();
      this.renderHUD();
      if (R.state === 'countdown') { const c = Math.ceil(R.countdown); if (c < this.lastCount) { this.lastCount = c; this.sound.beep(); } }
      this.sound.motor(R.player.status === 'run' || R.player.status === 'air' ? R.player.v : 0, R.state === 'running');
    } else if (this.view.mode === 'garage') {
      this.updateLabels();
    }
    this.view.render(dt);
  }

  updateLabels() {
    const el = $('#labels', this.root);
    if (!this.exploded || this.view.explodeT < 0.6) { if (el.childElementCount) el.innerHTML = ''; return; }
    const anchors = this.view.partAnchors();
    if (el.childElementCount !== anchors.length) el.innerHTML = anchors.map(a => `<span class="plabel" data-part="${a.id}">${esc(a.label)}</span>`).join('');
    anchors.forEach((a, i) => { const s = el.children[i]; if (s) s.style.transform = `translate(${a.x.toFixed(0)}px, ${a.y.toFixed(0)}px)`; });
  }

  api() {
    return {
      snapshot: () => {
        const R = this.race;
        return {
          car: this.state.car, build: this.state.builds[this.state.car], carCount: CARS.length, mode: this.view.mode,
          exploded: !!this.exploded, layout: this.state.layout, venue: this.state.venue, lanes: this.state.lanes,
          race: R ? { state: R.state, time: +R.time.toFixed(3), laps: R.laps, racers: R.racers.map(r => ({ id: r.id, player: r.player, lap: r.lap, lane: r.lane, v: +r.v.toFixed(3), status: r.status, reason: r.reason, finish: r.finish })) } : null,
          render: { calls: this.view.renderer.info.render.calls, triangles: this.view.renderer.info.render.triangles },
          thumbs: Object.keys(this.thumbs).length,
        };
      },
      selectCar: id => this.selectCar(id),
      setPart: (slot, i) => { this.state.builds[this.state.car] = { ...this.state.builds[this.state.car], [slot]: i }; this.save(); this.selectCar(this.state.car, false, true); },
      explode: on => { this.exploded = on; this.view.setExplodeTarget(on); },
      startRace: (opts = {}) => { Object.assign(this.state, opts); this.save(); this.startRace(); },
      step: (sec, input = {}) => { const n = Math.round(sec / 0.05); for (let i = 0; i < n; i++) { Object.assign(this.input, input); this.tick(0.05); } return this.api().snapshot(); },
      garage: () => this.toGarage(),
      camera: m => this.view.setCameraMode(m),
      capture: () => this.view.renderer.domElement.toDataURL('image/png'),
    };
  }
}
