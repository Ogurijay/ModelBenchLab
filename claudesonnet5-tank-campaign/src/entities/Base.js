import { BASE_CELL } from '../core/constants.js';

// 玩家的基地（老鹰）。一旦被敌方子弹命中即刻游戏结束，与生命数无关。
export class Base {
  constructor() {
    this.x = BASE_CELL.x * 2 + 1;
    this.z = BASE_CELL.y * 2 + 1;
    this.halfExtent = 0.94;
    this.alive = true;
    this.mesh = null;
  }

  aabb() {
    const h = this.halfExtent;
    return { minX: this.x - h, minZ: this.z - h, maxX: this.x + h, maxZ: this.z + h };
  }

  destroy() {
    this.alive = false;
  }

  reset() {
    this.alive = true;
  }
}
