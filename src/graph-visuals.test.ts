import { expect, test } from 'vitest'
import { degreeRadius, edgeArc } from './graph-visuals'

test('edgeArc: a quadratic through both endpoints, control point perpendicular at midpoint', () => {
  const d = edgeArc(0, 0, 100, 0, 0.1)
  expect(d).toBe('M0.0,0.0 Q50.0,10.0 100.0,0.0')
  // reversed travel bows to the other side — a pair of directions bow apart
  expect(edgeArc(100, 0, 0, 0, 0.1)).toBe('M100.0,0.0 Q50.0,-10.0 0.0,0.0')
  // bend scales with length, so short edges stay nearly straight
  expect(edgeArc(0, 0, 10, 0, 0.1)).toBe('M0.0,0.0 Q5.0,1.0 10.0,0.0')
})

test('degreeRadius: hubs grow inside a clamped band, sqrt-honest', () => {
  expect(degreeRadius(10, 0)).toBe(9)               // an isolate sits slightly small
  expect(degreeRadius(10, 1)).toBeCloseTo(10.4, 1)
  expect(degreeRadius(10, 4)).toBeCloseTo(11.8, 1)
  expect(degreeRadius(10, 100)).toBe(14.5)          // the clamp: no node shouts
  expect(degreeRadius(7.5, 2) / 7.5).toBeCloseTo(degreeRadius(10, 2) / 10, 2)  // type base preserved (rounding aside)
})
