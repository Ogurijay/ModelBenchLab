// GPU FFT 海面：每级 cascade 每帧 1 次频谱演化 + 2·log2(N) 次 Stockham 蝶形 + 1 次合成。
// 8 个实数场两两打包成 4 个复数场，用 2 路 MRT 一起变换：
//   A = (Dx + i·Dy, Dz + i·∂Dy/∂x)    B = (∂Dy/∂z + i·∂Dx/∂x, ∂Dz/∂z + i·∂Dx/∂z)
// 合成输出（半精度、带 mipmap、各向异性过滤、平铺重复）：
//   disp  = (λDx, Dy, λDz, foam)      deriv = (∂Dy/∂x, ∂Dy/∂z, λ∂Dx/∂x, λ∂Dz/∂z)
// 泡沫由雅可比行列式 J < bias（水面翻卷）注入，并按时间指数衰减，在两张输出之间乒乓保留。

import * as THREE from 'three';
import { log2Int } from './fft.js';

const QUAD_VERT = /* glsl */ `
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const COMMON = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 mulI(vec2 a) { return vec2(-a.y, a.x); }
`;

const SPECTRUM_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uH0From;
uniform sampler2D uH0To;
uniform sampler2D uOmega;
uniform float uBlend;
uniform float uTime;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 h0 = mix(texelFetch(uH0From, p, 0), texelFetch(uH0To, p, 0), uBlend);
  vec4 om = texelFetch(uOmega, p, 0);
  float ph = om.x * uTime;
  vec2 e = vec2(cos(ph), sin(ph));
  vec2 h = cmul(h0.xy, e) + cmul(h0.zw, vec2(e.x, -e.y));
  vec2 k = om.yz;
  float kl = length(k);
  float invK = kl > 1e-6 ? 1.0 / kl : 0.0;
  vec2 ih = mulI(h);
  vec2 dx = -k.x * invK * ih;
  vec2 dz = -k.y * invK * ih;
  vec2 dydx = k.x * ih;
  vec2 dydz = k.y * ih;
  vec2 dxdx = k.x * k.x * invK * h;
  vec2 dzdz = k.y * k.y * invK * h;
  vec2 dxdz = k.x * k.y * invK * h;
  outA = vec4(dx + mulI(h), dz + mulI(dydx));
  outB = vec4(dydz + mulI(dxdx), dzdz + mulI(dxdz));
}
`;

const FFT_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uInA;
uniform sampler2D uInB;
uniform int uNs;
uniform int uN;
uniform int uHorizontal;
layout(location = 0) out vec4 outA;
layout(location = 1) out vec4 outB;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int j = uHorizontal == 1 ? p.x : p.y;
  int hs = uNs / 2;
  int even = (j / uNs) * hs + (j % hs);
  int odd = even + uN / 2;
  ivec2 pe = uHorizontal == 1 ? ivec2(even, p.y) : ivec2(p.x, even);
  ivec2 po = uHorizontal == 1 ? ivec2(odd, p.y) : ivec2(p.x, odd);
  float ang = 6.283185307179586 * float(j % uNs) / float(uNs);
  vec2 tw = vec2(cos(ang), sin(ang));
  vec4 eA = texelFetch(uInA, pe, 0);
  vec4 oA = texelFetch(uInA, po, 0);
  vec4 eB = texelFetch(uInB, pe, 0);
  vec4 oB = texelFetch(uInB, po, 0);
  outA = vec4(eA.xy + cmul(tw, oA.xy), eA.zw + cmul(tw, oA.zw));
  outB = vec4(eB.xy + cmul(tw, oB.xy), eB.zw + cmul(tw, oB.zw));
}
`;

const ASSEMBLE_FRAG = /* glsl */ `
${COMMON}
uniform sampler2D uInA;
uniform sampler2D uInB;
uniform sampler2D uPrev;
uniform float uChop;
uniform float uDt;
uniform float uFoamDecay;
uniform float uFoamBias;
uniform float uFoamGain;
layout(location = 0) out vec4 outDisp;
layout(location = 1) out vec4 outDeriv;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 A = texelFetch(uInA, p, 0);
  vec4 B = texelFetch(uInB, p, 0);
  float jxx = 1.0 + uChop * B.y;
  float jzz = 1.0 + uChop * B.z;
  float jxz = uChop * B.w;
  float J = jxx * jzz - jxz * jxz;
  float prev = texelFetch(uPrev, p, 0).w;
  float foam = prev * exp(-uFoamDecay * uDt);
  float inject = clamp((uFoamBias - J) * uFoamGain, 0.0, 1.0);
  foam = clamp(foam + inject * min(uDt * 8.0, 1.0), 0.0, 1.0);
  outDisp = vec4(uChop * A.x, A.y, uChop * A.z, foam);
  outDeriv = vec4(A.w, B.x, uChop * B.y, uChop * B.z);
}
`;

function rawMaterial(fragmentShader, uniforms) {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: QUAD_VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false
  });
}

function dataTexture(data, N) {
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export class OceanGPU {
  constructor(renderer, { N, layout, omegaTables }) {
    this.renderer = renderer;
    this.N = N;
    this.passes = log2Int(N);
    this.layout = layout;
    this.frame = 0;

    const scratchOpts = {
      count: 2,
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false
    };
    this.ping = new THREE.WebGLRenderTarget(N, N, scratchOpts);
    this.pong = new THREE.WebGLRenderTarget(N, N, scratchOpts);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const outOpts = {
      count: 2,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: true,
      anisotropy: Math.min(16, maxAniso)
    };
    this.cascades = layout.map((c, i) => {
      const outputs = [new THREE.WebGLRenderTarget(N, N, outOpts), new THREE.WebGLRenderTarget(N, N, outOpts)];
      for (const rt of outputs) {
        for (const t of rt.textures) {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = Math.min(16, maxAniso);
        }
      }
      return {
        L: c.L,
        fromData: new Float32Array(N * N * 4),
        toData: new Float32Array(N * N * 4),
        from: null,
        to: null,
        omega: dataTexture(omegaTables[i], N),
        outputs,
        current: 0
      };
    });
    for (const c of this.cascades) {
      c.from = dataTexture(c.fromData, N);
      c.to = dataTexture(c.toData, N);
    }

    this.spectrumMat = rawMaterial(SPECTRUM_FRAG, {
      uH0From: { value: null },
      uH0To: { value: null },
      uOmega: { value: null },
      uBlend: { value: 1 },
      uTime: { value: 0 }
    });
    this.fftMat = rawMaterial(FFT_FRAG, {
      uInA: { value: null },
      uInB: { value: null },
      uNs: { value: 2 },
      uN: { value: N },
      uHorizontal: { value: 1 }
    });
    this.assembleMat = rawMaterial(ASSEMBLE_FRAG, {
      uInA: { value: null },
      uInB: { value: null },
      uPrev: { value: null },
      uChop: { value: 1 },
      uDt: { value: 1 / 60 },
      uFoamDecay: { value: 0.6 },
      uFoamBias: { value: 0.35 },
      uFoamGain: { value: 2.5 }
    });

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.spectrumMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  // 新目标谱：当前混合态写入 from，新谱写入 to，由 blend 0→1 平滑过渡
  setTarget(h0List, blend, immediate = false) {
    this.cascades.forEach((c, i) => {
      if (immediate) {
        c.toData.set(h0List[i]);
        c.fromData.set(h0List[i]);
      } else {
        const f = c.fromData;
        const t = c.toData;
        for (let j = 0; j < f.length; j++) f[j] += (t[j] - f[j]) * blend;
        t.set(h0List[i]);
      }
      c.from.needsUpdate = true;
      c.to.needsUpdate = true;
    });
  }

  _run(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  update({ time, dt, blend, chop, foamDecay, foamBias, foamGain }) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAutoClear = r.autoClear;
    r.autoClear = false;
    const N = this.N;
    for (const c of this.cascades) {
      const s = this.spectrumMat.uniforms;
      s.uH0From.value = c.from;
      s.uH0To.value = c.to;
      s.uOmega.value = c.omega;
      s.uBlend.value = blend;
      s.uTime.value = time;
      this._run(this.spectrumMat, this.ping);

      let src = this.ping;
      let dst = this.pong;
      const f = this.fftMat.uniforms;
      for (let dir = 1; dir >= 0; dir--) {
        f.uHorizontal.value = dir;
        for (let p = 1; p <= this.passes; p++) {
          f.uNs.value = 1 << p;
          f.uN.value = N;
          f.uInA.value = src.textures[0];
          f.uInB.value = src.textures[1];
          this._run(this.fftMat, dst);
          const t = src;
          src = dst;
          dst = t;
        }
      }

      const prev = c.outputs[c.current];
      c.current ^= 1;
      const a = this.assembleMat.uniforms;
      a.uInA.value = src.textures[0];
      a.uInB.value = src.textures[1];
      a.uPrev.value = prev.textures[0];
      a.uChop.value = chop;
      a.uDt.value = dt;
      a.uFoamDecay.value = foamDecay;
      a.uFoamBias.value = foamBias;
      a.uFoamGain.value = foamGain;
      this._run(this.assembleMat, c.outputs[c.current]);
    }
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAutoClear;
    this.frame++;
  }

  dispTexture(i) {
    const c = this.cascades[i];
    return c.outputs[c.current].textures[0];
  }

  derivTexture(i) {
    const c = this.cascades[i];
    return c.outputs[c.current].textures[1];
  }

  // 调试：读回某级 cascade 在网格点 (ix, iz) 的位移，验证 CPU 副本与 GPU 一致
  readDisplacement(i, ix, iz) {
    const c = this.cascades[i];
    const buf = new Uint16Array(4);
    this.renderer.readRenderTargetPixels(c.outputs[c.current], ix, iz, 1, 1, buf, undefined, 0);
    return Array.from(buf, (v) => THREE.DataUtils.fromHalfFloat(v));
  }

  dispose() {
    this.ping.dispose();
    this.pong.dispose();
    for (const c of this.cascades) {
      c.outputs.forEach((o) => o.dispose());
      c.from.dispose();
      c.to.dispose();
      c.omega.dispose();
    }
    this.spectrumMat.dispose();
    this.fftMat.dispose();
    this.assembleMat.dispose();
  }
}
