// B 模块：城墙与英雄谷。入口 build(ctx)。
// - citywall.js：外城墙普通墙段、角楼（马道穿塔）、4 处登城阶梯、北墙港口隧道
// - valley.js：英雄谷峡谷墙、盆地、主桥、雕像平台、城门楼、城外广场
// - statues.js：8 尊程序化英雄像
// 静态几何全部走两个 Builder：B（墙体 / 结构，按材质合并成一批网格）、G（铺装 / 草地，标 userData.ground）。
import { buildCityWall } from './citywall.js';
import { buildValley } from './valley.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Builder 按分区 floor(x/chunk) 分桶，城墙横跨原点会被切成 4 份；这里再按材质并成一个网格
function mergeByMaterial(ctx, meshes) {
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
    const merged = mergeGeometries(list.map((m) => m.geometry), false);
    if (!merged) {
      out.push(...list);
      continue;
    }
    merged.computeBoundingSphere();
    const mesh = new ctx.THREE.Mesh(merged, mat);
    const first = list[0];
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.matrixAutoUpdate = false;
    first.parent.add(mesh);
    for (const m of list) {
      m.parent.remove(m);
      m.geometry.dispose();
    }
    out.push(mesh);
  }
  return out;
}

export function build(ctx) {
  const C = ctx.coords;
  // chunk 取大：整个模块每种材质只合并成一个网格（俯瞰时 drawcall 最省）
  const B = ctx.builder({ tag: 'wall', chunk: 5000 });
  const G = ctx.builder({ tag: 'wall-ground', chunk: 5000 });

  const wall = buildCityWall(ctx, B, G);
  const valley = buildValley(ctx, B, G);

  for (const m of mergeByMaterial(ctx, B.finish())) m.name = 'walls:structure';
  for (const m of mergeByMaterial(ctx, G.finish())) {
    m.name = 'walls:ground';
    m.userData.ground = true;
  }

  // ---------- 评审机位 ----------
  const v = ctx.views;
  if (v && ctx.viewAt) {
    const at = (lx, y, lz) => {
      const [x, z] = C.valleyToWorld(lx, lz);
      return [x, y, z];
    };
    v.wallsStatue = ctx.viewAt(at(-3, 3.2, 47), at(11.5, 9, 66), 15.5, 60);
    v.wallsValley = ctx.viewAt(at(-30, 62, 250), at(0, -6, 90), 15.5, 55);
    v.wallsMouth = ctx.viewAt(at(-14, 4, -34), at(4, 2, 20), 15.5, 60);
    v.wallsGateOut = ctx.viewAt(at(0, 5, 240), at(0, 14, 180), 15.5, 60);
    v.wallsStatue2 = ctx.viewAt(at(2, 3.5, 84), at(-11.5, 9, 100), 15.5, 60);
    v.wallsStatue3 = ctx.viewAt(at(-2, 3.5, 118), at(11.5, 9, 135), 15.5, 60);
    v.wallsStatue4 = ctx.viewAt(at(3, 3.5, 14), at(-11.5, 9, 30), 15.5, 60);
    // 每尊雕像的正面特写（桥面上、离像约 10 m）
    C.VALLEY.statues.forEach((st, i) => {
      const sg = Math.sign(st.lx);
      v[`wallsHero${i}`] = ctx.viewAt(at(st.lx - sg * 13, 7, st.lz + 3), at(st.lx, 9, st.lz), 15.5, 60);
    });
    v.wallsBasin = ctx.viewAt(at(-12, -12.3, 40), at(10, -3, 95), 15.5, 65);
    v.wallsTunnel = ctx.viewAt([-110, 1.7, -238], [-110, 3, -262], 15.5, 60);
    v.wallsStair = ctx.viewAt([-252, 4, -36], [-270, 8, -70], 15.5, 60);
    v.wallsWalk = ctx.viewAt([-276, 15.6, -160], [-276, 15, -262], 15.5, 60);
    v.wallsKeep = ctx.viewAt([322, 16, -116], [331, 13, -84], 15.5, 60);
  }
  return { towers: wall.towers.length, gateLamps: valley.lamps };
}
