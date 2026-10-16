// 键鼠输入 -> 本地玩家意图(intent)。动作键的"按下"是边沿事件,保留到下一个物理步被消费。
// 默认键位与原作 PC 版一致:左键点按出拳/按住抓取,右键踢,中键头槌,Shift 疾跑,空格跳(抓住时攀爬),F 丢武器。
// 纯键盘:I 抓取、J 出拳、K 踢、L 头槌。
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.mouse = { L: false, R: false, M: false };
    this.edges = { punch: 0, kick: 0, jump: 0, drop: 0, mash: 0, emote: 0 };
    this.look = { dx: 0, dy: 0, wheel: 0 };
    this.locked = false;
    this.enabled = false;
    this.sens = 1;
    this.onEsc = null; this.onTab = null;
    addEventListener('keydown', (e) => this.key(e, true));
    addEventListener('keyup', (e) => this.key(e, false));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.L = this.mouse.R = this.mouse.M = false; });
    dom.addEventListener('mousedown', (e) => this.btn(e, true));
    addEventListener('mouseup', (e) => this.btn(e, false));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      // 锁定时全局取增量;没锁定(浏览器拒绝/内嵌预览不支持)时,鼠标在画面上移动也能转视角
      if (this.locked || e.target === this.dom) { this.look.dx += e.movementX || 0; this.look.dy += e.movementY || 0; }
    });
    dom.addEventListener('wheel', (e) => { this.look.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; });
  }

  requestLock() {
    if (!this.locked && this.dom.requestPointerLock) {
      try { const p = this.dom.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 无指针锁环境 */ }
    }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  key(e, down) {
    const k = e.code;
    if (down && k === 'Escape') { this.onEsc?.(); return; }
    if (k === 'Tab') { e.preventDefault(); this.onTab?.(down); return; }
    if (!this.enabled) return;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ControlLeft'].includes(k)) e.preventDefault();
    if (down && !e.repeat) {
      if (k === 'KeyJ') { this.edges.punch++; this.edges.mash++; }
      if (k === 'KeyK') { this.edges.kick++; this.edges.mash++; }
      if (k === 'Space') { this.edges.jump++; this.edges.mash++; }
      if (k === 'KeyF') this.edges.drop++;
      if (k === 'KeyT') this.edges.emote++;
      if (k === 'KeyI' || k === 'KeyL') this.edges.mash++;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(k)) this.edges.mash += 0.5;
    }
    if (down) this.keys.add(k); else this.keys.delete(k);
  }

  btn(e, down) {
    if (!this.enabled) return;
    if (down && !this.locked) this.requestLock();
    const b = e.button === 0 ? 'L' : e.button === 2 ? 'R' : e.button === 1 ? 'M' : null;
    if (!b) return;
    if (b === 'M') e.preventDefault();
    if (down && !this.mouse[b]) {
      if (b === 'L') { this.edges.punch++; this.edges.mash++; }
      if (b === 'R') { this.edges.kick++; this.edges.mash++; }
      if (b === 'M') this.edges.mash++;
    }
    this.mouse[b] = down;
  }

  // 把输入写进 intent;camYaw = 镜头水平朝向,aimPitch 由镜头俯仰换算
  apply(intent, camYaw, aimPitch) {
    const K = this.keys;
    let f = 0, r = 0;
    if (K.has('KeyW') || K.has('ArrowUp')) f += 1;
    if (K.has('KeyS') || K.has('ArrowDown')) f -= 1;
    if (K.has('KeyD') || K.has('ArrowRight')) r += 1;
    if (K.has('KeyA') || K.has('ArrowLeft')) r -= 1;
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let mx = fx * f + -fz * r, mz = fz * f + fx * r;
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    intent.moveX = mx; intent.moveZ = mz;
    intent.sprint = K.has('ShiftLeft') || K.has('ShiftRight');
    intent.grab = this.mouse.L || K.has('KeyI');
    intent.headbutt = this.mouse.M || K.has('KeyL');
    intent.faceYaw = camYaw;
    intent.aimPitch = aimPitch;
    if (this.edges.punch) intent.punch = true;
    if (this.edges.kick) intent.kick = true;
    if (this.edges.jump) intent.jump = true;
    if (this.edges.drop) intent.drop = true;
    if (this.edges.emote) intent.emote = true;
    intent.mash += this.edges.mash;
    this.edges.punch = this.edges.kick = this.edges.jump = this.edges.drop = this.edges.mash = this.edges.emote = 0;
  }

  takeLook() {
    const l = { ...this.look };
    this.look.dx = this.look.dy = this.look.wheel = 0;
    return l;
  }
}
