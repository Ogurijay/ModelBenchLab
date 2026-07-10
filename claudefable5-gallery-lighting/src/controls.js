// ============================================================
// controls.js — 第一人称漫游:PointerLockControls + WASD
//   碰撞:房间边界夹紧 + 隔断/长凳 AABB 推出 + 展台圆柱径向推挤
// ============================================================
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const EYE_HEIGHT = 1.65;
const PLAYER_R = 0.42;

export function createPlayer(camera, colliders) {
  const controls = new PointerLockControls(camera, document.body);
  camera.position.set(-11.4, EYE_HEIGHT, 3.6);
  camera.lookAt(-6.5, 1.6, -2.0);

  const keys = { f: false, b: false, l: false, r: false, run: false };
  const vel = new THREE.Vector2();
  const targetVel = new THREE.Vector2();

  function onKey(e, down) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': keys.f = down; break;
      case 'KeyS': case 'ArrowDown': keys.b = down; break;
      case 'KeyA': case 'ArrowLeft': keys.l = down; break;
      case 'KeyD': case 'ArrowRight': keys.r = down; break;
      case 'ShiftLeft': case 'ShiftRight': keys.run = down; break;
      default: return;
    }
    e.preventDefault();
  }
  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  controls.addEventListener('unlock', () => {
    keys.f = keys.b = keys.l = keys.r = keys.run = false;
  });

  function resolveCollisions(p) {
    const b = colliders.bounds;
    p.x = THREE.MathUtils.clamp(p.x, b.minX + PLAYER_R + 0.12, b.maxX - PLAYER_R - 0.12);
    p.z = THREE.MathUtils.clamp(p.z, b.minZ + PLAYER_R + 0.12, b.maxZ - PLAYER_R - 0.12);

    for (const box of colliders.boxes) {
      if (p.x > box.min.x - PLAYER_R && p.x < box.max.x + PLAYER_R
        && p.z > box.min.z - PLAYER_R && p.z < box.max.z + PLAYER_R) {
        const dxl = p.x - (box.min.x - PLAYER_R);
        const dxr = (box.max.x + PLAYER_R) - p.x;
        const dzl = p.z - (box.min.z - PLAYER_R);
        const dzr = (box.max.z + PLAYER_R) - p.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) p.x = box.min.x - PLAYER_R;
        else if (m === dxr) p.x = box.max.x + PLAYER_R;
        else if (m === dzl) p.z = box.min.z - PLAYER_R;
        else p.z = box.max.z + PLAYER_R;
      }
    }

    for (const c of colliders.cylinders) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const rr = c.r + PLAYER_R;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = c.x + (dx / d) * rr;
        p.z = c.z + (dz / d) * rr;
      }
    }
  }

  function update(dt) {
    const speed = keys.run ? 5.4 : 3.2;
    targetVel.set(
      (keys.r ? 1 : 0) - (keys.l ? 1 : 0),
      (keys.f ? 1 : 0) - (keys.b ? 1 : 0),
    );
    if (targetVel.lengthSq() > 0) targetVel.normalize().multiplyScalar(speed);
    if (!controls.isLocked) targetVel.set(0, 0);

    // 指数平滑加减速,脚感柔和
    vel.lerp(targetVel, 1 - Math.exp(-dt * 12));
    if (vel.lengthSq() > 1e-6) {
      controls.moveRight(vel.x * dt);
      controls.moveForward(vel.y * dt);
    }
    resolveCollisions(camera.position);
    camera.position.y = EYE_HEIGHT;
  }

  return { controls, update, PLAYER_R };
}
