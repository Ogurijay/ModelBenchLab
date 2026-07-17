export class UIController {
  constructor() {
    this.entry = document.getElementById('entry');
    this.startBtn = document.getElementById('startBtn');
    this.pointerTip = document.getElementById('pointerTip');
    this.hud = document.getElementById('hud');
    this.objective = document.getElementById('objective');
    this.fps = document.getElementById('fps');
    this.cyanStatus = document.getElementById('cyanStatus');
    this.amberStatus = document.getElementById('amberStatus');
    this.crosshair = document.getElementById('crosshair');
    this.interact = document.getElementById('interact');
    this.toast = document.getElementById('toast');
    this.complete = document.getElementById('complete');
    this.teleportCount = document.getElementById('teleportCount');
    this.completeTime = document.getElementById('completeTime');
    this.againBtn = document.getElementById('againBtn');
    this.entered = false;
    this.toastTimer = 0;
    this.lastObjective = '';
  }

  setLocked(locked) {
    if (locked) {
      this.entered = true;
      this.entry.classList.add('hidden');
      this.hud.classList.remove('hidden');
      this.pointerTip.textContent = '按 Esc 可暂停。';
      this.startBtn.querySelector('span').textContent = '继续试验';
    } else if (!this.complete.classList.contains('hidden')) {
      this.hud.classList.add('hidden');
    } else {
      this.entry.classList.remove('hidden');
      this.hud.classList.add('hidden');
    }
  }

  setPointerError() {
    this.pointerTip.textContent = '浏览器拒绝锁定鼠标，请再次点击按钮。';
  }

  setPortalStatus(state) {
    const update = (element, active, surface) => {
      element.classList.toggle('active', active);
      const small = element.querySelector('small');
      small.textContent = active ? `已部署 · ${surface || '授权面'}` : '未部署';
    };
    update(this.cyanStatus, state.cyan.active, state.cyan.surface);
    update(this.amberStatus, state.amber.active, state.amber.surface);
  }

  setObjective(text) {
    if (text === this.lastObjective) return;
    this.lastObjective = text;
    this.objective.textContent = text;
  }

  setAimValid(valid) { this.crosshair.classList.toggle('valid', valid); }

  setInteract(show, text = '拾取相位立方体') {
    this.interact.classList.toggle('hidden', !show);
    if (show) this.interact.querySelector('span').textContent = text;
  }

  showToast(message, seconds = 2.7) {
    this.toast.textContent = message;
    this.toast.classList.remove('hidden');
    this.toastTimer = seconds;
  }

  update(dt) {
    if (this.toastTimer <= 0) return;
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.toast.classList.add('hidden');
  }

  setFps(value) { this.fps.textContent = `${value} FPS`; }

  showComplete(state) {
    this.hud.classList.add('hidden');
    this.entry.classList.add('hidden');
    this.complete.classList.remove('hidden');
    this.teleportCount.textContent = String(state.teleportCount);
    const totalSeconds = Math.floor(state.time);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.completeTime.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  hideComplete() {
    this.complete.classList.add('hidden');
    this.entry.classList.remove('hidden');
  }
}
