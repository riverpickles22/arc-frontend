import { describe, expect, it } from 'vitest'
import { focusOnClear, focusOnMode, focusOnSelect, focusSet, initialFocus } from './graph-focus'
import type { Canon, Chapter, ProseScene } from './canon'

const ent = (id: string, type = 'character', part_of?: string, states?: unknown[]) =>
  ({ id, type, name: id, status: 'canon', summary: '', part_of, states }) as Canon['entities'][string]

const canon = {
  entities: {
    // char.a is in the café through 1958 and leaves for the city in 1959 —
    // the occupancy tests read this timeline from both sides of the move.
    'char.a': ent('char.a', 'character', undefined, [
      { at: { date: '1958-06-01' }, location: 'place.cafe' },
      { at: { date: '1959-02-01' }, location: 'place.city' },
    ]),
    'char.b': ent('char.b'), 'char.c': ent('char.c'),
    'place.city': ent('place.city', 'place'),
    'place.cafe': ent('place.cafe', 'place', 'place.city'),
    'obj.photo': ent('obj.photo', 'object'),
  },
  events: {
    'event.one': {
      id: 'event.one', participants: [{ entity: 'char.a', role: 'subject' }],
      witnesses: ['char.b'], where: 'place.cafe',
    },
  },
  relationships: [
    { id: 'rel.ab', from: 'char.a', to: 'char.b', kind: 'friend', status: 'canon' },
    { id: 'rel.bc', from: 'char.b', to: 'char.c', kind: 'rival', status: 'canon' },
  ],
  chapters: [],
  timeline: { eras: [] },
} as unknown as Canon

const chapter = {
  id: 'ch.01', order: 1, title: 'One', status: 'proposed', summary: '',
  span: {}, pov: 'char.a', events: ['event.one'], locations: ['place.city'],
} as unknown as Chapter

const scene = {
  scene: 'sc.01-1', chapter: 'ch.01', status: 'proposed', pov: null,
  events: [], facts: ['obj.photo', 'rel.ab'], contract: null, file: 'prose/ch-01/scene-01.md', body: '',
} as ProseScene

const T1958 = 19581231   // char.a still at the café
const T1959 = 19591231   // char.a has moved to the city

describe('focusSet', () => {
  it('all mode dims nothing', () => {
    expect(focusSet('all', canon, chapter, [], 'char.a', T1958)).toBeNull()
  })

  it('chapter mode keeps pov, locations, event cast/where, and scene fact bindings', () => {
    const keep = focusSet('chapter', canon, chapter, [scene], null, T1958)!
    expect([...keep].sort()).toEqual(['char.a', 'char.b', 'obj.photo', 'place.cafe', 'place.city'])
    // rel.ab is a relationship id, not an entity — never in the node set
    expect(keep.has('rel.ab')).toBe(false)
  })

  it('chapter mode without a chapter dims nothing', () => {
    expect(focusSet('chapter', canon, undefined, [], null, T1958)).toBeNull()
  })

  it('selection mode keeps the node, its relationship neighbors, and part_of links', () => {
    const keep = focusSet('selection', canon, chapter, [], 'char.b', T1958)!
    expect([...keep].sort()).toEqual(['char.a', 'char.b', 'char.c'])
  })

  it('a selected place keeps its children and its occupants at T — and only at T', () => {
    // At 1958 char.a stands in the café, which is part of the city: both the
    // café and the city selections keep him.
    const cafe = focusSet('selection', canon, chapter, [], 'place.cafe', T1958)!
    expect(cafe.has('char.a')).toBe(true)
    const city = focusSet('selection', canon, chapter, [], 'place.city', T1958)!
    expect(city.has('place.cafe')).toBe(true)   // children of the selection stay lit
    expect(city.has('char.a')).toBe(true)       // occupancy climbs part_of

    // After the move the café no longer holds him; the city does directly.
    expect(focusSet('selection', canon, chapter, [], 'place.cafe', T1959)!.has('char.a')).toBe(false)
    expect(focusSet('selection', canon, chapter, [], 'place.city', T1959)!.has('char.a')).toBe(true)

    // A character with no located state is never an occupant of anywhere.
    expect(cafe.has('char.b')).toBe(false)
  })

  it('a selected event keeps its cast, witnesses and stage', () => {
    const keep = focusSet('selection', canon, chapter, [], 'event.one', T1958)!
    expect([...keep].sort()).toEqual(['char.a', 'char.b', 'place.cafe'])
  })

  it('selection mode without a resolving selection dims nothing', () => {
    expect(focusSet('selection', canon, chapter, [], null, T1958)).toBeNull()
    expect(focusSet('selection', canon, chapter, [], 'char.nope', T1958)).toBeNull()
  })
})

describe('selection-driven focus (the machine)', () => {
  it('opens on All, or on Selection when the URL already carries one', () => {
    expect(initialFocus(false).mode).toBe('all')
    expect(initialFocus(true).mode).toBe('selection')
  })

  it('a click auto-switches to Selection and remembers what it displaced', () => {
    const s = focusOnSelect(initialFocus(false))
    expect(s.mode).toBe('selection')
    expect(s.prev).toBe('all')
  })

  it('clearing the selection restores the displaced mode and unpins', () => {
    const chapterFirst = focusOnSelect(focusOnMode(initialFocus(false), 'chapter'))
    // pinned chapter: the click must NOT have switched it
    expect(chapterFirst.mode).toBe('chapter')

    const auto = focusOnSelect(initialFocus(false))
    const cleared = focusOnClear(auto)
    expect(cleared.mode).toBe('all')
    expect(cleared.pinned).toBe(false)
  })

  it('a deliberate All survives the next click, but not the next selection cycle', () => {
    const pinnedAll = focusOnMode(focusOnSelect(initialFocus(false)), 'all')
    expect(focusOnSelect(pinnedAll).mode).toBe('all')          // pinned wins over auto
    const afterClear = focusOnClear(pinnedAll)
    expect(afterClear.pinned).toBe(false)
    expect(focusOnSelect(afterClear).mode).toBe('selection')   // the next cycle auto-switches again
  })
})
