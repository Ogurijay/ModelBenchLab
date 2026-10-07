import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type ProceduralModelOptions = {
  wireframe?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  textureSize?: number;
  textureAnisotropy?: number;
  qualityPriority?: 'reference-fidelity' | 'balanced';
};

export type ProceduralModelRuntime = {
  nodes: Record<string, THREE.Object3D>;
  meshes: Record<string, THREE.Mesh>;
  sockets: Record<string, THREE.Object3D>;
  colliders: Record<string, unknown>;
  destructionGroups: Record<string, THREE.Object3D[]>;
};

type SculptMaterialSpec = Record<string, any>;

// bevelEnabled defaults to true on THREE.ExtrudeGeometry and rounds every
// corner — sharp/pointed profiles (blades, fork tines, spikes) need
// bevelEnabled: false plus lineTo()-only path segments near the tip, since a
// curve command cannot produce a true converging point.
function buildExtrudeShape(points: [number, number][], holes?: [number, number][][]): THREE.Shape {
  const shape = new THREE.Shape();
  if (points.length > 0) {
    shape.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      shape.lineTo(points[i][0], points[i][1]);
    }
  }
  // Cutouts (e.g. an oval wire-cutter hole) as THREE.Path added to shape.holes —
  // dep-free boolean subtraction via the tessellator, no CSG library needed.
  for (const loop of holes ?? []) {
    if (loop.length < 3) continue;
    const path = new THREE.Path();
    path.moveTo(loop[0][0], loop[0][1]);
    for (let i = 1; i < loop.length; i += 1) path.lineTo(loop[i][0], loop[i][1]);
    path.closePath();
    shape.holes.push(path);
  }
  return shape;
}

// Build an N-gon oval loop (for hole authoring from a compact {cx,cy,rx,ry} descriptor).
function ovalLoop(cx: number, cy: number, rx: number, ry: number, seg = 24): [number, number][] {
  const loop: [number, number][] = [];
  for (let i = 0; i < seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    loop.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return loop;
}

function buildExtrudeGeometry(profile: { points: [number, number][]; depth: number; holes?: [number, number][][]; ovalHoles?: { cx: number; cy: number; rx: number; ry: number }[] }): THREE.ExtrudeGeometry {
  const holes = [...(profile.holes ?? []), ...((profile.ovalHoles ?? []).map((o) => ovalLoop(o.cx, o.cy, o.rx, o.ry)))];
  const shape = buildExtrudeShape(profile.points, holes);
  return new THREE.ExtrudeGeometry(shape, {
    depth: profile.depth,
    bevelEnabled: false,
    steps: 1,
  });
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function readLayerNumber(value: unknown, keys: string[], fallback: number): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      if (typeof record[key] === 'number') return record[key] as number;
    }
  }
  return fallback;
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{3}$/i.test(hex)
    ? '#' + hex.slice(1).split('').map((part) => part + part).join('')
    : hex;
  const value = /^#[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized.slice(1), 16) : 0x8a7a5f;
  return [clampAlbedoChannel((value >> 16) & 255), clampAlbedoChannel((value >> 8) & 255), clampAlbedoChannel(value & 255)];
}

function materialPalette(spec: SculptMaterialSpec): string[] {
  const palette = spec.colorVariation?.palette;
  if (Array.isArray(palette) && palette.length > 0) return palette.filter((value) => typeof value === 'string');
  const secondary = spec.albedo?.secondary;
  const colors = [spec.baseColor ?? spec.color ?? spec.albedo?.dominant, ...(Array.isArray(secondary) ? secondary : [])];
  return colors.filter((value): value is string => typeof value === 'string' && value.startsWith('#'));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampAlbedoChannel(value: number): number {
  return Math.max(30, Math.min(240, Math.round(value)));
}

function clampPbrF0(value: number): number {
  return Math.max(0.02, Math.min(1, value));
}

function clampPbrIor(value: number): number {
  return Math.max(1, Math.min(2.5, value));
}

function clampPbrMetalness(value: number): number {
  return value >= 0.5 ? 1 : 0;
}

function clampedAlbedoColor(spec: SculptMaterialSpec): THREE.Color {
  const source = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  // setStyle with an explicit SRGBColorSpace, NOT the numeric constructor.
  //
  // `new THREE.Color(r, g, b)` treats its arguments as LINEAR working-space components,
  // while an authored `baseColor` hex is sRGB. Feeding one to the other skipped the
  // transfer function and lifted every dark albedo: #2e2a28, authored as a near-black
  // vinyl, rendered at roughly sRGB 0.46 — a mid grey. The error is largest exactly where
  // it matters most, because the transfer curve is steepest near black.
  return new THREE.Color().setStyle(source, THREE.SRGBColorSpace);
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function periodicHash(x: number, y: number, seed: number, periodX: number, periodY: number): number {
  const wrappedX = ((x % periodX) + periodX) % periodX;
  const wrappedY = ((y % periodY) + periodY) % periodY;
  let value = Math.imul(wrappedX + seed * 17, 374761393) ^ Math.imul(wrappedY + seed * 31, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function periodicValueNoise(u: number, v: number, seed: number, periodX: number, periodY: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothCurve(x - x0);
  const ty = smoothCurve(y - y0);
  const a = periodicHash(x0, y0, seed, periodX, periodY);
  const b = periodicHash(x0 + 1, y0, seed, periodX, periodY);
  const c = periodicHash(x0, y0 + 1, seed, periodX, periodY);
  const d = periodicHash(x0 + 1, y0 + 1, seed, periodX, periodY);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, tx), THREE.MathUtils.lerp(c, d, tx), ty);
}

type SurfaceBand = {
  frequency: number;
  amplitude: number;
  stretchX: number;
  stretchY: number;
  ridge: boolean;
};

function surfaceBands(spec: SculptMaterialSpec): SurfaceBand[] {
  const source = Array.isArray(spec.surfaceFrequencyBands) ? spec.surfaceFrequencyBands : [];
  const parsed = source.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const band = item as Record<string, unknown>;
    const frequency = typeof band.frequency === 'number' ? band.frequency : 0;
    const amplitude = typeof band.amplitude === 'number' ? band.amplitude : 0;
    if (frequency <= 0 || amplitude <= 0) return [];
    const stretch = Array.isArray(band.stretch) ? band.stretch : [1, 1];
    const description = `${String(band.pattern ?? '')} ${String(band.role ?? '')}`.toLowerCase();
    return [{
      frequency,
      amplitude,
      stretchX: typeof stretch[0] === 'number' ? Math.max(0.1, stretch[0]) : 1,
      stretchY: typeof stretch[1] === 'number' ? Math.max(0.1, stretch[1]) : 1,
      ridge: /(ridge|groove|grain|fiber|striated|crack)/.test(description),
    }];
  });
  return parsed.length > 0 ? parsed : [
    { frequency: 2, amplitude: 0.42, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 12, amplitude: 0.22, stretchX: 1, stretchY: 1, ridge: false },
    { frequency: 56, amplitude: 0.08, stretchX: 1, stretchY: 1, ridge: false },
  ];
}

function sampleSurface(u: number, v: number, bands: SurfaceBand[], seed: number): number {
  let value = 0;
  let weight = 0;
  for (let index = 0; index < bands.length; index += 1) {
    const band = bands[index];
    const periodX = Math.max(1, Math.round(band.frequency * band.stretchX));
    const periodY = Math.max(1, Math.round(band.frequency * band.stretchY));
    let sample = periodicValueNoise(u, v, seed + index * 1013, periodX, periodY);
    if (band.ridge) sample = 1 - Math.abs(sample * 2 - 1);
    value += sample * band.amplitude;
    weight += band.amplitude;
  }
  return weight > 0 ? clamp01(value / weight) : 0.5;
}

function mixPalette(colors: [number, number, number][], value: number): [number, number, number] {
  if (colors.length === 1) return colors[0];
  const scaled = clamp01(value) * (colors.length - 1);
  const index = Math.min(colors.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(THREE.MathUtils.lerp(a[0], b[0], mix)),
    Math.round(THREE.MathUtils.lerp(a[1], b[1], mix)),
    Math.round(THREE.MathUtils.lerp(a[2], b[2], mix)),
  ];
}

type ColorGradientStop = { offset: number; color: string };
type ColorGradientSpec = {
  type: 'linear' | 'radial';
  axis: [number, number];
  stops: ColorGradientStop[];
};

function parseRgba(value: string): [number, number, number] {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  if (!match) return [138, 122, 95];
  return [clampAlbedoChannel(Number(match[1])), clampAlbedoChannel(Number(match[2])), clampAlbedoChannel(Number(match[3]))];
}

// Analytical per-pixel gradient sample. The extraction schema's colorGradient carries
// exact rgba(...) stop colors (see extract_part_color_recipe.py), so this samples the
// same trend directly in JS math rather than round-tripping through a Canvas 2D
// createLinearGradient/createRadialGradient object — same visual result, and it composes
// directly with the existing noise/height-correlated colorVariation blend below.
function sampleColorGradient(gradient: ColorGradientSpec, u: number, v: number): [number, number, number] {
  const stops = gradient.stops.length >= 2 ? gradient.stops : [{ offset: 0, color: 'rgba(138,122,95,1)' }, { offset: 1, color: 'rgba(138,122,95,1)' }];
  let t: number;
  if (gradient.type === 'radial') {
    const [cx, cy] = gradient.axis;
    const dx = u - cx;
    const dy = v - cy;
    const maxRadius = Math.max(0.001, Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy)));
    t = clamp01(Math.hypot(dx, dy) / maxRadius);
  } else {
    const [ax, ay] = gradient.axis;
    const projection = (u - 0.5) * ax + (v - 0.5) * ay;
    const maxProjection = 0.5 * (Math.abs(ax) + Math.abs(ay)) || 0.5;
    t = clamp01(projection / maxProjection + 0.5);
  }
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.max(0, Math.floor(scaled)));
  const mix = scaled - index;
  const a = parseRgba(stops[index].color);
  const b = parseRgba(stops[index + 1].color);
  return [
    THREE.MathUtils.lerp(a[0], b[0], mix),
    THREE.MathUtils.lerp(a[1], b[1], mix),
    THREE.MathUtils.lerp(a[2], b[2], mix),
  ];
}

function writePixel(data: Uint8ClampedArray, offset: number, red: number, green: number, blue: number): void {
  data[offset] = Math.max(0, Math.min(255, Math.round(red)));
  data[offset + 1] = Math.max(0, Math.min(255, Math.round(green)));
  data[offset + 2] = Math.max(0, Math.min(255, Math.round(blue)));
  data[offset + 3] = 255;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function createMapTexture(
  canvas: HTMLCanvasElement,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [2, 2];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 2,
    typeof repeat[1] === 'number' ? repeat[1] : 2,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

type ProceduralTextureSet = {
  albedo: THREE.Texture;
  roughness: THREE.Texture;
  height: THREE.Texture;
  normal: THREE.Texture;
  ao: THREE.Texture;
  source: 'reference-pixel-extraction' | 'procedural';
};

function referenceMapUrl(spec: SculptMaterialSpec, channel: string): string | null {
  const reference = spec.referencePbr;
  if (!reference || typeof reference !== 'object') return null;
  if (reference.usable === false) return null;
  const confidence = typeof reference.confidence === 'number'
    ? reference.confidence
    : (typeof reference.estimatedFidelity === 'number' ? reference.estimatedFidelity : 0);
  const threshold = typeof reference.targetThreshold === 'number' ? reference.targetThreshold : 0.7;
  if (confidence < threshold) return null;
  const maps = reference.maps;
  if (!maps || typeof maps !== 'object') return null;
  const map = (maps as Record<string, unknown>)[channel];
  if (!map || typeof map !== 'object') return null;
  const record = map as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : record.path;
  return typeof url === 'string' && url.trim() ? url : null;
}

function createLoadedMapTexture(
  url: string,
  colorSpace: THREE.ColorSpace,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): THREE.Texture {
  const texture = new THREE.TextureLoader().load(url);
  const projection = spec.textureProjection && typeof spec.textureProjection === 'object' ? spec.textureProjection : {};
  const repeat = Array.isArray(projection.repeat) ? projection.repeat : [1, 1];
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(
    typeof repeat[0] === 'number' ? repeat[0] : 1,
    typeof repeat[1] === 'number' ? repeat[1] : 1,
  );
  texture.anisotropy = Math.max(1, Math.round(options.textureAnisotropy ?? projection.anisotropy ?? 8));
  texture.needsUpdate = true;
  return texture;
}

function makeReferenceTextureSet(spec: SculptMaterialSpec, options: ProceduralModelOptions): ProceduralTextureSet | null {
  const albedo = referenceMapUrl(spec, 'albedo');
  const roughness = referenceMapUrl(spec, 'roughness');
  const height = referenceMapUrl(spec, 'height');
  const normal = referenceMapUrl(spec, 'normal');
  const ao = referenceMapUrl(spec, 'ao');
  if (!albedo || !roughness || !height || !normal || !ao) return null;
  return {
    albedo: createLoadedMapTexture(albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createLoadedMapTexture(roughness, THREE.NoColorSpace, spec, options),
    height: createLoadedMapTexture(height, THREE.NoColorSpace, spec, options),
    normal: createLoadedMapTexture(normal, THREE.NoColorSpace, spec, options),
    ao: createLoadedMapTexture(ao, THREE.NoColorSpace, spec, options),
    source: 'reference-pixel-extraction',
  };
}

function makeProceduralTextureSet(
  id: string,
  spec: SculptMaterialSpec,
  options: ProceduralModelOptions,
): ProceduralTextureSet | null {
  if (typeof document === 'undefined') return null;
  const qualityFirst = (options.qualityPriority ?? 'reference-fidelity') === 'reference-fidelity';
  const requested = options.textureSize ?? spec.textureResolution;
  const requestedSize = typeof requested === 'number' && Number.isFinite(requested)
    ? requested
    : (qualityFirst ? 1024 : 512);
  const size = Math.max(256, Math.min(2048, 2 ** Math.round(Math.log2(requestedSize))));
  const canvases = {
    albedo: makeCanvas(size),
    roughness: makeCanvas(size),
    height: makeCanvas(size),
    normal: makeCanvas(size),
    ao: makeCanvas(size),
  };
  const contexts = {
    albedo: canvases.albedo.getContext('2d'),
    roughness: canvases.roughness.getContext('2d'),
    height: canvases.height.getContext('2d'),
    normal: canvases.normal.getContext('2d'),
    ao: canvases.ao.getContext('2d'),
  };
  if (!contexts.albedo || !contexts.roughness || !contexts.height || !contexts.normal || !contexts.ao) return null;
  const images = {
    albedo: contexts.albedo.createImageData(size, size),
    roughness: contexts.roughness.createImageData(size, size),
    height: contexts.height.createImageData(size, size),
    normal: contexts.normal.createImageData(size, size),
    ao: contexts.ao.createImageData(size, size),
  };
  const seed = hashString(id);
  const bands = surfaceBands(spec);
  const heightField = new Float32Array(size * size);
  const roughnessField = new Float32Array(size * size);
  const palette = materialPalette(spec);
  const fallback = typeof spec.baseColor === 'string' ? spec.baseColor : '#8A7A5F';
  const colors = (palette.length >= 2 ? palette : [fallback, '#6E614B', '#A08F70']).map(hexToRgb);
  const baseRoughness = clamp01(readLayerNumber(spec.roughness, ['base'], 0.76));
  const roughnessVariation = clamp01(readLayerNumber(spec.roughness, ['variation'], 0.18));
  const colorAmplitude = clamp01(readLayerNumber(spec.colorVariation, ['amplitude', 'variation'], 0.18));
  const heightCorrelation = clamp01(readLayerNumber(spec.colorVariation, ['heightCorrelation'], 0.3));
  const colorGradient: ColorGradientSpec | undefined = spec.colorGradient;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const index = y * size + x;
      const height = sampleSurface(u, v, bands, seed + 101);
      const roughNoise = sampleSurface(u, v, bands, seed + 7001);
      const colorNoise = sampleSurface(u, v, bands, seed + 15013);
      heightField[index] = height;
      roughnessField[index] = clamp01(baseRoughness + (roughNoise - 0.5) * roughnessVariation * 2);
      let color: [number, number, number];
      if (colorGradient) {
        // Evidence-derived spatial gradient (Plan 1.3 Workstream C) takes priority
        // over the noise-based palette blend below — it is a measured trend, not a guess.
        color = sampleColorGradient(colorGradient, u, v);
      } else {
        const paletteValue = clamp01(
          0.5 + (colorNoise - 0.5) * colorAmplitude * 2 + (height - 0.5) * heightCorrelation
        );
        color = mixPalette(colors, paletteValue);
      }
      writePixel(images.albedo.data, index * 4, color[0], color[1], color[2]);
    }
  }
  const normalStrength = Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35));
  const aoStrength = clamp01(readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35));
  for (let y = 0; y < size; y += 1) {
    const up = ((y - 1 + size) % size) * size;
    const down = ((y + 1) % size) * size;
    for (let x = 0; x < size; x += 1) {
      const left = (x - 1 + size) % size;
      const right = (x + 1) % size;
      const index = y * size + x;
      const center = heightField[index];
      const dx = (heightField[y * size + right] - heightField[y * size + left]) * normalStrength * 6;
      const dy = (heightField[down + x] - heightField[up + x]) * normalStrength * 6;
      const inverseLength = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const normalX = -dx * inverseLength;
      const normalY = -dy * inverseLength;
      const normalZ = inverseLength;
      const neighborAverage = (
        heightField[y * size + left] + heightField[y * size + right]
        + heightField[up + x] + heightField[down + x]
      ) * 0.25;
      const cavity = Math.max(0, neighborAverage - center);
      const ao = clamp01(1 - aoStrength * (cavity * 12 + (1 - center) * 0.16));
      const offset = index * 4;
      const heightByte = center * 255;
      const roughnessByte = roughnessField[index] * 255;
      writePixel(images.height.data, offset, heightByte, heightByte, heightByte);
      writePixel(images.roughness.data, offset, roughnessByte, roughnessByte, roughnessByte);
      writePixel(
        images.normal.data, offset,
        (normalX * 0.5 + 0.5) * 255,
        (normalY * 0.5 + 0.5) * 255,
        (normalZ * 0.5 + 0.5) * 255,
      );
      writePixel(images.ao.data, offset, ao * 255, ao * 255, ao * 255);
    }
  }
  contexts.albedo.putImageData(images.albedo, 0, 0);
  contexts.roughness.putImageData(images.roughness, 0, 0);
  contexts.height.putImageData(images.height, 0, 0);
  contexts.normal.putImageData(images.normal, 0, 0);
  contexts.ao.putImageData(images.ao, 0, 0);
  return {
    albedo: createMapTexture(canvases.albedo, THREE.SRGBColorSpace, spec, options),
    roughness: createMapTexture(canvases.roughness, THREE.NoColorSpace, spec, options),
    height: createMapTexture(canvases.height, THREE.NoColorSpace, spec, options),
    normal: createMapTexture(canvases.normal, THREE.NoColorSpace, spec, options),
    ao: createMapTexture(canvases.ao, THREE.NoColorSpace, spec, options),
    source: 'procedural',
  };
}

function createSculptMaterial(id: string, spec: SculptMaterialSpec, options: ProceduralModelOptions, denseComponent = false): THREE.MeshPhysicalMaterial {
  // A material that declares -- with evidence -- that its subject carries no texture
  // detail gets NO texture set. Synthesising one anyway is not a harmless default: the
  // branch below then forces color to white and roughness to 1 and reads both from the
  // generated maps, so the authored albedo and the reference-derived roughness are both
  // discarded, and the model gains mottling the reference does not have. Measured on the
  // tuxedo cat, whose black fur rendered as speckled grey-and-white from a palette that
  // only ever described two flat regions.
  const textureless = (spec.textureless as { declared?: boolean } | undefined)?.declared === true;
  const textures = textureless
    ? null
    : makeReferenceTextureSet(spec, options) ?? makeProceduralTextureSet(id, spec, options);
  const material = new THREE.MeshPhysicalMaterial({
    color: textures ? 0xffffff : clampedAlbedoColor(spec),
    roughness: textures ? 1 : clamp01(readLayerNumber(spec.roughness, ['base'], 0.76)),
    metalness: clampPbrMetalness(readLayerNumber(spec.metalness, ['base'], 0.0)),
    clearcoat: clamp01(readLayerNumber(spec.clearcoat, ['base', 'amount'], 0)),
    clearcoatRoughness: clamp01(readLayerNumber(spec.clearcoatRoughness, ['base'], 0.25)),
    transmission: clamp01(readLayerNumber(spec.transmission, ['base', 'amount'], 0)),
    ior: clampPbrIor(readLayerNumber(spec.ior, ['base', 'value'], 1.5)),
    thickness: Math.max(0, readLayerNumber(spec.thickness, ['base', 'amount'], 0)),
    attenuationDistance: Math.max(0.001, readLayerNumber(spec.attenuationDistance, ['base', 'value'], Infinity)),
    attenuationColor: new THREE.Color(typeof spec.attenuationColor === 'string' ? spec.attenuationColor : '#ffffff'),
    sheen: clamp01(readLayerNumber(spec.sheen, ['base', 'amount'], 0)),
    sheenColor: new THREE.Color(typeof spec.sheenColor === 'string' ? spec.sheenColor : '#ffffff'),
    sheenRoughness: clamp01(readLayerNumber(spec.sheenRoughness, ['base'], 1.0)),
    iridescence: clamp01(readLayerNumber(spec.iridescence, ['base', 'amount'], 0)),
    iridescenceIOR: clampPbrIor(readLayerNumber(spec.iridescenceIOR, ['base', 'value'], 1.3)),
    anisotropy: clamp01(readLayerNumber(spec.anisotropy, ['base', 'amount'], 0)),
    anisotropyRotation: readLayerNumber(spec.anisotropy, ['rotation'], 0),
    specularIntensity: clampPbrF0(readLayerNumber(spec.specularF0 ?? spec.f0 ?? spec.specularIntensity, ['base', 'value'], 1.0)),
    specularColor: new THREE.Color(typeof spec.specularColor === 'string' ? spec.specularColor : '#ffffff'),
    emissive: new THREE.Color(typeof spec.emissive === 'string' ? spec.emissive : '#000000'),
    emissiveIntensity: Math.max(0, readLayerNumber(spec.emissiveIntensity, ['base'], 1.0)),
    opacity: clamp01(readLayerNumber(spec.opacity, ['base'], 1)),
    transparent: readLayerNumber(spec.transmission, ['base', 'amount'], 0) > 0 || readLayerNumber(spec.opacity, ['base'], 1) < 1,
    alphaTest: Math.max(0, readLayerNumber(spec.alpha, ['cutoff', 'alphaTest'], 0)),
    wireframe: options.wireframe ?? false,
    side: spec.doubleSided === true ? THREE.DoubleSide : THREE.FrontSide,
    flatShading: spec.flatShading === true,
  });
  if (textures) {
    material.map = textures.albedo;
    material.roughnessMap = textures.roughness;
    material.normalMap = textures.normal;
    material.normalScale.setScalar(Math.max(0.05, readLayerNumber(spec.normal, ['strength', 'amplitude'], 0.35)));
    material.aoMap = textures.ao;
    material.aoMap.channel = 0;
    material.aoMapIntensity = readLayerNumber(spec.ambientOcclusion, ['cavityStrength', 'strength'], 0.35);
    const denseMesh = denseComponent || spec.denseMesh === true || spec.geometryDensity === 'dense' || spec.topologyClass === 'dense';
    const bumpScale = Math.max(0, readLayerNumber(spec.bump, ['amplitude', 'strength'], 0));
    const effectiveBumpScale = denseMesh ? Math.max(0.05, bumpScale) : bumpScale;
    if (effectiveBumpScale > 0) {
      material.bumpMap = textures.height;
      material.bumpScale = effectiveBumpScale;
    }
    const displacementScale = Math.max(0, readLayerNumber(spec.displacement, ['amplitude', 'strength'], 0));
    const effectiveDisplacementScale = denseMesh ? Math.max(0.005, displacementScale) : displacementScale;
    if (effectiveDisplacementScale > 0) {
      material.displacementMap = textures.height;
      material.displacementScale = effectiveDisplacementScale;
      material.displacementBias = -effectiveDisplacementScale * 0.5;
    }
  }
  material.envMapIntensity = readLayerNumber(spec, ['envMapIntensity'], 0.8);
  material.userData.sculptMaterial = spec;
  material.userData.proceduralMapsIndependent = true;
  material.userData.pbrConstraints = { albedoRange: [30, 240], binaryMetalness: true, f0Range: [0.02, 1], iorRange: [1, 2.5] };
  material.userData.pbrTextureSource = textures?.source ?? 'flat-fallback';
  material.userData.referencePbr = spec.referencePbr ?? null;
  material.userData.referenceMaterialId = spec.referenceMaterialId ?? spec.materialReference?.profileId ?? null;
  material.userData.materialEvidence = spec.materialEvidence ?? null;
  material.userData.validationViews = spec.materialReference?.validationViews ?? [];
  material.needsUpdate = true;
  return material;
}

type AttachmentEndpoint = {
  start: THREE.Vector3;
  midpoint: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
  baseRadius: number;
  endRadius: number;
};

function readVector3(value: unknown, fallback: [number, number, number]): THREE.Vector3 {
  if (Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number')) {
    return new THREE.Vector3(value[0], value[1], value[2]);
  }
  return new THREE.Vector3(fallback[0], fallback[1], fallback[2]);
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function makeAttachmentEndpoint(attachment: unknown): AttachmentEndpoint | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const record = attachment as Record<string, unknown>;
  const start = readVector3(record.localStart, [0, 0, 0]);
  const end = readVector3(record.localEnd, [0, 1, 0]);
  const delta = end.clone().sub(start);
  const length = delta.length();
  if (length <= 0.0001) return null;
  const direction = delta.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const baseRadius = Math.max(0.005, readNumber(record.baseRadius, 0.06));
  const endRadius = Math.max(0.003, readNumber(record.endRadius, baseRadius * 0.55));
  return {
    start,
    midpoint: delta.multiplyScalar(0.5),
    quaternion,
    length,
    baseRadius,
    endRadius,
  };
}

// Generated from ObjectSculptSpec target: BEAK SPIDER
// Sculpt build pass: blockout
// This factory is intentionally pass-gated. Finish browser screenshot review before unlocking deeper passes.
export function createBEAKSPIDERModel(options: ProceduralModelOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = "BEAK SPIDER";
  root.userData.reconstructionEvidence = {"itemFamily": null, "subtype": null, "componentAdapter": null, "route": null, "exactnessTier": null, "referenceCamera": {"solved": false, "fovDegrees": 32, "aspect": 1.3333333333333333, "orientation": {"yaw": 38, "pitch": 30, "roll": 0}, "positionHint": [150, 135, 210], "note": "Manual framing estimate, no claim of camera calibration."}, "approximationNotes": []};
  root.userData.materialPipeline = {};
  root.userData.materialReferenceRegistry = null;

  const materialMap: Record<string, THREE.Material> = {};
  materialMap["base"] = createSculptMaterial(
    "base",
    {"id": "base", "name": "base observed surface", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#10171c", "color": "#10171c", "albedo": {"dominant": "#10171c", "secondary": ["#159ee8"], "samplingNotes": "Distinct flat pigment zones observed in reference; highlights are not copied as albedo."}, "colorVariation": {"palette": ["#10171c", "#159ee8"], "pattern": "bounded painted polygons", "amplitude": 0, "heightCorrelation": 0}, "roughness": {"base": 0.25, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "Small moulded plastic finish variation"}, "metalness": {"base": 0, "variation": 0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0, "scratches": [], "chips": []}, "dirt": {"amount": 0, "cavityBias": 0, "color": "#2F2A22"}, "localOverrides": [{"id": "base-finish", "mask": "observed feature zones", "roughness": 0.25, "clearcoat": 0.8, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Photo PBR inference is limited; catalog clean moulded toy materials. No image-to-PBR measurement claim.", "textureless": {"declared": true, "evidence": ["D:\\Administartor\\Study\\WorkStation\\ModelBenchLab\\shared\\assets\\mini4wd-astra\\references\\spider.png : isolated pigment regions are smooth clean moulded surfaces at the reference view scale. Hard-edged printed livery, tire tread and fasteners are represented by separate geometry. No grain/pores are resolved or claimed; a photo-exact microscopic finish is outside the observation confidence."]}},
    options
  );
  materialMap["rubber"] = createSculptMaterial(
    "rubber",
    {"id": "rubber", "name": "rubber observed surface", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#14191c", "color": "#14191c", "albedo": {"dominant": "#14191c", "secondary": ["#159ee8"], "samplingNotes": "Distinct flat pigment zones observed in reference; highlights are not copied as albedo."}, "colorVariation": {"palette": ["#14191c", "#159ee8"], "pattern": "bounded painted polygons", "amplitude": 0, "heightCorrelation": 0}, "roughness": {"base": 0.84, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "Small moulded plastic finish variation"}, "metalness": {"base": 0, "variation": 0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0, "scratches": [], "chips": []}, "dirt": {"amount": 0, "cavityBias": 0, "color": "#2F2A22"}, "localOverrides": [{"id": "rubber-finish", "mask": "observed feature zones", "roughness": 0.84, "clearcoat": 0, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Photo PBR inference is limited; catalog clean moulded toy materials. No image-to-PBR measurement claim.", "textureless": {"declared": true, "evidence": ["D:\\Administartor\\Study\\WorkStation\\ModelBenchLab\\shared\\assets\\mini4wd-astra\\references\\spider.png : isolated pigment regions are smooth clean moulded surfaces at the reference view scale. Hard-edged printed livery, tire tread and fasteners are represented by separate geometry. No grain/pores are resolved or claimed; a photo-exact microscopic finish is outside the observation confidence."]}},
    options
  );
  materialMap["metal"] = createSculptMaterial(
    "metal",
    {"id": "metal", "name": "metal observed surface", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#bac5cd", "color": "#bac5cd", "albedo": {"dominant": "#bac5cd", "secondary": ["#159ee8"], "samplingNotes": "Distinct flat pigment zones observed in reference; highlights are not copied as albedo."}, "colorVariation": {"palette": ["#bac5cd", "#159ee8"], "pattern": "bounded painted polygons", "amplitude": 0, "heightCorrelation": 0}, "roughness": {"base": 0.22, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "Small moulded plastic finish variation"}, "metalness": {"base": 0.85, "variation": 0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0, "scratches": [], "chips": []}, "dirt": {"amount": 0, "cavityBias": 0, "color": "#2F2A22"}, "localOverrides": [{"id": "metal-finish", "mask": "observed feature zones", "roughness": 0.22, "clearcoat": 0, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Photo PBR inference is limited; catalog clean moulded toy materials. No image-to-PBR measurement claim.", "textureless": {"declared": true, "evidence": ["D:\\Administartor\\Study\\WorkStation\\ModelBenchLab\\shared\\assets\\mini4wd-astra\\references\\spider.png : isolated pigment regions are smooth clean moulded surfaces at the reference view scale. Hard-edged printed livery, tire tread and fasteners are represented by separate geometry. No grain/pores are resolved or claimed; a photo-exact microscopic finish is outside the observation confidence."]}},
    options
  );
  materialMap["glass"] = createSculptMaterial(
    "glass",
    {"id": "glass", "name": "glass observed surface", "type": "physical", "shaderModel": "MeshStandardMaterial / PBR approximation", "baseColor": "#b99950", "color": "#b99950", "albedo": {"dominant": "#b99950", "secondary": ["#159ee8"], "samplingNotes": "Distinct flat pigment zones observed in reference; highlights are not copied as albedo."}, "colorVariation": {"palette": ["#b99950", "#159ee8"], "pattern": "bounded painted polygons", "amplitude": 0, "heightCorrelation": 0}, "roughness": {"base": 0.1, "variation": 0.02, "map": "independent-procedural-field", "localResponse": "Small moulded plastic finish variation"}, "metalness": {"base": 0.3, "variation": 0}, "ambientOcclusion": {"cavityStrength": 0.25, "contactShadowBias": 0.35, "notes": "Darken creases, seams, intersections, and recessed local features."}, "wear": {"edgeWear": 0, "scratches": [], "chips": []}, "dirt": {"amount": 0, "cavityBias": 0, "color": "#2F2A22"}, "localOverrides": [{"id": "glass-finish", "mask": "observed feature zones", "roughness": 0.1, "clearcoat": 0, "evidenceRefs": ["full-object"]}], "shaderNotes": ["Prefer MeshPhysicalMaterial when clearcoat, sheen, transmission, or thin-surface response is observed; otherwise use MeshStandardMaterial-compatible PBR channels.", "Generate albedo, roughness, height/normal, and AO independently; never alias albedo into roughness.", "Use normal/bump/displacement only when they map to observed surface relief.", "Use displacement geometry when the observed relief changes the close-up silhouette; texture-only relief is insufficient there."], "notes": "Photo PBR inference is limited; catalog clean moulded toy materials. No image-to-PBR measurement claim.", "textureless": {"declared": true, "evidence": ["D:\\Administartor\\Study\\WorkStation\\ModelBenchLab\\shared\\assets\\mini4wd-astra\\references\\spider.png : isolated pigment regions are smooth clean moulded surfaces at the reference view scale. Hard-edged printed livery, tire tread and fasteners are represented by separate geometry. No grain/pores are resolved or claimed; a photo-exact microscopic finish is outside the observation confidence."]}},
    options
  );

  const nodes: Record<string, THREE.Object3D> = { root };
  const meshes: Record<string, THREE.Mesh> = {};
  const sockets: Record<string, THREE.Object3D> = {};
  const colliders: Record<string, unknown> = {};
  const destructionGroups: Record<string, THREE.Object3D[]> = {};

  const endpoint_root_0 = makeAttachmentEndpoint(null);
  const node_root_0 = new THREE.Group();
  node_root_0.name = "root__pivot";
  node_root_0.scale.set(1, 1, 1);
  if (endpoint_root_0) {
    node_root_0.position.copy(endpoint_root_0.start);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_root_0.position.set(0.0, 0.0, 0.0);
    node_root_0.rotation.set(0.0, 0.0, 0.0);
  }
  node_root_0.userData.sculptComponent = {"id": "root", "name": "root", "level": "macro", "role": "body", "importance": 1, "confidence": 0.7, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "hidden": true}, "parent": null, "attachment": null, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": ["root"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_root_0.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": ["root"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_root_0);
  nodes["root"] = node_root_0;
  const mesh_root_0Geometry = endpoint_root_0
    ? new THREE.CylinderGeometry(endpoint_root_0.endRadius, endpoint_root_0.baseRadius, endpoint_root_0.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_root_0) {
    mesh_root_0Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_root_0 = new THREE.Mesh(
    mesh_root_0Geometry,
    materialMap["base"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_root_0.name = "root";
  if (endpoint_root_0) {
    mesh_root_0.position.copy(endpoint_root_0.midpoint);
    mesh_root_0.quaternion.copy(endpoint_root_0.quaternion);
  }
  mesh_root_0.castShadow = options.castShadow ?? true;
  mesh_root_0.receiveShadow = options.receiveShadow ?? true;
  mesh_root_0.userData.sculptComponent = {"id": "root", "name": "root", "level": "macro", "role": "body", "importance": 1, "confidence": 0.7, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "hidden": true}, "parent": null, "attachment": null, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "root", "seamRefs": [], "detachableFragments": ["root"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_root_0.add(mesh_root_0);
  meshes["root"] = mesh_root_0;
  colliders["root"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["root"] ??= [];
  destructionGroups["root"].push(node_root_0);

  const endpoint_chassis_1 = makeAttachmentEndpoint(null);
  const node_chassis_1 = new THREE.Group();
  node_chassis_1.name = "chassis__pivot";
  node_chassis_1.scale.set(1, 1, 1);
  if (endpoint_chassis_1) {
    node_chassis_1.position.copy(endpoint_chassis_1.start);
    node_chassis_1.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_chassis_1.position.set(0.0, 7.0, 0.0);
    node_chassis_1.rotation.set(0.0, 0.0, 0.0);
  }
  node_chassis_1.userData.sculptComponent = {"id": "chassis", "name": "chassis", "level": "macro", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "chassis-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 40, "height": 4, "depth": 110, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 7, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "chassis", "seamRefs": [], "detachableFragments": ["chassis"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-7", "type": "contour", "description": "Shell edge thickness and panel creases", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_chassis_1.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "chassis", "seamRefs": [], "detachableFragments": ["chassis"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_chassis_1);
  nodes["chassis"] = node_chassis_1;
  const mesh_chassis_1Geometry = endpoint_chassis_1
    ? new THREE.CylinderGeometry(endpoint_chassis_1.endRadius, endpoint_chassis_1.baseRadius, endpoint_chassis_1.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_chassis_1) {
    mesh_chassis_1Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_chassis_1 = new THREE.Mesh(
    mesh_chassis_1Geometry,
    materialMap["rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_chassis_1.name = "chassis";
  if (endpoint_chassis_1) {
    mesh_chassis_1.position.copy(endpoint_chassis_1.midpoint);
    mesh_chassis_1.quaternion.copy(endpoint_chassis_1.quaternion);
  }
  mesh_chassis_1.castShadow = options.castShadow ?? true;
  mesh_chassis_1.receiveShadow = options.receiveShadow ?? true;
  mesh_chassis_1.userData.sculptComponent = {"id": "chassis", "name": "chassis", "level": "macro", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "chassis-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 40, "height": 4, "depth": 110, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 7, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "chassis", "seamRefs": [], "detachableFragments": ["chassis"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-7", "type": "contour", "description": "Shell edge thickness and panel creases", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_chassis_1.add(mesh_chassis_1);
  meshes["chassis"] = mesh_chassis_1;
  colliders["chassis"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["chassis"] ??= [];
  destructionGroups["chassis"].push(node_chassis_1);

  const endpoint_shell_2 = makeAttachmentEndpoint(null);
  const node_shell_2 = new THREE.Group();
  node_shell_2.name = "shell__pivot";
  node_shell_2.scale.set(1, 1, 1);
  if (endpoint_shell_2) {
    node_shell_2.position.copy(endpoint_shell_2.start);
    node_shell_2.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_shell_2.position.set(0.0, 0.0, 0.0);
    node_shell_2.rotation.set(0.0, 0.0, 0.0);
  }
  node_shell_2.userData.sculptComponent = {"id": "shell", "name": "shell", "level": "macro", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "hidden": true}, "parent": "root", "attachment": {"parentSocket": "shell-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "shell", "seamRefs": [], "detachableFragments": ["shell"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-0", "type": "contour", "description": "宽曲面前铲与两侧红色梯形灯", "evidenceRefs": ["full-object"]}, {"id": "detail-1", "type": "contour", "description": "贯穿前壳的蓝白双线蛛网", "evidenceRefs": ["full-object"]}, {"id": "detail-2", "type": "contour", "description": "窄长金色座舱", "evidenceRefs": ["full-object"]}, {"id": "detail-3", "type": "contour", "description": "红色后肩尖角纹、外露绿色齿箱", "evidenceRefs": ["full-object"]}, {"id": "detail-4", "type": "contour", "description": "纵向脊梁贯穿百叶双尾翼", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_shell_2.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "shell", "seamRefs": [], "detachableFragments": ["shell"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_shell_2);
  nodes["shell"] = node_shell_2;
  const mesh_shell_2Geometry = endpoint_shell_2
    ? new THREE.CylinderGeometry(endpoint_shell_2.endRadius, endpoint_shell_2.baseRadius, endpoint_shell_2.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_shell_2) {
    mesh_shell_2Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_shell_2 = new THREE.Mesh(
    mesh_shell_2Geometry,
    materialMap["base"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_shell_2.name = "shell";
  if (endpoint_shell_2) {
    mesh_shell_2.position.copy(endpoint_shell_2.midpoint);
    mesh_shell_2.quaternion.copy(endpoint_shell_2.quaternion);
  }
  mesh_shell_2.castShadow = options.castShadow ?? true;
  mesh_shell_2.receiveShadow = options.receiveShadow ?? true;
  mesh_shell_2.userData.sculptComponent = {"id": "shell", "name": "shell", "level": "macro", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "hidden": true}, "parent": "root", "attachment": {"parentSocket": "shell-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 1, "height": 1, "depth": 1, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "shell", "seamRefs": [], "detachableFragments": ["shell"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-0", "type": "contour", "description": "宽曲面前铲与两侧红色梯形灯", "evidenceRefs": ["full-object"]}, {"id": "detail-1", "type": "contour", "description": "贯穿前壳的蓝白双线蛛网", "evidenceRefs": ["full-object"]}, {"id": "detail-2", "type": "contour", "description": "窄长金色座舱", "evidenceRefs": ["full-object"]}, {"id": "detail-3", "type": "contour", "description": "红色后肩尖角纹、外露绿色齿箱", "evidenceRefs": ["full-object"]}, {"id": "detail-4", "type": "contour", "description": "纵向脊梁贯穿百叶双尾翼", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_shell_2.add(mesh_shell_2);
  meshes["shell"] = mesh_shell_2;
  colliders["shell"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["shell"] ??= [];
  destructionGroups["shell"].push(node_shell_2);

  const endpoint_broad_connected_front_shell_3 = makeAttachmentEndpoint(null);
  const node_broad_connected_front_shell_3 = new THREE.Group();
  node_broad_connected_front_shell_3.name = "broad-connected-front-shell__pivot";
  node_broad_connected_front_shell_3.scale.set(1, 1, 1);
  if (endpoint_broad_connected_front_shell_3) {
    node_broad_connected_front_shell_3.position.copy(endpoint_broad_connected_front_shell_3.start);
    node_broad_connected_front_shell_3.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_broad_connected_front_shell_3.position.set(0.0, 0.0, 0.0);
    node_broad_connected_front_shell_3.rotation.set(0.0, 0.0, 0.0);
  }
  node_broad_connected_front_shell_3.userData.sculptComponent = {"id": "broad-connected-front-shell", "name": "broad-connected-front-shell", "level": "meso", "role": "body", "importance": 1, "confidence": 0.7, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "parametric row and cross-section coordinates", "normalStrategy": "vertex normals from generated geometry", "surfaceRows": [[61, -26, 26, 10, 10, 0], [55, -34, 34, 14, 14, 0], [40, -34, 34, 22, 22, 0], [25, -31, 31, 26, 26, 0], [11, -22, 22, 28, 28, 0], [-2, -17, 17, 28, 28, 0], [-31, -12, 12, 27, 27, 0]], "mirrorX": false, "wallThickness": 1.2}, "parent": "shell", "attachment": {"parentSocket": "broad-connected-front-shell-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 68, "height": 19.2, "depth": 92, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "broad-connected-front-shell", "seamRefs": [], "detachableFragments": ["broad-connected-front-shell"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["broad-connected-front-shell-bevel", "broad-connected-front-shell-paint-boundary"], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_broad_connected_front_shell_3.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "broad-connected-front-shell", "seamRefs": [], "detachableFragments": ["broad-connected-front-shell"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["shell"] ?? root).add(node_broad_connected_front_shell_3);
  nodes["broad-connected-front-shell"] = node_broad_connected_front_shell_3;
  const mesh_broad_connected_front_shell_3Geometry = endpoint_broad_connected_front_shell_3
    ? new THREE.CylinderGeometry(endpoint_broad_connected_front_shell_3.endRadius, endpoint_broad_connected_front_shell_3.baseRadius, endpoint_broad_connected_front_shell_3.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_broad_connected_front_shell_3) {
    mesh_broad_connected_front_shell_3Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_broad_connected_front_shell_3 = new THREE.Mesh(
    mesh_broad_connected_front_shell_3Geometry,
    materialMap["base"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_broad_connected_front_shell_3.name = "broad-connected-front-shell";
  if (endpoint_broad_connected_front_shell_3) {
    mesh_broad_connected_front_shell_3.position.copy(endpoint_broad_connected_front_shell_3.midpoint);
    mesh_broad_connected_front_shell_3.quaternion.copy(endpoint_broad_connected_front_shell_3.quaternion);
  }
  mesh_broad_connected_front_shell_3.castShadow = options.castShadow ?? true;
  mesh_broad_connected_front_shell_3.receiveShadow = options.receiveShadow ?? true;
  mesh_broad_connected_front_shell_3.userData.sculptComponent = {"id": "broad-connected-front-shell", "name": "broad-connected-front-shell", "level": "meso", "role": "body", "importance": 1, "confidence": 0.7, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "parametric row and cross-section coordinates", "normalStrategy": "vertex normals from generated geometry", "surfaceRows": [[61, -26, 26, 10, 10, 0], [55, -34, 34, 14, 14, 0], [40, -34, 34, 22, 22, 0], [25, -31, 31, 26, 26, 0], [11, -22, 22, 28, 28, 0], [-2, -17, 17, 28, 28, 0], [-31, -12, 12, 27, 27, 0]], "mirrorX": false, "wallThickness": 1.2}, "parent": "shell", "attachment": {"parentSocket": "broad-connected-front-shell-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 68, "height": 19.2, "depth": 92, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "broad-connected-front-shell", "seamRefs": [], "detachableFragments": ["broad-connected-front-shell"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["broad-connected-front-shell-bevel", "broad-connected-front-shell-paint-boundary"], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_broad_connected_front_shell_3.add(mesh_broad_connected_front_shell_3);
  meshes["broad-connected-front-shell"] = mesh_broad_connected_front_shell_3;
  colliders["broad-connected-front-shell"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["broad-connected-front-shell"] ??= [];
  destructionGroups["broad-connected-front-shell"].push(node_broad_connected_front_shell_3);

  const endpoint_front_swept_knife_4 = makeAttachmentEndpoint(null);
  const node_front_swept_knife_4 = new THREE.Group();
  node_front_swept_knife_4.name = "front-swept-knife__pivot";
  node_front_swept_knife_4.scale.set(1, 1, 1);
  if (endpoint_front_swept_knife_4) {
    node_front_swept_knife_4.position.copy(endpoint_front_swept_knife_4.start);
    node_front_swept_knife_4.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_front_swept_knife_4.position.set(0.0, 0.0, 0.0);
    node_front_swept_knife_4.rotation.set(0.0, 0.0, 0.0);
  }
  node_front_swept_knife_4.userData.sculptComponent = {"id": "front-swept-knife", "name": "front-swept-knife", "level": "meso", "role": "body", "importance": 1, "confidence": 0.7, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "parametric row and cross-section coordinates", "normalStrategy": "vertex normals from generated geometry", "surfaceRows": [[54, 28, 36, 13, 10, 0], [31, 31, 40, 19, 12, 0], [13, 24, 40, 24, 10, 0], [5, 20, 32, 25, 14, 0]], "mirrorX": true, "wallThickness": 1.2}, "parent": "shell", "attachment": {"parentSocket": "front-swept-knife-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 20, "height": 16.2, "depth": 49, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "front-swept-knife", "seamRefs": [], "detachableFragments": ["front-swept-knife"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["front-swept-knife-bevel", "front-swept-knife-paint-boundary"], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_front_swept_knife_4.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "front-swept-knife", "seamRefs": [], "detachableFragments": ["front-swept-knife"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["shell"] ?? root).add(node_front_swept_knife_4);
  nodes["front-swept-knife"] = node_front_swept_knife_4;
  const mesh_front_swept_knife_4Geometry = endpoint_front_swept_knife_4
    ? new THREE.CylinderGeometry(endpoint_front_swept_knife_4.endRadius, endpoint_front_swept_knife_4.baseRadius, endpoint_front_swept_knife_4.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_front_swept_knife_4) {
    mesh_front_swept_knife_4Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_front_swept_knife_4 = new THREE.Mesh(
    mesh_front_swept_knife_4Geometry,
    materialMap["base"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_front_swept_knife_4.name = "front-swept-knife";
  if (endpoint_front_swept_knife_4) {
    mesh_front_swept_knife_4.position.copy(endpoint_front_swept_knife_4.midpoint);
    mesh_front_swept_knife_4.quaternion.copy(endpoint_front_swept_knife_4.quaternion);
  }
  mesh_front_swept_knife_4.castShadow = options.castShadow ?? true;
  mesh_front_swept_knife_4.receiveShadow = options.receiveShadow ?? true;
  mesh_front_swept_knife_4.userData.sculptComponent = {"id": "front-swept-knife", "name": "front-swept-knife", "level": "meso", "role": "body", "importance": 1, "confidence": 0.7, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "parametric row and cross-section coordinates", "normalStrategy": "vertex normals from generated geometry", "surfaceRows": [[54, 28, 36, 13, 10, 0], [31, 31, 40, 19, 12, 0], [13, 24, 40, 24, 10, 0], [5, 20, 32, 25, 14, 0]], "mirrorX": true, "wallThickness": 1.2}, "parent": "shell", "attachment": {"parentSocket": "front-swept-knife-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 20, "height": 16.2, "depth": 49, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "front-swept-knife", "seamRefs": [], "detachableFragments": ["front-swept-knife"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["front-swept-knife-bevel", "front-swept-knife-paint-boundary"], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_front_swept_knife_4.add(mesh_front_swept_knife_4);
  meshes["front-swept-knife"] = mesh_front_swept_knife_4;
  colliders["front-swept-knife"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["front-swept-knife"] ??= [];
  destructionGroups["front-swept-knife"].push(node_front_swept_knife_4);

  const endpoint_rear_high_shoulder_5 = makeAttachmentEndpoint(null);
  const node_rear_high_shoulder_5 = new THREE.Group();
  node_rear_high_shoulder_5.name = "rear-high-shoulder__pivot";
  node_rear_high_shoulder_5.scale.set(1, 1, 1);
  if (endpoint_rear_high_shoulder_5) {
    node_rear_high_shoulder_5.position.copy(endpoint_rear_high_shoulder_5.start);
    node_rear_high_shoulder_5.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_rear_high_shoulder_5.position.set(0.0, 0.0, 0.0);
    node_rear_high_shoulder_5.rotation.set(0.0, 0.0, 0.0);
  }
  node_rear_high_shoulder_5.userData.sculptComponent = {"id": "rear-high-shoulder", "name": "rear-high-shoulder", "level": "meso", "role": "body", "importance": 1, "confidence": 0.7, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "parametric row and cross-section coordinates", "normalStrategy": "vertex normals from generated geometry", "surfaceRows": [[1, 17, 21, 27, 24, 0], [-17, 16, 34, 32, 27, 2], [-35, 23, 36, 34, 23, 2], [-48, 27, 36, 29, 17, 1]], "mirrorX": true, "wallThickness": 1.2}, "parent": "shell", "attachment": {"parentSocket": "rear-high-shoulder-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 20, "height": 17.2, "depth": 49, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "rear-high-shoulder", "seamRefs": [], "detachableFragments": ["rear-high-shoulder"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["rear-high-shoulder-bevel", "rear-high-shoulder-paint-boundary"], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_rear_high_shoulder_5.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "rear-high-shoulder", "seamRefs": [], "detachableFragments": ["rear-high-shoulder"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["shell"] ?? root).add(node_rear_high_shoulder_5);
  nodes["rear-high-shoulder"] = node_rear_high_shoulder_5;
  const mesh_rear_high_shoulder_5Geometry = endpoint_rear_high_shoulder_5
    ? new THREE.CylinderGeometry(endpoint_rear_high_shoulder_5.endRadius, endpoint_rear_high_shoulder_5.baseRadius, endpoint_rear_high_shoulder_5.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_rear_high_shoulder_5) {
    mesh_rear_high_shoulder_5Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_rear_high_shoulder_5 = new THREE.Mesh(
    mesh_rear_high_shoulder_5Geometry,
    materialMap["base"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rear_high_shoulder_5.name = "rear-high-shoulder";
  if (endpoint_rear_high_shoulder_5) {
    mesh_rear_high_shoulder_5.position.copy(endpoint_rear_high_shoulder_5.midpoint);
    mesh_rear_high_shoulder_5.quaternion.copy(endpoint_rear_high_shoulder_5.quaternion);
  }
  mesh_rear_high_shoulder_5.castShadow = options.castShadow ?? true;
  mesh_rear_high_shoulder_5.receiveShadow = options.receiveShadow ?? true;
  mesh_rear_high_shoulder_5.userData.sculptComponent = {"id": "rear-high-shoulder", "name": "rear-high-shoulder", "level": "meso", "role": "body", "importance": 1, "confidence": 0.7, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "parametric row and cross-section coordinates", "normalStrategy": "vertex normals from generated geometry", "surfaceRows": [[1, 17, 21, 27, 24, 0], [-17, 16, 34, 32, 27, 2], [-35, 23, 36, 34, 23, 2], [-48, 27, 36, 29, 17, 1]], "mirrorX": true, "wallThickness": 1.2}, "parent": "shell", "attachment": {"parentSocket": "rear-high-shoulder-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 20, "height": 17.2, "depth": 49, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "rear-high-shoulder", "seamRefs": [], "detachableFragments": ["rear-high-shoulder"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["rear-high-shoulder-bevel", "rear-high-shoulder-paint-boundary"], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_rear_high_shoulder_5.add(mesh_rear_high_shoulder_5);
  meshes["rear-high-shoulder"] = mesh_rear_high_shoulder_5;
  colliders["rear-high-shoulder"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["rear-high-shoulder"] ??= [];
  destructionGroups["rear-high-shoulder"].push(node_rear_high_shoulder_5);

  const endpoint_central_tail_spine_6 = makeAttachmentEndpoint(null);
  const node_central_tail_spine_6 = new THREE.Group();
  node_central_tail_spine_6.name = "central-tail-spine__pivot";
  node_central_tail_spine_6.scale.set(1, 1, 1);
  if (endpoint_central_tail_spine_6) {
    node_central_tail_spine_6.position.copy(endpoint_central_tail_spine_6.start);
    node_central_tail_spine_6.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_central_tail_spine_6.position.set(0.0, 0.0, 0.0);
    node_central_tail_spine_6.rotation.set(0.0, 0.0, 0.0);
  }
  node_central_tail_spine_6.userData.sculptComponent = {"id": "central-tail-spine", "name": "central-tail-spine", "level": "meso", "role": "body", "importance": 1, "confidence": 0.7, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "parametric row and cross-section coordinates", "normalStrategy": "vertex normals from generated geometry", "surfaceRows": [[-29, -5, 5, 30, 30, 0], [-44, -3, 3, 35, 35, 0], [-65, -3, 3, 43, 43, 0]], "mirrorX": false, "wallThickness": 1.2}, "parent": "shell", "attachment": {"parentSocket": "central-tail-spine-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 10, "height": 14.2, "depth": 36, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "central-tail-spine", "seamRefs": [], "detachableFragments": ["central-tail-spine"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["central-tail-spine-bevel", "central-tail-spine-paint-boundary"], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_central_tail_spine_6.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "central-tail-spine", "seamRefs": [], "detachableFragments": ["central-tail-spine"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["shell"] ?? root).add(node_central_tail_spine_6);
  nodes["central-tail-spine"] = node_central_tail_spine_6;
  const mesh_central_tail_spine_6Geometry = endpoint_central_tail_spine_6
    ? new THREE.CylinderGeometry(endpoint_central_tail_spine_6.endRadius, endpoint_central_tail_spine_6.baseRadius, endpoint_central_tail_spine_6.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_central_tail_spine_6) {
    mesh_central_tail_spine_6Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_central_tail_spine_6 = new THREE.Mesh(
    mesh_central_tail_spine_6Geometry,
    materialMap["base"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_central_tail_spine_6.name = "central-tail-spine";
  if (endpoint_central_tail_spine_6) {
    mesh_central_tail_spine_6.position.copy(endpoint_central_tail_spine_6.midpoint);
    mesh_central_tail_spine_6.quaternion.copy(endpoint_central_tail_spine_6.quaternion);
  }
  mesh_central_tail_spine_6.castShadow = options.castShadow ?? true;
  mesh_central_tail_spine_6.receiveShadow = options.receiveShadow ?? true;
  mesh_central_tail_spine_6.userData.sculptComponent = {"id": "central-tail-spine", "name": "central-tail-spine", "level": "meso", "role": "body", "importance": 1, "confidence": 0.7, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "parametric row and cross-section coordinates", "normalStrategy": "vertex normals from generated geometry", "surfaceRows": [[-29, -5, 5, 30, 30, 0], [-44, -3, 3, 35, 35, 0], [-65, -3, 3, 43, 43, 0]], "mirrorX": false, "wallThickness": 1.2}, "parent": "shell", "attachment": {"parentSocket": "central-tail-spine-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 10, "height": 14.2, "depth": 36, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "central-tail-spine", "seamRefs": [], "detachableFragments": ["central-tail-spine"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": ["central-tail-spine-bevel", "central-tail-spine-paint-boundary"], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_central_tail_spine_6.add(mesh_central_tail_spine_6);
  meshes["central-tail-spine"] = mesh_central_tail_spine_6;
  colliders["central-tail-spine"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["central-tail-spine"] ??= [];
  destructionGroups["central-tail-spine"].push(node_central_tail_spine_6);

  const endpoint_canopy_7 = makeAttachmentEndpoint(null);
  const node_canopy_7 = new THREE.Group();
  node_canopy_7.name = "canopy__pivot";
  node_canopy_7.scale.set(1, 1, 1);
  if (endpoint_canopy_7) {
    node_canopy_7.position.copy(endpoint_canopy_7.start);
    node_canopy_7.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_canopy_7.position.set(0.0, 0.0, 0.0);
    node_canopy_7.rotation.set(0.0, 0.0, 0.0);
  }
  node_canopy_7.userData.sculptComponent = {"id": "canopy", "name": "canopy", "level": "macro", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "sectionRows": [[23, 6, 21, 23], [8, 11, 24, 31], [-17, 12, 27, 33], [-33, 6, 25, 28]], "wallThickness": 0.7}, "parent": "root", "attachment": {"parentSocket": "canopy-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 26, "height": 12, "depth": 50, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "canopy", "seamRefs": [], "detachableFragments": ["canopy"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "glass", "materialLayers": ["glass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(185, 153, 80, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "glass", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_canopy_7.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "canopy", "seamRefs": [], "detachableFragments": ["canopy"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_canopy_7);
  nodes["canopy"] = node_canopy_7;
  const mesh_canopy_7Geometry = endpoint_canopy_7
    ? new THREE.CylinderGeometry(endpoint_canopy_7.endRadius, endpoint_canopy_7.baseRadius, endpoint_canopy_7.length, 16, 6)
    : buildExtrudeGeometry({"points": [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]], "depth": 0.1});
  if (!endpoint_canopy_7) {
    mesh_canopy_7Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_canopy_7 = new THREE.Mesh(
    mesh_canopy_7Geometry,
    materialMap["glass"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_canopy_7.name = "canopy";
  if (endpoint_canopy_7) {
    mesh_canopy_7.position.copy(endpoint_canopy_7.midpoint);
    mesh_canopy_7.quaternion.copy(endpoint_canopy_7.quaternion);
  }
  mesh_canopy_7.castShadow = options.castShadow ?? true;
  mesh_canopy_7.receiveShadow = options.receiveShadow ?? true;
  mesh_canopy_7.userData.sculptComponent = {"id": "canopy", "name": "canopy", "level": "macro", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "extrude", "topologyClass": "conforming-shell", "topologyRationale": "Thin separately traced classic moulded panel with non-uniform section; authored surface rows define actual shape.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry", "sectionRows": [[23, 6, 21, 23], [8, 11, 24, 31], [-17, 12, 27, 33], [-33, 6, 25, 28]], "wallThickness": 0.7}, "parent": "root", "attachment": {"parentSocket": "canopy-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 26, "height": 12, "depth": 50, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "canopy", "seamRefs": [], "detachableFragments": ["canopy"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "glass", "materialLayers": ["glass"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(185, 153, 80, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "glass", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_canopy_7.add(mesh_canopy_7);
  meshes["canopy"] = mesh_canopy_7;
  colliders["canopy"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["canopy"] ??= [];
  destructionGroups["canopy"].push(node_canopy_7);

  const endpoint_wing_8 = makeAttachmentEndpoint(null);
  const node_wing_8 = new THREE.Group();
  node_wing_8.name = "wing__pivot";
  node_wing_8.scale.set(1, 1, 1);
  if (endpoint_wing_8) {
    node_wing_8.position.copy(endpoint_wing_8.start);
    node_wing_8.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_wing_8.position.set(0.0, 34.0, -49.0);
    node_wing_8.rotation.set(0.0, 0.0, 0.0);
  }
  node_wing_8.userData.sculptComponent = {"id": "wing", "name": "wing", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "wing-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 61, "height": 1.3, "depth": 22, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 34, -49], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wing", "seamRefs": [], "detachableFragments": ["wing"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_wing_8.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wing", "seamRefs": [], "detachableFragments": ["wing"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_wing_8);
  nodes["wing"] = node_wing_8;
  const mesh_wing_8Geometry = endpoint_wing_8
    ? new THREE.CylinderGeometry(endpoint_wing_8.endRadius, endpoint_wing_8.baseRadius, endpoint_wing_8.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_wing_8) {
    mesh_wing_8Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_wing_8 = new THREE.Mesh(
    mesh_wing_8Geometry,
    materialMap["base"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wing_8.name = "wing";
  if (endpoint_wing_8) {
    mesh_wing_8.position.copy(endpoint_wing_8.midpoint);
    mesh_wing_8.quaternion.copy(endpoint_wing_8.quaternion);
  }
  mesh_wing_8.castShadow = options.castShadow ?? true;
  mesh_wing_8.receiveShadow = options.receiveShadow ?? true;
  mesh_wing_8.userData.sculptComponent = {"id": "wing", "name": "wing", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "wing-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 61, "height": 1.3, "depth": 22, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 34, -49], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wing", "seamRefs": [], "detachableFragments": ["wing"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "base", "materialLayers": ["base"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(16, 23, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "plastic", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_wing_8.add(mesh_wing_8);
  meshes["wing"] = mesh_wing_8;
  colliders["wing"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["wing"] ??= [];
  destructionGroups["wing"].push(node_wing_8);

  const attachment_wheel_0_9 = {"parentSocket": "wheel-0-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3};
  const endpoint_wheel_0_9 = makeAttachmentEndpoint(attachment_wheel_0_9);
  const node_wheel_0_9 = new THREE.Group();
  node_wheel_0_9.name = "wheel-0__pivot";
  node_wheel_0_9.scale.set(1, 1, 1);
  if (endpoint_wheel_0_9) {
    node_wheel_0_9.position.copy(endpoint_wheel_0_9.start);
    node_wheel_0_9.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_wheel_0_9.position.set(-32.0, 13.0, 40.0);
    node_wheel_0_9.rotation.set(0.0, 0.0, 0.0);
  }
  node_wheel_0_9.userData.sculptComponent = {"id": "wheel-0", "name": "wheel-0", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "wheel-0-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 26, "height": 9, "depth": 26, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [-32, 13, 40], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-0", "seamRefs": [], "detachableFragments": ["wheel-0"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-5", "type": "contour", "description": "Four rotating tires and catalog wheel colour", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_wheel_0_9.userData.actionProfile = {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-0", "seamRefs": [], "detachableFragments": ["wheel-0"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_wheel_0_9);
  nodes["wheel-0"] = node_wheel_0_9;
  const mesh_wheel_0_9Geometry = endpoint_wheel_0_9
    ? new THREE.CylinderGeometry(endpoint_wheel_0_9.endRadius, endpoint_wheel_0_9.baseRadius, endpoint_wheel_0_9.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_wheel_0_9) {
    mesh_wheel_0_9Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_wheel_0_9 = new THREE.Mesh(
    mesh_wheel_0_9Geometry,
    materialMap["rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_0_9.name = "wheel-0";
  if (endpoint_wheel_0_9) {
    mesh_wheel_0_9.position.copy(endpoint_wheel_0_9.midpoint);
    mesh_wheel_0_9.quaternion.copy(endpoint_wheel_0_9.quaternion);
  }
  mesh_wheel_0_9.castShadow = options.castShadow ?? true;
  mesh_wheel_0_9.receiveShadow = options.receiveShadow ?? true;
  mesh_wheel_0_9.userData.sculptComponent = {"id": "wheel-0", "name": "wheel-0", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "wheel-0-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 26, "height": 9, "depth": 26, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [-32, 13, 40], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-0", "seamRefs": [], "detachableFragments": ["wheel-0"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-5", "type": "contour", "description": "Four rotating tires and catalog wheel colour", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_wheel_0_9.add(mesh_wheel_0_9);
  meshes["wheel-0"] = mesh_wheel_0_9;
  colliders["wheel-0"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["wheel-0"] ??= [];
  destructionGroups["wheel-0"].push(node_wheel_0_9);

  const attachment_wheel_1_10 = {"parentSocket": "wheel-1-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3};
  const endpoint_wheel_1_10 = makeAttachmentEndpoint(attachment_wheel_1_10);
  const node_wheel_1_10 = new THREE.Group();
  node_wheel_1_10.name = "wheel-1__pivot";
  node_wheel_1_10.scale.set(1, 1, 1);
  if (endpoint_wheel_1_10) {
    node_wheel_1_10.position.copy(endpoint_wheel_1_10.start);
    node_wheel_1_10.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_wheel_1_10.position.set(32.0, 13.0, 40.0);
    node_wheel_1_10.rotation.set(0.0, 0.0, 0.0);
  }
  node_wheel_1_10.userData.sculptComponent = {"id": "wheel-1", "name": "wheel-1", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "wheel-1-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 26, "height": 9, "depth": 26, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [32, 13, 40], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-1", "seamRefs": [], "detachableFragments": ["wheel-1"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_wheel_1_10.userData.actionProfile = {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-1", "seamRefs": [], "detachableFragments": ["wheel-1"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_wheel_1_10);
  nodes["wheel-1"] = node_wheel_1_10;
  const mesh_wheel_1_10Geometry = endpoint_wheel_1_10
    ? new THREE.CylinderGeometry(endpoint_wheel_1_10.endRadius, endpoint_wheel_1_10.baseRadius, endpoint_wheel_1_10.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_wheel_1_10) {
    mesh_wheel_1_10Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_wheel_1_10 = new THREE.Mesh(
    mesh_wheel_1_10Geometry,
    materialMap["rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_1_10.name = "wheel-1";
  if (endpoint_wheel_1_10) {
    mesh_wheel_1_10.position.copy(endpoint_wheel_1_10.midpoint);
    mesh_wheel_1_10.quaternion.copy(endpoint_wheel_1_10.quaternion);
  }
  mesh_wheel_1_10.castShadow = options.castShadow ?? true;
  mesh_wheel_1_10.receiveShadow = options.receiveShadow ?? true;
  mesh_wheel_1_10.userData.sculptComponent = {"id": "wheel-1", "name": "wheel-1", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "wheel-1-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 26, "height": 9, "depth": 26, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [32, 13, 40], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-1", "seamRefs": [], "detachableFragments": ["wheel-1"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_wheel_1_10.add(mesh_wheel_1_10);
  meshes["wheel-1"] = mesh_wheel_1_10;
  colliders["wheel-1"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["wheel-1"] ??= [];
  destructionGroups["wheel-1"].push(node_wheel_1_10);

  const attachment_wheel_2_11 = {"parentSocket": "wheel-2-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3};
  const endpoint_wheel_2_11 = makeAttachmentEndpoint(attachment_wheel_2_11);
  const node_wheel_2_11 = new THREE.Group();
  node_wheel_2_11.name = "wheel-2__pivot";
  node_wheel_2_11.scale.set(1, 1, 1);
  if (endpoint_wheel_2_11) {
    node_wheel_2_11.position.copy(endpoint_wheel_2_11.start);
    node_wheel_2_11.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_wheel_2_11.position.set(-32.0, 13.0, -40.0);
    node_wheel_2_11.rotation.set(0.0, 0.0, 0.0);
  }
  node_wheel_2_11.userData.sculptComponent = {"id": "wheel-2", "name": "wheel-2", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "wheel-2-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 26, "height": 9, "depth": 26, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [-32, 13, -40], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-2", "seamRefs": [], "detachableFragments": ["wheel-2"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_wheel_2_11.userData.actionProfile = {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-2", "seamRefs": [], "detachableFragments": ["wheel-2"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_wheel_2_11);
  nodes["wheel-2"] = node_wheel_2_11;
  const mesh_wheel_2_11Geometry = endpoint_wheel_2_11
    ? new THREE.CylinderGeometry(endpoint_wheel_2_11.endRadius, endpoint_wheel_2_11.baseRadius, endpoint_wheel_2_11.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_wheel_2_11) {
    mesh_wheel_2_11Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_wheel_2_11 = new THREE.Mesh(
    mesh_wheel_2_11Geometry,
    materialMap["rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_2_11.name = "wheel-2";
  if (endpoint_wheel_2_11) {
    mesh_wheel_2_11.position.copy(endpoint_wheel_2_11.midpoint);
    mesh_wheel_2_11.quaternion.copy(endpoint_wheel_2_11.quaternion);
  }
  mesh_wheel_2_11.castShadow = options.castShadow ?? true;
  mesh_wheel_2_11.receiveShadow = options.receiveShadow ?? true;
  mesh_wheel_2_11.userData.sculptComponent = {"id": "wheel-2", "name": "wheel-2", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "wheel-2-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 26, "height": 9, "depth": 26, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [-32, 13, -40], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-2", "seamRefs": [], "detachableFragments": ["wheel-2"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_wheel_2_11.add(mesh_wheel_2_11);
  meshes["wheel-2"] = mesh_wheel_2_11;
  colliders["wheel-2"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["wheel-2"] ??= [];
  destructionGroups["wheel-2"].push(node_wheel_2_11);

  const attachment_wheel_3_12 = {"parentSocket": "wheel-3-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3};
  const endpoint_wheel_3_12 = makeAttachmentEndpoint(attachment_wheel_3_12);
  const node_wheel_3_12 = new THREE.Group();
  node_wheel_3_12.name = "wheel-3__pivot";
  node_wheel_3_12.scale.set(1, 1, 1);
  if (endpoint_wheel_3_12) {
    node_wheel_3_12.position.copy(endpoint_wheel_3_12.start);
    node_wheel_3_12.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_wheel_3_12.position.set(32.0, 13.0, -40.0);
    node_wheel_3_12.rotation.set(0.0, 0.0, 0.0);
  }
  node_wheel_3_12.userData.sculptComponent = {"id": "wheel-3", "name": "wheel-3", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "wheel-3-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 26, "height": 9, "depth": 26, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [32, 13, -40], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-3", "seamRefs": [], "detachableFragments": ["wheel-3"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_wheel_3_12.userData.actionProfile = {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-3", "seamRefs": [], "detachableFragments": ["wheel-3"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_wheel_3_12);
  nodes["wheel-3"] = node_wheel_3_12;
  const mesh_wheel_3_12Geometry = endpoint_wheel_3_12
    ? new THREE.CylinderGeometry(endpoint_wheel_3_12.endRadius, endpoint_wheel_3_12.baseRadius, endpoint_wheel_3_12.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_wheel_3_12) {
    mesh_wheel_3_12Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_wheel_3_12 = new THREE.Mesh(
    mesh_wheel_3_12Geometry,
    materialMap["rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_wheel_3_12.name = "wheel-3";
  if (endpoint_wheel_3_12) {
    mesh_wheel_3_12.position.copy(endpoint_wheel_3_12.midpoint);
    mesh_wheel_3_12.quaternion.copy(endpoint_wheel_3_12.quaternion);
  }
  mesh_wheel_3_12.castShadow = options.castShadow ?? true;
  mesh_wheel_3_12.receiveShadow = options.receiveShadow ?? true;
  mesh_wheel_3_12.userData.sculptComponent = {"id": "wheel-3", "name": "wheel-3", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "wheel-3-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 26, "height": 9, "depth": 26, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [32, 13, -40], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "wheel-spin", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "wheel-3", "seamRefs": [], "detachableFragments": ["wheel-3"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_wheel_3_12.add(mesh_wheel_3_12);
  meshes["wheel-3"] = mesh_wheel_3_12;
  colliders["wheel-3"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["wheel-3"] ??= [];
  destructionGroups["wheel-3"].push(node_wheel_3_12);

  const attachment_motor_13 = {"parentSocket": "motor-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3};
  const endpoint_motor_13 = makeAttachmentEndpoint(attachment_motor_13);
  const node_motor_13 = new THREE.Group();
  node_motor_13.name = "motor__pivot";
  node_motor_13.scale.set(1, 1, 1);
  if (endpoint_motor_13) {
    node_motor_13.position.copy(endpoint_motor_13.start);
    node_motor_13.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_motor_13.position.set(0.0, 12.0, -29.0);
    node_motor_13.rotation.set(0.0, 0.0, 0.0);
  }
  node_motor_13.userData.sculptComponent = {"id": "motor", "name": "motor", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "motor-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 20, "height": 15, "depth": 25, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 12, -29], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "motor", "seamRefs": [], "detachableFragments": ["motor"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "metal", "materialLayers": ["metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-8", "type": "contour", "description": "Independent metallic motor and axle surfaces", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(186, 197, 205, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "metal", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_motor_13.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "motor", "seamRefs": [], "detachableFragments": ["motor"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_motor_13);
  nodes["motor"] = node_motor_13;
  const mesh_motor_13Geometry = endpoint_motor_13
    ? new THREE.CylinderGeometry(endpoint_motor_13.endRadius, endpoint_motor_13.baseRadius, endpoint_motor_13.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_motor_13) {
    mesh_motor_13Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_motor_13 = new THREE.Mesh(
    mesh_motor_13Geometry,
    materialMap["metal"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_motor_13.name = "motor";
  if (endpoint_motor_13) {
    mesh_motor_13.position.copy(endpoint_motor_13.midpoint);
    mesh_motor_13.quaternion.copy(endpoint_motor_13.quaternion);
  }
  mesh_motor_13.castShadow = options.castShadow ?? true;
  mesh_motor_13.receiveShadow = options.receiveShadow ?? true;
  mesh_motor_13.userData.sculptComponent = {"id": "motor", "name": "motor", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "motor-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 20, "height": 15, "depth": 25, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 12, -29], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "motor", "seamRefs": [], "detachableFragments": ["motor"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "metal", "materialLayers": ["metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-8", "type": "contour", "description": "Independent metallic motor and axle surfaces", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(186, 197, 205, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "metal", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_motor_13.add(mesh_motor_13);
  meshes["motor"] = mesh_motor_13;
  colliders["motor"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["motor"] ??= [];
  destructionGroups["motor"].push(node_motor_13);

  const attachment_battery_14 = {"parentSocket": "battery-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3};
  const endpoint_battery_14 = makeAttachmentEndpoint(attachment_battery_14);
  const node_battery_14 = new THREE.Group();
  node_battery_14.name = "battery__pivot";
  node_battery_14.scale.set(1, 1, 1);
  if (endpoint_battery_14) {
    node_battery_14.position.copy(endpoint_battery_14.start);
    node_battery_14.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_battery_14.position.set(0.0, 11.0, 0.0);
    node_battery_14.rotation.set(0.0, 0.0, 0.0);
  }
  node_battery_14.userData.sculptComponent = {"id": "battery", "name": "battery", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "battery-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 28, "height": 14, "depth": 48, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 11, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "battery", "seamRefs": [], "detachableFragments": ["battery"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "metal", "materialLayers": ["metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-9", "type": "contour", "description": "Battery pair and transmission drive shaft", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(186, 197, 205, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "metal", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_battery_14.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "battery", "seamRefs": [], "detachableFragments": ["battery"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_battery_14);
  nodes["battery"] = node_battery_14;
  const mesh_battery_14Geometry = endpoint_battery_14
    ? new THREE.CylinderGeometry(endpoint_battery_14.endRadius, endpoint_battery_14.baseRadius, endpoint_battery_14.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_battery_14) {
    mesh_battery_14Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_battery_14 = new THREE.Mesh(
    mesh_battery_14Geometry,
    materialMap["metal"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_battery_14.name = "battery";
  if (endpoint_battery_14) {
    mesh_battery_14.position.copy(endpoint_battery_14.midpoint);
    mesh_battery_14.quaternion.copy(endpoint_battery_14.quaternion);
  }
  mesh_battery_14.castShadow = options.castShadow ?? true;
  mesh_battery_14.receiveShadow = options.receiveShadow ?? true;
  mesh_battery_14.userData.sculptComponent = {"id": "battery", "name": "battery", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "battery-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 28, "height": 14, "depth": 48, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 11, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "battery", "seamRefs": [], "detachableFragments": ["battery"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "metal", "materialLayers": ["metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-9", "type": "contour", "description": "Battery pair and transmission drive shaft", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(186, 197, 205, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "metal", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_battery_14.add(mesh_battery_14);
  meshes["battery"] = mesh_battery_14;
  colliders["battery"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["battery"] ??= [];
  destructionGroups["battery"].push(node_battery_14);

  const attachment_gear_15 = {"parentSocket": "gear-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3};
  const endpoint_gear_15 = makeAttachmentEndpoint(attachment_gear_15);
  const node_gear_15 = new THREE.Group();
  node_gear_15.name = "gear__pivot";
  node_gear_15.scale.set(1, 1, 1);
  if (endpoint_gear_15) {
    node_gear_15.position.copy(endpoint_gear_15.start);
    node_gear_15.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_gear_15.position.set(12.0, 13.0, -41.0);
    node_gear_15.rotation.set(0.0, 0.0, 0.0);
  }
  node_gear_15.userData.sculptComponent = {"id": "gear", "name": "gear", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "gear-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 14, "height": 3, "depth": 14, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [12, 13, -41], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "gear", "seamRefs": [], "detachableFragments": ["gear"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "metal", "materialLayers": ["metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(186, 197, 205, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "metal", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_gear_15.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "gear", "seamRefs": [], "detachableFragments": ["gear"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_gear_15);
  nodes["gear"] = node_gear_15;
  const mesh_gear_15Geometry = endpoint_gear_15
    ? new THREE.CylinderGeometry(endpoint_gear_15.endRadius, endpoint_gear_15.baseRadius, endpoint_gear_15.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_gear_15) {
    mesh_gear_15Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_gear_15 = new THREE.Mesh(
    mesh_gear_15Geometry,
    materialMap["metal"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_gear_15.name = "gear";
  if (endpoint_gear_15) {
    mesh_gear_15.position.copy(endpoint_gear_15.midpoint);
    mesh_gear_15.quaternion.copy(endpoint_gear_15.quaternion);
  }
  mesh_gear_15.castShadow = options.castShadow ?? true;
  mesh_gear_15.receiveShadow = options.receiveShadow ?? true;
  mesh_gear_15.userData.sculptComponent = {"id": "gear", "name": "gear", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "gear-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 14, "height": 3, "depth": 14, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [12, 13, -41], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "gear", "seamRefs": [], "detachableFragments": ["gear"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "metal", "materialLayers": ["metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(186, 197, 205, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "metal", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_gear_15.add(mesh_gear_15);
  meshes["gear"] = mesh_gear_15;
  colliders["gear"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["gear"] ??= [];
  destructionGroups["gear"].push(node_gear_15);

  const attachment_rollers_16 = {"parentSocket": "rollers-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3};
  const endpoint_rollers_16 = makeAttachmentEndpoint(attachment_rollers_16);
  const node_rollers_16 = new THREE.Group();
  node_rollers_16.name = "rollers__pivot";
  node_rollers_16.scale.set(1, 1, 1);
  if (endpoint_rollers_16) {
    node_rollers_16.position.copy(endpoint_rollers_16.start);
    node_rollers_16.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_rollers_16.position.set(0.0, 8.0, 0.0);
    node_rollers_16.rotation.set(0.0, 0.0, 0.0);
  }
  node_rollers_16.userData.sculptComponent = {"id": "rollers", "name": "rollers", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "rollers-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 90, "height": 3, "depth": 130, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 8, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "rollers", "seamRefs": [], "detachableFragments": ["rollers"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "metal", "materialLayers": ["metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-6", "type": "fastener", "description": "Guide roller discs and centre fasteners", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(186, 197, 205, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "metal", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_rollers_16.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "rollers", "seamRefs": [], "detachableFragments": ["rollers"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_rollers_16);
  nodes["rollers"] = node_rollers_16;
  const mesh_rollers_16Geometry = endpoint_rollers_16
    ? new THREE.CylinderGeometry(endpoint_rollers_16.endRadius, endpoint_rollers_16.baseRadius, endpoint_rollers_16.length, 16, 6)
    : new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 8);
  if (!endpoint_rollers_16) {
    mesh_rollers_16Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_rollers_16 = new THREE.Mesh(
    mesh_rollers_16Geometry,
    materialMap["metal"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_rollers_16.name = "rollers";
  if (endpoint_rollers_16) {
    mesh_rollers_16.position.copy(endpoint_rollers_16.midpoint);
    mesh_rollers_16.quaternion.copy(endpoint_rollers_16.quaternion);
  }
  mesh_rollers_16.castShadow = options.castShadow ?? true;
  mesh_rollers_16.receiveShadow = options.receiveShadow ?? true;
  mesh_rollers_16.userData.sculptComponent = {"id": "rollers", "name": "rollers", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "cylinder", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "rollers-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 90, "height": 3, "depth": 130, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 8, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "rollers", "seamRefs": [], "detachableFragments": ["rollers"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "metal", "materialLayers": ["metal"], "deformations": [], "joints": [], "seams": [], "localFeatures": [{"id": "detail-6", "type": "fastener", "description": "Guide roller discs and centre fasteners", "evidenceRefs": ["full-object"]}], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(186, 197, 205, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "metal", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_rollers_16.add(mesh_rollers_16);
  meshes["rollers"] = mesh_rollers_16;
  colliders["rollers"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["rollers"] ??= [];
  destructionGroups["rollers"].push(node_rollers_16);

  const endpoint_brake_17 = makeAttachmentEndpoint(null);
  const node_brake_17 = new THREE.Group();
  node_brake_17.name = "brake__pivot";
  node_brake_17.scale.set(1, 1, 1);
  if (endpoint_brake_17) {
    node_brake_17.position.copy(endpoint_brake_17.start);
    node_brake_17.rotation.set(0.0, 0.0, 0.0);
  } else {
    node_brake_17.position.set(0.0, 3.0, -61.0);
    node_brake_17.rotation.set(0.0, 0.0, 0.0);
  }
  node_brake_17.userData.sculptComponent = {"id": "brake", "name": "brake", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "brake-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 25, "height": 3, "depth": 7, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 3, -61], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brake", "seamRefs": [], "detachableFragments": ["brake"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_brake_17.userData.actionProfile = {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brake", "seamRefs": [], "detachableFragments": ["brake"], "breakImpulse": 0, "debrisMaterial": "base"}};
  (nodes["root"] ?? root).add(node_brake_17);
  nodes["brake"] = node_brake_17;
  const mesh_brake_17Geometry = endpoint_brake_17
    ? new THREE.CylinderGeometry(endpoint_brake_17.endRadius, endpoint_brake_17.baseRadius, endpoint_brake_17.length, 16, 6)
    : new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
  if (!endpoint_brake_17) {
    mesh_brake_17Geometry.scale(1.0, 1.0, 1.0);
  }
  const mesh_brake_17 = new THREE.Mesh(
    mesh_brake_17Geometry,
    materialMap["rubber"] ?? new THREE.MeshStandardMaterial({ color: 0x888888 })
  );
  mesh_brake_17.name = "brake";
  if (endpoint_brake_17) {
    mesh_brake_17.position.copy(endpoint_brake_17.midpoint);
    mesh_brake_17.quaternion.copy(endpoint_brake_17.quaternion);
  }
  mesh_brake_17.castShadow = options.castShadow ?? true;
  mesh_brake_17.receiveShadow = options.receiveShadow ?? true;
  mesh_brake_17.userData.sculptComponent = {"id": "brake", "name": "brake", "level": "meso", "role": "body", "importance": 1, "confidence": 0.86, "primitive": "box", "topologyClass": "assembled-solid", "topologyRationale": "Discrete mechanical part with cylindrical or planar manufactured faces.", "geometryDescriptor": {"topologyIntent": "low-poly blockout with bevel-ready edges", "edgeTreatment": {"type": "bevel", "bevelRadius": 0.4, "segments": 2}, "deformationStack": [], "uvStrategy": "generated procedural coordinates", "normalStrategy": "vertex normals from generated geometry"}, "parent": "root", "attachment": {"parentSocket": "brake-mount", "localStart": [0, 0, 0], "localEnd": [0, 0, 0], "contactType": "socket", "embedDepth": 0.3, "gapTolerance": 0.3}, "dimensions": {"width": 25, "height": 3, "depth": 7, "units": "millimetres", "confidence": 0.8}, "transform": {"position": [0, 3, -61], "rotation": [0, 0, 0], "scale": [1, 1, 1]}, "actionProfile": {"animationRole": "detachable-component", "pivot": {"mode": "center", "localPosition": [0, 0, 0], "axis": [0, 1, 0], "confidence": 0.5}, "transformChannels": {"translate": true, "rotate": true, "scale": true, "bend": false, "twist": false, "detach": false, "visibility": true, "materialState": true}, "sockets": [], "collider": {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."}, "constraints": [], "destruction": {"breakable": false, "fractureGroup": "brake", "seamRefs": [], "detachableFragments": ["brake"], "breakImpulse": 0, "debrisMaterial": "base"}}, "material": "rubber", "materialLayers": ["rubber"], "deformations": [], "joints": [], "seams": [], "localFeatures": [], "surfaceDetail": {"macroRoughness": 0, "microRoughness": 0, "bumpAmplitude": 0, "normalPattern": "", "displacementPattern": "", "occlusionPattern": "", "edgeWearPattern": "", "notes": ""}, "evidenceRefs": ["full-object"], "details": [], "fidelityTier": "blockout", "colorMaterialRecipe": {"dominantAlbedo": "rgba(20, 25, 28, 1)", "secondaryAlbedo": "rgba(21, 158, 232, 1)", "materialClass": "rubber", "materialClassConfidence": 0.9, "evidenceRefs": ["full-object"]}};
  node_brake_17.add(mesh_brake_17);
  meshes["brake"] = mesh_brake_17;
  colliders["brake"] = {"type": "box", "offset": [0, 0, 0], "scale": [1, 1, 1], "isTrigger": false, "notes": "Replace with sphere/capsule/compound proxy when the object shape demands it."};
  destructionGroups["brake"] ??= [];
  destructionGroups["brake"].push(node_brake_17);

  root.userData.sculptRuntime = { nodes, meshes, sockets, colliders, destructionGroups } satisfies ProceduralModelRuntime;
  root.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  root.userData.actionReadiness = {
    note: 'Use root.userData.sculptRuntime.nodes for transforms, sockets for attachments, colliders for physics proxies, and destructionGroups for breakable sets.',
  };
  return root;
}

export function createBEAKSPIDERLookDevLights(
  mode: 'neutral' | 'grazing' | 'reference' = 'neutral',
): THREE.Group {
  const lights = new THREE.Group();
  lights.name = "BEAK SPIDER look-dev lights";
  const hemi = new THREE.HemisphereLight(
    mode === 'reference' ? 0xfff0d6 : 0xf2f4ff,
    0x363b42,
    mode === 'grazing' ? 0.28 : mode === 'reference' ? 0.72 : 0.85,
  );
  lights.add(hemi);
  const key = new THREE.DirectionalLight(
    mode === 'reference' ? 0xffcf8a : 0xfff4e8,
    mode === 'grazing' ? 4.2 : mode === 'reference' ? 2.6 : 2.15,
  );
  if (mode === 'grazing') key.position.set(7.5, 1.1, 4.0);
  else if (mode === 'reference') key.position.set(-4.5, 7.5, 5.0);
  else key.position.set(-4.0, 6.0, 5.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.018;
  key.shadow.radius = 7;
  key.shadow.blurSamples = 24;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -2.6;
  key.shadow.camera.right = 2.6;
  key.shadow.camera.top = 2.6;
  key.shadow.camera.bottom = -2.6;
  key.shadow.camera.updateProjectionMatrix();
  lights.add(key);
  const fill = new THREE.DirectionalLight(0xa8c4ff, mode === 'grazing' ? 0.12 : 0.42);
  fill.position.set(4.0, 3.0, 3.5);
  lights.add(fill);
  const rim = new THREE.DirectionalLight(0xfff1c4, mode === 'grazing' ? 0.28 : 0.85);
  rim.position.set(0.5, 4.5, -6.0);
  lights.add(rim);
  lights.userData.reviewMode = mode;
  lights.userData.lightingFromPhoto = [{"type": "key light", "direction": [-1, 2, 2], "color": "#fff8ee", "intensity": 3}, {"type": "fill light", "direction": [2, 1, 0], "color": "#dcecff", "intensity": 1.2}, {"type": "environment light", "exposure": 1, "toneMapping": "ACES", "background": "#ececea", "shadows": "soft ground shadow and contact shadow"}];
  lights.userData.lookDevTargets = {"qualityPriority": "reference-fidelity", "materialPass": {"albedoPaletteRequired": true, "roughnessVariationRequired": true, "normalOrBumpRequired": true, "localOverridesRequired": true, "minimumTextureResolution": 1024, "preferredTextureResolution": 2048, "independentMapChannels": ["albedo", "roughness", "height", "normal", "ambient-occlusion"], "requiredSurfaceFrequencyBands": ["macro", "meso", "micro"], "geometryReliefRequiredWhenSilhouetteAffected": true, "referencePbrExtraction": {"requiredWhenSourceImagePresent": true, "targetThreshold": 0.7, "stopOnLowConfidence": true, "script": "forge/stage1_intake/extract_pbr_evidence.py", "acceptedLimitation": "single-image extraction is reference-derived inference, not exact photogrammetry"}, "mustAvoid": ["single flat albedo per material", "uniform roughness", "albedo texture reused as roughness/height/normal/AO", "single-frequency random noise", "plastic-looking smooth bark, stone, cloth, foliage, or aged material", "local color/detail described only in prose without material masks", "claiming exact PBR recovery when confidence is below the target threshold"]}, "lightingPass": {"requiredTerms": ["key light", "fill light", "rim or environment light", "exposure", "tone mapping", "background", "contact shadow"], "mustAvoid": ["ambient-only lighting", "flat value range", "missing contact shadow", "reference lighting copied without separating material readability"]}, "screenshotReview": ["Compare albedo palette and local color zones.", "Compare roughness/normal/bump response under light.", "Compare cavity dirt, edge wear, stains, moss, scratches, or other local masks.", "Compare key/fill/rim structure, exposure, tone mapping, background, and contact shadows.", "Capture a neutral-light render to verify material readability without reference lighting.", "Capture a grazing-light close-up to expose flat normals, uniform roughness, tiling, and plastic highlights.", "Capture a reference-matched render from the same camera framing as the source."]};
  return lights;
}

// PBR materials (clearcoat/iridescence/transmission/anisotropy) need an environment
// map to visually behave as intended — call this once per renderer and assign the
// result to scene.environment before rendering. No external HDR asset required.
export function createBEAKSPIDEREnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

// Plan 1.3 §3.2 — auto-framing by bounding box. The Divine Eye can only compare a
// render to the reference if the object is FRAMED consistently (an object framed
// differently scores as wrong even when its shape is right). This positions the camera
// deterministically from the object's bounding box so it fills the frame at a stable
// margin, and sets near/far to the object scale. Call after adding the model to the
// scene, and again on resize (after updating camera.aspect).
export function frameBEAKSPIDERCamera(
  camera: THREE.PerspectiveCamera,
  object: THREE.Object3D,
  options: { margin?: number; azimuthDeg?: number; elevationDeg?: number } = {},
): void {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const margin = options.margin ?? 1.15;
  const maxDim = Math.max(size.x, size.y, size.z) * margin;
  const fov = (camera.fov * Math.PI) / 180;
  // distance so the largest object dimension fits vertically in the frame
  const distance = (maxDim / 2) / Math.tan(fov / 2);
  const az = ((options.azimuthDeg ?? 0) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(center).addScaledVector(dir, distance);
  camera.near = Math.max(0.01, distance - maxDim);
  camera.far = distance + maxDim * 2;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

// Plan 1.3 §3.2c — PRESENTATION composer (DOF + bloom). CRITICAL (R-POSTFX): this is
// for the showcase/hero render ONLY. The Divine Eye's EVALUATION render MUST use a
// plain renderer with NO composer — bloom blows highlights and DOF blurs edges, which
// would corrupt the deterministic IoU/DCD/edge/blowout signals. Enable dof/bloom ONLY
// when the reference photo actually exhibits them (detect_reference_effects.py authorizes).
export function createBEAKSPIDERPresentationComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: { dof?: boolean; bloom?: boolean; bloomStrength?: number; dofFocus?: number; dofAperture?: number } = {},
): EffectComposer {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (options.dof) {
    composer.addPass(new BokehPass(scene, camera, {
      focus: options.dofFocus ?? 10.0,
      aperture: options.dofAperture ?? 0.0002,
      maxblur: 0.01,
    }));
  }
  if (options.bloom) {
    const size = new THREE.Vector2();
    renderer.getSize(size);
    composer.addPass(new UnrealBloomPass(size, options.bloomStrength ?? 0.4, 0.4, 0.85));
  }
  return composer;
}

export function configureBEAKSPIDERRenderer(renderer: THREE.WebGLRenderer): void {
  // Load-bearing for view-dependent finishes (anodized / Doppler): without ACES + sRGB
  // the environment reflection reads flat/washed instead of a believable metal response.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createBEAKSPIDERInspectControls(
  camera: THREE.Camera,
  domElement: HTMLElement,
): OrbitControls {
  // View-dependent finishes only read correctly once the user orbits — their color
  // comes from the environment reflection, not albedo, so free rotation matters here.
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.minDistance = 1.0;
  controls.maxDistance = 8.0;
  controls.autoRotate = false;
  return controls;
}
