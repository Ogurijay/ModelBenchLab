// 界面:HUD(快捷栏、生命/饥饿/护甲/氧气、时间与历法面板、小地图)、背包/合成/箱子/熔炉面板、创造物品库、聊天框与全屏地图。
import { iconURL, hudIcon } from './art.js';
import { ITEMS, ITEM_LIST, RECIPES, SMELT, SMELT_TICKS, fuelOf, itemName, maxStack, tagMatches, TAGS } from './items.js';
import { BLOCKS, WALLS } from './blocks.js';
import { input } from './input.js';
import { Inventory, INV_SIZE } from './inventory.js';
import { BIOME_NAMES } from './worldgen.js';
import { WEATHER_NAMES } from './time.js';
import { SEASON_NAMES, HELL_Y, SEA } from './const.js';
import { play } from './audio.js';
import { updateRpgHud, buildDialog, buildVendor, buildSkills, buildQuests, buildFusion, sellPrice } from './rpgui.js';
import { SKILLS, CLASSES, RACES, RES_INFO, fmtMoney, xpForLevel, FACTIONS } from './wow.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class UI {
  constructor() {
    this.game = null;
    this.panel = null; this.panelData = null; this.cursor = null;
    this.menuOpen = false; this.chatOpen = false; this.mapOpen = false;
    this.hbVer = -1; this.hbSel = -1; this.barSig = ''; this.infoT = 0; this.miniT = 0; this.logItems = [];
    this.hover = null; this.craftSig = ''; this.onlyCraftable = true; this.search = ''; this.tab = 'craft';
    this.showMinimap = true; this.showFps = false; this.hudHidden = false;
    this.mapView = { x: 0, y: 0, ppt: 2, drag: null };
    this.hotEls = [];
    const hb = $('hotbar');
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('div'); el.className = 'slot';
      el.innerHTML = `<span class="k">${i + 1}</span><img class="ic" alt=""><span class="n"></span><div class="dur hidden"><i></i></div>`;
      el.addEventListener('mousedown', e => { e.preventDefault(); if (this.panel) return; this.game.player.inv.sel = i; this.hbSel = -1; });
      hb.appendChild(el); this.hotEls.push(el);
    }
    document.addEventListener('mousemove', e => { this.mx = e.clientX; this.my = e.clientY; this.moveFloat(); });
    $('panelWrap').addEventListener('mousedown', e => { if (e.target === $('panelWrap')) this.dropCursor(); });
    $('chatInput').addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = e.target.value.trim(); this.closeChat(); if (v) this.game.chat(v); }
      else if (e.key === 'Escape') this.closeChat();
      else if (e.key === 'ArrowUp' && this.lastChat) e.target.value = this.lastChat;
    });
    const mc = $('mapCanvas');
    mc.addEventListener('mousedown', e => { this.mapView.drag = { x: e.clientX, y: e.clientY, ox: this.mapView.x, oy: this.mapView.y }; });
    window.addEventListener('mouseup', () => { this.mapView.drag = null; });
    mc.addEventListener('mousemove', e => {
      const d = this.mapView.drag;
      if (d) { this.mapView.x = d.ox - (e.clientX - d.x) / this.mapView.ppt; this.mapView.y = d.oy - (e.clientY - d.y) / this.mapView.ppt; }
      this.mapMouse = { x: e.clientX, y: e.clientY };
    });
    mc.addEventListener('wheel', e => { e.preventDefault(); const v = this.mapView; v.ppt = Math.max(0.25, Math.min(8, v.ppt * (e.deltaY > 0 ? 0.8 : 1.25))); }, { passive: false });
  }
  attach(game) { this.game = game; this.hbVer = -1; this.barSig = ''; this.cursor = null; this.closePanel(); }

  capturesKeys() { return this.chatOpen || this.menuOpen || this.mapOpen; }
  mouseFree() { return !this.panel && !this.menuOpen && !this.mapOpen && !this.chatOpen; }
  showHud(on) { $('hud').classList.toggle('hidden', !on || this.hudHidden); }

  // ——————————————————————— 消息
  msg(text, color = '#fff') {
    const el = document.createElement('div');
    el.innerHTML = text; el.style.color = color;
    $('log').appendChild(el);
    const item = { el, t: 0 };
    this.logItems.push(item);
    while (this.logItems.length > 40) this.logItems.shift().el.remove();
  }
  hint(text, dur = 4) { const h = $('hint'); h.innerHTML = text; h.style.opacity = 1; this.hintT = dur; }

  // ——————————————————————— 每帧 HUD
  update(dt) {
    const g = this.game, p = g.player, inv = p.inv;
    // 快捷栏
    if (inv.version !== this.hbVer || inv.sel !== this.hbSel) {
      for (let i = 0; i < 9; i++) { this.paintSlot(this.hotEls[i], inv.slots[i]); this.hotEls[i].classList.toggle('sel', i === inv.sel); }
      if (inv.sel !== this.hbSel) { const s = inv.held; const el = $('heldName'); el.textContent = s ? itemName(s.id) : ''; el.style.opacity = 1; this.heldT = 2.2; }
      this.hbVer = inv.version; this.hbSel = inv.sel;
    }
    if (this.heldT > 0) { this.heldT -= dt; if (this.heldT <= 0) $('heldName').style.opacity = 0; }
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) $('hint').style.opacity = 0; }
    // 状态条
    const armor = inv.armorPoints();
    const sig = [p.hp, p.hunger, armor, p.air, p.creative, p.headInWater].join(',');
    if (sig !== this.barSig) {
      this.barSig = sig;
      const row = (n, f) => Array.from({ length: n }, (_, i) => `<img src="${f(i)}">`).join('');
      $('hearts').innerHTML = '';
      $('food').innerHTML = p.creative ? '' : row(10, i => hudIcon('food', p.hunger >= (i + 1) * 2 ? 2 : p.hunger === i * 2 + 1 ? 1 : 0));
      $('armorRow').innerHTML = armor && !p.creative ? row(10, i => hudIcon('armor', armor > i * 2 ? 1 : 0)) : '';
      $('airRow').innerHTML = (p.headInWater || p.air < 10) && !p.creative ? row(Math.max(0, p.air), () => hudIcon('air', 1)) : '';
    }
    // 消息淡出
    for (const it of this.logItems) { it.t += dt; it.el.style.opacity = it.t < 9 ? 1 : Math.max(0, 1 - (it.t - 9) / 2); }
    $('log').classList.toggle('open', this.chatOpen);
    // 信息面板与小地图
    this.infoT -= dt;
    if (this.infoT <= 0) { this.infoT = 0.2; this.drawInfo(); }
    this.miniT -= dt;
    if (this.showMinimap && this.miniT <= 0) { this.miniT = 0.25; this.drawMinimap(); }
    $('minimap').classList.toggle('hidden', !this.showMinimap);
    // 面板实时刷新(熔炉进度、合成列表)
    if (this.panel) this.refreshPanel();
    if (this.mapOpen) this.drawMap();
    if (this.showFps) $('fps').textContent = g.debugText(); else $('fps').textContent = '';
    updateRpgHud(this, dt);
  }
  showSkillTip(id) {
    const rpg = this.game.player.rpg;
    let html;
    if (id === 'racial') { const r = RACES[rpg.race].racial; html = `<div class="t" style="color:#8fd0ff">${r.name}</div><div class="s">种族技能 · G · 冷却 ${r.cd} 秒</div><div>${r.desc}</div><div class="d">${RACES[rpg.race].passive}</div>`; }
    else {
      const s = SKILLS[id];
      if (!s) { html = '<div class="d">空技能格:按 K 打开技能书装配</div>'; }
      else {
        const res = RES_INFO[CLASSES[s.cls].res];
        html = `<div class="t" style="color:${s.color}">${s.name}</div><div class="s">${CLASSES[s.cls].name} · ${s.cost ? s.cost + ' ' + res.name : '无消耗'} · 冷却 ${s.cd} 秒</div><div>${s.desc}</div>${rpg.skillUnlocked(id) ? '' : `<div class="r">${s.lvl} 级学会</div>`}`;
      }
    }
    const tt = $('tooltip'); tt.innerHTML = html; tt.classList.remove('hidden'); this.moveFloat();
  }
  openDialog(npc) { this.open('dialog', { npc }); this.game.sfx('chest', npc.x, npc.y); }
  togglePanel(kind) { if (this.panel === kind) this.closePanel(); else this.open(kind); }

  drawInfo() {
    const g = this.game, p = g.player, clk = g.clock, flags = p.inv.infoFlags();
    const dial = $('dial').getContext('2d');
    drawDial(dial, clk);
    const L = [];
    const h = clk.hours;
    const period = h < 4 ? '深夜' : h < 6 ? '黎明' : h < 9 ? '清晨' : h < 11.5 ? '上午' : h < 13.5 ? '正午' : h < 17 ? '下午' : h < 19.5 ? '黄昏' : '夜晚';
    if (flags.has('minute')) L.push(`<span class="k">时刻</span><span class="gold">${clk.fmtTime()}</span> <span class="dim">${period}</span>`);
    else if (flags.has('hour')) L.push(`<span class="k">时刻</span><span class="gold">约 ${clk.fmtTime('hour')}</span> <span class="dim">${period}</span>`);
    else L.push(`<span class="k">时段</span>${period} <span class="dim">(怀表可读时刻)</span>`);
    if (flags.has('calendar')) {
      const [r, s] = clk.sunTimes();
      const fm = v => `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.floor((v % 1) * 60)).padStart(2, '0')}`;
      L.push(`<span class="k">历</span>${clk.fmtDate()}`);
      L.push(`<span class="k">月</span>${clk.moonName()}${clk.blood ? ' · <span style="color:#f55">血月</span>' : ''}`);
      L.push(`<span class="dim">日出 ${fm(r)} · 日落 ${fm(s)} · 昼长 ${clk.daylight().toFixed(1)}h</span>`);
      L.push(`<span class="dim">距${SEASON_NAMES[(clk.season + 1) % 4]}还有 ${clk.seasonDays - clk.dayOfSeason} 天</span>`);
    } else L.push(`<span class="k">日</span>第 ${clk.day + 1} 天 · ${SEASON_NAMES[clk.season]}${clk.blood ? ' · <span style="color:#f55">血月</span>' : ''}`);
    let wl = `<span class="k">天气</span>${weatherName(g, p)}`;
    if (flags.has('weather')) {
      const hrs = clk.weatherLeft / 1000;
      wl += ` <span class="dim">→ ${weatherName(g, p, clk.nextWeather.kind)}(约 ${hrs < 1 ? Math.round(hrs * 60) + ' 分' : hrs.toFixed(1) + ' 小时'}后)</span>`;
    }
    L.push(wl);
    const tx = Math.floor(p.x), ty = Math.floor(p.y - 1), col = g.world.gen.column(tx);
    const t = g.world.temperature(tx, ty);
    const tname = t < -0.2 ? '严寒' : t < 0.15 ? '寒冷' : t < 0.45 ? '凉爽' : t < 0.8 ? '温暖' : '炎热';
    const depth = ty < -110 ? '高空' : ty <= col.s + 4 ? '地表' : ty < col.s + 40 ? '浅层地下' : ty < 260 ? '洞穴层' : ty < HELL_Y ? '深层洞穴' : '地狱';
    L.push(`<span class="k">地带</span>${BIOME_NAMES[col.biome]} · ${depth} · ${tname}`);
    L.push(`<span class="dim">坐标 X ${tx} · 高度 ${-ty + SEA}</span>`);
    if (clk.scale !== 1) L.push(`<span class="gold">时间流速 ×${clk.scale}</span>`);
    if (p.sleeping) L.push(`<span class="gold">正在睡觉…时光飞逝</span>`);
    $('infoLines').innerHTML = L.join('<br>');
  }

  drawMinimap() {
    const g = this.game, c = $('minimap'), ctx = c.getContext('2d'), p = g.player;
    g.map.update(1);
    g.map.draw(ctx, c.width, c.height, p.x, p.y - 1, 1.5, this.markers(true));
  }
  markers(mini) {
    const g = this.game, p = g.player, m = [];
    m.push({ x: p.spawn.x, y: p.spawn.y - 1, color: '#7cf', r: mini ? 2 : 4, label: mini ? '' : '世界出生点' });
    if (p.bedSpawn) m.push({ x: p.bedSpawn.x, y: p.bedSpawn.y - 1, color: '#f66', r: mini ? 2 : 4, label: mini ? '' : '床' });
    if (g.lastDeath) m.push({ x: g.lastDeath.x, y: g.lastDeath.y, color: '#bbb', r: mini ? 2 : 4, label: mini ? '' : '墓碑' });
    m.push({ x: p.x, y: p.y - 1.3, color: '#ff4', r: mini ? 2 : 5, label: mini ? '' : '你' });
    return m;
  }

  // ——————————————————————— 槽位
  paintSlot(el, s, ghost) {
    const img = el.querySelector('img'), n = el.querySelector('.n'), dur = el.querySelector('.dur');
    if (s) {
      const u = iconURL(s.id);
      if (img.getAttribute('src') !== u) img.src = u;
      img.style.display = '';
      n.textContent = s.n > 1 ? s.n : '';
      const it = ITEMS[s.id], max = it?.tool?.dur || it?.armor?.dur;
      if (dur) {
        if (max && s.dur !== undefined && s.dur < max) {
          dur.classList.remove('hidden');
          const k = s.dur / max;
          dur.firstChild.style.width = (k * 100) + '%';
          dur.firstChild.style.background = k > 0.5 ? '#5ad84a' : k > 0.2 ? '#e8c840' : '#e84a3a';
        } else dur.classList.add('hidden');
      }
    } else { img.removeAttribute('src'); img.style.display = 'none'; n.textContent = ''; if (dur) dur.classList.add('hidden'); }
    el.classList.toggle('ghost', !!ghost);
  }
  makeSlot(ref, extraClass = '') {
    const el = document.createElement('div');
    el.className = 'slot ' + extraClass;
    el.innerHTML = `<img class="ic" alt=""><span class="n"></span><div class="dur hidden"><i></i></div>`;
    if (ref.ph) { el.dataset.ph = ref.ph; }
    el.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); this.clickSlot(ref, e.button, e.shiftKey); });
    el.addEventListener('mouseenter', () => { this.hover = ref; this.showTip(ref.get()?.id, ref.get()); });
    el.addEventListener('mouseleave', () => { if (this.hover === ref) this.hover = null; this.hideTip(); });
    el.addEventListener('contextmenu', e => e.preventDefault());
    ref.el = el;
    this.refs.push(ref);
    return el;
  }
  repaintRefs() {
    for (const r of this.refs) { const s = r.get(); this.paintSlot(r.el, s); r.el.classList.toggle('empty', !s); }
    this.paintCursor();
  }

  clickSlot(ref, button, shift) {
    const g = this.game, inv = g.player.inv;
    let s = ref.get(), c = this.cursor;
    play('ui');
    if (this.panel === 'vendor' && ref.inv && s && (shift || button === 2)) {
      const price = sellPrice(s.id) * s.n;
      ref.set(null); g.player.rpg.money += price;
      g.msg(`出售 ${itemName(s.id)}×${s.n},获得 ${fmtMoney(price)}`, '#ddd'); play('pop');
      this.afterChange(); this.vendorRender?.(); return;
    }
    if (shift && s && !ref.creative) { this.quickMove(ref); this.afterChange(); return; }
    if (ref.creative) {
      if (c) { this.cursor = null; }
      else {
        const id = ref.creative, max = maxStack(id);
        if (shift) inv.add(id, max);
        else this.cursor = Inventory.make(id, button === 2 ? 1 : max);
      }
      this.afterChange(); return;
    }
    const max = s ? maxStack(s.id) : c ? maxStack(c.id) : 64;
    const stackable = (a, b) => a && b && a.id === b.id && a.dur === undefined && b.dur === undefined && maxStack(a.id) > 1;
    if (ref.takeOnly) {
      if (!s) return;
      if (!c) { this.cursor = s; ref.set(null); }
      else if (stackable(c, s) && c.n + s.n <= max) { c.n += s.n; ref.set(null); }
      this.afterChange(); return;
    }
    const ok = st => !ref.filter || ref.filter(st);
    if (button === 0) {
      if (!c) { if (s) { this.cursor = s; ref.set(null); } }
      else if (!s) { if (ok(c)) { ref.set(c); this.cursor = null; } }
      else if (stackable(s, c)) { const k = Math.min(c.n, max - s.n); s.n += k; c.n -= k; ref.set(s); if (!c.n) this.cursor = null; }
      else if (ok(c)) { ref.set(c); this.cursor = s; }
    } else if (button === 2) {
      if (!c && s) { const half = Math.ceil(s.n / 2); this.cursor = { ...s, n: half }; s.n -= half; ref.set(s.n ? s : null); }
      else if (c && (!s || (stackable(s, c) && s.n < max)) && ok(c)) {
        ref.set(s ? { ...s, n: s.n + 1 } : { ...c, n: 1 }); c.n--; if (!c.n) this.cursor = null;
      }
    }
    this.afterChange();
  }
  afterChange() { this.game.player.inv.changed(); if (this.panelData?.te) this.game.world.teChanged(this.panelData.x, this.panelData.y); this.repaintRefs(); this.craftSig = ''; }

  invRefs() {
    const inv = this.game.player.inv;
    return Array.from({ length: INV_SIZE }, (_, i) => ({ get: () => inv.slots[i], set: s => { inv.slots[i] = s; inv.changed(); }, idx: i, inv: true }));
  }
  quickMove(ref) {
    const g = this.game, inv = g.player.inv, s = ref.get();
    if (!s) return;
    const it = ITEMS[s.id];
    let targets;
    if (ref.inv) {
      if (this.panel === 'chest') targets = this.containerRefs;
      else if (this.panel === 'furnace') {
        const [rin, rfuel] = this.containerRefs;
        targets = SMELT[s.id] ? [rin] : fuelOf(s.id) ? [rfuel] : [];
      } else if (it?.armor && !inv.armor[it.armor.slot]) { inv.armor[it.armor.slot] = s; ref.set(null); return; }
      else targets = this.allInv.filter(r => (ref.idx < 9 ? r.idx >= 9 : r.idx < 9));
    } else targets = this.allInv.slice(9).concat(this.allInv.slice(0, 9));
    let left = { ...s };
    for (const pass of [0, 1]) for (const t of targets) {
      if (!left.n) break;
      if (t.filter && !t.filter(left)) continue;
      const cur = t.get();
      const max = maxStack(left.id);
      if (pass === 0 && cur && cur.id === left.id && cur.dur === undefined && left.dur === undefined && cur.n < max) { const k = Math.min(left.n, max - cur.n); t.set({ ...cur, n: cur.n + k }); left.n -= k; }
      if (pass === 1 && !cur) { t.set({ ...left }); left.n = 0; }
    }
    ref.set(left.n ? left : null);
  }
  dropCursor() {
    if (!this.cursor) return;
    const p = this.game.player;
    this.game.dropItem(p.x + p.facing * 0.8, p.y - 1.6, this.cursor.id, this.cursor.n, { vx: p.facing * 7, vy: -4, pickDelay: 1.5, dur: this.cursor.dur });
    this.cursor = null; this.paintCursor();
  }
  paintCursor() {
    const el = $('cursorItem');
    if (!this.cursor) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = `<img class="ic" src="${iconURL(this.cursor.id)}"><b>${this.cursor.n > 1 ? this.cursor.n : ''}</b>`;
    this.moveFloat();
  }
  moveFloat() {
    const el = $('cursorItem');
    el.style.left = (this.mx - 18) + 'px'; el.style.top = (this.my - 18) + 'px';
    const tt = $('tooltip');
    if (!tt.classList.contains('hidden')) {
      const w = tt.offsetWidth, h = tt.offsetHeight;
      tt.style.left = Math.min(window.innerWidth - w - 6, this.mx + 16) + 'px';
      tt.style.top = Math.min(window.innerHeight - h - 6, this.my + 16) + 'px';
    }
  }
  showTip(id, stack) {
    if (!id || !ITEMS[id]) { this.hideTip(); return; }
    const it = ITEMS[id], L = [`<div class="t">${esc(it.name)}</div>`];
    const kind = { block: '方块', wall: '背景墙', tool: '工具', material: '材料', food: '食物', armor: '盔甲', bow: '远程武器', bucket: '容器' }[it.kind] || '物品';
    L.push(`<div class="s">${it.tool?.type === 'sword' ? '近战武器' : kind}${it.info ? ' · 信息饰品' : ''}</div>`);
    if (it.tool?.type === 'pick') L.push(`<div>挖掘等级 ${it.tool.tier} · 速度 ${it.tool.speed}</div>`);
    else if (it.tool && ['axe', 'shovel', 'hoe', 'hammer'].includes(it.tool.type)) L.push(`<div>效率 ${it.tool.speed}${it.tool.type === 'hammer' ? ' · 可敲除背景墙' : it.tool.type === 'hoe' ? ' · 右键耕地' : ''}</div>`);
    if (it.dmg && (it.tool || it.kind === 'bow')) L.push(`<div>${it.kind === 'bow' ? '最大伤害 ' + (it.dmg + 3) : '伤害 ' + it.dmg}</div>`);
    if (it.tool?.fire) L.push('<div class="g">攻击使敌人着火</div>');
    if (it.armor) L.push(`<div>防御 +${it.armor.pts}</div>`);
    if (it.food) L.push(`<div class="g">饱食度 +${it.food.hunger}${it.food.regen ? ' · 快速回血' : ''}${it.food.sick ? '</div><div class="r">可能导致恶心' : ''}</div>`);
    if (it.place && it.kind !== 'block') L.push('<div class="d">可种植</div>');
    if (it.kind === 'wall') L.push('<div class="d">右键放置在背景;需锤子拆除</div>');
    if (fuelOf(id)) L.push(`<div class="d">燃料:可冶炼 ${(fuelOf(id) / SMELT_TICKS).toFixed(1)} 件</div>`);
    if (SMELT[id]) L.push(`<div class="d">可冶炼 → ${itemName(SMELT[id])}</div>`);
    if (it.desc) L.push(`<div class="d">${esc(it.desc)}</div>`);
    const max = it.tool?.dur || it.armor?.dur;
    if (max && stack?.dur !== undefined) L.push(`<div class="dim">耐久 ${stack.dur} / ${max}</div>`);
    const tt = $('tooltip');
    tt.innerHTML = L.join('');
    tt.classList.remove('hidden');
    this.moveFloat();
  }
  hideTip() { $('tooltip').classList.add('hidden'); }

  // ——————————————————————— 面板
  open(kind, data = {}) {
    if (this.menuOpen) return;
    this.panel = kind; this.panelData = data; this.craftSig = '';
    if (kind === 'inventory' && this.game.player.creative && !data.station) this.tab = this.tab || 'craft';
    $('panelWrap').classList.remove('hidden');
    this.buildPanel();
    play('ui');
  }
  closePanel() {
    if (this.cursor && this.game) {
      const left = this.game.player.inv.add(this.cursor.id, this.cursor.n, this.cursor.dur);
      if (left) { this.cursor.n = left; this.dropCursor(); }
      this.cursor = null;
    }
    this.panel = null; this.panelData = null;
    $('panelWrap').classList.add('hidden');
    this.hideTip(); this.paintCursor();
  }
  toggleInventory() { if (this.panel) this.closePanel(); else this.open('inventory'); }

  buildPanel() {
    const g = this.game, p = g.player, inv = p.inv, root = $('panel');
    this.refs = []; root.innerHTML = '';
    this.allInv = this.invRefs();
    if (['dialog', 'skills', 'quests', 'fusion'].includes(this.panel)) {
      ({ dialog: buildDialog, skills: buildSkills, quests: buildQuests, fusion: buildFusion })[this.panel](this, root);
      this.repaintRefs();
      return;
    }
    if (this.panel === 'vendor') buildVendor(this, root);
    // 左:容器(箱子 / 熔炉)
    const left = document.createElement('div');
    left.style.display = 'flex'; left.style.flexDirection = 'column'; left.style.gap = '10px';
    if (this.panel === 'chest') {
      const te = this.panelData.te, box = document.createElement('div');
      box.className = 'box';
      box.innerHTML = `<h3>${this.panelData.title || '箱子'}<span><button class="mbtn small" data-a="take">全部拿取</button><button class="mbtn small" data-a="store">全部存入</button></span></h3>`;
      const grid = document.createElement('div'); grid.className = 'grid';
      this.containerRefs = te.items.map((_, i) => ({ get: () => te.items[i], set: s => { te.items[i] = s; } }));
      for (const r of this.containerRefs) grid.appendChild(this.makeSlot(r));
      box.appendChild(grid);
      box.querySelector('[data-a=take]').onclick = () => { for (const r of this.containerRefs) { const s = r.get(); if (s) { const l = inv.add(s.id, s.n, s.dur); r.set(l ? { ...s, n: l } : null); } } this.afterChange(); };
      box.querySelector('[data-a=store]').onclick = () => { for (const r of this.allInv.slice(9)) { if (r.get()) this.quickMove(r); } this.afterChange(); };
      left.appendChild(box);
    } else if (this.panel === 'furnace') {
      const te = this.panelData.te, box = document.createElement('div');
      box.className = 'box';
      box.innerHTML = '<h3>熔炉<span class="dim" style="font-size:12px;color:#aab">每件 10 秒(世界时间)</span></h3>';
      const f = document.createElement('div'); f.className = 'furn';
      const rin = { get: () => te.in, set: s => { te.in = s; }, ph: '原料' };
      const rfuel = { get: () => te.fuel, set: s => { te.fuel = s; }, filter: s => fuelOf(s.id) > 0, ph: '燃料' };
      const rout = { get: () => te.out, set: s => { te.out = s; }, takeOnly: true };
      this.containerRefs = [rin, rfuel, rout];
      const fire = document.createElement('div'); fire.className = 'fire'; fire.innerHTML = '<i></i>';
      const arr = document.createElement('div'); arr.className = 'arrow'; arr.innerHTML = '<i></i>';
      const place = (el, col, row) => { el.style.gridColumn = col; el.style.gridRow = row; f.appendChild(el); };
      place(this.makeSlot(rin), 1, 1); place(fire, 1, 2); place(this.makeSlot(rfuel), 1, 3);
      place(arr, 2, '1 / span 3'); place(this.makeSlot(rout, 'out'), 3, '1 / span 3');
      this.furnEls = { fire: fire.firstChild, arr: arr.firstChild };
      box.appendChild(f);
      const note = document.createElement('div'); note.className = 'mnote'; note.id = 'furnNote';
      box.appendChild(note);
      left.appendChild(box);
    }
    // 中:背包
    const box = document.createElement('div'); box.className = 'box';
    box.innerHTML = `<h3>背包<span class="dim" style="font-size:12px;color:#aab">Shift+点击快速移动 · 数字键交换到快捷栏</span></h3>`;
    const row = document.createElement('div'); row.className = 'invRow';
    const armorCol = document.createElement('div'); armorCol.className = 'armorCol';
    ['头盔', '胸甲', '护腿', '靴子'].forEach((nm, i) => {
      armorCol.appendChild(this.makeSlot({ get: () => inv.armor[i], set: s => { inv.armor[i] = s; inv.changed(); }, filter: s => ITEMS[s.id]?.armor?.slot === i, ph: nm }));
    });
    armorCol.appendChild(this.makeSlot({ get: () => inv.weapon, set: s => { inv.weapon = s; inv.changed(); }, filter: s => !!(ITEMS[s.id]?.tool && ['sword', 'staff', 'bow', 'axe', 'pick', 'hammer', 'shovel'].includes(ITEMS[s.id].tool.type) || ITEMS[s.id]?.kind === 'bow'), ph: '武器' }, 'wpn'));
    row.appendChild(armorCol);
    const right = document.createElement('div');
    const grid = document.createElement('div'); grid.className = 'grid';
    for (let i = 9; i < INV_SIZE; i++) grid.appendChild(this.makeSlot(this.allInv[i]));
    const hb = document.createElement('div'); hb.className = 'grid hb';
    for (let i = 0; i < 9; i++) hb.appendChild(this.makeSlot(this.allInv[i]));
    right.appendChild(grid); right.appendChild(hb);
    row.appendChild(right);
    const stat = document.createElement('div'); stat.className = 'statCol'; stat.id = 'statCol';
    row.appendChild(stat);
    box.appendChild(row);
    left.appendChild(box);
    root.appendChild(left);
    // 右:合成 / 创造物品库
    if (this.panel === 'inventory') {
      const cbox = document.createElement('div'); cbox.className = 'box craft';
      const creative = p.creative;
      cbox.innerHTML = `<h3><span class="tabs"><span class="tab ${this.tab === 'craft' ? 'on' : ''}" data-t="craft">合成</span>${creative ? `<span class="tab ${this.tab === 'all' ? 'on' : ''}" data-t="all">物品库</span>` : ''}</span></h3>
        <div class="opts"><input type="text" id="craftSearch" placeholder="搜索物品…" value="${esc(this.search)}">${this.tab === 'craft' ? `<label><input type="checkbox" id="onlyC" ${this.onlyCraftable ? 'checked' : ''}> 仅可合成</label>` : ''}</div>
        <div class="stations" id="stations"></div><div class="${this.tab === 'all' ? 'cgrid' : 'rlist'}" id="rlist"></div>`;
      cbox.querySelectorAll('.tab').forEach(t => t.onclick = () => { this.tab = t.dataset.t; this.buildPanel(); });
      const sInput = cbox.querySelector('#craftSearch');
      sInput.addEventListener('input', () => { this.search = sInput.value; this.craftSig = ''; this.refreshPanel(true); });
      sInput.addEventListener('keydown', e => e.stopPropagation());
      const oc = cbox.querySelector('#onlyC');
      if (oc) oc.onchange = () => { this.onlyCraftable = oc.checked; this.craftSig = ''; };
      root.appendChild(cbox);
      if (this.tab === 'all' && creative) this.buildCreative();
    }
    this.repaintRefs();
    this.refreshPanel(true);
  }

  buildCreative() {
    const list = $('rlist');
    list.innerHTML = '';
    const q = this.search.trim();
    for (const it of ITEM_LIST) {
      if (q && !it.name.includes(q) && !it.key.includes(q)) continue;
      const ref = { get: () => ({ id: it.key, n: 1 }), set: () => {}, creative: it.key };
      const el = this.makeSlot(ref);
      list.appendChild(el);
    }
    this.repaintRefs();
  }

  refreshPanel(force) {
    const g = this.game, p = g.player;
    if (this.panel === 'furnace' && this.furnEls) {
      const te = this.panelData.te;
      if (g.world.fg(this.panelData.x, this.panelData.y) !== BLOCKS.find(b => b.key === 'furnace').id) { this.closePanel(); return; }
      this.furnEls.fire.style.height = (te.burn > 0 ? Math.min(1, te.burn / (te.burnMax || 1)) * 100 : 0) + '%';
      this.furnEls.arr.style.width = ((te.cook || 0) / SMELT_TICKS * 100) + '%';
      const sig = JSON.stringify([te.in, te.fuel, te.out]);
      if (sig !== this.furnSig) { this.furnSig = sig; this.repaintRefs(); }
      const note = $('furnNote');
      if (note) note.textContent = te.in && !SMELT[te.in.id] ? '这件物品无法冶炼。' : te.in && !te.fuel && !(te.burn > 0) ? '需要燃料:煤炭、木炭、木材……' : te.burn > 0 ? '正在燃烧…离开后熔炉仍会按世界时间继续工作。' : '';
    }
    if ((this.panel === 'dialog' || this.panel === 'vendor') && this.panelData?.npc) {
      const n = this.panelData.npc;
      if (n.dead || Math.hypot(n.x - p.x, n.y - p.y) > 9) { this.closePanel(); return; }
      if (this.panel === 'vendor' && (this.vendorT = (this.vendorT || 0) + 1) % 20 === 0) this.vendorRender?.();
    }
    if (this.panel === 'chest' && this.panelData) {
      const { x, y } = this.panelData;
      if (Math.hypot(p.x - x - 0.5, p.y - 1 - y) > 8 || !g.world.getTe(x, y)) { this.closePanel(); return; }
    }
    const stat = $('statCol');
    if (stat) {
      const st = p.stats;
      const rpg = p.rpg, w = rpg.weaponStats();
      stat.innerHTML = `<b>${esc(rpg.fullName)}</b><br><span style="color:${CLASSES[rpg.cls].color}">${RACES[rpg.race].name} · ${CLASSES[rpg.cls].name}${rpg.cls2 ? '·' + CLASSES[rpg.cls2].name : ''}</span><br>${rpg.level} 级 · ${p.creative ? '创造' : rpg.hardcore ? '硬核' : '生存'}<br>生命 ${Math.ceil(p.hp)}/${p.maxHp} · 护甲 ${p.inv.armorPoints()}<br>武器伤害 ${Math.round(w.dmg * rpg.meleeMult())}<br>法术强度 +${w.spell} ×${rpg.spellMult().toFixed(2)}<br>饱食 ${p.hunger}/20<br><span class="gold">${fmtMoney(rpg.money)}</span><br><br>击败 ${st.kills} · 死亡 ${st.deaths}<br>挖掘 ${st.mined} · 放置 ${st.placed}`;
    }
    if (this.panel !== 'inventory' || this.tab === 'all') { if (this.tab === 'all' && force) this.buildCreative(); return; }
    // 合成列表
    const stations = g.nearStations();
    const sig = p.inv.version + '|' + [...stations].join(',') + '|' + this.onlyCraftable + '|' + this.search;
    if (sig === this.craftSig && !force) return;
    this.craftSig = sig;
    $('stations').innerHTML = `附近:<span class="${stations.has('table') ? 'on' : ''}">工作台${stations.has('table') ? '✓' : '✗'}</span> · <span class="${stations.has('furnace') ? 'on' : ''}">熔炉${stations.has('furnace') ? '✓' : '✗'}</span>`;
    const list = $('rlist'); list.innerHTML = '';
    const q = this.search.trim();
    const rows = [];
    for (const r of RECIPES) {
      const it = ITEMS[r.out];
      if (q && !it.name.includes(q) && !Object.keys(r.in).some(k => itemName(k).includes(q))) continue;
      if (r.faction && r.faction !== g.faction()) continue;
      const stOk = !r.st || stations.has(r.st);
      const can = stOk && this.canCraft(r);
      if (this.onlyCraftable && !can) continue;
      rows.push([r, can, stOk]);
    }
    rows.sort((a, b) => b[1] - a[1]);
    for (const [r, can, stOk] of rows.slice(0, 160)) {
      const it = ITEMS[r.out];
      const el = document.createElement('div');
      el.className = 'rec' + (can ? '' : ' no');
      const ins = Object.entries(r.in).map(([k, n]) => {
        const shown = TAGS[k] ? TAGS[k][0] : k;
        const have = g.player.inv.count(k);
        return `<span class="in ${have >= n ? '' : 'miss'}" title="${esc(TAGS[k] ? TAGS[k].map(itemName).join(' / ') : itemName(k))}"><img class="ic" src="${iconURL(shown)}"><b>${n}</b></span>`;
      }).join('');
      el.innerHTML = `<img class="ic" src="${iconURL(r.out)}"><div class="nm">${esc(it.name)}${r.n > 1 ? ' ×' + r.n : ''}<small>${r.st === 'table' ? (stOk ? '工作台' : '需要工作台') : '徒手'}</small></div><div class="ins">${ins}</div>`;
      el.addEventListener('mousedown', e => { e.preventDefault(); if (can) this.craft(r, e.shiftKey); });
      el.addEventListener('mouseenter', () => this.showTip(r.out));
      el.addEventListener('mouseleave', () => this.hideTip());
      list.appendChild(el);
    }
    if (!rows.length) list.innerHTML = `<div class="mnote">${this.onlyCraftable ? '当前材料无法合成任何物品。<br>取消勾选“仅可合成”查看全部配方;靠近工作台可解锁更多配方。' : '没有匹配的配方。'}</div>`;
  }
  canCraft(r, times = 1) {
    const inv = this.game.player.inv;
    return Object.entries(r.in).every(([k, n]) => inv.count(k) >= n * times);
  }
  craft(r, shift) {
    const inv = this.game.player.inv, max = maxStack(r.out);
    let times = 1;
    if (shift) { times = 0; while (this.canCraft(r, times + 1) && (times + 1) * r.n <= Math.max(max, r.n)) times++; }
    if (!times || !this.canCraft(r, times)) return;
    const c = this.cursor;
    if (!shift && c && !(c.id === r.out && c.dur === undefined && c.n + r.n <= max)) return;
    for (const [k, n] of Object.entries(r.in)) inv.remove(k, n * times);
    if (shift) { const left = inv.add(r.out, r.n * times); if (left) this.game.dropItem(this.game.player.x, this.game.player.y - 1, r.out, left); }
    else if (c) c.n += r.n;
    else this.cursor = Inventory.make(r.out, r.n);
    this.game.sfx('craft');
    this.game.onCraft?.(r.out);
    this.afterChange();
  }

  // 数字键:悬停槽位与快捷栏交换
  hotkeySwap(n) {
    const r = this.hover;
    if (!r || r.creative || r.takeOnly === undefined && false) return false;
    if (r.creative) return false;
    const inv = this.game.player.inv, a = r.get(), b = inv.slots[n];
    if (r.inv && r.idx === n) return true;
    if (b && r.filter && !r.filter(b)) return true;
    if (r.takeOnly && b) return true;
    r.set(b); inv.slots[n] = a; this.afterChange();
    return true;
  }

  // ——————————————————————— 聊天 / 指令
  openChat(prefix = '') {
    this.chatOpen = true;
    $('chatBox').classList.remove('hidden');
    const i = $('chatInput'); i.value = prefix; setTimeout(() => i.focus(), 0);
    input.keys.clear();
  }
  closeChat() {
    this.lastChat = $('chatInput').value || this.lastChat;
    this.chatOpen = false; $('chatBox').classList.add('hidden'); $('chatInput').blur();
  }

  // ——————————————————————— 全屏地图
  toggleMap() {
    this.mapOpen = !this.mapOpen;
    $('mapView').classList.toggle('hidden', !this.mapOpen);
    if (this.mapOpen) {
      const p = this.game.player;
      this.mapView.x = p.x; this.mapView.y = p.y;
      this.game.map.requestAll();
      const c = $('mapCanvas'); c.width = window.innerWidth; c.height = window.innerHeight;
    }
  }
  drawMap() {
    const c = $('mapCanvas'), ctx = c.getContext('2d'), v = this.mapView, g = this.game;
    g.map.update(3);
    g.map.draw(ctx, c.width, c.height, v.x, v.y, v.ppt, this.markers(false));
    let cur = '';
    if (this.mapMouse) {
      const wx = Math.floor(v.x + (this.mapMouse.x - c.width / 2) / v.ppt), wy = Math.floor(v.y + (this.mapMouse.y - c.height / 2) / v.ppt);
      cur = `<br>光标:X ${wx} · 高度 ${-wy}`;
    }
    $('mapInfo').innerHTML = `<b>世界地图</b> · 已探索 ${g.map.explored.size} 个区块(每区块 32×32 格)<br>拖拽平移 · 滚轮缩放 · M / Esc 关闭${cur}`;
  }
}

function weatherName(g, p, kind = g.clock.weather) {
  const cold = g.world.temperature(Math.floor(p.x), Math.floor(p.y)) < 0.15;
  if (kind === 'rain') return cold ? '下雪' : '下雨';
  if (kind === 'thunder') return cold ? '暴风雪' : '雷暴';
  return WEATHER_NAMES[kind];
}

// 时钟盘:旋转的日月盘,白昼扇区宽度随季节昼长变化
function drawDial(ctx, clk) {
  const W = 128, H = 68, cx = 64, cy = 64, R = 58;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, cy); ctx.clip();
  ctx.fillStyle = '#0b1230'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  const ang = (clk.hours - 12) / 24 * Math.PI * 2;
  const dayHalf = clk.daylight() / 24 * Math.PI;
  const base = -Math.PI / 2 - ang;
  const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, R);
  grad.addColorStop(0, '#9ad0ff'); grad.addColorStop(1, '#3a7ad8');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, base - dayHalf, base + dayHalf); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,170,90,0.55)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, base + s * dayHalf - 0.12, base + s * dayHalf + 0.12); ctx.closePath(); ctx.fill(); }
  // 星点
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 14; i++) { const a = base + Math.PI + (i - 7) * 0.18, r = 22 + (i * 37 % 30); ctx.fillRect(cx + Math.cos(a) * r | 0, cy + Math.sin(a) * r | 0, 1, 1); }
  // 太阳 / 月亮
  const sx = cx + Math.cos(base) * (R - 14), sy = cy + Math.sin(base) * (R - 14);
  ctx.fillStyle = '#ffe070'; ctx.fillRect(sx - 6, sy - 6, 12, 12); ctx.fillStyle = '#fff8c0'; ctx.fillRect(sx - 4, sy - 4, 8, 8);
  const mx = cx + Math.cos(base + Math.PI) * (R - 14), my = cy + Math.sin(base + Math.PI) * (R - 14);
  ctx.fillStyle = clk.blood ? '#ff5a4a' : '#e8eeff'; ctx.fillRect(mx - 5, my - 5, 10, 10);
  const ph = clk.moon;
  if (ph) { const k = ph <= 4 ? ph / 4 : (8 - ph) / 4, w2 = Math.round(10 * k); ctx.fillStyle = '#0b1230'; ctx.fillRect(ph <= 4 ? mx - 5 : mx + 5 - w2, my - 5, w2, 10); }
  ctx.restore();
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(0, cy, W, H - cy);
  ctx.fillStyle = '#5cc23e'; ctx.fillRect(4, cy - 2, W - 8, 2);
  ctx.strokeStyle = '#c8d4ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 0); ctx.stroke();
}
