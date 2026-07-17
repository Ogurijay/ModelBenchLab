// UI 层:HUD / 横幅 / 过场 / 弹窗 / 选关 — 全中文
import { runPortalTests } from './portal-test.js';
import { setMuted, isMuted } from './audio.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      hud: $('hud'),
      chamberLabel: $('chamber-label'),
      fps: $('fps'),
      chBlue: $('ch-blue'),
      chOrange: $('ch-orange'),
      deny: $('deny-flash'),
      banner: $('banner'),
      hint: $('hint'),
      keysHelp: $('keys-help'),
      fade: $('fade'),
      fadeCard: $('fade-card'),
      fadeNum: $('fade-num'),
      fadeName: $('fade-name'),
      start: $('start-overlay'),
      pause: $('pause-overlay'),
      complete: $('complete-overlay'),
      completeStats: $('complete-stats'),
      testModal: $('test-modal'),
      testSummary: $('test-summary'),
      testList: $('test-list'),
      loading: $('loading'),
    };
    this.bannerTimer = null;
    this.denyTimer = null;
    this.shownHints = new Set();

    const bindTest = (btn) => btn.addEventListener('click', () => this.showTestModal());
    bindTest($('btn-test'));
    bindTest($('btn-test2'));
    $('btn-test-close').addEventListener('click', () => this.el.testModal.classList.add('hidden'));
    const syncSound = () => {
      const label = `声音:${isMuted() ? '关' : '开'}`;
      $('btn-sound').textContent = label;
      $('btn-sound2').textContent = label;
    };
    for (const id of ['btn-sound', 'btn-sound2']) {
      $(id).addEventListener('click', () => { setMuted(!isMuted()); syncSound(); });
    }
  }

  hideLoading() { this.el.loading.style.display = 'none'; }

  // ── 遮罩状态 ──
  showStart() { this.el.start.classList.remove('hidden'); this.el.hud.classList.add('hidden'); }
  hideStart() { this.el.start.classList.add('hidden'); this.el.hud.classList.remove('hidden'); }
  showPause() { this.el.pause.classList.remove('hidden'); }
  hidePause() { this.el.pause.classList.add('hidden'); }

  showComplete(stats) {
    try { document.exitPointerLock(); } catch { /* 自动化环境无指针锁 */ }
    this.el.hud.classList.add('hidden');
    this.el.complete.classList.remove('hidden');
    const mins = Math.floor(stats.time / 60);
    const secs = Math.floor(stats.time % 60);
    this.el.completeStats.innerHTML = `
      <div><span>${mins}:${String(secs).padStart(2, '0')}</span><label>用时</label></div>
      <div><span>${stats.portals}</span><label>发射传送门</label></div>
      <div><span>${stats.teleports}</span><label>穿越次数</label></div>
      <div><span>${stats.deaths}</span><label>重新部署</label></div>
    `;
    this.el.fade.style.opacity = 0;
  }

  hideComplete() { this.el.complete.classList.add('hidden'); }

  // ── 关卡信息 ──
  setChamber(level, index, total) {
    this.el.chamberLabel.textContent = `测试室 ${String(level.id).padStart(2, '0')} / ${String(total).padStart(2, '0')} — ${level.name}`;
    this.el.hint.textContent = level.hint;
    this.setGunMode(level.gun);
    this.setPortalState(false, false);
  }

  setGunMode(mode) {
    this.el.chBlue.style.display = mode === 'none' ? 'none' : '';
    this.el.chOrange.style.display = mode === 'dual' ? '' : 'none';
  }

  setPortalState(bluePlaced, orangePlaced) {
    this.el.chBlue.setAttribute('stroke', bluePlaced ? '#2f9bff' : 'rgba(120,150,170,0.45)');
    this.el.chOrange.setAttribute('stroke', orangePlaced ? '#ff8a1e' : 'rgba(170,140,110,0.45)');
  }

  banner(text) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('show'), 2600);
  }

  hintOnce(text) {
    if (this.shownHints.has(text)) return;
    this.shownHints.add(text);
    this.banner(text);
  }

  denyFlash(text) {
    const d = this.el.deny;
    d.textContent = text || '无法在此放置';
    d.classList.add('show');
    clearTimeout(this.denyTimer);
    this.denyTimer = setTimeout(() => d.classList.remove('show'), 900);
  }

  setFps(v) { this.el.fps.textContent = `${Math.round(v)} FPS`; }

  // ── 过场:压黑 → 中场回调(换关) → 揭幕 + 标题卡 ──
  // 计时器句柄全部登记,新过场开始时取消旧的(防止排队回调覆盖后来的重置/选关)
  fadeTransition(nextLevel, midFn) {
    const f = this.el.fade;
    this.cancelTransition();
    f.style.transition = 'opacity 0.45s';
    f.style.opacity = 1;
    f.style.pointerEvents = 'auto';
    this.transTimers.push(setTimeout(() => {
      midFn();
      if (nextLevel) {
        this.el.fadeNum.textContent = `测试室 ${String(nextLevel.id).padStart(2, '0')}`;
        this.el.fadeName.textContent = nextLevel.name;
        this.el.fadeCard.classList.remove('hidden');
      }
      this.transTimers.push(setTimeout(() => {
        f.style.transition = 'opacity 0.8s';
        f.style.opacity = 0;
        f.style.pointerEvents = 'none';
        this.transTimers.push(setTimeout(() => this.el.fadeCard.classList.add('hidden'), 1400));
      }, nextLevel ? 900 : 100));
    }, 500));
  }

  cancelTransition() {
    for (const t of this.transTimers || []) clearTimeout(t);
    this.transTimers = [];
    this.el.fade.style.opacity = 0;
    this.el.fade.style.pointerEvents = 'none';
    this.el.fadeCard.classList.add('hidden');
  }

  // ── 选关 chips ──
  buildChamberSelect(chambers, unlocked, current, onPick) {
    for (const id of ['chamber-select', 'chamber-select2']) {
      const wrap = $(id);
      wrap.innerHTML = '';
      chambers.forEach((c, i) => {
        const chip = document.createElement('button');
        chip.className = 'chip' + (i === current ? ' active' : '') + (i > unlocked ? ' locked' : '');
        chip.textContent = i > unlocked ? `🔒 ${String(c.id).padStart(2, '0')}` : `${String(c.id).padStart(2, '0')} ${c.name}`;
        if (i <= unlocked) chip.addEventListener('click', () => onPick(i));
        wrap.appendChild(chip);
      });
    }
  }

  // ── 传送逻辑自测弹窗 ──
  showTestModal() {
    const r = runPortalTests();
    this.el.testSummary.innerHTML = r.passed === r.total
      ? `<span class="pass">✓ 全部通过 ${r.passed}/${r.total}</span>`
      : `<span class="fail">✗ 通过 ${r.passed}/${r.total}</span>`;
    const fmt = (v) => `(${v.map((x) => (Math.abs(x) < 1e-9 ? '0' : +x.toFixed(4))).join(', ')})`;
    this.el.testList.innerHTML = r.cases.map((c) => `
      <li class="${c.pass ? 'pass' : 'fail'}">
        <b>${c.pass ? '✓' : '✗'}</b> ${c.name}
        <small>期望 ${fmt(c.expect)} · 实际 ${fmt(c.got)}</small>
      </li>
    `).join('');
    this.el.testModal.classList.remove('hidden');
  }
}
