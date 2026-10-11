// 魂界阵营:苍牙 / 冰轮 / 绯樱 / 狂剑 / 幻主(原创角色,分别对应原作人物的招式定位)
import { LOOKS } from './looks.js';
import { bladeSet, shoot, atFoe, rushLock, trapMove, transform, P } from './moves.js';
import { drawGlow } from './fx.js';
import { clamp, vr } from './util.js';

const waveHit = (dmg, o = {}) => ({ dmg, kb: [3.2, -1.5], stun: 20, spark: o.spark || 'blade', sfx: o.sfx || 'hit_blade', ...o });
// 月牙:随变身改变颜色
function getsuga(f, B, o) {
  const dark = !!f.buff;
  return shoot(f, B, { kind: 'wave', color: dark ? '#2a0a18' : '#7ac8ff', core: dark ? '#0a0006' : '#ffffff', edge: dark ? '#ff2a3a' : null, ...o });
}
// 瞬步至目标身后
function blinkBehind(f, B, dist = 64) {
  const t = f.opp; if (!t) return;
  B.afterimage(f, '#ffffff', 14);
  f.x = clamp(t.x + (t.x > f.x ? 1 : -1) * dist, 50, 1550); f.y = 0;
  f.face = t.x > f.x ? 1 : -1;
  B.sfx('shunpo');
}

export const SOUL = {
  // ======================================================================== 苍牙
  souga: {
    id: 'souga', name: '苍牙', title: '代行的巨刃死神', faction: 'soul', look: LOOKS.souga, dash: 'shunpo', walk: 3.5, jump: 12.4, stance: 'stand_big',
    quote: '我要保护的东西,我自己来决定!', winPose: 'stand_big', stageHint: 'karakura_town', trailColor: '#cfe8ff',
    moves: {
      ...bladeSet({ big: true, reach: 1.15, power: 1.08, speed: 1.0, stance: 'stand_big' }),
      U: { name: '月牙天冲', cat: 'U', cp: 25, dur: 36, trail: [3, 10], poses: [[0, 'slash_up', 0.6], [6, 'slash_down', 0.8], [24, 'stand_big', 0.3]], ai: { r: [100, 700], type: 'proj', w: 3 },
        ev: { 7: (f, B) => { B.sfx('wave'); getsuga(f, B, { dx: 64, dy: -60, sp: 11, w: 46, h: 100, life: 80, hits: 3, every: 5, power: 2, hit: waveHit(20) }); } } },
      WU: { name: '上弦月牙', cat: 'U', cp: 25, dur: 34, trail: [3, 10], poses: [[0, 'slash_low', 0.6], [5, 'slash_rise', 0.8], [22, 'stand_big', 0.3]], ai: { r: [60, 400], type: 'anti', w: 2 },
        ev: { 6: (f, B) => { B.sfx('wave'); getsuga(f, B, { dx: 50, dy: -90, sp: 8, vy: -6, tilt: -0.7, w: 50, h: 90, life: 60, hits: 2, every: 5, power: 2, hit: waveHit(22, { kind: 'launch', kb: [2, -9] }) }); } } },
      SU: { name: '瞬步斩', cat: 'U', cp: 20, dur: 34, ghost: true, hide: [3, 8], inv: [2, 9], trail: [8, 14], poses: [[0, 'iai', 0.6], [9, 'slash_thru', 0.85], [24, 'stand_big', 0.3]], vel: [[3, 24], [10, 1]], ai: { r: [60, 300], type: 'rush', w: 2 },
        sfx: { 3: 'shunpo', 9: 'slash_heavy' }, hits: [{ at: [6, 12], box: [10, -60, 110, 70], dmg: 40, kind: 'knock', kb: [6, -6] }],
        tick: (f, B, mv, fr) => { if (fr === 3) B.afterimage(f, '#ffffff', 14); if (fr === 13) { const t = f.opp; if (t) f.face = t.x > f.x ? 1 : -1; } } },
      aU: { name: '空·月牙', cat: 'U', air: true, cp: 25, dur: 30, float: 22, trail: [3, 10], poses: [[0, 'air_slash_up', 0.6], [5, 'air_slash_down', 0.8]], ai: { r: [60, 500], type: 'proj', w: 1 },
        ev: { 6: (f, B) => { B.sfx('wave'); getsuga(f, B, { dx: 50, dy: -30, sp: 8, vy: 6, tilt: 0.7, w: 50, h: 90, life: 60, hits: 2, every: 5, power: 2, ground: true, onGround: (B2, p) => { p.kill(B2); B2.fx.dust(p.x, 0, 10, B2.dustColor); }, hit: waveHit(22, { kind: 'knock', kb: [4, -5] }) }); } } },
      I: { name: '黑月牙天冲', cat: 'I', qi: 100, cutin: true, dur: 52, shout: true, trail: [20, 28], trailColor: '#ff3a4a', poses: [[0, 'raise_sword', 0.5], [20, 'slash_down', 0.85], [40, 'stand_big', 0.3]], ai: { r: [60, 800], type: 'proj', w: 3 },
        tick: (f, B, mv, fr) => { if (fr < 20 && fr % 2 === 0) { B.fx.add({ type: 'glowdot', x: f.x + vr(-30, 30), y: f.y - vr(20, 160), vx: 0, vy: -2, r: 4, color: '#c01828', life: 18 }); } },
        ev: { 2: (f, B) => B.sfx('charge'), 20: (f, B) => { B.sfx('wave'); B.fx.shake(6, 12); shoot(f, B, { kind: 'wave', color: '#2a0a18', core: '#0a0006', edge: '#ff2a3a', dx: 70, dy: -70, sp: 12, w: 80, h: 190, life: 80, hits: 7, every: 4, power: 6, hit: waveHit(22, { spark: 'dark', super: true, kb: [4, -2] }) }); } } },
      WI: rushLock({
        name: '瞬步连斩', qi: 100, startup: 6, rush: 18, speed: 22, n: 6, every: 6, dmg: 18, fin: 90, wpn: true, trail: [0, 200], trailColor: '#ffffff', pose: 'iai', rushPose: 'slash_thru', lockPose: 'slash_down', finPose: 'slash_rise', spark: 'blade', sfxEach: 'slash', rushSfx: 'shunpo', lockOff: [60, 0],
        each: (f, B, t, k) => { const side = (k / 6) % 2 ? 1 : -1; B.afterimage(f, '#ffffff', 10); f.x = clamp(t.x - side * 70, 50, 1550); f.face = side; f.poseOv = P(k % 12 ? 'slash_down' : 'slash_thru'); B.fx.add({ type: 'slashline', x: t.x, y: t.y - 60, a: vr(-1.2, 1.2), len: 90, w: 6, color: '#ffffff', glowc: '#9ad0ff', life: 8 }); },
        finish: (f, B) => B.fx.shake(8, 12),
      }),
      SI: transform({ name: '卍解·天锁 + 虚化', qi: 300, aura: '#b01020', dmg: 1.32, spd: 1.16, def: 1.12, hollow: true, look: { weapon: { type: 'blackblade', len: 62 }, coat: { color: '#141218', trim: '#7a1020', len: 1.3, ragged: true } }, burst: 70 }),
      aI: { name: '空·黑月牙', cat: 'I', qi: 100, air: true, cutin: true, dur: 40, float: 34, poses: [[0, 'air_slash_up', 0.5], [14, 'air_slash_down', 0.8]], ai: { r: [60, 600], type: 'proj', w: 2 },
        ev: { 14: (f, B) => { B.sfx('wave'); shoot(f, B, { kind: 'wave', color: '#2a0a18', core: '#0a0006', edge: '#ff2a3a', dx: 50, dy: -30, sp: 9, vy: 6.5, tilt: 0.7, w: 70, h: 150, life: 70, hits: 6, every: 4, power: 5, ground: true, onGround: (B2, p) => { p.vy = 0; p.y = -60; p.tilt = 0; }, hit: waveHit(22, { spark: 'dark', super: true, kind: 'knock', kb: [5, -5] }) }); } } },
    },
  },

  // ======================================================================== 冰轮
  hyorin: {
    id: 'hyorin', name: '冰轮', title: '天才少年队长', faction: 'soul', look: LOOKS.hyorin, dash: 'shunpo', walk: 3.6, jump: 12.6, trailColor: '#bff4ff',
    quote: '冰封吧……在这片冻结的天空下。', winPose: 'stand_calm', stageHint: 'soul_court',
    moves: {
      ...bladeSet({ speed: 1.06 }),
      U: { name: '冰龙', cat: 'U', cp: 25, dur: 38, trail: [3, 10], poses: [[0, 'slash_back', 0.6], [6, 'slash_thru', 0.8], [26, 'stand_w', 0.3]], ai: { r: [100, 700], type: 'proj', w: 3 },
        ev: { 7: (f, B) => { B.sfx('ice'); shoot(f, B, { kind: 'dragon', color: '#9adcf0', core: '#ffffff', keepTrail: 14, size: 1, dx: 64, dy: -66, sp: 9, w: 70, h: 56, life: 90, hits: 1, power: 2, hit: { dmg: 40, freeze: 50, kb: [3, -2], spark: 'ice', sfx: 'ice' }, tick: (B2, p) => { p.y += Math.sin(p.t * 0.22) * 2; }, onEnd: (B2, p) => B2.fx.shards(p.x, p.y, 8) }); } } },
      WU: { name: '冰柱', cat: 'U', cp: 25, dur: 40, poses: [[0, 'slash_up', 0.6], [5, 'slash_low', 0.8], [28, 'stand_w', 0.3]], ai: { r: [40, 260], type: 'anti', w: 2 },
        ev: Object.fromEntries([[6, 70], [11, 130], [16, 190]].map(([fr, dx]) => [fr, (f, B) => { B.sfx('ice', { vol: 0.7 }); B.spawn(f, { kind: 'pillar', mat: 'ice', x: f.x + f.face * dx, y: -55, w: 50, h: 115, life: 24, act: [1, 8], hits: 1, clash: false, hit: { dmg: 26, kind: 'launch', kb: [1.5, -11], spark: 'ice', sfx: 'ice' }, onEnd: (B2, p) => B2.fx.shards(p.x, -40, 5) }); }])) },
      SU: { name: '冰牙·滑斩', cat: 'U', cp: 20, dur: 32, low: true, trail: [4, 14], poses: [[0, 'crouch', 0.6], [4, 'slash_low', 0.85], [22, 'stand_w', 0.3]], vel: [[4, 13], [14, 2]], ai: { r: [60, 260], type: 'rush', w: 2 },
        sfx: { 4: 'ice' }, hits: [{ at: [5, 14], box: [50, -20, 80, 40], dmg: 34, kind: 'knock', kb: [3, -5], freeze: 30, spark: 'ice', low: true }],
        tick: (f, B, mv, fr) => { if (fr > 3 && fr < 15) B.fx.shards(f.x, -4, 1); } },
      aU: { name: '空·冰龙', cat: 'U', air: true, cp: 25, dur: 30, float: 22, trail: [3, 10], poses: [[0, 'air_slash_up', 0.6], [5, 'air_slash_down', 0.8]], ai: { r: [60, 500], type: 'proj', w: 1 },
        ev: { 6: (f, B) => { B.sfx('ice'); shoot(f, B, { kind: 'dragon', color: '#9adcf0', core: '#ffffff', keepTrail: 10, size: 0.85, sp: 7, vy: 5.5, w: 56, h: 50, life: 60, hits: 1, ground: true, onGround: (B2, p) => { p.kill(B2); B2.fx.shards(p.x, 0, 10); }, hit: { dmg: 36, freeze: 40, kb: [3, -3], spark: 'ice', sfx: 'ice' } }); } } },
      I: trapMove({ name: '千年冰牢', qi: 100, kind: 'iceprison', pose: 'sword_side', w: 90, h: 140, delay: 16, n: 4, every: 10, dmg: 22, fin: 96, spark: 'ice', sfx: 'ice', sfxEach: 'ice', sfxFin: 'ice_break', dur: 80,
        tele: (ctx, p) => { ctx.globalCompositeOperation = 'lighter'; drawGlow(ctx, p.x, -10, 60, '#7ad8ff', 0.5); ctx.globalCompositeOperation = 'source-over'; },
        finish: (B, p) => { B.fx.shards(p.x, -60, 24); B.fx.shake(8, 12); } }),
      WI: { name: '龙霰架', cat: 'I', qi: 100, cutin: true, dur: 56, trail: [8, 20], poses: [[0, 'slash_low', 0.6], [8, 'slash_rise', 0.85], [40, 'stand_w', 0.3]], ai: { r: [0, 260], type: 'anti', w: 2 },
        ev: { 9: (f, B) => { B.sfx('ice'); shoot(f, B, { kind: 'dragon', color: '#9adcf0', core: '#ffffff', keepTrail: 16, size: 1.5, dx: 60, dy: -40, sp: 3.5, vy: -9, w: 110, h: 130, life: 50, hits: 3, every: 6, power: 6, hit: { dmg: 34, kind: 'launch', kb: [1.5, -10], freeze: 30, spark: 'ice', sfx: 'ice', super: true }, onEnd: (B2, p) => B2.fx.shards(p.x, p.y, 16) }); } } },
      SI: transform({ name: '卍解·冰轮丸', qi: 300, aura: '#7ad8ff', dmg: 1.28, spd: 1.12, def: 1.18, burst: 60, onStart: (f, B) => B.fx.shards(f.x, f.y - 80, 30) }),
      aI: { name: '冰天百华葬', cat: 'I', qi: 100, air: true, cutin: true, dur: 44, float: 40, poses: [[0, 'cast_up', 0.5]], ai: { r: [0, 700], type: 'trap', w: 2 },
        ev: { 12: (f, B) => { B.sfx('ice'); atFoe(f, B, { kind: 'snow', y: -150, w: 300, h: 300, life: 80, hits: 5, every: 12, pierce: true, clash: false, hit: { dmg: 26, freeze: 26, kb: [1, -2], spark: 'ice', sfx: 'ice', super: true } }); } } },
    },
  },

  // ======================================================================== 绯樱
  hizakura: {
    id: 'hizakura', name: '绯樱', title: '贵族当主·千本樱', faction: 'soul', look: LOOKS.hizakura, dash: 'shunpo', walk: 3.4, jump: 12.4, defense: 0.95, trailColor: '#ffc0e0', stance: 'stand_calm',
    quote: '你连我刀刃的影子都看不到。', winPose: 'stand_calm', stageHint: 'execution_hill',
    moves: {
      ...bladeSet({ speed: 1.08, power: 0.97, stance: 'stand_calm' }),
      U: { name: '千本樱', cat: 'U', cp: 25, dur: 44, poses: [[0, 'stand_calm', 0.6], [8, 'point', 0.6], [34, 'stand_calm', 0.3]], ai: { r: [100, 650], type: 'proj', w: 3 },
        ev: { 10: (f, B) => { B.sfx('petal'); shoot(f, B, { kind: 'petals', n: 46, dx: 60, dy: -64, sp: 7, w: 100, h: 70, life: 70, hits: 5, every: 5, power: 2, hit: { dmg: 8, stun: 16, kb: [1.6, -0.6], spark: 'petal', sfx: 'hit_light' } }); } } },
      WU: { name: '破道·白雷', cat: 'U', cp: 20, dur: 32, poses: [[0, 'point', 0.6], [22, 'stand_calm', 0.3]], ai: { r: [100, 420], type: 'beam', w: 2 },
        ev: { 8: (f, B) => { B.sfx('beam', { pitch: 1.4 }); B.spawn(f, { kind: 'beam', color: '#e8f0ff', follow: f, fx: 46 + 180, fy: -70, len: 360, w: 360, h: 9, life: 12, hits: 1, pierce: true, clash: false, hit: { dmg: 44, kind: 'knock', kb: [5, -4], spark: 'elec', sfx: 'hit_elec' } }); } } },
      SU: { name: '瞬步·背斩', cat: 'U', cp: 30, dur: 42, hide: [2, 9], inv: [2, 10], trail: [16, 22], poses: [[0, 'stand_calm', 0.6], [10, 'slash_up', 0.6], [17, 'slash_down', 0.85], [32, 'stand_calm', 0.3]], ai: { r: [60, 420], type: 'rush', w: 1 },
        ev: { 2: (f, B) => B.afterimage(f, '#ffc0e0', 14), 9: (f, B) => blinkBehind(f, B, 60) }, sfx: { 17: 'slash' }, hits: [{ at: [17, 21], box: [50, -64, 70, 70], dmg: 34, kind: 'knock', kb: [6, -6], spark: 'blade' }] },
      aU: { name: '空·千本樱', cat: 'U', air: true, cp: 25, dur: 32, float: 26, poses: [[0, 'point', 0.6]], ai: { r: [60, 500], type: 'proj', w: 1 },
        ev: { 8: (f, B) => { B.sfx('petal'); shoot(f, B, { kind: 'petals', n: 32, sp: 6, vy: 5, w: 90, h: 70, life: 60, hits: 4, every: 5, power: 2, ground: true, onGround: (B2, p) => { p.vy = 0; p.y = -36; }, hit: { dmg: 10, kb: [1.4, -1], spark: 'petal' } }); } } },
      I: trapMove({ name: '千本樱景严', qi: 100, kind: 'petals', pose: 'stand_calm', w: 90, h: 140, delay: 18, n: 10, every: 5, dmg: 12, fin: 70, spark: 'petal', sfx: 'petal', sfxEach: 'hit_light', dur: 90,
        spawn: (f, B, p) => { p.n = 90; p.w = 150; p.h = 170; } }),
      WI: {
        name: '殲景·千本樱景严', cat: 'I', qi: 200, cutin: true, dur: 90, shout: true, poses: [[0, 'raise_sword', 0.4], [30, 'point', 0.5], [76, 'stand_calm', 0.3]], ai: { r: [0, 800], type: 'trap', w: 3 },
        ev: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [24 + i * 3, (f, B) => {
          const t = f.opp; if (!t) return;
          const a = -Math.PI * (0.1 + 0.8 * ((i * 7) % 12) / 11), r = 300;
          const sx = t.x + Math.cos(a) * r, sy = t.y - 60 + Math.sin(a) * r;
          const dx = t.x - sx, dy = t.y - 60 - sy, d = Math.hypot(dx, dy);
          if (i === 0) B.sfx('petal');
          B.spawn(f, { kind: 'swords', x: sx, y: sy, vx: dx / d * 14, vy: dy / d * 14, delay: 8, w: 30, h: 30, life: 40, hits: 1, clash: false, hit: { dmg: 22, kb: [2, -2], unblock: true, spark: 'blade', sfx: 'hit_blade', super: true, kind: i === 11 ? 'knock' : 'normal' } });
        }])),
      },
      SI: trapMove({ name: '吭景·千本樱景严', qi: 300, kind: 'petals', pose: 'cast_up', w: 100, h: 160, delay: 16, n: 16, every: 4, dmg: 14, fin: 130, spark: 'petal', sfx: 'petal', sfxEach: 'hit_light', dur: 110, darken: 50,
        spawn: (f, B, p) => { p.n = 140; p.w = 200; p.h = 220; },
        finish: (B, p) => { B.fx.petals(p.x, p.y, 40, 9); B.fx.flash('#ffd0e8', 6); B.fx.shake(10, 16); } }),
      aI: { name: '落樱', cat: 'I', qi: 100, air: true, cutin: true, dur: 44, float: 40, poses: [[0, 'point', 0.5]], ai: { r: [0, 700], type: 'trap', w: 2 },
        ev: { 10: (f, B) => { B.sfx('petal'); atFoe(f, B, { kind: 'petals', n: 120, y: -200, w: 200, h: 400, vy: 2.2, life: 90, hits: 9, every: 6, pierce: true, clash: false, hit: { dmg: 16, kb: [1, -1], spark: 'petal', super: true } }); } } },
    },
  },

  // ======================================================================== 狂剑
  kyouken: {
    id: 'kyouken', name: '狂剑', title: '嗜战的十一番刃', faction: 'soul', look: LOOKS.kyouken, dash: 'run', walk: 3.0, walkBack: 2.6, jump: 12.0, power: 1.12, defense: 1.12, stance: 'sword_side',
    quote: '哈哈哈!再多陪我玩一会儿啊!', winPose: 'sword_side', stageHint: 'hueco_desert', trailColor: '#ffe9a0',
    moves: {
      ...(() => { const s = bladeSet({ big: true, power: 1.18, speed: 0.86, reach: 1.15, stance: 'sword_side' }); s.J3.armor = [0, 8]; s.J4.armor = [0, 9]; return s; })(),
      U: { name: '灵压爆发', cat: 'U', cp: 25, dur: 40, armor: [0, 22], poses: [[0, 'charge', 0.5], [20, 'sword_side', 0.3]], shout: true, ai: { r: [0, 140], type: 'close', w: 2 },
        ev: { 8: (f, B) => { B.sfx('aura'); B.fx.ring(f.x, f.y - 60, 20, 160, '#ffe040', 18, 8); B.spawn(f, { kind: 'none', follow: f, fy: -60, w: 220, h: 200, life: 6, hits: 1, clash: false, hit: { dmg: 46, kind: 'knock', kb: [8, -6], spark: 'gold' } }); } } },
      WU: { name: '跃斩', cat: 'U', cp: 25, dur: 60, trail: [16, 40], landOk: true, poses: [[0, 'crouch', 0.6], [5, 'air_slash_up', 0.6], [16, 'air_slash_down', 0.7]], vel: [[5, 6, -12]], ai: { r: [120, 360], type: 'rush', w: 2 },
        hits: [{ at: [16, 58], box: [46, -30, 80, 70], dmg: 46, kind: 'spike', kb: [3, 10] }],
        onLand: (f, B, mv) => { if (mv.f < 10) return; f.vy = 0; f.vx = 0; B.fx.dust(f.x, 0, 14, B.dustColor); B.fx.ring(f.x + f.face * 50, 0, 10, 120, '#ffe9a0', 14, 4, 0.25); B.sfx('fall'); B.fx.shake(6, 10); B.spawn(f, { kind: 'none', x: f.x + f.face * 60, y: -20, w: 160, h: 40, life: 4, hits: 1, clash: false, hit: { dmg: 24, kind: 'knock', kb: [4, -6], low: true } }); mv.dur = mv.f + 14; f.poseOv = P('heavy_chop'); } },
      SU: { name: '突进刺', cat: 'U', cp: 20, dur: 36, armor: [0, 14], trail: [6, 16], poses: [[0, 'iai', 0.6], [6, 'thrust', 0.85], [24, 'sword_side', 0.3]], vel: [[6, 15], [16, 2]], ai: { r: [80, 320], type: 'rush', w: 2 },
        sfx: { 6: 'slash_heavy' }, hits: [{ at: [7, 16], box: [60, -66, 90, 40], dmg: 46, kind: 'knock', kb: [7, -5] }] },
      aU: { name: '旋斩', cat: 'U', air: true, cp: 20, dur: 30, float: 26, spinSprite: true, trail: [2, 26], poses: [[0, 'air_slash', 0.7]], ai: { r: [0, 160], type: 'close', w: 1 },
        tick: (f, B, mv, fr) => { f.poseOv = { ...P('air_slash'), r: -fr * 28 }; },
        hits: [{ at: [3, 26], box: [0, -50, 150, 120], dmg: 18, every: 6, kb: [3, -3] }], sfx: { 3: 'slash_heavy', 15: 'slash_heavy' } },
      I: { name: '剑八·斩', cat: 'I', qi: 100, cutin: true, dur: 70, shout: true, armor: [0, 30], trail: [28, 36], wscale: 1.25, poses: [[0, 'raise_sword', 0.5], [28, 'heavy_chop', 0.9], [52, 'sword_side', 0.3]], ai: { r: [0, 220], type: 'close', w: 3 },
        tick: (f, B, mv, fr) => { if (fr < 28 && fr % 2 === 0) B.fx.add({ type: 'glowdot', x: f.x + vr(-40, 40), y: f.y - vr(0, 180), vx: 0, vy: -3, r: 5, color: '#ffe040', life: 16 }); },
        ev: { 2: (f, B) => B.sfx('charge'), 29: (f, B) => { B.fx.shake(14, 22); B.fx.flash('#fff6c0', 6); B.sfx('explode'); B.fx.ring(f.x + f.face * 90, 0, 10, 220, '#ffe9a0', 18, 6, 0.25); shoot(f, B, { kind: 'shock', color: '#ffe060', dx: 120, dy: -30, sp: 10, w: 90, h: 70, life: 40, hits: 1, power: 4, hit: { dmg: 50, kind: 'knock', kb: [5, -7], low: true, super: true } }); } },
        hits: [{ at: [28, 33], box: [90, -80, 170, 170], dmg: 210, kind: 'knock', kb: [10, -9], unblock: false, chip: 0.25, spark: 'heavy', sfx: 'hit_heavy', noTech: true }] },
      WI: transform({ name: '眼罩解放', qi: 100, aura: '#ffe040', dmg: 1.3, spd: 1.05, def: 1.2, time: 600, burst: 40, look: { eyepatch: false } }),
      SI: rushLock({ name: '狂乱斩', qi: 300, startup: 14, rush: 24, speed: 12, n: 8, every: 6, dmg: 22, fin: 150, wpn: true, trail: [0, 200], trailColor: '#ffe9a0', pose: 'raise_sword', rushPose: 'thrust', lockPose: 'slash_down', finPose: 'heavy_chop', spark: 'blade', sfxEach: 'slash_heavy', lockOff: [70, 0],
        each: (f, B, t, k) => { f.poseOv = P(k % 12 ? 'slash_down' : 'slash_up'); B.fx.add({ type: 'slashline', x: t.x, y: t.y - 60, a: vr(-1.2, 1.2), len: 100, w: 7, color: '#fff6d0', glowc: '#ffd040', life: 8 }); B.fx.shake(4, 6); },
        finish: (f, B) => { B.fx.shake(14, 20); B.fx.flash('#fff2c0', 6); B.sfx('explode'); } }),
      aI: { name: '灵压坠击', cat: 'I', qi: 100, air: true, cutin: true, dur: 70, trail: [10, 60], poses: [[0, 'air_slash_up', 0.5], [10, 'air_slash_down', 0.7]], vel: [[10, 3, 14]], grav: 0, ai: { r: [0, 260], type: 'close', w: 2 },
        hits: [{ at: [10, 68], box: [30, -20, 80, 80], dmg: 60, kind: 'spike', kb: [2, 12] }],
        onLand: (f, B, mv) => { if (mv.f < 10) return; f.vy = 0; f.vx = 0; B.fx.shake(12, 20); B.sfx('explode'); B.fx.ring(f.x, 0, 20, 260, '#ffe040', 20, 8, 0.3); B.spawn(f, { kind: 'none', x: f.x, y: -40, w: 320, h: 90, life: 4, hits: 1, clash: false, hit: { dmg: 120, kind: 'knock', kb: [7, -9], unblock: true, super: true } }); mv.dur = mv.f + 20; f.poseOv = P('heavy_chop'); } },
    },
  },

  // ======================================================================== 幻主(最终首领)
  genshu: {
    id: 'genshu', name: '幻主', title: '天上的支配者', faction: 'soul', look: LOOKS.genshu, dash: 'shunpo', walk: 3.4, jump: 12.4, defense: 1.08, power: 1.04, stance: 'stand_calm', trailColor: '#d8c0ff',
    quote: '从一开始,就没有人站在天上。', winPose: 'stand_calm', stageHint: 'execution_hill', boss: true,
    moves: {
      ...bladeSet({ speed: 1.04, power: 1.04, stance: 'stand_calm' }),
      U: { name: '镜花水月', cat: 'U', cp: 25, dur: 40, counter: [2, 30], poses: [[0, 'stand_calm', 0.5]], ai: { r: [0, 150], type: 'counter', w: 1 },
        tick: (f, B, mv, fr) => { if (fr % 6 === 0 && fr < 30) B.fx.add({ type: 'flare', x: f.x, y: f.y - 60, r: 50, color: '#a080ff', life: 6 }); },
        onCounter: (f, att, B) => {
          // 被斩中的只是幻影:碎裂成镜片,本体出现在背后
          B.fx.shards(f.x, f.y - 60, 20, '#e8e0ff'); B.sfx('ice_break'); B.sfx('counter');
          B.fx.text(f.x, f.y - 150, '镜花水月', '#d0b0ff', 20, 40);
          f.x = clamp(att.x - att.face * 60, 50, 1550); f.face = att.face; f.y = 0;
          f.startMove('U2');
        } },
      U2: { name: '幻·背斩', cat: 'N', dur: 30, trail: [3, 10], poses: [[0, 'slash_up', 0.7], [3, 'slash_down', 0.85], [18, 'stand_calm', 0.3]], sfx: { 3: 'slash' }, hits: [{ at: [4, 8], box: [50, -64, 76, 76], dmg: 50, kind: 'knock', kb: [8, -7] }] },
      WU: trapMove({ name: '缚道·六杖光牢', cat: 'U', cp: 25, kind: 'rods', pose: 'point', w: 60, h: 130, delay: 10, n: 1, every: 30, dmg: 6, fin: 12, finKind: 'normal', finKb: [0.5, 0], dur: 40, sfx: 'bind', sfxEach: 'barrier', unblock: false, ai: { r: [80, 600], type: 'trap', w: 2 },
        finish: (B, p) => { if (p.held) { p.held.state = 'hit'; p.held.st = 0; p.held.stunT = 30; } } }),
      SU: { name: '破道·雷吼炮', cat: 'U', cp: 25, dur: 40, poses: [[0, 'cast_one', 0.6], [28, 'stand_calm', 0.3]], ai: { r: [100, 650], type: 'proj', w: 3 },
        ev: { 10: (f, B) => { B.sfx('beam', { pitch: 0.8 }); shoot(f, B, { kind: 'sphere', color: '#ffd040', size: 1.3, dx: 60, dy: -66, sp: 8, w: 56, h: 56, life: 80, hits: 3, every: 6, power: 3, hit: { dmg: 18, kb: [3, -2], spark: 'gold', sfx: 'hit_elec' }, onEnd: (B2, p) => B2.fx.explosion(p.x, p.y, 0.5, '#ffd040') }); } } },
      aU: { name: '黑闪', cat: 'U', air: true, cp: 20, dur: 30, float: 24, poses: [[0, 'cast_one', 0.6]], ai: { r: [60, 500], type: 'proj', w: 1 },
        ev: { 7: (f, B) => { B.sfx('dark'); shoot(f, B, { kind: 'beam', style: 'bolt', color: '#a040ff', sp: 7, vy: 5, len: 60, w: 60, h: 30, life: 50, hits: 2, every: 6, ground: true, onGround: (B2, p) => p.kill(B2), hit: { dmg: 18, kb: [3, -3], spark: 'dark' } }); } } },
      I: trapMove({ name: '破道之九十·黑棺', qi: 100, kind: 'blackbox', pose: 'point', w: 80, h: 140, delay: 22, n: 8, every: 6, dmg: 18, fin: 96, spark: 'dark', sfx: 'dark', sfxEach: 'hit_mid', dur: 100,
        tele: (ctx, p) => { ctx.strokeStyle = 'rgba(160,80,255,0.8)'; ctx.lineWidth = 2; const k = 1 - p.delay / 22; ctx.strokeRect(p.x - 45, -140 * k, 90, 140 * k); },
        finish: (B, p) => { B.fx.burst(p.x, p.y, '#9a30ff', 24, 8); B.fx.shake(8, 12); } }),
      WI: { name: '极光', cat: 'I', qi: 200, cutin: true, dur: 60, shout: true, trail: [18, 26], trailColor: '#d8c0ff', poses: [[0, 'raise_sword', 0.4], [18, 'slash_down', 0.85], [46, 'stand_calm', 0.3]], ai: { r: [60, 650], type: 'beam', w: 3 },
        ev: { 2: (f, B) => B.sfx('charge'), 19: (f, B) => { B.sfx('beam'); B.fx.flash('#efe0ff', 6); B.spawn(f, { kind: 'beam', color: '#c0a0ff', follow: f, fx: 40 + 300, fy: -64, len: 600, w: 600, h: 60, life: 32, hits: 6, every: 5, pierce: true, clash: false, hit: { dmg: 30, kb: [3, -2], stun: 22, spark: 'dark', super: true } }); } } },
      SI: transform({ name: '崩玉觉醒', qi: 300, aura: '#c8a8ff', dmg: 1.3, spd: 1.1, def: 1.2, regen: 0.25, burst: 70, look: { coat: { color: '#efe8ff', trim: '#8a60c0', len: 1.35 }, eye: '#b060ff' } }),
      aI: { name: '五龙转灭', cat: 'I', qi: 100, air: true, cutin: true, dur: 46, float: 40, poses: [[0, 'cast_one', 0.5]], ai: { r: [60, 650], type: 'proj', w: 2 },
        ev: Object.fromEntries([10, 14, 18, 22, 26].map((fr, i) => [fr, (f, B) => { if (i === 0) B.sfx('dark'); shoot(f, B, { kind: 'dragon', color: '#3a1a5a', core: '#c080ff', keepTrail: 10, size: 0.75, sp: 7.5, vy: 2.5 + i * 0.9, w: 50, h: 44, life: 70, hits: 1, ground: true, onGround: (B2, p) => { p.kill(B2); B2.fx.burst(p.x, 0, '#9a30ff', 10, 5); }, hit: { dmg: 34, kind: 'knock', kb: [4, -5], spark: 'dark', super: true } }); }])) },
    },
  },
};
