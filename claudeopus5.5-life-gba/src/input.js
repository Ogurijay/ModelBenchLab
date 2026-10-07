// 输入:键盘 + 屏上掌机按键(指针/触屏),统一成 GBA 的 10 个按键。
// 每个逻辑帧调用 update():held=按住,pressed=本帧新按下,repeat=菜单方向连发。
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'A', KeyJ: 'A', Space: 'A', KeyX: 'B', KeyK: 'B', Escape: 'B', Backspace: 'B',
  Enter: 'START', NumpadEnter: 'START', ShiftLeft: 'SELECT', ShiftRight: 'SELECT', Tab: 'SELECT', KeyQ: 'L', KeyE: 'R',
};
const sources = { key: new Set(), touch: new Map(), bench: new Map() };
const pending = new Set();
const prev = new Set();
const now = new Set();
const pressedNow = new Set();
const holdFrames = new Map();
const listeners = [];

export const input = {
  held: (b) => now.has(b),
  pressed: (b) => pressedNow.has(b),
  repeat(b) {
    if (pressedNow.has(b)) return true;
    const f = holdFrames.get(b) || 0;
    return f > 16 && (f - 16) % 5 === 0;
  },
  anyPressed: () => pressedNow.size > 0,
  dir() {
    if (now.has('up')) return 'up';
    if (now.has('down')) return 'down';
    if (now.has('left')) return 'left';
    if (now.has('right')) return 'right';
    return null;
  },
  update() {
    now.clear();
    for (const b of sources.key) now.add(b);
    for (const b of sources.touch.values()) if (b) now.add(b);
    for (const [b, n] of sources.bench) { now.add(b); if (n <= 1) sources.bench.delete(b); else sources.bench.set(b, n - 1); }
    pressedNow.clear();
    for (const b of now) if (!prev.has(b)) pressedNow.add(b);
    for (const b of pending) pressedNow.add(b);
    pending.clear();
    for (const b of now) holdFrames.set(b, (holdFrames.get(b) || 0) + 1);
    for (const b of [...holdFrames.keys()]) if (!now.has(b)) holdFrames.delete(b);
    prev.clear();
    for (const b of now) prev.add(b);
  },
  // 无头测试:按下 n 帧
  inject(b, frames = 2) { sources.bench.set(b, frames); pending.add(b); },
  onFirstInput(fn) { listeners.push(fn); },
  clear() { sources.key.clear(); sources.touch.clear(); },
};

function fire() { while (listeners.length) { try { listeners.shift()(); } catch (e) { console.error(e); } } }
// 一次性监听需每次交互都触发(恢复 AudioContext)
const always = [];
export function onUserGesture(fn) { always.push(fn); }
function gesture() { fire(); for (const f of always) f(); }

window.addEventListener('keydown', (e) => {
  const b = KEYMAP[e.code];
  gesture();
  if (e.code === 'KeyM') { window.dispatchEvent(new CustomEvent('gba-mute')); return; }
  if (!b) return;
  e.preventDefault();
  if (!e.repeat) pending.add(b);
  sources.key.add(b);
});
window.addEventListener('keyup', (e) => {
  const b = KEYMAP[e.code];
  if (b) { sources.key.delete(b); e.preventDefault(); }
});
window.addEventListener('blur', () => { sources.key.clear(); sources.touch.clear(); });

// ---------- 屏上按键 ----------
function setVisual(btn, on) {
  document.querySelectorAll(`[data-btn="${btn}"]`).forEach((el) => el.classList.toggle('on', on));
}
function bindButton(el) {
  const btn = el.dataset.btn;
  if (['up', 'down', 'left', 'right'].includes(btn)) return; // 方向键由 D-pad 整体处理
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault(); gesture();
    el.setPointerCapture?.(e.pointerId);
    sources.touch.set('p' + e.pointerId, btn); pending.add(btn); setVisual(btn, true);
    navigator.vibrate?.(8);
  });
  const up = (e) => { sources.touch.delete('p' + e.pointerId); setVisual(btn, false); };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
document.querySelectorAll('[data-btn]').forEach(bindButton);

const dpad = document.getElementById('dpad');
if (dpad) {
  const dirs = ['up', 'down', 'left', 'right'];
  const setDir = (id, d) => {
    const old = sources.touch.get(id);
    if (old === d) return;
    if (d && !old) pending.add(d);
    else if (d && old !== d) pending.add(d);
    sources.touch.set(id, d);
    dirs.forEach((k) => setVisual(k, [...sources.touch.values()].includes(k)));
  };
  const calc = (e) => {
    const r = dpad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.12) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  };
  dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault(); gesture();
    dpad.setPointerCapture?.(e.pointerId);
    setDir('d' + e.pointerId, calc(e));
    navigator.vibrate?.(6);
  });
  dpad.addEventListener('pointermove', (e) => { if (sources.touch.has('d' + e.pointerId)) setDir('d' + e.pointerId, calc(e)); });
  const end = (e) => { sources.touch.delete('d' + e.pointerId); dirs.forEach((k) => setVisual(k, [...sources.touch.values()].includes(k))); };
  dpad.addEventListener('pointerup', end);
  dpad.addEventListener('pointercancel', end);
  dpad.addEventListener('lostpointercapture', end);
}
// 点击画面 = A(便于鼠标用户推进对话)
document.getElementById('lcd')?.addEventListener('pointerdown', (e) => { e.preventDefault(); gesture(); pending.add('A'); });
