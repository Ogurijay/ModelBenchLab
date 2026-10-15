// 民居自测：用 __bench 的键盘驱动真实走一遍"门外 → 推门进屋 → 走到楼梯 → 上到顶层"，以及撞墙测试。
// 用法（tools/probe.mjs）：__ctx.houses.walk('trade-12')、__ctx.houses.wallTest('mage-3')、__ctx.houses.pick({face:'E'})
export function installHouseDebug(ctx, plans) {
  const byId = new Map(plans.map((p) => [p.id, p]));
  const toW = (p, x, y, z) => p.S.toWorld(x, y, z);
  const toL = (p, wx, wz) => {
    const c = Math.cos(p.ry);
    const s = Math.sin(p.ry);
    const dx = wx - p.cx;
    const dz = wz - p.cz;
    return [c * dx - s * dz, s * dx + c * dz];
  };
  const yawTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));

  // 房屋局部坐标里的路径点
  function route(p) {
    const s = p.stair;
    const pts = [{ x: p.dx, z: p.iz1(0) - 0.7, note: '进门' }];
    if (!s) {
      pts.push({ x: p.ix0 + 1.0, z: p.iz0 + 1.0, note: '单层：走到屋角' });
      return pts;
    }
    pts.push({ x: p.dx, z: s.walk, note: '楼梯前走道' });
    pts.push({ x: p.sx * (s.ua - 0.7), z: s.walk });
    pts.push({ x: p.sx * (s.ua - 0.7), z: s.zA, note: '楼梯起步' });
    pts.push({ x: p.sx * (s.ua + s.L + 0.55), z: s.zA, note: '二层平台', expectY: p.top(1) });
    if (p.F >= 3) {
      pts.push({ x: p.sx * (s.ua + s.L + 0.55), z: s.zB, note: '转到 B 道' });
      pts.push({ x: p.sx * (s.ua - 0.6), z: s.zB, note: '三层平台', expectY: p.top(2) });
    }
    return pts;
  }

  // fast：直接驱动 player.update（与 __bench.key 同一套物理，只是不渲染），用于全量 216 栋回归
  function walk(id, fast = false) {
    const p = byId.get(id);
    if (!p) return `没有 ${id}`;
    const P = ctx.player;
    const b = fast
      ? {
          teleport: (x, y, z, yaw, pitch) => P.teleport(x, y, z, yaw, pitch),
          stepFrame: (n) => { for (let i = 0; i < n; i++) P.update(1 / 60); },
          key: (code, n) => { P.keys.add(code); for (let i = 0; i < n; i++) P.update(1 / 60); P.keys.delete(code); },
          getState: () => ({ pos: [+P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2)], indoor: null }),
        }
      : window.__bench;
    const pts = route(p);
    const o = toW(p, p.dx, p.base, p.zf(0) + 2.4);
    const f = toW(p, pts[0].x, 0, pts[0].z);
    b.teleport(o.x, p.base, o.z, yawTo(o.x, o.z, f.x, f.z), 0);
    b.stepFrame(10);
    const log = [{ note: '门外', pos: b.getState().pos, indoor: b.getState().indoor }];
    for (const pt of pts) {
      const t = toW(p, pt.x, 0, pt.z);
      let it = 0;
      for (; it < 160; it++) {
        const dx = t.x - P.pos.x;
        const dz = t.z - P.pos.z;
        if (Math.hypot(dx, dz) < 0.18) break;
        P.yaw = Math.atan2(-dx, -dz);
        b.key('KeyW', 2);
      }
      b.stepFrame(12);
      const st = b.getState();
      const [lx, lz] = toL(p, P.pos.x, P.pos.z);
      log.push({
        note: pt.note || '',
        pos: st.pos,
        local: [+lx.toFixed(2), +lz.toFixed(2)],
        miss: +Math.hypot(t.x - P.pos.x, t.z - P.pos.z).toFixed(2),
        expectY: pt.expectY != null ? +pt.expectY.toFixed(2) : undefined,
        indoor: st.indoor,
      });
    }
    const last = log[log.length - 1];
    const topY = p.top(p.F - 1);
    return {
      id, name: p.name, district: p.district, face: p.face, floors: p.F, biz: p.biz,
      reachedTop: Math.abs(last.pos[1] - topY) < 0.05,
      topY: +topY.toFixed(2),
      log,
    };
  }

  // 撞墙：室内朝侧墙走 2 秒、室外朝无门的墙走 2 秒，都必须停在墙外皮以内 / 以外
  function wallTest(id) {
    const p = byId.get(id);
    const b = window.__bench;
    const P = ctx.player;
    const out = {};
    // 室内 → 沿楼梯前走道（网格里不放家具）朝 +x 侧墙
    const zw = p.stair ? p.stair.walk : 0;
    const a = toW(p, 0, p.top(0), zw);
    const tgt = toW(p, 10, 0, zw);
    b.teleport(a.x, p.top(0), a.z, yawTo(a.x, a.z, tgt.x, tgt.z), 0);
    b.key('KeyW', 120);
    const [lx] = toL(p, P.pos.x, P.pos.z);
    out.insideToSide = { localX: +lx.toFixed(2), wallInner: +p.ix1.toFixed(2), blocked: lx <= p.ix1 - 0.3 && lx > p.ix1 - 0.4 };
    // 室外 → 朝正面墙（避开门洞 / 窗洞——窗台高 1.15 也挡人）
    const ax = p.dx > 0 ? p.ix0 + 0.5 : p.ix1 - 0.5;
    const s = toW(p, ax, p.base, p.zf(0) + 3);
    const t2 = toW(p, ax, 0, 0);
    b.teleport(s.x, p.base, s.z, yawTo(s.x, s.z, t2.x, t2.z), 0);
    b.key('KeyW', 120);
    const [, lz] = toL(p, P.pos.x, P.pos.z);
    out.outsideToFront = { localZ: +lz.toFixed(2), wallOuter: +p.zf(0).toFixed(2), blocked: lz >= p.zf(0) + 0.3 };
    out.probeWall = b.probe(toW(p, ax, 0, p.zf(0) - p.T / 2).x, toW(p, ax, 0, p.zf(0) - p.T / 2).z);
    out.probeDoor = b.probe(toW(p, p.dx, 0, p.zf(0) - p.T / 2).x, toW(p, p.dx, 0, p.zf(0) - p.T / 2).z);
    return out;
  }

  function pick(q = {}) {
    return plans
      .filter((p) => Object.entries(q).every(([k, v]) => (k === 'floors' ? p.F === v : p[k] === v)))
      .slice(0, 8)
      .map((p) => ({ id: p.id, name: p.name, district: p.district, face: p.face, floors: p.F, biz: p.biz, W: +p.W.toFixed(1), D: +p.D.toFixed(1) }));
  }

  // 门外 / 室内 / 楼上的相机位置（世界坐标），给截图机位用
  function spots(id) {
    const p = byId.get(id);
    const v = (x, y, z) => {
      const w = toW(p, x, y, z);
      return [+w.x.toFixed(2), +w.y.toFixed(2), +w.z.toFixed(2)];
    };
    return { door: v(p.dx, p.base, p.zf(0) + 2.4), inside: v(p.dx, p.top(0), p.iz1(0) - 0.8), center: v(0, p.top(0), 0) };
  }

  // 全量回归：每栋都从门外走到顶层，返回失败清单
  function walkAll() {
    const fails = [];
    let ok = 0;
    for (const p of plans) {
      const r = walk(p.id, true);
      if (r.reachedTop) ok++;
      else fails.push({ id: p.id, F: p.F, last: r.log[r.log.length - 1], log: r.log.map((l) => `${l.note}:${l.pos.join(',')}`) });
    }
    return { ok, total: plans.length, fails };
  }

  Object.assign(ctx.houses, { walk, walkAll, wallTest, pick, spots, route: (id) => route(byId.get(id)) });
}
