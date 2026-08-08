import { describe, expect, it } from 'vitest'
import { keepLabels } from './labels'

describe('keepLabels', () => {
  it('non-overlapping boxes all keep their labels', () => {
    const keep = keepLabels([
      { x: 0, w: 100, chars: 10 },
      { x: 100, w: 100, chars: 10 },
      { x: 200, w: 100, chars: 10 },
    ])
    expect(keep).toEqual([true, true, true])
  })

  it('a box overlapped by the previous label is skipped, the next clear one renders', () => {
    // three boxes stacked in one dense zone (the ch. 5-7 defect): the second
    // starts inside the first label's extent, the third is clear again
    const keep = keepLabels([
      { x: 0, w: 80, chars: 12 },     // label extent ≈ 12*6+8 = 80
      { x: 30, w: 80, chars: 12 },    // starts under the first label → skip
      { x: 90, w: 80, chars: 12 },    // clear → renders
    ])
    expect(keep).toEqual([true, false, true])
  })

  it('boxes too narrow to read get no label', () => {
    expect(keepLabels([{ x: 0, w: 10, chars: 30 }])).toEqual([false])
  })

  it('label extent is capped at the box width (clipping), freeing the next label', () => {
    // a very long title in a narrow-ish box must not phantom-block neighbors
    const keep = keepLabels([
      { x: 0, w: 40, chars: 60 },     // clipped to 40 wide
      { x: 45, w: 40, chars: 8 },
    ])
    expect(keep).toEqual([true, true])
  })

  it('handles boxes given out of x order (flashbacks on the calendar axis)', () => {
    const keep = keepLabels([
      { x: 200, w: 80, chars: 8 },
      { x: 0, w: 80, chars: 8 },
      { x: 210, w: 80, chars: 8 },    // overlaps the first in x order
    ])
    expect(keep).toEqual([true, true, false])
  })
})
