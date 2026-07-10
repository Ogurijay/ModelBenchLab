// ============================================================
// exhibits.js — 8 件展品(5 画作 + 3 雕塑)、说明牌、展台与碰撞体
//   编号即动线:01→08,入口一区 → 中厅二区 → 尽端三区
// ============================================================
import * as THREE from 'three';
import { fbm } from './textures.js';

// ---------- 展品数据(冻结的策展清单) ----------
const PAINTINGS = [
  {
    id: 1, title: '山岚初醒', sub: '布面丙烯 · 2026', style: 'mist', seed: 20261,
    desc: '层叠山影在薄雾里缓缓苏醒,冷灰与暖金之间是黎明的第一次呼吸。',
    w: 2.5, h: 1.7, center: [-9, 2.35, -7], rotY: 0, normal: [0, 0, 1],
  },
  {
    id: 3, title: '静水微澜', sub: '布面油彩 · 2026', style: 'waves', seed: 20263,
    desc: '水面被风轻触,涟漪把光线织成一层层安静的韵律。',
    w: 1.8, h: 1.35, center: [-4.18, 2.05, -4], rotY: -Math.PI / 2, normal: [-1, 0, 0],
  },
  {
    id: 5, title: '暮色几何', sub: '布面丙烯 · 2026', style: 'grid', seed: 20265,
    desc: '黄昏的城市被拆解成色块,秩序之中仍藏着温度。',
    w: 2.2, h: 1.6, center: [0, 2.3, 7], rotY: Math.PI, normal: [0, 0, -1],
  },
  {
    id: 6, title: '城市脉搏', sub: '综合材料 · 2026', style: 'pulse', seed: 20266,
    desc: '霓虹在夜色里起伏,像一段被灯光记录下来的心电图。',
    w: 1.8, h: 1.35, center: [4.18, 2.05, 4], rotY: Math.PI / 2, normal: [1, 0, 0],
  },
  {
    id: 8, title: '金色回响', sub: '布面金箔 · 2026', style: 'gold', seed: 20268,
    desc: '同心的金色弧线一圈圈荡开,如同大厅尽头一声悠长的钟鸣。',
    w: 3.0, h: 2.1, center: [13, 2.45, 0], rotY: -Math.PI / 2, normal: [-1, 0, 0],
  },
];

const SCULPTURES = [
  {
    id: 2, title: '恒流', sub: '抛光黄铜 · 2026', mat: 'metal',
    desc: '一条没有起点也没有终点的金属之河,在灯下缓缓自转。',
    pos: [-8.5, 2.2], plaqueYaw: -Math.PI / 2,
  },
  {
    id: 4, title: '大地之核', sub: '花岗岩 · 2026', mat: 'stone',
    desc: '从大地深处取出的一块沉默,棱角间仍留着亿万年的重量。',
    pos: [0, -2.8], plaqueYaw: 0,
  },
  {
    id: 7, title: '年轮之间', sub: '胡桃木旋制 · 2026', mat: 'wood',
    desc: '旋木成器,年轮在曲面上流动,时间被握成温润的形状。',
    pos: [8.5, -2.6], plaqueYaw: 0,
  },
];

// ---------- 造型:粗粝岩石(顶点噪声位移,棱面朝向光) ----------
function rockGeometry() {
  const geo = new THREE.IcosahedronGeometry(0.5, 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.x * 1.9 + 13.7, v.y * 1.9 + v.z * 1.4 + 4.2, 71, 4);
    v.multiplyScalar(1 + (n - 0.47) * 0.55);
    pos.setXYZ(i, v.x, v.y * 0.88, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// ---------- 造型:车削木器 ----------
function vaseGeometry() {
  const prof = [
    [0.03, 0], [0.19, 0.004], [0.255, 0.06], [0.29, 0.18], [0.27, 0.34],
    [0.2, 0.5], [0.13, 0.6], [0.115, 0.68], [0.15, 0.76], [0.17, 0.8],
    [0.16, 0.82], [0.1, 0.82],
  ];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 56);
}

export function buildExhibits(scene, tex) {
  const g = new THREE.Group();
  g.name = 'exhibits';
  scene.add(g);

  const list = [];
  const cylColliders = [];
  const boxColliders = [];
  const animated = [];

  // ---------- 材质 ----------
  const frameMat = new THREE.MeshStandardMaterial({ map: tex.wood.map, color: 0xbfae9a, roughness: 0.42 });
  const matBoardMat = new THREE.MeshStandardMaterial({ color: 0xe8e1d2, roughness: 0.95 });
  const plaqueBackMat = new THREE.MeshStandardMaterial({ color: 0x2b2a2e, metalness: 0.75, roughness: 0.35 });
  const concreteMat = new THREE.MeshStandardMaterial({ map: tex.concrete.map, roughness: 0.88 });
  const woodTopMat = new THREE.MeshStandardMaterial({ map: tex.wood.map, roughness: 0.5 });
  const metalArtMat = new THREE.MeshStandardMaterial({
    color: 0xd4aa54, metalness: 1.0, roughness: 0.16, envMapIntensity: 1.35,
  });
  const stoneArtMat = new THREE.MeshStandardMaterial({
    map: tex.stone.map, bumpMap: tex.stone.bumpMap, bumpScale: 0.8, roughness: 0.96, metalness: 0.0,
  });
  const woodArtMat = new THREE.MeshStandardMaterial({
    map: tex.wood.map, roughness: 0.5, side: THREE.DoubleSide,
  });
  const aoMat = new THREE.MeshBasicMaterial({ map: tex.ao, transparent: true, opacity: 0.55, depthWrite: false });

  // ---------- 说明牌(共用构件) ----------
  function makePlaquePanel(e) {
    const p = new THREE.Group();
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.23, 0.02), plaqueBackMat);
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.2),
      new THREE.MeshStandardMaterial({ map: tex.plaque(e.id, e.title, e.sub, e.desc), roughness: 0.6, metalness: 0.2 }),
    );
    face.position.z = 0.012;
    p.add(back, face);
    return p;
  }

  // ---------- 画作 ----------
  for (const e of PAINTINGS) {
    const grp = new THREE.Group();
    grp.position.set(e.center[0], e.center[1], e.center[2]);
    grp.rotation.y = e.rotY;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(e.w + 0.2, e.h + 0.2, 0.07), frameMat);
    frame.position.z = 0.045;
    frame.receiveShadow = true;

    const matBoard = new THREE.Mesh(new THREE.PlaneGeometry(e.w + 0.06, e.h + 0.06), matBoardMat);
    matBoard.position.z = 0.083;

    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(e.w, e.h),
      new THREE.MeshStandardMaterial({ map: tex.painting(e.style, e.seed, e.h / e.w), roughness: 0.85 }),
    );
    art.position.z = 0.088;

    const plaque = makePlaquePanel(e);
    plaque.position.set(e.w / 2 + 0.45, 1.42 - e.center[1], 0.03);

    grp.add(frame, matBoard, art, plaque);
    g.add(grp);

    // 画作 AABB 碰撞体:含画框外扩(+0.1)与右侧壁挂说明牌(+0.68),
    // 局部盒 8 个角点经 rotY 旋转后取包围盒(本厅墙面均轴对齐,包围盒无损)
    const rot = new THREE.Matrix4().makeRotationY(e.rotY);
    const cbox = new THREE.Box3();
    const corner = new THREE.Vector3();
    for (const lx of [-(e.w / 2 + 0.1), e.w / 2 + 0.68]) {
      for (const ly of [-(e.h / 2 + 0.1), e.h / 2 + 0.1]) {
        for (const lz of [-0.02, 0.16]) {
          cbox.expandByPoint(corner.set(lx, ly, lz).applyMatrix4(rot).add(grp.position));
        }
      }
    }
    boxColliders.push(cbox);

    // 射灯参数:自墙面法线方向探出 2.25m,自动按画幅算张角
    const target = new THREE.Vector3(...e.center);
    const anchor = target.clone().addScaledVector(new THREE.Vector3(...e.normal), 2.25);
    anchor.y = 4.55;
    const dist = anchor.distanceTo(target);
    list.push({
      id: e.id, kind: 'painting', title: e.title, sub: e.sub, desc: e.desc,
      focus: target.clone(),
      spot: {
        anchor, target,
        angle: Math.min(0.62, Math.atan((Math.max(e.w, e.h) / 2 + 0.6) / dist)),
        penumbra: 0.62, intensity: 85, castShadow: false,
      },
    });
  }

  // ---------- 雕塑 ----------
  for (const e of SCULPTURES) {
    const [x, z] = e.pos;
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);

    // 混凝土展台 + 胡桃木顶板
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.47, 1.02, 36), concreteMat);
    ped.position.y = 0.51;
    ped.castShadow = true;
    ped.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 36), woodTopMat);
    top.position.y = 1.045;
    top.castShadow = true;
    top.receiveShadow = true;
    grp.add(ped, top);

    // 雕塑本体
    let art;
    if (e.mat === 'metal') {
      art = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1, 220, 30), metalArtMat);
      art.position.y = 1.52;
      art.rotation.x = 0.45;
      animated.push(art);
    } else if (e.mat === 'stone') {
      art = new THREE.Mesh(rockGeometry(), stoneArtMat);
      art.position.y = 1.52;
      art.rotation.y = 0.7;
    } else {
      art = new THREE.Mesh(vaseGeometry(), woodArtMat);
      art.position.y = 1.072;
    }
    art.castShadow = true;
    art.receiveShadow = true;
    grp.add(art);

    // 烘焙感接触阴影
    const ao = new THREE.Mesh(new THREE.CircleGeometry(0.95, 28), aoMat);
    ao.rotation.x = -Math.PI / 2;
    ao.position.y = 0.032;
    ao.renderOrder = 2;
    grp.add(ao);

    // 斜面说明牌 + 立杆(面向来客方向)
    const sinY = Math.sin(e.plaqueYaw), cosY = Math.cos(e.plaqueYaw);
    const lectern = new THREE.Group();
    lectern.position.set(sinY * 0.72, 0, cosY * 0.72);
    lectern.rotation.y = e.plaqueYaw;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.98, 10), plaqueBackMat);
    post.position.y = 0.49;
    const panel = makePlaquePanel(e);
    panel.position.y = 1.0;
    panel.rotation.x = -0.58;
    lectern.add(post, panel);
    grp.add(lectern);

    g.add(grp);
    cylColliders.push({ x, z, r: 0.72 });

    list.push({
      id: e.id, kind: 'sculpture', title: e.title, sub: e.sub, desc: e.desc,
      focus: new THREE.Vector3(x, 1.4, z),
      spot: {
        anchor: new THREE.Vector3(x + sinY * 1.05, 4.62, z + cosY * 1.05),
        target: new THREE.Vector3(x, 1.35, z),
        angle: 0.3, penumbra: 0.5, intensity: 130, castShadow: true,
      },
    });
  }

  list.sort((a, b) => a.id - b.id);

  return {
    list,
    cylColliders,
    boxColliders,
    update(dt) {
      for (const m of animated) m.rotation.y += dt * 0.3;
    },
  };
}
