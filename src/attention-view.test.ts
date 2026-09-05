import { describe, expect, it } from 'vitest'
import type { AttentionResponse } from './canon'
import { attentionLabel, attentionTone, isContradiction, splitFindings, waitingCount } from './attention-view'

type Finding = AttentionResponse['findings'][number]

const f = (check: string, severity: 'error' | 'warning' = 'warning'): Finding =>
  ({ check, severity, about: [], message: `${check} says so` } as unknown as Finding)

// The novel's own shape on the day this was written: three contradictions
// among twenty-six warnings, the rest lifecycle bookkeeping.
const novel = [
  f('causality'), f('co-location'), f('span-sanity'),
  ...Array.from({ length: 23 }, () => f('lifecycle')),
]

describe('what counts as a contradiction', () => {
  it('is decided by the check\'s name, not its words', () => {
    for (const c of ['lifespan', 'causality', 'custody', 'co-location', 'span-sanity']) {
      expect(isContradiction(f(c))).toBe(true)
    }
    expect(isContradiction(f('lifecycle'))).toBe(false)
    // A check arc has not written yet is not silently promoted.
    expect(isContradiction(f('some-future-check'))).toBe(false)
  })

  it('splits the novel\'s findings three from twenty-three', () => {
    const { contradictions, housekeeping } = splitFindings(novel)
    expect(contradictions).toHaveLength(3)
    expect(housekeeping).toHaveLength(23)
  })
})

describe('the chip\'s words', () => {
  it('counts contradictions and can actually reach zero', () => {
    expect(attentionLabel(splitFindings(novel).contradictions)).toBe('3 contradictions')
    expect(attentionLabel([f('causality')])).toBe('1 contradiction')
    expect(attentionLabel([])).toBe('all clear')
    // The old label counted 54 items and never said this.
    expect(attentionLabel(splitFindings(Array.from({ length: 23 }, () => f('lifecycle'))).contradictions))
      .toBe('all clear')
  })

  it('reads as an error only when a contradiction is one', () => {
    expect(attentionTone([])).toBe('')
    expect(attentionTone([f('causality')])).toBe(' warn')
    expect(attentionTone([f('causality'), f('co-location', 'error')])).toBe(' err')
  })
})

describe('what is waiting but not wrong', () => {
  it('adds up the things that are the shape of an unfinished book', () => {
    const a = {
      findings: novel,
      proposedRecords: [{ id: 'char.x', type: 'entity' }, { id: 'ev.y', type: 'event' }],
      danglingPayoffs: [{ from: 'ev.a', to: 'ev.b' }],
      unmetObligations: [{ id: 'mat.1', body: 'owes', klass: 'unwritten', satisfiers: [] }],
    } as unknown as AttentionResponse
    expect(waitingCount(a, splitFindings(novel).housekeeping)).toBe(23 + 2 + 1 + 1)
  })
})
