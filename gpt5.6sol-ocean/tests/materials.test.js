import { describe, expect, it } from 'vitest';
import { createWaveSpectrum } from '../src/ocean/spectrum.js';
import { ENVIRONMENT_PRESETS } from '../src/environment/presets.js';
import {
  createOceanMaterial,
  updateOceanEnvironment,
  updateOceanStorm
} from '../src/ocean/material.js';
import {
  createSkyMaterial,
  updateSkyEnvironment
} from '../src/environment/sky.js';

describe('shader material contracts', () => {
  it('uploads all twelve waves to the ocean material', () => {
    const material = createOceanMaterial(
      createWaveSpectrum(),
      ENVIRONMENT_PRESETS.noon
    );

    expect(material.isShaderMaterial).toBe(true);
    expect(material.uniforms.uWaveCount.value).toBe(12);
    expect(material.uniforms.uWaveA.value).toHaveLength(12);
    expect(material.vertexShader).toContain('uWaveA[MAX_WAVES]');
    expect(material.fragmentShader).toContain('fresnel');
  });

  it('updates ocean colors without replacing uniforms', () => {
    const material = createOceanMaterial(
      createWaveSpectrum(),
      ENVIRONMENT_PRESETS.noon
    );
    const deepUniform = material.uniforms.uDeepColor;

    updateOceanEnvironment(material, ENVIRONMENT_PRESETS.overcast);

    expect(material.uniforms.uDeepColor).toBe(deepUniform);
    expect(deepUniform.value.toArray()).toEqual(
      ENVIRONMENT_PRESETS.overcast.deepColor
    );
  });

  it('updates storm intensity without replacing the uniform', () => {
    const material = createOceanMaterial(
      createWaveSpectrum(),
      ENVIRONMENT_PRESETS.noon
    );
    const stormUniform = material.uniforms.uStormIntensity;

    expect(stormUniform.value).toBe(0);
    updateOceanStorm(material, 0.8);

    expect(material.uniforms.uStormIntensity).toBe(stormUniform);
    expect(stormUniform.value).toBe(0.8);
  });

  it('creates and updates the analytic sky material', () => {
    const material = createSkyMaterial(ENVIRONMENT_PRESETS.noon);

    expect(material.isShaderMaterial).toBe(true);
    updateSkyEnvironment(material, ENVIRONMENT_PRESETS.dawn);
    expect(material.uniforms.uSunDirection.value.length()).toBeCloseTo(1, 8);
    expect(material.uniforms.uCloudAmount.value).toBe(
      ENVIRONMENT_PRESETS.dawn.cloudAmount
    );
  });
});
