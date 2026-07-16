import * as THREE from 'three';

const emberVertex = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  varying float vLife;
  uniform float uPixelRatio;

  void main() {
    vLife = aLife;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = max(1.0, aSize * uPixelRatio * (320.0 / max(-viewPosition.z, 0.1)));
  }
`;

const emberFragment = /* glsl */ `
  precision highp float;
  varying float vLife;

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float radial = length(p) * 2.0;
    float alpha = smoothstep(1.0, 0.1, radial) * smoothstep(0.0, 0.18, vLife);
    vec3 color = mix(vec3(1.0, 0.15, 0.01), vec3(1.0, 0.90, 0.42), vLife);
    gl_FragColor = vec4(color * (1.4 + vLife), alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const smokeVertex = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  varying float vLife;
  uniform float uPixelRatio;

  void main() {
    vLife = aLife;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = aSize * uPixelRatio * (260.0 / max(-viewPosition.z, 0.1));
  }
`;

const smokeFragment = /* glsl */ `
  precision highp float;
  varying float vLife;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float radial = length(p) * 2.0;
    float grain = hash21(floor(gl_PointCoord * 18.0));
    float body = smoothstep(1.0, 0.18 + grain * 0.12, radial);
    float fade = sin(clamp(vLife, 0.0, 1.0) * 3.14159265);
    float alpha = body * fade * (0.105 + grain * 0.045);
    vec3 color = mix(vec3(0.29, 0.26, 0.22), vec3(0.095, 0.09, 0.082), vLife);
    gl_FragColor = vec4(color, alpha);
  }
`;

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, 1 | seed);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function createPointMaterial(vertexShader, fragmentShader, pixelRatio) {
  return new THREE.ShaderMaterial({
    uniforms: { uPixelRatio: { value: pixelRatio } },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
  });
}

export class EmberSystem extends THREE.Points {
  constructor(pixelRatio, count = 128) {
    const positions = new Float32Array(count * 3);
    const lives = new Float32Array(count);
    const sizes = new Float32Array(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(lives, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    super(geometry, createPointMaterial(emberVertex, emberFragment, pixelRatio));
    this.name = 'EmberSystem';
    this.count = count;
    this.random = mulberry32(0x51f15e);
    this.velocity = Array.from({ length: count }, () => new THREE.Vector3());
    this.age = new Float32Array(count);
    this.duration = new Float32Array(count);
    this.seed = new Float32Array(count);
    this.wind = 0.18;
    this.intensity = 1;
    this.frustumCulled = false;
    this.renderOrder = 5;

    for (let i = 0; i < count; i++) this.resetParticle(i, true);
  }

  resetParticle(index, scatter = false) {
    const positions = this.geometry.attributes.position.array;
    const sizes = this.geometry.attributes.aSize.array;
    const angle = this.random() * Math.PI * 2;
    const radius = 0.14 + this.random() * 0.5;
    const offset = index * 3;
    positions[offset] = Math.cos(angle) * radius;
    positions[offset + 1] = 0.88 + this.random() * 0.28;
    positions[offset + 2] = Math.sin(angle) * radius;

    this.duration[index] = 1.05 + this.random() * 2.2;
    this.age[index] = scatter ? this.random() * this.duration[index] : 0;
    this.seed[index] = this.random() * Math.PI * 2;
    sizes[index] = 0.035 + this.random() * 0.075;
    this.velocity[index].set(
      (this.random() - 0.5) * 0.34,
      0.72 + this.random() * 1.5,
      (this.random() - 0.5) * 0.34,
    );

    if (scatter) {
      const prewarm = this.age[index];
      positions[offset] += this.velocity[index].x * prewarm + this.wind * prewarm * 0.22;
      positions[offset + 1] += this.velocity[index].y * prewarm;
      positions[offset + 2] += this.velocity[index].z * prewarm;
    }
  }

  update(dt, time) {
    const positions = this.geometry.attributes.position.array;
    const lives = this.geometry.attributes.aLife.array;
    for (let i = 0; i < this.count; i++) {
      this.age[i] += dt * (0.74 + this.intensity * 0.36);
      if (this.age[i] >= this.duration[i]) this.resetParticle(i);

      const offset = i * 3;
      const life = this.age[i] / this.duration[i];
      const velocity = this.velocity[i];
      positions[offset] += (velocity.x + this.wind * (0.24 + life * 0.72)) * dt;
      positions[offset + 1] += velocity.y * dt;
      positions[offset + 2] += (velocity.z + Math.sin(time * 2.3 + this.seed[i]) * 0.08) * dt;
      velocity.y += 0.13 * dt;
      lives[i] = 1 - life;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
  }

  setParameters({ wind, intensity, pixelRatio }) {
    if (wind !== undefined) this.wind = wind;
    if (intensity !== undefined) this.intensity = intensity;
    if (pixelRatio !== undefined) this.material.uniforms.uPixelRatio.value = pixelRatio;
  }
}

export class SmokeSystem extends THREE.Points {
  constructor(pixelRatio, count = 44) {
    const positions = new Float32Array(count * 3);
    const lives = new Float32Array(count);
    const sizes = new Float32Array(count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(lives, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const material = createPointMaterial(smokeVertex, smokeFragment, pixelRatio);
    material.blending = THREE.NormalBlending;
    super(geometry, material);

    this.name = 'SmokeSystem';
    this.count = count;
    this.random = mulberry32(0x5a0c3);
    this.phase = new Float32Array(count);
    this.speed = new Float32Array(count);
    this.seed = new Float32Array(count);
    this.origin = new Float32Array(count * 2);
    this.wind = 0.18;
    this.intensity = 1;
    this.frustumCulled = false;
    this.renderOrder = 3;

    for (let i = 0; i < count; i++) this.resetParticle(i, this.random());
  }

  resetParticle(index, initialPhase = 0) {
    const sizes = this.geometry.attributes.aSize.array;
    const originOffset = index * 2;
    this.phase[index] = initialPhase;
    this.speed[index] = 0.085 + this.random() * 0.075;
    this.seed[index] = this.random() * Math.PI * 2;
    this.origin[originOffset] = (this.random() - 0.5) * 0.44;
    this.origin[originOffset + 1] = (this.random() - 0.5) * 0.44;
    sizes[index] = 0.72 + this.random() * 1.0;
  }

  update(dt, time) {
    const positions = this.geometry.attributes.position.array;
    const lives = this.geometry.attributes.aLife.array;
    for (let i = 0; i < this.count; i++) {
      this.phase[i] += this.speed[i] * dt * (0.72 + this.intensity * 0.28);
      if (this.phase[i] >= 1) this.resetParticle(i);
      const phase = this.phase[i];
      const offset = i * 3;
      const originOffset = i * 2;
      positions[offset] = this.origin[originOffset]
        + this.wind * phase * phase * 2.6
        + Math.sin(time * 0.43 + this.seed[i] + phase * 5.0) * phase * 0.32;
      positions[offset + 1] = 2.0 + phase * 5.4;
      positions[offset + 2] = this.origin[originOffset + 1]
        + Math.cos(time * 0.37 + this.seed[i]) * phase * 0.28;
      lives[i] = phase;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
  }

  setParameters({ wind, intensity, pixelRatio }) {
    if (wind !== undefined) this.wind = wind;
    if (intensity !== undefined) this.intensity = intensity;
    if (pixelRatio !== undefined) this.material.uniforms.uPixelRatio.value = pixelRatio;
  }
}
