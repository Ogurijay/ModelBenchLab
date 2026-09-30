import * as THREE from 'three';
import {
  CELL,
  GRID,
  HEIGHT,
  WATER_LEVEL,
  blocked,
  cameraPlan,
  cellCenter,
  cellInfo,
  classify,
  inBounds,
  occupant,
  worldToCell,
} from './sim.js';

const SEG = GRID * 2;
const TREE_CAP = 420;
const REED_CAP = 220;
const ROCK_CAP = 160;

const SPECS = {
  thatch: { color: 0xc6a15a, roughness: 0.96 },
  timber: { color: 0x7a4b2a, roughness: 0.88 },
  plaster: { color: 0xefe2cc, roughness: 0.92 },
  stone: { color: 0x8a8178, roughness: 0.96 },
  moss: { color: 0x6d8f45, roughness: 0.82 },
  crop: { color: 0xc6b23a, roughness: 0.72 },
  fruit: { color: 0xd4533a, roughness: 0.42 },
  cloth: { color: 0x8e2f2a, roughness: 0.74 },
  coat: { color: 0x9c3b2e, roughness: 0.76 },
  skin: { color: 0xe6c2a2, roughness: 0.68 },
  lantern: { color: 0x2a2118, emissive: 0xffb15a, emissiveIntensity: 0.85, roughness: 0.4 },
  earth: { color: 0xb08960, roughness: 1 },
  leaf: { color: 0x3e6434, roughness: 0.88 },
  trunk: { color: 0x5c4030, roughness: 0.92 },
  reed: { color: 0x7d9a62, roughness: 0.8 },
};

const sharedMaterials = {};
const glowMaterials = [];

function unitBox() {
  return geo('box', () => new THREE.BoxGeometry(1, 1, 1));
}
function unitCone(n = 7) {
  return geo(`cone${n}`, () => new THREE.ConeGeometry(1, 1, n));
}
function unitCyl(n = 7) {
  return geo(`cyl${n}`, () => new THREE.CylinderGeometry(1, 1, 1, n));
}
function unitSphere() {
  return geo('sphere', () => new THREE.SphereGeometry(1, 12, 8));
}

const geometries = {};
function geo(name, build) {
  if (!geometries[name]) geometries[name] = build();
  return geometries[name];
}

function shade(name, ghost) {
  if (!ghost && sharedMaterials[name]) return sharedMaterials[name];
  const spec = SPECS[name];
  const material = new THREE.MeshStandardMaterial({
    color: spec.color,
    roughness: spec.roughness,
    metalness: 0,
    emissive: spec.emissive || 0x000000,
    emissiveIntensity: spec.emissive ? spec.emissiveIntensity : 0,
  });
  if (ghost) {
    material.transparent = true;
    material.opacity = 0.5;
    material.depthWrite = false;
  } else {
    sharedMaterials[name] = material;
    if (spec.emissive) glowMaterials.push(material);
  }
  return material;
}

function piece(group, name, geometry, x, y, z, sx, sy, sz, ghost, rotZ = 0) {
  const mesh = new THREE.Mesh(geometry, shade(name, ghost));
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  if (rotZ) mesh.rotation.z = rotZ;
  mesh.castShadow = !ghost;
  mesh.receiveShadow = !ghost;
  group.add(mesh);
  return mesh;
}

function makeBuilding(type, ghost) {
  const group = new THREE.Group();
  const g = ghost;
  if (type === 'road' || type === 'demolish') {
    piece(group, 'earth', unitBox(), 0, 0.05, 0, 1.55, 0.08, 1.55, g);
    return group;
  }
  piece(group, 'earth', unitBox(), 0, -0.12, 0, 1.55, 0.5, 1.45, g);
  if (type === 'hut') {
    piece(group, 'plaster', unitBox(), 0, 0.62, 0, 1.4, 1.05, 1.2, g);
    piece(group, 'thatch', unitCone(), 0, 1.45, 0, 0.95, 0.72, 0.85, g);
    piece(group, 'timber', unitBox(), 0, 0.38, 0.62, 0.28, 0.52, 0.06, g);
    piece(group, 'lantern', unitBox(), 0.42, 0.78, 0.62, 0.16, 0.16, 0.04, g);
  } else if (type === 'hall') {
    piece(group, 'plaster', unitBox(), 0, 0.78, 0, 1.9, 1.25, 1.45, g);
    piece(group, 'thatch', unitBox(), 0, 1.52, 0, 2.15, 0.16, 1.7, g);
    piece(group, 'timber', unitBox(), 0, 1.72, 0, 1.5, 0.28, 1.15, g);
    piece(group, 'timber', unitBox(), 0, 0.42, 0.74, 0.36, 0.62, 0.06, g);
    piece(group, 'cloth', unitBox(), 0.78, 1.15, 0.74, 0.08, 0.42, 0.04, g);
  } else if (type === 'farm') {
    for (const x of [-0.42, 0.42]) {
      for (const z of [-0.28, 0.28]) piece(group, 'crop', unitBox(), x, 0.22, z, 0.55, 0.28, 0.38, g);
    }
    for (const [x, z] of [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.6], [0.7, 0.6]]) {
      piece(group, 'timber', unitBox(), x, 0.28, z, 0.06, 0.4, 0.06, g);
    }
  } else if (type === 'grove') {
    piece(group, 'trunk', unitCyl(), 0, 0.16, 0, 0.28, 0.22, 0.28, g);
    piece(group, 'timber', unitCyl(6), -0.15, 0.38, 0.05, 0.12, 0.85, 0.12, g, Math.PI / 2);
    piece(group, 'timber', unitCyl(6), 0.05, 0.52, -0.05, 0.11, 0.7, 0.11, g, Math.PI / 2.2);
  } else if (type === 'kiln') {
    piece(group, 'stone', unitCyl(8), 0, 0.55, 0, 0.48, 0.9, 0.48, g);
    piece(group, 'stone', unitCone(8), 0, 1.15, 0, 0.58, 0.42, 0.58, g);
    piece(group, 'stone', unitCyl(6), 0.22, 1.15, 0, 0.1, 0.55, 0.1, g);
    piece(group, 'lantern', unitSphere(), 0, 0.42, 0.4, 0.12, 0.12, 0.08, g);
  } else if (type === 'pier') {
    piece(group, 'timber', unitBox(), 0, 0.16, 0.1, 0.85, 0.08, 0.7, g);
    piece(group, 'timber', unitBox(), 0, 0.16, 0.85, 0.85, 0.08, 0.6, g);
    for (const z of [-0.2, 0.45, 1.1]) {
      piece(group, 'timber', unitCyl(), -0.32, -0.25, z, 0.05, 0.85, 0.05, g);
      piece(group, 'timber', unitCyl(), 0.32, -0.25, z, 0.05, 0.85, 0.05, g);
    }
  } else if (type === 'orchard') {
    for (const [x, z] of [[-0.4, 0.15], [0.35, -0.2], [0.05, 0.4]]) {
      piece(group, 'trunk', unitCyl(), x, 0.28, z, 0.06, 0.4, 0.06, g);
      piece(group, 'moss', unitSphere(), x, 0.62, z, 0.22, 0.2, 0.22, g);
      piece(group, 'fruit', unitSphere(), x + 0.08, 0.58, z + 0.08, 0.06, 0.06, 0.06, g);
    }
  } else if (type === 'well') {
    piece(group, 'stone', unitCyl(8), 0, 0.28, 0, 0.38, 0.36, 0.38, g);
    piece(group, 'timber', unitBox(), 0, 0.72, 0, 0.08, 0.55, 0.08, g);
    piece(group, 'thatch', unitCone(), 0, 1.12, 0, 0.48, 0.28, 0.48, g);
  } else if (type === 'lamp') {
    piece(group, 'timber', unitCyl(), 0, 0.7, 0, 0.05, 1.2, 0.05, g);
    piece(group, 'lantern', unitBox(), 0, 1.38, 0, 0.18, 0.22, 0.18, g);
  } else if (type === 'tower') {
    piece(group, 'timber', unitBox(), 0, 1.15, 0, 0.7, 2.1, 0.7, g);
    piece(group, 'timber', unitBox(), 0, 2.25, 0, 1.05, 0.1, 1.05, g);
    piece(group, 'thatch', unitCone(), 0, 2.6, 0, 0.7, 0.5, 0.7, g);
    piece(group, 'cloth', unitBox(), 0.42, 1.7, 0, 0.36, 0.22, 0.04, g);
  }
  return group;
}

function makePerson(hero) {
  const group = new THREE.Group();
  piece(group, hero ? 'coat' : 'cloth', unitBox(), 0, 0.78, 0, hero ? 0.42 : 0.34, 0.58, 0.24, false);
  piece(group, 'skin', unitSphere(), 0, 1.26, 0, 0.16, 0.16, 0.16, false);
  if (hero) {
    piece(group, 'thatch', unitCyl(), 0, 1.4, 0, 0.28, 0.045, 0.28, false);
    piece(group, 'thatch', unitCone(), 0, 1.54, 0, 0.2, 0.2, 0.2, false);
    piece(group, 'timber', unitBox(), 0, 0.92, -0.16, 0.24, 0.28, 0.12, false);
  }
  const legL = piece(group, 'timber', unitBox(), -0.09, 0.28, 0, 0.09, 0.4, 0.1, false);
  const legR = piece(group, 'timber', unitBox(), 0.09, 0.28, 0, 0.09, 0.4, 0.1, false);
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return { group, legL, legR, target: new THREE.Vector3(), wait: 0, phase: Math.random() * 6 };
}

function vertexColor(info, salt) {
  const color = new THREE.Color();
  if (info.kind === 'deep') color.set('#14383e');
  else if (info.kind === 'shallow') color.set('#2a756f');
  else if (info.kind === 'sand') color.set('#e4c48a');
  else if (info.kind === 'rock') color.set(salt > 0.5 ? '#94867a' : '#7d6e62');
  else if (info.forest) color.set('#3c6236');
  else color.set(salt > 0.5 ? '#89a85a' : '#6e9148');
  return color;
}

function sunTexture(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.45, outer);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class WorldView {
  constructor(stage) {
    this.stage = stage;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    if (!this.renderer.getContext()) throw new Error('WebGL 不可用');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    stage.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8ea4b8');
    this.scene.fog = new THREE.FogExp2('#d7c3a4', 0.0165);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.12, 420);
    this.yaw = 0.62;
    this.pitch = 0.48;
    this.dist = 13;
    this.clock = 0;
    this.player = { x: 0, z: 0, face: 0, moving: false, walk: 0 };
    this.buildings = new Map();
    this.people = [];
    this.ghost = { type: null, group: null, ok: false };
    this.ghostGroups = new Map();

    this._ndc = new THREE.Vector2();
    this._ray = new THREE.Raycaster();
    this._downRay = new THREE.Raycaster();
    this._origin = new THREE.Vector3();
    this._down = new THREE.Vector3(0, -1, 0);
    this._sun = new THREE.Vector3();
    this._horizon = new THREE.Color();
    this._zenith = new THREE.Color();
    this._fog = new THREE.Color();
    this._night = new THREE.Color('#1b242c');
    this._dayH = new THREE.Color('#f0c99a');
    this._dusk = new THREE.Color('#e15a32');
    this._nightZ = new THREE.Color('#243044');
    this._dayZ = new THREE.Color('#7eb0c4');

    this.hemi = new THREE.HemisphereLight(0xc5d7e2, 0x6a5438, 0.72);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xfff4e4, 0.18);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 90;
    this.sun.shadow.camera.left = -42;
    this.sun.shadow.camera.right = 42;
    this.sun.shadow.camera.top = 42;
    this.sun.shadow.camera.bottom = -42;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.025;
    this.scene.add(this.sun, this.sun.target);

    this.buildSky();
    this.buildWater();
    this.buildScatter();
    this.hero = makePerson(true);
    this.scene.add(this.hero.group);
    this.ghostAnchor = new THREE.Group();
    this.scene.add(this.ghostAnchor);
    this.structureRoot = new THREE.Group();
    this.scene.add(this.structureRoot);

    this.resize();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  get dom() {
    return this.renderer.domElement;
  }

  resize() {
    const w = this.stage.clientWidth || window.innerWidth;
    const h = this.stage.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.dom.style.width = '100%';
    this.dom.style.height = '100%';
  }

  buildSky() {
    const material = new THREE.ShaderMaterial({
      toneMapped: false,
      fog: false,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) } },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSun;
        varying vec3 vDir;
        float hash13(vec3 p) {
          p = fract(p * vec3(123.34, 345.45, 789.12));
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        void main() {
          vec3 dir = normalize(vDir);
          vec3 sun = normalize(uSun);
          float day = smoothstep(-0.08, 0.28, sun.y);
          float dusk = smoothstep(0.34, 0.02, abs(sun.y)) * step(-0.02, sun.y);
          vec3 zenith = mix(vec3(0.02, 0.04, 0.08), vec3(0.15, 0.36, 0.50), day);
          vec3 horizon = mix(vec3(0.045, 0.04, 0.045), vec3(0.78, 0.56, 0.34), day);
          horizon = mix(horizon, vec3(0.75, 0.26, 0.10), dusk);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.62, clamp(dir.y, 0.0, 1.0)));
          float sunDot = max(dot(dir, sun), 0.0);
          col += vec3(1.0, 0.78, 0.46) * pow(sunDot, 110.0) * day;
          col += vec3(0.95, 0.42, 0.16) * pow(sunDot, 7.0) * dusk * 0.5;
          float stars = step(0.986, hash13(floor(dir * 84.0)));
          col += vec3(0.85, 0.9, 1.0) * stars * (1.0 - day);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }
      `,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
    this.sky.scale.setScalar(240);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -2;
    this.scene.add(this.sky);

    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTexture('rgba(255,246,224,1)', 'rgba(255,196,120,0.55)'),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }));
    this.sunSprite.scale.set(18, 18, 1);
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTexture('rgba(232,238,246,1)', 'rgba(160,176,198,0.35)'),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }));
    this.moonSprite.scale.set(7, 7, 1);
    this.scene.add(this.sunSprite, this.moonSprite);
  }

  buildWater() {
    const bed = new THREE.Mesh(
      new THREE.CircleGeometry(170, 48),
      new THREE.MeshStandardMaterial({ color: 0x14383c, roughness: 1, metalness: 0 }),
    );
    bed.rotation.x = -Math.PI / 2;
    bed.position.y = 0.15;
    bed.receiveShadow = true;
    this.scene.add(bed);

    const waterGeo = new THREE.PlaneGeometry(240, 240, 48, 48);
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(waterGeo, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0 } },
      ]),
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vec3 p = position;
          p.y += sin(p.x * 0.42 + uTime * 1.35) * 0.07 + cos(p.z * 0.3 - uTime) * 0.05;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        #include <fog_pars_fragment>
        void main() {
          float rip = sin(vUv.x * 48.0 + uTime * 1.5) * cos(vUv.y * 36.0 - uTime);
          vec3 deep = vec3(0.02, 0.15, 0.17);
          vec3 shallow = vec3(0.09, 0.40, 0.38);
          vec3 col = mix(deep, shallow, 0.4 + rip * 0.08);
          col += vec3(0.72, 0.84, 0.76) * pow(max(rip, 0.0), 8.0) * 0.32;
          gl_FragColor = vec4(col, 0.84);
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }));
    this.water.position.y = WATER_LEVEL;
    this.water.renderOrder = 2;
    this.water.frustumCulled = false;
    this.scene.add(this.water);

    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xf7f1e6, transparent: true, opacity: 0.55, depthWrite: false });
    this.clouds = [];
    for (let i = 0; i < 6; i += 1) {
      const cloud = new THREE.Mesh(unitSphere(), cloudMat);
      cloud.scale.set(7 + (i % 3) * 2.2, 1.35, 3.4 + (i % 2));
      cloud.position.set(-28 + i * 11, 16 + (i % 3) * 1.4, -18 + (i % 4) * 8);
      cloud.userData.baseX = cloud.position.x;
      cloud.userData.baseZ = cloud.position.z;
      this.clouds.push(cloud);
      this.scene.add(cloud);
    }

    const flyGeo = new THREE.BufferGeometry();
    const flyPos = new Float32Array(36 * 3);
    for (let i = 0; i < 36; i += 1) {
      const a = i * 0.7;
      flyPos[i * 3] = Math.cos(a) * (6 + (i % 5) * 2);
      flyPos[i * 3 + 1] = 1.2 + (i % 7) * 0.35;
      flyPos[i * 3 + 2] = Math.sin(a * 1.3) * (6 + (i % 4) * 2);
    }
    flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
    this.fireflies = new THREE.Points(flyGeo, new THREE.PointsMaterial({
      color: 0xffd2a1,
      size: 0.14,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    }));
    this.scene.add(this.fireflies);
  }

  buildScatter() {
    this.terrain = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    );
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    this.trunks = new THREE.InstancedMesh(unitCyl(5), shade('trunk', false), TREE_CAP);
    this.canopies = new THREE.InstancedMesh(unitCone(6), shade('leaf', false), TREE_CAP);
    this.reeds = new THREE.InstancedMesh(unitCyl(4), shade('reed', false), REED_CAP);
    this.rocks = new THREE.InstancedMesh(unitSphere(), shade('stone', false), ROCK_CAP);
    for (const mesh of [this.trunks, this.canopies, this.reeds, this.rocks]) {
      mesh.castShadow = mesh !== this.reeds;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
    this._dummy = new THREE.Object3D();
  }

  rebuild(state) {
    this.seed = state.seed;
    const n = SEG;
    const span = GRID * CELL;
    const half = span / 2;
    const vCount = (n + 1) * (n + 1);
    const positions = new Float32Array(vCount * 3);
    const colors = new Float32Array(vCount * 3);
    for (let z = 0; z <= n; z += 1) {
      for (let x = 0; x <= n; x += 1) {
        const wx = -half + (x / n) * span;
        const wz = -half + (z / n) * span;
        const info = classify(wx, wz, state.seed);
        const i = (z * (n + 1) + x) * 3;
        positions[i] = wx;
        positions[i + 1] = info.h * HEIGHT;
        positions[i + 2] = wz;
        const color = vertexColor(info, ((x * 13 + z * 7) % 10) / 10);
        colors[i] = color.r;
        colors[i + 1] = color.g;
        colors[i + 2] = color.b;
      }
    }
    const indices = [];
    for (let z = 0; z < n; z += 1) {
      for (let x = 0; x < n; x += 1) {
        const a = z * (n + 1) + x;
        const b = a + 1;
        const c = a + n + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    this.terrain.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.terrain.geometry = geometry;
    this.sync(state);
  }

  groundY(x, z) {
    this._origin.set(x, 48, z);
    this._downRay.set(this._origin, this._down);
    const hits = this._downRay.intersectObject(this.terrain, false);
    return hits.length ? hits[0].point.y : 0;
  }

  feetY(x, z, state) {
    const y = this.groundY(x, z);
    const { ix, iz } = worldToCell(x, z);
    if (!inBounds(ix, iz)) return y;
    const kind = cellInfo(state, ix, iz).kind;
    if (kind === 'shallow' || kind === 'deep') return Math.max(y, WATER_LEVEL);
    return y;
  }

  foundationY(type, x, z, state) {
    const y = this.groundY(x, z);
    if (type === 'pier') return Math.max(y, WATER_LEVEL);
    return y;
  }

  sync(state) {
    this.syncStructures(state);
    this.syncScatter(state);
    this.syncPeople(state);
  }

  syncStructures(state) {
    const keep = new Set();
    const placeOne = (id, type, ix, iz, rot) => {
      keep.add(id);
      const prev = this.buildings.get(id);
      if (prev && prev.type === type && prev.rot === rot) return;
      if (prev) this.structureRoot.remove(prev.group);
      const group = makeBuilding(type, false);
      const p = cellCenter(ix, iz);
      const lift = type === 'road' ? 0.04 : 0;
      group.position.set(p.x, this.foundationY(type, p.x, p.z, state) + lift, p.z);
      group.rotation.y = rot * Math.PI / 2;
      this.structureRoot.add(group);
      this.buildings.set(id, { type, rot, group });
    };
    for (const road of state.roads) placeOne(`road:${road}`, 'road', ...road.split(',').map(Number), 0);
    for (const b of state.buildings) placeOne(`${b.ix},${b.iz}`, b.type, b.ix, b.iz, b.rot || 0);
    for (const [id, entry] of this.buildings) {
      if (keep.has(id)) continue;
      this.structureRoot.remove(entry.group);
      this.buildings.delete(id);
    }
  }

  syncScatter(state) {
    const trees = [];
    const reeds = [];
    const rocks = [];
    for (let iz = 0; iz < GRID; iz += 1) {
      for (let ix = 0; ix < GRID; ix += 1) {
        const info = cellInfo(state, ix, iz);
        const p = cellCenter(ix, iz);
        const who = occupant(state, ix, iz);
        if (info.forest && !who && trees.length < TREE_CAP) {
          trees.push([p.x, p.z, 0.85 + ((ix * 17 + iz) % 7) / 10, (ix + iz) % 5]);
          if (((ix * 3 + iz) % 5) === 0 && trees.length < TREE_CAP) {
            trees.push([p.x + 0.55, p.z - 0.35, 0.7, (ix * iz) % 6]);
          }
        } else if (info.kind === 'shallow' && reeds.length < REED_CAP && ((ix + iz) % 3) === 0) {
          reeds.push([p.x, p.z, 0.7 + (ix % 4) * 0.15]);
        } else if (info.kind === 'rock' && !who && rocks.length < ROCK_CAP && ((ix + iz * 2) % 4) === 0) {
          rocks.push([p.x, p.z, 0.25 + (iz % 3) * 0.12]);
        }
      }
    }
    this.writeInstances(this.trunks, trees, (x, z, scale) => {
      const y = this.groundY(x, z);
      this._dummy.position.set(x, y + 0.42 * scale, z);
      this._dummy.scale.set(0.09 * scale, 0.85 * scale, 0.09 * scale);
      this._dummy.rotation.set(0, 0, 0);
    });
    this.writeInstances(this.canopies, trees, (x, z, scale, spin) => {
      const y = this.groundY(x, z);
      this._dummy.position.set(x, y + 1.15 * scale, z);
      this._dummy.scale.set(0.55 * scale, 1.15 * scale, 0.55 * scale);
      this._dummy.rotation.set(0, spin, 0);
    });
    this.writeInstances(this.reeds, reeds, (x, z, scale) => {
      this._dummy.position.set(x, WATER_LEVEL + 0.35 * scale, z);
      this._dummy.scale.set(0.035, 0.8 * scale, 0.035);
      this._dummy.rotation.set(0, 0, 0);
    });
    this.writeInstances(this.rocks, rocks, (x, z, scale) => {
      const y = this.groundY(x, z);
      this._dummy.position.set(x, y + 0.12, z);
      this._dummy.scale.set(scale, scale * 0.7, scale);
      this._dummy.rotation.set(0, x, 0);
    });
  }

  writeInstances(mesh, items, pose) {
    mesh.count = items.length;
    mesh.visible = items.length > 0;
    for (let i = 0; i < items.length; i += 1) {
      pose(...items[i]);
      this._dummy.updateMatrix();
      mesh.setMatrixAt(i, this._dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  syncPeople(state) {
    const count = Math.min(15, Math.max(0, state.pop - 1));
    while (this.people.length < count) {
      const person = makePerson(false);
      const home = cellCenter(state.spawn.ix, state.spawn.iz);
      person.group.position.set(home.x + this.people.length * 0.4, 0, home.z + 1.2);
      person.target.set(home.x, 0, home.z);
      this.scene.add(person.group);
      this.people.push(person);
    }
    while (this.people.length > count) {
      const person = this.people.pop();
      this.scene.remove(person.group);
    }
  }

  wanderTarget(state) {
    const spots = [];
    for (const b of state.buildings) {
      const p = cellCenter(b.ix, b.iz);
      spots.push([p.x + CELL * 0.8, p.z]);
      spots.push([p.x, p.z + CELL * 0.8]);
    }
    for (const road of state.roads) {
      const [ix, iz] = road.split(',').map(Number);
      const p = cellCenter(ix, iz);
      spots.push([p.x, p.z]);
    }
    if (!spots.length) {
      const p = cellCenter(state.spawn.ix, state.spawn.iz);
      spots.push([p.x + CELL, p.z]);
    }
    for (let i = 0; i < 8; i += 1) {
      const [x, z] = spots[Math.floor(Math.random() * spots.length)];
      const jx = x + (Math.random() - 0.5) * 1.2;
      const jz = z + (Math.random() - 0.5) * 1.2;
      if (!blocked(state, jx, jz)) return new THREE.Vector3(jx, 0, jz);
    }
    const p = cellCenter(state.spawn.ix, state.spawn.iz);
    return new THREE.Vector3(p.x + CELL, 0, p.z);
  }

  setGhost(state, type, ix, iz, rot, ok) {
    if (!type || !Number.isInteger(ix)) {
      this.ghostAnchor.visible = false;
      this.ghost.type = null;
      return;
    }
    if (this.ghost.type !== type) {
      this.ghostAnchor.clear();
      let group = this.ghostGroups.get(type);
      if (!group) {
        group = makeBuilding(type, true);
        this.ghostGroups.set(type, group);
      }
      this.ghostAnchor.add(group);
      this.ghost.type = type;
      this.ghost.group = group;
    }
    const p = cellCenter(ix, iz);
    const planted = type === 'demolish' ? 'road' : type;
    this.ghostAnchor.visible = true;
    this.ghostAnchor.position.set(p.x, this.foundationY(planted, p.x, p.z, state) + (planted === 'road' ? 0.04 : 0), p.z);
    this.ghostAnchor.rotation.y = (rot || 0) * Math.PI / 2;
    const tint = ok ? 0xd5e2bc : 0xe7b1a6;
    this.ghostAnchor.traverse((obj) => {
      if (obj.isMesh && obj.material) obj.material.color.setHex(tint);
    });
    this.ghost.ok = ok;
  }

  pick(clientX, clientY) {
    const rect = this.dom.getBoundingClientRect();
    this._ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this._ray.setFromCamera(this._ndc, this.camera);
    const hits = this._ray.intersectObject(this.terrain, false);
    if (!hits.length) return null;
    const { ix, iz } = worldToCell(hits[0].point.x, hits[0].point.z);
    if (!inBounds(ix, iz)) return null;
    return { ix, iz };
  }

  frame(dt, state) {
    this._state = state;
    this.clock += dt;
    const angle = (state.time - 0.25) * Math.PI * 2;
    this._sun.set(Math.cos(angle) * 0.9, Math.sin(angle), 0.28).normalize();
    this.sky.material.uniforms.uSun.value.copy(this._sun);
    this.water.material.uniforms.uTime.value = this.clock;

    const day = THREE.MathUtils.smoothstep(this._sun.y, -0.08, 0.28);
    const dusk = THREE.MathUtils.smoothstep(Math.abs(this._sun.y), 0.34, 0.02) * (this._sun.y > -0.02 ? 1 : 0);
    this._horizon.copy(this._night).lerp(this._dayH, day).lerp(this._dusk, dusk * 0.8);
    this._zenith.copy(this._nightZ).lerp(this._dayZ, day);
    this._fog.copy(this._horizon);
    this.scene.fog.color.copy(this._fog);
    this.scene.background.copy(this._horizon);
    this.hemi.color.copy(this._zenith);
    this.hemi.groundColor.set(day > 0.4 ? 0x6a5438 : 0x2a2622);
    this.hemi.intensity = 0.28 + day * 0.55;
    this.ambient.intensity = 0.12 + (1 - day) * 0.18;
    this.sun.color.set(dusk > 0.45 ? 0xff9a62 : 0xfff2dc);
    this.sun.intensity = this._sun.y > 0 ? 0.45 + this._sun.y * 2.5 : 0.12;
    const elev = Math.max(0.18, this._sun.y);
    this.sun.position.set(this._sun.x, elev, this._sun.z).multiplyScalar(46);
    this.sunSprite.position.copy(this._sun).multiplyScalar(150);
    this.sunSprite.visible = this._sun.y > -0.02;
    this.moonSprite.position.copy(this._sun).multiplyScalar(-130);
    this.moonSprite.visible = this._sun.y < 0.15;
    for (const material of glowMaterials) {
      material.emissiveIntensity = 0.35 + (1 - day) * 1.5;
    }
    this.fireflies.material.opacity = (1 - day) * 0.85;
    const fly = this.fireflies.geometry.attributes.position;
    for (let i = 0; i < fly.count; i += 1) {
      const y = 1.1 + (i % 7) * 0.35 + Math.sin(this.clock * 1.4 + i) * 0.18;
      fly.setY(i, y);
    }
    fly.needsUpdate = true;
    for (const cloud of this.clouds) {
      cloud.position.x = cloud.userData.baseX + Math.sin(this.clock * 0.05 + cloud.userData.baseX) * 3;
      cloud.position.z = ((cloud.userData.baseZ + this.clock * 1.2) % 70) - 30;
    }

    const feet = this.feetY(this.player.x, this.player.z, state);
    this.hero.group.position.set(this.player.x, feet, this.player.z);
    this.hero.group.rotation.y = this.player.face;
    if (this.player.moving) this.player.walk += dt * 11;
    const swing = this.player.moving ? Math.sin(this.player.walk) * 0.7 : 0;
    this.hero.legL.rotation.x = swing;
    this.hero.legR.rotation.x = -swing;

    for (const person of this.people) {
      if (person.wait <= 0 || person.group.position.distanceTo(person.target) < 0.25) {
        person.target.copy(this.wanderTarget(state));
        person.wait = 0.4 + Math.random();
      }
      person.wait -= dt;
      const dx = person.target.x - person.group.position.x;
      const dz = person.target.z - person.group.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const step = Math.min(len, dt * 1.45);
      const nx = person.group.position.x + (dx / len) * step;
      const nz = person.group.position.z + (dz / len) * step;
      if (!blocked(state, nx, nz)) {
        person.group.position.x = nx;
        person.group.position.z = nz;
        person.group.rotation.y = Math.atan2(dx, dz);
        person.phase += dt * 9;
        person.legL.rotation.x = Math.sin(person.phase) * 0.6;
        person.legR.rotation.x = -Math.sin(person.phase) * 0.6;
      } else {
        person.wait = 0;
      }
      person.group.position.y = this.feetY(person.group.position.x, person.group.position.z, state);
    }

    if (this.ghostAnchor.visible && this.ghost.group) {
      const pulse = 0.38 + Math.sin(this.clock * 5) * 0.08;
      this.ghostAnchor.traverse((obj) => {
        if (obj.isMesh && obj.material) obj.material.opacity = pulse;
      });
    }

    const focusY = feet + 1.3;
    const plan = cameraPlan(this.yaw);
    const ox = -plan.fx * this.dist * Math.cos(this.pitch);
    const oz = -plan.fz * this.dist * Math.cos(this.pitch);
    this.camera.position.set(this.player.x + ox, focusY + Math.sin(this.pitch) * this.dist, this.player.z + oz);
    this.camera.lookAt(this.player.x, focusY, this.player.z);
    this.renderer.render(this.scene, this.camera);
  }
}
