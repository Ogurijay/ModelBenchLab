import * as THREE from 'three';
import {
  SUB, TERRAIN, FIELD_HALF, DIRS,
  ENEMY_MAX_ALIVE, ENEMY_SPAWN_INTERVAL, ENEMY_SPAWN_CELLS,
  POWERUP_TYPES, POWERUP_BLINK_AT, HELMET_DURATION, CLOCK_FREEZE_DURATION, SHOVEL_DURATION,
  PLAYER_RESPAWN_DELAY, PLAYER_BULLET_HALF, ENEMY_BULLET_HALF, BULLET_SPAWN_OFFSET,
  PLAYER_MAX_LIVES_DISPLAY,
} from './core/constants.js';
import { Grid } from './core/Grid.js';
import { InputManager } from './core/InputManager.js';
import { AudioKit } from './core/AudioKit.js';
import { buildLevel, getLevelCount } from './levels/levelData.js';
import { TerrainView } from './render/TerrainView.js';
import { Effects } from './render/Effects.js';
import { CameraRig } from './render/CameraRig.js';
import { buildTankModel, buildBulletMesh, buildPowerUpModel, buildBaseModel, setBaseDestroyed } from './render/Models.js';
import { PlayerTank } from './entities/PlayerTank.js';
import { EnemyTank } from './entities/EnemyTank.js';
import { Bullet } from './entities/Bullet.js';
import { PowerUp } from './entities/PowerUp.js';
import { Base } from './entities/Base.js';
import { UI } from './ui/UI.js';

const _lookVec = new THREE.Vector3();

export class GameEngine {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.Fog(0x05060a, 42, 98);

    this.cameraRig = new CameraRig();
    this._setupLights();

    this.grid = new Grid();
    this.terrainView = new TerrainView(this.scene);
    this.effects = new Effects(this.scene);
    this.input = new InputManager();
    this.audio = new AudioKit();
    this.ui = new UI({
      onStart: () => this.startGame(),
      onRestart: () => this.startGame(),
      onAgain: () => this.startGame(),
      onMuteToggle: () => this._toggleMute(),
    });

    this.state = 'menu';
    this.stateTimer = 0;
    this.level = 1;
    this.score = 0;
    this.highScore = Number(localStorage.getItem('tank3d-highscore') || 0);
    this.lives = 3;

    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.powerUps = [];
    this.base = new Base();

    this.spawnQueue = [];
    this.bonusEvery = 4;
    this.spawnedCount = 0;
    this.spawnCooldown = 0;
    this.respawnTimer = 0;
    this.shovelTimer = 0;
    this.freezeTimer = 0;

    this._debugMode = false;
    this._fpsSmooth = 0;

    this.ui.setHighScore(this.highScore);
    this._buildBaseMesh();
    this._setupDebugHooks();
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0x8899bb, 0x14161c, 0.55);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xfff3d6, 1.15);
    dir.position.set(-18, 30, 14);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const d = 19;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 70;
    dir.shadow.bias = -0.0018;
    this.scene.add(dir);
    this.scene.add(dir.target);

    const fill = new THREE.DirectionalLight(0x6f8fff, 0.22);
    fill.position.set(16, 14, -14);
    this.scene.add(fill);
  }

  _buildBaseMesh() {
    const mesh = buildBaseModel();
    mesh.position.set(this.base.x - FIELD_HALF, 0, this.base.z - FIELD_HALF);
    this.scene.add(mesh);
    this.base.mesh = mesh;
  }

  _setupDebugHooks() {
    const params = new URLSearchParams(location.search);
    if (!params.has('debug')) return;
    this._debugMode = true;
    this.ui.setFpsVisible(true);
    window.__tank = {
      state: () => this.state,
      level: () => this.level,
      score: () => this.score,
      enemiesLeft: () => this.spawnQueue.length + this.enemies.length,
      playerPos: () => (this.player ? { x: this.player.x, z: this.player.z, dir: this.player.direction, alive: this.player.alive, weapon: this.player.weaponLevel } : null),
      enemyList: () => this.enemies.map((e) => ({ type: e.type, x: e.x, z: e.z, hp: e.hp, dir: e.direction, invuln: e.invulnTimer > 0 })),
      bulletList: () => this.bullets.map((b) => ({ owner: b.owner, x: b.x, z: b.z })),
      powerUpList: () => this.powerUps.map((p) => ({ type: p.type, x: p.x, z: p.z, life: p.life })),
      livesCount: () => this.lives,
      baseAlive: () => this.base.alive,
      clearLevel: () => {
        const n = this.spawnQueue.length + this.enemies.length;
        this.spawnQueue.length = 0;
        for (const e of this.enemies) this._removeEntityMesh(e);
        this.enemies.length = 0;
        for (let i = 0; i < n; i++) this.ui.spendEnemyIcon();
      },
      gotoLevel: (n) => {
        this._loadLevel(n);
        this.state = 'playing';
        this.ui.hideAllOverlays();
      },
      killPlayer: () => this._damagePlayer(),
      addLife: () => {
        this.lives = Math.min(PLAYER_MAX_LIVES_DISPLAY, this.lives + 1);
        this.ui.setLives(this.lives);
      },
      maxWeapon: () => {
        if (!this.player) return;
        this.player.upgradeWeapon(true);
        this.ui.setPower(this.player.weaponLevel);
      },
      hitBase: () => this._destroyBase(),
      spawnPowerUpAt: (type, dx = 0, dz = -3) => {
        if (!this.player) return;
        this._spawnPowerUpNear(this.player.x + dx, this.player.z + dz, type);
      },
      godMode: (v = true) => {
        if (this.player) this.player.invulnTimer = v ? 999999 : 0;
      },
      // 手动推进模拟：自动化测试环境里后台标签页的 rAF 可能被浏览器完全挂起，
      // 用这个绕开真实时钟/rAF 节流，确定性地逐帧驱动游戏逻辑。
      stepFrame: (dt = 1 / 60) => this.tick(dt),
      stepFrames: (n = 60, dt = 1 / 60) => {
        for (let i = 0; i < n; i++) this.tick(dt);
      },
      teleportPlayer: (x, z, dir) => {
        if (!this.player) return;
        this.player.x = x;
        this.player.z = z;
        if (dir) this.player.direction = dir;
      },
      spawnEnemyAt: (type, x, z, dir, fireNow) => {
        const enemy = new EnemyTank({ type, x, z });
        enemy.invulnTimer = 0;
        if (dir) enemy.direction = dir;
        if (fireNow) enemy.fireTimer = 0;
        this._attachEnemyMesh(enemy);
        this.enemies.push(enemy);
        return this.enemies.length - 1;
      },
      terrainTypeAt: (mapX, mapY) => this.grid.getType(mapX * 2, mapY * 2),
      setSteelAt: (mapX, mapY, isSteel) => {
        this.grid.fillRect(isSteel ? TERRAIN.STEEL : TERRAIN.EMPTY, mapX, mapY, 1, 1);
        this.terrainView.rebuild(this.grid);
      },
    };
  }

  // ------------------------------------------------------------------ flow

  startGame() {
    this.audio.unlock();
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    if (!this.player) {
      this.player = new PlayerTank();
      this._attachPlayerMesh();
    }
    this.ui.setScore(0);
    this.ui.setLives(this.lives);
    this._loadLevel(1);
  }

  _loadLevel(n) {
    const def = buildLevel(n);
    this.grid.loadLevel(def);
    this.terrainView.rebuild(this.grid);

    this.spawnQueue = [...def.enemies];
    this.bonusEvery = def.bonusEvery;
    this.spawnedCount = 0;
    this.spawnCooldown = 0.6;
    this.freezeTimer = 0;
    this.shovelTimer = 0;

    this._clearEnemies();
    this._clearBullets();
    this._clearPowerUps();

    this.base.reset();
    setBaseDestroyed(this.base.mesh, false);

    this.player.resetWeapon();
    this.player.respawn();
    this._setPlayerMeshVisible(true);
    this.respawnTimer = 0;

    this.level = n;
    this.ui.setEnemyTotal(def.enemies.length);
    this.ui.setLevel(n);
    this.ui.setPower(this.player.weaponLevel);
    this.ui.showIntro(n, def.name);
    this.state = 'intro';
    this.stateTimer = 1.8;
  }

  _beginPlaying() {
    this.state = 'playing';
    this.ui.hideAllOverlays();
  }

  _advanceLevel() {
    this._loadLevel(this.level + 1);
  }

  _pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.showPause();
  }

  _resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.ui.hidePause();
  }

  _toggleMute() {
    const m = !this.audio.muted;
    this.audio.setMuted(m);
    this.ui.setMuted(m);
  }

  _recordHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('tank3d-highscore', String(this.highScore));
      this.ui.setHighScore(this.highScore);
    }
  }

  _gameOver(reason) {
    if (this.state === 'gameOver') return;
    this.state = 'gameOver';
    this._recordHighScore();
    this.ui.showGameOver(reason, this.score);
    this.audio.gameOver();
  }

  // --------------------------------------------------------------- update

  _handleGlobalInput() {
    if (this.input.confirmPressed()) {
      if (this.state === 'menu' || this.state === 'gameOver' || this.state === 'victory') this.startGame();
    }
    if (this.input.pausePressed()) {
      if (this.state === 'playing') this._pause();
      else if (this.state === 'paused') this._resume();
    }
  }

  tick(dt) {
    this._handleGlobalInput();

    if (this.state === 'intro') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this._beginPlaying();
    } else if (this.state === 'playing') {
      this._updatePlaying(dt);
      this._checkLevelClear();
    } else if (this.state === 'levelClear') {
      this.stateTimer -= dt;
      if (this.stateTimer <= 0) this._advanceLevel();
    }

    this._syncVisuals(dt);
    this.input.endFrame();

    if (this._debugMode) {
      const inst = 1 / Math.max(dt, 0.0001);
      this._fpsSmooth = this._fpsSmooth ? this._fpsSmooth * 0.9 + inst * 0.1 : inst;
      this.ui.updateFps(this._fpsSmooth);
    }
  }

  _updatePlaying(dt) {
    const blockers = this._collectBlockers();

    if (this.player.alive) {
      this.player.update(dt, this.input, this.grid, blockers);
      if (this.player.wantsFire(this.input)) this._tryPlayerFire();
    } else if (this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.player.respawn();
        this._setPlayerMeshVisible(true);
      }
    }

    this._updateSpawning(dt);

    for (const e of this.enemies) {
      if (!e.alive) continue;
      const target = this._targetFor(e);
      const res = e.update(dt, { grid: this.grid, blockers, target, frozen: this.freezeTimer > 0 });
      if (res.wantsFire) this._enemyFire(e);
    }

    this._updateBullets(dt);
    this._updatePowerUps(dt);

    if (this.shovelTimer > 0) {
      this.shovelTimer -= dt;
      if (this.shovelTimer <= 0) this.grid.restoreFort();
    }

    if (this.grid.dirty.length) {
      this.grid.consumeDirty();
      this.terrainView.rebuild(this.grid);
    }
  }

  _checkLevelClear() {
    if (this.state !== 'playing') return;
    if (this.spawnQueue.length === 0 && this.enemies.length === 0) {
      if (this.level >= getLevelCount()) {
        this._recordHighScore();
        this.state = 'victory';
        this.ui.showVictory(this.score);
        this.audio.victory();
      } else {
        this.state = 'levelClear';
        this.stateTimer = 2.2;
        this.ui.toast(`第 ${this.level} 关 完成！`);
        this.audio.stageClear();
      }
    }
  }

  _collectBlockers() {
    const list = [];
    if (this.player && this.player.alive) list.push(this.player);
    for (const e of this.enemies) if (e.alive) list.push(e);
    if (this.base.alive) list.push(this.base);
    return list;
  }

  _targetFor(enemy) {
    const preferBase = Math.random() < 0.65 || !this.player || !this.player.alive;
    return preferBase ? { x: this.base.x, z: this.base.z } : { x: this.player.x, z: this.player.z };
  }

  // --------------------------------------------------------------- spawn

  _pickFreeSpawnCell() {
    const order = [...ENEMY_SPAWN_CELLS].sort(() => Math.random() - 0.5);
    for (const c of order) {
      const x = c.x * 2 + 1;
      const z = c.y * 2 + 1;
      const blockedByEnemy = this.enemies.some((e) => e.alive && Math.abs(e.x - x) < 1.9 && Math.abs(e.z - z) < 1.9);
      const blockedByPlayer = this.player && this.player.alive && Math.abs(this.player.x - x) < 1.9 && Math.abs(this.player.z - z) < 1.9;
      if (!blockedByEnemy && !blockedByPlayer) return c;
    }
    return null;
  }

  _updateSpawning(dt) {
    if (this.spawnCooldown > 0) {
      this.spawnCooldown -= dt;
      return;
    }
    if (this.spawnQueue.length === 0) return;
    if (this.enemies.length >= ENEMY_MAX_ALIVE) return;

    const cell = this._pickFreeSpawnCell();
    if (!cell) return;

    const type = this.spawnQueue.shift();
    this.spawnedCount += 1;
    const isBonus = this.spawnedCount % this.bonusEvery === 0;
    const x = cell.x * 2 + 1;
    const z = cell.y * 2 + 1;
    const enemy = new EnemyTank({ type, x, z, isBonus });
    this._attachEnemyMesh(enemy);
    this.enemies.push(enemy);
    this.spawnCooldown = ENEMY_SPAWN_INTERVAL;
  }

  // -------------------------------------------------------------- firing

  _tryPlayerFire() {
    const activeCount = this.bullets.reduce((n, b) => n + (b.alive && b.owner === 'player' ? 1 : 0), 0);
    if (activeCount >= this.player.maxBullets) return;
    this.player.consumeFire();
    const dv = DIRS[this.player.direction];
    const bx = this.player.x + dv.x * BULLET_SPAWN_OFFSET;
    const bz = this.player.z + dv.z * BULLET_SPAWN_OFFSET;
    const b = new Bullet({ x: bx, z: bz, direction: this.player.direction, speed: this.player.bulletSpeed, owner: 'player', canBreakSteel: this.player.canBreakSteel, half: PLAYER_BULLET_HALF });
    this._attachBulletMesh(b, 0xfff2b0);
    this.bullets.push(b);
    this.audio.shoot();
  }

  _enemyFire(enemy) {
    const hasLiveBullet = this.bullets.some((b) => b.alive && b.ownerRef === enemy);
    if (hasLiveBullet) return;
    const dv = DIRS[enemy.direction];
    const offset = BULLET_SPAWN_OFFSET * (enemy.stat.scale || 1);
    const bx = enemy.x + dv.x * offset;
    const bz = enemy.z + dv.z * offset;
    const b = new Bullet({ x: bx, z: bz, direction: enemy.direction, speed: enemy.stat.bulletSpeed, owner: 'enemy', canBreakSteel: false, half: ENEMY_BULLET_HALF });
    b.ownerRef = enemy;
    this._attachBulletMesh(b, 0xff6b6b);
    this.bullets.push(b);
    this.audio.shoot();
  }

  // ------------------------------------------------------------- bullets

  _updateBullets(dt) {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.alive = false;
        continue;
      }
      this._advanceBullet(b, dt);
      if (b.mesh) b.mesh.position.set(b.x - FIELD_HALF, 0.42, b.z - FIELD_HALF);
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      if (!this.bullets[i].alive) {
        this._removeEntityMesh(this.bullets[i]);
        this.bullets.splice(i, 1);
      }
    }
  }

  _advanceBullet(b, dt) {
    const totalDist = Math.hypot(b.vx, b.vz) * dt;
    const steps = Math.max(1, Math.ceil(totalDist / 0.4));
    const stepDt = dt / steps;

    for (let s = 0; s < steps; s++) {
      const nx = b.x + b.vx * stepDt;
      const nz = b.z + b.vz * stepDt;

      if (nx < 0 || nx > SUB || nz < 0 || nz > SUB) {
        b.alive = false;
        return;
      }

      const cx = Math.floor(nx);
      const cz = Math.floor(nz);
      // 坦克宽度 = 2 子格，其中轴线必落在子格边界上，所以命中判定要覆盖
      // 与行进方向垂直的一整对子格，否则笔直射击只能打穿半侧墙体。
      const pair = b.direction === 'up' || b.direction === 'down' ? [[cx - 1, cz], [cx, cz]] : [[cx, cz - 1], [cx, cz]];
      const res = this.grid.hitLane(pair, b.canBreakSteel);
      if (res.blocked) {
        b.alive = false;
        const wp = this._worldPos(nx, nz);
        if (res.brick) {
          this.effects.spark(wp, 0xb96a4a);
          this.audio.brickHit();
        } else if (res.destroyed) {
          this.effects.spark(wp, 0xdfe6f2);
          this.audio.explosionSmall();
        } else {
          this.effects.spark(wp, 0xf0e26a);
          this.audio.steelClink();
        }
        return;
      }

      let clashed = false;
      for (const ob of this.bullets) {
        if (ob === b || !ob.alive || ob.owner === b.owner) continue;
        if (Math.abs(ob.x - nx) < b.half + ob.half && Math.abs(ob.z - nz) < b.half + ob.half) {
          b.alive = false;
          ob.alive = false;
          clashed = true;
          this.effects.spark(this._worldPos(nx, nz), 0xffffff);
          break;
        }
      }
      if (clashed) return;

      if (b.owner === 'player') {
        let hitEnemy = null;
        for (const e of this.enemies) {
          if (!e.alive || e.invulnTimer > 0) continue;
          if (this._pointInTank(nx, nz, e)) {
            hitEnemy = e;
            break;
          }
        }
        if (hitEnemy) {
          b.alive = false;
          this._damageEnemy(hitEnemy);
          return;
        }
        if (this.base.alive && this._pointInBase(nx, nz)) {
          b.alive = false;
          this.effects.spark(this._worldPos(nx, nz), 0xffd84a);
          return;
        }
      } else {
        if (this.player && this.player.alive && this.player.invulnTimer <= 0 && this._pointInTank(nx, nz, this.player)) {
          b.alive = false;
          this._damagePlayer();
          return;
        }
        if (this.base.alive && this._pointInBase(nx, nz)) {
          b.alive = false;
          this._destroyBase();
          return;
        }
      }

      b.x = nx;
      b.z = nz;
    }
  }

  _pointInTank(px, pz, tank) {
    const h = tank.halfExtent;
    return px >= tank.x - h && px <= tank.x + h && pz >= tank.z - h && pz <= tank.z + h;
  }

  _pointInBase(px, pz) {
    const h = this.base.halfExtent;
    return px >= this.base.x - h && px <= this.base.x + h && pz >= this.base.z - h && pz <= this.base.z + h;
  }

  _worldPos(x, z) {
    return new THREE.Vector3(x - FIELD_HALF, 0.5, z - FIELD_HALF);
  }

  _damageEnemy(enemy) {
    const destroyed = enemy.takeDamage(1);
    if (destroyed) {
      const big = enemy.type === 'armor' || enemy.type === 'boss';
      this.effects.explosion(this._worldPos(enemy.x, enemy.z), big);
      this.audio.explosionSmall();
      this._removeEntityMesh(enemy);
      const idx = this.enemies.indexOf(enemy);
      if (idx >= 0) this.enemies.splice(idx, 1);
      this.score += enemy.stat.score;
      this.ui.setScore(this.score);
      this.ui.spendEnemyIcon();
      if (enemy.isBonus) this._spawnPowerUpNear(enemy.x, enemy.z);
    } else {
      this.effects.spark(this._worldPos(enemy.x, enemy.z), 0xffffff);
    }
  }

  _damagePlayer() {
    if (!this.player || !this.player.alive) return;
    this.player.alive = false;
    this.effects.explosion(this._worldPos(this.player.x, this.player.z), true);
    this.audio.playerHit();
    this._setPlayerMeshVisible(false);
    this.lives -= 1;
    this.ui.setLives(Math.max(0, this.lives));
    if (this.lives <= 0) {
      this._gameOver('坦克部队已全部损失');
    } else {
      this.respawnTimer = PLAYER_RESPAWN_DELAY;
    }
  }

  _destroyBase() {
    if (!this.base.alive) return;
    this.base.destroy();
    setBaseDestroyed(this.base.mesh, true);
    this.effects.explosion(this._worldPos(this.base.x, this.base.z), true);
    this.audio.explosionBig();
    this._gameOver('基地已被摧毁');
  }

  // ------------------------------------------------------------ powerups

  _spawnPowerUpNear(x, z, forcedType = null) {
    const type = forcedType || POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const p = new PowerUp(type, x, z);
    this._attachPowerUpMesh(p);
    this.powerUps.push(p);
    this.audio.powerupSpawn();
  }

  _updatePowerUps(dt) {
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.life -= dt;
      if (p.life <= 0) {
        this._removeEntityMesh(p);
        this.powerUps.splice(i, 1);
        continue;
      }
      if (this.player && this.player.alive) {
        const h = this.player.halfExtent + p.halfExtent;
        if (Math.abs(this.player.x - p.x) < h && Math.abs(this.player.z - p.z) < h) {
          this._applyPowerUp(p.type);
          this._removeEntityMesh(p);
          this.powerUps.splice(i, 1);
        }
      }
    }
  }

  _applyPowerUp(type) {
    this.audio.powerupPick();
    this.ui.toastPowerUp(type);
    switch (type) {
      case 'grenade': {
        for (const e of this.enemies) {
          this.effects.explosion(this._worldPos(e.x, e.z), true);
          this._removeEntityMesh(e);
          this.score += e.stat.score;
          this.ui.spendEnemyIcon();
        }
        this.enemies.length = 0;
        this.ui.setScore(this.score);
        this.audio.explosionBig();
        break;
      }
      case 'helmet':
        this.player.invulnTimer = Math.max(this.player.invulnTimer, HELMET_DURATION);
        break;
      case 'shovel':
        this.grid.reinforceFort();
        this.shovelTimer = SHOVEL_DURATION;
        break;
      case 'clock':
        this.freezeTimer = CLOCK_FREEZE_DURATION;
        break;
      case 'tank':
        this.lives = Math.min(PLAYER_MAX_LIVES_DISPLAY, this.lives + 1);
        this.ui.setLives(this.lives);
        break;
      case 'star':
        this.player.upgradeWeapon(false);
        this.ui.setPower(this.player.weaponLevel);
        break;
      case 'gun':
        this.player.upgradeWeapon(true);
        this.ui.setPower(this.player.weaponLevel);
        break;
      default:
        break;
    }
  }

  // --------------------------------------------------------------- mesh

  _attachPlayerMesh() {
    const mesh = buildTankModel({ color: 0xffd84a, scale: 1 });
    this.scene.add(mesh);
    this.player.mesh = mesh;
  }

  _attachEnemyMesh(enemy) {
    const mesh = buildTankModel({ color: enemy.stat.color, scale: enemy.stat.scale || 1 });
    this.scene.add(mesh);
    enemy.mesh = mesh;
    this._syncTankMesh(enemy);
  }

  _attachBulletMesh(bullet, color) {
    const mesh = buildBulletMesh(color, bullet.direction);
    mesh.position.set(bullet.x - FIELD_HALF, 0.42, bullet.z - FIELD_HALF);
    this.scene.add(mesh);
    bullet.mesh = mesh;
  }

  _attachPowerUpMesh(p) {
    const mesh = buildPowerUpModel(p.type);
    mesh.position.set(p.x - FIELD_HALF, 0, p.z - FIELD_HALF);
    this.scene.add(mesh);
    p.mesh = mesh;
  }

  _setPlayerMeshVisible(v) {
    if (this.player && this.player.mesh) this.player.mesh.visible = v;
  }

  _removeEntityMesh(entity) {
    if (!entity.mesh) return;
    this.scene.remove(entity.mesh);
    entity.mesh.traverse((o) => {
      if (!o.isMesh) return;
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.map) m.map.dispose();
        m.dispose();
      }
    });
    entity.mesh = null;
  }

  _clearEnemies() {
    for (const e of this.enemies) this._removeEntityMesh(e);
    this.enemies.length = 0;
  }

  _clearBullets() {
    for (const b of this.bullets) this._removeEntityMesh(b);
    this.bullets.length = 0;
  }

  _clearPowerUps() {
    for (const p of this.powerUps) this._removeEntityMesh(p);
    this.powerUps.length = 0;
  }

  // ------------------------------------------------------------- render

  _syncTankMesh(tank) {
    if (!tank.mesh) return;
    tank.mesh.position.set(tank.x - FIELD_HALF, 0, tank.z - FIELD_HALF);
    const dv = DIRS[tank.direction];
    _lookVec.set(tank.mesh.position.x + dv.x, tank.mesh.position.y, tank.mesh.position.z + dv.z);
    tank.mesh.lookAt(_lookVec);

    tank.mesh.visible = tank.invulnTimer > 0 ? Math.floor(tank.invulnTimer * 12) % 2 === 0 : true;

    const mat = tank.mesh.userData.bodyMat;
    if (mat) {
      if (tank.flashTimer > 0) {
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 1.0;
      } else {
        mat.emissive.setHex(0x000000);
        mat.emissiveIntensity = 0;
      }
    }
  }

  _syncVisuals(dt) {
    const animating = this.state === 'playing' || this.state === 'intro' || this.state === 'levelClear';

    if (animating) {
      this.terrainView.update(dt);
      this.effects.update(dt);
    }

    if (this.player) this._syncTankMesh(this.player);
    for (const e of this.enemies) {
      this._syncTankMesh(e);
      if (this.freezeTimer > 0 && e.flashTimer <= 0 && e.mesh) {
        const mat = e.mesh.userData.bodyMat;
        if (mat) {
          mat.emissive.setHex(0x4fd6ff);
          mat.emissiveIntensity = 0.55;
        }
      }
    }

    if (animating) {
      for (const p of this.powerUps) {
        p.bobPhase = (p.bobPhase || 0) + dt * 3;
        if (!p.mesh) continue;
        p.mesh.rotation.y += dt * 1.6;
        p.mesh.position.y = Math.sin(p.bobPhase) * 0.08;
        const blinking = p.life < POWERUP_BLINK_AT;
        p.mesh.visible = !blinking || Math.floor(p.life * 8) % 2 === 0;
      }
    }

    const shakeOffset = animating ? this.effects.consumeShakeOffset(dt) : null;
    this.cameraRig.applyShake(shakeOffset);

    this.renderer.render(this.scene, this.cameraRig.camera);
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.cameraRig.resize(w, h);
  }
}
