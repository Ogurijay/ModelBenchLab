// 输入：键盘 / 触屏 / 手柄 → 统一的驾驶输入。失焦或暂停时释放全部按键。
export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, hb: false };
    this.pressed = new Set(); // 本帧按下（菜单/QTE 用）
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (this._game(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code); this.pressed.add(e.code);
      if (this._game(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.releaseAll());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    this.scripted = null; // 测试/回放注入
  }
  _game(code) { return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code); }
  releaseAll() {
    this.keys.clear();
    for (const k in this.touch) this.touch[k] = false;
    document.querySelectorAll('.touch-btn.on').forEach((b) => b.classList.remove('on'));
  }
  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  endFrame() { this.pressed.clear(); }

  /** 驾驶输入（每个固定步长读取） */
  drive() {
    if (this.scripted) return this.scripted;
    const t = this.touch;
    let steer = 0;
    if (this.down('ArrowLeft', 'KeyA') || t.left) steer += 1;
    if (this.down('ArrowRight', 'KeyD') || t.right) steer -= 1;
    const out = {
      throttle: this.down('ArrowUp', 'KeyW') || t.gas ? 1 : 0,
      brake: this.down('ArrowDown', 'KeyS') || t.brake ? 1 : 0,
      steer, handbrake: this.down('Space') || t.hb, analog: false
    };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) { out.steer = -ax; out.analog = true; }
      out.throttle = Math.max(out.throttle, p.buttons[7]?.value || 0);
      out.brake = Math.max(out.brake, p.buttons[6]?.value || 0);
      out.handbrake = out.handbrake || !!p.buttons[0]?.pressed || !!p.buttons[2]?.pressed;
    }
    if (!this.enabled) { out.throttle = 0; out.steer = 0; out.handbrake = false; }
    return out;
  }

  /** 触屏按钮绑定 */
  bindTouch(root) {
    root.querySelectorAll('[data-touch]').forEach((b) => {
      const k = b.dataset.touch;
      const on = (e) => { e.preventDefault(); this.touch[k] = true; b.classList.add('on'); };
      const off = (e) => { e.preventDefault(); this.touch[k] = false; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
    });
  }
}
