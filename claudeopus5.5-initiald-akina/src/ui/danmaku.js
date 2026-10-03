// 弹幕层：B 站式白字黑边，从右往左飘。弹幕的有无就是游戏的情绪开关：
// silence() 立即清空屏上与排队中的弹幕并拒绝新弹幕；用户开关只控制显示，不能解除剧情静默。
import { rng, pick } from '../core/math.js';

export const POOLS = {
  start: ['前方高能', '前方高能！！！', '来了来了', '坐稳了', '秋名山见', '开始了开始了', '这BGM一响我就知道', '油门焊死'],
  ae86: ['86上山了', '豆腐店的车', '熊猫配色yyds', '这就是传说中的86'],
  drift: ['漂移！', '好活', '这角度可以', '轮胎在哭', '烟好大', '这是物理外挂吧', '甩起来了', '侧滑的艺术'],
  perfect: ['完美漂移！！！', '这是物理外挂吧', '神仙操作', '教科书级别', '你管这叫漂移？？', '我直接跪了', '这角度用尺子量过吧', '惯性漂移！！'],
  combo: ['连起来了！', '连击连击', '停不下来', '这就是车神吗'],
  overtake: ['过了过了！', '弯道超车！！', '对手：？？？', '外道超车！', '他怎么过去的', '这都能过', '对手心态崩了'],
  overtaken: ['被超了', '稳住', '还有机会', '心态别崩'],
  wall: ['撞墙了', '护栏：你礼貌吗', '保险公司已就位', '修车钱谁出', '这下要扣豆腐钱了'],
  ditch: ['排水渠！！！', '卡进去了！', '这就是排水渠过弯', '这是物理外挂吧', '还能这么过弯？？', '轮子掉沟里了反而更快？'],
  ditchBump: ['？', '颠了一下', '还没学会呢'],
  spill: ['水洒了', '秋生叔要骂人了', '稳一点', '杯子：救命'],
  win: ['哎哟，不错哦', '赢了！！！', '秋名山车神', '豆腐店天下第一', '86yyds'],
  lose: ['可惜', '下次一定', '没事，再来'],
  wuling: ['人民需要什么，五菱就造什么', '车不行，别怪路不平', '神车！！', '五菱宏光，秋名山之王', '昨晚我在秋名山输给一辆五菱宏光', '动力不详，遇强则强', '后排还坐着人呢', '专业防水补漏'],
  wulingVsBenz: ['宏光冲！！！', '人民的车 vs 钞能力', '全场站宏光', '五菱！五菱！', '钱不是万能的', '面包车也有尊严'],
  gtr: ['四驱信仰', 'GT-R推头了', '六叔急了', '东瀛战神？'],
  evo: ['刘教练又撞了', '毽子操练出来的腿', '冲动是魔鬼'],
  evo3: ['山鸡哥yyds', '黑皮衣白头巾', '这EVO好快'],
  fc: ['陈老师在上课', '理论派', '每个弯都算过', '白色彗星'],
  shindou: ['秋名山车神', '秋名山车神！！！', '车神！！', '秋名山车神秋名山车神', '封神了', '名场面'],
  akina: ['86上山了', '86上山了！！！', '豆腐车来了', '86上山了86上山了']
};

export class Danmaku {
  constructor(el) {
    this.el = el; this.items = []; this.queue = [];
    this.silenced = false; this.userOn = true;
    this.rand = rng(20050623);
    this.lanes = 9; this.laneFree = new Array(14).fill(0);
    this.cool = {};
  }
  setUser(on) { this.userOn = on; this.el.style.opacity = on ? 1 : 0; }
  /** 情绪开关：立即清空屏上与排队弹幕 */
  silence(on = true) {
    this.silenced = on;
    if (on) { this.queue.length = 0; for (const it of this.items) it.el.remove(); this.items.length = 0; }
  }
  clear() { this.queue.length = 0; for (const it of this.items) it.el.remove(); this.items.length = 0; }

  push(text, opts = {}) {
    if (this.silenced && !opts.force) return;
    this.queue.push({ text, ...opts, delay: opts.delay ?? 0 });
  }
  /** 从池中随机刷 n 条（刷屏时字号放大） */
  burst(pool, n = 4, opts = {}) {
    const key = pool;
    const now = performance.now();
    if (!opts.force && this.cool[key] && now - this.cool[key] < (opts.cool ?? 900)) return;
    this.cool[key] = now;
    const arr = Array.isArray(pool) ? pool : POOLS[pool] || [pool];
    for (let i = 0; i < n; i++) this.push(pick(arr, this.rand), { ...opts, delay: (opts.spread ?? 0.12) * i, big: opts.big || (n >= 8 && this.rand() < 0.35) });
  }
  /** 全屏刷同一句 */
  flood(text, n = 30, opts = {}) {
    for (let i = 0; i < n; i++) this.push(text, { ...opts, flood: true, delay: (opts.spread ?? 0.05) * i, big: this.rand() < 0.4, huge: this.rand() < 0.12 });
  }

  update(dt) {
    const H = this.el.clientHeight || innerHeight, W = this.el.clientWidth || innerWidth;
    const laneH = Math.max(30, H * 0.07);
    const lanes = Math.max(4, Math.min(14, Math.floor((H * 0.62) / laneH)));
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.delay -= dt; q.age = (q.age || 0) + dt;
      if (q.age > 5 && !q.flood && !q.force) { this.queue.splice(i, 1); continue; } // 过时的梗不再发
      if (q.delay > 0) continue;
      let lane = 0, best = Infinity;
      for (let l = 0; l < lanes; l++) { const v = this.laneFree[l] + this.rand() * 0.3; if (v < best) { best = v; lane = l; } }
      // 普通弹幕等车道空出来再发；刷屏（flood）允许重叠
      if (!q.flood && this.laneFree[lane] > performance.now() / 1000 && q.lane == null) { q.delay = 0.15; continue; }
      this.queue.splice(i, 1);
      const d = document.createElement('div');
      d.className = 'dm' + (q.huge ? ' huge' : q.big ? ' big' : '');
      d.textContent = q.text;
      if (q.color) d.style.color = q.color;
      d.style.top = `${(q.lane ?? lane) * laneH + H * 0.06}px`;
      this.el.appendChild(d);
      const w = d.offsetWidth;
      const speed = (W + w) / (q.dur ?? (6.5 + this.rand() * 2.5));
      this.items.push({ el: d, x: W, w, speed });
      this.laneFree[lane] = performance.now() / 1000 + (w + 40) / speed;
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.x -= it.speed * dt;
      it.el.style.transform = `translate3d(${it.x - (this.el.clientWidth || W)}px,0,0)`;
      if (it.x < -it.w - 20) { it.el.remove(); this.items.splice(i, 1); }
    }
  }
  get count() { return this.items.length + this.queue.length; }
}
