// 菜单类场景:标题、键位设置、操作说明/出招表、选人(LF2 式 8 格)、对局设置、结算。
import { W, H, TEAM_COLORS, TEAM_NAMES, DIFFICULTIES, KEY_NAMES } from './config.js';
import { keyboard, saveBindings, resetBindings, codeLabel } from './input.js';
import { text, panel, menuItem, dimScreen } from './ui.js';
import { session, saveSession, MODES } from './session.js';
import { CHARS, ROSTER, HIDDEN } from './roster.js';
import { portrait } from './hud.js';
import { spriteFor } from './render.js';
import { ORX, ORY } from './skeleton.js';
import { BG_LIST } from './bg.js';
import { STAGES } from './stages.js';
import { battleScene } from './battle.js';
import audio from './audio.js';
import { makeCanvas, pick } from './util.js';

export const scenes = {};
let current = null;
export function setScene(s, arg) { if (current && current.exit) current.exit(); current = s; if (s.enter) s.enter(arg); }
export function getScene() { return current; }

// ---------------------------------------------------------------- 通用背景
let menuBg = null;
function drawMenuBg(ctx, t) {
  if (!menuBg) {
    menuBg = makeCanvas(W, H);
    const g = menuBg.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#02031a'); gr.addColorStop(0.55, '#0d1650'); gr.addColorStop(1, '#2a1030');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.7})`; g.fillRect(Math.random() * W, Math.random() * H * 0.7, 1, 1); }
    g.fillStyle = '#05061a';
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, H - 90 - Math.sin(x * 0.013) * 30 - Math.sin(x * 0.041) * 12);
    g.lineTo(W, H); g.fill();
  }
  ctx.drawImage(menuBg, 0, 0);
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#4060ff';
  for (let i = 0; i < 6; i++) { const y = (t * (0.6 + i * 0.2) + i * 90) % (H + 40) - 20; ctx.fillRect(0, H - y, W, 1); }
  ctx.globalAlpha = 1;
}
function logo(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.font = 'bold italic 52px "Arial Black", Arial, sans-serif'; ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000'; ctx.lineWidth = 10; ctx.strokeText('LITTLE BRAWLERS', 0, 0);
  const g = ctx.createLinearGradient(0, -44, 0, 6);
  g.addColorStop(0, '#fff6b0'); g.addColorStop(0.45, '#ffc020'); g.addColorStop(0.5, '#e06000'); g.addColorStop(1, '#ffb020');
  ctx.fillStyle = g; ctx.fillText('LITTLE BRAWLERS', 0, 0);
  ctx.font = 'bold italic 76px "Arial Black", Arial, sans-serif';
  ctx.strokeStyle = '#000'; ctx.lineWidth = 12; ctx.strokeText('2', 0, 74);
  const g2 = ctx.createLinearGradient(0, 10, 0, 76);
  g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.5, '#60a0ff'); g2.addColorStop(1, '#1030c0');
  ctx.fillStyle = g2; ctx.fillText('2', 0, 74);
  ctx.restore();
}

function fighterPose(ctx, id, pic, x, y, facing = 1, k = 1) {
  const def = CHARS[id];
  if (!def) return;
  const s = spriteFor(def, pic);
  ctx.save(); ctx.translate(x, y); ctx.scale(facing * k, k); ctx.drawImage(s.canvas, -ORX, -ORY); ctx.restore();
}

// ---------------------------------------------------------------- 标题
scenes.title = {
  name: 'title',
  items: ['Game Start', 'Control Settings', 'How to Play', 'Demo'],
  enter() { this.sel = 0; this.t = 0; this.idle = 0; audio.music('title'); },
  onUi(e) {
    this.idle = 0;
    if (e.ev === 'up') { this.sel = (this.sel + this.items.length - 1) % this.items.length; audio.sfx('menu_move'); }
    else if (e.ev === 'down') { this.sel = (this.sel + 1) % this.items.length; audio.sfx('menu_move'); }
    else if (e.ev === 'ok' || e.ev === 'attack') {
      audio.sfx('menu_ok');
      if (this.sel === 0) setScene(scenes.select);
      else if (this.sel === 1) setScene(scenes.controls);
      else if (this.sel === 2) setScene(scenes.help);
      else startDemo();
    }
  },
  update() { this.t++; if (++this.idle > 30 * 40) startDemo(); },
  render(ctx) {
    drawMenuBg(ctx, this.t);
    const bob = Math.sin(this.t * 0.08) * 3;
    logo(ctx, W / 2, 130 + bob);
    text(ctx, 'a Little Fighter 2 gameplay tribute · 原创角色 / 美术 / 音乐', W / 2, 228, { align: 'center', size: 12, color: '#9fb0ff', bold: false });
    // 两侧摆拍角色
    const r = ROSTER;
    if (r.length) {
      fighterPose(ctx, r[0], 'cast1', 150, 470, 1, 1.6);
      fighterPose(ctx, r[Math.min(1, r.length - 1)], 'kickHi', 650, 470, -1, 1.6);
    }
    this.items.forEach((s, i) => menuItem(ctx, s, W / 2, 300 + i * 40, i === this.sel, { size: 22 }));
    text(ctx, '↑↓ 选择  Enter / 攻击键 确定   P1 默认:WASD 移动  J 攻击  K 跳  L 防御', W / 2, H - 18, { align: 'center', size: 12, color: '#8890c0', bold: false });
  },
};

function startDemo() {
  const pool = ROSTER.slice();
  session.mode = 'demo';
  const n = 4 + Math.floor(Math.random() * 3);
  session.humans.forEach((h) => { h.active = false; });
  session.coms = Array.from({ length: n }, (_, i) => ({ charId: pick(pool), team: 0 }));
  setScene(battleScene, { mode: 'demo', bg: 'random', difficulty: 2 });
}

// ---------------------------------------------------------------- 键位设置
scenes.controls = {
  name: 'controls',
  enter() { this.p = 0; this.k = 0; this.wait = false; this.t = 0; },
  onUi(e) {
    if (this.wait) return;
    const rows = KEY_NAMES.length + 2;
    if (e.ev === 'back') { saveBindings(); setScene(scenes.title); audio.sfx('menu_back'); return; }
    if (e.code === 'ArrowUp') { this.k = (this.k + rows - 1) % rows; audio.sfx('menu_move'); }
    else if (e.code === 'ArrowDown') { this.k = (this.k + 1) % rows; audio.sfx('menu_move'); }
    else if (e.code === 'ArrowLeft') { this.p = (this.p + 3) % 4; audio.sfx('menu_move'); }
    else if (e.code === 'ArrowRight') { this.p = (this.p + 1) % 4; audio.sfx('menu_move'); }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (this.k === KEY_NAMES.length) { resetBindings(); audio.sfx('menu_ok'); return; }
      if (this.k === KEY_NAMES.length + 1) { resetBindings(true); audio.sfx('menu_ok'); return; }
      this.wait = true;
      audio.sfx('menu_ok');
      keyboard.listening = (code) => {
        this.wait = false;
        if (code !== 'Escape') keyboard.bindings[this.p][KEY_NAMES[this.k]] = code;
        saveBindings();
      };
    }
  },
  update() { this.t++; },
  render(ctx) {
    drawMenuBg(ctx, this.t);
    text(ctx, 'CONTROL SETTINGS', W / 2, 54, { align: 'center', size: 28, color: '#ffd040' });
    panel(ctx, 40, 76, W - 80, 400);
    const labels = ['Up', 'Down', 'Left', 'Right', 'Attack', 'Jump', 'Defend'];
    for (let p = 0; p < 4; p++) {
      const x = 210 + p * 140;
      text(ctx, `Player ${p + 1}`, x, 112, { align: 'center', size: 16, color: p === this.p ? '#ffe060' : '#aab4ff' });
    }
    labels.forEach((l, i) => {
      const y = 150 + i * 36;
      text(ctx, l, 70, y, { size: 16, color: '#dfe6ff' });
      for (let p = 0; p < 4; p++) {
        const x = 210 + p * 140;
        const sel = p === this.p && i === this.k;
        if (sel) { ctx.fillStyle = this.wait ? 'rgba(255,80,80,0.5)' : 'rgba(255,200,40,0.35)'; ctx.fillRect(x - 60, y - 20, 120, 28); }
        text(ctx, sel && this.wait ? '按下新键…' : codeLabel(keyboard.bindings[p][KEY_NAMES[i]]), x, y, { align: 'center', size: 15, color: sel ? '#fff' : '#c8d0ff' });
      }
    });
    const ry = 150 + KEY_NAMES.length * 36;
    menuItem(ctx, '恢复默认键位(WASD + JKL)', W / 2 - 150, ry + 4, this.k === KEY_NAMES.length, { size: 15, w: 280 });
    menuItem(ctx, '套用 LF2 原版键位', W / 2 + 150, ry + 4, this.k === KEY_NAMES.length + 1, { size: 15, w: 280 });
    text(ctx, '方向键 选择   Enter 改键 / 确定   Esc 返回(自动保存)', W / 2, H - 30, { align: 'center', size: 13, color: '#8890c0', bold: false });
  },
};

// ---------------------------------------------------------------- 操作说明 / 出招表
scenes.help = {
  name: 'help',
  enter() { this.i = 0; this.t = 0; },
  list() { return session.unlocked ? ROSTER.concat(HIDDEN) : ROSTER; },
  onUi(e) {
    const L = this.list();
    if (e.ev === 'back' || e.ev === 'jump') { setScene(scenes.title); audio.sfx('menu_back'); }
    else if (e.ev === 'left') { this.i = (this.i + L.length - 1) % L.length; audio.sfx('menu_move'); }
    else if (e.ev === 'right' || e.ev === 'ok' || e.ev === 'attack') { this.i = (this.i + 1) % L.length; audio.sfx('menu_move'); }
  },
  update() { this.t++; },
  render(ctx) {
    drawMenuBg(ctx, this.t);
    text(ctx, 'HOW TO PLAY', W / 2, 40, { align: 'center', size: 26, color: '#ffd040' });
    panel(ctx, 20, 56, 360, 470);
    const lines = [
      ['移动', '方向键(上下 = 纵深)'], ['跑步', '快速双击 ← 或 →'], ['攻击', 'A(连按出连击)'], ['跳跃', 'J;跑步中 J = 冲跳'],
      ['防御', 'D(正面格挡,连挨会破防)'], ['跳踢 / 冲踢', '空中按 A'], ['跑攻 / 翻滚', '跑步中按 A / D'],
      ['重拳', '对晕眩 / 破防的敌人按 A'], ['抓人', '走向晕眩敌人;A 揍,方向+A 摔'],
      ['空翻卸力', '被击飞下落时按 J'], ['拾取武器', '靠近物品按 A'], ['挥砍 / 投掷', 'A 挥砍;方向+A 投掷'],
      ['喝饮料', '拿着牛奶(HP)/ 啤酒(MP)按 A'], ['必杀技', 'D + 方向 + A 或 J(见右侧)'],
    ];
    lines.forEach(([a, b], i) => { text(ctx, a, 36, 86 + i * 30, { size: 14, color: '#ffe080' }); text(ctx, b, 130, 86 + i * 30, { size: 13, color: '#dfe6ff', bold: false }); });
    const L = this.list();
    const def = CHARS[L[this.i]];
    panel(ctx, 392, 56, 382, 470);
    if (def) {
      ctx.drawImage(portrait(def, 88, 96, 4.2), 404, 70);
      text(ctx, def.name, 506, 110, { size: 24, color: '#fff' });
      text(ctx, def.role, 506, 136, { size: 14, color: '#9fd0ff', bold: false });
      const yEnd = wrap(ctx, def.desc, 404, 182, 360, 15, { size: 12, color: '#c8d0ff', bold: false });
      const y0 = Math.max(222, yEnd + 26);
      def.moveList.forEach(([cmd, nm, mp], i) => {
        const y = y0 + i * 26;
        text(ctx, cmd, 410, y, { size: 15, color: '#ffe060' });
        text(ctx, nm, 480, y, { size: 13, color: '#fff', bold: false });
        if (mp) text(ctx, `MP ${mp}`, 760, y, { size: 12, color: '#8fb0ff', align: 'right' });
      });
    }
    text(ctx, `← → 切换角色 (${this.i + 1}/${L.length})   Esc 返回   D = 防御  > = 前  ^ = 上  v = 下`, W / 2, H - 12, { align: 'center', size: 12, color: '#8890c0', bold: false });
  },
};
function wrap(ctx, s, x, y, w, lh, o) {
  ctx.font = `${o.size}px Arial`;
  let line = '', yy = y;
  for (const ch of s) {
    if (ctx.measureText(line + ch).width > w) { text(ctx, line, x, yy, o); line = ch; yy += lh; } else line += ch;
  }
  if (line) text(ctx, line, x, yy, o);
  return yy;
}

// ---------------------------------------------------------------- 选人
const CHEAT = ['KeyL', 'KeyF', 'Digit2', 'Period', 'KeyN', 'KeyE', 'KeyT'];
scenes.select = {
  name: 'select',
  enter() {
    this.t = 0;
    this.phase = 'join';
    this.slots = [0, 1, 2, 3].map((i) => ({ st: 'off', ci: i % this.pool().length, team: 0 }));
    // 保留上次选择
    session.humans.forEach((h, i) => { if (h.active && h.charId) { const ci = this.pool().indexOf(h.charId); this.slots[i].ci = ci >= 0 ? ci : 0; this.slots[i].team = h.team; } });
    this.comN = 1; this.coms = []; this.ci = 0;
    this.cheatI = 0;
    audio.music('select');
  },
  pool() { return (session.unlocked ? ROSTER.concat(HIDDEN) : ROSTER).concat(['random']); },
  humansReady() { return this.slots.filter((s) => s.st === 'ready'); },
  onUi(e) {
    if (e.code && CHEAT[this.cheatI] === e.code) { if (++this.cheatI >= CHEAT.length) { session.unlocked = !session.unlocked; saveSession(); audio.sfx('transform'); this.cheatI = 0; this.slots.forEach((s) => { s.ci = 0; }); } } else if (e.code) this.cheatI = e.code === CHEAT[0] ? 1 : 0;
    const P = this.pool();
    if (e.ev === 'back') { if (this.phase === 'join') { setScene(scenes.title); audio.sfx('menu_back'); } else { this.phase = 'join'; this.coms = []; this.slots.forEach((s) => { if (s.st === 'ready') s.st = 'team'; }); audio.sfx('menu_back'); } return; }
    if (this.phase === 'join') {
      const who = e.who;
      if (who < 0) { if (e.ev === 'ok' && this.humansReady().length && !this.slots.some((s) => s.st === 'char' || s.st === 'team')) { this.phase = 'comCount'; audio.sfx('menu_ok'); } return; }
      const s = this.slots[who];
      if (e.ev === 'attack') {
        audio.sfx('menu_ok');
        if (s.st === 'off') s.st = 'char';
        else if (s.st === 'char') s.st = 'team';
        else if (s.st === 'team') s.st = 'ready';
        else if (s.st === 'ready' && !this.slots.some((x) => x.st === 'char' || x.st === 'team')) this.phase = 'comCount';
      } else if (e.ev === 'jump') {
        audio.sfx('menu_back');
        if (s.st === 'ready') s.st = 'team'; else if (s.st === 'team') s.st = 'char'; else if (s.st === 'char') s.st = 'off';
        else if (!this.slots.some((x) => x.st !== 'off')) setScene(scenes.title);
      } else if (e.ev === 'left' || e.ev === 'right') {
        const d = e.ev === 'left' ? -1 : 1;
        if (s.st === 'char') { s.ci = (s.ci + P.length + d) % P.length; audio.sfx('menu_move'); }
        else if (s.st === 'team') { s.team = (s.team + 5 + d) % 5; audio.sfx('menu_move'); }
      }
      return;
    }
    if (this.phase === 'comCount') {
      const max = 8 - this.humansReady().length;
      if (e.ev === 'left') { this.comN = (this.comN + max) % (max + 1); audio.sfx('menu_move'); }
      else if (e.ev === 'right') { this.comN = (this.comN + 1) % (max + 1); audio.sfx('menu_move'); }
      else if (e.ev === 'attack' || e.ev === 'ok') {
        audio.sfx('menu_ok');
        this.coms = [];
        if (this.comN === 0) this.finish(); else { this.phase = 'comPick'; this.coms.push({ ci: P.length - 1, team: 0, st: 'char' }); }
      } else if (e.ev === 'jump') { this.phase = 'join'; this.slots.forEach((s) => { if (s.st === 'ready') s.st = 'team'; }); audio.sfx('menu_back'); }
      return;
    }
    if (this.phase === 'comPick') {
      const c = this.coms[this.coms.length - 1];
      if (e.ev === 'left' || e.ev === 'right') {
        const d = e.ev === 'left' ? -1 : 1;
        if (c.st === 'char') c.ci = (c.ci + P.length + d) % P.length; else c.team = (c.team + 5 + d) % 5;
        audio.sfx('menu_move');
      } else if (e.ev === 'attack' || e.ev === 'ok') {
        audio.sfx('menu_ok');
        if (c.st === 'char') c.st = 'team';
        else if (this.coms.length < this.comN) this.coms.push({ ci: c.ci, team: c.team, st: 'char' });
        else this.finish();
      } else if (e.ev === 'jump') {
        audio.sfx('menu_back');
        if (c.st === 'team') c.st = 'char'; else if (this.coms.length > 1) this.coms.pop(); else { this.coms = []; this.phase = 'comCount'; }
      }
    }
  },
  finish() {
    const P = this.pool();
    const real = P.filter((x) => x !== 'random');
    const resolve = (ci) => (P[ci] === 'random' ? pick(ROSTER) : P[ci]);
    session.humans = this.slots.map((s) => ({ active: s.st === 'ready', charId: s.st === 'ready' ? resolve(s.ci) : null, team: s.team, pickRandom: P[s.ci] === 'random' }));
    session.coms = this.coms.map((c) => ({ charId: resolve(c.ci), team: c.team }));
    void real;
    setScene(scenes.setup);
  },
  update() { this.t++; },
  render(ctx) {
    drawMenuBg(ctx, this.t);
    text(ctx, 'CHARACTER SELECTION', W / 2, 40, { align: 'center', size: 26, color: '#ffd040' });
    const P = this.pool();
    const boxes = [];
    for (let i = 0; i < 4; i++) boxes.push({ kind: 'h', i, s: this.slots[i] });
    const ready = this.humansReady().length;
    this.coms.forEach((c, j) => boxes.push({ kind: 'c', i: j, s: c }));
    // 8 格:上排 P1-P4,下排电脑
    for (let b = 0; b < 8; b++) {
      const x = 22 + (b % 4) * 190, y = 60 + Math.floor(b / 4) * 222;
      const box = b < 4 ? boxes[b] : boxes[4 + (b - 4)];
      panel(ctx, x, y, 178, 210, { fill: 'rgba(4,8,36,0.9)', border: '#34449a' });
      if (!box) { text(ctx, b < 4 ? '' : 'Computer', x + 89, y + 110, { align: 'center', size: 13, color: '#334' }); continue; }
      const s = box.s;
      const label = box.kind === 'h' ? `Player ${box.i + 1}` : `Com ${box.i + 1}`;
      text(ctx, label, x + 89, y + 22, { align: 'center', size: 14, color: box.kind === 'h' ? '#9fd0ff' : '#ffb080' });
      if (box.kind === 'h' && s.st === 'off') {
        const k = codeLabel(keyboard.bindings[box.i].attack);
        if (this.phase === 'join' && this.t % 40 < 28) text(ctx, `按 ${k} 加入`, x + 89, y + 112, { align: 'center', size: 15, color: '#ffe060' });
        continue;
      }
      const id = P[s.ci];
      if (id === 'random') {
        text(ctx, '?', x + 89, y + 130, { align: 'center', size: 80, color: '#ffd040' });
        text(ctx, 'Random', x + 89, y + 172, { align: 'center', size: 16, color: '#fff' });
      } else {
        const def = CHARS[id];
        // 原版式大头像(120×120);右下角叠一个小号站姿精灵
        ctx.drawImage(portrait(def, 120, 120), x + 29, y + 32);
        ctx.strokeStyle = '#34449a'; ctx.lineWidth = 1; ctx.strokeRect(x + 29.5, y + 32.5, 119, 119);
        const frame = s.st === 'char' ? 'stand' + ((this.t >> 3) % 4) : 'victory';
        fighterPose(ctx, id, frame, x + 150, y + 160, -1, 0.75);
        text(ctx, def.name, x + 89, y + 178, { align: 'center', size: 16, color: def.hidden ? '#ff9060' : '#fff' });
      }
      const tc = TEAM_COLORS[s.team];
      text(ctx, TEAM_NAMES[s.team], x + 89, y + 198, { align: 'center', size: 13, color: s.st === 'char' ? '#555a80' : tc });
      if (s.st === 'char' && this.t % 30 < 20) { text(ctx, '◀', x + 12, y + 110, { size: 16, color: '#ffe060' }); text(ctx, '▶', x + 152, y + 110, { size: 16, color: '#ffe060' }); }
      if (s.st === 'team' && this.t % 30 < 20) { text(ctx, '◀', x + 20, y + 198, { size: 12, color: '#ffe060' }); text(ctx, '▶', x + 148, y + 198, { size: 12, color: '#ffe060' }); }
      if (s.st === 'ready') text(ctx, 'READY', x + 89, y + 146, { align: 'center', size: 16, color: '#60ff80', stroke: '#000', strokeW: 4 });
    }
    if (this.phase === 'comCount') {
      panel(ctx, W / 2 - 170, 230, 340, 90, { border: '#ffd040' });
      text(ctx, '电脑玩家数量 Computer Players', W / 2, 262, { align: 'center', size: 15, color: '#fff' });
      text(ctx, `◀  ${this.comN}  ▶`, W / 2, 300, { align: 'center', size: 26, color: '#ffe060' });
    }
    let hint = '各玩家按自己的攻击键加入 → 左右选角色 → 攻击确定 → 左右选队伍 → 攻击确定;跳跃键返回';
    if (this.phase === 'comCount') hint = '左右选择电脑数量,攻击键确定(0 = 不加电脑)';
    if (this.phase === 'comPick') hint = '为电脑选择角色和队伍:左右切换,攻击确定,跳跃返回';
    if (ready && this.phase === 'join' && !this.slots.some((s) => s.st === 'char' || s.st === 'team')) hint = '已就绪的玩家再按攻击键(或 Enter)进入下一步';
    text(ctx, hint, W / 2, H - 12, { align: 'center', size: 12, color: '#aab4e0', bold: false });
    if (session.unlocked) text(ctx, 'HIDDEN UNLOCKED', W - 10, 20, { align: 'right', size: 10, color: '#ff9060' });
  },
};

// ---------------------------------------------------------------- 对局设置(模式 / 场景 / 难度 / 关卡)
scenes.setup = {
  name: 'setup',
  enter() { this.row = 3; this.t = 0; this.mi = Math.max(0, MODES.findIndex((m) => m.id === session.mode)); if (MODES[this.mi].id === 'demo') this.mi = 0; },
  rows() { return ['mode', MODES[this.mi].id === 'stage' ? 'stage' : 'bg', 'difficulty', 'fight', 'back']; },
  bgList() { return [{ id: 'random', name: 'Random' }].concat(BG_LIST); },
  onUi(e) {
    const rows = this.rows();
    if (e.ev === 'back' || e.ev === 'jump') { setScene(scenes.select); audio.sfx('menu_back'); return; }
    if (e.ev === 'up') { this.row = (this.row + rows.length - 1) % rows.length; audio.sfx('menu_move'); return; }
    if (e.ev === 'down') { this.row = (this.row + 1) % rows.length; audio.sfx('menu_move'); return; }
    const r = rows[this.row];
    const d = e.ev === 'left' ? -1 : e.ev === 'right' ? 1 : 0;
    if (d) {
      audio.sfx('menu_move');
      if (r === 'mode') { this.mi = (this.mi + MODES.length - 1 + d) % (MODES.length - 1); }
      else if (r === 'bg') { const L = this.bgList(); let i = L.findIndex((b) => b.id === session.bg); session.bg = L[(i + L.length + d) % L.length].id; }
      else if (r === 'difficulty') session.difficulty = (session.difficulty + 4 + d) % 4;
      else if (r === 'stage') session.stage = ((session.stage - 1 + STAGES.length + d) % STAGES.length) + 1;
      return;
    }
    if (e.ev === 'ok' || e.ev === 'attack') {
      if (r === 'back') { setScene(scenes.select); audio.sfx('menu_back'); return; }
      if (r === 'fight') {
        session.mode = MODES[this.mi].id;
        saveSession();
        const fighters = session.humans.filter((h) => h.active).length + session.coms.length;
        if (session.mode === 'vs' || session.mode === 'champ') {
          if (fighters < 2) { this.err = '至少需要 2 名角色(可在选人时加入电脑)'; this.errT = 60; audio.sfx('menu_back'); return; }
          const teams = new Set();
          session.humans.filter((h) => h.active).forEach((h, i) => teams.add(h.team === 0 ? 'p' + i : h.team));
          session.coms.forEach((c, i) => teams.add(c.team === 0 ? 'c' + i : c.team));
          if (session.mode === 'vs' && teams.size < 2) { this.err = '所有角色同队,无法对战'; this.errT = 60; audio.sfx('menu_back'); return; }
        }
        audio.sfx('go');
        setScene(battleScene, { mode: session.mode, bg: session.bg, difficulty: session.difficulty, stage: session.stage });
      }
    }
  },
  update() { this.t++; if (this.errT > 0) this.errT--; },
  render(ctx) {
    drawMenuBg(ctx, this.t);
    text(ctx, 'GAME MENU', W / 2, 60, { align: 'center', size: 28, color: '#ffd040' });
    panel(ctx, 160, 90, W - 320, 330);
    const rows = this.rows();
    const L = this.bgList();
    rows.forEach((r, i) => {
      const y = 140 + i * 56, sel = i === this.row;
      let label = '', val = '';
      if (r === 'mode') { label = 'Mode'; val = `${MODES[this.mi].name}  ${MODES[this.mi].cn}`; }
      if (r === 'bg') { label = 'Background'; val = (L.find((b) => b.id === session.bg) || L[0]).name; }
      if (r === 'stage') { label = 'Stage'; const s = STAGES[session.stage - 1]; val = s ? s.name : '-'; }
      if (r === 'difficulty') { label = 'Difficulty'; val = DIFFICULTIES[session.difficulty]; }
      if (r === 'fight') { menuItem(ctx, 'FIGHT!', W / 2, y, sel, { size: 24, w: 360 }); return; }
      if (r === 'back') { menuItem(ctx, 'Back', W / 2, y, sel, { size: 16, w: 360 }); return; }
      if (sel) { ctx.fillStyle = 'rgba(255,200,40,0.18)'; ctx.fillRect(180, y - 24, W - 360, 34); }
      text(ctx, label, 200, y, { size: 17, color: sel ? '#ffe060' : '#aab4ff' });
      text(ctx, `◀ ${val} ▶`, W - 200, y, { align: 'right', size: 17, color: '#fff' });
    });
    // 参战阵容
    const all = session.humans.map((h, i) => (h.active ? { id: h.charId, team: h.team, tag: 'P' + (i + 1), rnd: h.pickRandom } : null)).filter(Boolean)
      .concat(session.coms.map((c, i) => ({ id: c.charId, team: c.team, tag: 'Com' })));
    all.forEach((a, i) => {
      const x = W / 2 - (all.length * 70) / 2 + i * 70 + 35;
      const def = CHARS[a.id];
      if (def) ctx.drawImage(portrait(def), x - 22, 436);
      ctx.strokeStyle = TEAM_COLORS[a.team]; ctx.lineWidth = 2; ctx.strokeRect(x - 22, 436, 44, 48);
      text(ctx, a.tag, x, 498, { align: 'center', size: 11, color: TEAM_COLORS[a.team] });
    });
    if (this.errT > 0) text(ctx, this.err, W / 2, 528, { align: 'center', size: 14, color: '#ff7060' });
    else text(ctx, '↑↓ 选择  ←→ 修改  Enter/攻击 确定  Esc/跳跃 返回', W / 2, H - 14, { align: 'center', size: 12, color: '#8890c0', bold: false });
  },
};

// ---------------------------------------------------------------- 结算
scenes.results = {
  name: 'results',
  enter(res) { this.res = res; this.t = 0; audio.music('results'); },
  onUi(e) {
    if (this.t < 20) return;
    if (e.ev === 'ok' || e.ev === 'attack') { audio.sfx('menu_ok'); setScene(this.res.next || scenes.select); }
    else if (e.ev === 'back' || e.ev === 'jump') { audio.sfx('menu_back'); setScene(scenes.title); }
  },
  update() { this.t++; },
  render(ctx) {
    drawMenuBg(ctx, this.t);
    const r = this.res;
    text(ctx, r.title || 'RESULTS', W / 2, 46, { align: 'center', size: 28, color: '#ffd040' });
    if (r.subtitle) text(ctx, r.subtitle, W / 2, 72, { align: 'center', size: 14, color: '#9fd0ff' });
    if (r.time) text(ctx, `Time ${r.time}`, W - 30, 72, { align: 'right', size: 13, color: '#dfe6ff' });
    panel(ctx, 20, 84, W - 40, 410);
    const cols = ['', 'Kill', 'Attack', 'HP Lost', 'MP Usage', 'Picking', 'Status'];
    const cx = [60, 300, 380, 470, 560, 650, 730];
    cols.forEach((c, i) => text(ctx, c, cx[i], 112, { align: i ? 'center' : 'left', size: 14, color: '#ffe080' }));
    r.rows.slice(0, 8).forEach((row, i) => {
      const y = 126 + i * 45;
      const def = CHARS[row.id];
      if (def) ctx.drawImage(portrait(def), 36, y);
      ctx.strokeStyle = TEAM_COLORS[row.teamShown] || '#fff'; ctx.lineWidth = 2; ctx.strokeRect(36, y, 44, 48);
      text(ctx, row.name, 92, y + 20, { size: 14, color: TEAM_COLORS[row.teamShown] || '#fff' });
      text(ctx, row.charName, 92, y + 38, { size: 11, color: '#99a', bold: false });
      const st = row.stats;
      [st.kills, st.attack, st.hpLost, Math.round(st.mpUsage), st.picking].forEach((v, j) => text(ctx, String(Math.round(v)), cx[j + 1], y + 30, { align: 'center', size: 15, color: '#fff' }));
      text(ctx, row.status, cx[6], y + 24, { align: 'center', size: 15, color: row.status === 'Win' ? '#60ff80' : row.status === 'Lose' ? '#ff6060' : '#ffe060' });
      if (row.alive !== undefined) text(ctx, row.alive ? 'Alive' : 'Dead', cx[6], y + 40, { align: 'center', size: 11, color: row.alive ? '#a0e0a0' : '#a08080', bold: false });
    });
    if (this.t > 20) text(ctx, '攻击键 / Enter 继续   Esc 回标题', W / 2, H - 22, { align: 'center', size: 13, color: '#aab4e0', bold: false });
  },
};
