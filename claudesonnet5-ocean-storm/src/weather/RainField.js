import * as THREE from "three";

const INSTANCE_COUNT = 5200;

/**
 * GPU-driven rain: a fixed pool of streak billboards is parked in a disk
 * relative to the camera (recomputed each frame from a single uCameraPos
 * uniform, zero per-frame CPU work) and cycles its fall/respawn entirely in
 * the vertex shader. Density is a smooth cutoff over a per-instance hash,
 * so the draw call count never changes — only how many streaks render with
 * non-zero size — which keeps frame time stable as a storm ramps up.
 */
export class RainField {
  constructor() {
    const geometry = new THREE.InstancedBufferGeometry();
    const quad = new THREE.BufferGeometry();
    quad.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3)
    );
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));

    const seeds = new Float32Array(INSTANCE_COUNT);
    const randoms = new Float32Array(INSTANCE_COUNT * 2);
    for (let i = 0; i < INSTANCE_COUNT; i++) {
      seeds[i] = Math.random();
      randoms[i * 2] = Math.random();
      randoms[i * 2 + 1] = Math.random();
    }
    geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.setAttribute("aRandom", new THREE.InstancedBufferAttribute(randoms, 2));
    geometry.instanceCount = INSTANCE_COUNT;

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uCameraPos: { value: new THREE.Vector3() },
        uWindDir: { value: new THREE.Vector2(1, 0) },
        uWindSpeed: { value: 0 },
        uIntensity: { value: 0 },
        uRadius: { value: 55 },
        uTopY: { value: 34 },
        uBottomY: { value: -6 },
        uFallSpeed: { value: 26 },
        uStreakWidth: { value: 0.045 },
        uStreakLength: { value: 1.35 },
        uColor: { value: new THREE.Color(0xcfe0ee) },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        attribute vec2 aRandom;

        uniform float uTime;
        uniform vec3 uCameraPos;
        uniform vec2 uWindDir;
        uniform float uWindSpeed;
        uniform float uIntensity;
        uniform float uRadius;
        uniform float uTopY;
        uniform float uBottomY;
        uniform float uFallSpeed;
        uniform float uStreakWidth;
        uniform float uStreakLength;

        varying float vFade;
        varying float vAlong;

        float hash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.45);
          return fract(p.x * p.y);
        }

        void main() {
          float r1 = hash21(vec2(aSeed, 1.7));
          float r2 = hash21(vec2(aSeed, 4.1));
          float activeMask = step(hash21(vec2(aSeed, 9.3)), uIntensity);

          float speedVar = 0.7 + r1 * 0.7;
          float sizeVar = 0.65 + r2 * 0.6;
          float span = max(uTopY - uBottomY, 1.0);
          float cycleLen = span / (uFallSpeed * speedVar);
          float t = fract(uTime / cycleLen + aSeed);
          float y = mix(uTopY, uBottomY, t);

          float angle = aRandom.x * 6.28318530718;
          float rad = sqrt(aRandom.y) * uRadius;
          vec2 diskOffset = vec2(cos(angle), sin(angle)) * rad;
          vec2 windSkew = uWindDir * uWindSpeed * 0.1 * t;
          vec2 xz = uCameraPos.xz + diskOffset + windSkew;

          vec3 center = vec3(xz.x, uCameraPos.y + y, xz.y);
          vec3 velocity = vec3(uWindDir.x * uWindSpeed * 0.06, -uFallSpeed * speedVar, uWindDir.y * uWindSpeed * 0.06);
          vec3 up = normalize(velocity);
          vec3 viewDir = normalize(uCameraPos - center);
          vec3 right = normalize(cross(up, viewDir));
          if (length(right) < 0.001) right = vec3(1.0, 0.0, 0.0);

          float widthScale = uStreakWidth * sizeVar * activeMask;
          float lengthScale = uStreakLength * sizeVar * activeMask;
          vec3 worldPos = center + right * position.x * widthScale + up * (position.y - 0.5) * lengthScale;

          vFade = activeMask * smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.9, t);
          vAlong = position.y;

          gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vFade;
        varying float vAlong;

        void main() {
          float edge = smoothstep(0.0, 0.15, vAlong) * smoothstep(1.0, 0.85, vAlong);
          float alpha = vFade * edge * 0.55;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.material = material;
  }

  update(elapsed, camera, weather) {
    const u = this.material.uniforms;
    u.uTime.value = elapsed;
    u.uCameraPos.value.copy(camera.position);
    u.uWindDir.value.set(weather.windDir.x, weather.windDir.y);
    u.uWindSpeed.value = weather.windSpeed;
    u.uIntensity.value = weather.rainIntensity;
  }
}
