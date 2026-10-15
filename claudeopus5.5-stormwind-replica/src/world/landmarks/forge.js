// 矮人区：大熔炉（开敞石柱大棚 + 中央炉膛 + 两根大烟囱）与矿道地铁入口（山体拱廊 + 下行坡道）。
import * as THREE from 'three';
import { cylGeo, coneGeo } from '../../core/geom.js';
import { archWall, archBandGeo, archPaneGeo, triGeo, gableRoof, beam, signTexture, trs, finishInto } from './kit.js';

// ---------------- 大熔炉 ----------------
export function buildForge(ctx, shared) {
  const { mat: M, coords: C } = ctx;
  const L = C.LANDMARKS.greatForge;
  const [cx, cz] = L.center;
  const [W, D] = L.size; // 30 × 22
  const B = shared.B; // 外观几何并入模块级合批 Builder（index.js 统一 finish）
  const fire = shared.forgeFire;
  const PH = 8; // 柱高

  B.box(M.cobbleDark, cx, -0.25, cz, W, 0.3, D); // 地坪（顶 0.05）
  // 周边石柱 + 铁箍
  const xs = [-W / 2 + 1, -W / 4, 0, W / 4, W / 2 - 1];
  const posts = [];
  for (const x of xs) for (const z of [-D / 2 + 0.9, D / 2 - 0.9]) posts.push([x, z]);
  for (const z of [-D / 4, D / 4]) for (const x of [-W / 2 + 1, W / 2 - 1]) posts.push([x, z]);
  for (const [x, z] of posts) {
    B.box(M.stoneDark, cx + x, 0, cz + z, 2.0, 0.7, 2.0);
    B.box(M.stoneDark, cx + x, 0.7, cz + z, 1.5, PH - 1.2, 1.5);
    B.box(M.stoneDark, cx + x, PH - 0.5, cz + z, 2.0, 0.5, 2.0, { collide: false });
    for (const y of [2.2, 5.2]) B.box(M.iron, cx + x, y, cz + z, 1.6, 0.25, 1.6, { collide: false });
  }
  // 铁梁圈 + 桁架
  for (const z of [-D / 2 + 0.9, D / 2 - 0.9]) B.box(M.iron, cx, PH, cz + z, W - 0.6, 0.7, 0.6, { collide: false });
  for (const x of [-W / 2 + 1, W / 2 - 1, -W / 4, 0, W / 4]) {
    B.box(M.iron, cx + x, PH, cz, 0.6, 0.7, D - 1.2, { collide: false });
    for (const s of [-1, 1]) B.box(M.iron, cx + x, PH + 2.3, cz + s * 5, 0.35, 0.35, 11.4, { rx: s * 0.42, collide: false });
  }
  // 红瓦屋顶（屋脊沿 x），两端山墙开圆形通风口
  for (const g of gableRoof(W + 0.6, D - 0.6, 5, 0.8, 0.3)) B.add(M.roofRed, g, trs(cx, PH + 0.7, cz));
  for (const s of [-1, 1]) {
    B.add(M.stoneDark, triGeo(D - 0.6, 5, 0.6), trs(cx + s * (W / 2 - 0.7), PH + 0.7, cz, 0, Math.PI / 2));
    B.add(M.iron, new THREE.TorusGeometry(1.2, 0.18, 6, 16), trs(cx + s * (W / 2 - 0.3), PH + 2.6, cz, 0, Math.PI / 2));
  }
  // 中央炉膛：暗石炉体 + 前后两张火口 + 顶上坩埚
  const fx0 = 10;
  const fz0 = 6;
  B.box(M.stoneDark, cx, 0, cz, fx0, 4.6, fz0);
  B.box(M.stoneDark, cx, 4.6, cz, fx0 + 0.8, 0.6, fz0 + 0.8, { collide: false });
  for (const s of [-1, 1]) {
    const f = B.frame(cx, 0, cz + s * (fz0 / 2 + 0.03), s > 0 ? 0 : Math.PI);
    for (const x of [-2.6, 2.6]) {
      f.add(fire, archPaneGeo(2.2, 0.5, 1.9, 'round'), trs(x, 0, 0));
      f.add(M.iron, archBandGeo(2.8, 2.2, 1.9, 'round', 0.25), trs(x, 0, 0));
    }
  }
  B.add(M.iron, cylGeo(2.0, 1.4, 16, 2.3), trs(cx, 5.2, cz));
  B.add(fire, new THREE.CircleGeometry(2.1, 20).rotateX(-Math.PI / 2), trs(cx, 6.5, cz));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    B.box(M.iron, cx + Math.cos(a) * 2.3, 6.2, cz + Math.sin(a) * 2.3, 0.3, 1.6, 0.3, { collide: false });
  }
  // 两根大烟囱（穿出屋脊）
  for (const dx of [-3.6, 3.6]) {
    B.add(M.stoneDark, cylGeo(1.5, 22, 12, 1.2), trs(cx + dx, 4.6, cz));
    for (const y of [9, 15, 21]) B.add(M.iron, cylGeo(1.55 - (y - 4.6) * 0.0136, 0.4, 12), trs(cx + dx, y, cz));
    B.add(M.iron, cylGeo(1.5, 0.9, 12, 1.7), trs(cx + dx, 26.6, cz));
    B.add(M.iron, new THREE.CylinderGeometry(1.25, 1.25, 0.1, 12).translate(0, 0.05, 0), trs(cx + dx, 27.45, cz));
    ctx.fx.smoke.push({ x: cx + dx, y: 27.6, z: cz });
  }
  // 熔岩槽：从南火口流向铸模池
  B.box(fire, cx, 0.05, cz + fz0 / 2 + 2, 0.9, 0.12, 4);
  for (const s of [-1, 1]) B.box(M.stoneDark, cx + s * 0.65, 0.05, cz + fz0 / 2 + 2, 0.4, 0.35, 4);
  B.box(M.stoneDark, cx, 0.05, cz + fz0 / 2 + 4.8, 3, 0.45, 1.6);
  B.box(fire, cx, 0.5, cz + fz0 / 2 + 4.8, 2.4, 0.02, 1.1, { collide: false });
  // 铁砧 ×4
  for (const [x, z] of [[-9, 6], [9, 6], [-9, -6], [9, -6]]) anvil(B, M, cx + x, cz + z);
  // 煤堆、淬火水槽、工具架
  for (const [x, z, r] of [[-12, -7.5, 1.8], [12, 6.5, 1.6], [-12.5, 3, 1.2]]) {
    B.add(M.cobbleDark, coneGeo(r, r * 0.8, 10), trs(cx + x, 0.05, cz + z));
    B.collider(cx + x, 0, cz + z, r * 1.2, r * 0.7, r * 1.2);
  }
  B.box(M.planks, cx + 11, 0.05, cz - 7.5, 3, 0.85, 1.2);
  B.add(shared.water, new THREE.PlaneGeometry(2.7, 0.9).rotateX(-Math.PI / 2), trs(cx + 11, 0.91, cz - 7.5));
  const rz = cz - 8;
  B.box(M.timber, cx + 5.5, 0, rz, 3.2, 0.15, 0.4, { collide: false });
  B.box(M.timber, cx + 5.5, 1.9, rz, 3.2, 0.15, 0.4, { collide: false });
  for (const x of [4, 7]) B.box(M.timber, cx + x, 0, rz, 0.15, 2.1, 0.4);
  for (let i = 0; i < 5; i++) B.box(M.iron, cx + 4.4 + i * 0.55, 0.3, rz + 0.15, 0.08, 1.5, 0.05, { collide: false, rz: 0.06 });

  ctx.lights.add({ x: cx, y: 3, z: cz + fz0 / 2 + 1.5, color: 0xff7a2a, intensity: 1.4, range: 26, kind: 'forge', flicker: true });
  ctx.lights.add({ x: cx, y: 7.6, z: cz, color: 0xff8a3a, intensity: 0.8, range: 20, kind: 'forge', flicker: true });

  // 火光闪烁：熔炉专用火材质（不影响别的模块的 fire）
  const base = new THREE.Color(0xff8a2a);
  return (dt, t) => {
    const k = 0.85 + 0.15 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1.3) + 0.06 * Math.sin(t * 17.0);
    fire.color.copy(base).multiplyScalar(k * 1.15);
  };
}

function anvil(B, M, x, z) {
  B.box(M.stoneDark, x, 0.05, z, 1.0, 0.55, 0.9);
  B.box(M.iron, x, 0.6, z, 0.5, 0.35, 0.4, { collide: false });
  B.box(M.iron, x, 0.95, z, 1.2, 0.28, 0.5, { collide: false });
  B.add(M.iron, coneGeo(0.22, 0.6, 6).rotateZ(-Math.PI / 2), trs(x + 0.6, 1.09, z));
  B.collider(x, 0, z, 1.4, 1.25, 0.9);
}

// ---------------- 矿道地铁入口 ----------------
export function buildTram(ctx, shared) {
  const { mat: M, coords: C } = ctx;
  const L = C.LANDMARKS.tram;
  const [cx, cz] = L.center;
  const [W, D] = L.size; // 14 × 22，入口朝南
  const zS = cz + D / 2; // -164
  const zN = cz - D / 2; // -186
  const B = shared.B; // 外观几何并入模块级合批 Builder（index.js 统一 finish）
  const LAND = 2.4; // 入口平台高
  const LOW = 0.3; // 坡道底
  const SPRING = 8; // 拱廊起拱高
  const RI = 5.8; // 拱廊内半径
  const inner = RI * 2;

  // 门前八级台阶（升到入口平台）
  for (let i = 0; i < 8; i++) B.box(M.stoneDark, cx, 0, zS + 3.6 - 0.45 * i - 0.225, 11 - i * 0.1, 0.3 * (i + 1), 0.45);
  // 入口平台 + 坡道 + 坡底平地
  const rampZ0 = zS - 3.5;
  const rampZ1 = zS - 17.5;
  B.box(M.cobbleDark, cx, 0, (zS + rampZ0) / 2, inner, LAND, zS - rampZ0);
  const rampLen = rampZ0 - rampZ1;
  const drop = LAND - LOW;
  const ang = Math.atan2(drop, rampLen);
  B.box(M.cobbleDark, cx, (LAND + LOW) / 2 - 0.15, (rampZ0 + rampZ1) / 2, inner, 0.3, Math.hypot(rampLen, drop), { rx: -ang, collide: false });
  for (let k = 0; k < rampLen; k++) {
    const top = LAND - drop * ((k + 0.5) / rampLen);
    B.collider(cx, 0, rampZ0 - k - 0.5, inner, top, 1.0);
  }
  B.box(M.cobbleDark, cx, 0, (rampZ1 + zN) / 2, inner, LOW, rampZ1 - zN);
  // 铁轨 + 枕木（沿坡道下行再走平）
  for (const x of [-1.4, 1.4]) {
    B.box(M.iron, cx + x, (LAND + LOW) / 2 + 0.02, (rampZ0 + rampZ1) / 2, 0.14, 0.16, Math.hypot(rampLen, drop), { rx: -ang, collide: false });
    B.box(M.iron, cx + x, LOW, (rampZ1 + zN) / 2, 0.14, 0.16, rampZ1 - zN, { collide: false });
    B.box(M.iron, cx + x, LAND, (zS - 0.5 + rampZ0) / 2, 0.14, 0.16, zS - 0.5 - rampZ0, { collide: false });
  }
  for (let z = zS - 0.8; z > zN + 0.8; z -= 0.9) {
    const y = z > rampZ0 ? LAND : z < rampZ1 ? LOW : LAND - drop * ((rampZ0 - z) / rampLen);
    B.box(M.timber, cx, y - 0.02, z, 4.2, 0.1, 0.35, { collide: false });
  }

  // 南立面：巨大圆拱门洞（门洞底 = 地面，平台台阶从门洞里穿过）
  const FH = 17;
  archWall(B, M.stoneDark, cx, 0, zS - 0.6, 0, W + 2, FH, 1.2, [{ x: 0, y0: 0, w: 9.4, spring: LAND + 5, kind: 'round' }]);
  B.add(M.iron, archBandGeo(10.6, 9.4, LAND + 5, 'round', 0.45), trs(cx, 0, zS));
  B.add(M.stoneTrim, archBandGeo(11.6, 10.6, LAND + 5, 'round', 0.3), trs(cx, 0, zS));
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI - (i / 12) * Math.PI;
    B.add(M.gold, new THREE.SphereGeometry(0.12, 6, 4), trs(cx + Math.cos(a) * 5.0, LAND + 5 + Math.sin(a) * 5.0, zS + 0.48));
  }
  // 齿轮柱 + 招牌
  for (const s of [-1, 1]) {
    const x = cx + s * 7.4;
    B.box(M.iron, x, 0, zS + 0.8, 1.6, 12.5, 1.6);
    B.box(M.stoneDark, x, 12.5, zS + 0.8, 2.2, 0.8, 2.2, { collide: false });
    B.add(M.iron, new THREE.TorusGeometry(1.5, 0.32, 6, 12), trs(x - s * 0.1, 9.4, zS + 1.75));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      B.box(M.iron, x - s * 0.1 + Math.cos(a) * 1.85, 9.4 + Math.sin(a) * 1.85 - 0.2, zS + 1.75, 0.5, 0.4, 0.4, { rz: a, collide: false });
    }
    B.add(M.gold, new THREE.SphereGeometry(0.35, 8, 6), trs(x - s * 0.1, 9.4, zS + 1.85));
    B.add(M.lampGlow, new THREE.BoxGeometry(0.6, 0.9, 0.6), trs(x, 13.75, zS + 0.8));
    B.add(M.iron, coneGeo(0.6, 0.6, 4).rotateY(Math.PI / 4), trs(x, 14.2, zS + 0.8));
  }
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture('矿道地铁', { sub: '暴风城 — 铁炉堡' }), roughness: 0.6, emissive: 0x221508, name: 'lmTramSign' });
  B.add(M.iron, new THREE.BoxGeometry(9.2, 2.6, 0.3), trs(cx, LAND + 5 + 4.7 + 1.3, zS + 0.15));
  B.add(signMat, new THREE.PlaneGeometry(8.8, 2.2), trs(cx, LAND + 5 + 4.7 + 1.3, zS + 0.32));
  // 立面顶：矮人式阶梯山花
  for (let i = 0; i < 4; i++) B.box(M.stoneDark, cx, FH + i * 0.9, zS - 0.6, W + 2 - i * 3.6, 0.9, 1.4, { collide: false });
  B.add(M.gold, new THREE.OctahedronGeometry(0.6, 0), trs(cx, FH + 4.2, zS - 0.6, 0, 0, 0, 1, 1.6, 1));

  // 拱廊：两侧墙 + 半圆拱顶（盒子拼成，双面可见）+ 铁肋 + 尽头墙
  for (const s of [-1, 1]) B.box(M.stoneDark, cx + s * (RI + 0.6), 0, (zS - 1.2 + zN) / 2, 1.2, SPRING, zS - 1.2 - zN);
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const p = ((i + 0.5) / seg) * Math.PI;
    const r = RI + 0.3;
    const w = 2 * (RI + 0.6) * Math.sin(Math.PI / seg / 2) + 0.05;
    B.box(M.stoneDark, cx + Math.cos(p) * r, SPRING + Math.sin(p) * r - 0.3, (zS - 1.2 + zN) / 2, w, 0.6, zS - 1.2 - zN, { rz: p + Math.PI / 2, collide: false });
  }
  for (let z = zS - 3; z > zN + 1; z -= 4.5) {
    for (let i = 0; i < seg; i++) {
      const p = ((i + 0.5) / seg) * Math.PI;
      const r = RI - 0.15;
      B.box(M.iron, cx + Math.cos(p) * r, SPRING + Math.sin(p) * r - 0.15, z, 1.6, 0.3, 0.35, { rz: p + Math.PI / 2, collide: false });
    }
    for (const s of [-1, 1]) B.box(M.iron, cx + s * (RI - 0.15), 0, z, 0.3, SPRING, 0.35, { collide: false });
  }
  B.box(M.stoneDark, cx, 0, zN + 0.6, inner + 2.4, SPRING + RI + 1, 1.2);
  B.add(shared.black, new THREE.PlaneGeometry(inner, SPRING + RI), trs(cx, (SPRING + RI) / 2, zN + 1.22));
  // 渐暗：三层叠加的半透明黑幕（越往里越黑）
  for (const z of [zN + 9, zN + 5.5, zN + 2.8]) {
    B.add(shared.fade, new THREE.PlaneGeometry(inner, SPRING + RI), trs(cx, (SPRING + RI) / 2, z));
  }
  // 壁灯
  for (const z of [zS - 3.2, zS - 9.5]) {
    for (const s of [-1, 1]) {
      const y = z > rampZ0 ? LAND : LAND - drop * ((rampZ0 - z) / rampLen);
      B.box(M.iron, cx + s * (RI - 0.25), y + 2.8, z, 0.5, 0.15, 0.3, { collide: false });
      B.add(M.lampGlow, new THREE.BoxGeometry(0.35, 0.55, 0.35), trs(cx + s * (RI - 0.5), y + 3.2, z));
    }
    ctx.lights.add({ x: cx, y: 5, z, color: 0xffc070, intensity: 0.9, range: 14, kind: 'lamp' });
  }
  // 山体：外侧堆叠的不规则暗石块
  const rng = ctx.rng('lm:tram-rock');
  for (let i = 0; i < 14; i++) {
    const a = rng();
    const w = 5 + rng() * 5;
    const h = 4 + rng() * 5;
    const d = 5 + rng() * 6;
    const x = cx + (rng() - 0.5) * 9;
    const z = zN + 3 + rng() * (D - 7);
    const y = SPRING + RI + 0.6 + rng() * 1.5; // 块底高于拱顶外皮，旋转后也不会扎进拱廊
    B.box(M.stoneDark, x, y, z, w, h, d, { rx: (rng() - 0.5) * 0.3, rz: (rng() - 0.5) * 0.3, ry: a * Math.PI, collide: false });
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const h = 9 + rng() * 6;
      B.box(M.stoneDark, cx + s * (W / 2 + 2.2), 0, zN + 3 + i * 7, 2.6 + rng() * 1.5, h, 6.5, { rz: s * -0.12, collide: false });
    }
  }
  B.collider(cx, SPRING, (zS + zN) / 2, inner, 0.3, D - 2); // 室内判定
  ctx.hollowCount += 1;
}
