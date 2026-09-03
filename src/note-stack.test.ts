// The notes rail's placement arithmetic. These are the failures that are
// invisible in a screenshot: a card one line off still looks like a card.
import { describe, expect, it, test } from 'vitest'
import { RAIL_FLOOR, stack } from './note-stack'

test('a card sits on its own paragraph when nothing is in the way', () => {
  expect(stack([200, 600], [80, 80])).toEqual([200, 600])
})

test('no card overlaps the one above it', () => {
  const tops = stack([200, 210, 220], [80, 80, 80])
  expect(tops[1]).toBeGreaterThanOrEqual(tops[0] + 80)
  expect(tops[2]).toBeGreaterThanOrEqual(tops[1] + 80)
})

test('nothing rises above the heading', () => {
  expect(stack([0, 5], [40, 40])[0]).toBe(RAIL_FLOOR)
})

test('cards stack in paragraph order, not list order', () => {
  // The rail is handed a late note first. Before this was ordered, the card
  // for line 100 was pushed below the one for line 900 — to the bottom of the
  // rail, nowhere near its passage.
  const tops = stack([900, 100], [80, 80])
  expect(tops).toEqual([900, 100])
})

test('order-independence: the same cards land in the same places either way', () => {
  const forward = stack([100, 300, 900], [80, 80, 80])
  const shuffled = stack([900, 100, 300], [80, 80, 80])
  expect(shuffled).toEqual([forward[2], forward[0], forward[1]])
})

test('the returned array is in render order, so index i is card i', () => {
  const tops = stack([500, 120], [40, 40])
  expect(tops).toHaveLength(2)
  expect(tops[0]).toBe(500)   // the card listed first, wherever it sits
  expect(tops[1]).toBe(120)
})

test('a missing height still advances the floor by the gap', () => {
  const tops = stack([100, 100], [0, 20])
  expect(tops[1]).toBeGreaterThan(tops[0])
})

test('one card is placed at its line whatever its height', () => {
  expect(stack([400], [500])).toEqual([400])
})

describe('stack — the cases the route reader proved', () => {
  it('a lone card sits exactly on its paragraph, whatever its height', () => {
    expect(stack([300], [500])).toEqual([300])
  })
  it('two cards that collide push DOWN the rail, never into the prose', () => {
    expect(stack([100, 120], [80, 40])).toEqual([100, 190])   // 100 + 80 + 10
  })
  it('cards far apart each keep their own line', () => {
    expect(stack([100, 400], [50, 50])).toEqual([100, 400])
  })
  it('the result does not depend on the order notes were filed in', () => {
    const a = stack([400, 100], [50, 50])
    const b = stack([100, 400], [50, 50])
    expect(a[1]).toBe(b[0]); expect(a[0]).toBe(b[1])
  })
  it('nothing rises above the floor', () => {
    expect(stack([0, 5], [20, 20], 10, 34)).toEqual([34, 64])
  })
  it('no card ever overlaps the one above it', () => {
    const desired = [0, 10, 12, 400, 405], heights = [60, 60, 60, 60, 60]
    const tops = stack(desired, heights)
    const sorted = [...tops].sort((x, y) => x - y)
    expect(sorted.every((t, i) => i === 0 || t >= sorted[i - 1] + 60)).toBe(true)
  })
})

