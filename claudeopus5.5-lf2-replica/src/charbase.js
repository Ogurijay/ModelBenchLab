// 角色定义基础设施:模板帧 + 招式帧 → 预解算碰撞几何(由姿势骨架自动求受击框、按关节锚点放攻击框)。
import { BASE_STATS } from './config.js';
import { buildTemplate, seq, F, ST, END, HIT } from './frames.js';
import { POSES } from './poses.js';
import { solvePose } from './skeleton.js';

export const CHARS = {};

export function resolveGeometry(def) {
  const look = def.look;
  const geo = {};
  const poseCache = new Map();
  for (const id in def.frames) {
    const fr = def.frames[id];
    let J = poseCache.get(fr.pic);
    if (!J) {
      const p = POSES[fr.pic];
      if (!p) throw new Error(`${def.id}: frame ${id} unknown pose ${fr.pic}`);
      J = solvePose(p, look);
      poseCache.set(fr.pic, J);
    }
    let bdy = null;
    if (fr.bdy === null) bdy = null;
    else if (fr.bdy) bdy = fr.bdy;
    else {
      const pts = [J.hip, J.sh, J.head, J.knF, J.knB, J.ftF, J.ftB, J.neck];
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
      y0 -= J.L.R * 0.9;
      x0 = Math.min(x0 - 4, -11); x1 = Math.max(x1 + 4, 11);
      x0 = Math.max(x0, -30); x1 = Math.min(x1, 30);
      bdy = { x: x0, y: y0, w: x1 - x0, h: Math.max(16, y1 - y0) };
    }
    const itrs = (fr.itr || []).map((it) => {
      const w = it.w ?? 26, h = it.h ?? 22;
      let box;
      if (it.box) box = it.box;
      else if (it.at) { const a = J[it.at]; box = { x: a[0] - w / 2 + (it.dx || 0), y: a[1] - h / 2 + (it.dy || 0), w, h }; }
      else box = { x: it.x ?? 0, y: it.y ?? -60, w, h };
      return { box, itr: it };
    });
    geo[id] = { bdy, itrs, handF: J.haF };
  }
  def.geo = geo;
}

export function makeChar(id, o) {
  const frames = buildTemplate(!!o.soldier);
  const def = {
    id, lookId: o.lookId || id, name: o.name, look: o.look,
    stats: { ...BASE_STATS, ...(o.stats || {}) },
    hp: o.hp ?? 500, mp: o.mp ?? 500,
    frames, moves: {}, ai: o.ai || { specials: [] },
    desc: o.desc || '', role: o.role || '', moveList: o.moveList || [],
    hidden: !!o.hidden, ...o.extra,
  };
  if (o.build) o.build(frames, def);
  if (o.moves) Object.assign(def.moves, o.moves);
  resolveGeometry(def);
  CHARS[id] = def;
  return def;
}

// ---------------------------------------------------------------- 招式构造小助手
// 气功类:起手 → 发出(opoint)→ 收势(帧内再按 A 可连发)
export function ballMove(fr, id, oid, mp, o = {}) {
  seq(fr, id, [
    [o.pic0 || 'cast0', o.w0 ?? 3],
    [o.pic1 || 'cast1', o.w1 ?? 3, { opoint: [{ oid, x: o.ox ?? 28, y: o.oy ?? -46, zFromInput: o.zIn ?? 1.2, ...(o.op || {}) }], sound: o.sound || 'ball_launch' }],
    [o.pic2 || 'cast2', o.w2 ?? 6, o.repeat !== false ? { hit_a: id } : {}],
  ], { state: ST.ATTACK, mp, stop: true, ...(o.common || {}) });
  return id;
}

export { seq, F, ST, END, HIT };
