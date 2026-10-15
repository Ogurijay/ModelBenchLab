// C 模块：民居生成器 —— 216 个地块全部生成真空心建筑。
// 结构：
//   plan.js       纯数字规划（尺寸 / 门 / 窗 / 楼梯 / 壁炉 / 屋顶），外壳、家具、自测共用
//   shell.js      外壳：洞口墙（wallPieces 切分，几何与碰撞同源）、楼板开井、楼梯、栏杆、屋顶、半木构饰件
//   furniture.js  室内：占用网格 + 家具库 + 按业态的楼层布局；每栋一个 Builder → 室内 LOD
//   signs.js      15 栋命名建筑的中文招牌（Canvas 图集，1 个材质）
//   debug.js      __ctx.houses.walk / wallTest：用真实键盘驱动走进门、上楼梯
// 批次：墙体与屋面按区各一个 Builder（每区每材质 1 个网格，保留按区剔除）；
//       木作 / 楼板 / 石饰 / 玻璃 / 铁件 / 招牌这些全城通用的材质改道到一个全城 Builder（每材质 1 个网格）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder } from '../../core/builder.js';
import { planHouse } from './plan.js';
import { buildShell } from './shell.js';
import { furnish, animateFlames } from './furniture.js';
import { createSigns } from './signs.js';
import { BIZ_LABEL, NAMED } from './styles.js';
import { installHouseDebug } from './debug.js';

const INTERIOR_R = 30; // 室内 LOD 半径（m）：街上一般打开 8~12 栋

// 按材质改道的 Builder：box() 内部调 this.add()，所以几何改道、碰撞照常登记在本 Builder 上（同源不变）
class RoutedBuilder extends Builder {
  constructor(ctx, opts, global, route) {
    super(ctx, opts);
    this.global = global;
    this.route = route;
  }
  add(mat, geometry, matrix) {
    if (this.route.has(mat)) return this.global.add(mat, geometry, matrix);
    return super.add(mat, geometry, matrix);
  }
}

export function build(ctx) {
  const t0 = performance.now();
  const { LOTS, DISTRICTS } = ctx.coords;

  // 材质：共享库 + 本模块的一个灰泥变体（暖色），颜色微差不额外开太多批次
  const plasterWarm = ctx.mat.plaster.clone();
  plasterWarm.color.setHex(0xf6d6ae);
  plasterWarm.name = 'plasterWarm';
  const tint = (base, hex, name) => {
    const m = ctx.mat[base].clone();
    m.color.setHex(hex);
    m.name = name;
    return m;
  };
  const M = {
    ...ctx.mat,
    plasterWarm,
    // 大教堂区立面色差
    stoneGreyWarm: tint('stoneGrey', 0xf2e3cc, 'stoneGreyWarm'),
    stoneGreyCool: tint('stoneGrey', 0xdde3ee, 'stoneGreyCool'),
    // 麻布（麻袋）
    burlap: tint('plaster', 0xb89a6a, 'burlap'),
  };
  // 色调变体：每种材质每档只 clone 一次（缓存），控制材质总数
  const toneCache = new Map();
  const TONE = { wall: 0xe6dccd, roof: 0xb4b8c8 };
  M.tone = (name, t) => {
    if (!t) return M[name];
    const key = `${name}#${t}`;
    if (!toneCache.has(key)) {
      const m = M[name].clone();
      m.color.multiply(new THREE.Color(name.startsWith('roof') ? TONE.roof : TONE.wall));
      m.name = key;
      toneCache.set(key, m);
    }
    return toneCache.get(key);
  };
  M.wallGrime = makeGrime();
  M.arcaneDot = ctx.mat.arcane.clone();
  M.arcaneDot.emissiveIntensity = 0.45;
  M.arcaneDot.name = 'arcaneDot';
  // 窗板三种色调（深 / 中 / 带漆的灰绿）
  M.shutterMats = [tint('planks', 0xc4a07c, 'shutterOak'), tint('planks', 0xf0dcc0, 'shutterLight'), tint('planks', 0xa9c2b4, 'shutterGreen')];

  const extras = createSigns(Object.keys(NAMED).filter((n) => LOTS.some((l) => l.named === n)));
  const shells = {};
  const X = ctx.builder({ chunk: 1e6, tag: 'house' });
  const route = new Set([M.timber, M.planks, M.stoneTrim, M.iron, M.windowGlow, ...(M.windowGlowSet || []), ...M.shutterMats, M.arcane, M.gold, M.banner, extras.signMat]);
  const noShadow = new Set([M.wallGrime, M.arcaneDot, ...M.shutterMats, M.timber, M.stoneTrim, M.iron, M.arcane, M.gold, M.banner, extras.signMat]);
  const plans = [];
  const stats = { byDistrict: {}, byBiz: {}, floors: 0, lights: 0, smoke: 0, items: 0 };
  let interiorTris = 0;

  for (const lot of LOTS) {
    const p = planHouse(lot, ctx);
    // 全城一个外壳 Builder：每材质 1 个网格（阴影是多 pass，网格数比按区剔除更值钱）
    const B = X;
    buildShell(p, B, X, M, extras);

    const group = new THREE.Group();
    group.name = `interior:${lot.id}`;
    ctx.scene.add(group);
    const { lights, counts } = furnish(p, ctx, M, group);
    ctx.interiors.add(group, p.cx, p.cz, INTERIOR_R);
    for (const l of lights) ctx.lights.add(l);
    for (const s of p.smoke) ctx.fx.smoke.push({ x: s.x, y: s.y, z: s.z });
    group.traverse((o) => o.isMesh && (interiorTris += o.geometry.attributes.position.count / 3));

    plans.push(p);
    stats.byDistrict[lot.district] = (stats.byDistrict[lot.district] || 0) + 1;
    const label = BIZ_LABEL[p.biz] || p.biz;
    stats.byBiz[label] = (stats.byBiz[label] || 0) + 1;
    stats.floors += p.F;
    stats.lights += lights.length;
    stats.smoke += p.smoke.length;
    stats.items += Object.values(counts).reduce((a, b) => a + b, 0);
  }

  let shellTris = X.tris;
  const xMeshes = mergeByMaterial(X.finish());
  for (const m of xMeshes) if (noShadow.has(m.material)) m.castShadow = false; // 薄饰件不投影，省阴影批次
  let shellMeshes = xMeshes.length;
  for (const B of Object.values(shells)) {
    shellTris += B.tris;
    shellMeshes += mergeByMaterial(B.finish()).length;
  }
  ctx.hollowCount += plans.length;

  stats.built = plans.length;
  stats.shellTris = Math.round(shellTris);
  stats.shellMeshes = shellMeshes;
  stats.interiorTris = Math.round(interiorTris);
  stats.ms = Math.round(performance.now() - t0);
  ctx.houses = { plans, stats };
  installHouseDebug(ctx, plans);
  registerViews(ctx, plans);
  console.info(
    `[houses] ${plans.length} 栋空心建筑（${Object.entries(stats.byDistrict).map(([k, v]) => `${DISTRICTS[k].name} ${v}`).join('、')}）；` +
      `外壳 ${shellMeshes} 网格 / ${(shellTris / 1000).toFixed(0)}k 三角形；室内 ${(interiorTris / 1000).toFixed(0)}k 三角形；` +
      `光源 ${stats.lights}；烟囱 ${stats.smoke}；${stats.ms} ms`,
  );
}

// 墙根脏迹材质：Canvas 画竖向渐变（底部最浓、向上渐隐）+ 横向斑驳和溅痕，透明、不写深度
function makeGrime() {
  // 平滑竖向渐变：墙根最浓（α≈0.3）向上渐隐，无竖纹、无噪点
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0, 'rgba(45,36,26,0.3)');
  grd.addColorStop(0.35, 'rgba(50,40,30,0.14)');
  grd.addColorStop(1, 'rgba(55,45,35,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  m.name = 'wallGrime';
  m.userData.noShadow = true;
  return m;
}

// 每帧：壁炉火焰抖动（只动可见的室内组）
export function update(dt, t) {
  animateFlames(t);
}

// Builder 的分区键是 floor(坐标 / chunk)，跨 x=0 / z=0 的区会被切成 2~4 块；
// 这里把同一 Builder 里同材质的网格再并成一个 → 每区每材质 1 个 drawcall。
function mergeByMaterial(meshes) {
  const byMat = new Map();
  for (const m of meshes) {
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(m);
  }
  const out = [];
  for (const [mat, list] of byMat) {
    if (list.length === 1) {
      out.push(list[0]);
      continue;
    }
    const geo = mergeGeometries(list.map((m) => m.geometry), false);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    const parent = list[0].parent;
    for (const m of list) {
      parent.remove(m);
      m.geometry.dispose();
    }
    parent.add(mesh);
    out.push(mesh);
  }
  return out;
}

// 评审机位：酒馆内景、楼上看街、银行、各区街景
function registerViews(ctx, plans) {
  if (!ctx.views || !ctx.viewAt) return;
  const at = ctx.viewAt;
  const W = (p, x, y, z) => {
    const v = p.S.toWorld(x, y, z);
    return [v.x, v.y, v.z];
  };
  const byName = (n) => plans.find((p) => p.name === n);
  // 室内机位：站在离主角家具（吧台 / 柜台）最远的屋角，看向它
  const lookAt = (p, item, hour, fov = 72) => {
    const it = p.items.find((i) => i.k === 0 && i.name === item) || { x: 0, z: 0 };
    const corners = [[p.ix0 + 1.3, p.iz0 + 3.6], [p.ix1 - 1.3, p.iz0 + 3.6], [p.ix0 + 1.3, p.iz1(0) - 0.9], [p.ix1 - 1.3, p.iz1(0) - 0.9], [p.dx, p.iz1(0) - 0.6]];
    corners.sort((a, b) => Math.hypot(b[0] - it.x, b[1] - it.z) - Math.hypot(a[0] - it.x, a[1] - it.z));
    const [cx, cz] = corners[0];
    return at(W(p, cx, p.top(0) + 1.7, cz), W(p, it.x, p.top(0) + 0.9, it.z), hour, fov);
  };
  const tavern = byName('猪与哨子酒馆');
  if (tavern) {
    ctx.views.housesTavern = lookAt(tavern, 'bar', 15.5);
    ctx.views.housesTavernNight = lookAt(tavern, 'bar', 22);
  }
  const bank = byName('暴风城银行');
  if (bank) {
    const it = bank.items.find((i) => i.k === 0 && i.name === 'counter') || { x: 0, z: 0 };
    ctx.views.housesBank = at(W(bank, bank.dx, bank.top(0) + 1.7, bank.iz1(0) - 1.6), W(bank, it.x, bank.top(0) + 1.0, it.z - 1.0), 15.5, 70);
  }
  const lion = byName('金狮旅店');
  if (lion) ctx.views.housesInn = lookAt(lion, 'bar', 15.5);
  // 楼上看窗外街景：挑一栋三层贸易区房子，站在二层平台看正面窗
  const up = plans.find((p) => p.district === 'trade' && p.F === 3 && !p.name && p.win[1].front.length >= 2);
  if (up) {
    const a = up.win[1].front[0];
    ctx.views.housesUpstairs = at(W(up, a * 0.3, up.top(1) + 1.62, up.iz0 + 3.2), W(up, a, up.top(1) + 1.75, up.zf(1) + 6), 15.5, 70);
  }
  // 街景：站在门前街上斜看一排房子
  const street = (p) => at(W(p, p.W * 0.9, p.base + 1.7, p.zf(0) + 7), W(p, -p.W * 0.4, p.base + 5, p.zf(0) - 2), 15.5, 62);
  const pickD = (d, f = 'S') => plans.find((p) => p.district === d && p.face === f && p.F >= 2 && !p.name) || plans.find((p) => p.district === d);
  ctx.views.housesTrade = street(pickD('trade', 'N'));
  // 转角近景：贴近一栋贸易区房子的右前转角，低机位看接缝
  const cp = pickD('trade', 'S');
  ctx.views.housesCorner = at(W(cp, cp.W / 2 + 0.6, cp.base + 0.5, cp.zf(0) + 1.6), W(cp, cp.W / 2 - 0.3, cp.base + 1.8, cp.zf(0) - 0.5), 15.5, 60);
  ctx.views.housesBase = at(W(cp, cp.W * 0.3, cp.base + 1.0, cp.zf(0) + 3.5), W(cp, cp.W * 0.05, cp.base + 0.5, cp.zf(0)), 15.5, 60);
  // 第 5 轮三处穿插复查用的近景
  const wp = byName('武器铺') || cp;
  ctx.views.housesJetty = at(W(wp, wp.dx - 2.5, wp.base + 1.4, wp.zf(0) + 2.6), W(wp, wp.dx - 3.5, wp.base + 3.0, wp.zf(0)), 15.5, 65);
  const sh = plans.find((q) => q.shutters && q.F >= 2 && q.district === 'trade' && q.win[1].front.length >= 3) || cp;
  ctx.views.housesShutters = at(W(sh, sh.win[1].front[1], sh.base + 2.2, sh.zf(1) + 5.5), W(sh, sh.win[1].front[1], sh.top(1) + 1.6, sh.zf(1)), 15.5, 65);
  const mw = cp.win[0].back.length ? { x: cp.win[0].back[0], z: cp.iz0 } : { x: cp.win[0].front[0], z: cp.iz1(0) };
  ctx.views.housesMullion = at(W(cp, mw.x + 0.8, cp.top(0) + 1.7, mw.z + (mw.z < 0 ? 1.8 : -1.8)), W(cp, mw.x, cp.top(0) + 1.75, mw.z), 15.5, 60);
  const cq = pickD('cathedral', 'E');
  ctx.views.housesCorner2 = at(W(cq, -cq.W / 2 - 0.5, cq.base + 0.4, cq.zf(0) + 1.8), W(cq, -cq.W / 2 + 0.3, cq.base + 2.2, cq.zf(0) - 0.5), 15.5, 60);
  ctx.views.housesOld = street(pickD('oldtown', 'S'));
  ctx.views.housesMage = street(pickD('mage', 'S'));
  ctx.views.housesDwarf = street(pickD('dwarven', 'N'));
  ctx.views.housesCathedral = street(pickD('cathedral', 'E'));
  const sheep = byName('屠宰之羊酒馆');
  if (sheep) ctx.views.housesSheep = at(W(sheep, sheep.dx + 4, sheep.base + 1.7, sheep.zf(0) + 8), W(sheep, sheep.dx, sheep.base + 3.5, sheep.zf(0)), 15.5, 62);
}
