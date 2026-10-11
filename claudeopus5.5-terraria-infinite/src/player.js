// 玩家:移动(可变跳跃、自动上台阶、游泳、攀爬、创造飞行)、挖掘/放置/交互、战斗、生命/饥饿/氧气。
import { Entity } from './entities.js';
import { Inventory } from './inventory.js';
import { input, key, hit } from './input.js';
import { BLOCKS, B, WALLS, W, solidOf, SOIL } from './blocks.js';
import { ITEMS } from './items.js';
import { REACH, HELL_Y } from './const.js';

const JUMP_V = 13.5, JUMP_HOLD = 0.2;
const TIER_PICK = ['', '木镐', '石镐', '铜镐', '铁镐', '钻石镐', '狱岩镐'];

export class Player extends Entity {
  constructor(game, x, y) {
    super(game, x, y, 0.85, 2.6);
    this.type = 'player';
    this.inv = new Inventory();
    this.hp = 20; this.maxHp = 20; this.hunger = 20; this.sat = 5; this.exh = 0; this.air = 10;
    this.facing = 1; this.walk = 0; this.swing = null; this.mining = null; this.placeCd = 0; this.useCd = 0;
    this.eat = null; this.bow = null; this.invuln = 0; this.hurtFlash = 0; this.regenT = 0; this.starveT = 0; this.airT = 0;
    this.coyote = 0; this.jumpHold = 0; this.dropT = 0; this.fireT = 0; this.cactusT = 0;
    this.spawn = { x, y }; this.bedSpawn = null; this.creative = false; this.flying = false;
    this.stepUp = true; this.sleeping = false; this.stats = { mined: 0, placed: 0, kills: 0, deaths: 0, walked: 0 };
    this.look = { skin: '#f0c8a0', hair: '#6a3a1a', shirt: '#3a8ad8', pants: '#3a3a6a', shoes: '#5a3a1a', eye: '#2a5ad8' };
    this.target = null;
    this.side = 'A'; this.stunT = 0; this.slowT = 0; this.charge = null; this.rpg = null;
  }
  get displayName() { return this.rpg ? this.rpg.fullName : '你'; }

  // ———————————— 主更新
  update(dt) {
    const g = this.game;
    if (this.dead) return;
    this.age += dt;
    this.invuln = Math.max(0, this.invuln - dt); this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.placeCd -= dt; this.useCd -= dt; this.dropT -= dt;
    this.stepAnim = Math.max(0, this.stepAnim - dt * 8);
    if (this.sleeping) { this.vx = 0; this.vy = 0; return; }
    const rpg = this.rpg;
    rpg?.update(dt);
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.stunT > 0) { this.stunT -= dt; this.vx *= Math.pow(0.01, dt); this.physics(dt); this.vitals(dt); return; }
    const uiBlock = g.ui.capturesKeys();
    const L = !uiBlock && (key('KeyA') || key('ArrowLeft')), R = !uiBlock && (key('KeyD') || key('ArrowRight'));
    const up = !uiBlock && (key('KeyW') || key('ArrowUp')), down = !uiBlock && (key('KeyS') || key('ArrowDown'));
    const jumpKey = !uiBlock && key('Space'), jumpHit = !uiBlock && hit('Space');
    const sneak = !uiBlock && (key('ShiftLeft') || key('ShiftRight'));
    if (!uiBlock && (input.doubleTap.has('KeyA') || input.doubleTap.has('KeyD'))) this.sprintLatch = true;
    const sprint = !uiBlock && (key('ControlLeft') || this.sprintLatch) && this.hunger > 6 && !sneak;
    const move = (R ? 1 : 0) - (L ? 1 : 0);
    if (!move) this.sprintLatch = false;

    // 创造模式飞行(双击空格切换)
    if (this.creative && input.doubleTap.has('Space')) { this.flying = !this.flying; this.vy = 0; g.msg(this.flying ? '飞行:开' : '飞行:关', '#9cf'); }
    if (!this.creative) this.flying = false;

    // 攀爬
    const cx = Math.floor(this.x), mid = Math.floor(this.y - 1.0), feet = Math.floor(this.y - 0.2);
    const onClimb = BLOCKS[g.world.fg(cx, mid)].climb || BLOCKS[g.world.fg(cx, feet)].climb;
    if (onClimb && (up || down) && !this.flying) this.climbing = true;
    if (!onClimb || jumpHit) this.climbing = false;

    if (this.flying) {
      const sp = sprint ? 22 : 13;
      this.vx += (move * sp - this.vx) * Math.min(1, dt * 10);
      const vyT = ((down || sneak) ? 1 : 0) * sp - ((up || jumpKey) ? 1 : 0) * sp;
      this.vy += (vyT - this.vy) * Math.min(1, dt * 10);
    } else {
      const ice = this.onGround && BLOCKS[g.world.fg(cx, Math.floor(this.y + 0.05))].slippery;
      let maxSp = sneak ? 3 : sprint ? 10.5 : 7;
      if (this.inWater || this.inLava) maxSp *= 0.55;
      if (rpg) maxSp *= rpg.speedMult();
      if (this.slowT > 0) maxSp *= 0.5;
      const acc = this.onGround ? (ice ? 14 : 70) : 34, dec = this.onGround ? (ice ? 3 : 55) : 8;
      if (move) {
        if (Math.sign(this.vx) !== move && this.onGround) this.vx *= Math.pow(0.002, dt);
        this.vx += move * acc * dt;
        if (Math.abs(this.vx) > maxSp) this.vx = Math.sign(this.vx) * Math.max(maxSp, Math.abs(this.vx) - 40 * dt);
        this.facing = move;
      } else {
        const d = dec * dt;
        this.vx = Math.abs(this.vx) <= d ? 0 : this.vx - Math.sign(this.vx) * d;
      }
      // 潜行:不从边缘掉落
      if (sneak && this.onGround && move) {
        const nx = this.x + this.vx * dt + Math.sign(this.vx) * (this.w / 2);
        if (!g.world.solidSafe(Math.floor(nx), Math.floor(this.y + 0.1)) && !g.world.platform(Math.floor(nx), Math.floor(this.y + 0.1))) this.vx = 0;
      }
      if (this.climbing) {
        this.vy = up ? -5.5 : down ? 5.5 : 0;
        this.vx *= 0.8;
      }
      // 跳跃
      this.coyote = this.onGround ? 0.09 : Math.max(0, this.coyote - dt);
      if ((this.inWater || this.inLava) && jumpKey) {
        this.vy = Math.max(this.vy - 48 * dt, this.deepWater ? -6 : -9.5);
        if (this.onGround) this.vy = -8;
      } else if (jumpHit && (this.coyote > 0 || this.climbing)) {
        this.vy = -JUMP_V; this.jumpHold = JUMP_HOLD; this.coyote = 0; this.climbing = false;
        this.exhaust(sprint ? 0.2 : 0.05);
        g.sfx('jump', this.x, this.y);
      }
      if (jumpKey && this.jumpHold > 0 && this.vy < 0) { this.vy -= 40 * dt; this.jumpHold -= dt; } else this.jumpHold = 0;
      // 天裔:踏空而行(空中按住空格滑翔,最多 10 秒)
      if (rpg) rpg.gliding = false;
      if (rpg?.canGlide() && !this.onGround && !this.climbing && !this.inWater && jumpKey && this.vy > 1 && rpg.glide > 0) {
        this.vy = Math.min(this.vy, 1.8); rpg.glide -= dt; rpg.gliding = true;
        if (Math.random() < dt * 20) g.fx.add({ x: this.x - this.facing * 0.5 + (Math.random() - 0.5), y: this.y - 1.6, vx: -this.facing * 2, vy: 0.5, life: 0.5, color: [210, 240, 255], size: 2, grav: 0, kind: 'glow' });
        this.fallStart = this.y;
      }
      // 战士:冲锋
      if (this.charge) {
        const c = this.charge;
        c.t -= dt; this.vx = c.dir * 26; this.facing = c.dir;
        if (Math.random() < 0.6) g.fx.dust(this.x, this.y, g.world.fg(cx, Math.floor(this.y + 0.05)), 1);
        if (!c.hit) for (const e of g.enemiesOf(this)) {
          if (Math.abs(e.x - this.x) < (e.w + this.w) / 2 + 0.3 && Math.abs(e.cy - this.cy) < (e.h + this.h) / 2) {
            c.hit = true; e.stunT = Math.max(e.stunT || 0, c.stun || 1.5);
            rpg?.hit(e, rpg.weaponStats().dmg * rpg.meleeMult() * 0.8, c.dir * 4, -3);
            c.t = 0; break;
          }
        }
        if (c.t <= 0 || this.hitWall) { this.charge = null; this.vx *= 0.3; }
      }
      // 穿过平台
      if (down && this.onGround && g.world.platform(cx, Math.floor(this.y + 0.05))) this.dropT = 0.25;
      this.dropDown = this.dropT > 0;
    }
    const ox = this.x;
    this.physics(dt);
    if (this.onGround && Math.abs(this.vx) > 0.2) {
      this.walk += Math.abs(this.x - ox);
      if (Math.floor(this.walk / 1.6) !== Math.floor((this.walk - Math.abs(this.x - ox)) / 1.6)) g.sfx('step', this.x, this.y, g.world.fg(cx, Math.floor(this.y + 0.05)));
      this.exhaust(Math.abs(this.x - ox) * (sprint ? 0.1 : 0.01));
      this.stats.walked += Math.abs(this.x - ox);
    }
    if (!this.onGround) this.walk = 0;

    this.handleActions(dt, uiBlock);
    this.vitals(dt);
  }

  landed(fallStart) {
    const d = this.y - fallStart;
    const g = this.game;
    if (d > 2) g.sfx('land', this.x, this.y, g.world.fg(Math.floor(this.x), Math.floor(this.y + 0.05)));
    if (d > 6 && !this.inWater && !this.creative && !this.climbing && !this.rpg?.noFallDamage()) {
      const dmg = Math.floor((d - 5.5) * 1.1);
      if (dmg > 0) this.hurt(dmg, 0, 0, null, 'fall');
    }
    if (d > 3) g.fx.dust(this.x, this.y, g.world.fg(Math.floor(this.x), Math.floor(this.y + 0.05)), Math.min(14, d | 0));
  }

  // ———————————— 鼠标动作
  handleActions(dt, uiBlock) {
    const g = this.game, w = g.world;
    const m = g.mouseWorld();
    const tx = Math.floor(m.x), ty = Math.floor(m.y);
    const px = this.x, py = this.y - this.h * 0.55;
    const dist = Math.hypot(tx + 0.5 - px, ty + 0.5 - py);
    const inReach = dist <= REACH + (this.creative ? 4 : 0);
    if (!g.ui.mouseFree()) { this.target = null; this.mining = null; this.bowRelease(false); this.eat = null; return; }
    this.target = inReach ? { x: tx, y: ty } : null;
    if (Math.abs(m.x - this.x) > 0.3 && (input.lmb || input.rmb || this.swing)) this.facing = m.x > this.x ? 1 : -1;
    const held = this.inv.held, it = held ? ITEMS[held.id] : null;
    const tool = it?.tool || null;

    // 挥动动画推进
    if (this.swing) {
      this.swing.t += dt;
      if (this.swing.kind === 'sword' && !this.swing.hit2 && this.swing.t > this.swing.dur * 0.45) { this.swing.hit2 = true; this.swordHit(it); }
      if (this.swing.t >= this.swing.dur) this.swing = null;
    }

    // —— 变形:左键爪击,右键仅可对话
    if (this.rpg?.form) {
      if (input.lmb && !this.swing) { this.startSwing('sword'); this.swordHit(null); }
      if (input.rPressed) { const npc = this.npcAt(m.x, m.y); if (npc) g.ui.openDialog(npc); }
      this.mining = null;
      return;
    }
    // —— 左键
    if (it?.kind === 'bow') {
      if (input.lmb && (this.creative || this.inv.count('arrow') > 0)) { this.bow = this.bow || { t: 0 }; this.bow.t = Math.min(1, this.bow.t + dt / 0.9); }
      else if (this.bow) this.bowRelease(true, m);
    } else if (input.lmb) {
      const mob = this.mobAt(m.x, m.y, inReach);
      if (tool?.type === 'sword' || mob) {
        if (!this.swing) { this.startSwing(tool?.type === 'sword' ? 'sword' : 'tool'); if (mob && tool?.type !== 'sword') this.attack(mob, it); else this.swordHit(it); }
        this.mining = null;
      } else if (inReach) {
        if (!this.swing) this.startSwing('tool');
        this.mineTick(dt, tx, ty, it);
      } else this.mining = null;
    } else this.mining = null;

    // —— 右键
    if (this.eat) {
      if (!input.rmb || !held || held.id !== this.eat.id) this.eat = null;
      else {
        this.eat.t += dt;
        if ((this.eat.t * 6 | 0) !== ((this.eat.t - dt) * 6 | 0)) { g.sfx('eat', this.x, this.y); g.fx.crumbs(this.x + this.facing * 0.4, this.y - this.h + 0.7, held.id); }
        if (this.eat.t >= this.eat.dur) { this.finishEat(it); this.eat = null; }
      }
    }
    if (input.rPressed) {
      const npc = this.npcAt(m.x, m.y);
      if (npc) { g.ui.openDialog(npc); input.rPressed = false; this.useCd = 0.3; return; }
    }
    if (input.rPressed || (input.rmb && this.useCd <= 0 && !this.eat)) {
      const first = input.rPressed;
      if (this.useRight(tx, ty, inReach, it, held, m, first)) { this.useCd = first ? 0.25 : 0.12; }
    }
  }

  startSwing(kind) {
    const it = this.inv.heldItem();
    const dur = kind === 'sword' ? 0.3 : it?.tool ? 0.26 : 0.24;
    this.swing = { t: 0, dur, kind, hit2: false };
  }

  npcAt(x, y) {
    for (const m of this.game.mobs()) {
      if (m.dead || !m.npc || !m.friendly) continue;
      if (Math.hypot(m.x - this.x, m.cy - this.cy) > 7) continue;
      if (x > m.x - m.w / 2 - 0.3 && x < m.x + m.w / 2 + 0.3 && y > m.y - m.h - 0.3 && y < m.y + 0.2) return m;
    }
    return null;
  }
  mobAt(x, y, inReach) {
    if (!inReach) return null;
    for (const m of this.game.enemiesOf(this)) {
      if (m.dead) continue;
      if (x > m.x - m.w / 2 - 0.15 && x < m.x + m.w / 2 + 0.15 && y > m.y - m.h - 0.15 && y < m.y + 0.15) return m;
    }
    return null;
  }

  // 剑:挥砍扇区
  swordHit(it) {
    const g = this.game, m = g.mouseWorld();
    const ang = Math.atan2(m.y - (this.y - 1.4), m.x - this.x);
    const reach = (it?.tool?.type === 'sword' || this.rpg?.form ? 2.9 : 1.9) + (it?.reach ? it.reach - 2.9 : 0);
    for (const mob of g.enemiesOf(this)) {
      if (mob.dead || mob.lastHitBy === this.swing) continue;
      const dx = mob.x - this.x, dy = mob.cy - (this.y - 1.4);
      const d = Math.hypot(dx, dy) - Math.max(mob.w, mob.h) * 0.4;
      if (d > reach) continue;
      let da = Math.abs(Math.atan2(dy, dx) - ang); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da < 1.25 || d < 0.6) { mob.lastHitBy = this.swing; this.attack(mob, it); }
    }
  }
  attack(mob, it) {
    const g = this.game;
    const rpg = this.rpg;
    const kb = (it?.tool?.type === 'sword' ? 8 : 5) * Math.sign(mob.x - this.x || this.facing);
    if (rpg) {
      const base = it?.tool?.type === 'sword' || it?.weapon ? it.dmg : Math.max(it?.dmg || 1, rpg.weaponStats().dmg * 0.85);
      rpg.hit(mob, base * rpg.meleeMult(), kb, -5);
      rpg.addRage(8);
    } else {
      let dmg = it?.dmg || 1;
      const crit = Math.random() < 0.06;
      if (crit) dmg = Math.round(dmg * 1.8);
      mob.hurt(dmg, kb, -5, this, crit);
    }
    if (it?.tool?.fire) mob.fireT = Math.max(mob.fireT || 0, 4);
    if (it?.tool) { if (this.inv.wearHeld(it.tool.type === 'sword' ? 1 : 2)) { g.sfx('toolBreak', this.x, this.y); g.msg(it.name + ' 损坏了', '#f88'); } }
    this.exhaust(0.1);
  }

  bowRelease(fire, m) {
    if (!this.bow) return;
    const charge = this.bow.t;
    this.bow = null;
    if (!fire || charge < 0.15) return;
    const g = this.game;
    if (!this.creative && this.inv.remove('arrow', 1) < 1) return;
    const sx = this.x, sy = this.y - 1.6;
    const ang = Math.atan2(m.y - sy, m.x - sx);
    const sp = 14 + 24 * charge;
    const bonus = this.rpg ? this.rpg.lvlMult() * (this.rpg.cls === 'hunter' || this.rpg.cls2 === 'hunter' ? 1.3 : 1) : 1;
    g.spawnArrow(sx + Math.cos(ang) * 0.6, sy + Math.sin(ang) * 0.6, Math.cos(ang) * sp, Math.sin(ang) * sp, this, Math.round(((it => it?.dmg || 6)(this.inv.heldItem()) * 0.5 + 6 * charge) * bonus));
    g.sfx('bow', this.x, this.y);
    this.startSwing('bow');
    if (this.inv.wearHeld(1)) g.sfx('toolBreak', this.x, this.y);
  }

  // ———————————— 挖掘
  breakTime(b, tool, isWall, wallDef) {
    if (this.creative) return 0.08;
    if (isWall) {
      if (tool?.type !== 'hammer') return Infinity;
      return Math.max(0.12, wallDef.hard * 1.4 / tool.speed);
    }
    if (b.hard < 0) return Infinity;
    if (b.hard === 0) return 0.05;
    let t = b.hard * 1.5;
    const right = tool && tool.type === b.tool;
    if (b.render === 'leaves') t = tool?.type === 'axe' || tool?.type === 'sword' || tool?.type === 'shears' ? 0.1 : 0.3;
    else if (b.key === 'wool' && tool?.type === 'shears') t = 0.25;
    else if (right && tool.tier >= b.tier) t /= tool.speed;
    else if (b.tier > 0) t *= 3.33;
    return t * 0.72 * (this.rpg?.race === 'dwarf' ? 0.8 : 1);
  }
  mineTick(dt, tx, ty, it) {
    const g = this.game, w = g.world;
    const tool = it?.tool;
    let id = w.fg(tx, ty), isWall = false;
    if (!id || BLOCKS[id].render === 'none') {
      if (tool?.type === 'hammer' && w.wall(tx, ty)) isWall = true;
      else { this.mining = null; return; }
    }
    if (!isWall && w.fluid(tx, ty) && !id) { this.mining = null; return; }
    const b = BLOCKS[id];
    // 泰拉瑞亚式:镐的等级不够时挖不动(而不是挖碎却不掉落),并提示需要的工具
    if (!isWall && !this.creative && b.tier > 0 && !(tool && tool.type === b.tool && tool.tier >= b.tier)) {
      this.mining = null;
      if (this.age - (this.tierMsgT ?? -9) > 1.5) {
        this.tierMsgT = this.age;
        g.msg(`需要${TIER_PICK[b.tier] || '更好的镐'}或更好的镐才能挖掘${b.name}`, '#fc8');
        g.sfx('arrowHit', tx + 0.5, ty + 0.5);
        g.fx.chips(tx, ty, id, 0);
      }
      return;
    }
    if (!isWall && b.interact === 'banner') {
      const te = w.getTe(tx, ty);
      if (te?.type === 'camp' && te.faction === g.faction() && !te.player) { this.mining = null; if (this.age - (this.tierMsgT ?? -9) > 1.5) { this.tierMsgT = this.age; g.msg('不能拆除本阵营营地的旗帜。', '#fc8'); } return; }
    }
    const total = this.breakTime(b, tool, isWall, WALLS[w.wall(tx, ty)]);
    if (!isFinite(total)) { this.mining = null; return; }
    if (!this.mining || this.mining.x !== tx || this.mining.y !== ty || this.mining.wall !== isWall || this.mining.id !== id) this.mining = { x: tx, y: ty, wall: isWall, id, p: 0, total, snd: 0 };
    const mn = this.mining;
    mn.p += dt; mn.total = total;
    mn.snd -= dt;
    if (mn.snd <= 0) { mn.snd = 0.24; g.sfx('dig', tx + 0.5, ty + 0.5, isWall ? B.stone : id); g.fx.chips(tx, ty, isWall ? null : id, w.wall(tx, ty)); }
    if (mn.p >= total) {
      this.mining = null;
      if (isWall) {
        const wd = WALLS[w.wall(tx, ty)];
        w.setWall(tx, ty, 0);
        if (wd.item) g.dropItem(tx + 0.5, ty + 0.5, wd.item, 1);
        g.sfx('break', tx + 0.5, ty + 0.5, B.stone);
      } else {
        // 能挖动就一定按掉落表掉落(创造模式同样掉落)
        w.breakBlock(tx, ty, { drop: true, tool: tool || null, player: true });
        if (!this.creative && tool && tool.type !== 'shears') {
          if (this.inv.wearHeld(1)) { g.sfx('toolBreak', this.x, this.y); g.msg(it.name + ' 损坏了', '#f88'); }
        }
        this.stats.mined++;
      }
      this.exhaust(0.005);
    }
  }

  // ———————————— 右键:交互 / 使用物品 / 放置
  useRight(tx, ty, inReach, it, held, m, first) {
    const g = this.game, w = g.world;
    const id = inReach ? w.fg(tx, ty) : 0, b = BLOCKS[id];
    const sneak = key('ShiftLeft') || key('ShiftRight');
    // 1) 方块交互
    if (inReach && b.interact && first && !(sneak && it?.kind === 'block')) {
      if (this.interact(tx, ty, id, b, it)) return true;
    }
    // 2) 剪羊毛
    if (it?.use === 'shear' && first) {
      const mob = this.mobAt(m.x, m.y, true);
      if (mob && mob.kind === 'sheep' && !mob.sheared) { mob.sheared = true; mob.regrow = 120; g.dropItem(mob.x, mob.y - 0.8, 'wool', 1 + (Math.random() * 3 | 0)); g.sfx('shear', mob.x, mob.y); this.inv.wearHeld(1); this.startSwing('tool'); return true; }
    }
    if (!it) return false;
    // 3) 食物(放在可种植位置时优先种植)
    if (it.food && !(it.place && inReach && this.canPlaceAt(tx, ty, it))) {
      if (first && (this.hunger < 20 || it.food.regen || this.creative)) { this.eat = { id: it.key, t: 0, dur: it.key === 'berries' || it.key === 'mushroom' ? 0.9 : 1.5 }; }
      return !!this.eat;
    }
    if (!inReach) return false;
    // 4) 工具类使用
    if (it.tool?.type === 'hoe') {
      const up = w.fg(tx, ty - 1);
      if ((id === B.grass || id === B.dirt || id === B.snow_grass) && (!up || BLOCKS[up].replace)) { if (up) w.breakBlock(tx, ty - 1, { drop: true }); w.set(tx, ty, B.farmland, 0); g.sfx('dig', tx + 0.5, ty + 0.5, B.dirt); this.startSwing('tool'); if (!this.creative) this.inv.wearHeld(1); return true; }
      return false;
    }
    if (it.use === 'bucket') {
      const f = w.fluid(tx, ty);
      if (f && (f & 15) >= 4) {
        w.setFluid(tx, ty, 0); w.notify(tx, ty);
        const full = (f >> 4) === 1 ? 'water_bucket' : 'lava_bucket';
        if (!this.creative) { this.inv.consumeHeld(1); if (this.inv.add(full, 1)) g.dropItem(this.x, this.y - 1, full, 1); }
        g.sfx('bucket', tx + 0.5, ty + 0.5); return true;
      }
      return false;
    }
    if (it.use === 'pour') {
      if (!solidOf(id, w.meta(tx, ty)) && (!id || BLOCKS[id].replace) && !w.fluid(tx, ty)) {
        if (id) w.breakBlock(tx, ty, { drop: true });
        w.setFluid(tx, ty, (it.fluid << 4) | 8); w.addFluid(tx, ty); w.notify(tx, ty);
        if (!this.creative) { this.inv.slots[this.inv.sel] = { id: 'bucket', n: 1 }; this.inv.changed(); }
        g.sfx('splash', tx + 0.5, ty + 0.5); return true;
      }
      return false;
    }
    if (it.use === 'bonemeal') return this.boneMeal(tx, ty, id);
    if (it.use === 'ignite') {
      if (id === B.tnt) { w.set(tx, ty, B.air); g.primeTnt(tx, ty); this.inv.wearHeld(1); g.sfx('ignite', tx, ty); return true; }
      return false;
    }
    // 5) 放置背景墙
    if (it.kind === 'wall') {
      if (!this.placeCdOk()) return false;
      if (w.wall(tx, ty)) return false;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.wall(tx + dx, ty + dy) || w.fg(tx + dx, ty + dy)) || w.fg(tx, ty);
      if (!nb) return false;
      w.setWall(tx, ty, W[it.placeWall]);
      if (!this.creative) this.inv.consumeHeld(1);
      g.sfx('place', tx + 0.5, ty + 0.5, B.stone); this.startSwing('place');
      return true;
    }
    // 6) 放置方块
    if (it.place) return this.placeBlock(tx, ty, it);
    return false;
  }
  placeCdOk() { return true; }

  canPlaceAt(tx, ty, it) {
    const w = this.game.world, id = B[it.place], b = BLOCKS[id];
    const cur = w.fg(tx, ty);
    if (cur && !BLOCKS[cur].replace) return false;
    if (cur === id) return false;
    if (w.fluid(tx, ty) && !b.solid) return false;
    if (it.needs === 'farmland' && w.fg(tx, ty + 1) !== B.farmland) return false;
    if (it.needs === 'soil' && !SOIL.has(w.fg(tx, ty + 1))) return false;
    if (b.support && !w.supported(tx, ty, id)) return false;
    // 需要相邻方块或背景墙(泰拉瑞亚式)
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const f = w.fg(tx + dx, ty + dy); return (f && !BLOCKS[f].replace) || w.fluid(tx + dx, ty + dy); }) || w.wall(tx, ty);
    if (!nb) return false;
    if (solidOf(id, 0) && this.boxOverlapsEntities(tx, ty)) return false;
    return true;
  }
  boxOverlapsEntities(tx, ty) {
    for (const e of [this, ...this.game.mobs()]) {
      if (e.dead) continue;
      if (tx + 1 > e.x - e.w / 2 && tx < e.x + e.w / 2 && ty + 1 > e.y - e.h && ty < e.y) return true;
    }
    return false;
  }

  placeBlock(tx, ty, it) {
    const g = this.game, w = g.world;
    if (!this.canPlaceAt(tx, ty, it)) return false;
    const id = B[it.place];
    let meta = it.placeMeta || 0;
    if (id === B.door) {
      // 门 3 格高(角色约 2.6 格高,需要 3 格门洞)
      const free = y => { const f = w.fg(tx, y); return (!f || BLOCKS[f].replace) && !w.fluid(tx, y); };
      if (!free(ty - 1) || !free(ty - 2) || !w.solid(tx, ty + 1) || this.boxOverlapsEntities(tx, ty - 1) || this.boxOverlapsEntities(tx, ty - 2)) { g.ui.hint('门需要 3 格高的空间,且下方是实心方块', 2); return false; }
      for (const yy of [ty - 1, ty - 2]) if (w.fg(tx, yy)) w.breakBlock(tx, yy, { drop: true });
      const f = this.facing < 0 ? 4 : 0;
      w.set(tx, ty, B.door, f, 1); w.set(tx, ty - 1, B.door, f | 8, 1); w.set(tx, ty - 2, B.door, f | 1);
    } else if (id === B.bed) {
      const d = this.facing > 0 ? 1 : -1, fx = tx + d;
      if ((w.fg(fx, ty) && !BLOCKS[w.fg(fx, ty)].replace) || !(w.solid(fx, ty + 1) || w.platform(fx, ty + 1))) return false;
      const left = d > 0 ? 2 : 0;
      w.set(tx, ty, B.bed, left, 1); w.set(fx, ty, B.bed, left | 1);
    } else if (id === B.flower) {
      w.set(tx, ty, id, (Math.random() * 3) | 0);
    } else if (id === B.mushroom) {
      w.set(tx, ty, id, Math.random() < 0.5 ? 1 : 0);
    } else if (id === B.berry_bush) {
      w.set(tx, ty, id, 0);
    } else {
      if (w.fg(tx, ty)) w.breakBlock(tx, ty, { drop: false });
      w.set(tx, ty, id, meta);
      if (id === B.furnace) w.setTe(tx, ty, { type: 'furnace', in: null, fuel: null, out: null, burn: 0, burnMax: 0, cook: 0 });
      if (id === B.chest) w.setTe(tx, ty, { type: 'chest', items: new Array(27).fill(null) });
    }
    if (!this.creative) this.inv.consumeHeld(1);
    g.sfx('place', tx + 0.5, ty + 0.5, id);
    this.startSwing('place');
    this.stats.placed++;
    g.onPlace?.(tx, ty, id);
    return true;
  }

  interact(tx, ty, id, b, it) {
    const g = this.game, w = g.world;
    switch (b.interact) {
      case 'table': g.ui.open('inventory', { station: 'table' }); return true;
      case 'chest': {
        let te = w.getTe(tx, ty);
        if (!te) { te = { type: 'chest', items: new Array(27).fill(null) }; w.setTe(tx, ty, te); }
        g.ui.open('chest', { x: tx, y: ty, te }); g.sfx('chest', tx + 0.5, ty + 0.5); return true;
      }
      case 'furnace': {
        let te = w.getTe(tx, ty);
        if (!te) { te = { type: 'furnace', in: null, fuel: null, out: null, burn: 0, burnMax: 0, cook: 0 }; w.setTe(tx, ty, te); }
        g.ui.open('furnace', { x: tx, y: ty, te }); return true;
      }
      case 'door': {
        const open = !(w.meta(tx, ty) & 2);
        for (const yy of w.doorColumn(tx, ty)) { w.setMeta(tx, yy, w.meta(tx, yy) ^ 2); w.markR(tx >> 5, yy >> 5); }
        g.sfx(open ? 'doorOpen' : 'doorClose', tx + 0.5, ty + 0.5);
        return true;
      }
      case 'bed': return g.trySleep(tx, ty);
      case 'banner': g.onBannerInteract?.(tx, ty); return true;
      case 'berry': {
        const m = w.meta(tx, ty);
        if (m >= 2) { g.dropItem(tx + 0.5, ty + 0.3, 'berries', m === 3 ? 2 + (Math.random() * 2 | 0) : 1); w.setMeta(tx, ty, 1); g.sfx('pick', tx, ty); return true; }
        return false;
      }
      case 'tnt':
        if (it?.use === 'ignite') { w.set(tx, ty, B.air); g.primeTnt(tx, ty); this.inv.wearHeld(1); g.sfx('ignite', tx, ty); return true; }
        return false;
      case 'grave': {
        const te = w.getTe(tx, ty);
        if (te?.items) { for (const s of te.items) if (s) { const left = this.inv.add(s.id, s.n, s.dur); if (left) g.dropItem(tx + 0.5, ty + 0.5, s.id, left); } }
        w.setTe(tx, ty, null); w.set(tx, ty, B.air);
        g.msg('你取回了遗物。', '#cfc'); g.sfx('pick', tx, ty);
        return true;
      }
    }
    return false;
  }

  boneMeal(tx, ty, id) {
    const g = this.game, w = g.world;
    let ok = false;
    if (id === B.sapling) { ok = true; if (Math.random() < 0.45) w.growTree(tx, ty, w.meta(tx, ty)); }
    else if (id === B.wheat && w.meta(tx, ty) < 7) { ok = true; w.setMeta(tx, ty, Math.min(7, w.meta(tx, ty) + 2 + (Math.random() * 3 | 0))); }
    else if (id === B.berry_bush && w.meta(tx, ty) < 3) { ok = true; w.setMeta(tx, ty, w.meta(tx, ty) + 1); }
    else if (id === B.grass || id === B.jungle_grass) {
      ok = true;
      for (let k = 0; k < 14; k++) {
        const x = tx + Math.round((Math.random() - 0.5) * 7), y = ty + Math.round((Math.random() - 0.5) * 3);
        if ((w.fg(x, y) === B.grass || w.fg(x, y) === B.jungle_grass) && !w.fg(x, y - 1) && !w.fluid(x, y - 1)) w.set(x, y - 1, Math.random() < 0.8 ? B.tall_grass : B.flower, (Math.random() * 3) | 0);
      }
    }
    if (ok) { if (!this.creative) this.inv.consumeHeld(1); g.fx.sparkle(tx + 0.5, ty + 0.5, [120, 255, 120]); g.sfx('bonemeal', tx, ty); this.startSwing('place'); }
    return ok;
  }

  finishEat(it) {
    const g = this.game, f = it.food;
    this.hunger = Math.min(20, this.hunger + f.hunger);
    this.sat = Math.min(this.hunger, this.sat + f.sat);
    if (f.regen) { this.regenBoost = 8; this.hp = Math.min(this.maxHp, this.hp + 4); }
    if (f.sick && this.rpg?.race !== 'undead' && Math.random() < 0.8) { this.sick = 20; g.msg('你感到一阵恶心……', '#ad6'); }
    if (!this.creative) this.inv.consumeHeld(1);
    g.sfx('burp', this.x, this.y);
  }

  // ———————————— 生命体征
  exhaust(v) { if (!this.creative && this.game.difficulty > 0) this.exh += v; }
  vitals(dt) {
    const g = this.game, w = g.world;
    if (this.creative) { this.hp = this.maxHp; this.hunger = 20; this.air = 10; return; }
    while (this.exh >= 4) { this.exh -= 4; if (this.sat > 0) this.sat = Math.max(0, this.sat - 1); else this.hunger = Math.max(0, this.hunger - 1); }
    if (this.sick > 0) { this.sick -= dt; this.exh += dt * 0.5; }
    // 回血 / 饥饿
    this.regenT += dt;
    const peaceful = g.difficulty === 0;
    const rate = this.regenBoost > 0 ? 0.6 : peaceful ? 1 : (this.hunger >= 20 && this.sat > 0) ? 1.2 : 4;
    if (this.regenBoost > 0) this.regenBoost -= dt;
    if (this.regenT >= rate) {
      this.regenT = 0;
      if (this.hp < this.maxHp && (this.hunger >= 18 || peaceful || this.regenBoost > 0)) {
        const amt = Math.max(1, Math.round(this.maxHp / 20 * (this.rpg?.race === 'troll' ? 2 : 1) * (this.rpg?.combatT > 0 ? 0.5 : 1)));
        this.hp = Math.min(this.maxHp, this.hp + amt); this.exhaust(3);
      }
      if (this.hunger <= 0 && !peaceful) {
        const floor = g.difficulty === 1 ? 10 : g.difficulty === 2 ? 1 : 0;
        if (this.hp > floor) this.hurt(1, 0, 0, null, 'starve');
      }
    }
    // 氧气
    if (this.headInWater) {
      this.airT += dt;
      if (this.airT > (this.rpg?.race === 'undead' ? 5.6 : 1.4)) { this.airT = 0; this.air--; if (this.air < 0) { this.air = 0; this.hurt(2, 0, 0, null, 'drown'); } }
      if (Math.random() < dt * 3) g.fx.bubble(this.x + this.facing * 0.3, this.y - this.h + 0.4);
    } else { this.airT = 0; if (this.air < 10 && Math.random() < dt * 4) this.air++; }
    // 岩浆与燃烧
    if (this.inLava) { this.fireT = 6; if (this.invuln <= 0) this.hurt(4, 0, -3, null, 'lava'); }
    if (this.fireT > 0) {
      this.fireT -= dt;
      if (this.inWater) this.fireT = 0;
      if ((this.fireT * 2 | 0) !== ((this.fireT + dt) * 2 | 0)) this.hurt(1, 0, 0, null, 'fire', true);
    }
    // 仙人掌
    this.cactusT -= dt;
    if (this.cactusT <= 0) {
      for (let yy = Math.floor(this.y - this.h); yy <= Math.floor(this.y - 0.01); yy++) for (let xx = Math.floor(this.x - this.w / 2 - 0.05); xx <= Math.floor(this.x + this.w / 2 + 0.05); xx++) {
        if (w.fg(xx, yy) === B.cactus) { this.hurt(1, Math.sign(this.x - xx - 0.5) * 6, -3, null, 'cactus'); this.cactusT = 0.5; }
      }
    }
    // 卡在方块里(沙子砸下)窒息
    if (this.overlapsSolid() && this.boxHits(this.x - 0.2, this.y - this.h + 0.2, this.x + 0.2, this.y - this.h + 0.6)) {
      this.suffT = (this.suffT || 0) + dt;
      if (this.suffT > 0.5) { this.suffT = 0; this.hurt(1, 0, 0, null, 'suffocate'); }
    }
    if (this.y > 760) this.hurt(4, 0, 0, null, 'void');
  }

  hurt(dmg, kx = 0, ky = 0, src = null, kind = 'mob', ignoreInvuln = false) {
    const g = this.game, rpg = this.rpg;
    if (this.dead || this.creative || this.sleepingImmune) return;
    if (this.invuln > 0 && !ignoreInvuln) return;
    const combat = kind === 'mob' || kind === 'arrow' || kind === 'explosion';
    if (rpg?.buffs.divine_shield) { g.fx.text(this.x, this.y - this.h - 0.3, '免疫', '#fff0a0'); return; }
    if (combat) {
      if (g.difficulty === 0 && kind !== 'explosion' && !src?.npc) return;
      if (rpg && kind !== 'explosion') {
        const dodge = (rpg.buffs.evasion ? 0.7 : 0) + (rpg.race === 'nightelf' ? 0.05 : 0);
        if (Math.random() < dodge) { g.fx.text(this.x, this.y - this.h - 0.3, '闪避', '#cfe'); this.invuln = 0.3; return; }
      }
      dmg *= [0.5, 0.6, 1, 1.5][g.difficulty];
      const pts = this.inv.armorPoints() + (rpg?.form === 'bear' ? 8 : 0);
      if (pts) { dmg *= 1 - Math.min(0.8, pts * 0.04); if (this.inv.wearArmor(dmg)) g.msg('一件盔甲损坏了', '#f88'); }
      if (rpg) { dmg *= rpg.takenMult(); rpg.enterCombat(); rpg.addRage(Math.min(15, 3 + dmg / this.maxHp * 40)); }
      if (rpg?.buffs.pw_shield) {
        const b = rpg.buffs.pw_shield, ab = Math.min(b.absorb, dmg);
        b.absorb -= ab; dmg -= ab;
        g.fx.text(this.x + 0.6, this.y - this.h - 0.3, '吸收 ' + Math.round(ab), '#cde');
        if (b.absorb <= 0) delete rpg.buffs.pw_shield;
        if (dmg <= 0.5) { this.invuln = 0.3; return; }
      }
      if (rpg?.buffs.stealth?.meld) delete rpg.buffs.stealth;
    } else dmg *= this.maxHp / 20;  // 环境伤害按生命上限缩放
    dmg = Math.max(1, Math.round(dmg));
    this.hp -= dmg;
    if (!ignoreInvuln) this.invuln = 0.55;
    this.hurtFlash = 0.3;
    if (kx || ky) { this.vx = kx; this.vy = ky; }
    this.exh += 0.1;
    g.fx.text(this.x, this.y - this.h - 0.3, '-' + dmg, '#ff5050');
    g.sfx('hurt', this.x, this.y);
    if (this.sleeping) g.wake();
    if (this.hp <= 0) { this.hp = 0; g.playerDied(src, kind); }
  }

  heal(amount, silent = false) {
    if (this.dead) return;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const got = Math.round(this.hp - before);
    if (!silent && got > 0) this.game.fx.text(this.x, this.y - this.h - 0.3, '+' + got, '#7f7');
  }

  save() {
    return {
      x: this.x, y: this.y, hp: this.hp, hunger: this.hunger, sat: this.sat, air: this.air, inv: this.inv.save(),
      spawn: this.spawn, bedSpawn: this.bedSpawn, creative: this.creative, flying: this.flying, stats: this.stats, look: this.look, facing: this.facing,
    };
  }
  load(o) {
    Object.assign(this, { x: o.x, y: o.y, hp: o.hp, hunger: o.hunger, sat: o.sat ?? 5, air: o.air ?? 10, spawn: o.spawn, bedSpawn: o.bedSpawn, creative: !!o.creative, flying: !!o.flying, facing: o.facing || 1 });
    if (o.stats) this.stats = { ...this.stats, ...o.stats };
    if (o.look) this.look = o.look;
    this.inv.load(o.inv);
  }
}
