// D 模块：地标。入口只负责按顺序装配各地标、准备模块内共享的现画材质，并汇总每帧动画回调。
// 光明大教堂 / 暴风要塞 / 巫师圣所 / 两座喷泉 / 大熔炉 / 矿道地铁入口 / 雄狮安息地纪念碑。
import * as THREE from 'three';
import { buildCathedral } from './cathedral.js';
import { buildKeep } from './keep.js';
import { buildSanctum } from './sanctum.js';
import { buildFountains } from './fountains.js';
import { buildForge, buildTram } from './forge.js';
import { buildMemorial } from './memorial.js';
import { buildCathedralPlaza, buildOldtownSquare } from './plaza.js';
import { flowerTexture, waterMaterial, fadeMaterial } from './kit.js';

const updaters = [];

export function build(ctx) {
  updaters.length = 0;
  const M = ctx.mat;
  const add = (fn) => typeof fn === 'function' && updaters.push(fn);

  // 模块内共享材质（不改 core/materials.js）
  const water = waterMaterial(M.textures.waterN);
  const curtain = water.clone();
  curtain.opacity = 0.32;
  curtain.side = THREE.DoubleSide;
  curtain.color.set(0xbfe9f2);
  const shared = {
    flowers: new THREE.MeshStandardMaterial({ map: flowerTexture(ctx.rng('lm:flowers')), roughness: 0.95, name: 'lmFlowers' }),
    water,
    curtain,
    spray: new THREE.PointsMaterial({ color: 0xe6f7ff, size: 0.17, transparent: true, opacity: 0.85, depthWrite: false }),
    forgeFire: M.fire.clone(),
    // 室内侧彩窗：比 core 的 stained 更亮（白天也像被阳光透过），每帧跟随 stained 的昼夜强度再加一档
    glassIn: Object.assign(M.stained.clone(), { name: 'lmGlassIn' }),
    fade: fadeMaterial(0.45),
    black: new THREE.MeshBasicMaterial({ color: 0x020202 }),
  };

  // 所有地标的外观几何进同一个 Builder（chunk 取极大 = 每种材质全城一个网格）：
  // 地标分散在全城，按 120 m 分区会切出 ~80 个网格 + 同样多的阴影批次；合并后俯瞰 ≈ 30 + 阴影 ≈ 15。
  // 室内（长椅、吊灯、书架……）仍是各自的距离 LOD 组，不在这里。
  const root = new THREE.Group();
  root.name = '地标·外观';
  root.userData.grounded = true;
  ctx.scene.add(root);
  shared.root = root;
  shared.B = ctx.builder({ parent: root, tag: 'landmarks', chunk: Infinity }); // x/∞ = ±0 → 同一分区键

  add(buildCathedral(ctx, shared));
  add(buildKeep(ctx, shared));
  add(buildSanctum(ctx, shared));
  add(buildFountains(ctx, shared));
  add(buildForge(ctx, shared));
  add(buildTram(ctx, shared));
  add(buildMemorial(ctx, shared));
  add(buildCathedralPlaza(ctx, shared));
  add(buildOldtownSquare(ctx, shared));
  add(() => {
    shared.glassIn.emissiveIntensity = 0.9 + 1.4 * M.stained.emissiveIntensity;
  });

  // 统一合批：小件 / 发光 / 铺地材质不投影（省一半阴影批次），铺地打 ground 标记
  const noShadow = new Set([M.gold, M.dirt, M.stained, M.stainedOutside, shared.glassIn, shared.plazaMat, shared.keepPave, ...(shared.stairMats ? [shared.stairMats[1]] : []), M.plaza, M.windowGlow, M.banner, M.fabricBlue, M.arcane, M.fire, M.lampGlow,
    M.cobbleDark, shared.flowers, shared.forgeFire, shared.black]);
  const ground = new Set([M.plaza, M.cobbleDark]);
  for (const mesh of shared.B.finish()) {
    if (noShadow.has(mesh.material) || mesh.material.isMeshBasicMaterial || mesh.material.name === 'lmTramSign') mesh.castShadow = false;
    if (ground.has(mesh.material)) mesh.userData.ground = true;
    mesh.name = `地标·${mesh.material.map?.name || mesh.material.name || mesh.material.type}`;
  }

  // 水面涟漪（法线贴图漂移）
  const wn = water.normalMap;
  const cn = curtain.normalMap;
  add((dt, t) => {
    wn.offset.set(t * 0.035, t * 0.021);
    cn.offset.set(0, -t * 0.6);
    water.normalScale.setScalar(0.55 + 0.15 * Math.sin(t * 1.3));
  });

  // 评审机位（本模块自测用；名字带 lm 前缀避免和别的模块冲突）
  const V = ctx.views;
  const at = ctx.viewAt;
  V.lmNave = at([-55, 2.6, -158], [-55, 6, -215], 15.5, 70);
  V.lmCathedralAir = at([20, 60, -95], [-55, 20, -186], 15.5, 55);
  V.lmThrone = at([300, 15.5, -214], [300, 16, -262], 15.5, 70);
  V.lmKeepAir = at([200, 90, -40], [300, 20, -220], 15.5, 55);
  V.lmStairs = at([240, 3, -78], [240, 12, -130], 15.5, 65);
  V.lmSanctum = at([-146, 3, 85], [-169, 30, 60], 15.5, 70);
  V.lmSanctumFar = at([-70, 55, 140], [-169, 32, 60], 15.5, 55);
  V.lmVault = at([-55, 3, -185], [-55, 27, -205], 15.5, 75);
  V.lmFacade = at([-55, 6, -128], [-55, 14, -153], 15.5, 65);
  V.lmSanctumIn = at([-162.5, 1.7, 60], [-176, 1.6, 60], 15.5, 75);
  V.lmFountain = at([14, 4, 14], [0, 1.5, 0], 15.5, 60);
  V.lmStatue = at([-42, 3, -110], [-55, 3, -122], 15.5, 60);
  V.lmForge = at([128, 4, -150], [128, 4, -175], 15.5, 70);
  V.lmTram = at([190, 3, -145], [190, 7, -170], 15.5, 65);
  V.lmTramIn = at([190, 4.2, -165], [190, 1.5, -186], 15.5, 70);
  V.lmMemorial = at([-195, 8, -115], [-213, 8, -139], 15.5, 60);
  V.lmNaveNight = at([-55, 2.6, -158], [-55, 6, -215], 21.5, 70);
  V.lmThroneNight = at([300, 15.5, -214], [300, 16, -262], 21.5, 70);
  V.lmForgeNight = at([128, 4, -150], [128, 4, -175], 21.5, 70);
}

export function update(dt, t, ctx) {
  for (const fn of updaters) fn(dt, t, ctx);
}
