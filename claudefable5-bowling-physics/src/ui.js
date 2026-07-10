/**
 * 中文 HTML UI:记分板(当前轮高亮)、三参数控制、自测面板、结算弹窗。
 */
import { Phase } from './game.js';
import { runScoreTests } from './scoring-test.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      status: $('status'),
      scoreboard: $('scoreboard'),
      aimValue: $('aim-value'),
      spinValue: $('spin-value'),
      spinSlider: $('spin'),
      powerValue: $('power-value'),
      powerFill: $('power-fill'),
      btnThrow: $('btn-throw'),
      btnTest: $('btn-test'),
      btnRestart: $('btn-restart'),
      btnSound: $('btn-sound'),
      btnAgain: $('btn-again'),
      callout: $('callout'),
      fps: $('fps'),
      testPanel: $('test-panel'),
      testSummary: $('test-summary'),
      testList: $('test-list'),
      btnTestClose: $('btn-test-close'),
      gameover: $('gameover'),
      finalScore: $('final-score'),
      finalComment: $('final-comment'),
      finalDetail: $('final-detail'),
      hint: $('hint'),
      loading: $('loading'),
    };
    this._calloutTimer = null;
  }

  /** 绑定交互(由 main.js 在 game 创建后调用) */
  bind({ game, audio }) {
    const wake = () => audio.ensure();

    this.el.btnThrow.addEventListener('click', () => {
      wake();
      game.primaryAction();
    });
    $('aim-left').addEventListener('click', () => {
      wake();
      game.adjustAim(-0.8);
    });
    $('aim-right').addEventListener('click', () => {
      wake();
      game.adjustAim(0.8);
    });
    this.el.spinSlider.addEventListener('input', (e) => {
      wake();
      game.setSpin(Number(e.target.value) / 100);
    });
    this.el.btnRestart.addEventListener('click', () => {
      wake();
      audio.click();
      game.reset();
    });
    this.el.btnAgain.addEventListener('click', () => {
      wake();
      audio.click();
      game.reset();
    });
    this.el.btnTest.addEventListener('click', () => {
      wake();
      audio.click();
      this.showTestResults(runScoreTests());
    });
    this.el.btnTestClose.addEventListener('click', () => {
      audio.click();
      this.el.testPanel.classList.add('hidden');
    });
    this.el.btnSound.addEventListener('click', () => {
      wake();
      audio.setEnabled(!audio.enabled);
      this.el.btnSound.textContent = audio.enabled ? '声音:开' : '声音:关';
      if (audio.enabled) audio.click();
    });

    window.addEventListener('keydown', (e) => {
      if (e.repeat && e.code === 'Space') return;
      switch (e.code) {
        case 'ArrowLeft':
          wake();
          game.adjustAim(-0.45);
          e.preventDefault();
          break;
        case 'ArrowRight':
          wake();
          game.adjustAim(0.45);
          e.preventDefault();
          break;
        case 'Space':
          wake();
          if (!this.el.gameover.classList.contains('hidden')) {
            game.reset();
          } else {
            game.primaryAction();
          }
          e.preventDefault();
          break;
        default:
          break;
      }
    });
  }

  // ---------- 记分板 ----------
  /** result 为 scoring.score() 输出;currentFrame 0~9,-1 表示无高亮 */
  renderScoreboard(result, currentFrame) {
    const parts = [];
    result.frames.forEach((f, i) => {
      const isTenth = i === 9;
      const slots = isTenth ? 3 : 2;
      const boxes = [];
      for (let j = 0; j < slots; j++) {
        boxes.push(this._rollBox(f.rolls, j, isTenth));
      }
      const cum = f.cumulative === null ? '&nbsp;' : f.cumulative;
      const pend = f.cumulative === null ? ' pending' : '';
      parts.push(
        `<div class="frame-cell${isTenth ? ' f10' : ''}${i === currentFrame ? ' current' : ''}">` +
          `<div class="frame-num">${i + 1}</div>` +
          `<div class="frame-rolls">${boxes.join('')}</div>` +
          `<div class="frame-cum${pend}">${cum}</div>` +
          `</div>`
      );
    });
    this.el.scoreboard.innerHTML = parts.join('');
  }

  _rollBox(rolls, j, isTenth) {
    const v = rolls[j];
    if (v === undefined) return '<div class="roll-box"></div>';
    let text;
    let cls = '';
    const prev = rolls[j - 1];
    if (v === 10 && (j === 0 || (isTenth && (prev === 10 || (j === 2 && rolls[0] !== 10 && rolls[0] + rolls[1] === 10))))) {
      text = 'X';
      cls = 'strike';
    } else if (j > 0 && prev !== 10 && prev + v === 10) {
      text = '/';
      cls = 'spare';
    } else if (v === 10) {
      // 第 10 轮重摆后的全倒
      text = 'X';
      cls = 'strike';
    } else if (v === 0) {
      text = '-';
      cls = 'gutter';
    } else {
      text = String(v);
    }
    return `<div class="roll-box ${cls}">${text}</div>`;
  }

  // ---------- 状态 / 参数 ----------
  setStatus(text) {
    this.el.status.textContent = text;
  }

  setAimReadout(deg) {
    const label = deg === 0 ? '正中' : deg < 0 ? '左' : '右';
    this.el.aimValue.textContent = `${label} ${Math.abs(deg).toFixed(1)}°`;
  }

  setSpinReadout(spin) {
    const pct = Math.round(Math.abs(spin) * 100);
    this.el.spinValue.textContent = spin === 0 ? '无旋' : spin < 0 ? `左曲 ${pct}%` : `右曲 ${pct}%`;
    if (Number(this.el.spinSlider.value) !== Math.round(spin * 100)) {
      this.el.spinSlider.value = Math.round(spin * 100);
    }
  }

  setPower(p) {
    this.el.powerFill.style.width = `${(p * 100).toFixed(1)}%`;
    this.el.powerValue.textContent = `${Math.round(p * 100)}%`;
  }

  setPhase(phase) {
    const b = this.el.btnThrow;
    if (phase === Phase.AIMING) {
      b.disabled = false;
      b.innerHTML = '开始蓄力<small>空格</small>';
      this.el.hint.textContent = '← → 瞄准 · 拖动滑杆加侧旋 · 空格开始蓄力,再按空格定格出手';
    } else if (phase === Phase.POWER) {
      b.disabled = false;
      b.innerHTML = '出手!<small>空格</small>';
      this.el.hint.textContent = '看准时机 —— 再按空格 / 点击按钮定格力度出手!';
    } else if (phase === Phase.GAME_OVER) {
      b.disabled = true;
      b.innerHTML = '一局结束<small>&nbsp;</small>';
      this.el.hint.textContent = '按空格或点击「再来一局」重新开始';
    } else {
      b.disabled = true;
      b.innerHTML = '球道运转中…<small>&nbsp;</small>';
      this.el.hint.textContent = '球在路上 —— 看看能倒几瓶!';
    }
    if (phase !== Phase.POWER && phase !== Phase.ROLLING) {
      if (phase === Phase.AIMING) this.setPower(0.75);
    }
  }

  // ---------- 横幅 ----------
  showCallout(text, tone = 'pink') {
    const c = this.el.callout;
    c.className = '';
    if (tone === 'cyan') c.classList.add('cyan');
    if (tone === 'dim') c.classList.add('dim');
    c.textContent = text;
    // 重新触发动画
    void c.offsetWidth;
    c.classList.remove('hidden');
    clearTimeout(this._calloutTimer);
    this._calloutTimer = setTimeout(() => c.classList.add('hidden'), 1700);
  }

  setFps(fps) {
    this.el.fps.textContent = `${fps.toFixed(0)} FPS`;
  }

  // ---------- 自测面板 ----------
  showTestResults(result) {
    const ok = result.passed === result.total;
    this.el.testSummary.innerHTML = ok
      ? `<span class="all-pass">✔ 全部通过 ${result.passed} / ${result.total}</span>`
      : `<span class="has-fail">✘ 通过 ${result.passed} / ${result.total}</span>`;
    this.el.testList.innerHTML = result.results
      .map(
        (r) =>
          `<li class="${r.pass ? 'pass' : 'fail'}">` +
          `<span class="t-badge">${r.pass ? 'PASS' : 'FAIL'}</span>` +
          `<span class="t-name">${r.name}</span>` +
          `<span class="t-score">期望 ${r.expected} / 实得 ${r.error ? '异常' : r.actual}</span>` +
          `</li>`
      )
      .join('');
    this.el.testPanel.classList.remove('hidden');
  }

  // ---------- 结算 ----------
  showGameOver(total, comment, detail) {
    this.el.finalScore.textContent = total;
    this.el.finalComment.textContent = comment;
    this.el.finalDetail.textContent = detail;
    this.el.gameover.classList.remove('hidden');
  }

  hideGameOver() {
    this.el.gameover.classList.add('hidden');
  }

  hideLoading() {
    this.el.loading.classList.add('fade');
  }
}
