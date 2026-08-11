// The notes rail's placement arithmetic. These are the failures that are
// invisible in a screenshot: a card one line off still looks like a card.
import { expect, test } from 'vitest'
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
