import * as THREE from 'three';
import { skyColorGlsl } from './atmosphere.js';

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const frag = /* glsl */ `
#define sat(a) clamp(a, 0.0, 1.0)

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uCloud;
uniform float uTime;
uniform vec2 uWindDir;

varying vec3 vDir;

${skyColorGlsl()}

void main() {
  vec3 col = skyColor(normalize(vDir));
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.003;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSky() {
  const geometry = new THREE.SphereGeometry(2200, 48, 32);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff4e0') },
      uCloud: { value: 0.3 },
      uTime: { value: 0 },
      uWindDir: { value: new THREE.Vector2(1, 0) }
    },
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}

export function syncSky(mesh, state) {
  const u = mesh.material.uniforms;
  u.uTime.value = state.time;
  u.uCloud.value = state.clouds;
  u.uSunDir.value.copy(state.sunDir);
  u.uSunColor.value.setRGB(state.sunColor[0], state.sunColor[1], state.sunColor[2], THREE.LinearSRGBColorSpace);
  u.uWindDir.value.copy(state.windDir);
}

export function createStars(count = 640) {
  const positions = [];
  let seed = 20261002;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  while (positions.length < count * 3) {
    const v = new THREE.Vector3(rand() * 2 - 1, rand(), rand() * 2 - 1);
    if (v.lengthSq() < 1e-4 || v.y < 0.12) continue;
    v.normalize().multiplyScalar(700);
    positions.push(v.x, v.y, v.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: '#e7eeff',
    size: 1.8,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = -1;
  return points;
}
