// 整车装配：底盘 + 四轮 + 车壳（各车型定义）+ 改装件可视化；提供可拆解 / 可点选的零件表。
import * as THREE from 'three';
import * as geo from './geo.js';
import * as paint from './paint.js';
import * as mats from './mats.js';
import { buildChassis, buildWheels, CHASSIS, WHEELBASE } from './chassis.js';
import { TIRES } from './wheels.js';

export function markPart(obj, id, label, explode = [0, 0, 0]) {
  obj.name = id;
  obj.userData.part = { id, label, explode: new THREE.Vector3(...explode) };
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}

// 车型定义 def：{ id, chassis, chassisColors, wheels, buildBody(ctx) → { body, wing?, parts? } }
// build（改装配置）可覆盖导轮颜色、轮胎规格等外观。
export function buildCar(def, { detail = 1, look = {} } = {}) {
  const root = new THREE.Group();
  root.name = 'car-' + def.id;
  const chassisColors = { ...def.chassisColors, ...look.chassisColors };
  root.add(buildChassis(def.chassis, chassisColors));
  const wheelDef = { ...def.wheels, ...look.wheels };
  const { group: wheels, wheels: wheelList, spec } = buildWheels(def.chassis, wheelDef);
  root.add(wheels);
  // 车身与尾翼分属两张投影贴纸层：尾翼在俯视上与车身重叠，同层会把翼面字样印到下方车身上
  const livery = new paint.Livery({ ppm: detail >= 1 ? 10 : 5, bounds: def.liveryBounds });
  const wingLivery = new paint.Livery({ ppm: detail >= 1 ? 10 : 5, bounds: def.liveryBounds });
  const ctx = {
    THREE, geo, paint, mats, livery, wingLivery, detail,
    step: detail >= 1 ? 1.0 : 2.2,            // 放样站距（毫米）
    n: detail >= 1 ? 1 : 0.6,                 // 截面采样倍率
    chassis: CHASSIS[def.chassis], wheelbase: WHEELBASE, tire: spec,
    markPart,
  };
  const out = def.buildBody(ctx) || {};
  if (out.body) { root.add(markPart(out.body, 'body', '车壳', [0, 34, 0])); }
  if (out.wing) { root.add(markPart(out.wing, 'wing', '尾翼', [-18, 46, 0])); }
  for (const p of out.parts || []) root.add(p);
  // 车轮离地抬升到轮胎半径（底盘按 26 mm 胎设计，小径胎时整体下降）
  const drop = (TIRES.low26.od - spec.od) / 2;
  root.userData.def = def;
  root.userData.liveries = [livery, wingLivery];
  root.userData.wheels = wheelList;
  root.userData.tire = spec;
  root.userData.rideDrop = drop;
  for (const ch of root.children) if (ch.name !== 'wheels-root') ch.position.y -= drop;
  // 零件表
  const parts = [];
  root.traverse(o => { if (o.userData.part) { o.userData.part.rest = o.position.clone(); parts.push(o); } });
  root.userData.parts = parts;
  return root;
}

// 拆解动画：t∈[0,1]，按零件 explode 偏移移动
export function setExplode(car, t) {
  const k = t * t * (3 - 2 * t);
  for (const p of car.userData.parts || []) {
    const d = p.userData.part;
    p.position.copy(d.rest).addScaledVector(d.explode, k);
  }
}

// 释放 GPU 资源
export function disposeCar(car) {
  const seen = new Set();
  car.traverse(o => {
    if (o.isMesh) {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) if (m && m.userData.livery && !seen.has(m)) { seen.add(m); m.dispose(); }
    }
  });
  for (const l of car.userData.liveries || []) l.dispose();
}

// 轮子转动（rad）
export function spinWheels(car, angle) {
  for (const w of Object.values(car.userData.wheels || {})) w.userData.spin.rotation.z = -angle * (w.userData.spin.rotation.y ? -1 : 1);
}
