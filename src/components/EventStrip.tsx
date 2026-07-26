import type { Canon } from '../canon'
import { timeRefKey } from '../canon'

export function EventStrip({
  canon, year, selected, onSelect,
}: {
  canon: Canon
  year: number
  selected: string | null
  onSelect: (id: string) => void
}) {
  const events = Object.values(canon.events)
    .filter(e => Math.floor(timeRefKey(e.when, canon.timeline.eras) / 10000) === year)
    .sort((a, b) => timeRefKey(a.when, canon.timeline.eras) - timeRefKey(b.when, canon.timeline.eras))

  return (
    <div className="eventstrip">
      {events.length === 0 && <span className="eventchip none">no events dated {year}</span>}
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
