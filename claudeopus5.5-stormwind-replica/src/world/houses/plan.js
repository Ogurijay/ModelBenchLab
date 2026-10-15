// 房屋规划：只算数字，不碰 three。外壳 / 家具 / 自测脚本共用同一份规划，保证"门在哪、楼梯在哪"只有一个答案。
//
// 房屋局部坐标：原点 = 占地中心（y 为世界高度），+Z = 临街正面（门所在面），X 沿街。
// W = 沿街宽，D = 进深。ry 把局部 +Z 转到 lot.face 指向的街道。
// 楼梯在后墙内侧：A 道（贴后墙）从底层爬到二层，B 道（A 道前面）从二层爬到三层，方向相反（折返）。
// 楼梯沿 u = sx·x 方向展开，sx 随机决定楼梯靠左还是靠右。
import { INSET, FLOOR_H, SLAB, STEP0, JETTY, DOOR, WIN, STAIR, DISTRICT_STYLE, NAMED, pick, pickWeighted } from './styles.js';

const FACE_RY = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
const lerp = (a, b, t) => a + (b - a) * t;

// 在 [lo, hi] 上均匀排窗，避开 forbid 区间；一个都排不下时找最靠中间的可行位
function layoutWindows(lo, hi, forbid, gap) {
  const half = WIN.w / 2;
  const edge = 0.3;
  const ok = (a) => a - half >= lo + edge && a + half <= hi - edge && forbid.every(([f0, f1]) => a + half + 0.3 <= f0 || a - half - 0.3 >= f1);
  const span = hi - lo;
  const n = Math.max(1, Math.round(span / gap));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = lo + (span * (i + 0.5)) / n;
    if (ok(a)) out.push(a);
  }
  if (!out.length) {
    let best = null;
    for (let a = lo + edge + half; a <= hi - edge - half + 1e-6; a += 0.1) {
      if (ok(a) && (best === null || Math.abs(a - (lo + hi) / 2) < Math.abs(best - (lo + hi) / 2))) best = a;
    }
    if (best !== null) out.push(best);
  }
  return out;
}

export function planHouse(lot, ctx) {
  const R = ctx.rng(`house:${lot.id}`);
  const st = DISTRICT_STYLE[lot.district];
  const nm = lot.named ? NAMED[lot.named] : null;
  const base = ctx.coords.DISTRICTS[lot.district]?.top ?? 0;
  const [x0, z0, x1, z1] = lot.r;
  const fx0 = x0 + INSET;
  const fz0 = z0 + INSET;
  const fx1 = x1 - INSET;
  const fz1 = z1 - INSET;
  const ns = lot.face === 'N' || lot.face === 'S';
  const W = ns ? fx1 - fx0 : fz1 - fz0;
  const D = ns ? fz1 - fz0 : fx1 - fx0;
  const T = st.wallT;
  const F = lot.floors;
  const jetty = st.jetty && F > 1 && !nm?.noJetty ? JETTY : 0;

  const p = {
    lot, id: lot.id, rng: ctx.rng, district: lot.district, name: lot.named || null, st, nm, R, base,
    cx: (fx0 + fx1) / 2, cz: (fz0 + fz1) / 2, ry: FACE_RY[lot.face], face: lot.face,
    W, D, T, F, jetty,
  };
  // 顶层墙加高（大教堂区：檐口高度错落）
  p.knee = st.knee ? pick(R, st.knee) : 0;
  p.zf = (k) => D / 2 + (k > 0 ? jetty : 0); // 第 k 层正面外皮
  p.top = (k) => base + STEP0 + FLOOR_H * k + (k === F ? p.knee : 0); // 第 k 层地板顶面（k = F 时是天花板顶 = 檐口）
  p.ix0 = -W / 2 + T;
  p.ix1 = W / 2 - T;
  p.iz0 = -D / 2 + T;
  p.iz1 = (k) => p.zf(k) - T;

  // ---- 业态与材质 ----
  p.biz = nm ? nm.biz : pickWeighted(R, st.biz);
  if (p.biz === 'tavern' && F === 1 && !nm) p.biz = 'home';
  p.groundMat = nm?.ground || pick(R, st.ground);
  p.upperMat = nm?.upper || pick(R, st.upper);
  if (!st.halfTimber && R() < 0.5) p.upperMat = p.groundMat; // 石砌区：上下同材或上白下灰
  p.halfTimber = !!st.halfTimber && !nm?.noJetty;
  p.timberPattern = pick(R, ['brace', 'cross', 'chevron', 'studs', 'brace']);
  p.shutters = p.halfTimber && R() < 0.55;
  p.shutterTone = Math.floor(R() * 3);
  p.roofMat = pick(R, st.roof);

  // ---- 楼梯（两层及以上）----
  p.sx = R() < 0.5 ? 1 : -1;
  if (F >= 2) {
    const iu0 = -W / 2 + T;
    const iu1 = W / 2 - T;
    let ua = iu1 - STAIR.landing - STAIR.len;
    const slack = ua - iu0 - 1.6;
    if (slack > 0) ua -= R() * Math.min(1.0, slack);
    p.stair = {
      ua, L: STAIR.len,
      zA: p.iz0 + STAIR.width / 2, zB: p.iz0 + STAIR.width * 1.5,
      lanes: [[p.iz0, p.iz0 + STAIR.width], [p.iz0 + STAIR.width, p.iz0 + STAIR.width * 2]],
      walk: p.iz0 + STAIR.width * 2 + 0.45, // 楼梯前的走道中线
    };
    const xa = p.sx * ua;
    const xb = p.sx * (ua + STAIR.len);
    p.stair.x0 = Math.min(xa, xb);
    p.stair.x1 = Math.max(xa, xb);
  }

  // ---- 壁炉（在楼梯落脚平台的对侧侧墙，避开楼梯区）----
  const bigFire = p.biz === 'tavern' || p.biz === 'cityhall' || p.biz === 'orphanage';
  const fside = F >= 2 ? -p.sx : R() < 0.5 ? 1 : -1;
  let fw = bigFire ? 2.4 : 1.6;
  const zLoBase = F >= 2 ? p.iz0 + STAIR.width * 2 + 0.9 : p.iz0 + 0.3;
  const zHi0 = p.iz1(0) - 0.35;
  if (zHi0 - zLoBase < fw + 0.2) fw = 1.6;
  const zLo = zLoBase + fw / 2 + 0.1;
  const zHi = zHi0 - fw / 2;
  const fz = zLo <= zHi ? lerp(zLo, zHi, R()) : (zLo + zHi) / 2;
  p.fire = { side: fside, w: fw, d: 0.7, z: fz, xFace: fside * (W / 2 - T), wall: fside < 0 ? 'left' : 'right', big: fw > 2 };

  // ---- 门（避开壁炉一侧，壁炉前留 0.6 m）----
  const [dw, dh] = nm?.door || [DOOR.w, DOOR.h];
  let lo = p.ix0 + dw / 2 + 0.7;
  let hi = p.ix1 - dw / 2 - 0.7;
  if (fside < 0) lo = Math.max(lo, p.ix0 + 1.4 + dw / 2 + 0.25);
  else hi = Math.min(hi, p.ix1 - 1.4 - dw / 2 - 0.25);
  let dx = nm ? (lo + hi) / 2 : lerp(lo, hi, 0.5 + (R() - 0.5) * 0.7);
  if (nm && lo <= 0 && hi >= 0) dx = 0;
  p.dw = dw;
  p.dh = dh;
  p.dx = Math.max(lo, Math.min(hi, dx));

  // ---- 窗：每层每面至少一扇 ----
  const fireForbid = [[fz - fw / 2 - 0.15, fz + fw / 2 + 0.15]];
  const stairForbid = p.stair ? [[p.stair.x0 - 0.2, p.stair.x1 + 0.2]] : [];
  const doorPad = nm?.banners ? 1.5 : 0.3;
  const gap = st.winGap * (nm ? 0.9 : 1);
  p.win = [];
  for (let k = 0; k < F; k++) {
    const front = layoutWindows(p.ix0, p.ix1, k === 0 ? [[p.dx - dw / 2 - doorPad, p.dx + dw / 2 + doorPad]] : [], gap);
    const back = layoutWindows(p.ix0, p.ix1, stairForbid, gap);
    const sideLo = p.iz0;
    const sideHi = p.iz1(k);
    // 侧墙多半对着 1.2 m 的邻屋夹缝：每层 1~2 扇就够
    const left = layoutWindows(sideLo, sideHi, p.fire.wall === 'left' ? fireForbid : [], 5.2);
    const right = layoutWindows(sideLo, sideHi, p.fire.wall === 'right' ? fireForbid : [], 5.2);
    p.win.push({ front, back, left, right });
  }

  // ---- 屋顶：沿长轴的双坡 ----
  const zfT = p.zf(F - 1);
  const Dt = zfT + D / 2;
  let ridgeX;
  if (W >= Dt * 1.2) ridgeX = true;
  else if (Dt >= W * 1.2) ridgeX = false;
  else ridgeX = R() < 0.5;
  const span = ridgeX ? Dt : W;
  const pitch = lerp(st.pitch[0], st.pitch[1], R());
  p.roof = {
    ridgeX, span, length: ridgeX ? W : Dt, rise: (pitch * span) / 2,
    cz: (zfT - D / 2) / 2, y: p.top(F), over: st.over, th: st.roofT, Dt,
  };
  p.roofH = (x, z) => {
    const r = p.roof;
    const t = r.ridgeX ? Math.abs(z - r.cz) / (Dt / 2) : Math.abs(x) / (W / 2);
    return r.rise * Math.max(0, 1 - t);
  };

  // ---- 烟囱 ----
  const cw = st.bigChimney ? 1.25 : 0.8;
  p.chimneys = [{ x: fside * (W / 2 - T - 0.35), z: fz, w: cw, extra: 0.9 + R() * 0.8 }];
  if (st.bigChimney && (p.biz === 'workshop' || R() < 0.45)) {
    // 矮人区：第二根大烟囱（工坊熔炉 / 炉灶）
    p.chimneys.push({ x: -fside * (W / 2 - T - 0.7), z: p.iz1(0) - 1.2, w: cw, extra: 1.4 + R() * 1.0, forge: true });
  }

  // ---- 老虎窗（只在沿街出檐的前坡上）----
  p.dormers = [];
  if (ridgeX && R() < st.dormer && p.roof.rise >= 3.0) {
    const n = W > 12 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? (R() - 0.5) * W * 0.3 : (i === 0 ? -1 : 1) * W * 0.24;
      if (p.chimneys.some((c) => Math.abs(c.x - x) < 1.6)) continue;
      p.dormers.push({ x });
    }
  }
  // 色调档（放在最后抽，不改变前面的随机序列）：外墙 2 档、屋瓦 2 档；大教堂区已有 3 种灰石，不再叠加
  const R2 = ctx.rng(`tone:${lot.id}`);
  p.tone = st.noTone ? 0 : Math.floor(R2() * 2);
  p.roofTone = Math.floor(R2() * 2);
  return p;
}

export { FLOOR_H, SLAB, STEP0, STAIR, WIN };
