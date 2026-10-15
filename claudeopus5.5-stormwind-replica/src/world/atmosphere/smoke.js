// 烟雾：消费 ctx.fx.smoke 的发射点，一个 Points 搞定全部烟囱。
// 粒子运动完全在顶点着色器里按 (发射点, 相位, 时间) 解析计算——CPU 每帧只更新一个 uTime。
import * as THREE from 'three';

export const MAX_SMOKE = 3000;

// 单团高斯软粒子：中心不饱和、边缘指数衰减到 0（上一版几团偏心软圆叠出"串珠"）
function puffTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (x + 0.5) / S - 0.5;
      const dy = (y + 0.5) / S - 0.5;
      const r2 = (dx * dx + dy * dy) * 4; // 0 中心 → 1 内切圆
      const a = Math.max(0, Math.exp(-r2 * 3.2) - Math.exp(-3.2)) / (1 - Math.exp(-3.2));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

const VERT = /* glsl */ `
attribute vec3 aSeed; // x 相位 0..1, y 随机, z 随机
uniform float uTime;
uniform float uLife;
uniform float uScale;
uniform vec2 uWind;
varying float vAlpha;
varying float vShade;
#include <fog_pars_vertex>
void main() {
  float age = fract(uTime / uLife + aSeed.x);
  vec3 p = position;
  float a = aSeed.y * 6.2831;
  // 上升减速 + 顺风弯折（越老越被风带走）+ 扩散
  p.y += 8.0 * (1.0 - pow(1.0 - age, 1.8)) + age * 3.0;
  p.xz += uWind * (age * 4.0 + age * age * 16.0);
  p.xz += vec2(cos(a), sin(a)) * age * (0.6 + aSeed.z * 1.4);
  p.x += sin(uTime * 0.5 + aSeed.y * 20.0) * 0.6 * age;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  // 大而淡：出口 1.6 m，消散时 ~9 m；透明度先快升再随寿命一路变淡
  float size = (1.6 + age * 7.5) * (0.85 + aSeed.z * 0.3);
  gl_PointSize = min(size * uScale / -mvPosition.z, 512.0);
  vAlpha = smoothstep(0.0, 0.1, age) * pow(1.0 - age, 1.5);
  // 按相机距离淡出：> 150 m 完全不画（远看一根根细烟柱像划痕）
  float camD = distance(cameraPosition, position);
  vAlpha *= 1.0 - smoothstep(100.0, 150.0, camD);
  if (vAlpha < 0.002) gl_PointSize = 0.0;
  vShade = 0.85 + 0.25 * aSeed.z - 0.15 * age;
  #include <fog_vertex>
}
`;
const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vShade;
#include <fog_pars_fragment>
void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor * vShade, a);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function buildSmoke(ctx, group) {
  const emitters = ctx.fx.smoke;
  const n = emitters.length;
  if (!n) return { update() {}, count: 0 };
  // 每个发射点分配的粒子数：总量 ≤ 3000，每点 4~24
  const per = Math.max(4, Math.min(24, Math.floor(MAX_SMOKE / n)));
  const total = Math.min(MAX_SMOKE, per * n);
  const pos = new Float32Array(total * 3);
  const seed = new Float32Array(total * 3);
  const rng = ctx.rng('atmo:smoke');
  for (let i = 0; i < total; i++) {
    const e = emitters[i % n];
    pos[i * 3] = e.x + (rng() - 0.5) * 0.3;
    pos[i * 3 + 1] = e.y;
    pos[i * 3 + 2] = e.z + (rng() - 0.5) * 0.3;
    // 同一发射点的粒子相位均匀错开，烟柱连续
    const k = Math.floor(i / n);
    seed[i * 3] = (k + rng() * 0.6) / per;
    seed[i * 3 + 1] = rng();
    seed[i * 3 + 2] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uLife: { value: 12 },
      uScale: { value: 600 },
      uWind: { value: new THREE.Vector2(0.42, 0.18) }, // 西北风往东南吹，与旗帜方向一致
      uColor: { value: new THREE.Color(0xd8d4cc) },
      uOpacity: { value: 0.28 },
    },
  ]);
  uniforms.uMap = { value: puffTexture() };
  const mat = new THREE.ShaderMaterial({
    name: 'atmo-smoke',
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'atmo-smoke';
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  group.add(pts);

  const day = new THREE.Color(0xdcd8d0);
  const nightC = new THREE.Color(0x3a3c48);
  function update(dt, t) {
    uniforms.uTime.value = t;
    // 点大小随画布高度缩放（gl_PointSize 是像素）
    uniforms.uScale.value = ctx.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(ctx.camera.fov) / 2));
    uniforms.uColor.value.lerpColors(day, nightC, ctx.env.night);
    // 俯瞰 / 巡游整体减量
    const aerial = ctx.mode === 'overview' || ctx.mode === 'tour' || ctx.camera.position.y > 60;
    uniforms.uOpacity.value = (0.28 - 0.08 * ctx.env.night) * (aerial ? 0.4 : 1);
  }
  return { update, count: total };
}
