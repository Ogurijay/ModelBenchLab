// 可平铺的泡沫纹理：周期 Worley（气泡团）× 周期值噪声（丝缕），单通道。

import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

export function buildFoamData(size = 256, cells = 12, seed = 9) {
  const rand = mulberry32(seed);
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) {
    pts[i * 2] = rand();
    pts[i * 2 + 1] = rand();
  }
  const lat = 16;
  const grid = new Float32Array(lat * lat).map(() => rand());
  const value = (x, y, period) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const g = (a, b) => grid[(((b % period) + period) % period) * lat + (((a % period) + period) % period)];
    const top = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * sx;
    const bot = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * sx;
    return top + (bot - top) * sy;
  };
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * cells;
      const v = (y / size) * cells;
      const cu = Math.floor(u);
      const cv = Math.floor(v);
      let f1 = 9;
      let f2 = 9;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const gx = (((cu + i) % cells) + cells) % cells;
          const gy = (((cv + j) % cells) + cells) % cells;
          const px = cu + i + pts[(gy * cells + gx) * 2];
          const py = cv + j + pts[(gy * cells + gx) * 2 + 1];
          const d = Math.hypot(px - u, py - v);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      }
      // 气泡边缘亮（F2-F1 小处为气泡膜）
      const membrane = 1 - Math.min(1, (f2 - f1) * 3.2);
      let fb = 0;
      let amp = 0.5;
      let fr = lat / 4;
      for (let o = 0; o < 3; o++) {
        fb += amp * value((x / size) * fr, (y / size) * fr, fr);
        fr *= 2;
        amp *= 0.5;
      }
      const val = Math.min(1, Math.max(0, membrane * 0.65 + fb * 0.6 - 0.1));
      const i = (y * size + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = Math.round(val * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

export function createFoamTexture(size = 256) {
  const tex = new THREE.DataTexture(buildFoamData(size), size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
