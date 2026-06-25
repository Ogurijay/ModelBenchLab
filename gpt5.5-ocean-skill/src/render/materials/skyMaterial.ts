import * as THREE from "three";

const vertexShader = /* glsl */ `
varying vec3 vWorldDirection;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldDirection = normalize(worldPosition.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform vec3 uSunDirection;
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uSunColor;

varying vec3 vWorldDirection;

void main() {
  vec3 direction = normalize(vWorldDirection);
  float skyGradient = pow(clamp(direction.y * 0.5 + 0.5, 0.0, 1.0), 0.78);
  float horizonWarmth = pow(1.0 - abs(direction.y), 4.0);
  float sunDisc = smoothstep(0.9982, 1.0, dot(direction, normalize(uSunDirection)));
  float sunGlow = pow(max(dot(direction, normalize(uSunDirection)), 0.0), 18.0);

  vec3 color = mix(uHorizonColor, uZenithColor, skyGradient);
  color += vec3(0.46, 0.25, 0.1) * horizonWarmth * 0.18;
  color += uSunColor * sunGlow * 0.28 + uSunColor * sunDisc * 3.2;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSkyDome(sunDirection: THREE.Vector3): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(900, 48, 24);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: sunDirection.clone() },
      uZenithColor: { value: new THREE.Color("#3f8fb3") },
      uHorizonColor: { value: new THREE.Color("#f1bf85") },
      uSunColor: { value: new THREE.Color("#ffe0a3") },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "SkyDome";
  mesh.frustumCulled = false;
  return mesh;
}
