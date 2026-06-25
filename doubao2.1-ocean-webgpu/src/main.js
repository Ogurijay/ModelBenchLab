import * as THREE from 'three/webgpu';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WaterMesh as ReflectiveWaterMesh } from 'three/addons/objects/WaterMesh.js';
import './styles.css';

const viewport = document.querySelector('#viewport');
const statusText = document.querySelector('#statusText');
const gpuStatus = document.querySelector('#gpuStatus');
const fpsLabel = document.querySelector('#fps');

const controlsUi = {
  height: document.querySelector('#height'),
  wind: document.querySelector('#wind'),
  foam: document.querySelector('#foam'),
  heightValue: document.querySelector('#heightValue'),
  windValue: document.querySelector('#windValue'),
  foamValue: document.querySelector('#foamValue'),
  pause: document.querySelector('#pause'),
  reset: document.querySelector('#reset')
};

const params = {
  waveHeight: Number(controlsUi.height.value),
  wind: Number(controlsUi.wind.value),
  foam: Number(controlsUi.foam.value),
  paused: false
};

const SEA_SIZE = 920;
const SEA_SEGMENTS = 132;
const WIND_VECTOR = new THREE.Vector2(1, 0.34).normalize();
const waveSpectrum = createWaveSpectrum(20260622);

if (!WebGPU.isAvailable()) {
  gpuStatus.textContent = 'CPU';
  statusText.textContent = '当前浏览器未开启 WebGPU。建议使用新版 Chrome 或 Edge，并确认硬件加速已启用。';
  viewport.innerHTML = `
    <div class="webgpu-error">
      <div>
        <h2>WebGPU 不可用</h2>
        <p>这个示例使用 Three.js 的 WebGPURenderer，需要浏览器支持 WebGPU。请用新版 Chrome / Edge 打开，或检查浏览器的硬件加速设置。</p>
      </div>
    </div>
  `;
} else {
  startOceanLab();
}

async function startOceanLab() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x071827, 0.011);

  const camera = new THREE.PerspectiveCamera(44, window.innerWidth / window.innerHeight, 0.1, 1400);
  camera.position.set(-46, 9.5, 58);

  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  await renderer.init();
  viewport.appendChild(renderer.domElement);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.minDistance = 18;
  orbit.maxDistance = 150;
  orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.target.set(0, 0, -38);
  orbit.update();

  const normalMaps = await loadWaterNormalMaps();
  const ocean = createOcean(normalMaps);
  const foam = createFoam();
  const seabed = createSeabed();
  const sky = createSkyDome();
  const sun = createSunDisk();

  scene.add(sky, seabed, sun, ocean.group, foam.group);
  addLights(scene);

  let elapsed = 0;
  let frameCount = 0;
  let fpsTimer = 0;
  let lastFrameTime = performance.now();

  statusText.textContent = 'WebGPU WaterMesh · official normals · random wind spectrum';

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    if (!params.paused) {
      elapsed += delta;
      updateOcean(ocean, elapsed);
      updateFoam(foam, elapsed);
    }

    orbit.update();
    renderer.render(scene, camera);

    frameCount += 1;
    fpsTimer += delta;
    if (fpsTimer >= 0.5) {
      fpsLabel.textContent = `${Math.round(frameCount / fpsTimer)} FPS`;
      frameCount = 0;
      fpsTimer = 0;
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  controlsUi.reset.addEventListener('click', () => {
    camera.position.set(-46, 9.5, 58);
    orbit.target.set(0, 0, -38);
    orbit.update();
  });
}

async function loadWaterNormalMaps() {
  const loader = new THREE.TextureLoader();
  const [normalMap0, normalMap1] = await Promise.all([
    loader.loadAsync('/water/Water_1_M_Normal.jpg'),
    loader.loadAsync('/water/Water_2_M_Normal.jpg')
  ]);

  for (const texture of [normalMap0, normalMap1]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
  }

  return { normalMap0, normalMap1 };
}

function createOcean({ normalMap0, normalMap1 }) {
  const geometry = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEGMENTS, SEA_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  normalMap0.wrapS = normalMap0.wrapT = THREE.RepeatWrapping;
  normalMap0.repeat.set(9, 9);
  normalMap0.offset.set(0, 0);

  const baseMesh = new ReflectiveWaterMesh(geometry, {
    waterNormals: normalMap0,
    sunDirection: new THREE.Vector3(0.72, 0.58, -0.36).normalize(),
    sunColor: '#ffe0a2',
    waterColor: '#0b4f63',
    distortionScale: 5.5,
    size: 0.82,
    alpha: 0.96,
    resolutionScale: 0.5
  });
  baseMesh.renderOrder = 2;
  baseMesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(baseMesh);

  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const base = new Float32Array(positions.array.length);
  base.set(positions.array);

  return { group, baseMesh, normalMap: normalMap0, geometry, positions, colors, base, frame: 0 };
}

function updateOcean(ocean, elapsed) {
  const { positions, colors, base, geometry } = ocean;
  const arr = positions.array;
  const heightScale = params.waveHeight;
  const windScale = params.wind;
  ocean.frame += 1;

  for (let index = 0; index < arr.length; index += 3) {
    const x = base[index];
    const z = base[index + 2];
    const sample = sampleOcean(x, z, elapsed, heightScale, windScale);

    arr[index] = x + sample.chopX;
    arr[index + 1] = sample.height;
    arr[index + 2] = z + sample.chopZ;

    const foamBands = smoothstep(
      0.72,
      0.98,
      Math.sin((x * WIND_VECTOR.y - z * WIND_VECTOR.x) * 0.075 + elapsed * (0.85 + params.wind * 0.2)) * 0.5 + 0.5
    );
    const slopeFoam = smoothstep(0.12, 0.42, sample.slope * params.waveHeight);
    const crestFoam = smoothstep(0.14, 0.75, sample.crest);
    const windStreak = smoothstep(
      0.5,
      0.92,
      Math.sin((x * WIND_VECTOR.y - z * WIND_VECTOR.x) * 0.055 + elapsed * 0.7) * 0.5 + 0.5
    );
    const foam = Math.min(1, params.foam * (slopeFoam * 0.26 + crestFoam * 0.54 + foamBands * 0.32) * (0.2 + windStreak * 0.9));
    const depthShade = smoothstep(-2.9, 2.7, sample.height);
    const trough = smoothstep(-4.2, -0.7, -sample.height);
    const r = lerp(0.006, 0.026, depthShade) + foam * 0.92;
    const g = lerp(0.09, 0.27, depthShade) + foam * 0.88 - trough * 0.05;
    const b = lerp(0.18, 0.4, depthShade) + foam * 0.78 - trough * 0.035;

    colors[index] = Math.min(1, r);
    colors[index + 1] = Math.min(1, g);
    colors[index + 2] = Math.min(1, b);
  }

  positions.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
  if (ocean.frame % 2 === 0) {
    geometry.computeVertexNormals();
  }

  ocean.normalMap.offset.x = (elapsed * 0.018 * params.wind) % 1;
  ocean.normalMap.offset.y = (elapsed * 0.006 * params.wind) % 1;
}

function createFoam() {
  const count = 1800;
  const lineCount = 1200;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const base = new Float32Array(count * 2);
  const lineGeometry = new THREE.BufferGeometry();
  const linePositions = new Float32Array(lineCount * 2 * 3);
  const lineColors = new Float32Array(lineCount * 2 * 3);
  const lineSeeds = new Float32Array(lineCount);
  const lineBase = new Float32Array(lineCount * 2);

  const rng = mulberry32(90617);

  for (let i = 0; i < count; i += 1) {
    const alongWind = (rng() - 0.5) * SEA_SIZE;
    const crossWind = (rng() - 0.5) * SEA_SIZE;
    const streak = (rng() - 0.5) * 20;
    const x = WIND_VECTOR.x * alongWind - WIND_VECTOR.y * (crossWind + streak);
    const z = WIND_VECTOR.y * alongWind + WIND_VECTOR.x * (crossWind + streak);

    base[i * 2] = x;
    base[i * 2 + 1] = z;
    seeds[i] = rng();

    positions[i * 3] = x;
    positions[i * 3 + 1] = 0.2;
    positions[i * 3 + 2] = z;

    colors[i * 3] = 0;
    colors[i * 3 + 1] = 0;
    colors[i * 3 + 2] = 0;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    color: '#d8fbff',
    size: 3,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geometry, material);
  points.renderOrder = 8;

  for (let i = 0; i < lineCount; i += 1) {
    const alongWind = (rng() - 0.5) * SEA_SIZE;
    const crossWind = (rng() - 0.5) * SEA_SIZE;
    lineBase[i * 2] = WIND_VECTOR.x * alongWind - WIND_VECTOR.y * crossWind;
    lineBase[i * 2 + 1] = WIND_VECTOR.y * alongWind + WIND_VECTOR.x * crossWind;
    lineSeeds[i] = rng();
  }

  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));

  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.42,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  lines.renderOrder = 12;

  const group = new THREE.Group();
  group.add(points, lines);

  return {
    group,
    points,
    geometry,
    positions,
    colors,
    seeds,
    base,
    lines,
    lineGeometry,
    linePositions,
    lineColors,
    lineSeeds,
    lineBase
  };
}

function updateFoam(foam, elapsed) {
  const positions = foam.geometry.attributes.position.array;
  const colors = foam.geometry.attributes.color.array;
  const foamStrength = params.foam;
  const drift = elapsed * params.wind * 16;

  for (let i = 0; i < positions.length / 3; i += 1) {
    let x = foam.base[i * 2] + WIND_VECTOR.x * drift + Math.sin(elapsed * 0.33 + foam.seeds[i] * 18) * 4;
    let z = foam.base[i * 2 + 1] + WIND_VECTOR.y * drift + Math.cos(elapsed * 0.29 + foam.seeds[i] * 15) * 4;

    x = wrapOceanCoordinate(x);
    z = wrapOceanCoordinate(z);

    const sample = sampleOcean(x, z, elapsed, params.waveHeight, params.wind);
    const crestBand = smoothstep(
      0.78,
      0.99,
      Math.sin((x * WIND_VECTOR.y - z * WIND_VECTOR.x) * 0.105 + elapsed * 1.2 + foam.seeds[i] * 7) * 0.5 + 0.5
    );
    const lane = smoothstep(
      0.62,
      0.98,
      Math.sin((x * WIND_VECTOR.y - z * WIND_VECTOR.x) * 0.09 + elapsed * 0.9 + foam.seeds[i] * 29) * 0.5 + 0.5
    );
    const brokenCrest = smoothstep(0.03, 0.24, sample.slope * params.waveHeight + sample.crest * 0.35 + crestBand * 0.28);
    const windStreak = smoothstep(0.35, 0.95, Math.sin((x * WIND_VECTOR.y - z * WIND_VECTOR.x) * 0.045 + foam.seeds[i] * 22) * 0.5 + 0.5);
    const streakNoise = 0.42 + 0.58 * Math.sin(x * 0.071 + z * 0.023 + foam.seeds[i] * 43);
    const intensity = foamStrength * Math.max(0, streakNoise) * (0.08 + lane * 0.78 + brokenCrest * 0.62) * (0.4 + windStreak * 0.7);

    positions[i * 3] = x;
    positions[i * 3 + 1] = sample.height + 0.16 + intensity * 0.32;
    positions[i * 3 + 2] = z;

    colors[i * 3] = intensity * 0.72;
    colors[i * 3 + 1] = intensity * 0.88;
    colors[i * 3 + 2] = intensity;
  }

  foam.points.material.opacity = 0.38 + foamStrength * 0.52;
  foam.points.material.size = 1.6 + foamStrength * 3.4;
  foam.geometry.attributes.position.needsUpdate = true;
  foam.geometry.attributes.color.needsUpdate = true;

  for (let i = 0; i < foam.lineBase.length / 2; i += 1) {
    let x = foam.lineBase[i * 2] + WIND_VECTOR.x * drift * 1.12;
    let z = foam.lineBase[i * 2 + 1] + WIND_VECTOR.y * drift * 1.12;
    x = wrapOceanCoordinate(x);
    z = wrapOceanCoordinate(z);

    const sample = sampleOcean(x, z, elapsed, params.waveHeight, params.wind);
    const lane = smoothstep(
      0.58,
      0.96,
      Math.sin((x * WIND_VECTOR.y - z * WIND_VECTOR.x) * 0.08 + foam.lineSeeds[i] * 33 + elapsed * 0.8) * 0.5 + 0.5
    );
    const crest = smoothstep(0.05, 0.34, sample.slope * params.waveHeight + sample.crest * 0.45);
    const intensity = foamStrength * Math.min(1, lane * 0.9 + crest * 0.75);
    const length = 1.5 + foam.lineSeeds[i] * 7 * (0.4 + params.wind * 0.28);
    const angle = (foam.lineSeeds[i] - 0.5) * 1.25;
    const dirX = WIND_VECTOR.x * Math.cos(angle) - WIND_VECTOR.y * Math.sin(angle);
    const dirZ = WIND_VECTOR.x * Math.sin(angle) + WIND_VECTOR.y * Math.cos(angle);
    const side = Math.sin(foam.lineSeeds[i] * 41 + elapsed) * 1.8;
    const dx = dirX * length - dirZ * side;
    const dz = dirZ * length + dirX * side;
    const y = sample.height + 0.32;
    const offset = i * 6;
    const colorOffset = i * 6;

    foam.linePositions[offset] = x - dx * 0.5;
    foam.linePositions[offset + 1] = y;
    foam.linePositions[offset + 2] = z - dz * 0.5;
    foam.linePositions[offset + 3] = x + dx * 0.5;
    foam.linePositions[offset + 4] = y;
    foam.linePositions[offset + 5] = z + dz * 0.5;

    foam.lineColors[colorOffset] = intensity;
    foam.lineColors[colorOffset + 1] = intensity;
    foam.lineColors[colorOffset + 2] = intensity * 0.95;
    foam.lineColors[colorOffset + 3] = intensity * 0.55;
    foam.lineColors[colorOffset + 4] = intensity * 0.68;
    foam.lineColors[colorOffset + 5] = intensity;
  }

  foam.lineGeometry.attributes.position.needsUpdate = true;
  foam.lineGeometry.attributes.color.needsUpdate = true;
}

function sampleOcean(x, z, elapsed, heightScale, windScale) {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;
  let chopX = 0;
  let chopZ = 0;
  let crest = 0;

  for (const wave of waveSpectrum) {
    const phase =
      wave.frequency * (wave.direction.x * x + wave.direction.y * z) +
      elapsed * wave.speed * (0.35 + windScale) +
      wave.phase;
    const sin = Math.sin(phase);
    const cos = Math.cos(phase);
    const amplitude = wave.amplitude * heightScale * (0.82 + windScale * wave.windResponse);

    height += sin * amplitude;
    slopeX += cos * amplitude * wave.frequency * wave.direction.x;
    slopeZ += cos * amplitude * wave.frequency * wave.direction.y;
    chopX += cos * amplitude * wave.chop * wave.direction.x;
    chopZ += cos * amplitude * wave.chop * wave.direction.y;
    crest += Math.max(0, sin) * wave.crestWeight;
  }

  return {
    height,
    slope: Math.hypot(slopeX, slopeZ),
    chopX,
    chopZ,
    crest
  };
}

function createWaveSpectrum(seed) {
  const rng = mulberry32(seed);
  const windAngle = Math.atan2(WIND_VECTOR.y, WIND_VECTOR.x);
  const waves = [];

  addWaveBand(waves, rng, windAngle, 7, 70, 220, 0.08, 0.26, 0.72, 0.12);
  addWaveBand(waves, rng, windAngle, 18, 14, 62, 0.07, 0.24, 1.25, 0.24);
  addWaveBand(waves, rng, windAngle, 26, 4.5, 19, 0.026, 0.1, 2.15, 0.34);

  return waves;
}

function addWaveBand(waves, rng, windAngle, count, minLength, maxLength, minAmp, maxAmp, spread, chop) {
  for (let i = 0; i < count; i += 1) {
    const alignment = Math.pow(rng(), 1.9);
    const angle = windAngle + (rng() - 0.5) * spread + Math.sin(i * 12.989) * 0.09;
    const wavelength = lerp(minLength, maxLength, Math.pow(rng(), 1.35));
    const frequency = (Math.PI * 2) / wavelength;
    const gravitySpeed = Math.sqrt(9.81 / frequency) * frequency;
    const amplitude = lerp(minAmp, maxAmp, 1 - alignment) * (0.78 + rng() * 0.42);

    waves.push({
      direction: new THREE.Vector2(Math.cos(angle), Math.sin(angle)).normalize(),
      wavelength,
      frequency,
      amplitude,
      phase: rng() * Math.PI * 2,
      speed: gravitySpeed * (0.42 + rng() * 0.32),
      chop,
      windResponse: 0.22 + alignment * 0.64,
      crestWeight: lerp(0.06, 0.22, 1 - alignment)
    });
  }
}

function createSeabed() {
  const geometry = new THREE.PlaneGeometry(SEA_SIZE * 1.8, SEA_SIZE * 1.8, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: '#0a3f4b',
    transparent: true,
    opacity: 0.72,
    fog: true
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -18;
  return mesh;
}

function wrapOceanCoordinate(value) {
  const half = SEA_SIZE * 0.5;
  return ((((value + half) % SEA_SIZE) + SEA_SIZE) % SEA_SIZE) - half;
}

function smoothstep(edge0, edge1, value) {
  const x = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return x * x * (3 - 2 * x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createSkyDome() {
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#071827');
  gradient.addColorStop(0.42, '#13405a');
  gradient.addColorStop(0.58, '#e59a5d');
  gradient.addColorStop(0.7, '#1b5365');
  gradient.addColorStop(1, '#03101a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = new THREE.SphereGeometry(620, 48, 32);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    fog: false
  });

  return new THREE.Mesh(geometry, material);
}

function createSunDisk() {
  const geometry = new THREE.CircleGeometry(18, 64);
  const material = new THREE.MeshBasicMaterial({
    color: '#ffd391',
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    fog: false
  });
  const sun = new THREE.Mesh(geometry, material);
  sun.position.set(210, 58, -280);
  sun.rotation.y = -0.68;
  return sun;
}

function addLights(scene) {
  const hemiLight = new THREE.HemisphereLight(0x9fdff3, 0x031018, 1.1);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffd39a, 0.72);
  sunLight.position.set(120, 90, -180);
  scene.add(sunLight);

  const rimLight = new THREE.DirectionalLight(0x8eeaff, 0.8);
  rimLight.position.set(-100, 24, 160);
  scene.add(rimLight);
}

function syncControlValues() {
  controlsUi.heightValue.textContent = params.waveHeight.toFixed(2);
  controlsUi.windValue.textContent = params.wind.toFixed(2);
  controlsUi.foamValue.textContent = params.foam.toFixed(2);
}

controlsUi.height.addEventListener('input', (event) => {
  params.waveHeight = Number(event.target.value);
  syncControlValues();
});

controlsUi.wind.addEventListener('input', (event) => {
  params.wind = Number(event.target.value);
  syncControlValues();
});

controlsUi.foam.addEventListener('input', (event) => {
  params.foam = Number(event.target.value);
  syncControlValues();
});

controlsUi.pause.addEventListener('click', () => {
  params.paused = !params.paused;
  controlsUi.pause.textContent = params.paused ? 'Resume' : 'Pause';
  statusText.textContent = params.paused
    ? 'Simulation paused · parameters remain editable'
    : 'WebGPU renderer active · drag to orbit · scroll to zoom';
});

syncControlValues();
