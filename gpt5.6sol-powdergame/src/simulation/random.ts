export class SeededRandom {
  private state: number;

  constructor(seed = 0x56_50_54) {
    this.state = seed >>> 0 || 1;
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x1_0000_0000;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  sign(): -1 | 1 {
    return this.next() < 0.5 ? -1 : 1;
  }

  integer(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  getSeed(): number {
    return this.state;
  }

  setSeed(seed: number): void {
    this.state = seed >>> 0 || 1;
  }
}

