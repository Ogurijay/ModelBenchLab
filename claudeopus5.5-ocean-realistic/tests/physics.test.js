import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Ocean } from '../src/ocean/ocean.js';
import { BuoyancyWorld, FloatingBody, voxelPoints, WATER_DENSITY } from '../src/physics/buoyancy.js';

function crate(density) {
  const size = new THREE.Vector3(1, 1, 1);
  return new FloatingBody({
    object: new THREE.Object3D(),
    mass: WATER_DENSITY * density,
    size,
    volume: 1,
    points: voxelPoints(size, [3, 3, 3]),
    cellHeight: 1 / 3
  });
}

function run(ocean, world, seconds, onStep) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    ocean.update(dt);
    world.step(dt / 2);
    world.step(dt / 2);
    onStep?.(i);
  }
}

describe('CPU 海面副本', () => {
  const ocean = new Ocean(null, { N: 64, cpuOnly: true, sea: { windSpeed: 10, swellHeight: 1 } });
  ocean.update(1 / 60);

  it('反求后的水面点确实落在查询位置', () => {
    for (const [x, z] of [[3, 4], [-40, 12], [120, -77]]) {
      const q = ocean.query(x, z, {});
      // 由反求出的 x0 正向位移回去应回到 (x, z)
      let x0 = x;
      let z0 = z;
      for (let i = 0; i < 6; i++) {
        const d = ocean.cpu.displacement(x0, z0);
        x0 = x - d.x;
        z0 = z - d.z;
      }
      const d = ocean.cpu.displacement(x0, z0);
      expect(Math.abs(x0 + d.x - x)).toBeLessThan(0.02);
      expect(Math.abs(z0 + d.z - z)).toBeLessThan(0.02);
      expect(Number.isFinite(q.height)).toBe(true);
    }
  });

  it('海面高度统计与 Hs 量级一致', () => {
    let s2 = 0;
    let n = 0;
    for (let x = 0; x < 500; x += 7) {
      for (let z = 0; z < 500; z += 7) {
        const h = ocean.heightAt(x, z);
        s2 += h * h;
        n++;
      }
    }
    const hs = 4 * Math.sqrt(s2 / n);
    const expected = ocean.stats().hs;
    expect(hs / expected).toBeGreaterThan(0.6);
    expect(hs / expected).toBeLessThan(1.3);
  });
});

describe('浮力', () => {
  it('静水中密度 0.5 的木箱吃水约一半', () => {
    const ocean = new Ocean(null, { N: 64, cpuOnly: true, sea: { windSpeed: 0.5, swellHeight: 0 } });
    const world = new BuoyancyWorld(ocean);
    const b = world.add(crate(0.5));
    b.position.set(0, 2, 0);
    run(ocean, world, 15);
    expect(b.position.y).toBeGreaterThan(-0.12);
    expect(b.position.y).toBeLessThan(0.12);
    expect(b.velocity.length()).toBeLessThan(0.05);
  });

  it('重于水的物体下沉', () => {
    const ocean = new Ocean(null, { N: 64, cpuOnly: true, sea: { windSpeed: 0.5, swellHeight: 0 } });
    const world = new BuoyancyWorld(ocean);
    const b = world.add(crate(1.6));
    b.position.set(0, 0, 0);
    run(ocean, world, 5);
    expect(b.position.y).toBeLessThan(-3);
  });

  it('风浪中长时间稳定，波谱瞬切也不会把浮体甩飞', () => {
    const ocean = new Ocean(null, { N: 64, cpuOnly: true, sea: { windSpeed: 19, fetch: 250, swellHeight: 2.4 } });
    const world = new BuoyancyWorld(ocean);
    const light = world.add(crate(0.1));
    const heavy = world.add(crate(0.6));
    heavy.position.set(5, 0, 0);
    let maxSpeed = 0;
    run(ocean, world, 20, () => {
      maxSpeed = Math.max(maxSpeed, light.velocity.length(), heavy.velocity.length());
    });
    ocean.setSea({ windSpeed: 3, fetch: 30, swellHeight: 0.2 }, { immediate: true });
    run(ocean, world, 5, () => {
      maxSpeed = Math.max(maxSpeed, light.velocity.length(), heavy.velocity.length());
    });
    expect(maxSpeed).toBeLessThan(25);
    expect(Math.abs(light.position.y)).toBeLessThan(5);
    expect(Math.hypot(heavy.position.x, heavy.position.z)).toBeLessThan(80);
  });

  it('系泊锚链把航标拉回锚点附近', () => {
    const ocean = new Ocean(null, { N: 64, cpuOnly: true, sea: { windSpeed: 12, swellHeight: 1 } });
    const world = new BuoyancyWorld(ocean);
    const b = world.add(crate(0.4));
    b.position.set(30, 0, 0);
    b.anchor = { x: 0, z: 0, length: 3, stiffness: 2.5 };
    run(ocean, world, 30);
    expect(Math.hypot(b.position.x, b.position.z)).toBeLessThan(8);
  });
});
