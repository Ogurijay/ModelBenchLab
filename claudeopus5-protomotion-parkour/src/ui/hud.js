// HUD:四行读数 + FPS/高度 + 轨迹面板 + 操作提示条。
//
// 四行读数的**文字、列宽、颜色**都照 ProtoMotionCharacter::Tick 的
// AddOnScreenDebugMessage 抄,包括 Clip 缺省时的 `<no anim instance>`。
// 这样把网页截图和 UE 里的截图并排放,能逐行对读 —— 这是这次对照实现的验收方式之一。
import { MOTION_STATE } from '../sim/protoTypes.js';

const $ = (id) => document.getElementById(id);

/** 四行读数的标签。列宽靠 CSS 的等宽字体 + 固定 ch 宽度对齐,不用手填空格。 */
const READOUT_ROWS = [
  ['state', 'MotionState'],
  ['clip', 'Clip'],
  ['speed', 'Speed'],
  ['wall', 'Wall'],
];

/** 状态 → 配色。UE 那边整行是青色,这里按状态家族分色,一眼看出现在在哪条轨道上。 */
const STATE_CLASS = {
  [MOTION_STATE.Wallrunning]: 'st-wall',
  [MOTION_STATE.Climbing]: 'st-wall',
  [MOTION_STATE.Sliding]: 'st-wall',
  [MOTION_STATE.Gliding]: 'st-air',
  [MOTION_STATE.Jumping]: 'st-air',
  [MOTION_STATE.Falling]: 'st-air',
};

/**
 * 操作表(PORT_SPEC §9)。底部提示条与开始面板的按键网格都从这一份渲染,
 * 免得两处描述漂移 —— 尤其是「Alt = 轻推」这条,它是键盘 0/1 与 WalkInputThreshold 之间唯一的桥。
 */
export const KEY_HINTS = [
  { key: 'W A S D', short: '移动', desc: '前后左右。键盘默认满推 = 跑' },
  {
    key: '按住 Alt',
    short: '轻推(走)',
    desc: '把输入幅度压到 0.35,低于 WalkInputThreshold 0.55 → 走而不是跑',
  },
  { key: '鼠标', short: '', desc: '视角(点画面锁定指针)' },
  { key: 'Shift', short: '冲刺', desc: '冲刺 1500;起跳会更高更远' },
  { key: '空格', short: '点按=跳', desc: '点按 = 跳;冲刺中起跳更远;贴墙时是墙跳' },
  { key: '空格(空中)', short: '按住=滑翔', desc: '空中按住 = 滑翔;离地不足 150 cm 不起滑' },
  { key: 'Ctrl', short: '翻滚', desc: '翻滚 0.55 s,期间速度由翻滚独占' },
  { key: 'T', short: '轨迹', desc: '轨迹面板开关(UE 的 -ProtoTrace 等价物)' },
  { key: 'Esc', short: '暂停', desc: '暂停 / 菜单' },
];

/** 不靠按键、靠环境触发的那半套系统。放在开始面板里,不然玩家不会知道该往墙上撞。 */
export const AUTO_HINTS = [
  '跑向墙 → 自动贴墙攀爬',
  '冲刺撞墙(≥900)→ 跑墙,动能耗尽后交接攀爬',
  '贴墙后松开方向 → 0.6 s 转下滑',
  '爬到墙顶 → 自动翻越',
  '撞胸高矮块(80 cm)→ 自动翻越',
];

/** %.0f 的等价物,顺手把 -0 抹平(JS 里 Math.round(-0.4) 是 -0,打出来是 "-0")。 */
function int(v) {
  const n = Math.round(Number.isFinite(v) ? v : 0);
  return n === 0 ? 0 : n;
}

/**
 * 速度与位置住在 KinematicBody 上;PORT_SPEC §10 给 ProtoMovement 定的公开面里没有它们。
 * main.js 递进来的是 movement,所以按 movement.body → movement 两级找,找不到退化成 0 ——
 * 表现层不该因为一个字段的位置把整个主循环带崩。
 */
const ZERO = { x: 0, y: 0, z: 0 };
function vecOf(movement, key) {
  if (!movement) return ZERO;
  if (movement.body && movement.body[key]) return movement.body[key];
  if (movement[key]) return movement[key];
  return ZERO;
}

/** UE 的 Wall 行读的是 GetWallProbe().bValid,不是 IsOnWall() —— 探到了就算,哪怕还没贴上。 */
function wallDetected(movement) {
  const probe = movement && movement.wallProbe;
  if (!probe) return false;
  return !!(probe.valid !== undefined ? probe.valid : probe.bValid);
}

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'),
      readout: $('readout'),
      perf: $('perf'),
      trace: $('trace'),
      traceLog: $('trace-log'),
      keys: $('keys'),
    };

    /** 每行的值节点。缓存节点 + 缓存上一次的文字,避免每帧写 DOM 触发重排。 */
    this.rows = new Map();
    this.last = new Map();
    if (this.el.readout) {
      this.el.readout.innerHTML = '';
      for (const [id, label] of READOUT_ROWS) {
        const row = document.createElement('div');
        row.className = `ro ro-${id}`;
        row.innerHTML = `<i>${label}</i><em>:</em><span></span>`;
        this.el.readout.appendChild(row);
        this.rows.set(id, row.querySelector('span'));
      }
    }

    if (this.el.keys) {
      this.el.keys.textContent = KEY_HINTS.filter((h) => h.short)
        .map((h) => `${h.key} ${h.short}`)
        .join('  ·  ');
    }

    /** 轨迹:UE 里 -ProtoTrace 每 0.25 s 打一行,这里同频、同格式、只留最近 40 行。 */
    this.traceOn = false;
    this.traceLines = [];
    this.traceAcc = 0;
    this.traceMax = 40;
    this.traceInterval = 0.25;
    this.traceDirty = false;

    this._lastNow = 0;
  }

  setVisible(on) {
    if (this.el.hud) this.el.hud.classList.toggle('hidden', !on);
  }

  setTraceVisible(on) {
    this.traceOn = !!on;
    if (this.el.trace) this.el.trace.classList.toggle('hidden', !this.traceOn);
    // 刚打开时先冲一行,不然要等 0.25 s 才有内容,看着像坏了。
    if (this.traceOn) this.traceAcc = this.traceInterval;
  }

  toggleTrace() {
    this.setTraceVisible(!this.traceOn);
    return this.traceOn;
  }

  isTraceVisible() {
    return this.traceOn;
  }

  clearTrace() {
    this.traceLines.length = 0;
    this.traceDirty = true;
  }

  /** 值变了才写 DOM。 */
  _set(id, text, cls) {
    const node = this.rows.get(id);
    if (!node) return;
    if (this.last.get(id) !== text) {
      node.textContent = text;
      this.last.set(id, text);
    }
    if (cls !== undefined && node.dataset.cls !== cls) {
      node.className = cls;
      node.dataset.cls = cls;
    }
  }

  /**
   * @param {object} movement ProtoMovement
   * @param {object|null} animInstance ProtoAnimInstance;没载好模型时给 null
   * @param {number} fps 主循环算好的帧率
   */
  update(movement, animInstance, fps) {
    // 轨迹要按真实时间计时,而签名里没有 dt,所以自己量。
    const now = performance.now();
    const dt = this._lastNow ? Math.min((now - this._lastNow) / 1000, 0.25) : 0;
    this._lastNow = now;

    const vel = vecOf(movement, 'velocity');
    const pos = vecOf(movement, 'position');
    const speed2D = Math.hypot(vel.x || 0, vel.y || 0);
    const state = (movement && movement.motionState) || MOTION_STATE.NotSet;
    // UE 在 Cast<UProtoAnimInstance> 失败时就是打这个字符串,照抄以便对读。
    const clip = (animInstance && animInstance.activeClipName) || '<no anim instance>';
    const wall = wallDetected(movement);

    this._set('state', state, STATE_CLASS[state] || '');
    this._set('clip', clip);
    this._set('speed', `${int(speed2D)}  (vert ${int(vel.z)})`);
    this._set('wall', wall ? 'detected' : '-', wall ? 'on' : '');

    if (this.el.perf) {
      const maxSpeed =
        movement && typeof movement.getMaxSpeed === 'function' ? int(movement.getMaxSpeed()) : '—';
      const text = `${int(fps)} FPS\nZ  ${int(pos.z)} cm\nMax ${maxSpeed}`;
      if (this.last.get('perf') !== text) {
        this.el.perf.textContent = text;
        this.last.set('perf', text);
      }
    }

    if (this.traceOn) {
      this.traceAcc += dt;
      if (this.traceAcc >= this.traceInterval) {
        this.traceAcc = 0;
        // 列宽照 UE 的 %-11s / %-34s / %6.0f / %7.0f / %7.0f,好让两边的日志能直接 diff。
        this.traceLines.push(
          `state=${state.padEnd(11)} clip=${clip.padEnd(34)} ` +
            `speed=${String(int(speed2D)).padStart(6)} vert=${String(int(vel.z)).padStart(7)} ` +
            `z=${String(int(pos.z)).padStart(7)} wall=${wall ? 1 : 0}`
        );
        if (this.traceLines.length > this.traceMax) {
          this.traceLines.splice(0, this.traceLines.length - this.traceMax);
        }
        this.traceDirty = true;
      }
      if (this.traceDirty && this.el.traceLog) {
        this.traceDirty = false;
        this.el.traceLog.textContent = this.traceLines.join('\n');
        this.el.traceLog.scrollTop = this.el.traceLog.scrollHeight;
      }
    }
  }
}
