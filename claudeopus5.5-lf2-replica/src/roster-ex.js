// 角色名单(关卡敌人 / 首领 / 合体):13 名原创角色,对应 LF2 原版 9 名杂兵与 4 名隐藏首领的定位与招式。
// 选人画面键入秘技 lf2.net 可选用。必须在 roster.js 之后加载(main.js 中按顺序导入)。
import { makeChar, ballMove, seq, F, ST, END, HIT, CHARS } from './charbase.js';
import { defProj } from './objects.js';
import { add, drain, BALL } from './roster.js';
import { rnd, sign, clamp } from './util.js';

defProj('viperBall', BALL('#f0e040', 35, 30, { speed: 14 }));
defProj('monkPalm', { render: 'palm', color: '#80c0ff', r: 15, speed: 10, life: 16, size: 16, h: 44, pierce: true, reflect: false, power: 3, itr: { injury: 50, fall: 70, dvx: 12, dvy: -7, bdefend: 50, vrest: 30 }, hitSound: 'ball_hit' });
defProj('devil', { render: 'skull', speed: 8, life: 130, size: 10, h: 20, move: 'chase', turn: 0.8, chaseDelay: 8, itr: { injury: 30, fall: 40, dvx: 6, bdefend: 30 }, hitSound: 'ball_hit', trail: '#c080ff' });
defProj('angel', { render: 'heal', speed: 7, life: 150, size: 10, h: 20, move: 'chaseAlly', reflect: false, clash: false, itr: { kind: 8, injury: 104 },
  update(p, w) {
    if (!p.ally || p.ally.dead || p.t % 15 === 0) { let best = null, bd = 1e9; for (const e of w.entities) { if (e.kind !== 'char' || e.team !== p.team || e.dead) continue; const d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z) + (e.hp / e.maxHp) * 300; if (d < bd) { bd = d; best = e; } } p.ally = best; }
    const a = p.ally;
    if (a && p.t > 10) { p.vx = clamp(p.vx + clamp(a.x - p.x, -1, 1) * 0.8, -8, 8); p.vz = clamp((a.z - p.z) * 0.1, -3, 3); p.vy = clamp((a.y - 40 - p.y) * 0.1, -3, 3); }
    else p.vy *= 0.9;
  } });
defProj('wardenBall', BALL('#ff8040', 50, 40, { r: 11 }));
defProj('laser', { render: 'blade', color: '#ff3030', r: 8, speed: 22, life: 30, size: 11, h: 10, itr: { injury: 20, fall: 25, dvx: 4, bdefend: 30 }, power: 1 });
defProj('bat', { render: 'bat', speed: 8, life: 140, size: 8, h: 14, move: 'chase', turn: 1.2, chaseDelay: 8, itr: { injury: 15, fall: 20, dvx: 2, bdefend: 10 }, reflect: false, clash: false, power: 0.3 });
defProj('cannon', { render: 'ball', color: '#ff70ff', r: 14, speed: 15, life: 60, size: 14, h: 26, itr: { injury: 50, fall: 70, dvx: 10, dvy: -6, bdefend: 50 }, hitSound: 'explosion', power: 4 });
defProj('disasterF', { render: 'fireball', r: 12, speed: 6, life: 90, size: 12, h: 22, vy: 6, move: 'chase', turn: 0.6, chaseDelay: 4, itr: { injury: 40, fall: 70, dvx: 6, dvy: -8, bdefend: 60, effect: 2 }, reflect: false, trail: 'fire', hitSound: 'fire' });
defProj('disasterI', { render: 'iceball', r: 11, speed: 6, life: 90, size: 11, h: 22, vy: 6, move: 'chase', turn: 0.6, chaseDelay: 4, itr: { injury: 35, fall: 0, dvx: 4, bdefend: 60, effect: 3 }, reflect: false, hitSound: 'ice' });
defProj('volcanoF', { render: 'firepatch', move: 'still', speed: 0, life: 30, size: 16, h: 72, yOff: 36, ground: true, pierce: true, reflect: false, clash: false, itr: { injury: 30, fall: 70, dvx: 4, dvy: -12, bdefend: 80, effect: 2, vrest: 30 }, noShadow: true, onAppear: (p, w) => w.sfx('fire', p, 0.5) });
defProj('volcanoI', { render: 'icicle', move: 'still', speed: 0, life: 40, size: 12, h: 52, yOff: 26, ground: true, pierce: true, reflect: false, clash: false, itr: { injury: 30, fall: 0, dvx: 2, dvy: -6, bdefend: 80, effect: 3, vrest: 30 }, noShadow: true, onAppear: (p, w) => w.sfx('ice', p, 0.4) });
defProj('skull', { render: 'skull', speed: 10, life: 80, size: 10, h: 20, move: 'chase', turn: 0.7, chaseDelay: 3, itr: { injury: 25, fall: 30, dvx: 5, bdefend: 30 }, hitSound: 'ball_hit', trail: '#a060ff', power: 1 });
defProj('soulBomb', { render: 'skull', speed: 9, life: 70, size: 18, h: 34, scale: 1.8, itr: { injury: 90, fall: 100, dvx: 12, dvy: -10, bdefend: 100, pierceArmor: true }, hitSound: 'explosion', power: 8, trail: '#c080ff', reflect: false, expireExplode: true, hitRender: 'burst', hitTime: 14 });
defProj('bigBang', { render: 'explosion', move: 'still', speed: 0, life: 22, size: 140, h: 160, r: 130, pierce: true, reflect: false, clash: true, power: 99, radial: true, itr: { injury: 135, fall: 100, dvx: 16, dvy: -14, bdefend: 100, vrest: 40, zw: 80 }, noShadow: true, onSpawn: (p, w) => { w.sfx('explosion', p); w.shakeCam(10); } });
defProj('meteorF', { render: 'fireball', r: 13, speed: 0, life: 60, size: 13, h: 24, vy: 9, move: 'arc', gravity: 0.25, itr: { injury: 40, fall: 70, dvx: 6, dvy: -8, bdefend: 60, effect: 2 }, reflect: false, clash: false, onGround: (p, w) => { w.fx.spark(p.x, -6, p.z, 'fire'); w.sfx('explosion', p, 0.4); p.removed = true; } });

const enemyLook = (o) => ({ skin: '#e8b890', pants: '#3a3428', shoes: '#2a1e14', belt: '#1a1410', ...o });
const arrowAtk = (fr, def) => {
  seq(fr, 300, [['bowDraw', 5, { prop: 'bowDraw' }], ['bowShoot', 2, { prop: 'bow', opoint: [{ oid: 'arrow', x: 24, y: -54 }], sound: 'arrow' }], ['bowShoot', 5, { prop: 'bow' }]], { state: ST.ATTACK, stop: true, mp: 12 });
  seq(fr, 308, [['bowDraw', 2, { prop: 'bowDraw' }], ['bowShoot', 2, { prop: 'bow', opoint: [{ oid: 'arrowDown', x: 22, y: -50 }], sound: 'arrow' }], ['bowShoot', 30, { prop: 'bow' }]], { state: ST.ATTACK, mp: 20, air: true });
  def.normalAttack = (f) => (f.mp >= 12 ? 300 : (rnd() < 0.5 ? 60 : 65));
  def.jumpAttack = (f) => (f.mp >= 20 ? 308 : 80);
};

// ---------------------------------------------------------------- 杂兵
add(makeChar('thug', {
  name: 'Thug', hidden: true, soldier: true,
  look: enemyLook({ hair: 'short', hairCol: '#3a2a1a', headband: '#c02020', mask: '#2a2a2a', shirt: '#e8e8e0', top: 'tshirt', pants: '#26304a', gloves: '#e0b020' }),
  role: '山贼(Bandit 定位)', desc: '没有必杀技,移动最慢,成群出现。',
  stats: { walking_speed: 3.6, walking_speedz: 1.8, running_speed: 7.5, jump_distance: 8 },
  extra: { soldierTier: 1 }, ai: { specials: [] }, moveList: [],
}));
add(makeChar('poacher', {
  name: 'Poacher', hidden: true, soldier: true,
  look: enemyLook({ hair: 'short', hairCol: '#6a4a2a', headband: '#c02020', shirt: '#e8e8e0', top: 'tshirt', vest: '#6a4a24', pants: '#3050a0', backItem: 'quiver', gloves: '#e0b020', beard: '#4a3020' }),
  role: '猎人(Hunter 定位)', desc: '没有必杀技,普通攻击与跳跃攻击都是射箭(12 / 20 MP)。',
  stats: { walking_speed: 4.2 },
  build: arrowAtk,
  extra: { soldierTier: 1 }, ai: { keepAway: 200, specials: [] }, moveList: [['A', '射箭(12 MP)', ''], ['空中 A', '向下射箭(20 MP)', '']],
}));
add(makeChar('brute', {
  name: 'Brute', hidden: true,
  look: enemyLook({ skin: '#d8a070', hair: 'mohawk', hairCol: '#2a2a2a', top: 'none', shirt: '#d8a070', pants: '#1f4a4a', shoes: '#4a1a10', belt: '#8a6a20', bulk: 1.3, size: 1.08, bracer: '#3a3a3a', scar: true }),
  role: '壮汉(Mark 定位)', desc: '冲拳与跑攻相同;肩撞冲锋一路撞开敌人并反弹飞行道具,持续耗 MP(J/D 停止)。',
  stats: { walking_speed: 4, running_speed: 8.5 },
  build(fr, def) {
    seq(fr, 235, [['runAtk0', 2], ['runAtk1', 5, { dvx: 10, itr: [{ ...HIT.runAtk, at: 'haF' }], sound: 'swing_heavy', hit_a: 235 }], ['runAtk2', 6, { hit_a: 235 }]], { state: ST.ATTACK, friction: 1 });
    fr[244] = F(244, 'crouch', ST.ATTACK, 3, 245, { mp: 50, sound: 'charge' });
    seq(fr, 245, [['shoulder', 3, { dvx: 12, itr: [{ at: 'sh', w: 46, h: 62, dy: 10, injury: 40, fall: 70, dvx: 11, dvy: -7, bdefend: 60 }], hit_j: 247, hit_d: 247 }]], { state: ST.ATTACK, keepVel: true, steer: { z: 1.5 } }, { next: drain(27, 245, 247) });
    fr[246] = F(246, 'shoulder', ST.ATTACK, 3, 245, { dvx: 12, keepVel: true });
    fr[247] = F(247, 'runAtk2', ST.ATTACK, 8, END, { friction: 1 });
    def.moves = { Fa: 235, Fj: 244 };
  },
  ai: { specials: [{ type: 'Fa', min: 0, max: 70, z: 12, w: 1 }, { type: 'Fj', min: 60, max: 260, z: 12, w: 1.2 }] },
  moveList: [['D>A', '冲拳(0 MP,A 再出)', 0], ['D>J', '肩撞冲锋(J/D 停,反弹飞行道具)', '50+27/步']],
}));
add(makeChar('viper', {
  name: 'Viper', hidden: true,
  look: enemyLook({ skin: '#e8c098', hair: 'bowl', hairCol: '#7a6a5a', shirt: '#f0f0f0', top: 'long', sleeveCol: '#f0f0f0', stripe: '#1a1a1a', pants: '#7a4a5a', shoes: '#2a1a1a', bracer: '#3060c0' }),
  role: '拳师(Jack 定位)', desc: '气功弹在收招时再按 D>A 可再发一枚;闪光踢腾空飞踢,极难防御。',
  build(fr, def) {
    ballMove(fr, 235, 'viperBall', 50, { repeat: false });
    fr[237].hit_Fa = 235;
    seq(fr, 245, [['upper0', 2], ['kickHi', 4, { dvy: -11, dvx: 5, itr: [{ at: 'toeF', w: 32, h: 42, injury: 50, fall: 70, dvx: 6, dvy: -13, bdefend: 100 }], sound: 'kick' }], ['jumpTop', 40]], { state: ST.ATTACK, mp: 125, air: true, landTo: 215 });
    def.moves = { Fa: 235, Ua: 245 };
  },
  ai: { specials: [{ type: 'Fa', min: 90, max: 460, z: 14, w: 1.5 }, { type: 'Ua', min: 0, max: 60, z: 12, w: 1 }] },
  moveList: [['D>A', '气功弹(收招时 D>A 再发)', 50], ['D^A', '闪光踢(难以防御)', 125]],
}));
add(makeChar('hexer', {
  name: 'Hexer', hidden: true,
  look: enemyLook({ hair: 'hood', hoodCol: '#2a6a3a', shirt: '#2a6a3a', top: 'robe', sleeveCol: '#2a6a3a', robe: '#245a32', robeLen: 14, robeTrim: '#d8c8a0', scarf: '#d8c8a0', shoes: '#4a2a14', skin: '#d8b8a0' }),
  role: '巫师(Sorcerer 定位)', desc: '火球、冰冻弹各一发;能治疗他人或自己(只回到暗红上限)。',
  build(fr, def) {
    ballMove(fr, 235, 'fireBall', 75, { sound: 'fire', repeat: false, common: { prop: 'staff' } });
    ballMove(fr, 245, 'iceBall', 125, { repeat: false, sound: 'ice', common: { prop: 'staff' } });
    seq(fr, 260, [['heal', 4, { prop: 'staff', sound: 'heal' }], ['oneHand1', 3, { prop: 'staff', opoint: [{ oid: 'healOrb', x: 40, y: -40 }] }], ['cast2', 8, { prop: 'staff' }]], { state: ST.ATTACK, mp: 350, stop: true });
    seq(fr, 275, [['spinStaff', 6, { prop: 'staff', sound: 'heal' }], ['spinStaff', 10, { prop: 'staff', onEnter: (f, w) => { f.hp = Math.min(Math.max(f.hp, f.darkHp), f.hp + 104); w.fx.sparkle(f.x, f.y - 50, f.z, '#a0ffa0'); } }], ['stand0', 6]], { state: ST.ATTACK, mp: 350, stop: true });
    def.moves = { Fa: 235, Fj: 245, Uj: 260, Dj: 275 };
  },
  ai: { keepAway: 170, specials: [{ type: 'Fa', min: 90, max: 460, z: 14, w: 1.2 }, { type: 'Fj', min: 90, max: 460, z: 14, w: 1 }, { type: 'Dj', min: 120, max: 9999, z: 9999, w: 2, any: true, when: (f) => f.hp < f.darkHp - 80 }] },
  moveList: [['D>A', '火球', 75], ['D>J', '冰冻弹', 125], ['D^J', '治疗他人', 350], ['DvJ', '治疗自己', 350]],
}));
add(makeChar('monk', {
  name: 'Monk', hidden: true,
  look: enemyLook({ hair: 'bald', skin: '#e0a878', shirt: '#7a4a24', top: 'robe', sleeveCol: '#e0a878', robe: '#6a3a1a', robeLen: 8, robeTrim: '#3a2010', shoes: '#1a1a1a', belt: '#2a1a10', bulk: 1.15 }),
  role: '武僧(Monk 定位)', desc: '少林掌:蓄力时处于防御状态,随后推出掌风;收招时再 D>A 续发(75)。跑攻同样带防御。',
  build(fr, def) {
    seq(fr, 235, [['defend1', 6, { defendState: true }], ['palm1', 3, { opoint: [{ oid: 'monkPalm', x: 26, y: -46 }], itr: [{ at: 'haF', w: 32, h: 30, injury: 30, fall: 40, dvx: 6, bdefend: 30 }], sound: 'ball_launch' }], ['palm1', 8, { hit_Fa: 240 }]], { state: ST.ATTACK, mp: 100, stop: true });
    seq(fr, 240, [['defend1', 4, { defendState: true }], ['palm1', 3, { opoint: [{ oid: 'monkPalm', x: 26, y: -46 }], sound: 'ball_launch' }], ['palm1', 8, { hit_Fa: 240 }]], { state: ST.ATTACK, mp: 75, stop: true });
    for (const id of [85, 86]) fr[id].defendState = true;
    def.moves = { Fa: 235 };
  },
  ai: { specials: [{ type: 'Fa', min: 0, max: 150, z: 14, w: 1.4 }] },
  moveList: [['D>A', '少林掌(蓄力带防御,收招再 D>A 续发 75)', 100], ['被动', '跑攻带防御', '']],
}));
add(makeChar('mira', {
  name: 'Mira', hidden: true,
  look: enemyLook({ skin: '#f6d8c0', hair: 'ponytail', hairCol: '#1a2a5a', shirt: '#f0a0c8', top: 'robe', sleeveCol: '#f0a0c8', robe: '#e890b8', robeLen: 14, robeTrim: '#ffffff', shoes: '#3060c0', belt: '#ffffff', gloves: '#f0a0c8', eyeCol: '#3a6ad0' }),
  role: '修女(Jan 定位)', desc: '恶魔审判放出追踪恶灵;天使祝福召唤天使飞向同伴(含自己)治疗。防御时可反弹飞行道具。',
  build(fr, def) {
    seq(fr, 235, [['pray', 6, { sound: 'charge' }], ['castUp', 3, { opoint: [{ oid: 'devil', x: 10, y: -70, count: 3, spreadZ: 14, dvy: -3 }] }], ['cast2', 8]], { state: ST.ATTACK, mp: 150, stop: true });
    seq(fr, 245, [['pray', 6, { sound: 'heal' }], ['castUp', 3, { opoint: [{ oid: 'angel', x: 0, y: -80, dvx: 0, dvy: -3, count: 3, spreadZ: 18 }] }], ['cast2', 8]], { state: ST.ATTACK, mp: 200, stop: true });
    def.moves = { Ua: 235, Uj: 245 };
  },
  extra: { shield: true },
  ai: { keepAway: 160, specials: [{ type: 'Ua', min: 80, max: 600, z: 300, w: 1.2, any: true }, { type: 'Uj', min: 0, max: 9999, z: 9999, w: 2.5, any: true, when: (f, t, w) => w.alliesOf(f).some((a) => a.hp < a.darkHp - 70) }] },
  moveList: [['D^A', '恶魔审判(追踪恶灵)', 150], ['D^J', '天使祝福(治疗同伴与自己)', 200], ['被动', '防御时反弹飞行道具', '']],
}));
add(makeChar('sentinel', {
  name: 'Sentinel', hidden: true,
  look: enemyLook({ hair: 'helmet', helmetCol: '#7a90b0', plume: '#c02020', shirt: '#3050a0', top: 'long', armor: '#8aa0c0', armArmor: '#7a90b0', legArmor: '#6a80a0', pauldron: '#9ab0d0', shoes: '#4a5a6a', cape: '#2a3a8a', size: 1.12 }),
  role: '重甲骑士(Knight 定位)', desc: '2 级盔甲可连吃两下攻击;持盾防御时反弹飞行道具;D>A 三段剑技(0 MP,连按 A 延续)。',
  stats: { walking_speed: 3.8, running_speed: 8 },
  build(fr, def) {
    for (const id of [60, 61, 62, 63, 65, 66, 67, 68, 70, 71, 72, 85, 86, 87]) fr[id].prop = 'sword';
    for (const id of [61, 66]) fr[id].itr = [{ ...HIT.punch, at: 'haF', w: 40, dx: 10, effect: 1, injury: 24 }];
    const S1 = { at: 'haF', w: 52, h: 46, dx: 8, injury: 30, fall: 30, dvx: 4, bdefend: 30, effect: 1 };
    seq(fr, 235, [['sword0', 3, { prop: 'sword' }], ['sword1', 3, { prop: 'sword', itr: [S1], sound: 'sword', dvx: 4 }], ['sword2', 5, { prop: 'sword', hit_a: 238 }]], { state: ST.ATTACK });
    seq(fr, 238, [['wpnB0', 2, { prop: 'sword' }], ['wpnB1', 3, { prop: 'sword', itr: [S1], sound: 'sword', dvx: 4 }], ['wpnB2', 5, { prop: 'sword', hit_a: 241 }]], { state: ST.ATTACK });
    seq(fr, 241, [['sword0', 3, { prop: 'sword' }], ['sword1', 4, { prop: 'sword', itr: [{ ...S1, injury: 45, fall: 70, dvx: 11, dvy: -8, bdefend: 60 }], sound: 'swing_heavy', dvx: 6 }], ['sword2', 8, { prop: 'sword' }]], { state: ST.ATTACK });
    def.moves = { Fa: 235 };
  },
  extra: { armorLevel: 2, shield: true, defenseK: 0.9 },
  ai: { specials: [{ type: 'Fa', min: 0, max: 70, z: 12, w: 1.5, mash: 6 }] },
  moveList: [['D>A', '三段剑技(连按 A)', 0], ['被动', '2 级盔甲、持盾反弹', '']],
}));
add(makeChar('warden', {
  name: 'Warden', hidden: true,
  look: enemyLook({ skin: '#d8a888', hair: 'short', hairCol: '#9a9aa0', mask: '#5a5a64', shirt: '#2f4a2f', top: 'long', sleeveCol: '#2f4a2f', vest: '#6a4a24', pants: '#24341f', shoes: '#1a1a1a', belt: '#8a7a40' }),
  role: '典狱长(Justin 定位)', desc: '狼拳突进连打,收招再按 A 追加第二轮;气功弹。',
  build(fr, def) {
    ballMove(fr, 235, 'wardenBall', 75, { repeat: false });
    const WP = { w: 34, h: 30, injury: 12, fall: 10, dvx: 4, bdefend: 14, vrest: 2 };
    const flurry = (id, mp) => seq(fr, id, [
      ['manyPunch0', 2, { itr: [{ ...WP, at: 'haF' }], dvx: 6, sound: 'swing' }], ['manyPunch1', 2, { itr: [{ ...WP, at: 'haB' }], dvx: 6, sound: 'swing' }],
      ['manyPunch0', 2, { itr: [{ ...WP, at: 'haF' }], dvx: 6, sound: 'swing' }], ['manyPunch1', 2, { itr: [{ ...WP, at: 'haB' }], dvx: 6, sound: 'swing' }],
      ['super1', 4, { itr: [{ at: 'haF', w: 34, h: 30, injury: 30, fall: 70, dvx: 9, dvy: -7, bdefend: 60 }], sound: 'swing_heavy', dvx: 4, hit_a: id === 245 ? 255 : undefined }], ['super2', 6, { hit_a: id === 245 ? 255 : undefined }],
    ], { state: ST.ATTACK, mp });
    flurry(245, 75); flurry(255, 75);
    def.moves = { Fa: 235, Da: 245 };
  },
  ai: { specials: [{ type: 'Fa', min: 80, max: 460, z: 14, w: 1.3 }, { type: 'Da', min: 0, max: 70, z: 12, w: 1.3, mash: 3 }] },
  moveList: [['D>A', '气功弹', 75], ['DvA', '狼拳(收招再 A 追加,75)', 75]],
}));

// ---------------------------------------------------------------- 隐藏首领
add(makeChar('nocturne', {
  name: 'Nocturne', hidden: true,
  look: enemyLook({ skin: '#e8e0e8', hair: 'spiky', hairCol: '#3a2018', shirt: '#7a1a24', top: 'vest', vest: '#5a0a14', pants: '#3a3a40', shoes: '#0a0a10', cape: '#2a0a10', eyeCol: '#ff2020', bracer: '#111111' }),
  role: '夜之君主(Bat 定位)', desc: '疾风拳快如闪电且冲刺中处于防御状态;眼中连射五道血光;召唤追踪蝙蝠群。',
  stats: { walking_speed: 5.4, running_speed: 11 },
  build(fr, def) {
    seq(fr, 235, [['oneHand0', 3], ['stand1', 2, { opoint: [{ oid: 'laser', x: 14, y: -64 }], sound: 'thunder' }], ['stand1', 2, { opoint: [{ oid: 'laser', x: 14, y: -64, dvy: -0.6 }] }], ['stand1', 2, { opoint: [{ oid: 'laser', x: 14, y: -64, dvy: 0.6 }] }], ['stand1', 2, { opoint: [{ oid: 'laser', x: 14, y: -64 }], sound: 'thunder' }], ['stand1', 2, { opoint: [{ oid: 'laser', x: 14, y: -64, dvy: 0.3 }] }], ['stand1', 8]], { state: ST.ATTACK, mp: 125, stop: true });
    seq(fr, 245, [['punchA0', 2, { defendState: true }], ['runAtk1', 6, { dvx: 20, defendState: true, itr: [{ at: 'haF', w: 38, h: 36, injury: 50, fall: 70, dvx: 12, dvy: -7, bdefend: 60 }], sound: 'dash' }], ['runAtk2', 8]], { state: ST.ATTACK, mp: 50, friction: 1.2 });
    seq(fr, 260, [['castUp', 6, { sound: 'charge' }], ['castUp', 4, { opoint: [{ oid: 'bat', x: 0, y: -70, count: 6, spreadZ: 10, spreadY: 3, dvy: -3 }] }], ['castUp', 10]], { state: ST.ATTACK, mp: 200, stop: true });
    def.moves = { Fa: 235, Fj: 245, Uj: 260 };
  },
  ai: { specials: [{ type: 'Fa', min: 80, max: 460, z: 12, w: 1.3 }, { type: 'Fj', min: 40, max: 220, z: 12, w: 1.3 }, { type: 'Uj', min: 0, max: 9999, z: 9999, w: 0.6, any: true }] },
  moveList: [['D>A', '血光眼(五连射)', 125], ['D>J', '疾风拳(冲刺中防御)', 50], ['D^J', '蝙蝠群', 200]],
}));
add(makeChar('gallantEx', {
  name: 'Gallant EX', hidden: true,
  look: { skin: '#f0c8a0', hair: 'swept', hairCol: '#f0d870', shirt: '#3060c0', top: 'tshirt', pants: '#f0f0f0', shoes: '#1a1a1a', belt: '#d8b850', eyeCol: '#3060c0' },
  role: '卸甲骑士(Louis EX 定位)', desc: '跑得最快、跳得最高,跑动中撞到人也会伤人;一次跳跃可出两次跳踢。凤凰掌可连发,凤凰之舞三段连击不可打断。没有盔甲。',
  stats: { walking_speed: 5.6, running_speed: 13, jump_height: -18.5, jump_distance: 11, dash_distance: 21 },
  build(fr, def) {
    // 跑动带判定
    for (const id of [9, 10, 11]) fr[id].itr = [{ at: 'sh', w: 30, h: 50, dy: 14, injury: 20, fall: 40, dvx: 8, bdefend: 30, vrest: 15 }];
    seq(fr, 235, [['palm0', 3], ['palm1', 3, { opoint: [{ oid: 'palmWave', x: 30, y: -48, scale: 1.2 }], sound: 'charge' }], ['palm1', 6, { hit_a: 235 }]], { state: ST.ATTACK, mp: 100, stop: true });
    // DvA 凤凰之舞:晕眩 → 弹起 → 终结,期间不可打断
    seq(fr, 245, [
      ['trident0', 2, { prop: 'trident', bdy: null }],
      ['trident1', 4, { prop: 'trident', bdy: null, dvx: 4, itr: [{ at: 'haF', w: 50, h: 40, dx: 10, injury: 25, fall: 50, dvx: 2, bdefend: 40 }], sound: 'sword' }],
      ['trident0', 2, { prop: 'trident', bdy: null }],
      ['trident1', 4, { prop: 'trident', bdy: null, dvx: 4, itr: [{ at: 'haF', w: 50, h: 40, dx: 10, injury: 25, fall: 70, dvx: 3, dvy: -10, bdefend: 40 }], sound: 'sword' }],
      ['swordUp', 4, { prop: 'trident', bdy: null, itr: [{ at: 'haF', w: 50, h: 60, injury: 40, fall: 70, dvx: 10, dvy: -12, bdefend: 60 }], sound: 'swing_heavy' }],
      ['stand2', 6],
    ], { state: ST.ATTACK });
    seq(fr, 280, [['runAtk0', 2], ['runAtk1', 6, { itr: [{ at: 'haF', w: 44, h: 40, injury: 45, fall: 70, dvx: 12, dvy: -7, bdefend: 60, vrest: 4 }], sound: 'thunder', dvx: 7 }], ['runAtk2', 6]], { state: ST.ATTACK, mp: 30, friction: 0.8 });
    seq(fr, 285, [['dashAtk0', 1], ['lunge', 8, { itr: [{ at: 'haF', w: 44, h: 42, injury: 85, fall: 70, dvx: 14, dvy: -8, bdefend: 60 }], sound: 'thunder' }], ['jumpTop', 30]], { state: ST.ATTACK, mp: 40, air: true, landTo: 215 });
    // 一次跳跃两次跳踢
    fr[82].hit_a = (f) => { if (f.extraKick) return null; f.extraKick = true; return 80; };
    fr[211].onEnter = (f) => { f.extraKick = false; };
    def.moves = { Fa: 235, Da: 245 };
    def.runAttack = (f) => (f.mp >= 30 ? 280 : 85);
    def.dashAttack = (f) => (f.mp >= 40 ? 285 : 90);
  },
  ai: { specials: [{ type: 'Fa', min: 30, max: 220, z: 14, w: 1.3, mash: 3 }, { type: 'Da', min: 0, max: 56, z: 12, w: 1.4 }] },
  moveList: [['D>A', '凤凰掌(连按 A 连发)', 100], ['DvA', '凤凰之舞(三段,不可打断)', 0], ['跑+A', '雷光拳', 30], ['跑+J+A', '雷光拳二式', 40], ['被动', '跑动撞人、一跳两踢', '']],
}));
add(makeChar('tempest', {
  name: 'Tempest', hidden: true,
  look: { skin: '#d8a878', hair: 'swept', hairCol: '#3ab8a0', shirt: '#d8a820', top: 'long', sleeveCol: '#d8a820', vest: '#8a8a8a', pants: '#2a2a5a', shoes: '#1a1a2a', belt: '#2a2a5a', cape: '#7a7a80', eyeCol: '#ff2020' },
  role: '冰火合体(Firzen 定位)', desc: '冰火大炮持续开火(J/D 停);天灾召唤追踪的火球与冰弹,敌人越多越密;冰火火山喷发时处于防御状态。防御可反弹飞行道具,MP 回复更快。DJA 分离回 Pyra 与 Glacia。',
  build(fr, def) {
    fr[234] = F(234, 'cast0', ST.ATTACK, 3, 235, { mp: 25, stop: true });
    seq(fr, 235, [['cast1', 3, { opoint: [{ oid: 'cannon', x: 30, y: -48 }], sound: 'explosion', hit_j: 237, hit_d: 237 }], ['cast2', 3, { hit_j: 237, hit_d: 237 }]], { state: ST.ATTACK }, { next: drain(14, 235, 237) });
    fr[237] = F(237, 'cast2', ST.ATTACK, 8, END);
    seq(fr, 245, [['castUp', 8, { sound: 'charge' }], ['castUp', 4, { onEnter: (f, w) => {
      const n = Math.min(8, 2 + w.enemiesOf(f).length * 2);
      for (let i = 0; i < n; i++) { const tg = w.enemiesOf(f)[i % Math.max(1, w.enemiesOf(f).length)]; const x = tg ? tg.x + (rnd() - 0.5) * 80 : f.x + f.facing * (60 + i * 30); const p = w.addProj(i % 2 ? 'disasterI' : 'disasterF', f, { x, y: -320 - i * 30, z: tg ? tg.z : f.z, vx: 0 }); p.t = -i * 3; }
    } }], ['castUp', 12, { hit_a: 245 }]], { state: ST.ATTACK, mp: 100, stop: true });
    seq(fr, 260, [['slam0', 4, { defendState: true }], ['slam1', 4, { defendState: true, opoint: [{ oid: 'volcanoF', x: 40, y: 0, count: 3, spreadX: 40, delayStep: 3 }, { oid: 'volcanoI', x: -40, y: 0, count: 3, spreadX: -40, delayStep: 3, delay: 1 }, { oid: 'volcanoI', x: 60, y: 0, z: 14, count: 2, spreadX: 40, delayStep: 4 }, { oid: 'volcanoF', x: -60, y: 0, z: -14, count: 2, spreadX: -40, delayStep: 4 }] }], ['slam1', 14, { defendState: true }]], { state: ST.ATTACK, mp: 250, stop: true });
    seq(fr, 290, [['pose', 10, { sound: 'transform' }], ['victory', 6, { onEnter: (f, w) => splitFusion(f, w) }]], { state: ST.TRANSFORM, stop: true, cond: (f) => !!f.fusedPartner });
    def.moves = { Fj: 234, Ua: 245, Uj: 260, ja: 290 };
  },
  extra: { fastMp: true, shield: true },
  ai: { specials: [{ type: 'Fj', min: 90, max: 460, z: 14, w: 1.3 }, { type: 'Ua', min: 60, max: 600, z: 300, w: 0.9, any: true }, { type: 'Uj', min: 0, max: 120, z: 30, w: 0.8 }] },
  moveList: [['D>J', '冰火大炮(J/D 停)', '25+14/发'], ['D^A', '天灾(追踪火球冰弹,A 再发)', 100], ['D^J', '冰火火山(期间防御)', 250], ['DJA', '分离', 0], ['被动', '防御反弹飞行道具、MP 快速回复', '']],
}));
add(makeChar('malakar', {
  name: 'Malakar', hidden: true,
  look: { skin: '#b8b0c8', hair: 'longwild', hairCol: '#e8e8f0', mask: '#e8e0d0', eyeCol: '#ff2040', shirt: '#2a1a3a', top: 'long', sleeveCol: '#2a2a4a', armor: '#3a3a5a', armArmor: '#3a3a5a', pauldron: '#a89a60', pants: '#1a1a30', shoes: '#1a0a20', cape: '#5a3a1a', belt: '#a89a60', size: 1.2, bulk: 1.12 },
  role: '黑曜塔之主(Julian 定位)', desc: '最终首领。魂击冲拳与连续上勾拳不耗 MP;骷髅流连射追踪;镜像闪身留下残影;大爆炸与魂之炸弹无视防御;最强魔铠连冰火也挡,MP 回复更快。',
  stats: { walking_speed: 4.6, running_speed: 9.5 },
  build(fr, def) {
    // D>A 骷髅流(10 + 每颗 10):A 续发,J/D 停
    fr[234] = F(234, 'oneHand0', ST.ATTACK, 3, 235, { mp: 10, stop: true });
    seq(fr, 235, [['oneHand1', 3, { opoint: [{ oid: 'skull', x: 30, y: -52, dvy: -1 }], sound: 'ball_launch', hit_j: 238, hit_d: 238 }], ['blastB', 3, { opoint: [{ oid: 'skull', x: 30, y: -52, dvy: 1 }], hit_j: 238, hit_d: 238 }], ['cast2', 4, { hit_a: (f) => (f.mp >= 10 ? (f.mp -= 10, 235) : null), hit_j: 238, hit_d: 238 }]], { state: ST.ATTACK });
    fr[238] = F(238, 'cast2', ST.ATTACK, 6, END);
    // D^A 上勾拳(0,A 续)
    seq(fr, 245, [['upper0', 2], ['upper1', 4, { dvx: 6, dvy: -10, itr: [{ at: 'haF', w: 36, h: 44, injury: 50, fall: 70, dvx: 6, dvy: -14, bdefend: 60 }], sound: 'dragon', hit_a: 245 }], ['upper3', 40, { hit_a: 245 }]], { state: ST.ATTACK, air: true, landTo: 215 });
    // D>J 魂之炸弹(125) / D^J 大爆炸(100)
    seq(fr, 255, [['cast0', 5, { sound: 'charge' }], ['cast1', 3, { opoint: [{ oid: 'soulBomb', x: 34, y: -50 }] }], ['cast2', 10]], { state: ST.ATTACK, mp: 125, stop: true });
    seq(fr, 260, [['crouch', 8, { sound: 'charge' }], ['castUp', 3, { opoint: [{ oid: 'bigBang', x: 0, y: -40 }] }], ['castUp', 20]], { state: ST.ATTACK, mp: 100, stop: true, bdy: null });
    // DJA 镜像:滑步闪避并留下残影(J 再闪)
    seq(fr, 275, [['slide', 3, { bdy: null, dvx: 16, onEnter: (f, w) => w.fx.afterimage(f, null) }], ['slide', 3, { bdy: null, hit_j: 275 }], ['crouch', 3, { hit_j: 275 }]], { state: ST.ATTACK, mp: 25, friction: 2.5 });
    fr[275].onEnter = (f, w) => { w.fx.add({ type: 'ghost', x: f.x, y: f.y, z: f.z, life: 24, sprite: null, facing: f.facing, defRef: f.def, pic: 'stand0' }); };
    // 跑 + A 魂击(0)
    seq(fr, 280, [['punchA0', 2], ['runAtk1', 6, { dvx: 14, itr: [{ at: 'haF', w: 40, h: 40, injury: 60, fall: 70, dvx: 13, dvy: -9, bdefend: 80 }], sound: 'dash' }], ['runAtk2', 8]], { state: ST.ATTACK, friction: 1.2 });
    def.moves = { Fa: 234, Ua: 245, Fj: 255, Uj: 260, ja: 275 };
    def.runAttack = 280;
  },
  extra: { armorLevel: 2, armorFireIce: true, defenseK: 0.85, boss: true, fastMp: true },
  ai: { specials: [{ type: 'Fa', min: 90, max: 500, z: 40, w: 1.5, mash: 8 }, { type: 'Ua', min: 0, max: 50, z: 12, w: 1.2 }, { type: 'Fj', min: 80, max: 400, z: 16, w: 0.8 }, { type: 'Uj', min: 0, max: 120, z: 40, w: 0.7 }, { type: 'ja', min: 0, max: 70, z: 20, w: 0.4 }] },
  moveList: [['跑+A', '魂击', 0], ['D^A', '上勾拳(A 续)', 0], ['D>A', '骷髅流(A 续,J/D 停)', '10+10/颗'], ['DJA', '镜像闪身(J 再闪)', 25], ['D^J', '大爆炸(无视防御)', 100], ['D>J', '魂之炸弹(无视防御与盔甲)', 125], ['被动', '最强魔铠(连冰火也挡)', '']],
}));

// ---------------------------------------------------------------- 冰火合体:Pyra 与 Glacia 同队、都残血(≤1/3),跑步相撞
function fuse(f, w) {
  if (f.def !== f.baseDef || f.hp > f.maxHp / 3) return false;
  const want = f.def.fuseWith;
  const p = w.entities.find((e) => e.kind === 'char' && e !== f && !e.dead && !e.removed && e.team === f.team && e.baseDef.id === want && e.def === e.baseDef && e.hp <= e.maxHp / 3 && Math.abs(e.x - f.x) < 26 && Math.abs(e.z - f.z) < 14 && !e.caughtBy && !e.catching);
  if (!p) return false;
  f.fusedPartner = { def: p.baseDef, ctrl: p.ctrl, ctrlFeed: p.ctrlFeed, ai: p.ai, human: p.human, playerIdx: p.playerIdx, tag: p.tag, name: p.name, teamShown: p.teamShown, stats: p.stats, ent: p };
  p.removed = true;
  f.def = CHARS.tempest; f.name = 'Tempest';
  f.hp = f.maxHp; f.darkHp = f.maxHp; f.mp = Math.max(f.mp, 300);
  f.invuln = 10;
  w.addProj('armorBurst', f, { x: f.x, y: f.y - 40, z: f.z });
  w.fx.ring(f.x, f.y - 40, f.z, '#ff60ff', 70);
  for (let i = 0; i < 10; i++) w.fx.flame(f.x + (rnd() - 0.5) * 40, f.y - rnd() * 80, f.z, 1.2);
  w.fx.shards(f.x, f.z, '#cdf3ff', f.y - 40, 12);
  f.vx = 0; f.vz = 0;
  f.setFrame(260); // 合体后立刻冰火火山
  return true;
}
function splitFusion(f, w) {
  const P = f.fusedPartner;
  if (!P) return;
  f.fusedPartner = null;
  f.def = f.baseDef; f.name = f.baseDef.name;
  const hp = Math.max(1, f.hp / 2);
  f.hp = hp; f.darkHp = Math.max(hp, f.darkHp / 2);
  const e = P.ent;
  e.removed = false; e.dead = false; e.def = P.def; e.hp = hp; e.darkHp = f.darkHp; e.mp = f.mp / 2;
  e.x = f.x - f.facing * 30; e.z = f.z; e.y = 0; e.vx = e.vy = e.vz = 0;
  e.setFrame(0);
  if (!w.entities.includes(e)) w.entities.push(e);
  w.fx.smoke(f.x, f.y - 40, f.z); w.fx.smoke(e.x, e.y - 40, e.z);
}
for (const id of ['pyra', 'glacia']) CHARS[id].fuse = fuse;

export { CHARS };
