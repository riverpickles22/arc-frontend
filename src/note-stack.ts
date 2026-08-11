// Where the notes rail's cards sit.
//
// A note is a thought about a specific passage, so it belongs level with that
// passage — close enough that the author's eye never leaves the sentence.
// Cards cannot simply be placed at their paragraph's line, because two notes
// on adjacent paragraphs would overlap, so they stack: each takes its own line
// or the first free space below whichever card precedes it.
//
// Pure and tested here rather than living in the component, in the same spirit
// as map-geometry and graph-focus: the arithmetic is the part that goes
// subtly wrong, and it goes wrong silently.

/** Clears the rail's heading — no card may sit above this. */
export const RAIL_FLOOR = 34

/**
 * Final y for each card, given where each one *wants* to sit and how tall it
 * is. Input order is render order; the returned array matches it.
 *
 * Stacking runs in paragraph order rather than list order. Cards arrive in
 * whatever order their notes were filed, and a card wanting line 100 arriving
 * after one at line 900 would otherwise be shoved to the bottom of the rail,
 * nowhere near the passage it belongs to.
 */
export function stack(desired: number[], heights: number[], gap = 10): number[] {
  const order = desired.map((_, i) => i).sort((a, b) => desired[a] - desired[b])
  const out = new Array<number>(desired.length).fill(0)
  let floor = RAIL_FLOOR
  for (const i of order) {
    const top = Math.max(desired[i], floor)
    floor = top + (heights[i] || 0) + gap
    out[i] = top
  }
  return out
}
