// The display vocabulary as data: one derivation both surfaces render from.
import { expect, test } from 'vitest'
import type { Canon, Chapter } from './canon'
import { dk } from './canon'
import { displayState, livingNote } from './entity-state'

const eras = [
  { id: 'era.before', name: 'Before', span: { start: '1840-01-01', end: '1847-12-31' } },
  { id: 'era.story', name: 'The story', span: { start: '1848-01-01', end: '1960-12-31' } },
]

const canon = {
  entities: {
    'char.living': {
      id: 'char.living', type: 'character', name: 'Living', status: 'canon', summary: '',
      born: '1840',
      states: [
        { at: { era: 'era.story', date: '1848' }, location: 'place.coast' },
        { at: { era: 'era.story', date: '1900' }, location: 'place.city' },
      ],
    },
    'char.dead': {
      id: 'char.dead', type: 'character', name: 'Dead', status: 'canon', summary: '',
      born: '1840', died: '1890',
      states: [{ at: { era: 'era.story', date: '1885' }, location: 'place.coast' }],
    },
    'char.unborn': {
      id: 'char.unborn', type: 'character', name: 'Unborn', status: 'canon', summary: '',
      born: '1930', states: [],
    },
    'place.coast': { id: 'place.coast', type: 'place', name: 'Coast', status: 'proposed', summary: '' },
  },
  timeline: { eras },
} as unknown as Canon

const chapter = {
  id: 'ch.02', type: 'chapter', order: 2, title: 'Two', status: 'proposed',
  span: { start: '1899', end: '1901' }, pov: 'char.living', summary: '',
} as Chapter

const T = dk('1920', true)

test('the three lives: living, deceased, and not yet present are three states', () => {
  expect(displayState(canon, 'char.living', T).deceased).toBe(false)
  expect(displayState(canon, 'char.living', T).notYet).toBe(false)

  const dead = displayState(canon, 'char.dead', T)
  expect(dead.deceased).toBe(true)
  expect(dead.notYet).toBe(false)

  const unborn = displayState(canon, 'char.unborn', T)
  expect(unborn.notYet).toBe(true)
  expect(unborn.deceased).toBe(false, 'a death the reader passed and an arrival still coming are different facts')

  expect(livingNote(dead)).toMatch(/no longer living/)
  expect(livingNote(unborn)).toMatch(/not yet present/)
  expect(livingNote(displayState(canon, 'char.living', T))).toBeNull()
})

test('a dead character keeps their last honest location; silence stays silent', () => {
  expect(displayState(canon, 'char.dead', T).lastLocation).toBe('place.coast')
  expect(displayState(canon, 'char.unborn', T).lastLocation).toBeNull()
})

test('proposed is decoration data, never a different colour', () => {
  expect(displayState(canon, 'place.coast', T).pending).toBe(true)
  expect(displayState(canon, 'char.living', T).pending).toBe(false)
})

test('the chapter under the cursor marks its POV and what it is moving', () => {
  const ds = displayState(canon, 'char.living', T, chapter)
  expect(ds.pov).toBe(true)
  expect(ds.changedThisChapter).toBe(true, 'the 1900 state sits inside the chapter span')
  expect(displayState(canon, 'char.dead', T, chapter).changedThisChapter).toBe(false)
  expect(displayState(canon, 'char.dead', T, chapter).pov).toBe(false)
  // No chapter, no chapter-relative claims.
  expect(displayState(canon, 'char.living', T).pov).toBe(false)
})

test('an unknown id renders as nothing at all, never a guess', () => {
  const ds = displayState(canon, 'char.nobody', T)
  expect(ds).toEqual({ pending: false, notYet: false, deceased: false, pov: false, changedThisChapter: false, lastLocation: null })
})
