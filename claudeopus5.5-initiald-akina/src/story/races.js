// 各章比赛配置与剧情专用脚本。
// outcome：'win' 必须真实赢下（输了重试）；'lose' 注定失败（不会卡关）；'any' 结果不影响推进。
import { PALETTES, lerpPalette } from '../fx/palette.js';
import { clamp } from '../core/math.js';

export function storyRace(id, app) {
  const save = app.save.data;
  const base = { seed: 86, assist: save.settings.assist };
  switch (id) {
    case 'ch1': return { ...base, course: 'tofu_up', palette: 'dawn', mode: 'time', player: { car: 'ae86' }, opponents: [], cup: 'fatal', ditch: false, outcome: 'win', goal: '把豆腐送上山。水杯别洒光。', danmaku: 'quiet' };
    case 'ch3': return { ...base, course: 'gas_up', palette: 'dusk', mode: 'duel', player: { car: 'ae85', name: '阿木的85' }, opponents: [{ car: 'r32', persona: { pace: 0.99, pushAware: 1 }, paceMul: 1.02 }], ditch: false, outcome: 'lose', goal: '开着阿木的 AE85，上坡追六叔的 GT-R。' };
    case 'ch4': return { ...base, course: 'tofu_down', palette: 'night', mode: 'chase', chaseRole: 'leader', gapWin: 150, rolling: 17, chaseGap: 30, player: { car: 'ae86' }, opponents: [{ car: 'r32', paceMul: 1.0 }], cup: 'show', ditch: false, outcome: 'win', hidePos: true, goal: '送完豆腐回家。后面那台车一直在闪灯。' };
    case 'ch6': return { ...base, course: 'akina_down', palette: 'night', mode: 'duel', player: { car: 'ae86' }, opponents: [{ car: 'r32', paceMul: 0.97 }], ditch: true, outcome: 'win', goal: '赢了，就能借车去海边。' };
    case 'ch8': return { ...base, course: 'akina_down', palette: 'night', mode: 'duel', player: { car: 'ae86' }, opponents: [{ car: 'evo', paceMul: 1.0 - (app.qteScore ?? 0) * 0.015 }], ditch: true, outcome: 'win', goal: '夏树说，今晚会在山顶等你。' };
    case 'ch9': return { ...base, course: 'akina_rain', rain: true, palette: 'rain', mode: 'duel', player: { car: 'ae86' }, opponents: [{ car: 'evo3', paceMul: 1.0 }], ditch: true, outcome: 'lose', goal: '快点跑完，去找她。', script: blowScript(app) };
    case 'ch11': return { ...base, course: 'akina_down', palette: 'night', mode: 'duel', player: { car: 'ae86' }, opponents: [{ car: 'fc', persona: { useDitch: true, hairpinDrift: false, pace: 0.96 }, paceMul: 1.0 }], ditch: true, outcome: 'win', goal: '证明那台连夜换上的引擎。' };
    case 'finale': return { ...base, course: 'finale', palette: 'dawn', mode: 'story', player: { car: 'ae86' }, opponents: [{ car: 'benz', route: true, startProg: 40, name: '奔驰' }], cup: 'show', ditch: true, rolling: 15, countdown: 0.01, outcome: 'lose', hidePos: true, goal: '', script: finaleScript(app) };
    default: throw new Error('未知比赛 ' + id);
  }
}

/** 第 9 章：最后一个发夹弯，86 必爆缸 */
function blowScript(app) {
  return {
    start(s) {
      const hp = s.track.hairpin(6);
      s.flags.blowAt = (hp.s0 - s.course.s0) * s.course.dir - 6;
    },
    step(s) {
      const p = s.player;
      if (s.state === 'race' && !s.flags.blown && p.prog >= s.flags.blowAt) {
        s.flags.blown = true;
        p.sim.engineBlown = true;
        s.emit('blow');
      }
      if (s.flags.blown) p.sim.speed = Math.max(0, p.sim.speed - 1.6 * (1 / 120)); // 拉缸：额外阻力
    },
    rules(s) {
      if (!s.flags.blown) {
        // 爆缸之前对手先到也算输（正常规则）
        return false;
      }
      const opp = s.racers[1];
      if (opp.finished || s.player.finished) { s._end('lose', '最后一弯，86 爆缸'); return true; }
      return true;
    }
  };
}

/**
 * 终章：奔驰沿固定路线行驶（不读取玩家）。
 * 最后一个发夹弯触发区：导演把镜头切成并排慢镜头（保证每个玩家都能看到这一眼），
 * 出弯后奔驰按路线在直道远去；86 停在路边，长久沉默后弹幕逐渐刷屏，化为标题卡。
 */
function finaleScript(app) {
  const dawn = PALETTES.dawn, white = PALETTES.finale;
  let lastPal = -1;
  return {
    start(s) {
      const hp = s.track.hairpin(6);
      const prog = (x) => (x - s.course.s0) * s.course.dir;
      s.flags.trigger = prog(hp.s0) - 14;
      s.flags.hpEnd = prog(hp.s1) + 6;
      s.flags.foot = prog(s.track.anchor('foot'));
      s.flags.phase = 'chase';
      s.flags.t = 0;
    },
    step(s, dt) {
      const f = s.flags, p = s.player, benz = s.racers[1];
      f.t += dt;
      // 色调：山路黎明 → 出山后过曝的白与淡金
      const k = clamp((p.prog - f.foot) / 500, 0, 1);
      if (Math.abs(k - lastPal) > 0.02) { lastPal = k; app.game.setPalette(lerpPalette(dawn, white, k)); }
      if (f.phase === 'chase' && p.prog >= f.trigger) {
        f.phase = 'parallel'; f.pt = 0;
        app.finaleParallel(s);
      }
      if (f.phase === 'parallel') {
        f.pt += dt;
        // 导演并排：奔驰在玩家外侧车道同速滑过发夹弯
        benz.sim.staged = true;
        benz.sim.prog = p.prog + 0.8;
        benz.sim.lat = p.sim.lat - Math.sign(p.sim.lat || 1) * 2.7;
        benz.sim.speed = p.sim.speed;
        benz.sim.place();
        if (f.pt > 0.55 || p.prog > f.hpEnd) { f.phase = 'straight'; benz.sim.staged = false; benz.sim.lat = benz.sim.prof.lane * s.course.dir; app.finaleRelease(s); }
      }
      if (f.phase === 'straight') {
        if (benz.prog - p.prog > 420 || p.prog > f.foot + 900) { f.phase = 'stop'; app.finaleStop(s); }
      }
    },
    rules(s) {
      return true; // 由脚本与表现层推进结局，不按普通规则判定
    }
  };
}
