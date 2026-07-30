// 全城建筑总装:逐地块生成房子 → 外壳按材质全局合并(少 drawcall)、屋顶单独成组(可掀顶)、
// 室内按建筑单独成组(靠近才显示)。这样"每栋都有内景"才可能在浏览器里跑得动。
import * as THREE from 'three';
import { merge } from '../core/geom.js';
import { Rng } from '../core/prng.js';
import { makeHouse } from './house.js';

/** 合并键形如 "材质#分区";分区让整城合并后仍能被视锥/阴影剔除。 */
function resolveMat(M, key) {
  const k = key.split('#')[0];
  if (k.startsWith('sign:')) return M.signs[k.slice(5)] || M.plank;
  return M[k] || M.plaster;
}

const CELL = 135;
const cellOf = (x, z) => `${Math.floor((x + 210) / CELL)}_${Math.floor((z + 210) / CELL)}`;

export function meshesFrom(parts, M, { cast = true, receive = true } = {}) {
  const out = [];
  for (const [key, geos] of parts) {
    const g = merge(geos);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, resolveMat(M, key));
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.name = key;
    out.push(mesh);
  }
  return out;
}

export function buildCity(plan, M) {
  const group = new THREE.Group();
  group.name = 'buildings';
  const shellParts = new Map();
  const roofParts = new Map();
  const interiors = [];
  const emitters = [];
  const smoke = [];
  const boxes = [];
  let interiorTris = 0;

  const pushAll = (target, parts, cell) => {
    for (const [k, v] of parts) {
      const key = k + '#' + cell;
      let a = target.get(key);
      if (!a) { a = []; target.set(key, a); }
      a.push(...v);
    }
  };

  for (const plot of plan.plots) {
    const rng = new Rng(plot.seed);
    const h = makeHouse(plot, rng);
    const cell = cellOf(plot.x, plot.z);
    pushAll(shellParts, h.shell.parts, cell);
    pushAll(roofParts, h.roof.parts, cell);
    boxes.push(...h.boxes);

    const g = new THREE.Group();
    g.name = 'interior' + plot.id;
    for (const m of meshesFrom(h.inner.parts, M, { cast: false, receive: true })) {
      g.add(m);
      interiorTris += m.geometry.attributes.position.count / 3;
    }
    g.visible = false;
    group.add(g);
    interiors.push({
      group: g, x: plot.x, z: plot.z, r: h.radius,
      rect: plot.rect, top: h.topY, kind: h.kind, plot,
    });

    for (const e of h.emitters) emitters.push({ ...e, building: interiors.length - 1 });
    if (plot.smoke) smoke.push(plot.smoke);
  }

  const shellMeshes = meshesFrom(shellParts, M);
  const roofMeshes = meshesFrom(roofParts, M);
  for (const m of shellMeshes) group.add(m);
  const roofGroup = new THREE.Group();
  roofGroup.name = 'roofs';
  for (const m of roofMeshes) roofGroup.add(m);
  group.add(roofGroup);

  let lastKey = '';
  const tmp = new THREE.Vector3();

  /**
   * 室内显隐:只有靠近(或处于剖视模式)的建筑才把内景打开。
   * @returns 当前可见的内景数量
   */
  function updateVisibility(camPos, xray = false, near = 30) {
    const key = `${Math.round(camPos.x / 3)},${Math.round(camPos.z / 3)},${xray ? 1 : 0}`;
    if (key === lastKey) return group.userData.visibleInteriors || 0;
    lastKey = key;
    const R = xray ? 150 : near;
    const R2 = R * R;
    let n = 0;
    for (const it of interiors) {
      const dx = it.x - camPos.x, dz = it.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      const on = d2 < R2;
      if (it.group.visible !== on) it.group.visible = on;
      if (on) n++;
    }
    group.userData.visibleInteriors = n;
    void tmp;
    return n;
  }

  function setXray(on) {
    roofGroup.visible = !on;
    lastKey = '';
  }

  return {
    group, roofGroup, interiors, emitters, smoke, boxes,
    updateVisibility, setXray,
    stats: { buildings: plan.plots.length, interiorTris: Math.round(interiorTris) },
  };
}
