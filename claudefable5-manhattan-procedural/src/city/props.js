// 街道设施:实例化路灯(夜间光晕地池)、路口红绿灯(由交通仿真驱动换相)、
// 井盖蒸汽(公告板实例粒子)、时代广场动画广告牌(画布纹理逐帧绘制)。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, islandHalfWidth, inPark, broadwayX } from './plan.js';

function radialTexture(inner = 'rgba(255,235,190,0.9)', outer = 'rgba(255,235,190,0)') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

// ---------- 路灯 ----------
function buildLamps(plan, rng, group, disposables) {
  const spots = [];
  for (const ax of CITY.aveXs) {
    for (const side of [-1, 1]) {
      for (let z = -552 + (side > 0 ? 21 : 0); z < 446; z += 42) {
        const x = ax + side * (CITY.aveW / 2 + 1.4);
        if (!islandHalfWidth(z) || Math.abs(x) > islandHalfWidth(z) - 12) continue;
        if (inPark(x, z, 2)) continue;
        if (Math.abs(z - CITY.bridge.z) < 12 && x > 150) continue;
        spots.push({ x, z, rot: side > 0 ? Math.PI : 0 }); // 灯臂朝向路面
      }
    }
  }

  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.11, 0.15, 7.4, 6).translate(0, 3.7, 0),
    new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5).rotateZ(Math.PI / 2).translate(1.2, 7.2, 0),
  ]);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x2f3338, roughness: 0.7, metalness: 0.6 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);

  const headGeo = new THREE.SphereGeometry(0.34, 8, 6);
  headGeo.scale(1.5, 0.8, 1);
  const headMat = new THREE.MeshStandardMaterial({ color: 0x35322c, emissive: 0xffd9a3, emissiveIntensity: 0 });
  const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);

  const poolGeo = new THREE.CircleGeometry(8.2, 20).rotateX(-Math.PI / 2);
  const poolTex = radialTexture();
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, spots.length);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  spots.forEach((s, i) => {
    e.set(0, s.rot, 0);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(s.x, 0.42, s.z), q, new THREE.Vector3(1, 1, 1));
    poles.setMatrixAt(i, m4);
    const dx = Math.cos(s.rot) * 2.35;
    m4.compose(new THREE.Vector3(s.x + dx, 7.6, s.z), q, new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(s.x + dx, 0.58, s.z), q, new THREE.Vector3(1, 1, 1));
    pools.setMatrixAt(i, m4);
  });
  poles.castShadow = true;
  group.add(poles, heads, pools);
  disposables.push(poleGeo, poleMat, headGeo, headMat, poolGeo, poolMat, poolTex);
  return { headMat, poolMat, count: spots.length };
}

// ---------- 红绿灯(交通仿真驱动) ----------
const SIG_COLORS = {
  R: new THREE.Color(0xff4b38), Y: new THREE.Color(0xffc22e), G: new THREE.Color(0x2bd97e),
  offR: new THREE.Color(0x351512), offY: new THREE.Color(0x33290e), offG: new THREE.Color(0x0e2c1c),
};

function buildSignals(plan, group, disposables) {
  const nodes = plan.nodes;
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6).translate(0, 2.8, 0),
    new THREE.BoxGeometry(0.5, 1.7, 0.42).translate(0, 5.4, 0.1),   // 面向大道车流(±z)
    new THREE.BoxGeometry(0.42, 1.7, 0.5).translate(0.1, 3.6, 0),   // 面向街道车流(±x)
  ]);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.6, metalness: 0.55 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, nodes.length * 2);

  const bulbGeo = new THREE.SphereGeometry(0.2, 6, 5);
  const bulbMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, nodes.length * 12);

  const m4 = new THREE.Matrix4();
  const dx = CITY.aveW / 2 + 1.6, dz = CITY.streetW / 2 + 1.6;
  nodes.forEach((n, ni) => {
    [[-dx, -dz], [dx, dz]].forEach(([ox, oz], pi) => {
      m4.identity().setPosition(n.x + ox, 0.42, n.z + oz);
      poles.setMatrixAt(ni * 2 + pi, m4);
      // 每根杆 2 组 × 3 只灯泡:组0 面向大道(挂高处),组1 面向街道
      for (let head = 0; head < 2; head++) {
        for (let slot = 0; slot < 3; slot++) {
          const y = (head === 0 ? 6.0 : 4.2) - slot * 0.52;
          const bx = n.x + ox + (head === 0 ? 0 : 0.38);
          const bz = n.z + oz + (head === 0 ? 0.34 : 0);
          m4.identity().setPosition(bx, y, bz);
          bulbs.setMatrixAt(ni * 12 + pi * 6 + head * 3 + slot, m4);
        }
      }
    });
  });
  const dim = new THREE.Color(0x111318);
  for (let i = 0; i < nodes.length * 12; i++) bulbs.setColorAt(i, dim);
  group.add(poles, bulbs);
  disposables.push(poleGeo, poleMat, bulbGeo, bulbMat);

  // state: 'G'|'Y'|'R' → 大道方向;街道方向互补
  function setNodeState(ni, aveState, stState) {
    const seq = ['R', 'Y', 'G'];
    for (let pi = 0; pi < 2; pi++) {
      for (let head = 0; head < 2; head++) {
        const state = head === 0 ? aveState : stState;
        for (let slot = 0; slot < 3; slot++) {
          const litName = seq[slot];
          const lit = state === litName;
          const c = lit ? SIG_COLORS[litName] : SIG_COLORS['off' + litName];
          bulbs.setColorAt(ni * 12 + pi * 6 + head * 3 + slot, c);
        }
      }
    }
    bulbs.instanceColor.needsUpdate = true;
  }
  return { setNodeState };
}

// ---------- 井盖蒸汽 ----------
function buildSteam(plan, rng, group, disposables) {
  const emitters = [];
  const cand = plan.nodes.filter((n) => n.z > -392 && n.z < 440);
  for (let i = 0; i < 9 && cand.length; i++) {
    const n = cand[rng.int(0, cand.length - 1)];
    emitters.push({ x: n.x + rng.range(-4, 4), z: n.z + rng.range(10, 22) });
  }
  const PUFFS = 5;
  const count = emitters.length * PUFFS;
  const tex = radialTexture('rgba(230,232,238,0.55)', 'rgba(230,232,238,0)');
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const geo = new THREE.PlaneGeometry(3.6, 4.4);
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  mesh.frustumCulled = false;
  const parts = [];
  for (let i = 0; i < count; i++) {
    const em = emitters[Math.floor(i / PUFFS)];
    parts.push({
      x: em.x, z: em.z,
      age: rng.range(0, 1), life: rng.range(2.6, 4.4),
      drift: rng.range(-0.4, 0.4), s: rng.range(0.7, 1.3),
    });
  }
  mesh.count = count;
  group.add(mesh);
  disposables.push(geo, mat, tex);

  const m4 = new THREE.Matrix4(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), col = new THREE.Color();
  return {
    update(dt, camera, wind) {
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.age += dt / p.life;
        if (p.age > 1) p.age -= 1;
        const h = p.age * 9;
        pos.set(p.x + p.drift * h + wind * 0.12 * h, 1 + h, p.z);
        const s = p.s * (0.6 + p.age * 1.8);
        sc.set(s, s, s);
        m4.compose(pos, camera.quaternion, sc);
        mesh.setMatrixAt(i, m4);
        const a = Math.sin(p.age * Math.PI) * 0.32;
        col.setScalar(a);
        mesh.setColorAt(i, col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}

// ---------- 时代广场广告牌 ----------
const BB_TEXTS = ['MODELBENCH LAB', '曼哈顿 · MANHATTAN', 'CLAUDE FABLE 5', 'BROADWAY 百老汇', 'NEW YORK 纽约'];

function buildBillboards(plan, rng, group, disposables) {
  const ts = plan.landmarks.timesSquare;
  const defs = [
    { x: -79.6, y: 26, z: ts.z + 10, ry: -Math.PI / 2, w: 17, h: 10 },
    { x: -100.4, y: 32, z: ts.z - 26, ry: Math.PI / 2, w: 15, h: 9 },
    { x: -79.6, y: 44, z: ts.z - 34, ry: -Math.PI / 2, w: 13, h: 8 },
    { x: broadwayX(ts.z + 44) + 12, y: 20, z: ts.z + 44, ry: -Math.PI / 2 - 0.29, w: 14, h: 8 },
  ];
  const boards = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.6, metalness: 0.5 });
  disposables.push(frameMat);
  defs.forEach((d, bi) => {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    const geo = new THREE.PlaneGeometry(d.w, d.h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(d.x, d.y, d.z);
    mesh.rotation.y = d.ry;
    // 背后钢架(避免"悬空")
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, d.h + 2, d.w + 1.5), frameMat);
    back.position.set(d.x + Math.cos(d.ry + Math.PI / 2) * -0.4, d.y, d.z + Math.sin(d.ry + Math.PI / 2) * 0.4);
    back.rotation.y = d.ry;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, d.y, 0.9), frameMat);
    post.position.set(d.x, d.y / 2, d.z);
    group.add(mesh, back, post);
    disposables.push(geo, mat, tex, back.geometry, post.geometry);
    boards.push({
      cv, tex, mode: bi % 3, hue: rng.range(0, 360), off: rng.range(0, 900),
      text: BB_TEXTS[bi % BB_TEXTS.length],
    });
  });

  let acc = 0;
  return {
    update(dt, t) {
      acc += dt;
      if (acc < 0.12) return;
      acc = 0;
      for (const b of boards) {
        const ctx = b.cv.getContext('2d');
        const W = 256, H = 128;
        if (b.mode === 0) {
          // 滚动大字
          ctx.fillStyle = '#050510';
          ctx.fillRect(0, 0, W, H);
          ctx.font = 'bold 54px sans-serif';
          ctx.fillStyle = `hsl(${(b.hue + t * 40) % 360}, 95%, 62%)`;
          const tw = ctx.measureText(b.text).width + 90;
          const xx = W - ((t * 90 + b.off) % (tw + W));
          ctx.fillText(b.text, xx, 82);
        } else if (b.mode === 1) {
          // 色浪 + 标语
          const g = ctx.createLinearGradient(0, 0, W, H);
          g.addColorStop(0, `hsl(${(b.hue + t * 26) % 360}, 90%, 48%)`);
          g.addColorStop(1, `hsl(${(b.hue + 140 + t * 26) % 360}, 90%, 38%)`);
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
          ctx.font = 'bold 30px sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.94)';
          ctx.textAlign = 'center';
          ctx.fillText(b.text.split(' ')[0], W / 2, 56);
          ctx.fillText(b.text.split(' ').slice(1).join(' ') || 'NYC', W / 2, 96);
          ctx.textAlign = 'left';
        } else {
          // 假股票行情
          ctx.fillStyle = '#02120a';
          ctx.fillRect(0, 0, W, H);
          ctx.font = 'bold 22px monospace';
          for (let r = 0; r < 4; r++) {
            const vUp = Math.sin(t * 1.7 + r * 2.3 + b.off) > 0;
            ctx.fillStyle = vUp ? '#27e07d' : '#ff5348';
            const val = (100 + 60 * Math.sin(t * 0.9 + r * 1.7 + b.off)).toFixed(2);
            ctx.fillText(`${['ESB', 'WTC', 'CHR', 'FLT'][r]}  ${val} ${vUp ? '▲' : '▼'}`, 14, 30 + r * 26);
          }
        }
        b.tex.needsUpdate = true;
      }
    },
  };
}

export function buildProps(plan, rng, disposables) {
  const group = new THREE.Group();
  const lamps = buildLamps(plan, rng.fork('lamps'), group, disposables);
  const signals = buildSignals(plan, group, disposables);
  const steam = buildSteam(plan, rng.fork('steam'), group, disposables);
  const billboards = buildBillboards(plan, rng.fork('bb'), group, disposables);

  return {
    group,
    setNodeState: signals.setNodeState,
    lampCount: lamps.count,
    update(dt, t, camera, night, wet, wind) {
      lamps.headMat.emissiveIntensity = night * 2.6;
      lamps.poolMat.opacity = night * (0.34 + wet * 0.3);
      steam.update(dt, camera, wind);
      billboards.update(dt, t);
    },
  };
}
