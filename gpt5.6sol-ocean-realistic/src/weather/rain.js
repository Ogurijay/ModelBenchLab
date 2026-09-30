import * as THREE from 'three';

const FIELD_WIDTH = 150;
const FIELD_HEIGHT = 74;
const FIELD_DEPTH = 130;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function getRainDropCount(quality) {
  return quality === 'mobile' ? 5000 : 12000;
}

export function createRainLayout({ count, seed = 5602 }) {
  const random = mulberry32(seed);
  const positions = new Float32Array(count * 3);
  const attributes = new Float32Array(count * 4);

  for (let index = 0; index < count; index += 1) {
    const positionOffset = index * 3;
    const attributeOffset = index * 4;
    positions[positionOffset] = (random() - 0.5) * FIELD_WIDTH;
    positions[positionOffset + 1] = (random() - 0.5) * FIELD_HEIGHT;
    positions[positionOffset + 2] = (random() - 0.5) * FIELD_DEPTH;
    attributes[attributeOffset] = 0.72 + random() * 0.63;
    attributes[attributeOffset + 1] = random();
    attributes[attributeOffset + 2] = 0.55 + random() * 0.45;
    attributes[attributeOffset + 3] = 0.45 + random() * 0.55;
  }

  return { positions, attributes };
}

const RAIN_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform vec2 uWindDirection;
  attribute vec4 aRain;

  varying float vOpacity;
  varying float vLength;
  varying float vSlant;

  void main() {
    float fieldHeight = ${FIELD_HEIGHT.toFixed(1)};
    float fall = uTime * (35.0 + 25.0 * aRain.x);
    float wrappedY = mod(position.y + aRain.y * fieldHeight - fall + fieldHeight * 0.5, fieldHeight) - fieldHeight * 0.5;
    float travel = position.y - wrappedY;
    vec3 transformed = position;
    transformed.y = wrappedY;
    transformed.x += travel * uWindDirection.x * 0.12 + sin(aRain.y * 31.0 + uTime * 1.7) * 0.34;
    transformed.z += travel * uWindDirection.y * 0.06;

    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    float perspective = 390.0 / max(38.0, -viewPosition.z);
    gl_PointSize = clamp((14.0 + aRain.z * 24.0) * perspective, 4.0, 38.0);
    gl_Position = projectionMatrix * viewPosition;

    vOpacity = aRain.w * uIntensity;
    vLength = aRain.z;
    vSlant = clamp(uWindDirection.x * 0.6, -0.42, 0.42);
  }
`;

const RAIN_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  varying float vOpacity;
  varying float vLength;
  varying float vSlant;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    point.x += point.y * vSlant;
    float core = 1.0 - smoothstep(0.018, 0.075, abs(point.x));
    float lengthMask = 1.0 - smoothstep(0.28 + vLength * 0.1, 0.49, abs(point.y));
    float taper = mix(0.38, 1.0, smoothstep(-0.48, 0.3, point.y));
    float alpha = core * lengthMask * taper * vOpacity * 0.62;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export function createRainField({ quality = 'high', seed = 5602 } = {}) {
  const dropCount = getRainDropCount(quality);
  const layout = createRainLayout({ count: dropCount, seed });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(layout.positions, 3));
  geometry.setAttribute('aRain', new THREE.BufferAttribute(layout.attributes, 4));

  const material = new THREE.ShaderMaterial({
    name: 'GPT56SolRainField',
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uWindDirection: { value: new THREE.Vector2(0.82, 0.26) },
      uColor: { value: new THREE.Color(0xbfd7de) }
    },
    vertexShader: RAIN_VERTEX_SHADER,
    fragmentShader: RAIN_FRAGMENT_SHADER
  });

  const points = new THREE.Points(geometry, material);
  points.name = 'GPT 5.6 SOL GPU Rain';
  points.frustumCulled = false;
  points.renderOrder = 4;
  points.visible = false;

  return {
    points,
    geometry,
    material,
    dropCount,
    setIntensity(value) {
      const intensity = clamp01(value);
      material.uniforms.uIntensity.value = intensity;
      points.visible = intensity > 0.001;
    },
    update({ time, cameraPosition, windDirection = [0.82, 0.26] }) {
      material.uniforms.uTime.value = time;
      const windX = Array.isArray(windDirection) ? windDirection[0] : windDirection.x;
      const windZ = Array.isArray(windDirection) ? windDirection[1] : windDirection.y;
      material.uniforms.uWindDirection.value.set(windX, windZ);
      points.position.set(
        cameraPosition.x,
        cameraPosition.y + 12,
        cameraPosition.z - 26
      );
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
