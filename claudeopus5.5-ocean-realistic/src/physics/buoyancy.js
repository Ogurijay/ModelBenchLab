// 多点浮力刚体：每个体素采样点查询 CPU 海面高度与水质点速度，
// 按浸没比例施加阿基米德浮力与相对水流的线性 + 二次阻力，力矩自然产生摇摆与随浪漂移。

import * as THREE from 'three';

export const WATER_DENSITY = 1025;
export const GRAVITY = 9.81;

const _r = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();
const _m = new THREE.Matrix3();
const _mt = new THREE.Matrix3();
const _inv = new THREE.Matrix3();
const _dq = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _q = {};

// 在包围盒内均匀布置采样点；inside(x,y,z) 用于非长方体形状裁剪
export function voxelPoints(size, res, inside = () => true) {
  const pts = [];
  const [nx, ny, nz] = res;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        const x = ((i + 0.5) / nx - 0.5) * size.x;
        const y = ((j + 0.5) / ny - 0.5) * size.y;
        const z = ((k + 0.5) / nz - 0.5) * size.z;
        if (inside(x, y, z)) pts.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return pts;
}

export class FloatingBody {
  constructor({ object, mass, size, volume, points, cellHeight, linearDrag = 1.2, quadDrag = 0.6, angularDamping = 0.5, radius, kind = 'box' }) {
    this.object = object;
    this.kind = kind;
    this.mass = mass;
    this.size = size.clone();
    this.points = points;
    this.pointVolume = volume / points.length;
    this.cellHeight = cellHeight;
    this.linearDrag = linearDrag;
    this.quadDrag = quadDrag;
    this.angularDamping = angularDamping;
    this.radius = radius ?? size.length() * 0.5;
    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.force = new THREE.Vector3();
    this.torque = new THREE.Vector3();
    this.submerged = 0;
    this.prevSubmerged = 0;
    this.grab = null;
    this.anchor = null;
    // 长方体惯量（主轴对角）
    const { x, y, z } = size;
    this.invInertia = new THREE.Vector3(
      12 / (mass * (y * y + z * z)),
      12 / (mass * (x * x + z * z)),
      12 / (mass * (x * x + y * y))
    );
  }

  get position() {
    return this.object.position;
  }

  get quaternion() {
    return this.object.quaternion;
  }

  applyForceAt(force, worldPoint) {
    this.force.add(force);
    _r.subVectors(worldPoint, this.position);
    _t.crossVectors(_r, force);
    this.torque.add(_t);
  }

  pointVelocity(worldPoint, out) {
    _r.subVectors(worldPoint, this.position);
    return out.crossVectors(this.angularVelocity, _r).add(this.velocity);
  }
}

export class BuoyancyWorld {
  constructor(ocean) {
    this.ocean = ocean;
    this.bodies = [];
    this.events = [];
  }

  add(body) {
    this.bodies.push(body);
    return body;
  }

  remove(body) {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  step(dt) {
    for (const b of this.bodies) this._forces(b, dt);
    this._collide();
    for (const b of this.bodies) this._integrate(b, dt);
  }

  _forces(b, dt) {
    b.force.set(0, -b.mass * GRAVITY, 0);
    b.torque.set(0, 0, 0);
    let wet = 0;
    const V = b.pointVolume;
    const h = b.cellHeight;
    for (const lp of b.points) {
      _p.copy(lp).applyQuaternion(b.quaternion).add(b.position);
      const q = this.ocean.query(_p.x, _p.z, _q);
      const depth = q.height - _p.y;
      const frac = Math.min(Math.max(depth / h + 0.5, 0), 1);
      if (frac <= 0) continue;
      wet += frac;
      // 浮力
      _f.set(0, WATER_DENSITY * GRAVITY * V * frac, 0);
      // 阻力：相对水质点速度（水平方向的轨道速度带来随浪漂移）
      b.pointVelocity(_p, _v);
      _v.x -= q.vx;
      _v.y -= q.vy;
      _v.z -= q.vz;
      const speed = _v.length();
      const k = WATER_DENSITY * V * frac * (b.linearDrag + b.quadDrag * speed) / Math.cbrt(V);
      _f.addScaledVector(_v, -Math.min(k, (b.mass / b.points.length) / dt * 0.9));
      b.applyForceAt(_f, _p);
    }
    b.prevSubmerged = b.submerged;
    b.submerged = wet / b.points.length;

    // 抓取：弹簧拉向目标点
    if (b.grab) {
      _p.copy(b.grab.local).applyQuaternion(b.quaternion).add(b.position);
      b.pointVelocity(_p, _v);
      const kS = b.mass * 30;
      const kD = b.mass * 9;
      _f.subVectors(b.grab.target, _p).multiplyScalar(kS).addScaledVector(_v, -kD);
      _f.y += b.mass * GRAVITY * 0.9;
      b.applyForceAt(_f, _p);
      b.angularVelocity.multiplyScalar(Math.exp(-3 * dt));
    }

    // 系泊：锚链松弛时无力，绷紧后水平拉回（航标与锚泊渔船）
    if (b.anchor) {
      const a = b.anchor;
      const dx = b.position.x - a.x;
      const dz = b.position.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > a.length) {
        const stretch = d - a.length;
        const radialV = (b.velocity.x * dx + b.velocity.z * dz) / d;
        const f = -(a.stiffness * b.mass * stretch + Math.max(radialV, 0) * b.mass * 2.5) / d;
        _f.set(dx * f, 0, dz * f);
        _p.set(0, a.lowerPoint ?? 0, 0).applyQuaternion(b.quaternion).add(b.position);
        b.applyForceAt(_f, _p);
      }
    }

    // 入水溅射事件
    if (b.prevSubmerged < 0.02 && b.submerged >= 0.02 && b.velocity.y < -2.2) {
      this.events.push({ type: 'splash', position: b.position.clone(), strength: Math.min(1, (-b.velocity.y / 9) * Math.min(1.4, Math.cbrt(b.mass / 80))) });
    }
  }

  // 粗略的球形互斥，避免浮体相互穿插
  _collide() {
    const list = this.bodies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const c = list[j];
        _r.subVectors(c.position, a.position);
        const d = _r.length();
        const min = (a.radius + c.radius) * 0.85;
        if (d >= min || d < 1e-6) continue;
        _r.divideScalar(d);
        const push = (min - d) * 0.5;
        const wa = c.mass / (a.mass + c.mass);
        a.position.addScaledVector(_r, -push * 2 * wa);
        c.position.addScaledVector(_r, push * 2 * (1 - wa));
        const rel = _v.subVectors(c.velocity, a.velocity).dot(_r);
        if (rel < 0) {
          const imp = (-1.3 * rel) / (1 / a.mass + 1 / c.mass);
          a.velocity.addScaledVector(_r, -imp / a.mass);
          c.velocity.addScaledVector(_r, imp / c.mass);
        }
      }
    }
  }

  _integrate(b, dt) {
    b.velocity.addScaledVector(b.force, dt / b.mass);
    // 世界系逆惯量 R·I⁻¹·Rᵀ
    _m.setFromMatrix4(_m4.makeRotationFromQuaternion(b.quaternion));
    _mt.copy(_m).transpose();
    _inv.set(b.invInertia.x, 0, 0, 0, b.invInertia.y, 0, 0, 0, b.invInertia.z);
    _t.copy(b.torque).applyMatrix3(_mt).applyMatrix3(_inv).applyMatrix3(_m);
    b.angularVelocity.addScaledVector(_t, dt);
    const damp = Math.exp(-b.angularDamping * (0.2 + b.submerged) * dt);
    b.angularVelocity.multiplyScalar(damp);
    const maxW = 12;
    if (b.angularVelocity.length() > maxW) b.angularVelocity.setLength(maxW);

    b.position.addScaledVector(b.velocity, dt);
    const w = b.angularVelocity;
    const angle = w.length() * dt;
    if (angle > 1e-8) {
      _dq.setFromAxisAngle(_r.copy(w).normalize(), angle);
      b.quaternion.premultiply(_dq).normalize();
    }
  }
}
