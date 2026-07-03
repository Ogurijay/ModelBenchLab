import { ELEMENTS, ElementId } from "../simulation/elements";
import type { PowderSimulation } from "../simulation/PowderSimulation";
import type { ParticleRenderer } from "../render/ParticleRenderer";

declare global {
  interface Window {
    __powderGame?: {
      simulation: PowderSimulation;
      renderer: ParticleRenderer;
      elementIds: typeof ElementId;
      elements: typeof ELEMENTS;
      step: (count?: number) => void;
      clear: () => void;
      setElement: (x: number, y: number, id: ElementId) => void;
      stats: () => ReturnType<PowderSimulation["stats"]>;
      sample: (x: number, y: number) => ElementId;
      preset: (name: "volcano" | "reactor" | "circuit" | "garden" | "storm") => void;
    };
  }
}

export const installDebugBridge = (simulation: PowderSimulation, renderer: ParticleRenderer): void => {
  window.__powderGame = {
    simulation,
    renderer,
    elementIds: ElementId,
    elements: ELEMENTS,
    step: (count = 1) => {
      simulation.step(count);
      renderer.render();
    },
    clear: () => {
      simulation.clear();
      renderer.render();
    },
    setElement: (x: number, y: number, id: ElementId) => {
      simulation.setElement(x, y, id);
      renderer.render();
    },
    stats: () => simulation.stats(),
    sample: (x: number, y: number) => simulation.getElement(x, y),
    preset: (name) => {
      simulation.createPreset(name);
      renderer.render();
    }
  };
};
