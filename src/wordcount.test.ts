import { expect, test } from 'vitest'
import {
  countWords, formatReadingTime, formatWords, nextRegister, pageAt, pageCount,
  progressLabel, readingMinutes, totalWords, wordsByChapter, wordsLeft,
} from './wordcount'

test('counts words across paragraphs and line breaks', () => {
  expect(countWords('The morning smelled of coffee\nbefore it smelled of anything else.')).toBe(11)
})

test('empty and whitespace-only bodies count nothing', () => {
  expect(countWords('')).toBe(0)
  expect(countWords('   \n\n  ')).toBe(0)
})

test('markdown markers are not words', () => {
  // A scene divider, a bare em dash, a heading marker: punctuation, not prose.
  expect(countWords('***')).toBe(0)
  expect(countWords('going on —\n\n***\n\ngoing on')).toBe(4)
  expect(countWords('## The Café')).toBe(2)
})

test('emphasis and quotes stay attached to their word', () => {
  expect(countWords('*going* on, "going on"')).toBe(4)
})

test('accents and non-Latin characters count as words', () => {
  expect(countWords('un cafecito · Señora Ochoa')).toBe(4)
})

const SCENES = [
  { chapter: 'ch.00', body: 'one two three' },
  { chapter: 'ch.00', body: 'four five' },
  { chapter: 'ch.01', body: 'six' },
  { chapter: 'ch.02', body: '   ' },
]

test('sums scenes per chapter', () => {
  const by = wordsByChapter(SCENES)
  expect(by.get('ch.00')).toBe(5)
  expect(by.get('ch.01')).toBe(1)
})

test('a chapter with no prose is absent, not zero', () => {
  expect(wordsByChapter(SCENES).has('ch.02')).toBe(false)
})

test('totals every drafted scene', () => {
  expect(totalWords(SCENES)).toBe(6)
})

test('formats thousands', () => {
  expect(formatWords(0)).toBe('0')
  expect(formatWords(940)).toBe('940')
  expect(formatWords(12340)).toBe('12,340')
})

test('reading time rounds to the nearest minute at 230 wpm', () => {
  expect(readingMinutes(230)).toBe(1)
  expect(readingMinutes(1299)).toBe(6)
})

test('any prose at all reads as at least a minute', () => {
  expect(readingMinutes(1)).toBe(1)
  expect(readingMinutes(0)).toBe(0)
})

test('chapters read in minutes, a book in hours', () => {
  expect(formatReadingTime(1299)).toBe('6 min')
  expect(formatReadingTime(13800)).toBe('1 hr')
  expect(formatReadingTime(90000)).toBe('6 hr 31 min')
})

test('nothing drafted has no reading time to state', () => {
  expect(formatReadingTime(0)).toBe('')
})

test('pages round at 250 words, and any prose is at least one page', () => {
  expect(pageCount(1300)).toBe(5)
  expect(pageCount(1)).toBe(1)
  expect(pageCount(0)).toBe(0)
})

test('the top of a chapter is page 1 and the bottom is the last page', () => {
  expect(pageAt(0, 5)).toBe(1)
  expect(pageAt(1, 5)).toBe(5)
})

test('the page never lands outside the "of M" it is quoted against', () => {
  for (const p of [-1, 0, 0.01, 0.5, 0.99, 1, 2]) {
    const n = pageAt(p, 5)
    expect(n).toBeGreaterThanOrEqual(1)
    expect(n).toBeLessThanOrEqual(5)
  }
  expect(pageAt(0.5, 0)).toBe(0)
})

test('what is left counts down with the scroll', () => {
  expect(wordsLeft(0, 1300)).toBe(1300)
  expect(wordsLeft(0.5, 1300)).toBe(650)
  expect(wordsLeft(1, 1300)).toBe(0)
})

test('the register cycles back to where it started', () => {
  expect(nextRegister('page')).toBe('pages')
  expect(nextRegister('pages')).toBe('minutes')
  expect(nextRegister('minutes')).toBe('words')
  expect(nextRegister('words')).toBe('page')
})

test('each register states the same position its own way', () => {
  expect(progressLabel('page', 0, 1300)).toBe('Page 1 of 5')
  expect(progressLabel('pages', 0, 1300)).toBe('5 pages left in this chapter')
  expect(progressLabel('minutes', 0, 1300)).toBe('6 min left in this chapter')
  expect(progressLabel('words', 0, 1300)).toBe('1,300 words left in this chapter')
})

test('a single page left is not "1 pages"', () => {
  expect(progressLabel('pages', 0.9, 1300)).toBe('1 page left in this chapter')
})

test('a five-page chapter never has six pages left in it', () => {
  // Pages-left is measured the way the chapter was measured. Ceiling it
  // independently is what would put more pages ahead than the book has.
  const m = pageCount(1300)
  for (const p of [0, 0.1, 0.33, 0.5, 0.75, 0.99]) {
    const said = Number(progressLabel('pages', p, 1300).split(' ')[0])
    expect(said).toBeLessThanOrEqual(m)
    expect(said).toBeGreaterThanOrEqual(1)
  }
})

test('the end of a chapter says so rather than counting down to zero', () => {
  expect(progressLabel('pages', 1, 1300)).toBe('End of the chapter')
  expect(progressLabel('minutes', 1, 1300)).toBe('End of the chapter')
  expect(progressLabel('words', 1, 1300)).toBe('End of the chapter')
  // The page register still names the page — "Page 5 of 5" IS the end.
  expect(progressLabel('page', 1, 1300)).toBe('Page 5 of 5')
})

test('a chapter with no drafted prose has no position to report', () => {
  for (const r of ['page', 'pages', 'minutes', 'words'] as const) {
    expect(progressLabel(r, 0.5, 0)).toBe('')
  }
})
