import * as THREE from 'three';

// 漂移火花：固定大小的粒子池，按漂移蓄力档位变色（黄 → 橙 → 蓝）。

const POOL_SIZE = 140;

export function createDriftSparks(scene) {
  const positions = new Float32Array(POOL_SIZE * 3);
  const colors = new Float32Array(POOL_SIZE * 3);
  const velocities = new Array(POOL_SIZE).fill(null).map(() => new THREE.Vector3());
  const life = new Float32Array(POOL_SIZE);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.35,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  let cursor = 0;
  const tierColors = [
    new THREE.Color(0xffe066), // 蓄力中
    new THREE.Color(0xff8c1a), // 一档
    new THREE.Color(0x4dd2ff), // 二档
  ];

  function tierOf(kart) {
    if (kart.driftCharge >= kart.miniTurbo[1].charge) return 2;
    if (kart.driftCharge >= kart.miniTurbo[0].charge) return 1;
    return 0;
  }

  return {
    // 漂移中每帧在后轮位置喷出几个粒子。
    emitFrom(kart) {
      if (!kart.drifting) return;
      const color = tierColors[tierOf(kart)];
      const fx = Math.sin(kart.heading);
      const fz = Math.cos(kart.heading);
      for (let n = 0; n < 3; n += 1) {
        const i = cursor;
        cursor = (cursor + 1) % POOL_SIZE;
        const side = n % 2 === 0 ? 0.85 : -0.85;
        positions[i * 3] = kart.x - fx * 1.1 + fz * side;
        positions[i * 3 + 1] = 0.25;
        positions[i * 3 + 2] = kart.z - fz * 1.1 - fx * side;
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        velocities[i].set(
          -fx * 6 + (Math.random() - 0.5) * 4,
          2.5 + Math.random() * 2,
          -fz * 6 + (Math.random() - 0.5) * 4,
        );
        life[i] = 0.45;
      }
    },
    update(dt) {
      for (let i = 0; i < POOL_SIZE; i += 1) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        velocities[i].y -= 12 * dt;
        positions[i * 3] += velocities[i].x * dt;
        positions[i * 3 + 1] = Math.max(0.02, positions[i * 3 + 1] + velocities[i].y * dt);
        positions[i * 3 + 2] += velocities[i].z * dt;
        if (life[i] <= 0) positions[i * 3 + 1] = -10; // 移出视野
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
  };
}
