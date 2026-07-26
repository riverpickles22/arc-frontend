import { useEffect, useMemo, useRef, useState } from 'react'
import type { BBox, Canon, Entity, GeoJSON, View } from '../canon'
import { extantAt, fitBBox, geoCoords, loadBasemap, resolveCoords, stateAt, timeRefKey } from '../canon'

const W = 1000
const INS = { x: 14, y: 14, w: 330, h: 240 }
const FALLBACK: BBox = { lon0: -180, lon1: 180, lat0: -60, lat1: 75 }

const proj = (b: BBox, w: number, h: number, ox = 0, oy = 0) =>
  (lon: number, lat: number): [number, number] => [
    ox + ((lon - b.lon0) / (b.lon1 - b.lon0)) * w,
    oy + ((b.lat1 - lat) / (b.lat1 - b.lat0)) * h,
  ]
const inBox = (b: BBox, lon: number, lat: number) =>
  lon >= b.lon0 && lon <= b.lon1 && lat >= b.lat0 && lat <= b.lat1

/** Height that keeps degrees square at the bbox's own latitude. */
const heightFor = (b: BBox) => {
  const midLat = ((b.lat0 + b.lat1) / 2) * (Math.PI / 180)
  return Math.round((W * (b.lat1 - b.lat0)) / ((b.lon1 - b.lon0) * Math.cos(midLat)))
}

interface Tip { x: number; y: number; title: string; sub?: string }

export function MapView({
  canon, view, colors, tEnd, selected, onSelect,
}: {
  canon: Canon
  view: View
  colors: Record<string, string>
  tEnd: number
  selected: string | null
  onSelect: (id: string) => void
}) {
  const [geo, setGeo] = useState<GeoJSON | null>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const basemap = view.map?.basemap
  useEffect(() => {
    let live = true
    loadBasemap(basemap).then(g => { if (live) setGeo(g) })
    return () => { live = false }
  }, [basemap])

  const inset = view.map?.inset

  // The map covers whatever is being drawn — the coastline plus every located
  // place. Fitting to places alone would crop a basemap that extends past them.
  const MAIN = useMemo(
    () => fitBBox(canon.entities, geoCoords(geo)) ?? FALLBACK,
    [canon.entities, geo],
  )
  const H = useMemo(() => heightFor(MAIN), [MAIN])

  const pMain = useMemo(() => proj(MAIN, W, H), [MAIN, H])
  const pIns = useMemo(() => (inset ? proj(inset, INS.w, INS.h, INS.x, INS.y) : null), [inset])

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

  // `exclude` keeps characters drawn in the inset from also appearing on the
  // main map. Excluding by bbox rather than by longitude matters: carving the
  // main map into left/right strips drops anyone at the inset's longitude but
  // outside its latitude — they appear on neither map.
  const markers = (
    box: BBox,
    project: (lon: number, lat: number) => [number, number],
    scale = 1,
    exclude?: BBox,
  ) => {
    const inside = chars.filter(
      c => inBox(box, c.lon, c.lat) && !(exclude && inBox(exclude, c.lon, c.lat)),
    )
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
            <circle cx={mx} cy={my} r={(sel ? 8 : 6.5) * scale} fill={colors[c.e.id] ?? 'var(--c7)'}
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
            fill="none" stroke={selected ? colors[selected] ?? 'var(--c7)' : 'var(--muted)'}
            strokeWidth={2} strokeDasharray="6 5" opacity={0.75}
          />
        )}

        {/* With no inset declared, every place and character draws on the main
            map; with one, its contents are drawn there instead. */}
        {placeDots(MAIN, pMain, inset ? { kinds: new Set(['city']) } : undefined)}
        {markers(MAIN, pMain, 1, inset)}

        {inset && pIns && (
          <g>
            <rect x={INS.x} y={INS.y} width={INS.w} height={INS.h} rx={8}
              fill="var(--land)" stroke="var(--baseline)" strokeWidth={1} />
            <text x={INS.x + 10} y={INS.y + 18} fontSize={11} fontWeight={650} fill="var(--muted)">
              {inset.label.toUpperCase()} (inset)
            </text>
            {placeDots(inset, pIns, { labelBelow: true })}
            {markers(inset, pIns)}
          </g>
        )}
      </svg>
      {tip && (
        <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
          <div className="t-title">{tip.title}</div>
          {tip.sub && <div className="t-sub">{tip.sub}</div>}
        </div>
      )}
      <div className="legend">
        {Object.entries(colors).map(([id, color]) => (
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
