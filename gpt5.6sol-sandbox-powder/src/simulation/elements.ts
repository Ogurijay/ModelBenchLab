import type { ElementCategory, ElementDefinition, ElementState } from "./types";

export enum ElementId {
  Empty = 0,
  Wall,
  Diamond,
  Stone,
  Brick,
  Glass,
  Wood,
  Ceramic,
  Insulator,
  Sand,
  Dust,
  Salt,
  Coal,
  Gunpowder,
  Clay,
  Snow,
  Thermite,
  Water,
  DistilledWater,
  SaltWater,
  Oil,
  Diesel,
  Acid,
  Base,
  Lava,
  LiquidNitrogen,
  Mercury,
  Steam,
  Oxygen,
  Hydrogen,
  CarbonDioxide,
  Smoke,
  Fog,
  NobleGas,
  Boyle,
  Metal,
  Copper,
  Gold,
  Wire,
  Battery,
  PType,
  NType,
  Switch,
  Spark,
  Fire,
  Plasma,
  Lightning,
  Neutron,
  Photon,
  Uranium,
  Plutonium,
  Deuterium,
  BlackHole,
  WhiteHole,
  Plant,
  Seed,
  Yeast,
  Bacteria,
  Ash
}

type ElementInput = Pick<
  ElementDefinition,
  "id" | "key" | "symbol" | "name" | "description" | "category" | "state" | "color" | "density"
> &
  Partial<Omit<ElementDefinition, "id" | "key" | "symbol" | "name" | "description" | "category" | "state" | "color" | "density">>;

const defaults: Omit<
  ElementDefinition,
  "id" | "key" | "symbol" | "name" | "description" | "category" | "state" | "color" | "density"
> = {
  gravity: 0,
  diffusion: 0,
  viscosity: 1,
  heatCapacity: 3,
  conductivity: 0.12,
  defaultTemp: 22,
  acidResistance: 0.5,
  immovable: false,
  conductive: false,
  resistance: 0.5,
  flammable: 0,
  ignitionTemp: 9_999,
  explosive: 0
};

const e = (input: ElementInput): ElementDefinition => ({ ...defaults, ...input });

export const ELEMENTS: Record<ElementId, ElementDefinition> = {
  [ElementId.Empty]: e({ id: 0, key: "empty", symbol: "VOID", name: "空", description: "没有物质的格点", category: "build", state: "empty", color: "#050608", density: 0 }),
  [ElementId.Wall]: e({ id: 1, key: "wall", symbol: "WALL", name: "隔绝墙", description: "阻挡物质、空气与热量", category: "build", state: "solid", color: "#687078", density: 99_999, immovable: true, acidResistance: 1, conductivity: 0 }),
  [ElementId.Diamond]: e({ id: 2, key: "diamond", symbol: "DMND", formula: "C", name: "金刚石", description: "极耐热、耐压且不受酸腐蚀", category: "build", state: "solid", color: "#b9ecf2", density: 3_510, immovable: true, acidResistance: 1, conductivity: 0.82, highTemp: { at: 3_550, to: ElementId.CarbonDioxide } }),
  [ElementId.Stone]: e({ id: 3, key: "stone", symbol: "STNE", name: "石头", description: "高压下压实，熔化后成为熔岩", category: "build", state: "solid", color: "#7f817c", density: 2_600, gravity: 0.12, acidResistance: 0.82, highTemp: { at: 1_200, to: ElementId.Lava } }),
  [ElementId.Brick]: e({ id: 4, key: "brick", symbol: "BRCK", name: "砖块", description: "受强压会碎成石头", category: "build", state: "solid", color: "#a64f39", density: 2_000, immovable: true, acidResistance: 0.9, highTemp: { at: 950, to: ElementId.Lava }, highPressure: { at: 9, to: ElementId.Stone } }),
  [ElementId.Glass]: e({ id: 5, key: "glass", symbol: "GLAS", formula: "SiO2", name: "玻璃", description: "透明绝缘体，可让光子穿过", category: "build", state: "solid", color: "#78bdc7", density: 2_500, immovable: true, acidResistance: 0.96, conductivity: 0.04, highTemp: { at: 1_420, to: ElementId.Lava } }),
  [ElementId.Wood]: e({ id: 6, key: "wood", symbol: "WOOD", name: "木材", description: "可燃烧并成为灰烬", category: "build", state: "solid", color: "#8e542c", density: 720, immovable: true, acidResistance: 0.35, conductivity: 0.035, flammable: 0.55, ignitionTemp: 280, burnProduct: ElementId.Ash }),
  [ElementId.Ceramic]: e({ id: 7, key: "ceramic", symbol: "CRMC", name: "陶瓷", description: "烧制粘土形成的耐热绝缘体", category: "build", state: "solid", color: "#d7c1a6", density: 2_300, immovable: true, acidResistance: 0.95, conductivity: 0.025, highTemp: { at: 1_800, to: ElementId.Lava } }),
  [ElementId.Insulator]: e({ id: 8, key: "insulator", symbol: "INSL", name: "绝热体", description: "抑制热量与电荷传播", category: "build", state: "solid", color: "#d4b269", density: 1_100, immovable: true, acidResistance: 0.74, conductivity: 0.002 }),

  [ElementId.Sand]: e({ id: 9, key: "sand", symbol: "SAND", formula: "SiO2", name: "沙", description: "堆积成坡，高温熔成玻璃", category: "powder", state: "powder", color: "#d8b864", density: 1_620, gravity: 1, acidResistance: 0.78, highTemp: { at: 1_700, to: ElementId.Glass } }),
  [ElementId.Dust]: e({ id: 10, key: "dust", symbol: "DUST", name: "尘埃", description: "轻质可燃粉尘，会受空气推动", category: "powder", state: "powder", color: "#b8a990", density: 780, gravity: 0.75, diffusion: 0.02, acidResistance: 0.3, flammable: 0.48, ignitionTemp: 360, burnProduct: ElementId.Smoke }),
  [ElementId.Salt]: e({ id: 11, key: "salt", symbol: "SALT", formula: "NaCl", name: "食盐", description: "溶于水形成导电盐水", category: "powder", state: "powder", color: "#eee9db", density: 2_160, gravity: 1, acidResistance: 0.7, highTemp: { at: 801, to: ElementId.Lava } }),
  [ElementId.Coal]: e({ id: 12, key: "coal", symbol: "COAL", formula: "C", name: "煤", description: "缓慢燃烧并释放烟与热", category: "powder", state: "powder", color: "#343230", density: 1_350, gravity: 0.92, acidResistance: 0.6, flammable: 0.24, ignitionTemp: 390, burnProduct: ElementId.Ash }),
  [ElementId.Gunpowder]: e({ id: 13, key: "gunpowder", symbol: "GUNP", name: "火药", description: "点燃后快速爆燃并产生冲击波", category: "powder", state: "powder", color: "#554d43", density: 1_050, gravity: 0.94, acidResistance: 0.25, flammable: 0.95, ignitionTemp: 210, burnProduct: ElementId.Smoke, explosive: 1.25 }),
  [ElementId.Clay]: e({ id: 14, key: "clay", symbol: "CLAY", name: "粘土", description: "吸水后结团，高温烧成陶瓷", category: "powder", state: "powder", color: "#a96c4f", density: 1_720, gravity: 0.85, viscosity: 0.5, acidResistance: 0.54, highTemp: { at: 540, to: ElementId.Ceramic } }),
  [ElementId.Snow]: e({ id: 15, key: "snow", symbol: "SNOW", formula: "H2O", name: "雪", description: "轻盈冰晶，受热融化成水", category: "powder", state: "powder", color: "#e8f4f4", density: 180, gravity: 0.42, diffusion: 0.04, conductivity: 0.06, defaultTemp: -8, highTemp: { at: 1, to: ElementId.Water } }),
  [ElementId.Thermite]: e({ id: 16, key: "thermite", symbol: "THRM", formula: "Fe2O3+Al", name: "铝热剂", description: "点燃后释放极高温并生成熔融金属", category: "powder", state: "powder", color: "#8c5745", density: 2_900, gravity: 1, acidResistance: 0.72, flammable: 0.88, ignitionTemp: 620, burnProduct: ElementId.Metal, explosive: 0.35 }),

  [ElementId.Water]: e({ id: 17, key: "water", symbol: "WATR", formula: "H2O", name: "水", description: "可灭火、溶盐并参与生态生长", category: "liquid", state: "liquid", color: "#2999d9", density: 1_000, gravity: 0.8, viscosity: 6, heatCapacity: 4.18, conductivity: 0.18, acidResistance: 0.72, highTemp: { at: 100, to: ElementId.Steam }, lowTemp: { at: 0, to: ElementId.Snow } }),
  [ElementId.DistilledWater]: e({ id: 18, key: "distilled-water", symbol: "DSTW", formula: "H2O", name: "蒸馏水", description: "纯净、低导电性的水", category: "liquid", state: "liquid", color: "#57bde9", density: 998, gravity: 0.8, viscosity: 6, heatCapacity: 4.18, conductivity: 0.04, acidResistance: 0.76, highTemp: { at: 100, to: ElementId.Steam }, lowTemp: { at: 0, to: ElementId.Snow } }),
  [ElementId.SaltWater]: e({ id: 19, key: "salt-water", symbol: "SLTW", formula: "NaCl+H2O", name: "盐水", description: "密度和导电性高于纯水", category: "liquid", state: "liquid", color: "#4caed9", density: 1_120, gravity: 0.82, viscosity: 5, heatCapacity: 3.9, conductivity: 0.5, conductive: true, resistance: 0.34, acidResistance: 0.78, highTemp: { at: 108, to: ElementId.Steam }, lowTemp: { at: -12, to: ElementId.Snow } }),
  [ElementId.Oil]: e({ id: 20, key: "oil", symbol: "OIL", name: "原油", description: "漂在水面上的粘稠可燃液体", category: "liquid", state: "liquid", color: "#5b4323", density: 820, gravity: 0.76, viscosity: 2, conductivity: 0.03, acidResistance: 0.45, flammable: 0.7, ignitionTemp: 250, burnProduct: ElementId.Smoke }),
  [ElementId.Diesel]: e({ id: 21, key: "diesel", symbol: "DESL", name: "柴油", description: "受热或受压时猛烈燃烧", category: "liquid", state: "liquid", color: "#97772f", density: 850, gravity: 0.78, viscosity: 4, conductivity: 0.04, acidResistance: 0.42, flammable: 0.9, ignitionTemp: 210, burnProduct: ElementId.Fire, explosive: 0.75 }),
  [ElementId.Acid]: e({ id: 22, key: "acid", symbol: "ACID", formula: "H+", name: "酸", description: "腐蚀低耐酸物质，并与碱中和", category: "liquid", state: "liquid", color: "#74e83b", density: 1_210, gravity: 0.82, viscosity: 5, heatCapacity: 3.4, conductivity: 0.32, conductive: true, resistance: 0.42, acidResistance: 1, highTemp: { at: 125, to: ElementId.Fog } }),
  [ElementId.Base]: e({ id: 23, key: "base", symbol: "BASE", formula: "OH-", name: "碱", description: "腐蚀有机物，并与酸生成盐水", category: "liquid", state: "liquid", color: "#c7ff64", density: 1_170, gravity: 0.82, viscosity: 5, heatCapacity: 4.8, conductivity: 0.28, conductive: true, resistance: 0.46, acidResistance: 1, highTemp: { at: 132, to: ElementId.Fog } }),
  [ElementId.Lava]: e({ id: 24, key: "lava", symbol: "LAVA", name: "熔岩", description: "灼热高密度流体，遇水迅速淬火", category: "liquid", state: "liquid", color: "#ff5a20", density: 3_100, gravity: 0.72, viscosity: 1, heatCapacity: 4.4, conductivity: 0.42, defaultTemp: 1_150, acidResistance: 0.98, lowTemp: { at: 700, to: ElementId.Stone } }),
  [ElementId.LiquidNitrogen]: e({ id: 25, key: "liquid-nitrogen", symbol: "LN2", formula: "N2", name: "液氮", description: "极速冷却周围物质并沸腾成气体", category: "liquid", state: "liquid", color: "#c9f8ff", density: 808, gravity: 0.72, viscosity: 7, heatCapacity: 2, conductivity: 0.24, defaultTemp: -196, acidResistance: 0.84, highTemp: { at: -190, to: ElementId.NobleGas } }),
  [ElementId.Mercury]: e({ id: 26, key: "mercury", symbol: "MERC", formula: "Hg", name: "水银", description: "高密度、导电的液态金属", category: "liquid", state: "liquid", color: "#c5cbd2", density: 13_546, gravity: 0.9, viscosity: 3, heatCapacity: 1.4, conductivity: 0.56, conductive: true, resistance: 0.18, acidResistance: 0.74, lowTemp: { at: -39, to: ElementId.Metal } }),

  [ElementId.Steam]: e({ id: 27, key: "steam", symbol: "WTRV", formula: "H2O", name: "水蒸气", description: "向上扩散，冷却后凝结成蒸馏水", category: "gas", state: "gas", color: "#c7dfe6", density: 18, gravity: -0.3, diffusion: 0.22, heatCapacity: 2, conductivity: 0.06, defaultTemp: 118, acidResistance: 0.85, lowTemp: { at: 96, to: ElementId.DistilledWater } }),
  [ElementId.Oxygen]: e({ id: 28, key: "oxygen", symbol: "O2", formula: "O2", name: "氧气", description: "增强燃烧并与氢气反应", category: "gas", state: "gas", color: "#96c9ef", density: 32, gravity: -0.05, diffusion: 0.28, heatCapacity: 0.92, conductivity: 0.05, acidResistance: 0.96 }),
  [ElementId.Hydrogen]: e({ id: 29, key: "hydrogen", symbol: "HYGN", formula: "H2", name: "氢气", description: "极轻可燃气体，与氧气爆炸生成水蒸气", category: "gas", state: "gas", color: "#f2e4a6", density: 2, gravity: -0.5, diffusion: 0.38, heatCapacity: 14.3, conductivity: 0.18, acidResistance: 0.96, flammable: 1, ignitionTemp: 260, burnProduct: ElementId.Steam, explosive: 1.3 }),
  [ElementId.CarbonDioxide]: e({ id: 30, key: "carbon-dioxide", symbol: "CO2", formula: "CO2", name: "二氧化碳", description: "较重且不助燃，可抑制火焰", category: "gas", state: "gas", color: "#8b9ca2", density: 44, gravity: 0.08, diffusion: 0.18, heatCapacity: 0.84, conductivity: 0.04, acidResistance: 0.92 }),
  [ElementId.Smoke]: e({ id: 31, key: "smoke", symbol: "SMKE", name: "烟", description: "燃烧产物，会逐渐冷却消散", category: "gas", state: "gas", color: "#555b60", density: 20, gravity: -0.24, diffusion: 0.26, heatCapacity: 1.1, conductivity: 0.04, defaultTemp: 90, acidResistance: 0.92 }),
  [ElementId.Fog]: e({ id: 32, key: "fog", symbol: "FOG", formula: "H2O", name: "雾", description: "悬浮液滴，可吸收酸性气体", category: "gas", state: "gas", color: "#a9c2c7", density: 26, gravity: -0.08, diffusion: 0.32, heatCapacity: 2.2, conductivity: 0.08, acidResistance: 0.8, lowTemp: { at: 5, to: ElementId.Water } }),
  [ElementId.NobleGas]: e({ id: 33, key: "noble-gas", symbol: "NBLE", name: "稀有气体", description: "惰性气体，高温电离为等离子体", category: "gas", state: "gas", color: "#cf83ef", density: 8, gravity: -0.18, diffusion: 0.34, heatCapacity: 0.6, conductivity: 0.03, acidResistance: 1, highTemp: { at: 1_900, to: ElementId.Plasma } }),
  [ElementId.Boyle]: e({ id: 34, key: "boyle", symbol: "BOYL", name: "压敏气体", description: "高压下升温，展示压强与温度耦合", category: "gas", state: "gas", color: "#8f6db2", density: 11, gravity: -0.12, diffusion: 0.3, heatCapacity: 0.55, conductivity: 0.08, acidResistance: 0.9 }),

  [ElementId.Metal]: e({ id: 35, key: "metal", symbol: "METL", formula: "Fe", name: "金属", description: "通用导体，受热发光并可能熔化", category: "electricity", state: "solid", color: "#aab2b9", density: 7_870, immovable: true, conductive: true, resistance: 0.26, heatCapacity: 2.2, conductivity: 0.72, acidResistance: 0.58, highTemp: { at: 1_535, to: ElementId.Lava } }),
  [ElementId.Copper]: e({ id: 36, key: "copper", symbol: "COPR", formula: "Cu", name: "铜", description: "高导电、高导热金属", category: "electricity", state: "solid", color: "#d07b43", density: 8_960, immovable: true, conductive: true, resistance: 0.1, heatCapacity: 2.1, conductivity: 0.93, acidResistance: 0.64, highTemp: { at: 1_085, to: ElementId.Lava } }),
  [ElementId.Gold]: e({ id: 37, key: "gold", symbol: "GOLD", formula: "Au", name: "金", description: "耐腐蚀的优良导体", category: "electricity", state: "solid", color: "#efc84a", density: 19_300, immovable: true, conductive: true, resistance: 0.08, heatCapacity: 1.9, conductivity: 0.86, acidResistance: 0.995, highTemp: { at: 1_064, to: ElementId.Lava } }),
  [ElementId.Wire]: e({ id: 38, key: "wire", symbol: "WIRE", name: "导线", description: "快速传递电荷脉冲", category: "electricity", state: "solid", color: "#338bb3", density: 5_200, immovable: true, conductive: true, resistance: 0.06, heatCapacity: 2, conductivity: 0.8, acidResistance: 0.46, highTemp: { at: 900, to: ElementId.Lava } }),
  [ElementId.Battery]: e({ id: 39, key: "battery", symbol: "BTRY", name: "电池", description: "持续向相邻导体注入电荷", category: "electricity", state: "solid", color: "#56d77d", density: 6_000, immovable: true, conductive: true, resistance: 0.14, heatCapacity: 3.4, conductivity: 0.42, acidResistance: 0.66, highTemp: { at: 680, to: ElementId.Fire } }),
  [ElementId.PType]: e({ id: 40, key: "p-type", symbol: "PSCN", formula: "Si:P", name: "P型半导体", description: "与 N 型组合形成方向性电路", category: "electricity", state: "solid", color: "#e67171", density: 2_330, immovable: true, conductive: true, resistance: 0.42, conductivity: 0.24, acidResistance: 0.78, highTemp: { at: 1_410, to: ElementId.Lava } }),
  [ElementId.NType]: e({ id: 41, key: "n-type", symbol: "NSCN", formula: "Si:N", name: "N型半导体", description: "仅接收来自 P 型或普通导体的脉冲", category: "electricity", state: "solid", color: "#6b91dc", density: 2_330, immovable: true, conductive: true, resistance: 0.42, conductivity: 0.24, acidResistance: 0.78, highTemp: { at: 1_410, to: ElementId.Lava } }),
  [ElementId.Switch]: e({ id: 42, key: "switch", symbol: "SWCH", name: "开关", description: "带电时闭合，失电后断开", category: "electricity", state: "solid", color: "#7b7351", density: 4_200, immovable: true, conductive: true, resistance: 0.28, conductivity: 0.31, acidResistance: 0.62 }),
  [ElementId.Spark]: e({ id: 43, key: "spark", symbol: "SPRK", name: "电火花", description: "短寿命电荷，可点燃可燃物", category: "electricity", state: "energy", color: "#eefcff", density: 1, diffusion: 0.08, heatCapacity: 0.1, conductivity: 1, defaultTemp: 480, acidResistance: 1 }),

  [ElementId.Fire]: e({ id: 44, key: "fire", symbol: "FIRE", name: "火焰", description: "消耗燃料与氧气，释放热和烟", category: "energy", state: "energy", color: "#ffc238", density: 1, gravity: -0.5, diffusion: 0.16, heatCapacity: 0.3, conductivity: 0.32, defaultTemp: 720, acidResistance: 1 }),
  [ElementId.Plasma]: e({ id: 45, key: "plasma", symbol: "PLSM", name: "等离子体", description: "高温电离气体，强力加热周围物质", category: "energy", state: "energy", color: "#b56df2", density: 1, gravity: -0.12, diffusion: 0.3, heatCapacity: 0.12, conductivity: 0.9, defaultTemp: 3_200, acidResistance: 1, lowTemp: { at: 1_500, to: ElementId.NobleGas } }),
  [ElementId.Lightning]: e({ id: 46, key: "lightning", symbol: "LIGH", name: "闪电", description: "沿空气与导体传播的高能放电", category: "energy", state: "energy", color: "#d8f4ff", density: 1, diffusion: 0.05, heatCapacity: 0.08, conductivity: 1, defaultTemp: 4_500, acidResistance: 1 }),
  [ElementId.Neutron]: e({ id: 47, key: "neutron", symbol: "NEUT", name: "中子", description: "穿透部分材料并触发裂变", category: "energy", state: "energy", color: "#bdfce5", density: 1, diffusion: 0.02, heatCapacity: 0.1, conductivity: 0.05, acidResistance: 1 }),
  [ElementId.Photon]: e({ id: 48, key: "photon", symbol: "PHOT", name: "光子", description: "直线传播，可穿过玻璃", category: "energy", state: "energy", color: "#fff2aa", density: 1, heatCapacity: 0.05, conductivity: 0, acidResistance: 1 }),
  [ElementId.Uranium]: e({ id: 49, key: "uranium", symbol: "URAN", formula: "U", name: "铀", description: "受压升温，吸收中子后发生裂变", category: "energy", state: "powder", color: "#65c35f", density: 19_050, gravity: 1, heatCapacity: 2.1, conductivity: 0.28, acidResistance: 0.66, highTemp: { at: 1_132, to: ElementId.Lava } }),
  [ElementId.Plutonium]: e({ id: 50, key: "plutonium", symbol: "PLUT", formula: "Pu", name: "钚", description: "更活跃的裂变材料，高压下危险", category: "energy", state: "powder", color: "#8ac66c", density: 19_840, gravity: 1, heatCapacity: 1.8, conductivity: 0.23, acidResistance: 0.62, explosive: 1.4, highTemp: { at: 640, to: ElementId.Lava } }),
  [ElementId.Deuterium]: e({ id: 51, key: "deuterium", symbol: "DEUT", formula: "D2O", name: "重水", description: "受中子撞击时释放能量和更多中子", category: "energy", state: "liquid", color: "#7fa7e8", density: 1_105, gravity: 0.82, viscosity: 5, heatCapacity: 4.2, conductivity: 0.16, acidResistance: 0.84, highTemp: { at: 102, to: ElementId.Steam }, lowTemp: { at: 4, to: ElementId.Snow } }),
  [ElementId.BlackHole]: e({ id: 52, key: "black-hole", symbol: "BHOL", name: "黑洞", description: "吸引并吞噬周围物质，同时累积热量", category: "energy", state: "solid", color: "#160f1b", density: 99_999, immovable: true, heatCapacity: 12, conductivity: 0.8, acidResistance: 1 }),
  [ElementId.WhiteHole]: e({ id: 53, key: "white-hole", symbol: "WHOL", name: "白洞", description: "排斥物质与空气，制造低密度空腔", category: "energy", state: "solid", color: "#f0efff", density: 99_999, immovable: true, heatCapacity: 12, conductivity: 0.8, acidResistance: 1 }),

  [ElementId.Plant]: e({ id: 54, key: "plant", symbol: "PLNT", formula: "CH2O", name: "植物", description: "吸水和二氧化碳生长，遇火燃烧", category: "life", state: "solid", color: "#43a94f", density: 620, immovable: true, heatCapacity: 3.7, conductivity: 0.06, acidResistance: 0.28, flammable: 0.58, ignitionTemp: 220, burnProduct: ElementId.Ash }),
  [ElementId.Seed]: e({ id: 55, key: "seed", symbol: "SEED", name: "种子", description: "落在湿润支撑面上后长成植物", category: "life", state: "powder", color: "#87613a", density: 760, gravity: 0.86, heatCapacity: 3.1, conductivity: 0.05, acidResistance: 0.34, flammable: 0.42, ignitionTemp: 210, burnProduct: ElementId.Ash }),
  [ElementId.Yeast]: e({ id: 56, key: "yeast", symbol: "YEST", name: "酵母", description: "在温水中繁殖，高温失活", category: "life", state: "powder", color: "#d8c18c", density: 920, gravity: 0.72, heatCapacity: 3.4, conductivity: 0.08, acidResistance: 0.36, highTemp: { at: 58, to: ElementId.Ash } }),
  [ElementId.Bacteria]: e({ id: 57, key: "bacteria", symbol: "BACT", name: "细菌", description: "温暖湿润时扩散，酸碱和高温可灭活", category: "life", state: "powder", color: "#a5d45d", density: 860, gravity: 0.5, diffusion: 0.06, heatCapacity: 3.2, conductivity: 0.07, acidResistance: 0.08, highTemp: { at: 72, to: ElementId.Ash } }),
  [ElementId.Ash]: e({ id: 58, key: "ash", symbol: "ASH", name: "灰烬", description: "燃烧后的轻质惰性粉末", category: "powder", state: "powder", color: "#777570", density: 460, gravity: 0.58, diffusion: 0.04, conductivity: 0.05, acidResistance: 0.46 })
};

export const ELEMENT_LIST = Object.values(ELEMENTS).filter((item) => item.id !== ElementId.Empty);

export const CATEGORY_META: Record<ElementCategory, { label: string; tone: string }> = {
  build: { label: "构造", tone: "#a7afb7" },
  powder: { label: "粉末", tone: "#d8aa59" },
  liquid: { label: "液体", tone: "#48a9c5" },
  gas: { label: "气体", tone: "#87a7ad" },
  electricity: { label: "电学", tone: "#f1ca52" },
  energy: { label: "能量与核", tone: "#d16f62" },
  life: { label: "生命", tone: "#6fb26f" }
};

export const getElement = (id: number): ElementDefinition => ELEMENTS[id as ElementId] ?? ELEMENTS[ElementId.Empty];

export const isFluidState = (state: ElementState): boolean => state === "liquid" || state === "gas" || state === "energy";

