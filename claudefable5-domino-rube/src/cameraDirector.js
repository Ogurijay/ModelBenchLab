// ============================================================
// cameraDirector.js — 双模式相机
// 自动运镜:按当前阶段锁定活动机关,阻尼插值跟拍
// 手动模式:OrbitControls 轨道控制
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SEESAW, PENDULUM, BELL, LANE_Z } from './config.js';

const ESTABLISH = { pos: new THREE.Vector3(6.4, 5.2, 8.8), look: new THREE.Vector3(-0.2, 0.7, 0) };

export class CameraDirector {
  constructor(dom) {
    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 120);
    this.camera.position.copy(ESTABLISH.pos);
    this.lookTarget = ESTABLISH.look.clone();
    this.camera.lookAt(this.lookTarget);

    this.controls = new OrbitControls(this.camera, dom);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 30;
    this.controls.target.copy(this.lookTarget);
    this.controls.enabled = false;

    this.mode = 'auto';               // 'auto' | 'manual'
    this.machine = null;
    this._desired = ESTABLISH.pos.clone();
    this._desiredLook = ESTABLISH.look.clone();
    this._tmp = new THREE.Vector3();
  }

  bind(machine) { this.machine = machine; }

  toggle() {
    this.setMode(this.mode === 'auto' ? 'manual' : 'auto');
    return this.mode;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'manual') {
      this.controls.target.copy(this.lookTarget);
      this.controls.enabled = true;
      this.controls.update();
    } else {
      this.controls.enabled = false;
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 多米诺波前:最后一张已明显倾倒的骨牌位置 */
  #dominoFront() {
    const doms = this.machine.dyn.dominoes;
    let front = doms[0];
    for (const d of doms) {
      // 刚体局部 +y 在世界系中的 y 分量(1=直立)
      const q = d.quaternion;
      const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      if (upY < 0.9) front = d; else if (front !== doms[0]) break;
    }
    return front.position;
  }

  #computeAutoTarget() {
    const m = this.machine;
    const st = m ? m.currentStage : 0;
    const set = (fx, fy, fz, ox, oy, oz) => {
      this._desiredLook.set(fx, fy, fz);
      this._desired.set(fx + ox, fy + oy, fz + oz);
    };
    if (!m || st === 0) {
      this._desired.copy(ESTABLISH.pos);
      this._desiredLook.copy(ESTABLISH.look);
      return;
    }
    switch (st) {
      case 1: {
        const p = this.#dominoFront();
        set(p.x, 1.35, p.z, 2.3, 1.9, 3.1);
        break;
      }
      case 2: {
        const p = m.dyn.bigBall.position;
        set(p.x + 0.3, p.y, p.z, 1.5, 1.5, 3.0);
        break;
      }
      case 3:
        set(SEESAW.pivotX + 0.4, 0.7, LANE_Z, 0.4, 1.7, 3.3);
        break;
      case 4: {
        const p = m.dyn.bob.position;
        set(p.x, p.y + 0.2, p.z, -0.6, 0.9, 3.1);
        break;
      }
      case 5:
      default: {
        // 响铃后 2.5 秒拉回全景
        const since = m.simTime - (m.bellRungAt >= 0 ? m.bellRungAt : m.simTime);
        if (m.bellRung && since > 2.5) {
          this._desired.copy(ESTABLISH.pos);
          this._desiredLook.copy(ESTABLISH.look);
        } else {
          set(BELL.x - 0.2, BELL.y + 0.15, LANE_Z, -1.7, 0.9, 2.7);
        }
        break;
      }
    }
  }

  update(dt) {
    if (this.mode === 'manual') {
      this.controls.update();
      this.lookTarget.copy(this.controls.target);
      return;
    }
    this.#computeAutoTarget();
    const k = 1 - Math.exp(-2.6 * dt);
    this.camera.position.lerp(this._desired, k);
    this.lookTarget.lerp(this._desiredLook, k);
    this.camera.lookAt(this.lookTarget);
  }
}
