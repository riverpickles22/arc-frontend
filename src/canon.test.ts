// The thin-story arithmetic: the axes must stand on whatever the timeline
// actually holds, including nothing.
import { expect, test } from 'vitest'
import type { Era } from './canon'
import { yearRange } from './canon'

const era = (span: { start?: string; end?: string }): Era =>
  ({ id: 'era.x', name: 'X', span } as Era)

test('a timeline with no eras yields a finite, drawable range', () => {
  const [a, b] = yearRange([])
  expect(Number.isFinite(a)).toBe(true)
  expect(Number.isFinite(b)).toBe(true)
  expect(b).toBeGreaterThan(a)
})

test('every era open-ended is schema-valid, and must not NaN the axis', () => {
  // span requires no properties, so span: {} is a valid era — the shared
  // rule answers it with both sentinels, and neither is a year.
  const [a, b] = yearRange([era({}), era({ start: '1848' })])
  expect(Number.isFinite(a)).toBe(true)
  expect(Number.isFinite(b)).toBe(true)
  expect(a).toBe(1848)
  expect(b).toBeGreaterThanOrEqual(1848)
})

test('open ends fall back to the years the timeline does state', () => {
  const [a, b] = yearRange([era({ start: '1848', end: '1902' }), era({ start: '1903' })])
  expect(a).toBe(1848)
  expect(b).toBe(1903, 'the open era contributes its start, not a sentinel year')
})

test('a single-year story still gets a nonzero axis', () => {
  const [a, b] = yearRange([era({ start: '1927', end: '1927' })])
  expect(a).toBe(1927)
  expect(b).toBe(1928)
})

test('a dated timeline is unchanged', () => {
  expect(yearRange([era({ start: '1848-05', end: '1957-05-12' })])).toEqual([1848, 1957])
})
