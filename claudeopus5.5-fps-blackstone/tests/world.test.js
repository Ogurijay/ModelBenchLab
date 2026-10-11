import { describe, it, expect, beforeAll } from 'vitest';
import { CollisionWorld, SHOT } from '../src/world/collision.js';
import { LevelBuilder } from '../src/world/builder.js';
import { buildFacility, WORLD_BOUNDS } from '../src/world/map.js';
import { NavGrid } from '../src/world/nav.js';

let world, markers, nav;

function body(x, y, z) {
  return { pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, radius: 0.35, height: 1.8, step: 0.45, snap: 0.35, grounded: true, ground: null };
}

beforeAll(() => {
  const b = WORLD_BOUNDS;
  world = new CollisionWorld(b.minX, b.minZ, b.maxX, b.maxZ, 4);
  const B = new LevelBuilder(world);
  markers = buildFacility(B);
  const t0 = performance.now();
  // 导航按"门全开"构建，关门用 setBlockedRect 表达
  for (const d of Object.values(markers.doors)) d.collider.enabled = false;
  nav = new NavGrid(world, { minX: -42, minZ: -46, maxX: 42, maxZ: 60 }).build();
  console.log('nav nodes', nav.count, 'comps', nav.compCount, 'ms', (performance.now() - t0).toFixed(1), 'colliders', world.colliders.length);
});

const reach = (a, b) => {
  const p = nav.findPath(a.x, a.y ?? 0, a.z, b.x, b.y ?? 0, b.z, 20000);
  if (!p || !p.length) return false;
  const last = p[p.length - 1];
  return Math.hypot(last.x - b.x, last.z - b.z) < 2.5 && Math.abs(last.y - (b.y ?? 0)) < 1;
};

describe('碰撞世界', () => {
  it('射线命中墙体并给出法线', () => {
    // 从庭院向西射向仓库东墙
    const hit = world.raycast(0, 1.5, 5, -1, 0, 0, 100, SHOT);
    expect(hit).toBe(true);
    expect(world.hit.x).toBeGreaterThan(-18.5);
    expect(world.hit.nx).toBeCloseTo(1);
  });
  it('射线命中地面', () => {
    expect(world.raycast(0, 2, 22, 0, -1, 0, 10, SHOT)).toBe(true);
    expect(world.hit.y).toBeCloseTo(0);
  });
  it('角色走上仓库坡道到达走廊', () => {
    const b = body(-19.9, 0, 8.5);
    for (let i = 0; i < 240 * 5; i++) {
      b.vel.x = 0;
      b.vel.z = -4.5;
      world.moveBody(b, 1 / 240, 20);
    }
    expect(b.pos.y).toBeGreaterThan(4.0);
    expect(b.pos.z).toBeLessThan(-8);
  });
  it('角色被墙挡住且不穿墙', () => {
    const b = body(-16, 0, 5);
    for (let i = 0; i < 240 * 2; i++) {
      b.vel.x = -6;
      b.vel.z = 0;
      world.moveBody(b, 1 / 240, 20);
    }
    expect(b.pos.x).toBeGreaterThan(-17.8);
  });
  it('可以跳上 1.2m 箱子', () => {
    const b = body(1.6, 0, 22.4);
    b.vel.y = 7.2;
    b.grounded = false;
    for (let i = 0; i < 240; i++) {
      b.vel.x = 0;
      b.vel.z = -3;
      world.moveBody(b, 1 / 240, 22);
    }
    expect(b.pos.y).toBeGreaterThan(1.1);
  });
});

describe('导航网格', () => {
  it('闸门关闭时渗透区无法进入庭院', () => {
    const d = markers.doors.gate;
    nav.setBlockedRect(...d.nav, true);
    expect(reach(markers.playerSpawn, { ...markers.interact.gateTerminal, y: 0 })).toBe(true);
    expect(reach(markers.playerSpawn, { x: 0, z: 10 })).toBe(false);
    nav.setBlockedRect(...d.nav, false);
  });
  it('关键目标连通', () => {
    const s = markers.playerSpawn;
    expect(reach(s, { x: 0, z: 10 })).toBe(true);
    expect(reach(s, { ...markers.interact.serverTerminal, y: 0 })).toBe(true);
    for (const p of markers.pylons) expect(reach(s, { x: p.x + 1.8, z: p.z + 1.8 })).toBe(true);
    expect(reach(s, { ...markers.helipad, y: 0.2 })).toBe(true);
    expect(reach(s, { x: -31.5, z: 25.5 })).toBe(true); // 军械库
    expect(reach(s, { x: 36, z: 23 })).toBe(true); // 办公区
  });
  it('走廊与地面连通（经坡道）', () => {
    expect(reach({ x: 0, z: 10 }, { x: -38.2, y: 4.2, z: 10 })).toBe(true);
    expect(reach({ x: 0, z: -20 }, { x: 5, y: 4.5, z: -42 })).toBe(true);
  });
  it('所有刷怪点落在主连通分量', () => {
    const main = nav.comp[nav.nodeAt(0, 0, 10)];
    for (const [id, p] of Object.entries(markers.spawns)) {
      const k = nav.nodeAt(p.x, p.y, p.z, 0.6);
      expect(k, id).toBeGreaterThanOrEqual(0);
      expect(nav.comp[k], id).toBe(main);
    }
  });
});
