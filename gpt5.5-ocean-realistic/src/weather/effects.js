import { clamp, mulberry32 } from '../ocean/waves.js';

const TAU = Math.PI * 2;

function gaussian(value, center, width) {
  const distance = (value - center) / width;
  return Math.exp(-(distance * distance));
}

export function createSpoutParticles({ count = 2600, radius = 9, height = 120, seed = 1 } = {}) {
  const rand = mulberry32(seed + 7001);
  const particles = [];

  for (let i = 0; i < count; i += 1) {
    const isSpray = rand() < 0.22;
    const normalizedHeight = isSpray ? Math.pow(rand(), 2.6) * 0.18 : rand();
    const arm = Math.floor(rand() * 3);
    const shell = Math.pow(rand(), isSpray ? 0.28 : 0.5);
    const stem = 0.22 + Math.pow(normalizedHeight, 0.64) * 0.34;
    const waistCarve = gaussian(normalizedHeight, 0.4, 0.13) * 0.22;
    const hammerBulge = gaussian(normalizedHeight, 0.64, 0.17) * 0.78;
    const crownBulge = gaussian(normalizedHeight, 0.9, 0.15) * 0.68;
    const raggedProfile =
      1 +
      Math.sin(normalizedHeight * 27 + arm * 2.1) * 0.12 +
      Math.sin(normalizedHeight * 61 + seed * 0.013) * 0.08 +
      (rand() - 0.5) * 0.16;
    const profileRadius = clamp(
      (stem + hammerBulge + crownBulge - waistCarve) * raggedProfile,
      0.14,
      1.72
    );
    const spiralNoise =
      Math.sin(normalizedHeight * 31 + arm * 2.7) * 0.12 +
      Math.sin(normalizedHeight * 74 + seed * 0.021) * 0.07;
    const turn = normalizedHeight * 13.45 + arm / 3 + rand() * 0.22 + spiralNoise;
    const angle = turn * TAU;
    const lowerBend = gaussian(normalizedHeight, 0.31, 0.22);
    const midBend = gaussian(normalizedHeight, 0.53, 0.28);
    const bendStrength = (lowerBend * 0.82 + midBend * 0.46 + hammerBulge * 0.16) * (isSpray ? 0.28 : 1);
    const axisBendX =
      (Math.sin(normalizedHeight * 7.9 + seed * 0.011) * 0.74 +
        Math.sin(normalizedHeight * 19.4 + arm * 1.6) * 0.28) *
      radius *
      bendStrength;
    const axisBendZ =
      (Math.cos(normalizedHeight * 6.6 + seed * 0.017) * 0.63 +
        Math.sin(normalizedHeight * 16.8 + arm * 2.3) * 0.24) *
      radius *
      bendStrength;
    const vortexWarp = clamp(
      1 +
        Math.sin(angle * 1.7 + normalizedHeight * 11.0) * 0.17 +
        Math.sin(normalizedHeight * 39.0 + arm * 2.1) * 0.12 +
        (rand() - 0.5) * 0.12,
      0.62,
      1.46
    );
    const spraySkirt = isSpray ? (1 - normalizedHeight / 0.18) * radius * (0.68 + rand() * 0.88) : 0;
    const localRadius = Math.max(
      0.32,
      radius * profileRadius * (0.18 + shell * 0.82) * vortexWarp + spraySkirt
    );
    const turbulenceScale =
      radius *
      (isSpray ? 0.56 : 0.11 + hammerBulge * 0.16 + Math.max(0, 0.45 - normalizedHeight) * 0.09);
    const turbulenceX = (rand() - 0.5) * turbulenceScale;
    const turbulenceZ = (rand() - 0.5) * turbulenceScale;
    const shear =
      (Math.sin(normalizedHeight * 5.4 + seed * 0.009) * (0.13 + hammerBulge * 0.16) +
        Math.sin(normalizedHeight * 13.0 + arm * 1.4) * 0.045) *
      radius;
    const midCondensation = Math.sin(normalizedHeight * Math.PI);
    const alpha = clamp(
      (isSpray ? 0.07 : 0.045) +
        (1 - shell) * 0.13 +
        midCondensation * 0.12 +
        hammerBulge * 0.18 +
        crownBulge * 0.08 -
        waistCarve * 0.08,
      0.035,
      isSpray ? 0.32 : 0.52
    );
    const kind = isSpray
      ? 'spray'
      : normalizedHeight > 0.47 && normalizedHeight < 0.82
        ? 'hammer'
        : 'funnel';

    particles.push({
      x: Math.cos(angle) * localRadius + turbulenceX + shear + axisBendX,
      y: normalizedHeight * height,
      z: Math.sin(angle) * localRadius + turbulenceZ + axisBendZ,
      radius: localRadius,
      normalizedHeight,
      phase: angle,
      axisBendX,
      axisBendZ,
      vortexWarp,
      alpha,
      size: isSpray ? 2.2 + rand() * 4.8 : 3.2 + hammerBulge * 4.1 + crownBulge * 2.4 + rand() * 7.6,
      kind
    });
  }

  return particles;
}

export function createLightningSegments({ seed = 1, height = 128, branchCount = 12 } = {}) {
  const rand = mulberry32(seed + 411);
  const mainNodes = [];
  const nodeCount = 25;
  let x = 0;
  let z = 0;

  for (let i = 0; i < nodeCount; i += 1) {
    const t = i / (nodeCount - 1);
    x += (rand() - 0.5) * (3.5 + t * 5.8);
    z += (rand() - 0.5) * (1.8 + t * 2.4);
    mainNodes.push({ x, y: height * (1 - t), z });
  }

  const segments = [];
  for (let i = 0; i < mainNodes.length - 1; i += 1) {
    segments.push({
      start: mainNodes[i],
      end: mainNodes[i + 1],
      branch: false,
      thickness: Math.max(0.12, 0.42 - i * 0.01)
    });
  }

  for (let i = 0; i < branchCount; i += 1) {
    const anchorIndex = 3 + Math.floor(rand() * (mainNodes.length - 8));
    let start = mainNodes[anchorIndex];
    const direction = rand() > 0.5 ? 1 : -1;
    const pieces = 2 + Math.floor(rand() * 3);
    for (let piece = 0; piece < pieces; piece += 1) {
      const end = {
        x: start.x + direction * (5 + rand() * 15) + (rand() - 0.5) * 4,
        y: start.y - (6 + rand() * 13),
        z: start.z + (rand() - 0.5) * 8
      };
      segments.push({
        start,
        end,
        branch: true,
        thickness: Math.max(0.06, 0.18 - piece * 0.035)
      });
      start = end;
    }
  }

  return segments;
}

export function createRainLayerConfig({ rainDensity = 0.7, windSpeed = 28, rainVisibility = 1 } = {}) {
  const density = clamp(rainDensity, 0, 1);
  const wind = clamp(windSpeed, 0, 42);
  const visibility = clamp(rainVisibility, 0.25, 2);

  return {
    near: {
      count: Math.round(2200 + density * 3600),
      length: 23 + wind * 0.72,
      width: 300,
      depth: 260,
      height: 130,
      directionJitter: 0.72 + wind * 0.012,
      crosswindVariance: 9.5 + wind * 0.34,
      depthSlantVariance: 6.2 + wind * 0.22,
      gustVariance: 0.28 + density * 0.34,
      microBurstVariance: 0.28 + wind * 0.014,
      fallSpeedMin: 0.72,
      fallSpeedMax: 1.52 + density * 0.26,
      opacityJitter: 0.42,
      spriteScale: 1.05,
      opacity: (0.16 + density * 0.48) * visibility
    },
    mid: {
      count: Math.round(1500 + density * 2400),
      length: 16 + wind * 0.46,
      width: 560,
      depth: 520,
      height: 150,
      directionJitter: 0.44 + wind * 0.008,
      crosswindVariance: 6.2 + wind * 0.22,
      depthSlantVariance: 4.4 + wind * 0.16,
      gustVariance: 0.2 + density * 0.26,
      microBurstVariance: 0.18 + wind * 0.009,
      fallSpeedMin: 0.58,
      fallSpeedMax: 1.2 + density * 0.18,
      opacityJitter: 0.32,
      spriteScale: 0.82,
      opacity: (0.11 + density * 0.32) * visibility
    },
    far: {
      count: Math.round(900 + density * 1400),
      length: 10 + wind * 0.25,
      width: 850,
      depth: 780,
      height: 170,
      directionJitter: 0.24 + wind * 0.005,
      crosswindVariance: 3.8 + wind * 0.13,
      depthSlantVariance: 2.8 + wind * 0.1,
      gustVariance: 0.12 + density * 0.18,
      microBurstVariance: 0.1 + wind * 0.005,
      fallSpeedMin: 0.44,
      fallSpeedMax: 0.92 + density * 0.12,
      opacityJitter: 0.22,
      spriteScale: 0.58,
      opacity: (0.07 + density * 0.22) * visibility
    },
    splash: {
      count: Math.round(500 + density * 1500),
      radius: 225,
      opacity: (0.14 + density * 0.5) * visibility
    },
    slant: clamp(0.18 + wind / 78, 0.12, 0.72)
  };
}
