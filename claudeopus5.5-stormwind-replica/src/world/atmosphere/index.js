// E 模块：大气、光照与道具。
// 天穹 / 昼夜 / 主光与阴影跟随 / 室内补偿 / 光源池（≤16 PointLight）/ 路灯 / 树木 / 市集 / 港口船只 / 烟雾。
// 最后装配：build 时其他模块已登记完 ctx.lights 与 ctx.fx.smoke。
import * as THREE from 'three';
import { createLighting } from './lighting.js';
import { createLightPool } from './lightpool.js';
import { buildLamps } from './lamps.js';
import { buildTrees } from './trees.js';
import { buildMarket } from './market.js';
import { buildShips } from './ships.js';
import { buildSmoke } from './smoke.js';

let S = null; // 模块状态

// 调参面板条目（默认值写进 ctx.settings；面板在装配完成后才创建）
const SCHEMA = [
  { key: 'sunIntensity', def: 3.2, label: '太阳强度', min: 0, max: 8, step: 0.05 },
  { key: 'moonIntensity', def: 0.35, label: '月光强度', min: 0, max: 2, step: 0.01 },
  { key: 'moonFill', def: 0.45, label: '夜间月光补光', min: 0, max: 1, step: 0.01 },
  { key: 'skyLight', def: 1.0, label: '天光强度（半球光 + 环境）', min: 0, max: 3, step: 0.01 },
  { key: 'poolGain', def: 1.0, label: '光源池增益（×cd 基准）', min: 0, max: 4, step: 0.01 },
  { key: 'lampSplat', def: 1.0, label: '路灯地面光斑亮度', min: 0, max: 3, step: 0.01 },
];

export async function build(ctx) {
  for (const s of SCHEMA) {
    if (ctx.settings[s.key] === undefined) ctx.settings[s.key] = s.def;
    ctx.panelSchema.push({ key: s.key, label: s.label, min: s.min, max: s.max, step: s.step, folder: '大气' });
  }

  const root = new THREE.Group();
  root.name = 'atmosphere';
  ctx.scene.add(root);

  // 调试：URL 含 smoketest（如 #smoketest）时在贸易区放几根测试烟柱（单模块自测用，正式装配不会触发）
  if (location.href.includes('smoketest') && !ctx.fx.smoke.length) {
    for (let i = 0; i < 12; i++) ctx.fx.smoke.push({ x: -60 + i * 10, y: 9, z: 40 });
  }

  const lighting = createLighting(ctx);
  const lamps = buildLamps(ctx, root); // 先登记路灯光源，光源池才能看到
  const pool = createLightPool(ctx);
  const trees = buildTrees(ctx, root);
  const market = buildMarket(ctx, root);
  const ships = buildShips(ctx, root);
  const smoke = buildSmoke(ctx, root);

  S = { lighting, lamps, pool, trees, market, ships, smoke };
  ctx.atmosphere = { trees: trees.count, smoke: smoke.count, lamps: lamps.entries.length };

  // 评审机位
  if (ctx.views && ctx.viewAt) {
    ctx.views.atmoDusk = ctx.viewAt([46, 9, 46], [0, 3, 0], 17.8, 60);
    ctx.views.atmoMarket = ctx.viewAt([22, 2.0, 24], [0, 1.5, 6], 11, 60);
    ctx.views.atmoHarbor = ctx.viewAt([-25, 26, -395], [-90, 4, -290], 16.5, 60);
    ctx.views.atmoPark = ctx.viewAt([-170, 24, -60], [-215, 0, -140], 9.5, 60);
    ctx.views.atmoForest = ctx.viewAt([360, 60, 260], [140, 0, 120], 7.2, 60);
  }
  console.info(`[atmosphere] 树 ${trees.count}，路灯 ${lamps.entries.length}，烟雾粒子 ${smoke.count}，光源登记 ${ctx.lights.list.length}`);
}

export function update(dt, t, ctx) {
  if (!S) return;
  S.lighting.update(dt, t);
  S.pool.update(dt, t);
  S.lamps.update(dt);
  S.trees.update(dt);
  S.ships.update(dt, t);
  S.smoke.update(dt, t);
}
