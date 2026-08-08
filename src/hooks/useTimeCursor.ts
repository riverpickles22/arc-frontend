// The time cursor: one T, two scales. Book time is a chapter index in
// reading order; calendar time is a year. Either way T flows downstream as
// a date key — end of the chapter's span, or end of the selected year — so
// map, graph, and profiles never care which mode is active.
import { useMemo, useState } from 'react'
import type { Canon, Chapter, Era } from '../canon'
import { dateOf, dk, eraAt, yearOf } from '../canon'
import { openingYear } from '../presentation'
import type { TimeMode } from '../components/Timeline'

export interface TimeCursor {
  year: number
  timeMode: TimeMode
  chapterIx: number
  bookChapter?: Chapter
  tEnd: number
  era?: Era
  displayYear: number
  setYear: (y: number) => void
  setChapterIx: (ix: number) => void
  setTimeMode: (m: TimeMode) => void
  switchMode: (m: TimeMode) => void
  /** Move the world's projection to a chapter — selection clarity: selecting
   *  a chapter converges "what I selected" and "where I am". */
  goToChapter: (chapterId: string) => void
  /** Move the world's projection to an arbitrary date key (e.g. an event's
   *  moment), in whichever scale is active. */
  goToKey: (k: number) => void
}

export function useTimeCursor(canon: Canon, chapters: Chapter[], range: [number, number]): TimeCursor {
  // null = not yet touched by the user — the opening year derives instead
  // of being set by an effect.
  const [yearState, setYear] = useState<number | null>(null)
  const [timeMode, setTimeMode] = useState<TimeMode>('book')   // reading order is the default lens
  const [chapterIx, setChapterIx] = useState(0)

  const year = yearState ?? openingYear(canon, range[0])

  const derived = useMemo(() => {
    const bookChapter = timeMode === 'book' && chapters.length
      ? chapters[Math.min(chapterIx, chapters.length - 1)] : undefined
    const chapterEnd = bookChapter ? dateOf(bookChapter.span.end) ?? dateOf(bookChapter.span.start) : undefined
    const tEnd = chapterEnd ? dk(chapterEnd, true) : dk(String(year), true)
    return {
      bookChapter,
      tEnd,
      era: eraAt(tEnd, canon.timeline.eras),
      displayYear: Math.floor(tEnd / 10000),
    }
  }, [canon, chapters, timeMode, chapterIx, year])

  // Keep the two scales in sync when switching, so T doesn't jump.
  const switchMode = (m: TimeMode) => {
    if (m === timeMode) return
    if (m === 'book' && chapters.length) {
      const inSpan = chapters.findIndex(c => {
        const s = dateOf(c.span.start), e = dateOf(c.span.end)
        return s && e && yearOf(s) <= year && year <= yearOf(e)
      })
      const before = chapters.reduce((best, c, i) => {
        const s = dateOf(c.span.start)
        return s && yearOf(s) <= year ? i : best
      }, 0)
      setChapterIx(inSpan >= 0 ? inSpan : before)
    }
    if (m === 'calendar') setYear(derived.displayYear)
    setTimeMode(m)
  }

  const goToChapter = (chapterId: string) => {
    const ix = chapters.findIndex(c => c.id === chapterId)
    if (ix < 0) return
    if (timeMode === 'book') {
      setChapterIx(ix)
    } else {
      const s = dateOf(chapters[ix].span.start)
      if (s) setYear(yearOf(s))
    }
  }

  const goToKey = (k: number) => {
    if (timeMode === 'calendar') {
      setYear(Math.floor(k / 10000))
      return
    }
    // book mode: the chapter whose span contains k, else the nearest before
    const inSpan = chapters.findIndex(c => {
      const s = dateOf(c.span.start), e = dateOf(c.span.end)
      return s && e && dk(s) <= k && k <= dk(e, true)
    })
    if (inSpan >= 0) { setChapterIx(inSpan); return }
    const before = chapters.reduce((best, c, i) => {
      const s = dateOf(c.span.start)
      return s && dk(s) <= k ? i : best
    }, 0)
    setChapterIx(before)
  }

  return { year, timeMode, chapterIx, ...derived, setYear, setChapterIx, setTimeMode, switchMode, goToChapter, goToKey }
}
