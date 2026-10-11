// 第一人称持枪视图：独立场景 + 独立相机（不穿墙、单独 FOV），弹簧驱动的摇摆/后坐/换弹/切枪动画。

import * as THREE from 'three';
import { Spring, clamp, smoothstep, lerp } from '../core/util.js';
import { buildGun, buildMuzzleFlash, createGunMaterials } from './models.js';

const win = (u, a, b, c, d) => smoothstep(a, b, u) * (1 - smoothstep(c, d, u));

export class ViewModel {
  constructor(T, envTex) {
    this.scene = new THREE.Scene();
    this.scene.environment = envTex || null;
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
    this.M = createGunMaterials(T);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.guns = {};
    for (const id of ['pistol', 'rifle', 'shotgun', 'sniper']) {
      const g = buildGun(id, this.M, true);
      g.group.visible = false;
      g.parts.magBase = g.parts.mag ? g.parts.mag.position.clone() : null;
      g.parts.pumpBase = g.parts.pump ? g.parts.pump.position.clone() : null;
      g.parts.slideBase = g.parts.slide ? g.parts.slide.position.clone() : null;
      g.parts.boltBase = g.parts.bolt ? g.parts.bolt.position.clone() : null;
      g.parts.chargeBase = g.parts.charge ? g.parts.charge.position.clone() : null;
      this.root.add(g.group);
      this.guns[id] = g;
    }
    this.flash = buildMuzzleFlash();
    this.scene.add(this.flash);
    this.flashT = 0;

    this.hemi = new THREE.HemisphereLight(0xb8c8e8, 0x40342c, 1.1);
    this.key = new THREE.DirectionalLight(0xffe2c4, 1.6);
    this.key.position.set(0.5, 1, 0.55);
    this.fill = new THREE.DirectionalLight(0x8fb4ff, 0.5);
    this.fill.position.set(-0.8, 0.3, 0.2);
    this.flashLight = new THREE.PointLight(0xffa860, 0, 2.5, 2);
    this.scene.add(this.hemi, this.key, this.fill, this.flashLight);

    this.cur = null;
    this.swayX = new Spring(90, 12);
    this.swayY = new Spring(90, 12);
    this.kickZ = new Spring(260, 18);
    this.kickX = new Spring(220, 16);
    this.kickRoll = new Spring(180, 14);
    this.land = new Spring(140, 12);
    this.slide = new Spring(900, 40);
    this.ambient = 1;
    this.time = 0;
  }

  setWeapon(id) {
    for (const [k, g] of Object.entries(this.guns)) g.group.visible = k === id;
    this.cur = this.guns[id];
    this.curId = id;
  }

  /** 开火后坐冲量 */
  kick(k = 1, roll = 0) {
    this.kickZ.impulse(1.6 * k);
    this.kickX.impulse(9 * k);
    this.kickRoll.impulse(roll);
    if (this.cur?.parts.slide) this.slide.impulse(4.5);
    this.flashT = 0.045;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    const s = (0.8 + Math.random() * 0.5) * (this.flashScale || 1);
    this.flash.scale.set(s, s, s * (0.8 + Math.random() * 0.6));
  }

  landImpact(v) {
    this.land.impulse(-Math.min(v, 14) * 0.035);
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  /**
   * s: { dt, mdx, mdy, move(0..1), grounded, bobPhase, ads, sprint, crouch,
   *      reload:{u,empty,kind,shell} | null, switchK, melee, throwK, cycle:{u,kind}|null, slideLock, ambient, fov }
   */
  update(s) {
    const g = this.cur;
    if (!g) return;
    const P = g.parts;
    const dt = s.dt;
    this.time += dt;
    const ads = smoothstep(0, 1, s.ads);
    const adsInv = 1 - ads;
    // 腰射位置更远，位移类动画按距离放大，保证屏幕上幅度一致
    const amp = lerp(2.0, 1, ads);

    // 摇摆
    this.swayX.target = clamp(-s.mdx * 0.0009, -0.05, 0.05) * (1 - ads * 0.75);
    this.swayY.target = clamp(s.mdy * 0.0009, -0.05, 0.05) * (1 - ads * 0.75);
    this.swayX.update(dt);
    this.swayY.update(dt);
    this.kickZ.update(dt);
    this.kickX.update(dt);
    this.kickRoll.update(dt);
    this.land.update(dt);
    this.slide.update(dt);

    // 基础姿态
    const hip = P.hip;
    const adsPos = new THREE.Vector3(-P.sight.x, -P.sight.y, P.adsZ - P.sight.z);
    const pos = new THREE.Vector3().lerpVectors(hip, adsPos, ads);
    const rot = new THREE.Euler(0, 0, 0, 'YXZ');
    if (P.hipRot) {
      rot.x += P.hipRot.x * adsInv;
      rot.y += P.hipRot.y * adsInv;
      rot.z += P.hipRot.z * adsInv;
    }

    // 呼吸与步伐摆动
    const breathe = Math.sin(this.time * 1.5) * 0.0025 * (1 - ads * 0.85);
    pos.y += breathe;
    const bobK = s.move * (s.grounded ? 1 : 0.2) * (1 - ads * 0.85) * (1 + s.sprint * 0.8);
    pos.x += Math.sin(s.bobPhase) * 0.011 * bobK * amp;
    pos.y += -Math.abs(Math.cos(s.bobPhase)) * 0.009 * bobK * amp;
    rot.z += Math.sin(s.bobPhase) * 0.012 * bobK;

    pos.x += this.swayX.value * amp;
    pos.y += this.swayY.value * amp;
    rot.y += this.swayX.value * 1.6;
    rot.x += this.swayY.value * 1.2;

    // 冲刺
    const sp = smoothstep(0, 1, s.sprint) * adsInv;
    pos.x += -0.06 * sp;
    pos.y += -0.08 * sp;
    pos.z += 0.06 * sp;
    rot.x += -0.32 * sp;
    rot.y += 0.62 * sp;
    rot.z += 0.22 * sp;

    // 蹲伏轻微倾斜
    rot.z += 0.06 * s.crouch * adsInv;

    // 后坐
    pos.z += this.kickZ.value * 0.02 * (1 - ads * 0.35) * amp;
    rot.x += this.kickX.value * 0.006 * (1 - ads * 0.5);
    rot.z += this.kickRoll.value * 0.01;
    pos.y += this.land.value * amp;

    // 换弹
    let magOff = 0, leftOff = new THREE.Vector3();
    if (s.reload) {
      const u = s.reload.u;
      if (s.reload.kind === 'shells') {
        // 霰弹：起手-逐发-收尾
        const tilt = s.reload.tilt;
        rot.z += 0.42 * tilt;
        rot.x += 0.18 * tilt;
        pos.x -= 0.03 * tilt;
        pos.y -= 0.02 * tilt;
        const push = s.reload.shell; // 0..1 每发
        const h = win(push, 0.0, 0.35, 0.55, 0.95);
        leftOff.set(0.015 * h, -0.05 * h, 0.17 * h);
        if (push > 0.4 && push < 0.6) pos.z += 0.006;
      } else {
        const tilt = win(u, 0.03, 0.2, 0.84, 0.98);
        rot.z += 0.5 * tilt;
        rot.x += 0.2 * tilt;
        pos.x -= 0.02 * tilt;
        pos.y -= 0.025 * tilt;
        // 弹匣：抽出→下落→新匣上升→插入
        if (u < 0.15) magOff = 0;
        else if (u < 0.3) magOff = smoothstep(0.15, 0.3, u) * 0.3;
        else if (u < 0.42) magOff = 0.3 - smoothstep(0.3, 0.42, u) * 0.24;
        else if (u < 0.52) magOff = 0.06 * (1 - smoothstep(0.42, 0.52, u));
        else magOff = 0;
        const lh = win(u, 0.1, 0.18, 0.5, 0.62);
        leftOff.set(0.03 * lh, -magOff * 0.9 * lh - 0.04 * lh, 0.12 * lh + (P.mag ? (P.magBase.z - (P.leftBase?.z ?? 0)) * lh : 0));
        if (u > 0.5 && u < 0.56) {
          pos.y += 0.008 * Math.sin(((u - 0.5) / 0.06) * Math.PI);
          rot.x -= 0.02;
        }
        if (s.reload.empty) {
          const c = win(u, 0.7, 0.74, 0.8, 0.86);
          if (P.charge) P.charge.position.z = P.chargeBase.z + 0.06 * c;
          if (P.slide && u < 0.78) this.slide.value = 0.6;
          rot.z += 0.08 * c;
        }
      }
    } else if (P.charge) P.charge.position.z = P.chargeBase.z;
    if (P.mag) {
      P.mag.position.y = P.magBase.y - magOff;
      P.mag.visible = magOff < 0.27;
    }
    if (P.leftArm) P.leftArm.position.copy(P.leftBase).add(leftOff);

    // 泵动 / 拉栓
    if (P.pump) P.pump.position.z = P.pumpBase.z;
    if (P.bolt) {
      P.bolt.position.copy(P.boltBase);
      P.bolt.rotation.set(0, 0, 0);
    }
    if (s.cycle) {
      const u = s.cycle.u;
      if (s.cycle.kind === 'pump' && P.pump) {
        const back = u < 0.45 ? smoothstep(0.05, 0.4, u) : 1 - smoothstep(0.5, 0.85, u);
        P.pump.position.z = P.pumpBase.z + 0.075 * back;
        if (P.leftArm) P.leftArm.position.z += 0.075 * back;
        rot.x += 0.05 * back * adsInv;
        rot.z += 0.04 * back * adsInv;
      }
      if (s.cycle.kind === 'bolt' && P.bolt) {
        const up = win(u, 0.05, 0.2, 0.75, 0.9);
        const back = win(u, 0.25, 0.42, 0.55, 0.72);
        P.bolt.rotation.z = up * 1.1;
        P.bolt.position.z = P.boltBase.z + back * 0.07;
        rot.z += 0.1 * up * adsInv;
        rot.x += 0.04 * up;
        pos.y -= 0.01 * up * adsInv;
      }
    }
    if (P.slide) {
      const sv = s.slideLock ? 1 : clamp(this.slide.value * 0.2, 0, 1);
      P.slide.position.z = P.slideBase.z + 0.032 * sv;
    }

    // 切枪
    const sw = smoothstep(0, 1, s.switchK);
    pos.y -= 0.45 * sw;
    rot.x -= 0.9 * sw;
    rot.z += 0.25 * sw;

    // 近战（枪托前推左摆）
    if (s.melee > 0) {
      const m = win(s.melee, 0.0, 0.2, 0.35, 0.85);
      pos.z -= 0.14 * m;
      pos.x -= 0.1 * m;
      pos.y += 0.04 * m;
      rot.y += 0.7 * m;
      rot.z -= 0.5 * m;
    }
    // 投掷：枪下沉
    if (s.throwK > 0) {
      const t = win(s.throwK, 0, 0.2, 0.6, 1);
      pos.y -= 0.22 * t;
      pos.x += 0.05 * t;
      rot.x -= 0.6 * t;
    }

    this.root.position.copy(pos);
    this.root.rotation.copy(rot);

    // 枪口焰
    this.flashT -= dt;
    const fl = this.flashT > 0;
    this.flash.visible = fl && !(s.hideFlash);
    if (fl) {
      this.root.updateMatrixWorld(true);
      const m = P.muzzle.clone();
      g.group.localToWorld(m);
      this.flash.position.copy(m);
      this.flash.quaternion.copy(this.root.quaternion);
      this.flashLight.position.copy(m);
      this.flashLight.intensity = 6;
    } else this.flashLight.intensity = 0;

    // 光照随环境
    this.ambient = lerp(this.ambient, s.ambient ?? 1, Math.min(1, dt * 3));
    this.hemi.intensity = 1.05 * this.ambient;
    this.key.intensity = 1.5 * this.ambient;
    this.fill.intensity = 0.45 + 0.1 * this.ambient;

    const fov = lerp(this.baseFov ?? 50, 40, ads);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** 视图空间点 → 主相机世界坐标（考虑两台相机 FOV 不同） */
  viewToWorld(local, mainCam, out) {
    const v = local.clone();
    this.root.updateMatrixWorld(true);
    this.cur.group.localToWorld(v); // root 下的世界 = 视图相机空间
    const ndc = v.clone().applyMatrix4(this.camera.projectionMatrix);
    const depth = -v.z;
    const th = Math.tan((mainCam.fov * Math.PI) / 360);
    out.set(ndc.x * depth * th * mainCam.aspect, ndc.y * depth * th, -depth);
    return mainCam.localToWorld(out);
  }
}
