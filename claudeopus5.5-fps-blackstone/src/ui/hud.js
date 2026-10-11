// HUD：准星、命中标记、受击方向、生命/护甲、弹药、指南针、雷达、目标、航点、击杀信息、字幕、横幅、交互提示。

import * as THREE from 'three';
import { clamp, formatTime, TAU, wrapAngle } from '../core/util.js';
import { MOVE } from '../world/collision.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(G) {
    this.G = G;
    this.root = $('hud');
    this.el = {
      cross: $('crosshair'),
      ch: ['t', 'b', 'l', 'r'].map((k) => $('crosshair').querySelector('.' + k)),
      hit: $('hitmarker'),
      dmg: $('dmgdirs'),
      objTitle: document.querySelector('#objective .obj-title'),
      objText: document.querySelector('#objective .obj-text'),
      objBar: document.querySelector('#objective .obj-bar'),
      objFill: document.querySelector('#objective .obj-bar i'),
      objective: $('objective'),
      compass: $('compass-canvas'),
      way: $('waypoint'),
      wayText: document.querySelector('#waypoint span'),
      feed: $('killfeed'),
      hpFill: document.querySelector('#vitals .hp i'),
      hpText: document.querySelector('#vitals .hp-num'),
      arFill: document.querySelector('#vitals .ar i'),
      arText: document.querySelector('#vitals .ar-num'),
      radar: $('radar-canvas'),
      wname: document.querySelector('#ammo .wname'),
      mag: document.querySelector('#ammo .mag'),
      reserve: document.querySelector('#ammo .reserve'),
      nades: document.querySelector('#ammo .nades'),
      ammo: $('ammo'),
      prompt: $('prompt'),
      promptText: document.querySelector('#prompt .ptext'),
      promptRing: document.querySelector('#prompt .pring'),
      sub: $('subtitle'),
      banner: $('banner'),
      bTitle: document.querySelector('#banner .b-title'),
      bSub: document.querySelector('#banner .b-sub'),
      picks: $('pickups'),
      timer: $('timer'),
      scope: $('scope'),
      lowhp: $('lowhp'),
      flash: $('hitflash'),
      fps: $('fps'),
      loc: $('location'),
      reloadHint: $('reloadhint'),
      score: $('score'),
      msg: $('flashmsg'),
      wave: $('wave'),
    };
    this.hitT = 0;
    this.hitKill = false;
    this.subQueue = [];
    this.subT = 0;
    this.bannerT = 0;
    this.msgT = 0;
    this.waypoint = null;
    this.timerValue = null;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.fpsShow = false;
    this.dmgEls = [];
    this.radarImg = null;
    this.feedItems = [];
    this._v = new THREE.Vector3();
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  /** 从碰撞体生成俯视图底图 */
  buildRadar(world, bounds) {
    const S = 3;
    const w = Math.ceil((bounds.maxX - bounds.minX) * S), h = Math.ceil((bounds.maxZ - bounds.minZ) * S);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(14,22,28,0.92)';
    x.fillRect(0, 0, w, h);
    const sorted = [...world.colliders].filter((k) => k.flags & MOVE).sort((a, b) => a.y1 - b.y1);
    for (const k of sorted) {
      const tall = k.y1 - k.y0;
      if (k.y0 > 6) continue;
      let col;
      if (k.y1 > 4.6 && tall > 2.5) col = 'rgba(120,150,165,0.95)';
      else if (k.y1 > 2.2) col = 'rgba(80,104,116,0.95)';
      else if (k.y1 > 0.6) col = 'rgba(56,72,82,0.95)';
      else col = 'rgba(40,52,60,0.9)';
      if (k.kind === 1) col = 'rgba(60,90,96,0.9)';
      x.fillStyle = col;
      x.fillRect((k.x0 - bounds.minX) * S, (k.z0 - bounds.minZ) * S, Math.max(1, (k.x1 - k.x0) * S), Math.max(1, (k.z1 - k.z0) * S));
    }
    this.radarImg = c;
    this.radarScale = S;
    this.radarBounds = bounds;
  }

  setObjective(title, text, progress = -1) {
    this.el.objTitle.textContent = title || '';
    this.el.objText.innerHTML = text || '';
    this.el.objBar.style.display = progress >= 0 ? 'block' : 'none';
    if (progress >= 0) this.el.objFill.style.width = `${clamp(progress, 0, 1) * 100}%`;
    this.el.objective.style.display = title ? 'block' : 'none';
  }

  setWaypoint(p, label = '') {
    this.waypoint = p ? { x: p.x, y: p.y ?? 1.5, z: p.z, label } : null;
  }

  setTimer(sec) {
    this.timerValue = sec;
  }

  setWave(text) {
    this.el.wave.textContent = text || '';
    this.el.wave.style.display = text ? 'block' : 'none';
  }

  setScore(text) {
    this.el.score.textContent = text || '';
  }

  hitmarker(kill, head) {
    this.hitT = kill ? 0.35 : 0.18;
    this.hitKill = kill;
    this.el.hit.className = kill ? 'show kill' : head ? 'show head' : 'show';
  }

  killfeed(text, head) {
    const d = document.createElement('div');
    d.className = 'kf' + (head ? ' head' : '');
    d.innerHTML = text;
    this.el.feed.prepend(d);
    this.feedItems.push({ d, t: 4.5 });
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
  }

  pickup(text, color = '#fff') {
    const d = document.createElement('div');
    d.className = 'pk';
    d.style.color = color;
    d.textContent = text;
    this.el.picks.prepend(d);
    setTimeout(() => d.classList.add('out'), 1800);
    setTimeout(() => d.remove(), 2400);
  }

  banner(title, sub = '', dur = 3) {
    this.el.bTitle.textContent = title;
    this.el.bSub.textContent = sub;
    this.el.banner.classList.add('show');
    this.bannerT = dur;
  }

  flashMessage(text, dur = 1.5) {
    this.el.msg.textContent = text;
    this.el.msg.classList.add('show');
    this.msgT = dur;
  }

  /** 无线电字幕：{who, text, dur, color, red} */
  say(lines) {
    for (const l of lines) this.subQueue.push(l);
  }

  clearSubs() {
    this.subQueue.length = 0;
    this.subT = 0;
    this.el.sub.classList.remove('show');
  }

  prompt(text, progress = -1) {
    if (!text) {
      this.el.prompt.classList.remove('show');
      return;
    }
    this.el.prompt.classList.add('show');
    this.el.promptText.textContent = text;
    if (progress >= 0) {
      this.el.promptRing.style.display = 'block';
      this.el.promptRing.style.background = `conic-gradient(#7fe3ff ${progress * 360}deg, rgba(255,255,255,0.12) 0deg)`;
    } else this.el.promptRing.style.display = 'none';
  }

  flashDamage(k) {
    this.el.flash.style.opacity = String(Math.min(0.55, k));
    this.flashT = 0.25;
  }

  update(dt, cam) {
    const G = this.G, p = G.player, A = G.arsenal, el = this.el;
    // 帧率
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      el.fps.textContent = this.fpsShow ? `${Math.round(this.fpsN / this.fpsAcc)} FPS` : '';
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    // 生命护甲
    el.hpFill.style.width = `${(p.health / p.maxHealth) * 100}%`;
    el.hpText.textContent = Math.ceil(p.health);
    el.arFill.style.width = `${(p.armor / p.maxArmor) * 100}%`;
    el.arText.textContent = Math.ceil(p.armor);
    const low = p.health < 35 && p.alive;
    el.hpFill.parentElement.classList.toggle('low', low);
    const lowK = p.alive ? clamp((40 - p.health) / 40, 0, 1) : 1;
    el.lowhp.style.opacity = String(lowK * (0.65 + 0.35 * Math.sin(performance.now() / 260)));

    // 弹药
    const w = A.def, a = A.clip;
    el.wname.textContent = w.name;
    el.mag.textContent = a.mag;
    el.reserve.textContent = `/ ${a.reserve}`;
    el.mag.classList.toggle('low', a.mag <= Math.ceil(w.mag * 0.25));
    el.nades.innerHTML = '◆'.repeat(A.grenades) + '<span class="off">' + '◇'.repeat(Math.max(0, 4 - A.grenades)) + '</span>';
    const rp = A.reloadProgress();
    if (rp >= 0) {
      el.reloadHint.textContent = '换弹中';
      el.reloadHint.className = 'show busy';
    } else if (a.mag === 0 && a.reserve === 0) {
      el.reloadHint.textContent = '弹药耗尽';
      el.reloadHint.className = 'show warn';
    } else if (a.mag <= Math.ceil(w.mag * 0.25) && a.reserve > 0) {
      el.reloadHint.textContent = '[R] 换弹';
      el.reloadHint.className = 'show';
    } else el.reloadHint.className = '';

    // 准星（散布 → 像素）
    const sniperScope = !!(w.scope && A.ads > 0.85);
    el.scope.classList.toggle('show', sniperScope);
    const hideCross = sniperScope || (A.ads > 0.6 && !w.spread.cone) || p.sprinting || !p.alive;
    el.cross.style.opacity = hideCross ? '0' : '1';
    const spread = A.currentSpread();
    const fov = cam.fov;
    const px = (Math.tan((spread * Math.PI) / 360 + 1e-4) / Math.tan((fov * Math.PI) / 360)) * (window.innerHeight / 2);
    const gap = 4 + px;
    el.ch[0].style.transform = `translate(-50%, ${-gap - 10}px)`;
    el.ch[1].style.transform = `translate(-50%, ${gap}px)`;
    el.ch[2].style.transform = `translate(${-gap - 10}px, -50%)`;
    el.ch[3].style.transform = `translate(${gap}px, -50%)`;

    // 命中标记
    this.hitT -= dt;
    if (this.hitT <= 0) el.hit.className = '';

    // 受击方向
    for (let i = 0; i < p.damageDirs.length; i++) {
      let d = this.dmgEls[i];
      if (!d) {
        d = document.createElement('div');
        d.className = 'dd';
        el.dmg.appendChild(d);
        this.dmgEls.push(d);
      }
      const dd = p.damageDirs[i];
      const rel = wrapAngle(dd.ang - (p.yaw + Math.PI));
      const age = p.time - dd.t;
      d.style.display = 'block';
      d.style.transform = `rotate(${-rel}rad)`;
      d.style.opacity = String(clamp(1 - age / 1.6, 0, 1) * (0.5 + dd.k * 0.5));
    }
    for (let i = p.damageDirs.length; i < this.dmgEls.length; i++) this.dmgEls[i].style.display = 'none';
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) el.flash.style.opacity = '0';
    }

    // 击杀信息淡出
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const f = this.feedItems[i];
      f.t -= dt;
      if (f.t < 0.6) f.d.style.opacity = String(Math.max(0, f.t / 0.6));
      if (f.t <= 0) {
        f.d.remove();
        this.feedItems.splice(i, 1);
      }
    }

    // 字幕队列
    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) el.sub.classList.remove('show');
    } else if (this.subQueue.length) {
      const l = this.subQueue.shift();
      el.sub.innerHTML = `<b style="color:${l.color || (l.red ? '#ff5a4a' : '#7fe3ff')}">${l.who}</b>${l.text}`;
      el.sub.classList.toggle('red', !!l.red);
      el.sub.classList.add('show');
      this.subT = l.dur ?? Math.max(2.6, l.text.length * 0.13);
      if (!l.silent) G.audio.play(l.red ? 'beep_warn' : 'radio', { volume: 0.45, reverb: false });
    }

    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) el.banner.classList.remove('show');
    }
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) el.msg.classList.remove('show');
    }

    // 倒计时
    if (this.timerValue !== null && this.timerValue !== undefined) {
      el.timer.style.display = 'block';
      el.timer.textContent = formatTime(Math.ceil(this.timerValue));
      el.timer.classList.toggle('urgent', this.timerValue < 20);
    } else el.timer.style.display = 'none';

    // 地点
    el.loc.textContent = G.zoneName || '';

    this.drawCompass(p);
    this.drawWaypoint(cam);
    this.drawRadar(p);
  }

  drawCompass(p) {
    const c = this.el.compass;
    const x = c.getContext('2d');
    const w = c.width, h = c.height;
    x.clearRect(0, 0, w, h);
    // 航向：yaw=0 朝 -z（北）。屏幕右侧为顺时针方向
    const heading = wrapAngle(-p.yaw);
    const pxPerRad = w / (Math.PI * 0.9);
    x.font = 'bold 13px Consolas, "Microsoft YaHei", monospace';
    x.textAlign = 'center';
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const d = wrapAngle(a - heading);
      const sx = w / 2 + d * pxPerRad;
      if (sx < -20 || sx > w + 20) continue;
      const major = deg % 90 === 0;
      const edge = 1 - Math.min(1, Math.abs(sx - w / 2) / (w / 2));
      x.globalAlpha = 0.25 + 0.75 * edge;
      x.fillStyle = major ? '#e9f6ff' : 'rgba(220,240,255,0.7)';
      if (major || deg % 45 === 0) {
        const lab = { 0: '北', 90: '东', 180: '南', 270: '西', 45: '东北', 135: '东南', 225: '西南', 315: '西北' }[deg];
        x.fillText(lab, sx, 16);
      } else {
        x.fillRect(sx - 0.5, 6, 1, 7);
        x.font = '10px Consolas, monospace';
        x.fillText(String(deg), sx, 24);
        x.font = 'bold 13px Consolas, "Microsoft YaHei", monospace';
      }
    }
    x.globalAlpha = 1;
    // 目标标记
    const wp = this.waypoint;
    if (wp) {
      const a = Math.atan2(wp.x - p.body.pos.x, -(wp.z - p.body.pos.z));
      const d = wrapAngle(a - heading);
      const sx = clamp(w / 2 + d * pxPerRad, 6, w - 6);
      x.fillStyle = '#ffd25a';
      x.beginPath();
      x.moveTo(sx, 28);
      x.lineTo(sx - 6, 22);
      x.lineTo(sx, 16);
      x.lineTo(sx + 6, 22);
      x.closePath();
      x.fill();
    }
    x.fillStyle = '#7fe3ff';
    x.fillRect(w / 2 - 1, 0, 2, 5);
  }

  drawWaypoint(cam) {
    const wp = this.waypoint, el = this.el.way;
    if (!wp) {
      el.style.display = 'none';
      return;
    }
    const v = this._v.set(wp.x, wp.y, wp.z);
    const dist = v.distanceTo(cam.position);
    v.project(cam);
    let sx = (v.x * 0.5 + 0.5) * window.innerWidth;
    let sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
    const behind = v.z > 1;
    if (behind) {
      sx = window.innerWidth - sx;
      sy = window.innerHeight * 0.85;
    }
    const m = 50;
    sx = clamp(sx, m, window.innerWidth - m);
    sy = clamp(sy, m + 40, window.innerHeight - m - 60);
    el.style.display = 'block';
    el.style.transform = `translate(${sx}px, ${sy}px)`;
    this.el.wayText.textContent = `${wp.label ? wp.label + ' · ' : ''}${Math.round(dist)}m`;
    el.style.opacity = dist < 3 ? '0.35' : '1';
  }

  drawRadar(p) {
    const c = this.el.radar;
    if (!this.radarImg) return;
    const x = c.getContext('2d');
    const w = c.width, h = c.height;
    const R = w / 2;
    const S = this.radarScale;
    const B = this.radarBounds;
    const range = 34; // 半径（米）
    const k = R / range;
    x.save();
    x.clearRect(0, 0, w, h);
    x.beginPath();
    x.arc(R, R, R - 1, 0, TAU);
    x.clip();
    x.fillStyle = 'rgba(8,14,18,0.85)';
    x.fillRect(0, 0, w, h);
    x.translate(R, R);
    x.rotate(p.yaw);
    x.scale(k / S, k / S);
    x.globalAlpha = 0.9;
    x.drawImage(this.radarImg, -(p.body.pos.x - B.minX) * S, -(p.body.pos.z - B.minZ) * S);
    x.globalAlpha = 1;
    x.restore();
    x.save();
    x.beginPath();
    x.arc(R, R, R - 1, 0, TAU);
    x.clip();
    const toScreen = (wx, wz) => {
      const dx = wx - p.body.pos.x, dz = wz - p.body.pos.z;
      const c0 = Math.cos(p.yaw), s0 = Math.sin(p.yaw);
      const rx = dx * c0 - dz * s0;
      const rz = dx * s0 + dz * c0;
      return [R + rx * k, R + rz * k];
    };
    // 敌人：近距离或刚开火的才显示
    for (const e of this.G.enemies.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.body.pos.x - p.body.pos.x, e.body.pos.z - p.body.pos.z);
      const firing = e.burst > 0 || e.gunT > 0 || e.charge > 0 || e.telegraph > 0;
      if (!(d < 14 || firing || e.revealT > 0)) continue;
      const [sx, sy] = toScreen(e.body.pos.x, e.body.pos.z);
      x.fillStyle = e.type === 'heavy' ? '#ff3a2a' : '#ff6a55';
      x.beginPath();
      x.arc(sx, sy, e.type === 'heavy' ? 5 : 3.2, 0, TAU);
      x.fill();
    }
    // 掉落物
    for (const it of this.G.pickups.list) {
      if (!it.kind.startsWith('weapon:')) continue;
      const [sx, sy] = toScreen(it.base.position.x, it.base.position.z);
      x.fillStyle = '#ffffff';
      x.fillRect(sx - 2.5, sy - 2.5, 5, 5);
    }
    // 目标
    const wp = this.waypoint;
    if (wp) {
      let [sx, sy] = toScreen(wp.x, wp.z);
      const dx = sx - R, dy = sy - R;
      const dl = Math.hypot(dx, dy);
      if (dl > R - 8) {
        sx = R + (dx / dl) * (R - 8);
        sy = R + (dy / dl) * (R - 8);
      }
      x.fillStyle = '#ffd25a';
      x.beginPath();
      x.moveTo(sx, sy - 6);
      x.lineTo(sx + 5, sy);
      x.lineTo(sx, sy + 6);
      x.lineTo(sx - 5, sy);
      x.closePath();
      x.fill();
    }
    x.restore();
    // 玩家与视野扇形
    x.fillStyle = 'rgba(127,227,255,0.12)';
    x.beginPath();
    x.moveTo(R, R);
    x.arc(R, R, R * 0.8, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6);
    x.closePath();
    x.fill();
    x.fillStyle = '#7fe3ff';
    x.beginPath();
    x.moveTo(R, R - 7);
    x.lineTo(R + 5, R + 5);
    x.lineTo(R, R + 2);
    x.lineTo(R - 5, R + 5);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(127,227,255,0.45)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(R, R, R - 1.5, 0, TAU);
    x.stroke();
  }
}
