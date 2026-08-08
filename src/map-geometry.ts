// Map geometry: bbox fitting, aspect reshaping, coordinate resolution.
// Pure math over canon shapes — no fetching, no React.
import type { Entity } from './canon'

export interface BBox { lon0: number; lon1: number; lat0: number; lat1: number }

export interface GeoJSON {
  features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[]
}

/** Resolve a place id to coordinates, walking part_of up the hierarchy. */
export function resolveCoords(
  placeId: string | undefined,
  entities: Record<string, Entity>,
): { lat: number; lon: number } | undefined {
  let cur = placeId ? entities[placeId] : undefined
  while (cur) {
    if (cur.coordinates) return cur.coordinates
    cur = cur.part_of ? entities[cur.part_of] : undefined
  }
  return undefined
}

/** Every [lon, lat] in a geojson, flattened — used to fit the map to the land. */
export function geoCoords(geo: GeoJSON | null): [number, number][] {
  if (!geo) return []
  const out: [number, number][] = []
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      out.push([c[0], c[1]])
    } else if (Array.isArray(c)) {
      for (const v of c) walk(v)
    }
  }
  for (const f of geo.features) walk(f.geometry.coordinates)
  return out
}

/** Pad a bbox by a fraction of its own size so content isn't flush to the edge. */
function pad(b: BBox, frac = 0.04): BBox {
  const dx = (b.lon1 - b.lon0) * frac
  const dy = (b.lat1 - b.lat0) * frac
  return { lon0: b.lon0 - dx, lon1: b.lon1 + dx, lat0: b.lat0 - dy, lat1: b.lat1 + dy }
}

/**
 * The area the map should cover: everything being drawn — the basemap
 * geometry if there is one, plus every place that has coordinates. Fitting to
 * places alone would crop a coastline that extends past them.
 */
export function fitBBox(
  entities: Record<string, Entity>,
  coords: [number, number][] = [],
): BBox | undefined {
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  for (const e of Object.values(entities)) {
    if (e.coordinates) { lons.push(e.coordinates.lon); lats.push(e.coordinates.lat) }
  }
  if (!lons.length) return undefined
  const b = { lon0: Math.min(...lons), lon1: Math.max(...lons), lat0: Math.min(...lats), lat1: Math.max(...lats) }
  // A single point, or a perfectly flat extent, has no scale to pad — give it one.
  if (b.lon1 - b.lon0 < 0.01) { b.lon0 -= 0.25; b.lon1 += 0.25 }
  if (b.lat1 - b.lat0 < 0.01) { b.lat0 -= 0.25; b.lat1 += 0.25 }
  return reshape(pad(b))
}

// Keep the drawn map within a sane aspect range. A story with one place, or
// places strung along a single axis, otherwise yields an extreme viewport —
// and at high latitude the cos correction makes a square degree box tall.
// We widen the *area shown* rather than scaling the projection, so degrees
// stay square and nothing is distorted; you just see more sea.
const MIN_RATIO = 0.3
const MAX_RATIO = 0.85

function reshape(b: BBox): BBox {
  const cos = Math.cos((((b.lat0 + b.lat1) / 2) * Math.PI) / 180) || 1
  const dLon = b.lon1 - b.lon0
  const dLat = b.lat1 - b.lat0
  const ratio = dLat / (dLon * cos)

  if (ratio > MAX_RATIO) {
    const want = dLat / (MAX_RATIO * cos)
    const grow = (want - dLon) / 2
    return { ...b, lon0: b.lon0 - grow, lon1: b.lon1 + grow }
  }
  if (ratio < MIN_RATIO) {
    const want = MIN_RATIO * dLon * cos
    const grow = (want - dLat) / 2
    return { ...b, lat0: b.lat0 - grow, lat1: b.lat1 + grow }
  }
  return b
}
