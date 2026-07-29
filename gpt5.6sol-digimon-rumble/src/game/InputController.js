const P1 = {
  left: ['KeyA'], right: ['KeyD'],
  attack: ['KeyJ'], ranged: ['KeyK'], jump: ['KeyW', 'Space'],
  evolve: ['KeyE'], pause: ['Escape'],
};

const P2 = {
  left: ['ArrowLeft'], right: ['ArrowRight'],
  attack: ['Numpad1', 'KeyN'], ranged: ['Numpad2', 'KeyM'],
  jump: ['ArrowUp', 'Numpad0', 'Enter'],
  evolve: ['NumpadEnter', 'Slash'], pause: ['Backspace'],
};

const LEGACY_ARROWS = { left: ['ArrowLeft'], right: ['ArrowRight'] };
const EDGE_ACTIONS = ['attack', 'ranged', 'jump', 'evolve', 'pause'];
const PAD_BUTTONS = { jump: 0, attack: 2, ranged: 3, evolve: 7, pause: 9 };

export const KEYBOARD_BINDINGS = Object.freeze({ p1: P1, p2: P2 });

const clamp = value => Math.max(-1, Math.min(1, value));
const neutral = () => ({
  moveX: 0, moveZ: 0,
  attack: false, ranged: false, skill: false,
  jump: false, evolve: false, overdrive: false, pause: false,
});

function mergeCommands(a, b) {
  const result = neutral();
  result.moveX = clamp((a.moveX || 0) + (b.moveX || 0));
  for (const key of EDGE_ACTIONS) result[key] = Boolean(a[key] || b[key]);
  // skill 保留为兼容别名；对玩家暴露的唯一远程攻击名称是 ranged。
  result.skill = result.ranged;
  result.overdrive = result.evolve;
  return result;
}

export class InputController {
  constructor({
    target = globalThis.window,
    navigatorRef = globalThis.navigator,
    keyboardBindings = KEYBOARD_BINDINGS,
    deadzone = 0.2,
  } = {}) {
    this.target = target;
    this.navigator = navigatorRef;
    this.bindings = keyboardBindings;
    this.deadzone = Math.max(0, Math.min(0.9, deadzone));
    this.down = new Set();
    this.pressed = new Set();
    this.gamepadDown = new Map();
    this.knownCodes = new Set(Object.values(keyboardBindings).flatMap(binding => Object.values(binding).flat()));
    Object.values(LEGACY_ARROWS).flat().forEach(code => this.knownCodes.add(code));
    this.onKeyDown = (event) => {
      const code = event.code || event.key;
      if (this.knownCodes.has(code)) event.preventDefault?.();
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    };
    this.onKeyUp = (event) => this.down.delete(event.code || event.key);
    this.onBlur = () => { this.down.clear(); this.pressed.clear(); };
    this.target?.addEventListener?.('keydown', this.onKeyDown);
    this.target?.addEventListener?.('keyup', this.onKeyUp);
    this.target?.addEventListener?.('blur', this.onBlur);
  }

  normalize(event) {
    const code = event.code || event.key;
    const combined = {
      ...P1,
      left: [...P1.left, ...LEGACY_ARROWS.left],
      right: [...P1.right, ...LEGACY_ARROWS.right],
    };
    for (const [action, codes] of Object.entries(combined)) if (codes.includes(code)) return action;
    return code;
  }

  _held(codes = []) { return codes.some(code => this.down.has(code)); }

  _consumeCodes(codes = []) {
    const active = codes.some(code => this.pressed.has(code));
    if (active) codes.forEach(code => this.pressed.delete(code));
    return active;
  }

  _readKeyboard(binding, legacyArrows = false) {
    if (!binding) return neutral();
    const codes = action => legacyArrows && LEGACY_ARROWS[action]
      ? [...(binding[action] || []), ...LEGACY_ARROWS[action]]
      : (binding[action] || []);
    const command = neutral();
    command.moveX = (this._held(codes('right')) ? 1 : 0) - (this._held(codes('left')) ? 1 : 0);
    for (const action of EDGE_ACTIONS) command[action] = this._consumeCodes(codes(action));
    command.skill = command.ranged;
    command.overdrive = command.evolve;
    return command;
  }

  _pads() {
    try { return Array.from(this.navigator?.getGamepads?.() || []).filter(Boolean).slice(0, 4); }
    catch { return []; }
  }

  _axis(value = 0) {
    const magnitude = Math.abs(value);
    return magnitude <= this.deadzone ? 0 : Math.sign(value) * (magnitude - this.deadzone) / (1 - this.deadzone);
  }

  _button(pad, index, edge = false) {
    const key = `${pad.index}:${index}`;
    const active = Boolean(pad.buttons?.[index]?.pressed || pad.buttons?.[index]?.value > 0.5);
    const previous = this.gamepadDown.get(key) || false;
    this.gamepadDown.set(key, active);
    return edge ? active && !previous : active;
  }

  _readGamepad(pad) {
    if (!pad) return neutral();
    const command = neutral();
    command.moveX = clamp(this._axis(pad.axes?.[0])
      + (this._button(pad, 15) ? 1 : 0)
      - (this._button(pad, 14) ? 1 : 0));
    for (const action of EDGE_ACTIONS) command[action] = this._button(pad, PAD_BUTTONS[action], true);
    command.skill = command.ranged;
    command.overdrive = command.evolve;
    return command;
  }

  readAll(fighters = ['player']) {
    if (!Array.isArray(fighters) && fighters?.fighters) fighters = fighters.fighters;
    const list = Array.isArray(fighters) ? fighters : [fighters];
    const pads = this._pads();
    const commands = {};
    list.slice(0, 4).forEach((fighter, index) => {
      const id = typeof fighter === 'string' ? fighter : (fighter?.id || `p${index + 1}`);
      const keyboard = index < 2 ? this._readKeyboard(this.bindings[index === 0 ? 'p1' : 'p2']) : neutral();
      commands[id] = mergeCommands(keyboard, this._readGamepad(pads[index]));
    });
    return commands;
  }

  read() {
    return mergeCommands(this._readKeyboard(this.bindings.p1, true), this._readGamepad(this._pads()[0]));
  }

  consume(action) {
    const codes = [...(this.bindings.p1?.[action] || []), ...(LEGACY_ARROWS[action] || [])];
    return this._consumeCodes(codes);
  }

  clearActions() {
    this.pressed.clear();
    this.gamepadDown.clear();
    for (const pad of this._pads()) {
      pad.buttons?.forEach((button, index) => this.gamepadDown.set(`${pad.index}:${index}`, Boolean(button.pressed || button.value > 0.5)));
    }
  }

  dispose() {
    this.target?.removeEventListener?.('keydown', this.onKeyDown);
    this.target?.removeEventListener?.('keyup', this.onKeyUp);
    this.target?.removeEventListener?.('blur', this.onBlur);
    this.down.clear(); this.pressed.clear(); this.gamepadDown.clear();
  }

  destroy() { this.dispose(); }
}
