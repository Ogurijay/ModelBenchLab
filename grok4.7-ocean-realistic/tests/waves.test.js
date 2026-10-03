import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { sunDirection } from '../src/atmosphere.js';
import { FloatSim } from '../src/buoyancy.js';
import { buildSea, evaluateRest, sampleSurface, significantHeight } from '../src/waves.js';

const calmInput = {
  windSpeed: 2,
  windDirection: 0.3,
  steepness: 0.2,
  swellHeight: 0.08,
  swellDirection: 1.1,
  seed: 7
};

const galeInput = {
  windSpeed: 18,
  windDirection: 0.3,
  steepness: 0.85,
  swellHeight: 1.3,
  swellDirection: 1.4,
  seed: 7
};

test('同一参数得到同一组波', () => {
  const a = buildSea(calmInput);
  const b = buildSea(calmInput);
  assert.deepEqual(a.waves.map((wave) => [wave.amplitude, wave.phase, wave.Q]), b.waves.map((wave) => [wave.amplitude, wave.phase, wave.Q]));
});

test('风速升高时有效波高升高，且落在写实范围', () => {
  const calm = significantHeight(buildSea(calmInput).waves);
  const gale = significantHeight(buildSea(galeInput).waves);
  assert.ok(calm < 0.7, `平静海况过高 ${calm}`);
  assert.ok(gale > 3 && gale < 12, `烈风波高异常 ${gale}`);
  assert.ok(gale > calm * 4);
});

test('平静海面法线朝上，雅可比接近 1', () => {
  const waves = buildSea(calmInput).waves;
  let normalY = 0;
  let jacobian = 0;
  const count = 16;
  for (let i = 0; i < count; i++) {
    const sample = sampleSurface(waves, i * 4.1 - 12, i * -2.7, 8);
    assert.ok(Number.isFinite(sample.height));
    normalY += sample.normal.y;
    jacobian += sample.jacobian;
  }
  assert.ok(normalY / count > 0.9);
  assert.ok(Math.abs(jacobian / count - 1) < 0.12);
});

test('尖浪产生水平位移，反求后高度有限', () => {
  const waves = buildSea(galeInput).waves;
  const rest = evaluateRest(waves, 12, -6, 3);
  assert.ok(Math.abs(rest.dx) + Math.abs(rest.dz) > 0.05);
  const surface = sampleSurface(waves, 12, -6, 3);
  assert.ok(Number.isFinite(surface.height));
  assert.ok(surface.normal.y > 0.15);
});

test('傍晚太阳在默认镜头前方且为单位向量', () => {
  const sun = sunDirection(16.65);
  const len = Math.hypot(sun.x, sun.y, sun.z);
  assert.ok(Math.abs(len - 1) < 1e-6);
  assert.ok(sun.y > 0.15 && sun.y < 0.7);
  assert.ok(sun.z < 0);
});

test('浮体在静水上沉到设计吃水并扶正', () => {
  const sim = new FloatSim();
  const object = new THREE.Group();
  object.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.45);
  const body = sim.add(object, {
    mass: 400,
    inertia: 180,
    samples: [
      { x: 0.6, y: -0.2, z: 0.4 },
      { x: -0.6, y: -0.2, z: 0.4 },
      { x: 0.6, y: -0.2, z: -0.4 },
      { x: -0.6, y: -0.2, z: -0.4 }
    ],
    area: 0.25,
    drag: 220,
    righting: 900,
    angularDrag: 2.2,
    moorK: 40,
    moorDamp: 30,
    home: { x: 0, z: 0 }
  });
  const flat = () => ({ height: 0, velocity: { x: 0, y: 0, z: 0 } });
  for (let i = 0; i < 8 * 60; i++) sim.step(1 / 60, flat);
  assert.ok(Math.abs(body.object.position.y + 0.2) < 0.18, `y=${body.object.position.y}`);
  assert.ok(Math.abs(body.object.position.x) < 0.4);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(body.object.quaternion);
  assert.ok(up.y > 0.92, `up.y=${up.y}`);
  assert.ok(Number.isFinite(body.velocity.y));
});

test('金潮和烈风里航标、木箱、油桶保持正浮', () => {
  const seas = [
    {
      name: 'gold',
      windSpeed: 9.4,
      windDirection: 38 * Math.PI / 180,
      steepness: 0.7,
      swellHeight: 0.62,
      swellDirection: 108 * Math.PI / 180,
      seed: 20261002
    },
    {
      name: 'gale',
      windSpeed: 18.2,
      windDirection: 58 * Math.PI / 180,
      steepness: 0.86,
      swellHeight: 1.4,
      swellDirection: 138 * Math.PI / 180,
      seed: 20261002
    }
  ];
  const specs = [
    {
      kind: 'buoy',
      scale: 1.65,
      mass: 90,
      inertia: 80,
      area: 0.045,
      drag: 32,
      righting: 720,
      moorK: 64,
      moorDamp: 36,
      radius: 1.15,
      samples: [
        { x: 0.22, y: -0.42, z: 0.22 },
        { x: -0.22, y: -0.42, z: 0.22 },
        { x: 0.22, y: -0.42, z: -0.22 },
        { x: -0.22, y: -0.42, z: -0.22 }
      ],
      home: { x: 11.2, z: 7.6 }
    },
    {
      kind: 'crate',
      scale: 1.45,
      mass: 34,
      inertia: 18,
      area: 0.025,
      drag: 18,
      righting: 320,
      moorK: 8,
      moorDamp: 6,
      radius: 0.55,
      samples: [
        { x: 0.28, y: -0.3, z: 0.28 },
        { x: -0.28, y: -0.3, z: 0.28 },
        { x: 0.28, y: -0.3, z: -0.28 },
        { x: -0.28, y: -0.3, z: -0.28 }
      ],
      home: { x: 8.2, z: 11.4 }
    },
    {
      kind: 'barrel',
      scale: 1.45,
      mass: 42,
      inertia: 22,
      area: 0.03,
      drag: 20,
      righting: 280,
      moorK: 8,
      moorDamp: 6,
      radius: 0.6,
      samples: [
        { x: 0.3, y: -0.22, z: 0.12 },
        { x: -0.3, y: -0.22, z: -0.12 },
        { x: 0, y: -0.28, z: 0 },
        { x: 0.1, y: -0.16, z: -0.2 }
      ],
      home: { x: 4.6, z: 14.2 }
    }
  ];

  for (const input of seas) {
    const sea = buildSea(input);
    const sim = new FloatSim();
    let time = 0;
    const sampleAt = (x, z) => {
      const sample = sampleSurface(sea, x, z, time);
      return { height: sample.height, velocity: sample.velocity };
    };
    for (const spec of specs) {
      const object = new THREE.Group();
      object.scale.setScalar(spec.scale);
      object.position.set(spec.home.x, 0.45, spec.home.z);
      sim.add(object, spec);
    }
    for (let i = 0; i < 8 * 60; i++) {
      time += 1 / 60;
      sim.step(1 / 60, sampleAt);
    }
    for (const body of sim.bodies) {
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(body.object.quaternion);
      const water = sampleAt(body.object.position.x, body.object.position.z);
      assert.ok(up.y > 0.8, `${input.name} ${body.kind} up.y=${up.y}`);
      assert.ok(
        body.object.position.y > water.height - 1.15 && body.object.position.y < water.height + 1.15,
        `${input.name} ${body.kind} y=${body.object.position.y} water=${water.height}`
      );
    }
  }
});
