import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  computeIdmAcceleration,
  createTrafficSystem,
  signalPhaseAt,
  TRAFFIC_FIXED_STEP,
} from '../src/sim/traffic.js';
import { createAmbientAgents } from '../src/sim/agents.js';

describe('交通纯函数', () => {
  it('NS/EW 双相信号绝不会同时放行，并包含全红间隔', () => {
    let allRedSamples = 0;
    for (let time = 0; time < 56; time += 0.125) {
      const ns = signalPhaseAt(time, 'NS');
      const ew = signalPhaseAt(time, 'EW');
      expect(ns === 'green' && ew === 'green').toBe(false);
      if (ns === 'red' && ew === 'red') allRedSamples += 1;
    }
    expect(allRedSamples).toBeGreaterThan(0);
    expect(signalPhaseAt(0, 'NS')).toBe('green');
    expect(signalPhaseAt(0, 'EW')).toBe('red');
  });

  it('IDM 在自由道路加速、近距离高速逼近时强制制动', () => {
    expect(computeIdmAcceleration({ speed: 4, desiredSpeed: 14, gap: Infinity })).toBeGreaterThan(0);
    expect(computeIdmAcceleration({ speed: 14, desiredSpeed: 14, gap: 5, relativeSpeed: 8 })).toBeLessThan(-2);
    expect(Number.isFinite(computeIdmAcceleration({ speed: 0, desiredSpeed: 14, gap: 2 }))).toBe(true);
  });
});

describe('固定步长交通仿真', () => {
  it('不少于 120 辆 InstancedMesh，闭合路线会转弯且不闯灯碰撞', () => {
    const scene = new THREE.Scene();
    const traffic = createTrafficSystem(scene, {}, { seed: 2026 });
    const fleet = scene.getObjectByName('TrafficVehicles');
    expect(traffic.instanceCount).toBeGreaterThanOrEqual(120);
    expect(fleet).toBeInstanceOf(THREE.InstancedMesh);
    expect(fleet.count).toBe(traffic.instanceCount);
    expect(traffic.routes.every((route) => route.segments.length >= 4)).toBe(true);
    traffic.step(TRAFFIC_FIXED_STEP, 1800);
    const metrics = traffic.getMetrics();
    expect(metrics.completedTurns).toBeGreaterThan(0);
    expect(metrics.redViolations).toBe(0);
    expect(metrics.collisionCount).toBe(0);
    traffic.dispose();
  });

  it('同 seed 同步数逐车一致，reset 可复现，异 seed 变化', () => {
    const first = createTrafficSystem(new THREE.Scene(), {}, { seed: 1337 });
    const second = createTrafficSystem(new THREE.Scene(), {}, { seed: 1337 });
    const different = createTrafficSystem(new THREE.Scene(), {}, { seed: 42 });
    first.step(TRAFFIC_FIXED_STEP, 720);
    second.step(TRAFFIC_FIXED_STEP, 720);
    different.step(TRAFFIC_FIXED_STEP, 720);
    expect(first.getSnapshot()).toEqual(second.getSnapshot());
    expect(first.getSnapshot()).not.toEqual(different.getSnapshot());
    first.reset(1337);
    first.step(TRAFFIC_FIXED_STEP, 720);
    expect(first.getSnapshot()).toEqual(second.getSnapshot());
    first.dispose();
    second.dispose();
    different.dispose();
  });

  it('不同渲染帧切片得到相同固定步结果', () => {
    const first = createTrafficSystem(new THREE.Scene(), {}, { seed: 2026 });
    const second = createTrafficSystem(new THREE.Scene(), {}, { seed: 2026 });
    for (let index = 0; index < 300; index += 1) first.update(1 / 30);
    for (let index = 0; index < 600; index += 1) second.update(1 / 60);
    expect(first.getSnapshot()).toEqual(second.getSnapshot());
    first.dispose();
    second.dispose();
  });
});

describe('环境动画体', () => {
  it('同时包含鸟群、直升机、船和局部关节动画', () => {
    const agents = createAmbientAgents(new THREE.Scene(), { seed: 2026 });
    const before = agents.getMetrics();
    agents.step(1 / 60, 120);
    const after = agents.getMetrics();
    expect(after.birdCount).toBeGreaterThanOrEqual(18);
    expect(after.helicopterCount).toBe(1);
    expect(after.boatCount).toBeGreaterThanOrEqual(3);
    expect(after.wingAngle).not.toBe(before.wingAngle);
    expect(after.mainRotorAngle).not.toBe(before.mainRotorAngle);
    agents.dispose();
  });
});
