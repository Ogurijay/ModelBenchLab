import * as THREE from 'three';

export class InputController extends EventTarget {
  constructor(lockElement) {
    super();
    this.lockElement = lockElement;
    this.keys = new Set();
    this.pressed = new Set();
    this.yaw = Math.PI;
    this.pitch = -0.03;
    this.sensitivity = 0.00185;
    this.isLocked = false;

    this.onKeyDown = (event) => {
      if (!this.keys.has(event.code)) this.pressed.add(event.code);
      this.keys.add(event.code);
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR'].includes(event.code)) event.preventDefault();
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onMouseMove = (event) => {
      if (!this.isLocked) return;
      this.yaw -= event.movementX * this.sensitivity;
      this.pitch -= event.movementY * this.sensitivity;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -Math.PI * 0.485, Math.PI * 0.485);
    };
    this.onPointerLock = () => {
      this.isLocked = document.pointerLockElement === this.lockElement;
      if (!this.isLocked) this.clear();
      this.dispatchEvent(new Event(this.isLocked ? 'lock' : 'unlock'));
    };
    this.onPointerLockError = () => this.dispatchEvent(new Event('lockerror'));

    window.addEventListener('keydown', this.onKeyDown, { passive: false });
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLock);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
  }

  lock() {
    this.lockElement.requestPointerLock({ unadjustedMovement: true }).catch?.(() => {
      this.lockElement.requestPointerLock();
    });
  }

  clear() {
    this.keys.clear();
    this.pressed.clear();
  }

  down(code) { return this.keys.has(code); }

  consume(code) {
    const value = this.pressed.has(code);
    this.pressed.delete(code);
    return value;
  }

  getForward(target = new THREE.Vector3()) {
    const cosPitch = Math.cos(this.pitch);
    return target.set(
      -Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch,
    ).normalize();
  }

  getFlatForward(target = new THREE.Vector3()) {
    return target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  setDirection(direction) {
    const normalized = direction.clone().normalize();
    this.yaw = Math.atan2(-normalized.x, -normalized.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(normalized.y, -1, 1));
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onPointerLock);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
  }
}
