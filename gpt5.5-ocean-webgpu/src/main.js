import * as THREE from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  clamp,
  cos,
  dot,
  float,
  length,
  max,
  mix,
  mx_noise_float,
  normalize,
  positionLocal,
  pow,
  reflect,
  sin,
  smoothstep,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import './styles.css';

const viewport = document.querySelector('#viewport');
const loading = document.querySelector('#loading');
const gpuStatus = document.querySelector('#gpuStatus');
const weatherLabel = document.querySelector('#weatherLabel');
const fpsLabel = document.querySelector('#fpsLabel');
const vertexLabel = document.querySelector('#vertexLabel');
const perfState = document.querySelector('#perfState');
const seedLabel = document.querySelector('#seedLabel');
const statusText = document.querySelector('#statusText');
const statusDot = document.querySelector('.status-line__dot');

const ui = {
  wind: document.querySelector('#wind'),
  swell: document.querySelector('#swell'),
  rain: document.querySelector('#rain'),
  lightning: document.querySelector('#lightning'),
  sun: document.querySelector('#sun'),
  windValue: document.querySelector('#windValue'),
  swellValue: document.querySelector('#swellValue'),
  rainValue: document.querySelector('#rainValue'),
  lightningValue: document.querySelector('#lightningValue'),
  sunValue: document.querySelector('#sunValue'),
  pause: document.querySelector('#pauseButton'),
  reset: document.querySelector('#resetButton'),
  seed: document.querySelector('#seedButton'),
  windMeter: document.querySelector('#windMeter'),
  rainMeter: document.querySelector('#rainMeter'),
  stormMeter: document.querySelector('#stormMeter'),
  weatherButtons: [...document.querySelectorAll('.weather-button')]
};

const presets = {
  calm: {
    label: 'Calm',
    wind: 0.48,
    swell: 0.62,
    rain: 0.0,
    lightning: 0.0,
    storm: 0.04,
    cloud: 0.14,
    sun: 31,
    exposure: 0.78,
    fog: 0.0038
  },
  rain: {
    label: 'Rain',
    wind: 0.95,
    swell: 1.12,
    rain: 0.58,
    lightning: 0.08,
    storm: 0.34,
    cloud: 0.62,
    sun: 18,
    exposure: 0.72,
    fog: 0.0072
  },
  storm: {
    label: 'Storm',
    wind: 1.35,
    swell: 1.55,
    rain: 0.7,
    lightning: 0.52,
    storm: 0.64,
    cloud: 0.82,
    sun: 11,
    exposure: 0.66,
    fog: 0.0084
  },
  squall: {
    label: 'Squall',
    wind: 2.02,
    swell: 2.32,
    rain: 0.96,
    lightning: 0.78,
    storm: 0.94,
    cloud: 1.0,
    sun: 6,
    exposure: 0.58,
    fog: 0.0105
  }
};

const params = {
  weather: 'storm',
  wind: presets.storm.wind,
  swell: presets.storm.swell,
  rain: presets.storm.rain,
  lightning: presets.storm.lightning,
  storm: presets.storm.storm,
  cloud: presets.storm.cloud,
  sun: presets.storm.sun,
  exposure: presets.storm.exposure,
  fog: presets.storm.fog,
  paused: false
};

const SEA_SIZE = 980;
const SEA_SEGMENTS = 340;
const WIND_VECTOR = new THREE.Vector2(1, 0.32).normalize();
const GRAVITY = 9.81;
const WAVE_COUNT = 11;

const uTime = uniform(0);
const uSwell = uniform(params.swell);
const uWind = uniform(params.wind);
const uChop = uniform(1.0);
const uFoam = uniform(0.86);
const uStorm = uniform(params.storm);
const uRain = uniform(params.rain);
const uSunDir = uniform(new THREE.Vector3());
const uSunGlow = uniform(0.42);

let waveSeed = 1;
let waveBank = createWaveBank(waveSeed, WAVE_COUNT);
let renderer;
let scene;
let camera;
let orbit;
let oceanMesh;
let weatherFx;
let buoy;
let lightningState = { flash: 0, next: 0.8 };

if (!WebGPU.isAvailable()) {
  showWebGPUError();
} else {
  start().catch((error) => {
    console.error(error);
    showWebGPUError(error && error.message ? error.message : String(error));
  });
}

async function start() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x071520, params.fog);

  camera = new THREE.PerspectiveCamera(47, window.innerWidth / window.innerHeight, 0.1, 2200);
  camera.position.set(-68, 15, 78);

  renderer = new THREE.WebGPURenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = params.exposure;
  await renderer.init();
  viewport.appendChild(renderer.domElement);

  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.065;
  orbit.minDistance = 18;
  orbit.maxDistance = 240;
  orbit.maxPolarAngle = Math.PI * 0.49;
  orbit.target.set(0, 4.5, -138);
  orbit.update();

  oceanMesh = createOcean();
  weatherFx = createWeatherFx();
  buoy = createBuoy();

  scene.add(createSkyDome(), createSunDisk(), oceanMesh, weatherFx.group, buoy.group);
  addLights();
  updateSunDirection();
  applyPreset(params.weather, true);
  syncUi();

  gpuStatus.textContent = 'WebGPU';
  perfState.textContent = 'active';
  vertexLabel.textContent = `${Math.round(((SEA_SEGMENTS + 1) * (SEA_SEGMENTS + 1)) / 1000)}k`;
  loading.classList.add('is-hidden');
  statusText.textContent = 'WebGPU renderer active';

  let last = performance.now();
  let frames = 0;
  let fpsTimer = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (!params.paused) {
      uTime.value += delta;
      updateWeather(delta);
      updateBuoy();
    }

    orbit.update();
    renderer.render(scene, camera);

    frames += 1;
    fpsTimer += delta;
    if (fpsTimer >= 0.5) {
      fpsLabel.textContent = `${Math.round(frames / fpsTimer)} FPS`;
      frames = 0;
      fpsTimer = 0;
    }
  });

  window.addEventListener('resize', resize, { passive: true });
}

function createOcean() {
  const geometry = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEGMENTS, SEA_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, createOceanMaterial(waveBank));
  mesh.frustumCulled = false;
  return mesh;
}

function createOceanMaterial(waves) {
  const totalAmp = waves.reduce((sum, wave) => sum + wave.amp, 0);
  const material = new THREE.MeshBasicNodeMaterial();

  material.positionNode = Fn(() => {
    const { offset } = fieldNodes(waves, positionLocal.xz, false);
    return vec3(positionLocal.x.add(offset.x), offset.y, positionLocal.z.add(offset.z));
  })();

  material.colorNode = Fn(() => {
    const coord = positionLocal.xz;
    const { offset, normal } = fieldNodes(waves, coord, true);
    const worldPos = vec3(coord.x.add(offset.x), offset.y, coord.y.add(offset.z));
    const viewDir = normalize(cameraPosition.sub(worldPos));
    const sunDir = normalize(uSunDir);

    const fresnel = pow(clamp(float(1).sub(max(dot(normal, viewDir), 0)), 0, 1), 5).mul(0.94).add(0.035);
    const heightNorm = clamp(worldPos.y.div(uSwell.mul(totalAmp)).mul(0.5).add(0.5), 0, 1);

    const calmDeep = vec3(0.004, 0.06, 0.12);
    const stormDeep = vec3(0.006, 0.052, 0.082);
    const calmCrest = vec3(0.02, 0.24, 0.31);
    const stormCrest = vec3(0.05, 0.18, 0.23);
    const waterDeep = mix(calmDeep, stormDeep, uStorm);
    const waterCrest = mix(calmCrest, stormCrest, uStorm);
    const water = mix(waterDeep, waterCrest, smoothstep(0.18, 0.86, heightNorm));
    const sky = skyColorFn(reflect(viewDir.mul(-1), normal));

    let color = mix(water, sky, fresnel.mul(float(0.64).sub(uStorm.mul(0.24))));

    const halfVector = normalize(sunDir.add(viewDir));
    const spec = pow(max(dot(normal, halfVector), 0), 160).mul(float(1.28).sub(uStorm.mul(0.42))).mul(uSunGlow);
    color = color.add(vec3(1.0, 0.82, 0.52).mul(spec));

    const sprayNoise = mx_noise_float(vec3(worldPos.x.mul(0.044), worldPos.z.mul(0.044), uTime.mul(0.11))).mul(0.5).add(0.5);
    const fineNoise = mx_noise_float(vec3(worldPos.x.mul(0.18), worldPos.z.mul(0.18), uTime.mul(0.18))).mul(0.5).add(0.5);
    const crestFoam = smoothstep(0.58, 0.92, heightNorm);
    const slopeFoam = smoothstep(0.16, 0.72, float(1).sub(normal.y));
    const rainFoam = uRain.mul(0.22).mul(sprayNoise);
    const foam = clamp(crestFoam.add(slopeFoam).mul(sprayNoise).mul(fineNoise.mul(0.62).add(0.38)).add(rainFoam), 0, 1).mul(uFoam);
    color = mix(color, vec3(0.86, 0.96, 0.98), foam);

    const dist = length(cameraPosition.sub(worldPos));
    const fog = smoothstep(130, 780, dist).mul(float(0.55).add(uStorm.mul(0.34)));
    const fogColor = mix(vec3(0.48, 0.66, 0.72), vec3(0.2, 0.29, 0.34), uStorm);
    color = mix(color, fogColor, fog);

    return vec4(color, 1.0);
  })();

  return material;
}

function fieldNodes(waves, coord, withNormal) {
  const invCount = 1 / waves.length;
  const dx = float(0).toVar();
  const dy = float(0).toVar();
  const dz = float(0).toVar();
  const nx = withNormal ? float(0).toVar() : null;
  const ny = withNormal ? float(0).toVar() : null;
  const nz = withNormal ? float(0).toVar() : null;

  for (const wave of waves) {
    const phase = dot(vec2(wave.kx, wave.kz), coord)
      .add(uTime.mul(wave.omega).mul(uWind))
      .add(wave.phase);
    const c = cos(phase);
    const s = sin(phase);

    dx.addAssign(uSwell.mul(uChop).mul(c).mul(wave.hx));
    dz.addAssign(uSwell.mul(uChop).mul(c).mul(wave.hz));
    dy.addAssign(uSwell.mul(s).mul(wave.amp));

    if (withNormal) {
      nx.addAssign(uSwell.mul(c).mul(wave.kx * wave.amp));
      nz.addAssign(uSwell.mul(c).mul(wave.kz * wave.amp));
      ny.addAssign(uSwell.mul(uChop).mul(s).mul(invCount));
    }
  }

  return {
    offset: vec3(dx, dy, dz),
    normal: withNormal
      ? normalize(vec3(nx.mul(-1), max(float(1).sub(ny), 0.05), nz.mul(-1)))
      : null
  };
}

const skyColorFn = Fn(([dir]) => {
  const d = normalize(dir);
  const altitude = clamp(d.y.mul(0.5).add(0.5), 0, 1);
  const calmHorizon = vec3(0.46, 0.66, 0.76);
  const stormHorizon = vec3(0.14, 0.20, 0.26);
  const calmZenith = vec3(0.035, 0.13, 0.24);
  const stormZenith = vec3(0.012, 0.025, 0.045);
  const horizon = mix(calmHorizon, stormHorizon, uStorm);
  const zenith = mix(calmZenith, stormZenith, uStorm);
  const base = mix(horizon, zenith, smoothstep(0.05, 0.72, altitude));
  const sunAmount = max(dot(d, normalize(uSunDir)), 0);
  const glow = pow(sunAmount, 70).mul(1.9).add(pow(sunAmount, 8).mul(0.34)).mul(uSunGlow);
  return base.add(vec3(1.0, 0.74, 0.42).mul(glow));
});

function createSkyDome() {
  const geometry = new THREE.SphereGeometry(1500, 56, 28);
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  material.colorNode = vec4(skyColorFn(normalize(positionLocal)), 1.0);
  return new THREE.Mesh(geometry, material);
}

function createSunDisk() {
  const group = new THREE.Group();
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(18, 64),
    new THREE.MeshBasicMaterial({
      color: '#ffd28d',
      transparent: true,
      opacity: 0.74,
      depthWrite: false,
      fog: false
    })
  );
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(52, 64),
    new THREE.MeshBasicMaterial({
      color: '#ffbd6e',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      fog: false
    })
  );
  disk.position.set(0, 0, 0.5);
  group.add(halo, disk);
  group.position.set(258, 72, -330);
  group.rotation.y = -0.66;
  return group;
}

function addLights() {
  scene.add(new THREE.HemisphereLight(0xaadff0, 0x031018, 1.15));

  const sun = new THREE.DirectionalLight(0xffcf94, 1.4);
  sun.position.set(130, 92, -170);
  scene.add(sun);

  const stormRim = new THREE.DirectionalLight(0x7eeeff, 0.55);
  stormRim.position.set(-140, 22, 130);
  scene.add(stormRim);
}

function createWeatherFx() {
  const group = new THREE.Group();
  const rain = createRainField();
  const clouds = createCloudLayer();
  const mist = createMistLayer();
  const lightning = createLightningLayer();
  group.add(clouds.group, mist.group, rain.lines, lightning.group);
  return { group, rain, clouds, mist, lightning };
}

function createRainField() {
  const count = 1600;
  const positions = new Float32Array(count * 2 * 3);
  const seeds = new Float32Array(count * 4);
  const geometry = new THREE.BufferGeometry();

  for (let i = 0; i < count; i += 1) {
    seeds[i * 4] = (Math.random() - 0.5) * 520;
    seeds[i * 4 + 1] = Math.random() * 160 + 28;
    seeds[i * 4 + 2] = (Math.random() - 0.5) * 520;
    seeds[i * 4 + 3] = 0.72 + Math.random() * 0.92;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: '#a8ecff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 20;
  return { lines, positions, seeds, count };
}

function createCloudLayer() {
  const group = new THREE.Group();
  const materials = [];

  for (let i = 0; i < 5; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: i % 2 ? '#8ea6b0' : '#5f7480',
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
    const geometry = createWeatherBandGeometry(620 + i * 86, 58 + i * 9, 94017 + i * 97, 34);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(-190 + i * 100, 76 + i * 10, -360 - i * 30);
    mesh.rotation.x = -0.12;
    mesh.userData.baseX = mesh.position.x;
    mesh.userData.speed = 4 + i * 1.4;
    group.add(mesh);
    materials.push(material);
  }

  return { group, materials };
}

function createMistLayer() {
  const group = new THREE.Group();

  for (let i = 0; i < 4; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: i % 2 ? '#b6d5da' : '#85aeb8',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false
    });
    const mesh = new THREE.Mesh(createWeatherBandGeometry(560, 34, 77031 + i * 51, 26), material);
    mesh.position.set(-250 + i * 170, 19 + i * 2, -190 - i * 64);
    mesh.rotation.x = -0.04;
    mesh.userData.baseX = mesh.position.x;
    mesh.userData.speed = 8 + i * 2;
    group.add(mesh);
  }

  return { group };
}

function createWeatherBandGeometry(width, height, seed, segments) {
  const rng = mulberry32(seed);
  const positions = [];
  const indices = [];
  const phaseA = rng() * Math.PI * 2;
  const phaseB = rng() * Math.PI * 2;

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const x = (t - 0.5) * width;
    const sag = Math.sin(t * Math.PI * 2 + phaseA) * height * 0.18;
    const detail = Math.sin(t * Math.PI * 9 + phaseB) * height * 0.08;
    const lower = -height * 0.36 + sag + detail + (rng() - 0.5) * height * 0.1;
    const upper = height * 0.52 + Math.sin(t * Math.PI * 5 + phaseB) * height * 0.2 + (rng() - 0.5) * height * 0.18;
    positions.push(x, upper, 0, x, lower, 0);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createLightningLayer() {
  const group = new THREE.Group();
  const bolts = [];
  const flashLight = new THREE.PointLight(0xaeefff, 0, 720, 2);
  flashLight.position.set(0, 80, -230);
  group.add(flashLight);

  for (let i = 0; i < 3; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
    const material = new THREE.LineBasicMaterial({
      color: i === 0 ? '#f4fdff' : '#9feaff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 30;
    group.add(line);
    bolts.push(line);
  }

  return { group, bolts, flashLight };
}

function createBuoy() {
  const group = new THREE.Group();
  group.position.set(12, 1.2, -28);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 2.1, 2.2, 28),
    new THREE.MeshStandardMaterial({
      color: '#ff9d3d',
      roughness: 0.5,
      metalness: 0.12
    })
  );
  body.position.y = 0.2;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.05, 0.16, 12, 44),
    new THREE.MeshStandardMaterial({
      color: '#e8f7fb',
      roughness: 0.42,
      metalness: 0.06
    })
  );
  ring.rotation.x = Math.PI * 0.5;
  ring.position.y = 0.98;

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 4.0, 12),
    new THREE.MeshStandardMaterial({
      color: '#253744',
      roughness: 0.35,
      metalness: 0.48
    })
  );
  mast.position.y = 3.2;

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 18, 12),
    new THREE.MeshBasicMaterial({ color: '#ffde91' })
  );
  beacon.position.y = 5.35;

  const beaconLight = new THREE.PointLight(0xffc66e, 0.8, 28, 2.2);
  beaconLight.position.y = 5.35;

  group.add(body, ring, mast, beacon, beaconLight);
  return { group, beacon, beaconLight };
}

function updateWeather(delta) {
  const time = uTime.value;
  updateRain(time);
  updateClouds(time);
  updateMist(time);
  updateLightning(delta);
}

function updateRain(time) {
  const { positions, seeds, count, lines } = weatherFx.rain;
  const rainAmount = params.rain;
  const slant = params.wind * 0.58 + params.storm * 0.4;
  const lineLength = 10 + rainAmount * 18;

  for (let i = 0; i < count; i += 1) {
    const x0 = seeds[i * 4] + Math.sin(time * 0.24 + i) * 5;
    const speed = seeds[i * 4 + 3] * (58 + params.wind * 28 + rainAmount * 34);
    const y0 = wrapHeight(seeds[i * 4 + 1] - time * speed);
    const z0 = seeds[i * 4 + 2] + time * params.wind * 18;
    const offset = i * 6;

    positions[offset] = wrapOceanCoordinate(x0);
    positions[offset + 1] = y0;
    positions[offset + 2] = wrapOceanCoordinate(z0);
    positions[offset + 3] = wrapOceanCoordinate(x0 - slant * 3.8);
    positions[offset + 4] = y0 - lineLength;
    positions[offset + 5] = wrapOceanCoordinate(z0 - slant * 1.1);
  }

  lines.material.opacity = 0.04 + rainAmount * 0.54;
  lines.geometry.attributes.position.needsUpdate = true;
}

function updateClouds(time) {
  const cloudStrength = params.cloud;
  weatherFx.clouds.group.children.forEach((cloud, index) => {
    cloud.position.x = cloud.userData.baseX + Math.sin(time * 0.08 + index) * 12 + time * cloud.userData.speed * 0.16;
    cloud.material.opacity = (0.1 + cloudStrength * 0.38) * (index % 2 ? 0.86 : 1.0);
    cloud.material.color.set(cloudStrength > 0.7 ? '#71838d' : '#9db7c0');
  });
}

function updateMist(time) {
  weatherFx.mist.group.children.forEach((mist, index) => {
    mist.position.x = mist.userData.baseX + Math.sin(time * 0.18 + index * 2) * 18 + time * mist.userData.speed * 0.08;
    mist.material.opacity = 0.06 + params.rain * 0.12 + params.storm * 0.16;
  });
}

function updateLightning(delta) {
  const layer = weatherFx.lightning;
  lightningState.flash -= delta;
  lightningState.next -= delta;

  if (lightningState.next <= 0 && Math.random() < 0.45 + params.lightning * 0.55) {
    triggerLightning();
    lightningState.flash = 0.08 + Math.random() * 0.12;
    lightningState.next = 1.4 + Math.random() * (4.0 - params.lightning * 2.5);
  }

  const intensity = Math.max(0, lightningState.flash / 0.18) * params.lightning;
  layer.flashLight.intensity = intensity * 14;
  layer.bolts.forEach((bolt, index) => {
    bolt.material.opacity = intensity * (index === 0 ? 0.95 : 0.36);
  });
}

function triggerLightning() {
  const baseX = -130 + Math.random() * 260;
  const baseZ = -340 - Math.random() * 80;
  weatherFx.lightning.flashLight.position.set(baseX, 78, baseZ + 80);

  weatherFx.lightning.bolts.forEach((bolt, boltIndex) => {
    const positions = bolt.geometry.attributes.position.array;
    let x = baseX + (boltIndex - 1) * 10;
    let y = 124 - boltIndex * 8;
    const z = baseZ + boltIndex * 16;

    for (let i = 0; i < positions.length / 3; i += 1) {
      const t = i / (positions.length / 3 - 1);
      x += (Math.random() - 0.5) * (6 + t * 18);
      y -= 7 + Math.random() * 6;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z + Math.sin(t * 7) * 10;
    }

    bolt.geometry.attributes.position.needsUpdate = true;
  });
}

function updateBuoy() {
  const x = buoy.group.position.x;
  const z = buoy.group.position.z;
  const sample = sampleOcean(x, z, uTime.value);
  buoy.group.position.y = sample.height + 1.25;
  buoy.group.rotation.z = THREE.MathUtils.clamp(sample.slopeX * 0.32, -0.28, 0.28);
  buoy.group.rotation.x = THREE.MathUtils.clamp(sample.slopeZ * 0.32, -0.28, 0.28);
  const pulse = Math.sin(uTime.value * 5.0) * 0.5 + 0.5;
  buoy.beacon.material.color.set(pulse > 0.72 ? '#fff1bd' : '#ffbd6e');
  buoy.beaconLight.intensity = 0.25 + pulse * 1.2 + lightningState.flash * 6;
}

function createCloudTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.34, 'rgba(255,255,255,0.62)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  for (let i = 0; i < 58; i += 1) {
    const x = Math.random() * canvas.width;
    const y = 36 + Math.random() * 94;
    const r = 28 + Math.random() * 82;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.8, r * 0.56, Math.random() * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createMistTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, 'rgba(255,255,255,0)');
  gradient.addColorStop(0.48, 'rgba(255,255,255,0.62)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createWaveBank(seed, count) {
  const rng = mulberry32(seed);
  const windAngle = Math.atan2(WIND_VECTOR.y, WIND_VECTOR.x) + (rng() - 0.5) * 0.38;
  const maxLength = 210;
  const minLength = 2.8;
  const raw = [];

  for (let i = 0; i < count; i += 1) {
    const t = (i + rng() * 0.72) / count;
    const lengthValue = maxLength * Math.pow(minLength / maxLength, t);
    const k = (Math.PI * 2) / lengthValue;
    const omega = Math.sqrt(GRAVITY * k) * (0.82 + rng() * 0.36);
    const spread = rng() * 2 - 1;
    const angle = windAngle + spread * Math.abs(spread) * 1.24;
    const amp = Math.pow(lengthValue / maxLength, 0.6) * (0.82 + rng() * 0.42);
    raw.push({
      dx: Math.cos(angle),
      dz: Math.sin(angle),
      k,
      omega,
      amp,
      phase: rng() * Math.PI * 2
    });
  }

  const total = raw.reduce((sum, wave) => sum + wave.amp, 0);
  const target = 3.1;
  return raw.map((wave) => ({
    kx: wave.dx * wave.k,
    kz: wave.dz * wave.k,
    omega: wave.omega,
    phase: wave.phase,
    amp: (wave.amp / total) * target,
    hx: wave.dx / (wave.k * count),
    hz: wave.dz / (wave.k * count)
  }));
}

function sampleOcean(x, z, time) {
  let height = 0;
  let slopeX = 0;
  let slopeZ = 0;

  for (const wave of waveBank) {
    const phase = wave.kx * x + wave.kz * z + time * wave.omega * params.wind + wave.phase;
    const s = Math.sin(phase);
    const c = Math.cos(phase);
    height += s * wave.amp * params.swell;
    slopeX += c * wave.kx * wave.amp * params.swell;
    slopeZ += c * wave.kz * wave.amp * params.swell;
  }

  return { height, slopeX, slopeZ };
}

function applyPreset(name, silent = false) {
  const preset = presets[name];
  if (!preset) return;

  Object.assign(params, preset, { weather: name });
  updateUniforms();
  syncUi();

  if (!silent) {
    statusText.textContent = `${preset.label} weather active`;
  }
}

function updateUniforms() {
  uWind.value = params.wind;
  uSwell.value = params.swell;
  uRain.value = params.rain;
  uStorm.value = params.storm;
  uChop.value = 0.72 + params.storm * 0.58 + params.wind * 0.12;
  uFoam.value = 0.38 + params.swell * 0.18 + params.storm * 0.42 + params.rain * 0.16;
  uSunGlow.value = Math.max(0.04, (1 - params.storm * 0.75) * (params.sun / 42));

  updateSunDirection();

  if (renderer) {
    renderer.toneMappingExposure = params.exposure;
  }
  if (scene && scene.fog) {
    scene.fog.density = params.fog;
    scene.fog.color.set(params.storm > 0.6 ? 0x18242c : 0x31525d);
  }
}

function updateSunDirection() {
  const elevation = THREE.MathUtils.degToRad(params.sun);
  const azimuth = THREE.MathUtils.degToRad(-38);
  uSunDir.value
    .set(Math.cos(elevation) * Math.cos(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.sin(azimuth))
    .normalize();
}

function syncUi() {
  ui.wind.value = String(params.wind);
  ui.swell.value = String(params.swell);
  ui.rain.value = String(params.rain);
  ui.lightning.value = String(params.lightning);
  ui.sun.value = String(params.sun);

  ui.windValue.textContent = params.wind.toFixed(2);
  ui.swellValue.textContent = params.swell.toFixed(2);
  ui.rainValue.textContent = params.rain.toFixed(2);
  ui.lightningValue.textContent = params.lightning.toFixed(2);
  ui.sunValue.textContent = `${Math.round(params.sun)}°`;
  weatherLabel.textContent = presets[params.weather].label;

  ui.weatherButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.weather === params.weather);
  });

  for (const input of [ui.wind, ui.swell, ui.rain, ui.lightning, ui.sun]) {
    fillRange(input);
  }

  ui.windMeter.style.setProperty('--meter', `${Math.min(100, (params.wind / 2.4) * 100)}%`);
  ui.rainMeter.style.setProperty('--meter', `${params.rain * 100}%`);
  ui.stormMeter.style.setProperty('--meter', `${params.storm * 100}%`);
  seedLabel.textContent = String(waveSeed);
}

function fillRange(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const percentage = ((value - min) / (max - min)) * 100;
  input.style.background = `linear-gradient(90deg, var(--cyan) ${percentage}%, rgba(155, 215, 232, 0.18) ${percentage}%)`;
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function regenerateSea() {
  waveSeed = (Math.imul(waveSeed, 1664525) + 1013904223) >>> 0;
  waveBank = createWaveBank(waveSeed, WAVE_COUNT);
  const oldMaterial = oceanMesh.material;
  oceanMesh.material = createOceanMaterial(waveBank);
  oldMaterial.dispose();
  seedLabel.textContent = String(waveSeed);
  statusText.textContent = `new wave seed ${waveSeed}`;
}

function resetView() {
  camera.position.set(-68, 15, 78);
  orbit.target.set(0, 4.5, -138);
  orbit.update();
  statusText.textContent = 'camera reset';
}

function showWebGPUError(detail = '') {
  loading.classList.add('is-hidden');
  gpuStatus.textContent = 'Unavailable';
  perfState.textContent = 'blocked';
  statusText.textContent = 'WebGPU unavailable';
  statusDot.classList.add('is-error');
  viewport.innerHTML = `
    <div class="webgpu-error">
      <div class="webgpu-error__card">
        <h2>WebGPU 不可用</h2>
        <p>
          这个版本使用 Three.js <code>WebGPURenderer</code> 和 TSL 节点着色器，需要新版 Chrome 或 Edge，并开启硬件加速。
          ${detail ? `<br><br>${escapeHtml(detail)}` : ''}
        </p>
      </div>
    </div>`;
}

function wrapOceanCoordinate(value) {
  const half = SEA_SIZE * 0.5;
  return ((((value + half) % SEA_SIZE) + SEA_SIZE) % SEA_SIZE) - half;
}

function wrapHeight(value) {
  return ((((value + 12) % 170) + 170) % 170) + 8;
}

function mulberry32(seed) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

ui.weatherButtons.forEach((button) => {
  button.addEventListener('click', () => applyPreset(button.dataset.weather));
});

[
  ['wind', 'windValue', (value) => {
    params.wind = value;
    params.storm = Math.max(params.storm, Math.max(0, (value - 1.15) / 1.5) * 0.52);
  }],
  ['swell', 'swellValue', (value) => {
    params.swell = value;
  }],
  ['rain', 'rainValue', (value) => {
    params.rain = value;
  }],
  ['lightning', 'lightningValue', (value) => {
    params.lightning = value;
  }],
  ['sun', 'sunValue', (value) => {
    params.sun = value;
  }]
].forEach(([inputKey, outputKey, apply]) => {
  const input = ui[inputKey];
  input.addEventListener('input', () => {
    const value = Number(input.value);
    apply(value);
    ui[outputKey].textContent = inputKey === 'sun' ? `${Math.round(value)}°` : value.toFixed(2);
    fillRange(input);
    updateUniforms();
    syncUi();
    statusText.textContent = 'custom weather mix';
  });
});

ui.pause.addEventListener('click', () => {
  params.paused = !params.paused;
  ui.pause.textContent = params.paused ? 'Resume' : 'Pause';
  perfState.textContent = params.paused ? 'paused' : 'active';
  statusText.textContent = params.paused ? 'simulation paused' : 'WebGPU renderer active';
});

ui.reset.addEventListener('click', resetView);
ui.seed.addEventListener('click', regenerateSea);
