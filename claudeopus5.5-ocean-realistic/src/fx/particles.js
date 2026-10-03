// 入水水花（GPU 点精灵，CPU 积分）与风暴雨幕（相机跟随的线段雨丝）。

import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

const SPLASH_VERT = /* glsl */ `
attribute float aLife;
attribute float aSize;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z) * smoothstep(0.0, 0.15, aLife);
  gl_Position = projectionMatrix * mv;
}
`;
const SPLASH_FRAG = /* glsl */ `
uniform vec3 uLight;
varying float vLife;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = dot(c, c);
  if (r > 0.25 || vLife <= 0.0) discard;
  float a = smoothstep(0.25, 0.05, r) * min(vLife * 1.6, 1.0) * 0.85;
  gl_FragColor = vec4(uLight * 0.9, a);
}
`;

export class Splashes {
  constructor(max = 1500) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.size = new Float32Array(max);
    this.cursor = 0;
    this.rand = mulberry32(77);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: SPLASH_VERT,
      fragmentShader: SPLASH_FRAG,
      uniforms: { uLight: { value: new THREE.Color(1, 1, 1) } },
      transparent: true,
      depthWrite: false
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  emit(position, strength = 1) {
    const n = Math.round(40 + 160 * strength);
    const r = this.rand;
    for (let i = 0; i < n; i++) {
      const k = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const a = r() * Math.PI * 2;
      const rad = 0.2 + r() * 0.8;
      const up = (2.5 + r() * 5.5) * (0.5 + strength);
      const out = (0.8 + r() * 2.5) * (0.6 + strength);
      this.pos[k * 3] = position.x + Math.cos(a) * rad;
      this.pos[k * 3 + 1] = position.y;
      this.pos[k * 3 + 2] = position.z + Math.sin(a) * rad;
      this.vel[k * 3] = Math.cos(a) * out;
      this.vel[k * 3 + 1] = up;
      this.vel[k * 3 + 2] = Math.sin(a) * out;
      this.life[k] = 0.8 + r() * 0.9;
      this.size[k] = 0.05 + r() * 0.18;
    }
    this.points.geometry.attributes.aSize.needsUpdate = true;
  }

  update(dt, ocean) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      alive++;
      this.vel[i * 3 + 1] -= 9.81 * dt;
      const drag = Math.exp(-0.6 * dt);
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.life[i] -= dt;
      if (this.vel[i * 3 + 1] < 0 && (i & 7) === 0 && this.pos[i * 3 + 1] < ocean.heightAt(this.pos[i * 3], this.pos[i * 3 + 2])) {
        this.life[i] = Math.min(this.life[i], 0.12);
      }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aLife.needsUpdate = true;
    this.points.visible = alive > 0;
  }
}

export class Rain {
  constructor(count = 9000, box = 60) {
    this.count = count;
    this.box = box;
    this.rand = mulberry32(31);
    const pos = new Float32Array(count * 6);
    this.offsets = new Float32Array(count * 3);
    this.speed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.offsets[i * 3] = (this.rand() - 0.5) * box;
      this.offsets[i * 3 + 1] = this.rand() * box * 0.6;
      this.offsets[i * 3 + 2] = (this.rand() - 0.5) * box;
      this.speed[i] = 9 + this.rand() * 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.LineBasicMaterial({ color: 0xaab4bf, transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.material);
    this.lines.frustumCulled = false;
    this.intensity = 0;
    this.wind = new THREE.Vector2();
  }

  update(dt, camera, intensity, windDirDeg, windSpeed) {
    this.intensity += (intensity - this.intensity) * Math.min(1, dt * 1.5);
    this.material.opacity = 0.32 * this.intensity;
    this.lines.visible = this.intensity > 0.01;
    if (!this.lines.visible) return;
    const a = (windDirDeg * Math.PI) / 180;
    const wx = Math.cos(a) * windSpeed * 0.35;
    const wz = Math.sin(a) * windSpeed * 0.35;
    const pos = this.lines.geometry.attributes.position.array;
    const B = this.box;
    const H = B * 0.6;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const active = Math.floor(this.count * this.intensity);
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      const s = this.speed[i];
      this.offsets[o] += wx * dt;
      this.offsets[o + 1] -= s * dt;
      this.offsets[o + 2] += wz * dt;
      if (this.offsets[o + 1] < 0) this.offsets[o + 1] += H;
      const x = cx + (((this.offsets[o] % B) + B * 1.5) % B) - B / 2;
      const z = cz + (((this.offsets[o + 2] % B) + B * 1.5) % B) - B / 2;
      const y = cy - H * 0.35 + this.offsets[o + 1];
      const p = i * 6;
      const len = i < active ? 0.045 : 0;
      pos[p] = x;
      pos[p + 1] = y;
      pos[p + 2] = z;
      pos[p + 3] = x - wx * len;
      pos[p + 4] = y + s * len;
      pos[p + 5] = z - wz * len;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
