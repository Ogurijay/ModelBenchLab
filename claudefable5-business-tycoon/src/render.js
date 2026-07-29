// ============================================================
// 像素大亨 — 程序化像素街景渲染器（Canvas2D，零素材）
// 内部分辨率 440×280 整数倍放大；建筑高度随门店等级生长；
// 昼夜循环(纯视觉 120s) + 四季配色 + 雨雪 + 行人车流密度联动客流。
// 装饰性随机用 Math.random/哈希，不碰 state 的确定性 RNG。
// ============================================================
import { TYPE_BY_ID, INDUSTRIES, DIST_BY_ID, RIVALS, IND_ICONS } from './data.js';
import { calDate } from './sim.js';

export const IW = 440, IH = 280;          // 内部像素分辨率
const PLOT_W = 40, PLOT_GAP = 4, PLOT_X0 = 2;
const GROUND_Y = 222;                      // 建筑基线（人行道顶）
const ROAD_Y = 240;

const hash = (n) => { let x = (n * 2654435761) % 4294967296; x = (x ^ (x >> 13)) * 1274126177; return ((x ^ (x >> 16)) >>> 0) / 4294967296; };
const lerp = (a, b, t) => a + (b - a) * t;
const cl = (v) => Math.max(0, Math.min(255, Math.round(v)));
// 同时接受 '#rrggbb' 与 'rgb(r,g,b)'，保证 shade/mix 可任意嵌套
const hex2 = (c) => c[0] === '#'
  ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
  : c.match(/\d+/g).map(Number);
const shade = (c, f) => { const [r, g, b] = hex2(c); return `rgb(${cl(r * f)},${cl(g * f)},${cl(b * f)})`; };
const mix = (c1, c2, t) => { const a = hex2(c1), b = hex2(c2); return `rgb(${cl(lerp(a[0], b[0], t))},${cl(lerp(a[1], b[1], t))},${cl(lerp(a[2], b[2], t))})`; };

const SKY = { // [白天, 黄昏, 夜晚] 按季微调
  day: ['#7ec8e8', '#87ceeb', '#a8d8e8', '#9fc4dd'],
  dusk: '#e8956a', night: '#141b30',
};
const SEASON_TREE = ['#7fd66a', '#3f9e3a', '#e8a53f', '#9db3b8'];
const SEASON_BLOSSOM = ['#ffb7d5', null, '#ff8c42', '#ffffff'];

export class CityRenderer {
  constructor(canvas, { onPlotClick, onPlotHover } = {}) {
    this.cv = canvas;
    this.cv.width = IW; this.cv.height = IH;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.dist = 'old';
    this.hover = -1;
    this.vt = 34;                    // 视觉时钟（秒），从上午开始
    this.pops = [];                  // 金钱飘字
    this.cars = Array.from({ length: 5 }, (_, i) => ({ x: Math.random() * IW, lane: i % 2, spd: 24 + Math.random() * 26, hue: Math.floor(Math.random() * 360) }));
    this.peds = Array.from({ length: 16 }, () => ({ x: Math.random() * IW, dir: Math.random() < 0.5 ? 1 : -1, spd: 6 + Math.random() * 8, off: Math.random() * 7 }));
    this.flakes = Array.from({ length: 60 }, () => ({ x: Math.random() * IW, y: Math.random() * IH, s: 0.4 + Math.random() * 0.9 }));

    canvas.addEventListener('pointermove', (e) => {
      const i = this._pick(e);
      if (i !== this.hover) { this.hover = i; onPlotHover && onPlotHover(i, e); }
      else if (i >= 0) onPlotHover && onPlotHover(i, e);
    });
    canvas.addEventListener('pointerleave', () => { this.hover = -1; onPlotHover && onPlotHover(-1); });
    canvas.addEventListener('pointerdown', (e) => {
      const i = this._pick(e);
      if (i >= 0 && onPlotClick) onPlotClick(i);
    });
  }

  _pick(e) {
    const r = this.cv.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * IW;
    const y = (e.clientY - r.top) / r.height * IH;
    if (y < 60 || y > ROAD_Y) return -1;
    const i = Math.floor((x - PLOT_X0) / (PLOT_W + PLOT_GAP));
    if (i < 0 || i > 9) return -1;
    const inPlot = (x - PLOT_X0) - i * (PLOT_W + PLOT_GAP) <= PLOT_W;
    return inPlot ? i : -1;
  }

  resize(cw) { // 整数倍缩放贴合容器
    const scale = Math.max(1, Math.floor(cw / IW));
    this.cv.style.width = `${IW * scale}px`;
    this.cv.style.height = `${IH * scale}px`;
  }

  addPop(plotIdx, text, color) {
    this.pops.push({ x: PLOT_X0 + plotIdx * (PLOT_W + PLOT_GAP) + PLOT_W / 2, y: GROUND_Y - 70 - Math.random() * 20, text, color, t: 0 });
  }

  setView(distId) { this.dist = distId; }

  // ---------- 主绘制 ----------
  render(state, selected, dt) {
    this.vt = (this.vt + dt) % 120;
    const ctx = this.ctx;
    const { season } = calDate(state.day);
    const dayPhase = this.vt / 120;                       // 0..1
    const sunT = Math.sin(dayPhase * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5; // 1 正午 0 午夜
    const night = 1 - Math.min(1, sunT * 1.6);
    const raining = state.fx.some((f) => f.src === 'typhoon');

    // 天空
    let sky = mix(SKY.day[season], SKY.night, night);
    if (sunT > 0.15 && sunT < 0.42) sky = mix(sky, SKY.dusk, 0.5 - Math.abs(sunT - 0.28) * 3);
    if (raining) sky = mix(sky, '#4a5568', 0.55);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, IW, IH);

    // 日月
    const arcX = IW * dayPhase, isDay = sunT > 0.45;
    const bodyY = 52 - Math.sin(dayPhase * Math.PI * 2 - Math.PI / 2) * 34;
    ctx.fillStyle = isDay ? '#ffe27a' : '#e8ecf2';
    ctx.fillRect(Math.round(isDay ? arcX : (arcX + IW / 2) % IW) - 5, Math.round(bodyY) - 5, 10, 10);
    if (!isDay) { ctx.fillStyle = sky; ctx.fillRect(Math.round((arcX + IW / 2) % IW) - 1, Math.round(bodyY) - 4, 5, 6); }

    // 云
    ctx.fillStyle = raining ? 'rgba(90,100,115,.8)' : `rgba(255,255,255,${0.75 - night * 0.45})`;
    for (let i = 0; i < 4; i++) {
      const cx = ((this.vt * (3 + i)) + i * 130) % (IW + 60) - 30;
      const cy = 18 + i * 13;
      ctx.fillRect(cx, cy, 26, 5); ctx.fillRect(cx + 5, cy - 3, 15, 3); ctx.fillRect(cx + 3, cy + 5, 18, 3);
    }

    // 远景天际线
    ctx.fillStyle = mix(shade(sky, 0.72), '#1a2030', 0.35 + night * 0.3);
    for (let i = 0; i < 15; i++) {
      const h = 24 + hash(i * 7 + 3) * 46;
      ctx.fillRect(i * 30 - 4, 132 - h, 24, h);
    }
    // 远景窗灯（夜）
    if (night > 0.4) {
      ctx.fillStyle = `rgba(255,220,120,${(night - 0.4) * 0.9})`;
      for (let i = 0; i < 40; i++) {
        if (hash(i * 13) < 0.5) continue;
        ctx.fillRect((i * 23) % 440, 70 + (i * 37) % 55, 2, 2);
      }
    }

    // 中景草地/地面
    ctx.fillStyle = mix(season === 3 ? '#c8d4dc' : '#5c9e4a', '#22301f', night * 0.5);
    ctx.fillRect(0, 132, IW, GROUND_Y - 132);

    // 地块
    const plots = state.plots[this.dist];
    for (let i = 0; i < 10; i++) this._plot(state, plots[i], i, season, night, selected === i, this.hover === i);

    // 人行道
    ctx.fillStyle = mix('#9aa2ac', '#2a2f3a', night * 0.55);
    ctx.fillRect(0, GROUND_Y, IW, ROAD_Y - GROUND_Y);
    ctx.fillStyle = mix('#7b838d', '#20242e', night * 0.55);
    for (let x = 0; x < IW; x += 8) ctx.fillRect(x, GROUND_Y, 1, ROAD_Y - GROUND_Y);

    // 行道树 + 路灯
    for (let i = 0; i < 6; i++) {
      const tx = 30 + i * 76;
      ctx.fillStyle = mix('#6b4a2f', '#241a10', night * 0.5);
      ctx.fillRect(tx, GROUND_Y - 10, 3, 10);
      ctx.fillStyle = mix(SEASON_TREE[season], '#101810', night * 0.55);
      ctx.fillRect(tx - 4, GROUND_Y - 20, 11, 11);
      const blossom = SEASON_BLOSSOM[season];
      if (blossom) {
        ctx.fillStyle = blossom;
        ctx.fillRect(tx - 3 + (i % 3), GROUND_Y - 19 + (i % 4), 2, 2);
        ctx.fillRect(tx + 3, GROUND_Y - 15 + ((i + 1) % 3), 2, 2);
      }
      // 路灯
      const lx = 68 + i * 76;
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(lx, GROUND_Y - 26, 2, 26);
      ctx.fillRect(lx - 2, GROUND_Y - 27, 6, 2);
      if (night > 0.35) {
        ctx.fillStyle = `rgba(255,214,110,${night})`;
        ctx.fillRect(lx - 1, GROUND_Y - 25, 4, 3);
        const g = ctx.createRadialGradient(lx + 1, GROUND_Y - 22, 1, lx + 1, GROUND_Y - 22, 22);
        g.addColorStop(0, `rgba(255,214,110,${0.28 * night})`); g.addColorStop(1, 'rgba(255,214,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(lx - 21, GROUND_Y - 44, 44, 44);
      }
    }

    // 行人（密度联动城区客流与昼夜）
    const dObj = DIST_BY_ID[this.dist];
    const devCount = plots.filter((p) => p.b !== null || p.rb).length;
    const density = Math.min(1, dObj.traffic * (0.45 + devCount * 0.09) * (0.35 + sunT));
    const pedCount = Math.round(this.peds.length * density);
    for (let i = 0; i < pedCount; i++) {
      const p = this.peds[i];
      p.x += p.dir * p.spd * dt;
      if (p.x < -5) p.x = IW + 5; if (p.x > IW + 5) p.x = -5;
      const bob = Math.floor((this.vt * 6 + p.off) % 2);
      const py = GROUND_Y + 4 + (i % 3) * 4;
      ctx.fillStyle = `hsl(${(i * 47) % 360},45%,${55 - night * 22}%)`;
      ctx.fillRect(Math.round(p.x), py - 6 + bob, 3, 4);
      ctx.fillStyle = mix('#e8c39a', '#5a4a3a', night * 0.4);
      ctx.fillRect(Math.round(p.x), py - 9 + bob, 3, 3);
    }

    // 马路
    ctx.fillStyle = mix('#3d4350', '#181b24', night * 0.5);
    ctx.fillRect(0, ROAD_Y, IW, IH - ROAD_Y);
    ctx.fillStyle = mix('#c9cf60', '#4a4d28', night * 0.5);
    for (let x = 0; x < IW; x += 24) ctx.fillRect(x + ((this.vt * 4) % 24), ROAD_Y + 19, 12, 2);

    // 车流
    for (const c of this.cars) {
      const dir = c.lane === 0 ? 1 : -1;
      c.x += dir * c.spd * dt;
      if (c.x > IW + 20) c.x = -20; if (c.x < -20) c.x = IW + 20;
      const cy = ROAD_Y + (c.lane === 0 ? 6 : 26);
      const x = Math.round(c.x);
      ctx.fillStyle = `hsl(${c.hue},55%,${52 - night * 18}%)`;
      ctx.fillRect(x, cy, 16, 6);
      ctx.fillRect(x + 3, cy - 3, 9, 4);
      ctx.fillStyle = mix('#bfe8ff', '#2a3a4a', night * 0.3);
      ctx.fillRect(x + 4, cy - 2, 3, 2); ctx.fillRect(x + 8, cy - 2, 3, 2);
      ctx.fillStyle = '#1a1d24';
      ctx.fillRect(x + 2, cy + 5, 3, 3); ctx.fillRect(x + 11, cy + 5, 3, 3);
      if (night > 0.4) {
        ctx.fillStyle = `rgba(255,240,180,${night})`;
        ctx.fillRect(dir > 0 ? x + 15 : x - 3, cy + 1, 4, 2);
      }
    }

    // 雨 / 雪
    if (raining) {
      ctx.strokeStyle = 'rgba(170,200,235,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const f of this.flakes) {
        f.y += 220 * f.s * dt; f.x -= 60 * f.s * dt;
        if (f.y > IH) { f.y = -4; f.x = Math.random() * (IW + 60); }
        ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + 2, f.y + 6);
      }
      ctx.stroke();
    } else if (season === 3) {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (const f of this.flakes) {
        f.y += 26 * f.s * dt; f.x += Math.sin(f.y * 0.08) * 12 * dt;
        if (f.y > IH) { f.y = -4; f.x = Math.random() * IW; }
        ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s > 0.9 ? 2 : 1, f.s > 0.9 ? 2 : 1);
      }
    }

    // 金钱飘字
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      if (p.t > 1.6) { this.pops.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, 1 - p.t / 1.6);
      ctx.fillStyle = p.color;
      ctx.font = 'bold 9px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y - p.t * 18);
      ctx.globalAlpha = 1;
    }
  }

  // ---------- 单地块 ----------
  _plot(state, p, i, season, night, selected, hovered) {
    const ctx = this.ctx;
    const x = PLOT_X0 + i * (PLOT_W + PLOT_GAP);

    if (p.b !== null && state.biz[p.b]) {
      this._building(state, state.biz[p.b], x, i, season, night, false);
    } else if (p.rb) {
      this._building(state, p.rb, x, i, season, night, true, p.o);
    } else if (p.o === 'me') { // 已购空地：招商围挡
      ctx.fillStyle = mix('#8a7a5c', '#3a3428', night * 0.5);
      ctx.fillRect(x, GROUND_Y - 8, PLOT_W, 8);
      ctx.fillStyle = mix('#3f7dc9', '#1a3050', night * 0.4);
      ctx.fillRect(x + 4, GROUND_Y - 34, PLOT_W - 8, 22);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('招商', x + PLOT_W / 2, GROUND_Y - 19);
      ctx.fillStyle = mix('#6b5a3f', '#2a2418', night * 0.5);
      ctx.fillRect(x + 8, GROUND_Y - 12, 3, 12); ctx.fillRect(x + PLOT_W - 11, GROUND_Y - 12, 3, 12);
    } else { // 荒地出售
      ctx.fillStyle = mix('#7a6a4c', '#332c1e', night * 0.5);
      ctx.fillRect(x, GROUND_Y - 6, PLOT_W, 6);
      ctx.fillStyle = mix(season === 3 ? '#b8c4cc' : '#6d9e4c', '#26301e', night * 0.5);
      for (let g = 0; g < 7; g++) ctx.fillRect(x + 2 + g * 5.5, GROUND_Y - 8 - (g % 3), 2, 3 + (g % 3));
      ctx.fillStyle = mix('#8a6a3f', '#382a18', night * 0.4);
      ctx.fillRect(x + PLOT_W / 2 - 1, GROUND_Y - 20, 2, 14);
      ctx.fillStyle = mix('#e8dbb0', '#5a5340', night * 0.4);
      ctx.fillRect(x + PLOT_W / 2 - 8, GROUND_Y - 27, 16, 12);
      ctx.fillStyle = '#7a3020';
      ctx.font = 'bold 9px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('售', x + PLOT_W / 2, GROUND_Y - 18);
    }

    if (selected || hovered) {
      ctx.strokeStyle = selected ? '#ffd54a' : 'rgba(255,255,255,.7)';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(x - 1.5, 62, PLOT_W + 3, GROUND_Y - 60);
      ctx.setLineDash([]);
      if (selected) { // 跳动箭头
        const by = 54 + Math.floor(Math.sin(this.vt * 5) * 3);
        ctx.fillStyle = '#ffd54a';
        ctx.fillRect(x + PLOT_W / 2 - 1, by, 4, 6);
        ctx.fillRect(x + PLOT_W / 2 - 4, by + 4, 10, 3);
      }
    }
  }

  // ---------- 建筑 ----------
  _building(state, b, x, plotIdx, season, night, isRival, rivalIdx) {
    const ctx = this.ctx;
    const t = TYPE_BY_ID[b.type];
    const pal = INDUSTRIES[t.ind].pal;
    const level = b.level || 1;
    const h = 44 + level * 14;
    const y = GROUND_Y - h;
    const w = PLOT_W - 4;
    const seed = plotIdx * 31 + (this.dist ? this.dist.length : 0) * 7;
    const wall = isRival ? '#7d838f' : mix(pal.w, shade(pal.w, 1.25), hash(seed) * 0.4);
    const dim = (c) => mix(c, '#12141c', night * 0.55);

    // 墙体
    ctx.fillStyle = dim(wall);
    ctx.fillRect(x + 2, y, w, h);
    ctx.fillStyle = dim(shade(wall, 0.8));
    ctx.fillRect(x + 2 + w - 4, y, 4, h);
    // 顶
    ctx.fillStyle = dim(isRival ? '#565b66' : pal.r);
    ctx.fillRect(x, y - 4, PLOT_W, 5);
    if (season === 3) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x, y - 5, PLOT_W, 2); }
    // 顶部装饰：科技天线 / 制造烟囱
    if (t.ind === 'tech') {
      ctx.fillStyle = dim('#9aa4b8'); ctx.fillRect(x + 8, y - 14, 2, 10);
      ctx.fillStyle = '#ff5f5f'; ctx.fillRect(x + 7, y - 16, 4, 3);
    } else if (t.ind === 'mfg') {
      ctx.fillStyle = dim('#6b6259'); ctx.fillRect(x + w - 8, y - 12, 6, 9);
      ctx.fillStyle = 'rgba(200,200,205,.5)';
      const st = (this.vt * 10 + plotIdx * 5) % 20;
      ctx.fillRect(x + w - 7 + st * 0.3, y - 14 - st, 4 - st * 0.12, 3);
    }

    // 窗（夜晚亮灯，按哈希点亮）
    const floors = Math.max(2, Math.floor((h - 22) / 13));
    for (let f = 0; f < floors; f++) {
      for (let c = 0; c < 3; c++) {
        const wx = x + 6 + c * 10, wy = y + 5 + f * 13;
        if (wy > GROUND_Y - 24) continue;
        const lit = night > 0.4 && hash(seed + f * 5 + c) > 0.4;
        ctx.fillStyle = lit ? '#ffd88a' : dim(mix('#cfe8f2', pal.a, 0.3));
        ctx.fillRect(wx, wy, 6, 7);
        ctx.fillStyle = dim(shade(wall, 0.7));
        ctx.fillRect(wx, wy + 3, 6, 1);
      }
    }

    // 招牌（首 2 字 + 行业图标）
    const signY = GROUND_Y - 22;
    ctx.fillStyle = dim(isRival ? '#4a4f5a' : pal.s);
    ctx.fillRect(x + 2, signY, w, 12);
    ctx.fillStyle = dim(shade(isRival ? '#4a4f5a' : pal.s, 0.7));
    ctx.fillRect(x + 2, signY + 10, w, 2);
    this._icon(t.ind, x + 4, signY + 2, night > 0.5 ? '#ffe9b0' : '#ffffff');
    ctx.fillStyle = night > 0.5 ? '#ffe9b0' : '#ffffff';
    ctx.font = 'bold 9px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(t.name.slice(0, 2), x + 14, signY + 9);

    // 门 + 雨棚
    ctx.fillStyle = dim('#3a2c1e');
    ctx.fillRect(x + PLOT_W / 2 - 4, GROUND_Y - 9, 8, 9);
    ctx.fillStyle = night > 0.4 ? 'rgba(255,220,140,.85)' : dim('#5a4634');
    ctx.fillRect(x + PLOT_W / 2 - 3, GROUND_Y - 8, 6, 7);
    if (['food', 'retail', 'service'].includes(t.ind)) {
      for (let s = 0; s < 8; s++) {
        ctx.fillStyle = s % 2 ? dim('#f2f2f2') : dim(pal.a);
        ctx.fillRect(x + 3 + s * 4.2, GROUND_Y - 24 + 2, 4, 3);
      }
    }

    // 等级星徽
    for (let s = 0; s < level; s++) {
      ctx.fillStyle = '#ffd54a';
      ctx.fillRect(x + 4 + s * 5, y + 2, 3, 3);
    }

    // 对手旗标
    if (isRival) {
      const col = RIVALS[rivalIdx] ? RIVALS[rivalIdx].color : '#e05555';
      ctx.fillStyle = col;
      ctx.fillRect(x + 2, y, 4, h);
      ctx.fillRect(x + w - 4, y - 10, 2, 8);
      ctx.fillRect(x + w - 4, y - 10, 8, 4);
    }

    // 停业封条
    if (b.closedUntil && b.closedUntil > state.day) {
      ctx.fillStyle = 'rgba(220,60,50,.85)';
      ctx.fillRect(x, GROUND_Y - 16, PLOT_W, 7);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 7px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('停业整顿', x + PLOT_W / 2, GROUND_Y - 10);
    }
  }

  _icon(ind, x, y, color) {
    const rows = IND_ICONS[ind];
    if (!rows) return;
    this.ctx.fillStyle = color;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (rows[r] & (0x80 >> c)) this.ctx.fillRect(x + c, y + r, 1, 1);
      }
    }
  }
}
