// npc.js — 邻居小樱(定时来访、BFS 寻路进屋、对话涨社交)与猫(游荡、可撸)
import { TILE } from './art.js';

const WALK_SPEED = 66; // 像素/秒

class GridWalker {
  constructor(tx, ty) {
    this.tx = tx; this.ty = ty;
    this.px = tx * TILE; this.py = ty * TILE;
    this.facing = 'down';
    this.path = [];
    this.animT = 0;
    this.moving = false;
  }
  setPath(path) { this.path = path || []; }
  teleport(tx, ty) {
    this.tx = tx; this.ty = ty;
    this.px = tx * TILE; this.py = ty * TILE;
    this.path = [];
  }
  // 沿 path 走;到达终点返回 true
  update(dt) {
    if (!this.path.length) { this.moving = false; return true; }
    const next = this.path[0];
    const gx = next.x * TILE, gy = next.y * TILE;
    const dx = gx - this.px, dy = gy - this.py;
    const dist = Math.abs(dx) + Math.abs(dy);
    const step = WALK_SPEED * dt;
    this.moving = true;
    this.animT += dt;
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left';
    else if (dy !== 0) this.facing = dy > 0 ? 'down' : 'up';
    if (dist <= step) {
      this.px = gx; this.py = gy;
      this.tx = next.x; this.ty = next.y;
      this.path.shift();
      return this.path.length === 0;
    }
    if (Math.abs(dx) > 0.01) this.px += Math.sign(dx) * step;
    else this.py += Math.sign(dy) * step;
    return false;
  }
  frameIdx() {
    if (!this.moving) return 0;
    return 1 + (Math.floor(this.animT * 6) % 2);
  }
}

// ---------- 邻居 ----------
const VISIT_LINES = [
  '今天天气真不错呀,院子里的花都开了~',
  '你家的沙发看起来好舒服,借我窝一会儿!',
  '隔壁的猫今天又在你家院子里打滚啦。',
  '工作还顺利吗?别太拼,身体要紧。',
  '我新学了一道菜,改天做给你尝尝!',
  '晚上的月亮特别圆,记得早点休息哦。',
];

export class Visitor {
  constructor(world) {
    this.world = world;
    this.walker = new GridWalker(13, 17);
    this.active = false;
    this.phase = 'idle'; // arriving | knocking | inside | leaving
    this.wanderT = 0;
    this.chattedThisVisit = false;
    this.knockT = 0;
  }
  get tx() { return this.walker.tx; }
  get ty() { return this.walker.ty; }

  startVisit(solidFn) {
    if (this.active) return false;
    this.walker.teleport(13, 16);
    const p = this.world.bfs({ x: 13, y: 16 }, this.world.outsideDoor, solidFn);
    if (!p) return false;
    this.walker.setPath(p);
    this.active = true;
    this.phase = 'arriving';
    this.chattedThisVisit = false;
    return true;
  }

  leave(solidFn) {
    if (!this.active || this.phase === 'leaving') return;
    const p = this.world.bfs({ x: this.tx, y: this.ty }, { x: 13, y: 16 }, solidFn);
    this.phase = 'leaving';
    this.walker.setPath(p || []);
  }

  // 返回事件:'knock' | 'entered' | 'left' | null
  update(dt, solidFn) {
    if (!this.active) return null;
    const w = this.walker;
    switch (this.phase) {
      case 'arriving': {
        if (w.update(dt)) {
          this.phase = 'knocking';
          this.knockT = 1.2;
          return 'knock';
        }
        return null;
      }
      case 'knocking': {
        this.knockT -= dt;
        if (this.knockT <= 0) {
          const p = this.world.bfs({ x: this.tx, y: this.ty }, { x: 13, y: 9 }, solidFn);
          w.setPath(p || []);
          this.phase = 'inside';
          return 'entered';
        }
        return null;
      }
      case 'inside': {
        const arrived = w.update(dt);
        if (arrived) {
          this.wanderT -= dt;
          if (this.wanderT <= 0) {
            this.wanderT = 2.5 + Math.random() * 4;
            // 客厅内随机逛
            for (let i = 0; i < 8; i++) {
              const tx = 10 + Math.floor(Math.random() * 8);
              const ty = 4 + Math.floor(Math.random() * 7);
              if (!solidFn(tx, ty)) {
                const p = this.world.bfs({ x: this.tx, y: this.ty }, { x: tx, y: ty }, solidFn);
                if (p && p.length <= 12) { w.setPath(p); break; }
              }
            }
          }
        }
        return null;
      }
      case 'leaving': {
        if (w.update(dt)) {
          this.active = false;
          this.phase = 'idle';
          return 'left';
        }
        return null;
      }
    }
    return null;
  }

  // 对话内容:返回 {lines, gift}
  chat(sim) {
    const S = sim.state;
    const first = !this.chattedThisVisit;
    this.chattedThisVisit = true;
    if (first) {
      S.friendship = Math.min(10, S.friendship + 1);
      sim.applyRates({ social: 1 }, 26); // +26 社交
    } else {
      sim.applyRates({ social: 1 }, 10);
    }
    const gift = first && S.visits > 0 && S.visits % 3 === 0;
    if (gift) sim.applyRates({ hunger: 1 }, 18);
    const line = VISIT_LINES[(S.day + (first ? 0 : 1)) % VISIT_LINES.length];
    return { lines: [line], gift };
  }

  draw(ctx, cam, art) {
    if (!this.active) return;
    const w = this.walker;
    const set = art.npc;
    const dir = w.facing === 'left' ? 'left' : w.facing === 'right' ? 'right' : w.facing;
    const frames = set[dir] || set.down;
    const img = frames[w.frameIdx()];
    ctx.drawImage(img, Math.round(w.px) - cam.x, Math.round(w.py) - cam.y);
  }
  sortY() { return this.walker.py + TILE; }
}

// ---------- 猫 ----------
export class Cat {
  constructor(world) {
    this.world = world;
    this.walker = new GridWalker(20, 13);
    this.state = 'wander'; // wander | sit
    this.stateT = 2;
    this.meowT = 8;
  }
  get tx() { return this.walker.tx; }
  get ty() { return this.walker.ty; }

  update(dt, solidFn, playerTile) {
    const w = this.walker;
    this.stateT -= dt;
    this.meowT -= dt;
    if (this.state === 'sit') {
      if (this.stateT <= 0) { this.state = 'wander'; this.stateT = 4 + Math.random() * 6; }
      return null;
    }
    const arrived = w.update(dt);
    if (arrived) {
      if (this.stateT <= 0 && Math.random() < 0.35) {
        this.state = 'sit';
        this.stateT = 2 + Math.random() * 4;
        return null;
      }
      // 随机逛(偶尔粘人:走向玩家附近)
      for (let i = 0; i < 10; i++) {
        let tx, ty;
        if (playerTile && Math.random() < 0.22) {
          tx = playerTile.x + Math.floor(Math.random() * 3) - 1;
          ty = playerTile.y + Math.floor(Math.random() * 3) - 1;
        } else {
          tx = 2 + Math.floor(Math.random() * 24);
          ty = 1 + Math.floor(Math.random() * 14);
        }
        if (this.world.inBounds(tx, ty) && !solidFn(tx, ty)) {
          const p = this.world.bfs({ x: this.tx, y: this.ty }, { x: tx, y: ty }, solidFn);
          if (p && p.length <= 16) { w.setPath(p); break; }
        }
      }
    }
    if (this.meowT <= 0 && playerTile &&
      Math.abs(playerTile.x - this.tx) + Math.abs(playerTile.y - this.ty) <= 3) {
      this.meowT = 10 + Math.random() * 14;
      return 'meow';
    }
    return null;
  }

  pet(sim) {
    sim.applyRates({ fun: 1, social: 1 }, 8);
    this.state = 'sit';
    this.stateT = 3;
  }

  draw(ctx, cam, art) {
    const w = this.walker;
    const side = w.facing === 'left' ? art.cat.left : art.cat.right;
    const img = this.state === 'sit' ? side[2] : side[w.moving ? w.frameIdx() % 2 : 0];
    ctx.drawImage(img, Math.round(w.px) - cam.x, Math.round(w.py) - cam.y);
  }
  sortY() { return this.walker.py + TILE; }
}
