// 水面：一整块大平面（挖掉英雄谷盆地）= 城内运河 + 城外海面 + 森林里的小水塘，同一张网格、同一个材质。
// 风格化：青绿（运河）→ 深蓝（外海），水深来自一张烘焙的"水深图"（运河 3 m、岛 / 城墙 / 沙滩处变浅），
// 浅处更亮更透明、岸线带泡沫；法线贴图双层反向滚动 + 一层大尺度破平铺；菲涅尔把掠射角混向天色。不做实时反射。
import * as THREE from 'three';
import { WATER_Y, CANAL_BED_Y, WALL_POLY, WALL, DISTRICTS, VALLEY, valleyToWorld, worldToValley, pointInPoly } from '../coords.js';
import { terrainHeight } from './shore.js';
import { bbox, nearestOnPoly } from './ground.js';

// 水深图覆盖范围（城 + 港口海面 + 两侧沙滩）；范围外按深海处理
const DEPTH_RECT = [-1000, -1500, 600, 400];
const DEPTH_RES = 1.5625; // m / 像素
const DEPTH_MAX = 10;

function bakeDepth() {
  const [x0, z0, x1, z1] = DEPTH_RECT;
  const W = Math.round((x1 - x0) / DEPTH_RES);
  const H = Math.round((z1 - z0) / DEPTH_RES);
  const data = new Uint8Array(W * H * 4);
  const wb = bbox(WALL_POLY, WALL.thickness);
  const isl = Object.values(DISTRICTS).map((d) => ({ poly: d.poly, bb: bbox(d.poly) }));
  const half = WALL.thickness / 2;
  for (let r = 0; r < H; r++) {
    const z = z0 + (r + 0.5) * DEPTH_RES;
    for (let c = 0; c < W; c++) {
      const x = x0 + (c + 0.5) * DEPTH_RES;
      let depth;
      let canal = 0;
      const nearCity = x > wb[0] && x < wb[2] && z > wb[1] && z < wb[3];
      let land = false;
      if (nearCity) {
        for (const d of isl) {
          if (x >= d.bb[0] && x <= d.bb[2] && z >= d.bb[1] && z <= d.bb[3] && pointInPoly(x, z, d.poly)) {
            land = true;
            break;
          }
        }
        if (!land && nearestOnPoly(x, z, WALL_POLY).d < half) land = true; // 城墙墙身（内外皮都起泡沫）
      }
      if (land) depth = 0;
      else if (nearCity && pointInPoly(x, z, WALL_POLY)) {
        depth = WATER_Y - CANAL_BED_Y;
        canal = 1;
      } else depth = Math.max(0, WATER_Y - terrainHeight(x, z));
      const i = (r * W + c) * 4;
      data[i] = Math.round(Math.min(1, depth / DEPTH_MAX) * 255);
      data[i + 1] = canal * 255;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// 水面网格：64 m 规则格子（避免挖洞后的扇形细长三角形）。
// 地面整格高出水面的格子不要（省三角形和过绘制）；压到英雄谷盆地边的格子细分成 2 m 子格，
// 任一角在盆地内就剔除，按行合并成长条（锯齿 ≤ 2.9 m，藏在 B 模块的谷墙 / 谷口挡水坝里）。
const WCELL = 64;
const SUB = 2;
const inValley = (x, z) => {
  const [lx, lz] = worldToValley(x, z);
  return lz > 0 && lz < VALLEY.gateZ && Math.abs(lx) < VALLEY.halfWidth;
};
function waterGrid([ex0, ez0, ex1, ez1]) {
  const pos = [];
  const quad = (x0, z0, x1, z1) => pos.push(x0, z0, x0, z1, x1, z0, x1, z0, x0, z1, x1, z1);
  const cityBox = bbox(WALL_POLY, WALL.thickness);
  const V = [valleyToWorld(VALLEY.halfWidth, 0), valleyToWorld(VALLEY.halfWidth, VALLEY.gateZ), valleyToWorld(-VALLEY.halfWidth, VALLEY.gateZ), valleyToWorld(-VALLEY.halfWidth, 0)];
  const vb = bbox(V, 1);
  for (let z0 = ez0; z0 < ez1; z0 += WCELL) {
    for (let x0 = ex0; x0 < ex1; x0 += WCELL) {
      const x1 = Math.min(ex1, x0 + WCELL);
      const z1 = Math.min(ez1, z0 + WCELL);
      const nearCity = x1 > cityBox[0] && x0 < cityBox[2] && z1 > cityBox[1] && z0 < cityBox[3];
      if (!nearCity) {
        // 整格陆地（8 m 采样的最低点都高出水面 0.4 m）→ 不铺水
        let minH = Infinity;
        for (let z = z0; z <= z1 && minH > WATER_Y + 0.4; z += 8) for (let x = x0; x <= x1; x += 8) minH = Math.min(minH, terrainHeight(x, z));
        if (minH > WATER_Y + 0.4) continue;
      }
      const touchesValley = x1 > vb[0] && x0 < vb[2] && z1 > vb[1] && z0 < vb[3];
      if (!touchesValley) {
        quad(x0, z0, x1, z1);
        continue;
      }
      // 细分：每行 2 m，连续可保留的子格合并成一条
      for (let z = z0; z < z1; z += SUB) {
        let run = null;
        for (let x = x0; x <= x1; x += SUB) {
          const keep = x < x1 && !(inValley(x, z) || inValley(x + SUB, z) || inValley(x, z + SUB) || inValley(x + SUB, z + SUB));
          if (keep && run === null) run = x;
          if (!keep && run !== null) {
            quad(run, z, x, z + SUB);
            run = null;
          }
        }
      }
    }
  }
  // (x, z) 对 → 三维 + 法线 + uv（uv = (x, -z) 与原 ShapeGeometry 约定一致，切线框架不变）
  const n = pos.length / 2;
  const p3 = new Float32Array(n * 3);
  const nm = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    p3[i * 3] = pos[i * 2];
    p3[i * 3 + 1] = WATER_Y;
    p3[i * 3 + 2] = pos[i * 2 + 1];
    nm[i * 3 + 1] = 1;
    uv[i * 2] = pos[i * 2];
    uv[i * 2 + 1] = -pos[i * 2 + 1];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p3, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nm, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

export function buildWater(ctx, ext, noiseTex) {
  const geo = waterGrid(ext);

  const depthTex = bakeDepth();
  const uniforms = {
    tDepth: { value: depthTex },
    tNoise: { value: noiseTex },
    uDRect: { value: new THREE.Vector4(DEPTH_RECT[0], DEPTH_RECT[1], 1 / (DEPTH_RECT[2] - DEPTH_RECT[0]), 1 / (DEPTH_RECT[3] - DEPTH_RECT[1])) },
    uOff1: { value: new THREE.Vector2() },
    uOff2: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uSky: { value: new THREE.Color(0xa9c8e8) },
    uLight: { value: 1 },
    // 统一色板：海与运河同一蓝绿色系，运河只是更浅、略偏绿；浅水（沙滩）色降饱和
    uShallow: { value: new THREE.Color(0x4aa7a6) },
    uCanal: { value: new THREE.Color(0x1f6f84) },
    uSea: { value: new THREE.Color(0x13527f) },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.12,
    metalness: 0.0,
    transparent: true,
    opacity: 1,
    normalMap: ctx.mat.textures.waterN,
    normalScale: new THREE.Vector2(0.34, 0.34),
  });
  mat.name = 'terrainWater';
  mat.userData.noShadow = true;
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWW;
uniform sampler2D tDepth, tNoise;
uniform vec4 uDRect;
uniform vec2 uOff1, uOff2;
uniform float uTime, uLight;
uniform vec3 uSky, uShallow, uCanal, uSea;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
vec2 wP = vWW.xz;
vec2 dUv = (wP - uDRect.xy) * uDRect.zw;
float inR = step(0.0, dUv.x) * step(dUv.x, 1.0) * step(0.0, dUv.y) * step(dUv.y, 1.0);
vec4 dS = texture2D(tDepth, clamp(dUv, 0.0, 1.0));
float wDepth = mix(6.0, dS.r * ${DEPTH_MAX.toFixed(1)}, inR); // 范围外 = 外海（海床 -8 → 水深约 5.5）
float wCanal = dS.g * inR;
float camD = length(vWW - cameraPosition);
// 低频噪声扭曲采样坐标，打散法线贴图的周期感
vec2 wQ = wP + (texture2D(tNoise, wP / 67.0).rg - 0.5) * 15.0;
// 颜色：浅（岸边）→ 运河青绿 → 外海深蓝。运河的"浅带"只贴着驳岸一窄条，外海沙滩上的浅水更宽更透
// 海：浅（沙滩）→ 深蓝；运河：同色系的浅一档，贴驳岸加深（接触暗边）
float shR = mix(2.6, 2.1, wCanal);
vec3 seaCol = mix(uShallow, mix(uCanal, uSea, smoothstep(1.5, 5.0, wDepth)), smoothstep(0.0, 2.6, wDepth));
float wEdge = wCanal * (1.0 - smoothstep(0.4, 2.8, wDepth));
vec3 canalCol = uCanal * (1.0 - 0.5 * wEdge);
vec3 wCol = mix(seaCol, canalCol, wCanal);
wCol *= 0.92 + 0.16 * texture2D(tNoise, wP / 211.0 + 0.4).g;
diffuseColor.rgb = wCol;
diffuseColor.a = mix(mix(0.3, 0.92, wCanal), mix(0.86, 0.88, wCanal), smoothstep(0.0, shR + 0.4, wDepth));
diffuseColor.a = mix(diffuseColor.a, 0.93, (1.0 - wCanal) * smoothstep(2.5, 5.0, wDepth));
// 岸线泡沫：浅水带 × 滚动噪声
float fN = texture2D(normalMap, wQ / 7.0 + uOff1 * 2.3).r * 0.6 + texture2D(normalMap, wQ / 3.1 - uOff2 * 1.7).g * 0.4;
float fBand = 1.0 - smoothstep(0.0, mix(0.8, 2.3, wCanal), wDepth);
float wFoam = smoothstep(0.45, 0.62, fN * 0.7 + fBand * 0.5) * fBand;
wFoam *= (1.0 - smoothstep(250.0, 900.0, camD) * 0.6) * mix(1.0, 0.3, wCanal); // 运河只留一丝泡沫，以暗边为主
`,
      )
      // 注意：onBeforeCompile 拿到的是未展开的模板，只能整条替换 #include 行（tbn 由 normal_fragment_begin 给出）
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `{
// 三层旋转角互不为 90° 的倍数、尺度互质，避免法线贴图的格栅对齐成"棋盘"
vec3 nA = texture2D( normalMap, wQ / 13.0 + uOff1 ).xyz * 2.0 - 1.0;
vec3 nB = texture2D( normalMap, mat2(0.799, 0.602, -0.602, 0.799) * wQ / 8.3 + uOff2 ).xyz * 2.0 - 1.0;
vec3 nC = texture2D( normalMap, mat2(0.485, -0.875, 0.875, 0.485) * wQ / 37.0 + uOff2 * 0.3 ).xyz * 2.0 - 1.0;
// 第四层：由平滑噪声贴图求梯度得到的大尺度起伏（非周期感，远处也保留）
vec2 nUv = wQ / 47.0 + uOff1 * 0.6;
float h0 = texture2D(tNoise, nUv).r;
vec2 gN = vec2(texture2D(tNoise, nUv + vec2(0.02, 0.0)).r - h0, texture2D(tNoise, nUv + vec2(0.0, 0.02)).r - h0) * 3.0; // 差分步长取 5 个纹素，远处 mip 下也平滑
float fineW = 1.0 - 0.85 * smoothstep(25.0, 170.0, camD); // 细涟漪（waterN 两层）只在近处起作用，远处交给大尺度起伏
vec3 mapN = normalize( vec3( ((nA.xy + nB.xy) * 0.7 + nC.xy * 0.35) * fineW + gN * (1.6 - fineW * 0.6), 1.0 ) );
mapN.xy *= (0.45 + 0.9 * texture2D(tNoise, wP / 53.0 + 0.2).r)            // 风区：有的地方平静、有的地方起皱
         * mix(1.0, 0.45, smoothstep(60.0, 700.0, camD));                     // 远处压平，减少闪烁
mapN.xy *= normalScale;
normal = normalize( tbn * mapN );
}`,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `{
  float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.5);
  // 天空反射的明暗：按扰动后法线的反射方向高度取亮 / 暗（贴地平线偏暗、朝天偏亮）→ 波纹在掠射角下有明暗起伏
  vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  vec3 rD = reflect(normalize(vWW - cameraPosition), wN);
  float skyVar = mix(0.62, 1.4, smoothstep(-0.02, 0.32, rD.y));
  outgoingLight = mix(outgoingLight, uSky * skyVar, fres * 0.8);
  outgoingLight = mix(outgoingLight, vec3(0.92, 0.97, 1.0) * uLight, wFoam * 0.85);
  diffuseColor.a = clamp(mix(diffuseColor.a, 1.0, fres * 0.85) + wFoam * 0.6, 0.0, 1.0);
}
#include <opaque_fragment>`,
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain:water';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false;
  ctx.scene.add(mesh);

  const sky = new THREE.Color();
  function update(dt, t, c) {
    uniforms.uTime.value = t;
    // 两层反向滚动（单位：贴图 UV / 秒）
    uniforms.uOff1.value.set(t * 0.011, t * 0.007);
    uniforms.uOff2.value.set(-t * 0.009, t * 0.012);
    const sc = c.scene;
    if (sc.fog?.color) sky.copy(sc.fog.color);
    else if (sc.background?.isColor) sky.copy(sc.background);
    uniforms.uSky.value.copy(sky);
    uniforms.uLight.value = 1 - 0.82 * (c.env?.night || 0);
  }
  return { mesh, update };
}
