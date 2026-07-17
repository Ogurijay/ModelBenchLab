import * as THREE from 'three';
import { solarPosition } from '../core/math.js';
import { PROJECT, tagBenchRole } from '../config.js';

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDirection = normalize(world.xyz - cameraPosition);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uNight;
  uniform vec3 uSunDirection;
  uniform float uDaylight;
  uniform float uTwilight;
  varying vec3 vDirection;
  void main() {
    float h = smoothstep(-0.18, 0.72, vDirection.y);
    vec3 daylightSky = mix(uHorizon, uZenith, h);
    vec3 sky = mix(uNight, daylightSky, uDaylight);
    float sunDisc = pow(max(dot(normalize(vDirection), uSunDirection), 0.0), 720.0);
    float sunHalo = pow(max(dot(normalize(vDirection), uSunDirection), 0.0), 18.0);
    vec3 amber = vec3(1.0, 0.45, 0.16) * (0.35 + uTwilight * 0.8);
    sky += amber * sunHalo * 0.3 + vec3(1.0, 0.82, 0.54) * sunDisc * 2.0;
    gl_FragColor = vec4(sky, 1.0);
  }
`;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function createStars() {
  const count = 1500;
  const positions = new Float32Array(count * 3);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const y = 0.04 + 0.96 * ((index + 0.5) / count);
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * index + Math.sin(index * 12.9898) * 0.4;
    positions[index * 3] = Math.cos(theta) * radius * 430;
    positions[index * 3 + 1] = y * 430;
    positions[index * 3 + 2] = Math.sin(theta) * radius * 430;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xdbe8ff,
    size: 1.05,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return tagBenchRole(new THREE.Points(geometry, material), 'stars');
}

export function createSkySystem(scene) {
  const group = tagBenchRole(new THREE.Group(), 'day-night-system');
  group.name = 'Astronomical daylight — 40.7N';
  const uniforms = {
    uZenith: { value: new THREE.Color(0x3e789e) },
    uHorizon: { value: new THREE.Color(0xc8d2cb) },
    uNight: { value: new THREE.Color(0x02070d) },
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) },
    uDaylight: { value: 1 },
    uTwilight: { value: 0 },
  };
  const sky = tagBenchRole(new THREE.Mesh(
    new THREE.SphereGeometry(440, 32, 16),
    new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  ), 'procedural-sky');
  sky.frustumCulled = false;
  group.add(sky);
  const stars = createStars();
  group.add(stars);

  const sun = tagBenchRole(new THREE.Mesh(
    new THREE.SphereGeometry(6, 20, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe2a1, fog: false }),
  ), 'sun');
  const moon = tagBenchRole(new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 20, 12),
    new THREE.MeshBasicMaterial({ color: 0xcbd8df, fog: false }),
  ), 'moon');
  group.add(sun, moon);

  const sunlight = tagBenchRole(new THREE.DirectionalLight(0xffead0, 2.8), 'sun-light');
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -190, right: 190, top: 220, bottom: -220, near: 10, far: 720 });
  sunlight.shadow.bias = -0.00015;
  sunlight.target.position.set(0, 18, 10);
  group.add(sunlight, sunlight.target);
  const hemisphere = tagBenchRole(new THREE.HemisphereLight(0xa9d5ec, 0x263126, 1.15), 'hemisphere-light');
  group.add(hemisphere);
  scene.add(group);

  let currentSolar = solarPosition({ dayOfYear: PROJECT.dayOfYear, solarTimeHours: 8, latitudeDeg: PROJECT.latitude });
  let daylight = 1;
  const update = (timeHours) => {
    currentSolar = solarPosition({ dayOfYear: PROJECT.dayOfYear, solarTimeHours: timeHours, latitudeDeg: PROJECT.latitude });
    const altitude = THREE.MathUtils.degToRad(currentSolar.altitudeDeg);
    const azimuth = THREE.MathUtils.degToRad(currentSolar.azimuthDeg);
    const direction = new THREE.Vector3(
      Math.sin(azimuth) * Math.cos(altitude),
      Math.sin(altitude),
      Math.cos(azimuth) * Math.cos(altitude),
    ).normalize();
    daylight = clamp01((currentSolar.altitudeDeg + 7) / 22);
    const twilight = clamp01(1 - Math.abs(currentSolar.altitudeDeg) / 16);
    uniforms.uSunDirection.value.copy(direction);
    uniforms.uDaylight.value = daylight;
    uniforms.uTwilight.value = twilight;
    sun.position.copy(direction).multiplyScalar(360);
    moon.position.copy(direction).multiplyScalar(-360);
    sun.visible = currentSolar.altitudeDeg > -8;
    moon.visible = currentSolar.altitudeDeg < 12;
    sunlight.position.copy(direction).multiplyScalar(330);
    sunlight.intensity = 0.02 + Math.pow(daylight, 1.35) * 3.15;
    sunlight.color.setHSL(0.09, 0.62, 0.54 + daylight * 0.32);
    hemisphere.intensity = 0.1 + daylight * 1.15;
    stars.material.opacity = Math.pow(1 - daylight, 1.8) * 0.9;
    stars.rotation.y += 0.000035;
    return { ...currentSolar, daylight, twilight };
  };
  const dispose = () => {
    group.traverse((child) => {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material?.dispose();
    });
    group.removeFromParent();
  };
  return {
    group, sunlight, hemisphere, update, dispose,
    get daylight() { return daylight; },
    get solar() { return { ...currentSolar }; },
  };
}
