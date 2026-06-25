import * as THREE from 'three';

// 把 sim 层赛道采样转换成可见几何：路面带状网格、起点线、围栏、
// 检查点门、加速带、道具箱和树木。所有贴图用 canvas 程序化生成。

const FENCE_OFFSET = 6; // 围栏到路缘的距离（米），与 main.js 的硬边界一致

function makeCanvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function asphaltTexture() {
  const tex = makeCanvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#3a3d42';
    ctx.fillRect(0, 0, s, s);
    // 颗粒噪点
    for (let i = 0; i < 400; i += 1) {
      const shade = 50 + Math.floor(Math.random() * 30);
      ctx.fillStyle = `rgb(${shade},${shade},${shade + 4})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    // 两侧白色边线（u 方向 = 路宽）
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(2, 0, 4, s);
    ctx.fillRect(s - 6, 0, 4, s);
    // 中央黄色虚线（v 方向 = 行进方向）
    ctx.fillStyle = '#f4c93c';
    ctx.fillRect(s / 2 - 2, 8, 4, s / 2 - 16);
  });
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function fenceTexture() {
  const tex = makeCanvasTexture(64, (ctx, s) => {
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.lineTo(s, 0);
    ctx.lineTo(s, s / 2);
    ctx.lineTo(s / 2, s);
    ctx.closePath();
    ctx.fill();
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function checkerTexture() {
  return makeCanvasTexture(64, (ctx, s) => {
    const cell = s / 8;
    for (let i = 0; i < 8; i += 1) {
      for (let j = 0; j < 8; j += 1) {
        ctx.fillStyle = (i + j) % 2 ? '#111' : '#fafafa';
        ctx.fillRect(i * cell, j * cell, cell, cell);
      }
    }
  });
}

function chevronTexture() {
  return makeCanvasTexture(96, (ctx, s) => {
    ctx.fillStyle = '#ff8c1a';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#fff2cc';
    for (const y of [s * 0.3, s * 0.62]) {
      ctx.beginPath();
      ctx.moveTo(s * 0.18, y + s * 0.16);
      ctx.lineTo(s * 0.5, y - s * 0.08);
      ctx.lineTo(s * 0.82, y + s * 0.16);
      ctx.lineTo(s * 0.82, y + s * 0.28);
      ctx.lineTo(s * 0.5, y + s * 0.04);
      ctx.lineTo(s * 0.18, y + s * 0.28);
      ctx.closePath();
      ctx.fill();
    }
  });
}

// 采样点 i 处指向左侧的单位法线。
function leftNormal(track, i) {
  const d = track.directionAt(i);
  return { x: d.z, z: -d.x };
}

function buildRibbon(track, innerOffset, outerOffset, y, material, vRepeatMeters) {
  const count = track.points.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= count; i += 1) {
    const idx = i % count;
    const p = track.points[idx];
    const nrm = leftNormal(track, idx);
    positions.push(p.x + nrm.x * innerOffset, y, p.z + nrm.z * innerOffset);
    positions.push(p.x + nrm.x * outerOffset, y, p.z + nrm.z * outerOffset);
    const v = (i < count ? track.cumulative[idx] : track.total) / vRepeatMeters;
    uvs.push(0, v, 1, v);
    if (i < count) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

// 垂直围栏带：沿偏移曲线拉出一面高 height 的条带。
function buildFence(track, offset, height, material) {
  const count = track.points.length;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= count; i += 1) {
    const idx = i % count;
    const p = track.points[idx];
    const nrm = leftNormal(track, idx);
    const x = p.x + nrm.x * offset;
    const z = p.z + nrm.z * offset;
    positions.push(x, 0, z, x, height, z);
    const u = (i < count ? track.cumulative[idx] : track.total) / 4;
    uvs.push(u, 0, u, 1);
    if (i < count) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.material.side = THREE.DoubleSide;
  return mesh;
}

function buildGate(track, checkpoint) {
  const gate = new THREE.Group();
  const nrm = leftNormal(track, checkpoint.index);
  const w = track.halfWidth + 1;
  const postGeo = new THREE.CylinderGeometry(0.35, 0.35, 6.5, 8);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2f6fb0 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(checkpoint.x + nrm.x * w * side, 3.25, checkpoint.z + nrm.z * w * side);
    post.castShadow = true;
    gate.add(post);
  }
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(w * 2 + 0.7, 0.6, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x57b7ff }),
  );
  bar.position.set(checkpoint.x, 6.4, checkpoint.z);
  bar.rotation.y = Math.atan2(nrm.x, nrm.z) + Math.PI / 2;
  gate.add(bar);
  return gate;
}

// 确定性伪随机，保证树木布局可复现。
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTrees(track) {
  const rand = mulberry32(20260611);
  const group = new THREE.Group();
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 2.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const leafGeo = new THREE.ConeGeometry(2.4, 5.5, 7);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
  let placed = 0;
  let guard = 0;
  while (placed < 70 && guard < 800) {
    guard += 1;
    const x = (rand() - 0.5) * 280;
    const z = (rand() - 0.5) * 280;
    const dist = track.nearest(x, z).dist;
    if (dist < track.halfWidth + FENCE_OFFSET + 4 || dist > 90) continue;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.2;
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.y = 4.6;
    leaf.castShadow = true;
    tree.add(trunk, leaf);
    const scale = 0.8 + rand() * 0.7;
    tree.scale.setScalar(scale);
    tree.position.set(x, 0, z);
    group.add(tree);
    placed += 1;
  }
  return group;
}

export function buildTrackVisuals(scene, track, race, items) {
  const group = new THREE.Group();

  const road = buildRibbon(
    track,
    track.halfWidth,
    -track.halfWidth,
    0.01,
    new THREE.MeshLambertMaterial({ map: asphaltTexture() }),
    8,
  );
  road.receiveShadow = true;
  group.add(road);

  // 起点线
  const startDir = track.directionAt(0);
  const start = new THREE.Mesh(
    new THREE.PlaneGeometry(track.halfWidth * 2, 2.4),
    new THREE.MeshBasicMaterial({ map: checkerTexture() }),
  );
  start.rotation.x = -Math.PI / 2;
  start.rotation.z = -Math.atan2(startDir.x, startDir.z);
  start.position.set(track.points[0].x, 0.03, track.points[0].z);
  group.add(start);

  // 两侧围栏（与 main.js 的硬边界距离一致）
  const fenceMat = new THREE.MeshLambertMaterial({ map: fenceTexture() });
  group.add(buildFence(track, track.halfWidth + FENCE_OFFSET, 1.1, fenceMat));
  group.add(buildFence(track, -(track.halfWidth + FENCE_OFFSET), 1.1, fenceMat.clone()));

  // 检查点门（跳过起点线本身）
  for (let k = 1; k < race.checkpoints.length; k += 1) {
    group.add(buildGate(track, race.checkpoints[k]));
  }

  // 加速带
  const chevron = chevronTexture();
  for (const pad of items.pads) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(pad.radius * 2, pad.radius * 2),
      new THREE.MeshBasicMaterial({ map: chevron, transparent: true, opacity: 0.95 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    const dir = track.directionAt(pad.index);
    mesh.rotation.z = -Math.atan2(dir.x, dir.z);
    mesh.position.set(pad.x, 0.02, pad.z);
    group.add(mesh);
  }

  // 道具箱（拾取后隐藏，由 update 控制）
  const boxMeshes = items.boxes.map((box) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 1.7, 1.7),
      new THREE.MeshStandardMaterial({
        color: 0xf0b428,
        emissive: 0x5a3c00,
        transparent: true,
        opacity: 0.88,
        metalness: 0.4,
        roughness: 0.25,
      }),
    );
    mesh.position.set(box.x, 1.6, box.z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  });

  group.add(buildTrees(track));
  scene.add(group);

  let spin = 0;
  return {
    group,
    update(dt) {
      spin += dt;
      items.boxes.forEach((box, i) => {
        const mesh = boxMeshes[i];
        mesh.visible = box.cooldown <= 0;
        mesh.rotation.y = spin * 1.4;
        mesh.rotation.x = spin * 0.9;
        mesh.position.y = 1.6 + Math.sin(spin * 2 + i) * 0.25;
      });
    },
  };
}
