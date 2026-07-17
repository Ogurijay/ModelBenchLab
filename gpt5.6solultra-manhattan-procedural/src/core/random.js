const UINT32_SCALE = 1 / 0x100000000;

function canonicalSeed(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value >>> 0;
  if (typeof value === 'bigint') return Number(value & 0xffffffffn) >>> 0;
  return hashString(String(value));
}

/**
 * FNV-1a followed by a 32-bit avalanche.  It is deliberately small, fast and
 * platform independent; JavaScript bitwise operations make every step uint32.
 */
export function hashString(value, seed = 0x811c9dc5) {
  const text = String(value);
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function hashParts(...parts) {
  let hash = 0x811c9dc5;
  for (const part of parts) hash = hashString(`${typeof part}:${String(part)}\u001f`, hash);
  return hash >>> 0;
}

export function hashToHex(value) {
  return (value >>> 0).toString(16).padStart(8, '0');
}

/** Deterministic Mulberry32 generator returning values in [0, 1). */
export function mulberry32(seed) {
  let state = canonicalSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) * UINT32_SCALE;
  };
}

/**
 * Named random streams are derived from the original seed rather than the
 * current state.  Adding a tree draw therefore cannot perturb building lots.
 */
export class SeededRandom {
  constructor(seed = 0) {
    this.seed = canonicalSeed(seed);
    this._next = mulberry32(this.seed);
  }

  next() {
    return this._next();
  }

  uint32() {
    return Math.floor(this.next() * 0x100000000) >>> 0;
  }

  range(min = 0, max = 1) {
    return min + (max - min) * this.next();
  }

  int(min, maxInclusive) {
    const lower = Math.ceil(Math.min(min, maxInclusive));
    const upper = Math.floor(Math.max(min, maxInclusive));
    return lower + Math.floor(this.next() * (upper - lower + 1));
  }

  bool(probability = 0.5) {
    return this.next() < probability;
  }

  pick(values) {
    if (!values?.length) return undefined;
    return values[Math.min(values.length - 1, Math.floor(this.next() * values.length))];
  }

  fork(label) {
    return new SeededRandom(hashParts(this.seed, label));
  }
}

export function createRandom(seed) {
  return new SeededRandom(seed);
}
