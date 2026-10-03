// Stockham 自排序逆 FFT（radix-2），逐行再逐列。
// 与 GPU 着色器 FFT_FRAG 使用完全相同的索引与旋转因子公式：
//   even = floor(j / Ns) * Ns/2 + j mod Ns/2,  odd = even + N/2,  out = even + e^{+2πi·j/Ns}·odd
// 结果为未归一化的逆 DFT：x[m] = Σ X[n]·e^{+2πi·n·m/N}

const TAU = Math.PI * 2;

export function log2Int(N) {
  const p = Math.round(Math.log2(N));
  if (1 << p !== N) throw new Error(`FFT 尺寸必须是 2 的幂：${N}`);
  return p;
}

const twiddleCache = new Map();
function twiddles(N) {
  let t = twiddleCache.get(N);
  if (!t) {
    // 预存 cos/sin(2π·j/N)，任意 Ns 的角 2π·j/Ns = 2π·(j·N/Ns mod N)/N
    t = { cos: new Float64Array(N), sin: new Float64Array(N) };
    for (let j = 0; j < N; j++) {
      t.cos[j] = Math.cos((TAU * j) / N);
      t.sin[j] = Math.sin((TAU * j) / N);
    }
    twiddleCache.set(N, t);
  }
  return t;
}

// 一维逆 FFT，作用在 stride 步长的一条线上（re/im 为 Float32/64Array）
function ifft1D(re, im, offset, stride, N, bufRe, bufIm, outRe, outIm) {
  const passes = log2Int(N);
  const tw = twiddles(N);
  const half = N >> 1;
  for (let j = 0; j < N; j++) {
    bufRe[j] = re[offset + j * stride];
    bufIm[j] = im[offset + j * stride];
  }
  let srcR = bufRe;
  let srcI = bufIm;
  let dstR = outRe;
  let dstI = outIm;
  for (let p = 1; p <= passes; p++) {
    const Ns = 1 << p;
    const hs = Ns >> 1;
    const scale = N / Ns;
    for (let j = 0; j < N; j++) {
      const even = Math.floor(j / Ns) * hs + (j % hs);
      const odd = even + half;
      const ti = ((j * scale) % N) | 0;
      const c = tw.cos[ti];
      const s = tw.sin[ti];
      const oR = srcR[odd];
      const oI = srcI[odd];
      dstR[j] = srcR[even] + c * oR - s * oI;
      dstI[j] = srcI[even] + c * oI + s * oR;
    }
    const tr = srcR;
    const ti2 = srcI;
    srcR = dstR;
    srcI = dstI;
    dstR = tr;
    dstI = ti2;
  }
  for (let j = 0; j < N; j++) {
    re[offset + j * stride] = srcR[j];
    im[offset + j * stride] = srcI[j];
  }
}

// 原地二维逆 FFT，数据按行主序 [z * N + x]
export function ifft2D(re, im, N) {
  const bR = new Float64Array(N);
  const bI = new Float64Array(N);
  const oR = new Float64Array(N);
  const oI = new Float64Array(N);
  for (let row = 0; row < N; row++) ifft1D(re, im, row * N, 1, N, bR, bI, oR, oI);
  for (let col = 0; col < N; col++) ifft1D(re, im, col, N, N, bR, bI, oR, oI);
}

// 直接逆 DFT（仅测试用）
export function idft2D(re, im, N) {
  const outR = new Float64Array(N * N);
  const outI = new Float64Array(N * N);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      let sr = 0;
      let si = 0;
      for (let m = 0; m < N; m++) {
        for (let n = 0; n < N; n++) {
          const a = (TAU * (n * x + m * z)) / N;
          const c = Math.cos(a);
          const s = Math.sin(a);
          const r = re[m * N + n];
          const i = im[m * N + n];
          sr += r * c - i * s;
          si += r * s + i * c;
        }
      }
      outR[z * N + x] = sr;
      outI[z * N + x] = si;
    }
  }
  return { re: outR, im: outI };
}
