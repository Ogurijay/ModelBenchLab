// 游戏主控:关卡装载/物理步进/穿门/方块搬运/按钮门链路/消解栅/电梯流程
import { CHAMBERS } from './levels.js';
import { buildChamber, disposeGroup } from './world.js';
import { Door, Button, CubeObj, Fizzler, Elevator } from './objects.js';
import { PortalSystem } from './portals.js';
import { Player } from './player.js';
import {
  DT, GRAVITY, portalIgnoreSet, moveEntity, raycastBoxes, shouldTeleport, depenetrate, expelFromSolids,
} from './physics.js';
import { transformPoint, transformDir } from './portal-math.js';
import { sfx } from './audio.js';

const PROGRESS_KEY = 'portalChambersProgress';

export class Game {
  constructor(scene, camera, mats, ui) {
    this.scene = scene;
    this.camera = camera;
    this.mats = mats;
    this.ui = ui;
    this.player = new Player(camera);
    scene.add(camera); // 视图模型(发射器)是相机子节点
    this.portals = new PortalSystem(scene);
    this.chamberIndex = 0;
    this.chamberGroup = null;
    this.level = null;
    this.doors = [];
    this.buttons = [];
    this.cubes = [];
    this.fizzlers = [];
    this.elevator = null;
    this.carried = null;
    this.mode = 'play'; // play | transition | complete
    this.accumulator = 0;
    this.stats = { portals: 0, teleports: 0, time: 0, deaths: 0 };
    this.unlocked = Math.min(CHAMBERS.length - 1, Number(localStorage.getItem(PROGRESS_KEY) || 0));
  }

  loadChamber(i, silent = false) {
    this.ui.cancelTransition?.(); // 换关即作废一切排队中的过场回调
    this.chamberIndex = i;
    const level = (this.level = CHAMBERS[i]);
    if (this.chamberGroup) disposeGroup(this.chamberGroup);
    this.chamberGroup = buildChamber(level, this.scene, this.mats);
    this.doors = level.doors.map((d) => new Door(d, this.chamberGroup));
    this.buttons = level.buttons.map((b) => new Button(b, this.chamberGroup));
    this.cubes = level.cubes.map((c) => new CubeObj(c, this.chamberGroup));
    this.fizzlers = level.fizzlers.map((f) => new Fizzler(f, this.chamberGroup));
    this.elevator = level.exitZone ? new Elevator(level.exitZone, this.chamberGroup) : null;
    this.carried = null;
    this.portals.clearAll();
    if (level.fixedPortals.length) this.portals.setFixed(level.fixedPortals, level.boxes);
    this.player.reset(level.playerStart.pos, level.playerStart.yaw);
    this.player.setGunMode(level.gun);
    if (i > this.unlocked) {
      this.unlocked = i;
      localStorage.setItem(PROGRESS_KEY, String(i));
    }
    this.ui.setChamber(level, i, CHAMBERS.length);
    if (!silent && level.banner) this.ui.banner(level.banner);
    this.mode = 'play';
  }

  restart() {
    if (this.mode !== 'play') return; // 过渡/通关中禁止重置(防止与排队换关竞态)
    this.loadChamber(this.chamberIndex, true);
    this.ui.banner('本测试室已重置');
  }

  // ── 碰撞列表 ──
  baseSolids() {
    const list = [...this.level.boxes];
    for (const b of this.buttons) list.push(b.collider);
    for (const d of this.doors) if (d.blocking) list.push(d.collider);
    return list;
  }

  solidsForPlayer() {
    const list = this.baseSolids();
    for (const c of this.cubes) if (!c.carried && !c.dissolving) list.push(c.collider);
    return list;
  }

  solidsForCube(self) {
    const list = this.baseSolids();
    for (const c of this.cubes) {
      if (c !== self && !c.carried && !c.dissolving) list.push(c.collider);
    }
    return list;
  }

  // ── 发射传送门 ──
  shoot(button) {
    if (this.mode !== 'play') return;
    const color = button === 2 ? 'orange' : 'blue';
    if (this.player.gunMode === 'none') return;
    if (!this.player.canShoot(color)) {
      sfx.deny();
      this.ui.denyFlash(color === 'orange' ? '橙色发射器尚未获得' : '');
      return;
    }
    this.player.onShoot(color);
    this.stats.portals += 1;
    const rayList = this.solidsForPlayer();
    const res = this.portals.tryPlace(
      color, this.player.eye(), this.player.forward(),
      rayList, this.fizzlers.map((f) => f.box),
    );
    sfx.shoot(color);
    if (res.ok) {
      sfx.portalOpen();
    } else {
      sfx.deny();
      this.ui.denyFlash(res.reason === 'surface' ? '该表面无法附着传送门' : '');
    }
    this.ui.setPortalState(this.portals.blue.placed, this.portals.orange.placed);
  }

  // ── E 拾取 / 放下 ──
  interact() {
    if (this.mode !== 'play') return;
    if (this.carried) {
      const c = this.carried;
      c.carried = false;
      this.carried = null;
      const f = this.player.forward();
      const pv = this.player.ent.vel;
      c.ent.vel = [pv[0] * 0.5 + f[0] * 1.5, pv[1] * 0.3 + 0.5, pv[2] * 0.5 + f[2] * 1.5];
      sfx.drop();
      return;
    }
    const eye = this.player.eye();
    const fwd = this.player.forward();
    const wallHit = raycastBoxes(eye, fwd, this.baseSolids(), 2.8);
    const wallT = wallHit ? wallHit.t : 2.8;
    let best = null;
    for (const c of this.cubes) {
      if (c.dissolving) continue;
      const hit = raycastBoxes(eye, fwd, [c.collider], 2.8);
      if (hit && hit.t < wallT + 0.1 && (!best || hit.t < best.t)) best = { t: hit.t, cube: c };
    }
    if (best) {
      best.cube.carried = true;
      this.carried = best.cube;
      sfx.pickup();
      this.ui.hintOnce('携带方块时再按 E 放下');
    }
  }

  // ── 固定步进 ──
  update(dt) {
    dt = Math.min(dt, 0.1);
    if (this.mode === 'play') {
      this.stats.time += dt;
      this.accumulator += dt;
      while (this.accumulator >= DT) {
        this.substep(DT);
        this.accumulator -= DT;
      }
      this.updateButtonsAndDoors(dt);
      this.checkExit();
    } else {
      for (const d of this.doors) d.update(dt);
    }
    this.portals.update(dt, this.player.eye());
    for (const f of this.fizzlers) f.update(dt);
    if (this.elevator) this.elevator.update(dt);
    this.updateCubeVisuals(dt);
    this.player.syncCamera(dt);
  }

  substep(h) {
    const pairActive = this.portals.pairActive();
    const portalPairs = pairActive
      ? [[this.portals.blue, this.portals.orange], [this.portals.orange, this.portals.blue]]
      : [];

    // 玩家
    const prevCenter = [...this.player.ent.pos];
    const prevEye = this.player.eye();
    const prevVy = this.player.ent.vel[1];
    const pList = [this.portals.blue, this.portals.orange];
    const pIgnore = portalIgnoreSet(this.player.ent.pos, this.player.ent.vel, pList, pairActive, this.player.ent.hh);
    // 穿透窗口逐步切换可能留下"已嵌入实体墙"的状态:先温和脱嵌再走碰撞
    expelFromSolids(this.player.ent, this.solidsForPlayer(), pIgnore);
    this.player.step(h, this.solidsForPlayer(), pIgnore);
    if (this.player.ent.onGround && prevVy < -6) sfx.land(-prevVy);

    let playerTeleported = false;
    for (const [A, B] of portalPairs) {
      if (!A.placed || !B.placed) break; // 门可能在本步内被消解
      const horizontal = Math.abs(A.frame.N[1]) > 0.5;
      const thr = horizontal ? 0.15 : 0.0;
      if (shouldTeleport(A, prevEye, this.player.eye(), this.player.ent.vel, thr)) {
        this.player.teleport(A, B);
        // 出口若与几何重叠(如门贴着高台),沿出口上向量/法线脱困
        const U = B.frame.U, N = B.frame.N;
        depenetrate(
          this.player.ent,
          [U, N, [-U[0], -U[1], -U[2]]],
          this.solidsForPlayer(),
          portalIgnoreSet(this.player.ent.pos, this.player.ent.vel, pList, true, this.player.ent.hh),
        );
        if (this.carried) {
          // 携带的方块直接吸附回手上(比几何变换更稳:方块可能正卡在门洞里)
          const cc = this.carried;
          const e = this.player.eye();
          const f = this.player.forward();
          cc.ent.pos = [e[0] + f[0] * 0.8, e[1] + f[1] * 0.8 - 0.1, e[2] + f[2] * 0.8];
          cc.ent.vel = [...this.player.ent.vel];
          depenetrate(
            cc.ent,
            [[-f[0], -f[1], -f[2]], B.frame.N, U],
            this.solidsForCube(cc),
            portalIgnoreSet(cc.ent.pos, cc.ent.vel, pList, true, cc.ent.hh),
          );
        }
        this.stats.teleports += 1;
        playerTeleported = true;
        sfx.teleport();
        break;
      }
    }

    // 玩家过消解栅 / 跌落
    if (!playerTeleported) {
      for (const f of this.fizzlers) {
        if (f.crossed(prevCenter, this.player.ent.pos)) {
          if (this.portals.clearPlacedOnly()) {
            sfx.fizzle();
            this.ui.banner('传送门已被消解');
            this.ui.setPortalState(this.portals.blue.placed, this.portals.orange.placed);
          }
          if (this.carried) {
            this.carried.startDissolve();
            this.carried = null;
            sfx.dissolve();
          }
        }
      }
    }
    if (this.player.ent.pos[1] < this.level.killY) {
      this.stats.deaths += 1;
      this.player.reset(this.level.playerStart.pos, this.level.playerStart.yaw);
      this.ui.banner('检测到实验体跌入检修区 — 已重新部署');
      sfx.deny();
    }

    // 方块
    for (const c of this.cubes) {
      if (c.dissolving > 0) continue;
      const prev = [...c.ent.pos];
      if (c.carried) {
        this.stepCarried(c, h);
      } else {
        c.ent.vel[1] -= GRAVITY * h;
        if (c.ent.onGround) {
          const f = Math.max(0, 1 - 8 * h);
          c.ent.vel[0] *= f;
          c.ent.vel[2] *= f;
        }
        const ignore = portalIgnoreSet(c.ent.pos, c.ent.vel, pList, pairActive, c.ent.hh);
        expelFromSolids(c.ent, this.solidsForCube(c), ignore);
        moveEntity(c.ent, h, this.solidsForCube(c), ignore, false);
      }
      let cubeTeleported = false;
      if (!c.carried) {
        for (const [A, B] of portalPairs) {
          if (!A.placed || !B.placed) break; // 门可能在本步内被消解
          if (shouldTeleport(A, prev, c.ent.pos, c.ent.vel, 0.0)) {
            c.ent.pos = transformPoint(A.frame, B.frame, c.ent.pos);
            c.ent.pos[0] += B.frame.N[0] * 0.03;
            c.ent.pos[1] += B.frame.N[1] * 0.03;
            c.ent.pos[2] += B.frame.N[2] * 0.03;
            c.ent.vel = transformDir(A.frame, B.frame, c.ent.vel);
            const U = B.frame.U, N = B.frame.N;
            depenetrate(
              c.ent,
              [N, U, [-U[0], -U[1], -U[2]]],
              this.solidsForCube(c),
              portalIgnoreSet(c.ent.pos, c.ent.vel, pList, true, c.ent.hh),
            );
            cubeTeleported = true;
            sfx.teleport();
            break;
          }
        }
      }
      if (!cubeTeleported) {
        for (const f of this.fizzlers) {
          if (f.crossed(prev, c.ent.pos)) {
            c.startDissolve();
            if (this.carried === c) this.carried = null;
            sfx.dissolve();
          }
        }
      }
      if (c.ent.pos[1] < this.level.killY) c.respawn();
    }
  }

  stepCarried(c, h) {
    const eye = this.player.eye();
    const fwd = this.player.forward();
    let hold = 1.4;
    const hit = raycastBoxes(eye, fwd, this.baseSolids(), hold + 0.4);
    if (hit && hit.t < hold + 0.35) hold = Math.max(0.55, hit.t - 0.35);
    const target = [eye[0] + fwd[0] * hold, eye[1] + fwd[1] * hold - 0.1, eye[2] + fwd[2] * hold];
    for (let a = 0; a < 3; a++) {
      const want = (target[a] - c.ent.pos[a]) * 14;
      c.ent.vel[a] = Math.max(-13, Math.min(13, want));
    }
    const ignore = portalIgnoreSet(
      c.ent.pos, c.ent.vel, [this.portals.blue, this.portals.orange], this.portals.pairActive(), c.ent.hh,
    );
    moveEntity(c.ent, h, this.solidsForCube(c), ignore, false);
    // 距离超限自动放下:给 0.3s 宽限(快速甩视角时方块能追回来,不至于立刻脱手)
    const dx = target[0] - c.ent.pos[0], dy = target[1] - c.ent.pos[1], dz = target[2] - c.ent.pos[2];
    if (dx * dx + dy * dy + dz * dz > 1.6 * 1.6) {
      this.carryStrain = (this.carryStrain || 0) + h;
      if (this.carryStrain > 0.3) {
        c.carried = false;
        this.carried = null;
        this.carryStrain = 0;
        for (let a = 0; a < 3; a++) c.ent.vel[a] = Math.max(-2, Math.min(2, c.ent.vel[a]));
        sfx.drop();
      }
    } else {
      this.carryStrain = 0;
    }
  }

  updateButtonsAndDoors(dt) {
    for (const b of this.buttons) {
      const changed = b.check(this.player, this.cubes);
      if (changed) (b.pressed ? sfx.buttonOn : sfx.buttonOff)();
    }
    for (const d of this.doors) {
      const linked = this.buttons.filter((b) => b.def.doors.includes(d.id));
      if (linked.length) {
        const want = linked.some((b) => b.pressed);
        if (want !== d.targetOpen) {
          d.setOpen(want);
          (want ? sfx.doorOpen : sfx.doorClose)();
        }
      }
      d.update(dt);
    }
  }

  updateCubeVisuals(dt) {
    for (const c of this.cubes) {
      if (c.dissolving > 0) {
        c.dissolving += dt / 0.45;
        if (c.dissolving >= 1) {
          c.respawn();
        } else {
          const s = Math.max(0.01, 1 - c.dissolving);
          c.group.scale.setScalar(s);
          c.emblemMat.emissiveIntensity = 0.4 + c.dissolving * 4;
        }
      }
      c.syncMesh();
    }
  }

  checkExit() {
    if (this.mode !== 'play' || !this.elevator) return;
    if (!this.elevator.contains(this.player.ent.pos)) return;
    this.mode = 'transition';
    sfx.elevator();
    const next = this.chamberIndex + 1;
    if (next >= CHAMBERS.length) {
      this.ui.fadeTransition(null, () => {
        this.mode = 'complete';
        sfx.complete();
        this.ui.showComplete(this.stats);
      });
    } else {
      this.ui.fadeTransition(CHAMBERS[next], () => {
        this.loadChamber(next);
      });
    }
  }

  getState() {
    const p = this.portals;
    const portalInfo = (x) => (x.placed ? { p: [...x.frame.P], n: [...x.frame.N], fixed: x.fixed } : null);
    return {
      chamber: this.level ? this.level.id : 0,
      name: this.level ? this.level.name : '',
      mode: this.mode,
      pos: [...this.player.ent.pos],
      vel: [...this.player.ent.vel],
      onGround: this.player.ent.onGround,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      gun: this.player.gunMode,
      portals: { blue: portalInfo(p.blue), orange: portalInfo(p.orange) },
      carrying: !!this.carried,
      buttons: this.buttons.map((b) => b.pressed),
      doors: this.doors.map((d) => ({ id: d.id, open: d.targetOpen })),
      atExit: this.elevator ? this.elevator.contains(this.player.ent.pos) : false,
      stats: { ...this.stats },
    };
  }
}
