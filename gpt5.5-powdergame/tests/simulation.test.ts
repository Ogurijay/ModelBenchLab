import { describe, expect, it } from "vitest";
import { ElementId } from "../src/simulation/elements";
import { PowderSimulation } from "../src/simulation/PowderSimulation";

const findElement = (simulation: PowderSimulation, id: ElementId): Array<{ x: number; y: number }> => {
  const found: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < simulation.height; y += 1) {
    for (let x = 0; x < simulation.width; x += 1) {
      if (simulation.getElement(x, y) === id) {
        found.push({ x, y });
      }
    }
  }
  return found;
};

describe("PowderSimulation", () => {
  it("让沙(SAND)按重力下落", () => {
    const simulation = new PowderSimulation(24, 24);
    simulation.setElement(12, 2, ElementId.Sand);

    simulation.step(16);

    const sand = findElement(simulation, ElementId.Sand);
    expect(sand).toHaveLength(1);
    expect(sand[0].y).toBeGreaterThan(10);
  });

  it("让水(H2O/WATR)受热变成蒸汽(STEM)", () => {
    const simulation = new PowderSimulation(12, 12);
    simulation.setElement(6, 6, ElementId.Water, 140);

    simulation.step(1);

    expect(simulation.getElement(6, 6)).toBe(ElementId.Steam);
  });

  it("让酸(ACID)和碱(BASE)中和并进入盐水/盐终态", () => {
    const simulation = new PowderSimulation(16, 16);
    simulation.setElement(7, 7, ElementId.Acid);
    simulation.setElement(8, 7, ElementId.Base);

    simulation.step(1);

    const products = [simulation.getElement(7, 7), simulation.getElement(8, 7)];
    expect(products).not.toContain(ElementId.Acid);
    expect(products).not.toContain(ElementId.Base);
    expect(products.some((id) => id === ElementId.SaltWater || id === ElementId.Salt || id === ElementId.Water)).toBe(true);
  });

  it("让电池(BTRY)通过导线(WIRE)产生火花(SPRK)", () => {
    const simulation = new PowderSimulation(16, 16);
    simulation.setElement(4, 8, ElementId.Battery);
    simulation.setElement(5, 8, ElementId.Wire);
    simulation.setElement(6, 8, ElementId.Wire);

    simulation.step(6);

    const sparks = findElement(simulation, ElementId.Spark);
    expect(sparks.length).toBeGreaterThan(0);
  });

  it("让种子(SEED)在水边生长成植物(PLNT)", () => {
    const simulation = new PowderSimulation(32, 32);
    for (let x = 0; x < 32; x += 1) {
      simulation.setElement(x, 26, ElementId.Stone);
    }
    simulation.setElement(15, 25, ElementId.Seed);
    simulation.setElement(14, 25, ElementId.Water);
    simulation.setElement(16, 25, ElementId.Water);

    simulation.step(90);

    expect(findElement(simulation, ElementId.Plant).length + findElement(simulation, ElementId.Wood).length).toBeGreaterThan(0);
  });

  it("让熔岩(LAVA)接触水时生成蒸汽与岩石", () => {
    const simulation = new PowderSimulation(16, 16);
    simulation.setElement(7, 8, ElementId.Lava, 980);
    simulation.setElement(8, 8, ElementId.Water, 22);

    simulation.step(2);

    const area = [
      simulation.getElement(7, 8),
      simulation.getElement(8, 8),
      simulation.getElement(7, 7),
      simulation.getElement(8, 7)
    ];
    expect(area.some((id) => id === ElementId.Steam)).toBe(true);
    expect(area.some((id) => id === ElementId.Stone || id === ElementId.Glass)).toBe(true);
  });
});
