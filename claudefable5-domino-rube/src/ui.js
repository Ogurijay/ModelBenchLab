// ============================================================
// ui.js — 中文 HUD:按钮 / 阶段指示 / 状态数字
// ============================================================
import { STAGE_NAMES } from './config.js';

export class UI {
  /**
   * @param {object} actions { onTrigger, onReset, onCamera, onSlow }
   */
  constructor(actions) {
    this.el = {
      trigger: document.getElementById('btn-trigger'),
      reset: document.getElementById('btn-reset'),
      camera: document.getElementById('btn-camera'),
      slow: document.getElementById('btn-slow'),
      fps: document.getElementById('stat-fps'),
      sim: document.getElementById('stat-sim'),
      bell: document.getElementById('stat-bell'),
      banner: document.getElementById('banner'),
      stages: [...document.querySelectorAll('#stages .stage')],
    };
    this.el.trigger.addEventListener('click', actions.onTrigger);
    this.el.reset.addEventListener('click', actions.onReset);
    this.el.camera.addEventListener('click', actions.onCamera);
    this.el.slow.addEventListener('click', actions.onSlow);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'Space': e.preventDefault(); actions.onTrigger(); break;
        case 'KeyR': actions.onReset(); break;
        case 'KeyC': actions.onCamera(); break;
        case 'KeyS': actions.onSlow(); break;
        default: break;
      }
    });
    this._bannerTimer = null;
    this._frame = 0;          // refresh 降频计数器
    this._stageSig = '';      // 阶段芯片脏检查签名
  }

  setTriggered(on) {
    this.el.trigger.disabled = on;
    this.el.trigger.textContent = on ? '▶ 链条运行中…' : '▶ 触发机关';
  }

  setCameraMode(mode) {
    this.el.camera.textContent = mode === 'auto' ? '📷 相机:自动运镜' : '🎛 相机:手动轨道';
    this.el.camera.classList.toggle('toggled', mode === 'manual');
  }

  setSlow(on) {
    this.el.slow.textContent = on ? '🐢 慢动作:开' : '🐢 慢动作:关';
    this.el.slow.classList.toggle('toggled', on);
  }

  showBanner() {
    this.el.banner.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.el.banner.classList.remove('show'), 2600);
  }

  reset() {
    this.setTriggered(false);
    this.el.banner.classList.remove('show');
    this.el.bell.textContent = '--';
    this._stageSig = '';      // 强制下一次 refresh 重写阶段芯片
  }

  /**
   * 每帧调用,内部自行降频:
   * - 数字文本(fps / 仿真时间 / 铃响时刻)每 6 帧重写一次(60fps 下 ≈10Hz);
   * - 阶段芯片按状态签名脏检查,状态不变则完全不碰 DOM。
   * @param {boolean} force 跳过降频立即全量刷新(__bench.stepFrame / 复位后使用)
   */
  refresh(state, fps, force = false) {
    this._frame = (this._frame + 1) % 6;
    if (force || this._frame === 0) {
      this.el.fps.textContent = String(Math.round(fps));
      this.el.sim.textContent = state.simTime.toFixed(3);
      if (state.bellRung) {
        this.el.bell.textContent = `${state.bellRungAt.toFixed(3)} s`;
      }
    }
    const fade = state.bellRung && state.simTime - state.bellRungAt > 3;   // 响铃 3s 后终点芯片熄灭高亮
    const sig = `${state.currentStage}|${state.bellRung}|${fade}|${state.stageTimes.join(',')}`;
    if (!force && sig === this._stageSig) return;
    this._stageSig = sig;
    for (const div of this.el.stages) {
      const n = Number(div.dataset.stage);
      div.classList.toggle('active', state.currentStage === n && !(n === 5 && fade));
      div.classList.toggle('done', state.currentStage > n || (n === 5 && state.bellRung));
      const t = div.querySelector('.t');
      const st = state.stageTimes[n];
      t.textContent = st >= 0 ? `${st.toFixed(2)}s` : '';
    }
  }
}

export { STAGE_NAMES };
