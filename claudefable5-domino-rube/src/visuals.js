// ============================================================
// visuals.js — 机关的视觉层:网格构建、物理同步、响铃特效
// 动态网格与刚体一一绑定;复位时只重绑新刚体,网格复用
// ============================================================
import * as THREE from 'three';
import {
  LANE_Z, DOMINO, LEDGE, BIG_BALL, RAMP, TRACK, SEESAW, SMALL_BALL,
  PENDULUM, BELL, MESA,
} from './config.js';

export class MachineVisuals {
  constructor(scene, mats, bellSpot) {
    this.scene = scene;
    this.mats = mats;
    this.bellSpot = bellSpot;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.syncPairs = [];       // [{mesh, body}]
    this.bellFx = { t: -1 };   // 响铃特效计时
    this.#buildStatics();
    this.#buildDynamics();
    this.#buildBellAndFx();
  }

  // ---------- 静态布景(斜坡 / 直道 / 支架等) ----------
  #buildStatics() {
    const g = this.group, m = this.mats;
    const add = (mesh) => { mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); return mesh; };

    // 发球台栈桥 + 挡唇
    const lLen = LEDGE.x1 - LEDGE.x0;
    const ledge = add(new THREE.Mesh(new THREE.BoxGeometry(lLen, LEDGE.thick, LEDGE.width), m.midWood));
    ledge.position.set((LEDGE.x0 + LEDGE.x1) / 2, MESA.height - LEDGE.thick / 2, LANE_Z);
    // 平贴铜条(纯装饰,不参与物理,标记发球位)
    const lip = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, LEDGE.width), m.brass));
    lip.position.set(BIG_BALL.lipX, MESA.height + 0.003, LANE_Z);
    // 栈桥吊柱
    const pier = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, MESA.height - LEDGE.thick, 0.1), m.darkWood));
    pier.position.set(LEDGE.x1 - 0.1, (MESA.height - LEDGE.thick) / 2, LANE_Z);

    // 斜坡(与物理同参数)
    this.#slope(RAMP.topX, RAMP.topY, RAMP.botX, RAMP.botY, RAMP);
    // 高架直道
    const tLen = TRACK.x1 - TRACK.x0, tcx = (TRACK.x0 + TRACK.x1) / 2;
    const tf = add(new THREE.Mesh(new THREE.BoxGeometry(tLen, TRACK.thick, TRACK.width), m.midWood));
    tf.position.set(tcx, TRACK.y - TRACK.thick / 2, LANE_Z);
    for (const s of [-1, 1]) {
      const rail = add(new THREE.Mesh(new THREE.BoxGeometry(tLen, TRACK.railH, TRACK.railT), m.darkWood));
      rail.position.set(tcx, TRACK.y + TRACK.railH / 2, LANE_Z + s * (TRACK.width / 2 + TRACK.railT / 2));
      const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, TRACK.y - TRACK.thick, 0.08), m.darkWood));
      post.position.set(tcx, (TRACK.y - TRACK.thick) / 2, LANE_Z + s * (TRACK.width / 2 + 0.09));
    }

    // 跷跷板支座(金属叉架 + 轴销)
    const base = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), m.ironDark));
    base.position.set(SEESAW.pivotX, 0.03, LANE_Z);
    for (const s of [-1, 1]) {
      const cheek = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, SEESAW.pivotY, 0.05), m.ironDark));
      cheek.position.set(SEESAW.pivotX, SEESAW.pivotY / 2, LANE_Z + s * (SEESAW.width / 2 + 0.05));
    }
    const axle = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, SEESAW.width + 0.24, 16), m.steel));
    axle.rotation.x = Math.PI / 2;
    axle.position.set(SEESAW.pivotX, SEESAW.pivotY, LANE_Z);

    // 近端止挡块(与物理同参数:板下摆到 stopDeg 即被挡住)
    const ts = (SEESAW.stopDeg * Math.PI) / 180;
    const stopX = SEESAW.pivotX - SEESAW.halfLen * Math.cos(ts) + (SEESAW.thick / 2) * Math.sin(ts);
    const stopTop = SEESAW.pivotY - SEESAW.halfLen * Math.sin(ts) - (SEESAW.thick / 2) * Math.cos(ts);
    const stopper = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, stopTop, 0.36), m.ironDark));
    stopper.position.set(stopX, stopTop / 2, LANE_Z);
    const stopPad = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.36), m.brass));
    stopPad.position.set(stopX, stopTop - 0.01, LANE_Z);

    // 摆锤龙门架
    const py = PENDULUM.bobY + PENDULUM.rodLen;
    for (const s of [-1, 1]) {
      const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, py + 0.25, 12), m.ironDark));
      leg.position.set(PENDULUM.bobX, (py + 0.25) / 2, LANE_Z + s * PENDULUM.gantryHalfSpan);
    }
    const beam = add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, PENDULUM.gantryHalfSpan * 2 + 0.14, 12), m.brass));
    beam.rotation.x = Math.PI / 2;
    beam.position.set(PENDULUM.bobX, py, LANE_Z);

    // 铃铛吊架(拱门)
    const by = BELL.y + BELL.r + 0.66;
    for (const s of [-1, 1]) {
      const leg = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, by, 12), m.ironDark));
      leg.position.set(BELL.standX, by / 2, LANE_Z + s * 0.52);
    }
    const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.16, 12), m.brass));
    bar.rotation.x = Math.PI / 2;
    bar.position.set(BELL.standX, by, LANE_Z);
  }

  #slope(x0, y0, x1, y1, cfg) {
    const g = this.group, m = this.mats;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const nx = -dy / len, ny = dx / len;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const mk = (w, h, d, px, py, pz) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        h > 0.1 ? m.darkWood : m.midWood);
      mesh.position.set(px, py, pz);
      mesh.rotation.z = ang;
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
    };
    mk(len + 0.12, cfg.thick, cfg.width, mx - nx * cfg.thick / 2, my - ny * cfg.thick / 2, LANE_Z);
    for (const s of [-1, 1]) {
      mk(len + 0.12, cfg.railH, cfg.railT,
        mx + nx * cfg.railH / 2, my + ny * cfg.railH / 2,
        LANE_Z + s * (cfg.width / 2 + cfg.railT / 2));
    }
  }

  // ---------- 动态网格 ----------
  #buildDynamics() {
    const g = this.group, m = this.mats;

    // 多米诺:沿链条的暖→冷色相扫描
    const total = DOMINO.arcCount + DOMINO.straightCount;
    const dominoGeo = new THREE.BoxGeometry(DOMINO.t, DOMINO.h, DOMINO.w);
    this.dominoMeshes = [];
    for (let i = 0; i < total; i++) {
      const col = new THREE.Color().setHSL(
        0.02 + (i / (total - 1)) * 0.5, 0.62, 0.56);
      const mesh = new THREE.Mesh(dominoGeo, new THREE.MeshStandardMaterial({
        color: col, roughness: 0.38, metalness: 0.05,
      }));
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      this.dominoMeshes.push(mesh);
    }

    // 重球(钢)
    this.bigBallMesh = new THREE.Mesh(new THREE.SphereGeometry(BIG_BALL.r, 32, 24), m.steel);
    this.bigBallMesh.castShadow = true;
    g.add(this.bigBallMesh);

    // 弹射小球(黄铜)
    this.smallBallMesh = new THREE.Mesh(new THREE.SphereGeometry(SMALL_BALL.r, 24, 18), m.brass);
    this.smallBallMesh.castShadow = true;
    g.add(this.smallBallMesh);

    // 跷跷板(组:板 + 四面杯唇,与物理复合体逐一对应)
    const plankGroup = new THREE.Group();
    const plankMesh = new THREE.Mesh(
      new THREE.BoxGeometry(SEESAW.halfLen * 2, SEESAW.thick, SEESAW.width), m.midWood);
    plankMesh.castShadow = plankMesh.receiveShadow = true;
    plankGroup.add(plankMesh);
    const lipY = SEESAW.thick / 2 + SEESAW.cupLipH / 2;
    const lipDefs = [
      [SEESAW.cupLipT, SEESAW.cupLipH, 0.34, SEESAW.cupOffset - 0.19, lipY, 0],
      [SEESAW.cupLipT, SEESAW.cupLipH, 0.34,
        Math.min(SEESAW.cupOffset + 0.19, SEESAW.halfLen - SEESAW.cupLipT / 2), lipY, 0],
      [0.38, SEESAW.cupLipH, SEESAW.cupLipT, SEESAW.cupOffset, lipY, 0.17],
      [0.38, SEESAW.cupLipH, SEESAW.cupLipT, SEESAW.cupOffset, lipY, -0.17],
    ];
    for (const [w, h, d, x, y, z] of lipDefs) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m.brass);
      lip.position.set(x, y, z);
      lip.castShadow = true;
      plankGroup.add(lip);
    }
    g.add(plankGroup);
    this.plankGroup = plankGroup;

    // 摆锤锤球 + 摆杆(杆为视觉件,每帧对齐铰点→锤心)
    this.bobMesh = new THREE.Mesh(new THREE.SphereGeometry(PENDULUM.bobR, 32, 24), m.steel);
    this.bobMesh.castShadow = true;
    g.add(this.bobMesh);
    this.rodMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, PENDULUM.rodLen, 10), m.ironDark);
    this.rodMesh.castShadow = true;
    g.add(this.rodMesh);
    this.pivotPoint = new THREE.Vector3(PENDULUM.bobX, PENDULUM.bobY + PENDULUM.rodLen, LANE_Z);
  }

  // ---------- 铃铛 + 特效 ----------
  #buildBellAndFx() {
    const g = this.group;
    // 钟形旋成体:原点设在吊点,便于响铃摇摆
    const pts = [];
    const prof = [
      [0.00, 0.00], [0.055, -0.01], [0.09, -0.06], [0.115, -0.16],
      [0.135, -0.28], [0.17, -0.38], [0.23, -0.45], [0.275, -0.49], [0.285, -0.52],
    ];
    for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
    const bellMat = new THREE.MeshStandardMaterial({
      color: 0xE8B84F, roughness: 0.22, metalness: 1.0,
      emissive: 0xFF9A2E, emissiveIntensity: 0.0,
    });
    const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), bellMat);
    bell.castShadow = true;
    // 吊点位于铃口上方:物理球心 (BELL.x, BELL.y) ≈ 钟体中部(吊点 y + 0.28)
    this.bellHang = new THREE.Vector3(BELL.x, BELL.y + 0.28, LANE_Z);
    bell.position.copy(this.bellHang);
    g.add(bell);
    this.bellMesh = bell;
    this.bellMat = bellMat;

    // 钟锤(视觉)
    const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), this.mats.ironDark);
    clapper.position.set(0, -0.46, 0);
    bell.add(clapper);
    // 吊环
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 16), this.mats.brass);
    hook.position.set(0, 0.03, 0);
    bell.add(hook);
    // 吊杆:拱门横梁 → 吊点
    const barY = BELL.y + BELL.r + 0.66;
    const hangLen = barY - this.bellHang.y - 0.04;
    const hanger = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, hangLen, 8), this.mats.ironDark);
    hanger.position.set(BELL.x, (barY + this.bellHang.y + 0.04) / 2, LANE_Z);
    g.add(hanger);

    // 彩屑粒子(响铃时迸发)
    const N = 150;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.055, vertexColors: true, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.confetti.frustumCulled = false;
    g.add(this.confetti);
    this.confettiVel = new Float32Array(N * 3);
    this.confettiN = N;
  }

  /** 触发响铃特效 */
  ringBell() {
    this.bellFx.t = 0;
    // 彩屑初始化(确定性伪随机,只影响视觉)
    let s = 12345;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const pos = this.confetti.geometry.attributes.position.array;
    const col = this.confetti.geometry.attributes.color.array;
    const palette = [[1, 0.72, 0.3], [1, 0.45, 0.35], [0.55, 0.9, 0.75], [0.95, 0.9, 0.6]];
    for (let i = 0; i < this.confettiN; i++) {
      pos[i * 3] = BELL.x; pos[i * 3 + 1] = BELL.y; pos[i * 3 + 2] = LANE_Z;
      const th = rnd() * Math.PI * 2, ph = rnd() * Math.PI;
      const sp = 1.2 + rnd() * 2.4;
      this.confettiVel[i * 3] = Math.sin(ph) * Math.cos(th) * sp;
      this.confettiVel[i * 3 + 1] = Math.abs(Math.cos(ph)) * sp * 1.4 + 0.8;
      this.confettiVel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
      const c = palette[(rnd() * palette.length) | 0];
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    this.confetti.geometry.attributes.position.needsUpdate = true;
    this.confetti.geometry.attributes.color.needsUpdate = true;
  }

  /** 绑定(或复位后重绑)物理机关 */
  bind(machine) {
    this.machine = machine;
    this.bellFx.t = -1;
    this.bellMat.emissiveIntensity = 0;
    this.bellSpot.intensity = 0;
    this.bellMesh.rotation.set(0, 0, 0);
    this.confetti.material.opacity = 0;
  }

  /** 每渲染帧同步 + 特效推进 */
  update(dt) {
    const dyn = this.machine.dyn;
    // 多米诺
    for (let i = 0; i < this.dominoMeshes.length; i++) {
      const b = dyn.dominoes[i], mesh = this.dominoMeshes[i];
      mesh.position.copy(b.position);
      mesh.quaternion.copy(b.quaternion);
    }
    this.bigBallMesh.position.copy(dyn.bigBall.position);
    this.bigBallMesh.quaternion.copy(dyn.bigBall.quaternion);
    this.smallBallMesh.position.copy(dyn.smallBall.position);
    this.smallBallMesh.quaternion.copy(dyn.smallBall.quaternion);
    this.plankGroup.position.copy(dyn.plank.position);
    this.plankGroup.quaternion.copy(dyn.plank.quaternion);
    this.bobMesh.position.copy(dyn.bob.position);

    // 摆杆:铰点 → 锤心
    const bobP = this.bobMesh.position;
    const mid = this.pivotPoint.clone().add(bobP).multiplyScalar(0.5);
    this.rodMesh.position.copy(mid);
    const dir = bobP.clone().sub(this.pivotPoint).normalize();
    this.rodMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);

    // 响铃特效
    if (this.bellFx.t >= 0) {
      this.bellFx.t += dt;
      const t = this.bellFx.t;
      const decay = Math.exp(-t * 1.6);
      this.bellMat.emissiveIntensity = 1.8 * decay;
      this.bellSpot.intensity = 26 * decay;
      this.bellMesh.rotation.z = 0.16 * Math.sin(t * 14) * decay;
      // 彩屑
      const pos = this.confetti.geometry.attributes.position.array;
      const life = 1.8;
      if (t < life) {
        this.confetti.material.opacity = Math.min(1, (life - t) / 0.6);
        for (let i = 0; i < this.confettiN; i++) {
          this.confettiVel[i * 3 + 1] -= 3.5 * dt;
          pos[i * 3] += this.confettiVel[i * 3] * dt;
          pos[i * 3 + 1] += this.confettiVel[i * 3 + 1] * dt;
          pos[i * 3 + 2] += this.confettiVel[i * 3 + 2] * dt;
        }
        this.confetti.geometry.attributes.position.needsUpdate = true;
      } else {
        this.confetti.material.opacity = 0;
      }
      if (t > 6) this.bellFx.t = -1;
    }
  }
}
