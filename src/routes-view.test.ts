import { describe, expect, it } from 'vitest'
import { byNewest, coverageRows, lockNotice, overlapLabel, seedLabel } from './routes-view'
import type { RouteAlternative } from 'arc-canon-graph/api-types.ts'

describe('coverageRows', () => {
  it('renders reported paragraphs and says "not reported" rather than guessing', () => {
    expect(coverageRows([{ item: 'A', paragraph: 2 }, { item: 'B', paragraph: null }])).toEqual([{ item: 'A', where: '¶2' }, { item: 'B', where: 'not reported' }])
  })
  it('a missing tail is no rows at all', () => { expect(coverageRows(null)).toEqual([]) })
})

describe('overlapLabel', () => {
  it('names the share, and admits when it could not be measured', () => {
    expect(overlapLabel(0.25)).toBe('overlap with the current wording: 25%')
    expect(overlapLabel(null)).toMatch(/not measurable/)
  })
})

describe('lockNotice', () => {
  it('a whole-scene or chapter lock blocks the run and names the lock', () => {
    expect(lockNotice([{ id: 'lock.001', scope: 'scene', paragraph: null }]).blocked).toMatch(/lock\.001/)
    expect(lockNotice([{ id: 'lock.002', scope: 'chapter', paragraph: null }]).blocked).toMatch(/This chapter/)
  })
  it('paragraph locks constrain, with the surrounding-context warning', () => {
    const n = lockNotice([{ id: 'lock.003', scope: 'paragraph', paragraph: 1 }, { id: 'lock.004', scope: 'paragraph', paragraph: 4 }])
    expect(n.blocked).toBeNull()
    expect(n.constrain).toMatch(/¶2 \(lock\.003\), ¶5 \(lock\.004\)/)
    expect(n.constrain).toMatch(/prose around them will change/)
  })
  it('no locks, no notice', () => { expect(lockNotice([])).toEqual({ blocked: null, constrain: null }) })
})

describe('seedLabel / byNewest', () => {
  it('labels the seeds and passes unknown ones through', () => {
    expect(seedLabel('late-entry')).toBe('late entry'); expect(seedLabel('x')).toBe('x')
  })
  it('orders newest first', () => {
    const mk = (id: string, at: string) => ({ id, created_at: at } as RouteAlternative)
    expect(byNewest([mk('a', '2026-01-01'), mk('b', '2026-02-01')]).map(a => a.id)).toEqual(['b', 'a'])
  })
})
