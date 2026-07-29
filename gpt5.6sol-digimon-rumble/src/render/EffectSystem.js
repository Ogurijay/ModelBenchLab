import * as THREE from 'three';

export const DEFAULT_FIGHTER_COLORS = Object.freeze([0xff9a24, 0x5de8ff, 0xd46bff, 0x7dff79]);
const HAZARD_COLORS = { pulse: 0x29dcff, lava: 0xff4a16, laser: 0xff3158, rocks: 0xffce67, void: 0xb24cff };

const basic = (color, opacity = 1, extras = {}) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false, depthWrite: opacity >= 1, ...extras });

export class EffectSystem {
  constructor(scene, { fighterColors } = {}) {
    this.scene = scene;
    this.effects = [];
    this.projectiles = [];
    this.particleGeometries = new Map();
    this.colors = new Map();
    this.setFighterColors(fighterColors || DEFAULT_FIGHTER_COLORS);
    this.pickup = this.createPickup();
    this.pickup.visible = false;
    scene.add(this.pickup);
  }

  setFighterColors(colors) {
    this.colors.clear();
    DEFAULT_FIGHTER_COLORS.forEach((color, index) => this.colors.set(`p${index + 1}`, color));
    this.colors.set('player', DEFAULT_FIGHTER_COLORS[0]);
    this.colors.set('enemy', DEFAULT_FIGHTER_COLORS[1]);
    if (Array.isArray(colors)) colors.slice(0, 4).forEach((entry, index) => this.colors.set(entry?.id || `p${index + 1}`, entry?.color ?? entry));
    else for (const [id, color] of Object.entries(colors || {})) this.colors.set(id, color);
    return this;
  }

  colorFor(value, fallback = DEFAULT_FIGHTER_COLORS[0]) {
    if (typeof value === 'number') return value;
    return this.colors.get(value) ?? fallback;
  }

  eventColor(event) {
    return event.color ?? this.colorFor(event.fighter ?? event.owner ?? event.attacker, 0xffffff);
  }

  createPickup() {
    const group = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), basic(0x85ffdc));
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.74, 1), basic(0x2dffd0, 0.24, { wireframe: true, depthWrite: false }));
    group.add(core, shell);
    group.userData = { core, shell };
    return group;
  }

  particleGeometry(scale) {
    const key = scale.toFixed(3);
    if (!this.particleGeometries.has(key)) this.particleGeometries.set(key, new THREE.IcosahedronGeometry(scale, 0));
    return this.particleGeometries.get(key);
  }

  burst(position, color, count = 12, scale = 0.11, speed = 4, life = 0.8) {
    const geometry = this.particleGeometry(scale);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, basic(color, 1));
      const angle = i * 2.39996;
      const y = ((i * 7) % 11) / 10;
      const radial = Math.sqrt(1 - Math.min(0.99, y * y));
      mesh.position.copy(position);
      this.scene.add(mesh);
      this.effects.push({ kind: 'particle', mesh, vx: Math.cos(angle) * radial * speed, vy: (y + 0.15) * speed, vz: Math.sin(angle) * radial * speed, life: life * (0.72 + (i % 4) * 0.09), max: life });
    }
  }

  ring(position, color, maxScale = 4, life = 0.55, vertical = false) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 36), basic(color, 0.9, { side: THREE.DoubleSide, depthWrite: false }));
    mesh.rotation.x = vertical ? 0 : -Math.PI / 2;
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.effects.push({ kind: 'ring', mesh, life, max: life, maxScale, ownGeometry: true });
  }

  column(position, color, height = 7, radius = 0.8, life = 0.75) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.25, radius, height, 24, 1, true), basic(color, 0.48, { side: THREE.DoubleSide, depthWrite: false }));
    mesh.position.copy(position); mesh.position.y += height / 2;
    this.scene.add(mesh);
    this.effects.push({ kind: 'column', mesh, life, max: life, ownGeometry: true });
  }

  beam(position, color, length = 18, life = 0.35) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 0.22), basic(color, 0.78, { depthWrite: false }));
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.effects.push({ kind: 'beam', mesh, life, max: life, ownGeometry: true });
  }

  handle(event) {
    const position = new THREE.Vector3(event.x ?? 0, event.y ?? 0.1, event.z ?? 0);
    const color = this.eventColor(event);
    if (event.type === 'hit') {
      this.burst(position, color, 18, 0.1, 6); this.ring(position, 0xffffff, 3.4);
    } else if (event.type === 'projectileHit' || event.type === 'projectileEnd') {
      this.burst(position, color, event.type === 'projectileHit' ? 28 : 12, 0.13, 7); this.ring(position, color, 4.5);
    } else if (['overdrive', 'evolve', 'evolution', 'devolution'].includes(event.type)) {
      this.column(position, color, 8, 1.2, 0.9); this.burst(position, color, 44, 0.12, 8, 1); this.ring(position, 0xfff27a, 8, 0.8);
    } else if (event.type === 'ultra') {
      this.column(position, 0xffffff, 10, 1.8, 1.1); this.burst(position, color, 64, 0.15, 11, 1.2); this.ring(position, color, 14, 1);
    } else if (event.type === 'ko') {
      this.burst(position, color, 38, 0.15, 9, 1.15); this.ring(position, 0x1a0d25, 10, 0.9); this.ring(position, 0xffffff, 6, 0.65, true);
    } else if (event.type === 'respawn') {
      this.column(position, color, 6, 0.65, 0.7); this.ring(position, color, 5, 0.65); this.burst(position, 0xffffff, 20, 0.07, 4, 0.65);
    } else if (event.type === 'hazard') {
      const hazardColor = HAZARD_COLORS[event.hazard || event.hazardType] || event.color || 0xff395d;
      if ((event.hazard || event.hazardType) === 'laser') this.beam(position, hazardColor, event.length || 20);
      else { this.ring(position, hazardColor, event.radius || 7, 0.7); this.burst(position, hazardColor, 24, 0.11, 6); }
    } else if (['item', 'itemSpawn', 'itemPickup', 'pickup'].includes(event.type)) {
      const itemColor = event.color || 0x4dffd2;
      this.ring(position.setY(event.y ?? 0.05), itemColor, event.type === 'itemSpawn' ? 3 : 5);
      if (event.type !== 'itemSpawn') this.burst(position.setY(event.y ?? 1), itemColor, 24, 0.09, 5);
    } else if (event.type === 'dodge') this.ring(position.setY(0.06), 0xb1f7ff, 2.2);
    else if (event.type === 'land') this.ring(position.setY(0.04), color, 1.8);
  }

  syncProjectiles(projectiles = []) {
    while (this.projectiles.length < projectiles.length) {
      const group = new THREE.Group();
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 2), basic(0xffffff));
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), basic(0xff7427, 0.42, { wireframe: true, depthWrite: false }));
      group.add(core, shell); group.userData = { core, shell };
      this.scene.add(group); this.projectiles.push(group);
    }
    this.projectiles.forEach((group, index) => {
      const projectile = projectiles[index];
      group.visible = Boolean(projectile);
      if (!projectile) return;
      group.position.set(projectile.x, projectile.y, projectile.z);
      const color = this.colorFor(projectile.owner, projectile.color || DEFAULT_FIGHTER_COLORS[index % 4]);
      group.userData.shell.material.color.setHex(color);
      group.userData.core.material.color.setHex(projectile.coreColor || 0xffffff);
      group.rotation.x += 0.08; group.rotation.y += 0.14;
    });
  }

  syncPickup(pickup, time) {
    this.pickup.visible = Boolean(pickup);
    if (!pickup) return;
    this.pickup.position.set(pickup.x, pickup.y ?? 1.05 + Math.sin(time * 3) * 0.18, pickup.z);
    this.pickup.rotation.y = time * 1.8;
    this.pickup.userData.shell.rotation.x = time;
    this.pickup.userData.core.scale.setScalar(0.9 + Math.sin(time * 5) * 0.12);
    if (pickup.color) this.pickup.userData.core.material.color.set(pickup.color);
  }

  update(dt) {
    const alive = [];
    for (const effect of this.effects) {
      effect.life -= dt;
      const progress = 1 - effect.life / effect.max;
      if (effect.kind === 'particle') {
        effect.vy -= 9 * dt;
        effect.mesh.position.x += effect.vx * dt; effect.mesh.position.y += effect.vy * dt; effect.mesh.position.z += effect.vz * dt;
        effect.mesh.rotation.x += dt * 8;
      } else if (effect.kind === 'ring') effect.mesh.scale.setScalar(1 + progress * effect.maxScale);
      else if (effect.kind === 'column') effect.mesh.scale.set(1 + progress * 1.4, 1, 1 + progress * 1.4);
      else if (effect.kind === 'beam') effect.mesh.scale.z = 1 + Math.sin(progress * Math.PI) * 2;
      effect.mesh.material.opacity = Math.max(0, (1 - progress) * (effect.kind === 'particle' ? 1 : 0.9));
      if (effect.life > 0) alive.push(effect);
      else {
        this.scene.remove(effect.mesh); effect.mesh.material.dispose();
        if (effect.ownGeometry) effect.mesh.geometry.dispose();
      }
    }
    this.effects = alive;
  }

  dispose() {
    for (const effect of this.effects) { this.scene.remove(effect.mesh); effect.mesh.material.dispose(); if (effect.ownGeometry) effect.mesh.geometry.dispose(); }
    this.effects = [];
    this.particleGeometries.forEach(geometry => geometry.dispose()); this.particleGeometries.clear();
    for (const group of this.projectiles) {
      this.scene.remove(group);
      group.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
    }
    this.projectiles = [];
    this.scene.remove(this.pickup);
    this.pickup.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  }
}
