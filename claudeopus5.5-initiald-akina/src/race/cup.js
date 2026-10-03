// 水杯：仪表台上的一杯水。水面是被加速度驱动的弱阻尼摆（会晃、会过冲），
// 晃动超过当前液面允许的倾角才洒。平稳控车几乎不洒，急刹/横向猛甩会洒，与时间无关。
const G = 9.81;

export class WaterCup {
  constructor(opts = {}) {
    this.level = 1; this.tx = 0; this.ty = 0; this.vx = 0; this.vy = 0;
    this.k = opts.k ?? 0.36;          // 加速度 → 液面倾角的系数（杯里有防溅盖的街机化）
    this.w0 = opts.w0 ?? 8.5;         // 晃动固有频率
    this.zeta = opts.zeta ?? 0.16;    // 阻尼比（越小越容易来回晃）
    this.spilled = 0; this.spillRate = 0; this.empty = false;
    this.drops = [];
  }
  get tilt() { return Math.hypot(this.tx, this.ty); }
  get crit() { return 0.19 + (1 - this.level) * 0.45; }

  update(dt, aLat, aLon) {
    if (this.empty) return;
    const w2 = this.w0 * this.w0, c = 2 * this.zeta * this.w0;
    const gx = Math.atan(this.k * aLat / G), gy = Math.atan(this.k * aLon / G);
    this.vx += (w2 * (gx - this.tx) - c * this.vx) * dt; this.tx += this.vx * dt;
    this.vy += (w2 * (gy - this.ty) - c * this.vy) * dt; this.ty += this.vy * dt;
    const over = this.tilt - this.crit;
    this.spillRate = 0;
    if (over > 0) {
      const d = Math.min(this.level, over * 1.7 * dt * (0.35 + this.level));
      this.level -= d; this.spilled += d; this.spillRate = d / dt;
      if (Math.random() < 0.5) this.drops.push({ x: Math.sign(this.tx || 1) * 0.5, y: 0, vx: Math.sign(this.tx || 1) * (0.5 + Math.random()), vy: -1 - Math.random(), life: 0.6 });
    }
    if (this.level <= 0.02) { this.level = 0; this.empty = true; }
    for (const p of this.drops) { p.vy += 6 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.drops = this.drops.filter((p) => p.life > 0);
  }
}
