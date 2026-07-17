// 交互对象:滑动门 / 重量按钮 / 可搬运方块 / 消解栅 / 出口电梯
import * as THREE from 'three';
import { makeEntity } from './physics.js';

// ── 滑动门(双扇左右分开;关闭时提供碰撞盒,也挡传送门弹) ──
export class Door {
  constructor(def, scene) {
    this.id = def.id;
    this.axis = def.axis; // 门宽/滑动方向:'x' 表示门嵌在 Z 向墙里
    this.center = def.center;
    this.w = def.w;
    this.h = def.h;
    this.targetOpen = !!def.open;
    this.progress = def.open ? 1 : 0;

    this.group = new THREE.Group();
    this.group.position.fromArray(def.center);
    if (def.axis === 'z') this.group.rotation.y = Math.PI / 2;

    const panelMat = new THREE.MeshStandardMaterial({ color: 0x9aa4a8, roughness: 0.35, metalness: 0.75 });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x222629, roughness: 0.5, metalness: 0.6,
      emissive: 0x1a6cff, emissiveIntensity: 0.35,
    });
    this.edgeMat = edgeMat;
    const pw = def.w / 2;
    const pg = new THREE.BoxGeometry(pw, def.h, 0.2);
    this.left = new THREE.Mesh(pg, panelMat);
    this.right = new THREE.Mesh(pg, panelMat);
    // 门扇内缘发光条
    const eg = new THREE.BoxGeometry(0.06, def.h - 0.1, 0.24);
    const le = new THREE.Mesh(eg, edgeMat);
    le.position.x = pw / 2 - 0.05;
    this.left.add(le);
    const re = new THREE.Mesh(eg, edgeMat);
    re.position.x = -pw / 2 + 0.05;
    this.right.add(re);
    // 门框
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3a3f43, roughness: 0.5, metalness: 0.7 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(def.w + 0.5, 0.25, 0.5), frameMat);
    top.position.y = def.h / 2 + 0.12;
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, def.h + 0.5, 0.5), frameMat);
    l.position.x = -def.w / 2 - 0.12;
    const r = l.clone();
    r.position.x = def.w / 2 + 0.12;
    this.group.add(this.left, this.right, top, l, r);
    scene.add(this.group);

    // 碰撞盒(世界轴对齐)
    const c = def.center;
    const half = def.axis === 'x' ? [def.w / 2, def.h / 2, 0.15] : [0.15, def.h / 2, def.w / 2];
    this.collider = {
      min: [c[0] - half[0], c[1] - half[1], c[2] - half[2]],
      max: [c[0] + half[0], c[1] + half[1], c[2] + half[2]],
      mat: 'metal',
    };
    this.updatePanels();
  }

  setOpen(v) { this.targetOpen = v; }
  get blocking() { return this.progress < 0.85; }

  updatePanels() {
    const pw = this.w / 2;
    const slide = pw * this.progress * 1.02;
    this.left.position.x = -pw / 2 - slide;
    this.right.position.x = pw / 2 + slide;
    this.edgeMat.emissive.setHex(this.targetOpen ? 0x27c04a : 0x1a6cff);
  }

  update(dt) {
    const target = this.targetOpen ? 1 : 0;
    const speed = this.targetOpen ? 1 / 0.35 : 1 / 0.25; // 关门稍快,防止"踩了就跑"作弊
    const before = this.progress;
    if (this.progress !== target) {
      this.progress += Math.sign(target - this.progress) * speed * dt;
      this.progress = Math.min(1, Math.max(0, this.progress));
      this.updatePanels();
    }
    return before !== this.progress;
  }
}

// ── 重量按钮 ──
export class Button {
  constructor(def, scene) {
    this.def = def;
    this.pressed = false;
    this.group = new THREE.Group();
    this.group.position.set(def.x, def.y, def.z);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.6, metalness: 0.5 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.12, 32), baseMat);
    base.position.y = 0.06;
    this.capMat = new THREE.MeshStandardMaterial({
      color: 0xd02020, roughness: 0.45, metalness: 0.2,
      emissive: 0xd02020, emissiveIntensity: 0.35,
    });
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.47, 0.1, 32), this.capMat);
    this.cap.position.y = 0.16;
    this.group.add(base, this.cap);
    scene.add(this.group);
    // 底座可踩(细矮圆台近似为盒)
    this.collider = {
      min: [def.x - 0.62, def.y, def.z - 0.62],
      max: [def.x + 0.62, def.y + 0.12, def.z + 0.62],
      mat: 'metal',
    };
  }

  // 玩家站上 / 未携带的方块压上都算按下
  check(player, cubes) {
    const d = this.def;
    let on = false;
    const pdx = player.ent.pos[0] - d.x, pdz = player.ent.pos[2] - d.z;
    const feet = player.ent.pos[1] - player.ent.hh;
    if (pdx * pdx + pdz * pdz < 0.55 * 0.55 && feet > d.y - 0.05 && feet < d.y + 0.4) on = true;
    for (const c of cubes) {
      if (c.carried || c.dissolving) continue;
      const dx = c.ent.pos[0] - d.x, dz = c.ent.pos[2] - d.z;
      const bottom = c.ent.pos[1] - c.ent.hh;
      if (dx * dx + dz * dz < 0.6 * 0.6 && bottom > d.y - 0.05 && bottom < d.y + 0.45) on = true;
    }
    const changed = on !== this.pressed;
    this.pressed = on;
    this.cap.position.y = on ? 0.11 : 0.16;
    this.capMat.emissiveIntensity = on ? 1.1 : 0.35;
    this.capMat.color.setHex(on ? 0x35d04a : 0xd02020);
    this.capMat.emissive.setHex(on ? 0x35d04a : 0xd02020);
    return changed;
  }
}

// ── 可搬运方块(储物方块) ──
export class CubeObj {
  constructor(pos, scene) {
    this.spawnPos = [...pos];
    this.ent = makeEntity(pos, 0.25, 0.25);
    this.carried = false;
    this.dissolving = 0; // >0 溶解动画中
    this.group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8d9499, roughness: 0.55, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), bodyMat);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a5054, roughness: 0.4, metalness: 0.65 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), frameMat);
    // 六面圆形徽记(发光小圆盘)
    this.emblemMat = new THREE.MeshStandardMaterial({
      color: 0xcfd6da, emissive: 0x3388ff, emissiveIntensity: 0.4, roughness: 0.4,
    });
    for (let i = 0; i < 6; i++) {
      const disk = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), this.emblemMat);
      const axis = i >> 1, sign = (i & 1) ? -1 : 1;
      const p = [0, 0, 0];
      p[axis] = 0.253 * sign;
      disk.position.fromArray(p);
      if (axis === 0) disk.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
      else if (axis === 1) disk.rotation.x = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      else if (sign < 0) disk.rotation.y = Math.PI;
      frame.add(disk);
    }
    this.group.add(body, frame);
    scene.add(this.group);
    this.syncMesh();
  }

  get collider() {
    const e = this.ent;
    return {
      min: [e.pos[0] - e.hw, e.pos[1] - e.hh, e.pos[2] - e.hw],
      max: [e.pos[0] + e.hw, e.pos[1] + e.hh, e.pos[2] + e.hw],
      mat: 'metal',
      isCube: true,
      cube: this,
    };
  }

  syncMesh() {
    this.group.position.fromArray(this.ent.pos);
  }

  respawn() {
    this.ent.pos = [...this.spawnPos];
    this.ent.vel = [0, 0, 0];
    this.carried = false;
    this.dissolving = 0;
    this.group.scale.setScalar(1);
    this.group.visible = true;
    this.syncMesh();
  }

  startDissolve() {
    if (this.dissolving <= 0) this.dissolving = 1e-4;
    this.carried = false;
  }
}

// ── 消解栅(通过时清除玩家门 / 溶解方块) ──
export class Fizzler {
  constructor(def, scene) {
    this.box = { min: def.min, max: def.max };
    this.axis = def.axis; // 薄的那个轴
    const size = [def.max[0] - def.min[0], def.max[1] - def.min[1], def.max[2] - def.min[2]];
    const center = [
      (def.min[0] + def.max[0]) / 2,
      (def.min[1] + def.max[1]) / 2,
      (def.min[2] + def.max[2]) / 2,
    ];
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uTime;
        void main(){
          float w = sin(vUv.x*40.0 + uTime*6.0)*0.5+0.5;
          float w2 = sin(vUv.y*26.0 - uTime*4.0)*0.5+0.5;
          float edge = smoothstep(0.0,0.08,vUv.y)*smoothstep(1.0,0.92,vUv.y);
          vec3 col = vec3(0.45,0.85,1.0)*(0.25+0.35*w*w2);
          gl_FragColor = vec4(col,(0.16+0.22*w*w2)*edge+0.08);
        }
      `,
    });
    const plane = new THREE.Mesh(
      this.axis === 'x'
        ? new THREE.PlaneGeometry(size[2], size[1])
        : new THREE.PlaneGeometry(size[0], size[1]),
      this.mat,
    );
    plane.position.fromArray(center);
    if (this.axis === 'x') plane.rotation.y = Math.PI / 2;
    scene.add(plane);
    // 两侧立柱
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2c3033, roughness: 0.5, metalness: 0.7 });
    for (const end of [0, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, size[1], 0.14), postMat);
      if (this.axis === 'x') post.position.set(center[0], center[1], end ? def.max[2] - 0.07 : def.min[2] + 0.07);
      else post.position.set(end ? def.max[0] - 0.07 : def.min[0] + 0.07, center[1], center[2]);
      scene.add(post);
    }
    this.center = center;
  }

  // 点从一侧跨到另一侧(且横向在栅内)→ 触发
  crossed(prev, cur) {
    const a = this.axis === 'x' ? 0 : 2;
    const mid = this.center[a];
    if ((prev[a] - mid) * (cur[a] - mid) > 0) return false;
    const oa = a === 0 ? 2 : 0;
    return (
      cur[oa] > this.box.min[oa] - 0.2 && cur[oa] < this.box.max[oa] + 0.2 &&
      cur[1] > this.box.min[1] - 0.3 && cur[1] < this.box.max[1] + 0.5
    );
  }

  update(dt) { this.mat.uniforms.uTime.value += dt; }
}

// ── 出口电梯(视觉 + 区域判定) ──
export class Elevator {
  constructor(zone, scene) {
    this.zone = zone;
    const cx = (zone.min[0] + zone.max[0]) / 2;
    const cz = (zone.min[2] + zone.max[2]) / 2;
    const y = zone.min[1];
    this.group = new THREE.Group();
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x2a2e31, roughness: 0.4, metalness: 0.7,
      emissive: 0x27c04a, emissiveIntensity: 0.25,
    });
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.06, 28), padMat);
    pad.position.set(cx, y + 0.03, cz);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x35e05a, transparent: true, opacity: 0.7 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.72, 32), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, y + 0.08, cz);
    const light = new THREE.PointLight(0x40e060, 1.6, 4);
    light.position.set(cx, y + 1.8, cz);
    this.group.add(pad, ring, light);
    scene.add(this.group);
    this.t = 0;
  }

  contains(pos) {
    const z = this.zone;
    return (
      pos[0] > z.min[0] && pos[0] < z.max[0] &&
      pos[1] > z.min[1] - 0.2 && pos[1] < z.max[1] + 0.5 &&
      pos[2] > z.min[2] && pos[2] < z.max[2]
    );
  }

  update(dt) {
    this.t += dt;
    this.ringMat.opacity = 0.5 + 0.3 * Math.sin(this.t * 3);
  }
}
