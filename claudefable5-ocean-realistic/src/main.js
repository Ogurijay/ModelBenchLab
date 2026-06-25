// 场景编排：渲染器、相机、海面/天空网格、动画循环和参数联动。

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWaveSet, gridForQuality } from './ocean/waves.js';
import { createOceanMaterial, createSkyMaterial, applyWaves, applySun } from './ocean/materials.js';
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
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 9, 38);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, -10);
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

// 参数联动
function rebuildWaves() {
  const waves = createWaveSet({
    windSpeed: params.windSpeed,
    windDirection: params.windDirection,
    choppiness: params.choppiness,
    amplitudeScale: params.waveScale,
    seed: 1337,
  });
  applyWaves(oceanMaterial, waves);
  hud.setSeaState(params.windSpeed);
}

const hud = createHud();
createPanel(params, {
  onWavesChanged: rebuildWaves,
  onFoamChanged: () => {
    oceanMaterial.uniforms.uFoamAmount.value = params.foam;
  },
  onSunChanged: () => applySun([oceanMaterial, skyMaterial], params.sunElevation, params.sunAzimuth),
  onQualityChanged: () => buildOcean(params.quality),
});

buildOcean(params.quality);
rebuildWaves();
applySun([oceanMaterial, skyMaterial], params.sunElevation, params.sunAzimuth);
oceanMaterial.uniforms.uFoamAmount.value = params.foam;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 暴露调试句柄，供自动化浏览器验证读取渲染状态。
window.__ocean = { frames: 0, params, renderer };

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();
  oceanMaterial.uniforms.uTime.value = clock.elapsedTime;
  controls.update();
  hud.tick(delta);
  renderer.render(scene, camera);
  window.__ocean.frames += 1;
});
