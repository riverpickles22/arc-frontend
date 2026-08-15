// Calendar time: the density-weighted era axis (scale.ts), memoized so
// slider ticks re-render without recomputing the layout.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Canon, Chapter, Era } from '../../canon'
import { dateOf, yearOf } from '../../canon'
import { calendarScale, SLIDER_THUMB_PX, sliderMargins } from './scale'
import { keepLabels } from './labels'
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
  const eras = canon.timeline.eras

  const { segs, x, xd, invX, condensed } = useMemo(
    () => calendarScale(eras, chapters, Object.values(canon.events), range, W),
    [eras, chapters, canon.events, range],
  )

  const chapterOfYear = chapters.find(c => {
    const s = dateOf(c.span.start)
    const e = dateOf(c.span.end)
    return s && e && yearOf(s) <= year && year <= yearOf(e)
  })

  // Declutter: chapter rects on the date axis can overlap (dense zones);
  // a skipped label keeps its tooltip. Eras only lose labels when their
  // segment is too narrow to read.
  const drawn = useMemo(() => chapters.map(c => {
    const s = dateOf(c.span.start)
    const e = dateOf(c.span.end)
    if (!s || !e) return null
    const xs = xd(s)
    return { xs, xe: Math.max(xd(e, true), xs + 6) }
  }), [chapters, xd])
  const chLabel = useMemo(() => {
    const boxes = drawn.map((d, i) => d
      ? { x: d.xs + 1, w: d.xe - d.xs - 2, chars: `${chapters[i].order}. ${chapters[i].title}`.length }
      : { x: 0, w: 0, chars: 0 })
    return keepLabels(boxes)
  }, [drawn, chapters])
  const eraLabel = useMemo(
    () => keepLabels(segs.map(s => ({ x: s.x0, w: s.w - 2, chars: s.e.name.length }))),
    [segs],
  )

  return (
    <div style={{ padding: '0 12px' }}>
      {toggle}
      <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" preserveAspectRatio="none" aria-hidden>
        {segs.map((s, si) => {
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
              {eraLabel[si] && (
                <text x={s.x0 + 5} y={22} fontSize={10.5} fill="var(--text-secondary)"
                  clipPath={`url(#clip-${s.e.id})`}>
                  {s.e.name}{cond ? ' ⋯' : ''}
                </text>
              )}
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
        {hasChapters && chapters.map((c, ci) => {
          const s = dateOf(c.span.start)
          const e = dateOf(c.span.end)
          const d = drawn[ci]
          if (!s || !e || !d) return null
          const { xs, xe } = d
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
              {chLabel[ci] && (
                <text x={xs + 5} y={45} fontSize={10} fill="var(--text-primary)"
                  clipPath={`url(#clip-${c.id})`}>
                  {c.order}. {c.title}
                </text>
              )}
              <title>{c.order}. {c.title} ({s} → {e})</title>
            </g>
          )
        })}
        <line x1={x(year)} x2={x(year)} y1={4} y2={H - 2} stroke="var(--c1)" strokeWidth={2.5} />
      </svg>
      {/* The slider's value is AXIS POSITION, not the year: the cursor line
          lives on the density-weighted scale, and a year-linear slider under
          it diverges by whole condensed eras mid-range. Sharing the scale
          (through its inverse) makes thumb and line one geometry; the year
          is still what assistive tech hears. */}
      <input
        className="timeline-slider"
        style={{ ...sliderMargins('calendar', 0, SLIDER_THUMB_PX) }}
        type="range"
        min={0}
        max={W}
        step={1}
        value={x(year)}
        onChange={e => onYear(Math.round(invX(Number(e.target.value))))}
        aria-label="story year"
        aria-valuetext={String(year)}
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
