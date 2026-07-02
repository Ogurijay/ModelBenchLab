import * as THREE from "three";
import { makeRng, fbm2D } from "../core/NoiseKit.js";

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

const GROW_TIME = 20;
const DECAY_TIME = 24;
const MAX_CELLS = 2;
const SPAWN_RING = 2400;
const DESPAWN_RING = 3400;

/**
 * The novel piece of this build: weather is not a global preset toggle, it
 * is emitted by discrete storm cells that spawn on the horizon, drift across
 * the world on their own curved heading, and dissolve once spent. Every
 * downstream system (ocean chop, sky darkening, rain, lightning, HUD) reads
 * a single `state` snapshot derived from the camera's distance to those
 * cells, so "weather" is really just "how close am I to a storm right now".
 */
export class StormSystem {
  constructor({ seed = 20260701 } = {}) {
    this.rng = makeRng(seed ^ 0x9e3779b9);
    this.cells = [];
    this.autoMode = true;
    this.manualOverride = null; // 0..1 or null
    this.timeScale = 1;
    this.spawnCooldown = 4;
    this.scaledElapsed = 0;
    this._relativeCellsPool = [];

    this.globalWindSeedOffset = this.rng() * 1000;

    this.sunAzimuthBase = this.rng() * Math.PI * 2;
    this.persistentSunDir = new THREE.Vector3();
    this.skyZenithClear = new THREE.Color(0x1a3a63);
    this.skyZenithStorm = new THREE.Color(0x181d24);
    this.skyHorizonClear = new THREE.Color(0x9fc6dd);
    this.skyHorizonStorm = new THREE.Color(0x4a5560);
    this.fogColorClear = new THREE.Color(0x1a2a38);
    this.fogColorStorm = new THREE.Color(0x1a1d22);

    this._outZenith = new THREE.Color();
    this._outHorizon = new THREE.Color();
    this._outFog = new THREE.Color();

    this.state = {
      windDir: { x: 1, y: 0 },
      windSpeed: 0,
      stormInfluence: 0,
      rainIntensity: 0,
      cloudDensity: 0.2,
      skyDarkness: 0,
      fogDensity: 0.0007,
      exposure: 1,
      sunDirection: new THREE.Vector3(0.3, 0.6, -0.4).normalize(),
      skyZenith: this._outZenith,
      skyHorizon: this._outHorizon,
      fogColor: this._outFog,
      lightningRate: 0,
      nearestDistance: null,
      nearestBearing: 0,
      label: "晴朗",
    };
  }

  setAutoMode(v) {
    this.autoMode = v;
  }

  setManualOverride(v) {
    this.manualOverride = v;
  }

  setTimeScale(v) {
    this.timeScale = v;
  }

  clearSkies() {
    this.cells.length = 0;
    this.spawnCooldown = 12;
  }

  spawnStormNear(cameraPos) {
    if (this.cells.length >= MAX_CELLS) return;
    this._spawnCell(cameraPos, true);
  }

  _spawnCell(cameraPos, forced = false) {
    const bearing = this.rng() * Math.PI * 2;
    const x = cameraPos.x + Math.sin(bearing) * (forced ? SPAWN_RING * 0.55 : SPAWN_RING);
    const z = cameraPos.z + Math.cos(bearing) * (forced ? SPAWN_RING * 0.55 : SPAWN_RING);

    // Aim roughly at the camera's vicinity but offset so most storms graze
    // past rather than score a direct hit every time.
    const aimOffsetAngle = (this.rng() - 0.5) * 1.6;
    let heading = Math.atan2(cameraPos.x - x, cameraPos.z - z) + aimOffsetAngle;

    this.cells.push({
      x,
      z,
      heading,
      speed: 14 + this.rng() * 16,
      curlSeed: this.rng() * 1000,
      coreRadius: 260 + this.rng() * 220,
      falloffRadius: 620 + this.rng() * 380,
      age: 0,
      matureDuration: 30 + this.rng() * 40,
      phase: "growing",
      strength: 0,
      wobbleSeed: this.rng() * 1000,
    });
  }

  update(dt, cameraPos) {
    const scaledDt = dt * this.timeScale;
    this.scaledElapsed += scaledDt;

    // --- advance / age storm cells ---
    for (const cell of this.cells) {
      cell.age += scaledDt;
      const curl = (fbm2D(cell.curlSeed, cell.age * 0.03) - 0.5) * 0.6;
      cell.heading += curl * scaledDt;
      cell.x += Math.sin(cell.heading) * cell.speed * scaledDt;
      cell.z += Math.cos(cell.heading) * cell.speed * scaledDt;

      if (cell.phase === "growing") {
        cell.strength = smoothstep(0, GROW_TIME, cell.age);
        if (cell.age >= GROW_TIME) cell.phase = "mature";
      } else if (cell.phase === "mature") {
        const wobble = 0.92 + 0.08 * Math.sin(cell.age * 0.7 + cell.wobbleSeed);
        cell.strength = wobble;
        if (cell.age >= GROW_TIME + cell.matureDuration) {
          cell.phase = "decaying";
          cell.decayStart = cell.age;
        }
      } else {
        const t = (cell.age - cell.decayStart) / DECAY_TIME;
        cell.strength = clamp(1 - smoothstep(0, 1, t), 0, 1);
      }
    }

    const dx0 = cameraPos.x;
    const dz0 = cameraPos.z;
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const cell = this.cells[i];
      const dist = Math.hypot(cell.x - dx0, cell.z - dz0);
      const expired =
        (dist > DESPAWN_RING && (cell.phase === "decaying" || dist > DESPAWN_RING * 1.4)) ||
        (cell.phase === "decaying" && cell.strength <= 0.01);
      if (expired) this.cells.splice(i, 1);
    }

    // --- auto spawn ---
    if (this.autoMode) {
      this.spawnCooldown -= scaledDt;
      if (this.spawnCooldown <= 0 && this.cells.length < MAX_CELLS) {
        this._spawnCell(cameraPos, false);
        this.spawnCooldown = 35 + this.rng() * 40;
      }
    }

    this._computeState(scaledDt, cameraPos);
  }

  _computeState(dt, cameraPos) {
    let bestInfluence = 0;
    let nearestDistance = null;
    let nearestBearing = 0;
    let inflowX = 0;
    let inflowZ = 0;
    let lightningRate = 0;

    for (const cell of this.cells) {
      const dx = cell.x - cameraPos.x;
      const dz = cell.z - cameraPos.z;
      const dist = Math.hypot(dx, dz);
      const falloff = 1 - smoothstep(cell.coreRadius, cell.falloffRadius, dist);
      const influence = clamp(falloff * cell.strength, 0, 1);

      if (influence > bestInfluence) bestInfluence = influence;
      if (nearestDistance === null || dist < nearestDistance) {
        nearestDistance = dist;
        nearestBearing = Math.atan2(dx, dz);
      }
      if (dist > 1) {
        // Cyclonic spiral: mostly tangential (rotate the inward vector ~75°)
        // with a small residual inward pull, not a straight-line inflow —
        // this is what actually reads as "typhoon" rather than "storm blob".
        const nx = dx / dist;
        const nz = dz / dist;
        const spiralAngle = 1.3;
        const cosA = Math.cos(spiralAngle);
        const sinA = Math.sin(spiralAngle);
        inflowX += (nx * cosA - nz * sinA) * influence;
        inflowZ += (nx * sinA + nz * cosA) * influence;
      }
      if (influence > 0.4) {
        lightningRate += ((influence - 0.4) / 0.6) * 0.32 * cell.strength;
      }
    }

    let stormInfluence = bestInfluence;
    if (this.manualOverride !== null) {
      stormInfluence = this.manualOverride;
      lightningRate = stormInfluence > 0.4 ? ((stormInfluence - 0.4) / 0.6) * 0.32 : 0;
    }

    // Slow ambient background climate — never fully calm, never storm-strength.
    const climateT = this.scaledElapsed * 0.008 + this.globalWindSeedOffset;
    const globalWindSpeed = 2.5 + fbm2D(climateT, 0.3) * 5.5;
    const globalWindAngle = fbm2D(climateT * 0.4, 5.1) * Math.PI * 2;
    const globalDirX = Math.sin(globalWindAngle);
    const globalDirZ = Math.cos(globalWindAngle);

    let windDirX = globalDirX;
    let windDirZ = globalDirZ;
    const inflowLen = Math.hypot(inflowX, inflowZ);
    if (inflowLen > 1e-4) {
      const nx = inflowX / inflowLen;
      const nz = inflowZ / inflowLen;
      const pull = stormInfluence * 0.85;
      windDirX = lerp(globalDirX, nx, pull);
      windDirZ = lerp(globalDirZ, nz, pull);
      const len = Math.hypot(windDirX, windDirZ) || 1;
      windDirX /= len;
      windDirZ /= len;
    }

    const windSpeed = clamp(globalWindSpeed + stormInfluence * 24, 0, 30);
    const rainIntensity = smoothstep(0.32, 0.78, stormInfluence);
    const ambientCloud = 0.16 + fbm2D(climateT * 0.6, 88.2) * 0.18;
    const cloudDensity = clamp(ambientCloud + stormInfluence * 0.3, 0, 1);
    const skyDarkness = clamp(stormInfluence * 0.92 + ambientCloud * 0.08, 0, 1);
    const fogDensity = lerp(0.00055, 0.0062, smoothstep(0.15, 0.9, stormInfluence));
    const exposure = 1 - stormInfluence * 0.22;

    // Slow day-arc for the sun; never sets, keeps the scene readable.
    const sunT = this.scaledElapsed * 0.006;
    const elevation = lerp(0.55, 0.92, 0.5 + 0.5 * Math.sin(sunT * 0.35));
    const azimuth = this.sunAzimuthBase + sunT * 0.05;
    this.persistentSunDir
      .set(Math.cos(azimuth) * Math.cos(elevation * 1.1), Math.sin(elevation * 1.1) + 0.15, Math.sin(azimuth) * Math.cos(elevation * 1.1))
      .normalize();

    this._outZenith.copy(this.skyZenithClear).lerp(this.skyZenithStorm, skyDarkness);
    this._outHorizon.copy(this.skyHorizonClear).lerp(this.skyHorizonStorm, skyDarkness);
    this._outFog.copy(this.fogColorClear).lerp(this.fogColorStorm, skyDarkness);

    let label = "晴朗";
    if (stormInfluence > 0.75) label = "台风眼墙";
    else if (stormInfluence > 0.4) label = "台风暴雨带";
    else if (stormInfluence > 0.15) label = "外围风力增强";
    else if (cloudDensity > 0.32) label = "多云";

    const s = this.state;
    s.windDir.x = windDirX;
    s.windDir.y = windDirZ;
    s.windSpeed = windSpeed;
    s.stormInfluence = stormInfluence;
    s.rainIntensity = rainIntensity;
    s.cloudDensity = cloudDensity;
    s.skyDarkness = skyDarkness;
    s.fogDensity = fogDensity;
    s.exposure = exposure;
    s.sunDirection.copy(this.persistentSunDir);
    s.lightningRate = lightningRate;
    s.nearestDistance = nearestDistance;
    s.nearestBearing = nearestBearing;
    s.label = label;
  }

  /**
   * Up to `max` cells expressed relative to the camera, for SkyDome's angular
   * cloud patches. Reuses a pooled array/objects instead of allocating fresh
   * ones every frame — MAX_CELLS is small enough that no sorting/truncation
   * is ever actually needed since this.cells.length never exceeds it.
   */
  getCellsRelative(cameraPos, max = 3) {
    const pool = this._relativeCellsPool;
    const count = Math.min(this.cells.length, max);
    for (let i = 0; i < count; i++) {
      const cell = this.cells[i];
      const dx = cell.x - cameraPos.x;
      const dz = cell.z - cameraPos.z;
      const dist = Math.hypot(dx, dz) || 1;
      const angular = clamp(1 - (cell.falloffRadius * 1.4) / (dist + cell.falloffRadius), -0.6, 0.96);
      let slot = pool[i];
      if (!slot) {
        slot = {};
        pool[i] = slot;
      }
      slot.dirX = dx / dist;
      slot.dirZ = dz / dist;
      slot.angular = angular;
      slot.strength = cell.strength;
    }
    pool.length = count;
    return pool;
  }

  /** Strongest nearby cell, distance-discounted — the source for any strike. */
  _findBestCell(cameraPos) {
    let best = null;
    let bestScore = 0;
    for (const cell of this.cells) {
      const dx = cell.x - cameraPos.x;
      const dz = cell.z - cameraPos.z;
      const dist = Math.hypot(dx, dz);
      const score = cell.strength / (1 + dist * 0.001);
      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    }
    return best;
  }

  _strikeFromCell(cell, cameraPos) {
    const ang = this.rng() * Math.PI * 2;
    const r = this.rng() * cell.coreRadius * 0.8;
    const x = cell.x + Math.sin(ang) * r;
    const z = cell.z + Math.cos(ang) * r;
    const dist = Math.hypot(x - cameraPos.x, z - cameraPos.z);
    return { x, z, distance: dist, strength: cell.strength };
  }

  /** Called once per frame by LightningSystem; returns a strike descriptor or null. */
  rollLightningStrike(dt, cameraPos) {
    if (this.state.lightningRate <= 0) return null;
    const probability = this.state.lightningRate * dt;
    if (this.rng() > probability) return null;

    const best = this._findBestCell(cameraPos);
    if (!best) return null;
    return this._strikeFromCell(best, cameraPos);
  }

  /** Manual "test lightning" trigger for the GUI — always produces a strike. */
  triggerLightningNow(cameraPos) {
    const best = this._findBestCell(cameraPos);
    if (best) return this._strikeFromCell(best, cameraPos);

    const ang = this.rng() * Math.PI * 2;
    const dist = 60 + this.rng() * 60;
    const x = cameraPos.x + Math.sin(ang) * dist;
    const z = cameraPos.z + Math.cos(ang) * dist;
    return { x, z, distance: dist, strength: 1 };
  }
}
