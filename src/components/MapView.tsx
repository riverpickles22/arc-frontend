import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Canon, Entity } from '../canon'
import { extantAt, nameOf, stateAt, timeRefKey } from '../canon'
import type { BBox, GeoJSON } from '../map-geometry'
import { detailVisible, fitAspect, fitBBox, geoCoords, graticule, kindOf, panWindow, pickGraticuleStep, resolveCoords, scaleBar, svgPath, windowForInset, zoomWindow } from '../map-geometry'
import { loadBasemap } from '../api'
import { periodFor } from '../presentation'
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

  const inset = view.map?.inset

  // The map covers whatever is being drawn — the coastline plus every located
  // place. Fitting to places alone would crop a basemap that extends past them.
  const MAIN = useMemo(
    () => fitBBox(canon.entities, geoCoords(geo)) ?? FALLBACK,
    [canon.entities, geo],
  )

  // The PANEL decides the frame's shape, not the extent (A24-6): a wide
  // island in a tall panel used to letterbox. The window grows along its
  // shorter axis to fill whatever shape the panel has — more sea, no bars.
  const svgRef = useRef<SVGSVGElement>(null)
  const [pxAspect, setPxAspect] = useState(0.55)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(es => {
      const r = es[0]?.contentRect
      if (r && r.width > 0) setPxAspect(Math.min(Math.max(r.height / r.width, 0.25), 1.6))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = useMemo(() => Math.round(W * pxAspect), [pxAspect])

  // The full view, shaped to the frame. Degrees-per-pixel stays square: the
  // pixel aspect converts to a degree ratio at the extent's own latitude.
  const FULL = useMemo(() => {
    const cos = Math.cos((((MAIN.lat0 + MAIN.lat1) / 2) * Math.PI) / 180) || 1
    return fitAspect(MAIN, (H / W) * cos)
  }, [MAIN, H])

  // The geographic window: null = the full extent. Zoom shrinks it toward
  // the cursor, pan slides it, the inset sets it, Back restores null. One
  // mechanism, and everything below re-projects vector-crisp through it.
  // The window remembers which frame it was made for, so a new story,
  // basemap or panel shape derives back to the full view with no effect.
  // The remembered window, read once at mount (the lazy initializer is the
  // sanctioned render-time home for it); null = nothing stored, or the
  // author took over. State rather than a ref, so the pin effect below
  // re-fires honestly when it clears.
  const [pinnedWin, setPinnedWin] = useState<BBox | null>(() => {
    try {
      const raw = localStorage.getItem('arc.map.window')
      const b = raw ? JSON.parse(raw) as BBox : null
      return b && [b.lon0, b.lon1, b.lat0, b.lat1].every(Number.isFinite) && b.lon0 < b.lon1 && b.lat0 < b.lat1
        ? b : null
    } catch { return null }
  })
  const [winState, setWinState] = useState<{ for: BBox; box: BBox } | null>(null)
  // Falling back to the pinned box IS the restore: at mount (winState null)
  // and across every FULL rebuild until the author interacts, the derivation
  // lands on the remembered window with no effect and no cascade. The first
  // setWin clears the pin, and the stale-frame fallback returns to null —
  // the full view — exactly as this derivation always behaved.
  const win = winState && winState.for === FULL ? winState.box : pinnedWin

  /* The window survives leaving (A24-7): where the author stood — a city, or
   * the full chart — restores when they come back, per browser. The wrinkle
   * is the derivation above: `for` is compared by REFERENCE, and FULL is
   * rebuilt on every mount and every panel reshape, so a naively-restored
   * window dies the moment the aspect settles. The stored box is therefore
   * PINNED — re-applied on every FULL change — until the author interacts,
   * at which point the pin releases and live reshaping derives to full
   * exactly as designed. */

  const setWin = useCallback((b: BBox | null) => {
    setPinnedWin(null)                     // the author took over — stop pinning
    try {
      if (b) localStorage.setItem('arc.map.window', JSON.stringify(b))
      else localStorage.removeItem('arc.map.window')
    } catch { /* remembering is a nicety, never a failure */ }
    setWinState(b ? { for: FULL, box: b } : null)
  }, [FULL])
  const box = win ?? FULL

  const pMain = useMemo(() => proj(box, W, H), [box, H])

  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  /** Client px → geographic point, through the svg's live on-screen size. */
  const toGeo = useCallback((clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return { lon: (box.lon0 + box.lon1) / 2, lat: (box.lat0 + box.lat1) / 2 }
    const fx = (clientX - r.left) / r.width
    const fy = (clientY - r.top) / r.height
    return { lon: box.lon0 + fx * (box.lon1 - box.lon0), lat: box.lat1 - fy * (box.lat1 - box.lat0) }
  }, [box])

  // Wheel zoom, native and non-passive: React registers wheel passively, so
  // a synthetic handler could never preventDefault the page scroll away.
  // Registered ONCE and fed current geometry through a ref — re-registering
  // per window change dropped events mid-gesture, which read as stutter.
  const wheelGeom = useRef({ box, FULL, toGeo, setWin })
  useEffect(() => { wheelGeom.current = { box, FULL, toGeo, setWin } })
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const g = wheelGeom.current
      // Delta-proportional, exponential: a trackpad's stream of small deltas
      // and a wheel's single big notch zoom at the same speed for the same
      // physical gesture. Clamped so one violent notch cannot leap the range.
      const factor = Math.exp(Math.min(Math.max(e.deltaY, -80), 80) * 0.0035)
      const next = zoomWindow(g.box, g.FULL, factor, g.toGeo(e.clientX, e.clientY))
      const atFull = Math.abs(next.lon1 - next.lon0 - (g.FULL.lon1 - g.FULL.lon0)) < 1e-9
      // Compound against our own last result immediately: a fast gesture
      // delivers several events per frame, and waiting for React's render to
      // refresh the ref would collapse them all into one step.
      wheelGeom.current = { ...g, box: atFull ? g.FULL : next }
      g.setWin(atFull ? null : next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return   // a click, until it isn't
    d.moved = true
    d.x = e.clientX; d.y = e.clientY
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return
    // dragging the map right slides the window left — the map follows the hand
    setWin(panWindow(box, FULL,
      (-dx / r.width) * (box.lon1 - box.lon0),
      (dy / r.height) * (box.lat1 - box.lat0)))
  }
  const onPointerUp = () => { /* the click-capture below reads .moved first */ }
  /** A drag must not fire the click it ends on — selection and clear keep
   *  their meaning at every zoom level. Capture phase, so children never see it. */
  const onClickCapture = (e: React.MouseEvent) => {
    const moved = dragRef.current?.moved
    dragRef.current = null
    if (moved) { e.stopPropagation(); e.preventDefault() }
  }

  const places = useMemo(
    () => Object.values(canon.entities).filter(e => e.type === 'place' && e.coordinates),
    [canon],
  )

  // Chart furniture: the graticule and scale bar that make this read as a
  // chart of somewhere on Earth rather than a diagram (A24-1). Pure math in
  // map-geometry; this component only draws what it is handed.
  const grid = useMemo(() => graticule(box, pickGraticuleStep(box)), [box])
  const bar = useMemo(() => scaleBar(box, W), [box])
  const deg = (v: number, pos: string, neg: string) =>
    `${Math.abs(v) % 1 ? Math.abs(v).toFixed(1) : Math.abs(v)}°${v < 0 ? neg : pos}`

  // Which of the story's declared periods the cursor is inside (A24-2). The
  // face is a CSS class over the chart tokens; the cartouche names the moment.
  const year = Math.floor(tEnd / 10000)
  const period = periodFor(view.map?.periods, year)
  const periodBasemap = period?.basemap ?? view.map?.basemap


  const coastPath = useMemo(
    () => (geo ? svgPath(geo.features.filter(f => kindOf(f) === 'land'), pMain) : ''),
    [geo, pMain],
  )
  // City footprints at island scale — the first hint a dot is a city.
  const urbanPath = useMemo(
    () => (geo ? svgPath(geo.features.filter(f => kindOf(f) === 'urban'), pMain) : ''),
    [geo, pMain],
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

  /** The window a city opens to (A24-8): the view's declared window when the
   *  city sits inside it, else a derived ~20km box — both fitted to the
   *  frame's aspect the way the old inset door was. */
  const cityWindow = useCallback((p: Entity): BBox => {
    const c = p.coordinates!
    if (inset && c.lon >= inset.lon0 && c.lon <= inset.lon1 && c.lat >= inset.lat0 && c.lat <= inset.lat1)
      return windowForInset(inset, FULL)
    const dLat = 0.09
    const dLon = dLat / (Math.cos((c.lat * Math.PI) / 180) || 1)
    return windowForInset({ lon0: c.lon - dLon, lon1: c.lon + dLon, lat0: c.lat - dLat, lat1: c.lat + dLat }, FULL)
  }, [inset, FULL])

  /** At full view a CITY is a door — click it and the chart zooms to it;
   *  its interior appears once you are inside. Zoomed, every dot selects,
   *  the city included: the door became a place again. */
  const insideCityWindow = useCallback((p: Entity): boolean => {
    const c = p.coordinates!
    return !!inset && c.lon >= inset.lon0 && c.lon <= inset.lon1 && c.lat >= inset.lat0 && c.lat <= inset.lat1
  }, [inset])

  const placeDots = (box: BBox, project: (lon: number, lat: number) => [number, number], opts?: { kinds?: Set<string>; labelBelow?: boolean; islandScale?: boolean }) =>
    places
      .filter(p => inBox(box, p.coordinates!.lon, p.coordinates!.lat))
      .filter(p => !opts?.kinds || opts.kinds.has(p.kind ?? ''))
      .filter(p => !opts?.islandScale || p.kind === 'city' || !insideCityWindow(p))
      .map(p => {
        const [x, y] = project(p.coordinates!.lon, p.coordinates!.lat)
        const sel = selected === p.id
        const isDoor = !win && p.kind === 'city'
        return (
          <g key={p.id + box.lon0} style={{ cursor: isDoor ? 'zoom-in' : 'pointer' }}
            onClick={ev => { ev.stopPropagation(); if (isDoor) setWin(cityWindow(p)); else onSelect(p.id) }}
            onMouseMove={ev => showTip(ev, p.name, isDoor ? 'click to open the city' : p.summary.slice(0, 90) + '…')}
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
            <circle cx={x} cy={y} r={4.5} fill="none" stroke="var(--map-label)" strokeWidth={1}
              opacity={p.status === 'proposed' ? 0.5 : 0.9} />
            <circle cx={x} cy={y} r={1.8} fill="var(--text-secondary)" opacity={p.status === 'proposed' ? 0.5 : 1} />
            {touching?.get(p.id) && (
              <circle cx={x + 5} cy={y - 5} r={2.5} fill="var(--c1)"
                stroke="var(--surface-1)" strokeWidth={1}
                onClick={ev => { ev.stopPropagation(); onOpenRun?.(touching.get(p.id)!) }} />
            )}
            <text x={opts?.labelBelow ? x : x + 8} y={opts?.labelBelow ? y + 15 : y - 6}
              fontSize={9.5} textAnchor={opts?.labelBelow ? 'middle' : 'start'}
              fontWeight={sel ? 650 : 500}
              style={{ letterSpacing: '0.09em', textTransform: 'uppercase' }}
              fill={sel ? 'var(--text-primary)' : 'var(--map-label)'}>{p.name}</text>
          </g>
        )
      })

  useEffect(() => {
    let live = true
    loadBasemap(periodBasemap).then(g => { if (live) setGeo(g) })
    return () => { live = false }
  }, [periodBasemap])

  // The detail layer (A24-5): a finer asset for one declared area, drawn only
  // when the window is close enough that its streets mean something.
  const detail = view.map?.detail
  const [detailGeo, setDetailGeo] = useState<GeoJSON | null>(null)
  useEffect(() => {
    let live = true
    loadBasemap(detail?.asset).then(g => { if (live) setDetailGeo(g) })
    return () => { live = false }
  }, [detail?.asset])
  const detailOn = !!detail && !!detailGeo && detailVisible(box, detail)

  return (
    <div ref={wrapRef}
      className={period?.face ? `map-face-${period.face}` : undefined}
      style={{ position: 'relative', flex: 1, minHeight: 0, padding: '0 12px 4px' }}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', userSelect: 'none', cursor: win ? 'grab' : undefined }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onClickCapture={onClickCapture}
        onClick={() => onClear?.()}>
        <defs>
          {/* Open water darkens away from the story's centre; land lifts off
              it. Gradients and a shadow, never an image — the chart is drawn
              from the same geometry as before, just lit. */}
          <radialGradient id="arcWater" cx="50%" cy="42%" r="78%">
            <stop offset="0%" stopColor="var(--water)" />
            <stop offset="100%" stopColor="var(--water-deep)" />
          </radialGradient>
          <linearGradient id="arcLand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--land-high)" />
            <stop offset="100%" stopColor="var(--land)" />
          </linearGradient>
          <filter id="arcLandLift" x="-8%" y="-8%" width="116%" height="116%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="3" floodColor="#000000" floodOpacity="0.28" />
          </filter>
          <clipPath id="arcFrame"><rect x={0} y={0} width={W} height={H} rx={8} /></clipPath>
        </defs>
        <g clipPath="url(#arcFrame)">
        <rect x={0} y={0} width={W} height={H} fill="url(#arcWater)" rx={8} />
        <g clipPath="url(#arcFrame)" pointerEvents="none">
          {/* graticule: where on Earth this is */}
          {grid.lons.map(lon => {
            const [gx] = pMain(lon, box.lat0)
            return (
              <g key={`lon${lon}`}>
                <line x1={gx} y1={0} x2={gx} y2={H} stroke="var(--map-grid)" strokeWidth={1} />
                <text x={gx + 4} y={H - 7} fontSize={9} fill="var(--map-label)">{deg(lon, 'E', 'W')}</text>
              </g>
            )
          })}
          {grid.lats.map(lat => {
            const [, gy] = pMain(box.lon0, lat)
            return (
              <g key={`lat${lat}`}>
                <line x1={0} y1={gy} x2={W} y2={gy} stroke="var(--map-grid)" strokeWidth={1} />
                <text x={7} y={gy - 4} fontSize={9} fill="var(--map-label)">{deg(lat, 'N', 'S')}</text>
              </g>
            )
          })}
          {/* water-lining: the coast echoed outward, the old charts' glow */}
          {coastPath && <>
            <path d={coastPath} fill="none" stroke="var(--coast-glow)" strokeWidth={16} opacity={0.28} />
            <path d={coastPath} fill="none" stroke="var(--coast-glow)" strokeWidth={8} opacity={0.5} />
            <path d={coastPath} fill="none" stroke="var(--coast-glow)" strokeWidth={3.5} opacity={0.9} />
          </>}
        </g>
        {coastPath && (
          <path d={coastPath} fill="url(#arcLand)" stroke="var(--land-edge)" strokeWidth={1.1}
            filter="url(#arcLandLift)" />
        )}
        {urbanPath && (
          <path d={urbanPath} fill="var(--map-urban)" clipPath="url(#arcFrame)" pointerEvents="none" />
        )}
        {detailOn && detail && detailGeo && (() => {
          // Water first — the coastline's bays carve into it — then the true
          // shore, then the streets. The layer replaces the generalised coast
          // wherever it is drawn, which is only ever near its own area.
          const [dx0, dy0] = pMain(detail.lon0, detail.lat1)
          const [dx1, dy1] = pMain(detail.lon1, detail.lat0)
          const landD = svgPath(detailGeo.features.filter(f => kindOf(f) === 'land'), pMain)
          const roadD = svgPath(detailGeo.features.filter(f => kindOf(f) === 'road'), pMain)
          return (
            <g clipPath="url(#arcFrame)" pointerEvents="none">
              <rect x={dx0} y={dy0} width={dx1 - dx0} height={dy1 - dy0} fill="url(#arcWater)" />
              {landD && <path d={landD} fill="url(#arcLand)" stroke="var(--land-edge)" strokeWidth={1} />}
              {roadD && <path d={roadD} fill="none" stroke="var(--map-road)" strokeWidth={0.8} opacity={0.75} />}
            </g>
          )
        })()}
        {view.map?.attribution && (
          <text x={16} y={H - 8} fontSize={8.5} fill="var(--map-label)" opacity={0.7}
            pointerEvents="none">{view.map.attribution}</text>
        )}
        {period && (
          <g pointerEvents="none">
            <text x={18} y={26} fontSize={11} fontWeight={650} fill="var(--map-label)"
              style={{ letterSpacing: '0.14em' }}>
              {period.label.toUpperCase()}
            </text>
            <text x={18} y={41} fontSize={10} fill="var(--map-label)" opacity={0.85}
              style={{ letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>
              {year}
            </text>
          </g>
        )}
        {/* the chart's grammar: a scale you can trust, a north to stand by */}
        <g transform={`translate(${W - 30}, 32)`} pointerEvents="none" opacity={0.9}>
          <circle r={12} fill="none" stroke="var(--map-label)" strokeWidth={0.8} opacity={0.55} />
          <path d="M0,-10 L3,4 L0,1.5 L-3,4 Z" fill="var(--map-label)" />
          <text y={-16} fontSize={9} textAnchor="middle" fill="var(--map-label)">N</text>
        </g>
        <g transform={`translate(${W - 46 - bar.px}, ${H - 30})`} pointerEvents="none">
          <line x1={0} y1={0} x2={bar.px} y2={0} stroke="var(--map-label)" strokeWidth={1.4} />
          <line x1={0} y1={-3.5} x2={0} y2={3.5} stroke="var(--map-label)" strokeWidth={1.4} />
          <line x1={bar.px} y1={-3.5} x2={bar.px} y2={3.5} stroke="var(--map-label)" strokeWidth={1.4} />
          <text x={bar.px + 8} y={3.5} fontSize={10} fill="var(--map-label)">{bar.km} km</text>
        </g>

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
        {/* Full view: the island's own scale — cities (the doors), and any
            place that lives outside a city's window. A city's interior is
            what entering it reveals; drawing it from the island view stacked
            a neighbourhood onto one pixel. */}
        {placeDots(box, pMain, !win ? { islandScale: true } : undefined)}
        {markers(box, pMain, 1)}

        {/* The inset panel retired (A24-8): the city dot on the chart is
            the door now, and entering it reveals the interior. */}
        </g>
      </svg>
      <TipOverlay tip={tip} />
      {win && (
        <button className="themeToggle mapBack" onClick={() => setWin(null)}>
          ⤺ Full map
        </button>
      )}
      <Legend items={[
        ...Object.entries(colors).map(([id, color]) => ({ label: nameOf(canon, id), color })),
        { label: 'place', color: 'var(--muted)' },
      ]} />
    </div>
  )
}
