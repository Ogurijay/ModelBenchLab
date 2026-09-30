import { GRID_HEIGHT, GRID_WIDTH, type EnemyType, type LevelDefinition } from "../simulation/types";

type TileChar = "." | "B" | "S" | "W" | "F" | "I" | "E";
type Grid = TileChar[][];

const enemyCycle: EnemyType[] = ["basic", "basic", "fast", "basic", "armor", "power"];

function createGrid(): Grid {
  return Array.from({ length: GRID_HEIGHT }, () => Array<TileChar>(GRID_WIDTH).fill("."));
}

function rect(grid: Grid, x: number, y: number, width: number, height: number, tile: TileChar): void {
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      set(grid, col, row, tile);
    }
  }
}

function set(grid: Grid, x: number, y: number, tile: TileChar): void {
  if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
    grid[y][x] = tile;
  }
}

function clearRect(grid: Grid, x: number, y: number, width: number, height: number): void {
  rect(grid, x, y, width, height, ".");
}

function mirroredRect(grid: Grid, x: number, y: number, width: number, height: number, tile: TileChar): void {
  rect(grid, x, y, width, height, tile);
  rect(grid, GRID_WIDTH - x - width, y, width, height, tile);
}

function addBaseFort(grid: Grid, reinforced = false): void {
  const wall: TileChar = reinforced ? "S" : "B";
  set(grid, 12, 25, "E");
  set(grid, 11, 23, wall);
  set(grid, 12, 23, wall);
  set(grid, 13, 23, wall);
  set(grid, 11, 24, "B");
  set(grid, 13, 24, "B");
  set(grid, 11, 25, "B");
  set(grid, 13, 25, "B");
}

function clearCriticalZones(grid: Grid): void {
  clearRect(grid, 0, 0, 3, 3);
  clearRect(grid, 11, 0, 4, 3);
  clearRect(grid, 23, 0, 3, 3);
  clearRect(grid, 8, 23, 3, 3);
  clearRect(grid, 15, 23, 3, 3);
  clearRect(grid, 11, 23, 4, 3);
}

function enemyQueue(level: number): EnemyType[] {
  const count = 7 + level;
  return Array.from({ length: count }, (_, index) => {
    const shifted = (index + Math.floor(level * 0.7)) % enemyCycle.length;
    if (level >= 8 && index % 5 === 0) return "armor";
    if (level >= 6 && index % 7 === 0) return "power";
    return enemyCycle[shifted];
  });
}

function rows(grid: Grid): string[] {
  return grid.map((row) => row.join(""));
}

function makeLevel(id: number, name: string, build: (grid: Grid) => void, reinforcedBase = false): LevelDefinition {
  const grid = createGrid();
  build(grid);
  clearCriticalZones(grid);
  addBaseFort(grid, reinforcedBase);

  return {
    id,
    name,
    layout: rows(grid),
    enemyQueue: enemyQueue(id),
    maxActiveEnemies: Math.min(3 + Math.floor(id / 3), 5),
  };
}

export const LEVELS: LevelDefinition[] = [
  makeLevel(1, "训练营地", (grid) => {
    for (let y = 4; y <= 20; y += 2) {
      mirroredRect(grid, 4, y, 1, 1, "B");
      mirroredRect(grid, 8, y, 1, 1, "B");
    }
    rect(grid, 11, 9, 4, 1, "B");
    rect(grid, 11, 15, 4, 1, "B");
    rect(grid, 2, 12, 3, 1, "F");
    rect(grid, 21, 12, 3, 1, "F");
  }),
  makeLevel(2, "双线推进", (grid) => {
    for (let y = 3; y <= 19; y += 4) {
      mirroredRect(grid, 5, y, 2, 2, "B");
      rect(grid, 12, y + 1, 2, 1, "S");
    }
    rect(grid, 2, 8, 4, 1, "W");
    rect(grid, 20, 8, 4, 1, "W");
    rect(grid, 10, 18, 6, 1, "B");
  }),
  makeLevel(3, "水道交叉", (grid) => {
    rect(grid, 3, 6, 7, 2, "W");
    rect(grid, 16, 6, 7, 2, "W");
    rect(grid, 11, 5, 4, 1, "B");
    rect(grid, 11, 8, 4, 1, "B");
    mirroredRect(grid, 3, 12, 2, 6, "B");
    mirroredRect(grid, 8, 13, 1, 4, "S");
    rect(grid, 10, 18, 6, 2, "F");
  }),
  makeLevel(4, "钢铁街区", (grid) => {
    for (let x = 3; x <= 21; x += 6) {
      rect(grid, x, 5, 2, 2, "S");
      rect(grid, x + 2, 5, 2, 2, "B");
      rect(grid, x, 13, 2, 2, "B");
      rect(grid, x + 2, 13, 2, 2, "S");
    }
    rect(grid, 6, 20, 14, 1, "B");
    rect(grid, 12, 10, 2, 2, "F");
  }),
  makeLevel(5, "冰面伏击", (grid) => {
    rect(grid, 2, 9, 22, 2, "I");
    rect(grid, 2, 18, 22, 2, "I");
    for (let x = 4; x <= 20; x += 4) {
      rect(grid, x, 4, 1, 4, "B");
      rect(grid, x + 1, 14, 1, 3, "B");
    }
    rect(grid, 10, 11, 6, 2, "W");
    mirroredRect(grid, 2, 21, 3, 1, "F");
  }),
  makeLevel(6, "密林护盾", (grid) => {
    rect(grid, 2, 4, 8, 3, "F");
    rect(grid, 16, 4, 8, 3, "F");
    rect(grid, 7, 10, 12, 3, "F");
    mirroredRect(grid, 4, 8, 2, 5, "B");
    mirroredRect(grid, 8, 15, 1, 5, "S");
    rect(grid, 11, 18, 4, 1, "B");
  }),
  makeLevel(7, "斜向堡垒", (grid) => {
    for (let i = 0; i < 8; i += 1) {
      rect(grid, 3 + i, 5 + i, 2, 1, i % 3 === 0 ? "S" : "B");
      rect(grid, 21 - i, 5 + i, 2, 1, i % 3 === 0 ? "S" : "B");
    }
    rect(grid, 3, 17, 6, 2, "W");
    rect(grid, 17, 17, 6, 2, "W");
    rect(grid, 10, 13, 6, 1, "B");
  }),
  makeLevel(8, "前线基地", (grid) => {
    rect(grid, 2, 4, 22, 1, "B");
    rect(grid, 5, 8, 1, 10, "B");
    rect(grid, 20, 8, 1, 10, "B");
    rect(grid, 8, 10, 10, 1, "S");
    rect(grid, 8, 16, 10, 1, "B");
    rect(grid, 11, 6, 4, 2, "F");
    clearRect(grid, 11, 4, 4, 1);
    clearRect(grid, 12, 10, 2, 1);
  }),
  makeLevel(9, "钢水迷宫", (grid) => {
    for (let y = 4; y <= 18; y += 3) {
      rect(grid, 3, y, 7, 1, y % 2 ? "B" : "S");
      rect(grid, 16, y, 7, 1, y % 2 ? "S" : "B");
    }
    rect(grid, 11, 6, 4, 7, "W");
    rect(grid, 11, 14, 4, 1, "B");
    rect(grid, 2, 21, 22, 1, "I");
    clearRect(grid, 12, 6, 2, 7);
  }, true),
  makeLevel(10, "最终防线", (grid) => {
    rect(grid, 2, 4, 6, 2, "B");
    rect(grid, 18, 4, 6, 2, "B");
    rect(grid, 5, 8, 4, 4, "S");
    rect(grid, 17, 8, 4, 4, "S");
    rect(grid, 10, 8, 6, 2, "W");
    rect(grid, 3, 15, 20, 1, "B");
    rect(grid, 7, 18, 12, 1, "S");
    rect(grid, 9, 20, 8, 2, "F");
    clearRect(grid, 11, 15, 4, 1);
    clearRect(grid, 12, 18, 2, 1);
  }, true),
];
