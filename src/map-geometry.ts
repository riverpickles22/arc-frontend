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

/**
 * Where an inset panel should sit: the corner of the frame whose panel
 * rectangle covers the fewest drawn points (coastline vertices + place
 * markers, already projected to frame coordinates). Ties break toward the
 * corner farthest from `avoid` (the inset's source rectangle), so the
 * panel never sits on top of the very area it excerpts. Deterministic.
 */
export function bestCorner(
  frame: { W: number; H: number },
  size: { w: number; h: number },
  points: [number, number][],
  avoid?: { x: number; y: number },
  margin = 14,
): { x: number; y: number } {
  const cands = [
    { x: margin, y: margin },
    { x: frame.W - size.w - margin, y: margin },
    { x: margin, y: frame.H - size.h - margin },
    { x: frame.W - size.w - margin, y: frame.H - size.h - margin },
  ]
  let best = cands[0]
  let bestScore = Infinity
  for (const c of cands) {
    let covered = 0
    for (const [px, py] of points) {
      if (px >= c.x && px <= c.x + size.w && py >= c.y && py <= c.y + size.h) covered++
    }
    const d = avoid ? Math.hypot(c.x + size.w / 2 - avoid.x, c.y + size.h / 2 - avoid.y) : 0
    const score = covered - d * 1e-6
    if (score < bestScore) { bestScore = score; best = c }
  }
  return best
}

// ---- chart furniture (A24-1) ---------------------------------------------
// The graticule and the scale bar are what make a projection read as a map
// rather than a diagram: they declare where on Earth this is and how far
// apart things sit. Pure math, so the tests can pin them exactly.

/** Graticule lines for a bbox: the meridians and parallels at multiples of
 *  `step` degrees that cross it. Chooses nothing — the caller picks the step
 *  (pickGraticuleStep below knows how). */
export function graticule(b: BBox, step: number): { lons: number[]; lats: number[] } {
  const from = (lo: number) => Math.ceil(lo / step) * step
  const lons: number[] = []
  const lats: number[] = []
  // The epsilon keeps a line sitting exactly on the frame edge — where its
  // label could not draw — out of the set.
  for (let l = from(b.lon0); l < b.lon1 - 1e-9; l += step) if (l > b.lon0 + 1e-9) lons.push(+l.toFixed(6))
  for (let l = from(b.lat0); l < b.lat1 - 1e-9; l += step) if (l > b.lat0 + 1e-9) lats.push(+l.toFixed(6))
  return { lons, lats }
}

/** A step that yields a handful of lines rather than a mesh: the smallest of
 *  the clean cartographic steps giving at most `maxLines` meridians. */
export function pickGraticuleStep(b: BBox, maxLines = 6): number {
  for (const step of [0.5, 1, 2, 5, 10, 20]) {
    if ((b.lon1 - b.lon0) / step <= maxLines) return step
  }
  return 30
}

const KM_PER_DEG_LAT = 111.32

/** A scale bar for the projection: the longest "clean" distance (1–2–5×10ⁿ km)
 *  that fits in `maxPx` on screen, measured along the bbox's mid latitude
 *  where east–west degrees shrink by cos(lat). Returns its on-screen length. */
export function scaleBar(b: BBox, widthPx: number, maxPx = 170): { km: number; px: number } {
  const midLat = ((b.lat0 + b.lat1) / 2) * (Math.PI / 180)
  const kmAcross = (b.lon1 - b.lon0) * KM_PER_DEG_LAT * Math.cos(midLat)
  const pxPerKm = widthPx / Math.max(kmAcross, 0.001)
  let best = { km: 1, px: pxPerKm }
  for (const mant of [1, 2, 5]) {
    for (let mag = 0; mag <= 4; mag++) {
      const km = mant * 10 ** mag
      const px = km * pxPerKm
      if (px <= maxPx && px > best.px) best = { km, px }
    }
  }
  return { km: best.km, px: +best.px.toFixed(2) }
}

// ---- the geographic window (A24-3) ---------------------------------------
// One mechanism carries all navigation: the projection draws whatever bbox it
// is given, so zoom is shrinking the window toward a point, pan is sliding
// it, entering the inset is setting it, and Back is restoring the full
// extent. Everything re-projects vector-crisp at every scale.

/** How far in the window may go, as a fraction of the full extent's span.
 *  0.005 of an island-scale story is a few kilometres of frame — street
 *  scale; past that the projection is showing metres, which no story needs. */
const MIN_SPAN_FRAC = 0.005

const clampTo = (win: BBox, full: BBox): BBox => {
  const dLon = win.lon1 - win.lon0
  const dLat = win.lat1 - win.lat0
  let { lon0, lat0 } = win
  lon0 = Math.min(Math.max(lon0, full.lon0), full.lon1 - dLon)
  lat0 = Math.min(Math.max(lat0, full.lat0), full.lat1 - dLat)
  return { lon0, lon1: lon0 + dLon, lat0, lat1: lat0 + dLat }
}

/** Zoom the window by `factor` (<1 in, >1 out) toward a geographic point,
 *  which stays put on screen — the cartographer's zoom, not the centre zoom.
 *  Clamped: never larger than the full extent, never below MIN_SPAN_FRAC of
 *  it, and always inside it. Aspect is preserved by scaling both axes. */
export function zoomWindow(win: BBox, full: BBox, factor: number, at: { lon: number; lat: number }): BBox {
  const dLon = win.lon1 - win.lon0
  const fullLon = full.lon1 - full.lon0
  const f = Math.min(Math.max(factor, (MIN_SPAN_FRAC * fullLon) / dLon), fullLon / dLon)
  const fx = (at.lon - win.lon0) / dLon                    // the point's fraction of the window
  const fy = (at.lat - win.lat0) / (win.lat1 - win.lat0)
  const nLon = dLon * f
  const nLat = (win.lat1 - win.lat0) * f
  return clampTo({
    lon0: at.lon - fx * nLon, lon1: at.lon + (1 - fx) * nLon,
    lat0: at.lat - fy * nLat, lat1: at.lat + (1 - fy) * nLat,
  }, full)
}

/** Slide the window by geographic deltas, stopping at the full extent's edge. */
export function panWindow(win: BBox, full: BBox, dLon: number, dLat: number): BBox {
  return clampTo({
    lon0: win.lon0 + dLon, lon1: win.lon1 + dLon,
    lat0: win.lat0 + dLat, lat1: win.lat1 + dLat,
  }, full)
}

/** The window that shows an inset's area in a frame of the full extent's
 *  aspect: the inset bbox, grown along its shorter axis to match. The frame
 *  never changes shape — only what it looks at. */
export function windowForInset(inset: BBox, full: BBox): BBox {
  const ratio = (full.lat1 - full.lat0) / (full.lon1 - full.lon0)
  const dLon = inset.lon1 - inset.lon0
  const dLat = inset.lat1 - inset.lat0
  const cLon = (inset.lon0 + inset.lon1) / 2
  const cLat = (inset.lat0 + inset.lat1) / 2
  if (dLat / dLon < ratio) {
    const want = dLon * ratio
    return { lon0: inset.lon0, lon1: inset.lon1, lat0: cLat - want / 2, lat1: cLat + want / 2 }
  }
  const want = dLat / ratio
  return { lon0: cLon - want / 2, lon1: cLon + want / 2, lat0: inset.lat0, lat1: inset.lat1 }
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
