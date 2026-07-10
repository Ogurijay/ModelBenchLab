import * as THREE from 'three';

/**
 * 风场:基础风向/风速滑杆 + 阵风包络(多层正弦叠加) + 空间非均匀扰动。
 * sampleAt(x,y,z,out) 返回该点的风速向量(m/s),供布料按法线投影受力。
 */
export class WindField {
  constructor(params) {
    this.params = params;              // 直接引用 UI 参数对象,滑杆实时生效
    this.time = Math.random() * 100;   // 随机初相,每次刷新气流不同
    this._dir = new THREE.Vector3(1, 0, 0);
    this._base = new THREE.Vector3();  // 当前有效风向量(含阵风包络)
    this._g = 0;
    this.strength = 0;                 // 当前有效风速(含阵风包络)
  }

  /** 每个物理子步推进一次(固定 dt,保证 stepFrame 可复现) */
  update(dt) {
    this.time += dt;
    const p = this.params;
    const t = this.time;
    const g = p.gust;
    // 阵风包络:三层不同频率正弦叠加 → 非均匀、无明显周期感
    const env =
      1 +
      g *
        (0.45 * Math.sin(t * 1.23) +
          0.3 * Math.sin(t * 2.71 + 1.7) +
          0.25 * Math.sin(t * 5.9 + 4.1));
    // 风向随阵风轻微摆动
    const wobble = g * 0.22 * (Math.sin(t * 0.9 + 2.1) + 0.5 * Math.sin(t * 2.3));
    const ang = (p.windDirection * Math.PI) / 180 + wobble;
    this.strength = Math.max(0, p.windStrength * env);
    this._dir.set(Math.cos(ang), 0, Math.sin(ang));
    this._base.copy(this._dir).multiplyScalar(this.strength);
    this._g = g;
  }

  /** 采样某一点的瞬时风向量(带空间相位 → 旗面各处受风不同) */
  sampleAt(x, y, z, out) {
    const t = this.time;
    const g = this._g;
    const s = 1 + g * 0.35 * Math.sin(t * 3.1 + x * 1.4 + y * 0.9);
    out.copy(this._base).multiplyScalar(s);
    out.y += this.strength * g * 0.25 * Math.sin(t * 2.2 + x * 1.1 + z * 0.8);
    return out;
  }

  /** 当前有效风向量(供飘尘等环境元素使用) */
  get vector() {
    return this._base;
  }
}
