import type { Canon, Chapter } from '../canon'
import { timeRefKey } from '../canon'
import type { TimeMode } from './Timeline'

export function EventStrip({
  canon, year, selected, onSelect, mode, chapter,
}: {
  canon: Canon
  year: number
  selected: string | null
  onSelect: (id: string) => void
  mode: TimeMode
  chapter?: Chapter
}) {
  // Book time: the chapter's own events, in the order the chapter lists them.
  // Calendar: everything dated in the selected year.
  const events = mode === 'book' && chapter
    ? (chapter.events ?? []).map(id => canon.events[id]).filter(Boolean)
    : Object.values(canon.events)
        .filter(e => Math.floor(timeRefKey(e.when, canon.timeline.eras) / 10000) === year)
        .sort((a, b) => timeRefKey(a.when, canon.timeline.eras) - timeRefKey(b.when, canon.timeline.eras))

  const emptyLabel = mode === 'book' && chapter
    ? `no events in ch. ${chapter.order}` : `no events dated ${year}`

  return (
    <div className="eventstrip">
      {events.length === 0 && <span className="eventchip none">{emptyLabel}</span>}
      {events.map(e => (
        <button
          key={e.id}
          className={`eventchip${selected === e.id ? ' sel' : ''}`}
          onClick={() => onSelect(e.id)}
          title={e.summary}
        >
          <span
            className="dot"
            style={{ background: e.scope === 'story' ? 'var(--c1)' : 'var(--muted)' }}
          />
          {e.title}
        </button>
      ))}
    </div>
  )
}
