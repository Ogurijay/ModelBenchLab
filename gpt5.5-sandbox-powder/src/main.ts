import "./styles.css";
import { PointerPainter } from "./input/PointerPainter";
import { ParticleRenderer } from "./render/ParticleRenderer";
import { PowderSimulation } from "./simulation/PowderSimulation";
import { AppUi } from "./ui/AppUi";
import { installDebugBridge } from "./diagnostics/debugBridge";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("缺少 #app 根节点");
}

const simulation = new PowderSimulation(240, 160);
const ui = new AppUi(root, simulation);
const renderer = new ParticleRenderer(ui.canvas, simulation);
ui.attachRenderer(renderer);
new PointerPainter(ui.canvas, simulation, () => ui.getBrush(), () => ui.getBrushSize(), () => renderer.render());
installDebugBridge(simulation, renderer);

simulation.createPreset("garden");
renderer.render();

let lastTime = performance.now();
let fps = 60;
let statAccumulator = 0;

const tick = (time: number): void => {
  const delta = Math.max(1, time - lastTime);
  lastTime = time;
  fps = fps * 0.9 + (1000 / delta) * 0.1;

  const speed = ui.getSpeed();
  if (!ui.isPaused() && speed > 0) {
    simulation.step(speed);
    renderer.render();
  }

  statAccumulator += delta;
  if (statAccumulator > 160) {
    ui.updateStats(simulation.stats(), fps);
    statAccumulator = 0;
  }
  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);
