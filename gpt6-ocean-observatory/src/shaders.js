export const atmosphere = /* glsl */`
uniform vec3 uSunDirection;
uniform float uCloud;
uniform float uTime;
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  float n = 0.5 * noise(p);
  p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.07;
  n += 0.25 * noise(p);
  p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.03;
  n += 0.125 * noise(p);
  return n / 0.875;
}
vec3 skyColor(vec3 direction, float detailed) {
  float y = max(direction.y, 0.0);
  float sunDot = max(dot(direction, uSunDirection), 0.0);
  float dusk = 1.0 - smoothstep(0.02, 0.48, uSunDirection.y);
  vec3 zenith = mix(vec3(0.055, 0.17, 0.29), vec3(0.065, 0.15, 0.25), dusk * 0.5);
  vec3 horizon = mix(vec3(0.42, 0.60, 0.65), vec3(0.70, 0.51, 0.31), dusk * pow(sunDot, 3.0));
  vec3 color = mix(horizon, zenith, pow(y, 0.38));
  color = mix(color, vec3(0.075, 0.12, 0.16) + y * 0.025, uCloud * 0.78);
  vec2 cloudUV = direction.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.006, 0.0);
  float clouds = fbm(cloudUV);
  float cover = smoothstep(0.61 - uCloud * 0.32, 0.80 - uCloud * 0.27, clouds);
  cover *= smoothstep(0.005, 0.18, y) * (0.35 + uCloud * 0.5);
  vec3 cloudColor = mix(vec3(0.70, 0.76, 0.74), vec3(0.16, 0.22, 0.26), uCloud);
  color = mix(color, cloudColor, cover * detailed);
  float glow = pow(sunDot, 48.0) * 0.4 + pow(sunDot, 420.0) * 0.7;
  float disc = smoothstep(0.99978, 0.99991, sunDot);
  vec3 sunlight = mix(vec3(1.0, 0.94, 0.76), vec3(1.0, 0.63, 0.30), dusk);
  color += sunlight * (glow + disc * 5.0) * (1.0 - uCloud * 0.86);
  return max(color, vec3(0.0));
}
`;

export const waveFunctions = /* glsl */`
uniform vec4 uWaves[8]; // direction X, direction Z, wavenumber, amplitude
uniform float uPhases[8];
struct Surface { vec3 position; vec3 normal; float compression; };
Surface surface(vec2 base) {
  vec3 p = vec3(base.x, 0.0, base.y);
  vec3 tangent = vec3(1, 0, 0), binormal = vec3(0, 0, 1);
  for (int i = 0; i < 8; i++) {
    vec4 w = uWaves[i];
    float phase = w.z * dot(w.xy, base) - sqrt(9.81 * w.z) * uTime + uPhases[i];
    float s = sin(phase), c = cos(phase), qa = w.w * 0.62;
    p.xz += qa * w.xy * c;
    p.y += w.w * s;
    tangent += vec3(-qa*w.z*w.x*w.x*s, w.w*w.z*w.x*c, -qa*w.z*w.x*w.y*s);
    binormal += vec3(-qa*w.z*w.x*w.y*s, w.w*w.z*w.y*c, -qa*w.z*w.y*w.y*s);
  }
  Surface result;
  result.position = p;
  result.normal = normalize(cross(binormal, tangent));
  result.compression = 1.0 - (tangent.x * binormal.z - tangent.z * binormal.x);
  return result;
}
`;

export const oceanVertex = /* glsl */`
uniform float uTime;
uniform vec2 uCenter;
varying vec3 vWorld;
varying vec2 vBase;
${waveFunctions}
void main() {
  vBase = position.xz + uCenter;
  Surface s = surface(vBase);
  vWorld = s.position;
  gl_Position = projectionMatrix * viewMatrix * vec4(s.position, 1.0);
}
`;

export const oceanFragment = /* glsl */`
uniform float uWind;
uniform float uHeight;
varying vec3 vWorld;
varying vec2 vBase;
${atmosphere}
${waveFunctions}
void main() {
  Surface s = surface(vBase);
  vec3 viewDirection = normalize(cameraPosition - vWorld);
  float distanceToCamera = length(cameraPosition - vWorld);
  // Analytic gravity waves plus distance-filtered capillary normals.
  vec2 ripples = vec2(0.0);
  float amplitude = 0.020 + uWind * 0.0023;
  float frequency = 3.1;
  float footprint = max(length(dFdx(vBase)), length(dFdy(vBase)));
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 direction = vec2(sin(fi * 2.399 + 0.8), cos(fi * 2.399 + 0.8));
    float filterWeight = 1.0 - smoothstep(0.6, 2.4, frequency * footprint);
    float phase = dot(vBase, direction) * frequency - uTime * (1.7 + fi * 0.55);
    ripples += direction * cos(phase + sin(phase * 0.37) * 0.7) * amplitude * filterWeight;
    amplitude *= 0.64; frequency *= 1.9;
  }
  vec3 n = normalize(s.normal + vec3(ripples.x, 0.0, ripples.y));
  float facing = max(dot(n, viewDirection), 0.0);
  float fresnel = 0.0204 + 0.9796 * pow(1.0 - facing, 5.0);
  vec3 reflected = reflect(-viewDirection, n);
  reflected.y = abs(reflected.y);
  vec3 reflection = skyColor(reflected, 0.45);
  vec3 deep = vec3(0.008, 0.045, 0.065);
  vec3 body = deep + vec3(0.009, 0.078, 0.086) * (0.45 + max(n.y, 0.0) * 0.55);
  float scattering = pow(max(dot(viewDirection, -uSunDirection), 0.0), 3.0);
  float peak = smoothstep(-uHeight * 0.1, uHeight * 0.65, s.position.y);
  body += vec3(0.012, 0.11, 0.085) * peak * (0.35 + scattering) * (1.0 - uCloud * 0.7);
  vec3 color = mix(body, reflection, fresnel);
  vec3 halfVector = normalize(viewDirection + uSunDirection);
  float specular = pow(max(dot(n, halfVector), 0.0), 320.0);
  float glint = pow(max(dot(n, halfVector), 0.0), 36.0) * 0.10;
  vec3 sunColor = mix(vec3(1.0, 0.88, 0.63), vec3(1.0, 0.63, 0.29), 1.0 - smoothstep(0.05, 0.4, uSunDirection.y));
  color += sunColor * (specular * 1.6 + glint) * (1.0 - uCloud * 0.9);
  float foamNoise = fbm(vBase * 1.4 + vec2(uTime * 0.13, 0.0));
  float foam = smoothstep(0.17, 0.34, s.compression) * smoothstep(0.35, 0.66, foamNoise);
  foam *= smoothstep(3.0, 17.0, uWind) * (1.0 - smoothstep(180.0, 700.0, distanceToCamera));
  color = mix(color, vec3(0.66, 0.77, 0.74) * (1.0 - uCloud * 0.36), foam * 0.72);
  float fog = 1.0 - exp(-distanceToCamera * (0.00028 + uCloud * 0.00055));
  color = mix(color, skyColor(normalize(vec3(viewDirection.x * -1.0, 0.012, viewDirection.z * -1.0)), 0.0) * 0.85, fog);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const skyVertex = /* glsl */`
varying vec3 vDirection;
void main() {
  vDirection = position;
  vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const skyFragment = /* glsl */`
varying vec3 vDirection;
${atmosphere}
void main() {
  gl_FragColor = vec4(skyColor(normalize(vDirection), 1.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
