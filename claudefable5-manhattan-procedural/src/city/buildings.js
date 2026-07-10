// 程序化楼群:5 套画布立面(石灰岩/灰石/砖/双色玻璃幕墙) × 实例化退台楼体,
// 屋顶水塔与空调箱,百老汇楔形楼合批。窗灯用 emissiveMap,入夜自动点亮。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY } from './plan.js';
import { applySnowPatch, applyFacadeRepPatch } from '../core/shaderpatch.js';

const TEX_COLS = 6, TEX_ROWS = 12;         // 一张贴图横向 6 窗列、纵向 12 层
const CELL_W = 5.5, CELL_H = CITY.floor;   // 每窗列 5.5m,每层 3.6m
const REP_X_DEN = TEX_COLS * CELL_W;
const REP_Y_DEN = TEX_ROWS * CELL_H;

// ---------- 画布立面 ----------
function makeFacadeTexture(rng, style) {
  const W = 264, H = 528;
  const cw = W / TEX_COLS, ch = H / TEX_ROWS;
  const map = document.createElement('canvas');
  map.width = W; map.height = H;
  const mc = map.getContext('2d');
  const emis = document.createElement('canvas');
  emis.width = W; emis.height = H;
  const ec = emis.getContext('2d');
  ec.fillStyle = '#000';
  ec.fillRect(0, 0, W, H);

  const glass = style.startsWith('glass');
  mc.fillStyle = glass ? '#c3c9ce' : '#d8d3ca';
  mc.fillRect(0, 0, W, H);

  if (style === 'brick') {
    mc.fillStyle = 'rgba(120,70,50,0.16)';
    for (let y = 0; y < H; y += 4) mc.fillRect(0, y, W, 1.4);
  }

  for (let r = 0; r < TEX_ROWS; r++) {
    // 层间腰线
    mc.fillStyle = 'rgba(60,55,48,0.28)';
    mc.fillRect(0, (r + 1) * ch - 1.6, W, 1.6);
    for (let c = 0; c < TEX_COLS; c++) {
      const x = c * cw, y = r * ch;
      const wRatio = glass ? 0.88 : style === 'brick' ? 0.46 : 0.54;
      const hRatio = glass ? 0.86 : 0.6;
      const ww = cw * wRatio, wh = ch * hRatio;
      const wx = x + (cw - ww) / 2, wy = y + (ch - wh) / 2;
      // 窗框
      mc.fillStyle = glass ? '#8f979e' : '#5a544b';
      mc.fillRect(wx - 1.5, wy - 1.5, ww + 3, wh + 3);
      // 玻璃(带竖向渐变的冷色)
      const g = mc.createLinearGradient(0, wy, 0, wy + wh);
      const base = glass ? (style === 'glassB' ? [86, 120, 108] : [80, 108, 132]) : [56, 66, 78];
      const jit = rng.range(-14, 14);
      g.addColorStop(0, `rgb(${base[0] + jit + 26},${base[1] + jit + 26},${base[2] + jit + 30})`);
      g.addColorStop(1, `rgb(${base[0] + jit},${base[1] + jit},${base[2] + jit})`);
      mc.fillStyle = g;
      mc.fillRect(wx, wy, ww, wh);
      if (glass) { // 幕墙竖梃
        mc.fillStyle = 'rgba(210,216,220,0.85)';
        mc.fillRect(wx + ww / 2 - 0.7, wy, 1.4, wh);
      }
      // 夜窗:随机点亮
      if (rng.chance(style.startsWith('glass') ? 0.24 : 0.32)) {
        const warm = rng.chance(0.82);
        const b = rng.range(0.55, 1);
        ec.fillStyle = warm
          ? `rgba(255,${Math.round(196 * b + 30)},${Math.round(130 * b)},${b})`
          : `rgba(${Math.round(170 * b)},${Math.round(205 * b)},255,${b})`;
        ec.fillRect(wx + 1, wy + 1, ww - 2, wh - 2);
      }
    }
  }

  const mapTex = new THREE.CanvasTexture(map);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  mapTex.anisotropy = 4;
  const emisTex = new THREE.CanvasTexture(emis);
  emisTex.colorSpace = THREE.SRGBColorSpace;
  emisTex.wrapS = emisTex.wrapT = THREE.RepeatWrapping;
  return { mapTex, emisTex };
}

// ---------- 双组盒体:侧面(立面) / 顶底(屋面)分材质 ----------
export function makeTwoGroupBox() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const idx = Array.from(g.index.array);
  const face = (f) => idx.slice(f * 6, f * 6 + 6);
  // BoxGeometry 面序:+x,-x,+y,-y,+z,-z → 重排为 [+x,-x,+z,-z] + [+y,-y]
  const ni = [...face(0), ...face(1), ...face(4), ...face(5), ...face(2), ...face(3)];
  g.setIndex(ni);
  g.clearGroups();
  g.addGroup(0, 24, 0);  // 侧面 → 立面材质
  g.addGroup(24, 12, 1); // 顶底 → 屋面材质
  return g;
}

// 从非索引几何中抽出某个材质组(用于楔形楼分侧面/顶面合批)
function extractGroup(geo, matIndex) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const out = new THREE.BufferGeometry();
  const ranges = src.groups.filter((gr) => gr.materialIndex === matIndex);
  const attrs = ['position', 'normal', 'uv'];
  for (const name of attrs) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const size = a.itemSize;
    let total = 0;
    for (const r of ranges) total += r.count;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const r of ranges) {
      arr.set(a.array.subarray(r.start * size, (r.start + r.count) * size), off);
      off += r.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

const TINTS = {
  stoneA: () => new THREE.Color().setHSL(0.09, 0.22, 0.72),
  stoneB: () => new THREE.Color().setHSL(0.08, 0.05, 0.66),
  brick: () => new THREE.Color().setHSL(0.03, 0.42, 0.5),
  glassA: () => new THREE.Color().setHSL(0.56, 0.12, 0.78),
  glassB: () => new THREE.Color().setHSL(0.44, 0.1, 0.76),
};

function tierSpec(h) {
  if (h >= 150) return [[0.55, 1], [0.28, 0.76], [0.17, 0.54]];
  if (h >= 60) return [[0.7, 1], [0.3, 0.72]];
  return [[1, 1]];
}

export function buildBuildings(plan, envMap, rng, disposables) {
  const group = new THREE.Group();
  const nightMats = [];
  const texRng = rng.fork('facade');

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x46444a, roughness: 0.95 });
  applySnowPatch(roofMat);
  disposables.push(roofMat);

  const variants = {};
  for (const style of ['stoneA', 'stoneB', 'brick', 'glassA', 'glassB']) {
    const { mapTex, emisTex } = makeFacadeTexture(texRng.fork(style), style);
    const glass = style.startsWith('glass');
    const mat = new THREE.MeshStandardMaterial({
      map: mapTex, emissiveMap: emisTex,
      emissive: 0xffffff, emissiveIntensity: 0,
      roughness: glass ? 0.32 : 0.85,
      metalness: glass ? 0.5 : 0.03,
      envMap, envMapIntensity: glass ? 0.85 : 0.12,
    });
    mat.userData.nightGain = glass ? 0.9 : 1.3;
    applyFacadeRepPatch(mat);
    applySnowPatch(mat);
    nightMats.push(mat);
    disposables.push(mat, mapTex, emisTex);
    variants[style] = { mat, tiers: [] };
  }

  // ---------- 收集实例 ----------
  let windowCount = 0;
  const towerSpots = [], acSpots = [];
  for (const lot of plan.lots) {
    const style = lot.kind === 'glass' ? (lot.r < 0.5 ? 'glassA' : 'glassB') : lot.kind;
    const specs = tierSpec(lot.h);
    let y = 0;
    for (let t = 0; t < specs.length; t++) {
      const [hf, sf] = specs[t];
      const th = lot.h * hf, tw = lot.w * sf, td = lot.d * sf;
      variants[style].tiers.push({ x: lot.x, y, z: lot.z, w: tw, h: th, d: td, r: lot.r + t * 0.37 });
      y += th;
    }
    windowCount += Math.round(((lot.w + lot.d) * 2) / CELL_W) * Math.round(lot.h / CELL_H);
    if (lot.h > 24 && lot.h < 135 && (lot.r * 7919) % 1 < 0.4) {
      towerSpots.push({ x: lot.x + (((lot.r * 131) % 1) - 0.5) * lot.w * 0.4, y: lot.h, z: lot.z + (((lot.r * 197) % 1) - 0.5) * lot.d * 0.4, s: 0.85 + ((lot.r * 53) % 1) * 0.4 });
    } else if (lot.h >= 24 && (lot.r * 5417) % 1 < 0.5) {
      acSpots.push({ x: lot.x, y: lot.h, z: lot.z, s: 1 });
    }
  }

  // ---------- 实例化楼体 ----------
  const boxGeo = makeTwoGroupBox();
  disposables.push(boxGeo);
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), vp = new THREE.Vector3(), vs = new THREE.Vector3();
  let buildingCount = 0;
  for (const style of Object.keys(variants)) {
    const { mat, tiers } = variants[style];
    if (!tiers.length) continue;
    const geo = boxGeo.clone();
    const reps = new Float32Array(tiers.length * 2);
    const mesh = new THREE.InstancedMesh(geo, [mat, roofMat], tiers.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const tint = TINTS[style];
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      vp.set(t.x, t.y, t.z);
      vs.set(t.w, t.h, t.d);
      m4.compose(vp, q0, vs);
      mesh.setMatrixAt(i, m4);
      const c = tint();
      c.offsetHSL(((t.r * 17) % 1 - 0.5) * 0.02, 0, ((t.r * 29) % 1 - 0.5) * 0.1);
      mesh.setColorAt(i, c);
      reps[i * 2] = Math.max(0.5, ((t.w + t.d) / 2) / REP_X_DEN);
      reps[i * 2 + 1] = Math.max(0.25, t.h / REP_Y_DEN);
    }
    geo.setAttribute('aRep', new THREE.InstancedBufferAttribute(reps, 2));
    disposables.push(geo);
    group.add(mesh);
    buildingCount += tiers.length;
  }

  // ---------- 屋顶水塔 / 空调箱 ----------
  const towerGeo = mergeGeometries([
    new THREE.CylinderGeometry(2.0, 2.2, 4.0, 10).translate(0, 2.0, 0),
    new THREE.ConeGeometry(2.4, 1.8, 10).translate(0, 4.9, 0),
    new THREE.CylinderGeometry(0.18, 0.18, 1.6, 6).translate(0, -0.8, 0),
  ]);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x6f503b, roughness: 0.9 });
  applySnowPatch(towerMat);
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, Math.max(1, towerSpots.length));
  towers.castShadow = true;
  towerSpots.forEach((t, i) => {
    vp.set(t.x, t.y + 0.8, t.z); vs.setScalar(t.s);
    m4.compose(vp, q0, vs);
    towers.setMatrixAt(i, m4);
  });
  towers.count = towerSpots.length;
  group.add(towers);

  const acGeo = new THREE.BoxGeometry(2.4, 1.3, 1.9).translate(0, 0.65, 0);
  const acMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.8, metalness: 0.4 });
  applySnowPatch(acMat);
  const acs = new THREE.InstancedMesh(acGeo, acMat, Math.max(1, acSpots.length));
  acSpots.forEach((t, i) => {
    vp.set(t.x, t.y, t.z); vs.setScalar(t.s);
    m4.compose(vp, q0, vs);
    acs.setMatrixAt(i, m4);
  });
  acs.count = acSpots.length;
  group.add(acs);
  disposables.push(towerGeo, towerMat, acGeo, acMat);

  // ---------- 百老汇楔形楼(裁剪多边形挤出,分侧面/屋面两批合并) ----------
  const wedgeSides = [], wedgeCaps = [];
  for (const w of plan.wedges) {
    const shape = new THREE.Shape();
    shape.moveTo(w.poly[0].x, -w.poly[0].z);
    for (let i = 1; i < w.poly.length; i++) shape.lineTo(w.poly[i].x, -w.poly[i].z);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: w.h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    wedgeCaps.push(extractGroup(geo, 0));
    wedgeSides.push(extractGroup(geo, 1));
    geo.dispose();
  }
  if (wedgeSides.length) {
    const { mapTex, emisTex } = makeFacadeTexture(texRng.fork('wedge'), 'stoneA');
    mapTex.repeat.set(1 / REP_X_DEN, 1 / REP_Y_DEN);
    emisTex.repeat.set(1 / REP_X_DEN, 1 / REP_Y_DEN);
    const wedgeMat = new THREE.MeshStandardMaterial({
      map: mapTex, emissiveMap: emisTex, emissive: 0xffffff, emissiveIntensity: 0,
      color: 0xc9b8a2, roughness: 0.85,
    });
    wedgeMat.userData.nightGain = 1.2;
    applySnowPatch(wedgeMat);
    nightMats.push(wedgeMat);
    const sidesGeo = mergeGeometries(wedgeSides);
    const capsGeo = mergeGeometries(wedgeCaps);
    const sides = new THREE.Mesh(sidesGeo, wedgeMat);
    const caps = new THREE.Mesh(capsGeo, roofMat);
    sides.castShadow = caps.castShadow = true;
    sides.receiveShadow = true;
    group.add(sides, caps);
    disposables.push(sidesGeo, capsGeo, wedgeMat, mapTex, emisTex);
    for (const g of [...wedgeSides, ...wedgeCaps]) g.dispose();
    buildingCount += plan.wedges.length;
  }

  return {
    group,
    nightMats,
    stats: { buildings: buildingCount, windows: windowCount, waterTowers: towerSpots.length },
    // 夜晚点亮窗灯(由太阳高度驱动 0..1)
    setNight(f) {
      for (const m of nightMats) m.emissiveIntensity = f * (m.userData.nightGain || 1);
    },
  };
}
