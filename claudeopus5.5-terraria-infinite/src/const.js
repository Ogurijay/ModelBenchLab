// 全局常量。坐标系:x 向右无限延伸,y 向下为正;海平面 y = 0,地表大致在 -60..+35 之间。
export const TS = 16;            // 每格像素(内部分辨率)
export const CS = 32;            // 区块边长(格)
export const CSH = 5;            // log2(CS)
export const CM = CS - 1;
export const CA = CS * CS;       // 区块格数

export const STEP = 1 / 60;      // 物理固定步长
export const TPS = 20;           // 世界刻 / 秒(与《我的世界》一致)
export const DAY_TICKS = 24000;  // 一整天的世界刻数 (00:00 → 24:00)

export const SEA = 0;
export const SKY_LIMIT = 150;     // 低于此深度不再接收天光
export const DEEP_Y = 260;        // 深板岩层
export const HELL_Y = 600;        // 地狱层
export const BEDROCK_Y = 700;     // 基岩层
export const ISLAND_Y = -150;     // 浮空岛中心高度

export const REACH = 5.6;         // 交互距离(格)
export const SEASONS = ['春', '夏', '秋', '冬'];
export const SEASON_NAMES = ['春季', '夏季', '秋季', '冬季'];
export const MOON_NAMES = ['满月', '亏凸月', '下弦月', '残月', '新月', '蛾眉月', '上弦月', '盈凸月'];

export const ckey = (cx, cy) => (cx + 0x8000) * 0x10000 + (cy + 0x8000);
export const ckeyX = k => Math.floor(k / 0x10000) - 0x8000;
export const ckeyY = k => (k % 0x10000) - 0x8000;
export const tkey = (x, y) => (x + 0x4000000) * 0x8000 + (y + 0x4000);
