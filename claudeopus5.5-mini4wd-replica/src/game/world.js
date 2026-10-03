// 场馆与赛道网格：日本杯式白色护墙多车道赛道 + 换道桥 + 飞台支撑，三种场馆布景。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANE_W, WALL_H, DS } from './track.js';

export const VENUES = [
  { id: 'shop', name: '模型店 · 周末练习', en: 'HOBBY SHOP', desc: '木地板、陈列架与午后暖光，街坊小学生的聚集地。', floor: 0x9a6f48, wall: 0xe8ddc8, light: 0xffe2b8, exposure: 1.0, sky: 0xf3e6cf, laneColor: 0x2e3a52 },
  { id: 'arena', name: '日本杯 · 体育馆', en: 'JAPAN CUP ARENA', desc: '蓝色地毯、看台与吊顶射灯，正式比赛会场。', floor: 0x1f4f9a, wall: 0x9aa6b4, light: 0xf4f7ff, exposure: 1.05, sky: 0xc9d3de, laneColor: 0x3a4250 },
  { id: 'night', name: '夜间车库 · 霓虹', en: 'NIGHT GARAGE', desc: '混凝土地面与霓虹灯带，深夜的调校测试。', floor: 0x3b3f45, wall: 0x262b33, light: 0x9fc4ff, exposure: 0.9, sky: 0x0d1118, laneColor: 0x2a2f38 },
];

function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

// ---------------- 赛道 ----------------
export function buildTrackMesh(track, venue) {
  const g = new THREE.Group(); g.name = 'track';
  const N = track.lanes, n = track.n;
  const floorMat = new THREE.MeshStandardMaterial({ color: venue.laneColor, roughness: 0.75, metalness: 0.05 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.45 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.6 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xc3c8ce, roughness: 0.5, metalness: 0.2 });
  const floors = [], walls = [], skirts = [], pillars = [];
  const lc = track.lc;
  const inLC = s => lc && s > lc.s0 - DS && s < lc.s1 + DS;

  // 车道地板：每车道一条带（换道段由各车道自身路径生成）
  for (let lane = 0; lane < N; lane++) {
    const L = [], R = [];
    for (let i = 0; i <= n; i++) {
      const s = (i % n) * DS * (track.length / (n * DS));
      const p = track.pose(s, lane), nx = -Math.sin(p.h), nz = Math.cos(p.h), hw = LANE_W / 2;
      L.push([p.x - nx * hw, p.y - tiltY(p, -hw), p.z - nz * hw]);
      R.push([p.x + nx * hw, p.y - tiltY(p, hw), p.z + nz * hw]);
    }
    floors.push(stripGeo(L, R, 0.0));
  }
  // 护墙：车道边界（非换道段）+ 各车道两侧（换道段）
  for (let b = 0; b <= N; b++) {
    const pts = [];
    let seg = [];
    for (let i = 0; i <= n; i++) {
      const s = (i % n) * (track.length / n);
      if (inLC(s) && b > 0 && b < N) { if (seg.length > 1) pts.push(seg); seg = []; continue; }
      const lane = Math.min(N - 1, b), side = b === N ? 1 : -1;
      const p = track.pose(s, lane), nx = -Math.sin(p.h), nz = Math.cos(p.h), o = side * LANE_W / 2;
      seg.push([p.x + nx * o, p.y - tiltY(p, o), p.z + nz * o, p.h]);
    }
    if (seg.length > 1) pts.push(seg);
    for (const sgm of pts) walls.push(wallGeo(sgm, b === 0 || b === N ? 0.004 : 0.003, WALL_H));
  }
  if (lc) {
    // 换道段：每条车道两侧护墙（桥面车道另建桥）
    for (let lane = 0; lane < N; lane++) {
      for (const side of [-1, 1]) {
        const seg = [];
        for (let s = lc.s0; s <= lc.s1 + 1e-6; s += DS) {
          const p = track.pose(s, lane), nx = -Math.sin(p.h), nz = Math.cos(p.h), o = p.offset + side * LANE_W / 2;
          const c = track.center(s);
          seg.push([c.x + nx * o, p.y, c.z + nz * o, p.h]);
        }
        if (lane === N - 1) walls.push(wallGeo(seg, 0.003, WALL_H * 0.8));
        else if ((lane === 0 && side === -1) || (lane === N - 2 && side === 1)) walls.push(wallGeo(seg, 0.004, WALL_H));
        else walls.push(wallGeo(seg, 0.003, WALL_H));
      }
    }
    // 桥面支柱
    for (let s = lc.s0 + 0.35; s < lc.s1 - 0.3; s += 0.32) {
      const p = track.pose(s, N - 1);
      if (p.lift < 0.04) continue;
      for (const side of [-1, 1]) {
        const nx = -Math.sin(p.h), nz = Math.cos(p.h);
        // 支柱落在车道之外：取赛道外缘两侧
        const c = track.center(s), o = side * (track.width / 2 + 0.03);
        const geo = new THREE.BoxGeometry(0.018, p.y - 0.004, 0.018); geo.translate(c.x + nx * o, (p.y - 0.004) / 2, c.z + nz * o);
        pillars.push(geo);
      }
      // 横梁
      const c = track.center(s), nx = -Math.sin(c.h), nz = Math.cos(c.h), len = track.width + 0.08;
      const beam = new THREE.BoxGeometry(0.016, 0.01, len); beam.rotateY(-c.h); beam.translate(c.x, p.y - 0.008, c.z);
      pillars.push(beam);
    }
  }
  // 高架段裙板（飞台 / 坡道 / 斜坡弯 / 波浪）：从车道两侧外缘落到地面
  for (const side of [-1, 1]) {
    const L = [], R = [];
    for (let i = 0; i <= n; i++) {
      const s = (i % n) * (track.length / n);
      const lane = side < 0 ? 0 : N - 1;
      const p = track.pose(s, lane), nx = -Math.sin(p.h), nz = Math.cos(p.h), o = side * (LANE_W / 2 + 0.004);
      const x = p.x + nx * o, z = p.z + nz * o, y = p.y - tiltY(p, side * LANE_W / 2);
      if (inLC(s) && lane === N - 1) { L.push([x, 0, z]); R.push([x, 0, z]); continue; }
      L.push([x, Math.max(0, y), z]); R.push([x, 0, z]);
    }
    skirts.push(stripGeo(L, R, 0));
  }
  const mk = (geos, mat, name) => { if (!geos.length) return; const m = new THREE.Mesh(mergeGeometries(geos.map(x => x.index ? x.toNonIndexed() : x)), mat); m.name = name; m.receiveShadow = true; m.castShadow = name !== 'track-floor'; g.add(m); };
  mk(floors, floorMat, 'track-floor');
  mk(walls, wallMat, 'track-walls');
  mk(skirts, skirtMat, 'track-skirts');
  mk(pillars, pillarMat, 'track-pillars');
  // 起点线与格子旗
  const st = track.pose(track.start, 0), c0 = track.center(track.start);
  const lineGeo = new THREE.PlaneGeometry(0.03, track.width); lineGeo.rotateX(-Math.PI / 2); lineGeo.rotateY(-c0.h); lineGeo.translate(c0.x, c0.y + 0.0015, c0.z);
  const checker = canvasTex(32, 256, (x, w, h) => { for (let i = 0; i < 32; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(j * 8, i * 8, 8, 8); } });
  const line = new THREE.Mesh(lineGeo, new THREE.MeshStandardMaterial({ map: checker, roughness: 0.6 })); line.name = 'start-line'; g.add(line);
  // 起点门架
  const arch = new THREE.Group(); arch.name = 'start-arch';
  const nx = -Math.sin(c0.h), nz = Math.cos(c0.h), half = track.width / 2 + 0.06;
  for (const sgn of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.42, 0.03), new THREE.MeshStandardMaterial({ color: 0xd8262f, roughness: 0.4 })); post.position.set(c0.x + nx * half * sgn, 0.21, c0.z + nz * half * sgn); post.castShadow = true; arch.add(post); }
  const banner = canvasTex(1024, 128, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#1d3fb8'); gr.addColorStop(1, '#d8262f'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = '900 72px "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('MINI 4WD  JAPAN CUP', w / 2, h / 2 + 4); });
  const bannerMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, half * 2 + 0.06), [0, 1, 2, 3].map(() => new THREE.MeshStandardMaterial({ color: 0xd8262f })).concat([new THREE.MeshStandardMaterial({ map: banner }), new THREE.MeshStandardMaterial({ map: banner })]));
  bannerMesh.position.set(c0.x, 0.42, c0.z); bannerMesh.rotation.y = -c0.h; bannerMesh.castShadow = true; arch.add(bannerMesh);
  g.add(arch);
  return g;
}

// 斜坡弯横倾时车道横向某点相对车道中心的高度差（车道中心已在 pose.y 中）
function tiltY(p, o) { return o * Math.sin(p.bank || 0); }

function stripGeo(L, R) {
  const pos = [], idx = [];
  for (let i = 0; i < L.length; i++) { pos.push(...L[i], ...R[i]); }
  for (let i = 0; i < L.length - 1; i++) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  // 保证法线朝上
  const nrm = g.attributes.normal; let up = 0; for (let i = 0; i < nrm.count; i++) up += nrm.getY(i);
  if (up < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

function wallGeo(seg, thick, height) {
  const pos = [], idx = [];
  for (let i = 0; i < seg.length; i++) {
    const [x, y, z, h] = seg[i], nx = -Math.sin(h) * thick / 2, nz = Math.cos(h) * thick / 2;
    pos.push(x - nx, y, z - nz, x - nx, y + height, z - nz, x + nx, y + height, z + nz, x + nx, y, z + nz);
  }
  for (let i = 0; i < seg.length - 1; i++) {
    const a = i * 4, b = a + 4;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2, a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  // 双面墙：材质 side 处理
  return ng;
}

// ---------------- 场馆 ----------------
export function buildVenue(venue, bounds) {
  const g = new THREE.Group(); g.name = 'venue';
  const cx = bounds.cx, cz = bounds.cz, W = (bounds.x1 - bounds.x0) + 5, D = (bounds.z1 - bounds.z0) + 5;
  // 地面
  let floorTex;
  if (venue.id === 'shop') floorTex = canvasTex(512, 512, (x, w, h) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#a5794f' : '#94693f'; x.fillRect(0, i * 64, w, 64); for (let j = 0; j < 30; j++) { x.strokeStyle = 'rgba(60,35,15,0.15)'; x.beginPath(); const yy = i * 64 + Math.random() * 64; x.moveTo(0, yy); x.bezierCurveTo(w / 3, yy + 6, w * 2 / 3, yy - 6, w, yy); x.stroke(); } x.fillStyle = 'rgba(40,20,5,0.5)'; x.fillRect(0, i * 64, w, 2); x.fillRect(((i * 197) % w), i * 64, 2, 64); } }, { repeat: [W / 2, D / 2] });
  else if (venue.id === 'arena') floorTex = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#1e4d97'; x.fillRect(0, 0, w, h); for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,40'},0.06)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }, { repeat: [W / 1.5, D / 1.5] });
  else floorTex = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#3d4147'; x.fillRect(0, 0, w, h); for (let i = 0; i < 6000; i++) { const v = 40 + Math.random() * 40; x.fillStyle = `rgba(${v},${v + 3},${v + 8},0.25)`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); } x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 3; x.strokeRect(0, 0, w, h); }, { repeat: [W / 3, D / 3] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 10, D + 10), new THREE.MeshStandardMaterial({ map: floorTex, roughness: venue.id === 'night' ? 0.55 : 0.8, color: 0xffffff }));
  floorTex.repeat.set((W + 10) / (venue.id === 'arena' ? 1.5 : venue.id === 'shop' ? 2 : 3), (D + 10) / (venue.id === 'arena' ? 1.5 : venue.id === 'shop' ? 2 : 3));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, -0.001, cz); floor.receiveShadow = true; floor.name = 'floor'; g.add(floor);
  // 四面墙
  const H = venue.id === 'arena' ? 6 : 3.2;
  const wallMat = new THREE.MeshStandardMaterial({ color: venue.wall, roughness: 0.9, side: THREE.BackSide });
  const room = new THREE.Mesh(new THREE.BoxGeometry(W + 10, H, D + 10), wallMat); room.position.set(cx, H / 2 - 0.002, cz); room.name = 'room'; g.add(room);
  const props = new THREE.Group(); props.name = 'props'; g.add(props);
  const rand = mulberry(7);
  if (venue.id === 'shop') {
    // 陈列架 + 模型盒（实例化）
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.7 });
    const boxGeo = new THREE.BoxGeometry(0.3, 0.07, 0.18);
    const boxMat = new THREE.MeshStandardMaterial({ roughness: 0.55, vertexColors: false });
    const boxes = new THREE.InstancedMesh(boxGeo, boxMat, 220); let bi = 0;
    const colors = [0x1d3fb8, 0xd8262f, 0xf2c731, 0xffffff, 0x2b8a4a, 0x6a3fb5, 0x111111];
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (const side of [-1, 1]) {
      const z = cz + side * (D / 2 + 3.6);
      for (let k = 0; k < 5; k++) {
        const x = cx - W / 2 + 1 + k * (W / 5);
        for (let lvl = 0; lvl < 4; lvl++) {
          const shelf = new THREE.Mesh(new THREE.BoxGeometry(W / 5 - 0.1, 0.03, 0.4), shelfMat); shelf.position.set(x + W / 10, 0.35 + lvl * 0.45, z); shelf.castShadow = true; props.add(shelf);
          for (let b = 0; b < 8 && bi < 220; b++) {
            m4.makeTranslation(x + 0.2 + b * (W / 5 - 0.3) / 8, 0.4 + lvl * 0.45, z); boxes.setMatrixAt(bi, m4);
            col.setHex(colors[Math.floor(rand() * colors.length)]); boxes.setColorAt(bi, col); bi++;
          }
        }
      }
    }
    boxes.count = bi; boxes.castShadow = true; props.add(boxes);
    // 展示台
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.7), new THREE.MeshStandardMaterial({ color: 0xece4d6, roughness: 0.6 })); counter.position.set(cx + W / 2 + 2.6, 0.45, cz); counter.castShadow = true; props.add(counter);
  } else if (venue.id === 'arena') {
    // 看台（台阶）+ 横幅
    const standMat = new THREE.MeshStandardMaterial({ color: 0x7c8794, roughness: 0.8 });
    for (const side of [-1, 1]) for (let r = 0; r < 6; r++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(W + 4, 0.4, 0.8), standMat); st.position.set(cx, 0.2 + r * 0.4, cz + side * (D / 2 + 2.5 + r * 0.8)); st.receiveShadow = true; props.add(st);
    }
    const flagTex = canvasTex(1024, 256, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.fillStyle = '#d8262f'; x.fillRect(0, 0, w, 40); x.fillStyle = '#1d3fb8'; x.fillRect(0, h - 40, w, 40); x.fillStyle = '#111'; x.font = '900 110px "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('JAPAN CUP', w / 2, h / 2); });
    for (const side of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide })); b.position.set(cx, 4.2, cz + side * (D / 2 + 4.9)); b.rotation.y = side > 0 ? Math.PI : 0; props.add(b); }
  } else {
    // 霓虹灯带 + 工具箱
    const neon = [0x29d7ff, 0xff3fb4, 0x7cff6b];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(W + 4, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: neon[i] }));
      m.position.set(cx, 1.6 + i * 0.35, cz - D / 2 - 4.9); props.add(m);
      const m2 = m.clone(); m2.position.z = cz + D / 2 + 4.9; props.add(m2);
    }
    const toolMat = new THREE.MeshStandardMaterial({ color: 0xc8262d, roughness: 0.4, metalness: 0.3 });
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.45), toolMat); t.position.set(cx - W / 2 + 1 + i * 1.2, 0.45, cz - D / 2 - 4.4); t.castShadow = true; props.add(t); }
  }
  // 赛道外围工作台（每侧一张）
  const tableMat = new THREE.MeshStandardMaterial({ color: venue.id === 'night' ? 0x4a4f57 : 0xd8d2c6, roughness: 0.7 });
  for (const side of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 0.7), tableMat); t.position.set(cx + side * (W / 2 + 0.6), 0.72, cz + D / 2 + 0.9); t.castShadow = true; t.receiveShadow = true; props.add(t);
    for (const lx of [-0.75, 0.75]) for (const lz of [-0.3, 0.3]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 0.04), tableMat); l.position.set(t.position.x + lx, 0.36, t.position.z + lz); props.add(l); }
  }
  return g;
}

export function addLights(scene, venue, bounds) {
  const g = new THREE.Group(); g.name = 'lights';
  const hemi = new THREE.HemisphereLight(venue.sky, venue.id === 'night' ? 0x0a0c10 : 0x6b5a48, venue.id === 'night' ? 0.35 : 0.65);
  g.add(hemi);
  const key = new THREE.DirectionalLight(venue.light, venue.id === 'night' ? 1.9 : 2.2);
  const cx = bounds.cx, cz = bounds.cz, span = Math.max(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0) / 2 + 1;
  key.position.set(cx + 3, 7, cz + 2); key.target.position.set(cx, 0, cz);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 20 });
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.01;
  g.add(key, key.target);
  if (venue.id === 'night') {
    for (const [c, x] of [[0x29d7ff, -1], [0xff3fb4, 1]]) { const p = new THREE.PointLight(c, 2.0, 7, 1.8); p.position.set(cx + x * span * 0.6, 1.8, cz); g.add(p); }
  } else {
    const fill = new THREE.DirectionalLight(0xffffff, 0.5); fill.position.set(cx - 4, 5, cz - 3); g.add(fill);
  }
  scene.add(g);
  return g;
}

function mulberry(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
