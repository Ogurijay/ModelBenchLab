/**
 * 子午冠球场 — 座位、视线与疏散的唯一数据源。
 * 纯数学，不依赖 three.js。容量按实际落位统计，不预写一个 80000。
 *
 * 坐标系：Y 向上，球场中心在原点。长轴沿 Z（北—南），西看台在 -X。
 * 无跑道。焦点取近边线 / 近球门线（直线段距离相同）。
 *
 * C 值（Green Guide）：
 *   后排眼睛高度 E 满足视线在前排眼睛处高出 C。
 *   E = (E前 + C) * D / (D - T)
 *   实际踏步被限制在 nMin–nMax，因此后排 C 可能高于目标，近处若触顶则低于目标。
 */

export const PITCH = { length: 105, width: 68 };
const HALF_L = PITCH.length / 2;
const HALF_W = PITCH.width / 2;

const EYE = 1.2;
const SETBACK = 0.15;
const C_TARGET = 0.09;
const SEAT_W = 0.5;
const GANG_W = 1.35;
const BAY_TARGET = 22 * SEAT_W + GANG_W;

/** 首排踏步前缘。四边离边线 / 球门线均为 12m，看台转角半径 18m。 */
const BOWL0 = { hx: HALF_W + 12, hz: HALF_L + 12, cr: 18 };

const LOWER = {
  id: "lower",
  rows: 34,
  tread: 0.82,
  seatW: 0.5,
  y0: 1.95,
  nMin: 0.32,
  nMax: 0.46,
  /** 中部横向通道插在这一排之后，径向加宽，无座。 */
  crossAfter: 14,
  crossDepth: 0,
};
const CLUB = {
  id: "club",
  rows: 18,
  tread: 0.9,
  seatW: 0.54,
  nMin: 0.3,
  nMax: 0.5,
  /** 与下层后缘的结构缝（环廊外墙）。 */
  gapAfterLower: 8.6,
};
const UPPER = {
  id: "upper",
  rows: 32,
  tread: 0.8,
  seatW: 0.5,
  nMin: 0.36,
  nMax: 0.6,
  /** 从俱乐部层前缘再向场地方向挑出的距离。负值表示退在俱乐部之后。 */
  overhang: 6.4,
  crossAfter: 12,
  crossDepth: 0,
};

const SAMPLES = 336;
const FLOW_PER_M_MIN = 66;
const EVAC_MIN = 8;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function makeLoop(hx, hz, radius) {
  const r = Math.min(radius, hx - 0.4, hz - 0.4);
  const straightX = 2 * (hx - r);
  const straightZ = 2 * (hz - r);
  const arc = (Math.PI * r) / 2;
  const pieces = [
    {
      name: "east",
      len: straightZ,
      at(t) {
        const z0 = -(hz - r);
        return { x: hx, z: z0 + t * straightZ, nx: 1, nz: 0, region: "east" };
      },
    },
    {
      name: "ne",
      len: arc,
      at(t) {
        const a = t * (Math.PI / 2);
        const cx = hx - r;
        const cz = hz - r;
        return {
          x: cx + Math.cos(a) * r,
          z: cz + Math.sin(a) * r,
          nx: Math.cos(a),
          nz: Math.sin(a),
          region: "ne",
        };
      },
    },
    {
      name: "north",
      len: straightX,
      at(t) {
        const x0 = hx - r;
        return { x: x0 - t * straightX, z: hz, nx: 0, nz: 1, region: "north" };
      },
    },
    {
      name: "nw",
      len: arc,
      at(t) {
        const a = Math.PI / 2 + t * (Math.PI / 2);
        const cx = -(hx - r);
        const cz = hz - r;
        return {
          x: cx + Math.cos(a) * r,
          z: cz + Math.sin(a) * r,
          nx: Math.cos(a),
          nz: Math.sin(a),
          region: "nw",
        };
      },
    },
    {
      name: "west",
      len: straightZ,
      at(t) {
        const z0 = hz - r;
        return { x: -hx, z: z0 - t * straightZ, nx: -1, nz: 0, region: "west" };
      },
    },
    {
      name: "sw",
      len: arc,
      at(t) {
        const a = Math.PI + t * (Math.PI / 2);
        const cx = -(hx - r);
        const cz = -(hz - r);
        return {
          x: cx + Math.cos(a) * r,
          z: cz + Math.sin(a) * r,
          nx: Math.cos(a),
          nz: Math.sin(a),
          region: "sw",
        };
      },
    },
    {
      name: "south",
      len: straightX,
      at(t) {
        const x0 = -(hx - r);
        return { x: x0 + t * straightX, z: -hz, nx: 0, nz: -1, region: "south" };
      },
    },
    {
      name: "se",
      len: arc,
      at(t) {
        const a = -Math.PI / 2 + t * (Math.PI / 2);
        const cx = hx - r;
        const cz = -(hz - r);
        return {
          x: cx + Math.cos(a) * r,
          z: cz + Math.sin(a) * r,
          nx: Math.cos(a),
          nz: Math.sin(a),
          region: "se",
        };
      },
    },
  ];
  let total = 0;
  for (const p of pieces) {
    p.start = total;
    total += p.len;
    p.end = total;
  }
  return { hx, hz, r, straightX, straightZ, pieces, total };
}

export function pointOnLoop(loop, dist) {
  let d = dist % loop.total;
  if (d < 0) d += loop.total;
  for (const p of loop.pieces) {
    if (d <= p.end + 1e-6) {
      const t = p.len < 1e-8 ? 0 : clamp((d - p.start) / p.len, 0, 1);
      return p.at(t);
    }
  }
  return loop.pieces[0].at(0);
}

export function sampleLoop(loop, n, y) {
  const pts = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = pointOnLoop(loop, (i / n) * loop.total);
    pts[i * 3] = p.x;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = p.z;
    nrm[i * 2] = p.nx;
    nrm[i * 2 + 1] = p.nz;
  }
  return { pts, nrm, n };
}

/** 相对首排前缘圆角矩形的有符号径向距离（向外为正）与弧长参数。 */
/** 屋盖四角抬高、四边中点压低。theta=0 在东侧。 */
export function crownLift(x, z, amp) {
  const th = Math.atan2(z, x);
  return -Math.cos(th * 4) * amp;
}

export function locate(x, z, hx = BOWL0.hx, hz = BOWL0.hz, radius = BOWL0.cr) {
  const r = Math.min(radius, hx - 0.4, hz - 0.4);
  const inHx = hx - r;
  const inHz = hz - r;
  const ax = Math.abs(x) - inHx;
  const az = Math.abs(z) - inHz;
  const base = makeLoop(hx, hz, r);

  if (ax > 0 && az > 0) {
    const cx = Math.sign(x || 1) * inHx;
    const cz = Math.sign(z || 1) * inHz;
    const dx = x - cx;
    const dz = z - cz;
    const len = Math.hypot(dx, dz) || 1e-6;
    const nx = dx / len;
    const nz = dz / len;
    const offset = len - r;
    let ang = Math.atan2(dz, dx);
    if (ang < 0) ang += Math.PI * 2;
    // 与 makeLoop 的四段圆弧对齐：NE 0..π/2, NW π/2..π, SW π..3π/2, SE 3π/2..2π
    let dist;
    const arc = (Math.PI * r) / 2;
    const pE = base.pieces[0].end;
    const pN = base.pieces[2].end;
    const pW = base.pieces[4].end;
    const pS = base.pieces[6].end;
    if (x >= 0 && z >= 0) dist = pE + (ang / (Math.PI / 2)) * arc;
    else if (x < 0 && z >= 0) dist = pN + ((ang - Math.PI / 2) / (Math.PI / 2)) * arc;
    else if (x < 0 && z < 0) dist = pW + ((ang - Math.PI) / (Math.PI / 2)) * arc;
    else dist = pS + ((ang - Math.PI * 1.5) / (Math.PI / 2)) * arc;
    return { offset, s: dist / base.total, dist, nx, nz, region: "corner", loop: base };
  }

  if (ax >= az) {
    const side = x >= 0 ? 1 : -1;
    const offset = side * x - hx;
    const nx = side;
    const nz = 0;
    let dist;
    if (side > 0) {
      const z0 = -inHz;
      dist = clamp(z - z0, 0, base.pieces[0].len);
    } else {
      const z0 = inHz;
      dist = base.pieces[4].start + clamp(z0 - z, 0, base.pieces[4].len);
    }
    return { offset, s: dist / base.total, dist, nx, nz, region: side > 0 ? "east" : "west", loop: base };
  }

  const side = z >= 0 ? 1 : -1;
  const offset = side * z - hz;
  const nx = 0;
  const nz = side;
  let dist;
  if (side > 0) {
    const x0 = inHx;
    dist = base.pieces[2].start + clamp(x0 - x, 0, base.pieces[2].len);
  } else {
    const x0 = -inHx;
    dist = base.pieces[6].start + clamp(x - x0, 0, base.pieces[6].len);
  }
  return { offset, s: dist / base.total, dist, nx, nz, region: side > 0 ? "north" : "south", loop: base };
}

function focusDistance(offset) {
  // 直线段前缘距边线 12m，眼睛再退到踏步后部。调用处另加本排踏步内的退距。
  return 12 + offset;
}

/**
 * 逐排踏步。steps[i] 是从 i-1 排走到 i 排的水平进深（第 0 排无）。
 * 返回每排踏步面标高。
 */
function buildTreads({ rows, tread, y0, nMin, nMax, offset0, crossAfter, crossDepth }) {
  const treads = new Array(rows);
  const depths = new Array(rows);
  const risers = new Array(rows);
  const cvals = new Array(rows);
  const offsets = new Array(rows);
  treads[0] = y0;
  risers[0] = y0;
  cvals[0] = null;
  depths[0] = tread;
  offsets[0] = offset0;
  let eye = y0 + EYE;
  let off = offset0;
  let prevDepth = tread;
  for (let i = 1; i < rows; i++) {
    const stepT = prevDepth;
    const D = focusDistance(off) + (stepT - SETBACK);
    const eTarget = ((eye + C_TARGET) * (D + 0)) / Math.max(0.2, D - stepT);
    // D 是本排（即将落位的这一排）眼睛到焦点的水平距离。
    // 前排眼睛在 D - stepT。推导：E = (E前 + C) * D / (D - T)
    let N = eTarget - eye;
    N = clamp(N, nMin, nMax);
    const eNew = eye + N;
    const H = (eNew * (D - stepT)) / D;
    const cAct = H - eye;
    off += stepT;
    treads[i] = treads[i - 1] + N;
    risers[i] = N;
    cvals[i] = cAct;
    offsets[i] = off;
    const deep = crossAfter === i ? tread + (crossDepth || 0) : tread;
    depths[i] = deep;
    prevDepth = deep;
    eye = eNew;
  }
  // 第 0 排的进深在循环里作为 prevDepth 使用，补上交叉通道
  if (crossAfter === 0) {
    depths[0] = tread + (crossDepth || 0);
  } else {
    depths[0] = crossAfter == null ? tread : tread;
  }
  // 重新按深度累计 offset，保证与 depths 一致（上面 off 用的是 prevDepth，含交叉通道）
  return { treads, risers, cvals, offsets, depths, eye0: y0 + EYE };
}

function minOf(arr) {
  let m = Infinity;
  for (const v of arr) if (v != null && v < m) m = v;
  return m;
}

function seatColor(nx, nz, z, kind) {
  if (kind === "vip") return [92, 42, 52];
  if (kind === "media") return [32, 48, 58];
  if (kind === "wheel") return [36, 92, 110];
  if (kind === "club") return [232, 220, 202];
  if (Math.abs(z) < 0.72 && Math.abs(nx) > 0.65) return [196, 122, 64];
  const east = clamp(nx, 0, 1);
  const west = clamp(-nx, 0, 1);
  const north = clamp(nz, 0, 1);
  const south = clamp(-nz, 0, 1);
  const sand = [214, 196, 166];
  const indigo = [27, 58, 92];
  const terra = [168, 78, 52];
  const wsum = east + west + north + south || 1;
  const c = [0, 0, 0];
  const mix = (rgb, w) => {
    c[0] += rgb[0] * w;
    c[1] += rgb[1] * w;
    c[2] += rgb[2] * w;
  };
  mix(sand, east);
  mix(indigo, west);
  mix(terra, north + south);
  return c.map((v) => Math.round(v / wsum));
}

function pushSeat(dst, p, y, kind) {
  if (dst.count >= dst.cap) throw new Error("seat buffer overflow");
  const i = dst.count;
  dst.x[i] = p.x;
  dst.y[i] = y;
  dst.z[i] = p.z;
  dst.nx[i] = p.nx;
  dst.nz[i] = p.nz;
  const col = seatColor(p.nx, p.nz, p.z, kind);
  dst.r[i] = col[0];
  dst.g[i] = col[1];
  dst.b[i] = col[2];
  dst.kind[i] = dst.kindMap[kind];
  dst.count++;
}

function allocSeats(cap) {
  return {
    cap,
    count: 0,
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    z: new Float32Array(cap),
    nx: new Float32Array(cap),
    nz: new Float32Array(cap),
    r: new Uint8Array(cap),
    g: new Uint8Array(cap),
    b: new Uint8Array(cap),
    kind: new Uint8Array(cap),
    kindMap: { lower: 0, club: 1, upper: 2, vip: 3, media: 4, wheel: 5 },
  };
}

function trimSeats(dst) {
  const n = dst.count;
  return {
    count: n,
    x: dst.x.subarray(0, n),
    y: dst.y.subarray(0, n),
    z: dst.z.subarray(0, n),
    nx: dst.nx.subarray(0, n),
    nz: dst.nz.subarray(0, n),
    r: dst.r.subarray(0, n),
    g: dst.g.subarray(0, n),
    b: dst.b.subarray(0, n),
    kind: dst.kind.subarray(0, n),
  };
}

function bayLayout(perimeter) {
  const n = Math.max(24, Math.round(perimeter / BAY_TARGET));
  const bay = perimeter / n;
  const gang = Math.min(bay * 0.22, Math.max(GANG_W, 1.25));
  return { n, bay, gang, gangFrac: gang / bay };
}

function inTunnelGap(p, row) {
  return row < 8 && p.nx < -0.92 && Math.abs(p.z) < 4.6;
}

function isWestStraight(p) {
  return p.nx < -0.92;
}

/**
 * 在一条前缘上布座。座位中心落在前缘向外 seatSet 的位置，面向场地。
 * skip(p, bayIndex, seatIndex) 为真则不放普通座。
 */
function radialPoint(base, dist, offset) {
  const p = pointOnLoop(base, dist);
  return {
    x: p.x + p.nx * offset,
    z: p.z + p.nz * offset,
    nx: p.nx,
    nz: p.nz,
  };
}

export function sampleRadial(base, offset, n, y) {
  const pts = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = radialPoint(base, (i / n) * base.total, offset);
    pts[i * 3] = p.x;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = p.z;
    nrm[i * 2] = p.nx;
    nrm[i * 2 + 1] = p.nz;
  }
  return { pts, nrm, n };
}

/** 沿基准弧长分跨，座位按该排真实弧长以固定座宽排布，通道因此上下对齐。 */
function eachSeat(base, offset, bayInfo, seatW, cb) {
  const { n, bay, gang } = bayInfo;
  const usable = bay - gang;
  const step = 0.45;
  for (let b = 0; b < n; b++) {
    const d0 = b * bay;
    const d1 = d0 + usable;
    let arc = 0;
    let prev = radialPoint(base, d0, offset);
    const samples = [{ arc: 0, p: prev }];
    for (let d = d0 + step; d < d1 - 1e-6; d += step) {
      const p = radialPoint(base, d, offset);
      arc += Math.hypot(p.x - prev.x, p.z - prev.z);
      samples.push({ arc, p });
      prev = p;
    }
    const end = radialPoint(base, d1, offset);
    arc += Math.hypot(end.x - prev.x, end.z - prev.z);
    samples.push({ arc, p: end });
    const count = Math.floor((arc - 0.06) / seatW);
    if (count <= 0) continue;
    const pad = (arc - count * seatW) / 2;
    for (let i = 0; i < count; i++) {
      const target = pad + (i + 0.5) * seatW;
      let p = samples[samples.length - 1].p;
      for (let s = 1; s < samples.length; s++) {
        if (samples[s].arc >= target) {
          const a = samples[s - 1];
          const c = samples[s];
          const span = c.arc - a.arc || 1;
          const t = (target - a.arc) / span;
          const nx = a.p.nx + (c.p.nx - a.p.nx) * t;
          const nz = a.p.nz + (c.p.nz - a.p.nz) * t;
          const len = Math.hypot(nx, nz) || 1;
          p = {
            x: a.p.x + (c.p.x - a.p.x) * t,
            z: a.p.z + (c.p.z - a.p.z) * t,
            nx: nx / len,
            nz: nz / len,
          };
          break;
        }
      }
      cb(p, b, i, count);
    }
  }
}

function fillRow(dst, base, offset, y, kind, seatW, bayInfo, skip) {
  let placed = 0;
  eachSeat(base, offset, bayInfo, seatW, (edge, b, i, count) => {
    if (skip && skip(edge, b, i, count)) return;
    pushSeat(
      dst,
      {
        x: edge.x + edge.nx * 0.28,
        z: edge.z + edge.nz * 0.28,
        nx: edge.nx,
        nz: edge.nz,
      },
      y,
      kind,
    );
    placed++;
  });
  return placed;
}

function loft(hx, hz, cr, offset) {
  return makeLoop(hx + offset, hz + offset, cr + offset);
}

function buildTier(spec, offset0, y0, bayInfo, dst, base, opts = {}) {
  const profile = buildTreads({
    rows: spec.rows,
    tread: spec.tread,
    y0,
    nMin: spec.nMin,
    nMax: spec.nMax,
    offset0,
    crossAfter: spec.crossAfter,
    crossDepth: spec.crossDepth,
  });
  const nosings = [];
  let seatCount = 0;
  let wheelCount = 0;
  for (let i = 0; i < spec.rows; i++) {
    const sampled = sampleRadial(base, profile.offsets[i], SAMPLES, profile.treads[i]);
    nosings.push({
      y: profile.treads[i],
      offset: profile.offsets[i],
      depth: profile.depths[i],
      loopTotal: base.total,
      ...sampled,
    });
    const isVipRow = opts.vipRows && opts.vipRows.has(i);
    const isCross = spec.crossAfter === i;
    const skip = (p, b, s, count) => {
      if (opts.tunnel && inTunnelGap(p, i)) return true;
      if (isVipRow && isWestStraight(p)) return true;
      if (isCross) return true;
      if (opts.wheelRows && opts.wheelRows.has(i) && b % 2 === 0 && s < 2) return true;
      return false;
    };
    const kind = spec.id;
    if (!isCross) {
      seatCount += fillRow(dst, base, profile.offsets[i], profile.treads[i], kind, spec.seatW, bayInfo, skip);
    }
    if (isCross || (opts.wheelRows && opts.wheelRows.has(i))) {
      const step = isCross ? 1 : 2;
      for (let b = 0; b < bayInfo.n; b += step) {
        const dist = b * bayInfo.bay + (bayInfo.bay - bayInfo.gang) * 0.35;
        const edge = radialPoint(base, dist, profile.offsets[i]);
        if (opts.tunnel && inTunnelGap(edge, i)) continue;
        const p = {
          x: edge.x + edge.nx * 0.28,
          z: edge.z + edge.nz * 0.28,
          nx: edge.nx,
          nz: edge.nz,
        };
        pushSeat(dst, p, profile.treads[i], "wheel");
        wheelCount++;
      }
    }
  }

  // 媒体席：西直线段、靠场地方向数排的中段，改 kind。不增删座位。
  if (opts.mediaRows) {
    const mediaZ = 16;
    for (let k = 0; k < dst.count; k++) {
      if (dst.kind[k] !== dst.kindMap.club) continue;
      if (dst.nx[k] > -0.9) continue;
      if (Math.abs(dst.z[k]) > mediaZ) continue;
      // 用标高判断是否落在指定排
      const y = dst.y[k];
      for (const ri of opts.mediaRows) {
        if (Math.abs(y - profile.treads[ri]) < 0.02) {
          dst.kind[k] = dst.kindMap.media;
          const col = seatColor(dst.nx[k], dst.nz[k], dst.z[k], "media");
          dst.r[k] = col[0];
          dst.g[k] = col[1];
          dst.b[k] = col[2];
        }
      }
    }
  }

  const cFinite = profile.cvals.filter((v) => v != null);
  return {
    id: spec.id,
    profile,
    nosings,
    seatCount,
    wheelCount,
    minC: minOf(cFinite),
    maxC: Math.max(...cFinite),
    backOffset: profile.offsets[spec.rows - 1] + profile.depths[spec.rows - 1],
    frontOffset: profile.offsets[0],
    frontY: profile.treads[0],
    backY: profile.treads[spec.rows - 1],
    crossRow: spec.crossAfter ?? -1,
  };
}

function placeVip(dst, clubTier, bayInfo, base) {
  // 西侧直线段最后两排改为包厢席。
  const rows = [CLUB.rows - 2, CLUB.rows - 1];
  const loop = loft(BOWL0.hx, BOWL0.hz, BOWL0.cr, 0);
  const west = loop.pieces[4];
  let count = 0;
  const boxes = [];
  for (const ri of rows) {
    const y = clubTier.profile.treads[ri];
    const off = clubTier.profile.offsets[ri];
    const groups = new Map();
    eachSeat(base, off, bayInfo, 0.56, (edge, b) => {
      if (!isWestStraight(edge)) return;
      if (Math.abs(edge.z) > west.len / 2 - 3) return;
      const p = {
        x: edge.x + edge.nx * 0.36,
        z: edge.z + edge.nz * 0.36,
        nx: edge.nx,
        nz: edge.nz,
      };
      pushSeat(dst, p, y + 0.05, "vip");
      count++;
      if (ri !== rows[0]) return;
      if (!groups.has(b)) groups.set(b, []);
      groups.get(b).push(p);
    });
    for (const group of groups.values()) {
      if (group.length >= 4 && ri === rows[0]) {
        const zs = group.map((g) => g.z);
        const z0 = Math.min(...zs);
        const z1 = Math.max(...zs);
        boxes.push({
          y,
          z0: z0 - 0.4,
          z1: z1 + 0.4,
          xIn: group[0].x + 0.85,
          xOut: group[0].x - 1.55,
          row: ri,
        });
      }
    }
  }
  // 两排合成一间包厢：按 z 合并
  boxes.sort((a, b) => a.z0 - b.z0);
  const merged = [];
  for (const b of boxes) {
    const prev = merged[merged.length - 1];
    if (prev && b.z0 < prev.z1 + 0.8) {
      prev.z1 = Math.max(prev.z1, b.z1);
      prev.xIn = Math.max(prev.xIn, b.xIn);
      prev.xOut = Math.min(prev.xOut, b.xOut);
      prev.y = Math.min(prev.y, b.y);
    } else merged.push({ ...b });
  }
  // 太长的切开，约 7.2m 一间
  const rooms = [];
  for (const b of merged) {
    const width = b.z1 - b.z0;
    const parts = Math.max(1, Math.round(width / 7.2));
    const slice = width / parts;
    for (let i = 0; i < parts; i++) {
      rooms.push({
        z0: b.z0 + i * slice,
        z1: b.z0 + (i + 1) * slice,
        xIn: b.xIn,
        xOut: b.xOut,
        y: b.y,
        h: 3.15,
      });
    }
  }
  return { count, rooms };
}

function soffitClearance(tier) {
  const { profile } = tier;
  const back = tier.backOffset;
  const yS0 = 0.42;
  const yS1 = tier.backY - 1.05;
  let minGap = Infinity;
  for (let i = 0; i < profile.treads.length; i++) {
    const t = (profile.offsets[i] - profile.offsets[0]) / Math.max(0.01, back - profile.offsets[0]);
    const soffit = yS0 + (yS1 - yS0) * t;
    minGap = Math.min(minGap, profile.treads[i] - soffit);
  }
  return { yS0, yS1, minGap };
}

function sightlineOk(eyeY, eyeOff, obsY, obsOff) {
  const eyeD = focusDistance(eyeOff) + 0.5;
  const obsD = focusDistance(obsOff);
  if (eyeD <= obsD + 0.2) return { ok: true, clearance: 9 };
  const h = (eyeY * obsD) / eyeD;
  return { ok: h - obsY >= 0.09, clearance: h - obsY };
}

export function buildProgram() {
  const base = makeLoop(BOWL0.hx, BOWL0.hz, BOWL0.cr);
  const bays = bayLayout(base.total);
  const dst = allocSeats(150000);

  const lower = buildTier(LOWER, 0, LOWER.y0, bays, dst, base, {
    tunnel: true,
    wheelRows: new Set([1, 8]),
  });
  const clubOffset = lower.backOffset + CLUB.gapAfterLower;
  // 俱乐部首排眼睛需越过下层最后一排头顶
  let clubY = lower.backY + 3.4;
  for (let k = 0; k < 6; k++) {
    const eyeY = clubY + EYE;
    const chk = sightlineOk(eyeY, clubOffset, lower.backY + 0.15, lower.profile.offsets[LOWER.rows - 1]);
    if (chk.ok) break;
    clubY += 0.4;
  }
  const club = buildTier(CLUB, clubOffset, clubY, bays, dst, base, {
    mediaRows: new Set([2, 3, 4, 5]),
    vipRows: new Set([CLUB.rows - 2, CLUB.rows - 1]),
    wheelRows: new Set([1]),
  });
  const vip = placeVip(dst, club, bays, base);

  // 上层从前部挑向俱乐部上方，底面留出俱乐部头顶净空
  const upperOffset = club.frontOffset - UPPER.overhang;
  let upperY = club.frontY + 4.8;
  for (let k = 0; k < 8; k++) {
    const overClub = sightlineOk(upperY + EYE, upperOffset, club.frontY + 0.2, club.frontOffset);
    const overLower = sightlineOk(
      upperY + EYE,
      upperOffset,
      lower.backY + 0.2,
      lower.profile.offsets[LOWER.rows - 1],
    );
    const headroom = upperY - 1.15 - (club.frontY + 2.05);
    if (overClub.ok && overLower.ok && headroom >= 0.35) break;
    upperY += 0.45;
  }
  const upper = buildTier(UPPER, upperOffset, upperY, bays, dst, base, {
    wheelRows: new Set([1, 8]),
  });

  const seats = trimSeats(dst);
  const byKind = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < seats.count; i++) byKind[seats.kind[i]]++;

  const lowerSoffit = soffitClearance(lower);
  const clubSoffit = soffitClearance(club);
  const upperSoffit = soffitClearance(upper);

  // 环廊标高贴在各层后缘，楼梯踢面均分到该标高
  const levels = {
    ground: 0,
    lowerConcourse: lower.backY,
    clubConcourse: club.backY,
    upperConcourse: upper.backY,
    locker: 0,
  };

  const stairList = [];
  const outerLoop = loft(BOWL0.hx, BOWL0.hz, BOWL0.cr, lower.backOffset + 1.2);
  const majorDist = [0, 2, 4, 6].map((idx) => {
    const piece = outerLoop.pieces[idx];
    return piece.start + piece.len * 0.5;
  });
  const addStair = (dist, width, major) => {
    const p = pointOnLoop(outerLoop, dist);
    stairList.push({
      index: stairList.length,
      x: p.x,
      z: p.z,
      nx: p.nx,
      nz: p.nz,
      width,
      major,
      dist: ((dist % outerLoop.total) + outerLoop.total) % outerLoop.total,
    });
  };
  for (let i = 0; i < 4; i++) {
    addStair(majorDist[i], 13, true);
    const a = majorDist[i];
    const b = majorDist[(i + 1) % 4] + (i === 3 ? outerLoop.total : 0);
    for (let k = 1; k <= 3; k++) addStair(a + ((b - a) * k) / 4, 9.4, false);
  }
  const exitWidth = stairList.reduce((s, t) => s + t.width, 0);
  const evacMin = seats.count / (exitWidth * FLOW_PER_M_MIN);

  const roofInner = loft(BOWL0.hx, BOWL0.hz, BOWL0.cr, -5.2);
  const outerOff = upper.backOffset + 3.2;
  const roofOuter = loft(BOWL0.hx, BOWL0.hz, BOWL0.cr, outerOff);
  const roof = {
    innerHx: roofInner.hx,
    innerHz: roofInner.hz,
    innerCr: roofInner.r,
    outerHx: roofOuter.hx,
    outerHz: roofOuter.hz,
    outerCr: roofOuter.r,
    innerY: Math.max(upper.frontY + 7.2, 28),
    outerY: upper.backY + 7.4,
    amp: 4.6,
    depth: 4.15,
    trusses: 52,
    outerOff,
  };

  // 球员通道：西侧中线，洞口穿过下层前 8 排的空档
  const tunnel = {
    z: 0,
    halfW: 3.3,
    mouthX: -(BOWL0.hx - 0.2),
    innerX: -(BOWL0.hx + lower.backOffset - 6),
    floorY: 0,
    clearH: 2.7,
    bridgeRow: 8,
    bridgeY: lower.profile.treads[8],
  };

  const stairs = stairList;

  // 定位回代误差
  let locateErr = 0;
  for (let i = 0; i < 64; i++) {
    const p = pointOnLoop(base, (i / 64) * base.total);
    const hit = locate(p.x, p.z);
    locateErr = Math.max(locateErr, Math.abs(hit.offset));
  }

  const stats = {
    total: seats.count,
    lower: byKind[0],
    club: byKind[1],
    upper: byKind[2],
    vip: byKind[3],
    media: byKind[4],
    wheelchair: byKind[5],
    minC: {
      lower: lower.minC,
      club: club.minC,
      upper: upper.minC,
    },
    maxRiser: {
      lower: Math.max(...lower.profile.risers.slice(1)),
      club: Math.max(...club.profile.risers.slice(1)),
      upper: Math.max(...upper.profile.risers.slice(1)),
    },
    soffitGap: {
      lower: lowerSoffit.minGap,
      club: clubSoffit.minGap,
      upper: upperSoffit.minGap,
    },
    evacMinutes: evacMin,
    exitWidth,
    bays: bays.n,
    gangWidth: bays.gang,
    locateErr,
    perimeter0: base.total,
  };

  const report = [
    `座位 ${stats.total.toLocaleString("zh-CN")}（下层 ${stats.lower.toLocaleString("zh-CN")} / 俱乐部 ${stats.club.toLocaleString("zh-CN")} / 上层 ${stats.upper.toLocaleString("zh-CN")} / 包厢 ${stats.vip.toLocaleString("zh-CN")} / 媒体 ${stats.media.toLocaleString("zh-CN")} / 轮椅 ${stats.wheelchair.toLocaleString("zh-CN")}）`,
    `C 值最小：下层 ${(stats.minC.lower * 1000).toFixed(0)} mm，俱乐部 ${(stats.minC.club * 1000).toFixed(0)} mm，上层 ${(stats.minC.upper * 1000).toFixed(0)} mm（目标 90 mm）`,
    `踏步上限：下层 ${(stats.maxRiser.lower * 1000).toFixed(0)} / 俱乐部 ${(stats.maxRiser.club * 1000).toFixed(0)} / 上层 ${(stats.maxRiser.upper * 1000).toFixed(0)} mm`,
    `疏散：16 座楼梯核共 ${exitWidth.toFixed(0)} m，按 66 人/分钟·米估算全程约 ${evacMin.toFixed(1)} 分钟`,
  ];

  return {
    bowl0: BOWL0,
    pitch: PITCH,
    samples: SAMPLES,
    bays,
    lower,
    club,
    upper,
    seats,
    vipRooms: vip.rooms,
    soffit: { lower: lowerSoffit, club: clubSoffit, upper: upperSoffit },
    levels,
    roof,
    tunnel,
    stairs,
    stats,
    report,
    constants: { EYE, SETBACK, C_TARGET, SEAT_W },
  };
}

const invoked = typeof process !== "undefined" && process.argv?.[1] && process.argv[1].replace(/\\/g, "/").endsWith("src/bowlMath.js");
if (invoked) {
  const p = buildProgram();
  console.log(p.report.join("\n"));
  console.log(JSON.stringify(p.stats, null, 2));
  console.log("levels", p.levels);
  console.log("lower front/back", p.lower.frontY.toFixed(2), p.lower.backY.toFixed(2), "off", p.lower.backOffset.toFixed(2));
  console.log("club front/back", p.club.frontY.toFixed(2), p.club.backY.toFixed(2), "off", p.club.frontOffset.toFixed(2), p.club.backOffset.toFixed(2));
  console.log("upper front/back", p.upper.frontY.toFixed(2), p.upper.backY.toFixed(2), "off", p.upper.frontOffset.toFixed(2), p.upper.backOffset.toFixed(2));
  console.log("roof", p.roof);
  console.log("vip rooms", p.vipRooms.length);
  console.log("tunnel", p.tunnel);
  let worst = Infinity;
  const a = p.club;
  const b = p.upper;
  const o0 = Math.max(a.frontOffset, b.frontOffset);
  const o1 = Math.min(a.backOffset, b.backOffset);
  const yOf = (tier, off) => {
    const offs = tier.profile.offsets;
    const ys = tier.profile.treads;
    if (off <= offs[0]) return ys[0];
    for (let i = 1; i < offs.length; i++) {
      if (off <= offs[i]) {
        const t = (off - offs[i - 1]) / (offs[i] - offs[i - 1]);
        return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
      }
    }
    return ys[ys.length - 1];
  };
  for (let o = o0; o <= o1; o += 0.8) {
    const gap = yOf(b, o) - 1.2 - (yOf(a, o) + 2.0);
    worst = Math.min(worst, gap);
  }
  console.log("club/upper headroom gap m", worst.toFixed(2), "overlap", o0.toFixed(1), o1.toFixed(1));
}
