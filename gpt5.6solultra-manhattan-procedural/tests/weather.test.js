import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  clampTransitionDuration,
  computePrecipitationVelocity,
  createWeatherSystem,
  selectHighestTarget,
  smoothTransitionAlpha,
  thunderDelaySeconds,
  WEATHER_FIXED_STEP,
  WEATHER_KINDS,
  WEATHER_PRESETS,
} from '../src/weather/weather.js';

describe('天气纯函数', () => {
  it('冻结六个预设，过渡时长钳制在 4–8 秒', () => {
    expect(WEATHER_KINDS).toEqual(['clear', 'cloudy', 'fog', 'rain', 'storm', 'snow']);
    expect(Object.keys(WEATHER_PRESETS)).toEqual(WEATHER_KINDS);
    expect(clampTransitionDuration(1)).toBe(4);
    expect(clampTransitionDuration(12)).toBe(8);
    expect(clampTransitionDuration(6)).toBe(6);
  });

  it('smoothstep 过渡单调且端点准确', () => {
    const samples = Array.from({ length: 21 }, (_, index) => smoothTransitionAlpha(index / 20, 1));
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(1);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1]);
    }
  });

  it('风改变雨雪倾角，雷声严格按 343m/s 延迟', () => {
    const rain = computePrecipitationVelocity('rain', { x: 12, z: -5 });
    const snow = computePrecipitationVelocity('snow', { x: 12, z: -5 });
    expect(rain.x).not.toBe(0);
    expect(snow.x).not.toBe(0);
    expect(Math.abs(snow.y)).toBeLessThan(Math.abs(rain.y));
    expect(thunderDelaySeconds(686)).toBeCloseTo(2, 10);
  });

  it('雷电候选选择世界坐标最高者', () => {
    const low = new THREE.Object3D();
    const high = new THREE.Object3D();
    const medium = new THREE.Object3D();
    low.position.y = 80;
    high.position.y = 310;
    medium.position.y = 180;
    expect(selectHighestTarget([low, high, medium])).toBe(high);
  });
});

function createFixture(seed = 2026) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(120, 15, -60);
  const roadMaterial = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.03 });
  const low = new THREE.Object3D();
  low.name = 'low';
  low.position.set(-30, 140, 20);
  const highest = new THREE.Object3D();
  highest.name = 'highest';
  highest.position.set(12, 326, -16);
  scene.add(low, highest);
  const weather = createWeatherSystem(scene, camera, {
    seed,
    roadMaterial,
    buildingMaterials: [new THREE.MeshStandardMaterial({ color: 0x8a8e94 })],
    highestTarget: [low, highest],
  });
  return { scene, camera, roadMaterial, highest, weather };
}

describe('固定步长天气系统', () => {
  it('雨态在 4 秒内平滑收敛，并让路面变湿变亮', () => {
    const fixture = createFixture();
    expect(fixture.weather.setWeather('rain', 1)).toBe(4);
    fixture.weather.step(WEATHER_FIXED_STEP, 120);
    const middle = fixture.weather.getState();
    expect(middle.transitioning).toBe(true);
    expect(middle.wetness).toBeGreaterThan(0.35);
    expect(middle.wetness).toBeLessThan(0.65);
    fixture.weather.step(WEATHER_FIXED_STEP, 120);
    const complete = fixture.weather.getState();
    expect(complete.kind).toBe('rain');
    expect(complete.wetness).toBeCloseTo(1, 8);
    expect(fixture.roadMaterial.roughness).toBeLessThan(0.3);
    fixture.weather.dispose();
    expect(fixture.roadMaterial.roughness).toBeCloseTo(0.82, 8);
  });

  it('雪累积、风同时改变粒子倾角和云速', () => {
    const fixture = createFixture();
    fixture.weather.setWind(18, -7);
    fixture.weather.setWeather('snow', 4);
    fixture.weather.step(WEATHER_FIXED_STEP, 240);
    const state = fixture.weather.getState();
    expect(state.kind).toBe('snow');
    expect(state.snowCover).toBeCloseTo(1, 8);
    expect(state.snowTilt).toBeGreaterThan(0);
    expect(state.cloudSpeed).toBeGreaterThan(Math.hypot(18, 7));
    expect(fixture.weather.group.userData.snowCover).toBeCloseTo(1, 8);
    fixture.weather.dispose();
  });

  it('闪电命中最高对象并记录声速延迟，未解锁音频不报错', async () => {
    const fixture = createFixture();
    const strike = fixture.weather.forceLightning();
    expect(strike.targetName).toBe('highest');
    expect(strike.target.y).toBeCloseTo(fixture.highest.position.y, 8);
    expect(strike.endpointError).toBeLessThanOrEqual(1e-9);
    expect(strike.thunderDelay).toBeCloseTo(strike.distance / 343, 10);
    await expect(fixture.weather.unlockAudio()).resolves.toBe(false);
    fixture.weather.step(WEATHER_FIXED_STEP, 240);
    expect(fixture.weather.getState().lightningCount).toBe(1);
    fixture.weather.dispose();
  });

  it('同 seed 且不同渲染帧切片仍得到相同固定步状态', () => {
    const first = createFixture(1337);
    const second = createFixture(1337);
    first.weather.setWind(11, 4);
    second.weather.setWind(11, 4);
    first.weather.setWeather('storm', 5);
    second.weather.setWeather('storm', 5);
    for (let index = 0; index < 300; index += 1) first.weather.update(1 / 30);
    for (let index = 0; index < 600; index += 1) second.weather.update(1 / 60);
    expect(first.weather.getState()).toEqual(second.weather.getState());
    first.weather.dispose();
    second.weather.dispose();
  });
});
