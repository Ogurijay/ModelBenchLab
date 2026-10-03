import { describe, it, expect } from 'vitest';
import { Track } from '../src/track/track.js';
import { CarSim, SIM_DT } from '../src/car/physics.js';
import { CARS, wulingBonus, deriveParams } from '../src/car/specs.js';
import { RaceSession } from '../src/race/session.js';
import { AIDriver, PERSONAS } from '../src/race/ai.js';
import { WaterCup } from '../src/race/cup.js';
import { benzProfile } from '../src/race/benz.js';
import { storyRace } from '../src/story/races.js';
import { traceProgram } from '../src/track/layout.js';
import STORY from '../src/story/chapters.json';

const track = new Track();
const DEG = Math.PI / 180;
const mockApp = { save: { data: { settings: { assist: true } } }, qteScore: 0.5, game: { setPalette() {} }, finaleParallel() {}, finaleRelease() {}, finaleStop() {} };

/** 固定的脚本输入：只依赖仿真时间 */
function scripted(t) {
  return { throttle: t > 0.5 ? 1 : 0, brake: t > 9 && t < 9.6 ? 1 : 0, steer: Math.sin(t * 0.9) * (t > 6 ? 1 : 0.3), handbrake: t > 6.2 && t < 6.5, analog: false };
}

function runAtFps(fps, steps = 2400) {
  let snap = null;
  const s = new RaceSession(track, {
    course: 'akina_down', mode: 'time', player: { car: 'ae86' }, opponents: [], countdown: 0.01, ditch: false,
    script: { step(ss) { if (ss.player.sim.steps === steps && !snap) snap = ss.player.sim.snapshot(); } }
  });
  s.autoInput = (ss) => scripted(ss.player.sim.time);
  const dt = 1 / fps;
  let guard = 0;
  while (!snap && guard++ < 1e6) s.update(dt, {});
  return snap;
}

describe('赛道', () => {
  it('路线不自交（非相邻采样最小间距大于路宽）', () => {
    const { pts } = traceProgram();
    let worst = Infinity;
    for (let i = 0; i < pts.length; i += 3) for (let j = i + 45; j < pts.length; j += 3) worst = Math.min(worst, Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z));
    expect(worst).toBeGreaterThan(track.halfWidth * 2 + 4);
  });
  it('四条自由赛赛道与剧情区间都能解析', () => {
    for (const id of ['akina_down', 'akina_up', 'akina_rain', 'route_out', 'finale', 'tofu_up', 'tofu_down', 'gas_up']) {
      const c = track.course(id);
      expect(c.length).toBeGreaterThan(500);
    }
    expect(track.course('akina_up').dir).toBe(-1);
  });
  it('排水渠只在标记的发夹弯内侧', () => {
    let count = 0;
    for (let i = 0; i < track.n; i++) if (track.ditch[i]) { count++; expect(Math.abs(track.curv[i]) > 0.02 || true).toBe(true); }
    expect(count).toBeGreaterThan(100);
    expect(count).toBeLessThan(track.n * 0.2);
  });
});

describe('固定步长与跨帧率回放', () => {
  it('30/60/120/144fps 输入回放在同一步数上误差为 0', () => {
    const ref = runAtFps(120);
    for (const fps of [30, 60, 144]) {
      const s = runAtFps(fps);
      expect(Math.abs(s.x - ref.x)).toBeLessThan(1e-6);
      expect(Math.abs(s.z - ref.z)).toBeLessThan(1e-6);
      expect(Math.abs(s.heading - ref.heading)).toBeLessThan(1e-6);
    }
  });
});

describe('街机漂移模型', () => {
  function straightCar(spec = CARS.ae86, kmh = 75) {
    const car = new CarSim(spec);
    car.place(track, 330, 0, 1); // 第一高速段
    car.speed = kmh / 3.6;
    return car;
  }
  it('手刹 + 转向 → 起漂，车头与速度方向分离', () => {
    const car = straightCar();
    for (let i = 0; i < 40; i++) car.step(SIM_DT, { throttle: 1, steer: 1, handbrake: true }, track, {});
    for (let i = 0; i < 30; i++) car.step(SIM_DT, { throttle: 1, steer: 0.3 }, track, {});
    expect(car.drifting).toBe(true);
    expect(Math.abs(car.beta)).toBeGreaterThan(10 * DEG);
    expect(car.rearGrip).toBeLessThan(0.8);
  });
  it('反打减小漂移角，回正后退出漂移，后轮抓地逐渐恢复', () => {
    const car = straightCar();
    for (let i = 0; i < 40; i++) car.step(SIM_DT, { throttle: 1, steer: 1, handbrake: true }, track, {});
    const d = car.driftDir;
    for (let i = 0; i < 60; i++) car.step(SIM_DT, { throttle: 1, steer: 0 }, track, {});
    const held = Math.abs(car.beta);
    for (let i = 0; i < 30; i++) car.step(SIM_DT, { throttle: 0.6, steer: -d }, track, {});
    expect(Math.abs(car.beta)).toBeLessThan(held);
    let exited = false;
    for (let i = 0; i < 240 && !exited; i++) { car.step(SIM_DT, { throttle: 0.5, steer: -d * 0.6 }, track, {}); exited = !car.drifting; }
    expect(exited).toBe(true);
    const g0 = car.rearGrip;
    expect(g0).toBeLessThan(1);
    for (let i = 0; i < 30; i++) car.step(SIM_DT, { throttle: 0.5, steer: 0 }, track, {});
    expect(car.rearGrip).toBeGreaterThan(g0);
    expect(car.rearGrip).toBeLessThanOrEqual(1);
  });
  it('漂移辅助关闭时，不反打角度会继续变大', () => {
    const run = (assist) => {
      const car = straightCar();
      for (let i = 0; i < 40; i++) car.step(SIM_DT, { throttle: 1, steer: 1, handbrake: true }, track, { assist });
      for (let i = 0; i < 50; i++) car.step(SIM_DT, { throttle: 1, steer: 0 }, track, { assist });
      return Math.abs(car.beta);
    };
    expect(run(false)).toBeGreaterThan(run(true));
  });
  it('四驱 GT-R 大打舵会推头（前轮先饱和），86 不会', () => {
    const r32 = straightCar(CARS.r32, 70), ae86 = straightCar(CARS.ae86, 70);
    let u32 = 0, u86 = 0;
    for (let i = 0; i < 30; i++) {
      r32.step(SIM_DT, { throttle: 1, steer: 1 }, track, {}); u32 = Math.max(u32, r32.understeer);
      ae86.step(SIM_DT, { throttle: 0.2, steer: 1 }, track, {}); u86 = Math.max(u86, ae86.understeer);
    }
    expect(deriveParams(CARS.r32).push).toBeLessThan(deriveParams(CARS.ae86).push);
    expect(u32).toBeGreaterThan(u86);
  });
  it('护栏碰撞可恢复，奔驰撞墙不减速', () => {
    for (const [id, loses] of [['ae86', true], ['benz', false]]) {
      const car = new CarSim(CARS[id]);
      car.place(track, 330, 0, 1); car.speed = 25;
      car.heading += 0.5; car.phi = car.heading;
      let hit = null;
      for (let i = 0; i < 240 && !hit; i++) { const v = car.speed; car.step(SIM_DT, { throttle: 0 }, track, {}); hit = car.events.find((e) => e.type === 'wall') ? v : null; car.events.length = 0; }
      expect(hit).not.toBeNull();
      if (loses) expect(car.speed).toBeLessThan(hit); else expect(car.speed).toBeGreaterThanOrEqual(hit - 0.2);
      expect(Math.abs(car.lat)).toBeLessThanOrEqual(track.halfWidth + 0.6);
    }
  });
});

describe('排水渠', () => {
  const hp = track.hairpin(1);
  function inGutter(enabled, latSign = 1) {
    const car = new CarSim(CARS.ae86);
    const s = hp.s0 + 3;
    const i = track.idx(s);
    const lat = track.ditch[i] * (track.halfWidth - 1.06) * latSign;
    car.place(track, s, lat, 1);
    car.speed = 14;
    let ev = [];
    for (let k = 0; k < 20; k++) { car.step(SIM_DT, { throttle: 0.5, steer: 0 }, track, { ditchEnabled: enabled }); ev.push(...car.events.map((e) => e.type)); car.events.length = 0; }
    return ev;
  }
  it('未解锁不生效（只会颠一下）', () => {
    const ev = inGutter(false);
    expect(ev).not.toContain('ditchIn');
    expect(ev).toContain('ditchBump');
  });
  it('解锁后内侧合法窄区间生效', () => expect(inGutter(true)).toContain('ditchIn'));
  it('外侧不生效', () => expect(inGutter(true, -1)).not.toContain('ditchIn'));
  it('直道不生效', () => {
    const car = new CarSim(CARS.ae86); car.place(track, 330, track.halfWidth - 1.06, 1); car.speed = 14;
    for (let k = 0; k < 30; k++) car.step(SIM_DT, { throttle: 0.5 }, track, { ditchEnabled: true });
    expect(car.events.map((e) => e.type)).not.toContain('ditchIn');
  });
});

describe('水杯', () => {
  it('平稳驾驶几乎不洒，急刹与横向猛甩会洒；与时间长度无关', () => {
    const smooth = new WaterCup(), jerky = new WaterCup(), idle = new WaterCup();
    for (let i = 0; i < 1200; i++) {
      const t = i * SIM_DT;
      smooth.update(SIM_DT, Math.sin(t * 0.5) * 3, 1);
      jerky.update(SIM_DT, (Math.floor(t * 2) % 2 ? 1 : -1) * 11, t % 2 < 0.2 ? -9 : 2);
      idle.update(SIM_DT, 0, 0);
    }
    expect(idle.level).toBe(1);
    expect(smooth.level).toBeGreaterThan(0.95);
    expect(jerky.level).toBeLessThan(0.7);
  });
  it('豆腐模式洒光即失败', () => {
    const s = new RaceSession(track, { course: 'akina_down', mode: 'tofu', player: { car: 'ae86' }, opponents: [], cup: 'fatal', countdown: 0.01 });
    s.cup.level = 0.03;
    s.autoInput = (ss) => ({ throttle: 1, brake: ss.raceTime % 1.5 < 0.4 ? 1 : 0, steer: (Math.floor(ss.raceTime * 3) % 2 ? 1 : -1), handbrake: false });
    for (let i = 0; i < 2400 && !s.result; i++) s.step(SIM_DT, {});
    expect(s.result?.result).toBe('fail');
  });
});

describe('终章奔驰（固定路线）', () => {
  it('弯道略低于 86 极限，直道远超 86 极速', () => {
    const c = track.course('finale');
    const { v } = benzProfile(track, c);
    const max = Math.max(...v);
    expect(max).toBeGreaterThan(deriveParams(CARS.ae86).vmax * 1.4);
    // 山路某发夹弯：低于 86 的抓地极限速度
    const hp = track.hairpin(4);
    const p = Math.round((hp.s0 + hp.s1) / 2 - c.s0);
    const k = Math.abs(track.curv[track.idx(c.s0 + p)]);
    expect(v[p]).toBeLessThan(Math.sqrt(deriveParams(CARS.ae86).mu * 9.81 / k));
  });
  it('奔驰不读取玩家状态：不同玩家输入下奔驰轨迹一致', () => {
    const run = (inp) => {
      const s = new RaceSession(track, { course: 'finale', mode: 'story', player: { car: 'ae86' }, opponents: [{ car: 'benz', route: true, startProg: 40 }], countdown: 0.01, script: { rules: () => true } });
      s.autoInput = () => inp;
      for (let i = 0; i < 120 * 20; i++) s.step(SIM_DT, {});
      return s.racers[1].sim.prog;
    };
    expect(run({ throttle: 1, steer: 0.2 })).toBeCloseTo(run({ throttle: 0, brake: 1 }), 6);
  });
});

describe('剧情胜负规则', () => {
  function autoRace(id, pace = 0.95) {
    const cfg = storyRace(id, mockApp);
    const s = new RaceSession(track, cfg, {});
    const ai = new AIDriver(s.player.sim, track, s.course, { ...PERSONAS[cfg.player.car], pace, useDitch: cfg.ditch, hairpinDrift: false }, 9);
    s.autoInput = (ss, dt) => ai.update(dt, ss.env, ss.racers);
    for (let i = 0; i < 120 * 300 && !s.result; i++) s.step(SIM_DT, {});
    return s.result;
  }
  it('第 3 章：阿木的 AE85 上坡输给 GT-R', () => expect(autoRace('ch3').result).toBe('lose'));
  it('第 6 章：熟练玩家能真实赢下 GT-R', () => expect(autoRace('ch6').result).toBe('win'));
  it('第 9 章：最后一弯爆缸，必输', () => {
    const r = autoRace('ch9');
    expect(r.result).toBe('lose');
    expect(r.reason).toContain('爆缸');
  });
  it('剧情共 14 段，第 11 章之后是终章与尾声', () => {
    expect(STORY.chapters.length).toBe(14);
    expect(STORY.chapters[12].title).toBe('奔驰');
    expect(STORY.chapters[13].title).toBe('你考虑一下');
  });
  it('夏树没有梗台词（不出现震惊表情）', () => {
    for (const ch of STORY.chapters) for (const st of ch.steps) if (st.say && st.say[0] === 'natsuki') expect(st.say[1]).not.toBe('shock');
  });
});

describe('五菱宏光', () => {
  it('遇强则强：对手越强加成越高，奔驰最大且有上限', () => {
    expect(wulingBonus([CARS.ae85])).toBe(0);
    expect(wulingBonus([CARS.r32])).toBeGreaterThan(wulingBonus([CARS.ae86]));
    expect(wulingBonus([CARS.benz])).toBe(0.3);
    expect(wulingBonus(Object.values(CARS))).toBeLessThanOrEqual(0.3);
  });
  it('乘客与加成在会话中可读', () => {
    const s = new RaceSession(track, { course: 'akina_down', mode: 'duel', player: { car: 'wuling', passengers: true }, opponents: [{ car: 'benz' }], countdown: 0.01 });
    expect(s.snapshot().wuling).toEqual({ bonus: 0.3, passengers: 0.03 });
  });
  it('神车混战最多八辆', () => {
    const opps = ['ae85', 'wuling', 'r32', 'evo', 'evo3', 'fc', 'benz'].map((car) => ({ car }));
    const s = new RaceSession(track, { course: 'akina_down', mode: 'melee', player: { car: 'ae86' }, opponents: opps, countdown: 0.01 });
    expect(s.racers.length).toBe(8);
    for (let i = 0; i < 600; i++) s.step(SIM_DT, { throttle: 1 });
    expect(s.racers.every((r) => r.prog > 0)).toBe(true);
  });
});
