// 剧情任务“黑石行动”：渗透 → 破门 → 守护下载 → 安放炸药 → 限时撤离。

import * as THREE from 'three';
import { drawServerScreen } from '../world/textures.js';

const R = (text, who = '指挥部 · 雷诺', extra = {}) => ({ who, text, ...extra });
const V = (text) => ({ who: 'VEGA', text, red: true });
const H = (text) => ({ who: '鹰眼', text, color: '#a8ff7a' });

export class Mission {
  constructor(G) {
    this.G = G;
    this.id = 'mission';
  }

  start() {
    const G = this.G, M = G.markers;
    this.phase = 'infiltrate';
    this.t = 0;
    this.planted = [false, false, false];
    this.progress = 0;
    this.waves = [];
    this.reinforceT = 0;
    this.extractT = 90;
    this.charges = [];
    G.enemies.huntMode = false;
    // 门与补给
    G.doors.gate.setOpen(false, true);
    G.doors.reactor.setOpen(false, true);
    G.doors.fence.setOpen(false, true);
    G.supplies.setUses(1);
    // 武器拾取
    for (const w of M.weaponPickups) G.pickups.spawn('weapon:' + w.weapon, w.x, w.top, w.z, { fixed: true, yaw: w.yaw });
    // 散落补给
    G.pickups.spawn('ammo', -12.4, 0, 33.4);
    G.pickups.spawn('armor', 11.9, 0, 35.3);
    G.pickups.spawn('health', -29.2, 0, 21.6);
    G.pickups.spawn('grenade', 24, 0, 1.4);
    G.pickups.spawn('ammo', 0, 0, -6.4);
    G.pickups.spawn('health', 24, 0, 26);
    G.pickups.spawn('armor', -38.2, 4.2, -2);
    G.pickups.spawn('ammo', 10.8, 0, -36.2);

    // 外围敌人
    const S = M.spawns;
    G.enemies.spawn('sentinel', S.out_guard.x, 0, S.out_guard.z, { yaw: Math.PI * 0.9, spawnFx: false, guard: true });
    G.enemies.spawn('sentinel', -14, 0, 36, { spawnFx: false, patrol: [{ x: -14, z: 36 }, { x: -4, z: 34 }, { x: -6, z: 44 }, { x: -18, z: 44 }] });
    G.enemies.spawn('sentinel', 17, 0, 47, { spawnFx: false, patrol: [{ x: 17, z: 47 }, { x: 6, z: 50 }, { x: 15, z: 38 }] });
    G.enemies.spawn('hound', -18, 0, 52, { spawnFx: false, yaw: 0.5 });
    // 庭院内（闸门关闭，尚未警觉）
    this.courtyard = [
      ['sentinel', S.court_sw, { patrol: [S.court_sw, S.court_mid, { x: -6, z: 26 }] }],
      ['sentinel', S.court_se, { yaw: Math.PI }],
      ['sentinel', { x: -2, y: 0, z: 2 }, { patrol: [{ x: -2, z: 2 }, { x: 14, z: 2 }, { x: 10, z: 12 }] }],
      ['sentinel', { x: 9, y: 5.2, z: 18 }, { yaw: Math.PI, guard: true }],
      ['hound', { x: 4, y: 0, z: 10 }, {}],
      ['hound', { x: -10, y: 0, z: 6 }, {}],
      ['sentinel', S.court_e, { yaw: Math.PI / 2 }],
    ];
    for (const [type, p, o] of this.courtyard) G.enemies.spawn(type, p.x, p.y ?? 0, p.z, { spawnFx: false, ...o });
    // C2 守卫
    G.enemies.spawn('sentinel', 22, 0, 22, { spawnFx: false, yaw: -Math.PI / 2 });
    G.enemies.spawn('sentinel', 33.5, 0, 9, { spawnFx: false, yaw: Math.PI });
    G.enemies.spawn('sentinel', 34, 0, 21, { spawnFx: false, patrol: [{ x: 34, z: 21 }, { x: 31, z: 27 }, { x: 37, z: 16 }] });
    // 仓库
    G.enemies.spawn('sentinel', -38.2, 4.2, 8, { spawnFx: false, yaw: Math.PI / 2, patrol: [{ x: -38.2, y: 4.2, z: 8 }, { x: -38.2, y: 4.2, z: 24 }] });
    G.enemies.spawn('sentinel', -28, 0, 6.5, { spawnFx: false, patrol: [{ x: -28, z: 6.5 }, { x: -22, z: 18 }, { x: -34, z: 18 }] });

    // 交互点
    const gt = M.interact.gateTerminal;
    this.gateIt = G.interact.add({ x: gt.x, y: gt.y, z: gt.z, r: gt.r, hold: 2.5, prompt: '按住 [E] 骇入闸门控制台', onUse: () => this.gateHacked(), onStart: () => G.audio.play('hack_loop', { volume: 0.4, pos: gt }) });
    const st = M.interact.serverTerminal;
    this.serverIt = G.interact.add({ x: st.x, y: st.y, z: st.z, r: st.r, hold: 1.5, enabled: false, prompt: '按住 [E] 插入上传器，开始下载', onUse: () => this.startDownload() });
    this.pylonIts = M.pylons.map((py, i) => G.interact.add({ x: py.x, y: 1.2, z: py.z, r: py.r, hold: 2, enabled: false, prompt: '按住 [E] 安放炸药', onUse: () => this.plant(i) }));
    this.boardIt = G.interact.add({ x: M.helipad.x, y: 1.2, z: M.helipad.z, r: 5.5, hold: 1.2, enabled: false, prompt: '按住 [E] 登机撤离', onUse: () => this.board() });

    this.objective();
    G.hud.say([
      R('幽灵-1，这里是灰鸦指挥部。你已抵达黑石前哨站南侧峡谷。'),
      R('VEGA 封锁了整座基地。先骇入南墙闸门旁的控制台。'),
      R('外围有巡逻哨兵——能安静解决最好。它们没发现你之前不会开火。'),
    ]);
    G.hud.banner('黑石行动', '第一阶段 · 渗透', 3.5);
    drawServerScreen(G.T.screenBig, 0, '等待连接……');
  }

  objective() {
    const G = this.G, M = G.markers;
    const H2 = G.hud;
    switch (this.phase) {
      case 'infiltrate':
        H2.setObjective('目标 · 渗透', '骇入南墙闸门控制台<br><span class="dim">可选：清除外围巡逻</span>');
        H2.setWaypoint(M.interact.gateTerminal, '控制台');
        break;
      case 'breach':
        H2.setObjective('目标 · 突破', '穿过庭院，前往 <b>C2 控制中心</b> 机房<br><span class="dim">可选：A1 仓库军械库有霰弹枪；C2 办公区有狙击枪</span>');
        H2.setWaypoint(M.interact.serverTerminal, '机房');
        break;
      case 'download': {
        const inRange = this.inServerRange();
        H2.setObjective('目标 · 守住机房', `数据下载 <b>${Math.floor(this.progress * 100)}%</b>${inRange ? '' : '<br><span style="color:#ff6a55">信号中断：回到机房附近！</span>'}`, this.progress);
        H2.setWaypoint(M.interact.serverTerminal, '机房');
        break;
      }
      case 'reactor': {
        const n = this.planted.filter(Boolean).length;
        const lines = M.pylons.map((p, i) => `<span class="${this.planted[i] ? 'done' : ''}">冷却塔 ${['A', 'B', 'C'][i]}</span>`).join(' · ');
        H2.setObjective('目标 · 摧毁反应堆', `在冷却塔安放炸药 <b>${n}/3</b><br>${lines}`, n / 3);
        const next = M.pylons.findIndex((p, i) => !this.planted[i] && true);
        const nearest = this.nearestUnplanted();
        H2.setWaypoint(nearest >= 0 ? { x: M.pylons[nearest].x, y: 2, z: M.pylons[nearest].z } : null, '冷却塔');
        void next;
        break;
      }
      case 'extract':
        H2.setObjective('目标 · 撤离', G.heli.landed ? '直升机已着陆 —— <b>登机！</b>' : '反应堆即将过载，前往<b>东北停机坪</b>');
        H2.setWaypoint({ ...M.helipad, y: 2 }, '停机坪');
        break;
      default:
        H2.setObjective(null);
        H2.setWaypoint(null);
    }
  }

  nearestUnplanted() {
    const p = this.G.player.body.pos;
    let best = -1, bd = Infinity;
    this.G.markers.pylons.forEach((py, i) => {
      if (this.planted[i]) return;
      const d = Math.hypot(py.x - p.x, py.z - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  inServerRange() {
    const p = this.G.player.body.pos;
    const t = this.G.markers.interact.serverTerminal;
    return Math.hypot(p.x - t.x, p.z - t.z) < 13 && p.x > 18;
  }

  gateHacked() {
    const G = this.G;
    this.gateIt.enabled = false;
    this.phase = 'breach';
    G.doors.gate.setOpen(true);
    G.alarm(8);
    G.audio.play('objective', { volume: 0.7, reverb: false });
    // 庭院敌人警觉
    for (const e of G.enemies.list) {
      if (e.alive && e.body.pos.z < 29.4) {
        e.alerted = true;
        e.awareness = 1;
        e.knowsPlayer = true;
        e.lastSeen.set(0, 0, 32);
        e.lastSeenT = e.time;
        e.reaction = Math.max(e.reaction, 1.2);
      }
    }
    this.serverIt.enabled = true;
    G.hud.say([
      V('检测到未授权访问。欢迎，入侵者。你的心跳很快。'),
      R('闸门开了，警报也响了。直奔 C2 控制中心机房——庭院东侧那栋楼。'),
    ]);
    G.hud.banner('闸门已开启', '第二阶段 · 突破', 3);
    this.objective();
  }

  startDownload() {
    const G = this.G, S = G.markers.spawns;
    this.serverIt.enabled = false;
    this.phase = 'download';
    this.progress = 0;
    this.dlSnd = G.audio.play('hack_loop', { pos: G.markers.interact.serverTerminal, loop: true, volume: 0.35, ref: 3 });
    G.audio.play('objective', { volume: 0.6, reverb: false });
    G.hud.say([
      R('上传器已接入。下载期间守住机房——VEGA 会把能派的都派过来。'),
      V('你想带走我的一部分？那就留下你的全部。'),
    ]);
    G.hud.banner('数据下载开始', '第三阶段 · 守住机房', 3);
    // 波次：按下载进度触发
    this.waves = [
      { at: 0.04, spawns: [['sentinel', S.court_e], ['sentinel', S.court_c2], ['sentinel', { x: 30, z: -3 }]] },
      { at: 0.22, spawns: [['hound', S.court_n], ['hound', S.court_n], ['hound', { x: 14, z: -10 }]] },
      { at: 0.42, spawns: [['drone', S.ne_yard], ['drone', { x: 26, z: -12 }], ['sentinel', S.court_se], ['sentinel', { x: 14, z: 24 }]], say: [R('下载过半，坚持住！无人机从北面过来了。')] },
      { at: 0.64, spawns: [['sentinel', S.court_e], ['sentinel', S.court_mid], ['hound', S.court_c2], ['hound', S.court_e], ['sentinel', { x: 37, z: -8 }]] },
      { at: 0.85, spawns: [['drone', S.court_n], ['drone', S.court_e], ['sentinel', S.court_c2], ['hound', S.court_mid]], say: [V('……够了。')] },
    ];
    G.alarm(5);
  }

  completeDownload() {
    const G = this.G;
    this.phase = 'reactor';
    if (this.dlSnd) this.dlSnd.stop(0.2);
    drawServerScreen(G.T.screenBig, 1, '上传完成 · 病毒已注入');
    G.audio.play('objective', { volume: 0.8, reverb: false });
    G.doors.reactor.setOpen(true);
    for (const it of this.pylonIts) it.enabled = true;
    G.supplies.setUses(1);
    G.hud.say([
      R('数据到手！VEGA 的防火墙崩了一角。'),
      R('反应堆正门已经被你的病毒打开。去北面的反应堆大厅，在三座冷却塔上安放炸药。'),
      R('补给箱已重新解锁，需要的话去补充弹药。'),
    ]);
    G.hud.banner('下载完成', '第四阶段 · 摧毁反应堆', 3.2);
    const S = G.markers.spawns;
    G.enemies.spawn('sentinel', S.reac_walk_w.x, S.reac_walk_w.y, S.reac_walk_w.z, { spawnFx: false, yaw: 0.4, guard: true });
    G.enemies.spawn('sentinel', S.reac_walk_e.x, S.reac_walk_e.y, S.reac_walk_e.z, { spawnFx: false, yaw: -0.4, guard: true });
    G.enemies.spawn('sentinel', S.reac_walk_c.x, S.reac_walk_c.y, S.reac_walk_c.z, { spawnFx: false, yaw: 0, guard: true });
    G.enemies.spawn('sentinel', S.reac_w.x, 0, S.reac_w.z - 6, { spawnFx: false, yaw: 0.3 });
    G.enemies.spawn('sentinel', S.reac_e.x, 0, S.reac_e.z, { spawnFx: false, yaw: -0.3 });
    G.enemies.spawn('drone', 5, 0, -22, { spawnFx: false });
    G.enemies.spawn('drone', -6, 0, -36, { spawnFx: false });
    G.enemies.spawn('hound', 12, 0, -36, { spawnFx: false });
    this.objective();
  }

  plant(i) {
    const G = this.G, M = G.markers, S = M.spawns;
    if (this.planted[i]) return;
    this.planted[i] = true;
    this.pylonIts[i].enabled = false;
    const py = M.pylons[i];
    // 炸药包模型（闪烁红灯）
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.16), new THREE.MeshStandardMaterial({ color: 0x2a2f22, roughness: 0.7 }));
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.3, 0.2) }));
    led.position.set(0.1, 0.14, 0.06);
    g.add(box, led);
    const p = G.player.body.pos;
    const a = Math.atan2(p.x - py.x, p.z - py.z);
    g.position.set(py.x + Math.sin(a) * 0.92, 1.3, py.z + Math.cos(a) * 0.92);
    g.rotation.y = a;
    G.scene.add(g);
    this.charges.push({ g, led });
    G.audio.play('beep_warn', { pos: g.position, volume: 0.6 });
    const n = this.planted.filter(Boolean).length;
    if (n < 3) {
      G.hud.say([R(n === 1 ? '第一枚炸药就位。' : '还剩最后一座冷却塔。')]);
      G.enemies.spawn('hound', S.depot.x, 0, S.depot.z, { alerted: true });
      G.enemies.spawn('hound', -18, 0, -20.5, { alerted: true });
      if (n === 2) G.enemies.spawn('drone', S.ne_far.x, 0, S.ne_far.z, { alerted: true, dropIn: true });
    } else {
      this.startExtract();
    }
    this.objective();
  }

  startExtract() {
    const G = this.G, S = G.markers.spawns;
    this.phase = 'extract';
    this.extractT = 90;
    this.reinforceT = 4;
    G.doors.fence.setOpen(true);
    G.alarm(1e9);
    G.audio.play('objective', { volume: 0.8, reverb: false });
    G.hud.say([
      V('停下。……你不明白你在毁掉什么。'),
      R('全部就位，过载已启动！九十秒后整座基地都会被抹平！'),
      R('小心——大家伙出来了！别恋战，去东北停机坪！'),
      H('鹰眼进场。给我把着陆区清干净！'),
    ]);
    G.hud.banner('反应堆过载', '最终阶段 · 撤离', 3.2);
    G.enemies.spawn('heavy', -17, 0, -20.5, { alerted: true });
    G.enemies.spawn('drone', S.ne_far.x, 0, S.ne_far.z, { alerted: true, dropIn: true });
    G.enemies.spawn('drone', S.ne_yard.x, 0, S.ne_yard.z, { alerted: true, dropIn: true });
    G.enemies.huntMode = true;
    G.heli.arrive(G.markers.helipad, 30);
    G.env.coreAlarm = true;
  }

  board() {
    const G = this.G;
    if (!G.heli.landed) return;
    this.phase = 'done';
    this.boardIt.enabled = false;
    G.hud.say([R('干得漂亮，幽灵-1。黑石……从地图上抹掉了。')]);
    G.finish(true, '撤离成功', `剩余时间 ${Math.ceil(this.extractT)} 秒 · 黑石前哨站已被摧毁`);
  }

  update(dt) {
    const G = this.G, S = G.markers.spawns;
    this.t += dt;
    for (const c of this.charges) c.led.visible = Math.sin(this.t * (this.phase === 'extract' ? 18 : 6)) > 0;

    if (this.phase === 'breach') {
      // 玩家靠近机房：提醒
      if (!this.saidNear && this.inServerRange() && G.player.body.pos.x > 28) {
        this.saidNear = true;
        G.hud.say([R('终端在机房东墙。插上上传器就开始下载。')]);
      }
    }
    if (this.phase === 'download') {
      const inRange = this.inServerRange();
      if (inRange) this.progress = Math.min(1, this.progress + dt / 48);
      if (this.dlSnd) this.dlSnd.setVolume(inRange ? 0.35 : 0.0001);
      this.screenT = (this.screenT ?? 0) - dt;
      if (this.screenT <= 0) {
        this.screenT = 0.25;
        drawServerScreen(G.T.screenBig, this.progress, inRange ? '正在下载 VEGA 核心数据……' : '信号丢失 —— 等待上传器重连');
      }
      for (const w of this.waves) {
        if (!w.done && this.progress >= w.at) {
          w.done = true;
          for (const [type, p] of w.spawns) {
            const e = G.enemies.spawn(type, p.x, p.y ?? 0, p.z, { alerted: true, dropIn: type === 'drone' });
            e.lastSeen.copy(G.player.body.pos);
            e.reaction = 1;
          }
          if (w.say) G.hud.say(w.say);
        }
      }
      if (this.progress >= 1) this.completeDownload();
      this.objUpd = (this.objUpd ?? 0) - dt;
      if (this.objUpd <= 0) {
        this.objUpd = 0.2;
        this.objective();
      }
    }
    if (this.phase === 'reactor') {
      this.objUpd = (this.objUpd ?? 0) - dt;
      if (this.objUpd <= 0) {
        this.objUpd = 0.5;
        this.objective();
      }
    }
    if (this.phase === 'extract') {
      this.extractT -= dt;
      G.hud.setTimer(this.extractT);
      G.player.addTrauma(dt * 0.15 * (1 - this.extractT / 90));
      if (Math.floor(this.extractT) !== Math.floor(this.extractT + dt) && this.extractT < 15) G.audio.play('countdown', { volume: 0.5, reverb: false });
      // 持续增援
      this.reinforceT -= dt;
      if (this.reinforceT <= 0 && G.enemies.alive < 10) {
        this.reinforceT = 5.5;
        const pts = [S.depot, S.court_n, S.court_e, S.reac_s, S.ne_far];
        const p = pts[Math.floor(G.rng.next() * pts.length)];
        const type = G.rng.next() < 0.45 ? 'hound' : G.rng.next() < 0.5 ? 'drone' : 'sentinel';
        if (G.player.body.pos.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) > 16) G.enemies.spawn(type, p.x, p.y ?? 0, p.z, { alerted: true, dropIn: type === 'drone' });
      }
      if (G.heli.landed && !this.boardIt.enabled) {
        this.boardIt.enabled = true;
        G.hud.say([H('已着陆！上来，快！')]);
        this.objective();
      }
      this.objUpd = (this.objUpd ?? 0) - dt;
      if (this.objUpd <= 0) {
        this.objUpd = 0.5;
        this.objective();
      }
      if (this.extractT <= 0) {
        this.phase = 'done';
        G.reactorMeltdown();
      }
    }
  }

  onEnemyKilled() {}

  dispose() {
    for (const c of this.charges) this.G.scene.remove(c.g);
    this.charges.length = 0;
    if (this.dlSnd) this.dlSnd.stop(0.1);
  }
}
