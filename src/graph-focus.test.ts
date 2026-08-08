import { describe, expect, it } from 'vitest'
import { focusSet } from './graph-focus'
import type { Canon, Chapter, ProseScene } from './canon'

const ent = (id: string, type = 'character', part_of?: string) =>
  ({ id, type, name: id, status: 'canon', summary: '', part_of }) as Canon['entities'][string]

const canon = {
  entities: {
    'char.a': ent('char.a'), 'char.b': ent('char.b'), 'char.c': ent('char.c'),
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
} as unknown as Canon

const chapter = {
  id: 'ch.01', order: 1, title: 'One', status: 'proposed', summary: '',
  span: {}, pov: 'char.a', events: ['event.one'], locations: ['place.city'],
} as unknown as Chapter

const scene = {
  scene: 'sc.01-1', chapter: 'ch.01', status: 'proposed', pov: null,
  events: [], facts: ['obj.photo', 'rel.ab'], contract: null, file: 'prose/ch-01/scene-01.md', body: '',
} as ProseScene

describe('focusSet', () => {
  it('all mode dims nothing', () => {
    expect(focusSet('all', canon, chapter, [], 'char.a')).toBeNull()
  })

  it('chapter mode keeps pov, locations, event cast/where, and scene fact bindings', () => {
    const keep = focusSet('chapter', canon, chapter, [scene], null)!
    expect([...keep].sort()).toEqual(['char.a', 'char.b', 'obj.photo', 'place.cafe', 'place.city'])
    // rel.ab is a relationship id, not an entity — never in the node set
    expect(keep.has('rel.ab')).toBe(false)
  })

  it('chapter mode without a chapter dims nothing', () => {
    expect(focusSet('chapter', canon, undefined, [], null)).toBeNull()
  })

  it('selection mode keeps the node, its relationship neighbors, and part_of links', () => {
    const keep = focusSet('selection', canon, chapter, [], 'char.b')!
    expect([...keep].sort()).toEqual(['char.a', 'char.b', 'char.c'])
    const place = focusSet('selection', canon, chapter, [], 'place.city')!
    expect(place.has('place.cafe')).toBe(true)   // children of the selection stay lit
  })

  it('selection mode without a resolving selection dims nothing', () => {
    expect(focusSet('selection', canon, chapter, [], null)).toBeNull()
    expect(focusSet('selection', canon, chapter, [], 'char.nope')).toBeNull()
  })
})
