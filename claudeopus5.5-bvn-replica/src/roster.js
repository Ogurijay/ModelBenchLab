// 角色与援助登记 + 出招表数据
import { NINJA } from './chars_ninja.js';
import { SOUL } from './chars_soul.js';
import { LOOKS } from './looks.js';
import { shoot, atFoe, P } from './moves.js';
import { clamp, vr } from './util.js';

export const CHARS = { ...NINJA, ...SOUL };
export const CHAR_ORDER = ['shippu', 'yasha', 'ryusa', 'raiga', 'karasu', 'souga', 'hyorin', 'hizakura', 'kyouken', 'genshu'];

// ---------------------------------------------------------------- 援助角色(只有一招 A,出场后无敌,放完离场)
export const ASSISTS = {
  suiei: {
    id: 'suiei', name: '翠影', title: '体术之鬼', faction: 'ninja', look: LOOKS.suiei, desc: '木叶旋风:高速突进连环回旋踢',
    moves: { A: { name: '木叶旋风', cat: 'N', dur: 52, ghost: true, poses: [[0, 'run', 0.6], [10, 'kick_high', 0.8], [44, 'stand', 0.3]], vel: [[0, 6], [10, 13], [40, 2]], keepVx: true,
      tick: (f, B, mv, fr) => { if (fr >= 10 && fr < 40) { f.poseOv = { ...P('kick_high'), r: 0, f1: 128, t: -28 + Math.sin(fr) * 10 }; if (fr % 3 === 0) B.fx.speedLines(f.x, f.y - 50, f.face, '#bfffb0'); } },
      hits: [{ at: [10, 38], box: [20, -60, 90, 80], dmg: 14, every: 6, kb: [5, -2] }, { at: [38, 42], box: [30, -60, 100, 90], dmg: 26, kind: 'knock', kb: [8, -7] }], sfx: { 10: 'wind', 20: 'swing', 30: 'swing' } } },
  },
  senjin: {
    id: 'senjin', name: '蟾仙', title: '通灵仙人', faction: 'ninja', look: LOOKS.senjin, desc: '通灵·巨蟾坠:召唤巨蟾从天而降压向对手',
    moves: { A: { name: '通灵·巨蟾坠', cat: 'N', dur: 60, poses: [[0, 'seal', 0.6], [16, 'cast_down', 0.6]],
      ev: { 6: (f, B) => B.sfx('seal'), 16: (f, B) => { B.sfx('summon'); B.fx.smoke(f.x + f.face * 40, -20, 10); const t = f.opp; atFoe(f, B, { kind: 'toad', y: -620, w: 190, h: 130, vy: 0, delay: 10, life: 80, hits: 1, clash: false, ground: true, tick: (B2, p) => { p.vy += 1.1; if (t && p.y < -200) p.x += clamp(t.x - p.x, -3, 3); }, onGround: (B2, p) => { p.y = 0; p.vy = 0; if (!p.landed) { p.landed = true; p.life = 26; B2.fx.dust(p.x, 0, 20, B2.dustColor); B2.fx.shake(12, 18); B2.sfx('fall'); B2.spawn(p.owner, { kind: 'none', x: p.x, y: -30, w: 300, h: 60, life: 4, hits: 1, clash: false, hit: { dmg: 30, kind: 'knock', kb: [6, -6], low: true } }); } }, hit: { dmg: 80, kind: 'knock', kb: [4, -8], unblock: true, sfx: 'hit_heavy' }, onEnd: (B2, p) => B2.fx.smoke(p.x, -60, 16, '#ffffff', 1.6) }); } } } },
  },
  juushou: {
    id: 'juushou', name: '柔掌', title: '温柔的白瞳', faction: 'ninja', look: LOOKS.juushou, desc: '八卦六十四掌:突进后点穴连掌',
    moves: { A: { name: '八卦六十四掌', cat: 'N', dur: 64, poses: [[0, 'run', 0.6], [12, 'palm', 0.8]], vel: [[0, 9], [12, 0.5]], keepVx: true,
      tick: (f, B, mv, fr) => { if (fr >= 12 && fr < 52) f.poseOv = fr % 4 < 2 ? P('palm') : P('cast'); if (fr === 12) B.sfx('seal'); },
      hits: [{ at: [12, 50], box: [46, -66, 60, 70], dmg: 7, every: 4, kb: [0.4, 0], stun: 18, spark: 'wind' }, { at: [52, 56], box: [50, -66, 70, 70], dmg: 34, kind: 'knock', kb: [9, -6], spark: 'wind' }], sfx: { 52: 'hit_heavy' } } },
  },
  messhi: {
    id: 'messhi', name: '灭弓', title: '最后的灭却师', faction: 'soul', look: LOOKS.messhi, desc: '光之雨:灵子箭连射',
    moves: { A: { name: '光之雨', cat: 'N', dur: 50, poses: [[0, P('cast', { b1: 95, b2: 0, a1: 60, a2: 60 }), 0.6]],
      ev: Object.fromEntries([10, 14, 18, 22, 26, 30, 34].map((fr) => [fr, (f, B) => { B.sfx('kunai', { pitch: 1.6 }); const t = f.opp; const dx = t ? t.x - f.x : 300, dy = t ? (t.y - 60) - (f.y - 70) : 0; const d = Math.hypot(dx, dy) || 1; shoot(f, B, { kind: 'arrows', dx: 30, dy: -70, sp: Math.abs(dx / d * 15), vy: dy / d * 15 + vr(-1, 1), w: 26, h: 14, life: 60, hit: { dmg: 13, kb: [1.6, -1], spark: 'elec', sfx: 'hit_light' } }); }])) } },
  },
  tatehana: {
    id: 'tatehana', name: '盾舜', title: '六花的守护', faction: 'soul', look: LOOKS.tatehana, desc: '三天结盾 + 双天归盾:挡下飞行道具并回复体力',
    moves: { A: { name: '三天结盾', cat: 'N', dur: 50, poses: [[0, 'cast', 0.5]],
      ev: { 8: (f, B) => { B.sfx('barrier'); const owner = B.sides[f.side].fighter; B.spawn(f, { kind: 'barrier', follow: owner, fx: 60, fy: -60, w: 70, h: 130, life: 200, nohit: true, blocker: true, clash: true }); },
        12: (f, B) => { B.sfx('heal'); const o = B.sides[f.side].fighter; o.hp = Math.min(o.maxHp, o.hp + 80); o.hpShow = Math.max(o.hpShow, o.hp); B.fx.ring(o.x, o.y - 60, 10, 80, '#ffe08a', 20, 4); B.fx.text(o.x, o.y - 140, '+80', '#9aff9a', 20, 40); } } } },
  },
  boukage: {
    id: 'boukage', name: '帽影', title: '神秘的商店老板', faction: 'soul', look: LOOKS.boukage, desc: '啼红姬:红色剑气斩',
    moves: { A: { name: '啼红姬', cat: 'N', dur: 40, trail: [6, 14], trailColor: '#ff6070', poses: [[0, 'slash_up', 0.6], [6, 'slash_down', 0.85]],
      ev: { 7: (f, B) => { B.sfx('wave'); shoot(f, B, { kind: 'wave', color: '#e02a3a', core: '#ffd0d0', dx: 60, dy: -60, sp: 12, w: 50, h: 110, life: 70, hits: 3, every: 5, power: 3, hit: { dmg: 24, kb: [4, -2], spark: 'blade', sfx: 'hit_blade' } }); } } } },
  },
};
export const ASSIST_ORDER = ['suiei', 'senjin', 'juushou', 'messhi', 'tatehana', 'boukage'];

// ---------------------------------------------------------------- 出招表
export const MOVE_SLOTS = [
  ['J', 'J'], ['J2', 'J ×2'], ['J3', 'J ×3'], ['J4', 'J ×4'], ['WJ', 'W + J'], ['SJ', 'S + J'],
  ['aJ', '空中 J'], ['aSJ', '空中 S + J'],
  ['U', 'U'], ['WU', 'W + U'], ['SU', 'S + U'], ['aU', '空中 U'],
  ['I', 'I'], ['WI', 'W + I'], ['SI', 'S + I'], ['aI', '空中 I'],
];
export function moveList(id) {
  const c = CHARS[id];
  return MOVE_SLOTS.filter(([k]) => c.moves[k]).map(([k, label]) => {
    const m = c.moves[k];
    const cost = m.qi ? `气 ${m.qi / 100}` : m.cp ? `${c.faction === 'ninja' ? '查克拉' : '灵力'} ${m.cp}` : '';
    return { key: k, label, name: m.name, cost, cat: m.cat };
  });
}
