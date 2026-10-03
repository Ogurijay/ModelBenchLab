// HUD：液晶仪表、计时、名次、追逐差距、漂移角与连击、水杯、五菱加成、进度条。
import { seg7, tachBar } from './lcd.js';
import { fmtTime, clamp } from '../core/math.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.root = $('hud');
    this.cupCanvas = $('cup-canvas');
    this.cupCtx = this.cupCanvas.getContext('2d');
    this.flashT = 0; this.last = {};
    this.glitch = 0;
  }
  show(on) { this.root.classList.toggle('hidden', !on); }

  set(id, html) { if (this.last[id] !== html) { this.last[id] = html; $(id).innerHTML = html; } }

  update(dt, sess, extra = {}) {
    const p = sess.player, sim = p.sim;
    let kmh = Math.round(sim.kmh);
    // 518 km/h 测速故障彩蛋：只改显示，不改速度向量
    if (extra.glitch > 0) kmh = 518;
    this.set('hud-speed', seg7(String(kmh).padStart(3, ' '), extra.glitch > 0 ? { on: '#ff6a6a', off: 'rgba(255,106,106,0.08)' } : undefined));
    this.set('hud-tach', tachBar(clamp(sim.rpm / 9000, 0, 1)));
    this.set('hud-gear', seg7(sim.gear < 0 ? 'R' : String(sim.gear)));
    this.set('hud-time', seg7(fmtTime(sess.raceTime).replace(/^0:/, ' ')));
    const total = sess.racers.length;
    const showPos = total > 1 && !sess.cfg.hidePos;
    $('hud-pos-box').style.display = showPos ? '' : 'none';
    if (showPos) this.set('hud-pos', `${p.rank}<small>/${total}</small>`);
    // 差距
    let gapTxt = '';
    if (sess.chase) gapTxt = `追逐差距 ${Math.round(sess.chase.gap ?? 0)} m / 胜利线 ${sess.chase.gapWin} m`;
    else if (total > 1) {
      const ahead = sess.sorted[p.rank - 2], behind = sess.sorted[p.rank];
      if (ahead) gapTxt = `前车 ${ahead.name} ${Math.round(ahead.prog - p.prog)} m`;
      else if (behind) gapTxt = `领先 ${behind.name} ${Math.round(p.prog - behind.prog)} m`;
    }
    this.set('hud-gap', gapTxt);
    // 漂移
    const ang = Math.round(Math.abs(sim.beta) * 57.3);
    this.set('hud-drift', sim.drifting ? `漂移角 <b>${ang}°</b>${sim.combo > 1 ? ` · 连击 ×${sim.combo}` : ''}` : sim.inDitch ? '<b class="ditch">排水渠</b>' : sim.combo > 1 ? `连击 ×${sim.combo}` : '');
    this.set('hud-grip', `后轮抓地 ${Math.round(sim.rearGrip * 100)}%`);
    // 进度条
    const bar = $('hud-progress');
    let dots = '';
    for (const r of sess.racers) {
      const f = clamp(r.prog / sess.course.length, 0, 1);
      dots += `<i class="${r.isPlayer ? 'me' : ''}" style="bottom:${(f * 100).toFixed(1)}%;--c:#${r.spec.trail.toString(16).padStart(6, '0')}"></i>`;
    }
    if (this.last.prog !== dots) { this.last.prog = dots; bar.innerHTML = dots; }
    // 五菱
    if (p.wuling) this.set('hud-wuling', `遇强则强 +${Math.round(p.wuling.bonus * 100)}%${p.wuling.passengers ? ' · 乘客 +3%' : ''}`);
    else this.set('hud-wuling', '');
    this.set('hud-goal', extra.goal || '');
    // 水杯
    $('cup-box').style.display = sess.cup ? '' : 'none';
    if (sess.cup) this.drawCup(sess.cup);
    // 中央闪字
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) $('hud-flash').classList.remove('on'); }
  }

  flash(text, cls = '') {
    const el = $('hud-flash');
    el.className = 'on ' + cls; el.textContent = text;
    this.flashT = 1.2;
  }

  countdown(n) {
    const el = $('countdown');
    el.textContent = n; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  drawCup(cup) {
    const g = this.cupCtx, w = this.cupCanvas.width, h = this.cupCanvas.height;
    g.clearRect(0, 0, w, h);
    const cx = w / 2, top = 18, bot = h - 14, rTop = 34, rBot = 26;
    // 杯身
    g.save();
    g.beginPath(); g.moveTo(cx - rTop, top); g.lineTo(cx - rBot, bot); g.lineTo(cx + rBot, bot); g.lineTo(cx + rTop, top); g.closePath();
    g.clip();
    const lvl = cup.level;
    const yMid = bot - (bot - top) * 0.92 * lvl;
    const tilt = Math.tan(clamp(cup.tx, -1.2, 1.2)) * rTop;
    g.fillStyle = 'rgba(120,190,255,0.75)';
    g.beginPath(); g.moveTo(cx - rTop, yMid + tilt); g.lineTo(cx + rTop, yMid - tilt); g.lineTo(cx + rTop, bot); g.lineTo(cx - rTop, bot); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(230,245,255,0.95)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx - rTop, yMid + tilt); g.lineTo(cx + rTop, yMid - tilt); g.stroke();
    g.restore();
    g.strokeStyle = '#e8eef5'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(cx - rTop, top); g.lineTo(cx - rBot, bot); g.lineTo(cx + rBot, bot); g.lineTo(cx + rTop, top); g.stroke();
    // 水滴
    g.fillStyle = 'rgba(140,200,255,0.9)';
    for (const d of cup.drops) { g.beginPath(); g.arc(cx + d.x * 70, top + d.y * 40, 2.5, 0, Math.PI * 2); g.fill(); }
    // 仪表台
    g.fillStyle = '#2a2d33'; g.fillRect(0, bot, w, h - bot);
    document.getElementById('cup-pct').textContent = `${Math.round(lvl * 100)}%`;
    document.getElementById('cup-box').classList.toggle('warn', lvl < 0.3);
  }
}
