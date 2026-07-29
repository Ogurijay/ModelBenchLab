import * as THREE from 'three';
import {
  crossingPortal,
  mapPointThroughPortal,
  mapVectorThroughPortal,
  vectorLengthError,
} from './portalMath.js';
import { advanceSprintState, PLAYER_MOVEMENT } from './playerMovement.js';

export const FIXED_DT = 1 / 120;

const START_PLAYER = new THREE.Vector3(0, 0.92, 11.8);
const START_CUBE = new THREE.Vector3(-7.8, 0.58, -5);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();

function roundedVector(vector) {
  return { x: +vector.x.toFixed(4), y: +vector.y.toFixed(4), z: +vector.z.toFixed(4) };
}

function overlaps(body, collider) {
  return body.position.x + body.halfExtents.x > collider.min.x
    && body.position.x - body.halfExtents.x < collider.max.x
    && body.position.y + body.halfExtents.y > collider.min.y
    && body.position.y - body.halfExtents.y < collider.max.y
    && body.position.z + body.halfExtents.z > collider.min.z
    && body.position.z - body.halfExtents.z < collider.max.z;
}

function moveAxis(body, axis, amount, solids, canGround = false) {
  if (Math.abs(amount) < 1e-10) return false;
  body.position[axis] += amount;
  let collided = false;
  for (const collider of solids) {
    if (!collider.enabled || !overlaps(body, collider)) continue;
    collided = true;
    if (amount > 0) body.position[axis] = collider.min[axis] - body.halfExtents[axis];
    else body.position[axis] = collider.max[axis] + body.halfExtents[axis];
    body.velocity[axis] = 0;
    if (canGround && amount < 0) body.grounded = true;
  }
  return collided;
}

function makePortal(position, right, up, normal) {
  return {
    active: true,
    position: position.clone(),
    right: right.clone(),
    up: up.clone(),
    normal: normal.clone(),
    halfWidth: 0.75,
    halfHeight: 1.275,
  };
}

export function runTeleportSelfTest() {
  const cases = [];
  const add = (name, run) => {
    try {
      const detail = run();
      cases.push({ name, pass: detail === true || detail?.pass === true, detail: typeof detail === 'object' ? detail.detail : undefined });
    } catch (error) {
      cases.push({ name, pass: false, detail: error.message });
    }
  };

  const wallA = makePortal(
    new THREE.Vector3(0, 1.5, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  );
  const wallB = makePortal(
    new THREE.Vector3(10, 2, -4),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, 0),
  );

  add('位置往返映射', () => {
    const point = new THREE.Vector3(0.2, 1.8, -0.35);
    const mapped = mapPointThroughPortal(point, wallA, wallB);
    const roundTrip = mapPointThroughPortal(mapped, wallB, wallA);
    return { pass: roundTrip.distanceTo(point) < 1e-8, detail: `误差 ${roundTrip.distanceTo(point).toExponential(2)}` };
  });

  add('朝向局部坐标映射', () => {
    const direction = new THREE.Vector3(0.2, 0.1, -1).normalize();
    const mapped = mapVectorThroughPortal(direction, wallA, wallB);
    return { pass: mapped.dot(wallB.normal) > 0.9, detail: `出口法向点积 ${mapped.dot(wallB.normal).toFixed(4)}` };
  });

  add('线性动量大小守恒', () => {
    const velocity = new THREE.Vector3(3.5, -11.2, -4.7);
    const mapped = mapVectorThroughPortal(velocity, wallA, wallB);
    const error = vectorLengthError(velocity, mapped);
    return { pass: error < 1e-9, detail: `速度模误差 ${error.toExponential(2)}` };
  });

  add('高速越面检测', () => {
    const velocity = new THREE.Vector3(0, 0, -24);
    const hit = crossingPortal(
      new THREE.Vector3(0, 1.5, 0.55),
      new THREE.Vector3(0, 1.5, -0.4),
      wallA,
      new THREE.Vector3(0.3, 0.8, 0.3),
      velocity,
    );
    return { pass: hit, detail: hit ? '有效穿越' : '未检测到穿越' };
  });

  add('地面坠落映射为水平飞出', () => {
    const floor = makePortal(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 1, 0),
    );
    const velocity = new THREE.Vector3(0, -13, 0);
    const mapped = mapVectorThroughPortal(velocity, floor, wallB);
    return { pass: mapped.dot(wallB.normal) > 12.999, detail: `出口速度 ${mapped.toArray().map((v) => v.toFixed(2)).join(', ')}` };
  });

  return { passed: cases.filter((item) => item.pass).length, total: cases.length, cases };
}

export class GameSimulation {
  constructor({ camera, input, facility, portals, cubeVisual, audio, ui }) {
    this.camera = camera;
    this.input = input;
    this.facility = facility;
    this.portals = portals;
    this.cubeVisual = cubeVisual;
    this.audio = audio;
    this.ui = ui;
    this.fixedDt = FIXED_DT;
    this.time = 0;
    this.completed = false;
    this.teleportCount = 0;
    this.buttonPressed = false;
    this.doorOpen = false;
    this.doorWasPressed = false;
    this.cubeRescued = false;
    this.objective = '建立双向折跃链路';
    this.flags = {};

    this.player = {
      position: START_PLAYER.clone(),
      velocity: new THREE.Vector3(),
      halfExtents: new THREE.Vector3(0.34, 0.9, 0.34),
      grounded: false,
      portalCooldown: 0,
      eyeOffset: 0.67,
      sprintElapsed: 0,
      sprintActive: false,
      sprintProgress: 0,
      sprintMaxed: false,
      movementSpeed: PLAYER_MOVEMENT.walkSpeed,
    };
    this.cube = {
      position: START_CUBE.clone(),
      velocity: new THREE.Vector3(),
      halfExtents: new THREE.Vector3(0.53, 0.53, 0.53),
      grounded: false,
      portalCooldown: 0,
      held: false,
    };

    this.reset();
    this.onInputClear = () => this.resetSprint();
    this.input.addEventListener?.('clear', this.onInputClear);
  }

  resetSprint() {
    this.player.sprintElapsed = 0;
    this.player.sprintActive = false;
    this.player.sprintProgress = 0;
    this.player.sprintMaxed = false;
    this.player.movementSpeed = PLAYER_MOVEMENT.walkSpeed;
    const state = {
      active: false,
      elapsed: 0,
      progress: 0,
      speed: PLAYER_MOVEMENT.walkSpeed,
      maxed: false,
      maxSpeed: PLAYER_MOVEMENT.sprintMaxSpeed,
      chargeSeconds: PLAYER_MOVEMENT.sprintChargeSeconds,
    };
    this.ui.setSprintState?.(state);
    return state;
  }

  reset() {
    this.time = 0;
    this.completed = false;
    this.teleportCount = 0;
    this.buttonPressed = false;
    this.doorOpen = false;
    this.doorWasPressed = false;
    this.cubeRescued = false;
    this.objective = '建立双向折跃链路';
    this.flags = {};
    this.player.position.copy(START_PLAYER);
    this.player.velocity.set(0, 0, 0);
    this.player.grounded = false;
    this.player.portalCooldown = 0;
    this.resetSprint();
    this.cube.position.copy(START_CUBE);
    this.cube.velocity.set(0, 0, 0);
    this.cube.grounded = false;
    this.cube.portalCooldown = 0;
    this.cube.held = false;
    this.input.yaw = 0;
    this.input.pitch = -0.035;
    this.input.clear();
    this.portals.reset();
    this.facility.reset();
    this.syncCamera();
    this.syncVisuals();
    this.ui.setObjective(this.objective);
    this.ui.setPortalStatus(this.portals.getState());
    return this.getState();
  }

  syncCamera() {
    this.camera.position.copy(this.player.position);
    this.camera.position.y += this.player.eyeOffset;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.input.pitch, this.input.yaw, 0);
  }

  syncVisuals() {
    this.cubeVisual.group.position.copy(this.cube.position);
    if (!this.cube.held) {
      this.cubeVisual.group.rotation.x = 0;
      this.cubeVisual.group.rotation.z = 0;
    }
  }

  updatePlayer(dt) {
    const forwardInput = (this.input.down('KeyW') ? 1 : 0) - (this.input.down('KeyS') ? 1 : 0);
    const rightInput = (this.input.down('KeyD') ? 1 : 0) - (this.input.down('KeyA') ? 1 : 0);
    this.input.getFlatForward(tmpA);
    tmpB.set(-tmpA.z, 0, tmpA.x);
    tmpC.copy(tmpA).multiplyScalar(forwardInput).addScaledVector(tmpB, rightInput);
    if (tmpC.lengthSq() > 1) tmpC.normalize();
    const sprintState = advanceSprintState(this.player.sprintElapsed, {
      sprintHeld: this.input.down('ShiftLeft') || this.input.down('ShiftRight'),
      moving: tmpC.lengthSq() > 1e-8,
      dt,
    });
    this.player.sprintElapsed = sprintState.elapsed;
    this.player.sprintActive = sprintState.active;
    this.player.sprintProgress = sprintState.progress;
    this.player.sprintMaxed = sprintState.maxed;
    this.player.movementSpeed = sprintState.speed;
    this.ui.setSprintState?.({
      ...sprintState,
      maxSpeed: PLAYER_MOVEMENT.sprintMaxSpeed,
      chargeSeconds: PLAYER_MOVEMENT.sprintChargeSeconds,
    });
    tmpC.multiplyScalar(sprintState.speed);
    const response = tmpC.lengthSq() > 0 ? 15 : 10;
    this.player.velocity.x = THREE.MathUtils.damp(this.player.velocity.x, tmpC.x, response, dt);
    this.player.velocity.z = THREE.MathUtils.damp(this.player.velocity.z, tmpC.z, response, dt);

    if (this.input.consume('Space') && this.player.grounded) {
      this.player.velocity.y = 6.25;
      this.player.grounded = false;
    }
    this.player.velocity.y = Math.max(this.player.velocity.y - 18.5 * dt, -31);
    this.player.portalCooldown = Math.max(0, this.player.portalCooldown - dt);

    tmpA.copy(this.player.position).addScaledVector(this.player.velocity, dt);
    const lookBefore = this.input.getForward(tmpB);
    const teleported = this.portals.tryTeleport(this.player, tmpA);
    if (teleported) {
      if (Math.abs(teleported.exit.normal.y) < 0.5) this.player.position.y = Math.max(this.player.position.y, this.player.halfExtents.y + 0.03);
      this.teleportCount++;
      this.portals.transformDirection(lookBefore, teleported.entry, teleported.exit, tmpB);
      this.input.setDirection(tmpB);
      if (this.cube.held) {
        this.syncCamera();
        this.input.getForward(tmpA);
        this.cube.position.copy(this.camera.position).addScaledVector(tmpA, 1.45);
        this.cube.velocity.copy(this.player.velocity);
        this.cube.portalCooldown = 0.22;
      }
      if (!this.flags.teleport) {
        this.flags.teleport = true;
        this.ui.showToast('动量已重映射：入口速度会沿出口方向延续。');
      }
      return;
    }

    moveAxis(this.player, 'x', this.player.velocity.x * dt, this.facility.solids);
    this.player.grounded = false;
    moveAxis(this.player, 'y', this.player.velocity.y * dt, this.facility.solids, true);
    moveAxis(this.player, 'z', this.player.velocity.z * dt, this.facility.solids);

    if (this.player.position.y < -8) {
      this.ui.showToast('安全回收触发，试验状态已复位。');
      this.reset();
    }
  }

  updateCube(dt) {
    this.cube.portalCooldown = Math.max(0, this.cube.portalCooldown - dt);
    if (this.cube.held) {
      this.syncCamera();
      this.input.getForward(tmpA);
      const distance = 1.7 + Math.max(0, Math.abs(this.input.pitch) - 0.75) * 0.25;
      tmpB.copy(this.camera.position).addScaledVector(tmpA, distance);
      tmpB.y -= 0.14;
      const alpha = 1 - Math.exp(-dt * 20);
      tmpC.copy(this.cube.position).lerp(tmpB, alpha).sub(this.cube.position);
      this.cube.velocity.copy(tmpC).divideScalar(Math.max(dt, 1e-4)).clampLength(0, 15);
      moveAxis(this.cube, 'x', tmpC.x, this.facility.solids);
      moveAxis(this.cube, 'y', tmpC.y, this.facility.solids);
      moveAxis(this.cube, 'z', tmpC.z, this.facility.solids);
      this.cubeVisual.group.rotation.y += dt * 0.7;
      return;
    }

    this.cube.velocity.y = Math.max(this.cube.velocity.y - 17.8 * dt, -28);
    this.cube.velocity.x = THREE.MathUtils.damp(this.cube.velocity.x, 0, this.cube.grounded ? 5.5 : 0.25, dt);
    this.cube.velocity.z = THREE.MathUtils.damp(this.cube.velocity.z, 0, this.cube.grounded ? 5.5 : 0.25, dt);
    tmpA.copy(this.cube.position).addScaledVector(this.cube.velocity, dt);
    const teleported = this.portals.tryTeleport(this.cube, tmpA);
    if (teleported) {
      if (Math.abs(teleported.exit.normal.y) < 0.5) this.cube.position.y = Math.max(this.cube.position.y, this.cube.halfExtents.y + 0.03);
      this.teleportCount++;
      return;
    }
    moveAxis(this.cube, 'x', this.cube.velocity.x * dt, this.facility.solids);
    this.cube.grounded = false;
    moveAxis(this.cube, 'y', this.cube.velocity.y * dt, this.facility.solids, true);
    moveAxis(this.cube, 'z', this.cube.velocity.z * dt, this.facility.solids);
    if (this.cube.position.y < -8) {
      this.cube.position.copy(START_CUBE);
      this.cube.velocity.set(0, 0, 0);
    }
  }

  updateInteraction() {
    const distance = this.camera.position.distanceTo(this.cube.position);
    this.ui.setInteract(this.cube.held || distance < 2.7, this.cube.held ? '放下相位立方体' : '拾取相位立方体');
    if (!this.input.consume('KeyE')) return;

    if (this.cube.held) {
      this.cube.held = false;
      this.input.getForward(tmpA);
      this.cube.velocity.copy(this.player.velocity).multiplyScalar(0.18).addScaledVector(tmpA, 0.12);
      this.audio.drop();
    } else if (distance < 2.7) {
      this.cube.held = true;
      this.cube.velocity.set(0, 0, 0);
      this.audio.pickup();
      if (!this.flags.cube) {
        this.flags.cube = true;
        this.ui.showToast('相位立方体已捕获。将它放到红色压力平台。');
      }
    }
  }

  updateObjective() {
    const dx = this.cube.position.x - this.facility.plate.position.x;
    const dz = this.cube.position.z - this.facility.plate.position.z;
    const onPlate = !this.cube.held
      && dx * dx + dz * dz < this.facility.plate.radius * this.facility.plate.radius
      && this.cube.position.y - this.cube.halfExtents.y < 0.26;
    this.buttonPressed = onPlate;
    const facilityState = this.facility.update(this.fixedDt, { buttonPressed: onPlate });
    this.doorOpen = facilityState.doorOpen;

    if (onPlate && !this.doorWasPressed) {
      this.audio.door();
      this.ui.showToast('质量校验通过。北侧出口正在解锁。');
    }
    this.doorWasPressed = onPlate;
    this.cubeRescued ||= this.cube.held || this.cube.position.x > -5.0;

    if (!this.portals.bothActive) this.objective = '建立双向折跃链路';
    else if (!this.cubeRescued) this.objective = '通过折跃进入密封取样舱';
    else if (!onPlate) this.objective = '将相位立方体放到红色压力平台';
    else this.objective = '出口已开启，进入北侧廊道';
    this.ui.setObjective(this.objective);

    if (!this.completed && this.doorOpen && this.player.position.z < -17.4 && this.player.position.x > 2.2 && this.player.position.x < 7.1) {
      this.completed = true;
      this.audio.complete();
      if (document.pointerLockElement) document.exitPointerLock();
      this.ui.showComplete(this.getState());
    }
  }

  step(dt = this.fixedDt) {
    if (this.completed) return;
    this.time += dt;
    if (this.input.consume('KeyR')) {
      this.ui.showToast('试验状态已完整重置。');
      this.reset();
      return;
    }
    this.updatePlayer(dt);
    this.syncCamera();
    this.updateCube(dt);
    this.syncVisuals();
    this.updateInteraction();
    this.updateObjective();
    this.portals.update(dt);
  }

  shoot(kind) {
    if (this.completed) return { ok: false, reason: '测试已结束' };
    const hit = this.portals.aim(this.camera, this.facility.surfaces);
    if (!hit) {
      const reason = '瞄准白色授权面后再部署锚点';
      this.audio.deny();
      this.ui.showToast(reason, 1.6);
      return { ok: false, reason };
    }
    const result = this.portals.place(kind, hit);
    if (!result.ok) this.ui.showToast(result.reason, 1.6);
    else if (this.portals.bothActive && !this.flags.linked) {
      this.flags.linked = true;
      this.ui.showToast('双向链路稳定。穿过任意锚点即可从另一端离开。');
    }
    this.ui.setPortalStatus(this.portals.getState());
    return result;
  }

  updatePresentation(dt, elapsed) {
    this.ui.update(dt);
    this.cubeVisual.update(elapsed, this.cube.held);
    const hit = this.portals.aim(this.camera, this.facility.surfaces);
    this.ui.setAimValid(!!hit);
  }

  getState() {
    return {
      ready: true,
      fixedDt: this.fixedDt,
      time: +this.time.toFixed(4),
      completed: this.completed,
      teleportCount: this.teleportCount,
      objective: this.objective,
      player: {
        position: roundedVector(this.player.position),
        velocity: roundedVector(this.player.velocity),
        grounded: this.player.grounded,
        yaw: +this.input.yaw.toFixed(4),
        pitch: +this.input.pitch.toFixed(4),
        sprint: {
          active: this.player.sprintActive,
          elapsed: +this.player.sprintElapsed.toFixed(4),
          progress: +this.player.sprintProgress.toFixed(4),
          maxed: this.player.sprintMaxed,
          targetSpeed: +this.player.movementSpeed.toFixed(4),
          maxSpeed: PLAYER_MOVEMENT.sprintMaxSpeed,
          chargeSeconds: PLAYER_MOVEMENT.sprintChargeSeconds,
        },
      },
      cube: {
        position: roundedVector(this.cube.position),
        velocity: roundedVector(this.cube.velocity),
        held: this.cube.held,
      },
      portals: this.portals.getState(),
      buttonPressed: this.buttonPressed,
      doorOpen: this.doorOpen,
      doorProgress: +this.facility.getState().doorProgress.toFixed(4),
    };
  }
}
