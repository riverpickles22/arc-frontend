import { useEffect, useMemo, useRef, useState } from 'react'
import type { Canon, Entity } from '../canon'
import { extantAt, nameOf, stateAt, timeRefKey } from '../canon'
import type { BBox, GeoJSON } from '../map-geometry'
import { bestCorner, fitBBox, geoCoords, resolveCoords } from '../map-geometry'
import { loadBasemap } from '../api'
import type { View } from '../presentation'
import { Legend, TipOverlay, useTip } from './overlays'

const W = 1000
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

export function MapView({
  canon, view, colors, tEnd, selected, onSelect, onClear, touching, onOpenRun,
}: {
  canon: Canon
  view: View
  colors: Record<string, string>
  tEnd: number
  selected: string | null
  onSelect: (id: string) => void
  /** Empty-canvas click: the selection clears everywhere, not just here. */
  onClear?: () => void
  /** id → the run holding write or propose over it. Same register as the
   *  graph: a place a run merely read is never marked. */
  touching?: Map<string, string>
  onOpenRun?: (runId: string) => void
}) {
  const [geo, setGeo] = useState<GeoJSON | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const { tip, showTip, hideTip } = useTip(wrapRef)

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

  const places = useMemo(
    () => Object.values(canon.entities).filter(e => e.type === 'place' && e.coordinates),
    [canon],
  )

  // The inset panel: sized to its bbox's aspect (capped so it never dominates
  // the frame), placed in the corner covering the least of what is drawn —
  // coastline and place markers — and never on top of its own source area.
  const INS = useMemo(() => {
    if (!inset) return null
    const cos = Math.cos((((inset.lat0 + inset.lat1) / 2) * Math.PI) / 180) || 1
    const aspect = (inset.lat1 - inset.lat0) / ((inset.lon1 - inset.lon0) * cos)
    const w = Math.round(Math.max(160, Math.min(330, 0.38 * W, (0.55 * H) / aspect)))
    const h = Math.round(w * aspect)
    const pts: [number, number][] = [
      ...geoCoords(geo).map(([lon, lat]) => pMain(lon, lat)),
      ...places.map(p => pMain(p.coordinates!.lon, p.coordinates!.lat)),
    ]
    const [sx0, sy0] = pMain(inset.lon0, inset.lat1)
    const [sx1, sy1] = pMain(inset.lon1, inset.lat0)
    const src = { x0: sx0, y0: sy0, x1: sx1, y1: sy1 }
    const { x, y } = bestCorner({ W, H }, { w, h }, pts, { x: (sx0 + sx1) / 2, y: (sy0 + sy1) / 2 })
    return { x, y, w, h, src }
  }, [inset, geo, places, pMain, H])

  const pIns = useMemo(() => (inset && INS ? proj(inset, INS.w, INS.h, INS.x, INS.y) : null), [inset, INS])

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
            onClick={ev => { ev.stopPropagation(); onSelect(c.e.id) }}
            onMouseMove={ev => showTip(ev, c.e.name, c.cond)}
            onMouseLeave={hideTip}
          >
            {/* Proposed places read as pending in the same register the graph
                uses — dashed, and lighter. Position is unaffected: this is
                decoration over a marker the projection already placed. */}
            {c.e.status === 'proposed' && (
              <circle cx={mx} cy={my} r={(sel ? 11 : 9.5) * scale} fill="none"
                stroke="var(--c6)" strokeWidth={1.5} strokeDasharray="3 3" opacity={0.9} />
            )}
            <circle cx={mx} cy={my} r={(sel ? 8 : 6.5) * scale} fill={colors[c.e.id] ?? 'var(--c7)'}
              opacity={c.e.status === 'proposed' ? 0.45 : 1}
              stroke="var(--surface-1)" strokeWidth={2} />
            {touching?.get(c.e.id) && (
              <circle cx={mx + 7 * scale} cy={my - 7 * scale} r={3.5 * scale}
                fill="var(--c1)" stroke="var(--surface-1)" strokeWidth={1.5}
                onClick={ev => { ev.stopPropagation(); onOpenRun?.(touching.get(c.e.id)!) }}
                onMouseMove={ev => showTip(ev, touching.get(c.e.id)!, 'a run is working on this — click to see it')}
                onMouseLeave={hideTip} />
            )}
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
        const sel = selected === p.id
        return (
          <g key={p.id + box.lon0} style={{ cursor: 'pointer' }}
            onClick={ev => { ev.stopPropagation(); onSelect(p.id) }}
            onMouseMove={ev => showTip(ev, p.name, p.summary.slice(0, 90) + '…')}
            onMouseLeave={hideTip}>
            {/* A selected place answers on the map the way a selected
                character does — the same ring the graph draws. */}
            {sel && <circle cx={x} cy={y} r={8} fill="none" stroke="var(--c1)" strokeWidth={2} />}
            {/* Proposed places read as pending in the same register the graph
                uses — dashed, and lighter. Decoration over a marker the
                projection already placed, so nothing moves when it ratifies. */}
            {p.status === 'proposed' && (
              <circle cx={x} cy={y} r={6} fill="none"
                stroke="var(--c6)" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.9} />
            )}
            <circle cx={x} cy={y} r={3} fill="var(--muted)" opacity={p.status === 'proposed' ? 0.5 : 1} />
            {touching?.get(p.id) && (
              <circle cx={x + 5} cy={y - 5} r={2.5} fill="var(--c1)"
                stroke="var(--surface-1)" strokeWidth={1}
                onClick={ev => { ev.stopPropagation(); onOpenRun?.(touching.get(p.id)!) }} />
            )}
            <text x={opts?.labelBelow ? x : x + 6} y={opts?.labelBelow ? y + 14 : y - 4}
              fontSize={10} textAnchor={opts?.labelBelow ? 'middle' : 'start'}
              fontWeight={sel ? 650 : 400}
              fill={sel ? 'var(--text-primary)' : 'var(--muted)'}>{p.name}</text>
          </g>
        )
      })

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minHeight: 0, padding: '0 12px 4px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }}
        onClick={() => onClear?.()}>
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

        {inset && INS && pIns && (() => {
          // the excerpted area, outlined on the main map, linked to the panel
          const { src } = INS
          const scx = (src.x0 + src.x1) / 2
          const scy = (src.y0 + src.y1) / 2
          const lx = Math.max(INS.x, Math.min(scx, INS.x + INS.w))
          const ly = Math.max(INS.y, Math.min(scy, INS.y + INS.h))
          return (
            <g>
              <rect x={src.x0} y={src.y0} width={src.x1 - src.x0} height={src.y1 - src.y0}
                fill="none" stroke="var(--c1)" strokeWidth={1.2} strokeDasharray="3 3" opacity={0.8} />
              <line x1={scx} y1={scy} x2={lx} y2={ly}
                stroke="var(--c1)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
              <rect x={INS.x} y={INS.y} width={INS.w} height={INS.h} rx={8}
                fill="var(--land)" stroke="var(--c1)" strokeWidth={1} />
              <text x={INS.x + 10} y={INS.y + 18} fontSize={11} fontWeight={650} fill="var(--muted)">
                {inset.label.toUpperCase()} (inset)
              </text>
              {placeDots(inset, pIns, { labelBelow: true })}
              {markers(inset, pIns)}
            </g>
          )
        })()}
      </svg>
      <TipOverlay tip={tip} />
      <Legend items={[
        ...Object.entries(colors).map(([id, color]) => ({ label: nameOf(canon, id), color })),
        { label: 'place', color: 'var(--muted)' },
      ]} />
    </div>
  )
}
