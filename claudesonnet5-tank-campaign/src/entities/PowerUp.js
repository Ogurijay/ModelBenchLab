import { POWERUP_LIFETIME } from '../core/constants.js';

let _nextId = 1;

// 道具是纯数据；具体效果（升级火力、无敌、清屏等）在 GameEngine 里按 type 分发处理。
export class PowerUp {
  constructor(type, x, z) {
    this.id = _nextId++;
    this.type = type;
    this.x = x;
    this.z = z;
    this.halfExtent = 0.5;
    this.life = POWERUP_LIFETIME;
    this.alive = true;
    this.mesh = null;
  }

  aabb() {
    const h = this.halfExtent;
    return { minX: this.x - h, minZ: this.z - h, maxX: this.x + h, maxZ: this.z + h };
  }
}
