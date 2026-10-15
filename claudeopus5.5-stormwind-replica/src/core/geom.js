// 几何工具箱：所有构件的 UV 都按「米」计（材质 repeat = 1 / 贴图代表的米数），
// 这样城墙、屋瓦、地面贴图密度天然一致，新增构件不用单独调 repeat。
import * as THREE from 'three';

// 盒子：BoxGeometry 的 6 个面各自按真实尺寸缩放 UV
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // 面顺序：+x -x +y -y +z -z，每面 4 个顶点
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
    }
  }
  return g;
}

// 带洞口的墙：返回墙体分段（局部坐标，墙沿 +X 展开，厚度沿 Z，底边 y=0）。
// openings: [{ x(洞口中心距墙起点), y(洞底), w, h }]。洞口处不生成实体 → 几何与碰撞同源。
export function wallPieces(length, height, openings = []) {
  const ops = [...openings].sort((a, b) => a.x - b.x);
  const pieces = [];
  let cursor = 0;
  for (const o of ops) {
    const l = o.x - o.w / 2;
    const r = o.x + o.w / 2;
    if (l > cursor + 1e-3) pieces.push({ x0: cursor, x1: l, y0: 0, y1: height });
    if (o.y > 1e-3) pieces.push({ x0: l, x1: r, y0: 0, y1: o.y }); // 窗台下
    if (o.y + o.h < height - 1e-3) pieces.push({ x0: l, x1: r, y0: o.y + o.h, y1: height }); // 过梁上
    cursor = r;
  }
  if (cursor < length - 1e-3) pieces.push({ x0: cursor, x1: length, y0: 0, y1: height });
  return pieces;
}

// 双坡屋顶（无碰撞）：沿 X 方向屋脊，footprint w×d，檐口高 0，脊高 rise，出檐 over
export function gableRoofGeo(w, d, rise, over = 0.5, thick = 0.25) {
  const hw = w / 2 + over;
  const hd = d / 2 + over;
  const slope = Math.hypot(hd, rise);
  const g1 = boxGeo(hw * 2, thick, slope);
  const ang = Math.atan2(rise, hd);
  const m = new THREE.Matrix4();
  // 绕 X 转 +θ 会让 +Z 端下沉；北坡（z<0）要让靠屋脊的 +Z 端抬起，所以取 -θ，南坡相反
  const a = g1.clone().applyMatrix4(m.makeRotationX(-ang)).translate(0, rise / 2, -hd / 2);
  const b = g1.clone().applyMatrix4(m.makeRotationX(ang)).translate(0, rise / 2, hd / 2);
  return [a, b];
}

// 山墙三角（实心，用墙体材质）：宽 d、高 rise，位于 x = ±w/2
export function gableEndGeo(d, rise, thick = 0.4) {
  const s = new THREE.Shape();
  s.moveTo(-d / 2, 0);
  s.lineTo(d / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.translate(0, 0, -thick / 2);
  g.rotateY(Math.PI / 2);
  metersUV(g, 'planar-x');
  return g;
}

// 圆锥塔顶 / 圆柱塔身
export function coneGeo(r, h, seg = 16) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, true);
  g.translate(0, h / 2, 0);
  scaleUV(g, Math.PI * 2 * r, Math.hypot(r, h));
  return g;
}
export function cylGeo(r, h, seg = 16, rTop = r) {
  const g = new THREE.CylinderGeometry(rTop, r, h, seg);
  g.translate(0, h / 2, 0);
  scaleUV(g, Math.PI * 2 * r, h);
  return g;
}

export function scaleUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return g;
}

// 平面投影 UV（米）：'planar-y' 用 xz，'planar-x' 用 zy，'planar-z' 用 xy
export function metersUV(g, mode = 'planar-y') {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (mode === 'planar-y') { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else if (mode === 'planar-x') { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// 多边形挤出（顶面在 y=top，向下 depth）。poly 为 [x,z] 点列（世界坐标）；holes 为可选的洞（不能相互接触）。
export function prismGeo(poly, top, depth, holes = []) {
  const s = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // shape 的 y → -z，挤出方向 +z → +y
  g.translate(0, top - depth, 0);
  // 顶面 / 侧面统一用世界米 UV：顶面 xz，侧面按周长
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, Math.abs(n.getX(i)) > Math.abs(n.getZ(i)) ? p.getZ(i) : p.getX(i), p.getY(i));
  }
  return g;
}
