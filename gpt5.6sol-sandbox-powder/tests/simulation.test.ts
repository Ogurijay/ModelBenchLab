import { describe, expect, it } from "vitest";
import { ELEMENT_LIST, ElementId, getElement } from "../src/simulation/elements";
import { PowderSimulation } from "../src/simulation/PowderSimulation";

const cell = (simulation: PowderSimulation, x: number, y: number): ElementId => simulation.ids[simulation.index(x, y)] as ElementId;

describe("元素目录", () => {
  it("所有可放置元素都有中文名、符号和说明", () => {
    expect(ELEMENT_LIST.length).toBe(58);
    for (const element of ELEMENT_LIST) {
      expect(element.name).toMatch(/[\u4e00-\u9fff]/u);
      expect(element.symbol.length).toBeGreaterThanOrEqual(2);
      expect(element.description.length).toBeGreaterThan(4);
      expect(getElement(element.id).key).toBe(element.key);
    }
  });
});

describe("基础运动与热力学", () => {
  it("沙粒受重力下落", () => {
    const simulation = new PowderSimulation(12, 12, 1);
    simulation.setCell(5, 2, ElementId.Sand);
    simulation.step();
    expect(cell(simulation, 5, 2)).toBe(ElementId.Empty);
    expect(cell(simulation, 5, 3)).toBe(ElementId.Sand);
  });

  it("高温水发生汽化", () => {
    const simulation = new PowderSimulation(12, 12, 2);
    simulation.setCell(5, 5, ElementId.Water, 160);
    simulation.step();
    expect(Array.from(simulation.ids)).toContain(ElementId.Steam);
  });

  it("熔岩遇水生成岩石、蒸汽与正压冲击", () => {
    const simulation = new PowderSimulation(16, 12, 3);
    simulation.setCell(7, 6, ElementId.Lava);
    simulation.setCell(8, 6, ElementId.Water);
    simulation.step();
    expect(Array.from(simulation.ids).some((id) => id === ElementId.Stone || id === ElementId.Glass)).toBe(true);
    expect(Array.from(simulation.ids)).toContain(ElementId.Steam);
    expect(Math.max(...simulation.air.pressure)).toBeGreaterThan(0.2);
  });
});

describe("化学、电学、生命与核反应", () => {
  it("酸与碱中和为盐水", () => {
    const simulation = new PowderSimulation(12, 12, 4);
    simulation.setCell(5, 5, ElementId.Acid);
    simulation.setCell(6, 5, ElementId.Base);
    simulation.step();
    expect(cell(simulation, 5, 5)).toBe(ElementId.SaltWater);
    expect(cell(simulation, 6, 5)).toBe(ElementId.SaltWater);
    expect(simulation.events.some((event) => event.label.includes("酸碱中和"))).toBe(true);
  });

  it("电池通过导线传播电荷", () => {
    const simulation = new PowderSimulation(14, 10, 5);
    simulation.setCell(2, 4, ElementId.Battery);
    simulation.setCell(3, 4, ElementId.Wire);
    simulation.setCell(4, 4, ElementId.Wire);
    simulation.setCell(5, 4, ElementId.Copper);
    simulation.step(2);
    expect(simulation.charge[simulation.index(5, 4)]).toBeGreaterThan(0);
  });

  it("种子在湿润支撑面上萌发", () => {
    const simulation = new PowderSimulation(18, 14, 6);
    for (let x = 5; x <= 11; x += 1) simulation.setCell(x, 9, ElementId.Wall);
    simulation.setCell(8, 8, ElementId.Seed);
    simulation.setCell(7, 8, ElementId.Water);
    simulation.setCell(6, 8, ElementId.Wall);
    simulation.setCell(7, 7, ElementId.Wall);
    for (let frame = 0; frame < 120; frame += 1) simulation.step();
    expect(Array.from(simulation.ids)).toContain(ElementId.Plant);
    expect(simulation.events.some((event) => event.label.includes("萌发"))).toBe(true);
  });

  it("中子撞击铀会触发裂变事件", () => {
    const simulation = new PowderSimulation(18, 12, 7);
    simulation.setCell(7, 6, ElementId.Neutron);
    simulation.aux[simulation.index(7, 6)] = 0;
    simulation.setCell(8, 6, ElementId.Uranium);
    simulation.step();
    expect(Array.from(simulation.ids)).not.toContain(ElementId.Uranium);
    expect(simulation.events.some((event) => event.kind === "nuclear")).toBe(true);
  });
});

describe("存档", () => {
  it("序列化后可以完整恢复粒子、场和环境参数", () => {
    const source = new PowderSimulation(10, 8, 8);
    source.settings.gravityMode = "radial";
    source.setCell(4, 3, ElementId.Mercury, 33);
    source.air.inject(4, 3, 2, 1, -1, 2);
    source.step();
    const snapshot = source.serialize();

    const restored = new PowderSimulation(10, 8, 9);
    restored.restore(snapshot);
    expect(Array.from(restored.ids)).toEqual(Array.from(source.ids));
    expect(restored.settings.gravityMode).toBe("radial");
    expect(restored.tick).toBe(source.tick);
    expect(restored.air.pressure[restored.index(4, 3)]).toBeCloseTo(snapshot.pressure[restored.index(4, 3)] ?? 0, 2);
  });
});
