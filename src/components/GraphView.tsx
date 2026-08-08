import { useMemo, useRef } from 'react'
import {
  forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY,
} from 'd3-force'
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force'
import type { Canon } from '../canon'
import { extantAt, nameOf, stateAt } from '../canon'
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
  canon, tEnd, selected, onSelect,
}: {
  canon: Canon
  tEnd: number
  selected: string | null
  onSelect: (id: string) => void
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

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minHeight: 0, padding: '0 12px 4px' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
        {/* structural place-hierarchy edges */}
        {struct.map((l, i) => (
          <line key={i} x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
            stroke="var(--grid)" strokeWidth={1} />
        ))}
        {/* objective edges */}
        {links.map(l => (
          <g key={l.edge.id}
            onMouseMove={ev => showTip(ev, l.edge.kind, l.edge.summary)}
            onMouseLeave={hideTip}>
            <line x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
              stroke="var(--baseline)" strokeWidth={1.4} />
            <line x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
              stroke="transparent" strokeWidth={10} />
          </g>
        ))}
        {/* subjective perception edges at T (dashed, from selected character) */}
        {selected && perception.map(p => {
          const a = pos.get(selected)
          const b = pos.get(p.toward)
          if (!a || !b) return null
          return (
            <g key={p.toward}
              onMouseMove={ev => showTip(ev, `${nameOf(canon, selected!)} → ${nameOf(canon, p.toward)}`, p.stance)}
              onMouseLeave={hideTip}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="var(--c1)" strokeWidth={1.6} strokeDasharray="4 4" opacity={0.85} />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={10} />
            </g>
          )
        })}
        {/* nodes */}
        {nodes.map(n => {
          const ent = canon.entities[n.id]
          const alive = extantAt(ent, tEnd)
          const sel = selected === n.id
          const r = n.type === 'character' ? 10 : 7.5
          return (
            <g key={n.id} style={{ cursor: 'pointer' }}
              onClick={() => onSelect(n.id)}
              onMouseMove={ev => showTip(ev, ent.name, alive ? ent.summary.slice(0, 100) + '…' : 'not extant at this time')}
              onMouseLeave={hideTip}>
              {sel && <circle cx={n.x} cy={n.y} r={r + 5} fill="none" stroke="var(--c1)" strokeWidth={2} />}
              <circle cx={n.x} cy={n.y} r={r}
                fill={TYPE_COLORS[n.type] ?? 'var(--c7)'}
                opacity={alive ? 1 : 0.28}
                stroke="var(--surface-1)" strokeWidth={2} />
              <text x={n.x} y={(n.y ?? 0) + r + 13} fontSize={11} textAnchor="middle"
                fill={alive ? 'var(--text-primary)' : 'var(--muted)'} fontWeight={sel ? 650 : 400}>
                {n.name}
              </text>
            </g>
          )
        })}
      </svg>
      <TipOverlay tip={tip} />
      <Legend items={Object.entries(TYPE_COLORS).map(([type, color]) => ({ label: type, color }))}>
        <span className="item"><span className="swatch" style={{ background: 'transparent', border: '1px dashed var(--c1)', borderRadius: 0, width: 12, height: 0 }} />perception at T (selected)</span>
        <span className="item" style={{ opacity: 0.4 }}>● faded = not extant at T</span>
      </Legend>
    </div>
  )
}
