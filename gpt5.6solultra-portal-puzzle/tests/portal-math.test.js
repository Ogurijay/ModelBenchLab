import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  clampPortalPoint,
  crossingPortal,
  mapPointThroughPortal,
  mapVectorThroughPortal,
  vectorLengthError,
} from '../src/game/portalMath.js';
import { runTeleportSelfTest } from '../src/game/GameSimulation.js';

const portalA = {
  active: true,
  position: new THREE.Vector3(0, 1, 0),
  right: new THREE.Vector3(1, 0, 0),
  up: new THREE.Vector3(0, 1, 0),
  normal: new THREE.Vector3(0, 0, 1),
  halfWidth: 0.75,
  halfHeight: 1.275,
};

const portalB = {
  active: true,
  position: new THREE.Vector3(8, 2, -3),
  right: new THREE.Vector3(0, 0, -1),
  up: new THREE.Vector3(0, 1, 0),
  normal: new THREE.Vector3(1, 0, 0),
  halfWidth: 0.75,
  halfHeight: 1.275,
};

test('点经过 A→B→A 后回到原位', () => {
  const point = new THREE.Vector3(0.3, 1.4, -0.7);
  const mapped = mapPointThroughPortal(point, portalA, portalB);
  const roundTrip = mapPointThroughPortal(mapped, portalB, portalA);
  assert.ok(roundTrip.distanceTo(point) < 1e-10);
});

test('向量变换保持速度模长并沿出口法向飞出', () => {
  const velocity = new THREE.Vector3(1.5, -2.5, -12);
  const mapped = mapVectorThroughPortal(velocity, portalA, portalB);
  assert.ok(vectorLengthError(velocity, mapped) < 1e-10);
  assert.ok(mapped.dot(portalB.normal) > 11.99);
});

test('只在门洞内且从正面越面时触发', () => {
  const half = new THREE.Vector3(0.3, 0.8, 0.3);
  const velocity = new THREE.Vector3(0, 0, -30);
  assert.equal(crossingPortal(
    new THREE.Vector3(0, 1, 0.5),
    new THREE.Vector3(0, 1, -0.5),
    portalA,
    half,
    velocity,
  ), true);
  assert.equal(crossingPortal(
    new THREE.Vector3(1.5, 1, 0.5),
    new THREE.Vector3(1.5, 1, -0.5),
    portalA,
    half,
    velocity,
  ), false);
});

test('门中心会被约束在授权面板边界内', () => {
  const clamped = clampPortalPoint(new THREE.Vector3(99, -99, 0), 6, 5, 0.75, 1.275);
  assert.ok(clamped.x <= 2.18);
  assert.ok(clamped.y >= -1.15);
  assert.equal(clamped.z, 0);
});

test('内置传送自测全部通过', () => {
  const result = runTeleportSelfTest();
  assert.equal(result.passed, result.total, JSON.stringify(result.cases, null, 2));
  assert.equal(result.total, 5);
});
