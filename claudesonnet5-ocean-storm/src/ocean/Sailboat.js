import * as THREE from "three";

const LENGTH = 7.2;
const BEAM = 2.6;
const DRAFT_OFFSET = 0.35;

function buildHull() {
  const shape = new THREE.Shape();
  const L = LENGTH;
  const W = BEAM;
  shape.moveTo(0, L / 2);
  shape.quadraticCurveTo(W / 2, L * 0.25, W / 2, -L * 0.3);
  shape.lineTo(W / 2, -L / 2);
  shape.lineTo(-W / 2, -L / 2);
  shape.lineTo(-W / 2, -L * 0.3);
  shape.quadraticCurveTo(-W / 2, L * 0.25, 0, L / 2);

  const hullHeight = 1.15;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: hullHeight, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -hullHeight * 0.55, 0);

  const material = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.85, metalness: 0.02 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  return mesh;
}

function buildMast() {
  const height = 8.5;
  const geometry = new THREE.CylinderGeometry(0.05, 0.09, height, 8);
  geometry.translate(0, height / 2, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x2b2320, roughness: 0.7 });
  const mast = new THREE.Mesh(geometry, material);
  mast.position.set(0, 0.55, 0.6);
  return mast;
}

function buildSail(height, width, colorHex) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width, height * 0.42, width * 0.18, height);
  shape.lineTo(0, height * 0.02);
  shape.lineTo(0, 0);
  const geometry = new THREE.ShapeGeometry(shape, 8);
  const material = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

function buildFlag() {
  const geometry = new THREE.PlaneGeometry(0.9, 0.4, 6, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0xc23b3b, side: THREE.DoubleSide, roughness: 0.6 });
  return new THREE.Mesh(geometry, material);
}

/**
 * Procedural sailboat with 4-point wave sampling for pitch/roll/heave —
 * the classic bow/stern/port/starboard buoyancy trick, smoothed with simple
 * exponential lerps so the hull settles into the swell instead of snapping.
 */
export class Sailboat {
  constructor() {
    this.group = new THREE.Group();
    this.group.rotation.order = "YXZ";

    const hull = buildHull();
    const mast = buildMast();

    const mainsail = buildSail(7.2, 3.4, 0xf1ecdf);
    mainsail.position.set(0.03, 0.85, 0.6);
    mainsail.rotation.y = Math.PI / 2;

    const jib = buildSail(4.6, 2.0, 0xe7e2d3);
    jib.position.set(0.02, 1.0, 0.6);
    jib.rotation.y = Math.PI / 2 + 0.22;
    jib.position.z += 1.6;

    const flag = buildFlag();
    flag.position.set(0, 8.5 + 0.55, 0.6);
    flag.rotation.y = Math.PI / 2;

    this.group.add(hull, mast, mainsail, jib, flag);
    this._flag = flag;

    this._heave = 0;
    this._pitch = 0;
    this._roll = 0;
    this._heading = 0;
  }

  /**
   * worldX/worldZ: boat's target position this frame (already includes any
   * external drift). heading: desired forward yaw in the sin/cos convention
   * shared with StormSystem/main.js (forward = (sin(heading), cos(heading))).
   * windDir/windSpeed: current StormSystem weather state, so the hull reacts
   * to the same visible chop the fragment shader is drawing, not just swell.
   */
  update(dt, elapsed, ocean, worldX, worldZ, heading, windDir, windSpeed) {
    const forwardX = Math.sin(heading);
    const forwardZ = Math.cos(heading);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    const halfL = LENGTH * 0.42;
    const halfW = BEAM * 0.42;

    const hBow = ocean.getWaveHeight(worldX + forwardX * halfL, worldZ + forwardZ * halfL, elapsed, windDir, windSpeed);
    const hStern = ocean.getWaveHeight(worldX - forwardX * halfL, worldZ - forwardZ * halfL, elapsed, windDir, windSpeed);
    const hPort = ocean.getWaveHeight(worldX + rightX * halfW, worldZ + rightZ * halfW, elapsed, windDir, windSpeed);
    const hStbd = ocean.getWaveHeight(worldX - rightX * halfW, worldZ - rightZ * halfW, elapsed, windDir, windSpeed);

    const targetHeave = (hBow + hStern + hPort + hStbd) / 4;
    const targetPitch = Math.atan2(hBow - hStern, LENGTH) * 0.6;
    const targetRoll = Math.atan2(hPort - hStbd, BEAM) * 0.6;

    const smooth = Math.min(1, dt * 3.2);
    this._heave += (targetHeave - this._heave) * smooth;
    this._pitch += (targetPitch - this._pitch) * smooth;
    this._roll += (targetRoll - this._roll) * smooth;

    let headingDelta = heading - this._heading;
    headingDelta = Math.atan2(Math.sin(headingDelta), Math.cos(headingDelta));
    this._heading += headingDelta * Math.min(1, dt * 1.5);

    this.group.position.set(worldX, this._heave + DRAFT_OFFSET, worldZ);
    this.group.rotation.set(this._pitch, this._heading, this._roll);

    this._flag.rotation.z = Math.sin(elapsed * 3.1) * 0.12;
  }
}
