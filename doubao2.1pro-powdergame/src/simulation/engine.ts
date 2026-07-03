import { GRID_WIDTH, GRID_HEIGHT, ROOM_TEMP, GRAVITY, FLAGS, ElementState } from './constants';
import { elements } from './elements';
import { ParticleGrid } from './grid';

const rand = (n: number) => Math.floor(Math.random() * n);
const randDir = () => (Math.random() < 0.5 ? -1 : 1);

export class SimulationEngine {
  grid: ParticleGrid;
  gravity: { x: number; y: number };
  paused: boolean;
  speed: number;
  frame: number;
  pressure: Float32Array;
  pvx: Float32Array;
  pvy: Float32Array;
  elementMap: Map<number, typeof elements[keyof typeof elements]>;
  onUpdate?: () => void;

  constructor() {
    this.grid = new ParticleGrid();
    this.gravity = { x: 0, y: 1 };
    this.paused = false;
    this.speed = 1;
    this.frame = 0;
    this.pressure = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
    this.pvx = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
    this.pvy = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
    this.elementMap = new Map();
    Object.values(elements).forEach(el => this.elementMap.set(el.id, el));
  }

  clear() {
    this.grid.clear();
    this.pressure.fill(0);
    this.pvx.fill(0);
    this.pvy.fill(0);
    this.frame = 0;
  }

  setGravity(x: number, y: number) {
    this.gravity = { x, y };
  }

  update() {
    if (this.paused) return;
    
    for (let s = 0; s < this.speed; s++) {
      this.frame++;
      this.grid.moved.fill(0);
      
      this.updatePressure();
      this.updateHeat();
      this.updateParticles();
      this.updateReactions();
    }
  }

  private idx(x: number, y: number) {
    return y * GRID_WIDTH + x;
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
  }

  private isEmpty(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.grid.pmap[this.idx(x, y)] === 0;
  }

  private getEl(type: number) {
    return this.elementMap.get(type);
  }

  private canMove(to: number, from: number): boolean {
    const toEl = this.getEl(to);
    const fromEl = this.getEl(from);
    if (!toEl || !fromEl) return to === 0;
    if (to === 0) return true;
    return toEl.density < fromEl.density && !(toEl.flags & FLAGS.INDESTRUCTIBLE);
  }

  private updatePressure() {
    const w = GRID_WIDTH, h = GRID_HEIGHT;
    
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const t = this.grid.pmap[i];
        if (t === 0) {
          this.pressure[i] *= 0.9;
          this.pvx[i] *= 0.9;
          this.pvy[i] *= 0.9;
        }
      }
    }
    
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (this.grid.pmap[i] !== 0) continue;
        
        const avg = (
          this.pressure[i - 1] +
          this.pressure[i + 1] +
          this.pressure[i - w] +
          this.pressure[i + w]
        ) / 4;
        
        const diff = (avg - this.pressure[i]) * 0.5;
        this.pressure[i] += diff;
        
        if (this.pressure[i] > 0.01 || this.pvx[i] !== 0 || this.pvy[i] !== 0) {
          this.pvx[i - 1] += diff * 0.25;
          this.pvx[i + 1] -= diff * 0.25;
          this.pvy[i - w] += diff * 0.25;
          this.pvy[i + w] -= diff * 0.25;
        }
      }
    }
  }

  private updateHeat() {
    const w = GRID_WIDTH, h = GRID_HEIGHT;
    const ambient = ROOM_TEMP;
    
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const t = this.grid.temp[i];
        
        const neighbors = [i - 1, i + 1, i - w, i + w];
        let total = t * 2;
        let count = 2;
        
        for (const n of neighbors) {
          const nt = this.grid.temp[n];
          const nFlags = this.grid.flags[n];
          const conduct = (nFlags & FLAGS.CONDUCTIVE) ? 0.5 : 0.1;
          total += nt * conduct;
          count += conduct;
        }
        
        let newTemp = total / count;
        newTemp += (ambient - newTemp) * 0.001;
        
        this.grid.temp[i] = newTemp;
      }
    }
  }

  private updateParticles() {
    const w = GRID_WIDTH, h = GRID_HEIGHT;
    const gravX = this.gravity.x * GRAVITY;
    const gravY = this.gravity.y * GRAVITY;
    
    const startY = this.gravity.y > 0 ? h - 2 : 1;
    const endY = this.gravity.y > 0 ? 0 : h - 1;
    const dirY = this.gravity.y > 0 ? -1 : 1;
    
    for (let y = startY; y !== endY; y += dirY) {
      const leftFirst = Math.random() < 0.5;
      const startX = leftFirst ? 1 : w - 2;
      const endX = leftFirst ? w - 1 : 0;
      const dirX = leftFirst ? 1 : -1;
      
      for (let x = startX; x !== endX; x += dirX) {
        const i = y * w + x;
        if (this.grid.moved[i]) continue;
        
        const type = this.grid.pmap[i];
        if (type === 0) continue;
        
        const el = this.getEl(type);
        if (!el) continue;
        
        if (el.flags & FLAGS.STATIC) continue;
        
        this.updateParticle(x, y, i, el, gravX, gravY);
      }
    }
  }

  private updateParticle(x: number, y: number, i: number, el: typeof elements[keyof typeof elements], gravX: number, gravY: number) {
    const w = GRID_WIDTH;
    const state = el.state;
    let moved = false;

    this.grid.vy[i] = Math.max(-4, Math.min(4, this.grid.vy[i] + gravY));
    this.grid.vx[i] = Math.max(-4, Math.min(4, this.grid.vx[i] + gravX));
    
    if (el.life && this.grid.life[i] > 0) {
      this.grid.life[i]--;
      if (this.grid.life[i] <= 0) {
        this.handleLifeEnd(x, y, i, el);
        return;
      }
    }

    this.handleTemperature(x, y, i, el);

    switch (state) {
      case ElementState.GAS:
        moved = this.updateGas(x, y, i, el);
        break;
      case ElementState.LIQUID:
        moved = this.updateLiquid(x, y, i, el);
        break;
      case ElementState.POWDER:
        moved = this.updatePowder(x, y, i, el);
        break;
      case ElementState.ENERGY:
        moved = this.updateEnergy(x, y, i, el);
        break;
    }

    this.handleSpecial(x, y, i, el);

    if (moved) {
      this.grid.moved[i] = 1;
    }
  }

  private updateGas(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]): boolean {
    const w = GRID_WIDTH;
    const diffusion = el.diffusion || 2;
    
    const directions = [
      { dx: 0, dy: -1, prob: 0.4 },
      { dx: randDir(), dy: -1, prob: 0.3 },
      { dx: randDir(), dy: 0, prob: 0.3 },
      { dx: 0, dy: 1, prob: 0.1 },
    ];
    
    for (const dir of directions) {
      if (Math.random() > dir.prob * diffusion) continue;
      const nx = x + dir.dx;
      const ny = y + dir.dy;
      if (this.tryMove(x, y, nx, ny, i, el)) return true;
    }
    
    for (let d = 0; d < 3; d++) {
      const dx = rand(3) - 1;
      const dy = rand(3) - 1;
      if (dx === 0 && dy === 0) continue;
      if (this.tryMove(x, y, x + dx, y + dy, i, el)) return true;
    }
    
    return false;
  }

  private updateLiquid(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]): boolean {
    const w = GRID_WIDTH;
    const viscosity = el.viscosity || 1;
    const canFlowSide = Math.random() < 1 / viscosity;
    
    if (this.tryMove(x, y, x, y + 1, i, el)) return true;
    
    const dir = randDir();
    if (this.tryMove(x, y, x + dir, y + 1, i, el)) return true;
    if (this.tryMove(x, y, x - dir, y + 1, i, el)) return true;
    
    if (canFlowSide) {
      for (let d = 1; d <= 3; d++) {
        if (this.tryMove(x, y, x + dir * d, y, i, el)) return true;
        if (this.tryMove(x, y, x - dir * d, y, i, el)) return true;
      }
    }
    
    if (el.flags & FLAGS.HOT) {
      this.pressure[i] += 0.01;
    }
    
    return false;
  }

  private updatePowder(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]): boolean {
    const dir = randDir();
    
    if (this.tryMove(x, y, x, y + 1, i, el)) return true;
    if (this.tryMove(x, y, x + dir, y + 1, i, el)) return true;
    if (this.tryMove(x, y, x - dir, y + 1, i, el)) return true;
    
    if (el.diffusion && Math.random() < el.diffusion) {
      if (this.tryMove(x, y, x + dir, y, i, el)) return true;
    }
    
    return false;
  }

  private updateEnergy(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]): boolean {
    const w = GRID_WIDTH;
    
    if (el.symbol === 'FIRE') {
      return this.updateFire(x, y, i, el);
    }
    if (el.symbol === 'SPRK') {
      return this.updateSpark(x, y, i, el);
    }
    if (el.symbol === 'PHOT') {
      return this.updatePhoton(x, y, i, el);
    }
    if (el.symbol === 'HEAT') {
      this.grid.temp[i] = 800;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ni = this.idx(x + dx, y + dy);
          if (this.inBounds(x + dx, y + dy) && this.grid.pmap[ni] !== elements.Heat.id) {
            this.grid.temp[ni] = Math.min(1000, this.grid.temp[ni] + 50);
          }
        }
      }
      return false;
    }
    
    if (this.tryMove(x, y, x, y - 1, i, el)) return true;
    return false;
  }

  private updateFire(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]): boolean {
    this.grid.temp[i] = 600 + rand(200);
    this.pressure[i] += 0.02;
    
    const dir = randDir();
    if (Math.random() < 0.4 && this.tryMove(x, y, x + dir, y - 1, i, el)) return true;
    if (Math.random() < 0.3 && this.tryMove(x, y, x, y - 1, i, el)) return true;
    if (Math.random() < 0.2 && this.tryMove(x, y, x + dir, y, i, el)) return true;
    
    if (Math.random() < 0.05 && this.grid.life[i] < 20) {
      this.createParticle(x, y, elements.Smoke.id);
      this.grid.clearParticle(x, y);
      return true;
    }
    
    return false;
  }

  private updateSpark(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]): boolean {
    this.grid.temp[i] = 1000;
    
    const neighbors = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
      [-1, -1], [1, -1], [-1, 1], [1, 1]
    ];
    
    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      if (!this.inBounds(nx, ny)) continue;
      const ni = this.idx(nx, ny);
      const nType = this.grid.pmap[ni];
      const nEl = this.getEl(nType);
      
      if (nEl && (nEl.flags & FLAGS.CONDUCTIVE) && nEl.symbol !== 'SPRK') {
        if (Math.random() < 0.5) {
          this.createParticle(nx, ny, elements.Spark.id, 1000, 20);
        }
      }
      
      if (nEl && (nEl.flags & FLAGS.FLAMMABLE) && Math.random() < 0.3) {
        this.createParticle(nx, ny, elements.Fire.id, 700, 60);
      }
    }
    
    if (this.grid.life[i] <= 0) {
      this.grid.clearParticle(x, y);
      return true;
    }
    
    if (Math.random() < 0.5) {
      const dir = randDir();
      if (this.tryMove(x, y, x + dir, y - 1, i, el)) return true;
      if (this.tryMove(x, y, x, y - 1, i, el)) return true;
    }
    
    return false;
  }

  private updatePhoton(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]): boolean {
    const w = GRID_WIDTH;
    let vx = this.grid.vx[i] || 1;
    let vy = this.grid.vy[i] || 0;
    
    if (vx === 0 && vy === 0) {
      vx = rand(3) - 1 || 1;
      vy = rand(3) - 1;
    }
    
    const nx = x + vx;
    const ny = y + vy;
    
    if (!this.inBounds(nx, ny)) {
      this.grid.clearParticle(x, y);
      return true;
    }
    
    const ni = this.idx(nx, ny);
    const nType = this.grid.pmap[ni];
    
    if (nType === 0) {
      this.grid.swap(i, ni);
      this.grid.vx[ni] = vx;
      this.grid.vy[ni] = vy;
      this.grid.moved[ni] = 1;
      this.grid.clearParticle(x, y);
      return true;
    }
    
    const nEl = this.getEl(nType);
    if (nEl) {
      if (nEl.symbol === 'GLAS' || nEl.symbol === 'ICE') {
        this.grid.temp[ni] += 20;
      } else if (nEl.flags & FLAGS.FLAMMABLE && Math.random() < 0.1) {
        this.createParticle(nx, ny, elements.Fire.id);
      } else if (nEl.hardness < 3 && Math.random() < 0.02) {
        this.grid.temp[ni] += 50;
      }
      
      if (nEl.symbol === 'WALL' || nEl.symbol === 'METL' || nEl.symbol === 'STNE') {
        const reflect = Math.random();
        if (reflect < 0.5) {
          this.grid.vx[i] = -vx;
        } else {
          this.grid.vy[i] = -vy;
        }
        return false;
      }
    }
    
    this.grid.clearParticle(x, y);
    return true;
  }

  private tryMove(x: number, y: number, nx: number, ny: number, i: number, el: typeof elements[keyof typeof elements]): boolean {
    if (!this.inBounds(nx, ny)) return false;
    if (x === nx && y === ny) return false;
    
    const ni = this.idx(nx, ny);
    if (this.grid.moved[ni]) return false;
    
    const nType = this.grid.pmap[ni];
    
    if (nType === 0) {
      this.grid.swap(i, ni);
      this.grid.moved[ni] = 1;
      return true;
    }
    
    const nEl = this.getEl(nType);
    if (!nEl) return false;
    
    if (nEl.state === ElementState.GAS && el.state !== ElementState.GAS) {
      this.grid.swap(i, ni);
      this.grid.moved[ni] = 1;
      return true;
    }
    
    if (el.density > nEl.density && !(nEl.flags & FLAGS.INDESTRUCTIBLE) && !(nEl.flags & FLAGS.STATIC)) {
      if (el.state === ElementState.LIQUID && nEl.state === ElementState.LIQUID && el.density <= nEl.density) {
        return false;
      }
      this.grid.swap(i, ni);
      this.grid.moved[ni] = 1;
      return true;
    }
    
    return false;
  }

  private handleTemperature(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]) {
    const t = this.grid.temp[i];
    
    if (el.boilingPoint && t >= el.boilingPoint) {
      this.boil(x, y, i, el);
      return;
    }
    
    if (el.meltingPoint && t >= el.meltingPoint && el.state === ElementState.SOLID) {
      this.melt(x, y, i, el);
      return;
    }
    
    if (el.meltingPoint && t < el.meltingPoint && el.state === ElementState.LIQUID) {
      this.freeze(x, y, i, el);
      return;
    }
    
    if (el.symbol === 'H2O' && t < 273) {
      this.grid.setParticle(x, y, elements.Ice.id, t);
      return;
    }
    if (el.symbol === 'ICE' && t > 273) {
      this.grid.setParticle(x, y, elements.H2O.id, t);
      return;
    }
    if (el.symbol === 'H2O' && t > 373) {
      if (Math.random() < 0.1) {
        this.grid.setParticle(x, y, elements.Steam.id, t);
      }
      return;
    }
    if (el.symbol === 'STMC' && t < 373) {
      if (Math.random() < 0.02) {
        this.grid.setParticle(x, y, elements.H2O.id, t);
      }
      return;
    }
    if (el.symbol === 'LN2' && this.frame % 5 === 0) {
      this.grid.setParticle(x, y, elements.Cold.id, 77);
      return;
    }
    if (el.symbol === 'COLD' && t > 273) {
      if (Math.random() < 0.02) {
        this.grid.clearParticle(x, y);
        return;
      }
    }
  }

  private boil(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]) {
    const boilingMap: Record<string, number> = {
      'H2O': elements.Steam.id,
      'OIL': elements.Smoke.id,
      'LAVA': elements.Plasma.id,
      'ALCH': elements.Fire.id,
      'HG': elements.Plasma.id,
      'LN2': elements.Cold.id,
    };
    
    const gasType = boilingMap[el.symbol] || elements.Steam.id;
    if (Math.random() < 0.05) {
      this.grid.setParticle(x, y, gasType, this.grid.temp[i]);
      this.pressure[i] += 0.1;
    }
  }

  private melt(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]) {
    const meltingMap: Record<string, number> = {
      'SAND': elements.Glass.id,
      'STNE': elements.Lava.id,
      'METL': elements.Lava.id,
      'GLAS': elements.Lava.id,
      'ICE': elements.H2O.id,
      'SNOW': elements.H2O.id,
      'WOOD': elements.Fire.id,
      'COAL': elements.Fire.id,
    };
    
    const liqType = meltingMap[el.symbol];
    if (liqType && Math.random() < 0.02) {
      if (liqType === elements.Fire.id) {
        this.grid.setParticle(x, y, elements.Fire.id, this.grid.temp[i], 50);
      } else {
        this.grid.setParticle(x, y, liqType, this.grid.temp[i]);
      }
    }
  }

  private freeze(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]) {
    const freezingMap: Record<string, number> = {
      'H2O': elements.Ice.id,
      'LAVA': elements.Stone.id,
    };
    
    const solidType = freezingMap[el.symbol];
    if (solidType && Math.random() < 0.05) {
      this.grid.setParticle(x, y, solidType, this.grid.temp[i]);
    }
  }

  private handleLifeEnd(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]) {
    switch (el.symbol) {
      case 'FIRE':
        if (Math.random() < 0.3) {
          this.grid.setParticle(x, y, elements.Smoke.id, this.grid.temp[i], 400);
        } else if (Math.random() < 0.1) {
          this.grid.setParticle(x, y, elements.Ash.id, this.grid.temp[i]);
        } else {
          this.grid.clearParticle(x, y);
        }
        break;
      case 'SPARK':
        this.grid.clearParticle(x, y);
        break;
      case 'SMKE':
      case 'STMC':
      case 'COLD':
      case 'PLSM':
        this.grid.clearParticle(x, y);
        break;
      default:
        this.grid.clearParticle(x, y);
    }
  }

  private handleSpecial(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]) {
    const w = GRID_WIDTH;
    
    if (el.symbol === 'VOID') {
      const neighbors = [
        [0, -1], [0, 1], [-1, 0], [1, 0],
        [-1, -1], [1, -1], [-1, 1], [1, 1]
      ];
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny)) {
          const ni = this.idx(nx, ny);
          if (this.grid.pmap[ni] !== 0 && this.grid.pmap[ni] !== elements.Void.id) {
            this.grid.clearParticle(nx, ny);
          }
        }
      }
    }
    
    if (el.symbol === 'CLNE') {
      const neighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny) && this.grid.pmap[this.idx(nx, ny)] !== 0) {
          const copyType = this.grid.pmap[this.idx(nx, ny)];
          const ox = x - dx;
          const oy = y - dy;
          if (this.inBounds(ox, oy) && this.isEmpty(ox, oy)) {
            if (Math.random() < 0.05) {
              this.grid.setParticle(ox, oy, copyType, this.grid.temp[this.idx(nx, ny)]);
            }
          }
        }
      }
    }
    
    if (el.symbol === 'ACID') {
      const neighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny)) {
          const ni = this.idx(nx, ny);
          const nType = this.grid.pmap[ni];
          const nEl = this.getEl(nType);
          if (nEl && !(nEl.flags & FLAGS.INDESTRUCTIBLE) && nEl.symbol !== 'ACID' && nEl.symbol !== 'GLAS') {
            if (Math.random() < 0.02) {
              this.grid.clearParticle(nx, ny);
              if (Math.random() < 0.3) {
                this.grid.setParticle(nx, ny, elements.Steam.id, 350, 200);
              }
              if (Math.random() < 0.1) {
                this.grid.clearParticle(x, y);
              }
            }
          }
        }
      }
    }
    
    if (el.symbol === 'PLNT') {
      const t = this.grid.temp[i];
      if (t > 273 && t < 330) {
        const neighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [dx, dy] of neighbors) {
          const nx = x + dx;
          const ny = y + dy;
          if (this.inBounds(nx, ny) && this.isEmpty(nx, ny) && Math.random() < 0.005) {
            let hasWater = false;
            for (let ddy = -2; ddy <= 2; ddy++) {
              for (let ddx = -2; ddx <= 2; ddx++) {
                const wx = nx + ddx;
                const wy = ny + ddy;
                if (this.inBounds(wx, wy) && (this.grid.pmap[this.idx(wx, wy)] === elements.H2O.id)) {
                  hasWater = true;
                  break;
                }
              }
            }
            if (hasWater) {
              this.grid.setParticle(nx, ny, elements.Plant.id, t);
            }
          }
        }
      }
      if (t > 400 && Math.random() < 0.001) {
        this.grid.setParticle(x, y, elements.Fire.id, t, 60);
      }
    }
  }

  private updateReactions() {
    const w = GRID_WIDTH, h = GRID_HEIGHT;
    
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const type = this.grid.pmap[i];
        if (type === 0) continue;
        
        const el = this.getEl(type);
        if (!el) continue;
        
        const t = this.grid.temp[i];
        
        if (el.flags & FLAGS.FLAMMABLE) {
          if (t > 450 + (10 - el.flammability) * 30) {
            if (this.hasOxygen(x, y) && Math.random() < 0.02 * el.flammability) {
              this.ignite(x, y, i, el);
            }
          }
        }
        
        if (el.symbol === 'GUNP' && t > 500) {
          this.explode(x, y, 5, 800);
        }
        
        if (el.symbol === 'FIRE') {
          const neighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]];
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny)) {
              const ni = this.idx(nx, ny);
              const nType = this.grid.pmap[ni];
              const nEl = this.getEl(nType);
              if (nEl) {
                if (nEl.symbol === 'H2O') {
                  if (Math.random() < 0.3) {
                    this.grid.setParticle(x, y, elements.Steam.id, 380, 200);
                    this.grid.temp[ni] = Math.max(273, this.grid.temp[ni] - 20);
                  }
                }
                if (nEl.symbol === 'CO2' || nEl.symbol === 'SAND') {
                  if (Math.random() < 0.1) {
                    this.grid.clearParticle(x, y);
                  }
                }
              }
            }
          }
        }
        
        if (el.symbol === 'LAVA') {
          const neighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]];
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny)) {
              const ni = this.idx(nx, ny);
              const nType = this.grid.pmap[ni];
              const nEl = this.getEl(nType);
              if (nEl) {
                if (nEl.symbol === 'H2O') {
                  if (Math.random() < 0.08) {
                    this.grid.setParticle(x, y, elements.Stone.id, 400);
                    this.grid.setParticle(nx, ny, elements.Steam.id, 400, 150);
                  }
                }
                if (nEl.symbol === 'ICE') {
                  this.grid.setParticle(nx, ny, elements.H2O.id, 273);
                  this.grid.temp[i] -= 100;
                }
                if (nEl.symbol === 'COLD' || nEl.symbol === 'LN2') {
                  if (Math.random() < 0.3) {
                    this.grid.setParticle(x, y, elements.Stone.id, 300);
                  }
                }
                if (nEl.flags & FLAGS.FLAMMABLE && Math.random() < 0.1) {
                  this.grid.setParticle(nx, ny, elements.Fire.id, 700, 60);
                }
              }
            }
          }
        }
        
        if (el.symbol === 'H2O') {
          const neighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]];
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny)) {
              const ni = this.idx(nx, ny);
              const nType = this.grid.pmap[ni];
              const nEl = this.getEl(nType);
              if (nEl) {
                if (nEl.symbol === 'FIRE') {
                  if (Math.random() < 0.5) {
                    this.grid.clearParticle(nx, ny);
                    if (Math.random() < 0.3) {
                      this.grid.setParticle(nx, ny, elements.Steam.id, 380, 100);
                    }
                  }
                }
              }
            }
          }
        }
        
        if (el.symbol === 'ACID') {
          const neighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]];
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny)) {
              const ni = this.idx(nx, ny);
              const nType = this.grid.pmap[ni];
              const nEl = this.getEl(nType);
              if (nEl) {
                if (nEl.symbol === 'METL' || nEl.symbol === 'STNE' || nEl.symbol === 'CNCR') {
                  if (Math.random() < 0.01) {
                    this.grid.clearParticle(nx, ny);
                    if (nEl.symbol === 'METL' && Math.random() < 0.5) {
                      this.createParticle(nx, ny, elements.H2.id, 300, 400);
                    }
                  }
                }
              }
            }
          }
        }
        
        if (el.symbol === 'PLSM') {
          this.grid.temp[i] = 5000;
          const neighbors = [[0, -1], [0, 1], [-1, 0], [1, 0]];
          for (const [dx, dy] of neighbors) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny)) {
              const ni = this.idx(nx, ny);
              const nType = this.grid.pmap[ni];
              const nEl = this.getEl(nType);
              if (nEl && nEl.symbol !== 'PLSM' && nEl.symbol !== 'VOID' && !(nEl.flags & FLAGS.INDESTRUCTIBLE)) {
                if (Math.random() < 0.1) {
                  this.grid.clearParticle(nx, ny);
                }
              }
            }
          }
        }
        
        if (el.symbol === 'CMNT') {
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny) && this.grid.pmap[this.idx(nx, ny)] === elements.H2O.id) {
              if (Math.random() < 0.01) {
                this.grid.setParticle(x, y, elements.Concrete.id, t);
              }
            }
          }
        }
        
        if (el.symbol === 'SALT') {
          for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.inBounds(nx, ny) && this.grid.pmap[this.idx(nx, ny)] === elements.H2O.id) {
              if (Math.random() < 0.005) {
                this.grid.clearParticle(x, y);
              }
            }
          }
        }
      }
    }
  }

  private hasOxygen(x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny)) {
          const ni = this.idx(nx, ny);
          const nType = this.grid.pmap[ni];
          if (nType === 0 || nType === elements.O2.id || nType === elements.Steam.id) {
            return true;
          }
        }
      }
    }
    return false;
  }

  private ignite(x: number, y: number, i: number, el: typeof elements[keyof typeof elements]) {
    this.grid.setParticle(x, y, elements.Fire.id, this.grid.temp[i], 40 + rand(40));
    this.pressure[i] += 0.05;
    
    if (el.symbol === 'OIL' || el.symbol === 'ALCH') {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.random() < 0.3) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (this.inBounds(nx, ny) && this.isEmpty(nx, ny)) {
            if (Math.random() < 0.2) {
              this.grid.setParticle(nx, ny, elements.Fire.id, 600, 30);
            }
          }
        }
      }
    }
  }

  private explode(x: number, y: number, radius: number, temp: number) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > radius) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        
        const ni = this.idx(nx, ny);
        const power = 1 - dist / radius;
        
        this.pressure[ni] += power * 2;
        this.grid.temp[ni] = Math.max(this.grid.temp[ni], temp * power);
        
        if (Math.random() < power * 0.8) {
          const r = Math.random();
          if (r < 0.3) {
            this.grid.setParticle(nx, ny, elements.Fire.id, temp * power, 50);
          } else if (r < 0.5) {
            this.grid.setParticle(nx, ny, elements.Smoke.id, 400, 300);
          } else if (r < 0.6) {
            this.grid.setParticle(nx, ny, elements.Plasma.id, 2000, 100);
          } else {
            this.grid.clearParticle(nx, ny);
          }
        }
      }
    }
  }

  createParticle(x: number, y: number, type: number, temp?: number, life?: number) {
    this.grid.setParticle(x, y, type, temp, life);
  }

  drawCircle(cx: number, cy: number, radius: number, type: number) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const x = cx + dx;
          const y = cy + dy;
          if (type === elements.Eraser.id) {
            this.grid.clearParticle(x, y);
          } else {
            this.grid.setParticle(x, y, type);
          }
        }
      }
    }
  }

  drawLine(x0: number, y0: number, x1: number, y1: number, radius: number, type: number) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    
    let x = x0;
    let y = y0;
    
    while (true) {
      this.drawCircle(x, y, radius, type);
      
      if (x === x1 && y === y1) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  getParticleCount(): number {
    let count = 0;
    for (let i = 0; i < this.grid.pmap.length; i++) {
      if (this.grid.pmap[i] !== 0) count++;
    }
    return count;
  }

  getTemperatureAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return ROOM_TEMP;
    return this.grid.temp[this.idx(x, y)];
  }
}
