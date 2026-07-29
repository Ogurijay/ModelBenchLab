// input.js — 键盘 + GBA 外壳按键统一输入
// 逻辑按键:UP DOWN LEFT RIGHT A B START SELECT。
// pressed = 当帧边沿;held = 持续;rep = 菜单导航用的按住重复(260ms 首延迟 / 110ms 重复)。

const KEYMAP = {
  ArrowUp: 'UP', KeyW: 'UP',
  ArrowDown: 'DOWN', KeyS: 'DOWN',
  ArrowLeft: 'LEFT', KeyA: 'LEFT',
  ArrowRight: 'RIGHT', KeyD: 'RIGHT',
  KeyZ: 'A', KeyJ: 'A', Space: 'A',
  KeyX: 'B', KeyK: 'B', Escape: 'B',
  Enter: 'START',
  Tab: 'SELECT', ShiftLeft: 'SELECT', ShiftRight: 'SELECT',
};

const held = new Set();
const pressedNow = new Set();
const repState = new Map(); // btn → {t0, last}
let firstCbs = [];
let extraCbs = []; // (code) => void  额外物理键(如 M 静音)

function press(btn) {
  if (!held.has(btn)) {
    held.add(btn);
    pressedNow.add(btn);
    repState.set(btn, { t0: performance.now(), last: 0 });
  }
  fireFirst();
}
function release(btn) {
  held.delete(btn);
  repState.delete(btn);
}
function fireFirst() {
  if (firstCbs.length) {
    const cbs = firstCbs;
    firstCbs = [];
    cbs.forEach((cb) => cb());
  }
}

export const Input = {
  init() {
    window.addEventListener('keydown', (e) => {
      const btn = KEYMAP[e.code];
      extraCbs.forEach((cb) => cb(e.code));
      if (!btn) return;
      e.preventDefault();
      if (!e.repeat) press(btn);
    });
    window.addEventListener('keyup', (e) => {
      const btn = KEYMAP[e.code];
      if (btn) { e.preventDefault(); release(btn); }
    });
    window.addEventListener('blur', () => { held.clear(); repState.clear(); });

    // 外壳按钮
    document.querySelectorAll('[data-btn]').forEach((el) => {
      const btn = el.dataset.btn;
      const down = (e) => { e.preventDefault(); press(btn); };
      const up = (e) => { e.preventDefault(); release(btn); };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  },

  // 每帧末调用:清边沿
  update() { pressedNow.clear(); },

  pressed(btn) { return pressedNow.has(btn); },
  held(btn) { return held.has(btn); },

  // 按住重复(用于菜单/列表导航)
  rep(btn) {
    if (pressedNow.has(btn)) return true;
    const st = repState.get(btn);
    if (!st) return false;
    const now = performance.now();
    const dt = now - st.t0;
    if (dt < 260) return false;
    if (now - st.last >= 110) { st.last = now; return true; }
    return false;
  },

  dirHeld() {
    for (const d of ['UP', 'DOWN', 'LEFT', 'RIGHT']) if (held.has(d)) return d;
    return null;
  },

  onFirst(cb) { firstCbs.push(cb); },
  onKey(cb) { extraCbs.push(cb); },
};
