// 物种定义与毛绒外观构建。尺寸 DIM 与 creature.js 的物理刚体一一对应(各部件局部坐标)。
import * as THREE from 'three';
import { furMesh, blobGeometry, capsuleGeometry } from './fur.js';

export const DIM = {
  torso: { r: 0.25, hh: 0.06, mass: 7.5 },
  head: { r: 0.31, vis: 0.335, mass: 3.6 },
  neck: { torso: [0, 0.27, 0], head: [0, -0.25, 0] },
  arm: { r: 0.085, hh: 0.08, mass: 0.9, anchor: [0, 0.16, 0], tip: [0, -0.17, 0] },
  shoulder: [0.27, 0.1, 0.0],
  leg: { r: 0.1, hh: 0.05, mass: 1.2, anchor: [0, 0.13, 0], tip: [0, -0.15, 0] },
  hip: [0.13, -0.19, 0],
};
export const STAND_H = 0.47; // 站立时躯干中心离地高度

const C = (h) => new THREE.Color(h);

export const SPECIES = [
  { id: 'dog', name: '柴犬', ears: 'pointy', tail: 'curl', snout: true, nose: '#2b211d',
    palettes: [['#e69a52', '#fff3e2'], ['#f4f1ea', '#ffffff'], ['#3d3330', '#e9dccb']] },
  { id: 'cat', name: '猫咪', ears: 'pointy', tail: 'long', snout: false, nose: '#e7838f', stripes: true,
    palettes: [['#f2a34e', '#fff1df'], ['#9aa1ab', '#f1f1f1'], ['#2f2b30', '#f4f0ea']] },
  { id: 'duck', name: '小鸭', ears: 'none', tail: 'tuft', beak: '#ff9a2e', limbColor: '#ff9a2e',
    palettes: [['#ffd84a', '#fff1a6'], ['#f5f3ee', '#ffffff'], ['#7fb4ff', '#d8ecff']] },
  { id: 'bunny', name: '兔子', ears: 'long', tail: 'puff', snout: false, nose: '#f08aa0',
    palettes: [['#f4efeb', '#ffffff'], ['#c8a07e', '#f5e7d8'], ['#8b8b92', '#e8e8ec']] },
  { id: 'bear', name: '棕熊', ears: 'round', tail: 'stub', snout: true, nose: '#2a1c16',
    palettes: [['#8d5a35', '#d9b48c'], ['#f1ece4', '#ffffff'], ['#3b3330', '#a8876a']] },
  { id: 'panda', name: '熊猫', ears: 'round', tail: 'stub', snout: false, nose: '#1d1d1f', panda: true,
    palettes: [['#f6f4f0', '#1f1e22'], ['#f4ddd8', '#5b3a34']] },
  { id: 'fox', name: '狐狸', ears: 'pointy', tail: 'bushy', snout: true, nose: '#241a17', socks: true,
    palettes: [['#e8723a', '#fff4ea'], ['#e9e6e0', '#ffffff'], ['#5a4b62', '#efe6f4']] },
  { id: 'penguin', name: '企鹅', ears: 'none', tail: 'none', beak: '#ff9f2c', limbColor: '#ff9f2c', penguin: true,
    palettes: [['#26282f', '#fbfbfb'], ['#3a5f9e', '#fbfbfb']] },
];
export const speciesById = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

// ------- 表情贴图 -------
const faceTex = {};
function makeFaceTex(kind) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.lineCap = 'round';
  g.fillStyle = '#16131a'; g.strokeStyle = '#16131a';
  if (kind === 'open' || kind === 'blink0') {
    g.beginPath(); g.ellipse(64, 54, 22, 28, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(56, 43, 8, 9, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(72, 66, 4, 4, 0, 0, Math.PI * 2); g.fill();
  } else if (kind === 'blink') {
    g.lineWidth = 9; g.beginPath(); g.moveTo(44, 58); g.quadraticCurveTo(64, 70, 84, 58); g.stroke();
  } else if (kind === 'ko') {
    g.lineWidth = 6; g.beginPath();
    for (let a = 0; a < Math.PI * 6; a += 0.15) { const r = 2 + a * 3.6; g.lineTo(64 + Math.cos(a) * r, 56 + Math.sin(a) * r); }
    g.stroke();
  } else if (kind === 'hurt') {
    g.lineWidth = 10; g.beginPath(); g.moveTo(42, 38); g.lineTo(80, 56); g.lineTo(42, 74); g.stroke();
  } else if (kind === 'happy') {
    g.lineWidth = 10; g.beginPath(); g.moveTo(42, 64); g.quadraticCurveTo(64, 30, 86, 64); g.stroke();
  } else if (kind === 'angry') {
    g.beginPath(); g.ellipse(64, 60, 20, 22, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(57, 52, 6, 7, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 9; g.beginPath(); g.moveTo(36, 28); g.lineTo(88, 40); g.stroke();
  }
  // 腮红
  if (kind !== 'ko') {
    g.fillStyle = 'rgba(255,120,140,0.55)';
    g.beginPath(); g.ellipse(64, 108, 22, 11, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function getFaceTex(kind) {
  if (typeof document === 'undefined') return null;
  return faceTex[kind] || (faceTex[kind] = makeFaceTex(kind));
}
let mouthTex = null;
function getMouthTex() {
  if (mouthTex || typeof document === 'undefined') return mouthTex;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const g = cv.getContext('2d');
  g.strokeStyle = '#2a1a1a'; g.lineWidth = 8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(24, 18); g.quadraticCurveTo(44, 46, 64, 22); g.quadraticCurveTo(84, 46, 104, 18); g.stroke();
  mouthTex = new THREE.CanvasTexture(cv); mouthTex.colorSpace = THREE.SRGBColorSpace;
  return mouthTex;
}

// ------- 配色函数 -------
function painter(sp, pal, part) {
  const main = C(pal[0]), light = C(pal[1]);
  const limb = sp.limbColor ? C(sp.limbColor) : null;
  const dark = main.clone().multiplyScalar(0.62);
  const black = C('#1f1e22');
  return (p, n, out) => {
    out.copy(main);
    if (sp.panda) {
      // 熊猫:四肢黑、肩带黑、黑眼圈
      if (part === 'arm' || part === 'leg') { out.copy(light); return; }
      if (part === 'torso' && p.y > 0.1) { out.copy(light); return; }
      if (part === 'head') {
        for (const sx of [-1, 1]) {
          const ex = sx * 0.12, ey = 0.04, ez = 0.27;
          const d = ((p.x - ex) / 0.085) ** 2 + ((p.y - ey) / 0.105) ** 2 + ((p.z - ez) / 0.2) ** 2;
          if (d < 1 && p.z > 0.15) { out.copy(light); return; }
        }
      }
      return;
    }
    if (sp.penguin) {
      if (part === 'torso' && p.z > 0.02) out.copy(light);
      if (part === 'head' && p.z > 0.12 && p.y < 0.16) out.copy(light);
      if (part === 'leg') out.copy(limb);
      return;
    }
    if (part === 'leg' && limb) { if (p.y < -0.02) out.copy(limb); return; }
    if (part === 'torso' && p.z > 0.12 && p.y < 0.14) out.lerp(light, 0.9);
    if (part === 'head') {
      if (!sp.beak && p.z > 0.18 && p.y < -0.02) out.copy(light);
      if (sp.stripes && p.y > 0.12 && p.z < 0.25 && Math.sin(p.x * 46) > 0.45) out.copy(dark);
      if (sp.id === 'dog' && p.z > 0.24 && p.y > 0.1 && p.y < 0.16 && Math.abs(Math.abs(p.x) - 0.1) < 0.03) out.copy(light);
    }
    if (part === 'arm' && p.y < -0.1) out.lerp(sp.socks ? black : light, sp.socks ? 0.85 : 0.5);
    if (part === 'leg' && p.y < -0.08) out.lerp(sp.socks ? black : light, sp.socks ? 0.85 : 0.5);
    if (sp.stripes && part === 'torso' && p.z < 0 && Math.sin(p.y * 40) > 0.5) out.copy(dark);
  };
}

const geoCache = new Map();
function cachedFur(key, make, paint, opts) {
  let m = geoCache.get(key);
  if (!m) { m = furMesh(make(), paint, opts); geoCache.set(key, m); }
  const mesh = new THREE.Mesh(m.geometry, m.material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

function smoothMat(color, rough = 0.45) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
}

// 构建一只动物的可视部件(每个对应一个刚体)
export function buildVisual(speciesId, palIdx = 0) {
  const sp = speciesById[speciesId];
  const pal = sp.palettes[palIdx % sp.palettes.length];
  const key = `${sp.id}:${palIdx}`;
  const parts = {};

  // 躯干:梨形
  parts.torso = new THREE.Group();
  const torso = cachedFur(key + ':torso', () => {
    const g = blobGeometry(0.3, 0.35, 0.28, 30, 22);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const s = y < 0 ? 1 + (-y) * 0.45 : 1 - y * 0.12;
      p.setX(i, p.getX(i) * s); p.setZ(i, p.getZ(i) * s);
      p.setY(i, y - 0.02);
    }
    g.computeVertexNormals();
    return g;
  }, painter(sp, pal, 'torso'), { layers: 11 });
  parts.torso.add(torso);

  // 尾巴
  const tail = buildTail(sp, pal, key);
  if (tail) { tail.position.set(0, -0.12, -0.27); parts.torso.add(tail); parts.tail = tail; }

  // 头
  parts.head = new THREE.Group();
  const R = DIM.head.vis;
  const head = cachedFur(key + ':head', () => blobGeometry(R * 1.04, R * 0.95, R, 34, 26), painter(sp, pal, 'head'), { layers: 12 });
  parts.head.add(head);
  // 眼睛与嘴(贴花平面)
  const eyes = [];
  for (const sx of [-1, 1]) {
    const mat = new THREE.MeshBasicMaterial({ map: getFaceTex('open'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const eye = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), mat);
    const dir = new THREE.Vector3(sx * 0.37, 0.06, 0.93).normalize();
    eye.position.copy(dir).multiplyScalar(R * 1.0 + 0.04);
    eye.lookAt(dir.clone().multiplyScalar(5));
    eye.renderOrder = 2;
    parts.head.add(eye); eyes.push(eye);
  }
  parts.eyes = eyes;
  if (sp.beak) {
    const beak = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), smoothMat(sp.beak, 0.5));
    beak.scale.set(0.15, 0.06, 0.13);
    beak.position.set(0, -0.06, R + 0.04);
    beak.castShadow = true;
    parts.head.add(beak);
    const beak2 = beak.clone(); beak2.scale.set(0.12, 0.045, 0.1); beak2.position.y = -0.11; beak2.position.z = R + 0.0;
    parts.head.add(beak2);
  } else {
    if (sp.snout) {
      const sn = cachedFur(key + ':snout', () => blobGeometry(0.13, 0.09, 0.1, 18, 12), (p, n, o) => o.set(pal[1]), { layers: 7 });
      sn.position.set(0, -0.08, R - 0.03);
      parts.head.add(sn);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), smoothMat(sp.nose, 0.3));
    nose.scale.set(0.045, 0.032, 0.03);
    nose.position.set(0, sp.snout ? -0.045 : -0.035, sp.snout ? R + 0.1 : R + 0.03);
    parts.head.add(nose);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.055), new THREE.MeshBasicMaterial({ map: getMouthTex(), transparent: true, depthWrite: false }));
    mouth.position.set(0, sp.snout ? -0.11 : -0.085, sp.snout ? R + 0.085 : R + 0.035);
    mouth.rotation.x = -0.25;
    parts.head.add(mouth);
  }
  buildEars(sp, pal, key, parts.head, R);

  // 手臂、腿
  for (const side of ['L', 'R']) {
    const a = new THREE.Group();
    a.add(cachedFur(key + ':arm', () => capsuleGeometry(DIM.arm.r * 1.05, DIM.arm.hh * 2 + 0.03, 12, 8), painter(sp, pal, 'arm'), { layers: 8 }));
    parts['arm' + side] = a;
    const l = new THREE.Group();
    l.add(cachedFur(key + ':leg', () => {
      const g = capsuleGeometry(DIM.leg.r * 1.05, DIM.leg.hh * 2, 12, 8);
      // 脚掌向前略鼓
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.06 && p.getZ(i) > 0) p.setZ(i, p.getZ(i) * 1.35);
      g.computeVertexNormals();
      return g;
    }, painter(sp, pal, 'leg'), { layers: 8 }));
    parts['leg' + side] = l;
  }

  let faceState = 'open';
  parts.setFace = (kind) => {
    if (kind === faceState) return;
    faceState = kind;
    const t = getFaceTex(kind);
    for (const e of eyes) { e.material.map = t; e.material.needsUpdate = true; }
  };
  return parts;
}

function buildEars(sp, pal, key, head, R) {
  if (sp.ears === 'none') {
    if (sp.id === 'duck') {
      // 头顶呆毛
      const tuft = cachedFur(key + ':tuft', () => blobGeometry(0.03, 0.09, 0.03, 10, 8), (p, n, o) => o.set(pal[0]), { layers: 6 });
      tuft.position.set(0, R + 0.03, 0.02); tuft.rotation.z = 0.3;
      head.add(tuft);
    }
    return;
  }
  const inner = sp.panda ? pal[1] : (sp.id === 'bunny' || sp.id === 'cat' ? '#f6b6c2' : pal[1]);
  for (const sx of [-1, 1]) {
    let ear;
    if (sp.ears === 'pointy') {
      ear = cachedFur(key + ':earP', () => {
        const g = new THREE.ConeGeometry(0.1, 0.19, 14, 4); g.scale(1, 1, 0.55); g.computeVertexNormals(); return g;
      }, (p, n, o) => o.set(n.z > 0.3 && Math.abs(p.x) < 0.06 ? inner : pal[0]), { layers: 7 });
      ear.position.set(sx * 0.17, R * 0.82, -0.02);
      ear.rotation.set(-0.15, 0, -sx * 0.32);
    } else if (sp.ears === 'round') {
      ear = cachedFur(key + ':earR', () => blobGeometry(0.095, 0.09, 0.05, 16, 12),
        (p, n, o) => o.set(sp.panda ? pal[1] : (n.z > 0.4 && p.y < 0.05 ? pal[1] : pal[0])), { layers: 7 });
      ear.position.set(sx * 0.22, R * 0.78, -0.03);
      ear.rotation.z = -sx * 0.4;
    } else if (sp.ears === 'long') {
      ear = cachedFur(key + ':earL', () => {
        const g = capsuleGeometry(0.065, 0.24, 12, 8); g.scale(1, 1, 0.55); g.translate(0, 0.17, 0); g.computeVertexNormals(); return g;
      }, (p, n, o) => o.set(n.z > 0.35 && Math.abs(p.x) < 0.04 && p.y > 0.08 ? inner : pal[0]), { layers: 7 });
      ear.position.set(sx * 0.11, R * 0.82, -0.04);
      ear.rotation.set(-0.2, 0, -sx * 0.22);
      ear.userData.flop = sx;
    }
    head.add(ear);
  }
}

function buildTail(sp, pal, key) {
  const g = new THREE.Group();
  let m;
  switch (sp.tail) {
    case 'curl':
      m = cachedFur(key + ':tailCurl', () => {
        const t = new THREE.TorusGeometry(0.08, 0.045, 10, 18, Math.PI * 1.5); t.computeVertexNormals(); return t;
      }, (p, n, o) => o.set(p.y > 0.06 ? pal[1] : pal[0]), { layers: 7 });
      m.rotation.set(0, Math.PI / 2, 0); m.position.set(0, 0.12, -0.02);
      break;
    case 'long':
      m = cachedFur(key + ':tailLong', () => {
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.05, -0.15), new THREE.Vector3(0, 0.25, -0.22), new THREE.Vector3(0, 0.38, -0.14)]);
        const t = new THREE.TubeGeometry(curve, 16, 0.04, 8); t.computeVertexNormals(); return t;
      }, (p, n, o) => o.set(sp.stripes && Math.sin(p.y * 40 + p.z * 30) > 0.3 ? C(pal[0]).multiplyScalar(0.65) : C(pal[0])), { layers: 7 });
      break;
    case 'bushy':
      m = cachedFur(key + ':tailBushy', () => {
        const t = blobGeometry(0.11, 0.25, 0.11, 18, 14); t.rotateX(-0.9); t.translate(0, 0.14, -0.16); t.computeVertexNormals(); return t;
      }, (p, n, o) => o.set(p.y > 0.28 ? pal[1] : pal[0]), { layers: 9 });
      break;
    case 'puff':
      m = cachedFur(key + ':tailPuff', () => blobGeometry(0.08, 0.08, 0.08, 14, 10), (p, n, o) => o.set(pal[1]), { layers: 9, length: 0.04 });
      break;
    case 'stub':
      m = cachedFur(key + ':tailStub', () => blobGeometry(0.06, 0.06, 0.06, 12, 10), (p, n, o) => o.set(sp.panda ? pal[0] : pal[0]), { layers: 7 });
      break;
    case 'tuft':
      m = cachedFur(key + ':tailTuft', () => { const t = new THREE.ConeGeometry(0.07, 0.14, 12); t.rotateX(-1.1); t.computeVertexNormals(); return t; }, (p, n, o) => o.set(pal[0]), { layers: 7 });
      m.position.set(0, 0.04, -0.03);
      break;
    default: return null;
  }
  g.add(m);
  return g;
}
