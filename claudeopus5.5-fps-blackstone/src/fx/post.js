// 后期：主场景 → 视图模型（清深度叠加）→ 泛光 → 受伤/低血/闪光/色差/颗粒 → 色调映射输出。

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uDamage: { value: 0 },
    uDesat: { value: 0 },
    uFlash: { value: 0 },
    uAberr: { value: 0 },
    uGrain: { value: 0.018 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uDamage, uDesat, uFlash, uAberr, uGrain;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec2 c = vUv - 0.5;
      float r = length(c);
      float ab = uAberr * r * 0.02;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ab).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ab).b;
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(lum), uDesat);
      col *= uTint;
      col *= 1.0 - uVignette * smoothstep(0.3, 0.85, r);
      float edge = smoothstep(0.2, 0.75, r);
      col = mix(col, col * vec3(1.3, 0.35, 0.3) + vec3(0.18, 0.0, 0.0), clamp(uDamage * edge, 0.0, 1.0));
      col += vec3(1.0, 0.92, 0.82) * uFlash;
      float n = fract(sin(dot(vUv * vec2(12.9898, 78.233) + fract(uTime) * 7.0, vec2(1.0, 1.0))) * 43758.5453);
      col += (n - 0.5) * uGrain * (0.5 + lum);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    float fix1(float v) {
      // NaN 与自身比较为假；同时兜底 isnan/isinf
      if (!(v == v) || isnan(v)) return 0.0;
      if (isinf(v) || v > 512.0) return 512.0;
      return max(v, 0.0);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(fix1(c.r), fix1(c.g), fix1(c.b), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, vmScene, vmCamera, quality) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      type: THREE.HalfFloatType,
      samples: quality === 'low' ? 0 : 4,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.main = new RenderPass(scene, camera);
    this.vm = new RenderPass(vmScene, vmCamera);
    this.vm.clear = false;
    this.vm.clearDepth = true;
    this.composer.addPass(this.main);
    this.composer.addPass(this.vm);
    this.composer.addPass(new ShaderPass(SanitizeShader));
    if (quality !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.45, 0.92);
      this.composer.addPass(this.bloom);
    }
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.u = this.final.uniforms;
    this.damage = 0;
    this.flash = 0;
    this.aberr = 0;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
  }

  pulseDamage(k) {
    this.damage = Math.min(1.2, this.damage + k);
    this.aberr = Math.min(2.5, this.aberr + k * 2);
  }

  pulseFlash(k) {
    this.flash = Math.max(this.flash, k);
  }

  update(dt, time, lowHealth, dead) {
    this.damage = Math.max(0, this.damage - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.aberr = Math.max(0, this.aberr - dt * 4);
    this.u.uTime.value = time;
    this.u.uDamage.value = Math.max(this.damage, lowHealth * 0.45 * (0.75 + 0.25 * Math.sin(time * 5)));
    this.u.uDesat.value = Math.max(lowHealth * 0.55, dead ? 0.85 : 0);
    this.u.uFlash.value = this.flash;
    this.u.uAberr.value = this.aberr + lowHealth * 0.6;
  }

  render(dt) {
    this.composer.render(dt);
  }
}
