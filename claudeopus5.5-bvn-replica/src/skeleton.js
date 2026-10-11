// 程序化动漫人物:关节角姿势 → 正向运动学 → 粗描边赛璐璐绘制。
// 坐标约定(身体局部,面向 +x,y 向下):角度 a 以"正下方"为 0,向前(+x)为正。
//   手臂 a1/a2 相对躯干(前臂 = a1+a2,肘向前上弯);腿 l1/l2 在身体系(小腿 = l1-l2,膝向后弯)。
//   t 躯干前倾、h 头部俯仰、r 全身前翻(用于击飞 / 倒地)。
import { D2R, shade } from './util.js';

export const BONE = { torso: 33, uarm: 17, farm: 16, thigh: 22, shin: 22, head: 12 };
const OUT = '#1a0f14';
const OW = 2.3;

const sin = (a) => Math.sin(a * D2R), cos = (a) => Math.cos(a * D2R);
const dirv = (a, len) => [sin(a) * len, cos(a) * len];
function rot(p, ang) { const c = cos(ang), s = sin(ang); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; }
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

export const POSE_KEYS = ['r', 't', 'h', 'a1', 'a2', 'b1', 'b2', 'f1', 'f2', 'k1', 'k2', 'w', 'dx', 'dy'];
// a1/a2 前臂、b1/b2 后臂、f1/f2 前腿、k1/k2 后腿
export const BASE_POSE = { r: 0, t: 6, h: 0, a1: 25, a2: 70, b1: 15, b2: 80, f1: 18, f2: 14, k1: -14, k2: 6, w: 60, dx: 0, dy: 0 };

// ---------------------------------------------------------------- 正向运动学
export function solve(p, look) {
  const bd = look.build || {};
  const T = BONE.torso * (bd.torso || 1), UA = BONE.uarm * (bd.arm || 1), FA = BONE.farm * (bd.arm || 1);
  const TH = BONE.thigh * (bd.leg || 1), SH = BONE.shin * (bd.leg || 1);
  const r = p.r || 0, t = p.t || 0;
  const R = (v) => rot(v, r);
  const hip = [p.dx || 0, 0];
  const up = rot([0, -1], t);
  const chest = add(hip, R([up[0] * T, up[1] * T]));
  const shoulder = add(hip, R([up[0] * (T - 5), up[1] * (T - 5)]));
  const neck = add(hip, R([up[0] * (T + 2), up[1] * (T + 2)]));
  const headC = add(neck, R(rot([2.5, -BONE.head + 1], t + (p.h || 0))));
  const arm = (a1, a2) => {
    const e = add(shoulder, R(rot(dirv(a1, UA), t)));
    const h = add(e, R(rot(dirv(a1 + a2, FA), t)));
    return { e, h, fa: a1 + a2 - t + r };
  };
  const leg = (l1, l2) => {
    const k = add(hip, R(dirv(l1, TH)));
    const f = add(k, R(dirv(l1 - l2, SH)));
    return { k, f, sa: l1 - l2 + r };
  };
  const A = arm(p.a1, p.a2), Bk = arm(p.b1, p.b2), F = leg(p.f1, p.f2), K = leg(p.k1, p.k2);
  return { hip, chest, shoulder, neck, headC, A, B: Bk, F, K, t, r, h: p.h || 0, T, upAng: t + r };
}

// 着地偏移:让最低的脚(或倒地时最低的身体点)贴住 y=0
export function groundShift(J, lie) {
  let m = Math.max(J.F.f[1] + 3, J.K.f[1] + 3, J.F.k[1] + 5, J.K.k[1] + 5);
  if (lie) m = Math.max(m, J.hip[1] + 6, J.chest[1] + 7, J.headC[1] + 11, J.F.k[1] + 5, J.K.k[1] + 5);
  return -m;
}

// ---------------------------------------------------------------- 绘制工具
function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
function fillOut(ctx, fill, lw = OW) { ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = OUT; ctx.stroke(); } }
function line(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
function limb(ctx, pts, w, color, P) {
  line(ctx, pts);
  if (!P.flat) { ctx.strokeStyle = OUT; ctx.lineWidth = w + OW * 2; ctx.stroke(); }
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
}
function seg(ctx, a, b, w, color) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); }
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// ---------------------------------------------------------------- 发型
// 刺发生成:沿头部外圈从 from 到 to(度,0=前方,-90=头顶,-180=后方)排列 n 根刺
function spiky(n, from, to, lens, sweep = -20, R0 = 10.5, cy = -1) {
  // 每根刺单独成三角(带描边),再用无描边的"发芯"盖住内侧描边,形成层叠刺发
  const spikes = [], core = [];
  const step = (to - from) / n, hw = Math.abs(step) * 0.8 + 7;
  for (let i = 0; i < n; i++) {
    const am = from + step * (i + 0.5);
    const L = Array.isArray(lens) ? lens[i % lens.length] : lens;
    const ta = am + sweep;
    spikes.push([[cos(am - hw) * (R0 - 1), cy + sin(am - hw) * (R0 - 1)], [cos(ta) * (R0 + L), cy + sin(ta) * (R0 + L)], [cos(am + hw) * (R0 - 1), cy + sin(am + hw) * (R0 - 1)]]);
  }
  for (let a = Math.min(from, to) - 8; a <= Math.max(from, to) + 8; a += 8) core.push([cos(a) * (R0 + 0.6), cy + sin(a) * (R0 + 0.6)]);
  core.push([0, cy + 2]);
  return { spikes, core };
}
// 发顶盖:圆弧 + 额前发际线
function cap(a0, a1, R = 12.6, hair = [[11.5, -3], [4, -6], [-6, -4]]) {
  const pts = [];
  for (let a = a0; a <= a1; a += 10) pts.push([cos(a) * R, -1 + sin(a) * R]);
  pts.push([cos(a1) * R, -1 + sin(a1) * R]);
  return pts.concat(hair);
}
const tri = (x, y, len, ang, w = 3) => [[x - w, y], [x + sin(ang) * len, y + cos(ang) * len], [x + w, y - 1]];

export const HAIR = {
  // 刺猬金发(疾风)
  shippu: { back: [spiky(7, -55, -215, [10, 13, 14, 13, 12, 10, 8], -22)], front: [cap(-205, -20, 12.4, [[12.6, -4], [8, -5], [2, -7], [-8, -4]]), tri(11, -6, 8, 30, 2.6), tri(7, -7, 9, 15, 2.6), tri(3, -8, 7, 0, 2.5)] },
  // 鸭尾黑发 + 长鬓角(夜叉)
  yasha: { back: [spiky(6, -110, -215, [9, 13, 15, 14, 11, 8], -30)], front: [cap(-210, -25, 12.4, [[12, -2], [6, -5], [-8, -3]]), [[11.5, -4], [14.5, 8], [10.5, 2]], [[6, -6], [7, 6], [3, -2]]] },
  // 斜立银发(雷牙)
  raiga: { back: [spiky(6, -40, -175, [12, 16, 18, 16, 13, 9], -38)], front: [cap(-200, -30, 12.3, [[12, -3], [6, -6], [-7, -4]]), tri(8, -7, 6, 10, 2.5)] },
  // 红色乱发(流砂)
  ryusa: { back: [spiky(9, -40, -210, [5, 6, 7, 6, 7, 6, 5, 6, 4], -15)], front: [cap(-205, -22, 12.5, [[12.6, -4], [7, -6], [-6, -4]]), tri(10, -6, 6, 25, 2.2), tri(5, -7, 6, 10, 2.2)] },
  // 黑长发低马尾 + 两侧长鬓(鸦)
  karasu: { back: [spiky(5, -60, -200, [3, 3, 3, 3, 2], -10)], front: [cap(-205, -25, 12.6, [[12.5, -3], [5, -6], [-6, -4]]), [[11.8, -3], [13.5, 12], [10, 1]], [[-1, -5], [1, 11], [-4, 0]]] },
  // 橙色刺发(苍牙)
  souga: { back: [spiky(9, -45, -210, [7, 9, 10, 10, 9, 9, 8, 7, 5], -25)], front: [cap(-205, -20, 12.5, [[12.8, -4], [7, -5], [-7, -4]]), tri(12, -5, 8, 35, 2.5), tri(8, -6, 9, 15, 2.6), tri(4, -7, 7, 5, 2.4)] },
  // 白色立发(冰轮)
  hyorin: { back: [spiky(8, -40, -205, [9, 11, 11, 10, 9, 8, 7, 5], -12)], front: [cap(-205, -22, 12.5, [[12.5, -4], [6, -6], [-6, -4]]), tri(10, -6, 7, 20, 2.4), tri(6, -7, 6, 10, 2.3)] },
  // 黑色直长发 + 白发饰(绯樱)
  hizakura: { back: [[[-10, -8], [-14, 4], [-15, 18], [-10, 24], [-6, 12], [-4, 2]]], front: [cap(-210, -25, 12.6, [[12.5, -3], [9, -4], [4, -6], [-6, -4]]), [[11.5, -4], [13, 10], [9.5, 0]]], orn: [[-3, -12, 7, -60], [-8, -9, 7, -100]] },
  // 狂放长刺 + 铃铛(狂剑)
  kyouken: { back: [spiky(10, -30, -230, [14, 18, 20, 21, 20, 19, 17, 15, 12, 9], -10)], front: [cap(-210, -20, 12.6, [[12.7, -4], [7, -6], [-7, -4]])] },
  // 背头 + 一缕垂发(幻主)
  genshu: { back: [[[0, -12], [-9, -10], [-15, -4], [-17, 4], [-12, 7], [-7, 3]]], front: [cap(-205, -35, 12.5, [[11, -8], [6, -9], [-6, -6]]), [[8, -9], [12, 4], [9, -3], [6, -8]]] },
  // 援助角色
  suiei: { back: [], front: [[[-12, 4], [-13, -4], [-9, -12], [0, -14.5], [9, -12], [13, -4], [13, 0], [-4, 0], [-6, 6], [-10, 8]]], gloss: true },
  senjin: { back: [spiky(8, -60, -240, [12, 16, 18, 20, 22, 24, 26, 22], -35)], front: [cap(-205, -25, 12.5, [[12.4, -4], [6, -6], [-7, -4]]), [[11, -4], [13, 12], [9, 2]]] },
  juushou: { back: [[[-9, -9], [-14, 6], [-14, 24], [-8, 28], [-4, 12], [-2, 2]]], front: [cap(-210, -25, 12.6, [[12.6, -2], [10, -1], [6, -2], [3, -5], [-6, -4]]), [[11.4, -3], [12.5, 14], [9, 2]]] },
  messhi: { back: [spiky(5, -60, -200, [3, 4, 4, 3, 2], -15)], front: [cap(-205, -25, 12.5, [[12.4, -4], [6, -5], [-6, -4]]), [[11, -4], [12, 8], [9, -1]]] },
  tatehana: { back: [[[-9, -9], [-15, 8], [-14, 28], [-6, 32], [-3, 14], [-2, 2]]], front: [cap(-210, -25, 12.6, [[12.6, -2], [9, -3], [3, -6], [-6, -4]]), [[11.6, -3], [13, 15], [9.5, 2]]], pins: true },
  boukage: { back: [spiky(5, -100, -200, [5, 6, 6, 5, 4], -10)], front: [[[11, -2], [13, 6], [9, 1]], [[7, -2], [8, 6], [5, 0]]], hat: true },
};

// ---------------------------------------------------------------- 头部
const HEAD_PATH = (ctx) => {
  ctx.beginPath();
  ctx.moveTo(-7, 10);
  ctx.quadraticCurveTo(-13.5, 4, -12, -4);
  ctx.quadraticCurveTo(-10, -13.5, 0, -13.2);
  ctx.quadraticCurveTo(10.5, -13, 12, -3);
  ctx.lineTo(12.4, 2);
  ctx.lineTo(13.6, 4.6);
  ctx.lineTo(11.6, 6);
  ctx.quadraticCurveTo(11.6, 9, 9.6, 11);
  ctx.quadraticCurveTo(6, 13.6, 2, 12.2);
  ctx.quadraticCurveTo(-2, 11.6, -7, 10);
  ctx.closePath();
};

function drawHead(ctx, J, look, P) {
  const hair = HAIR[look.hairStyle] || HAIR.souga;
  const hc = P.c(look.hair);
  ctx.save();
  ctx.translate(J.headC[0], J.headC[1]);
  ctx.rotate((J.upAng + J.h) * D2R);
  ctx.scale(1.17, 1.17); // 动漫比例:头略大
  // 后发
  for (const p of hair.back) {
    if (p.spikes) { for (const t of p.spikes) { poly(ctx, t); fillOut(ctx, hc, P.lw); } poly(ctx, p.core); ctx.fillStyle = hc; ctx.fill(); }
    else { poly(ctx, p); fillOut(ctx, hc, P.lw); }
  }
  if (hair.bells && !P.flat) for (const [x, y] of [[-20, -16], [-27, -2], [-23, 12], [-8, -29], [6, -28]]) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); fillOut(ctx, P.c('#e8c040'), 1.2); }
  // 脸
  HEAD_PATH(ctx); fillOut(ctx, P.c(look.skin), P.lw);
  if (!P.flat) {
    // 阴影(后脑与下颌)
    ctx.save(); HEAD_PATH(ctx); ctx.clip();
    ctx.fillStyle = 'rgba(120,40,40,0.16)'; ctx.beginPath(); ctx.ellipse(-8, 4, 8, 12, 0, 0, 7); ctx.fill();
    ctx.restore();
    // 耳朵
    ctx.beginPath(); ctx.ellipse(-1.5, 2, 2.6, 3.4, 0, 0, 7); fillOut(ctx, look.skin, 1.4);
    drawFace(ctx, look, P);
  }
  // 头巾 / 护额
  if (look.headband && !P.flat) {
    const hb = look.headband;
    ctx.lineCap = 'round';
    seg(ctx, [-12, -3], [12.2, -5.5], 5.6, OUT);
    seg(ctx, [-12, -3], [12.2, -5.5], 3.8, hb.band);
    if (hb.plate) {
      poly(ctx, [[3, -9.5], [12.8, -10], [13.2, -1.5], [3, -1]]); fillOut(ctx, hb.plate, 1.6);
      ctx.strokeStyle = '#59606c'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(6, -3); ctx.quadraticCurveTo(7, -8.5, 11, -7.5); ctx.quadraticCurveTo(10.5, -3.5, 6, -3); ctx.stroke();
      if (hb.slash) { ctx.strokeStyle = '#2a2e36'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(4, -2.5); ctx.lineTo(12.4, -8.5); ctx.stroke(); }
    }
  }
  // 前发
  for (const p of hair.front) { poly(ctx, p); fillOut(ctx, hc, P.lw); }
  if (hair.gloss && !P.flat) { ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(1, -2, 10, -2.4, -1.4); ctx.stroke(); }
  if (hair.orn && !P.flat) for (const [x, y, l, a] of hair.orn) { ctx.save(); ctx.translate(x, y); ctx.rotate((90 - a) * D2R); ctx.beginPath(); ctx.roundRect(0, -1.7, l, 3.4, 1.5); fillOut(ctx, '#f2f2f6', 1.1); ctx.restore(); }
  if (hair.pins && !P.flat) { ctx.beginPath(); ctx.arc(3, -9, 2, 0, 7); fillOut(ctx, '#6fb8ff', 1); }
  if (hair.hat) {
    poly(ctx, [[-15, -3], [16, -5], [13, -8], [9, -17], [-8, -17], [-12, -8]]); fillOut(ctx, P.c('#3a5a3a'), P.lw);
    if (!P.flat) { ctx.fillStyle = '#e8e8e0'; for (let i = -6; i < 9; i += 6) { ctx.fillRect(i, -16, 2.6, 9); } }
  }
  if (look.mask === 'hollow' || P.hollow) drawHollowMask(ctx, P);
  ctx.restore();
}

function drawFace(ctx, look, P) {
  const ex = P.expr || 'normal';
  const eyeC = P.eyeRed ? '#e0102a' : look.eye || '#3a2a20';
  // 下半脸面罩(雷牙)
  if (look.mask === 'lower') {
    ctx.beginPath(); ctx.moveTo(-1, 2); ctx.lineTo(12.2, 1.5); ctx.lineTo(13.6, 4.6); ctx.lineTo(11.6, 6); ctx.quadraticCurveTo(11.6, 9, 9.6, 11); ctx.quadraticCurveTo(6, 13.6, 2, 12.2); ctx.quadraticCurveTo(-2, 11.6, -7, 10); ctx.lineTo(-6, 4); ctx.closePath();
    fillOut(ctx, look.maskColor || '#26304a', 1.4);
  } else {
    // 嘴
    ctx.strokeStyle = '#5a2a28'; ctx.lineWidth = 1.1;
    if (P.shout) { poly(ctx, [[8.6, 7.6], [11.4, 7.2], [10.8, 10], [9, 10]]); ctx.fillStyle = '#4a1418'; ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(9.2, 8.6); ctx.lineTo(11.2, 8.2); ctx.stroke(); }
  }
  // 脸部印记
  if (look.marks === 'whisker') { ctx.strokeStyle = '#6a3a2a'; ctx.lineWidth = 0.8; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(4, 3.5 + i * 1.8); ctx.lineTo(8, 3 + i * 1.6); ctx.stroke(); } }
  if (look.marks === 'forehead') { ctx.strokeStyle = '#c0182a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(7, -10); ctx.lineTo(10, -8.5); ctx.moveTo(8.5, -11); ctx.lineTo(8.5, -7); ctx.stroke(); }
  if (look.marks === 'scar') { ctx.strokeStyle = '#8a3a30'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(9, 9); ctx.stroke(); }
  if (look.marks === 'lines') { ctx.strokeStyle = '#7a4a3a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(6.5, 3); ctx.lineTo(7.5, 7.5); ctx.stroke(); }
  if (look.glasses) { ctx.strokeStyle = '#30303a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(5, -2.2, 7, 4.8); ctx.moveTo(5, -0.5); ctx.lineTo(-1, 0); ctx.stroke(); }
  // 眼
  if (look.eyepatch) { poly(ctx, [[4.5, -2.5], [12, -3], [12, 3.2], [5, 3.2]]); ctx.fillStyle = '#121014'; ctx.fill(); seg(ctx, [-10, -6], [5, -2], 1.2, '#121014'); return; }
  const browY = ex === 'angry' ? [-5.5, -3.2] : [-4.6, -4.8];
  seg(ctx, [4.8, browY[0]], [11.4, browY[1]], 1.7, shade(look.hair, -0.45));
  if (ex === 'hurt' || ex === 'closed') {
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.beginPath();
    if (ex === 'hurt') { ctx.moveTo(5.5, -1); ctx.lineTo(9.5, 1); ctx.lineTo(6, 2.6); } else { ctx.moveTo(5.5, 1); ctx.quadraticCurveTo(8, 2.4, 10.8, 0.8); }
    ctx.stroke(); return;
  }
  const narrow = look.eyeStyle === 'narrow';
  const top = narrow ? 0.2 : -1;
  poly(ctx, [[5.2, top + 0.4], [10.9, top - 0.5], [10.9, 2.8], [6.4, 3]]); ctx.fillStyle = look.sclera || '#fbfbfb'; ctx.fill();
  ctx.save(); poly(ctx, [[5.2, top + 0.4], [10.9, top - 0.5], [10.9, 2.8], [6.4, 3]]); ctx.clip();
  ctx.beginPath(); ctx.ellipse(8.9, 1.3, 1.9, narrow ? 1.9 : 2.6, 0, 0, 7); ctx.fillStyle = eyeC; ctx.fill();
  if (!look.blankEye) { ctx.beginPath(); ctx.ellipse(9.1, 1.4, 0.8, 1.3, 0, 0, 7); ctx.fillStyle = '#0c0608'; ctx.fill(); }
  if (P.eyeRed && P.eyeRed !== 1) { ctx.fillStyle = '#100'; for (let i = 0; i < 3; i++) { const a = i * 2.1; ctx.beginPath(); ctx.arc(8.9 + Math.cos(a) * 1.3, 1.3 + Math.sin(a) * 1.5, 0.45, 0, 7); ctx.fill(); } }
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8.2, 0.3, 0.6, 0, 7); ctx.fill();
  ctx.restore();
  seg(ctx, [4.8, top + 0.3], [11.2, top - 0.7], 1.5, OUT);
}

function drawHollowMask(ctx, P) {
  ctx.beginPath(); ctx.moveTo(-4, -10); ctx.quadraticCurveTo(10, -14, 13, -3); ctx.lineTo(14, 5); ctx.lineTo(11.6, 7); ctx.quadraticCurveTo(11, 11, 9.6, 12); ctx.quadraticCurveTo(4, 14, -1, 11); ctx.quadraticCurveTo(-5, 2, -4, -10); ctx.closePath();
  fillOut(ctx, P.c('#f4f2ea'), P.lw);
  if (P.flat) return;
  ctx.fillStyle = '#c01818';
  poly(ctx, [[2, -11], [4.5, -11.5], [5.5, 9], [3.5, 9]]); ctx.fill();
  poly(ctx, [[-2, -9], [0, -10], [0.5, 8], [-1.5, 7]]); ctx.fill();
  ctx.fillStyle = '#0a0608'; poly(ctx, [[6, -1], [11.5, -2], [11, 3], [7, 3]]); ctx.fill();
  ctx.fillStyle = '#ffd640'; ctx.beginPath(); ctx.arc(9.2, 0.8, 1.1, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2a2020'; ctx.lineWidth = 0.8; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(7 + i * 1.2, 9.4); ctx.lineTo(7.3 + i * 1.2, 11.8); ctx.stroke(); }
}

// ---------------------------------------------------------------- 武器
export function drawWeapon(ctx, wp, hand, ang, P, sc = 1) {
  ctx.save();
  ctx.translate(hand[0], hand[1]);
  ctx.rotate((90 - ang) * D2R);
  ctx.scale(sc, sc);
  const L = wp.len || 50, lw = P.lw;
  const c = P.c;
  switch (wp.type) {
    case 'cleaver': {
      ctx.beginPath(); ctx.roundRect(-14, -2.6, 19, 5.2, 2); fillOut(ctx, c(wp.hilt || '#ecebe4'), lw);
      if (!P.flat) { ctx.strokeStyle = '#9a9890'; ctx.lineWidth = 0.8; for (let i = -12; i < 4; i += 3.2) { ctx.beginPath(); ctx.moveTo(i, -2.4); ctx.lineTo(i + 2, 2.4); ctx.stroke(); } }
      poly(ctx, [[5, -6], [L - 10, -7.5], [L, -2], [L - 3, 8.5], [5, 7]]); fillOut(ctx, c(wp.color || '#cfd5da'), lw);
      if (!P.flat) {
        ctx.fillStyle = c(wp.back || '#2a2c34'); poly(ctx, [[5, -6], [L - 10, -7.5], [L - 6, -5.3], [5, -3.6]]); ctx.fill();
        seg(ctx, [6, 6], [L - 3.5, 7.2], 1.3, 'rgba(255,255,255,0.85)');
      }
      break;
    }
    case 'blackblade': {
      ctx.beginPath(); ctx.roundRect(-12, -2, 13, 4, 1.5); fillOut(ctx, c('#20202a'), lw);
      poly(ctx, [[2, -5], [4, -5], [3, 5], [1, 5]]); fillOut(ctx, c('#2a2a32'), 1.2);
      poly(ctx, [[4, -1.8], [L - 6, -2.2], [L, 0], [L - 6, 2], [4, 1.8]]); fillOut(ctx, c('#16141c'), lw);
      if (!P.flat) seg(ctx, [6, 1.2], [L - 6, 1.2], 0.8, '#9a2030');
      break;
    }
    case 'jagged':
    case 'katana':
    case 'chokuto': {
      ctx.beginPath(); ctx.roundRect(-12, -2, 13, 4, 1.5); fillOut(ctx, c(wp.hilt || '#2a2a40'), lw);
      if (!P.flat && wp.type !== 'chokuto') { ctx.strokeStyle = '#c8c8d8'; ctx.lineWidth = 0.7; for (let i = -11; i < 0; i += 2.6) { ctx.beginPath(); ctx.moveTo(i, -1.8); ctx.lineTo(i + 1.6, 1.8); ctx.stroke(); } }
      if (wp.type !== 'chokuto') { ctx.beginPath(); ctx.ellipse(1.5, 0, 1.6, 4.4, 0, 0, 7); fillOut(ctx, c(wp.guard || '#c8a040'), 1.2); }
      const bend = wp.type === 'katana' ? 2.2 : 0;
      ctx.beginPath(); ctx.moveTo(3, -1.6); ctx.quadraticCurveTo(L * 0.6, -1.8 - bend, L, -bend - 1.5);
      ctx.quadraticCurveTo(L * 0.6, 1.8 - bend, 3, 1.6);
      if (wp.type === 'jagged') {
        ctx.beginPath(); ctx.moveTo(3, -1.8);
        for (let x = 6; x < L - 4; x += 5) { ctx.lineTo(x, -2.2); ctx.lineTo(x + 2, -1.2); }
        ctx.lineTo(L, -1); ctx.lineTo(L - 4, 2.2);
        for (let x = L - 8; x > 4; x -= 6) { ctx.lineTo(x, 2.6); ctx.lineTo(x - 2, 1.4); }
        ctx.lineTo(3, 1.8); ctx.closePath();
      } else ctx.closePath();
      fillOut(ctx, c(wp.color || '#d8dee6'), lw);
      if (!P.flat) seg(ctx, [5, -0.6], [L - 4, -bend - 1], 0.8, 'rgba(255,255,255,0.9)');
      break;
    }
    case 'kunai': {
      ctx.beginPath(); ctx.arc(-7, 0, 2, 0, 7); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.beginPath(); ctx.roundRect(-5, -1.3, 6, 2.6, 1); fillOut(ctx, c('#3a3040'), 1);
      poly(ctx, [[1, -2.6], [L, 0], [1, 2.6]]); fillOut(ctx, c('#b8c0cc'), 1.2);
      break;
    }
    case 'cane': {
      ctx.beginPath(); ctx.roundRect(-14, -1.6, L + 14, 3.2, 1.5); fillOut(ctx, c('#5a3a24'), lw);
      break;
    }
    case 'bow': {
      ctx.strokeStyle = OUT; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.arc(-6, 0, 18, -1.1, 1.1); ctx.stroke();
      ctx.strokeStyle = c('#9adcff'); ctx.lineWidth = 2; ctx.stroke();
      if (!P.flat) { ctx.strokeStyle = 'rgba(200,240,255,0.8)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(-6 + 18 * Math.cos(1.1), -18 * Math.sin(1.1)); ctx.lineTo(-10, 0); ctx.lineTo(-6 + 18 * Math.cos(1.1), 18 * Math.sin(1.1)); ctx.stroke(); }
      break;
    }
  }
  ctx.restore();
}
// 武器尖端世界坐标(用于刀光拖尾)
export function weaponTip(J, look, p) {
  const ang = J.A.fa + (p.w || 0);
  const L = (look.weapon?.len || 50) * (p.ws || 1);
  return [J.A.h[0] + sin(ang) * L, J.A.h[1] + cos(ang) * L, J.A.h[0] + sin(ang) * 8, J.A.h[1] + cos(ang) * 8];
}

// ---------------------------------------------------------------- 躯干与服装
function torsoPoly(J, look, wH, wC) {
  const T = J.T, a = J.upAng;
  const loc = (x, y) => { const v = rot([x, y], a); return [J.hip[0] + v[0], J.hip[1] + v[1]]; };
  return { pts: [loc(-wH / 2, 2), loc(wH / 2, 2), loc(wC / 2 + 1, -T + 7), loc(wC * 0.35, -T + 1), loc(-wC * 0.45, -T + 1), loc(-wC / 2, -T + 8)], loc };
}

function drawCoatBack(ctx, J, look, P, sway) {
  const co = look.coat; if (!co) return;
  const a = J.upAng;
  const L = (co.len || 1) * 46;
  const top = add(J.shoulder, rot([-6, -2], a));
  const hipB = add(J.hip, rot([-9, 0], J.r));
  const bot = [hipB[0] - 6 - sway * 0.6, hipB[1] + L];
  const bot2 = [hipB[0] + 8 - sway * 0.4, hipB[1] + L - 2];
  const pts = [top, add(J.shoulder, rot([3, 0], a)), add(J.hip, [6, 0]), bot2];
  if (co.ragged) for (let i = 1; i < 6; i++) pts.push(mix(bot2, bot, i / 6).map((v, k) => v + (k ? (i % 2 ? 5 : 0) : 0)));
  pts.push(bot, hipB);
  poly(ctx, pts); fillOut(ctx, P.c(shade(co.color, -0.12)), P.lw);
}
function drawCoatFront(ctx, J, look, P, sway) {
  const co = look.coat; if (!co || P.flat) return;
  const a = J.upAng;
  const L = (co.len || 1) * 46;
  const s1 = add(J.shoulder, rot([4, -1], a)), s2 = add(J.shoulder, rot([9, 2], a));
  const h1 = add(J.hip, rot([5, 0], J.r)), h2 = add(J.hip, rot([10, 0], J.r));
  const b1 = [h1[0] - sway * 0.3 + 2, h1[1] + L - 4], b2 = [h2[0] - sway * 0.3 + 6, h2[1] + L - 6];
  poly(ctx, [s1, s2, h2, b2, b1, h1]); fillOut(ctx, P.c(co.color), P.lw);
  if (co.trim) { seg(ctx, s2, h2, 1.6, co.trim); seg(ctx, h2, b2, 1.6, co.trim); }
}

function drawCloak(ctx, J, look, P, sway) {
  const cl = look.cloak; if (!cl) return;
  const a = J.upAng;
  const sb = add(J.shoulder, rot([-9, -1], a)), sf = add(J.shoulder, rot([9, 1], a));
  const nk = add(J.neck, rot([7, -3], a)), nk2 = add(J.neck, rot([-6, -4], a));
  const hb = add(J.hip, rot([-11, 0], J.r)), hf = add(J.hip, rot([11, 0], J.r));
  const L = 40;
  const bb = [hb[0] - 6 - sway * 0.7, hb[1] + L], bf = [hf[0] + 8 - sway * 0.4, hf[1] + L - 4];
  poly(ctx, [nk2, nk, sf, hf, bf, bb, hb, sb]); fillOut(ctx, P.c(cl.color), P.lw);
  if (P.flat || !cl.pattern) return;
  // 云纹(原创:新月形纹)
  ctx.save(); poly(ctx, [nk2, nk, sf, hf, bf, bb, hb, sb]); ctx.clip();
  ctx.fillStyle = cl.pattern; ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 1;
  for (const m of [mix(hb, bb, 0.5), mix(hf, sf, 0.35), mix(hf, bf, 0.6)]) {
    ctx.beginPath(); ctx.arc(m[0], m[1], 6, 0.3, 3.6); ctx.arc(m[0] + 2, m[1] - 2, 4.5, 3.4, 0.4, true); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

function drawTorso(ctx, J, look, P) {
  const bd = look.build || {};
  const wH = 17 * (bd.waist || 1), wC = 22 * (bd.chest || 1);
  const { pts, loc } = torsoPoly(J, look, wH, wC);
  const st = look.topStyle || 'shirt';
  poly(ctx, pts); fillOut(ctx, P.c(look.top), P.lw);
  if (P.flat) return;
  const T = J.T;
  ctx.save(); poly(ctx, pts); ctx.clip();
  // 明暗:背侧
  ctx.fillStyle = 'rgba(0,0,0,0.16)'; poly(ctx, [loc(-wH / 2 - 2, 3), loc(-2, 3), loc(-4, -T), loc(-wC, -T)]); ctx.fill();
  if (st === 'jacket') {
    ctx.fillStyle = look.top2; poly(ctx, [loc(-20, -T * 0.62), loc(20, -T * 0.7), loc(20, -T - 4), loc(-20, -T - 4)]); ctx.fill();
    seg(ctx, loc(wC * 0.42, -T + 2), loc(wH * 0.42, 0), 1.2, '#f4f4f4');
    seg(ctx, loc(-6, -T + 1), loc(8, -T + 1), 3, '#f4f4f4');
  } else if (st === 'kimono') {
    seg(ctx, loc(3, -T + 1), loc(10, -T * 0.42), 3.4, '#f2f2f2');
    seg(ctx, loc(3, -T + 1), loc(10, -T * 0.42), 1, '#b8b8c0');
    if (look.strap) seg(ctx, loc(-wC / 2, -T + 3), loc(wH / 2, -T * 0.3), 3.2, look.strap);
  } else if (st === 'vest') {
    ctx.fillStyle = look.top2; poly(ctx, [loc(-wH / 2 - 1, 2), loc(wH / 2 + 2, 2), loc(wC / 2 + 2, -T + 6), loc(-wC / 2, -T + 6)]); ctx.fill();
    ctx.strokeStyle = shade(look.top2, -0.35); ctx.lineWidth = 1;
    for (const y of [-T * 0.55, -T * 0.3]) { ctx.beginPath(); const p1 = loc(1, y), p2 = loc(9, y); ctx.rect(Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]) - 1, 7, 6); ctx.stroke(); }
    seg(ctx, loc(-wC / 2, -T + 5), loc(wC / 2 + 1, -T + 5), 4, shade(look.top2, -0.1));
  } else if (st === 'shirt') {
    if (look.collar) { seg(ctx, loc(-wC * 0.5, -T + 2), loc(4, -T + 2), 6, look.collar); }
  } else if (st === 'uniform') {
    seg(ctx, loc(2, -T + 1), loc(9, -T * 0.35), 2.2, look.top2 || '#888');
  } else if (st === 'jumpsuit') {
    seg(ctx, loc(-wC / 2, -T * 0.55), loc(wC / 2, -T * 0.6), 6, look.top2);
  } else if (st === 'school') {
    ctx.fillStyle = look.top2; poly(ctx, [loc(-12, -T + 8), loc(12, -T + 8), loc(12, -T - 3), loc(-12, -T - 3)]); ctx.fill();
    seg(ctx, loc(6, -T + 6), loc(10, -T + 12), 3, '#d8303a');
  }
  ctx.restore();
  if (look.belt) { seg(ctx, loc(-wH / 2 - 1, -3), loc(wH / 2 + 1, -3), 5.5, OUT); seg(ctx, loc(-wH / 2 - 0.5, -3), loc(wH / 2 + 0.5, -3), 3.8, look.belt); }
  if (look.sash) { seg(ctx, loc(-wH / 2 - 1, -1), loc(wH / 2 + 1, -2), 6.5, OUT); seg(ctx, loc(-wH / 2, -1), loc(wH / 2, -2), 4.8, look.sash); }
  if (look.highCollar) { const c1 = loc(-wC / 2 + 2, -T + 2), c2 = loc(wC / 2 - 1, -T + 1); const c3 = add(J.neck, rot([7, -5], J.upAng)), c4 = add(J.neck, rot([-6, -6], J.upAng)); poly(ctx, [c1, c2, c3, c4]); fillOut(ctx, P.c(look.highCollar), P.lw); }
}

// 背部物件:葫芦 / 背剑 / 卷轴
function drawBack(ctx, J, look, P, front) {
  const b = look.back; if (!b) return;
  const a = J.upAng;
  const at = (x, y) => add(J.hip, rot([x, y], a));
  if (b === 'gourd' && !front) {
    ctx.beginPath(); ctx.arc(...at(-13, -12), 12, 0, 7); fillOut(ctx, P.c('#c9a978'), P.lw);
    ctx.beginPath(); ctx.arc(...at(-13, -30), 8, 0, 7); fillOut(ctx, P.c('#c9a978'), P.lw);
    if (!P.flat) { ctx.beginPath(); ctx.arc(...at(-13, -39), 3, 0, 7); fillOut(ctx, '#6a4a30', 1.2); seg(ctx, at(-19, -21), at(-7, -21), 2, '#8a2a20'); }
  }
  if (b === 'gourd' && front && !P.flat) { seg(ctx, at(-8, -T0(J) + 2), at(9, -6), 4, OUT); seg(ctx, at(-8, -T0(J) + 2), at(9, -6), 2.4, '#6a4a34'); }
  if (b === 'sword' && !front && !look.swordDrawn) {
    const p1 = at(-14, -4), p2 = at(4, -48);
    seg(ctx, p1, p2, 5.4, OUT); seg(ctx, p1, p2, 3.6, P.c('#3a2c4a')); seg(ctx, at(1, -42), p2, 3.4, P.c('#e8e8f0'));
  }
  if (b === 'scroll' && !front) { const p = at(-12, -6); ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(a * D2R + 0.4); ctx.beginPath(); ctx.roundRect(-5, -14, 10, 28, 4); fillOut(ctx, P.c('#c84030'), P.lw); ctx.restore(); }
}
const T0 = (J) => J.T;

// ---------------------------------------------------------------- 飘带链(围巾 / 马尾 / 护额尾)
function chainStep(rs, key, anchor, len, n, wind) {
  let ch = rs.chains[key];
  if (!ch || ch.length !== n) { ch = rs.chains[key] = Array.from({ length: n }, (_, i) => ({ x: anchor[0] - i * len, y: anchor[1], px: anchor[0] - i * len, py: anchor[1] })); }
  ch[0].x = anchor[0]; ch[0].y = anchor[1];
  for (let i = 1; i < n; i++) {
    const p = ch[i]; const vx = (p.x - p.px) * 0.86, vy = (p.y - p.py) * 0.86;
    p.px = p.x; p.py = p.y; p.x += vx + wind; p.y += vy + 0.35;
  }
  for (let k = 0; k < 2; k++) for (let i = 1; i < n; i++) {
    const a = ch[i - 1], b = ch[i]; const dx = b.x - a.x, dy = b.y - a.y; const d = Math.hypot(dx, dy) || 1; const f = (d - len) / d;
    b.x -= dx * f; b.y -= dy * f;
  }
  return ch;
}
// 链条在世界坐标里模拟,绘制时转换回局部坐标
function drawChain(ctx, ch, toLocal, w0, w1, color, P) {
  const pts = ch.map((p) => toLocal(p.x, p.y));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const w = w0 + (w1 - w0) * (i / pts.length);
      seg(ctx, pts[i - 1], pts[i], pass ? w : w + OW * 2, pass ? color : (P.flat ? color : OUT));
    }
  }
}

// ---------------------------------------------------------------- 主绘制
// x,y:世界坐标脚底;face:±1;opt: { rs, tint, alpha, grounded, lie, eyeRed, expr, shout, hollow, weapon(bool), wscale, wind }
export function drawFigure(ctx, x, y, face, look, pose, opt = {}) {
  const s = look.scale || 1;
  const J = solve(pose, look);
  let oy = opt.grounded ? groundShift(J, opt.lie) : -(BONE.thigh + BONE.shin) * 0.95 + (pose.dy || 0);
  const tint = opt.tint;
  const P = {
    c: tint ? () => tint : (v) => v,
    flat: !!tint, lw: tint ? 0 : OW,
    expr: opt.expr, shout: opt.shout, eyeRed: opt.eyeRed, hollow: opt.hollow,
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face * s, s);
  ctx.translate(0, oy);
  if (opt.alpha !== undefined) ctx.globalAlpha *= opt.alpha;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const rs = opt.rs;
  const sway = rs ? (rs.sway || 0) : 0;
  const toWorld = (p) => [x + p[0] * face * s, y + (p[1] + oy) * s];
  const toLocal = (wx, wy) => [(wx - x) / (face * s), (wy - y) / s - oy];

  // 飘带(世界坐标模拟)
  const chains = [];
  if (rs && !opt.noChain) {
    rs.chains = rs.chains || {};
    const wind = -face * (0.25 + Math.abs(sway) * 0.02);
    const headAng = J.upAng + J.h;
    const hpos = (lx, ly) => toWorld(add(J.headC, rot([lx, ly], headAng)));
    if (look.headband?.tails) chains.push([chainStep(rs, 'hb', hpos(-11, -3), 4.2 * s, 5, wind), 3, 2, look.headband.band]);
    if (look.ponytail) chains.push([chainStep(rs, 'pt', hpos(-9, 6), 4.5 * s, look.ponytail.n || 6, wind * 0.6), 5, 2, look.hair]);
    if (look.scarf) chains.push([chainStep(rs, 'sc', toWorld(add(J.neck, rot([-3, 3], J.upAng))), 6 * s, look.scarf.n || 7, wind * 1.4), 6, 4, look.scarf.color]);
    if (look.sashTail) chains.push([chainStep(rs, 'st', toWorld(add(J.hip, rot([-8, -2], J.r))), 5 * s, 5, wind), 4, 3, look.sash]);
  }
  for (const [ch, w0, w1, col] of chains) drawChain(ctx, ch, toLocal, w0, w1, P.c(col), P);

  drawBack(ctx, J, look, P, false);
  drawCoatBack(ctx, J, look, P, sway);
  const sk = look.skin;
  const backTone = (c) => P.c(shade(c, -0.22));
  // 后臂
  drawArm(ctx, J, J.B, look, P, backTone, true);
  // 腿
  drawLeg(ctx, J, J.K, look, P, backTone);
  drawLeg(ctx, J, J.F, look, P, (c) => P.c(c));
  if (look.pantsStyle === 'hakama' && !P.flat) drawHakamaCrotch(ctx, J, look, P);
  drawTorso(ctx, J, look, P);
  drawCloak(ctx, J, look, P, sway);
  drawBack(ctx, J, look, P, true);
  // 颈
  seg(ctx, add(J.neck, rot([0, 4], J.upAng)), add(J.headC, rot([-1, 8], J.upAng + J.h)), 8.4, OUT);
  seg(ctx, add(J.neck, rot([0, 4], J.upAng)), add(J.headC, rot([-1, 8], J.upAng + J.h)), 5.6, P.c(sk));
  drawHead(ctx, J, look, P);
  drawCoatFront(ctx, J, look, P, sway);
  // 前臂 + 武器
  const wp = look.weapon;
  const holding = wp && (opt.weapon ?? look.holdWeapon);
  if (holding && wp.type !== 'bow') drawWeapon(ctx, wp, J.A.h, J.A.fa + (pose.w || 0), P, opt.wscale || 1);
  drawArm(ctx, J, J.A, look, P, (c) => P.c(c), false);
  if (holding && wp.type === 'bow') drawWeapon(ctx, wp, J.B.h, J.B.fa + 90, P);
  ctx.restore();
  if (rs && holding && opt.trail) {
    const tp = weaponTip(J, look, { w: pose.w, ws: opt.wscale || 1 });
    rs.tip = [toWorld([tp[0], tp[1]]), toWorld([tp[2], tp[3]])];
  } else if (rs) rs.tip = null;
  if (rs) rs.J = J, rs.toWorld = toWorld;
  return J;
}

function drawArm(ctx, J, A, look, P, tone, back) {
  const sl = look.sleeve || 'long';
  const skin = tone(look.skin);
  const sc = tone(look.sleeveColor || look.top);
  const wA = 7 * (look.build?.armW || 1);
  const pts = [J.shoulder, A.e, A.h];
  limb(ctx, pts, wA, skin, P);
  if (!P.flat) {
    if (sl === 'long') limb(ctx, [J.shoulder, A.e, mix(A.e, A.h, 0.82)], wA + 0.6, sc, { flat: true });
    else if (sl === 'short') limb(ctx, [J.shoulder, mix(J.shoulder, A.e, 0.75)], wA + 1.2, sc, { flat: true });
    else if (sl === 'wide') { limb(ctx, [J.shoulder, A.e], wA + 5, sc, { flat: true }); limb(ctx, [A.e, mix(A.e, A.h, 0.45)], wA + 6, sc, { flat: true }); }
    if (look.coat?.sleeves) limb(ctx, [J.shoulder, mix(J.shoulder, A.e, 0.9)], wA + 5, tone(look.coat.color), { flat: true });
    if (look.gloves) limb(ctx, [mix(A.e, A.h, 0.6), A.h], wA + 0.4, tone(look.gloves), { flat: true });
    if (look.bandage) limb(ctx, [mix(A.e, A.h, 0.35), A.h], wA + 0.2, tone('#ece6dc'), { flat: true });
  }
  ctx.beginPath(); ctx.arc(A.h[0], A.h[1], 4, 0, 7); fillOut(ctx, look.gloves ? tone(look.gloves) : skin, P.lw);
}
function drawLeg(ctx, J, L, look, P, tone) {
  const hk = look.pantsStyle === 'hakama';
  const wT = (hk ? 13 : 9) * (look.build?.legW || 1), wS = (hk ? 12.5 : 7.6) * (look.build?.legW || 1);
  const pc = tone(look.pants);
  const ank = mix(L.k, L.f, hk ? 0.9 : 0.97);
  limb(ctx, [J.hip, L.k], wT, pc, P);
  if (look.pantsStyle === 'shorts') { limb(ctx, [L.k, L.f], 7, tone(look.skin), P); limb(ctx, [J.hip, mix(J.hip, L.k, 1.05)], wT + 1, pc, { flat: true }); }
  else limb(ctx, [L.k, ank], wS, pc, P);
  if (look.legWrap && !P.flat) limb(ctx, [mix(L.k, L.f, 0.55), L.f], 7.5, tone(look.legWrap), P);
  // 脚
  const fa = L.sa + 90;
  const toe = [L.f[0] + sin(fa) * 10, L.f[1] + cos(fa) * 10];
  const shoe = look.shoe || '#2a2a3a';
  if (look.shoeStyle === 'tabi') { limb(ctx, [L.f, toe], 5.4, tone('#f4f4f4'), P); seg(ctx, mix(L.f, toe, 0) , toe, 1.4, tone('#8a6a40')); }
  else if (look.shoeStyle === 'sandal') { limb(ctx, [L.f, toe], 5.2, tone(look.skin), P); seg(ctx, mix(L.f, toe, 0.1), mix(L.f, toe, 0.7), 5.6, tone(shoe)); }
  else limb(ctx, [L.f, toe], 6, tone(shoe), P);
}
function drawHakamaCrotch(ctx, J, look, P) {
  const pts = [add(J.hip, rot([-9, -2], J.r)), add(J.hip, rot([9, -2], J.r)), mix(J.hip, J.F.k, 0.6), mix(J.hip, J.K.k, 0.6)];
  poly(ctx, pts); ctx.fillStyle = P.c(look.pants); ctx.fill();
}

// ---------------------------------------------------------------- 头像(选人 / 状态栏 / cut-in)
export const PORTRAIT_POSE = { r: 0, t: 4, h: 4, a1: 20, a2: 40, b1: 10, b2: 30, f1: 10, f2: 5, k1: -8, k2: 4, w: 100, dx: 0, dy: 0 };
export function drawBust(ctx, look, cx, cy, size, opt = {}) {
  // 以头部为中心放大绘制上半身,size = 头部到胸口的显示高度
  const k = size / 60;
  const J = solve(PORTRAIT_POSE, look);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k * (opt.flip ? -1 : 1), k);
  const hc = J.headC;
  // 非着地模式下髋部位于 y - 0.95*(大腿+小腿);把头心放到 (0,-12)
  drawFigure(ctx, -hc[0], -hc[1] + (BONE.thigh + BONE.shin) * 0.95 - 12, 1, { ...look, scale: 1 }, PORTRAIT_POSE, { expr: opt.expr, eyeRed: opt.eyeRed, hollow: opt.hollow, weapon: false, noChain: true });
  ctx.restore();
}
