// 低多边形车模：侧面轮廓挤出 + 玻璃舱 + 车顶，保持轮廓干净、一眼认出车型。
// 车头朝 +x，rotation.y = heading。车内只放低多边形剪影。
import * as THREE from 'three';
import { toon, addOutline, canvasTex } from '../fx/toon.js';
import { clamp } from '../core/math.js';

const BODIES = {
  trueno: { len: 4.2, wid: 1.63, wb: 2.4, wheelR: 0.3,
    body: [[-2.1, 0.26], [2.08, 0.26], [2.14, 0.48], [2.06, 0.64], [0.68, 0.8], [-1.9, 0.86], [-2.1, 0.74]],
    cabin: [[0.66, 0.79], [-0.12, 1.22], [-1.0, 1.25], [-1.95, 0.86]], roofFrom: 0.18, popup: true, two: 0.48, hatch: true },
  levin: { len: 4.2, wid: 1.63, wb: 2.4, wheelR: 0.3,
    body: [[-2.1, 0.26], [2.08, 0.26], [2.12, 0.5], [2.05, 0.66], [0.7, 0.8], [-1.35, 0.84], [-2.08, 0.82], [-2.12, 0.72]],
    cabin: [[0.68, 0.79], [-0.1, 1.22], [-0.95, 1.24], [-1.4, 0.84]], roofFrom: 0.2, popup: false, two: 0.46 },
  r32: { len: 4.55, wid: 1.76, wb: 2.62, wheelR: 0.33,
    body: [[-2.27, 0.28], [2.25, 0.28], [2.3, 0.55], [2.22, 0.74], [0.85, 0.86], [-1.45, 0.92], [-2.22, 0.94], [-2.3, 0.78]],
    cabin: [[0.82, 0.86], [0.05, 1.3], [-0.95, 1.32], [-1.5, 0.92]], roofFrom: 0.25, roundTail: true, spoiler: 0.18 },
  evo: { len: 4.35, wid: 1.69, wb: 2.5, wheelR: 0.32,
    body: [[-2.17, 0.27], [2.15, 0.27], [2.2, 0.52], [2.1, 0.72], [0.8, 0.84], [-1.3, 0.9], [-2.12, 0.92], [-2.2, 0.76]],
    cabin: [[0.78, 0.84], [0.1, 1.36], [-0.95, 1.38], [-1.38, 0.9]], roofFrom: 0.3, wing: 0.42 },
  fc: { len: 4.3, wid: 1.69, wb: 2.43, wheelR: 0.3,
    body: [[-2.15, 0.26], [2.1, 0.26], [2.16, 0.42], [2.05, 0.56], [0.72, 0.78], [-1.85, 0.84], [-2.15, 0.76]],
    cabin: [[0.7, 0.77], [-0.05, 1.16], [-0.85, 1.19], [-1.9, 0.84]], roofFrom: 0.15, popup: true, hatch: true, spoiler: 0.1 },
  benz: { len: 5.1, wid: 1.9, wb: 3.05, wheelR: 0.36,
    body: [[-2.55, 0.32], [2.5, 0.32], [2.56, 0.62], [2.45, 0.86], [1.0, 0.98], [-1.65, 1.0], [-2.5, 1.0], [-2.58, 0.82]],
    cabin: [[0.98, 0.97], [0.15, 1.45], [-1.1, 1.47], [-1.75, 1.0]], roofFrom: 0.3, grille: true },
  van: { len: 4.4, wid: 1.7, wb: 2.7, wheelR: 0.3,
    body: [[-2.2, 0.3], [2.2, 0.3], [2.25, 0.7], [2.15, 0.98], [1.55, 1.12], [-2.2, 1.12]],
    cabin: [[1.55, 1.1], [1.05, 1.88], [-2.18, 1.9], [-2.2, 1.1]], roofFrom: 0.62, van: true }
};

function extrude(profile, width) {
  const s = new THREE.Shape();
  profile.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 1 });
  g.translate(0, 0, -width / 2);
  return g;
}

function decalTex(lines, opts = {}) {
  return canvasTex(opts.w || 512, opts.h || 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    lines.forEach((l) => {
      g.font = l.font; g.fillStyle = l.color; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(l.text, w / 2, l.y * h);
    });
  });
}

export class CarModel {
  constructor(spec, opts = {}) {
    this.spec = spec;
    const B = BODIES[spec.body];
    this.B = B;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // 侧倾/俯仰作用于车身
    this.group.add(this.body);
    const col = spec.color, col2 = spec.color2;
    const W = B.wid;

    const paint = (c) => toon(c, { emissive: c, emissiveIntensity: 0.14 }); // 车漆微自发光：夜里也要一眼认出车
    const shell = new THREE.Mesh(extrude(B.body, W), paint(col));
    shell.castShadow = true;
    addOutline(shell, 0.025);
    this.body.add(shell);

    if (B.two) { // 熊猫配色：下半车身黑色
      const y = B.two;
      const lower = new THREE.Mesh(extrude([[-B.len / 2 - 0.01, 0.25], [B.len / 2 + 0.03, 0.25], [B.len / 2 + 0.07, y], [-B.len / 2 - 0.01, y]], W + 0.012), toon(col2));
      this.body.add(lower);
    }
    if (B.van) { // 面包车：蓝色腰线
      const band = new THREE.Mesh(extrude([[-2.21, 0.62], [2.22, 0.62], [2.23, 0.7], [-2.21, 0.7]], W + 0.014), toon(col2));
      this.body.add(band);
    }

    const glass = toon(0x1f2533, { transparent: true, opacity: 0.82, noCache: true });
    const cabin = new THREE.Mesh(extrude(B.cabin, W * 0.86), glass);
    addOutline(cabin, 0.022);
    this.body.add(cabin);
    // 车顶与 A/C 柱用车身色
    const cb = B.cabin;
    const roofPts = [[cb[1][0] - B.roofFrom * 0.2, cb[1][1] - 0.02], [cb[1][0] + 0.02, cb[1][1] + 0.025], [cb[2][0] - 0.02, cb[2][1] + 0.025], [cb[2][0] + 0.05, cb[2][1] - 0.02]];
    const roof = new THREE.Mesh(extrude(roofPts, W * 0.87), paint(col));
    this.body.add(roof);
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.1, Math.abs(cb[1][1] - cb[0][1]), W * 0.875), toon(col));
    pillar.position.set((cb[0][0] + cb[1][0]) / 2 - 0.04, (cb[0][1] + cb[1][1]) / 2, 0);
    pillar.rotation.z = Math.atan2(cb[1][1] - cb[0][1], cb[1][0] - cb[0][0]) - Math.PI / 2;
    this.body.add(pillar);
    if (B.van) {
      for (const x of [0.3, -0.9]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, W * 0.875), toon(col)); p.position.set(x, 1.5, 0); this.body.add(p); }
    }

    // 车内剪影（司机 + 可选乘客）
    const sil = toon(0x0a0b10);
    const driverX = B.van ? 0.85 : cb[1][0] - 0.55;
    const addPerson = (x, z, band) => {
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), sil);
      head.position.set(x, (B.van ? 1.42 : cb[1][1] - 0.22), z);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.4), sil);
      torso.position.set(x - 0.05, head.position.y - 0.28, z);
      this.body.add(head, torso);
      if (band) { const b = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 4, 10), toon(0xffffff)); b.rotation.y = Math.PI / 2; b.rotation.x = Math.PI / 2; b.position.copy(head.position); b.position.y += 0.04; this.body.add(b); }
      return head;
    };
    this.driverHead = addPerson(driverX, -W * 0.22, false); // 右舵
    this.passengers = [];
    if (opts.passengers) {
      this.passengers.push(addPerson(-0.35, W * 0.2, false), addPerson(-1.25, -W * 0.2, true));
    }

    // 车轮
    this.wheels = [];
    const wg = new THREE.CylinderGeometry(B.wheelR, B.wheelR, 0.22, 12); wg.rotateX(Math.PI / 2);
    const rg = new THREE.CylinderGeometry(B.wheelR * 0.62, B.wheelR * 0.62, 0.23, 8); rg.rotateX(Math.PI / 2);
    const tireM = toon(0x15161a), rimM = toon(spec.id === 'ae86' ? 0xb8bcc4 : spec.id === 'benz' ? 0xd9dde3 : 0x9aa0a8);
    for (const [fx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const pivot = new THREE.Group();
      pivot.position.set(fx * B.wb / 2, B.wheelR, sz * (W / 2 - 0.08));
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(wg, tireM); tire.castShadow = true;
      addOutline(tire, 0.02);
      const rim = new THREE.Mesh(rg, rimM);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(B.wheelR * 1.1, 0.06, 0.24), toon(0x5a5e66));
      spin.add(tire, rim, spoke);
      pivot.add(spin);
      this.group.add(pivot);
      this.wheels.push({ pivot, spin, front: fx > 0 });
    }

    // 灯
    const fr = B.body[1][0] + 0.03;
    this.headMat = new THREE.MeshBasicMaterial({ color: 0x8890a0 });
    this.tailMat = new THREE.MeshBasicMaterial({ color: 0x5a0a0a });
    const rr = B.body[0][0] - 0.03;
    const tailY = B.body[B.body.length - 1][1] - 0.06;
    for (const sz of [1, -1]) {
      if (B.roundTail) {
        for (const dz of [0.18, 0.45]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10).rotateZ(Math.PI / 2), this.tailMat); t.position.set(rr, tailY, sz * (W / 2 - dz)); this.body.add(t); }
      } else {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, B.van ? 0.18 : 0.42), this.tailMat);
        t.position.set(rr, B.van ? 0.85 : tailY, sz * (W / 2 - 0.3)); this.body.add(t);
      }
      if (!B.popup) {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.38), this.headMat);
        h.position.set(fr + 0.02, B.van ? 0.82 : 0.56, sz * (W / 2 - 0.3)); this.body.add(h);
      }
    }
    this.popups = [];
    if (B.popup) {
      for (const sz of [1, -1]) {
        const pv = new THREE.Group();
        pv.position.set(B.body[3][0] - 0.25, B.body[3][1] + 0.01, sz * (W / 2 - 0.35));
        const lid = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.4), toon(col));
        lid.position.x = 0.17;
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.36), this.headMat);
        lamp.position.set(0.34, -0.06, 0);
        pv.add(lid, lamp);
        lid.add(new THREE.Object3D());
        this.body.add(pv); this.popups.push(pv);
      }
    }
    if (B.wing) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, W * 0.95), toon(col2));
      wing.position.set(B.body[0][0] + 0.28, B.body[B.body.length - 2][1] + B.wing, 0);
      addOutline(wing, 0.015);
      for (const sz of [1, -1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, B.wing, 0.05), toon(0x222222)); st.position.set(B.body[0][0] + 0.3, B.body[B.body.length - 2][1] + B.wing / 2, sz * W * 0.35); this.body.add(st); }
      this.body.add(wing);
    }
    if (B.spoiler) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, W * 0.9), toon(col2));
      sp.position.set(B.cabin[3][0] + 0.05, B.cabin[3][1] + B.spoiler, 0); this.body.add(sp);
    }
    if (B.grille) {
      const gtex = canvasTex(256, 128, (g, w, h) => {
        g.fillStyle = '#1a1a1e'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#d8dce2'; g.lineWidth = 6;
        for (let y = 18; y < h; y += 22) { g.beginPath(); g.moveTo(10, y); g.lineTo(w - 10, y); g.stroke(); }
        g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
        // 三叉星圈（简化，不使用官方标志图形）
        g.beginPath(); g.arc(w / 2, h / 2, 34, 0, Math.PI * 2); g.fillStyle = '#1a1a1e'; g.fill(); g.stroke();
        g.lineWidth = 5;
        for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * Math.PI * 2 / 3; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * 30, h / 2 + Math.sin(a) * 30); g.stroke(); }
      });
      const gr = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.36), new THREE.MeshBasicMaterial({ map: gtex }));
      gr.position.set(B.body[2][0] + 0.005, 0.66, 0); gr.rotation.y = Math.PI / 2; this.body.add(gr);
    }

    // 车身贴字
    if (spec.id === 'ae86') this._sideDecal(decalTex([{ text: '藤原豆腐店（自家用）', font: 'bold 56px "SimHei","Microsoft YaHei",sans-serif', color: '#111', y: 0.5 }]), -0.2, 0.62, 1.7, 0.42);
    if (spec.id === 'wuling') {
      this._sideDecal(decalTex([
        { text: '专业防水补漏', font: 'bold 64px "SimHei","Microsoft YaHei",sans-serif', color: '#d7263d', y: 0.36 },
        { text: '电话 138-0000-0000（虚构）', font: 'bold 34px "Microsoft YaHei",sans-serif', color: '#1d3f8f', y: 0.8 }
      ]), -0.4, 0.92, 2.6, 0.62);
    }
    if (opts.sticker) this._rearSticker();

    this.night = false; this.popAngle = 0; this.wheelRot = 0; this.roll = 0; this.pitch = 0;
  }

  _sideDecal(tex, x, y, w, h) {
    const W = this.B.wid;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const sz of [1, -1]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      p.position.set(x, y, sz * (W / 2 + 0.042));
      if (sz < 0) p.rotation.y = Math.PI;
      this.body.add(p);
    }
  }

  _rearSticker() {
    // 护身符：贴在车尾的五菱标（菱形简化图形）
    const tex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#d7263d';
      const dia = (cx, cy, s) => { g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 0.55, cy); g.lineTo(cx, cy + s); g.lineTo(cx - s * 0.55, cy); g.closePath(); g.fill(); };
      dia(30, 50, 26); dia(64, 78, 26); dia(98, 50, 26); dia(47, 64, 14); dia(81, 64, 14);
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshBasicMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
    p.position.set(this.B.body[0][0] - 0.045, this.B.van ? 1.0 : 0.62, 0.35); p.rotation.y = -Math.PI / 2;
    this.body.add(p);
  }

  setNight(on) {
    this.night = on;
    this.headMat.color.set(on ? 0xfff6dc : 0x9aa2b0);
  }

  /** 同步物理状态 */
  update(sim, dt, opts = {}) {
    const g = this.group;
    g.position.set(sim.x, sim.y, sim.z);
    g.rotation.y = sim.heading;
    // 车身侧倾/俯仰：横向/纵向加速度驱动，漂移时更明显
    const tRoll = clamp(-sim.latAcc * 0.011, -0.1, 0.1) + (sim.inDitch ? 0.07 * Math.sign(sim.lat) : 0);
    const tPitch = clamp(-sim.lonAcc * 0.007, -0.06, 0.06);
    this.roll += (tRoll - this.roll) * Math.min(1, dt * 8);
    this.pitch += (tPitch - this.pitch) * Math.min(1, dt * 8);
    this.body.rotation.set(this.roll, 0, this.pitch);
    this.body.position.y = sim.inDitch ? -0.05 : sim.ditchBump > 0 ? Math.sin(sim.ditchBump * 60) * 0.03 : 0;
    // 车轮：前轮显示实际转角（漂移时自动反打，指向速度方向）
    this.wheelRot -= sim.speed * dt / this.B.wheelR;
    let steerVis = sim.steer * 0.5;
    if (sim.drifting) steerVis = clamp(-sim.beta * 0.9 + sim.steer * 0.15, -0.6, 0.6);
    for (const w of this.wheels) {
      w.spin.rotation.z = this.wheelRot;
      if (w.front) w.pivot.rotation.y = steerVis;
    }
    // 刹车灯
    const br = sim.brake > 0.1 || sim.handbrake;
    this.tailMat.color.set(br ? 0xff2a2a : this.night ? 0xc0161a : 0x6a0e10);
    // 跳灯
    const tgt = this.night ? 1 : 0;
    this.popAngle += (tgt - this.popAngle) * Math.min(1, dt * 4);
    for (const p of this.popups) p.rotation.z = this.popAngle * 0.95;
    // 乘客晃动
    this.passengers.forEach((h, i) => { h.position.z += Math.sin(sim.time * 9 + i) * 0.002 + clamp(sim.latAcc * 0.0006, -0.01, 0.01); });
    if (opts.blown) this.body.position.y += Math.sin(sim.time * 40) * 0.008;
  }

  /** 尾灯世界坐标（光轨用） */
  tailPos(out, side) {
    const B = this.B;
    out.set(B.body[0][0] - 0.05, 0.6, side * (B.wid / 2 - 0.3));
    return this.group.localToWorld(out);
  }
}
