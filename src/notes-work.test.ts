import { describe, expect, it } from 'vitest'
import type { ProseChange, ResolvedAnnotation } from 'arc-canon-graph'
import { answeredInDraft, draftPillTitle, workLabel, workableScenes } from './notes-work'

const change = (file: string, answers?: string[], status: ProseChange['status'] = 'modified'): ProseChange =>
  ({ file, status, main: null, ...(answers ? { answers, origin: 'revise' } : {}) })

const note = (id: string, scene: string, extra: Partial<ResolvedAnnotation> = {}): ResolvedAnnotation =>
  ({ id, anchor: { scene }, body: 'x', resolution: { state: 'resolved', paragraph: null }, ...extra } as ResolvedAnnotation)

describe('answeredInDraft', () => {
  it('is the union of every change\'s answers, and empty for hand edits', () => {
    expect(answeredInDraft([change('a.md', ['note.1', 'note.2']), change('b.md', ['note.2', 'note.3']), change('c.md')]))
      .toEqual(new Set(['note.1', 'note.2', 'note.3']))
    expect(answeredInDraft([change('c.md')]).size).toBe(0)
    expect(answeredInDraft([]).size).toBe(0)
  })
})

describe('draftPillTitle', () => {
  it('names the count only when the ledger says the draft answers notes', () => {
    expect(draftPillTitle(change('a.md', ['note.1']))).toMatch(/answer 1 of your note —/)
    expect(draftPillTitle(change('a.md', ['note.1', 'note.2']))).toMatch(/answer 2 of your notes/)
    expect(draftPillTitle(change('a.md'))).toBe('Unaccepted edits — review them in the prose below, or through the draft bar.')
    expect(draftPillTitle(change('a.md', ['note.1'], 'added'))).toMatch(/exists only in the draft layer/)
  })
})

describe('workableScenes', () => {
  it('counts open notes per scene in chapter order, never key points or closed notes', () => {
    const notes = [
      note('note.1', 'sc.2'),
      note('note.2', 'sc.1'),
      note('note.3', 'sc.1', { status: 'open' }),
      note('note.4', 'sc.1', { status: 'resolved' }),
      note('note.5', 'sc.1', { status: 'dropped' }),
      note('note.6', 'sc.1', { kind: 'keypoint' }),
      note('note.7', 'sc.9'),   // not in this chapter
    ]
    expect(workableScenes(notes, [{ scene: 'sc.1' }, { scene: 'sc.2' }, { scene: 'sc.3' }]))
      .toEqual([{ scene: 'sc.1', count: 2 }, { scene: 'sc.2', count: 1 }])
    expect(workableScenes([], [{ scene: 'sc.1' }])).toEqual([])
  })
})

describe('workLabel', () => {
  it('says "these notes" alone and names the scene among several', () => {
    expect(workLabel({ scene: 'sc.1', count: 1 }, true)).toBe('work through this note')
    expect(workLabel({ scene: 'sc.1', count: 2 }, true)).toBe('work through these 2 notes')
    expect(workLabel({ scene: 'sc.1', count: 3 }, false)).toBe('work 3 notes on sc.1')
  })
})
