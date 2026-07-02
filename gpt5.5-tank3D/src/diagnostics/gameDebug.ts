import type { GameSimulation } from "../game/simulation/GameSimulation";

declare global {
  interface Window {
    __tankGame?: {
      simulation: GameSimulation;
      start: () => void;
      forceWin: () => void;
      loadLevel: (index: number) => void;
      snapshot: () => ReturnType<GameSimulation["snapshot"]>;
    };
  }
}

export function installGameDebug(simulation: GameSimulation): void {
  window.__tankGame = {
    simulation,
    start: () => simulation.start(),
    forceWin: () => simulation.forceWinForDebug(),
    loadLevel: (index: number) => simulation.loadLevel(index, false),
    snapshot: () => simulation.snapshot(),
  };
}
