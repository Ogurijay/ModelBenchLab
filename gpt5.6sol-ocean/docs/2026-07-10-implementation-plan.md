# GPT 5.6 SOL Ocean Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This repository already contains unrelated user changes, so every Git operation must be path-scoped and shared root files must remain unstaged.

**Goal:** Build a reproducible Three.js + WebGL realistic ocean with three button-selected lighting environments and integrate it into ModelBenchLab on port 3024.

**Architecture:** A pure JavaScript wind-spectrum module produces the 12 Gerstner waves used by both CPU tests and GPU uniforms. Separate ocean and sky ShaderMaterial modules render the scene, while a pure preset-transition module drives all environment uniforms. `main.js` only assembles scene objects, camera constraints, UI events, adaptive quality, diagnostics, and lifecycle handling.

**Tech Stack:** JavaScript ES modules, Three.js 0.185, WebGL/GLSL, Vite 8, Vitest 3.2.

---

## File map

- Create `gpt5.6sol-ocean/src/ocean/spectrum.js`: deterministic wave generation, CPU sampling, quality selection.
- Create `gpt5.6sol-ocean/src/environment/presets.js`: three preset definitions and pure transition state.
- Create `gpt5.6sol-ocean/src/environment/sky.js`: analytic sky ShaderMaterial and uniform updates.
- Create `gpt5.6sol-ocean/src/ocean/material.js`: ocean ShaderMaterial, wave upload, environment updates.
- Create `gpt5.6sol-ocean/src/ui/controls.js`: real DOM button and keyboard binding.
- Create `gpt5.6sol-ocean/src/main.js`: renderer, scene, camera, render loop, fallback, diagnostics.
- Create `gpt5.6sol-ocean/src/styles.css`: responsive visual shell.
- Create `gpt5.6sol-ocean/tests/spectrum.test.js`: wave and quality behavior.
- Create `gpt5.6sol-ocean/tests/presets.test.js`: preset completeness and interpolation.
- Create `gpt5.6sol-ocean/tests/materials.test.js`: ShaderMaterial uniform contract.
- Create `gpt5.6sol-ocean/tests/markup.test.js`: real HTML contract.
- Create `gpt5.6sol-ocean/index.html`, `package.json`, `README.md`, `HANDOVER.md`, `CHANGELOG.md`.
- Modify `benchmark/registry.json`, `package.json`, `package-lock.json`, `index.html`, `RULES.md`, `benchmark/tasks/code-to-3d/ocean.md` without discarding existing edits.

### Task 1: Deterministic wind spectrum

**Files:**
- Create: `gpt5.6sol-ocean/tests/spectrum.test.js`
- Create: `gpt5.6sol-ocean/src/ocean/spectrum.js`

- [ ] **Step 1: Write the failing spectrum tests**

```js
import { describe, expect, it } from 'vitest';
import {
  createWaveSpectrum,
  getQualityProfile,
  sampleWaveSurface,
  steepnessBudget
} from '../src/ocean/spectrum.js';

describe('wind-driven spectrum', () => {
  it('creates twelve deterministic, finite waves', () => {
    const first = createWaveSpectrum({ seed: 5601 });
    const second = createWaveSpectrum({ seed: 5601 });
    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    for (const wave of first) {
      expect(Object.values(wave).every(Number.isFinite)).toBe(true);
      expect(Math.hypot(wave.dirX, wave.dirZ)).toBeCloseTo(1, 8);
      expect(wave.wavelength).toBeGreaterThan(2);
      expect(wave.amplitude).toBeGreaterThan(0);
    }
  });

  it('keeps combined Gerstner steepness inside the safe budget', () => {
    expect(steepnessBudget(createWaveSpectrum())).toBeLessThanOrEqual(0.82);
  });

  it('samples a deterministic moving surface with a unit normal', () => {
    const waves = createWaveSpectrum();
    const first = sampleWaveSurface({ x: 7, z: -11, time: 0.25, waves });
    const repeated = sampleWaveSurface({ x: 7, z: -11, time: 0.25, waves });
    const later = sampleWaveSurface({ x: 7, z: -11, time: 0.9, waves });
    expect(first).toEqual(repeated);
    expect(later.height).not.toBeCloseTo(first.height, 5);
    expect(Math.hypot(first.normal.x, first.normal.y, first.normal.z)).toBeCloseTo(1, 8);
  });

  it('selects a lighter mobile geometry profile', () => {
    const desktop = getQualityProfile({ width: 1440, devicePixelRatio: 2, coarsePointer: false });
    const mobile = getQualityProfile({ width: 390, devicePixelRatio: 3, coarsePointer: true });
    expect(desktop.segments).toBe(384);
    expect(desktop.maxPixelRatio).toBe(1.75);
    expect(mobile.segments).toBe(224);
    expect(mobile.maxPixelRatio).toBe(1.25);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run gpt5.6sol-ocean/tests/spectrum.test.js`

Expected: FAIL because `../src/ocean/spectrum.js` does not exist.

- [ ] **Step 3: Implement the spectrum API**

Implement these exact public contracts in `src/ocean/spectrum.js`:

```js
export const MAX_WAVES = 12;
export const DEFAULT_SPECTRUM_SETTINGS = Object.freeze({
  seed: 5601,
  windDirection: 28,
  windSpeed: 16,
  waveScale: 1,
  choppiness: 0.78
});

export function createWaveSpectrum(options = {}) { /* returns 12 wave records */ }
export function steepnessBudget(waves) { /* sum q * k * amplitude */ }
export function sampleWaveSurface({ x, z, time, waves }) {
  /* returns { height, horizontalX, horizontalZ, crest, slope, normal:{x,y,z} } */
}
export function getQualityProfile({ width, devicePixelRatio, coarsePointer }) {
  /* returns desktop {384,1.75,'high'} or mobile {224,1.25,'mobile'} */
}
```

The generator must use a local Mulberry32 PRNG, deep-water dispersion `omega = sqrt(9.81 * k)`, wind-centered angular spread, long/mid/short wavelength bands, and a single `q` chosen so `steepnessBudget(waves) <= 0.82`. `sampleWaveSurface` must evaluate the same Gerstner phase equation used later by GLSL and compute its normal from the two analytic surface tangents.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run gpt5.6sol-ocean/tests/spectrum.test.js`

Expected: 4 tests PASS with no warnings.

- [ ] **Step 5: Commit only the spectrum task**

```powershell
git add -- gpt5.6sol-ocean/tests/spectrum.test.js gpt5.6sol-ocean/src/ocean/spectrum.js
git commit -m "feat: add GPT 5.6 SOL ocean spectrum"
```

### Task 2: Environment presets and smooth transitions

**Files:**
- Create: `gpt5.6sol-ocean/tests/presets.test.js`
- Create: `gpt5.6sol-ocean/src/environment/presets.js`

- [ ] **Step 1: Write the failing preset tests**

```js
import { describe, expect, it } from 'vitest';
import {
  ENVIRONMENT_PRESETS,
  PRESET_ORDER,
  createPresetTransition,
  selectPreset,
  stepPresetTransition
} from '../src/environment/presets.js';

const requiredFields = [
  'skyZenith', 'skyHorizon', 'cloudColor', 'deepColor', 'shallowColor',
  'foamColor', 'sunColor', 'sunDirection', 'sunIntensity', 'exposure',
  'roughness', 'fogDensity', 'cloudAmount'
];

describe('environment presets', () => {
  it('defines complete noon, dawn, and overcast presets', () => {
    expect(PRESET_ORDER).toEqual(['noon', 'dawn', 'overcast']);
    for (const id of PRESET_ORDER) {
      expect(Object.keys(ENVIRONMENT_PRESETS[id])).toEqual(expect.arrayContaining(requiredFields));
    }
  });

  it('moves continuously to the selected preset and finishes exactly', () => {
    const initial = createPresetTransition('noon');
    const selected = selectPreset(initial, 'dawn', 1.8);
    const halfway = stepPresetTransition(selected, 0.9);
    const finished = stepPresetTransition(halfway, 0.9);
    expect(halfway.progress).toBeCloseTo(0.5, 6);
    expect(halfway.current.exposure).toBeGreaterThan(0);
    expect(finished.progress).toBe(1);
    expect(finished.current).toEqual(ENVIRONMENT_PRESETS.dawn);
    expect(finished.activeId).toBe('dawn');
  });

  it('normalizes the interpolated sun direction', () => {
    const transition = selectPreset(createPresetTransition('noon'), 'dawn', 1.8);
    const { sunDirection } = stepPresetTransition(transition, 0.6).current;
    expect(Math.hypot(...sunDirection)).toBeCloseTo(1, 8);
  });

  it('rejects an unknown preset id', () => {
    expect(() => selectPreset(createPresetTransition(), 'night')).toThrow('Unknown ocean preset: night');
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run gpt5.6sol-ocean/tests/presets.test.js`

Expected: FAIL because `../src/environment/presets.js` does not exist.

- [ ] **Step 3: Implement presets and pure transition state**

Create three frozen preset records using normalized RGB arrays and normalized sun-direction arrays. Use these visual values:

```js
noon: {
  label: '清冽正午', skyZenith: [0.055, 0.22, 0.39], skyHorizon: [0.56, 0.79, 0.88],
  cloudColor: [0.92, 0.96, 0.98], deepColor: [0.008, 0.075, 0.12],
  shallowColor: [0.035, 0.34, 0.42], foamColor: [0.86, 0.97, 1],
  sunColor: [1, 0.93, 0.72], sunDirection: [0.38, 0.86, 0.34],
  sunIntensity: 1.2, exposure: 1.02, roughness: 0.24, fogDensity: 0.0016, cloudAmount: 0.22
}
dawn: {
  label: '低角度晨光', skyZenith: [0.075, 0.08, 0.2], skyHorizon: [0.95, 0.42, 0.24],
  cloudColor: [0.42, 0.24, 0.3], deepColor: [0.012, 0.035, 0.085],
  shallowColor: [0.12, 0.18, 0.25], foamColor: [0.98, 0.78, 0.58],
  sunColor: [1, 0.48, 0.2], sunDirection: [-0.7, 0.14, -0.7],
  sunIntensity: 1.55, exposure: 0.9, roughness: 0.19, fogDensity: 0.0024, cloudAmount: 0.36
}
overcast: {
  label: '银灰阴天', skyZenith: [0.25, 0.3, 0.34], skyHorizon: [0.61, 0.67, 0.68],
  cloudColor: [0.35, 0.4, 0.42], deepColor: [0.025, 0.095, 0.12],
  shallowColor: [0.19, 0.34, 0.37], foamColor: [0.8, 0.86, 0.85],
  sunColor: [0.78, 0.84, 0.86], sunDirection: [0.28, 0.93, -0.24],
  sunIntensity: 0.34, exposure: 0.88, roughness: 0.42, fogDensity: 0.0036, cloudAmount: 0.78
}
```

`selectPreset(state, id, duration)` must preserve the current interpolated value as the new transition origin. `stepPresetTransition` must use `t*t*(3-2*t)` for smooth interpolation and return a new state rather than mutating its input.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run gpt5.6sol-ocean/tests/presets.test.js`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit only the preset task**

```powershell
git add -- gpt5.6sol-ocean/tests/presets.test.js gpt5.6sol-ocean/src/environment/presets.js
git commit -m "feat: add ocean lighting presets"
```

### Task 3: Ocean and sky ShaderMaterial contracts

**Files:**
- Create: `gpt5.6sol-ocean/tests/materials.test.js`
- Create: `gpt5.6sol-ocean/src/environment/sky.js`
- Create: `gpt5.6sol-ocean/src/ocean/material.js`

- [ ] **Step 1: Write the failing material tests**

```js
import { describe, expect, it } from 'vitest';
import { createWaveSpectrum } from '../src/ocean/spectrum.js';
import { ENVIRONMENT_PRESETS } from '../src/environment/presets.js';
import { createOceanMaterial, updateOceanEnvironment } from '../src/ocean/material.js';
import { createSkyMaterial, updateSkyEnvironment } from '../src/environment/sky.js';

describe('shader material contracts', () => {
  it('uploads all twelve waves to the ocean material', () => {
    const material = createOceanMaterial(createWaveSpectrum(), ENVIRONMENT_PRESETS.noon);
    expect(material.isShaderMaterial).toBe(true);
    expect(material.uniforms.uWaveCount.value).toBe(12);
    expect(material.uniforms.uWaveA.value).toHaveLength(12);
    expect(material.vertexShader).toContain('uWaveA[MAX_WAVES]');
    expect(material.fragmentShader).toContain('fresnel');
  });

  it('updates ocean colors without replacing uniforms', () => {
    const material = createOceanMaterial(createWaveSpectrum(), ENVIRONMENT_PRESETS.noon);
    const deepUniform = material.uniforms.uDeepColor;
    updateOceanEnvironment(material, ENVIRONMENT_PRESETS.overcast);
    expect(material.uniforms.uDeepColor).toBe(deepUniform);
    expect(deepUniform.value.toArray()).toEqual(ENVIRONMENT_PRESETS.overcast.deepColor);
  });

  it('creates and updates the analytic sky material', () => {
    const material = createSkyMaterial(ENVIRONMENT_PRESETS.noon);
    expect(material.isShaderMaterial).toBe(true);
    updateSkyEnvironment(material, ENVIRONMENT_PRESETS.dawn);
    expect(material.uniforms.uSunDirection.value.length()).toBeCloseTo(1, 8);
    expect(material.uniforms.uCloudAmount.value).toBe(ENVIRONMENT_PRESETS.dawn.cloudAmount);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run gpt5.6sol-ocean/tests/materials.test.js`

Expected: FAIL because the two material modules do not exist.

- [ ] **Step 3: Implement `sky.js`**

Export `SKY_COLOR_GLSL`, `createSkyMaterial(environment)`, and `updateSkyEnvironment(material, environment)`. The shader must calculate a vertical horizon-to-zenith gradient, a sun disk from `dot(direction, uSunDirection)`, and five-octave moving cloud FBM (fractal Brownian motion, layered noise). Its uniforms are `uTime`, `uSkyZenith`, `uSkyHorizon`, `uCloudColor`, `uSunColor`, `uSunDirection`, `uSunIntensity`, and `uCloudAmount`.

- [ ] **Step 4: Implement `material.js`**

Export `createOceanMaterial(waves, environment)`, `uploadWaves(material, waves)`, and `updateOceanEnvironment(material, environment)`. The vertex shader must use `#define MAX_WAVES 12`, calculate world-space Gerstner displacement and analytic tangents, and expose `vWorldPosition`, `vWorldNormal`, `vCrest`, and `vSlope`. The fragment shader must use:

```glsl
float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
float breaker = smoothstep(0.48, 0.84, vSlope + vCrest * 0.34 + foamNoise * 0.18);
vec3 color = mix(absorptionColor, reflectedSky, fresnel * (0.72 + 0.2 * (1.0 - uRoughness)));
color = mix(color, uFoamColor, breaker * (0.46 + 0.42 * fresnel));
```

Use procedural value noise for two counter-moving micro-normal layers and foam breakup. Add a long sun glint with a narrow half-vector exponent controlled by `uRoughness`. Keep the material opaque with `depthWrite: true` and `side: THREE.FrontSide`.

- [ ] **Step 5: Run material and core tests**

Run: `npx vitest run gpt5.6sol-ocean/tests/materials.test.js gpt5.6sol-ocean/tests/spectrum.test.js gpt5.6sol-ocean/tests/presets.test.js`

Expected: 11 tests PASS.

- [ ] **Step 6: Commit only the shader task**

```powershell
git add -- gpt5.6sol-ocean/tests/materials.test.js gpt5.6sol-ocean/src/environment/sky.js gpt5.6sol-ocean/src/ocean/material.js
git commit -m "feat: render analytic WebGL ocean and sky"
```

### Task 4: Application shell, UI, camera, and diagnostics

**Files:**
- Create: `gpt5.6sol-ocean/tests/markup.test.js`
- Create: `gpt5.6sol-ocean/index.html`
- Create: `gpt5.6sol-ocean/src/styles.css`
- Create: `gpt5.6sol-ocean/src/ui/controls.js`
- Create: `gpt5.6sol-ocean/src/main.js`
- Create: `gpt5.6sol-ocean/package.json`

- [ ] **Step 1: Create the package test harness and failing markup test**

`package.json` must contain:

```json
{
  "name": "gpt5.6sol-ocean",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1 --port 3024 --strictPort",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1 --port 4024",
    "test": "vitest run"
  },
  "dependencies": {
    "three": "^0.185.0"
  },
  "devDependencies": {
    "vite": "^8.1.0",
    "vitest": "^3.2.6"
  }
}
```

`tests/markup.test.js` must read the real `index.html` and assert exactly one `#ocean-canvas`, exactly three `.preset-button` elements with `data-preset="noon|dawn|overcast"`, one `#error-panel`, and a module script pointing to `/src/main.js`.

- [ ] **Step 2: Run the markup test and verify RED**

Run: `npx vitest run gpt5.6sol-ocean/tests/markup.test.js`

Expected: FAIL because `index.html` does not exist.

- [ ] **Step 3: Build the semantic HTML and visual shell**

Create a full-screen canvas with an understated editorial HUD:

- `#scene-shell` contains `#ocean-canvas`.
- `.identity` at the top left contains `GPT 5.6 SOL`, title `OPEN WATER / 开放海域`, current preset label, and a `WEBGL` marker.
- `.preset-switcher` at the bottom center contains the three real buttons. Noon starts with `aria-pressed="true"`.
- `#performance-readout` displays quality and FPS.
- `#error-panel` is hidden with the `hidden` attribute and provides Chinese recovery text.

Use a deep blue/graphite palette, subtle noise overlay, serif display typography, condensed technical labels, large negative space, safe-area padding, visible focus rings, and a single mobile breakpoint. Do not cover the central or horizon region with UI.

- [ ] **Step 4: Implement controls and scene assembly**

`controls.js` exports `bindPresetControls({ root, keyboardTarget, onSelect })`, which wires click and keys `1/2/3`, updates `aria-pressed`, updates the current-preset label, and returns `{ setActive(id), destroy() }`.

`main.js` must:

1. Create `WebGLRenderer` with antialiasing, high-performance preference, ACES tone mapping, and SRGB output color space.
2. Create a fogged scene, perspective camera, and damped OrbitControls with safe polar and distance limits.
3. Create the spectrum and quality profile, a `PlaneGeometry(1100, 1100, segments, segments)` rotated onto XZ, the ocean material, and a back-sided sky sphere.
4. Recenter ocean X/Z to 20-unit cells below the camera without changing shader world coordinates.
5. Clamp camera Y to `sampleWaveSurface(...).height + 2.2` each frame.
6. Advance the 1.8-second environment transition and update ocean, sky, fog, exposure, and sun uniforms.
7. Track a rolling one-second FPS average and reduce pixel ratio by 0.15 after three consecutive samples below 50 FPS, never below 0.8.
8. Handle resize and dispose controls, geometry, materials, and renderer on `pagehide`.
9. Catch startup errors and reveal `#error-panel` with the actual non-sensitive message.
10. Expose `window.__ocean = { ready, frames, activePreset, quality, webgl, fps }` and update it throughout the loop.

- [ ] **Step 5: Run tests and build**

Run: `npx vitest run gpt5.6sol-ocean/tests`

Expected: 12 tests PASS.

Run: `npm run build --prefix gpt5.6sol-ocean`

Expected: Vite exits 0 and creates `gpt5.6sol-ocean/dist/`.

- [ ] **Step 6: Commit the standalone application**

```powershell
git add -- gpt5.6sol-ocean/index.html gpt5.6sol-ocean/package.json gpt5.6sol-ocean/src gpt5.6sol-ocean/tests
git commit -m "feat: add GPT 5.6 SOL WebGL ocean"
```

### Task 5: Documentation and ModelBenchLab integration

**Files:**
- Create: `gpt5.6sol-ocean/README.md`
- Create: `gpt5.6sol-ocean/HANDOVER.md`
- Create: `gpt5.6sol-ocean/CHANGELOG.md`
- Modify: `benchmark/registry.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `index.html`
- Modify: `RULES.md`
- Modify: `benchmark/tasks/code-to-3d/ocean.md`

- [ ] **Step 1: Write project documentation**

README must explain the Three.js/WebGL architecture, the three presets, controls, local URL, file structure, and exact test/build commands. HANDOVER must record completed scope, current architecture, diagnostics, known limits, and suggested next work. CHANGELOG must contain a `2026-07-10` initial-release entry.

- [ ] **Step 2: Add registry record and four-way wiring**

Append this project record while preserving the existing port-3023 record:

```json
{
  "dir": "gpt5.6sol-ocean",
  "port": 3024,
  "model": "GPT 5.6 SOL",
  "category": "code-to-3d",
  "mission": "ocean",
  "variant": "realistic",
  "api": "WebGL",
  "lang": "JavaScript",
  "three": "0.185",
  "vite": "8",
  "workspace": true,
  "title": "海洋模拟 — 三光照写实海面",
  "desc": "确定性 12 波风驱 Gerstner 波谱，双尺度 GLSL 微法线、菲涅尔反射、太阳光路与程序化泡沫，正午/晨光/阴天三套环境平滑切换",
  "docs": { "readme": true, "handover": true, "changelog": true }
}
```

Add the workspace string after `gpt5.5-ocean-pirate-ship`, add the Ocean portal card after the port-3023 card, add `| 3024 | gpt5.6sol-ocean |` to RULES, and add the participant row to the frozen ocean task table. Update registry `updatedAt` to `2026-07-10` and the active code-to-3d count note to 24.

- [ ] **Step 3: Update workspace dependencies without losing the dirty lockfile**

Run: `npm install --ignore-scripts`

Expected: npm exits 0, keeps all existing workspaces, and adds the `gpt5.6sol-ocean` package plus Three.js 0.185.x to `package-lock.json`.

- [ ] **Step 4: Run repository consistency checks**

Run: `npm run sync:check`

Expected: `registry / package.json / index.html / RULES.md 四方一致(24 个项目)`.

Run: `npm test --workspace gpt5.6sol-ocean`

Expected: all tests PASS.

Run: `npm run build --workspace gpt5.6sol-ocean`

Expected: build exits 0.

- [ ] **Step 5: Keep overlapping root files unstaged**

Do not commit `benchmark/registry.json`, root `package.json`, root `package-lock.json`, root `index.html`, or `RULES.md` because they contain pre-existing user changes. Commit only new project documentation and the ocean task-table edit if its diff is isolated:

```powershell
git add -- gpt5.6sol-ocean/README.md gpt5.6sol-ocean/HANDOVER.md gpt5.6sol-ocean/CHANGELOG.md benchmark/tasks/code-to-3d/ocean.md
git commit -m "docs: integrate GPT 5.6 SOL ocean benchmark"
```

### Task 6: Browser verification and visual polish

**Files:**
- Modify if required: `gpt5.6sol-ocean/src/main.js`
- Modify if required: `gpt5.6sol-ocean/src/styles.css`
- Modify if required: `gpt5.6sol-ocean/src/ocean/material.js`
- Modify if required: `gpt5.6sol-ocean/src/environment/sky.js`
- Create: `gpt5.6sol-ocean/docs/qa/desktop-noon.png`
- Create: `gpt5.6sol-ocean/docs/qa/desktop-dawn.png`
- Create: `gpt5.6sol-ocean/docs/qa/desktop-overcast.png`
- Create: `gpt5.6sol-ocean/docs/qa/mobile-noon.png`

- [ ] **Step 1: Start only the new project**

Run: `npm run dev:one -- gpt5.6sol-ocean`

Expected: Vite reports `http://127.0.0.1:3024/` with no port fallback.

- [ ] **Step 2: Verify runtime contract in the browser**

At desktop viewport, verify `window.__ocean.ready === true`, frames increase, `webgl === true`, the canvas has nonzero size, and console logs contain no errors. Click each unique `.preset-button`, wait for the 1.8-second transition, and verify `window.__ocean.activePreset` becomes `noon`, `dawn`, and `overcast` respectively.

- [ ] **Step 3: Visually inspect and capture all presets**

Check for a continuous horizon, visible wave silhouettes, broken rather than striped foam, a plausible Fresnel increase toward the horizon, mode-specific sun behavior, no black frame, and no UI overlap. Save one desktop screenshot for each preset.

- [ ] **Step 4: Verify mobile behavior**

At a 390 × 844 viewport, verify quality is `mobile`, buttons remain fully visible, no horizontal overflow exists, the canvas fills the viewport, and the camera stays above the waves. Save `mobile-noon.png`.

- [ ] **Step 5: Re-run all fresh completion checks**

```powershell
npm test --workspace gpt5.6sol-ocean
npm run build --workspace gpt5.6sol-ocean
npm run sync:check
git diff --check
git status --short --branch
```

Expected: tests, build, and sync check exit 0; `git diff --check` reports no whitespace errors; status shows only the known pre-existing user changes plus the intentional new integration edits.
