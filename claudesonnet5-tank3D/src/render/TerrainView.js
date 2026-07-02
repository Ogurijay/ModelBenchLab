import * as THREE from 'three';
import { SUB, TERRAIN, FIELD_HALF, FIELD_WORLD } from '../core/constants.js';
import { brickTexture, steelTexture, waterTexture, iceTexture, groundTexture } from './TextureFactory.js';

const TYPE_KEY = {
  [TERRAIN.BRICK]: 'brick',
  [TERRAIN.STEEL]: 'steel',
  [TERRAIN.WATER]: 'water',
  [TERRAIN.TREE]: 'tree',
  [TERRAIN.ICE]: 'ice',
};

const HEIGHT_Y = { brick: 0.45, steel: 0.48, water: 0.03, ice: 0.02, tree: 0.42 };
const MAX_INSTANCES = SUB * SUB;

function hash2(x, z) {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

export class TerrainView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.meshes = {};
    this._scratch = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._pos = new THREE.Vector3();
    this._scale = new THREE.Vector3(1, 1, 1);
    this._euler = new THREE.Euler();

    this._buildInstancedMeshes();
    this._buildGround();
    this._buildBorder();
  }

  _buildInstancedMeshes() {
    const defs = {
      brick: { geo: new THREE.BoxGeometry(0.98, 0.9, 0.98), mat: new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.88 }) },
      steel: { geo: new THREE.BoxGeometry(0.98, 0.96, 0.98), mat: new THREE.MeshStandardMaterial({ map: steelTexture(), roughness: 0.4, metalness: 0.6 }) },
      water: { geo: new THREE.BoxGeometry(1, 0.06, 1), mat: new THREE.MeshStandardMaterial({ map: waterTexture(), roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }) },
      ice: { geo: new THREE.BoxGeometry(1, 0.04, 1), mat: new THREE.MeshStandardMaterial({ map: iceTexture(), roughness: 0.1, metalness: 0.05 }) },
      tree: { geo: new THREE.IcosahedronGeometry(0.56, 0), mat: new THREE.MeshStandardMaterial({ color: 0x2f6b3a, roughness: 0.95, transparent: true, opacity: 0.85 }) },
    };
    for (const key of Object.keys(defs)) {
      const { geo, mat } = defs[key];
      const mesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES);
      mesh.count = 0;
      mesh.castShadow = key !== 'water' && key !== 'ice';
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.meshes[key] = mesh;
    }
  }

  _buildGround() {
    const tex = groundTexture();
    tex.repeat.set(13, 13);
    const geo = new THREE.PlaneGeometry(FIELD_WORLD + 14, FIELD_WORLD + 14);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  _buildBorder() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2e3d, roughness: 0.7, metalness: 0.2, emissive: 0x11141f, emissiveIntensity: 0.5 });
    const thick = 0.6;
    const half = FIELD_HALF + thick / 2;
    const specs = [
      { w: FIELD_WORLD + thick * 2, d: thick, x: 0, z: -half },
      { w: FIELD_WORLD + thick * 2, d: thick, x: 0, z: half },
      { w: thick, d: FIELD_WORLD, x: -half, z: 0 },
      { w: thick, d: FIELD_WORLD, x: half, z: 0 },
    ];
    for (const s of specs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, 0.5, s.d), mat);
      m.position.set(s.x, 0.2, s.z);
      m.receiveShadow = true;
      m.castShadow = true;
      this.group.add(m);
    }
  }

  rebuild(grid) {
    const counts = { brick: 0, steel: 0, water: 0, tree: 0, ice: 0 };
    for (let cz = 0; cz < SUB; cz++) {
      for (let cx = 0; cx < SUB; cx++) {
        const t = grid.getType(cx, cz);
        const key = TYPE_KEY[t];
        if (!key) continue;
        const i = counts[key]++;
        const wx = cx + 0.5 - FIELD_HALF;
        const wz = cz + 0.5 - FIELD_HALF;
        this._pos.set(wx, HEIGHT_Y[key], wz);
        if (key === 'tree') {
          const h = hash2(cx, cz);
          this._euler.set(0, h * Math.PI * 2, 0);
          this._quat.setFromEuler(this._euler);
          const s = 0.85 + h * 0.35;
          this._scale.set(s, s, s);
        } else {
          this._quat.identity();
          this._scale.set(1, 1, 1);
        }
        this._scratch.compose(this._pos, this._quat, this._scale);
        this.meshes[key].setMatrixAt(i, this._scratch);
      }
    }
    for (const key of Object.keys(this.meshes)) {
      this.meshes[key].count = counts[key];
      this.meshes[key].instanceMatrix.needsUpdate = true;
    }
  }

  update(dt) {
    this.meshes.water.material.map.offset.x = (this.meshes.water.material.map.offset.x + dt * 0.04) % 1;
    this.meshes.water.material.map.offset.y = (this.meshes.water.material.map.offset.y + dt * 0.015) % 1;
  }
}
