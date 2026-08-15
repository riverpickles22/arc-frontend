import { expect, test } from 'vitest'
import { periodFor } from './presentation'

const PERIODS = [
  { label: 'Before', face: 'vivid', until: 1989 },
  { label: 'The Special Period', face: 'austere' },
]

test('periodFor: until-year boundaries, open-ended tail, empty list', () => {
  expect(periodFor(PERIODS, 1957)!.label).toBe('Before')
  expect(periodFor(PERIODS, 1989)!.label).toBe('Before')     // inclusive boundary
  expect(periodFor(PERIODS, 1990)!.label).toBe('The Special Period')
  expect(periodFor(PERIODS, 2020)!.label).toBe('The Special Period')
  expect(periodFor([], 1957)).toBeNull()
  expect(periodFor(undefined, 1957)).toBeNull()
})

test('periodFor: a single open-ended period covers everything', () => {
  const one = [{ label: 'Always' }]
  expect(periodFor(one, 1800)!.label).toBe('Always')
  expect(periodFor(one, 2100)!.label).toBe('Always')
})
