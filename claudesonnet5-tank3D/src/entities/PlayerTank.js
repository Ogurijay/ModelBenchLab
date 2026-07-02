import { Tank } from './Tank.js';
import { PLAYER_SPEED, PLAYER_FIRE_COOLDOWN, PLAYER_BULLET_SPEED, PLAYER_MAX_BULLETS, PLAYER_SPAWN_INVULN, PLAYER_SPAWN_CELL } from '../core/constants.js';

export class PlayerTank extends Tank {
  constructor() {
    const x = PLAYER_SPAWN_CELL.x * 2 + 1;
    const z = PLAYER_SPAWN_CELL.y * 2 + 1;
    super({ x, z, direction: 'up', speed: PLAYER_SPEED, hp: 1 });
    this.team = 'player';
    this.weaponLevel = 1;
    this.invulnTimer = PLAYER_SPAWN_INVULN;
  }

  respawn() {
    this.x = PLAYER_SPAWN_CELL.x * 2 + 1;
    this.z = PLAYER_SPAWN_CELL.y * 2 + 1;
    this.direction = 'up';
    this.hp = 1;
    this.alive = true;
    this.invulnTimer = PLAYER_SPAWN_INVULN;
    this.fireTimer = 0;
  }

  update(dt, input, grid, blockers) {
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    const dir = input.currentMoveDirection();
    if (dir) this.tryMove(dir, dt, grid, blockers);
  }

  wantsFire(input) {
    return input.isFireDown() && this.fireTimer <= 0;
  }

  consumeFire() {
    this.fireTimer = PLAYER_FIRE_COOLDOWN;
  }

  get bulletSpeed() {
    return PLAYER_BULLET_SPEED[this.weaponLevel - 1];
  }

  get maxBullets() {
    return PLAYER_MAX_BULLETS[this.weaponLevel - 1];
  }

  get canBreakSteel() {
    return this.weaponLevel >= 4;
  }

  upgradeWeapon(toMax = false) {
    this.weaponLevel = toMax ? 4 : Math.min(4, this.weaponLevel + 1);
  }

  resetWeapon() {
    this.weaponLevel = 1;
  }
}
