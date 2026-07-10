// 四座手工建模地标:帝国大厦(退台+尖顶)、克莱斯勒(叠拱冠顶+旭日纹)、
// 世贸一号(方转 45° 渐变收分八面体)、熨斗大厦(百老汇楔形挤出+檐口)。
import * as THREE from 'three';
import { applySnowPatch } from '../core/shaderpatch.js';
import { makeTwoGroupBox } from './buildings.js';

// 侧面 UV 按世界尺寸缩放的退台盒(与共享条纹贴图配合,窗格不拉伸)
const BASE_BOX = makeTwoGroupBox();
function tierBox(w, h, d) {
  const g = BASE_BOX.clone();
  const uv = g.attributes.uv;
  const su = (faceW) => faceW / 30, sv = h / 43.2;
  // 面序(顶点仍按 BoxGeometry 原序):px 0-3, nx 4-7, py 8-11, ny 12-15, pz 16-19, nz 20-23
  for (let i = 0; i < 24; i++) {
    if (i >= 8 && i < 16) continue; // 顶底不动
    const faceW = i < 8 ? d : w;
    uv.setXY(i, uv.getX(i) * su(faceW), uv.getY(i) * sv);
  }
  g.scale(w, h, d);
  return g;
}

// 竖条窗立面(装饰艺术风格)
function makeStripeFacade(rng, bg, stripeCol) {
  const W = 256, H = 512, cols = 14, rows = 26;
  const map = document.createElement('canvas');
  map.width = W; map.height = H;
  const mc = map.getContext('2d');
  const emis = document.createElement('canvas');
  emis.width = W; emis.height = H;
  const ec = emis.getContext('2d');
  ec.fillStyle = '#000'; ec.fillRect(0, 0, W, H);
  mc.fillStyle = bg; mc.fillRect(0, 0, W, H);
  const cw = W / cols, ch = H / rows;
  for (let c = 0; c < cols; c++) {
    const x = c * cw + cw * 0.28, w = cw * 0.44;
    mc.fillStyle = stripeCol;
    mc.fillRect(x, 0, w, H);
    for (let r = 0; r < rows; r++) {
      mc.fillStyle = 'rgba(190,180,160,0.5)';
      mc.fillRect(x, r * ch + ch * 0.82, w, ch * 0.18); // 层间横梁
      if (rng.chance(0.3)) {
        const b = rng.range(0.5, 1);
        ec.fillStyle = `rgba(255,${Math.round(200 * b + 25)},${Math.round(140 * b)},${b})`;
        ec.fillRect(x + 1, r * ch + 1, w - 2, ch * 0.8);
      }
    }
  }
  const mapTex = new THREE.CanvasTexture(map);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  const emisTex = new THREE.CanvasTexture(emis);
  emisTex.colorSpace = THREE.SRGBColorSpace;
  emisTex.wrapS = emisTex.wrapT = THREE.RepeatWrapping;
  return { mapTex, emisTex };
}

// 克莱斯勒冠顶旭日纹(三角窗)
function makeSunburstTexture() {
  const W = 256, H = 128;
  const map = document.createElement('canvas');
  map.width = W; map.height = H;
  const mc = map.getContext('2d');
  const emis = document.createElement('canvas');
  emis.width = W; emis.height = H;
  const ec = emis.getContext('2d');
  mc.fillStyle = '#aeb6c2'; mc.fillRect(0, 0, W, H);
  ec.fillStyle = '#000'; ec.fillRect(0, 0, W, H);
  const n = 10;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * (W / n);
    for (const [ctx2, col] of [[mc, '#3c414c'], [ec, 'rgba(255,224,170,0.95)']]) {
      ctx2.fillStyle = col;
      ctx2.beginPath();
      ctx2.moveTo(cx, H * 0.12);
      ctx2.lineTo(cx - W / n * 0.32, H * 0.88);
      ctx2.lineTo(cx + W / n * 0.32, H * 0.88);
      ctx2.closePath();
      ctx2.fill();
    }
  }
  const mapTex = new THREE.CanvasTexture(map);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.wrapS = mapTex.wrapT = THREE.RepeatWrapping;
  const emisTex = new THREE.CanvasTexture(emis);
  emisTex.colorSpace = THREE.SRGBColorSpace;
  emisTex.wrapS = emisTex.wrapT = THREE.RepeatWrapping;
  return { mapTex, emisTex };
}

// 世贸一号:底面正方形 → 顶面旋转 45° 正方形,8 个交替三角面
function makeWtcGeometry(baseR, topR, h) {
  const pos = [];
  const b = [], t = [];
  for (let k = 0; k < 4; k++) {
    const ab = (Math.PI / 4) + k * Math.PI / 2;
    const at = k * Math.PI / 2;
    b.push([Math.cos(ab) * baseR, 0, Math.sin(ab) * baseR]);
    t.push([Math.cos(at) * topR, h, Math.sin(at) * topR]);
  }
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    pos.push(...b[k], ...t[k1], ...b[k1]);   // 正三角
    pos.push(...t[k1], ...b[k], ...t[k]);    // 倒三角
  }
  // 顶盖
  pos.push(...t[0], ...t[1], ...t[2], ...t[0], ...t[2], ...t[3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function buildLandmarks(plan, envMap, rng, disposables) {
  const group = new THREE.Group();
  const nightMats = [];
  const targets = []; // 雷击目标(最高点)
  const D = (...xs) => disposables.push(...xs);

  const metalMat = new THREE.MeshStandardMaterial({ color: 0xc7ccd4, metalness: 0.92, roughness: 0.3, envMap, envMapIntensity: 1 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a484e, roughness: 0.95 });
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a18, emissiveIntensity: 0.2 });
  applySnowPatch(roofMat);
  D(metalMat, roofMat, beaconMat);

  const addBeacon = (x, y, z) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), beaconMat);
    b.position.set(x, y, z);
    group.add(b);
    D(b.geometry);
  };

  // ---------- 帝国大厦 ----------
  {
    const { x, z } = plan.landmarks.esb;
    const g = new THREE.Group();
    const { mapTex, emisTex } = makeStripeFacade(rng.fork('esb'), '#d9cdb2', '#4c5058');
    const mat = new THREE.MeshStandardMaterial({
      map: mapTex, emissiveMap: emisTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8,
    });
    mat.userData.nightGain = 1.25;
    applySnowPatch(mat);
    nightMats.push(mat);
    D(mat, mapTex, emisTex);

    const plaza = new THREE.Mesh(new THREE.BoxGeometry(64, 2.4, 42), new THREE.MeshStandardMaterial({ color: 0xb0a894, roughness: 0.9 }));
    plaza.position.y = 1.2;
    g.add(plaza);
    D(plaza.geometry, plaza.material);
    applySnowPatch(plaza.material);

    const tiers = [[54, 88, 34], [44, 64, 28], [34, 58, 24], [26, 48, 19], [18, 36, 14]];
    let y = 2.4;
    for (const [w, h, d] of tiers) {
      const geo = tierBox(w, h, d);
      const m = new THREE.Mesh(geo, [mat, roofMat]);
      m.position.y = y;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      D(geo);
      y += h;
    }
    const crown1 = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 14, 12), metalMat);
    crown1.position.y = y + 7;
    const crown2 = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, 12, 12), metalMat);
    crown2.position.y = y + 20;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.1, 34, 8), metalMat);
    mast.position.y = y + 43;
    crown1.castShadow = crown2.castShadow = true;
    g.add(crown1, crown2, mast);
    D(crown1.geometry, crown2.geometry, mast.geometry);
    addBeacon(x, y + 61, z);
    g.position.set(x, 0, z);
    group.add(g);
    targets.push({ x, y: y + 60, z, name: '帝国大厦' });
  }

  // ---------- 克莱斯勒大厦 ----------
  {
    const { x, z } = plan.landmarks.chrysler;
    const g = new THREE.Group();
    const { mapTex, emisTex } = makeStripeFacade(rng.fork('chr'), '#cfc8bc', '#464a53');
    const mat = new THREE.MeshStandardMaterial({
      map: mapTex, emissiveMap: emisTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.75,
    });
    mat.userData.nightGain = 1.2;
    applySnowPatch(mat);
    nightMats.push(mat);
    D(mat, mapTex, emisTex);

    const tiers = [[36, 58, 26], [30, 66, 22], [24, 58, 18]];
    let y = 0;
    for (const [w, h, d] of tiers) {
      const geo = tierBox(w, h, d);
      const m = new THREE.Mesh(geo, [mat, roofMat]);
      m.position.y = y;
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      D(geo);
      y += h;
    }
    // 叠拱冠顶(车削半拱 × 6 层递减,旭日纹贴图)
    const sb = makeSunburstTexture();
    const crownMat = new THREE.MeshStandardMaterial({
      map: sb.mapTex, emissiveMap: sb.emisTex, emissive: 0xffffff, emissiveIntensity: 0,
      metalness: 0.9, roughness: 0.32, envMap, envMapIntensity: 1,
    });
    crownMat.userData.nightGain = 1.5;
    nightMats.push(crownMat);
    D(crownMat, sb.mapTex, sb.emisTex);
    let r = 12.5, ch = 10.5;
    for (let i = 0; i < 6; i++) {
      const pts = [];
      for (let j = 0; j <= 8; j++) {
        const a = (j / 8) * Math.PI * 0.5;
        pts.push(new THREE.Vector2(r * Math.cos(a), ch * Math.sin(a)));
      }
      const dome = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), crownMat);
      dome.position.y = y - 2;
      dome.castShadow = true;
      g.add(dome);
      D(dome.geometry);
      y += ch * 0.62;
      r *= 0.76; ch *= 0.92;
    }
    const needle = new THREE.Mesh(new THREE.ConeGeometry(1.1, 26, 8), metalMat);
    needle.position.y = y + 11;
    g.add(needle);
    D(needle.geometry);
    g.position.set(x, 0, z);
    group.add(g);
    targets.push({ x, y: y + 22, z, name: '克莱斯勒大厦' });
  }

  // ---------- 世贸中心一号楼 ----------
  {
    const { x, z } = plan.landmarks.wtc;
    const g = new THREE.Group();
    const podium = new THREE.Mesh(new THREE.BoxGeometry(40, 38, 40).translate(0, 19, 0),
      new THREE.MeshStandardMaterial({ color: 0x8f9aa4, metalness: 0.5, roughness: 0.4, envMap, envMapIntensity: 0.6 }));
    podium.castShadow = podium.receiveShadow = true;
    g.add(podium);
    D(podium.geometry, podium.material);

    const towerGeo = makeWtcGeometry(29, 19.5, 204);
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x54748c, metalness: 0.92, roughness: 0.16, envMap, envMapIntensity: 0.85,
      emissive: 0x1c2c3c, emissiveIntensity: 0.35,
    });
    const tower = new THREE.Mesh(towerGeo, glassMat);
    tower.position.y = 38;
    tower.castShadow = tower.receiveShadow = true;
    g.add(tower);
    D(towerGeo, glassMat);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 62, 8), metalMat);
    mast.position.y = 38 + 204 + 31;
    g.add(mast);
    D(mast.geometry);
    addBeacon(x, 38 + 204 + 62, z);
    g.position.set(x, 0, z);
    group.add(g);
    targets.push({ x, y: 304, z, name: '世贸中心一号楼' });
  }

  // ---------- 熨斗大厦(百老汇楔形) ----------
  if (plan.flatironWedge) {
    const w = plan.flatironWedge;
    const { mapTex, emisTex } = makeStripeFacade(rng.fork('flat'), '#c9b491', '#57524a');
    mapTex.repeat.set(1 / 26, 1 / 39.6);
    emisTex.repeat.set(1 / 26, 1 / 39.6);
    const mat = new THREE.MeshStandardMaterial({
      map: mapTex, emissiveMap: emisTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.82,
    });
    mat.userData.nightGain = 1.2;
    applySnowPatch(mat);
    nightMats.push(mat);
    D(mat, mapTex, emisTex);

    const mkShape = (scale) => {
      const s = new THREE.Shape();
      const c = { x: w.cx, z: w.cz };
      const p0 = w.poly.map((p) => ({ x: c.x + (p.x - c.x) * scale, z: c.z + (p.z - c.z) * scale }));
      s.moveTo(p0[0].x, -p0[0].z);
      for (let i = 1; i < p0.length; i++) s.lineTo(p0[i].x, -p0[i].z);
      s.closePath();
      return s;
    };
    const H = 84;
    const pieces = [
      { shape: mkShape(1.05), y: 0, h: 7 },      // 基座带
      { shape: mkShape(0.96), y: 7, h: H - 10 }, // 主体
      { shape: mkShape(1.08), y: H - 3, h: 3 },  // 檐口
    ];
    for (const p of pieces) {
      const geo = new THREE.ExtrudeGeometry(p.shape, { depth: p.h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, [roofMat, mat]);
      m.position.y = p.y;
      m.castShadow = m.receiveShadow = true;
      group.add(m);
      D(geo);
    }
    targets.push({ x: w.cx, y: H, z: w.cz, name: '熨斗大厦' });
  }

  let t = 0;
  return {
    group, targets, nightMats,
    update(dt, night) {
      t += dt;
      // 航空警示灯:夜间闪烁
      beaconMat.emissiveIntensity = 0.25 + (Math.sin(t * 2.6) > 0.2 ? 2.6 : 0) * (0.35 + night * 0.65);
    },
  };
}
