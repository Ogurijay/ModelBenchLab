import { describe, expect, it } from 'vitest';
import {
  createRainField,
  createRainLayout,
  getRainDropCount
} from '../src/weather/rain.js';

describe('GPU rain field', () => {
  it('uses quality-specific drop counts', () => {
    expect(getRainDropCount('high')).toBe(12000);
    expect(getRainDropCount('mobile')).toBe(5000);
  });

  it('creates deterministic finite rain attributes', () => {
    const first = createRainLayout({ count: 16, seed: 5602 });
    const second = createRainLayout({ count: 16, seed: 5602 });

    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
    expect(Array.from(first.attributes)).toEqual(Array.from(second.attributes));
    expect(Array.from(first.positions).every(Number.isFinite)).toBe(true);
    expect(Array.from(first.attributes).every(Number.isFinite)).toBe(true);
  });

  it('creates one Points object and exposes intensity updates', () => {
    const field = createRainField({ quality: 'mobile', seed: 5602 });

    expect(field.points.isPoints).toBe(true);
    expect(field.dropCount).toBe(5000);
    field.setIntensity(0.7);
    expect(field.material.uniforms.uIntensity.value).toBe(0.7);
    field.dispose();
    expect(field.geometry.attributes.position).toBeDefined();
  });
});
