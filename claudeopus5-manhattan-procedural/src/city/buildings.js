/**
 * @file src/city/buildings.js
 * @description 曼哈顿普通楼群（契约 §5.2）——画面主体。
 *
 * ---------------------------------------------------------------------------
 * 一、体块策略（≥5 种，1916 年纽约分区法 Zoning Resolution 的"退台"形态学）
 * ---------------------------------------------------------------------------
 *  1. `slab`   平顶板楼：单体块 + 女儿墙，战后国际式办公楼的典型剪影。
 *  2. `setback` 退台塔楼：1~3 级退台，**每级平面收进 8~18%**。1916 年分区法要求
 *     建筑超过临街高度后必须逐级后退（以保证街道日照），这正是曼哈顿"婚礼蛋糕"
 *     天际线的成因；契约 §5.2 要求 h > 120m 必须退台。
 *  3. `podium` 裙楼 + 塔楼：3~6 层满铺裙房（贴红线）+ 平面 45~70% 的塔身。
 *  4. `gable`  坡顶老砖楼：低层砖砌联排 + 双坡屋顶 + 烟囱（村区/苏活）。
 *  5. `prewar` 战前楼：石材基座 + 主体 + **出挑檐口（cornice）** + 女儿墙。
 *  6. `extruded` 异形挤出楼：三角/多边形地块用 `THREE.Shape + ExtrudeGeometry`
 *     **沿地块多边形真实挤出**（绝不用盒子凑），>120m 时对多边形做形心缩放退台。
 *
 * ---------------------------------------------------------------------------
 * 二、窗格尺度（本模块最关键的真实感来源）
 * ---------------------------------------------------------------------------
 * 层高 3.5m、窗宽 2.6m 是契约 §5.2 给定的全城统一模数。`core/textures.js` 的
 * `facadeWindows` / `glassCurtain` 一张贴图恰好是 **8 窗宽 × 8 层高**
 * （见 textures.js 中 `makeFacadeWindows` 的说明），因此一张贴图 = 20.8m × 28m：
 *
 *      repeat.x = 宽度 / 2.6 / 8 = 宽度 / TILE_W
 *      repeat.y = 高度 / 3.5 / 8 = 高度 / TILE_H
 *
 * 但 `Texture.repeat` 是**逐贴图**的，若逐栋楼设 repeat 就必须逐栋楼一个材质，
 * 于是 drawcall = 楼数（1000+），直接违反契约 §5.2 的"楼群 ≤ 24 drawcall"。
 * 所以本模块把上式**烘焙进顶点 UV**：所有立面顶点的 uv 直接取
 * `(世界水平坐标 / TILE_W, 世界高度 / TILE_H)`，贴图自身 `repeat` 恒为 (1,1)。
 * 二者数学完全等价（uv × repeat 与直接给出缩放后的 uv 是同一个采样坐标），
 * 但可以把全城楼体合并成十几个 mesh。窗格因此在全城严格同尺寸、同标高：
 * 每栋楼的楼层线都落在 y = 3.5k 上，街对面两栋楼的窗台是齐的。
 *
 * 每栋楼另给一个**整窗/整层的 UV 偏移**（k/8、m/8），使各楼点亮的窗户图案不同，
 * 又不会破坏 2.6m / 3.5m 的网格对齐。
 *
 * ---------------------------------------------------------------------------
 * 三、渲染预算（契约 §5.2：drawcall ≤ 24，三角形 ≤ 900k）
 * ---------------------------------------------------------------------------
 * 楼体按 (立面材质 × 夜间亮灯档) 分组合并成 4×3 = 12 个 mesh，
 * 石材/砖/混凝土线脚 3 个、屋面 1 个，屋顶设备 4 个 `InstancedMesh`，
 * 合计 **20 个 drawcall**。合并采用自建的紧凑 builder（直接写 typed array），
 * 不逐栋 new BoxGeometry，构建耗时与内存都远低于 `mergeGeometries` 方案。
 *
 * ---------------------------------------------------------------------------
 * 四、夜间窗灯
 * ---------------------------------------------------------------------------
 * `emissiveMap` 用 `facadeWindows.emissiveMap`（约 55% 的窗点亮，暖色为主），
 * `update()` 里按 `ctx.nightFactor` 设 `material.emissiveIntensity`。
 * 每栋楼随机落入 3 个"亮灯档"之一（0.34 / 0.86 / 1.55 倍），配合各自的 UV 偏移，
 * 使全城不会出现整齐划一的灯光。阴天（cloudDarkness）会提前亮灯。
 *
 * 坐标约定（契约 §0）：Y 向上；+X 东、−X 西；+Z 南（下城）、−Z 北（上城）；1 单位 = 1m。
 * 随机全部来自 `ctx0.rng.fork('buildings')`（契约 §0：禁止 Math.random）。
 */

import * as THREE from 'three';
import { makeRng } from '../core/rng.js';
import { clamp, lerp, smoothstep } from '../core/mathx.js';
import { patchCityMaterial, CITY_MATERIAL_DEFAULTS } from '../render/shaderpatch.js';

/* ========================================================================== *
 * 一、模数与常量
 * ========================================================================== */

/** 标准层高（米，契约 §5.2） */
const FLOOR_H = 3.5;
/** 标准窗宽（米，契约 §5.2） */
const WINDOW_W = 2.6;
/** 立面贴图一张 = 8 窗宽 × 8 层高（见 core/textures.js 的 makeFacadeWindows） */
const TILE_COLS = 8;
const TILE_ROWS = 8;
/** 一张立面贴图覆盖的实际宽度 = 20.8m */
const TILE_W = WINDOW_W * TILE_COLS;
/** 一张立面贴图覆盖的实际高度 = 28m */
const TILE_H = FLOOR_H * TILE_ROWS;

/** 屋面碎石贴图边长（米） */
const ROOF_TILE = 6.5;
/** 线脚贴图边长（米）：石灰岩方石 / 砖 / 混凝土模板 */
const TRIM_TILE = { limestone: 2.6, brick: 1.7, concrete: 3.2 };
/** 砖贴图纵向一皮 16 行砖 ≈ 1.1m，单独给纵向模数 */
const TRIM_TILE_V = { limestone: 2.6, brick: 1.1, concrete: 3.2 };

/** 楼体埋深（米）：略微沉入地面，避免与人行道之间出现缝 */
const BURY = 0.45;
/** 主体相对地块红线的退让（米）：留出勒脚，避免相邻楼面重叠闪烁 */
const BODY_INSET = 0.35;
/** 基座（勒脚）相对红线的退让（米） */
const BASE_INSET = 0.06;

/** 街面油烟污渍：底部亮度下限 */
const GRIME_MIN = 0.78;
/** 污渍消散高度（米） */
const GRIME_H = 16;

/** 夜间亮灯档位（emissiveIntensity 基准倍率） */
const LIT_BUCKETS = [0.34, 0.86, 1.55];
/** 各档位被抽中的权重 */
const LIT_WEIGHTS = [0.34, 0.44, 0.22];

/** 立面风格配置：tint 会以顶点色形式乘到窗格贴图上 */
const STYLE_CONFIG = {
  limestone: { tint: [1.0, 0.96, 0.86], trim: 'limestone', litBias: 0.95, rough: 0.88, metal: 0.03 },
  brick: { tint: [1.0, 0.68, 0.55], trim: 'brick', litBias: 0.82, rough: 0.92, metal: 0.02 },
  glass: { tint: [1.0, 1.0, 1.0], trim: 'concrete', litBias: 1.3, rough: 0.16, metal: 0.62 },
  deco: { tint: [0.94, 0.88, 0.78], trim: 'limestone', litBias: 1.05, rough: 0.84, metal: 0.05 }
};
/** 立面风格顺序（决定材质数组下标） */
const STYLES = ['limestone', 'brick', 'glass', 'deco'];
/** 线脚材质种类 */
const TRIMS = ['limestone', 'brick', 'concrete'];

/** 屋顶设备类型（各自一个 InstancedMesh） */
const DETAIL_TYPES = ['waterTower', 'acUnit', 'bulkhead', 'antenna'];

/** 面掩码（emitBox 用） */
const FACE_PX = 1;
const FACE_NX = 2;
const FACE_PZ = 4;
const FACE_NZ = 8;
const FACE_PY = 16;
const FACE_NY = 32;
/** 四个立面 */
const FACE_SIDES = FACE_PX | FACE_NX | FACE_PZ | FACE_NZ;
/** 四个立面 + 顶面 */
const FACE_SIDES_TOP = FACE_SIDES | FACE_PY;

/* ========================================================================== *
 * 二、通用小工具
 * ========================================================================== */

/**
 * 高度对齐到层高整数倍（至少 1 层），保证 UV 的 v 落在楼层线上。
 * @param {number} h 原始高度（米）
 * @param {number} [minFloors=1] 最少层数
 * @returns {number} 3.5 的整数倍
 */
function snapFloors(h, minFloors = 1) {
  const f = Math.max(minFloors, Math.round(h / FLOOR_H));
  return f * FLOOR_H;
}

/**
 * 把 0..1 的分量转成 0..255 的整数（顶点色用 Uint8 归一化属性存）。
 * @param {number} v 分量
 * @returns {number} 0..255
 */
function toByte(v) {
  const b = Math.round(v * 255);
  return b < 0 ? 0 : b > 255 ? 255 : b;
}

/**
 * 多边形包围盒。
 * @param {Array<[number, number]>} poly `[[x,z], ...]`
 * @returns {{minX:number, maxX:number, minZ:number, maxZ:number}} 包围盒
 */
function polyBounds(poly) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[1] > maxZ) maxZ = p[1];
  }
  return { minX, maxX, minZ, maxZ };
}

/**
 * 多边形面积（高斯鞋带公式，取绝对值）。
 * 本模块不 import `city/grid.js`（契约 §0 规定 city/* 之间不互相 import），故就地实现。
 * @param {Array<[number, number]>} poly `[[x,z], ...]`
 * @returns {number} 面积（m²）
 */
function polyArea(poly) {
  if (!poly || poly.length < 3) return 0;
  let acc = 0;
  let prev = poly[poly.length - 1];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    acc += prev[0] * cur[1] - cur[0] * prev[1];
    prev = cur;
  }
  return Math.abs(acc) * 0.5;
}

/**
 * 多边形面积加权形心。
 * @param {Array<[number, number]>} poly `[[x,z], ...]`
 * @returns {{x:number, z:number}} 形心
 */
function polyCentroid(poly) {
  let a2 = 0;
  let cx = 0;
  let cz = 0;
  let prev = poly[poly.length - 1];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const cross = prev[0] * cur[1] - cur[0] * prev[1];
    a2 += cross;
    cx += (prev[0] + cur[0]) * cross;
    cz += (prev[1] + cur[1]) * cross;
    prev = cur;
  }
  if (Math.abs(a2) < 1e-9) {
    let sx = 0;
    let sz = 0;
    for (let i = 0; i < poly.length; i++) {
      sx += poly[i][0];
      sz += poly[i][1];
    }
    return { x: sx / poly.length, z: sz / poly.length };
  }
  const inv = 1 / (3 * a2);
  return { x: cx * inv, z: cz * inv };
}

/**
 * 以形心为中心缩放多边形——用作异形地块的"退台"近似
 * （凸多边形上，形心缩放 k 等价于各边平行内移，收进比例恰为 1−k）。
 * @param {Array<[number, number]>} poly 原多边形
 * @param {number} k 缩放系数（0<k<1）
 * @param {{x:number, z:number}} c 形心
 * @returns {Array<[number, number]>} 新多边形
 */
function scalePolygon(poly, k, c) {
  const out = new Array(poly.length);
  for (let i = 0; i < poly.length; i++) {
    out[i] = [c.x + (poly[i][0] - c.x) * k, c.z + (poly[i][1] - c.z) * k];
  }
  return out;
}

/**
 * 把多边形按固定距离向内收（近似：用形心缩放实现，保证不自交）。
 * @param {Array<[number, number]>} poly 原多边形
 * @param {number} d 内收距离（米）
 * @returns {Array<[number, number]>} 新多边形
 */
function insetPolygon(poly, d) {
  const c = polyCentroid(poly);
  let maxR = 0;
  for (let i = 0; i < poly.length; i++) {
    const r = Math.hypot(poly[i][0] - c.x, poly[i][1] - c.z);
    if (r > maxR) maxR = r;
  }
  if (maxR < 1e-6) return poly;
  return scalePolygon(poly, Math.max(0.2, 1 - d / maxR), c);
}

/**
 * 高精度计时（Node 下无 performance 时退化为 Date）。
 * @returns {number} 毫秒
 */
function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/* ========================================================================== *
 * 三、紧凑几何 builder（合并写入，避免逐栋 new BufferGeometry）
 * ========================================================================== */

/**
 * @typedef {Object} MeshBuilder
 * @property {number[]} pos 顶点坐标
 * @property {number[]} nor 法线
 * @property {number[]} uv  纹理坐标
 * @property {number[]} col 顶点色（0..255）
 * @property {number[]} index 三角形索引
 * @property {number} count 已写入顶点数
 */

/**
 * 新建一个空 builder。
 * @returns {MeshBuilder} builder
 */
function createBuilder() {
  return { pos: [], nor: [], uv: [], col: [], index: [], count: 0 };
}

/** emitQuad 的复用暂存区（4 顶点 × [x,y,z,u,v]），避免每个面分配数组 */
const _quad = new Float64Array(20);

/**
 * 写入一个顶点（顺带按高度算街面污渍）。
 * @param {MeshBuilder} b builder
 * @param {number} x 世界 X
 * @param {number} y 世界 Y
 * @param {number} z 世界 Z
 * @param {number} nx 法线 X
 * @param {number} ny 法线 Y
 * @param {number} nz 法线 Z
 * @param {number} u UV.u
 * @param {number} v UV.v
 * @param {number[]} tint 楼体色调 [r,g,b]（0..~1.1）
 * @returns {number} 顶点索引
 */
function pushVertex(b, x, y, z, nx, ny, nz, u, v, tint) {
  b.pos.push(x, y, z);
  b.nor.push(nx, ny, nz);
  b.uv.push(u, v);
  const grime = GRIME_MIN + (1 - GRIME_MIN) * smoothstep(0, GRIME_H, y);
  b.col.push(toByte(tint[0] * grime), toByte(tint[1] * grime), toByte(tint[2] * grime));
  return b.count++;
}

/**
 * 写入 `_quad` 中暂存的四边形（顶点顺序须为从外侧看逆时针）。
 * @param {MeshBuilder} b builder
 * @param {number} nx 法线 X
 * @param {number} ny 法线 Y
 * @param {number} nz 法线 Z
 * @param {number[]} tint 色调
 * @returns {void}
 */
function emitQuad(b, nx, ny, nz, tint) {
  const i0 = pushVertex(b, _quad[0], _quad[1], _quad[2], nx, ny, nz, _quad[3], _quad[4], tint);
  const i1 = pushVertex(b, _quad[5], _quad[6], _quad[7], nx, ny, nz, _quad[8], _quad[9], tint);
  const i2 = pushVertex(b, _quad[10], _quad[11], _quad[12], nx, ny, nz, _quad[13], _quad[14], tint);
  const i3 = pushVertex(b, _quad[15], _quad[16], _quad[17], nx, ny, nz, _quad[18], _quad[19], tint);
  b.index.push(i0, i1, i2, i0, i2, i3);
}

/**
 * 填 `_quad` 的第 i 个顶点。
 * @param {number} i 序号 0..3
 * @param {number} x 坐标
 * @param {number} y 坐标
 * @param {number} z 坐标
 * @param {number} u UV
 * @param {number} v UV
 * @returns {void}
 */
function setQ(i, x, y, z, u, v) {
  const o = i * 5;
  _quad[o] = x;
  _quad[o + 1] = y;
  _quad[o + 2] = z;
  _quad[o + 3] = u;
  _quad[o + 4] = v;
}

/**
 * @typedef {Object} UvSpec
 * @property {number} tileW 横向贴图模数（米）
 * @property {number} tileH 纵向贴图模数（米）
 * @property {number} uOff  横向偏移（贴图单位）
 * @property {number} vOff  纵向偏移（贴图单位）
 */

/**
 * 写入一个轴对齐长方体。UV 一律由**世界坐标除以贴图模数**得到，
 * 因此相邻体块、相邻楼的窗格天然对齐（契约 §5.2 的"全城窗格一致"）。
 * @param {MeshBuilder} b builder
 * @param {number} x0 西边界
 * @param {number} y0 底
 * @param {number} z0 北边界
 * @param {number} x1 东边界
 * @param {number} y1 顶
 * @param {number} z1 南边界
 * @param {number} mask 面掩码（FACE_* 位或）
 * @param {UvSpec} uv UV 规格
 * @param {number[]} tint 色调
 * @returns {void}
 */
function emitBox(b, x0, y0, z0, x1, y1, z1, mask, uv, tint) {
  const tw = uv.tileW;
  const th = uv.tileH;
  const uo = uv.uOff;
  const vo = uv.vOff;
  const v0 = y0 / th + vo;
  const v1 = y1 / th + vo;

  if (mask & FACE_PX) {
    // 东立面：u 沿 −Z 增长，保证与外法线构成右手系（不出现镜像）
    setQ(0, x1, y0, z1, -z1 / tw + uo, v0);
    setQ(1, x1, y0, z0, -z0 / tw + uo, v0);
    setQ(2, x1, y1, z0, -z0 / tw + uo, v1);
    setQ(3, x1, y1, z1, -z1 / tw + uo, v1);
    emitQuad(b, 1, 0, 0, tint);
  }
  if (mask & FACE_NX) {
    setQ(0, x0, y0, z0, z0 / tw + uo, v0);
    setQ(1, x0, y0, z1, z1 / tw + uo, v0);
    setQ(2, x0, y1, z1, z1 / tw + uo, v1);
    setQ(3, x0, y1, z0, z0 / tw + uo, v1);
    emitQuad(b, -1, 0, 0, tint);
  }
  if (mask & FACE_PZ) {
    setQ(0, x0, y0, z1, x0 / tw + uo, v0);
    setQ(1, x1, y0, z1, x1 / tw + uo, v0);
    setQ(2, x1, y1, z1, x1 / tw + uo, v1);
    setQ(3, x0, y1, z1, x0 / tw + uo, v1);
    emitQuad(b, 0, 0, 1, tint);
  }
  if (mask & FACE_NZ) {
    setQ(0, x1, y0, z0, -x1 / tw + uo, v0);
    setQ(1, x0, y0, z0, -x0 / tw + uo, v0);
    setQ(2, x0, y1, z0, -x0 / tw + uo, v1);
    setQ(3, x1, y1, z0, -x1 / tw + uo, v1);
    emitQuad(b, 0, 0, -1, tint);
  }
  if (mask & FACE_PY) {
    setQ(0, x0, y1, z1, x0 / tw, z1 / tw);
    setQ(1, x1, y1, z1, x1 / tw, z1 / tw);
    setQ(2, x1, y1, z0, x1 / tw, z0 / tw);
    setQ(3, x0, y1, z0, x0 / tw, z0 / tw);
    emitQuad(b, 0, 1, 0, tint);
  }
  if (mask & FACE_NY) {
    setQ(0, x0, y0, z0, x0 / tw, z0 / tw);
    setQ(1, x1, y0, z0, x1 / tw, z0 / tw);
    setQ(2, x1, y0, z1, x1 / tw, z1 / tw);
    setQ(3, x0, y0, z1, x0 / tw, z1 / tw);
    emitQuad(b, 0, -1, 0, tint);
  }
}

/**
 * 写入一片水平屋面（碎石屋顶）。
 * @param {MeshBuilder} b 屋面 builder
 * @param {number} x0 西
 * @param {number} z0 北
 * @param {number} x1 东
 * @param {number} z1 南
 * @param {number} y 标高
 * @param {number[]} tint 色调
 * @returns {void}
 */
function emitRoof(b, x0, z0, x1, z1, y, tint) {
  setQ(0, x0, y, z1, x0 / ROOF_TILE, z1 / ROOF_TILE);
  setQ(1, x1, y, z1, x1 / ROOF_TILE, z1 / ROOF_TILE);
  setQ(2, x1, y, z0, x1 / ROOF_TILE, z0 / ROOF_TILE);
  setQ(3, x0, y, z0, x0 / ROOF_TILE, z0 / ROOF_TILE);
  emitQuad(b, 0, 1, 0, tint);
}

/**
 * 写入一个三角形（坡屋顶的山墙用）。
 * @param {MeshBuilder} b builder
 * @param {number[]} a 顶点 A `[x,y,z,u,v]`
 * @param {number[]} c 顶点 B
 * @param {number[]} d 顶点 C
 * @param {number} nx 法线 X
 * @param {number} ny 法线 Y
 * @param {number} nz 法线 Z
 * @param {number[]} tint 色调
 * @returns {void}
 */
function emitTri(b, a, c, d, nx, ny, nz, tint) {
  const i0 = pushVertex(b, a[0], a[1], a[2], nx, ny, nz, a[3], a[4], tint);
  const i1 = pushVertex(b, c[0], c[1], c[2], nx, ny, nz, c[3], c[4], tint);
  const i2 = pushVertex(b, d[0], d[1], d[2], nx, ny, nz, d[3], d[4], tint);
  b.index.push(i0, i1, i2);
}

/**
 * 把 builder 固化为 BufferGeometry。
 * @param {MeshBuilder} b builder
 * @returns {THREE.BufferGeometry|null} 几何（空 builder 返回 null）
 */
function finalizeGeometry(b) {
  if (b.count === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(b.pos), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(b.nor), 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(b.uv), 2));
  geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(b.col), 3, true));
  const idx = b.count > 65535
    ? new THREE.Uint32BufferAttribute(new Uint32Array(b.index), 1)
    : new THREE.Uint16BufferAttribute(new Uint16Array(b.index), 1);
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  // 释放临时 JS 数组，减少构建期峰值内存
  b.pos.length = 0;
  b.nor.length = 0;
  b.uv.length = 0;
  b.col.length = 0;
  b.index.length = 0;
  return geo;
}

/**
 * 把一段**非索引**几何（ExtrudeGeometry 的某个 group）追加进 builder。
 * @param {MeshBuilder} b 目标 builder
 * @param {THREE.BufferGeometry} geo 源几何（非索引）
 * @param {number} start 起始顶点
 * @param {number} count 顶点数
 * @param {number[]} tint 色调
 * @param {number} [skipBelowY=-Infinity] 三个顶点都低于该高度的三角形直接丢弃（用于剔除底盖）
 * @returns {void}
 */
function appendRange(b, geo, start, count, tint, skipBelowY = -Infinity) {
  const pos = geo.attributes.position.array;
  const nor = geo.attributes.normal.array;
  const uv = geo.attributes.uv.array;
  for (let t = 0; t < count; t += 3) {
    const i0 = start + t;
    const y0 = pos[i0 * 3 + 1];
    const y1 = pos[(i0 + 1) * 3 + 1];
    const y2 = pos[(i0 + 2) * 3 + 1];
    if (y0 < skipBelowY && y1 < skipBelowY && y2 < skipBelowY) continue;
    const base = b.count;
    for (let k = 0; k < 3; k++) {
      const i = i0 + k;
      pushVertex(
        b,
        pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2],
        nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2],
        uv[i * 2], uv[i * 2 + 1],
        tint
      );
    }
    b.index.push(base, base + 1, base + 2);
  }
}

/**
 * 把一个**带索引**的 Three 基本体（Cylinder/Cone/Box 等）经矩阵变换后追加进 builder，
 * 并整体染成给定顶点色（屋顶设备的部件着色用）。
 * @param {MeshBuilder} b 目标 builder
 * @param {THREE.BufferGeometry} geo 源几何
 * @param {THREE.Matrix4} m 变换矩阵
 * @param {number[]} rgb 部件颜色 [r,g,b]（0..1）
 * @returns {void}
 */
function appendPart(b, geo, m, rgb) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const idx = geo.index;
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const vp = new THREE.Vector3();
  const vn = new THREE.Vector3();
  const base = b.count;
  for (let i = 0; i < pos.count; i++) {
    vp.fromBufferAttribute(pos, i).applyMatrix4(m);
    vn.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
    b.pos.push(vp.x, vp.y, vp.z);
    b.nor.push(vn.x, vn.y, vn.z);
    b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    b.col.push(toByte(rgb[0]), toByte(rgb[1]), toByte(rgb[2]));
    b.count++;
  }
  if (idx) {
    for (let i = 0; i < idx.count; i++) b.index.push(base + idx.getX(i));
  } else {
    for (let i = 0; i < pos.count; i++) b.index.push(base + i);
  }
}

/* ========================================================================== *
 * 四、屋顶设备的"单位几何"（各自一个 InstancedMesh）
 * ========================================================================== */

/**
 * 木桶水塔：4 根斜撑木腿 + 平台 + 木桶（带两道铁箍）+ 锥形木顶 + 顶饰。
 * 这是曼哈顿屋顶最具辨识度的物件——1890 年代起纽约法规要求 6 层以上建筑
 * 自设重力供水箱，木桶（红杉/雪松）靠水浸胀密封，至今仍在使用。
 * 单位尺寸：底面 3.2m × 3.2m，总高约 9.2m，原点在底面中心。
 * @returns {THREE.BufferGeometry} 合并后的单位几何（带顶点色）
 */
function makeWaterTowerGeometry() {
  const b = createBuilder();
  const m = new THREE.Matrix4();
  const parts = [];

  const legGeo = new THREE.BoxGeometry(0.24, 3.6, 0.24);
  const woodDark = [0.30, 0.23, 0.16];
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -1 : 1;
    const sz = i % 2 === 0 ? -1 : 1;
    m.makeTranslation(sx * 1.28, 1.8, sz * 1.28);
    appendPart(b, legGeo, m, woodDark);
  }
  parts.push(legGeo);

  // 交叉拉杆（两片薄板，做出桁架感）
  const braceGeo = new THREE.BoxGeometry(2.9, 0.14, 0.12);
  for (let i = 0; i < 2; i++) {
    m.makeRotationY(i * Math.PI * 0.5);
    m.multiply(new THREE.Matrix4().makeTranslation(0, 2.05, -1.28));
    appendPart(b, braceGeo, m, [0.26, 0.20, 0.15]);
  }
  parts.push(braceGeo);

  const deckGeo = new THREE.BoxGeometry(3.2, 0.26, 3.2);
  m.makeTranslation(0, 3.72, 0);
  appendPart(b, deckGeo, m, [0.34, 0.26, 0.18]);
  parts.push(deckGeo);

  // 桶身：上小下大的木桶
  const barrelGeo = new THREE.CylinderGeometry(1.30, 1.42, 4.0, 12, 1, true);
  m.makeTranslation(0, 5.85, 0);
  appendPart(b, barrelGeo, m, [0.52, 0.38, 0.24]);
  parts.push(barrelGeo);

  // 两道铁箍
  const hoopGeo = new THREE.CylinderGeometry(1.36, 1.40, 0.16, 12, 1, true);
  m.makeTranslation(0, 4.75, 0);
  appendPart(b, hoopGeo, m, [0.19, 0.19, 0.20]);
  m.makeTranslation(0, 6.75, 0);
  appendPart(b, hoopGeo, m, [0.19, 0.19, 0.20]);
  parts.push(hoopGeo);

  // 锥顶
  const coneGeo = new THREE.ConeGeometry(1.52, 1.5, 12, 1, false);
  m.makeTranslation(0, 8.6, 0);
  appendPart(b, coneGeo, m, [0.36, 0.27, 0.19]);
  parts.push(coneGeo);

  // 顶饰通气管
  const finialGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.7, 6);
  m.makeTranslation(0, 9.5, 0);
  appendPart(b, finialGeo, m, [0.22, 0.22, 0.23]);
  parts.push(finialGeo);

  for (const g of parts) g.dispose();
  const geo = finalizeGeometry(b);
  geo.name = 'waterTowerUnit';
  return geo;
}

/**
 * 屋顶空调机组（HVAC）：机箱 + 检修板 + 两个风机罩 + 冷媒管。
 * 单位尺寸约 2.8m × 1.5m × 2.0m，原点在底面中心。
 * @returns {THREE.BufferGeometry} 单位几何
 */
function makeAcUnitGeometry() {
  const b = createBuilder();
  const m = new THREE.Matrix4();
  const parts = [];

  const bodyGeo = new THREE.BoxGeometry(2.8, 1.35, 2.0);
  m.makeTranslation(0, 0.72, 0);
  appendPart(b, bodyGeo, m, [0.62, 0.64, 0.65]);
  parts.push(bodyGeo);

  const skidGeo = new THREE.BoxGeometry(3.0, 0.16, 2.2);
  m.makeTranslation(0, 0.08, 0);
  appendPart(b, skidGeo, m, [0.28, 0.28, 0.30]);
  parts.push(skidGeo);

  // 侧面百叶（进风格栅）
  const louverGeo = new THREE.BoxGeometry(0.06, 0.9, 1.5);
  m.makeTranslation(-1.41, 0.75, 0);
  appendPart(b, louverGeo, m, [0.34, 0.36, 0.38]);
  parts.push(louverGeo);

  // 两个风机罩（8 边形 + 平面护网，控制在低多边形）
  const fanRingGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.22, 8, 1, true);
  const fanCapGeo = new THREE.CircleGeometry(0.5, 8);
  const capRot = new THREE.Matrix4().makeRotationX(-Math.PI * 0.5);
  for (let i = 0; i < 2; i++) {
    const x = i === 0 ? -0.65 : 0.65;
    m.makeTranslation(x, 1.5, 0);
    appendPart(b, fanRingGeo, m, [0.46, 0.48, 0.50]);
    m.makeTranslation(x, 1.63, 0);
    m.multiply(capRot);
    appendPart(b, fanCapGeo, m, [0.22, 0.23, 0.24]);
  }
  parts.push(fanRingGeo, fanCapGeo);

  // 冷媒管
  const pipeGeo = new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6, 1, true);
  m.makeTranslation(1.2, 1.35, 0.7);
  appendPart(b, pipeGeo, m, [0.55, 0.56, 0.54]);
  parts.push(pipeGeo);

  for (const g of parts) g.dispose();
  const geo = finalizeGeometry(b);
  geo.name = 'acUnitUnit';
  return geo;
}

/**
 * 电梯机房 / 楼梯出屋面（bulkhead）：主箱体 + 压顶 + 铁门 + 排风帽。
 * 单位尺寸约 5.4m × 3.6m × 4.4m，原点在底面中心。
 * @returns {THREE.BufferGeometry} 单位几何
 */
function makeBulkheadGeometry() {
  const b = createBuilder();
  const m = new THREE.Matrix4();
  const parts = [];

  const bodyGeo = new THREE.BoxGeometry(5.4, 3.6, 4.4);
  m.makeTranslation(0, 1.8, 0);
  appendPart(b, bodyGeo, m, [0.60, 0.58, 0.55]);
  parts.push(bodyGeo);

  const capGeo = new THREE.BoxGeometry(5.9, 0.32, 4.9);
  m.makeTranslation(0, 3.72, 0);
  appendPart(b, capGeo, m, [0.48, 0.47, 0.45]);
  parts.push(capGeo);

  const doorGeo = new THREE.BoxGeometry(1.1, 2.1, 0.1);
  m.makeTranslation(-1.2, 1.05, 2.22);
  appendPart(b, doorGeo, m, [0.30, 0.31, 0.32]);
  parts.push(doorGeo);

  const ventGeo = new THREE.BoxGeometry(1.6, 0.9, 1.6);
  m.makeTranslation(1.3, 4.3, 0);
  appendPart(b, ventGeo, m, [0.44, 0.45, 0.46]);
  parts.push(ventGeo);

  const hoodGeo = new THREE.CylinderGeometry(0.62, 0.72, 0.36, 8);
  m.makeTranslation(1.3, 4.94, 0);
  appendPart(b, hoodGeo, m, [0.36, 0.37, 0.38]);
  parts.push(hoodGeo);

  for (const g of parts) g.dispose();
  const geo = finalizeGeometry(b);
  geo.name = 'bulkheadUnit';
  return geo;
}

/**
 * 屋顶天线桅杆：三脚基座 + 主桅 + 3 道横担 + 顶端航空障碍灯壳。
 * 单位高约 13m，原点在底面中心。
 * @returns {THREE.BufferGeometry} 单位几何
 */
function makeAntennaGeometry() {
  const b = createBuilder();
  const m = new THREE.Matrix4();
  const parts = [];

  const baseGeo = new THREE.BoxGeometry(1.6, 0.3, 1.6);
  m.makeTranslation(0, 0.15, 0);
  appendPart(b, baseGeo, m, [0.34, 0.34, 0.35]);
  parts.push(baseGeo);

  const mastGeo = new THREE.CylinderGeometry(0.13, 0.2, 12, 6);
  m.makeTranslation(0, 6.3, 0);
  appendPart(b, mastGeo, m, [0.42, 0.41, 0.40]);
  parts.push(mastGeo);

  const armGeo = new THREE.BoxGeometry(2.4, 0.09, 0.09);
  for (let i = 0; i < 3; i++) {
    const rot = new THREE.Matrix4().makeRotationY(i * 0.7);
    m.makeTranslation(0, 6.4 + i * 1.9, 0);
    m.multiply(rot);
    appendPart(b, armGeo, m, [0.40, 0.39, 0.38]);
  }
  parts.push(armGeo);

  // 斜拉索（细杆近似）
  const guyGeo = new THREE.CylinderGeometry(0.035, 0.035, 7.4, 4);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    m.makeRotationY(a);
    m.multiply(new THREE.Matrix4().makeTranslation(0.95, 3.6, 0));
    m.multiply(new THREE.Matrix4().makeRotationZ(0.26));
    appendPart(b, guyGeo, m, [0.30, 0.30, 0.31]);
  }
  parts.push(guyGeo);

  // 顶端障碍灯壳（红漆）
  const lampGeo = new THREE.SphereGeometry(0.26, 8, 6);
  m.makeTranslation(0, 12.5, 0);
  appendPart(b, lampGeo, m, [0.65, 0.16, 0.14]);
  parts.push(lampGeo);

  for (const g of parts) g.dispose();
  const geo = finalizeGeometry(b);
  geo.name = 'antennaUnit';
  return geo;
}

/** 单位几何工厂表 */
const DETAIL_FACTORY = {
  waterTower: makeWaterTowerGeometry,
  acUnit: makeAcUnitGeometry,
  bulkhead: makeBulkheadGeometry,
  antenna: makeAntennaGeometry
};

/* ========================================================================== *
 * 五、材质
 * ========================================================================== */

/**
 * 克隆一张共享贴图并把 repeat/offset 归位。
 *
 * 为什么必须克隆：本模块把 repeat 烘焙进了 UV（见文件头说明），要求贴图
 * `repeat = (1,1)`；而 `ctx.textures` 是**全场景共享**的，若别的模块（地标、桥）
 * 改了同一张贴图的 repeat，我们的窗格尺度就会被带偏。克隆体与原图共享
 * `Texture.source`，GPU 上仍是同一份显存（three 的 source 级引用计数），
 * 只是 uv 变换参数各管各的。克隆体由本模块负责 dispose（引用计数安全，
 * 不会影响 `core/textures.js` 持有的原图）。
 * @param {THREE.Texture|null|undefined} tex 共享贴图
 * @param {THREE.Texture[]} sink 克隆体登记表（dispose 用）
 * @returns {THREE.Texture|null} 克隆体
 */
function cloneTexture(tex, sink) {
  if (!tex || typeof tex.clone !== 'function') return null;
  const t = tex.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1);
  t.offset.set(0, 0);
  t.center.set(0, 0);
  t.rotation = 0;
  t.colorSpace = tex.colorSpace;
  t.anisotropy = tex.anisotropy;
  sink.push(t);
  return t;
}

/**
 * 建立本模块用到的全部材质。
 *
 * 分组原则（契约 §5.2 的 drawcall 预算）：
 *  - 立面：4 种风格 × 3 个夜间亮灯档 = 12 个（每个一次 drawcall）
 *  - 线脚：石灰岩 / 砖 / 混凝土 3 个（基座、檐口、女儿墙、坡屋面）
 *  - 屋面：碎石屋顶 1 个
 *  - 屋顶设备：共享 1 个顶点色材质（4 个 InstancedMesh 复用）
 * @param {Object} tex ctx0.textures
 * @param {Object} env ctx0.env
 * @param {THREE.Texture[]} texSink 克隆贴图登记表
 * @returns {{facade: THREE.Material[][], trim: Object, roof: THREE.Material, detail: THREE.Material, all: THREE.Material[]}} 材质集合
 */
function createMaterials(tex, env, texSink) {
  const fw = tex.facadeWindows || {};
  const winMap = cloneTexture(fw.map, texSink);
  const winEmi = cloneTexture(fw.emissiveMap, texSink);
  const winRough = cloneTexture(fw.roughnessMap, texSink);
  const glassMap = cloneTexture(tex.glassCurtain, texSink);
  const limestoneMap = cloneTexture(tex.limestone, texSink);
  const brickMap = cloneTexture(tex.brick, texSink);
  const concreteMap = cloneTexture(tex.concrete, texSink);
  const roofMap = cloneTexture(tex.roofGravel, texSink);

  const all = [];
  /** @type {THREE.Material[][]} */
  const facade = [];

  for (let s = 0; s < STYLES.length; s++) {
    const style = STYLES[s];
    const cfg = STYLE_CONFIG[style];
    const isGlass = style === 'glass';
    facade[s] = [];
    for (let k = 0; k < LIT_BUCKETS.length; k++) {
      const mat = new THREE.MeshStandardMaterial({
        name: `facade-${style}-${k}`,
        map: isGlass ? glassMap : winMap,
        roughnessMap: isGlass ? null : winRough,
        emissiveMap: winEmi,
        emissive: new THREE.Color(isGlass ? 0xe6f0ff : 0xfff0d8),
        emissiveIntensity: 0,
        color: 0xffffff,
        vertexColors: true,
        roughness: cfg.rough,
        metalness: cfg.metal
      });
      mat.userData.litBase = LIT_BUCKETS[k] * cfg.litBias;
      // 立面是竖直面，积雪只能落在窗台/线脚上 → 倍率压低；玻璃更低（契约 §5.2）
      patchCityMaterial(mat, env, {
        snowAmount: isGlass ? 0.25 : 0.55,
        wetness: true,
        wetDarken: 0.28,
        puddles: false,
        flash: true
      });
      facade[s][k] = mat;
      all.push(mat);
    }
  }

  const trimMaps = { limestone: limestoneMap, brick: brickMap, concrete: concreteMap };
  /** @type {Object<string, THREE.Material>} */
  const trim = {};
  for (const key of TRIMS) {
    const mat = new THREE.MeshStandardMaterial({
      name: `trim-${key}`,
      map: trimMaps[key],
      color: 0xffffff,
      vertexColors: true,
      roughness: key === 'limestone' ? 0.86 : 0.94,
      metalness: CITY_MATERIAL_DEFAULTS.metalness
    });
    // 女儿墙/檐口是水平顶面，能积住雪
    patchCityMaterial(mat, env, { snowAmount: 1.0, wetDarken: 0.32, puddles: false, flash: true });
    trim[key] = mat;
    all.push(mat);
  }

  const roof = new THREE.MeshStandardMaterial({
    name: 'roof-gravel',
    map: roofMap,
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.97,
    metalness: 0.02
  });
  patchCityMaterial(roof, env, { snowAmount: 1.0, wetDarken: 0.38, puddles: true, flash: true });
  all.push(roof);

  const detail = new THREE.MeshStandardMaterial({
    name: 'roof-detail',
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.18
  });
  patchCityMaterial(detail, env, { snowAmount: 1.0, wetDarken: 0.3, puddles: false, flash: true });
  all.push(detail);

  return { facade, trim, roof, detail, all };
}

/* ========================================================================== *
 * 六、体块策略
 * ========================================================================== */

/**
 * 选择体块策略（≥5 种，契约 §5.2）。
 * @param {number} h 目标高度（米）
 * @param {string} style 立面风格
 * @param {import('../core/rng.js').Rng} rng 随机流
 * @returns {'slab'|'setback'|'podium'|'gable'|'prewar'} 策略名
 */
function pickStrategy(h, style, rng) {
  if (h > 120) return rng.bool(0.55) ? 'setback' : 'podium';
  if (h <= 26) {
    if ((style === 'brick' || style === 'limestone') && rng.bool(0.5)) return 'gable';
    return rng.bool(0.55) ? 'prewar' : 'slab';
  }
  if (h <= 70) {
    const u = rng.next();
    if (u < 0.4) return 'prewar';
    if (u < 0.74) return 'slab';
    return 'podium';
  }
  const u = rng.next();
  if (u < 0.3) return 'slab';
  if (u < 0.55) return 'prewar';
  if (u < 0.8) return 'setback';
  return 'podium';
}

/**
 * 生成体块分段（自下而上）。
 *
 * 退台规则遵循 1916 年纽约分区法的形态：塔身每升高一段就整体收进，
 * **每级平面收进 8~18%**（契约 §5.2）；高度分配用随机分数并对齐层高，
 * 保证每段顶面都落在 3.5m 的楼层线上（窗格 UV 才不会错层）。
 * @param {{x0:number, z0:number, x1:number, z1:number}} rect 主体平面
 * @param {number} h 总高（米）
 * @param {string} strategy 策略名
 * @param {import('../core/rng.js').Rng} rng 随机流
 * @returns {Array<{x0:number, z0:number, x1:number, z1:number, y1:number}>} 分段（y1 = 段顶标高）
 */
function planSegments(rect, h, strategy, rng) {
  const segs = [];
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;

  if (strategy === 'slab' || strategy === 'prewar' || strategy === 'gable') {
    segs.push({ x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1, y1: h });
    return segs;
  }

  if (strategy === 'podium') {
    // 裙楼 3~6 层，塔身平面占 45~70%（线性缩放取其平方根）
    const podiumH = Math.min(snapFloors(FLOOR_H * rng.int(3, 6)), Math.max(FLOOR_H * 2, h - FLOOR_H * 3));
    const areaRatio = rng.range(0.45, 0.7);
    const k = Math.sqrt(areaRatio);
    const tw = w * k;
    const td = d * k;
    // 塔身在裙楼内随机就位（贴一侧或居中），模拟真实的临街塔位
    const ox = rect.x0 + (w - tw) * rng.range(0.1, 0.9);
    const oz = rect.z0 + (d - td) * rng.range(0.1, 0.9);
    segs.push({ x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1, y1: podiumH });
    const tower = { x0: ox, z0: oz, x1: ox + tw, z1: oz + td };
    if (h > 170) {
      // 高塔在裙楼之上再退一级
      const midY = snapFloors(podiumH + (h - podiumH) * rng.range(0.45, 0.65));
      segs.push({ ...tower, y1: Math.min(midY, h - FLOOR_H * 2) });
      const f = rng.range(0.08, 0.18);
      segs.push({
        x0: tower.x0 + tw * f * rng.range(0.35, 0.65),
        z0: tower.z0 + td * f * rng.range(0.35, 0.65),
        x1: tower.x1 - tw * f * rng.range(0.35, 0.65),
        z1: tower.z1 - td * f * rng.range(0.35, 0.65),
        y1: h
      });
    } else {
      segs.push({ ...tower, y1: h });
    }
    return segs;
  }

  // strategy === 'setback'
  const levels = h > 250 ? 3 : h > 170 ? rng.int(2, 3) : rng.int(1, 2);
  const fractions = [];
  let acc = rng.range(0.4, 0.56);
  fractions.push(acc);
  for (let i = 1; i < levels; i++) {
    const f = (1 - acc) * rng.range(0.42, 0.62);
    fractions.push(f);
    acc += f;
  }
  fractions.push(Math.max(0.06, 1 - acc));

  let cur = { x0: rect.x0, z0: rect.z0, x1: rect.x1, z1: rect.z1 };
  let cum = 0;
  let prevTop = 0;
  for (let i = 0; i < fractions.length; i++) {
    cum += fractions[i];
    let top = i === fractions.length - 1 ? h : snapFloors(h * cum);
    if (top < prevTop + FLOOR_H * 2) top = prevTop + FLOOR_H * 2;
    if (top > h) top = h;
    segs.push({ x0: cur.x0, z0: cur.z0, x1: cur.x1, z1: cur.z1, y1: top });
    prevTop = top;
    if (top >= h) break;
    // 下一级：平面收进 8~18%（两侧分摊比例随机，形成不完全对称的退台）
    const f = rng.range(0.08, 0.18);
    const cw = cur.x1 - cur.x0;
    const cd = cur.z1 - cur.z0;
    const sx = rng.range(0.3, 0.7);
    const sz = rng.range(0.3, 0.7);
    cur = {
      x0: cur.x0 + cw * f * sx,
      x1: cur.x1 - cw * f * (1 - sx),
      z0: cur.z0 + cd * f * sz,
      z1: cur.z1 - cd * f * (1 - sz)
    };
    if (cur.x1 - cur.x0 < 7 || cur.z1 - cur.z0 < 7) break;
  }
  // 顶段若因收进过多提前结束，补齐到总高
  const last = segs[segs.length - 1];
  if (last.y1 < h) last.y1 = h;
  return segs;
}

/**
 * 女儿墙（parapet）：沿屋面四边贴壁砌一圈矮墙，是曼哈顿平屋顶最显著的轮廓线。
 * @param {MeshBuilder} tb 线脚 builder
 * @param {{x0:number, z0:number, x1:number, z1:number, y1:number}} seg 段
 * @param {number} ph 高度（米）
 * @param {number} pt 厚度（米）
 * @param {UvSpec} uv UV 规格
 * @param {number[]} tint 色调
 * @returns {void}
 */
function emitParapet(tb, seg, ph, pt, uv, tint) {
  const y0 = seg.y1;
  const y1 = seg.y1 + ph;
  const t = Math.min(pt, (seg.x1 - seg.x0) * 0.25, (seg.z1 - seg.z0) * 0.25);
  emitBox(tb, seg.x0, y0, seg.z0, seg.x1, y1, seg.z0 + t, FACE_SIDES_TOP, uv, tint);
  emitBox(tb, seg.x0, y0, seg.z1 - t, seg.x1, y1, seg.z1, FACE_SIDES_TOP, uv, tint);
  emitBox(tb, seg.x0, y0, seg.z0 + t, seg.x0 + t, y1, seg.z1 - t, FACE_SIDES_TOP, uv, tint);
  emitBox(tb, seg.x1 - t, y0, seg.z0 + t, seg.x1, y1, seg.z1 - t, FACE_SIDES_TOP, uv, tint);
}

/**
 * 双坡屋顶（山墙沿短边），用于低层老砖楼。
 * @param {MeshBuilder} rb 屋面 builder
 * @param {MeshBuilder} fb 立面 builder（山墙面）
 * @param {{x0:number, z0:number, x1:number, z1:number, y1:number}} seg 段
 * @param {number} rise 屋脊高出檐口的高度（米）
 * @param {UvSpec} uvF 立面 UV
 * @param {number[]} tint 立面色调
 * @param {number[]} roofTint 屋面色调
 * @returns {void}
 */
function emitGableRoof(rb, fb, seg, rise, uvF, tint, roofTint) {
  const { x0, x1, z0, z1, y1 } = seg;
  const ry = y1 + rise;
  const alongX = x1 - x0 >= z1 - z0;
  if (alongX) {
    const zm = (z0 + z1) * 0.5;
    // 南坡
    setQ(0, x0, y1, z1, x0 / ROOF_TILE, z1 / ROOF_TILE);
    setQ(1, x1, y1, z1, x1 / ROOF_TILE, z1 / ROOF_TILE);
    setQ(2, x1, ry, zm, x1 / ROOF_TILE, zm / ROOF_TILE);
    setQ(3, x0, ry, zm, x0 / ROOF_TILE, zm / ROOF_TILE);
    const hd = (z1 - z0) * 0.5;
    const ln = Math.hypot(hd, rise) || 1;
    emitQuad(rb, 0, hd / ln, rise / ln, roofTint);
    // 北坡
    setQ(0, x1, y1, z0, x1 / ROOF_TILE, z0 / ROOF_TILE);
    setQ(1, x0, y1, z0, x0 / ROOF_TILE, z0 / ROOF_TILE);
    setQ(2, x0, ry, zm, x0 / ROOF_TILE, zm / ROOF_TILE);
    setQ(3, x1, ry, zm, x1 / ROOF_TILE, zm / ROOF_TILE);
    emitQuad(rb, 0, hd / ln, -rise / ln, roofTint);
    // 东西山墙
    const uv = uvF;
    emitTri(
      fb,
      [x1, y1, z1, -z1 / uv.tileW + uv.uOff, y1 / uv.tileH + uv.vOff],
      [x1, y1, z0, -z0 / uv.tileW + uv.uOff, y1 / uv.tileH + uv.vOff],
      [x1, ry, zm, -zm / uv.tileW + uv.uOff, ry / uv.tileH + uv.vOff],
      1, 0, 0, tint
    );
    emitTri(
      fb,
      [x0, y1, z0, z0 / uv.tileW + uv.uOff, y1 / uv.tileH + uv.vOff],
      [x0, y1, z1, z1 / uv.tileW + uv.uOff, y1 / uv.tileH + uv.vOff],
      [x0, ry, zm, zm / uv.tileW + uv.uOff, ry / uv.tileH + uv.vOff],
      -1, 0, 0, tint
    );
  } else {
    const xm = (x0 + x1) * 0.5;
    const hd = (x1 - x0) * 0.5;
    const ln = Math.hypot(hd, rise) || 1;
    // 东坡（顶点序须为从外侧看逆时针）
    setQ(0, x1, y1, z0, x1 / ROOF_TILE, z0 / ROOF_TILE);
    setQ(1, xm, ry, z0, xm / ROOF_TILE, z0 / ROOF_TILE);
    setQ(2, xm, ry, z1, xm / ROOF_TILE, z1 / ROOF_TILE);
    setQ(3, x1, y1, z1, x1 / ROOF_TILE, z1 / ROOF_TILE);
    emitQuad(rb, hd / ln, rise / ln, 0, roofTint);
    // 西坡
    setQ(0, x0, y1, z1, x0 / ROOF_TILE, z1 / ROOF_TILE);
    setQ(1, xm, ry, z1, xm / ROOF_TILE, z1 / ROOF_TILE);
    setQ(2, xm, ry, z0, xm / ROOF_TILE, z0 / ROOF_TILE);
    setQ(3, x0, y1, z0, x0 / ROOF_TILE, z0 / ROOF_TILE);
    emitQuad(rb, -hd / ln, rise / ln, 0, roofTint);
    const uv = uvF;
    emitTri(
      fb,
      [x0, y1, z1, x0 / uv.tileW + uv.uOff, y1 / uv.tileH + uv.vOff],
      [x1, y1, z1, x1 / uv.tileW + uv.uOff, y1 / uv.tileH + uv.vOff],
      [xm, ry, z1, xm / uv.tileW + uv.uOff, ry / uv.tileH + uv.vOff],
      0, 0, 1, tint
    );
    emitTri(
      fb,
      [x1, y1, z0, -x1 / uv.tileW + uv.uOff, y1 / uv.tileH + uv.vOff],
      [x0, y1, z0, -x0 / uv.tileW + uv.uOff, y1 / uv.tileH + uv.vOff],
      [xm, ry, z0, -xm / uv.tileW + uv.uOff, ry / uv.tileH + uv.vOff],
      0, 0, -1, tint
    );
  }
}

/* ========================================================================== *
 * 七、异形地块：Shape + ExtrudeGeometry 沿多边形挤出
 * ========================================================================== */

/**
 * 生成 `ExtrudeGeometry` 的自定义 UV 生成器。
 *
 * - **侧墙**：`u` = 顶点沿该面水平方向到面起点的弧长 ÷ TILE_W（每面从整窗开始，
 *   转角处正好落在窗间墙上）；`v` = 世界高度 ÷ TILE_H。与盒体楼完全同一套模数，
 *   因此三角楼与旁边的方楼窗格大小、楼层线严丝合缝。
 * - **顶盖**：直接用平面坐标 ÷ 屋面贴图模数。
 * @param {number} baseY 该级挤出的底标高（米）
 * @param {UvSpec} uv 立面 UV 规格
 * @param {number} capTile 顶盖贴图模数（米）
 * @returns {{generateTopUV: Function, generateSideWallUV: Function}} UVGenerator
 */
function makeExtrudeUvGenerator(baseY, uv, capTile) {
  return {
    /**
     * 顶/底盖 UV。
     * @param {THREE.BufferGeometry} geometry 目标几何
     * @param {number[]} vertices 顶点平坦数组
     * @param {number} iA 顶点 A 序号
     * @param {number} iB 顶点 B 序号
     * @param {number} iC 顶点 C 序号
     * @returns {THREE.Vector2[]} 3 个 UV
     */
    generateTopUV(geometry, vertices, iA, iB, iC) {
      const out = [];
      const ids = [iA, iB, iC];
      for (let k = 0; k < 3; k++) {
        const i = ids[k];
        out.push(new THREE.Vector2(vertices[i * 3] / capTile, vertices[i * 3 + 1] / capTile));
      }
      return out;
    },
    /**
     * 侧墙 UV。
     * @param {THREE.BufferGeometry} geometry 目标几何
     * @param {number[]} vertices 顶点平坦数组
     * @param {number} iA 顶点 A 序号
     * @param {number} iB 顶点 B 序号
     * @param {number} iC 顶点 C 序号
     * @param {number} iD 顶点 D 序号
     * @returns {THREE.Vector2[]} 4 个 UV
     */
    generateSideWallUV(geometry, vertices, iA, iB, iC, iD) {
      const ax = vertices[iA * 3];
      const ay = vertices[iA * 3 + 1];
      const ids = [iA, iB, iC, iD];
      const out = [];
      for (let k = 0; k < 4; k++) {
        const i = ids[k];
        const s = Math.hypot(vertices[i * 3] - ax, vertices[i * 3 + 1] - ay);
        out.push(new THREE.Vector2(
          s / uv.tileW + uv.uOff,
          (baseY + vertices[i * 3 + 2]) / uv.tileH + uv.vOff
        ));
      }
      return out;
    }
  };
}

/**
 * 沿多边形挤出一段楼体，并把侧墙 / 顶盖分别并入两个 builder。
 *
 * 建模路径：地块多边形 `[x,z]` → `THREE.Shape`（平面取 `(x, −z)`，使 CCW 与
 * 挤出方向构成右手系）→ `ExtrudeGeometry(depth=段高)` → 绕 X 轴 −90° 立起来
 * → 平移到段底标高。`ExtrudeGeometry` 自带两个 group（0=顶底盖，1=侧墙），
 * 据此拆分材质，并丢弃埋在地下的底盖三角形。
 * @param {Array<[number, number]>} polygon 地块多边形
 * @param {number} baseY 段底标高
 * @param {number} topY 段顶标高
 * @param {UvSpec} uv 立面 UV 规格
 * @param {MeshBuilder} sideB 侧墙 builder
 * @param {MeshBuilder} capB 顶盖 builder
 * @param {number[]} sideTint 侧墙色调
 * @param {number[]} capTint 顶盖色调
 * @param {number} capTile 顶盖贴图模数
 * @returns {void}
 */
function extrudeShell(polygon, baseY, topY, uv, sideB, capB, sideTint, capTint, capTile) {
  const depth = topY - baseY;
  if (!(depth > 0.05) || !polygon || polygon.length < 3) return;
  const pts = new Array(polygon.length);
  for (let i = 0; i < polygon.length; i++) pts[i] = new THREE.Vector2(polygon[i][0], -polygon[i][1]);
  const shape = new THREE.Shape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
    UVGenerator: makeExtrudeUvGenerator(baseY, uv, capTile)
  });
  geo.rotateX(-Math.PI * 0.5);
  geo.translate(0, baseY, 0);
  const groups = geo.groups && geo.groups.length
    ? geo.groups
    : [{ start: 0, count: geo.attributes.position.count, materialIndex: 0 }];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.materialIndex === 1) appendRange(sideB, geo, g.start, g.count, sideTint);
    else appendRange(capB, geo, g.start, g.count, capTint, baseY + 0.05);
  }
  geo.dispose();
}

/* ========================================================================== *
 * 八、屋顶设备布置（InstancedMesh 数据收集）
 * ========================================================================== */

/**
 * 往实例表里追加一条。
 * @param {Array} list 实例表
 * @param {number} x 世界 X
 * @param {number} y 世界 Y（底面标高）
 * @param {number} z 世界 Z
 * @param {number} rotY 绕 Y 旋转（弧度）
 * @param {number} scale 缩放
 * @param {number} r 颜色 R
 * @param {number} g 颜色 G
 * @param {number} b 颜色 B
 * @returns {void}
 */
function addInstance(list, x, y, z, rotY, scale, r, g, b) {
  list.push({ x, y, z, rotY, scale, r, g, b });
}

/**
 * 在一片屋面上撒设备：木桶水塔 / 空调机组 / 电梯机房 / 天线。
 * 是否出现、出现几个全部由 rng 决定，因此同种子完全可复现。
 * @param {Object} specs 各类型实例表
 * @param {{x0:number, z0:number, x1:number, z1:number}} rect 屋面范围
 * @param {number} roofY 屋面标高
 * @param {number} totalH 楼总高（决定是否装天线）
 * @param {import('../core/rng.js').Rng} rng 随机流
 * @param {{density:number}} budget 画质预算
 * @param {boolean} isTop 是否为楼顶（裙楼屋面只放空调）
 * @returns {number} 新增实例数
 */
function scatterRoofDetails(specs, rect, roofY, totalH, rng, budget, isTop) {
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;
  if (w < 6 || d < 6) return 0;
  const margin = 2.0;
  const iw = w - margin * 2;
  const id = d - margin * 2;
  if (iw < 3 || id < 3) return 0;
  const area = w * d;
  let n = 0;

  /**
   * 屋面内的随机点（留出物件自身尺寸）。
   * @param {number} halfW 物件半宽
   * @param {number} halfD 物件半深
   * @returns {{x:number, z:number}} 位置
   */
  const spot = (halfW, halfD) => ({
    x: rect.x0 + margin + halfW + rng.next() * Math.max(0, iw - halfW * 2),
    z: rect.z0 + margin + halfD + rng.next() * Math.max(0, id - halfD * 2)
  });

  // 木桶水塔：中低层楼的标志物（超高层用加压泵，不设屋顶木桶）
  if (isTop && area > 120 && totalH < 215 && iw > 5 && id > 5 && rng.bool(0.34 * budget.density)) {
    const p = spot(2.0, 2.0);
    const wood = rng.range(0.82, 1.12);
    addInstance(specs.waterTower, p.x, roofY, p.z, rng.range(0, Math.PI * 2), rng.range(0.85, 1.2),
      wood, wood * rng.range(0.93, 1.0), wood * rng.range(0.86, 0.96));
    n++;
  }

  // 电梯机房 / 楼梯出屋面
  if (isTop && area > 190 && iw > 7 && id > 6 && rng.bool(0.46 * budget.density)) {
    const p = spot(3.2, 2.8);
    const g = rng.range(0.86, 1.08);
    addInstance(specs.bulkhead, p.x, roofY, p.z, (rng.int(0, 3) * Math.PI) / 2, rng.range(0.8, 1.15),
      g, g, g * rng.range(0.96, 1.02));
    n++;
  }

  // 空调机组：面积越大越多（约半数屋面才有，控制总三角形数）
  const acMax = clamp(Math.floor(area / 900) + (isTop ? 1 : 0), 0, 3);
  const acCount = acMax > 0 && rng.bool(0.5 * budget.density) ? rng.int(1, acMax) : 0;
  for (let i = 0; i < acCount; i++) {
    const p = spot(1.7, 1.4);
    const g = rng.range(0.78, 1.06);
    addInstance(specs.acUnit, p.x, roofY, p.z, (rng.int(0, 3) * Math.PI) / 2, rng.range(0.8, 1.25),
      g, g * rng.range(0.98, 1.03), g * rng.range(0.98, 1.05));
    n++;
  }

  // 天线桅杆：高楼与个别中层楼
  if (isTop && totalH > 78 && iw > 4 && id > 4 && rng.bool((totalH > 170 ? 0.42 : 0.2) * budget.density)) {
    const p = spot(1.4, 1.4);
    const g = rng.range(0.85, 1.05);
    addInstance(specs.antenna, p.x, roofY, p.z, rng.range(0, Math.PI * 2),
      rng.range(0.7, totalH > 200 ? 1.5 : 1.05), g, g, g);
    n++;
  }
  return n;
}

/* ========================================================================== *
 * 九、单栋楼的完整生成
 * ========================================================================== */

/**
 * 生成一栋楼的全部几何与屋顶设备。
 * @param {Object} w 世界上下文（builders / specs / budget / tall）
 * @param {Object} lot 地块（契约 §4.1 的 Lot）
 * @param {number} height 目标高度（米，已对齐层高）
 * @param {string} style 立面风格
 * @param {boolean} boxy 是否可用轴对齐盒体（矩形地块）
 * @param {import('../core/rng.js').Rng} rng 该地块的随机流
 * @returns {number} 结构顶端高度（米）
 */
function buildOneBuilding(w, lot, height, style, boxy, rng) {
  const cfg = STYLE_CONFIG[style];
  const styleIdx = STYLES.indexOf(style);
  // 夜间亮灯档：weighted 的回调收到的是"元素"本身（这里元素即档位下标）
  const bucket = rng.weighted([0, 1, 2], (item) => LIT_WEIGHTS[item]);
  const fb = w.facade[styleIdx][bucket];
  const trimKey = cfg.trim;
  const tb = w.trim[trimKey];
  const rb = w.roof;

  // 整窗 / 整层的 UV 偏移：换一批点亮的窗户，但不破坏 2.6m × 3.5m 网格
  const uvF = {
    tileW: TILE_W,
    tileH: TILE_H,
    uOff: rng.int(0, TILE_COLS - 1) / TILE_COLS,
    vOff: rng.int(0, TILE_ROWS - 1) / TILE_ROWS
  };
  const uvT = { tileW: TRIM_TILE[trimKey], tileH: TRIM_TILE_V[trimKey], uOff: 0, vOff: 0 };

  const shade = rng.range(0.86, 1.0);
  const tint = [
    cfg.tint[0] * shade * rng.range(0.97, 1.0),
    cfg.tint[1] * shade * rng.range(0.96, 1.0),
    cfg.tint[2] * shade * rng.range(0.95, 1.0)
  ];
  const trimTint = [shade * 0.99, shade * 0.98, shade * 0.95];
  const roofTint = [rng.range(0.72, 0.92), rng.range(0.72, 0.9), rng.range(0.7, 0.88)];

  let topY = height;

  if (!boxy) {
    /* ---- 异形地块：沿多边形挤出（契约 §5.2 明令不得用盒子凑） ---- */
    const poly = insetPolygon(lot.polygon, BODY_INSET);
    const centroid = polyCentroid(poly);
    const levels = height > 120 ? rng.int(1, 3) : 0;
    let baseY = -BURY;
    let cur = poly;
    let cum = 0;
    for (let i = 0; i <= levels; i++) {
      let segTop;
      if (i === levels) {
        segTop = height;
      } else {
        cum += (1 - cum) * rng.range(0.42, 0.6);
        segTop = Math.max(snapFloors(height * cum), baseY + FLOOR_H * 2);
      }
      extrudeShell(cur, baseY, segTop, uvF, fb, rb, tint, roofTint, ROOF_TILE);
      baseY = segTop;
      if (i < levels) {
        // 每级收进 8~18%（形心缩放）
        cur = scalePolygon(cur, 1 - rng.range(0.08, 0.18), centroid);
      }
    }
    // 顶部檐口：外扩 3% 的一圈薄挤出，做出线脚出挑
    const cornice = scalePolygon(cur, 1.04, centroid);
    extrudeShell(cornice, height - 1.1, height + 0.5, uvT, tb, tb, trimTint, trimTint, uvT.tileW);
    topY = height + 0.5;

    // 屋顶设备：在形心附近的小范围内布置
    const r = Math.sqrt(Math.max(lot.area, 1)) * 0.28;
    w.instances += scatterRoofDetails(
      w.specs,
      { x0: centroid.x - r, z0: centroid.z - r, x1: centroid.x + r, z1: centroid.z + r },
      height, height, rng, w.budget, true
    );
    return topY;
  }

  /* ---- 矩形地块：盒体体块 ---- */
  const bb = polyBounds(lot.polygon);
  const bodyRect = {
    x0: bb.minX + BODY_INSET,
    z0: bb.minZ + BODY_INSET,
    x1: bb.maxX - BODY_INSET,
    z1: bb.maxZ - BODY_INSET
  };
  if (bodyRect.x1 - bodyRect.x0 < 5 || bodyRect.z1 - bodyRect.z0 < 5) return 0;

  const strategy = pickStrategy(height, style, rng);
  const segs = planSegments(bodyRect, height, strategy, rng);

  // 勒脚 / 底商基座：贴红线、用石材或砖线脚，顶面形成一圈可见的挑檐
  const baseFloors = strategy === 'prewar' ? 2 : 1;
  const baseTop = Math.min(FLOOR_H * baseFloors, Math.max(FLOOR_H, height - FLOOR_H));
  emitBox(
    tb,
    bb.minX + BASE_INSET, -BURY, bb.minZ + BASE_INSET,
    bb.maxX - BASE_INSET, baseTop, bb.maxZ - BASE_INSET,
    FACE_SIDES_TOP, uvT, trimTint
  );

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const y0 = i === 0 ? -BURY : segs[i - 1].y1;
    const isTop = i === segs.length - 1;
    emitBox(fb, seg.x0, y0, seg.z0, seg.x1, seg.y1, seg.z1, FACE_SIDES, uvF, tint);

    if (strategy === 'gable' && isTop) {
      // 坡顶老砖楼：双坡屋面 + 山墙 + 烟囱
      const rise = rng.range(2.6, 4.4);
      emitGableRoof(rb, fb, seg, rise, uvF, tint, roofTint);
      const cx = lerp(seg.x0, seg.x1, rng.range(0.2, 0.8));
      const cz = lerp(seg.z0, seg.z1, rng.range(0.2, 0.8));
      emitBox(tb, cx - 0.55, seg.y1, cz - 0.55, cx + 0.55, seg.y1 + rise + 1.4, cz + 0.55,
        FACE_SIDES_TOP, uvT, trimTint);
      topY = seg.y1 + rise + 1.4;
      continue;
    }

    emitRoof(rb, seg.x0, seg.z0, seg.x1, seg.z1, seg.y1, roofTint);

    if (isTop && (strategy === 'prewar' || style === 'deco')) {
      // 出挑檐口（cornice）：战前楼与装饰艺术楼的标志性顶部线脚
      const o = 0.55;
      emitBox(tb, seg.x0 - o, seg.y1 - 1.5, seg.z0 - o, seg.x1 + o, seg.y1, seg.z1 + o,
        FACE_SIDES_TOP | FACE_NY, uvT, trimTint);
    }

    // 女儿墙：楼顶必有，退台平台按概率
    if (isTop || rng.bool(0.55)) {
      const ph = isTop ? rng.range(1.0, 1.7) : rng.range(0.8, 1.2);
      emitParapet(tb, seg, ph, 0.4, uvT, trimTint);
      if (isTop) topY = seg.y1 + ph;
    }

    // 设备层屋面：裙楼顶只放空调，主楼顶放全套
    w.instances += scatterRoofDetails(w.specs, seg, seg.y1, height, rng, w.budget, isTop);
  }

  // 超高层的机械冠顶：两级收分的无窗机房，勾出天际线的尖峭轮廓
  if (height > 225 && strategy !== 'gable') {
    const top = segs[segs.length - 1];
    const cx = (top.x0 + top.x1) * 0.5;
    const cz = (top.z0 + top.z1) * 0.5;
    const hw = (top.x1 - top.x0) * 0.5;
    const hd = (top.z1 - top.z0) * 0.5;
    let y = topY;
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? rng.range(0.55, 0.68) : rng.range(0.3, 0.42);
      const ch = snapFloors(rng.range(6, 11), 2);
      emitBox(w.trim.concrete, cx - hw * s, y, cz - hd * s, cx + hw * s, y + ch, cz + hd * s,
        FACE_SIDES_TOP, { tileW: TRIM_TILE.concrete, tileH: TRIM_TILE_V.concrete, uOff: 0, vOff: 0 },
        trimTint);
      y += ch;
    }
    topY = y;
  }

  return topY;
}

/* ========================================================================== *
 * 十、对外接口
 * ========================================================================== */

/**
 * 地块是否落在地标禁建区内（`ctx0.excludeZones`，由 main.js 从
 * `landmarks.js` 的 `LANDMARK_LOTS_HINT` 传入；缺省视为空数组）。
 * 中心点或任一顶点落入圆内即跳过，避免普通楼群戳进地标体量。
 * @param {Array<{x:number, z:number, radius:number}>} zones 禁建区
 * @param {Object} lot 地块
 * @returns {boolean} 是否需要跳过
 */
function inExcludeZone(zones, lot) {
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z || !(z.radius > 0)) continue;
    const r2 = z.radius * z.radius;
    const dx = lot.centerX - z.x;
    const dz = lot.centerZ - z.z;
    if (dx * dx + dz * dz < r2) return true;
    const poly = lot.polygon;
    for (let k = 0; k < poly.length; k++) {
      const ex = poly[k][0] - z.x;
      const ez = poly[k][1] - z.z;
      if (ex * ex + ez * ez < r2) return true;
    }
  }
  return false;
}

/**
 * 建造全城普通楼群（契约 §5.2）。
 *
 * @param {Object} ctx0 构建期上下文 `{ plan, heightField, rng, textures, env, quality, seed,
 *                                     tallStructures, excludeZones }`
 * @returns {Object} SystemHandle `{ object3D, update, dispose, stats }`
 */
export function createBuildings(ctx0) {
  const t0 = nowMs();
  const cfg = ctx0 || {};
  const plan = cfg.plan;
  const heightField = cfg.heightField;
  const textures = cfg.textures || {};
  const env = cfg.env || null;
  const quality = cfg.quality === 'low' || cfg.quality === 'medium' ? cfg.quality : 'high';
  const excludeZones = Array.isArray(cfg.excludeZones) ? cfg.excludeZones : [];
  const rootRng = cfg.rng && typeof cfg.rng.fork === 'function'
    ? cfg.rng.fork('buildings')
    : makeRng(cfg.seed === undefined ? 'manhattan' : cfg.seed, 'buildings');

  const root = new THREE.Group();
  root.name = 'buildings';

  /** @type {THREE.Texture[]} */
  const texClones = [];
  /** @type {THREE.BufferGeometry[]} */
  const geometries = [];
  /** @type {THREE.InstancedMesh[]} */
  const instancedMeshes = [];
  const materials = createMaterials(textures, env, texClones);
  const facadeMaterials = [];
  for (let s = 0; s < materials.facade.length; s++) {
    for (let k = 0; k < materials.facade[s].length; k++) facadeMaterials.push(materials.facade[s][k]);
  }

  let buildings = 0;
  let instances = 0;
  let meshCount = 0;
  let triangles = 0;

  if (plan && heightField && Array.isArray(plan.blocks)) {
    // ---- builders：(风格 × 亮灯档) 立面 12 组 + 线脚 3 组 + 屋面 1 组 ----
    const facadeB = [];
    for (let s = 0; s < STYLES.length; s++) {
      facadeB[s] = [];
      for (let k = 0; k < LIT_BUCKETS.length; k++) facadeB[s][k] = createBuilder();
    }
    /** @type {Object<string, MeshBuilder>} */
    const trimB = {};
    for (const key of TRIMS) trimB[key] = createBuilder();
    const roofB = createBuilder();

    /** @type {Object<string, Array>} */
    const specs = {};
    for (const type of DETAIL_TYPES) specs[type] = [];

    const world = {
      facade: facadeB,
      trim: trimB,
      roof: roofB,
      specs,
      budget: { density: quality === 'low' ? 0.5 : quality === 'medium' ? 0.8 : 1 },
      instances: 0
    };

    /** @type {Array<{x:number, y:number, z:number, name:string}>} */
    const tops = [];

    for (let bi = 0; bi < plan.blocks.length; bi++) {
      const block = plan.blocks[bi];
      if (!block || block.isPark || !Array.isArray(block.lots)) continue;
      for (let li = 0; li < block.lots.length; li++) {
        const lot = block.lots[li];
        if (!lot || !Array.isArray(lot.polygon) || lot.polygon.length < 3) continue;
        if (lot.area < 130) continue;
        if (excludeZones.length && inExcludeZone(excludeZones, lot)) continue;
        if (typeof plan.isInPark === 'function' && plan.isInPark(lot.centerX, lot.centerZ)) continue;
        if (typeof plan.isWater === 'function' && plan.isWater(lot.centerX, lot.centerZ)) continue;

        let h = heightField.heightAt(lot.centerX, lot.centerZ);
        if (!(h > 0)) continue;

        const rng = rootRng.fork(lot.id || `${bi}_${li}`);

        // 密度低的地段留出空地（停车场 / 空置地块），让街区不至于铁板一块
        const dens = typeof heightField.densityAt === 'function'
          ? heightField.densityAt(lot.centerX, lot.centerZ)
          : 1;
        if (dens < 0.58 && rng.bool(0.07)) continue;

        // 逐栋高度抖动 + 按用地面积限高（小地块撑不起超高层）
        h *= rng.range(0.9, 1.12);
        h = clamp(h, 10, Math.min(330, 18 + Math.sqrt(lot.area) * 5.6));
        h = snapFloors(h, 2);

        let style = heightField.styleAt ? heightField.styleAt(lot.centerX, lot.centerZ) : 'limestone';
        if (STYLES.indexOf(style) < 0) style = 'limestone';

        const bounds = polyBounds(lot.polygon);
        const bboxArea = (bounds.maxX - bounds.minX) * (bounds.maxZ - bounds.minZ);
        const boxy = lot.shape === 'rect' || polyArea(lot.polygon) >= bboxArea * 0.985;

        const topY = buildOneBuilding(world, lot, h, style, boxy, rng);
        if (topY > 0) {
          buildings++;
          tops.push({ x: lot.centerX, y: topY, z: lot.centerZ, name: `楼群#${lot.id}` });
        }
      }
    }
    instances = world.instances;

    // ---- 固化成 mesh ----
    /**
     * 把 builder 固化并挂进场景。
     * @param {MeshBuilder} b builder
     * @param {THREE.Material} mat 材质
     * @param {string} name mesh 名
     * @returns {void}
     */
    const addMesh = (b, mat, name) => {
      const geo = finalizeGeometry(b);
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      root.add(mesh);
      geometries.push(geo);
      meshCount++;
      triangles += geo.index.count / 3;
    };

    for (let s = 0; s < STYLES.length; s++) {
      for (let k = 0; k < LIT_BUCKETS.length; k++) {
        addMesh(facadeB[s][k], materials.facade[s][k], `facade-${STYLES[s]}-${k}`);
      }
    }
    for (const key of TRIMS) addMesh(trimB[key], materials.trim[key], `trim-${key}`);
    addMesh(roofB, materials.roof, 'roofs');

    // ---- 屋顶设备：每类一个 InstancedMesh ----
    const m4 = new THREE.Matrix4();
    const quat = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    const yAxis = new THREE.Vector3(0, 1, 0);
    for (const type of DETAIL_TYPES) {
      const list = specs[type];
      if (!list.length) continue;
      const geo = DETAIL_FACTORY[type]();
      const im = new THREE.InstancedMesh(geo, materials.detail, list.length);
      im.name = `roof-${type}`;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        quat.setFromAxisAngle(yAxis, e.rotY);
        pos.set(e.x, e.y, e.z);
        scl.setScalar(e.scale);
        m4.compose(pos, quat, scl);
        im.setMatrixAt(i, m4);
        col.setRGB(e.r, e.g, e.b);
        im.setColorAt(i, col);
      }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.matrixAutoUpdate = false;
      im.updateMatrix();
      root.add(im);
      geometries.push(geo);
      instancedMeshes.push(im);
      meshCount++;
      triangles += (geo.index.count / 3) * list.length;
    }

    // ---- 最高的 12 栋登记进 tallStructures（供闪电模块加权取点）----
    if (Array.isArray(cfg.tallStructures)) {
      tops.sort((a, b) => b.y - a.y);
      const n = Math.min(12, tops.length);
      for (let i = 0; i < n; i++) cfg.tallStructures.push(tops[i]);
    }
  }

  const buildMs = +(nowMs() - t0).toFixed(1);
  let lastLit = -1;

  return {
    object3D: root,

    /**
     * 每帧只做一件事：按夜色强度调整窗灯自发光（uniform 写入，无分配、无遍历几何）。
     * 阴天会让室内灯提前点亮（cloudDarkness 抬升亮灯系数）。
     * @param {Object} ctx FrameContext（契约 §2）
     * @returns {void}
     */
    update(ctx) {
      const night = ctx && Number.isFinite(ctx.nightFactor) ? clamp(ctx.nightFactor, 0, 1) : 0;
      const params = ctx && ctx.weather ? ctx.weather.params : null;
      const gloom = params && Number.isFinite(params.cloudDarkness)
        ? clamp(params.cloudDarkness, 0, 1)
        : 0;
      // 天黑得越快灯亮得越快：night^0.75 让黄昏时就有零星灯火
      const lit = clamp(Math.pow(night, 0.75) + gloom * 0.2, 0, 1);
      if (Math.abs(lit - lastLit) < 0.002) return;
      lastLit = lit;
      for (let i = 0; i < facadeMaterials.length; i++) {
        const m = facadeMaterials[i];
        m.emissiveIntensity = m.userData.litBase * lit;
      }
    },

    /**
     * 释放本模块自建的全部 GPU 资源。
     * 共享贴图（`ctx.textures`）由 core/textures.js 统一释放，这里只释放自己的克隆体。
     * @returns {void}
     */
    dispose() {
      for (let i = 0; i < instancedMeshes.length; i++) {
        const im = instancedMeshes[i];
        if (typeof im.dispose === 'function') im.dispose();
      }
      instancedMeshes.length = 0;
      for (let i = 0; i < geometries.length; i++) geometries[i].dispose();
      geometries.length = 0;
      for (let i = 0; i < materials.all.length; i++) materials.all[i].dispose();
      materials.all.length = 0;
      for (let i = 0; i < texClones.length; i++) texClones[i].dispose();
      texClones.length = 0;
      root.clear();
    },

    stats: { instances, buildings, draws: meshCount, triangles, buildMs }
  };
}
