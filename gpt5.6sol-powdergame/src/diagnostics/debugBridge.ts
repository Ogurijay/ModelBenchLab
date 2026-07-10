import { ELEMENTS, ElementId } from "../simulation/elements";
import type { PowderSimulation } from "../simulation/PowderSimulation";
import type { PresetId } from "../presets/presets";
import type { AppUi } from "../ui/AppUi";
import type { ToolId, ViewMode } from "../simulation/types";

export interface PowderLabDebugBridge {
  simulation: PowderSimulation;
  ui: AppUi;
  elementIds: typeof ElementId;
  elements: typeof ELEMENTS;
  step: (count?: number) => void;
  clear: () => void;
  preset: (id: PresetId) => void;
  setElement: (id: ElementId) => void;
  setTool: (id: ToolId) => void;
  setView: (mode: ViewMode) => void;
  pause: (paused?: boolean) => boolean;
  stats: () => ReturnType<PowderSimulation["getStats"]>;
  sample: (x: number, y: number) => ReturnType<PowderSimulation["getProbe"]>;
  render: () => void;
}

declare global {
  interface Window {
    __powderLab?: PowderLabDebugBridge;
  }
}

export const installDebugBridge = (simulation: PowderSimulation, ui: AppUi): PowderLabDebugBridge => {
  const bridge: PowderLabDebugBridge = {
    simulation,
    ui,
    elementIds: ElementId,
    elements: ELEMENTS,
    step: (count = 1) => {
      for (let index = 0; index < count; index += 1) simulation.step();
      ui.renderer.render();
    },
    clear: () => {
      simulation.clear();
      ui.renderer.render();
    },
    preset: (id) => {
      ui.loadPreset(id, false);
      ui.renderer.render();
    },
    setElement: (id) => ui.selectElement(id),
    setTool: (id) => ui.selectTool(id),
    setView: (mode) => {
      ui.setView(mode);
      ui.renderer.render();
    },
    pause: (paused) => {
      ui.paused = paused ?? !ui.paused;
      return ui.paused;
    },
    stats: () => simulation.getStats(),
    sample: (x, y) => simulation.getProbe(x, y),
    render: () => ui.renderer.render()
  };
  window.__powderLab = bridge;
  return bridge;
};

