import * as THREE from 'three';

// 赛道控制点 (XZ平面环形赛道)
export const TRACK_CONTROL_POINTS = [
  new THREE.Vector3(0, 0, 60),      // 起点 / 终点 (t = 0 / 1)
  new THREE.Vector3(55, 0, 45),     // 右上弯道前
  new THREE.Vector3(75, 0, 0),      // 右侧大直道
  new THREE.Vector3(55, 0, -45),    // 右下急弯
  new THREE.Vector3(0, 0, -65),     // 下直道中点
  new THREE.Vector3(-55, 0, -45),   // 左下急弯
  new THREE.Vector3(-75, 0, 10),    // 左侧直道
  new THREE.Vector3(-45, 0, 50)     // 左上S弯
];

export const ROAD_HALF_WIDTH = 9.5; // 赛道半宽度

let trackCurveInstance = null;

/**
 * 获取或创建闭合样条曲线实例
 */
export function getTrackCurve() {
  if (!trackCurveInstance) {
    trackCurveInstance = new THREE.CatmullRomCurve3(
      TRACK_CONTROL_POINTS,
      true, // 闭合闭环
      'centripetal' //  centripetal 算法不容易产生自交环
    );
  }
  return trackCurveInstance;
}

/**
 * 计算车辆 (x, z) 坐标在赛道样条曲线上的投影
 * 返回：最近的样条坐标点、切线朝向、离中心线的距离、以及样条进度参数 t (0~1)
 */
export function getSplineProjection(x, z, curve = getTrackCurve()) {
  const p = new THREE.Vector3(x, 0, z);
  
  // 1. 初步粗糙搜索 (在样条上均匀采样 120 个点)
  const segments = 120;
  let minDistanceSq = Infinity;
  let bestT = 0;
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = curve.getPointAt(t);
    const distSq = p.distanceToSquared(pt);
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      bestT = t;
    }
  }

  // 2. 局部细化搜索 (在最佳 t 左右区间进行二分搜索 3 次)
  let range = 1.0 / segments;
  let low = bestT - range;
  let high = bestT + range;
  
  // 处理闭环溢出
  if (low < 0) low += 1.0;
  if (high > 1.0) high -= 1.0;

  const steps = 3;
  for (let step = 0; step < steps; step++) {
    const sampleCount = 6;
    for (let j = 0; j < sampleCount; j++) {
      const frac = j / (sampleCount - 1);
      // 在 low 和 high 之间插值
      let t = low + frac * (high - low);
      if (t < 0) t += 1.0;
      if (t > 1.0) t -= 1.0;
      
      const pt = curve.getPointAt(t);
      const distSq = p.distanceToSquared(pt);
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        bestT = t;
      }
    }
    
    // 缩小区间
    range = range * 0.35;
    low = bestT - range;
    high = bestT + range;
  }

  // 3. 计算最终位置、切线及物理偏离距离
  const targetPos = curve.getPointAt(bestT);
  const tangent = curve.getTangentAt(bestT); // 已经归一化
  const distance = p.distanceTo(targetPos);
  
  const isOffroad = distance > ROAD_HALF_WIDTH;

  return {
    t: bestT,
    projectedPosition: targetPos,
    tangent: tangent,
    distance: distance,
    isOffroad: isOffroad
  };
}

/**
 * 计算车辆当前的朝向角度（radians）与赛道正向切线的偏角
 * 用于判断是否逆行
 */
export function checkWrongWay(heading, tangent) {
  // 车辆的二维朝向向量
  const kartDir = new THREE.Vector2(Math.sin(heading), -Math.cos(heading));
  // 赛道的二维切线朝向 (XZ平面，注意 Three.js 的 X 对应 x，Z 对应 y)
  const trackDir = new THREE.Vector2(tangent.x, tangent.z);
  
  // 夹角余弦值
  const dot = kartDir.dot(trackDir);
  return dot < -0.2; // 夹角余弦小于-0.2说明正朝着反方向开 (逆行)
}
