// Rapier 物理封装:世界、碰撞分组、同一动物自身部件不互撞的接触过滤、射线/形状查询辅助。
import RAPIER from '@dimforge/rapier3d-compat';

export { RAPIER };

// 碰撞分组位
export const G = {
  ENV: 1,      // 静态/运动学场景
  BODY: 2,     // 动物躯干/头/手臂
  LEG: 4,      // 动物腿(站立时不与场景碰撞,由悬浮弹簧托住身体)
  PROP: 8,     // 道具、武器、可推动物件
  ALL: 0xffff,
};
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);

export const GROUPS = {
  env: groups(G.ENV, G.BODY | G.PROP | G.LEG),
  body: groups(G.BODY, G.ENV | G.BODY | G.LEG | G.PROP),
  legStand: groups(G.LEG, G.BODY | G.PROP | G.LEG),
  legRag: groups(G.LEG, G.ENV | G.BODY | G.PROP | G.LEG),
  prop: groups(G.PROP, G.ENV | G.BODY | G.LEG | G.PROP),
  propHeld: groups(G.PROP, G.BODY | G.LEG | G.PROP), // 手持武器不与场景卡住
};

let inited = false;
export async function initPhysics() {
  if (!inited) { await RAPIER.init(); inited = true; }
}

export const GRAVITY = -19;
export const DT = 1 / 60;

export class Physics {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = DT;
    this.world.integrationParameters.numSolverIterations = 6;
    this.events = new RAPIER.EventQueue(true);
    this.owner = new Map();       // rigidBody handle -> owner id(同一 owner 的刚体互不接触)
    this.colliderInfo = new Map(); // collider handle -> { kind, creature, part, item, ... }
    const owner = this.owner;
    this.hooks = {
      filterContactPair(c1, c2, b1, b2) {
        const o1 = owner.get(b1), o2 = owner.get(b2);
        if (o1 !== undefined && o1 === o2) return null;
        return RAPIER.SolverFlags.COMPUTE_IMPULSE;
      },
      filterIntersectionPair() { return true; },
    };
    // 场景静态物统一挂在一个固定刚体上,便于抓握关节连接
    this.ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this.ballShapes = new Map();
  }

  step() {
    this.world.step(this.events, this.hooks);
  }

  info(collider) { return collider ? this.colliderInfo.get(collider.handle) : undefined; }

  setInfo(collider, info) { this.colliderInfo.set(collider.handle, info); return collider; }

  // 静态盒体(挂在 ground 上)
  staticBox(hx, hy, hz, pos, quat, opts = {}) {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(pos.x, pos.y, pos.z)
      .setFriction(opts.friction ?? 0.9)
      .setRestitution(opts.restitution ?? 0.05)
      .setCollisionGroups(GROUPS.env);
    if (quat) d.setRotation(quat);
    const c = this.world.createCollider(d, opts.body || this.ground);
    this.setInfo(c, { kind: 'env', tag: opts.tag, slippery: opts.friction !== undefined && opts.friction < 0.2 });
    return c;
  }

  staticCylinder(hh, r, pos, quat, opts = {}) {
    const d = RAPIER.ColliderDesc.cylinder(hh, r)
      .setTranslation(pos.x, pos.y, pos.z)
      .setFriction(opts.friction ?? 0.9)
      .setCollisionGroups(GROUPS.env);
    if (quat) d.setRotation(quat);
    const c = this.world.createCollider(d, opts.body || this.ground);
    this.setInfo(c, { kind: 'env', tag: opts.tag });
    return c;
  }

  // three BufferGeometry -> 三角网格碰撞体(世界坐标或挂在给定刚体)
  staticTrimesh(geometry, opts = {}) {
    const g = geometry.index ? geometry : null;
    const pos = geometry.attributes.position.array;
    const verts = new Float32Array(pos.length);
    verts.set(pos);
    let idx;
    if (g) idx = new Uint32Array(geometry.index.array);
    else { idx = new Uint32Array(pos.length / 3); for (let i = 0; i < idx.length; i++) idx[i] = i; }
    const d = RAPIER.ColliderDesc.trimesh(verts, idx)
      .setFriction(opts.friction ?? 0.9)
      .setCollisionGroups(GROUPS.env);
    const c = this.world.createCollider(d, opts.body || this.ground);
    this.setInfo(c, { kind: 'env', tag: opts.tag });
    return c;
  }

  kinematicBody(pos, quat) {
    const d = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z);
    if (quat) d.setRotation(quat);
    return this.world.createRigidBody(d);
  }

  // 向下(或任意方向)射线;exclude 为 owner id,忽略该动物自身
  castRay(origin, dir, maxDist, filterGroups, excludeOwner) {
    this.ray.origin = origin;
    this.ray.dir = dir;
    const owner = this.owner;
    const pred = excludeOwner === undefined || excludeOwner === null ? undefined : (col) => {
      const b = col.parent();
      return !(b && owner.get(b.handle) === excludeOwner);
    };
    return this.world.castRayAndGetNormal(this.ray, maxDist, true, undefined, filterGroups, undefined, undefined, pred);
  }

  // 向下扫掠小球:返回 { collider, dist(球心到接触面的竖直距离) };窄缝/边缘比单根射线更宽容
  castBallDown(origin, r, maxDist, filterGroups, excludeOwner) {
    const owner = this.owner;
    const pred = excludeOwner === undefined ? undefined : (col) => {
      const b = col.parent();
      return !(b && owner.get(b.handle) === excludeOwner);
    };
    const hit = this.world.castShape(origin, IDENT_Q, DOWN, this.ball(r), maxDist, true, undefined, filterGroups, undefined, undefined, pred);
    if (!hit) return null;
    return { collider: hit.collider, dist: hit.toi + r };
  }

  ball(r) {
    let s = this.ballShapes.get(r);
    if (!s) { s = new RAPIER.Ball(r); this.ballShapes.set(r, s); }
    return s;
  }

  // 球形范围内的碰撞体。先收集再回调:查询期间 world 被借用,回调里不能改刚体(否则 wasm 报 aliasing 错误)
  overlapBall(center, r, filterGroups, cb) {
    const found = [];
    this.world.intersectionsWithShape(center, IDENT_Q, this.ball(r), (c) => { found.push(c); return true; }, undefined, filterGroups);
    for (const c of found) cb(c);
  }
}

const IDENT_Q = { x: 0, y: 0, z: 0, w: 1 };
const DOWN = { x: 0, y: -1, z: 0 };
