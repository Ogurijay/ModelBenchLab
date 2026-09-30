import { PLAYER_MAX_LIVES_DISPLAY } from '../core/constants.js';

const POWERUP_LABEL = {
  grenade: '炸弹：清除场上全部敌军',
  helmet: '头盔：短暂无敌护盾',
  shovel: '铁锹：基地要塞临时钢化',
  clock: '闹钟：冻结全部敌军',
  tank: '坦克：生命 +1',
  star: '五角星：火力升级',
  gun: '手枪：火力直升满级',
};

export class UI {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.$ = (id) => document.getElementById(id);

    this.overlayStart = this.$('overlay-start');
    this.overlayIntro = this.$('overlay-intro');
    this.overlayPause = this.$('overlay-pause');
    this.overlayGameOver = this.$('overlay-gameover');
    this.overlayVictory = this.$('overlay-victory');
    this.toastEl = this.$('toast');
    this.fpsEl = this.$('fps');

    this.enemyGridEl = this.$('hud-enemy-grid');
    this.enemyCountEl = this.$('hud-enemy-count');
    this.livesEl = this.$('hud-lives');
    this.powerEl = this.$('hud-power');
    this.scoreEl = this.$('hud-score');
    this.highScoreEl = this.$('hud-highscore');
    this.levelEl = this.$('hud-level');

    this.enemyIcons = [];
    this.enemySpent = 0;
    this._toastTimer = null;
    this.muted = false;

    this._buildPowerStars();

    this.$('btn-start').addEventListener('click', () => this.cb.onStart && this.cb.onStart());
    this.$('btn-restart').addEventListener('click', () => this.cb.onRestart && this.cb.onRestart());
    this.$('btn-again').addEventListener('click', () => this.cb.onAgain && this.cb.onAgain());
    this.$('btn-mute').addEventListener('click', () => this.cb.onMuteToggle && this.cb.onMuteToggle());
  }

  _buildPowerStars() {
    this.powerEl.innerHTML = '';
    this.powerStars = [];
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('div');
      d.className = 'power-star';
      this.powerEl.appendChild(d);
      this.powerStars.push(d);
    }
  }

  hideAllOverlays() {
    for (const el of [this.overlayStart, this.overlayIntro, this.overlayPause, this.overlayGameOver, this.overlayVictory]) {
      el.classList.add('hidden');
    }
  }

  showStart() {
    this.hideAllOverlays();
    this.overlayStart.classList.remove('hidden');
  }

  showIntro(levelNumber, subtitle = '') {
    this.hideAllOverlays();
    this.$('intro-level').textContent = String(levelNumber);
    this.$('intro-sub').textContent = subtitle;
    this.overlayIntro.classList.remove('hidden');
  }

  showPause() {
    this.overlayPause.classList.remove('hidden');
  }

  hidePause() {
    this.overlayPause.classList.add('hidden');
  }

  showGameOver(reason, score) {
    this.hideAllOverlays();
    this.$('gameover-reason').textContent = reason;
    this.$('gameover-score').textContent = String(score);
    this.overlayGameOver.classList.remove('hidden');
  }

  showVictory(score) {
    this.hideAllOverlays();
    this.$('victory-score').textContent = String(score);
    this.overlayVictory.classList.remove('hidden');
  }

  setEnemyTotal(total) {
    this.enemyGridEl.innerHTML = '';
    this.enemyIcons = [];
    for (let i = 0; i < total; i++) {
      const d = document.createElement('div');
      d.className = 'enemy-icon';
      this.enemyGridEl.appendChild(d);
      this.enemyIcons.push(d);
    }
    this.enemySpent = 0;
    this.enemyCountEl.textContent = String(total);
  }

  spendEnemyIcon() {
    if (this.enemySpent < this.enemyIcons.length) {
      this.enemyIcons[this.enemySpent].classList.add('spent');
      this.enemySpent++;
    }
    this.enemyCountEl.textContent = String(Math.max(0, this.enemyIcons.length - this.enemySpent));
  }

  setLives(n) {
    this.livesEl.innerHTML = '';
    const shown = Math.min(n, PLAYER_MAX_LIVES_DISPLAY);
    for (let i = 0; i < shown; i++) {
      const d = document.createElement('div');
      d.className = 'life-icon';
      this.livesEl.appendChild(d);
    }
  }

  setPower(level) {
    this.powerStars.forEach((el, i) => el.classList.toggle('filled', i < level));
  }

  setScore(v) {
    this.scoreEl.textContent = String(v);
  }

  setHighScore(v) {
    this.highScoreEl.textContent = String(v);
  }

  setLevel(n) {
    this.levelEl.textContent = String(n);
  }

  toastPowerUp(type) {
    this.toast(POWERUP_LABEL[type] || type);
  }

  toast(message) {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.add('hidden'), 1800);
  }

  setMuted(muted) {
    this.muted = muted;
    this.$('btn-mute').textContent = muted ? '🔇' : '🔊';
  }

  setFpsVisible(visible) {
    this.fpsEl.classList.toggle('hidden', !visible);
  }

  updateFps(v) {
    this.fpsEl.textContent = `${v.toFixed(0)} fps`;
  }
}
