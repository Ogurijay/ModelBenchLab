# GPT 5.6 SOL Ocean Storm and Rain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Work only in the existing `codex/gpt5.6sol-ocean` worktree; do not stage shared root files.

**Goal:** Add an independently toggled storm overlay with stronger seas, dark low clouds, fog, and deterministic GPU rain while preserving the three existing base lighting presets.

**Architecture:** A pure storm-state module interpolates intensity and derives a storm-adjusted environment from the current base preset. A single Three.js Points rain field renders all drops in one draw call and follows the camera. Existing ocean CPU/GPU paths receive the same storm amplitude and intensity values so rendering, camera clearance, diagnostics, and tests remain consistent.

**Tech Stack:** JavaScript ES modules, Three.js 0.184, WebGL/GLSL, Vite 8, Vitest 3.2.

---

## File map

- Create `gpt5.6sol-ocean/src/weather/storm.js`: immutable storm state and environment overlay.
- Create `gpt5.6sol-ocean/src/weather/rain.js`: deterministic rain layout and one-draw-call Points system.
- Create `gpt5.6sol-ocean/tests/storm.test.js`: storm transitions and environment safety.
- Create `gpt5.6sol-ocean/tests/rain.test.js`: deterministic layout, quality counts, Points contract.
- Modify `gpt5.6sol-ocean/src/ocean/spectrum.js`: amplitude-scaled CPU surface sampling.
- Modify `gpt5.6sol-ocean/src/ocean/material.js`: storm amplitude, roughness, foam, and color response.
- Modify `gpt5.6sol-ocean/src/main.js`: state wiring, rain updates, diagnostics, disposal.
- Modify `gpt5.6sol-ocean/src/ui/controls.js`: storm button and `S` key.
- Modify `gpt5.6sol-ocean/index.html`: fourth independent storm control.
- Modify `gpt5.6sol-ocean/src/styles.css`: four-column dock and storm active state.
- Modify project tests and documentation; add storm QA images.

### Task 1: Pure storm state and environment overlay

**Files:**
- Create: `gpt5.6sol-ocean/tests/storm.test.js`
- Create: `gpt5.6sol-ocean/src/weather/storm.js`

- [ ] **Step 1: Write the failing storm tests**

```js
import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_PRESETS } from '../src/environment/presets.js';
import {
  applyStormOverlay,
  createStormState,
  setStormEnabled,
  stepStormState
} from '../src/weather/storm.js';

describe('storm overlay', () => {
  it('starts disabled and reaches full intensity smoothly', () => {
    const initial = createStormState();
    const enabled = setStormEnabled(initial, true, 2.4);
    const halfway = stepStormState(enabled, 1.2);
    const complete = stepStormState(halfway, 1.2);
    expect(initial).toMatchObject({ enabled: false, intensity: 0 });
    expect(halfway.intensity).toBeGreaterThan(0);
    expect(halfway.intensity).toBeLessThan(1);
    expect(complete).toMatchObject({ enabled: true, intensity: 1, progress: 1 });
  });

  it('fades back to zero without jumping', () => {
    const full = stepStormState(setStormEnabled(createStormState(), true, 1), 1);
    const disabling = setStormEnabled(full, false, 2.4);
    const halfway = stepStormState(disabling, 1.2);
    const complete = stepStormState(halfway, 1.2);
    expect(halfway.intensity).toBeGreaterThan(0);
    expect(halfway.intensity).toBeLessThan(1);
    expect(complete).toMatchObject({ enabled: false, intensity: 0, progress: 1 });
  });

  it('derives a darker storm environment without mutating the base preset', () => {
    const base = ENVIRONMENT_PRESETS.noon;
    const snapshot = JSON.stringify(base);
    const storm = applyStormOverlay(base, 1);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(storm.sunIntensity).toBeLessThan(base.sunIntensity);
    expect(storm.fogDensity).toBeGreaterThan(base.fogDensity);
    expect(storm.cloudAmount).toBeGreaterThan(base.cloudAmount);
    expect(storm.exposure).toBeLessThan(base.exposure);
  });

  it('returns finite environment values at partial intensity', () => {
    const environment = applyStormOverlay(ENVIRONMENT_PRESETS.dawn, 0.43);
    const numbers = Object.values(environment).flatMap((value) =>
      Array.isArray(value) ? value : typeof value === 'number' ? [value] : []
    );
    expect(numbers.every(Number.isFinite)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test --workspace gpt5.6sol-ocean -- tests/storm.test.js`

Expected: FAIL because `src/weather/storm.js` does not exist.

- [ ] **Step 3: Implement the pure storm module**

Create immutable state with `{ enabled, targetEnabled, intensity, from, to, elapsed, duration, progress }`. `setStormEnabled` starts from the current intensity. `stepStormState` uses `t*t*(3-2*t)` and returns exact 0 or 1 at completion.

`applyStormOverlay(environment, intensity)` must copy all input fields and interpolate these targets:

```js
const STORM_TARGET = Object.freeze({
  skyZenith: [0.018, 0.026, 0.04],
  skyHorizon: [0.11, 0.16, 0.19],
  cloudColor: [0.055, 0.068, 0.078],
  deepColor: [0.005, 0.022, 0.032],
  shallowColor: [0.028, 0.082, 0.098],
  foamColor: [0.72, 0.79, 0.8],
  sunColor: [0.48, 0.58, 0.66],
  sunIntensity: 0.1,
  exposure: 0.72,
  roughness: 0.53,
  fogDensity: 0.0085,
  cloudAmount: 0.96
});
```

Keep the current base `id`, `label`, and normalized `sunDirection` so base preset switches remain meaningful during a storm.

- [ ] **Step 4: Run storm and preset tests**

Run: `npm test --workspace gpt5.6sol-ocean -- tests/storm.test.js tests/presets.test.js`

Expected: all focused tests PASS.

- [ ] **Step 5: Commit the storm state task**

```powershell
git add -- gpt5.6sol-ocean/src/weather/storm.js gpt5.6sol-ocean/tests/storm.test.js
git commit -m "feat: add independent ocean storm state"
```

### Task 2: Deterministic GPU rain field

**Files:**
- Create: `gpt5.6sol-ocean/tests/rain.test.js`
- Create: `gpt5.6sol-ocean/src/weather/rain.js`

- [ ] **Step 1: Write the failing rain tests**

```js
import { describe, expect, it } from 'vitest';
import { createRainField, createRainLayout, getRainDropCount } from '../src/weather/rain.js';

describe('GPU rain field', () => {
  it('uses quality-specific drop counts', () => {
    expect(getRainDropCount('high')).toBe(12000);
    expect(getRainDropCount('mobile')).toBe(5000);
  });

  it('creates deterministic finite rain attributes', () => {
    const first = createRainLayout({ count: 16, seed: 5602 });
    const second = createRainLayout({ count: 16, seed: 5602 });
    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
    expect(Array.from(first.attributes)).toEqual(Array.from(second.attributes));
    expect(Array.from(first.positions).every(Number.isFinite)).toBe(true);
    expect(Array.from(first.attributes).every(Number.isFinite)).toBe(true);
  });

  it('creates one Points object and disposes its resources', () => {
    const field = createRainField({ quality: 'mobile', seed: 5602 });
    expect(field.points.isPoints).toBe(true);
    expect(field.dropCount).toBe(5000);
    field.setIntensity(0.7);
    expect(field.material.uniforms.uIntensity.value).toBe(0.7);
    field.dispose();
    expect(field.geometry.attributes.position).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the rain test and verify RED**

Run: `npm test --workspace gpt5.6sol-ocean -- tests/rain.test.js`

Expected: FAIL because `src/weather/rain.js` does not exist.

- [ ] **Step 3: Implement rain layout and Points system**

`createRainLayout({ count, seed })` must return `positions: Float32Array(count * 3)` and `attributes: Float32Array(count * 4)`. Position drops within a 150 × 74 × 130 camera-centered box. Store normalized fall speed, phase, streak length, and opacity variance in the four attributes.

`createRainField({ quality, seed })` must create one BufferGeometry and one transparent ShaderMaterial. The vertex shader wraps Y with `mod`, moves X/Z with wind, and sizes points by depth. The fragment shader draws a soft diagonal line in `gl_PointCoord`, discarding pixels outside the streak. Export methods:

```js
{
  points,
  geometry,
  material,
  dropCount,
  setIntensity(value),
  update({ time, cameraPosition, windDirection }),
  dispose()
}
```

`setIntensity` clamps 0–1 and hides the Points only when intensity is exactly 0.

- [ ] **Step 4: Run the rain test and full suite**

Run: `npm test --workspace gpt5.6sol-ocean -- tests/rain.test.js`

Expected: 3 rain tests PASS.

Run: `npm test --workspace gpt5.6sol-ocean`

Expected: all existing and new tests PASS.

- [ ] **Step 5: Commit the rain task**

```powershell
git add -- gpt5.6sol-ocean/src/weather/rain.js gpt5.6sol-ocean/tests/rain.test.js
git commit -m "feat: add deterministic GPU rain field"
```

### Task 3: Ocean storm response with CPU/GPU parity

**Files:**
- Modify: `gpt5.6sol-ocean/tests/spectrum.test.js`
- Modify: `gpt5.6sol-ocean/tests/materials.test.js`
- Modify: `gpt5.6sol-ocean/src/ocean/spectrum.js`
- Modify: `gpt5.6sol-ocean/src/ocean/material.js`

- [ ] **Step 1: Add failing CPU and material tests**

Add a spectrum assertion that `sampleWaveSurface(..., amplitudeScale: 1.24).height` differs from scale 1 while the normal remains unit length. Add a material assertion that `uStormIntensity` starts at 0 and `updateOceanStorm(material, 0.8)` preserves the uniform object while setting its value to 0.8.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test --workspace gpt5.6sol-ocean -- tests/spectrum.test.js tests/materials.test.js`

Expected: FAIL because `amplitudeScale` and `updateOceanStorm` are not implemented.

- [ ] **Step 3: Implement CPU amplitude scaling**

Add optional `amplitudeScale = 1` to `sampleWaveSurface`. Multiply each wave amplitude and differential by the clamped scale. Preserve all existing results when omitted.

- [ ] **Step 4: Implement GPU storm uniforms**

Add `uStormIntensity` to ocean material uniforms and export:

```js
export function updateOceanStorm(material, intensity) {
  material.uniforms.uStormIntensity.value = Math.min(1, Math.max(0, intensity));
}
```

In the vertex shader, use vertical scale `1.0 + 0.24 * uStormIntensity` and divide `q` by that scale before horizontal displacement. In the fragment shader, increase micro-normal strength and foam, desaturate slightly, and increase distance haze based on storm intensity.

- [ ] **Step 5: Run focused tests and build**

Run: `npm test --workspace gpt5.6sol-ocean -- tests/spectrum.test.js tests/materials.test.js`

Expected: all focused tests PASS.

Run: `npm run build --workspace gpt5.6sol-ocean`

Expected: Vite exits 0 with no warnings.

- [ ] **Step 6: Commit CPU/GPU storm response**

```powershell
git add -- gpt5.6sol-ocean/src/ocean/spectrum.js gpt5.6sol-ocean/src/ocean/material.js gpt5.6sol-ocean/tests/spectrum.test.js gpt5.6sol-ocean/tests/materials.test.js
git commit -m "feat: make ocean surface respond to storms"
```

### Task 4: UI, scene integration, diagnostics, and documentation

**Files:**
- Modify: `gpt5.6sol-ocean/tests/markup.test.js`
- Modify: `gpt5.6sol-ocean/index.html`
- Modify: `gpt5.6sol-ocean/src/styles.css`
- Modify: `gpt5.6sol-ocean/src/ui/controls.js`
- Modify: `gpt5.6sol-ocean/src/main.js`
- Modify: `gpt5.6sol-ocean/README.md`
- Modify: `gpt5.6sol-ocean/HANDOVER.md`
- Modify: `gpt5.6sol-ocean/CHANGELOG.md`

- [ ] **Step 1: Add the failing markup contract**

Keep the assertion for exactly three `.preset-button` elements. Add assertions for exactly one `id="storm-toggle"`, `aria-pressed="false"`, visible label `风暴`, and interaction hint containing `S`.

- [ ] **Step 2: Run markup test and verify RED**

Run: `npm test --workspace gpt5.6sol-ocean -- tests/markup.test.js`

Expected: FAIL because the storm control is absent.

- [ ] **Step 3: Add the independent storm control**

Add a fourth button inside `.preset-switcher`:

```html
<button id="storm-toggle" class="storm-button" type="button" aria-pressed="false">
  <span class="preset-number">S</span>
  <span class="preset-copy"><b>风暴</b><small>强风暴雨</small></span>
</button>
```

Change the dock to four columns. Keep three base preset buttons and their mutual exclusion unchanged. Add a cool gray active storm state with a subtle pulse; mobile columns must fit inside 390 px without overflow.

- [ ] **Step 4: Extend controls and assemble weather in `main.js`**

Extend `bindPresetControls` with `onStormToggle(enabled)` and returned `setStormEnabled(enabled)`. Clicking the storm button or pressing `S` toggles its `aria-pressed` state.

In `main.js`:

1. Add initial diagnostics fields `stormEnabled: false`, `stormIntensity: 0`, and `rainDrops: 0` before sealing.
2. Create `stormState`, create the quality-specific rain field, add `rain.points` to the scene, and set `diagnostics.rainDrops`.
3. On toggle, call `setStormEnabled(stormState, enabled, transitionDuration)`. Do not alter the base preset transition.
4. Each frame step storm state, derive `stormEnvironment = applyStormOverlay(transition.current, stormState.intensity)`, and apply that environment.
5. Call `updateOceanStorm`, use `amplitudeScale = 1 + 0.24 * intensity` for camera sampling, update rain time/position/wind, and set rain intensity.
6. Update diagnostics and append “· 风暴叠加” to the visible preset label while enabled.
7. Dispose the rain field on page exit.

- [ ] **Step 5: Update documentation**

README must describe the independent storm overlay, `S` key, GPU rain, and new diagnostics. HANDOVER must record the two new weather modules and performance counts. CHANGELOG must add storm, rain, wave response, and QA entries under 2026-07-10.

- [ ] **Step 6: Run full tests and build**

Run: `npm test --workspace gpt5.6sol-ocean`

Expected: all tests PASS.

Run: `npm run build --workspace gpt5.6sol-ocean`

Expected: build exits 0 with no warnings.

- [ ] **Step 7: Commit integration and docs**

```powershell
git add -- gpt5.6sol-ocean/index.html gpt5.6sol-ocean/src/styles.css gpt5.6sol-ocean/src/ui/controls.js gpt5.6sol-ocean/src/main.js gpt5.6sol-ocean/tests/markup.test.js gpt5.6sol-ocean/README.md gpt5.6sol-ocean/HANDOVER.md gpt5.6sol-ocean/CHANGELOG.md
git commit -m "feat: integrate storm and rain controls"
```

### Task 5: Browser verification and QA captures

**Files:**
- Create: `gpt5.6sol-ocean/docs/qa/desktop-storm-noon.png`
- Create: `gpt5.6sol-ocean/docs/qa/desktop-storm-dawn.png`
- Create: `gpt5.6sol-ocean/docs/qa/mobile-storm.png`

- [ ] **Step 1: Start the project through the root launcher**

Run: `npm run dev:one -- gpt5.6sol-ocean`

Expected: Vite starts on exactly `http://127.0.0.1:3024/`.

- [ ] **Step 2: Verify desktop storm behavior**

At 1440 × 900, click the unique storm button, verify it becomes pressed immediately, wait 2.6 seconds, then verify `window.__ocean.stormEnabled === true`, `stormIntensity === 1`, and `rainDrops === 12000`. Confirm rain is visible and console logs have no errors or warnings. Save `desktop-storm-noon.png`.

- [ ] **Step 3: Verify storm persistence across base presets**

While storm remains enabled, switch to dawn, wait for the base transition, verify storm intensity stays 1 and both the dawn base label and storm overlay label are visible. Save `desktop-storm-dawn.png`.

- [ ] **Step 4: Verify storm disable behavior**

Click storm again, verify button unpresses immediately, wait 2.6 seconds, then verify intensity is 0 and rain Points are hidden. Confirm the base dawn preset remains active.

- [ ] **Step 5: Verify mobile storm behavior**

At 390 × 844, reload, enable storm, and verify `quality === 'mobile'`, `rainDrops === 5000`, no horizontal overflow, all four controls remain visible, and console logs are clean. Save `mobile-storm.png`.

- [ ] **Step 6: Run final fresh verification**

```powershell
npm test --workspace gpt5.6sol-ocean
npm run build --workspace gpt5.6sol-ocean
npm run sync:check
git diff --check
git status --short --branch
```

Expected: tests, build, and sync check exit 0; no whitespace errors; only intentional storm/rain commits differ on the feature branch.
