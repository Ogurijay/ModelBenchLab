export const GRID_WIDTH = 256;
export const GRID_HEIGHT = 192;
export const CELL_SIZE = 4;

export const ROOM_TEMP = 295.15;
export const MAX_TEMP = 10000;
export const MIN_TEMP = 0;

export const GRAVITY = 0.25;
export const PRESSURE_SPEED = 0.5;
export const HEAT_SPEED = 0.25;
export const AIR_SPEED = 0.5;

export const MAX_PRESSURE = 4;
export const MIN_PRESSURE = -4;

export enum ElementState {
  SOLID = 0,
  POWDER = 1,
  LIQUID = 2,
  GAS = 3,
  ENERGY = 4,
}

export enum Category {
  POWDER = '粉末',
  LIQUID = '液体',
  GAS = '气体',
  SOLID = '固体',
  ENERGY = '能源',
  ELECTRONIC = '电子',
  LIFE = '生命',
  SPECIAL = '特殊',
}

export const FLAGS = {
  MOVED: 1 << 0,
  STATIC: 1 << 1,
  CONDUCTIVE: 1 << 2,
  FLAMMABLE: 1 << 3,
  BURNING: 1 << 4,
  HOT: 1 << 5,
  COLD: 1 << 6,
  GLOWING: 1 << 7,
  INDESTRUCTIBLE: 1 << 8,
  LIFE: 1 << 9,
};
