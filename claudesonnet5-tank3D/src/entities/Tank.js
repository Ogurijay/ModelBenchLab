import { DIRS, TANK_HALF } from '../core/constants.js';

const EPS = 0.02;

// 坦克基类：负责网格对齐的四向移动、与地形/其它坦克的碰撞判定。
// 玩家与敌方坦克都继承它，AI 决策与开火分别在各自子类实现。
export class Tank {
  constructor({ x, z, direction = 'up', speed = 4, hp = 1 }) {
    this.x = x;
    this.z = z;
    this.direction = direction;
    this.speed = speed;
    this.hp = hp;
    this.maxHp = hp;
    this.alive = true;
    this.mesh = null;
    this.invulnTimer = 0;
    this.flashTimer = 0;
    this.frozenTimer = 0;
    this.fireTimer = 0;
    this.team = 'enemy';
  }

  get halfExtent() {
    return TANK_HALF;
  }

  aabb() {
    const h = this.halfExtent;
    return { minX: this.x - h, minZ: this.z - h, maxX: this.x + h, maxZ: this.z + h };
  }

  // 尝试朝 dir 方向移动一帧的距离。转弯的垂直轴会自动吸附到整数网格，
  // 保证坦克能顺畅通过 1 格宽的通道，不会因半像素错位卡死。
  // 无论是否成功移动，朝向都会立即更新（可以原地转向瞄准）。
  tryMove(dir, dt, grid, blockers) {
    let baseX = this.x;
    let baseZ = this.z;
    if (dir === 'left' || dir === 'right') baseZ = Math.round(this.z);
    else baseX = Math.round(this.x);

    const v = DIRS[dir];
    const dist = this.speed * dt;
    const nx = baseX + v.x * dist;
    const nz = baseZ + v.z * dist;
    const h = this.halfExtent;

    this.direction = dir;

    if (grid.isBlockedForTank(nx - h, nz - h, nx + h, nz + h)) return false;

    if (blockers) {
      for (const other of blockers) {
        if (other === this || !other.alive) continue;
        const oh = other.halfExtent;
        if (nx - h < other.x + oh - EPS && nx + h > other.x - oh + EPS && nz - h < other.z + oh - EPS && nz + h > other.z - oh + EPS) {
          return false;
        }
      }
    }

    this.x = nx;
    this.z = nz;
    return true;
  }

  takeDamage(amount = 1) {
    if (!this.alive || this.invulnTimer > 0) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    this.flashTimer = 0.16;
    return false;
  }
}
