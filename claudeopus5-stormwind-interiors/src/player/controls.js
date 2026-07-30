// 三种视角:
//   orbit — 全景巡游(OrbitControls,可自动环绕)
//   walk  — 第一人称行走:重力 / 跳跃 / 台阶自动抬腿 / 墙体推出,门窗洞口天然可穿行
//   fly   — 自由飞行(穿墙),用来看城市剖面与屋顶
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const EYE = 1.66;
const BODY_H = 1.78;
const RADIUS = 0.36;
const STEP_UP = 0.62;
const GRAVITY = 24;
const JUMP_V = 7.6;

export function createController(camera, dom, collision, groundY) {
  const orbit = new OrbitControls(camera, dom);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.06;
  orbit.maxPolarAngle = Math.PI * 0.495;
  orbit.minDistance = 30;
  orbit.maxDistance = 900;
  orbit.target.set(0, 24, 10);

  const state = {
    mode: 'orbit',
    pos: new THREE.Vector3(0, 0, 168),
    vel: new THREE.Vector3(),
    yaw: Math.PI,
    pitch: -0.05,
    grounded: false,
    sprint: false,
    flySpeed: 42,
    bob: 0,
    locked: false,
    autoOrbit: true,
    orbitSpeed: 0.028,
  };

  const keys = new Set();
  const onKeyDown = (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.sprint = true;
  };
  const onKeyUp = (e) => {
    keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.sprint = false;
  };
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);

  const onMouseMove = (e) => {
    if (!state.locked) return;
    const s = 0.0022;
    state.yaw -= e.movementX * s;
    state.pitch -= e.movementY * s;
    state.pitch = Math.max(-1.52, Math.min(1.52, state.pitch));
  };
  addEventListener('mousemove', onMouseMove);

  const onLockChange = () => {
    state.locked = document.pointerLockElement === dom;
    if (!state.locked && state.mode !== 'orbit') api.onUnlock?.();
  };
  document.addEventListener('pointerlockchange', onLockChange);

  const onWheel = (e) => {
    if (state.mode === 'fly' && state.locked) {
      state.flySpeed = Math.max(6, Math.min(320, state.flySpeed * (e.deltaY > 0 ? 0.88 : 1.14)));
      e.preventDefault();
    }
  };
  dom.addEventListener('wheel', onWheel, { passive: false });

  function requestLock() {
    if (state.mode === 'orbit') return;
    dom.requestPointerLock?.();
  }

  /** 从当前相机朝向推出 yaw/pitch,保证模式切换时视角连续。 */
  function syncAnglesFromCamera() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    state.yaw = Math.atan2(-dir.x, -dir.z);
    state.pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
  }

  function supportHeight(x, z, feetY) {
    const s = collision.supportY(x, z, feetY, STEP_UP);
    const g = groundY(x, z);
    return Math.max(s, g);
  }

  function setMode(mode, opts = {}) {
    if (mode === state.mode && !opts.force) return;
    const prev = state.mode;
    state.mode = mode;
    if (mode === 'orbit') {
      document.exitPointerLock?.();
      orbit.enabled = true;
      if (prev !== 'orbit' && !opts.keepView) {
        camera.position.set(0, 210, 430);
        orbit.target.set(0, 24, 0);
      }
    } else {
      orbit.enabled = false;
      if (prev === 'orbit') {
        syncAnglesFromCamera();
        const p = opts.at || (mode === 'fly' ? camera.position.clone() : pickLandingSpot());
        state.pos.copy(p);
        state.vel.set(0, 0, 0);
      } else if (prev === 'walk' && mode === 'fly') {
        state.pos.y += EYE;               // 走 → 飞:相机位置连续
      } else if (prev === 'fly' && mode === 'walk') {
        state.pos.y = Math.max(state.pos.y - EYE, supportHeight(state.pos.x, state.pos.z, state.pos.y));
        state.vel.set(0, 0, 0);
      }
      if (opts.at) { state.pos.copy(opts.at); state.vel.set(0, 0, 0); }
      if (opts.yaw !== undefined) state.yaw = opts.yaw;
      if (opts.pitch !== undefined) state.pitch = opts.pitch;
      requestLock();
    }
  }

  function pickLandingSpot() {
    const p = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    p.x = THREE.MathUtils.clamp(p.x, -180, 180);
    p.z = THREE.MathUtils.clamp(p.z, -180, 180);
    p.y = supportHeight(p.x, p.z, 400) + 0.02;
    if (!isFinite(p.y)) p.y = 0;
    return p;
  }

  function teleport(x, y, z, yaw = state.yaw) {
    state.pos.set(x, y, z);
    state.vel.set(0, 0, 0);
    state.yaw = yaw;
    state.pitch = 0;
    if (state.mode === 'orbit') setMode('walk', { at: state.pos.clone(), yaw });
  }

  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();

  function update(dt) {
    if (state.mode === 'orbit') {
      if (state.autoOrbit) orbit.setAzimuthalAngle(orbit.getAzimuthalAngle() + state.orbitSpeed * dt);
      orbit.update();
      return;
    }

    const sinY = Math.sin(state.yaw), cosY = Math.cos(state.yaw);
    fwd.set(-sinY, 0, -cosY);
    right.set(cosY, 0, -sinY);
    move.set(0, 0, 0);
    if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(fwd);
    if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(fwd);
    if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(right);
    if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(right);
    const moving = move.lengthSq() > 0.0001;
    if (moving) move.normalize();

    if (state.mode === 'fly') {
      const sp = state.flySpeed * (state.sprint ? 3.2 : 1);
      const cosP = Math.cos(state.pitch);
      const look = new THREE.Vector3(-sinY * cosP, Math.sin(state.pitch), -cosY * cosP);
      const v = new THREE.Vector3();
      if (keys.has('KeyW') || keys.has('ArrowUp')) v.add(look);
      if (keys.has('KeyS') || keys.has('ArrowDown')) v.sub(look);
      if (keys.has('KeyD') || keys.has('ArrowRight')) v.add(right);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) v.sub(right);
      if (v.lengthSq() > 0) v.normalize();
      const vert = (keys.has('Space') ? 1 : 0) - (keys.has('ControlLeft') || keys.has('KeyC') ? 1 : 0);
      state.pos.addScaledVector(v, sp * dt);
      state.pos.y += vert * sp * dt;
      camera.position.copy(state.pos);
    } else {
      const sp = state.sprint ? 8.6 : 4.3;
      const accel = state.grounded ? 42 : 12;
      const targetX = move.x * sp, targetZ = move.z * sp;
      state.vel.x += (targetX - state.vel.x) * Math.min(1, accel * dt);
      state.vel.z += (targetZ - state.vel.z) * Math.min(1, accel * dt);

      if (keys.has('Space') && state.grounded) {
        state.vel.y = JUMP_V;
        state.grounded = false;
      }
      state.vel.y -= GRAVITY * dt;
      if (state.vel.y < -60) state.vel.y = -60;

      // 水平位移 + 推出
      state.pos.x += state.vel.x * dt;
      state.pos.z += state.vel.z * dt;
      collision.resolve(state.pos, RADIUS, BODY_H, STEP_UP);

      // 垂直
      state.pos.y += state.vel.y * dt;
      const support = supportHeight(state.pos.x, state.pos.z, state.pos.y + STEP_UP);
      if (state.pos.y <= support + 0.001) {
        state.pos.y = support;
        state.vel.y = 0;
        state.grounded = true;
      } else {
        state.grounded = false;
        // 撞头
        const ceil = collision.ceilingY(state.pos.x, state.pos.z, state.pos.y + BODY_H - 0.1, RADIUS * 0.7);
        if (state.vel.y > 0 && ceil < state.pos.y + BODY_H) {
          state.pos.y = Math.max(support, ceil - BODY_H);
          state.vel.y = 0;
        }
      }
      // 掉出世界兜底
      if (state.pos.y < -40) { state.pos.set(0, 2, 168); state.vel.set(0, 0, 0); }

      const speed = Math.hypot(state.vel.x, state.vel.z);
      state.bob += dt * speed * 1.5;
      const bobY = state.grounded ? Math.sin(state.bob * 2) * Math.min(0.055, speed * 0.012) : 0;
      camera.position.set(state.pos.x, state.pos.y + EYE + bobY, state.pos.z);
    }

    camera.rotation.order = 'YXZ';
    camera.rotation.set(state.pitch, state.yaw, 0);
  }

  const api = {
    state, orbit, update, setMode, teleport, requestLock,
    get mode() { return state.mode; },
    get position() { return state.mode === 'orbit' ? camera.position : state.pos; },
    dispose() {
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      dom.removeEventListener('wheel', onWheel);
      orbit.dispose();
    },
  };
  return api;
}
