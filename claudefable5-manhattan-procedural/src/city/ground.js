// 岛屿地面:轮廓 Shape + 2048×4096 画布程序化路网贴图(街块/大道/百老汇/斑马线),
// 周围哈德逊河 / 东河水面(程序化法线贴图)。零外部资产。
import * as THREE from 'three';
import { CITY, islandHalfWidth, broadwayX } from './plan.js';
import { applySnowPatch } from '../core/shaderpatch.js';
import { makeNoise2D } from '../core/noise.js';

const W = 2048, H = 4096;
const X2U = (x) => ((x + 260) / 520) * W;
const Z2V = (z) => ((z + 620) / 1240) * H;

function paintCityCanvas(plan, rng) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // 人行道底色 + 细噪点
  ctx.fillStyle = '#a09b90';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(rng.range(0, W), rng.range(0, H), 2.5, 2.5);
  }

  // 公园与炮台绿地
  ctx.fillStyle = '#4e6a3a';
  const p = CITY.park;
  ctx.fillRect(X2U(p.x0 - 6), Z2V(p.z0 - 6), X2U(p.x1 + 6) - X2U(p.x0 - 6), Z2V(p.z1 + 6) - Z2V(p.z0 - 6));
  ctx.fillRect(X2U(-250), Z2V(CITY.batteryZ), W - 2 * X2U(-250), Z2V(640) - Z2V(CITY.batteryZ));

  // 街块混凝土(每块微差)
  for (const b of plan.blocks) {
    const g = 158 + Math.floor(rng.range(-10, 12));
    ctx.fillStyle = `rgb(${g},${g - 3},${g - 8})`;
    ctx.fillRect(X2U(b.x0) + 3, Z2V(b.z0) + 3, X2U(b.x1) - X2U(b.x0) - 6, Z2V(b.z1) - Z2V(b.z0) - 6);
  }

  // 大道(南北)
  const pxPerMX = W / 520, pxPerMZ = H / 1240;
  for (const ax of CITY.aveXs) {
    ctx.fillStyle = '#2a2b2f';
    ctx.fillRect(X2U(ax - CITY.aveW / 2), 0, CITY.aveW * pxPerMX, H);
  }
  // 街道(东西)
  for (const sz of plan.streets) {
    ctx.fillStyle = '#2d2e32';
    ctx.fillRect(0, Z2V(sz - CITY.streetW / 2), W, CITY.streetW * pxPerMZ);
  }

  // 百老汇斜切带
  ctx.strokeStyle = '#28292d';
  ctx.lineWidth = CITY.broadway.halfW * 2 * pxPerMX;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(X2U(broadwayX(-560)), Z2V(-560));
  ctx.lineTo(X2U(broadwayX(460)), Z2V(460));
  ctx.stroke();

  // 时代广场行人广场(暗红铺装)
  ctx.strokeStyle = 'rgba(96,38,50,0.9)';
  ctx.lineWidth = 16 * pxPerMX;
  ctx.beginPath();
  ctx.moveTo(X2U(broadwayX(-408)), Z2V(-408));
  ctx.lineTo(X2U(broadwayX(-318)), Z2V(-318));
  ctx.stroke();

  // 大道车道线:双黄中线 + 白色车道虚线
  for (const ax of CITY.aveXs) {
    ctx.strokeStyle = '#b7ac5e';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(X2U(ax) - 2, 0); ctx.lineTo(X2U(ax) - 2, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X2U(ax) + 2, 0); ctx.lineTo(X2U(ax) + 2, H); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,222,228,0.7)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([14, 22]);
    for (const off of [-5, 5]) {
      ctx.beginPath();
      ctx.moveTo(X2U(ax + off), 0); ctx.lineTo(X2U(ax + off), H);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  // 路口斑马线
  ctx.fillStyle = 'rgba(228,230,235,0.75)';
  for (const n of plan.nodes) {
    const cx = X2U(n.x), cz = Z2V(n.z);
    const aw = (CITY.aveW / 2 + 2.2) * pxPerMX, sw = (CITY.streetW / 2 + 2.2) * pxPerMZ;
    const bandA = 2.4 * pxPerMZ, bandB = 2.4 * pxPerMX;
    ctx.fillRect(cx - aw, cz - sw - bandA, aw * 2, bandA);      // 北侧
    ctx.fillRect(cx - aw, cz + sw, aw * 2, bandA);              // 南侧
    ctx.fillRect(cx - aw - bandB, cz - sw, bandB, sw * 2);      // 西侧
    ctx.fillRect(cx + aw, cz - sw, bandB, sw * 2);              // 东侧
  }

  return cv;
}

function makeIslandShape() {
  const pts = [];
  const step = 12;
  for (let z = CITY.island.zN + 1; z <= CITY.island.zS - 1; z += step) pts.push([islandHalfWidth(z), z]);
  pts.push([islandHalfWidth(CITY.island.zS - 1), CITY.island.zS - 1]);
  const shape = new THREE.Shape();
  // shape 坐标 (x, -z):绕 X 轴 -90° 后落到世界 XZ 平面
  shape.moveTo(pts[0][0], -pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], -pts[i][1]);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0], -pts[i][1]);
  shape.closePath();
  return shape;
}

function makeWaterNormalTexture(seed) {
  const S = 512;
  const n1 = makeNoise2D(seed), n2 = makeNoise2D(seed + 77), n3 = makeNoise2D(seed + 191);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // 周期采样保证四方连续
      const u = x / S, v = y / S;
      const a = Math.sin(u * Math.PI * 2), b = Math.cos(u * Math.PI * 2);
      const c = Math.sin(v * Math.PI * 2), d = Math.cos(v * Math.PI * 2);
      h[y * S + x] = 0.55 * n1(4 + a * 1.4, 4 + b * 1.4 + c * 1.1)
        + 0.3 * n2(8 + c * 2.6, 8 + d * 2.6 + a * 1.7)
        + 0.15 * n3(16 + a * 5.2, 16 + d * 5.2 + c * 3.3);
    }
  }
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  const at = (x, y) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
      const i = (y * S + x) * 4;
      img.data[i] = Math.max(0, Math.min(255, 128 - dx * 255));
      img.data[i + 1] = Math.max(0, Math.min(255, 128 - dy * 255));
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function buildGround(plan, rng, disposables) {
  const group = new THREE.Group();

  const canvas = paintCityCanvas(plan, rng.fork('canvas'));
  const mapTex = new THREE.CanvasTexture(canvas);
  mapTex.colorSpace = THREE.SRGBColorSpace;
  mapTex.anisotropy = 8;

  const shape = makeIslandShape();

  // 顶面(路网贴图)
  const topGeo = new THREE.ShapeGeometry(shape, 2);
  {
    const pos = topGeo.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const sx = pos.getX(i), sy = pos.getY(i); // worldZ = -sy
      uv[i * 2] = (sx + 260) / 520;
      uv[i * 2 + 1] = (620 - (-sy)) / 1240;
    }
    topGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  const groundMat = new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.93, metalness: 0.0 });
  applySnowPatch(groundMat);
  const top = new THREE.Mesh(topGeo, groundMat);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.42;
  top.receiveShadow = true;
  group.add(top);

  // 岛体侧壁(海堤)
  const skirtGeo = new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: false });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x6d675e, roughness: 0.95 });
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -8.75; // 顶盖略低于路面板,避免共面闪烁
  group.add(skirt);

  // 水面
  const waterTex = makeWaterNormalTexture(plan.seed);
  waterTex.repeat.set(13, 13);
  waterTex.anisotropy = 8;
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x24506a, roughness: 0.12, metalness: 0.42,
    normalMap: waterTex, normalScale: new THREE.Vector2(0.4, 0.4),
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.4;
  water.receiveShadow = true;
  group.add(water);

  disposables.push(topGeo, skirtGeo, water.geometry, groundMat, skirtMat, waterMat, mapTex, waterTex);

  return {
    group,
    groundMat,
    waterMat,
    // 天气驱动:湿度让路面变暗变亮泽,风让水面波纹加剧
    update(dt, wind, wetness) {
      waterTex.offset.x += dt * 0.012 * (1 + wind * 0.06);
      waterTex.offset.y += dt * 0.009;
      const ns = 0.35 + wind * 0.045;
      waterMat.normalScale.set(ns, ns);
      groundMat.roughness = 0.93 - wetness * 0.62;
      groundMat.color.setScalar(1 - wetness * 0.3);
    },
  };
}
