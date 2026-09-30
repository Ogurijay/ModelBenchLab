export const GRID_WIDTH = 26;
export const GRID_HEIGHT = 26;

export type Direction = "up" | "right" | "down" | "left";
export type TileKind = "empty" | "brick" | "steel" | "water" | "forest" | "ice" | "base";
export type TankSide = "player" | "enemy";
export type EnemyType = "basic" | "fast" | "armor" | "power";
export type GamePhase = "ready" | "playing" | "paused" | "won" | "lost" | "complete";

export interface Vector2 {
  x: number;
  y: number;
}

export interface Tank {
  id: string;
  side: TankSide;
  type: "player" | EnemyType;
  x: number;
  y: number;
  dir: Direction;
  hp: number;
  maxHp: number;
  speed: number;
  fireCooldown: number;
  reloadTime: number;
  bulletSpeed: number;
  invulnerable: number;
  aiTimer: number;
  moving: boolean;
}

export interface Bullet {
  id: string;
  ownerId: string;
  ownerSide: TankSide;
  x: number;
  y: number;
  dir: Direction;
  speed: number;
  power: number;
}

export interface LevelDefinition {
  id: number;
  name: string;
  layout: string[];
  enemyQueue: EnemyType[];
  maxActiveEnemies: number;
}

export interface GameCommand {
  move: Direction | null;
  fire: boolean;
  confirm: boolean;
  restart: boolean;
  togglePause: boolean;
}

export interface GameEvent {
  type: "explosion" | "spawn" | "brick" | "base-hit";
  x: number;
  y: number;
  color?: string;
}

export interface GameSnapshot {
  phase: GamePhase;
  levelIndex: number;
  levelNumber: number;
  levelName: string;
  totalLevels: number;
  score: number;
  lives: number;
  baseAlive: boolean;
  enemiesTotal: number;
  enemiesSpawned: number;
  enemiesDefeated: number;
  mapVersion: number;
  tiles: TileKind[][];
  tanks: Tank[];
  bullets: Bullet[];
}

export const DIR_VECTORS: Record<Direction, Vector2> = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export const DIRECTIONS: Direction[] = ["up", "right", "down", "left"];
