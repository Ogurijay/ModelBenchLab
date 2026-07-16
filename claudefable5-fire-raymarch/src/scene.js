// 篝火场景实体:荒野夜晚。所有几何、材质、纹理均程序化生成,零外部资产。
// 被火光照亮的三类以上材质:粗糙岩石(石圈)/ 木柴(树皮+炭红端头)/ 金属(铁三脚架+铜壶)/ 沙土地面。

import * as THREE from 'three';
import { mulberry32, noise3 } from './noise.js';

const rand = mulberry32(20260715); // 定种:每次加载布景一致,便于盲评对比

function vary(base, amt) {
  return base + (rand() * 2 - 1) * amt;
}

// ---------------------------------------------------------------- 地面
// 圆盘 + 噪声起伏(中心整平放柴),顶点色:沙土→暗,中心一圈烧过的炭黑
function buildGround() {
  const geo = new THREE.CircleGeometry(11, 110, 0, Math.PI * 2);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color('#7c6a52');
  const dark = new THREE.Color('#2e2820');
  const char = new THREE.Color('#141009');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    const lift = (noise3(x * 0.55 + 9, 0, z * 0.55 + 9) - 0.5) * 0.26 * THREE.MathUtils.smoothstep(r, 1.15, 3.2);
    pos.setY(i, lift);
    const shade = 0.72 + 0.28 * noise3(x * 2.1, 5, z * 2.1);
    c.lerpColors(sand, dark, THREE.MathUtils.smoothstep(r, 2.2, 9.5)).multiplyScalar(shade);
    const burn = 1 - THREE.MathUtils.smoothstep(r, 0.55, 1.25);
    c.lerp(char, burn);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- 石圈
// 变形二十面体 + 顶点噪声 + 各向异性压扁,flat shading 出岩石节理
function buildStones() {
  const group = new THREE.Group();
  const base = new THREE.Color('#8a8177');
  const COUNT = 10;
  for (let i = 0; i < COUNT; i++) {
    const a = (i / COUNT) * Math.PI * 2 + vary(0, 0.14);
    const rr = vary(0.94, 0.08);
    const size = vary(0.155, 0.05);
    const geo = new THREE.IcosahedronGeometry(size, 1);
    const pos = geo.attributes.position;
    const s1 = rand() * 100, s2 = rand() * 100;
    for (let j = 0; j < pos.count; j++) {
      const x = pos.getX(j), y = pos.getY(j), z = pos.getZ(j);
      const n = noise3(x * 6 + s1, y * 6 + s2, z * 6);
      const k = 1 + (n - 0.5) * 0.55;
      pos.setXYZ(j, x * k * vary(1.25, 0.1), y * k * 0.72, z * k * vary(1.15, 0.1));
    }
    geo.computeVertexNormals();
    const c = base.clone().offsetHSL(vary(0, 0.02), vary(0, 0.04), vary(-0.02, 0.06));
    const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(Math.cos(a) * rr, size * 0.52, Math.sin(a) * rr);
    mesh.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI * 0.3);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

// ---------------------------------------------------------------- 程序化纹理
// 树皮:竖向褐色条纹 + 噪声斑驳;同源生成 roughness 变化
function barkTextures() {
  const W = 128, H = 128;
  const color = new Uint8Array(W * H * 4);
  const roughShades = new Uint8Array(W * H * 4);
  const c1 = [86, 62, 40], c2 = [44, 30, 20];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const stripe = noise3(x * 0.9, y * 0.06, 3.7);          // 竖纹(沿周向变化慢)
      const fleck = noise3(x * 0.22, y * 0.22, 8.1);           // 斑驳
      const t = THREE.MathUtils.clamp(stripe * 0.75 + fleck * 0.45 - 0.18, 0, 1);
      for (let k = 0; k < 3; k++) color[i + k] = c1[k] * t + c2[k] * (1 - t);
      color[i + 3] = 255;
      const rg = 200 + 45 * fleck;
      roughShades[i] = roughShades[i + 1] = roughShades[i + 2] = rg;
      roughShades[i + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(color, W, H);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  const rough = new THREE.DataTexture(roughShades, W, H);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  rough.needsUpdate = true;
  return { map, rough };
}

// 炭红渐变(1D):柴的内端(UV v→1)白热→橙红→熄灭
function emberGradient() {
  const N = 128;
  const data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1); // 0=外端 1=内端(火心)
    const g = Math.max(0, (t - 0.55) / 0.45); // 只有靠火心的 45% 发光
    const e = Math.pow(g, 1.8);
    data[i * 4] = 255 * Math.min(1, e * 1.6);
    data[i * 4 + 1] = 255 * Math.min(1, e * e * 0.75);
    data[i * 4 + 2] = 255 * Math.min(1, e * e * e * 0.28);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, N, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- 柴堆
// 6 根锥形架起(经典篝火),内端探入火心,emissiveMap 沿轴向做炭红;外加 2 根备柴
function buildLogs() {
  const group = new THREE.Group();
  const { map, rough } = barkTextures();
  const ember = emberGradient();
  const logMat = new THREE.MeshStandardMaterial({
    map, roughnessMap: rough, roughness: 1, metalness: 0,
    emissiveMap: ember, emissive: new THREE.Color('#ff6a18'), emissiveIntensity: 1.2,
  });
  const COUNT = 6, LEN = 0.92;
  for (let i = 0; i < COUNT; i++) {
    const geo = new THREE.CylinderGeometry(vary(0.040, 0.006), vary(0.056, 0.008), LEN, 9, 1);
    // CylinderGeometry 的 UV v 沿高度:+Y 端(v=1)为内端,对准 emberGradient 的发光端
    const mesh = new THREE.Mesh(geo, logMat);
    const a = (i / COUNT) * Math.PI * 2 + vary(0, 0.2);
    const footR = vary(0.44, 0.05);
    const tilt = vary(1.08, 0.07); // 与竖直的夹角(弧度),约 62°:架得更矮,让火舌探出
    // 底端落在石圈内缘,顶端(内端)聚拢于火心上方
    const dir = new THREE.Vector3(-Math.cos(a) * Math.sin(tilt), Math.cos(tilt), -Math.sin(a) * Math.sin(tilt)).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const foot = new THREE.Vector3(Math.cos(a) * footR, 0.045, Math.sin(a) * footR);
    mesh.position.copy(foot).addScaledVector(dir, LEN / 2);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  // 备柴:横卧在石圈外,展示树皮材质全貌(不发光端)
  const spareMat = new THREE.MeshStandardMaterial({ map, roughnessMap: rough, roughness: 1, metalness: 0 });
  for (let i = 0; i < 2; i++) {
    const geo = new THREE.CylinderGeometry(0.05, 0.058, 0.9, 9, 1);
    const mesh = new THREE.Mesh(geo, spareMat);
    mesh.rotation.z = Math.PI / 2;
    mesh.rotation.y = vary(1.9, 0.5);
    mesh.position.set(vary(-1.5, 0.12), 0.09 + i * 0.1, vary(1.15, 0.25));
    if (i === 1) mesh.rotation.x = 0.18;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return { group, logMat };
}

// ---------------------------------------------------------------- 三脚架 + 铜壶
// 铁架吊铜壶:金属反射火光的波动亮斑;壶底顶点色混入烟熏黑
function buildTripod() {
  const group = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.85, roughness: 0.5 });
  const copper = new THREE.MeshStandardMaterial({ color: '#b07038', metalness: 0.92, roughness: 0.3, vertexColors: true });

  const APEX = new THREE.Vector3(0, 1.56, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const foot = new THREE.Vector3(Math.cos(a) * 0.85, 0.02, Math.sin(a) * 0.85);
    const dir = APEX.clone().sub(foot);
    const len = dir.length() + 0.14; // 顶端略出头交叉
    const geo = new THREE.CylinderGeometry(0.016, 0.02, len, 8);
    const mesh = new THREE.Mesh(geo, iron);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    mesh.position.copy(foot).addScaledVector(dir, len / 2 - 0.05);
    mesh.castShadow = true;
    group.add(mesh);
  }
  // 挂链:3 节交错圆环,垂到壶提梁
  for (let i = 0; i < 3; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 6, 14), iron);
    link.position.set(0, 1.48 - i * 0.05, 0);
    link.rotation.y = (i % 2) * Math.PI / 2;
    link.rotation.x = Math.PI / 12;
    link.castShadow = true;
    group.add(link);
  }
  // 铜壶:压扁球体,底部烟熏黑(顶点色)
  const potGeo = new THREE.SphereGeometry(0.185, 28, 20);
  potGeo.scale(1, 0.8, 1);
  {
    const pos = potGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cu = new THREE.Color('#ffffff');
    const soot = new THREE.Color('#241a12');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      c.lerpColors(soot, cu, THREE.MathUtils.smoothstep(y, -0.14, 0.02));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    potGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const pot = new THREE.Mesh(potGeo, copper);
  pot.position.set(0, 1.18, 0);
  pot.castShadow = true;
  group.add(pot);
  // 壶盖 + 钮 + 提梁
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.115, 0.035, 20), copper);
  lid.position.set(0, 1.335, 0);
  {
    // 盖与钮无顶点色属性时 vertexColors 材质会告警,补上纯白
    const fill = (g) => {
      const n = g.attributes.position.count;
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    };
    fill(lid.geometry);
  }
  group.add(lid);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), iron);
  knob.position.set(0, 1.365, 0);
  group.add(knob);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.009, 8, 24, Math.PI), iron);
  handle.position.set(0, 1.26, 0);
  handle.rotation.z = 0; // 半圆开口朝下,两端搭壶肩
  group.add(handle);
  return group;
}

// ---------------------------------------------------------------- 夜空穹顶
// 渐变夜色 + 哈希星星(闪烁)+ 一轮冷月与辉光;不受雾影响
function buildSky() {
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(-0.45, 0.52, -0.72).normalize() },
    },
    vertexShader: /* glsl */ `
      out vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      in vec3 vDir;
      out vec4 outColor;
      uniform float uTime;
      uniform vec3 uMoonDir;
      float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, 0.0, 1.0);
        // 地平灰蓝 → 天顶近黑的夜空渐变(线性空间 HDR,交给合成 pass 调色)
        vec3 col = mix(vec3(0.028, 0.036, 0.060), vec3(0.004, 0.006, 0.012), pow(up, 0.55));
        col += vec3(0.012, 0.010, 0.008) * exp(-abs(d.y) * 9.0); // 地平线微光
        // 星星:方向栅格哈希,亮度阈值筛选 + 缓慢闪烁
        vec3 cell = floor(d * 240.0);
        float h = hash13(cell);
        if (h > 0.9965 && d.y > 0.02) {
          float tw = 0.68 + 0.32 * sin(uTime * 2.1 + h * 97.0);
          col += vec3(0.9, 0.95, 1.0) * (h - 0.9965) / 0.0035 * 0.55 * tw * smoothstep(0.02, 0.2, d.y);
        }
        // 月亮:小圆盘 + 大气辉光
        float md = dot(d, uMoonDir);
        col += vec3(0.85, 0.92, 1.05) * smoothstep(0.99965, 0.99985, md) * 2.2;
        col += vec3(0.10, 0.13, 0.20) * pow(clamp(md, 0.0, 1.0), 220.0);
        outColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(55, 40, 20), mat);
  sky.frustumCulled = false;
  return { sky, skyMat: mat };
}

// ---------------------------------------------------------------- 装配
export function buildWorld(scene) {
  scene.fog = new THREE.FogExp2(0x05070c, 0.075);

  scene.add(buildGround());
  scene.add(buildStones());
  const { group: logs, logMat } = buildLogs();
  scene.add(logs);
  scene.add(buildTripod());
  const { sky, skyMat } = buildSky();
  scene.add(sky);

  // 环境:冷夜半球光 + 冷月定向光(不投影,影子交给火光)
  scene.add(new THREE.HemisphereLight(0x25304c, 0x0b0906, 0.42));
  const moon = new THREE.DirectionalLight(0x93a7d0, 0.45);
  moon.position.set(-6, 7, -9);
  scene.add(moon);

  return {
    /** 每帧:天空闪烁计时;柴堆炭红随火光呼吸 */
    update(time, flicker, intensity) {
      skyMat.uniforms.uTime.value = time;
      logMat.emissiveIntensity = (0.55 + 0.75 * flicker) * intensity;
    },
  };
}
