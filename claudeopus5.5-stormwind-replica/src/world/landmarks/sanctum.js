// 巫师圣所：法师区广场中央的白石圆塔（紫瓦尖顶 + 金尖饰）。
// 塔基环墙 24 段（东侧开门，门洞与碰撞同源）→ 底层圆形法师书房可进入；塔身两道发光符文带、
// 34 m 处一圈悬挑环廊、一座侧边小楼梯塔、细长紫锥 + 老虎窗 + 顶部旋转光环与辉光；10 枚漂浮紫水晶（InstancedMesh，update 里绕塔缓转 + 上下浮动）；
// 广场地面一圈发光奥术法阵 + 六根符文石柱。
import * as THREE from 'three';
import { cylGeo, coneGeo } from '../../core/geom.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ringWall, ringOfBoxes, archBandGeo, archPaneGeo, booksTexture, trs, finishInto } from './kit.js';

const mergeTwo = (a, b) => mergeGeometries([a, b], false);

const BASE_H = 12; // 塔基环墙高（底层法师书房）
const SHAFT_TOP = 50; // 塔身顶：约民居总高（≈14 m）的 3.5 倍
const SHAFT_R0 = 7.0; // 塔身底半径（塔基 R=10 之上明显收细）
const SHAFT_R1 = 5.9; // 塔身顶半径
const CONE_R = 7.0; // 紫锥底半径
const CONE_H = 26; // 细长紫锥（顶 ≈ 77 m）
const GALLERY_Y = 34; // 悬挑环廊高度
const GALLERY_R = 9.2; // 环廊外沿半径

export function buildSanctum(ctx, shared) {
  const { mat: M, coords: C } = ctx;
  const L = C.LANDMARKS.sanctum;
  const [cx, cz] = L.center;
  const R = L.radius;
  const DOOR_A = Math.PI / 2; // 门朝东（面向贸易区方向）

  const B = shared.B; // 外观几何并入模块级合批 Builder（index.js 统一 finish）

  // ---------- 塔基：环墙 + 门 ----------
  ringWall(B, M.stoneWhite, cx, 0, cz, R - 0.6, 1.2, BASE_H, 24, { gaps: [{ a: DOOR_A, n: 2, lintel: 5 }] });
  B.add(M.stoneTrim, cylGeo(R + 0.25, 0.6, 32), trs(cx, BASE_H - 0.3, cz));
  B.add(M.stoneTrim, cylGeo(R + 0.12, 0.4, 32), trs(cx, 5.4, cz));
  B.add(M.arcane, new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.45, 40, 1, true), trs(cx, 8.3, cz));
  // 门框（石 + 金）与门前两盏奥术灯柱
  {
    const f = B.frame(cx + R - 0.02, 0, cz, DOOR_A);
    f.add(M.stoneTrim, archBandGeo(6.2, 4.7, 5, 'rect', 0.5), null);
    f.add(M.gold, archBandGeo(4.95, 4.7, 5, 'rect', 0.56), null);
    f.add(M.arcane, archPaneGeo(1.2, 5.6, 6.4, 'pointed'), trs(0, 0, 0.3));
    for (const s of [-1, 1]) {
      f.box(M.stoneTrim, s * 4.2, 0, 2.2, 0.9, 2.6, 0.9);
      f.add(M.arcane, new THREE.OctahedronGeometry(0.42, 0), trs(s * 4.2, 3.1, 2.2, 0, 0, 0, 1, 1.6, 1));
    }
  }
  // 塔基外贴的尖窗（发光紫玻璃）
  for (let i = 0; i < 6; i++) {
    const a = DOOR_A + Math.PI / 3 + (i / 6) * Math.PI * 2 + Math.PI / 24; // 对准环墙分段中心，玻璃贴平墙面
    if (Math.abs(Math.atan2(Math.sin(a - DOOR_A), Math.cos(a - DOOR_A))) < 0.5) continue;
    B.add(M.arcane, archPaneGeo(1.2, 6.2, 8.0, 'pointed'), trs(cx + Math.sin(a) * (R + 0.03), 0, cz + Math.cos(a) * (R + 0.03), 0, a));
  }

  // ---------- 塔身（细高，≈ 民居 3.5 倍）+ 符文带 + 悬挑环廊 + 冠 + 细长紫锥 ----------
  const rAt = (y) => SHAFT_R0 - ((SHAFT_R0 - SHAFT_R1) * (y - BASE_H)) / (SHAFT_TOP - BASE_H);
  B.add(M.stoneWhite, cylGeo(SHAFT_R0, SHAFT_TOP - BASE_H, 28, SHAFT_R1), trs(cx, BASE_H, cz));
  B.add(M.stoneTrim, cylGeo(R + 0.6, 0.7, 32, R + 0.2), trs(cx, BASE_H, cz)); // 塔基顶 = 一层阳台
  ringOfBoxes(B, M.stoneWhite, cx, BASE_H + 0.7, cz, R + 0.35, 22, 0.8, 0.9, 0.4);
  for (const y of [20, 27, 41, 46.5]) {
    const r = rAt(y) + 0.04;
    B.add(M.arcane, new THREE.CylinderGeometry(r, r, 0.55, 40, 1, true), trs(cx, y, cz));
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    for (const y0 of [15, 22.5, 37.5, 42.5]) {
      const rr = rAt(y0 + 1.6) + 0.03;
      B.add(M.arcane, archPaneGeo(1.0, y0, y0 + 2.4, 'pointed'), trs(cx + Math.sin(a) * rr, 0, cz + Math.cos(a) * rr, 0, a));
    }
  }
  // 悬挑环廊（y≈34）：外撇的挑檐底 + 牛腿 + 栏杆 + 发光檐口
  {
    const gy = GALLERY_Y;
    B.add(M.stoneTrim, cylGeo(rAt(gy) - 0.3, 1.3, 32, GALLERY_R), trs(cx, gy - 1.3, cz));
    ringOfBoxes(B, M.stoneTrim, cx, gy - 3.0, cz, rAt(gy) + 0.6, 16, 0.5, 1.8, 1.4);
    B.add(M.arcane, new THREE.CylinderGeometry(GALLERY_R + 0.03, GALLERY_R + 0.03, 0.25, 48, 1, true), trs(cx, gy - 0.2, cz));
    ringOfBoxes(B, M.stoneWhite, cx, gy, cz, GALLERY_R - 0.3, 40, 0.22, 1.0, 0.22);
    B.add(M.stoneTrim, new THREE.TorusGeometry(GALLERY_R - 0.3, 0.1, 5, 56), trs(cx, gy + 1.05, cz, Math.PI / 2));
    B.add(M.gold, new THREE.TorusGeometry(GALLERY_R - 0.3, 0.05, 4, 56), trs(cx, gy + 0.5, cz, Math.PI / 2));
  }
  B.add(M.stoneTrim, cylGeo(SHAFT_R1, 1.4, 28, SHAFT_R1 + 1.2), trs(cx, SHAFT_TOP, cz));
  ringOfBoxes(B, M.stoneWhite, cx, SHAFT_TOP + 1.4, cz, SHAFT_R1 + 0.9, 14, 0.8, 1.0, 0.4);
  B.add(M.roofPurple, coneGeo(CONE_R, CONE_H, 28), trs(cx, SHAFT_TOP + 1.3, cz));
  const tip = SHAFT_TOP + 1.3 + CONE_H;
  B.add(M.gold, new THREE.SphereGeometry(0.75, 10, 8), trs(cx, tip, cz));
  B.add(M.gold, coneGeo(0.22, 4.2, 6), trs(cx, tip + 0.4, cz));
  B.add(M.gold, new THREE.TorusGeometry(1.0, 0.1, 5, 18), trs(cx, tip + 1.8, cz));
  // 尖顶老虎窗 ×4
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const y = SHAFT_TOP + 3.2;
    const rc = CONE_R * (1 - (y + 1 - SHAFT_TOP - 1.3) / CONE_H) - 0.5;
    const f = B.frame(cx + Math.sin(a) * rc, y, cz + Math.cos(a) * rc, a);
    f.box(M.stoneWhite, 0, 0, 0, 1.2, 1.8, 1.6, { collide: false });
    f.add(M.arcane, archPaneGeo(0.6, 0.25, 1.15, 'round'), trs(0, 0, 0.82));
    f.add(M.roofPurple, coneGeo(1.0, 1.8, 4).rotateY(Math.PI / 4), trs(0, 1.8, 0));
  }
  // 侧边细高楼梯塔
  {
    const a = -Math.PI * 0.72;
    const tx = cx + Math.sin(a) * (R + 1.4);
    const tz = cz + Math.cos(a) * (R + 1.4);
    B.add(M.stoneWhite, cylGeo(2.6, 40, 14, 2.3), trs(tx, 0, tz));
    B.collider(tx, 0, tz, 3.6, 40, 3.6);
    B.add(M.stoneTrim, cylGeo(2.4, 0.8, 14, 2.9), trs(tx, 40, tz));
    for (const y of [22, 32]) B.add(M.arcane, new THREE.CylinderGeometry(2.62 - (y / 40) * 0.3, 2.62 - (y / 40) * 0.3, 0.4, 20, 1, true), trs(tx, y, tz));
    B.add(M.roofPurple, coneGeo(3.0, 12, 14), trs(tx, 40.8, tz));
    B.add(M.gold, new THREE.SphereGeometry(0.35, 8, 6), trs(tx, 52.8, tz));
  }

  // ---------- 广场奥术法阵 ----------
  const ringGeo = (r0, r1, seg = 64) => {
    const g = new THREE.RingGeometry(r0, r1, seg).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) g.attributes.uv.setXY(i, p.getX(i), p.getZ(i));
    return g;
  };
  B.add(M.stoneTrim, ringGeo(R + 0.1, 17.6), trs(cx, 0.025, cz));
  B.add(M.arcane, ringGeo(13.6, 14.1), trs(cx, 0.045, cz));
  B.add(M.arcane, ringGeo(16.6, 16.9), trs(cx, 0.045, cz));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 15.35;
    const k = i % 3;
    B.box(M.arcane, cx + Math.sin(a) * r, 0.03, cz + Math.cos(a) * r, k === 0 ? 0.9 : 0.35, 0.03, k === 1 ? 1.1 : 0.5, { ry: a + (k === 2 ? 0.7 : 0), collide: false });
  }
  // 六芒连线
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / 3;
    const [x0, z0] = [Math.sin(a0) * 13.85, Math.cos(a0) * 13.85];
    const [x1, z1] = [Math.sin(a1) * 13.85, Math.cos(a1) * 13.85];
    const len = Math.hypot(x1 - x0, z1 - z0);
    B.box(M.arcane, cx + (x0 + x1) / 2, 0.035, cz + (z0 + z1) / 2, len, 0.02, 0.18, { ry: Math.atan2(-(z1 - z0), x1 - x0), collide: false });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2; // 相位 0：东侧门轴（π/2）落在两根石柱之间
    const x = cx + Math.sin(a) * 18.6;
    const z = cz + Math.cos(a) * 18.6;
    B.box(M.stoneWhite, x, 0, z, 1.1, 3.2, 1.1, { ry: a });
    B.add(M.stoneTrim, coneGeo(0.8, 0.8, 4).rotateY(Math.PI / 4), trs(x, 3.2, z, 0, a));
    B.add(M.arcane, new THREE.OctahedronGeometry(0.35, 0), trs(x, 4.6, z, 0, 0, 0, 1, 1.7, 1));
  }
  B.collider(cx, 7, cz, 12, 0.3, 12); // 底层天花（室内判定）


  // ---------- 漂浮水晶 ----------
  const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), M.arcane, 10);
  crystals.name = '圣所漂浮水晶';
  crystals.frustumCulled = false;
  shared.root.add(crystals);
  const seeds = Array.from({ length: 10 }, (_, i) => ({ a: (i / 10) * Math.PI * 2, y: 17 + ((i * 7) % 10) * 3.0, r: R + 3.2 + (i % 2) * 2.0, s: 0.8 + (i % 3) * 0.3 }));
  // 顶部奥术光晕：两道绕尖顶旋转的光环 + 加色辉光球
  const haloGeo = new THREE.TorusGeometry(2.6, 0.12, 6, 40).rotateX(Math.PI / 2);
  const halo2 = new THREE.TorusGeometry(3.6, 0.08, 6, 48).rotateX(Math.PI / 2 + 0.5);
  const halo = new THREE.Mesh(mergeTwo(haloGeo, halo2), M.arcane);
  halo.position.set(cx, SHAFT_TOP + 1.3 + CONE_H - 5, cz);
  halo.name = '圣所奥术光环';
  shared.root.add(halo);
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xb68cff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, name: 'lmArcaneGlow' });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(4.2, 18, 12), glowMat);
  glow.position.set(cx, SHAFT_TOP + 1.3 + CONE_H + 1, cz);
  glow.name = '圣所顶部辉光';
  shared.root.add(glow);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();

  // ---------- 底层室内（距离 LOD）----------
  const orb = buildSanctumInterior(ctx, cx, cz, R, DOOR_A);
  ctx.hollowCount += 1;

  return (dt, t) => {
    for (let i = 0; i < seeds.length; i++) {
      const sd = seeds[i];
      const a = sd.a + t * 0.12;
      v.set(cx + Math.sin(a) * sd.r, sd.y + Math.sin(t * 0.9 + i * 1.7) * 0.8, cz + Math.cos(a) * sd.r);
      q.setFromEuler(e.set(0, t * 0.7 + i, 0.15 * Math.sin(t + i)));
      sc.set(sd.s, sd.s * 2.3, sd.s);
      crystals.setMatrixAt(i, m4.compose(v, q, sc));
    }
    crystals.instanceMatrix.needsUpdate = true;
    halo.rotation.set(Math.sin(t * 0.4) * 0.25, t * 0.5, Math.cos(t * 0.33) * 0.2);
    glowMat.opacity = 0.18 + 0.07 * Math.sin(t * 1.7);
    if (orb.parent?.visible) {
      orb.position.y = 1.9 + Math.sin(t * 1.6) * 0.15;
      orb.rotation.y = t * 0.8;
      orb.scale.setScalar(1 + Math.sin(t * 3.1) * 0.05);
    }
  };
}

function buildSanctumInterior(ctx, cx, cz, R, doorA) {
  const { mat: M } = ctx;
  const gi = new THREE.Group();
  gi.name = '巫师圣所·底层';
  ctx.scene.add(gi);
  const B = ctx.builder({ parent: gi, tag: 'sanctum-interior', chunk: 1000 });
  const ri = R - 1.2; // 内壁半径
  // 地面、天花
  const disc = (r, y, mat) => {
    const g = new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) g.attributes.uv.setXY(i, p.getX(i), p.getZ(i));
    B.add(mat, g, trs(cx, y, cz));
  };
  disc(ri + 0.1, 0.02, M.plaza);
  B.add(M.stoneTrim, cylGeo(ri + 0.1, 0.3, 32), trs(cx, 7, cz));
  B.add(M.timber, cylGeo(0.6, 0.6, 12), trs(cx, 6.4, cz));
  for (let i = 0; i < 6; i++) B.box(M.timber, cx, 6.55, cz, ri * 2, 0.4, 0.35, { ry: (i / 6) * Math.PI, collide: false });
  // 地面法阵
  const ring = (r0, r1, y) => {
    const g = new THREE.RingGeometry(r0, r1, 48).rotateX(-Math.PI / 2);
    B.add(M.arcane, g, trs(cx, y, cz));
  };
  ring(2.6, 2.8, 0.035);
  ring(3.6, 3.75, 0.035);
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 4) / 5;
    const [x0, z0] = [Math.sin(a0) * 2.7, Math.cos(a0) * 2.7];
    const [x1, z1] = [Math.sin(a1) * 2.7, Math.cos(a1) * 2.7];
    B.box(M.arcane, cx + (x0 + x1) / 2, 0.03, cz + (z0 + z1) / 2, Math.hypot(x1 - x0, z1 - z0), 0.02, 0.1, { ry: Math.atan2(-(z1 - z0), x1 - x0), collide: false });
  }
  // 中央石座 + 漂浮法球
  B.box(M.stoneTrim, cx, 0, cz, 1.2, 0.9, 1.2, { ry: Math.PI / 4 });
  B.add(M.gold, cylGeo(0.75, 0.12, 12), trs(cx, 0.9, cz));
  // 书架：沿内壁一圈（避开门）
  const books = new THREE.MeshStandardMaterial({ map: booksTexture(ctx.rng('lm:books')), roughness: 0.9, name: 'lmBooks' });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = doorA + 0.75 + (i / (n - 1)) * (Math.PI * 2 - 1.5);
    const f = B.frame(cx + Math.sin(a) * (ri - 0.32), 0, cz + Math.cos(a) * (ri - 0.32), a);
    f.box(M.timber, 0, 0, 0, 2.4, 3.2, 0.6);
    f.add(books, new THREE.PlaneGeometry(2.25, 3.0).rotateY(Math.PI), trs(0, 1.55, -0.31));
  }
  // 书桌 + 椅 + 摊开的书 + 地球仪
  {
    const a = doorA + Math.PI * 0.75;
    const f = B.frame(cx + Math.sin(a) * 5.2, 0, cz + Math.cos(a) * 5.2, a);
    f.box(M.planks, 0, 0.75, 0, 2.2, 0.1, 1.0, { collide: false });
    for (const [x, z] of [[-1, -0.4], [1, -0.4], [-1, 0.4], [1, 0.4]]) f.box(M.timber, x, 0, z, 0.1, 0.75, 0.1, { collide: false });
    f.collider(0, 0, 0, 2.2, 0.85, 1.0);
    f.box(M.fabricRed, -0.3, 0.85, 0, 0.7, 0.04, 0.5, { collide: false });
    f.add(M.arcane, new THREE.SphereGeometry(0.22, 10, 8), trs(0.6, 1.1, 0));
    f.add(M.gold, new THREE.TorusGeometry(0.28, 0.02, 4, 16), trs(0.6, 1.1, 0, 0.4));
    f.box(M.planks, 0, 0.45, -1.0, 0.6, 0.06, 0.6, { collide: false });
    f.box(M.planks, 0, 0.45, -1.3, 0.6, 0.6, 0.06, { collide: false });
  }
  finishInto(B, { noShadow: [M.arcane, M.gold] });

  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 2), M.arcane);
  orb.position.set(cx, 1.9, cz);
  orb.name = '奥术法球';
  gi.add(orb);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.03, 4, 24), M.gold);
  halo.rotation.x = Math.PI / 2;
  orb.add(halo);
  ctx.lights.add({ x: cx, y: 2.6, z: cz, color: 0xb07cff, intensity: 1.4, range: 14, kind: 'arcane', flicker: false });
  ctx.lights.add({ x: cx + R + 3, y: 3.6, z: cz, color: 0xb07cff, intensity: 0.7, range: 12, kind: 'arcane', nightOnly: true });
  ctx.interiors.add(gi, cx, cz, 50);
  return orb;
}
