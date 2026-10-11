// 帧数据:仿 LF2 .dat 的帧系统。所有角色共享模板帧(帧号、时长与攻击参数取原版 v2.0a 数据),再叠加各自招式帧。
// 帧字段:pic 姿势名、state 状态、wait 持续 TU、next 下一帧(999=回默认, 1000=删除, 负数=转身后跳转)、
// dvx/dvy/dvz 进帧速度(dvx 相对面向,作为最低速度)、mp/hp 消耗、hit_a/hit_j/hit_d 帧内按键跳转、hit_Fa 等帧内接招、
// itr 攻击框({at:关节锚点 或 x,y} + w,h + 伤害参数)、bdy 受击框(缺省由姿势自动求,null=无)、opoint 生成物件。
export const ST = {
  STAND: 0, WALK: 1, RUN: 2, ATTACK: 3, JUMP: 4, DASH: 5, ROW: 6, DEFEND: 7, BROKEN: 8,
  CATCHING: 9, CAUGHT: 10, INJURED: 11, FALLING: 12, FROZEN: 13, LYING: 14, OTHER: 15,
  DIZZY: 16, DRINK: 17, BURNING: 18, TELEPORT: 400, TRANSFORM: 500,
};
export const END = 999, DEL = 1000;

// 攻击参数(原版 v2.0a:英雄取 Davis 值,杂兵取 Template 值)
export const HIT = {
  punch: { kind: 0, w: 28, h: 22, dvx: 2, injury: 20, fall: 20, bdefend: 16 },
  superPunch: { kind: 0, w: 32, h: 26, dvx: 3, dvy: -10, injury: 40, fall: 70, bdefend: 60 },
  jumpKick: { kind: 0, w: 30, h: 24, dvx: 9, dvy: -5, injury: 60, fall: 70, bdefend: 30 },
  runAtk: { kind: 0, w: 32, h: 26, dvx: 15, injury: 55, fall: 70, bdefend: 60, vrest: 7 },
  dashAtk: { kind: 0, w: 34, h: 28, dvx: 14, dvy: -5, injury: 80, fall: 70, bdefend: 60 },
  catchPunch: { kind: 0, w: 30, h: 24, dvx: 0, injury: 15, fall: 0, bdefend: 0, caughtHit: true },
};
// 杂兵(Template)数值
export const HIT_T = {
  superPunch: { ...HIT.superPunch, dvx: 5, dvy: -12, injury: 50 },
  jumpKick: { ...HIT.jumpKick, dvx: 2, dvy: 0, injury: 35, fall: 20, bdefend: 16 },
  runAtk: { ...HIT.runAtk, dvx: 10, injury: 50, bdefend: 16 },
  dashAtk: { ...HIT.dashAtk, dvx: 12, dvy: 0, injury: 70 },
};

export function F(id, pic, state, wait, next, extra = {}) {
  return { id, pic, state, wait, next, ...extra };
}

// 把序列 [[pic, wait, extra], ...] 连续写成 id..id+n-1;common.mp/hp 只记在首帧
export function seq(frames, id, list, common = {}, last = {}) {
  list.forEach((it, i) => {
    const [pic, wait, extra] = it;
    const isLast = i === list.length - 1;
    const fr = F(id + i, pic, common.state ?? ST.ATTACK, wait, isLast ? (last.next ?? END) : id + i + 1, { ...common, ...(extra || {}) });
    if (i > 0 && !(extra && extra.mp !== undefined)) { delete fr.mp; delete fr.hp; }
    frames[id + i] = fr;
  });
  return frames;
}

// 落地蹲(215)期间按 J = 冲跳、按 D = 翻滚(原版的落地衔接)
const crouchDash = (f) => {
  const s = f.def.stats, c = f.ctrl;
  if (f.holding && f.holding.def.wtype === 'heavy') return null;
  const dx = c ? c.dirX() : 0;
  if (dx) f.facing = dx;
  f.vx = f.facing * s.dash_distance; f.vy = s.dash_height; f.vz = (c ? c.dirZ() : 0) * s.dash_distancez;
  f.world.sfx('dash', f, 0.6);
  return 213;
};

export function buildTemplate(soldier = false) {
  const fr = {};
  const S = ST;
  const H = soldier ? { ...HIT, ...HIT_T } : HIT;
  // 站立 0-3
  for (let i = 0; i < 4; i++) fr[i] = F(i, 'stand' + i, S.STAND, 6, (i + 1) % 4);
  // 行走 5-8 / 跑步 9-11(由程序按步频驱动)
  for (let i = 0; i < 4; i++) fr[5 + i] = F(5 + i, 'walk' + i, S.WALK, 4, 5 + i);
  for (let i = 0; i < 3; i++) fr[9 + i] = F(9 + i, 'run' + i, S.RUN, 4, 9 + i);
  // 持重物走 12-15 / 跑 16-17 / 急停 18 / 持重物站 19
  for (let i = 0; i < 4; i++) fr[12 + i] = F(12 + i, 'heavy' + i, S.WALK, 4, 12 + i, { heavy: true });
  fr[16] = F(16, 'heavyRun0', S.RUN, 4, 16, { heavy: true });
  fr[17] = F(17, 'heavyRun1', S.RUN, 4, 17, { heavy: true });
  fr[18] = F(18, 'heavy1', S.OTHER, 5, 19, { heavy: true, friction: 1 });
  fr[19] = F(19, 'heavy0', S.STAND, 4, 19, { heavy: true });
  // 轻武器攻击:普通 20-22 / 25-27,跳砍 30-32,跑砍 35-37,冲砍 40-42(伤害取武器的 normal/jump/run/dash 强度表)
  seq(fr, 20, [['wpnA0', 3], ['wpnA1', 3, { witr: 'normal', sound: 'swing' }], ['wpnA2', 4]]);
  seq(fr, 25, [['wpnB0', 3], ['wpnB1', 3, { witr: 'normal', sound: 'swing' }], ['wpnB2', 4]]);
  seq(fr, 30, [['wpnJ0', 2], ['wpnJ1', 4, { witr: 'jump', sound: 'swing' }], ['wpnJ0', 30]], { air: true });
  seq(fr, 35, [['wpnA0', 2], ['wpnR1', 4, { witr: 'run', sound: 'swing_heavy' }], ['wpnA2', 5]]);
  seq(fr, 40, [['wpnJ0', 2], ['wpnJ1', 5, { witr: 'dash', sound: 'swing_heavy' }], ['wpnJ0', 30]], { air: true });
  // 投掷:轻武器 45-47 / 重物 50-51 / 空中轻武器 52-54
  seq(fr, 45, [['wpnThrow0', 3], ['wpnThrow1', 2, { throwWeapon: true, sound: 'throw' }], ['wpnA2', 5]]);
  seq(fr, 50, [['heavyThrow0', 4, { heavy: true }], ['heavyThrow1', 5, { throwWeapon: true, sound: 'throw' }]]);
  seq(fr, 52, [['wpnJ0', 2], ['wpnThrow1', 2, { throwWeapon: true, sound: 'throw' }], ['wpnJ0', 30]], { air: true });
  // 喝饮料 55-58:持续喝到喝完,按 D 中止
  fr[55] = F(55, 'drink0', S.DRINK, 3, 56, { hit_d: END });
  fr[56] = F(56, 'drink1', S.DRINK, 4, 57, { drink: true, hit_d: END });
  fr[57] = F(57, 'drink1', S.DRINK, 4, (f) => (f.holding && f.holding.def.drink && f.holding.volume > 0 ? 56 : 58), { drink: true, hit_d: END });
  fr[58] = F(58, 'drink0', S.DRINK, 4, END);
  // 普通拳 60-63 / 65-68(原版共 8 TU;收招再按 A 接另一手,遇晕眩/破防的敌人变重拳)
  const chainA = (f) => (f.world.findDizzyFront(f, 58, true) ? 70 : 65), chainB = (f) => (f.world.findDizzyFront(f, 58, true) ? 70 : 60);
  seq(fr, 60, [['punchA0', 2], ['punchA1', 2, { itr: [{ ...H.punch, at: 'haF' }], sound: 'swing' }], ['punchA2', 2, { hit_a: chainA }], ['punchA0', 2, { hit_a: chainA }]]);
  seq(fr, 65, [['punchB0', 2], ['punchB1', 2, { itr: [{ ...H.punch, at: 'haB' }], sound: 'swing' }], ['punchB2', 2, { hit_a: chainB }], ['punchB0', 2, { hit_a: chainB }]]);
  // 重拳 70-72
  seq(fr, 70, [['super0', 3], ['super1', 4, { itr: [{ ...H.superPunch, at: 'haF' }], sound: 'swing_heavy', dvx: 3 }], ['super2', 6]]);
  // 跳踢 80-82
  seq(fr, 80, [['jumpAtk0', 1], ['jumpAtk1', 6, { itr: [{ ...H.jumpKick, at: 'toeF' }], sound: 'swing' }], ['jumpAtk2', 30]], { air: true });
  // 跑攻 85-87
  seq(fr, 85, [['runAtk0', 2], ['runAtk1', 5, { itr: [{ ...H.runAtk, at: 'haF' }], sound: 'swing_heavy' }], ['runAtk2', 6]], { friction: 0.8 });
  // 冲攻 90-92
  seq(fr, 90, [['dashAtk0', 1], ['dashAtk1', 7, { itr: [{ ...H.dashAtk, at: 'toeF' }], sound: 'swing_heavy' }], ['dashAtk2', 30]], { air: true });
  // 空翻 100-101(向后倒时)/ 108-109(向前扑时):落地前无敌;翻滚 102-107
  const ROWC = { state: S.ROW, bdy: null, air: true };
  fr[100] = F(100, 'row0', S.ROW, 2, 192, ROWC);
  seq(fr, 192, [['row1', 2], ['row2', 2], ['row3', 2], ['row0', 2]], ROWC, { next: 192 });
  fr[108] = F(108, 'row3', S.ROW, 2, 96, ROWC);
  seq(fr, 96, [['row2', 2], ['row1', 2], ['row0', 2], ['row3', 2]], ROWC, { next: 96 });
  seq(fr, 102, [['roll0', 2, { dvx: 9 }], ['roll1', 2], ['roll2', 2], ['roll3', 2], ['roll4', 2], ['roll5', 2]], { state: S.ROW, rollPick: true, friction: 0.5 }, { next: 219 });
  // 防御 110(13 TU)/ 111 格挡受击(重新计时)/ 破防 112-114(约 9 TU,可被重拳)
  fr[110] = F(110, 'defend0', S.DEFEND, 13, END);
  fr[111] = F(111, 'defend1', S.DEFEND, 13, END);
  seq(fr, 112, [['broken0', 3], ['broken1', 3], ['broken1', 3]], { state: S.BROKEN });
  // 拾取 115(轻)/ 116(重)
  fr[115] = F(115, 'pickL', S.OTHER, 4, END, { pick: true });
  fr[116] = F(116, 'pickH', S.OTHER, 7, 19, { pick: true, heavy: true });
  // 抓人 120 / 抓打 121-122 / 抓投 124-126(原版 232-234)
  fr[120] = F(120, 'catch0', S.CATCHING, 4, 120, { cpoint: { x: 26, y: -2 } });
  seq(fr, 121, [['catch1', 2, { itr: [{ ...HIT.catchPunch, at: 'haB' }], cpoint: { x: 26, y: -2 }, sound: 'swing' }], ['catch2', 3, { cpoint: { x: 26, y: -2 } }]], { state: S.CATCHING }, { next: 120 });
  seq(fr, 124, [['throwP0', 4, { cpoint: { x: 6, y: -42, victimPic: 'caught1' } }], ['throwP1', 2, { throwVictim: true, sound: 'throw' }], ['throwP1', 6]], { state: S.CATCHING });
  // 被抓 130-131
  fr[130] = F(130, 'caught0', S.CAUGHT, 4, 130);
  fr[131] = F(131, 'caught1', S.CAUGHT, 4, 130);
  // 倒地 180-185(向后倒)/ 186-191(向前扑)—— 空中帧由下落速度选择
  ['fallF0', 'fallF1', 'fallF2', 'fallF3', 'fallF4', 'lieUp'].forEach((p, i) => { fr[180 + i] = F(180 + i, p, S.FALLING, 2, 180 + Math.min(i + 1, 3), { air: true }); });
  ['fallB0', 'fallB1', 'fallB2', 'fallB3', 'fallB4', 'lieDown'].forEach((p, i) => { fr[186 + i] = F(186 + i, p, S.FALLING, 2, 186 + Math.min(i + 1, 3), { air: true }); });
  // 冰冻 200-202(共约 96 TU,199 为空中冰块)/ 燃烧 203-206(燃烧的身体会点燃碰到的人,已燃烧者免疫)
  fr[199] = F(199, 'fallF2', S.FROZEN, 3, 199, { air: true });
  fr[200] = F(200, 'hurtF1', S.FROZEN, 6, 201);
  fr[201] = F(201, 'hurtF1', S.FROZEN, 90, 202);
  fr[202] = F(202, 'hurtF0', S.INJURED, 4, END, { thaw: true });
  const BURN = { kind: 0, at: 'hip', w: 40, h: 50, dvx: -6, dvy: -6, fall: 70, vrest: 10, bdefend: 16, injury: 30, effect: 2, anyTeam: true, notBurning: true };
  ['fallF0', 'fallF1', 'fallF2', 'fallF3'].forEach((p, i) => { fr[203 + i] = F(203 + i, p, S.BURNING, 3, 203 + Math.min(i + 1, 3), { air: true, burnt: true, itr: [BURN] }); });
  // 跳 210-212、冲跳 213/214、落地蹲 215、急停 218、起身 219
  fr[210] = F(210, 'crouch', S.JUMP, 1, 211);
  fr[211] = F(211, 'jumpUp', S.JUMP, 3, 212, { air: true });
  fr[212] = F(212, 'jumpTop', S.JUMP, 3, 212, { air: true });
  fr[213] = F(213, 'dash', S.DASH, 3, 213, { air: true });
  fr[214] = F(214, 'dashBack', S.DASH, 3, 214, { air: true });
  fr[215] = F(215, 'crouch', S.STAND, 3, END, { landing: true, hit_j: crouchDash, hit_d: (f) => (f.holding && f.holding.def.wtype === 'heavy' ? null : 102) });
  fr[218] = F(218, 'crouch', S.OTHER, 5, END, { friction: 1, dvx: 1 });
  fr[219] = F(219, 'getup', S.OTHER, 3, END);
  // 受击:220-221 轻受击(7 TU)、222-223 正面重受击、224-225 背面重受击、226-229 晕眩(Dance of Pain,28 TU)
  fr[220] = F(220, 'hurtF1', S.INJURED, 3, 221);
  fr[221] = F(221, 'hurtF0', S.INJURED, 4, END);
  fr[222] = F(222, 'hurtF0', S.INJURED, 4, 223);
  fr[223] = F(223, 'hurtF1', S.INJURED, 5, END);
  fr[224] = F(224, 'hurtB0', S.INJURED, 4, 225);
  fr[225] = F(225, 'hurtB1', S.INJURED, 5, END);
  fr[226] = F(226, 'dizzy0', S.DIZZY, 7, 227);
  fr[227] = F(227, 'dizzy1', S.DIZZY, 7, 228);
  fr[228] = F(228, 'dizzy2', S.DIZZY, 7, 229);
  fr[229] = F(229, 'dizzy1', S.DIZZY, 7, END);
  // 躺地 230(仰)/ 231(俯),31 TU 后起身
  fr[230] = F(230, 'lieUp', S.LYING, 31, 219, { bdy: null });
  fr[231] = F(231, 'lieDown', S.LYING, 31, 219, { bdy: null });
  // 胜利姿势
  fr[240] = F(240, 'victory', S.OTHER, 30, 240);
  return fr;
}
