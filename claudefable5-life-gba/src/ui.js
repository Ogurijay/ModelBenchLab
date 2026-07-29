// ui.js — GBA 式 UI 组件:打字机对话框、选项菜单、浮动提示、头顶气泡、HUD、淡入淡出
import { ptext, wrapText, drawWindow, drawPanel, drawBar, measureText } from './text.js';
import { NEEDS, WEEKDAYS, JOB_TITLES } from './sim.js';

export class UI {
  constructor(art) {
    this.art = art;
    // 对话
    this.dialogQueue = [];   // {text, name, cb}
    this.dialog = null;
    this.charT = 0;
    // 选项
    this.choice = null;      // {items, title, cb, idx, allowCancel}
    // 浮动提示
    this.toasts = [];        // {text, icon, ttl}
    // 头顶气泡
    this.bubbles = [];       // {get x,y | x,y, icon, ttl}
    // 淡入淡出
    this.fade = { a: 0, phase: null, cb: null, speed: 2.2 };
    this.hudHidden = false;
    this.blinkT = 0;
  }

  get busy() { return !!this.dialog || !!this.choice || this.dialogQueue.length > 0; }

  // ---------- 对话 ----------
  say(text, opts = {}) {
    const arr = Array.isArray(text) ? text : [text];
    arr.forEach((t, i) => this.dialogQueue.push({
      text: t,
      name: opts.name || null,
      cb: i === arr.length - 1 ? opts.cb || null : null,
    }));
  }

  choose(items, opts = {}) {
    this.choice = {
      items,
      title: opts.title || null,
      cb: opts.cb || (() => {}),
      idx: 0,
      allowCancel: opts.allowCancel !== false,
    };
  }

  toast(text, icon = null) {
    this.toasts.push({ text, icon, ttl: 2.2, y: 0 });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  bubble(host, icon, ttl = 1.8) {
    this.bubbles.push({ host, icon, ttl, t: 0 });
  }

  fadeTo(cb, speed = 2.6) {
    this.fade = { a: 0, phase: 'out', cb, speed };
  }

  // ---------- 更新(返回 true 表示输入被 UI 消耗) ----------
  update(dt, Input, Audio) {
    this.blinkT += dt;
    // fade
    const F = this.fade;
    if (F.phase === 'out') {
      F.a += F.speed * dt;
      if (F.a >= 1) { F.a = 1; F.phase = 'in'; if (F.cb) { const cb = F.cb; F.cb = null; cb(); } }
      return true;
    }
    if (F.phase === 'in') {
      F.a -= F.speed * dt;
      if (F.a <= 0) { F.a = 0; F.phase = null; }
    }

    for (const t of this.toasts) t.ttl -= dt;
    this.toasts = this.toasts.filter((t) => t.ttl > 0);
    for (const b of this.bubbles) { b.ttl -= dt; b.t += dt; }
    this.bubbles = this.bubbles.filter((b) => b.ttl > 0);

    // 选项优先
    if (this.choice) {
      const c = this.choice;
      if (Input.rep('UP')) { c.idx = (c.idx + c.items.length - 1) % c.items.length; Audio.sfx('blip'); }
      if (Input.rep('DOWN')) { c.idx = (c.idx + 1) % c.items.length; Audio.sfx('blip'); }
      if (Input.pressed('A')) {
        const item = c.items[c.idx];
        if (item.disabled) { Audio.sfx('error'); }
        else {
          Audio.sfx('ok');
          this.choice = null;
          c.cb(c.idx);
        }
      } else if (Input.pressed('B') && c.allowCancel) {
        Audio.sfx('cancel');
        this.choice = null;
        c.cb(-1);
      }
      return true;
    }

    // 对话
    if (!this.dialog && this.dialogQueue.length) {
      this.dialog = this.dialogQueue.shift();
      this.charT = 0;
    }
    if (this.dialog) {
      const full = this.dialog.text.length;
      this.charT += dt * 28;
      if (Input.pressed('A') || Input.pressed('B')) {
        if (this.charT < full) { this.charT = full; }
        else {
          Audio.sfx('blip');
          const done = this.dialog;
          this.dialog = null;
          if (done.cb) done.cb();
        }
      }
      return true;
    }
    return false;
  }

  // ---------- 世界层(气泡跟随镜头) ----------
  drawBubbles(ctx, cam) {
    for (const b of this.bubbles) {
      const hx = (typeof b.host.px === 'number' ? b.host.px : b.host.x);
      const hy = (typeof b.host.py === 'number' ? b.host.py : b.host.y);
      const x = Math.round(hx) - cam.x + 8;
      const bob = Math.round(Math.sin(b.t * 6) * 1.5);
      const y = Math.round(hy) - cam.y - 14 + bob;
      const X = (x - 7) * 2, Y = (y - 12) * 2;
      ctx.fillStyle = '#20203c';
      ctx.fillRect(X - 2, Y - 2, 32, 28);
      ctx.fillStyle = '#f8f8f4';
      ctx.fillRect(X, Y, 28, 24);
      // 尾巴
      ctx.fillStyle = '#f8f8f4';
      ctx.fillRect(X + 10, Y + 24, 6, 4);
      ctx.fillStyle = '#20203c';
      ctx.fillRect(X + 8, Y + 24, 2, 6); ctx.fillRect(X + 16, Y + 24, 2, 6);
      const icon = this.art.icons[b.icon];
      if (icon) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(icon, X + 6, Y + 4, 16, 16);
      }
    }
  }

  // ---------- HUD ----------
  drawHUD(ctx, sim, game) {
    if (this.hudHidden) return;
    const S = sim.state;
    // 左上:钱
    drawPanel(ctx, 3, 3, 58, 14);
    ctx.drawImage(this.art.icons.money, 6 * 2, 6 * 2, 16, 16);
    ptext(ctx, `§${S.money}`, 16, 4, { size: 12, color: '#f8e8a0' });
    // 右上:星期 时间 · 天数
    drawPanel(ctx, 130, 3, 107, 14);
    ptext(ctx, `周${WEEKDAYS[S.weekday - 1]} ${sim.clockText()} 第${S.day}天`, 234, 4, { size: 12, color: '#d8e8f8', align: 'right' });

    // 右下:六需求
    const px = 240 - 79, py = 160 - 42;
    drawPanel(ctx, px, py, 76, 39);
    NEEDS.forEach((nd, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = px + 4 + col * 37, y = py + 4 + row * 11;
      ctx.drawImage(this.art.icons[nd.icon], x * 2, y * 2, 14, 14);
      drawBar(ctx, x + 9, y + 2, 24, 3, S.needs[nd.key] / 100, nd.color);
    });

    // 行动提示 / 加速标记
    if (game.action) {
      drawPanel(ctx, 78, 146, 84, 12);
      ptext(ctx, `B 停止 · 时间×${game.action.speed || 6}`, 120, 147, { size: 12, color: '#c8d8f0', align: 'center' });
    } else if (game.hint && !this.busy) {
      const w = measureText(`A ${game.hint}`, 12) + 16;
      drawPanel(ctx, 120 - w / 2, 145, w, 13);
      ptext(ctx, `A ${game.hint}`, 120, 146, { size: 12, color: '#f8f4d8', align: 'center' });
    }
  }

  // ---------- 覆盖层 ----------
  drawOverlay(ctx) {
    // 提示 toast
    let ty = 22;
    for (const t of this.toasts) {
      const a = Math.min(1, t.ttl / 0.4);
      const w = Math.min(232, measureText(t.text, 12) + (t.icon ? 16 : 0) + 14);
      drawPanel(ctx, 120 - w / 2, ty, w, 14, { alpha: 0.85 * a });
      let tx = 120 - w / 2 + 5;
      if (t.icon && this.art.icons[t.icon]) {
        ctx.save(); ctx.globalAlpha = a;
        ctx.drawImage(this.art.icons[t.icon], tx * 2, (ty + 3) * 2, 16, 16);
        ctx.restore();
        tx += 10;
      }
      ptext(ctx, t.text, tx, ty + 1, { size: 12, color: '#f8f8f0', alpha: a });
      ty += 16;
    }

    // 对话框
    if (this.dialog) {
      const d = this.dialog;
      drawWindow(ctx, 6, 112, 228, 44);
      if (d.name) {
        drawWindow(ctx, 10, 104, d.name.length * 12 + 12, 16, { fill: '#7868c8', accent: '#584898' });
        ptext(ctx, d.name, 16, 106, { size: 12, color: '#f8f8ff' });
      }
      const shown = d.text.slice(0, Math.floor(this.charT));
      const lines = wrapText(shown, 12, 208);
      lines.slice(0, 2).forEach((ln, i) => ptext(ctx, ln, 14, 120 + i * 15, { size: 12, color: '#33334a' }));
      if (this.charT >= d.text.length && Math.floor(this.blinkT * 2.5) % 2 === 0) {
        ptext(ctx, '▼', 222, 146, { size: 10, color: '#7868c8' });
      }
    }

    // 选项菜单
    if (this.choice) {
      const c = this.choice;
      const w = Math.max(96, ...c.items.map((i) => i.label.length * 12 + (i.right ? i.right.length * 12 : 0) + 40), (c.title ? c.title.length * 12 + 24 : 0));
      const h = c.items.length * 15 + 12 + (c.title ? 16 : 0);
      const x = 234 - w, y = 108 - h;
      drawWindow(ctx, x, y, w, h);
      let yy = y + 6;
      if (c.title) {
        ptext(ctx, c.title, x + 8, yy, { size: 12, color: '#7868c8' });
        yy += 16;
      }
      c.items.forEach((item, i) => {
        const sel = i === c.idx;
        if (sel) {
          ctx.fillStyle = '#e8e0f8';
          ctx.fillRect((x + 4) * 2, (yy - 1) * 2, (w - 8) * 2, 15 * 2);
          ptext(ctx, '▶', x + 6, yy + 1, { size: 10, color: '#d8506e' });
        }
        const col = item.disabled ? '#a8a8b8' : '#33334a';
        ptext(ctx, item.label, x + 16, yy, { size: 12, color: col });
        if (item.right) ptext(ctx, item.right, x + w - 8, yy, { size: 12, color: item.disabled ? '#b8a8a8' : '#b06830', align: 'right' });
        yy += 15;
      });
    }

    // fade
    if (this.fade.a > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.fade.a);
      ctx.fillStyle = '#06060f';
      ctx.fillRect(0, 0, 480, 320);
      ctx.restore();
    }
  }

  // ---------- 状态页 ----------
  drawStatus(ctx, sim) {
    const S = sim.state;
    drawWindow(ctx, 12, 6, 216, 148);
    ptext(ctx, `${S.name} 的生活状态`, 120, 12, { size: 12, color: '#33334a', align: 'center' });
    NEEDS.forEach((nd, i) => {
      const y = 30 + i * 13;
      ctx.drawImage(this.art.icons[nd.icon], 22 * 2, y * 2, 16, 16);
      ptext(ctx, nd.label, 34, y, { size: 12, color: '#55556a' });
      drawBar(ctx, 64, y + 4, 86, 4, S.needs[nd.key] / 100, nd.color);
      ptext(ctx, `${Math.round(S.needs[nd.key])}`, 166, y, { size: 12, color: '#33334a', align: 'right' });
    });
    const mood = sim.mood();
    ptext(ctx, `心情`, 180, 30, { size: 12, color: '#55556a' });
    ptext(ctx, `${mood}`, 220, 30, { size: 12, color: mood >= 62 ? '#2e8a44' : mood >= 35 ? '#b07818' : '#c03030', align: 'right' });
    ptext(ctx, `好感`, 180, 46, { size: 12, color: '#55556a' });
    ptext(ctx, `${'♥'.repeat(Math.min(5, S.friendship)) || '—'}`, 220, 46, { size: 12, color: '#d8506e', align: 'right' });
    ptext(ctx, `${JOB_TITLES[S.job.level - 1]} · 绩效${S.job.perf >= 0 ? '+' : ''}${S.job.perf}`, 22, 112, { size: 12, color: '#55556a' });
    ptext(ctx, `账单 ${S.billsDue > 0 ? `§${S.billsDue}${S.power ? '' : ' (已停电!)'}` : '无'}`, 22, 126, { size: 12, color: S.billsDue > 0 ? '#c03030' : '#55556a' });
    ptext(ctx, `累计收入 §${S.stats.earned} · 升职 ${S.stats.promotions} 次`, 22, 140, { size: 12, color: '#8888a0' });
    ptext(ctx, 'B 返回', 218, 12, { size: 12, color: '#8878b8', align: 'right' });
  }
}
