// 生存模式：无尽波次，波间补给，第 5 的倍数波出现主宰者。

import * as THREE from 'three';
import { TYPES } from '../ai/enemies.js';
import { SIGHT } from '../world/collision.js';

const SPAWN_IDS = ['depot', 'depot_w', 'depot_n', 'wh_mid', 'wh_n', 'wh_s', 'ctrl_office', 'ctrl_sec', 'reac_w', 'reac_e', 'reac_s', 'ne_yard', 'ne_far', 'court_e', 'court_w', 'court_n', 'out_road', 'out_truck', 'out_rocks'];

export class Survival {
  constructor(G) {
    this.G = G;
    this.id = 'survival';
  }

  start() {
    const G = this.G, M = G.markers;
    this.wave = 0;
    this.state = 'intermission';
    this.timer = 8;
    this.queue = [];
    this.spawnT = 0;
    this.score = 0;
    this.best = Number(localStorage.getItem('blackstone.best') || 0);
    G.doors.gate.setOpen(true, true);
    G.doors.reactor.setOpen(true, true);
    G.doors.fence.setOpen(true, true);
    G.enemies.huntMode = true;
    G.supplies.setUses(1);
    G.arsenal.give('shotgun');
    G.arsenal.give('sniper');
    G.arsenal.switchTo('rifle');
    G.arsenal.grenades = 3;
    G.player.armor = 50;
    for (const w of M.weaponPickups) void w;
    G.hud.setWave('准备');
    G.hud.banner('生存模式', '守住黑石 · 第 1 波即将到来', 3);
    G.hud.say([{ who: 'VEGA', text: '你喜欢这里？那就永远留下来。', red: true }]);
    this.updateHud();
  }

  composition(n) {
    const q = [];
    const sent = 3 + n;
    const hounds = n >= 2 ? Math.floor(n * 0.8) : 0;
    const drones = n >= 3 ? Math.floor((n - 1) / 2) : 0;
    const heavy = n % 5 === 0 ? Math.floor(n / 5) : 0;
    for (let i = 0; i < sent; i++) q.push('sentinel');
    for (let i = 0; i < hounds; i++) q.push('hound');
    for (let i = 0; i < drones; i++) q.push('drone');
    for (let i = 0; i < heavy; i++) q.push('heavy');
    // 打散（重装放后面）
    const rng = this.G.rng;
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    q.sort((a, b) => (a === 'heavy') - (b === 'heavy'));
    return q;
  }

  startWave() {
    const G = this.G;
    this.wave++;
    this.state = 'wave';
    this.queue = this.composition(this.wave);
    this.total = this.queue.length;
    this.spawnT = 0.5;
    G.hud.setWave(`第 ${this.wave} 波`);
    G.hud.banner(`第 ${this.wave} 波`, this.wave % 5 === 0 ? '主宰者来袭' : `${this.total} 个目标`, 2.5);
    G.audio.play('alarm', { volume: 0.25, reverb: false });
    this.updateHud();
  }

  pickSpawn() {
    const G = this.G, S = G.markers.spawns, p = G.player.body.pos;
    const cands = [];
    for (const id of SPAWN_IDS) {
      const s = S[id];
      if (!s) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < 20) continue;
      const hidden = !G.world.segmentClear(s.x, (s.y ?? 0) + 1.6, s.z, p.x, p.y + 1.5, p.z, SIGHT);
      cands.push({ s, score: (hidden ? 30 : 0) - Math.abs(d - 32) + G.rng.next() * 18 });
    }
    cands.sort((a, b) => b.score - a.score);
    return cands.length ? cands[0].s : S.depot;
  }

  update(dt) {
    const G = this.G;
    if (this.state === 'intermission') {
      this.timer -= dt;
      G.hud.setObjective('生存模式', `下一波倒计时 <b>${Math.ceil(this.timer)}</b> 秒<br><span class="dim">补给箱已刷新 · 武器已补给</span>`);
      if (this.timer <= 0) this.startWave();
      return;
    }
    // 生成
    const maxAlive = 6 + Math.min(10, this.wave);
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0 && G.enemies.alive < maxAlive) {
      const type = this.queue.shift();
      const s = this.pickSpawn();
      const e = G.enemies.spawn(type, s.x + (G.rng.next() - 0.5) * 2, s.y ?? 0, s.z + (G.rng.next() - 0.5) * 2, { alerted: true, dropIn: type === 'drone', hpMul: 1 + Math.max(0, this.wave - 6) * 0.06 });
      e.lastSeen.copy(G.player.body.pos);
      this.spawnT = Math.max(0.6, 2.2 - this.wave * 0.12) + G.rng.next();
    }
    const remaining = this.queue.length + G.enemies.alive;
    G.hud.setObjective(`第 ${this.wave} 波`, `剩余敌人 <b>${remaining}</b> / ${this.total}`, 1 - remaining / this.total);
    if (!this.queue.length && G.enemies.alive === 0) this.waveCleared();
  }

  waveCleared() {
    const G = this.G;
    this.state = 'intermission';
    this.timer = 14;
    const bonus = 400 * this.wave;
    this.score += bonus;
    G.supplies.setUses(1);
    G.arsenal.addAmmo(0.25, 1);
    G.player.heal(30);
    G.player.addArmor(25);
    G.audio.play('objective', { volume: 0.7, reverb: false });
    G.hud.banner(`第 ${this.wave} 波 清除`, `奖励 +${bonus} · 生命与护甲已补充`, 3);
    G.hud.setWave(`第 ${this.wave} 波 ✓`);
    if (this.wave % 3 === 0) {
      const S = G.markers.spawns;
      G.pickups.spawn('armor', S.court_mid.x, 0, S.court_mid.z, { life: 40 });
      G.pickups.spawn('health', S.court_c2.x, 0, S.court_c2.z, { life: 40 });
    }
    this.updateHud();
  }

  onEnemyKilled(e, info) {
    this.score += TYPES[e.type].score + (info.headshot ? 50 : 0);
    this.updateHud();
  }

  updateHud() {
    this.G.hud.setScore(`得分 ${this.score}   最高 ${Math.max(this.best, this.score)}`);
  }

  end() {
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('blackstone.best', String(this.score));
      localStorage.setItem('blackstone.bestWave', String(this.wave));
    }
  }

  dispose() {}
}

export { THREE };
