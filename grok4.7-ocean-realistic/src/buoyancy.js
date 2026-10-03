import * as THREE from 'three';

const RHO = 1025;
const G = 9.81;

const _up = new THREE.Vector3();
const _sample = new THREE.Vector3();
const _force = new THREE.Vector3();
const _torque = new THREE.Vector3();
const _pointForce = new THREE.Vector3();
const _arm = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _dq = new THREE.Quaternion();

export class Floater {
  constructor(object, opts) {
    this.object = object;
    this.samples = opts.samples.map((sample) => new THREE.Vector3(sample.x, sample.y, sample.z));
    this.mass = opts.mass;
    this.inertia = opts.inertia;
    this.area = opts.area;
    this.drag = opts.drag;
    this.angularDrag = opts.angularDrag ?? 2.4;
    this.righting = opts.righting ?? 0;
    this.moorK = opts.moorK ?? 0;
    this.moorDamp = opts.moorDamp ?? 0;
    this.radius = opts.radius ?? 0.8;
    this.spawned = !!opts.spawned;
    this.kind = opts.kind ?? 'prop';
    this.home = new THREE.Vector3(
      opts.home?.x ?? object.position.x,
      0,
      opts.home?.z ?? object.position.z
    );
    this.velocity = new THREE.Vector3();
    this.angular = new THREE.Vector3();
    this.kinematic = false;
  }
}

export class FloatSim {
  constructor() {
    this.bodies = [];
    this.island = null;
  }

  add(object, opts) {
    const body = new Floater(object, opts);
    this.bodies.push(body);
    object.userData.floater = body;
    return body;
  }

  remove(body) {
    const index = this.bodies.indexOf(body);
    if (index >= 0) this.bodies.splice(index, 1);
    if (body.object.userData.floater === body) delete body.object.userData.floater;
  }

  step(dt, sampleAt) {
    const clamped = Math.min(Math.max(dt, 0), 0.05);
    if (clamped === 0) return;
    const substeps = 4;
    const subDt = clamped / substeps;
    for (let i = 0; i < substeps; i++) this.#substep(subDt, sampleAt);
  }

  #substep(dt, sampleAt) {
    for (const body of this.bodies) {
      if (!body.kinematic) integrate(body, dt, sampleAt);
    }
    separate(this.bodies, this.island);
  }
}

function integrate(body, dt, sampleAt) {
  const object = body.object;
  _force.set(0, -G * body.mass, 0);
  _torque.set(0, 0, 0);
  let submerged = 0;

  for (let i = 0; i < body.samples.length; i++) {
    _sample.copy(body.samples[i]).multiply(object.scale).applyQuaternion(object.quaternion).add(object.position);
    const water = sampleAt(_sample.x, _sample.z);
    const depth = water.height - _sample.y;
    if (depth <= 0) continue;
    const used = Math.min(depth, 2.2);
    submerged += used;
    _pointForce.set(0, used * body.area * RHO * G, 0);
    const vx = body.velocity.x - water.velocity.x;
    const vy = body.velocity.y - water.velocity.y;
    const vz = body.velocity.z - water.velocity.z;
    _pointForce.x -= vx * body.drag * used;
    _pointForce.y -= vy * body.drag * 1.5 * used;
    _pointForce.z -= vz * body.drag * used;
    _force.add(_pointForce);
    _arm.copy(_sample).sub(object.position);
    _torque.add(_arm.cross(_pointForce));
  }

  _up.set(0, 1, 0).applyQuaternion(object.quaternion);
  _torque.x += -_up.z * body.righting;
  _torque.z += _up.x * body.righting;

  if (body.moorK > 0) {
    _force.x += (body.home.x - object.position.x) * body.moorK;
    _force.z += (body.home.z - object.position.z) * body.moorK;
    _force.x -= body.velocity.x * body.moorDamp;
    _force.z -= body.velocity.z * body.moorDamp;
  }

  const maxForce = body.mass * 240;
  if (_force.lengthSq() > maxForce * maxForce) _force.setLength(maxForce);

  body.velocity.addScaledVector(_force, dt / body.mass);
  body.angular.addScaledVector(_torque, dt / body.inertia);
  body.velocity.multiplyScalar(Math.exp(-0.04 * dt));
  body.angular.multiplyScalar(Math.exp(-body.angularDrag * dt));
  if (submerged === 0) body.angular.multiplyScalar(Math.exp(-0.4 * dt));

  object.position.addScaledVector(body.velocity, dt);
  const spin = body.angular.length();
  if (spin > 1e-5) {
    _axis.copy(body.angular).multiplyScalar(1 / spin);
    _dq.setFromAxisAngle(_axis, Math.min(spin * dt, 0.4));
    object.quaternion.premultiply(_dq);
    object.quaternion.normalize();
  }

  if (!Number.isFinite(object.position.x) || !Number.isFinite(object.position.y)) {
    object.position.set(body.home.x, 0, body.home.z);
    body.velocity.set(0, 0, 0);
    body.angular.set(0, 0, 0);
  }
  object.position.y = Math.min(18, Math.max(-6, object.position.y));
}

function separate(bodies, island) {
  if (island) {
    for (const body of bodies) {
      const dx = body.object.position.x - island.x;
      const dz = body.object.position.z - island.z;
      const dist = Math.hypot(dx, dz);
      const min = island.radius + body.radius;
      if (dist < min && dist > 1e-4) {
        const scale = (min - dist) / dist;
        body.object.position.x += dx * scale;
        body.object.position.z += dz * scale;
        body.velocity.x *= 0.6;
        body.velocity.z *= 0.6;
      }
    }
  }

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.object.position.x - a.object.position.x;
      const dz = b.object.position.z - a.object.position.z;
      const dist = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (dist >= min || dist < 1e-4) continue;
      const push = (min - dist) / dist * 0.5;
      a.object.position.x -= dx * push;
      a.object.position.z -= dz * push;
      b.object.position.x += dx * push;
      b.object.position.z += dz * push;
    }
  }
}
