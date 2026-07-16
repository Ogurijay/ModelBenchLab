// 火星粒子:CPU 模拟(300 粒,定种可复现)+ GPU 点精灵渲染。
// 运动 = 热浮力(核心上方最强)+ 三维噪声湍流 + 风力横推 + 阻尼;
// 火势控制活跃数量与喷发力度。粒子画进 HDR 场景 RT(加色、不写深度):
// 天然被几何遮挡、被火焰体积正确包裹,并与全场一起过 ACES。

import * as THREE from 'three';
import { mulberry32, noise3 } from './noise.js';

const MAX = 300;

const VERT = /* glsl */ `
attribute float aLife;   // 0 新生 → 1 熄灭
attribute float aSeed;
attribute float aSize;
varying float vLife;
varying float vSeed;
uniform float uPixelRatio;
void main() {
  vLife = aLife;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float size = aSize * (1.0 - aLife * 0.45);
  gl_PointSize = size * uPixelRatio * 46.0 / max(-mv.z, 0.5);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
varying float vLife;
varying float vSeed;
uniform float uTime;
void main() {
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float d = dot(pc, pc);
  if (d > 1.0) discard;
  float soft = smoothstep(1.0, 0.18, d);
  // 亮橙黄新生 → 暗红将熄;快速闪烁模拟明灭
  float t = pow(vLife, 1.35);
  vec3 col = mix(vec3(4.2, 1.9, 0.5), vec3(0.9, 0.10, 0.008), t);
  float flick = 0.62 + 0.38 * sin(uTime * (9.0 + vSeed * 6.0) + vSeed * 80.0);
  gl_FragColor = vec4(col * soft * (1.0 - vLife) * flick, 1.0);
}
`;

export class Sparks {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.age = new Float32Array(MAX);
    this.life = new Float32Array(MAX);
    this.rng = mulberry32(77002026);

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aLife = new THREE.BufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
    const seeds = new Float32Array(MAX);
    const sizes = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) {
      seeds[i] = this.rng();
      sizes[i] = 0.55 + this.rng() * 0.75;
      this.age[i] = 1e3; // 全部以"已熄灭"起步,按火势逐渐点燃
      this.life[i] = 1;
    }
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aLife', this.aLife);
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.aliveCount = 0;
  }

  _respawn(i, intensity) {
    const r = this.rng;
    const ang = r() * Math.PI * 2;
    const rad = 0.05 + r() * 0.17;
    this.pos[i * 3] = Math.cos(ang) * rad;
    this.pos[i * 3 + 1] = 0.16 + r() * 0.3;
    this.pos[i * 3 + 2] = Math.sin(ang) * rad;
    const burst = 0.5 + r() * 0.9;
    this.vel[i * 3] = (r() - 0.5) * 0.5;
    this.vel[i * 3 + 1] = (0.9 + r() * 1.3) * burst * (0.6 + 0.4 * intensity);
    this.vel[i * 3 + 2] = (r() - 0.5) * 0.5;
    this.age[i] = 0;
    this.life[i] = 1.1 + r() * 2.3;
  }

  update(dt, time, { intensity, turbulence, wind }) {
    // 火势 → 活跃粒子配额(0.3 档约 60 粒,1.8 档满 300)
    const quota = Math.round(MAX * (0.12 + 0.88 * (intensity - 0.3) / 1.5));
    this.aliveCount = 0;

    const buoy = 1.15 + 0.85 * intensity;
    const drag = Math.exp(-dt * 0.55);
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] >= this.life[i]) {
        // 熄灭:限额内以一定概率重生,粒子流随火势自然增减
        if (i < quota && dt > 0 && this.rng() < dt * 2.2) this._respawn(i, intensity);
        else { this.aLife.array[i] = 1; continue; }
      }
      const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
      // 热浮力:靠近火焰轴心最强,升离后衰减
      const axial = Math.exp(-(x * x + z * z) * 2.0) * Math.exp(-Math.max(y - 1.4, 0) * 0.8);
      this.vel[i * 3 + 1] += buoy * (0.35 + 0.65 * axial) * dt;
      // 噪声湍流(受"湍流"参数)+ 风(受"风向/风力")
      this.vel[i * 3] += ((noise3(x * 2.6, y * 2.6, time * 1.4) - 0.5) * 4.2 * turbulence + wind[0] * 2.6) * dt;
      this.vel[i * 3 + 2] += ((noise3(z * 2.6 + 31, y * 2.6, time * 1.4 + 7) - 0.5) * 4.2 * turbulence + wind[1] * 2.6) * dt;
      this.vel[i * 3] *= drag;
      this.vel[i * 3 + 1] *= drag;
      this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.age[i] += dt;
      this.aLife.array[i] = Math.min(this.age[i] / this.life[i], 1);
      this.aliveCount++;
    }
    this.aPos.needsUpdate = true;
    this.aLife.needsUpdate = true;
    this.material.uniforms.uTime.value = time;
  }

  setPixelRatio(pr) {
    this.material.uniforms.uPixelRatio.value = pr;
  }
}
