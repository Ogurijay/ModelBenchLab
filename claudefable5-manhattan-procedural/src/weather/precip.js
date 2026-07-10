// 降水:实例化雨丝(随风倾斜)与雪花(飘摆下落),围绕相机焦点循环回收。
import * as THREE from 'three';
import { mulberry32 } from '../core/prng.js';

const RAIN_N = 3600, SNOW_N = 5200, RADIUS = 135, CEIL = 150;

export function createPrecipitation(scene) {
  const rand = mulberry32(777);

  const rainGeo = new THREE.BoxGeometry(0.09, 2.3, 0.09);
  const rainMat = new THREE.MeshBasicMaterial({ color: 0xb9cbdc, transparent: true, opacity: 0.5 });
  const rain = new THREE.InstancedMesh(rainGeo, rainMat, RAIN_N);
  rain.frustumCulled = false;
  const rainP = new Float32Array(RAIN_N * 4); // x,y,z,speed
  for (let i = 0; i < RAIN_N; i++) {
    rainP[i * 4] = (rand() - 0.5) * RADIUS * 2;
    rainP[i * 4 + 1] = rand() * CEIL;
    rainP[i * 4 + 2] = (rand() - 0.5) * RADIUS * 2;
    rainP[i * 4 + 3] = 84 + rand() * 30;
  }

  const snowGeo = new THREE.TetrahedronGeometry(0.17);
  const snowMat = new THREE.MeshBasicMaterial({ color: 0xf4f7ff, transparent: true, opacity: 0.92 });
  const snow = new THREE.InstancedMesh(snowGeo, snowMat, SNOW_N);
  snow.frustumCulled = false;
  const snowP = new Float32Array(SNOW_N * 4); // x,y,z,phase
  for (let i = 0; i < SNOW_N; i++) {
    snowP[i * 4] = (rand() - 0.5) * RADIUS * 2;
    snowP[i * 4 + 1] = rand() * CEIL;
    snowP[i * 4 + 2] = (rand() - 0.5) * RADIUS * 2;
    snowP[i * 4 + 3] = rand() * Math.PI * 2;
  }

  scene.add(rain, snow);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qSnow = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let t = 0;

  return {
    dispose() {
      scene.remove(rain, snow);
      rainGeo.dispose(); rainMat.dispose(); snowGeo.dispose(); snowMat.dispose();
    },
    update(dt, focus, rainI, snowI, wind) {
      t += dt;
      const fx = focus.x, fz = focus.z;

      // ---- 雨 ----
      const rCount = Math.round(THREE.MathUtils.clamp(rainI, 0, 1) * RAIN_N);
      rain.count = rCount;
      if (rCount > 0) {
        q.setFromAxisAngle(zAxis, -Math.atan2(wind * 0.55, 80));
        for (let i = 0; i < rCount; i++) {
          let x = rainP[i * 4], y = rainP[i * 4 + 1], z = rainP[i * 4 + 2];
          y -= rainP[i * 4 + 3] * dt;
          x += wind * 0.55 * dt;
          if (y < 0) {
            y += CEIL;
            x = (rand() - 0.5) * RADIUS * 2;
            z = (rand() - 0.5) * RADIUS * 2;
          }
          rainP[i * 4] = x; rainP[i * 4 + 1] = y; rainP[i * 4 + 2] = z;
          pos.set(fx + x, y, fz + z);
          m4.compose(pos, q, one);
          rain.setMatrixAt(i, m4);
        }
        rain.instanceMatrix.needsUpdate = true;
      }
      rainMat.opacity = 0.5 * Math.min(1, rainI * 1.6);

      // ---- 雪 ----
      const sCount = Math.round(THREE.MathUtils.clamp(snowI, 0, 1) * SNOW_N);
      snow.count = sCount;
      if (sCount > 0) {
        for (let i = 0; i < sCount; i++) {
          let x = snowP[i * 4], y = snowP[i * 4 + 1], z = snowP[i * 4 + 2];
          const ph = snowP[i * 4 + 3];
          y -= (3.1 + Math.sin(ph) * 0.6) * dt;
          x += (Math.sin(t * 1.7 + ph) * 0.9 + wind * 0.3) * dt;
          z += Math.cos(t * 1.3 + ph * 1.7) * 0.8 * dt;
          if (y < 0) {
            y += CEIL;
            x = (rand() - 0.5) * RADIUS * 2;
            z = (rand() - 0.5) * RADIUS * 2;
          }
          snowP[i * 4] = x; snowP[i * 4 + 1] = y; snowP[i * 4 + 2] = z;
          pos.set(fx + x, y, fz + z);
          qSnow.setFromAxisAngle(zAxis, ph + t * 0.6);
          m4.compose(pos, qSnow, one);
          snow.setMatrixAt(i, m4);
        }
        snow.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
