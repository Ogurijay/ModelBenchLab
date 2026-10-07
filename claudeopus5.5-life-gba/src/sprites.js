// 全部程序化像素美术:地砖、家具、建筑、树木、模拟市民角色(四向行走/坐/躺/动作)、
// 对话头像、图标。全部绘制一次后缓存为离屏 canvas。
import { mk, P, outline, hash2, shade, rng, ptext } from './gfx.js';

const cache = new Map();
function memo(key, fn) {
  let v = cache.get(key);
  if (!v) { v = fn(); cache.set(key, v); }
  return v;
}

// 便捷绘制器:R(x,y,w,h,c)
function painter(g) {
  return (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
}
// 带描边的精灵:绘制区域 w×h,外扩 1px 描边;返回 {c, w, h}(绘制时偏移 -1)
function spr(w, h, fn, line = P.ink) {
  const [c, g] = mk(w + 2, h + 2);
  g.translate(1, 1);
  fn(painter(g), g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  outline(c, line);
  return { c, w, h };
}

// ---------------------------------------------------------------- 图标(字符画)
const ICON_PAL = {
  k: P.ink, w: P.white, r: P.red, R: P.red2, o: P.orange, y: P.yellow, Y: P.gold, g: P.green, G: P.green2,
  l: P.green3, b: P.blue, B: P.blue2, s: P.sky, n: P.brown, N: P.brown2, t: P.tan, p: P.pink, u: P.purple,
  e: P.grey, E: P.grey2, c: P.cream, a: P.grey3,
};
const ICONS = {
  hunger: ['....ttt..', '...ttttt.', '..tonnoot', '..toooooo', '..noooon.', '.wnnnnn..', '.ww......', 'ww.......', '.........'],
  comfort: ['.........', '.uu...uu.', '.uuuuuuu.', '.uuuuuuu.', 'uuuuuuuuu', 'uaaaaaaau', 'uuuuuuuuu', '.n.....n.', '.........'],
  hygiene: ['....s....', '....s....', '...sss...', '..ssbss..', '..swsbs..', '.sswbbbs.', '.ssbbbbs.', '..sbbbs..', '...sss...'],
  bladder: ['.aaaaa...', '.awwwa...', '.aaaaa...', '..www....', '.wwwwww..', '.wsssssw.', '.wwwwww..', '..wwww...', '..eeee...'],
  energy: ['..yyyyy..', '.....y...', '....y....', '...y.....', '..yyyyy..', '......yy.', '.......y.', '......y..', '......yy.'],
  fun: ['....y....', '....y....', '...yyy...', 'yyyyYyyyy', '.yyYYYyy.', '..yyyyy..', '..yy.yy..', '.yy...yy.', '.y.....y.'],
  social: ['.rr..rr..', 'rrrrrrrr.', 'rrwrrrrr.', 'rrrrrrrr.', '.rrrrrr..', '..rrrr...', '...rr....', '.........', '.........'],
  room: ['....r....', '...rrr...', '..rrrrr..', '.rrrrrrr.', 'rrrrrrrrr', '.ccccccc.', '.cssccnc.', '.cssccnc.', '.cccccnc.'],
  money: ['...yyy...', '..yYyYy..', '.yYyyyYy.', '.yYYyyyy.', '.yyyYYyy.', '.yyyyyYy.', '.yYyYYYy.', '..yyYyy..', '...yyy...'],
  cooking: ['.........', '..eeeeee.', '.eaaaaaae', '.eaaoyaae', '.eaaaaaae', '..eeeeee.', '...n.....', '..nn.....', '.nn......'],
  mechanical: ['.aa......', 'aa.a.....', 'a..aa....', '.aaaae...', '....aee..', '.....aee.', '......aee', '.......ae', '.........'],
  charisma: ['..yyyyy..', '.yyyyyyy.', 'yykyyykyy', 'yyyyyyyyy', 'ykyyyyyky', 'yykkkkkyy', '.yyyyyyy.', '..yyyyy..', '.........'],
  body: ['.........', 'k.......k', 'kk.....kk', 'kkeeeeekk', 'kk.....kk', 'k.......k', '.........', '.........', '.........'],
  logic: ['...kkk...', '..kwwwk..', '..kwwk...', '...kwk...', '..kwwwk..', '..kwwwk..', '.kwwwwwk.', '.kkkkkkk.', '.........'],
  creativity: ['..tttt...', '.tttttt..', 'trtttbtt.', 'tttttttt.', 'tyttgtt..', 'ttttt....', '.tttttt..', '..tttt...', '.........'],
  chat: ['.wwwwwww.', 'wwwwwwwww', 'wkwkwkwww', 'wwwwwwwww', '.wwwwwww.', '..ww.....', '.w.......', '.........', '.........'],
  joke: ['..yyyyy..', '.yyyyyyy.', 'yykyyykyy', 'yyyyyyyyy', 'ykkkkkkky', 'yykrrrkyy', '.yykkkyy.', '..yyyyy..', '.........'],
  compliment: ['....y....', '...yyy...', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..', '.yyy.yyy.', '.yy...yy.', '.........', '.........'],
  hug: ['.pp..pp..', 'pppppppp.', 'ppppppppp', '.ppppppp.', '..rr.rr..', '.rrrrrrr.', '.rrrrrrr.', '..rrrrr..', '...rrr...'],
  flirt: ['.........', '.rr...rr.', 'rrrr.rrrr', 'rwrrrrrrr', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....'],
  kiss: ['.........', '..rr.rr..', '.rrrrrrr.', 'rrRRRRRrr', 'RRRRRRRRR', 'rrRRRRRrr', '.rrrrrrr.', '..rrrrr..', '.........'],
  gift: ['..r...r..', '...r.r...', 'bbbbrbbbb', 'bbbbrbbbb', 'rrrrrrrrr', '.bbbrbbb.', '.bbbrbbb.', '.bbbrbbb.', '.bbbrbbb.'],
  prank: ['.....yy..', '....yy...', '...yy....', '..yyyyy..', '....yy...', '...yy....', '..yy.....', '.y.......', '.........'],
  ask: ['..wwww...', '.ww..ww..', '.....ww..', '....ww...', '...ww....', '...ww....', '.........', '...ww....', '.........'],
  angry: ['r.......r', '.r.....r.', '..r...r..', '.........', '..rrrrr..', '.r.....r.', 'r.......r', '.........', '.........'],
  heart: ['.........', '.rr...rr.', 'rrrr.rrrr', 'rwrrrrrrr', 'rrrrrrrrr', '.rrrrrrr.', '..rrrrr..', '...rrr...', '....r....'],
  zzz: ['wwww.....', '..w......', '.w.......', 'wwww.....', '....www..', '.....w...', '....www..', '.......ww', '.......ww'],
  note: ['...kkkk..', '...kkkk..', '...k..k..', '...k..k..', '...k..k..', '.kkk.kk..', 'kkkk.kk..', '.kk......', '.........'],
  phone: ['.rrrrrr..', 'rrrrrrrr.', 'rr....rr.', '..rrrr...', '.rrwwrr..', '.rwwwwr..', '.rrrrrr..', '.........', '.........'],
  mail: ['.........', 'wwwwwwwww', 'wkwwwwwkw', 'wwkwwwkww', 'wwwkwkwww', 'wwwwkwwww', 'wwwwwwwww', '.........', '.........'],
  check: ['.........', '........g', '.......gg', 'g.....gg.', 'gg...gg..', '.gg.gg...', '..ggg....', '...g.....', '.........'],
  lock: ['..eeee...', '.e....e..', '.e....e..', 'yyyyyyyy.', 'yyyYYyyy.', 'yyyYYyyy.', 'yyyyyyyy.', '.........', '.........'],
  fish: ['.........', '.....ss..', 'b..ssssss', 'bbsssskss', 'bbsssssss', 'b..ssssss', '.....ss..', '.........', '.........'],
  car: ['.........', '..rrrr...', '.rsssrr..', 'rrrrrrrrr', 'rrrrrrrrr', '.kk...kk.', '.kk...kk.', '.........', '.........'],
  cup: ['..w.w....', '...w.....', '.nnnnnn..', '.nwwwwnnn', '.nwwwwn.n', '.nwwwwnnn', '.nnnnnn..', 'nnnnnnnn.', '.........'],
  star: ['....y....', '...yyy...', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..', '.yyy.yyy.', '.yy...yy.', '.........', '.........'],
  cake: ['....r....', '...www...', '..wwwww..', '.ppppppp.', '.wwwwwww.', '.ppppppp.', '.ttttttt.', '.........', '.........'],
  sandwich: ['.........', '..ttttt..', '.ttttttt.', 'ggggggggg', 'rrrrrrrrr', 'yyyyyyyy.', '.ttttttt.', '..ttttt..', '.........'],
  juice: ['.....w...', '....w....', '.aaaaaa..', '.aooooa..', '.aooooa..', '.ayoooa..', '.aooooa..', '.aaaaaa..', '.........'],
  bolt: ['...eee...', '..eaaae..', '.eaEEEae.', '.eaEkEae.', '.eaEEEae.', '..eaaae..', '...eee...', '.........', '.........'],
  music: ['...kkkk..', '...kkkk..', '...k..k..', '...k..k..', '...k..k..', '.kkk.kk..', 'kkkk.kk..', '.kk......', '.........'],
};
export function icon(name) {
  return memo('icon:' + name, () => {
    const rows = ICONS[name] || ICONS.ask;
    const [c, g] = mk(9, 9);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const k = row[x];
        if (k !== '.') { g.fillStyle = ICON_PAL[k]; g.fillRect(x, y, 1, 1); }
      }
    });
    return c;
  });
}

// ---------------------------------------------------------------- 地砖
export const THEMES = {
  town: {},
  home: { wall: '#e8d8a8', wall2: '#d8c088', base: '#985830', top: '#483858', floor: '#c88850', floor2: '#a86c38' },
  cafe: { wall: '#f0a878', wall2: '#e09060', base: '#784020', top: '#502838', floor: '#f0ece0', floor2: '#c04848' },
  shop: { wall: '#98d0c8', wall2: '#78b8b0', base: '#386860', top: '#284848', floor: '#d8c0e0', floor2: '#c0a8d0' },
  gym: { wall: '#b8c8e0', wall2: '#98a8c8', base: '#485878', top: '#2c3450', floor: '#d8a860', floor2: '#b88840' },
  garage: { wall: '#b0aca8', wall2: '#989490', base: '#585450', top: '#383430', floor: '#909098', floor2: '#787880' },
};

function grassBase(R, x0, y0, seed) {
  R(0, 0, 16, 16, '#60b848');
  for (let i = 0; i < 10; i++) {
    const a = hash2(x0 * 31 + i, y0 * 17 + seed);
    const b = hash2(x0 * 7 + i * 3, y0 * 13 + seed + 9);
    const x = (a * 15) | 0, y = (b * 15) | 0;
    R(x, y, 1, 2, '#48a038');
    if (i % 3 === 0) R(x + 1, y, 1, 1, '#88d860');
  }
}

export function tile(code, theme, x, y, t = 0) {
  // 水面动画 4 帧,其余按位置取 4 种变体
  const variant = code === 'w' ? ((t * 3) | 0) % 4 : ((hash2(x, y) * 4) | 0);
  const winNight = code === 'n' ? (t ? 1 : 0) : 0;
  const key = `t:${theme}:${code}:${variant}:${winNight}`;
  return memo(key, () => drawTile(code, THEMES[theme] || {}, variant, winNight, theme));
}

function drawTile(code, T, v, night, theme) {
  const [c, g] = mk(16, 16);
  const R = painter(g);
  const vx = v * 5, vy = v * 3;
  switch (code) {
    case '.': case 'T': // 草地(室外) / 木地板(室内)
      if (theme === 'town') grassBase(R, vx, vy, 1);
      else woodFloor(R, T, v);
      break;
    case ',': // 花草 / 厨房格子砖
      if (theme === 'town') {
        grassBase(R, vx, vy, 2);
        const cols = [P.red, P.yellow, P.white, P.pink];
        for (let i = 0; i < 3; i++) {
          const fx = 2 + ((hash2(v, i) * 11) | 0), fy = 2 + ((hash2(i, v + 5) * 11) | 0);
          const col = cols[(v + i) % 4];
          R(fx, fy - 1, 1, 1, col); R(fx - 1, fy, 3, 1, col); R(fx, fy + 1, 1, 1, col); R(fx, fy, 1, 1, P.yellow);
        }
      } else {
        for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) R(xx * 8, yy * 8, 8, 8, (xx + yy) % 2 ? '#a8c8e8' : '#f0f0f0');
        R(0, 15, 16, 1, '#90a8c8');
      }
      break;
    case ':': // 浴室小瓷砖
      R(0, 0, 16, 16, '#c8e8f0');
      for (let i = 0; i < 16; i += 4) { R(i, 0, 1, 16, '#98c0d0'); R(0, i, 16, 1, '#98c0d0'); }
      R(1, 1, 2, 1, P.white);
      break;
    case '_': // 地毯
      R(0, 0, 16, 16, theme === 'shop' ? '#b088c8' : '#c05050');
      for (let i = 0; i < 16; i += 2) R(i, (i * 3) % 16, 1, 1, theme === 'shop' ? '#c8a0e0' : '#d87070');
      break;
    case 'o': // 餐厅黑白格
      R(0, 0, 16, 16, '#f0ece0');
      R(0, 0, 8, 8, '#384058'); R(8, 8, 8, 8, '#384058');
      break;
    case 'c': // 混凝土
      R(0, 0, 16, 16, T.floor || '#909098');
      for (let i = 0; i < 6; i++) R((hash2(v, i) * 15) | 0, (hash2(i, v) * 15) | 0, 1, 1, T.floor2 || '#787880');
      if (v === 2) { R(4, 6, 6, 3, '#58585e'); R(5, 5, 4, 5, '#58585e'); }
      break;
    case 'm': // 健身垫
      R(0, 0, 16, 16, '#486088');
      R(0, 0, 16, 1, '#5878a8'); R(0, 0, 1, 16, '#5878a8'); R(0, 15, 16, 1, '#304868');
      break;
    case 'E': // 出口门垫
      woodFloor(R, T, v);
      R(1, 2, 14, 12, '#8a5a30'); R(2, 3, 12, 10, '#b07840');
      for (let i = 3; i < 13; i += 2) R(i, 4, 1, 8, '#9a6a38');
      R(7, 5, 2, 4, '#f0e0b0'); R(5, 8, 6, 1, '#f0e0b0'); R(6, 9, 4, 1, '#f0e0b0'); R(7, 10, 2, 1, '#f0e0b0');
      break;
    case '#': // 墙顶
      R(0, 0, 16, 16, T.top || '#483858');
      R(0, 0, 16, 1, shade(T.top || '#483858', 0.2));
      for (let i = 0; i < 16; i += 8) R(i + (v % 2) * 4, 7, 1, 2, shade(T.top || '#483858', -0.25));
      break;
    case '=': case 'n': { // 墙面 / 带窗墙面
      R(0, 0, 16, 16, T.wall);
      for (let i = 1; i < 16; i += 4) R(i, 0, 2, 12, T.wall2);
      R(0, 0, 16, 1, shade(T.wall, -0.3));
      R(0, 12, 16, 4, T.base); R(0, 12, 16, 1, shade(T.base, 0.3));
      if (code === 'n') {
        R(2, 2, 12, 9, P.ink);
        R(3, 3, 10, 7, night ? '#283068' : '#90c8f8');
        if (!night) { R(4, 4, 2, 1, P.white); R(4, 5, 1, 1, P.white); R(9, 7, 3, 2, '#b8e0ff'); }
        else { R(10, 4, 1, 1, '#f8f0a0'); R(5, 7, 1, 1, '#c0c0ff'); }
        R(7, 3, 1, 7, P.white); R(3, 6, 10, 1, P.white);
        R(1, 10, 14, 2, P.white); R(1, 11, 14, 1, P.grey3);
      }
      break;
    }
    case 'r': case 'h': case 'v': // 马路
      R(0, 0, 16, 16, '#585868');
      for (let i = 0; i < 8; i++) R((hash2(v + 3, i) * 15) | 0, (hash2(i + 7, v) * 15) | 0, 1, 1, '#686878');
      if (code === 'h') R(2, 7, 8, 2, '#f0d860');
      if (code === 'v') R(7, 2, 2, 8, '#f0d860');
      break;
    case 's': // 人行道
      R(0, 0, 16, 16, '#d0c8b8');
      R(0, 0, 16, 1, '#a8a090'); R(0, 0, 1, 16, '#a8a090'); R(8, 0, 1, 16, '#b8b0a0'); R(0, 8, 16, 1, '#b8b0a0');
      R(1, 1, 7, 1, '#e8e0d0');
      break;
    case 'p': // 公园土路
      R(0, 0, 16, 16, '#d8b070');
      for (let i = 0; i < 7; i++) {
        const xx = (hash2(v, i + 20) * 14) | 0, yy = (hash2(i + 20, v) * 14) | 0;
        R(xx, yy, 2, 1, '#b89050'); R(xx, yy - 1, 1, 1, '#f0d8a0');
      }
      break;
    case 'x': // 广场砖
      R(0, 0, 16, 16, '#d8a888');
      for (let yy = 0; yy < 16; yy += 4) {
        R(0, yy, 16, 1, '#b88868');
        const off = (yy / 4) % 2 ? 4 : 0;
        for (let xx = off; xx < 16; xx += 8) R(xx, yy, 1, 4, '#b88868');
      }
      break;
    case 'w': { // 水(动画)
      R(0, 0, 16, 16, '#3878d0');
      const ph = v;
      for (let i = 0; i < 4; i++) {
        const yy = (i * 4 + ph) % 16;
        const xx = (i * 7 + ph * 3) % 16;
        R(xx, yy, 4, 1, '#70a8f0');
        R((xx + 9) % 16, (yy + 2) % 16, 2, 1, '#a0d0ff');
      }
      break;
    }
    case 'k': // 木栈道
      R(0, 0, 16, 16, '#3878d0');
      R(0, 0, 16, 16, '#b88848');
      for (let i = 0; i < 16; i += 4) { R(0, i, 16, 1, '#8a6030'); R((i * 5) % 14 + 1, i + 2, 1, 1, '#6a4020'); }
      break;
    case 'f': // 白篱笆(实心)
      grassBase(R, vx, vy, 3);
      R(0, 6, 16, 2, '#e8e8e0'); R(0, 11, 16, 2, '#e8e8e0');
      for (let i = 1; i < 16; i += 5) { R(i, 3, 3, 12, '#f8f8f0'); R(i + 1, 2, 1, 1, '#f8f8f0'); R(i + 2, 4, 1, 11, '#c8c8c0'); }
      R(0, 15, 16, 1, '#3a7a28');
      break;
    case 'l': // 竖向篱笆(实心)
      grassBase(R, vx, vy, 5);
      R(6, 0, 4, 16, '#f8f8f0'); R(9, 0, 1, 16, '#c8c8c0');
      R(5, 4, 6, 2, '#e8e8e0'); R(5, 11, 6, 2, '#e8e8e0');
      R(6, 15, 4, 1, '#3a7a28');
      break;
    case 'b': // 灌木(实心)
      grassBase(R, vx, vy, 4);
      R(1, 3, 14, 12, '#2c7a2c'); R(0, 6, 16, 7, '#2c7a2c');
      R(2, 4, 12, 9, '#3c9a38'); R(3, 4, 5, 3, '#58b848'); R(9, 6, 3, 2, '#58b848');
      R(1, 14, 14, 2, '#205a20');
      break;
    case 'F': // 花坛(实心)
      R(0, 0, 16, 16, '#986038'); R(1, 1, 14, 14, '#784828');
      for (let i = 0; i < 6; i++) {
        const fx = 2 + ((i * 5) % 12), fy = 3 + ((i * 7) % 10);
        R(fx, fy + 1, 1, 2, P.green2);
        const col = [P.red, P.yellow, P.pink, P.white][(i + v) % 4];
        R(fx - 1, fy, 3, 1, col); R(fx, fy - 1, 1, 3, col);
      }
      R(0, 0, 16, 1, '#c08858');
      break;
    default:
      R(0, 0, 16, 16, '#ff00ff');
  }
  return c;
}

function woodFloor(R, T, v) {
  R(0, 0, 16, 16, T.floor || '#c88850');
  const d = T.floor2 || '#a86c38';
  R(0, 3, 16, 1, d); R(0, 7, 16, 1, d); R(0, 11, 16, 1, d); R(0, 15, 16, 1, d);
  R((v * 4 + 3) % 16, 0, 1, 3, d); R((v * 4 + 10) % 16, 4, 1, 3, d); R((v * 4 + 6) % 16, 8, 1, 3, d); R((v * 4 + 13) % 16, 12, 1, 3, d);
  R((v * 3 + 2) % 14, 1, 2, 1, shade(T.floor || '#c88850', 0.15));
}

// ---------------------------------------------------------------- 家具 / 场景物件
// 每个绘制函数返回 {c,w,h},w/h 为像素尺寸;以占地底边对齐绘制。
const F = {};

F.bed = (lvl) => spr(32, 34, (R) => {
  const frame = lvl ? '#6a3a88' : '#8a5a30', blanket = lvl ? '#5878d8' : '#b04848', blanket2 = lvl ? '#3858b8' : '#883030';
  R(0, 0, 32, 10, frame); R(2, 2, 28, 4, shade(frame, 0.25));
  if (lvl) { R(4, 1, 24, 2, P.gold); }
  R(1, 8, 30, 24, P.white);
  R(4, 10, 10, 6, '#f0f0ff'); R(18, 10, 10, 6, '#f0f0ff'); R(4, 15, 10, 1, P.grey3); R(18, 15, 10, 1, P.grey3);
  R(1, 17, 30, 15, blanket); R(1, 17, 30, 2, shade(blanket, 0.3));
  for (let i = 3; i < 30; i += 6) R(i, 21, 3, 3, blanket2);
  R(0, 30, 32, 4, frame);
});
F.blanket = (lvl) => spr(30, 15, (R) => {
  const blanket = lvl ? '#5878d8' : '#b04848', blanket2 = lvl ? '#3858b8' : '#883030';
  R(0, 0, 30, 15, blanket); R(0, 0, 30, 2, shade(blanket, 0.3));
  for (let i = 2; i < 29; i += 6) R(i, 4, 3, 3, blanket2);
}, 'rgba(0,0,0,0)');
F.nightstand = () => spr(14, 22, (R) => {
  R(5, 0, 4, 6, '#f8e8a0'); R(4, 1, 6, 4, '#f8e8a0'); R(6, 6, 2, 3, P.gold);
  R(0, 9, 14, 13, '#a06830'); R(1, 10, 12, 2, '#c08850'); R(2, 14, 10, 1, '#704018'); R(6, 16, 2, 1, P.gold);
});
F.bookshelf = () => spr(16, 30, (R) => {
  R(0, 0, 16, 30, '#7a4820'); R(1, 1, 14, 28, '#5a3010');
  const cols = ['#c84040', '#4070c8', '#48a048', '#d8a030', '#8848a8', '#e0e0d0'];
  for (let s = 0; s < 3; s++) {
    const y = 2 + s * 9;
    for (let i = 0; i < 6; i++) R(2 + i * 2, y + (i % 3 === 1 ? 1 : 0), 2, 7 - (i % 3 === 1 ? 1 : 0), cols[(i + s * 2) % 6]);
    R(1, y + 7, 14, 2, '#8a5828');
  }
});
F.phone = () => spr(14, 20, (R) => {
  R(0, 8, 14, 12, '#a06830'); R(1, 9, 12, 2, '#c08850');
  R(3, 3, 8, 5, P.red); R(2, 2, 10, 2, P.red2); R(5, 4, 4, 3, P.white); R(6, 5, 2, 1, P.ink);
});
F.computer = (lvl) => spr(30, 26, (R) => {
  R(0, 12, 30, 4, '#a07040'); R(1, 16, 3, 10, '#704018'); R(26, 16, 3, 10, '#704018');
  R(8, 0, 14, 11, '#d8d8d0'); R(9, 1, 12, 8, '#284878'); R(10, 2, 4, 1, '#78f078'); R(10, 4, 7, 1, '#78f078'); R(10, 6, 5, 1, '#78f078');
  R(13, 10, 4, 2, '#b0b0a8'); R(7, 13, 14, 2, '#e8e8e0'); R(23, 13, 3, 2, '#e8e8e0');
});
F.tv = (lvl) => lvl
  ? spr(30, 24, (R) => {
    R(0, 0, 30, 18, '#202028'); R(2, 2, 26, 13, '#3858a8'); R(3, 3, 8, 2, '#88b8f8');
    R(12, 18, 6, 2, '#404048'); R(2, 20, 26, 4, '#704018'); R(3, 20, 24, 1, '#a07040');
  })
  : spr(26, 26, (R) => {
    R(3, 0, 6, 1, P.grey); R(5, 1, 1, 3, P.grey); R(15, 0, 1, 4, P.grey);
    R(1, 4, 20, 14, '#8a6038'); R(3, 6, 13, 10, '#203858'); R(4, 7, 4, 2, '#70a0e0'); R(17, 7, 3, 2, '#d8d0c0'); R(17, 11, 3, 2, '#d8d0c0');
    R(0, 18, 26, 8, '#704018'); R(1, 19, 24, 1, '#a07040'); R(4, 22, 18, 1, '#5a3010');
  });
F.sofa = (lvl) => spr(32, 20, (R) => {
  const c = lvl ? '#783030' : '#5878a8', d = shade(c, -0.3), l = shade(c, 0.25);
  R(0, 0, 32, 10, c); R(1, 1, 30, 2, l);
  R(0, 6, 4, 14, d); R(28, 6, 4, 14, d);
  R(4, 9, 24, 9, l); R(4, 9, 12, 9, c); R(16, 9, 1, 9, d);
  R(0, 18, 32, 2, d);
  if (lvl) { R(6, 3, 4, 4, P.gold); R(22, 3, 4, 4, P.gold); }
});
// 背对镜头的沙发(朝向上方的电视):坐垫在上,靠背在下
F.sofaBack = (lvl) => spr(32, 22, (R) => {
  const c = lvl ? '#783030' : '#5878a8', d = shade(c, -0.3), l = shade(c, 0.25);
  R(2, 0, 28, 8, l); R(2, 0, 14, 8, c); R(16, 0, 1, 8, d);
  R(0, 2, 4, 14, d); R(28, 2, 4, 14, d); R(0, 2, 4, 1, l); R(28, 2, 4, 1, l);
  R(0, 8, 32, 12, c); R(1, 9, 30, 2, l); R(0, 19, 32, 3, d);
  if (lvl) { for (let i = 4; i < 30; i += 6) R(i, 13, 2, 2, P.gold); }
});
F.fridge = () => spr(16, 30, (R) => {
  R(0, 0, 16, 30, '#e8e8f0'); R(1, 1, 14, 9, '#f8f8ff'); R(0, 10, 16, 1, '#a0a0b0');
  R(12, 3, 2, 5, '#a0a0b0'); R(12, 13, 2, 8, '#a0a0b0'); R(2, 13, 6, 4, '#f0a040'); R(3, 14, 4, 1, P.white);
  R(0, 28, 16, 2, '#b0b0c0');
});
F.stove = () => spr(16, 22, (R) => {
  R(0, 0, 16, 7, '#e0e0e8'); R(2, 1, 5, 2, '#383840'); R(9, 1, 5, 2, '#383840'); R(2, 4, 5, 2, '#383840'); R(9, 4, 5, 2, '#383840');
  R(0, 7, 16, 15, '#d0d0d8'); R(2, 9, 12, 9, '#383840'); R(3, 10, 10, 1, '#585868'); R(2, 19, 12, 1, '#a0a0b0');
});
F.counter = () => spr(16, 22, (R) => {
  R(0, 0, 16, 7, '#c8c0b8'); R(3, 1, 10, 5, '#9098a8'); R(4, 2, 8, 3, '#b8d0e8'); R(7, 0, 2, 2, '#a0a0b0');
  R(0, 7, 16, 15, '#a07040'); R(1, 9, 6, 11, '#c08850'); R(9, 9, 6, 11, '#c08850'); R(6, 13, 1, 2, P.gold); R(9, 13, 1, 2, P.gold);
});
F.table = () => spr(32, 20, (R) => {
  R(0, 0, 32, 10, '#c08850'); R(1, 1, 30, 2, '#d8a870'); R(0, 10, 32, 2, '#8a5828');
  R(2, 12, 3, 8, '#704018'); R(27, 12, 3, 8, '#704018');
});
F.plate = (dirty) => spr(8, 5, (R) => {
  R(0, 0, 8, 5, P.white); R(1, 1, 6, 3, dirty ? '#a08060' : '#f0f0e0'); if (dirty) { R(2, 2, 2, 1, '#706040'); R(5, 1, 1, 1, '#c04030'); }
});
F.pizza = () => spr(14, 6, (R) => { R(0, 0, 14, 6, '#d8b878'); R(1, 1, 12, 4, '#c8a060'); R(4, 2, 6, 2, P.red); });
F.trash = () => spr(10, 14, (R) => { R(0, 0, 10, 3, '#a0a8b0'); R(1, 3, 8, 11, '#8890a0'); R(3, 5, 1, 7, '#6a7080'); R(6, 5, 1, 7, '#6a7080'); });
F.toilet = () => spr(14, 22, (R) => {
  R(1, 0, 12, 8, '#f0f0f8'); R(2, 1, 10, 2, P.white); R(9, 4, 2, 1, '#a0a0b0');
  R(2, 8, 10, 12, '#e8e8f0'); R(3, 10, 8, 7, '#b8d8f0'); R(4, 11, 6, 5, '#d0e8f8'); R(3, 19, 8, 3, '#d0d0e0');
});
F.sink = () => spr(16, 30, (R) => {
  R(2, 0, 12, 12, '#b8a888'); R(3, 1, 10, 10, '#c8e8f8'); R(4, 2, 3, 3, P.white); R(9, 7, 2, 2, '#e8f8ff');
  R(0, 14, 16, 6, '#f0f0f8'); R(3, 15, 10, 3, '#b8d8f0'); R(7, 12, 2, 3, '#a0a0b0');
  R(5, 20, 6, 10, '#e0e0e8');
});
F.shower = () => spr(16, 32, (R) => {
  R(0, 0, 16, 32, '#c8e0f0'); R(1, 1, 14, 30, '#e0f0f8');
  R(6, 2, 4, 2, '#a0a0b0'); R(7, 4, 2, 2, '#a0a0b0');
  R(0, 28, 16, 4, '#b0c8d8');
  R(2, 8, 1, 18, '#ffffff'); R(13, 6, 1, 20, '#b0d0e8');
}, '#506878');
F.bathtub = () => spr(32, 18, (R) => {
  R(0, 0, 32, 18, '#f0f0f8'); R(2, 2, 28, 12, '#b8d8f0'); R(3, 3, 26, 3, '#d8f0ff');
  R(26, 0, 4, 2, P.gold); R(0, 16, 32, 2, '#c8c8d8'); R(2, 18, 3, 0, P.ink);
});
F.easel = () => spr(16, 30, (R) => {
  R(2, 22, 2, 8, '#8a5828'); R(12, 22, 2, 8, '#8a5828'); R(7, 0, 2, 30, '#8a5828');
  R(1, 3, 14, 16, P.white); R(2, 4, 12, 14, '#f8f8e8'); R(3, 9, 5, 4, '#78b8f0'); R(8, 6, 4, 4, P.yellow); R(4, 13, 8, 3, '#60b848');
  R(0, 19, 16, 2, '#a06830');
});
F.guitar = () => spr(12, 26, (R) => {
  R(5, 0, 2, 12, '#5a3010'); R(4, 0, 4, 2, '#3a2010');
  R(2, 11, 8, 6, '#e08830'); R(1, 15, 10, 9, '#e08830'); R(4, 17, 4, 4, '#5a3010'); R(2, 23, 8, 1, '#a05818');
  R(0, 24, 12, 2, P.grey2);
});
F.treadmill = () => spr(16, 28, (R) => {
  R(1, 0, 14, 5, '#404048'); R(3, 1, 10, 2, '#70f070'); R(1, 5, 2, 10, '#606068'); R(13, 5, 2, 10, '#606068');
  R(0, 14, 16, 14, '#505058'); R(2, 15, 12, 12, '#282830'); R(2, 17, 12, 1, '#383840'); R(2, 21, 12, 1, '#383840');
});
F.aquarium = () => spr(30, 24, (R) => {
  R(0, 0, 30, 14, '#3888c8'); R(1, 1, 28, 2, '#68b8f0'); R(2, 10, 26, 3, '#d8c890'); R(4, 6, 2, 5, P.green); R(22, 5, 2, 6, P.green2);
  R(9, 5, 4, 2, P.orange); R(8, 6, 1, 1, P.orange); R(17, 8, 3, 2, P.yellow);
  R(0, 14, 30, 10, '#404048'); R(1, 15, 28, 1, '#606068');
});
F.plant = () => spr(14, 24, (R) => {
  R(6, 2, 2, 12, P.green2); R(1, 4, 6, 4, P.green); R(7, 0, 6, 5, P.green); R(0, 8, 5, 3, P.green2); R(8, 7, 6, 4, P.green);
  R(2, 5, 2, 1, P.green3); R(9, 1, 2, 1, P.green3);
  R(2, 14, 10, 10, '#c86838'); R(1, 14, 12, 3, '#d88048');
});
F.puddle = () => spr(18, 8, (R) => { R(2, 0, 12, 8, '#e8d850'); R(0, 2, 18, 4, '#e8d850'); R(4, 2, 4, 2, '#f8f0a0'); }, '#b0a030');
F.painting = (n) => spr(14, 11, (R) => {
  R(0, 0, 14, 11, P.gold); R(1, 1, 12, 9, '#f8f0d8');
  const r = rng(n * 97 + 3);
  R(1, 1, 12, 5, ['#78b8f0', '#f0a060', '#283868'][n % 3]);
  R(1, 6, 12, 4, ['#60b848', '#d8b070', '#386838'][n % 3]);
  R(2 + ((r() * 7) | 0), 2, 3, 3, [P.yellow, P.red, P.white][n % 3]);
});
F.mirror = () => spr(12, 14, (R) => { R(0, 0, 12, 14, P.gold); R(1, 1, 10, 12, '#c8e8f8'); R(2, 2, 3, 4, P.white); });
F.chair = () => spr(12, 16, (R) => { R(0, 0, 12, 6, '#a06830'); R(0, 6, 12, 4, '#c08850'); R(1, 10, 2, 6, '#704018'); R(9, 10, 2, 6, '#704018'); });
F.stool = () => spr(10, 14, (R) => { R(0, 0, 10, 4, '#d84848'); R(1, 1, 8, 1, '#f07070'); R(4, 4, 2, 8, P.grey); R(1, 12, 8, 2, P.grey2); });

// 咖啡馆
F.cafeCounter = () => spr(48, 26, (R) => {
  R(0, 4, 48, 8, '#e8d8c0'); R(0, 4, 48, 1, P.white);
  R(4, 0, 10, 8, '#383840'); R(5, 1, 8, 3, '#606068'); R(7, 5, 4, 2, '#d0d0d0');
  R(20, 1, 6, 4, P.white); R(22, 2, 2, 2, '#704018'); R(30, 0, 12, 5, '#f0c870'); R(31, 1, 10, 2, '#f8e0a0'); R(33, 3, 1, 1, P.red); R(37, 3, 1, 1, P.red);
  R(0, 12, 48, 14, '#784020'); for (let i = 2; i < 48; i += 8) R(i, 14, 4, 10, '#905830');
});
F.cafeTable = () => spr(16, 18, (R) => {
  R(0, 0, 16, 8, P.white); R(1, 1, 14, 6, '#f0e8e0'); R(2, 2, 12, 1, '#d84848'); R(2, 5, 12, 1, '#d84848');
  R(6, 2, 4, 3, '#f8f8f0'); R(7, 3, 2, 1, '#704018');
  R(7, 8, 2, 8, P.grey2); R(3, 16, 10, 2, P.grey2);
});
F.menuBoard = () => spr(30, 14, (R, g) => {
  R(0, 0, 30, 14, '#5a3010'); R(1, 1, 28, 12, '#284028');
  g.translate(0, 0); ptext('MENU', 7, 2, P.white, g);
  R(3, 9, 8, 1, '#c0e0c0'); R(14, 9, 12, 1, '#c0e0c0');
});
// 家具店
F.shopCounter = () => spr(32, 24, (R) => {
  R(0, 6, 32, 6, '#e0d8c8'); R(0, 6, 32, 1, P.white);
  R(20, 0, 10, 8, '#383840'); R(21, 1, 8, 3, '#80e080'); R(22, 5, 6, 2, '#a0a0a8');
  R(0, 12, 32, 12, '#386860'); R(2, 14, 28, 8, '#4a8078');
});
F.catalog = () => spr(14, 22, (R) => {
  R(6, 10, 2, 10, P.grey2); R(2, 20, 10, 2, P.grey2);
  R(0, 0, 14, 11, '#f0e0a0'); R(1, 1, 12, 9, P.white); R(2, 2, 5, 4, '#d84848'); R(8, 2, 4, 1, P.grey2); R(8, 4, 4, 1, P.grey2); R(2, 7, 10, 1, P.grey2);
});
// 健身房
F.weights = () => spr(30, 18, (R) => {
  R(2, 8, 26, 4, '#404048'); R(10, 10, 10, 8, '#606068');
  R(0, 2, 4, 14, '#202028'); R(26, 2, 4, 14, '#202028'); R(4, 5, 22, 2, P.grey3);
  R(4, 2, 2, 8, '#303038'); R(24, 2, 2, 8, '#303038');
});
F.punchbag = () => spr(12, 30, (R) => {
  R(5, 0, 2, 6, P.grey2); R(1, 6, 10, 20, '#c83030'); R(2, 7, 3, 18, '#e85050'); R(1, 25, 10, 2, '#801818'); R(1, 12, 10, 1, '#801818');
  R(2, 28, 8, 2, 'rgba(0,0,0,0.25)');
});
// 修车厂
F.car = () => spr(44, 30, (R) => {
  R(0, 26, 44, 4, '#c8b030'); R(4, 24, 36, 2, '#888890');
  R(2, 10, 40, 14, '#3868c8'); R(8, 2, 28, 10, '#3868c8'); R(10, 3, 11, 8, '#a8d8f8'); R(23, 3, 11, 8, '#a8d8f8'); R(11, 4, 4, 2, P.white);
  R(2, 10, 40, 2, '#5888e8'); R(0, 16, 44, 3, '#c8c8d0'); R(4, 14, 4, 2, P.yellow); R(36, 14, 4, 2, P.yellow);
  R(4, 20, 9, 6, '#202028'); R(31, 20, 9, 6, '#202028'); R(7, 22, 3, 2, P.grey);
  R(34, 22, 3, 2, P.grey);
});
F.toolbench = () => spr(32, 22, (R) => {
  R(0, 0, 32, 10, '#c83030'); for (let i = 2; i < 30; i += 5) R(i, 2, 2, 6, P.grey3);
  R(0, 10, 32, 3, '#888890'); R(0, 13, 32, 9, '#a03030'); R(2, 15, 12, 5, '#c84848'); R(18, 15, 12, 5, '#c84848'); R(7, 17, 2, 1, P.grey3); R(23, 17, 2, 1, P.grey3);
});
F.tires = () => spr(14, 22, (R) => {
  for (let i = 0; i < 3; i++) { R(0, 14 - i * 7, 14, 8, '#202028'); R(2, 15 - i * 7, 10, 2, '#383840'); }
});
F.drum = () => spr(12, 18, (R) => { R(0, 0, 12, 18, '#3870a8'); R(0, 3, 12, 1, '#285080'); R(0, 13, 12, 1, '#285080'); R(2, 4, 2, 9, '#5890c8'); R(3, 7, 6, 3, P.yellow); });

// 室外
F.tree = (v) => spr(30, 40, (R) => {
  const cols = [['#2c7a2c', '#3c9a38', '#58b848'], ['#28703c', '#38904c', '#58b060'], ['#307830', '#48a040', '#70c050']][v % 3];
  R(12, 26, 6, 14, '#704018'); R(13, 26, 2, 14, '#8a5828');
  R(4, 6, 22, 22, cols[0]); R(0, 12, 30, 12, cols[0]); R(8, 0, 14, 8, cols[0]);
  R(5, 7, 18, 16, cols[1]); R(2, 13, 10, 8, cols[1]); R(9, 2, 10, 8, cols[1]);
  R(8, 4, 6, 4, cols[2]); R(4, 12, 5, 3, cols[2]); R(15, 9, 5, 3, cols[2]);
  if (v % 2) { R(20, 16, 2, 2, P.red); R(9, 18, 2, 2, P.red); R(15, 5, 2, 2, P.red); }
});
F.mailbox = (flag) => spr(12, 22, (R) => {
  R(5, 10, 2, 12, '#704018'); R(0, 2, 12, 9, '#3870c8'); R(1, 1, 10, 2, '#5890e0'); R(1, 6, 3, 2, P.ink);
  if (flag) { R(10, 0, 2, 7, P.red); R(9, 0, 3, 2, P.red); } else R(10, 5, 2, 2, P.red);
});
F.bench = () => spr(32, 18, (R) => {
  R(0, 0, 32, 3, '#a06830'); R(0, 4, 32, 3, '#a06830'); R(0, 9, 32, 4, '#c08850'); R(0, 9, 32, 1, '#d8a870');
  R(2, 0, 2, 18, P.ink2); R(28, 0, 2, 18, P.ink2);
});
F.fountain = (f) => spr(32, 30, (R) => {
  R(0, 12, 32, 16, '#b0b0b8'); R(2, 14, 28, 12, '#3878d0'); R(2, 14, 28, 2, '#2858a8');
  R(4 + f * 3, 18, 4, 1, '#a0d0ff'); R(20 - f * 2, 22, 5, 1, '#a0d0ff');
  R(13, 6, 6, 14, '#c8c8d0'); R(11, 4, 10, 3, '#c8c8d0'); R(15, 0, 2, 4 + f, '#a0d8ff'); R(12, 3, 1, 3, '#a0d8ff'); R(19, 3, 1, 3 - f, '#a0d8ff');
  R(0, 26, 32, 4, '#909098');
});
F.chess = () => spr(16, 20, (R) => {
  R(0, 0, 16, 10, '#c8c8d0');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) if ((x + y) % 2) R(2 + x * 2, 1 + y * 2, 2, 2, '#383840'); else R(2 + x * 2, 1 + y * 2, 2, 2, '#e8e8f0');
  R(4, 0, 1, 2, P.white); R(10, 7, 1, 2, P.ink);
  R(6, 10, 4, 8, '#a8a8b0'); R(3, 18, 10, 2, '#909098');
});
F.lamp = () => spr(10, 36, (R) => {
  R(4, 6, 2, 28, '#303040'); R(2, 32, 6, 4, '#303040');
  R(1, 1, 8, 6, '#f8e8a0'); R(0, 0, 10, 2, '#303040'); R(2, 7, 6, 1, '#303040');
});
F.signpost = () => spr(26, 22, (R, g) => {
  R(11, 10, 3, 12, '#704018');
  R(0, 0, 26, 12, '#a06830'); R(1, 1, 24, 10, '#d8b070');
  ptext('GREEN', 3, 3, '#5a3010', g);
});
F.busstop = () => spr(16, 34, (R, g) => {
  R(7, 8, 2, 26, P.grey2); R(1, 0, 14, 10, '#2c58b8'); R(2, 1, 12, 8, '#3870d8'); ptext('BUS', 3, 2, P.white, g);
});
F.hydrant = () => spr(8, 12, (R) => { R(1, 0, 6, 3, P.red); R(2, 3, 4, 8, P.red); R(0, 5, 8, 2, P.red2); R(1, 11, 6, 1, P.red2); R(3, 4, 1, 4, '#f07070'); });
F.flowerpot = () => spr(12, 14, (R) => {
  R(2, 7, 8, 7, '#c86838'); R(1, 7, 10, 2, '#d88048');
  R(1, 2, 3, 3, P.pink); R(5, 0, 3, 3, P.yellow); R(8, 3, 3, 3, P.red); R(5, 4, 2, 3, P.green2);
});
F.boat = () => spr(26, 12, (R) => { R(0, 3, 26, 6, '#a06830'); R(2, 9, 22, 3, '#704018'); R(3, 4, 20, 2, '#c08850'); });

// 建筑:w,h 为占地格数,额外向上 12px 屋顶
const BUILD_STYLE = {
  home: { roof: '#c84040', wall: '#f0e0b8', trim: '#985830', door: '#a05828' },
  cafe: { roof: '#e88030', wall: '#f8e8d0', trim: '#784020', door: '#c84848', awning: ['#d84848', '#f8f0e8'] },
  shop: { roof: '#3878c8', wall: '#e0f0f0', trim: '#386860', door: '#386860', awning: ['#38a8a0', '#e8f8f8'] },
  gym: { roof: '#48a048', wall: '#d8e0f0', trim: '#485878', door: '#485878' },
  garage: { roof: '#787880', wall: '#c8c0b0', trim: '#585450', door: '#686060' },
  jed: { roof: '#8858a8', wall: '#f0d8c0', trim: '#704018', door: '#704018' },
};
const SIGNS = { cafe: 'CAFE', shop: 'HOME SHOP', gym: 'GYM', garage: 'GARAGE', home: '', jed: '' };
export function building(kind, w, h, doorX, night = false) {
  return memo(`bld:${kind}:${w}:${h}:${doorX}:${night ? 1 : 0}`, () => {
    const S = BUILD_STYLE[kind];
    const PW = w * 16, PH = h * 16 + 12;
    return spr(PW, PH, (R, g) => {
      const wallH = 34;
      const wy = PH - wallH;
      // 屋顶
      for (let y = 0; y < wy; y++) {
        const inset = Math.max(0, Math.round((wy - y) * 0.25) - 2);
        const c = (y % 5 === 4) ? shade(S.roof, -0.25) : (y < 3 ? shade(S.roof, 0.2) : S.roof);
        R(inset, y, PW - inset * 2, 1, c);
      }
      for (let x = 6; x < PW - 6; x += 8) R(x, 4, 1, wy - 6, shade(S.roof, -0.12));
      R(0, wy - 2, PW, 2, shade(S.roof, -0.4));
      if (kind === 'home' || kind === 'jed') { R(PW - 22, 0, 8, 12, '#985040'); R(PW - 23, 0, 10, 2, '#703020'); }
      // 墙面
      R(0, wy, PW, wallH, S.wall);
      R(0, wy, PW, 2, shade(S.wall, -0.25));
      R(0, PH - 3, PW, 3, S.trim);
      // 窗户
      const doorPx = doorX * 16;
      for (let x = 6; x < PW - 14; x += 22) {
        if (x + 14 > doorPx - 2 && x < doorPx + 18) continue;
        if (kind === 'garage' && x > PW - 52) continue;
        R(x, wy + 7, 14, 12, S.trim);
        R(x + 1, wy + 8, 12, 10, night ? '#f8e088' : '#90c8f8');
        if (!night) { R(x + 2, wy + 9, 3, 1, P.white); R(x + 2, wy + 10, 1, 2, P.white); }
        R(x + 6, wy + 8, 1, 10, S.trim); R(x + 1, wy + 12, 12, 1, S.trim);
        R(x - 1, wy + 19, 16, 2, P.white);
        if (kind === 'home') { R(x - 1, wy + 21, 16, 3, '#986038'); R(x, wy + 21, 3, 2, P.red); R(x + 6, wy + 21, 3, 2, P.yellow); R(x + 11, wy + 21, 3, 2, P.pink); }
      }
      if (kind === 'garage') {
        const gx = PW - 46;
        R(gx, wy + 5, 40, wallH - 8, '#505058');
        for (let y = wy + 7; y < PH - 3; y += 3) R(gx + 1, y, 38, 1, '#707078');
      }
      // 门
      const dx = doorPx + 2;
      R(dx, wy + 8, 12, wallH - 11, S.door);
      R(dx + 1, wy + 9, 10, 2, shade(S.door, 0.25));
      R(dx + 2, wy + 13, 3, 4, night ? '#f8e088' : '#a8d8f8'); R(dx + 7, wy + 13, 3, 4, night ? '#f8e088' : '#a8d8f8');
      R(dx + 9, wy + 20, 2, 2, P.gold);
      R(dx - 2, PH - 3, 16, 3, '#b8b0a0');
      // 遮阳篷
      if (S.awning) {
        for (let x = 0; x < PW; x += 6) R(x, wy + 1, 6, 5, S.awning[(x / 6) % 2]);
        for (let x = 0; x < PW; x += 6) R(x + 1, wy + 6, 4, 1, S.awning[(x / 6) % 2]);
      }
      // 招牌
      const label = SIGNS[kind];
      if (label) {
        const lw = label.length * 4 + 5;
        const lx = Math.round(PW / 2 - lw / 2), ly = wy - 9;
        R(lx, ly, lw, 9, '#f8f0d0'); R(lx, ly + 8, lw, 1, '#a08860');
        ptext(label, lx + 3, ly + 2, S.trim, g);
      }
    });
  });
}

export function furniture(type, variant = 0) {
  return memo(`f:${type}:${variant}`, () => (F[type] ? F[type](variant) : spr(16, 16, (R) => R(0, 0, 16, 16, '#f0f'))));
}

// ---------------------------------------------------------------- 角色
// look: {skin, hair, hairStyle(0-3), shirt, pants, shoes, skirt(bool)}
export const SKINS = ['#f8d0a8', '#e8b080', '#c88858', '#8a5838'];
export const HAIRS = ['#382010', '#783818', '#e8c040', '#c84020', '#282830', '#a8a8b0', '#7050c0'];
export const SHIRTS = ['#d84848', '#3870d8', '#48a848', '#f0c030', '#8850c0', '#f080a8', '#f0f0f0', '#303848'];
export const PANTS = ['#304878', '#383838', '#806040', '#a8a0c0', '#c84868', '#2c6838'];

function drawSim(look, dir, pose, frame) {
  const [c, g] = mk(18, 28);
  g.translate(1, 3);
  const R = painter(g);
  const sk = look.skin, hr = look.hair, sh = look.shirt, pa = look.pants, so = look.shoes || '#382818';
  const shD = shade(sh, -0.25), skD = shade(sk, -0.18), hrL = shade(hr, 0.2);
  const walk = pose === 'walk';
  const sit = pose === 'sit';
  const act = pose === 'act';
  const bob = walk ? -1 : 0;
  const by = (sit ? 3 : 0) + bob; // 上半身偏移
  const legA = walk && frame === 0, legB = walk && frame === 1;
  const closed = pose === 'sleep';
  const hs = look.hairStyle | 0;

  if (dir === 'down' || dir === 'up') {
    const back = dir === 'up';
    // 长发在身后
    if ((hs === 2 || hs === 3) && !back) R(3, 4 + by, 10, hs === 3 ? 12 : 9, hr);
    // 腿
    if (!sit) {
      if (look.skirt) {
        R(5, 19 + by, 2, legA ? 3 : 2, sk); R(9, 19 + by, 2, legB ? 3 : 2, sk);
      } else {
        R(4, 18 + by, 8, 2, pa);
        R(4, 20 + by, 3, legA ? 2 : (legB ? 1 : 2), pa);
        R(9, 20 + by, 3, legB ? 2 : (legA ? 1 : 2), pa);
      }
      R(4, (legB ? 21 : 22) + (legA ? 0 : 0), 3, 2, so);
      R(9, legA ? 21 : 22, 3, 2, so);
    } else {
      R(4, 18 + by - 1, 8, 3, pa);
      R(4, 22, 3, 1, so); R(9, 22, 3, 1, so);
    }
    // 躯干
    if (look.skirt && !sit) { R(4, 11 + by, 8, 6, sh); R(3, 16 + by, 10, 3, pa); R(3, 18 + by, 10, 1, shade(pa, -0.25)); }
    else R(4, 11 + by, 8, 7, sh);
    R(10, 11 + by, 2, 7, shD);
    if (!back) { R(7, 11 + by, 2, 1, sk); }
    // 手臂
    if (act) {
      const up = frame === 0;
      R(2, (up ? 8 : 10) + by, 2, 5, sh); R(12, (up ? 10 : 8) + by, 2, 5, sh);
      R(2, (up ? 7 : 9) + by, 2, 1, sk); R(12, (up ? 9 : 7) + by, 2, 1, sk);
    } else {
      const sa = walk ? (frame === 0 ? 1 : -1) : 0;
      R(2, 12 + by + sa, 2, 5, sh); R(12, 12 + by - sa, 2, 5, shD);
      R(2, 17 + by + sa, 2, 1, sk); R(12, 17 + by - sa, 2, 1, skD);
    }
    // 头
    R(4, 2 + by, 8, 9, sk); R(3, 4 + by, 10, 5, sk);
    R(11, 4 + by, 1, 6, skD);
    if (back) {
      R(3, 1 + by, 10, 9, hr); R(4, 0 + by, 8, 1, hr); R(5, 1 + by, 4, 1, hrL);
      if (hs === 2) R(3, 10 + by, 10, 3, hr);
      if (hs === 3) R(3, 10 + by, 10, 6, hr);
      if (hs === 1) R(6, -1 + by, 4, 2, hr);
    } else {
      // 头发前刘海
      R(3, 1 + by, 10, 3, hr); R(4, 0 + by, 8, 1, hr); R(5, 1 + by, 4, 1, hrL);
      if (hs === 0) { R(3, 4 + by, 1, 3, hr); R(12, 4 + by, 1, 3, hr); R(4, 4 + by, 3, 1, hr); }
      if (hs === 1) { R(6, -1 + by, 4, 2, hr); R(3, 4 + by, 1, 2, hr); R(12, 4 + by, 1, 2, hr); R(9, 4 + by, 3, 1, hr); }
      if (hs === 2) { R(3, 4 + by, 1, 6, hr); R(12, 4 + by, 1, 6, hr); R(4, 4 + by, 2, 1, hr); R(10, 4 + by, 2, 1, hr); }
      if (hs === 3) { R(2, 3 + by, 2, 9, hr); R(12, 3 + by, 2, 9, hr); R(4, 4 + by, 8, 1, hr); }
      // 眼睛
      if (closed) { R(5, 7 + by, 2, 1, P.ink); R(9, 7 + by, 2, 1, P.ink); }
      else { R(5, 6 + by, 2, 2, P.ink); R(9, 6 + by, 2, 2, P.ink); R(5, 6 + by, 1, 1, P.white); R(9, 6 + by, 1, 1, P.white); }
      R(7, 9 + by, 2, 1, skD);
      if (look.skirt) { R(4, 8 + by, 1, 1, '#f09090'); R(11, 8 + by, 1, 1, '#f09090'); }
    }
  } else {
    // 侧面(朝右绘制,左向时水平翻转)
    if (hs === 2 || hs === 3) R(3, 4 + by, 4, hs === 3 ? 12 : 8, hr);
    if (!sit) {
      if (legA) { R(8, 18 + by, 3, 4, look.skirt ? sk : pa); R(5, 18 + by, 3, 3, look.skirt ? sk : shade(pa, -0.2)); R(9, 22, 4, 2, so); R(4, 21, 3, 2, so); }
      else if (legB) { R(5, 18 + by, 3, 4, look.skirt ? sk : pa); R(8, 18 + by, 3, 3, look.skirt ? sk : shade(pa, -0.2)); R(4, 22, 4, 2, so); R(9, 21, 3, 2, so); }
      else { R(6, 18 + by, 4, 4, look.skirt ? sk : pa); R(6, 22, 5, 2, so); }
      if (look.skirt) { R(4, 16 + by, 8, 3, pa); }
    } else {
      R(6, 17 + by, 7, 3, pa); R(11, 20, 2, 2, pa); R(11, 22, 3, 1, so);
    }
    R(5, 11 + by, 6, 7, sh);
    // 手臂
    if (act) {
      R(9, (frame ? 11 : 12) + by, 4, 2, shD); R(13, (frame ? 11 : 12) + by, 1, 2, sk);
    } else {
      const sw = walk ? (frame === 0 ? 2 : -2) : 0;
      R(7 + (sw > 0 ? 1 : sw < 0 ? -1 : 0), 12 + by, 2, 5, shD); R(7 + sw, 17 + by, 2, 1, sk);
    }
    // 头
    R(5, 2 + by, 7, 9, sk); R(11, 5 + by, 1, 3, sk); R(12, 6 + by, 1, 1, sk);
    R(4, 1 + by, 8, 3, hr); R(5, 0 + by, 6, 1, hr); R(4, 4 + by, 3, 4, hr); R(6, 1 + by, 3, 1, hrL);
    if (hs === 1) R(7, -1 + by, 4, 2, hr);
    if (hs === 3) R(3, 3 + by, 2, 10, hr);
    if (closed) R(9, 7 + by, 2, 1, P.ink);
    else { R(9, 6 + by, 2, 2, P.ink); R(9, 6 + by, 1, 1, P.white); }
    R(5, 6 + by, 1, 2, skD);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  outline(c);
  if (dir === 'left') {
    const [c2, g2] = mk(18, 28);
    g2.translate(18, 0); g2.scale(-1, 1); g2.drawImage(c, 0, 0);
    return c2;
  }
  return c;
}

export function lookKey(l) { return [l.skin, l.hair, l.hairStyle, l.shirt, l.pants, l.shoes, l.skirt ? 1 : 0].join(','); }
export function simFrame(look, dir, pose = 'stand', frame = 0) {
  const p = pose === 'walk' || pose === 'act' ? pose : pose === 'sit' ? 'sit' : pose === 'sleep' ? 'sleep' : 'stand';
  return memo(`sim:${lookKey(look)}:${dir}:${p}:${frame % 2}`, () => drawSim(look, dir, p, frame % 2));
}

// 头像 40×40
export function portrait(look, mood = 'happy') {
  return memo(`por:${lookKey(look)}:${mood}`, () => {
    const [c, g] = mk(40, 40);
    const R = painter(g);
    const sk = look.skin, hr = look.hair, skD = shade(sk, -0.2), hrL = shade(hr, 0.25), hrD = shade(hr, -0.3);
    R(0, 0, 40, 40, '#78a8e8');
    for (let y = 0; y < 40; y += 4) R(0, y, 40, 2, '#88b8f0');
    const hs = look.hairStyle | 0;
    if (hs === 2 || hs === 3) R(6, 8, 28, hs === 3 ? 32 : 22, hr);
    // 肩膀
    R(4, 33, 32, 7, look.shirt); R(4, 33, 32, 1, shade(look.shirt, 0.3)); R(16, 33, 8, 3, sk);
    R(16, 29, 8, 5, skD);
    // 脸
    R(10, 8, 20, 22, sk); R(8, 12, 24, 14, sk); R(12, 30, 16, 1, skD); R(28, 12, 2, 16, skD);
    R(7, 16, 2, 5, sk); R(31, 16, 2, 5, sk);
    // 头发
    R(8, 4, 24, 8, hr); R(10, 2, 20, 3, hr); R(12, 3, 8, 2, hrL);
    if (hs === 0) { R(8, 12, 3, 6, hr); R(29, 12, 3, 6, hr); R(11, 11, 8, 2, hr); }
    if (hs === 1) { R(14, 0, 12, 4, hr); R(8, 12, 2, 4, hr); R(30, 12, 2, 4, hr); R(22, 11, 8, 2, hr); }
    if (hs === 2) { R(7, 10, 3, 14, hr); R(30, 10, 3, 14, hr); R(10, 11, 6, 2, hr); R(24, 11, 6, 2, hr); }
    if (hs === 3) { R(5, 8, 5, 26, hr); R(30, 8, 5, 26, hr); R(10, 11, 20, 2, hr); }
    R(8, 10, 24, 1, hrD);
    // 表情
    const ey = 17;
    if (mood === 'angry') { R(11, ey - 3, 6, 1, hrD); R(12, ey - 2, 3, 1, hrD); R(23, ey - 3, 6, 1, hrD); R(25, ey - 2, 3, 1, hrD); }
    else if (mood === 'sad') { R(12, ey - 3, 5, 1, hrD); R(11, ey - 2, 2, 1, hrD); R(23, ey - 3, 5, 1, hrD); R(27, ey - 2, 2, 1, hrD); }
    else { R(12, ey - 3, 5, 1, hrD); R(23, ey - 3, 5, 1, hrD); }
    R(12, ey, 4, 4, P.white); R(24, ey, 4, 4, P.white); R(13, ey, 3, 4, P.ink); R(25, ey, 3, 4, P.ink); R(14, ey + 1, 1, 1, P.white); R(26, ey + 1, 1, 1, P.white);
    R(19, ey + 3, 2, 3, skD);
    if (mood === 'happy') { R(16, 25, 8, 1, '#a03030'); R(17, 26, 6, 2, '#a03030'); R(18, 27, 4, 1, '#f08080'); }
    else if (mood === 'sad') { R(17, 26, 6, 1, '#a03030'); R(16, 27, 1, 1, '#a03030'); R(23, 27, 1, 1, '#a03030'); }
    else if (mood === 'angry') { R(16, 26, 8, 2, '#a03030'); R(17, 26, 6, 1, P.white); }
    else { R(17, 26, 6, 1, '#a03030'); }
    if (look.skirt) { R(10, 23, 3, 1, '#f09090'); R(27, 23, 3, 1, '#f09090'); R(12, ey - 1, 1, 1, P.ink); R(27, ey - 1, 1, 1, P.ink); }
    // 边框
    R(0, 0, 40, 1, P.ink); R(0, 39, 40, 1, P.ink); R(0, 0, 1, 40, P.ink); R(39, 0, 1, 40, P.ink);
    return c;
  });
}

// 绿钻(Plumbob)
export function plumbob(color) {
  return memo('pb:' + color, () => {
    const [c, g] = mk(9, 14);
    const R = painter(g);
    const L = shade(color, 0.45), D = shade(color, -0.35);
    const rows = [[4, 1], [3, 3], [3, 3], [2, 5], [2, 5], [1, 7], [1, 7], [2, 5], [2, 5], [3, 3], [3, 3], [4, 1]];
    rows.forEach(([x, w], y) => {
      R(x, y + 1, w, 1, y < 6 ? L : D);
      if (w > 2) R(x + (w >> 1), y + 1, (w >> 1) + 1, 1, y < 6 ? color : shade(color, -0.15));
    });
    R(3, 4, 1, 3, P.white);
    outline(c, P.ink);
    return c;
  });
}

export function bubble(w, h) {
  return memo(`bub:${w}:${h}`, () => spr(w, h, (R) => {
    R(1, 0, w - 2, h - 3, P.white); R(0, 1, w, h - 5, P.white);
    R((w >> 1) - 2, h - 3, 4, 1, P.white); R((w >> 1) - 1, h - 2, 2, 1, P.white);
  }));
}
