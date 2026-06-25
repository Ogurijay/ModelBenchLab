import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('visual physics regression guards', () => {
  it('does not use a perfect torus for the water-spout spray ring', () => {
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

    expect(main).not.toContain('TorusGeometry');
    expect(main).not.toContain('new THREE.CircleGeometry(1, 96)');
    expect(main).toContain('createRaggedSprayRing');
    expect(main).toContain('createRaggedMistPatch');
    expect(main).toContain('createCondensationShoulder');
    expect(main).toContain('shoulderMaterial');
  });

  it('clips splash point sprites to remove square floating particles', () => {
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

    expect(main).toContain('if (d > 0.25) discard;');
    expect(main).toContain('gl_FragColor = vec4(uColor, soft * uOpacity)');
  });

  it('avoids blocky low-frequency water shadows during lightning flashes', () => {
    const materials = readFileSync(new URL('../src/ocean/materials.js', import.meta.url), 'utf8');

    expect(materials).not.toContain('valueNoise(vWorldPosition.xz * 0.62');
    expect(materials).not.toContain('abs(spoutDistance - spoutRingCenter)');
    expect(materials).toContain('warpedSpoutDistance');
    expect(materials).toContain('foamFbm');
  });

  it('uses multi-octave sky noise instead of blocky single-scale cloud cells', () => {
    const materials = readFileSync(new URL('../src/ocean/materials.js', import.meta.url), 'utf8');

    expect(materials).not.toContain('valueNoise(dir.xz * 4.0');
    expect(materials).toContain('float skyFbm');
    expect(materials).toContain('cloudDetail');
    expect(materials).toContain('backgroundDither');
  });

  it('uses a particle fog bank so storm haze is not just aggregated lines', () => {
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

    expect(main).toContain('createFogParticleBank');
    expect(main).toContain('new THREE.Points(geometry, fogMaterial)');
    expect(main).toContain('aFog');
    expect(main).toContain('fogParticles');
    expect(main).not.toContain('rainVeil.material.uniforms.uOpacity.value = state.rainVeilOpacity;');
  });

  it('randomizes rain direction with crosswind and depth drift per drop', () => {
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

    expect(main).toContain('directionJitter');
    expect(main).toContain('crosswind');
    expect(main).toContain('depthSlant');
  });

  it('renders rain as stochastic point-sprite streaks instead of additive line sheets', () => {
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const rainField = main.slice(main.indexOf('function createRainField'), main.indexOf('function createRainVeil'));

    expect(rainField).toContain('new THREE.Points(geometry, material)');
    expect(rainField).toContain('attribute vec4 aRain');
    expect(rainField).toContain('uFallSpeed');
    expect(rainField).not.toContain('new THREE.LineSegments');
    expect(rainField).not.toContain('THREE.AdditiveBlending');
  });

  it('keeps fog density from washing out rain brightness or foreground contrast', () => {
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

    expect(main).not.toContain('state.fogDensity * 18 + state.rainOpacity');
    expect(main).not.toContain("new THREE.Color('#b7c9cc')");
    expect(main).toContain('state.fogDensity * 4.2');
    expect(main).toContain('Math.min(state.fogDensity * 0.55, 0.018)');
  });

  it('makes foam amount a visible global strength control', () => {
    const materials = readFileSync(new URL('../src/ocean/materials.js', import.meta.url), 'utf8');

    expect(materials).toContain('foamGlobal');
    expect(materials).toContain('mix(0.04, 1.65, foamControl)');
    expect(materials).toContain('mix(0.22, 1.18, foamControl)');
  });

  it('renders water-spout travel as a directional wake instead of a static disk', () => {
    const materials = readFileSync(new URL('../src/ocean/materials.js', import.meta.url), 'utf8');
    const storm = readFileSync(new URL('../src/weather/storm.js', import.meta.url), 'utf8');

    expect(materials).toContain('uSpoutDirection');
    expect(materials).toContain('uSpoutWakeLength');
    expect(materials).toContain('wakeBehind');
    expect(storm).toContain('pathProgress');
    expect(storm).toContain('pathStartX');
    expect(storm).toContain('wakeLength');
  });

  it('connects visible rain density and foam strength to runtime controls', () => {
    const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
    const materials = readFileSync(new URL('../src/ocean/materials.js', import.meta.url), 'utf8');

    expect(main).toContain('setDrawRange');
    expect(main).toContain('rainVeilOpacity');
    expect(materials).toContain('foamControl');
    expect(materials).toContain('uFoamAmount');
  });
});
