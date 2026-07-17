import { PROJECT, WORLD } from '../config.js';

export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * NOAA-style solar position. A numeric argument is local solar time in hours;
 * an object may instead provide localTimeHours + timezoneOffsetHours to include
 * longitude and the equation-of-time correction.
 */
export function solarPosition(timeOrOptions = 12, override = {}) {
  const options = typeof timeOrOptions === 'number'
    ? { ...override, solarTimeHours: timeOrOptions }
    : { ...(timeOrOptions ?? {}) };
  const latitudeDeg = options.latitudeDeg ?? options.latitude ?? PROJECT.latitude;
  const longitudeDeg = options.longitudeDeg ?? options.longitude ?? PROJECT.longitude;
  const dayOfYear = options.dayOfYear ?? PROJECT.dayOfYear;
  const provisionalHour = options.solarTimeHours ?? options.localTimeHours ?? 12;
  const fractionalYear = (2 * Math.PI / 365) * (dayOfYear - 1 + (provisionalHour - 12) / 24);
  const equationOfTimeMinutes = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(fractionalYear)
    - 0.032077 * Math.sin(fractionalYear)
    - 0.014615 * Math.cos(2 * fractionalYear)
    - 0.040849 * Math.sin(2 * fractionalYear)
  );
  const declinationRad = 0.006918
    - 0.399912 * Math.cos(fractionalYear)
    + 0.070257 * Math.sin(fractionalYear)
    - 0.006758 * Math.cos(2 * fractionalYear)
    + 0.000907 * Math.sin(2 * fractionalYear)
    - 0.002697 * Math.cos(3 * fractionalYear)
    + 0.00148 * Math.sin(3 * fractionalYear);

  let solarTimeHours = options.solarTimeHours;
  if (solarTimeHours == null) {
    const timezoneOffsetHours = options.timezoneOffsetHours ?? -4;
    const correctedMinutes = options.localTimeHours * 60
      + equationOfTimeMinutes
      + 4 * longitudeDeg
      - 60 * timezoneOffsetHours;
    solarTimeHours = ((correctedMinutes / 60) % 24 + 24) % 24;
  }

  const hourAngleDeg = 15 * (solarTimeHours - 12);
  const hourAngleRad = hourAngleDeg * DEG2RAD;
  const latitudeRad = latitudeDeg * DEG2RAD;
  const sinAltitude = Math.sin(latitudeRad) * Math.sin(declinationRad)
    + Math.cos(latitudeRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  const altitudeRad = Math.asin(clamp(sinAltitude, -1, 1));
  // Clockwise from geographic north: 90 east, 180 south, 270 west.
  const azimuthRad = Math.atan2(
    Math.sin(hourAngleRad),
    Math.cos(hourAngleRad) * Math.sin(latitudeRad)
      - Math.tan(declinationRad) * Math.cos(latitudeRad),
  ) + Math.PI;
  const altitudeDeg = altitudeRad * RAD2DEG;
  const azimuthDeg = ((azimuthRad * RAD2DEG) % 360 + 360) % 360;
  const horizontal = Math.cos(altitudeRad);

  return {
    altitudeDeg,
    azimuthDeg,
    declinationDeg: declinationRad * RAD2DEG,
    hourAngleDeg,
    solarTimeHours,
    equationOfTimeMinutes,
    latitudeDeg,
    longitudeDeg,
    dayOfYear,
    direction: {
      x: Math.sin(azimuthRad) * horizontal,
      y: Math.sin(altitudeRad),
      z: Math.cos(azimuthRad) * horizontal,
    },
  };
}

/** Canonical catenary with its lowest point at (0, 0). */
export function catenaryY(x, a) {
  if (!(a > 0) || !Number.isFinite(a)) throw new RangeError('catenary parameter a must be positive');
  return a * Math.cosh(x / a) - a;
}

/** Solve a * (cosh((span / 2) / a) - 1) = sag by bisection. */
export function solveCatenaryA(span, sag) {
  const halfSpan = Math.abs(span) / 2;
  if (!(halfSpan > 0) || !(sag > 0)) throw new RangeError('span and sag must be positive');
  const targetRatio = sag / halfSpan;
  let lowU = 1e-8;
  let highU = 1;
  const ratioAt = (u) => (Math.cosh(u) - 1) / u;
  while (ratioAt(highU) < targetRatio && highU < 40) highU *= 2;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const midU = (lowU + highU) / 2;
    if (ratioAt(midU) < targetRatio) lowU = midU;
    else highU = midU;
  }
  return halfSpan / ((lowU + highU) / 2);
}

/** x is centred between the towers; towerY is the cable height at both ends. */
export function catenaryBetweenTowers(x, span, sag, towerY = 0) {
  const halfSpan = Math.abs(span) / 2;
  const a = solveCatenaryA(span, sag);
  return towerY - catenaryY(halfSpan, a) + catenaryY(x, a);
}

export function catenaryPoint(t, span, sag, towerY = 0) {
  const x = (clamp(t, 0, 1) - 0.5) * span;
  return { x, y: catenaryBetweenTowers(x, span, sag, towerY) };
}

const gaussian = (value, center, sigma) => Math.exp(-0.5 * ((value - center) / sigma) ** 2);

/**
 * Manhattan's two bedrock-driven height clusters: Downtown and Midtown.
 * Call as skylineHeight(x, z, options) or skylineHeight(z, options).
 */
export function skylineHeight(xOrZ, zOrOptions, maybeOptions = {}) {
  const oneDimensional = typeof zOrOptions !== 'number';
  const x = oneDimensional ? 0 : xOrZ;
  const z = oneDimensional ? xOrZ : zOrOptions;
  const options = oneDimensional ? (zOrOptions ?? {}) : maybeOptions;
  const depth = WORLD.maxZ - WORLD.minZ;
  const width = WORLD.maxX - WORLD.minX;
  const downtownZ = options.downtownZ ?? WORLD.minZ + depth * 0.16;
  const midtownZ = options.midtownZ ?? WORLD.minZ + depth * 0.48;
  const downtownSigma = options.downtownSigma ?? depth * 0.085;
  const midtownSigma = options.midtownSigma ?? depth * 0.1;
  const crossTown = 0.46 + 0.54 * gaussian(x, 0, width * 0.28);
  const baseHeight = options.baseHeight ?? 17;
  const downtown = (options.downtownHeight ?? 155) * gaussian(z, downtownZ, downtownSigma);
  const midtown = (options.midtownHeight ?? 205) * gaussian(z, midtownZ, midtownSigma);
  return baseHeight + crossTown * (downtown + midtown);
}

export function skylinePeaks() {
  const depth = WORLD.maxZ - WORLD.minZ;
  return {
    downtownZ: WORLD.minZ + depth * 0.16,
    valleyZ: WORLD.minZ + depth * 0.32,
    midtownZ: WORLD.minZ + depth * 0.48,
  };
}
