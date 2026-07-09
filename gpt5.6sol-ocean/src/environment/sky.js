import * as THREE from 'three';

export const SKY_COLOR_GLSL = /* glsl */ `
  float skyHash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float skyNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 blend = local * local * (3.0 - 2.0 * local);
    float a = skyHash21(cell);
    float b = skyHash21(cell + vec2(1.0, 0.0));
    float c = skyHash21(cell + vec2(0.0, 1.0));
    float d = skyHash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
  }

  float skyFbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
    for (int octave = 0; octave < 5; octave++) {
      value += skyNoise(p) * amplitude;
      p = rotation * p * 2.03 + vec2(11.7, 7.3);
      amplitude *= 0.5;
    }
    return value;
  }

  vec3 oceanSkyColor(vec3 rawDirection) {
    vec3 direction = normalize(rawDirection);
    float elevation = clamp(direction.y, 0.0, 1.0);
    float gradient = pow(smoothstep(0.0, 0.84, elevation), 0.62);
    vec3 sky = mix(uSkyHorizon, uSkyZenith, gradient);

    float sunAlignment = max(dot(direction, normalize(uSunDirection)), 0.0);
    float sunDisc = smoothstep(0.99945, 0.99992, sunAlignment);
    float sunHalo = pow(sunAlignment, 48.0) * 0.28;
    sky += uSunColor * uSunIntensity * (sunDisc + sunHalo);

    vec2 cloudUv = direction.xz / max(0.18, 0.28 + elevation) * 1.42;
    cloudUv += vec2(uTime * 0.006, -uTime * 0.0035);
    float broadCloud = skyFbm(cloudUv);
    float cloudDetail = skyFbm(cloudUv * 3.1 - vec2(uTime * 0.009, 0.0));
    float cloudField = broadCloud * 0.76 + cloudDetail * 0.24;
    float threshold = mix(0.78, 0.39, uCloudAmount);
    float cloud = smoothstep(threshold, threshold + 0.19, cloudField);
    cloud *= smoothstep(-0.02, 0.18, direction.y);
    cloud *= 1.0 - smoothstep(0.68, 1.0, direction.y);
    float cloudShade = 0.38 + broadCloud * 0.42 + sunAlignment * 0.16;
    sky = mix(sky, uCloudColor * cloudShade, cloud * (0.28 + uCloudAmount * 0.54));

    float horizonHaze = pow(1.0 - elevation, 8.0);
    sky = mix(sky, uSkyHorizon * 1.04, horizonHaze * 0.38);
    return max(sky, vec3(0.0));
  }
`;

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vSkyDirection;

  void main() {
    vSkyDirection = position;
    vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = clipPosition.xyww;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform vec3 uCloudColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uSunIntensity;
  uniform float uCloudAmount;

  varying vec3 vSkyDirection;

  ${SKY_COLOR_GLSL}

  void main() {
    vec3 color = oceanSkyColor(vSkyDirection);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function color(values) {
  return new THREE.Color().fromArray(values);
}

function direction(values) {
  return new THREE.Vector3().fromArray(values).normalize();
}

export function createSkyMaterial(environment) {
  return new THREE.ShaderMaterial({
    name: 'GPT56SolAnalyticSky',
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uSkyZenith: { value: color(environment.skyZenith) },
      uSkyHorizon: { value: color(environment.skyHorizon) },
      uCloudColor: { value: color(environment.cloudColor) },
      uSunColor: { value: color(environment.sunColor) },
      uSunDirection: { value: direction(environment.sunDirection) },
      uSunIntensity: { value: environment.sunIntensity },
      uCloudAmount: { value: environment.cloudAmount }
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER
  });
}

export function updateSkyEnvironment(material, environment) {
  const { uniforms } = material;
  uniforms.uSkyZenith.value.fromArray(environment.skyZenith);
  uniforms.uSkyHorizon.value.fromArray(environment.skyHorizon);
  uniforms.uCloudColor.value.fromArray(environment.cloudColor);
  uniforms.uSunColor.value.fromArray(environment.sunColor);
  uniforms.uSunDirection.value.fromArray(environment.sunDirection).normalize();
  uniforms.uSunIntensity.value = environment.sunIntensity;
  uniforms.uCloudAmount.value = environment.cloudAmount;
}
