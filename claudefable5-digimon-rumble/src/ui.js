// DOM UI:屏幕切换 / 战斗 HUD / 中央播报 / 伤害飘字 / 选人网格。
import * as THREE from 'three';
import { RULES } from './config.js';

const $ = (id) => document.getElementById(id);

export class Ui {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.announceTimer = null;
    this.portraits = ['', ''];
  }

  showScreen(name) {
    $('title-screen').classList.toggle('hidden', name !== 'title');
    $('select-screen').classList.toggle('hidden', name !== 'select');
    $('loading-screen').classList.toggle('hidden', name !== 'loading');
    $('hud').classList.toggle('hidden', name !== 'battle');
    $('keys-hint').classList.toggle('hidden', name !== 'battle');
    if (name !== 'victory') $('victory-banner').classList.add('hidden');
  }

  setLoading(pct) { $('loading-bar').style.width = `${Math.round(pct * 100)}%`; }

  // ============ 战斗 HUD ============
  bindFighters(fighters, portraits) {
    fighters.forEach((f, i) => {
      const p = i + 1;
      $(`name-p${p}`).textContent = f.displayName;
      $(`portrait-p${p}`).style.backgroundImage = `url(${portraits[i].base})`;
      $(`portrait-p${p}`).classList.remove('mega');
      this.portraits[i] = portraits[i];
      $(`hpw-p${p}`).style.width = '100%';
      $(`hp-p${p}`).style.width = '100%';
      $(`evo-p${p}`).style.width = '0%';
    });
    this.setRoundPips(fighters);
  }

  refreshPortrait(f) {
    const i = f.side;
    const p = i + 1;
    const set = this.portraits[i];
    if (!set) return;
    $(`portrait-p${p}`).style.backgroundImage = `url(${f.form === 'mega' ? set.mega : set.base})`;
    $(`portrait-p${p}`).classList.toggle('mega', f.form === 'mega');
    $(`name-p${p}`).textContent = f.displayName;
  }

  updateBars(fighters, seconds) {
    fighters.forEach((f, i) => {
      const p = i + 1;
      const ratio = Math.max(0, f.hp / f.maxHp);
      const fill = $(`hp-p${p}`);
      fill.style.width = `${ratio * 100}%`;
      fill.classList.toggle('low', ratio < 0.28);
      // 白色缓冲条缓追
      const white = $(`hpw-p${p}`);
      const cur = parseFloat(white.style.width) || 100;
      if (ratio * 100 > cur) white.style.width = `${ratio * 100}%`;
      else white.style.width = `${Math.max(ratio * 100, cur - 0.55)}%`;

      const evoFill = $(`evo-p${p}`);
      const evoLabel = $(`evolabel-p${p}`);
      if (f.form === 'mega') {
        evoFill.style.width = `${(f.evoTimer / RULES.evoDuration) * 100}%`;
        evoFill.classList.remove('full');
        evoLabel.textContent = f.cfg.mega ? 'MEGA FORM' : '';
        evoLabel.classList.remove('ready');
      } else if (f.cfg.boss) {
        evoFill.style.width = '0%';
        evoLabel.textContent = 'ULTIMATE';
        evoLabel.classList.remove('ready');
      } else {
        evoFill.style.width = `${(f.evo / RULES.evoMax) * 100}%`;
        const ready = f.evo >= RULES.evoMax;
        evoFill.classList.toggle('full', ready);
        evoLabel.textContent = ready ? '▶ DIGIVOLVE! (I键)' : 'DIGIVOLVE';
        evoLabel.classList.toggle('ready', ready);
      }
    });
    const timerEl = $('hud-timer');
    timerEl.textContent = String(seconds).padStart(2, '0');
    timerEl.classList.toggle('urgent', seconds <= 10);
  }

  setRoundPips(fighters) {
    fighters.forEach((f, i) => {
      for (let r = 0; r < 2; r++) {
        $(`pip-p${i + 1}-${r}`).classList.toggle('won', f.roundsWon > r);
      }
    });
  }

  announce(text, style = 'gold', dur = 1.2, hold = false) {
    const el = $('announce-text');
    el.className = `stroke-text ann-${style}`;
    el.textContent = text;
    el.classList.remove('show', 'show-hold');
    void el.offsetWidth; // 重启动画
    el.classList.add(hold ? 'show-hold' : 'show');
    clearTimeout(this.announceTimer);
    if (!hold) {
      this.announceTimer = setTimeout(() => { el.classList.remove('show'); el.textContent = ''; }, dur * 1000);
    } else {
      this.announceTimer = setTimeout(() => { el.classList.remove('show-hold'); el.textContent = ''; }, 1500);
    }
  }

  // 伤害飘字:世界坐标投影到屏幕
  showDamage(fighter, dmg) {
    const v = fighter.center.clone();
    v.y += fighter.height * 0.55;
    v.project(this.camera);
    const x = (v.x * 0.5 + 0.5) * this.canvas.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * this.canvas.clientHeight;
    const el = document.createElement('div');
    el.textContent = dmg;
    Object.assign(el.style, {
      position: 'absolute', left: `${x}px`, top: `${y}px`, zIndex: 21,
      transform: 'translate(-50%,-50%)', pointerEvents: 'none',
      font: '900 italic 30px "Trebuchet MS", sans-serif',
      color: '#fff', webkitTextStroke: '1.5px #a02', textShadow: '2px 2px 0 rgba(80,0,20,.7)',
      transition: 'transform .55s ease-out, opacity .55s ease-out', opacity: '1',
    });
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = `translate(-50%,-150%) translateX(${(Math.random() - 0.5) * 40}px)`;
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), 600);
  }

  showVictory(winnerName) {
    $('victory-name').textContent = winnerName;
    $('victory-banner').classList.remove('hidden');
  }
  hideVictory() { $('victory-banner').classList.add('hidden'); }
}

// ============ 选人界面 ============
export class SelectScreen {
  constructor(roster, onDone) {
    this.roster = roster;
    this.onDone = onDone;
    this.cursor = 0;
    this.pickP1 = -1;
    this.pickP2 = -1;
    this.cols = 4;
    this.cells = [];
    this._build();
  }

  _build() {
    const grid = $('char-grid');
    grid.innerHTML = '';
    this.roster.forEach((c, i) => {
      const cell = document.createElement('div');
      cell.className = 'char-cell';
      cell.innerHTML = `<div class="cname">${c.name}</div>`;
      cell.addEventListener('mouseenter', () => { this.cursor = i; this.refresh(); });
      cell.addEventListener('click', () => this.confirm());
      grid.appendChild(cell);
      this.cells.push(cell);
    });
  }

  setThumb(i, url) {
    if (this.cells[i] && !this.cells[i].querySelector('img')) {
      const img = document.createElement('img');
      img.src = url;
      this.cells[i].prepend(img);
    }
  }

  refresh() {
    this.cells.forEach((cell, i) => {
      cell.classList.toggle('cursor-p1', i === this.cursor);
      cell.classList.toggle('picked-p2', i === this.pickP2);
    });
    const c = this.roster[this.cursor];
    $('preview-name').textContent = c.name;
    $('preview-evo').textContent = c.boss
      ? '★ 隐藏角色 · 无进化 · 高性能'
      : `数码进化 ▶ ${c.mega.name}`;
    $('select-header').textContent = this.pickP1 < 0 ? '选择你的搭档' : '为 CPU 选择对手';
  }

  move(dx, dy) {
    const n = this.roster.length;
    let idx = this.cursor + dx + dy * this.cols;
    if (idx < 0) idx += Math.ceil(n / this.cols) * this.cols;
    idx %= Math.ceil(n / this.cols) * this.cols;
    this.cursor = Math.min(idx, n - 1);
    this.refresh();
  }

  confirm() {
    if (this.pickP1 < 0) {
      this.pickP1 = this.cursor;
      // 光标跳到默认对手
      this.cursor = (this.cursor + 1) % this.roster.length;
      this.refresh();
      return 'p1';
    }
    this.pickP2 = this.cursor;
    this.refresh();
    this.onDone(this.pickP1, this.pickP2);
    return 'p2';
  }

  back() {
    if (this.pickP1 >= 0) { // 撤销 P1 选择
      this.cursor = this.pickP1;
      this.pickP1 = -1;
      this.pickP2 = -1;
      this.refresh();
      return true;
    }
    return false; // 返回标题
  }

  reset() {
    this.pickP1 = this.pickP2 = -1;
    this.refresh();
  }
}
