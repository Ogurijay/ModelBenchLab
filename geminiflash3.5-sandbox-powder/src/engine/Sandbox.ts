import { ElementId } from './Types';
import { getElementDef } from './Elements';
import { AirGrid } from './Air';

export class Sandbox {
  public width: number;
  public height: number;
  
  // 粒子网格数据 (扁平化 TypedArrays，获得最佳的运行性能)
  public gridType: Uint8Array;
  public gridTemp: Float32Array;
  public gridLife: Uint8Array;
  public gridSpark: Uint8Array; // > 4 代表带电中，1-4 代表冷却中，0 代表无电
  
  public air: AirGrid;
  
  // 物理配置
  public gravityX: number = 0;
  public gravityY: number = 1; // 默认向下重力
  public paused: boolean = false;
  
  // 统计与帧ID
  public frameId: number = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const size = width * height;
    
    this.gridType = new Uint8Array(size);
    this.gridTemp = new Float32Array(size);
    this.gridLife = new Uint8Array(size);
    this.gridSpark = new Uint8Array(size);
    
    this.air = new AirGrid(width, height);
  }

  public clear(): void {
    this.gridType.fill(ElementId.NONE);
    this.gridTemp.fill(20.0); // 默认室温
    this.gridLife.fill(0);
    this.gridSpark.fill(0);
    this.air.clear();
  }

  // 坐标边界检查
  public inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  // 设置粒子
  public setParticle(x: number, y: number, id: ElementId, temp?: number): void {
    if (!this.inBounds(x, y)) return;
    const idx = y * this.width + x;
    const def = getElementDef(id);
    
    this.gridType[idx] = id;
    this.gridTemp[idx] = temp !== undefined ? temp : def.defaultTemp;
    this.gridLife[idx] = id === ElementId.FIRE ? Math.floor(20 + Math.random() * 20) : (id === ElementId.SMOKE ? Math.floor(40 + Math.random() * 40) : 0);
    this.gridSpark[idx] = 0;
  }

  // 交换两个格子的粒子数据
  public swap(idx1: number, idx2: number): void {
    const t1 = this.gridType[idx1];
    const temp1 = this.gridTemp[idx1];
    const l1 = this.gridLife[idx1];
    const s1 = this.gridSpark[idx1];

    this.gridType[idx1] = this.gridType[idx2];
    this.gridTemp[idx1] = this.gridTemp[idx2];
    this.gridLife[idx1] = this.gridLife[idx2];
    this.gridSpark[idx1] = this.gridSpark[idx2];

    this.gridType[idx2] = t1;
    this.gridTemp[idx2] = temp1;
    this.gridLife[idx2] = l1;
    this.gridSpark[idx2] = s1;
  }

  // 物理步进
  public tick(): void {
    if (this.paused) return;
    
    this.frameId++;
    
    // 1. 更新空气风速和气压
    this.air.update();
    
    // 2. 热传导
    this.updateThermal();
    
    // 3. 电子元器件传电
    this.updateElectronics();

    // 4. 粒子行为与运动更新
    this.updateParticles();
  }

  // 1. 热传导模拟 (Laplacian Thermal Diffusion)
  private updateThermal(): void {
    const nextTemp = new Float32Array(this.gridTemp);
    const size = this.width * this.height;
    
    // 仅在粒子间进行热传导，墙不传热
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const idx = y * this.width + x;
        const type = this.gridType[idx];
        if (type === ElementId.WALL) continue; // 墙不参与热传导
        
        const def = getElementDef(type);
        const k = def.thermalConductivity;
        if (k === 0) continue;

        const neighbors = [idx - this.width, idx + this.width, idx - 1, idx + 1];
        
        for (const nIdx of neighbors) {
          const nType = this.gridType[nIdx];
          if (nType !== ElementId.WALL) {
            const nDef = getElementDef(nType);
            // 混合传热系数
            const mixK = (k + nDef.thermalConductivity) / 2;
            nextTemp[idx] += (this.gridTemp[nIdx] - this.gridTemp[idx]) * mixK * 0.25;
          }
        }
      }
    }
    
    // 拷贝回去，并处理温度触发的“相变”
    for (let i = 0; i < size; i++) {
      const type = this.gridType[i];
      if (type === ElementId.NONE || type === ElementId.WALL) {
        this.gridTemp[i] = nextTemp[i];
        continue;
      }
      
      this.gridTemp[i] = nextTemp[i];
      const t = this.gridTemp[i];
      const def = getElementDef(type);
      
      // 相变相干逻辑
      if (def.meltTemp !== undefined && t >= def.meltTemp && def.meltTo !== undefined) {
        this.gridType[i] = def.meltTo;
        // 如果是汽化产生气压
        if (def.meltTo === ElementId.STEAM) {
          const x = i % this.width;
          const y = Math.floor(i / this.width);
          this.air.addPressure(x, y, 2.0);
        }
      } else if (def.freezeTemp !== undefined && t <= def.freezeTemp && def.freezeTo !== undefined) {
        this.gridType[i] = def.freezeTo;
      }
    }
  }

  // 2. 电子火花传导逻辑
  private updateElectronics(): void {
    const size = this.width * this.height;
    
    // 每一帧电火花生命周期递减
    for (let i = 0; i < size; i++) {
      if (this.gridSpark[i] > 0) {
        this.gridSpark[i]--;
      }
    }

    // 导电传导，寻找触发的电火花
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        const idx = y * this.width + x;
        const type = this.gridType[idx];
        
        // 只有导体能够传电
        if (type === ElementId.COPPER || type === ElementId.SILICON || type === ElementId.COND_WALL) {
          // 如果该点刚刚带电 (刚好处于开始传电的阶段，设为 6)
          if (this.gridSpark[idx] === 5) {
            const neighbors = [idx - this.width, idx + this.width, idx - 1, idx + 1];
            for (const nIdx of neighbors) {
              const nType = this.gridType[nIdx];
              // 只能传给没有电且不处于冷却状态下的导体
              if (
                (nType === ElementId.COPPER || nType === ElementId.SILICON || nType === ElementId.COND_WALL) &&
                this.gridSpark[nIdx] === 0
              ) {
                // 硅是半导体：只能从低温区导电到高温区，或者单向导电
                if (nType === ElementId.SILICON) {
                  // 如果硅的温度低于当前位置，则阻断电信号，只允许流向更高温区
                  if (this.gridTemp[nIdx] < this.gridTemp[idx] - 2) {
                    continue;
                  }
                }
                // 触发带电，倒计时设为 8（8-6为带电传导，5-1为冷却禁止接收）
                this.gridSpark[nIdx] = 8;
              }
              // 电火花能引爆周围的可燃物/炸药
              this.tryIgnite(nIdx);
            }
          }
        }
      }
    }
  }

  // 尝试引燃或引爆某点粒子
  private tryIgnite(idx: number): void {
    const type = this.gridType[idx];
    if (type === ElementId.GUNPOWDER) {
      // 火药爆炸
      this.gridType[idx] = ElementId.FIRE;
      this.gridLife[idx] = Math.floor(15 + Math.random() * 15);
      this.gridTemp[idx] = 900;
      const x = idx % this.width;
      const y = Math.floor(idx / this.width);
      this.air.addPressure(x, y, 12);
    } else if (type === ElementId.C4) {
      // C4 剧烈爆炸
      this.gridType[idx] = ElementId.FIRE;
      this.gridLife[idx] = Math.floor(25 + Math.random() * 20);
      this.gridTemp[idx] = 1600;
      const x = idx % this.width;
      const y = Math.floor(idx / this.width);
      this.air.addPressure(x, y, 40);
      // 链式引爆周围的 C4
      this.explodeC4Nearby(x, y);
    }
  }

  // C4 链式爆破
  private explodeC4Nearby(cx: number, cy: number): void {
    const radius = 5;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (this.inBounds(nx, ny)) {
          const nIdx = ny * this.width + nx;
          if (this.gridType[nIdx] === ElementId.C4) {
            this.gridType[nIdx] = ElementId.FIRE;
            this.gridLife[nIdx] = Math.floor(20 + Math.random() * 15);
            this.gridTemp[nIdx] = 1500;
            this.air.addPressure(nx, ny, 30);
          }
        }
      }
    }
  }

  // 3. 粒子运动与反应更新
  private updateParticles(): void {
    // 每一帧随机左右更新顺序，防止重力偏向某一边
    const leftToRight = Math.random() > 0.5;
    
    // 如果重力向下 (gravityY > 0)
    // 更新粒子时，我们从底向上更新以避免同一个粒子在同一帧下落多次
    const startY = this.height - 1;
    const endY = 0;
    const stepY = -1;

    for (let y = startY; y !== endY + stepY; y += stepY) {
      const startX = leftToRight ? 0 : this.width - 1;
      const endX = leftToRight ? this.width - 1 : 0;
      const stepX = leftToRight ? 1 : -1;

      for (let x = startX; x !== endX + stepX; x += stepX) {
        const idx = y * this.width + x;
        const type = this.gridType[idx];

        if (type === ElementId.NONE || type === ElementId.WALL || type === ElementId.COND_WALL) {
          continue;
        }

        const def = getElementDef(type);

        // A. 特殊气流/风力推移（作用于气体和轻粉末如火药）
        if (def.category === 'gas' || type === ElementId.GUNPOWDER) {
          const vel = this.air.getVelocity(x, y);
          // 水平风推移
          if (Math.abs(vel.vx) > 0.1 && Math.random() < Math.abs(vel.vx) * 0.4) {
            const nx = x + Math.sign(vel.vx);
            if (this.inBounds(nx, y) && this.gridType[y * this.width + nx] === ElementId.NONE) {
              this.swap(idx, y * this.width + nx);
              continue; // 移走后停止本步其它更新
            }
          }
          // 垂直风推移
          if (Math.abs(vel.vy) > 0.1 && Math.random() < Math.abs(vel.vy) * 0.4) {
            const ny = y + Math.sign(vel.vy);
            if (this.inBounds(x, ny) && this.gridType[ny * this.width + x] === ElementId.NONE) {
              this.swap(idx, ny * this.width + x);
              continue;
            }
          }
        }

        // B. 特殊粒子行为化学反应
        if (type === ElementId.FIRE) {
          // 火焰吞噬与寿命
          this.gridLife[idx]--;
          if (this.gridLife[idx] <= 0) {
            // 熄灭后有概率变成烟
            this.gridType[idx] = Math.random() < 0.2 ? ElementId.SMOKE : ElementId.NONE;
            if (this.gridType[idx] === ElementId.SMOKE) {
              this.gridLife[idx] = Math.floor(40 + Math.random() * 40);
              this.gridTemp[idx] = 120;
            }
            continue;
          }
          
          // 火向四周点燃易燃物
          const neighbors = [idx - this.width, idx + this.width, idx - 1, idx + 1];
          for (const nIdx of neighbors) {
            const nType = this.gridType[nIdx];
            if (nType !== ElementId.NONE) {
              const nDef = getElementDef(nType);
              if (nDef.flammable > 0 && Math.random() < nDef.flammable) {
                this.gridType[nIdx] = ElementId.FIRE;
                this.gridLife[nIdx] = Math.floor(30 + Math.random() * 30);
                this.gridTemp[nIdx] = Math.max(this.gridTemp[nIdx], 600);
              }
              // 火遇水熄灭
              if (nType === ElementId.WATER) {
                this.gridType[idx] = ElementId.STEAM;
                this.gridType[nIdx] = ElementId.STEAM;
                this.gridTemp[idx] = 100;
                this.gridTemp[nIdx] = 100;
                break;
              }
            }
          }
        }

        else if (type === ElementId.SMOKE) {
          this.gridLife[idx]--;
          if (this.gridLife[idx] <= 0) {
            this.gridType[idx] = ElementId.NONE;
            continue;
          }
        }

        else if (type === ElementId.ACID) {
          // 酸的强腐蚀性：向四周侵蚀
          const neighbors = [idx - this.width, idx + this.width, idx - 1, idx + 1];
          let dissolved = false;
          for (const nIdx of neighbors) {
            const nType = this.gridType[nIdx];
            if (nType !== ElementId.NONE && nType !== ElementId.WALL && nType !== ElementId.ACID) {
              if (Math.random() < 0.25) {
                this.gridType[nIdx] = ElementId.NONE;
                dissolved = true;
              }
            }
          }
          if (dissolved && Math.random() < 0.3) {
            this.gridType[idx] = ElementId.NONE; // 自身也消耗掉
            continue;
          }
        }

        else if (type === ElementId.LAVA) {
          // 熔岩超高温，接触水变石头
          const neighbors = [idx - this.width, idx + this.width, idx - 1, idx + 1];
          for (const nIdx of neighbors) {
            const nType = this.gridType[nIdx];
            if (nType === ElementId.WATER) {
              this.gridType[idx] = ElementId.STONE;
              this.gridType[nIdx] = ElementId.STEAM;
              this.gridTemp[idx] = 200;
              this.gridTemp[nIdx] = 100;
              break;
            }
          }
        }

        else if (type === ElementId.PLUTONIUM) {
          // 钚：链式裂变
          const press = this.air.pressure[this.air.getIndex(x, y)];
          if ((press > 8 || this.gridTemp[idx] > 400) && Math.random() < 0.1) {
            this.gridType[idx] = ElementId.FIRE;
            this.gridLife[idx] = Math.floor(40 + Math.random() * 30);
            this.gridTemp[idx] = 4000;
            this.air.addPressure(x, y, 60);
            
            const radius = 6;
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (this.inBounds(nx, ny)) {
                  const nIdx = ny * this.width + nx;
                  if (this.gridType[nIdx] === ElementId.PLUTONIUM && Math.random() < 0.4) {
                    this.gridType[nIdx] = ElementId.FIRE;
                    this.gridTemp[nIdx] = 4000;
                    this.gridLife[nIdx] = Math.floor(35 + Math.random() * 20);
                    this.air.addPressure(nx, ny, 45);
                  }
                }
              }
            }
          }
        }

        // C. 粒子重力学运动规则
        if (def.category === 'solid' && def.density > 0) {
          // 粉末状固体下落
          const below = idx + this.width;
          const leftBelow = below - 1;
          const rightBelow = below + 1;

          if (y < this.height - 1) {
            const typeBelow = this.gridType[below];
            const defBelow = getElementDef(typeBelow);

            if (typeBelow === ElementId.NONE || (defBelow.density > 0 && defBelow.density < def.density)) {
              this.swap(idx, below);
            } 
            else {
              const leftFree = x > 0 && (this.gridType[leftBelow] === ElementId.NONE || (getElementDef(this.gridType[leftBelow]).density > 0 && getElementDef(this.gridType[leftBelow]).density < def.density));
              const rightFree = x < this.width - 1 && (this.gridType[rightBelow] === ElementId.NONE || (getElementDef(this.gridType[rightBelow]).density > 0 && getElementDef(this.gridType[rightBelow]).density < def.density));
              
              if (leftFree && rightFree) {
                this.swap(idx, Math.random() > 0.5 ? leftBelow : rightBelow);
              } else if (leftFree) {
                this.swap(idx, leftBelow);
              } else if (rightFree) {
                this.swap(idx, rightBelow);
              }
            }
          }
        } 
        
        else if (def.category === 'liquid') {
          // 液体下落并流向两侧
          const below = idx + this.width;
          const leftBelow = below - 1;
          const rightBelow = below + 1;
          const left = idx - 1;
          const right = idx + 1;

          if (y < this.height - 1) {
            const typeBelow = this.gridType[below];
            const defBelow = getElementDef(typeBelow);

            if (typeBelow === ElementId.NONE || (defBelow.category === 'liquid' && defBelow.density < def.density)) {
              this.swap(idx, below);
              continue;
            }

            const leftBelowFree = x > 0 && (this.gridType[leftBelow] === ElementId.NONE || (getElementDef(this.gridType[leftBelow]).category === 'liquid' && getElementDef(this.gridType[leftBelow]).density < def.density));
            const rightBelowFree = x < this.width - 1 && (this.gridType[rightBelow] === ElementId.NONE || (getElementDef(this.gridType[rightBelow]).category === 'liquid' && getElementDef(this.gridType[rightBelow]).density < def.density));

            if (leftBelowFree && rightBelowFree) {
              this.swap(idx, Math.random() > 0.5 ? leftBelow : rightBelow);
              continue;
            } else if (leftBelowFree) {
              this.swap(idx, leftBelow);
              continue;
            } else if (rightBelowFree) {
              this.swap(idx, rightBelow);
              continue;
            }
          }

          const leftFree = x > 0 && (this.gridType[left] === ElementId.NONE || (getElementDef(this.gridType[left]).category === 'liquid' && getElementDef(this.gridType[left]).density < def.density));
          const rightFree = x < this.width - 1 && (this.gridType[right] === ElementId.NONE || (getElementDef(this.gridType[right]).category === 'liquid' && getElementDef(this.gridType[right]).density < def.density));

          if (leftFree && rightFree) {
            this.swap(idx, Math.random() > 0.5 ? left : right);
          } else if (leftFree) {
            this.swap(idx, left);
          } else if (rightFree) {
            this.swap(idx, right);
          }
        } 
        
        else if (def.category === 'gas') {
          // 气体向上漂浮并四周扩散
          const above = idx - this.width;
          const leftAbove = above - 1;
          const rightAbove = above + 1;
          const left = idx - 1;
          const right = idx + 1;

          if (y > 0) {
            const typeAbove = this.gridType[above];
            if (typeAbove === ElementId.NONE) {
              this.swap(idx, above);
              continue;
            }

            const leftAboveFree = x > 0 && this.gridType[leftAbove] === ElementId.NONE;
            const rightAboveFree = x < this.width - 1 && this.gridType[rightAbove] === ElementId.NONE;

            if (leftAboveFree && rightAboveFree) {
              this.swap(idx, Math.random() > 0.5 ? leftAbove : rightAbove);
              continue;
            } else if (leftAboveFree) {
              this.swap(idx, leftAbove);
              continue;
            } else if (rightAboveFree) {
              this.swap(idx, rightAbove);
              continue;
            }
          }

          const leftFree = x > 0 && this.gridType[left] === ElementId.NONE;
          const rightFree = x < this.width - 1 && this.gridType[right] === ElementId.NONE;

          if (leftFree && rightFree) {
            this.swap(idx, Math.random() > 0.5 ? left : right);
          } else if (leftFree) {
            this.swap(idx, left);
          } else if (rightFree) {
            this.swap(idx, right);
          }
        }
      }
    }
  }
}