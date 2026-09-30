import * as THREE from "three";
import { GRID_HEIGHT, GRID_WIDTH, type Direction, type GameEvent, type GameSnapshot, type Tank, type TileKind } from "../../game/simulation/types";

const directionYaw: Record<Direction, number> = {
  up: 0,
  right: -Math.PI / 2,
  down: Math.PI,
  left: Math.PI / 2,
};

interface FxItem {
  mesh: THREE.Mesh;
  age: number;
  duration: number;
}

export class RenderBridge {
  private readonly world = new THREE.Group();
  private readonly tiles = new THREE.Group();
  private readonly tanks = new THREE.Group();
  private readonly bullets = new THREE.Group();
  private readonly fx = new THREE.Group();
  private readonly tankObjects = new Map<string, THREE.Group>();
  private readonly bulletObjects = new Map<string, THREE.Mesh>();
  private readonly fxItems: FxItem[] = [];
  private tileVersion = -1;
  private elapsed = 0;

  private readonly geometries = {
    floor: new THREE.PlaneGeometry(GRID_WIDTH, GRID_HEIGHT),
    brick: new THREE.BoxGeometry(0.92, 0.58, 0.92),
    steel: new THREE.BoxGeometry(0.92, 0.74, 0.92),
    water: new THREE.PlaneGeometry(0.94, 0.94),
    ice: new THREE.PlaneGeometry(0.94, 0.94),
    forestTrunk: new THREE.CylinderGeometry(0.045, 0.055, 0.35, 6),
    forestTop: new THREE.ConeGeometry(0.28, 0.7, 7),
    bullet: new THREE.SphereGeometry(0.13, 12, 8),
    explosion: new THREE.SphereGeometry(0.4, 16, 10),
  };

  private readonly materials = {
    floor: new THREE.MeshStandardMaterial({ color: "#2f3c27", roughness: 0.88 }),
    brick: new THREE.MeshStandardMaterial({ color: "#9f5533", roughness: 0.78 }),
    brickDark: new THREE.MeshStandardMaterial({ color: "#63321f", roughness: 0.88 }),
    steel: new THREE.MeshStandardMaterial({ color: "#9ca69f", metalness: 0.28, roughness: 0.38 }),
    water: new THREE.MeshStandardMaterial({
      color: "#2f8ebf",
      emissive: "#08334b",
      transparent: true,
      opacity: 0.72,
      roughness: 0.22,
      metalness: 0.08,
    }),
    ice: new THREE.MeshStandardMaterial({
      color: "#bfe9e0",
      emissive: "#214d4a",
      transparent: true,
      opacity: 0.82,
      roughness: 0.12,
      metalness: 0.02,
    }),
    trunk: new THREE.MeshStandardMaterial({ color: "#4b3420", roughness: 0.95 }),
    leaves: new THREE.MeshStandardMaterial({ color: "#335f2d", transparent: true, opacity: 0.72, roughness: 0.9 }),
    base: new THREE.MeshStandardMaterial({ color: "#d9ba5f", roughness: 0.6, metalness: 0.08 }),
    baseRed: new THREE.MeshStandardMaterial({ color: "#9e3326", roughness: 0.68 }),
    bulletPlayer: new THREE.MeshStandardMaterial({ color: "#f7f4df", emissive: "#54d6a0", emissiveIntensity: 1.8 }),
    bulletEnemy: new THREE.MeshStandardMaterial({ color: "#ffe3a0", emissive: "#ef5b46", emissiveIntensity: 1.6 }),
    shield: new THREE.MeshBasicMaterial({ color: "#54d6a0", transparent: true, opacity: 0.32 }),
  };

  constructor(scene: THREE.Scene) {
    scene.add(this.world);
    this.world.add(this.tiles, this.tanks, this.bullets, this.fx);
    this.createGround();
  }

  sync(snapshot: GameSnapshot, events: GameEvent[]): void {
    if (snapshot.mapVersion !== this.tileVersion) {
      this.rebuildTiles(snapshot.tiles);
      this.tileVersion = snapshot.mapVersion;
    }

    this.syncTanks(snapshot.tanks);
    this.syncBullets(snapshot);
    for (const event of events) this.addFx(event);
  }

  update(dt: number): void {
    this.elapsed += dt;
    const waterMaterial = this.materials.water;
    waterMaterial.opacity = 0.64 + Math.sin(this.elapsed * 2.2) * 0.06;

    for (let i = this.fxItems.length - 1; i >= 0; i -= 1) {
      const item = this.fxItems[i];
      item.age += dt;
      const t = item.age / item.duration;
      item.mesh.scale.setScalar(0.45 + t * 1.8);
      const material = item.mesh.material as THREE.MeshBasicMaterial;
      material.opacity = Math.max(0, 0.85 * (1 - t));
      if (item.age >= item.duration) {
        this.fx.remove(item.mesh);
        material.dispose();
        this.fxItems.splice(i, 1);
      }
    }
  }

  private createGround(): void {
    const floor = new THREE.Mesh(this.geometries.floor, this.materials.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.025;
    floor.receiveShadow = true;
    this.world.add(floor);

    const grid = new THREE.GridHelper(GRID_WIDTH, GRID_WIDTH, "#69735e", "#3f4939");
    grid.position.y = 0.006;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.26;
    this.world.add(grid);
  }

  private rebuildTiles(tiles: TileKind[][]): void {
    clearGroup(this.tiles);
    for (let row = 0; row < tiles.length; row += 1) {
      for (let col = 0; col < tiles[row].length; col += 1) {
        const tile = tiles[row][col];
        if (tile === "empty") continue;
        const tileObject = this.createTile(tile, col, row);
        if (tileObject) this.tiles.add(tileObject);
      }
    }
  }

  private createTile(tile: TileKind, col: number, row: number): THREE.Object3D | null {
    const { x, z } = tileCenterToWorld(col + 0.5, row + 0.5);
    if (tile === "brick") {
      const group = new THREE.Group();
      group.position.set(x, 0.29, z);
      for (let index = 0; index < 4; index += 1) {
        const brick = new THREE.Mesh(this.geometries.brick, index % 2 ? this.materials.brickDark : this.materials.brick);
        brick.scale.set(0.48, 1, 0.22);
        brick.position.set(index < 2 ? -0.23 : 0.23, 0, index % 2 ? -0.22 : 0.22);
        brick.castShadow = true;
        brick.receiveShadow = true;
        group.add(brick);
      }
      return group;
    }

    if (tile === "steel") {
      const mesh = new THREE.Mesh(this.geometries.steel, this.materials.steel);
      mesh.position.set(x, 0.37, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    if (tile === "water" || tile === "ice") {
      const mesh = new THREE.Mesh(tile === "water" ? this.geometries.water : this.geometries.ice, tile === "water" ? this.materials.water : this.materials.ice);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.025, z);
      mesh.receiveShadow = true;
      return mesh;
    }

    if (tile === "forest") {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      group.renderOrder = 4;
      const offsets = [
        [-0.22, -0.2],
        [0.18, -0.12],
        [-0.04, 0.22],
      ];
      offsets.forEach(([ox, oz], index) => {
        const trunk = new THREE.Mesh(this.geometries.forestTrunk, this.materials.trunk);
        trunk.position.set(ox, 0.18, oz);
        const top = new THREE.Mesh(this.geometries.forestTop, this.materials.leaves);
        top.position.set(ox, 0.72 + index * 0.04, oz);
        top.castShadow = true;
        group.add(trunk, top);
      });
      return group;
    }

    if (tile === "base") {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.32, 0.86), this.materials.base);
      plinth.position.y = 0.16;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.5, 6), this.materials.baseRed);
      tower.position.y = 0.56;
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.18), this.materials.base);
      flag.position.set(0, 0.82, -0.08);
      group.add(plinth, tower, flag);
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      return group;
    }

    return null;
  }

  private syncTanks(tanks: Tank[]): void {
    const alive = new Set(tanks.map((tank) => tank.id));
    for (const [id, object] of this.tankObjects.entries()) {
      if (!alive.has(id)) {
        this.tanks.remove(object);
        this.tankObjects.delete(id);
      }
    }

    for (const tank of tanks) {
      let object = this.tankObjects.get(tank.id);
      if (!object) {
        object = createTankModel(tank, this.materials.shield);
        this.tanks.add(object);
        this.tankObjects.set(tank.id, object);
      }

      const { x, z } = tileCenterToWorld(tank.x, tank.y);
      object.position.set(x, 0, z);
      object.rotation.y = directionYaw[tank.dir];
      object.scale.setScalar(tank.invulnerable > 0 ? 1 + Math.sin(this.elapsed * 16) * 0.03 : 1);
      const shield = object.getObjectByName("shield");
      if (shield) shield.visible = tank.invulnerable > 0;
      const hurt = object.getObjectByName("hurt-core") as THREE.Mesh | undefined;
      if (hurt) hurt.visible = tank.hp < tank.maxHp;
    }
  }

  private syncBullets(snapshot: GameSnapshot): void {
    const alive = new Set(snapshot.bullets.map((bullet) => bullet.id));
    for (const [id, object] of this.bulletObjects.entries()) {
      if (!alive.has(id)) {
        this.bullets.remove(object);
        this.bulletObjects.delete(id);
      }
    }

    for (const bullet of snapshot.bullets) {
      let object = this.bulletObjects.get(bullet.id);
      if (!object) {
        object = new THREE.Mesh(
          this.geometries.bullet,
          bullet.ownerSide === "player" ? this.materials.bulletPlayer : this.materials.bulletEnemy,
        );
        object.castShadow = true;
        this.bullets.add(object);
        this.bulletObjects.set(bullet.id, object);
      }
      const { x, z } = tileCenterToWorld(bullet.x, bullet.y);
      object.position.set(x, 0.36, z);
    }
  }

  private addFx(event: GameEvent): void {
    const color = new THREE.Color(event.color ?? "#ffd36e");
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(this.geometries.explosion, material);
    const { x, z } = tileCenterToWorld(event.x, event.y);
    mesh.position.set(x, 0.42, z);
    this.fx.add(mesh);
    this.fxItems.push({ mesh, age: 0, duration: event.type === "spawn" ? 0.6 : 0.42 });
  }
}

function createTankModel(tank: Tank, shieldMaterial: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const palette = tank.side === "player" ? playerPalette() : enemyPalette(tank.type);

  const hullMaterial = new THREE.MeshStandardMaterial({ color: palette.hull, roughness: 0.58, metalness: 0.08 });
  const turretMaterial = new THREE.MeshStandardMaterial({ color: palette.turret, roughness: 0.48, metalness: 0.12 });
  const trackMaterial = new THREE.MeshStandardMaterial({ color: "#171812", roughness: 0.9 });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.28, 0.68), hullMaterial);
  hull.position.y = 0.28;
  const leftTrack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.76), trackMaterial);
  leftTrack.position.set(-0.38, 0.18, 0);
  const rightTrack = leftTrack.clone();
  rightTrack.position.x = 0.38;
  const turret = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.42), turretMaterial);
  turret.position.y = 0.54;
  const cannon = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.62), turretMaterial);
  cannon.position.set(0, 0.55, -0.48);
  const hurtCore = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), new THREE.MeshBasicMaterial({ color: "#ffd36e" }));
  hurtCore.name = "hurt-core";
  hurtCore.position.y = 0.72;
  hurtCore.visible = false;
  const shield = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.025, 8, 32), shieldMaterial);
  shield.name = "shield";
  shield.rotation.x = Math.PI / 2;
  shield.position.y = 0.1;

  group.add(hull, leftTrack, rightTrack, turret, cannon, hurtCore, shield);
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  return group;
}

function playerPalette(): { hull: string; turret: string } {
  return { hull: "#3ebf8e", turret: "#b9f0c8" };
}

function enemyPalette(type: Tank["type"]): { hull: string; turret: string } {
  if (type === "fast") return { hull: "#d8aa3c", turret: "#ffe27a" };
  if (type === "armor") return { hull: "#7f8790", turret: "#c5ccd1" };
  if (type === "power") return { hull: "#bf473a", turret: "#ff9981" };
  return { hull: "#a74332", turret: "#ee755f" };
}

function tileCenterToWorld(x: number, y: number): { x: number; z: number } {
  return {
    x: x - GRID_WIDTH / 2,
    z: y - GRID_HEIGHT / 2,
  };
}

function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    group.remove(group.children[0]);
  }
}
