// 界面层:模态栈(对话 / 菜单 / 暂停面板 / 商店)+ 非模态(HUD、提示条)。
import { ctx, W, H, P, rect, text, textW, wrap, panel, cursor, bar, ptext, ptextS, pwidth, shade, LINE } from './gfx.js';
import { input } from './input.js';
import { sfx, isMuted, setMuted } from './audio.js';
import { icon, portrait, plumbob } from './sprites.js';
import * as sim from './sim.js';
import { NPCS, MOTIVES, SKILLS, CAREERS, CHAPTERS, SKILL_XP, SKILL_MAX, relTier } from './data.js';

const stack = [];
const toasts = [];
let t = 0;
export const ui = {
  busy: () => stack.length > 0,
  top: () => stack[stack.length - 1],
  clear() { stack.length = 0; },
  push(layer) { stack.push(layer); return layer; },
  pop(layer) { const i = stack.indexOf(layer); if (i >= 0) stack.splice(i, 1); },
  hudHidden: false,
  quickMotives: false,
};

export function updateUI() {
  t += 1 / 60;
  for (let i = toasts.length - 1; i >= 0; i--) { toasts[i].t -= 1 / 60; if (toasts[i].t <= 0) toasts.splice(i, 1); }
  const top = stack[stack.length - 1];
  if (top) top.update();
}
export function drawUI() {
  for (const l of stack) l.draw();
}

// ---------------------------------------------------------------- 提示条
export function toast(msg, ic = null, dur = 2.6) {
  if (toasts.length && toasts[toasts.length - 1].msg === msg) { toasts[toasts.length - 1].t = dur; return; }
  toasts.push({ msg, ic, t: dur, max: dur });
  if (toasts.length > 3) toasts.shift();
}
export function drawToasts() {
  let y = 13;
  for (const tt of toasts) {
    const w = textW(tt.msg) + (tt.ic ? 14 : 0) + 10;
    const x = Math.round(W / 2 - w / 2);
    const slide = Math.min(1, (tt.max - tt.t) * 8) * Math.min(1, tt.t * 4);
    const yy = Math.round(y - (1 - slide) * 6);
    if (slide < 0.15) { y += 17 * slide; continue; }
    panel(x, yy, w, 17, 'dark');
    let tx = x + 5;
    if (tt.ic) { ctx.drawImage(icon(tt.ic), tx, yy + 4); tx += 13; }
    text(tt.msg, tx, yy + 2, P.white);
    y += 18;
  }
}

// ---------------------------------------------------------------- 对话
function speakerInfo(sp) {
  if (!sp) return null;
  if (sp === 'me') return { name: sim.S.name, look: sim.S.look, voice: 1.1 };
  const n = NPCS[sp];
  return n ? { name: n.name, look: n.look, voice: n.voice } : { name: sp, look: null, voice: 1 };
}

/** lines: [[speaker, text, mood?], ...];choices(可选)出现在最后一句 */
export function say(lines, onDone, choices = null) {
  const layer = {
    i: 0, shown: 0, lines, choices, sel: 0, wait: 0,
    update() {
      const [sp, str] = this.lines[this.i];
      const info = speakerInfo(sp);
      const full = str.length;
      if (this.shown < full) {
        const prev = Math.floor(this.shown);
        this.shown = Math.min(full, this.shown + 1.2);
        if (Math.floor(this.shown) !== prev && prev % 3 === 0) sfx.type(info ? info.voice : 1);
        if (input.pressed('A') || input.pressed('B')) this.shown = full;
        return;
      }
      const last = this.i === this.lines.length - 1;
      if (last && this.choices) {
        if (input.repeat('up')) { this.sel = (this.sel + this.choices.length - 1) % this.choices.length; sfx.cursor(); }
        if (input.repeat('down')) { this.sel = (this.sel + 1) % this.choices.length; sfx.cursor(); }
        if (input.pressed('A')) {
          sfx.select(); ui.pop(this);
          const c = this.choices[this.sel];
          c.fn?.();
          return;
        }
        if (input.pressed('B') && this.choices.some((c) => c.cancel)) {
          sfx.back(); ui.pop(this);
          this.choices.find((c) => c.cancel).fn?.();
        }
        return;
      }
      if (input.pressed('A') || input.pressed('B')) {
        sfx.cursor();
        if (last) { ui.pop(this); onDone?.(); }
        else { this.i++; this.shown = 0; const nsp = speakerInfo(this.lines[this.i][0]); if (nsp && this.lines[this.i][0] !== 'me') sfx.speak(nsp.voice, 3); }
      }
    },
    draw() {
      const [sp, str, md] = this.lines[this.i];
      const info = speakerInfo(sp);
      const bx = 2, by = 104, bw = W - 4, bh = 54;
      panel(bx, by, bw, bh, 'cream');
      let tx = bx + 8;
      if (info && info.look) {
        rect(bx + 5, by + 6, 42, 42, P.ink);
        ctx.drawImage(portrait(info.look, md || 'happy'), bx + 6, by + 7);
        tx = bx + 52;
      }
      if (info) {
        const nw = textW(info.name) + 12;
        panel(bx + 4, by - 13, nw, 16, sp === 'me' ? 'green' : 'blue');
        text(info.name, bx + 10, by - 11, P.white);
      }
      const lines = wrap(str, bw - (tx - bx) - 8);
      let left = Math.floor(this.shown);
      lines.slice(0, 3).forEach((ln, k) => {
        const part = ln.slice(0, Math.max(0, left));
        left -= ln.length;
        text(part, tx, by + 6 + k * LINE, P.ink);
      });
      const done = this.shown >= str.length;
      const last = this.i === this.lines.length - 1;
      if (done && !(last && this.choices) && (t * 3 | 0) % 2) {
        rect(bx + bw - 12, by + bh - 9, 5, 1, P.ink); rect(bx + bw - 11, by + bh - 8, 3, 1, P.ink); rect(bx + bw - 10, by + bh - 7, 1, 1, P.ink);
      }
      if (done && last && this.choices) {
        const cw = Math.max(...this.choices.map((c) => textW(c.label))) + 22;
        const ch = this.choices.length * LINE + 8;
        const cx = W - cw - 4, cy = by - ch - 2;
        panel(cx, cy, cw, ch, 'blue');
        this.choices.forEach((c, k) => {
          text(c.label, cx + 15, cy + 4 + k * LINE, k === this.sel ? P.uiSel : P.white);
          if (k === this.sel) cursor(cx + 5, cy + 7 + k * LINE, t);
        });
      }
    },
  };
  const s0 = speakerInfo(lines[0][0]);
  if (s0 && lines[0][0] !== 'me') sfx.speak(s0.voice, 3);
  return ui.push(layer);
}

// ---------------------------------------------------------------- 菜单
/**
 * opts: {title, items:[{label, icon, right, disabled(string|bool), desc, fn, keep}], onCancel, x, y, w, max}
 */
export function menu(opts) {
  const items = opts.items;
  const layer = {
    sel: Math.max(0, items.findIndex((it) => !it.disabled)), scroll: 0, opts, born: t,
    update() {
      const n = items.length;
      if (input.repeat('up')) { this.sel = (this.sel + n - 1) % n; sfx.cursor(); }
      if (input.repeat('down')) { this.sel = (this.sel + 1) % n; sfx.cursor(); }
      const max = opts.max || 7;
      if (this.sel < this.scroll) this.scroll = this.sel;
      if (this.sel >= this.scroll + max) this.scroll = this.sel - max + 1;
      if (input.pressed('A')) {
        const it = items[this.sel];
        if (!it) return;
        if (it.disabled) { sfx.error(); if (typeof it.disabled === 'string') toast(it.disabled, 'lock'); return; }
        sfx.select();
        if (!it.keep) ui.pop(this);
        it.fn?.();
      } else if (input.pressed('B')) {
        sfx.back(); ui.pop(this); opts.onCancel?.();
      }
    },
    draw() {
      const max = opts.max || 7;
      const vis = items.slice(this.scroll, this.scroll + max);
      const iw = Math.max(textW(opts.title || '') + 8, ...items.map((it) => textW(it.label) + (it.icon ? 12 : 0) + (it.right ? pwidth(it.right) + 10 : 0)));
      const w = opts.w || Math.min(W - 8, iw + 24);
      const titleH = opts.title ? 15 : 0;
      const descH = items.some((it) => it.desc) ? 28 : 0;
      const h = titleH + vis.length * LINE + 8 + descH;
      const x = opts.x ?? (W - w - 4), y = opts.y ?? 14;
      const pop = Math.min(1, (t - this.born) * 10);
      const hh = Math.max(8, Math.round(h * pop));
      panel(x, y, w, hh, 'blue');
      if (pop < 1) return;
      if (opts.title) {
        rect(x + 3, y + 3, w - 6, 12, P.ui);
        text(opts.title, x + 7, y + 2, P.uiSel);
      }
      vis.forEach((it, k) => {
        const i = k + this.scroll;
        const yy = y + titleH + 4 + k * LINE;
        const col = it.disabled ? '#8898c8' : i === this.sel ? P.uiSel : P.white;
        let xx = x + 15;
        if (it.icon) { ctx.drawImage(icon(it.icon), xx, yy + 2); xx += 12; }
        text(it.label, xx, yy, col);
        if (it.right) ptextS(it.right, x + w - 6 - pwidth(it.right), yy + 4, it.disabled ? '#8898c8' : P.yellow);
        if (i === this.sel) cursor(x + 5, yy + 3, t);
      });
      if (this.scroll > 0) ptext('^', x + w / 2, y + titleH + 1, P.white);
      if (this.scroll + max < items.length) ptext('V', x + w / 2, y + titleH + 4 + max * LINE - 3, P.white);
      if (descH) {
        const it = items[this.sel];
        const d = typeof it?.disabled === 'string' ? it.disabled : it?.desc || '';
        const dy = y + h - descH;
        rect(x + 3, dy, w - 6, 1, P.uiHi);
        wrap(d, w - 12).slice(0, 2).forEach((ln, k) => text(ln, x + 6, dy + 2 + k * 12, typeof it?.disabled === 'string' ? '#ffb0a0' : '#d8e8ff'));
      }
    },
  };
  return ui.push(layer);
}

// ---------------------------------------------------------------- HUD
export function drawHUD(extra = {}) {
  if (ui.hudHidden) return;
  const S = sim.S;
  rect(0, 0, W, 11, 'rgba(16,16,40,0.78)');
  rect(0, 11, W, 1, 'rgba(0,0,0,0.35)');
  const m = sim.mood();
  ctx.drawImage(plumbob(sim.moodColor(m)), 2, -1 + Math.round(Math.sin(t * 3)));
  ptextS(`D${S.day}`, 13, 3, P.white);
  text(sim.dayName(), 13 + pwidth(`D${S.day}`) + 3, -1, '#c8d0ff');
  const cx = 13 + pwidth(`D${S.day}`) + 3 + textW(sim.dayName()) + 4;
  ptextS(sim.clockStr(), cx, 3, sim.isNight() ? '#a8b8ff' : P.yellow);
  // 速度指示
  if (extra.speed && extra.speed > 1) ptextS(extra.speed >= 10 ? '>>>' : '>>', cx + 22, 3, P.green3);
  const money = `§${S.money}`;
  ptextS(money, W - pwidth(money) - 3, 3, P.green3);
  // 需求警报
  let ax = W - pwidth(money) - 14;
  if ((t * 2 | 0) % 2 === 0) {
    for (const mo of MOTIVES) {
      if (S.motives[mo.id] < 20) { ctx.drawImage(icon(mo.icon), ax, 1); ax -= 11; }
    }
  }
  if (S.bill) { ctx.drawImage(icon('mail'), ax, 1); }
  if (ui.quickMotives) drawQuickMotives();
}

function drawQuickMotives() {
  const S = sim.S;
  const x = 2, y = 14, w = 82, h = MOTIVES.length * 10 + 18;
  panel(x, y, w, h, 'dark');
  text(sim.moodWord(), x + 5, y + 2, sim.moodColor());
  MOTIVES.forEach((m, i) => {
    const yy = y + 16 + i * 10;
    ctx.drawImage(icon(m.icon), x + 4, yy);
    bar(x + 16, yy + 2, w - 21, 6, S.motives[m.id] / 100);
  });
}

// ---------------------------------------------------------------- 暂停面板
const TABS = ['需求', '技能', '关系', '职业', '目标', '背包', '系统'];
export function pauseMenu(handlers) {
  const layer = {
    tab: 0, sel: 0, scroll: 0,
    update() {
      if (input.pressed('L') || input.repeat('left')) { this.tab = (this.tab + TABS.length - 1) % TABS.length; this.sel = 0; this.scroll = 0; sfx.cursor(); }
      if (input.pressed('R') || input.repeat('right')) { this.tab = (this.tab + 1) % TABS.length; this.sel = 0; this.scroll = 0; sfx.cursor(); }
      const items = this.items();
      if (items.length) {
        if (input.repeat('up')) { this.sel = (this.sel + items.length - 1) % items.length; sfx.cursor(); }
        if (input.repeat('down')) { this.sel = (this.sel + 1) % items.length; sfx.cursor(); }
        if (input.pressed('A') && items[this.sel].fn) { sfx.select(); items[this.sel].fn(); return; }
      }
      if (input.pressed('B') || input.pressed('START')) { sfx.back(); ui.pop(this); }
    },
    items() {
      if (TABS[this.tab] === '系统') {
        return [
          { label: '保存游戏', fn: () => { const ok = sim.save(); toast(ok ? '已保存到本机' : '保存失败', ok ? 'check' : 'lock'); } },
          { label: isMuted() ? '声音:关' : '声音:开', fn: () => { setMuted(!isMuted()); } },
          { label: ui.quickMotives ? '需求速览:开' : '需求速览:关', fn: () => { ui.quickMotives = !ui.quickMotives; } },
          { label: '操作说明', fn: () => say([[null, '方向键移动,按住 B 跑步。A 互动 / 确认,B 取消或中断当前行动。'], [null, 'START 打开本菜单,SELECT 显示需求速览,L/R 切换标签页。'], [null, '在家睡觉可以快进时间。需求太低会出状况:尿裤子、累晕、饿晕……'], [null, '头顶绿钻代表心情:绿色最好,红色最糟。心情差时学技能变慢、工作表现变差。']]) },
          { label: '回到标题画面', fn: () => { ui.pop(this); handlers.toTitle?.(); } },
        ];
      }
      if (TABS[this.tab] === '关系') return Object.keys(NPCS).filter((id) => sim.S.rels[id].met).map((id) => ({ id }));
      return [];
    },
    draw() {
      panel(0, 0, W, H, 'blue');
      // 标签
      let x = 4;
      TABS.forEach((tb, i) => {
        const w = textW(tb) + 8;
        if (i === this.tab) { rect(x, 3, w, 15, P.uiSel); text(tb, x + 4, 4, P.ink); }
        else text(tb, x + 4, 4, '#a8c0f0');
        x += w + 1;
      });
      ptext('L', 2, H - 8, '#a8c0f0'); ptext('R', W - 6, H - 8, '#a8c0f0');
      rect(3, 19, W - 6, 1, P.uiHi);
      const fn = this['draw' + this.tab];
      fn?.call(this);
    },
    // 需求
    draw0() {
      const S = sim.S;
      const m = sim.mood();
      ctx.drawImage(plumbob(sim.moodColor(m)), 8, 23 + Math.round(Math.sin(t * 3)));
      text(`${S.name} · ${sim.moodWord(m)}`, 20, 22, P.white);
      bar(150, 26, 82, 7, m / 100, sim.moodColor(m));
      MOTIVES.forEach((mo, i) => {
        const col = i % 2, row = i >> 1;
        const xx = 8 + col * 116, yy = 42 + row * 26;
        ctx.drawImage(icon(mo.icon), xx, yy + 1);
        text(mo.label, xx + 12, yy - 2, P.white);
        ptextS(String(Math.round(S.motives[mo.id])), xx + 92, yy + 2, '#d8e8ff');
        bar(xx, yy + 12, 104, 7, S.motives[mo.id] / 100);
      });
    },
    // 技能
    draw1() {
      const S = sim.S;
      SKILLS.forEach((sk, i) => {
        const yy = 24 + i * 21;
        ctx.drawImage(icon(sk.icon), 8, yy + 2);
        text(sk.label, 20, yy - 1, P.white);
        const lv = sim.skillLv(sk.id);
        for (let k = 0; k < SKILL_MAX; k++) {
          const xx = 64 + k * 16;
          rect(xx, yy + 1, 13, 9, P.ink);
          rect(xx + 1, yy + 2, 11, 7, k < lv ? P.yellow : '#2c3c78');
          if (k < lv) rect(xx + 1, yy + 2, 11, 2, '#f8f0a0');
        }
        const frac = lv >= SKILL_MAX ? 1 : (S.skills[sk.id] - lv * SKILL_XP) / SKILL_XP;
        bar(150, yy + 2, 60, 7, frac, P.sky);
        ptextS(`${lv}`, 216, yy + 3, P.white);
      });
      text('书架、镜子、健身器材、棋桌、画架都能练技能', 6, H - 18, '#a8c0f0');
    },
    // 关系
    draw2() {
      const S = sim.S;
      const ids = Object.keys(NPCS).filter((id) => S.rels[id].met);
      if (!ids.length) { text('还没有认识任何人。去镇上走走,', 10, 30, P.white); text('走到镇民面前按 A 打招呼吧!', 10, 44, P.white); return; }
      const max = 5;
      if (this.sel < this.scroll) this.scroll = this.sel;
      if (this.sel >= this.scroll + max) this.scroll = this.sel - max + 1;
      ids.slice(this.scroll, this.scroll + max).forEach((id, k) => {
        const i = k + this.scroll;
        const n = NPCS[id], r = S.rels[id];
        const yy = 23 + k * 27;
        if (i === this.sel) rect(4, yy - 1, W - 8, 27, '#3a6ac8');
        ctx.drawImage(portrait(n.look, r.v < 0 ? 'angry' : 'happy'), 0, 0, 40, 40, 7, yy, 24, 24);
        text(n.name, 36, yy - 2, P.white);
        text(relTier(r.v, r.romance) + (r.crush && !r.romance ? ' ♥' : ''), 36 + textW(n.name) + 6, yy - 2, r.romance ? P.pink : '#c8d8ff');
        // 双向关系条:负值红,正值绿
        rect(36, yy + 13, 120, 7, P.ink);
        rect(96, yy + 13, 1, 7, P.white);
        const v = r.v;
        if (v >= 0) rect(97, yy + 14, Math.round(58 * v / 100), 5, P.green);
        else rect(96 + Math.round(58 * v / 100), yy + 14, Math.round(-58 * v / 100), 5, P.red);
        ptextS(String(Math.round(v)), 162, yy + 14, P.white);
        if (i === this.sel) {
          const lines = wrap(n.bio, 60, 12);
          text(n.title, 182, yy - 2, P.uiSel);
        }
      });
      const id = ids[this.sel];
      if (id) {
        const n = NPCS[id];
        rect(4, H - 24, W - 8, 1, P.uiHi);
        const known = S.rels[id].v >= 20;
        const likes = known ? '喜欢:' + n.likes.map((k) => ({ chat: '聊天', joke: '笑话', compliment: '夸赞', hug: '拥抱', gift: '礼物', prank: '恶作剧', ask: '打听' }[k])).join('、') : '再熟一点就知道 TA 喜欢什么了';
        text(likes, 8, H - 21, '#d8e8ff');
      }
    },
    // 职业
    draw3() {
      const S = sim.S;
      let y = 24;
      for (const [id, c] of Object.entries(CAREERS)) {
        const j = S.jobs[id];
        panel(6, y, W - 12, 52, 'dark');
        text(c.name, 12, y + 3, P.uiSel);
        if (!j) {
          text(`未入职 · ${c.open}:00-${c.close}:00 到柜台申请`, 12, y + 18, '#c8d0f0');
          text(`起薪 §${c.levels[0].pay}/班`, 12, y + 32, '#c8d0f0');
        } else {
          const lv = c.levels[j.lvl];
          text(`Lv${j.lvl + 1} ${lv.title}`, 60, y + 3, P.white);
          ptextS(`§${lv.pay}`, W - 40, y + 7, P.green3);
          text('绩效', 12, y + 18, '#c8d0f0');
          bar(42, y + 22, 110, 7, j.perf / 100, P.sky);
          ptextS(`${Math.round(j.perf)}/100`, 158, y + 23, P.white);
          const need = sim.promoReq(id);
          const msg = need === null ? '已经是最高职位!' : need.length ? `升职还需:${need.join('、')}` : '技能已达标,绩效满即可升职';
          text(msg, 12, y + 33, need && need.length ? '#ffc0a0' : '#b0f0a0');
        }
        y += 56;
      }
    },
    // 目标
    draw4() {
      const S = sim.S;
      if (S.chapter >= CHAPTERS.length) {
        text('全部章节完成!', 10, 26, P.uiSel);
        text('你已经在绿钻镇过上了梦想生活。', 10, 42, P.white);
        text('继续自由生活吧——', 10, 56, P.white);
        return;
      }
      const st = sim.chapterStatus();
      text(st.ch.title, 8, 22, P.uiSel);
      wrap(st.ch.intro, W - 20).slice(0, 2).forEach((ln, k) => text(ln, 8, 36 + k * 12, '#c8d8ff'));
      st.goals.forEach((g, i) => {
        const yy = 66 + i * 18;
        rect(10, yy + 1, 11, 11, P.ink); rect(11, yy + 2, 9, 9, g.done ? P.green : '#2c3c78');
        if (g.done) ctx.drawImage(icon('check'), 11, yy + 2);
        text(g.text, 26, yy, g.done ? '#a0e890' : P.white);
      });
      if (st.ch.reward) text(`奖励 §${st.ch.reward}`, 8, H - 20, P.yellow);
    },
    // 背包
    draw5() {
      const S = sim.S;
      text('随身物品', 8, 22, P.uiSel);
      const rows = [
        ['fish', `鲜鱼 ×${S.inv.fish}`, '卖给咖啡馆柜台'],
        ['creativity', `画作 ×${S.inv.painting}`, '卖给家具店收银台'],
        ['money', `存款 §${S.money}`, S.bill ? `待缴账单 §${S.bill.amount}` : '暂无账单'],
      ];
      rows.forEach(([ic, a, b], i) => {
        const yy = 38 + i * 20;
        ctx.drawImage(icon(ic), 10, yy + 2);
        text(a, 24, yy, P.white); text(b, 120, yy, '#a8c0f0');
      });
      text('已购家具', 8, 100, P.uiSel);
      const owned = Object.keys(S.owned).map((k) => sim.SHOP.find((s) => s.id === k)?.name).filter(Boolean);
      wrap(owned.length ? owned.join('、') : '(还没有)', W - 20).slice(0, 3).forEach((ln, k) => text(ln, 8, 114 + k * 12, P.white));
    },
    draw6() {
      const items = this.items();
      items.forEach((it, i) => {
        const yy = 28 + i * 18;
        text(it.label, 30, yy, i === this.sel ? P.uiSel : P.white);
        if (i === this.sel) cursor(18, yy + 3, t);
      });
      text(`存档:本机 localStorage`, 8, H - 20, '#a8c0f0');
    },
  };
  return ui.push(layer);
}

export { t as uiTime };
