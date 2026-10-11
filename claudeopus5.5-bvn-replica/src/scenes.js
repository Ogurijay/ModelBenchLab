// 场景:标题 → 模式 → 选人(角色 + 援助)→ 选场景 → VS → 对战 → 结算;闯关 / 生存 / 团队 / 训练 / 演示 / 出招表 / 设置 / 键位
import { W, H, settings, saveSettings, resetKeys, BUTTONS, BTN_LABEL, DIFF_NAMES, ALT_KEYS, MAX_HP } from './config.js';
import { CHARS, CHAR_ORDER, ASSISTS, ASSIST_ORDER, moveList } from './roster.js';
import { STAGES, renderThumb } from './stages.js';
import { Battle } from './battle.js';
import { drawFigure } from './skeleton.js';
import { POSES, idlePose } from './poses.js';
import { portrait, txt, FONT, BRUSH } from './hud.js';
import { menuBg, panel, menuList, title, region, clearRegions } from './ui.js';
import { captureNextKey } from './input.js';
import { pick, rand, seedRandom, clamp } from './util.js';
import audio from './audio.js';
import { art, artProgress } from './art.js';

export const SM = {
  cur: null, t: 0, pads: null, fade: 0,
  go(sc, p = {}) { this.cur = sc; this.t = 0; this.fade = 14; clearRegions(); sc.enter?.(p); },
};
const go = (sc, p) => SM.go(sc, p);
const ok = (a) => a === 'ok';

export function keyName(code) {
  if (!code) return '—';
  const map = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: '空格', Enter: '回车', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', ShiftLeft: '左Shift', ShiftRight: '右Shift', ControlLeft: '左Ctrl', ControlRight: '右Ctrl', Backslash: '\\', Minus: '-', Equal: '=' };
  if (map[code]) return map[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return '小键盘' + code.slice(6);
  return code;
}

// 角色立绘(选人 / 结算用的大号全身像)
const rsCache = {};
function bigFigure(ctx, id, x, y, face, scale, t, pose) {
  const c = CHARS[id] || ASSISTS[id];
  const im = art('full_' + id);
  if (im) {
    const h = 118 * scale * (c.look.scale || 1), w = im.naturalWidth / im.naturalHeight * h;
    const bob = Math.sin(t * 0.05) * 1.5;
    ctx.save(); ctx.translate(x, y); ctx.scale(face, 1); ctx.drawImage(im, -w / 2, -h + bob, w, h - bob); ctx.restore();
    return;
  }
  const rs = rsCache[id + face] || (rsCache[id + face] = { chains: {}, sway: 0 });
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  const base = POSES[pose || c.stance] || (c.look.holdWeapon ? POSES.stand_w : POSES.stand);
  drawFigure(ctx, 0, 0, face, c.look, idlePose(base, t), { grounded: true, rs, eyeRed: c.id === 'karasu' ? 1 : 0 });
  ctx.restore();
}

// ======================================================================== 标题
const MODES = [
  { label: '单人闯关', id: 'arcade' },
  { label: '人机对战', id: 'vscpu' },
  { label: '双人对战', id: 'vs2p' },
  { label: '团队对战 3v3', id: 'team', opts: ['VS 电脑', 'VS 2P'] },
  { label: '生存挑战', id: 'survival' },
  { label: '训练模式', id: 'training' },
  { label: '观战演示', id: 'demo' },
  { label: '出招表', id: 'moves' },
  { label: '游戏设置', id: 'options' },
];
export const titleScene = {
  name: 'title', sel: 0, teamOpt: 0, started: false,
  enter() { audio.bgm('title'); this.idle = 0; },
  update() { if (++this.idle > 60 * 25) go(demoScene); },
  onKey(a) {
    this.idle = 0;
    if (!this.started) { this.started = true; audio.sfx('select'); return; }
    if (a === 'up') { this.sel = (this.sel + MODES.length - 1) % MODES.length; audio.sfx('cursor'); }
    if (a === 'down') { this.sel = (this.sel + 1) % MODES.length; audio.sfx('cursor'); }
    if ((a === 'left' || a === 'right') && MODES[this.sel].opts) { this.teamOpt ^= 1; audio.sfx('cursor'); }
    if (ok(a)) this.choose(this.sel);
  },
  choose(i) {
    audio.sfx('select');
    const m = MODES[i].id;
    if (m === 'arcade') go(selectScene, { mode: 'arcade', p2: 'none' });
    else if (m === 'vscpu') go(selectScene, { mode: 'vs', p2: 'cpu' });
    else if (m === 'vs2p') go(selectScene, { mode: 'vs', p2: 'human' });
    else if (m === 'team') go(selectScene, { mode: 'team', p2: this.teamOpt ? 'human' : 'cpu', count: 3 });
    else if (m === 'survival') go(selectScene, { mode: 'survival', p2: 'none' });
    else if (m === 'training') go(selectScene, { mode: 'training', p2: 'cpu' });
    else if (m === 'demo') go(demoScene);
    else if (m === 'moves') go(movesScene, { back: titleScene });
    else if (m === 'options') go(optionsScene);
  },
  draw(ctx) {
    const t = SM.t;
    menuBg(ctx, t, 0);
    // 两阵营代表人物对峙
    ctx.save(); ctx.globalAlpha = 0.95;
    bigFigure(ctx, 'shippu', 170, 500, 1, 3.1, t);
    bigFigure(ctx, 'souga', 790, 500, -1, 3.0, t);
    ctx.restore();
    const g = ctx.createLinearGradient(0, 360, 0, 540); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.75)'); ctx.fillStyle = g; ctx.fillRect(0, 360, W, 180);
    // 标志
    const pulse = 1 + Math.sin(t * 0.05) * 0.015;
    ctx.save(); ctx.translate(480, 112); ctx.scale(pulse, pulse);
    txt(ctx, '魂叶乱斗', 0, 0, { size: 96, weight: 900, align: 'center', font: BRUSH, color: '#ffe2a0', stroke: '#3a0808', lw: 12 });
    ctx.restore();
    txt(ctx, 'SOUL  ×  LEAF', 480, 152, { size: 22, weight: 900, align: 'center', color: '#ff9a50', lw: 5 });
    txt(ctx, '死神 vs 火影 式 2D 动漫格斗 · 玩法复刻', 480, 178, { size: 14, align: 'center', color: '#e8d8c0', lw: 3 });
    if (artProgress() < 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(330, 470, 300, 10); ctx.fillStyle = '#ffb040'; ctx.fillRect(330, 470, 300 * artProgress(), 10);
      txt(ctx, `加载美术资源 ${Math.round(artProgress() * 100)}%`, 480, 500, { size: 13, align: 'center', color: '#e8d8c0', lw: 3 });
    }
    if (!this.started) {
      if ((t >> 5) % 2) txt(ctx, '按 J / 回车 开始', 480, 400, { size: 24, weight: 900, align: 'center', color: '#fff' });
      txt(ctx, '原创角色 · 程序化美术与音乐 · Claude Opus 5.5', 480, 520, { size: 11, align: 'center', color: '#a89888', lw: 3 });
      region(0, 0, W, H, () => this.onKey('ok'));
      return;
    }
    panel(ctx, 340, 208, 280, 324, 0.6);
    const items = MODES.map((m, i) => ({ label: m.opts ? `${m.label}  ◀ ${m.opts[this.teamOpt]} ▶` : m.label }));
    menuList(ctx, items, this.sel, 480, 240, { lh: 34, size: 19, w: 270, onClick: (i) => { this.sel = i; this.choose(i); } });
    txt(ctx, 'W/S 选择 · J 确认 · K 返回', 480, 528, { size: 11, align: 'center', color: '#a89888', lw: 3 });
  },
};

// ======================================================================== 选人
export const selectScene = {
  name: 'select',
  enter(p) {
    this.cfg = { mode: p.mode, p2: p.p2, count: p.count || 1 };
    this.cur = [{ ctrl: 'p1', phase: 'char', picks: [], cursor: 0, acur: 0, assist: null }, { ctrl: p.p2 === 'human' ? 'p2' : p.p2 === 'cpu' ? 'p1-cpu' : 'auto', phase: p.p2 === 'none' ? 'done' : 'wait', picks: [], cursor: 5, acur: 3, assist: null }];
    if (p.p2 === 'human') this.cur[1].phase = 'char';
    audio.bgm('select');
  },
  active(player) {
    // 返回该玩家此刻操控的那一方(-1:回车 / 空格 / 鼠标等公共输入)
    const [a, b] = this.cur;
    if (player === 1) return b.ctrl === 'p2' ? b : null;
    if (a.phase !== 'done') return a;
    if (b.ctrl === 'p1-cpu' && b.phase !== 'done') return b;
    if (player === -1 && b.ctrl === 'p2' && b.phase !== 'done') return b;
    return a;
  },
  onKey(a, player) {
    const s = this.active(player);
    if (!s) return;
    if (s.phase === 'wait') s.phase = 'char';
    const n = CHAR_ORDER.length;
    if (s.phase === 'char') {
      const r = Math.floor(s.cursor / 5), c = s.cursor % 5;
      if (a === 'left') s.cursor = r * 5 + (c + 4) % 5;
      if (a === 'right') s.cursor = r * 5 + (c + 1) % 5;
      if (a === 'up' || a === 'down') s.cursor = (s.cursor + 5) % n;
      if (a !== 'ok' && a !== 'back' && a !== 'alt') audio.sfx('cursor');
      if (a === 'alt') { s.cursor = Math.floor(rand() * n); a = 'ok'; }
      if (ok(a)) {
        s.picks.push(CHAR_ORDER[s.cursor]); audio.sfx('select');
        if (s.picks.length >= this.cfg.count) s.phase = 'assist';
      }
      if (a === 'back') this.undo(s);
    } else if (s.phase === 'assist') {
      const m = ASSIST_ORDER.length;
      if (a === 'left') { s.acur = (s.acur + m - 1) % m; audio.sfx('cursor'); }
      if (a === 'right') { s.acur = (s.acur + 1) % m; audio.sfx('cursor'); }
      if (a === 'alt') { s.acur = Math.floor(rand() * m); a = 'ok'; }
      if (ok(a)) { s.assist = ASSIST_ORDER[s.acur]; s.phase = 'done'; audio.sfx('select'); }
      if (a === 'back') { s.phase = 'char'; s.picks.pop(); audio.sfx('cancel'); }
    } else if (s.phase === 'done' && a === 'back') { s.phase = 'assist'; s.assist = null; audio.sfx('cancel'); }
    this.checkDone();
  },
  undo(s) {
    audio.sfx('cancel');
    if (s.picks.length) { s.picks.pop(); return; }
    if (s === this.cur[1] && s.ctrl === 'p1-cpu') { const a = this.cur[0]; a.phase = 'assist'; a.assist = null; s.phase = 'wait'; return; }
    if (s === this.cur[0]) go(titleScene, {});
  },
  checkDone() {
    const [a, b] = this.cur;
    if (a.phase === 'done' && b.ctrl === 'p1-cpu' && b.phase === 'wait') b.phase = 'char';
    if (a.phase !== 'done' || b.phase !== 'done') return;
    const sides = [
      { chars: a.picks, assist: a.assist },
      b.ctrl === 'auto' ? null : { chars: b.picks, assist: b.assist, cpu: b.ctrl !== 'p2' },
    ];
    const mode = this.cfg.mode;
    if (mode === 'arcade') startArcade(sides[0]);
    else if (mode === 'survival') startSurvival(sides[0]);
    else go(stageScene, { mode, sides });
  },
  update() {},
  draw(ctx) {
    const t = SM.t;
    menuBg(ctx, t, 1);
    title(ctx, this.cfg.mode === 'team' ? '选择三名角色' : '选择角色', 480, 46, 32);
    const tiles = (i) => { const r = Math.floor(i / 5), c = i % 5; return [480 - 5 * 84 / 2 + c * 84 + 2, 72 + r * 92]; };
    txt(ctx, '忍界', 252, 116, { size: 16, align: 'center', color: '#ffa060', font: BRUSH });
    txt(ctx, '魂界', 252, 208, { size: 16, align: 'center', color: '#8ab0ff', font: BRUSH });
    CHAR_ORDER.forEach((id, i) => {
      const [x, y] = tiles(i);
      const c = CHARS[id];
      ctx.drawImage(portrait(c.look, 80, { bg: c.faction === 'ninja' ? '#5a3020' : '#202a50' }), x, y, 80, 80);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 80, 80);
      txt(ctx, c.name, x + 40, y + 78, { size: 13, align: 'center', color: '#fff', lw: 3 });
      region(x, y, 80, 80, () => { const s = this.active(-1); if (s && s.phase === 'char') { s.cursor = i; this.onKey('ok', -1); } });
    });
    // 援助
    txt(ctx, '援助', 480, 272, { size: 15, align: 'center', color: '#c8f0a0', font: BRUSH });
    ASSIST_ORDER.forEach((id, i) => {
      const x = 480 - 6 * 64 / 2 + i * 64 + 4, y = 280;
      ctx.drawImage(portrait(ASSISTS[id].look, 56, { bg: '#283a28' }), x, y, 56, 56);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 56, 56);
    });
    // 光标
    this.cur.forEach((s, si) => {
      const col = si === 0 ? '#ff7a3a' : '#4a9aff';
      const lbl = s.ctrl === 'p2' ? '2P' : s.ctrl === 'p1' ? '1P' : 'CPU';
      if (s.phase === 'char') {
        const [x, y] = tiles(s.cursor);
        ctx.strokeStyle = (t >> 3) % 2 ? '#fff' : col; ctx.lineWidth = 4; ctx.strokeRect(x - 2 + si * 3, y - 2 + si * 3, 84 - si * 6, 84 - si * 6);
        txt(ctx, lbl, x + (si ? 70 : 6), y + 14, { size: 13, weight: 900, color: col, lw: 3, align: si ? 'right' : 'left' });
      } else if (s.phase === 'assist') {
        const x = 480 - 6 * 64 / 2 + s.acur * 64 + 4;
        ctx.strokeStyle = (t >> 3) % 2 ? '#fff' : col; ctx.lineWidth = 3.5; ctx.strokeRect(x - 2, 278, 60, 60);
        txt(ctx, lbl, x + 28, 352, { size: 12, weight: 900, color: col, lw: 3, align: 'center' });
      }
    });
    // 两侧大立绘
    this.cur.forEach((s, si) => {
      if (s.ctrl === 'auto') {
        txt(ctx, this.cfg.mode === 'arcade' ? '闯关:八连战' : '生存:无尽连战', si ? 840 : 120, 300, { size: 18, align: 'center', color: '#c8c8d8' });
        return;
      }
      if (s.phase === 'wait') { txt(ctx, '等待 1P 为电脑选人', si ? 840 : 120, 300, { size: 14, align: 'center', color: '#a8a8b8' }); return; }
      const hov = s.phase === 'char' ? CHAR_ORDER[s.cursor] : s.picks[s.picks.length - 1];
      if (!hov) return;
      const x = si ? 850 : 110;
      bigFigure(ctx, hov, x, 470, si ? -1 : 1, 2.5, t);
      const c = CHARS[hov];
      panel(ctx, x - 100, 476, 200, 54, 0.7);
      txt(ctx, c.name, x, 500, { size: 22, weight: 900, align: 'center', font: BRUSH, color: '#fff0c0' });
      txt(ctx, c.title, x, 520, { size: 12, align: 'center', color: '#c8b8a8' });
      // 已选队员与援助
      s.picks.forEach((id, k) => { ctx.drawImage(portrait(CHARS[id].look, 34), (si ? W - 230 : 196) + k * 38, 380, 34, 34); });
      const aid = s.phase === 'assist' ? ASSIST_ORDER[s.acur] : s.assist;
      if (aid) {
        const ax = si ? 700 : 200;
        bigFigure(ctx, aid, ax + (si ? -20 : 20), 470, si ? -1 : 1, 1.4, t);
        txt(ctx, `援助:${ASSISTS[aid].name}`, ax + (si ? -20 : 20), 494, { size: 13, align: 'center', color: '#c8f0a0' });
        txt(ctx, ASSISTS[aid].desc, ax + (si ? -20 : 20), 512, { size: 10, align: 'center', color: '#a8c098', weight: 500, lw: 3 });
      }
      if (s.phase === 'done') txt(ctx, 'READY', x, 360, { size: 30, weight: 900, align: 'center', color: '#ffe060' });
    });
    txt(ctx, '方向 选择 · J 确认 · K 取消 · U 随机', 480, 372, { size: 12, align: 'center', color: '#a89888', lw: 3 });
  },
};

// ======================================================================== 选场景
export const stageScene = {
  name: 'stage',
  enter(p) { this.p = p; this.sel = this.sel || 0; this.thumbs = this.thumbs || STAGES.map((s) => { try { return renderThumb(s.id, 192, 108); } catch { return null; } }); },
  onKey(a) {
    const n = STAGES.length + 1;
    if (a === 'left') this.sel = (this.sel + n - 1) % n;
    if (a === 'right') this.sel = (this.sel + 1) % n;
    if (a === 'up' || a === 'down') this.sel = this.sel === n - 1 ? 0 : (this.sel + 4) % (n - 1);
    if (['left', 'right', 'up', 'down'].includes(a)) audio.sfx('cursor');
    if (a === 'back') { audio.sfx('cancel'); go(selectScene, { mode: this.p.mode, p2: this.p.sides[1]?.cpu ? 'cpu' : 'human', count: this.p.sides[0].chars.length }); }
    if (ok(a)) {
      audio.sfx('select');
      const st = this.sel === STAGES.length ? pick(STAGES).id : STAGES[this.sel].id;
      const p = this.p;
      if (p.mode === 'training') startBattle({ mode: 'vs', training: { dummy: 'stand', infQi: true, autoHeal: true, showBoxes: false }, stage: st, sides: [p.sides[0], { ...p.sides[1], cpu: true, diff: settings.difficulty }] });
      else go(vsScene, { cfg: { mode: p.mode, stage: st, sides: p.sides.map((s) => ({ ...s, diff: settings.difficulty })) } });
    }
  },
  update() {},
  draw(ctx) {
    menuBg(ctx, SM.t, 2);
    title(ctx, '选择场景', 480, 52, 32);
    STAGES.forEach((s, i) => {
      const x = 480 - 2 * 212 + (i % 4) * 212 + 10, y = 90 + Math.floor(i / 4) * 150;
      const th = this.thumbs[i];
      if (th) ctx.drawImage(th, x, y, 192, 108); else { ctx.fillStyle = '#333'; ctx.fillRect(x, y, 192, 108); }
      ctx.strokeStyle = this.sel === i ? ((SM.t >> 3) % 2 ? '#fff' : '#ff9a40') : '#000'; ctx.lineWidth = this.sel === i ? 4 : 2; ctx.strokeRect(x, y, 192, 108);
      txt(ctx, `${s.name} · ${s.sub}`, x + 96, y + 128, { size: 14, align: 'center', color: this.sel === i ? '#fff2c0' : '#c8b8a8' });
      region(x, y, 192, 108, () => { this.sel = i; this.onKey('ok'); });
    });
    const rx = 400, ry = 400;
    ctx.fillStyle = this.sel === STAGES.length ? 'rgba(255,120,40,0.5)' : 'rgba(0,0,0,0.5)'; ctx.fillRect(rx, ry, 160, 40);
    ctx.strokeStyle = '#e8c070'; ctx.strokeRect(rx, ry, 160, 40);
    txt(ctx, '随机场景', 480, 427, { size: 18, align: 'center' });
    region(rx, ry, 160, 40, () => { this.sel = STAGES.length; this.onKey('ok'); });
    txt(ctx, '方向 选择 · J 确认 · K 返回', 480, 500, { size: 12, align: 'center', color: '#a89888', lw: 3 });
  },
};

// ======================================================================== VS 画面
export const vsScene = {
  name: 'vs',
  enter(p) { this.cfg = p.cfg; this.t = 0; audio.sfx('round'); },
  onKey(a) { if (ok(a) && this.t > 20) this.t = 999; },
  update() { if (++this.t > 160) startBattle(this.cfg); },
  draw(ctx) {
    const t = this.t, c = this.cfg;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const k = Math.min(1, t / 14);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(540 * k, 0); ctx.lineTo(420 * k, H); ctx.lineTo(0, H); ctx.closePath();
    const g1 = ctx.createLinearGradient(0, 0, 500, 0); g1.addColorStop(0, '#7a1a08'); g1.addColorStop(1, '#ff7a2a'); ctx.fillStyle = g1; ctx.fill();
    ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W - 420 * k, 0); ctx.lineTo(W - 540 * k, H); ctx.lineTo(W, H); ctx.closePath();
    const g2 = ctx.createLinearGradient(W, 0, W - 500, 0); g2.addColorStop(0, '#0a1450'); g2.addColorStop(1, '#3a7aff'); ctx.fillStyle = g2; ctx.fill();
    ctx.restore();
    const sl = (1 - Math.min(1, t / 18)) * 400;
    c.sides.forEach((s, i) => {
      const id = s.chars[0];
      const look = CHARS[id].look;
      const x = i ? W - 330 + sl : 30 - sl;
      if (art('full_' + id)) bigFigure(ctx, id, x + 150, 420, i ? -1 : 1, 3.2, t);
      else ctx.drawImage(portrait(look, 300, { flip: !!i }), x, 90, 300, 300);
      txt(ctx, CHARS[id].name, i ? W - 180 + sl : 180 - sl, 440, { size: 46, weight: 900, align: 'center', font: BRUSH, color: '#fff' });
      txt(ctx, CHARS[id].title, i ? W - 180 + sl : 180 - sl, 470, { size: 15, align: 'center', color: '#ffe0b0' });
      if (s.chars.length > 1) s.chars.slice(1).forEach((cid, k2) => ctx.drawImage(portrait(CHARS[cid].look, 44), (i ? W - 140 : 90) + k2 * 48 - (i ? 48 : 0), 486, 44, 44));
    });
    const vs = t < 20 ? 3 - t / 10 : 1;
    ctx.save(); ctx.translate(480, 270); ctx.scale(vs, vs);
    txt(ctx, 'VS', 0, 26, { size: 96, weight: 900, align: 'center', color: '#ffe060', stroke: '#2a0606', lw: 12 });
    ctx.restore();
    const st = STAGES.find((s) => s.id === c.stage);
    txt(ctx, c.label || `${st?.name || ''}`, 480, 520, { size: 16, align: 'center', color: '#e8d8c0' });
  },
};

// ======================================================================== 对战
export function startBattle(cfg) {
  const pads = SM.pads;
  const sides = cfg.sides.map((s, i) => ({ ...s, pad: s.cpu ? null : (i === 0 ? pads.p1 : pads.p2) }));
  seedRandom((Date.now() & 0xffffff) ^ 0x5bd1e995);
  if (cfg.seed !== undefined) seedRandom(cfg.seed);
  const B = new Battle({ ...cfg, sides });
  const st = STAGES.find((s) => s.id === cfg.stage);
  audio.bgm(cfg.boss ? 'boss' : st?.bgm || 'stage_leaf');
  go(battleScene, { B, cfg });
}
const PAUSE = ['继续', '出招表', '重新开始', '返回选人', '返回标题'];
const TRAIN = [
  { key: 'dummy', label: '对手动作', vals: ['stand', 'guard', 'jump', 'cpu'], names: ['站立', '全防御', '跳跃', '电脑'] },
  { key: 'infQi', label: '无限气 / 查克拉', vals: [true, false], names: ['开', '关'] },
  { key: 'autoHeal', label: '自动回复体力', vals: [true, false], names: ['开', '关'] },
  { key: 'showBoxes', label: '显示判定框', vals: [false, true], names: ['关', '开'] },
];
export const battleScene = {
  name: 'battle',
  enter(p) { this.B = p.B; this.cfg = p.cfg; this.paused = false; this.sel = 0; this.endT = 0; },
  get world() { return this.B; },
  onKey(a, player, code) {
    if (code === 'Escape' || code === 'KeyP' || code === 'F1') { if (this.paused) { this.paused = false; audio.sfx('cancel'); } else if (this.B.phase === 'fight' || this.B.training) { this.paused = true; this.sel = 0; audio.sfx('pause'); } return; }
    if (!this.paused) { if (this.cfg.demo && (ok(a) || a === 'back')) go(titleScene, {}); return; }
    const items = this.items();
    if (a === 'up') { this.sel = (this.sel + items.length - 1) % items.length; audio.sfx('cursor'); }
    if (a === 'down') { this.sel = (this.sel + 1) % items.length; audio.sfx('cursor'); }
    const it = items[this.sel];
    if ((a === 'left' || a === 'right') && it.tr) {
      const T = this.B.training, i = it.tr.vals.indexOf(T[it.tr.key]);
      T[it.tr.key] = it.tr.vals[(i + (a === 'right' ? 1 : it.tr.vals.length - 1)) % it.tr.vals.length];
      audio.sfx('cursor');
    }
    if (ok(a) && !it.tr) this.pauseAction(it.label);
    if (a === 'back') { this.paused = false; }
  },
  items() {
    const base = PAUSE.map((l) => ({ label: l }));
    if (this.B.training) return [...TRAIN.map((tr) => ({ label: `${tr.label}  ◀ ${tr.names[tr.vals.indexOf(this.B.training[tr.key])]} ▶`, tr })), ...base];
    return base;
  },
  pauseAction(l) {
    audio.sfx('select');
    if (l === '继续') this.paused = false;
    if (l === '出招表') go(movesScene, { back: this, resume: true, start: CHAR_ORDER.indexOf(this.B.sides[0].fighter.def.id) });
    if (l === '重新开始') startBattle(this.cfg);
    if (l === '返回选人') go(selectScene, { mode: this.cfg.arcade ? 'arcade' : this.cfg.survival ? 'survival' : this.B.training ? 'training' : this.cfg.mode, p2: this.cfg.sides[1]?.cpu ? (this.cfg.arcade || this.cfg.survival ? 'none' : 'cpu') : 'human', count: this.cfg.sides[0].chars.length });
    if (l === '返回标题') go(titleScene, {});
  },
  update() {
    if (this.paused) return;
    const B = this.B;
    // 训练:电脑对手切换
    if (B.training) {
      const sd = B.sides[1];
      if (B.training.dummy === 'cpu' && !sd.cpuOn) { sd.cpuOn = true; sd.brain = new CpuBrainRef(B, sd.fighter, sd.pad, settings.difficulty); }
      if (B.training.dummy !== 'cpu' && sd.cpuOn) { sd.cpuOn = false; sd.brain = null; }
    }
    B.update();
    if (B.result && ++this.endT === 1) this.finish(B.result);
  },
  finish(r) {
    const c = this.cfg;
    if (c.demo) { go(demoScene); return; }
    if (c.arcade) { arcadeResult(r.winner === 0, this.B); return; }
    if (c.survival) { survivalResult(r.winner === 0, this.B); return; }
    go(resultScene, { B: this.B, cfg: c, winner: r.winner });
  },
  draw(ctx) {
    this.B.draw(ctx);
    if (this.cfg.demo) txt(ctx, '观战演示 · 按 J 返回标题', 480, 530, { size: 12, align: 'center', color: '#e8d8c0', lw: 3 });
    if (this.B.training && !this.paused) txt(ctx, '训练模式 · Esc 打开训练设置', 480, 96, { size: 12, align: 'center', color: '#c8e8ff', lw: 3 });
    if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
      const items = this.items();
      panel(ctx, 300, 110, 360, 60 + items.length * 36, 0.8);
      title(ctx, '暂停', 480, 150, 30);
      menuList(ctx, items, this.sel, 480, 196, { lh: 36, size: 18, w: 340, onClick: (i) => { this.sel = i; this.onKey('ok'); } });
    }
  },
};
import { CpuBrain as CpuBrainRef } from './ai.js';

// ======================================================================== 结算
export const resultScene = {
  name: 'result',
  enter(p) { this.p = p; this.sel = 0; audio.bgm('results'); },
  onKey(a) {
    const n = 3;
    if (a === 'up') { this.sel = (this.sel + n - 1) % n; audio.sfx('cursor'); }
    if (a === 'down') { this.sel = (this.sel + 1) % n; audio.sfx('cursor'); }
    if (ok(a)) this.act(this.sel);
  },
  act(i) {
    audio.sfx('select');
    const c = this.p.cfg;
    if (i === 0) startBattle(c);
    if (i === 1) go(selectScene, { mode: c.survival ? 'survival' : c.mode, p2: c.survival ? 'none' : c.sides[1].cpu ? 'cpu' : 'human', count: c.sides[0].chars.length });
    if (i === 2) go(titleScene, {});
  },
  update() {},
  draw(ctx) {
    const { B, winner } = this.p;
    const t = SM.t;
    menuBg(ctx, t, winner === 1 ? 1 : 0);
    const wsd = B.sides[Math.max(0, winner)];
    const wf = wsd.fighter;
    bigFigure(ctx, wf.def.id, winner === 1 ? 760 : 200, 470, winner === 1 ? -1 : 1, 2.9, t, wf.def.winPose);
    title(ctx, this.p.cfg.survival ? `生存结束 · 连胜 ${this.p.cfg.survivalWins || 0}` : winner < 0 ? '平局' : `${wsd.cpu ? 'CPU' : `${winner + 1}P`} 胜利`, 480, 60, 40);
    panel(ctx, 330, 90, 300, 70, 0.7);
    txt(ctx, `「${wf.def.quote}」`, 480, 130, { size: 14, align: 'center', color: '#fff4d8', lw: 3 });
    // 数据
    panel(ctx, 330, 176, 300, 150, 0.7);
    const rows = [['最大连击', 'maxCombo'], ['造成伤害', 'dealt'], ['奥义次数', 'supers'], ['替身次数', 'subs']];
    txt(ctx, '1P', 470, 200, { size: 14, align: 'right', color: '#ff9a60' }); txt(ctx, B.sides[1].cpu ? 'CPU' : '2P', 590, 200, { size: 14, align: 'right', color: '#7ab0ff' });
    rows.forEach(([l, k], i) => {
      txt(ctx, l, 350, 228 + i * 26, { size: 14, color: '#d8c8b8' });
      B.sides.forEach((sd, j) => txt(ctx, String(Math.round(sd.fighter.stats[k])), j ? 590 : 470, 228 + i * 26, { size: 15, align: 'right' }));
    });
    menuList(ctx, ['再战', '重新选人', '返回标题'], this.sel, 480, 372, { lh: 40, size: 20, w: 260, onClick: (i) => this.act(i) });
  },
};

// ======================================================================== 闯关
let arcade = null;
function startArcade(side) {
  const me = side.chars[0];
  const pool = CHAR_ORDER.filter((id) => id !== me && id !== 'genshu');
  const ladder = [];
  const p = pool.slice();
  while (ladder.length < 7 && p.length) ladder.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
  ladder.push(me === 'genshu' ? 'kyouken' : 'genshu');
  arcade = { side, ladder, stage: 0, score: 0, continues: 0 };
  nextArcade();
}
function nextArcade() {
  const a = arcade, id = a.ladder[a.stage], last = a.stage === a.ladder.length - 1;
  const stage = last ? 'execution_hill' : CHARS[id].stageHint || pick(STAGES).id;
  const diff = clamp(settings.difficulty + (a.stage >= 5 ? 1 : 0), 0, 3);
  const cfg = { mode: 'vs', arcade: true, boss: last, stage, label: `第 ${a.stage + 1} 战 / 共 ${a.ladder.length} 战${last ? ' · 最终决战' : ''}`,
    sides: [{ ...a.side, carry: null }, { chars: [id], assist: pick(ASSIST_ORDER), cpu: true, diff }] };
  go(vsScene, { cfg });
}
function arcadeResult(win, B) {
  if (win) {
    arcade.stage++;
    if (arcade.stage >= arcade.ladder.length) go(endingScene, { id: arcade.side.chars[0] });
    else nextArcade();
  } else go(continueScene, {});
}
export const continueScene = {
  name: 'continue',
  enter() { this.t = 0; audio.bgm('continue'); },
  onKey(a) { if (ok(a)) { arcade.continues++; nextArcade(); } if (a === 'back') this.t += 60; },
  update() { if (++this.t > 60 * 10) go(titleScene, {}); },
  draw(ctx) {
    menuBg(ctx, SM.t, 2);
    title(ctx, 'CONTINUE?', 480, 200, 56);
    txt(ctx, String(Math.max(0, 9 - Math.floor(this.t / 60))), 480, 320, { size: 96, weight: 900, align: 'center', color: '#ffe060' });
    txt(ctx, 'J 继续挑战 · K 加速倒计时', 480, 400, { size: 16, align: 'center', color: '#e8d8c0' });
    txt(ctx, `已到达第 ${arcade.stage + 1} 战`, 480, 440, { size: 14, align: 'center', color: '#c8b8a8' });
  },
};
export const endingScene = {
  name: 'ending',
  enter(p) { this.id = p.id; audio.bgm('results'); audio.sfx('victory'); },
  onKey(a) { if (ok(a) && SM.t > 60) go(titleScene, {}); },
  update() {},
  draw(ctx) {
    const t = SM.t;
    menuBg(ctx, t, 0);
    bigFigure(ctx, this.id, 480, 450, 1, 3.2, t, CHARS[this.id].winPose);
    title(ctx, '全 关 制 霸', 480, 80, 60);
    txt(ctx, `${CHARS[this.id].name} 击败了所有对手,登上了天之顶点。`, 480, 120, { size: 16, align: 'center', color: '#fff4d8' });
    txt(ctx, `续关 ${arcade?.continues || 0} 次 · 难度 ${DIFF_NAMES[settings.difficulty]}`, 480, 146, { size: 13, align: 'center', color: '#c8b8a8' });
    txt(ctx, '感谢游玩 · 按 J 返回标题', 480, 520, { size: 14, align: 'center', color: '#e8d8c0' });
  },
};

// ======================================================================== 生存
let survival = null;
function startSurvival(side) { survival = { side, wins: 0, hp: MAX_HP, qi: settings.startQi }; nextSurvival(); }
function nextSurvival() {
  const s = survival;
  const id = pick(CHAR_ORDER.filter((c) => c !== s.side.chars[0]));
  const cfg = { mode: 'survival', survival: true, survivalWins: s.wins, stage: pick(STAGES).id, label: `生存挑战 · 第 ${s.wins + 1} 战`,
    sides: [{ ...s.side, carry: { hp: s.hp, qi: s.qi } }, { chars: [id], assist: pick(ASSIST_ORDER), cpu: true, diff: clamp(settings.difficulty + Math.floor(s.wins / 4), 0, 3) }] };
  go(vsScene, { cfg });
}
function survivalResult(win, B) {
  if (win) {
    const f = B.sides[0].fighter;
    survival.wins++; survival.hp = Math.min(MAX_HP, f.hp + (MAX_HP - f.hp) * 0.3); survival.qi = f.qi;
    nextSurvival();
  } else go(resultScene, { B, cfg: { ...B.o, survivalWins: survival.wins, sides: [survival.side, B.o.sides[1]] }, winner: 1 });
}

// ======================================================================== 演示
export const demoScene = {
  name: 'demo',
  enter() {
    const a = pick(CHAR_ORDER), b = pick(CHAR_ORDER.filter((x) => x !== a));
    startBattle({ mode: 'vs', demo: true, stage: pick(STAGES).id, winsNeeded: 1, sides: [{ chars: [a], assist: pick(ASSIST_ORDER), cpu: true, diff: 2 }, { chars: [b], assist: pick(ASSIST_ORDER), cpu: true, diff: 2 }] });
  },
  update() {}, draw() {}, onKey() {},
};

// ======================================================================== 出招表
export const movesScene = {
  name: 'moves',
  enter(p) { this.back = p.back; this.resume = p.resume; this.idx = p.start ?? -1; },
  onKey(a) {
    if (a === 'left') { this.idx = this.idx <= -1 ? CHAR_ORDER.length - 1 : this.idx - 1; audio.sfx('cursor'); }
    if (a === 'right') { this.idx = this.idx >= CHAR_ORDER.length - 1 ? -1 : this.idx + 1; audio.sfx('cursor'); }
    if (a === 'back' || ok(a)) { audio.sfx('cancel'); if (this.resume) { SM.cur = this.back; this.back.paused = true; } else go(this.back || titleScene, {}); }
  },
  update() {},
  draw(ctx) {
    menuBg(ctx, SM.t, 2);
    if (this.idx < 0) return this.drawRules(ctx);
    const id = CHAR_ORDER[this.idx], c = CHARS[id];
    ctx.drawImage(portrait(c.look, 150, { bg: c.faction === 'ninja' ? '#5a3020' : '#202a50' }), 40, 40, 150, 150);
    ctx.strokeStyle = '#e8c070'; ctx.strokeRect(40, 40, 150, 150);
    txt(ctx, c.name, 115, 226, { size: 34, weight: 900, align: 'center', font: BRUSH, color: '#fff0c0' });
    txt(ctx, c.title, 115, 250, { size: 13, align: 'center', color: '#c8b8a8' });
    txt(ctx, c.faction === 'ninja' ? '忍界 · 查克拉' : '魂界 · 灵力', 115, 272, { size: 12, align: 'center', color: c.faction === 'ninja' ? '#ffa060' : '#8ab0ff' });
    txt(ctx, `冲刺:${c.dash === 'shunpo' ? '瞬步(短暂无敌)' : c.dash === 'sand' ? '砂瞬身(短暂无敌)' : '忍者跑'}`, 115, 296, { size: 11, align: 'center', color: '#a89888', lw: 3 });
    panel(ctx, 220, 30, 712, 476, 0.72);
    const list = moveList(id);
    list.forEach((m, i) => {
      const y = 62 + i * 27;
      const col = m.cat === 'I' ? '#ffcf60' : m.cat === 'U' ? '#9ad8ff' : '#e8e0d8';
      txt(ctx, m.label, 240, y, { size: 14, color: '#c8b8a8', lw: 3 });
      txt(ctx, m.name, 380, y, { size: 16, weight: 800, color: col, lw: 3 });
      txt(ctx, m.cost, 912, y, { size: 13, align: 'right', color: '#c8a8a8', lw: 3 });
    });
    txt(ctx, `◀ ▶ 切换角色 (${this.idx + 1}/${CHAR_ORDER.length}) · K 返回`, 480, 528, { size: 12, align: 'center', color: '#a89888', lw: 3 });
  },
  drawRules(ctx) {
    title(ctx, '操作与规则', 480, 48, 32);
    panel(ctx, 40, 66, 880, 440, 0.72);
    const k1 = settings.keys.p1, k2 = settings.keys.p2;
    const rows = [
      ['移动', `${keyName(k1.left)}/${keyName(k1.right)}`, `${keyName(k2.left)}/${keyName(k2.right)}`, '面向对手自动转身'],
      ['防御', keyName(k1.down), keyName(k2.down), '按住防御正面攻击;连续格挡过多会被破防'],
      ['攻击 J', keyName(k1.J), keyName(k2.J), '连按出连段;W+J 挑空、S+J 下段;空中 J / S+J'],
      ['跳跃 K', keyName(k1.K), keyName(k2.K), '空中可再跳一次;被击飞时按 K 受身'],
      ['冲刺 L', keyName(k1.L), keyName(k2.L), '冲刺 / 瞬步;空中冲刺耗 10;受击中按 L 替身术(耗 50)'],
      ['技能 U', keyName(k1.U), keyName(k2.U), 'U / W+U / S+U / 空中 U,消耗查克拉或灵力'],
      ['必杀 I', keyName(k1.I), keyName(k2.I), 'I / W+I / S+I / 空中 I,消耗 1~3 格气,发动奥义演出'],
      ['援助 O', keyName(k1.O), keyName(k2.O), '援助槽满时召唤援助角色出招'],
    ];
    txt(ctx, '动作', 70, 98, { size: 13, color: '#ffcf80' }); txt(ctx, '1P', 190, 98, { size: 13, color: '#ff9a60' }); txt(ctx, '2P', 290, 98, { size: 13, color: '#7ab0ff' }); txt(ctx, '说明', 420, 98, { size: 13, color: '#ffcf80' });
    rows.forEach((r, i) => { const y = 126 + i * 28; txt(ctx, r[0], 70, y, { size: 14 }); txt(ctx, r[1], 190, y, { size: 14 }); txt(ctx, r[2], 290, y, { size: 13 }); txt(ctx, r[3], 420, y, { size: 13, color: '#d8d0c8' }); });
    const rules = [
      '· 命中后可取消:普攻 → 技能 / 必杀 / 冲刺,技能 → 必杀;挑空命中后按 K 追击空中连段。',
      '· 气槽最多 3 格:攻击与受击都会积气。部分角色的 S+I 为 3 格觉醒 / 卍解变身(限时强化)。',
      '· 连击越长伤害递减;硬直累积超过上限会被强制击倒。倒地后可按 K 快速起身。',
      '· 2P 无小键盘时可用备用键:, . / M ; \'(对应 J K L U I O)。Esc 暂停。',
    ];
    rules.forEach((r, i) => txt(ctx, r, 70, 370 + i * 28, { size: 13, color: '#e8e0d8', lw: 3 }));
    txt(ctx, '◀ ▶ 查看各角色出招 · K 返回', 480, 528, { size: 12, align: 'center', color: '#a89888', lw: 3 });
  },
};

// ======================================================================== 设置
const OPTS = [
  { label: '电脑难度', get: () => DIFF_NAMES[settings.difficulty], step: (d) => { settings.difficulty = (settings.difficulty + d + 4) % 4; } },
  { label: '胜利局数', get: () => `${settings.winsNeeded} 局`, step: (d) => { settings.winsNeeded = ((settings.winsNeeded - 1 + d + 3) % 3) + 1; } },
  { label: '回合时间', get: () => (settings.time ? `${settings.time} 秒` : '无限'), step: (d) => { const v = [60, 99, 0]; settings.time = v[(v.indexOf(settings.time) + d + 3) % 3]; } },
  { label: '开局气', get: () => `${settings.startQi / 100} 格`, step: (d) => { const v = [0, 100, 300]; settings.startQi = v[(v.indexOf(settings.startQi) + d + 3) % 3]; } },
  { label: '背景音乐', get: () => `${Math.round(settings.bgm * 100)}%`, step: (d) => { settings.bgm = clamp(Math.round((settings.bgm + d * 0.1) * 10) / 10, 0, 1); audio.setVolumes({ bgm: settings.bgm }); } },
  { label: '音效', get: () => `${Math.round(settings.sfx * 100)}%`, step: (d) => { settings.sfx = clamp(Math.round((settings.sfx + d * 0.1) * 10) / 10, 0, 1); audio.setVolumes({ sfx: settings.sfx }); audio.sfx('hit_mid'); } },
  { label: '显示帧率', get: () => (settings.showFps ? '开' : '关'), step: () => { settings.showFps = !settings.showFps; } },
  { label: '1P 键位设置', go: () => go(keysScene, { p: 'p1' }) },
  { label: '2P 键位设置', go: () => go(keysScene, { p: 'p2' }) },
  { label: '恢复默认键位', go: () => { resetKeys('p1'); resetKeys('p2'); audio.sfx('select'); } },
  { label: '返回', go: () => go(titleScene, {}) },
];
export const optionsScene = {
  name: 'options', sel: 0,
  enter() {},
  onKey(a) {
    const o = OPTS[this.sel];
    if (a === 'up') { this.sel = (this.sel + OPTS.length - 1) % OPTS.length; audio.sfx('cursor'); }
    if (a === 'down') { this.sel = (this.sel + 1) % OPTS.length; audio.sfx('cursor'); }
    if ((a === 'left' || a === 'right') && o.step) { o.step(a === 'right' ? 1 : -1); saveSettings(); audio.sfx('cursor'); }
    if (ok(a)) { if (o.go) o.go(); else if (o.step) { o.step(1); saveSettings(); } }
    if (a === 'back') { saveSettings(); go(titleScene, {}); }
  },
  update() {},
  draw(ctx) {
    menuBg(ctx, SM.t, 2);
    title(ctx, '游戏设置', 480, 56, 34);
    panel(ctx, 260, 80, 440, 430, 0.72);
    menuList(ctx, OPTS.map((o) => (o.get ? `${o.label}  ◀ ${o.get()} ▶` : o.label)), this.sel, 480, 120, { lh: 36, size: 18, w: 420, onClick: (i) => { this.sel = i; this.onKey('ok'); } });
  },
};
export const keysScene = {
  name: 'keys',
  enter(p) { this.p = p.p; this.sel = 0; this.wait = false; },
  onKey(a, player, code) {
    if (this.wait) return;
    const n = BUTTONS.length + 1;
    if (a === 'up') this.sel = (this.sel + n - 1) % n;
    if (a === 'down') this.sel = (this.sel + 1) % n;
    if (a === 'back') { go(optionsScene, {}); return; }
    if (ok(a)) {
      if (this.sel === BUTTONS.length) { go(optionsScene, {}); return; }
      this.wait = true;
      const b = BUTTONS[this.sel], map = settings.keys[this.p];
      captureNextKey((c) => {
        this.wait = false;
        if (c === 'Escape') return;
        const old = map[b];
        for (const k of BUTTONS) if (map[k] === c) map[k] = old; // 冲突则交换
        map[b] = c; saveSettings(); audio.sfx('select');
      });
    }
  },
  update() {},
  draw(ctx) {
    menuBg(ctx, SM.t, 2);
    title(ctx, `${this.p === 'p1' ? '1P' : '2P'} 键位设置`, 480, 56, 32);
    panel(ctx, 280, 80, 400, 440, 0.72);
    const map = settings.keys[this.p];
    const items = BUTTONS.map((b) => `${BTN_LABEL[b]}    ${keyName(map[b])}${ALT_KEYS[this.p][b] ? ` / ${keyName(ALT_KEYS[this.p][b])}` : ''}`).concat(['返回']);
    menuList(ctx, items, this.sel, 480, 116, { lh: 36, size: 17, w: 380 });
    if (this.wait) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H); txt(ctx, `请按下「${BTN_LABEL[BUTTONS[this.sel]]}」的新按键(Esc 取消)`, 480, 270, { size: 20, align: 'center', color: '#ffe0a0' }); }
  },
};
