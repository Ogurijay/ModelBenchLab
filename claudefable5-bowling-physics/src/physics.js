/**
 * cannon-es 物理世界 — 固定 timestep(1/120s)。
 * 球道 / 边沟 / 球瓶(低重心复合体)/ 保龄球 / 简化 Magnus 侧旋力 / 沟球锁定。
 */
import * as CANNON from 'cannon-es';

// ---- 尺寸常量(米,与真实球道等比) ----
export const LANE_WIDTH = 1.05;
export const LANE_HALF = LANE_WIDTH / 2;
export const FOUL_Z = 0; // 犯规线
export const HEAD_PIN_Z = -16.5; // 1 号瓶
export const LANE_END_Z = -18.3; // 瓶台尽头(落坑)
export const GUTTER_CENTER_X = 0.66; // 沟中心
export const GUTTER_FLOOR_Y = -0.06; // 沟底
export const BALL_RADIUS = 0.108;
export const BALL_MASS = 5;
export const PIN_HEIGHT = 0.385;
export const PIN_MASS = 0.7;
export const PIN_COM_Y = 0.14; // 重心离瓶底高度(偏下)

const ROW_DX = 0.1524; // 瓶间距 0.3048m 的一半
const ROW_DZ = 0.264; // 行距 = 0.3048 * sin60

/** 标准 10 瓶三角摆位(1 号瓶在前,4 行) */
export const PIN_SPOTS = [
  { x: 0, z: HEAD_PIN_Z },
  { x: -ROW_DX, z: HEAD_PIN_Z - ROW_DZ },
  { x: ROW_DX, z: HEAD_PIN_Z - ROW_DZ },
  { x: -ROW_DX * 2, z: HEAD_PIN_Z - ROW_DZ * 2 },
  { x: 0, z: HEAD_PIN_Z - ROW_DZ * 2 },
  { x: ROW_DX * 2, z: HEAD_PIN_Z - ROW_DZ * 2 },
  { x: -ROW_DX * 3, z: HEAD_PIN_Z - ROW_DZ * 3 },
  { x: -ROW_DX, z: HEAD_PIN_Z - ROW_DZ * 3 },
  { x: ROW_DX, z: HEAD_PIN_Z - ROW_DZ * 3 },
  { x: ROW_DX * 3, z: HEAD_PIN_Z - ROW_DZ * 3 },
];

const GROUP_BALL = 1;
const GROUP_PIN = 2;
const GROUP_ENV = 4;

const FIXED_DT = 1 / 120; // 固定物理步长
const FALL_DOT = Math.cos((60 * Math.PI) / 180); // 倾角 > 60° 判倒
const MAGNUS_ACCEL = 0.24; // 满旋满速侧向加速度 m/s²

/** 预测球路(与物理同一组常量的轻量积分,供瞄准弧线预览) */
export function predictPath({ power, angleDeg, spin }, maxPoints = 48) {
  const speed = 4.5 + power * 6.5;
  const a = (angleDeg * Math.PI) / 180;
  let x = 0;
  let z = -0.3;
  let vx = Math.sin(a) * speed;
  let vz = -Math.cos(a) * speed;
  const dt = 0.05;
  const pts = [{ x, z }];
  let gutter = false;
  for (let i = 0; i < maxPoints * 4 && z > HEAD_PIN_Z + 0.2; i++) {
    if (!gutter && Math.abs(x) > LANE_HALF) {
      gutter = true;
      x = Math.sign(x) * GUTTER_CENTER_X;
      vx = 0;
    }
    if (!gutter) {
      const v = Math.hypot(vx, vz);
      vx += spin * MAGNUS_ACCEL * Math.min(v / 8, 1) * dt;
    }
    x += vx * dt;
    z += vz * dt;
    if (i % 4 === 3 || z <= HEAD_PIN_Z + 0.2) pts.push({ x, z });
  }
  return { points: pts, gutter };
}

export class BowlingPhysics {
  /**
   * @param {object} hooks { onPinHit(intensity), onGutter() }
   */
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.accumulator = 0;
    this.isGutter = false;
    this.ballThrown = false;
    this.spinParam = 0;

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.solver.iterations = 14;
    this.world = world;

    // ---- 材质 ----
    this.matLane = new CANNON.Material('lane');
    this.matBall = new CANNON.Material('ball');
    this.matPin = new CANNON.Material('pin');
    const cm = (a, b, friction, restitution) =>
      world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
    cm(this.matBall, this.matLane, 0.05, 0.1); // 上油球道,低摩擦
    cm(this.matBall, this.matPin, 0.2, 0.28);
    cm(this.matPin, this.matLane, 0.45, 0.05);
    cm(this.matPin, this.matPin, 0.15, 0.42);

    this._buildStatic();
    this._buildPins();
    this._buildBall();
  }

  _staticBox(halfExtents, position, material = this.matLane) {
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Box(new CANNON.Vec3(...halfExtents)),
      material,
      collisionFilterGroup: GROUP_ENV,
      collisionFilterMask: GROUP_BALL | GROUP_PIN,
    });
    body.position.set(...position);
    this.world.addBody(body);
    return body;
  }

  _buildStatic() {
    const midZ = (FOUL_Z + 2 + LANE_END_Z) / 2;
    const halfZ = (2 + Math.abs(LANE_END_Z)) / 2;
    // 球道(顶面 y=0,含助走区到瓶台)
    this._staticBox([LANE_HALF, 0.1, halfZ], [0, -0.1, midZ]);
    // 两侧边沟沟底(低于球道 6cm)
    for (const s of [-1, 1]) {
      this._staticBox([0.135, 0.05, halfZ], [s * GUTTER_CENTER_X, GUTTER_FLOOR_Y - 0.05, midZ]);
    }
    // 外侧挡墙
    for (const s of [-1, 1]) {
      this._staticBox([0.04, 0.35, halfZ], [s * 0.84, 0.2, midZ]);
    }
    // 落坑坑底 + 后墙(缓冲垫,零弹)
    this._staticBox([1.2, 0.05, 0.7], [0, -0.55, LANE_END_Z - 0.6]);
    const backWall = this._staticBox([1.2, 0.6, 0.06], [0, 0.05, LANE_END_Z - 1.15]);
    backWall.material = new CANNON.Material('cushion');
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(backWall.material, this.matBall, { friction: 0.6, restitution: 0.02 })
    );
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(backWall.material, this.matPin, { friction: 0.6, restitution: 0.02 })
    );
  }

  _buildPins() {
    // 低重心复合体:主体圆柱 + 颈部细圆柱,形状整体上移 → 重心落在下部
    const bellyShape = new CANNON.Cylinder(0.056, 0.048, 0.24, 12);
    const neckShape = new CANNON.Cylinder(0.03, 0.026, 0.14, 10);
    this.pins = PIN_SPOTS.map((spot, i) => {
      const body = new CANNON.Body({
        mass: PIN_MASS,
        material: this.matPin,
        collisionFilterGroup: GROUP_PIN,
        collisionFilterMask: GROUP_BALL | GROUP_PIN | GROUP_ENV,
        linearDamping: 0.08,
        angularDamping: 0.12,
        allowSleep: true,
        sleepSpeedLimit: 0.3,
        sleepTimeLimit: 0.6,
      });
      // 相对重心:主体从瓶底 0 到 0.24(中心 0.12),颈部中心 0.30 → 重心落在下部
      body.addShape(bellyShape, new CANNON.Vec3(0, 0.12 - PIN_COM_Y, 0));
      body.addShape(neckShape, new CANNON.Vec3(0, 0.3 - PIN_COM_Y, 0));
      body.__pinIndex = i;
      body.addEventListener('collide', (e) => {
        const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
        if (v > 0.8 && this.hooks.onPinHit) this.hooks.onPinHit(Math.min(v / 8, 1));
      });
      return { body, spot, inWorld: false };
    });
    this.rackAll();
  }

  _buildBall() {
    this.ball = new CANNON.Body({
      mass: BALL_MASS,
      shape: new CANNON.Sphere(BALL_RADIUS),
      material: this.matBall,
      collisionFilterGroup: GROUP_BALL,
      collisionFilterMask: GROUP_PIN | GROUP_ENV,
      linearDamping: 0.01,
      angularDamping: 0.02,
      allowSleep: false,
    });
    this.world.addBody(this.ball);
    this.resetBall();
  }

  // ---- 球瓶管理 ----
  _placePin(p) {
    p.body.position.set(p.spot.x, PIN_COM_Y + 0.002, p.spot.z);
    p.body.quaternion.set(0, 0, 0, 1);
    p.body.velocity.setZero();
    p.body.angularVelocity.setZero();
    p.body.wakeUp();
    if (!p.inWorld) {
      this.world.addBody(p.body);
      p.inWorld = true;
    }
  }

  _removePin(p) {
    if (p.inWorld) {
      this.world.removeBody(p.body);
      p.inWorld = false;
    }
  }

  /** 满架 10 瓶 */
  rackAll() {
    this.pins.forEach((p) => this._placePin(p));
  }

  /**
   * 按站立掩码摆瓶:standing[i]=true 的瓶保留当前姿态(若不在世界中则重置到原位),
   * 其余从世界移除(扫瓶)。
   */
  rackMask(standingMask) {
    this.pins.forEach((p, i) => {
      if (standingMask[i]) {
        if (!p.inWorld) this._placePin(p);
      } else {
        this._removePin(p);
      }
    });
  }

  /** 扫走倒下 / 出界的瓶(保留站立瓶原地不动) */
  sweepFallen(standingMask) {
    this.pins.forEach((p, i) => {
      if (!standingMask[i]) this._removePin(p);
    });
  }

  // ---- 球 ----
  resetBall() {
    this.ballThrown = false;
    this.isGutter = false;
    this.spinParam = 0;
    this.ball.position.set(0, BALL_RADIUS, -0.3);
    this.ball.velocity.setZero();
    this.ball.angularVelocity.setZero();
    this.ball.quaternion.set(0, 0, 0, 1);
    this.ball.collisionFilterMask = GROUP_PIN | GROUP_ENV;
  }

  /**
   * 出手。power 0~1 → 4.5~11 m/s;angleDeg 正值向右;spin -1(左曲)~1(右曲)
   */
  throwBall({ power, angleDeg, spin }) {
    const speed = 4.5 + power * 6.5;
    const a = (angleDeg * Math.PI) / 180;
    const vx = Math.sin(a) * speed;
    const vz = -Math.cos(a) * speed;
    this.ball.velocity.set(vx, 0, vz);
    // 滚动角速度 + 侧旋自转(可视化 rev)
    this.ball.angularVelocity.set(vz / BALL_RADIUS, -spin * 22, -vx / BALL_RADIUS);
    this.ball.wakeUp();
    this.spinParam = spin;
    this.ballThrown = true;
    this.isGutter = false;
  }

  /** 每个物理子步:简化 Magnus 侧向力 + 沟球锁定 */
  _perStepForces() {
    const b = this.ball;
    if (!this.ballThrown) return;

    if (!this.isGutter) {
      // 沟球判定:球心越过球道半宽、贴地、且仍在球道/瓶台范围内(未入落坑)。
      // 覆盖到 LANE_END_Z:即使球在瓶区最后一段才越界,也立即剔除瓶碰撞掩码,
      // 严格满足「落沟后不再碰瓶」;落坑内(z < LANE_END_Z)不再判沟,避免误报。
      if (Math.abs(b.position.x) > LANE_HALF + 0.005 && b.position.z > LANE_END_Z && b.position.y < 0.2) {
        this.isGutter = true;
        b.collisionFilterMask = GROUP_ENV; // 落沟后不再碰瓶
        if (this.hooks.onGutter) this.hooks.onGutter();
      }
    }

    if (this.isGutter) {
      // 沿沟直行:把球稳定在沟中心线
      const side = Math.sign(b.position.x) || 1;
      const target = side * GUTTER_CENTER_X;
      b.velocity.x += (target - b.position.x) * 14 * FIXED_DT * 10 - b.velocity.x * 0.25;
      return;
    }

    // 简化 Magnus:与自转参数相关的侧向力,球在道面滚动阶段生效
    // 满旋满速侧向加速度 ≈ 0.24 m/s²,全程横移约 0.4~0.6m,弧线肉眼可见
    const speed = b.velocity.length();
    if (b.position.z > HEAD_PIN_Z + 0.2 && b.position.z < FOUL_Z && b.position.y < 0.3 && speed > 1) {
      const k = Math.min(speed / 8, 1);
      b.applyForce(new CANNON.Vec3(this.spinParam * MAGNUS_ACCEL * k * BALL_MASS, 0, 0));
    }
  }

  /** 固定步长推进(渲染帧调用,dt=帧间隔秒) */
  step(dt) {
    this.accumulator = Math.min(this.accumulator + dt, FIXED_DT * 10);
    while (this.accumulator >= FIXED_DT) {
      this._perStepForces();
      this.world.step(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }
  }

  // ---- 判定 ----
  /** 当前每根瓶是否仍站立(倾角<60° 且未被打飞) */
  standingMaskNow() {
    const up = new CANNON.Vec3(0, 1, 0);
    const worldUp = new CANNON.Vec3();
    return this.pins.map((p) => {
      if (!p.inWorld) return false;
      p.body.quaternion.vmult(up, worldUp);
      if (worldUp.y < FALL_DOT) return false; // 倾角 > 60°
      const dx = p.body.position.x - p.spot.x;
      const dz = p.body.position.z - p.spot.z;
      if (dx * dx + dz * dz > 0.35 * 0.35) return false; // 被打离瓶位
      if (p.body.position.y < PIN_COM_Y - 0.08) return false; // 跌下瓶台 / 落沟
      return true;
    });
  }

  /** 所有在场瓶是否已静止 */
  pinsSettled() {
    return this.pins.every((p) => {
      if (!p.inWorld) return true;
      if (p.body.sleepState === CANNON.Body.SLEEPING) return true;
      return p.body.velocity.length() < 0.18 && p.body.angularVelocity.length() < 0.6;
    });
  }

  /** 球是否已完成本投(入坑 / 停止 / 沟内到底) */
  ballDone() {
    if (!this.ballThrown) return false;
    const b = this.ball;
    if (b.position.z < LANE_END_Z - 0.05) return true; // 入坑
    if (this.isGutter && b.position.z < HEAD_PIN_Z - 0.5) return true;
    if (b.velocity.length() < 0.12 && b.position.z < -0.5) return true;
    return false;
  }

  ballSpeed() {
    return this.ball.velocity.length();
  }
}
