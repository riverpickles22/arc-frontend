import { expect, test } from 'vitest'
import {
  chapterText, copyableScenes, isSingleWord, offsetOfParagraph, paragraphAtOffset, paragraphRange, sceneText,
} from './manuscript-text'

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


test('offsets map to the same indices paragraphsOf produces', () => {
  const body = 'First paragraph here.\n\nSecond one.\n\nThird and last.'
  expect(paragraphAtOffset(body, 0)).toBe(0)
  expect(paragraphAtOffset(body, body.indexOf('Second') + 3)).toBe(1)
  expect(paragraphAtOffset(body, body.indexOf('Third'))).toBe(2)
})

test('leading blank lines do not shift the count — the empty chunk is dropped, not counted', () => {
  const body = '\n\nFirst real paragraph.\n\nSecond.'
  expect(paragraphAtOffset(body, body.indexOf('First'))).toBe(0)
  expect(paragraphAtOffset(body, body.indexOf('Second'))).toBe(1)
})

test('runs of blank lines between paragraphs count as one break', () => {
  const body = 'One.\n\n\n\n\nTwo.'
  expect(paragraphAtOffset(body, body.indexOf('Two.'))).toBe(1)
})

test('an offset in the gap anchors to the following paragraph', () => {
  const body = 'One.\n\nTwo.'
  expect(paragraphAtOffset(body, 5)).toBe(1)   // inside the \n\n
})

test('past the end clamps to the last paragraph', () => {
  const body = 'Only one paragraph.'
  expect(paragraphAtOffset(body, 9999)).toBe(0)
})

test('a single word, with or without the whitespace a double-click drags along', () => {
  expect(isSingleWord('walked')).toBe(true)
  expect(isSingleWord('  walked ')).toBe(true)
  expect(isSingleWord('walked\n')).toBe(true)
})

test('punctuation inside a word does not make it two', () => {
  expect(isSingleWord("don't")).toBe(true)
  expect(isSingleWord('sea-grape')).toBe(true)
  expect(isSingleWord('1848,')).toBe(true)
})

test('anything with whitespace inside it, or nothing at all, is not a single word', () => {
  expect(isSingleWord('sea grape')).toBe(false)
  expect(isSingleWord('He was very tired.')).toBe(false)
  expect(isSingleWord('')).toBe(false)
  expect(isSingleWord('   ')).toBe(false)
})


test('a paragraph index maps back to where that paragraph starts', () => {
  const body = 'First paragraph here.\n\nSecond one.\n\nThird and last.'
  expect(offsetOfParagraph(body, 0)).toBe(0)
  expect(offsetOfParagraph(body, 1)).toBe(body.indexOf('Second'))
  expect(offsetOfParagraph(body, 2)).toBe(body.indexOf('Third'))
})

test('offsetOfParagraph is the inverse of paragraphAtOffset', () => {
  const body = '\n\nOne.\n\n\n\nTwo is a longer one, with a comma in it.\n\nThree.\n'
  for (const i of [0, 1, 2]) {
    expect(paragraphAtOffset(body, offsetOfParagraph(body, i))).toBe(i)
  }
})

test('leading and repeated blank lines do not shift where a paragraph starts', () => {
  const body = '\n\nFirst real paragraph.\n\n\n\nSecond.'
  expect(offsetOfParagraph(body, 0)).toBe(body.indexOf('First'))
  expect(offsetOfParagraph(body, 1)).toBe(body.indexOf('Second'))
})

test('an index past the end lands on the last paragraph, never back at zero', () => {
  const body = 'One.\n\nTwo.\n\nThree.'
  expect(offsetOfParagraph(body, 99)).toBe(body.indexOf('Three'))
})

test('an empty body has nowhere to be but the start', () => {
  expect(offsetOfParagraph('', 0)).toBe(0)
  expect(offsetOfParagraph('   \n\n  ', 2)).toBe(0)
})

// Locking a run of prose is one decision. The menu used to see only the
// paragraph the selection STARTED in, so selecting three and locking locked
// one — and the author had to make the same decision twice more.
test('a selection spanning paragraphs covers every one it touches', () => {
  const body = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
  expect(paragraphRange(body, body.indexOf('First'), body.indexOf('Third') + 5)).toEqual([0, 1, 2])
  expect(paragraphRange(body, body.indexOf('First'), body.indexOf('Second') + 6)).toEqual([0, 1])
})

test('a selection inside one paragraph covers only that paragraph', () => {
  const body = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
  expect(paragraphRange(body, body.indexOf('Second'), body.indexOf('Second') + 6)).toEqual([1])
  const caret = body.indexOf('Third') + 2
  expect(paragraphRange(body, caret, caret)).toEqual([2])
})

test('stopping at the head of the next paragraph does not select it', () => {
  const body = 'First paragraph.\n\nSecond paragraph.'
  // Dragging to the top of paragraph 2 is how you finish selecting 1.
  expect(paragraphRange(body, 0, body.indexOf('Second'))).toEqual([0])
  // One character in, and you have genuinely marked it.
  expect(paragraphRange(body, 0, body.indexOf('Second') + 1)).toEqual([0, 1])
})

test('a backwards selection covers the same paragraphs as a forwards one', () => {
  const body = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
  const a = body.indexOf('First')
  const b = body.indexOf('Third') + 5
  expect(paragraphRange(body, b, a)).toEqual(paragraphRange(body, a, b))
})

test('blank-line runs do not put phantom paragraphs in the range', () => {
  const body = 'First.\n\n\n\nSecond.\n\nThird.'
  expect(paragraphRange(body, 0, body.length)).toEqual([0, 1, 2])
})
