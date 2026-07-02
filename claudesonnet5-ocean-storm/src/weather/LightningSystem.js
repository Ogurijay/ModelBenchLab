import * as THREE from "three";

/** Recursive midpoint displacement — the trunk and a handful of forks. */
function subdivide(a, b, roughness, depth, out, rng) {
  if (depth <= 0 || a.distanceTo(b) < 6) {
    out.push(a, b);
    return;
  }
  const mid = a.clone().lerp(b, 0.5);
  const perp = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.3, rng() - 0.5).normalize();
  const offset = a.distanceTo(b) * roughness * (rng() * 0.6 + 0.4);
  mid.addScaledVector(perp, offset);

  subdivide(a, mid, roughness * 0.62, depth - 1, out, rng);
  subdivide(mid, b, roughness * 0.62, depth - 1, out, rng);

  if (depth > 1 && rng() < 0.4) {
    const forkEnd = mid
      .clone()
      .addScaledVector(new THREE.Vector3(rng() - 0.5, -rng() * 0.8, rng() - 0.5), a.distanceTo(b) * 0.35);
    subdivide(mid, forkEnd, roughness * 0.7, depth - 2, out, rng);
  }
}

function buildBoltPositions(start, end, rng) {
  const trunk = [];
  subdivide(start, end, 0.28, 6, trunk, rng);
  const positions = new Float32Array(trunk.length * 3);
  for (let i = 0; i < trunk.length; i++) {
    positions[i * 3] = trunk[i].x;
    positions[i * 3 + 1] = trunk[i].y;
    positions[i * 3 + 2] = trunk[i].z;
  }
  return positions;
}

/**
 * Bolts are geometry-only (bright, over-unity color) and rely entirely on
 * the scene's bloom pass for their glow — no manual halo faking needed.
 * Each strike also drives a shared flash envelope consumed every frame by
 * main.js to punch the ocean/sky/ambient light and to schedule thunder.
 */
export class LightningSystem {
  constructor() {
    this.group = new THREE.Group();
    this.bolts = [];
    this.rng = Math.random;
    this.flashIntensity = 0;
    this.flashWorldPos = new THREE.Vector3();
    this.flashColor = new THREE.Color(0xdfe8ff);
  }

  update(dt, camera, stormSystem) {
    const roll = stormSystem.rollLightningStrike(dt, camera.position);
    const strikeEvent = roll ? this._spawnBolt(roll) : null;
    this._advanceBolts(dt);
    return strikeEvent;
  }

  /** Forces an immediate bolt from an externally-produced strike descriptor (GUI test button). */
  forceStrike(roll) {
    if (!roll) return null;
    return this._spawnBolt(roll);
  }

  _advanceBolts(dt) {
    let maxEnvelope = 0;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      bolt.age += dt;
      const env = this._envelope(bolt);
      bolt.line.material.opacity = env;
      bolt.branches.material.opacity = env * 0.55;
      if (env > maxEnvelope) {
        maxEnvelope = env;
        this.flashWorldPos.copy(bolt.worldPos);
      }
      if (bolt.age > bolt.maxLife) {
        this.group.remove(bolt.line, bolt.branches);
        bolt.line.geometry.dispose();
        bolt.branches.geometry.dispose();
        bolt.line.material.dispose();
        bolt.branches.material.dispose();
        this.bolts.splice(i, 1);
      }
    }
    this.flashIntensity = maxEnvelope;
  }

  _envelope(bolt) {
    let v = 0;
    for (const p of bolt.pulses) {
      const t = bolt.age - p.start;
      if (t < 0 || t > p.dur) continue;
      const x = t / p.dur;
      const shape = x < 0.12 ? x / 0.12 : 1 - (x - 0.12) / 0.88;
      v = Math.max(v, shape * p.peak);
    }
    return Math.max(0, Math.min(1, v));
  }

  _spawnBolt(roll) {
    const start = new THREE.Vector3(
      roll.x + (this.rng() - 0.5) * 40,
      250 + this.rng() * 90,
      roll.z + (this.rng() - 0.5) * 40
    );
    const end = new THREE.Vector3(roll.x, 0, roll.z);

    const positions = buildBoltPositions(start, end, this.rng);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const branchPositions = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i++) {
      branchPositions[i] = positions[i] + (this.rng() - 0.5) * 3;
    }
    const branchGeometry = new THREE.BufferGeometry();
    branchGeometry.setAttribute("position", new THREE.BufferAttribute(branchPositions, 3));

    const coreColor = new THREE.Color(6.0, 6.4, 8.0);
    const line = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: coreColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    const branches = new THREE.LineSegments(
      branchGeometry,
      new THREE.LineBasicMaterial({ color: coreColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.group.add(line, branches);

    const pulses = [{ start: 0, dur: 0.16, peak: 1.0 }];
    if (this.rng() < 0.45) {
      pulses.push({ start: 0.05 + this.rng() * 0.08, dur: 0.09, peak: 0.4 + this.rng() * 0.3 });
    }

    const bolt = {
      line,
      branches,
      age: 0,
      maxLife: pulses.reduce((m, p) => Math.max(m, p.start + p.dur), 0),
      pulses,
      worldPos: end.clone(),
    };
    this.bolts.push(bolt);

    return { worldPos: end, distance: roll.distance };
  }
}
