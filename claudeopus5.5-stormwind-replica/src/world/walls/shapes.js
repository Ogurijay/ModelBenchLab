// B 模块几何小工具：拱、弧墙、金字塔顶、旗帜。UV 一律按米计（旗帜除外，旗帜整张贴图）。
import * as THREE from 'three';
import { scaleUV } from '../../core/geom.js';

// 让盒子局部 +X 指向水平方向 (dx, dz) 的 ry（与 Builder / 碰撞的旋转约定一致）
export const ryFor = (dx, dz) => Math.atan2(-dz, dx);

// XY 平面多边形沿 Z 挤出，Z ∈ [-depth/2, depth/2]；ExtrudeGeometry 默认 UV 就是世界米
export function extrudeXY(pts, depth) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// 立面轮廓（X = 局部 z，Y = 高度）沿局部 x 挤出 width：桥、栈桥、拱墩都用它
export function profileAlongZ(pts, width) {
  return extrudeXY(pts, width).rotateY(-Math.PI / 2); // (X,Y,Z) → (-Z, Y, X)
}

// 半椭圆拱线：从右拱脚 (cx+rx, spring) 经拱顶到左拱脚 (cx-rx, spring)，不含端点
function arcPts(cx, spring, rx, ry, n, out) {
  for (let i = 1; i < n; i++) {
    const a = (i / n) * Math.PI;
    out.push([cx + rx * Math.cos(a), spring + ry * Math.sin(a)]);
  }
}

// 连拱立面：顶边 yt，底边 yb，openings = [[a,b],...] 为拱洞（拱顶标高 apex，矢高上限 maxRise）
export function archedProfile(x0, x1, yb, yt, openings, apex, maxRise = 7, n = 12) {
  const pts = [[x0, yb], [x0, yt], [x1, yt], [x1, yb]];
  const ops = [...openings].sort((p, q) => q[0] - p[0]); // 底边从右往左走
  for (const [a, b] of ops) {
    const rx = (b - a) / 2;
    const ry = Math.min(rx, maxRise, apex - yb);
    const spring = apex - ry;
    pts.push([b, yb]);
    if (spring > yb + 1e-3) pts.push([b, spring]);
    arcPts((a + b) / 2, spring, rx, ry, n, pts);
    if (spring > yb + 1e-3) pts.push([a, spring]);
    pts.push([a, yb]);
  }
  return pts;
}

// 均分拱洞
export function evenOpenings(x0, x1, count, pier) {
  const span = (x1 - x0 - pier * (count + 1)) / count;
  return Array.from({ length: count }, (_, i) => {
    const a = x0 + pier + i * (span + pier);
    return [a, a + span];
  });
}

// 门洞饰带（拱券）：竖边 + 半椭圆，宽 w、拱脚 spring、矢高 rise、带宽 band；底边 y=0
export function archRingPts(w, spring, rise, band, n = 14) {
  const hw = w / 2;
  const ow = hw + band;
  const pts = [[-ow, 0], [-ow, spring]];
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    pts.push([ow * Math.cos(a), spring + (rise + band) * Math.sin(a)]);
  }
  pts.push([ow, spring], [ow, 0], [hw, 0], [hw, spring]);
  arcPts(0, spring, hw, rise, n, pts);
  pts.push([-hw, spring], [-hw, 0]);
  return pts;
}

// 矩形洞口上角的拱肩填充：让碰撞是矩形、视觉是拱（拱顶要略低于洞顶 top）
export function archInfillPts(w, spring, rise, top, n = 14) {
  const hw = w / 2;
  const pts = [[-hw, spring], [-hw, top], [hw, top], [hw, spring]];
  arcPts(0, spring, hw, rise, n, pts);
  return pts;
}

// 盲拱 / 拱洞面板（矩形 + 半椭圆头），底边 y=0
export function archPanelPts(w, spring, rise, n = 12) {
  const hw = w / 2;
  const pts = [[-hw, 0], [hw, 0], [hw, spring]];
  arcPts(0, spring, hw, rise, n, pts);
  pts.push([-hw, spring]);
  return pts;
}

// 翻转三角形朝向（做弧墙内壁用）
export function flipGeo(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of ['position', 'normal', 'uv']) {
    const at = g.attributes[name];
    if (!at) continue;
    const s = at.itemSize;
    for (let t = 0; t < at.count; t += 3) {
      for (let k = 0; k < s; k++) {
        const a = at.array[(t + 1) * s + k];
        at.array[(t + 1) * s + k] = at.array[(t + 2) * s + k];
        at.array[(t + 2) * s + k] = a;
      }
    }
  }
  const n = g.attributes.normal;
  for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
  return g;
}

// 圆柱弧面（无端盖），角度约定：θ 处的点 = (r cosθ, r sinθ)（x, z），底面 y=0
export function cylArc(r, h, th0, th1, seg = 32, inner = false) {
  const len = th1 - th0;
  const n = Math.max(2, Math.ceil((seg * len) / (Math.PI * 2)));
  const g = new THREE.CylinderGeometry(r, r, h, n, 1, true, Math.PI / 2 - th1, len);
  g.translate(0, h / 2, 0);
  scaleUV(g, r * len, h);
  return inner ? flipGeo(g) : g;
}

// 四坡尖顶（底 w×d，高 h），UV 按米
export function pyramidGeo(w, d, h) {
  const hw = w / 2;
  const hd = d / 2;
  const c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
  const pos = [];
  const uv = [];
  for (let i = 0; i < 4; i++) {
    const [ax, az] = c[i];
    const [bx, bz] = c[(i + 1) % 4];
    const len = Math.hypot(bx - ax, bz - az);
    const sl = Math.hypot(Math.hypot((ax + bx) / 2, (az + bz) / 2), h);
    pos.push(bx, 0, bz, ax, 0, az, 0, h, 0);
    uv.push(0, 0, len, 0, len / 2, sl);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// 旗帜：上方 w×w 方块用整张纹章贴图，下方燕尾用纯蓝区域；挂点在 y=0，向下垂 h，面朝 +Z
export function bannerGeo(w, h) {
  const hw = w / 2;
  const notch = Math.min(1.4, (h - w) * 0.45);
  const pos = [];
  const uv = [];
  const tri = (pts, uvs) => {
    for (const p of pts) pos.push(p[0], p[1], 0);
    for (const t of uvs) uv.push(t[0], t[1]);
  };
  const v0 = 0.06; // 去掉底部金边，方块与燕尾衔接
  tri([[-hw, -w], [hw, -w], [hw, 0]], [[0, v0], [1, v0], [1, 1]]);
  tri([[-hw, -w], [hw, 0], [-hw, 0]], [[0, v0], [1, 1], [0, 1]]);
  const B = [0.1, 0.5]; // 贴图左侧纯蓝
  const tail = [
    [[-hw, -w], [-hw, -h], [0, -h + notch]],
    [[-hw, -w], [0, -h + notch], [0, -w]],
    [[0, -w], [0, -h + notch], [hw, -h]],
    [[0, -w], [hw, -h], [hw, -w]],
  ];
  for (const t of tail) tri(t, [B, B, B]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// 平移 + 绕 Y 旋转的矩阵
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _one = new THREE.Vector3(1, 1, 1);
export function mat4(x, y, z, ry = 0, rx = 0, rz = 0) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)).clone(), _one);
}

// 直线与圆的交点参数：返回直线 o + u·t 与圆 (c, R) 相交的 [t0, t1]，不相交返回 null
export function lineCircle(ox, oz, ux, uz, cx, cz, R) {
  const dx = ox - cx;
  const dz = oz - cz;
  const b = ux * dx + uz * dz;
  const c = dx * dx + dz * dz - R * R;
  const disc = b * b - c;
  if (disc <= 0) return null;
  const s = Math.sqrt(disc);
  return [-b - s, -b + s];
}
