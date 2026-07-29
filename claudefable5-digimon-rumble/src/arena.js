// 竞技场 —「悬浮遗迹」:数字世界上空的浮岛石台,PS2 味的程序化布景。
// 主台 y=0,两侧各一块单向浮台(可跳穿落站)。
import * as THREE from 'three';
import { RULES } from './config.js';

export const PLATFORMS = [
  // 主台由 floorY/stageHalfWidth 描述,这里只列浮台: {x, y, halfW}
  { x: -5.6, y: 2.6, halfW: 1.9 },
  { x: 5.6, y: 2.6, halfW: 1.9 },
];

function stoneTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#8d9099';
  g.fillRect(0, 0, 512, 512);
  // 石砖
  const rows = 8, cols = 6;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const off = (r % 2) * (512 / cols / 2);
      const x = col * (512 / cols) + off - 512 / cols / 2;
      const y = r * (512 / rows);
      const v = 118 + Math.floor(Math.random() * 40);
      g.fillStyle = `rgb(${v},${v + 4},${v + 12})`;
      g.fillRect(x + 3, y + 3, 512 / cols - 6, 512 / rows - 6);
      // 风化噪点
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
        g.fillRect(x + Math.random() * 80, y + Math.random() * 60, 2.5, 2.5);
      }
    }
  }
  // 中央数码魔法阵
  g.save();
  g.translate(256, 256);
  g.strokeStyle = 'rgba(40,220,255,0.85)';
  g.lineWidth = 5;
  g.beginPath(); g.arc(0, 0, 150, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2.5;
  g.beginPath(); g.arc(0, 0, 126, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 8; i++) {
    g.rotate(Math.PI / 4);
    g.strokeRect(-8, -150, 16, 16);
  }
  // 二进制刻纹
  g.fillStyle = 'rgba(40,220,255,0.7)';
  g.font = 'bold 17px monospace';
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    g.save();
    g.rotate(a);
    g.fillText(Math.random() > 0.5 ? '1' : '0', 0, -136);
    g.restore();
  }
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function rockMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x6b6f7a, roughness: 0.95, flatShading: true });
}

// 不规则浮岩(倒锥形底座)
function floatingRock(radiusTop, depth) {
  const geo = new THREE.CylinderGeometry(radiusTop, radiusTop * 0.12, depth, 10, 4);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const jitter = (Math.sin(v.x * 7.3 + v.y * 3.1) + Math.cos(v.z * 5.7 - v.y * 2.2)) * 0.5;
    const r = 1 + jitter * 0.16;
    pos.setX(i, v.x * r);
    pos.setZ(i, v.z * r);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, rockMaterial());
}

export function buildArena(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // ---- 天空穹顶:垂直渐变 + 星尘 ----
  const skyGeo = new THREE.SphereGeometry(220, 32, 20);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPos;
      void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec3 vPos;
      uniform float uTime;
      void main() {
        float h = normalize(vPos).y * 0.5 + 0.5;
        vec3 top = vec3(0.10, 0.16, 0.42);
        vec3 mid = vec3(0.98, 0.55, 0.28);
        vec3 bot = vec3(0.42, 0.12, 0.30);
        vec3 col = h > 0.42 ? mix(mid, top, smoothstep(0.42, 0.85, h))
                            : mix(bot, mid, smoothstep(0.05, 0.42, h));
        // 数据流经线(数字世界感)
        float lon = atan(vPos.z, vPos.x);
        float stream = smoothstep(0.985, 1.0, sin(lon * 22.0 + uTime * 0.35) * sin(normalize(vPos).y * 14.0 - uTime * 0.7));
        col += vec3(0.1, 0.6, 0.7) * stream * smoothstep(0.3, 0.8, h) * 0.55;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);

  // ---- 远景山剪影环 ----
  const mountains = new THREE.Group();
  const mgeo = new THREE.ConeGeometry(1, 1, 5);
  const mmat = new THREE.MeshBasicMaterial({ color: 0x2a1e4e, fog: false });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
    const m = new THREE.Mesh(mgeo, mmat);
    const r = 150 + Math.random() * 35;
    const h = 26 + Math.random() * 42;
    m.scale.set(24 + Math.random() * 26, h, 20);
    m.position.set(Math.cos(a) * r, h * 0.5 - 34, Math.sin(a) * r);
    mountains.add(m);
  }
  group.add(mountains);

  // ---- 云(广告牌 sprite) ----
  const cloudTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    for (let i = 0; i < 5; i++) {
      const grad = g.createRadialGradient(30 + i * 18, 36, 2, 30 + i * 18, 36, 22);
      grad.addColorStop(0, 'rgba(255,244,235,0.85)');
      grad.addColorStop(1, 'rgba(255,244,235,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 64);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.5 + Math.random() * 0.35, depthWrite: false,
    }));
    const a = Math.random() * Math.PI * 2;
    const r = 60 + Math.random() * 80;
    s.position.set(Math.cos(a) * r, 6 + Math.random() * 30, Math.sin(a) * r);
    s.scale.set(26 + Math.random() * 22, 11 + Math.random() * 9, 1);
    s.userData.speed = 0.4 + Math.random() * 0.7;
    group.add(s);
    clouds.push(s);
  }

  // ---- 主台 ----
  const halfW = RULES.stageHalfWidth;
  const stage = new THREE.Group();
  const topMat = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.85 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.5, 7.5), topMat);
  top.position.y = -0.25;
  top.receiveShadow = true;
  stage.add(top);

  const base = floatingRock(halfW * 1.02, 6.5);
  base.position.y = -3.6;
  stage.add(base);

  // 台缘发光饰条
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(halfW * 2 + 0.15, 0.12, 7.65),
    new THREE.MeshBasicMaterial({ color: 0x22ccff }),
  );
  rim.position.y = -0.1; // 顶面低于台面,只露侧缘发光
  stage.add(rim);
  group.add(stage);

  // ---- 浮台 ----
  for (const p of PLATFORMS) {
    const plat = new THREE.Group();
    const pt = new THREE.Mesh(new THREE.BoxGeometry(p.halfW * 2, 0.28, 2.6), topMat);
    pt.receiveShadow = true;
    plat.add(pt);
    const pr = new THREE.Mesh(
      new THREE.BoxGeometry(p.halfW * 2 + 0.1, 0.08, 2.7),
      new THREE.MeshBasicMaterial({ color: 0xffb347 }),
    );
    pr.position.y = 0.12;
    plat.add(pr);
    const rock = floatingRock(p.halfW * 0.9, 1.6);
    rock.position.y = -0.9;
    plat.add(rock);
    plat.position.set(p.x, p.y - 0.14, 0);
    plat.userData.baseY = plat.position.y;
    plat.userData.phase = Math.random() * Math.PI * 2;
    group.add(plat);
    p._mesh = plat;
  }

  // ---- 环绕小碎岩 ----
  for (let i = 0; i < 10; i++) {
    const r = floatingRock(0.5 + Math.random() * 0.9, 1 + Math.random() * 1.4);
    const a = Math.random() * Math.PI * 2;
    const dist = 16 + Math.random() * 18;
    r.position.set(Math.cos(a) * dist, -4 + Math.random() * 10, Math.sin(a) * dist - 6);
    r.userData = { baseY: r.position.y, phase: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.3 };
    group.add(r);
    PLATFORMS_DECOR.push(r);
  }

  // ---- 灯光 ----
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x3a2436, 0.9));
  const sun = new THREE.DirectionalLight(0xffe0b3, 2.6);
  sun.position.set(-14, 22, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -6;
  sun.shadow.camera.near = 4; sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  const rimLight = new THREE.DirectionalLight(0x66aaff, 1.1);
  rimLight.position.set(10, 6, -12);
  scene.add(rimLight);

  scene.fog = new THREE.Fog(0x54245e, 90, 230);

  return {
    group, sky, clouds,
    update(dt, t) {
      skyMat.uniforms.uTime.value = t;
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 140) c.position.x = -140;
      }
      for (const p of PLATFORMS) {
        if (p._mesh) {
          p._mesh.position.y = p._mesh.userData.baseY + Math.sin(t * 0.8 + p._mesh.userData.phase) * 0.07;
        }
      }
      for (const r of PLATFORMS_DECOR) {
        r.position.y = r.userData.baseY + Math.sin(t * 0.5 + r.userData.phase) * 0.5;
        r.rotation.y += r.userData.spin * dt;
      }
    },
  };
}

const PLATFORMS_DECOR = [];
