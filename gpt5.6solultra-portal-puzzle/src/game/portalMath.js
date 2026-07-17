import * as THREE from 'three';

const _delta = new THREE.Vector3();

/**
 * 将世界空间向量变换到入口门局部坐标，再绕局部 Y 轴旋转 180°映射到出口门。
 * 这个变换同时适用于朝向和线速度，因此会保留向量长度（动量大小）。
 */
export function mapVectorThroughPortal(vector, entry, exit, target = new THREE.Vector3()) {
  const lx = vector.dot(entry.right);
  const ly = vector.dot(entry.up);
  const lz = vector.dot(entry.normal);
  return target
    .copy(exit.right).multiplyScalar(-lx)
    .addScaledVector(exit.up, ly)
    .addScaledVector(exit.normal, -lz);
}

/** 将点按双门刚体变换映射到出口另一侧。 */
export function mapPointThroughPortal(point, entry, exit, target = new THREE.Vector3()) {
  _delta.subVectors(point, entry.position);
  const lx = _delta.dot(entry.right);
  const ly = _delta.dot(entry.up);
  const lz = _delta.dot(entry.normal);
  return target
    .copy(exit.position)
    .addScaledVector(exit.right, -lx)
    .addScaledVector(exit.up, ly)
    .addScaledVector(exit.normal, -lz);
}

/**
 * 以物体包围盒计算它相对门平面的最前支撑距离，供“半身刚进入门洞”时触发。
 */
export function supportAlongNormal(halfExtents, normal) {
  return Math.abs(normal.x) * halfExtents.x
    + Math.abs(normal.y) * halfExtents.y
    + Math.abs(normal.z) * halfExtents.z;
}

/** 检查一个运动物体是否从门正面穿过椭圆孔，而不是只擦过墙面。 */
export function crossingPortal(previous, next, portal, halfExtents, velocity) {
  if (!portal?.active || velocity.dot(portal.normal) >= -1e-5) return false;

  const support = supportAlongNormal(halfExtents, portal.normal);
  const before = _delta.subVectors(previous, portal.position).dot(portal.normal) - support;
  const after = _delta.subVectors(next, portal.position).dot(portal.normal) - support;
  if (before < -0.08 || after > 0.04) return false;

  _delta.subVectors(next, portal.position);
  const x = _delta.dot(portal.right);
  const y = _delta.dot(portal.up);
  const radiusX = Math.max(0.22, portal.halfWidth - Math.min(halfExtents.length() * 0.2, 0.18));
  const radiusY = Math.max(0.4, portal.halfHeight - Math.min(halfExtents.length() * 0.25, 0.34));
  return (x * x) / (radiusX * radiusX) + (y * y) / (radiusY * radiusY) <= 1;
}

/** 把射线命中点约束在可放置面内，保证整个门洞不会越出面板。 */
export function clampPortalPoint(localPoint, width, height, halfWidth, halfHeight, target = new THREE.Vector3()) {
  const marginX = Math.min(halfWidth + 0.08, width * 0.48);
  const marginY = Math.min(halfHeight + 0.08, height * 0.48);
  target.set(
    THREE.MathUtils.clamp(localPoint.x, -width / 2 + marginX, width / 2 - marginX),
    THREE.MathUtils.clamp(localPoint.y, -height / 2 + marginY, height / 2 - marginY),
    0,
  );
  return target;
}

/** 返回适合调试输出的数值误差。 */
export function vectorLengthError(before, after) {
  return Math.abs(before.length() - after.length());
}
