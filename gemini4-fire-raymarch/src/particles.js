// 伴随粒子现象系统 (particles.js)：
// 1. SparksSystem (火星)：确定性种子驱动的浮力-湍流-风偏转三维火星粒子，支持“添柴爆火星”爆发；
// 2. SmokePlumeSystem (伴随高空烟羽簇)：在体积光线步进烟柱之上补充随风飘散的柔光三维烟团。

import * as THREE from 'three';
import { mulberry32, curlFlow3 } from './noise.js';

const MAX_SPARKS = 280;
const MAX_SMOKE_PUFFS = 72;

export class SparksSystem {
  constructor(scene) {
    this.rand = mulberry32(20261118);

    this.pos = new Float32Array(MAX_SPARKS * 3);
    this.vel = new Float32Array(MAX_SPARKS * 3);
    this.age = new Float32Array(MAX_SPARKS);
    this.life = new Float32Array(MAX_SPARKS);
    this.heat = new Float32Array(MAX_SPARKS);
    this.seed = new Float32Array(MAX_SPARKS);

    this.activeQuota = 175;
    this.aliveCount = 0;

    for (let i = 0; i < MAX_SPARKS; i++) {
      this._respawn(i, true);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aHeat', new THREE.BufferAttribute(this.heat, 1));
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: 1.5 },
        uSpectrum: { value: 0 },
      },
      vertexShader: /* glsl */ `
        in float aHeat;
        out float vHeat;
        uniform float uPixelRatio;
        void main() {
          vHeat = aHeat;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float size = (9.5 + 14.5 * aHeat) * uPixelRatio / max(-mv.z, 0.35);
          gl_PointSize = clamp(size, 1.0, 28.0) * step(0.001, aHeat);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        in float vHeat;
        out vec4 outColor;
        uniform int uSpectrum;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(p, p);
          if (r2 > 1.0 || vHeat <= 0.001) discard;
          float core = exp(-r2 * 4.2);

          vec3 cLow = vec3(1.6, 0.18, 0.01);
          vec3 cMid = vec3(3.8, 1.35, 0.16);
          vec3 cHi  = vec3(6.8, 5.2, 3.0);
          if (uSpectrum == 2) {
            cLow = vec3(0.05, 1.4, 0.45);
            cMid = vec3(0.45, 3.6, 1.3);
            cHi  = vec3(3.8, 6.2, 4.2);
          } else if (uSpectrum == 3) {
            cLow = vec3(0.55, 0.12, 1.6);
            cMid = vec3(1.5, 0.75, 3.8);
            cHi  = vec3(4.2, 3.8, 6.5);
          }

          vec3 col = mix(cLow, cMid, smoothstep(0.0, 0.55, vHeat));
          col = mix(col, cHi, smoothstep(0.55, 1.0, vHeat));
          outColor = vec4(col * core, core * smoothstep(0.0, 0.18, vHeat));
        }
      `,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  _respawn(i, randomAge = false, burst = false) {
    const r = this.rand;
    const angle = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * (burst ? 0.34 : 0.26);
    const i3 = i * 3;

    this.pos[i3] = Math.cos(angle) * rad;
    this.pos[i3 + 1] = 0.14 + r() * 0.24;
    this.pos[i3 + 2] = Math.sin(angle) * rad;

    const lateralSpeed = burst ? 1.15 : 0.42;
    this.vel[i3] = (r() - 0.5) * lateralSpeed;
    this.vel[i3 + 1] = (burst ? 1.55 : 0.95) + r() * (burst ? 1.65 : 1.05);
    this.vel[i3 + 2] = (r() - 0.5) * lateralSpeed;

    this.life[i] = 1.05 + r() * 1.65;
    this.age[i] = randomAge ? r() * this.life[i] : 0;
    this.seed[i] = r() * 100;
  }

  /** 触发“添柴爆火星”：瞬间激活一批高初速火星 */
  triggerBurst(count = 55) {
    let spawned = 0;
    for (let i = 0; i < MAX_SPARKS && spawned < count; i++) {
      if (this.age[i] > this.life[i] * 0.45 || i >= this.activeQuota) {
        this._respawn(i, false, true);
        spawned++;
      }
    }
  }

  setPixelRatio(dpr) {
    this.material.uniforms.uPixelRatio.value = dpr;
  }

  update(dt, time, { intensity, turbulence, wind, stokeBoost = 0, spectrum = 0 }) {
    this.material.uniforms.uSpectrum.value = spectrum;
    const effIntensity = intensity + stokeBoost * 0.65;
    this.activeQuota = Math.min(
      MAX_SPARKS,
      Math.max(28, Math.round(MAX_SPARKS * Math.min(1.0, (effIntensity - 0.15) / 1.55)))
    );

    const [wx, wz] = wind;
    const buoyancy = 0.72 + 0.92 * effIntensity;
    const drag = Math.exp(-dt * 1.28);
    const turbScale = 0.65 + 1.45 * turbulence;

    let alive = 0;
    for (let i = 0; i < MAX_SPARKS; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        if (i < this.activeQuota) {
          this._respawn(i, false, false);
        } else {
          this.heat[i] = 0;
          continue;
        }
      }
      if (i >= this.activeQuota && this.age[i] < dt * 1.5) {
        this.heat[i] = 0;
        continue;
      }

      const i3 = i * 3;
      const px = this.pos[i3];
      const py = this.pos[i3 + 1];
      const pz = this.pos[i3 + 2];
      const s = this.seed[i];

      const [cx, cy, cz] = curlFlow3(px + s, py, pz - s, time);

      this.vel[i3] = (this.vel[i3] + (cx * turbScale + wx * 2.35) * dt) * drag;
      this.vel[i3 + 1] = (this.vel[i3 + 1] + (buoyancy + cy * 0.45 * turbScale) * dt) * drag;
      this.vel[i3 + 2] = (this.vel[i3 + 2] + (cz * turbScale + wz * 2.35) * dt) * drag;

      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;

      const u = this.age[i] / this.life[i];
      const flicker = 0.78 + 0.22 * Math.sin(time * 24.0 + s * 6.0);
      this.heat[i] = Math.max(0, Math.sin(Math.min(1, u * 6.0) * Math.PI * 0.5) * Math.pow(1 - u, 1.35) * flicker);
      alive++;
    }

    this.aliveCount = alive;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aHeat.needsUpdate = true;
  }
}

/** 伴随高空烟羽软粒子系统：与体积光线步进烟柱衔接，表现随热流与风向飘散的高空烟团 */
export class SmokePlumeSystem {
  constructor(scene) {
    this.rand = mulberry32(20261125);

    this.pos = new Float32Array(MAX_SMOKE_PUFFS * 3);
    this.vel = new Float32Array(MAX_SMOKE_PUFFS * 3);
    this.age = new Float32Array(MAX_SMOKE_PUFFS);
    this.life = new Float32Array(MAX_SMOKE_PUFFS);
    this.alpha = new Float32Array(MAX_SMOKE_PUFFS);
    this.size = new Float32Array(MAX_SMOKE_PUFFS);
    this.seed = new Float32Array(MAX_SMOKE_PUFFS);

    this.aliveCount = MAX_SMOKE_PUFFS;

    for (let i = 0; i < MAX_SMOKE_PUFFS; i++) {
      this._respawn(i, true, 1.0, [0.2, 0.1]);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uPixelRatio: { value: 1.5 },
        uFlicker: { value: 1.0 },
        uIntensity: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        in float aAlpha;
        in float aSize;
        out float vAlpha;
        out float vHeight;
        uniform float uPixelRatio;
        void main() {
          vAlpha = aAlpha;
          vHeight = position.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * uPixelRatio / max(-mv.z, 0.5), 2.0, 140.0);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        in float vAlpha;
        in float vHeight;
        out vec4 outColor;
        uniform float uFlicker;
        uniform float uIntensity;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(p, p);
          if (r2 > 1.0 || vAlpha <= 0.001) discard;
          float soft = pow(1.0 - r2, 2.2);
          float warmFactor = exp(-max(vHeight - 1.35, 0.0) * 1.15) * (0.45 + 0.55 * p.y);
          vec3 baseSmoke = vec3(0.032, 0.036, 0.048);
          vec3 warmGlow = vec3(0.85, 0.30, 0.06) * warmFactor * uFlicker * uIntensity;
          outColor = vec4(baseSmoke + warmGlow, soft * vAlpha);
        }
      `,
    });

    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  _respawn(i, randomAge, intensity, wind) {
    const r = this.rand;
    const i3 = i * 3;
    const hBase = 1.05 * Math.pow(intensity, 0.55);
    const angle = r() * Math.PI * 2;
    const rad = Math.sqrt(r()) * 0.22;

    this.pos[i3] = Math.cos(angle) * rad + wind[0] * 0.32;
    this.pos[i3 + 1] = hBase + r() * 0.35;
    this.pos[i3 + 2] = Math.sin(angle) * rad + wind[1] * 0.32;

    this.vel[i3] = (r() - 0.5) * 0.18 + wind[0] * 0.95;
    this.vel[i3 + 1] = 0.55 + r() * 0.42;
    this.vel[i3 + 2] = (r() - 0.5) * 0.18 + wind[1] * 0.95;

    this.life[i] = 2.4 + r() * 1.8;
    this.age[i] = randomAge ? r() * this.life[i] : 0;
    this.seed[i] = r() * 100;
  }

  setPixelRatio(dpr) {
    this.material.uniforms.uPixelRatio.value = dpr;
  }

  update(dt, time, { intensity, turbulence, wind, flicker }) {
    this.material.uniforms.uFlicker.value = flicker;
    this.material.uniforms.uIntensity.value = intensity;

    const [wx, wz] = wind;
    for (let i = 0; i < MAX_SMOKE_PUFFS; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this._respawn(i, false, intensity, wind);
      }

      const i3 = i * 3;
      const s = this.seed[i];
      const [cx, , cz] = curlFlow3(this.pos[i3] * 0.6 + s, this.pos[i3 + 1] * 0.6, this.pos[i3 + 2] * 0.6, time * 0.65);

      this.vel[i3] += (cx * 0.35 * turbulence + wx * 1.15 - this.vel[i3] * 0.45) * dt;
      this.vel[i3 + 2] += (cz * 0.35 * turbulence + wz * 1.15 - this.vel[i3 + 2] * 0.45) * dt;

      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;

      const u = this.age[i] / this.life[i];
      const fadeIn = Math.min(1, u * 3.8);
      const fadeOut = Math.pow(1 - u, 1.5);
      this.alpha[i] = fadeIn * fadeOut * 0.16 * Math.min(1.3, 0.6 + 0.45 * intensity);
      this.size[i] = 48 + u * 92;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAlpha.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
  }
}
