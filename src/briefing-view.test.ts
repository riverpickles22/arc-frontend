import { describe, expect, it } from 'vitest'
import type { BriefingResponse } from 'arc-canon-graph/api-types.ts'
import { BRIEFING_THRESHOLD_HOURS, DUE_SHOWN, SECTIONS, awayLabel, briefingVisible, chapterLabel, dueRows, readyLinks } from './briefing-view'
import type { Chapter } from './canon'

const H = 3600 * 1000
const NOW = Date.parse('2026-09-03T12:00:00Z')
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString()

const empty: BriefingResponse = { git: true, lastAccepted: null, draft: [], notes: [], routes: {}, unplaced: 0, due: [], lastSession: [] }
const accepted = (hoursAgo: number, extra: Partial<BriefingResponse> = {}): BriefingResponse => ({
  ...empty,
  lastAccepted: { scene: 'sc.02-1', chapter: 'ch.02', file: 'prose/ch-02/scene-01.md', paragraph: 'The last line.', acceptedAt: at(hoursAgo), hash: 'abc1234' },
  ...extra,
})

describe('briefingVisible', () => {
  it('opens past the threshold and stays shut under it', () => {
    expect(briefingVisible(accepted(BRIEFING_THRESHOLD_HOURS + 1), NOW, null)).toBe(true)
    expect(briefingVisible(accepted(BRIEFING_THRESHOLD_HOURS - 1), NOW, null)).toBe(false)
  })
  it("the author's word wins in both directions", () => {
    expect(briefingVisible(accepted(1), NOW, 'open')).toBe(true)          // "where was I?" under the threshold
    expect(briefingVisible(accepted(200), NOW, 'dismissed')).toBe(false)  // dismissed past it
  })
  it('an empty story has nowhere to have left off', () => {
    expect(briefingVisible(empty, NOW, null)).toBe(false)
    expect(briefingVisible(empty, NOW, 'open')).toBe(false)
    expect(briefingVisible({ ...accepted(200), git: false }, NOW, 'open')).toBe(false)
    expect(briefingVisible(null, NOW, 'open')).toBe(false)
  })
})

describe('SECTIONS', () => {
  it('is exactly three, in order, and there is no fourth', () => {
    expect(SECTIONS.map(s => s.key)).toEqual(['left-off', 'in-flight', 'due'])
    expect(SECTIONS).toHaveLength(3)
  })
})

describe('readyLinks', () => {
  it('one link per non-empty store, each naming where it lands', () => {
    const b = accepted(1, {
      draft: [{ file: 'prose/ch-01/scene-02.md', scene: 'sc.01-2', status: 'added' }, { file: 'prose/x.md', scene: 'sc.09-1', status: 'deleted' }],
      routes: { 'sc.02-1': 2, 'sc.01-1': 1 },
      notes: [{ id: 'note.004', scene: 'sc.02-1', body: 'fix' }, { id: 'note.005', scene: 'sc.01-1', body: 'cut' }],
      unplaced: 2,
    })
    expect(readyLinks(b)).toEqual([
      { kind: 'draft', label: '1 draft scene', scene: 'sc.01-2' },           // a deleted file is not a scene to land on
      { kind: 'routes', label: '3 routes on 2 scenes', scene: 'sc.01-1' },
      { kind: 'notes', label: '2 open notes', scene: 'sc.02-1', note: 'note.004' },
      { kind: 'material', label: '2 unplaced', scene: null },
    ])
  })
  it('a single scene with routes is named', () => {
    expect(readyLinks(accepted(1, { routes: { 'sc.02-1': 1 } }))).toEqual([{ kind: 'routes', label: '1 route on sc.02-1', scene: 'sc.02-1' }])
  })
  it('nothing waiting is no links at all', () => { expect(readyLinks(accepted(1))).toEqual([]) })
})

describe('awayLabel', () => {
  it('speaks in days, then weeks, then months', () => {
    expect(awayLabel(at(3), NOW)).toBe('today')
    expect(awayLabel(at(30), NOW)).toBe('yesterday')
    expect(awayLabel(at(24 * 6), NOW)).toBe('6 days ago')
    expect(awayLabel(at(24 * 20), NOW)).toBe('2 weeks ago')
    expect(awayLabel(at(24 * 95), NOW)).toBe('3 months ago')
    expect(awayLabel('not a date', NOW)).toBe('')
  })
})

describe('chapterLabel', () => {
  const chapters = [{ id: 'ch.00', order: 0, title: 'Before' }, { id: 'ch.02', order: 2, title: 'The Aurelia' }] as Chapter[]
  it('names the chapter the way the header does, and falls back to the id', () => {
    expect(chapterLabel('ch.00', chapters)).toBe('Prologue — Before')
    expect(chapterLabel('ch.02', chapters)).toBe('Chapter 2 — The Aurelia')
    expect(chapterLabel('ch.09', chapters)).toBe('ch.09')
  })
})

describe('dueRows', () => {
  it('carries the class in words, and an unreadable canon is no rows', () => {
    expect(dueRows([
      { id: 'obl.1', body: 'The letter is read.', klass: 'unowned', window: { to: 'ch.03' } },
      { id: 'obl.2', body: 'Wren returns.', klass: 'overdue', window: { from: 'ch.01' } },
    ])).toEqual([
      { id: 'obl.1', body: 'The letter is read.', state: 'nothing claims it yet' },
      { id: 'obl.2', body: 'Wren returns.', state: 'overdue' },
    ])
    expect(dueRows(null)).toEqual([])
    expect(DUE_SHOWN).toBeGreaterThan(0)
  })
})
