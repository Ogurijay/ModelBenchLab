// 道具:近战武器 / 冰冻枪 / 炸弹 / 可推动物件,以及冰弹投射物。
// 武器局部坐标:握把在 +Y 端,武器头朝 -Y;装备时用固定关节把握点焊到手掌,武器朝向与前臂一致。
import * as THREE from 'three';
import { RAPIER, GROUPS, G, groups } from './physics.js';
import { DIM } from './animals.js';

const std = (color, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

function stripeTex(c1, c2) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = c2; g.lineWidth = 12;
  g.beginPath();
  for (let a = 0; a < Math.PI * 7; a += 0.05) { const r = a * 2.9; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
  g.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const ITEM_DEFS = {
  bat: {
    name: '球棒', weapon: true, mass: 0.9, grip: 0.34, dmg: 27, imp: 42, rag: 0.7, hitR: 0.18, wind: 0.16, strike: 0.17, sound: 'bat',
    hit: [[0, -0.38, 0], [0, -0.12, 0]],
    collider: () => [RAPIER.ColliderDesc.capsule(0.32, 0.06)],
    mesh() {
      const g = new THREE.Group();
      const geo = new THREE.CylinderGeometry(0.07, 0.03, 0.86, 14); // 顶细底粗:翻转使粗端在 -Y
      geo.rotateX(Math.PI);
      g.add(shadow(new THREE.Mesh(geo, std('#c98c4f', 0.55))));
      const tape = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.18, 12), std('#2b2b30', 0.8)));
      tape.position.y = 0.32; g.add(tape);
      return g;
    },
  },
  pan: {
    name: '平底锅', weapon: true, mass: 1.0, grip: 0.3, dmg: 30, imp: 36, rag: 0.65, hitR: 0.24, wind: 0.15, strike: 0.17, sound: 'pan',
    hit: [[0, -0.2, 0]],
    collider: () => [RAPIER.ColliderDesc.cuboid(0.03, 0.17, 0.03).setTranslation(0, 0.2, 0), RAPIER.ColliderDesc.cylinder(0.03, 0.19).setTranslation(0, -0.2, 0).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })],
    mesh() {
      const g = new THREE.Group();
      const handle = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.36, 10), std('#3a2b22', 0.6)));
      handle.position.y = 0.19; g.add(handle);
      const pan = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.06, 28, 1, true), std('#26272b', 0.35, 0.8)));
      pan.material.side = THREE.DoubleSide;
      pan.rotation.x = Math.PI / 2; pan.position.y = -0.2; g.add(pan);
      const base = shadow(new THREE.Mesh(new THREE.CircleGeometry(0.17, 28), std('#1d1e22', 0.3, 0.85)));
      base.material.side = THREE.DoubleSide;
      base.position.set(0, -0.2, -0.03); g.add(base);
      return g;
    },
  },
  hammer: {
    name: '大锤', weapon: true, heavy: true, mass: 2.4, grip: 0.36, dmg: 50, imp: 70, rag: 1.3, hitR: 0.26, wind: 0.32, strike: 0.2, sound: 'hammer',
    hit: [[0, -0.34, 0]],
    collider: () => [RAPIER.ColliderDesc.capsule(0.3, 0.035).setTranslation(0, 0.05, 0), RAPIER.ColliderDesc.cuboid(0.17, 0.1, 0.1).setTranslation(0, -0.34, 0)],
    mesh() {
      const g = new THREE.Group();
      const handle = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.74, 10), std('#b07a45', 0.6)));
      handle.position.y = 0.05; g.add(handle);
      const head = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), std('#e04a4a', 0.4)));
      head.position.y = -0.34; g.add(head);
      for (const s of [-1, 1]) {
        const cap = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.04, 18), std('#d9d9de', 0.3, 0.6)));
        cap.rotation.z = Math.PI / 2; cap.position.set(s * 0.18, -0.34, 0); g.add(cap);
      }
      return g;
    },
  },
  lollipop: {
    name: '棒棒糖', weapon: true, mass: 0.6, grip: 0.3, dmg: 17, imp: 30, rag: 0.4, hitR: 0.22, wind: 0.09, strike: 0.13, sound: 'bounce',
    hit: [[0, -0.28, 0]],
    collider: () => [RAPIER.ColliderDesc.capsule(0.2, 0.025).setTranslation(0, 0.12, 0), RAPIER.ColliderDesc.cylinder(0.03, 0.2).setTranslation(0, -0.28, 0).setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 })],
    mesh() {
      const g = new THREE.Group();
      const stick = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 8), std('#fafafa', 0.5)));
      stick.position.y = 0.12; g.add(stick);
      const candy = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 32), [std('#ff6fae', 0.25), new THREE.MeshStandardMaterial({ map: stripeTex('#ff6fae', '#fff2f8'), roughness: 0.25 }), new THREE.MeshStandardMaterial({ map: stripeTex('#ff6fae', '#fff2f8'), roughness: 0.25 })]));
      candy.rotation.x = Math.PI / 2; candy.position.y = -0.28; g.add(candy);
      return g;
    },
  },
  icegun: {
    name: '冰冻枪', weapon: true, gun: true, mass: 1.0, grip: 0.12, ammo: 5, cooldown: 0.55, dmg: 0, imp: 4, rag: 0, hitR: 0.12, sound: 'iceShot',
    hit: [],
    collider: () => [RAPIER.ColliderDesc.cuboid(0.07, 0.2, 0.09)],
    mesh() {
      const g = new THREE.Group();
      const body = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.32, 0.17), std('#5fc3ff', 0.35)));
      g.add(body);
      const tank = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshStandardMaterial({ color: '#cff4ff', roughness: 0.1, transparent: true, opacity: 0.8, emissive: '#5fd8ff', emissiveIntensity: 0.4 })));
      tank.position.set(0, 0.04, 0.12); g.add(tank);
      const barrel = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.18, 12), std('#e8f7ff', 0.3, 0.3)));
      barrel.position.y = -0.24; g.add(barrel);
      const grip = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.16), std('#2f6f9d', 0.5)));
      grip.position.set(0, 0.16, -0.06); g.add(grip);
      return g;
    },
  },
  bomb: {
    name: '炸弹', throwable: true, mass: 1.5, fuse: 3.2, grip: 0.26,
    collider: () => [RAPIER.ColliderDesc.ball(0.22).setRestitution(0.3)],
    mesh() {
      const g = new THREE.Group();
      g.add(shadow(new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 18), std('#25262b', 0.35, 0.3))));
      const cap = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.07, 12), std('#8a8d96', 0.4, 0.6)));
      cap.position.y = 0.22; g.add(cap);
      const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), std('#d8c3a0', 0.9));
      fuse.position.set(0.02, 0.3, 0); fuse.rotation.z = -0.4; g.add(fuse);
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd35a' }));
      spark.position.set(0.05, 0.36, 0); spark.visible = false; g.add(spark);
      g.userData.spark = spark;
      return g;
    },
  },
  crate: {
    name: '木箱', prop: true, mass: 7,
    collider: () => [RAPIER.ColliderDesc.cuboid(0.35, 0.35, 0.35)],
    mesh() {
      const g = new THREE.Group();
      g.add(shadow(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), std('#c48a4a', 0.8))));
      const edge = std('#8a5a2b', 0.8);
      for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const e = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), edge)); e.position.set(x * 0.32, 0, z * 0.32); g.add(e);
      }
      const d = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.72), edge)); g.add(d);
      return g;
    },
  },
  barrel: {
    name: '油桶', prop: true, mass: 9,
    collider: () => [RAPIER.ColliderDesc.cylinder(0.42, 0.3)],
    mesh() {
      const g = new THREE.Group();
      g.add(shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.84, 22), std('#2f7fd8', 0.45, 0.3))));
      for (const y of [-0.28, 0.28]) {
        const r = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.305, 0.02, 6, 24), std('#1f5aa3', 0.4, 0.5)));
        r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r);
      }
      return g;
    },
  },
  ball: {
    name: '沙滩球', prop: true, mass: 0.7, bouncy: true,
    collider: () => [RAPIER.ColliderDesc.ball(0.42).setRestitution(0.75)],
    mesh() {
      const g = new THREE.Group();
      const cols = ['#ff4d4d', '#ffffff', '#ffd23f', '#ffffff', '#3fa7ff', '#ffffff'];
      for (let i = 0; i < 6; i++) {
        const m = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 16, (i / 6) * Math.PI * 2, Math.PI / 3), std(cols[i], 0.35)));
        g.add(m);
      }
      return g;
    },
  },
};

export const WEAPON_POOL = ['bat', 'pan', 'hammer', 'lollipop', 'icegun', 'bomb', 'bat', 'pan', 'lollipop'];

let nextItemId = 1;

export class Item {
  constructor(game, type, pos, rot) {
    this.game = game; this.phys = game.phys;
    this.type = type; this.def = ITEM_DEFS[type];
    this.id = 1000 + nextItemId++;
    this.holder = null; this.joint = null;
    this.alive = true;
    this.ammo = this.def.ammo || 0;
    this.cd = 0;
    this.fuse = -1;
    this.age = 0;
    const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z).setCcdEnabled(!!this.def.weapon || type === 'bomb')
      .setLinearDamping(0.08).setAngularDamping(0.4);
    if (rot) desc.setRotation(rot);
    this.body = this.phys.world.createRigidBody(desc);
    const cols = this.def.collider();
    const per = this.def.mass / cols.length;
    this.colliders = cols.map((cd) => {
      const c = this.phys.world.createCollider(cd.setMass(per).setFriction(0.7).setCollisionGroups(GROUPS.prop).setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS), this.body);
      this.phys.setInfo(c, { kind: 'item', item: this });
      return c;
    });
    this.mesh = this.def.mesh();
    game.scene.add(this.mesh);
    this.prevP = new THREE.Vector3(pos.x, pos.y, pos.z); this.curP = this.prevP.clone();
    this.prevQ = new THREE.Quaternion(); this.curQ = new THREE.Quaternion();
    if (rot) { this.prevQ.set(rot.x, rot.y, rot.z, rot.w); this.curQ.copy(this.prevQ); }
    this.sync();
  }

  sync() {
    this.prevP.copy(this.curP); this.prevQ.copy(this.curQ);
    const t = this.body.translation(), r = this.body.rotation();
    this.curP.set(t.x, t.y, t.z); this.curQ.set(r.x, r.y, r.z, r.w);
  }

  render(alpha) {
    this.mesh.position.lerpVectors(this.prevP, this.curP, alpha);
    this.mesh.quaternion.slerpQuaternions(this.prevQ, this.curQ, alpha);
  }

  pointVel(p, out) {
    const lv = this.body.linvel(), av = this.body.angvel(), t = this.body.translation();
    const rx = p.x - t.x, ry = p.y - t.y, rz = p.z - t.z;
    return out.set(lv.x + av.y * rz - av.z * ry, lv.y + av.z * rx - av.x * rz, lv.z + av.x * ry - av.y * rx);
  }

  hitPoints() {
    const q = this.curQ;
    return (this.def.hit || []).map((h) => new THREE.Vector3(h[0], h[1], h[2]).applyQuaternion(q).add(this.curP));
  }

  equip(c) {
    if (this.holder || !this.alive) return;
    const W = this.phys.world;
    const tip = DIM.arm.tip;
    // 先把武器摆到手上,避免关节瞬间猛拉
    const arm = c.B.armR, ar = arm.rotation(), at = arm.translation();
    const qa = new THREE.Quaternion(ar.x, ar.y, ar.z, ar.w);
    const gripW = new THREE.Vector3(tip[0], tip[1], tip[2]).applyQuaternion(qa).add(new THREE.Vector3(at.x, at.y, at.z));
    const off = new THREE.Vector3(0, this.def.grip, 0).applyQuaternion(qa);
    this.body.setTranslation({ x: gripW.x - off.x, y: gripW.y - off.y, z: gripW.z - off.z }, true);
    this.body.setRotation(ar, true);
    this.body.setLinvel(arm.linvel(), true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.joint = W.createImpulseJoint(RAPIER.JointData.fixed({ x: tip[0], y: tip[1], z: tip[2] }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: this.def.grip, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }), arm, this.body, true);
    this.joint.setContactsEnabled(false);
    this.holder = c; c.weapon = this;
    this.phys.owner.set(this.body.handle, c.id);
    for (const col of this.colliders) col.setCollisionGroups(GROUPS.propHeld);
    if (this.type === 'bomb') this.arm();
    this.game.emit('pickup', { c, item: this });
  }

  unequip(placed) {
    const c = this.holder;
    if (!c) return;
    try { this.phys.world.removeImpulseJoint(this.joint, true); } catch (e) { /* ignore */ }
    this.joint = null; this.holder = null; c.weapon = null;
    this.phys.owner.delete(this.body.handle);
    for (const col of this.colliders) col.setCollisionGroups(GROUPS.prop);
    if (placed) {
      const f = c.forward(new THREE.Vector3());
      this.body.setLinvel({ x: f.x * 1.5, y: 1.5, z: f.z * 1.5 }, true);
    }
    this.game.emit('drop', { c, item: this });
  }

  use(c) {
    const d = this.def;
    if (d.throwable) {
      // 投掷物:松手并沿准星方向扔出
      const aim = c.aimDir(new THREE.Vector3());
      aim.y = Math.max(aim.y, 0) * 0.7 + 0.25;
      aim.normalize();
      this.unequip(false);
      const v = c.st.torso.v;
      this.body.setLinvel({ x: v.x * 0.5 + aim.x * 10, y: aim.y * 10 + 1.5, z: v.z * 0.5 + aim.z * 10 }, true);
      c.startAction('throw', 0.32);
      this.game.emit('throw', { c, tgt: { item: this } });
      return;
    }
    if (d.gun) {
      if (this.cd > 0) return;
      this.cd = d.cooldown;
      const aim = c.aimDir(new THREE.Vector3());
      const muzzle = this.hitMuzzle();
      this.game.projectiles.spawn('ice', muzzle, aim.multiplyScalar(17), c);
      this.game.emit('shoot', { c, item: this, p: muzzle.clone() });
      c.B.armR.applyImpulse({ x: -aim.x * 0.08, y: 0.4, z: -aim.z * 0.08 }, true);
      this.ammo--;
      if (this.ammo <= 0) { this.unequip(false); this.expire = 2.5; }
      return;
    }
    c.punchSide = 'R';
    c.startAction('swing', d.wind + d.strike + 0.22, { wind: d.wind, strike: d.strike, heavy: !!d.heavy, side: 'R' });
    this.game.emit('swing', { c, kind: 'weapon', item: this });
  }

  hitMuzzle() {
    return new THREE.Vector3(0, -0.34, 0).applyQuaternion(this.curQ).add(this.curP);
  }

  onHit(vic) { this.game.emit('weaponHit', { item: this, c: vic }); }

  onGrab(c) { if (this.type === 'bomb') this.arm(); }
  onThrow() {}

  arm() { if (this.fuse < 0) { this.fuse = this.def.fuse; this.game.emit('fuse', { item: this }); } }

  step(dt) {
    this.age += dt;
    this.cd = Math.max(0, this.cd - dt);
    if (this.expire !== undefined && !this.holder) { this.expire -= dt; if (this.expire <= 0) { this.destroy(); return; } }
    if (this.fuse >= 0) {
      this.fuse -= dt;
      const sp = this.mesh.userData.spark;
      if (sp) { sp.visible = true; sp.scale.setScalar(0.8 + Math.random() * 0.8); }
      if (this.fuse <= 0) { this.explode(); return; }
    }
    const t = this.body.translation();
    if (t.y < this.game.map.killY - 2) this.destroy();
  }

  explode() {
    const p = this.curP.clone();
    if (this.holder) this.unequip(false);
    // 松开所有抓着它的手
    for (const c of this.game.creatures) for (const s of ['L', 'R']) if (c.hands[s].tgt?.item === this) c.detachHand(s);
    this.game.explosion(p, 3.2, 48, this.holder);
    this.destroy();
  }

  destroy() {
    if (!this.alive) return;
    this.alive = false;
    for (const c of this.game.creatures) for (const s of ['L', 'R']) if (c.hands[s].tgt?.item === this) c.detachHand(s);
    if (this.holder) this.unequip(false);
    for (const col of this.colliders) this.phys.colliderInfo.delete(col.handle);
    this.phys.owner.delete(this.body.handle);
    this.phys.world.removeRigidBody(this.body);
    this.game.scene.remove(this.mesh);
  }
}

// 冰弹
const PROJ_GROUPS = groups(G.BODY, G.ENV | G.BODY | G.LEG | G.PROP);
export class Projectiles {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.geo = new THREE.IcosahedronGeometry(0.11, 1);
    this.mat = new THREE.MeshStandardMaterial({ color: '#bff1ff', emissive: '#59d6ff', emissiveIntensity: 0.9, roughness: 0.1, transparent: true, opacity: 0.9 });
  }
  spawn(kind, pos, vel, owner) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.copy(pos);
    this.game.scene.add(m);
    this.list.push({ kind, p: pos.clone(), v: vel.clone(), owner, life: 2.2, mesh: m });
  }
  step(dt) {
    const ph = this.game.phys;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const pr = this.list[i];
      pr.life -= dt;
      pr.v.y -= 3 * dt;
      pr.p.addScaledVector(pr.v, dt);
      let hit = null;
      ph.overlapBall(pr.p, 0.16, PROJ_GROUPS, (col) => {
        if (hit) return;
        const info = ph.info(col);
        if (!info) return;
        if (info.kind === 'creature' && (info.creature === pr.owner || !info.creature.alive)) return;
        if (info.kind === 'item' && info.item.holder === pr.owner) return;
        hit = info;
      });
      if (hit || pr.life <= 0) {
        if (hit?.kind === 'creature') {
          const c = hit.creature;
          c.lastAttacker = pr.owner; c.lastAttackerT = this.game.time;
          c.B.torso.applyImpulse({ x: pr.v.x * 0.3, y: 0.5, z: pr.v.z * 0.3 }, true);
          c.freeze(4.2);
        }
        this.game.emit('iceHit', { p: pr.p.clone() });
        this.game.scene.remove(pr.mesh);
        this.list.splice(i, 1);
        continue;
      }
      pr.mesh.position.copy(pr.p);
      pr.mesh.rotation.x += dt * 9; pr.mesh.rotation.y += dt * 7;
    }
  }
  clear() { for (const pr of this.list) this.game.scene.remove(pr.mesh); this.list = []; }
}
