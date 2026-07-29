import { applyInteraction, createInitialState, distanceToRect, formatTime, tickState } from './sim.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const W = 240;
const H = 160;
const ROOM_W = 180;
const SAVE_KEY = 'pocket-life-save-v1';

const palette = {
  ink: '#28233b', deep: '#3c3651', wall: '#e2b986', wallDark: '#b87b61',
  floorA: '#d9a96c', floorB: '#c68c5c', cream: '#f4ddb0', mint: '#81b69d',
  green: '#4d806d', blue: '#6986b3', blueDark: '#405b87', red: '#c85961',
  gold: '#e4b85a', white: '#fff4d6', shadow: '#73566c', purple: '#7b668f',
};

const objects = [
  { id: 'bed', label: '睡一觉', x: 15, y: 31, w: 39, h: 28, solid: true, minutes: 180, duration: 2400, needs: { energy: 50 }, icon: 'Z', color: '#7793bd', message: '软绵绵的枕头……晚安！' },
  { id: 'books', label: '读本书', x: 62, y: 27, w: 31, h: 16, solid: true, minutes: 35, duration: 1600, needs: { fun: 18 }, icon: '书', color: '#8a5d4b', message: '故事比窗外的雨还好听。' },
  { id: 'plant', label: '照料盆栽', x: 105, y: 31, w: 17, h: 18, solid: true, minutes: 15, duration: 1200, needs: { fun: 6 }, icon: '芽', color: '#5b8f68', message: '新叶子好像又长高了一点。' },
  { id: 'fridge', label: '做份简餐', x: 129, y: 27, w: 18, h: 27, solid: true, minutes: 25, duration: 1800, money: -8, needs: { hunger: 45 }, icon: '饭', color: '#b4c8b1', message: '热乎乎的蛋包饭，完成！' },
  { id: 'stove', label: '煮咖啡', x: 149, y: 31, w: 24, h: 20, solid: true, minutes: 12, duration: 1200, money: -3, needs: { energy: 12, fun: 4 }, icon: '杯', color: '#99685d', message: '今天也从一杯咖啡开始。' },
  { id: 'sofa', label: '看会电视', x: 15, y: 96, w: 43, h: 23, solid: true, minutes: 40, duration: 1800, needs: { fun: 28, energy: 5 }, icon: 'TV', color: '#9d6f8d', message: '正好赶上喜欢的动画重播！' },
  { id: 'phone', label: '打给好友', x: 73, y: 100, w: 22, h: 17, solid: true, minutes: 25, duration: 1500, needs: { social: 35, fun: 7 }, icon: '☎', color: '#dfb15c', message: '聊着聊着，心情明亮起来了。' },
  { id: 'shower', label: '冲个热水澡', x: 132, y: 94, w: 33, h: 31, solid: true, minutes: 25, duration: 1800, needs: { hygiene: 60 }, icon: '浴', color: '#78adc1', message: '从头到脚，清清爽爽！' },
  { id: 'door', label: '出门打工', x: 79, y: 126, w: 26, h: 12, solid: false, minutes: 150, duration: 2300, money: 55, needs: { energy: -18, hunger: -12, social: 8 }, icon: '¥', color: '#795342', message: '认真工作，赚到了 55 元。' },
];

const goals = [
  { id: 'fridge', label: '吃一顿饭' },
  { id: 'shower', label: '洗个热水澡' },
  { id: 'phone', label: '联系一位朋友' },
];

const state = {
  sim: loadSave(),
  player: { x: 87, y: 78, dir: 'down', frame: 0 },
  keys: new Set(),
  started: false,
  paused: false,
  sound: true,
  action: null,
  near: null,
  toast: '',
  toastUntil: 0,
  sparkle: [],
  lastTick: performance.now(),
  simClock: 0,
};

function loadSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved?.needs && Number.isFinite(saved.minute)) return saved;
  } catch { /* 从新档开始 */ }
  return createInitialState();
}

function save() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state.sim));
}

function pixelRect(x, y, w, h, color, outline = palette.ink) {
  ctx.fillStyle = outline;
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, Math.round(w) + 2, Math.round(h) + 2);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function text(value, x, y, color = palette.ink, size = 7, align = 'left') {
  ctx.fillStyle = color;
  ctx.font = `${size}px "DotGothic16", "Microsoft YaHei", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillText(value, Math.round(x), Math.round(y));
}

function wrapText(value, x, y, maxWidth, lineHeight = 10, color = palette.ink) {
  let line = '';
  let row = 0;
  for (const char of value) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      text(line, x, y + row * lineHeight, color, 7);
      line = char;
      row++;
    } else line = test;
  }
  text(line, x, y + row * lineHeight, color, 7);
}

function drawRoom(now) {
  const hour = state.sim.minute / 60;
  const night = hour < 6 || hour >= 19;
  ctx.fillStyle = night ? '#34344c' : palette.wall;
  ctx.fillRect(0, 0, ROOM_W, H);

  // 顶部墙面与木地板
  ctx.fillStyle = night ? '#555069' : '#eac694';
  ctx.fillRect(5, 18, 170, 35);
  ctx.fillStyle = palette.wallDark;
  ctx.fillRect(5, 50, 170, 4);
  for (let y = 54; y < 139; y += 8) {
    for (let x = 5; x < 175; x += 16) {
      ctx.fillStyle = ((x / 16 + y / 8) % 2) ? palette.floorA : palette.floorB;
      ctx.fillRect(x, y, 16, 8);
      ctx.fillStyle = 'rgba(80,45,48,.16)';
      ctx.fillRect(x, y + 7, 16, 1);
    }
  }
  ctx.fillStyle = palette.deep;
  ctx.fillRect(0, 0, ROOM_W, 18);
  ctx.fillRect(0, 139, ROOM_W, 21);
  ctx.fillRect(0, 18, 5, 121);
  ctx.fillRect(175, 18, 5, 121);

  // 窗户、光束与挂画
  pixelRect(25, 22, 25, 19, night ? '#2f4667' : '#7eb5c5');
  ctx.fillStyle = night ? '#f1d781' : '#dff0d4';
  if (night) {
    ctx.fillRect(31, 26, 3, 3); ctx.fillRect(42, 32, 2, 2);
  } else {
    ctx.fillRect(28, 25, 8, 5); ctx.fillRect(40, 31, 7, 4);
  }
  ctx.fillStyle = palette.ink;
  ctx.fillRect(37, 22, 2, 19); ctx.fillRect(25, 31, 25, 2);
  pixelRect(101, 22, 17, 12, '#d76d67');
  ctx.fillStyle = '#f0c66f'; ctx.fillRect(105, 25, 9, 5);

  // 地毯与桌子
  pixelRect(63, 65, 50, 27, '#b96c6c', '#8b4c5b');
  ctx.fillStyle = '#d79475';
  for (let x = 68; x < 110; x += 7) ctx.fillRect(x, 69, 3, 19);
  pixelRect(76, 70, 25, 13, '#9d6648');
  ctx.fillStyle = '#6d463b'; ctx.fillRect(79, 83, 3, 5); ctx.fillRect(95, 83, 3, 5);

  drawObjects(now);
  drawNeighbor(now);
  drawPlayer(now);

  if (night) {
    ctx.fillStyle = 'rgba(18,24,50,.24)';
    ctx.fillRect(5, 18, 170, 121);
    ctx.fillStyle = 'rgba(255,219,133,.11)';
    ctx.beginPath(); ctx.arc(89, 78, 38, 0, Math.PI * 2); ctx.fill();
  }
}

function drawObjects(now) {
  // 床
  pixelRect(15, 34, 39, 25, palette.blueDark);
  ctx.fillStyle = '#91abc7'; ctx.fillRect(18, 37, 33, 18);
  ctx.fillStyle = palette.cream; ctx.fillRect(18, 37, 12, 8);
  ctx.fillStyle = '#d5676d'; ctx.fillRect(18, 50, 33, 5);
  // 书架
  pixelRect(62, 27, 31, 16, '#7a4d40');
  ['#c85b5d', '#6584aa', '#ddae57', '#6c9a75', '#936887'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(65 + i * 5, 30, 3 + i % 2, 10); });
  // 植物
  ctx.fillStyle = '#406e54'; ctx.fillRect(111, 38, 3, 10);
  ctx.fillStyle = '#5f9b63'; ctx.fillRect(106, 32, 7, 7); ctx.fillRect(113, 30, 7, 9); ctx.fillRect(110, 27, 5, 8);
  pixelRect(108, 43, 12, 7, '#b2664f');
  // 冰箱
  pixelRect(129, 27, 18, 27, '#b7c9b8'); ctx.fillStyle = '#e1e6c9'; ctx.fillRect(132, 30, 12, 8); ctx.fillStyle = palette.ink; ctx.fillRect(132, 41, 2, 7);
  // 炉台
  pixelRect(149, 34, 24, 17, '#8e6259'); ctx.fillStyle = '#d5a970'; ctx.fillRect(152, 36, 18, 5); ctx.fillStyle = palette.ink; ctx.fillRect(154, 37, 4, 2); ctx.fillRect(164, 37, 4, 2);
  // 沙发
  pixelRect(15, 99, 43, 20, '#8b587b'); ctx.fillStyle = '#ad7599'; ctx.fillRect(19, 102, 35, 12); ctx.fillStyle = '#d49aa8'; ctx.fillRect(22, 104, 12, 8); ctx.fillRect(37, 104, 13, 8);
  // 电话柜
  pixelRect(73, 100, 22, 17, '#b47a4e'); ctx.fillStyle = '#e1bb69'; ctx.fillRect(78, 102, 12, 5); ctx.fillStyle = palette.ink; ctx.fillRect(80, 103, 8, 2); ctx.fillStyle = '#67453c'; ctx.fillRect(76, 112, 16, 2);
  // 浴室
  pixelRect(132, 94, 33, 31, '#72a2af'); ctx.fillStyle = '#a9d0c9'; ctx.fillRect(136, 97, 25, 24); ctx.fillStyle = '#eaf1d2'; ctx.fillRect(138, 98, 5, 5); ctx.fillStyle = '#5b7d89'; ctx.fillRect(159, 102, 2, 14);
  if (state.action?.object.id === 'shower') {
    ctx.fillStyle = '#d8f2e8';
    for (let i = 0; i < 5; i++) ctx.fillRect(139 + i * 5, 102 + ((now / 140 + i * 3) % 12), 1, 3);
  }
  // 门和门垫
  pixelRect(79, 124, 26, 15, '#6f483c'); ctx.fillStyle = palette.gold; ctx.fillRect(99, 131, 2, 2); ctx.fillStyle = '#a55f50'; ctx.fillRect(73, 136, 38, 3);
}

function drawPlayer(now) {
  const p = state.player;
  const walking = state.keys.size && !state.action && !state.paused;
  const bob = walking ? Math.floor(now / 120) % 2 : 0;
  const x = Math.round(p.x), y = Math.round(p.y - bob);
  ctx.fillStyle = 'rgba(54,42,58,.28)'; ctx.fillRect(x - 5, y + 8, 11, 3);
  // 头发、脸、衣服、腿：8-bit 小人
  ctx.fillStyle = palette.ink; ctx.fillRect(x - 4, y - 8, 9, 6); ctx.fillRect(x - 5, y - 5, 2, 5);
  ctx.fillStyle = '#e5ae7d'; ctx.fillRect(x - 3, y - 4, 7, 6);
  ctx.fillStyle = palette.ink;
  if (p.dir === 'left') ctx.fillRect(x - 3, y - 2, 1, 1); else if (p.dir === 'right') ctx.fillRect(x + 3, y - 2, 1, 1); else if (p.dir !== 'up') { ctx.fillRect(x - 2, y - 2, 1, 1); ctx.fillRect(x + 2, y - 2, 1, 1); }
  ctx.fillStyle = '#d85e68'; ctx.fillRect(x - 4, y + 2, 9, 7); ctx.fillStyle = '#f0c36c'; ctx.fillRect(x - 2, y + 2, 4, 3);
  ctx.fillStyle = '#4d547b'; ctx.fillRect(x - 4, y + 9, 3, 4); ctx.fillRect(x + 2, y + 9, 3, 4);
  ctx.fillStyle = palette.ink; ctx.fillRect(x - 4, y + 12, 3, 2); ctx.fillRect(x + 2, y + 12, 3, 2);

  if (state.near && !state.action) {
    const pulse = Math.floor(now / 300) % 2;
    pixelRect(x - 9, y - 20 - pulse, 18, 9, palette.white);
    text('A', x, y - 19 - pulse, palette.ink, 7, 'center');
  }
}

function drawNeighbor(now) {
  const hour = state.sim.minute / 60;
  if (hour < 17 || hour > 21) return;
  const x = 117 + Math.sin(now / 700) * 2;
  const y = 82;
  ctx.fillStyle = 'rgba(54,42,58,.25)'; ctx.fillRect(x - 4, y + 7, 10, 3);
  ctx.fillStyle = '#c3774f'; ctx.fillRect(x - 4, y - 8, 9, 6);
  ctx.fillStyle = '#dba677'; ctx.fillRect(x - 3, y - 3, 7, 5);
  ctx.fillStyle = '#5b8b78'; ctx.fillRect(x - 4, y + 2, 9, 8);
  ctx.fillStyle = palette.ink; ctx.fillRect(x - 3, y + 10, 3, 4); ctx.fillRect(x + 2, y + 10, 3, 4);
}

function drawHud(now) {
  ctx.fillStyle = '#343249'; ctx.fillRect(ROOM_W, 0, W - ROOM_W, H);
  ctx.fillStyle = '#4a455f'; ctx.fillRect(ROOM_W, 0, W - ROOM_W, 20);
  text(`第 ${state.sim.day} 天`, 185, 3, palette.cream, 7);
  text(formatTime(state.sim.minute), 185, 11, palette.white, 7);
  text(`¥ ${state.sim.money}`, 185, 23, palette.gold, 7);

  const needDefs = [
    ['hunger', '饱'], ['energy', '眠'], ['hygiene', '净'], ['fun', '乐'], ['social', '友'],
  ];
  needDefs.forEach(([key, label], i) => {
    const y = 37 + i * 15;
    const value = state.sim.needs[key];
    text(label, 185, y, value < 25 ? '#ee7474' : palette.cream, 7);
    ctx.fillStyle = '#252439'; ctx.fillRect(197, y + 1, 36, 6);
    ctx.fillStyle = value < 25 ? '#c95861' : value < 55 ? '#d4a852' : '#73ad83';
    ctx.fillRect(198, y + 2, Math.round(34 * value / 100), 4);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(198, y + 2, Math.round(34 * value / 100), 1);
  });

  text('今日小目标', 185, 115, palette.gold, 6);
  goals.forEach((goal, i) => {
    const done = state.sim.completed.includes(goal.id);
    text(done ? '✓' : '·', 185, 125 + i * 9, done ? '#77c58a' : '#9a94aa', 7);
    text(goal.label, 193, 125 + i * 9, done ? '#b9b5aa' : palette.cream, 6);
  });
  if (goals.every(g => state.sim.completed.includes(g.id))) {
    const flash = Math.floor(now / 500) % 2;
    if (flash) text('完美一天!', 208, 151, '#f2c75c', 6, 'center');
  }
}

function drawTopBar() {
  ctx.fillStyle = palette.ink; ctx.fillRect(0, 0, ROOM_W, 18);
  text('心情', 7, 4, '#b7b0c3', 6);
  text(state.sim.mood, 30, 3, palette.cream, 7);
  ctx.fillStyle = state.sound ? '#8fc593' : '#777286'; ctx.fillRect(165, 6, 3, 5); ctx.fillRect(169, 4, 2, 9);
}

function drawAction(now) {
  if (!state.action) return;
  const progress = Math.min(1, (now - state.action.start) / state.action.object.duration);
  ctx.fillStyle = 'rgba(32,28,48,.78)'; ctx.fillRect(12, 114, 156, 18);
  text(state.action.object.label, 18, 117, palette.white, 7);
  ctx.fillStyle = '#29263b'; ctx.fillRect(18, 126, 138, 3);
  ctx.fillStyle = palette.gold; ctx.fillRect(18, 126, Math.floor(138 * progress), 3);
  if (progress >= 1) finishAction();
}

function drawToast(now) {
  if (!state.toast || now > state.toastUntil) return;
  const y = 91;
  ctx.fillStyle = palette.ink; ctx.fillRect(8, y, 164, 34);
  ctx.fillStyle = palette.cream; ctx.fillRect(10, y + 2, 160, 30);
  ctx.fillStyle = '#9b635e'; ctx.fillRect(10, y + 2, 3, 30);
  wrapText(state.toast, 17, y + 7, 145, 10, palette.ink);
}

function drawTitle(now) {
  ctx.fillStyle = '#30334b'; ctx.fillRect(0, 0, W, H);
  // 天空、远山、房屋剪影
  ctx.fillStyle = '#6a7ca2'; ctx.fillRect(0, 18, W, 84);
  ctx.fillStyle = '#d4a468'; ctx.fillRect(0, 56, W, 46);
  ctx.fillStyle = '#825d6b';
  for (let x = 0; x < W; x += 24) ctx.fillRect(x, 70 - (x % 48) / 3, 28, 35 + (x % 48) / 3);
  ctx.fillStyle = '#46546f'; ctx.fillRect(0, 102, W, 58);
  ctx.fillStyle = '#e9c86e'; ctx.beginPath(); ctx.arc(198, 37, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = palette.ink; ctx.fillRect(28, 28, 184, 57);
  ctx.fillStyle = '#f0d58f'; ctx.fillRect(31, 31, 178, 51);
  text('口 袋 日 常', 120, 39, '#7c4057', 19, 'center');
  text('L I T T L E  D A Y S', 120, 65, '#4a4a67', 6, 'center');
  if (Math.floor(now / 550) % 2) text('按 START 开始', 120, 123, palette.white, 8, 'center');
  text('方向键移动  ·  A 键互动', 120, 143, '#aaa8bd', 6, 'center');
}

function drawPause() {
  ctx.fillStyle = 'rgba(33,29,48,.88)'; ctx.fillRect(27, 39, 186, 81);
  pixelRect(31, 43, 178, 73, palette.cream, '#8b5f69');
  text('暂停中', 120, 54, '#7d4054', 15, 'center');
  text('START  继续游戏', 120, 82, palette.ink, 7, 'center');
  text(`SELECT  ${state.sound ? '关闭' : '开启'}声音`, 120, 96, palette.ink, 7, 'center');
}

function render(now) {
  canvas.dataset.started = String(state.started);
  canvas.dataset.near = state.near?.id || '';
  canvas.dataset.action = state.action?.object.id || '';
  canvas.dataset.minute = String(Math.floor(state.sim.minute));
  ctx.clearRect(0, 0, W, H);
  if (!state.started) drawTitle(now);
  else {
    drawRoom(now);
    drawHud(now);
    drawTopBar();
    drawAction(now);
    drawToast(now);
    if (state.paused) drawPause();
  }
  requestAnimationFrame(render);
}

function update(now) {
  const dt = Math.min(32, now - state.lastTick);
  state.lastTick = now;
  if (state.started && !state.paused && !state.action) {
    movePlayer(dt);
    state.simClock += dt;
    if (state.simClock >= 4000) {
      state.sim = tickState(state.sim, 10);
      state.simClock = 0;
      save();
    }
  }
  state.near = findNearbyObject();
  requestAnimationFrame(update);
}

function movePlayer(dt) {
  let dx = 0, dy = 0;
  if (state.keys.has('ArrowLeft') || state.keys.has('KeyA')) { dx -= 1; state.player.dir = 'left'; }
  if (state.keys.has('ArrowRight') || state.keys.has('KeyD')) { dx += 1; state.player.dir = 'right'; }
  if (state.keys.has('ArrowUp') || state.keys.has('KeyW')) { dy -= 1; state.player.dir = 'up'; }
  if (state.keys.has('ArrowDown') || state.keys.has('KeyS')) { dy += 1; state.player.dir = 'down'; }
  if (!dx && !dy) return;
  const length = Math.hypot(dx, dy);
  const speed = .055 * dt;
  tryMove((dx / length) * speed, 0);
  tryMove(0, (dy / length) * speed);
}

function tryMove(dx, dy) {
  const nx = Math.max(10, Math.min(170, state.player.x + dx));
  const ny = Math.max(61, Math.min(130, state.player.y + dy));
  const box = { x: nx - 4, y: ny - 7, w: 9, h: 19 };
  const blocked = objects.some(o => o.solid && overlap(box, { x: o.x - 2, y: o.y - 2, w: o.w + 4, h: o.h + 4 }));
  if (!blocked) { state.player.x = nx; state.player.y = ny; }
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function findNearbyObject() {
  if (!state.started || state.action) return null;
  let nearest = null, best = 12;
  for (const object of objects) {
    const distance = distanceToRect(state.player.x, state.player.y, object);
    if (distance < best) { best = distance; nearest = object; }
  }
  return nearest;
}

function interact() {
  if (!state.started) { startGame(); return; }
  if (state.paused || state.action || !state.near) return;
  if (state.near.money < 0 && state.sim.money < Math.abs(state.near.money)) {
    showToast('钱包空空的……先去门口打工吧。');
    beep(130, .12);
    return;
  }
  state.action = { object: state.near, start: performance.now() };
  beep(520, .05);
}

function finishAction() {
  const object = state.action.object;
  state.sim = applyInteraction(state.sim, object);
  state.action = null;
  showToast(object.message);
  save();
  chime();
}

function showToast(message) {
  state.toast = message;
  state.toastUntil = performance.now() + 2600;
}

let audioContext;
function beep(frequency = 440, duration = .06, delay = 0) {
  if (!state.sound) return;
  audioContext ||= new AudioContext();
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = 'square'; osc.frequency.value = frequency;
  gain.gain.setValueAtTime(.035, audioContext.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + delay + duration);
  osc.connect(gain).connect(audioContext.destination);
  osc.start(audioContext.currentTime + delay); osc.stop(audioContext.currentTime + delay + duration);
}
function chime() { beep(523, .08); beep(659, .08, .08); beep(784, .12, .16); }

function startGame() {
  state.started = true;
  state.paused = false;
  state.lastTick = performance.now();
  chime();
  showToast('今天想做点什么呢？走近家具按 A 互动。');
}

function handlePress(code) {
  if (code === 'KeyP' || code === 'Enter') {
    if (!state.started) startGame();
    else { state.paused = !state.paused; beep(state.paused ? 280 : 440, .07); }
    return;
  }
  if (code === 'KeyM') { state.sound = !state.sound; if (state.sound) beep(600, .08); return; }
  const tapMoves = {
    ArrowLeft: [-1.25, 0, 'left'], KeyA: [-1.25, 0, 'left'],
    ArrowRight: [1.25, 0, 'right'], KeyD: [1.25, 0, 'right'],
    ArrowUp: [0, -1.25, 'up'], KeyW: [0, -1.25, 'up'],
    ArrowDown: [0, 1.25, 'down'], KeyS: [0, 1.25, 'down'],
  };
  if (tapMoves[code] && state.started && !state.paused && !state.action) {
    const [dx, dy, dir] = tapMoves[code];
    state.player.dir = dir;
    tryMove(dx, dy);
  }
  if (['KeyZ', 'KeyJ', 'Space'].includes(code)) interact();
  if (['KeyX', 'KeyK', 'Escape'].includes(code)) {
    if (state.action) { state.action = null; showToast('取消了当前行动。'); }
    else if (state.started) state.paused = !state.paused;
  }
}

window.addEventListener('keydown', event => {
  const code = event.code;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) event.preventDefault();
  if (!event.repeat) handlePress(code);
  state.keys.add(code);
});
window.addEventListener('keyup', event => state.keys.delete(event.code));
window.addEventListener('blur', () => state.keys.clear());

document.querySelectorAll('[data-key]').forEach(button => {
  const code = button.dataset.key;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    handlePress(code);
    state.keys.add(code);
    button.setPointerCapture?.(event.pointerId);
  });
  const release = () => state.keys.delete(code);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
});

window.__POCKET_LIFE__ = {
  getState: () => structuredClone(state.sim),
  start: startGame,
  teleport: (x, y) => { state.player.x = x; state.player.y = y; },
  interact,
  reset: () => { localStorage.removeItem(SAVE_KEY); state.sim = createInitialState(); },
};

requestAnimationFrame(update);
requestAnimationFrame(render);
