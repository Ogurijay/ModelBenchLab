import * as THREE from "three";
import { makeRng, GLSL_NOISE } from "../core/NoiseKit.js";

const SWELL_COUNT = 4;
const CHOP_COUNT = 5;
const GRAVITY = 9.81;

/**
 * Two-tier Gerstner ocean:
 *  - "swell": a handful of long, slow waves with fixed directions that are
 *    always present at low amplitude — the ocean never goes glass-flat.
 *  - "chop": short waves whose amplitude and direction continuously chase
 *    the live wind vector supplied by StormSystem, so the sea visibly
 *    reorganizes itself as a storm cell sweeps overhead.
 * Both tiers share one analytic-normal Gerstner formulation (GPU Gems 1,
 * ch.1) computed entirely in the vertex shader; the fragment shader only
 * adds a fine noise-based ripple and shades the result.
 */
export class Ocean {
  constructor({ size = 3200, segments = 220, seed = 20260701 } = {}) {
    const rng = makeRng(seed);

    this.swellWaves = [];
    for (let i = 0; i < SWELL_COUNT; i++) {
      const angle = (i / SWELL_COUNT) * Math.PI * 2 + (rng() - 0.5) * 0.7;
      this.swellWaves.push({
        dir: [Math.cos(angle), Math.sin(angle)],
        wavelength: 55 + rng() * 110,
        steepness: 0.22 + rng() * 0.1,
        phase: rng() * Math.PI * 2,
      });
    }

    this.chopWaves = [];
    for (let i = 0; i < CHOP_COUNT; i++) {
      this.chopWaves.push({
        angleJitter: (rng() - 0.5) * 1.3,
        wavelength: 5 + rng() * 13,
        steepness: 0.3 + rng() * 0.3,
        phase: rng() * Math.PI * 2,
      });
    }

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWindDir: { value: new THREE.Vector2(1, 0) },
        uWindSpeed: { value: 0 },
        uRainIntensity: { value: 0 },

        uSwellDir: { value: this.swellWaves.map((w) => new THREE.Vector2(...w.dir)) },
        uSwellWavelength: { value: this.swellWaves.map((w) => w.wavelength) },
        uSwellSteepness: { value: this.swellWaves.map((w) => w.steepness) },
        uSwellPhase: { value: this.swellWaves.map((w) => w.phase) },

        uChopAngleJitter: { value: this.chopWaves.map((w) => w.angleJitter) },
        uChopWavelength: { value: this.chopWaves.map((w) => w.wavelength) },
        uChopSteepness: { value: this.chopWaves.map((w) => w.steepness) },
        uChopPhase: { value: this.chopWaves.map((w) => w.phase) },

        uSunDirection: { value: new THREE.Vector3(0.35, 0.55, -0.4).normalize() },
        uSunColor: { value: new THREE.Color(0xfff2d9) },
        uSkyZenith: { value: new THREE.Color(0x1a3a63) },
        uSkyHorizon: { value: new THREE.Color(0x9fc6dd) },
        uDeepColor: { value: new THREE.Color(0x012434) },
        uCloudDarkness: { value: 0 },
        uExposure: { value: 1.0 },
        uFogColor: { value: new THREE.Color(0x1a2a38) },
        uFogDensity: { value: 0.0018 },

        uFlashIntensity: { value: 0 },
        uFlashWorldPos: { value: new THREE.Vector3(0, 0, 0) },
        uFlashColor: { value: new THREE.Color(0xdfe8ff) },
      },
      vertexShader: /* glsl */ `
        #define SWELL_COUNT ${SWELL_COUNT}
        #define CHOP_COUNT ${CHOP_COUNT}
        #define GRAVITY_ 9.81

        uniform float uTime;
        uniform vec2 uWindDir;
        uniform float uWindSpeed;
        uniform float uRainIntensity;

        uniform vec2 uSwellDir[SWELL_COUNT];
        uniform float uSwellWavelength[SWELL_COUNT];
        uniform float uSwellSteepness[SWELL_COUNT];
        uniform float uSwellPhase[SWELL_COUNT];

        uniform float uChopAngleJitter[CHOP_COUNT];
        uniform float uChopWavelength[CHOP_COUNT];
        uniform float uChopSteepness[CHOP_COUNT];
        uniform float uChopPhase[CHOP_COUNT];

        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying float vFoam;

        vec2 rotate2(vec2 v, float a) {
          float s = sin(a);
          float c = cos(a);
          return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
        }

        // Accumulates one Gerstner wave's contribution into the running
        // displacement + the two surface tangents used for the analytic normal.
        void gerstner(vec2 dir, float wavelength, float steepness, float phase, vec2 pos, float t,
                       inout vec3 disp, inout vec3 tangentX, inout vec3 tangentZ) {
          float k = 6.28318530718 / max(wavelength, 0.001);
          float c = sqrt(GRAVITY_ / k);
          float a = steepness / k;
          float f = k * dot(dir, pos) - c * k * t + phase;
          float sinF = sin(f);
          float cosF = cos(f);

          disp.x += dir.x * a * cosF;
          disp.z += dir.y * a * cosF;
          disp.y += a * sinF;

          float ak = a * k;
          tangentX.x -= dir.x * dir.x * steepness * sinF;
          tangentX.z -= dir.x * dir.y * steepness * sinF;
          tangentX.y += dir.x * ak * cosF;

          tangentZ.x -= dir.x * dir.y * steepness * sinF;
          tangentZ.z -= dir.y * dir.y * steepness * sinF;
          tangentZ.y += dir.y * ak * cosF;
        }

        void main() {
          vec3 basePos = position;
          vec2 flatPos = basePos.xz + vec2(modelMatrix[3][0], modelMatrix[3][2]);

          vec3 disp = vec3(0.0);
          vec3 tangentX = vec3(1.0, 0.0, 0.0);
          vec3 tangentZ = vec3(0.0, 0.0, 1.0);

          for (int i = 0; i < SWELL_COUNT; i++) {
            gerstner(uSwellDir[i], uSwellWavelength[i], uSwellSteepness[i] * 0.65,
                      uSwellPhase[i], flatPos, uTime, disp, tangentX, tangentZ);
          }

          float chopAmp = smoothstep(0.0, 14.0, uWindSpeed);
          for (int i = 0; i < CHOP_COUNT; i++) {
            vec2 dir = rotate2(uWindDir, uChopAngleJitter[i]);
            gerstner(dir, uChopWavelength[i], uChopSteepness[i] * chopAmp,
                      uChopPhase[i], flatPos, uTime, disp, tangentX, tangentZ);
          }

          vec3 displaced = basePos + disp;
          vNormal = normalize(cross(tangentZ, tangentX));

          // Jacobian of the horizontal displacement collapses toward 0 at
          // sharp wave crests — that pinch is where foam wants to appear.
          float jacobian = tangentX.x * tangentZ.z - tangentX.z * tangentZ.x;
          vFoam = clamp(1.0 - jacobian, 0.0, 3.0) * (0.4 + 0.6 * chopAmp);
          vFoam += uRainIntensity * 0.12;

          vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: /* glsl */ `
        ${GLSL_NOISE}

        uniform vec3 uSunDirection;
        uniform vec3 uSunColor;
        uniform vec3 uSkyZenith;
        uniform vec3 uSkyHorizon;
        uniform vec3 uDeepColor;
        uniform float uCloudDarkness;
        uniform float uExposure;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform float uTime;
        uniform float uRainIntensity;
        uniform float uFlashIntensity;
        uniform vec3 uFlashWorldPos;
        uniform vec3 uFlashColor;

        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying float vFoam;

        // Grid of independently-timed expanding rings — cheap stand-in for
        // raindrops striking the surface, no render-target ping-pong needed.
        float rainRipples(vec2 p, float t) {
          vec2 cell = floor(p);
          float total = 0.0;
          for (int oy = -1; oy <= 1; oy++) {
            for (int ox = -1; ox <= 1; ox++) {
              vec2 c = cell + vec2(float(ox), float(oy));
              float h = hash21(c);
              float period = 0.55 + h * 0.5;
              float phase = fract(t / period + h);
              vec2 jitter = vec2(hash21(c + 17.3), hash21(c + 91.7));
              vec2 center = c + jitter;
              float d = distance(p, center);
              float ringR = phase * 1.1;
              float ring = clamp(1.0 - abs(d - ringR) * 7.0, 0.0, 1.0);
              total += ring * (1.0 - phase) * (1.0 - phase);
            }
          }
          return total;
        }

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);

          // Fine ripple detail well below vertex resolution — rain visibly
          // dapples the surface once uRainIntensity climbs.
          vec2 rp = vWorldPosition.xz * 0.35 + uTime * 0.15;
          float ripple = fbm(rp, 4) - 0.5;
          vec3 n = normalize(vNormal + vec3(ripple * (0.06 + uRainIntensity * 0.22), 0.0,
                                             (fbm(rp + 11.3, 4) - 0.5) * (0.06 + uRainIntensity * 0.22)));

          float rippleGlow = 0.0;
          if (uRainIntensity > 0.01) {
            vec2 rp2 = vWorldPosition.xz * 0.9;
            float eps = 0.15;
            float r0 = rainRipples(rp2, uTime);
            float rx = rainRipples(rp2 + vec2(eps, 0.0), uTime);
            float rz = rainRipples(rp2 + vec2(0.0, eps), uTime);
            vec2 rippleGrad = vec2(rx - r0, rz - r0) / eps;
            n = normalize(n + vec3(rippleGrad.x, 0.0, rippleGrad.y) * uRainIntensity * 0.9);
            rippleGlow = r0 * uRainIntensity;
          }

          vec3 sunDir = normalize(uSunDirection);
          float fresnel = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 5.0);
          fresnel = mix(0.02, 1.0, fresnel);

          vec3 skyColor = mix(uSkyHorizon, uSkyZenith, pow(clamp(viewDir.y * 0.5 + 0.5, 0.0, 1.0), 0.4));
          skyColor = mix(skyColor, skyColor * 0.35 + 0.02, uCloudDarkness);

          vec3 reflectColor = mix(uDeepColor, skyColor, 0.75);
          vec3 waterColor = mix(uDeepColor, reflectColor, fresnel);

          vec3 halfVec = normalize(sunDir + viewDir);
          float specAngle = clamp(dot(n, halfVec), 0.0, 1.0);
          float spec = pow(specAngle, 380.0) * 3.2 + pow(specAngle, 40.0) * 0.35;
          spec *= (1.0 - uCloudDarkness * 0.85);
          waterColor += uSunColor * spec;

          // Backlit translucency near grazing angles, only under open sky.
          float rim = pow(clamp(1.0 - dot(n, viewDir), 0.0, 1.0), 3.0);
          float sunFacing = clamp(dot(viewDir, -sunDir), 0.0, 1.0);
          waterColor += uSunColor * rim * sunFacing * 0.25 * (1.0 - uCloudDarkness);

          float foamMask = smoothstep(0.55, 1.4, vFoam);
          float foamMottle = fbm(vWorldPosition.xz * 0.6 + uTime * 0.05, 3);
          foamMask *= 0.55 + 0.45 * foamMottle;
          vec3 foamColor = vec3(0.92, 0.95, 0.98) * (0.7 + 0.3 * (1.0 - uCloudDarkness));
          waterColor = mix(waterColor, foamColor, clamp(foamMask, 0.0, 0.85));
          waterColor += vec3(0.55, 0.68, 0.8) * rippleGlow * 0.5;

          float dist = length(cameraPosition - vWorldPosition);
          float fogFactor = 1.0 - exp(-uFogDensity * dist);
          waterColor = mix(waterColor, uFogColor, clamp(fogFactor, 0.0, 1.0));

          float flashDist = length(vWorldPosition - uFlashWorldPos);
          float flashFalloff = uFlashIntensity * exp(-flashDist * 0.01);
          waterColor += uFlashColor * flashFalloff * 1.4;
          waterColor += uFlashColor * uFlashIntensity * 0.12;

          waterColor *= uExposure;
          gl_FragColor = vec4(waterColor, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.matrixAutoUpdate = true;
    this.material = material;
    this._followSnap = size / segments;
  }

  /** Keeps the finite plane centered under the camera so the ocean reads as infinite. */
  followCamera(camera) {
    const snap = this._followSnap;
    this.mesh.position.x = Math.round(camera.position.x / snap) * snap;
    this.mesh.position.z = Math.round(camera.position.z / snap) * snap;
  }

  update(elapsed, weather) {
    const u = this.material.uniforms;
    u.uTime.value = elapsed;
    u.uWindDir.value.set(weather.windDir.x, weather.windDir.y);
    u.uWindSpeed.value = weather.windSpeed;
    u.uRainIntensity.value = weather.rainIntensity;
    u.uCloudDarkness.value = weather.skyDarkness;
    u.uExposure.value = weather.exposure;
    u.uFogDensity.value = weather.fogDensity;
    u.uSunDirection.value.copy(weather.sunDirection);
    u.uSkyZenith.value.copy(weather.skyZenith);
    u.uSkyHorizon.value.copy(weather.skyHorizon);
    u.uFogColor.value.copy(weather.fogColor);
  }

  setFlash(worldPos, intensity, color) {
    const u = this.material.uniforms;
    u.uFlashWorldPos.value.copy(worldPos);
    u.uFlashIntensity.value = intensity;
    if (color) u.uFlashColor.value.copy(color);
  }

  /** CPU mirror of the swell tier only — cheap enough to call every frame for camera clamping. */
  getSwellHeight(x, z, t) {
    let y = 0;
    for (const w of this.swellWaves) {
      const k = (Math.PI * 2) / w.wavelength;
      const c = Math.sqrt(GRAVITY / k);
      const a = (w.steepness * 0.65) / k;
      const f = k * (w.dir[0] * x + w.dir[1] * z) - c * k * t + w.phase;
      y += a * Math.sin(f);
    }
    return y;
  }

  /** CPU mirror of the full swell+chop sum, for boat buoyancy sampling. */
  getWaveHeight(x, z, t, windDir, windSpeed) {
    let y = this.getSwellHeight(x, z, t);
    const chopAmp = Math.max(0, Math.min(1, windSpeed / 14));
    if (chopAmp <= 0) return y;
    for (const w of this.chopWaves) {
      const cosA = Math.cos(w.angleJitter);
      const sinA = Math.sin(w.angleJitter);
      const dirX = cosA * windDir.x - sinA * windDir.y;
      const dirZ = sinA * windDir.x + cosA * windDir.y;
      const k = (Math.PI * 2) / w.wavelength;
      const c = Math.sqrt(GRAVITY / k);
      const a = (w.steepness * chopAmp) / k;
      const f = k * (dirX * x + dirZ * z) - c * k * t + w.phase;
      y += a * Math.sin(f);
    }
    return y;
  }
}
