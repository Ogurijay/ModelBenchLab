import { DIRS, BULLET_MAX_LIFETIME } from '../core/constants.js';

let _nextId = 1;

// 子弹是纯数据 + 位移，具体的碰撞判定集中在 GameEngine 里处理，
// 因为一次命中可能同时牵涉地形销毁、多个坦克、计分、特效与音效，
// 放在同一处更容易保证规则一致、便于核对。
export class Bullet {
  constructor({ x, z, direction, speed, owner, canBreakSteel = false, half = 0.16 }) {
    this.id = _nextId++;
    this.x = x;
    this.z = z;
    this.direction = direction;
    this.vx = DIRS[direction].x * speed;
    this.vz = DIRS[direction].z * speed;
    this.owner = owner; // 'player' | 'enemy'
    this.canBreakSteel = canBreakSteel;
    this.half = half;
    this.alive = true;
    this.life = BULLET_MAX_LIFETIME;
    this.mesh = null;
  }
}
