// Book time: one cell per chapter in reading order. Dates are never
// consulted for ordering — flashbacks sit where the reader meets them.
import type { ReactNode } from 'react'
import type { Canon, Chapter, Era } from '../../canon'
import { dateOf, dk, eraSpanKeys } from '../../canon'
import { TYPE_COLORS } from '../../presentation'
import type { TimelineOverlay } from '../../selection-walks'
import { keepLabels } from './labels'
import { SLIDER_THUMB_PX, sliderMargins } from './scale'
import { ERA_TINT } from './tints'

/** Era containing a chapter's effective (end) date — for era bands in book time. */
function chapterEra(c: Chapter, eras: Era[]): Era | undefined {
  const d = dateOf(c.span.end) ?? dateOf(c.span.start)
  if (!d) return undefined
  const k = dk(d, true)
  return eras.find(e => {
    const [s, en] = eraSpanKeys(e)
    return k >= s && k <= en
  })
}

const spanText = (c: Chapter) => {
  const s = dateOf(c.span.start)
  const e = dateOf(c.span.end)
  return s && e ? `${s} → ${e}` : (s ?? e ?? '')
}

export function BookBand({ canon, chapters, chapterIx, onChapter, era, selected, onSelect, partTint, toggle, overlay }: {
  canon: Canon
  chapters: Chapter[]          // sorted by order
  chapterIx: number
  onChapter: (ix: number) => void
  era?: Era
  selected: string | null
  onSelect: (id: string) => void
  partTint: (c: Chapter) => string
  toggle: ReactNode
  overlay: TimelineOverlay | null
}) {
  const W = 1000
  const H = 62
  const n = chapters.length
  const cw = W / n
  const cur = chapters[Math.min(chapterIx, n - 1)]

  // Same declutter rule as the calendar band. Equal cells never overlap, so
  // this only drops labels when cells get too narrow to read at all.
  const chLabel = keepLabels(chapters.map((c, i) => (
    { x: i * cw + 1, w: cw - 2, chars: `${c.order}. ${c.title}`.length }
  )))

  // merge consecutive chapters sharing an era into one band
  const runs: { era: Era | undefined; from: number; to: number }[] = []
  chapters.forEach((c, i) => {
    const e = chapterEra(c, canon.timeline.eras)
    const last = runs.at(-1)
    if (last && last.era?.id === e?.id) last.to = i
    else runs.push({ era: e, from: i, to: i })
  })

  return (
    <div style={{ padding: '0 12px' }}>
      {toggle}
      <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" preserveAspectRatio="none" aria-hidden>
        {runs.map((r, i) => {
          const xs = r.from * cw
          const wRun = (r.to - r.from + 1) * cw
          const tintIx = r.era ? canon.timeline.eras.findIndex(e => e.id === r.era!.id) : i
          return (
            <g key={`${r.era?.id ?? 'none'}-${r.from}`}>
              <clipPath id={`bclip-era-${r.from}`}>
                <rect x={xs} y={10} width={wRun - 4} height={16} />
              </clipPath>
              <rect x={xs} y={10} width={wRun - 2} height={16} rx={3}
                fill={ERA_TINT[Math.max(tintIx, 0) % ERA_TINT.length]} opacity={0.14} />
              <text x={xs + 5} y={22} fontSize={10.5} fill="var(--text-secondary)"
                clipPath={`url(#bclip-era-${r.from})`}>
                {r.era?.name ?? ''}
              </text>
              {r.era && <title>{r.era.name}</title>}
            </g>
          )
        })}
        {chapters.map((c, i) => {
          const xs = i * cw
          const sel = selected === c.id
          const onCur = i === chapterIx
          return (
            <g key={c.id} style={{ cursor: 'pointer' }}
              onClick={() => { onChapter(i); onSelect(c.id) }}>
              <clipPath id={`bclip-${c.id}`}>
                <rect x={xs + 1} y={32} width={Math.max(cw - 4, 2)} height={18} />
              </clipPath>
              <rect x={xs + 1} y={32} width={cw - 2} height={18} rx={3}
                fill={partTint(c)} opacity={sel || onCur ? 0.5 : 0.22}
                stroke={sel ? 'var(--c1)' : 'var(--border)'} strokeWidth={sel ? 1.5 : 0.5} />
              {chLabel[i] && (
                <text x={xs + 5} y={45} fontSize={10} fill="var(--text-primary)"
                  clipPath={`url(#bclip-${c.id})`}>
                  {c.order}. {c.title}
                </text>
              )}
              <title>{c.order}. {c.title} ({spanText(c)})</title>
            </g>
          )
        })}
        {/* Selection overlay (A23-2): the entity's story on a track below the
            chapter row. Colour says what the selection is (TYPE_COLORS);
            solid = canon, dashed = proposed — status never takes the colour.
            Words in the titles, never a number. */}
        {overlay && (() => {
          const color = TYPE_COLORS[overlay.type] ?? 'var(--c7)'
          const ixOf = new Map(chapters.map((c, i) => [c.id, i]))
          const mid = (id: string) => (ixOf.get(id)! + 0.5) * cw
          const steps = overlay.steps
            .filter(s => s.chapter != null && ixOf.has(s.chapter))
            .sort((a, b) => ixOf.get(a.chapter!)! - ixOf.get(b.chapter!)!)
          // An object's changes ARE its provenance steps — drawing both would
          // say the same thing twice, and twice is noise.
          const changed = overlay.type === 'object' ? []
            : overlay.changed.filter(m => m.chapter != null && ixOf.has(m.chapter))
          // several changing events in one chapter fan out around its centre
          const perChapter = new Map<string, number>()
          changed.forEach(m => perChapter.set(m.chapter!, (perChapter.get(m.chapter!) ?? 0) + 1))
          const placedIx = new Map<string, number>()
          return (
            <g>
              {overlay.appears.map(id => {
                const i = ixOf.get(id)
                if (i == null) return null
                return (
                  <g key={`ap-${id}`}>
                    <rect x={i * cw + 1} y={53} width={cw - 2} height={4} rx={2}
                      fill={color} fillOpacity={overlay.proposed ? 0.25 : 0.8}
                      stroke={overlay.proposed ? color : 'none'} strokeWidth={overlay.proposed ? 1 : 0}
                      strokeDasharray={overlay.proposed ? '3 2' : undefined} />
                    <title>appears here</title>
                  </g>
                )
              })}
              {overlay.offPage.map(id => {
                const i = ixOf.get(id)
                if (i == null) return null
                return (
                  <g key={`off-${id}`}>
                    <line x1={i * cw + 3} x2={(i + 1) * cw - 3} y1={55} y2={55}
                      stroke={color} strokeWidth={1.2} strokeDasharray="1.5 4" opacity={0.45} />
                    <title>off the page here</title>
                  </g>
                )
              })}
              {steps.length > 1 && (
                <polyline points={steps.map(s => `${mid(s.chapter!)},55`).join(' ')}
                  fill="none" stroke={color} strokeWidth={1} opacity={0.5} />
              )}
              {steps.map((s, i) => (
                <g key={`st-${i}`}>
                  <circle cx={mid(s.chapter!)} cy={55} r={2.8}
                    fill={overlay.proposed ? 'var(--surface-1)' : color}
                    stroke={color} strokeWidth={1.2}
                    strokeDasharray={overlay.proposed ? '2 1.5' : undefined} />
                  <title>{s.label}</title>
                </g>
              ))}
              {changed.map(m => {
                const k = placedIx.get(m.chapter!) ?? 0
                placedIx.set(m.chapter!, k + 1)
                const x = mid(m.chapter!) + (k - (perChapter.get(m.chapter!)! - 1) / 2) * 7
                return (
                  <g key={`chg-${m.event}`}>
                    <path d={`M${x} 51 L${x + 3.2} 55 L${x} 59 L${x - 3.2} 55 Z`}
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
        <line x1={(chapterIx + 1) * cw} x2={(chapterIx + 1) * cw} y1={4} y2={H - 2}
          stroke="var(--c1)" strokeWidth={2.5} />
      </svg>
      {/* The thumb rides exactly under the svg cursor line — the margins are
          the aligned-geometry derivation in scale.ts, not a visual nudge. */}
      <input
        className="timeline-slider"
        style={{ ...sliderMargins('book', n, SLIDER_THUMB_PX) }}
        type="range"
        min={0}
        max={n - 1}
        step={1}
        value={chapterIx}
        onChange={e => onChapter(Number(e.target.value))}
        aria-label="chapter"
        aria-valuetext={`ch. ${cur.order} — ${cur.title}`}
      />
      <div className="timeline-footer">
        <span className="year">ch. {cur.order}</span>
        <a className="linklike" style={{ fontSize: 13 }} onClick={() => onSelect(cur.id)}>{cur.title}</a>
        <span className="eraname">{era?.name ?? '—'}</span>
        <span className="eraname" style={{ fontVariantNumeric: 'tabular-nums' }}>{spanText(cur)}</span>
        <span className="mood">{era?.mood}</span>
      </div>
    </div>
  )
}
