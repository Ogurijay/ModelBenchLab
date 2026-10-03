// 后期（postprocessing 库）：泛光、径向模糊、去饱和 / 对比度、胶片颗粒、暗角。
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, NoiseEffect, VignetteEffect,
  HueSaturationEffect, BrightnessContrastEffect, Effect, EffectAttribute, BlendFunction
} from 'postprocessing';

const radialFrag = /* glsl */`
uniform float strength;
uniform vec2 center;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (strength < 0.001) { outputColor = inputColor; return; }
  vec2 d = uv - center;
  float edge = smoothstep(0.08, 0.55, length(d));
  vec4 acc = vec4(0.0); float tot = 0.0;
  for (int i = 0; i < 12; i++) {
    float t = float(i) / 11.0;
    float w = 1.0 - t * 0.6;
    acc += texture2D(inputBuffer, uv - d * strength * edge * t) * w;
    tot += w;
  }
  outputColor = acc / tot;
}`;

/** 速度感径向模糊（只影响画面边缘） */
export class RadialBlurEffect extends Effect {
  constructor() {
    super('RadialBlurEffect', radialFrag, {
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([['strength', new THREE.Uniform(0)], ['center', new THREE.Uniform(new THREE.Vector2(0.5, 0.48))]])
    });
  }
  set strength(v) { this.uniforms.get('strength').value = v; }
}

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: Math.min(4, renderer.capabilities.maxSamples || 0) });
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new BloomEffect({ intensity: 0.8, luminanceThreshold: 0.72, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.7 });
    this.radial = new RadialBlurEffect();
    this.hue = new HueSaturationEffect({ saturation: 0 });
    this.bc = new BrightnessContrastEffect({ brightness: 0, contrast: 0 });
    this.noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
    this.noise.blendMode.opacity.value = 0.0;
    this.vignette = new VignetteEffect({ offset: 0.3, darkness: 0.4 });
    this.composer.addPass(new EffectPass(camera, this.bloom, this.hue, this.bc));
    this.composer.addPass(new EffectPass(camera, this.radial));
    this.composer.addPass(new EffectPass(camera, this.noise, this.vignette));
    // 情绪段叠加：去饱和/颗粒的额外量（0..1）
    this.mood = 0;
    this.base = { saturation: 0, contrast: 0, grain: 0, vignette: 0.35, bloom: 0.8 };
    this.cur = { ...this.base };
  }
  setSize(w, h) { this.composer.setSize(w, h); }
  applyPalette(pal) {
    this.base = { saturation: pal.saturation, contrast: pal.contrast, grain: pal.grain, vignette: pal.vignette, bloom: pal.bloom };
  }
  /** mood: 0 正常 → 1 痛苦/迷茫（去饱和 + 颗粒 + 暗角） */
  update(dt, speedBlur, mood) {
    this.mood += (mood - this.mood) * Math.min(1, dt * 1.5);
    const m = this.mood, b = this.base;
    this.hue.saturation = b.saturation * (1 - m) - 0.72 * m;
    this.bc.contrast = b.contrast * (1 - m) - 0.08 * m;
    this.bc.brightness = 0.02 * m;
    this.noise.blendMode.opacity.value = b.grain + 0.32 * m;
    this.vignette.darkness = b.vignette + 0.25 * m;
    this.bloom.intensity = b.bloom;
    this.radial.strength = speedBlur;
  }
  render(dt) { this.composer.render(dt); }
}
