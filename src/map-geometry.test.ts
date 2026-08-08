import { expect, test } from 'vitest'
import { fitBBox, geoCoords, resolveCoords } from './map-geometry'
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
