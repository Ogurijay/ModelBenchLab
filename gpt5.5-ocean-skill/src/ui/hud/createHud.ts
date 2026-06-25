import type * as THREE from "three";
import type { OceanPreset, OceanState } from "../../game/simulation/oceanTypes";
import { OCEAN_PRESETS } from "../../game/simulation/oceanTypes";
import type { OceanSample } from "../../game/simulation/oceanField";

export type HudPatch = Partial<Pick<OceanState, "windSpeed" | "swell" | "choppiness" | "foam" | "timeScale">> & {
  windDirectionDegrees?: number;
};

export interface HudCallbacks {
  onPatch: (patch: HudPatch) => void;
  onPreset: (preset: OceanPreset) => void;
  onResetCamera: () => void;
}

export interface HudUpdate {
  state: OceanState;
  fps: number;
  rendererInfo: THREE.WebGLInfo;
  sample: OceanSample;
}

export interface Hud {
  element: HTMLElement;
  update: (data: HudUpdate) => void;
  setWarning: (message: string | null) => void;
}

type RangeKey = keyof Pick<OceanState, "windSpeed" | "swell" | "choppiness" | "foam" | "timeScale"> | "windDirectionDegrees";

interface RangeBinding {
  key: RangeKey;
  input: HTMLInputElement;
  output: HTMLOutputElement;
  format: (value: number) => string;
  getValue: (state: OceanState) => number;
}

function formatFixed(unit: string, digits = 1): (value: number) => string {
  return (value) => `${value.toFixed(digits)}${unit}`;
}

function makeButton(label: string, className?: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) {
    button.className = className;
  }
  return button;
}

export function createHud(callbacks: HudCallbacks): Hud {
  const root = document.createElement("section");
  root.className = "hud";
  root.setAttribute("aria-label", "Ocean controls");

  const status = document.createElement("div");
  status.className = "status-stack";
  status.innerHTML = `
    <div class="status-chip">
      <span class="status-dot" aria-hidden="true"></span>
      <div>
        <strong>Gerstner Ocean</strong>
        <span class="status-subline">Deep-water spectrum</span>
      </div>
    </div>
    <div class="metrics" aria-live="polite">
      <span data-metric="fps">FPS --</span>
      <span data-metric="draws">Draws --</span>
      <span data-metric="waves">Waves --</span>
      <span data-metric="height">H --</span>
    </div>
  `;

  const controlsWrap = document.createElement("div");
  controlsWrap.className = "controls-wrap";

  const toggle = makeButton("Controls", "panel-toggle");
  toggle.setAttribute("aria-expanded", "true");

  const panel = document.createElement("div");
  panel.className = "control-panel";

  const presetRow = document.createElement("div");
  presetRow.className = "preset-row";
  const presetButtons = new Map<OceanPreset, HTMLButtonElement>();

  for (const preset of Object.keys(OCEAN_PRESETS) as OceanPreset[]) {
    const button = makeButton(preset);
    button.addEventListener("click", () => callbacks.onPreset(preset));
    presetButtons.set(preset, button);
    presetRow.appendChild(button);
  }

  const resetButton = makeButton("Reset view", "ghost-button");
  resetButton.addEventListener("click", callbacks.onResetCamera);
  presetRow.appendChild(resetButton);

  const ranges = document.createElement("div");
  ranges.className = "range-stack";
  const bindings: RangeBinding[] = [];

  function addRange(
    key: RangeKey,
    label: string,
    min: number,
    max: number,
    step: number,
    getValue: (state: OceanState) => number,
    format: (value: number) => string,
  ): void {
    const row = document.createElement("label");
    row.className = "control-row";

    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);

    const output = document.createElement("output");
    output.value = "";

    input.addEventListener("input", () => {
      const value = input.valueAsNumber;
      output.value = format(value);
      callbacks.onPatch({ [key]: value } as HudPatch);
    });

    row.append(labelSpan, input, output);
    ranges.appendChild(row);
    bindings.push({ key, input, output, getValue, format });
  }

  addRange("windSpeed", "Wind", 3, 28, 0.1, (state) => state.windSpeed, formatFixed(" m/s"));
  addRange("windDirectionDegrees", "Dir", -180, 180, 1, (state) => (state.windDirection * 180) / Math.PI, formatFixed(" deg", 0));
  addRange("swell", "Swell", 0.25, 3, 0.01, (state) => state.swell, formatFixed("x", 2));
  addRange("choppiness", "Chop", 0.2, 2, 0.01, (state) => state.choppiness, formatFixed("x", 2));
  addRange("foam", "Foam", 0, 1, 0.01, (state) => state.foam, formatFixed("", 2));
  addRange("timeScale", "Time", 0.15, 1.8, 0.01, (state) => state.timeScale, formatFixed("x", 2));

  const warning = document.createElement("div");
  warning.className = "warning";
  warning.hidden = true;

  panel.append(presetRow, ranges, warning);
  controlsWrap.append(toggle, panel);
  root.append(status, controlsWrap);

  toggle.addEventListener("click", () => {
    const isHidden = panel.toggleAttribute("hidden");
    toggle.setAttribute("aria-expanded", String(!isHidden));
  });

  function update(data: HudUpdate): void {
    for (const binding of bindings) {
      const value = binding.getValue(data.state);
      if (document.activeElement !== binding.input) {
        binding.input.value = String(value);
      }
      binding.output.value = binding.format(value);
    }

    for (const [preset, button] of presetButtons) {
      button.classList.toggle("active", preset === data.state.preset);
    }

    const fps = status.querySelector<HTMLElement>('[data-metric="fps"]');
    const draws = status.querySelector<HTMLElement>('[data-metric="draws"]');
    const waves = status.querySelector<HTMLElement>('[data-metric="waves"]');
    const height = status.querySelector<HTMLElement>('[data-metric="height"]');
    if (fps) fps.textContent = `FPS ${data.fps}`;
    if (draws) draws.textContent = `Draws ${data.rendererInfo.render.calls}`;
    if (waves) waves.textContent = `Waves ${data.state.waves.length}`;
    if (height) height.textContent = `H ${data.sample.height.toFixed(2)}m`;
  }

  function setWarning(message: string | null): void {
    warning.hidden = !message;
    warning.textContent = message ?? "";
  }

  return {
    element: root,
    update,
    setWarning,
  };
}
