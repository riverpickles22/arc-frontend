import { expect, test } from 'vitest'
import { chapterText, copyableScenes, sceneText } from './manuscript-text'

test('a scene copies as its prose, trimmed', () => {
  expect(sceneText({ body: '\n\nThe morning smelled of coffee.\n\n' }))
    .toBe('The morning smelled of coffee.')
})

test('paragraph breaks inside a scene survive intact', () => {
  const body = 'First paragraph.\n\nSecond paragraph.'
  expect(sceneText({ body })).toBe(body)
})

test('a chapter joins its scenes with a blank line and invents no separator', () => {
  expect(chapterText([{ body: 'One.' }, { body: 'Two.' }])).toBe('One.\n\nTwo.')
})

test('empty scenes drop out rather than leaving a gap', () => {
  expect(chapterText([{ body: 'One.' }, { body: '   ' }, { body: 'Three.' }]))
    .toBe('One.\n\nThree.')
})

// The version rule: proposed text in, overridden text out.
test('a modified scene copies its proposed text, never the version it overrides', () => {
  // ProseScene.body is the working tree; the overridden text lives on
  // ProseChange.main, which copy must never reach for.
  const scenes = [{ file: 'prose/ch-00/scene-01.md', body: 'the proposed sentence.' }]
  const changes = [{
    file: 'prose/ch-00/scene-01.md',
    status: 'modified' as const,
    main: { body: 'the overridden sentence.' },
  }]
  const out = chapterText(copyableScenes(scenes, changes))
  expect(out).toBe('the proposed sentence.')
  expect(out).not.toContain('overridden')
})

test('a scene the draft adds is copied like any other', () => {
  const scenes = [{ file: 'a.md', body: 'ratified.' }, { file: 'b.md', body: 'brand new.' }]
  const changes = [{ file: 'b.md', status: 'added' as const }]
  expect(chapterText(copyableScenes(scenes, changes))).toBe('ratified.\n\nbrand new.')
})

test('a scene the draft deletes is not copied', () => {
  const scenes = [{ file: 'a.md', body: 'kept.' }, { file: 'b.md', body: 'on the way out.' }]
  const changes = [{ file: 'b.md', status: 'deleted' as const }]
  expect(chapterText(copyableScenes(scenes, changes))).toBe('kept.')
})

test('with no pending draft, every scene is copyable', () => {
  const scenes = [{ file: 'a.md', body: 'one.' }, { file: 'b.md', body: 'two.' }]
  expect(copyableScenes(scenes)).toHaveLength(2)
})

test('a chapter with no drafted prose copies as nothing', () => {
  expect(chapterText([])).toBe('')
  expect(chapterText([{ body: '\n' }])).toBe('')
})
