// 材质库。所有几何 UV 都是米制,所以贴图 repeat = 1 / 该贴图代表的物理尺寸(米)。
// 于是城墙、屋瓦、地面的纹理密度天然一致,不需要逐件调 repeat。
import * as THREE from 'three';
import { TEX, repeated } from './textures.js';

function std(map, physical, opts = {}) {
  const { bump = 0.35, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({
    roughness: 0.92, metalness: 0.0, envMapIntensity: 0.42, ...rest,
  });
  if (map) {
    m.map = repeated(map, 1 / physical);
    if (bump > 0) {
      m.bumpMap = m.map;
      m.bumpScale = bump;
    }
  }
  return m;
}

export function createMaterials() {
  const M = {};

  /* ---- 石作 ---- */
  M.stone = std(TEX.stone(), 4, { roughness: 0.95, bump: 0.5 });
  M.stoneDark = std(TEX.stoneDark(), 4.5, { roughness: 0.97, bump: 0.55, color: 0xbfc0c2 });
  M.stoneWarm = std(TEX.stoneWarm(), 4, { roughness: 0.9, bump: 0.45 });
  M.stoneTrim = std(TEX.stoneWarm(), 2, { roughness: 0.78, bump: 0.2, color: 0xe9e2cf });
  M.marble = std(TEX.flagstone(), 3, { roughness: 0.35, color: 0xf2eee2, envMapIntensity: 0.9, bump: 0.06 });
  M.cobble = std(TEX.cobble(), 6, { roughness: 1.0, bump: 0.7 });
  M.flagstone = std(TEX.flagstone(), 4, { roughness: 0.86, bump: 0.3 });
  M.flagstoneDark = std(TEX.flagstoneDark(), 4, { roughness: 0.9, bump: 0.3 });

  /* ---- 抹灰 ---- */
  M.plaster = std(TEX.plaster(), 3, { roughness: 0.96, bump: 0.16 });
  M.plasterWarm = std(TEX.plasterWarm(), 3, { roughness: 0.96, bump: 0.16 });
  M.plasterPale = std(TEX.plasterPale(), 3, { roughness: 0.96, bump: 0.16 });
  M.plasterRose = std(TEX.plasterRose(), 3, { roughness: 0.96, bump: 0.16 });

  /* ---- 木作 ---- */
  M.plank = std(TEX.planks(), 2.4, { roughness: 0.88, bump: 0.22 });
  M.plankV = std(TEX.planksV(), 2.4, { roughness: 0.88, bump: 0.22 });
  M.plankDark = std(TEX.planksDark(), 2.4, { roughness: 0.9, bump: 0.22 });
  M.plankLight = std(TEX.planksLight(), 2.4, { roughness: 0.86, bump: 0.2 });
  M.timber = std(TEX.planksDark(), 1.6, { roughness: 0.92, color: 0x8d7256, bump: 0.3 });
  M.timberDark = std(TEX.planksDark(), 1.6, { roughness: 0.94, color: 0x5b442e, bump: 0.3 });

  /* ---- 屋面 ---- */
  M.roofBlue = std(TEX.roofBlue(), 2.2, { roughness: 0.72, bump: 0.4, envMapIntensity: 0.7 });
  M.roofTeal = std(TEX.roofTeal(), 2.2, { roughness: 0.7, bump: 0.4, envMapIntensity: 0.7 });
  M.roofSlate = std(TEX.roofSlate(), 2.2, { roughness: 0.8, bump: 0.4, envMapIntensity: 0.55 });
  M.thatch = std(TEX.thatch(), 3, { roughness: 1.0, bump: 0.6 });

  /* ---- 地表 ---- */
  M.grass = std(TEX.grass(), 9, { roughness: 1.0, bump: 0.2 });
  // 城外那张 2800m 的大平面用更大的贴图物理尺寸,否则远看是一片规则网格
  M.grassFar = std(TEX.grass(), 26, { roughness: 1.0, bump: 0, color: 0xa9bda0 });
  M.grassDark = std(TEX.grass(), 9, { roughness: 1.0, bump: 0.2, color: 0x9fb08c });
  M.dirt = std(TEX.dirt(), 5, { roughness: 1.0, bump: 0.4 });
  M.sand = std(TEX.dirt(), 5, { roughness: 1.0, color: 0xd6c39a, bump: 0.3 });

  /* ---- 金属 ---- */
  M.iron = new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.52, metalness: 0.85, envMapIntensity: 1.0 });
  M.ironDark = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.62, metalness: 0.75, envMapIntensity: 0.8 });
  M.gold = new THREE.MeshStandardMaterial({ color: 0xd8ae52, roughness: 0.28, metalness: 0.95, envMapIntensity: 1.3 });
  M.copper = new THREE.MeshStandardMaterial({ color: 0x6fae9a, roughness: 0.6, metalness: 0.4, envMapIntensity: 0.9 });

  /* ---- 布 / 织物 ---- */
  const cloth = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, side: THREE.DoubleSide });
  M.clothBlue = cloth(0x2f5896);
  M.clothRed = cloth(0x8e2b2b);
  M.clothGreen = cloth(0x3c6b45);
  M.clothCream = cloth(0xd9cdae);
  M.carpet = new THREE.MeshStandardMaterial({ color: 0x7d2230, roughness: 0.98 });

  M.bannerRoyal = new THREE.MeshStandardMaterial({
    map: TEX.banner('#28508f', '#e2c169', 'royal'), roughness: 0.94, side: THREE.DoubleSide,
  });
  M.bannerCrimson = new THREE.MeshStandardMaterial({
    map: TEX.banner('#7b2230', '#e2c169', 'crimson'), roughness: 0.94, side: THREE.DoubleSide,
  });

  /* ---- 玻璃 / 发光 ---- */
  M.glass = new THREE.MeshStandardMaterial({
    color: 0x243449, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.42,
    envMapIntensity: 1.6, emissive: 0xffb35c, emissiveIntensity: 0.0, side: THREE.DoubleSide,
  });
  M.stainedLancet = new THREE.MeshStandardMaterial({
    map: TEX.stainedLancet(), emissiveMap: TEX.stainedLancet(), emissive: 0xffffff, emissiveIntensity: 0.55,
    roughness: 0.25, metalness: 0.0, side: THREE.DoubleSide, transparent: true, opacity: 0.94,
  });
  M.stainedRose = new THREE.MeshStandardMaterial({
    map: TEX.stainedRose(), emissiveMap: TEX.stainedRose(), emissive: 0xffffff, emissiveIntensity: 0.55,
    roughness: 0.25, metalness: 0.0, side: THREE.DoubleSide, transparent: true, opacity: 0.94,
  });

  // 装饰性水面(喷泉/水池/水柱);运河大水面用 water.js 的着色器材质
  M.water = new THREE.MeshStandardMaterial({
    color: 0x2f6a8c, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.78,
    envMapIntensity: 1.5,
  });

  M.emberGlow = new THREE.MeshBasicMaterial({ color: 0xff7a24 });
  M.fireCore = new THREE.MeshBasicMaterial({ color: 0xffd089 });
  M.lampGlass = new THREE.MeshStandardMaterial({
    color: 0xffdca8, emissive: 0xffb958, emissiveIntensity: 0.6, roughness: 0.1,
    transparent: true, opacity: 0.75,
  });
  M.forgeGlow = new THREE.MeshBasicMaterial({ color: 0xff5a12 });
  M.candle = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, emissive: 0xffcf8a, emissiveIntensity: 0.4, roughness: 0.6 });

  /* ---- 植被 ---- */
  M.foliage = new THREE.MeshStandardMaterial({ color: 0x4a7038, roughness: 0.94, flatShading: true });
  M.foliageDark = new THREE.MeshStandardMaterial({ color: 0x37552b, roughness: 0.95, flatShading: true });
  M.foliageWarm = new THREE.MeshStandardMaterial({ color: 0x6b7f33, roughness: 0.95, flatShading: true });
  M.bark = std(TEX.planksDark(), 1.2, { roughness: 0.98, color: 0x6d5540, bump: 0.5 });

  /* ---- 招牌 ---- */
  M.signs = {};
  for (const s of ['mug', 'hammer', 'bread', 'sword', 'herb']) {
    M.signs[s] = new THREE.MeshStandardMaterial({ map: TEX.sign(s), roughness: 0.9, side: THREE.DoubleSide });
  }

  /* ---- 夜晚会亮起来的材质集合 ---- */
  M._nightLit = [
    { m: M.glass, day: 0.0, night: 1.45 },
    { m: M.stainedLancet, day: 0.5, night: 1.2 },
    { m: M.stainedRose, day: 0.5, night: 1.2 },
    { m: M.lampGlass, day: 0.15, night: 1.5 },
    { m: M.candle, day: 0.12, night: 0.9 },
  ];

  /** 由昼夜系统调用:t=0 白天,t=1 夜晚。 */
  M.setNight = (t) => {
    for (const e of M._nightLit) e.m.emissiveIntensity = e.day + (e.night - e.day) * t;
  };

  // 环境反射统一由 scene.environment 提供(sky.js 用 PMREM 从天空现生成),无需逐材质挂 envMap。

  M.dispose = () => {
    for (const k of Object.keys(M)) {
      const m = M[k];
      if (m && m.isMaterial) m.dispose();
    }
  };

  return M;
}
