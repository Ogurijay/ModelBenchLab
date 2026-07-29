// game.js — 总控:状态机(开机/标题/选人/游玩/菜单/上班/过场)、移动交互、渲染管线
import { TILE, buildArt, CHARACTERS } from './art.js';
import { buildWorld, applyDayNight, darkness } from './world.js';
import { FURN, initialInstances, ObjectMap, optionsFor, drawablesFor, lightsOf, CATALOG } from './objects.js';
import { Sim, WEEKDAYS, JOB_TITLES } from './sim.js';
import { Visitor, Cat } from './npc.js';
import { UI } from './ui.js';
import { ptext, drawWindow, drawPanel, drawBar } from './text.js';
import { Input } from './input.js';
import { Audio } from './audio.js';

const CHAR_DESC = ['乐观开朗,干劲十足', '能吃能睡,随遇而安', '精力旺盛,坐不住', '安静细心,爱读书'];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.art = buildArt();
    this.world = buildWorld(this.art);
    this.ui = new UI(this.art);
    this.sim = new Sim();
    this.objects = null;
    this.visitor = null;
    this.cat = null;

    this.state = 'boot';
    this.t = 0;
    this.stateT = 0;
    this.bootDone = false;
    this.selIdx = 0;
    this.shopIdx = 0;
    this.action = null;
    this.hint = null;
    this.doorOpenT = 0;
    this.workResult = null;
    this.player = null;
    this.fps = 60;

    Input.onKey((code) => {
      if (code === 'KeyM') {
        Audio.unlock();
        const m = Audio.toggleMuted();
        if (this.sim.state) this.sim.state.muted = m;
        this.ui.toast(m ? '音乐:关' : '音乐:开', 'music');
      }
    });
    Input.onFirst(() => Audio.unlock());
  }

  // ---------- 开局 ----------
  newPlayer(tx, ty) {
    return { tx, ty, px: tx * TILE, py: ty * TILE, facing: 'down', animT: 0, moving: false, tgt: null };
  }

  startNew(charIdx) {
    this.sim.newGame(charIdx, CHARACTERS[charIdx].name);
    this.objects = new ObjectMap(initialInstances());
    this.visitor = new Visitor(this.world);
    this.cat = new Cat(this.world);
    this.player = this.newPlayer(this.world.spawn.x, this.world.spawn.y);
    this.action = null;
    this.state = 'play';
    Audio.bgm('day');
    this.ui.say([
      '欢迎搬到向日葵街 7 号!我是隔壁的小樱~',
      '冰箱里有吃的,累了记得睡觉。工作日早上 8:30 到门口出发上班,别迟到哦!',
      '头顶的宝石会显示你的心情——绿色代表状态很好。下午我会来串门,回头见啦!',
    ], { name: '小樱', cb: () => this.ui.toast('方向键移动 · A 互动 · START 菜单') });
  }

  continueGame(data) {
    this.sim.loadFrom(data);
    const S = this.sim.state;
    this.objects = new ObjectMap(initialInstances());
    for (const key of Object.keys(S.owned)) if (S.owned[key]) this.objects.applyPurchase(key);
    if (data.lamps) {
      for (const [id, on] of Object.entries(data.lamps)) {
        const inst = this.objects.byId(id);
        if (inst) inst.on = on;
      }
    }
    if (data.puddles) for (const p of data.puddles) this.objects.addPuddle(p.tx, p.ty);
    this.visitor = new Visitor(this.world);
    this.cat = new Cat(this.world);
    const pp = data.player || this.world.spawn;
    this.player = this.newPlayer(pp.tx, pp.ty);
    this.player.facing = pp.facing || 'down';
    Audio.setMuted(!!S.muted);
    this.action = null;
    this.state = 'play';
    Audio.bgm(darkness(S.clock) > 0.5 ? 'night' : 'day');
    this.ui.toast(`欢迎回来,${S.name}!`);
  }

  autosave() {
    if (!this.sim.state || !this.player) return;
    const lamps = {};
    const puddles = [];
    for (const o of this.objects.list) {
      if (o.type === 'lamp') lamps[o.id] = !!o.on;
      if (o.type === 'puddle') puddles.push({ tx: o.tx, ty: o.ty });
    }
    this.sim.save({
      player: { tx: this.player.tx, ty: this.player.ty, facing: this.player.facing },
      lamps, puddles,
    });
  }

  solid(tx, ty) {
    return this.world.solidBase(tx, ty) || this.objects.solidAt(tx, ty);
  }
  solidFn = (tx, ty) => this.solid(tx, ty);

  // ---------- 主更新 ----------
  update(dt) {
    this.t += dt;
    this.stateT += dt;
    if (this.doorOpenT > 0) this.doorOpenT -= dt;

    const uiConsumed = this.ui.update(dt, Input, Audio);

    switch (this.state) {
      case 'boot': this.updateBoot(); break;
      case 'title': this.updateTitle(uiConsumed); break;
      case 'charsel': this.updateCharsel(uiConsumed); break;
      case 'play': this.updatePlay(dt, uiConsumed); break;
      case 'status':
      case 'help':
        // stateT 去抖:避免打开菜单的同一帧 A 键立即把页面关掉
        if (this.stateT > 0.15 && (Input.pressed('B') || Input.pressed('START') || Input.pressed('A'))) {
          Audio.sfx('cancel'); this.state = 'play';
        }
        break;
      case 'shop': this.updateShop(uiConsumed); break;
      case 'work': this.updateWork(dt); break;
      case 'newday': this.updateNewday(dt); break;
    }
  }

  setState(s) { this.state = s; this.stateT = 0; }

  updateBoot() {
    if (this.stateT > 2.0 || ((Input.pressed('A') || Input.pressed('START')) && this.stateT > 0.4)) {
      this.setState('title');
      Audio.bgm('title');
    }
    if (!this.bootDone && this.stateT > 0.3) { this.bootDone = true; Audio.sfx('boot'); }
  }

  updateTitle(uiConsumed) {
    if (uiConsumed) return;
    if (Input.pressed('START') || Input.pressed('A')) {
      Audio.unlock(); Audio.bgm('title'); Audio.sfx('ok');
      const save = Sim.loadRaw();
      const items = [];
      if (save) items.push({ label: '继续生活' });
      items.push({ label: '新的生活' });
      this.ui.choose(items, {
        cb: (idx) => {
          if (idx < 0) return;
          if (save && idx === 0) this.continueGame(save);
          else if (save) {
            this.ui.choose([{ label: '确定覆盖旧存档' }, { label: '再想想' }], {
              cb: (i2) => {
                if (i2 === 0) { Sim.clearSave(); this.setState('charsel'); }
              },
            });
          } else this.setState('charsel');
        },
      });
    }
  }

  updateCharsel(uiConsumed) {
    if (uiConsumed) return;
    if (Input.rep('LEFT')) { this.selIdx = (this.selIdx + 3) % 4; Audio.sfx('blip'); }
    if (Input.rep('RIGHT')) { this.selIdx = (this.selIdx + 1) % 4; Audio.sfx('blip'); }
    if (Input.pressed('A')) { Audio.sfx('jingle'); this.startNew(this.selIdx); }
    if (Input.pressed('B')) { Audio.sfx('cancel'); this.setState('title'); }
  }

  // ---------- 游玩 ----------
  updatePlay(dt, uiConsumed) {
    const S = this.sim.state;

    // BGM 随昼夜
    const wantBgm = darkness(S.clock) > 0.5 ? 'night' : 'day';
    Audio.bgm(wantBgm);

    // 时间推进 + 事件
    const speed = this.action ? (this.action.speed || 6) : 1;
    const dtMin = dt * speed;
    const events = this.sim.tick(dtMin, this.action ? 'action' : 'normal');
    this.handleEvents(events);

    // 行动进行中
    if (this.action) {
      const act = this.action;
      this.sim.applyRates(act.rates || {}, dtMin);
      act.prog = (act.prog || 0) + dtMin;
      let done = false, canceled = false;
      if (act.until && S.needs[act.until] >= 99.5) done = true;
      if (act.dur && act.prog >= act.dur) done = true;
      if (act.needsPowerLive && !S.power) { canceled = true; this.ui.toast('停电了,只好作罢…', 'plug'); }
      if (!uiConsumed && Input.pressed('B')) { canceled = true; Audio.sfx('cancel'); }
      if (done || canceled) this.endAction(done);
      return;
    }

    // NPC 更新
    this.updateNpcs(dt);

    if (uiConsumed) { this.hint = null; return; }

    // 菜单键
    if (Input.pressed('START')) { Audio.sfx('ok'); this.openPause(); return; }
    if (Input.pressed('SELECT')) { this.ui.hudHidden = !this.ui.hudHidden; Audio.sfx('blip'); }

    // 移动
    this.updateMovement(dt);

    // 朝向提示 + 互动
    const face = this.faceTile();
    this.hint = this.hintFor(face);
    if (Input.pressed('A')) this.tryInteract(face);
  }

  updateNpcs(dt) {
    if (this.visitor) {
      const ev = this.visitor.update(dt, this.solidFn);
      if (ev === 'knock') { Audio.sfx('doorbell'); this.ui.toast('小樱来串门了!', 'social'); this.doorOpenT = 0.6; }
      if (ev === 'entered') this.doorOpenT = 0.6;
      if (ev === 'left') this.doorOpenT = 0.6;
    }
    if (this.cat) {
      const ev = this.cat.update(dt, this.solidFn, { x: this.player.tx, y: this.player.ty });
      if (ev === 'meow') { Audio.sfx('meow'); this.ui.bubble(this.cat.walker, 'paw', 1.4); }
    }
  }

  updateMovement(dt) {
    const p = this.player;
    const run = Input.held('B') ? 1.65 : 1;
    const spd = 84 * run * dt;

    if (p.tgt) {
      const gx = p.tgt.x * TILE, gy = p.tgt.y * TILE;
      const dx = gx - p.px, dy = gy - p.py;
      const dist = Math.abs(dx) + Math.abs(dy);
      p.animT += dt * run;
      if (dist <= spd) {
        p.px = gx; p.py = gy;
        p.tx = p.tgt.x; p.ty = p.tgt.y;
        p.tgt = null;
        if (p.tx === this.world.doorTile.x && p.ty === this.world.doorTile.y) {
          Audio.sfx('door'); this.doorOpenT = 0.5;
        }
      } else {
        if (Math.abs(dx) > 0.01) p.px += Math.sign(dx) * spd;
        else p.py += Math.sign(dy) * spd;
      }
    }
    if (!p.tgt) {
      const dir = Input.dirHeld();
      p.moving = false;
      if (dir) {
        const d = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] }[dir];
        p.facing = dir.toLowerCase();
        const nx = p.tx + d[0], ny = p.ty + d[1];
        if (this.world.inBounds(nx, ny) && !this.solid(nx, ny)) {
          p.tgt = { x: nx, y: ny };
          p.moving = true;
          if (nx === this.world.doorTile.x && ny === this.world.doorTile.y) this.doorOpenT = 0.5;
        }
      }
    } else p.moving = true;
  }

  faceTile() {
    const p = this.player;
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.facing];
    return { x: p.tx + d[0], y: p.ty + d[1] };
  }

  hintFor(face) {
    if (this.visitor && this.visitor.active && this.visitor.tx === face.x && this.visitor.ty === face.y) return '和小樱聊天';
    if (this.cat && this.cat.tx === face.x && this.cat.ty === face.y) return '撸猫';
    const inst = this.objects.at(face.x, face.y);
    if (inst) {
      const opts = optionsFor(inst, this.sim);
      if (opts.length) return FURN[inst.type].label;
    }
    return null;
  }

  tryInteract(face) {
    // 优先 NPC
    if (this.visitor && this.visitor.active && this.visitor.tx === face.x && this.visitor.ty === face.y) {
      const { lines, gift } = this.visitor.chat(this.sim);
      const msgs = [...lines];
      this.ui.say(msgs, {
        name: '小樱',
        cb: () => { if (gift) { this.ui.toast('小樱分了你一块自烤饼干!', 'hunger'); Audio.sfx('coin'); } },
      });
      this.ui.bubble(this.player, 'social', 1.6);
      return;
    }
    if (this.cat && this.cat.tx === face.x && this.cat.ty === face.y) {
      this.cat.pet(this.sim);
      Audio.sfx('meow');
      this.ui.bubble(this.cat.walker, 'social', 1.6);
      this.ui.toast('猫咪发出了呼噜声~', 'paw');
      return;
    }
    const inst = this.objects.at(face.x, face.y);
    if (!inst) return;
    const opts = optionsFor(inst, this.sim);
    if (!opts.length) return;
    Audio.sfx('ok');
    this.ui.choose(
      opts.map((o) => ({
        label: o.label, disabled: o.disabled,
        right: o.cost ? `§${o.cost}` : (o.disabled && o.reason ? o.reason : null),
      })),
      {
        title: FURN[inst.type].label,
        cb: (idx) => {
          if (idx < 0) return;
          const o = opts[idx];
          if (o.disabled) return;
          this.execOption(o, inst);
        },
      },
    );
  }

  // ---------- 执行交互 ----------
  execOption(o, inst) {
    const S = this.sim.state;
    const act = o.act;
    switch (act.kind) {
      case 'lamp':
        inst.on = !inst.on;
        Audio.sfx('blip');
        break;
      case 'shop':
        this.shopIdx = 0;
        Audio.sfx('ok');
        this.setState('shop');
        break;
      case 'mailbox':
        if (S.billsDue > 0) {
          const due = S.billsDue;
          this.ui.choose(
            [{ label: `缴纳账单 §${due}`, disabled: S.money < due, right: S.money < due ? '钱不够' : null }, { label: '先不缴' }],
            {
              title: '邮箱',
              cb: (i) => {
                if (i !== 0) return;
                const r = this.sim.payBills();
                if (r) {
                  Audio.sfx('pay');
                  this.ui.toast(`已缴账单 -§${due}`, 'money');
                  if (r.restored) { Audio.sfx('jingle'); this.ui.toast('电力恢复了!', 'plug'); }
                  this.autosave();
                }
              },
            },
          );
        } else {
          this.ui.say('邮箱空空如也。每周一早上会收到账单,记得按时缴纳,不然会被停电!');
        }
        break;
      case 'work':
        this.beginWork();
        break;
      case 'sleep':
        this.beginSleep(act.quality);
        break;
      case 'mop':
        this.startTimed({
          kind: 'timed', pose: 'stand', dur: 6, rates: { fun: -0.2 }, speed: 4,
          text: '拖干净了,像什么都没发生过。', onEnd: () => this.objects.remove(inst.id),
        }, inst, 0);
        break;
      case 'timed':
        this.startTimed(act, inst, o.cost || 0);
        break;
    }
  }

  startTimed(act, inst, cost) {
    const S = this.sim.state;
    if (cost) {
      S.money -= cost;
      Audio.sfx('pay');
      this.ui.toast(`-§${cost}`, 'money');
    }
    this.action = { ...act, inst, prog: 0 };
    if (act.needsPower === undefined && (inst.type.startsWith('tv') || inst.type === 'stereo')) {
      this.action.needsPowerLive = true;
    }
    if (act.loopSfx) Audio.startLoop(act.loopSfx);
    if (act.sfx) Audio.sfx(act.sfx);
    if (act.text) this.ui.toast(act.text);

    // 姿势与占位
    const p = this.player;
    this.action.restore = { tx: p.tx, ty: p.ty, facing: p.facing };
    if (act.pose === 'sitOn') {
      const [fw] = FURN[inst.type].fp;
      this.action.renderAt = { px: inst.tx * TILE + (fw > 1 ? 8 : 0), py: inst.ty * TILE - 3 };
      this.action.poseKind = 'sit';
    } else if (act.pose === 'sofa') {
      const sofa = this.objects.byId('sofa');
      if (sofa) {
        this.action.renderAt = { px: sofa.tx * TILE + 8, py: sofa.ty * TILE - 3 };
        this.action.poseKind = 'sit';
      }
    } else if (act.pose === 'hideBed' || act.pose === 'hideShower') {
      this.action.hidden = true;
    }
  }

  endAction(completed) {
    const act = this.action;
    if (!act) return;
    if (act.loopSfx) Audio.stopLoop(act.loopSfx);
    if (completed && act.endSfx) Audio.sfx(act.endSfx);
    if (completed && act.until) this.ui.bubble(this.player, act.until, 1.6);
    if (act.onEnd) act.onEnd();
    this.action = null;
  }

  beginSleep(quality) {
    Audio.sfx('sleep');
    Audio.stopAllLoops();
    this.ui.fadeTo(() => {
      const r = this.sim.sleepUntilMorning(quality);
      this.workResult = null;
      this.setState('newday');
      this.sleepInfo = r;
      this.autosave();
    }, 1.8);
  }

  beginWork() {
    Audio.sfx('horn');
    this.workSettled = false;
    this.ui.fadeTo(() => {
      this.setState('work');
      this.workMood = this.sim.mood();
    }, 2.2);
  }

  updateWork(dt) {
    if (this.stateT >= 2.8 && !this.workSettled) {
      this.workSettled = true;
      const r = this.sim.goToWork();
      this.workResult = r;
      const p = this.player;
      p.tx = this.world.outsideDoor.x; p.ty = this.world.outsideDoor.y;
      p.px = p.tx * TILE; p.py = p.ty * TILE;
      p.facing = 'down'; p.tgt = null;
      this.ui.fadeTo(() => {
        this.setState('play');
        Audio.sfx('coin');
        this.ui.toast(`下班!工资 +§${r.pay}`, 'money');
        if (r.perfDelta > 0) this.ui.toast('今天状态不错,绩效 +1', 'fun');
        if (r.perfDelta < 0) this.ui.toast('无精打采…绩效 -1', 'alert');
        if (r.promoted) {
          Audio.sfx('jingle');
          this.ui.say(`升职啦!你现在是「${JOB_TITLES[this.sim.state.job.level - 1]}」,基础工资上调!`, { name: '公司来电' });
        }
        if (r.demoted) {
          Audio.sfx('sad');
          this.ui.say('绩效太差,你被降职了……振作点!', { name: '公司来电' });
        }
        this.autosave();
      }, 2.2);
    }
  }

  updateNewday(dt) {
    if (this.stateT > 1.7) {
      Audio.sfx('wake');
      this.setState('play');
      const S = this.sim.state;
      if (S.weekday <= 5) this.ui.toast('工作日:8:30 记得到门口上班!');
      else this.ui.toast('周末!好好放松一下~');
    }
  }

  // ---------- 事件处理 ----------
  handleEvents(events) {
    const S = this.sim.state;
    for (const ev of events) {
      switch (ev.type) {
        case 'billArrive':
          Audio.sfx('mail');
          this.ui.toast(`账单来了:§${ev.amount}(邮箱)`, 'mail');
          break;
        case 'workRemind':
          Audio.sfx('horn');
          this.ui.toast('上班时间!9:30 前到门口出发', 'alert');
          break;
        case 'missedWork':
          Audio.sfx('sad');
          this.ui.say(ev.demoted ? '你又旷工了!绩效太差,已被降职……' : '你今天旷工了!绩效 -1,小心被降职。', { name: '公司来电' });
          break;
        case 'powerCut':
          Audio.sfx('powercut');
          this.ui.say('账单逾期未缴,电力公司把电停了!夜里会一片漆黑,电器也用不了。去邮箱缴费即可恢复。', { name: '停电通知' });
          break;
        case 'visitorTime':
          if (this.visitor && !this.visitor.active && this.state === 'play') {
            this.visitor.startVisit(this.solidFn);
            S.visits += 1;
          }
          break;
        case 'visitorLeave':
          if (this.visitor && this.visitor.active) {
            this.visitor.leave(this.solidFn);
            this.ui.toast('小樱回家去了', 'social');
          }
          break;
        case 'accident':
          Audio.sfx('splash');
          this.objects.addPuddle(this.player.tx, this.player.ty);
          this.ui.bubble(this.player, 'alert', 2);
          this.ui.toast('哎呀,没憋住……地上湿了一片!', 'alert');
          if (this.action && this.action.pose !== 'hideShower') this.endAction(false);
          break;
        case 'collapse':
          Audio.sfx('sad');
          this.endAction(false);
          this.ui.say('实在太困了……眼前一黑,倒头就睡!', {
            cb: () => this.ui.fadeTo(() => {
              this.sim.collapseNap();
              this.ui.toast('在地板上睡了 3 小时,腰酸背痛', 'zzz');
            }, 2),
          });
          break;
        case 'sleepy':
          this.ui.bubble(this.player, 'zzz', 2);
          break;
        case 'lowNeed':
          this.ui.bubble(this.player, ev.need, 2);
          break;
        case 'hourly':
          this.autosave();
          break;
      }
    }
  }

  // ---------- 暂停菜单 ----------
  openPause() {
    const muted = Audio.muted;
    this.ui.choose(
      [
        { label: '继续' },
        { label: '生活状态' },
        { label: '操作帮助' },
        { label: `音乐:${muted ? '关' : '开'}` },
        { label: '保存进度' },
        { label: '回到标题' },
      ],
      {
        title: '菜单',
        cb: (idx) => {
          switch (idx) {
            case 1: this.setState('status'); break;
            case 2: this.setState('help'); break;
            case 3: {
              const m = Audio.toggleMuted();
              this.sim.state.muted = m;
              this.ui.toast(m ? '音乐:关' : '音乐:开', 'music');
              break;
            }
            case 4:
              this.autosave();
              Audio.sfx('coin');
              this.ui.toast('已保存', 'money');
              break;
            case 5:
              this.ui.choose([{ label: '保存并回标题' }, { label: '取消' }], {
                cb: (i) => {
                  if (i === 0) {
                    this.autosave();
                    this.setState('title');
                    Audio.bgm('title');
                    Audio.stopAllLoops();
                  }
                },
              });
              break;
          }
        },
      },
    );
  }

  // ---------- 商店 ----------
  updateShop(uiConsumed) {
    if (uiConsumed) return;
    const S = this.sim.state;
    if (Input.rep('UP')) { this.shopIdx = (this.shopIdx + CATALOG.length - 1) % CATALOG.length; Audio.sfx('blip'); }
    if (Input.rep('DOWN')) { this.shopIdx = (this.shopIdx + 1) % CATALOG.length; Audio.sfx('blip'); }
    if (Input.pressed('B')) { Audio.sfx('cancel'); this.setState('play'); return; }
    if (Input.pressed('A')) {
      const item = CATALOG[this.shopIdx];
      const owned = !!S.owned[item.key];
      if (owned) { Audio.sfx('error'); return; }
      if (S.money < item.price) { Audio.sfx('error'); this.ui.toast('钱不够…', 'alert'); return; }
      this.ui.choose([{ label: `购买 ${item.name}`, right: `§${item.price}` }, { label: '再想想' }], {
        cb: (i) => {
          if (i !== 0) return;
          S.money -= item.price;
          S.owned[item.key] = true;
          this.objects.applyPurchase(item.key);
          Audio.sfx('coin');
          this.ui.toast(`${item.name} 已送达安装!`, 'money');
          this.autosave();
        },
      });
    }
  }

  // ================= 渲染 =================
  draw() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#08131f';
    ctx.fillRect(0, 0, 480, 320);

    switch (this.state) {
      case 'boot': this.drawBoot(ctx); break;
      case 'title': this.drawTitle(ctx); break;
      case 'charsel': this.drawCharsel(ctx); break;
      case 'work': this.drawWork(ctx); break;
      case 'newday': this.drawNewday(ctx); break;
      case 'status':
        this.drawPlayScene(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ui.drawStatus(ctx, this.sim);
        break;
      case 'help':
        this.drawPlayScene(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.drawHelp(ctx);
        break;
      case 'shop':
        this.drawPlayScene(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.drawShop(ctx);
        break;
      default:
        this.drawPlayScene(ctx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ui.drawHUD(ctx, this.sim, this);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ui.drawOverlay(ctx);
  }

  camera() {
    const p = this.player;
    return {
      x: Math.round(Math.max(0, Math.min(this.world.pxW - 240, p.px + 8 - 120))),
      y: Math.round(Math.max(0, Math.min(this.world.pxH - 160, p.py + 8 - 80))),
    };
  }

  drawPlayScene(ctx) {
    if (!this.player) return;
    const cam = this.camera();
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.world.ground, -cam.x, -cam.y);

    // 待排序绘制单元
    const drawables = drawablesFor(this.objects, this.art, this.sim, this);
    // 玩家(坐在家具上时排序抬高,保证画在家具之上)
    if (!(this.action && this.action.hidden)) {
      const ra = this.action && this.action.renderAt;
      const py = ra ? ra.py : this.player.py;
      drawables.push({ sortY: py + TILE + (ra ? 5 : 0), draw: (g, c) => this.drawPlayer(g, c) });
    }
    if (this.visitor && this.visitor.active) {
      drawables.push({ sortY: this.visitor.sortY(), draw: (g, c) => this.visitor.draw(g, c, this.art) });
    }
    if (this.cat) {
      drawables.push({ sortY: this.cat.sortY(), draw: (g, c) => this.cat.draw(g, c, this.art) });
    }
    drawables.sort((a, b) => a.sortY - b.sortY);
    for (const d of drawables) d.draw(ctx, cam);

    // 心情宝石(最上层世界元素)
    if (!(this.action && this.action.hidden)) this.drawPlumbob(ctx, cam);

    // 进度条(有目标需求的行动)
    if (this.action && this.action.until) {
      const v = this.sim.state.needs[this.action.until] / 100;
      const ax = (this.action.renderAt ? this.action.renderAt.px : this.player.px) - cam.x;
      const ay = (this.action.renderAt ? this.action.renderAt.py : this.player.py) - cam.y;
      drawBar(ctx, ax - 2, ay - 6, 20, 2, v, '#48d878');
    }

    // 昼夜 + 灯光
    applyDayNight(ctx, cam, this.sim.state.clock, this.sim.state.power, this.world, this.art, lightsOf(this.objects, this, this.sim.state.power));

    // 气泡
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const camScaled = { x: cam.x, y: cam.y };
    ctx.save();
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBubblesScaled(ctx, camScaled);
    ctx.restore();
  }

  drawBubblesScaled(ctx, cam) {
    this.ui.drawBubbles(ctx, cam);
  }

  drawPlayer(g, cam) {
    const p = this.player;
    const set = this.art.chars[this.sim.state.charIdx];
    let img;
    let px = p.px, py = p.py;
    if (this.action && this.action.poseKind === 'sit') {
      img = set.sit;
      if (this.action.renderAt) { px = this.action.renderAt.px; py = this.action.renderAt.py; }
    } else {
      const frames = set[p.facing] || set.down;
      img = frames[p.moving ? 1 + (Math.floor(p.animT * 7) % 2) : 0];
    }
    g.drawImage(img, Math.round(px) - cam.x, Math.round(py) - cam.y);
  }

  drawPlumbob(g, cam) {
    const band = this.sim.moodBand();
    const frames = this.art.plumbob[band];
    const img = frames[Math.floor(this.t * 2.5) % 2];
    const p = this.player;
    const px = (this.action && this.action.renderAt) ? this.action.renderAt.px : p.px;
    const py = (this.action && this.action.renderAt) ? this.action.renderAt.py : p.py;
    const bob = Math.round(Math.sin(this.t * 3.2) * 1.4);
    g.drawImage(img, Math.round(px) + 4 - cam.x, Math.round(py) - 12 + bob - cam.y);
  }

  // ---------- 各屏幕 ----------
  drawBoot(ctx) {
    const a = Math.min(1, this.stateT / 0.7);
    ptext(ctx, 'CLAUDE', 120, 62, { size: 22, color: '#7d71e8', align: 'center', alpha: a });
    ptext(ctx, 'FABLE-5', 120, 88, { size: 12, color: '#b9b4e6', align: 'center', alpha: a });
    ptext(ctx, 'GAME BOY ADVANCE STYLE', 120, 140, { size: 9, color: '#4a4a6a', align: 'center', alpha: a });
  }

  drawTitle(ctx) {
    // 背景:地图截取 + 压暗
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.world.ground, -104, -60);
    ctx.fillStyle = 'rgba(18,16,48,0.55)';
    ctx.fillRect(0, 0, 240, 160);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    drawWindow(ctx, 42, 26, 156, 52, { fill: '#f8f4e8' });
    ptext(ctx, '像素小日子', 120, 34, { size: 22, color: '#4a3f9e', align: 'center', outline: '#e8e0ff' });
    ptext(ctx, '~ GBA 风 · 模拟人生 ~', 120, 59, { size: 12, color: '#8878b8', align: 'center' });

    if (Math.floor(this.blink() * 1.6) % 2 === 0) {
      ptext(ctx, 'PRESS START', 120, 104, { size: 12, color: '#f8f4d8', align: 'center', outline: '#33334a' });
    }
    ptext(ctx, 'Claude Fable 5 · ModelBenchLab 2026', 120, 148, { size: 9, color: '#9a94c8', align: 'center' });
    const save = Sim.loadRaw();
    if (save) {
      ptext(ctx, `存档:第${save.state.day}天 ${CHARACTERS[save.state.charIdx].name} §${save.state.money}`, 120, 126, { size: 12, color: '#c8c0e8', align: 'center' });
    }
  }

  blink() { return this.t; }

  drawCharsel(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawWindow(ctx, 20, 14, 200, 132);
    ptext(ctx, '你想成为谁?', 120, 22, { size: 13, color: '#33334a', align: 'center' });
    CHARACTERS.forEach((c, i) => {
      const x = 40 + i * 42, y = 46;
      const sel = i === this.selIdx;
      if (sel) {
        ctx.fillStyle = '#e8e0f8';
        ctx.fillRect((x - 4) * 2, (y - 4) * 2, 40 * 2, 52 * 2);
        ctx.strokeStyle = '#8878d0'; ctx.lineWidth = 2;
        ctx.strokeRect((x - 4) * 2, (y - 4) * 2, 40 * 2, 52 * 2);
      }
      const img = this.art.chars[i].down[sel ? (Math.floor(this.t * 5) % 2 ? 1 : 2) : 0];
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x * 2, y * 2, 64, 64);
      ptext(ctx, c.name, x + 16, y + 36, { size: 12, color: sel ? '#4a3f9e' : '#8888a0', align: 'center' });
    });
    ptext(ctx, CHAR_DESC[this.selIdx], 120, 111, { size: 12, color: '#55556a', align: 'center' });
    ptext(ctx, '← → 选择 · A 确定 · B 返回', 120, 129, { size: 12, color: '#8878b8', align: 'center' });
  }

  drawWork(ctx) {
    const S = this.sim.state;
    ctx.fillStyle = '#10101e';
    ctx.fillRect(0, 0, 480, 320);
    const dots = '·'.repeat(1 + (Math.floor(this.stateT * 3) % 3));
    ptext(ctx, `上班中${dots}`, 120, 60, { size: 16, color: '#d8e0f8', align: 'center' });
    ptext(ctx, `${JOB_TITLES[S.job.level - 1]} · 出勤心情 ${this.workMood}`, 120, 86, { size: 12, color: '#8890b8', align: 'center' });
    drawBar(ctx, 84, 106, 72, 4, Math.min(1, this.stateT / 2.8), '#5890d8');
    ptext(ctx, '心情越好,工资越高', 120, 124, { size: 12, color: '#5a5a80', align: 'center' });
  }

  drawNewday(ctx) {
    const S = this.sim.state;
    ctx.fillStyle = '#0a0a16';
    ctx.fillRect(0, 0, 480, 320);
    const a = Math.min(1, this.stateT / 0.5);
    ptext(ctx, `第 ${S.day} 天`, 120, 60, { size: 20, color: '#f8f4d8', align: 'center', alpha: a });
    ptext(ctx, `周${WEEKDAYS[S.weekday - 1]} · 睡了 ${this.sleepInfo ? this.sleepInfo.hours : 8} 小时`, 120, 90, { size: 12, color: '#9a94c8', align: 'center', alpha: a });
  }

  drawHelp(ctx) {
    drawWindow(ctx, 16, 6, 208, 148);
    ptext(ctx, '操作帮助', 120, 12, { size: 13, color: '#33334a', align: 'center' });
    const lines = [
      '方向键/WASD 走动,按住 B 跑',
      'A(Z/J/空格) 互动 / 确认',
      'B(X/K) 取消 / 中断行动',
      'START 菜单 · SELECT 收起界面',
      'M 音乐开关',
      '保持需求,心情好工资才高;',
      '周一账单逾期会停电;',
      '拿起电话可以购物升级家具。',
    ];
    lines.forEach((ln, i) => ptext(ctx, ln, 26, 28 + i * 14, { size: 12, color: '#55556a' }));
  }

  drawShop(ctx) {
    const S = this.sim.state;
    drawWindow(ctx, 18, 10, 204, 140);
    ptext(ctx, '家居购物热线', 120, 16, { size: 13, color: '#33334a', align: 'center' });
    CATALOG.forEach((item, i) => {
      const y = 34 + i * 14;
      const sel = i === this.shopIdx;
      const owned = !!S.owned[item.key];
      if (sel) {
        ctx.fillStyle = '#e8e0f8';
        ctx.fillRect(26 * 2, (y - 1) * 2, 188 * 2, 14 * 2);
        ptext(ctx, '▶', 28, y + 1, { size: 10, color: '#d8506e' });
      }
      ptext(ctx, item.name, 38, y, { size: 12, color: owned ? '#a8a8b8' : '#33334a' });
      ptext(ctx, owned ? '已购' : `§${item.price}`, 210, y, { size: 12, color: owned ? '#88a888' : '#b06830', align: 'right' });
    });
    const cur = CATALOG[this.shopIdx];
    ptext(ctx, cur.desc, 38, 121, { size: 12, color: '#7868a8' });
    ptext(ctx, `余额 §${S.money} · A 购买 B 挂断`, 120, 137, { size: 12, color: '#8878b8', align: 'center' });
  }
}
