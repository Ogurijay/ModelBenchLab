import { ElementId } from "../simulation/elements";
import type { PowderSimulation } from "../simulation/PowderSimulation";

export type PresetId = "bench" | "volcano" | "reactor" | "circuit" | "garden" | "atmosphere" | "cryo";

export const PRESETS: Record<PresetId, { label: string; description: string }> = {
  bench: { label: "基础实验台", description: "分区展示粉末、液体、燃烧和气体" },
  volcano: { label: "火山与地下水", description: "观察熔岩、压力、蒸汽和玻璃化" },
  reactor: { label: "裂变反应堆", description: "铀芯、重水、中子和冷却回路" },
  circuit: { label: "点火电路", description: "电池、半导体、开关和火药负载" },
  garden: { label: "封闭生态箱", description: "水、种子、植物和二氧化碳循环" },
  atmosphere: { label: "气体燃烧室", description: "氢氧燃烧、烟气和二氧化碳灭火" },
  cryo: { label: "极冷热冲击", description: "液氮、玻璃、水和高温熔岩" }
};

const line = (simulation: PowderSimulation, x1: number, y1: number, x2: number, y2: number, id: ElementId): void => {
  const distance = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let step = 0; step <= distance; step += 1) {
    const amount = step / distance;
    simulation.setCell(Math.round(x1 + (x2 - x1) * amount), Math.round(y1 + (y2 - y1) * amount), id);
  }
};

const rect = (simulation: PowderSimulation, x: number, y: number, width: number, height: number, id: ElementId, filled = true): void => {
  for (let oy = 0; oy < height; oy += 1) {
    for (let ox = 0; ox < width; ox += 1) {
      if (filled || ox === 0 || oy === 0 || ox === width - 1 || oy === height - 1) simulation.setCell(x + ox, y + oy, id);
    }
  }
};

const disk = (simulation: PowderSimulation, cx: number, cy: number, radius: number, id: ElementId): void => {
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) if (x * x + y * y <= radius * radius) simulation.setCell(cx + x, cy + y, id);
  }
};

const border = (simulation: PowderSimulation): void => {
  line(simulation, 0, 0, simulation.width - 1, 0, ElementId.Wall);
  line(simulation, 0, simulation.height - 1, simulation.width - 1, simulation.height - 1, ElementId.Wall);
  line(simulation, 0, 0, 0, simulation.height - 1, ElementId.Wall);
  line(simulation, simulation.width - 1, 0, simulation.width - 1, simulation.height - 1, ElementId.Wall);
};

export const loadPreset = (simulation: PowderSimulation, preset: PresetId): void => {
  simulation.clear();
  border(simulation);
  const w = simulation.width;
  const h = simulation.height;

  switch (preset) {
    case "bench": {
      const floor = h - 18;
      line(simulation, 12, floor, w - 12, floor, ElementId.Brick);
      for (let x = 20; x < 62; x += 1) {
        for (let y = 12; y < 34; y += 1) if ((x + y) % 3 === 0) simulation.setCell(x, y, ElementId.Sand);
      }
      rect(simulation, 76, floor - 22, 48, 23, ElementId.Glass, false);
      rect(simulation, 78, floor - 10, 44, 9, ElementId.Water);
      disk(simulation, 150, floor - 5, 9, ElementId.Oil);
      line(simulation, 145, floor - 1, 164, floor - 1, ElementId.Wood);
      simulation.setCell(155, floor - 10, ElementId.Fire);
      rect(simulation, 181, floor - 35, 27, 36, ElementId.Glass, false);
      rect(simulation, 183, floor - 12, 23, 11, ElementId.Hydrogen);
      rect(simulation, 183, floor - 31, 23, 9, ElementId.Oxygen);
      break;
    }
    case "volcano": {
      const ground = h - 16;
      for (let y = ground; y < h - 1; y += 1) line(simulation, 1, y, w - 2, y, ElementId.Stone);
      for (let level = 0; level < 48; level += 1) {
        const half = Math.floor(level * 0.72);
        line(simulation, w / 2 - half, ground - level, w / 2 - 7, ground - level, ElementId.Stone);
        line(simulation, w / 2 + 7, ground - level, w / 2 + half, ground - level, ElementId.Stone);
      }
      rect(simulation, Math.floor(w / 2) - 6, ground - 40, 13, 43, ElementId.Lava);
      rect(simulation, 22, ground - 16, 52, 15, ElementId.Water);
      line(simulation, 18, ground - 17, 78, ground - 17, ElementId.Clay);
      break;
    }
    case "reactor": {
      rect(simulation, 28, 15, w - 56, h - 28, ElementId.Wall, false);
      rect(simulation, 42, 28, w - 84, h - 54, ElementId.Water);
      rect(simulation, Math.floor(w / 2) - 24, Math.floor(h / 2) - 13, 48, 26, ElementId.Glass, false);
      for (let y = Math.floor(h / 2) - 10; y <= Math.floor(h / 2) + 10; y += 2) {
        for (let x = Math.floor(w / 2) - 20; x <= Math.floor(w / 2) + 20; x += 3) simulation.setCell(x, y, (x + y) % 4 === 0 ? ElementId.Deuterium : ElementId.Uranium);
      }
      simulation.setCell(Math.floor(w / 2) - 22, Math.floor(h / 2), ElementId.Neutron);
      simulation.aux[simulation.index(Math.floor(w / 2) - 22, Math.floor(h / 2))] = 0;
      break;
    }
    case "circuit": {
      const y = Math.floor(h / 2);
      rect(simulation, 16, y - 18, w - 32, 38, ElementId.Insulator, false);
      simulation.setCell(24, y, ElementId.Battery);
      line(simulation, 25, y, 70, y, ElementId.Wire);
      line(simulation, 70, y, 70, y - 10, ElementId.Copper);
      line(simulation, 70, y - 10, 112, y - 10, ElementId.PType);
      line(simulation, 112, y - 10, 140, y - 10, ElementId.NType);
      simulation.setCell(141, y - 10, ElementId.Switch);
      line(simulation, 142, y - 10, 178, y - 10, ElementId.Wire);
      disk(simulation, 188, y - 10, 8, ElementId.Gunpowder);
      line(simulation, 178, y - 10, 180, y - 10, ElementId.Copper);
      break;
    }
    case "garden": {
      rect(simulation, 18, 14, w - 36, h - 25, ElementId.Glass, false);
      rect(simulation, 20, h - 32, w - 40, 20, ElementId.Clay);
      rect(simulation, 26, h - 43, 36, 11, ElementId.Water);
      for (let x = 80; x < w - 34; x += 18) simulation.setCell(x, h - 33, ElementId.Seed);
      rect(simulation, 24, 25, w - 48, 16, ElementId.CarbonDioxide);
      break;
    }
    case "atmosphere": {
      rect(simulation, 22, 14, w - 44, h - 27, ElementId.Brick, false);
      rect(simulation, 24, 16, Math.floor(w / 2) - 25, h - 31, ElementId.Hydrogen);
      rect(simulation, Math.floor(w / 2), 16, Math.floor(w / 2) - 24, h - 31, ElementId.Oxygen);
      line(simulation, Math.floor(w / 2), 18, Math.floor(w / 2), h - 20, ElementId.Wood);
      simulation.setCell(Math.floor(w / 2), h - 25, ElementId.Fire);
      rect(simulation, w - 52, 20, 18, 24, ElementId.CarbonDioxide);
      break;
    }
    case "cryo": {
      rect(simulation, 24, 14, w - 48, h - 26, ElementId.Glass, false);
      rect(simulation, 26, h - 45, 64, 31, ElementId.Water);
      rect(simulation, 96, h - 45, 42, 31, ElementId.LiquidNitrogen);
      rect(simulation, 146, h - 45, 50, 31, ElementId.Lava);
      line(simulation, 92, h - 45, 92, h - 15, ElementId.Glass);
      line(simulation, 141, h - 45, 141, h - 15, ElementId.Glass);
      break;
    }
  }
};

