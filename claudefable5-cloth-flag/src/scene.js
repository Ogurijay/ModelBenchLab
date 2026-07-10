import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeGroundTexture } from './textures.js';
import { CLOTH } from './config.js';

/**
 * 场景装配:渲染器 / 相机 / 光照 / 天空穹顶 / 雾 / 地面 / 旗杆 / 晾布绳桩 / 远山 / 飘尘。
 */
export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd7e2ec, 30, 110);

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    400
  );
  camera.position.set(5.6, 4.0, 7.4);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(1.5, 3.0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 2.5;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.update();

  // ---------------- 光照 ----------------
  const hemi = new THREE.HemisphereLight(0xbcd4f5, 0x8a7a5a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
  sun.position.set(7, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // 逆光补光,给旗面背侧一点冷色轮廓
  const rim = new THREE.DirectionalLight(0x9db8d9, 0.5);
  rim.position.set(-6, 5, -7);
  scene.add(rim);

  // ---------------- 天空穹顶(渐变 + 太阳光晕) ----------------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x2a5ba8) },
      horizonColor: { value: new THREE.Color(0xdde8f1) },
      bottomColor: { value: new THREE.Color(0xb9c8ce) },
      sunDir: { value: sun.position.clone().normalize() },
      sunColor: { value: new THREE.Color(0xffe6b0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      uniform vec3 sunDir;
      uniform vec3 sunColor;
      void main() {
        float h = vDir.y;
        vec3 col = h >= 0.0
          ? mix(horizonColor, topColor, pow(h, 0.55))
          : mix(horizonColor, bottomColor, pow(-h, 0.6));
        float d = max(dot(vDir, normalize(sunDir)), 0.0);
        col += sunColor * pow(d, 24.0) * 0.5;  // 日盘亮斑
        col += sunColor * pow(d, 3.0) * 0.12;  // 大范围暖晕
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 18), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  // ---------------- 地面 ----------------
  const groundTex = makeGroundTexture(renderer.capabilities.getMaxAnisotropy());
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(140, 64),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // 旗杆脚下的石板圆台
  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 40),
    new THREE.MeshStandardMaterial({ color: 0xa09a8c, roughness: 0.9, metalness: 0.05 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.01;
  plaza.receiveShadow = true;
  scene.add(plaza);

  // ---------------- 旗杆 ----------------
  const poleGroup = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, metalness: 0.9, roughness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 1.0, roughness: 0.25 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x6f6a60, metalness: 0.1, roughness: 0.85 });

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.06, CLOTH.poleHeight, 20),
    metal
  );
  shaft.position.y = CLOTH.poleHeight / 2;
  shaft.castShadow = true;
  poleGroup.add(shaft);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), gold);
  finial.position.y = CLOTH.poleHeight + 0.08;
  finial.castShadow = true;
  poleGroup.add(finial);

  const baseLow = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.14, 24), stone);
  baseLow.position.y = 0.07;
  baseLow.castShadow = true;
  baseLow.receiveShadow = true;
  poleGroup.add(baseLow);

  const baseHigh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.26, 24), stone);
  baseHigh.position.y = 0.14 + 0.13;
  baseHigh.castShadow = true;
  poleGroup.add(baseHigh);

  scene.add(poleGroup);

  // ---------------- 晾布绳 + 木桩(仅「两角固定」模式可见) ----------------
  const lineGroup = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5b3a, roughness: 0.8, metalness: 0 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: 0.9, metalness: 0 });

  const postH = CLOTH.topY + 0.08;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, postH, 12), wood);
  post.position.set(CLOTH.ropeEndX, postH / 2, 0);
  post.castShadow = true;
  lineGroup.add(post);

  const ropeLen = CLOTH.ropeEndX;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ropeLen, 6), ropeMat);
  rope.rotation.z = Math.PI / 2;
  rope.position.set(ropeLen / 2, CLOTH.topY, 0);
  lineGroup.add(rope);

  lineGroup.visible = false;
  scene.add(lineGroup);

  // ---------------- 远山剪影(雾中层次) ----------------
  const hillMat = new THREE.MeshStandardMaterial({
    color: 0x87a094,
    roughness: 1,
    metalness: 0,
    flatShading: true,
  });
  const HILLS = [
    [76, 2.6, 22, 4.5],
    [88, 3.1, 30, 6.5],
    [72, 3.7, 16, 3.2],
    [80, 4.4, 24, 5.0],
    [84, 5.4, 20, 4.0],
    [78, 0.4, 18, 3.6],
    [92, 1.2, 32, 6.0],
    [74, 1.9, 14, 2.8],
    [86, 5.9, 26, 5.2],
  ];
  for (const [d, a, r, hh] of HILLS) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 9), hillMat);
    hill.position.set(Math.cos(a) * d, hh / 2 - 0.3, Math.sin(a) * d);
    hill.rotation.y = a * 1.7;
    scene.add(hill);
  }

  const dust = createDust(scene);

  // 窗口自适应
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, controls, lineGroup, dust };
}

/** 飘尘 / 花粉粒子:随风缓慢漂移,给空气以体积感 */
function createDust(scene) {
  const N = 200;
  const BOX = { x0: -4, x1: 10, y0: 0.15, y1: 6.5, z0: -6, z1: 8 };
  const pos = new Float32Array(N * 3);
  const phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = BOX.x0 + Math.random() * (BOX.x1 - BOX.x0);
    pos[i * 3 + 1] = BOX.y0 + Math.random() * (BOX.y1 - BOX.y0);
    pos[i * 3 + 2] = BOX.z0 + Math.random() * (BOX.z1 - BOX.z0);
    phase[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  const mat = new THREE.PointsMaterial({
    color: 0xfff6df,
    size: 0.038,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  let t = 0;
  return {
    points,
    update(dt, windVec) {
      t += dt;
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        pos[j] += (windVec.x * 0.12 + 0.1) * dt + Math.sin(t * 0.8 + phase[i]) * 0.12 * dt;
        pos[j + 1] += Math.sin(t * 0.6 + phase[i] * 2.3) * 0.18 * dt;
        pos[j + 2] += windVec.z * 0.12 * dt + Math.cos(t * 0.7 + phase[i]) * 0.12 * dt;
        if (pos[j] > BOX.x1) pos[j] = BOX.x0;
        else if (pos[j] < BOX.x0) pos[j] = BOX.x1;
        if (pos[j + 1] > BOX.y1) pos[j + 1] = BOX.y0;
        else if (pos[j + 1] < BOX.y0) pos[j + 1] = BOX.y1;
        if (pos[j + 2] > BOX.z1) pos[j + 2] = BOX.z0;
        else if (pos[j + 2] < BOX.z0) pos[j + 2] = BOX.z1;
      }
      attr.needsUpdate = true;
    },
  };
}
