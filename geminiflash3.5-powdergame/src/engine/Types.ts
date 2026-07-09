export const ElementId = {
  NONE: 0,
  WALL: 1,      // 墙壁 (W)
  COND_WALL: 2, // 导线墙 (Cw)
  STONE: 3,     // 石头 (St)
  WOOD: 4,      // 木头 (Wd)
  ICE: 5,       // 冰 (I)
  COPPER: 6,    // 铜 (Cu)
  SILICON: 7,   // 硅 (Si)
  WATER: 8,     // 水 (H2O)
  OIL: 9,       // 油 (Ol)
  ACID: 10,     // 酸 (Ac)
  LAVA: 11,     // 熔岩 (Lv)
  FIRE: 12,     // 火 (F)
  SMOKE: 13,    // 烟 (Sm)
  STEAM: 14,    // 蒸汽 (H2O(g))
  GAS: 15,      // 天然气 (G)
  GUNPOWDER: 16,// 火药 (Gp)
  C4: 17,       // 炸药 (C4)
  PLUTONIUM: 18 // 钚 (Pu)
} as const;

export type ElementId = number;

export type ElementCategory = 'wall' | 'solid' | 'liquid' | 'gas' | 'special' | 'electronics';

export interface ElementDef {
  id: ElementId;
  name: string;      // 中文名，如 "水"
  symbol: string;    // 化学/物理符号，如 "H₂O"
  color: string;     // 默认渲染颜色 (hex)
  glow: boolean;     // 是否发光 (Glow 特效)
  category: ElementCategory;
  density: number;   // 密度：用于浮力与重力排序。0表示不受重力（墙/气），液体和粉末有不同密度
  flammable: number; // 易燃性 (0 - 1)，0表示不燃
  thermalConductivity: number; // 导热系数 (0 - 1)
  defaultTemp: number; // 默认生成温度 (摄氏度)
  meltTemp?: number;   // 熔点/沸点
  meltTo?: ElementId;  // 熔化后的元素
  freezeTemp?: number; // 凝固点
  freezeTo?: ElementId;// 凝固后的元素
  description: string; // 描述
}