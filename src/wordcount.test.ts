import { expect, test } from 'vitest'
import {
  countWords, formatReadingTime, formatWords, readingMinutes, totalWords, wordsByChapter,
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
