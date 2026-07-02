import { SUB, MAP_SIZE, TERRAIN, terrainBlocksTank, BASE_CELL, PLAYER_SPAWN_CELL, ENEMY_SPAWN_CELLS, FORT_BASELINE } from './constants.js';

// 地形网格：26x26 子格，是碰撞与地形销毁的最小单位。
// 关卡数据用"地图格"(0..12)描述矩形区块，这里统一换算成子格填充。
export class Grid {
  constructor() {
    this.cells = new Uint8Array(SUB * SUB);
    this.dirty = []; // { cx, cz, type } 自上次渲染同步以来变化的子格，供 TerrainView 增量更新
    this.fortSubcells = this._computeFortSubcells();
  }

  idx(cx, cz) {
    return cz * SUB + cx;
  }

  inBounds(cx, cz) {
    return cx >= 0 && cz >= 0 && cx < SUB && cz < SUB;
  }

  getType(cx, cz) {
    if (!this.inBounds(cx, cz)) return TERRAIN.STEEL; // 场外视为不可通行/不可摧毁的边界
    return this.cells[this.idx(cx, cz)];
  }

  setSubcell(cx, cz, type) {
    if (!this.inBounds(cx, cz)) return;
    const i = this.idx(cx, cz);
    if (this.cells[i] === type) return;
    this.cells[i] = type;
    this.dirty.push({ cx, cz, type });
  }

  consumeDirty() {
    const d = this.dirty;
    this.dirty = [];
    return d;
  }

  // 地图格矩形 -> 子格范围（左闭右开）
  static rectToSub(x, y, w, h) {
    const cx0 = Math.max(0, Math.min(MAP_SIZE, x)) * 2;
    const cz0 = Math.max(0, Math.min(MAP_SIZE, y)) * 2;
    const cx1 = Math.max(0, Math.min(MAP_SIZE, x + w)) * 2;
    const cz1 = Math.max(0, Math.min(MAP_SIZE, y + h)) * 2;
    return { cx0, cz0, cx1, cz1 };
  }

  fillRect(type, x, y, w, h) {
    const { cx0, cz0, cx1, cz1 } = Grid.rectToSub(x, y, w, h);
    for (let cz = cz0; cz < cz1; cz++) {
      for (let cx = cx0; cx < cx1; cx++) {
        this.setSubcell(cx, cz, type);
      }
    }
  }

  clearCellPlus(cellX, cellY) {
    const offsets = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of offsets) {
      const x = cellX + dx;
      const y = cellY + dy;
      if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) continue;
      this.fillRect(TERRAIN.EMPTY, x, y, 1, 1);
    }
  }

  _computeFortSubcells() {
    const list = [];
    for (const f of FORT_BASELINE) {
      const { cx0, cz0, cx1, cz1 } = Grid.rectToSub(f.x, f.y, f.w, f.h);
      for (let cz = cz0; cz < cz1; cz++) {
        for (let cx = cx0; cx < cx1; cx++) list.push({ cx, cz });
      }
    }
    return list;
  }

  loadLevel(levelDef) {
    this.cells.fill(TERRAIN.EMPTY);
    this.dirty = [];

    for (const f of FORT_BASELINE) this.fillRect(f.type, f.x, f.y, f.w, f.h);
    for (const f of levelDef.features) this.fillRect(f.type, f.x, f.y, f.w, f.h);

    // 安全护栏：无论关卡数据如何编写，出生点与基地格永远不会被地形堵死
    this.clearCellPlus(PLAYER_SPAWN_CELL.x, PLAYER_SPAWN_CELL.y);
    for (const s of ENEMY_SPAWN_CELLS) this.clearCellPlus(s.x, s.y);
    this.fillRect(TERRAIN.EMPTY, BASE_CELL.x, BASE_CELL.y, 1, 1);

    this.consumeDirty(); // 整关重建不需要增量脏列表，TerrainView 会做整体 rebuild
  }

  // 铁锹道具：把基地要塞的砖墙临时替换为钢墙
  reinforceFort() {
    for (const { cx, cz } of this.fortSubcells) {
      if (this.getType(cx, cz) !== TERRAIN.STEEL) this.setSubcell(cx, cz, TERRAIN.STEEL);
    }
  }

  // 铁锹道具到期：钢墙还原为砖墙（同时修复此前被打掉的部分）
  restoreFort() {
    for (const { cx, cz } of this.fortSubcells) {
      this.setSubcell(cx, cz, TERRAIN.BRICK);
    }
  }

  // 子弹命中一对子格（与坦克等宽的一条"车道"）：摧毁其中的砖块；
  // 钢块仅在 canBreakSteel 时摧毁。之所以是"一对"而不是单个子格，
  // 是因为坦克宽度正好等于 2 个子格，其中轴线必然落在子格边界上，
  // 若只摧毁单侧子格，笔直射击永远无法打穿正对着坦克的墙（另一侧子格永远打不到）。
  hitLane(cellPairs, canBreakSteel) {
    let blocked = false;
    let destroyed = false;
    let brick = false;
    for (const [cx, cz] of cellPairs) {
      const t = this.getType(cx, cz);
      if (t === TERRAIN.BRICK) {
        this.setSubcell(cx, cz, TERRAIN.EMPTY);
        blocked = true;
        destroyed = true;
        brick = true;
      } else if (t === TERRAIN.STEEL) {
        blocked = true;
        if (canBreakSteel) {
          this.setSubcell(cx, cz, TERRAIN.EMPTY);
          destroyed = true;
        }
      }
    }
    return { blocked, destroyed, brick };
  }

  // AABB（逻辑坐标，单位=子格）是否被地形阻挡（坦克用）
  isBlockedForTank(minX, minZ, maxX, maxZ) {
    const cx0 = Math.floor(minX);
    const cz0 = Math.floor(minZ);
    const cx1 = Math.ceil(maxX) - 1;
    const cz1 = Math.ceil(maxZ) - 1;
    if (cx0 < 0 || cz0 < 0 || cx1 >= SUB || cz1 >= SUB) return true;
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (terrainBlocksTank(this.getType(cx, cz))) return true;
      }
    }
    return false;
  }
}
