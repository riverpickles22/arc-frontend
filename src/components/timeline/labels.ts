// Label declutter for the timeline bands. Boxes (era segments, chapter
// rects) may overlap on the calendar axis; each label is already clipped to
// its own box, so labels collide exactly when boxes overlap. Greedy rule,
// left to right: a label renders only when its box is wide enough to read
// and its start clears the previous rendered label's estimated extent.
// Skipped labels keep their <title> tooltip — the name is a hover away.

export interface LabelBox {
  x: number
  w: number
  /** label length in characters — width is estimated, never measured (the
   *  band stretches with preserveAspectRatio="none", so px are unknowable) */
  chars: number
}

export interface LabelOpts {
  charW?: number   // estimated viewBox units per character
  pad?: number     // label inset within its box
  minW?: number    // boxes narrower than this get no label at all
}

/** For each box (any order), whether its label should render. */
export function keepLabels(boxes: LabelBox[], opts: LabelOpts = {}): boolean[] {
  const { charW = 6, pad = 4, minW = 16 } = opts
  const keep = new Array<boolean>(boxes.length).fill(false)
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a].x - boxes[b].x)
  let prevEnd = -Infinity
  for (const i of order) {
    const b = boxes[i]
    if (b.w < minW) continue
    const est = Math.min(b.chars * charW + pad * 2, b.w)
    if (b.x + 0.5 < prevEnd) continue
    keep[i] = true
    prevEnd = b.x + est
  }
  return keep
}
