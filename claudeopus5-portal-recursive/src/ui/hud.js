// HUD 与遮罩层。过场用「令牌 + await」实现,任何一次换关/重置都会作废尚未跑完的旧过场,
// 避免排队回调在 0.5 秒后把玩家刚选的关卡覆盖掉。
import { runSelfTest } from '../core/selftest.js';
import { CHAMBERS } from '../levels/index.js';
import { setMuted, isMuted } from '../audio/sfx.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), chamber: $('chamber'), perf: $('perf'),
      chBlue: $('ch-blue'), chOrange: $('ch-orange'),
      deny: $('deny'), banner: $('banner'), hint: $('hint'),
      fade: $('fade'), card: $('fade-card'), fadeNum: $('fade-num'), fadeName: $('fade-name'),
      start: $('start'), pause: $('pause'), complete: $('complete'), stats: $('stats'),
      test: $('test'), testSum: $('test-sum'), testList: $('test-list'), loading: $('loading'),
    };
    this.fadeToken = 0;
    this.bannerTimer = null;
    this.denyTimer = null;
    $('btn-test').onclick = () => this.showTest();
    $('btn-test2').onclick = () => this.showTest();
    $('btn-test-close').onclick = () => this.el.test.classList.add('hidden');
    const syncSound = () => {
      const label = `声音:${isMuted() ? '关' : '开'}`;
      $('btn-sound').textContent = label;
      $('btn-sound2').textContent = label;
    };
    $('btn-sound').onclick = $('btn-sound2').onclick = () => { setMuted(!isMuted()); syncSound(); };
  }

  hideLoading() { this.el.loading.style.display = 'none'; }
  showStart() { this.el.start.classList.remove('hidden'); this.el.hud.classList.add('hidden'); }
  hideStart() { this.el.start.classList.add('hidden'); this.el.hud.classList.remove('hidden'); }
  showPause() { this.el.pause.classList.remove('hidden'); }
  hidePause() { this.el.pause.classList.add('hidden'); }
  hideComplete() { this.el.complete.classList.add('hidden'); }

  setChamber(level) {
    this.el.chamber.textContent =
      `测试室 ${String(level.id).padStart(2, '0')} / ${String(CHAMBERS.length).padStart(2, '0')} — ${level.name}`;
    this.el.hint.textContent = level.hint;
    this.el.chBlue.style.display = level.gun === 'none' ? 'none' : '';
    this.el.chOrange.style.display = level.gun === 'dual' ? '' : 'none';
    this.setPortalState(false, false);
  }

  setPortalState(blue, orange) {
    this.el.chBlue.setAttribute('stroke', blue ? '#2f9bff' : 'rgba(125,155,175,0.4)');
    this.el.chOrange.setAttribute('stroke', orange ? '#ff8a1e' : 'rgba(175,145,115,0.4)');
  }

  banner(text) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('show'), 2600);
  }

  deny(text) {
    const d = this.el.deny;
    d.textContent = text || '无法在此放置';
    d.classList.add('show');
    clearTimeout(this.denyTimer);
    this.denyTimer = setTimeout(() => d.classList.remove('show'), 950);
  }

  perf(fps, depth, draws) {
    this.el.perf.innerHTML = `${Math.round(fps)} FPS<br><span style="opacity:.75">门中门 ${depth} 层 · ${draws} 次绘制</span>`;
  }

  cancelFade() {
    this.fadeToken++;
    this.el.fade.style.transition = 'opacity .2s';
    this.el.fade.style.opacity = 0;
    this.el.fade.style.pointerEvents = 'none';
    this.el.card.classList.add('hidden');
  }

  /** 压黑 → 中场回调(换关) → 揭幕。返回 Promise,便于调用方等待。 */
  async fadeThrough(nextLevel, mid) {
    const token = ++this.fadeToken;
    const f = this.el.fade;
    f.style.transition = 'opacity .42s';
    f.style.opacity = 1;
    f.style.pointerEvents = 'auto';
    await sleep(460);
    if (token !== this.fadeToken) return;
    mid();
    if (nextLevel) {
      this.el.fadeNum.textContent = `测试室 ${String(nextLevel.id).padStart(2, '0')}`;
      this.el.fadeName.textContent = nextLevel.name;
      this.el.card.classList.remove('hidden');
      await sleep(820);
    } else {
      await sleep(120);
    }
    if (token !== this.fadeToken) return;
    f.style.transition = 'opacity .8s';
    f.style.opacity = 0;
    f.style.pointerEvents = 'none';
    await sleep(900);
    if (token === this.fadeToken) this.el.card.classList.add('hidden');
  }

  showComplete(stats) {
    try { document.exitPointerLock(); } catch { /* 自动化环境无指针锁 */ }
    this.el.hud.classList.add('hidden');
    this.el.complete.classList.remove('hidden');
    const m = Math.floor(stats.time / 60);
    const s = Math.floor(stats.time % 60);
    this.el.stats.innerHTML = `
      <div><span>${m}:${String(s).padStart(2, '0')}</span><label>用时</label></div>
      <div><span>${stats.shots}</span><label>发射次数</label></div>
      <div><span>${stats.teleports}</span><label>穿越次数</label></div>
      <div><span>${stats.deaths}</span><label>重新部署</label></div>`;
  }

  buildChips(unlocked, current, onPick) {
    for (const id of ['chips', 'chips2']) {
      const wrap = $(id);
      wrap.innerHTML = '';
      CHAMBERS.forEach((c, i) => {
        const chip = document.createElement('button');
        const locked = i > unlocked;
        chip.className = 'chip' + (i === current ? ' active' : '') + (locked ? ' locked' : '');
        chip.textContent = locked ? `🔒 ${String(c.id).padStart(2, '0')}` : `${String(c.id).padStart(2, '0')} ${c.name}`;
        if (!locked) chip.onclick = () => onPick(i);
        wrap.appendChild(chip);
      });
    }
  }

  showTest() {
    const r = runSelfTest();
    this.el.testSum.innerHTML = r.passed === r.total
      ? `<span class="ok">✓ 全部通过 ${r.passed}/${r.total}</span>`
      : `<span class="no">✗ 通过 ${r.passed}/${r.total}</span>`;
    const fmt = (v) => `(${v.map((x) => (Math.abs(x) < 1e-9 ? 0 : +x.toFixed(4))).join(', ')})`;
    this.el.testList.innerHTML = r.cases.map((c) => `
      <li class="${c.pass ? 'ok' : 'no'}"><b>${c.pass ? '✓' : '✗'}</b> ${c.name}
      <small>${c.io} · 期望 ${fmt(c.want)} · 实际 ${fmt(c.got)}</small></li>`).join('');
    this.el.test.classList.remove('hidden');
  }
}
