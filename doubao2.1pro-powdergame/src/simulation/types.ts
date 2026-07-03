import { ElementState, Category } from './constants';

export interface Particle {
  id: number;
  elementId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  temperature: number;
  life: number;
  flags: number;
  color: string;
  extra?: Record<string, any>;
}

export interface Element {
  id: number;
  name: string;
  nameCn: string;
  symbol: string;
  color: string;
  colors?: string[];
  density: number;
  state: ElementState;
  category: Category;
  meltingPoint?: number;
  boilingPoint?: number;
  flammability: number;
  conductivity: number;
  hardness: number;
  diffusion?: number;
  viscosity?: number;
  life?: number;
  flags: number;
  description?: string;
}
