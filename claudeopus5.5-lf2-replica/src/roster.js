// 角色名单(英雄):10 名原创角色,各自承担 LF2 v2.0a 原版一名英雄的玩法定位。
// 出招指令、MP 消耗(原版 500 点制原始值)、招式机制按原版官方出招表与原版 .dat 数据复刻;形象、名字为原创。
// 关卡敌人 / 首领 / 合体角色见 roster-ex.js。帧号:235 起为招式帧(沿用 LF2 习惯)。
import { makeChar, ballMove, seq, F, ST, END, HIT, CHARS } from './charbase.js';
import { defProj } from './objects.js';
import { rnd, sign, clamp } from './util.js';

export const ROSTER = [];
export const HIDDEN = [];
export const add = (def) => { (def.hidden ? HIDDEN : ROSTER).push(def.id); return def; };
// 循环帧:每圈扣 cost MP,MP 不足则转出
export const drain = (cost, back, out) => (f) => { if (f.mp >= cost) { f.mp -= cost; f.stats.mpUsage += cost; return back; } return out; };

// ================================================================ 飞行道具
export const BALL = (color, injury = 30, fall = 25, o = {}) => ({ render: 'ball', color, r: 10, speed: 13, life: 70, size: 11, h: 22, itr: { injury, fall, dvx: 9, bdefend: 30 }, hitSound: 'ball_hit', ...o });
defProj('rexBall', BALL('#3a8cff', 30, 25, { r: 9 }));
defProj('toraBall', BALL('#ffd030', 45, 35, { r: 11 }));
defProj('jetBall', BALL('#50d8ff', 30, 25, { r: 9, speed: 14 }));
defProj('jetChase', { render: 'ball', color: '#9ad8ff', r: 9, speed: 9, life: 120, size: 10, h: 18, move: 'chase', turn: 0.9, itr: { injury: 50, fall: 40, dvx: 8, bdefend: 30 }, hitSound: 'ball_hit', trail: '#bfe8ff' });
defProj('iceBall', { render: 'iceball', r: 10, speed: 9, life: 90, size: 11, h: 22, itr: { injury: 30, fall: 0, dvx: 4, bdefend: 30, effect: 3 }, hitSound: 'ice', hitRender: 'shatter', color: '#bfefff' });
defProj('icicle', { render: 'icicle', move: 'still', speed: 0, life: 90, size: 12, h: 48, yOff: 24, ground: true, pierce: true, reflect: false, clash: false, power: 3, itr: { injury: 35, fall: 0, dvx: 2, dvy: -6, bdefend: 60, effect: 3, vrest: 40 }, onAppear: (p, w) => w.sfx('ice', p, 0.5), noShadow: true });
defProj('iceWind', { render: 'tornado', color: '#d8f4ff', move: 'straight', speed: 3, life: 100, size: 24, h: 100, yOff: 50, pierce: true, reflect: false, clash: true, power: 6, itr: { kind: 16, injury: 4, lift: 6, vrest: 5, effect: 3, zw: 24, bdefend: 100 }, noShadow: true, onSpawn: (p, w) => w.sfx('whirlwind', p) });
defProj('fireBall', { render: 'fireball', r: 11, speed: 13, life: 75, size: 12, h: 22, itr: { injury: 40, fall: 70, dvx: 8, dvy: -8, bdefend: 40, effect: 2 }, hitSound: 'fire', color: '#ffa030', trail: 'fire', trailEvery: 2 });
defProj('flame', { render: 'flame', speed: 9, life: 14, size: 13, h: 28, pierce: true, reflect: false, clash: true, power: 3, itr: { injury: 12, fall: 70, dvx: 5, dvy: -7, bdefend: 30, effect: 2, vrest: 10 }, noShadow: true });
defProj('firePatch', { render: 'firepatch', move: 'still', speed: 0, life: 90, size: 14, h: 24, yOff: 12, ground: true, pierce: true, reflect: false, clash: false, itr: { injury: 15, fall: 70, dvx: 3, dvy: -7, bdefend: 100, effect: 2, vrest: 25 }, noShadow: true });
defProj('explosion', { render: 'explosion', move: 'still', speed: 0, life: 18, size: 66, h: 96, r: 66, pierce: true, reflect: false, clash: true, power: 9, radial: true, itr: { injury: 125, fall: 100, dvx: 12, dvy: -12, bdefend: 100, effect: 2, vrest: 40, zw: 40 }, noShadow: true, onSpawn: (p, w) => { w.sfx('explosion', p); w.shakeCam(6); } });
defProj('sageBall', BALL('#c060ff', 55, 40, { r: 10 }));
defProj('sageDisk', { render: 'disk', color: '#ff70d0', r: 12, speed: 10, life: 150, size: 12, h: 14, move: 'chase', turn: 0.7, chaseDelay: 6, power: 6, reflect: false, itr: { injury: 30, fall: 40, dvx: 7, bdefend: 30, vrest: 12, pierceArmor: true }, hitSound: 'ball_hit', pierce: true, maxHits: 4, trail: '#ffb0e8' });
defProj('shieldWall', { render: 'shield', color: '#ff9ae0', move: 'still', speed: 0, life: 150, size: 12, h: 78, yOff: 39, pierce: true, reflect: false, clash: true, power: 99, itr: { injury: 10, fall: 70, dvx: 10, dvy: -5, bdefend: 100, vrest: 15 }, noShadow: true, onSpawn: (p, w) => w.sfx('shield', p) });
// 治疗光球:留在身前缓缓漂移,先碰到的人(不分敌我)被治疗
defProj('healOrb', { render: 'heal', move: 'straight', speed: 1.2, life: 180, size: 11, h: 22, reflect: false, clash: false, itr: { kind: 8, injury: 104, anyTeam: true } });
defProj('blade', { render: 'blade', color: '#bff6ff', r: 15, speed: 14, life: 50, size: 14, h: 40, itr: { injury: 55, fall: 50, dvx: 9, bdefend: 40, effect: 1 }, hitSound: 'hit_sharp' });
defProj('arrow', { render: 'arrow', speed: 17, life: 50, size: 10, h: 8, vy: -0.4, move: 'arc', gravity: 0.08, itr: { injury: 25, fall: 30, dvx: 4, bdefend: 20, effect: 1 }, reflect: true, clash: true, power: 0.5, onGround: (p) => { p.removed = true; } });
defProj('arrowDown', { render: 'arrow', speed: 14, life: 40, size: 10, h: 8, vy: 6, move: 'arc', gravity: 0.15, itr: { injury: 25, fall: 40, dvx: 4, bdefend: 20, effect: 1 }, reflect: true, clash: true, power: 0.5, onGround: (p) => { p.removed = true; } });
defProj('critArrow', { render: 'arrow', glowArrow: '#ffe060', speed: 21, life: 60, size: 12, h: 10, itr: { injury: 70, fall: 70, dvx: 12, dvy: -6, bdefend: 60, effect: 1, pierceArmor: true }, pierce: true, maxHits: 5, reflect: false, power: 4, trail: '#fff2a0' });
defProj('dragonWind', { render: 'wave', color: '#d8f8ff', speed: 12, life: 22, size: 18, h: 56, yOff: 28, ground: true, pierce: true, reflect: false, clash: true, power: 3, itr: { injury: 30, fall: 70, dvx: 16, dvy: -7, bdefend: 60, vrest: 30 }, noShadow: true, onSpawn: (p, w) => w.sfx('whirlwind', p, 0.5) });
defProj('sonata', { render: 'invisible', move: 'still', follow: true, speed: 0, life: 45, size: 150, h: 160, yOff: 60, pierce: true, reflect: false, clash: false, radial: true, noBdy: true, noShadow: true, itr: { kind: 15, injury: 5, lift: 7, vrest: 9, zw: 60, bdefend: 100 } });
defProj('shuriken', { render: 'shuriken', speed: 15, life: 45, size: 7, h: 10, itr: { injury: 20, fall: 25, dvx: 3, bdefend: 16, effect: 1 }, power: 0.5 });
defProj('palmWave', { render: 'palm', color: '#ffd040', r: 18, speed: 11, life: 18, size: 18, h: 52, pierce: true, reflect: false, power: 4, itr: { injury: 60, fall: 70, dvx: 15, dvy: -8, bdefend: 70, vrest: 30 } });
defProj('armorBurst', { render: 'explosion', move: 'still', speed: 0, life: 12, size: 50, h: 80, r: 44, pierce: true, reflect: false, clash: false, radial: true, itr: { injury: 40, fall: 70, dvx: 10, dvy: -9, bdefend: 100, vrest: 30, zw: 30 }, noShadow: true, onSpawn: (p, w) => { w.sfx('explosion', p, 0.7); w.shakeCam(4); } });

// ================================================================ 1 雷克斯 Rex(Davis 定位)
add(makeChar('rex', {
  name: 'Rex',
  look: { skin: '#f2c08a', hair: 'spiky', hairCol: '#2b1d14', shirt: '#2f6fd8', top: 'tshirt', pants: '#26304a', shoes: '#4a2e1a', belt: '#14141c', headband: '#f0f0f0' },
  role: '气功拳师', desc: '气功弹左右手交替连发并呈扇形散开;升龙拳几乎无起手、对空无敌;Shrafe 连环拳裹着敌人推进,结尾可接升龙或跃击。',
  build(fr, def) {
    const shot = (dvy) => ({ opoint: [{ oid: 'rexBall', x: 28, y: -46, dvy, zFromInput: 1.2 }], sound: 'ball_launch' });
    fr[235] = F(235, 'cast0', ST.ATTACK, 2, 236, { mp: 40, stop: true });
    fr[236] = F(236, 'blastF', ST.ATTACK, 2, 237, shot(0));
    fr[237] = F(237, 'cast2', ST.ATTACK, 5, END, { hit_a: 238 });
    fr[238] = F(238, 'blastB', ST.ATTACK, 2, 239, { mp: 40, ...shot(-1.3) });
    fr[239] = F(239, 'cast2', ST.ATTACK, 5, END, { hit_a: 240 });
    fr[240] = F(240, 'blastF', ST.ATTACK, 2, 241, { mp: 40, ...shot(1.3) });
    fr[241] = F(241, 'cast2', ST.ATTACK, 5, END, { hit_a: 238 });
    // 升龙拳 D^A(225):起手无敌
    seq(fr, 245, [
      ['upper0', 1, { bdy: null }],
      ['upper1', 3, { dvx: 4, dvy: -14, bdy: null, itr: [{ at: 'haF', w: 30, h: 38, injury: 60, fall: 70, dvx: 6, dvy: -15, bdefend: 60 }], sound: 'dragon' }],
      ['upper2', 4, { itr: [{ at: 'haF', w: 30, h: 38, injury: 30, fall: 70, dvx: 4, dvy: -10, bdefend: 60 }] }],
      ['upper3', 40],
    ], { state: ST.ATTACK, mp: 225, air: true, landTo: 215 });
    // Shrafe DvA(75):前冲连环拳,结尾可接 D^A 或 J(跃击)
    const MP = { w: 32, h: 28, injury: 10, fall: 8, dvx: 4, bdefend: 12, vrest: 2 };
    seq(fr, 260, [
      ['manyPunch0', 2, { itr: [{ ...MP, at: 'haF' }], sound: 'swing', dvx: 5 }], ['manyPunch1', 2, { itr: [{ ...MP, at: 'haB' }], sound: 'swing', dvx: 5 }],
      ['manyPunch0', 2, { itr: [{ ...MP, at: 'haF' }], sound: 'swing', dvx: 5 }], ['manyPunch1', 2, { itr: [{ ...MP, at: 'haB' }], sound: 'swing', dvx: 5 }],
      ['manyPunch0', 2, { itr: [{ ...MP, at: 'haF' }], sound: 'swing', dvx: 5 }], ['manyPunch1', 2, { itr: [{ ...MP, at: 'haB' }], sound: 'swing', dvx: 5 }],
      ['super1', 4, { itr: [{ at: 'haF', w: 34, h: 30, injury: 30, fall: 70, dvx: 9, dvy: -7, bdefend: 60 }], sound: 'swing_heavy', dvx: 4, hit_Ua: 245, hit_j: 275 }],
      ['super2', 7, { hit_Ua: 245, hit_j: 275 }],
    ], { state: ST.ATTACK, mp: 75 });
    // 跃击 D^J(25):小跳,空中按 A 俯冲拳
    seq(fr, 275, [['crouch', 2], ['jumpUp', 4, { dvx: 8, dvy: -11, sound: 'jump', hit_a: 278 }], ['jumpTop', 30, { hit_a: 278 }]], { state: ST.JUMP, mp: 25, air: true, landTo: 215 });
    seq(fr, 278, [['dashAtk0', 2], ['dive', 30, { dvy: 6, dvx: 6, itr: [{ at: 'haF', w: 40, h: 40, injury: 45, fall: 70, dvx: 8, dvy: -6, bdefend: 50 }] }]], { state: ST.ATTACK, air: true, landTo: 215 });
    def.moves = { Fa: 235, Ua: 245, Da: 260, Uj: 275 };
    def.catchMoves = { Ua: 245, Da: 260 };
  },
  ai: { specials: [{ type: 'Fa', min: 90, max: 480, z: 16, w: 2, mash: 6 }, { type: 'Ua', min: 0, max: 46, z: 12, w: 1.2 }, { type: 'Da', min: 0, max: 60, z: 12, w: 1.4 }, { type: 'Uj', min: 90, max: 170, z: 14, w: 0.6, mash: 8 }] },
  moveList: [['D>A', '气功弹(连按 A 连发,扇形散开)', 40], ['DvA', 'Shrafe 连环拳(尾段可接 D^A / J)', 75], ['D^A', '升龙拳(起手无敌)', 225], ['D^J', '跃击(空中按 A 俯冲)', 25], ['抓住时', 'D^A / DvA', '']],
}));

// ================================================================ 2 托拉 Tora(Woody 定位)
function teleportTo(f, w, ally) {
  let best = null, bd = ally ? -1 : 1e9;
  for (const e of w.entities) {
    if (e.kind !== 'char' || e === f || e.dead || e.removed) continue;
    if (ally ? e.team !== f.team : e.team === f.team) continue;
    const d = Math.abs(e.x - f.x) + Math.abs(e.z - f.z);
    if (ally ? d > bd : d < bd) { bd = d; best = e; }   // 敌:最近;友:最远
  }
  w.fx.sparkle(f.x, f.y - 40, f.z, '#ffe080');
  if (best) {
    const side = -best.facing;
    f.x = best.x + side * 34; f.z = best.z; f.y = ally ? 0 : -70; f.vy = 0; f.vx = 0;
    f.facing = sign(best.x - f.x) || f.facing;
  }
  w.fx.sparkle(f.x, f.y - 40, f.z, '#ffe080');
  w.sfx('teleport', f);
}
add(makeChar('tora', {
  name: 'Tora',
  look: { skin: '#e8b07c', hair: 'topknot', hairCol: '#d8a030', shirt: '#e07818', top: 'vest', vest: '#2a2a2a', pants: '#3a2a1a', shoes: '#1a1a1a', belt: '#c03020', sash: true, bracer: '#c03020' },
  role: '虎拳武者', desc: '空翻踢不耗 MP,收招按 J 可前后冲跳;虎形冲飞身撞击;能在地面或空中瞬移到最近的敌人身后,或最远的队友身边。',
  build(fr, def) {
    // D>A(125):连续两发金色气功
    seq(fr, 235, [['oneHand0', 3], ['blastF', 3, { opoint: [{ oid: 'toraBall', x: 28, y: -46, zFromInput: 1.2 }], sound: 'ball_launch' }], ['cast2', 3], ['blastB', 3, { opoint: [{ oid: 'toraBall', x: 28, y: -48, zFromInput: 1.2 }], sound: 'ball_launch' }], ['cast2', 6]], { state: ST.ATTACK, mp: 125, stop: true });
    // D^A 空翻踢(0 MP),收招 J = 冲跳(按后 = 向后)
    const dashJ = (f) => {
      const back = f.ctrl && f.ctrl.dirX() === -f.facing;
      f.vx = (back ? -1 : 1) * f.facing * f.def.stats.dash_distance; f.vy = f.def.stats.dash_height;
      if (back) { f.facing = -f.facing; return 214; }
      return 213;
    };
    seq(fr, 245, [
      ['flip0', 2],
      ['flipK0', 2, { dvy: -12, dvx: -2, itr: [{ at: 'toeF', w: 32, h: 36, injury: 40, fall: 70, dvx: 4, dvy: -14, bdefend: 60 }], sound: 'kick' }],
      ['flipK1', 2, { itr: [{ at: 'toeF', w: 32, h: 36, injury: 40, fall: 70, dvx: 4, dvy: -14, bdefend: 60 }] }],
      ['flipK2', 2], ['flipK3', 3, { hit_j: dashJ }], ['jumpTop', 40, { hit_j: dashJ }],
    ], { state: ST.ATTACK, air: true, landTo: 215 });
    // DvA 回旋踢(50):把对手踢上半空
    seq(fr, 255, [['spinB', 2], ['spinA', 3, { itr: [{ at: 'toeF', w: 40, h: 34, injury: 40, fall: 70, dvx: 3, dvy: -16, bdefend: 50 }], sound: 'kick', dvx: 3 }], ['spinB', 2], ['stand2', 6]], { state: ST.ATTACK, mp: 50 });
    // D>J 虎形冲(200)
    const TD = { at: 'head', w: 46, h: 54, dx: 6, injury: 60, fall: 70, dvx: 12, dvy: -9, bdefend: 60 };
    seq(fr, 260, [['crouch', 2], ['dash', 3, { dvx: 21, dvy: -3, sound: 'dash', itr: [TD] }], ['dash', 3, { itr: [TD] }], ['dash', 3, { itr: [TD] }], ['jumpTop', 30]], { state: ST.ATTACK, mp: 200, air: true, landTo: 215, gravityK: 0.35 });
    // D^J / DvJ 瞬移(50),空中也可
    seq(fr, 275, [['teleport', 3], ['teleport', 2, { onEnter: (f, w) => teleportTo(f, w, false), bdy: null, hit_a: 80 }], ['jumpAtk0', 30, { hit_a: 80 }]], { state: ST.TELEPORT, mp: 50, air: true, landTo: 215 });
    seq(fr, 285, [['teleport', 3], ['teleport', 2, { onEnter: (f, w) => teleportTo(f, w, true), bdy: null }], ['crouch', 4]], { state: ST.TELEPORT, mp: 50, air: true, landTo: 215 });
    def.moves = { Fa: 235, Ua: 245, Da: 255, Fj: 260, Uj: 275, Dj: 285, airUj: 275, airDj: 285 };
  },
  ai: { specials: [{ type: 'Fa', min: 100, max: 460, z: 14, w: 1.2 }, { type: 'Ua', min: 0, max: 44, z: 12, w: 1.6 }, { type: 'Da', min: 0, max: 46, z: 12, w: 1 }, { type: 'Fj', min: 60, max: 220, z: 12, w: 1.2 }, { type: 'Uj', min: 220, max: 900, z: 400, w: 0.5, any: true }] },
  moveList: [['D>A', '双发虎掌气功', 125], ['D^A', '空翻踢(收招按 J 冲跳)', 0], ['DvA', '回旋踢', 50], ['D>J', '虎形冲', 200], ['D^J', '瞬移至最近敌人身后(空中可用,随后 A 下踢)', 50], ['DvJ', '瞬移至最远队友身边(空中可用)', 50]],
}));

// ================================================================ 3 杰特 Jet(Dennis 定位)
add(makeChar('jet', {
  name: 'Jet',
  look: { skin: '#f0c49a', hair: 'messy', hairCol: '#8a4a1a', shirt: '#2aa060', top: 'long', sleeveCol: '#2aa060', stripe: '#f0f0f0', pants: '#203828', shoes: '#f0f0f0', cap: '#d03030' },
  role: '腿法高手', desc: '气功弹连发,追踪弹穷追不舍;旋风腿边转边前进、持续耗 MP(J/D 停止);重拳与跑攻可直接取消接招,抓住敌人时也能出招。',
  build(fr, def) {
    const shot = { opoint: [{ oid: 'jetBall', x: 28, y: -46, zFromInput: 1.2 }], sound: 'ball_launch' };
    fr[235] = F(235, 'cast0', ST.ATTACK, 2, 236, { mp: 40, stop: true });
    fr[236] = F(236, 'blastF', ST.ATTACK, 2, 237, shot);
    fr[237] = F(237, 'cast2', ST.ATTACK, 5, END, { hit_a: 238 });
    fr[238] = F(238, 'blastB', ST.ATTACK, 2, 239, { mp: 40, ...shot });
    fr[239] = F(239, 'cast2', ST.ATTACK, 5, END, { hit_a: 240 });
    fr[240] = F(240, 'blastF', ST.ATTACK, 2, 241, { mp: 40, ...shot });
    fr[241] = F(241, 'cast2', ST.ATTACK, 5, END, { hit_a: 238 });
    // D^A 追踪弹(100)
    seq(fr, 245, [['cast0', 3], ['castUp', 3, { opoint: [{ oid: 'jetChase', x: 10, y: -66, dvy: -4 }], sound: 'ball_launch' }], ['cast2', 8]], { state: ST.ATTACK, mp: 100, stop: true });
    // DvA Shrafe 连环腿(75)
    const K = { w: 34, h: 26, injury: 10, fall: 8, dvx: 4, bdefend: 12, vrest: 2 };
    seq(fr, 260, [
      ['kickMid', 2, { itr: [{ ...K, at: 'toeF' }], dvx: 5, sound: 'kick' }], ['stand1', 1, { dvx: 5 }],
      ['kickHi', 2, { itr: [{ ...K, at: 'toeF' }], dvx: 5, sound: 'kick' }], ['stand1', 1, { dvx: 5 }],
      ['kickMid', 2, { itr: [{ ...K, at: 'toeF' }], dvx: 5, sound: 'kick' }], ['stand1', 1, { dvx: 5 }],
      ['kickHi', 2, { itr: [{ ...K, at: 'toeF' }], dvx: 5, sound: 'kick' }],
      ['kickHi', 4, { itr: [{ at: 'toeF', w: 34, h: 30, injury: 30, fall: 70, dvx: 9, dvy: -8, bdefend: 60 }], dvx: 4, sound: 'swing_heavy' }], ['stand2', 6],
    ], { state: ST.ATTACK, mp: 75 });
    // D>J 旋风腿(75 + 每圈 17),J / D 停止
    const SK = { w: 74, h: 30, injury: 12, fall: 25, dvx: 5, dvy: -3, bdefend: 20, vrest: 5, zw: 18 };
    fr[274] = F(274, 'crouch', ST.ATTACK, 2, 275, { mp: 75 });
    seq(fr, 275, [
      ['spinA', 2, { itr: [{ ...SK, at: 'hip', dy: -18 }], sound: 'whirlwind', hit_j: 277, hit_d: 277 }], ['spinB', 2, { itr: [{ ...SK, at: 'hip', dy: -18 }], hit_j: 277, hit_d: 277 }],
    ], { state: ST.ATTACK, steer: { z: 2, x: 6, turn: true }, dvy: -1.2, gravityK: 0.6 }, { next: drain(17, 275, 277) });
    fr[277] = F(277, 'jumpTop', ST.ATTACK, 30, END, { air: true, landTo: 215 });
    // 重拳 / 跑攻可取消接招
    for (const id of [71, 72, 86, 87]) Object.assign(fr[id], { hit_Ua: 245, hit_Da: 260, hit_Fj: 274 });
    def.moves = { Fa: 235, Ua: 245, Da: 260, Fj: 274 };
    def.catchMoves = { Ua: 245, Da: 260, Fj: 274 };
  },
  ai: { specials: [{ type: 'Fa', min: 100, max: 460, z: 14, w: 1.3, mash: 4 }, { type: 'Ua', min: 140, max: 600, z: 200, w: 1.2, any: true }, { type: 'Da', min: 0, max: 60, z: 12, w: 1.2 }, { type: 'Fj', min: 0, max: 80, z: 16, w: 1 }] },
  moveList: [['D>A', '气功弹(连按 A 连发)', 40], ['D^A', '追踪弹', 100], ['DvA', 'Shrafe 连环腿', 75], ['D>J', '旋风腿(J/D 停,持续耗 MP)', '75+17/圈'], ['抓住时', 'D^A / DvA / D>J', '']],
}));

// ================================================================ 4 格拉西娅 Glacia(Freeze 定位)
add(makeChar('glacia', {
  name: 'Glacia',
  look: { skin: '#f6d8c8', hair: 'long', hairCol: '#b8d8f0', shirt: '#3a7ab8', top: 'long', sleeveCol: '#e8f4ff', pants: '#e8f4ff', shoes: '#3a6a9a', belt: '#a8d8ff', cape: '#5a9ad8', eyeCol: '#2a80d0', robe: '#3a7ab8', robeLen: 5, robeTrim: '#e8f4ff' },
  role: '冰系术士', desc: '冰冻弹冻住敌人;冰柱沿地面接连突起并短暂留作障碍;冰旋风不可防御;能凝出冰剑。空手反弹的飞行道具会变成冰冻弹。',
  build(fr, def) {
    ballMove(fr, 235, 'iceBall', 100, { repeat: false, sound: 'ice' });
    seq(fr, 245, [['castLow', 3], ['slam1', 4, { opoint: [{ oid: 'icicle', x: 44, y: 0, count: 3, spreadX: 34, delayStep: 3, zFromInput: 0 }], sound: 'ice' }], ['slam1', 12]], { state: ST.ATTACK, mp: 150, stop: true });
    seq(fr, 260, [['castUp', 4], ['cast1', 4, { opoint: [{ oid: 'iceWind', x: 30, y: 0 }] }], ['cast2', 10]], { state: ST.ATTACK, mp: 300, stop: true });
    seq(fr, 275, [['castUp', 6, { sound: 'ice' }], ['heal', 8, { onEnter: (f, w) => { if (!f.holding) { const it = w.addItem('iceSword', { x: f.x, y: 0, z: f.z }); it.attach(f); f.holding = it; w.fx.shards(f.x, f.z, '#cdf3ff', f.y - 50, 8); } } }]], { state: ST.ATTACK, mp: 150, stop: true, cond: (f) => !f.holding });
    def.moves = { Fa: 235, Fj: 245, Uj: 260, Dj: 275 };
  },
  extra: { reboundAs: 'iceBall', fuseWith: 'pyra' },
  ai: { specials: [{ type: 'Fa', min: 90, max: 460, z: 14, w: 1.5 }, { type: 'Fj', min: 40, max: 170, z: 14, w: 1.3 }, { type: 'Uj', min: 60, max: 260, z: 20, w: 0.6 }, { type: 'Dj', min: 200, max: 900, z: 999, w: 0.3, any: true }] },
  moveList: [['D>A', '冰冻弹', 100], ['D>J', '冰柱(三连突起,滞留为障碍)', 150], ['DvJ', '凝冰剑', 150], ['D^J', '冰旋风(不可防御)', 300], ['被动', '空手反弹飞行道具 → 冰冻弹', ''], ['合体', '与 Pyra 同队且都残血(≤1/3)时跑步相撞', '']],
}));

// ================================================================ 5 派拉 Pyra(Firen 定位)
add(makeChar('pyra', {
  name: 'Pyra',
  look: { skin: '#eab284', hair: 'flame', hairCol: '#e83a10', shirt: '#1a1a1a', top: 'tshirt', sleeveCol: '#1a1a1a', vest: '#c02810', pants: '#5a1a10', shoes: '#1a1a1a', belt: '#e8b020', gloves: '#1a1a1a', eyeCol: '#ff8000', scarf: '#c02810' },
  role: '火系狂战士', desc: '火球最多三连发;火遁奔裹着火焰前冲并留下燃烧轨迹;火焰喷射持续喷火并挡下飞行道具;爆炎另耗 HP(留作暗红可恢复)。火焰无视盔甲。',
  build(fr, def) {
    const fb = { opoint: [{ oid: 'fireBall', x: 28, y: -46, zFromInput: 1.2 }], sound: 'fire' };
    fr[235] = F(235, 'cast0', ST.ATTACK, 3, 236, { mp: 75, stop: true });
    fr[236] = F(236, 'blastF', ST.ATTACK, 3, 237, fb);
    fr[237] = F(237, 'cast2', ST.ATTACK, 5, END, { hit_a: 238 });
    fr[238] = F(238, 'blastB', ST.ATTACK, 3, 239, { mp: 75, ...fb });
    fr[239] = F(239, 'cast2', ST.ATTACK, 5, END, { hit_a: 240 });
    fr[240] = F(240, 'blastF', ST.ATTACK, 3, 241, { mp: 75, ...fb });
    fr[241] = F(241, 'cast2', ST.ATTACK, 8, END);
    // D>J 火遁奔(75 + 每步 10),J / D 停止
    const BZ = { at: 'hip', w: 38, h: 72, dy: -10, injury: 25, fall: 70, dvx: 8, dvy: -8, bdefend: 60, effect: 2, vrest: 15 };
    fr[244] = F(244, 'crouch', ST.ATTACK, 2, 245, { mp: 75, sound: 'fire' });
    seq(fr, 245, [
      ['run0', 2, { opoint: [{ oid: 'firePatch', x: -10, y: 0 }], itr: [BZ], hit_j: 247, hit_d: 247 }],
      ['run2', 2, { itr: [BZ], hit_j: 247, hit_d: 247 }],
    ], { state: ST.ATTACK, steer: { z: 2.5 }, dvx: 14, keepVel: true }, { next: drain(10, 245, 247) });
    fr[247] = F(247, 'crouch', ST.ATTACK, 6, END, { friction: 1 });
    // DvJ 火焰喷射(150 + 每圈 8),J / D 停止
    fr[259] = F(259, 'breath', ST.ATTACK, 3, 260, { mp: 150, stop: true, sound: 'inferno' });
    seq(fr, 260, [
      ['breath', 2, { opoint: [{ oid: 'flame', x: 26, y: -56, dvy: -0.3 }], hit_j: 263, hit_d: 263 }],
      ['breath', 2, { opoint: [{ oid: 'flame', x: 26, y: -56, dvy: 0.3 }], hit_j: 263, hit_d: 263 }],
    ], { state: ST.ATTACK, steer: { turn: true } }, { next: drain(8, 260, 263) });
    fr[263] = F(263, 'cast2', ST.ATTACK, 8, END);
    // D^J 爆炎(300 MP + 40 HP)
    seq(fr, 275, [['crouch', 6, { sound: 'charge' }], ['castUp', 3, { opoint: [{ oid: 'explosion', x: 0, y: -40 }] }], ['castUp', 14]], { state: ST.ATTACK, mp: 300, hp: 40, stop: true, bdy: null });
    def.moves = { Fa: 235, Fj: 244, Dj: 259, Uj: 275 };
  },
  passive(f, w) { if ((f.frameId === 245 || f.frameId === 246) && w.tick % 2 === 0) w.fx.flame(f.x - f.facing * 6, f.y - 30 - rnd() * 30, f.z + 1, 1); },
  extra: { fuseWith: 'glacia' },
  ai: { specials: [{ type: 'Fa', min: 90, max: 460, z: 14, w: 1.5, mash: 4 }, { type: 'Dj', min: 20, max: 130, z: 14, w: 1 }, { type: 'Uj', min: 0, max: 70, z: 30, w: 0.6, when: (f, t, w) => w.enemiesOf(f).filter((e) => Math.abs(e.x - f.x) < 80).length >= 2 || rnd() < 0.3 }, { type: 'Fj', min: 80, max: 400, z: 16, w: 0.8 }] },
  moveList: [['D>A', '火球(连按 A 最多三发)', 75], ['D>J', '火遁奔(J/D 停)', '75+10/步'], ['DvJ', '火焰喷射(J/D 停,挡飞行道具)', '150+8/圈'], ['D^J', '爆炎(另耗 40 HP)', 300], ['合体', '与 Glacia 同队且都残血(≤1/3)时跑步相撞', '']],
}));

// ================================================================ 6 加兰特 Gallant(Louis 定位)
function burstArmor(f, w) {
  w.addProj('armorBurst', f, { x: f.x, y: f.y - 40, z: f.z });
  for (let i = 0; i < 3; i++) w.addItem('armorPiece', { x: f.x + (i - 1) * 16, y: -50, z: f.z + (i - 1) * 6, vx: (i - 1) * 5, vy: -8 - i });
  f.def = CHARS.gallantEx; f.invuln = 20;
  w.fx.shards(f.x, f.z, '#e8c860', f.y - 40, 14);
}
add(makeChar('gallant', {
  name: 'Gallant',
  look: { skin: '#f0c8a0', hair: 'helmet', helmetCol: '#d8b850', plume: '#c02020', shirt: '#c8a840', top: 'long', armor: '#d8b850', armArmor: '#c8a840', legArmor: '#8a7a50', pauldron: '#e8c860', pants: '#5a4a30', shoes: '#4a3a20', cape: '#8a1a1a', belt: '#3a2a10', size: 1.04 },
  role: '黄金骑士', desc: '1 级盔甲:站立/行走/跑跳中可硬吃一下攻击不硬直(火、冰与破甲技无效)。跑攻为雷光拳,跑+J+A 为雷光拳二式。HP ≤ 1/3 时 DJA 炸开盔甲变身 Gallant EX,碎甲成为可投掷的重物。',
  stats: { walking_speed: 4.0, walking_speedz: 2.0, running_speed: 8.0, jump_distance: 8.5, dash_distance: 15 },
  build(fr, def) {
    seq(fr, 235, [['palm0', 4], ['palm1', 3, { opoint: [{ oid: 'palmWave', x: 30, y: -48 }], sound: 'charge' }], ['palm1', 10]], { state: ST.ATTACK, mp: 150, stop: true });
    const TK = { w: 36, h: 30, injury: 15, fall: 15, dvx: 3, bdefend: 16, vrest: 2 };
    seq(fr, 245, [
      ['kickMid', 2, { itr: [{ ...TK, at: 'toeF' }], dvx: 3, sound: 'kick' }], ['kickHi', 2, { itr: [{ ...TK, at: 'toeF' }], dvx: 3 }],
      ['kickMid', 2, { itr: [{ ...TK, at: 'toeF' }], dvx: 3, sound: 'kick' }], ['kickHi', 2, { itr: [{ ...TK, at: 'toeF' }], dvx: 3 }],
      ['kickMid', 3, { itr: [{ at: 'toeF', w: 38, h: 32, injury: 35, fall: 70, dvx: 10, dvy: -8, bdefend: 60, sound: 'thunder' }], sound: 'thunder', dvx: 4 }], ['stand2', 8],
    ], { state: ST.ATTACK, mp: 50 });
    // D^J 回旋摔(100):前扑抓人,旋转后扔出;按 J 继续旋转;不可防御
    seq(fr, 258, [['lunge', 4, { dvx: 9, itr: [{ kind: 3, at: 'haF', w: 36, h: 56, catchTo: 262 }] }], ['catch2', 6]], { state: ST.ATTACK, mp: 100 });
    seq(fr, 262, [
      ['spinA', 3, { cpoint: { x: 26, y: -10 } }], ['spinB', 3, { cpoint: { x: -26, y: -10 }, sound: 'whirlwind', hit_j: 262 }],
      ['spinA', 3, { cpoint: { x: 26, y: -10 }, hit_j: 262 }], ['spinB', 3, { cpoint: { x: -26, y: -10 }, hit_j: 262 }],
      ['throwP0', 3, { cpoint: { x: 10, y: -40 } }], ['throwP1', 2, { throwVictim: true, sound: 'throw' }], ['throwP1', 8],
    ], { state: ST.CATCHING });
    // 跑 + A 雷光拳(50)/ 跑 + J + A 雷光拳二式(75)
    seq(fr, 280, [['runAtk0', 2], ['runAtk1', 6, { itr: [{ at: 'haF', w: 40, h: 36, injury: 50, fall: 70, dvx: 12, dvy: -7, bdefend: 60 }], sound: 'thunder', dvx: 6 }], ['runAtk2', 8]], { state: ST.ATTACK, mp: 50, friction: 0.8 });
    seq(fr, 285, [['dashAtk0', 1], ['lunge', 8, { itr: [{ at: 'haF', w: 42, h: 40, injury: 60, fall: 70, dvx: 13, dvy: -8, bdefend: 60 }], sound: 'thunder' }], ['jumpTop', 30]], { state: ST.ATTACK, mp: 75, air: true, landTo: 215 });
    seq(fr, 290, [['pose', 10, { sound: 'transform' }], ['victory', 8, { onEnter: (f, w) => burstArmor(f, w) }]], { state: ST.TRANSFORM, stop: true, cond: (f) => f.hp <= f.maxHp / 3 });
    def.moves = { Fa: 235, Fj: 245, Uj: 258, ja: 290 };
    def.runAttack = (f) => (f.mp >= 50 ? 280 : 85);
    def.dashAttack = (f) => (f.mp >= 75 ? 285 : 90);
  },
  extra: { armorLevel: 1 },
  ai: { specials: [{ type: 'Fa', min: 30, max: 160, z: 14, w: 1.2 }, { type: 'Fj', min: 0, max: 56, z: 12, w: 1.3 }, { type: 'Uj', min: 0, max: 70, z: 12, w: 1 }, { type: 'ja', min: 0, max: 9999, z: 999, w: 3, any: true }] },
  moveList: [['D>A', '凤凰掌', 150], ['D>J', '雷霆踢(连踢)', 50], ['D^J', '回旋摔(前扑抓投,J 继续转,不可防御)', 100], ['跑+A', '雷光拳', 50], ['跑+J+A', '雷光拳二式', 75], ['DJA', 'HP≤1/3 卸甲变身', 0], ['被动', '1 级盔甲', '']],
}));

// ================================================================ 7 赛奇 Sage(John 定位)
add(makeChar('sage', {
  name: 'Sage',
  look: { skin: '#e8c0a0', hair: 'long', hairCol: '#5a3a20', shirt: '#6a3aa0', top: 'robe', sleeveCol: '#6a3aa0', robe: '#5a2a90', robeLen: 7, robeTrim: '#e8c040', pants: '#3a2060', shoes: '#2a1a40', belt: '#e8c040', cape: '#2a1a60' },
  role: '秘术师', desc: '法杖放出能量弹;追踪飞盘难以摧毁并无视盔甲;能量盾挡下并反弹飞行道具;治疗光球留在身前,谁先碰到就治疗谁(不分敌我);也能转杖治疗自己。治疗只能回到暗红可恢复上限。',
  build(fr, def) {
    seq(fr, 235, [['oneHand0', 3, { prop: 'staff' }], ['oneHand1', 3, { prop: 'staff', opoint: [{ oid: 'sageBall', x: 30, y: -50, zFromInput: 1.2 }], sound: 'ball_launch' }], ['cast2', 7, { prop: 'staff' }]], { state: ST.ATTACK, mp: 75, stop: true });
    seq(fr, 245, [['oneHand0', 4, { prop: 'staff' }], ['oneHand1', 3, { prop: 'staff', opoint: [{ oid: 'sageDisk', x: 30, y: -40 }], sound: 'disk' }], ['cast2', 8, { prop: 'staff' }]], { state: ST.ATTACK, mp: 250, stop: true });
    seq(fr, 260, [['shield', 3, { prop: 'staff' }], ['shield', 3, { prop: 'staff', opoint: [{ oid: 'shieldWall', x: 36, y: 0 }] }], ['cast2', 8, { prop: 'staff' }]], { state: ST.ATTACK, mp: 100, stop: true });
    seq(fr, 275, [['heal', 4, { prop: 'staff', sound: 'heal' }], ['oneHand1', 3, { prop: 'staff', opoint: [{ oid: 'healOrb', x: 40, y: -40 }] }], ['cast2', 8, { prop: 'staff' }]], { state: ST.ATTACK, mp: 350, stop: true });
    seq(fr, 290, [['spinStaff', 6, { prop: 'staff', sound: 'heal' }], ['spinStaff', 10, { prop: 'staff', onEnter: (f, w) => { f.hp = Math.min(Math.max(f.hp, f.darkHp), f.hp + 104); w.fx.sparkle(f.x, f.y - 50, f.z, '#ff9ae0'); w.fx.sparkle(f.x, f.y - 30, f.z, '#ffffff'); } }], ['stand0', 6]], { state: ST.ATTACK, mp: 350, stop: true });
    for (const id of [60, 61, 62, 63, 65, 66, 67, 68, 70, 71, 72]) fr[id].prop = 'staff';
    def.moves = { Fa: 235, Ua: 245, Fj: 260, Uj: 275, Dj: 290 };
  },
  ai: { keepAway: 150, specials: [{ type: 'Fa', min: 90, max: 460, z: 14, w: 1.2 }, { type: 'Ua', min: 120, max: 600, z: 300, w: 0.8, any: true }, { type: 'Fj', min: 60, max: 260, z: 20, w: 0.5, when: (f, t, w) => w.entities.some((e) => e.kind === 'proj' && e.team !== f.team && Math.abs(e.x - f.x) < 220) }, { type: 'Uj', min: 0, max: 9999, z: 9999, w: 1.5, any: true, when: (f, t, w) => w.alliesOf(f).some((a) => a !== f && a.hp < a.darkHp - 60 && Math.abs(a.x - f.x) < 120) }, { type: 'Dj', min: 140, max: 9999, z: 9999, w: 2, any: true, when: (f) => f.hp < f.darkHp - 80 }] },
  moveList: [['D>A', '能量弹', 75], ['D^A', '追踪飞盘(无视盔甲)', 250], ['D>J', '能量盾(阻挡/反弹)', 100], ['D^J', '治疗光球(先碰者受益)', 350], ['DvJ', '自我治疗', 350]],
}));

// ================================================================ 8 罗宁 Ronin(Deep 定位)
const SW = { w: 52, h: 46, injury: 15, fall: 20, dvx: 3, bdefend: 20, effect: 1, vrest: 4 };
add(makeChar('ronin', {
  name: 'Ronin',
  look: { skin: '#e2b088', hair: 'ponytail', hairCol: '#14141a', shirt: '#e8e4d8', top: 'long', sleeveCol: '#e8e4d8', vest: '#4a5a8a', pants: '#2a3050', robe: '#2a3050', robeLen: 10, shoes: '#3a2a1a', belt: '#c02020', sash: true, backItem: 'sword', bulk: 1.08 },
  role: '浪人剑客', desc: '普通攻击就是挥剑;剑气最多三连;Strike 上挑可连斩并接跃斩;突进连斩四刀可上下走位;跑攻无视防御。',
  build(fr, def) {
    for (const id of [60, 61, 62, 63, 65, 66, 67, 68, 70, 71, 72, 85, 86, 87, 90, 91, 92]) fr[id].prop = 'sword';
    for (const id of [61, 66]) fr[id].itr = [{ ...HIT.punch, at: 'haF', w: 40, dx: 10, effect: 1, injury: 22 }];
    fr[71].itr = [{ ...HIT.superPunch, at: 'haF', w: 44, dx: 10, effect: 1 }];
    fr[86].itr = [{ ...HIT.runAtk, at: 'haF', w: 44, dx: 10, effect: 1, bdefend: 100 }];
    const wave = { opoint: [{ oid: 'blade', x: 30, y: -46, zFromInput: 1.2 }], sound: 'sword' };
    fr[235] = F(235, 'sword0', ST.ATTACK, 3, 236, { mp: 75, stop: true, prop: 'sword' });
    fr[236] = F(236, 'sword1', ST.ATTACK, 3, 237, { prop: 'sword', ...wave });
    fr[237] = F(237, 'sword2', ST.ATTACK, 5, END, { prop: 'sword', hit_a: 238 });
    fr[238] = F(238, 'sword0', ST.ATTACK, 2, 239, { mp: 75, prop: 'sword' });
    fr[239] = F(239, 'sword1', ST.ATTACK, 3, 240, { prop: 'sword', ...wave });
    fr[240] = F(240, 'sword2', ST.ATTACK, 5, END, { prop: 'sword', hit_a: 241 });
    fr[241] = F(241, 'sword0', ST.ATTACK, 2, 242, { mp: 75, prop: 'sword' });
    fr[242] = F(242, 'sword1', ST.ATTACK, 3, 243, { prop: 'sword', ...wave });
    fr[243] = F(243, 'sword2', ST.ATTACK, 8, END, { prop: 'sword' });
    // DvA Strike(每刀 75):上挑击飞,再按 A 续斩,按 J 接跃斩
    seq(fr, 250, [['upper0', 2, { prop: 'sword' }], ['swordUp', 4, { prop: 'sword', dvx: 3, itr: [{ at: 'haF', w: 46, h: 56, injury: 40, fall: 70, dvx: 4, dvy: -13, bdefend: 50, effect: 1 }], sound: 'sword' }], ['swordUp', 6, { prop: 'sword', hit_a: 250, hit_j: 266 }]], { state: ST.ATTACK, mp: 75 });
    // D>J 突进连斩(150):四刀,可上下走位
    const st = { prop: 'sword', dvx: 7 };
    seq(fr, 255, [
      ['sword0', 2, st], ['sword1', 2, { ...st, itr: [{ ...SW, at: 'haF', dx: 8 }], sound: 'sword' }],
      ['sword0', 2, st], ['sword1', 2, { ...st, itr: [{ ...SW, at: 'haF', dx: 8 }], sound: 'sword' }],
      ['sword0', 2, st], ['sword1', 2, { ...st, itr: [{ ...SW, at: 'haF', dx: 8 }], sound: 'sword' }],
      ['sword0', 2, st], ['sword1', 3, { prop: 'sword', dvx: 6, itr: [{ ...SW, at: 'haF', dx: 8, injury: 35, fall: 70, dvx: 10, dvy: -7 }], sound: 'swing_heavy' }], ['sword2', 8, { prop: 'sword' }],
    ], { state: ST.ATTACK, mp: 150, steer: { z: 2 } });
    // D^J 跃斩:起跳免费,空中按 A 下劈耗 75
    seq(fr, 266, [['crouch', 2, { prop: 'sword' }], ['swordUp', 4, { prop: 'sword', dvy: -15, dvx: 6, sound: 'jump', hit_a: 269 }], ['swordUp', 30, { prop: 'sword', hit_a: 269 }]], { state: ST.JUMP, air: true, landTo: 215 });
    fr[269] = F(269, 'sword1', ST.ATTACK, 30, 270, { prop: 'sword', mp: 75, dvy: 7, itr: [{ at: 'haF', w: 60, h: 62, dx: 6, injury: 55, fall: 70, dvx: 10, dvy: -10, bdefend: 70, effect: 1 }], landTo: 270, air: true, sound: 'swing_heavy' });
    fr[270] = F(270, 'slam1', ST.ATTACK, 10, END, { prop: 'sword', onEnter: (f, w) => { w.fx.dust(f.x + f.facing * 30, f.z, 2); w.shakeCam(4); w.sfx('hit_heavy', f); }, itr: [{ at: 'haF', w: 90, h: 30, injury: 30, fall: 70, dvx: 8, dvy: -10, bdefend: 70, zw: 30 }] });
    def.moves = { Fa: 235, Da: 250, Fj: 255, Uj: 266 };
  },
  ai: { specials: [{ type: 'Fa', min: 90, max: 460, z: 14, w: 1.5, mash: 4 }, { type: 'Da', min: 0, max: 56, z: 12, w: 1.2, mash: 2 }, { type: 'Fj', min: 0, max: 90, z: 16, w: 1.2 }, { type: 'Uj', min: 80, max: 170, z: 16, w: 0.8, mash: 6 }] },
  moveList: [['A', '挥剑(跑攻无视防御)', ''], ['D>A', '剑气(连按 A 最多三发)', 75], ['DvA', 'Strike 上挑(A 续斩 / J 接跃斩)', '75/刀'], ['D^J', '跃斩(空中按 A 下劈)', 75], ['D>J', '突进连斩(可上下走位)', 150]],
}));

// ================================================================ 9 霍克 Hawk(Henry 定位)
add(makeChar('hawk', {
  name: 'Hawk',
  look: { skin: '#f2cca4', hair: 'short', hairCol: '#c89040', shirt: '#4a7a30', top: 'tshirt', vest: '#6a4a24', pants: '#3a3a28', shoes: '#5a3a1a', belt: '#2a1a0a', hat: '#2f5a24', feather: '#e04030', backItem: 'quiver', bracer: '#6a4a24' },
  role: '神射手', desc: '普通攻击永远是射箭(每支 12 MP,空中射箭 20,MP 不足时用弓砸);龙掌风推开敌人;多重射击扇形连发;会心一击穿透并无视盔甲;死亡奏鸣令周围敌人浮空且不可防御。近身很弱。',
  stats: { walking_speed: 4.6 },
  build(fr, def) {
    seq(fr, 300, [['bowDraw', 4, { prop: 'bowDraw' }], ['bowShoot', 2, { prop: 'bow', opoint: [{ oid: 'arrow', x: 24, y: -54, zFromInput: 0.6 }], sound: 'arrow' }], ['bowShoot', 4, { prop: 'bow' }]], { state: ST.ATTACK, stop: true, mp: 12 });
    seq(fr, 304, [['bowSwing0', 2, { prop: 'bow' }], ['bowSwing1', 3, { prop: 'bow', itr: [{ at: 'haF', w: 30, h: 36, injury: 18, fall: 25, dvx: 4, bdefend: 16 }], sound: 'swing' }], ['bowShoot', 3, { prop: 'bow' }]], { state: ST.ATTACK });
    seq(fr, 308, [['bowDraw', 2, { prop: 'bowDraw' }], ['bowShoot', 2, { prop: 'bow', opoint: [{ oid: 'arrowDown', x: 22, y: -50 }], sound: 'arrow' }], ['bowShoot', 30, { prop: 'bow' }]], { state: ST.ATTACK, mp: 20, air: true });
    seq(fr, 235, [['palm0', 4], ['palm1', 3, { opoint: [{ oid: 'dragonWind', x: 26, y: 0 }], sound: 'charge' }], ['palm1', 10]], { state: ST.ATTACK, mp: 150, stop: true });
    seq(fr, 245, [['bowDraw', 4, { prop: 'bowDraw' }], ['bowShoot', 3, { prop: 'bow', opoint: [{ oid: 'arrow', x: 24, y: -54, count: 5, spreadZ: 9, dvy: 0 }], sound: 'arrow' }], ['bowShoot', 6, { prop: 'bow', hit_a: 248 }]], { state: ST.ATTACK, mp: 150, stop: true });
    seq(fr, 248, [['bowDraw', 3, { prop: 'bowDraw' }], ['bowShoot', 3, { prop: 'bow', opoint: [{ oid: 'arrow', x: 24, y: -54, count: 5, spreadZ: 9, dvy: 0 }], sound: 'arrow' }], ['bowShoot', 6, { prop: 'bow', hit_a: 248 }]], { state: ST.ATTACK, mp: 100 });
    seq(fr, 260, [['bowDraw', 10, { prop: 'bowDraw', sound: 'charge' }], ['bowShoot', 3, { prop: 'bow', opoint: [{ oid: 'critArrow', x: 24, y: -54 }], sound: 'arrow' }], ['bowShoot', 6, { prop: 'bow' }]], { state: ST.ATTACK, mp: 200, stop: true });
    seq(fr, 275, [['flute', 6, { prop: 'flute', sound: 'heal' }], ['flute', 40, { prop: 'flute', opoint: [{ oid: 'sonata', x: 0, y: 0 }] }], ['flute', 6, { prop: 'flute' }]], { state: ST.ATTACK, mp: 350, stop: true });
    def.moves = { Fa: 235, ja: 245, Fj: 260, Uj: 275 };
    def.normalAttack = (f) => (f.mp >= 12 ? 300 : 304);
    def.jumpAttack = (f) => (f.mp >= 20 ? 308 : 80);
  },
  passive(f, w) { if (f.frameId === 276 && w.tick % 6 === 0) w.fx.sparkle(f.x + (rnd() - 0.5) * 200, f.y - 40 - rnd() * 60, f.z, '#e0d0ff'); },
  ai: { keepAway: 180, specials: [{ type: 'Fa', min: 30, max: 150, z: 16, w: 1.2 }, { type: 'ja', min: 100, max: 460, z: 40, w: 1.2 }, { type: 'Fj', min: 120, max: 520, z: 16, w: 1 }, { type: 'Uj', min: 0, max: 130, z: 50, w: 0.6 }] },
  moveList: [['A', '射箭(每支 12 MP;空中 20)', ''], ['D>A', '龙掌风', 150], ['DJA', '多重射击(再按 A 续射 100)', 150], ['D>J', '会心一击(穿透,无视盔甲)', 200], ['D^J', '死亡奏鸣(不可防御)', 350]],
}));

// ================================================================ 10 夏德 Shade(Rudolf 定位)
function copyOf(f, w, def) {
  if (!def || def.boss) return false;
  f.def = def; f.lastCopy = def;
  w.fx.smoke(f.x, f.y - 40, f.z); w.fx.smoke(f.x + 10, f.y - 30, f.z);
  for (const e of w.entities) if (e.kind === 'char' && e.cloneOf === f && !e.dead) { e.def = def; w.fx.smoke(e.x, e.y - 40, e.z); }
  return true;
}
add(makeChar('shade', {
  name: 'Shade',
  look: { skin: '#e8b890', hair: 'ninja', hoodCol: '#2a1a3a', shirt: '#2a1a3a', top: 'long', sleeveCol: '#2a1a3a', pants: '#1e1428', shoes: '#141018', belt: '#a02040', sash: true, scarf: '#a02040', bracer: '#5a4a6a' },
  role: '影忍', desc: '普攻第二击掷出手里剑(15 MP);多重手里剑可连发;抓住敌人时 DJA 变身成对方并使用其招式,再 DJA 变回,之后站立 DJA 可再变成最近复制的角色;隐身期间 MP 不回复;分身由电脑控制,MP 上限 150。',
  stats: { walking_speed: 5.4, running_speed: 11, jump_distance: 11 },
  build(fr, def) {
    seq(fr, 300, [['wpnThrow0', 2], ['wpnThrow1', 2, { opoint: [{ oid: 'shuriken', x: 22, y: -52, zFromInput: 0.6 }], sound: 'shuriken' }], ['wpnA2', 4]], { state: ST.ATTACK, mp: 15 });
    seq(fr, 235, [['wpnThrow0', 2], ['wpnThrow1', 3, { opoint: [{ oid: 'shuriken', x: 22, y: -52, count: 3, spreadZ: 8 }], sound: 'shuriken' }], ['wpnA2', 5, { hit_a: 235 }]], { state: ST.ATTACK, mp: 100, stop: true });
    seq(fr, 245, [
      ['crouch', 2], ['flipK0', 2, { dvy: -11, dvx: 10, sound: 'jump' }], ['flipK3', 3],
      ['dive', 30, { dvy: 8, dvx: 8, itr: [{ at: 'haF', w: 40, h: 40, injury: 45, fall: 70, dvx: 10, dvy: -8, bdefend: 50, effect: 1 }] }],
    ], { state: ST.ATTACK, air: true, landTo: 215 });
    seq(fr, 260, [['pray', 6, { sound: 'teleport' }], ['pray', 6, { onEnter: (f, w) => { f.invisible = 210; w.fx.smoke(f.x, f.y - 40, f.z); w.fx.smoke(f.x, f.y - 20, f.z); } }]], { state: ST.ATTACK, mp: 350, stop: true });
    seq(fr, 275, [['pray', 8, { sound: 'transform' }], ['pose', 8, { onEnter: (f, w) => { if (w.spawnClone) w.spawnClone(f); } }]], { state: ST.ATTACK, mp: 350, stop: true });
    // 抓取变身(150):保持抓住
    fr[290] = F(290, 'catch1', ST.CATCHING, 6, 291, { mp: 150, sound: 'transform', keepCatch: true, cpoint: { x: 26, y: -2 } });
    fr[291] = F(291, 'catch0', ST.CATCHING, 4, 120, { keepCatch: true, cpoint: { x: 26, y: -2 }, onEnter: (f, w) => { if (f.catching) copyOf(f, w, f.catching.baseDef); } });
    // 站立 DJA:在本体与最近复制的角色之间切换(免费)
    seq(fr, 294, [['pray', 6, { sound: 'transform' }], ['pose', 6, { onEnter: (f, w) => { if (f.def !== f.baseDef) { f.def = f.baseDef; w.fx.smoke(f.x, f.y - 40, f.z); } else copyOf(f, w, f.lastCopy); } }]], { state: ST.TRANSFORM, stop: true, cond: (f) => !!f.lastCopy || f.def !== f.baseDef });
    def.moves = { Fa: 235, Fj: 245, Uj: 260, Dj: 275, ja: 294 };
    def.catchMoves = { ja: 290 };
    def.normalAttack = (f) => { f.punchK = (f.punchK || 0) + 1; return f.punchK % 2 === 0 && f.mp >= 15 ? 300 : 60; };
  },
  ai: { specials: [{ type: 'Fa', min: 80, max: 400, z: 20, w: 1.5, mash: 4 }, { type: 'Fj', min: 80, max: 170, z: 14, w: 1 }, { type: 'Uj', min: 0, max: 9999, z: 9999, w: 0.2, any: true }, { type: 'Dj', min: 0, max: 9999, z: 9999, w: 0.3, any: true }] },
  moveList: [['A', '第二击掷手里剑(15 MP)', ''], ['D>A', '多重手里剑(连按 A)', 100], ['D>J', '飞燕斩', 0], ['D^J', '隐身(MP 不回复)', 350], ['DvJ', '分身', 350], ['抓·DJA', '变身成被抓者', 150], ['DJA', '本体 ↔ 最近复制的角色', 0]],
}));

export { CHARS };
