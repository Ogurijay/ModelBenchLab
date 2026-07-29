import * as THREE from 'three';

const PRESETS = {
  terminal: { id: 'terminal', hazard: 'pulse', colors: { sky: 0x030814, fog: 0x04101e, floor: 0x162c45, primary: 0x16d9ff, secondary: 0xff6a20 } },
  volcano: { id: 'volcano', hazard: 'lava', colors: { sky: 0x130405, fog: 0x2b0804, floor: 0x3a1815, primary: 0xff6428, secondary: 0xffd34b } },
  factory: { id: 'factory', hazard: 'laser', colors: { sky: 0x07100f, fog: 0x0b1717, floor: 0x26312d, primary: 0x7dff9b, secondary: 0xf5cc4e } },
  jungle: { id: 'jungle', hazard: 'rocks', colors: { sky: 0x071009, fog: 0x102516, floor: 0x243929, primary: 0x80d66c, secondary: 0xf0b95b } },
  'dark-area': { id: 'dark-area', hazard: 'void', colors: { sky: 0x020106, fog: 0x10051c, floor: 0x171126, primary: 0xb95cff, secondary: 0xff385c } },
};

const standard = (color, emissive = 0, intensity = 0, extras = {}) => new THREE.MeshStandardMaterial({
  color, emissive, emissiveIntensity: intensity, roughness: 0.68, metalness: 0.2, ...extras,
});
const glow = (color, opacity = 0.7) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });

function disposeGroup(group) {
  const geometry = new Set(), material = new Set();
  group.traverse(object => {
    if (object.geometry) geometry.add(object.geometry);
    for (const value of (Array.isArray(object.material) ? object.material : [object.material])) if (value) material.add(value);
  });
  geometry.forEach(value => value.dispose());
  material.forEach(value => value.dispose());
  group.clear();
}

export class Arena {
  constructor(scene, definition = 'terminal') {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Shared 2.5D Arena';
    this.scene.add(this.group);
    this.bounds = { minX: -10.8, maxX: 10.8, minZ: -3.5, maxZ: 3.5 };
    this.definition = null;
    this.pulsers = [];
    this.floaters = [];
    this.rotators = [];
    this.hazardVisuals = [];
    this.hazardState = null;
    this.setArena(definition);
  }

  mesh(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], parent = this.group) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.rotation.set(...rotation);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }

  setArena(definition = 'terminal') {
    const requested = typeof definition === 'string' ? { id: definition } : (definition || {});
    const id = PRESETS[requested.id] ? requested.id : 'terminal';
    const preset = PRESETS[id];
    this.definition = { ...preset, ...requested, colors: { ...preset.colors, ...(requested.colors || {}) } };
    disposeGroup(this.group);
    this.pulsers = []; this.floaters = []; this.rotators = []; this.hazardVisuals = [];
    this.group.userData = { arenaId: id, hazard: this.definition.hazard, perspective: 'shared-side-view-2.5d' };
    this.scene.background = new THREE.Color(this.definition.colors.sky);
    if (this.scene.fog) this.scene.fog.color.setHex(this.definition.colors.fog);
    this.buildPlatform();
    this[`build${id === 'dark-area' ? 'DarkArea' : id[0].toUpperCase() + id.slice(1)}`]();
    this.buildHazard(this.definition.hazard);
    this.buildSky();
    return this;
  }

  buildPlatform() {
    const { floor, primary, secondary } = this.definition.colors;
    this.mesh(new THREE.BoxGeometry(23, 1.05, 8.2), standard(0x111722, primary, 0.28), [0, -0.58, 0]);
    this.mesh(new THREE.BoxGeometry(22, 0.12, 7.35), standard(floor, primary, 0.42), [0, 0, 0]);
    for (const z of [-3.58, 3.58]) this.mesh(new THREE.BoxGeometry(22.2, 0.16, 0.09), glow(primary, 0.8), [0, 0.11, z]);
    for (const x of [-10.9, 10.9]) this.mesh(new THREE.BoxGeometry(0.12, 0.16, 7.25), glow(secondary, 0.75), [x, 0.11, 0]);
    for (let x = -9; x <= 9; x += 3) this.mesh(new THREE.BoxGeometry(0.025, 0.015, 6.7), glow(primary, 0.12), [x, 0.075, 0]);
    this.mesh(new THREE.BoxGeometry(21.5, 0.018, 0.025), glow(primary, 0.22), [0, 0.08, 0]);
  }

  buildTerminal() {
    const { primary, secondary } = this.definition.colors;
    for (let i = -5; i <= 5; i++) {
      const tile = this.mesh(new THREE.BoxGeometry(1.35, 0.045, 0.7), standard(i % 2 ? 0x123451 : 0x362419, i % 2 ? primary : secondary, 1.2), [i * 1.85, 0.1, i % 2 ? 2.35 : -2.35]);
      this.pulsers.push({ object: tile, base: 0.75, phase: i * 0.7, speed: 1.8 });
    }
    for (const x of [-9, -6.5, 6.5, 9]) {
      const tower = this.mesh(new THREE.BoxGeometry(0.55, 4.5 + Math.abs(x) * 0.12, 0.55), standard(0x153d62, primary, 1.1), [x, 2.2, -5]);
      this.floaters.push({ object: tower, origin: tower.position.y, phase: x, speed: 0.55, amount: 0.25 });
    }
  }

  buildVolcano() {
    const { primary, secondary } = this.definition.colors;
    this.mesh(new THREE.PlaneGeometry(34, 18), glow(primary, 0.72), [0, -1.18, -1], [-Math.PI / 2, 0, 0]);
    for (let i = 0; i < 11; i++) {
      const x = -10 + i * 2;
      const rock = this.mesh(new THREE.DodecahedronGeometry(0.75 + (i % 3) * 0.3, 0), standard(0x251514, primary, 0.35), [x, 0.45 + (i % 2) * 0.25, -4.4 - (i % 3)]);
      rock.scale.y = 1.8 + (i % 4) * 0.45;
    }
    for (let i = -4; i <= 4; i++) {
      const crack = this.mesh(new THREE.BoxGeometry(1.5, 0.02, 0.08), glow(i % 2 ? primary : secondary, 0.72), [i * 2.1, 0.09, (i % 3 - 1) * 1.35], [0, i * 0.33, 0]);
      this.pulsers.push({ object: crack, base: 0.62, phase: i, speed: 4 });
    }
  }

  buildFactory() {
    const { primary, secondary } = this.definition.colors;
    for (const z of [-2.55, 2.55]) {
      for (let x = -9; x <= 9; x += 3) this.mesh(new THREE.BoxGeometry(2.4, 0.06, 0.55), standard(0x303a37, x % 2 ? primary : secondary, 0.75), [x, 0.11, z]);
    }
    for (const x of [-8, -4, 4, 8]) {
      const gear = this.mesh(new THREE.TorusGeometry(1.05, 0.22, 8, 16), standard(0x46504d, secondary, 0.55), [x, 2.2 + (x % 3), -5.4], [Math.PI / 2, 0, 0]);
      this.rotators.push({ object: gear, speed: x < 0 ? 0.35 : -0.35 });
    }
    for (const x of [-10, 10]) this.mesh(new THREE.BoxGeometry(1.1, 5.5, 1.1), standard(0x202b29, primary, 0.8), [x, 2.3, -4.4]);
  }

  buildJungle() {
    const { primary, secondary } = this.definition.colors;
    for (const x of [-9, -6, 6, 9]) {
      this.mesh(new THREE.CylinderGeometry(0.55, 0.72, 5.5 + (Math.abs(x) % 4), 8), standard(0x3b4432, primary, 0.3), [x, 2.45, -4.7]);
      const vine = this.mesh(new THREE.TorusGeometry(0.75, 0.09, 6, 18), standard(0x315a2b, primary, 0.25), [x, 2.8, -4.05], [Math.PI / 2, 0, 0]);
      this.rotators.push({ object: vine, speed: 0.08 * Math.sign(x) });
    }
    for (let i = -4; i <= 4; i++) {
      const slab = this.mesh(new THREE.BoxGeometry(1.7, 0.1, 0.8), standard(i % 2 ? 0x46513c : 0x5b543c, secondary, 0.16), [i * 2.3, 0.1, i % 2 ? 2.45 : -2.45], [0, i * 0.08, 0]);
      slab.scale.y = 0.65 + (i % 3) * 0.1;
    }
  }

  buildDarkArea() {
    const { primary, secondary } = this.definition.colors;
    for (let i = 0; i < 12; i++) {
      const angle = i * Math.PI / 6;
      const chunk = this.mesh(new THREE.BoxGeometry(2.2, 0.42, 1.8), standard(0x18112b, i % 2 ? primary : secondary, 0.7), [Math.cos(angle) * 13, 1.2 + (i % 3), Math.sin(angle) * 7 - 3], [i * 0.08, angle, i * 0.11]);
      this.floaters.push({ object: chunk, origin: chunk.position.y, phase: i, speed: 0.4, amount: 0.65 });
    }
    const portal = this.mesh(new THREE.TorusGeometry(3.3, 0.3, 12, 48), glow(primary, 0.72), [0, 5.3, -8]);
    this.rotators.push({ object: portal, speed: 0.22 });
    for (const x of [-9, -6, 6, 9]) this.mesh(new THREE.ConeGeometry(0.65, 3.6, 5), standard(0x31184d, primary, 1.4), [x, 1.5, -4.4], [0, x, Math.PI]);
  }

  buildHazard(type) {
    const { primary, secondary } = this.definition.colors;
    const add = (object, kind, data = {}) => { object.userData.hazardWarning = type; this.hazardVisuals.push({ object, kind, ...data }); return object; };
    if (type === 'pulse') {
      add(this.mesh(new THREE.RingGeometry(0.6, 0.78, 64), glow(primary, 0.8), [0, 0.13, 0], [-Math.PI / 2, 0, 0]), 'pulse');
    } else if (type === 'lava') {
      for (const side of [-1, 1]) add(this.mesh(new THREE.PlaneGeometry(10.5, 6.8), glow(0xff3c0a, 0.12), [side * 5.3, 0.14, 0], [-Math.PI / 2, 0, 0]), 'zone', { phase: side < 0 ? 0 : Math.PI });
    } else if (type === 'laser') {
      add(this.mesh(new THREE.BoxGeometry(21.5, 0.035, 0.18), glow(0xff334f, 0.3), [0, 0.22, 0]), 'laser');
      for (const x of [-10.3, 10.3]) add(this.mesh(new THREE.BoxGeometry(0.35, 3.2, 0.35), glow(secondary, 0.35), [x, 1.6, 0]), 'beacon');
    } else if (type === 'rocks') {
      [-6, 0, 6].forEach((x, index) => {
        add(this.mesh(new THREE.RingGeometry(0.75, 0.92, 32), glow(0xffca59, 0.25), [x, 0.14, index % 2 ? -1.4 : 1.3], [-Math.PI / 2, 0, 0]), 'target', { phase: index * 1.2 });
      });
    } else if (type === 'void') {
      for (const side of [-1, 1]) add(this.mesh(new THREE.PlaneGeometry(4.3, 6.9), glow(primary, 0.16), [side * 8.8, 0.14, 0], [-Math.PI / 2, 0, 0]), 'void', { phase: side });
    }
  }

  buildSky() {
    const points = [];
    for (let i = 0; i < 150; i++) {
      const x = -28 + (i * 17.17) % 56, y = 3 + (i * 7.31) % 18, z = -12 - (i * 3.7) % 18;
      points.push(x, y, z, x, y + 0.4 + (i % 4) * 0.35, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    this.dataSky = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: this.definition.colors.primary, transparent: true, opacity: 0.22 }));
    this.group.add(this.dataSky);
  }

  setHazardWarning(state) {
    this.hazardState = state === false ? { active: false, progress: 0 } : (state || null);
    return this;
  }

  getPlatformBounds() { return { ...this.bounds }; }

  update(time, hazardState) {
    if (hazardState !== undefined) this.setHazardWarning(hazardState);
    for (const item of this.pulsers) item.object.material.emissiveIntensity = item.base + Math.sin(time * item.speed + item.phase) * 0.25;
    for (const item of this.floaters) item.object.position.y = item.origin + Math.sin(time * item.speed + item.phase) * item.amount;
    for (const item of this.rotators) item.object.rotation.z += item.speed * 0.016;
    if (this.dataSky) this.dataSky.position.x = Math.sin(time * 0.08) * 1.2;

    const auto = (time % 6) / 6;
    const progress = THREE.MathUtils.clamp(this.hazardState?.progress ?? auto, 0, 1);
    const active = this.hazardState?.active ?? progress > 0.58;
    for (const item of this.hazardVisuals) {
      const pulse = 0.5 + Math.sin(time * 8 + (item.phase || 0)) * 0.5;
      item.object.visible = active || progress > 0.25;
      item.object.material.opacity = active ? 0.42 + pulse * 0.42 : 0.08 + progress * 0.24;
      if (item.kind === 'pulse') item.object.scale.setScalar(1 + progress * 13);
      if (item.kind === 'laser') item.object.position.z = -2.8 + progress * 5.6;
      if (item.kind === 'target') item.object.scale.setScalar(0.8 + pulse * 0.45);
      if (item.kind === 'void') item.object.scale.x = 0.75 + progress * 0.45;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    disposeGroup(this.group);
    this.hazardVisuals = []; this.pulsers = []; this.floaters = []; this.rotators = [];
  }
}
