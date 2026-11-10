import * as THREE from 'three';
import { sampleOceanSurface, GRAVITY } from './waves.js';

const RHO_WATER = 1025.0;
const _up = new THREE.Vector3(0, 1, 0);
const _tempVec = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _rotQuat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

/**
 * 多采样点阿基米德浮力、波浪轨道速度阻尼、扶正力矩、系泊锚链与水龙卷牵引求解器
 */
export class BuoyancyWorld {
  constructor() {
    this.bodies = [];
    this.dynamicFloaters = [];
    this.maxDynamicFloaters = 18;
  }

  addBody(bodyConfig) {
    const body = {
      id: bodyConfig.id || `floater_${Math.random().toString(36).slice(2, 8)}`,
      kind: bodyConfig.kind || 'crate',
      mesh: bodyConfig.mesh,
      isDynamicSpawn: Boolean(bodyConfig.isDynamicSpawn),
      mass: bodyConfig.mass || 120,
      displacementVolume: bodyConfig.displacementVolume || 0.28,
      waterlineOffset: bodyConfig.waterlineOffset ?? 0.0,
      pitchStiffness: bodyConfig.pitchStiffness ?? 6.5,
      rollStiffness: bodyConfig.rollStiffness ?? 7.0,
      normalFollow: bodyConfig.normalFollow ?? 0.68,
      collisionRadius: bodyConfig.collisionRadius ?? 1.2,
      samplePoints: bodyConfig.samplePoints || [
        { x: -0.6, y: 0, z: -0.6, weight: 0.25 },
        { x: 0.6, y: 0, z: -0.6, weight: 0.25 },
        { x: -0.6, y: 0, z: 0.6, weight: 0.25 },
        { x: 0.6, y: 0, z: 0.6, weight: 0.25 }
      ],
      mooring: bodyConfig.mooring || null,
      position: bodyConfig.mesh.position.clone(),
      velocity: bodyConfig.initialVelocity ? bodyConfig.initialVelocity.clone() : new THREE.Vector3(),
      angularVel: new THREE.Vector2(0, 0), // (pitchVel, rollVel)
      angles: new THREE.Vector2(0, 0), // (pitch, roll)
      yaw: bodyConfig.yaw ?? bodyConfig.mesh.rotation.y ?? 0,
      yawVel: 0,
      lastWaveHeight: 0,
      submergedRatio: 0,
      grabbed: false,
      enteredWater: Boolean(bodyConfig.enteredWater ?? true)
    };

    this.bodies.push(body);
    if (body.isDynamicSpawn) {
      this.dynamicFloaters.push(body);
    }
    return body;
  }

  removeBody(body, scene) {
    const idx = this.bodies.indexOf(body);
    if (idx !== -1) this.bodies.splice(idx, 1);
    const dIdx = this.dynamicFloaters.indexOf(body);
    if (dIdx !== -1) this.dynamicFloaters.splice(dIdx, 1);
    if (scene && body.mesh) {
      scene.remove(body.mesh);
    }
  }

  clearDynamicFloaters(scene) {
    for (const b of [...this.dynamicFloaters]) {
      this.removeBody(b, scene);
    }
  }

  /**
   * 单步推进所有浮体的多点浮力与流体阻尼
   */
  step(dt, time, spectrum, tornadoState = null, onSplashCallback = null) {
    const clampedDt = Math.min(dt, 0.05);
    if (clampedDt <= 1e-5) return;

    const subSteps = 2;
    const hDt = clampedDt / subSteps;

    for (let stepIdx = 0; stepIdx < subSteps; stepIdx++) {
      for (const b of this.bodies) {
        if (b.grabbed) continue;

        const cosY = Math.cos(b.yaw);
        const sinY = Math.sin(b.yaw);

        let avgWaveY = 0;
        let avgNx = 0;
        let avgNy = 0;
        let avgNz = 0;
        let avgVx = 0;
        let avgVy = 0;
        let avgVz = 0;
        let pitchTorque = 0;
        let rollTorque = 0;
        let submergedSum = 0;

        for (const pt of b.samplePoints) {
          // 将局部采样点旋转到世界水平位置
          const wx = b.position.x + pt.x * cosY + pt.z * sinY;
          const wz = b.position.z - pt.x * sinY + pt.z * cosY;

          const surf = sampleOceanSurface(spectrum, wx, wz, time, tornadoState);
          const w = pt.weight;

          avgWaveY += surf.height * w;
          avgNx += surf.normal.x * w;
          avgNy += surf.normal.y * w;
          avgNz += surf.normal.z * w;
          avgVx += surf.velocity.x * w;
          avgVy += surf.velocity.y * w;
          avgVz += surf.velocity.z * w;

          // 采样点当前世界高度（含俯仰与横摇偏置）
          const ptWorldY = b.position.y + pt.y - pt.z * Math.sin(b.angles.x) + pt.x * Math.sin(b.angles.y);
          const depth = (surf.height + b.waterlineOffset) - ptWorldY;
          const sub = THREE.MathUtils.clamp(depth * 0.85 + 0.5, 0.0, 1.4);
          submergedSum += Math.min(1.0, Math.max(0.0, sub)) * w;

          // 各采样点浸没深度差产生恢复俯仰/横摇力矩
          pitchTorque += -pt.z * depth * w;
          rollTorque += pt.x * depth * w;
        }

        b.lastWaveHeight = avgWaveY;
        b.submergedRatio = submergedSum;

        // 检测抛掷物首次入水瞬间触发水花
        const targetEquilibriumY = avgWaveY + b.waterlineOffset;
        if (!b.enteredWater && b.position.y <= targetEquilibriumY + 0.35) {
          b.enteredWater = true;
          if (onSplashCallback) {
            onSplashCallback(b.position.x, avgWaveY, b.position.z, Math.abs(b.velocity.y));
          }
        }

        if (b.position.y > targetEquilibriumY + 0.45 && b.submergedRatio < 0.05) {
          // 空中抛物自由落体段
          b.velocity.y -= GRAVITY * hDt;
          b.velocity.x *= 1.0 - 0.25 * hDt;
          b.velocity.z *= 1.0 - 0.25 * hDt;
        } else {
          // 浸水段：阿基米德浮力弹簧 + 水质点垂直轨道速度阻尼
          const depthError = targetEquilibriumY - b.position.y;
          const springK = b.kind === 'ship' ? 26.0 : 32.0;
          const dampC = b.kind === 'ship' ? 7.8 : 8.8;
          const relVy = avgVy - b.velocity.y;
          const ay = depthError * springK + relVy * dampC;
          b.velocity.y += ay * hDt;
          b.velocity.y = THREE.MathUtils.clamp(b.velocity.y, -14.0, 14.0);

          // 水平随流漂移阻尼（浮体受波浪轨道速度与风漂流驱动）
          const driftFactor = b.kind === 'ship' ? 0.32 : 0.65;
          b.velocity.x += (avgVx * driftFactor - b.velocity.x) * Math.min(1.0, 3.2 * hDt);
          b.velocity.z += (avgVz * driftFactor - b.velocity.z) * Math.min(1.0, 3.2 * hDt);
        }

        // 系泊锚链弹性回复力（用于航标与锚泊状态）
        if (b.mooring) {
          const dx = b.position.x - b.mooring.x;
          const dz = b.position.z - b.mooring.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.01) {
            const slackPull = Math.max(0, dist - (b.mooring.slackRadius || 1.2));
            const pull = (dist * 0.35 + slackPull * 2.8) * (b.mooring.stiffness || 2.2);
            b.velocity.x -= (dx / dist) * pull * hDt;
            b.velocity.z -= (dz / dist) * pull * hDt;
          }
        }

        // 水龙卷对自由浮体的旋涡牵引力
        if (tornadoState && tornadoState.strength > 0.05 && b.kind !== 'ship') {
          const dx = tornadoState.x - b.position.x;
          const dz = tornadoState.z - b.position.z;
          const dist = Math.hypot(dx, dz) + 0.1;
          if (dist < 95) {
            const pullStrength = tornadoState.strength * (1.0 - dist / 95) * 8.5;
            // 切向旋转 + 轻微向心牵引
            b.velocity.x += ((-dz / dist) * 0.8 + (dx / dist) * 0.25) * pullStrength * hDt;
            b.velocity.z += ((dx / dist) * 0.8 + (dz / dist) * 0.25) * pullStrength * hDt;
          }
        }

        b.position.x += b.velocity.x * hDt;
        b.position.y += b.velocity.y * hDt;
        b.position.z += b.velocity.z * hDt;

        // 防止极端巨浪下浮体短暂穿透海面过深
        const minAllowedY = targetEquilibriumY - (b.kind === 'ship' ? 1.35 : 0.85);
        if (b.position.y < minAllowedY) {
          b.position.y = minAllowedY;
          if (b.velocity.y < 0) b.velocity.y *= 0.25;
        }

        // 计算局部波面法线在船体坐标系下的目标俯仰角与横摇角
        const nLen = Math.hypot(avgNx, avgNy, avgNz) || 1.0;
        const nx = avgNx / nLen;
        const nz = avgNz / nLen;
        const localSlopeForward = nx * sinY + nz * cosY;
        const localSlopeRight = nx * cosY - nz * sinY;

        const targetPitch = THREE.MathUtils.clamp(
          -localSlopeForward * b.normalFollow + pitchTorque * 0.25,
          -0.52,
          0.52
        );
        const targetRoll = THREE.MathUtils.clamp(
          localSlopeRight * b.normalFollow + rollTorque * 0.25,
          -0.58,
          0.58
        );

        const pitchAcc = (targetPitch - b.angles.x) * b.pitchStiffness - b.angularVel.x * 4.2;
        const rollAcc = (targetRoll - b.angles.y) * b.rollStiffness - b.angularVel.y * 4.2;

        b.angularVel.x += pitchAcc * hDt;
        b.angularVel.y += rollAcc * hDt;
        b.angles.x += b.angularVel.x * hDt;
        b.angles.y += b.angularVel.y * hDt;
        b.yaw += b.yawVel * hDt;
        b.yawVel *= 1.0 - Math.min(1.0, 2.5 * hDt);

        b.mesh.position.copy(b.position);
        _euler.set(b.angles.x, b.yaw, b.angles.y, 'YXZ');
        b.mesh.quaternion.setFromEuler(_euler);
      }

      // 浮体之间球形柔性碰撞互斥
      for (let i = 0; i < this.bodies.length; i++) {
        for (let j = i + 1; j < this.bodies.length; j++) {
          const a = this.bodies[i];
          const b = this.bodies[j];
          if (a.grabbed || b.grabbed) continue;
          const dx = b.position.x - a.position.x;
          const dz = b.position.z - a.position.z;
          const dist = Math.hypot(dx, dz);
          const minDist = a.collisionRadius + b.collisionRadius;
          if (dist > 1e-4 && dist < minDist) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const nz = dz / dist;
            const weightA = a.kind === 'ship' ? 0.08 : 0.5;
            const weightB = b.kind === 'ship' ? 0.08 : 0.5;
            a.position.x -= nx * overlap * weightA;
            a.position.z -= nz * overlap * weightA;
            b.position.x += nx * overlap * weightB;
            b.position.z += nz * overlap * weightB;
          }
        }
      }
    }
  }
}
