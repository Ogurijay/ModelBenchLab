import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeWaves, maximumElevation, sampleSurface, PRESETS } from './waves.js';
import { oceanVertex, oceanFragment, skyVertex, skyFragment } from './shaders.js';

const QUALITY = {
  performance: { rings: 150, sectors: 256, ratio: 0.8 },
  balanced: { rings: 210, sectors: 320, ratio: 1.15 },
  high: { rings: 280, sectors: 448, ratio: 1.6 },
};

function oceanGeometry({ rings, sectors }) {
  const vertices = new Float32Array((rings + 1) * (sectors + 1) * 3);
  const indices = new Uint32Array(rings * sectors * 6);
  for (let r = 0; r <= rings; r++) {
    const radius = 2 * Math.expm1(r / rings * 8.1);
    for (let s = 0; s <= sectors; s++) {
      const angle = s / sectors * Math.PI * 2;
      const index = (r * (sectors + 1) + s) * 3;
      vertices[index] = Math.sin(angle) * radius;
      vertices[index + 2] = Math.cos(angle) * radius;
    }
  }
  let n = 0;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * (sectors + 1) + s, b = a + sectors + 1;
      indices.set([a, b, a + 1, a + 1, b, b + 1], n); n += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

function createBuoy() {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: '#df8e42', roughness: 0.48, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: '#142c31', roughness: 0.57, metalness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: '#e4e1c9', roughness: 0.55 });
  const solar = new THREE.MeshStandardMaterial({ color: '#173944', roughness: 0.22, metalness: 0.5 });
  function part(geometry, material, y) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.y = y; group.add(mesh); return mesh;
  }
  part(new THREE.CylinderGeometry(0.85, 1.15, 0.7, 32), orange, 0.15);
  part(new THREE.CylinderGeometry(1.16, 1.16, 0.17, 32), dark, -0.08);
  part(new THREE.CylinderGeometry(0.42, 0.64, 0.55, 24), orange, 0.72);
  part(new THREE.CylinderGeometry(0.09, 0.12, 2.4, 12), white, 1.65);
  for (const x of [-0.42, 0.42]) {
    const panel = part(new THREE.BoxGeometry(0.63, 0.045, 0.66), solar, 1.5);
    panel.position.x = x; panel.rotation.z = x * -0.5;
  }
  part(new THREE.CylinderGeometry(0.19, 0.19, 0.18, 16), dark, 2.94);
  const beaconMaterial = new THREE.MeshStandardMaterial({ color: '#efd5a0', emissive: '#e8a85c', emissiveIntensity: 0.9 });
  const beacon = part(new THREE.SphereGeometry(0.12, 12, 8), beaconMaterial, 3.12);
  part(new THREE.CylinderGeometry(0.016, 0.022, 0.6, 6), dark, 3.47);
  group.scale.setScalar(0.8);
  return { group, beacon };
}

export class Ocean {
  constructor(canvas, { seed = 71, time = 0 } = {}) {
    this.canvas = canvas;
    this.waves = makeWaves(seed);
    this.time = time;
    this.seed = seed;
    this.buoyAnchorX = window.innerWidth <= 760 ? 3 : 11;
    this.settings = { ...PRESETS.swell };
    this.quality = 'balanced';
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 16000);
    this.camera.position.set(0, 7.2, 32);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 2.8, -18);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.controls.enablePan = false;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 170;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.025;
    this.controls.rotateSpeed = 0.45;
    this.controls.zoomSpeed = 0.65;
    this.controls.update();
    this.controls.saveState();
    this.uniforms = {
      uTime: { value: time },
      uCloud: { value: this.settings.cloud },
      uSunDirection: { value: new THREE.Vector3() },
      uWind: { value: this.settings.wind },
      uHeight: { value: this.settings.height },
      uCenter: { value: new THREE.Vector2() },
      uWaves: { value: this.waves.map(() => new THREE.Vector4()) },
      uPhases: { value: this.waves.map(w => w.phase) },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: skyVertex, fragmentShader: skyFragment,
      side: THREE.BackSide, depthWrite: false,
    }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.water = new THREE.Mesh(oceanGeometry(QUALITY.balanced), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: oceanVertex, fragmentShader: oceanFragment,
      side: THREE.DoubleSide,
    }));
    this.water.frustumCulled = false;
    this.scene.add(this.water);
    this.sun = new THREE.DirectionalLight('#ffdfad', 2);
    this.ambient = new THREE.HemisphereLight('#c2dbe0', '#173f47', 2);
    this.scene.add(this.sun, this.ambient);
    this.buoy = createBuoy();
    this.scene.add(this.buoy.group);
    this.normal = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.rotation = new THREE.Quaternion();
    this.resize = this.resize.bind(this);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas.parentElement);
    this.resize();
    this.render(0, this.settings);
  }

  setQuality(quality) {
    if (!QUALITY[quality] || quality === this.quality) return;
    const old = this.water.geometry;
    this.water.geometry = oceanGeometry(QUALITY[quality]);
    old.dispose();
    this.quality = quality;
    this.resize();
  }

  resize() {
    const { width, height } = this.canvas.parentElement.getBoundingClientRect();
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[this.quality].ratio));
    this.renderer.setSize(width, height, false);
  }

  resetCamera() { this.controls.reset(); }

  render(delta, target) {
    // Time only accumulates while running: wind changes never introduce phase jumps.
    this.time += delta * (0.65 + target.wind * 0.045);
    Object.assign(this.settings, target);
    const uniforms = this.uniforms;
    uniforms.uTime.value = this.time;
    uniforms.uWind.value = target.wind;
    uniforms.uHeight.value = target.height;
    uniforms.uCloud.value = target.cloud;
    const angle = target.direction * Math.PI / 180;
    for (let i = 0; i < this.waves.length; i++) {
      const wave = this.waves[i];
      uniforms.uWaves.value[i].set(Math.sin(angle + wave.spread), -Math.cos(angle + wave.spread), wave.k, wave.amplitude * target.height);
    }
    const elevation = target.sun * Math.PI / 180;
    uniforms.uSunDirection.value.set(-0.34 * Math.cos(elevation), Math.sin(elevation), -0.94 * Math.cos(elevation)).normalize();
    this.sun.position.copy(uniforms.uSunDirection.value).multiplyScalar(200);
    this.sun.intensity = 2.6 * (1 - target.cloud * 0.78);
    this.sun.color.setHSL(0.11, 0.25 + (1 - Math.sin(elevation)) * 0.35, 0.82);
    this.ambient.intensity = 1.6 - target.cloud * 0.65;
    this.controls.update();
    // Conservative bound on ALL wave phases; even the lowest orbit stays dry.
    this.minimumCameraY = maximumElevation(target.height, this.waves) + 1.3;
    this.camera.position.y = Math.max(this.camera.position.y, this.minimumCameraY);
    this.camera.lookAt(this.controls.target);
    uniforms.uCenter.value.set(this.camera.position.x, this.camera.position.z);
    const buoySample = sampleSurface(this.buoyAnchorX, -18, this.time, target, this.waves);
    this.buoy.group.position.set(buoySample.x, buoySample.y, buoySample.z);
    this.normal.set(buoySample.normal.x, buoySample.normal.y, buoySample.normal.z);
    this.rotation.setFromUnitVectors(this.up, this.normal);
    this.buoy.group.quaternion.copy(this.rotation);
    this.buoy.beacon.material.emissiveIntensity = 0.7 + Math.pow(Math.max(0, Math.sin(this.time * 1.7)), 18) * 2;
    this.buoy.group.visible = target.buoy;
    this.surfaceHeight = buoySample.y;
    this.renderer.render(this.scene, this.camera);
  }

  snapshot() {
    const gl = this.renderer.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      revision: THREE.REVISION, seed: this.seed, time: this.time, quality: this.quality,
      camera: this.camera.position.toArray(), minimumCameraY: this.minimumCameraY,
      surfaceHeight: this.surfaceHeight, buoyVisible: this.buoy.group.visible,
      drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      resolution: [this.canvas.width, this.canvas.height],
      gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      shaderErrors: this.renderer.info.programs.filter(p => p.diagnostics && !p.diagnostics.runnable).length,
    };
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    const geometries = new Set(), materials = new Set();
    this.scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.renderer.dispose();
  }
}
