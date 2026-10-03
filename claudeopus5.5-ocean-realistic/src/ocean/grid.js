// 跟随相机的海面网格：中心等距细格，向外按等比放大一直铺到地平线。
// 每个顶点带 aCell（当地格距），顶点着色器据此选 mip 层级，远处顶点只采样已滤波的低频，避免游动闪烁。

import * as THREE from 'three';

// 求公比 q：s0·q·(q^n − 1)/(q − 1) = distance
export function solveRatio(s0, n, distance) {
  const sum = (q) => (Math.abs(q - 1) < 1e-9 ? s0 * n : (s0 * q * (Math.pow(q, n) - 1)) / (q - 1));
  let lo = 1;
  let hi = 2;
  while (sum(hi) < distance) hi *= 1.5;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    if (sum(mid) < distance) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// 半轴坐标：0..R 共 H+1 个点，前 n1 格等距 s0
export function buildAxis({ H, s0, n1, R }) {
  const coords = new Float64Array(H + 1);
  const q = solveRatio(s0, H - n1, R - n1 * s0);
  for (let i = 1; i <= H; i++) {
    coords[i] = i <= n1 ? i * s0 : coords[i - 1] + s0 * Math.pow(q, i - n1);
  }
  return { coords, q };
}

export function createOceanGrid({ H = 320, s0 = 0.2, n1 = 100, R = 20000 } = {}) {
  const { coords } = buildAxis({ H, s0, n1, R });
  const count = 2 * H + 1;
  const axis = new Float32Array(count);
  const cell = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const j = i - H;
    const a = Math.abs(j);
    axis[i] = Math.sign(j) * coords[a];
    const inner = a > 0 ? coords[a] - coords[a - 1] : coords[1];
    const outer = a < H ? coords[a + 1] - coords[a] : inner;
    cell[i] = Math.max(inner, outer);
  }
  const positions = new Float32Array(count * count * 3);
  const cells = new Float32Array(count * count);
  for (let z = 0; z < count; z++) {
    for (let x = 0; x < count; x++) {
      const v = z * count + x;
      positions[v * 3] = axis[x];
      positions[v * 3 + 1] = 0;
      positions[v * 3 + 2] = axis[z];
      cells[v] = Math.max(cell[x], cell[z]);
    }
  }
  const quads = (count - 1) * (count - 1);
  const index = new Uint32Array(quads * 6);
  let k = 0;
  for (let z = 0; z < count - 1; z++) {
    for (let x = 0; x < count - 1; x++) {
      const a = z * count + x;
      const b = a + 1;
      const c = a + count;
      const d = c + 1;
      // 按象限翻转对角线，保持网格关于中心对称
      if ((x < H) === (z < H)) {
        index[k++] = a; index[k++] = c; index[k++] = d;
        index[k++] = a; index[k++] = d; index[k++] = b;
      } else {
        index[k++] = a; index[k++] = c; index[k++] = b;
        index[k++] = b; index[k++] = c; index[k++] = d;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aCell', new THREE.BufferAttribute(cells, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.5);
  return { geometry: geo, snap: s0 * 2, radius: R };
}
