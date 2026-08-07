import type { Canon, Chapter, Era } from '../canon'
import { dateOf, dk, eraSpanKeys } from '../canon'

const ERA_TINT = ['var(--c1)', 'var(--c8)', 'var(--muted)', 'var(--c6)']
const PART_TINT = ['var(--c5)', 'var(--c4)', 'var(--c7)']

export type TimeMode = 'calendar' | 'book'

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

export function Timeline({
  canon, year, range, onYear, era, selected, onSelect,
  mode, chapters, chapterIx, onChapter, onMode,
}: {
  canon: Canon
  year: number
  range: [number, number]
  onYear: (y: number) => void
  era?: Era
  selected: string | null
  onSelect: (id: string) => void
  mode: TimeMode
  chapters: Chapter[]          // sorted by order
  chapterIx: number
  onChapter: (ix: number) => void
  onMode: (m: TimeMode) => void
}) {
  const [y0, y1] = range
  const W = 1000
  const hasChapters = chapters.length > 0
  const H = hasChapters ? 62 : 34
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

  if (mode === 'book' && hasChapters) {
    const n = chapters.length
    const cw = W / n
    const cur = chapters[Math.min(chapterIx, n - 1)]
    // merge consecutive chapters sharing an era into one band
    const runs: { era: Era | undefined; from: number; to: number }[] = []
    chapters.forEach((c, i) => {
      const e = chapterEra(c, canon.timeline.eras)
      const last = runs.at(-1)
      if (last && last.era?.id === e?.id) last.to = i
      else runs.push({ era: e, from: i, to: i })
    })
    const spanText = (c: Chapter) => {
      const s = dateOf(c.span.start)
      const e = dateOf(c.span.end)
      return s && e ? `${s} → ${e}` : (s ?? e ?? '')
    }
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
                <text x={xs + 5} y={45} fontSize={10} fill="var(--text-primary)"
                  clipPath={`url(#bclip-${c.id})`}>
                  {c.order}. {c.title}
                </text>
                <title>{c.order}. {c.title} ({spanText(c)})</title>
              </g>
            )
          })}
          <line x1={(chapterIx + 1) * cw} x2={(chapterIx + 1) * cw} y1={4} y2={H - 2}
            stroke="var(--c1)" strokeWidth={2.5} />
        </svg>
        <input
          className="timeline-slider"
          type="range"
          min={0}
          max={n - 1}
          step={1}
          value={chapterIx}
          onChange={e => onChapter(Number(e.target.value))}
          aria-label="chapter"
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

  // ---- calendar mode: density-weighted eras ----
  //
  // Width means attention, not raw years: each era's share of the axis comes
  // mostly from how much story lives in it (chapters + events), with a floor
  // so quiet eras stay readable and a ⋯ cue where decades are condensed.
  // Within an era, dates still map linearly — the scale compresses between
  // eras, never reorders or distorts within one.
  const eras = canon.timeline.eras
  const yearsOf = (e: Era): [number, number] => {
    const [s, en] = eraSpanKeys(e)
    return [s / 10000, Math.min(en, (y1 + 1) * 10000) / 10000]
  }
  const contentOf = (e: Era): number => {
    const [ys, ye] = yearsOf(e)
    const chs = chapters.filter(c => {
      const s = dateOf(c.span.start), en = dateOf(c.span.end)
      return s && en && Number(en.slice(0, 4)) >= ys && Number(s.slice(0, 4)) <= ye
    }).length
    const evs = Object.values(canon.events).filter(ev => {
      const yr = Math.floor(timeRefKeyOf(ev.when) / 10000)
      return yr >= ys && yr <= ye
    }).length
    return chs + evs
  }
  const timeRefKeyOf = (at: { era: string; date?: string }): number => {
    if (at.date) return dk(at.date)
    const e = eras.find(er => er.id === at.era)
    return e ? eraSpanKeys(e)[0] : 0
  }
  const totalYears = Math.max(y1 + 1 - y0, 1)
  const totalContent = Math.max(eras.reduce((a, e) => a + contentOf(e), 0), 1)
  const rawShares = eras.map(e => {
    const [ys, ye] = yearsOf(e)
    return Math.max(0.3 * ((ye - ys) / totalYears) + 0.7 * (contentOf(e) / totalContent), 0.06)
  })
  const shareSum = rawShares.reduce((a, b) => a + b, 0)
  const segs = eras.map((e, i) => ({ e, span: yearsOf(e), w: (rawShares[i] / shareSum) * W }))
    .sort((a, b) => a.span[0] - b.span[0])
  let acc = 0
  const segX = segs.map(s => { const at = acc; acc += s.w; return { ...s, x0: at } })
  /** Condensed = this era shows far fewer pixels per year than the page average. */
  const condensed = (s: typeof segX[number]) =>
    (s.w / Math.max(s.span[1] - s.span[0], 0.01)) < 0.55 * (W / totalYears)

  const x = (yr: number): number => {
    const first = segX[0], last = segX.at(-1)!
    if (!first || yr <= first.span[0]) return 0
    if (yr >= last.span[1]) return last.x0 + last.w
    for (const s of segX) {
      if (yr <= s.span[1]) {
        const clamped = Math.max(yr, s.span[0])   // gaps between eras snap forward
        return s.x0 + ((clamped - s.span[0]) / Math.max(s.span[1] - s.span[0], 0.01)) * s.w
      }
    }
    return W
  }
  // fractional-year position from a possibly month-precision date string
  const xd = (d: string, end = false) => {
    const [yy, mm] = d.split('-').map(Number)
    return x(yy + ((mm ?? (end ? 12 : 1)) - (end ? 0 : 1)) / 12)
  }

  const chapterOfYear = chapters.find(c => {
    const s = dateOf(c.span.start)
    const e = dateOf(c.span.end)
    return s && e && Number(s.slice(0, 4)) <= year && year <= Number(e.slice(0, 4))
  })

  return (
    <div style={{ padding: '0 12px' }}>
      {toggle}
      <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" preserveAspectRatio="none" aria-hidden>
        {segX.map(s => {
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
        {(canon.timeline.anchors ?? []).map(a => {
          const yr = Number(a.date.slice(0, 4))
          return (
            <g key={a.id}>
              <line x1={x(yr)} x2={x(yr)} y1={8} y2={hasChapters ? 54 : 28} stroke="var(--baseline)" strokeWidth={1} />
              <title>{a.label} ({a.date})</title>
            </g>
          )
        })}
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
              onClick={() => { onSelect(c.id); onYear(Number(s.slice(0, 4))) }}>
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
