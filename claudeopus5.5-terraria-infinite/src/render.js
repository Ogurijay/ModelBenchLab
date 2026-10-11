// 渲染:天空(日月星云、视差远山、天气)→ 世界层(区块缓存、流体、实体、粒子)→ 光照正片叠底 → 未受光照的叠加层。
import { TS, CS, CSH, CM, ckey, SEA, HELL_Y } from './const.js';
import { BLOCKS, B, WALLS, TRUNKS, LEAVES, doorPart } from './blocks.js';
import { atlas, wallAtlas, slotOf, spriteSlot, wallSlot, iconCanvas, mobFrames, hex, Pix } from './art.js';
import { avatarParts } from './avatar.js';
import { NPC_TYPES } from './wow.js';
import { hash2, fbm1, noise1, clamp, lerp, mulberry32 } from './rng.js';
import { ITEMS } from './items.js';
import { BIOME } from './worldgen.js';

const CPX = CS * TS; // 区块像素边长 512
const isTrunk = new Uint8Array(256), isLeaf = new Uint8Array(256), mergeSolid = new Uint8Array(256);
for (const t of TRUNKS) isTrunk[t] = 1;
isTrunk[B.cactus] = 2;
for (const l of LEAVES) isLeaf[l] = 1;
for (const b of BLOCKS) mergeSolid[b.id] = b.solid && b.opaque && b.render === 'framed' ? 1 : 0;

const SKY = {
  day: [hex('#3f86e0'), hex('#a8d8fa')], dawn: [hex('#344a96'), hex('#f6a060')], night: [hex('#04081a'), hex('#14204a')],
  blood: [hex('#1a0204'), hex('#5a0c10')], storm: [hex('#4a525e'), hex('#8a949e')],
};
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export class Renderer {
  constructor(game, canvas) {
    this.game = game; this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.wc = document.createElement('canvas'); this.wctx = this.wc.getContext('2d');
    this.lm = document.createElement('canvas'); this.lmctx = this.lm.getContext('2d');
    this.pc = document.createElement('canvas'); this.pc.width = 72; this.pc.height = 72; this.pctx = this.pc.getContext('2d');
    this.cache = new Map(); this.pool = [];
    this.cx = 0; this.cy = 0; this.camX = 0; this.camY = 0;
    this.userScale = 0; this.scale = 1; this.W = 0; this.H = 0;
    this.shake = 0; this.flash = 0; this.bolt = null; this.time = 0;
    this.drops = []; this.smoothLight = true;
    const r = mulberry32(99);
    this.stars = Array.from({ length: 160 }, () => ({ x: r(), y: r() * 0.7, b: 0.4 + r() * 0.6, tw: r() * 6 }));
    this.cloudImgs = Array.from({ length: 6 }, (_, i) => makeCloud(mulberry32(300 + i)));
    this.clouds = Array.from({ length: 9 }, (_, i) => ({ x: r() * 3000, y: 20 + r() * 160, k: i % 6, sp: 4 + r() * 8, depth: 0.03 + r() * 0.05 }));
    this.biomeTint = [90, 140, 110];
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = window.innerWidth || 1280, ch = window.innerHeight || 720;
    const s = this.userScale || Math.max(1, Math.round((cw * dpr) / 1920 * 2) / 2);
    this.scale = s; this.lastSize = cw + 'x' + ch + 'x' + dpr;
    this.W = Math.max(16, Math.ceil(cw * dpr / s)); this.H = Math.max(16, Math.ceil(ch * dpr / s));
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.canvas.style.width = (this.W * s / dpr) + 'px'; this.canvas.style.height = (this.H * s / dpr) + 'px';
    this.wc.width = this.lm.width = this.W; this.wc.height = this.lm.height = this.H;
    this.ctx.imageSmoothingEnabled = false; this.wctx.imageSmoothingEnabled = false;
  }
  // 屏幕(CSS 像素)→ 世界格坐标
  screenToWorld(mx, my) {
    const r = this.canvas.getBoundingClientRect();
    const px = mx * this.W / (r.width || this.W), py = my * this.H / (r.height || this.H);
    return { x: (this.camX + px) / TS, y: (this.camY + py) / TS };
  }
  viewTiles() {
    return { x0: Math.floor(this.camX / TS), y0: Math.floor(this.camY / TS), x1: Math.ceil((this.camX + this.W) / TS), y1: Math.ceil((this.camY + this.H) / TS) };
  }

  updateCamera(dt, snap = false) {
    const p = this.game.player;
    if (!this.game.demo) {
      const tx = p.x * TS + p.vx * 4, ty = (p.y - 1.4) * TS + Math.min(0, p.vy) * 2;
      const k = snap ? 1 : Math.min(1, dt * 7);
      this.cx += (tx - this.cx) * k; this.cy += (ty - this.cy) * Math.min(1, k * 1.4);
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake * 10;
    this.camX = Math.round(this.cx - this.W / 2 + (Math.random() - 0.5) * sh);
    this.camY = Math.round(this.cy - this.H / 2 + (Math.random() - 0.5) * sh);
  }

  resetCache() { for (const [k] of this.cache) this.dropChunk(k); this.drops = []; this.bolt = null; this.flash = 0; this.shake = 0; }
  dropChunk(key) { const e = this.cache.get(key); if (e) { this.pool.push(e); this.cache.delete(key); } }
  invalidateAll() { for (const c of this.game.world.chunks.values()) c.rdirty = true; }

  // ———————————————————————————— 主绘制
  draw(dt) {
    if (this.lastSize !== (window.innerWidth || 1280) + 'x' + (window.innerHeight || 720) + 'x' + (window.devicePixelRatio || 1)) this.resize();
    const g = this.game, w = g.world, ctx = this.ctx, W = this.W, H = this.H;
    this.time += dt;
    const camX = this.camX, camY = this.camY;
    const v = this.viewTiles();
    const sky = g.clock.skyLight();
    // 光照(视野外扩)
    const M = 14;
    const extra = g.extraLights();
    g.light.compute(v.x0 - M, v.y0 - M, v.x1 - v.x0 + M * 2, v.y1 - v.y0 + M * 2, sky, extra);

    this.drawSky(ctx, camX, camY, sky);

    const wc = this.wctx;
    wc.globalCompositeOperation = 'source-over';
    wc.clearRect(0, 0, W, H);
    // 区块缓存
    let budget = 3;
    const season = g.clock.season;
    for (let cy = v.y0 >> CSH; cy <= (v.y1 - 1) >> CSH; cy++) for (let cx = v.x0 >> CSH; cx <= (v.x1 - 1) >> CSH; cx++) {
      const c = w.peek(cx, cy);
      if (!c) continue;
      let e = this.cache.get(c.key);
      const fresh = !e;
      if (!e) { e = this.pool.pop() || newChunkCanvas(); e.season = -1; this.cache.set(c.key, e); }
      if (fresh || ((c.rdirty || e.season !== season) && budget-- > 0)) { this.renderChunk(c, e, season); c.rdirty = false; e.season = season; }
      wc.drawImage(e.cv, cx * CPX - camX, cy * CPX - camY);
    }
    if (this.cache.size > 90) for (const [k, e] of this.cache) { if (!w.chunks.has(k)) this.dropChunk(k); }

    this.drawFluids(wc, v, camX, camY);
    this.drawEntities(wc, camX, camY);
    g.fx.draw(wc, camX, camY, true);
    this.drawMining(wc, camX, camY);

    // 光照叠加
    g.light.paint(0);
    const lm = this.lmctx;
    lm.globalCompositeOperation = 'copy';
    lm.imageSmoothingEnabled = this.smoothLight;
    lm.drawImage(g.light.canvas, (v.x0 - M) * TS - camX, (v.y0 - M) * TS - camY, g.light.w * TS, g.light.h * TS);
    lm.globalCompositeOperation = 'destination-in';
    lm.drawImage(this.wc, 0, 0);
    wc.globalCompositeOperation = 'multiply';
    wc.drawImage(this.lm, 0, 0);
    wc.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.wc, 0, 0);

    // 自发光与界面叠加
    g.fx.draw(ctx, camX, camY, false);
    this.drawGlows(ctx, camX, camY);
    this.drawWeather(ctx, dt, v, camX, camY, sky);
    this.drawCursor(ctx, camX, camY);
    this.drawNameplates(ctx, camX, camY);
    g.fx.drawTexts(ctx, camX, camY);
    this.drawOverlays(ctx, dt);
  }

  // ———————————————————————————— 区块缓存
  renderChunk(c, e, season) {
    const w = this.game.world, gen = w.gen, ctx = e.ctx;
    ctx.clearRect(0, 0, CPX, CPX);
    const x0 = c.cx * CS, y0 = c.cy * CS;
    const nb = { L: w.peek(c.cx - 1, c.cy), R: w.peek(c.cx + 1, c.cy), U: w.peek(c.cx, c.cy - 1), D: w.peek(c.cx, c.cy + 1) };
    const at = (arr, lx, ly) => {
      if (lx >= 0 && lx < CS && ly >= 0 && ly < CS) return c[arr][(ly << CSH) | lx];
      const n = lx < 0 ? nb.L : lx >= CS ? nb.R : ly < 0 ? nb.U : nb.D;
      if (!n) return -1;
      return n[arr][((ly & CM) << CSH) | (lx & CM)];
    };
    const A = atlas.canvas, WA = wallAtlas.canvas;
    const surf = new Int32Array(CS);
    for (let lx = 0; lx < CS; lx++) surf[lx] = gen.column(x0 + lx).s;
    for (let ly = 0; ly < CS; ly++) for (let lx = 0; lx < CS; lx++) {
      const i = (ly << CSH) | lx, id = c.fg[i], wl = c.wall[i], x = x0 + lx, y = y0 + ly;
      const px = lx * TS, py = ly * TS, h = hash2(x, y, 7);
      const b = BLOCKS[id];
      {
        if (wl) {
          const m = (at('wall', lx, ly - 1) === 0 ? 1 : 0) | (at('wall', lx + 1, ly) === 0 ? 2 : 0) | (at('wall', lx, ly + 1) === 0 ? 4 : 0) | (at('wall', lx - 1, ly) === 0 ? 8 : 0);
          const s = wallSlot(wl, m, h & 1);
          ctx.drawImage(WA, (s & 15) * TS, (s >> 4) * TS, TS, TS, px, py, TS, TS);
        } else if (y >= surf[lx] + 3) {
          const s = atlas.backdrop + h % 3;
          ctx.drawImage(A, (s & 15) * TS, (s >> 4) * TS, TS, TS, px, py, TS, TS);
        }
      }
      if (!id) continue;
      let s;
      if (b.render === 'sprite') s = spriteSlot(id, this.spriteFrame(id, c.meta[i], h, lx, ly, at), season);
      else {
        let m = 0;
        const n = [at('fg', lx, ly - 1), at('fg', lx + 1, ly), at('fg', lx, ly + 1), at('fg', lx - 1, ly)];
        for (let k = 0; k < 4; k++) {
          const nid = n[k];
          if (nid < 0) continue;
          let exposed;
          if (b.render === 'trunk') exposed = isTrunk[id] === 2 ? nid !== id : !(isTrunk[nid] === 1 || isLeaf[nid] || mergeSolid[nid]);
          else if (b.render === 'leaves') exposed = !(isLeaf[nid] || isTrunk[nid] === 1);
          else if (!b.opaque) exposed = nid !== id;
          else exposed = !mergeSolid[nid] && nid !== id;
          if (exposed) m |= 1 << k;
        }
        const variant = id === B.farmland ? (c.meta[i] & 1 ? 2 : h % 2) : h % 3;
        s = slotOf(id, m, variant, season);
      }
      ctx.drawImage(A, (s & 15) * TS, (s >> 4) * TS, TS, TS, px, py, TS, TS);
    }
  }
  spriteFrame(id, meta, h, lx, ly, at) {
    switch (id) {
      case B.platform: { const l = at('fg', lx - 1, ly) === B.platform, r = at('fg', lx + 1, ly) === B.platform; return l && r ? 0 : !l && r ? 1 : l && !r ? 2 : 3; }
      case B.door: return doorPart(meta) + (meta & 2 ? 3 : 0) + (meta & 4 ? 6 : 0);
      case B.bed: return meta & 3;
      case B.furnace: return meta & 1;
      case B.wheat: return Math.min(7, meta);
      case B.sapling: return Math.min(4, meta);
      case B.flower: return meta % 3;
      case B.mushroom: return meta & 1;
      case B.berry_bush: return meta & 3;
      case B.tall_grass: return h % 3;
    }
    return 0;
  }

  // ———————————————————————————— 流体
  drawFluids(ctx, v, camX, camY) {
    const w = this.game.world, t = this.time;
    for (let ty = v.y0 - 1; ty <= v.y1; ty++) for (let tx = v.x0 - 1; tx <= v.x1; tx++) {
      const c = w.peek(tx >> CSH, ty >> CSH);
      if (!c) continue;
      const f = c.fluid[((ty & CM) << CSH) | (tx & CM)];
      if (!f) continue;
      const type = f >> 4, L = f & 15;
      const ca = w.peek(tx >> CSH, (ty - 1) >> CSH);
      const above = ca ? ca.fluid[(((ty - 1) & CM) << CSH) | (tx & CM)] : 0;
      const full = above && (above >> 4) === type;
      const hgt = full ? TS : Math.max(2, Math.round(L * 2));
      const x = tx * TS - camX, y = ty * TS + TS - hgt - camY;
      if (type === 1) {
        ctx.fillStyle = 'rgba(46,104,214,0.6)';
        ctx.fillRect(x, y, TS, hgt);
        if (!full) {
          const wob = Math.round(Math.sin(t * 2.4 + tx * 0.8) * 0.8);
          ctx.fillStyle = 'rgba(160,205,255,0.85)'; ctx.fillRect(x, y + wob, TS, 2);
          ctx.fillStyle = 'rgba(46,104,214,0.6)'; if (wob > 0) ctx.fillRect(x, y, TS, wob);
        }
      } else {
        ctx.fillStyle = '#e8601a'; ctx.fillRect(x, y, TS, hgt);
        const hb = hash2(tx, ty, 3);
        ctx.fillStyle = '#c03a10';
        const ph = (t * 0.6 + (hb & 255) / 255) % 1;
        ctx.fillRect(x + (hb & 7) * 1.5, y + hgt * ph | 0, 4, 2);
        if (!full) { ctx.fillStyle = '#ffc24a'; ctx.fillRect(x, y, TS, 2); }
      }
    }
  }

  // ———————————————————————————— 实体
  drawEntities(ctx, camX, camY) {
    const g = this.game;
    for (const e of g.entities) {
      if (e.dead) continue;
      const sx = e.x * TS - camX, sy = e.y * TS - camY;
      if (sx < -80 || sy < -80 || sx > this.W + 80 || sy > this.H + 120) continue;
      if (e.type === 'item') {
        const ic = iconCanvas(e.id);
        const bob = Math.round(Math.sin(this.time * 3 + e.bob) * 1.5);
        ctx.drawImage(ic, Math.round(sx - 8), Math.round(sy - 16 + bob - 1), 16, 16);
        if (e.n > 1) { ctx.drawImage(ic, Math.round(sx - 6), Math.round(sy - 18 + bob - 1), 16, 16); }
      } else if (e.type === 'arrow') {
        const a = e.stuck ? Math.atan2(e.lastVy || 1, e.lastVx || 0) : e.angle;
        if (!e.stuck) { e.lastVx = e.vx; e.lastVy = e.vy; }
        ctx.save(); ctx.translate(Math.round(sx), Math.round(sy)); ctx.rotate(a);
        ctx.fillStyle = '#8a6a3a'; ctx.fillRect(-12, -1, 12, 2);
        ctx.fillStyle = '#c8c8d0'; ctx.fillRect(0, -1, 3, 2);
        ctx.fillStyle = '#f0f0f0'; ctx.fillRect(-13, -2, 3, 1); ctx.fillRect(-13, 1, 3, 1);
        ctx.restore();
      } else if (e.type === 'falling' || e.type === 'tnt') {
        const id = e.type === 'tnt' ? B.tnt : e.id, b = BLOCKS[id];
        const s = b.render === 'sprite' ? spriteSlot(id, 0, 0) : slotOf(id, 15, 0, this.game.clock.season);
        ctx.drawImage(atlas.canvas, (s & 15) * TS, (s >> 4) * TS, TS, TS, Math.round(sx - 8), Math.round(sy - 16), TS, TS);
        if (e.type === 'tnt' && Math.floor(e.fuse * 4) % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(Math.round(sx - 8), Math.round(sy - 16), TS, TS); }
      } else if (e.type === 'mob') this.drawMob(ctx, e, sx, sy);
      else if (e.type === 'totem') { const img = mobFrames('totem')[0]; ctx.drawImage(img, Math.round(sx - img.width / 2), Math.round(sy - img.height)); }
    }
    const p = g.player;
    if (p && !p.dead && !g.demo) this.drawPlayer(ctx, p, p.x * TS - camX, p.y * TS - camY);
  }

  composeHuman(look, o) {
    // o: { facing, legF, backA, frontA, item, itemMode, flash, white }
    const pc = this.pctx, parts = avatarParts(look), d = parts.dims;
    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.clearRect(0, 0, 72, 72);
    pc.imageSmoothingEnabled = false;
    if (o.facing < 0) { pc.translate(72, 0); pc.scale(-1, 1); }
    const X = a => Math.round(36 + a * 2), Y = a => Math.round(68 + a * 2);   // 脚底中心位于 (36,68)
    const shoulder = [X(d.shoulder[0]), Y(d.shoulder[1])];
    const drawArm = (img, a, x, y) => { pc.save(); pc.translate(x, y); pc.rotate(-a); pc.drawImage(img, -2, -2); pc.restore(); };
    drawArm(parts.armB, o.backA, shoulder[0] - 2, shoulder[1]);
    pc.drawImage(parts.legs[o.legF], X(d.legs[0]), Y(d.legs[1]));
    pc.drawImage(parts.torso, X(d.torso[0]), Y(d.torso[1]));
    pc.drawImage(parts.head, X(d.head[0]), Y(d.head[1]) + (o.headBob || 0));
    // 手持物品(在前臂之前绘制于手臂下方)
    if (o.item) this.drawHeld(pc, o.item, o.itemMode, o.frontA, shoulder, d.armLen * 2 - 3);
    drawArm(parts.arm, o.frontA, shoulder[0], shoulder[1]);
    if (o.flash > 0 || o.white > 0) {
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.globalCompositeOperation = 'source-atop';
      pc.fillStyle = o.white > 0 ? `rgba(255,255,255,${o.white})` : `rgba(255,40,40,${Math.min(0.6, o.flash * 2)})`;
      pc.fillRect(0, 0, 72, 72);
      pc.globalCompositeOperation = 'source-over';
    }
    pc.setTransform(1, 0, 0, 1, 0, 0);
    return this.pc;
  }
  drawHeld(pc, id, mode, a, sh, len = 11) {
    const it = ITEMS[id];
    if (!it) return;
    const ic = iconCanvas(id);
    const hx = sh[0] + Math.sin(a) * len, hy = sh[1] + Math.cos(a) * len;
    pc.save();
    pc.translate(Math.round(hx), Math.round(hy));
    if (it.tool && it.tool.type !== 'bow' && it.tool.type !== 'ignite' && it.tool.type !== 'shears') {
      // 图标为左下手柄 → 右上头部的对角线,沿手臂方向伸出
      pc.rotate(Math.PI * 0.75 - a);
      pc.drawImage(ic, -5, -27, 32, 32);
    } else if (it.kind === 'bow') {
      pc.rotate(-a + Math.PI / 2);
      pc.drawImage(ic, -14, -16, 32, 32);
    } else if (id === 'torch') {
      pc.drawImage(ic, -10, -18, 24, 24);
    } else {
      pc.drawImage(ic, -7, -8, 16, 16);
    }
    pc.restore();
  }

  drawPlayer(ctx, p, sx, sy) {
    const rpg = p.rpg;
    if (rpg?.form) { this.drawForm(ctx, p, sx, sy); return; }
    const held = p.inv.held;
    let legF = 0;
    if (p.climbing) legF = 1 + (Math.floor(p.y * 3) % 6 + 6) % 6;
    else if (!p.onGround && !p.inWater && !p.flying) legF = 8;
    else if (Math.abs(p.vx) > 0.4) legF = 1 + (Math.floor(p.walk * 2.4) % 6);
    const walkSw = legF >= 1 && legF <= 6 ? Math.sin(p.walk * 2.6) * 0.7 : 0;
    let backA = -walkSw * 0.8 + 0.1, frontA = walkSw * 0.8 + 0.1;
    let mode = 'idle';
    if (p.swing) {
      const u = Math.min(1, p.swing.t / p.swing.dur), e = 1 - (1 - u) * (1 - u);
      if (p.swing.kind === 'place') frontA = lerp(2.1, 1.0, e);
      else if (p.swing.kind === 'bow') frontA = p.aimA ?? 1.6;
      else frontA = lerp(3.4, 0.6, e);
      mode = 'swing';
    } else if (p.bow) { const m = this.game.mouseWorld(); frontA = Math.atan2(m.x - p.x, m.y - (p.y - 1.6)) * p.facing; frontA = Math.atan2(Math.abs(m.x - p.x), (m.y - (p.y - 1.6))); backA = frontA; }
    else if (p.eat) { frontA = 2.5 + Math.sin(p.eat.t * 18) * 0.2; }
    else if (p.climbing) { frontA = 2.6 + Math.sin(p.y * 3) * 0.4; backA = 2.6 - Math.sin(p.y * 3) * 0.4; }
    else if (held && ITEMS[held.id]?.key === 'torch') frontA = 1.1;
    const look = this.playerLook(p);
    const showItem = held && (mode === 'swing' || p.bow || p.eat || held.id === 'torch' || held.id === 'lantern');
    const img = this.composeHuman(look, { facing: p.facing, legF, backA, frontA, item: showItem ? held.id : null, itemMode: mode, flash: p.hurtFlash, headBob: legF >= 1 && legF <= 6 && (legF % 3 === 1) ? 1 : 0 });
    if (p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0 && p.hurtFlash <= 0) ctx.globalAlpha = 0.5;
    if (rpg?.buffs.stealth) ctx.globalAlpha = 0.38;
    if (rpg?.gliding) {
      ctx.fillStyle = 'rgba(200,236,255,0.55)';
      const wx = Math.round(sx - p.facing * 6), wy = Math.round(sy - 40);
      for (let i = 0; i < 6; i++) ctx.fillRect(wx - p.facing * (i * 3), wy + i * 2 - 2, 3 * -p.facing || 3, 8 - i);
    }
    if (p.sleeping) {
      ctx.save(); ctx.translate(Math.round(sx + 21 * (p.bedDir || 1)), Math.round(sy - 10)); ctx.rotate(-Math.PI / 2 * (p.bedDir || 1));
      ctx.drawImage(img, -36, -68); ctx.restore();
    } else ctx.drawImage(img, Math.round(sx - 36), Math.round(sy - 68 + p.stepAnim * 16));
    ctx.globalAlpha = 1;
  }
  drawForm(ctx, p, sx, sy) {
    const rpg = p.rpg, race = rpg.race;
    const tint = rpg.form === 'bear'
      ? { nightelf: '#3a2a4a', tauren: '#6a4428', skyborn_a: '#5ab0e8', skyborn_h: '#4aa0d8', troll: '#4a6a5a' }[race] || '#7a5030'
      : { nightelf: '#4a3a6a', tauren: '#c8a060', skyborn_a: '#7ac8f0', skyborn_h: '#6ab8e8', troll: '#5a8a6a' }[race] || '#b08040';
    const fr = mobFrames(rpg.form + ':' + tint);
    const f = Math.abs(p.vx) > 0.3 ? Math.floor(p.walk * 2) % fr.length : 0;
    const img = fr[f];
    ctx.save();
    if (rpg.buffs.stealth) ctx.globalAlpha = 0.38;
    ctx.translate(Math.round(sx), Math.round(sy));
    if (p.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(img, -Math.round(img.width / 2), -img.height);
    ctx.restore();
  }
  playerLook(p) {
    const L = { ...p.look };
    const a = p.inv.armor;
    const col = s => (s ? ITEMS[s.id].armor.color : null);
    L.helm = col(a[0]); L.helmKind = a[0]?.id === 'mining_helmet' ? 'mining' : 'std';
    L.chest = col(a[1]); L.legs = col(a[2]); L.boots = col(a[3]);
    return L;
  }

  drawMob(ctx, m, sx, sy) {
    const g = this.game;
    if (m.npc) {
      const t = m.t, engaged = m.attackCd > 0.4 || m.castCd > 1.8;
      const legF = !m.onGround ? 8 : Math.abs(m.vx) > 0.3 ? 1 + (Math.floor(m.anim * 2.4) % 6) : 0;
      let fa = 0.15, ba = 0.1;
      const item = t.weapon || (t.role === 'caster' ? (m.faction === 'alliance' ? 'arcane_staff' : 'totem_staff') : null);
      if (t.role === 'ranged' || t.role === 'caster') { fa = engaged ? 1.55 : 0.3; }
      else if (m.attackCd > 0.5) { const u = 1 - (m.attackCd - 0.5) / 0.4; fa = lerp(3.2, 0.7, Math.min(1, Math.max(0, u))); }
      else if (legF) { const sw = Math.sin(m.anim * 2.6) * 0.6; fa = sw; ba = -sw; }
      const img = this.composeHuman(m.look, { facing: m.facing, legF, backA: ba, frontA: fa, item, itemMode: 'swing', flash: m.flash, headBob: 0 });
      ctx.drawImage(img, Math.round(sx - 36), Math.round(sy - 68));
      if (m.stunT > 0) { ctx.fillStyle = '#ffe070'; ctx.fillRect(Math.round(sx - 4 + Math.sin(this.time * 8) * 4), Math.round(sy - m.h * 16 - 6), 2, 2); }
      return;
    }
    if (m.kind === 'zombie' || m.kind === 'skeleton') {
      const look = m.kind === 'zombie'
        ? { skin: '#6aa84a', hair: '#2a4a1a', shirt: '#3a6ab8', pants: '#3a3a8a', shoes: '#2a2a3a', eye: '#ff3030', zombie: true }
        : { skin: '#e8e6dc', hair: '#e8e6dc', shirt: '#d8d6cc', pants: '#d8d6cc', shoes: '#c8c6bc', skeleton: true };
      const legF = !m.onGround ? 8 : Math.abs(m.vx) > 0.3 ? 1 + (Math.floor(m.anim * 2.4) % 6) : 0;
      let fa = m.kind === 'zombie' ? 1.5 + Math.sin(this.time * 4 + m.x) * 0.1 : 1.4;
      const img = this.composeHuman(look, { facing: m.facing, legF, backA: fa - 0.1, frontA: fa, item: m.kind === 'skeleton' ? 'bow' : null, flash: m.flash, headBob: 0 });
      ctx.drawImage(img, Math.round(sx - 36), Math.round(sy - 68));
      return;
    }
    const fr = mobFrames(m.kind);
    let f = 0;
    if (m.def.fly) f = Math.floor(this.time * 10 + m.x) % fr.length;
    else if (m.def.hop) f = m.onGround ? 1 : 0;
    else f = Math.abs(m.vx) > 0.2 ? Math.floor(m.anim * 4) % fr.length : 0;
    const img = fr[f];
    const pc = this.pctx;
    pc.setTransform(1, 0, 0, 1, 0, 0); pc.clearRect(0, 0, 72, 72);
    const ox = Math.round(36 - img.width / 2), oy = 70 - img.height;
    if (m.facing < 0) { pc.translate(72, 0); pc.scale(-1, 1); }
    let sc = 1;
    if (m.kind === 'creeper' && m.fuse > 0) sc = 1 + m.fuse * 0.08;
    if (m.def.hop && !m.onGround) { pc.translate(36, 70); pc.scale(0.92, 1.1); pc.translate(-36, -70); }
    if (sc !== 1) { pc.translate(36, 70); pc.scale(sc, sc); pc.translate(-36, -70); }
    if (m.kind === 'sheep' && m.sheared) pc.globalAlpha = 1;
    pc.drawImage(img, ox, oy);
    if (m.kind === 'sheep' && m.sheared) { pc.globalCompositeOperation = 'source-atop'; pc.fillStyle = 'rgba(230,200,180,0.55)'; pc.fillRect(0, 50, 60, 22); pc.globalCompositeOperation = 'source-over'; }
    pc.setTransform(1, 0, 0, 1, 0, 0);
    const white = m.kind === 'creeper' && m.fuse > 0 && Math.floor(m.fuse * 8) % 2 === 0 ? 0.7 : 0;
    if (m.flash > 0 || white) {
      pc.globalCompositeOperation = 'source-atop';
      pc.fillStyle = white ? `rgba(255,255,255,${white})` : 'rgba(255,40,40,0.5)';
      pc.fillRect(0, 0, 72, 72);
      pc.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(this.pc, Math.round(sx - 36), Math.round(sy - 70));
    if (m.hp < m.maxHp && m.hostile) {
      const wbar = 20, k = Math.max(0, m.hp / m.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(Math.round(sx - wbar / 2) - 1, Math.round(sy + 3), wbar + 2, 4);
      ctx.fillStyle = k > 0.5 ? '#5ad84a' : k > 0.25 ? '#e8c840' : '#e84a3a'; ctx.fillRect(Math.round(sx - wbar / 2), Math.round(sy + 4), Math.round(wbar * k), 2);
    }
  }

  drawMining(ctx, camX, camY) {
    const mn = this.game.player?.mining;
    if (!mn || mn.total < 0.15) return;
    const st = Math.min(7, Math.floor(mn.p / mn.total * 8));
    const s = atlas.crack + st;
    ctx.drawImage(atlas.canvas, (s & 15) * TS, (s >> 4) * TS, TS, TS, mn.x * TS - camX, mn.y * TS - camY, TS, TS);
  }

  // 光晕(火把火焰闪烁、发光粒子以外的高光)
  drawGlows(ctx, camX, camY) {
    const g = this.game;
    for (const e of g.entities) {
      if (e.dead) continue;
      const sx = e.x * TS - camX, sy = e.y * TS - camY;
      if (e.type === 'spell') {
        const c = e.col, r = e.o.big ? 5 : 3;
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.35)`; pixelDisc(ctx, sx, sy, r + 3);
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; pixelDisc(ctx, sx, sy, r);
        ctx.fillStyle = '#fff'; pixelDisc(ctx, sx, sy, Math.max(1, r - 2));
      } else if (e.type === 'ground') {
        const c = e.col, w = e.s.radius * TS;
        ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.18 + 0.08 * Math.sin(this.time * 6)})`;
        ctx.fillRect(Math.round(sx - w), Math.round(sy - 6), Math.round(w * 2), 6);
      }
    }
    const p = g.player, rpg = p?.rpg;
    if (rpg && !p.dead && !g.demo) {
      const sx = p.x * TS - camX, sy = (p.y - 1.3) * TS - camY;
      if (rpg.buffs.divine_shield) { ctx.strokeStyle = `rgba(255,230,120,${0.6 + 0.3 * Math.sin(this.time * 8)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 30, 0, Math.PI * 2); ctx.stroke(); }
      if (rpg.buffs.pw_shield) { ctx.strokeStyle = 'rgba(200,230,255,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(sx, sy, 27, 0, Math.PI * 2); ctx.stroke(); }
      if (rpg.buffs.shield_wall || rpg.buffs.stoneform) { ctx.strokeStyle = 'rgba(190,190,210,0.5)'; ctx.lineWidth = 2; ctx.strokeRect(Math.round(sx - 16), Math.round(sy - 24), 32, 48); }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const e of g.entities) {
      if (e.type === 'mob' && e.fireT > 0) {
        const sx = e.x * TS - camX, sy = (e.y - e.h / 2) * TS - camY;
        ctx.fillStyle = 'rgba(255,120,30,0.12)'; ctx.fillRect(sx - 14, sy - 18, 28, 36);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ———————————————————————————— 天空
  drawSky(ctx, camX, camY, sky) {
    const g = this.game, clk = g.clock, W = this.W, H = this.H;
    const f = clk.sunFactor(), h = clk.hours;
    const [rise, set] = clk.sunTimes();
    const warm = Math.max(0, 1 - Math.min(Math.abs(h - rise), Math.abs(h - set)) / 1.3);
    let top = mixc(SKY.night[0], SKY.day[0], f), bot = mixc(SKY.night[1], SKY.day[1], f);
    top = mixc(top, SKY.dawn[0], warm * 0.6); bot = mixc(bot, SKY.dawn[1], warm * 0.85);
    if (clk.blood) { top = mixc(top, SKY.blood[0], 0.75 * (1 - f)); bot = mixc(bot, SKY.blood[1], 0.75 * (1 - f)); }
    const rainF = clk.weather === 'thunder' ? 0.85 : clk.weather === 'rain' ? 0.6 : 0;
    this.rainVis = lerp(this.rainVis || 0, rainF, 0.02);
    const rv = this.rainVis;
    if (rv > 0.01) { const st = mixc(SKY.storm[0], SKY.storm[1], 0.5); top = mixc(top, mixc(st, top, 1 - f * 0.9).map(v => v * (0.35 + 0.65 * f)), rv); bot = mixc(bot, mixc(SKY.storm[1], bot, 1 - f).map(v => v * (0.35 + 0.65 * f)), rv); }
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, rgb(top)); grad.addColorStop(1, rgb(bot));
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    // 星星
    const starA = (1 - f) * (1 - rv);
    if (starA > 0.02) {
      for (const s of this.stars) {
        const tw = 0.6 + 0.4 * Math.sin(this.time * 2 + s.tw);
        ctx.fillStyle = `rgba(255,255,240,${starA * s.b * tw})`;
        const x = ((s.x * W * 1.3 - camX * 0.01) % W + W) % W, y = s.y * H * 0.8;
        ctx.fillRect(x | 0, y | 0, s.b > 0.85 ? 2 : 1, s.b > 0.85 ? 2 : 1);
      }
    }
    // 太阳与月亮
    const arcY = p => H * 0.78 - Math.sin(p * Math.PI) * H * 0.62;
    if (h > rise - 0.7 && h < set + 0.7) {
      const p = (h - rise) / (set - rise);
      const x = W * (0.08 + 0.84 * p), y = arcY(clamp(p, -0.05, 1.05));
      ctx.globalAlpha = 1 - rv * 0.85;
      ctx.fillStyle = 'rgba(255,240,180,0.10)'; pixelDisc(ctx, x, y, 34);
      ctx.fillStyle = 'rgba(255,240,180,0.16)'; pixelDisc(ctx, x, y, 24);
      ctx.fillStyle = 'rgba(255,245,200,0.25)'; pixelDisc(ctx, x, y, 17);
      ctx.fillStyle = warm > 0.3 ? '#ffc860' : '#fff6c8'; pixelDisc(ctx, x, y, 13);
      ctx.globalAlpha = 1;
    }
    const nightLen = 24 - (set - rise);
    let nh = h - set; if (nh < 0) nh += 24;
    if (nh < nightLen + 0.6) {
      const p = nh / nightLen;
      const x = W * (0.08 + 0.84 * p), y = arcY(clamp(p, -0.05, 1.05));
      ctx.globalAlpha = (1 - rv * 0.85) * clamp((1 - f) * 1.4, 0, 1);
      this.drawMoon(ctx, x, y, clk.moon, clk.blood);
      ctx.globalAlpha = 1;
    }
    // 云
    const ck = mixc([255, 255, 255], sky.map(v => v * 255), 0.6).map(v => v * (1 - rv * 0.35));
    for (const c of this.clouds) {
      c.x += c.sp * (1 + rv * 2) * (1 / 60);
      const img = this.cloudImgs[c.k];
      const x = ((c.x - camX * c.depth) % (W + 400) + W + 400) % (W + 400) - 200, y = c.y - camY * 0.015 + 40;
      ctx.globalAlpha = 0.75 + rv * 0.25;
      ctx.drawImage(tintCloud(img, ck, c), x | 0, y | 0);
    }
    ctx.globalAlpha = 1;
    // 视差远山
    const col = g.world.gen.column(Math.floor(this.cx / TS));
    const target = col.biome === BIOME.DESERT ? [200, 170, 110] : col.biome === BIOME.TAIGA ? [190, 210, 230] : col.biome === BIOME.JUNGLE ? [40, 110, 60] : col.biome === BIOME.OCEAN || col.biome === BIOME.BEACH ? [90, 140, 170] : col.biome === BIOME.MOUNTAINS ? [120, 130, 150] : [70, 130, 90];
    this.biomeTint = mixc(this.biomeTint, target, 0.02);
    const light = sky.map(v => Math.min(1, v + 0.08));
    this.drawHills(ctx, camX, camY, 0.12, 0.55, mixc(bot, [110, 140, 180], 0.45).map((v, i) => v * light[i]), 140, 900, 11);
    this.drawHills(ctx, camX, camY, 0.25, 0.68, mixc(this.biomeTint, bot, 0.35).map((v, i) => v * light[i] * 0.85), 90, 420, 23);
    this.drawHills(ctx, camX, camY, 0.42, 0.8, this.biomeTint.map((v, i) => v * light[i] * 0.62), 60, 180, 37);
    // 地下:渐变为岩洞暗色
    const surfY = col.s * TS;
    const under = clamp((this.cy - surfY - 30 * TS) / (40 * TS), 0, 1);
    if (under > 0) { ctx.fillStyle = `rgba(14,10,8,${under})`; ctx.fillRect(0, 0, W, H); }
    if (this.cy > HELL_Y * TS - 300) { const k = clamp((this.cy - HELL_Y * TS + 300) / 900, 0, 1); ctx.fillStyle = `rgba(60,12,4,${k})`; ctx.fillRect(0, 0, W, H); }
  }
  drawHills(ctx, camX, camY, par, base, color, amp, scale, seed) {
    const W = this.W, H = this.H;
    const horizon = H * base - (camY - (SEA - 20) * TS) * par * 0.6;
    if (horizon > H + amp) return;
    ctx.fillStyle = rgb(color);
    for (let x = 0; x < W; x += 2) {
      const wx = (x + camX * par);
      const n = fbm1(wx / scale, seed, 3) * 0.7 + 0.3 * (1 - Math.abs(noise1(wx / (scale * 0.4), seed + 1)));
      const y = Math.round(horizon - n * amp);
      ctx.fillRect(x, y, 2, H - y);
    }
  }
  drawMoon(ctx, x, y, phase, blood) {
    ctx.fillStyle = blood ? 'rgba(255,60,60,0.12)' : 'rgba(220,230,255,0.07)'; pixelDisc(ctx, x, y, 26);
    ctx.fillStyle = blood ? 'rgba(255,60,60,0.16)' : 'rgba(220,230,255,0.1)'; pixelDisc(ctx, x, y, 17);
    ctx.fillStyle = blood ? '#ff5a4a' : '#eef2ff'; pixelDisc(ctx, x, y, 11);
    ctx.fillStyle = blood ? '#c03a30' : '#c8d0e0';
    ctx.fillRect(x - 5 | 0, y - 3 | 0, 3, 3); ctx.fillRect(x + 2 | 0, y + 3 | 0, 4, 3); ctx.fillRect(x + 4 | 0, y - 6 | 0, 2, 2);
    // 月相阴影
    if (phase !== 0) {
      const k = phase <= 4 ? phase / 4 : (8 - phase) / 4; // 0 满 → 1 新
      const dir = phase <= 4 ? 1 : -1;
      ctx.fillStyle = 'rgba(10,14,34,0.88)';
      for (let dy = -11; dy <= 11; dy++) {
        const half = Math.floor(Math.sqrt(121 - dy * dy));
        const edge = Math.round(half * (1 - 2 * k));
        if (dir > 0) ctx.fillRect(x - half | 0, y + dy | 0, Math.max(0, half - edge), 1);
        else ctx.fillRect(x + edge | 0, y + dy | 0, Math.max(0, half - edge), 1);
      }
    }
  }

  // ———————————————————————————— 天气
  lightning(x) {
    const p = this.game.player;
    this.flash = 1;
    const pts = [];
    let bx = x * TS, by = (p.y - 40) * TS;
    const gy = (this.game.world.gen.column(Math.floor(x)).s) * TS;
    while (by < gy) { pts.push([bx, by]); bx += (Math.random() - 0.5) * 40; by += 16 + Math.random() * 30; }
    pts.push([x * TS, gy]);
    this.bolt = { pts, t: 0.35 };
  }
  drawWeather(ctx, dt, v, camX, camY, sky) {
    const g = this.game, w = g.world, clk = g.clock;
    const intensity = clk.weather === 'thunder' ? 1 : clk.weather === 'rain' ? 0.6 : 0;
    const p = g.player;
    const snowy = w.temperature(Math.floor(p.x), Math.floor(p.y)) < 0.15;
    if (intensity > 0) {
      const n = Math.round(intensity * (snowy ? 4 : 14) * 60 * dt);
      for (let i = 0; i < n; i++) {
        const tx = v.x0 + Math.random() * (v.x1 - v.x0), ty = v.y0 + Math.random() * (v.y1 - v.y0) * 0.7;
        const fx = Math.floor(tx), fy = Math.floor(ty);
        if (!w.isLoaded(fx, fy) || w.solid(fx, fy) || !w.skyAt(fx, fy)) continue;
        this.drops.push({ x: tx, y: ty, snow: snowy, life: snowy ? 6 : 1.2, vx: snowy ? (Math.random() - 0.5) : 3 + intensity * 4, vy: snowy ? 2 + Math.random() : 34 + Math.random() * 8, sway: Math.random() * 6 });
      }
    }
    const lc = sky.map(v2 => Math.min(1, v2 + 0.15));
    ctx.fillStyle = rgb([170 * lc[0], 190 * lc[1], 235 * lc[2]], 0.55);
    const keep = [];
    for (const d of this.drops) {
      d.life -= dt;
      if (d.snow) d.vx = Math.sin(this.time * 1.5 + d.sway) * 1.2;
      d.x += d.vx * dt; d.y += d.vy * dt;
      const fx = Math.floor(d.x), fy = Math.floor(d.y);
      if (d.life <= 0 || !w.isLoaded(fx, fy)) continue;
      if (w.solid(fx, fy) || w.fluid(fx, fy) || (w.wall(fx, fy) && !WALLS[w.wall(fx, fy)].transparent)) {
        if (!d.snow && Math.random() < 0.3) g.fx.add({ x: d.x, y: fy - 0.02, vx: (Math.random() - 0.5) * 3, vy: -3, life: 0.2, color: [170, 200, 240], size: 1, grav: 30 });
        continue;
      }
      const sx = d.x * TS - camX, sy = d.y * TS - camY;
      if (sx < -10 || sx > this.W + 10 || sy > this.H + 10) continue;
      if (d.snow) { ctx.fillStyle = rgb([255 * lc[0], 255 * lc[1], 255 * lc[2]], 0.85); ctx.fillRect(sx | 0, sy | 0, 2, 2); ctx.fillStyle = rgb([170 * lc[0], 190 * lc[1], 235 * lc[2]], 0.55); }
      else { ctx.fillRect(sx | 0, sy | 0, 1, 7); }
      keep.push(d);
    }
    this.drops = keep.length > 2500 ? keep.slice(-2500) : keep;
    // 闪电
    if (this.bolt) {
      this.bolt.t -= dt;
      ctx.strokeStyle = `rgba(230,240,255,${Math.max(0, this.bolt.t * 3)})`; ctx.lineWidth = 2;
      ctx.beginPath(); this.bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x - camX, y - camY) : ctx.moveTo(x - camX, y - camY))); ctx.stroke();
      if (this.bolt.t <= 0) this.bolt = null;
    }
    if (this.flash > 0) { ctx.fillStyle = `rgba(230,235,255,${this.flash * 0.55})`; ctx.fillRect(0, 0, this.W, this.H); this.flash = Math.max(0, this.flash - dt * 3); }
  }

  // ———————————————————————————— 名牌:名字 + 等级(友方绿、敌方红、中立黄)
  drawNameplates(ctx, camX, camY) {
    const g = this.game, p = g.player;
    if (g.demo || !p) return;
    const m = g.mouseWorld();
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
    const used = [];
    const list = g._mobs.filter(e => !e.dead && !e.pet).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
    for (const e of list) {
      if (e.dead || e.pet) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      const hover = Math.abs(m.x - e.x) < e.w && m.y > e.y - e.h - 0.5 && m.y < e.y + 0.3;
      const show = e.npc ? (e.friendly ? (e.role === 'quest' || e.role === 'vendor' ? d < 22 : hover || d < 3) : hover || e === g.lastTarget || d < 9 || e.role === 'elite' && d < 18) : (hover || e === g.lastTarget) && d < 30;
      if (!show) continue;
      const sx = Math.round(e.x * TS - camX);
      let sy = Math.round((e.y - e.h) * TS - camY - (e.npc ? 8 : 6));
      const wPl = ctx.measureText(e.displayName || '').width + 24;
      for (let k = 0; k < 4 && used.some(u => Math.abs(u.x - sx) < (u.w + wPl) / 2 && Math.abs(u.y - sy) < 12); k++) sy -= 12;
      used.push({ x: sx, y: sy, w: wPl });
      const col = e.side === 'A' ? '#7cf27c' : e.side === 'B' ? '#ff6a5a' : '#f2e27a';
      const lvlDiff = e.level - p.rpg.level;
      const lc = lvlDiff >= 5 ? '#ff4040' : lvlDiff >= 3 ? '#ff9a30' : lvlDiff >= -2 ? '#f2e27a' : lvlDiff >= -7 ? '#5ad84a' : '#a0a0a0';
      const name = (e.npc ? e.displayName : e.displayName || e.def.name);
      const txt = name + (e.role === 'elite' ? ' ★' : '');
      ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(txt, sx + 1, sy + 1);
      ctx.fillStyle = col; ctx.fillText(txt, sx, sy);
      if (e.side !== 'A' || e.npc) {
        const lt = String(e.level), w = ctx.measureText(txt).width;
        ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(lt, sx - w / 2 - 9 + 1, sy + 1);
        ctx.fillStyle = e.side === 'A' ? '#c8c8c8' : lc; ctx.fillText(lt, sx - w / 2 - 9, sy);
      }
      if (e.npc && e.friendly && (e.role === 'quest' || e.role === 'vendor')) {
        const mark = e.role === 'quest' ? (g.quests.done() ? '?' : g.quests.offer() ? '!' : '') : '$';
        if (mark) { ctx.font = 'bold 15px "Microsoft YaHei", sans-serif'; ctx.fillStyle = '#000'; ctx.fillText(mark, sx + 1, sy - 11); ctx.fillStyle = e.role === 'quest' ? '#ffd040' : '#c0e0ff'; ctx.fillText(mark, sx, sy - 12); ctx.font = 'bold 10px "Microsoft YaHei", sans-serif'; }
      }
    }
  }

  // ———————————————————————————— 光标与放置预览
  drawCursor(ctx, camX, camY) {
    const g = this.game, p = g.player;
    if (!p || p.dead || p.sleeping || !p.target || !g.ui.mouseFree()) return;
    const { x, y } = p.target;
    const sx = x * TS - camX, sy = y * TS - camY;
    const it = p.inv.heldItem();
    if (it?.place && p.canPlaceAt(x, y, it)) {
      const id = B[it.place], b = BLOCKS[id];
      const s = b.render === 'sprite' ? spriteSlot(id, it.placeMeta || 0, g.clock.season) : slotOf(id, 15, 0, g.clock.season);
      ctx.globalAlpha = 0.45;
      ctx.drawImage(atlas.canvas, (s & 15) * TS, (s >> 4) * TS, TS, TS, sx, sy, TS, TS);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, TS - 1, TS - 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeRect(sx - 0.5, sy - 0.5, TS + 1, TS + 1);
  }

  drawOverlays(ctx, dt) {
    const g = this.game, p = g.player, W = this.W, H = this.H;
    if (p.headInWater) { ctx.fillStyle = 'rgba(20,60,160,0.22)'; ctx.fillRect(0, 0, W, H); }
    if (p.headInLava) { ctx.fillStyle = 'rgba(255,90,20,0.45)'; ctx.fillRect(0, 0, W, H); }
    if (g.clock.blood) { ctx.fillStyle = `rgba(120,0,0,${0.12 * (1 - g.clock.sunFactor())})`; ctx.fillRect(0, 0, W, H); }
    if (!p.dead && p.hp <= 5 && !p.creative) {
      const a = (0.25 + 0.15 * Math.sin(this.time * 5)) * (1 - p.hp / 6);
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(160,0,0,0)'); gr.addColorStop(1, `rgba(160,0,0,${a})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    const sl = g.sleepFade || 0;
    if (sl > 0) { ctx.fillStyle = `rgba(4,6,20,${sl * 0.7})`; ctx.fillRect(0, 0, W, H); }
  }
}

function newChunkCanvas() {
  const cv = document.createElement('canvas');
  cv.width = CPX; cv.height = CPX;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { cv, ctx, season: -1 };
}
function pixelDisc(ctx, x, y, r) {
  for (let dy = -r; dy <= r; dy++) { const hw = Math.floor(Math.sqrt(r * r - dy * dy)); ctx.fillRect(x - hw | 0, y + dy | 0, hw * 2 + 1, 1); }
}
function makeCloud(r) {
  const w = 60 + (r() * 60 | 0), h = 24 + (r() * 12 | 0);
  const p = new Pix(w >> 1, h >> 1);
  const blobs = 4 + (r() * 4 | 0);
  for (let i = 0; i < blobs; i++) {
    const cx = 6 + r() * (p.w - 12), cy = p.h * 0.6 - r() * 4, rad = 3 + r() * 5;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if ((x - cx) ** 2 + ((y - cy) * 1.4) ** 2 < rad * rad) p.set(x, y, [255, 255, 255]);
  }
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.a(x, y) && !p.a(x, y + 1)) p.set(x, y, [205, 214, 230]);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (p.a(x, y) && !p.a(x, y - 1)) p.set(x, y, [255, 255, 255]);
  return p.canvas(2);
}
const tintCache = new WeakMap();
function tintCloud(img, col, c) {
  let e = tintCache.get(img);
  const key = col.map(v => v >> 4).join(',');
  if (e && e.key === key) return e.cv;
  if (!e) { e = { cv: document.createElement('canvas') }; e.cv.width = img.width; e.cv.height = img.height; tintCache.set(img, e); }
  const x = e.cv.getContext('2d');
  x.globalCompositeOperation = 'copy'; x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = rgb(col); x.fillRect(0, 0, img.width, img.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-over';
  e.key = key;
  return e.cv;
}
