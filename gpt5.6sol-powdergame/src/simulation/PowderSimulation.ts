import { AirField } from "./AirField";
import { ElementId, getElement } from "./elements";
import { SeededRandom } from "./random";
import type {
  BrushSelection,
  EnvironmentSettings,
  ProbeReading,
  ReactionEvent,
  SimulationSnapshot,
  SimulationStats,
  ToolId
} from "./types";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const CARDINAL = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
const AROUND = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  ambientTemp: 22,
  ambientPressure: 0,
  ambientVx: 0,
  ambientVy: 0,
  gravity: 1,
  gravityMode: "down",
  vorticity: 0.1,
  airHeat: true
};

export class PowderSimulation {
  readonly size: number;
  readonly ids: Uint8Array;
  readonly temp: Float32Array;
  readonly life: Uint16Array;
  readonly aux: Int16Array;
  readonly charge: Uint8Array;
  readonly air: AirField;
  readonly events: ReactionEvent[] = [];

  settings: EnvironmentSettings = { ...DEFAULT_ENVIRONMENT };
  tick = 0;

  private readonly updated: Uint32Array;
  private readonly random: SeededRandom;
  private initialSeed: number;

  constructor(
    readonly width = 224,
    readonly height = 128,
    seed = 0x56_50_54
  ) {
    this.size = width * height;
    this.ids = new Uint8Array(this.size);
    this.temp = new Float32Array(this.size);
    this.life = new Uint16Array(this.size);
    this.aux = new Int16Array(this.size);
    this.charge = new Uint8Array(this.size);
    this.updated = new Uint32Array(this.size);
    this.random = new SeededRandom(seed);
    this.initialSeed = seed;
    this.air = new AirField(width, height, this.settings.ambientTemp);
    this.clear();
  }

  clear(): void {
    this.ids.fill(ElementId.Empty);
    this.temp.fill(this.settings.ambientTemp);
    this.life.fill(0);
    this.aux.fill(0);
    this.charge.fill(0);
    this.updated.fill(0);
    this.air.clear(this.settings);
    this.events.length = 0;
    this.tick = 0;
    this.random.setSeed(this.initialSeed);
  }

  reset(seed = this.initialSeed): void {
    this.initialSeed = seed;
    this.clear();
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  setCell(x: number, y: number, id: ElementId, temperature?: number, overwrite = true): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = this.index(x, y);
    if (!overwrite && this.ids[i] !== ElementId.Empty) return false;
    this.initializeCell(i, id, temperature);
    return true;
  }

  getProbe(x: number, y: number): ProbeReading {
    const nx = clamp(Math.floor(x), 0, this.width - 1);
    const ny = clamp(Math.floor(y), 0, this.height - 1);
    const i = this.index(nx, ny);
    return {
      x: nx,
      y: ny,
      id: this.ids[i] ?? ElementId.Empty,
      temp: this.temp[i] ?? this.settings.ambientTemp,
      pressure: this.air.pressure[i] ?? this.settings.ambientPressure,
      vx: this.air.vx[i] ?? 0,
      vy: this.air.vy[i] ?? 0,
      life: this.life[i] ?? 0,
      charge: this.charge[i] ?? 0
    };
  }

  getStats(): SimulationStats {
    let particles = 0;
    let heatSum = 0;
    let peakPressure = 0;
    let activeCharge = 0;
    for (let i = 0; i < this.size; i += 1) {
      if (this.ids[i] !== ElementId.Empty) {
        particles += 1;
        heatSum += this.temp[i] ?? this.settings.ambientTemp;
      }
      peakPressure = Math.max(peakPressure, Math.abs(this.air.pressure[i] ?? 0));
      if ((this.charge[i] ?? 0) > 8) activeCharge += 1;
    }
    return {
      tick: this.tick,
      particles,
      averageTemp: particles ? heatSum / particles : this.settings.ambientTemp,
      peakPressure,
      activeCharge
    };
  }

  step(iterations = 1): void {
    const count = clamp(Math.floor(iterations), 1, 8);
    for (let iteration = 0; iteration < count; iteration += 1) {
      this.tick += 1;
      this.air.update(this.ids, this.temp, this.settings);
      this.updateChargeField();

      const rowStart = this.tick % 2 === 0 ? this.height - 2 : 1;
      const rowEnd = this.tick % 2 === 0 ? 0 : this.height - 1;
      const rowStep = this.tick % 2 === 0 ? -1 : 1;

      for (let y = rowStart; y !== rowEnd; y += rowStep) {
        const reverse = (y + this.tick) % 2 === 0;
        for (let offset = 1; offset < this.width - 1; offset += 1) {
          const x = reverse ? this.width - 1 - offset : offset;
          const i = this.index(x, y);
          if (this.ids[i] === ElementId.Empty || this.updated[i] === this.tick) continue;
          this.updated[i] = this.tick;
          this.updateCell(x, y, i);
        }
      }
    }
  }

  paintDisc(x: number, y: number, selection: BrushSelection, radius: number, strength = 1, dragX = 0, dragY = 0): void {
    const r = clamp(Math.floor(radius), 1, 18);
    const r2 = r * r;
    for (let oy = -r; oy <= r; oy += 1) {
      for (let ox = -r; ox <= r; ox += 1) {
        const d2 = ox * ox + oy * oy;
        if (d2 > r2 || !this.random.chance(clamp(strength * (1 - d2 / (r2 + 1)) + 0.15, 0, 1))) continue;
        const px = Math.round(x + ox);
        const py = Math.round(y + oy);
        if (!this.inBounds(px, py)) continue;
        if (selection.kind === "element") {
          const id = selection.id as ElementId;
          const current = this.ids[this.index(px, py)] ?? ElementId.Empty;
          const overwrite = id === ElementId.Wall || id === ElementId.Diamond || current === ElementId.Empty;
          this.setCell(px, py, id, undefined, overwrite);
        } else {
          this.applyTool(px, py, selection.id as ToolId, dragX, dragY);
        }
      }
    }
  }

  serialize(): SimulationSnapshot {
    return {
      version: 1,
      width: this.width,
      height: this.height,
      tick: this.tick,
      seed: this.random.getSeed(),
      settings: { ...this.settings },
      ids: Array.from(this.ids),
      temp: Array.from(this.temp, (value) => Math.round(value * 10) / 10),
      life: Array.from(this.life),
      aux: Array.from(this.aux),
      charge: Array.from(this.charge),
      pressure: Array.from(this.air.pressure, (value) => Math.round(value * 100) / 100),
      airVx: Array.from(this.air.vx, (value) => Math.round(value * 100) / 100),
      airVy: Array.from(this.air.vy, (value) => Math.round(value * 100) / 100)
    };
  }

  restore(snapshot: SimulationSnapshot): void {
    if (snapshot.version !== 1 || snapshot.width !== this.width || snapshot.height !== this.height) {
      throw new Error("存档尺寸或版本与当前实验场不兼容");
    }
    const arrays = [snapshot.ids, snapshot.temp, snapshot.life, snapshot.aux, snapshot.charge, snapshot.pressure, snapshot.airVx, snapshot.airVy];
    if (arrays.some((array) => array.length !== this.size)) throw new Error("存档数据长度不完整");
    this.settings = { ...DEFAULT_ENVIRONMENT, ...snapshot.settings };
    this.ids.set(snapshot.ids);
    this.temp.set(snapshot.temp);
    this.life.set(snapshot.life);
    this.aux.set(snapshot.aux);
    this.charge.set(snapshot.charge);
    this.air.pressure.set(snapshot.pressure);
    this.air.vx.set(snapshot.airVx);
    this.air.vy.set(snapshot.airVy);
    this.tick = snapshot.tick;
    this.random.setSeed(snapshot.seed);
    this.updated.fill(0);
    this.events.length = 0;
  }

  private initializeCell(i: number, id: ElementId, temperature?: number): void {
    const element = getElement(id);
    this.ids[i] = id;
    this.temp[i] = temperature ?? (id === ElementId.Empty ? this.settings.ambientTemp : element.defaultTemp);
    this.life[i] = this.defaultLife(id);
    this.aux[i] = this.defaultAux(id);
    this.charge[i] = id === ElementId.Battery ? 255 : id === ElementId.Spark || id === ElementId.Lightning ? 240 : 0;
  }

  private defaultLife(id: ElementId): number {
    switch (id) {
      case ElementId.Fire: return 42 + this.random.integer(34);
      case ElementId.Plasma: return 55 + this.random.integer(45);
      case ElementId.Lightning: return 8 + this.random.integer(5);
      case ElementId.Spark: return 5;
      case ElementId.Neutron: return 220;
      case ElementId.Photon: return 260;
      case ElementId.Smoke: return 260 + this.random.integer(180);
      case ElementId.Fog: return 420;
      case ElementId.Seed: return 1;
      case ElementId.Yeast:
      case ElementId.Bacteria: return 600;
      default: return 0;
    }
  }

  private defaultAux(id: ElementId): number {
    if (id === ElementId.Photon || id === ElementId.Neutron || id === ElementId.Lightning) return this.random.integer(DIRECTIONS.length);
    return 0;
  }

  private updateCell(x: number, y: number, i: number): void {
    let id = this.ids[i] as ElementId;
    let element = getElement(id);

    this.exchangeHeat(x, y, i, element.conductivity, element.heatCapacity);
    if (this.applyTransition(x, y, i, element)) return;
    id = this.ids[i] as ElementId;
    element = getElement(id);

    if (this.applySpecial(x, y, i, id)) return;
    if (this.applyChemistry(x, y, i, id)) return;

    if (id === ElementId.Boyle) this.temp[i] = clamp((this.temp[i] ?? 22) + Math.max(0, this.air.pressure[i] ?? 0) * 0.09, -273, 5_000);
    if (id === ElementId.Uranium) this.temp[i] = clamp((this.temp[i] ?? 22) + Math.abs(this.air.pressure[i] ?? 0) * 0.025, -273, 5_000);

    if (element.state === "powder" || (element.state === "solid" && !element.immovable && element.gravity !== 0)) {
      this.movePowder(x, y, i, element.gravity);
    } else if (element.state === "liquid") {
      this.moveLiquid(x, y, i);
    } else if (element.state === "gas") {
      this.moveGas(x, y, i, element.gravity);
    } else if (element.state === "energy") {
      this.moveEnergy(x, y, i, id);
    }
  }

  private exchangeHeat(x: number, y: number, i: number, conductivity: number, heatCapacity: number): void {
    const direction = CARDINAL[this.random.integer(CARDINAL.length)] ?? CARDINAL[0];
    const nx = x + direction[0];
    const ny = y + direction[1];
    if (this.inBounds(nx, ny)) {
      const ni = this.index(nx, ny);
      const neighborId = this.ids[ni] ?? ElementId.Empty;
      if (neighborId !== ElementId.Empty && neighborId !== ElementId.Wall) {
        const neighbor = getElement(neighborId);
        const coefficient = Math.min(conductivity, neighbor.conductivity) * 0.075;
        const delta = ((this.temp[ni] ?? 22) - (this.temp[i] ?? 22)) * coefficient;
        this.temp[i] = clamp((this.temp[i] ?? 22) + delta / Math.max(0.2, heatCapacity), -273, 5_000);
        this.temp[ni] = clamp((this.temp[ni] ?? 22) - delta / Math.max(0.2, neighbor.heatCapacity), -273, 5_000);
      }
    }

    if (this.settings.airHeat) {
      const airTemp = this.air.heat[i] ?? this.settings.ambientTemp;
      const coupling = getElement(this.ids[i] ?? 0).state === "gas" ? 0.035 : 0.009;
      this.temp[i] = clamp((this.temp[i] ?? 22) + (airTemp - (this.temp[i] ?? 22)) * coupling, -273, 5_000);
    } else {
      this.temp[i] = clamp((this.temp[i] ?? 22) + (this.settings.ambientTemp - (this.temp[i] ?? 22)) * 0.0005, -273, 5_000);
    }
  }

  private applyTransition(x: number, y: number, i: number, element: ReturnType<typeof getElement>): boolean {
    const t = this.temp[i] ?? this.settings.ambientTemp;
    const p = Math.abs(this.air.pressure[i] ?? 0);
    if (element.highTemp && t >= element.highTemp.at) {
      this.transform(i, element.highTemp.to as ElementId, t);
      this.emit(x, y, `${element.name}发生高温相变`, "phase");
      return true;
    }
    if (element.lowTemp && t <= element.lowTemp.at) {
      this.transform(i, element.lowTemp.to as ElementId, t);
      this.emit(x, y, `${element.name}发生低温相变`, "phase");
      return true;
    }
    if (element.highPressure && p >= element.highPressure.at) {
      this.transform(i, element.highPressure.to as ElementId, t);
      this.emit(x, y, `${element.name}被压力破坏`, "force");
      return true;
    }
    return false;
  }

  private applySpecial(x: number, y: number, i: number, id: ElementId): boolean {
    switch (id) {
      case ElementId.Fire:
      case ElementId.Plasma:
        return this.updateFlame(x, y, i, id);
      case ElementId.Spark:
        return this.updateSpark(x, y, i);
      case ElementId.Lightning:
        return this.updateLightning(x, y, i);
      case ElementId.Photon:
      case ElementId.Neutron:
        return false;
      case ElementId.BlackHole:
        this.updateSingularity(x, y, i, -1);
        return false;
      case ElementId.WhiteHole:
        this.updateSingularity(x, y, i, 1);
        return false;
      case ElementId.Seed:
        return this.updateSeed(x, y, i);
      case ElementId.Plant:
        this.updatePlant(x, y, i);
        return false;
      case ElementId.Yeast:
      case ElementId.Bacteria:
        this.updateMicrobe(x, y, i, id);
        return false;
      case ElementId.Smoke:
        if ((this.life[i] ?? 0) > 0) this.life[i] = (this.life[i] ?? 0) - 1;
        if (this.life[i] === 0 && this.random.chance(0.04)) {
          this.initializeCell(i, ElementId.Empty);
          return true;
        }
        return false;
      case ElementId.Plutonium:
        if ((this.air.pressure[i] ?? 0) > 5 && (this.temp[i] ?? 22) > 240 && this.random.chance(0.035)) {
          this.fission(x, y, i, "钚发生压致裂变");
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  private applyChemistry(x: number, y: number, i: number, id: ElementId): boolean {
    const shuffled = this.random.chance(0.5) ? AROUND : [...AROUND].reverse();
    for (const [ox, oy] of shuffled) {
      const nx = x + ox;
      const ny = y + oy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      const neighborId = this.ids[ni] as ElementId;
      if (neighborId === ElementId.Empty) continue;

      if ((id === ElementId.Acid && neighborId === ElementId.Base) || (id === ElementId.Base && neighborId === ElementId.Acid)) {
        const reactionTemp = Math.max(this.temp[i] ?? 22, this.temp[ni] ?? 22) + 38;
        this.transform(i, ElementId.SaltWater, reactionTemp);
        this.transform(ni, ElementId.SaltWater, reactionTemp);
        this.air.inject(x, y, 0.5, 0, -0.1, 2, reactionTemp);
        this.emit(x, y, "酸碱中和生成盐水", "chemical");
        return true;
      }

      if ((id === ElementId.Salt && this.isWater(neighborId)) || (neighborId === ElementId.Salt && this.isWater(id))) {
        this.transform(i, ElementId.SaltWater, (this.temp[i] ?? 22) - 1);
        this.transform(ni, ElementId.SaltWater, (this.temp[ni] ?? 22) - 1);
        this.emit(x, y, "食盐溶解形成盐水", "chemical");
        return true;
      }

      if ((id === ElementId.Lava && (this.isWater(neighborId) || neighborId === ElementId.Snow)) || (neighborId === ElementId.Lava && (this.isWater(id) || id === ElementId.Snow))) {
        const lavaIndex = id === ElementId.Lava ? i : ni;
        const waterIndex = id === ElementId.Lava ? ni : i;
        this.transform(lavaIndex, this.random.chance(0.22) ? ElementId.Glass : ElementId.Stone, 380);
        this.transform(waterIndex, ElementId.Steam, 180);
        this.air.inject(x, y, 6, ox * -0.8, oy * -0.8, 4, 420);
        this.emit(x, y, "熔岩遇水淬火并产生蒸汽冲击", "chemical");
        return true;
      }

      if ((id === ElementId.LiquidNitrogen && this.isWater(neighborId)) || (neighborId === ElementId.LiquidNitrogen && this.isWater(id))) {
        const nitrogenIndex = id === ElementId.LiquidNitrogen ? i : ni;
        const waterIndex = id === ElementId.LiquidNitrogen ? ni : i;
        this.transform(waterIndex, ElementId.Snow, -35);
        this.transform(nitrogenIndex, ElementId.NobleGas, -150);
        this.air.inject(x, y, 1.4, 0, -0.4, 2, -120);
        this.emit(x, y, "液氮使水瞬间冻结", "phase");
        return true;
      }

      if (id === ElementId.Acid && this.canCorrode(neighborId) && this.random.chance((1 - getElement(neighborId).acidResistance) * 0.055)) {
        this.initializeCell(ni, this.random.chance(0.25) ? ElementId.Fog : ElementId.Empty, this.temp[i]);
        if (this.random.chance(0.12)) this.transform(i, ElementId.Water, this.temp[i]);
        this.emit(x, y, `酸腐蚀${getElement(neighborId).name}`, "chemical");
        return false;
      }

      if (id === ElementId.Base && this.isOrganic(neighborId) && this.random.chance(0.035)) {
        this.transform(ni, ElementId.Ash, this.temp[ni]);
        this.emit(x, y, `碱分解${getElement(neighborId).name}`, "chemical");
        return false;
      }

      if (id === ElementId.Clay && this.isWater(neighborId) && this.random.chance(0.02)) {
        this.aux[i] = clamp((this.aux[i] ?? 0) + 1, 0, 8);
        if (this.random.chance(0.12)) this.initializeCell(ni, ElementId.Empty);
      }
    }
    return false;
  }

  private updateFlame(x: number, y: number, i: number, id: ElementId): boolean {
    if ((this.life[i] ?? 0) > 0) this.life[i] = (this.life[i] ?? 0) - 1;
    const hot = id === ElementId.Plasma ? 3_100 : 760;
    this.temp[i] = Math.max(this.temp[i] ?? 22, hot);
    this.air.inject(x, y, id === ElementId.Plasma ? 0.18 : 0.08, 0, -0.08, 1, hot);

    let oxygen = false;
    let co2 = false;
    let hydrogenIndex = -1;
    let oxygenIndex = -1;

    for (const [ox, oy] of AROUND) {
      const nx = x + ox;
      const ny = y + oy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      const neighborId = this.ids[ni] as ElementId;
      if (neighborId === ElementId.Oxygen) {
        oxygen = true;
        oxygenIndex = ni;
      }
      if (neighborId === ElementId.CarbonDioxide) co2 = true;
      if (neighborId === ElementId.Hydrogen) hydrogenIndex = ni;
      const neighbor = getElement(neighborId);
      if (neighbor.flammable > 0 && ((this.temp[i] ?? hot) >= neighbor.ignitionTemp || id === ElementId.Plasma) && this.random.chance(0.03 + neighbor.flammable * 0.16)) {
        if (neighbor.explosive > 0) {
          this.explode(nx, ny, neighbor.explosive, Math.max(850, neighbor.ignitionTemp * 2));
        } else {
          this.transform(ni, ElementId.Fire, Math.max(620, neighbor.ignitionTemp + 200));
        }
      }
    }

    if (hydrogenIndex >= 0 && oxygenIndex >= 0) {
      this.transform(hydrogenIndex, ElementId.Steam, 420);
      this.transform(oxygenIndex, ElementId.Steam, 420);
      this.explode(x, y, 1.6, 1_250);
      this.emit(x, y, "氢氧混合气燃烧生成水蒸气", "chemical");
      return true;
    }

    if (oxygen && this.random.chance(0.08)) {
      if (oxygenIndex >= 0) this.initializeCell(oxygenIndex, ElementId.Empty);
      this.life[i] = clamp((this.life[i] ?? 0) + 8, 0, 180);
      this.temp[i] = clamp((this.temp[i] ?? hot) + 80, -273, 5_000);
    }

    if (co2 && id === ElementId.Fire && this.random.chance(0.2)) this.life[i] = Math.min(this.life[i] ?? 0, 3);

    if (this.life[i] === 0) {
      this.transform(i, id === ElementId.Plasma ? ElementId.NobleGas : this.random.chance(0.58) ? ElementId.Smoke : ElementId.Empty, Math.min(this.temp[i] ?? 22, 180));
      return true;
    }
    return false;
  }

  private updateSpark(x: number, y: number, i: number): boolean {
    for (const [ox, oy] of AROUND) {
      const nx = x + ox;
      const ny = y + oy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      const neighbor = getElement(this.ids[ni] ?? ElementId.Empty);
      if (neighbor.conductive) this.charge[ni] = Math.max(this.charge[ni] ?? 0, 235);
      if (neighbor.flammable > 0 && this.random.chance(neighbor.flammable * 0.18)) this.transform(ni, ElementId.Fire, 680);
    }
    if ((this.life[i] ?? 0) > 0) this.life[i] = (this.life[i] ?? 0) - 1;
    if (this.life[i] === 0) {
      this.initializeCell(i, ElementId.Empty);
      return true;
    }
    return false;
  }

  private updateLightning(x: number, y: number, i: number): boolean {
    this.air.inject(x, y, 2.2, 0, 0, 2, 4_200);
    this.temp[i] = 4_200;
    for (const [ox, oy] of AROUND) {
      const nx = x + ox;
      const ny = y + oy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      if (getElement(this.ids[ni] ?? 0).conductive) this.charge[ni] = 255;
      if (getElement(this.ids[ni] ?? 0).flammable > 0 && this.random.chance(0.2)) this.transform(ni, ElementId.Fire, 900);
    }
    if ((this.life[i] ?? 0) > 0) this.life[i] = (this.life[i] ?? 0) - 1;
    if (this.life[i] === 0) {
      this.initializeCell(i, ElementId.Empty);
      return true;
    }
    return false;
  }

  private updateChargeField(): void {
    for (let y = 1; y < this.height - 1; y += 1) {
      for (let x = 1; x < this.width - 1; x += 1) {
        const i = this.index(x, y);
        const id = this.ids[i] as ElementId;
        const element = getElement(id);

        if (id === ElementId.Battery) {
          this.charge[i] = 255;
          for (const [ox, oy] of CARDINAL) {
            const ni = this.index(x + ox, y + oy);
            if (getElement(this.ids[ni] ?? 0).conductive) this.charge[ni] = Math.max(this.charge[ni] ?? 0, 230);
          }
          continue;
        }

        const currentCharge = this.charge[i] ?? 0;
        if (!element.conductive || currentCharge < 24) {
          if (currentCharge > 0) this.charge[i] = Math.max(0, currentCharge - 14);
          continue;
        }

        if (id === ElementId.Switch) this.aux[i] = currentCharge > 110 ? 12 : Math.max(0, (this.aux[i] ?? 0) - 1);
        const canOutput = id !== ElementId.Switch || (this.aux[i] ?? 0) > 0;
        if (canOutput) {
          for (const [ox, oy] of CARDINAL) {
            const ni = this.index(x + ox, y + oy);
            const neighborId = this.ids[ni] as ElementId;
            const neighbor = getElement(neighborId);
            if (!neighbor.conductive || !this.allowsCurrent(id, neighborId)) continue;
            const transmitted = Math.max(0, currentCharge - Math.round(18 + neighbor.resistance * 28));
            if (transmitted > (this.charge[ni] ?? 0) + 8) this.charge[ni] = transmitted;
          }
        }
        this.temp[i] = clamp((this.temp[i] ?? 22) + currentCharge * element.resistance * 0.003, -273, 5_000);
        this.charge[i] = Math.max(0, currentCharge - Math.round(12 + element.resistance * 12));
        if (currentCharge > 210 && this.random.chance(0.002)) this.emit(x, y, `${element.name}传递电荷`, "electric");
      }
    }
  }

  private allowsCurrent(from: ElementId, to: ElementId): boolean {
    if (from === ElementId.NType && to === ElementId.PType) return false;
    if (from === ElementId.PType && to === ElementId.NType) return true;
    return true;
  }

  private updateSeed(x: number, y: number, i: number): boolean {
    const t = this.temp[i] ?? 22;
    if (t < 2 || t > 48) return false;
    let waterIndex = -1;
    for (const [ox, oy] of AROUND) {
      const nx = x + ox;
      const ny = y + oy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      if (this.isWater(this.ids[ni] as ElementId)) waterIndex = ni;
    }
    const belowId = y + 1 < this.height ? this.ids[this.index(x, y + 1)] as ElementId : ElementId.Wall;
    const supported = belowId !== ElementId.Empty && getElement(belowId).state !== "gas" && getElement(belowId).state !== "energy";
    if (waterIndex >= 0 && supported && this.random.chance(0.12)) {
      this.transform(i, ElementId.Plant, t);
      if (this.random.chance(0.7)) this.initializeCell(waterIndex, ElementId.Empty);
      for (let length = 1; length <= 5; length += 1) {
        const ny = y - length;
        if (ny < 1) break;
        const ni = this.index(x + (length > 3 ? this.random.sign() : 0), ny);
        if (this.ids[ni] !== ElementId.Empty) break;
        this.initializeCell(ni, ElementId.Plant, t);
      }
      this.emit(x, y, "种子吸水萌发", "life");
      return true;
    }
    return false;
  }

  private updatePlant(x: number, y: number, i: number): void {
    if (!this.random.chance(0.012)) return;
    for (const [ox, oy] of AROUND) {
      const nx = x + ox;
      const ny = y + oy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      const id = this.ids[ni] as ElementId;
      if (this.isWater(id) || id === ElementId.CarbonDioxide) {
        this.initializeCell(ni, ElementId.Empty);
        const tx = x + this.random.sign();
        const ty = y - (this.random.chance(0.7) ? 1 : 0);
        if (this.inBounds(tx, ty) && this.ids[this.index(tx, ty)] === ElementId.Empty) this.setCell(tx, ty, ElementId.Plant, this.temp[i], false);
        if (id === ElementId.CarbonDioxide && this.random.chance(0.4)) this.setCell(nx, ny, ElementId.Oxygen, this.temp[i], true);
        return;
      }
    }
  }

  private updateMicrobe(x: number, y: number, i: number, id: ElementId): void {
    const t = this.temp[i] ?? 22;
    const viable = id === ElementId.Yeast ? t > 8 && t < 45 : t > 12 && t < 52;
    if (!viable || !this.random.chance(id === ElementId.Yeast ? 0.015 : 0.01)) return;
    for (const [ox, oy] of AROUND) {
      const nx = x + ox;
      const ny = y + oy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      if (this.isWater(this.ids[ni] as ElementId)) {
        this.transform(ni, id, t);
        if (id === ElementId.Yeast && this.random.chance(0.3)) this.air.inject(x, y, 0.08, 0, -0.02, 1);
        return;
      }
    }
  }

  private updateSingularity(x: number, y: number, i: number, polarity: -1 | 1): void {
    const radius = 4;
    this.air.inject(x, y, polarity * 4.5, 0, 0, radius);
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        if (ox === 0 && oy === 0 || ox * ox + oy * oy > radius * radius) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.index(nx, ny);
        const targetId = this.ids[ni] as ElementId;
        if (targetId === ElementId.Empty || targetId === ElementId.Wall || targetId === ElementId.Diamond || targetId === ElementId.BlackHole || targetId === ElementId.WhiteHole) continue;
        if (polarity === -1 && Math.abs(ox) <= 1 && Math.abs(oy) <= 1 && this.random.chance(0.28)) {
          this.temp[i] = clamp((this.temp[i] ?? 22) + Math.max(1, getElement(targetId).density / 1_000), -273, 5_000);
          this.initializeCell(ni, ElementId.Empty);
          this.emit(x, y, "黑洞吸收物质", "force");
        } else if (polarity === 1 && this.random.chance(0.08)) {
          const tx = nx + Math.sign(ox);
          const ty = ny + Math.sign(oy);
          if (this.inBounds(tx, ty)) this.tryMove(nx, ny, tx, ty);
        }
      }
    }
  }

  private movePowder(x: number, y: number, i: number, gravity: number): boolean {
    if (this.settings.gravityMode === "off" || this.settings.gravity === 0) return this.airDrift(x, y, i, 0.04);
    const [gx, gy] = this.gravityVector(x, y, gravity);
    if (this.tryMove(x, y, x + gx, y + gy)) return true;
    const side = this.random.sign();
    if (this.tryMove(x, y, x + gx + (gy !== 0 ? side : 0), y + gy + (gx !== 0 ? side : 0))) return true;
    if (this.tryMove(x, y, x + gx - (gy !== 0 ? side : 0), y + gy - (gx !== 0 ? side : 0))) return true;
    return this.airDrift(x, y, i, 0.06);
  }

  private moveLiquid(x: number, y: number, i: number): boolean {
    const [gx, gy] = this.settings.gravityMode === "off" ? [0, 0] : this.gravityVector(x, y, 1);
    if ((gx !== 0 || gy !== 0) && this.tryMove(x, y, x + gx, y + gy)) return true;
    const side = this.random.sign();
    if ((gx !== 0 || gy !== 0) && this.tryMove(x, y, x + gx + (gy !== 0 ? side : 0), y + gy + (gx !== 0 ? side : 0))) return true;

    const tx = x + (gy !== 0 ? side : 0);
    const ty = y + (gx !== 0 ? side : 0);
    if (this.tryMove(x, y, tx, ty)) return true;
    if (this.tryMove(x, y, x - (gy !== 0 ? side : 0), y - (gx !== 0 ? side : 0))) return true;
    return this.airDrift(x, y, i, 0.025);
  }

  private moveGas(x: number, y: number, i: number, gravity: number): boolean {
    const flowX = Math.abs(this.air.vx[i] ?? 0) > 0.3 ? Math.sign(this.air.vx[i] ?? 0) : 0;
    const flowY = Math.abs(this.air.vy[i] ?? 0) > 0.3 ? Math.sign(this.air.vy[i] ?? 0) : 0;
    if ((flowX !== 0 || flowY !== 0) && this.tryMove(x, y, x + flowX, y + flowY)) return true;

    const [gx, gy] = this.settings.gravityMode === "off" ? [0, -this.random.sign()] : this.gravityVector(x, y, gravity || -0.1);
    const jitter = this.random.sign();
    if (this.tryMove(x, y, x + gx + (gy !== 0 ? jitter : 0), y + gy + (gx !== 0 ? jitter : 0))) return true;
    if (this.tryMove(x, y, x + jitter, y)) return true;
    return this.tryMove(x, y, x, y + this.random.sign());
  }

  private moveEnergy(x: number, y: number, i: number, id: ElementId): boolean {
    if (id === ElementId.Photon || id === ElementId.Neutron || id === ElementId.Lightning) {
      if ((this.life[i] ?? 0) > 0) this.life[i] = (this.life[i] ?? 0) - 1;
      const direction = DIRECTIONS[Math.abs(this.aux[i] ?? 0) % DIRECTIONS.length] ?? DIRECTIONS[0];
      const nx = x + direction[0];
      const ny = y + direction[1];
      if (!this.inBounds(nx, ny) || this.life[i] === 0) {
        this.initializeCell(i, ElementId.Empty);
        return true;
      }
      const ni = this.index(nx, ny);
      const target = this.ids[ni] as ElementId;
      if (target === ElementId.Empty || (id === ElementId.Photon && target === ElementId.Glass) || (id === ElementId.Neutron && (target === ElementId.Glass || target === ElementId.Water || target === ElementId.DistilledWater))) {
        return this.moveIntoEmpty(i, ni);
      }
      if (id === ElementId.Neutron && (target === ElementId.Uranium || target === ElementId.Plutonium || target === ElementId.Deuterium)) {
        this.fission(nx, ny, ni, `${getElement(target).name}吸收中子发生裂变`);
        this.initializeCell(i, ElementId.Empty);
        return true;
      }
      if (id === ElementId.Photon && getElement(target).conductive) {
        this.temp[ni] = clamp((this.temp[ni] ?? 22) + 6, -273, 5_000);
        this.aux[i] = (this.aux[i] ?? 0) ^ 1;
        return false;
      }
      this.temp[ni] = clamp((this.temp[ni] ?? 22) + (id === ElementId.Neutron ? 22 : 4), -273, 5_000);
      this.initializeCell(i, ElementId.Empty);
      return true;
    }
    return this.moveGas(x, y, i, getElement(id).gravity);
  }

  private fission(x: number, y: number, i: number, label: string): void {
    this.transform(i, this.random.chance(0.35) ? ElementId.Plasma : ElementId.Fire, 2_600);
    this.explode(x, y, 1.45, 2_800);
    let spawned = 0;
    for (const [ox, oy] of DIRECTIONS) {
      const nx = x + ox;
      const ny = y + oy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.index(nx, ny);
      if (this.ids[ni] === ElementId.Empty && spawned < 3) {
        this.initializeCell(ni, ElementId.Neutron, 1_200);
        this.aux[ni] = spawned % DIRECTIONS.length;
        spawned += 1;
      }
    }
    this.emit(x, y, label, "nuclear");
  }

  private explode(x: number, y: number, power: number, heat: number): void {
    const radius = clamp(Math.round(2 + power * 3), 2, 9);
    for (let oy = -radius; oy <= radius; oy += 1) {
      for (let ox = -radius; ox <= radius; ox += 1) {
        const distance = Math.hypot(ox, oy);
        if (distance > radius) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.index(nx, ny);
        const falloff = 1 - distance / (radius + 0.5);
        this.temp[ni] = clamp(Math.max(this.temp[ni] ?? 22, heat * falloff), -273, 5_000);
        const current = this.ids[ni] as ElementId;
        if ((current === ElementId.Empty || getElement(current).state === "gas" || getElement(current).state === "powder") && this.random.chance(falloff * 0.62)) {
          this.initializeCell(ni, this.random.chance(0.76) ? ElementId.Fire : ElementId.Smoke, heat * falloff);
        }
        this.air.inject(nx, ny, power * falloff * 2.2, ox === 0 ? 0 : Math.sign(ox) * power * falloff, oy === 0 ? 0 : Math.sign(oy) * power * falloff, 1, heat);
      }
    }
    this.emit(x, y, "爆燃产生冲击波", "force");
  }

  private tryMove(x: number, y: number, nx: number, ny: number): boolean {
    if (!this.inBounds(nx, ny)) return false;
    const i = this.index(x, y);
    const ni = this.index(nx, ny);
    const sourceId = this.ids[i] as ElementId;
    const targetId = this.ids[ni] as ElementId;
    if (targetId === ElementId.Empty) return this.moveIntoEmpty(i, ni);

    const source = getElement(sourceId);
    const target = getElement(targetId);
    const targetFluid = target.state === "liquid" || target.state === "gas";
    const sourceFluid = source.state === "liquid" || source.state === "gas" || source.state === "powder";
    if (sourceFluid && targetFluid && source.density > target.density * 1.03 && this.random.chance(0.68)) {
      this.swapCells(i, ni);
      return true;
    }
    return false;
  }

  private moveIntoEmpty(from: number, to: number): boolean {
    this.ids[to] = this.ids[from] ?? ElementId.Empty;
    this.temp[to] = this.temp[from] ?? this.settings.ambientTemp;
    this.life[to] = this.life[from] ?? 0;
    this.aux[to] = this.aux[from] ?? 0;
    this.charge[to] = this.charge[from] ?? 0;
    this.updated[to] = this.tick;
    this.initializeCell(from, ElementId.Empty);
    return true;
  }

  private swapCells(a: number, b: number): void {
    const id = this.ids[a] ?? 0;
    const temp = this.temp[a] ?? 22;
    const life = this.life[a] ?? 0;
    const aux = this.aux[a] ?? 0;
    const charge = this.charge[a] ?? 0;
    this.ids[a] = this.ids[b] ?? 0;
    this.temp[a] = this.temp[b] ?? 22;
    this.life[a] = this.life[b] ?? 0;
    this.aux[a] = this.aux[b] ?? 0;
    this.charge[a] = this.charge[b] ?? 0;
    this.ids[b] = id;
    this.temp[b] = temp;
    this.life[b] = life;
    this.aux[b] = aux;
    this.charge[b] = charge;
    this.updated[b] = this.tick;
  }

  private transform(i: number, id: ElementId, temperature?: number): void {
    const preservedTemp = temperature ?? this.temp[i] ?? this.settings.ambientTemp;
    this.initializeCell(i, id, preservedTemp);
    this.updated[i] = this.tick;
  }

  private gravityVector(x: number, y: number, sign: number): [number, number] {
    const direction = Math.sign(sign * this.settings.gravity) || 1;
    if (this.settings.gravityMode === "radial") {
      const dx = this.width * 0.5 - x;
      const dy = this.height * 0.5 - y;
      if (Math.abs(dx) > Math.abs(dy)) return [Math.sign(dx) * direction, 0];
      return [0, Math.sign(dy) * direction];
    }
    return [0, direction];
  }

  private airDrift(x: number, y: number, i: number, threshold: number): boolean {
    const vx = this.air.vx[i] ?? 0;
    const vy = this.air.vy[i] ?? 0;
    if (Math.abs(vx) + Math.abs(vy) < threshold || !this.random.chance(0.22)) return false;
    return this.tryMove(x, y, x + Math.sign(vx), y + Math.sign(vy));
  }

  private applyTool(x: number, y: number, tool: ToolId, dragX: number, dragY: number): void {
    const i = this.index(x, y);
    switch (tool) {
      case "erase":
        this.initializeCell(i, ElementId.Empty);
        this.air.pressure[i] = this.settings.ambientPressure;
        break;
      case "heat":
        this.temp[i] = clamp((this.temp[i] ?? this.settings.ambientTemp) + 55, -273, 5_000);
        this.air.heat[i] = clamp((this.air.heat[i] ?? this.settings.ambientTemp) + 30, -273, 5_000);
        break;
      case "cool":
        this.temp[i] = clamp((this.temp[i] ?? this.settings.ambientTemp) - 45, -273, 5_000);
        this.air.heat[i] = clamp((this.air.heat[i] ?? this.settings.ambientTemp) - 25, -273, 5_000);
        break;
      case "air":
        this.air.inject(x, y, 0.25, clamp(dragX * 0.45, -3, 3), clamp(dragY * 0.45, -3, 3), 2);
        break;
      case "vacuum":
        this.air.inject(x, y, -1.3, 0, 0, 2);
        break;
      case "pressure":
        this.air.inject(x, y, 1.3, 0, 0, 2);
        break;
      case "mix": {
        const nx = clamp(x + this.random.integer(5) - 2, 0, this.width - 1);
        const ny = clamp(y + this.random.integer(5) - 2, 0, this.height - 1);
        this.swapCells(i, this.index(nx, ny));
        break;
      }
      case "lightning":
        if (this.ids[i] === ElementId.Empty) this.initializeCell(i, ElementId.Lightning);
        break;
    }
  }

  private isWater(id: ElementId): boolean {
    return id === ElementId.Water || id === ElementId.DistilledWater || id === ElementId.SaltWater;
  }

  private isOrganic(id: ElementId): boolean {
    return id === ElementId.Wood || id === ElementId.Plant || id === ElementId.Seed || id === ElementId.Yeast || id === ElementId.Bacteria;
  }

  private canCorrode(id: ElementId): boolean {
    return id !== ElementId.Empty && id !== ElementId.Acid && id !== ElementId.Base && id !== ElementId.Wall && id !== ElementId.Diamond && id !== ElementId.BlackHole && id !== ElementId.WhiteHole;
  }

  private emit(x: number, y: number, label: string, kind: ReactionEvent["kind"]): void {
    const last = this.events[0];
    if (last && last.tick === this.tick && last.label === label && Math.abs(last.x - x) < 4 && Math.abs(last.y - y) < 4) return;
    this.events.unshift({ tick: this.tick, x, y, label, kind });
    if (this.events.length > 18) this.events.length = 18;
  }
}
