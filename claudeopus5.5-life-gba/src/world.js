// 世界层:地图运行时、玩家与镇民、碰撞与寻路、行动执行、昼夜光照、深度排序绘制。
import { ctx, W, H, P, rect, text, textW, textC, ptext, ptextS, pwidth, panel, mk, hash2, shade } from './gfx.js';
import { tile, furniture, building, simFrame, plumbob, icon, bubble } from './sprites.js';
import { MAPS, SOLID_TILES } from './maps.js';
import { NPCS, SOCIALS, STORY, CHAPTERS, MOTIVES, shopItem } from './data.js';
import * as sim from './sim.js';
import { S, BASE_SPEED } from './sim.js';
import { input } from './input.js';
import { sfx, playMusic } from './audio.js';
import { ui, say, menu, toast, drawHUD, drawToasts, pauseMenu } from './ui.js';
import { menuFor, socialMenu, resolveSocial, socialLine } from './actions.js';

const TS = 16;
const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const world = {
  map: null, player: null, npcs: [], cam: { x: 0, y: 0 },
  fx: [], fade: 0, fadeTo: 0, onFaded: null, banner: null, lock: 0, seq: null,
  time: 0, speedShown: 1, handlers: {},

  // ---------- 对外 API ----------
  obj(id) { return this.map.objects.find((o) => o.id === id); },
  run(obj, def) { startAction(obj, def); },
  npcNear(id, dist) {
    const n = this.npcs.find((n) => n.id === id);
    return n && Math.hypot(n.x - this.player.x, n.y - this.player.y) <= dist ? n : null;
  },
  removePuddle(o) {
    if (this.map.id === 'home') S.home.puddles = S.home.puddles.filter((p) => !(p.x === o.x && p.y === o.y));
    this.map.objects = this.map.objects.filter((x) => x !== o);
    rebuildIndex(this.map);
  },
  social(npc, s) { beginSocial(npc, s); },
  endTalk(npc) { npc.state = 'idle'; npc.timer = 90; },
  ending() { this.handlers.ending?.(); },
  enter(mapId, x, y, dir) { loadMap(mapId, x, y, dir); },
  resume() { updateMusic(); },
  // 只重建物件(不打断当前行动、不重刷镇民)
  rebuild() { this.map = buildMap(this.map.id); },
};

// ---------------------------------------------------------------- 地图运行时
function rebuildIndex(m) {
  m.solid.fill(0);
  m.objAt.fill(null);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (SOLID_TILES.has(m.tiles[y][x])) m.solid[y * m.w + x] = 1;
  for (const o of m.objects) {
    if (o.wall) continue;
    for (let yy = o.y; yy < o.y + o.h; yy++) for (let xx = o.x; xx < o.x + o.w; xx++) {
      if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
      const i = yy * m.w + xx;
      if (o.t === 'building' && xx === o.x + o.door && yy === o.y + o.h - 1) continue; // 门洞可走
      if (o.solid !== false && o.t !== 'puddle') m.solid[i] = 1;
      if (o.act) m.objAt[i] = o;
    }
  }
}

function buildMap(id) {
  const def = MAPS[id];
  const tiles = def.tiles;
  const m = {
    id, def, tiles, w: tiles[0].length, h: tiles.length, theme: def.theme,
    solid: new Uint8Array(tiles[0].length * tiles.length),
    objAt: new Array(tiles[0].length * tiles.length).fill(null),
    objects: [], doors: [], lights: [],
  };
  for (const o of def.objects) {
    if (o.need && !S.owned[o.need]) continue;
    const inst = { ...o, w: o.w || 1, h: o.h || 1 };
    m.objects.push(inst);
    if (o.t === 'building') m.doors.push({ x: o.x + o.door, y: o.y + o.h - 1, to: o.to, name: o.name, b: inst });
    if (o.light) m.lights.push({ x: o.x * TS + 8, y: o.y * TS - 2, r: 40 });
  }
  if (id === 'town') {
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (tiles[y][x] === 'T') m.objects.push({ id: `tree${x}_${y}`, t: 'tree', variant: (hash2(x, y) * 3) | 0, x, y, w: 1, h: 1, deco: true });
    }
  }
  if (id === 'home') {
    for (const p of S.home.puddles) m.objects.push({ id: `pud${p.x}_${p.y}`, t: 'puddle', x: p.x, y: p.y, w: 1, h: 1, act: 'puddle', name: '水洼', solid: false, flat: true });
  }
  rebuildIndex(m);
  return m;
}

function loadMap(id, x, y, dir, keepPos = false) {
  const m = buildMap(id);
  world.map = m;
  const p = world.player;
  if (!keepPos) {
    const e = x == null ? m.def.entry : { x, y, dir };
    p.x = e.x * TS + 8; p.y = e.y * TS + 13; p.dir = e.dir || dir || 'down';
  }
  p.path = null; p.action = null; p.pose = 'stand';
  S.map = id;
  world.npcs = [];
  refreshNPCs(true);
  updateMusic();
  if (!keepPos) world.banner = { text: m.def.name, t: 2.2 };
  snapCamera();
}

function updateMusic() {
  if (!world.map) return;
  const id = world.map.id;
  if (id === 'town') playMusic(sim.isNight() ? 'night' : 'town');
  else if (id === 'home') playMusic(sim.isNight() ? 'night' : 'home');
  else if (id === 'gym' || id === 'garage') playMusic('work');
  else playMusic('shop');
}

const tileAt = (m, tx, ty) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? '#' : m.tiles[ty][tx]);
const solidAt = (m, tx, ty) => tx < 0 || ty < 0 || tx >= m.w || ty >= m.h || m.solid[ty * m.w + tx] === 1;

// ---------------------------------------------------------------- 碰撞与寻路
const HW = 5, HH = 5;
function blockedAt(x, y, self) {
  const m = world.map;
  const x0 = Math.floor((x - HW) / TS), x1 = Math.floor((x + HW - 0.01) / TS);
  const y0 = Math.floor((y - HH) / TS), y1 = Math.floor((y - 0.01) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(m, tx, ty)) return true;
  // 人物之间互相阻挡
  const others = self === world.player ? world.npcs : [world.player, ...world.npcs.filter((n) => n !== self)];
  for (const o of others) {
    if (!o || o.hidden) continue;
    if (Math.abs(o.x - x) < HW * 2 - 1 && Math.abs(o.y - y) < HH + 1) return true;
  }
  return false;
}

function tryMove(a, dx, dy) {
  let moved = false;
  if (dx) {
    if (!blockedAt(a.x + dx, a.y, a)) { a.x += dx; moved = true; }
    else if (a === world.player) {
      // 转角辅助:上下偏移几像素即可通过时自动滑过去
      for (const off of [1, 2, 3, 4, 5, 6]) {
        if (!blockedAt(a.x + dx, a.y - off, a) && !blockedAt(a.x, a.y - 1, a)) { a.y -= 1; moved = true; break; }
        if (!blockedAt(a.x + dx, a.y + off, a) && !blockedAt(a.x, a.y + 1, a)) { a.y += 1; moved = true; break; }
      }
    }
  }
  if (dy) {
    if (!blockedAt(a.x, a.y + dy, a)) { a.y += dy; moved = true; }
    else if (a === world.player) {
      for (const off of [1, 2, 3, 4, 5, 6]) {
        if (!blockedAt(a.x - off, a.y + dy, a) && !blockedAt(a.x - 1, a.y, a)) { a.x -= 1; moved = true; break; }
        if (!blockedAt(a.x + off, a.y + dy, a) && !blockedAt(a.x + 1, a.y, a)) { a.x += 1; moved = true; break; }
      }
    }
  }
  return moved;
}

const tileOf = (a) => [Math.floor(a.x / TS), Math.floor((a.y - 3) / TS)];

export function bfs(sx, sy, tx, ty, opts = {}) {
  const m = world.map;
  if (sx === tx && sy === ty) return [];
  const N = m.w * m.h;
  const prev = new Int32Array(N).fill(-1);
  const q = new Int32Array(N);
  let qh = 0, qt = 0;
  const start = sy * m.w + sx, goal = ty * m.w + tx;
  if (start < 0 || start >= N) return null;
  prev[start] = start; q[qt++] = start;
  const avoid = opts.avoidDoors ? new Set(m.doors.map((d) => d.y * m.w + d.x)) : null;
  while (qh < qt) {
    const c = q[qh++];
    if (c === goal) break;
    const cx = c % m.w, cy = (c / m.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
      const ni = ny * m.w + nx;
      if (prev[ni] !== -1) continue;
      if (m.solid[ni] && ni !== goal) continue;
      if (ni !== goal && (m.tiles[ny][nx] === 'E' || (avoid && avoid.has(ni)))) continue;
      prev[ni] = c; q[qt++] = ni;
    }
  }
  if (prev[goal] === -1) return null;
  const path = [];
  for (let c = goal; c !== start; c = prev[c]) path.push([c % m.w, (c / m.w) | 0]);
  return path.reverse();
}

function followPath(a, speed) {
  if (!a.path || !a.path.length) return true;
  const [tx, ty] = a.path[0];
  const gx = tx * TS + 8, gy = ty * TS + 13;
  const dx = gx - a.x, dy = gy - a.y;
  const d = Math.hypot(dx, dy);
  if (d <= speed) {
    a.x = gx; a.y = gy; a.path.shift();
    return !a.path.length;
  }
  const mx = (dx / d) * speed, my = (dy / d) * speed;
  if (Math.abs(dx) > Math.abs(dy)) a.dir = dx > 0 ? 'right' : 'left';
  else a.dir = dy > 0 ? 'down' : 'up';
  // NPC 被玩家挡住时原地等待
  if (a !== world.player) {
    const p = world.player;
    if (Math.abs(p.x - (a.x + mx * 4)) < 10 && Math.abs(p.y - (a.y + my * 4)) < 7) { a.blocked = (a.blocked || 0) + 1; return false; }
  }
  a.blocked = 0;
  a.x += mx; a.y += my;
  a.moving = true;
  return false;
}

// ---------------------------------------------------------------- 玩家
export function initWorld(handlers) {
  world.handlers = handlers;
  world.player = { x: S.x, y: S.y, dir: S.dir || 'down', pose: 'stand', frame: 0, animT: 0, path: null, action: null, look: S.look, moving: false };
  loadMap(S.map || 'town', null, null, S.dir, false);
  world.player.x = S.x; world.player.y = S.y;
  snapCamera();
  world.fade = 1; world.fadeTo = 0;
}

function snapCamera() {
  const m = world.map, p = world.player;
  const mw = m.w * TS, mh = m.h * TS;
  let cx = Math.round(p.x - W / 2), cy = Math.round(p.y - 12 - H / 2 + 4);
  cx = mw <= W ? -Math.floor((W - mw) / 2) : Math.max(0, Math.min(mw - W, cx));
  cy = mh <= H - 12 ? -Math.floor((H - mh) / 2) - 4 : Math.max(-12, Math.min(mh - H, cy));
  world.cam.x = cx; world.cam.y = cy;
}

function getTarget() {
  const p = world.player;
  const [dx, dy] = DIRV[p.dir];
  const px = p.x + dx * 11, py = p.y - 4 + dy * 11;
  // 镇民优先
  let best = null, bd = 16;
  for (const n of world.npcs) {
    if (n.hidden || n.state === 'leave' || n.state === 'arrive') continue;
    const d = Math.hypot(n.x - px, n.y - 4 - py);
    if (d < bd) { bd = d; best = n; }
  }
  if (best) return { kind: 'npc', npc: best, name: NPCS[best.id].name };
  const m = world.map;
  const tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  // 先看脚下(水洼),再看前方
  const [fx, fy] = tileOf(p);
  const under = m.objAt[fy * m.w + fx];
  if (under && under.t === 'puddle') return { kind: 'obj', obj: under, name: under.name };
  if (tx >= 0 && ty >= 0 && tx < m.w && ty < m.h) {
    const o = m.objAt[ty * m.w + tx];
    if (o) return { kind: 'obj', obj: o, name: o.name };
    if (m.tiles[ty][tx] === 'w') return { kind: 'obj', obj: { act: 'water', name: '湖水', x: tx, y: ty, w: 1, h: 1 }, name: '湖水' };
    if (m.id === 'town') {
      const door = m.doors.find((d) => d.b.x <= tx && tx < d.b.x + d.b.w && d.b.y <= ty && ty < d.b.y + d.b.h);
      if (door) return { kind: 'bld', door, name: door.name };
    }
  }
  return null;
}

function interact() {
  const tg = getTarget();
  if (!tg) return;
  if (tg.kind === 'npc') return talkTo(tg.npc);
  if (tg.kind === 'bld') {
    if (!tg.door.to) say([[null, `${tg.name}。门锁着,里面传来收音机的声音。`]]);
    else toast(`${tg.name}:从正门进去`, 'room');
    return;
  }
  const items = menuFor(tg.obj);
  if (!items.length) return;
  sfx.select();
  menu({ title: tg.name, items });
}

// 行动:走到使用位后开始
function startAction(obj, def) {
  const p = world.player;
  if (!obj) { toast('找不到那件东西', 'lock'); return; }
  let spot = obj.spot;
  if (def.at === 'here' || def.at === 'adjacent') spot = null;
  const begin = () => {
    if (def.cost) {
      if (S.money < def.cost) { sfx.error(); toast('钱不够', 'money'); return; }
      sim.addMoney(-def.cost);
    }
    if (spot) p.dir = spot.dir;
    if (def.face) p.dir = def.face;
    if (def.at === 'here' && obj.x != null) {
      const cx = obj.x * TS + 8, cy = obj.y * TS + 8;
      const dx = cx - p.x, dy = cy - (p.y - 4);
      p.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    }
    p.action = { def, obj, elapsed: 0, home: [p.x, p.y], t: 0 };
    def.start?.call(def);
  };
  if (!spot) return begin();
  const [sx, sy] = tileOf(p);
  if (sx === spot.x && sy === spot.y) {
    p.x = spot.x * TS + 8; p.y = spot.y * TS + 13;
    return begin();
  }
  const path = bfs(sx, sy, spot.x, spot.y, { avoidDoors: true });
  if (!path) { sfx.error(); toast('过不去,被挡住了', 'lock'); return; }
  p.path = path;
  p.onArrive = begin;
}

function stopAction(done) {
  const p = world.player;
  const a = p.action;
  if (!a) return;
  p.action = null;
  if (a.def.at === 'on') { p.x = a.home[0]; p.y = a.home[1]; }
  p.pose = 'stand';
  try { a.def.end?.call(a.def, done); } catch (e) { console.error(e); }
  sim.checkChapter();
}

function roomTarget() {
  const m = world.map;
  if (!m) return 60;
  if (m.def.room !== 'home') {
    if (m.def.outdoor && sim.isNight()) return 50;
    return m.def.room;
  }
  let v = 50;
  for (const id of Object.keys(S.owned)) v += shopItem(id)?.room || 0;
  v -= (S.home.dirty || 0) * 12 + S.home.puddles.length * 15 + (S.home.fire ? 45 : 0) + (S.home.tvBroken ? 6 : 0);
  return Math.max(0, Math.min(100, v));
}

function updatePlayer() {
  const p = world.player;
  p.moving = false;
  const a = p.action;
  if (a) {
    const def = a.def;
    if (input.pressed('B') && !def.noCancel) { sfx.back(); stopAction(false); return 1; }
    const gm = def.speed / 60;
    sim.advance(gm, { rates: def.rates, sleep: def.sleep, sitting: def.sitting, skill: def.skill, roomTarget: roomTarget() });
    if (!p.action) return def.speed; // 事件(如累晕)可能已中断
    try { def.tick?.call(def, gm); } catch (e) { console.error(e); }
    a.elapsed += gm; a.t += 1 / 60;
    p.pose = def.pose;
    const done = (def.dur && a.elapsed >= def.dur) || (def.until && def.until()) || (def.max && a.elapsed >= def.max);
    if (done) stopAction(true);
    return def.speed / BASE_SPEED;
  }
  if (p.path) {
    if (input.pressed('B')) { p.path = null; p.onArrive = null; sfx.back(); }
    else {
      const arrived = followPath(p, 1.5);
      animate(p);
      if (arrived) { p.path = null; const cb = p.onArrive; p.onArrive = null; cb?.(); }
      sim.advance(BASE_SPEED / 60, { roomTarget: roomTarget() });
      return 1;
    }
  }
  const d = input.dir();
  if (d) {
    p.dir = d;
    const sp = input.held('B') ? 1.75 : 1.0;
    const [dx, dy] = DIRV[d];
    if (tryMove(p, dx * sp, dy * sp)) p.moving = true;
    checkTriggers();
  }
  animate(p);
  if (input.pressed('A')) interact();
  sim.advance(BASE_SPEED / 60, { roomTarget: roomTarget() });
  return 1;
}

function animate(a) {
  if (a.moving) {
    a.animT += 1;
    a.frame = Math.floor(a.animT / 9) % 4;
    a.pose = 'walk';
    if (a === world.player && a.frame % 2 === 0 && a.animT % 9 === 0) sfx.step();
  } else if (!a.action) { a.pose = 'stand'; a.animT = 0; }
}

let lockedMsgCd = 0;
function checkTriggers() {
  const p = world.player, m = world.map;
  const [tx, ty] = tileOf(p);
  if (m.tiles[ty]?.[tx] === 'E' && m.def.exitTo) {
    const e = m.def.exitTo;
    transition(() => loadMap(e.map, e.x, e.y, e.dir));
    return;
  }
  const door = m.doors.find((d) => d.x === tx && d.y === ty);
  if (door) {
    if (!door.to) {
      if (lockedMsgCd <= 0) { toast(`${door.name}:门锁着`, 'lock'); lockedMsgCd = 120; }
      p.y += 3;
      return;
    }
    const dest = MAPS[door.to];
    if (dest.hours) {
      const h = sim.hour();
      if (h < dest.hours[0] || h >= dest.hours[1]) {
        if (lockedMsgCd <= 0) { toast(`${dest.name}已打烊(${dest.hours[0]}:00-${dest.hours[1]}:00)`, 'lock'); lockedMsgCd = 120; }
        p.y += 3;
        return;
      }
    }
    transition(() => loadMap(door.to));
  }
}

function transition(fn) {
  if (world.fadeTo === 1) return;
  sfx.door();
  world.fadeTo = 1;
  world.onFaded = () => { fn(); world.fadeTo = 0; };
}

// ---------------------------------------------------------------- 镇民
function scheduleFor(id, h) {
  return NPCS[id].schedule.find(([a, b]) => h >= a && h < b) || null;
}
function randomTileIn(area, fixed) {
  const m = world.map;
  const [x0, y0, x1, y1] = area;
  if (fixed) return [x0, y0];
  for (let i = 0; i < 40; i++) {
    const x = x0 + Math.floor(Math.random() * (x1 - x0 + 1)), y = y0 + Math.floor(Math.random() * (y1 - y0 + 1));
    if (!solidAt(m, x, y) && m.tiles[y][x] !== 'E' && !m.doors.some((d) => d.x === x && d.y === y)) return [x, y];
  }
  return null;
}
function exitPoint(n) {
  const m = world.map;
  if (m.id !== 'town') {
    for (let y = m.h - 1; y >= 0; y--) for (let x = 0; x < m.w; x++) if (m.tiles[y][x] === 'E') return [x, y - 1];
    return [1, 1];
  }
  const cands = [[0, 16], [m.w - 1, 16], [21, 0], [21, m.h - 1], ...m.doors.filter((d) => d.to).map((d) => [d.x, d.y + 1])];
  const [tx, ty] = tileOf(n);
  cands.sort((a, b) => Math.abs(a[0] - tx) + Math.abs(a[1] - ty) - (Math.abs(b[0] - tx) + Math.abs(b[1] - ty)));
  return cands[0];
}
function makeNPC(id, x, y, area, fixed) {
  return { id, x: x * TS + 8, y: y * TS + 13, dir: 'down', pose: 'stand', frame: 0, animT: 0, path: null, state: 'idle', timer: 30 + Math.random() * 120, area, fixed, look: NPCS[id].look, bubble: null };
}
function refreshNPCs(initial) {
  const m = world.map;
  const h = sim.hour();
  for (const id of Object.keys(NPCS)) {
    const sch = scheduleFor(id, h);
    const here = sch && sch[2] === m.id;
    const cur = world.npcs.find((n) => n.id === id);
    if (cur && !here && cur.state !== 'leave') {
      if (cur.state === 'talk') continue;
      cur.state = 'leave';
      const [ex, ey] = exitPoint(cur);
      cur.path = bfs(...tileOf(cur), ex, ey) || [];
    } else if (!cur && here) {
      if (initial) {
        const t = randomTileIn(sch[3], sch[4]);
        if (t) world.npcs.push(makeNPC(id, t[0], t[1], sch[3], sch[4]));
      } else {
        // 从入口走进来
        let sx, sy;
        if (m.id === 'town') { const pts = [[0, 16], [m.w - 1, 16], [21, 0], [21, m.h - 1]]; [sx, sy] = pts[Math.floor(Math.random() * pts.length)]; }
        else [sx, sy] = exitPoint({ x: 0, y: 0 });
        const n = makeNPC(id, sx, sy, sch[3], sch[4]);
        const t = randomTileIn(sch[3], sch[4]);
        n.state = 'arrive';
        n.path = t ? bfs(sx, sy, t[0], t[1]) || [] : [];
        world.npcs.push(n);
      }
    }
  }
  // 引导:开场时老杰叔站在公交站旁
  if (initial && m.id === 'town' && !S.flags.metJed) {
    let j = world.npcs.find((n) => n.id === 'jed');
    if (!j) { j = makeNPC('jed', 16, 13, [14, 11, 18, 13], false); world.npcs.push(j); }
    j.x = 16 * TS + 8; j.y = 13 * TS + 13; j.state = 'idle'; j.timer = 99999; j.dir = 'right'; j.pinned = true;
  }
}

function updateNPCs() {
  for (let i = world.npcs.length - 1; i >= 0; i--) {
    const n = world.npcs[i];
    n.moving = false;
    if (n.bubble) { n.bubble.t -= 1; if (n.bubble.t <= 0) n.bubble = null; }
    if (n.state === 'talk') { animate(n); continue; }
    if (n.state === 'leave' || n.state === 'arrive') {
      const done = followPath(n, 0.7);
      if (n.blocked > 120) { n.blocked = 0; n.path = []; }
      animate(n);
      if (done || !n.path?.length) {
        if (n.state === 'leave') { world.npcs.splice(i, 1); continue; }
        n.state = 'idle'; n.timer = 60;
      }
      continue;
    }
    if (n.fixed || n.pinned) {
      n.pose = 'stand';
      if (n.fixed) n.dir = 'down';
      if (n.pinned) { const p = world.player; const dx = p.x - n.x, dy = p.y - n.y; if (Math.hypot(dx, dy) < 70) n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); }
      continue;
    }
    if (n.path && n.path.length) {
      followPath(n, 0.55);
      if (n.blocked > 90) { n.blocked = 0; n.path = null; n.timer = 30; }
      animate(n);
      continue;
    }
    n.pose = 'stand';
    n.timer -= 1;
    if (n.timer <= 0) {
      n.timer = 120 + Math.random() * 240;
      if (Math.random() < 0.25) {
        // 原地发呆或冒个想法泡泡
        const ics = ['note', 'chat', 'star', 'heart', 'cup'];
        n.bubble = { icon: ics[Math.floor(Math.random() * ics.length)], t: 90 };
        continue;
      }
      const t = randomTileIn(n.area);
      if (t) n.path = bfs(...tileOf(n), t[0], t[1], { avoidDoors: true });
    }
  }
}

function talkTo(n) {
  const p = world.player;
  n.state = 'talk'; n.path = null; n.pose = 'stand';
  n.dir = OPP[p.dir];
  const r = S.rels[n.id];
  const info = NPCS[n.id];
  if (n.id === 'jed' && !S.flags.metJed) {
    S.flags.metJed = true;
    n.pinned = false;
    sim.changeRel('jed', 6);
    say([
      ['jed', '哈哈,你来啦!先说好,我可是这镇上最会讲笑话的人。'],
      ['jed', '规矩很简单:饿了吃、困了睡、脏了洗、闷了玩。需求条按 START 就能看到。'],
      ['jed', '咖啡馆和修车厂都在招人,早上八点后去柜台问问。家具店能买新家具。'],
      ['jed', '跟人聊天、讲笑话、夸奖……关系好了,好事自然就来。去吧,年轻人!'],
    ], () => { world.endTalk(n); sim.checkChapter(); });
    return;
  }
  if (!r.met) {
    r.met = true;
    say([[n.id, `你好!我是${info.name},${info.title}。${info.bio}`]], () => socialMenu(n));
    return;
  }
  socialMenu(n);
}

// 社交动画序列:玩家冒出行为图标 → 对方反应 → 台词
function beginSocial(n, s) {
  const r = S.rels[n.id];
  if (s.cost) { if (S.money < s.cost) { toast('钱不够', 'money'); world.endTalk(n); return; } sim.addMoney(-s.cost); }
  const res = resolveSocial(n.id, s);
  world.seq = { n, s, res, t: 0 };
  world.player.pose = 'act';
  sfx.speak(1.1, 4);
}
function updateSeq() {
  const q = world.seq;
  q.t++;
  const p = world.player;
  p.pose = q.t < 50 ? 'act' : 'stand';
  p.frame = (q.t / 10 | 0) % 2;
  if (q.t === 50) {
    const { n, s, res } = q;
    const info = NPCS[n.id];
    sfx.speak(info.voice, 3);
    n.bubble = { icon: res.ok ? (s.id === 'joke' || s.id === 'prank' ? 'joke' : s.id === 'ask' ? 'chat' : 'heart') : 'angry', t: 70 };
    const d = sim.changeRel(n.id, res.d);
    floatText(n.x, n.y - 30, `${d >= 0 ? '+' : ''}${Math.round(d)}`, d >= 0 ? P.green3 : '#ff7070');
    S.motives.social = Math.min(100, S.motives.social + s.social * (res.ok ? 1 : 0.35));
    if (s.id === 'joke' && res.ok) S.motives.fun = Math.min(100, S.motives.fun + 8);
    if (s.id === 'prank' && res.ok) S.motives.fun = Math.min(100, S.motives.fun + 10);
    S.stats.socials++;
    const r = S.rels[n.id];
    if (s.id === 'flirt' && res.ok && r.v >= 55 && !r.crush) { r.crush = true; toast(`${info.name}对你有好感了!♥`, 'heart'); }
    if (s.id === 'kiss' && res.ok && r.v >= 75 && !r.romance) {
      for (const o of Object.values(S.rels)) o.romance = false;
      r.romance = true;
      sfx.fanfare();
      toast(`你和${info.name}成为了恋人!`, 'heart', 4);
    }
    sim.advance(15, { roomTarget: roomTarget() });
    res.ok ? sfx.good() : sfx.bad();
  }
  if (q.t === 100) {
    const { n, s, res } = q;
    world.seq = null;
    const mood = res.ok ? 'happy' : (s.id === 'prank' || s.id === 'hug' || s.id === 'kiss' ? 'angry' : 'sad');
    say([[n.id, socialLine(n.id, s, res.ok), mood]], () => { world.endTalk(n); sim.checkChapter(); });
  }
}

// ---------------------------------------------------------------- 事件
export function onSimEvent(type, d) {
  if (!world.map) return;
  const p = world.player;
  switch (type) {
    case 'fail': motiveFail(d.id); break;
    case 'money': if (d.n) floatText(p.x, p.y - 34, `${d.n > 0 ? '+' : '-'}§${Math.abs(Math.round(d.n))}`, d.n > 0 ? P.green3 : '#ff8080'); if (d.n > 0) sfx.coin(); break;
    case 'skillUp': sfx.levelup(); toast(`${d.label}技能提升到 ${d.lv} 级!`, ['cooking', 'mechanical', 'charisma', 'body', 'logic', 'creativity'].includes(d.id) ? d.id : 'star', 3.2); sim.checkChapter(); break;
    case 'mail': toast('邮箱里有新信件', 'mail'); break;
    case 'pizza': sfx.bell(); toast('叮咚!披萨送到了,放在餐桌上', 'hunger', 3.2); if (world.map.id === 'home') world.rebuild(); break;
    case 'repo':
      sfx.bad();
      say([[null, d.item ? `收债员上门了!因为账单逾期,他搬走了你的「${d.item}」。` : '收债员上门了!家里没有值钱的家具,他拿走了你所有的现金。']]);
      if (world.map.id === 'home') world.rebuild();
      break;
    case 'toast': toast(d.text, d.icon); break;
    case 'hour':
      refreshNPCs(false);
      updateMusic();
      sim.save();
      sim.checkChapter();
      break;
    case 'day':
      world.banner = { text: `第 ${S.day} 天 · ${sim.dayName()}`, t: 2.6, big: true };
      break;
    case 'chapter': chapterDone(d); break;
  }
}

function chapterDone(d) {
  sfx.fanfare();
  const lines = [['jed', `「${d.done.title}」完成!`]];
  lines.push(...STORY.chapterDone);
  if (d.done.reward) { lines.push([null, `获得奖励 §${d.done.reward}!`]); sim.addMoney(d.done.reward, '章节奖励'); }
  if (d.next) lines.push(['jed', `接下来——${d.next.title}:${d.next.intro}`]);
  sim.addMail(d.done.title + ' 完成', `恭喜!${d.next ? '新的目标:' + d.next.intro : ''}——老杰`);
  say(lines);
}

function motiveFail(id) {
  const p = world.player;
  if (p.action && p.action.def.label === '昏睡') return;
  if (p.action) stopAction(false);
  p.path = null;
  if (id === 'bladder') {
    S.motives.bladder = 100;
    S.motives.hygiene = Math.max(0, S.motives.hygiene - 40);
    S.motives.fun = Math.max(0, S.motives.fun - 12);
    const [tx, ty] = tileOf(p);
    const pud = { id: `pud${tx}_${ty}`, t: 'puddle', x: tx, y: ty, w: 1, h: 1, act: 'puddle', name: '水洼', solid: false, flat: true };
    if (world.map.id === 'home' && !S.home.puddles.some((q) => q.x === tx && q.y === ty)) S.home.puddles.push({ x: tx, y: ty });
    world.map.objects.push(pud); rebuildIndex(world.map);
    for (const n of world.npcs) if (Math.hypot(n.x - p.x, n.y - p.y) < 80) { sim.changeRel(n.id, -3); n.bubble = { icon: 'angry', t: 90 }; }
    sfx.bad();
    toast('憋不住了……尿裤子了!', 'bladder', 3.2);
  } else if (id === 'energy') {
    sfx.thud();
    toast('累得晕倒在地上……', 'zzz', 3.2);
    p.action = { def: { label: '昏睡', speed: 120, pose: 'floor', at: 'here', sleep: true, overlay: 'zzz', dur: 240, noCancel: true, rates: { energy: 13, comfort: -6 } }, obj: null, elapsed: 0, home: [p.x, p.y], t: 0 };
  } else if (id === 'hunger') {
    sfx.thud();
    const fee = Math.min(80, S.money);
    transition(() => {
      S.money -= fee;
      S.motives.hunger = 45; S.motives.energy = Math.max(S.motives.energy, 30);
      sim.advance(120, { roomTarget: 60 });
      loadMap('home', 1, 4, 'up');
      say([[null, `你饿晕了,被好心的镇民送去诊所……医药费 §${fee}。以后记得按时吃饭!`]]);
    });
  }
}

export function floatText(x, y, str, color) {
  world.fx.push({ x, y, str, color, t: 0 });
}

// ---------------------------------------------------------------- 主更新
export function updateWorld(inputEaten = false) {
  world.time += 1 / 60;
  if (lockedMsgCd > 0) lockedMsgCd--;
  // 渐变转场
  if (world.fade !== world.fadeTo) {
    world.fade += Math.sign(world.fadeTo - world.fade) * 0.1;
    if (Math.abs(world.fade - world.fadeTo) < 0.05) {
      world.fade = world.fadeTo;
      if (world.fade === 1 && world.onFaded) { const f = world.onFaded; world.onFaded = null; f(); }
    }
    return;
  }
  if (world.banner) { world.banner.t -= 1 / 60; if (world.banner.t <= 0) world.banner = null; }
  for (let i = world.fx.length - 1; i >= 0; i--) { world.fx[i].t += 1 / 60; if (world.fx[i].t > 1.3) world.fx.splice(i, 1); }
  if (ui.busy() || inputEaten) { world.speedShown = 0; return; }
  if (world.seq) { updateSeq(); updateNPCs(); return; }
  if (input.pressed('START')) { sfx.select(); pauseMenu({ toTitle: () => world.handlers.toTitle?.() }); return; }
  if (input.pressed('SELECT')) { ui.quickMotives = !ui.quickMotives; sfx.cursor(); }
  world.speedShown = updatePlayer();
  updateNPCs();
  const p = world.player;
  S.x = p.x; S.y = p.y; S.dir = p.dir;
  // 相机平滑跟随
  const m = world.map;
  const mw = m.w * TS, mh = m.h * TS;
  let cx = p.x - W / 2, cy = p.y - 12 - H / 2 + 4;
  cx = mw <= W ? -Math.floor((W - mw) / 2) : Math.max(0, Math.min(mw - W, cx));
  cy = mh <= H - 12 ? -Math.floor((H - mh) / 2) - 4 : Math.max(-12, Math.min(mh - H, cy));
  world.cam.x += (cx - world.cam.x) * 0.25; world.cam.y += (cy - world.cam.y) * 0.25;
  if (Math.abs(cx - world.cam.x) < 0.5) world.cam.x = cx;
  if (Math.abs(cy - world.cam.y) < 0.5) world.cam.y = cy;
}

// ---------------------------------------------------------------- 绘制
const [lightC, lightG] = mk(W, H);

function objSprite(o, night) {
  if (o.t === 'building') return building(o.kind, o.w, o.h, o.door, night);
  let v = o.variant || 0;
  if (o.up && S.owned[o.up]) v = 1;
  if (o.t === 'mailbox') v = S.bill || S.mail.some((m) => !m.read) ? 1 : 0;
  if (o.t === 'fountain') v = (world.time * 4 | 0) % 2;
  return furniture(o.t, v);
}
function objPos(o, spr) {
  const x = o.x * TS + Math.round((o.w * TS - spr.w) / 2) - 1;
  const y = (o.y + o.h) * TS - spr.h - 1 + (o.flat ? -4 : 0);
  return [x, y];
}

export function drawWorld() {
  const m = world.map, cam = world.cam;
  const cx = Math.round(cam.x), cy = Math.round(cam.y);
  const night = sim.darkness() > 0.35;
  rect(0, 0, W, H, '#101018');
  const tx0 = Math.max(0, Math.floor(cx / TS)), ty0 = Math.max(0, Math.floor(cy / TS));
  const tx1 = Math.min(m.w - 1, Math.floor((cx + W) / TS)), ty1 = Math.min(m.h - 1, Math.floor((cy + H) / TS));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    let code = m.tiles[ty][tx];
    if (code === 'T') code = '.';
    const img = tile(code, m.theme, tx, ty, code === 'w' ? world.time : (code === 'n' && night ? 1 : 0));
    const sx = tx * TS - cx, sy = ty * TS - cy;
    ctx.drawImage(img, sx, sy);
    if (code === 'w') {
      if (tileAt(m, tx, ty - 1) !== 'w') { rect(sx, sy, 16, 2, '#a8d8ff'); rect(sx, sy + 2, 16, 1, '#5890e0'); }
      if (tileAt(m, tx - 1, ty) !== 'w') rect(sx, sy, 1, 16, '#88c0f8');
      if (tileAt(m, tx + 1, ty) !== 'w') rect(sx + 15, sy, 1, 16, '#88c0f8');
    }
  }
  // 墙面挂件与平铺物
  for (const o of m.objects) {
    if (!o.wall && !o.flat) continue;
    const spr = objSprite(o, night);
    const [x, y] = objPos(o, spr);
    ctx.drawImage(spr.c, x - cx, y - cy);
  }
  // 家中墙上的画
  if (m.id === 'home' && S.stats.paintings > 0) {
    const n = Math.min(3, S.stats.paintings);
    for (let i = 0; i < n; i++) { const pspr = furniture('painting', i); ctx.drawImage(pspr.c, [1.5, 5, 8.5][i] * TS - cx, TS + 2 - cy); }
  }

  // 深度排序
  const list = [];
  for (const o of m.objects) {
    if (o.wall || o.flat) continue;
    const spr = objSprite(o, night);
    const [x, y] = objPos(o, spr);
    if (x - cx > W + 8 || x + spr.w - cx < -8 || y - cy > H + 8 || y + spr.h - cy < -60) continue;
    list.push({ d: (o.y + o.h) * TS, f: () => { ctx.drawImage(spr.c, x - cx, y - cy); drawObjExtras(o, x - cx, y - cy, spr); } });
  }
  for (const n of world.npcs) list.push({ d: n.y, f: () => drawActor(n, cx, cy) });
  const p = world.player;
  const a = p.action;
  let pd = p.y;
  if (a && a.def.at === 'on' && a.obj) {
    const o = a.obj;
    const bottom = (o.y + o.h) * TS;
    pd = bottom + 1;
  }
  list.push({ d: pd, f: () => drawPlayer(cx, cy) });
  list.sort((u, v) => u.d - v.d);
  for (const it of list) it.f();

  // 睡眠时卧室盖被子
  if (a && a.def.pose === 'lie' && a.obj && a.obj.t === 'bed') {
    const o = a.obj;
    const bl = furniture('blanket', S.owned.bed2 ? 1 : 0);
    ctx.drawImage(bl.c, o.x * TS + 1 - cx - 1 + 0, o.y * TS + 16 - cy);
  }

  drawLighting(cx, cy);
  // 绿钻自发光:夜里在光照层之上再画一次
  if (world.pb && m.def.outdoor && sim.darkness() > 0) ctx.drawImage(world.pb.img, world.pb.x, world.pb.y);
  drawFx(cx, cy);
}

function drawObjExtras(o, x, y, spr) {
  const t = world.time;
  if (world.map.id === 'home') {
    if (o.id === 'table') {
      if (S.home.plates) { const pl = furniture('plate', 0); ctx.drawImage(pl.c, x + 5, y + 3); rect(x + 7, y + 3, 4, 2, P.orange); rect(x + 9, y + 2, 2, 1, P.green); }
      if (S.home.pizzaReady) { const pz = furniture('pizza'); ctx.drawImage(pz.c, x + 14, y + 2); }
      for (let i = 0; i < (S.home.dirty || 0); i++) { const pl = furniture('plate', 1); ctx.drawImage(pl.c, x + 20 - i * 3, y + 4 + i); }
    }
    if (o.id === 'stove' && S.home.fire) {
      for (let i = 0; i < 4; i++) {
        const fx = x + 2 + i * 3, h = 6 + Math.round(Math.sin(t * 14 + i * 2) * 3);
        rect(fx, y - h + 2, 3, h, P.orange); rect(fx + 1, y - h + 4, 1, h - 3, P.yellow);
      }
      rect(x + 4, y - 14 - (t * 10 % 6), 6, 3, 'rgba(80,80,80,0.6)');
    }
    if (o.id === 'tv' && S.home.tvBroken) {
      const k = (t * 3) % 1;
      rect(x + 8, y - 4 - k * 10, 4, 3, `rgba(90,90,90,${0.8 - k * 0.6})`);
      if ((t * 8 | 0) % 3 === 0) rect(x + 6, y + 8, 2, 2, P.yellow);
    }
  }
  const pa = world.player.action;
  if (pa && pa.def.overlay === 'tv' && o.id === 'tv') {
    // 电视画面闪烁
    const big = S.owned.tv2;
    const sx = x + (big ? 3 : 4), sy = y + (big ? 3 : 7), sw = big ? 26 : 13, sh = big ? 13 : 10;
    const cols = ['#78c0f8', '#f8a070', '#a0e078', '#f0e070', '#c088f0'];
    const k = (t * 3 | 0);
    rect(sx, sy, sw, sh, cols[k % 5]);
    rect(sx + 2, sy + sh - 4, sw - 4, 2, cols[(k + 2) % 5]);
    rect(sx + (k * 5) % (sw - 4), sy + 2, 4, 4, cols[(k + 3) % 5]);
  }
  if (pa && pa.def.overlay === 'cook' && o.id === 'stove') {
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.8 + i / 3) % 1);
      rect(x + 4 + i * 3, y - k * 12 + 2, 3, 2, `rgba(255,255,255,${0.7 - k * 0.7})`);
    }
    if ((t * 10 | 0) % 2) rect(x + 3, y + 2, 2, 1, P.orange);
  }
  if (o.light && sim.darkness() > 0.3) rect(x + 2, y + 2, 8, 6, '#fff8c0');
}

function drawActor(a, cx, cy, pose = a.pose, dir = a.dir) {
  // 行走四拍:迈左脚 → 站 → 迈右脚 → 站
  let img;
  if (pose === 'walk') {
    const f = (a.frame || 0) % 4;
    img = f % 2 ? simFrame(a.look, dir, 'stand') : simFrame(a.look, dir, 'walk', f === 0 ? 0 : 1);
  } else img = simFrame(a.look, dir, pose, a.frame || 0);
  const x = Math.round(a.x) - 9 - cx, y = Math.round(a.y) - 27 - cy;
  // 影子
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x + 4, y + 25, 10, 2); ctx.fillRect(x + 5, y + 24, 8, 4);
  ctx.drawImage(img, x, y);
  if (a.bubble && a !== world.player) drawBubble(x + 9, y - 2, a.bubble.icon);
}

function drawBubble(cx, by, ic) {
  const b = bubble(15, 15);
  ctx.drawImage(b.c, cx - 8, by - 16);
  ctx.drawImage(icon(ic), cx - 4, by - 14);
}

function drawPlayer(cx, cy) {
  const p = world.player;
  const a = p.action;
  const t = world.time;
  let x = p.x, y = p.y;
  let pose = p.pose, dir = p.dir;
  let frame = p.frame;
  if (a) {
    const def = a.def;
    pose = def.pose;
    frame = (a.t * 3 | 0) % 2;
    if (def.at === 'on' && a.obj) {
      const o = a.obj;
      const ox = o.x * TS + o.w * TS / 2, oy = (o.y + o.h) * TS;
      if (o.t === 'sofaBack') { x = ox - 8; y = oy - 6; dir = 'up'; }
      else if (o.t === 'bed') { x = ox; y = o.y * TS + 26; dir = 'down'; }
      else if (o.t === 'toilet') { x = ox; y = oy - 1; dir = 'down'; }
      else if (o.t === 'shower') { x = ox; y = oy - 3; dir = 'down'; }
      else if (o.t === 'bathtub') { x = ox; y = oy - 2; dir = 'down'; }
      else if (o.t === 'treadmill') { x = ox; y = oy - 3; dir = 'up'; }
      else { x = ox; y = oy - 2; }
    }
  }
  const drawX = Math.round(x) - 9 - cx, drawY = Math.round(y) - 27 - cy;
  if (pose === 'lie') {
    // 只画头部(被子由外部盖上)或泡澡
    const img = simFrame(p.look, 'down', 'sleep', 0);
    if (a?.obj?.t === 'bathtub') {
      ctx.drawImage(img, 0, 0, 18, 15, drawX, drawY + 14, 18, 15);
    } else {
      ctx.drawImage(img, 0, 0, 18, 16, drawX, drawY + 2, 18, 16);
    }
  } else if (pose === 'floor') {
    const img = simFrame(p.look, 'down', 'sleep', 0);
    ctx.save();
    ctx.translate(drawX + 9, drawY + 22);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(img, -14, -9);
    ctx.restore();
  } else {
    const fake = { ...p, x, y, frame: pose === 'walk' ? (Math.floor(t * 7) % 4) : frame };
    drawActor(fake, cx, cy, pose, dir);
  }
  // 背对的沙发:人物坐进去后再把靠背画回前景
  if (a && a.obj && a.obj.t === 'sofaBack' && pose === 'sit') {
    const o = a.obj;
    const spr = objSprite(o, false);
    const [sx, sy] = objPos(o, spr);
    ctx.drawImage(spr.c, 0, 9, spr.w + 2, spr.h - 7, sx - cx, sy + 9 - cy, spr.w + 2, spr.h - 7);
  }
  // 行动特效
  if (a) drawOverlay(a, drawX, drawY, x - cx, y - cy);
  // 头顶绿钻
  const pb = plumbob(sim.moodColor());
  const bob = Math.round(Math.sin(t * 3) * 1.5);
  let headY = drawY - 12;
  if (pose === 'lie') headY = drawY - 8;
  if (pose === 'floor') headY = drawY + 4;
  if (pose === 'sit') headY = drawY - 9;
  ctx.drawImage(pb, drawX + 5, headY + bob);
  world.pb = { img: pb, x: drawX + 5, y: headY + bob };
  // 进度条
  if (a && (a.def.dur || a.def.max)) {
    const total = a.def.dur || a.def.max;
    const k = a.def.until && !a.def.dur ? null : Math.min(1, a.elapsed / total);
    if (k != null) { rect(drawX - 1, headY - 5, 20, 4, P.ink); rect(drawX, headY - 4, Math.round(18 * k), 2, P.green3); }
  }
  // 低需求想法泡泡
  if (!a && !world.seq) {
    const low = MOTIVES.filter((m) => m.id !== 'room').reduce((acc, m) => (S.motives[m.id] < (acc ? S.motives[acc.id] : 999) ? m : acc), null);
    if (low && S.motives[low.id] < 25 && (t % 6) < 2.2) drawBubble(drawX + 20, drawY + 4, low.icon);
  }
  // 社交:自己头上的行为图标
  if (world.seq && world.seq.t < 60) drawBubble(drawX + 9, headY - 1, world.seq.s.icon);
}

function drawOverlay(a, dx, dy, fx, fy) {
  const t = world.time;
  const ov = a.def.overlay;
  if (ov === 'zzz') {
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.6 + i / 3) % 1;
      ptextS('Z', dx + 12 + k * 10 + i, dy - k * 18, P.white);
    }
  } else if (ov === 'shower') {
    for (let i = 0; i < 12; i++) {
      const xx = dx + 2 + (i * 7) % 15, yy = dy - 4 + ((t * 90 + i * 13) % 30);
      rect(xx, yy, 1, 3, '#a0d8ff');
    }
    rect(dx - 1, dy - 6, 20, 32, 'rgba(200,232,248,0.28)');
  } else if (ov === 'bubbles') {
    for (let i = 0; i < 6; i++) {
      const xx = dx - 6 + i * 6, yy = dy + 16 + Math.round(Math.sin(t * 3 + i) * 2);
      rect(xx, yy, 4, 3, P.white); rect(xx + 1, yy - 1, 2, 1, P.white);
    }
  } else if (ov === 'sweat') {
    const k = (t * 1.5) % 1;
    rect(dx + 2 - k * 6, dy + 2 + k * 8, 2, 2, '#a0d8ff');
    rect(dx + 15 + k * 6, dy + 2 + k * 8, 2, 2, '#a0d8ff');
  } else if (ov === 'notes') {
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.7 + i / 2) % 1;
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(icon('note'), dx + 14 + i * 4 + Math.sin(k * 6) * 3, dy - k * 16);
      ctx.globalAlpha = 1;
    }
  } else if (ov === 'book') {
    rect(dx + 4, dy + 14, 10, 6, '#c84040'); rect(dx + 8, dy + 14, 1, 6, P.white);
  } else if (ov === 'phone') {
    drawBubble(dx + 18, dy + 6, 'phone');
  } else if (ov === 'speech') {
    if ((t * 2 | 0) % 2) drawBubble(dx + 18, dy + 6, 'charisma');
  } else if (ov === 'spark') {
    if ((t * 12 | 0) % 3 === 0) { rect(dx + 14, dy + 6, 2, 2, P.yellow); rect(dx + 2, dy + 10, 1, 1, P.white); }
  } else if (ov === 'eat') {
    if ((t * 3 | 0) % 2) rect(dx + 8, dy + 9, 3, 2, P.orange);
  } else if (ov === 'fish') {
    const [vx, vy] = DIRV[world.player.dir];
    const ex = fx + vx * 22, ey = fy - 6 + vy * 22 + (vy === 0 ? 6 : 0);
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(fx + vx * 6 + 0.5, fy - 18 + 0.5); ctx.lineTo(ex + 0.5, ey + 0.5); ctx.stroke();
    rect(fx + vx * 2, fy - 18, vx ? vx * 6 : 1, vy ? 1 : 1, '#704018');
    const bob = Math.sin(t * 5) > 0.7 ? 1 : 0;
    rect(ex - 1, ey - 1 + bob, 3, 3, P.red); rect(ex - 1, ey - 1 + bob, 3, 1, P.white);
  }
}

function drawLighting(cx, cy) {
  const d = sim.darkness();
  const m = world.map;
  if (!m.def.outdoor) {
    if (d > 0) rect(0, 0, W, H, `rgba(40,20,70,${d * 0.22})`);
    return;
  }
  if (d <= 0) return;
  lightG.globalCompositeOperation = 'source-over';
  lightG.clearRect(0, 0, W, H);
  lightG.fillStyle = `rgba(14,18,60,${d})`;
  lightG.fillRect(0, 0, W, H);
  lightG.globalCompositeOperation = 'destination-out';
  const holes = [...m.lights];
  // 亮灯的窗户
  for (const dr of m.doors) holes.push({ x: dr.b.x * TS + dr.b.w * 8, y: (dr.b.y + dr.b.h) * TS - 14, r: 22 });
  const p = world.player;
  holes.push({ x: p.x, y: p.y - 10, r: 18 });
  for (const h of holes) {
    const x = Math.round(h.x - cx), y = Math.round(h.y - cy);
    if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
    // 阶梯式光圈(像素风,不用平滑渐变)
    for (const [k, al] of [[1, 0.35], [0.72, 0.35], [0.45, 0.5]]) {
      lightG.fillStyle = `rgba(0,0,0,${al})`;
      lightG.beginPath(); lightG.arc(x, y, Math.round(h.r * k), 0, Math.PI * 2); lightG.fill();
    }
  }
  lightG.globalCompositeOperation = 'source-over';
  ctx.drawImage(lightC, 0, 0);
  // 暖色灯晕
  ctx.fillStyle = `rgba(255,220,120,${0.08 * d})`;
  for (const h of m.lights) {
    const x = Math.round(h.x - cx), y = Math.round(h.y - cy - 14);
    ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
  }
}

function drawFx(cx, cy) {
  for (const f of world.fx) {
    const k = f.t / 1.3;
    const y = f.y - k * 18 - cy;
    const w = textW(f.str);
    if (k > 0.75 && (f.t * 20 | 0) % 2) continue;
    if (/^[+\-§0-9]+$/.test(f.str)) ptextS(f.str, Math.round(f.x - cx - pwidth(f.str) / 2), Math.round(y), f.color);
    else text(f.str, Math.round(f.x - cx - w / 2), Math.round(y), f.color, { outline: P.ink });
  }
}

export function drawWorldUI() {
  const p = world.player;
  drawHUD({ speed: world.speedShown });
  // 交互提示
  if (!ui.busy() && !p.action && !p.path && !world.seq && world.fade === 0) {
    const tg = getTarget();
    if (tg) {
      const label = tg.name;
      const w = textW(label) + 22;
      panel(W - w - 3, H - 19, w, 17, 'dark');
      rect(W - w + 2, H - 15, 9, 9, P.red); rect(W - w + 3, H - 16, 7, 11, P.red);
      ptext('A', W - w + 5, H - 13, P.white);
      text(label, W - w + 15, H - 17, P.white);
    }
  }
  // 当前行动
  if (p.action && !ui.busy()) {
    const lbl = p.action.def.label + (p.action.def.noCancel ? '' : '中');
    const w = textW(lbl) + 48;
    panel(3, H - 19, w, 17, 'dark');
    text(lbl, 8, H - 17, P.uiSel);
    if (!p.action.def.noCancel) { ptext('B', 8 + textW(lbl) + 6, H - 13, '#f0a0a0'); text('取消', 8 + textW(lbl) + 11, H - 17, '#d0d0e8'); }
  }
  if (world.banner) {
    const b = world.banner;
    const k = Math.min(1, b.t * 3, (2.6 - b.t) * 6);
    if (b.big) {
      const w = textW(b.text, 16) + 30;
      panel(Math.round(W / 2 - w / 2), 60, w, 26, 'blue');
      textC(b.text, W / 2, 63, P.white, { size: 16, outline: P.ink });
    } else if (k > 0.2) {
      const w = textW(b.text) + 20;
      panel(Math.round(W / 2 - w / 2), H - 38, w, 17, 'cream');
      textC(b.text, W / 2, H - 36, P.ink);
    }
  }
  // 深睡快进遮罩
  if (p.action && p.action.def.sleep && p.action.def.speed >= 100 && !ui.busy()) {
    ctx.fillStyle = 'rgba(8,8,30,0.35)';
    ctx.fillRect(0, 12, W, H - 12);
  }
  if (world.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${world.fade})`; ctx.fillRect(0, 0, W, H); }
}

export function introSequence() {
  say(STORY.intro.map((l) => [...l]), () => { S.flags.introDone = true; sim.save(); });
}
