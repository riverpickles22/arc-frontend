import { expect, test } from 'vitest'
import { calendarScale, sliderMargins } from './scale'
import type { Chapter, Era, EventDoc } from '../../canon'

const era = (id: string, start: string, end: string): Era =>
  ({ id, name: id, span: { start, end } }) as Era
const ch = (order: number, start: string, end: string): Chapter =>
  ({ id: `ch.${order}`, type: 'chapter', order, title: `C${order}`, status: 'x', span: { start, end }, summary: '' }) as Chapter
const ev = (id: string, eraId: string, date?: string): EventDoc =>
  ({ id, scope: 'story', status: 'x', title: id, when: { era: eraId, date }, summary: '' }) as EventDoc

const ERAS = [era('era.a', '1950', '1959'), era('era.b', '1960', '1989'), era('era.c', '1990', '1994')]
const W = 1000

test('segments cover the axis exactly and stay in chronological order', () => {
  const s = calendarScale(ERAS, [], [], [1950, 1994], W)
  expect(s.segs.map(x => x.e.id)).toEqual(['era.a', 'era.b', 'era.c'])
  const total = s.segs.reduce((a, x) => a + x.w, 0)
  expect(total).toBeCloseTo(W, 6)
  expect(s.segs[0].x0).toBe(0)
  expect(s.segs[2].x0 + s.segs[2].w).toBeCloseTo(W, 6)
})

test('content pulls width: a dense short era outweighs an empty long one', () => {
  const chapters = [ch(1, '1950-01', '1950-06'), ch(2, '1951-01', '1951-06'), ch(3, '1952-01', '1952-06')]
  const events = [ev('e1', 'era.a', '1953'), ev('e2', 'era.a', '1954')]
  const s = calendarScale(ERAS, chapters, events, [1950, 1994], W)
  const byId = Object.fromEntries(s.segs.map(x => [x.e.id, x]))
  // era.a: 10 years, all the content; era.b: 30 years, nothing.
  expect(byId['era.a'].w).toBeGreaterThan(byId['era.b'].w)
  // and the empty long era is flagged condensed
  expect(s.condensed(byId['era.b'])).toBe(true)
  expect(s.condensed(byId['era.a'])).toBe(false)
})

test('the floor keeps even an empty era readable', () => {
  const chapters = [ch(1, '1950-01', '1950-06')]
  const s = calendarScale(ERAS, chapters, [], [1950, 1994], W)
  for (const seg of s.segs) expect(seg.w).toBeGreaterThan(W * 0.04)
})

test('x maps linearly within an era and snaps gaps forward', () => {
  const gapped = [era('era.a', '1950', '1959'), era('era.b', '1970', '1979')]
  const s = calendarScale(gapped, [], [], [1950, 1979], W)
  // a year inside era.a maps linearly across its span (whose end key
  // end-snaps to 1959-12-31 per the shared date rule)
  const a = s.segs[0]
  const expected = a.x0 + ((1955 - a.span[0]) / (a.span[1] - a.span[0])) * a.w
  expect(s.x(1955)).toBeCloseTo(expected, 6)
  // a year in the 1960-1969 gap snaps to era.b's left edge
  expect(s.x(1965)).toBeCloseTo(s.segs[1].x0, 6)
  // clamps at both ends
  expect(s.x(1900)).toBe(0)
  expect(s.x(2100)).toBeCloseTo(W, 6)
})

test('xd resolves month precision inside the year', () => {
  const one = [era('era.a', '1950', '1959')]
  const s = calendarScale(one, [], [], [1950, 1959], W)
  expect(s.xd('1955-01')).toBeCloseTo(s.x(1955), 6)
  expect(s.xd('1955-12', true)).toBeCloseTo(s.x(1956), 6)
  expect(s.xd('1955')).toBeCloseTo(s.x(1955), 6)
})

test('invX inverts x within every era, condensed ones included', () => {
  const chapters = [ch(1, '1950-01', '1950-06'), ch(2, '1951-01', '1951-06'), ch(3, '1952-01', '1952-06')]
  const s = calendarScale(ERAS, chapters, [], [1950, 1994], W)
  // era.b is condensed here (30 empty years); the round-trip must hold there
  // too, or the slider diverges exactly where the axis compresses.
  // The contract the slider relies on: after rounding (its onChange does),
  // the round trip returns the year. Era floors sit at yyyy.0101 — the axis's
  // real start — so the raw inverse can differ by a hundredth of a year.
  for (const year of [1950, 1955, 1962, 1975, 1988, 1991, 1994]) {
    expect(Math.round(s.invX(s.x(year)))).toBe(year)
  }
})

test('invX clamps at the axis ends', () => {
  const s = calendarScale(ERAS, [], [], [1950, 1994], W)
  expect(Math.round(s.invX(-50))).toBe(1950)
  expect(Math.round(s.invX(0))).toBe(1950)
  const last = s.segs.at(-1)!
  expect(s.invX(W + 50)).toBeCloseTo(last.span[1], 6)
})

test('sliderMargins puts the thumb centre on the cursor line — the algebra, checked', () => {
  // Simulate the browser: container C px, margins as computed, thumb centre
  // at value v = M_left + tw/2 + (v/max)·(track − tw). Assert it lands on the
  // svg line for every value, both bands.
  const C = 976   // any container width
  const tw = 14
  const px = (m: string) => {
    // resolve calc(a% ± b px) against C; strip spaces so the operator joins
    // its operand and the sign survives the regex
    const s2 = m.replace(/\s/g, '')
    const pct = /(-?[\d.]+)%/.exec(s2)
    const fixed = /(-?[\d.]+)px/.exec(s2)
    return (pct ? (Number(pct[1]) / 100) * C : 0) + (fixed ? Number(fixed[1]) : 0)
  }
  const n = 14
  const book = sliderMargins('book', n, tw)
  const L = px(book.marginLeft), R = px(book.marginRight), T = px(book.width)
  expect(L + R + T).toBeCloseTo(C, 6)
  for (let i = 0; i < n; i++) {
    const thumb = L + tw / 2 + (i / (n - 1)) * (T - tw)
    const line = ((i + 1) / n) * C
    expect(thumb).toBeCloseTo(line, 6)
  }
  const cal = sliderMargins('calendar', 0, tw)
  const Lc = px(cal.marginLeft), Tc = px(cal.width)
  for (const v of [0, 137, 500, 861, 1000]) {
    const thumb = Lc + tw / 2 + (v / 1000) * (Tc - tw)
    expect(thumb).toBeCloseTo((v / 1000) * C, 6)
  }
})
