import * as THREE from "three";
import { GLSL_NOISE } from "../core/NoiseKit.js";

const MAX_CELLS = 3;

/**
 * Camera-following sky dome. Its cloud layer is not just a global density
 * knob — up to MAX_CELLS active storm cells are projected onto the dome as
 * angular "dark patches" that track their true bearing from the camera, so
 * the sky visibly thickens in the direction a storm actually sits before it
 * arrives, and clears once it has drifted past.
 */
export class SkyDome {
  constructor() {
    const geometry = new THREE.SphereGeometry(4600, 32, 20);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunDirection: { value: new THREE.Vector3(0.35, 0.55, -0.4).normalize() },
        uSunColor: { value: new THREE.Color(0xfff2d9) },
        uSkyZenith: { value: new THREE.Color(0x1a3a63) },
        uSkyHorizon: { value: new THREE.Color(0x9fc6dd) },
        uCloudDensity: { value: 0.25 },
        uCloudDarkness: { value: 0 },
        uWindDir: { value: new THREE.Vector2(1, 0) },
        uWindSpeed: { value: 0 },
        uFlashIntensity: { value: 0 },
        uFlashDir: { value: new THREE.Vector3(0, 1, 0) },
        uFlashColor: { value: new THREE.Color(0xdfe8ff) },
        uCellDir: { value: Array.from({ length: MAX_CELLS }, () => new THREE.Vector2(0, 1)) },
        uCellAngular: { value: new Array(MAX_CELLS).fill(-1) },
        uCellStrength: { value: new Array(MAX_CELLS).fill(0) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        #define MAX_CELLS ${MAX_CELLS}
        ${GLSL_NOISE}

        varying vec3 vDir;

        uniform float uTime;
        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyHorizon;
        uniform float uCloudDensity;
        uniform float uCloudDarkness;
        uniform vec2 uWindDir;
        uniform float uWindSpeed;
        uniform float uFlashIntensity;
        uniform vec3 uFlashDir;
        uniform vec3 uFlashColor;
        uniform vec2 uCellDir[MAX_CELLS];
        uniform float uCellAngular[MAX_CELLS];
        uniform float uCellStrength[MAX_CELLS];

        void main() {
          vec3 dir = normalize(vDir);
          float elevation = clamp(dir.y, -1.0, 1.0);

          vec3 sunDir = normalize(uSunDirection);
          float sunDot = clamp(dot(dir, sunDir), 0.0, 1.0);

          vec3 sky = mix(uSkyHorizon, uSkyZenith, pow(clamp(elevation * 0.5 + 0.5, 0.0, 1.0), 0.45));

          // Cloud-plane projection of the view direction — reused both for
          // the darkness patches below and, warped, for the cloud noise field.
          vec2 cloudUv = dir.xz / max(0.15, abs(dir.y) + 0.15);

          // Local storm darkening: each active cell projects an angular dark
          // patch toward its true bearing from the camera. Cyclonic cells also
          // twist the cloud-sampling UV around their projected center, so the
          // noise field reads as spiral rain bands instead of a flat blob.
          float localDark = 0.0;
          float localCloud = 0.0;
          for (int i = 0; i < MAX_CELLS; i++) {
            if (uCellStrength[i] <= 0.0) continue;
            vec2 cd = normalize(uCellDir[i]);
            float bearingDot = dot(normalize(dir.xz + 1e-5), cd);
            float edge = uCellAngular[i];
            float cellPatch = smoothstep(edge - 0.18, edge + 0.12, bearingDot);
            cellPatch *= smoothstep(-0.2, 0.15, dir.y + 0.1);
            localDark += cellPatch * uCellStrength[i];
            localCloud += cellPatch * uCellStrength[i];

            vec2 cellCenterUv = cd * 3.7;
            vec2 toCell = cloudUv - cellCenterUv;
            float distToCell = length(toCell);
            float swirlAngle = uCellStrength[i] * 2.6 / (1.0 + distToCell * 0.12);
            float sA = sin(swirlAngle);
            float cA = cos(swirlAngle);
            toCell = vec2(toCell.x * cA - toCell.y * sA, toCell.x * sA + toCell.y * cA);
            cloudUv = cellCenterUv + toCell;
          }
          localDark = clamp(localDark, 0.0, 1.0);
          localCloud = clamp(localCloud, 0.0, 1.0);

          float totalDarkness = clamp(uCloudDarkness + localDark * 0.8, 0.0, 1.0);
          sky = mix(sky, sky * vec3(0.28, 0.3, 0.34) + 0.015, totalDarkness);

          // Sun disc + glow, dimmed under overcast.
          float glow = pow(sunDot, 420.0) * 6.0 + pow(sunDot, 12.0) * 0.4;
          sky += uSunColor * glow * (1.0 - totalDarkness * 0.9);

          // Two-octave scrolling cloud layer, denser locally under storm cells.
          vec2 scroll = uWindDir * uTime * (0.015 + uWindSpeed * 0.004);
          float cloudField = fbm(cloudUv * 0.35 + scroll, 5);
          float coverage = clamp(uCloudDensity + localCloud * 0.6, 0.0, 1.0);
          float clouds = smoothstep(1.0 - coverage, 1.0, cloudField);
          clouds *= smoothstep(-0.05, 0.25, dir.y);

          vec3 cloudColor = mix(vec3(1.0, 0.98, 0.94), vec3(0.15, 0.16, 0.19), totalDarkness);
          cloudColor += uSunColor * pow(sunDot, 3.0) * 0.3 * (1.0 - totalDarkness);
          sky = mix(sky, cloudColor, clouds * (0.55 + 0.45 * (1.0 - elevation * 0.3)));

          // Lightning flash lights the whole dome briefly from the strike bearing.
          float flashDot = clamp(dot(dir, normalize(uFlashDir)), -1.0, 1.0);
          float flashSpread = mix(0.15, 1.0, uFlashIntensity);
          sky += uFlashColor * uFlashIntensity * (0.25 + 0.75 * smoothstep(-0.3, flashSpread, flashDot));

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.material = material;
  }

  followCamera(camera) {
    this.mesh.position.copy(camera.position);
  }

  /** cellsRelative: array of {dirX, dirZ, angular, strength} already camera-relative. */
  update(elapsed, weather, cellsRelative) {
    const u = this.material.uniforms;
    u.uTime.value = elapsed;
    u.uSunDirection.value.copy(weather.sunDirection);
    u.uSkyZenith.value.copy(weather.skyZenith);
    u.uSkyHorizon.value.copy(weather.skyHorizon);
    u.uCloudDensity.value = weather.cloudDensity;
    u.uCloudDarkness.value = weather.skyDarkness;
    u.uWindDir.value.set(weather.windDir.x, weather.windDir.y);
    u.uWindSpeed.value = weather.windSpeed;

    for (let i = 0; i < MAX_CELLS; i++) {
      const cell = cellsRelative[i];
      if (!cell) {
        u.uCellStrength.value[i] = 0;
        continue;
      }
      u.uCellDir.value[i].set(cell.dirX, cell.dirZ);
      u.uCellAngular.value[i] = cell.angular;
      u.uCellStrength.value[i] = cell.strength;
    }
  }

  setFlash(intensity, worldDir, color) {
    const u = this.material.uniforms;
    u.uFlashIntensity.value = intensity;
    if (worldDir) u.uFlashDir.value.copy(worldDir);
    if (color) u.uFlashColor.value.copy(color);
  }
}
