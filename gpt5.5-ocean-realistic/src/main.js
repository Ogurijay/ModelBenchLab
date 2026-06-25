import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createOceanMaterial,
  createSkyMaterial,
  updateOceanMaterialWaves,
  updateStormUniforms
} from './ocean/materials.js';
import {
  DEFAULT_OCEAN_SETTINGS,
  createWaveSet,
  getOceanGeometryConfig,
  mulberry32
} from './ocean/waves.js';
import {
  createLightningSegments,
  createRainLayerConfig,
  createSpoutParticles
} from './weather/effects.js';
import {
  computeStormRenderState,
  resolveStormSettings
} from './weather/storm.js';
import { createControlPanel, createHudUpdater } from './ui/panel.js';

const canvas = document.querySelector('#ocean-canvas');
const settings = resolveStormSettings(DEFAULT_OCEAN_SETTINGS);
const geometryConfig = getOceanGeometryConfig({ quality: settings.quality });

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#07111c', 0.016);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1400);
camera.position.set(22, 15, 42);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 12;
controls.maxDistance = 180;
controls.maxPolarAngle = Math.PI * 0.492;
controls.target.set(0, 1.1, -8);

const skyMaterial = createSkyMaterial();
const sky = new THREE.Mesh(new THREE.SphereGeometry(720, 64, 32), skyMaterial);
scene.add(sky);

const sun = new THREE.DirectionalLight('#ccecff', 0.85);
sun.position.set(36, 82, 44);
scene.add(sun);

const ambient = new THREE.AmbientLight('#7aa4ba', 0.32);
scene.add(ambient);

const lightningLight = new THREE.PointLight('#ccefff', 0, 360, 1.4);
lightningLight.position.set(0, 95, -30);
scene.add(lightningLight);

let waves = createWaveSet(settings);
const oceanMaterial = createOceanMaterial(waves, settings);
const oceanGeometry = new THREE.PlaneGeometry(
  geometryConfig.width,
  geometryConfig.depth,
  geometryConfig.segments,
  geometryConfig.segments
);
oceanGeometry.rotateX(-Math.PI / 2);

const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
ocean.frustumCulled = false;
scene.add(ocean);

const horizonGeometry = new THREE.RingGeometry(160, 430, 256);
const horizonMaterial = new THREE.MeshBasicMaterial({
  color: '#06131d',
  transparent: true,
  opacity: 0.38,
  side: THREE.DoubleSide,
  depthWrite: false
});
const horizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
horizon.rotation.x = -Math.PI / 2;
horizon.position.y = -0.22;
scene.add(horizon);

function createCloudShelf() {
  const geometry = new THREE.CylinderGeometry(315, 350, 22, 128, 1, true);
  const material = new THREE.MeshBasicMaterial({
    color: '#0a111a',
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 62;
  return { mesh, material };
}

function createRainField(seed = 1337) {
  function createLayer(name, config, layerSeed) {
    const rand = mulberry32(layerSeed);
    const positions = new Float32Array(config.count * 3);
    const rainAttrs = new Float32Array(config.count * 4);
    const driftAttrs = new Float32Array(config.count * 3);

    for (let i = 0; i < config.count; i += 1) {
      const base = i * 3;
      const x = (rand() - 0.5) * config.width;
      const y = rand() * config.height + 4;
      const z = (rand() - 0.5) * config.depth - 50;
      const length = config.length * (0.58 + rand() * 0.84);
      const directionJitter = (rand() - 0.5) * config.directionJitter;
      const gust = (rand() - 0.5) * config.gustVariance;
      const crosswind =
        (rand() - 0.5) * config.crosswindVariance +
        Math.sin(y * 0.11 + z * 0.025 + layerSeed * 0.001) * config.crosswindVariance * 0.18;
      const depthSlant =
        (rand() - 0.5) * config.depthSlantVariance +
        Math.sin(x * 0.017 + y * 0.04 + layerSeed * 0.002) * config.depthSlantVariance * 0.28;
      const microBurst = rand() < 0.18 ? (rand() - 0.5) * length * config.microBurstVariance : 0;
      const slant = length * Math.max(0.04, 0.22 + rand() * 0.34 + directionJitter * 0.22 + gust * 0.16);
      const screenAngle = Math.atan2(slant + crosswind + microBurst, length);
      const fallSpeed = config.fallSpeedMin + rand() * (config.fallSpeedMax - config.fallSpeedMin);
      const opacity = Math.max(0.18, 1 - rand() * config.opacityJitter);

      positions[base] = x;
      positions[base + 1] = y;
      positions[base + 2] = z;
      rainAttrs[i * 4] = length;
      rainAttrs[i * 4 + 1] = screenAngle;
      rainAttrs[i * 4 + 2] = fallSpeed;
      rainAttrs[i * 4 + 3] = rand() * (config.height + config.length);
      driftAttrs[i * 3] = crosswind + microBurst;
      driftAttrs[i * 3 + 1] = depthSlant;
      driftAttrs[i * 3 + 2] = opacity;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aRain', new THREE.BufferAttribute(rainAttrs, 4));
    geometry.setAttribute('aDrift', new THREE.BufferAttribute(driftAttrs, 3));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: config.opacity },
        uFallSpeed: { value: 35 + config.length * 0.55 },
        uCycle: { value: config.height + config.length * 1.65 },
        uSpriteScale: { value: config.spriteScale },
        uColor: { value: new THREE.Color(name === 'near' ? '#c9e6ed' : name === 'mid' ? '#95b5bf' : '#748d96') }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uFallSpeed;
        uniform float uCycle;
        uniform float uSpriteScale;
        attribute vec4 aRain;
        attribute vec3 aDrift;
        varying float vAlpha;
        varying float vAngle;
        varying float vGrain;
        void main() {
          float fall = uTime * uFallSpeed * aRain.z;
          float wrappedY = mod(position.y + aRain.w - fall, uCycle);
          float gust = sin(uTime * (0.37 + aRain.z * 0.19) + aRain.w * 0.031);
          vec3 transformed = position;
          transformed.y = wrappedY - 10.0;
          transformed.x += aDrift.x * 0.12 * gust;
          transformed.z += aDrift.y * 0.14 * cos(uTime * 0.29 + aRain.w * 0.017);
          vAngle = aRain.y + gust * 0.16;
          vAlpha = aDrift.z;
          vGrain = fract(aRain.w * 0.013 + aRain.z * 3.17);
          vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
          gl_PointSize = clamp((7.0 + aRain.x * 0.24) * uSpriteScale * (420.0 / max(85.0, -mvPosition.z)), 2.0, 58.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying float vAlpha;
        varying float vAngle;
        varying float vGrain;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vAngle);
          float s = sin(vAngle);
          vec2 q = mat2(c, -s, s, c) * p;
          float core = 1.0 - smoothstep(0.012, 0.075, abs(q.x));
          float lengthMask = 1.0 - smoothstep(0.34, 0.5, abs(q.y));
          float head = mix(0.58, 1.0, smoothstep(-0.42, 0.34, q.y));
          float broken = 0.78 + 0.22 * sin(vGrain * 41.0 + q.y * 19.0);
          float alpha = core * lengthMask * head * broken * vAlpha * uOpacity;
          if (alpha < 0.006) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `
    });
    const mesh = new THREE.Points(geometry, material);
    mesh.frustumCulled = false;
    return { mesh, material, config };
  }

  function createSplash(config, splashSeed) {
    const rand = mulberry32(splashSeed);
    const positions = new Float32Array(config.count * 3);
    for (let i = 0; i < config.count; i += 1) {
      const angle = rand() * Math.PI * 2;
      const radius = Math.sqrt(rand()) * config.radius;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.22 + rand() * 0.5;
      positions[i * 3 + 2] = Math.sin(angle) * radius - 35;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uOpacity: { value: config.opacity },
        uColor: { value: new THREE.Color('#dff7ff') }
      },
      vertexShader: `
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 2.0 * (240.0 / max(80.0, -mvPosition.z));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        uniform vec3 uColor;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = dot(p, p);
          if (d > 0.25) discard;
          float soft = smoothstep(0.24, 0.02, d);
          gl_FragColor = vec4(uColor, soft * uOpacity);
        }
      `
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return { points, material, config };
  }

  const max = createRainLayerConfig({ rainDensity: 1, windSpeed: 42 });
  const group = new THREE.Group();
  const layers = {
    near: createLayer('near', max.near, seed + 100),
    mid: createLayer('mid', max.mid, seed + 200),
    far: createLayer('far', max.far, seed + 300)
  };
  const splash = createSplash(max.splash, seed + 400);

  group.add(layers.far.mesh, layers.mid.mesh, layers.near.mesh, splash.points);
  return { group, layers, splash };
}

function createRainVeil() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uFlash: { value: 0 },
      uColor: { value: new THREE.Color('#a9c6d3') }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform float uTime;
      uniform float uOpacity;
      uniform float uFlash;
      uniform vec3 uColor;
      varying vec2 vUv;

      float hash21(vec2 p) {
        p = fract(p * vec2(271.1, 113.7));
        p += dot(p, p + 31.3);
        return fract(p.x * p.y);
      }

      void main() {
        float sheet = hash21(vec2(floor(vUv.x * 34.0), floor(vUv.y * 9.0)));
        float streakCoord = fract((vUv.x * 96.0 + vUv.y * 28.0) - uTime * 7.4 + sheet);
        float streak = smoothstep(0.92, 1.0, streakCoord) * (0.42 + sheet * 0.58);
        float xEdge = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
        float yEdge = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.72, 1.0, vUv.y));
        float body = xEdge * yEdge;
        float haze = (0.22 + sheet * 0.26) * body;
        float alpha = (haze + streak * 0.24) * uOpacity * (1.0 + uFlash * 0.55);
        gl_FragColor = vec4(uColor, alpha);
      }
    `
  });

  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(860, 190);
  const far = new THREE.Mesh(geometry, material);
  far.position.set(0, 62, -165);
  far.frustumCulled = false;

  group.add(far);
  group.frustumCulled = false;
  return { group, material };
}

function createFogParticleBank(seed = 1337) {
  const rand = mulberry32(seed + 6603);
  const count = 1700;
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const fogAttrs = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const band = rand();
    const spread = 320 + band * 420;
    positions[i * 3] = (rand() - 0.5) * spread;
    positions[i * 3 + 1] = 5 + Math.pow(rand(), 2.2) * (24 + band * 34);
    positions[i * 3 + 2] = -95 - Math.pow(rand(), 0.68) * (250 + band * 230);
    sizes[i] = 18 + rand() * 44 + band * 32;
    fogAttrs[i * 3] = rand() * Math.PI * 2;
    fogAttrs[i * 3 + 1] = 0.18 + rand() * 0.42;
    fogAttrs[i * 3 + 2] = (rand() - 0.5) * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aFog', new THREE.BufferAttribute(fogAttrs, 3));

  const fogMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uFlash: { value: 0 },
      uColor: { value: new THREE.Color('#6f858b') },
      uWind: { value: new THREE.Vector2(0, 1) }
    },
    vertexShader: `
      uniform float uTime;
      uniform vec2 uWind;
      attribute float aSize;
      attribute vec3 aFog;
      varying float vFogAlpha;
      varying float vFogPhase;
      void main() {
        vFogPhase = aFog.x;
        vFogAlpha = aFog.y;
        vec3 transformed = position;
        float drift = uTime * (0.42 + aFog.y * 0.34);
        transformed.x += uWind.x * drift * (1.4 + aFog.y * 2.2) + sin(uTime * 0.19 + aFog.x) * (2.5 + aFog.y * 2.8);
        transformed.z += uWind.y * drift * (1.2 + aFog.y * 2.0) + cos(uTime * 0.16 + aFog.x * 1.7) * (1.8 + aFog.z * 0.9);
        transformed.y += sin(uTime * 0.13 + aFog.x * 2.0) * (0.9 + aFog.y * 1.3);
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_PointSize = aSize * (360.0 / max(170.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uOpacity;
      uniform float uFlash;
      uniform vec3 uColor;
      varying float vFogAlpha;
      varying float vFogPhase;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = dot(p, p);
        if (d > 0.25) discard;
        float soft = smoothstep(0.25, 0.025, d);
        float grain = 0.68 + 0.32 * sin(vFogPhase * 5.0 + p.x * 17.0 + p.y * 11.0);
        gl_FragColor = vec4(uColor, soft * grain * vFogAlpha * uOpacity * (1.0 + uFlash * 0.18));
      }
    `
  });

  const points = new THREE.Points(geometry, fogMaterial);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(points);
  group.frustumCulled = false;
  return { group, points, fogMaterial };
}

function createRaggedSprayRing(seed = 1337) {
  const rand = mulberry32(seed + 9103);
  const segments = 192;
  const positions = [];
  const randoms = [];
  const indices = [];
  let runningNoise = rand() * Math.PI * 2;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angle = t * Math.PI * 2;
    runningNoise += (rand() - 0.5) * 0.22;
    const longWave = Math.sin(angle * 3 + seed * 0.013) * 0.08;
    const tornEdge = Math.sin(angle * 7 + runningNoise) * 0.07 + (rand() - 0.5) * 0.08;
    const brokenPatch = rand() < 0.08 ? 0.45 + rand() * 0.28 : 1;
    const center = 1 + longWave + tornEdge * 0.55;
    const halfWidth = (0.17 + rand() * 0.1 + Math.abs(tornEdge) * 0.38) * brokenPatch;
    const inner = Math.max(0.45, center - halfWidth);
    const outer = center + halfWidth * (1.35 + rand() * 0.45);
    const y = (rand() - 0.5) * 0.035;

    positions.push(Math.cos(angle) * inner, y, Math.sin(angle) * inner);
    positions.push(Math.cos(angle) * outer, y + 0.015 + rand() * 0.035, Math.sin(angle) * outer);
    randoms.push(brokenPatch, 0);
    randoms.push(brokenPatch * (0.7 + rand() * 0.3), 1);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSpray', new THREE.Float32BufferAttribute(randoms, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uOpacity: { value: 0.25 },
      uColor: { value: new THREE.Color('#d7eef5') }
    },
    vertexShader: `
      attribute vec2 aSpray;
      varying vec2 vSpray;
      void main() {
        vSpray = aSpray;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vSpray;
      void main() {
        float edgeFade = smoothstep(0.0, 0.28, vSpray.y) * (1.0 - smoothstep(0.78, 1.0, vSpray.y));
        float alpha = edgeFade * vSpray.x * uOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

function createRaggedMistPatch(seed = 1337) {
  const rand = mulberry32(seed + 12091);
  const segments = 160;
  const positions = [0, 0.01, 0];
  const mistAttrs = [1, 0];
  const indices = [];
  let edgeNoise = rand() * Math.PI * 2;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angle = t * Math.PI * 2;
    edgeNoise += (rand() - 0.5) * 0.18;
    const lobe =
      0.82 +
      Math.sin(angle * 2.0 + seed * 0.017) * 0.18 +
      Math.sin(angle * 5.0 + edgeNoise) * 0.1 +
      (rand() - 0.5) * 0.1;
    const gap = rand() < 0.11 ? 0.28 + rand() * 0.4 : 1;
    const radius = Math.max(0.45, lobe);
    const y = (rand() - 0.5) * 0.02;

    positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    mistAttrs.push(gap, radius);

    if (i < segments) {
      indices.push(0, i + 1, i + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aMist', new THREE.Float32BufferAttribute(mistAttrs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uOpacity: { value: 0.14 },
      uColor: { value: new THREE.Color('#d8eef4') }
    },
    vertexShader: `
      attribute vec2 aMist;
      varying vec2 vMist;
      void main() {
        vMist = aMist;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vMist;
      void main() {
        float radialFade = 1.0 - smoothstep(0.34, 1.02, vMist.y);
        float alpha = radialFade * vMist.x * uOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

function createCondensationShoulder(seed = 1337) {
  const rand = mulberry32(seed + 15031);
  const count = 1050;
  const positions = new Float32Array(count * 3);
  const alphas = new Float32Array(count);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const heights = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const h = 0.48 + Math.pow(rand(), 0.86) * 0.4;
    const shoulder = Math.exp(-(((h - 0.66) / 0.17) ** 2));
    const crown = Math.exp(-(((h - 0.84) / 0.12) ** 2));
    const arm = Math.floor(rand() * 4);
    const turn =
      h * 7.2 +
      arm / 4 +
      rand() * 0.16 +
      Math.sin(h * 33 + seed * 0.011) * 0.05;
    const angle = turn * Math.PI * 2;
    const radius = 6.8 + shoulder * 11.5 + crown * 6.2 + rand() * 4.4;
    const flatten = 0.68 + rand() * 0.38;
    const shear =
      Math.sin(h * 5.8 + seed * 0.017) * (3.2 + shoulder * 3.6) +
      Math.sin(h * 14.0 + arm) * 1.4;

    positions[i * 3] = Math.cos(angle) * radius + shear;
    positions[i * 3 + 1] = h * 132 + (rand() - 0.5) * (6 + shoulder * 10);
    positions[i * 3 + 2] = Math.sin(angle) * radius * flatten + (rand() - 0.5) * 2.8;
    alphas[i] = 0.06 + shoulder * 0.17 + crown * 0.08 + rand() * 0.05;
    sizes[i] = 8 + shoulder * 9 + crown * 6 + rand() * 9;
    phases[i] = angle;
    heights[i] = h;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aHeightNorm', new THREE.BufferAttribute(heights, 1));

  const shoulderMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.18 },
      uColor: { value: new THREE.Color('#b6c9cd') },
      uWind: { value: new THREE.Vector2(0, 1) }
    },
    vertexShader: `
      uniform float uTime;
      uniform vec2 uWind;
      attribute float aAlpha;
      attribute float aSize;
      attribute float aPhase;
      attribute float aHeightNorm;
      varying float vAlpha;
      varying float vHeight;
      varying float vPhase;
      void main() {
        vAlpha = aAlpha;
        vHeight = aHeightNorm;
        vPhase = aPhase;
        float spin = uTime * (0.28 + (1.0 - aHeightNorm) * 0.42);
        float c = cos(spin);
        float s = sin(spin);
        vec3 transformed = position;
        transformed.xz = mat2(c, -s, s, c) * transformed.xz;
        transformed.xz += uWind * (aHeightNorm * aHeightNorm * 2.6);
        transformed.y += sin(uTime * 1.45 + aPhase) * 0.42;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_PointSize = aSize * (360.0 / max(48.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      varying float vHeight;
      varying float vPhase;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = dot(p, p);
        if (d > 0.25) discard;
        float soft = smoothstep(0.25, 0.018, d);
        float grain = 0.82 + 0.18 * sin(vPhase * 3.0 + vHeight * 19.0);
        vec3 vapor = mix(vec3(0.42, 0.52, 0.55), uColor, 0.6 + vHeight * 0.2);
        gl_FragColor = vec4(vapor, soft * vAlpha * grain * uOpacity);
      }
    `
  });

  const cloud = new THREE.Points(geometry, shoulderMaterial);
  cloud.frustumCulled = false;
  return { cloud, shoulderMaterial };
}

function createLightningBolt() {
  const segments = createLightningSegments({ seed: settings.seed, height: 138, branchCount: 18 });
  const positions = new Float32Array(segments.length * 2 * 3);

  for (let i = 0; i < segments.length; i += 1) {
    const bolt = segments[i];
    const base = i * 6;
    positions[base] = bolt.start.x;
    positions[base + 1] = bolt.start.y;
    positions[base + 2] = bolt.start.z;
    positions[base + 3] = bolt.end.x;
    positions[base + 4] = bolt.end.y;
    positions[base + 5] = bolt.end.z;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const glowMaterial = new THREE.LineBasicMaterial({
    color: '#7ecfff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });
  const coreMaterial = new THREE.LineBasicMaterial({
    color: '#f5fdff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  });

  const group = new THREE.Group();
  const glow = new THREE.LineSegments(geometry, glowMaterial);
  const core = new THREE.LineSegments(geometry.clone(), coreMaterial);

  glow.frustumCulled = false;
  core.frustumCulled = false;
  group.add(glow, core);

  group.frustumCulled = false;
  return { group, coreMaterial, glowMaterial };
}

function createWaterSpout() {
  const group = new THREE.Group();
  const particles = createSpoutParticles({ count: 5600, radius: 11, height: 132, seed: settings.seed });
  const positions = new Float32Array(particles.length * 3);
  const alphas = new Float32Array(particles.length);
  const sizes = new Float32Array(particles.length);
  const phases = new Float32Array(particles.length);
  const heights = new Float32Array(particles.length);
  const kinds = new Float32Array(particles.length);
  const axisBends = new Float32Array(particles.length * 2);
  const vortexWarps = new Float32Array(particles.length);

  for (let i = 0; i < particles.length; i += 1) {
    const p = particles[i];
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;
    alphas[i] = p.alpha;
    sizes[i] = p.size;
    phases[i] = p.phase;
    heights[i] = p.normalizedHeight;
    kinds[i] = p.kind === 'spray' ? 1 : p.kind === 'hammer' ? 0.5 : 0;
    axisBends[i * 2] = p.axisBendX;
    axisBends[i * 2 + 1] = p.axisBendZ;
    vortexWarps[i] = p.vortexWarp;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aHeightNorm', new THREE.BufferAttribute(heights, 1));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  geometry.setAttribute('aAxisBend', new THREE.BufferAttribute(axisBends, 2));
  geometry.setAttribute('aVortexWarp', new THREE.BufferAttribute(vortexWarps, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.6 },
      uColor: { value: new THREE.Color('#9fb5ba') },
      uWind: { value: new THREE.Vector2(0, 1) }
    },
    vertexShader: `
      uniform float uTime;
      uniform vec2 uWind;
      attribute float aAlpha;
      attribute float aSize;
      attribute float aPhase;
      attribute float aHeightNorm;
      attribute float aKind;
      attribute vec2 aAxisBend;
      attribute float aVortexWarp;
      varying float vAlpha;
      varying float vHeight;
      varying float vKind;
      void main() {
        vAlpha = aAlpha;
        vHeight = aHeightNorm;
        vKind = aKind;
        float sprayKind = step(0.75, aKind);
        float hammerKind = 1.0 - step(0.18, abs(aKind - 0.5));
        float spin = uTime * (0.55 + (1.0 - aHeightNorm) * 1.25 + aKind * 0.9);
        float c = cos(spin);
        float s = sin(spin);
        vec3 transformed = position;
        vec2 localShell = transformed.xz - aAxisBend;
        float lowerFlex = smoothstep(0.08, 0.52, aHeightNorm) * (1.0 - smoothstep(0.62, 0.92, aHeightNorm));
        float liveWarp = 1.0 + (aVortexWarp - 1.0) * (0.22 + lowerFlex * 0.26 * sin(uTime * 0.9 + aPhase * 0.31));
        vec2 liveAxis = aAxisBend * (1.0 + sin(uTime * 0.33 + aPhase * 0.17) * 0.08);
        liveAxis += vec2(sin(uTime * 0.41 + aHeightNorm * 8.4), cos(uTime * 0.29 + aPhase * 0.21)) * lowerFlex * (0.42 + sprayKind * 0.14);
        transformed.xz = localShell * liveWarp + liveAxis;
        transformed.xz = mat2(c, -s, s, c) * transformed.xz;
        transformed.y += sin(uTime * 2.4 + aPhase) * (0.22 + sprayKind * 0.18 + hammerKind * 0.12);
        transformed.xz += uWind * (aHeightNorm * aHeightNorm * 4.6 + sprayKind * 1.6 + hammerKind * 0.85);
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        gl_PointSize = aSize * (390.0 / max(45.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vAlpha;
      varying float vHeight;
      varying float vKind;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = dot(p, p);
        if (d > 0.25) discard;
        float soft = smoothstep(0.25, 0.02, d);
        float sprayKind = step(0.75, vKind);
        float hammerKind = 1.0 - step(0.18, abs(vKind - 0.5));
        float lowFade = smoothstep(0.0, 0.07, vHeight);
        float topFade = 1.0 - smoothstep(0.9, 1.0, vHeight) * 0.32;
        vec3 vapor = mix(vec3(0.38, 0.48, 0.52), uColor, 0.45 + vHeight * 0.32 + hammerKind * 0.12);
        float bodyFade = mix(lowFade * topFade, 0.7, sprayKind);
        float alpha = soft * vAlpha * uOpacity * (bodyFade + hammerKind * 0.12);
        gl_FragColor = vec4(vapor, alpha);
      }
    `
  });
  const cloud = new THREE.Points(geometry, material);
  cloud.frustumCulled = false;
  group.add(cloud);

  const shoulderCloud = createCondensationShoulder(settings.seed);
  const shoulder = shoulderCloud.cloud;
  const shoulderMaterial = shoulderCloud.shoulderMaterial;
  group.add(shoulder);

  const sprayRing = createRaggedSprayRing(settings.seed);
  const spray = sprayRing.mesh;
  const sprayMaterial = sprayRing.material;
  spray.position.y = 0.22;
  group.add(spray);

  const mistPatch = createRaggedMistPatch(settings.seed);
  const mist = mistPatch.mesh;
  const mistMaterial = mistPatch.material;
  mist.position.y = 0.18;
  group.add(mist);

  const wallCloudMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uOpacity: { value: 0.18 },
      uColor: { value: new THREE.Color('#15212a') }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5);
        float soft = smoothstep(0.52, 0.12, d);
        float ragged = 0.76 + 0.24 * sin((vUv.x * 17.0 + vUv.y * 11.0) * 3.14159);
        gl_FragColor = vec4(uColor, soft * ragged * uOpacity);
      }
    `
  });
  const wallCloud = new THREE.Mesh(new THREE.CircleGeometry(1, 128), wallCloudMaterial);
  wallCloud.rotation.x = -Math.PI / 2;
  wallCloud.position.y = 128;
  wallCloud.scale.set(42, 42, 42);
  group.add(wallCloud);

  return {
    group,
    cloud,
    material,
    shoulder,
    shoulderMaterial,
    spray,
    sprayMaterial,
    mist,
    mistMaterial,
    wallCloud,
    wallCloudMaterial
  };
}

const cloudShelf = createCloudShelf();
scene.add(cloudShelf.mesh);
cloudShelf.mesh.visible = false;

const rain = createRainField(settings.seed);
scene.add(rain.group);

const rainVeil = createRainVeil();
scene.add(rainVeil.group);

const fogParticles = createFogParticleBank(settings.seed);
scene.add(fogParticles.group);

const lightning = createLightningBolt();
scene.add(lightning.group);

const spout = createWaterSpout();
scene.add(spout.group);

const updateHud = createHudUpdater({
  fpsElement: document.querySelector('#fps-value'),
  seaStateElement: document.querySelector('#sea-state'),
  profileElement: document.querySelector('#storm-profile'),
  vertexElement: document.querySelector('#vertex-count'),
  vertexCount: geometryConfig.vertexCount
});

function applyResolvedSettings(nextSettings) {
  Object.assign(settings, resolveStormSettings(nextSettings));
}

function syncScene({ useProfileDefaults = false } = {}) {
  if (useProfileDefaults) {
    applyResolvedSettings({
      profile: settings.profile,
      weatherIntensity: settings.weatherIntensity,
      seed: settings.seed
    });
  } else {
    applyResolvedSettings(settings);
  }

  waves = createWaveSet(settings);
  updateOceanMaterialWaves(oceanMaterial, waves);
}

function updateWeatherVisuals(state, elapsed) {
  const windRad = (settings.windDirection * Math.PI) / 180;
  const spoutDirectionX = state.waterSpout.directionX ?? Math.cos(windRad);
  const spoutDirectionZ = state.waterSpout.directionZ ?? Math.sin(windRad);

  rain.group.visible = state.rainOpacity > 0.02;
  rain.group.rotation.y = -windRad + Math.PI * 0.36;
  rain.layers.near.mesh.geometry.setDrawRange(0, state.rain.nearCount);
  rain.layers.mid.mesh.geometry.setDrawRange(0, state.rain.midCount);
  rain.layers.far.mesh.geometry.setDrawRange(0, state.rain.farCount);
  rain.layers.near.material.uniforms.uTime.value = elapsed;
  rain.layers.mid.material.uniforms.uTime.value = elapsed;
  rain.layers.far.material.uniforms.uTime.value = elapsed;
  rain.layers.near.material.uniforms.uOpacity.value = state.rain.near.opacity * state.rainOpacity * 0.46;
  rain.layers.mid.material.uniforms.uOpacity.value = state.rain.mid.opacity * state.rainOpacity * 0.38;
  rain.layers.far.material.uniforms.uOpacity.value = state.rain.far.opacity * state.rainOpacity * 0.28;
  rain.layers.near.material.uniforms.uFallSpeed.value = state.rainSpeed * 1.28;
  rain.layers.mid.material.uniforms.uFallSpeed.value = state.rainSpeed * 0.86;
  rain.layers.far.material.uniforms.uFallSpeed.value = state.rainSpeed * 0.55;
  rain.splash.points.rotation.y = elapsed * 0.04;
  rain.splash.points.geometry.setDrawRange(0, state.rain.splashCount);
  rain.splash.material.uniforms.uOpacity.value = state.rain.splash.opacity * state.rainOpacity;

  rainVeil.group.rotation.y = -windRad * 0.12;
  rainVeil.material.uniforms.uTime.value = elapsed;
  rainVeil.material.uniforms.uOpacity.value = state.rainVeilOpacity * 0.38;
  rainVeil.material.uniforms.uFlash.value = state.lightningFlash;

  fogParticles.group.rotation.y = -windRad * 0.04;
  fogParticles.fogMaterial.uniforms.uTime.value = elapsed;
  fogParticles.fogMaterial.uniforms.uOpacity.value = Math.min(0.18, state.fogDensity * 4.2);
  fogParticles.fogMaterial.uniforms.uFlash.value = state.lightningFlash;
  fogParticles.fogMaterial.uniforms.uWind.value.set(spoutDirectionX, spoutDirectionZ);

  lightning.group.position.set(
    state.waterSpout.x + 24,
    0,
    state.waterSpout.z + 30
  );
  lightning.group.scale.setScalar(0.88);
  lightning.group.rotation.y = Math.sin(elapsed * 0.2) * 0.08;
  lightning.coreMaterial.opacity = state.lightning.opacity;
  lightning.glowMaterial.opacity = state.lightning.glow * 0.34;
  lightning.group.visible = state.lightning.opacity + state.lightning.glow > 0.015;

  lightningLight.position.set(
    state.waterSpout.x + 12,
    80,
    state.waterSpout.z - 8
  );
  lightningLight.intensity = state.lightningFlash * 72;

  spout.group.visible = state.waterSpout.visible;
  spout.group.position.set(state.waterSpout.x, 0, state.waterSpout.z);
  spout.group.rotation.y = state.waterSpout.twist + Math.atan2(spoutDirectionX, spoutDirectionZ) * 0.18;
  spout.group.scale.set(
    (state.waterSpout.radius / 11) * 1.16,
    state.waterSpout.height / 132,
    (state.waterSpout.radius / 11) * 1.16
  );
  spout.material.uniforms.uTime.value = elapsed;
  spout.material.uniforms.uOpacity.value = state.waterSpout.opacity * 0.68;
  spout.material.uniforms.uWind.value.set(spoutDirectionX, spoutDirectionZ);
  spout.shoulderMaterial.uniforms.uTime.value = elapsed;
  spout.shoulderMaterial.uniforms.uOpacity.value = state.waterSpout.opacity * 0.56;
  spout.shoulderMaterial.uniforms.uWind.value.set(spoutDirectionX, spoutDirectionZ);

  spout.spray.scale.set(state.sprayRadius, state.sprayRadius, state.sprayRadius);
  spout.sprayMaterial.uniforms.uOpacity.value = state.sprayOpacity * 0.28;
  spout.mist.scale.set(state.sprayRadius * 1.25, state.sprayRadius * 1.25, state.sprayRadius * 1.25);
  spout.mistMaterial.uniforms.uOpacity.value = state.sprayOpacity * 0.055;
  spout.wallCloudMaterial.uniforms.uOpacity.value = state.waterSpout.opacity * 0.3;

  cloudShelf.mesh.rotation.y = elapsed * 0.008;
  cloudShelf.material.opacity = 0;

  horizonMaterial.opacity = 0.26 + state.cloudDarkness * 0.24;
  scene.fog.density = Math.min(state.fogDensity * 0.55, 0.018);
  sun.intensity = Math.max(0.06, (1 - state.cloudDarkness) * 0.8 + state.lightningFlash * 1.6);
  ambient.intensity = 0.18 + (1 - state.cloudDarkness) * 0.18 + state.lightningFlash * 0.9;
}

createControlPanel({
  settings,
  onSettingsChange: () => syncScene(),
  onProfileChange: () => syncScene({ useProfileDefaults: true })
});

syncScene({ useProfileDefaults: true });

const clock = new THREE.Clock();
window.__ocean = { frames: 0, settings, renderer };

function resizeRenderer() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
}

window.addEventListener('resize', resizeRenderer);

function animate() {
  const elapsed = clock.getElapsedTime();
  const state = computeStormRenderState(settings, elapsed);

  oceanMaterial.uniforms.uTime.value = elapsed;
  skyMaterial.uniforms.uTime.value = elapsed;
  updateStormUniforms([oceanMaterial, skyMaterial], state);
  updateWeatherVisuals(state, elapsed);

  horizon.rotation.z = elapsed * 0.01;
  controls.update();
  updateHud(settings, state);
  renderer.render(scene, camera);
  window.__ocean.frames += 1;
  requestAnimationFrame(animate);
}

animate();
