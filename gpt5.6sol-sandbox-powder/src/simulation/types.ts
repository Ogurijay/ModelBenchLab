export type ElementState = "empty" | "solid" | "powder" | "liquid" | "gas" | "energy";

export type ElementCategory =
  | "build"
  | "powder"
  | "liquid"
  | "gas"
  | "electricity"
  | "energy"
  | "life";

export type ViewMode = "normal" | "heat" | "pressure" | "air" | "electric";
export type GravityMode = "down" | "off" | "radial";

export type ToolId =
  | "erase"
  | "heat"
  | "cool"
  | "air"
  | "vacuum"
  | "pressure"
  | "mix"
  | "lightning";

export interface PhaseTransition {
  at: number;
  to: number;
}

export interface ElementDefinition {
  id: number;
  key: string;
  symbol: string;
  formula?: string;
  name: string;
  description: string;
  category: ElementCategory;
  state: ElementState;
  color: string;
  density: number;
  gravity: number;
  diffusion: number;
  viscosity: number;
  heatCapacity: number;
  conductivity: number;
  defaultTemp: number;
  acidResistance: number;
  immovable: boolean;
  conductive: boolean;
  resistance: number;
  flammable: number;
  ignitionTemp: number;
  burnProduct?: number;
  explosive: number;
  highTemp?: PhaseTransition;
  lowTemp?: PhaseTransition;
  highPressure?: PhaseTransition;
}

export interface EnvironmentSettings {
  ambientTemp: number;
  ambientPressure: number;
  ambientVx: number;
  ambientVy: number;
  gravity: number;
  gravityMode: GravityMode;
  vorticity: number;
  airHeat: boolean;
}

export interface ProbeReading {
  x: number;
  y: number;
  id: number;
  temp: number;
  pressure: number;
  vx: number;
  vy: number;
  life: number;
  charge: number;
}

export interface ReactionEvent {
  tick: number;
  x: number;
  y: number;
  label: string;
  kind: "phase" | "chemical" | "electric" | "nuclear" | "life" | "force";
}

export interface SimulationStats {
  tick: number;
  particles: number;
  averageTemp: number;
  peakPressure: number;
  activeCharge: number;
}

export interface SimulationSnapshot {
  version: 1;
  width: number;
  height: number;
  tick: number;
  seed: number;
  settings: EnvironmentSettings;
  ids: number[];
  temp: number[];
  life: number[];
  aux: number[];
  charge: number[];
  pressure: number[];
  airVx: number[];
  airVy: number[];
}

export interface BrushSelection {
  kind: "element" | "tool";
  id: number | ToolId;
}

