// 打工小游戏:咖啡馆点单配餐 / 修车厂拧螺丝。每班约 40 秒,返回 0~1 的表现分。
import { ctx, W, H, P, rect, text, textC, textW, ptext, ptextS, pwidth, panel, cursor, bar, shade } from './gfx.js';
import { icon, simFrame, furniture, SKINS, HAIRS, SHIRTS, PANTS, portrait } from './sprites.js';
import { input } from './input.js';
import { sfx, playMusic } from './audio.js';
import { CAREERS, NPCS } from './data.js';
import * as sim from './sim.js';

const hooks = { setScene: null, back: null };
export function setMinigameHooks(h) { Object.assign(hooks, h); }

const DURATION = 40;

export function startMinigame(id, lvl, onDone) {
  const game = id === 'cafe' ? cafeGame(lvl) : garageGame(lvl);
  const scene = {
    phase: 'intro', t: 0, game, id, lvl,
    update() {
      this.t += 1 / 60;
      if (this.phase === 'intro') {
        if (this.t > 0.4 && input.pressed('A')) { sfx.select(); this.phase = 'play'; this.t = 0; }
        return;
      }
      if (this.phase === 'play') {
        game.update(this.t);
        if (this.t >= DURATION) { this.phase = 'result'; this.t = 0; this.score = game.score(); sfx.fanfare(); }
        return;
      }
      if (this.phase === 'result' && this.t > 0.8 && input.pressed('A')) {
        sfx.select();
        hooks.back?.();
        onDone(this.score, game.tips ? game.tips() : 0);
      }
    },
    draw() {
      game.draw(this.phase === 'play' ? this.t : 0);
      // 计时条
      rect(0, 0, W, 11, 'rgba(16,16,40,0.85)');
      text(CAREERS[id].name + ' · ' + CAREERS[id].levels[lvl].title, 3, -1, P.uiSel);
      const left = Math.max(0, DURATION - (this.phase === 'play' ? this.t : 0));
      ptextS(`${Math.ceil(left)}S`, W - 60, 3, left < 8 ? P.red : P.white);
      bar(W - 44, 3, 40, 5, left / DURATION, left < 8 ? P.red : P.sky);
      if (this.phase === 'intro') {
        panel(14, 24, W - 28, 112, 'cream');
        const boss = id === 'cafe' ? 'lily' : 'max';
        ctx.drawImage(portrait(NPCS[boss].look), 22, 32);
        text(id === 'cafe' ? '咖啡馆打工' : '修车厂打工', 70, 30, P.ink, { size: 16 });
        text(`时限 ${DURATION} 秒`, 70, 50, P.brown2);
        const lines = game.help;
        lines.forEach((ln, i) => text(ln, 24, 78 + i * 13, P.ink));
        if ((this.t * 2 | 0) % 2) textC('按 A 开工!', W / 2, 120, P.red2);
      }
      if (this.phase === 'result') {
        panel(30, 36, W - 60, 84, 'blue');
        textC('下班啦!', W / 2, 42, P.uiSel, { size: 16 });
        game.result().forEach((ln, i) => textC(ln, W / 2, 64 + i * 13, P.white));
        const sc = Math.round(this.score * 100);
        textC(`表现评分 ${sc}`, W / 2, 98, sc >= 70 ? P.green3 : sc >= 40 ? P.yellow : '#ff9090');
        if ((this.t * 2 | 0) % 2 && this.t > 0.8) ptext('A', W - 40, 110, P.white);
      }
    },
  };
  playMusic('work');
  hooks.setScene(scene);
}

// ---------------------------------------------------------------- 咖啡馆
const ITEMS = ['cup', 'cake', 'sandwich', 'juice'];
const ITEM_NAMES = { cup: '咖啡', cake: '蛋糕', sandwich: '三明治', juice: '果汁' };
function randLook() {
  const r = (a) => a[Math.floor(Math.random() * a.length)];
  return { skin: r(SKINS), hair: r(HAIRS), hairStyle: Math.floor(Math.random() * 4), shirt: r(SHIRTS), pants: r(PANTS), skirt: Math.random() < 0.3 };
}

function cafeGame(lvl) {
  const cook = sim.skillLv('cooking'), cha = sim.skillLv('charisma');
  const slots = [null, null, null];
  const tray = [];
  let row = 1, col = 0, spawnT = 0.5;
  let served = 0, missed = 0, wrong = 0, tips = 0;
  const pops = [];
  const patienceMax = 13 - lvl * 0.8 + cha * 0.8;
  const target = 6 + lvl;
  const maxItems = lvl === 0 ? 2 : 3;
  function spawn(i) {
    const n = 1 + Math.floor(Math.random() * maxItems);
    const order = Array.from({ length: n }, () => ITEMS[Math.floor(Math.random() * (lvl === 0 ? 3 : 4))]);
    slots[i] = { order, look: randLook(), pat: patienceMax, state: 'wait', t: 0 };
  }
  const same = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return {
    help: ['顾客头上的气泡是点单。', '下排选餐品放进托盘(最多 3 件),', '上排把托盘端给对应顾客。B 清空托盘。'],
    update(t) {
      spawnT -= 1 / 60;
      for (let i = 0; i < 3; i++) {
        const c = slots[i];
        if (!c) { if (spawnT <= 0) { spawn(i); spawnT = 1.6 + Math.random() * 1.6; } continue; }
        c.t += 1 / 60;
        if (c.state === 'wait') {
          c.pat -= 1 / 60;
          if (c.pat <= 0) { c.state = 'angry'; c.t = 0; missed++; sfx.bad(); }
        } else if (c.t > 0.8) slots[i] = null;
      }
      for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += 1 / 60; if (pops[i].t > 1) pops.splice(i, 1); }
      if (input.repeat('left')) { col = Math.max(0, col - 1); sfx.cursor(); }
      if (input.repeat('right')) { col = Math.min(row === 0 ? 2 : 3, col + 1); sfx.cursor(); }
      if (input.pressed('up') && row === 1) { row = 0; col = Math.min(2, Math.round(col * 2 / 3)); sfx.cursor(); }
      if (input.pressed('down') && row === 0) { row = 1; col = Math.min(3, Math.round(col * 3 / 2)); sfx.cursor(); }
      if (input.pressed('B') && tray.length) { tray.length = 0; sfx.back(); }
      if (input.pressed('A')) {
        if (row === 1) {
          if (tray.length < 3) { tray.push(ITEMS[col]); sfx.select(); } else sfx.error();
        } else {
          const c = slots[col];
          if (!c || c.state !== 'wait' || !tray.length) { sfx.error(); return; }
          if (same(c.order, tray)) {
            served++;
            const tip = Math.round(2 + cook + c.pat / patienceMax * 4);
            tips += tip;
            c.state = 'happy'; c.t = 0; sfx.coin();
            pops.push({ x: 44 + col * 76, y: 40, s: `+§${tip}`, c: P.green3, t: 0 });
          } else {
            wrong++; c.pat -= patienceMax * 0.3; sfx.bad();
            pops.push({ x: 44 + col * 76, y: 40, s: 'X', c: P.red, t: 0 });
          }
          tray.length = 0;
        }
      }
    },
    draw(t) {
      // 背景:墙、窗、柜台
      rect(0, 0, W, H, '#f0a878');
      for (let x = 0; x < W; x += 8) rect(x, 11, 4, 70, '#e09060');
      rect(0, 74, W, 4, '#784020');
      for (let i = 0; i < 3; i++) {
        const c = slots[i];
        const cx = 44 + i * 76;
        if (c) {
          const img = simFrame(c.look, 'down', c.state === 'happy' ? 'act' : 'stand', (t * 4 | 0) % 2);
          const yOff = c.state === 'wait' ? 0 : Math.min(20, c.t * 30);
          ctx.drawImage(img, 0, 0, 18, 28, cx - 18, 34 + yOff, 36, 56);
          if (c.state === 'wait') {
            const bw = c.order.length * 20 + 6;
            panel(cx - bw / 2, 13, bw, 24, 'cream');
            c.order.forEach((it, k) => ctx.drawImage(icon(it), 0, 0, 9, 9, cx - bw / 2 + 4 + k * 20, 16, 18, 18));
            bar(cx - 20, 77, 40, 6, c.pat / patienceMax);
          } else {
            ctx.drawImage(icon(c.state === 'happy' ? 'heart' : 'angry'), 0, 0, 9, 9, cx - 9, 16, 18, 18);
          }
        }
        if (row === 0 && col === i) { rect(cx - 24, 96, 48, 2, P.uiSel); cursor(cx - 3, 98, t); }
      }
      // 柜台
      rect(0, 84, W, 18, '#e8d8c0'); rect(0, 84, W, 2, P.white); rect(0, 102, W, 58, '#784020');
      for (let x = 4; x < W; x += 16) rect(x, 106, 8, 50, '#905830');
      // 餐品站
      for (let i = 0; i < 4; i++) {
        const x = 8 + i * 42, y = 112;
        panel(x, y, 38, 34, row === 1 && col === i ? 'green' : 'dark');
        ctx.drawImage(icon(ITEMS[i]), 0, 0, 9, 9, x + 10, y + 3, 18, 18);
        textC(ITEM_NAMES[ITEMS[i]], x + 19, y + 20, P.white);
      }
      // 托盘
      panel(178, 108, 58, 40, 'cream');
      text('托盘', 184, 108, P.brown2);
      for (let k = 0; k < 3; k++) {
        rect(183 + k * 17, 126, 15, 15, '#d8c8a8');
        if (tray[k]) ctx.drawImage(icon(tray[k]), 0, 0, 9, 9, 184 + k * 17, 127, 13, 13);
      }
      ptextS(`${served}/${target}`, 6, 14, P.white);
      for (const p of pops) ptextS(p.s, p.x - pwidth(p.s) / 2, p.y - p.t * 16, p.c);
    },
    score() {
      const acc = served / Math.max(1, served + missed + wrong * 0.5);
      return Math.max(0, Math.min(1, (served / target) * 0.75 + acc * 0.25));
    },
    result() { return [`服务顾客 ${served} 位 · 小费 §${tips}`, `跑单 ${missed} · 上错 ${wrong}`]; },
    debug: () => ({ slots: slots.map((c) => c && { order: c.order, state: c.state }), tray: [...tray], row, col, served, missed, wrong }),
    tips: () => tips,
  };
}

// ---------------------------------------------------------------- 修车厂
function garageGame(lvl) {
  const mech = sim.skillLv('mechanical'), body = sim.skillLv('body');
  const BOLTS = 5;
  let needle = 0, dirN = 1, zone = 0, bolt = 0, cars = 0, points = 0, perfect = 0, slips = 0, stun = 0, carX = 0;
  const zoneW = 14 + mech * 4 + body * 2;
  const speed = 1.6 + lvl * 0.35;
  const pops = [];
  const carCols = ['#3868c8', '#c83838', '#38a048', '#e0b030', '#8850c0'];
  const newZone = () => { zone = 20 + Math.random() * (150 - zoneW); };
  newZone();
  const target = 18 + lvl * 3;
  return {
    help: ['指针来回摆动,在绿色区域按 A 拧紧螺丝。', '黄色区勉强算数,红色区扳手会打滑。', '每辆车 5 颗螺丝,修得越多越好!'],
    update(t) {
      for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += 1 / 60; if (pops[i].t > 1) pops.splice(i, 1); }
      if (carX > 0) { carX = Math.max(0, carX - 6); return; }
      if (stun > 0) { stun -= 1 / 60; return; }
      needle += dirN * speed * (1 + bolt * 0.08);
      if (needle >= 170) { needle = 170; dirN = -1; }
      if (needle <= 0) { needle = 0; dirN = 1; }
      if (input.pressed('A')) {
        const c = needle;
        let res;
        if (c >= zone && c <= zone + zoneW) res = 2;
        else if (c >= zone - 10 && c <= zone + zoneW + 10) res = 1;
        else res = 0;
        if (res) {
          points += res; if (res === 2) perfect++;
          bolt++; sfx.wrench();
          pops.push({ s: res === 2 ? '完美!' : '还行', c: res === 2 ? P.green3 : P.yellow, t: 0 });
          if (bolt >= BOLTS) { bolt = 0; cars++; carX = 240; sfx.good(); points += 2; }
          newZone();
        } else {
          slips++; stun = 0.9; sfx.bad();
          pops.push({ s: '打滑!', c: '#ff8080', t: 0 });
        }
      }
    },
    draw(t) {
      rect(0, 0, W, H, '#b0aca8');
      for (let y = 11; y < 80; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < W; x += 16) rect(x, y, 15, 7, '#a09c98');
      rect(0, 80, W, 80, '#888890');
      rect(0, 80, W, 2, '#606068');
      // 汽车(放大)
      const car = furniture('car');
      ctx.save();
      ctx.translate(74 + carX, 18);
      ctx.drawImage(car.c, 0, 0, car.w + 2, car.h + 2, 0, 0, (car.w + 2) * 2, (car.h + 2) * 2);
      ctx.restore();
      // 螺丝
      for (let i = 0; i < BOLTS; i++) {
        const x = 64 + i * 24 + carX, y = 84;
        ctx.drawImage(icon('bolt'), 0, 0, 9, 9, x, y, 18, 18);
        if (i < bolt) ctx.drawImage(icon('check'), 0, 0, 9, 9, x + 2, y + 2, 14, 14);
        if (i === bolt && (t * 4 | 0) % 2) rect(x, y + 19, 18, 2, P.yellow);
      }
      // 计量条
      const gx = 35, gy = 118, gw = 170;
      rect(gx - 2, gy - 2, gw + 4, 18, P.ink);
      rect(gx, gy, gw, 14, '#c83838');
      rect(gx + zone - 10, gy, zoneW + 20, 14, '#e8c030');
      rect(gx + zone, gy, zoneW, 14, '#48c048');
      rect(gx + zone, gy, zoneW, 3, '#90f070');
      const nx = gx + Math.round(needle);
      rect(nx - 1, gy - 5, 3, 24, P.white); rect(nx, gy - 5, 1, 24, P.ink);
      rect(nx - 3, gy - 7, 7, 3, P.white);
      ptextS(`CAR ${cars}`, 6, 14, P.white);
      ptextS(`PTS ${points}/${target}`, 6, 22, P.white);
      if (stun > 0) textC('扳手打滑了……', W / 2, 140, '#ff9090', { outline: P.ink });
      else textC('A 拧紧', W / 2, 140, P.white, { outline: P.ink });
      for (const p of pops) textC(p.s, W / 2, 100 - p.t * 20, p.c, { outline: P.ink });
    },
    score() { return Math.max(0, Math.min(1, points / target * 0.85 + (perfect / Math.max(1, perfect + slips + 2)) * 0.15)); },
    result() { return [`修好汽车 ${cars} 辆 · 完美 ${perfect} 次`, `打滑 ${slips} 次`]; },
    debug: () => ({ needle, zone, zoneW, bolt, cars, points, stun, carX }),
  };
}
