// 大教堂广场的场所家具：放射 + 回字纹铺装（canvas 现画、盖在地形铺装上的一层薄板）、
// 围着圣光喷泉的长椅、中轴两侧与四周的灯柱阵列、广场边缘的花箱。
import * as THREE from 'three';
import { cylGeo, coneGeo } from '../../core/geom.js';
import { trs, ringWall, gableRoof } from './kit.js';

// 铺装图案：中心放射星形 + 同心圆 + 三重回字边框，贴图按广场长宽比画（1 像素 ≈ 0.11 m）
function plazaTexture(W, D) {
  const px = 1024;
  const py = Math.round((px * D) / W);
  const c = document.createElement('canvas');
  c.width = px;
  c.height = py;
  const g = c.getContext('2d');
  const k = px / W; // 像素 / 米
  g.fillStyle = '#d9d2c3';
  g.fillRect(0, 0, px, py);
  // 石板缝（1.5 m 方格，略有色差）
  for (let x = 0; x < W; x += 1.5) {
    for (let y = 0; y < D; y += 1.5) {
      const v = 200 + ((x * 7 + y * 13) % 5) * 5;
      g.fillStyle = `rgb(${v + 14},${v + 8},${v - 6})`;
      g.fillRect(x * k + 1, y * k + 1, 1.5 * k - 2, 1.5 * k - 2);
    }
  }
  const cx = px / 2;
  const cy = py / 2;
  // 回字纹：三重深色石带
  for (const [m, w, col] of [[1.2, 1.4, '#7d8796'], [4.2, 0.8, '#9aa3ae'], [7.0, 0.5, '#b49a5a']]) {
    g.strokeStyle = col;
    g.lineWidth = w * k;
    g.strokeRect(m * k, m * k, px - 2 * m * k, py - 2 * m * k);
  }
  // 同心圆 + 放射星
  const ring = (r, w, col) => {
    g.strokeStyle = col;
    g.lineWidth = w * k;
    g.beginPath();
    g.arc(cx, cy, r * k, 0, Math.PI * 2);
    g.stroke();
  };
  g.fillStyle = '#c9bea8';
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2;
    const r0 = 9.5;
    const r1 = i % 2 ? 17 : 23;
    g.beginPath();
    g.moveTo(cx + Math.cos(a0 - 0.07) * r0 * k, cy + Math.sin(a0 - 0.07) * r0 * k);
    g.lineTo(cx + Math.cos(a0) * r1 * k, cy + Math.sin(a0) * r1 * k);
    g.lineTo(cx + Math.cos(a0 + 0.07) * r0 * k, cy + Math.sin(a0 + 0.07) * r0 * k);
    g.closePath();
    g.fill();
  }
  ring(9.3, 0.45, '#bfb39c');
  ring(13.5, 0.35, '#b49a5a');
  ring(23.6, 0.4, '#c4b8a0'); // 浅暖色细石带：深色宽带在斜视角下会被读成一道阴影
  ring(25, 0.3, '#b49a5a');
  // 中轴通向大教堂的引道（北 = 画布上方）
  g.fillStyle = 'rgba(125,135,150,0.55)';
  g.fillRect(cx - 3 * k, 0, 0.5 * k, cy - 24 * k);
  g.fillRect(cx + 2.5 * k, 0, 0.5 * k, cy - 24 * k);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildCathedralPlaza(ctx, shared) {
  const { mat: M, coords: C } = ctx;
  const [x0, z0, x1, z1] = C.DISTRICTS.cathedral.plaza.rect;
  const W = x1 - x0;
  const D = z1 - z0;
  const pcx = (x0 + x1) / 2;
  const pcz = (z0 + z1) / 2;
  const B = shared.B;

  // 图案薄板（UV 0..1 铺满整块广场；canvas 的上方 = 北 = -z）
  const mat = new THREE.MeshStandardMaterial({ map: plazaTexture(W, D), roughness: 0.9, name: 'lmPlazaPattern', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  shared.plazaMat = mat;
  const g = new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2);
  B.add(mat, g, trs(pcx, 0.025, pcz));

  // 长椅：围喷泉一圈（面朝喷泉，避开南北中轴）
  const [fx, fz] = C.LANDMARKS.cathedralStatue.center;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    if (Math.abs(Math.sin(a)) < 0.3) continue; // 中轴（x = fx）两侧留出通道
    bench(B, M, fx + Math.sin(a) * 17, fz + Math.cos(a) * 17, a);
  }
  // 灯柱阵列：中轴两侧（喷泉 → 大教堂台阶）+ 广场东西两边
  const lamps = [];
  for (const z of [-134, -141, -148]) for (const s of [-1, 1]) lamps.push([pcx + s * 7, z]);
  for (let z = z0 + 6; z <= z1 - 6; z += 11) for (const x of [x0 + 2.5, x1 - 2.5]) lamps.push([x, z]);
  for (let x = x0 + 14; x <= x1 - 14; x += 14) if (Math.abs(x - pcx) > 8) lamps.push([x, z1 - 2.5]);
  lamps.forEach(([x, z], i) => {
    lampPost(B, M, x, z);
    if (i % 2 === 0) ctx.lights.add({ x, y: 4.2, z, kind: 'lamp', intensity: 1, nightOnly: true });
  });
  // 花箱：沿南边、东西两边
  for (let x = x0 + 7; x <= x1 - 7; x += 14) if (Math.abs(x - pcx) > 10) planter(B, M, shared, x, z1 - 5.5, 0);
  for (let z = z0 + 11.5; z <= z1 - 11; z += 11) for (const x of [x0 + 5.5, x1 - 5.5]) planter(B, M, shared, x, z, Math.PI / 2);
}

function bench(B, M, x, z, a) {
  const f = B.frame(x, 0, z, a);
  f.box(M.planks, 0, 0.42, 0, 2.6, 0.08, 0.55, { collide: false });
  f.box(M.planks, 0, 0.5, 0.3, 2.6, 0.5, 0.07, { collide: false });
  for (const sx of [-1.05, 1.05]) f.box(M.stoneTrim, sx, 0, 0.05, 0.22, 0.45, 0.6, { collide: false });
  f.collider(0, 0, 0.05, 2.6, 1.0, 0.65);
}

function lampPost(B, M, x, z) {
  B.box(M.stoneGrey, x, 0, z, 0.55, 0.4, 0.55);
  B.add(M.iron, cylGeo(0.09, 3.6, 6, 0.07), trs(x, 0.4, z));
  B.add(M.iron, cylGeo(0.26, 0.12, 6), trs(x, 3.95, z));
  B.add(M.lampGlow, new THREE.BoxGeometry(0.34, 0.5, 0.34), trs(x, 4.32, z));
  B.add(M.iron, coneGeo(0.32, 0.4, 4).rotateY(Math.PI / 4), trs(x, 4.57, z));
  B.add(M.gold, new THREE.SphereGeometry(0.07, 5, 4), trs(x, 5.0, z));
}

function planter(B, M, shared, x, z, ry) {
  const f = B.frame(x, 0, z, ry);
  f.box(M.stoneTrim, 0, 0, 0, 3.2, 0.7, 1.2);
  f.box(shared.flowers, 0, 0.7, 0, 2.9, 0.08, 0.9, { collide: false });
  for (const sx of [-0.9, 0, 0.9]) f.add(M.leaves, new THREE.IcosahedronGeometry(0.42, 1), trs(sx, 1.05, 0, 0, 0, 0, 1, 0.85, 1));
}

// 旧城区广场：中央一口带小坡顶的石井、北侧一座老兵小雕像、四周长椅
export function buildOldtownSquare(ctx, shared) {
  const { mat: M, coords: C } = ctx;
  const [x0, z0, x1, z1] = C.DISTRICTS.oldtown.plaza.rect;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const B = shared.B;
  // 石井：井圈（带碰撞）+ 井水 + 木架 + 小坡顶 + 辘轳与水桶
  ringWall(B, M.stoneGrey, cx, 0, cz, 1.35, 0.45, 0.85, 20);
  B.add(M.stoneTrim, new THREE.TorusGeometry(1.35, 0.26, 6, 28), trs(cx, 0.86, cz, Math.PI / 2));
  B.add(shared.water, new THREE.CircleGeometry(1.1, 20).rotateX(-Math.PI / 2), trs(cx, 0.35, cz));
  for (const s of [-1, 1]) B.box(M.timber, cx + s * 1.25, 0.8, cz, 0.2, 2.2, 0.2, { collide: false });
  B.box(M.timber, cx, 2.6, cz, 2.9, 0.18, 0.18, { collide: false });
  B.add(M.timber, new THREE.CylinderGeometry(0.16, 0.16, 1.4, 8).rotateZ(Math.PI / 2), trs(cx, 2.3, cz));
  B.add(M.iron, new THREE.CylinderGeometry(0.2, 0.16, 0.35, 8), trs(cx + 0.2, 1.4, cz));
  for (const g of gableRoof(3.2, 2.4, 1.0, 0.25, 0.12)) B.add(M.roofBlue, g, trs(cx, 2.85, cz));
  // 小雕像：方座 + 持盾老兵
  const sx = cx;
  const sz = z0 + 6;
  B.box(M.stoneTrim, sx, 0, sz, 2.6, 0.5, 2.6);
  B.box(M.stoneGrey, sx, 0.5, sz, 1.8, 1.6, 1.8);
  B.box(M.gold, sx, 1.4, sz + 0.91, 1.0, 0.4, 0.02, { collide: false });
  const f = B.frame(sx, 2.1, sz, 0);
  f.add(M.statue, cylGeo(0.55, 1.5, 10, 0.38), null);
  f.add(M.statue, cylGeo(0.38, 0.7, 10, 0.32), trs(0, 1.5, 0));
  f.add(M.statue, new THREE.SphereGeometry(0.26, 10, 8), trs(0, 2.45, 0));
  f.add(M.statue, new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12).rotateX(Math.PI / 2), trs(-0.45, 1.6, 0.25, 0, -0.4));
  f.add(M.statue, new THREE.BoxGeometry(0.08, 2.4, 0.08), trs(0.5, 1.6, 0.1));
  // 长椅：四面朝井
  for (const [x, z, a] of [[cx - 8, cz, -Math.PI / 2], [cx + 8, cz, Math.PI / 2], [cx - 5, cz + 9, 0], [cx + 5, cz + 9, 0], [cx - 9, z0 + 6, -Math.PI / 2], [cx + 9, z0 + 6, Math.PI / 2]]) {
    bench(B, M, x, z, a);
  }
}
