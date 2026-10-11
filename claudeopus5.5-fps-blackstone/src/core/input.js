// 键鼠输入：动作映射 + 边沿检测 + 指针锁定。__bench 可注入虚拟按键与鼠标位移。

const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC', 'ControlLeft'],
  reload: ['KeyR'],
  interact: ['KeyE'],
  grenade: ['KeyG'],
  melee: ['KeyV', 'KeyF'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon3: ['Digit3'],
  weapon4: ['Digit4'],
  swap: ['KeyQ'],
  scoreboard: ['Tab'],
  fire: ['Mouse0'],
  ads: ['Mouse2'],
};

export class Input {
  constructor(target) {
    this.target = target;
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.virtual = new Set();
    this.mdx = 0;
    this.mdy = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this.onLockChange = null;
    this.onEscape = null;
    this.code2action = new Map();
    for (const [a, codes] of Object.entries(BINDINGS)) for (const c of codes) this.code2action.set(c, a);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.onEscape) this.onEscape(e);
        return;
      }
      const a = this.code2action.get(e.code);
      if (a && this.enabled) {
        // 阻止 Ctrl+W 之类在游戏中误触浏览器行为（只在锁定时）
        if (this.locked || a === 'scoreboard' || a === 'jump') e.preventDefault();
        if (!this.down.has(a)) this.pressedSet.add(a);
        this.down.add(a);
      }
    });
    window.addEventListener('keyup', (e) => {
      const a = this.code2action.get(e.code);
      if (a) {
        this.down.delete(a);
        this.releasedSet.add(a);
      }
    });
    target.addEventListener('mousedown', (e) => {
      if (!this.locked || !this.enabled) return;
      const a = this.code2action.get('Mouse' + e.button);
      if (a) {
        if (!this.down.has(a)) this.pressedSet.add(a);
        this.down.add(a);
      }
    });
    window.addEventListener('mouseup', (e) => {
      const a = this.code2action.get('Mouse' + e.button);
      if (a) {
        this.down.delete(a);
        this.releasedSet.add(a);
      }
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      // 过滤偶发的超大跳变（部分浏览器在锁定瞬间会给出）
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mdx += e.movementX;
      this.mdy += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === target;
      if (!this.locked) this.releaseAll();
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    window.addEventListener('blur', () => this.releaseAll());
  }

  lock() {
    if (document.pointerLockElement === this.target) return Promise.resolve();
    try {
      const p = this.target.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        return p.catch(() => {
          // 部分环境不支持 unadjustedMovement
          const q = this.target.requestPointerLock();
          return q && q.catch ? q.catch(() => {}) : undefined;
        });
      }
    } catch {
      /* 忽略 */
    }
    return Promise.resolve();
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  releaseAll() {
    for (const a of this.down) this.releasedSet.add(a);
    this.down.clear();
  }

  isDown(a) {
    return this.down.has(a) || this.virtual.has(a);
  }
  pressed(a) {
    return this.pressedSet.has(a);
  }
  released(a) {
    return this.releasedSet.has(a);
  }
  consumeMouse() {
    const r = { dx: this.mdx, dy: this.mdy };
    this.mdx = this.mdy = 0;
    return r;
  }
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
  /** 每帧末调用 */
  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
  }

  // —— 无头驱动 ——
  virtualPress(a) {
    if (!this.virtual.has(a)) this.pressedSet.add(a);
    this.virtual.add(a);
  }
  virtualRelease(a) {
    if (this.virtual.has(a)) this.releasedSet.add(a);
    this.virtual.delete(a);
  }
  virtualLook(dx, dy) {
    this.mdx += dx;
    this.mdy += dy;
  }
}
