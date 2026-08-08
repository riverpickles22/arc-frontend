// Tooltip and legend — the overlay furniture the SVG views share.
import { useState } from 'react'
import type { ReactNode, RefObject } from 'react'

export interface Tip { x: number; y: number; title: string; sub?: string }

/** Tooltip state plus the mouse wiring, positioned inside the wrapper. */
export function useTip(wrapRef: RefObject<HTMLDivElement | null>) {
  const [tip, setTip] = useState<Tip | null>(null)
  const showTip = (ev: React.MouseEvent, title: string, sub?: string) => {
    const r = wrapRef.current?.getBoundingClientRect()
    if (!r) return
    setTip({ x: ev.clientX - r.left + 12, y: ev.clientY - r.top + 12, title, sub })
  }
  return { tip, showTip, hideTip: () => setTip(null) }
}

export function TipOverlay({ tip }: { tip: Tip | null }) {
  if (!tip) return null
  return (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
      <div className="t-title">{tip.title}</div>
      {tip.sub && <div className="t-sub">{tip.sub}</div>}
    </div>
  )
}

export function Legend({ items, children }: {
  items: { label: string; color: string }[]
  children?: ReactNode
}) {
  return (
    <div className="legend">
      {items.map(i => (
        <span key={i.label} className="item">
          <span className="swatch" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
      {children}
    </div>
  )
}
