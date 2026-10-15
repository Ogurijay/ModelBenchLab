// 179 盏路灯：铁灯柱 + 灯笼（InstancedMesh）、地面暖色光斑（实例化加色贴片）、灯笼光晕（Points）。
// 光斑让远处没分到点光源的路灯也有"照亮地面"的感觉；已分到点光源的那盏光斑减弱，避免叠加过曝。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const LAMP_HEAD_Y = 3.7; // 灯笼中心离地高度

function clean(g) {
  const o = g.index ? g.toNonIndexed() : g;
  for (const n of Object.keys(o.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') o.deleteAttribute(n);
  return o;
}

// 灯柱（铁）：底座、柱身、装饰环、托架、灯笼顶盖、尖顶
function postGeometry() {
  // 低面数（约 130 三角形 × 179 盏 × 主 / 阴影 / 法线 3 个 pass）：圆柱一律 6 边、不封口
  const parts = [];
  const box = (w, h, d, y) => parts.push(new THREE.BoxGeometry(w, h, d).translate(0, y + h / 2, 0));
  const cyl = (r0, r1, h, y, seg = 6) => parts.push(new THREE.CylinderGeometry(r1, r0, h, seg, 1, true).translate(0, y + h / 2, 0));
  box(0.56, 0.18, 0.56, -0.05); // 底座（略埋入地面）
  cyl(0.2, 0.13, 0.35, 0.13);
  cyl(0.075, 0.06, 3.0, 0.45); // 柱身
  cyl(0.12, 0.12, 0.1, 1.2); // 装饰环
  box(0.46, 0.06, 0.46, 3.38); // 灯笼托盘
  // 灯笼四根竖框
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]) parts.push(new THREE.BoxGeometry(0.04, 0.6, 0.04).translate(x, 3.74, z));
  // 顶盖：四棱锥
  parts.push(new THREE.ConeGeometry(0.42, 0.34, 4, 1).rotateY(Math.PI / 4).translate(0, 4.21, 0));
  parts.push(new THREE.ConeGeometry(0.03, 0.25, 4, 1, true).translate(0, 4.5, 0)); // 尖顶
  return mergeGeometries(parts.map(clean));
}

// 灯笼玻璃（lampGlow 发光）
function lanternGeometry() {
  return new THREE.BoxGeometry(0.36, 0.56, 0.36).translate(0, LAMP_HEAD_Y, 0);
}

function softTexture(falloff) {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  // 逐像素画指数衰减（canvas 径向渐变只有线性分段，边缘会出现一圈硬边）
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = Math.hypot((x + 0.5) / S - 0.5, (y + 0.5) / S - 0.5) * 2;
      const a = r >= 1 ? 0 : Math.pow(1 - r, falloff) * (1 - r * r);
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildLamps(ctx, group) {
  const { LAMPS } = ctx.coords;
  const n = LAMPS.length;
  const rng = ctx.rng('atmo:lamps');
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // 灯杆：自有铁材质（金属度降低，否则没有环境反射时是纯黑）+ 夜里灯头附近的暖色自发光渐变，模拟灯笼照亮自己的支架
  const uGlow = { value: 0 };
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.35, roughness: 0.6, name: 'atmo-lamp-iron' });
  postMat.onBeforeCompile = (sh) => {
    sh.uniforms.uLampGlow = uGlow;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying float vLampY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vLampY = position.y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vLampY;
uniform float uLampGlow;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.0, 0.55, 0.22) * uLampGlow * (0.03 + 0.3 * pow(smoothstep(1.2, 3.6, vLampY), 2.0));`);
  };
  // 灯罩：自有发光材质，强度比共享 lampGlow 低；竖向暖色渐变（下部火芯亮黄、上部橙）
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.6, name: 'atmo-lamp-glass' });
  const uGlass = { value: 0 };
  glassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uGlass = uGlass;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying float vGlassY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vGlassY = position.y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vGlassY;
uniform float uGlass;`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float gt = smoothstep(${(LAMP_HEAD_Y - 0.28).toFixed(2)}, ${(LAMP_HEAD_Y + 0.28).toFixed(2)}, vGlassY);
        totalEmissiveRadiance = mix(vec3(1.0, 0.78, 0.42), vec3(0.95, 0.42, 0.12), gt) * uGlass * (1.15 - 0.55 * gt);`,
      );
  };
  const posts = new THREE.InstancedMesh(postGeometry(), postMat, n);
  posts.name = 'atmo-lamp-posts';
  posts.castShadow = true;
  posts.receiveShadow = true;
  posts.userData.grounded = true;
  const lanterns = new THREE.InstancedMesh(lanternGeometry(), glassMat, n);
  lanterns.name = 'atmo-lamp-lanterns';

  // 地面光斑：14 m 方片，加色混合，不写深度；颜色 × 透明度随 night
  const splatMat = new THREE.MeshBasicMaterial({
    map: softTexture(1.6),
    color: 0xffb060,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
  splatMat.userData.noShadow = true;
  const splatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const splats = new THREE.InstancedMesh(splatGeo, splatMat, n);
  splats.name = 'atmo-lamp-splats';
  splats.renderOrder = 2;

  // 灯笼光晕：远景夜景里一眼能看出灯在哪
  const haloPos = new Float32Array(n * 3);

  const entries = [];
  const white = new THREE.Color(1, 1, 1);
  LAMPS.forEach((L, i) => {
    const y = L.y ?? 0;
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    m.compose(p.set(L.x, y, L.z), q, s);
    posts.setMatrixAt(i, m);
    lanterns.setMatrixAt(i, m);
    const r = 15;
    m.compose(p.set(L.x, y + 0.04, L.z), q, new THREE.Vector3(r, 1, r));
    splats.setMatrixAt(i, m);
    splats.setColorAt(i, white);
    haloPos.set([L.x, y + LAMP_HEAD_Y, L.z], i * 3);
    entries.push(
      ctx.lights.add({ x: L.x, y: y + LAMP_HEAD_Y - 0.1, z: L.z, kind: 'lamp', nightOnly: true, intensity: 1, color: 0xffc070, range: 14, flicker: false, _lamp: i }),
    );
  });
  for (const im of [posts, lanterns, splats]) {
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
  }
  splats.instanceColor.needsUpdate = true;

  const haloGeo = new THREE.BufferGeometry();
  haloGeo.setAttribute('position', new THREE.BufferAttribute(haloPos, 3));
  const haloMat = new THREE.PointsMaterial({
    map: softTexture(3.2), // 光晕：更陡的指数衰减，只留一团柔光核
    color: 0xffc070,
    size: 3.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  const halos = new THREE.Points(haloGeo, haloMat);
  halos.name = 'atmo-lamp-halos';
  halos.renderOrder = 3;
  group.add(posts, lanterns, splats, halos);

  const dim = new THREE.Color(0.3, 0.3, 0.3);
  let colorTimer = 0;
  function update(dt) {
    const night = ctx.env.night;
    const k = THREE.MathUtils.smoothstep(night, 0.25, 0.75);
    uGlow.value = 0.9 * k;
    uGlass.value = 0.25 + 1.55 * k; // 白天暗玻璃 → 夜里约 1.8（原共享材质 3.5 会过曝成白方块）
    splatMat.opacity = 0.32 * k * ctx.settings.lampSplat;
    splats.visible = splatMat.opacity > 0.002;
    haloMat.opacity = 0.55 * k;
    halos.visible = haloMat.opacity > 0.002;
    // 已分到点光源的路灯：光斑减弱（真实光照接管）
    colorTimer -= dt;
    if (splats.visible && (colorTimer <= 0 || dt === 0)) {
      colorTimer = 0.2;
      for (const e of entries) splats.setColorAt(e._lamp, e._slot != null ? dim : white);
      splats.instanceColor.needsUpdate = true;
    }
  }
  return { update, entries };
}
