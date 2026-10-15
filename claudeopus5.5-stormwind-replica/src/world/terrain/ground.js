// 城外艾尔文森林地形：张量网格高度场（城周 8 m，外圈渐粗到 160 m，无 T 型接缝），
// 城墙多边形内的格子剔除；跨墙格子里深入墙内 > 3 m 的顶点推回墙下（8 m 厚城墙盖住锯齿）。
// 着色：草地（双尺度 + 低频色斑）/ 海边沙滩（按高度）/ 陡坡裸土 / 城门外土路（逐像素解析距离，近看边缘也锐利）。
// 注：高度场带自定义 shader、无碰撞（玩家高度来自 coords），不走 Builder——Builder 会抹掉多余顶点属性并按块切分。
import * as THREE from 'three';
import { WALL_POLY, WATER_Y, pointInPoly } from '../coords.js';
import { shoreSample, ROAD } from './shore.js';

// 点到多边形边界的最近点
function nearestOnPoly(x, z, poly) {
  let best = Infinity;
  let bx = x;
  let bz = z;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j];
    const [cx, cz] = poly[i];
    const dx = cx - ax;
    const dz = cz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bx = px;
      bz = pz;
    }
  }
  return { d: best, x: bx, z: bz };
}

// ---------- 程序化贴图：沙子 / 低频噪声 ----------
function canvasTexture(px, meters, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  draw(c.getContext('2d'), px);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.meters = meters;
  return t;
}

function wrapBlob(g, S, x, y, r, color0, color1) {
  for (const ox of [-S, 0, S]) {
    for (const oy of [-S, 0, S]) {
      const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      grd.addColorStop(0, color0);
      grd.addColorStop(1, color1);
      g.fillStyle = grd;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}

export function makeSandTexture(rng) {
  return canvasTexture(256, 4, (g, S) => {
    g.fillStyle = 'hsl(42,48%,72%)';
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) {
      const l = 64 + rng() * 16;
      wrapBlob(g, S, rng() * S, rng() * S, S * (0.06 + rng() * 0.16), `hsla(40,45%,${l}%,0.35)`, 'hsla(40,45%,70%,0)');
    }
    // 风吹出的细波纹
    g.strokeStyle = 'hsla(36,40%,58%,0.22)';
    g.lineWidth = 2;
    for (let k = 0; k < 14; k++) {
      const y0 = (k / 14) * S;
      g.beginPath();
      for (let x = 0; x <= S; x += 8) g.lineTo(x, y0 + Math.sin((x / S) * Math.PI * 4 + k) * 5);
      g.stroke();
    }
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rng() < 0.5 ? 'hsla(30,30%,40%,0.35)' : 'hsla(45,60%,88%,0.5)';
      g.fillRect(rng() * S, rng() * S, 1.5, 1.5);
    }
  });
}

// R、G 两个独立的平滑噪声通道（无缝）
export function makeNoiseTexture(rng) {
  return canvasTexture(
    256,
    1,
    (g, S) => {
      const layer = (alphaScale) => {
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const h = c.getContext('2d');
        h.fillStyle = '#808080';
        h.fillRect(0, 0, S, S);
        for (let i = 0; i < 70; i++) {
          const v = rng() < 0.5 ? 0 : 255;
          wrapBlob(h, S, rng() * S, rng() * S, S * (0.05 + rng() * 0.2), `rgba(${v},${v},${v},${0.25 * alphaScale})`, `rgba(${v},${v},${v},0)`);
        }
        return h.getImageData(0, 0, S, S).data;
      };
      const a = layer(1);
      const b = layer(1);
      const img = g.createImageData(S, S);
      for (let i = 0; i < S * S; i++) {
        img.data[i * 4] = a[i * 4];
        img.data[i * 4 + 1] = b[i * 4];
        img.data[i * 4 + 2] = 128;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    },
    false,
  );
}

// GLSL 版土路中线（与 shore.js 的 roadOffset 同一公式）
const ROAD_GLSL = /* glsl */ `
float tRoadF(float u) { return smoothstep(30.0, 160.0, u) * (22.0 * sin(u * 0.0045) + 9.0 * sin(u * 0.013)); }
float tRoadDist(vec2 p) {
  vec2 d = p - uRoadO;
  float u = dot(d, uRoadD);
  float v = dot(d, vec2(-uRoadD.y, uRoadD.x));
  float fp = (tRoadF(u + 1.0) - tRoadF(u - 1.0)) * 0.5;
  float dist = abs(v - tRoadF(u)) / sqrt(1.0 + fp * fp);
  return u < -2.0 ? 1e4 : dist;
}
`;

function makeGroundMaterial(ctx, tex) {
  const T = ctx.mat.textures;
  // polygonOffset：地面在深度上让一点，压在 y=0 上的桥头、路面等其他模块构件不会和它打架
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2 });
  mat.name = 'terrainGround';
  const uniforms = {
    tGrass: { value: T.grass },
    tDirt: { value: T.dirt },
    tSand: { value: tex.sand },
    tNoise: { value: tex.noise },
    uRoadO: { value: new THREE.Vector2(...ROAD.origin) },
    uRoadD: { value: new THREE.Vector2(...ROAD.dir) },
    uRoadHalf: { value: 3.9 }, // 可视路面半宽（略宽于 coords.ROAD.halfWidth，含路肩另算）
    uWaterY: { value: WATER_Y },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aShore;\nvarying vec3 vTW;\nvarying vec3 vTN;\nvarying float vShore;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTN = normalize(mat3(modelMatrix) * objectNormal);\nvShore = aShore;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTW;
varying vec3 vTN;
varying float vShore;
uniform sampler2D tGrass, tDirt, tSand, tNoise;
uniform vec2 uRoadO, uRoadD;
uniform float uRoadHalf, uWaterY;
${ROAD_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
{
  vec2 p = vTW.xz;
  vec2 nz = texture2D(tNoise, p / 173.0).rg;   // 中频色斑
  vec2 nz2 = texture2D(tNoise, p / 41.0 + 0.31).rg;
  vec2 nz3 = texture2D(tNoise, p / 523.0 + 0.7).rg; // 低频：草甸 / 林地分区
  // 草：贴图只取明度细节，颜色来自艾尔文森林的暖绿调色板（sRGB → 线性），按多尺度噪声混合
  // 草：三套不同缩放 + 旋转的采样，用世界坐标低频噪声加权混合 → 打散平铺；细节只在近处起作用，远处交给宏观色变
  float camD = length(vTW - cameraPosition);
  float nearW = 1.0 - smoothstep(35.0, 140.0, camD);               // 近景细节权重
  vec2 pA = p / 6.0;
  vec2 pB = mat2(0.809, 0.588, -0.588, 0.809) * p / 9.7 + 0.37;      // 旋转 36°
  vec2 pC = mat2(0.276, -0.961, 0.961, 0.276) * p / 14.3 + 0.71;     // 旋转 -74°
  vec3 g1 = texture2D(tGrass, pA).rgb;
  vec3 g2 = texture2D(tGrass, pB).rgb;
  vec3 g3 = texture2D(tGrass, pC).rgb;
  vec2 wMix = texture2D(tNoise, p / 67.0 + 0.19).rg;
  vec3 gm = mix(mix(g1, g2, smoothstep(0.35, 0.65, wMix.r)), g3, smoothstep(0.4, 0.7, wMix.g) * 0.7);
  float gl = dot(gm, vec3(0.3, 0.59, 0.11));
  float detail = mix(1.0, clamp(pow(gl / 0.17, 1.5), 0.55, 1.5), nearW * 0.85 + 0.15);
  float nzS = texture2D(tNoise, mat2(0.6, 0.8, -0.8, 0.6) * p / 11.0 + 0.13).r; // 小尺度深浅草丛
  detail *= mix(1.0, 0.82 + 0.36 * smoothstep(0.3, 0.7, nzS), 0.4 + 0.6 * nearW);
  vec3 cWarm = pow(vec3(0.525, 0.612, 0.30), vec3(2.2));   // 向阳暖绿
  vec3 cMid = pow(vec3(0.38, 0.5, 0.22), vec3(2.2));       // 中绿
  vec3 cDeep = pow(vec3(0.26, 0.38, 0.17), vec3(2.2));     // 林下深绿
  vec3 cMeadow = pow(vec3(0.62, 0.6, 0.33), vec3(2.2));    // 干草甸
  vec3 grass = mix(cMid, cWarm, smoothstep(0.36, 0.64, nz.r));
  grass = mix(grass, cMeadow, smoothstep(0.56, 0.74, nz3.r) * 0.75);
  grass = mix(grass, cDeep, smoothstep(0.52, 0.7, nz3.g) * 0.85);
  grass = mix(grass, cDeep, smoothstep(0.6, 0.75, nz.g) * 0.5);
  grass *= detail * (0.86 + 0.28 * nz2.g);
  grass = mix(vec3(dot(grass, vec3(0.3, 0.59, 0.11))), grass, 0.85); // 再降一点饱和
  vec3 dirt = texture2D(tDirt, p / 5.0).rgb;
  vec3 sand = texture2D(tSand, p / 4.0).rgb;
  vec3 rock = mix(dirt, vec3(0.42, 0.4, 0.37), 0.55) * (0.85 + 0.3 * nz2.r);
  // 沙滩：海岸带按离水面高度；森林里的水塘只给一圈窄沙边
  float h = vTW.y - uWaterY;
  float jitter = (nz2.r - 0.5) * 0.9;
  float sandBeach = 1.0 - smoothstep(1.25, 2.05, h + jitter);
  float sandPond = 1.0 - smoothstep(0.15, 0.55, h + jitter * 0.4);
  float sandW = max(sandBeach * smoothstep(0.02, 0.25, vShore), sandPond);
  sand *= mix(0.68, 1.0, smoothstep(-0.2, 0.35, h)); // 湿沙
  // 陡坡裸岩
  float rockW = smoothstep(0.9, 0.74, vTN.y);
  // 土路（约 7.8 m 宽）：浅黄土路面 + 两道车辙 + 路中残草 + 路肩踩秃的草边
  float rd = tRoadDist(p);
  float edge = uRoadHalf + (nz2.g - 0.5) * 1.4 + (g1.g - 0.2) * 1.5;
  float roadW = 1.0 - smoothstep(edge - 0.6, edge + 0.4, rd);
  vec3 road = dirt * vec3(1.22, 1.1, 0.9);
  road *= 1.0 - 0.28 * (1.0 - smoothstep(0.25, 0.6, abs(rd - 1.5)));   // 车辙
  road = mix(road, grass, (1.0 - smoothstep(0.25, 0.55, rd)) * 0.3);   // 路中残草
  float shoulder = (1.0 - smoothstep(edge + 0.3, edge + 2.2, rd)) * (1.0 - roadW);
  vec3 col = grass;
  col = mix(col, mix(grass, dirt, 0.4) * 0.92, shoulder * 0.8);        // 路肩
  col = mix(col, rock, rockW * 0.9);
  col = mix(col, sand, sandW);
  col = mix(col, road, roadW * (1.0 - sandW));
  diffuseColor.rgb *= col;
}
`,
      );
  };
  return mat;
}

// ---------- 分块 LOD：128 m 一块，每块按"插值误差 ≤ 容差"挑 8 / 16 / 32 / 64 m 网格 ----------
// 城区块强制 8 m；海岸可走的沙滩块容差 0.28 m（玩家高度 = coords.terrainHeight，必须和可视地形对得上）；
// 其余容差随离城距离放宽。相邻块细侧的边顶点高度改成粗侧边上的线性插值 → 无裂缝。
const BS = 128;
const LEVELS = [8, 16, 32, 64];
const CITY = [-300, -380, 400, 240]; // 城市包围盒（同 coords.CITY_BOUNDS）

function rectDist(x, z, [x0, z0, x1, z1]) {
  return Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
}

function chooseLevels(X0, Z0, NX, NZ, H, cityBox) {
  const lv = new Int32Array(NX * NZ);
  const n8 = BS / 8 + 1;
  const hs = new Float32Array(n8 * n8);
  for (let bk = 0; bk < NZ; bk++) {
    for (let bi = 0; bi < NX; bi++) {
      const x0 = X0 + bi * BS;
      const z0 = Z0 + bk * BS;
      if (x0 < cityBox[2] && x0 + BS > cityBox[0] && z0 < cityBox[3] && z0 + BS > cityBox[1]) {
        lv[bk * NX + bi] = 8;
        continue;
      }
      let coastal = false;
      for (let k = 0; k < n8; k++) {
        for (let i = 0; i < n8; i++) {
          const sm = shoreSample(x0 + i * 8, z0 + k * 8);
          hs[k * n8 + i] = sm.h;
          if (sm.w > 0 && sm.h > WATER_Y - 1.5) coastal = true;
        }
      }
      const d = rectDist(x0 + BS / 2, z0 + BS / 2, CITY);
      const far = d < 400 ? 0.22 : 0.22 + (d - 400) * 0.0016;
      const tol = coastal ? Math.max(0.12, (d - 600) * 0.002) : far; // 误差只在 8 m 采样点上量，近城沙滩留足余量
      let pick = 8;
      for (const L of LEVELS.slice(1)) {
        const st = L / 8;
        let err = 0;
        for (let k = 0; k < n8 && err <= tol; k++) {
          for (let i = 0; i < n8; i++) {
            const ci = Math.min(Math.floor(i / st), BS / L - 1);
            const ck = Math.min(Math.floor(k / st), BS / L - 1);
            const fx = (i - ci * st) / st;
            const fz = (k - ck * st) / st;
            const a = hs[ck * st * n8 + ci * st];
            const b = hs[ck * st * n8 + (ci + 1) * st];
            const c = hs[(ck + 1) * st * n8 + ci * st];
            const dd = hs[(ck + 1) * st * n8 + (ci + 1) * st];
            const v = fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : dd + (c - dd) * (1 - fx) + (b - dd) * (1 - fz);
            err = Math.max(err, Math.abs(v - hs[k * n8 + i]));
          }
        }
        if (err > tol) break;
        pick = L;
      }
      lv[bk * NX + bi] = pick;
    }
  }
  return lv;
}

// 城外地面材质 + 自建贴图（岛上后院 / 雄狮安息地的草地也共用这个材质，色调与城外一致）
export function makeGroundKit(ctx) {
  const rng = ctx.rng('terrain:tex');
  const tex = { sand: makeSandTexture(rng), noise: makeNoiseTexture(rng) };
  const aniso = ctx.renderer?.capabilities?.getMaxAnisotropy?.() || 8;
  for (const t of Object.values(tex)) t.anisotropy = aniso;
  return { tex, mat: makeGroundMaterial(ctx, tex) };
}

export function buildGround(ctx, ext, kit = makeGroundKit(ctx)) {
  const { tex } = kit;
  // 块原点：x 对齐 128，z 对齐 -266（海岸 / 北墙外皮落在网格线上）
  const X0 = Math.floor(ext[0] / BS) * BS;
  const Z0 = Math.floor((ext[1] + 266) / BS) * BS - 266;
  const NX = Math.ceil((ext[2] - X0) / BS);
  const NZ = Math.ceil((ext[3] - Z0) / BS);
  const H = (x, z) => shoreSample(x, z).h;
  const cityBox = bbox(WALL_POLY, 12);
  const lv = chooseLevels(X0, Z0, NX, NZ, H, cityBox);
  const levelAt = (bi, bk) => (bi < 0 || bk < 0 || bi >= NX || bk >= NZ ? 0 : lv[bk * NX + bi]);

  const pos = [];
  const nor = [];
  const shoreW = [];
  const idx = [];
  const [wx0, wz0, wx1, wz1] = bbox(WALL_POLY, 6);
  const normalAt = (x, z) => {
    const e = 2;
    const nx = H(x - e, z) - H(x + e, z);
    const nz = H(x, z - e) - H(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    return [nx / l, (2 * e) / l, nz / l];
  };
  for (let bk = 0; bk < NZ; bk++) {
    for (let bi = 0; bi < NX; bi++) {
      const L = levelAt(bi, bk);
      const n = BS / L;
      const x0 = X0 + bi * BS;
      const z0 = Z0 + bk * BS;
      const base = pos.length / 3;
      const inWall = new Uint8Array((n + 1) * (n + 1));
      // 四条边的邻块粒度（更粗才需要贴合）
      const nW = levelAt(bi - 1, bk);
      const nE = levelAt(bi + 1, bk);
      const nN = levelAt(bi, bk - 1);
      const nS = levelAt(bi, bk + 1);
      for (let k = 0; k <= n; k++) {
        for (let i = 0; i <= n; i++) {
          let x = x0 + i * L;
          let z = z0 + k * L;
          // 边贴合：在更粗邻块的边上，高度取粗网格两端点的线性插值
          let snapped = null;
          const snapAlong = (t, Lc, h0f, h1f) => {
            const a = Math.floor(t / Lc) * Lc;
            const f = (t - a) / Lc;
            return f < 1e-6 ? null : h0f(a) * (1 - f) + h1f(a + Lc) * f;
          };
          if (i === 0 && nW > L) snapped = snapAlong(k * L, nW, (t) => H(x0, z0 + t), (t) => H(x0, z0 + t));
          else if (i === n && nE > L) snapped = snapAlong(k * L, nE, (t) => H(x0 + BS, z0 + t), (t) => H(x0 + BS, z0 + t));
          if (snapped === null && k === 0 && nN > L) snapped = snapAlong(i * L, nN, (t) => H(x0 + t, z0), (t) => H(x0 + t, z0));
          else if (snapped === null && k === n && nS > L) snapped = snapAlong(i * L, nS, (t) => H(x0 + t, z0 + BS), (t) => H(x0 + t, z0 + BS));
          if (L === 8 && x > wx0 && x < wx1 && z > wz0 && z < wz1 && pointInPoly(x, z, WALL_POLY)) {
            inWall[k * (n + 1) + i] = 1;
            // 深入墙内 > 3 m 的顶点推回墙下（8 m 厚城墙盖住锯齿）
            const q = nearestOnPoly(x, z, WALL_POLY);
            if (q.d > 3) {
              x = q.x + ((x - q.x) / q.d) * 3;
              z = q.z + ((z - q.z) / q.d) * 3;
            }
          }
          const sm = shoreSample(x, z);
          pos.push(x, snapped ?? sm.h, z);
          nor.push(...normalAt(x, z));
          shoreW.push(sm.w);
        }
      }
      for (let k = 0; k < n; k++) {
        for (let i = 0; i < n; i++) {
          const a = k * (n + 1) + i;
          const b = a + 1;
          const c = a + n + 1;
          const d = c + 1;
          if (inWall[a] && inWall[b] && inWall[c] && inWall[d]) continue; // 整格在墙内 → 剔除
          idx.push(base + a, base + c, base + b, base + b, base + c, base + d);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aShore', new THREE.Float32BufferAttribute(shoreW, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, kit.mat);
  mesh.name = 'terrain:elwynn';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.ground = true;
  ctx.scene.add(mesh);
  const hist = {};
  for (const v of lv) hist[v] = (hist[v] || 0) + 1;
  return { mesh, tris: idx.length / 3, tex, levels: hist };
}

export function bbox(poly, pad = 0) {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of poly) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  return [x0 - pad, z0 - pad, x1 + pad, z1 + pad];
}
export { nearestOnPoly };
