import * as THREE from 'three';

// 复用临时向量,避免每帧分配
const _windVec = new THREE.Vector3();

/**
 * 纯自写布料物理:Verlet 积分 + 距离约束迭代求解。
 * - 结构约束:横向 + 纵向相邻粒子
 * - 剪切约束:每个网格单元两条对角线
 * - 风力:按面片法线投影 F = n * dot(n, wind - v) * area
 * - L4:超应力撕裂(断约束 + 隐藏面片)、旗杆圆柱碰撞、地面碰撞摩擦
 * 不依赖任何现成物理 / 布料库。
 */
export class Cloth {
  constructor({ width, height, segX, segY, topLeft, material, areaDensity = 0.15 }) {
    this.width = width;
    this.height = height;
    this.topLeft = topLeft.clone();
    this.material = material;
    this.areaDensity = areaDensity; // 面密度 kg/m²
    this.aeroCoeff = 0.85;          // 气动力系数(法线投影模型,兼作气动阻尼)
    this.pinMode = 'edge';
    this.tornCount = 0;
    this.dragIndex = -1;
    this.dragWasPinned = false;
    this.dragTarget = new THREE.Vector3();
    this.mesh = null;
    this.build(segX, segY);
  }

  /** 重建布料(分辨率滑杆调用):重新分配粒子 / 约束 / 几何 */
  build(segX, segY) {
    this.segX = segX;
    this.segY = segY;
    const nx = segX + 1;
    const ny = segY + 1;
    this.nx = nx;
    this.ny = ny;
    const count = nx * ny;
    this.count = count;

    this.pos = new Float32Array(count * 3);   // 当前位置
    this.prev = new Float32Array(count * 3);  // 上一子步位置(Verlet)
    this.accel = new Float32Array(count * 3); // 本子步加速度累加
    this.invMass = new Float32Array(count).fill(1); // 0 = 钉死
    this.rest0 = new Float32Array(count * 3); // 静止网格(钉点目标 / 重置用)
    this.particleMass = (this.areaDensity * this.width * this.height) / count;
    this.aeroScale = this.aeroCoeff / (3 * this.particleMass); // 力→加速度,按 3 顶点均摊

    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = (y * nx + x) * 3;
        this.rest0[i] = this.topLeft.x + (x / segX) * this.width;
        this.rest0[i + 1] = this.topLeft.y - (y / segY) * this.height;
        this.rest0[i + 2] = this.topLeft.z;
      }
    }
    this.pos.set(this.rest0);
    this.prev.set(this.rest0);

    this._buildConstraints();
    this._buildGeometry();

    this.dragIndex = -1;
    this.dragWasPinned = false;
    this.tornCount = 0;
    this.setPinMode(this.pinMode, false);
  }

  /** 结构(横竖)+ 剪切(对角)距离约束;记录每条约束毗邻的网格单元(撕裂时隐藏面片) */
  _buildConstraints() {
    const { nx, ny, segX, segY } = this;
    const ia = [];
    const ib = [];
    const qa = [];
    const qb = [];
    const quadId = (u, v) => (u >= 0 && u < segX && v >= 0 && v < segY ? v * segX + u : -1);
    const idx = (x, y) => y * nx + x;

    // 结构约束:横向
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < segX; x++) {
        ia.push(idx(x, y));
        ib.push(idx(x + 1, y));
        qa.push(quadId(x, y - 1));
        qb.push(quadId(x, y));
      }
    }
    // 结构约束:纵向
    for (let y = 0; y < segY; y++) {
      for (let x = 0; x < nx; x++) {
        ia.push(idx(x, y));
        ib.push(idx(x, y + 1));
        qa.push(quadId(x - 1, y));
        qb.push(quadId(x, y));
      }
    }
    this.structuralCount = ia.length;
    // 剪切约束:每格两条对角线
    for (let y = 0; y < segY; y++) {
      for (let x = 0; x < segX; x++) {
        ia.push(idx(x, y));
        ib.push(idx(x + 1, y + 1));
        qa.push(quadId(x, y));
        qb.push(-1);
        ia.push(idx(x + 1, y));
        ib.push(idx(x, y + 1));
        qa.push(quadId(x, y));
        qb.push(-1);
      }
    }

    const m = ia.length;
    this.conCount = m;
    this.conA = Int32Array.from(ia);
    this.conB = Int32Array.from(ib);
    this.conQuadA = Int32Array.from(qa);
    this.conQuadB = Int32Array.from(qb);
    this.conRest = new Float32Array(m);
    this.conAlive = new Uint8Array(m).fill(1);
    for (let c = 0; c < m; c++) {
      const a = this.conA[c] * 3;
      const b = this.conB[c] * 3;
      const dx = this.rest0[a] - this.rest0[b];
      const dy = this.rest0[a + 1] - this.rest0[b + 1];
      const dz = this.rest0[a + 2] - this.rest0[b + 2];
      this.conRest[c] = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    this.quadHidden = new Uint8Array(segX * segY);
  }

  /** 手写 BufferGeometry:position 直接引用物理数组,零拷贝回写 */
  _buildGeometry() {
    const { nx, ny, segX, segY } = this;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);

    const uv = new Float32Array(this.count * 2);
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = (y * nx + x) * 2;
        uv[i] = x / segX;
        uv[i + 1] = 1 - y / segY;
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    const index = new Uint32Array(segX * segY * 6);
    let o = 0;
    for (let v = 0; v < segY; v++) {
      for (let u = 0; u < segX; u++) {
        const a = v * nx + u;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        index[o++] = a; index[o++] = c; index[o++] = b;
        index[o++] = b; index[o++] = c; index[o++] = d;
      }
    }
    this.index0 = index.slice(); // 原始索引备份(重置撕裂用)
    this.indexAttr = new THREE.BufferAttribute(index, 1);
    this.indexAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setIndex(this.indexAttr);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    geo.boundingSphere.radius *= 2.5; // 布料运动膨胀余量,保证 raycast 不被剔除

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
    } else {
      this.mesh = new THREE.Mesh(geo, this.material);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = false;
      this.mesh.frustumCulled = false;
    }
    this.geometry = geo;
  }

  /** 固定点模式:'edge' 左边整列钉在旗杆上;'corners' 仅上边两角(晾布) */
  setPinMode(mode, reset = true) {
    this.pinMode = mode;
    this.pinList = [];
    this.invMass.fill(1);
    const { nx, ny } = this;
    if (mode === 'edge') {
      for (let y = 0; y < ny; y++) this.pinList.push(y * nx);
    } else {
      this.pinList.push(0);        // 左上角(旗杆侧)
      this.pinList.push(nx - 1);   // 右上角(晾布绳远端)
    }
    for (const p of this.pinList) this.invMass[p] = 0;
    if (reset) this.resetCloth();
    else this._applyPins();
  }

  /** 重置:回到静止网格、恢复全部撕裂 */
  resetCloth() {
    this.endDrag();
    this.pos.set(this.rest0);
    this.prev.set(this.rest0);
    this.conAlive.fill(1);
    this.quadHidden.fill(0);
    this.indexAttr.array.set(this.index0);
    this.indexAttr.needsUpdate = true;
    this.tornCount = 0;
    this.updateGeometry();
  }

  // ---------------- 拖拽 ----------------

  startDrag(index) {
    this.dragIndex = index;
    this.dragWasPinned = this.invMass[index] === 0;
    this.invMass[index] = 0;
    const i = index * 3;
    this.dragTarget.set(this.pos[i], this.pos[i + 1], this.pos[i + 2]);
  }

  setDragTarget(v) {
    this.dragTarget.copy(v);
  }

  endDrag() {
    if (this.dragIndex < 0) return;
    if (!this.dragWasPinned) {
      this.invMass[this.dragIndex] = 1;
      const i = this.dragIndex * 3;
      // 清零瞬时速度,松手后自然下摆恢复
      this.prev[i] = this.pos[i];
      this.prev[i + 1] = this.pos[i + 1];
      this.prev[i + 2] = this.pos[i + 2];
    }
    this.dragIndex = -1;
    this.dragWasPinned = false;
  }

  // ---------------- 物理主步(固定 dt 子步) ----------------

  /**
   * @param {number} dt 固定子步长(1/120)
   * @param {object} env { gravity, damping, iterations, wind, tearEnabled, tearThreshold,
   *                       poleRadius, poleTopY, poleX, poleZ, groundY }
   */
  step(dt, env) {
    this._accumulateForces(dt, env);
    this._integrate(dt, env.damping);
    const iters = Math.max(1, env.iterations | 0);
    for (let k = 0; k < iters; k++) {
      this._solveConstraints(env);
      this._applyPins();
    }
    this._collide(env);
    this._applyPins();
  }

  /** 重力 + 面片法线投影风力(含空气阻尼:风速为 0 时即为 -v 气动阻力) */
  _accumulateForces(dt, env) {
    const acc = this.accel;
    acc.fill(0);
    const g = env.gravity;
    for (let p = 0; p < this.count; p++) acc[p * 3 + 1] = -g;

    const wind = env.wind;
    if (!wind) return;
    const pos = this.pos;
    const prev = this.prev;
    const idxArr = this.indexAttr.array;
    const invDt = 1 / dt;
    const kScale = this.aeroScale;

    for (let f = 0; f < idxArr.length; f += 3) {
      const a = idxArr[f];
      const b = idxArr[f + 1];
      const c = idxArr[f + 2];
      if (a === b) continue; // 撕裂后被隐藏的退化面,不受风
      const a3 = a * 3;
      const b3 = b * 3;
      const c3 = c * 3;
      // 面法线(未归一化,模长 = 2×面积)
      const e1x = pos[b3] - pos[a3];
      const e1y = pos[b3 + 1] - pos[a3 + 1];
      const e1z = pos[b3 + 2] - pos[a3 + 2];
      const e2x = pos[c3] - pos[a3];
      const e2y = pos[c3 + 1] - pos[a3 + 1];
      const e2z = pos[c3 + 2] - pos[a3 + 2];
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-9) continue;
      const area = len * 0.5;
      const inv = 1 / len;
      nx *= inv; ny *= inv; nz *= inv;
      // 面片平均速度
      const vx = ((pos[a3] - prev[a3]) + (pos[b3] - prev[b3]) + (pos[c3] - prev[c3])) * invDt / 3;
      const vy = ((pos[a3 + 1] - prev[a3 + 1]) + (pos[b3 + 1] - prev[b3 + 1]) + (pos[c3 + 1] - prev[c3 + 1])) * invDt / 3;
      const vz = ((pos[a3 + 2] - prev[a3 + 2]) + (pos[b3 + 2] - prev[b3 + 2]) + (pos[c3 + 2] - prev[c3 + 2])) * invDt / 3;
      // 面片质心处采样风(空间非均匀)
      const cx = (pos[a3] + pos[b3] + pos[c3]) / 3;
      const cy = (pos[a3 + 1] + pos[b3 + 1] + pos[c3 + 1]) / 3;
      const cz = (pos[a3 + 2] + pos[b3 + 2] + pos[c3 + 2]) / 3;
      wind.sampleAt(cx, cy, cz, _windVec);
      // F = n * dot(n, wind - v) * area,法线投影 → 迎风面受力大、顺风面受力小
      const rx = _windVec.x - vx;
      const ry = _windVec.y - vy;
      const rz = _windVec.z - vz;
      const dot = nx * rx + ny * ry + nz * rz;
      const s = dot * area * kScale;
      const fx = nx * s;
      const fy = ny * s;
      const fz = nz * s;
      acc[a3] += fx; acc[a3 + 1] += fy; acc[a3 + 2] += fz;
      acc[b3] += fx; acc[b3 + 1] += fy; acc[b3 + 2] += fz;
      acc[c3] += fx; acc[c3 + 1] += fy; acc[c3 + 2] += fz;
    }
  }

  /** Verlet 积分:pos' = pos + (pos - prev) * (1 - damping) + a·dt² */
  _integrate(dt, damping) {
    const pos = this.pos;
    const prev = this.prev;
    const acc = this.accel;
    const invM = this.invMass;
    const d = 1 - damping;
    const dt2 = dt * dt;
    for (let p = 0; p < this.count; p++) {
      const i = p * 3;
      if (invM[p] === 0) {
        prev[i] = pos[i];
        prev[i + 1] = pos[i + 1];
        prev[i + 2] = pos[i + 2];
        continue;
      }
      const x = pos[i];
      const y = pos[i + 1];
      const z = pos[i + 2];
      pos[i] = x + (x - prev[i]) * d + acc[i] * dt2;
      pos[i + 1] = y + (y - prev[i + 1]) * d + acc[i + 1] * dt2;
      pos[i + 2] = z + (z - prev[i + 2]) * d + acc[i + 2] * dt2;
      prev[i] = x;
      prev[i + 1] = y;
      prev[i + 2] = z;
    }
  }

  /** 距离约束投影(Gauss-Seidel);迭代次数越多布料越"硬" */
  _solveConstraints(env) {
    const pos = this.pos;
    const invM = this.invMass;
    const A = this.conA;
    const B = this.conB;
    const R = this.conRest;
    const alive = this.conAlive;
    const tear = env.tearEnabled;
    const tearTh = env.tearThreshold;
    for (let c = 0; c < this.conCount; c++) {
      if (!alive[c]) continue;
      const pa = A[c];
      const pb = B[c];
      const wa = invM[pa];
      const wb = invM[pb];
      const w = wa + wb;
      if (w === 0) continue;
      const a = pa * 3;
      const b = pb * 3;
      const dx = pos[b] - pos[a];
      const dy = pos[b + 1] - pos[a + 1];
      const dz = pos[b + 2] - pos[a + 2];
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < 1e-12) continue;
      const dist = Math.sqrt(distSq);
      const rest = R[c];
      if (tear && dist > rest * tearTh) {
        this._tearConstraint(c);
        continue;
      }
      const diff = (dist - rest) / dist / w;
      const ox = dx * diff;
      const oy = dy * diff;
      const oz = dz * diff;
      pos[a] += ox * wa;
      pos[a + 1] += oy * wa;
      pos[a + 2] += oz * wa;
      pos[b] -= ox * wb;
      pos[b + 1] -= oy * wb;
      pos[b + 2] -= oz * wb;
    }
  }

  /** L4 撕裂:断开约束并隐藏毗邻面片(索引置退化) */
  _tearConstraint(c) {
    this.conAlive[c] = 0;
    this.tornCount++;
    this._hideQuad(this.conQuadA[c]);
    this._hideQuad(this.conQuadB[c]);
  }

  _hideQuad(q) {
    if (q < 0 || this.quadHidden[q]) return;
    this.quadHidden[q] = 1;
    const arr = this.indexAttr.array;
    const o = q * 6;
    for (let k = 0; k < 6; k++) arr[o + k] = 0;
    this.indexAttr.needsUpdate = true;
  }

  /** 碰撞:地面(带摩擦) + 旗杆竖直圆柱(推出) */
  _collide(env) {
    const pos = this.pos;
    const prev = this.prev;
    const invM = this.invMass;
    const pr = env.poleRadius;
    const prSq = pr * pr;
    const poleTop = env.poleTopY;
    const px0 = env.poleX;
    const pz0 = env.poleZ;
    const groundY = env.groundY + 0.02;
    for (let p = 0; p < this.count; p++) {
      if (invM[p] === 0) continue;
      const i = p * 3;
      // 地面
      if (pos[i + 1] < groundY) {
        pos[i + 1] = groundY;
        // 摩擦:抑制水平滑动
        prev[i] += (pos[i] - prev[i]) * 0.6;
        prev[i + 2] += (pos[i + 2] - prev[i + 2]) * 0.6;
      }
      // 旗杆
      if (pos[i + 1] < poleTop) {
        const dx = pos[i] - px0;
        const dz = pos[i + 2] - pz0;
        const d2 = dx * dx + dz * dz;
        if (d2 < prSq && d2 > 1e-10) {
          const s = pr / Math.sqrt(d2);
          pos[i] = px0 + dx * s;
          pos[i + 2] = pz0 + dz * s;
        }
      }
    }
  }

  /** 钉点强制归位(模式钉点 → 静止网格;拖拽钉点 → 指针目标) */
  _applyPins() {
    const pos = this.pos;
    const prev = this.prev;
    const rest = this.rest0;
    for (const p of this.pinList) {
      const i = p * 3;
      pos[i] = rest[i];
      pos[i + 1] = rest[i + 1];
      pos[i + 2] = rest[i + 2];
      prev[i] = rest[i];
      prev[i + 1] = rest[i + 1];
      prev[i + 2] = rest[i + 2];
    }
    if (this.dragIndex >= 0) {
      const i = this.dragIndex * 3;
      const t = this.dragTarget;
      pos[i] = t.x; pos[i + 1] = t.y; pos[i + 2] = t.z;
      prev[i] = t.x; prev[i + 1] = t.y; prev[i + 2] = t.z;
    }
  }

  // ---------------- 渲染回写 / 查询 ----------------

  /** 每帧:position 回写 GPU + 法线实时重算 */
  updateGeometry() {
    this.posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /** 距离某世界坐标最近的粒子(拖拽抓取用) */
  nearestParticle(point) {
    let best = -1;
    let bestD = Infinity;
    const pos = this.pos;
    for (let p = 0; p < this.count; p++) {
      const i = p * 3;
      const dx = pos[i] - point.x;
      const dy = pos[i + 1] - point.y;
      const dz = pos[i + 2] - point.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** 自由粒子平均速度(m/s),供 __bench.getState 观测运动 */
  averageSpeed(dt) {
    let s = 0;
    let n = 0;
    const pos = this.pos;
    const prev = this.prev;
    const invM = this.invMass;
    for (let p = 0; p < this.count; p++) {
      if (invM[p] === 0) continue;
      const i = p * 3;
      const dx = pos[i] - prev[i];
      const dy = pos[i + 1] - prev[i + 1];
      const dz = pos[i + 2] - prev[i + 2];
      s += Math.sqrt(dx * dx + dy * dy + dz * dz);
      n++;
    }
    return n ? s / n / dt : 0;
  }

  /** 归一化 uv 处的粒子世界坐标,u 向右 v 向下 */
  samplePoint(u, v) {
    const x = Math.round(u * this.segX);
    const y = Math.round(v * this.segY);
    const i = (y * this.nx + x) * 3;
    return [
      +this.pos[i].toFixed(4),
      +this.pos[i + 1].toFixed(4),
      +this.pos[i + 2].toFixed(4),
    ];
  }
}
