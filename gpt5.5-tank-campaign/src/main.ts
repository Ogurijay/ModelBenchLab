import * as THREE from "three";
import "./styles.css";
import { InputController } from "./game/input/InputController";
import { GameSimulation } from "./game/simulation/GameSimulation";
import { createCameraRig } from "./render/app/createCamera";
import { createRenderer } from "./render/app/createRenderer";
import { createScene } from "./render/app/createScene";
import { RenderBridge } from "./render/adapters/RenderBridge";
import { createHud } from "./ui/hud";
import { installGameDebug } from "./diagnostics/gameDebug";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) throw new Error("Missing #game-canvas");

const renderer = createRenderer(canvas);
const scene = createScene();
const { camera, resize } = createCameraRig();
const simulation = new GameSimulation();
const input = new InputController(document);
const hud = createHud(document);
const bridge = new RenderBridge(scene);

installGameDebug(simulation);

let previousTime = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - previousTime) / 1000, 0.05);
  previousTime = now;

  simulation.tick(dt, input.readFrame());
  const snapshot = simulation.snapshot();
  bridge.sync(snapshot, simulation.pullEvents());
  bridge.update(dt);
  hud.update(snapshot);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(frame);

const onResize = () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  resize();
};

window.addEventListener("resize", onResize);
window.addEventListener("blur", () => {
  if (simulation.snapshot().phase === "playing") {
    simulation.tick(0, { togglePause: true });
  }
});

canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  renderer.setAnimationLoop(null);
});

canvas.addEventListener("webglcontextrestored", () => {
  previousTime = performance.now();
  renderer.setAnimationLoop(frame);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) renderer.setAnimationLoop(null);
  if (!document.hidden) {
    previousTime = performance.now();
    renderer.setAnimationLoop(frame);
  }
});

THREE.Cache.enabled = true;
