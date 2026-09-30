import "./styles.css";
import { installDebugBridge } from "./diagnostics/debugBridge";
import { PowderSimulation } from "./simulation/PowderSimulation";
import { AppUi } from "./ui/AppUi";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("页面缺少 #app 根节点");

const simulation = new PowderSimulation(224, 128, 0x56_50_54);
const ui = new AppUi(root, simulation);
ui.loadPreset("bench", false);
ui.renderer.render();
installDebugBridge(simulation, ui);

let previous = performance.now();
let accumulator = 0;
let frames = 0;
let fps = 60;
let fpsWindow = previous;
const fixedStep = 1_000 / 30;

const frame = (now: number): void => {
  const elapsed = Math.min(100, now - previous);
  previous = now;
  accumulator += elapsed;
  frames += 1;

  if (now - fpsWindow >= 500) {
    fps = frames * 1_000 / (now - fpsWindow);
    frames = 0;
    fpsWindow = now;
  }

  if (!ui.paused) {
    let batches = 0;
    while (accumulator >= fixedStep && batches < 3) {
      simulation.step(ui.speed);
      accumulator -= fixedStep;
      batches += 1;
    }
    if (batches === 3) accumulator = 0;
  } else {
    accumulator = 0;
  }

  ui.renderer.render();
  ui.update(now, fps);
  requestAnimationFrame(frame);
};

requestAnimationFrame(frame);

