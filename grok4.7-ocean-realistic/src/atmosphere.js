/** 海天共用的大气梯度。数字只写在这里，着色器字符串由同一组常量生成。 */

const ZENITH_DAY = [0.15, 0.39, 0.75];
const HORIZON_DAY = [0.56, 0.71, 0.84];
const ZENITH_NIGHT = [0.005, 0.009, 0.024];
const HORIZON_NIGHT = [0.018, 0.028, 0.052];
const ZENITH_SUN = [0.19, 0.17, 0.40];
const HORIZON_SUN = [0.98, 0.38, 0.14];
const NOON = [1.0, 0.97, 0.92];
const WARM = [1.0, 0.62, 0.28];
const NIGHT_SUN = [0.45, 0.55, 0.85];

function mix(a, b, t) {
  const k = t;
  return a.map((v, i) => v + (b[i] - v) * k);
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function glslVec(v) {
  return `vec3(${v.map((n) => n.toFixed(4)).join(', ')})`;
}

/** 正午在默认镜头前方（-Z），早晨偏左，傍晚偏右。返回单位向量。 */
export function sunDirection(hour) {
  const wrapped = ((hour % 24) + 24) % 24;
  const elev = Math.sin(((wrapped - 6) / 12) * Math.PI);
  const el = elev * 54 * Math.PI / 180;
  const az = ((wrapped - 12) / 12) * Math.PI;
  const cosEl = Math.cos(el);
  const x = Math.sin(az) * cosEl;
  const y = Math.sin(el);
  const z = -Math.cos(az) * cosEl;
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

/** 线性光颜色，给方向光和着色器共用。 */
export function sunLightColor(sunY) {
  const day = smoothstep(-0.12, 0.25, sunY);
  const sunset = Math.exp(-Math.abs(sunY) * 2.4) * smoothstep(-0.22, 0.02, sunY);
  const base = mix(NIGHT_SUN, NOON, day);
  return mix(base, WARM, sunset * 0.85);
}

/** 与 skyColor() 里梯度段相同的结果，供雾色使用。rdY 是视线的 y。 */
export function atmosphereGradient(rdY, sunY) {
  const day = smoothstep(-0.12, 0.22, sunY);
  const sunset = Math.exp(-Math.abs(sunY) * 2.4) * smoothstep(-0.22, 0.02, sunY);
  let zenith = mix(ZENITH_NIGHT, ZENITH_DAY, day);
  let horizon = mix(HORIZON_NIGHT, HORIZON_DAY, day);
  zenith = mix(zenith, ZENITH_SUN, sunset * 0.55);
  horizon = mix(horizon, HORIZON_SUN, sunset * 0.82);
  const g = Math.pow(Math.min(1, Math.max(0, rdY * 0.85 + 0.08)), 0.42);
  let col = mix(horizon, zenith, Math.min(1, Math.max(0, g)));
  const below = Math.min(1, Math.max(0, -rdY * 2));
  col = col.map((v) => v * (1 - below * 0.65));
  return col;
}

export function dayFactor(sunY) {
  return smoothstep(-0.08, 0.28, sunY);
}

/** 片段着色器函数。依赖 uniform: uSunDir, uSunColor, uCloud, uTime, uWindDir。 */
export function skyColorGlsl() {
  return /* glsl */ `
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = mat2(1.62, 1.18, -1.18, 1.62) * p + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return v;
}
vec3 skyColor(vec3 rd) {
  float elev = uSunDir.y;
  float day = smoothstep(-0.12, 0.22, elev);
  float sunset = exp(-abs(elev) * 2.4) * smoothstep(-0.22, 0.02, elev);
  vec3 zenith = mix(${glslVec(ZENITH_NIGHT)}, ${glslVec(ZENITH_DAY)}, day);
  vec3 horizon = mix(${glslVec(HORIZON_NIGHT)}, ${glslVec(HORIZON_DAY)}, day);
  zenith = mix(zenith, ${glslVec(ZENITH_SUN)}, sunset * 0.55);
  horizon = mix(horizon, ${glslVec(HORIZON_SUN)}, sunset * 0.82);
  float g = pow(sat(rd.y * 0.85 + 0.08), 0.42);
  vec3 col = mix(horizon, zenith, sat(g));
  col = mix(col, col * 0.35, sat(-rd.y * 2.0));

  float mu = dot(rd, uSunDir);
  float disc = smoothstep(0.99915, 0.99972, mu) * smoothstep(-0.06, 0.04, elev);
  col += uSunColor * disc * 7.0;
  float mie = pow(sat(mu), 6.0) * 0.16 + pow(sat(mu), 48.0) * 0.32 + pow(sat(mu), 420.0) * 0.7;
  col += uSunColor * mie * sat(elev * 3.0 + 0.2);

  vec3 moonDir = normalize(vec3(-uSunDir.x, abs(uSunDir.y) * 0.55 + 0.28, -uSunDir.z));
  float md = dot(rd, moonDir);
  float night = sat(-elev * 2.4);
  col += vec3(0.78, 0.84, 0.95) * smoothstep(0.99945, 0.99982, md) * night * 3.2;
  col += vec3(0.40, 0.50, 0.75) * pow(sat(md), 28.0) * night * 0.18;

  if (rd.y > 0.0) {
    float hy = max(rd.y, 0.085);
    vec2 uv = rd.xz / hy * 0.26 + uWindDir * uTime * 0.006;
    float n = fbm(uv);
    float dens = smoothstep(0.64 - uCloud * 0.46, 0.9, n);
    float shade = fbm(uv + vec2(0.55, -0.28));
    vec3 cloudCol = mix(vec3(0.32, 0.35, 0.40), vec3(0.96, 0.95, 0.92), 1.0 - shade * 0.72);
    cloudCol = mix(cloudCol, uSunColor, sat(mu) * 0.42);
    cloudCol *= 0.28 + 0.72 * day;
    float silver = pow(sat(mu), 7.0) * dens;
    col = mix(col, cloudCol, dens * sat(rd.y * 5.0) * 0.94);
    col += uSunColor * silver * 0.22 * day;
  }
  return col;
}
`;
}
