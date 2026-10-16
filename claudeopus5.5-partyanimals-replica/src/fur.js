// 毛绒渲染:壳层(shell)法。把基础网格沿法线复制 N 层,片元按三维格点哈希挖掉"毛丝"之外的部分。
// 颜色来自顶点色(物种配色在建网格时烘焙),根部压暗模拟毛发自遮挡。
import * as THREE from 'three';

const furMaterials = new Map();

// 统一的毛绒材质;length = 毛长(米),density = 每米格点数
export function furMaterial({ length = 0.032, density = 62, rough = 0.92, stiff = 0.5, sheen = 0.35 } = {}) {
  const key = [length, density, rough, stiff, sheen].join('|');
  if (furMaterials.has(key)) return furMaterials.get(key);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: 0 });
  m.userData.uniforms = {
    uFurLen: { value: length },
    uDensity: { value: density },
    uDroop: { value: 1 - stiff },
    uSheen: { value: sheen },
    uWind: { value: new THREE.Vector3() },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aShell;
        uniform float uFurLen; uniform float uDroop; uniform vec3 uWind;
        varying float vShell; varying vec3 vBase;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vShell = aShell; vBase = position;
        vec3 gObj = transpose(mat3(modelMatrix)) * (vec3(0.0, -1.0, 0.0) * uDroop + uWind);
        float sh2 = aShell * aShell;
        transformed += normalize(objectNormal) * aShell * uFurLen + gObj * sh2 * uFurLen * 0.55;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uDensity; uniform float uSheen;
        varying float vShell; varying vec3 vBase;
        float furHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vShell > 0.001) {
          vec3 q = vBase * uDensity;
          vec3 cell = floor(q);
          vec3 lp = fract(q) - 0.5;
          float h = furHash(cell);
          float h2 = furHash(cell + 7.31);
          lp += (vec3(h, h2, fract(h * 13.7)) - 0.5) * 0.45;
          float rad = length(lp);
          float tip = mix(0.58, 0.08, vShell);
          if (h * 0.55 + 0.45 < vShell || rad > tip) discard;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.52, 1.06, pow(vShell, 0.8));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * uSheen * 0.18 * vShell;`);
  };
  m.customProgramCacheKey = () => 'fur' + key;
  furMaterials.set(key, m);
  return m;
}

// 把基础几何(含 position/normal/color)复制成 layers 层壳
export function shellGeometry(base, layers = 10) {
  const g = base.index ? base.toNonIndexed() : base;
  const pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color;
  const n = pos.count;
  const P = new Float32Array(n * layers * 3), N = new Float32Array(n * layers * 3), C = new Float32Array(n * layers * 3), S = new Float32Array(n * layers);
  for (let l = 0; l < layers; l++) {
    P.set(pos.array, l * n * 3);
    N.set(nor.array, l * n * 3);
    if (col) C.set(col.array, l * n * 3); else C.fill(1, l * n * 3, (l + 1) * n * 3);
    S.fill(l / (layers - 1), l * n, (l + 1) * n);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setAttribute('aShell', new THREE.BufferAttribute(S, 1));
  out.computeBoundingSphere();
  out.boundingSphere.radius += 0.06;
  return out;
}

// 给几何烘焙顶点色:paint(p, n, out) 写入 THREE.Color
export function paintGeometry(geo, paint) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const arr = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
    paint(p, n, c);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// 胶囊/椭球等基础形
export function blobGeometry(rx, ry, rz, segW = 28, segH = 20) {
  const g = new THREE.SphereGeometry(1, segW, segH);
  g.scale(rx, ry, rz);
  g.computeVertexNormals();
  return g;
}

export function capsuleGeometry(r, len, segR = 14, segL = 10) {
  const g = new THREE.CapsuleGeometry(r, len, segL, segR);
  g.computeVertexNormals();
  return g;
}

// 便捷:基础几何 -> 上色 -> 壳层 -> Mesh
export function furMesh(base, paint, { layers = 10, ...mat } = {}) {
  paintGeometry(base, paint);
  const geo = shellGeometry(base, layers);
  const mesh = new THREE.Mesh(geo, furMaterial(mat));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
