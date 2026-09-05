import { describe, expect, it } from 'vitest'
import type { Chapter, ProseChange, ProseScene } from './canon'
import { changesHere, draftWhere, groupByChapter, placeChanges, placeLabel } from './draft-map'

const chapters = [
  { id: 'ch.00', order: 0, title: 'The Hollowing' },
  { id: 'ch.01', order: 1, title: 'The Café' },
  { id: 'ch.02', order: 2, title: 'Dogs of the Neighborhood' },
] as Chapter[]

const scene = (file: string, id: string, chapter: string): ProseScene =>
  ({ file, scene: id, chapter, body: '', facts: [], events: [], pov: null, contract: null } as unknown as ProseScene)

const scenes = [
  scene('prose/ch-00/scene-01.md', 'sc.00-1', 'ch.00'),
  scene('prose/ch-01/scene-01.md', 'sc.01-1', 'ch.01'),
  scene('prose/ch-02/scene-01.md', 'sc.02-1', 'ch.02'),
]

const change = (file: string, status: ProseChange['status'] = 'modified', main: ProseScene | null = null): ProseChange =>
  ({ file, status, main })

describe('placeChanges', () => {
  it('places a change by the scene\'s own chapter, and knows which is here', () => {
    const p = placeChanges([change('prose/ch-01/scene-01.md')], scenes, chapters, 'ch.00')
    expect(p).toEqual([{
      file: 'prose/ch-01/scene-01.md',
      status: 'modified',
      scene: 'sc.01-1',
      chapter: 'ch.01',
      chapterLabel: 'Chapter 1 — The Café',
      here: false,
    }])
    expect(placeChanges([change('prose/ch-01/scene-01.md')], scenes, chapters, 'ch.01')[0].here).toBe(true)
  })

  it('names a deleted scene from the version at HEAD, which is all that is left of it', () => {
    const gone = change('prose/ch-02/scene-01.md', 'deleted', scene('prose/ch-02/scene-01.md', 'sc.02-1', 'ch.02'))
    const p = placeChanges([gone], [], chapters, 'ch.02')
    expect(p[0].scene).toBe('sc.02-1')
    expect(p[0].here).toBe(true)
  })

  it('keeps the path when nothing in the record knows the file', () => {
    const p = placeChanges([change('prose/ch-09/scene-09.md', 'added')], scenes, chapters, 'ch.00')
    expect(p[0].scene).toBeNull()
    expect(p[0].here).toBe(false)
    expect(placeLabel(p[0])).toBe('prose/ch-09/scene-09.md · not in canon yet')
  })
})

describe('placeLabel', () => {
  it('names the scene and the chapter it is in', () => {
    const [p] = placeChanges([change('prose/ch-01/scene-01.md')], scenes, chapters, 'ch.00')
    expect(placeLabel(p)).toBe('sc.01-1 · Chapter 1 — The Café')
  })
})

describe('draftWhere', () => {
  const place = (files: string[], current: string | null) =>
    placeChanges(files.map(f => change(f)), scenes, chapters, current)

  it('says nothing pending here, and names the one chapter that has it', () => {
    // The case the author hit: reading the Prologue, the change in Chapter 1.
    expect(draftWhere(place(['prose/ch-01/scene-01.md'], 'ch.00'), 'ch.00'))
      .toBe('nothing pending in this chapter · 1 scene changed in Chapter 1 — The Café')
  })

  it('counts the places when the work is spread across several', () => {
    expect(draftWhere(place(['prose/ch-01/scene-01.md', 'prose/ch-02/scene-01.md'], 'ch.00'), 'ch.00'))
      .toBe('nothing pending in this chapter · 2 scenes changed in 2 other chapters')
  })

  it('says it is here when it is', () => {
    expect(draftWhere(place(['prose/ch-01/scene-01.md'], 'ch.01'), 'ch.01')).toBe('1 scene changed here')
  })

  it('gives both counts when the work straddles the chapter on screen', () => {
    expect(draftWhere(place(['prose/ch-01/scene-01.md', 'prose/ch-02/scene-01.md'], 'ch.01'), 'ch.01'))
      .toBe('1 scene changed here · 1 more elsewhere')
  })

  it('is empty with nothing pending, and drops the here-clause with no chapter open', () => {
    expect(draftWhere([], 'ch.00')).toBe('')
    expect(draftWhere(place(['prose/ch-01/scene-01.md'], null), null))
      .toBe('1 scene changed in Chapter 1 — The Café')
  })
})

describe('the chapter on screen', () => {
  const place = (files: string[], current: string | null) =>
    placeChanges(files.map(f => change(f)), scenes, chapters, current)

  it('knows when this chapter has nothing to switch between', () => {
    expect(changesHere(place(['prose/ch-01/scene-01.md'], 'ch.00'))).toEqual([])
    expect(changesHere(place(['prose/ch-01/scene-01.md'], 'ch.01'))).toHaveLength(1)
  })

})

describe('groupByChapter', () => {
  it('groups by the chapter that holds each change, keeping the book\'s order', () => {
    const p = placeChanges(
      [change('prose/ch-01/scene-01.md'), change('prose/ch-02/scene-01.md'), change('prose/ch-00/scene-01.md')],
      scenes, chapters, 'ch.00')
    expect(groupByChapter(p).map(g => [g.label, g.changes.length]))
      .toEqual([['Chapter 1 — The Café', 1], ['Chapter 2 — Dogs of the Neighborhood', 1], ['Prologue — The Hollowing', 1]])
  })

  it('puts several changes of one chapter under one heading, and names an unknown chapter honestly', () => {
    const p = placeChanges(
      [change('prose/ch-01/scene-01.md'), change('prose/ch-01/scene-01.md'), change('prose/ch-09/x.md')],
      scenes, chapters, null)
    const g = groupByChapter(p)
    expect(g).toHaveLength(2)
    expect(g[0].changes).toHaveLength(2)
    expect(g[1].label).toBe('Not in canon yet')
  })
})

