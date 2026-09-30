// 元素定义表 — 名称全中文并附化学式/符号
// 每个元素：物态、密度、导热率、电导、流动性、相变点、燃点、爆炸参数、颜色、说明
import {
  ST_EMPTY, ST_SOLID, ST_POWDER, ST_LIQUID, ST_GAS, ST_ENERGY,
  F_IMMUNE, F_ACIDPROOF, F_ORGANIC, F_BIO,
} from './const.js';

// 燃烧方式
export const IG_NONE = 0;    // 不可燃
export const IG_FLASH = 1;   // 闪燃：直接变成火
export const IG_SMOLDER = 2; // 阴燃：保持形态持续喷火，烧完变产物
export const IG_EXPLODE = 3; // 引爆
export const IG_GASBOOM = 4; // 气体爆燃（小爆+链式）

const HOT_NONE = 1e9, COLD_NONE = -1e9;

// —— 定义顺序即元素 id，勿随意调换 ——
// d=密度(kg/m³，空气≈1.2) th=导热(0..1) el=电导(0无/1良/2弱) dp=液体流动距离
// hot/cold: [温度, 目标元素key] ig: [燃点, 方式] ex: [半径, 威力] shock: 气压引爆阈值
const defs = [
  { key:'EMPTY',    name:'空',     sym:'—',            cat:'特殊', color:'#0b0d12', st:ST_EMPTY,  d:1.2,   th:0.06,
    desc:'橡皮擦：清除粒子。' },
  { key:'WALL',     name:'墙',     sym:'∞',            cat:'特殊', color:'#5d626c', st:ST_SOLID,  d:9999,  th:0.04, fl:F_IMMUNE|F_ACIDPROOF,
    desc:'不可摧毁的绝热墙体，用来搭建容器和结构。' },
  { key:'CLONE',    name:'克隆体', sym:'⧉',            cat:'特殊', color:'#a866c9', st:ST_SOLID,  d:9999,  th:0.1,  fl:F_IMMUNE|F_ACIDPROOF,
    desc:'记住第一个接触到的元素，然后不断复制生成它。' },
  { key:'VOID',     name:'虚空',   sym:'∅',            cat:'特殊', color:'#241030', st:ST_SOLID,  d:9999,  th:0.1,  fl:F_IMMUNE|F_ACIDPROOF,
    desc:'吞噬一切接触到的粒子。' },
  { key:'FAN',      name:'风扇',   sym:'↻',            cat:'特殊', color:'#4fa8bf', st:ST_SOLID,  d:9999,  th:0.2,  fl:F_IMMUNE|F_ACIDPROOF,
    desc:'持续向指定方向吹风（放置前按 R 或点按钮切换风向）。' },
  { key:'BATTERY',  name:'电源',   sym:'⚡±',           cat:'特殊', color:'#d9a921', st:ST_SOLID,  d:9999,  th:0.3,  fl:F_IMMUNE|F_ACIDPROOF,
    desc:'周期性向相邻导体放出电火花。导体：金属/金/汞/石墨/熔融金属，盐水弱导电。' },

  { key:'FIRE',     name:'火',     sym:'等离子',        cat:'能量', color:'#ff9a30', st:ST_ENERGY, d:0.3,   th:0.55,
    desc:'点燃可燃物；遇水熄灭成蒸汽；氧气助燃、CO₂/N₂ 窒息。温度约 400~900°C。' },
  { key:'SPARK',    name:'电火花', sym:'e⁻',           cat:'能量', color:'#bff3ff', st:ST_ENERGY, d:0.1,   th:0.8,
    desc:'沿导体传导；电阻发热；电解水产生 H₂+O₂；可引爆炸药、点燃可燃气。' },

  // ———— 粉末 ————
  { key:'SAND',     name:'沙',     sym:'SiO₂',         cat:'粉末', color:'#d9c07a', st:ST_POWDER, d:1600, th:0.25, hot:[1700,'MOLTEN_GLASS'],
    desc:'普通沙粒，会堆积滑落；1700°C 熔化成玻璃。' },
  { key:'SALT',     name:'盐',     sym:'NaCl',         cat:'粉末', color:'#f0f0f4', st:ST_POWDER, d:2100, th:0.2,
    desc:'溶于水成盐水；能融化冰雪（降低冰点）。' },
  { key:'GUNPOWDER',name:'火药',   sym:'KNO₃·S·C',     cat:'粉末', color:'#43434c', st:ST_POWDER, d:1700, th:0.2, ig:[280,IG_EXPLODE], ex:[5,3.5], shock:6,
    desc:'黑火药：280°C 或电火花/冲击波引爆。' },
  { key:'SNOW',     name:'雪',     sym:'H₂O(s)',       cat:'粉末', color:'#eef6ff', st:ST_POWDER, d:150,  th:0.15, hot:[2,'WATER'], drawT:-6,
    desc:'轻盈的雪花，0°C 以上融化；撒盐也会融化。' },
  { key:'ASH',      name:'灰',     sym:'K₂CO₃',        cat:'粉末', color:'#9a958d', st:ST_POWDER, d:500,  th:0.15,
    desc:'燃烧残留的灰烬，化学性质稳定。' },
  { key:'COAL',     name:'煤',     sym:'C',            cat:'粉末', color:'#2c2c30', st:ST_POWDER, d:700,  th:0.2, fl:F_ORGANIC, ig:[400,IG_SMOLDER], bl:420, bp:'ASH',
    desc:'烧得慢而持久，燃尽成灰并放出 CO₂。' },
  { key:'SULFUR',   name:'硫',     sym:'S₈',           cat:'粉末', color:'#e8e05a', st:ST_POWDER, d:2000, th:0.2, ig:[232,IG_FLASH],
    desc:'232°C 即燃，蓝紫色火焰（本作简化），冒出刺鼻浓烟。' },
  { key:'SODIUM',   name:'钠',     sym:'Na',           cat:'粉末', color:'#cfc9ba', st:ST_POWDER, d:970,  th:0.6, ig:[330,IG_FLASH],
    desc:'碱金属：遇水剧烈爆炸，生成氢气和碱液！密度比水小，会浮在水面上炸。' },
  { key:'THERMITE', name:'铝热剂', sym:'Al·Fe₂O₃',     cat:'粉末', color:'#8a5a3a', st:ST_POWDER, d:2900, th:0.3, ig:[1300,IG_SMOLDER], bl:44, bp:'MOLTEN_METAL',
    desc:'需 1300°C 以上（镁/电火花/岩浆）点燃，燃烧温度 3200°C，产物是熔融金属，水浇不灭。' },
  { key:'MAGNESIUM',name:'镁',     sym:'Mg',           cat:'粉末', color:'#cfd6dd', st:ST_POWDER, d:1700, th:0.6, ig:[470,IG_SMOLDER], bl:70, bp:'ASH',
    desc:'燃烧发出 3000°C 白光，可用来点燃铝热剂；水难以扑灭。' },
  { key:'PHOSPHORUS',name:'白磷',  sym:'P₄',           cat:'粉末', color:'#f5efc6', st:ST_POWDER, d:1800, th:0.3, fl:F_ORGANIC, ig:[34,IG_FLASH],
    desc:'燃点仅 34°C，暴露在空气中会缓慢升温自燃。' },
  { key:'URANIUM',  name:'铀',     sym:'U',            cat:'粉末', color:'#4fae57', st:ST_POWDER, d:19000, th:0.6, hot:[1132,'MOLTEN_METAL'],
    desc:'放射性发热，持续加热周围（衰变热）；极缓慢衰变成铅。' },
  { key:'LEAD',     name:'铅',     sym:'Pb',           cat:'粉末', color:'#5d6570', st:ST_POWDER, d:11300, th:0.7, fl:F_ACIDPROOF, hot:[327,'MOLTEN_METAL'],
    desc:'致密的重金属粉，抗硫酸腐蚀（钝化），327°C 就熔化。' },
  { key:'DRYICE',   name:'干冰',   sym:'CO₂(s)',       cat:'粉末', color:'#dff4ff', st:ST_POWDER, d:1500, th:0.4, hot:[-76,'CO2'], drawT:-90,
    desc:'-78°C 升华成 CO₂ 气体，持续冻结周围。' },
  { key:'QUICKLIME',name:'生石灰', sym:'CaO',          cat:'粉末', color:'#e8e3d5', st:ST_POWDER, d:1200, th:0.3,
    desc:'遇水剧烈放热（生成熟石灰），能把水直接烧开。' },
  { key:'RUST',     name:'铁锈',   sym:'Fe₂O₃',        cat:'粉末', color:'#a05230', st:ST_POWDER, d:2900, th:0.3,
    desc:'铁氧化的产物；与铝粉混合就是铝热剂的原料。' },
  { key:'SEED',     name:'种子',   sym:'有机质',        cat:'粉末', color:'#7a5b2e', st:ST_POWDER, d:700,  th:0.15, fl:F_ORGANIC|F_BIO, ig:[260,IG_FLASH],
    desc:'碰到水就发芽，长成藤蔓植物。' },
  { key:'FUNGUS',   name:'菌丝',   sym:'真菌',          cat:'粉末', color:'#b9a7d8', st:ST_POWDER, d:300,  th:0.15, fl:F_ORGANIC|F_BIO, ig:[200,IG_SMOLDER], bl:20, bp:'ASH',
    desc:'缓慢侵蚀木头/植物等有机物；高温、氯气、酸都能杀灭它。' },
  { key:'VIRUS',    name:'病毒',   sym:'☣',            cat:'粉末', color:'#d84fd8', st:ST_POWDER, d:400,  th:0.15, fl:F_BIO, ig:[200,IG_FLASH],
    desc:'同化接触到的几乎一切物质，但毒性逐代衰减，最终自行消亡。玻璃/钻石/金免疫。' },

  // ———— 液体 ————
  { key:'WATER',    name:'水',     sym:'H₂O',          cat:'液体', color:'#3b6fd4', st:ST_LIQUID, d:1000, th:0.5, dp:5, hot:[100,'STEAM'], cold:[-2,'ICE'],
    desc:'溶解盐、扑灭火焰、淬冷岩浆；0°C 结冰、100°C 汽化。纯水不导电。' },
  { key:'SALTWATER',name:'盐水',   sym:'NaCl(aq)',     cat:'液体', color:'#4f86c9', st:ST_LIQUID, d:1030, th:0.5, dp:5, el:2, hot:[100,'STEAM'], cold:[-21,'ICE'],
    desc:'冰点降到 -21°C；弱导电（可用于电解）；蒸发后析出盐；让铁锈得更快。' },
  { key:'OIL',      name:'油',     sym:'C₈H₁₈',        cat:'液体', color:'#7a5a20', st:ST_LIQUID, d:800,  th:0.25, dp:3, fl:F_ORGANIC, ig:[260,IG_FLASH],
    desc:'浮在水面上的可燃液体，火势凶猛并冒黑烟。' },
  { key:'ACID',     name:'硫酸',   sym:'H₂SO₄',        cat:'液体', color:'#b7e34a', st:ST_LIQUID, d:1800, th:0.35, dp:4,
    desc:'强腐蚀：溶解金属放出氢气、溶解有机物、与碱中和放热、与石灰石反应冒 CO₂。玻璃/金/铅/蜡免疫。' },
  { key:'HCL',      name:'盐酸',   sym:'HCl(aq)',      cat:'液体', color:'#d9e97a', st:ST_LIQUID, d:1100, th:0.35, dp:4,
    desc:'较温和的酸；氯气与氢气反应的产物。溶解金属生成盐水和氢气。' },
  { key:'LYE',      name:'碱液',   sym:'NaOH(aq)',     cat:'液体', color:'#63bfb5', st:ST_LIQUID, d:1400, th:0.35, dp:4,
    desc:'强碱：缓慢溶解有机物；与酸中和放热生成盐水；钠遇水的产物之一。' },
  { key:'LAVA',     name:'岩浆',   sym:'硅酸盐(l)',     cat:'液体', color:'#ff6a1a', st:ST_LIQUID, d:2600, th:0.7, dp:1, cold:[700,'STONE'], drawT:1150,
    desc:'约 1150°C 的熔岩，点燃并熔化路过的一切；遇水表面迅速凝固成岩石。' },
  { key:'MERCURY',  name:'汞',     sym:'Hg',           cat:'液体', color:'#c0c8d0', st:ST_LIQUID, d:13500, th:0.8, dp:3, el:1, hot:[357,'HGVAP'],
    desc:'常温液态金属，密度极大（几乎一切都浮在它上面）；导电；357°C 汽化成有毒汞蒸气。' },
  { key:'NITRO',    name:'硝化甘油',sym:'C₃H₅N₃O₉',    cat:'液体', color:'#e0d6a8', st:ST_LIQUID, d:1600, th:0.3, dp:2, ig:[50,IG_EXPLODE], ex:[9,6], shock:2.5,
    desc:'极不稳定的液体炸药：轻微震动、坠落冲击、50°C 或冲击波都会引爆。' },
  { key:'LN2',      name:'液氮',   sym:'N₂(l)',        cat:'液体', color:'#9fd8ff', st:ST_LIQUID, d:800,  th:0.9, dp:6, hot:[-194,'N2'], drawT:-205,
    desc:'-196°C 的超低温液体，急冻周围一切，然后很快沸腾成氮气。' },
  { key:'MOLTEN_METAL',name:'熔融金属',sym:'Fe(l)',    cat:'液体', color:'#ffb050', st:ST_LIQUID, d:7000, th:0.9, dp:1, el:1, cold:[1100,'METAL'], drawT:1800,
    desc:'1800°C 的铁水（铝热反应产物），冷却后凝固成金属。' },
  { key:'MOLTEN_GLASS',name:'熔融玻璃',sym:'SiO₂(l)',  cat:'液体', color:'#ffc890', st:ST_LIQUID, d:2400, th:0.5, dp:1, cold:[1000,'GLASS'], drawT:1600,
    desc:'沙子烧熔的产物，冷却后凝固成玻璃。' },
  { key:'WAX_MELT', name:'蜡油',   sym:'CₙH₂ₙ₊₂(l)',   cat:'液体', color:'#e8dcb0', st:ST_LIQUID, d:780,  th:0.25, dp:2, fl:F_ORGANIC, ig:[230,IG_FLASH], cold:[45,'WAX'],
    desc:'融化的蜡，可燃；冷却后重新凝固。' },

  // ———— 气体 ————
  { key:'STEAM',    name:'蒸汽',   sym:'H₂O(g)',       cat:'气体', color:'#c9d4e0', st:ST_GAS,    d:0.6,  th:0.4, cold:[96,'WATER'], drawT:115,
    desc:'上升的水蒸气，降温后凝结成水滴。' },
  { key:'SMOKE',    name:'烟',     sym:'C(微粒)',      cat:'气体', color:'#55575e', st:ST_GAS,    d:0.4,  th:0.2, drawT:80,
    desc:'燃烧产生的烟尘，慢慢消散。' },
  { key:'H2',       name:'氢气',   sym:'H₂',           cat:'气体', color:'#d8e8f0', st:ST_GAS,    d:0.09, th:0.6, ig:[500,IG_GASBOOM],
    desc:'最轻的气体，快速上升；遇明火爆燃，燃烧产物是水蒸气（2H₂+O₂→2H₂O）。' },
  { key:'O2',       name:'氧气',   sym:'O₂',           cat:'气体', color:'#bfdfff', st:ST_GAS,    d:1.4,  th:0.4,
    desc:'助燃气体：让火烧得更旺更久，甚至能点燃钻石。' },
  { key:'METHANE',  name:'甲烷',   sym:'CH₄',          cat:'气体', color:'#cfe8c9', st:ST_GAS,    d:0.7,  th:0.4, ig:[540,IG_GASBOOM],
    desc:'可燃气体（沼气/天然气），爆燃生成 CO₂ 和水蒸气。' },
  { key:'CO2',      name:'二氧化碳',sym:'CO₂',         cat:'气体', color:'#c4c4c9', st:ST_GAS,    d:1.9,  th:0.3, cold:[-80,'DRYICE'],
    desc:'比空气重、下沉聚集；窒息灭火；-78°C 凝华成干冰；植物吸收它放出氧气。' },
  { key:'CL2',      name:'氯气',   sym:'Cl₂',          cat:'气体', color:'#b8d24a', st:ST_GAS,    d:3.2,  th:0.3,
    desc:'黄绿色剧毒气体，比空气重；杀灭植物/菌/病毒；遇氢气（受热）化合成盐酸。' },
  { key:'N2',       name:'氮气',   sym:'N₂',           cat:'气体', color:'#d0d0e0', st:ST_GAS,    d:1.15, th:0.3, cold:[-200,'LN2'],
    desc:'惰性气体，会稀释氧气使火变弱；-196°C 液化。' },
  { key:'HGVAP',    name:'汞蒸气', sym:'Hg(g)',        cat:'气体', color:'#d0b8d8', st:ST_GAS,    d:7,    th:0.4, cold:[300,'MERCURY'],
    desc:'剧毒金属蒸气，接触生物会使其死亡；冷却后凝回液汞。' },

  // ———— 固体 ————
  { key:'METAL',    name:'金属',   sym:'Fe',           cat:'固体', color:'#8f98a3', st:ST_SOLID,  d:7800, th:0.95, el:1, hot:[1538,'MOLTEN_METAL'],
    desc:'良导体导电导热；接触水慢慢生锈（盐水更快）；被酸溶解并放出氢气；1538°C 熔化。' },
  { key:'GOLD',     name:'金',     sym:'Au',           cat:'固体', color:'#f2c14e', st:ST_SOLID,  d:19300, th:0.95, el:1, fl:F_ACIDPROOF, hot:[1064,'MOLTEN_METAL'],
    desc:'贵金属：永不生锈、抗酸碱；导电；1064°C 熔化（简化为通用金属液）。' },
  { key:'WOOD',     name:'木',     sym:'C₆H₁₀O₅',      cat:'固体', color:'#7a542e', st:ST_SOLID,  d:700,  th:0.15, fl:F_ORGANIC, ig:[300,IG_SMOLDER], bl:300, bp:'COAL',
    desc:'纤维素结构材料；燃烧后碳化成煤；会被酸碱溶解、被菌丝侵蚀。' },
  { key:'PLANT',    name:'植物',   sym:'C₆H₁₀O₅',      cat:'固体', color:'#3f9e3f', st:ST_SOLID,  d:600,  th:0.15, fl:F_ORGANIC|F_BIO, ig:[250,IG_SMOLDER], bl:14, bp:'ASH',
    desc:'吸水生长的藤蔓；光合作用把 CO₂ 变成 O₂；怕火、酸、氯气。' },
  { key:'ICE',      name:'冰',     sym:'H₂O(s)',       cat:'固体', color:'#a8d8f0', st:ST_SOLID,  d:917,  th:0.6, hot:[2,'WATER'], drawT:-12,
    desc:'0°C 以上融化；撒盐可在低温下融化（凝固点降低）。' },
  { key:'GLASS',    name:'玻璃',   sym:'SiO₂(非晶)',   cat:'固体', color:'#b8d0d8', st:ST_SOLID,  d:2500, th:0.3, fl:F_ACIDPROOF, hot:[1500,'MOLTEN_GLASS'],
    desc:'透明容器材料，抗酸碱；爆炸冲击会把它震碎成沙；1500°C 重新熔化。' },
  { key:'STONE',    name:'岩石',   sym:'硅酸盐',        cat:'固体', color:'#6f6a62', st:ST_SOLID,  d:2700, th:0.3, hot:[950,'LAVA'],
    desc:'坚固的岩石，950°C 熔成岩浆；只有大威力爆炸能炸碎它。' },
  { key:'LIMESTONE',name:'石灰石', sym:'CaCO₃',        cat:'固体', color:'#cfc9b4', st:ST_SOLID,  d:2600, th:0.3,
    desc:'825°C 煅烧分解成生石灰并放出 CO₂；遇酸剧烈冒 CO₂ 气泡。' },
  { key:'WAX',      name:'蜡',     sym:'CₙH₂ₙ₊₂',      cat:'固体', color:'#efe6c8', st:ST_SOLID,  d:900,  th:0.2, fl:F_ORGANIC|F_ACIDPROOF, ig:[300,IG_FLASH], hot:[62,'WAX_MELT'],
    desc:'62°C 融化成可燃的蜡油，冷却又凝固——做一根蜡烛吧。' },
  { key:'DIAMOND',  name:'钻石',   sym:'C(金刚石)',    cat:'固体', color:'#cfeef5', st:ST_SOLID,  d:3500, th:0.99, fl:F_IMMUNE|F_ACIDPROOF,
    desc:'最坚硬：抗爆、抗酸、导热极佳；唯一弱点——在纯氧中加热到 800°C 会烧成 CO₂。' },
  { key:'GRAPHITE', name:'石墨',   sym:'C(石墨)',      cat:'固体', color:'#4a4d55', st:ST_SOLID,  d:2200, th:0.85, el:1, fl:F_ORGANIC, ig:[700,IG_SMOLDER], bl:380, bp:'EMPTY',
    desc:'碳的另一种形态：能导电（可做电极）；700°C 起缓慢烧尽为 CO₂。' },
  { key:'C4',       name:'C4 炸药',sym:'C₃H₆N₆O₆',     cat:'固体', color:'#e8e0c0', st:ST_SOLID,  d:1600, th:0.25, ig:[450,IG_EXPLODE], ex:[11,7.5], shock:9,
    desc:'塑胶炸药（RDX）：非常稳定，明火难引爆，需要电火花雷管或强冲击波。威力巨大。' },
  { key:'TNT',      name:'TNT',    sym:'C₇H₅N₃O₆',     cat:'固体', color:'#c9503a', st:ST_SOLID,  d:1650, th:0.25, ig:[300,IG_EXPLODE], ex:[9,6.5], shock:6,
    desc:'经典炸药：300°C、电火花或冲击波引爆，可用于连锁爆破。' },
];

// —— 构建按 id 索引的属性数组（热路径全部走类型化数组）——
export const COUNT = defs.length;
export const E = {};
defs.forEach((d, i) => { E[d.key] = i; });

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

export const NAME = defs.map(d => d.name);
export const SYM = defs.map(d => d.sym);
export const CAT = defs.map(d => d.cat);
export const DESC = defs.map(d => d.desc);
export const STATE = new Uint8Array(COUNT);
export const DENS = new Float32Array(COUNT);
export const THERM = new Float32Array(COUNT);
export const COND = new Uint8Array(COUNT);      // 电导 0/1/2
export const DISP = new Uint8Array(COUNT);      // 液体横向流动距离
export const FLAG = new Uint8Array(COUNT);
export const IGN_T = new Float32Array(COUNT).fill(HOT_NONE);
export const IGN_MODE = new Uint8Array(COUNT);
export const HOT_T = new Float32Array(COUNT).fill(HOT_NONE);
export const HOT_TO = new Uint8Array(COUNT);
export const COLD_T = new Float32Array(COUNT).fill(COLD_NONE);
export const COLD_TO = new Uint8Array(COUNT);
export const BURN_LIFE = new Uint16Array(COUNT);
export const BURN_PROD = new Uint8Array(COUNT);
export const EXPL_R = new Uint8Array(COUNT);
export const EXPL_P = new Float32Array(COUNT);
export const SHOCK_T = new Float32Array(COUNT).fill(1e9); // 气压引爆阈值
export const DRAW_TEMP = new Float32Array(COUNT).fill(25);
export const BASE_RGB = new Uint8Array(COUNT * 3);

defs.forEach((d, i) => {
  STATE[i] = d.st;
  DENS[i] = d.d;
  THERM[i] = d.th ?? 0.2;
  COND[i] = d.el ?? 0;
  DISP[i] = d.dp ?? 0;
  FLAG[i] = d.fl ?? 0;
  if (d.ig) { IGN_T[i] = d.ig[0]; IGN_MODE[i] = d.ig[1]; }
  if (d.bl) BURN_LIFE[i] = d.bl;
  if (d.ex) { EXPL_R[i] = d.ex[0]; EXPL_P[i] = d.ex[1]; }
  if (d.shock) SHOCK_T[i] = d.shock;
  if (d.drawT !== undefined) DRAW_TEMP[i] = d.drawT;
  const [r, g, b] = hex(d.color);
  BASE_RGB[i * 3] = r; BASE_RGB[i * 3 + 1] = g; BASE_RGB[i * 3 + 2] = b;
});
// 二次遍历解析目标元素 key（允许前向引用）
defs.forEach((d, i) => {
  if (d.hot) { HOT_T[i] = d.hot[0]; HOT_TO[i] = E[d.hot[1]]; }
  if (d.cold) { COLD_T[i] = d.cold[0]; COLD_TO[i] = E[d.cold[1]]; }
  if (d.bp !== undefined) BURN_PROD[i] = E[d.bp];
});

// UI 分类顺序
export const CATS = ['粉末', '液体', '气体', '固体', '能量', '特殊'];
