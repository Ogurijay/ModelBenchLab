import * as THREE from 'three';

export const WEATHER_FIXED_STEP = 1 / 60;
export const WEATHER_KINDS = Object.freeze(['clear', 'cloudy', 'fog', 'rain', 'storm', 'snow']);

export const WEATHER_PRESETS = Object.freeze({
  clear: Object.freeze({ cloudCover: 0.12, fogDensity: 0.00008, rain: 0, snow: 0, wetness: 0, snowCover: 0, lightning: 0, lightLevel: 1 }),
  cloudy: Object.freeze({ cloudCover: 0.68, fogDensity: 0.00022, rain: 0, snow: 0, wetness: 0.08, snowCover: 0, lightning: 0, lightLevel: 0.68 }),
  fog: Object.freeze({ cloudCover: 0.78, fogDensity: 0.0032, rain: 0, snow: 0, wetness: 0.18, snowCover: 0, lightning: 0, lightLevel: 0.52 }),
  rain: Object.freeze({ cloudCover: 0.9, fogDensity: 0.00075, rain: 0.88, snow: 0, wetness: 1, snowCover: 0, lightning: 0, lightLevel: 0.48 }),
  storm: Object.freeze({ cloudCover: 1, fogDensity: 0.00115, rain: 1, snow: 0, wetness: 1, snowCover: 0, lightning: 1, lightLevel: 0.28 }),
  snow: Object.freeze({ cloudCover: 0.88, fogDensity: 0.00145, rain: 0, snow: 1, wetness: 0.28, snowCover: 1, lightning: 0, lightLevel: 0.66 }),
});

const PARAMETER_KEYS = Object.keys(WEATHER_PRESETS.clear);

function seedToUint(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  let hash = 2166136261;
  for (const character of String(seed ?? 1337)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seedToUint(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

export function normalizeWeatherKind(kind) {
  const normalized = String(kind ?? '').trim().toLowerCase();
  if (!WEATHER_KINDS.includes(normalized)) {
    throw new RangeError(`Unknown weather preset: ${kind}`);
  }
  return normalized;
}

export function clampTransitionDuration(duration = 6) {
  return THREE.MathUtils.clamp(Number(duration) || 6, 4, 8);
}

export function smoothTransitionAlpha(elapsed, duration) {
  const raw = THREE.MathUtils.clamp((Number(elapsed) || 0) / Math.max(1e-6, Number(duration) || 1), 0, 1);
  return raw * raw * (3 - 2 * raw);
}

export function thunderDelaySeconds(distanceMeters, soundSpeed = 343) {
  return Math.max(0, Number(distanceMeters) || 0) / Math.max(1e-6, Number(soundSpeed) || 343);
}

export function computePrecipitationVelocity(kind, wind = { x: 0, z: 0 }) {
  const normalized = kind === 'snow' ? 'snow' : 'rain';
  const factor = normalized === 'snow' ? 1.35 : 0.62;
  return {
    x: (Number(wind.x) || 0) * factor,
    y: normalized === 'snow' ? -7.5 : -58,
    z: (Number(wind.z) || 0) * factor,
  };
}

function targetPosition(target, output = new THREE.Vector3()) {
  if (!target) return output.set(0, 220, 0);
  if (typeof target.getWorldPosition === 'function') target.getWorldPosition(output);
  else if (target.position) output.set(Number(target.position.x) || 0, Number(target.position.y) || 0, Number(target.position.z) || 0);
  else output.set(Number(target.x) || 0, Number(target.y) || 0, Number(target.z) || 0);
  const height = Number(target.userData?.lightningHeight);
  if (Number.isFinite(height)) output.y += height;
  return output;
}

/** 从候选对象中选择世界坐标最高者；输入可以是 Object3D、数组或返回候选的函数。 */
export function selectHighestTarget(candidates) {
  const resolved = typeof candidates === 'function' ? candidates() : candidates;
  const list = Array.isArray(resolved) ? resolved : resolved ? [resolved] : [];
  const position = new THREE.Vector3();
  let selected = null;
  let highest = -Infinity;
  for (const candidate of list) {
    const y = targetPosition(candidate, position).y;
    if (y > highest) {
      highest = y;
      selected = candidate;
    }
  }
  return selected;
}

function collectMaterials(input, output = new Set()) {
  if (!input) return output;
  if (input.isMaterial) output.add(input);
  else if (input.material) collectMaterials(input.material, output);
  else if (Array.isArray(input) || input instanceof Set) {
    for (const value of input) collectMaterials(value, output);
  } else if (input instanceof Map) {
    for (const value of input.values()) collectMaterials(value, output);
  }
  return output;
}

function patchSnowMaterial(material, uniform) {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile?.call(material, shader, renderer);
    shader.uniforms.uBenchSnowCover = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying vec3 vBenchWorldNormal;\nvoid main() {')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvBenchWorldNormal = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uBenchSnowCover;\nvarying vec3 vBenchWorldNormal;\nvoid main() {')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat benchSnowFacing = smoothstep(0.48, 0.9, normalize(vBenchWorldNormal).y);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.91, 0.94, 0.98), uBenchSnowCover * benchSnowFacing);',
      );
  };
  material.customProgramCacheKey = () => `${previousKey?.call(material) ?? ''}|bench-snow-v1`;
  material.needsUpdate = true;
  return () => {
    material.onBeforeCompile = previousCompile;
    material.customProgramCacheKey = previousKey;
    material.needsUpdate = true;
  };
}

function createPrecipitation(random, count, kind) {
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * 360;
    positions[index * 3 + 1] = random() * 230;
    positions[index * 3 + 2] = (random() - 0.5) * 360;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: kind === 'snow' ? 0xf7fbff : 0x9ec9e5,
    size: kind === 'snow' ? 2.25 : 0.75,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: kind === 'snow' ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.name = kind === 'snow' ? 'SnowParticles' : 'RainParticles';
  points.userData.benchRole = kind === 'snow' ? 'snow-particles' : 'rain-particles';
  points.frustumCulled = false;
  return { points, geometry, material, positions, count, kind };
}

function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
    else if (object.material) materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

/**
 * 六态天气系统。所有过渡和随机事件都由固定步长推进，渲染帧率不会改变结果。
 */
export function createWeatherSystem(scene, camera, {
  seed = 1337,
  roadMaterial,
  buildingMaterials = [],
  snowSurfaces = [],
  highestTarget = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'WeatherSystem';
  group.userData.benchRole = 'weather-system';
  scene?.add?.(group);

  const previousFog = scene?.fog ?? null;
  const weatherFog = new THREE.FogExp2(0xaeb9c3, WEATHER_PRESETS.clear.fogDensity);
  if (scene) scene.fog = weatherFog;

  let currentSeed = seed;
  let random = mulberry32(seed);
  const rain = createPrecipitation(random, 1800, 'rain');
  const snow = createPrecipitation(random, 1300, 'snow');
  group.add(rain.points, snow.points);

  const cloudGeometry = new THREE.IcosahedronGeometry(24, 1);
  const cloudMaterial = new THREE.MeshLambertMaterial({
    color: 0xd3d8dd,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  });
  const cloudCount = 42;
  const cloudLayer = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, cloudCount);
  cloudLayer.name = 'VolumetricCloudLayer';
  cloudLayer.userData.benchRole = 'volumetric-clouds';
  const cloudDummy = new THREE.Object3D();
  for (let index = 0; index < cloudCount; index += 1) {
    cloudDummy.position.set((random() - 0.5) * 1400, 205 + random() * 120, (random() - 0.5) * 1600);
    cloudDummy.scale.set(1.4 + random() * 2.8, 0.55 + random() * 0.75, 1.1 + random() * 2.4);
    cloudDummy.rotation.set(random() * 0.2, random() * Math.PI * 2, random() * 0.12);
    cloudDummy.updateMatrix();
    cloudLayer.setMatrixAt(index, cloudDummy.matrix);
  }
  cloudLayer.instanceMatrix.needsUpdate = true;
  group.add(cloudLayer);

  const lightningGeometry = new THREE.BufferGeometry();
  const lightningMaterial = new THREE.LineBasicMaterial({
    color: 0xdde8ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lightning = new THREE.Line(lightningGeometry, lightningMaterial);
  lightning.name = 'ProceduralLightning';
  lightning.userData.benchRole = 'lightning';
  lightning.visible = false;
  group.add(lightning);
  const flashLight = new THREE.PointLight(0xbfd5ff, 0, 950, 1.35);
  group.add(flashLight);

  const roadMaterials = [...collectMaterials(roadMaterial)];
  const snowMaterials = [...collectMaterials([buildingMaterials, snowSurfaces])];
  const roadBase = roadMaterials.map((material) => ({
    material,
    roughness: Number.isFinite(material.roughness) ? material.roughness : null,
    metalness: Number.isFinite(material.metalness) ? material.metalness : null,
    envMapIntensity: Number.isFinite(material.envMapIntensity) ? material.envMapIntensity : null,
  }));
  const snowUniform = { value: 0 };
  const restoreSnowPatches = snowMaterials.map((material) => patchSnowMaterial(material, snowUniform));

  const current = { ...WEATHER_PRESETS.clear };
  let source = { ...current };
  let target = { ...current };
  let currentKind = 'clear';
  let targetKind = 'clear';
  let transitionElapsed = 0;
  let transitionDuration = 6;
  let transitioning = false;
  const wind = new THREE.Vector2(3, 0.8);
  let accumulator = 0;
  let elapsed = 0;
  let cloudOffsetX = 0;
  let cloudOffsetZ = 0;
  let lightningTimer = 2.2;
  let lightningLife = 0;
  let lightningCount = 0;
  let lastStrike = null;
  const pendingThunder = [];
  let audioContext = null;
  let audioUnlocked = false;
  const activeAudio = new Set();

  function setWeather(kind, duration = 6) {
    const normalized = normalizeWeatherKind(kind);
    source = { ...current };
    target = { ...WEATHER_PRESETS[normalized] };
    targetKind = normalized;
    transitionElapsed = 0;
    transitionDuration = clampTransitionDuration(duration);
    transitioning = true;
    if (normalized === 'storm') lightningTimer = Math.min(lightningTimer, 1.25 + random() * 1.5);
    return transitionDuration;
  }

  function setWind(x = 0, z = 0) {
    wind.set(THREE.MathUtils.clamp(Number(x) || 0, -35, 35), THREE.MathUtils.clamp(Number(z) || 0, -35, 35));
  }

  function updateMaterialResponse() {
    for (const base of roadBase) {
      if (base.roughness !== null) base.material.roughness = THREE.MathUtils.lerp(base.roughness, 0.13, current.wetness);
      if (base.metalness !== null) base.material.metalness = THREE.MathUtils.lerp(base.metalness, Math.max(base.metalness, 0.12), current.wetness);
      if (base.envMapIntensity !== null) base.material.envMapIntensity = THREE.MathUtils.lerp(base.envMapIntensity, base.envMapIntensity + 0.9, current.wetness);
    }
    snowUniform.value = current.snowCover;
    weatherFog.density = current.fogDensity;
    weatherFog.color.set(currentKind === 'storm' || targetKind === 'storm' ? 0x6f7b88 : 0xaeb9c3);
    rain.material.opacity = current.rain * 0.72;
    rain.points.visible = current.rain > 0.002;
    snow.material.opacity = current.snow * 0.88;
    snow.points.visible = current.snow > 0.002;
    cloudMaterial.opacity = 0.03 + current.cloudCover * 0.62;
    cloudMaterial.color.setHSL(0.58, 0.1, THREE.MathUtils.lerp(0.82, 0.38, 1 - current.lightLevel));
    group.userData.wetness = current.wetness;
    group.userData.snowCover = current.snowCover;
    group.userData.cloudCover = current.cloudCover;
  }

  function movePrecipitation(system, dt) {
    const intensity = system.kind === 'rain' ? current.rain : current.snow;
    if (intensity <= 0.001) return;
    const velocity = computePrecipitationVelocity(system.kind, wind);
    const positions = system.positions;
    for (let index = 0; index < system.count; index += 1) {
      const offset = index * 3;
      positions[offset] += velocity.x * dt;
      positions[offset + 1] += velocity.y * dt;
      positions[offset + 2] += velocity.z * dt;
      if (positions[offset + 1] < 0) positions[offset + 1] += 230;
      positions[offset] = positiveModulo(positions[offset] + 180, 360) - 180;
      positions[offset + 2] = positiveModulo(positions[offset + 2] + 180, 360) - 180;
    }
    system.geometry.attributes.position.needsUpdate = true;
  }

  function playThunder(strike) {
    if (!audioUnlocked || !audioContext || audioContext.state !== 'running') return false;
    try {
      const sampleRate = audioContext.sampleRate;
      const duration = 2.6;
      const buffer = audioContext.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
      const data = buffer.getChannelData(0);
      const audioRandom = mulberry32((seedToUint(currentSeed) ^ strike.index ^ 0x9e3779b9) >>> 0);
      let brown = 0;
      for (let index = 0; index < data.length; index += 1) {
        const white = audioRandom() * 2 - 1;
        brown = THREE.MathUtils.clamp(brown * 0.985 + white * 0.075, -1, 1);
        const time = index / sampleRate;
        const crack = time < 0.08 ? (1 - time / 0.08) * white : 0;
        data[index] = (brown * 0.52 + crack * 0.8) * Math.exp(-time * 1.25);
      }
      const sourceNode = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      filter.type = 'lowpass';
      filter.frequency.value = 760;
      gain.gain.value = THREE.MathUtils.clamp(1 / (1 + strike.distance / 850), 0.16, 0.75);
      sourceNode.buffer = buffer;
      sourceNode.connect(filter).connect(gain).connect(audioContext.destination);
      activeAudio.add(sourceNode);
      sourceNode.onended = () => activeAudio.delete(sourceNode);
      sourceNode.start();
      return true;
    } catch {
      return false;
    }
  }

  function strikeLightning() {
    const selected = selectHighestTarget(highestTarget);
    const end = targetPosition(selected, new THREE.Vector3());
    const start = end.clone().add(new THREE.Vector3((random() - 0.5) * 60, 260 + random() * 80, (random() - 0.5) * 60));
    const points = [];
    const segmentCount = 15;
    for (let index = 0; index <= segmentCount; index += 1) {
      const t = index / segmentCount;
      const point = new THREE.Vector3().lerpVectors(start, end, t);
      if (index > 0 && index < segmentCount) {
        const jitter = (1 - t) * 18;
        point.x += (random() - 0.5) * jitter;
        point.z += (random() - 0.5) * jitter;
      }
      points.push(point);
    }
    lightningGeometry.setFromPoints(points);
    lightning.visible = true;
    lightningMaterial.opacity = 1;
    lightningLife = 0.19;
    flashLight.position.copy(start).lerp(end, 0.55);
    flashLight.intensity = 520;
    lightningCount += 1;
    const observer = camera?.getWorldPosition ? camera.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
    const distance = observer.distanceTo(end);
    const delay = thunderDelaySeconds(distance);
    lastStrike = {
      index: lightningCount,
      targetName: selected?.name ?? selected?.userData?.benchRole ?? 'fallback-target',
      target: { x: end.x, y: end.y, z: end.z },
      endpointError: points[points.length - 1].distanceTo(end),
      distance,
      thunderDelay: delay,
      elapsed,
    };
    pendingThunder.push({ ...lastStrike, remaining: delay });
    lightningTimer = 2.3 + random() * 4.6;
    return lastStrike;
  }

  function updateThunder(dt) {
    for (let index = pendingThunder.length - 1; index >= 0; index -= 1) {
      const thunder = pendingThunder[index];
      thunder.remaining -= dt;
      if (thunder.remaining <= 0) {
        playThunder(thunder);
        pendingThunder.splice(index, 1);
      }
    }
  }

  function advance(dt) {
    const safeDt = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.05);
    if (safeDt <= 0) return;
    elapsed += safeDt;
    if (transitioning) {
      transitionElapsed += safeDt;
      const alpha = smoothTransitionAlpha(transitionElapsed, transitionDuration);
      for (const key of PARAMETER_KEYS) current[key] = THREE.MathUtils.lerp(source[key], target[key], alpha);
      if (transitionElapsed + 1e-8 >= transitionDuration) {
        Object.assign(current, target);
        currentKind = targetKind;
        transitioning = false;
      }
    }

    updateMaterialResponse();
    movePrecipitation(rain, safeDt);
    movePrecipitation(snow, safeDt);
    const cloudMultiplier = 0.3 + current.cloudCover * 1.2;
    cloudOffsetX += wind.x * safeDt * cloudMultiplier;
    cloudOffsetZ += wind.y * safeDt * cloudMultiplier;
    cloudLayer.position.set(
      positiveModulo(cloudOffsetX + 700, 1400) - 700,
      0,
      positiveModulo(cloudOffsetZ + 800, 1600) - 800,
    );
    const focus = camera?.position ?? { x: 0, z: 0 };
    rain.points.position.set(Number(focus.x) || 0, 0, Number(focus.z) || 0);
    snow.points.position.copy(rain.points.position);

    if (current.lightning > 0.01) {
      lightningTimer -= safeDt * current.lightning;
      if (lightningTimer <= 0) strikeLightning();
    }
    if (lightningLife > 0) {
      lightningLife -= safeDt;
      const flash = THREE.MathUtils.clamp(lightningLife / 0.19, 0, 1);
      lightningMaterial.opacity = flash > 0.48 ? 1 : flash * 1.8;
      flashLight.intensity = 520 * flash * flash;
      if (lightningLife <= 0) {
        lightning.visible = false;
        flashLight.intensity = 0;
      }
    }
    updateThunder(safeDt);
  }

  function update(dt) {
    accumulator += THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.25);
    while (accumulator + 1e-8 >= WEATHER_FIXED_STEP) {
      advance(WEATHER_FIXED_STEP);
      accumulator -= WEATHER_FIXED_STEP;
    }
  }

  function step(dt = WEATHER_FIXED_STEP, iterations = 1) {
    for (let index = 0; index < Math.max(0, Math.floor(iterations)); index += 1) advance(dt);
  }

  function reset(nextSeed = currentSeed) {
    currentSeed = nextSeed;
    random = mulberry32(nextSeed);
    Object.assign(current, WEATHER_PRESETS.clear);
    source = { ...current };
    target = { ...current };
    currentKind = 'clear';
    targetKind = 'clear';
    transitionElapsed = 0;
    transitionDuration = 6;
    transitioning = false;
    accumulator = 0;
    elapsed = 0;
    cloudOffsetX = 0;
    cloudOffsetZ = 0;
    lightningTimer = 2.2;
    lightningLife = 0;
    lightningCount = 0;
    lastStrike = null;
    pendingThunder.length = 0;
    for (const system of [rain, snow]) {
      for (let index = 0; index < system.count; index += 1) {
        system.positions[index * 3] = (random() - 0.5) * 360;
        system.positions[index * 3 + 1] = random() * 230;
        system.positions[index * 3 + 2] = (random() - 0.5) * 360;
      }
      system.geometry.attributes.position.needsUpdate = true;
    }
    updateMaterialResponse();
  }

  async function unlockAudio() {
    try {
      const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!AudioContextClass) return false;
      audioContext ??= new AudioContextClass();
      if (audioContext.state === 'suspended') await audioContext.resume();
      audioUnlocked = audioContext.state === 'running';
      return audioUnlocked;
    } catch {
      audioUnlocked = false;
      return false;
    }
  }

  function getState() {
    const rainVelocity = computePrecipitationVelocity('rain', { x: wind.x, z: wind.y });
    const snowVelocity = computePrecipitationVelocity('snow', { x: wind.x, z: wind.y });
    return {
      seed: currentSeed,
      kind: currentKind,
      targetKind,
      transitioning,
      transitionDuration,
      transitionProgress: transitioning ? THREE.MathUtils.clamp(transitionElapsed / transitionDuration, 0, 1) : 1,
      elapsed,
      ...current,
      wind: { x: wind.x, z: wind.y },
      rainTilt: Math.atan2(Math.hypot(rainVelocity.x, rainVelocity.z), Math.abs(rainVelocity.y)),
      snowTilt: Math.atan2(Math.hypot(snowVelocity.x, snowVelocity.z), Math.abs(snowVelocity.y)),
      cloudSpeed: Math.hypot(wind.x, wind.y) * (0.3 + current.cloudCover * 1.2),
      cloudOffset: { x: cloudOffsetX, z: cloudOffsetZ },
      rainParticleCount: rain.count,
      snowParticleCount: snow.count,
      lightningCount,
      lastStrike: lastStrike ? { ...lastStrike, target: { ...lastStrike.target } } : null,
      pendingThunder: pendingThunder.length,
      audioUnlocked,
      fixedStep: WEATHER_FIXED_STEP,
    };
  }

  function dispose() {
    scene?.remove?.(group);
    if (scene) scene.fog = previousFog;
    for (const restore of restoreSnowPatches) restore();
    for (const base of roadBase) {
      if (base.roughness !== null) base.material.roughness = base.roughness;
      if (base.metalness !== null) base.material.metalness = base.metalness;
      if (base.envMapIntensity !== null) base.material.envMapIntensity = base.envMapIntensity;
      base.material.needsUpdate = true;
    }
    activeAudio.forEach((node) => {
      try { node.stop(); } catch { /* already stopped */ }
    });
    activeAudio.clear();
    if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
    disposeTree(group);
    group.clear();
  }

  reset(seed);
  return {
    group,
    setWeather,
    setWind,
    update,
    step,
    reset,
    forceLightning: strikeLightning,
    getState,
    unlockAudio,
    dispose,
  };
}
