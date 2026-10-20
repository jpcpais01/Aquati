// The map: two archipelagos with a long reach of open ocean between them, all
// one seamless sea. Each archipelago is a square of WORLD_SIZE metres round its
// own centre (see Terrain), with its islands inside REGION_R of the middle.
// Out past HIGH_SEAS_R from every centre lie the high seas: no land, no
// pirates, a long calm swell and the dolphins.

export type RegionId = 'home' | 'brumas';

export interface Region {
  id: RegionId;
  /** The archipelago's name on the chart. */
  name: string;
  /** A line under the name. */
  motto: string;
  x: number;
  z: number;
  seed: number;
}

export const REGIONS: Region[] = [
  { id: 'home', name: 'Las Afortunadas', motto: 'The Fortunate Isles', x: 0, z: 0, seed: 20251019 },
  // about three archipelagos' breadth of open water away, east-north-east
  { id: 'brumas', name: 'Las Brumas', motto: 'The Isles of Mist', x: 6600, z: -2800, seed: 777031 },
];

/** Islands, reefs and maelstroms of an archipelago lie within this of its centre (m). */
export const REGION_R = 960;
/** Beyond this from every archipelago's centre you are on the high seas. */
export const HIGH_SEAS_R = 1380;
/** An archipelago's land, towns and plants stay resident (drawn and updated) within this of its centre. */
export const STREAM_R = 3000;

/** The archipelago whose centre is nearest (x, z), and how far that centre is. */
export function nearestRegion(x: number, z: number): { region: Region; dist: number } {
  let region = REGIONS[0];
  let dist = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(r.x - x, r.z - z);
    if (d < dist) {
      dist = d;
      region = r;
    }
  }
  return { region, dist };
}

export function regionById(id: RegionId): Region {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}

/**
 * Keeps a point inside the waters of the archipelago `from` lies in (within
 * `reach` of its centre on each axis). Out on the high seas nothing is kept in.
 */
export function clampToRegion(x: number, z: number, fromX: number, fromZ: number, reach = 880): [number, number] {
  const { region, dist } = nearestRegion(fromX, fromZ);
  if (dist > HIGH_SEAS_R) return [x, z];
  return [Math.min(region.x + reach, Math.max(region.x - reach, x)), Math.min(region.z + reach, Math.max(region.z - reach, z))];
}

/**
 * The edge of the known sea: a long oval reaching EDGE_R round every
 * archipelago and the lane between them (beyond, the swell turns you back).
 */
export const EDGE_R = 1700;

/** How far (x, z) lies past the edge of the known sea (negative inside), and which way is back. */
export function seaEdge(x: number, z: number, back?: { x: number; z: number }): number {
  let best = Infinity;
  for (let i = 0; i < REGIONS.length; i++) {
    for (let j = i; j < REGIONS.length; j++) {
      const a = REGIONS[i];
      const b = REGIONS[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const L2 = dx * dx + dz * dz;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)) : 0;
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d;
        if (back) {
          back.x = (px - x) / (d || 1);
          back.z = (pz - z) / (d || 1);
        }
      }
    }
  }
  return best - EDGE_R;
}

/** Distance from (x, z) to the nearest archipelago's edge of land (negative inside it). */
export function seaReach(x: number, z: number) {
  return nearestRegion(x, z).dist - REGION_R;
}
