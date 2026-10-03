// 总控：标题 → 剧情 / 自由赛；比赛事件 → 弹幕、音效、镜头、漫画分格；终章演出；测试接口 __bench。
import { Game } from './game.js';
import { Audio } from './audio/audio.js';
import { Danmaku, POOLS } from './ui/danmaku.js';
import { VN, titleCard, fullPanel } from './story/vn.js';
import { Cinema } from './ui/cinema.js';
import { jianziQTE } from './ui/qte.js';
import { Save } from './core/save.js';
import { storyRace } from './story/races.js';
import { CARS, CAR_ORDER, MODES, TRACK_ORDER, BALANCE_NOTE } from './car/specs.js';
import { COURSES } from './track/layout.js';
import { CHAPTER_PALETTE, PALETTES } from './fx/palette.js';
import { AIDriver, PERSONAS } from './race/ai.js';
import { fmtTime, rng, clamp } from './core/math.js';
import { SIM_DT } from './car/physics.js';
import STORY from './story/chapters.json';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const starStr = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const DEFAULT_PAL = { akina_down: 'night', akina_up: 'dusk', akina_rain: 'rain', route_out: 'finale' };
const PAL_LABEL = { auto: '默认', dawn: '黎明', noon: '盛夏', dusk: '黄昏', night: '夜', rain: '雨夜', finale: '清晨' };

class App {
  constructor() {
    this.game = new Game();
    this.audio = new Audio();
    this.save = new Save();
    this.danmaku = new Danmaku($('danmaku'));
    this.vn = new VN(this);
    this.cinema = new Cinema(this);
    this.fast = false;
    this.screen = 'title';
    this.raceDone = null;
    this.glitch = 0;
    this.applySettings();
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    document.body.classList.toggle('touch', this.isTouch);
    this.game.input.bindTouch($('touch'));
    $('touch-pause').addEventListener('click', () => this.togglePause());
    const unlockAudio = () => this.audio.init();
    addEventListener('pointerdown', unlockAudio); addEventListener('keydown', unlockAudio);
    addEventListener('keydown', (e) => this.onKey(e));
    addEventListener('blur', () => { if (this.screen === 'race' && !this.game.paused && !this.fast) this.togglePause(true); });
    this.free = { car: 'ae86', course: 'akina_down', mode: 'duel', opp: 'r32', sticker: false, passengers: false, tofu: false, pal: 'auto' };
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    // 隐藏标签页时 rAF 停止：用定时器兜底推进（测试与后台）
    setInterval(() => { if (performance.now() - this.last > 250) this.tick(performance.now()); }, 100);
    this.titleScreen();
    $('loading').classList.add('done');
  }

  applySettings() {
    const st = this.save.data.settings;
    this.danmaku.setUser(st.danmaku);
    this.audio.vol.master = st.volume; this.audio.vol.music = st.music;
    if (this.audio.master) this.audio.master.gain.value = st.volume;
  }

  // ———————————————————— 主循环
  loop(t) { this.tick(t); requestAnimationFrame((tt) => this.loop(tt)); }
  tick(t) {
    const dt = Math.min(0.1, Math.max(0, (t - this.last) / 1000)); this.last = t;
    this.frame(dt);
  }
  frame(dt) {
    const g = this.game, s = g.session;
    if (s && this.screen === 'race' && !g.paused) {
      // 518 km/h 测速故障彩蛋（只有宏光；固定 seed 可复现）
      if (s.player.spec.id === 'wuling' && s.player.sim.speed > 25 && s.rand() < dt * 0.004) this.glitch = 0.8;
      this.glitch = Math.max(0, this.glitch - dt);
      g.hudExtra = { goal: s.cfg.goal, glitch: this.glitch };
      this.audio.car(s.player.sim, !s.player.sim.engineBlown);
      const lead = s.player.rank === 1 ? 0.35 : 0;
      this.audio.intensity(clamp(0.25 + lead + s.player.sim.combo * 0.12 + (s.player.sim.drifting ? 0.15 : 0), 0, 1));
    } else if (!s || this.screen !== 'race') this.audio.engineOff();
    g.frame(dt);
    this.danmaku.update(dt);
    this.audio.tick(dt);
    g.input.endFrame();
  }

  onKey(e) {
    if (e.code === 'Escape' && this.screen === 'race') this.togglePause();
    if (e.code === 'KeyR' && this.screen === 'race' && this.game.session && !this.game.session.cfg.script) this.game.session.resetPlayer();
    if (!$('vn').classList.contains('hidden') && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ')) { e.preventDefault(); this.vn.advance(); }
  }

  togglePause(force) {
    const g = this.game;
    const on = force ?? !g.paused;
    g.paused = on;
    g.input.releaseAll();
    const el = $('pause');
    el.classList.toggle('hidden', !on);
    if (on) {
      el.innerHTML = `<div class="result-box"><h2>暂停</h2><div class="line">比赛已冻结，按键已释放。</div><div class="row-btns2">
        <button class="btn" id="p-resume">继续</button><button class="btn" id="p-restart">重新开始</button><button class="btn" id="p-quit">退出</button></div></div>`;
      $('p-resume').onclick = () => this.togglePause(false);
      $('p-restart').onclick = () => { this.togglePause(false); this.raceDone?.({ result: 'restart' }); };
      $('p-quit').onclick = () => { this.togglePause(false); this.raceDone?.({ result: 'quit' }); };
    }
  }

  toast(text) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = text;
    document.getElementById('app').appendChild(t); setTimeout(() => t.remove(), 2700);
  }

  // ———————————————————— 标题
  titleScreen() {
    this.screen = 'title';
    this.vn.show(false);
    this.danmaku.silence(false); this.danmaku.clear();
    this.game.setEmotional(false);
    this.game.setPalette('night');
    const s = this.game.startSession({ course: 'akina_down', mode: 'time', player: { car: 'ae86' }, opponents: [], countdown: 1e9 });
    this.game.cam.mode = 'orbit';
    this.game.showHud(false);
    this.showTouch(false);
    this.audio.setMusic('none');
    const sv = this.save;
    $('menu').innerHTML = `<div class="title-screen">
      <div class="title-logo">头文字D</div><div class="title-sub">秋名山 · 再快的86</div>
      <div class="menu-list">
        <button id="m-story">${sv.hasProgress ? '继续剧情' : '剧情模式'}<small>${sv.hasProgress ? '从' + (STORY.chapters[Math.min(13, sv.data.unlockedChapter)].num) + '继续' : '拓海一路赢到秋名山车神'}</small></button>
        <button id="m-chapters">章节选择<small>回看已解锁章节</small></button>
        <button id="m-free">自由赛<small>车库 · 赛道 · 赛制</small></button>
        <button id="m-settings">设置<small>弹幕 · 漂移辅助 · 音量</small></button>
        <button id="m-new">新游戏<small>清空主线进度与车库解锁</small></button>
      </div></div>
      <div class="menu-foot">自己和朋友玩的同人作品，不公开发布 · 角色用演员小名，车型用真实名称 · 全部画面与音乐程序化生成</div>`;
    $('m-story').onclick = () => this.runStoryFrom(Math.min(13, sv.data.unlockedChapter));
    $('m-chapters').onclick = () => this.chapterMenu();
    $('m-free').onclick = () => this.freeMenu();
    $('m-settings').onclick = () => this.settingsMenu();
    $('m-new').onclick = () => { if (confirm('确定开始新游戏？主线进度和车库解锁会被清空（设置保留）。')) { this.save.reset(); this.titleScreen(); this.toast('已重置存档'); } };
    $('m-story').focus();
  }

  chapterMenu() {
    const sv = this.save.data;
    const items = STORY.chapters.map((c) => {
      const open = c.id <= sv.unlockedChapter;
      const r = sv.chapters[c.id];
      const tag = r === 'won' ? '<b>已胜</b>' : r === 'lost' ? '已完成（败）' : r === 'done' ? '<b>已完成</b>' : '';
      return `<div class="card ${open ? '' : 'locked'}" data-ch="${c.id}"><div class="nm">${c.num} · ${c.title}</div><div class="meta">${c.type}${c.motive ? ' · ' + c.motive : ''}<br>${tag}</div>${open ? '' : '<span class="lock">🔒</span>'}</div>`;
    }).join('');
    $('menu').innerHTML = `<div class="panel-screen"><h2>章节选择</h2><div class="grid ch-list">${items}</div>
      <p class="note">回看已完成章节不会改写已获得的成绩。</p><div class="row-btns"><button class="btn" id="b-back">返回</button></div></div>`;
    $('menu').querySelectorAll('.card:not(.locked)').forEach((el) => { el.onclick = () => this.runStoryFrom(+el.dataset.ch, true); });
    $('b-back').onclick = () => this.titleScreen();
  }

  settingsMenu() {
    const st = this.save.data.settings;
    $('menu').innerHTML = `<div class="panel-screen"><h2>设置</h2>
      <label class="toggle"><input type="checkbox" id="s-dm" ${st.danmaku ? 'checked' : ''}>显示弹幕（剧情静默不受此开关影响）</label>
      <label class="toggle"><input type="checkbox" id="s-as" ${st.assist ? 'checked' : ''}>漂移辅助（松开方向键时自动保持漂移角；关闭后需手动反打）</label>
      <label class="toggle">总音量 <input type="range" id="s-vol" min="0" max="1" step="0.05" value="${st.volume}"></label>
      <label class="toggle">音乐 <input type="range" id="s-mus" min="0" max="1" step="0.05" value="${st.music}"></label>
      <h3>操作</h3><p class="note">← → 转向 · ↑ 油门 · ↓ 刹车（停稳后倒车）· 空格 手刹 · R 复位 · Esc 暂停 · 空格/回车 推进对话<br>
      漂移：入弯前手刹或快速左右甩方向（重心转移）让后轮失去抓地；漂移中往弯里打加大角度，反打减小角度，松油门收角，回正后抓地逐渐恢复。<br>
      手柄：左摇杆转向，RT 油门，LT 刹车，A/X 手刹。触屏：屏幕按钮。</p>
      <div class="row-btns"><button class="btn" id="b-back">返回</button></div></div>`;
    const w = () => { this.save.write(); this.applySettings(); };
    $('s-dm').onchange = (e) => { st.danmaku = e.target.checked; w(); };
    $('s-as').onchange = (e) => { st.assist = e.target.checked; w(); };
    $('s-vol').oninput = (e) => { st.volume = +e.target.value; w(); };
    $('s-mus').oninput = (e) => { st.music = +e.target.value; w(); };
    $('b-back').onclick = () => this.titleScreen();
  }

  showTouch(on) { $('touch').classList.toggle('active', on); $('touch-pause').classList.toggle('active', on); }

  // ———————————————————— 剧情
  async runStoryFrom(id, single = false) {
    this.storyToken = (this.storyToken || 0) + 1;
    const token = this.storyToken;
    $('menu').innerHTML = '';
    for (let c = id; c <= 13; c++) {
      const r = await this.runChapter(c);
      if (token !== this.storyToken) return;
      if (r === 'quit') return this.titleScreen();
      if (single && c >= this.save.data.unlockedChapter - 1 && c === id) { /* 继续往下走 */ }
      if (c < 13 && !this.fast) {
        const go = await this.between(c + 1);
        if (!go) return this.titleScreen();
      }
    }
    this.titleScreen();
  }

  between(next) {
    return new Promise((resolve) => {
      const ch = STORY.chapters[next];
      $('menu').innerHTML = `<div class="result-screen"><div class="result-box"><h2>${ch.num}</h2><div class="line">${ch.title}</div>
        <div class="row-btns2"><button class="btn" id="n-go">继续</button><button class="btn" id="n-quit">回到标题</button></div></div></div>`;
      $('n-go').focus();
      $('n-go').onclick = () => { $('menu').innerHTML = ''; resolve(true); };
      $('n-quit').onclick = () => { $('menu').innerHTML = ''; resolve(false); };
    });
  }

  async runChapter(id) {
    const ch = STORY.chapters[id];
    this.showTouch(false); this.danmaku.clear(); this.game.showHud(false); $('menu').innerHTML = '';
    this.screen = 'story'; this.chapter = id;
    this.game.endSession();
    this.game.setEmotional(false);
    this.danmaku.silence(false);
    this.game.setPalette(CHAPTER_PALETTE[id]);
    this.vn.show(true); this.vn.clearPortraits(); this.vn.skip = false; this.vn.setBg('black');
    let result = 'done';
    for (const st of ch.steps) {
      const r = await this.storyStep(st, ch);
      if (r === 'quit') { this.vn.show(false); return 'quit'; }
      if (r === 'won' || r === 'lost') result = r;
    }
    this.vn.show(false);
    this.danmaku.silence(false);
    this.game.setEmotional(false);
    // 车库解锁：赢下对手解锁其车；第 9 章与终章为注定失败，按"完成章节"解锁
    for (const cid of CAR_ORDER) {
      const u = CARS[cid].unlock;
      if (u.chapter === id && (u.type === 'complete' || result === 'won')) if (this.save.unlockCar(cid)) this.toast(`车库解锁：${CARS[cid].name}`);
    }
    this.save.completeChapter(id, result);
    return result;
  }

  async storyStep(st, ch) {
    const vn = this.vn;
    if (st.card) { vn.box.style.display = 'none'; await vn.card(ch); }
    else if (st.bg) { vn.setBg(st.bg); vn.clearPortraits(); }
    else if (st.music) this.audio.setMusic(st.music);
    else if (st.amb) this.audio.ambience(st.amb);
    else if (st.narr) await vn.narr(st.narr, st);
    else if (st.say) await vn.say(st.say[0], st.say[1], st.say[2], { quiet: st.quiet });
    else if (st.tip) await vn.tip(st.tip);
    else if (st.silence !== undefined) { this.danmaku.silence(st.silence); this.game.mood = st.silence ? 0.6 : 0; }
    else if (st.danmaku) { if (st.flood) this.danmaku.flood(st.danmaku, st.flood); else if (POOLS[st.danmaku]) this.danmaku.burst(st.danmaku, st.n || 5, { force: true }); else this.danmaku.flood(st.danmaku, st.n || 6, { spread: 0.25 }); if (!this.fast) await sleep(1200); }
    else if (st.unlock === 'ditch') { this.save.data.ditch = true; this.save.write(); this.toast('解锁：排水渠过弯'); }
    else if (st.unlockCar) { /* 统一在章节结束时按规则解锁 */ }
    else if (st.qte) { vn.show(false); this.qteScore = await jianziQTE(this); vn.show(true); }
    else if (st.sfx) this.audio.sfx(st.sfx);
    else if (st.panel) { await fullPanel(st.panel, st.hold || 3, this); }
    else if (st.title) { vn.box.style.display = 'none'; await titleCard(st.title, st.hold || 3, this, ch.id !== 0); vn.box.style.display = ''; }
    else if (st.cinematic === 'prologue') { vn.show(false); await this.prologue(); vn.show(true); vn.setBg('black'); }
    else if (st.hold) await vn.hold(st.hold, st.panelOnly);
    else if (st.race) {
      vn.show(false);
      const r = await this.storyRaceLoop(st.race, ch);
      vn.show(true); vn.clearPortraits();
      return r;
    }
  }

  async storyRaceLoop(id, ch) {
    for (;;) {
      const cfg = storyRace(id, this);
      const res = await this.runRace(cfg, { story: true, chapter: ch });
      if (res.result === 'quit') return 'quit';
      if (res.result === 'restart') continue;
      this.raceLog = [...(this.raceLog || []), { id, result: res.result, reason: res.reason, time: res.time }];
      if (cfg.outcome === 'win' && res.result !== 'win') continue; // 必须真实赢下：重试
      return res.result === 'win' ? 'won' : 'lost';
    }
  }

  // ———————————————————— 比赛
  runRace(cfg, opts = {}) {
    return new Promise((resolve) => {
      this.screen = 'race';
      $('menu').innerHTML = '';
      const g = this.game;
      g.setEmotional(false);
      g.setPalette(cfg.palette ? (typeof cfg.palette === 'string' ? PALETTES[cfg.palette] : cfg.palette) : 'night');
      this.danmaku.silence(false); this.danmaku.clear();
      const sess = g.startSession(cfg, { onEvent: (t, d, s) => this.onRaceEvent(t, d, s) });
      this.sess = sess;
      if (this.fast) sess.timeScale = 6;
      if (this.autopilot) this.attachAutopilot();
      g.showHud(true);
      this.showTouch(this.isTouch);
      this.audio.setMusic(cfg.danmaku === 'quiet' || cfg.course === 'finale' ? 'none' : 'race');
      this.audio.ambience({ rain: cfg.rain ? 1 : 0 });
      const finish = (res) => {
        this.raceDone = null;
        this.showTouch(false);
        g.showHud(false);
        this.audio.ambience({ rain: 0 });
        resolve(res);
      };
      this.raceDone = (res) => { sess.state = 'done'; finish(res); };
      this.onRaceEnd = async (result) => {
        if (cfg.course === 'finale') return; // 终章由演出推进
        await sleep(this.fast ? 0 : 1800);
        if (!this.raceDone) return;
        const res = await this.resultScreen(sess, result, cfg, opts);
        finish(res);
      };
    });
  }

  attachAutopilot() {
    const s = this.game.session;
    const ai = new AIDriver(s.player.sim, s.track, s.course, { ...PERSONAS.ae86, useDitch: s.env.ditchEnabled }, 9);
    s.autoInput = (ss, dt) => ai.update(dt, ss.env);
  }

  onRaceEvent(type, d, s) {
    const dm = this.danmaku, hud = this.game.hud, cam = this.game.cam, au = this.audio, cfg = s.cfg;
    const quiet = cfg.danmaku === 'quiet';
    const pc = s.player.spec.id;
    const vsBenz = s.racers.some((r) => r.spec.id === 'benz') && cfg.course !== 'finale';
    switch (type) {
      case 'count': hud.countdown(d.n); au.sfx('count'); break;
      case 'go':
        hud.countdown('GO'); au.sfx('go');
        if (quiet || cfg.course === 'finale') break;
        dm.burst('start', 6);
        if (pc === 'wuling') dm.burst(vsBenz ? 'wulingVsBenz' : 'wuling', 8, { cool: 0 });
        if (pc === 'ae86' && cfg.course === 'akina_down' && !cfg.story) dm.burst('ae86', 3, { cool: 0 });
        for (const r of s.racers) { const pool = { r32: 'gtr', evo: 'evo', evo3: 'evo3', fc: 'fc' }[r.spec.id]; if (pool && !r.isPlayer) dm.burst(pool, 3, { cool: 0 }); }
        break;
      case 'driftEnd':
        if (d.dur > 1.1 && !quiet) dm.burst(d.combo > 2 ? 'combo' : 'drift', d.combo > 2 ? 4 : 2, { cool: 2500 });
        if (d.score > 0) hud.flash(`漂移 +${d.score}${d.combo > 1 ? ' ×' + d.combo : ''}`);
        break;
      case 'perfect':
        hud.flash(`完美漂移 +${d.score}`, 'gold'); au.sfx('perfect'); cam.shake(0.18, 0.4);
        this.game.speedLines.burst(0.5);
        if (!quiet) dm.burst('perfect', 10, { big: true, cool: 1500 });
        this.save.data.stats.perfect++;
        break;
      case 'overtake':
        au.sfx('overtake');
        if (!quiet) dm.burst(pc === 'wuling' ? (vsBenz ? 'wulingVsBenz' : 'wuling') : 'overtake', 7, { cool: 1200 });
        if (d.victimRacer && !d.victimRacer.route) this.cinema.overtake(d.victimRacer.spec.id);
        break;
      case 'overtaken': if (!quiet) dm.burst('overtaken', 2, { cool: 3000 }); break;
      case 'wall':
        au.sfx('wall'); cam.shake(Math.min(0.5, d.severity * 0.06), 0.35);
        if (d.money) hud.flash('钞能力：撞墙不减速', 'gold');
        else if (d.lucky) hud.flash('护身符生效 · 运气+1%', 'gold');
        if (!quiet && d.severity > 3) dm.burst('wall', 3, { cool: 4000 });
        break;
      case 'ditchIn':
        hud.flash('排水渠！', 'blue'); au.sfx('ditch'); cam.shake(0.08, 0.3);
        if (!quiet) { if (!this.firstDitch) { this.firstDitch = true; dm.flood('排水渠过弯！！', 14); } else dm.burst('ditch', 6, { cool: 2000 }); }
        break;
      case 'ditchBump': au.sfx('ditch'); if (!quiet) dm.burst('ditchBump', 2, { cool: 5000 }); if (!s.env.ditchEnabled) hud.flash('排水沟：还不会用'); break;
      case 'ditchPop': hud.flash('太快了，飞出排水沟', 'red'); break;
      case 'feint': hud.flash('重心转移'); break;
      case 'spin': hud.flash('打转了', 'red'); break;
      case 'spill': if (!quiet) dm.burst('spill', 2, { cool: 6000 }); break;
      case 'reset': hud.flash('复位'); break;
      case 'bump': au.noiseHit(400, 0.15, 0.35); cam.shake(Math.min(0.3, d.severity * 0.05), 0.25); if (!quiet) dm.burst(['碰了碰了', '贴身肉搏', '换漆了', '这是碰碰车吧'], 2, { cool: 4000 }); break;
      case 'blow':
        au.sfx('blow'); cam.shake(0.6, 1.2); hud.flash('爆缸', 'red');
        dm.flood('？？？？', 12);
        setTimeout(() => { dm.silence(true); this.audio.setMusic('none'); this.game.setEmotional(true); }, this.fast ? 0 : 1600);
        break;
      case 'end': this.onRaceEnd?.(d); break;
    }
  }

  async resultScreen(sess, r, cfg, opts) {
    this.save.data.stats.races++;
    if (r.result === 'win') this.save.data.stats.wins++;
    this.save.write();
    const win = r.result === 'win';
    // 彩蛋：86 在秋名山下坡追上奔驰
    const vsBenz = sess.racers.some((x) => x.spec.id === 'benz' && !x.isPlayer);
    if (win && vsBenz && sess.player.spec.id === 'ae86' && cfg.course === 'akina_down' && !opts.story) {
      this.danmaku.silence(true); this.danmaku.silence(false);
      this.audio.setMusic('piano');
      this.danmaku.push('这一次，追上了', { dur: 12, big: true, lane: 3 });
      await sleep(this.fast ? 0 : 5000);
    } else if (win && !cfg.danmaku) this.danmaku.burst('win', 8, { force: true });
    let best = '';
    if (!opts.story && win) {
      const key = `${cfg.mode}:${cfg.course}:${cfg.player.car}`;
      const v = cfg.mode === 'tofu' ? r.score : r.time;
      if (this.save.best(key, v)) best = '<div class="line" style="color:#ffd24d">新纪录！</div>';
      best += `<div class="line">最佳：${cfg.mode === 'tofu' ? this.save.data.best[key] + ' 分' : fmtTime(this.save.data.best[key])}</div>`;
    }
    const title = opts.story && cfg.outcome === 'lose' ? '败北' : win ? (opts.story ? '哎哟，不错哦' : '胜利') : r.result === 'fail' ? '失败' : '输了';
    const mustRetry = opts.story && cfg.outcome === 'win' && !win;
    if (this.fast) { this.lastResult = r; return r; }
    return new Promise((resolve) => {
      $('menu').innerHTML = `<div class="result-screen"><div class="result-box"><h2>${title}</h2>
        <div class="line">${r.reason}</div>
        <div class="line">用时 ${fmtTime(r.time)}${r.total > 1 ? ` · 第 ${r.rank}/${r.total} 名` : ''} · 撞墙 ${r.walls} 次</div>
        ${r.water != null ? `<div class="line">剩余水量 ${Math.round(r.water * 100)}%</div>` : ''}
        ${r.score != null ? `<div class="line">豆腐挑战得分 ${r.score}（用时 + 洒水罚时，越低越好）</div>` : ''}
        ${best}
        ${mustRetry ? '<div class="line" style="color:#ff8a8a">这一场必须赢下来。</div>' : ''}
        <div class="row-btns2">${mustRetry ? '<button class="btn" id="r-retry">重试</button>' : opts.story ? '<button class="btn" id="r-next">继续</button><button class="btn" id="r-retry">再跑一次</button>' : '<button class="btn" id="r-retry">再来一次</button><button class="btn" id="r-back">返回车库</button>'}
        <button class="btn" id="r-quit">回到标题</button></div></div></div>`;
      const done = (v) => { $('menu').innerHTML = ''; resolve(v); };
      $('r-retry') && ($('r-retry').onclick = () => done({ ...r, result: mustRetry ? r.result : 'restart' }));
      $('r-next') && ($('r-next').onclick = () => done(r));
      $('r-back') && ($('r-back').onclick = () => done({ ...r, back: true }));
      $('r-quit').onclick = () => done({ ...r, result: 'quit' });
      ($('r-next') || $('r-retry')).focus();
    });
  }

  // ———————————————————— 序章过场：发夹弯慢镜头
  async prologue() {
    const g = this.game;
    this.screen = 'cinematic';
    g.setPalette('night');
    const hp = g.track.hairpin(1);
    const c = g.track.course('akina_down');
    const s = g.startSession({ course: 'akina_down', mode: 'story', player: { car: 'ae86' }, opponents: [], countdown: 0.01, rolling: 22, startProg: hp.s0 - c.s0 - 110, script: { rules: () => true } });
    const ai = new AIDriver(s.player.sim, g.track, s.course, { ...PERSONAS.ae86 }, 4);
    s.autoInput = (ss, dt) => ai.update(dt, ss.env);
    this.screen = 'race';
    g.showHud(false); g.setEmotional(true); g.mood = 0.25;
    this.danmaku.silence(true);
    const mid = g.track.sample((hp.s0 + hp.s1) / 2);
    const out = -1; // 弯外侧
    let shotOn = false;
    const hook = () => {
      const p = s.player.sim;
      if (!shotOn && p.s > hp.s0 - 6) {
        shotOn = true; s.timeScale = 0.18; this.audio.sfx('piano');
        g.cam.mode = 'shot';
        g.cam.shot = { pos: new g.camera.position.constructor(mid.x - mid.nx * out * 14, mid.y + 2.2, mid.z - mid.nz * out * 14), look: new g.camera.position.constructor(p.x, p.y + 0.6, p.z), fov: 34, lambda: 3 };
      }
      if (shotOn) g.cam.shot.look.set(p.x, p.y + 0.6, p.z);
    };
    g.frameHooks.add(hook);
    const t0 = performance.now();
    while (performance.now() - t0 < (this.fast ? 0 : 9000) && s.player.sim.s < hp.s1 + 10) await sleep(50);
    g.frameHooks.delete(hook);
    s.timeScale = 1; g.cam.mode = 'chase';
    g.setEmotional(false); this.danmaku.silence(false);
    g.endSession();
    this.screen = 'story';
  }

  // ———————————————————— 终章演出
  finaleParallel(s) {
    const g = this.game;
    s.timeScale = 0.12;
    this.danmaku.silence(true);
    this.audio.setMusic('none');
    g.setEmotional(true); g.mood = 0.35;
    const p = s.player.sim, benz = s.racers[1].sim;
    const hook = () => {
      const fx = Math.cos(p.heading), fz = -Math.sin(p.heading);
      const side = -(Math.sign(benz.lat - p.lat) || 1); // 机位在 86 外侧：前景 86，后景奔驰
      const nx = s.track.sample(p.s).nx * side, nz = s.track.sample(p.s).nz * side;
      g.cam.mode = 'shot';
      const V = g.camera.position.constructor;
      g.cam.shot = { pos: new V(p.x + nx * 11 + fx * 4, p.y + 1.6, p.z + nz * 11 + fz * 4), look: new V((p.x + benz.x) / 2, p.y + 0.9, (p.z + benz.z) / 2), fov: 40, lambda: 2.5 };
    };
    this.finaleHook = hook;
    g.frameHooks.add(hook);
    setTimeout(() => this.cinema.gaze(), this.fast ? 0 : 1100);
  }
  finaleRelease(s) {
    const g = this.game;
    g.frameHooks.delete(this.finaleHook);
    this.cinema.clear();
    g.cam.mode = 'chase';
    // 慢镜头恢复
    const ramp = setInterval(() => { s.timeScale = Math.min(1, s.timeScale + 0.06); if (s.timeScale >= 1) clearInterval(ramp); }, 50);
    g.mood = 0.15;
  }
  async finaleStop(s) {
    const g = this.game, dm = this.danmaku;
    // 86 靠边停下
    s.autoInput = (ss, dt) => {
      const p = ss.player.sim;
      const q = ss.track.sample(p.s);
      const want = (ss.track.halfWidth - 1.2) * -ss.course.dir; // 右侧路肩
      const fx = Math.cos(p.heading), fz = -Math.sin(p.heading);
      const ahead = ss.track.sample(p.s + 14 * ss.course.dir);
      const tx = ahead.x + ahead.nx * want, tz = ahead.z + ahead.nz * want;
      const ang = Math.atan2(-(tz - p.z), tx - p.x) - p.heading;
      const steer = clamp(Math.atan2(Math.sin(ang), Math.cos(ang)) * 2, -1, 1);
      return { throttle: 0, brake: p.speed > 1 ? 0.35 : 1, steer, handbrake: false };
    };
    while (s.player.sim.speed > 0.4 && !this.fast) await sleep(100);
    await sleep(this.fast ? 0 : 1500);
    this.audio.engineOff();
    this.screen = 'cinematic';
    g.setEmotional(true); g.mood = 1;
    const p = s.player.sim;
    const q = s.track.sample(p.s + 6 * s.course.dir);
    const V = g.camera.position.constructor;
    g.cam.mode = 'shot';
    g.cam.shot = { pos: new V(q.x + q.nx * 7, p.y + 1.3, q.z + q.nz * 7), look: new V(p.x, p.y + 0.8, p.z), fov: 40, lambda: 0.6 };
    // 弹幕沉默很久……
    await sleep(this.fast ? 0 : 7000);
    dm.silence(false);
    dm.push('再快的86也追不上奔驰', { dur: 13, lane: 2 });
    await sleep(this.fast ? 0 : 5500);
    const waves = [2, 3, 5, 8, 13];
    for (const n of waves) { dm.flood('再快的86也追不上奔驰', n, { spread: 0.35 }); await sleep(this.fast ? 0 : 1800); }
    dm.flood('再快的86也追不上奔驰', 60, { spread: 0.05 });
    await sleep(this.fast ? 0 : 2500);
    await titleCard(['再快的86<br>也追不上奔驰'], 4, this, true);
    dm.silence(true);
    s._end('lose', '出山之后，路变直了');
    g.endSession();
    g.setEmotional(false);
    this.raceDone?.({ result: 'lose' });
    dm.silence(false);
  }

  // ———————————————————— 自由赛
  freeMenu() {
    this.screen = 'free';
    const f = this.free, sv = this.save.data;
    if (!sv.cars.includes(f.car)) f.car = 'ae86';
    const benzOpen = sv.cars.includes('benz');
    const cars = CAR_ORDER.map((id) => {
      const c = CARS[id], open = sv.cars.includes(id);
      const u = c.unlock.type === 'initial' ? '初始' : c.unlock.chapter === 12 ? '通关终章' : `通关第${c.unlock.chapter}章`;
      return `<div class="card ${f.car === id ? 'sel' : ''} ${open ? '' : 'locked'}" data-car="${id}">
        <div class="nm">${c.name}</div><div class="sw" style="background:linear-gradient(90deg,#${c.color.toString(16).padStart(6, '0')} 60%,#${c.color2.toString(16).padStart(6, '0')} 60%)"></div>
        <div class="meta">${{ FR: '前置后驱', AWD: '四驱', LUX: '豪华轿车' }[c.drive]} · ${c.trait}<br>${c.desc}</div>
        <div class="stars-row"><span>直线</span><b>${starStr(c.stars.straight)}</b><span>弯道</span><b>${starStr(c.stars.corner)}</b><span>漂移</span><b>${starStr(c.stars.drift)}</b></div>
        ${open ? '' : `<span class="lock">🔒 ${u}</span>`}</div>`;
    }).join('');
    const chip = (key, val, label, locked = false) => `<span class="chip ${f[key] === val ? 'sel' : ''} ${locked ? 'locked' : ''}" data-k="${key}" data-v="${val}">${label}</span>`;
    const tracks = TRACK_ORDER.map((t) => chip('course', t, COURSES[t].name)).join('');
    const modes = Object.entries(MODES).map(([k, m]) => chip('mode', k, m.name)).join('');
    const opps = CAR_ORDER.filter((id) => id !== 'benz' || benzOpen).map((id) => chip('opp', id, CARS[id].name)).join('');
    const pals = Object.entries(PAL_LABEL).map(([k, l]) => chip('pal', k, l)).join('');
    const needOpp = f.mode === 'duel' || f.mode === 'chase';
    $('menu').innerHTML = `<div class="panel-screen"><h2>自由赛 · 车库</h2>
      <div class="grid">${cars}</div><p class="note">${BALANCE_NOTE} 五菱宏光的前置后驱与约 100 匹为题面给出的真实资料口径，其余均为本作平衡值。</p>
      <h3>赛道</h3><div class="chips">${tracks}</div><p class="note">${COURSES[f.course].desc}</p>
      <h3>赛制</h3><div class="chips">${modes}</div><p class="note">${MODES[f.mode].desc}${f.mode === 'tofu' ? '（豆腐挑战固定在下坡赛道）' : ''}</p>
      ${needOpp ? `<h3>对手</h3><div class="chips">${opps}</div>` : ''}
      <h3>时段</h3><div class="chips">${pals}</div>
      <h3>改装</h3>
      <label class="toggle"><input type="checkbox" id="f-st" ${f.sticker ? 'checked' : ''}>车尾贴五菱标护身符（运气 +1%：每次撞墙有 1% 概率不损失速度）</label>
      ${f.car === 'wuling' ? `<label class="toggle"><input type="checkbox" id="f-ps" ${f.passengers ? 'checked' : ''}>后排载阿木和山鸡哥（会喊话、晃动，动力 +3%）</label>
      <label class="toggle"><input type="checkbox" id="f-tf" ${f.tofu ? 'checked' : ''}>后备箱装豆腐（接入水杯系统）</label>` : ''}
      <div class="row-btns"><button class="btn" id="b-back">返回</button><button class="btn" id="b-go">出发</button></div></div>`;
    $('menu').querySelectorAll('[data-car]').forEach((el) => { el.onclick = () => { if (!el.classList.contains('locked')) { f.car = el.dataset.car; this.freeMenu(); } }; });
    $('menu').querySelectorAll('.chip').forEach((el) => { el.onclick = () => { if (el.classList.contains('locked')) return; f[el.dataset.k] = el.dataset.v; this.freeMenu(); }; });
    $('f-st').onchange = (e) => { f.sticker = e.target.checked; };
    $('f-ps') && ($('f-ps').onchange = (e) => { f.passengers = e.target.checked; });
    $('f-tf') && ($('f-tf').onchange = (e) => { f.tofu = e.target.checked; });
    $('b-back').onclick = () => this.titleScreen();
    $('b-go').onclick = () => this.startFree();
  }

  freeConfig() {
    const f = this.free, sv = this.save.data;
    let course = f.course;
    if (f.mode === 'tofu' && course !== 'akina_down' && course !== 'akina_rain') course = 'akina_down';
    const rain = course === 'akina_rain';
    let opponents = [];
    if (f.mode === 'duel' || f.mode === 'chase') opponents = [{ car: f.opp === f.car && f.car !== 'ae86' ? f.opp : f.opp }];
    if (f.mode === 'melee') opponents = CAR_ORDER.filter((id) => id !== f.car && (id !== 'benz' || sv.cars.includes('benz'))).slice(0, 7).map((car) => ({ car }));
    const pal = f.pal === 'auto' ? (rain ? 'rain' : DEFAULT_PAL[course]) : f.pal;
    const passengers = f.car === 'wuling' && f.passengers;
    const cup = f.mode === 'tofu' ? 'fatal' : f.car === 'wuling' && f.tofu ? 'show' : 'off';
    return { course, rain: rain || pal === 'rain', palette: pal, mode: f.mode, player: { car: f.car, sticker: f.sticker, passengers }, opponents, cup, ditch: sv.ditch, assist: sv.settings.assist, seed: Math.floor(Math.random() * 1e6), outcome: 'any' };
  }

  async startFree() {
    for (;;) {
      const cfg = this.freeConfig();
      const res = await this.runRace(cfg, { story: false });
      if (res.result === 'restart') continue;
      if (res.result === 'quit') return this.titleScreen();
      return this.freeMenu();
    }
  }
}

const app = new App();
window.__app = app;
window.__game = app.game;

// ———————————————————— 测试接口（无头确定性驱动）
window.__bench = {
  state() {
    const s = app.game.session;
    return {
      screen: app.screen, chapter: app.chapter ?? null, paused: app.game.paused,
      session: s ? s.snapshot() : null,
      danmaku: { count: app.danmaku.count, silenced: app.danmaku.silenced, user: app.danmaku.userOn },
      emotional: app.game.emotional, hud: app.game.hudVisible && !document.getElementById('hud').classList.contains('hidden'),
      vn: !document.getElementById('vn').classList.contains('hidden'), save: app.save.data, glitch: app.glitch
    };
  },
  fast(on = true) { app.fast = on; },
  log() { return app.raceLog || []; },
  autopilot(on = true) { app.autopilot = on; if (on && app.game.session) app.attachAutopilot(); },
  story(id) { app.runStoryFrom(id); return 'started'; },
  free(over = {}) { Object.assign(app.free, over); app.startFree(); return app.freeConfig(); },
  advance() { app.vn.advance(); },
  skip() { app.vn.skip = true; app.vn.advance(); },
  /** 不依赖 rAF：直接推进固定步长 */
  step(n = 120, input = { throttle: 1 }) { const s = app.game.session; for (let i = 0; i < n; i++) s.step(SIM_DT, input); return s.snapshot(); },
  run(sec = 1, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) app.frame(dt); return app.game.session?.snapshot(); },
  force518() { app.glitch = 0.8; },
  pause(on) { app.togglePause(on); },
  save() { return app.save.data; }
};
