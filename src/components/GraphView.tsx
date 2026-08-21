import { useMemo, useRef } from 'react'
import {
  forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY,
} from 'd3-force'
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import type { Canon, Chapter } from '../canon'
import { nameOf, stateAt } from '../canon'
import { displayState, livingNote } from '../entity-state'
import { FOCUS_MODES, type FocusMode } from '../graph-focus'
import { degreeRadius, edgeArc } from '../graph-visuals'
import { TYPE_COLORS } from '../presentation'
import { Legend, TipOverlay, useTip } from './overlays'

const W = 760
const H = 560

interface Node extends SimulationNodeDatum {
  id: string
  name: string
  type: string
}

export function GraphView({
  canon, tEnd, chapter, selected, onSelect, onClear, dimTo, focus, touching, onOpenRun,
}: {
  canon: Canon
  tEnd: number
  /** The chapter under the cursor — its POV and its span mark nodes. */
  chapter?: Chapter
  selected: string | null
  onSelect: (id: string) => void
  /** Empty-canvas click: the selection clears everywhere, not just here. */
  onClear?: () => void
  /** Dim everything outside this set (POV mode or a focus mode). */
  dimTo?: Set<string> | null
  /** The focus-mode control (Chapter / Selection / All). */
  focus?: { mode: FocusMode; onMode: (m: FocusMode) => void }
  /** id → the run that holds write or propose over it. Presence marks intent
   *  to CHANGE something, never attention: a run that read nine entities to
   *  file one item lights nothing. */
  touching?: Map<string, string>
  onOpenRun?: (runId: string) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const { tip, showTip, hideTip } = useTip(wrapRef)

  // Static force layout — computed once per canon (time affects styling, not layout).
  const { nodes, links, struct } = useMemo(() => {
    const nodes: Node[] = Object.values(canon.entities).map(e => ({ id: e.id, name: e.name, type: e.type }))
    const links = canon.relationships.map(r => ({ source: r.from, target: r.to, edge: r }))
    // structural place-hierarchy links keep the place cluster attached
    const struct: { source: string; target: string }[] = []
    for (const e of Object.values(canon.entities)) {
      if (e.part_of && canon.entities[e.part_of]) struct.push({ source: e.id, target: e.part_of })
    }
    const sim = forceSimulation(nodes)
      .force('link', forceLink<Node, SimulationLinkDatum<Node>>([...links, ...struct]).id(d => d.id).distance(90).strength(0.5))
      .force('charge', forceManyBody().strength(-320))
      .force('center', forceCenter(W / 2, H / 2))
      .force('x', forceX(W / 2).strength(0.07))
      .force('y', forceY(H / 2).strength(0.1))
      .force('collide', forceCollide(36))
      .stop()
    for (let i = 0; i < 300; i++) sim.tick()
    // clamp into frame, with room for labels
    for (const n of nodes) {
      n.x = Math.max(60, Math.min(W - 60, n.x ?? W / 2))
      n.y = Math.max(30, Math.min(H - 42, n.y ?? H / 2))
    }
    const structResolved = struct as unknown as { source: Node; target: Node }[]
    return {
      nodes,
      links: links as unknown as { source: Node; target: Node; edge: (typeof canon.relationships)[0] }[],
      struct: structResolved,
    }
  }, [canon])

  // Subjective perception edges from the selected character at T
  const perception = useMemo(() => {
    const e = selected ? canon.entities[selected] : undefined
    if (!e || e.type !== 'character') return []
    const s = stateAt(e, tEnd, canon.timeline.eras)
    return (s?.relationships ?? []).map(r => ({ toward: r.toward, stance: r.stance }))
  }, [canon, selected, tEnd])

  const pos = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  // Degree per node — relationships plus place-hierarchy scaffolding — so a
  // hub reads as a hub. Rendering only: the layout above never sees it.
  const degree = useMemo(() => {
    const d = new Map<string, number>()
    const bump = (id: string) => d.set(id, (d.get(id) ?? 0) + 1)
    for (const r of canon.relationships) { bump(r.from); bump(r.to) }
    for (const e of Object.values(canon.entities)) {
      if (e.part_of && canon.entities[e.part_of]) { bump(e.id); bump(e.part_of) }
    }
    return d
  }, [canon])

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minHeight: 0, padding: '0 12px 4px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
        onClick={() => onClear?.()}>
        <defs>
          {/* The canvas gets depth; the nodes get light. Filters and a
              vignette, never a layout change — positions are untouchable. */}
          <radialGradient id="graphVignette" cx="50%" cy="46%" r="72%">
            <stop offset="62%" stopColor="var(--graph-vignette)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--graph-vignette)" stopOpacity="0.5" />
          </radialGradient>
          <filter id="nodeGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="url(#graphVignette)" rx={8} />
        {/* structural place-hierarchy edges: scaffolding, straight and quiet */}
        {struct.map((l, i) => (
          <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
            stroke="var(--grid)" strokeWidth={1} />
        ))}
        {/* objective edges: gentle arcs, thickening under the cursor */}
        {links.map(l => {
          const d = edgeArc(l.source.x!, l.source.y!, l.target.x!, l.target.y!)
          return (
            <g key={l.edge.id} className="gEdge"
              opacity={dimTo && !(dimTo.has(l.edge.from) && dimTo.has(l.edge.to)) ? 0.15 : 1}
              style={{ transition: 'opacity 240ms ease' }}
              onMouseMove={ev => showTip(ev, l.edge.kind, l.edge.summary)}
              onMouseLeave={hideTip}>
              <path className="gEdgeVis" d={d} fill="none" stroke="var(--baseline)" strokeWidth={1.4} />
              <path d={d} fill="none" stroke="transparent" strokeWidth={11} />
            </g>
          )
        })}
        {/* subjective perception edges at T (dashed, from selected character) */}
        {selected && perception.map(p => {
          const a = pos.get(selected)
          const b = pos.get(p.toward)
          if (!a || !b) return null
          return (
            <g key={p.toward}
              onMouseMove={ev => showTip(ev, `${nameOf(canon, selected!)} → ${nameOf(canon, p.toward)}`, p.stance)}
              onMouseLeave={hideTip}>
              <path className="gPerception" d={edgeArc(a.x!, a.y!, b.x!, b.y!, 0.16)} fill="none"
                stroke="var(--c1)" strokeWidth={1.6} strokeDasharray="4 4" opacity={0.85} />
              <path d={edgeArc(a.x!, a.y!, b.x!, b.y!, 0.16)} fill="none" stroke="transparent" strokeWidth={10} />
            </g>
          )
        })}
        {/* nodes */}
        {nodes.map(n => {
          const ent = canon.entities[n.id]
          // The one derivation both surfaces share (entity-state.ts): the
          // views render the vocabulary, they no longer invent fragments of it.
          const ds = displayState(canon, n.id, tEnd, chapter)
          const alive = !ds.notYet && !ds.deceased
          const sel = selected === n.id
          const dimmed = !!dimTo && !dimTo.has(n.id)
          const r = degreeRadius(n.type === 'character' ? 10 : 7.5, degree.get(n.id) ?? 0)
          // Proposed, not yet ratified: drawn as pending rather than hidden or
          // drawn as though it had always been true. Decoration only — the
          // layout above never sees status, so nothing moves when a record is
          // ratified.
          const pending = ds.pending
          const color = TYPE_COLORS[n.type] ?? 'var(--c7)'
          const run = touching?.get(n.id)
          return (
            <g key={n.id} style={{ cursor: 'pointer' }}
              onClick={ev => { ev.stopPropagation(); onSelect(n.id) }}
              onMouseMove={ev => showTip(ev, ent.name,
                pending ? 'proposed — not yet ratified' : livingNote(ds) ?? ent.summary.slice(0, 100) + '…')}
              onMouseLeave={hideTip}>
              {/* the body's glow, in its own type colour */}
              <circle cx={n.x} cy={n.y} r={r + 4} fill={TYPE_COLORS[n.type] ?? 'var(--c7)'}
                opacity={dimmed ? 0 : alive ? 0.3 : 0.08} filter="url(#nodeGlow)"
                style={{ transition: 'opacity 240ms ease' }} />
              {sel && (
                <circle className="gSelRing" cx={n.x} cy={n.y} r={r + 5} fill="none"
                  stroke="var(--c1)" strokeWidth={2} />
              )}
              {pending && (
                <circle cx={n.x} cy={n.y} r={r + 3} fill="none"
                  stroke={color} strokeWidth={1.5} strokeDasharray="3 3"
                  opacity={dimmed ? 0.2 : 0.9} />
              )}
              <circle cx={n.x} cy={n.y} r={r}
                fill={color}
                opacity={dimmed ? 0.12 : pending ? 0.4 : alive ? 1 : 0.28}
                stroke="var(--surface-1)" strokeWidth={2}
                style={{ transition: 'opacity 240ms ease' }} />
              {/* Deceased is not merely absent: a life the reader has passed
                  is a different fact from one still coming, and the two faded
                  states were indistinguishable before. The slash says closed. */}
              {ds.deceased && !dimmed && (
                <line x1={(n.x ?? 0) - r * 0.8} y1={(n.y ?? 0) + r * 0.8}
                  x2={(n.x ?? 0) + r * 0.8} y2={(n.y ?? 0) - r * 0.8}
                  stroke="var(--muted)" strokeWidth={1.5} opacity={0.85} />
              )}
              {/* The chapter's POV: a small steady point above the node, in
                  the node's own colour — status never changes a colour. */}
              {ds.pov && !dimmed && (
                <circle cx={n.x} cy={(n.y ?? 0) - r - 6} r={2.5} fill={color}
                  onMouseMove={ev => { ev.stopPropagation(); showTip(ev, ent.name, 'POV of the current chapter') }} />
              )}
              {/* The current chapter is moving this entity: the same diamond
                  the timeline uses for a state change, at the node's foot. */}
              {ds.changedThisChapter && !dimmed && (
                <rect x={(n.x ?? 0) + r * 0.6} y={(n.y ?? 0) + r * 0.6} width={5} height={5}
                  transform={`rotate(45 ${(n.x ?? 0) + r * 0.6 + 2.5} ${(n.y ?? 0) + r * 0.6 + 2.5})`}
                  fill={color} stroke="var(--surface-1)" strokeWidth={1}
                  onMouseMove={ev => { ev.stopPropagation(); showTip(ev, ent.name, 'changes in the current chapter') }} />
              )}
              {run && (
                <circle cx={(n.x ?? 0) + r} cy={(n.y ?? 0) - r} r={3.5}
                  fill="var(--c1)" stroke="var(--surface-1)" strokeWidth={1.5}
                  style={{ cursor: 'pointer' }}
                  onClick={ev => { ev.stopPropagation(); onOpenRun?.(run) }}
                  onMouseMove={ev => showTip(ev, run, 'a run is working on this — click to see it')}
                  onMouseLeave={hideTip} />
              )}
              <text x={n.x} y={(n.y ?? 0) + r + 13} fontSize={11} textAnchor="middle"
                opacity={dimmed ? 0.25 : 1}
                style={{ transition: 'opacity 240ms ease' }}
                fill={alive ? 'var(--text-primary)' : 'var(--muted)'} fontWeight={sel ? 650 : 400}>
                {n.name}
              </text>
            </g>
          )
        })}
      </svg>
      <TipOverlay tip={tip} />
      {focus && (
        <div className="focusmodes">
          {FOCUS_MODES.map(f => (
            <button key={f.mode} title={f.title}
              className={focus.mode === f.mode ? 'sel' : ''}
              onClick={() => focus.onMode(f.mode)}>{f.label}</button>
          ))}
        </div>
      )}
      <Legend items={[
        ...Object.entries(TYPE_COLORS).map(([type, color]) => ({ label: type, color })),
        // Only when there is something to explain: a legend entry for a state
        // nothing is in reads as clutter.
        ...(Object.values(canon.entities).some(e => e.status === 'proposed')
          ? [{ label: 'proposed (dashed)', color: 'var(--c6)' }] : []),
        ...(touching?.size ? [{ label: 'a run is changing this', color: 'var(--c1)' }] : []),
      ]}>
        <span className="item"><span className="swatch" style={{ background: 'transparent', border: '1px dashed var(--c1)', borderRadius: 0, width: 12, height: 0 }} />perception at T (selected)</span>
        <span className="item" style={{ opacity: 0.4 }}>● faded = not present at T</span>
      </Legend>
    </div>
  )
}
