// 游戏主控:关卡装载、固定步长推进、开门/搬运/按钮/消解栅/电梯、__bench 状态快照。
// 渲染层只读本模块的状态,不反向驱动物理。
import { CHAMBERS } from '../levels/index.js';
import { World, APERTURE, clampToFace, apertureClear, aperturesOverlap } from './world.js';
import {
  FIXED_DT, GRAVITY, makeEntity, stepEntity, groundProbe,
  resolvePenetration, pushOutAlong, isOverlapping,
} from './motion.js';
import { Player, PLAYER_HALF } from './player.js';
import { makeFrame, localizePoint, throughPoint, throughDir } from '../core/transform.js';

const CUBE_HALF = [0.25, 0.25, 0.25];
const PROGRESS_KEY = 'opus5PortalProgress';

const doorCollider = (d) => {
  const [x, y, z] = d.center;
  const h = d.axis === 'x' ? [d.w / 2, d.h / 2, 0.18] : [0.18, d.h / 2, d.w / 2];
  return { min: [x - h[0], y - h[1], z - h[2]], max: [x + h[0], y + h[1], z + h[2]], mat: 'metal' };
};

const cubeCollider = (c) => ({
  min: [c.ent.pos[0] - 0.25, c.ent.pos[1] - 0.25, c.ent.pos[2] - 0.25],
  max: [c.ent.pos[0] + 0.25, c.ent.pos[1] + 0.25, c.ent.pos[2] + 0.25],
  mat: 'metal',
  cube: c,
});

export class Game {
  constructor(hooks = {}) {
    this.hooks = hooks; // { onEvent(name, data) } —— 音效 / 横幅 / 过场都由外部接
    this.player = new Player();
    this.index = 0;
    this.mode = 'play'; // play | transition | complete
    this.accumulator = 0;
    this.stats = { time: 0, shots: 0, teleports: 0, deaths: 0 };
    this.unlocked = this.loadProgress();
    // 不在构造里装载:load 会 emit 'chamber',那时外部还拿不到 game 引用
  }

  loadProgress() {
    try {
      const v = Number(globalThis.localStorage?.getItem(PROGRESS_KEY));
      return Number.isFinite(v) ? Math.max(0, Math.min(CHAMBERS.length - 1, Math.floor(v))) : 0;
    } catch { return 0; }
  }

  saveProgress(i) {
    if (i <= this.unlocked) return;
    this.unlocked = i;
    try { globalThis.localStorage?.setItem(PROGRESS_KEY, String(i)); } catch { /* 无痕模式 */ }
  }

  // ── 关卡装载 ────────────────────────────────────────────────
  load(i, silent = false) {
    this.index = i;
    const level = (this.level = CHAMBERS[i]);
    this.world = new World(level);
    this.portals = {
      blue: { color: 'blue', placed: false, fixed: false, frame: null, link: null, spawnT: 1 },
      orange: { color: 'orange', placed: false, fixed: false, frame: null, link: null, spawnT: 1 },
    };
    this.cubes = (level.cubes || []).map((p) => ({
      ent: makeEntity(p, CUBE_HALF),
      spawn: [...p],
      carried: false,
      dissolve: 0,
    }));
    this.doors = (level.doors || []).map((d) => ({
      ...d, target: d.open ? 1 : 0, progress: d.open ? 1 : 0, collider: doorCollider(d),
    }));
    this.buttons = (level.buttons || []).map((b) => ({ ...b, pressed: false }));
    this.carried = null;
    this.mode = 'play';
    this.accumulator = 0;
    this.player.reset(level.spawn);
    this.player.gun = level.gun;
    for (const fp of level.fixedPortals || []) {
      this.placeFrame(fp.color, makeFrame(fp.P, fp.N, fp.U), true);
    }
    this.saveProgress(i);
    this.emit('chamber', { level, index: i, silent });
  }

  restart() {
    // 过场中也允许重置:否则「取消过场 + 拒绝重置」两个守卫互相踩空,mode 会永久卡在 transition
    if (this.mode === 'complete') return;
    this.load(this.index, true);
    this.emit('banner', { text: '本测试室已重置' });
  }

  emit(name, data) { this.hooks.onEvent?.(name, data); }

  // ── 传送门 ──────────────────────────────────────────────────
  placeFrame(color, frame, fixed = false) {
    const p = this.portals[color];
    p.frame = frame;
    p.placed = true;
    p.fixed = fixed;
    p.spawnT = 0;
    this.world.setPortalFrame(color === 'blue' ? 0 : 1, frame);
    this.relink();
  }

  clearPortal(color) {
    const p = this.portals[color];
    p.placed = false;
    p.frame = null;
    p.fixed = false;
    this.world.setPortalFrame(color === 'blue' ? 0 : 1, null);
    this.relink();
  }

  relink() {
    const { blue, orange } = this.portals;
    const both = blue.placed && orange.placed;
    blue.link = both ? orange : null;
    orange.link = both ? blue : null;
    this.activePortals = both ? [blue, orange] : [];
  }

  shoot(color) {
    if (this.mode !== 'play') return;
    if (this.player.gun === 'none') return;
    if (this.player.gun === 'blue' && color !== 'blue') {
      this.emit('deny', { text: '橙色发射器尚未装配' });
      return;
    }
    this.stats.shots++;
    const origin = this.player.eye();
    const dir = this.player.forward();
    const blockers = [
      ...this.doors.filter((d) => d.progress < 0.85).map((d) => d.collider),
      ...this.cubes.filter((c) => !c.carried && !c.dissolve).map(cubeCollider),
      ...(this.level.fizzlers || []).map((f) => ({ min: f.min, max: f.max, mat: 'fizzler' })),
    ];
    const hit = this.world.shootRay(origin, dir, blockers);
    this.emit('shot', { color, from: origin, to: hit ? hit.point : null });
    if (!hit) { this.emit('deny', { text: '' }); return; }
    if (hit.box.mat !== 'white') {
      this.emit('deny', { text: hit.box.mat === 'glass' ? '玻璃无法附着传送门' : '该表面无法附着传送门' });
      return;
    }
    // 门框架:墙面用世界上方;地面/天花板把上向量吸附到视线的主水平轴,保证门口仍是轴对齐矩形
    const N = hit.normal;
    let U = [0, 1, 0];
    if (Math.abs(N[1]) > 0.5) {
      const ax = Math.abs(dir[0]) >= Math.abs(dir[2])
        ? [Math.sign(dir[0]) || 1, 0, 0]
        : [0, 0, Math.sign(dir[2]) || 1];
      // 上向量取「与视线同向」:跑进地面门时,水平速度经变换会在出口转成抬升而非下坠,
      // 飞跃的射程因此对助跑速度单调不减(慢走 13.7m / 全速 18.9m,都落在对岸)。
      U = N[1] > 0 ? ax : [-ax[0], 0, -ax[2]];
    }
    const probe = makeFrame(hit.point, N, U);
    const P = clampToFace(hit.box, probe);
    if (!P) { this.emit('deny', { text: '这块面板放不下一扇门' }); return; }
    const frame = makeFrame(P, N, U);
    const other = this.portals[color === 'blue' ? 'orange' : 'blue'];
    if (other.placed && aperturesOverlap(frame, other.frame)) {
      this.emit('deny', { text: '两扇门不能重叠' });
      return;
    }
    if (!apertureClear(frame, this.world.baseSolids)) {
      this.emit('deny', { text: '门口被挡住了' });
      return;
    }
    this.placeFrame(color, frame);
    this.emit('portal', { color });
    // 换门位置会把旧洞的墙补回来:玩家/方块若正卡在里面,必须捞出来,绝不能冻在墙里
    this.unstick(this.player.ent, () => this.player.reset(this.level.spawn));
    for (const c of this.cubes) {
      if (!c.carried && !c.dissolve) {
        this.unstick(c.ent, () => { c.ent.pos = [...c.spawn]; c.ent.vel = [0, 0, 0]; }, c);
      }
    }
  }

  /**
   * 脱困兜底:实体被新几何埋住时,先温和推、再沿六个方向挤,最后才回退到 fallback。
   * 宁可把玩家送回出生点,也绝不允许「位置永久冻结、按 R 之外无解」。
   */
  unstick(ent, fallback, selfCube = null) {
    const brushes = ent === this.player.ent ? this.brushesForPlayer() : this.brushesForCube(selfCube);
    if (!isOverlapping(ent, brushes)) return true;
    if (resolvePenetration(ent, brushes, 1.4)) return true;
    const dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    if (pushOutAlong(ent, brushes, dirs, 2.5)) return true;
    fallback();
    return false;
  }

  // ── 碰撞列表 ────────────────────────────────────────────────
  // 玩家与方块各用一条独立缓冲,避免同一帧内互相覆盖(两者都在同一个子步里推进)
  fillStatic(list) {
    list.length = 0;
    for (const b of this.world.solids) list.push(b);
    for (const d of this.doors) if (d.progress < 0.85) list.push(d.collider);
    return list;
  }

  brushesForPlayer() {
    const list = this.fillStatic(this.bufPlayer || (this.bufPlayer = []));
    for (const c of this.cubes) if (!c.carried && !c.dissolve) list.push(cubeCollider(c));
    this.world.activePlugs(this.player.ent.pos, list);
    return list;
  }

  brushesForCube(self) {
    const list = this.fillStatic(this.bufCube || (this.bufCube = []));
    for (const c of this.cubes) {
      if (c !== self && !c.carried && !c.dissolve) list.push(cubeCollider(c));
    }
    this.world.activePlugs(self.ent.pos, list);
    return list;
  }

  // ── 交互:拾取 / 放下 ────────────────────────────────────────
  interact() {
    if (this.mode !== 'play') return;
    if (this.carried) {
      const c = this.carried;
      c.carried = false;
      this.carried = null;
      const f = this.player.forward();
      const pv = this.player.ent.vel;
      c.ent.vel = [pv[0] * 0.6 + f[0] * 2, pv[1] * 0.3 + 0.6, pv[2] * 0.6 + f[2] * 2];
      this.emit('drop', {});
      return;
    }
    const eye = this.player.eye();
    const dir = this.player.forward();
    const reach = 2.6;
    const wall = this.world.shootRay(eye, dir, this.doors.filter((d) => d.progress < 0.85).map((d) => d.collider), reach);
    const wallT = wall ? wall.t : reach;
    let best = null;
    for (const c of this.cubes) {
      if (c.dissolve) continue;
      const hit = this.world.shootRay(eye, dir, [cubeCollider(c)], reach);
      if (hit && hit.box.cube === c && hit.t <= wallT + 0.05 && (!best || hit.t < best.t)) {
        best = { t: hit.t, cube: c };
      }
    }
    if (best) {
      best.cube.carried = true;
      this.carried = best.cube;
      this.emit('pickup', {});
    }
  }

  // ── 主循环 ──────────────────────────────────────────────────
  update(dt) {
    dt = Math.min(dt, 0.1);
    if (this.mode === 'play') {
      this.stats.time += dt;
      this.accumulator += dt;
      let guard = 0;
      while (this.accumulator >= FIXED_DT && guard++ < 240) {
        this.substep(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }
      this.updateButtonsAndDoors(dt);
      this.checkExit();
    } else {
      for (const d of this.doors) this.animateDoor(d, dt);
    }
    for (const p of [this.portals.blue, this.portals.orange]) {
      if (p.placed && p.spawnT < 1) p.spawnT = Math.min(1, p.spawnT + dt / 0.16);
    }
    for (const c of this.cubes) {
      if (c.dissolve > 0) {
        c.dissolve += dt / 0.45;
        if (c.dissolve >= 1) {
          c.ent.pos = [...c.spawn];
          c.ent.vel = [0, 0, 0];
          c.dissolve = 0;
        }
      }
    }
    this.player.updateVisual(dt);
  }

  substep(h) {
    const player = this.player;
    const ent = player.ent;
    const prevPos = [...ent.pos];
    const brushes = this.brushesForPlayer();
    ent.onGround = groundProbe(ent, brushes);
    player.prestep(h);
    resolvePenetration(ent, brushes);
    stepEntity(ent, h, {
      brushes,
      portals: this.activePortals,
      grounded: ent.onGround,
      allowStep: true,
      onTeleport: (from, to) => {
        player.onTeleport(from, to);
        this.stats.teleports++;
        this.emit('teleport', {});
        pushOutAlong(ent, this.brushesForPlayer(), [to.frame.N, to.frame.U]);
        if (this.carried) this.snapCarried();
      },
    });
    ent.onGround = groundProbe(ent, this.brushesForPlayer());

    // 消解栅 / 跌落
    for (const f of this.level.fizzlers || []) {
      if (segmentCrosses(prevPos, ent.pos, f)) this.fizzle();
    }
    if (ent.pos[1] < this.level.killY) {
      this.stats.deaths++;
      if (this.carried) { this.carried.carried = false; this.carried = null; }
      player.reset(this.level.spawn);
      this.emit('respawn', {});
    }

    // 方块
    for (const c of this.cubes) {
      if (c.dissolve > 0) continue;
      const before = [...c.ent.pos];
      const cb = this.brushesForCube(c);
      if (c.carried) {
        this.driveCarried(c, h, cb);
      } else {
        c.ent.vel[1] -= GRAVITY * h;
        if (groundProbe(c.ent, cb)) {
          const damp = Math.max(0, 1 - 9 * h);
          c.ent.vel[0] *= damp;
          c.ent.vel[2] *= damp;
        }
        resolvePenetration(c.ent, cb);
        stepEntity(c.ent, h, {
          brushes: cb,
          portals: this.activePortals,
          grounded: false,
          allowStep: false,
          onTeleport: (from, to) => {
            this.emit('teleport', {});
            pushOutAlong(c.ent, cb, [to.frame.N, to.frame.U]);
          },
        });
      }
      for (const f of this.level.fizzlers || []) {
        if (segmentCrosses(before, c.ent.pos, f)) {
          c.dissolve = 1e-4;
          if (this.carried === c) this.carried = null;
          c.carried = false;
          this.emit('dissolve', {});
        }
      }
      if (c.ent.pos[1] < this.level.killY) {
        c.ent.pos = [...c.spawn];
        c.ent.vel = [0, 0, 0];
        c.carried = false;
        if (this.carried === c) this.carried = null;
      }
    }
  }

  snapCarried() {
    const c = this.carried;
    const eye = this.player.eye();
    const f = this.player.forward();
    c.ent.pos = [eye[0] + f[0] * 1.1, eye[1] + f[1] * 1.1 - 0.15, eye[2] + f[2] * 1.1];
    c.ent.vel = [...this.player.ent.vel];
    pushOutAlong(c.ent, this.brushesForCube(c), [[-f[0], -f[1], -f[2]], [0, 1, 0]]);
  }

  driveCarried(c, h, brushes) {
    const eye = this.player.eye();
    const f = this.player.forward();
    let hold = 1.6;
    const wall = this.world.shootRay(eye, f, [], hold + 0.4);
    if (wall && wall.t < hold + 0.35) hold = Math.max(0.7, wall.t - 0.35);
    const target = [eye[0] + f[0] * hold, eye[1] + f[1] * hold - 0.12, eye[2] + f[2] * hold];
    for (let a = 0; a < 3; a++) {
      c.ent.vel[a] = Math.max(-14, Math.min(14, (target[a] - c.ent.pos[a]) * 16));
    }
    stepEntity(c.ent, h, {
      brushes, portals: this.activePortals, grounded: false, allowStep: false,
      onTeleport: () => { this.emit('teleport', {}); },
    });
    const dx = target[0] - c.ent.pos[0];
    const dy = target[1] - c.ent.pos[1];
    const dz = target[2] - c.ent.pos[2];
    if (dx * dx + dy * dy + dz * dz > 2.0 * 2.0) {
      this.carryStrain = (this.carryStrain || 0) + h;
      if (this.carryStrain > 0.35) {
        c.carried = false;
        this.carried = null;
        this.carryStrain = 0;
        for (let a = 0; a < 3; a++) c.ent.vel[a] = Math.max(-2, Math.min(2, c.ent.vel[a]));
        this.emit('drop', {});
      }
    } else this.carryStrain = 0;
  }

  fizzle() {
    let cleared = false;
    for (const color of ['blue', 'orange']) {
      const p = this.portals[color];
      if (p.placed && !p.fixed) { this.clearPortal(color); cleared = true; }
    }
    if (cleared) {
      this.emit('fizzle', {});
      this.emit('banner', { text: '传送门已被消解栅清除' });
    }
    if (this.carried) {
      this.carried.dissolve = 1e-4;
      this.carried.carried = false;
      this.carried = null;
      this.emit('dissolve', {});
    }
  }

  animateDoor(d, dt) {
    const speed = d.target ? 1 / 0.4 : 1 / 0.3;
    if (d.progress !== d.target) {
      d.progress += Math.sign(d.target - d.progress) * speed * dt;
      d.progress = Math.max(0, Math.min(1, d.progress));
    }
  }

  updateButtonsAndDoors(dt) {
    for (const b of this.buttons) {
      let on = false;
      const feet = this.player.ent.pos[1] - PLAYER_HALF[1];
      const dx = this.player.ent.pos[0] - b.pos[0];
      const dz = this.player.ent.pos[2] - b.pos[2];
      if (dx * dx + dz * dz < 0.6 * 0.6 && feet > b.pos[1] - 0.1 && feet < b.pos[1] + 0.5) on = true;
      for (const c of this.cubes) {
        if (c.carried || c.dissolve) continue;
        const cx = c.ent.pos[0] - b.pos[0];
        const cz = c.ent.pos[2] - b.pos[2];
        const bottom = c.ent.pos[1] - 0.25;
        if (cx * cx + cz * cz < 0.65 * 0.65 && bottom > b.pos[1] - 0.1 && bottom < b.pos[1] + 0.5) on = true;
      }
      if (on !== b.pressed) {
        b.pressed = on;
        this.emit(on ? 'buttonOn' : 'buttonOff', {});
      }
    }
    for (const d of this.doors) {
      const linked = this.buttons.filter((b) => b.targets.includes(d.id));
      if (linked.length) {
        const want = linked.some((b) => b.pressed) ? 1 : 0;
        if (want !== d.target) {
          d.target = want;
          this.emit(want ? 'doorOpen' : 'doorClose', {});
        }
      }
      this.animateDoor(d, dt);
    }
  }

  checkExit() {
    const z = this.level.exit;
    if (!z || this.mode !== 'play') return;
    const p = this.player.ent.pos;
    if (p[0] > z.min[0] && p[0] < z.max[0] && p[2] > z.min[2] && p[2] < z.max[2] &&
        p[1] > z.min[1] - 0.3 && p[1] < z.max[1] + 0.6) {
      this.mode = 'transition';
      const next = this.index + 1;
      this.emit('exit', { next: next < CHAMBERS.length ? CHAMBERS[next] : null, index: next });
    }
  }

  finishTransition(next) {
    if (next < CHAMBERS.length) this.load(next);
    else { this.mode = 'complete'; this.emit('complete', { stats: this.stats }); }
  }

  // ── 调试快照 ────────────────────────────────────────────────
  getState() {
    const snap = (p) => (p.placed
      ? { P: [...p.frame.P], N: [...p.frame.N], U: [...p.frame.U], fixed: p.fixed }
      : null);
    return {
      chamber: this.level.id,
      name: this.level.name,
      mode: this.mode,
      gun: this.player.gun,
      pos: [...this.player.ent.pos],
      vel: [...this.player.ent.vel],
      speed: Math.hypot(...this.player.ent.vel),
      onGround: this.player.ent.onGround,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      roll: this.player.roll,
      portals: { blue: snap(this.portals.blue), orange: snap(this.portals.orange) },
      carrying: !!this.carried,
      cubes: this.cubes.map((c) => ({ pos: [...c.ent.pos], carried: c.carried, dissolve: c.dissolve })),
      buttons: this.buttons.map((b) => ({ id: b.id, pressed: b.pressed })),
      doors: this.doors.map((d) => ({ id: d.id, open: d.target === 1, progress: d.progress })),
      stats: { ...this.stats },
    };
  }
}

/** 线段是否穿过消解栅所在的薄盒(取最薄轴做面判定) */
function segmentCrosses(p0, p1, f) {
  const size = [f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]];
  const axis = size[0] <= size[2] ? 0 : 2;
  const mid = (f.min[axis] + f.max[axis]) / 2;
  if ((p0[axis] - mid) * (p1[axis] - mid) > 0) return false;
  const t = Math.abs(p1[axis] - p0[axis]) < 1e-9 ? 0 : (mid - p0[axis]) / (p1[axis] - p0[axis]);
  const other = axis === 0 ? 2 : 0;
  const at = [0, 1, 2].map((a) => p0[a] + (p1[a] - p0[a]) * t);
  return (
    at[other] > f.min[other] - 0.35 && at[other] < f.max[other] + 0.35 &&
    at[1] > f.min[1] - 0.6 && at[1] < f.max[1] + 0.6
  );
}
