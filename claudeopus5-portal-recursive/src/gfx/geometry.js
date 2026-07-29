// 把关卡的盒集合按材质合并成单个 BufferGeometry:每种材质一次 draw call。
// UV 直接由面的世界尺寸生成(每 2m 一格),所以贴图密度处处一致,且不必为每块墙克隆材质
// —— 递归门渲染一帧要跑 5 遍场景,draw call 必须压住。
import * as THREE from 'three';

// 面内两轴必须满足 u × v = n,否则三角形绕序与 attribute normal 相反:
// FrontSide 材质会把近侧面剔掉、露出盒子的远侧面,光照也会因为法线朝里而全黑。
const FACES = [
  { n: [1, 0, 0], u: 1, v: 2, max: true },   // y × z = +x
  { n: [-1, 0, 0], u: 1, v: 2, max: false },
  { n: [0, 1, 0], u: 2, v: 0, max: true },   // z × x = +y
  { n: [0, -1, 0], u: 2, v: 0, max: false },
  { n: [0, 0, 1], u: 0, v: 1, max: true },   // x × y = +z
  { n: [0, 0, -1], u: 0, v: 1, max: false },
];

const TILE = 2; // 每 2 米一个贴图循环

export function mergedGeometry(boxes) {
  const pos = [];
  const nor = [];
  const uv = [];
  for (const b of boxes) {
    const size = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    for (const f of FACES) {
      const axis = f.n[0] !== 0 ? 0 : f.n[1] !== 0 ? 1 : 2;
      const fixed = f.max ? b.max[axis] : b.min[axis];
      const su = size[f.u];
      const sv = size[f.v];
      // 四个角(按法线方向保持逆时针)
      const corner = (iu, iv) => {
        const p = [0, 0, 0];
        p[axis] = fixed;
        p[f.u] = iu ? b.max[f.u] : b.min[f.u];
        p[f.v] = iv ? b.max[f.v] : b.min[f.v];
        return p;
      };
      const quad = f.max
        ? [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)]
        : [corner(1, 0), corner(0, 0), corner(0, 1), corner(1, 1)];
      const uvs = f.max
        ? [[0, 0], [su / TILE, 0], [su / TILE, sv / TILE], [0, sv / TILE]]
        : [[0, 0], [su / TILE, 0], [su / TILE, sv / TILE], [0, sv / TILE]];
      for (const [a, bb, c] of [[0, 1, 2], [0, 2, 3]]) {
        for (const i of [a, bb, c]) {
          pos.push(quad[i][0], quad[i][1], quad[i][2]);
          nor.push(f.n[0], f.n[1], f.n[2]);
          uv.push(uvs[i][0], uvs[i][1]);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}

/** 按材质分组合并,返回 Mesh 数组 */
export function buildLevelMeshes(boxes, materials) {
  const groups = new Map();
  for (const b of boxes) {
    const key = materials[b.mat] ? b.mat : 'dark';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const meshes = [];
  for (const [mat, list] of groups) {
    const mesh = new THREE.Mesh(mergedGeometry(list), materials[mat]);
    mesh.renderOrder = mat === 'glass' ? 2 : 0;
    meshes.push(mesh);
  }
  return meshes;
}
