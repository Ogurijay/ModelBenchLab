// 涂装投影：在车身坐标（毫米）里绘制俯视 / 侧视 / 前后视贴纸，着色器按法线混合投影。
// 这样贴纸可以跨越多个零件连续延伸（例如从鼻锥延伸到座舱的条纹），绘制方式与说明书贴纸位置图一致。
import * as THREE from 'three';

const DEFAULT_BOUNDS = { x0: -84, x1: 84, z0: -52, z1: 52, y0: -2, y1: 56 };

export class Livery {
  constructor({ bounds = {}, ppm = 8 } = {}) {
    const b = this.b = { ...DEFAULT_BOUNDS, ...bounds };
    this.ppm = ppm;
    const W = Math.round((b.x1 - b.x0) * ppm), D = Math.round((b.z1 - b.z0) * ppm), H = Math.round((b.y1 - b.y0) * ppm);
    this.topCanvas = mk(W, D);
    this.sideCanvas = mk(W, H * 2);   // 上半：右侧（+z），下半：左侧（-z）
    this.frontCanvas = mk(D, H * 2);  // 上半：车头面（+x），下半：车尾面（-x）
    this.H = H;
    this.used = { top: false, side: false, front: false };
    this.textures = null;
  }

  // 俯视绘制：坐标 (x, z)
  top(fn) {
    const c = this.topCanvas.getContext('2d'), b = this.b, p = this.ppm;
    c.save(); c.setTransform(p, 0, 0, -p, -b.x0 * p, b.z1 * p);
    fn(c, this); c.restore(); this.used.top = true; return this;
  }
  // 侧视绘制：坐标 (x, y)；which: 'right' | 'left' | 'both'（both 时 fn 收到 sign=+1/-1）
  side(fn, which = 'both') {
    const c = this.sideCanvas.getContext('2d'), b = this.b, p = this.ppm;
    const sides = which === 'both' ? [1, -1] : [which === 'right' ? 1 : -1];
    for (const s of sides) {
      const oy = s > 0 ? 0 : this.H;
      c.save(); c.beginPath(); c.rect(0, oy, this.sideCanvas.width, this.H); c.clip();
      c.setTransform(p, 0, 0, -p, -b.x0 * p, oy + b.y1 * p);
      fn(c, s, this); c.restore();
    }
    this.used.side = true; return this;
  }
  // 前/后视绘制：坐标 (z, y)
  front(fn, which = 'front') {
    const c = this.frontCanvas.getContext('2d'), b = this.b, p = this.ppm;
    const oy = which === 'front' ? 0 : this.H;
    c.save(); c.beginPath(); c.rect(0, oy, this.frontCanvas.width, this.H); c.clip();
    c.setTransform(p, 0, 0, -p, -b.z0 * p, oy + b.y1 * p);
    fn(c, this); c.restore(); this.used.front = true; return this;
  }

  getTextures() {
    if (this.textures) return this.textures;
    const tex = cv => {
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true; t.anisotropy = 8;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      return t;
    };
    this.textures = { top: tex(this.topCanvas), side: tex(this.sideCanvas), front: tex(this.frontCanvas) };
    return this.textures;
  }
  dispose() { if (this.textures) for (const t of Object.values(this.textures)) t.dispose(); this.textures = null; }
}

function mk(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' && !globalThis.document ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = w; c.height = h; return c;
}

// ---------- 绘图辅助（全部在当前毫米坐标系内） ----------

// 多边形 / 平滑闭合路径。pts: [[a,b],...]；smooth=true 时用二次样条穿过中点。
export function path(c, pts, { smooth = false, close = true } = {}) {
  c.beginPath();
  if (!smooth) { c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); }
  else {
    const n = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s = close ? mid(pts[n - 1], pts[0]) : pts[0];
    c.moveTo(s[0], s[1]);
    for (let i = 0; i < n - (close ? 0 : 1); i++) { const p = pts[i], q = pts[(i + 1) % n], m = mid(p, q); c.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
    if (!close) c.lineTo(pts[n - 1][0], pts[n - 1][1]);
  }
  if (close) c.closePath();
}
export function fillPath(c, pts, color, opts = {}) { path(c, pts, opts); c.fillStyle = color; c.fill(opts.rule || 'nonzero'); }
export function strokePath(c, pts, color, width, opts = {}) { path(c, pts, { close: false, ...opts }); c.strokeStyle = color; c.lineWidth = width; c.lineJoin = opts.join || 'round'; c.lineCap = opts.cap || 'round'; c.stroke(); }
export function mirrorPts(pts, axis = 1) { return pts.map(p => axis === 1 ? [p[0], -p[1]] : [-p[0], p[1]]); }

// 文字：dir 为阅读方向、up 为字头方向（均为当前坐标系里的向量），size 为字高（毫米）
export function text(c, str, x, y, { dir = [1, 0], up = [0, 1], size = 4, font = '900 {s}px "Arial Black", "Segoe UI", sans-serif', color = '#fff', align = 'center', stroke = null, strokeWidth = 0, skew = 0, stretch = 1, italic = 0 } = {}) {
  c.save();
  // 文字空间：+x 阅读方向，+y 向下（字头为 -y）
  c.transform(dir[0], dir[1], -up[0], -up[1], x, y);
  if (skew || italic) c.transform(1, 0, -(skew || italic), 1, 0, 0);
  const px = 100; // 先按 100 单位绘制再缩放，避免小字号的字体度量误差
  c.scale(size / px * stretch, size / px);
  c.font = font.replace('{s}', px);
  c.textAlign = align; c.textBaseline = 'middle';
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = strokeWidth * px / size; c.lineJoin = 'round'; c.strokeText(str, 0, 0); }
  c.fillStyle = color; c.fillText(str, 0, 0);
  c.restore();
}

// 闪电折线条带：中心折线 + 半宽，生成锯齿闪电多边形
export function boltPoly(points, width) {
  const L = [], R = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = typeof width === 'function' ? width(i / (points.length - 1)) : width;
    L.push([p[0] - dy * w, p[1] + dx * w]); R.push([p[0] + dy * w, p[1] - dx * w]);
  }
  return [...L, ...R.reverse()];
}

// ---------- 投影材质 ----------

const VERT_DECL = 'varying vec3 vLivPos;\nvarying vec3 vLivNrm;\n';
const FRAG_DECL = `
varying vec3 vLivPos;
varying vec3 vLivNrm;
uniform sampler2D livTop;
uniform sampler2D livSide;
uniform sampler2D livFront;
uniform vec4 livBoxXZ;
uniform vec2 livBoxY;
uniform vec2 livMR;
uniform float livSharp;
uniform vec3 livMask;
`;
const FRAG_SAMPLE = `
float livA = 0.0;
{
  vec3 n = normalize(vLivNrm);
  vec3 p = vLivPos;
  float u = (p.x - livBoxXZ.x) / (livBoxXZ.y - livBoxXZ.x);
  float w = (p.z - livBoxXZ.z) / (livBoxXZ.w - livBoxXZ.z);
  float h = clamp((p.y - livBoxY.x) / (livBoxY.y - livBoxY.x), 0.0, 1.0);
  vec4 cT = texture2D(livTop, vec2(u, w));
  vec4 cS = texture2D(livSide, vec2(u, h * 0.5 + (p.z >= 0.0 ? 0.5 : 0.0)));
  vec4 cF = texture2D(livFront, vec2(w, h * 0.5 + (n.x >= 0.0 ? 0.5 : 0.0)));
  vec3 a = pow(abs(n), vec3(livSharp));
  float wt = (n.y > 0.0 ? a.y : 0.0) * livMask.x;
  float ws = a.z * livMask.y;
  float wf = a.x * livMask.z;
  // 掩码作为投影优先级：按掩码后的权重归一化；朝下的面（三项权重都很小）不上贴纸
  float total = wt + ws + wf;
  float norm = max(total, 0.35 * (a.x + a.y + a.z)) + 1e-5;
  vec4 acc = cT * wt + cS * ws + cF * wf;
  livA = clamp(acc.a / norm, 0.0, 1.0);
  vec3 livRGB = acc.rgb / max(acc.a, 1e-4);
  diffuseColor.rgb = mix(diffuseColor.rgb, livRGB, livA);
}
`;

// 带涂装投影的车漆材质（ABS 注塑件 + 金属感贴纸）
export function paintMaterial({
  color = 0xffffff, livery = null, metalness = 0.0, roughness = 0.38, clearcoat = 0.7, clearcoatRoughness = 0.12,
  decalMetal = 0.25, decalRough = 0.3, sharp = 5, mask = [1, 1, 1], envMapIntensity = 1, side = THREE.FrontSide, name = 'paint',
} = {}) {
  const m = new THREE.MeshPhysicalMaterial({ color, metalness, roughness, clearcoat, clearcoatRoughness, envMapIntensity, side });
  m.name = name;
  if (!livery) return m;
  const t = livery.getTextures(), b = livery.b;
  const uniforms = {
    livTop: { value: t.top }, livSide: { value: t.side }, livFront: { value: t.front },
    livBoxXZ: { value: new THREE.Vector4(b.x0, b.x1, b.z0, b.z1) }, livBoxY: { value: new THREE.Vector2(b.y0, b.y1) },
    livMR: { value: new THREE.Vector2(decalMetal, decalRough) }, livSharp: { value: sharp }, livMask: { value: new THREE.Vector3(...mask) },
  };
  m.userData.livery = uniforms;
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLivPos = position;\nvLivNrm = objectNormal;');
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_SAMPLE)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, livMR.y, livA);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, livMR.x, livA);');
  };
  m.customProgramCacheKey = () => 'livery-v2';
  return m;
}
