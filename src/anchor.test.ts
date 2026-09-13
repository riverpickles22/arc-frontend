import { describe, expect, it, vi } from 'vitest'
import { keepAnchored } from './anchor'

const now = (fn: () => void) => fn()

describe('keepAnchored', () => {
  it('scrolls by exactly the distance the anchor moved', () => {
    const tops = [100, 340]
    const scrollBy = vi.fn()
    const change = vi.fn()
    keepAnchored(() => tops.shift() ?? null, change, scrollBy, now)
    expect(change).toHaveBeenCalledOnce()
    expect(scrollBy).toHaveBeenCalledWith(240)
  })

  it('scrolls back up when the anchor rose', () => {
    const tops = [340, 100]
    const scrollBy = vi.fn()
    keepAnchored(() => tops.shift() ?? null, () => {}, scrollBy, now)
    expect(scrollBy).toHaveBeenCalledWith(-240)
  })

  it('does not scroll when the anchor did not move', () => {
    const scrollBy = vi.fn()
    keepAnchored(() => 212, () => {}, scrollBy, now)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('still makes the change when the anchor cannot be found, and never guesses a position', () => {
    const scrollBy = vi.fn()
    const change = vi.fn()
    keepAnchored(() => null, change, scrollBy, now)
    expect(change).toHaveBeenCalledOnce()
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('does not scroll when the anchor disappears during the change', () => {
    const tops: (number | null)[] = [100, null]
    const scrollBy = vi.fn()
    keepAnchored(() => tops.shift() ?? null, () => {}, scrollBy, now)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('measures before the change and again after the paint, never in between', () => {
    const order: string[] = []
    let painted: (() => void) | null = null
    keepAnchored(
      () => { order.push('measure'); return 0 },
      () => order.push('change'),
      () => {},
      fn => { painted = fn },
    )
    expect(order).toEqual(['measure', 'change'])
    painted!()
    expect(order).toEqual(['measure', 'change', 'measure'])
  })
})
