import { describe, it, expect } from 'vitest';
import { ifft2D, idft2D } from '../src/ocean/fft.js';
import { mulberry32 } from '../src/core/rng.js';

describe('Stockham 逆 FFT', () => {
  for (const N of [4, 8, 16]) {
    it(`N=${N} 与直接逆 DFT 一致`, () => {
      const rand = mulberry32(N);
      const re = new Float64Array(N * N).map(() => rand() * 2 - 1);
      const im = new Float64Array(N * N).map(() => rand() * 2 - 1);
      const ref = idft2D(re, im, N);
      ifft2D(re, im, N);
      for (let i = 0; i < N * N; i++) {
        expect(re[i]).toBeCloseTo(ref.re[i], 9);
        expect(im[i]).toBeCloseTo(ref.im[i], 9);
      }
    });
  }

  it('拒绝非 2 的幂尺寸', () => {
    expect(() => ifft2D(new Float64Array(9), new Float64Array(9), 3)).toThrow();
  });
});
