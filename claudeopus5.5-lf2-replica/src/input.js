// 键盘输入 → 每名玩家的 7 键控制器。控制器负责边沿检测、双击跑步、LF2 式 D+方向+A/J 出招序列识别。
// AI 也使用同一个 Controller,只是由程序填充 held 状态。
import { DEFAULT_KEYS, KEY_NAMES, LF2_KEYS } from './config.js';

const LS_KEY = 'lf2r.keys.v1';
const BTN = ['up', 'down', 'left', 'right', 'A', 'J', 'D'];
const FROM_NAME = { up: 'up', down: 'down', left: 'left', right: 'right', attack: 'A', jump: 'J', defend: 'D' };

export class Controller {
  constructor() {
    this.held = {}; this.prev = {}; this.pressed = {};
    for (const b of BTN) { this.held[b] = false; this.prev[b] = false; this.pressed[b] = false; }
    this.t = 0;
    this.buf = [];            // 最近的按键序列 {k,t}
    this.combo = null;        // {type,dirX,t}
    this.run = null;          // {dir,t}
    this.lastTap = { left: -99, right: -99 };
    this.virtual = {};        // AI / 无头注入:本帧额外按下
    this.pressT = {};         // 输入缓冲:最近一次按下的时刻
    for (const b of BTN) this.pressT[b] = -99;
  }
  // 缓冲按键:win TU 内按下过且未被消费
  bp(k, win = 3) {
    if (this.t - this.pressT[k] <= win) { this.pressT[k] = -99; return true; }
    return false;
  }
  // 每 TU 调用一次。state:{up,down,left,right,A,J,D}
  update(state) {
    this.t++;
    for (const b of BTN) {
      const v = !!(state[b] || this.virtual[b]);
      this.prev[b] = this.held[b];
      this.held[b] = v;
      this.pressed[b] = v && !this.prev[b];
    }
    this.virtual = {};
    for (const b of BTN) if (this.pressed[b]) this.onPress(b);
    if (this.combo && this.t - this.combo.t > 30) this.combo = null;
    if (this.run && this.t - this.run.t > 3) this.run = null;
  }
  // LF2 出招:记住最近的按键(无时限),最后三次按键为 D+方向+A/J 或 D+J+A 即成立;
  // 指令成立后挂起,直到角色进入可出招的帧;期间再按其他键则取消。连按两次 D 会清空序列。
  onPress(k) {
    const t = this.t;
    this.pressT[k] = t;
    if (this.combo && t > this.combo.t) this.combo = null;
    if (k === 'left' || k === 'right') {
      if (t - this.lastTap[k] <= 10) this.run = { dir: k === 'left' ? -1 : 1, t };
      this.lastTap[k] = t;
    }
    if (k === 'J' || k === 'D') { this.lastTap.left = this.lastTap.right = -99; }
    const b = this.buf;
    if (k === 'D' && b.length && b[b.length - 1].k === 'D') { b.length = 0; return; }
    if ((k === 'A' || k === 'J') && b.length >= 2) {
      const p1 = b[b.length - 2].k, p2 = b[b.length - 1].k;
      let type = null, dirX = 0;
      if (p1 === 'D') {
        const s2 = k === 'A' ? 'a' : 'j';
        if (p2 === 'left' || p2 === 'right') { type = 'F' + s2; dirX = p2 === 'left' ? -1 : 1; }
        else if (p2 === 'up') type = 'U' + s2;
        else if (p2 === 'down') type = 'D' + s2;
        else if (p2 === 'J' && k === 'A') type = 'ja';
      }
      if (type) { this.combo = { type, dirX, t }; b.length = 0; this.pressT[k] = -99; return; }
    }
    b.push({ k, t });
    if (b.length > 3) b.shift();
  }
  takeCombo() { const c = this.combo; this.combo = null; return c; }
  takeRun() { const r = this.run; this.run = null; return r; }
  dirX() { return (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0); }
  dirZ() { return (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0); }
  // AI 直接下达出招
  forceCombo(type, dirX = 0) { this.combo = { type, dirX, t: this.t }; }
  forceRun(dir) { this.run = { dir, t: this.t }; }
  reset() { for (const b of BTN) { this.held[b] = this.prev[b] = this.pressed[b] = false; this.pressT[b] = -99; } this.buf.length = 0; this.combo = null; this.run = null; }
}

// ---------------------------------------------------------------- 键盘
export const keyboard = {
  down: new Set(),
  pressedQ: [],     // UI 用:本帧新按下的 code
  bindings: loadBindings(),
  listening: null,  // 改键时的回调
};

function loadBindings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (Array.isArray(s) && s.length === 4) return s.map((m, i) => ({ ...DEFAULT_KEYS[i], ...m }));
  } catch { /* ignore */ }
  return DEFAULT_KEYS.map((m) => ({ ...m }));
}
export function saveBindings() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(keyboard.bindings)); } catch { /* ignore */ }
}
export function resetBindings(lf2 = false) { keyboard.bindings = (lf2 ? LF2_KEYS : DEFAULT_KEYS).map((m) => ({ ...m })); saveBindings(); }

export function installKeyboard(target, onFirstGesture) {
  const prevent = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Backspace', 'F1', 'F2', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'Backquote']);
  window.addEventListener('keydown', (e) => {
    onFirstGesture?.();
    if (keyboard.listening) { e.preventDefault(); const cb = keyboard.listening; keyboard.listening = null; cb(e.code); return; }
    if (prevent.has(e.code) || e.code.startsWith('Numpad')) e.preventDefault();
    if (e.repeat) return;
    keyboard.down.add(e.code);
    keyboard.pressedQ.push(e.code);
  });
  window.addEventListener('keyup', (e) => { keyboard.down.delete(e.code); });
  window.addEventListener('blur', () => keyboard.down.clear());
  target?.addEventListener('pointerdown', () => onFirstGesture?.());
}

// 读取第 i 名玩家当前键位状态
export function playerState(i, injected) {
  const m = keyboard.bindings[i];
  const s = {};
  for (const name of KEY_NAMES) s[FROM_NAME[name]] = keyboard.down.has(m[name]);
  if (injected) for (const k in injected) if (injected[k] > 0) s[k] = true;
  return s;
}

// UI 导航:合并所有玩家键位 + 方向键 / 回车 / Esc
export function uiEvents() {
  const out = [];
  for (const code of keyboard.pressedQ) {
    let ev = null, who = -1;
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') ev = 'ok';
    else if (code === 'Escape' || code === 'Backspace') ev = 'back';
    else if (code === 'F4') ev = 'pause';
    for (let i = 0; i < 4 && !ev; i++) {
      const m = keyboard.bindings[i];
      for (const name of KEY_NAMES) if (m[name] === code) { ev = name; who = i; break; }
    }
    if (!ev) {
      if (code === 'ArrowUp') ev = 'up'; else if (code === 'ArrowDown') ev = 'down';
      else if (code === 'ArrowLeft') ev = 'left'; else if (code === 'ArrowRight') ev = 'right';
    }
    if (ev) out.push({ ev, who, code });
  }
  return out;
}
export function clearUiQueue() { keyboard.pressedQ.length = 0; }
export function codeLabel(code) {
  if (!code) return '-';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num').replace(/^Arrow/, '').replace('Comma', ',').replace('Period', '.').replace('Semicolon', ';').replace('Slash', '/');
}
