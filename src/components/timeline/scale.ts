// The density-weighted calendar scale — pure math, no React.
//
// Width means attention, not raw years: each era's share of the axis comes
// mostly from how much story lives in it (chapters + events), with a floor
// so quiet eras stay readable and a ⋯ cue where decades are condensed.
// Within an era, dates still map linearly — the scale compresses between
// eras, never reorders or distorts within one.
import type { Chapter, Era, EventDoc } from '../../canon'
import { dateOf, eraSpanKeys, timeRefKey, yearOf } from '../../canon'

export interface EraSeg {
  e: Era
  span: [number, number]
  w: number
  x0: number
}

export interface CalendarScale {
  segs: EraSeg[]
  /** Axis x for a (fractional) year. Gaps between eras snap forward. */
  x: (yr: number) => number
  /** Axis x for a possibly month-precision date string. */
  xd: (d: string, end?: boolean) => number
  /** Condensed = this era shows far fewer pixels per year than the page average. */
  condensed: (s: EraSeg) => boolean
}

export function calendarScale(
  eras: Era[],
  chapters: Chapter[],
  events: EventDoc[],
  range: [number, number],
  W: number,
): CalendarScale {
  const [y0, y1] = range
  const yearsOf = (e: Era): [number, number] => {
    const [s, en] = eraSpanKeys(e)
    return [s / 10000, Math.min(en, (y1 + 1) * 10000) / 10000]
  }
  const contentOf = (e: Era): number => {
    const [ys, ye] = yearsOf(e)
    const chs = chapters.filter(c => {
      const s = dateOf(c.span.start), en = dateOf(c.span.end)
      return s && en && yearOf(en) >= ys && yearOf(s) <= ye
    }).length
    const evs = events.filter(ev => {
      const yr = Math.floor(timeRefKey(ev.when, eras) / 10000)
      return yr >= ys && yr <= ye
    }).length
    return chs + evs
  }

  const totalYears = Math.max(y1 + 1 - y0, 1)
  const totalContent = Math.max(eras.reduce((a, e) => a + contentOf(e), 0), 1)
  const rawShares = eras.map(e => {
    const [ys, ye] = yearsOf(e)
    return Math.max(0.3 * ((ye - ys) / totalYears) + 0.7 * (contentOf(e) / totalContent), 0.06)
  })
  const shareSum = rawShares.reduce((a, b) => a + b, 0)
  let acc = 0
  const segs: EraSeg[] = eras
    .map((e, i) => ({ e, span: yearsOf(e), w: (rawShares[i] / shareSum) * W, x0: 0 }))
    .sort((a, b) => a.span[0] - b.span[0])
    .map(s => { const x0 = acc; acc += s.w; return { ...s, x0 } })

  const x = (yr: number): number => {
    const first = segs[0], last = segs.at(-1)
    if (!first || !last || yr <= first.span[0]) return 0
    if (yr >= last.span[1]) return last.x0 + last.w
    for (const s of segs) {
      if (yr <= s.span[1]) {
        const clamped = Math.max(yr, s.span[0])   // gaps between eras snap forward
        return s.x0 + ((clamped - s.span[0]) / Math.max(s.span[1] - s.span[0], 0.01)) * s.w
      }
    }
    return W
  }

  const xd = (d: string, end = false): number => {
    const [yy, mm] = d.split('-').map(Number)
    return x(yy + ((mm ?? (end ? 12 : 1)) - (end ? 0 : 1)) / 12)
  }

  const condensed = (s: EraSeg): boolean =>
    (s.w / Math.max(s.span[1] - s.span[0], 0.01)) < 0.55 * (W / totalYears)

  return { segs, x, xd, condensed }
}
