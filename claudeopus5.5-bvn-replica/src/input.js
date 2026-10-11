// 键盘采集、玩家手柄(按键缓冲)、AI 虚拟手柄与菜单事件。
import { settings, ALT_KEYS, BUTTONS } from './config.js';

export const keyboard = { down: new Set(), pressed: new Set() };
const menuQueue = [];
let onFirstGesture = null;
let rebindHook = null;   // 改键界面截获下一次按键

export function installKeyboard(target, firstGesture) {
  onFirstGesture = firstGesture;
  const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'Slash', 'Quote', 'F1', 'F2', 'F3']);
  window.addEventListener('keydown', (e) => {
    if (onFirstGesture) { onFirstGesture(); onFirstGesture = null; }
    if (block.has(e.code) || e.code.startsWith('Numpad')) e.preventDefault();
    if (rebindHook) { e.preventDefault(); const h = rebindHook; rebindHook = null; h(e.code); return; }
    if (e.repeat) return;
    keyboard.down.add(e.code);
    keyboard.pressed.add(e.code);
    menuQueue.push(e.code);
  });
  window.addEventListener('keyup', (e) => { keyboard.down.delete(e.code); });
  window.addEventListener('blur', () => keyboard.down.clear());
  const click = () => { if (onFirstGesture) { onFirstGesture(); onFirstGesture = null; } target.focus(); };
  target.addEventListener('pointerdown', click);
}
export function captureNextKey(cb) { rebindHook = cb; }
// 评测钩子注入按键(与真实 keydown 等价)
export function injectKey(code, down) {
  if (down) { if (rebindHook) { const h = rebindHook; rebindHook = null; h(code); return; } keyboard.down.add(code); keyboard.pressed.add(code); menuQueue.push(code); }
  else keyboard.down.delete(code);
}
export function takeMenuKeys() { const q = menuQueue.splice(0); return q; }
export function endTick() { keyboard.pressed.clear(); }

// 菜单语义:任一玩家的方向 / 确认 / 取消
export function menuAction(code) {
  const k1 = settings.keys.p1, k2 = settings.keys.p2, a2 = ALT_KEYS.p2;
  const is = (b) => code === k1[b] || code === k2[b] || code === a2[b];
  let player = -1;
  for (const b of BUTTONS) {
    if (code === k1[b]) player = 0;
    else if (code === k2[b] || code === a2[b]) player = 1;
  }
  if (code === 'ArrowUp' || is('up')) return { a: 'up', player };
  if (code === 'ArrowDown' || is('down')) return { a: 'down', player };
  if (code === 'ArrowLeft' || is('left')) return { a: 'left', player };
  if (code === 'ArrowRight' || is('right')) return { a: 'right', player };
  if (code === 'Enter' || code === 'Space' || code === 'NumpadEnter' || is('J')) return { a: 'ok', player: code === 'Enter' || code === 'Space' ? -1 : player };
  if (code === 'Escape' || code === 'Backspace' || is('K')) return { a: 'back', player: code === 'Escape' || code === 'Backspace' ? -1 : player };
  if (is('U')) return { a: 'alt', player };
  if (is('L')) return { a: 'alt2', player };
  return null;
}

const BUF = 7; // 按键缓冲帧数
// 统一手柄接口:held[按钮]、buf[按钮](剩余缓冲帧)、take(按钮)消费一次按下
class Pad {
  constructor() { this.held = {}; this.buf = {}; this.prev = {}; for (const b of BUTTONS) { this.held[b] = false; this.buf[b] = 0; } }
  tickBuf() { if (this.frozen) return; for (const b of BUTTONS) if (this.buf[b] > 0) this.buf[b]--; }
  take(b) { if (this.buf[b] > 0) { this.buf[b] = 0; return true; } return false; }
  has(b) { return this.buf[b] > 0; }
  clear() { for (const b of BUTTONS) this.buf[b] = 0; }
}

export class KeyPad extends Pad {
  constructor(p) { super(); this.p = p; }
  update() {
    this.tickBuf();
    const map = settings.keys[this.p], alt = ALT_KEYS[this.p];
    for (const b of BUTTONS) {
      const h = keyboard.down.has(map[b]) || (alt[b] && keyboard.down.has(alt[b]));
      const pr = keyboard.pressed.has(map[b]) || (alt[b] && keyboard.pressed.has(alt[b]));
      if (pr || (h && !this.prev[b])) this.buf[b] = BUF;
      this.held[b] = h || pr;
      this.prev[b] = h;
    }
  }
}

// AI 只通过它操作角色
export class VirtualPad extends Pad {
  constructor() { super(); this.want = {}; }
  set(b, v) { this.want[b] = v; }
  tap(b) { this.buf[b] = BUF; }
  release() { for (const b of BUTTONS) this.want[b] = false; }
  update() {
    this.tickBuf();
    for (const b of BUTTONS) this.held[b] = !!this.want[b];
  }
}
