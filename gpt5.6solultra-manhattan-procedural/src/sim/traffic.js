import * as THREE from 'three';

export const TRAFFIC_FIXED_STEP = 1 / 60;
export const DEFAULT_SIGNAL_TIMING = Object.freeze({
  cycle: 28,
  green: 11,
  yellow: 2,
  allRed: 1,
});

const CAR_LENGTH = 4.2;
const MIN_GAP = 1.8;
const STOP_LINE_OFFSET = 5.5;
const EPSILON = 1e-8;

function seedToUint(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed ?? 1337);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
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

/**
 * 返回路口某个方向的信号状态。NS=南北，EW=东西；两相位之间保留全红间隔。
 */
export function signalPhaseAt(time, direction = 'NS', offset = 0, timing = DEFAULT_SIGNAL_TIMING) {
  const green = Math.max(0.1, Number(timing.green) || DEFAULT_SIGNAL_TIMING.green);
  const yellow = Math.max(0, Number(timing.yellow) || DEFAULT_SIGNAL_TIMING.yellow);
  const allRed = Math.max(0, Number(timing.allRed) || DEFAULT_SIGNAL_TIMING.allRed);
  const minimumCycle = 2 * (green + yellow + allRed);
  const cycle = Math.max(minimumCycle, Number(timing.cycle) || DEFAULT_SIGNAL_TIMING.cycle);
  const halfCycle = cycle / 2;
  const axis = String(direction).toUpperCase() === 'EW' ? 'EW' : 'NS';
  const shifted = positiveModulo(Number(time) + Number(offset) - (axis === 'EW' ? halfCycle : 0), cycle);

  if (shifted < green) return 'green';
  if (shifted < green + yellow) return 'yellow';
  return 'red';
}

/**
 * IDM（Intelligent Driver Model，智能驾驶模型）纵向加速度。
 */
export function computeIdmAcceleration({
  speed = 0,
  desiredSpeed = 13.9,
  gap = Infinity,
  relativeSpeed = 0,
  maxAcceleration = 1.4,
  comfortableBraking = 2.2,
  minimumGap = MIN_GAP,
  timeHeadway = 1.25,
  exponent = 4,
} = {}) {
  const velocity = Math.max(0, Number(speed) || 0);
  const targetVelocity = Math.max(0.1, Number(desiredSpeed) || 0.1);
  const acceleration = Math.max(0.1, Number(maxAcceleration) || 0.1);
  const braking = Math.max(0.1, Number(comfortableBraking) || 0.1);
  const safeGap = Math.max(0.05, Number(gap));
  const closingSpeed = Number(relativeSpeed) || 0;
  const dynamicGap = Math.max(
    0,
    Number(minimumGap) + velocity * Number(timeHeadway)
      + (velocity * closingSpeed) / (2 * Math.sqrt(acceleration * braking)),
  );
  const freeRoadTerm = (velocity / targetVelocity) ** exponent;
  const interactionTerm = Number.isFinite(safeGap) ? (dynamicGap / safeGap) ** 2 : 0;
  const result = acceleration * (1 - freeRoadTerm - interactionTerm);
  return THREE.MathUtils.clamp(result, -4 * braking, acceleration);
}

export const computeIDMAcceleration = computeIdmAcceleration;

function createRoute(id, minX, maxX, minZ, maxZ, clockwise = true) {
  const clockwisePoints = [
    new THREE.Vector3(minX, 0.85, minZ),
    new THREE.Vector3(maxX, 0.85, minZ),
    new THREE.Vector3(maxX, 0.85, maxZ),
    new THREE.Vector3(minX, 0.85, maxZ),
  ];
  const points = clockwise ? clockwisePoints : [...clockwisePoints].reverse();
  const segments = [];
  let totalLength = 0;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const length = start.distanceTo(end);
    const tangent = end.clone().sub(start).normalize();
    const axis = Math.abs(tangent.x) > Math.abs(tangent.z) ? 'EW' : 'NS';
    segments.push({
      start,
      end,
      length,
      tangent,
      axis,
      startDistance: totalLength,
      signalOffset: positiveModulo(id * 4.75 + index * 2.25, DEFAULT_SIGNAL_TIMING.cycle),
    });
    totalLength += length;
  }

  return { id, points, segments, totalLength };
}

/** 默认的闭合正交车道；每条路线在四个路口完成 90° 转弯。 */
export function createDefaultTrafficRoutes() {
  const rectangles = [
    [-500, 500, -780, 780],
    [-440, 440, -700, 700],
    [-375, 375, -620, 620],
    [-310, 310, -540, 540],
    [-245, 245, -460, 460],
    [-180, 180, -380, 380],
    [-115, 115, -300, 300],
    [-535, 535, -220, 220],
  ];
  return rectangles.map((rect, index) => createRoute(index, ...rect, index % 2 === 0));
}

function routeSample(route, distance, target = {}) {
  const wrappedDistance = positiveModulo(distance, route.totalLength);
  let segment = route.segments[route.segments.length - 1];
  for (const candidate of route.segments) {
    if (wrappedDistance < candidate.startDistance + candidate.length - EPSILON) {
      segment = candidate;
      break;
    }
  }
  const localDistance = wrappedDistance - segment.startDistance;
  const fraction = THREE.MathUtils.clamp(localDistance / segment.length, 0, 1);
  const position = target.position ?? new THREE.Vector3();
  position.lerpVectors(segment.start, segment.end, fraction);
  target.position = position;
  target.tangent = segment.tangent;
  target.segment = segment;
  target.segmentIndex = route.segments.indexOf(segment);
  target.localDistance = localDistance;
  target.distanceToCorner = Math.max(0, segment.length - localDistance);
  return target;
}

function disposeObjectTree(root) {
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

function deriveBounds(plan) {
  const bounds = plan?.bounds;
  if (!bounds) return null;
  const minX = Number(bounds.minX ?? bounds.min?.x);
  const maxX = Number(bounds.maxX ?? bounds.max?.x);
  const minZ = Number(bounds.minZ ?? bounds.min?.z);
  const maxZ = Number(bounds.maxZ ?? bounds.max?.z);
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  if (maxX - minX < 400 || maxZ - minZ < 600) return null;
  return { minX, maxX, minZ, maxZ };
}

function routesFromPlan(plan) {
  const bounds = deriveBounds(plan);
  if (!bounds) return createDefaultTrafficRoutes();
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const halfX = Math.min(535, (bounds.maxX - bounds.minX) * 0.44);
  const halfZ = Math.min(780, (bounds.maxZ - bounds.minZ) * 0.44);
  return Array.from({ length: 8 }, (_, index) => {
    const scale = 1 - index * 0.095;
    return createRoute(
      index,
      centerX - halfX * scale,
      centerX + halfX * scale,
      centerZ - halfZ * scale,
      centerZ + halfZ * scale,
      index % 2 === 0,
    );
  });
}

/**
 * 生成确定性的交通系统。plan 可为空；缺少道路信息时使用内建闭合车道。
 */
export function createTrafficSystem(scene, plan = {}, { seed = 1337, vehicleCount = 144 } = {}) {
  const group = new THREE.Group();
  group.name = 'TrafficSystem';
  group.userData.benchRole = 'traffic-system';
  scene?.add?.(group);

  const routes = routesFromPlan(plan);
  const count = Math.max(120, Math.floor(Number(vehicleCount) || 144));
  const carGeometry = new THREE.BoxGeometry(CAR_LENGTH, 1.35, 1.85);
  carGeometry.translate(0, 0.72, 0);
  const carMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.18,
  });
  const cars = new THREE.InstancedMesh(carGeometry, carMaterial, count);
  cars.name = 'TrafficVehicles';
  cars.userData.benchRole = 'vehicle-fleet';
  cars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cars.frustumCulled = false;
  group.add(cars);

  const signalCount = routes.length * 4 * 2;
  const signalGeometry = new THREE.SphereGeometry(0.72, 8, 6);
  const signalMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const signals = new THREE.InstancedMesh(signalGeometry, signalMaterial, signalCount);
  signals.name = 'TrafficSignals';
  signals.userData.benchRole = 'traffic-signals';
  signals.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  group.add(signals);

  const dummy = new THREE.Object3D();
  const sample = {};
  const vehicles = [];
  const routeVehicleIndexes = routes.map(() => []);
  const carPalette = [0xe4493f, 0x276fbf, 0xf4c64f, 0xe9ecef, 0x1c1f26, 0x35a86b, 0xd88a38];
  let currentSeed = seed;
  let accumulator = 0;
  let elapsed = 0;
  let collisionCount = 0;
  let redViolations = 0;
  let completedTurns = 0;
  let minimumObservedGap = Infinity;

  function placeSignals() {
    let instance = 0;
    for (const route of routes) {
      for (let corner = 0; corner < route.points.length; corner += 1) {
        const point = route.points[corner];
        for (let axisIndex = 0; axisIndex < 2; axisIndex += 1) {
          dummy.position.set(point.x + (axisIndex ? 2.1 : -2.1), 5.2, point.z);
          dummy.scale.setScalar(1);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          signals.setMatrixAt(instance, dummy.matrix);
          instance += 1;
        }
      }
    }
    signals.instanceMatrix.needsUpdate = true;
  }

  function updateSignalColors() {
    let instance = 0;
    const red = new THREE.Color(0xff342d);
    const green = new THREE.Color(0x34ef70);
    const amber = new THREE.Color(0xffb52b);
    for (const route of routes) {
      for (let corner = 0; corner < route.segments.length; corner += 1) {
        const segment = route.segments[corner];
        for (const axis of ['NS', 'EW']) {
          const phase = signalPhaseAt(elapsed, axis, segment.signalOffset);
          signals.setColorAt(instance, phase === 'green' ? green : phase === 'yellow' ? amber : red);
          instance += 1;
        }
      }
    }
    if (signals.instanceColor) signals.instanceColor.needsUpdate = true;
  }

  function writeVehicleMatrices() {
    for (let index = 0; index < vehicles.length; index += 1) {
      const vehicle = vehicles[index];
      routeSample(routes[vehicle.routeIndex], vehicle.progress, sample);
      dummy.position.copy(sample.position);
      dummy.rotation.set(0, -Math.atan2(sample.tangent.z, sample.tangent.x), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      cars.setMatrixAt(index, dummy.matrix);
    }
    cars.instanceMatrix.needsUpdate = true;
  }

  function reset(nextSeed = currentSeed) {
    currentSeed = nextSeed;
    const random = mulberry32(nextSeed);
    vehicles.length = 0;
    routeVehicleIndexes.forEach((indexes) => { indexes.length = 0; });
    accumulator = 0;
    elapsed = 0;
    collisionCount = 0;
    redViolations = 0;
    completedTurns = 0;
    minimumObservedGap = Infinity;

    for (let index = 0; index < count; index += 1) {
      const routeIndex = index % routes.length;
      const route = routes[routeIndex];
      const ordinal = Math.floor(index / routes.length);
      const onRoute = Math.ceil(count / routes.length);
      const spacing = route.totalLength / onRoute;
      const progress = positiveModulo((ordinal + 0.12 * random()) * spacing, route.totalLength);
      const desiredSpeed = 10.5 + random() * 5.5;
      vehicles.push({
        id: index,
        routeIndex,
        progress,
        speed: desiredSpeed * (0.55 + random() * 0.25),
        desiredSpeed,
        color: carPalette[Math.floor(random() * carPalette.length)],
      });
      routeVehicleIndexes[routeIndex].push(index);
      cars.setColorAt(index, new THREE.Color(vehicles[index].color));
    }
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
    writeVehicleMatrices();
    updateSignalColors();
  }

  function simulateStep(dt) {
    const safeDt = THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.05);
    if (safeDt <= 0) return;
    elapsed += safeDt;

    const nextValues = new Array(vehicles.length);
    for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
      const route = routes[routeIndex];
      const indexes = routeVehicleIndexes[routeIndex];
      const ordered = [...indexes].sort((a, b) => vehicles[a].progress - vehicles[b].progress);

      for (let order = 0; order < ordered.length; order += 1) {
        const index = ordered[order];
        const leaderIndex = ordered[(order + 1) % ordered.length];
        const vehicle = vehicles[index];
        const leader = vehicles[leaderIndex];
        routeSample(route, vehicle.progress, sample);

        const wrappedDistance = positiveModulo(leader.progress - vehicle.progress, route.totalLength);
        const vehicleGap = Math.max(0.05, wrappedDistance - CAR_LENGTH);
        minimumObservedGap = Math.min(minimumObservedGap, vehicleGap);
        if (vehicleGap < 0.15) collisionCount += 1;

        let limitingGap = vehicleGap;
        let relativeSpeed = vehicle.speed - leader.speed;
        const phase = signalPhaseAt(elapsed, sample.segment.axis, sample.segment.signalOffset);
        const stopGap = sample.distanceToCorner - STOP_LINE_OFFSET;
        const mustStop = phase !== 'green' && stopGap >= -0.1 && stopGap < 75;
        if (mustStop && stopGap < limitingGap) {
          limitingGap = Math.max(0.05, stopGap);
          relativeSpeed = vehicle.speed;
        }

        const acceleration = computeIdmAcceleration({
          speed: vehicle.speed,
          desiredSpeed: vehicle.desiredSpeed,
          gap: limitingGap,
          relativeSpeed,
        });
        const nextSpeed = Math.max(0, vehicle.speed + acceleration * safeDt);
        let advance = (vehicle.speed + nextSpeed) * 0.5 * safeDt;

        // 红灯使用“虚拟静止车辆”钳制到停车线，数值误差也不会闯灯。
        if (mustStop && advance > Math.max(0, stopGap)) {
          advance = Math.max(0, stopGap);
        }
        // 同步积分时再施加硬安全壳，避免极端 dt 造成车身重叠。
        advance = Math.min(advance, Math.max(0, vehicleGap - MIN_GAP));
        const stoppedAtRed = mustStop && stopGap <= 0.02;
        const newProgress = positiveModulo(vehicle.progress + advance, route.totalLength);
        const beforeSegment = sample.segmentIndex;
        routeSample(route, newProgress, sample);
        if (sample.segmentIndex !== beforeSegment) {
          if (phase === 'red') redViolations += 1;
          else completedTurns += 1;
        }
        nextValues[index] = {
          progress: newProgress,
          speed: stoppedAtRed ? 0 : nextSpeed,
        };
      }
    }

    for (let index = 0; index < vehicles.length; index += 1) {
      Object.assign(vehicles[index], nextValues[index]);
    }
    writeVehicleMatrices();
    updateSignalColors();
  }

  function update(dt) {
    accumulator += THREE.MathUtils.clamp(Number(dt) || 0, 0, 0.25);
    while (accumulator + EPSILON >= TRAFFIC_FIXED_STEP) {
      simulateStep(TRAFFIC_FIXED_STEP);
      accumulator -= TRAFFIC_FIXED_STEP;
    }
  }

  function step(dt = TRAFFIC_FIXED_STEP, iterations = 1) {
    const countSteps = Math.max(0, Math.floor(iterations));
    for (let index = 0; index < countSteps; index += 1) simulateStep(dt);
  }

  function getSnapshot() {
    return vehicles.map((vehicle) => ({
      id: vehicle.id,
      route: vehicle.routeIndex,
      progress: Number(vehicle.progress.toFixed(6)),
      speed: Number(vehicle.speed.toFixed(6)),
    }));
  }

  function getMetrics() {
    const averageSpeed = vehicles.reduce((sum, vehicle) => sum + vehicle.speed, 0) / vehicles.length;
    return {
      seed: currentSeed,
      elapsed,
      vehicleCount: vehicles.length,
      routeCount: routes.length,
      collisionCount,
      redViolations,
      completedTurns,
      minimumGap: Number.isFinite(minimumObservedGap) ? minimumObservedGap : null,
      averageSpeed,
      fixedStep: TRAFFIC_FIXED_STEP,
    };
  }

  function dispose() {
    scene?.remove?.(group);
    disposeObjectTree(group);
    group.clear();
  }

  placeSignals();
  reset(seed);

  return {
    group,
    routes,
    update,
    step,
    reset,
    getMetrics,
    getSnapshot,
    instanceCount: count,
    dispose,
  };
}
