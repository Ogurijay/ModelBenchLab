// ---------------------------------------------------------------------------
// 全局常量。所有坐标分两套体系：
//   · "地图格" (map-cell)  0..12，共 13x13，关卡数据用这个单位描述更直观
//   · "子格"   (subcell)   0..25，共 26x26，1 子格 = 1 个 three.js 世界单位，
//                            是碰撞与地形销毁的最小单位（1 地图格 = 2x2 子格）
// 逻辑坐标系原点在场地左上角 (0,0)，渲染时统一减去 FIELD_HALF 使场地居中于原点。
// ---------------------------------------------------------------------------

export const MAP_SIZE = 13;
export const SUB = MAP_SIZE * 2; // 26
export const BLOCK = 1; // 1 子格 = 1 世界单位
export const FIELD_WORLD = SUB * BLOCK; // 26
export const FIELD_HALF = FIELD_WORLD / 2; // 13，渲染坐标偏移量

export const TERRAIN = Object.freeze({
  EMPTY: 0,
  BRICK: 1,
  STEEL: 2,
  WATER: 3,
  TREE: 4,
  ICE: 5,
});

// 该地形是否阻挡坦克移动
export function terrainBlocksTank(t) {
  return t === TERRAIN.BRICK || t === TERRAIN.STEEL || t === TERRAIN.WATER;
}

// 固定出生点（地图格坐标），所有关卡通用
export const BASE_CELL = { x: 6, y: 12 };
export const PLAYER_SPAWN_CELL = { x: 2, y: 12 };
export const ENEMY_SPAWN_CELLS = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 12, y: 0 },
];

export const DIRS = {
  up: { x: 0, z: -1 },
  down: { x: 0, z: 1 },
  left: { x: -1, z: 0 },
  right: { x: 1, z: 0 },
};
export const DIR_LIST = ['up', 'down', 'left', 'right'];
export const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// ---------------------------------------------------------------------------
// 坦克
// ---------------------------------------------------------------------------

export const TANK_HALF = 0.92; // 略小于 1，留出视觉间隙，避免贴脸卡死
export const PLAYER_SPEED = 5.4;
export const PLAYER_FIRE_COOLDOWN = 0.38; // 1 级火力下的开火间隔
export const PLAYER_MAX_LIVES_DISPLAY = 9;
export const PLAYER_RESPAWN_DELAY = 1.3;
export const PLAYER_SPAWN_INVULN = 2.2;
export const PLAYER_BULLET_SPEED = [13, 17, 17, 20]; // 按火力等级 1..4 索引 0..3
export const PLAYER_MAX_BULLETS = [1, 1, 2, 2]; // 同屏最大子弹数，按火力等级

export const ENEMY_TYPES = {
  basic: { hp: 1, speed: 3.6, fireMin: 1.4, fireMax: 2.6, bulletSpeed: 11, score: 100, color: 0xb9c2d6, scale: 1 },
  fast: { hp: 1, speed: 6.4, fireMin: 1.3, fireMax: 2.4, bulletSpeed: 12, score: 200, color: 0x6fe0e8, scale: 1 },
  power: { hp: 1, speed: 3.8, fireMin: 0.7, fireMax: 1.4, bulletSpeed: 14, score: 300, color: 0xff8a4a, scale: 1 },
  armor: { hp: 4, speed: 2.9, fireMin: 1.5, fireMax: 2.8, bulletSpeed: 11, score: 400, color: 0xd8d8d8, scale: 1.05 },
  boss: { hp: 10, speed: 2.6, fireMin: 0.9, fireMax: 1.6, bulletSpeed: 13, score: 1000, color: 0x8a3fd6, scale: 1.35 },
};

export const ENEMY_MAX_ALIVE = 4; // 同屏最多存活敌军数（经典为 4）
export const ENEMY_SPAWN_INTERVAL = 1.35; // 生成间隔基准
export const ENEMY_SPAWN_PROTECT = 1.0; // 出生后无敌/无法行动的闪烁时间
export const ENEMY_BULLET_HALF = 0.16;
export const PLAYER_BULLET_HALF = 0.16;
export const BULLET_MAX_LIFETIME = 3.2;
export const BULLET_SPAWN_OFFSET = 1.15;

// ---------------------------------------------------------------------------
// 道具
// ---------------------------------------------------------------------------

export const POWERUP_TYPES = ['grenade', 'helmet', 'shovel', 'clock', 'tank', 'star', 'gun'];
export const POWERUP_LIFETIME = 11; // 场上停留时间
export const POWERUP_BLINK_AT = 3; // 剩余多少秒开始闪烁提示
export const HELMET_DURATION = 10;
export const CLOCK_FREEZE_DURATION = 8;
export const SHOVEL_DURATION = 16;

// ---------------------------------------------------------------------------
// 摄像机
// ---------------------------------------------------------------------------

export const CAMERA_ELEVATION_DEG = 55;
export const CAMERA_MARGIN = 1.12;

// ---------------------------------------------------------------------------
// 基地要塞基线布局（地图格坐标，相对场地固定），围绕 BASE_CELL 的砖墙
// ---------------------------------------------------------------------------

export const FORT_BASELINE = [
  { type: TERRAIN.BRICK, x: 5, y: 11, w: 3, h: 1 }, // 基地正上方一排
  { type: TERRAIN.BRICK, x: 5, y: 12, w: 1, h: 1 }, // 左翼
  { type: TERRAIN.BRICK, x: 7, y: 12, w: 1, h: 1 }, // 右翼
];
