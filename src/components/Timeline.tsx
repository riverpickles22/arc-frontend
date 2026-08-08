// The timeline: two scales over one story. Book time gives every chapter
// equal room in reading order; calendar time is the density-weighted era
// axis. This component owns only the mode toggle and dispatch — each band
// renders its own svg, slider, and footer.
import type { Canon, Chapter } from '../canon'
import type { TimeCursor } from '../hooks/useTimeCursor'
import { BookBand } from './timeline/BookBand'
import { CalendarBand } from './timeline/CalendarBand'
import { PART_TINT } from './timeline/tints'

export type TimeMode = 'calendar' | 'book'

export function Timeline({ canon, chapters, range, time, selected, onSelect }: {
  canon: Canon
  chapters: Chapter[]          // sorted by order
  range: [number, number]
  time: TimeCursor
  selected: string | null
  onSelect: (id: string) => void
}) {
  const { year, timeMode: mode, chapterIx, era, setYear: onYear, setChapterIx: onChapter, switchMode: onMode } = time
  const hasChapters = chapters.length > 0
  const parts = [...new Set(chapters.map(c => c.part ?? ''))]
  const partTint = (c: Chapter) => PART_TINT[Math.max(parts.indexOf(c.part ?? ''), 0) % PART_TINT.length]

  // The toggle renders only when book time is possible (chapters exist).
  const toggle = hasChapters && (
    <div className="tl-mode" role="group" aria-label="timeline scale">
      <button className={mode === 'calendar' ? 'sel' : ''} onClick={() => onMode('calendar')}
        title="1:1 with story time — gaps take the space their years take">Calendar</button>
      <button className={mode === 'book' ? 'sel' : ''} onClick={() => onMode('book')}
        title="One cell per chapter in reading order — flashbacks sit where the reader meets them">Book time</button>
    </div>
  )

  return mode === 'book' && hasChapters ? (
    <BookBand canon={canon} chapters={chapters} chapterIx={chapterIx} onChapter={onChapter}
      era={era} selected={selected} onSelect={onSelect} partTint={partTint} toggle={toggle} />
  ) : (
    <CalendarBand canon={canon} chapters={chapters} year={year} range={range} onYear={onYear}
      era={era} selected={selected} onSelect={onSelect} partTint={partTint} toggle={toggle} />
  )
}
