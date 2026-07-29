// 场景装配:关卡合并网格 + 道具(滑门 / 按钮 / 方块 / 消解栅 / 电梯 / 招牌 / 灯)+ 手中的发射器。
// 渲染层只读模拟状态,自身不含任何玩法逻辑。
import * as THREE from 'three';
import { buildLevelMeshes } from './geometry.js';
import { signTexture } from './materials.js';

const PORTAL_BLUE = 0x2f9bff;
const PORTAL_ORANGE = 0xff8a1e;

export class ChamberView {
  constructor(scene, materials) {
    this.scene = scene;
    this.materials = materials;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.doors = [];
    this.buttons = [];
    this.cubes = [];
    this.fizzlers = [];
  }

  clear() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (m && m.__ownGeoMaterial) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    });
    this.root.clear();
    this.doors = [];
    this.buttons = [];
    this.cubes = [];
    this.fizzlers = [];
  }

  build(game) {
    this.clear();
    const level = game.level;
    for (const mesh of buildLevelMeshes(game.world.baseSolids, this.materials)) {
      this.root.add(mesh);
    }
    // 光照
    this.root.add(new THREE.AmbientLight(0xffffff, 0.75));
    this.root.add(new THREE.HemisphereLight(0xdde8ee, 0x33383b, 0.9));
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xf4f7f4, emissive: 0xf2f6f0, emissiveIntensity: 1.7, roughness: 0.5,
    });
    lampMat.__ownGeoMaterial = true;
    for (const [x, y, z, i] of level.lights || []) {
      // three r155+ 用物理光照单位:房间灯要几十坎德拉才够亮
      const light = new THREE.PointLight(0xf6f8f2, (i ?? 1) * 26, 32, 1.5);
      light.position.set(x, y, z);
      this.root.add(light);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.8), lampMat);
      lamp.position.set(x, y + 0.3, z);
      this.root.add(lamp);
    }
    // 招牌
    if (level.sign) {
      const t = signTexture(level.id, 5, level.name);
      const mat = new THREE.MeshBasicMaterial({ map: t });
      mat.__ownGeoMaterial = true;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), mat);
      sign.position.fromArray(level.sign.pos);
      sign.rotation.y = level.sign.rotY;
      this.root.add(sign);
    }
    for (const d of game.doors) this.doors.push(this.buildDoor(d));
    for (const b of game.buttons) this.buttons.push(this.buildButton(b));
    for (const c of game.cubes) this.cubes.push(this.buildCube(c));
    for (const f of level.fizzlers || []) this.fizzlers.push(this.buildFizzler(f));
    if (level.exit) this.buildElevator(level.exit);
  }

  buildDoor(d) {
    const group = new THREE.Group();
    group.position.fromArray(d.center);
    if (d.axis === 'z') group.rotation.y = Math.PI / 2;
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.3, metalness: 0.8 });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0x1e2225, roughness: 0.5, metalness: 0.5, emissive: 0x1a6cff, emissiveIntensity: 0.5,
    });
    panelMat.__ownGeoMaterial = true;
    edgeMat.__ownGeoMaterial = true;
    const pw = d.w / 2;
    const geo = new THREE.BoxGeometry(pw, d.h, 0.24);
    const left = new THREE.Mesh(geo, panelMat);
    const right = new THREE.Mesh(geo.clone(), panelMat);
    const stripe = new THREE.BoxGeometry(0.07, d.h - 0.12, 0.28);
    const ls = new THREE.Mesh(stripe, edgeMat);
    ls.position.x = pw / 2 - 0.06;
    left.add(ls);
    const rs = new THREE.Mesh(stripe.clone(), edgeMat);
    rs.position.x = -pw / 2 + 0.06;
    right.add(rs);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x35393d, roughness: 0.45, metalness: 0.7 });
    frameMat.__ownGeoMaterial = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(d.w + 0.6, 0.3, 0.55), frameMat);
    top.position.y = d.h / 2 + 0.15;
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.3, d.h + 0.6, 0.55), frameMat);
    jamb.position.x = -d.w / 2 - 0.15;
    const jamb2 = jamb.clone();
    jamb2.position.x = d.w / 2 + 0.15;
    group.add(left, right, top, jamb, jamb2);
    this.root.add(group);
    return { group, left, right, edgeMat, w: d.w, ref: d };
  }

  buildButton(b) {
    const group = new THREE.Group();
    group.position.fromArray(b.pos);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2c3033, roughness: 0.55, metalness: 0.6 });
    baseMat.__ownGeoMaterial = true;
    // 墩体压到 6cm:按钮没有碰撞体,墩子太高会让方块/玩家整个陷进去、把「已按下」的绿光埋掉
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.86, 0.06, 28), baseMat);
    base.position.y = 0.03;
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xd23030, roughness: 0.4, metalness: 0.2, emissive: 0xd23030, emissiveIntensity: 0.4,
    });
    capMat.__ownGeoMaterial = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.62, 0.05, 28), capMat);
    cap.position.y = 0.075;
    group.add(base, cap);
    this.root.add(group);
    return { group, cap, capMat, ref: b };
  }

  buildCube(c) {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8d9499, roughness: 0.5, metalness: 0.45 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x474d51, roughness: 0.38, metalness: 0.7 });
    const emblemMat = new THREE.MeshStandardMaterial({
      color: 0xd6dde1, emissive: 0x3a8dff, emissiveIntensity: 0.5, roughness: 0.35,
    });
    for (const m of [bodyMat, frameMat, emblemMat]) m.__ownGeoMaterial = true;
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), bodyMat));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), frameMat);
    for (let i = 0; i < 6; i++) {
      const disk = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), emblemMat);
      const axis = i >> 1;
      const sign = i & 1 ? -1 : 1;
      const p = [0, 0, 0];
      p[axis] = 0.254 * sign;
      disk.position.fromArray(p);
      if (axis === 0) disk.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
      else if (axis === 1) disk.rotation.x = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      else if (sign < 0) disk.rotation.y = Math.PI;
      frame.add(disk);
    }
    group.add(frame);
    this.root.add(group);
    return { group, emblemMat, ref: c };
  }

  buildFizzler(f) {
    const size = [f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]];
    const center = [0, 1, 2].map((a) => (f.min[a] + f.max[a]) / 2);
    const thin = size[0] <= size[2] ? 0 : 2;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: `varying vec2 vUv; uniform float uTime;
        void main(){
          float w = sin(vUv.x*46.0 + uTime*7.0)*0.5+0.5;
          float v = sin(vUv.y*30.0 - uTime*4.5)*0.5+0.5;
          float edge = smoothstep(0.0,0.06,vUv.y)*smoothstep(1.0,0.94,vUv.y);
          gl_FragColor = vec4(vec3(0.42,0.86,1.0)*(0.28+0.4*w*v), (0.16+0.24*w*v)*edge+0.07);
        }`,
    });
    mat.__ownGeoMaterial = true;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(thin === 0 ? size[2] : size[0], size[1]),
      mat,
    );
    plane.position.fromArray(center);
    if (thin === 0) plane.rotation.y = Math.PI / 2;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x282c2f, roughness: 0.45, metalness: 0.75 });
    postMat.__ownGeoMaterial = true;
    for (const end of [0, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, size[1], 0.16), postMat);
      const p = [...center];
      p[thin === 0 ? 2 : 0] = end ? f.max[thin === 0 ? 2 : 0] : f.min[thin === 0 ? 2 : 0];
      post.position.fromArray(p);
      this.root.add(post);
    }
    this.root.add(plane);
    return { mat };
  }

  buildElevator(zone) {
    const cx = (zone.min[0] + zone.max[0]) / 2;
    const cz = (zone.min[2] + zone.max[2]) / 2;
    const y = zone.min[1];
    const padMat = new THREE.MeshStandardMaterial({
      color: 0x282c2f, roughness: 0.35, metalness: 0.75, emissive: 0x22aa44, emissiveIntensity: 0.3,
    });
    padMat.__ownGeoMaterial = true;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.08, 26), padMat);
    pad.position.set(cx, y + 0.04, cz);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x3ce065, transparent: true, opacity: 0.75 });
    ringMat.__ownGeoMaterial = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.82, 30), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, y + 0.1, cz);
    const light = new THREE.PointLight(0x40e070, 1.5, 5);
    light.position.set(cx, y + 1.9, cz);
    this.root.add(pad, ring, light);
    this.exitRing = ringMat;
  }

  /** 每帧同步:门扇滑动、按钮亮灭、方块位姿与溶解、消解栅动画 */
  update(game, dt, t) {
    for (const d of this.doors) {
      const slide = (d.w / 2) * d.ref.progress * 1.04;
      d.left.position.x = -d.w / 4 - slide;
      d.right.position.x = d.w / 4 + slide;
      d.edgeMat.emissive.setHex(d.ref.target ? 0x27c04a : 0x1a6cff);
    }
    for (const b of this.buttons) {
      const on = b.ref.pressed;
      b.cap.position.y = on ? 0.045 : 0.075;
      b.capMat.emissiveIntensity = on ? 1.2 : 0.4;
      b.capMat.color.setHex(on ? 0x35d04a : 0xd23030);
      b.capMat.emissive.setHex(on ? 0x35d04a : 0xd23030);
    }
    for (const c of this.cubes) {
      c.group.position.fromArray(c.ref.ent.pos);
      const dis = c.ref.dissolve;
      c.group.visible = dis < 0.999;
      const s = dis > 0 ? Math.max(0.02, 1 - dis) : 1;
      c.group.scale.setScalar(s);
      c.emblemMat.emissiveIntensity = 0.5 + (dis > 0 ? dis * 4 : 0);
    }
    for (const f of this.fizzlers) f.mat.uniforms.uTime.value = t;
    if (this.exitRing) this.exitRing.opacity = 0.55 + 0.3 * Math.sin(t * 3);
  }
}

/** 手中的双色发射器(相机子节点;渲染门内视图时会隐藏) */
export function buildGunViewModel(camera) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xe9edeb, roughness: 0.32, metalness: 0.25 }),
  );
  shell.scale.set(1, 0.8, 2.2);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.048, 0.22, 12),
    new THREE.MeshStandardMaterial({ color: 0x2e3338, roughness: 0.4, metalness: 0.85 }),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.2;
  const coreMat = new THREE.MeshBasicMaterial({ color: PORTAL_BLUE });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), coreMat);
  core.position.z = -0.3;
  const clawMat = new THREE.MeshStandardMaterial({ color: 0xdadedc, roughness: 0.38, metalness: 0.45 });
  for (let i = 0; i < 3; i++) {
    const claw = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.17), clawMat);
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    claw.position.set(Math.cos(a) * 0.062, Math.sin(a) * 0.062, -0.27);
    claw.rotation.z = a;
    g.add(claw);
  }
  g.add(shell, barrel, core);
  g.scale.setScalar(0.46);
  g.position.set(0.33, -0.28, -0.62);
  g.visible = false;
  camera.add(g);
  return {
    group: g,
    setColor(color) { coreMat.color.setHex(color === 'orange' ? PORTAL_ORANGE : PORTAL_BLUE); },
  };
}
