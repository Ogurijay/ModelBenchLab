import type { ElementId } from "./elements";

export type ElementState = "empty" | "solid" | "powder" | "liquid" | "gas" | "energy";

export type ElementCategory =
  | "powder"
  | "liquid"
  | "gas"
  | "solid"
  | "electronic"
  | "nuclear"
  | "life";

export interface ElementDefinition {
  id: ElementId;
  key: string;
  symbol: string;
  formula?: string;
  name: string;
  category: ElementCategory;
  state: ElementState;
  color: string;
  density: number;
  heatCapacity: number;
  conductivity: number;
  defaultTemp?: number;
  viscosity?: number;
  acidResistance?: number;
  conductive?: boolean;
  combustible?: boolean;
  burnTemp?: number;
  meltPoint?: number;
  boilPoint?: number;
  freezePoint?: number;
  meltsTo?: ElementId;
  boilsTo?: ElementId;
  freezesTo?: ElementId;
  condensesTo?: ElementId;
  coolsTo?: ElementId;
  immovable?: boolean;
}

export interface AmbientSettings {
  gravity: number;
  windX: number;
  windY: number;
  ambientPressure: number;
  vorticity: number;
  airHeatConvection: boolean;
}

export type ToolId = "ERASE" | "HEAT" | "COOL" | "WIND" | "VAC" | "PRES" | "MIX";

export type BrushSelection =
  | { type: "element"; element: ElementId }
  | { type: "tool"; tool: ToolId };

export type RenderMode = "normal" | "thermal" | "pressure" | "electric";

export interface SimulationStats {
  frame: number;
  particles: number;
  avgTemp: number;
  avgPressure: number;
  maxTemp: number;
}
