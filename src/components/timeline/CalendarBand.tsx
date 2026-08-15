// Calendar time: the density-weighted era axis (scale.ts), memoized so
// slider ticks re-render without recomputing the layout.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Canon, Chapter, Era, TimeRef } from '../../canon'
import { dateOf, timeRefKey, yearOf } from '../../canon'
import { TYPE_COLORS } from '../../presentation'
import type { TimelineOverlay } from '../../selection-walks'
import { calendarScale, SLIDER_THUMB_PX, sliderMargins } from './scale'
import { keepLabels } from './labels'
import { ERA_TINT } from './tints'

export function CalendarBand({ canon, chapters, year, range, onYear, era, selected, onSelect, partTint, toggle, overlay }: {
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
  overlay: TimelineOverlay | null
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
        {/* Selection overlay (A23-2): same vocabulary as the book band —
            colour says entity type, solid = canon / dashed = proposed, words
            not numbers — but positioned on the date axis: events and
            provenance steps sit at their own moments, not chapter centres. */}
        {hasChapters && overlay && (() => {
          const color = TYPE_COLORS[overlay.type] ?? 'var(--c7)'
          const box = new Map<string, { xs: number; xe: number }>()
          chapters.forEach((c, i) => { const d = drawn[i]; if (d) box.set(c.id, d) })
          const atX = (t: TimeRef): number | null => {
            const k = timeRefKey(t, eras)
            if (!Number.isFinite(k) || k >= 99999999) return null
            const yy = Math.floor(k / 10000)
            const mm = Math.floor((k % 10000) / 100)
            return x(yy + (mm ? (mm - 1) / 12 : 0))
          }
          const evX = (eid: string): number | null => {
            const ev = canon.events[eid]
            return ev ? atX(ev.when) : null
          }
          const steps = overlay.steps
            .map(s => ({ s, sx: atX(s.at) }))
            .filter((p): p is { s: typeof p.s; sx: number } => p.sx != null)
            .sort((a, b) => a.sx - b.sx)
          return (
            <g>
              {overlay.lifespan && (() => {
                const sx = overlay.lifespan.start ? xd(overlay.lifespan.start) : 0
                const ex = overlay.lifespan.end ? xd(overlay.lifespan.end, true) : W
                return (
                  <g>
                    <line x1={sx} x2={ex} y1={60} y2={60} stroke={color} strokeWidth={1.2}
                      opacity={0.35} strokeDasharray={overlay.proposed ? '3 2' : undefined} />
                    <title>lifespan</title>
                  </g>
                )
              })()}
              {overlay.appears.map(id => {
                const d = box.get(id)
                if (!d) return null
                return (
                  <g key={`ap-${id}`}>
                    <rect x={d.xs + 1} y={53} width={Math.max(d.xe - d.xs - 2, 3)} height={4} rx={2}
                      fill={color} fillOpacity={overlay.proposed ? 0.25 : 0.8}
                      stroke={overlay.proposed ? color : 'none'} strokeWidth={overlay.proposed ? 1 : 0}
                      strokeDasharray={overlay.proposed ? '3 2' : undefined} />
                    <title>appears here</title>
                  </g>
                )
              })}
              {overlay.offPage.map(id => {
                const d = box.get(id)
                if (!d) return null
                return (
                  <g key={`off-${id}`}>
                    <line x1={d.xs + 2} x2={d.xe - 2} y1={55} y2={55}
                      stroke={color} strokeWidth={1.2} strokeDasharray="1.5 4" opacity={0.45} />
                    <title>off the page here</title>
                  </g>
                )
              })}
              {steps.length > 1 && (
                <polyline points={steps.map(p => `${p.sx},55`).join(' ')}
                  fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
              )}
              {steps.map((p, i) => (
                <g key={`st-${i}`}>
                  <circle cx={p.sx} cy={55} r={2.8}
                    fill={overlay.proposed ? 'var(--surface-1)' : color}
                    stroke={color} strokeWidth={1.2}
                    strokeDasharray={overlay.proposed ? '2 1.5' : undefined} />
                  <title>{p.s.label}</title>
                </g>
              ))}
              {/* An object's changes ARE its provenance steps — drawing both
                  would say the same thing twice, and twice is noise. */}
              {(overlay.type === 'object' ? [] : overlay.changed).map(m => {
                const mx = evX(m.event) ?? (m.chapter != null && box.has(m.chapter)
                  ? (box.get(m.chapter)!.xs + box.get(m.chapter)!.xe) / 2 : null)
                if (mx == null) return null
                return (
                  <g key={`chg-${m.event}`}>
                    <path d={`M${mx} 51 L${mx + 3.2} 55 L${mx} 59 L${mx - 3.2} 55 Z`}
                      fill={overlay.proposed ? 'var(--surface-1)' : color}
                      stroke={overlay.proposed ? color : 'var(--surface-1)'} strokeWidth={1}
                      strokeDasharray={overlay.proposed ? '2 1.5' : undefined} />
                    <title>{canon.events[m.event]?.title ?? m.event}</title>
                  </g>
                )
              })}
            </g>
          )
        })()}
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
