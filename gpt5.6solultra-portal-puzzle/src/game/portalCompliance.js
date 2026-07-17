import * as THREE from 'three';
import { mapPointThroughPortal, mapVectorThroughPortal } from './portalMath.js';

const EPSILON = 1e-6;

function frame(position, normal, up) {
  const n = new THREE.Vector3(...normal).normalize();
  const u = new THREE.Vector3(...up).normalize();
  return {
    active: true,
    position: new THREE.Vector3(...position),
    normal: n,
    up: u,
    right: u.clone().cross(n).normalize(),
    halfWidth: 0.75,
    halfHeight: 1.275,
  };
}

function vector(values) { return new THREE.Vector3(...values); }

function close(actual, expected) {
  return actual.distanceTo(expected) <= EPSILON;
}

/** 按 benchmark/tasks/code-to-3d/portal.md 的冻结口径执行 10 组断言。 */
export function runPortalComplianceTest() {
  const A = frame([0, 1, -5], [0, 0, 1], [0, 1, 0]);
  const B = frame([0, 1, 5], [0, 0, -1], [0, 1, 0]);
  const C = frame([0, 0, 0], [0, 1, 0], [0, 0, -1]);
  const D = frame([0, 2, -10], [0, 0, 1], [0, 1, 0]);
  const E = frame([-5, 1, 0], [1, 0, 0], [0, 1, 0]);
  const F = frame([2, 4, 2], [0, -1, 0], [0, 0, 1]);
  const cases = [];

  const check = (name, actual, expected) => {
    const pass = close(actual, expected);
    cases.push({
      name,
      pass,
      actual: actual.toArray().map((value) => +value.toFixed(7)),
      expected: expected.toArray(),
    });
  };

  check('对穿门速度保向', mapVectorThroughPortal(vector([0, 0, -5]), A, B), vector([0, 0, -5]));
  check('对穿门位置映射', mapPointThroughPortal(vector([0.3, 1.2, -5.1]), A, B), vector([0.3, 1.2, 4.9]));
  check('地面到墙面下落转水平', mapVectorThroughPortal(vector([0, -12, 0]), C, D), vector([0, 0, 12]));
  check('地面到墙面位置映射', mapPointThroughPortal(vector([0.5, -0.1, 0.3]), C, D), vector([-0.5, 1.7, -9.9]));
  check('垂直墙速度旋转', mapVectorThroughPortal(vector([1, 0, -5]), A, E), vector([5, 0, 1]));
  check('顶面上升转水平', mapVectorThroughPortal(vector([0, 6, 0]), F, A), vector([0, 0, 6]));
  check('对穿门侧向保向', mapVectorThroughPortal(vector([1, 0, 0]), A, B), vector([1, 0, 0]));
  check('复合速度模长守恒', mapVectorThroughPortal(vector([3, -4, 12]), C, D), vector([-3, -12, 4]));
  const original = vector([0.4, 0.9, -5.2]);
  check('位置往返恒等', mapPointThroughPortal(mapPointThroughPortal(original, A, B), B, A), original);
  check('上向量脚先入脚先出', mapVectorThroughPortal(vector([0, 1, 0]), C, D), vector([0, 0, -1]));

  return { passed: cases.filter((item) => item.pass).length, total: cases.length, cases };
}
