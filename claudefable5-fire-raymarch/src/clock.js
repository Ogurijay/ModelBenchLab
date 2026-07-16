// 可暂停模拟时钟。渲染循环永续,模拟时间只在未暂停时累积;
// stepFrame() 用固定 dt 推进,保证 headless 回归测试的确定性。

export class SimClock {
  constructor() {
    this.time = 0;          // 模拟时间(秒),所有动画的唯一时间源
    this.paused = false;
    this._last = performance.now();
  }

  /** 每帧调用:返回本帧模拟 dt(暂停时为 0)。钳制大间隔防标签页切回跳变。 */
  tick() {
    const now = performance.now();
    let dt = (now - this._last) / 1000;
    this._last = now;
    if (this.paused) return 0;
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    return dt;
  }

  /** 手动推进固定步长(暂停状态也生效),供 __bench.stepFrame 使用。 */
  advance(dt) {
    this.time += dt;
    this._last = performance.now();
    return dt;
  }

  setPaused(p) {
    this.paused = p;
    this._last = performance.now();
  }
}
