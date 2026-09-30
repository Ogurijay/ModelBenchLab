// 三个覆盖层:开始 / 暂停 / 自检结果。
//
// Overlay 只管「显示什么、什么时候锁指针」,不碰仿真 —— 所有动作都通过回调抛给 main.js。
// 指针锁的得失是暂停的**唯一事实源**:浏览器按 Esc 时自己解锁,监听 pointerlockchange
// 比监听 keydown 可靠(锁定态下 Esc 的 keydown 在部分浏览器里根本不派发)。
import { KEY_HINTS, AUTO_HINTS } from './hud.js';

const $ = (id) => document.getElementById(id);

/**
 * 「让出一帧」的兜底时长(ms)。后台标签页里 rAF 不触发,只等它会把自检面板永久卡在「运行中…」。
 * 取 200 ms:前台正常 rAF(≤ 16.7 ms)永远先到,所以它只在 rAF 停摆时才起作用。
 */
const YIELD_FALLBACK_MS = 200;

/** 自检报告里的数值统一 %.0f。 */
function int(v) {
  const n = Math.round(Number.isFinite(v) ? v : 0);
  return n === 0 ? 0 : n;
}

/** expect 可能是单个状态名也可能是一组;absent 为真时是「必须不出现」(第 12 项)。 */
function formatExpect(c) {
  const want = Array.isArray(c.expect) ? c.expect.join(' / ') : c.expect || '—';
  return c.absent ? `不得出现 ${want}` : `出现 ${want}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
}

export class Overlay {
  /**
   * @param {{ canvas?: HTMLElement|null }} opts
   *        给了 canvas 就由 Overlay 负责请求/释放指针锁,并在锁丢失时自动暂停。
   */
  constructor({ canvas = null } = {}) {
    this.canvas = canvas;

    this.el = {
      loading: $('loading'),
      start: $('start'),
      pause: $('pause'),
      selftest: $('selftest'),
      startKeys: $('start-keys'),
      startAuto: $('start-auto'),
      stSum: $('st-sum'),
      stList: $('st-list'),
      btnStart: $('btn-start'),
      btnSelfTest: $('btn-selftest'),
      btnResume: $('btn-resume'),
      btnRestart: $('btn-restart'),
      btnSelfTest2: $('btn-selftest2'),
      btnTrace: $('btn-trace'),
      btnStRun: $('btn-st-run'),
      btnStCopy: $('btn-st-copy'),
      btnStClose: $('btn-st-close'),
    };

    /** 'start' | 'running' | 'paused' */
    this.state = 'start';
    /** 拿到过指针锁才允许「丢锁 → 暂停」,否则首帧请求失败会立刻弹暂停。 */
    this._hadLock = false;
    this._lastResult = null;
    this._running = false;

    // main.js 的挂点。都可选,没挂就只做 UI 动作。
    this.onStart = null;
    this.onResume = null;
    this.onPause = null;
    this.onRestart = null;
    this.onRunSelfTest = null;
    this.onToggleTrace = null;

    this._renderKeyHints();
    this._wire();
  }

  // -------------------------------------------------------------------------
  // 静态内容
  // -------------------------------------------------------------------------

  _renderKeyHints() {
    if (this.el.startKeys) {
      this.el.startKeys.innerHTML = KEY_HINTS.map(
        (h) => `<span><b>${escapeHtml(h.key)}</b>${escapeHtml(h.desc)}</span>`
      ).join('');
    }
    if (this.el.startAuto) {
      this.el.startAuto.innerHTML = AUTO_HINTS.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
    }
  }

  _wire() {
    if (this.el.btnStart) this.el.btnStart.onclick = () => this.start();
    if (this.el.btnResume) this.el.btnResume.onclick = () => this.resume();
    if (this.el.btnRestart) this.el.btnRestart.onclick = () => this.restart();
    if (this.el.btnSelfTest) this.el.btnSelfTest.onclick = () => this.showSelfTest(true);
    if (this.el.btnSelfTest2) this.el.btnSelfTest2.onclick = () => this.showSelfTest(true);
    if (this.el.btnStRun) this.el.btnStRun.onclick = () => this.runSelfTest();
    if (this.el.btnStClose) this.el.btnStClose.onclick = () => this.hideSelfTest();
    if (this.el.btnStCopy) this.el.btnStCopy.onclick = () => this._copyResult();
    if (this.el.btnTrace) {
      this.el.btnTrace.onclick = () => {
        const on = this.onToggleTrace ? this.onToggleTrace() : false;
        this.el.btnTrace.textContent = `轨迹:${on ? '开' : '关'}`;
      };
    }

    document.addEventListener('pointerlockchange', () => {
      const locked = this.canvas ? document.pointerLockElement === this.canvas : false;
      if (locked) {
        this._hadLock = true;
        return;
      }
      if (this._hadLock && this.state === 'running') this.pause();
      this._hadLock = false;
    });

    // 没有指针锁的环境(自动化截图、指针锁被策略禁用)也要能暂停。
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (this.isSelfTestOpen()) {
        this.hideSelfTest();
        return;
      }
      if (this.state === 'running') this.pause();
    });
  }

  // -------------------------------------------------------------------------
  // 状态切换
  // -------------------------------------------------------------------------

  hideLoading() {
    if (this.el.loading) this.el.loading.style.display = 'none';
  }

  isRunning() {
    return this.state === 'running';
  }

  _lockPointer() {
    if (!this.canvas || !this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock();
      // Esc 解锁后的短时间内浏览器会拒绝再次锁定 —— 静默吞掉,不要污染控制台。
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* 无指针锁的环境:照常进游戏,只是转不了视角 */
    }
  }

  _unlockPointer() {
    try {
      document.exitPointerLock();
    } catch {
      /* 同上 */
    }
  }

  showStart() {
    this.state = 'start';
    this._hadLock = false;
    this._toggle(this.el.start, true);
    this._toggle(this.el.pause, false);
    this._unlockPointer();
  }

  start() {
    this._toggle(this.el.start, false);
    this._toggle(this.el.pause, false);
    this.state = 'running';
    this._lockPointer();
    if (this.onStart) this.onStart();
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this._toggle(this.el.pause, true);
    this._unlockPointer();
    if (this.onPause) this.onPause();
  }

  resume() {
    this._toggle(this.el.pause, false);
    this.state = 'running';
    this._lockPointer();
    if (this.onResume) this.onResume();
  }

  restart() {
    if (this.onRestart) this.onRestart();
    this.resume();
  }

  _toggle(el, show) {
    if (el) el.classList.toggle('hidden', !show);
  }

  // -------------------------------------------------------------------------
  // 自检面板
  // -------------------------------------------------------------------------

  isSelfTestOpen() {
    return !!this.el.selftest && !this.el.selftest.classList.contains('hidden');
  }

  /** @param {boolean} autoRun 从菜单点进来就直接跑一遍,少一次点击。 */
  showSelfTest(autoRun = false) {
    this._toggle(this.el.selftest, true);
    if (autoRun && !this._lastResult) this.runSelfTest();
  }

  hideSelfTest() {
    this._toggle(this.el.selftest, false);
  }

  /**
   * 跑一遍 13 项自检并渲染。runner 由 main.js 注入(通常就是 core/selftest.js 的 runSelfTest),
   * 允许返回 Promise —— 13 项合计约 30 s 仿真、3600 步,先让浏览器把「运行中」画出来再算。
   */
  async runSelfTest() {
    if (this._running) return null;
    const runner = this.onRunSelfTest;
    if (!runner) {
      this._renderMessage('没有挂 onRunSelfTest —— main.js 需要把 runSelfTest 递进来。', false);
      return null;
    }
    this._running = true;
    this._renderMessage('运行中…', null);
    if (this.el.btnStRun) this.el.btnStRun.disabled = true;
    // 让出一帧,否则同步的仿真会把「运行中」那次重绘一起吃掉。
    //
    // **不能只等 rAF**:隐藏 / 被遮挡的标签页里 rAF 根本不触发,那个 await 就永不返回 ——
    // 面板停在「运行中…」、`_running` 保持 true、按钮被永久禁用,而后台无头验证/截图
    // 恰恰是本仓库最常用的路子。所以拿 setTimeout 兜底,谁先到算谁。
    await new Promise((resolve) => {
      let done = false;
      const settle = () => { if (!done) { done = true; resolve(); } };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(settle);
      setTimeout(settle, YIELD_FALLBACK_MS);
    });
    try {
      const result = await Promise.resolve(runner());
      this._lastResult = result;
      this._render(result);
      return result;
    } catch (err) {
      this._renderMessage(`自检抛异常:${escapeHtml(err && err.message ? err.message : err)}`, false);
      return null;
    } finally {
      this._running = false;
      if (this.el.btnStRun) this.el.btnStRun.disabled = false;
    }
  }

  _renderMessage(text, ok) {
    if (this.el.stSum) {
      const cls = ok === null ? 'run' : ok ? 'ok' : 'no';
      this.el.stSum.innerHTML = `<span class="${cls}">${text}</span>`;
    }
    if (this.el.stList) this.el.stList.innerHTML = '';
  }

  _render(result) {
    const cases = (result && result.cases) || [];
    const total = (result && result.total) || cases.length;
    const passed = (result && result.passed) || cases.filter((c) => c.pass).length;

    if (this.el.stSum) {
      this.el.stSum.innerHTML =
        passed === total && total > 0
          ? `<span class="ok">全部通过 ${passed}/${total}</span>`
          : `<span class="no">通过 ${passed}/${total}</span>`;
    }
    if (!this.el.stList) return;

    this.el.stList.innerHTML = cases
      .map((c, i) => {
        const seen = (c.seen || []).join(' → ') || '(空)';
        const detail = c.detail ? `<div class="st-detail">${escapeHtml(c.detail)}</div>` : '';
        return `<li class="${c.pass ? 'ok' : 'no'}">
          <b>${c.pass ? 'PASS' : 'FAIL'}</b>
          <span class="st-no">${String(i + 1).padStart(2, '0')}</span>
          <span class="st-name">${escapeHtml(c.name || '')}</span>
          <span class="st-want">${escapeHtml(formatExpect(c))}</span>
          <span class="st-seen">见到 ${escapeHtml(seen)}</span>
          <small>峰值 ${int(c.peakSpeed)} · 最大下降 ${int(c.peakDescent)}</small>
          ${detail}
        </li>`;
      })
      .join('');
  }

  /** 把结果拷成纯文本 —— 写 HANDOVER 的「与 UE 的数值差异」时直接粘。 */
  _copyResult() {
    const r = this._lastResult;
    if (!r) return;
    const lines = [`self-test ${r.passed}/${r.total}`];
    for (const [i, c] of (r.cases || []).entries()) {
      lines.push(
        `${c.pass ? 'PASS' : 'FAIL'} ${String(i + 1).padStart(2, '0')} ${c.name} | ` +
          `${formatExpect(c)} | seen=${(c.seen || []).join(',')} | ` +
          `peakSpeed=${int(c.peakSpeed)} peakDescent=${int(c.peakDescent)}`
      );
    }
    const text = lines.join('\n');
    const done = () => {
      if (this.el.btnStCopy) {
        this.el.btnStCopy.textContent = '已复制';
        setTimeout(() => {
          if (this.el.btnStCopy) this.el.btnStCopy.textContent = '复制结果';
        }, 1200);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => {});
    }
  }
}
