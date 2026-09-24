import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { locate } from "./bowlMath.js";
import { interiorFloor } from "./buildInterior.js";

const EYE = 1.64;
const STEP = 0.64;

function treadAt(tier, offset, inGang) {
  const o = tier.profile.offsets;
  const d = tier.profile.depths;
  const ys = tier.profile.treads;
  const found = [];
  for (let i = 0; i < o.length; i++) {
    if (offset < o[i] - 0.08 || offset > o[i] + d[i] + 0.05) continue;
    const open = inGang || tier.crossRow === i || i === o.length - 1;
    if (open) found.push(ys[i]);
  }
  return found;
}

export function createWalker(camera, dom, program, interior, site) {
  const controls = new PointerLockControls(camera, dom);
  const keys = new Set();
  const onDown = (e) => keys.add(e.code);
  const onUp = (e) => keys.delete(e.code);
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

  const bowl = program.bowl0;
  const masts = [];
  const baseHint = program.roof.trusses;
  for (let i = 0; i < baseHint; i++) {
    const a = (i / baseHint) * Math.PI * 2;
    // 桅柱不在正圆上，碰撞用径向采样在 update 之外由调用方不必预计算。
    void a;
  }

  const foot = new THREE.Vector3();
  let vy = 0;

  function candidates(x, z) {
    const list = [];
    const inside = interiorFloor(interior, x, z);
    if (inside != null) list.push(inside);
    if (Math.abs(x) <= 34 && Math.abs(z) <= 52.5) list.push(0.05);
    const hit = locate(x, z, bowl.hx, bowl.hz, bowl.cr);
    if (hit.offset < -0.8) list.push(0.03);
    const f = (hit.dist % program.bays.bay) / program.bays.bay;
    const inGang = f >= 1 - program.bays.gang / program.bays.bay - 0.004;
    for (const tier of [program.lower, program.club, program.upper]) {
      for (const y of treadAt(tier, hit.offset, inGang)) list.push(y);
    }
    const outer = program.roof.outerOff + 14;
    if (hit.offset > outer) list.push(0);
    // 训练场
    if (Math.abs(x) < 34 && z < -197 && z > -303) list.push(0.04);
    return list;
  }

  function blockedByMass(x, z) {
    if (!site.userData.blocks) return false;
    return site.userData.blocks.some((b) => Math.abs(x - b.x) < b.hx && Math.abs(z - b.z) < b.hz);
  }

  function floorAt(x, z, current) {
    if (blockedByMass(x, z)) return null;
    const list = candidates(x, z).filter((y) => y <= current + STEP);
    if (!list.length) return null;
    let best = -Infinity;
    for (const y of list) if (y > best) best = y;
    return best;
  }

  function teleport(x, y, z, yaw = 0) {
    camera.position.set(x, y + EYE, z);
    vy = 0;
    foot.set(x, y, z);
  }

  function update(dt) {
    if (!controls.isLocked) return;
    const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 16 : 6.5;
    const forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
    const strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    if (forward || strafe) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
      const move = dir.multiplyScalar(forward).add(side.multiplyScalar(strafe));
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dt);
        const nx = camera.position.x + move.x;
        const nz = camera.position.z + move.z;
        const next = floorAt(nx, nz, foot.y);
        if (next != null) {
          camera.position.x = nx;
          camera.position.z = nz;
          foot.x = nx;
          foot.z = nz;
          foot.y = next;
        }
      }
    } else {
      const stay = floorAt(foot.x, foot.z, foot.y);
      if (stay != null) foot.y = stay;
    }
    const target = foot.y + EYE;
    const dy = target - camera.position.y;
    camera.position.y += THREE.MathUtils.clamp(dy, -8 * dt, 8 * dt);
  }

  return { controls, update, teleport, foot };
}
