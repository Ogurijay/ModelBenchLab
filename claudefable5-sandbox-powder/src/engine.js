// 模拟引擎：元胞自动机（粒子移动 + 化学反应）+ 温度场 + 风/气压场
// 网格外圈固定为一圈「墙」，因此内部循环无需做越界判断。
import {
  W, H, AW, AH, AMBIENT,
  ST_SOLID, ST_POWDER, ST_LIQUID, ST_GAS, ST_ENERGY,
  F_IMMUNE, F_ACIDPROOF, F_ORGANIC, F_BIO,
} from './const.js';
import {
  E, COUNT, STATE, DENS, THERM, COND, DISP, FLAG,
  IGN_T, IGN_MODE, IG_FLASH, IG_SMOLDER, IG_EXPLODE, IG_GASBOOM,
  HOT_T, HOT_TO, COLD_T, COLD_TO, BURN_LIFE, BURN_PROD,
  EXPL_R, EXPL_P, SHOCK_T, DRAW_TEMP,
} from './elements.js';

const R = Math.random;
const SIZE = W * H;
const ASIZE = AW * AH;

// aux 位标记
const BIT_BURN = 0x80; // 阴燃中
const BIT_FELL = 0x40; // 上一帧发生了坠落（硝化甘油撞击检测）
const BIT_DIR = 0x01;  // 液体流动方向记忆

// 会被病毒同化豁免的元素
const VIRUS_IMMUNE = new Uint8Array(COUNT);
[E.EMPTY, E.WALL, E.CLONE, E.VOID, E.FAN, E.BATTERY, E.GLASS, E.DIAMOND, E.GOLD,
 E.VIRUS, E.FIRE, E.SPARK, E.LAVA, E.MOLTEN_METAL, E.MOLTEN_GLASS].forEach(k => VIRUS_IMMUNE[k] = 1);

// 酸可溶解的金属类
const ACID_METAL = new Uint8Array(COUNT);
[E.METAL, E.MAGNESIUM, E.SODIUM, E.RUST].forEach(k => ACID_METAL[k] = 1);

function initLife(t) {
  switch (t) {
    case E.FIRE: return 30 + (R() * 60 | 0);
    case E.SMOKE: return 90 + (R() * 130 | 0);
    case E.SPARK: return 3;
    case E.VIRUS: return 150;
    case E.FUNGUS: return 220;
    case E.PLANT: return 30;
    default: return 0;
  }
}

export class Sim {
  constructor() {
    this.cells = new Uint8Array(SIZE);
    this.temp = new Float32Array(SIZE);
    this.life = new Int16Array(SIZE);
    this.aux = new Uint8Array(SIZE);
    this.stamp = new Uint8Array(SIZE);
    this.noise = new Uint8Array(SIZE);       // 渲染用静态纹理噪声
    this.avx = new Float32Array(ASIZE);      // 风速 x
    this.avy = new Float32Array(ASIZE);      // 风速 y
    this.ap = new Float32Array(ASIZE);       // 气压
    this.frame = 0;
    for (let i = 0; i < SIZE; i++) this.noise[i] = R() * 255 | 0;
    this.clear();
  }

  clear() {
    this.cells.fill(E.EMPTY);
    this.temp.fill(AMBIENT);
    this.life.fill(0);
    this.aux.fill(0);
    this.avx.fill(0); this.avy.fill(0); this.ap.fill(0);
    // 外圈墙
    for (let x = 0; x < W; x++) { this.cells[x] = E.WALL; this.cells[(H - 1) * W + x] = E.WALL; }
    for (let y = 0; y < H; y++) { this.cells[y * W] = E.WALL; this.cells[y * W + W - 1] = E.WALL; }
  }

  // ———— 基础操作 ————
  set(x, y, t, fanDir = 0) {
    if (x < 1 || x > W - 2 || y < 1 || y > H - 2) return;
    const i = y * W + x;
    const cur = this.cells[i];
    if (t === E.SPARK && COND[cur]) {
      this.aux[i] = cur;               // 电火花骑在导体上，记住底材
      this.cells[i] = E.SPARK;
      this.life[i] = 3;
      return;
    }
    this.cells[i] = t;
    this.temp[i] = DRAW_TEMP[t];
    this.life[i] = initLife(t);
    this.aux[i] = t === E.FAN ? fanDir : 0;
  }

  // 画笔放置规则：普通元素只画进空格；构造类元素覆盖一切；火/电有点燃语义
  paint(cx, cy, r, t, fanDir = 0) {
    const construct = (t === E.WALL || t === E.CLONE || t === E.VOID || t === E.FAN || t === E.BATTERY);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 1 || x > W - 2 || y < 1 || y > H - 2) continue;
        const i = y * W + x;
        const cur = this.cells[i];
        if (t === E.EMPTY) { if (cur !== E.EMPTY) this.set(x, y, E.EMPTY); continue; }
        if (construct) { this.set(x, y, t, fanDir); continue; }
        if (t === E.FIRE) {
          if (cur === E.EMPTY) this.set(x, y, E.FIRE);
          else if (IGN_MODE[cur]) this.igniteCell(i, cur);
          continue;
        }
        if (t === E.SPARK) {
          if (COND[cur] || cur === E.EMPTY) this.set(x, y, E.SPARK);
          continue;
        }
        if (cur === E.EMPTY) {
          // 气体画得稀疏一点更自然
          if (STATE[t] === ST_GAS && R() > 0.55) continue;
          this.set(x, y, t);
        }
      }
    }
  }

  heatBrush(cx, cy, r, delta) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = y * W + x;
      this.temp[i] = Math.max(-250, Math.min(4500, this.temp[i] + delta));
    }
  }

  // 吹风工具：沿线段向风场注入速度
  blow(x0, y0, x1, y1, fx, fy) {
    const steps = Math.max(1, Math.hypot(x1 - x0, y1 - y0) | 0);
    for (let s = 0; s <= steps; s++) {
      const x = x0 + (x1 - x0) * s / steps | 0;
      const y = y0 + (y1 - y0) * s / steps | 0;
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const a = (y >> 2) * AW + (x >> 2);
      this.avx[a] = Math.max(-8, Math.min(8, this.avx[a] + fx));
      this.avy[a] = Math.max(-8, Math.min(8, this.avy[a] + fy));
    }
  }

  transform(i, to) {
    this.cells[i] = to;
    this.aux[i] = 0;
    this.life[i] = initLife(to);
    this.stamp[i] = this.frame & 255;
  }

  swapCells(i, j) {
    const c = this.cells, t = this.temp, l = this.life, a = this.aux;
    let v = c[i]; c[i] = c[j]; c[j] = v;
    let f = t[i]; t[i] = t[j]; t[j] = f;
    let w = l[i]; l[i] = l[j]; l[j] = w;
    v = a[i]; a[i] = a[j]; a[j] = v;
    this.stamp[j] = this.frame & 255;
  }

  // ———— 点燃 / 爆炸 ————
  igniteCell(i, t) {
    const mode = IGN_MODE[t];
    if (mode === IG_FLASH) {
      this.transform(i, E.FIRE);
      this.temp[i] = Math.max(this.temp[i], 500);
    } else if (mode === IG_SMOLDER) {
      if (!(this.aux[i] & BIT_BURN)) {
        this.aux[i] |= BIT_BURN;
        if (this.life[i] <= 0) this.life[i] = BURN_LIFE[t];
      }
    } else if (mode === IG_EXPLODE) {
      this.detonate(i, t);
    } else if (mode === IG_GASBOOM) {
      this.gasBoom(i, t);
    }
  }

  detonate(i, t) {
    const x = i % W, y = i / W | 0;
    this.cells[i] = E.EMPTY;
    this.explode(x, y, EXPL_R[t], EXPL_P[t]);
  }

  gasBoom(i, t) {
    const x = i % W, y = i / W | 0;
    this.explode(x, y, 2, t === E.H2 ? 1.7 : 1.9);
    // 燃烧产物：氢气→水蒸气；甲烷→CO₂+水蒸气
    this.transform(i, t === E.H2 ? E.STEAM : (R() < 0.5 ? E.CO2 : E.STEAM));
    this.temp[i] = Math.max(this.temp[i], 700);
  }

  explode(cx, cy, r, power) {
    const { cells, temp } = this;
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 1 || y > H - 2) continue;
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const x = cx + dx;
        if (x < 1 || x > W - 2) continue;
        const k = 1 - Math.sqrt(d2) / r;
        const i = y * W + x;
        const t = cells[i];
        temp[i] += power * 230 * k;
        if (t === E.EMPTY) {
          if (R() < k * 0.55) { this.transform(i, E.FIRE); this.life[i] = 10 + (R() * 25 | 0); this.temp[i] = 600; }
          else if (R() < k * 0.25) this.transform(i, E.SMOKE);
        } else if (FLAG[t] & F_IMMUNE) {
          // 墙、钻石等扛住爆炸
        } else if (t === E.GLASS) {
          if (R() < 0.15 + 0.7 * k) this.transform(i, E.SAND); // 玻璃被震碎成沙
        } else if (t === E.STONE || t === E.LIMESTONE) {
          if (power > 6.5 && R() < 0.45 * k) this.transform(i, E.SMOKE); // 大当量才能碎石
        } else if ((FLAG[t] & F_ORGANIC) && R() < 0.5 * k) {
          this.transform(i, E.FIRE);
        }
      }
    }
    // 冲击波注入风场
    const ar = Math.max(1, r >> 2), acx = cx >> 2, acy = cy >> 2;
    for (let dy = -ar; dy <= ar; dy++) {
      const ay = acy + dy;
      if (ay < 1 || ay > AH - 2) continue;
      for (let dx = -ar; dx <= ar; dx++) {
        const ax = acx + dx;
        if (ax < 1 || ax > AW - 2) continue;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (d > ar + 0.5) continue;
        const k = 1 - (d - 1) / (ar + 1);
        const a = ay * AW + ax;
        this.ap[a] += power * 3 * k;
        this.avx[a] += dx / d * power * 1.1 * k;
        this.avy[a] += dy / d * power * 1.1 * k;
      }
    }
  }

  // ———— 风 / 气压场 ————
  airStep() {
    const { avx, avy, ap, cells } = this;
    for (let ay = 1; ay < AH - 1; ay++) {
      for (let ax = 1; ax < AW - 1; ax++) {
        const a = ay * AW + ax;
        // 固体格阻尼（采样格中心的细胞）
        const ft = cells[(ay * 4 + 1) * W + ax * 4 + 1];
        if (STATE[ft] === ST_SOLID) { avx[a] *= 0.15; avy[a] *= 0.15; ap[a] *= 0.9; }
        // 压强扩散
        ap[a] = (ap[a] * 4 + ap[a - 1] + ap[a + 1] + ap[a - AW] + ap[a + AW]) * 0.125 * 0.998;
        // 速度 ← 压差
        avx[a] += (ap[a - 1] - ap[a + 1]) * 0.08;
        avy[a] += (ap[a - AW] - ap[a + AW]) * 0.08;
        // 压强 ← 速度散度（形成可传播的冲击波）
        ap[a] -= (avx[a + 1] - avx[a - 1] + avy[a + AW] - avy[a - AW]) * 0.06;
        avx[a] *= 0.975; avy[a] *= 0.975;
      }
    }
    // 边缘清零，防止能量在边界积累
    for (let ax = 0; ax < AW; ax++) { const b = (AH - 1) * AW + ax; avx[ax] = avy[ax] = ap[ax] = 0; avx[b] = avy[b] = ap[b] = 0; }
    for (let ay = 0; ay < AH; ay++) { const a = ay * AW, b = a + AW - 1; avx[a] = avy[a] = ap[a] = 0; avx[b] = avy[b] = ap[b] = 0; }
  }

  windPush(i, x, y, st) {
    const a = (y >> 2) * AW + (x >> 2);
    const vx = this.avx[a], vy = this.avy[a];
    const m = Math.abs(vx) + Math.abs(vy);
    const th = st === ST_GAS ? 0.25 : st === ST_ENERGY ? 0.5 : st === ST_POWDER ? 1.6 : 2.6;
    if (m <= th) return false;
    if (R() > Math.min(0.9, (m - th) * 0.35)) return false;
    const dx = vx > 0.4 ? 1 : vx < -0.4 ? -1 : 0;
    const dy = vy > 0.4 ? 1 : vy < -0.4 ? -1 : 0;
    const tryTo = (j) => {
      const jt = this.cells[j];
      if (jt === E.EMPTY || (STATE[jt] === ST_GAS && st !== ST_GAS)) { this.swapCells(i, j); return true; }
      return false;
    };
    if (dx || dy) { if (tryTo(i + dy * W + dx)) return true; }
    if (dx) { if (tryTo(i + dx)) return true; }
    if (dy) { if (tryTo(i + dy * W)) return true; }
    return false;
  }

  // ———— 温度场：成对交换式热传导（能量守恒、无振荡）————
  tempPass() {
    const { temp, cells } = this;
    for (let y = 1; y < H - 1; y++) {
      const row = y * W;
      for (let x = 1; x < W - 1; x++) {
        const i = row + x;
        const ti = cells[i];
        // 右邻
        let j = i + 1;
        let kk = (THERM[ti] + THERM[cells[j]]) * 0.08;
        let d = (temp[j] - temp[i]) * kk;
        temp[i] += d; temp[j] -= d;
        // 下邻
        j = i + W;
        kk = (THERM[ti] + THERM[cells[j]]) * 0.08;
        d = (temp[j] - temp[i]) * kk;
        temp[i] += d; temp[j] -= d;
        // 缓慢回归环境温度（空气散热快于实体）
        temp[i] += (AMBIENT - temp[i]) * (ti === E.EMPTY ? 0.005 : 0.0006);
      }
    }
  }

  // ———— 主循环 ————
  step() {
    this.frame++;
    this.airStep();
    this.particlePass();
    this.tempPass();
  }

  particlePass() {
    const { cells, temp, life, aux, stamp } = this;
    const sv = this.frame & 255;
    for (let y = H - 2; y >= 1; y--) {
      const row = y * W;
      const ltr = ((this.frame + y) & 1) === 0;
      for (let xx = 1; xx < W - 1; xx++) {
        const x = ltr ? xx : W - 1 - xx;
        const i = row + x;
        const t = cells[i];
        if (t === E.EMPTY) continue;
        if (stamp[i] === sv) continue;
        stamp[i] = sv;
        if (life[i] < 0) life[i]++; // 导体放电后的不应期恢复

        const tp = temp[i];
        // 相变（低温优先，带概率门限让边界过渡柔和）
        if (tp <= COLD_T[t]) {
          if (R() < 0.45) {
            this.doCold(i, t);
            continue;
          }
        } else if (tp >= HOT_T[t]) {
          if (R() < 0.55) {
            this.doHot(i, t);
            continue;
          }
        }
        // 达到燃点
        if (tp >= IGN_T[t] && !(aux[i] & BIT_BURN)) {
          this.igniteCell(i, t);
          if (cells[i] !== t) continue;
        }
        // 元素专属行为（可能改变/移除自身）
        if (this.behave(i, x, y, t)) continue;
        // 阴燃
        if (aux[i] & BIT_BURN) this.smolder(i, x, y, t);
        // 移动
        const st = STATE[cells[i]];
        if (st === ST_POWDER) this.movePowder(i, x, y, cells[i]);
        else if (st === ST_LIQUID) this.moveLiquid(i, x, y, cells[i]);
        else if (st === ST_GAS) this.moveGas(i, x, y, cells[i]);
        else if (cells[i] === E.FIRE) this.moveFire(i, x, y);
      }
    }
  }

  doCold(i, t) {
    const to = COLD_TO[t];
    if (t === E.SALTWATER) {
      // 结冰析盐（盐水冻结时盐被排出）
      this.transform(i, R() < 0.15 ? E.SALT : E.ICE);
      return;
    }
    this.transform(i, to);
  }

  doHot(i, t) {
    if (t === E.SALTWATER) {
      // 蒸发留盐
      this.transform(i, R() < 0.3 ? E.SALT : E.STEAM);
      return;
    }
    if (t === E.LIMESTONE) {
      // 煅烧：CaCO₃ → CaO + CO₂↑
      this.transform(i, E.QUICKLIME);
      const up = i - W;
      if (this.cells[up] === E.EMPTY) { this.transform(up, E.CO2); this.temp[up] = this.temp[i]; }
      return;
    }
    this.transform(i, HOT_TO[t]);
  }

  smolder(i, x, y, t) {
    const hard = (t === E.THERMITE || t === E.MAGNESIUM); // 水浇不灭
    this.temp[i] = Math.max(this.temp[i], t === E.THERMITE ? 3200 : t === E.MAGNESIUM ? 2900 : 620);
    if (R() < 0.5) {
      const dirs = [-W, -W - 1, -W + 1, -1, 1];
      const n = i + dirs[R() * dirs.length | 0];
      if (this.cells[n] === E.EMPTY) {
        this.transform(n, (t === E.COAL || t === E.GRAPHITE) && R() < 0.12 ? E.CO2 : E.FIRE);
        this.temp[n] = Math.max(this.temp[n], 500);
      }
    }
    if (!hard) {
      // 水能灭火
      for (const d of [-W, W, -1, 1]) {
        const nt = this.cells[i + d];
        if ((nt === E.WATER || nt === E.SALTWATER) && R() < 0.35) {
          this.aux[i] &= ~BIT_BURN;
          if (R() < 0.4) this.transform(i + d, E.STEAM);
          return;
        }
      }
    }
    if (--this.life[i] <= 0) {
      const prod = BURN_PROD[t];
      this.transform(i, prod);
      if (prod === E.EMPTY && R() < 0.5) this.transform(i, E.SMOKE);
      if (prod === E.MOLTEN_METAL) this.temp[i] = 2200; // 铝热剂产出铁水
      if (prod === E.COAL) this.temp[i] = Math.min(this.temp[i], 380); // 木→煤，略降温避免立刻续燃烧穿
    }
  }

  // ———— 元素行为，返回 true 表示本帧到此为止 ————
  behave(i, x, y, t) {
    const { cells, temp, life, aux } = this;
    const N4 = [-W, W, -1, 1];
    switch (t) {
      case E.FIRE: {
        if (--life[i] <= 0) { this.transform(i, R() < 0.45 ? E.SMOKE : E.EMPTY); return true; }
        temp[i] = Math.max(temp[i], 380 + (life[i] & 31) * 14);
        for (const d of N4) {
          const n = i + d, nt = cells[n];
          if (nt === E.EMPTY) continue;
          if (nt === E.WATER || nt === E.SALTWATER) {
            temp[n] += 40;
            if (R() < 0.25) this.transform(n, E.STEAM);
            this.transform(i, E.EMPTY);
            return true;
          }
          if (nt === E.O2) { this.transform(n, E.EMPTY); life[i] = Math.min(140, life[i] + 20); temp[i] += 260; continue; }
          if (nt === E.CO2 || nt === E.N2) { if (R() < 0.1) { this.transform(i, E.SMOKE); return true; } continue; }
          if (IGN_MODE[nt] && R() < 0.22) { temp[n] = Math.max(temp[n], IGN_T[nt] + 20); this.igniteCell(n, nt); continue; }
          temp[n] += 6; // 火焰辐射加热
        }
        // 热浮升气流
        const a = (y >> 2) * AW + (x >> 2);
        this.avy[a] -= 0.06;
        return false; // 继续走 moveFire
      }
      case E.SPARK: {
        temp[i] += 2.2; // 电阻发热
        // 沿导体扩散（8 邻域）
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const n = i + dy * W + dx, nt = cells[n];
          if (nt === E.SPARK || !COND[nt] || life[n] < 0) continue;
          if (COND[nt] === 2 && R() > 0.55) continue; // 盐水等弱导体
          aux[n] = nt; cells[n] = E.SPARK; life[n] = 3;
          this.stamp[n] = this.frame & 255;
        }
        for (const d of N4) {
          const n = i + d, nt = cells[n];
          // 电解水：H₂ 和 O₂ 按 2:1 生成
          if ((nt === E.WATER || nt === E.SALTWATER) && R() < 0.03) this.transform(n, R() < 0.667 ? E.H2 : E.O2);
          else if (IGN_MODE[nt]) {
            const m = IGN_MODE[nt];
            if ((m === IG_EXPLODE && R() < 0.6) || (m !== IG_EXPLODE && R() < 0.3)) this.igniteCell(n, nt);
          }
        }
        if (--life[i] <= 0) {
          cells[i] = aux[i]; // 火花熄灭，还原底下的导体
          aux[i] = 0;
          life[i] = -8;      // 不应期
        }
        return true;
      }
      case E.BATTERY: {
        if (this.frame % 40 < 2) {
          for (const d of N4) {
            const n = i + d, nt = cells[n];
            if (COND[nt] && life[n] >= 0) { aux[n] = nt; cells[n] = E.SPARK; life[n] = 3; this.stamp[n] = this.frame & 255; }
            else if ((nt === E.WATER || nt === E.SALTWATER) && R() < 0.15) this.transform(n, R() < 0.667 ? E.H2 : E.O2);
          }
        }
        return true;
      }
      case E.CLONE: {
        if (aux[i] === 0) {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nt = cells[i + dy * W + dx];
            if (nt && nt !== E.CLONE && nt !== E.WALL && nt !== E.VOID && nt !== E.FAN && nt !== E.BATTERY && nt !== E.SPARK) { aux[i] = nt; break; }
          }
        } else if (R() < 0.14) {
          const dx = (R() * 3 | 0) - 1, dy = (R() * 3 | 0) - 1;
          const nx = x + dx, ny = y + dy;
          if (cells[ny * W + nx] === E.EMPTY) this.set(nx, ny, aux[i]);
        }
        return true;
      }
      case E.VOID: {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const n = i + dy * W + dx, nt = cells[n];
          if (nt && !(FLAG[nt] & F_IMMUNE)) { cells[n] = E.EMPTY; life[n] = 0; aux[n] = 0; }
        }
        return true;
      }
      case E.FAN: {
        const dir = aux[i] & 3;
        const vx = dir === 0 ? 1 : dir === 2 ? -1 : 0;
        const vy = dir === 1 ? 1 : dir === 3 ? -1 : 0;
        const a = (y >> 2) * AW + (x >> 2);
        this.avx[a] = Math.max(-5, Math.min(5, this.avx[a] + vx * 1.4));
        this.avy[a] = Math.max(-5, Math.min(5, this.avy[a] + vy * 1.4));
        return true;
      }

      case E.WATER: case E.SALTWATER: {
        for (const d of N4) {
          const n = i + d, nt = cells[n];
          if (nt === E.SALT && t === E.WATER && R() < 0.3) { this.transform(n, E.EMPTY); this.transform(i, E.SALTWATER); return true; }
          if (nt === E.LAVA && R() < 0.5) { this.transform(n, E.STONE); temp[n] = 600; this.transform(i, E.STEAM); temp[i] = 130; return true; }
        }
        return false;
      }
      case E.ICE: case E.SNOW: {
        for (const d of N4) {
          const nt = cells[i + d];
          if (nt === E.SALT && R() < 0.03) { this.transform(i, E.SALTWATER); if (R() < 0.5) this.transform(i + d, E.EMPTY); return true; }
        }
        return t === E.ICE; // 冰是固体不移动；雪继续走粉末移动
      }
      case E.ACID: case E.HCL: {
        const s = t === E.ACID ? 1 : 0.55;
        for (const d of N4) {
          const n = i + d, nt = cells[n];
          if (nt === E.EMPTY) continue;
          if (nt === E.LYE) { this.transform(n, E.SALTWATER); this.transform(i, E.SALTWATER); temp[i] += 190; temp[n] += 190; return true; } // 中和放热
          if (FLAG[nt] & (F_ACIDPROOF | F_IMMUNE)) continue;
          if (ACID_METAL[nt] && R() < 0.025 * s) { this.transform(n, E.H2); if (R() < 0.35) this.transform(i, E.SALTWATER); return true; } // 金属+酸→氢气
          if (nt === E.LIMESTONE && R() < 0.06 * s) { this.transform(n, E.CO2); if (R() < 0.4) this.transform(i, E.SALTWATER); return true; }  // 石灰石冒泡
          if ((FLAG[nt] & F_ORGANIC) && nt !== E.OIL && R() < 0.03 * s) { this.transform(n, R() < 0.3 ? E.SMOKE : E.EMPTY); continue; }
          if (nt === E.VIRUS && R() < 0.1) { this.transform(n, E.EMPTY); continue; }
          if ((nt === E.ICE || nt === E.SNOW) && R() < 0.05) { this.transform(n, E.WATER); continue; }
          if (nt === E.STONE && R() < 0.004 * s) { this.transform(n, E.EMPTY); continue; }
        }
        return false;
      }
      case E.LYE: {
        for (const d of N4) {
          const n = i + d, nt = cells[n];
          if (nt === E.ACID || nt === E.HCL) { this.transform(n, E.SALTWATER); this.transform(i, E.SALTWATER); temp[i] += 190; return true; }
          if ((FLAG[nt] & F_ORGANIC) && !(FLAG[nt] & F_ACIDPROOF) && R() < 0.012) this.transform(n, R() < 0.3 ? E.SMOKE : E.EMPTY);
        }
        return false;
      }
      case E.SODIUM: {
        for (const d of N4) {
          const nt = cells[i + d];
          if (nt === E.WATER || nt === E.SALTWATER) {
            // 2Na + 2H₂O → 2NaOH + H₂↑ + 爆炸
            this.transform(i + d, R() < 0.5 ? E.LYE : E.H2);
            cells[i] = E.EMPTY;
            this.explode(x, y, 3, 2.6);
            return true;
          }
        }
        return false;
      }
      case E.QUICKLIME: {
        for (const d of N4) {
          const n = i + d, nt = cells[n];
          if ((nt === E.WATER || nt === E.SALTWATER) && R() < 0.4) {
            // CaO + H₂O → Ca(OH)₂，剧烈放热
            this.transform(n, R() < 0.5 ? E.STEAM : E.EMPTY);
            this.transform(i, E.ASH);
            temp[i] += 520; temp[n] += 520;
            return true;
          }
        }
        return false;
      }
      case E.LN2: {
        for (const d of N4) temp[i + d] = Math.max(-220, temp[i + d] - 7);
        return false;
      }
      case E.DRYICE: {
        for (const d of N4) temp[i + d] = Math.max(-150, temp[i + d] - 2.5);
        return false;
      }
      case E.URANIUM: {
        if (temp[i] < 660) temp[i] += 0.5; // 衰变热（做了安全上限，避免把地图烧穿）
        if (R() < 0.000004) this.transform(i, E.LEAD); // 衰变链终点：铅
        return false;
      }
      case E.PHOSPHORUS: {
        if (temp[i] < 40) temp[i] += 0.06; // 白磷缓慢自热直至自燃
        return false;
      }
      case E.METAL: {
        for (const d of N4) {
          const nt = cells[i + d];
          if (nt === E.WATER && R() < 0.0004) { this.transform(i, E.RUST); return true; }
          if (nt === E.SALTWATER && R() < 0.0025) { this.transform(i, E.RUST); return true; } // 盐水加速锈蚀
        }
        return true;
      }
      case E.DIAMOND: {
        if (temp[i] > 800) {
          for (const d of N4) {
            if (cells[i + d] === E.O2 && R() < 0.06) { this.transform(i + d, E.EMPTY); this.transform(i, E.CO2); return true; } // 纯氧中烧钻石
          }
        }
        return true;
      }
      case E.SEED: {
        for (const d of N4) {
          const nt = cells[i + d];
          if (nt === E.WATER) { this.transform(i, E.PLANT); life[i] = 45; return true; }
        }
        return false;
      }
      case E.PLANT: {
        let crowd = 0;
        for (const d of N4) {
          const n = i + d, nt = cells[n];
          if (nt === E.PLANT) crowd++;
          if (nt === E.WATER && R() < 0.06) { this.transform(n, E.EMPTY); life[i] = Math.min(60, life[i] + 10); }
          else if (nt === E.CO2 && R() < 0.02) this.transform(n, E.O2); // 光合作用
          else if (nt === E.CL2) { this.transform(i, E.ASH); if (R() < 0.3) this.transform(n, E.EMPTY); return true; }
          else if (nt === E.HGVAP && R() < 0.2) { this.transform(i, E.ASH); return true; }
        }
        // 密度上限让藤蔓成条状生长而不是糊成一团
        if (life[i] > 0 && crowd <= 2 && R() < 0.15) {
          const r = R();
          const d = r < 0.5 ? -W : r < 0.65 ? -W - 1 : r < 0.8 ? -W + 1 : r < 0.9 ? -1 : 1;
          const n = i + d;
          if (cells[n] === E.EMPTY) {
            this.transform(n, E.PLANT);
            life[n] = life[i] - 8; // 逐代衰减，藤蔓有自然长度上限
            life[i] -= 6;
          }
        }
        return true;
      }
      case E.FUNGUS: {
        for (const d of N4) {
          const n = i + d, nt = cells[n];
          if ((FLAG[nt] & F_ORGANIC) && nt !== E.FUNGUS && R() < 0.02) { this.transform(n, E.FUNGUS); life[n] = 210; }
          if (nt === E.CL2 && R() < 0.3) { this.transform(i, E.ASH); return true; }
        }
        if (temp[i] > 90 && R() < 0.3) { this.transform(i, E.ASH); return true; }
        if (--life[i] <= 0) { this.transform(i, E.ASH); return true; }
        return false;
      }
      case E.VIRUS: {
        if (--life[i] <= 0) { this.transform(i, E.SMOKE); return true; }
        if (R() < 0.16) {
          const d = N4[R() * 4 | 0];
          const n = i + d, nt = cells[n];
          if (nt && !VIRUS_IMMUNE[nt] && life[i] > 12) {
            this.transform(n, E.VIRUS);
            life[n] = life[i] - 10; // 毒性逐代衰减
          }
        }
        return false;
      }
      case E.CL2: {
        for (const d of N4) {
          const n = i + d, nt = cells[n];
          if ((FLAG[nt] & F_BIO) && R() < 0.25) { this.transform(n, E.ASH); if (R() < 0.4) { this.transform(i, E.EMPTY); return true; } }
          if (nt === E.H2 && temp[i] > 120 && R() < 0.4) { this.transform(n, E.HCL); this.transform(i, E.EMPTY); return true; } // H₂+Cl₂→2HCl
        }
        return false;
      }
      case E.HGVAP: {
        for (const d of N4) {
          const n = i + d;
          if ((FLAG[cells[n]] & F_BIO) && R() < 0.15) this.transform(n, E.ASH);
        }
        return false;
      }
      case E.LAVA: {
        if (temp[i] < 900) temp[i] += 3; // 地热自持：低于凝固点前维持在 900°C 左右（仍低于岩石熔点，不会烧穿容器）
        for (const d of N4) {
          const n = i + d, nt = cells[n];
          if ((nt === E.WATER || nt === E.SALTWATER) && R() < 0.5) { this.transform(n, E.STEAM); temp[n] = 130; this.transform(i, E.STONE); temp[i] = 600; return true; }
          if (IGN_MODE[nt] && R() < 0.15) this.igniteCell(n, nt);
        }
        return false;
      }
      case E.NITRO: {
        const a = (y >> 2) * AW + (x >> 2);
        if (Math.abs(this.ap[a]) > SHOCK_T[t]) { this.detonate(i, t); return true; }
        if (aux[i] & BIT_FELL) {
          const below = cells[i + W];
          const blocked = below !== E.EMPTY && STATE[below] !== ST_GAS && STATE[below] !== ST_LIQUID;
          if (blocked && R() < 0.1) { this.detonate(i, t); return true; } // 坠地冲击引爆
          aux[i] &= ~BIT_FELL;
        }
        return false;
      }
      case E.GUNPOWDER: case E.TNT: case E.C4: {
        const a = (y >> 2) * AW + (x >> 2);
        if (Math.abs(this.ap[a]) > SHOCK_T[t]) { this.detonate(i, t); return true; } // 冲击波殉爆
        return false;
      }
      case E.STEAM: {
        // 凝结在冷表面
        if (temp[i] < 96 && R() < 0.2) { this.transform(i, E.WATER); return true; }
        return false;
      }
      case E.SMOKE: {
        if (--life[i] <= 0) { this.transform(i, E.EMPTY); return true; }
        return false;
      }
      case E.CO2: {
        for (const d of N4) {
          if (cells[i + d] === E.FIRE && R() < 0.3) this.transform(i + d, E.SMOKE); // 窒息灭火
        }
        return false;
      }
    }
    return false;
  }

  // ———— 移动 ————
  movePowder(i, x, y, t) {
    if (this.windPush(i, x, y, ST_POWDER)) return;
    const { cells } = this;
    const b = i + W, bt = cells[b], bs = STATE[bt];
    if (bt === E.EMPTY || bs === ST_GAS || bs === ST_ENERGY) { this.swapCells(i, b); return; }
    if (bs === ST_LIQUID && DENS[t] > DENS[bt]) {
      const p = Math.min(0.6, (DENS[t] - DENS[bt]) / DENS[t] * 0.9 + 0.05);
      if (R() < p) { this.swapCells(i, b); return; }
      return; // 悬浮在液面上晃动
    }
    const s0 = R() < 0.5 ? 1 : -1;
    for (const s of [s0, -s0]) {
      const d = b + s, dt = cells[d], sidet = cells[i + s];
      const pass = (v) => v === E.EMPTY || STATE[v] === ST_GAS;
      if (pass(dt) && pass(sidet)) { this.swapCells(i, d); return; }
      if (STATE[dt] === ST_LIQUID && DENS[t] > DENS[dt] && R() < 0.25) { this.swapCells(i, d); return; }
    }
    // 冰面打滑
    if (bt === E.ICE && R() < 0.2) {
      const s = R() < 0.5 ? 1 : -1;
      if (cells[i + s] === E.EMPTY) this.swapCells(i, i + s);
    }
  }

  moveLiquid(i, x, y, t) {
    if (this.windPush(i, x, y, ST_LIQUID)) return;
    const { cells, aux } = this;
    const b = i + W, bt = cells[b], bs = STATE[bt];
    if (bt === E.EMPTY || bs === ST_GAS || bs === ST_ENERGY) {
      this.swapCells(i, b);
      if (t === E.NITRO) aux[b] |= BIT_FELL;
      return;
    }
    if (bs === ST_LIQUID && DENS[t] > DENS[bt] + 1 && R() < 0.5) { this.swapCells(i, b); return; } // 密度分层
    const s0 = R() < 0.5 ? 1 : -1;
    for (const s of [s0, -s0]) {
      const d = b + s, dt = cells[d], sidet = cells[i + s];
      const pass = (v) => v === E.EMPTY || STATE[v] === ST_GAS;
      if (pass(dt) && pass(sidet)) { this.swapCells(i, d); if (t === E.NITRO) aux[d] |= BIT_FELL; return; }
    }
    // 横向找平：沿记忆方向最多流 DISP 格
    let dir = (aux[i] & BIT_DIR) ? 1 : -1;
    if (R() < 0.02) { aux[i] ^= BIT_DIR; dir = -dir; }
    const steps = DISP[t];
    let found = 0;
    for (let k = 1; k <= steps; k++) {
      const j = i + dir * k, jt = cells[j];
      if (jt === E.EMPTY || STATE[jt] === ST_GAS) {
        found = j;
        const jb = cells[j + W];
        if (jb === E.EMPTY || STATE[jb] === ST_GAS) break; // 前方有落差，流过去
      } else break;
    }
    if (found) this.swapCells(i, found);
    else aux[i] ^= BIT_DIR; // 碰壁换向
  }

  moveGas(i, x, y, t) {
    if (this.windPush(i, x, y, ST_GAS)) return;
    const { cells } = this;
    const buoy = 1.2 - DENS[t];              // 相对空气的浮力
    const up = buoy > 0;
    const pv = 0.3 + Math.min(0.5, Math.abs(buoy) * 0.45);
    const r = R();
    const tryTo = (j) => {
      const jt = cells[j];
      if (jt === E.EMPTY) { this.swapCells(i, j); return true; }
      if (STATE[jt] === ST_GAS && jt !== t) {
        // 气体密度分层：轻者上浮
        const jUpper = j < i;
        if (((jUpper && DENS[jt] > DENS[t]) || (!jUpper && DENS[jt] < DENS[t])) && R() < 0.3) { this.swapCells(i, j); return true; }
      }
      return false;
    };
    if (r < pv) {
      const v = up ? -W : W;
      const dx = (R() * 3 | 0) - 1;
      if (tryTo(i + v + dx)) return;
      if (tryTo(i + v)) return;
    } else if (r < pv + 0.4) {
      if (tryTo(i + (R() < 0.5 ? 1 : -1))) return;
    }
  }

  moveFire(i, x, y) {
    // 火焰向上飘动
    const r = R();
    const d = r < 0.55 ? -W + ((R() * 3 | 0) - 1) : r < 0.8 ? (R() < 0.5 ? 1 : -1) : 0;
    if (!d) return;
    const j = i + d, jt = this.cells[j];
    if (jt === E.EMPTY || STATE[jt] === ST_GAS) this.swapCells(i, j);
  }

  // ———— 存档（RLE 压缩）————
  save() {
    const rle = (arr) => {
      const out = [];
      let run = 1;
      for (let i = 1; i <= arr.length; i++) {
        if (i < arr.length && arr[i] === arr[i - 1] && run < 65535) run++;
        else { out.push(run, arr[i - 1]); run = 1; }
      }
      return out;
    };
    const tq = new Int16Array(SIZE);
    for (let i = 0; i < SIZE; i++) tq[i] = Math.round(this.temp[i]);
    return JSON.stringify({ v: 1, w: W, h: H, frame: this.frame, cells: rle(this.cells), life: rle(this.life), aux: rle(this.aux), temp: rle(tq) });
  }

  load(json) {
    const o = JSON.parse(json);
    if (!o || o.v !== 1 || o.w !== W || o.h !== H) return false;
    const unrle = (pairs, arr) => {
      let p = 0;
      for (let k = 0; k < pairs.length; k += 2) {
        const run = pairs[k], val = pairs[k + 1];
        for (let r = 0; r < run; r++) arr[p++] = val;
      }
      return p === arr.length;
    };
    const tq = new Int16Array(SIZE);
    if (!unrle(o.cells, this.cells) || !unrle(o.life, this.life) || !unrle(o.aux, this.aux) || !unrle(o.temp, tq)) return false;
    for (let i = 0; i < SIZE; i++) this.temp[i] = tq[i];
    this.avx.fill(0); this.avy.fill(0); this.ap.fill(0);
    this.frame = o.frame | 0;
    return true;
  }
}
