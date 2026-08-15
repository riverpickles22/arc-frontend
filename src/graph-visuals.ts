// The graph's visual grammar (A25-1): pure geometry for GraphView's
// rendering pass. No React, no layout — the force simulation owns positions;
// this module only decides how a drawn thing curves and how large it sits.

/** A gentle quadratic arc between two points. The control point sits off the
 *  midpoint, perpendicular to the segment, at `bend` of its length — enough
 *  curve to read as drawn by hand, never enough to mislead about who joins
 *  whom. The side is deterministic: always to the left of travel, so the two
 *  directions of a pair bow apart instead of overlapping. */
export function edgeArc(x1: number, y1: number, x2: number, y2: number, bend = 0.12): string {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const cx = mx - dy * bend
  const cy = my + dx * bend
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
}

/** A node's radius from its degree: hubs read as hubs, inside a narrow band
 *  so no node shouts. sqrt keeps the growth honest — twice the connections
 *  is visibly more, not twice the ink. */
export function degreeRadius(base: number, degree: number): number {
  const scale = Math.min(1.45, 0.9 + 0.14 * Math.sqrt(Math.max(degree, 0)))
  return +(base * scale).toFixed(2)
}
