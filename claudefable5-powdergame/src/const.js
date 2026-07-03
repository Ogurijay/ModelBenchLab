// 全局网格常量
export const W = 360;          // 细胞网格宽（像素粒子数）
export const H = 240;          // 细胞网格高
export const SCALE = 3;        // CSS 放大倍数（canvas 内部仍是 W×H）
export const AMBIENT = 25;     // 环境温度 °C

// 风/气压粗网格：每 4×4 个细胞一格
export const ACELL = 4;
export const AW = W / ACELL;   // 90
export const AH = H / ACELL;   // 60

// 物态编码
export const ST_EMPTY = 0;
export const ST_SOLID = 1;
export const ST_POWDER = 2;
export const ST_LIQUID = 3;
export const ST_GAS = 4;
export const ST_ENERGY = 5;

// 元素标志位
export const F_IMMUNE = 1;     // 爆炸/病毒等无法破坏
export const F_ACIDPROOF = 2;  // 抗酸碱腐蚀
export const F_ORGANIC = 4;    // 有机物（可被酸碱溶解、菌丝侵蚀）
export const F_BIO = 8;        // 生命体（怕氯气/汞蒸气等毒物）
