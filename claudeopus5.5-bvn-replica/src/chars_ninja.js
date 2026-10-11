// 忍界阵营:疾风 / 夜叉 / 流砂 / 雷牙 / 鸦(原创角色,分别对应原作人物的招式定位)
import { LOOKS } from './looks.js';
import { fistSet, shoot, atFoe, rushLock, trapMove, transform, P, handPos } from './moves.js';
import { drawGlow } from './fx.js';
import { clamp, vr } from './util.js';

// 跟随角色手部的纯视觉光团(螺旋丸 / 千鸟)
function orb(f, B, o) {
  return B.spawn(f, { kind: 'sphere', follow: f, fx: 46, fy: -64, nohit: true, clash: false, life: 60, size: 1, color: '#6ab8ff', ...o });
}
const kunaiSlash = (o = {}) => ({ name: '苦无斩', cat: 'N', dur: 18, nf: 8, next: 'J2', cf: 5, wpn: true, trail: [1, 7], trailColor: '#d8e8ff', poses: [[0, 'slash_back', 0.7], [2, 'slash_thru', 0.8], [10, 'stand', 0.3]], vel: [[2, 2.6]], sfx: { 2: 'slash' }, hits: [{ at: [3, 5], box: [44, -72, 52, 34], dmg: 24, stun: 17, kb: [2.4, 0], spark: 'blade' }], ...o });

// 影分身:以疾风外观奔跑的分身(飞行道具)
function clone(f, B, o) {
  B.fx.smoke(f.x + f.face * 20, f.y - 50, 6, '#ffffff', 0.7);
  return B.spawn(f, {
    kind: 'clone', look: f.look, cid: f.def.id, alt: f.altLook, x: f.x + f.face * 24, y: -50, footOff: 50, vx: f.face * 10.5, w: 46, h: 96, life: 46, hits: 1, power: 1,
    hit: { dmg: 30, kb: [4, 0], stun: 20, sfx: 'hit_mid' },
    onEnd: (B2, p) => { B2.fx.smoke(p.x, -50, 8, '#ffffff', 0.7); B2.sfx('smoke', { vol: 0.5 }); },
    ...o,
  });
}

export const NINJA = {
  // ======================================================================== 疾风
  shippu: {
    id: 'shippu', name: '疾风', title: '吵闹的影分身之忍', faction: 'ninja', look: LOOKS.shippu, dash: 'run', walk: 3.6, jump: 12.4, power: 1.06,
    quote: '说过的话绝不收回,这就是我的忍道!', winPose: 'victory', stageHint: 'leaf_village',
    moves: {
      ...fistSet(),
      U: {
        name: '影分身突击', cat: 'U', cp: 25, dur: 34, poses: [[0, 'seal', 0.6], [12, 'cast_one', 0.6], [26, 'stand', 0.3]], ai: { r: [60, 420], type: 'proj', w: 3 },
        ev: { 6: (f, B) => B.sfx('seal'), 10: (f, B) => { B.sfx('smoke'); clone(f, B, {}); }, 16: (f, B) => clone(f, B, { y: -50, vx: f.face * 10.5, hit: { dmg: 24, kind: 'knock', kb: [6, -5] } }) },
      },
      WU: {
        name: '分身·升踢', cat: 'U', cp: 25, dur: 36, poses: [[0, 'seal', 0.6], [10, 'point', 0.5]], ai: { r: [40, 320], type: 'anti', w: 2 },
        ev: {
          8: (f, B) => {
            B.sfx('smoke');
            const t = f.opp; const x = t ? t.x - f.face * 34 : f.x + f.face * 100;
            B.fx.smoke(x, -40, 8, '#ffffff', 0.8);
            B.spawn(f, { kind: 'clone', look: f.look, cid: f.def.id, alt: f.altLook, frame: 'launch', pose: 'rise_kick', x, y: -60, footOff: 60, vx: 0, w: 60, h: 120, life: 22, delay: 4, act: [2, 10], hits: 1, clash: false, hit: { dmg: 30, kind: 'launch', kb: [1, -12] }, onEnd: (B2, p) => B2.fx.smoke(p.x, -50, 8, '#ffffff', 0.7) });
          },
        },
      },
      SU: {
        name: '手里剑', cat: 'U', cp: 15, dur: 30, poses: [[0, 'throw_ready', 0.6], [6, 'throw', 0.7], [22, 'stand', 0.3]], ai: { r: [160, 700], type: 'proj', w: 2 },
        ev: Object.fromEntries([7, 11, 15].map((fr, i) => [fr, (f, B) => { B.sfx('kunai'); shoot(f, B, { kind: 'shuriken', dy: [-70, -58, -82][i], sp: 12, w: 20, h: 20, life: 80, hit: { dmg: 15, stun: 14, kb: [1.6, 0] } }); }])),
      },
      aU: {
        name: '空·手里剑', cat: 'U', air: true, cp: 15, dur: 26, poses: [[0, 'throw_ready', 0.6], [5, 'throw', 0.7]], float: 20, ai: { r: [80, 500], type: 'proj', w: 1 },
        ev: { 6: (f, B) => { B.sfx('kunai'); shoot(f, B, { kind: 'shuriken', sp: 9, vy: 5, w: 18, h: 18, life: 60, hit: { dmg: 14, kb: [1.6, -2] } }); }, 11: (f, B) => shoot(f, B, { kind: 'shuriken', sp: 10, vy: 3.2, w: 18, h: 18, life: 60, hit: { dmg: 14, kb: [1.6, -2] } }) },
      },
      I: rushLock({
        name: '螺旋丸', qi: 100, startup: 13, rush: 26, speed: 14.5, n: 6, every: 5, dmg: 15, fin: 92, finKb: [11, -7], color: '#6ab8ff', spark: 'wind', sfxEach: 'hit_light',
        charge: (f, B, mv, fr) => {
          if (fr === 1) { B.sfx('spiral'); mv.data.orb = orb(f, B, { fx: 38, fy: -60, life: 120 }); B.fx.smoke(f.x + f.face * 34, -50, 6, '#ffffff', 0.7); }
        },
        finish: (f, B, t) => { B.fx.ring(f.x + f.face * 50, f.y - 60, 20, 160, '#9ad8ff', 18, 7); B.fx.burst(f.x + f.face * 50, f.y - 60, '#bfe8ff', 18, 9); B.sfx('explode'); },
      }),
      WI: {
        name: '风遁·螺旋手里剑', cat: 'I', qi: 200, cutin: true, dur: 60, shout: true, poses: [[0, 'cast_up', 0.5], [28, 'throw', 0.7], [46, 'stand', 0.3]], ai: { r: [100, 700], type: 'proj', w: 3 },
        ev: {
          2: (f, B, mv) => { B.sfx('spiral'); mv.data.o = B.spawn(f, { kind: 'rasenshuriken', follow: f, fx: 6, fy: -150, nohit: true, clash: false, life: 27, size: 0.7 }); },
          28: (f, B) => {
            B.sfx('wind');
            shoot(f, B, {
              kind: 'rasenshuriken', dy: -100, sp: 8.5, vy: 1.2, size: 0.95, w: 100, h: 100, life: 90, hits: 9, every: 4, power: 9, clash: true,
              hit: { dmg: 16, kb: [0.6, -1.2], stun: 22, spark: 'wind', sfx: 'hit_light', super: true },
              onHit: (B2, p) => { p.vx *= 0.55; p.vy = 0; },
              onEnd: (B2, p) => { B2.fx.ring(p.x, p.y, 30, 220, '#cfefff', 22, 10); B2.fx.flash('#dff4ff', 6); B2.sfx('explode'); B2.spawn(p.owner, { kind: 'none', x: p.x, y: p.y, w: 220, h: 220, life: 4, hits: 1, clash: false, hit: { dmg: 70, kind: 'knock', kb: [7, -9], super: true, unblock: false } }); },
            });
          },
        },
      },
      SI: transform({ name: '妖狐觉醒', qi: 300, aura: '#ff5a1a', dmg: 1.25, spd: 1.15, def: 1.15, eye: 1, look: { hair: '#ffb428', eye: '#ff3018', marks: 'whisker' }, burst: 60 }),
      aI: rushLock({
        name: '空·螺旋丸', qi: 100, air: true, startup: 12, rush: 30, speed: 9, dive: 7.5, n: 5, every: 5, dmg: 16, fin: 90, finKb: [8, -8], box: [40, -30, 56, 70], lockOff: [44, 0],
        charge: (f, B, mv, fr) => { if (fr === 1) { B.sfx('spiral'); orb(f, B, { fx: 40, fy: -56, life: 120 }); } },
        finish: (f, B) => { B.fx.ring(f.x + f.face * 50, f.y - 50, 20, 150, '#9ad8ff', 18, 7); B.sfx('explode'); },
      }),
    },
  },

  // ======================================================================== 夜叉
  yasha: {
    id: 'yasha', name: '夜叉', title: '复仇的雷火之瞳', faction: 'ninja', look: LOOKS.yasha, dash: 'run', walk: 3.5, jump: 12.4, power: 1.05,
    quote: '我早就闭上眼睛了……只为看清黑暗。', winPose: 'stand_cool', stageHint: 'valley_end',
    eyeMode() { return this.mv?.m.eye || (this.buff ? 2 : 0); },
    moves: {
      ...fistSet({ power: 1.02 }),
      J4: { name: '草薙·回斩', cat: 'N', dur: 30, cf: 8, wpn: true, trail: [3, 11], trailColor: '#d8f0ff', poses: [[0, 'slash_back', 0.55], [4, 'slash_thru', 0.8], [18, 'stand', 0.25]], vel: [[3, 4.4]], sfx: { 4: 'slash' }, hits: [{ at: [4, 8], box: [56, -68, 76, 56], dmg: 41, kind: 'knock', kb: [7.5, -6], spark: 'blade' }] },
      U: {
        name: '火遁·豪火球', cat: 'U', cp: 25, dur: 46, eye: 2, poses: [[0, 'seal', 0.6], [14, 'cast_one', 0.5], [36, 'stand', 0.3]], ai: { r: [120, 600], type: 'proj', w: 3 },
        ev: { 4: (f, B) => B.sfx('seal'), 16: (f, B) => { B.sfx('fire_big'); shoot(f, B, { kind: 'fireball', dx: 70, dy: -74, sp: 6.5, size: 1.6, w: 76, h: 76, life: 90, hits: 3, every: 6, power: 3, hit: { dmg: 19, burn: 90, spark: 'fire', sfx: 'hit_burn', kb: [3, -2] }, onEnd: (B2, p) => B2.fx.fireBurst(p.x, p.y, 14, 1.2) }); } },
      },
      WU: {
        name: '火遁·凤仙火', cat: 'U', cp: 20, dur: 36, eye: 2, poses: [[0, 'seal', 0.6], [10, 'cast_one', 0.5]], ai: { r: [60, 300], type: 'anti', w: 2 },
        ev: Object.fromEntries([11, 14, 17].map((fr, i) => [fr, (f, B) => { B.sfx('fire'); shoot(f, B, { kind: 'fireball', dx: 50, dy: -80, sp: 6.4, vy: [-6, -4.2, -2.4][i], ay: 0.08, size: 0.65, w: 34, h: 34, life: 60, hit: { dmg: 16, burn: 40, spark: 'fire', sfx: 'hit_burn', kind: 'knock', kb: [3, -5] } }); }])),
      },
      SU: {
        name: '草薙·居合', cat: 'U', cp: 20, dur: 32, wpn: true, ghost: true, trail: [5, 14], trailColor: '#d8f0ff', poses: [[0, 'iai', 0.6], [6, 'slash_thru', 0.85], [20, 'stand', 0.3]], vel: [[5, 17], [13, 2]], inv: [5, 10], ai: { r: [60, 260], type: 'rush', w: 2 },
        sfx: { 5: 'shunpo', 7: 'slash' }, hits: [{ at: [6, 12], box: [30, -60, 80, 60], dmg: 40, kind: 'knock', kb: [6, -6], spark: 'blade' }],
        tick: (f, B, mv, fr) => { if (fr >= 5 && fr <= 12 && fr % 2 === 0) B.afterimage(f, '#a8c8ff', 8); },
      },
      aU: {
        name: '空·豪火球', cat: 'U', air: true, cp: 25, dur: 34, eye: 2, float: 26, poses: [[0, 'seal', 0.6], [10, 'cast_one', 0.5]], ai: { r: [80, 500], type: 'proj', w: 1 },
        ev: { 12: (f, B) => { B.sfx('fire_big'); shoot(f, B, { kind: 'fireball', sp: 5.5, vy: 4.5, size: 1.3, w: 60, h: 60, life: 70, hits: 2, every: 6, power: 2, hit: { dmg: 22, burn: 60, spark: 'fire', sfx: 'hit_burn', kind: 'knock', kb: [4, -5] }, ground: true, onGround: (B2, p) => { p.kill(B2); B2.fx.fireBurst(p.x, 0, 16, 1.2); } }); } },
      },
      I: rushLock({
        name: '千鸟', qi: 100, eye: 2, startup: 17, rush: 28, speed: 15.5, n: 6, every: 5, dmg: 16, fin: 96, color: '#8ac8ff', spark: 'elec', sfxEach: 'hit_elec', pose: 'cast_down', rushSfx: 'chidori',
        charge: (f, B, mv, fr) => { if (fr === 1) B.sfx('chidori'); const [x, y] = handPos(f, 30, -40); if (fr % 2 === 0) for (let i = 0; i < 2; i++) B.fx.bolt(x, y, x + vr(-30, 30), y + vr(-30, 30), '#7ac0ff', 4, 1.6); B.fx.add({ type: 'flare', x, y, r: 26, color: '#8ad0ff', life: 3 }); },
        rushFx: (f, B) => { const [x, y] = handPos(f, 46, -64); B.fx.bolt(x, y, x - f.face * 40, y + vr(-20, 20), '#7ac0ff', 3, 1.6); B.fx.add({ type: 'flare', x, y, r: 30, color: '#8ad0ff', life: 3 }); },
        each: (f, B, t) => { B.fx.bolt(t.x, t.y - 60, t.x + vr(-50, 50), t.y - 60 + vr(-60, 60), '#9ad8ff', 5, 2); },
        finish: (f, B) => { B.fx.flash('#cfe8ff', 4); B.sfx('lightning'); },
      }),
      WI: {
        name: '千鸟锐枪', cat: 'I', qi: 100, cutin: true, eye: 2, dur: 52, shout: true, poses: [[0, 'cast_down', 0.6], [14, 'cast_one', 0.8], [40, 'stand', 0.3]], ai: { r: [100, 420], type: 'beam', w: 2 },
        ev: { 2: (f, B) => B.sfx('chidori'), 14: (f, B) => { B.sfx('beam'); B.spawn(f, { kind: 'beam', style: 'bolt', color: '#7ac0ff', follow: f, fx: 40 + 200, fy: -66, len: 400, w: 400, h: 34, life: 28, hits: 7, every: 4, pierce: true, clash: false, hit: { dmg: 18, kb: [2.5, -1], stun: 22, spark: 'elec', sfx: 'hit_elec', super: true } }); } },
      },
      SI: {
        name: '雷遁·麒麟', cat: 'I', qi: 300, cutin: true, eye: 2, dur: 92, shout: true, darken: 60, poses: [[0, 'cast_up', 0.4], [60, 'cast_down', 0.6], [80, 'stand_cool', 0.3]], ai: { r: [0, 900], type: 'trap', w: 3 },
        ev: {
          8: (f, B) => {
            B.sfx('charge');
            const t = f.opp;
            atFoe(f, B, {
              kind: 'strike', color: '#a8d8ff', y: -300, w: 140, h: 600, delay: 46, life: 18, act: [0, 6], hits: 1, clash: false,
              hit: { dmg: 280, kind: 'knock', kb: [3, -11], unblock: true, spark: 'elec', sfx: 'lightning', super: true },
              tele: (B2, p) => { if (t) p.x += clamp(t.x - p.x, -1.6, 1.6); }, drawTele: (ctx, p) => { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, p.x, -30, 50 + Math.sin(p.delay) * 10, '#7ab8ff', 0.6); ctx.globalCompositeOperation = 'source-over'; },
              onEnd: () => {},
            });
          },
          54: (f, B) => { B.sfx('lightning'); B.fx.flash('#e8f4ff', 10); B.fx.shake(12, 24); },
        },
      },
      aI: {
        name: '千鸟流', cat: 'I', qi: 100, air: true, cutin: true, eye: 2, dur: 46, float: 46, poses: [[0, 'charge', 0.5]], ai: { r: [0, 160], type: 'close', w: 2 },
        ev: { 4: (f, B) => { B.sfx('chidori'); B.spawn(f, { kind: 'ring', color: '#8ac8ff', follow: f, fy: -50, w: 210, h: 170, life: 32, hits: 5, every: 6, pierce: true, clash: false, hit: { dmg: 22, kind: 'knock', kb: [5, -5], spark: 'elec', sfx: 'hit_elec', unblock: false, super: true } }); } },
        tick: (f, B, mv, fr) => { if (fr > 4 && fr % 2 === 0) for (let i = 0; i < 3; i++) { const a = vr(0, 6.28); B.fx.bolt(f.x, f.y - 50, f.x + Math.cos(a) * 100, f.y - 50 + Math.sin(a) * 80, '#8ac8ff', 4, 2); } },
      },
    },
  },

  // ======================================================================== 流砂
  ryusa: {
    id: 'ryusa', name: '流砂', title: '砂之守护者', faction: 'ninja', look: LOOKS.ryusa, dash: 'sand', walk: 2.8, walkBack: 2.6, jump: 11.6, defense: 1.08,
    quote: '你的存在……就由砂来证明吧。', winPose: 'cross', stance: 'cross', stageHint: 'exam_arena',
    moves: {
      ...fistSet({ reach: 1.3 }),
      J: { name: '砂鞭', cat: 'N', dur: 20, nf: 9, next: 'J2', cf: 5, poses: [[0, 'cross', 0.6], [3, 'cast_one', 0.7], [12, 'cross', 0.3]], sfx: { 3: 'sand' }, hits: [{ at: [4, 7], box: [78, -74, 92, 34], dmg: 22, stun: 17, kb: [2.4, 0], spark: 'sand' }], ev: { 4: (f, B) => sandStream(f, B, 120, -72) } },
      J2: { name: '砂拳', cat: 'N', dur: 21, nf: 10, next: 'J3', cf: 5, poses: [[0, 'cast_one', 0.6], [3, 'cast', 0.7], [13, 'cross', 0.3]], sfx: { 3: 'sand' }, hits: [{ at: [4, 7], box: [86, -62, 96, 40], dmg: 24, stun: 18, kb: [2.6, 0], spark: 'sand' }], ev: { 4: (f, B) => sandStream(f, B, 130, -62) } },
      J3: { name: '砂刺', cat: 'N', dur: 24, nf: 12, next: 'J4', cf: 6, poses: [[0, 'cast', 0.6], [3, 'cast_down', 0.7], [15, 'cross', 0.3]], sfx: { 4: 'sand' }, ev: { 4: (f, B) => B.spawn(f, { kind: 'pillar', mat: 'sand', x: f.x + f.face * 96, y: -30, w: 46, h: 70, life: 16, act: [1, 6], hits: 1, clash: false, hit: { dmg: 27, stun: 20, kb: [3, -2], spark: 'sand' } }) } },
      J4: { name: '砂涌', cat: 'N', dur: 30, cf: 8, poses: [[0, 'cast_down', 0.6], [5, 'cast_up', 0.7], [20, 'cross', 0.3]], sfx: { 5: 'sand' }, ev: { 5: (f, B) => B.spawn(f, { kind: 'pillar', mat: 'sand', x: f.x + f.face * 100, y: -60, w: 60, h: 120, life: 20, act: [1, 8], hits: 1, clash: false, hit: { dmg: 38, kind: 'knock', kb: [5, -9], spark: 'sand' } }) } },
      WJ: { name: '砂柱', cat: 'N', dur: 32, cf: 8, jc: true, poses: [[0, 'cast_down', 0.6], [5, 'cast_up', 0.7], [22, 'cross', 0.3]], sfx: { 5: 'sand' }, ev: { 5: (f, B) => B.spawn(f, { kind: 'pillar', mat: 'sand', x: f.x + f.face * 70, y: -60, w: 56, h: 130, life: 22, act: [1, 9], hits: 1, clash: false, hit: { dmg: 34, kind: 'launch', kb: [1.2, -12], spark: 'sand' } }) } },
      SJ: { name: '砂浪', cat: 'N', dur: 32, cf: 8, low: true, poses: [[0, 'cast', 0.6], [5, 'cast_down', 0.7], [22, 'cross', 0.3]], sfx: { 5: 'sand' }, ev: { 5: (f, B) => shoot(f, B, { kind: 'sand', dx: 40, dy: -14, sp: 8, w: 60, h: 28, n: 20, life: 24, clash: false, hit: { dmg: 30, kind: 'knock', kb: [3, -4], low: true, spark: 'sand' } }) } },
      aJ: { name: '砂弹', cat: 'N', air: true, dur: 20, nf: 10, next: 'aJ2', cf: 5, hop: -2, poses: [[0, 'jump', 0.6], [3, 'cast', 0.7]], sfx: { 3: 'sand' }, hits: [{ at: [4, 9], box: [62, -40, 80, 50], dmg: 22, kb: [2, -3.4], stun: 18, spark: 'sand' }], ev: { 4: (f, B) => sandStream(f, B, 100, -40) } },
      aJ2: { name: '砂击', cat: 'N', air: true, dur: 26, cf: 6, hop: -2.4, poses: [[0, 'cast', 0.6], [4, 'cast_down', 0.7]], sfx: { 4: 'sand' }, hits: [{ at: [5, 10], box: [56, -20, 80, 60], dmg: 30, kind: 'spike', kb: [2, 11], spark: 'sand' }], ev: { 5: (f, B) => sandStream(f, B, 90, -10) } },
      aSJ: { name: '砂坠', cat: 'N', air: true, dur: 30, cf: 6, float: 8, poses: [[0, 'cast_down', 0.6]], ev: { 6: (f, B) => { B.sfx('sand'); shoot(f, B, { kind: 'sand', dx: 20, dy: 10, sp: 3, vy: 9, w: 50, h: 50, n: 24, life: 40, ground: true, onGround: (B2, p) => { p.kill(B2); B2.fx.burst(p.x, 0, '#d8b878', 16, 5, 'dot', 0.2); }, hit: { dmg: 30, kind: 'knock', kb: [3, -6], spark: 'sand' } }); } } },
      U: trapMove({ name: '砂手', cat: 'U', cp: 25, kind: 'sandhand', pose: 'cast', w: 60, h: 120, delay: 16, n: 3, every: 10, dmg: 12, fin: 36, finKb: [3, -9], spark: 'sand', sfx: 'sand', sfx0: 'bind', unblock: false, dur: 44, poses: [[0, 'cast', 0.5], [30, 'jab', 0.6]], ai: { r: [100, 650], type: 'trap', w: 3 },
        tele: (ctx, p) => { ctx.fillStyle = 'rgba(200,164,106,0.7)'; ctx.beginPath(); ctx.ellipse(p.x, 0, 40, 6, 0, 0, 7); ctx.fill(); } }),
      WU: {
        name: '砂之盾', cat: 'U', cp: 20, dur: 44, armor: [2, 32], poses: [[0, 'cross', 0.6]], ai: { r: [0, 999], type: 'shield', w: 1 },
        ev: { 3: (f, B) => { B.sfx('sand'); B.spawn(f, { kind: 'sandwall', x: f.x + f.face * 48, y: -60, w: 44, h: 120, life: 60, nohit: true, blocker: true, clash: true }); } },
      },
      SU: {
        name: '砂时雨', cat: 'U', cp: 20, dur: 34, poses: [[0, 'cross', 0.6], [6, 'cast_one', 0.6]], ai: { r: [120, 650], type: 'proj', w: 2 },
        ev: Object.fromEntries([8, 11, 14, 17, 20].map((fr, i) => [fr, (f, B) => { B.sfx('sand', { vol: 0.6 }); shoot(f, B, { kind: 'sand', n: 8, dx: 40, dy: [-70, -88, -56, -80, -64][i], sp: 10.5, w: 20, h: 20, life: 70, hit: { dmg: 10, stun: 12, kb: [1.4, 0], spark: 'sand' } }); }])),
      },
      aU: { name: '砂弹·空', cat: 'U', air: true, cp: 20, dur: 30, float: 24, poses: [[0, 'cast', 0.6]], ai: { r: [60, 500], type: 'proj', w: 1 }, ev: { 8: (f, B) => { B.sfx('sand'); shoot(f, B, { kind: 'sand', n: 26, sp: 6, vy: 6, w: 44, h: 44, life: 60, power: 2, ground: true, onGround: (B2, p) => { p.kill(B2); B2.fx.burst(p.x, 0, '#d8b878', 16, 5, 'dot', 0.2); }, hit: { dmg: 30, kind: 'knock', kb: [4, -5], spark: 'sand' } }); } } },
      I: trapMove({ name: '砂缚柩·砂瀑送葬', qi: 100, kind: 'coffin', pose: 'cast', w: 70, h: 130, delay: 12, n: 6, every: 8, dmg: 17, fin: 82, finKb: [2, -6], spark: 'sand', sfx: 'bind', sfxEach: 'sand', dur: 100, poses: [[0, 'cast', 0.5], [62, 'jab', 0.7], [80, 'cross', 0.3]],
        tele: (ctx, p) => { ctx.fillStyle = 'rgba(200,164,106,0.75)'; ctx.beginPath(); ctx.ellipse(p.x, 0, 46, 8, 0, 0, 7); ctx.fill(); },
        finish: (B, p) => { B.fx.burst(p.x, p.y, '#d8b878', 30, 9, 'dot', 0.15); B.fx.shake(10, 16); B.sfx('explode'); } }),
      WI: {
        name: '砂瀑大葬', cat: 'I', qi: 200, cutin: true, dur: 70, shout: true, poses: [[0, 'cast_down', 0.5], [18, 'cast', 0.6], [56, 'cross', 0.3]], ai: { r: [0, 800], type: 'proj', w: 3 },
        ev: { 18: (f, B) => { B.sfx('sand'); B.fx.shake(6, 40); shoot(f, B, { kind: 'tsunami', dx: -40, dy: -80, sp: 7, w: 150, h: 170, life: 130, hits: 8, every: 7, power: 9, pierce: true, hit: { dmg: 22, kind: 'knock', kb: [5, -6], spark: 'sand', sfx: 'sand', super: true } }); } },
      },
      SI: {
        name: '守鹤之腕', cat: 'I', qi: 300, cutin: true, dur: 80, shout: true, poses: [[0, 'cast_up', 0.4], [40, 'cast_down', 0.6]], ai: { r: [0, 900], type: 'trap', w: 3 },
        ev: {
          16: (f, B) => {
            B.sfx('roar'); const t = f.opp;
            atFoe(f, B, {
              kind: 'meteor', size: 3, y: -520, w: 170, h: 170, vy: 0, delay: 24, life: 60, hits: 1, clash: false, ground: true,
              tele: (B2, p) => { if (t) p.x += clamp(t.x - p.x, -2, 2); }, drawTele: (ctx, p) => { ctx.fillStyle = 'rgba(80,50,20,0.35)'; ctx.beginPath(); ctx.ellipse(p.x, 0, 90, 14, 0, 0, 7); ctx.fill(); },
              tick: (B2, p) => { p.vy += 1.4; },
              onGround: (B2, p) => { p.kill(B2); B2.fx.burst(p.x, 0, '#d8b878', 40, 12, 'dot', 0.2); B2.fx.shake(14, 24); B2.sfx('explode'); B2.spawn(p.owner, { kind: 'none', x: p.x, y: -60, w: 260, h: 140, life: 4, hits: 1, clash: false, hit: { dmg: 120, kind: 'knock', kb: [6, -10], unblock: true, super: true } }); },
              hit: { dmg: 200, kind: 'knock', kb: [4, -9], unblock: true, spark: 'sand', sfx: 'hit_heavy', super: true },
            });
          },
        },
      },
      aI: { name: '砂流星', cat: 'I', qi: 100, air: true, cutin: true, dur: 44, float: 40, poses: [[0, 'cast_up', 0.5], [16, 'cast', 0.6]], ai: { r: [60, 600], type: 'proj', w: 2 },
        ev: { 18: (f, B) => { B.sfx('sand'); const t = f.opp; const dx = t ? t.x - f.x : f.face * 200; const n = Math.max(12, Math.abs(f.y - 0) / 9); shoot(f, B, { kind: 'meteor', size: 1.3, sp: clamp(dx / n, -12, 12) * f.face, vy: 9, w: 70, h: 70, life: 90, power: 4, ground: true, hit: { dmg: 120, kind: 'knock', kb: [6, -8], spark: 'sand', sfx: 'hit_heavy', super: true },
          onGround: (B2, p) => { p.kill(B2); B2.fx.burst(p.x, 0, '#d8b878', 30, 9, 'dot', 0.2); B2.fx.shake(8, 14); B2.sfx('explode'); B2.spawn(p.owner, { kind: 'none', x: p.x, y: -40, w: 180, h: 80, life: 4, hits: 1, clash: false, hit: { dmg: 40, kind: 'knock', kb: [5, -6], super: true } }); } }); } } },
    },
  },

  // ======================================================================== 雷牙
  raiga: {
    id: 'raiga', name: '雷牙', title: '千术拷贝忍者', faction: 'ninja', look: LOOKS.raiga, dash: 'run', walk: 3.5, jump: 12.4, power: 1.05,
    quote: '抱歉,迟到了——在人生的道路上迷路了。', winPose: 'stand_cool', stageHint: 'death_forest',
    moves: {
      ...fistSet(),
      J: kunaiSlash(),
      U: {
        name: '水遁·水龙弹', cat: 'U', cp: 25, dur: 46, poses: [[0, 'seal', 0.6], [16, 'cast', 0.6], [36, 'stand', 0.3]], ai: { r: [100, 650], type: 'proj', w: 3 },
        ev: { 4: (f, B) => B.sfx('seal'), 18: (f, B) => { B.sfx('water'); shoot(f, B, { kind: 'dragon', color: '#3a9ae8', core: '#bfe6ff', keepTrail: 12, size: 1.05, dx: 60, dy: -70, sp: 8.5, w: 76, h: 66, life: 90, hits: 4, every: 6, power: 3, hit: { dmg: 19, kb: [3, -2], spark: 'water', sfx: 'water' }, tick: (B2, p) => { p.y += Math.sin(p.t * 0.25) * 2.2; } }); } },
      },
      WU: trapMove({ name: '土遁·追牙', cat: 'U', cp: 25, kind: 'dogs', pose: 'cast_down', w: 60, h: 120, delay: 14, n: 3, every: 10, dmg: 12, fin: 30, finKind: 'normal', finKb: [2, 0], unblock: false, dur: 40, sfx: 'summon', sfxEach: 'hit_light', ai: { r: [80, 600], type: 'trap', w: 2 },
        tele: (ctx, p) => { ctx.fillStyle = 'rgba(80,60,40,0.6)'; ctx.beginPath(); ctx.ellipse(p.x, 0, 40, 6, 0, 0, 7); ctx.fill(); } }),
      SU: {
        name: '替身反击', cat: 'U', cp: 20, dur: 36, poses: [[0, 'seal', 0.6]], counter: [2, 26], ai: { r: [0, 140], type: 'counter', w: 1 },
        onCounter: (f, att, B) => {
          B.fx.log(f.x, f.y); B.fx.smoke(f.x, f.y - 50, 12); B.sfx('smoke'); B.sfx('counter');
          f.x = clamp(att.x - att.face * 56, 50, 1550); f.face = att.face; f.y = 0;
          f.startMove('SU2');
        },
      },
      SU2: { name: '背后踢', cat: 'N', dur: 30, poses: [[0, 'knee', 0.7], [4, 'kick_high', 0.8], [18, 'stand', 0.3]], hits: [{ at: [5, 9], box: [46, -70, 60, 50], dmg: 45, kind: 'knock', kb: [8, -7] }], sfx: { 4: 'swing' } },
      aU: { name: '空·苦无', cat: 'U', air: true, cp: 15, dur: 24, float: 18, poses: [[0, 'throw_ready', 0.6], [5, 'throw', 0.7]], ai: { r: [60, 500], type: 'proj', w: 1 },
        ev: { 6: (f, B) => { B.sfx('kunai'); for (const vy of [2.5, 4.5, 6.5]) shoot(f, B, { kind: 'kunai', sp: 9, vy, w: 20, h: 12, life: 60, hit: { dmg: 12, kb: [1.4, -2] } }); } } },
      I: rushLock({
        name: '雷切', qi: 100, startup: 12, rush: 26, speed: 16, n: 5, every: 5, dmg: 18, fin: 100, color: '#cfe8ff', spark: 'elec', sfxEach: 'hit_elec', pose: 'cast_down', rushSfx: 'chidori',
        charge: (f, B, mv, fr) => { if (fr === 1) B.sfx('chidori'); const [x, y] = handPos(f, 30, -40); if (fr % 2 === 0) B.fx.bolt(x, y, x + vr(-30, 30), y + vr(-30, 30), '#e8f4ff', 4, 1.6); B.fx.add({ type: 'flare', x, y, r: 28, color: '#e0f0ff', life: 3 }); },
        rushFx: (f, B) => { const [x, y] = handPos(f, 46, -64); B.fx.bolt(x, y, x - f.face * 50, y + vr(-20, 20), '#e8f4ff', 3, 2); },
        finish: (f, B) => { B.fx.flash('#ffffff', 4); B.sfx('lightning'); },
      }),
      WI: trapMove({ name: '神威', qi: 100, kind: 'vortex', pose: 'point', eye: 2, w: 80, h: 120, delay: 16, n: 8, every: 6, dmg: 15, fin: 64, spark: 'dark', sfx: 'tele', sfxEach: 'hit_light', dur: 90,
        tele: (ctx, p) => { ctx.strokeStyle = 'rgba(150,110,255,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, -60, 10 + (16 - p.delay) * 2, 0, 7); ctx.stroke(); } }),
      SI: {
        name: '雷兽追牙', cat: 'I', qi: 300, cutin: true, dur: 60, shout: true, poses: [[0, 'cast_down', 0.5], [18, 'cast_one', 0.7], [46, 'stand', 0.3]], ai: { r: [0, 800], type: 'proj', w: 3 },
        ev: { 4: (f, B) => B.sfx('chidori'), 18: (f, B) => { B.sfx('lightning'); shoot(f, B, { kind: 'hound', size: 1.4, dx: 40, dy: -40, sp: 13, w: 130, h: 90, life: 80, hits: 6, every: 5, power: 9, hit: { dmg: 42, kind: 'knock', kb: [6, -7], spark: 'elec', sfx: 'hit_elec', super: true } }); } },
      },
      aI: rushLock({ name: '雷切·坠', qi: 100, air: true, startup: 8, rush: 30, speed: 10, dive: 8, n: 4, every: 5, dmg: 20, fin: 96, box: [40, -30, 56, 70], spark: 'elec', sfxEach: 'hit_elec', color: '#cfe8ff',
        charge: (f, B, mv, fr) => { if (fr === 1) B.sfx('chidori'); const [x, y] = handPos(f, 30, -50); B.fx.add({ type: 'flare', x, y, r: 26, color: '#e0f0ff', life: 3 }); } }),
    },
  },

  // ======================================================================== 鸦
  karasu: {
    id: 'karasu', name: '鸦', title: '背负一族之罪的瞳', faction: 'ninja', look: LOOKS.karasu, dash: 'run', walk: 3.4, jump: 12.2,
    quote: '人总是依赖自己的认知活着……那不过是幻影。', winPose: 'stand_cool', stance: 'stand_cool', stageHint: 'valley_end',
    eyeMode() { return this.mv?.m.eye || 1; },
    moves: {
      ...fistSet(),
      J: kunaiSlash(),
      U: {
        name: '火遁·凤仙火', cat: 'U', cp: 20, dur: 36, poses: [[0, 'seal', 0.6], [10, 'cast_one', 0.5], [28, 'stand_cool', 0.3]], ai: { r: [100, 600], type: 'proj', w: 3 },
        ev: Object.fromEntries([11, 14, 17, 20].map((fr, i) => [fr, (f, B) => { B.sfx('fire', { vol: 0.7 }); shoot(f, B, { kind: 'fireball', dx: 50, dy: [-74, -64, -82, -70][i], sp: 9.5, vy: [0, 0.4, -0.4, 0.2][i], size: 0.6, w: 30, h: 30, life: 70, hit: { dmg: 12, burn: 30, spark: 'fire', sfx: 'hit_burn', kb: [1.6, 0] } }); }])),
      },
      WU: {
        name: '鸦分身', cat: 'U', cp: 25, dur: 34, hide: [4, 17], inv: [2, 20], ghost: true, poses: [[0, 'stand_cool', 0.5], [18, 'cast_one', 0.6]], ai: { r: [0, 999], type: 'escape', w: 2 },
        ev: {
          3: (f, B) => { B.sfx('crow'); B.fx.feathers(f.x, f.y - 50, 14); },
          17: (f, B) => { const t = f.opp; if (t) { f.x = clamp(t.x - t.face * 80, 50, 1550); f.face = t.x > f.x ? 1 : -1; } B.fx.feathers(f.x, -60, 10); },
          20: (f, B) => { B.sfx('crow'); shoot(f, B, { kind: 'crows', n: 10, dx: 50, dy: -66, sp: 8, w: 90, h: 80, life: 30, hits: 3, every: 6, clash: false, hit: { dmg: 12, kb: [2, -1], spark: 'dark' } }); },
        },
      },
      SU: { name: '苦无', cat: 'U', cp: 15, dur: 28, poses: [[0, 'throw_ready', 0.6], [6, 'throw', 0.7], [20, 'stand_cool', 0.3]], ai: { r: [160, 700], type: 'proj', w: 2 },
        ev: { 7: (f, B) => { B.sfx('kunai'); for (const [dy, vy] of [[-80, -0.6], [-64, 0], [-48, 0.6]]) shoot(f, B, { kind: 'kunai', dy, vy, sp: 12, w: 22, h: 12, life: 70, hit: { dmg: 12, stun: 14, kb: [1.4, 0] } }); } } },
      aU: { name: '空·凤仙火', cat: 'U', air: true, cp: 20, dur: 30, float: 24, poses: [[0, 'seal', 0.6], [8, 'cast_one', 0.5]], ai: { r: [60, 500], type: 'proj', w: 1 },
        ev: Object.fromEntries([9, 13, 17].map((fr) => [fr, (f, B) => { B.sfx('fire', { vol: 0.6 }); shoot(f, B, { kind: 'fireball', sp: 7, vy: 4.5, size: 0.6, w: 30, h: 30, life: 60, ground: true, onGround: (B2, p) => { p.kill(B2); B2.fx.fireBurst(p.x, 0, 6, 0.6); }, hit: { dmg: 13, burn: 30, spark: 'fire', sfx: 'hit_burn', kb: [1.6, -2] } }); }])) },
      I: trapMove({ name: '月读', qi: 100, kind: 'genjutsu', eye: 2, pose: 'point', w: 60, h: 130, delay: 4, actF: 4, n: 8, every: 6, dmg: 16, fin: 40, finKind: 'normal', finKb: [1, 0], dur: 70, sfx: 'dark', sfxEach: 'hit_light', spark: 'dark',
        cond: (f) => { const t = f.opp; return t && Math.abs(t.x - f.x) < 460 && (t.x - f.x) * f.face > 0; },
        spawn: (f, B) => { B.darken = 90; B.darkColor = '#2a0006'; },
        finish: (B, p) => { if (p.held) { p.held.state = 'hit'; p.held.st = 0; p.held.stunT = 46; } },
        ai: { r: [40, 440], type: 'trap', w: 3 } }),
      WI: trapMove({ name: '天照', qi: 200, kind: 'blackfire', size: 1.4, eye: 2, pose: 'stand_cool', w: 70, h: 130, delay: 10, n: 10, every: 7, dmg: 14, fin: 40, dur: 70, sfx: 'dark', sfxEach: 'hit_burn', spark: 'dark',
        finish: (B, p) => { if (p.held) p.held.status.burn = 240; } }),
      SI: {
        name: '骸神·十握剑', cat: 'I', qi: 300, cutin: true, eye: 2, dur: 96, shout: true, darken: 70, poses: [[0, 'cast_up', 0.4], [70, 'stand_cool', 0.3]], ai: { r: [0, 480], type: 'close', w: 3 },
        ev: {
          10: (f, B) => {
            B.sfx('aura');
            B.spawn(f, {
              kind: 'ghost', color: '#e04a50', follow: f, fx: 170, fy: -130, gx: 170, w: 420, h: 260, life: 76, hits: 4, every: 5, pierce: true, clash: false, act: [26, 44],
              hit: { dmg: 70, kind: 'knock', kb: [9, -9], unblock: true, spark: 'dark', sfx: 'hit_heavy', super: true },
              tick: (B2, p) => { p.ang = p.t < 24 ? -1.3 : Math.min(0.7, -1.3 + (p.t - 24) * 0.18); if (p.t === 26) { B2.sfx('slash_heavy'); B2.fx.shake(10, 16); } },
            });
          },
        },
      },
      aI: { name: '鸦群·落', cat: 'I', qi: 100, air: true, cutin: true, dur: 40, float: 36, poses: [[0, 'cast_one', 0.5]], ai: { r: [60, 600], type: 'proj', w: 2 },
        ev: { 12: (f, B) => { B.sfx('crow'); shoot(f, B, { kind: 'crows', n: 18, sp: 7, vy: 4.2, w: 130, h: 120, life: 70, hits: 7, every: 5, power: 5, ground: true, onGround: (B2, p) => { p.vy = 0; p.y = -1; }, hit: { dmg: 22, kb: [2, -2], spark: 'dark', super: true } }); } } },
    },
  },
};

function sandStream(f, B, len, dy) {
  for (let i = 0; i < 10; i++) {
    const k = i / 10;
    B.fx.add({ type: 'dot', x: f.x + f.face * (30 + len * k), y: f.y + dy * f.scale + vr(-8, 8), vx: f.face * vr(1, 3), vy: vr(-1, 1), drag: 0.9, r: vr(2.5, 4.5), color: i % 2 ? '#d4b47a' : '#a88850', life: vr(10, 18) | 0 });
  }
}
