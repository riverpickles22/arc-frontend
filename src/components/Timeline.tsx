import type { Canon, Era } from '../canon'
import { dateOf, eraSpanKeys } from '../canon'

const ERA_TINT = ['var(--c1)', 'var(--c8)', 'var(--muted)', 'var(--c6)']
const PART_TINT = ['var(--c5)', 'var(--c4)', 'var(--c7)']

export function Timeline({
  canon, year, range, onYear, era, selected, onSelect,
}: {
  canon: Canon
  year: number
  range: [number, number]
  onYear: (y: number) => void
  era?: Era
  selected: string | null
  onSelect: (id: string) => void
}) {
  const [y0, y1] = range
  const W = 1000
  const chapters = canon.chapters ?? []
  const hasChapters = chapters.length > 0
  const H = hasChapters ? 62 : 34
  const x = (yr: number) => ((yr - y0) / (y1 + 1 - y0)) * W
  // fractional-year position from a possibly month-precision date string
  const xd = (d: string, end = false) => {
    const [yy, mm] = d.split('-').map(Number)
    return x(yy + ((mm ?? (end ? 12 : 1)) - (end ? 0 : 1)) / 12)
  }
  const parts = [...new Set(chapters.map(c => c.part ?? ''))]

  const chapterOfYear = chapters.find(c => {
    const s = dateOf(c.span.start)
    const e = dateOf(c.span.end)
    return s && e && Number(s.slice(0, 4)) <= year && year <= Number(e.slice(0, 4))
  })

  return (
    <div style={{ padding: '0 12px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="timeline-svg" preserveAspectRatio="none" aria-hidden>
        {canon.timeline.eras.map((e, i) => {
          const [s, en] = eraSpanKeys(e)
          const xs = x(Math.floor(s / 10000))
          const xe = x(Math.floor(en / 10000) + 1)
          return (
            <g key={e.id}>
              <clipPath id={`clip-${e.id}`}>
                <rect x={xs} y={10} width={xe - xs - 4} height={16} />
              </clipPath>
              <rect x={xs} y={10} width={xe - xs - 2} height={16} rx={3}
                fill={ERA_TINT[i % ERA_TINT.length]} opacity={0.14} />
              <text x={xs + 5} y={22} fontSize={10.5} fill="var(--text-secondary)"
                clipPath={`url(#clip-${e.id})`}>
                {e.name}
              </text>
              <title>{e.name}</title>
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
          const tint = PART_TINT[Math.max(parts.indexOf(c.part ?? ''), 0) % PART_TINT.length]
          const sel = selected === c.id
          return (
            <g key={c.id} style={{ cursor: 'pointer' }}
              onClick={() => { onSelect(c.id); onYear(Number(s.slice(0, 4))) }}>
              <clipPath id={`clip-${c.id}`}>
                <rect x={xs + 1} y={32} width={Math.max(xe - xs - 4, 2)} height={18} />
              </clipPath>
              <rect x={xs + 1} y={32} width={xe - xs - 2} height={18} rx={3}
                fill={tint} opacity={sel ? 0.5 : 0.22}
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
