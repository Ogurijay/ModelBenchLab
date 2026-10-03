// 三阶色阶卡通材质 + 反向外壳描边（赛璐璐质感）
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let gradient3 = null, gradient2 = null;
function makeGradient(steps) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { data.set([v, v, v, 255], i * 4); });
  const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
/** 三阶：暗部 / 中间调 / 亮部 */
export function gradientMap() {
  if (!gradient3) gradient3 = makeGradient([90, 175, 255]);
  return gradient3;
}
export function gradientMap2() {
  if (!gradient2) gradient2 = makeGradient([130, 255]);
  return gradient2;
}

const cache = new Map();
export function toon(color, opts = {}) {
  const key = JSON.stringify([color, opts.emissive ?? 0, opts.map ? opts.map.uuid : 0, opts.side ?? 0, opts.transparent ?? 0, opts.opacity ?? 1, opts.two ?? 0]);
  if (!opts.noCache && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: opts.two ? gradientMap2() : gradientMap(),
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    map: opts.map ?? null, side: opts.side ?? THREE.FrontSide,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1
  });
  if (!opts.noCache) cache.set(key, m);
  return m;
}

const outlineMats = new Map();
/** 描边材质：沿平滑法线外扩，只画背面 */
export function outlineMaterial(thickness = 0.03, color = 0x0b0b10) {
  const key = thickness + ':' + color;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.thick = { value: thickness };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float thick;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * thick;');
  };
  // 不同厚度需要不同程序
  m.customProgramCacheKey = () => 'outline' + thickness;
  outlineMats.set(key, m);
  return m;
}

/** 为几何体生成平滑法线版本（描边外壳不会在硬边处开裂） */
export function smoothHull(geo) {
  const g = geo.clone();
  g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-3);
  m.computeVertexNormals();
  return m;
}

/** 给 Mesh 添加描边子物体 */
export function addOutline(mesh, thickness = 0.03) {
  const hull = new THREE.Mesh(smoothHull(mesh.geometry), outlineMaterial(thickness));
  hull.name = 'outline';
  hull.castShadow = false; hull.receiveShadow = false;
  hull.raycast = () => {};
  mesh.add(hull);
  return hull;
}

/** 画布贴图工具 */
export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso ?? 4;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
