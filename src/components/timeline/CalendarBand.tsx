// Calendar time: the density-weighted era axis (scale.ts), memoized so
// slider ticks re-render without recomputing the layout.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Canon, Chapter, Era } from '../../canon'
import { dateOf, yearOf } from '../../canon'
import { calendarScale } from './scale'
import { ERA_TINT } from './tints'

export function CalendarBand({ canon, chapters, year, range, onYear, era, selected, onSelect, partTint, toggle }: {
  canon: Canon
  chapters: Chapter[]          // sorted by order
  year: number
  range: [number, number]
  onYear: (y: number) => void
  era?: Era
  selected: string | null
  onSelect: (id: string) => void
  partTint: (c: Chapter) => string
  toggle: ReactNode
}) {
  const W = 1000
  const hasChapters = chapters.length > 0
  const H = hasChapters ? 62 : 34
  const [y0, y1] = range
  const eras = canon.timeline.eras

  const { segs, x, xd, condensed } = useMemo(
    () => calendarScale(eras, chapters, Object.values(canon.events), range, W),
    [eras, chapters, canon.events, range],
  )

  const chapterOfYear = chapters.find(c => {
    const s = dateOf(c.span.start)
    const e = dateOf(c.span.end)
    return s && e && yearOf(s) <= year && year <= yearOf(e)
  })

  return (
    <div style={{ padding: '0 12px' }}>
      {toggle}
      <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" preserveAspectRatio="none" aria-hidden>
        {segs.map(s => {
          const i = eras.findIndex(e => e.id === s.e.id)
          const years = Math.round(s.span[1] - s.span[0])
          const cond = condensed(s)
          return (
            <g key={s.e.id}>
              <clipPath id={`clip-${s.e.id}`}>
                <rect x={s.x0} y={10} width={s.w - 4} height={16} />
              </clipPath>
              <rect x={s.x0} y={10} width={s.w - 2} height={16} rx={3}
                fill={ERA_TINT[i % ERA_TINT.length]} opacity={0.14} />
              <text x={s.x0 + 5} y={22} fontSize={10.5} fill="var(--text-secondary)"
                clipPath={`url(#clip-${s.e.id})`}>
                {s.e.name}{cond ? ' ⋯' : ''}
              </text>
              <title>{s.e.name}{cond ? ` — condensed: ${years} years shown small (little happens on-page here)` : ''}</title>
            </g>
          )
        })}
        {(canon.timeline.anchors ?? []).map(a => (
          <g key={a.id}>
            <line x1={x(yearOf(a.date))} x2={x(yearOf(a.date))} y1={8} y2={hasChapters ? 54 : 28}
              stroke="var(--baseline)" strokeWidth={1} />
            <title>{a.label} ({a.date})</title>
          </g>
        ))}
        {/* chapters band */}
        {hasChapters && chapters.map(c => {
          const s = dateOf(c.span.start)
          const e = dateOf(c.span.end)
          if (!s || !e) return null
          const xs = xd(s)
          const xe = Math.max(xd(e, true), xs + 6)
          const sel = selected === c.id
          return (
            <g key={c.id} style={{ cursor: 'pointer' }}
              onClick={() => { onSelect(c.id); onYear(yearOf(s)) }}>
              <clipPath id={`clip-${c.id}`}>
                <rect x={xs + 1} y={32} width={Math.max(xe - xs - 4, 2)} height={18} />
              </clipPath>
              <rect x={xs + 1} y={32} width={xe - xs - 2} height={18} rx={3}
                fill={partTint(c)} opacity={sel ? 0.5 : 0.22}
                stroke={sel ? 'var(--c1)' : 'var(--border)'} strokeWidth={sel ? 1.5 : 0.5} />
              <text x={xs + 5} y={45} fontSize={10} fill="var(--text-primary)"
                clipPath={`url(#clip-${c.id})`}>
                {c.order}. {c.title}
              </text>
              <title>{c.order}. {c.title} ({s} → {e})</title>
            </g>
          )
        })}
        <line x1={x(year)} x2={x(year)} y1={4} y2={H - 2} stroke="var(--c1)" strokeWidth={2.5} />
      </svg>
      <input
        className="timeline-slider"
        type="range"
        min={y0}
        max={y1}
        step={1}
        value={year}
        onChange={e => onYear(Number(e.target.value))}
        aria-label="story year"
      />
      <div className="timeline-footer">
        <span className="year">{year}</span>
        <span className="eraname">{era?.name ?? '—'}</span>
        {chapterOfYear && (
          <a className="linklike" style={{ fontSize: 13 }} onClick={() => onSelect(chapterOfYear.id)}>
            {chapterOfYear.order}. {chapterOfYear.title}
          </a>
        )}
        <span className="mood">{era?.mood}</span>
      </div>
    </div>
  )
}
