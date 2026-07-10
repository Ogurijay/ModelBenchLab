// 场景编排：渲染器、相机、海面/天空网格、动画循环和参数联动。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createWaveSet, gridForQuality } from './ocean/waves.js';
import { createOceanMaterial, createSkyMaterial, applyWaves, applySun } from './ocean/materials.js';
import { inspectShipMaterials, loadPirateShip, updateShipOnWaves } from './ship/pirateShip.js';
import { createPanel, createHud } from './ui/panel.js';

const params = {
  windSpeed: 12,
  windDirection: 135,
  waveScale: 1,
  choppiness: 0.75,
  foam: 0.7,
  sunElevation: 22,
  sunAzimuth: 270,
  quality: 'medium',
};

const container = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.72;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(9, 6.4, 22);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-7, 1.35, -8);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 8;
controls.maxDistance = 260;
controls.maxPolarAngle = Math.PI * 0.495; // 不允许钻到海面以下

// 海面
const oceanMaterial = createOceanMaterial();
let oceanMesh = null;

function buildOcean(quality) {
  const { size, segments } = gridForQuality(quality);
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  if (oceanMesh) {
    oceanMesh.geometry.dispose();
    oceanMesh.geometry = geometry;
  } else {
    oceanMesh = new THREE.Mesh(geometry, oceanMaterial);
    oceanMesh.frustumCulled = false; // 顶点在 GPU 上位移，禁用包围盒剔除
    scene.add(oceanMesh);
  }
  hud.setVertexCount(geometry.attributes.position.count);
}

// 天空穹顶
const skyMaterial = createSkyMaterial();
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMaterial);
scene.add(sky);

const sunLight = new THREE.DirectionalLight('#fff3d6', 1.75);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 90;
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
scene.add(sunLight);
sunLight.target.position.set(0, 0, 0);
scene.add(sunLight.target);

const hemisphereLight = new THREE.HemisphereLight('#bcd6e6', '#06283d', 0.28);
scene.add(hemisphereLight);
const lanternFill = new THREE.PointLight('#ffc270', 0.55, 18, 2);
lanternFill.position.set(-7, 3.2, -4.5);
scene.add(lanternFill);

function sunDirection(elevationDeg, azimuthDeg) {
  const elev = (elevationDeg * Math.PI) / 180;
  const azim = (azimuthDeg * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(elev) * Math.cos(azim),
    Math.sin(elev),
    Math.cos(elev) * Math.sin(azim),
  ).normalize();
}

function updatePhysicalSunLight() {
  sunLight.position.copy(sunDirection(params.sunElevation, params.sunAzimuth)).multiplyScalar(80);
  sunLight.target.position.set(0, 0, 0);
  sunLight.target.updateMatrixWorld();
}

let activeWaves = [];
let pirateShip = null;

// 参数联动
function rebuildWaves() {
  const waves = createWaveSet({
    windSpeed: params.windSpeed,
    windDirection: params.windDirection,
    choppiness: params.choppiness,
    amplitudeScale: params.waveScale,
    seed: 1337,
  });
  activeWaves = waves;
  applyWaves(oceanMaterial, waves);
  hud.setSeaState(params.windSpeed);
}

const hud = createHud();
createPanel(params, {
  onWavesChanged: rebuildWaves,
  onFoamChanged: () => {
    oceanMaterial.uniforms.uFoamAmount.value = params.foam;
  },
  onSunChanged: () => {
    applySun([oceanMaterial, skyMaterial], params.sunElevation, params.sunAzimuth);
    updatePhysicalSunLight();
  },
  onQualityChanged: () => buildOcean(params.quality),
});

buildOcean(params.quality);
rebuildWaves();
applySun([oceanMaterial, skyMaterial], params.sunElevation, params.sunAzimuth);
updatePhysicalSunLight();
oceanMaterial.uniforms.uFoamAmount.value = params.foam;

loadPirateShip(scene)
  .then((ship) => {
    pirateShip = ship;
    hud.setShipStatus('已加载');
  })
  .catch((error) => {
    console.error('Pirate ship model failed to load:', error);
    hud.setShipStatus('加载失败');
  });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 暴露调试句柄，供自动化浏览器验证读取渲染状态。
window.__ocean = {
  frames: 0,
  params,
  renderer,
  scene,
  get shipLoaded() {
    return Boolean(pirateShip);
  },
  get shipMaterials() {
    return inspectShipMaterials(pirateShip);
  },
};

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  const time = clock.elapsedTime;
  oceanMaterial.uniforms.uTime.value = time;
  updateShipOnWaves(pirateShip, activeWaves, time);
  controls.update();
  hud.tick(delta);
  renderer.render(scene, camera);
  window.__ocean.frames += 1;
});
