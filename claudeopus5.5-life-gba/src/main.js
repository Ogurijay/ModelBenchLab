// 入口:场景管理(标题 / 创建角色 / 世界 / 小游戏 / 结局)、固定步长主循环、画面缩放、评测钩子。
import { ctx, canvas, W, H, P, rect, text, textC, textW, ptext, ptextS, pwidth, panel, cursor, mk, shade } from './gfx.js';
import { input, onUserGesture } from './input.js';
import { initAudio, playMusic, sfx, setMuted, isMuted } from './audio.js';
import { simFrame, portrait, plumbob, building, furniture, icon, SKINS, HAIRS, SHIRTS, PANTS, tile } from './sprites.js';
import * as sim from './sim.js';
import { ui, updateUI, drawUI, drawToasts, say, menu, toast } from './ui.js';
import { world, initWorld, updateWorld, drawWorld, drawWorldUI, onSimEvent, introSequence } from './world.js';
import { setMinigameHooks } from './minigames.js';
import { STORY, CHAPTERS, NPCS } from './data.js';

let scene = null;
let T = 0;
function setScene(s) { scene = s; ui.clear(); s.enter?.(); }

onUserGesture(() => initAudio());
window.addEventListener('gba-mute', () => { setMuted(!isMuted()); toast(isMuted() ? '声音已关闭' : '声音已开启', 'music'); });
sim.on((type, d) => onSimEvent(type, d));

// ---------------------------------------------------------------- 标题
const titleScene = {
  sel: 0, t: 0,
  enter() { this.t = 0; this.sel = sim.hasSave() ? 1 : 0; playMusic('title'); },
  items() { return [{ id: 'new', label: '新的生活' }, ...(sim.hasSave() ? [{ id: 'cont', label: '继续生活' }] : []), { id: 'help', label: '操作说明' }]; },
  update() {
    this.t += 1 / 60;
    if (ui.busy()) return updateUI();
    const items = this.items();
    if (input.repeat('up')) { this.sel = (this.sel + items.length - 1) % items.length; sfx.cursor(); }
    if (input.repeat('down')) { this.sel = (this.sel + 1) % items.length; sfx.cursor(); }
    if (input.pressed('A') || input.pressed('START')) {
      sfx.select();
      const it = items[this.sel];
      if (it.id === 'new') setScene(createScene);
      if (it.id === 'cont' && sim.load()) startWorld(false);
      if (it.id === 'help') say([
        [null, '这是一款致敬 GBA 掌机版《模拟人生》的像素生活模拟。'],
        [null, '方向键移动,按住 B 跑步;A 与物品、镇民互动;B 取消。START 打开状态菜单,SELECT 显示需求速览。'],
        [null, '照顾好八项需求,打工赚钱、交朋友、学技能、买家具,一步步完成章节目标,最终买下湖景别墅!'],
        [null, '键盘:Z/J/空格=A,X/K=B,回车=START,Shift=SELECT,Q/E=L/R,M 静音。手机可直接按屏幕上的按键。'],
      ]);
    }
  },
  draw() {
    const t = this.t;
    // 天空色带
    const sky = ['#f8b878', '#f8c890', '#f0d8a8', '#c8e0f0', '#a8d0f0', '#88c0f0'];
    for (let i = 0; i < 6; i++) rect(0, 80 - i * 14, W, 14, sky[i]);
    rect(0, 0, W, 10, '#78b0e8');
    // 云
    for (let i = 0; i < 3; i++) {
      const x = ((t * 6 + i * 90) % (W + 60)) - 40, y = 14 + i * 12;
      rect(x, y, 30, 6, P.white); rect(x + 6, y - 4, 16, 5, P.white);
    }
    // 山丘
    for (let x = 0; x < W; x++) {
      const h1 = 78 + Math.round(Math.sin(x / 30) * 6 + Math.sin(x / 13) * 2);
      rect(x, h1, 1, H - h1, '#58a848');
      const h2 = 92 + Math.round(Math.sin(x / 22 + 2) * 5);
      rect(x, h2, 1, H - h2, '#48983c');
    }
    rect(0, 112, W, 48, '#60b848');
    for (let x = 0; x < W; x += 16) ctx.drawImage(tile('.', 'town', x / 16, 9), x, 112), ctx.drawImage(tile(x % 48 ? '.' : ',', 'town', x / 16, 10), x, 128), ctx.drawImage(tile('.', 'town', x / 16, 11), x, 144);
    // 小屋与树
    const hb = building('home', 6, 5, 2, false);
    ctx.drawImage(hb.c, 148, 66);
    ctx.drawImage(furniture('tree', 1).c, 112, 86);
    ctx.drawImage(furniture('tree', 0).c, 226, 90);
    ctx.drawImage(furniture('mailbox', 1).c, 136, 120);
    // 走过的小人
    const looks = [
      { skin: SKINS[0], hair: HAIRS[1], hairStyle: 2, shirt: SHIRTS[5], pants: PANTS[4], skirt: true },
      { skin: SKINS[2], hair: HAIRS[4], hairStyle: 0, shirt: SHIRTS[1], pants: PANTS[0] },
    ];
    looks.forEach((lk, i) => {
      const x = ((t * 22 + i * 130) % (W + 40)) - 20;
      const f = Math.floor(t * 7 + i) % 4;
      const img = f % 2 ? simFrame(lk, 'right', 'stand') : simFrame(lk, 'right', 'walk', f === 0 ? 0 : 1);
      ctx.drawImage(img, x, 132);
    });
    // 旋转的大绿钻
    const pb = plumbob('#48d048');
    const sx = Math.abs(Math.cos(t * 1.6));
    const pw = Math.max(2, Math.round(9 * 4 * sx));
    ctx.drawImage(pb, 0, 0, 9, 14, Math.round(36 - pw / 2), 10 + Math.round(Math.sin(t * 2) * 3), pw, 56);
    // 标题
    text('像素人生', 62, 14, P.white, { size: 24, bold: true, outline: P.navy });
    text('绿钻镇物语', 68, 42, P.yellow, { outline: P.navy });
    ptextS('A GBA LIFE SIM TRIBUTE', 64, 58, P.white, P.navy);
    // 菜单
    if (!ui.busy()) {
      const items = this.items();
      const mw = 92, mh = items.length * 13 + 8;
      panel(8, 150 - mh - 4, mw, mh, 'blue');
      items.forEach((it, i) => {
        const y = 150 - mh + i * 13;
        text(it.label, 26, y, i === this.sel ? P.uiSel : P.white);
        if (i === this.sel) cursor(14, y + 3, t);
      });
    }
    ptext('(C) 2026 OPUS 5.5', W - 70, H - 7, '#285828');
    drawUI();
  },
};

// ---------------------------------------------------------------- 创建角色
const NAMES = ['阿乐', '小新', '米可', '杰克', '小雨', '阿凯', '露露', '大卫', '安娜', '小林', '阿星', '朵朵'];
const createScene = {
  sel: 0, t: 0,
  v: { name: 0, sex: 0, skin: 0, hairStyle: 1, hair: 1, shirt: 1, pants: 0 },
  enter() { this.t = 0; this.sel = 0; this.v.name = Math.floor(Math.random() * NAMES.length); playMusic('home'); },
  look() {
    const v = this.v;
    return { skin: SKINS[v.skin], hair: HAIRS[v.hair], hairStyle: v.hairStyle, shirt: SHIRTS[v.shirt], pants: PANTS[v.pants], skirt: v.sex === 1, shoes: '#382818' };
  },
  rows() {
    const v = this.v;
    return [
      ['名字', NAMES[v.name], 'name', NAMES.length],
      ['性别', v.sex ? '女' : '男', 'sex', 2],
      ['肤色', `${v.skin + 1}`, 'skin', SKINS.length],
      ['发型', ['短发', '刺猬头', '中长发', '长发'][v.hairStyle], 'hairStyle', 4],
      ['发色', `${v.hair + 1}`, 'hair', HAIRS.length],
      ['上衣', `${v.shirt + 1}`, 'shirt', SHIRTS.length],
      ['下装', `${v.pants + 1}`, 'pants', PANTS.length],
      ['开始生活!', '', null, 0],
    ];
  },
  update() {
    this.t += 1 / 60;
    if (ui.busy()) return updateUI();
    const rows = this.rows();
    if (input.repeat('up')) { this.sel = (this.sel + rows.length - 1) % rows.length; sfx.cursor(); }
    if (input.repeat('down')) { this.sel = (this.sel + 1) % rows.length; sfx.cursor(); }
    const r = rows[this.sel];
    if (r[2]) {
      let d = 0;
      if (input.repeat('left')) d = -1;
      if (input.repeat('right') || input.pressed('A')) d = 1;
      if (d) {
        this.v[r[2]] = (this.v[r[2]] + d + r[3]) % r[3];
        if (r[2] === 'sex') this.v.hairStyle = this.v.sex ? 2 : 1;
        sfx.cursor();
      }
    } else if (input.pressed('A') || input.pressed('START')) {
      sfx.fanfare();
      sim.newGame(NAMES[this.v.name], this.look());
      startWorld(true);
    }
    if (input.pressed('B')) { sfx.back(); setScene(titleScene); }
  },
  draw() {
    const t = this.t;
    rect(0, 0, W, H, '#3858a8');
    for (let y = 0; y < H; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < W; x += 16) rect(x, y, 8, 8, '#4068b8');
    panel(4, 4, 98, 152, 'cream');
    text('创建模拟市民', 12, 6, P.ink);
    // 地台与大号预览
    rect(16, 118, 74, 10, '#c8b890'); rect(20, 128, 66, 3, '#a89870');
    const dirs = ['down', 'right', 'up', 'left'];
    const d = dirs[Math.floor(t / 1.2) % 4];
    const img = simFrame(this.look(), d, 'stand');
    ctx.drawImage(img, 0, 0, 18, 28, 26, 40, 54, 84);
    ctx.drawImage(portrait(this.look()), 58, 22, 40, 40);
    text(NAMES[this.v.name], 12, 134, P.ink, { size: 16 });
    // 选项
    panel(106, 4, 130, 152, 'blue');
    this.rows().forEach(([label, val, key], i) => {
      const y = 10 + i * 17;
      const on = i === this.sel;
      if (!key) { text(label, 126, y + 12, on ? P.uiSel : P.white); if (on) cursor(114, y + 15, t); return; }
      text(label, 124, y, on ? P.uiSel : P.white);
      if (on) cursor(112, y + 3, t);
      if (['skin', 'hair', 'shirt', 'pants'].includes(key)) {
        const col = { skin: SKINS, hair: HAIRS, shirt: SHIRTS, pants: PANTS }[key][this.v[key]];
        rect(176, y + 2, 34, 9, P.ink); rect(177, y + 3, 32, 7, col);
      } else text(val, 176, y, P.white);
      if (on) { ptext('<', 168, y + 4, P.uiSel); ptext('>', 214, y + 4, P.uiSel); }
    });
    drawUI();
  },
};

// ---------------------------------------------------------------- 世界
function startWorld(isNew) {
  initWorld({ toTitle: () => { sim.save(); setScene(titleScene); }, ending: () => setScene(endingScene) });
  setScene(worldScene);
  if (isNew) introSequence();
  else toast(`欢迎回来,${sim.S.name}`, 'heart');
}
const worldScene = {
  // 本帧开始时若有界面层,按键只归界面,避免同一次 A 同时触发菜单和世界互动
  update() { const busy = ui.busy(); updateUI(); updateWorld(busy); },
  draw() { drawWorld(); drawWorldUI(); drawUI(); drawToasts(); },
};
setMinigameHooks({ setScene: (s) => { ui.clear(); scene = s; }, back: () => { scene = worldScene; world.resume(); } });

// ---------------------------------------------------------------- 结局
const endingScene = {
  t: 0,
  enter() { this.t = 0; playMusic('ending'); this.lines = 0; },
  update() {
    this.t += 1 / 60;
    if (ui.busy()) return updateUI();
    if (this.lines === 0 && this.t > 1) { this.lines = 1; say(STORY.ending.map((l) => [...l])); }
    if (this.lines === 1 && this.t > 3 && input.pressed('A')) {
      sim.S.ended = true; sim.checkChapter(); sim.save();
      scene = worldScene; ui.clear(); world.resume();
      toast('全部章节完成!继续自由生活吧', 'star', 4);
    }
  },
  draw() {
    const t = this.t;
    for (let i = 0; i < 8; i++) rect(0, i * 12, W, 12, ['#182858', '#203068', '#283878', '#384888', '#585898', '#8868a0', '#c87898', '#f09878'][i]);
    // 星星与烟花
    for (let i = 0; i < 20; i++) { const x = (i * 53) % W, y = (i * 29) % 60; if ((t * 2 + i) % 3 > 1) rect(x, y, 1, 1, P.white); }
    for (let k = 0; k < 3; k++) {
      const ph = (t * 0.6 + k / 3) % 1;
      const cx = 50 + k * 70, cy = 30 + k * 6;
      const cols = [P.yellow, P.pink, P.green3];
      for (let a = 0; a < 12; a++) {
        const ang = a / 12 * Math.PI * 2;
        const r = ph * 22;
        rect(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 2, 2, ph > 0.85 ? '#806080' : cols[k]);
      }
    }
    // 湖与别墅
    rect(0, 96, W, 64, '#3878c8');
    for (let i = 0; i < 10; i++) rect((i * 37 + t * 10) % W, 104 + (i * 7) % 50, 8, 1, '#78b0f0');
    rect(0, 92, W, 6, '#60b848');
    const villa = building('jed', 9, 5, 4, true);
    ctx.drawImage(villa.c, 48, 4 + 8);
    ctx.drawImage(furniture('tree', 2).c, 14, 52);
    ctx.drawImage(furniture('tree', 1).c, 200, 50);
    const S = sim.S;
    if (S) {
      ctx.drawImage(simFrame(S.look, 'down', 'act', (t * 3 | 0) % 2), 112, 66);
      const lover = Object.entries(S.rels).find(([, r]) => r.romance);
      if (lover) { const n = window.__npcLook?.(lover[0]); if (n) ctx.drawImage(simFrame(n, 'down', 'act', ((t * 3 | 0) + 1) % 2), 128, 66); ctx.drawImage(icon('heart'), 124, 56 - (t * 4 | 0) % 4); }
    }
    if (!ui.busy() && this.lines === 1) {
      panel(20, 100, W - 40, 52, 'blue');
      textC('—— 梦想之家 ——', W / 2, 102, P.uiSel);
      if (S) {
        textC(`第 ${S.day} 天 · 累计收入 §${S.stats.earned}`, W / 2, 116, P.white);
        textC(`社交 ${S.stats.socials} 次 · 打工 ${S.stats.shifts} 班`, W / 2, 129, P.white);
      }
      if ((t * 2 | 0) % 2) ptext('A', W - 30, 142, P.white);
    }
    drawUI();
  },
};

// ---------------------------------------------------------------- 主循环
const STEP = 1000 / 60;
let acc = 0, last = performance.now(), lastFrame = performance.now();
function tick() {
  input.update();
  scene.update();
}
function render() {
  ctx.imageSmoothingEnabled = false;
  scene.draw();
  T++;
}
function loop(now) {
  lastFrame = now;
  acc += Math.min(250, now - last);
  last = now;
  let n = 0;
  while (acc >= STEP && n < 6) { tick(); acc -= STEP; n++; }
  if (acc > STEP * 6) acc = 0;
  render();
  updatePower();
  requestAnimationFrame(loop);
}
// 标签页隐藏时 rAF 会停,用定时器兜底推进(保证无头测试与后台音乐计时)
setInterval(() => {
  const now = performance.now();
  if (now - lastFrame > 200) {
    acc += Math.min(250, now - last); last = now;
    let n = 0;
    while (acc >= STEP && n < 12) { tick(); acc -= STEP; n++; }
    render();
  }
}, 50);

const power = document.getElementById('power');
function updatePower() {
  if (!power || !sim.S || scene !== worldScene) return;
  power.classList.toggle('low', sim.S.motives.energy < 20);
}

// ---------------------------------------------------------------- 画面缩放
const lcd = document.getElementById('lcd');
const narrowMQ = window.matchMedia('(max-aspect-ratio: 1/1), (max-width: 640px)');
function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  let aw, ah;
  if (narrowMQ.matches) {
    aw = Math.min(vw, 560) - 52;
    ah = vh * 0.5;
  } else {
    const pad = Math.max(118, Math.min(vw * 0.15, 168));
    const short = vh <= 420;
    aw = vw - pad * 2 - 52 - 20 - 36 - 24;
    ah = vh - (short ? 70 : 150);
  }
  let s = Math.min(aw / 240, ah / 160);
  s = s >= 2 ? Math.floor(s) : Math.max(1, Math.floor(s * 4) / 4);
  if (aw < 240) s = Math.max(0.75, Math.floor(aw / 240 * 8) / 8);
  lcd.style.setProperty('--sw', `${Math.round(240 * s)}px`);
  document.documentElement.style.setProperty('--sw', `${Math.round(240 * s)}px`);
}
window.addEventListener('resize', fit);
narrowMQ.addEventListener?.('change', fit);
fit();

// ---------------------------------------------------------------- 评测钩子(无头确定性驱动)
window.__npcLook = (id) => NPCS[id]?.look;
window.__bench = {
  get scene() { return scene === titleScene ? 'title' : scene === createScene ? 'create' : scene === worldScene ? 'world' : scene === endingScene ? 'ending' : 'minigame'; },
  get state() { return sim.S; },
  get world() { return world; },
  get mg() { return scene && scene.game ? { phase: scene.phase, ...scene.game.debug() } : null; },
  get ui() { return { busy: ui.busy(), top: ui.top() ? Object.keys(ui.top()) : null }; },
  step(n = 1) { for (let i = 0; i < n; i++) tick(); render(); return this.scene; },
  press(btn, frames = 2) { input.inject(btn, frames); },
  // 按一下并推进若干帧
  tap(btn, after = 6) { input.inject(btn, 2); return this.step(after); },
  newGame(name = '测试君') {
    sim.newGame(name, createScene.look()); startWorld(true); this.step(2); return true;
  },
  setTime(h, m = 0) { sim.S.min = h * 60 + m; },
  setMotive(id, v) { sim.S.motives[id] = v; },
  addMoney(n) { sim.S.money += n; },
  goto(map, x, y, dir = 'down') { world.enter(map, x, y, dir); this.step(1); },
  advance(min) { sim.advance(min, {}); },
  snapshot() { render(); return canvas.toDataURL('image/png'); },
  render,
};

setScene(titleScene);
requestAnimationFrame(loop);
