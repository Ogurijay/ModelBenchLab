import * as THREE from "three";
import { MAX_WAVES, type OceanState } from "../../game/simulation/oceanTypes";

const vertexShader = /* glsl */ `
precision highp float;

#define MAX_WAVES ${MAX_WAVES}
#define TWO_PI 6.28318530718

uniform float uTime;
uniform int uWaveCount;
uniform float uGravity;
uniform float uSwell;
uniform float uChoppiness;
uniform vec2 uWaveDirections[MAX_WAVES];
uniform float uWavelengths[MAX_WAVES];
uniform float uAmplitudes[MAX_WAVES];
uniform float uSteepness[MAX_WAVES];
uniform float uPhases[MAX_WAVES];

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vFoam;

void main() {
  vec3 localPosition = position;
  vec2 xz = localPosition.xz;
  vec3 displacement = vec3(0.0);
  vec3 dPdx = vec3(1.0, 0.0, 0.0);
  vec3 dPdz = vec3(0.0, 0.0, 1.0);
  float foamEnergy = 0.0;
  float activeWaves = max(float(uWaveCount), 1.0);

  for (int i = 0; i < MAX_WAVES; i++) {
    if (i < uWaveCount) {
      vec2 direction = normalize(uWaveDirections[i]);
      float wavelength = max(uWavelengths[i], 0.001);
      float k = TWO_PI / wavelength;
      float omega = sqrt(max(uGravity * k, 0.0001));
      float amplitude = uAmplitudes[i] * uSwell;
      float steepness = uSteepness[i] * uChoppiness;
      float phase = k * dot(direction, xz) - omega * uTime + uPhases[i];
      float sinPhase = sin(phase);
      float cosPhase = cos(phase);
      float q = min(steepness / max(k * amplitude * activeWaves, 0.0001), 1.55);

      displacement.x += q * amplitude * direction.x * cosPhase;
      displacement.y += amplitude * sinPhase;
      displacement.z += q * amplitude * direction.y * cosPhase;

      dPdx += vec3(
        -q * amplitude * k * direction.x * direction.x * sinPhase,
        amplitude * k * direction.x * cosPhase,
        -q * amplitude * k * direction.x * direction.y * sinPhase
      );

      dPdz += vec3(
        -q * amplitude * k * direction.x * direction.y * sinPhase,
        amplitude * k * direction.y * cosPhase,
        -q * amplitude * k * direction.y * direction.y * sinPhase
      );

      float crest = smoothstep(0.58, 0.92, sinPhase);
      foamEnergy += crest * min(steepness, 1.0) * amplitude;
    }
  }

  vec3 displaced = localPosition + displacement;
  vec3 normal = normalize(cross(dPdz, dPdx));
  if (normal.y < 0.0) {
    normal *= -1.0;
  }

  vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vFoam = clamp(foamEnergy * 0.34 + pow(max(0.0, 1.0 - vWorldNormal.y), 1.16), 0.0, 1.0);

  gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uFoamAmount;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uSkyColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;

varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vFoam;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  vec3 lightDirection = normalize(uSunDirection);
  vec3 halfVector = normalize(lightDirection + viewDirection);

  float ndotl = clamp(dot(normal, lightDirection), 0.0, 1.0);
  float fresnel = pow(1.0 - clamp(dot(normal, viewDirection), 0.0, 1.0), 5.0);
  float horizonFade = smoothstep(80.0, 420.0, length(cameraPosition.xz - vWorldPosition.xz));
  float trough = clamp(0.5 + vWorldPosition.y * 0.055, 0.0, 1.0);

  vec3 water = mix(uDeepColor, uShallowColor, trough * 0.42 + normal.y * 0.48);
  water *= 0.72 + ndotl * 0.5;
  water = mix(water, uSkyColor, fresnel * 0.5 + horizonFade * 0.06);

  float facetNoise = noise(vWorldPosition.xz * 0.18 + vec2(uTime * 0.12, -uTime * 0.06));
  float slope = smoothstep(0.01, 0.16, 1.0 - normal.y);
  float facets = smoothstep(0.38, 0.82, facetNoise) * (0.28 + slope * 0.72);
  water = mix(water, uDeepColor * 1.18, slope * 0.24);
  water += vec3(0.16, 0.34, 0.36) * facets * (0.14 + ndotl * 0.18);

  float specular = pow(max(dot(normal, halfVector), 0.0), 130.0) * (0.22 + fresnel * 0.95);
  water += uSunColor * specular;

  float foamNoise = noise(vWorldPosition.xz * 0.055 + vec2(uTime * 0.08, -uTime * 0.05));
  float crestHighlight = smoothstep(0.02, 0.22, vFoam * uFoamAmount);
  float foamMask = smoothstep(0.05, 0.44, vFoam * uFoamAmount + foamNoise * 0.32);
  vec3 foam = vec3(0.9, 0.97, 1.0) * (0.72 + ndotl * 0.28);

  vec3 color = mix(water, foam, max(foamMask, crestHighlight * 0.42));
  color += vec3(0.0, 0.16, 0.18) * smoothstep(0.0, 1.0, normal.y);

  float alpha = mix(0.9, 0.98, fresnel) + horizonFade * 0.02 + foamMask * 0.08;
  gl_FragColor = vec4(color, clamp(alpha, 0.9, 0.995));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface OceanMaterialHandle {
  material: THREE.ShaderMaterial;
  update: (state: OceanState) => void;
}

export function createOceanMaterial(state: OceanState, sunDirection: THREE.Vector3): OceanMaterialHandle {
  const waveDirections = Array.from({ length: MAX_WAVES }, () => new THREE.Vector2(1, 0));
  const waveNumbers = Array.from({ length: MAX_WAVES }, () => 0);

  const uniforms = {
    uTime: { value: 0 },
    uWaveCount: { value: 0 },
    uGravity: { value: 9.81 },
    uSwell: { value: 1 },
    uChoppiness: { value: 1 },
    uFoamAmount: { value: 0.5 },
    uWaveDirections: { value: waveDirections },
    uWavelengths: { value: [...waveNumbers] },
    uAmplitudes: { value: [...waveNumbers] },
    uSteepness: { value: [...waveNumbers] },
    uPhases: { value: [...waveNumbers] },
    uDeepColor: { value: new THREE.Color("#006184") },
    uShallowColor: { value: new THREE.Color("#00e2db") },
    uSkyColor: { value: new THREE.Color("#4fabba") },
    uSunColor: { value: new THREE.Color("#ffe1a3") },
    uSunDirection: { value: sunDirection.clone() },
  } satisfies Record<string, THREE.IUniform>;

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    toneMapped: true,
    transparent: true,
    depthWrite: false,
  });

  function update(nextState: OceanState): void {
    uniforms.uTime.value = nextState.time;
    uniforms.uWaveCount.value = nextState.waves.length;
    uniforms.uGravity.value = nextState.gravity;
    uniforms.uSwell.value = nextState.swell;
    uniforms.uChoppiness.value = nextState.choppiness;
    uniforms.uFoamAmount.value = nextState.foam;

    for (let index = 0; index < MAX_WAVES; index += 1) {
      const wave = nextState.waves[index];
      waveDirections[index].set(wave?.direction.x ?? 1, wave?.direction.y ?? 0);
      uniforms.uWavelengths.value[index] = wave?.wavelength ?? 1;
      uniforms.uAmplitudes.value[index] = wave?.amplitude ?? 0;
      uniforms.uSteepness.value[index] = wave?.steepness ?? 0;
      uniforms.uPhases.value[index] = wave?.phase ?? 0;
    }
  }

  update(state);

  return {
    material,
    update,
  };
}
