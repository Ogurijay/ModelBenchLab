// 程序化角色精灵:骨架姿势 → 带黑描边的像素风贴图。
// 原版 LF2 位图有版权且不可得,这里用“关节角度 + 部件外观”重建同等分辨率(约 80px 高)的侧视人物。
// 坐标:贴图本地原点在双脚中点,+x 朝面向方向,-y 向上。角度:0=朝下,90=朝前,180=朝上,-90=朝后。
import { DEG, shade, makeCanvas } from './util.js';

const OUT = '#0a0a12';
export const SPR_W = 144, SPR_H = 136, ORX = 72, ORY = 124;

const V = (a) => [Math.sin(a * DEG), Math.cos(a * DEG)];
const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
const mul = (p, k) => [p[0] * k, p[1] * k];

export const BASE_POSE = { t: 4, h: 0, fa: [25, 145], ba: [8, 130], fl: [14, -6], bl: [-10, -14], r: 0, hand: 'fist', bhand: 'fist', eye: 'n', x: 0, dy: 0 };

// ---------------------------------------------------------------- 姿势求解(正向运动学 + 整体旋转 + 落地)
export function solvePose(pose, look) {
  const p = { ...BASE_POSE, ...pose };
  const k = look.size || 1;
  const L = {
    thigh: 13.6 * k * (look.legK || 1), shin: 13.6 * k * (look.legK || 1), torso: 21 * k * (look.torsoK || 1), neck: 2.2 * k, R: 10.4 * k * (look.headK || 1),
    uarm: 11.5 * k, farm: 10.5 * k, foot: 6.5 * k,
  };
  const J = { L, p };
  J.hip = [p.x, 0];
  const tv = V(180 - p.t);
  J.tv = tv;
  J.sh = add(J.hip, mul(tv, L.torso));
  const hv = V(180 - p.t - p.h);
  J.neck = add(J.sh, mul(tv, L.neck));
  J.head = add(J.neck, mul(hv, L.R * 0.92));
  J.headAng = p.t + p.h;
  J.shF = add(J.sh, [0.6 * k, 1.2 * k]);
  J.shB = add(J.sh, [-1.6 * k, 0.6 * k]);
  J.elF = add(J.shF, mul(V(p.fa[0]), L.uarm));
  J.haF = add(J.elF, mul(V(p.fa[1]), L.farm));
  J.elB = add(J.shB, mul(V(p.ba[0]), L.uarm));
  J.haB = add(J.elB, mul(V(p.ba[1]), L.farm));
  J.hpF = add(J.hip, [1.6 * k, 0.5]);
  J.hpB = add(J.hip, [-1.6 * k, 0.5]);
  J.knF = add(J.hpF, mul(V(p.fl[0]), L.thigh));
  J.ftF = add(J.knF, mul(V(p.fl[1]), L.shin));
  J.toeF = add(J.ftF, mul(V(p.fl[2] ?? p.fl[1] + 90), L.foot));
  J.knB = add(J.hpB, mul(V(p.bl[0]), L.thigh));
  J.ftB = add(J.knB, mul(V(p.bl[1]), L.shin));
  J.toeB = add(J.ftB, mul(V(p.bl[2] ?? p.bl[1] + 90), L.foot));
  J.handAngF = p.fa[1];
  J.handAngB = p.ba[1];

  const KEYS = ['hip', 'sh', 'neck', 'head', 'shF', 'shB', 'elF', 'haF', 'elB', 'haB', 'hpF', 'hpB', 'knF', 'ftF', 'toeF', 'knB', 'ftB', 'toeB'];
  if (p.r) {
    const c = Math.cos(p.r * DEG), s = Math.sin(p.r * DEG);
    const o = J.hip;
    for (const key of KEYS) {
      const q = J[key];
      const dx = q[0] - o[0], dy = q[1] - o[1];
      J[key] = [o[0] + dx * c - dy * s, o[1] + dx * s + dy * c];
    }
    J.headAng += p.r;
    J.rot = p.r;
  } else J.rot = 0;
  // 落地:最低点贴到 y=0(空中姿势同样以最低点为锚,与 LF2 centery 习惯一致)
  const RAD = { head: L.R, haF: 3, haB: 3, ftF: 3, ftB: 3, toeF: 2.5, toeB: 2.5, knF: 4, knB: 4, hip: 6, sh: 7, elF: 3, elB: 3 };
  let maxY = -1e9;
  for (const key of KEYS) {
    const r = RAD[key] ?? 2;
    if (!p.r && (key === 'head' || key === 'sh' || key === 'hip')) continue;
    maxY = Math.max(maxY, J[key][1] + r);
  }
  const dy = -maxY + (p.dy || 0);
  for (const key of KEYS) J[key] = [J[key][0], J[key][1] + dy];
  return J;
}

// ---------------------------------------------------------------- 绘制原语
function seg(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
function poly(ctx, pts, smooth) {
  ctx.beginPath();
  if (!smooth) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  } else {
    const n = pts.length;
    const mid = (i) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
    const m0 = mid(n - 1);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const m = mid(i); ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
  }
  ctx.closePath();
}
function fillOut(ctx, col, lw = 2) {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = col; ctx.fill();
}
// 带描边的多段肢体:先描所有段的黑边,再填色,再上明暗
function limb(ctx, pts, widths, cols) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT;
  for (let i = 0; i < pts.length - 1; i++) { ctx.lineWidth = widths[i] + 2.2; seg(ctx, pts[i], pts[i + 1]); }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], w = widths[i], c = cols[i];
    ctx.strokeStyle = c; ctx.lineWidth = w; seg(ctx, a, b);
    // 明暗:光从左上
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    if (nx + ny > 0) { nx = -nx; ny = -ny; }
    ctx.lineWidth = Math.max(1, w * 0.3);
    ctx.strokeStyle = shade(c, -0.28);
    seg(ctx, add(a, [-nx * w * 0.3, -ny * w * 0.3]), add(b, [-nx * w * 0.3, -ny * w * 0.3]));
    ctx.strokeStyle = shade(c, 0.22);
    ctx.lineWidth = Math.max(1, w * 0.26);
    seg(ctx, add(a, [nx * w * 0.26, ny * w * 0.26]), add(b, [nx * w * 0.26, ny * w * 0.26]));
  }
}
function dot(ctx, p, r, col, out = true) {
  ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
  if (out) { ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = col; ctx.fill();
}

// ---------------------------------------------------------------- 发型 / 头部(头部本地坐标,单位 R)
const HAIR = {
  spiky: [[0.78, -0.42], [0.62, -0.98], [0.25, -1.25], [-0.05, -1.02], [-0.42, -1.42], [-0.62, -0.98], [-1.08, -1.2], [-1.02, -0.7], [-1.5, -0.62], [-1.08, -0.25], [-1.38, 0.12], [-0.98, 0.28], [-0.95, 0.62], [-0.52, 0.38], [-0.3, -0.08], [0.22, -0.42]],
  messy: [[0.98, -0.3], [1.12, -0.78], [0.62, -0.86], [0.62, -1.32], [0.12, -1.06], [-0.2, -1.48], [-0.46, -1.02], [-0.98, -1.18], [-0.96, -0.72], [-1.32, -0.38], [-1.0, 0.0], [-1.15, 0.46], [-0.62, 0.42], [-0.36, -0.06], [0.3, -0.36]],
  swept: [[0.82, -0.48], [0.42, -1.06], [-0.3, -1.16], [-1.0, -1.0], [-1.72, -0.92], [-1.22, -0.56], [-1.85, -0.36], [-1.16, -0.1], [-1.55, 0.26], [-0.92, 0.36], [-0.42, -0.06], [0.2, -0.46]],
  flame: [[0.8, -0.5], [0.7, -1.2], [0.25, -0.95], [0.0, -1.62], [-0.35, -1.02], [-0.85, -1.5], [-0.9, -0.85], [-1.6, -1.0], [-1.2, -0.45], [-1.7, -0.2], [-1.1, 0.0], [-1.3, 0.4], [-0.75, 0.38], [-0.4, -0.05], [0.2, -0.46]],
  short: [[0.88, -0.36], [0.72, -0.92], [0.0, -1.16], [-0.78, -0.96], [-1.12, -0.3], [-1.02, 0.38], [-0.6, 0.48], [-0.46, 0.0], [0.12, -0.36]],
  long: [[0.86, -0.42], [0.6, -1.02], [-0.2, -1.16], [-0.92, -0.86], [-1.22, 0.0], [-1.28, 1.05], [-1.02, 1.95], [-0.52, 1.55], [-0.5, 0.5], [-0.36, 0.0], [0.16, -0.42]],
  longwild: [[0.9, -0.4], [0.72, -1.1], [-0.1, -1.28], [-0.95, -1.05], [-1.5, -0.6], [-1.32, 0.2], [-1.7, 0.75], [-1.2, 1.1], [-1.4, 1.75], [-0.75, 1.5], [-0.5, 0.5], [-0.36, 0.0], [0.16, -0.42]],
  ponytail: [[0.86, -0.38], [0.68, -0.98], [-0.1, -1.16], [-0.86, -0.9], [-1.15, -0.45], [-1.7, -0.2], [-1.85, 0.6], [-1.45, 1.2], [-1.4, 0.4], [-1.05, 0.25], [-0.6, 0.42], [-0.44, 0.0], [0.14, -0.38]],
  mohawk: [[0.5, -0.86], [0.42, -1.45], [0.0, -1.3], [-0.38, -1.55], [-0.7, -1.2], [-1.1, -1.25], [-1.0, -0.7], [-0.6, -0.9], [-0.1, -0.92]],
  topknot: [[0.85, -0.38], [0.66, -0.96], [0.15, -1.12], [-0.2, -1.2], [-0.25, -1.62], [-0.75, -1.62], [-0.72, -1.05], [-1.12, -0.36], [-1.0, 0.36], [-0.6, 0.45], [-0.46, 0.0], [0.12, -0.36]],
  wild: [[0.95, -0.25], [1.2, -0.65], [0.7, -0.75], [0.85, -1.25], [0.25, -1.0], [0.1, -1.55], [-0.35, -1.05], [-0.75, -1.5], [-0.85, -0.95], [-1.5, -1.05], [-1.15, -0.5], [-1.65, -0.15], [-1.1, 0.1], [-1.3, 0.6], [-0.65, 0.42], [-0.36, -0.04], [0.32, -0.32]],
  bowl: [[0.95, -0.15], [0.85, -0.85], [0.1, -1.18], [-0.8, -0.98], [-1.15, -0.25], [-1.05, 0.45], [-0.55, 0.45], [-0.48, 0.05], [0.4, -0.08]],
};

function drawHead(ctx, look, J, eye) {
  const R = J.L.R;
  const [hx, hy] = J.head;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(J.headAng * DEG);
  const P = (x, y) => [x * R, y * R];
  const skin = look.skin;
  const hs = look.hair || 'short';
  const hairCol = look.hairCol || '#222';
  // 后侧长发先画(在脸后)
  // 脸
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.moveTo(R * 0.95, R * 0.35); ctx.arc(R * 0.5, R * 0.52, R * 0.48, 0, Math.PI * 2);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(R * 0.5, R * 0.52, R * 0.48, 0, Math.PI * 2); ctx.fill();
  // 后脑阴影
  ctx.fillStyle = shade(skin, -0.2);
  ctx.beginPath(); ctx.arc(-R * 0.15, R * 0.1, R * 0.82, Math.PI * 0.55, Math.PI * 1.3); ctx.fill();
  if (look.skinMark) { ctx.fillStyle = look.skinMark; ctx.beginPath(); ctx.arc(R * 0.1, R * 0.3, R * 0.35, 0, 6.3); ctx.fill(); }

  // 发型 / 头饰
  const drawHairPoly = (pts, col, smooth = false) => { poly(ctx, pts.map(([x, y]) => P(x, y)), smooth); fillOut(ctx, col); };
  if (hs === 'ninja' || hs === 'hood' || hs === 'helmet' || hs === 'mask_full') {
    // 整头包裹类
  } else if (hs !== 'bald' && HAIR[hs]) {
    drawHairPoly(HAIR[hs], hairCol, hs === 'short' || hs === 'long' || hs === 'bowl' || hs === 'ponytail');
    // 发丝高光
    ctx.strokeStyle = shade(hairCol, 0.3); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(...P(0.3, -0.85)); ctx.quadraticCurveTo(...P(-0.3, -0.98), ...P(-0.75, -0.7)); ctx.stroke();
  }
  if (hs === 'bald') {
    ctx.fillStyle = shade(skin, 0.35);
    ctx.beginPath(); ctx.ellipse(-R * 0.2, -R * 0.6, R * 0.3, R * 0.15, -0.3, 0, 6.3); ctx.fill();
  }
  if (hs === 'ear') { /* no-op */ }
  // 耳朵
  if (!['long', 'longwild', 'ninja', 'hood', 'helmet', 'mask_full'].includes(hs)) {
    ctx.beginPath(); ctx.arc(-R * 0.32, R * 0.16, R * 0.15, 0, Math.PI * 2);
    ctx.strokeStyle = shade(skin, -0.3); ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = shade(skin, -0.06); ctx.fill();
  }
  if (hs === 'helmet') {
    const metal = look.helmetCol || '#b8c0cc';
    drawHairPoly([[1.0, -0.15], [0.9, -0.88], [0.15, -1.22], [-0.75, -1.02], [-1.14, -0.3], [-1.08, 0.6], [-0.6, 0.82], [-0.25, 0.42], [0.55, 0.22], [1.02, 0.25]], metal, true);
    ctx.strokeStyle = shade(metal, 0.45); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(-R * 0.1, -R * 0.2, R * 0.75, Math.PI * 1.15, Math.PI * 1.6); ctx.stroke();
    // 面甲缝
    ctx.fillStyle = '#111'; ctx.fillRect(R * 0.3, -R * 0.18, R * 0.72, R * 0.22);
    if (look.plume) { drawHairPoly([[-0.1, -1.15], [-0.4, -1.65], [-1.2, -1.55], [-1.6, -0.9], [-1.0, -1.05]], look.plume); }
  }
  if (hs === 'ninja') {
    const cloth = look.hoodCol || '#2a2550';
    ctx.beginPath(); ctx.arc(0, 0, R * 1.04, 0, Math.PI * 2); fillOut(ctx, cloth);
    // 眼带
    ctx.fillStyle = skin; ctx.fillRect(R * 0.15, -R * 0.38, R * 0.88, R * 0.4);
    // 头巾尾
    drawHairPoly([[-0.9, -0.3], [-1.7, -0.55], [-1.9, -0.1], [-1.55, 0.05], [-1.9, 0.35], [-1.0, 0.1]], cloth);
  }
  if (hs === 'hood') {
    const cloth = look.hoodCol || '#3a2d6a';
    drawHairPoly([[1.05, -0.1], [0.95, -0.95], [0.25, -1.32], [-0.6, -1.42], [-1.55, -1.25], [-1.2, -0.5], [-1.25, 0.9], [-0.7, 1.1], [-0.3, 0.45], [0.55, 0.1], [0.95, 0.35], [1.15, 0.1]], cloth);
    ctx.fillStyle = shade(cloth, -0.45);
    ctx.beginPath(); ctx.moveTo(...P(0.95, -0.2)); ctx.lineTo(...P(0.2, -0.35)); ctx.lineTo(...P(0.4, 0.15)); ctx.lineTo(...P(0.95, 0.25)); ctx.fill();
  }
  if (look.headband) {
    ctx.strokeStyle = OUT; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(...P(0.98, -0.42)); ctx.lineTo(...P(-1.02, -0.52)); ctx.stroke();
    ctx.strokeStyle = look.headband; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(...P(0.98, -0.42)); ctx.lineTo(...P(-1.02, -0.52)); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...P(-0.95, -0.5)); ctx.lineTo(...P(-1.7, -0.2)); ctx.moveTo(...P(-0.95, -0.5)); ctx.lineTo(...P(-1.6, 0.15)); ctx.stroke();
  }
  if (look.cap) {
    drawHairPoly([[0.92, -0.45], [0.75, -1.0], [0.0, -1.2], [-0.8, -1.0], [-1.08, -0.45]], look.cap, true);
    drawHairPoly([[0.6, -0.5], [1.55, -0.38], [1.5, -0.25], [0.6, -0.3]], shade(look.cap, -0.2));
  }
  if (look.hat) { // 宽檐帽 / 羽毛帽
    drawHairPoly([[1.5, -0.55], [0.75, -0.62], [0.65, -1.25], [-0.2, -1.5], [-0.9, -1.2], [-1.0, -0.65], [-1.55, -0.5], [-1.5, -0.38], [1.5, -0.42]], look.hat);
    if (look.feather) drawHairPoly([[-0.7, -1.2], [-1.6, -1.9], [-1.9, -1.7], [-1.0, -1.05]], look.feather);
  }
  // 眼睛
  const ex = R * 0.46, ey = -R * 0.06;
  if (hs !== 'helmet') {
    ctx.fillStyle = '#000';
    if (eye === 'x') { // 受伤闭眼 ><
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(ex - 1.5, ey - 2); ctx.lineTo(ex + 1.2, ey); ctx.lineTo(ex - 1.5, ey + 1.5); ctx.stroke();
    } else if (eye === 'c') {
      ctx.fillRect(ex - 1.5, ey, 3, 1.2);
    } else if (eye === 'd') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ex, ey, 1.6, 0, 5.5); ctx.stroke();
    } else {
      if (look.eyeCol) { ctx.fillStyle = '#fff'; ctx.fillRect(ex - 1.2, ey - 2.2, 3.2, 4); ctx.fillStyle = look.eyeCol; ctx.fillRect(ex, ey - 1.8, 1.8, 3.4); }
      else ctx.fillRect(ex - 0.6, ey - 2, 2.2, 3.8);
    }
    // 眉
    if (hs !== 'ninja' && hs !== 'hood') {
      ctx.strokeStyle = look.browCol || shade(hairCol, -0.2); ctx.lineWidth = 1.4;
      ctx.beginPath();
      if (eye === 'a') { ctx.moveTo(ex - 2.5, ey - 4.4); ctx.lineTo(ex + 2.6, ey - 2.6); } else { ctx.moveTo(ex - 2.2, ey - 3.6); ctx.lineTo(ex + 2.6, ey - 3.9); }
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = look.eyeGlow || '#ff3030'; ctx.fillRect(ex, ey - 1.3, 2.6, 1.6);
  }
  // 嘴 / 胡子 / 面罩
  if (look.mask) {
    drawHairPoly([[1.05, 0.05], [0.95, 0.85], [0.2, 0.98], [-0.3, 0.55], [-0.2, 0.15]], look.mask);
  } else if (hs !== 'ninja' && hs !== 'helmet') {
    ctx.fillStyle = shade(skin, -0.5);
    if (eye === 'x' || eye === 'd') ctx.fillRect(R * 0.62, R * 0.5, 2.5, 2); else ctx.fillRect(R * 0.66, R * 0.52, 2.2, 1.1);
  }
  if (look.beard) drawHairPoly([[0.95, 0.35], [0.85, 0.95], [0.2, 1.25], [-0.25, 0.75], [-0.2, 0.3], [0.3, 0.55]], look.beard, true);
  if (look.mustache) { ctx.fillStyle = look.mustache; ctx.fillRect(R * 0.55, R * 0.36, R * 0.45, 1.6); }
  if (look.scar) { ctx.strokeStyle = '#a03030'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(R * 0.2, -R * 0.4); ctx.lineTo(R * 0.55, R * 0.25); ctx.stroke(); }
  ctx.restore();
}

// ---------------------------------------------------------------- 躯干
function torsoPts(J, look, k) {
  const tv = J.tv;
  const rot = J.rot * DEG;
  const c = Math.cos(rot), s = Math.sin(rot);
  const rv = (v) => [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
  const up = rv(tv);
  const pf = [-up[1], up[0]];
  const bulk = look.bulk || 1;
  const sh = J.sh, hip = J.hip;
  const at = (base, u, f) => [base[0] + up[0] * u + pf[0] * f, base[1] + up[1] * u + pf[1] * f];
  const cw = 9.4 * k * bulk, ww = 7.0 * k * bulk;
  return {
    up, pf, at,
    body: [at(sh, -0.5, -cw * 0.95), at(sh, 0.8, -cw * 0.2), at(sh, 0.5, cw * 0.75), at(sh, -5 * k, cw * 1.02), at(hip, 3 * k, ww * 1.05), at(hip, -1, ww), at(hip, -1, -ww * 1.05), at(hip, 6 * k, -ww * 1.0), at(sh, -6 * k, -cw * 0.98)],
  };
}

function drawTorso(ctx, look, J) {
  const k = look.size || 1;
  const T = torsoPts(J, look, k);
  const shirt = look.shirt || '#3366cc';
  const bare = look.top === 'none';
  const col = bare ? look.skin : shirt;
  // 披风(身后)
  if (look.cape) {
    const a = T.at(J.sh, 0, -6 * k), b = T.at(J.sh, 0, 4 * k);
    const sway = (J.p.cape ?? 0);
    const lowB = [J.hip[0] - 14 * k - sway, J.hip[1] + 14 * k];
    const lowA = [J.hip[0] - 4 * k - sway * 0.5, J.hip[1] + 16 * k];
    poly(ctx, [a, b, lowA, lowB], false); fillOut(ctx, look.cape);
    ctx.fillStyle = shade(look.cape, -0.3);
    poly(ctx, [a, T.at(J.sh, -2, -2 * k), [lowB[0] + 4, lowB[1] - 2], lowB], false); ctx.fill();
  }
  // 长袍下摆(盖住大腿)
  if (look.robe) {
    const kf = J.knF, kb = J.knB;
    const hemF = [kf[0] + 3 * k, kf[1] + (look.robeLen || 6) * k], hemB = [kb[0] - 3 * k, kb[1] + (look.robeLen || 6) * k];
    const wf = T.at(J.hip, 2 * k, 7.5 * k), wb = T.at(J.hip, 2 * k, -7.5 * k);
    poly(ctx, [wb, wf, [Math.max(hemF[0], wf[0] + 2), hemF[1]], [Math.min(hemB[0], wb[0] - 2), hemB[1]]], false);
    fillOut(ctx, look.robe);
    ctx.fillStyle = shade(look.robe, -0.25);
    poly(ctx, [wb, T.at(J.hip, 2 * k, -2), [Math.min(hemB[0], wb[0] - 2) + 5, hemB[1]], [Math.min(hemB[0], wb[0] - 2), hemB[1]]], false); ctx.fill();
  }
  // 骨盆(裤)
  ctx.save();
  ctx.beginPath();
  const pc = T.at(J.hip, 1.5 * k, 0);
  ctx.ellipse(pc[0], pc[1], 8 * k * (look.bulk || 1), 6 * k, Math.atan2(T.pf[1], T.pf[0]), 0, Math.PI * 2);
  fillOut(ctx, look.robe || look.pants || '#333');
  ctx.restore();
  // 上身
  poly(ctx, T.body, true);
  fillOut(ctx, col);
  // 明暗:后背暗面
  ctx.save();
  poly(ctx, T.body, true); ctx.clip();
  ctx.fillStyle = shade(col, -0.3);
  poly(ctx, [T.at(J.sh, 2, -20), T.at(J.sh, 2, -4.5 * k), T.at(J.hip, 0, -3.5 * k), T.at(J.hip, -4, -20)], false); ctx.fill();
  ctx.fillStyle = shade(col, 0.2);
  poly(ctx, [T.at(J.sh, -2, 4 * k), T.at(J.sh, -2, 9 * k), T.at(J.hip, 6 * k, 8 * k), T.at(J.hip, 6 * k, 5 * k)], false); ctx.fill();
  if (bare) { // 肌肉线
    ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 1;
    ctx.beginPath(); const m1 = T.at(J.sh, -6 * k, 2 * k), m2 = T.at(J.sh, -6 * k, 7 * k); ctx.moveTo(...m1); ctx.lineTo(...m2); ctx.stroke();
    const a1 = T.at(J.hip, 7 * k, 3 * k), a2 = T.at(J.hip, 3 * k, 3 * k); ctx.beginPath(); ctx.moveTo(...a1); ctx.lineTo(...a2); ctx.stroke();
  }
  if (look.vest) { // 背心 / 外套前襟
    ctx.fillStyle = look.vest;
    poly(ctx, [T.at(J.sh, 1, -10), T.at(J.sh, 1, 1.5 * k), T.at(J.hip, 2, 0.5 * k), T.at(J.hip, 2, -10)], false); ctx.fill();
    ctx.fillStyle = shade(look.vest, -0.3);
    poly(ctx, [T.at(J.sh, 1, -10), T.at(J.sh, 1, -4 * k), T.at(J.hip, 2, -3.5 * k), T.at(J.hip, 2, -10)], false); ctx.fill();
  }
  if (look.armor) { // 胸甲
    const m = look.armor;
    ctx.fillStyle = m;
    poly(ctx, [T.at(J.sh, 1, -12), T.at(J.sh, 1, 12), T.at(J.hip, 5 * k, 12), T.at(J.hip, 5 * k, -12)], false); ctx.fill();
    ctx.fillStyle = shade(m, 0.4);
    poly(ctx, [T.at(J.sh, -2, 3 * k), T.at(J.sh, -2, 7 * k), T.at(J.hip, 8 * k, 6 * k), T.at(J.hip, 8 * k, 3 * k)], false); ctx.fill();
    ctx.fillStyle = shade(m, -0.35);
    poly(ctx, [T.at(J.sh, 0, -12), T.at(J.sh, 0, -4 * k), T.at(J.hip, 5 * k, -4 * k), T.at(J.hip, 5 * k, -12)], false); ctx.fill();
  }
  if (look.stripe) { // 胸前装饰条
    ctx.fillStyle = look.stripe;
    poly(ctx, [T.at(J.sh, -3 * k, 2 * k), T.at(J.sh, -3 * k, 5 * k), T.at(J.hip, 6 * k, 3 * k), T.at(J.hip, 6 * k, 1 * k)], false); ctx.fill();
  }
  ctx.restore();
  // 腰带
  if (look.belt) {
    const b1 = T.at(J.hip, 4 * k, -6.5 * k), b2 = T.at(J.hip, 4 * k, 6.5 * k);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = OUT; ctx.lineWidth = 4.2; seg(ctx, b1, b2);
    ctx.strokeStyle = look.belt; ctx.lineWidth = 2.4; seg(ctx, b1, b2);
    if (look.sash) { // 腰带尾巴
      const e = T.at(J.hip, 4 * k, -5 * k);
      ctx.lineCap = 'round'; ctx.strokeStyle = look.belt; ctx.lineWidth = 2;
      seg(ctx, e, [e[0] - 6, e[1] + 7]);
    }
  }
  if (look.scarf) {
    const n1 = T.at(J.sh, 0.5, -5 * k), n2 = T.at(J.sh, 0.5, 5 * k);
    ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 6; seg(ctx, n1, n2);
    ctx.strokeStyle = look.scarf; ctx.lineWidth = 4; seg(ctx, n1, n2);
    const tail = (J.p.cape ?? 0);
    ctx.lineWidth = 3; seg(ctx, n1, [n1[0] - 9 - tail, n1[1] + 3]);
  }
  return T;
}

// 背上的弓 / 剑鞘
function drawBackItem(ctx, look, J, T) {
  if (look.backItem === 'bow') {
    const a = T.at(J.sh, 2, -8), b = T.at(J.hip, 0, -9);
    ctx.lineCap = 'round'; ctx.strokeStyle = OUT; ctx.lineWidth = 4; seg(ctx, a, b);
    ctx.strokeStyle = look.bowCol || '#8a5a2a'; ctx.lineWidth = 2.2; seg(ctx, a, b);
  } else if (look.backItem === 'sword') {
    const a = T.at(J.sh, 6, -8), b = T.at(J.hip, -4, -4);
    ctx.lineCap = 'butt'; ctx.strokeStyle = OUT; ctx.lineWidth = 5; seg(ctx, a, b);
    ctx.strokeStyle = '#3a2a20'; ctx.lineWidth = 3; seg(ctx, a, b);
    ctx.strokeStyle = '#d8b040'; ctx.lineWidth = 4; const g = T.at(J.sh, 4, -8); seg(ctx, [g[0] - 3, g[1]], [g[0] + 3, g[1]]);
  } else if (look.backItem === 'quiver') {
    const a = T.at(J.sh, 3, -7), b = T.at(J.hip, 4, -8);
    ctx.lineCap = 'butt'; ctx.strokeStyle = OUT; ctx.lineWidth = 6; seg(ctx, a, b);
    ctx.strokeStyle = '#7a4a22'; ctx.lineWidth = 4; seg(ctx, a, b);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; seg(ctx, a, [a[0] - 2, a[1] - 5]); seg(ctx, [a[0] + 1.5, a[1]], [a[0] + 0.5, a[1] - 5]);
  }
}

function drawArm(ctx, look, sh, el, ha, handAng, back, hand) {
  const k = look.size || 1, bulk = look.bulk || 1;
  const d = back ? -0.2 : 0;
  const sk = shade(look.skin, d);
  const sleeve = shade(look.armArmor || look.sleeveCol || look.shirt || '#36c', d);
  const top = look.top || 'tshirt';
  let upCol = sk, foreCol = sk;
  if (top === 'tshirt') upCol = sleeve;
  else if (top === 'long' || top === 'robe') { upCol = sleeve; foreCol = sleeve; }
  if (look.armArmor) { upCol = sleeve; foreCol = sleeve; }
  // 短袖:上臂 60% 为袖
  if (top === 'tshirt') {
    const mid = [sh[0] + (el[0] - sh[0]) * 0.62, sh[1] + (el[1] - sh[1]) * 0.62];
    limb(ctx, [sh, mid, el, ha], [7.4 * k * bulk, 6.6 * k * bulk, 6 * k * bulk], [upCol, sk, foreCol]);
  } else limb(ctx, [sh, el, ha], [7.2 * k * bulk, 6.1 * k * bulk], [upCol, foreCol]);
  if (look.gloves) foreCol = shade(look.gloves, d);
  if (look.bracer) { // 护腕
    const w0 = [el[0] + (ha[0] - el[0]) * 0.45, el[1] + (ha[1] - el[1]) * 0.45];
    limb(ctx, [w0, ha], [6 * k], [shade(look.bracer, d)]);
  }
  if (look.pauldron && !back) dot(ctx, sh, 5.2 * k, shade(look.pauldron, d));
  const fistCol = look.gloves ? shade(look.gloves, d) : sk;
  if (hand === 'palm') {
    ctx.save(); ctx.translate(ha[0], ha[1]); ctx.rotate(-handAng * DEG + Math.PI);
    ctx.beginPath(); ctx.ellipse(0, -3.2, 2.6, 4.4, 0, 0, Math.PI * 2); fillOut(ctx, fistCol, 2);
    ctx.restore();
  } else dot(ctx, ha, 3.3 * k, fistCol);
}

function drawLeg(ctx, look, hp, kn, ft, toe, back) {
  const k = look.size || 1, bulk = look.bulk || 1;
  const d = back ? -0.2 : 0;
  const pants = shade(look.legArmor || look.pants || '#334', d);
  const shin = look.shorts ? shade(look.skin, d) : look.boots ? shade(look.boots, d) : pants;
  limb(ctx, [hp, kn, ft], [9.8 * k * bulk, 8 * k * bulk], [pants, shin]);
  if (look.kneepad) dot(ctx, kn, 3.4 * k, shade(look.kneepad, d));
  // 鞋
  const shoe = shade(look.shoes || '#222', d);
  const heel = [ft[0] - (toe[0] - ft[0]) * 0.25, ft[1] - (toe[1] - ft[1]) * 0.25];
  limb(ctx, [heel, toe], [5.2 * k], [shoe]);
}

// ---------------------------------------------------------------- 完整人物
export function drawFigure(ctx, look, J) {
  const p = J.p;
  const k = look.size || 1;
  // 后腿、后臂
  drawArm(ctx, look, J.shB, J.elB, J.haB, J.handAngB + J.rot, true, p.bhand);
  drawLeg(ctx, look, J.hpB, J.knB, J.ftB, J.toeB, true);
  if (look.hair === 'long' || look.hair === 'longwild') {
    // 长发在背后先垫一层,头部再覆盖
  }
  // 背饰 → 躯干
  const T0 = torsoPts(J, look, k);
  drawBackItem(ctx, look, J, T0);
  const T = drawTorso(ctx, look, J);
  if (!look.robe || look.robeOpen) drawLeg(ctx, look, J.hpF, J.knF, J.ftF, J.toeF, false);
  else drawLeg(ctx, look, J.hpF, J.knF, J.ftF, J.toeF, false);
  if (look.robe) { // 袍子前片盖住前大腿上半
    const wf = T.at(J.hip, 2 * k, 7.5 * k);
    const kf = J.knF;
    ctx.save();
    poly(ctx, [T.at(J.hip, 2 * k, -2), wf, [kf[0] + 3.5 * k, kf[1] + (look.robeLen || 6) * k], [kf[0] - 4 * k, kf[1] + (look.robeLen || 6) * k]], false);
    fillOut(ctx, look.robe);
    if (look.robeTrim) { ctx.strokeStyle = look.robeTrim; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(kf[0] - 3.5 * k, kf[1] + (look.robeLen || 6) * k - 1.5); ctx.lineTo(kf[0] + 3 * k, kf[1] + (look.robeLen || 6) * k - 1.5); ctx.stroke(); }
    ctx.restore();
  }
  drawHead(ctx, look, J, p.eye);
  drawArm(ctx, look, J.shF, J.elF, J.haF, J.handAngF + J.rot, false, p.hand);
  return T;
}

// ---------------------------------------------------------------- 贴图缓存
// 每个 (外观, 姿势) 只渲染一次:绘制 → alpha 二值化(硬边像素) → 返回 {canvas, hand, handAng}
export function renderSprite(look, pose) {
  const c = makeCanvas(SPR_W, SPR_H);
  const ctx = c.getContext('2d');
  ctx.translate(ORX, ORY);
  const J = solvePose(pose, look);
  drawFigure(ctx, look, J);
  hardenAlpha(ctx, SPR_W, SPR_H);
  return {
    canvas: c,
    hand: J.haF, handAng: J.handAngF + J.rot, handB: J.haB, handAngB: J.handAngB + J.rot,
    head: J.head, top: Math.min(J.head[1] - J.L.R, J.haF[1], J.haB[1]),
  };
}

export function hardenAlpha(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
  ctx.putImageData(img, 0, 0);
}

// 头像(状态栏 / 选人界面):放大绘制头 + 肩
export function renderPortrait(look, w, h, scale) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const J = solvePose({ t: 0, h: 0, fa: [10, 10], ba: [-5, 5], fl: [0, 0], bl: [0, 0] }, look);
  ctx.translate(w * 0.44 - J.head[0] * scale, h * 0.52 - J.head[1] * scale);
  ctx.scale(scale, scale);
  drawFigure(ctx, look, J);
  return c;
}
