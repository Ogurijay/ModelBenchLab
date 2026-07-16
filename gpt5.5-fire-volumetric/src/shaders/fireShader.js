export const fireVertexShader = /* glsl */ `
  varying vec3 vLocalPosition;

  void main() {
    vLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fireFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uIntensity;
  uniform float uTurbulence;
  uniform float uWind;
  uniform float uSteps;
  uniform vec3 uCameraLocal;
  uniform vec3 uHalfSize;
  uniform vec2 uResolution;

  varying vec3 vLocalPosition;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.52;
    mat3 rotation = mat3(
       0.00,  0.80,  0.60,
      -0.80,  0.36, -0.48,
      -0.60, -0.48,  0.64
    );
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise3(p);
      p = rotation * p * 2.03 + vec3(7.1, 3.4, 5.8);
      amplitude *= 0.5;
    }
    return value;
  }

  vec2 densityField(vec3 localPoint) {
    float y = (localPoint.y + uHalfSize.y) / (2.0 * uHalfSize.y);
    if (y < 0.0 || y > 1.0) return vec2(0.0);

    float t = uTime;
    vec3 flowPoint = vec3(localPoint.x * 1.35, y * 4.6 - t * 1.36, localPoint.z * 1.35);
    float coarse = fbm(flowPoint);
    float curlX = fbm(flowPoint * 0.73 + vec3(12.4, t * 0.16, -3.7));
    float curlZ = fbm(flowPoint * 0.81 + vec3(-5.1, t * 0.11, 9.2));

    vec2 center = vec2(
      uWind * y * y * 0.72,
      sin(t * 1.1 + y * 8.0) * 0.055 * y
    );
    center += (vec2(curlX, curlZ) - 0.5) * 0.62 * uTurbulence * y;

    // 高处的双向摆动让主焰自然分叉，而不是整团刚性摇摆。
    float fork = smoothstep(0.54, 0.90, y) * sin(y * 15.0 - t * 2.1);
    center.x += fork * 0.18 * uTurbulence;
    center.y -= fork * 0.08;

    vec2 normalizedXZ = (localPoint.xz - center) / uHalfSize.xz;
    float radial = length(normalizedXZ);
    float radius = (0.79 * pow(max(1.0 - y, 0.0), 0.68) + 0.035);
    radius *= 0.75 + coarse * (0.30 + uTurbulence * 0.13);
    radius *= mix(0.88, 1.12, clamp(uIntensity - 0.55, 0.0, 0.9) / 0.9);

    float edge = radius - radial;
    float lace = fbm(flowPoint * 1.82 + vec3(2.0, -t * 0.42, 7.0));
    float density = smoothstep(-0.055, 0.125, edge + (lace - 0.5) * 0.19 * uTurbulence);
    density *= smoothstep(0.015, 0.10, y);
    density *= 1.0 - smoothstep(0.83, 1.01, y + (coarse - 0.5) * 0.12);
    density *= 0.78 + 0.52 * lace;

    float core = clamp(1.0 - radial / max(radius, 0.06), 0.0, 1.0);
    float temperature = clamp(core * 0.78 + (1.0 - y) * 0.27 + coarse * 0.12, 0.0, 1.0);
    return vec2(density, temperature);
  }

  vec3 fireColor(float temperature, float y, float density) {
    vec3 outerColor = vec3(1.0, 0.055, 0.004);
    vec3 mainColor = vec3(1.0, 0.31, 0.018);
    vec3 hotColor = vec3(1.0, 0.93, 0.54);
    vec3 whiteCore = vec3(1.0, 1.0, 0.91);

    vec3 color = mix(outerColor, mainColor, smoothstep(0.05, 0.48, temperature));
    color = mix(color, hotColor, smoothstep(0.43, 0.82, temperature));
    color = mix(color, whiteCore, smoothstep(0.82, 1.0, temperature));

    float blueBase = (1.0 - smoothstep(0.03, 0.17, y)) * smoothstep(0.45, 0.95, temperature);
    color = mix(color, vec3(0.28, 0.53, 1.0), blueBase * 0.82);
    return color * (1.25 + density * 1.12);
  }

  vec2 intersectBox(vec3 rayOrigin, vec3 rayDirection) {
    vec3 safeDirection = sign(rayDirection) * max(abs(rayDirection), vec3(0.00001));
    vec3 invDirection = 1.0 / safeDirection;
    vec3 nearPlane = (-uHalfSize - rayOrigin) * invDirection;
    vec3 farPlane = ( uHalfSize - rayOrigin) * invDirection;
    vec3 tMin = min(nearPlane, farPlane);
    vec3 tMax = max(nearPlane, farPlane);
    return vec2(max(max(tMin.x, tMin.y), tMin.z), min(min(tMax.x, tMax.y), tMax.z));
  }

  void main() {
    vec3 rayOrigin = uCameraLocal;
    vec3 rayDirection = normalize(vLocalPosition - rayOrigin);
    vec2 hit = intersectBox(rayOrigin, rayDirection);
    float entry = max(hit.x, 0.0);
    float travel = hit.y - entry;
    if (travel <= 0.0) discard;

    float stepLength = travel / uSteps;
    float jitter = hash31(vec3(gl_FragCoord.xy / max(uResolution, vec2(1.0)), fract(uTime))) - 0.5;
    float distanceAlongRay = entry + stepLength * (0.5 + jitter * 0.55);
    vec4 accumulated = vec4(0.0);

    for (int i = 0; i < 96; i++) {
      if (float(i) >= uSteps || accumulated.a > 0.985) break;

      vec3 point = rayOrigin + rayDirection * distanceAlongRay;
      vec2 field = densityField(point);
      if (field.x > 0.002) {
        float y = (point.y + uHalfSize.y) / (2.0 * uHalfSize.y);
        float alpha = 1.0 - exp(-field.x * stepLength * 2.05 * uIntensity);
        vec3 emission = fireColor(field.y, y, field.x);
        float remaining = 1.0 - accumulated.a;
        accumulated.rgb += remaining * emission * alpha;
        accumulated.a += remaining * alpha;
      }
      distanceAlongRay += stepLength;
    }

    accumulated.rgb *= 1.06;
    if (accumulated.a < 0.004) discard;
    gl_FragColor = accumulated;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
