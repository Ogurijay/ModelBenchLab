import { LEVELS } from "../content/levels";
import {
  DIRECTIONS,
  DIR_VECTORS,
  GRID_HEIGHT,
  GRID_WIDTH,
  type Bullet,
  type Direction,
  type EnemyType,
  type GameCommand,
  type GameEvent,
  type GamePhase,
  type GameSnapshot,
  type LevelDefinition,
  type Tank,
  type TileKind,
  type Vector2,
} from "./types";

const PLAYER_ID = "player";
const STARTING_LIVES = 3;
const TANK_RADIUS = 0.36;
const TANK_HIT_RADIUS = 0.43;
const BULLET_HIT_RADIUS = 0.16;
const PLAYER_SPAWN: Vector2 = { x: 9.5, y: 24.5 };
const PLAYER_ALT_SPAWN: Vector2 = { x: 16.5, y: 24.5 };
const BASE_POSITION: Vector2 = { x: 12.5, y: 25.5 };
const ENEMY_SPAWNS: Vector2[] = [
  { x: 1.5, y: 1.5 },
  { x: 12.5, y: 1.5 },
  { x: 24.5, y: 1.5 },
];

const EMPTY_COMMAND: GameCommand = {
  move: null,
  fire: false,
  confirm: false,
  restart: false,
  togglePause: false,
};

const enemyStats: Record<EnemyType, Pick<Tank, "hp" | "maxHp" | "speed" | "reloadTime" | "bulletSpeed">> = {
  basic: { hp: 1, maxHp: 1, speed: 1.28, reloadTime: 1.65, bulletSpeed: 6.2 },
  fast: { hp: 1, maxHp: 1, speed: 1.7, reloadTime: 1.45, bulletSpeed: 6.8 },
  armor: { hp: 2, maxHp: 2, speed: 1.14, reloadTime: 1.8, bulletSpeed: 6.0 },
  power: { hp: 1, maxHp: 1, speed: 1.24, reloadTime: 1.05, bulletSpeed: 7.3 },
};

export function tileFromChar(char: string): TileKind {
  switch (char) {
    case "B":
      return "brick";
    case "S":
      return "steel";
    case "W":
      return "water";
    case "F":
      return "forest";
    case "I":
      return "ice";
    case "E":
      return "base";
    default:
      return "empty";
  }
}

export class GameSimulation {
  private readonly levels: LevelDefinition[];
  private levelIndex = 0;
  private phase: GamePhase = "ready";
  private tiles: TileKind[][] = [];
  private tanks = new Map<string, Tank>();
  private bullets = new Map<string, Bullet>();
  private events: GameEvent[] = [];
  private score = 0;
  private lives = STARTING_LIVES;
  private baseAlive = true;
  private enemiesSpawned = 0;
  private enemiesDefeated = 0;
  private spawnTimer = 0.5;
  private nextEnemyId = 1;
  private nextBulletId = 1;
  private mapVersion = 1;
  private transitionTimer = 0;
  private rngState = 1;

  constructor(levels: LevelDefinition[] = LEVELS) {
    this.levels = levels;
    this.loadLevel(0, true);
  }

  start(): void {
    if (this.phase === "ready") {
      this.phase = "playing";
    }
  }

  tick(dt: number, command: Partial<GameCommand> = EMPTY_COMMAND): void {
    const input = { ...EMPTY_COMMAND, ...command };
    const step = Math.min(Math.max(dt, 0), 0.05);

    if (input.restart) {
      this.restartCurrentLevel();
      return;
    }

    if (this.phase === "ready") {
      if (input.confirm || input.fire || input.move) this.phase = "playing";
      return;
    }

    if (this.phase === "complete") {
      if (input.confirm) this.restartCampaign();
      return;
    }

    if (this.phase === "lost") {
      if (input.confirm || input.fire) this.restartCurrentLevel();
      return;
    }

    if (this.phase === "paused") {
      if (input.togglePause || input.confirm || input.fire) this.phase = "playing";
      return;
    }

    if (this.phase === "won") {
      this.transitionTimer -= step;
      if (this.transitionTimer <= 0 || input.confirm || input.fire) this.advanceLevel();
      return;
    }

    if (input.togglePause) {
      this.phase = "paused";
      return;
    }

    if (this.phase !== "playing") return;
    this.updatePlaying(step, input);
  }

  snapshot(): GameSnapshot {
    const level = this.currentLevel;
    return {
      phase: this.phase,
      levelIndex: this.levelIndex,
      levelNumber: level.id,
      levelName: level.name,
      totalLevels: this.levels.length,
      score: this.score,
      lives: this.lives,
      baseAlive: this.baseAlive,
      enemiesTotal: level.enemyQueue.length,
      enemiesSpawned: this.enemiesSpawned,
      enemiesDefeated: this.enemiesDefeated,
      mapVersion: this.mapVersion,
      tiles: this.tiles.map((row) => [...row]),
      tanks: [...this.tanks.values()].map((tank) => ({ ...tank })),
      bullets: [...this.bullets.values()].map((bullet) => ({ ...bullet })),
    };
  }

  pullEvents(): GameEvent[] {
    const pulled = this.events;
    this.events = [];
    return pulled;
  }

  restartCampaign(): void {
    this.score = 0;
    this.loadLevel(0, true);
  }

  restartCurrentLevel(): void {
    this.loadLevel(this.levelIndex, true);
    this.phase = "playing";
  }

  loadLevel(index: number, ready = false): void {
    this.levelIndex = Math.max(0, Math.min(index, this.levels.length - 1));
    this.tiles = this.currentLevel.layout.map((row) => [...row].map(tileFromChar));
    this.tanks.clear();
    this.bullets.clear();
    this.events = [];
    this.lives = STARTING_LIVES;
    this.baseAlive = true;
    this.enemiesSpawned = 0;
    this.enemiesDefeated = 0;
    this.spawnTimer = 0.4;
    this.nextEnemyId = 1;
    this.nextBulletId = 1;
    this.mapVersion += 1;
    this.transitionTimer = 0;
    this.rngState = (0x9e3779b9 ^ this.currentLevel.id) >>> 0;
    this.spawnPlayer();
    this.phase = ready ? "ready" : "playing";
  }

  forceWinForDebug(): void {
    for (const tank of [...this.tanks.values()]) {
      if (tank.side === "enemy") this.tanks.delete(tank.id);
    }
    this.enemiesSpawned = this.currentLevel.enemyQueue.length;
    this.enemiesDefeated = this.currentLevel.enemyQueue.length;
    this.bullets.clear();
    this.phase = "won";
    this.transitionTimer = 0.05;
  }

  get currentLevel(): LevelDefinition {
    return this.levels[this.levelIndex];
  }

  private updatePlaying(dt: number, input: GameCommand): void {
    for (const tank of this.tanks.values()) {
      tank.fireCooldown = Math.max(0, tank.fireCooldown - dt);
      tank.invulnerable = Math.max(0, tank.invulnerable - dt);
      tank.moving = false;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.trySpawnEnemy();
      this.spawnTimer = 1.25 + this.random() * 0.55;
    }

    this.updatePlayer(dt, input);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.checkWinCondition();
  }

  private updatePlayer(dt: number, input: GameCommand): void {
    const player = this.tanks.get(PLAYER_ID);
    if (!player) return;

    if (input.move) this.moveTank(player, input.move, dt);
    if (input.fire) this.fire(player);
  }

  private updateEnemies(dt: number): void {
    for (const enemy of [...this.tanks.values()].filter((tank) => tank.side === "enemy")) {
      enemy.aiTimer -= dt;

      if (this.shouldFireAtTarget(enemy)) {
        this.fire(enemy);
      }

      if (enemy.aiTimer <= 0) {
        enemy.dir = this.chooseEnemyDirection(enemy);
        enemy.aiTimer = 0.35 + this.random() * 0.85;
      }

      const moved = this.moveTank(enemy, enemy.dir, dt);
      if (!moved) {
        if (this.random() < 0.55) this.fire(enemy);
        enemy.dir = this.chooseEnemyDirection(enemy, true);
        enemy.aiTimer = 0.25;
      }
    }
  }

  private updateBullets(dt: number): void {
    for (const bullet of [...this.bullets.values()]) {
      if (!this.bullets.has(bullet.id)) continue;

      const vec = DIR_VECTORS[bullet.dir];
      const steps = Math.max(1, Math.ceil((bullet.speed * dt) / 0.09));
      const subStep = dt / steps;

      for (let i = 0; i < steps; i += 1) {
        if (!this.bullets.has(bullet.id)) break;
        bullet.x += vec.x * bullet.speed * subStep;
        bullet.y += vec.y * bullet.speed * subStep;
        this.resolveBulletCollision(bullet);
      }
    }
  }

  private trySpawnEnemy(): void {
    const queue = this.currentLevel.enemyQueue;
    const activeEnemies = [...this.tanks.values()].filter((tank) => tank.side === "enemy").length;
    if (this.enemiesSpawned >= queue.length || activeEnemies >= this.currentLevel.maxActiveEnemies) return;

    const type = queue[this.enemiesSpawned];
    const spawnOrder = [0, 1, 2].map((slot) => (slot + this.enemiesSpawned) % ENEMY_SPAWNS.length);
    const spawn = spawnOrder.map((slot) => ENEMY_SPAWNS[slot]).find((point) => this.canTankOccupy("spawn", point.x, point.y));
    if (!spawn) return;

    const stats = enemyStats[type];
    const levelBoost = 1 + this.levelIndex * 0.018;
    const tank: Tank = {
      id: `enemy-${this.nextEnemyId++}`,
      side: "enemy",
      type,
      x: spawn.x,
      y: spawn.y,
      dir: "down",
      hp: stats.hp,
      maxHp: stats.maxHp,
      speed: stats.speed * levelBoost,
      fireCooldown: 0.45 + this.random() * 0.85,
      reloadTime: Math.max(0.78, stats.reloadTime - this.levelIndex * 0.035),
      bulletSpeed: stats.bulletSpeed,
      invulnerable: 0.7,
      aiTimer: 0.15,
      moving: false,
    };

    this.tanks.set(tank.id, tank);
    this.enemiesSpawned += 1;
    this.events.push({ type: "spawn", x: tank.x, y: tank.y, color: "#ff745f" });
  }

  private spawnPlayer(useAlt = false): void {
    const spawn = useAlt && this.canTankOccupy(PLAYER_ID, PLAYER_ALT_SPAWN.x, PLAYER_ALT_SPAWN.y) ? PLAYER_ALT_SPAWN : PLAYER_SPAWN;
    const player: Tank = {
      id: PLAYER_ID,
      side: "player",
      type: "player",
      x: spawn.x,
      y: spawn.y,
      dir: "up",
      hp: 1,
      maxHp: 1,
      speed: 2.9,
      fireCooldown: 0,
      reloadTime: 0.36,
      bulletSpeed: 8.3,
      invulnerable: 2.2,
      aiTimer: 0,
      moving: false,
    };
    this.tanks.set(PLAYER_ID, player);
    this.events.push({ type: "spawn", x: player.x, y: player.y, color: "#54d6a0" });
  }

  private moveTank(tank: Tank, dir: Direction, dt: number): boolean {
    tank.dir = dir;
    const vec = DIR_VECTORS[dir];
    const surface = this.tileAt(Math.floor(tank.x), Math.floor(tank.y));
    const speed = tank.speed * (surface === "ice" ? 1.16 : 1);
    const step = speed * dt;
    const aligned = this.alignedPosition(tank, dir, step * 1.15);

    if (this.canTankOccupy(tank.id, aligned.x, aligned.y)) {
      tank.x = aligned.x;
      tank.y = aligned.y;
    }

    const nextX = tank.x + vec.x * step;
    const nextY = tank.y + vec.y * step;
    if (this.canTankOccupy(tank.id, nextX, nextY)) {
      tank.x = nextX;
      tank.y = nextY;
      tank.moving = true;
      return true;
    }

    tank.moving = false;
    return false;
  }

  private alignedPosition(tank: Tank, dir: Direction, maxDelta: number): Vector2 {
    const targetX = Math.floor(tank.x) + 0.5;
    const targetY = Math.floor(tank.y) + 0.5;
    if (dir === "up" || dir === "down") {
      return { x: tank.x + clamp(targetX - tank.x, -maxDelta, maxDelta), y: tank.y };
    }
    return { x: tank.x, y: tank.y + clamp(targetY - tank.y, -maxDelta, maxDelta) };
  }

  private fire(tank: Tank): void {
    if (tank.fireCooldown > 0) return;

    const activeOwnedBullets = [...this.bullets.values()].filter((bullet) => bullet.ownerId === tank.id).length;
    if (activeOwnedBullets >= (tank.side === "player" ? 2 : 1)) return;

    const vec = DIR_VECTORS[tank.dir];
    const bullet: Bullet = {
      id: `bullet-${this.nextBulletId++}`,
      ownerId: tank.id,
      ownerSide: tank.side,
      x: tank.x + vec.x * 0.52,
      y: tank.y + vec.y * 0.52,
      dir: tank.dir,
      speed: tank.bulletSpeed,
      power: tank.type === "power" ? 2 : 1,
    };

    tank.fireCooldown = tank.reloadTime;
    this.bullets.set(bullet.id, bullet);
  }

  private resolveBulletCollision(bullet: Bullet): void {
    if (bullet.x < 0 || bullet.x >= GRID_WIDTH || bullet.y < 0 || bullet.y >= GRID_HEIGHT) {
      this.bullets.delete(bullet.id);
      return;
    }

    const col = Math.floor(bullet.x);
    const row = Math.floor(bullet.y);
    const tile = this.tileAt(col, row);
    if (tile === "brick") {
      this.setTile(col, row, "empty");
      this.events.push({ type: "brick", x: col + 0.5, y: row + 0.5, color: "#d58044" });
      this.bullets.delete(bullet.id);
      return;
    }

    if (tile === "steel") {
      this.events.push({ type: "explosion", x: bullet.x, y: bullet.y, color: "#a8b0aa" });
      this.bullets.delete(bullet.id);
      return;
    }

    if (tile === "base") {
      this.baseAlive = false;
      this.events.push({ type: "base-hit", x: BASE_POSITION.x, y: BASE_POSITION.y, color: "#f3bc46" });
      this.phase = "lost";
      this.bullets.delete(bullet.id);
      return;
    }

    for (const otherBullet of [...this.bullets.values()]) {
      if (otherBullet.id === bullet.id || otherBullet.ownerSide === bullet.ownerSide) continue;
      const distance = Math.hypot(otherBullet.x - bullet.x, otherBullet.y - bullet.y);
      if (distance < BULLET_HIT_RADIUS) {
        this.bullets.delete(otherBullet.id);
        this.bullets.delete(bullet.id);
        this.events.push({ type: "explosion", x: bullet.x, y: bullet.y, color: "#f7f4df" });
        return;
      }
    }

    for (const tank of [...this.tanks.values()]) {
      if (tank.id === bullet.ownerId || tank.side === bullet.ownerSide) continue;
      if (Math.max(Math.abs(tank.x - bullet.x), Math.abs(tank.y - bullet.y)) <= TANK_HIT_RADIUS) {
        this.damageTank(tank, bullet.power);
        this.bullets.delete(bullet.id);
        return;
      }
    }
  }

  private damageTank(tank: Tank, power: number): void {
    if (tank.invulnerable > 0) return;

    tank.hp -= power;
    if (tank.hp > 0) {
      this.events.push({ type: "explosion", x: tank.x, y: tank.y, color: "#ffd36e" });
      return;
    }

    this.events.push({
      type: "explosion",
      x: tank.x,
      y: tank.y,
      color: tank.side === "player" ? "#54d6a0" : "#ff745f",
    });

    if (tank.side === "enemy") {
      this.tanks.delete(tank.id);
      this.enemiesDefeated += 1;
      this.score += tank.type === "armor" ? 300 : tank.type === "fast" ? 200 : tank.type === "power" ? 250 : 100;
      return;
    }

    this.lives -= 1;
    if (this.lives <= 0) {
      this.tanks.delete(tank.id);
      this.phase = "lost";
      return;
    }

    this.spawnPlayer(this.random() > 0.5);
  }

  private shouldFireAtTarget(tank: Tank): boolean {
    if (tank.fireCooldown > 0) return false;
    const player = this.tanks.get(PLAYER_ID);
    const targets = player ? [player, BASE_POSITION] : [BASE_POSITION];
    return targets.some((target) => this.isAimingAt(tank, target));
  }

  private isAimingAt(tank: Tank, target: Vector2): boolean {
    const dx = target.x - tank.x;
    const dy = target.y - tank.y;
    if (Math.abs(dx) < 0.38) {
      if (dy < 0 && tank.dir === "up") return true;
      if (dy > 0 && tank.dir === "down") return true;
    }
    if (Math.abs(dy) < 0.38) {
      if (dx < 0 && tank.dir === "left") return true;
      if (dx > 0 && tank.dir === "right") return true;
    }
    return false;
  }

  private chooseEnemyDirection(tank: Tank, forceRandom = false): Direction {
    if (forceRandom || this.random() < 0.24) {
      return DIRECTIONS[Math.floor(this.random() * DIRECTIONS.length)];
    }

    const player = this.tanks.get(PLAYER_ID);
    const target = player && this.random() < 0.55 ? player : BASE_POSITION;
    const dx = target.x - tank.x;
    const dy = target.y - tank.y;
    const primary: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    const secondary: Direction = Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? "down" : "up") : dx > 0 ? "right" : "left";
    return this.random() < 0.72 ? primary : secondary;
  }

  private checkWinCondition(): void {
    const activeEnemyCount = [...this.tanks.values()].filter((tank) => tank.side === "enemy").length;
    if (this.enemiesDefeated >= this.currentLevel.enemyQueue.length && activeEnemyCount === 0) {
      this.phase = "won";
      this.transitionTimer = 1.6;
      this.score += 500 + this.currentLevel.id * 50;
    }
  }

  private advanceLevel(): void {
    if (this.levelIndex >= this.levels.length - 1) {
      this.phase = "complete";
      return;
    }
    this.loadLevel(this.levelIndex + 1, false);
  }

  private canTankOccupy(tankId: string, x: number, y: number): boolean {
    const minX = Math.floor(x - TANK_RADIUS);
    const maxX = Math.floor(x + TANK_RADIUS);
    const minY = Math.floor(y - TANK_RADIUS);
    const maxY = Math.floor(y + TANK_RADIUS);
    if (minX < 0 || minY < 0 || maxX >= GRID_WIDTH || maxY >= GRID_HEIGHT) return false;

    for (let row = minY; row <= maxY; row += 1) {
      for (let col = minX; col <= maxX; col += 1) {
        if (this.isSolidForTank(this.tileAt(col, row))) return false;
      }
    }

    for (const tank of this.tanks.values()) {
      if (tank.id === tankId) continue;
      if (Math.abs(tank.x - x) < 0.72 && Math.abs(tank.y - y) < 0.72) return false;
    }
    return true;
  }

  private tileAt(col: number, row: number): TileKind {
    if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_HEIGHT) return "steel";
    return this.tiles[row][col];
  }

  private setTile(col: number, row: number, tile: TileKind): void {
    if (col < 0 || col >= GRID_WIDTH || row < 0 || row >= GRID_HEIGHT) return;
    this.tiles[row][col] = tile;
    this.mapVersion += 1;
  }

  private isSolidForTank(tile: TileKind): boolean {
    return tile === "brick" || tile === "steel" || tile === "water" || tile === "base";
  }

  private random(): number {
    this.rngState = (1664525 * this.rngState + 1013904223) >>> 0;
    return this.rngState / 0x100000000;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
