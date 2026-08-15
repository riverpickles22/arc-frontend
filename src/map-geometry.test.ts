import { expect, test } from 'vitest'
import { bestCorner, detailVisible, fitAspect, fitBBox, geoCoords, graticule, panWindow, pickGraticuleStep, resolveCoords, scaleBar, svgPath, windowForInset, zoomWindow } from './map-geometry'
import type { Entity } from './canon'

const ent = (id: string, extra: Partial<Entity>): Entity =>
  ({ id, type: 'place', name: id, status: 'canon', summary: '', ...extra }) as Entity

test('resolveCoords walks part_of up to the first ancestor with coordinates', () => {
  const entities = {
    'place.room': ent('place.room', { part_of: 'place.house' }),
    'place.house': ent('place.house', { part_of: 'place.city' }),
    'place.city': ent('place.city', { coordinates: { lat: 23.1, lon: -82.4 } }),
  }
  expect(resolveCoords('place.room', entities)).toEqual({ lat: 23.1, lon: -82.4 })
  expect(resolveCoords('place.nowhere', entities)).toBeUndefined()
  expect(resolveCoords(undefined, entities)).toBeUndefined()
})

test('fitBBox covers all coordinates and pads a degenerate single point', () => {
  const single = fitBBox({ a: ent('a', { coordinates: { lat: 23, lon: -82 } }) })!
  expect(single.lon1 - single.lon0).toBeGreaterThan(0.4)   // the ±0.25 floor
  expect(single.lat0).toBeLessThan(23)
  expect(single.lat1).toBeGreaterThan(23)
})

test('fitBBox returns undefined with nothing to draw', () => {
  expect(fitBBox({})).toBeUndefined()
})

test('fitBBox keeps aspect within the sane range (widens, never distorts)', () => {
  // Two points strung along one axis: an extreme viewport without reshape.
  const b = fitBBox({
    a: ent('a', { coordinates: { lat: 20, lon: -80 } }),
    b: ent('b', { coordinates: { lat: 20.01, lon: -70 } }),
  })!
  const cos = Math.cos((((b.lat0 + b.lat1) / 2) * Math.PI) / 180)
  const ratio = (b.lat1 - b.lat0) / ((b.lon1 - b.lon0) * cos)
  expect(ratio).toBeGreaterThanOrEqual(0.29)
  expect(ratio).toBeLessThanOrEqual(0.86)
})

test('geoCoords flattens polygons and multipolygons', () => {
  const geo = {
    features: [
      { geometry: { type: 'Polygon', coordinates: [[[1, 2], [3, 4]]] } },
      { geometry: { type: 'MultiPolygon', coordinates: [[[[5, 6]]]] } },
    ],
  }
  expect(geoCoords(geo as never)).toEqual([[1, 2], [3, 4], [5, 6]])
  expect(geoCoords(null)).toEqual([])
})

test('bestCorner picks the corner covering the fewest points', () => {
  // land fills the top half of the frame — both bottom corners are empty sea
  const land: [number, number][] = []
  for (let x = 0; x < 1000; x += 20) for (let y = 0; y < 180; y += 20) land.push([x, y])
  const c = bestCorner({ W: 1000, H: 400 }, { w: 300, h: 200 }, land)
  expect(c.y).toBeGreaterThan(100)
})

test('bestCorner ties break toward the corner farthest from the source area', () => {
  const c = bestCorner({ W: 1000, H: 400 }, { w: 300, h: 200 }, [], { x: 0, y: 0 })
  expect(c).toEqual({ x: 1000 - 300 - 14, y: 400 - 200 - 14 })
})

test('bestCorner is deterministic for identical inputs', () => {
  const pts: [number, number][] = [[10, 10], [990, 390]]
  expect(bestCorner({ W: 1000, H: 400 }, { w: 300, h: 200 }, pts))
    .toEqual(bestCorner({ W: 1000, H: 400 }, { w: 300, h: 200 }, pts))
})

test('graticule: lines at clean multiples inside the box, never on its edges', () => {
  const b = { lon0: -85.2, lon1: -73.9, lat0: 19.4, lat1: 23.8 }
  const g = graticule(b, 2)
  expect(g.lons).toEqual([-84, -82, -80, -78, -76, -74])
  expect(g.lats).toEqual([20, 22])
  // an edge sitting exactly on a multiple contributes no line
  const edge = graticule({ lon0: -80, lon1: -74, lat0: 20, lat1: 22 }, 2)
  expect(edge.lons).toEqual([-78, -76])
  expect(edge.lats).toEqual([])
})

test('pickGraticuleStep: a handful of lines, not a mesh', () => {
  const cuba = { lon0: -85.2, lon1: -73.9, lat0: 19.4, lat1: 23.8 }
  expect(pickGraticuleStep(cuba)).toBe(2)          // ~5.6 meridians at 2°
  const city = { lon0: -82.45, lon1: -82.3, lat0: 23.08, lat1: 23.17 }
  expect(pickGraticuleStep(city)).toBe(0.5)        // small box, finest clean step
  const world = { lon0: -180, lon1: 180, lat0: -60, lat1: 75 }
  expect(pickGraticuleStep(world)).toBe(30)        // whole-world box exhausts the ladder
})

test('scaleBar: the longest clean 1-2-5 distance that fits, at mid-latitude', () => {
  // Cuba-ish: 11.3° of longitude at ~21.6°N ≈ 1169 km across 1000px
  const b = { lon0: -85.2, lon1: -73.9, lat0: 19.4, lat1: 23.8 }
  const s = scaleBar(b, 1000, 170)
  expect(s.km).toBe(100)                            // 200km ≈ 342px > 170; 100km ≈ 171px... check ≤
  expect(s.px).toBeLessThanOrEqual(170)
  expect(s.px).toBeGreaterThan(50)
  // clean mantissa only
  expect([1, 2, 5].some(m => [1, 10, 100, 1000, 10000].some(p => s.km === m * p))).toBe(true)
})

const FULL = { lon0: -85, lon1: -74, lat0: 19, lat1: 24 }

test('zoomWindow: the cursor point stays put, and the clamps hold', () => {
  const at = { lon: -80, lat: 22 }
  const z = zoomWindow(FULL, FULL, 0.5, at)
  // the point keeps its fraction of the window
  const fxBefore = (at.lon - FULL.lon0) / (FULL.lon1 - FULL.lon0)
  const fxAfter = (at.lon - z.lon0) / (z.lon1 - z.lon0)
  expect(fxAfter).toBeCloseTo(fxBefore, 6)
  expect(z.lon1 - z.lon0).toBeCloseTo((FULL.lon1 - FULL.lon0) / 2, 6)
  // zooming out far returns exactly the full extent
  const out = zoomWindow(z, FULL, 100, at)
  expect(out).toEqual(FULL)
  // zooming in far stops at the minimum span, not at zero
  let win = { ...FULL }
  for (let i = 0; i < 40; i++) win = zoomWindow(win, FULL, 0.5, at)
  expect(win.lon1 - win.lon0).toBeGreaterThanOrEqual((FULL.lon1 - FULL.lon0) * 0.005 - 1e-9)
})

test('panWindow: slides, and stops at the edge', () => {
  const z = zoomWindow(FULL, FULL, 0.5, { lon: -80, lat: 22 })
  const p = panWindow(z, FULL, 1, 0)
  expect(p.lon0).toBeCloseTo(z.lon0 + 1, 6)
  const hard = panWindow(z, FULL, 1000, -1000)
  expect(hard.lon1).toBeCloseTo(FULL.lon1, 6)
  expect(hard.lat0).toBeCloseTo(FULL.lat0, 6)
})

test('windowForInset: the frame keeps its aspect and the inset fits inside', () => {
  const inset = { lon0: -82.43, lon1: -82.3, lat0: 23.08, lat1: 23.175 }
  const w = windowForInset(inset, FULL)
  const ratioFull = (FULL.lat1 - FULL.lat0) / (FULL.lon1 - FULL.lon0)
  const ratioWin = (w.lat1 - w.lat0) / (w.lon1 - w.lon0)
  expect(ratioWin).toBeCloseTo(ratioFull, 6)
  expect(w.lon0).toBeLessThanOrEqual(inset.lon0)
  expect(w.lon1).toBeGreaterThanOrEqual(inset.lon1)
  expect(w.lat0).toBeLessThanOrEqual(inset.lat0)
  expect(w.lat1).toBeGreaterThanOrEqual(inset.lat1)
})

test('svgPath: polygons close, lines do not, every geometry type drawn', () => {
  const id = (lon: number, lat: number): [number, number] => [lon, lat]
  const path = svgPath([
    { properties: { kind: 'land' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1]]] } },
    { geometry: { type: 'LineString', coordinates: [[2, 2], [3, 3]] } },
    { geometry: { type: 'MultiLineString', coordinates: [[[4, 4], [5, 5]], [[6, 6], [7, 7]]] } },
  ], id)
  expect(path).toBe('M0.0,0.0L1.0,0.0L1.0,1.0Z M2.0,2.0L3.0,3.0 M4.0,4.0L5.0,5.0 M6.0,6.0L7.0,7.0')
})

test('detailVisible: streets appear only near the detail area', () => {
  const detail = { lon0: -82.48, lon1: -82.28, lat0: 23.05, lat1: 23.2 }   // 0.2° wide
  expect(detailVisible(FULL, detail)).toBe(false)                          // 11° island view
  expect(detailVisible({ lon0: -82.6, lon1: -82.2, lat0: 23, lat1: 23.3 }, detail)).toBe(true)
  expect(detailVisible({ lon0: -83, lon1: -82, lat0: 22.8, lat1: 23.5 }, detail)).toBe(false)  // 1° > 3×0.2
})

test('fitAspect: reaches the ratio, contains and centres on the input', () => {
  const b = { lon0: -82.48, lon1: -82.28, lat0: 23.05, lat1: 23.2 }
  for (const ratio of [0.3, 0.75, 2]) {
    const f = fitAspect(b, ratio)
    expect((f.lat1 - f.lat0) / (f.lon1 - f.lon0)).toBeCloseTo(ratio, 6)
    expect(f.lon0).toBeLessThanOrEqual(b.lon0)
    expect(f.lat0).toBeLessThanOrEqual(b.lat0)
    expect(f.lon0 + f.lon1).toBeCloseTo(b.lon0 + b.lon1, 6)   // centred
    expect(f.lat0 + f.lat1).toBeCloseTo(b.lat0 + b.lat1, 6)
  }
})
