// 两座喷泉：贸易区（三层石盆）与大教堂广场（圣光雕像）。
// 石盆沿由一圈盒子围成（带碰撞，0.75 m 高于自动抬腿上限，挡住行人；跳跃可上），水面用独立克隆法线贴图的半透明材质，
// update 里法线偏移做涟漪、水面上下轻微起伏；喷水是 Points 粒子（抛体运动，落回水面就重生）。
import * as THREE from 'three';
import { cylGeo, coneGeo } from '../../core/geom.js';
import { ringWall, ringOfBoxes, trs, waterJetGeometry, waterJetMaterial } from './kit.js';

const G = 9.8;

// 简单抛体粒子：emitters = [{ x,y,z, vx,vy,vz, jitter, floor }]
function makeSpray(parent, mat, emitters, n, rng) {
  const pos = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const org = new Float32Array(n * 3);
  const age = new Float32Array(n);
  const floor = new Float32Array(n);
  const spawn = (i, stagger) => {
    const e = emitters[i % emitters.length];
    const j = e.jitter ?? 0.25;
    org[i * 3] = e.x;
    org[i * 3 + 1] = e.y;
    org[i * 3 + 2] = e.z;
    vel[i * 3] = e.vx + (rng() - 0.5) * j;
    vel[i * 3 + 1] = e.vy + (rng() - 0.5) * j;
    vel[i * 3 + 2] = e.vz + (rng() - 0.5) * j;
    floor[i] = e.floor;
    age[i] = stagger ? -rng() * 1.6 : 0;
  };
  for (let i = 0; i < n; i++) spawn(i, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = '喷泉水花';
  parent.add(pts);
  return (dt) => {
    for (let i = 0; i < n; i++) {
      age[i] += dt;
      const a = Math.max(0, age[i]);
      const k = i * 3;
      const y = org[k + 1] + vel[k + 1] * a - 0.5 * G * a * a;
      if (age[i] > 0 && y < floor[i] && vel[k + 1] - G * a < 0) {
        spawn(i, false);
        pos[k] = org[k];
        pos[k + 1] = org[k + 1];
        pos[k + 2] = org[k + 2];
        continue;
      }
      pos[k] = org[k] + vel[k] * a;
      pos[k + 1] = age[i] < 0 ? -50 : y;
      pos[k + 2] = org[k + 2] + vel[k + 2] * a;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

function discY(r, seg = 40) {
  const g = new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) g.attributes.uv.setXY(i, p.getX(i), p.getZ(i));
  return g;
}

// 公共：外圈石盆（盆沿 + 外台阶 + 盆底 + 主水面）
function basin(B, M, water, cx, cz, R) {
  ringWall(B, M.stoneTrim, cx, 0, cz, R - 0.3, 0.6, 0.75, 72); // 72 段：近看也是圆的
  B.add(M.stoneTrim, new THREE.TorusGeometry(R - 0.3, 0.34, 8, 120), trs(cx, 0.76, cz, Math.PI / 2)); // 圆润压顶（圆环，不封口）
  B.add(M.stoneGrey, cylGeo(R + 0.7, 0.16, 72), trs(cx, -0.02, cz));
  B.add(M.stoneGrey, discY(R - 0.55), trs(cx, 0.08, cz));
  B.add(water, discY(R - 0.58), trs(cx, 0.55, cz));
}

export function buildFountains(ctx, shared) {
  const { mat: M, coords: C } = ctx;
  const ups = [];
  const arcs = [];
  const rng = ctx.rng('lm:spray');

  // ---------- 贸易区喷泉：三层石盆 ----------
  {
    const { center: [cx, cz], radius: R } = C.LANDMARKS.fountain;
    const B = shared.B; // 外观几何并入模块级合批 Builder（index.js 统一 finish）
    basin(B, M, shared.water, cx, cz, R);
    B.add(M.stoneTrim, cylGeo(1.5, 1.9, 16, 1.0), trs(cx, 0, cz));
    B.collider(cx, 0, cz, 2.4, 2.6, 2.4);
    B.add(M.stoneTrim, cylGeo(0.7, 0.75, 24, 2.9), trs(cx, 1.85, cz));
    B.add(M.gold, new THREE.TorusGeometry(2.9, 0.08, 5, 32), trs(cx, 2.6, cz, Math.PI / 2));
    B.add(shared.water, discY(2.75), trs(cx, 2.5, cz));
    B.add(M.stoneTrim, cylGeo(0.38, 1.7, 12, 0.3), trs(cx, 2.55, cz));
    B.add(M.stoneTrim, cylGeo(0.28, 0.5, 18, 1.35), trs(cx, 4.2, cz));
    B.add(shared.water, discY(1.25), trs(cx, 4.62, cz));
    B.add(M.gold, new THREE.SphereGeometry(0.3, 10, 8), trs(cx, 4.95, cz));
    B.add(M.gold, coneGeo(0.12, 0.6, 8), trs(cx, 5.15, cz));
    // 水帘：从上两层盆沿垂落
    B.add(shared.curtain, new THREE.CylinderGeometry(2.8, 3.0, 1.95, 32, 1, true), trs(cx, 1.55, cz));
    B.add(shared.curtain, new THREE.CylinderGeometry(1.3, 1.45, 2.0, 24, 1, true), trs(cx, 3.6, cz));
    // 盆沿四只狮头出水口
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      B.add(M.gold, new THREE.SphereGeometry(0.32, 8, 6), trs(cx + Math.sin(a) * (R - 0.35), 0.95, cz + Math.cos(a) * (R - 0.35)));
    }
    // 四角石凳
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const r = R + 3.2;
      B.box(M.stoneTrim, cx + Math.sin(a) * r, 0, cz + Math.cos(a) * r, 3.2, 0.45, 0.9, { ry: a });
    }
    const em = [{ x: cx, y: 5.2, z: cz, vx: 0.04, vy: 4.4, vz: 0, floor: 5.0 }];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      em.push({ x: cx + Math.sin(a) * 0.2, y: 5.2, z: cz + Math.cos(a) * 0.2, vx: Math.sin(a) * 1.6, vy: 2.4, vz: Math.cos(a) * 1.6, floor: 2.5 });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      em.push({ x: cx + Math.sin(a) * (R - 0.6), y: 0.95, z: cz + Math.cos(a) * (R - 0.6), vx: -Math.sin(a) * 2.2, vy: 2.6, vz: -Math.cos(a) * 2.2, jitter: 0.35, floor: 0.55 });
    }
    arcs.push(...em);
  }

  // ---------- 大教堂广场：圣光喷泉（中央举光的牧师雕像）----------
  {
    const { center: [cx, cz], radius: R } = C.LANDMARKS.cathedralStatue;
    const B = shared.B; // 外观几何并入模块级合批 Builder（index.js 统一 finish）
    basin(B, M, shared.water, cx, cz, R);
    // 八角基座 + 雕像
    B.add(M.stoneTrim, cylGeo(1.8, 0.9, 8), trs(cx, 0, cz));
    B.add(M.stoneWhite, cylGeo(1.2, 2.2, 8, 1.0), trs(cx, 0.9, cz));
    B.add(M.gold, cylGeo(1.32, 0.18, 8), trs(cx, 2.0, cz));
    B.add(M.stoneTrim, cylGeo(1.15, 0.3, 8, 1.3), trs(cx, 3.1, cz));
    B.collider(cx, 0, cz, 3.2, 3.4, 3.2);
    const f = B.frame(cx, 3.4, cz, 0);
    f.add(M.statue, cylGeo(0.95, 2.7, 14, 0.42), null);
    f.add(M.statue, cylGeo(0.42, 1.0, 10, 0.36), trs(0, 2.7, 0));
    f.add(M.statue, new THREE.SphereGeometry(0.34, 12, 10), trs(0, 4.02, 0));
    f.add(M.statue, new THREE.CylinderGeometry(0.42, 0.3, 0.6, 10, 1, true), trs(0, 4.05, -0.05)); // 兜帽
    for (const s of [-1, 1]) f.add(M.statue, new THREE.CylinderGeometry(0.11, 0.14, 1.5, 6), trs(s * 0.45, 4.25, 0.05, 0, 0, s * 0.42));
    f.add(M.lampGlow, new THREE.SphereGeometry(0.5, 14, 10), trs(0, 5.55, 0.05));
    f.add(M.gold, new THREE.TorusGeometry(0.85, 0.06, 5, 24), trs(0, 5.55, 0.05));
    f.add(M.gold, new THREE.TorusGeometry(0.85, 0.06, 5, 24), trs(0, 5.55, 0.05, Math.PI / 2));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      f.add(M.gold, coneGeo(0.08, 0.7, 4), trs(Math.cos(a) * 0.9, 5.55 + Math.sin(a) * 0.9, 0.05, 0, 0, a - Math.PI / 2));
    }
    // 盆沿六个出水口（金色）
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      B.add(M.gold, cylGeo(0.22, 0.3, 8), trs(cx + Math.sin(a) * (R - 0.3), 0.85, cz + Math.cos(a) * (R - 0.3)));
    }
    ringOfBoxes(B, M.stoneTrim, cx, 0, cz, R + 2.6, 6, 2.6, 0.45, 0.8, { collide: true, phase: Math.PI / 6 });
    const em = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      em.push({ x: cx + Math.sin(a) * (R - 0.4), y: 1.05, z: cz + Math.cos(a) * (R - 0.4), vx: -Math.sin(a) * 1.75, vy: 4.1, vz: -Math.cos(a) * 1.75, jitter: 0.3, floor: 0.55 });
    }
    arcs.push(...em);
    ctx.lights.add({ x: cx, y: 9, z: cz, color: 0xffe2a8, intensity: 1.2, range: 16, kind: 'lamp', nightOnly: true });
  }

  // 全部水柱合成一个网格（1 个批次）；alphaMap 纵向滚动 = 水在流
  const jetMat = waterJetMaterial();
  const jets = new THREE.Mesh(waterJetGeometry(arcs), jetMat);
  jets.name = '喷泉水柱';
  jets.renderOrder = 2;
  shared.root.add(jets);
  ups.push((dt) => {
    jetMat.alphaMap.offset.y -= dt * 1.8;
  });
  return (dt) => {
    for (const u of ups) u(Math.min(dt, 0.05));
  };
}
