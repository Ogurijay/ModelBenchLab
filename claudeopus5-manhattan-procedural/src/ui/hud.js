/**
 * @file src/ui/hud.js
 * @description 左上角统计 HUD（契约 §7.3）。
 *
 * 只读取 index.html 中已存在的 `#hud` 子节点，元素缺失时全部安全空转。
 * 性能约定：每帧只累加计时器，**每 0.5 秒**才写一次 DOM；FPS 用 250ms 滑动窗口平均，
 * 窗口用定长环形缓冲实现，运行期零分配（不在 update 里 new 对象/数组）。
 *
 * 天气中文名优先从 `weather/weather.js` 的 `WEATHER_LABELS` 动态导入（避免与契约 §0
 * "ui/* 不静态依赖 weather/*" 的依赖方向冲突，也避免该模块缺失时整页崩溃）；
 * 导入失败时使用下方内置兜底表。
 */

/** 内置天气中文名兜底表（与 weather/weather.js 的 6 种预设一一对应） */
const FALLBACK_WEATHER_LABELS = {
  clear: '晴',
  cloudy: '多云',
  fog: '雾',
  rain: '雨',
  storm: '雷暴',
  snow: '雪'
};

/** DOM 刷新间隔（秒） */
const REFRESH_INTERVAL = 0.5;
/** FPS 滑动窗口长度（秒） */
const FPS_WINDOW = 0.25;
/** FPS 窗口环形缓冲容量（够 600fps × 0.25s 用） */
const FPS_CAPACITY = 256;

/** FPS 分级配色：>=55 绿、>=30 黄、<30 红 */
const FPS_COLOR_GOOD = '#63e6a0';
const FPS_COLOR_WARN = '#ffcf7a';
const FPS_COLOR_BAD = '#ff7a6b';

/**
 * 安全取元素。
 * @param {string} id
 * @returns {HTMLElement|null}
 */
function byId(id) {
  if (typeof document === 'undefined' || !document.getElementById) return null;
  return document.getElementById(id);
}

/**
 * 整数千分位分组（不依赖 toLocaleString，避免不同 locale 结果不一致）。
 * @param {number} v
 * @returns {string}
 */
function groupThousands(v) {
  const n = Math.round(v);
  const neg = n < 0;
  const s = String(Math.abs(n));
  let out = '';
  for (let i = s.length - 1, c = 0; i >= 0; i--) {
    out = s.charAt(i) + out;
    c += 1;
    if (c % 3 === 0 && i > 0) out = `,${out}`;
  }
  return neg ? `-${out}` : out;
}

/**
 * 大数缩写：≥1e6 用 `1.24M`，≥1e4 用 `12.3k`，其余千分位。
 * @param {number} v
 * @returns {string}
 */
function abbreviate(v) {
  if (!Number.isFinite(v)) return '--';
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  return groupThousands(v);
}

/**
 * 分钟数 → `HH:MM`。
 * @param {number} minutes
 * @returns {string}
 */
function formatClock(minutes) {
  const raw = Number.isFinite(minutes) ? Math.floor(minutes) : 0;
  const m = ((raw % 1440) + 1440) % 1440;
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh < 10 ? '0' : ''}${hh}:${mm < 10 ? '0' : ''}${mm}`;
}

/**
 * 创建 HUD 句柄。
 * @returns {{
 *   fps:number,
 *   update:(ctx:Object, renderer:Object, extra?:{cars?:number, instances?:number, seed?:(string|number)})=>void,
 *   setVisible:(on:boolean)=>void,
 *   dispose:()=>void
 * }}
 */
export function createHud() {
  const root = byId('hud');
  const el = {
    fps: byId('hud-fps'),
    draw: byId('hud-draw'),
    tris: byId('hud-tris'),
    inst: byId('hud-inst'),
    time: byId('hud-time'),
    weather: byId('hud-weather'),
    sun: byId('hud-sun'),
    cars: byId('hud-cars'),
    seed: byId('hud-seed')
  };

  /** 天气中文名表（异步补齐后仍保留兜底键） */
  let weatherLabels = FALLBACK_WEATHER_LABELS;
  let disposed = false;
  let visible = true;
  let sinceRefresh = 0;

  // 动态导入 WEATHER_LABELS：失败（模块缺失或未导出）时静默沿用兜底表
  try {
    import('../weather/weather.js')
      .then((mod) => {
        if (disposed || !mod || !mod.WEATHER_LABELS) return;
        weatherLabels = Object.assign({}, FALLBACK_WEATHER_LABELS, mod.WEATHER_LABELS);
      })
      .catch(() => {});
  } catch (err) {
    weatherLabels = FALLBACK_WEATHER_LABELS;
  }

  /* --------------------- FPS：250ms 滑动窗口（环形缓冲） --------------------- */
  const window250 = new Float64Array(FPS_CAPACITY);
  let winStart = 0;
  let winCount = 0;
  let winSum = 0;

  /**
   * 压入一帧耗时并维持窗口总时长 ≈ 250ms。
   * @param {number} dt 秒
   */
  const pushFrame = (dt) => {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    if (winCount === FPS_CAPACITY) {
      winSum -= window250[winStart];
      winStart = (winStart + 1) % FPS_CAPACITY;
      winCount -= 1;
    }
    window250[(winStart + winCount) % FPS_CAPACITY] = dt;
    winSum += dt;
    winCount += 1;
    // 丢弃最老样本，直到再丢一个就不足 250ms 为止
    while (winCount > 1 && winSum - window250[winStart] >= FPS_WINDOW) {
      winSum -= window250[winStart];
      winStart = (winStart + 1) % FPS_CAPACITY;
      winCount -= 1;
    }
    handle.fps = winSum > 0 ? winCount / winSum : 0;
  };

  /* ------------------------- 文本写入去重缓存 ------------------------- */
  const cache = {
    fps: '', draw: '', tris: '', inst: '',
    time: '', weather: '', sun: '', cars: '', seed: '', color: ''
  };

  /**
   * 仅在内容变化时写 DOM。
   * @param {HTMLElement|null} node
   * @param {string} key cache 键
   * @param {string} text
   */
  const write = (node, key, text) => {
    if (!node || cache[key] === text) return;
    cache[key] = text;
    node.textContent = text;
  };

  const handle = {
    /** 最近 250ms 平均帧率（main.js 的 __bench.stats() 会读取） */
    fps: 0,

    /**
     * 每帧调用：累计计时与帧率，满 0.5s 才刷新文本。
     * @param {Object} ctx 帧上下文（契约 §2）
     * @param {Object} renderer THREE.WebGLRenderer（读取 info.render）
     * @param {{cars?:number, instances?:number, seed?:(string|number)}} [extra]
     */
    update(ctx, renderer, extra) {
      if (disposed) return;
      const dt = ctx && Number.isFinite(ctx.dt) ? ctx.dt : 0;
      pushFrame(dt);

      sinceRefresh += dt;
      if (sinceRefresh < REFRESH_INTERVAL) return;
      // 扣除而非清零：保持 0.5s 的长期刷新节奏不漂移（dt 已被 main.js clamp 到 ≤0.1s）
      sinceRefresh -= REFRESH_INTERVAL;
      if (!root || !visible) return;

      // FPS + 分级配色
      const fpsRounded = Math.round(handle.fps);
      write(el.fps, 'fps', String(fpsRounded));
      if (el.fps) {
        const color = fpsRounded >= 55 ? FPS_COLOR_GOOD : fpsRounded >= 30 ? FPS_COLOR_WARN : FPS_COLOR_BAD;
        if (cache.color !== color) {
          cache.color = color;
          el.fps.style.color = color;
        }
      }

      // 渲染统计
      const info = renderer && renderer.info && renderer.info.render ? renderer.info.render : null;
      write(el.draw, 'draw', info ? groupThousands(info.calls) : '--');
      write(el.tris, 'tris', info ? abbreviate(info.triangles) : '--');

      // 世界状态
      const minutes = ctx && Number.isFinite(ctx.simMinutes)
        ? ctx.simMinutes
        : (ctx && Number.isFinite(ctx.simHours) ? ctx.simHours * 60 : 0);
      write(el.time, 'time', formatClock(minutes));

      const wname = ctx && ctx.weather && ctx.weather.current ? ctx.weather.current : '';
      write(el.weather, 'weather', weatherLabels[wname] || wname || '--');

      const elev = ctx && ctx.sun && Number.isFinite(ctx.sun.elevationDeg) ? ctx.sun.elevationDeg : NaN;
      write(el.sun, 'sun', Number.isFinite(elev) ? `${elev.toFixed(1)}°` : '--');

      const ex = extra || {};
      write(el.cars, 'cars', Number.isFinite(ex.cars) ? groupThousands(ex.cars) : '--');
      write(el.inst, 'inst', Number.isFinite(ex.instances) ? groupThousands(ex.instances) : '--');
      write(el.seed, 'seed', ex.seed === undefined || ex.seed === null ? '--' : String(ex.seed));
    },

    /**
     * 显示/隐藏 HUD（隐藏时不再写 DOM，但仍继续统计帧率）。
     * @param {boolean} on
     */
    setVisible(on) {
      if (disposed) return;
      visible = !!on;
      if (root) root.classList.toggle('hidden', !visible);
    },

    /** 复位文本与内部状态；HUD 元素本身由 index.html 持有，不移除 */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const key of Object.keys(el)) {
        const node = el[key];
        if (node) node.textContent = '--';
      }
      if (el.fps) el.fps.style.color = '';
      for (const key of Object.keys(cache)) cache[key] = '';
      winStart = 0;
      winCount = 0;
      winSum = 0;
      handle.fps = 0;
    }
  };

  return handle;
}
