import * as THREE from 'three';
import { MAX_WAVES } from './waves.js';

const SKY_FUNCTION = /* glsl */ `
  vec3 stormSky(vec3 dir, float stormDarkness, float lightningFlash) {
    float height = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 zenith = mix(vec3(0.07, 0.11, 0.18), vec3(0.18, 0.26, 0.36), 1.0 - stormDarkness);
    vec3 horizon = mix(vec3(0.10, 0.16, 0.20), vec3(0.48, 0.62, 0.72), 1.0 - stormDarkness);
    vec3 flash = vec3(0.68, 0.86, 1.0) * lightningFlash;
    return mix(horizon, zenith, pow(height, 0.62)) + flash;
  }
`;

const OCEAN_VERTEX = /* glsl */ `
  #define MAX_WAVES ${MAX_WAVES}

  uniform float uTime;
  uniform int uWaveCount;
  uniform vec4 uWaveA[MAX_WAVES]; // dirX, dirZ, steepness, k
  uniform vec4 uWaveB[MAX_WAVES]; // omega, phase, amplitude, unused
  uniform vec2 uSpoutCenter;
  uniform vec2 uSpoutDirection;
  uniform float uSpoutRadius;
  uniform float uSpoutOpacity;
  uniform float uSpoutWakeLength;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vWaveHeight;

  void main() {
    vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
    vec2 p = base.xz;
    vec3 displaced = base;
    vec3 normal = vec3(0.0, 1.0, 0.0);
    float crest = 0.0;

    for (int i = 0; i < MAX_WAVES; i++) {
      if (i >= uWaveCount) break;

      vec2 dir = normalize(uWaveA[i].xy);
      float q = uWaveA[i].z;
      float k = uWaveA[i].w;
      float omega = uWaveB[i].x;
      float phaseOffset = uWaveB[i].y;
      float amplitude = uWaveB[i].z;

      float phase = k * dot(dir, p) - omega * uTime + phaseOffset;
      float s = sin(phase);
      float c = cos(phase);

      displaced.x += q * amplitude * dir.x * c;
      displaced.z += q * amplitude * dir.y * c;
      displaced.y += amplitude * s;

      normal.x -= dir.x * k * amplitude * c;
      normal.z -= dir.y * k * amplitude * c;
      normal.y -= q * k * amplitude * s;
      crest += q * k * amplitude * s;
    }

    vec2 spoutVector = base.xz - uSpoutCenter;
    float spoutDistance = length(spoutVector);
    float spoutWarp =
      sin(base.x * 0.071 + base.z * 0.113 + uTime * 0.7) * uSpoutRadius * 0.42 +
      sin(base.x * 0.19 - base.z * 0.13 - uTime * 0.45) * uSpoutRadius * 0.18;
    float warpedSpoutDistance = max(0.0, spoutDistance + spoutWarp);
    float spoutInfluence = exp(
      -(warpedSpoutDistance * warpedSpoutDistance) / max(1.0, uSpoutRadius * uSpoutRadius * 3.2)
    );
    vec2 travelDir = normalize(uSpoutDirection);
    float wakeBehind = dot(spoutVector, -travelDir);
    float wakeCross = abs(spoutVector.x * travelDir.y - spoutVector.y * travelDir.x);
    float wakeMask =
      smoothstep(0.0, uSpoutWakeLength * 0.18, wakeBehind) *
      (1.0 - smoothstep(uSpoutWakeLength * 0.74, uSpoutWakeLength, wakeBehind));
    float wakeWidth = uSpoutRadius * (1.2 + wakeBehind / max(1.0, uSpoutWakeLength) * 1.15);
    float wakeInfluence = wakeMask * exp(-(wakeCross * wakeCross) / max(1.0, wakeWidth * wakeWidth));
    displaced.y +=
      sin(warpedSpoutDistance * 0.58 - uTime * 4.1) *
      0.11 *
      spoutInfluence *
      uSpoutOpacity;
    displaced.y +=
      sin(wakeBehind * 0.36 - uTime * 4.7 + wakeCross * 0.12) *
      0.16 *
      wakeInfluence *
      uSpoutOpacity;

    vWorldPosition = displaced;
    vNormal = normalize(normal);
    vCrest = crest;
    vWaveHeight = displaced.y;

    gl_Position = projectionMatrix * viewMatrix * vec4(displaced, 1.0);
  }
`;

const OCEAN_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uFoamAmount;
  uniform float uStormDarkness;
  uniform float uRainOpacity;
  uniform float uLightningFlash;
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uFoamColor;
  uniform vec3 uSunDirection;
  uniform vec2 uSpoutCenter;
  uniform vec2 uSpoutDirection;
  uniform float uSpoutRadius;
  uniform float uSpoutOpacity;
  uniform float uSpoutWakeLength;

  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vWaveHeight;

  ${SKY_FUNCTION}

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += valueNoise(p) * amplitude;
      p = p * 2.03 + vec2(17.2, 9.4);
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);

    vec2 detailUv = vWorldPosition.xz * 2.35 + vec2(uTime * 0.24, -uTime * 0.36);
    float detail = fbm(detailUv);
    float detailDx = fbm(detailUv + vec2(0.19, 0.0));
    float detailDz = fbm(detailUv + vec2(0.0, 0.19));
    vec2 detailGradient = vec2(detailDx - detail, detailDz - detail) / 0.19;
    normal = normalize(
      normal + vec3(detailGradient.x, 0.0, detailGradient.y) * (0.11 + uRainOpacity * 0.07)
    );

    float fresnel = 0.03 + 0.97 * pow(1.0 - max(dot(normal, viewDirection), 0.0), 5.0);
    vec3 reflection = stormSky(reflect(-viewDirection, normal), uStormDarkness, uLightningFlash);
    float heightMix = clamp(vWaveHeight * 0.12 + 0.52, 0.0, 1.0);
    vec3 water = mix(uDeepColor, uShallowColor, heightMix);
    water *= mix(vec3(1.0), vec3(0.44, 0.54, 0.62), uStormDarkness);

    float spec = pow(max(dot(reflect(-uSunDirection, normal), viewDirection), 0.0), 120.0);
    vec3 color = mix(water, reflection, fresnel * 0.56);
    color += vec3(0.86, 0.92, 1.0) * spec * (0.24 + uLightningFlash * 1.8);
    color += vec3(0.42, 0.66, 0.9) * uLightningFlash * 0.42;

    float foamControl = clamp(uFoamAmount, 0.0, 1.0);
    float foamGlobal = mix(0.04, 1.65, foamControl);
    float foamFbm = fbm(vWorldPosition.xz * 0.48 + vec2(uTime * 0.08, -uTime * 0.05));
    float fineFoam = fbm(vWorldPosition.xz * 1.65 + vec2(-uTime * 0.26, uTime * 0.17));
    float foamNoise = foamFbm * 0.28 + fineFoam * 0.18;
    float foamThreshold = mix(1.46, 0.22, foamControl);
    float foamWindow = mix(0.58, 0.24, foamControl);
    float crestFoam = smoothstep(foamThreshold, foamThreshold + foamWindow, vCrest + foamNoise);
    float rainFoam = smoothstep(0.2, 0.92, uRainOpacity) * fbm(vWorldPosition.xz * 2.35 + uTime * 0.34);
    float foam = clamp(crestFoam * foamGlobal + rainFoam * uRainOpacity * mix(0.04, 0.52, foamControl), 0.0, 1.0);
    vec2 spoutVector = vWorldPosition.xz - uSpoutCenter;
    float spoutDistance = length(spoutVector);
    float spoutAngle = atan(spoutVector.y, spoutVector.x);
    float ringWarp =
      (fbm(vec2(cos(spoutAngle), sin(spoutAngle)) * 3.2 + vec2(uTime * 0.13, -uTime * 0.09)) - 0.5) *
      uSpoutRadius *
      1.45;
    float warpedSpoutDistance = max(0.0, spoutDistance + ringWarp);
    float spoutRingCenter = max(2.0, uSpoutRadius * 2.1);
    float spoutRingWidth = max(1.4, uSpoutRadius * (0.72 + foamFbm * 0.18));
    float spoutRing = 1.0 - smoothstep(0.0, spoutRingWidth, abs(warpedSpoutDistance - spoutRingCenter));
    float spoutChurn =
      exp(-warpedSpoutDistance / max(1.0, uSpoutRadius * 2.4)) *
      fbm(vWorldPosition.xz * 1.05 + vec2(-uTime * 0.72, uTime * 0.38));
    float spoutFoam = clamp(
      (spoutRing * 0.22 + spoutChurn * 0.38) * uSpoutOpacity * mix(0.22, 1.18, foamControl),
      0.0,
      1.0
    );
    vec2 travelDir = normalize(uSpoutDirection);
    float wakeBehind = dot(spoutVector, -travelDir);
    float wakeCross = abs(spoutVector.x * travelDir.y - spoutVector.y * travelDir.x);
    float wakeMask =
      smoothstep(0.0, uSpoutWakeLength * 0.16, wakeBehind) *
      (1.0 - smoothstep(uSpoutWakeLength * 0.78, uSpoutWakeLength, wakeBehind));
    float wakeWidth = uSpoutRadius * (1.15 + wakeBehind / max(1.0, uSpoutWakeLength) * 1.25);
    float wakeEdge = exp(-(wakeCross * wakeCross) / max(1.0, wakeWidth * wakeWidth));
    float wakeNoise = fbm(vec2(wakeBehind * 0.06 - uTime * 0.42, wakeCross * 0.2 + uTime * 0.11));
    float wakeStreaks = smoothstep(0.22, 0.84, wakeNoise + fineFoam * 0.26);
    float wakeFoam = clamp(
      wakeMask * wakeEdge * wakeStreaks * uSpoutOpacity * 0.72 * mix(0.22, 1.18, foamControl),
      0.0,
      1.0
    );
    foam = max(foam, spoutFoam);
    foam = max(foam, wakeFoam);
    color = mix(color, uFoamColor, foam * (0.34 + foamControl * 0.52));

    gl_FragColor = vec4(color, 1.0);
  }
`;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = (modelMatrix * vec4(position, 1.0)).xyz;
    vec4 positionClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = positionClip.xyww;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uStormDarkness;
  uniform float uRainOpacity;
  uniform float uLightningFlash;

  varying vec3 vDirection;

  ${SKY_FUNCTION}

  float hash21(vec2 p) {
    p = fract(p * vec2(431.21, 217.13));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float skyFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.54;
    mat2 rotate = mat2(0.82, -0.57, 0.57, 0.82);
    for (int i = 0; i < 5; i++) {
      value += valueNoise(p) * amplitude;
      p = rotate * p * 2.08 + vec2(13.7, 6.9);
      amplitude *= 0.52;
    }
    return value;
  }

  void main() {
    vec3 dir = normalize(vDirection);
    vec3 color = stormSky(dir, uStormDarkness, uLightningFlash);
    float cloudBand = smoothstep(-0.06, 0.26, dir.y) * (1.0 - smoothstep(0.42, 0.86, dir.y));
    float cloudBase = skyFbm(dir.xz * 2.65 + vec2(uTime * 0.012, -uTime * 0.008));
    float cloudDetail = skyFbm(dir.xz * 9.2 + vec2(-uTime * 0.024, uTime * 0.017));
    float cloudWisps = skyFbm(dir.xz * 23.0 + vec2(uTime * 0.041, uTime * 0.027));
    float cloudShape = cloudBase * 0.72 + cloudDetail * 0.23 + cloudWisps * 0.08 + uStormDarkness * 0.38;
    float cloud = cloudBand * smoothstep(0.42, 0.82, cloudShape);
    color = mix(color, vec3(0.035, 0.045, 0.065), cloud * (0.55 + uStormDarkness * 0.35));
    color += vec3(0.55, 0.75, 1.0) * uLightningFlash * (0.35 + cloud * 0.75);
    color = mix(color, vec3(0.04, 0.055, 0.075), uRainOpacity * 0.08);
    float backgroundDither = (hash21(gl_FragCoord.xy + vec2(uTime * 17.0, -uTime * 9.0)) - 0.5) / 255.0;
    color += vec3(backgroundDither);
    gl_FragColor = vec4(color, 1.0);
  }
`;

const oceanUniforms = () => ({
  uTime: { value: 0 },
  uWaveCount: { value: 0 },
  uWaveA: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
  uWaveB: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
  uFoamAmount: { value: 0.72 },
  uStormDarkness: { value: 0.67 },
  uRainOpacity: { value: 0.6 },
  uLightningFlash: { value: 0 },
  uDeepColor: { value: new THREE.Color('#031927') },
  uShallowColor: { value: new THREE.Color('#147083') },
  uFoamColor: { value: new THREE.Color('#d9f5ff') },
  uSunDirection: { value: new THREE.Vector3(0.36, 0.72, 0.58).normalize() },
  uSpoutCenter: { value: new THREE.Vector2(0, -86) },
  uSpoutDirection: { value: new THREE.Vector2(0, 1) },
  uSpoutRadius: { value: 12 },
  uSpoutOpacity: { value: 0 },
  uSpoutWakeLength: { value: 72 }
});

const skyUniforms = () => ({
  uTime: { value: 0 },
  uStormDarkness: { value: 0.67 },
  uRainOpacity: { value: 0.6 },
  uLightningFlash: { value: 0 }
});

export function createOceanMaterial(waves, settings) {
  const material = new THREE.ShaderMaterial({
    side: THREE.FrontSide,
    uniforms: oceanUniforms(),
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT
  });
  updateOceanMaterialWaves(material, waves);
  material.uniforms.uFoamAmount.value = settings.foamAmount ?? 0.72;
  return material;
}

export function updateOceanMaterialWaves(material, waves) {
  material.uniforms.uWaveCount.value = Math.min(waves.length, MAX_WAVES);

  for (let i = 0; i < MAX_WAVES; i += 1) {
    const wave = waves[i];
    if (wave) {
      material.uniforms.uWaveA.value[i].set(wave.dirX, wave.dirZ, wave.steepness, wave.k);
      material.uniforms.uWaveB.value[i].set(wave.omega, wave.phase, wave.amplitude, 0);
    } else {
      material.uniforms.uWaveA.value[i].set(0, 0, 0, 0);
      material.uniforms.uWaveB.value[i].set(0, 0, 0, 0);
    }
  }
}

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: skyUniforms(),
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT
  });
}

export function updateStormUniforms(materials, state) {
  for (const material of materials) {
    if (!material?.uniforms) continue;
    if (material.uniforms.uStormDarkness) {
      material.uniforms.uStormDarkness.value = state.cloudDarkness;
    }
    if (material.uniforms.uRainOpacity) {
      material.uniforms.uRainOpacity.value = state.rainOpacity;
    }
    if (material.uniforms.uLightningFlash) {
      material.uniforms.uLightningFlash.value = state.lightningFlash;
    }
    if (material.uniforms.uFoamAmount) {
      material.uniforms.uFoamAmount.value = state.foamBoost;
    }
    if (material.uniforms.uSpoutCenter && state.waterSpout) {
      material.uniforms.uSpoutCenter.value.set(state.waterSpout.x, state.waterSpout.z);
    }
    if (material.uniforms.uSpoutDirection && state.waterSpout) {
      material.uniforms.uSpoutDirection.value.set(state.waterSpout.directionX ?? 0, state.waterSpout.directionZ ?? 1);
    }
    if (material.uniforms.uSpoutRadius) {
      material.uniforms.uSpoutRadius.value = state.sprayRadius;
    }
    if (material.uniforms.uSpoutOpacity && state.waterSpout) {
      material.uniforms.uSpoutOpacity.value = state.waterSpout.opacity;
    }
    if (material.uniforms.uSpoutWakeLength && state.waterSpout) {
      material.uniforms.uSpoutWakeLength.value = state.waterSpout.wakeLength ?? state.sprayRadius * 5;
    }
  }
}
