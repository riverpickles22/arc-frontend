import { useEffect, useMemo, useRef, useState } from 'react'
import type { Canon, Entity } from '../canon'
import { extantAt, resolveCoords, stateAt, timeRefKey } from '../canon'
import { CHAR_COLORS } from '../App'

interface Geo { features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[] }

const W = 1000
const MAIN = { lon0: -85.3, lon1: -73.8, lat0: 19.4, lat1: 23.8 }
const INSET = { lon0: -82.43, lon1: -82.3, lat0: 23.08, lat1: 23.175 }
const H = Math.round((W * (MAIN.lat1 - MAIN.lat0)) / ((MAIN.lon1 - MAIN.lon0) * Math.cos((21.6 * Math.PI) / 180)))
const INS = { x: 14, y: 14, w: 330, h: 240 }

type BBox = typeof MAIN
const proj = (b: BBox, w: number, h: number, ox = 0, oy = 0) =>
  (lon: number, lat: number): [number, number] => [
    ox + ((lon - b.lon0) / (b.lon1 - b.lon0)) * w,
    oy + ((b.lat1 - lat) / (b.lat1 - b.lat0)) * h,
  ]
const inBox = (b: BBox, lon: number, lat: number) =>
  lon >= b.lon0 && lon <= b.lon1 && lat >= b.lat0 && lat <= b.lat1

interface Tip { x: number; y: number; title: string; sub?: string }

export function MapView({
  canon, tEnd, selected, onSelect,
}: {
  canon: Canon
  tEnd: number
  selected: string | null
  onSelect: (id: string) => void
}) {
  const [geo, setGeo] = useState<Geo | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}cuba.geo.json`).then(r => r.json()).then(setGeo).catch(() => setGeo(null))
  }, [])

  const pMain = useMemo(() => proj(MAIN, W, H), [])
  const pIns = useMemo(() => proj(INSET, INS.w, INS.h, INS.x, INS.y), [])

  const coastPath = useMemo(() => {
    if (!geo) return ''
    const rings: number[][][] = []
    for (const f of geo.features) {
      const g = f.geometry
      if (g.type === 'Polygon') rings.push(...(g.coordinates as number[][][]))
      else for (const poly of g.coordinates as number[][][][]) rings.push(...poly)
    }
    return rings
      .map(r => 'M' + r.map(([lon, lat]) => pMain(lon, lat).map(v => v.toFixed(1)).join(',')).join('L') + 'Z')
      .join(' ')
  }, [geo, pMain])

  const places = useMemo(
    () => Object.values(canon.entities).filter(e => e.type === 'place' && e.coordinates),
    [canon],
  )

  // Characters positioned at T
  const chars = useMemo(() => {
    const out: { e: Entity; lon: number; lat: number; cond?: string; loc?: string }[] = []
    for (const e of Object.values(canon.entities)) {
      if (e.type !== 'character' || !extantAt(e, tEnd)) continue
      const s = stateAt(e, tEnd, canon.timeline.eras)
      const c = resolveCoords(s?.location, canon.entities)
      if (s && c) out.push({ e, lon: c.lon, lat: c.lat, cond: s.condition, loc: s.location })
    }
    return out
  }, [canon, tEnd])

  // Trail for the selected character
  const trail = useMemo(() => {
    const e = selected ? canon.entities[selected] : undefined
    if (!e || e.type !== 'character') return []
    return (e.states ?? [])
      .filter(s => timeRefKey(s.at, canon.timeline.eras) <= tEnd)
      .map(s => resolveCoords(s.location, canon.entities))
      .filter((c): c is { lat: number; lon: number } => !!c)
  }, [canon, selected, tEnd])

  const showTip = (ev: React.MouseEvent, title: string, sub?: string) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    setTip({ x: ev.clientX - r.left + 12, y: ev.clientY - r.top + 12, title, sub })
  }

  const markers = (box: BBox, project: (lon: number, lat: number) => [number, number], scale = 1) => {
    const inside = chars.filter(c => inBox(box, c.lon, c.lat))
    // fan out markers sharing a location
    const groups = new Map<string, typeof inside>()
    for (const c of inside) {
      const k = `${c.lon.toFixed(3)},${c.lat.toFixed(3)}`
      groups.set(k, [...(groups.get(k) ?? []), c])
    }
    return [...groups.values()].flatMap(group =>
      group.map((c, i) => {
        const [x, y] = project(c.lon, c.lat)
        const a = (i / Math.max(group.length, 1)) * Math.PI * 2 - Math.PI / 2
        const off = group.length > 1 ? 13 * scale : 0
        const mx = x + Math.cos(a) * off
        const my = y + Math.sin(a) * off
        const sel = selected === c.e.id
        // label radiates outward from the fan so labels don't collide
        const labelLeft = group.length > 1 && Math.cos(a) < -0.3
        const lx = mx + (labelLeft ? -10 : 10) * scale
        return (
          <g
            key={c.e.id + box.lon0}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(c.e.id)}
            onMouseMove={ev => showTip(ev, c.e.name, c.cond)}
            onMouseLeave={() => setTip(null)}
          >
            <circle cx={mx} cy={my} r={(sel ? 8 : 6.5) * scale} fill={CHAR_COLORS[c.e.id] ?? 'var(--c7)'}
              stroke="var(--surface-1)" strokeWidth={2} />
            <text x={lx} y={my + 4} fontSize={11.5 * scale} textAnchor={labelLeft ? 'end' : 'start'}
              fill="var(--text-primary)" fontWeight={sel ? 650 : 400}>
              {c.e.name}
            </text>
          </g>
        )
      }),
    )
  }

  const placeDots = (box: BBox, project: (lon: number, lat: number) => [number, number], opts?: { kinds?: Set<string>; labelBelow?: boolean }) =>
    places
      .filter(p => inBox(box, p.coordinates!.lon, p.coordinates!.lat))
      .filter(p => !opts?.kinds || opts.kinds.has(p.kind ?? ''))
      .map(p => {
        const [x, y] = project(p.coordinates!.lon, p.coordinates!.lat)
        return (
          <g key={p.id + box.lon0} style={{ cursor: 'pointer' }} onClick={() => onSelect(p.id)}
            onMouseMove={ev => showTip(ev, p.name, p.summary.slice(0, 90) + '…')}
            onMouseLeave={() => setTip(null)}>
            <circle cx={x} cy={y} r={3} fill="var(--muted)" />
            <text x={opts?.labelBelow ? x : x + 6} y={opts?.labelBelow ? y + 14 : y - 4}
              fontSize={10} textAnchor={opts?.labelBelow ? 'middle' : 'start'}
              fill="var(--muted)">{p.name}</text>
          </g>
        )
      })

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minHeight: 0, padding: '0 12px 4px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} fill="var(--water)" rx={8} />
        {coastPath && <path d={coastPath} fill="var(--land)" stroke="var(--baseline)" strokeWidth={1} />}

        {/* trail of selected character */}
        {trail.length > 1 && (
          <polyline
            points={trail.map(c => pMain(c.lon, c.lat).join(',')).join(' ')}
            fill="none" stroke={selected ? CHAR_COLORS[selected] ?? 'var(--c7)' : 'var(--muted)'}
            strokeWidth={2} strokeDasharray="6 5" opacity={0.75}
          />
        )}

        {placeDots(MAIN, pMain, { kinds: new Set(['city']) })}
        {markers({ ...MAIN, lon1: INSET.lon0 } as BBox, pMain) /* chars outside Havana box */}
        {markers({ lon0: INSET.lon1, lon1: MAIN.lon1, lat0: MAIN.lat0, lat1: MAIN.lat1 } as BBox, pMain)}

        {/* Havana inset */}
        <g>
          <rect x={INS.x} y={INS.y} width={INS.w} height={INS.h} rx={8}
            fill="var(--land)" stroke="var(--baseline)" strokeWidth={1} />
          <text x={INS.x + 10} y={INS.y + 18} fontSize={11} fontWeight={650} fill="var(--muted)">
            HAVANA (inset)
          </text>
          {placeDots(INSET, pIns, { labelBelow: true })}
          {markers(INSET, pIns)}
        </g>
      </svg>
      {tip && (
        <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
          <div className="t-title">{tip.title}</div>
          {tip.sub && <div className="t-sub">{tip.sub}</div>}
        </div>
      )}
      <div className="legend">
        {Object.entries(CHAR_COLORS).map(([id, color]) => (
          <span key={id} className="item">
            <span className="swatch" style={{ background: color }} />
            {canon.entities[id]?.name ?? id}
          </span>
        ))}
        <span className="item"><span className="swatch" style={{ background: 'var(--muted)' }} />place</span>
      </div>
    </div>
  )
}
