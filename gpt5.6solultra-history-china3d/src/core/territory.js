import { isInsideChina } from '../geo/projection.js';

const DEGREE_ASPECT = 0.78;

export function factionScore(faction, lon, lat) {
  const [centerLon, centerLat] = faction.center;
  const dx = (lon - centerLon) * Math.cos((lat * Math.PI) / 180);
  const dy = (lat - centerLat) * DEGREE_ASPECT;
  const distance = Math.hypot(dx, dy);
  const influence = Math.max(0.35, Number(faction.influence) || 1);
  let score = distance / influence;

  if (faction.bounds) {
    const { minLon = -Infinity, maxLon = Infinity, minLat = -Infinity, maxLat = Infinity } = faction.bounds;
    if (lon < minLon) score += (minLon - lon) * 2.2;
    if (lon > maxLon) score += (lon - maxLon) * 2.2;
    if (lat < minLat) score += (minLat - lat) * 2.2;
    if (lat > maxLat) score += (lat - maxLat) * 2.2;
  }

  for (const zone of faction.biasZones ?? []) {
    const zoneDx = (lon - zone.lon) * Math.cos((lat * Math.PI) / 180);
    const zoneDy = (lat - zone.lat) * DEGREE_ASPECT;
    const radius = Math.max(0.1, zone.radius ?? 5);
    const falloff = Math.max(0, 1 - Math.hypot(zoneDx, zoneDy) / radius);
    score -= falloff * (zone.weight ?? 1.2);
  }

  return score + (faction.scoreBias ?? 0);
}

export function assignFaction(era, lon, lat) {
  if (!era?.factions?.length) return null;
  let winner = era.factions[0];
  let winnerScore = factionScore(winner, lon, lat);

  for (let index = 1; index < era.factions.length; index += 1) {
    const faction = era.factions[index];
    const score = factionScore(faction, lon, lat);
    if (score < winnerScore) {
      winner = faction;
      winnerScore = score;
    }
  }

  return winner;
}

export function createTerritoryGrid({ lonStep = 2.35, latStep = 1.72 } = {}) {
  const tiles = [];
  let row = 0;

  for (let lat = 18.2; lat <= 53.4; lat += latStep) {
    const stagger = row % 2 === 0 ? 0 : lonStep * 0.5;
    for (let lon = 73.2 + stagger; lon <= 134.8; lon += lonStep) {
      if (!isInsideChina(lon, lat)) continue;
      tiles.push({
        id: `${row}-${Math.round(lon * 100)}`,
        lon: Number(lon.toFixed(4)),
        lat: Number(lat.toFixed(4)),
      });
    }
    row += 1;
  }

  return tiles;
}

export function territoryAssignments(era, tiles = createTerritoryGrid()) {
  return tiles.map((tile) => ({
    ...tile,
    factionId: assignFaction(era, tile.lon, tile.lat)?.id ?? null,
  }));
}

export function territorySignature(era, tiles = createTerritoryGrid()) {
  let hash = 2166136261;
  for (const tile of territoryAssignments(era, tiles)) {
    const token = `${tile.id}:${tile.factionId ?? 'none'}`;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
