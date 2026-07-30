// 运河 / 河道水面:自定义着色器。三组正弦波叠出法线,菲涅尔混合天空色与深水色,
// 加一道太阳高光;不做实时反射(城市体量大,反射通道太贵),靠色彩与高光把水"演"活。
import * as THREE from 'three';
import { merge } from '../core/geom.js';

const VERT = /* glsl */`
  varying vec3 vWorld;
  varying vec2 vUvW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vUvW = wp.xz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */`
  precision highp float;
  varying vec3 vWorld;
  varying vec2 vUvW;
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform float uNight;

  vec3 waveNormal(vec2 p, float t) {
    vec3 n = vec3(0.0, 1.0, 0.0);
    vec2 dirs[4];
    dirs[0] = normalize(vec2( 1.0,  0.35));
    dirs[1] = normalize(vec2(-0.6,  1.0));
    dirs[2] = normalize(vec2( 0.2, -1.0));
    dirs[3] = normalize(vec2(-1.0, -0.25));
    float freq = 1.15;
    float amp = 0.085;
    for (int i = 0; i < 4; i++) {
      vec2 d = dirs[i];
      float ph = dot(p, d) * freq + t * (1.0 + float(i) * 0.31);
      float dx = cos(ph) * amp * d.x;
      float dz = cos(ph) * amp * d.y;
      n.x -= dx; n.z -= dz;
      freq *= 1.85; amp *= 0.62;
    }
    return normalize(n);
  }

  void main() {
    vec3 N = waveNormal(vUvW, uTime * 1.3);
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    fres = mix(0.06, 1.0, fres);

    vec3 L = normalize(uSunDir);
    vec3 H = normalize(L + V);
    float spec = pow(max(dot(N, H), 0.0), 220.0) * 2.6;
    float glint = pow(max(dot(N, H), 0.0), 26.0) * 0.22;

    float depthMix = smoothstep(0.0, 1.0, fres);
    vec3 body = mix(uDeep, uShallow, 0.35 + 0.3 * N.y);
    vec3 col = mix(body, uSkyColor, depthMix * 0.82);
    col += uSunColor * (spec + glint) * (1.0 - uNight * 0.8);
    col = mix(col, col * 0.35 + vec3(0.02, 0.05, 0.09), uNight * 0.75);

    gl_FragColor = vec4(col, mix(0.86, 0.97, depthMix));
    // 必须和场景其余部分一样过一遍色调映射,否则夜里水面会亮成一条发光带
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createWater(rects, y, extra = []) {
  const geos = [];
  for (const r of [...rects, ...extra]) {
    const w = r[2] - r[0], d = r[3] - r[1];
    const g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 8)), Math.max(1, Math.round(d / 8)));
    g.rotateX(-Math.PI / 2);
    g.translate((r[0] + r[2]) / 2, 0, (r[1] + r[3]) / 2);
    geos.push(g);
  }
  const geo = merge(geos);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3) },
      uSunColor: { value: new THREE.Color(0xfff0d0) },
      uSkyColor: { value: new THREE.Color(0x8fb6e8) },
      uDeep: { value: new THREE.Color(0x123243) },
      uShallow: { value: new THREE.Color(0x2f7f96) },
      uNight: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = y;
  mesh.renderOrder = 2;
  mesh.name = 'water';

  return {
    mesh,
    material,
    update(t, sky) {
      material.uniforms.uTime.value = t;
      if (sky) {
        material.uniforms.uSunDir.value.copy(sky.sunDir);
        material.uniforms.uSunColor.value.copy(sky.sunColor);
        material.uniforms.uSkyColor.value.copy(sky.horizonColor);
        material.uniforms.uNight.value = sky.night;
      }
    },
  };
}

/** 瀑布:沿 Y 滚动的半透明面片(城堡台地两侧)。 */
export function createFalls(specs) {
  const geos = [];
  for (const s of specs) {
    const g = new THREE.PlaneGeometry(s.w, s.h, 1, 6);
    g.translate(0, -s.h / 2, 0);
    g.rotateY(s.ry || 0);
    g.translate(s.x, s.y, s.z);
    geos.push(g);
  }
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz;
        gl_Position = projectionMatrix*viewMatrix*wp; }
    `,
    fragmentShader: `
      varying vec2 vUv; varying vec3 vW; uniform float uTime; uniform float uNight;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1)))*43758.5453); }
      void main(){
        float t = uTime * 1.6;
        float streak = h(vec2(floor(vUv.x*46.0), 0.0));
        float flow = fract(vUv.y*1.3 + t*(0.6+streak*0.7));
        float a = 0.30 + 0.5*pow(flow, 2.0) + 0.2*streak;
        a *= smoothstep(0.0, 0.12, vUv.y);
        vec3 c = mix(vec3(0.62,0.78,0.86), vec3(1.0), pow(flow,3.0));
        c *= mix(1.0, 0.35, uNight);
        gl_FragColor = vec4(c, a*0.72);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(merge(geos), material);
  mesh.renderOrder = 3;
  return { mesh, material, update(t, sky) { material.uniforms.uTime.value = t; if (sky) material.uniforms.uNight.value = sky.night; } };
}
