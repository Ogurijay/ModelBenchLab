export class AirGrid {
  public width: number;
  public height: number;
  public scale: number = 8;
  public aw: number;
  public ah: number;

  public pressure: Float32Array;
  public vx: Float32Array;
  public vy: Float32Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.aw = Math.ceil(width / this.scale);
    this.ah = Math.ceil(height / this.scale);

    const size = this.aw * this.ah;
    this.pressure = new Float32Array(size);
    this.vx = new Float32Array(size);
    this.vy = new Float32Array(size);
  }

  public clear(): void {
    this.pressure.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
  }

  // 获取粗粒度网格索引
  public getIndex(x: number, y: number): number {
    const ax = Math.floor(x / this.scale);
    const ay = Math.floor(y / this.scale);
    if (ax < 0 || ax >= this.aw || ay < 0 || ay >= this.ah) return -1;
    return ay * this.aw + ax;
  }

  // 给某点施加压力（如爆炸、热空气产生压力）
  public addPressure(x: number, y: number, amount: number): void {
    const idx = this.getIndex(x, y);
    if (idx !== -1) {
      this.pressure[idx] += amount;
      // 限制压力上限/下限
      if (this.pressure[idx] > 100) this.pressure[idx] = 100;
      if (this.pressure[idx] < -50) this.pressure[idx] = -50;
    }
  }

  // 获取某点的风速
  public getVelocity(x: number, y: number): { vx: number; vy: number } {
    const idx = this.getIndex(x, y);
    if (idx === -1) return { vx: 0, vy: 0 };
    return { vx: this.vx[idx], vy: this.vy[idx] };
  }

  // 更新空气压力和风向网格
  public update(): void {
    const nextPressure = new Float32Array(this.pressure.length);
    const decay = 0.92;      // 压力衰减率
    const windDecay = 0.85;  // 风速衰减率
    const pressToWind = 0.25; // 压力梯度转化为风速的强度

    // 1. 压力扩散与松弛 (Laplacian Smooth)
    for (let y = 1; y < this.ah - 1; y++) {
      for (let x = 1; x < this.aw - 1; x++) {
        const idx = y * this.aw + x;

        // 四邻域压力
        const pUp = this.pressure[idx - this.aw];
        const pDown = this.pressure[idx + this.aw];
        const pLeft = this.pressure[idx - 1];
        const pRight = this.pressure[idx + 1];

        // 压力扩散
        const avg = (pUp + pDown + pLeft + pRight) / 4;
        nextPressure[idx] = (this.pressure[idx] * 0.4 + avg * 0.6) * decay;
      }
    }
    
    // 拷贝并更新边界
    this.pressure.set(nextPressure);

    // 2. 根据压力梯度计算风速，并让风力发生扩散和衰减
    for (let y = 1; y < this.ah - 1; y++) {
      for (let x = 1; x < this.aw - 1; x++) {
        const idx = y * this.aw + x;

        const pUp = this.pressure[idx - this.aw];
        const pDown = this.pressure[idx + this.aw];
        const pLeft = this.pressure[idx - 1];
        const pRight = this.pressure[idx + 1];

        // 压力梯度：从高压流向低压
        const gradX = pLeft - pRight;
        const gradY = pUp - pDown;

        // 更新风速
        this.vx[idx] = (this.vx[idx] * 0.7 + gradX * pressToWind * 0.3) * windDecay;
        this.vy[idx] = (this.vy[idx] * 0.7 + gradY * pressToWind * 0.3) * windDecay;

        // 热空气上升微弱上浮力
        // 如果该区域压力较低或者我们想要模拟热对流，可以加微弱的负 vy (向上)
      }
    }
  }
}