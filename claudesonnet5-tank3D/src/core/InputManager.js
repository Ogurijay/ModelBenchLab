const MOVE_KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
};
const FIRE_KEYS = ['Space', 'KeyJ'];
const PAUSE_KEYS = ['KeyP', 'Escape'];
const CONFIRM_KEYS = ['Enter'];

const ALL_TRACKED = new Set([
  ...Object.values(MOVE_KEYS).flat(),
  ...FIRE_KEYS,
  ...PAUSE_KEYS,
  ...CONFIRM_KEYS,
]);

export class InputManager {
  constructor() {
    this.down = new Set();
    this.justPressed = new Set();
    this._onKeyDown = (e) => {
      if (ALL_TRACKED.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.justPressed.add(e.code);
      this.down.add(e.code);
    };
    this._onKeyUp = (e) => {
      this.down.delete(e.code);
    };
    this._onBlur = () => {
      this.down.clear();
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }

  _anyDown(codes) {
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  _anyJustPressed(codes) {
    for (const c of codes) if (this.justPressed.has(c)) return true;
    return false;
  }

  // 当前正在按住的移动方向；同时按多个方向时按 上>下>左>右 优先级取一个（4 向坦克不支持斜移）
  currentMoveDirection() {
    if (this._anyDown(MOVE_KEYS.up)) return 'up';
    if (this._anyDown(MOVE_KEYS.down)) return 'down';
    if (this._anyDown(MOVE_KEYS.left)) return 'left';
    if (this._anyDown(MOVE_KEYS.right)) return 'right';
    return null;
  }

  isFireDown() {
    return this._anyDown(FIRE_KEYS);
  }

  pausePressed() {
    return this._anyJustPressed(PAUSE_KEYS);
  }

  confirmPressed() {
    return this._anyJustPressed(CONFIRM_KEYS);
  }

  // 每帧末尾调用，清空"本帧刚按下"集合
  endFrame() {
    this.justPressed.clear();
  }
}
