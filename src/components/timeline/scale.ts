// The density-weighted calendar scale — pure math, no React.
//
// Width means attention, not raw years: each era's share of the axis comes
// mostly from how much story lives in it (chapters + events), with a floor
// so quiet eras stay readable and a ⋯ cue where decades are condensed.
// Within an era, dates still map linearly — the scale compresses between
// eras, never reorders or distorts within one.
import type { Chapter, Era, EventDoc } from '../../canon'
import { dateOf, eraSpanKeys, timeRefKey, yearOf } from '../../canon'

interface EraSeg {
  e: Era
  span: [number, number]
  w: number
  x0: number
}

interface CalendarScale {
  segs: EraSeg[]
  /** Axis x for a (fractional) year. Gaps between eras snap forward. */
  x: (yr: number) => number
  /** Axis x for a possibly month-precision date string. */
  xd: (d: string, end?: boolean) => number
  /** Year for an axis x — the inverse of x(), so a control whose value is
   *  axis position (the slider) and the cursor line share one geometry. */
  invX: (px: number) => number
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

  const invX = (px: number): number => {
    const first = segs[0], last = segs.at(-1)
    if (!first || !last || px <= 0) return first?.span[0] ?? 0
    if (px >= last.x0 + last.w) return last.span[1]
    for (const s of segs) {
      if (px <= s.x0 + s.w) {
        return s.span[0] + ((px - s.x0) / Math.max(s.w, 0.01)) * (s.span[1] - s.span[0])
      }
    }
    return last.span[1]
  }

  const condensed = (s: EraSeg): boolean =>
    (s.w / Math.max(s.span[1] - s.span[0], 0.01)) < 0.55 * (W / totalYears)

  return { segs, x, xd, invX, condensed }
}

/** Slider margins that put the range thumb's CENTRE exactly under an svg
 *  cursor line, given both share the band's content width.
 *
 *  A range input moves its thumb across (track − thumb) pixels, so a bare
 *  100%-wide slider under a 100%-wide svg is misaligned everywhere except
 *  nowhere: the geometries only meet if the track is offset. Solved exactly:
 *  for a value v in [0,max] whose line sits at fraction f(v) of the width,
 *  margins (left: f(0)·100% − tw/2, right: (1 − f(max))·100% − tw/2) make the
 *  thumb centre track f linearly — which is the whole fix, so the derivation
 *  lives here rather than in a component's style prop.
 *
 *  Book time: the line marks the END of chapter i of n — f(i) = (i+1)/n —
 *  so left = 100%/n − tw/2 and right = −tw/2 (the thumb may overhang the
 *  last cell's edge by half its width; that is the correct place for it).
 *  Calendar time: the slider's value IS axis position — f(v) = v/W — so
 *  both margins are −tw/2.
 *
 *  The width is part of the same equation (a range input is a replaced
 *  element, so width:auto collapses to its intrinsic size): the track fills
 *  what the margins leave, width = 100% − left − right. */
export function sliderMargins(kind: 'book' | 'calendar', n: number, thumbPx: number): { marginLeft: string; marginRight: string; width: string } {
  const half = thumbPx / 2
  return kind === 'book'
    ? {
      marginLeft: `calc(${100 / n}% - ${half}px)`,
      marginRight: `${-half}px`,
      width: `calc(${(100 * (n - 1)) / n}% + ${thumbPx}px)`,
    }
    : {
      marginLeft: `${-half}px`,
      marginRight: `${-half}px`,
      width: `calc(100% + ${thumbPx}px)`,
    }
}

/** The thumb width theme.css declares for .timeline-slider — one shared
 *  constant so the margin maths and the CSS can never quietly disagree. */
export const SLIDER_THUMB_PX = 14
