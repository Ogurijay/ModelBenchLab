// UI：元素面板、工具栏、指针交互、状态栏、存档
import { W, H, SCALE, AW } from './const.js';
import { E, COUNT, NAME, SYM, CAT, DESC, CATS, BASE_RGB, STATE } from './elements.js';
import { VIEW_NAMES } from './render.js';

const TOOLS = [
  { id: 'brush', label: '✏️ 画笔', hint: '按住左键连续绘制当前元素' },
  { id: 'line', label: '📏 直线', hint: '拖出一条直线，松手落笔' },
  { id: 'rect', label: '▭ 方框', hint: '拖出一个空心矩形（做容器很方便）' },
  { id: 'erase', label: '⌫ 橡皮', hint: '擦除粒子（右键随时可擦）' },
  { id: 'wind', label: '🌬 吹风', hint: '按住拖动，朝拖动方向刮风' },
  { id: 'heat', label: '🔥 加热', hint: '给区域升温（不产生物质）' },
  { id: 'cool', label: '❄️ 冷却', hint: '给区域降温（不产生物质）' },
  { id: 'pick', label: '🧪 吸管', hint: '点击画面拾取该处元素' },
];
const FAN_ARROWS = ['→', '↓', '←', '↑'];
const SAVE_KEY = 'claudefable5-powdergame.save';

export class UI {
  constructor(sim, renderer, canvas, onDemo) {
    this.sim = sim;
    this.renderer = renderer;
    this.canvas = canvas;
    this.onDemo = onDemo;
    this.tool = 'brush';
    this.element = E.SAND;
    this.brush = 4;
    this.fanDir = 0;
    this.paused = false;
    this.stepOnce = false;
    this.speed = 1;
    this.down = false;
    this.button = 0;
    this.curX = -1; this.curY = -1;
    this.lastX = -1; this.lastY = -1;
    this.dragSX = 0; this.dragSY = 0; // 直线/方框起点
    this.hint = '左键绘制 · 右键擦除 · 空格暂停 · [ ] 调笔刷 · V 切视图';
    this.buildToolbar();
    this.buildPalette();
    this.bindCanvas();
    this.bindKeys();
    this.updateDesc();
  }

  // ———— 控件构建 ————
  buildToolbar() {
    const bar = document.getElementById('toolbar');
    const mk = (label, title, onclick, cls = '') => {
      const b = document.createElement('button');
      b.textContent = label; b.title = title; b.className = cls;
      b.addEventListener('click', onclick);
      bar.appendChild(b);
      return b;
    };
    const group = (label) => {
      const s = document.createElement('span');
      s.className = 'grp'; s.textContent = label;
      bar.appendChild(s);
    };

    group('工具');
    this.toolBtns = {};
    for (const t of TOOLS) {
      this.toolBtns[t.id] = mk(t.label, t.hint, () => this.setTool(t.id), t.id === this.tool ? 'on' : '');
    }
    this.fanBtn = mk(`风向 ${FAN_ARROWS[0]}`, '切换风扇朝向（快捷键 R）', () => this.cycleFan());

    group('笔刷');
    const size = document.createElement('input');
    size.type = 'range'; size.min = '1'; size.max = '20'; size.value = String(this.brush);
    size.title = '笔刷半径';
    size.addEventListener('input', () => { this.brush = +size.value; this.sizeLabel.textContent = size.value; });
    bar.appendChild(size);
    this.sizeInput = size;
    this.sizeLabel = document.createElement('span');
    this.sizeLabel.className = 'val'; this.sizeLabel.textContent = String(this.brush);
    bar.appendChild(this.sizeLabel);

    group('模拟');
    this.pauseBtn = mk('⏸ 暂停', '空格键', () => this.togglePause());
    mk('⏭ 单步', '暂停时逐帧观察（N）', () => { this.stepOnce = true; });
    this.speedBtns = [1, 2, 4].map(s =>
      mk(`${s}×`, `每帧模拟 ${s} 步`, () => this.setSpeed(s), s === 1 ? 'on' : ''));

    group('视图');
    this.viewBtns = VIEW_NAMES.map((n, vi) =>
      mk(n, `切换到${n}视图`, () => this.setView(vi), vi === 0 ? 'on' : ''));

    group('场景');
    mk('🧹 清空', '清空画布', () => { this.sim.clear(); });
    mk('🏞 示例', '载入演示场景', () => this.onDemo());
    mk('💾 存档', '保存到浏览器 localStorage', () => this.save());
    mk('📂 读档', '读取存档', () => this.load());
  }

  buildPalette() {
    const pal = document.getElementById('palette');
    for (const cat of CATS) {
      const head = document.createElement('div');
      head.className = 'cat'; head.textContent = `— ${cat} —`;
      pal.appendChild(head);
      const grid = document.createElement('div');
      grid.className = 'chips';
      pal.appendChild(grid);
      for (let id = 0; id < COUNT; id++) {
        if (CAT[id] !== cat) continue;
        const r = BASE_RGB[id * 3], g = BASE_RGB[id * 3 + 1], b = BASE_RGB[id * 3 + 2];
        const chip = document.createElement('button');
        chip.className = 'chip';
        chip.style.background = `rgb(${r},${g},${b})`;
        chip.style.color = (r * 0.299 + g * 0.587 + b * 0.114) > 140 ? '#111' : '#f4f4f4';
        chip.innerHTML = `<b>${NAME[id]}</b><i>${SYM[id]}</i>`;
        chip.title = `${NAME[id]} ${SYM[id]}\n${DESC[id]}`;
        chip.addEventListener('click', () => this.setElement(id, chip));
        grid.appendChild(chip);
        if (id === this.element) { chip.classList.add('on'); this.curChip = chip; }
      }
    }
  }

  setTool(id) {
    this.tool = id;
    for (const k in this.toolBtns) this.toolBtns[k].classList.toggle('on', k === id);
    const t = TOOLS.find(t => t.id === id);
    this.hint = t ? t.hint : '';
  }

  setElement(id, chip) {
    this.element = id;
    if (this.curChip) this.curChip.classList.remove('on');
    if (!chip) {
      chip = document.querySelector(`#palette .chip[title^="${NAME[id]} "]`);
    }
    if (chip) { chip.classList.add('on'); this.curChip = chip; }
    if (this.tool === 'erase' || this.tool === 'pick') this.setTool('brush');
    this.updateDesc();
  }

  updateDesc() {
    const id = this.element;
    document.getElementById('descbox').innerHTML =
      `<b>${NAME[id]}</b> <span class="sym">${SYM[id]}</span><br>${DESC[id]}`;
  }

  cycleFan() {
    this.fanDir = (this.fanDir + 1) & 3;
    this.fanBtn.textContent = `风向 ${FAN_ARROWS[this.fanDir]}`;
  }

  togglePause() {
    this.paused = !this.paused;
    this.pauseBtn.textContent = this.paused ? '▶ 继续' : '⏸ 暂停';
    this.pauseBtn.classList.toggle('on', this.paused);
  }

  setSpeed(s) {
    this.speed = s;
    this.speedBtns.forEach((b, k) => b.classList.toggle('on', [1, 2, 4][k] === s));
  }

  setView(v) {
    this.renderer.view = v;
    this.viewBtns.forEach((b, k) => b.classList.toggle('on', k === v));
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, this.sim.save());
      this.hint = '已保存到浏览器本地存储 ✓';
    } catch (e) {
      this.hint = '保存失败：' + e.message;
    }
  }

  load() {
    const s = localStorage.getItem(SAVE_KEY);
    this.hint = s && this.sim.load(s) ? '读档完成 ✓' : '没有可用的存档';
  }

  // ———— 指针交互 ————
  bindCanvas() {
    const cv = this.canvas;
    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return [
        Math.floor((e.clientX - r.left) * W / r.width),
        Math.floor((e.clientY - r.top) * H / r.height),
      ];
    };
    cv.addEventListener('contextmenu', e => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      this.down = true;
      this.button = e.button;
      this.curX = this.lastX = this.dragSX = x;
      this.curY = this.lastY = this.dragSY = y;
      if (this.tool === 'pick' && e.button === 0) this.pick(x, y);
    });
    cv.addEventListener('pointermove', (e) => {
      const [x, y] = pos(e);
      this.curX = x; this.curY = y;
    });
    const up = () => {
      if (this.down && this.button === 0) {
        if (this.tool === 'line') this.commitLine();
        else if (this.tool === 'rect') this.commitRect();
      }
      this.down = false;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (!this.down) { this.curX = this.curY = -1; } });
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case ' ': e.preventDefault(); this.togglePause(); break;
        case 'n': case 'N': this.stepOnce = true; break;
        case '[': this.brush = Math.max(1, this.brush - 1); this.syncSize(); break;
        case ']': this.brush = Math.min(20, this.brush + 1); this.syncSize(); break;
        case 'r': case 'R': this.cycleFan(); break;
        case 'v': case 'V': this.setView((this.renderer.view + 1) % 3); break;
      }
    });
  }

  syncSize() {
    this.sizeInput.value = String(this.brush);
    this.sizeLabel.textContent = String(this.brush);
  }

  pick(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const t = this.sim.cells[y * W + x];
    if (t !== E.EMPTY) this.setElement(t);
  }

  // 每帧调用：按住时连续施放工具
  tick() {
    if (this.down) {
      const { curX: x, curY: y, lastX: lx, lastY: ly } = this;
      if (this.button === 2) {
        this.strokeBrush(lx, ly, x, y, E.EMPTY); // 右键擦除
      } else if (this.tool === 'brush') {
        this.strokeBrush(lx, ly, x, y, this.element);
      } else if (this.tool === 'erase') {
        this.strokeBrush(lx, ly, x, y, E.EMPTY);
      } else if (this.tool === 'wind') {
        const fx = (x - lx) * 0.55, fy = (y - ly) * 0.55;
        if (fx || fy) this.sim.blow(lx, ly, x, y, fx, fy);
      } else if (this.tool === 'heat') {
        this.sim.heatBrush(x, y, this.brush, 45);
      } else if (this.tool === 'cool') {
        this.sim.heatBrush(x, y, this.brush, -45);
      } else if (this.tool === 'pick') {
        this.pick(x, y);
      }
      this.lastX = x; this.lastY = y;
    }
  }

  strokeBrush(x0, y0, x1, y1, t) {
    const n = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let s = 0; s <= n; s++) {
      const x = Math.round(x0 + (x1 - x0) * s / n);
      const y = Math.round(y0 + (y1 - y0) * s / n);
      this.sim.paint(x, y, this.brush, t, this.fanDir);
    }
  }

  commitLine() {
    this.strokeBrush(this.dragSX, this.dragSY, this.curX, this.curY, this.element);
  }

  commitRect() {
    const x0 = Math.min(this.dragSX, this.curX), x1 = Math.max(this.dragSX, this.curX);
    const y0 = Math.min(this.dragSY, this.curY), y1 = Math.max(this.dragSY, this.curY);
    this.strokeBrush(x0, y0, x1, y0, this.element);
    this.strokeBrush(x0, y1, x1, y1, this.element);
    this.strokeBrush(x0, y0, x0, y1, this.element);
    this.strokeBrush(x1, y0, x1, y1, this.element);
  }

  // 叠加层：笔刷光标 + 拖拽预览
  drawOverlay(ctx) {
    const { curX: x, curY: y } = this;
    if (x < 0 || y < 0) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    if (this.down && this.button === 0 && this.tool === 'line') {
      ctx.beginPath(); ctx.moveTo(this.dragSX + 0.5, this.dragSY + 0.5); ctx.lineTo(x + 0.5, y + 0.5); ctx.stroke();
    } else if (this.down && this.button === 0 && this.tool === 'rect') {
      ctx.strokeRect(Math.min(this.dragSX, x) + 0.5, Math.min(this.dragSY, y) + 0.5,
        Math.abs(x - this.dragSX), Math.abs(y - this.dragSY));
    }
    ctx.beginPath();
    ctx.arc(x + 0.5, y + 0.5, this.brush + 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 状态栏
  updateStatus(fps) {
    const { curX: x, curY: y, sim } = this;
    let info = '—';
    if (x >= 0 && y >= 0 && x < W && y < H) {
      const i = y * W + x;
      const t = sim.cells[i];
      const p = sim.ap[(y >> 2) * AW + (x >> 2)];
      info = `(${x},${y}) ${NAME[t]} ${SYM[t]} · ${sim.temp[i].toFixed(1)}°C · 气压 ${p.toFixed(2)}`;
    }
    document.getElementById('status').textContent =
      `FPS ${fps.toFixed(0)} · 粒子 ${this.renderer.particleCount.toLocaleString()} · ${info} · ${this.hint}`;
  }
}
