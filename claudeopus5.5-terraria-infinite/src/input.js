// 键鼠输入状态。按键用 KeyboardEvent.code;评测钩子可直接注入按键与鼠标。
export const input = {
  keys: new Set(), pressed: new Set(), released: new Set(),
  mx: 0, my: 0, mouseIn: false,
  lmb: false, rmb: false, lPressed: false, rPressed: false, lReleased: false, rReleased: false,
  wheel: 0, typing: false, blocked: false,
  lastTap: {},
  doubleTap: new Set(),
};

export function key(code) { return input.keys.has(code); }
export function hit(code) { return input.pressed.has(code); }
export function endFrame() {
  input.pressed.clear(); input.released.clear(); input.doubleTap.clear();
  input.lPressed = input.rPressed = input.lReleased = input.rReleased = false;
  input.wheel = 0;
}

export function press(code, down = true) {
  if (down) {
    if (!input.keys.has(code)) {
      input.pressed.add(code);
      const t = performance.now();
      if (t - (input.lastTap[code] || 0) < 260) input.doubleTap.add(code);
      input.lastTap[code] = t;
    }
    input.keys.add(code);
  } else {
    input.keys.delete(code);
    input.released.add(code);
  }
}
export function mouseButton(btn, down) {
  if (btn === 0) { if (down && !input.lmb) input.lPressed = true; if (!down && input.lmb) input.lReleased = true; input.lmb = down; }
  if (btn === 2) { if (down && !input.rmb) input.rPressed = true; if (!down && input.rmb) input.rReleased = true; input.rmb = down; }
}

const PASS = new Set(['F5', 'F11', 'F12']);
export function bindInput(canvas, onKey) {
  window.addEventListener('keydown', e => {
    if (input.typing) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (!PASS.has(e.code) && !(e.ctrlKey && (e.code === 'KeyR' || e.code === 'KeyC' || e.code === 'KeyV'))) e.preventDefault();
    if (onKey && onKey(e) === false) return;
    press(e.code, true);
  });
  window.addEventListener('keyup', e => { press(e.code, false); });
  window.addEventListener('blur', () => { input.keys.clear(); input.lmb = input.rmb = false; });
  canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); input.mx = e.clientX - r.left; input.my = e.clientY - r.top; input.mouseIn = true; });
  canvas.addEventListener('mouseleave', () => { input.mouseIn = false; });
  canvas.addEventListener('mousedown', e => { mouseButton(e.button, true); e.preventDefault(); });
  window.addEventListener('mouseup', e => mouseButton(e.button, false));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { input.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
}
