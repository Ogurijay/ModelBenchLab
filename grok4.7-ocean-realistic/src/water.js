import * as THREE from 'three';
import { MAX_WAVES } from './waves.js';
import { skyColorGlsl } from './atmosphere.js';

const vert = /* glsl */ `
uniform float uTime;
uniform float uRipple;
uniform vec2 uCenter;
uniform float uA[${MAX_WAVES}];
uniform float uK[${MAX_WAVES}];
uniform float uW[${MAX_WAVES}];
uniform float uDx[${MAX_WAVES}];
uniform float uDz[${MAX_WAVES}];
uniform float uPh[${MAX_WAVES}];
uniform float uQ[${MAX_WAVES}];

varying vec3 vNormal;
varying vec3 vWorld;
varying float vJac;
varying float vCrest;
varying vec2 vXZ;

float ripple(vec2 xz) {
  float h = 0.0;
  h += sin(dot(xz, vec2(1.7, 0.85)) * 5.5 + uTime * 1.5) * 0.018;
  h += sin(dot(xz, vec2(-0.55, 1.75)) * 9.5 - uTime * 1.9) * 0.009;
  h += sin(dot(xz, vec2(1.15, -1.35)) * 16.0 + uTime * 2.4) * 0.004;
  return h * uRipple;
}

void main() {
  vec2 xz = position.xz + uCenter;
  vec3 disp = vec3(0.0);
  float dPxdx = 1.0;
  float dPxdz = 0.0;
  float dPydx = 0.0;
  float dPydz = 0.0;
  float dPzdx = 0.0;
  float dPzdz = 1.0;

  #pragma unroll_loop_start
  for ( int i = 0; i < ${MAX_WAVES}; i ++ ) {
    float amp_UNROLLED_LOOP_INDEX = uA[ i ];
    float k_UNROLLED_LOOP_INDEX = uK[ i ];
    float w_UNROLLED_LOOP_INDEX = uW[ i ];
    float dx_UNROLLED_LOOP_INDEX = uDx[ i ];
    float dz_UNROLLED_LOOP_INDEX = uDz[ i ];
    float ph_UNROLLED_LOOP_INDEX = uPh[ i ];
    float q_UNROLLED_LOOP_INDEX = uQ[ i ];
    float theta_UNROLLED_LOOP_INDEX = k_UNROLLED_LOOP_INDEX * (dx_UNROLLED_LOOP_INDEX * xz.x + dz_UNROLLED_LOOP_INDEX * xz.y) - w_UNROLLED_LOOP_INDEX * uTime + ph_UNROLLED_LOOP_INDEX;
    float s_UNROLLED_LOOP_INDEX = sin(theta_UNROLLED_LOOP_INDEX);
    float c_UNROLLED_LOOP_INDEX = cos(theta_UNROLLED_LOOP_INDEX);
    disp.x += q_UNROLLED_LOOP_INDEX * amp_UNROLLED_LOOP_INDEX * dx_UNROLLED_LOOP_INDEX * c_UNROLLED_LOOP_INDEX;
    disp.z += q_UNROLLED_LOOP_INDEX * amp_UNROLLED_LOOP_INDEX * dz_UNROLLED_LOOP_INDEX * c_UNROLLED_LOOP_INDEX;
    disp.y += amp_UNROLLED_LOOP_INDEX * s_UNROLLED_LOOP_INDEX;
    float kqas_UNROLLED_LOOP_INDEX = k_UNROLLED_LOOP_INDEX * q_UNROLLED_LOOP_INDEX * amp_UNROLLED_LOOP_INDEX * s_UNROLLED_LOOP_INDEX;
    float kac_UNROLLED_LOOP_INDEX = k_UNROLLED_LOOP_INDEX * amp_UNROLLED_LOOP_INDEX * c_UNROLLED_LOOP_INDEX;
    dPxdx -= kqas_UNROLLED_LOOP_INDEX * dx_UNROLLED_LOOP_INDEX * dx_UNROLLED_LOOP_INDEX;
    dPxdz -= kqas_UNROLLED_LOOP_INDEX * dx_UNROLLED_LOOP_INDEX * dz_UNROLLED_LOOP_INDEX;
    dPzdx -= kqas_UNROLLED_LOOP_INDEX * dz_UNROLLED_LOOP_INDEX * dx_UNROLLED_LOOP_INDEX;
    dPzdz -= kqas_UNROLLED_LOOP_INDEX * dz_UNROLLED_LOOP_INDEX * dz_UNROLLED_LOOP_INDEX;
    dPydx += kac_UNROLLED_LOOP_INDEX * dx_UNROLLED_LOOP_INDEX;
    dPydz += kac_UNROLLED_LOOP_INDEX * dz_UNROLLED_LOOP_INDEX;
  }
  #pragma unroll_loop_end

  vec3 tX = vec3(dPxdx, dPydx, dPzdx);
  vec3 tZ = vec3(dPxdz, dPydz, dPzdz);
  vec3 nrm = normalize(cross(tZ, tX));

  vec2 wxz = xz + disp.xz;
  float e = 0.45;
  float hL = ripple(wxz - vec2(e, 0.0));
  float hR = ripple(wxz + vec2(e, 0.0));
  float hD = ripple(wxz - vec2(0.0, e));
  float hU = ripple(wxz + vec2(0.0, e));
  nrm.x += (hL - hR) * 0.85;
  nrm.z += (hD - hU) * 0.85;
  nrm.x *= 1.55;
  nrm.z *= 1.55;
  nrm = normalize(nrm);

  vec3 local = vec3(position.x + disp.x, disp.y, position.z + disp.z);
  vec4 world = modelMatrix * vec4(local, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(normalMatrix * nrm);
  vJac = dPxdx * dPzdz - dPxdz * dPzdx;
  vCrest = disp.y;
  vXZ = wxz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const frag = /* glsl */ `
#define sat(a) clamp(a, 0.0, 1.0)

uniform float uTime;
uniform float uCloud;
uniform float uFoam;
uniform float uHole;
uniform float uFogDensity;
uniform float uBoatSpeed;
uniform vec2 uWindDir;
uniform vec2 uCam;
uniform vec2 uBoat;
uniform vec2 uHeading;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uIsland;
uniform vec3 uDeep;
uniform vec3 uShallow;

varying vec3 vNormal;
varying vec3 vWorld;
varying float vJac;
varying float vCrest;
varying vec2 vXZ;

${skyColorGlsl()}

float foamNoise(vec2 xz) {
  return sin(xz.x * 0.37 + uTime * 0.55) * sin(xz.y * 0.33 - uTime * 0.42);
}

void main() {
  float dist = length(vXZ - uCam);
  if (uHole > 0.0 && dist < uHole) discard;

  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = sat(dot(N, V));
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  vec3 R = reflect(-V, N);
  if (R.y < 0.015) R = normalize(vec3(R.x, 0.015, R.z));
  vec3 reflected = skyColor(R);

  float depthTone = pow(ndv, 0.55);
  vec3 body = mix(uDeep, uShallow, depthTone * 0.72);
  float sunset = exp(-abs(uSunDir.y) * 4.0) * smoothstep(-0.2, 0.05, uSunDir.y);
  body = mix(body, vec3(0.10, 0.035, 0.02), sunset * (1.0 - ndv) * 0.45);

  vec3 L = uSunDir;
  float ndl = sat(dot(N, L));
  vec3 H = normalize(L + V);
  float ndh = sat(dot(N, H));
  float rough = mix(0.028, 0.18, sat(dist / 240.0));
  float a = rough * rough;
  float a2 = a * a;
  float denom = ndh * ndh * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * denom * denom + 1e-4);
  float sunVis = smoothstep(-0.08, 0.12, L.y);
  float peak = D / (1.0 + D * 0.035);
  vec3 glitter = uSunColor * peak * ndl * (0.05 + fres) * sunVis * 2.1;
  glitter += uSunColor * pow(ndh, mix(140.0, 26.0, rough * 4.0)) * ndl * sunVis * 0.9;

  vec3 moonDir = normalize(vec3(-uSunDir.x, abs(uSunDir.y) * 0.55 + 0.28, -uSunDir.z));
  vec3 Hm = normalize(moonDir + V);
  float moon = pow(sat(dot(N, Hm)), 80.0) * sat(-L.y * 2.2);
  glitter += vec3(0.65, 0.74, 0.9) * moon * 0.45;

  float crest = sat(vCrest / 1.15);
  float sss = pow(sat(dot(V, -L)), 3.0) * (0.25 + crest);
  vec3 scatter = uSunColor * vec3(0.05, 0.42, 0.36) * sss * (1.0 - fres) * sunVis * 0.55;

  float jacFoam = smoothstep(0.48, 0.12, vJac);
  float crestFoam = smoothstep(0.55, 1.6, vCrest) * 0.35;
  float islandD = length(vXZ - uIsland.xy);
  float ring = smoothstep(uIsland.z + 2.6, uIsland.z + 0.3, islandD)
    * smoothstep(uIsland.z - 1.4, uIsland.z + 0.15, islandD);
  vec2 rel = vXZ - uBoat;
  float along = dot(rel, uHeading);
  float side = abs(rel.x * uHeading.y - rel.y * uHeading.x);
  float wake = exp(-side * side * 2.2) * exp(min(along, 0.0) * 0.42) * step(along, 1.0);
  float foam = jacFoam * 0.75 + crestFoam + ring * 0.4 + wake * sat(uBoatSpeed * 0.12) * 0.4;
  foam *= 0.72 + 0.28 * foamNoise(vXZ);
  foam = sat(foam * uFoam);

  vec2 cuv = vXZ * 0.0035 + uWindDir * uTime * 0.008;
  float cloudShade = smoothstep(0.5, 0.85, fbm(cuv));
  vec3 col = mix(body, reflected, fres) + glitter + scatter;
  col *= mix(1.0, 0.72, cloudShade * uCloud * 0.85);
  col = mix(col, vec3(0.55, 0.58, 0.56), foam);

  vec3 horizDir = normalize(vec3(V.x, 0.1, V.z));
  vec3 horiz = skyColor(horizDir);
  float fog = 1.0 - exp(-dist * uFogDensity);
  col = mix(col, horiz, fog);
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.0035;

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function makeUniforms() {
  const arrays = () => new Float32Array(MAX_WAVES);
  return {
    uTime: { value: 0 },
    uRipple: { value: 1 },
    uCenter: { value: new THREE.Vector2() },
    uIsland: { value: new THREE.Vector3() },
    uA: { value: arrays() },
    uK: { value: arrays() },
    uW: { value: arrays() },
    uDx: { value: arrays() },
    uDz: { value: arrays() },
    uPh: { value: arrays() },
    uQ: { value: arrays() },
    uCloud: { value: 0.3 },
    uFoam: { value: 1 },
    uHole: { value: 0 },
    uFogDensity: { value: 0.0032 },
    uBoatSpeed: { value: 0 },
    uWindDir: { value: new THREE.Vector2(1, 0) },
    uCam: { value: new THREE.Vector2() },
    uBoat: { value: new THREE.Vector2() },
    uHeading: { value: new THREE.Vector2(1, 0) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uDeep: { value: new THREE.Color(0.004, 0.028, 0.038) },
    uShallow: { value: new THREE.Color(0.02, 0.16, 0.15) }
  };
}

export function createWaterMaterial(holeRadius, offset) {
  const uniforms = makeUniforms();
  uniforms.uHole.value = holeRadius;
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    fog: false,
    lights: false,
    depthWrite: true,
    polygonOffset: offset !== 0,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset
  });
}

const KEYS = ['uA', 'uK', 'uW', 'uDx', 'uDz', 'uPh', 'uQ'];
const FIELDS = ['amplitude', 'k', 'omega', 'dirX', 'dirZ', 'phase', 'Q'];

export function syncWater(material, state) {
  const u = material.uniforms;
  u.uTime.value = state.time;
  u.uRipple.value = state.ripple;
  u.uCloud.value = state.clouds;
  u.uFoam.value = state.foam;
  u.uFogDensity.value = state.fogDensity;
  u.uBoatSpeed.value = state.boatSpeed;
  u.uCenter.value.copy(state.center);
  u.uCam.value.copy(state.cam);
  u.uBoat.value.copy(state.boat);
  u.uHeading.value.copy(state.heading);
  u.uWindDir.value.copy(state.windDir);
  u.uSunDir.value.copy(state.sunDir);
  u.uSunColor.value.setRGB(state.sunColor[0], state.sunColor[1], state.sunColor[2], THREE.LinearSRGBColorSpace);
  u.uIsland.value.copy(state.island);
  for (let k = 0; k < KEYS.length; k++) {
    const array = u[KEYS[k]].value;
    const field = FIELDS[k];
    for (let i = 0; i < MAX_WAVES; i++) array[i] = state.waves[i][field];
  }
  material.wireframe = state.wireframe;
}

export function createSeaMesh(size, segments, holeRadius, offset) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const material = createWaterMaterial(holeRadius, offset);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  const cell = size / segments;
  mesh.userData.cell = cell;
  mesh.userData.half = size * 0.5;
  return mesh;
}

export function snapSea(mesh, camera) {
  const cell = mesh.userData.cell;
  mesh.position.x = Math.round(camera.position.x / cell) * cell;
  mesh.position.z = Math.round(camera.position.z / cell) * cell;
  mesh.position.y = 0;
}
