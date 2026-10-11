// 人形角色精灵(玩家、阵营 NPC、僵尸、骷髅):按种族体型、发型、胡须、獠牙、角、长耳、战袍等组合绘制。
// 所有部件以 2 倍美术像素生成并缓存;返回各部件相对“脚底中心”的偏移(美术像素)。
import { Pix, hex, sh, mix } from './art.js';

const BODY = {
  normal: { tw: 6, th: 7, lh: 8, aw: 2, ah: 7 },
  slim: { tw: 5, th: 7, lh: 8, aw: 2, ah: 7 },
  thin: { tw: 5, th: 7, lh: 8, aw: 2, ah: 7 },
  tall: { tw: 6, th: 8, lh: 9, aw: 2, ah: 8 },
  broad: { tw: 7, th: 7, lh: 8, aw: 3, ah: 7 },
  stocky: { tw: 7, th: 6, lh: 5, aw: 3, ah: 6 },
  small: { tw: 5, th: 5, lh: 4, aw: 2, ah: 5 },
  huge: { tw: 8, th: 8, lh: 8, aw: 3, ah: 8 },
};
const cache = new Map();

export function avatarParts(look) {
  const key = JSON.stringify(look);
  let c = cache.get(key);
  if (c) return c;
  if (cache.size > 400) cache.clear();
  const B = BODY[look.body] || BODY.normal;
  const skin = hex(look.skin || '#f0c8a0');
  const hairC = hex(look.hair || '#6a3a1a');
  const shirt = hex(look.shirt || '#3a8ad8'), pants = hex(look.pants || '#3a3a6a'), shoes = hex(look.shoes || '#5a3a1a');
  const eye = hex(look.eye || '#2a5ad8');
  const sk = look.skeleton, zb = look.zombie;
  const bone = hex('#e8e6dc');
  const helm = look.helm ? hex(look.helm) : null, chest = look.chest ? hex(look.chest) : null, legsA = look.legs ? hex(look.legs) : null, boots = look.boots ? hex(look.boots) : null;

  // ———— 头部:12×15 画布,头框位于 (2,4)–(9,11)
  const head = new Pix(12, 15);
  const S = sk ? bone : skin;
  head.rect(3, 5, 6, 7, S);
  head.rect(3, 11, 6, 1, sh(S, 0.86));
  if (look.ears === 'cow' || look.horns) { // 牛头人:更宽的头与口鼻
    head.rect(3, 5, 7, 7, S); head.rect(8, 8, 3, 3, sh(S, 1.12)); head.set(10, 9, hex('#3a2a20')); head.rect(3, 11, 7, 1, sh(S, 0.85));
  }
  if (sk) { head.set(7, 7, hex('#202020')); head.set(8, 7, hex('#202020')); head.rect(6, 10, 3, 1, hex('#5a5a5a')); head.set(7, 10, bone); }
  else {
    const glow = look.glowEyes;
    head.set(7, 7, glow ? eye : hex('#ffffff')); head.set(8, 7, glow ? sh(eye, 1.1) : eye);
    if (look.gender === 'f') head.set(8, 6, sh(S, 0.55));
    head.set(8, 9, sh(S, 0.82));
    if (look.undead) { head.set(7, 11, bone); head.set(8, 11, bone); head.set(8, 10, hex('#3a2a2a')); head.set(4, 8, sh(S, 0.75)); }
    if (zb) { head.set(5, 8, hex('#3a5a2a')); head.set(4, 10, hex('#3a5a2a')); }
  }
  // 头发
  if (!sk) drawHair(head, look.hairStyle ?? 0, hairC, look);
  // 胡须
  if (!sk && look.beard) {
    const bc = hairC;
    if (look.beard === 1) { head.rect(6, 11, 3, 1, bc); head.set(8, 10, bc); }
    else if (look.beard === 2) { head.rect(5, 10, 4, 2, bc); head.rect(5, 12, 4, 1, sh(bc, 0.85)); head.rect(6, 13, 3, 1, sh(bc, 0.75)); head.set(7, 14, sh(bc, 0.7)); head.set(8, 9, bc); }
    else if (look.beard === 3) { head.rect(7, 11, 2, 2, bc); }
  }
  // 獠牙
  if (look.tusks === 1) { head.set(8, 10, hex('#f4f0e0')); head.set(8, 9, hex('#f4f0e0')); }
  if (look.tusks === 2) { head.set(9, 10, hex('#f4f0e0')); head.set(9, 9, hex('#f4f0e0')); head.set(10, 8, hex('#f4f0e0')); }
  // 耳朵
  const earC = sh(S, 0.92);
  if (look.ears === 'long') { head.set(4, 8, earC); head.set(3, 7, earC); head.set(2, 6, earC); head.set(1, 5, earC); head.set(0, 4, sh(earC, 1.1)); }
  else if (look.ears === 'troll') { head.set(4, 8, earC); head.set(3, 8, earC); head.set(2, 7, earC); head.set(1, 7, earC); head.set(0, 6, earC); }
  else if (look.ears === 'cow') { head.set(3, 7, earC); head.set(2, 7, earC); head.set(1, 8, earC); }
  // 牛角
  if (look.horns) {
    const hc = hex('#e8dcc0'), hd = hex('#b8a888');
    head.set(4, 4, hc); head.set(3, 3, hc); head.set(3, 2, hd); head.set(2, 1, hd);
    head.set(8, 4, hc); head.set(9, 3, hc); head.set(9, 2, hd); head.set(10, 1, hd);
  }
  // 头盔
  if (helm) {
    if (look.helmKind === 'mining') { head.rect(2, 4, 8, 3, helm); head.rect(7, 5, 2, 2, hex('#fff8c0')); head.rect(2, 7, 1, 2, helm); }
    else { head.rect(2, 4, 8, 2, helm); head.rect(2, 6, 2, 3, helm); head.set(9, 6, sh(helm, 0.8)); head.rect(3, 4, 6, 1, sh(helm, 1.2)); }
  }

  // ———— 躯干
  const torso = new Pix(B.tw, B.th);
  torso.rect(0, 0, B.tw, B.th, sk ? hex('#d8d6cc') : shirt);
  if (sk) { for (let y = 1; y < B.th - 1; y += 2) { torso.clear(0, y); torso.clear(B.tw - 1, y); } torso.rect(B.tw >> 1, 0, 1, B.th, bone); }
  else {
    torso.rect(B.tw - 2, 0, 2, B.th - 1, sh(shirt, 0.85));
    torso.rect(0, B.th - 1, B.tw, 1, sh(pants, 0.8));
    if (look.gender === 'f' && B.tw >= 6) { torso.set(0, B.th - 3, sh(shirt, 0.8)); }
  }
  if (zb) { torso.set(1, 3, sh(shirt, 0.55)); torso.set(3, 1, sh(shirt, 0.55)); }
  if (chest) { torso.rect(0, 0, B.tw, B.th - 1, chest); torso.rect(0, 0, B.tw, 1, sh(chest, 1.2)); torso.rect(B.tw - 2, 1, 2, B.th - 2, sh(chest, 0.82)); }
  if (look.tabard) {
    const f = look.tabard === 'alliance' ? [hex('#2a5ad8'), hex('#f2c84a')] : [hex('#b82a20'), hex('#202020')];
    const x0 = 1, w = Math.max(2, B.tw - 3);
    torso.rect(x0, 1, w, B.th - 1, f[0]);
    torso.set(x0 + (w >> 1), 2, f[1]); torso.set(x0 + (w >> 1), 3, f[1]); torso.set(x0 + (w >> 1) - 1, 3, f[1]);
  }
  if (look.armorTint && !chest) { torso.rect(0, 0, B.tw, 2, hex(look.armorTint)); torso.set(B.tw - 1, 2, sh(hex(look.armorTint), 0.8)); }

  // ———— 腿(9 帧:0 站立、1-6 行走、7 备用、8 跳跃)
  const legs = [];
  const step = B.lh >= 7 ? 2 : 1;
  const legOff = [[0, 0], [1, -1], [step, -step], [1, -1], [0, 0], [-1, 1], [-step, step], [-1, 1]];
  const pc = sk ? hex('#d8d6cc') : pants, bc = boots || (sk ? hex('#c8c6bc') : shoes), lc = legsA || pc;
  const lw = B.tw >= 7 ? 3 : 2;
  for (let f = 0; f < 9; f++) {
    const p = new Pix(10, B.lh);
    const [a, b] = f === 0 ? [0, 0] : f === 8 ? [2, -1] : legOff[f - 1];
    const bootH = B.lh >= 6 ? 2 : 1;
    const back = () => { p.rect(3 + b, 0, lw, B.lh - bootH, sh(lc, 0.8)); p.rect(3 + b, B.lh - bootH, lw + 1, bootH, sh(bc, 0.8)); };
    const front = () => { p.rect(4 + a, 0, lw, B.lh - bootH, lc); p.rect(4 + a, B.lh - bootH, lw + 1, bootH, bc); };
    back(); front();
    p.rect(3, 0, lw + 2, 1, lc);
    legs.push(p.canvas(2));
  }
  // ———— 手臂
  const sleeve = chest || (look.tabard ? (look.tabard === 'alliance' ? hex('#2a5ad8') : hex('#b82a20')) : (sk ? bone : shirt));
  const hand = sk ? bone : skin;
  const arm = new Pix(B.aw + 1, B.ah), armB = new Pix(B.aw + 1, B.ah);
  const slv = Math.ceil(B.ah * 0.45);
  arm.rect(0, 0, B.aw, slv, sleeve); arm.rect(0, slv, B.aw, B.ah - slv, hand); arm.rect(0, B.ah - 1, B.aw, 1, sh(hand, 0.85));
  armB.rect(0, 0, B.aw, slv, sh(sleeve, 0.75)); armB.rect(0, slv, B.aw, B.ah - slv, sh(hand, 0.78));

  // ———— 布局(相对脚底中心,单位:美术像素)
  const legsTop = -B.lh, torsoTop = legsTop - B.th + 1, headBoxTop = torsoTop - 7;
  const torsoLeft = -Math.ceil(B.tw / 2);
  const dims = {
    legs: [-5, legsTop], torso: [torsoLeft, torsoTop], head: [-4 - 2 + 0, headBoxTop - 4],
    shoulder: [torsoLeft + B.tw / 2 - 0.5, torsoTop + 1], armLen: B.ah, height: -headBoxTop, armW: B.aw,
  };
  c = { head: head.canvas(2), torso: torso.canvas(2), legs, arm: arm.canvas(2), armB: armB.canvas(2), dims };
  cache.set(key, c);
  return c;
}

function drawHair(p, style, H, look) {
  const H2 = sh(H, 1.18), H0 = sh(H, 0.8);
  const top = () => { p.rect(2, 4, 6, 2, H); p.rect(3, 4, 5, 1, H2); p.set(8, 5, H); };
  const back = (to) => { p.rect(2, 6, 2, to - 5, H); p.rect(2, 6, 1, to - 5, H0); };
  switch (style) {
    case 0: top(); back(8); p.set(2, 9, H0); break;                       // 短发
    case 1: top(); back(13); p.rect(4, 6, 1, 3, H); break;                 // 长发
    case 2: top(); back(8); p.rect(0, 7, 2, 4, H); p.set(1, 11, H0); p.set(2, 7, hex('#d0a040')); break; // 马尾
    case 3: p.rect(4, 1, 3, 4, H); p.rect(5, 0, 1, 1, H2); p.rect(4, 1, 1, 3, H0); p.rect(3, 5, 1, 2, H0); break; // 莫西干
    case 4: break;                                                         // 光头
    case 5: top(); back(8); p.rect(2, 1, 3, 3, H); p.set(3, 1, H2); break; // 发髻
    case 6: top(); back(8); p.set(2, 3, H); p.set(4, 2, H); p.set(6, 3, H); p.set(3, 3, H2); p.set(8, 4, H); break; // 刺猬头
    case 7: top(); back(9); p.rect(0, 7, 2, 6, H); p.set(1, 13, H0); p.set(2, 7, hex('#e05090')); break; // 双马尾
    case 8: top(); for (let x = 1; x <= 4; x++) for (let y = 6; y <= 13; y++) if ((x + (y >> 1)) % 2 === 0) p.set(x, y, y % 3 ? H : H0); break; // 脏辫
    case 9: top(); back(14); p.rect(1, 9, 1, 5, H0); p.rect(5, 5, 3, 1, H); p.set(8, 6, H); break; // 精灵长发
    default: top(); back(8);
  }
}

// 头像(单位框):裁取头部并放大
export function portrait(look, size = 48) {
  const parts = avatarParts(look);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const k = size / 24;
  g.drawImage(parts.head, 0, 0, 24, 30, 0, -2 * k, 24 * k, 30 * k);
  return c;
}
