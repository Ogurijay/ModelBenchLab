import * as THREE from "three";

const vertexShader = /* glsl */ `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const fragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;

varying vec3 vWorldPosition;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.13, 289.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

void main() {
  vec2 p = vWorldPosition.xz;
  float broad = noise(p * 0.018);
  float fine = noise(p * 0.12);
  float ridges = 0.5 + 0.5 * sin(p.x * 0.16 + sin(p.y * 0.05) * 1.8);
  float reef = smoothstep(0.58, 0.9, noise(p * 0.032 + 18.4));

  float causticA = abs(sin(p.x * 0.29 + p.y * 0.13 + uTime * 0.55));
  float causticB = abs(sin(p.x * -0.18 + p.y * 0.24 - uTime * 0.42));
  float caustics = pow(max(causticA, causticB), 24.0) * 0.11;

  vec3 sand = vec3(0.26, 0.24, 0.17);
  vec3 paleSand = vec3(0.42, 0.37, 0.24);
  vec3 reefColor = vec3(0.06, 0.2, 0.22);
  vec3 color = mix(sand, paleSand, broad * 0.42 + ridges * 0.16 + fine * 0.08);
  color = mix(color, reefColor, reef * 0.36);
  color += vec3(0.13, 0.38, 0.37) * caustics;

  float distanceFade = smoothstep(25.0, 240.0, length(cameraPosition.xz - p));
  color = mix(color, vec3(0.04, 0.27, 0.32), distanceFade * 0.46);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface Seafloor {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  update: (time: number) => void;
  dispose: () => void;
}

export function createSeafloor(): Seafloor {
  const geometry = new THREE.PlaneGeometry(900, 900, 1, 1);
  geometry.rotateX(-Math.PI / 2);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "ClearWaterSeafloor";
  mesh.position.y = -8.5;
  mesh.frustumCulled = false;

  return {
    mesh,
    update: (time) => {
      material.uniforms.uTime.value = time;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
