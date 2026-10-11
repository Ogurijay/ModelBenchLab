// 招式工厂。招式字段:
//   dur 总帧;poses [[帧, 姿势名|对象, 混合率]];hits [{at:[起,止], box:[前,上,宽,高], dmg, kind, kb:[vx,vy], stun, every, ...}]
//   vel [[帧, vx(相对朝向), vy]];ev {帧: fn};tick(f,B,mv,frame);cat 'N'普攻/'U'技能/'I'必杀;
//   next/nf 普攻连段;cf 命中取消起始帧;jc 命中可跳消;cp/qi 消耗;cutin 奥义演出;air 空中招式;ai 电脑使用提示
import { POSES } from './poses.js';
import { clamp, vr } from './util.js';

export const P = (name, o) => ({ ...POSES[name], ...o, __n: name });

// ---------------------------------------------------------------- 发射
export function shoot(f, B, o) {
  const s = f.scale;
  return B.spawn(f, {
    x: f.x + f.face * (o.dx ?? 50) * s, y: f.y + (o.dy ?? -62) * s,
    vx: f.face * (o.sp ?? 9), vy: o.vy ?? 0, dir: f.face, ...o,
  });
}
// 在对手位置生成(地面陷阱 / 天降攻击)
export function atFoe(f, B, o) {
  const t = f.opp; const tx = t ? t.x + (o.lead ? t.vx * o.lead : 0) : f.x + f.face * 200;
  return B.spawn(f, { x: clamp(tx, 60, 1540), y: o.y ?? -60, vx: 0, vy: 0, dir: f.face, ...o });
}

// ---------------------------------------------------------------- 普攻套组
// 徒手(忍者系)
export function fistSet(o = {}) {
  const k = (o.reach || 1) * 1.22, pw = (o.power || 1) * 1.08;
  const d = (v) => Math.round(v * pw);
  return {
    J: { name: '拳', cat: 'N', dur: 18, nf: 8, next: 'J2', cf: 5, poses: [[0, 'stand', 0.7], [2, 'jab', 0.75], [10, 'stand', 0.3]], vel: [[2, 2.6]], sfx: { 2: 'swing' }, hits: [{ at: [3, 5], box: [42 * k, -78, 48 * k, 26], dmg: d(24), stun: 17, kb: [2.4, 0] }] },
    J2: { name: '直拳', cat: 'N', dur: 19, nf: 9, next: 'J3', cf: 5, poses: [[0, 'jab', 0.6], [2, 'straight', 0.75], [11, 'stand', 0.3]], vel: [[2, 3]], sfx: { 2: 'swing' }, hits: [{ at: [3, 5], box: [46 * k, -76, 52 * k, 26], dmg: d(25), stun: 18, kb: [2.6, 0] }] },
    J3: { name: '踢', cat: 'N', dur: 22, nf: 10, next: 'J4', cf: 6, poses: [[0, 'knee', 0.6], [3, 'kick_mid', 0.75], [13, 'stand', 0.3]], vel: [[3, 3.2]], sfx: { 3: 'swing' }, hits: [{ at: [4, 7], box: [50 * k, -58, 60 * k, 30], dmg: d(29), stun: 20, kb: [3, 0] }] },
    J4: { name: '回旋踢', cat: 'N', dur: 30, cf: 8, poses: [[0, 'knee', 0.5], [4, 'kick_high', 0.8], [18, 'stand', 0.25]], vel: [[3, 4.2]], sfx: { 4: 'swing' }, hits: [{ at: [5, 8], box: [52 * k, -70, 64 * k, 42], dmg: d(40), kind: 'knock', kb: [7.5, -6], stun: 24 }] },
    WJ: { name: '上踢', cat: 'N', dur: 30, cf: 7, jc: true, poses: [[0, 'crouch', 0.6], [4, 'rise_kick', 0.8], [20, 'stand', 0.25]], vel: [[3, 2]], sfx: { 4: 'swing' }, hits: [{ at: [5, 9], box: [36 * k, -92, 50 * k, 74], dmg: d(36), kind: 'launch', kb: [1.4, -11.6], stun: 26 }] },
    SJ: { name: '扫堂腿', cat: 'N', dur: 30, cf: 8, low: true, poses: [[0, 'crouch', 0.6], [4, 'sweep', 0.8], [20, 'stand', 0.25]], vel: [[3, 4]], sfx: { 4: 'swing' }, hits: [{ at: [5, 10], box: [52 * k, -14, 74 * k, 26], dmg: d(32), kind: 'knock', kb: [3, -4.5], low: true }] },
    aJ: { name: '空中踢', cat: 'N', air: true, dur: 18, nf: 9, next: 'aJ2', cf: 5, poses: [[0, 'jump', 0.6], [2, 'air_kick', 0.75]], hop: -2.4, sfx: { 2: 'swing' }, hits: [{ at: [3, 8], box: [38 * k, -40, 52 * k, 44], dmg: d(23), kb: [2, -3.6], stun: 18 }] },
    aJ2: { name: '空中连踢', cat: 'N', air: true, dur: 20, nf: 10, next: 'aJ3', cf: 5, poses: [[0, 'air_kick', 0.6], [2, 'air_kick2', 0.75]], hop: -2.2, sfx: { 2: 'swing' }, hits: [{ at: [3, 8], box: [42 * k, -58, 58 * k, 44], dmg: d(26), kb: [2.4, -3.8], stun: 20 }] },
    aJ3: { name: '踵落', cat: 'N', air: true, dur: 26, cf: 7, poses: [[0, 'axe_up', 0.6], [5, 'axe_down', 0.7]], hop: -3, sfx: { 5: 'swing' }, hits: [{ at: [6, 10], box: [40 * k, -46, 60 * k, 60], dmg: d(32), kind: 'spike', kb: [2, 12] }] },
    aSJ: {
      name: '俯冲踢', cat: 'N', air: true, dur: 40, cf: 6, poses: [[0, 'dive_kick', 0.6]], vel: [[2, 8.5, 8.5]], grav: 0, landOk: false, sfx: { 2: 'dash' },
      hits: [{ at: [3, 39], box: [24 * k, -12, 42, 40], dmg: d(32), kind: 'knock', kb: [5, -5] }],
      onLand: (f, B) => { f.vy = 0; f.vx = 0; f.setState('land'); f.landT = 9; B.fx.dust(f.x, 0, 8, B.dustColor); },
    },
  };
}

// 持刀(魂界系)
export function bladeSet(o = {}) {
  const k = (o.reach || 1) * 0.94, pw = o.power || 1, sp = o.speed || 1;
  const d = (v) => Math.round(v * pw), T = (v) => Math.round(v / sp);
  const big = !!o.big;
  return {
    J: { name: '横斩', cat: 'N', dur: T(20), nf: T(9), next: 'J2', cf: 5, trail: [1, 7], poses: [[0, 'slash_back', 0.65], [T(3), 'slash_thru', 0.8], [T(12), o.stance || 'stand_w', 0.3]], vel: [[2, 2.6]], sfx: { [T(3)]: big ? 'slash_heavy' : 'slash' }, hits: [{ at: [T(3), T(6)], box: [54 * k, -66, 70 * k, 46], dmg: d(25), stun: 18, kb: [2.6, 0] }] },
    J2: { name: '袈裟斩', cat: 'N', dur: T(21), nf: T(10), next: 'J3', cf: 5, trail: [1, 8], poses: [[0, 'slash_up', 0.65], [T(3), 'slash_down', 0.8], [T(13), o.stance || 'stand_w', 0.3]], vel: [[2, 3]], sfx: { [T(3)]: big ? 'slash_heavy' : 'slash' }, hits: [{ at: [T(3), T(6)], box: [52 * k, -60, 70 * k, 70], dmg: d(27), stun: 19, kb: [2.8, 0] }] },
    J3: { name: '突刺', cat: 'N', dur: T(22), nf: T(11), next: 'J4', cf: 6, trail: [2, 8], poses: [[0, 'iai', 0.6], [T(4), 'thrust', 0.8], [T(14), o.stance || 'stand_w', 0.3]], vel: [[3, 4.6]], sfx: { [T(4)]: 'slash' }, hits: [{ at: [T(4), T(7)], box: [62 * k, -70, 84 * k, 26], dmg: d(29), stun: 20, kb: [3.2, 0] }] },
    J4: { name: '回身斩', cat: 'N', dur: T(32), cf: 8, trail: [3, 12], poses: [[0, 'slash_back', 0.55], [T(5), 'slash_thru', 0.8], [T(9), 'slash_rise', 0.6], [T(20), o.stance || 'stand_w', 0.25]], vel: [[4, 4.8]], sfx: { [T(5)]: 'slash_heavy' }, hits: [{ at: [T(5), T(10)], box: [56 * k, -70, 84 * k, 70], dmg: d(42), kind: 'knock', kb: [7.5, -6.5], stun: 24 }] },
    WJ: { name: '逆风斩', cat: 'N', dur: T(30), cf: 7, jc: true, trail: [2, 10], poses: [[0, 'slash_low', 0.65], [T(4), 'slash_rise', 0.8], [T(20), o.stance || 'stand_w', 0.25]], vel: [[3, 2.4]], sfx: { [T(4)]: 'slash' }, hits: [{ at: [T(4), T(9)], box: [48 * k, -90, 64 * k, 96], dmg: d(36), kind: 'launch', kb: [1.4, -11.8], stun: 26 }] },
    SJ: { name: '下段斩', cat: 'N', dur: T(30), cf: 8, low: true, trail: [2, 9], poses: [[0, 'crouch', 0.6], [T(4), 'slash_low', 0.8], [T(20), o.stance || 'stand_w', 0.25]], vel: [[3, 5]], sfx: { [T(4)]: 'slash' }, hits: [{ at: [T(4), T(9)], box: [62 * k, -18, 90 * k, 34], dmg: d(32), kind: 'knock', kb: [3, -4.5], low: true }] },
    aJ: { name: '空斩', cat: 'N', air: true, dur: T(19), nf: T(9), next: 'aJ2', cf: 5, trail: [1, 8], poses: [[0, 'air_slash_up', 0.65], [T(3), 'air_slash', 0.8]], hop: -2.4, sfx: { [T(3)]: 'slash' }, hits: [{ at: [T(3), T(8)], box: [48 * k, -46, 70 * k, 64], dmg: d(24), kb: [2, -3.6], stun: 18 }] },
    aJ2: { name: '空中连斩', cat: 'N', air: true, dur: T(21), nf: T(10), next: 'aJ3', cf: 5, trail: [1, 8], poses: [[0, 'air_slash', 0.6], [T(3), 'air_slash_up', 0.8]], hop: -2.2, sfx: { [T(3)]: 'slash' }, hits: [{ at: [T(3), T(8)], box: [46 * k, -64, 70 * k, 70], dmg: d(26), kb: [2.4, -3.8], stun: 20 }] },
    aJ3: { name: '坠月斩', cat: 'N', air: true, dur: T(26), cf: 7, trail: [3, 12], poses: [[0, 'air_slash_up', 0.6], [T(5), 'air_slash_down', 0.75]], hop: -3, sfx: { [T(5)]: 'slash_heavy' }, hits: [{ at: [T(5), T(10)], box: [44 * k, -40, 70 * k, 76], dmg: d(32), kind: 'spike', kb: [2, 12] }] },
    aSJ: {
      name: '下落刺', cat: 'N', air: true, dur: 40, cf: 6, trail: [0, 40], poses: [[0, 'air_slash_down', 0.6]], vel: [[2, 6, 10]], grav: 0, sfx: { 2: 'slash' },
      hits: [{ at: [3, 39], box: [22 * k, -6, 50, 50], dmg: d(32), kind: 'knock', kb: [5, -5] }],
      onLand: (f, B) => { f.vy = 0; f.vx = 0; f.setState('land'); f.landT = 10; B.fx.dust(f.x, 0, 10, B.dustColor); B.fx.ring(f.x, 0, 10, 60, '#ffffff', 10, 3, 0.25); },
    },
  };
}

// ---------------------------------------------------------------- 冲刺锁定型奥义(螺旋丸 / 千鸟 / 雷切 ...)
// o: { name, qi, cp, startup, rush, speed, n, every, dmg, fin, finKb, charge(f,B,mv,frame), each(f,B,t), finish(f,B,t), pose, rushPose, lockPose, finPose, air }
export function rushLock(o) {
  const st = o.startup ?? 16, rush = o.rush ?? 24;
  return {
    name: o.name, cat: o.cat || 'I', qi: o.qi, cp: o.cp, cutin: o.cutin ?? (o.qi >= 100), air: !!o.air, dur: 200, shout: true, eye: o.eye, wpn: o.wpn,
    float: o.air ? 999 : undefined, landOk: true, ai: o.ai || { r: [40, 330], type: 'rush', w: 3 },
    trail: o.trail, trailColor: o.trailColor,
    start: (f, B, mv) => { mv.data.lt = -1; if (o.air) { f.vx = 0; f.vy = 0; } },
    tick: (f, B, mv, fr) => {
      const D = mv.data;
      if (fr < st) {
        f.poseOv = P(o.pose || 'hold_sphere'); f.vx *= 0.6;
        if (o.air) { f.vy = 0; }
        o.charge?.(f, B, mv, fr);
        return;
      }
      if (D.lt < 0) {
        if (fr === st) { B.sfx(o.rushSfx || 'dash'); }
        if (fr - st < rush) {
          f.poseOv = P(o.rushPose || 'dash_punch');
          f.vx = f.face * (o.speed ?? 13);
          if (o.air) f.vy = o.dive ?? 6;
          if (fr % 2 === 0) B.afterimage(f, o.color || '#9ad8ff', 8);
          o.rushFx?.(f, B, mv, fr);
          B.meleeCheck(f, { box: o.box || [44, -64, 54, 70], dmg: o.dmg0 ?? 20, kind: 'lock', lockOff: o.lockOff || [46, 0], hs: 6, spark: o.spark, sfx: o.sfx0 }, 0, mv);
          if (mv.lockT) { D.lt = fr; f.vx = 0; f.vy = 0; B.fx.shake(5, 10); }
          return;
        }
        // 落空
        if (!D.miss) { D.miss = true; mv.dur = fr + (o.whiff ?? 20); f.vx = f.face * 2; if (o.air) { f.mv.m = { ...f.mv.m, float: 0 }; } }
        f.poseOv = P(o.stance || 'stand');
        return;
      }
      const k = fr - D.lt, t = mv.lockT;
      f.vx = 0; if (o.air) f.vy = 0;
      f.poseOv = P(o.lockPose || o.rushPose || 'dash_punch');
      const n = o.n ?? 5, ev = o.every ?? 6;
      if (k > 0 && k <= n * ev && k % ev === 0 && t?.state === 'locked') {
        B.hitDirect(f, t, { dmg: o.dmg ?? 20, keepLock: true, hs: 2, spark: o.spark || 'hit', sfx: o.sfxEach, proj: true, super: o.qi > 0 });
        o.each?.(f, B, t, k);
      }
      if (k === n * ev + (o.gap ?? 8)) {
        f.poseOv = P(o.finPose || o.lockPose || 'palm');
        if (t && t.state === 'locked') { B.hitDirect(f, t, { dmg: o.fin ?? 80, kind: o.finKind || 'knock', kb: o.finKb || [10, -8], hs: 10, spark: o.spark || 'heavy', sfx: o.sfxFin || 'hit_heavy', spin: true, noTech: true, super: o.qi > 0 }); }
        o.finish?.(f, B, t);
        mv.dur = fr + (o.rec ?? 26);
      }
      if (k > n * ev + (o.gap ?? 8)) f.poseOv = P(o.finPose || o.lockPose || 'palm');
    },
  };
}

// ---------------------------------------------------------------- 目标陷阱(砂缚柩 / 黑棺 / 千年冰牢 / 月读)
// 在对手位置延迟生成判定,命中后由陷阱锁定目标并多段伤害
export function trapMove(o) {
  return {
    name: o.name, cat: o.cat || 'I', qi: o.qi, cp: o.cp, cutin: o.cutin ?? (o.qi >= 100), dur: o.dur ?? 60, shout: o.qi > 0, eye: o.eye, cond: o.cond, darken: o.darken,
    ai: o.ai || { r: [80, 560], type: 'trap', w: 3 }, poses: o.poses || [[0, o.pose || 'cast_down', 0.5]], air: !!o.air, float: o.air ? 50 : undefined,
    ev: {
      [o.at ?? 10]: (f, B, mv) => {
        B.sfx(o.sfx || 'bind');
        const p = atFoe(f, B, {
          kind: o.kind, w: o.w ?? 70, h: o.h ?? 130, y: -65, delay: o.delay ?? 14, life: o.life ?? 90, hits: 99, every: 999, pierce: true, clash: false, color: o.color, act: [0, o.actF ?? 6],
          hit: { dmg: o.dmg0 ?? 15, kind: 'lock', lockOff: [0, 65], unblock: o.unblock ?? true, spark: o.spark, sfx: o.sfx0 || 'hit_mid' },
          drawTele: o.tele,
          onHit: (B2, p2, t) => { if (t.state === 'locked') { p2.held = t; p2.ht = 0; p2.life = Math.max(p2.life, (o.n ?? 6) * (o.every ?? 8) + 40); } },
          tick: (B2, p2) => {
            if (p2.held && p2.held.state === 'locked' && p2.held.lockBy === p2) {
              p2.held.lockBy = p2;
              const k = ++p2.ht, n = o.n ?? 6, ev = o.every ?? 8;
              if (k % ev === 0 && k <= n * ev) { B2.hitDirect(f, p2.held, { dmg: o.dmg ?? 22, keepLock: true, hs: 2, spark: o.spark || 'hit', sfx: o.sfxEach || 'hit_mid', proj: true, super: o.qi > 0 }); o.each?.(B2, p2, k); }
              if (k === n * ev + (o.gap ?? 12)) {
                B2.hitDirect(f, p2.held, { dmg: o.fin ?? 70, kind: o.finKind || 'knock', kb: o.finKb || [2, -9], hs: 10, spark: o.spark || 'heavy', sfx: o.sfxFin || 'hit_heavy', noTech: true, proj: true, super: o.qi > 0, dir: f.face });
                o.finish?.(B2, p2);
                p2.held = null; p2.life = 14;
              }
            } else if (p2.held) { p2.held = null; p2.life = Math.min(p2.life, 10); }
            o.tick?.(B2, p2);
          },
        });
        p.y = -65;
        o.spawn?.(f, B, p);
      },
    },
  };
}

// ---------------------------------------------------------------- 变身 / 觉醒
export function transform(o) {
  return {
    name: o.name, cat: 'I', qi: o.qi ?? 300, cutin: true, dur: o.dur ?? 50, shout: true, poses: [[0, o.pose || 'charge', 0.4], [30, o.pose2 || 'victory', 0.3]],
    ai: { r: [0, 999], type: 'buff', w: 2 }, armor: [0, 40],
    cond: (f) => !f.buff,
    ev: {
      12: (f, B) => {
        f.buff = { t: o.time ?? 900, dmg: o.dmg ?? 1.3, spd: o.spd ?? 1.12, def: o.def ?? 1.15, cpRegen: o.cpRegen ?? 2.5, aura: o.aura, hollow: o.hollow, eye: o.eye, regen: o.regen, name: o.name, tint: o.tint || o.aura };
        if (o.look) { const base = f.look; f.look = { ...base, ...o.look }; f.buff.onEnd = () => { f.look = base; }; }
        B.fx.ring(f.x, f.y - 50, 20, 200, o.aura || '#ffffff', 22, 8);
        B.fx.flash(o.aura || '#ffffff', 8); B.fx.shake(8, 18);
        B.sfx('aura');
        for (const t of B.enemiesOf(f.side)) if (Math.abs(t.x - f.x) < 170 && Math.abs(t.y - f.y) < 150) B.applyHit(f, t, { dmg: o.burst ?? 50, kind: 'knock', kb: [9, -7], unblock: true, super: true }, { dir: t.x > f.x ? 1 : -1, px: t.x, py: t.y - 60 });
        o.onStart?.(f, B);
      },
    },
  };
}

// 小工具:在角色手部附近生成光团特效
export function handPos(f, dx = 40, dy = -66) { return [f.x + f.face * dx * f.scale, f.y + dy * f.scale]; }
export const jitter = (v) => v + vr(-4, 4);
