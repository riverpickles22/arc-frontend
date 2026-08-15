import { describe, expect, it } from 'vitest'
import { appearances, changedBy, chapterOf, offPage, provenance, timelineOverlay } from './selection-walks'
import type { Canon, ProseScene } from './canon'

// An example story shaped like the real one: a photograph created in the
// café era, carried into exile, rediscovered at the end; a protagonist who
// is off-page for the middle stretch; a café inside a city.
const ent = (id: string, type = 'character', extra: object = {}) =>
  ({ id, type, name: `The ${id.split('.')[1]}`, status: 'canon', summary: '', ...extra }) as Canon['entities'][string]

const ch = (id: string, order: number, extra: object = {}) =>
  ({ id, type: 'chapter', order, title: `Chapter ${order}`, status: 'canon', summary: '', span: {}, ...extra }) as Canon['chapters'][number]

const canon = {
  entities: {
    'char.a': ent('char.a', 'character', {
      born: '1930-04-01', died: '1999-01-01',
      states: [
        { at: { date: '1957-01-01' }, location: 'place.cafe' },
        { at: { date: '1960-03-01' }, caused_by: ['event.flee'], location: 'place.trinidad' },
        { at: { date: '1992-06-01' }, caused_by: ['event.return', 'event.unknown'], location: 'place.city' },
      ],
    }),
    'char.b': ent('char.b'),
    'char.ghost': ent('char.ghost', 'character', {
      status: 'proposed',
      states: [{ at: { date: '1960-01-01' }, caused_by: ['event.flee'] }],
    }),
    'place.city': ent('place.city', 'place'),
    'place.cafe': ent('place.cafe', 'place', { part_of: 'place.city' }),
    'place.trinidad': ent('place.trinidad', 'place'),
    'obj.photo': ent('obj.photo', 'object', {
      states: [
        { at: { date: '1957-06-01' }, location: 'place.cafe', controlled_by: 'char.b', condition: 'framed behind the counter' },
        { at: { date: '1960-03-01' }, caused_by: ['event.flee'], location: 'place.trinidad', condition: 'sewn into the jacket lining' },
        { at: { date: '1992-06-01' }, note: 'face up for the first time in decades' },
        { at: { date: '1995-01-01' }, location: 'place.city' },
      ],
    }),
  },
  events: {
    'event.made': { id: 'event.made', title: 'The photograph is taken', when: { date: '1957-06-01' }, participants: [{ entity: 'char.a', role: 'subject' }], where: 'place.cafe', summary: '' },
    'event.flee': { id: 'event.flee', title: 'The flight to Trinidad', when: { date: '1960-03-01' }, participants: [{ entity: 'char.a', role: 'subject' }], witnesses: ['char.b'], where: 'place.cafe', summary: '' },
    'event.spat': { id: 'event.spat', title: 'The argument', when: { date: '1975-01-01' }, participants: [{ entity: 'char.b', role: 'subject' }], witnesses: ['char.a'], where: 'place.trinidad', summary: '' },
    'event.return': { id: 'event.return', title: 'The return', when: { date: '1992-06-01' }, participants: [{ entity: 'char.a', role: 'subject' }], where: 'place.city', summary: '' },
  },
  relationships: [],
  chapters: [
    ch('ch.01', 1, { pov: 'char.a', events: ['event.made'] }),
    ch('ch.02', 2, { events: ['event.flee'] }),
    ch('ch.03', 3, { locations: ['place.cafe'] }),
    ch('ch.04', 4, { events: ['event.spat'] }),
    ch('ch.05', 5, { events: ['event.return'] }),
    ch('ch.06', 6, {}),
  ],
  timeline: { eras: [] },
} as unknown as Canon

const scenes: ProseScene[] = [{
  scene: 'sc.06-1', chapter: 'ch.06', status: 'canon', pov: null,
  events: [], facts: ['obj.photo'], contract: null, file: 'prose/ch-06/scene-01.md', body: '',
} as unknown as ProseScene]

describe('appearances', () => {
  it('a character appears as pov, cast and witness — exactly those chapters, in reading order', () => {
    expect(appearances(canon, 'char.a', scenes)).toEqual(['ch.01', 'ch.02', 'ch.04', 'ch.05'])
    expect(appearances(canon, 'char.b', scenes)).toEqual(['ch.02', 'ch.04'])
  })

  it('a place is touched by its listed chapters and by events staged in it — part_of descent included', () => {
    expect(appearances(canon, 'place.cafe', scenes)).toEqual(['ch.01', 'ch.02', 'ch.03'])
    // the café is part of the city, so the city is touched wherever the café is
    expect(appearances(canon, 'place.city', scenes)).toEqual(['ch.01', 'ch.02', 'ch.03', 'ch.05'])
  })

  it('an object appears where a scene binds it as a fact', () => {
    expect(appearances(canon, 'obj.photo', scenes)).toEqual(['ch.06'])
    expect(appearances(canon, 'obj.photo', [])).toEqual([])
  })

  it('an unknown id appears nowhere', () => {
    expect(appearances(canon, 'char.nope', scenes)).toEqual([])
  })
})

describe('chapterOf', () => {
  it('finds the chapter staging an event, through its list or its scenes', () => {
    expect(chapterOf(canon, 'event.flee', scenes)).toBe('ch.02')
    expect(chapterOf(canon, 'event.nowhere', scenes)).toBeNull()
  })
})

describe('changedBy', () => {
  it('collects the caused_by events across states, deduped, resolved to chapters', () => {
    expect(changedBy(canon, 'char.a', scenes)).toEqual([
      { event: 'event.flee', chapter: 'ch.02' },
      { event: 'event.return', chapter: 'ch.05' },
    ])
  })

  it('skips events canon does not hold, and entities without states change nowhere', () => {
    // char.a's 1992 state also names event.unknown — it must not surface
    expect(changedBy(canon, 'char.a', scenes).some(m => m.event === 'event.unknown')).toBe(false)
    expect(changedBy(canon, 'char.b', scenes)).toEqual([])
  })
})

describe('provenance', () => {
  it('an object yields its states as a labelled sequence in state order', () => {
    expect(provenance(canon, 'obj.photo', scenes)).toEqual([
      { at: { date: '1957-06-01' }, label: 'framed behind the counter', chapter: null, events: [] },
      { at: { date: '1960-03-01' }, label: 'sewn into the jacket lining', chapter: 'ch.02', events: ['event.flee'] },
      { at: { date: '1992-06-01' }, label: 'face up for the first time in decades', chapter: null, events: [] },
      { at: { date: '1995-01-01' }, label: 'at The city', chapter: null, events: [] },
    ])
  })

  it('non-objects have no provenance', () => {
    expect(provenance(canon, 'char.a', scenes)).toEqual([])
  })
})

describe('offPage', () => {
  it('marks the chapters between first and last appearance where the entity is absent', () => {
    expect(offPage(canon, appearances(canon, 'char.a', scenes))).toEqual(['ch.03'])
  })

  it('fewer than two appearances means no stretch to be off from', () => {
    expect(offPage(canon, ['ch.02'])).toEqual([])
    expect(offPage(canon, [])).toEqual([])
  })
})

describe('timelineOverlay', () => {
  it('composes the walks for a character, with lifespan and off-page', () => {
    const o = timelineOverlay(canon, 'char.a', scenes)!
    expect(o.type).toBe('character')
    expect(o.proposed).toBe(false)
    expect(o.appears).toEqual(['ch.01', 'ch.02', 'ch.04', 'ch.05'])
    expect(o.offPage).toEqual(['ch.03'])
    expect(o.changed.map(m => m.event)).toEqual(['event.flee', 'event.return'])
    expect(o.steps).toEqual([])
    expect(o.lifespan).toEqual({ start: '1930-04-01', end: '1999-01-01' })
  })

  it('a proposed entity says so — style, never colour, will carry it', () => {
    expect(timelineOverlay(canon, 'char.ghost', scenes)!.proposed).toBe(true)
  })

  it('objects carry steps but no off-page or lifespan', () => {
    const o = timelineOverlay(canon, 'obj.photo', scenes)!
    expect(o.steps.length).toBe(4)
    expect(o.offPage).toEqual([])
    expect(o.lifespan).toBeNull()
  })

  it('null selection, chapters, events and silent entities overlay nothing', () => {
    expect(timelineOverlay(canon, null, scenes)).toBeNull()
    expect(timelineOverlay(canon, 'ch.01', scenes)).toBeNull()
    expect(timelineOverlay(canon, 'event.flee', scenes)).toBeNull()
    expect(timelineOverlay(canon, 'place.trinidad', scenes)).not.toBeNull() // events stage there
    expect(timelineOverlay(canon, 'char.nope', scenes)).toBeNull()
  })
})
