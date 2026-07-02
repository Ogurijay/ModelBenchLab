import * as THREE from 'three';
import { GameEngine } from './GameEngine.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const engine = new GameEngine(renderer);
engine.ui.showStart();

const viewport = document.getElementById('viewport');

function doResize() {
  const w = viewport.clientWidth || window.innerWidth;
  const h = viewport.clientHeight || window.innerHeight;
  engine.resize(w, h);
}

const ro = new ResizeObserver(doResize);
ro.observe(viewport);
doResize();

const timer = new THREE.Timer();

function loop(t) {
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 1 / 30);
  engine.tick(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
