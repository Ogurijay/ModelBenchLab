// art.js — 全程序化像素美术:角色 / 家具 / 地块 / 图标,零图片资产。
// 精灵用"字符网格 + 调色板"定义;规则形体(床/桌/柜)用行构造器生成,避免手敲长行出错。
// 网格行宽不一致时容错:短行补透明、长行截断并 console.warn。

export const TILE = 16;

// ---------- 工具 ----------
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// 字符网格 → canvas。pal: {字符: 颜色},'.' 与 ' ' 为透明。
function sheet(rows, pal, name = 'sprite') {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  rows.forEach((row, y) => {
    if (row.length !== w && row.length > 0) console.warn(`[art] ${name} 第${y}行宽 ${row.length} ≠ ${w}`);
    for (let x = 0; x < Math.min(row.length, w); x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const col = pal[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  return c;
}

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function flipH(src) {
  const [c, g] = mkCanvas(src.width, src.height);
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

// 确定性 PRNG(地块纹理噪点用)
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rep = (ch, n) => ch.repeat(n);

// ---------- 角色 ----------
const BODY_DOWN = [
  '................',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '..HHHHHHHHHHHH..',
  '..HHhhhhhhhhHH..',
  '..hSSSSSSSSSSh..',
  '..hSESSSSSSESh..',
  '...SSSSssSSSS...',
  '....SSSSSSSS....',
  '...TTTTTTTTTT...',
  '..STTTTTTTTTTS..',
  '..stTTTTTTTTts..',
];
const BODY_UP = [
  '................',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '..HHHHHHHHHHHH..',
  '..HHHHHHHHHHHH..',
  '..hHHHHHHHHHHh..',
  '..hHHHHHHHHHHh..',
  '...hHHHHHHHHh...',
  '....SSSSSSSS....',
  '...TTTTTTTTTT...',
  '..STTTTTTTTTTS..',
  '..stTTTTTTTTts..',
];
const BODY_SIDE = [ // 朝右
  '................',
  '....HHHHHHHH....',
  '...HHHHHHHHHH...',
  '..HHHHHHHHHHHH..',
  '..HHHHHhhhSSS...',
  '..HHHHhSSSSSs...',
  '..HHHHhSSESSs...',
  '..hHHHhSSSSs....',
  '.....SSSSSS.....',
  '....TTTTTTTT....',
  '....TTTTTTTs....',
  '....tTTTTTTs....',
];
const LEGS_DOWN = [
  ['...PPPP..PPPP...', '...pPPp..pPPp...', '...BBBB..BBBB...', '................'],
  ['...PPPP..PPPP...', '...BBBB..pPPp...', '.........BBBB...', '................'],
  ['...PPPP..PPPP...', '...pPPp..BBBB...', '...BBBB.........', '................'],
];
const LEGS_SIDE = [
  ['....PPPPPPP.....', '....pPP.PPp.....', '....BBB.BBB.....', '................'],
  ['....PPPPPPP.....', '...pPP...PPp....', '...BBB....BBB...', '................'],
  ['....PPPPPPP.....', '.....pPPPp......', '.....BBBB.......', '................'],
];
const LEGS_DRESS = [
  ['...TTTTTTTTTT...', '..TTTTTTTTTTTT..', '....BB....BB....', '................'],
  ['...TTTTTTTTTT...', '..TTTTTTTTTTTT..', '...BB......BB...', '................'],
  ['...TTTTTTTTTT...', '..TTTTTTTTTTTT..', '.....BB..BB.....', '................'],
];
const LEGS_DRESS_SIDE = [
  ['....TTTTTTTT....', '...TTTTTTTTTT...', '.....BB..BB.....', '................'],
  ['....TTTTTTTT....', '...TTTTTTTTTT...', '....BB....BB....', '................'],
  ['....TTTTTTTT....', '...TTTTTTTTTT...', '......BBBB......', '................'],
];
const LEGS_SIT = ['...pPPPPPPPPp...', '...BB......BB...', '................', '................'];

export const CHARACTERS = [
  { name: '阿宝', hair: '#2c2c38', shirt: '#d8505e', pants: '#3a5cc0', skin: '#f0c8a0' },
  { name: '小豆', hair: '#7a4a26', shirt: '#48a852', pants: '#6a4a3a', skin: '#eec29a' },
  { name: '朵朵', hair: '#e07828', shirt: '#f0b02c', pants: '#b04a88', skin: '#f8d8b0' },
  { name: '小雪', hair: '#4a6ad8', shirt: '#9a5ad8', pants: '#30304e', skin: '#e8c090' },
];
export const NPC_DEF = { name: '小樱', hair: '#f088a8', shirt: '#f8e8f0', pants: '#f8e8f0', skin: '#f4cfae', dress: true };

function charPal(def) {
  return {
    H: def.hair, h: shade(def.hair, 0.68),
    S: def.skin, s: shade(def.skin, 0.78), E: '#20202c',
    T: def.shirt, t: shade(def.shirt, 0.72),
    P: def.pants, p: shade(def.pants, 0.7),
    B: '#3c342c',
  };
}

export function bakeChar(def) {
  const pal = charPal(def);
  const legsD = def.dress ? LEGS_DRESS : LEGS_DOWN;
  const legsS = def.dress ? LEGS_DRESS_SIDE : LEGS_SIDE;
  const mk = (body, legs, tag) => sheet([...body, ...legs], pal, `char-${def.name}-${tag}`);
  const down = legsD.map((l, i) => mk(BODY_DOWN, l, `d${i}`));
  const up = legsD.map((l, i) => mk(BODY_UP, l, `u${i}`));
  const right = legsS.map((l, i) => mk(BODY_SIDE, l, `r${i}`));
  const left = right.map(flipH);
  const sit = mk(BODY_DOWN, LEGS_SIT, 'sit');
  return { down, up, right, left, sit, def, pal };
}

// ---------- 心情宝石(菱形) ----------
function bakePlumbob(color) {
  const rows = [
    '...G...',
    '..GGG..',
    '.GGLGG.',
    'GGLLLGG',
    'GGGLGGG',
    '.GGGGG.',
    '..GGG..',
    '...G...',
  ];
  const rows2 = rows.map((r) => r.replace(/L/g, 'G'));
  const pal = { G: color, L: shade(color, 1.45) };
  return [sheet(rows, pal, 'plumbob'), sheet(rows2, pal, 'plumbob2')];
}

// ---------- 图标 8×8 ----------
const ICON_DEFS = {
  hunger: { pal: { A: '#e8a050', B: '#b06830', W: '#f8f0e0' }, rows: [
    '...AAA..', '..AAAAA.', '..AAAAA.', '...AAA..', '....B...', '....B...', '...WW...', '...WW...'] },
  energy: { pal: { A: '#f8d820', B: '#c09010' }, rows: [
    '...AAA..', '..AAA...', '.AAAA...', '.AAAAAA.', '...AAA..', '..AAA...', '..AA....', '.AA.....'] },
  hygiene: { pal: { A: '#58b8f0', B: '#2878c0', W: '#e8f8ff' }, rows: [
    '....A...', '...AAA..', '..AAAAA.', '.AAAAAAA', '.AAWAAAA', '.AAAAAAA', '..AAAAA.', '...AAA..'] },
  bladder: { pal: { A: '#f8f8f0', B: '#8890a8', C: '#58b8f0' }, rows: [
    '.AAAAAA.', '.ABBBBA.', '.ACCCCA.', '.AAAAAA.', '..AAAA..', '..AAAA..', '.AAAAAA.', '.AAAAAA.'] },
  fun: { pal: { A: '#f8c828', B: '#e08818' }, rows: [
    '....A...', '...AAA..', '.AAAAAAA', '..AAAAA.', '...AAA..', '..AAAAA.', '..A...A.', '........'] },
  social: { pal: { A: '#f06078', B: '#c03050' }, rows: [
    '........', '.AA..AA.', 'AAAAAAAA', 'AAAAAAAA', '.AAAAAA.', '..AAAA..', '...AA...', '........'] },
  zzz: { pal: { A: '#a8c8f8' }, rows: [
    'AAAA....', '..A.....', '.A......', 'AAAA....', '....AAAA', '......A.', '.....A..', '....AAAA'] },
  money: { pal: { A: '#f8d040', B: '#b08820', W: '#f8f0c0' }, rows: [
    '..AAAA..', '.AABBAA.', 'AABAABAA', 'AABAAAAA', 'AAABBAAA', 'AABAABAA', '.AABBAA.', '..AAAA..'] },
  mail: { pal: { A: '#f8f0e0', B: '#c05050', C: '#8890a8' }, rows: [
    '........', 'AAAAAAAA', 'AACAACAA', 'AAACCAAA', 'AAAAAAAA', 'AAAAAABA', 'AAAAAABA', 'AAAAAAAA'] },
  music: { pal: { A: '#78d8b8' }, rows: [
    '...AAAA.', '...A..A.', '...A..A.', '...A..A.', '.AAA.AAA', '.AAA.AAA', '........', '........'] },
  alert: { pal: { A: '#f04848', W: '#f8f8f0' }, rows: [
    '...AA...', '..AAAA..', '..AWWA..', '.AAWWAA.', '.AAWWAA.', 'AAAWWAAA', 'AAA..AAA', 'AAAAAAAA'] },
  paw: { pal: { A: '#e8963c' }, rows: [
    '.A..A...', 'A.A..A..', '.A..A...', '..AA....', '.AAAA...', 'AAAAAA..', 'AAAAAA..', '.AAAA...'] },
  plug: { pal: { A: '#f8d820', B: '#8890a8' }, rows: [
    '.B..B...', '.B..B...', 'BBBBBB..', 'BBBBBB..', '.BBBB...', '..BB....', '..AA....', '.AA.....'] },
  heartbig: { pal: { A: '#f06078' }, rows: [
    '.AA..AA.', 'AAAAAAAA', 'AAAAAAAA', 'AAAAAAAA', '.AAAAAA.', '..AAAA..', '...AA...', '........'] },
};

// ---------- 家具:行构造器 ----------
const WOOD = '#a06a3a', WOOD_D = shade(WOOD, 0.66), WOOD_L = shade(WOOD, 1.25);

function bakeBed(big) {
  const w = big ? 32 : 16;
  const inner = w - 2;
  const rows = [];
  const P = { h: WOOD_D, H: WOOD, W: '#f8f4ec', w: '#d8ccc0', B: big ? '#8a5ac8' : '#5878d0', b: big ? shade('#8a5ac8', 0.72) : shade('#5878d0', 0.72), f: WOOD, F: WOOD_L };
  rows.push('.' + rep('h', inner) + '.');
  rows.push('h' + rep('H', inner) + 'h');
  rows.push('h' + rep('H', inner) + 'h');
  rows.push('h' + rep('h', inner) + 'h');
  // 枕头
  const pil = big ? 'h' + 'WWWWWWWWWWWWW.WWWWWWWWWWWWW'.slice(0, inner) + 'h' : 'h' + rep('W', inner) + 'h';
  rows.push(pil); rows.push(pil);
  rows.push('h' + rep('w', inner) + 'h');
  // 被子
  for (let y = 0; y < 19; y++) rows.push('h' + rep(y % 6 === 4 ? 'b' : 'B', inner) + 'h');
  rows.push('h' + rep('b', inner) + 'h');
  rows.push('h' + rep('F', inner) + 'h');
  rows.push('h' + rep('f', inner) + 'h');
  rows.push('.' + rep('h', inner) + '.');
  return sheet(rows, P, big ? 'bed_big' : 'bed');
}

// 床上有人(盖被 + 露头)
function bakeBedOccupied(bedCanvas, charDef, big) {
  const [c, g] = mkCanvas(bedCanvas.width, bedCanvas.height);
  g.drawImage(bedCanvas, 0, 0);
  const cx = big ? 8 : 8; // 头枕左侧位
  g.fillStyle = charDef.hair;
  g.fillRect(cx - 3, 3, 7, 3);
  g.fillStyle = charDef.skin;
  g.fillRect(cx - 3, 6, 7, 3);
  g.fillStyle = '#20202c';
  g.fillRect(cx - 2, 7, 1, 1); g.fillRect(cx + 2, 7, 1, 1);
  // 被子隆起高光
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.fillRect(cx - 4, 10, 9, 14);
  return c;
}

function bakeFridge() {
  const rows = [];
  const P = { W: '#e8ecf0', w: '#c0c8d4', d: '#98a2b0', H: '#6a7482', S: '#f8fafc' };
  rows.push('.' + rep('d', 14) + '.');
  for (let y = 0; y < 9; y++) rows.push('d' + 'S' + rep('W', 11) + 'w' + 'd');
  rows.push('d' + rep('d', 14) + 'd');
  for (let y = 0; y < 14; y++) rows.push('d' + 'S' + rep('W', 11) + 'w' + 'd');
  rows.push('d' + rep('w', 14) + 'd');
  rows.push('.' + rep('d', 14) + '.');
  const c = sheet(rows, P, 'fridge');
  const g = c.getContext('2d');
  g.fillStyle = P.H; g.fillRect(12, 3, 2, 5); g.fillRect(12, 13, 2, 7); // 把手
  return c;
}

function bakeCounterBase(topCol, name) {
  const rows = [];
  const P = { T: topCol, t: shade(topCol, 0.8), C: '#c8894a', c: shade('#c8894a', 0.7), k: '#8a5a2a' };
  rows.push(rep('t', 16));
  for (let y = 0; y < 5; y++) rows.push(rep('T', 16));
  rows.push(rep('t', 16));
  for (let y = 0; y < 8; y++) rows.push('c' + rep('C', 14) + 'c');
  rows.push('c' + rep('k', 14) + 'c');
  rows.push(rep('c', 16));
  return sheet(rows, P, name);
}

function bakeSinkKitchen() {
  const c = bakeCounterBase('#d8dce0', 'sink');
  const g = c.getContext('2d');
  g.fillStyle = '#8890a0'; g.fillRect(3, 1, 10, 5);
  g.fillStyle = '#b8c0cc'; g.fillRect(4, 2, 8, 3);
  g.fillStyle = '#68707e'; g.fillRect(7, 3, 2, 2);
  g.fillStyle = '#c8ccd4'; g.fillRect(7, 0, 2, 2); // 龙头
  return c;
}

function bakeStove() {
  const c = bakeCounterBase('#4a4e58', 'stove');
  const g = c.getContext('2d');
  g.fillStyle = '#2e323a';
  [[3, 2], [10, 2], [3, 4], [10, 4]].forEach(([x, y]) => g.fillRect(x, y, 3, 1));
  g.fillStyle = '#20242c'; g.fillRect(2, 8, 12, 6); // 烤箱窗
  g.fillStyle = '#48505e'; g.fillRect(3, 9, 10, 4);
  return c;
}

function bakeTable() {
  const rows = [];
  const P = { T: WOOD_L, t: WOOD, l: WOOD_D };
  rows.push('.' + rep('t', 30) + '.');
  for (let y = 0; y < 8; y++) rows.push('t' + rep('T', 30) + 't');
  rows.push('.' + rep('t', 30) + '.');
  for (let y = 0; y < 5; y++) rows.push('..ll' + rep('.', 24) + 'll..');
  return sheet(rows, P, 'table');
}

function bakeChair() {
  const rows = [
    '..tttttttttttt..',
    '..tTTTTTTTTTTt..',
    '..tTTTTTTTTTTt..',
    '..tttttttttttt..',
    '..tTTTTTTTTTTt..',
    '..tTTTTTTTTTTt..',
    '..tttttttttttt..',
    '...ll......ll...',
    '...ll......ll...',
    '................',
  ];
  return sheet(rows, { T: WOOD_L, t: WOOD, l: WOOD_D }, 'chair');
}

function bakeToilet() {
  const rows = [
    '....WWWWWWWW....',
    '....WwwwwwwW....',
    '....WwwwwwwW....',
    '....WWWWWWWW....',
    '...WWWWWWWWWW...',
    '..WWSSSSSSSSWW..',
    '..WSSssssssSSW..',
    '..WSSssssssSSW..',
    '..WWSSSSSSSSWW..',
    '...WWWWWWWWWW...',
    '....WWWWWWWW....',
    '.....WwwwwW.....',
    '.....WWWWWW.....',
    '................',
  ];
  return sheet(rows, { W: '#f0f2f4', w: '#c4ccd4', S: '#e0e6ea', s: '#a8b2bc' }, 'toilet');
}

function bakeShower(occupied, charDef) {
  const rows = [];
  const P = { F: '#b8c4cc', f: '#8894a0', R: '#68707e', C: occupied ? '#78c8e8' : '#a8dcf0', c: occupied ? '#58a8d0' : '#88c4e0', H: '#c8ccd4' };
  rows.push(rep('R', 16)); // 杆
  const curtainCols = occupied ? 14 : 6;
  for (let y = 0; y < 24; y++) {
    let row = 'R';
    for (let x = 0; x < 14; x++) {
      if (x < curtainCols) row += (x % 3 === 2 ? 'c' : 'C');
      else row += (y > 20 ? 'f' : (x === 13 ? 'f' : 'F'));
    }
    row += 'R';
    rows.push(row);
  }
  for (let y = 0; y < 6; y++) rows.push('f' + rep(y === 0 ? 'F' : 'f', 14) + 'f');
  rows.push(rep('f', 16));
  const c = sheet(rows, P, 'shower');
  const g = c.getContext('2d');
  g.fillStyle = P.H; g.fillRect(2, 1, 2, 2); g.fillRect(1, 3, 4, 1); // 花洒
  if (occupied && charDef) {
    g.fillStyle = charDef.hair; g.fillRect(5, 3, 6, 3);
    g.fillStyle = charDef.skin; g.fillRect(5, 6, 6, 2);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    [[3, 8], [11, 6], [7, 10], [12, 12], [4, 14]].forEach(([x, y]) => g.fillRect(x, y, 2, 1)); // 泡泡
  }
  return c;
}

function bakeBasin() {
  const rows = [
    '..MMMMMMMMMMMM..',
    '..MffffffffffM..',
    '..MffffffffffM..',
    '..MffffffffffM..',
    '..MMMMMMMMMMMM..',
    '................',
    '...WWWWWWWWWW...',
    '..WWssssssssWW..',
    '..WWssssssssWW..',
    '...WWWWWWWWWW...',
    '....WWWWWWWW....',
    '....WwwwwwwW....',
    '....WWWWWWWW....',
    '................',
  ];
  return sheet(rows, { M: '#8a94a2', f: '#bde0ea', W: '#f0f2f4', w: '#c4ccd4', s: '#dce4e8' }, 'basin');
}

function bakeSofa(leather) {
  const A = leather ? '#8a4a2e' : '#5090d8';
  const rows = [];
  const P = { A, a: shade(A, 0.74), L: shade(A, 1.22), l: WOOD_D };
  rows.push('.' + rep('a', 30) + '.');
  for (let y = 0; y < 5; y++) rows.push('a' + rep('A', 30) + 'a');
  rows.push('a' + rep('a', 30) + 'a');
  for (let y = 0; y < 7; y++) {
    let row = 'aAA';
    for (let x = 0; x < 26; x++) row += (x === 12 || x === 13 ? 'a' : 'L');
    row += 'AAa';
    rows.push(row);
  }
  rows.push('a' + rep('a', 30) + 'a');
  rows.push('.ll' + rep('.', 26) + 'll.');
  return sheet(rows, P, leather ? 'sofa_leather' : 'sofa');
}

function bakeTV(big, frame) {
  const w = big ? 32 : 16;
  const sw = big ? 26 : 12, sh = big ? 14 : 8;
  const [c, g] = mkCanvas(w, 24);
  // 电视柜
  g.fillStyle = WOOD; g.fillRect(0, 18, w, 5);
  g.fillStyle = WOOD_D; g.fillRect(0, 22, w, 2);
  g.fillStyle = WOOD_L; g.fillRect(0, 18, w, 1);
  // 机身
  const bx = (w - sw - 4) / 2;
  g.fillStyle = '#22262e'; g.fillRect(bx, 2, sw + 4, sh + 4);
  g.fillStyle = '#454c58'; g.fillRect(bx, 2, sw + 4, 1);
  // 屏幕
  const sx = bx + 2, sy = 4;
  if (frame === 0) {
    g.fillStyle = '#101822'; g.fillRect(sx, sy, sw, sh);
    g.fillStyle = '#243244'; g.fillRect(sx + 1, sy + 1, sw - 2, 2);
  } else {
    const rnd = mulberry32(frame * 77 + (big ? 5 : 1));
    g.fillStyle = frame === 1 ? '#6ab0e8' : '#e8a86a'; g.fillRect(sx, sy, sw, sh);
    g.fillStyle = frame === 1 ? '#2e6a48' : '#4a7a3a';
    g.fillRect(sx, sy + sh - 4, sw, 4);
    g.fillStyle = '#f8e8b0';
    for (let i = 0; i < (big ? 8 : 4); i++) g.fillRect(sx + 1 + Math.floor(rnd() * (sw - 2)), sy + 1 + Math.floor(rnd() * (sh - 5)), 2, 2);
  }
  return c;
}

function bakeConsole() {
  const [c, g] = mkCanvas(10, 6);
  g.fillStyle = '#5a5f6a'; g.fillRect(0, 2, 10, 4);
  g.fillStyle = '#8a90a0'; g.fillRect(0, 2, 10, 1);
  g.fillStyle = '#d84c5a'; g.fillRect(2, 0, 2, 3);
  g.fillStyle = '#4aa8d8'; g.fillRect(6, 0, 2, 3);
  return c;
}

function bakeBookshelf() {
  const [c, g] = mkCanvas(16, 32);
  g.fillStyle = WOOD_D; g.fillRect(0, 0, 16, 32);
  g.fillStyle = WOOD; g.fillRect(1, 1, 14, 30);
  const rnd = mulberry32(20260717);
  const cols = ['#d85858', '#5890d8', '#58b878', '#e8b048', '#9a68d0', '#e88858'];
  for (let s = 0; s < 3; s++) {
    const sy = 3 + s * 9;
    g.fillStyle = '#6a4520'; g.fillRect(1, sy + 7, 14, 2);
    let x = 2;
    while (x < 13) {
      const bw = rnd() < 0.4 ? 1 : 2;
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      const bh = 5 + Math.floor(rnd() * 2);
      g.fillRect(x, sy + 7 - bh, bw, bh);
      x += bw + (rnd() < 0.25 ? 1 : 0);
    }
  }
  return c;
}

function bakePhone() {
  const rows = [
    '................',
    '....rrrrrrrr....',
    '...rRRRRRRRRr...',
    '...rRRRRRRRRr...',
    '....rrRRRRr.....',
    '......RRR.......',
    '.ttttttttttttt..',
    '.tTTTTTTTTTTTt..',
    '.tTTTTTTTTTTTt..',
    '.ttttttttttttt..',
    '..ll.......ll...',
    '..ll.......ll...',
    '................',
    '................',
  ];
  return sheet(rows, { r: '#a02838', R: '#d84c5a', t: WOOD, T: WOOD_L, l: WOOD_D }, 'phone');
}

function bakeStereo() {
  const rows = [
    '................',
    '.BBBBBBBBBBBBB..',
    '.BssBBBBBBBssB..',
    '.BsWsBBGBBsWsB..',
    '.BssBBBBBBBssB..',
    '.BsssBBBBBsssB..',
    '.BsWsBBBBBsWsB..',
    '.BssBBBBBBBssB..',
    '.BBBBBBBBBBBBB..',
    '................',
  ];
  return sheet(rows, { B: '#3a3e48', s: '#22252c', W: '#8890a0', G: '#48d878' }, 'stereo');
}

function bakePlant() {
  const rows = [
    '................',
    '....LL..LL......',
    '...LLLLLLLL.....',
    '..LLlLLLLlLL....',
    '..LLLLllLLLL....',
    '...lLLLLLLl.....',
    '.....LLLL.......',
    '......ll........',
    '....pppppp......',
    '....pPPPPp......',
    '.....pPPp.......',
    '.....pppp.......',
    '................',
    '................',
  ];
  return sheet(rows, { L: '#48a852', l: '#2e7a38', p: '#b0582a', P: '#d0783a' }, 'plant');
}

function bakeLamp(on) {
  const [c, g] = mkCanvas(16, 32);
  g.fillStyle = on ? '#f8e8a0' : '#d8b868';
  g.fillRect(4, 1, 8, 2);
  g.fillRect(3, 3, 10, 4);
  g.fillRect(4, 7, 8, 1);
  if (on) { g.fillStyle = '#fff8d0'; g.fillRect(5, 3, 6, 3); }
  g.fillStyle = '#6a5030';
  g.fillRect(7, 8, 2, 18);
  g.fillStyle = '#4a3820';
  g.fillRect(4, 26, 8, 2);
  g.fillRect(3, 28, 10, 1);
  return c;
}

function bakeMailbox(flag) {
  const rows = [
    '................',
    '..mmmmmmmmmm....',
    '.mMMMMMMMMMMm...',
    '.mMMMMMMMMMMm...',
    '.mMMMMMMMMMMm...',
    '.mmmmmmmmmmmm...',
    '......ww........',
    '......ww........',
    '......ww........',
    '......ww........',
    '.....wwww.......',
    '................',
  ];
  const c = sheet(rows, { m: '#8a3038', M: '#d0505e', w: '#6a5030' }, 'mailbox');
  const g = c.getContext('2d');
  if (flag) {
    g.fillStyle = '#f8d020';
    g.fillRect(12, 0, 1, 4); g.fillRect(12, 0, 3, 2);
  }
  return c;
}

function bakeTree() {
  const [c, g] = mkCanvas(32, 32);
  const rnd = mulberry32(424242);
  g.fillStyle = '#2e7a38';
  g.beginPath(); // 用方块堆树冠
  const blobs = [[16, 10, 11], [9, 14, 8], [23, 14, 8], [16, 17, 10]];
  for (const [bx, by, r] of blobs) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) g.fillRect(bx + x, by + y, 1, 1);
    }
  }
  g.fillStyle = '#48a852';
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * 8;
    g.fillRect(Math.round(16 + Math.cos(a) * d * 1.4), Math.round(12 + Math.sin(a) * d * 0.8), 2, 1);
  }
  g.fillStyle = '#6a4520'; g.fillRect(14, 22, 4, 8);
  g.fillStyle = '#4a3018'; g.fillRect(14, 29, 4, 1);
  return c;
}

function bakePuddle() {
  const [c, g] = mkCanvas(16, 8);
  g.fillStyle = 'rgba(120,180,230,0.65)';
  g.fillRect(3, 2, 10, 4);
  g.fillRect(1, 3, 14, 2);
  g.fillRect(5, 1, 6, 6);
  g.fillStyle = 'rgba(220,240,255,0.7)';
  g.fillRect(5, 3, 3, 1);
  return c;
}

function bakeDoor(open) {
  const [c, g] = mkCanvas(16, 16);
  if (!open) {
    g.fillStyle = '#7a4a26'; g.fillRect(1, 0, 14, 16);
    g.fillStyle = '#9a6236'; g.fillRect(2, 1, 12, 14);
    g.fillStyle = '#7a4a26'; g.fillRect(3, 2, 10, 5); g.fillRect(3, 9, 10, 5);
    g.fillStyle = '#f8d020'; g.fillRect(12, 8, 2, 2);
  } else {
    g.fillStyle = '#2c2018'; g.fillRect(1, 0, 14, 16); // 门洞
    g.fillStyle = '#9a6236'; g.fillRect(1, 0, 3, 16); // 开着的门板侧影
  }
  return c;
}

function bakeRug() {
  const [c, g] = mkCanvas(48, 32);
  g.fillStyle = '#c05a50'; g.fillRect(0, 0, 48, 32);
  g.fillStyle = '#e8b048'; g.fillRect(2, 2, 44, 28);
  g.fillStyle = '#d07a58'; g.fillRect(5, 5, 38, 22);
  g.fillStyle = '#b8503e'; g.fillRect(16, 11, 16, 10);
  return c;
}

// ---------- 猫 ----------
function bakeCat() {
  const P = { C: '#e8963c', c: '#b06a24', E: '#2e7a38', W: '#f8e8d0' };
  const f1 = [
    '................', '................', '................', '................',
    '..........C..C..',
    '..........CCCC..',
    '.CC.......CECE..',
    '.CCC......CCCC..',
    '..CC....CCCCCC..',
    '...CCCCCCCCCC...',
    '...CCCCCCCCWC...',
    '...CCCCCCCCC....',
    '....C..C..C.....',
    '....C..C..C.....',
    '................', '................',
  ];
  const f2 = [
    '................', '................', '................', '................',
    '..........C..C..',
    '.CC.......CCCC..',
    '..CC......CECE..',
    '..CC......CCCC..',
    '...CC...CCCCCC..',
    '...CCCCCCCCCC...',
    '...CCCCCCCCWC...',
    '...CCCCCCCCC....',
    '...C...C...C....',
    '...C...C...C....',
    '................', '................',
  ];
  const sit = [
    '................', '................', '................', '................',
    '.........C..C...',
    '.........CCCC...',
    '.........CECE...',
    '.CC......CCCC...',
    '.CC.....CCCCC...',
    '..CC...CCCCCC...',
    '..CCCCCCCCCCC...',
    '...CCCCCCCCCC...',
    '....CCCCCCCC....',
    '.....CC..CC.....',
    '................', '................',
  ];
  const r = [sheet(f1, P, 'cat1'), sheet(f2, P, 'cat2'), sheet(sit, P, 'catsit')];
  return { right: r, left: r.map(flipH) };
}

// ---------- 地块 ----------
function bakeTiles() {
  const T = {};
  const mk = (name, fn) => {
    const [c, g] = mkCanvas(TILE, TILE);
    fn(g, mulberry32(name.length * 1237 + 99));
    T[name] = c;
  };

  mk('grass', (g, rnd) => {
    g.fillStyle = '#58a848'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#68b858';
    for (let i = 0; i < 12; i++) g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), 2, 1);
    g.fillStyle = '#4a9038';
    for (let i = 0; i < 8; i++) g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), 1, 2);
  });
  mk('grass2', (g, rnd) => {
    g.fillStyle = '#529f42'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#62b052';
    for (let i = 0; i < 10; i++) g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), 2, 1);
    g.fillStyle = '#468834';
    for (let i = 0; i < 9; i++) g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), 1, 2);
  });
  mk('flower', (g, rnd) => {
    g.drawImage(T.grass, 0, 0);
    const cols = ['#f8e858', '#f08888', '#f8f8f8'];
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(rnd() * 11), y = 2 + Math.floor(rnd() * 11);
      g.fillStyle = cols[i % 3];
      g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3);
      g.fillStyle = '#e8a020'; g.fillRect(x, y, 1, 1);
    }
  });
  mk('path', (g, rnd) => {
    g.fillStyle = '#d8b880'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#c8a468';
    for (let i = 0; i < 9; i++) g.fillRect(Math.floor(rnd() * 14), Math.floor(rnd() * 14), 2, 2);
    g.fillStyle = '#e8d0a0';
    for (let i = 0; i < 5; i++) g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), 1, 1);
  });
  mk('sidewalk', (g) => {
    g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 8, 16, 1);
    g.fillStyle = '#c8c8c8'; g.fillRect(0, 1, 16, 1); g.fillRect(0, 9, 16, 1);
  });
  mk('road', (g, rnd) => {
    g.fillStyle = '#4a4a52'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#54545c';
    for (let i = 0; i < 6; i++) g.fillRect(Math.floor(rnd() * 15), Math.floor(rnd() * 15), 2, 1);
  });
  mk('roadDash', (g, rnd) => {
    g.drawImage(T.road, 0, 0);
    g.fillStyle = '#e8d858'; g.fillRect(2, 7, 8, 2);
  });
  mk('wood', (g, rnd) => {
    g.fillStyle = '#c8955c'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#b8854c';
    g.fillRect(0, 3, 16, 1); g.fillRect(0, 7, 16, 1); g.fillRect(0, 11, 16, 1); g.fillRect(0, 15, 16, 1);
    g.fillStyle = '#d8a86c';
    g.fillRect(0, 0, 16, 1); g.fillRect(0, 4, 16, 1); g.fillRect(0, 8, 16, 1); g.fillRect(0, 12, 16, 1);
    g.fillStyle = '#a87840';
    g.fillRect(5, 1, 1, 2); g.fillRect(12, 5, 1, 2); g.fillRect(3, 9, 1, 2); g.fillRect(10, 13, 1, 2);
  });
  mk('kitchen', (g) => {
    g.fillStyle = '#e8e0d0'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#d0c8b4'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
    g.fillStyle = '#c0b8a4'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 8, 16, 1);
    g.fillRect(0, 0, 1, 16); g.fillRect(8, 0, 1, 16);
  });
  mk('bath', (g) => {
    g.fillStyle = '#bde0ea'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#a4ccd8'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8);
    g.fillStyle = '#8cb4c2'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 8, 16, 1);
    g.fillRect(0, 0, 1, 16); g.fillRect(8, 0, 1, 16);
  });
  // 外墙面(奶黄墙 + 顶檐 + 踢脚)
  mk('wallEx', (g) => {
    g.fillStyle = '#e8c888'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#c8a868'; g.fillRect(0, 13, 16, 3);
    g.fillStyle = '#a05038'; g.fillRect(0, 0, 16, 3);
    g.fillStyle = '#b86048'; g.fillRect(0, 0, 16, 1);
    g.fillStyle = '#d8b878'; g.fillRect(0, 3, 16, 1);
  });
  // 内墙面(浅紫灰)
  mk('wallIn', (g) => {
    g.fillStyle = '#c8bce0'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#a898c8'; g.fillRect(0, 13, 16, 3);
    g.fillStyle = '#7868a8'; g.fillRect(0, 0, 16, 3);
    g.fillStyle = '#8878b8'; g.fillRect(0, 3, 16, 1);
  });
  // 窗(嵌在外墙)
  mk('window', (g) => {
    g.drawImage(T.wallEx, 0, 0);
    g.fillStyle = '#6a4a2a'; g.fillRect(2, 4, 12, 9);
    g.fillStyle = '#a8d8e8'; g.fillRect(3, 5, 10, 7);
    g.fillStyle = '#88b8d0'; g.fillRect(3, 9, 10, 1);
    g.fillStyle = '#6a4a2a'; g.fillRect(7, 5, 1, 7);
  });
  mk('windowNight', (g) => {
    g.drawImage(T.wallEx, 0, 0);
    g.fillStyle = '#6a4a2a'; g.fillRect(2, 4, 12, 9);
    g.fillStyle = '#f8d878'; g.fillRect(3, 5, 10, 7);
    g.fillStyle = '#e8b858'; g.fillRect(3, 9, 10, 1);
    g.fillStyle = '#6a4a2a'; g.fillRect(7, 5, 1, 7);
  });
  mk('fence', (g) => {
    g.drawImage(T.grass, 0, 0);
    g.fillStyle = '#f0ead8';
    g.fillRect(2, 3, 3, 11); g.fillRect(11, 3, 3, 11);
    g.fillStyle = '#d8d0b8'; g.fillRect(2, 12, 3, 2); g.fillRect(11, 12, 3, 2);
    g.fillStyle = '#f0ead8'; g.fillRect(0, 5, 16, 2); g.fillRect(0, 9, 16, 2);
  });
  return T;
}

// ---------- 汇总 ----------
export function buildArt() {
  const chars = CHARACTERS.map(bakeChar);
  const npc = bakeChar(NPC_DEF);
  const beds = { basic: bakeBed(false), big: bakeBed(true) };
  const icons = {};
  for (const [k, v] of Object.entries(ICON_DEFS)) icons[k] = sheet(v.rows, v.pal, `icon-${k}`);

  const bedOccCache = new Map();
  const showerOccCache = new Map();

  return {
    TILE,
    tiles: bakeTiles(),
    chars,
    npc,
    cat: bakeCat(),
    icons,
    plumbob: {
      green: bakePlumbob('#38c858'),
      yellow: bakePlumbob('#e8c030'),
      red: bakePlumbob('#e04838'),
    },
    furn: {
      bed_basic: beds.basic,
      bed_big: beds.big,
      fridge: bakeFridge(),
      counter: bakeCounterBase('#d8b088', 'counter'),
      sink: bakeSinkKitchen(),
      stove: bakeStove(),
      table: bakeTable(),
      chair: bakeChair(),
      toilet: bakeToilet(),
      shower: bakeShower(false, null),
      basin: bakeBasin(),
      sofa_basic: bakeSofa(false),
      sofa_leather: bakeSofa(true),
      tv_basic: [bakeTV(false, 0), bakeTV(false, 1), bakeTV(false, 2)],
      tv_big: [bakeTV(true, 0), bakeTV(true, 1), bakeTV(true, 2)],
      consoleAddon: bakeConsole(),
      bookshelf: bakeBookshelf(),
      phone: bakePhone(),
      stereo: bakeStereo(),
      plant: bakePlant(),
      lamp_on: bakeLamp(true),
      lamp_off: bakeLamp(false),
      mailbox: bakeMailbox(false),
      mailbox_flag: bakeMailbox(true),
      tree: bakeTree(),
      puddle: bakePuddle(),
      door: bakeDoor(false),
      door_open: bakeDoor(true),
      rug: bakeRug(),
    },
    bedOccupied(charIdx, big) {
      const key = `${charIdx}-${big}`;
      if (!bedOccCache.has(key)) {
        bedOccCache.set(key, bakeBedOccupied(big ? beds.big : beds.basic, CHARACTERS[charIdx], big));
      }
      return bedOccCache.get(key);
    },
    showerOccupied(charIdx) {
      if (!showerOccCache.has(charIdx)) showerOccCache.set(charIdx, bakeShower(true, CHARACTERS[charIdx]));
      return showerOccCache.get(charIdx);
    },
  };
}
