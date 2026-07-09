import * as THREE from 'three';
import { SKY_COLOR_GLSL } from '../environment/sky.js';
import { MAX_WAVES } from './spectrum.js';

const OCEAN_VERTEX_SHADER = /* glsl */ `
  #define MAX_WAVES ${MAX_WAVES}

  uniform float uTime;
  uniform float uStormIntensity;
  uniform int uWaveCount;
  uniform vec4 uWaveA[MAX_WAVES];
  uniform vec4 uWaveB[MAX_WAVES];

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vCrest;
  varying float vSlope;

  void main() {
    vec3 baseWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 displaced = baseWorld;
    vec3 tangentX = vec3(1.0, 0.0, 0.0);
    vec3 tangentZ = vec3(0.0, 0.0, 1.0);
    float crest = 0.0;

    for (int index = 0; index < MAX_WAVES; index++) {
      if (index >= uWaveCount) break;
      vec2 waveDirection = normalize(uWaveA[index].xy);
      float amplitude = uWaveA[index].z;
      float k = uWaveA[index].w;
      float omega = uWaveB[index].x;
      float phaseOffset = uWaveB[index].y;
      float q = uWaveB[index].z;
      float amplitudeScale = 1.0 + 0.24 * uStormIntensity;
      float verticalAmplitude = amplitude * amplitudeScale;
      float safeQ = q / amplitudeScale;
      float phase = k * dot(waveDirection, baseWorld.xz) - omega * uTime + phaseOffset;
      float sine = sin(phase);
      float cosine = cos(phase);
      float horizontal = safeQ * verticalAmplitude * cosine;
      float verticalDifferential = k * verticalAmplitude;
      float horizontalDifferential = safeQ * verticalDifferential;

      displaced.x += horizontal * waveDirection.x;
      displaced.y += verticalAmplitude * sine;
      displaced.z += horizontal * waveDirection.y;
      crest += horizontalDifferential * sine;

      tangentX.x -= horizontalDifferential * waveDirection.x * waveDirection.x * sine;
      tangentX.y += verticalDifferential * waveDirection.x * cosine;
      tangentX.z -= horizontalDifferential * waveDirection.x * waveDirection.y * sine;

      tangentZ.x -= horizontalDifferential * waveDirection.x * waveDirection.y * sine;
      tangentZ.y += verticalDifferential * waveDirection.y * cosine;
      tangentZ.z -= horizontalDifferential * waveDirection.y * waveDirection.y * sine;
    }

    vec3 worldNormal = normalize(cross(tangentZ, tangentX));
    vWorldPosition = displaced;
    vWorldNormal = worldNormal;
    vCrest = crest;
    vSlope = length(worldNormal.xz) / max(0.08, worldNormal.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
  }
`;

const OCEAN_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uStormIntensity;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform float uRoughness;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform vec3 uCloudColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uSunIntensity;
  uniform float uCloudAmount;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying float vCrest;
  varying float vSlope;

  ${SKY_COLOR_GLSL}

  float oceanHash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float oceanNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 blend = local * local * (3.0 - 2.0 * local);
    float a = oceanHash21(cell);
    float b = oceanHash21(cell + vec2(1.0, 0.0));
    float c = oceanHash21(cell + vec2(0.0, 1.0));
    float d = oceanHash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
  }

  float oceanFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.54;
    mat2 rotation = mat2(0.86, -0.51, 0.51, 0.86);
    for (int octave = 0; octave < 4; octave++) {
      value += oceanNoise(p) * amplitude;
      p = rotation * p * 2.07 + vec2(5.9, 13.1);
      amplitude *= 0.5;
    }
    return value;
  }

  float microHeight(vec2 worldPosition) {
    vec2 first = worldPosition * 0.58 + vec2(uTime * 0.19, -uTime * 0.12);
    vec2 second = worldPosition * 1.74 + vec2(-uTime * 0.28, uTime * 0.17);
    return oceanFbm(first) * 0.64 + oceanFbm(second) * 0.36;
  }

  void main() {
    vec3 normal = normalize(vWorldNormal);
    float epsilon = 0.055;
    float baseDetail = microHeight(vWorldPosition.xz);
    float detailX = microHeight(vWorldPosition.xz + vec2(epsilon, 0.0));
    float detailZ = microHeight(vWorldPosition.xz + vec2(0.0, epsilon));
    vec2 detailGradient = vec2(detailX - baseDetail, detailZ - baseDetail) / epsilon;
    float detailStrength = 0.15 + uStormIntensity * 0.08;
    normal = normalize(normal + vec3(-detailGradient.x, 0.0, -detailGradient.y) * detailStrength);

    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
    vec3 reflectedSky = oceanSkyColor(reflect(-viewDir, normal));

    float heightTone = clamp(vWorldPosition.y * 0.1 + 0.48, 0.0, 1.0);
    float facingTone = pow(max(normal.y, 0.0), 1.7);
    vec3 absorptionColor = mix(uDeepColor, uShallowColor, heightTone * 0.58 + facingTone * 0.18);
    absorptionColor *= 0.72 + 0.28 * max(dot(normal, normalize(uSunDirection)), 0.0);

    vec3 halfVector = normalize(viewDir + normalize(uSunDirection));
    float sunPower = mix(780.0, 54.0, clamp(uRoughness, 0.0, 1.0));
    float sunCore = pow(max(dot(normal, halfVector), 0.0), sunPower);
    float sunBloom = pow(max(dot(normal, halfVector), 0.0), sunPower * 0.13);
    float sparkle = smoothstep(0.56, 0.94, baseDetail + vCrest * 0.32);
    vec3 sunGlint = uSunColor * uSunIntensity * (sunCore * 2.7 + sunBloom * sparkle * 0.22);

    float foamNoise = oceanFbm(vWorldPosition.xz * 0.36 + vec2(uTime * 0.055, -uTime * 0.04));
    float fineFoam = oceanFbm(vWorldPosition.xz * 1.46 - vec2(uTime * 0.18, uTime * 0.11));
    float breaker = smoothstep(
      0.48 - uStormIntensity * 0.1,
      0.84 - uStormIntensity * 0.08,
      vSlope + vCrest * 0.34 + foamNoise * 0.18 + uStormIntensity * 0.12
    );
    breaker *= smoothstep(0.38, 0.76, fineFoam + vCrest * 0.42);
    float foamLace = smoothstep(0.56, 0.83, fineFoam) * smoothstep(0.16, 0.58, vCrest);
    float foam = clamp(max(breaker, foamLace * 0.42), 0.0, 1.0);

    vec3 color = mix(
      absorptionColor,
      reflectedSky,
      fresnel * (0.72 + 0.2 * (1.0 - uRoughness))
    );
    color += sunGlint;
    color = mix(color, uFoamColor, foam * (0.46 + 0.42 * fresnel));
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(color, vec3(luminance), uStormIntensity * 0.16);
    color *= 1.0 - uStormIntensity * 0.07;

    float distanceFade = smoothstep(180.0, 640.0, length(cameraPosition.xz - vWorldPosition.xz));
    color = mix(color, uSkyHorizon * 0.72, distanceFade * (0.34 + uStormIntensity * 0.2));
    gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
  }
`;

function color(values) {
  return new THREE.Color().fromArray(values);
}

function direction(values) {
  return new THREE.Vector3().fromArray(values).normalize();
}

function createWaveVectors() {
  return Array.from({ length: MAX_WAVES }, () => new THREE.Vector4());
}

export function createOceanMaterial(waves, environment) {
  const material = new THREE.ShaderMaterial({
    name: 'GPT56SolWindOcean',
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uStormIntensity: { value: 0 },
      uWaveCount: { value: 0 },
      uWaveA: { value: createWaveVectors() },
      uWaveB: { value: createWaveVectors() },
      uDeepColor: { value: color(environment.deepColor) },
      uShallowColor: { value: color(environment.shallowColor) },
      uFoamColor: { value: color(environment.foamColor) },
      uRoughness: { value: environment.roughness },
      uSkyZenith: { value: color(environment.skyZenith) },
      uSkyHorizon: { value: color(environment.skyHorizon) },
      uCloudColor: { value: color(environment.cloudColor) },
      uSunColor: { value: color(environment.sunColor) },
      uSunDirection: { value: direction(environment.sunDirection) },
      uSunIntensity: { value: environment.sunIntensity },
      uCloudAmount: { value: environment.cloudAmount }
    },
    vertexShader: OCEAN_VERTEX_SHADER,
    fragmentShader: OCEAN_FRAGMENT_SHADER
  });

  uploadWaves(material, waves);
  return material;
}

export function uploadWaves(material, waves) {
  const count = Math.min(MAX_WAVES, waves.length);
  material.uniforms.uWaveCount.value = count;

  for (let index = 0; index < MAX_WAVES; index += 1) {
    const wave = waves[index];
    const waveA = material.uniforms.uWaveA.value[index];
    const waveB = material.uniforms.uWaveB.value[index];
    if (wave) {
      waveA.set(wave.dirX, wave.dirZ, wave.amplitude, wave.k);
      waveB.set(wave.omega, wave.phase, wave.q, 0);
    } else {
      waveA.set(0, 0, 0, 0);
      waveB.set(0, 0, 0, 0);
    }
  }
}

export function updateOceanEnvironment(material, environment) {
  const { uniforms } = material;
  uniforms.uDeepColor.value.fromArray(environment.deepColor);
  uniforms.uShallowColor.value.fromArray(environment.shallowColor);
  uniforms.uFoamColor.value.fromArray(environment.foamColor);
  uniforms.uRoughness.value = environment.roughness;
  uniforms.uSkyZenith.value.fromArray(environment.skyZenith);
  uniforms.uSkyHorizon.value.fromArray(environment.skyHorizon);
  uniforms.uCloudColor.value.fromArray(environment.cloudColor);
  uniforms.uSunColor.value.fromArray(environment.sunColor);
  uniforms.uSunDirection.value.fromArray(environment.sunDirection).normalize();
  uniforms.uSunIntensity.value = environment.sunIntensity;
  uniforms.uCloudAmount.value = environment.cloudAmount;
}

export function updateOceanStorm(material, intensity) {
  material.uniforms.uStormIntensity.value = Math.min(1, Math.max(0, intensity));
}
