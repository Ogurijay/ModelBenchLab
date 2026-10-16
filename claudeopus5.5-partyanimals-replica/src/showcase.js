// 菜单背景:舞台上一排毛绒动物,选中的那只站到最前面蹦跶。
import * as THREE from 'three';
import { SPECIES, STAND_H, DIM, buildVisual } from './animals.js';
import { makeSky } from './mapkit.js';

export function poseStatic(vis, t, wave = 0) {
  const g = new THREE.Group();
  const bounce = Math.abs(Math.sin(t * 3)) * 0.06;
  vis.torso.position.set(0, STAND_H + bounce, 0);
  vis.head.position.set(0, STAND_H + DIM.neck.torso[1] - DIM.neck.head[1] + bounce * 1.2, 0);
  vis.head.rotation.set(Math.sin(t * 1.3) * 0.05, Math.sin(t * 0.7) * 0.25, Math.sin(t * 1.1) * 0.08);
  for (const s of ['L', 'R']) {
    const sx = s === 'L' ? 1 : -1;
    const a = vis['arm' + s];
    const lift = s === 'L' && wave ? 2.4 + Math.sin(t * 9) * 0.35 : 0.25 + Math.sin(t * 3 + sx) * 0.05;
    const sh = new THREE.Vector3(DIM.shoulder[0] * sx, STAND_H + DIM.shoulder[1] + bounce, 0);
    a.rotation.set(0, 0, sx * lift);
    const off = new THREE.Vector3(0, -DIM.arm.anchor[1], 0).applyEuler(a.rotation);
    a.position.copy(sh).add(off);
    const l = vis['leg' + s];
    l.rotation.set(0, 0, 0);
    l.position.set(DIM.hip[0] * sx, STAND_H + DIM.hip[1] - DIM.leg.anchor[1], 0);
  }
  if (vis.tail) vis.tail.rotation.y = Math.sin(t * 8) * 0.4;
  return g;
}

export class Showcase {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 900);
    this.camera.position.set(0, 1.6, 6.4);
    this.camera.lookAt(0, 0.85, 0);
    this.active = true;
    this.t = 0;
    const s = this.scene;
    makeSky(s, { top: '#ffb3d1', horizon: '#ffe6c2', bottom: '#ffd6e6', sunDir: new THREE.Vector3(0.3, 0.4, 1) });
    s.add(new THREE.HemisphereLight('#fff1f6', '#b38aa0', 1.4));
    const sun = new THREE.DirectionalLight('#fff4e0', 2.4);
    sun.position.set(3, 7, 5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6;
    s.add(sun);
    // 舞台
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.4, 64), new THREE.MeshStandardMaterial({ color: '#ffe9f1', roughness: 0.6 }));
    stage.position.y = -0.2; stage.receiveShadow = true; s.add(stage);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(4.7, 0.08, 8, 80), new THREE.MeshStandardMaterial({ color: '#ff8fb8', emissive: '#ff5d9a', emissiveIntensity: 0.4 }));
    rim.rotation.x = Math.PI / 2; s.add(rim);
    // 气球
    this.balloons = [];
    const cols = ['#ff5d8f', '#ffd23f', '#3fa7ff', '#5fe08a', '#b47cff'];
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), new THREE.MeshStandardMaterial({ color: cols[i % 5], roughness: 0.25 }));
      b.scale.y = 1.2;
      const a = (i / 14) * Math.PI * 2;
      b.position.set(Math.cos(a) * (6 + (i % 3)), 2 + (i % 4) * 0.7, Math.sin(a) * (6 + (i % 3)) - 3);
      b.userData.base = b.position.y; b.userData.ph = i;
      s.add(b); this.balloons.push(b);
    }
    this.lineup = [];
    SPECIES.forEach((sp, i) => {
      const vis = buildVisual(sp.id, 0);
      const g = new THREE.Group();
      for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR']) g.add(vis[k]);
      s.add(g);
      this.lineup.push({ id: sp.id, vis, g, pal: 0, slot: new THREE.Vector3(), cur: new THREE.Vector3() });
    });
    this.sel = SPECIES[0].id;
    this.layout(true);
  }

  resize(w, h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  setSelection(id, pal) {
    this.sel = id;
    const e = this.lineup.find((l) => l.id === id);
    if (e && e.pal !== pal) {
      // 重建该动物外观以换配色
      for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR']) e.g.remove(e.vis[k]);
      e.vis = buildVisual(id, pal);
      for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR']) e.g.add(e.vis[k]);
      e.pal = pal;
    }
    this.layout(false);
  }

  layout(snap) {
    const others = this.lineup.filter((l) => l.id !== this.sel);
    others.forEach((l, i) => {
      const a = -1.1 + (i / (others.length - 1)) * 2.2;
      l.slot.set(Math.sin(a) * 3.3, 0, -Math.cos(a) * 1.6 - 0.6);
    });
    const s = this.lineup.find((l) => l.id === this.sel);
    if (s) s.slot.set(0, 0, 1.3);
    if (snap) for (const l of this.lineup) l.cur.copy(l.slot);
  }

  render(dt) {
    this.t += dt;
    const t = this.t;
    for (const l of this.lineup) {
      l.cur.lerp(l.slot, 1 - Math.exp(-dt * 6));
      l.g.position.copy(l.cur);
      const front = l.id === this.sel;
      l.g.scale.setScalar(front ? 1.25 : 0.95);
      l.g.rotation.y = front ? Math.sin(t * 0.6) * 0.5 : Math.atan2(-l.cur.x, 6 - l.cur.z) * 0.6;
      poseStatic(l.vis, t + l.cur.x, front);
      l.vis.setFace(front ? 'happy' : (Math.sin(t * 2 + l.cur.x * 3) > 0.97 ? 'blink' : 'open'));
    }
    for (const b of this.balloons) b.position.y = b.userData.base + Math.sin(t * 0.8 + b.userData.ph) * 0.25;
    this.renderer.render(this.scene, this.camera);
  }
}
