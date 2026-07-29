/**
 * @file src/city/landmarks.js
 * @description 四座可辨认地标的纯代码建模（契约 §5.3）：帝国大厦、克莱斯勒大厦、
 *              世贸中心一号楼、熨斗大厦。不走 `heightField`，位置与体量硬编码。
 *
 * ---------------------------------------------------------------------------
 * 一、渲染预算策略（契约 §5.3 / §9）
 * ---------------------------------------------------------------------------
 * 四座楼合计只产生 **8 个 drawcall**：按材质把所有几何合并成 6 个 `Mesh`
 * （石材 / 窗墙 / 玻璃幕墙 / 不锈钢 / 塔冠泛光 / 夜间辉光），外加 2 个
 * `InstancedMesh`（竖向壁柱、航空障碍灯）。三角形总量约 4.5 万，远低于 40 万上限。
 *
 * 合并的关键是"同一材质的几何必须属性一致"：`pushGeom()` 统一把几何转成非索引、
 * 烘焙盒式 UV、写入顶点色，并删除多余属性，`mergeGeometries()` 才不会报错。
 * 颜色差异（石灰岩 / 白釉砖 / 陶土 / 不锈钢 / 冷玻璃）全部走**顶点色**，
 * 因此一个材质可以服务不同外观的楼体，不必为配色多开 drawcall。
 *
 * ---------------------------------------------------------------------------
 * 二、UV 烘焙（为什么不用 texture.repeat）
 * ---------------------------------------------------------------------------
 * `ctx0.textures` 里的贴图是**全场景共享**的，任何模块改它的 `repeat` 都会污染别人。
 * 因此本模块把贴图库的纹理 `clone()` 一份自用（clone 共享 canvas source，不额外占
 * 显存，`dispose()` 只减引用计数），并保持 `repeat = (1,1)`；平铺尺度改为
 * **在几何上烘焙 UV**：`applyBoxUV()` 按顶点法线的主轴做盒式投影，用**世界坐标**
 * 除以 tile 尺寸。因为几何在合并前已经平移到世界位置，所有楼体的窗格大小天然一致
 * （窗 2.6m × 层高 3.5m → 窗墙贴图 8×8 格，tile = 20.8m × 28m）。
 *
 * ---------------------------------------------------------------------------
 * 三、四座地标的造型算法
 * ---------------------------------------------------------------------------
 * 1) **帝国大厦** (-60, -430)：五段式退台（裙楼 → 收进段 → 中央塔身 → 装饰艺术冠顶
 *    → 圆形观景层 → 系留桅杆/天线）。标志性的竖向石灰岩壁柱用 `InstancedMesh`
 *    表现：每层塔身沿四个立面按 3.6m 间距布置细长石柱，凸出窗墙 1.5m，窗墙则内缩，
 *    形成"石条—玻璃条"交替的垂直线条。冠顶为四级阶梯收分 + 24 片放射状装饰鳍，
 *    夜间由 `crownMat`（彩色泛光带）与一盏 `PointLight` 打亮，颜色随天气/时间变化。
 *    结构高 381m，天线顶 443m。
 *
 * 2) **克莱斯勒大厦** (250, -540)：五级收分塔身 + **7 层放射状拱形冠顶**。
 *    每一层冠顶是一个"方形平面 + 圆弧剖面"的穹壳，参数方程（见 `buildSquareDome`）：
 *        halfWidth(τ) = w · cos τ ,  y(τ) = yBase + rise · sin τ ,  τ ∈ [0, π/2]
 *    即沿高度按圆弧收进的方棱穹顶——这正是克莱斯勒冠顶每一级"半圆拱"的真实形状。
 *    7 级穹壳的 w 线性递减、yBase 线性递增，于是层层嵌套、逐级升高。
 *    每级拱面上按弧长参数排布三排**三角形窗**（`ExtrudeGeometry` 模板 + 矩阵变换
 *    克隆），并沿四角与四面中线各拉一条弧形肋（`TubeGeometry`），构成放射状纹样。
 *    冠顶与尖针为不锈钢材质（metalness 0.96 / roughness 0.13）。四角设简化鹰形装饰。
 *    结构高 282m，尖顶 319m。
 *
 * 3) **世贸中心一号楼** (60, 1830)：底部 61m 正方形 → 中部八角形 → 顶部旋转 45°
 *    的正方形，用**逐层放样**实现（`buildTwistLoft`）。截面多边形按高度参数 t 插值：
 *        角点 k（θ = k·45°，k 为奇数，即基座方形的 4 个角）半径 = lerp(a√2, b, t)
 *        角点 k（k 为偶数，即基座方形 4 条边的中点）半径 = lerp(a, b√2, t)
 *    t=0 时是半宽 a 的正方形；t=1 时退化为半宽 b、旋转 45° 的正方形；中间是四角
 *    被切、切角随高度渐变的八角形（t≈0.5 为近正八边形）。66 圈截面用自建
 *    `BufferGeometry` 缝合三角形；每个立面的两端点各自复制一份顶点，使法线在面内
 *    平滑、在棱角处锐利。全玻璃幕墙（metalness 0.88 / roughness 0.06）。
 *    结构高 417m，桅杆顶 541m。
 *
 * 4) **熨斗大厦**：从 `ctx0.plan.triangleLots` 中取离 (0, 240) 最近的三角地块，
 *    先对锐角顶点做**圆角处理**（`filletPolygon`，切线长 + 圆弧插值），再沿多边形
 *    `Shape + ExtrudeGeometry` 挤出 22 层 87m；每 4~5 层用**外扩多边形**
 *    （`offsetPolygon`，角平分线斜接偏移）做一道凸出腰线，顶部为重檐口。
 *
 * ---------------------------------------------------------------------------
 * 四、契约差异说明（按 §0 要求就地记录，不改契约）
 * ---------------------------------------------------------------------------
 * - 契约给定帝国大厦中心 (-60, -430)，而 `CITY.streetSpacing = 80` 的横街正好落在
 *   z = -440（路面 -450..-430）。按真实比例（129m × 57m）建的裙楼必然压到这条横街。
 *   本模块**严格保留契约坐标**，仅把裙楼进深压缩到 42m 以减小侵占，不擅自挪位。
 * - 契约提到 `handle.occupiedLots`，同时又要求导出静态常量 `LANDMARK_LOTS_HINT`
 *   （main.js 实际用后者）。两者都提供：`occupiedLots` 在构建期按禁建圆算出实际
 *   命中的 lot id，`LANDMARK_LOTS_HINT` 为静态圆形禁建区。
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { patchCityMaterial } from '../render/shaderpatch.js';
import { clamp, lerp, damp, TWO_PI, DEG2RAD } from '../core/mathx.js';

/* ========================================================================== *
 * 常量
 * ========================================================================== */

/** 帝国大厦：中心坐标与关键标高（米）。 */
const ESB = { x: -60, z: -430, roof: 381, top: 443 };
/** 克莱斯勒大厦：中心坐标与关键标高（米）。 */
const CHR = { x: 250, z: -540, roof: 282, top: 319 };
/** 世贸中心一号楼：中心坐标与关键标高（米）。 */
const WTC = { x: 60, z: 1830, roof: 417, top: 541 };
/**
 * 熨斗大厦：三角地块的择近锚点、高度与目标面宽（米）。
 *
 * `targetWidth` 是"垂直于百老汇方向"的目标进深：`grid.js` 切出的三角地块通常只有
 * 10m 左右宽、48m 左右长（锐角仅 ≈ 11.8°，即百老汇的斜切角），直接挤到 87m 会变成
 * 一片刀锋。按真实熨斗大厦的楔形比例把地块**横向**放宽到 26m（纵向长度保持不变，
 * 不侵占相邻街区），锐角随之变成 ≈ 28°，与实物的 ≈ 25° 基本一致。
 */
const FLAT = { x: 0, z: 240, height: 87, floors: 22, targetWidth: 26 };

/**
 * 供 main.js 排除普通楼群的圆形禁建区（契约 §5.3）。
 * 半径按各地标裙楼外接圆再放宽 10~20m，保证四周留出广场而不被普通楼贴脸。
 * @type {ReadonlyArray<{x:number, z:number, radius:number}>}
 */
export const LANDMARK_LOTS_HINT = Object.freeze([
  Object.freeze({ x: ESB.x, z: ESB.z, radius: 82 }),
  Object.freeze({ x: CHR.x, z: CHR.z, radius: 66 }),
  Object.freeze({ x: WTC.x, z: WTC.z, radius: 74 }),
  // 熨斗大厦的位置由 plan.triangleLots 决定（运行期才知道），而本常量必须静态导出，
  // 因此禁建圆不能放在锚点 (0,240) 上：百老汇中心线在 z=240 处的 x 约为 −150，
  // 三角地块只可能沿这条斜街出现，实测各种子的择中结果都落在 (−100, 350) 附近。
  // 故把圆心放在百老汇沿线的 (−125, 300)，半径放大到 115m 以覆盖前几名候选地块。
  Object.freeze({ x: -125, z: 300, radius: 115 })
]);

/** 石材贴图平铺尺寸（米）。 */
const TILE_STONE = { u: 9.5, v: 9.5 };
/** 窗墙贴图平铺尺寸（米）：8×8 窗格 × (2.6m 窗宽 × 3.5m 层高)。 */
const TILE_WIN = { u: 20.8, v: 28 };
/** 玻璃幕墙贴图平铺尺寸（米）：8×8 板块 × (3.0m × 3.5m)。 */
const TILE_GLASS = { u: 24, v: 28 };

/**
 * 各部位顶点色（sRGB，`THREE.Color` 自动转到线性工作空间）。
 *
 * 注意：顶点色是**与贴图相乘**的调制色，不是最终反照率。贴图本身已经带了
 * 石材/窗格的固有色，所以这里取"接近白的浅色调"，只做冷暖与明度微调；
 * 若直接填石材本色会与贴图叠成两次压暗，立面会发灰发脏。
 * 只有无贴图的部件（不锈钢 / 泛光带 / 辉光件）才用顶点色决定本色。
 */
const COLOR = {
  esbStone: 0xf1e9d7,      // 印第安纳石灰岩（暖白调制）
  esbWindow: 0xb7c0cd,     // 内凹窗带（略冷）
  esbCrown: 0xfbf4e4,      // 冠顶石材（更浅，突出阶梯收分）
  chrBrick: 0xf5f0e4,      // 白釉砖
  chrWindow: 0xacb6c4,
  chrSteel: 0xeef3f7,      // 尼罗钢（不锈钢冠顶，无贴图 → 即本色）
  wtcGlass: 0xdcebf5,      // 冷色玻璃幕墙
  wtcBase: 0xb6c2cd,       // 基座混凝土 / 棱镜玻璃
  wtcSteel: 0xdde5ec,
  flatStone: 0xe9d4b8,     // 陶土 + 石灰岩混合立面（偏暖）
  flatWindow: 0xc0bac6,
  glowOff: 0x2a3240        // 夜间辉光件在白天的本色（深玻璃，无贴图）
};

/** 帝国大厦塔冠泛光的副色：与主色缓慢交替，做出"双色扫光"的观感。 */
const CROWN_ACCENT = 0xff5fa8;

/** 帝国大厦塔冠泛光配色：按天气取主色（契约 §5.3「夜间塔冠彩色泛光」）。 */
const CROWN_COLORS = {
  clear: 0xffd39a,
  cloudy: 0x63a4ff,
  fog: 0x4fd8c6,
  rain: 0x7d6bff,
  storm: 0xff4f68,
  snow: 0xc4e8ff
};

/* ========================================================================== *
 * 几何工具
 * ========================================================================== */

const _color = new THREE.Color();
const _v3a = new THREE.Vector3();
const _v3b = new THREE.Vector3();
const _v3c = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();

/**
 * 盒式 UV 投影：按顶点法线的主轴选择投影平面，用**世界坐标**除以平铺尺寸。
 * 几何必须已经平移到世界位置，这样跨楼体的窗格 / 石纹尺度才完全一致。
 * @param {THREE.BufferGeometry} geom 目标几何（需已有 position 与 normal）
 * @param {number} tileU 横向平铺尺寸（米）
 * @param {number} tileV 纵向平铺尺寸（米）
 * @returns {void}
 */
function applyBoxUV(geom, tileU, tileV) {
  const pos = geom.attributes.position;
  const nor = geom.attributes.normal;
  const n = pos.count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = nor ? Math.abs(nor.getX(i)) : 0;
    const ay = nor ? Math.abs(nor.getY(i)) : 1;
    const az = nor ? Math.abs(nor.getZ(i)) : 0;
    let u;
    let v;
    if (ay >= ax && ay >= az) {
      u = x / tileU;
      v = z / tileV;
    } else if (ax >= az) {
      u = z / tileU;
      v = y / tileV;
    } else {
      u = x / tileU;
      v = y / tileV;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * 给几何写入统一顶点色（合并后靠顶点色区分不同楼体的材质外观）。
 * @param {THREE.BufferGeometry} geom 目标几何
 * @param {number} colorHex sRGB 颜色
 * @returns {void}
 */
function paintGeometry(geom, colorHex) {
  const n = geom.attributes.position.count;
  const arr = new Float32Array(n * 3);
  _color.set(colorHex);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _color.r;
    arr[i * 3 + 1] = _color.g;
    arr[i * 3 + 2] = _color.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/**
 * 把几何登记进某个材质桶：转非索引 → 烘焙/保留 UV → 写顶点色 → 裁掉多余属性。
 * 这三步保证 `mergeGeometries()` 看到的属性集合完全一致（position/normal/uv/color）。
 * @param {Array<THREE.BufferGeometry>} bucket 材质桶
 * @param {THREE.BufferGeometry} geom 待登记几何（会被消费，调用方不要再持有）
 * @param {number} colorHex 顶点色
 * @param {{u:number, v:number}|null} tile 平铺尺寸；传 null 表示保留几何自带 UV
 * @returns {void}
 */
function pushGeom(bucket, geom, colorHex, tile) {
  let g = geom;
  if (g.index) {
    const nonIndexed = g.toNonIndexed();
    g.dispose();
    g = nonIndexed;
  }
  if (tile) applyBoxUV(g, tile.u, tile.v);
  else if (!g.attributes.uv) applyBoxUV(g, TILE_STONE.u, TILE_STONE.v);
  paintGeometry(g, colorHex);
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') {
      g.deleteAttribute(name);
    }
  }
  bucket.push(g);
}

/**
 * 以"底面中心 + 尺寸"建盒体（比 `BoxGeometry` 的中心锚点更贴合建楼语义）。
 * @param {number} cx 中心 X
 * @param {number} yBottom 底面标高
 * @param {number} cz 中心 Z
 * @param {number} sx X 向尺寸
 * @param {number} sy 高度
 * @param {number} sz Z 向尺寸
 * @returns {THREE.BufferGeometry} 已平移到位的盒体
 */
function boxAt(cx, yBottom, cz, sx, sy, sz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(cx, yBottom + sy * 0.5, cz);
  return g;
}

/**
 * 以"底面中心 + 尺寸"建圆柱/圆台。
 * @param {number} cx 中心 X
 * @param {number} yBottom 底面标高
 * @param {number} cz 中心 Z
 * @param {number} rTop 顶半径
 * @param {number} rBottom 底半径
 * @param {number} h 高度
 * @param {number} [seg=24] 径向分段
 * @param {boolean} [open=false] 是否开口（无顶底盖）
 * @returns {THREE.BufferGeometry} 已平移到位的圆柱
 */
function cylAt(cx, yBottom, cz, rTop, rBottom, h, seg = 24, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open);
  g.translate(cx, yBottom + h * 0.5, cz);
  return g;
}

/**
 * 多边形有向面积（XZ 平面，鞋带公式）。正负号用于判定绕向。
 * @param {Array<[number, number]>} poly 多边形顶点
 * @returns {number} 有向面积
 */
function polygonSignedArea(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s * 0.5;
}

/**
 * 多边形等距外扩/内缩（角平分线斜接偏移）。
 *
 * 对每个顶点取相邻两条边的外法线 n₁、n₂，斜接方向 m = normalize(n₁+n₂)，
 * 偏移长度 = d / cos(θ/2)，其中 cos(θ/2) = m·n₁。为避免尖角处偏移量爆炸，
 * 分母下限夹到 0.25（对应内角 ≈ 29°；本模块调用前已先做过圆角，不会触发）。
 * 绕向由有向面积符号自动判定，顺时针 / 逆时针输入都能正确外扩。
 *
 * @param {Array<[number, number]>} poly 多边形（XZ）
 * @param {number} d 偏移距离，正数外扩
 * @returns {Array<[number, number]>} 偏移后的多边形（顶点数不变）
 */
function offsetPolygon(poly, d) {
  const n = poly.length;
  if (n < 3 || Math.abs(d) < 1e-6) return poly.map((p) => [p[0], p[1]]);
  const sign = polygonSignedArea(poly) > 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const cur = poly[i];
    const next = poly[(i + 1) % n];

    let e1x = cur[0] - prev[0];
    let e1z = cur[1] - prev[1];
    let e2x = next[0] - cur[0];
    let e2z = next[1] - cur[1];
    const l1 = Math.hypot(e1x, e1z) || 1;
    const l2 = Math.hypot(e2x, e2z) || 1;
    e1x /= l1; e1z /= l1; e2x /= l2; e2z /= l2;

    // 边的外法线：绕向为正时是 (ez, -ex)，为负时取反
    const n1x = sign * e1z;
    const n1z = -sign * e1x;
    const n2x = sign * e2z;
    const n2z = -sign * e2x;

    let mx = n1x + n2x;
    let mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) {
      out.push([cur[0] + n1x * d, cur[1] + n1z * d]);
      continue;
    }
    mx /= ml; mz /= ml;
    const cosHalf = Math.max(0.25, mx * n1x + mz * n1z);
    out.push([cur[0] + (mx * d) / cosHalf, cur[1] + (mz * d) / cosHalf]);
  }
  return out;
}

/**
 * 把多边形中过于尖锐的顶点替换成圆弧（熨斗大厦锐角端的圆角处理）。
 *
 * 对内角 θ < `maxAngleDeg` 的顶点 V：沿两条边各退 t = r/tan(θ/2) 得切点 A、B，
 * 圆心 C = V + normalize(d₁+d₂)·(r/sin(θ/2))，再在 C 上从 A 到 B 走短弧插值。
 * 切线长会被夹到相邻边长的 42%，避免圆角吃掉整条边。
 *
 * @param {Array<[number, number]>} poly 多边形（XZ）
 * @param {number} radius 目标圆角半径（米）
 * @param {number} maxAngleDeg 内角小于该值才做圆角
 * @param {number} [segments=8] 圆弧分段数
 * @param {Array<{x:number, z:number, r:number}>|null} [outArcs=null] 回填各圆角的圆心与半径
 * @returns {Array<[number, number]>} 处理后的多边形
 */
function filletPolygon(poly, radius, maxAngleDeg, segments = 8, outArcs = null) {
  const n = poly.length;
  if (n < 3) return poly.map((p) => [p[0], p[1]]);
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n];
    const cur = poly[i];
    const next = poly[(i + 1) % n];

    let d1x = prev[0] - cur[0];
    let d1z = prev[1] - cur[1];
    let d2x = next[0] - cur[0];
    let d2z = next[1] - cur[1];
    const l1 = Math.hypot(d1x, d1z);
    const l2 = Math.hypot(d2x, d2z);
    if (l1 < 1e-4 || l2 < 1e-4) {
      out.push([cur[0], cur[1]]);
      continue;
    }
    d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;

    const cosT = clamp(d1x * d2x + d1z * d2z, -1, 1);
    const theta = Math.acos(cosT);
    if (theta >= maxAngleDeg * DEG2RAD || theta < 1e-3) {
      out.push([cur[0], cur[1]]);
      continue;
    }

    const half = theta * 0.5;
    let tLen = radius / Math.tan(half);
    tLen = Math.min(tLen, l1 * 0.42, l2 * 0.42);
    const r = tLen * Math.tan(half);

    const ax = cur[0] + d1x * tLen;
    const az = cur[1] + d1z * tLen;
    const bx = cur[0] + d2x * tLen;
    const bz = cur[1] + d2z * tLen;

    let bxDir = d1x + d2x;
    let bzDir = d1z + d2z;
    const bl = Math.hypot(bxDir, bzDir) || 1;
    bxDir /= bl; bzDir /= bl;
    const dist = r / Math.sin(half);
    const ccx = cur[0] + bxDir * dist;
    const ccz = cur[1] + bzDir * dist;

    let a0 = Math.atan2(az - ccz, ax - ccx);
    const a1 = Math.atan2(bz - ccz, bx - ccx);
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= TWO_PI;
    while (sweep < -Math.PI) sweep += TWO_PI;

    for (let s = 0; s <= segments; s++) {
      const a = a0 + (sweep * s) / segments;
      out.push([ccx + Math.cos(a) * r, ccz + Math.sin(a) * r]);
    }
    if (outArcs) outArcs.push({ x: ccx, z: ccz, r });
  }
  return out;
}

/**
 * 沿 XZ 多边形垂直挤出一段实体（熨斗大厦楼身 / 腰线 / 檐口共用）。
 *
 * `ExtrudeGeometry` 只能在 XY 平面接受轮廓、沿 +Z 挤出，因此：
 * 轮廓点取 (x, −z) → 挤出后绕 X 轴旋转 −90°（(x,y,z) → (x, z, −y)），
 * 于是挤出方向变成 +Y，而 −z 的负号被旋转再次取反，世界 Z 还原为原值。
 *
 * @param {Array<[number, number]>} poly 多边形（XZ，任意绕向）
 * @param {number} yBottom 底面标高
 * @param {number} height 挤出高度
 * @param {number} [curveSegments=6] 轮廓曲线细分（本模块轮廓已离散，取小值即可）
 * @returns {THREE.BufferGeometry} 已就位的实体几何
 */
function extrudePolygon(poly, yBottom, height, curveSegments = 6) {
  const shape = new THREE.Shape();
  shape.moveTo(poly[0][0], -poly[0][1]);
  for (let i = 1; i < poly.length; i++) shape.lineTo(poly[i][0], -poly[i][1]);
  shape.closePath();
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
    curveSegments
  });
  geom.rotateX(-Math.PI / 2);
  geom.translate(0, yBottom, 0);
  return geom;
}

/**
 * 生成"方形平面 + 圆弧剖面"的穹壳——克莱斯勒冠顶每一级半圆拱的真实形状。
 *
 * 参数方程（τ ∈ [0, π/2]，绕竖轴的方形截面）：
 *     halfWidth(τ) = w · cos τ        （平面半宽沿弧线收进）
 *     y(τ)         = yBase + rise · sin τ
 * 即：正视任一立面时轮廓是一段以 (w, rise) 为半轴的四分之一椭圆弧，
 * rise ≈ w 时就是半圆拱；俯视始终是正方形，于是四个立面各得一道拱。
 *
 * 底部额外加一圈竖直裙边（`skirt`）插进下方体量，避免露出壳体开口。
 * 顶点绕向经过推导：三角形取 (低_m, 高_m, 低_{m+1}) 与 (低_{m+1}, 高_m, 高_{m+1})
 * 时外法线朝外（在 +X 面上验证叉积 x 分量为正）。
 *
 * @param {number} cx 中心 X
 * @param {number} cz 中心 Z
 * @param {number} yBase 拱脚标高
 * @param {number} w 拱脚平面半宽（米）
 * @param {number} rise 拱高（米）
 * @param {number} segArc 弧向分段数
 * @param {number} segSide 每条边的分段数
 * @param {number} skirt 底部裙边高度（米）
 * @returns {THREE.BufferGeometry} 索引化的穹壳（法线已按面内平滑计算）
 */
function buildSquareDome(cx, cz, yBase, w, rise, segArc, segSide, skirt) {
  const per = segSide * 4;
  /**
   * 方形周长采样：返回第 m 个采样点相对中心的归一化偏移（半宽为 1）。
   * @param {number} m 采样序号
   * @returns {[number, number]} 归一化偏移 (dx, dz)
   */
  const ring = (m) => {
    const side = Math.floor(m / segSide);
    const u = (m % segSide) / segSide;
    if (side === 0) return [1, -1 + 2 * u];
    if (side === 1) return [1 - 2 * u, 1];
    if (side === 2) return [-1, 1 - 2 * u];
    return [-1 + 2 * u, -1];
  };

  const positions = [];
  const indices = [];
  const rows = [];

  if (skirt > 0) {
    const row = [];
    for (let m = 0; m < per; m++) {
      const p = ring(m);
      row.push(positions.length / 3);
      positions.push(cx + p[0] * w, yBase - skirt, cz + p[1] * w);
    }
    rows.push(row);
  }
  for (let j = 0; j < segArc; j++) {
    const tau = (j / segArc) * (Math.PI / 2);
    const hw = w * Math.cos(tau);
    const y = yBase + rise * Math.sin(tau);
    const row = [];
    for (let m = 0; m < per; m++) {
      const p = ring(m);
      row.push(positions.length / 3);
      positions.push(cx + p[0] * hw, y, cz + p[1] * hw);
    }
    rows.push(row);
  }
  const apex = positions.length / 3;
  positions.push(cx, yBase + rise, cz);

  for (let r = 0; r < rows.length - 1; r++) {
    const lo = rows[r];
    const hi = rows[r + 1];
    for (let m = 0; m < per; m++) {
      const m2 = (m + 1) % per;
      indices.push(lo[m], hi[m], lo[m2]);
      indices.push(lo[m2], hi[m], hi[m2]);
    }
  }
  const last = rows[rows.length - 1];
  for (let m = 0; m < per; m++) {
    indices.push(last[m], apex, last[(m + 1) % per]);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * 世贸中心一号楼的**逐层放样**塔身：正方形 → 八角形 → 旋转 45° 正方形。
 *
 * 截面在高度参数 t ∈ [0,1] 上插值出 8 个角点（角度 θ = k·45°）：
 *   k 为奇数（基座方形的 4 个角）：r = lerp(a·√2, b, t)
 *   k 为偶数（基座方形 4 条边的中点）：r = lerp(a, b·√2, t)
 * t=0 → 半宽 a 的正方形；t=1 → 半宽 b、旋转 45° 的正方形；
 * 中间四角被切、切角随高度渐变，t≈0.5 时八边近似等长（正八边形）。
 *
 * 每圈生成 16 个顶点（8 个立面 × 2 端点各自独立），使 `computeVertexNormals()`
 * 在立面内平滑、在竖棱处保持锐利，避免整根塔身被磨圆。
 *
 * @param {number} cx 中心 X
 * @param {number} cz 中心 Z
 * @param {number} y0 起始标高
 * @param {number} y1 结束标高
 * @param {number} a 底部正方形半宽（米）
 * @param {number} b 顶部正方形半宽（米）
 * @param {number} rings 放样圈数（≥2）
 * @param {number} tileU UV 横向平铺（米）
 * @param {number} tileV UV 纵向平铺（米）
 * @returns {THREE.BufferGeometry} 索引化塔身（含顶盖）
 */
function buildTwistLoft(cx, cz, y0, y1, a, b, rings, tileU, tileV) {
  const SQRT2 = Math.SQRT2;
  const positions = [];
  const uvs = [];
  const indices = [];
  const corner = new Array(8);

  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    const y = lerp(y0, y1, t);
    for (let k = 0; k < 8; k++) {
      const r = k % 2 === 1 ? lerp(a * SQRT2, b, t) : lerp(a, b * SQRT2, t);
      const ang = k * (Math.PI / 4);
      corner[k] = [cx + Math.cos(ang) * r, cz + Math.sin(ang) * r];
    }
    // 累计周长作为 U 坐标，保证幕墙板块沿水平方向尺度均匀
    const cum = [0];
    for (let k = 0; k < 8; k++) {
      const p = corner[k];
      const q = corner[(k + 1) % 8];
      cum.push(cum[k] + Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    for (let f = 0; f < 8; f++) {
      const p = corner[f];
      const q = corner[(f + 1) % 8];
      positions.push(p[0], y, p[1]);
      uvs.push(cum[f] / tileU, y / tileV);
      positions.push(q[0], y, q[1]);
      uvs.push(cum[f + 1] / tileU, y / tileV);
    }
  }

  for (let i = 0; i < rings - 1; i++) {
    const lo = i * 16;
    const hi = (i + 1) * 16;
    for (let f = 0; f < 8; f++) {
      const la = lo + f * 2;
      const lb = la + 1;
      const ha = hi + f * 2;
      const hb = ha + 1;
      indices.push(la, ha, lb);
      indices.push(lb, ha, hb);
    }
  }

  // 顶盖：扇形闭合，绕向 (中心, P_{k+1}, P_k) 使法线朝 +Y
  const centerIdx = positions.length / 3;
  positions.push(cx, y1, cz);
  uvs.push(cx / tileU, cz / tileV);
  const topRow = (rings - 1) * 16;
  for (let f = 0; f < 8; f++) {
    indices.push(centerIdx, topRow + f * 2 + 1, topRow + f * 2);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * 登记一段塔身的竖向壁柱实例（帝国大厦的标志性立面线条）。
 *
 * 为了让所有壁柱共用同一套烘焙 UV，壁柱按 ~18m 一节竖向分段：
 * 同一段塔身内所有实例缩放完全相同，纹理尺度一致；段与段齐平相接不露缝。
 * 壁柱外表面与塔身外皮齐平，向内凸出内缩的窗墙 `depth`。
 *
 * @param {Array<Object>} out 实例列表（收集 {x,y,z,sx,sy,sz}）
 * @param {number} cx 塔身中心 X
 * @param {number} cz 塔身中心 Z
 * @param {number} yBottom 塔身底标高
 * @param {number} h 塔身高度
 * @param {number} sx 塔身 X 向外皮尺寸
 * @param {number} sz 塔身 Z 向外皮尺寸
 * @param {number} pierW 四角实心石柱宽度（壁柱不进入该区间）
 * @param {number} spacing 壁柱中心间距（米）
 * @param {number} w 壁柱宽度（米）
 * @param {number} depth 壁柱进深（米）
 * @param {number} colorHex 该段壁柱的实例色（写进 `instanceColor`）
 * @returns {number} 新增实例数
 */
function addPilasters(out, cx, cz, yBottom, h, sx, sz, pierW, spacing, w, depth, colorHex) {
  const nSeg = Math.max(1, Math.round(h / 18));
  const segH = h / nSeg;
  let added = 0;

  const usableX = sx - pierW * 2;
  const nx = Math.max(0, Math.floor(usableX / spacing) - 1);
  for (let i = 0; i < nx; i++) {
    const x = cx - usableX / 2 + (usableX * (i + 1)) / (nx + 1);
    for (let s = -1; s <= 1; s += 2) {
      const z = cz + s * (sz / 2 - depth / 2);
      for (let k = 0; k < nSeg; k++) {
        out.push({ x, y: yBottom + k * segH + segH / 2, z, sx: w, sy: segH, sz: depth, c: colorHex });
        added++;
      }
    }
  }

  const usableZ = sz - pierW * 2;
  const nz = Math.max(0, Math.floor(usableZ / spacing) - 1);
  for (let i = 0; i < nz; i++) {
    const z = cz - usableZ / 2 + (usableZ * (i + 1)) / (nz + 1);
    for (let s = -1; s <= 1; s += 2) {
      const x = cx + s * (sx / 2 - depth / 2);
      for (let k = 0; k < nSeg; k++) {
        out.push({ x, y: yBottom + k * segH + segH / 2, z, sx: depth, sy: segH, sz: w, c: colorHex });
        added++;
      }
    }
  }
  return added;
}

/**
 * 生成一段矩形塔身：内凹窗墙 + 四角实心石柱 + 底部勒脚 + 顶部檐口 + 竖向壁柱。
 *
 * @param {Object} B 材质桶集合
 * @param {number} cx 中心 X
 * @param {number} cz 中心 Z
 * @param {number} yBottom 底标高
 * @param {number} h 高度
 * @param {number} sx X 向尺寸
 * @param {number} sz Z 向尺寸
 * @param {Object} o 外观选项
 * @param {number} o.stone 石材顶点色
 * @param {number} o.window 窗墙顶点色
 * @param {number} [o.inset=1.5] 窗墙内缩量（米）
 * @param {number} [o.pier=3.4] 四角石柱宽（米）
 * @param {number} [o.cornice=2.4] 顶部檐口高度（米）
 * @param {number} [o.corniceOut=1.3] 顶部檐口外挑（米）
 * @param {number} [o.spacing=3.6] 壁柱间距（米）
 * @param {boolean} [o.base=true] 是否加底部勒脚
 * @param {boolean} [o.pilasters=true] 是否布置壁柱
 * @returns {void}
 */
function addRectTier(B, cx, cz, yBottom, h, sx, sz, o) {
  const inset = o.inset === undefined ? 1.5 : o.inset;
  const pier = o.pier === undefined ? 3.4 : o.pier;
  const cornice = o.cornice === undefined ? 2.4 : o.cornice;
  const corniceOut = o.corniceOut === undefined ? 1.3 : o.corniceOut;
  const spacing = o.spacing === undefined ? 3.6 : o.spacing;

  pushGeom(B.window, boxAt(cx, yBottom, cz, sx - inset * 2, h, sz - inset * 2), o.window, TILE_WIN);

  for (let ix = -1; ix <= 1; ix += 2) {
    for (let iz = -1; iz <= 1; iz += 2) {
      pushGeom(
        B.stone,
        boxAt(cx + ix * (sx / 2 - pier / 2), yBottom, cz + iz * (sz / 2 - pier / 2), pier, h, pier),
        o.stone,
        TILE_STONE
      );
    }
  }

  if (o.base !== false) {
    pushGeom(B.stone, boxAt(cx, yBottom, cz, sx + 1.0, 2.2, sz + 1.0), o.stone, TILE_STONE);
  }
  pushGeom(
    B.stone,
    boxAt(cx, yBottom + h - cornice, cz, sx + corniceOut * 2, cornice, sz + corniceOut * 2),
    o.stone,
    TILE_STONE
  );

  if (o.pilasters !== false) {
    addPilasters(
      B.pilasters, cx, cz, yBottom, h - cornice, sx, sz, pier, spacing, 1.15, inset + 0.2, o.stone
    );
  }
}

/* ========================================================================== *
 * 地标一：帝国大厦（-60, -430） 381m + 62m 天线
 * ========================================================================== */

/**
 * 建造帝国大厦：五段式退台 + 装饰艺术阶梯冠顶 + 圆形观景层 + 系留桅杆/天线。
 *
 * 分段（标高，米）：
 *   0–25.5   宽大裙楼（含两翼），沿街基座与雨棚
 *   25.5–62  第一次收进（保留翼部）
 *   62–222   中央塔身（最长的一段，竖向壁柱最密）
 *   222–298  上部收进段
 *   298–341  装饰艺术冠顶：三级阶梯收分 + 彩色泛光带
 *   341–369  圆形观景层（双层圆鼓）+ 24 片放射状装饰鳍
 *   369–381  系留桅杆（结构高度 381m）
 *   381–443  天线（62m，三段变径 + 环箍 + 顶部航空障碍灯）
 *
 * @param {Object} B 材质桶集合
 * @returns {void}
 */
function buildEmpireState(B) {
  const cx = ESB.x;
  const cz = ESB.z;
  const stone = COLOR.esbStone;
  const win = COLOR.esbWindow;

  // —— 段 1：裙楼（沿街五层，含东西两翼）——
  pushGeom(B.window, boxAt(cx, 0, cz, 106 - 3.0, 25.5, 42 - 3.0), win, TILE_WIN);
  pushGeom(B.stone, boxAt(cx, 0, cz, 106, 7.5, 42), stone, TILE_STONE);          // 沿街基座
  pushGeom(B.stone, boxAt(cx, 7.5, cz, 108.4, 1.6, 44.4), stone, TILE_STONE);    // 雨棚线脚
  pushGeom(B.stone, boxAt(cx, 23.1, cz, 108.8, 2.4, 44.8), stone, TILE_STONE);   // 裙楼檐口
  for (let ix = -1; ix <= 1; ix += 2) {
    pushGeom(B.stone, boxAt(cx + ix * 51.3, 0, cz, 3.4, 23.1, 42), stone, TILE_STONE);
  }
  for (let iz = -1; iz <= 1; iz += 2) {
    pushGeom(B.stone, boxAt(cx, 0, cz + iz * 19.3, 106, 23.1, 3.4), stone, TILE_STONE);
  }
  // 入口塔门（第五大道一侧，+X 面），装饰艺术竖向凹槽
  pushGeom(B.stone, boxAt(cx, 0, cz, 26, 15.5, 45.6), stone, TILE_STONE);
  pushGeom(B.window, boxAt(cx, 1.2, cz, 18, 11.5, 46.4), win, TILE_WIN);

  // —— 段 2：第一次收进 ——
  addRectTier(B, cx, cz, 25.5, 36.5, 88, 38, { stone, window: win, cornice: 2.2, corniceOut: 1.2 });

  // —— 段 3：中央塔身 ——
  addRectTier(B, cx, cz, 62, 160, 60, 33, { stone, window: win, cornice: 2.6, corniceOut: 1.4 });

  // —— 段 4：上部收进 ——
  addRectTier(B, cx, cz, 222, 76, 50, 28, { stone, window: win, cornice: 2.4, corniceOut: 1.3 });

  // —— 段 5：装饰艺术冠顶（三级阶梯收分）——
  const steps = [
    { y: 298, h: 16, sx: 42, sz: 24 },
    { y: 314, h: 14, sx: 34, sz: 20 },
    { y: 328, h: 13, sx: 26, sz: 16 }
  ];
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    addRectTier(B, cx, cz, s.y, s.h, s.sx, s.sz, {
      stone: COLOR.esbCrown,
      window: win,
      inset: 1.2,
      pier: 3.0,
      cornice: 1.8,
      corniceOut: 1.1,
      spacing: 3.4,
      base: false,
      pilasters: i === 0
    });
    // 彩色泛光带：略大于该级的薄板，只有外沿 0.6m 露在体量之外
    pushGeom(
      B.crown,
      boxAt(cx, s.y + s.h - 3.4, cz, s.sx + 1.2, 1.6, s.sz + 1.2),
      COLOR.glowOff,
      TILE_STONE
    );
    // 四角放射状装饰鳍（沿对角外挑的阶梯小翼）
    for (let ix = -1; ix <= 1; ix += 2) {
      for (let iz = -1; iz <= 1; iz += 2) {
        pushGeom(
          B.stone,
          boxAt(cx + ix * (s.sx / 2 - 1.0), s.y + 1.0, cz + iz * (s.sz / 2 - 1.0), 2.6, s.h - 2.0, 2.6),
          COLOR.esbCrown,
          TILE_STONE
        );
      }
    }
  }

  // —— 圆形观景层：双层圆鼓 + 24 片放射状装饰鳍 ——
  pushGeom(B.stone, boxAt(cx, 341, cz, 24, 1.4, 15), COLOR.esbCrown, TILE_STONE); // 观景平台底盘
  pushGeom(B.stone, cylAt(cx, 342.4, cz, 9.4, 9.8, 14.6, 28), COLOR.esbCrown, TILE_STONE);
  pushGeom(B.window, cylAt(cx, 344.0, cz, 9.9, 9.9, 5.4, 28, true), win, TILE_WIN); // 观景玻璃带
  pushGeom(B.crown, cylAt(cx, 351.8, cz, 10.1, 10.1, 1.8, 28, true), COLOR.glowOff, TILE_STONE);
  pushGeom(B.stone, cylAt(cx, 357, cz, 6.4, 7.6, 12, 24), COLOR.esbCrown, TILE_STONE);
  pushGeom(B.crown, cylAt(cx, 366.4, cz, 6.9, 6.9, 1.4, 24, true), COLOR.glowOff, TILE_STONE);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TWO_PI;
    const fin = new THREE.BoxGeometry(2.6, 6.4, 0.55);
    fin.translate(10.2, 0, 0);
    fin.rotateY(-a);
    fin.translate(cx, 346.2, cz);
    pushGeom(B.stone, fin, COLOR.esbCrown, TILE_STONE);
  }

  // —— 系留桅杆（结构顶 381m）——
  pushGeom(B.stone, cylAt(cx, 369, cz, 3.6, 5.2, 12, 20), COLOR.esbCrown, TILE_STONE);
  pushGeom(B.steel, cylAt(cx, 369, cz, 6.2, 6.2, 0.9, 20, true), COLOR.chrSteel, TILE_STONE);

  // —— 天线（381 → 443，共 62m）——
  pushGeom(B.steel, cylAt(cx, 381, cz, 1.9, 2.6, 18, 12), COLOR.chrSteel, TILE_STONE);
  pushGeom(B.steel, cylAt(cx, 399, cz, 0.9, 1.5, 22, 10), COLOR.chrSteel, TILE_STONE);
  pushGeom(B.steel, cylAt(cx, 421, cz, 0.22, 0.7, 22, 8), COLOR.chrSteel, TILE_STONE);
  for (const y of [386, 392, 398, 406, 414]) {
    const r = y < 399 ? 3.0 : 1.9;
    pushGeom(B.steel, cylAt(cx, y, cz, r, r, 0.45, 12, true), COLOR.chrSteel, TILE_STONE);
  }

  // —— 航空障碍灯 ——
  B.beacons.push({ x: cx, y: ESB.top + 0.6, z: cz, period: 1.5, duty: 0.24, phase: 0 });
  B.beacons.push({ x: cx, y: 421.5, z: cz, period: 2.4, duty: 0.18, phase: 0.35 });
  for (let ix = -1; ix <= 1; ix += 2) {
    B.beacons.push({ x: cx + ix * 12, y: 342.6, z: cz, period: 2.9, duty: 0.16, phase: 0.6 });
  }
}

/* ========================================================================== *
 * 地标二：克莱斯勒大厦（250, -540） 282m + 37m 尖顶
 * ========================================================================== */

/**
 * 在穹壳表面铺一排三角形窗（克莱斯勒冠顶的标志性纹样）。
 *
 * 曲面 P(τ, p) = ( w·cosτ , yBase + rise·sinτ , p·w·cosτ )（以 +X 立面为基准），
 * 外法线由两个偏导数叉乘得到：
 *     ∂P/∂p × ∂P/∂τ  →  N ∝ ( w·rise·cos²τ , w²·cosτ·sinτ , 0 )
 * 窗的"竖向"取弧向切线 up = normalize( side × N )，"横向"取 side = (0,0,1)。
 * 四个立面靠绕 Y 轴旋转 90° 的整数倍复用同一套计算。
 *
 * @param {Object} B 材质桶集合
 * @param {THREE.BufferGeometry} template 单位三角窗模板（底边 ±1、高 1、厚 1）
 * @param {number} cx 塔中心 X
 * @param {number} cz 塔中心 Z
 * @param {number} yBase 拱脚标高
 * @param {number} w 拱脚平面半宽
 * @param {number} rise 拱高
 * @param {Array<{t:number, count:number, size:number}>} rows 各排的弧向参数、数量与尺寸
 * @returns {void}
 */
function addArchWindows(B, template, cx, cz, yBase, w, rise, rows) {
  const side = new THREE.Vector3(0, 0, 1);
  for (let f = 0; f < 4; f++) {
    const rot = new THREE.Matrix4().makeRotationY((f * Math.PI) / 2);
    rot.setPosition(cx, 0, cz);
    for (const row of rows) {
      const tau = row.t * (Math.PI / 2);
      const ct = Math.cos(tau);
      const st = Math.sin(tau);
      const hw = w * ct;
      const y = yBase + rise * st;
      _v3a.set(w * rise * ct * ct, w * w * ct * st, 0).normalize();          // 外法线 N
      _v3b.copy(side).cross(_v3a).normalize();                                // 弧向切线 up
      if (_v3b.y < 0) _v3b.negate();
      for (let j = 0; j < row.count; j++) {
        const p = (-1 + (2 * (j + 0.5)) / row.count) * 0.74;
        _v3c.set(hw, y, p * hw);
        const m = new THREE.Matrix4().makeBasis(
          new THREE.Vector3().copy(side).multiplyScalar(row.size * 0.5),
          new THREE.Vector3().copy(_v3b).multiplyScalar(row.size * 1.9),
          new THREE.Vector3().copy(_v3a).multiplyScalar(0.6)
        );
        m.setPosition(
          _v3c.x - _v3a.x * 0.18,
          _v3c.y - _v3a.y * 0.18,
          _v3c.z - _v3a.z * 0.18
        );
        const g = template.clone();
        g.applyMatrix4(m);
        g.applyMatrix4(rot);
        pushGeom(B.glow, g, COLOR.glowOff, TILE_STONE);
      }
    }
  }
}

/**
 * 在穹壳上拉一条沿弧线的金属肋（四角 + 四面中线，构成放射状纹样）。
 * @param {Object} B 材质桶集合
 * @param {number} cx 塔中心 X
 * @param {number} cz 塔中心 Z
 * @param {number} yBase 拱脚标高
 * @param {number} w 拱脚平面半宽
 * @param {number} rise 拱高
 * @param {number} dx 方向系数 X（面中线取 ±1/0，角部取 ±1）
 * @param {number} dz 方向系数 Z
 * @param {number} radius 肋半径（米）
 * @returns {void}
 */
function addArchRib(B, cx, cz, yBase, w, rise, dx, dz, radius) {
  const pts = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const tau = (i / n) * (Math.PI / 2);
    const hw = w * Math.cos(tau) * 1.012;
    pts.push(new THREE.Vector3(cx + dx * hw, yBase + rise * Math.sin(tau), cz + dz * hw));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1);
  pushGeom(B.steel, new THREE.TubeGeometry(curve, 10, radius, 4, false), COLOR.chrSteel, TILE_STONE);
}

/**
 * 简化鹰形装饰（克莱斯勒 61 层四角的不锈钢鹰头檐兽）。
 * 先在"+X 为朝外"的局部坐标系里拼零件，再整体绕 Y 旋转到角部朝向并平移。
 * @param {Object} B 材质桶集合
 * @param {number} x 安放点 X
 * @param {number} y 安放点标高
 * @param {number} z 安放点 Z
 * @param {number} angleY 绕 Y 的朝向角（弧度）
 * @returns {void}
 */
function addEagle(B, x, y, z, angleY) {
  const parts = [];

  const neck = new THREE.CylinderGeometry(0.5, 1.15, 5.2, 8);
  neck.rotateZ(-55 * DEG2RAD);
  neck.translate(1.5, 1.7, 0);
  parts.push(neck);

  const head = new THREE.IcosahedronGeometry(1.05, 1);
  head.scale(1.25, 1.0, 0.9);
  head.translate(4.3, 4.3, 0);
  parts.push(head);

  const beak = new THREE.ConeGeometry(0.42, 1.9, 6);
  beak.rotateZ(-100 * DEG2RAD);
  beak.translate(5.6, 4.0, 0);
  parts.push(beak);

  for (let s = -1; s <= 1; s += 2) {
    const wing = new THREE.BoxGeometry(4.6, 0.42, 1.7);
    wing.rotateY(s * 26 * DEG2RAD);
    wing.rotateZ(11 * DEG2RAD);
    wing.translate(1.1, 2.9, s * 1.55);
    parts.push(wing);
  }

  const corbel = new THREE.BoxGeometry(2.4, 1.3, 2.6);
  corbel.translate(0.5, 0.65, 0);
  parts.push(corbel);

  _mat4.makeRotationY(angleY);
  _mat4.setPosition(x, y, z);
  for (const g of parts) {
    g.applyMatrix4(_mat4);
    pushGeom(B.steel, g, COLOR.chrSteel, TILE_STONE);
  }
}

/**
 * 建造克莱斯勒大厦：五级收分塔身 + 7 层放射状拱形冠顶 + 细长尖针。
 *
 * 冠顶第 i 级（i = 0..6）参数：
 *   半宽  w_i    = lerp(14, 3.4, i/6)      —— 逐级收进
 *   拱脚  yBase_i = 252 + 4.3·i            —— 逐级抬高
 *   拱高  rise_i  = 1.2·w_i                —— 保持半圆拱的高宽比
 * 于是 7 个方棱穹壳层层嵌套、apex 逐级升高，第 6 级顶端 ≈ 282m（结构高度）。
 *
 * @param {Object} B 材质桶集合
 * @returns {void}
 */
function buildChrysler(B) {
  const cx = CHR.x;
  const cz = CHR.z;
  const stone = COLOR.chrBrick;
  const win = COLOR.chrWindow;

  // —— 塔身五级收分 ——
  pushGeom(B.stone, boxAt(cx, 0, cz, 64, 9, 46), stone, TILE_STONE);
  addRectTier(B, cx, cz, 0, 30, 64, 46, { stone, window: win, cornice: 2.6, corniceOut: 1.5, pilasters: false });
  addRectTier(B, cx, cz, 30, 66, 56, 42, { stone, window: win, cornice: 2.4, corniceOut: 1.3, base: false });
  addRectTier(B, cx, cz, 96, 72, 48, 36, { stone, window: win, cornice: 2.4, corniceOut: 1.3, base: false });
  addRectTier(B, cx, cz, 168, 46, 42, 32, { stone, window: win, cornice: 2.6, corniceOut: 1.5, base: false });
  addRectTier(B, cx, cz, 214, 32, 34, 28, {
    stone, window: win, cornice: 2.2, corniceOut: 1.2, base: false, pilasters: false
  });
  // 冠顶方形过渡座
  pushGeom(B.stone, boxAt(cx, 246, cz, 28.4, 6, 28.4), stone, TILE_STONE);
  pushGeom(B.steel, boxAt(cx, 250.4, cz, 29.6, 1.6, 29.6), COLOR.chrSteel, TILE_STONE);

  // —— 四角鹰形装饰（214m 退台处，朝四个对角外挑）——
  for (let ix = -1; ix <= 1; ix += 2) {
    for (let iz = -1; iz <= 1; iz += 2) {
      const dl = Math.SQRT1_2;
      addEagle(B, cx + ix * 20, 214.6, cz + iz * 15, Math.atan2(-iz * dl, ix * dl));
    }
  }

  // —— 7 层放射状拱形冠顶 ——
  const template = new THREE.ExtrudeGeometry(
    new THREE.Shape([new THREE.Vector2(-1, 0), new THREE.Vector2(1, 0), new THREE.Vector2(0, 1)]),
    { depth: 1, bevelEnabled: false, steps: 1, curveSegments: 1 }
  );
  const ribDirs = [
    [1, 0], [0, 1], [-1, 0], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];
  for (let i = 0; i < 7; i++) {
    const f = i / 6;
    const w = lerp(14, 3.4, f);
    const yBase = 252 + 4.3 * i;
    const rise = w * 1.2;
    pushGeom(
      B.steel,
      buildSquareDome(cx, cz, yBase, w, rise, 9, 7, i === 0 ? 2.2 : 1.4),
      COLOR.chrSteel,
      TILE_STONE
    );
    if (i < 5) {
      addArchWindows(B, template, cx, cz, yBase, w, rise, [
        { t: 0.20, count: 4, size: lerp(1.9, 0.9, f) },
        { t: 0.44, count: 3, size: lerp(1.7, 0.8, f) },
        { t: 0.68, count: 2, size: lerp(1.4, 0.7, f) }
      ]);
    }
    for (const d of ribDirs) {
      addArchRib(B, cx, cz, yBase, w, rise, d[0], d[1], lerp(0.36, 0.16, f));
    }
  }
  template.dispose();

  // —— 尖针（282 → 319，共 37m）——
  pushGeom(B.steel, cylAt(cx, 281, cz, 1.1, 2.1, 15, 12), COLOR.chrSteel, TILE_STONE);
  pushGeom(B.steel, cylAt(cx, 296, cz, 0.5, 1.1, 14, 10), COLOR.chrSteel, TILE_STONE);
  pushGeom(B.steel, cylAt(cx, 310, cz, 0.08, 0.5, 9, 8), COLOR.chrSteel, TILE_STONE);
  for (const y of [287, 295]) {
    pushGeom(B.steel, cylAt(cx, y, cz, 1.6, 1.6, 0.5, 12, true), COLOR.chrSteel, TILE_STONE);
  }

  B.beacons.push({ x: cx, y: CHR.top - 0.4, z: cz, period: 1.8, duty: 0.2, phase: 0.2 });
  B.beacons.push({ x: cx, y: 283.4, z: cz, period: 3.1, duty: 0.15, phase: 0.75 });
}

/* ========================================================================== *
 * 地标三：世贸中心一号楼（60, 1830） 417m + 124m 尖塔
 * ========================================================================== */

/**
 * 建造世贸中心一号楼：方形基座 → 逐层放样的扭转塔身 → 圆形平台 + 124m 尖塔。
 *
 * 塔身用 {@link buildTwistLoft} 生成：底部半宽 30.5m 的正方形（61m 见方），
 * 顶部半宽 21.8m、旋转 45° 的正方形，66 圈截面（约 5.5m 一圈，合两个楼层）。
 * 中段自动过渡为八角形——四角的切角量随高度线性增大，正是该塔的形体母题。
 *
 * @param {Object} B 材质桶集合
 * @returns {void}
 */
function buildWtc(B) {
  const cx = WTC.x;
  const cz = WTC.z;

  // —— 基座：花岗岩台座 + 棱镜玻璃幕墙立方体 ——
  pushGeom(B.stone, boxAt(cx, 0, cz, 66, 3.2, 66), COLOR.wtcBase, TILE_STONE);
  pushGeom(B.stone, boxAt(cx, 3.2, cz, 62.4, 9.4, 62.4), COLOR.wtcBase, TILE_STONE);
  pushGeom(B.glass, boxAt(cx, 12.6, cz, 61, 44.4, 61), COLOR.wtcBase, TILE_GLASS);
  pushGeom(B.steel, boxAt(cx, 56.2, cz, 62.2, 0.9, 62.2), COLOR.wtcSteel, TILE_STONE);

  // —— 扭转塔身（57 → 417）——
  pushGeom(
    B.glass,
    buildTwistLoft(cx, cz, 57, WTC.roof, 30.5, 21.8, 66, TILE_GLASS.u, TILE_GLASS.v),
    COLOR.wtcGlass,
    null
  );

  // —— 顶部圆形平台与女儿墙 ——
  pushGeom(B.steel, cylAt(cx, WTC.roof - 1.6, cz, 15.5, 15.5, 2.4, 32), COLOR.wtcSteel, TILE_STONE);
  pushGeom(B.steel, cylAt(cx, WTC.roof + 0.8, cz, 15.8, 15.8, 1.8, 32, true), COLOR.wtcSteel, TILE_STONE);
  pushGeom(B.glow, cylAt(cx, WTC.roof + 0.4, cz, 16.1, 16.1, 0.6, 32, true), COLOR.glowOff, TILE_STONE);
  pushGeom(B.steel, cylAt(cx, WTC.roof + 2.6, cz, 5.2, 7.4, 4.2, 20), COLOR.wtcSteel, TILE_STONE);

  // —— 尖塔（417 → 541，共 124m）——
  pushGeom(B.steel, cylAt(cx, 421, cz, 2.0, 3.4, 34, 16), COLOR.wtcSteel, TILE_STONE);
  pushGeom(B.steel, cylAt(cx, 455, cz, 1.1, 2.0, 50, 12), COLOR.wtcSteel, TILE_STONE);
  pushGeom(B.steel, cylAt(cx, 505, cz, 0.26, 1.1, 36, 10), COLOR.wtcSteel, TILE_STONE);
  for (const y of [432, 462, 492, 518]) {
    const r = y < 455 ? 2.6 : y < 505 ? 1.7 : 0.9;
    pushGeom(B.glow, cylAt(cx, y, cz, r, r, 1.1, 14, true), COLOR.glowOff, TILE_STONE);
  }

  B.beacons.push({ x: cx, y: WTC.top + 0.7, z: cz, period: 1.3, duty: 0.26, phase: 0.1 });
  B.beacons.push({ x: cx, y: 505.6, z: cz, period: 2.2, duty: 0.16, phase: 0.5 });
  for (let ix = -1; ix <= 1; ix += 2) {
    B.beacons.push({ x: cx + ix * 14, y: WTC.roof + 2.8, z: cz, period: 2.7, duty: 0.14, phase: 0.8 });
  }
}

/* ========================================================================== *
 * 地标四：熨斗大厦（plan.triangleLots 中离 (0,240) 最近的三角地块） 87m
 * ========================================================================== */

/**
 * 从 `plan.triangleLots` 中挑出离锚点最近、且面积足够的三角地块。
 * 若城市方案里没有可用地块（极端种子），退化为围绕锚点的合成楔形地块。
 * @param {Object|null} plan CityPlan（契约 §4.1）
 * @returns {{polygon: Array<[number, number]>, id: string}} 地块多边形与 id
 */
function pickFlatironLot(plan) {
  const lots = plan && Array.isArray(plan.triangleLots) ? plan.triangleLots : [];
  let best = null;
  let bestScore = Infinity;
  for (const lot of lots) {
    if (!lot || !Array.isArray(lot.polygon) || lot.polygon.length < 3) continue;
    if (!(lot.area > 150)) continue;
    const dx = lot.centerX - FLAT.x;
    const dz = lot.centerZ - FLAT.z;
    // 以"最接近锚点"为准（契约 §5.3），面积只作为同距离时的极轻微偏好，
    // 上限 8m 的折扣不足以让远处的大地块反超近处地块。
    const score = Math.hypot(dx, dz) - Math.min(lot.area, 2000) * 0.004;
    if (score < bestScore) {
      bestScore = score;
      best = lot;
    }
  }
  if (best) return { polygon: best.polygon.map((p) => [p[0], p[1]]), id: String(best.id) };
  return {
    polygon: [[-25, 272], [25, 268], [3, 196]],
    id: 'flatiron-fallback'
  };
}

/**
 * 把细长的三角地块**横向**放宽到熨斗大厦的真实楔形比例。
 *
 * `grid.js` 沿百老汇裁出的三角地块锐角只有 ≈ 11.8°（百老汇斜切角），
 * 宽约 10m、长约 48m；直接挤到 87m 会得到一片刀锋而不是楼。这里在地块的
 * 主轴局部坐标系里做**各向异性缩放**：沿主轴（≈ 百老汇走向）长度保持不变，
 * 只把垂直主轴的进深按比例放大到 `targetWidth`，形心保持不动。
 * 于是地块的朝向、位置、三角拓扑都还是原地块的，锐角变为 ≈ 28°（实物 ≈ 25°）。
 * 放大倍数夹在 [1, 3.2]，本身够宽的地块不会被改动。
 *
 * @param {Array<[number, number]>} poly 原始三角地块多边形（XZ）
 * @param {number} targetWidth 目标横向进深（米）
 * @returns {Array<[number, number]>} 放宽后的多边形
 */
function widenWedge(poly, targetWidth) {
  let cxs = 0;
  let czs = 0;
  for (const p of poly) {
    cxs += p[0];
    czs += p[1];
  }
  const cx = cxs / poly.length;
  const cz = czs / poly.length;

  // 主轴 = 最长边的方向（三角地块里这条边一定沿百老汇）
  let dx = 1;
  let dz = 0;
  let bestLen = -1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const len = Math.hypot(ex, ez);
    if (len > bestLen) {
      bestLen = len;
      dx = ex / (len || 1);
      dz = ez / (len || 1);
    }
  }
  const nx = -dz;
  const nz = dx;

  let minA = Infinity;
  let maxA = -Infinity;
  const local = poly.map((p) => {
    const rx = p[0] - cx;
    const rz = p[1] - cz;
    const along = rx * dx + rz * dz;
    const across = rx * nx + rz * nz;
    if (across < minA) minA = across;
    if (across > maxA) maxA = across;
    return [along, across];
  });

  const width = maxA - minA;
  const s = clamp(width > 1e-3 ? targetWidth / width : 1, 1, 3.2);
  return local.map(([along, across]) => [
    cx + dx * along + nx * across * s,
    cz + dz * along + nz * across * s
  ]);
}

/**
 * 建造熨斗大厦：沿三角地块多边形挤出 22 层 87m，锐角端圆角，
 * 每 4~5 层一道外挑腰线，顶部重檐口。
 *
 * @param {Object} B 材质桶集合
 * @param {Object|null} plan CityPlan
 * @returns {{x:number, z:number, lotId:string}} 楼体形心与占用的地块 id
 */
function buildFlatiron(B, plan) {
  const picked = pickFlatironLot(plan);
  const wedge = widenWedge(picked.polygon, FLAT.targetWidth);
  const arcs = [];
  // 锐角端圆角：只对内角 < 45° 的"船首"顶点做 2.4m 半径的圆弧替换。
  // 半径不能贪大——锐角处切线长 = r/tan(θ/2)，θ≈28° 时 r=2.4m 已经把尖端截掉
  // 约 9.6m、留出 ≈4.7m 宽的弧形凸窗，正是实物船首的样子；再大就把楼削短了。
  const poly = filletPolygon(wedge, 2.4, 45, 7, arcs);
  const floorH = FLAT.height / FLAT.floors;

  // 楼身（窗墙）
  pushGeom(B.window, extrudePolygon(poly, 0, FLAT.height), COLOR.flatWindow, TILE_WIN);

  // 底部两层的石材基座
  pushGeom(B.stone, extrudePolygon(offsetPolygon(poly, 0.75), 0, floorH * 2), COLOR.flatStone, TILE_STONE);

  // 每 4~5 层一道横向腰线（外挑 0.6m）
  const bandFloors = [2, 6, 11, 16, 19];
  for (const fl of bandFloors) {
    pushGeom(
      B.stone,
      extrudePolygon(offsetPolygon(poly, 0.6), fl * floorH - 0.45, 1.0),
      COLOR.flatStone,
      TILE_STONE
    );
  }

  // 顶部重檐口（两级外挑）+ 女儿墙，总高恰好收在 87m
  pushGeom(
    B.stone,
    extrudePolygon(offsetPolygon(poly, 1.15), FLAT.height - 4.2, 1.6),
    COLOR.flatStone,
    TILE_STONE
  );
  pushGeom(
    B.stone,
    extrudePolygon(offsetPolygon(poly, 1.95), FLAT.height - 2.6, 1.9),
    COLOR.flatStone,
    TILE_STONE
  );
  pushGeom(
    B.stone,
    extrudePolygon(offsetPolygon(poly, 0.2), FLAT.height - 0.7, 0.7),
    COLOR.flatStone,
    TILE_STONE
  );

  // 锐角端的圆角竖向壁柱：贴着圆弧再外扩 0.4m，强化"船首"轮廓
  for (const arc of arcs) {
    pushGeom(
      B.stone,
      cylAt(arc.x, 0, arc.z, arc.r + 0.42, arc.r + 0.42, FLAT.height - 4.2, 14),
      COLOR.flatStone,
      TILE_STONE
    );
  }

  let sx = 0;
  let sz = 0;
  for (const p of poly) {
    sx += p[0];
    sz += p[1];
  }
  return { x: sx / poly.length, z: sz / poly.length, lotId: picked.id };
}

/* ========================================================================== *
 * 装配：材质 / 合并 / 实例化 / 每帧更新
 * ========================================================================== */

/**
 * 克隆一张共享贴图供本模块独占使用。
 *
 * `ctx0.textures` 是全场景共享的，直接改它的 `repeat` 会污染别的模块；
 * 而 `clone()` 出来的贴图与原图**共享同一个 `source`（canvas）**，
 * Three 内部按 source 引用计数，既不会重复上传显存，`dispose()` 也不会误伤原图。
 *
 * @param {THREE.Texture|null|undefined} tex 源贴图
 * @param {Array<THREE.Texture>} owned 本模块自有贴图登记表（用于 dispose）
 * @returns {THREE.Texture|null} 克隆体；源为空时返回 null
 */
function cloneTexture(tex, owned) {
  if (!tex || typeof tex.clone !== 'function') return null;
  const t = tex.clone();
  t.repeat.set(1, 1);
  t.offset.set(0, 0);
  t.needsUpdate = true;
  owned.push(t);
  return t;
}

/**
 * 把一个材质桶里的所有几何合并成单个 Mesh（每个材质仅 1 个 drawcall）。
 * @param {Array<THREE.BufferGeometry>} list 材质桶（合并后会被清空并逐个释放）
 * @param {THREE.Material} material 目标材质
 * @param {string} name Mesh 名称
 * @returns {THREE.Mesh|null} 合并后的 Mesh；桶为空或合并失败时返回 null
 */
function mergeBucket(list, material, name) {
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  list.length = 0;
  if (!merged) return null;
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = name;
  return mesh;
}

/**
 * 统计一个几何的三角形数量。
 * @param {THREE.BufferGeometry} geom 几何
 * @returns {number} 三角形数
 */
function triCount(geom) {
  if (!geom || !geom.attributes.position) return 0;
  return (geom.index ? geom.index.count : geom.attributes.position.count) / 3;
}

/**
 * 创建四座地标（契约 §5.3）。
 *
 * 产出 8 个 drawcall：石材 / 窗墙 / 玻璃幕墙 / 不锈钢 / 塔冠泛光 / 夜间辉光
 * 六个合并 Mesh，外加竖向壁柱与航空障碍灯两个 `InstancedMesh`。
 * 另有一盏塔冠彩色泛光 `PointLight`（常驻场景、只改强度，避免灯数变化触发重编译）。
 *
 * @param {{plan?:Object, rng?:Object, textures?:Object, env?:Object, quality?:string,
 *          tallStructures?:Array<Object>}} ctx0 构建期上下文（契约 §5）
 * @returns {{object3D: THREE.Group, update: (ctx: Object) => void, dispose: () => void,
 *           stats: Object, occupiedLots: Array<string>}} SystemHandle
 */
export function createLandmarks(ctx0) {
  const opts = ctx0 || {};
  const env = opts.env || null;
  const lib = opts.textures || {};
  const plan = opts.plan || null;

  const root = new THREE.Group();
  root.name = 'landmarks';

  /* ---------------- 贴图与材质 ---------------- */

  const ownedTextures = [];
  const texLimestone = cloneTexture(lib.limestone, ownedTextures);
  const texGlass = cloneTexture(lib.glassCurtain, ownedTextures);
  const fw = lib.facadeWindows || {};
  const texWinMap = cloneTexture(fw.map, ownedTextures);
  const texWinEmi = cloneTexture(fw.emissiveMap, ownedTextures);
  const texWinRough = cloneTexture(fw.roughnessMap, ownedTextures);

  const stoneMat = new THREE.MeshStandardMaterial({
    name: 'landmark-stone',
    map: texLimestone,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.03
  });
  const windowMat = new THREE.MeshStandardMaterial({
    name: 'landmark-window',
    map: texWinMap,
    roughnessMap: texWinRough,
    emissiveMap: texWinEmi,
    emissive: new THREE.Color(0xffc98a),
    emissiveIntensity: 0,
    vertexColors: true,
    roughness: 0.55,
    metalness: 0.22
  });
  const glassMat = new THREE.MeshStandardMaterial({
    name: 'landmark-glass',
    map: texGlass,
    emissiveMap: texWinEmi,
    emissive: new THREE.Color(0xa9c8ff),
    emissiveIntensity: 0,
    vertexColors: true,
    roughness: 0.07,
    metalness: 0.88,
    envMapIntensity: 1.6
  });
  const steelMat = new THREE.MeshStandardMaterial({
    name: 'landmark-steel',
    vertexColors: true,
    roughness: 0.14,
    metalness: 0.95,
    envMapIntensity: 1.5
  });
  const crownMat = new THREE.MeshStandardMaterial({
    name: 'landmark-crown',
    vertexColors: true,
    roughness: 0.45,
    metalness: 0.3,
    emissive: new THREE.Color(CROWN_COLORS.clear),
    emissiveIntensity: 0
  });
  const glowMat = new THREE.MeshStandardMaterial({
    name: 'landmark-glow',
    vertexColors: true,
    roughness: 0.32,
    metalness: 0.55,
    emissive: new THREE.Color(0xffb867),
    emissiveIntensity: 0
  });
  const beaconMat = new THREE.MeshBasicMaterial({ name: 'landmark-beacon', color: 0xffffff });

  patchCityMaterial(stoneMat, env, { snowAmount: 1.0, puddles: false });
  patchCityMaterial(windowMat, env, { snowAmount: 0.35, wetDarken: 0.28, puddles: false });
  patchCityMaterial(glassMat, env, { snowAmount: 0.25, wetDarken: 0.2, puddles: false });
  patchCityMaterial(steelMat, env, { snowAmount: 0.45, wetDarken: 0.18, puddles: false });
  patchCityMaterial(crownMat, env, { snowAmount: 0.5, wetDarken: 0.25, puddles: false });
  patchCityMaterial(glowMat, env, { snow: false, wetness: false });
  patchCityMaterial(beaconMat, env, { snow: false, wetness: false, flash: false });

  const materials = [stoneMat, windowMat, glassMat, steelMat, crownMat, glowMat, beaconMat];

  /* ---------------- 建模 ---------------- */

  const B = {
    stone: [], window: [], glass: [], steel: [], crown: [], glow: [],
    pilasters: [], beacons: []
  };

  buildEmpireState(B);
  buildChrysler(B);
  buildWtc(B);
  const flat = buildFlatiron(B, plan);

  /* ---------------- 合并为 6 个 drawcall ---------------- */

  let triangles = 0;
  const meshes = [
    mergeBucket(B.stone, stoneMat, 'landmark-stone'),
    mergeBucket(B.window, windowMat, 'landmark-window'),
    mergeBucket(B.glass, glassMat, 'landmark-glass'),
    mergeBucket(B.steel, steelMat, 'landmark-steel'),
    mergeBucket(B.crown, crownMat, 'landmark-crown'),
    mergeBucket(B.glow, glowMat, 'landmark-glow')
  ];
  for (const m of meshes) {
    if (!m) continue;
    triangles += triCount(m.geometry);
    root.add(m);
  }

  /* ---------------- 竖向壁柱（InstancedMesh） ---------------- */

  let pilasterMesh = null;
  if (B.pilasters.length > 0) {
    const pg = new THREE.BoxGeometry(1, 1, 1);
    const puv = pg.attributes.uv;
    // 单位盒的 UV 是 0..1，这里压成"细高条"，让石纹在壁柱上竖向重复约 6 次
    for (let i = 0; i < puv.count; i++) puv.setXY(i, puv.getX(i) * 0.32, puv.getY(i) * 6);
    puv.needsUpdate = true;
    paintGeometry(pg, 0xffffff);

    pilasterMesh = new THREE.InstancedMesh(pg, stoneMat, B.pilasters.length);
    pilasterMesh.name = 'landmark-pilasters';
    for (let i = 0; i < B.pilasters.length; i++) {
      const p = B.pilasters[i];
      _mat4.makeScale(p.sx, p.sy, p.sz);
      _mat4.setPosition(p.x, p.y, p.z);
      pilasterMesh.setMatrixAt(i, _mat4);
      pilasterMesh.setColorAt(i, _color.set(p.c));
    }
    pilasterMesh.instanceMatrix.needsUpdate = true;
    if (pilasterMesh.instanceColor) pilasterMesh.instanceColor.needsUpdate = true;
    pilasterMesh.computeBoundingSphere();
    triangles += triCount(pg) * B.pilasters.length;
    root.add(pilasterMesh);
  }

  /* ---------------- 航空障碍灯（InstancedMesh） ---------------- */

  const beaconData = B.beacons.slice();
  let beaconMesh = null;
  if (beaconData.length > 0) {
    const bg = new THREE.IcosahedronGeometry(1.25, 1);
    beaconMesh = new THREE.InstancedMesh(bg, beaconMat, beaconData.length);
    beaconMesh.name = 'landmark-beacons';
    beaconMesh.castShadow = false;
    for (let i = 0; i < beaconData.length; i++) {
      const b = beaconData[i];
      _mat4.makeTranslation(b.x, b.y, b.z);
      beaconMesh.setMatrixAt(i, _mat4);
      beaconMesh.setColorAt(i, _color.setRGB(0.35, 0.03, 0.02));
    }
    beaconMesh.instanceMatrix.needsUpdate = true;
    if (beaconMesh.instanceColor) beaconMesh.instanceColor.needsUpdate = true;
    beaconMesh.computeBoundingSphere();
    triangles += triCount(bg) * beaconData.length;
    root.add(beaconMesh);
  }

  /* ---------------- 帝国大厦塔冠彩色泛光灯 ---------------- */

  // 常驻场景、只改 intensity：一旦 visible 切换会改变 numPointLights，
  // 导致全场景材质重新编译着色器（掉帧），务必不要在 update 里开关它。
  const crownLight = new THREE.PointLight(CROWN_COLORS.clear, 0, 300, 2);
  crownLight.name = 'esb-crown-light';
  crownLight.position.set(ESB.x, 348, ESB.z);
  crownLight.castShadow = false;
  root.add(crownLight);

  /* ---------------- 高建筑登记（供闪电模块打击） ---------------- */

  if (Array.isArray(opts.tallStructures)) {
    opts.tallStructures.push(
      { x: ESB.x, y: ESB.top, z: ESB.z, name: '帝国大厦' },
      { x: CHR.x, y: CHR.top, z: CHR.z, name: '克莱斯勒大厦' },
      { x: WTC.x, y: WTC.top, z: WTC.z, name: '世贸中心一号楼' },
      { x: flat.x, y: FLAT.height, z: flat.z, name: '熨斗大厦' }
    );
  }

  /* ---------------- 占用地块（供 main.js / buildings 排除） ---------------- */

  const occupiedLots = [];
  if (flat.lotId) occupiedLots.push(flat.lotId);
  if (plan && Array.isArray(plan.blocks)) {
    for (const block of plan.blocks) {
      if (!block || !Array.isArray(block.lots)) continue;
      for (const lot of block.lots) {
        for (const zone of LANDMARK_LOTS_HINT) {
          const dx = lot.centerX - zone.x;
          const dz = lot.centerZ - zone.z;
          if (dx * dx + dz * dz <= zone.radius * zone.radius) {
            occupiedLots.push(String(lot.id));
            break;
          }
        }
      }
    }
  }

  /* ---------------- 每帧更新 ---------------- */

  const crownTarget = new THREE.Color(CROWN_COLORS.clear);
  const crownAccent = new THREE.Color(CROWN_ACCENT);
  const crownScratch = new THREE.Color();

  /**
   * 每帧更新：窗户/幕墙夜间自发光、塔冠彩色泛光、天线航空障碍灯闪烁。
   * 只写材质标量与少量实例色，不新建对象、不重建几何。
   * @param {Object} ctx FrameContext（契约 §2）
   * @returns {void}
   */
  function update(ctx) {
    const night = clamp(ctx && Number.isFinite(ctx.nightFactor) ? ctx.nightFactor : 0, 0, 1);
    const t = ctx && Number.isFinite(ctx.elapsed) ? ctx.elapsed : 0;
    const dt = ctx && Number.isFinite(ctx.dt) ? clamp(ctx.dt, 0, 0.1) : 1 / 60;

    // 夜间亮灯：窗墙用暖白，玻璃幕墙稍冷且更弱（幕墙主要靠反射）
    windowMat.emissiveIntensity = night * 1.25;
    glassMat.emissiveIntensity = night * 0.5;
    glowMat.emissiveIntensity = night * 2.1 + 0.04;

    // —— 塔冠彩色泛光：天气定主色，再叠加约 52s 周期的主/副色扫光 ——
    const wname = ctx && ctx.weather ? ctx.weather.current : 'clear';
    const base = CROWN_COLORS[wname] === undefined ? CROWN_COLORS.clear : CROWN_COLORS[wname];
    crownScratch.set(base);
    crownScratch.lerp(crownAccent, (0.5 + 0.5 * Math.sin(t * 0.12)) * 0.38);
    crownTarget.setRGB(
      damp(crownTarget.r, crownScratch.r, 0.85, dt),
      damp(crownTarget.g, crownScratch.g, 0.85, dt),
      damp(crownTarget.b, crownScratch.b, 0.85, dt)
    );
    crownMat.emissive.copy(crownTarget);
    crownMat.emissiveIntensity = night * 2.7;
    crownLight.color.copy(crownTarget);
    crownLight.intensity = night * 3600;

    // —— 航空障碍灯：各自独立周期与占空比，红光闪烁 ——
    if (beaconMesh && beaconMesh.instanceColor) {
      const ic = beaconMesh.instanceColor;
      for (let i = 0; i < beaconData.length; i++) {
        const b = beaconData[i];
        const phase = (t / b.period + b.phase) % 1;
        const k = phase < b.duty ? 1 : 0.055;
        ic.setXYZ(i, 2.6 * k, 0.16 * k, 0.12 * k);
      }
      ic.needsUpdate = true;
    }
  }

  /**
   * 释放本模块自建的 geometry / material / texture。
   * `ctx0.textures` 里的共享贴图由 `core/textures.js` 统一释放，这里只放自己的克隆体。
   * @returns {void}
   */
  function dispose() {
    root.traverse((obj) => {
      if ((obj.isMesh || obj.isInstancedMesh) && obj.geometry) obj.geometry.dispose();
      if (obj.isInstancedMesh && typeof obj.dispose === 'function') obj.dispose();
    });
    for (const m of materials) m.dispose();
    for (const t of ownedTextures) t.dispose();
    ownedTextures.length = 0;
    beaconData.length = 0;
    root.clear();
  }

  const drawCalls = meshes.filter(Boolean).length + (pilasterMesh ? 1 : 0) + (beaconMesh ? 1 : 0);

  return {
    object3D: root,
    update,
    dispose,
    occupiedLots,
    stats: {
      instances: (pilasterMesh ? pilasterMesh.count : 0) + (beaconMesh ? beaconMesh.count : 0),
      draws: drawCalls,
      landmarks: 4,
      triangles: Math.round(triangles)
    }
  };
}
