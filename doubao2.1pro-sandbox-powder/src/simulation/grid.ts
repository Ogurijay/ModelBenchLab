import { GRID_WIDTH, GRID_HEIGHT, ROOM_TEMP, FLAGS, ElementState } from './constants';
import { elements } from './elements';

const SIZE = GRID_WIDTH * GRID_HEIGHT;

export class ParticleGrid {
  pmap: Uint16Array;
  temp: Float32Array;
  life: Int16Array;
  flags: Uint16Array;
  vx: Int8Array;
  vy: Int8Array;
  ctype: Uint16Array;
  color: Uint32Array;
  moved: Uint8Array;

  constructor() {
    this.pmap = new Uint16Array(SIZE);
    this.temp = new Float32Array(SIZE);
    this.life = new Int16Array(SIZE);
    this.flags = new Uint16Array(SIZE);
    this.vx = new Int8Array(SIZE);
    this.vy = new Int8Array(SIZE);
    this.ctype = new Uint16Array(SIZE);
    this.color = new Uint32Array(SIZE);
    this.moved = new Uint8Array(SIZE);
    this.clear();
  }

  clear() {
    this.pmap.fill(0);
    this.temp.fill(ROOM_TEMP);
    this.life.fill(0);
    this.flags.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
    this.ctype.fill(0);
    this.color.fill(0);
    this.moved.fill(0);
  }

  idx(x: number, y: number): number {
    return y * GRID_WIDTH + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
  }

  getType(x: number, y: number): number {
    if (!this.inBounds(x, y)) return elements.Wall.id;
    return this.pmap[this.idx(x, y)];
  }

  setType(x: number, y: number, type: number) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.pmap[i] = type;
    const el = Object.values(elements).find(e => e.id === type);
    if (el) {
      this.flags[i] = el.flags;
      if (el.color) {
        const c = this.hexToRgb(el.color);
        this.color[i] = (0xff << 24) | (c.b << 16) | (c.g << 8) | c.r;
      }
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  swap(i: number, j: number) {
    let t: number;
    t = this.pmap[i]; this.pmap[i] = this.pmap[j]; this.pmap[j] = t;
    t = this.temp[i]; this.temp[i] = this.temp[j]; this.temp[j] = t;
    let ti: number;
    ti = this.life[i]; this.life[i] = this.life[j]; this.life[j] = ti;
    ti = this.flags[i]; this.flags[i] = this.flags[j]; this.flags[j] = ti;
    ti = this.vx[i]; this.vx[i] = this.vx[j]; this.vx[j] = ti;
    ti = this.vy[i]; this.vy[i] = this.vy[j]; this.vy[j] = ti;
    ti = this.ctype[i]; this.ctype[i] = this.ctype[j]; this.ctype[j] = ti;
    const tc: number = this.color[i]; this.color[i] = this.color[j]; this.color[j] = tc;
  }

  setParticle(x: number, y: number, type: number, temp?: number, life?: number) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    const el = Object.values(elements).find(e => e.id === type);
    this.pmap[i] = type;
    if (el) {
      this.flags[i] = el.flags;
      if (el.life) this.life[i] = el.life;
      if (temp !== undefined) this.temp[i] = temp;
      if (life !== undefined) this.life[i] = life;
      const colors = el.colors || [el.color];
      const col = colors[Math.floor(Math.random() * colors.length)];
      const c = this.hexToRgb(col);
      this.color[i] = (0xff << 24) | (c.b << 16) | (c.g << 8) | c.r;
      
      if (el.flags & FLAGS.HOT) this.temp[i] = Math.max(this.temp[i], 500);
      if (el.flags & FLAGS.COLD) this.temp[i] = Math.min(this.temp[i], 200);
    }
  }

  clearParticle(x: number, y: number) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.pmap[i] = 0;
    this.temp[i] = ROOM_TEMP;
    this.life[i] = 0;
    this.flags[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.ctype[i] = 0;
    this.color[i] = 0;
  }
}
