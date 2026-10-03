// 视觉小说层：HTML 叠在 Three.js 画布上。立绘 + 对话框 + 背景 + 章节卡（竖排）+ 标题卡 + 关键画面。
import { portraitSVG, CAST } from './portraits.js';
import { sceneCanvas } from './scenes.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class VN {
  constructor(app) {
    this.app = app;
    this.root = $('vn'); this.box = $('vn-box'); this.nameEl = $('vn-name'); this.textEl = $('vn-text');
    this.left = $('vn-left'); this.right = $('vn-right'); this.bg = $('vn-bg');
    this.waiting = null; this.typing = false; this.skip = false; this.speakers = {};
    this.box.addEventListener('click', () => this.advance());
    $('vn-skip').addEventListener('click', (e) => { e.stopPropagation(); this.skip = true; this.advance(); });
    this.root.addEventListener('click', (e) => { if (e.target === this.root || e.target.closest('#vn-bg')) this.advance(); });
  }
  show(on) { this.root.classList.toggle('hidden', !on); }
  setBg(id) {
    this.bg.innerHTML = '';
    this.root.classList.toggle('overlay', !id);
    if (!id) return;
    const c = sceneCanvas(id);
    const img = document.createElement('canvas');
    img.width = c.width; img.height = c.height; img.getContext('2d').drawImage(c, 0, 0);
    img.style.objectFit = 'cover';
    this.bg.appendChild(img);
  }
  clearPortraits() { this.left.innerHTML = ''; this.right.innerHTML = ''; this.left.dataset.who = ''; this.right.dataset.who = ''; }

  /** 键盘/点击推进 */
  advance() {
    if (this.typing) { this.typing = false; return; }
    if (this.waiting) { const w = this.waiting; this.waiting = null; w(); }
  }
  wait() {
    if (this.skip || this.app.fast) return Promise.resolve();
    return new Promise((r) => { this.waiting = r; });
  }

  async type(text, quiet) {
    this.textEl.classList.toggle('quiet', !!quiet);
    if (this.skip || this.app.fast) { this.textEl.textContent = text; return; }
    this.typing = true; this.textEl.textContent = '';
    for (let i = 0; i < text.length && this.typing; i++) {
      this.textEl.textContent = text.slice(0, i + 1);
      if (i % 2 === 0 && !quiet) this.app.audio.sfx('text');
      await sleep(quiet ? 70 : 26);
    }
    this.typing = false;
    this.textEl.textContent = text;
  }

  async say(who, face, text, opts = {}) {
    this.box.style.display = '';
    const c = CAST[who];
    this.nameEl.textContent = c ? c.name : '';
    // 立绘：主角固定在左；其他人优先右侧，右侧已有别人且左侧不是主角时放左侧
    let el;
    const L = this.left.dataset.who, R = this.right.dataset.who;
    if (who === 'takumi') el = this.left;
    else if (!R || R === who) el = this.right;
    else if (L === who || (L !== 'takumi' && L !== undefined && L !== '') || !L) el = L === 'takumi' ? this.right : this.left;
    else el = this.right;
    const other = el === this.left ? this.right : this.left;
    el.innerHTML = portraitSVG(who, face); el.dataset.who = who;
    el.classList.remove('dim'); other.classList.add('dim');
    await this.type(text, opts.quiet);
    await this.wait();
  }
  async narr(text, opts = {}) {
    this.box.style.display = '';
    this.nameEl.textContent = '';
    this.left.classList.add('dim'); this.right.classList.add('dim');
    await this.type(text, true);
    if (opts.hold && !this.skip && !this.app.fast) await sleep(opts.hold * 1000);
    await this.wait();
  }
  async tip(text) {
    this.box.style.display = '';
    this.nameEl.textContent = '提示';
    this.textEl.classList.remove('quiet');
    this.textEl.textContent = text;
    await this.wait();
  }
  async hold(sec, panelOnly) {
    if (panelOnly) { this.box.style.display = 'none'; this.clearPortraits(); }
    if (!this.app.fast) await sleep(sec * 1000);
    this.box.style.display = '';
  }

  /** 章节卡：竖排标题 */
  async card(ch) {
    const el = $('chapter-card');
    el.innerHTML = `<div class="motive">${ch.motive ? '动机 · ' + ch.motive : ''}</div><div class="ttl">${ch.title}</div><div class="num">${ch.num}</div>`;
    el.classList.add('on');
    this.app.audio.sfx('piano');
    if (!this.app.fast) await sleep(2600);
    el.classList.remove('on');
    if (!this.app.fast) await sleep(500);
  }
}

/** 全屏标题卡（终章与尾声） */
export async function titleCard(lines, hold, app, white = true) {
  const el = $('titlecard');
  el.innerHTML = `<div class="tc">${lines[0]}${lines[1] ? `<small>${lines[1]}</small>` : ''}</div>`;
  el.classList.toggle('white', white);
  el.classList.add('on');
  if (!app.fast) await sleep(hold * 1000 + 2500);
  el.classList.remove('on');
  if (!app.fast) await sleep(1200);
}

/** 全屏关键画面 */
export async function fullPanel(id, hold, app) {
  const el = $('panels');
  el.innerHTML = '';
  const p = document.createElement('div');
  p.className = 'panel on';
  Object.assign(p.style, { left: '0', top: '0', width: '100%', height: '100%', border: 'none', boxShadow: 'none' });
  const c = sceneCanvas(id);
  const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; cv.getContext('2d').drawImage(c, 0, 0);
  p.appendChild(cv); el.appendChild(p);
  if (!app.fast) await sleep(hold * 1000);
  p.classList.remove('on');
  if (!app.fast) await sleep(400);
  el.innerHTML = '';
}
