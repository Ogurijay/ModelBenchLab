// A 模块：地形与水系 —— 街区岛 / 驳岸 / 护栏 / 铺装、运河桥、要塞高台、港口码头、
// 城外艾尔文森林高度场（自然海岸线 + 城门土路）、统一水面（运河 + 海 + 水塘）。
// drawcall 预算：静态几何按材质整体合并（Builder 的 120 m 分块在原点两侧会把同材质切成 4 份，这里再并一次）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildIslands } from './islands.js';
import { buildBridges } from './bridges.js';
import { buildGround, makeGroundKit } from './ground.js';
import { buildWater } from './water.js';

// 地形 / 水面总范围（相机 far = 4000，雾会吃掉边缘）
const EXT = [-2500, -2700, 2500, 2100];
let water = null;

function mergeByMaterial(meshes, parent, castShadow, names) {
  const groups = new Map();
  for (const m of meshes) {
    if (!groups.has(m.material)) groups.set(m.material, []);
    groups.get(m.material).push(m);
  }
  const out = [];
  for (const [mat, list] of groups) {
    let mesh = list[0];
    if (list.length > 1) {
      const g = mergeGeometries(list.map((m) => m.geometry), false);
      g.computeBoundingSphere();
      for (const m of list) {
        parent.remove(m);
        m.geometry.dispose();
      }
      mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = castShadow && !mat.transparent;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
    mesh.name = `terrain:${names.get(mat) || mat.name || mat.type}`;
    out.push(mesh);
  }
  return out;
}

export async function build(ctx) {
  const M = ctx.mat;
  const names = new Map(Object.entries(M).filter(([, v]) => v?.isMaterial).map(([k, v]) => [v, k]));

  const root = new THREE.Group();
  root.name = 'terrain';
  ctx.scene.add(root);
  // F：贴地平面（不投影，全部是可站立地面）；S：墙 / 栏杆 / 桥身 / 栈桥（投影）
  const F = ctx.builder({ parent: root, tag: 'terrain', castShadow: false });
  const S = ctx.builder({ parent: root, tag: 'terrain', castShadow: true });
  // 地面铺装用共享材质的克隆（共用贴图）+ polygonOffset：其他模块贴着 y=0 放的地板 / 台阶 / 广场构件总能盖住地面
  const GM = {};
  const kit = makeGroundKit(ctx);
  for (const k of ['cobble', 'cobbleDark', 'plaza', 'dirt', 'planks']) {
    GM[k] = M[k].clone();
    Object.assign(GM[k], { name: `ground:${k}`, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
    names.set(GM[k], `ground:${k}`);
  }
  // 岛上草地（后院、雄狮安息地）直接用城外地面材质：同一套暖绿调色板 + 草纹 + 色斑噪声（已自带 polygonOffset）
  GM.grass = kit.mat;
  names.set(kit.mat, 'ground:grass');
  const { underMat } = buildIslands(ctx, F, S, GM);
  buildBridges(ctx, F, S, underMat, GM);
  const flat = mergeByMaterial(F.finish(), root, false, names);
  const solid = mergeByMaterial(S.finish(), root, true, names);
  for (const m of flat) m.userData.ground = true;
  for (const m of solid) if (m.material === M.planks) m.userData.ground = true; // 栈桥桥面（投影，放在 S）

  const g = buildGround(ctx, EXT, kit);
  water = buildWater(ctx, EXT, g.tex.noise);

  // 自测机位
  const V = ctx.views;
  const at = ctx.viewAt;
  if (V && at) {
    V.terrainCanal = at([62, 4.5, -69], [-30, -1.5, -69], 15.5, 60);
    V.terrainBridge = at([95, 1.7, 14], [80, 1.0, 0], 15.5, 70);
    V.terrainHarbor = at([-150, 26, -400], [-60, -2, -300], 15.5, 60);
    V.terrainBeach = at([-420, 6, -268], [-540, -2.5, -360], 15.5, 60);
    V.terrainKeep = at([262, 22, -60], [240, 8, -112], 15.5, 60);
    V.terrainRoad = at([250, 40, 270], [420, 0, 430], 15.5, 60);
    V.terrainPark = at([-140, 40, -20], [-213, 0, -120], 15.5, 60);
  }
  console.info(`[terrain] 静态三角形 ${(F.tris + S.tris) | 0}（含合并前统计）、高度场 ${g.tris}（块粒度 ${JSON.stringify(g.levels)}）、水面 ${water.mesh.geometry.attributes.position.count / 3}、网格 ${flat.length + solid.length + 2}`);
}

export function update(dt, t, ctx) {
  water?.update(dt, t, ctx);
}
