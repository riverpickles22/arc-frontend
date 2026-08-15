import { describe, expect, it } from 'vitest'
import { dotsFor } from './keypoints'
import type { ResolvedAnnotation } from './canon'

const ann = (over: Partial<ResolvedAnnotation> & { id: string }): ResolvedAnnotation => ({
  anchor: { scene: 'sc.01-1', paragraph: 0, quote: 'q' },
  body: 'the point',
  resolution: { state: 'resolved', paragraph: 0 },
  ...over,
} as ResolvedAnnotation)

const SCENES = new Set(['sc.01-1'])

describe('dotsFor', () => {
  it('keeps keypoints and drops notes', () => {
    const dots = dotsFor([ann({ id: 'note.1' }), ann({ id: 'note.2', kind: 'keypoint' })], SCENES)
    expect(dots.map(d => d.id)).toEqual(['note.2'])
  })
  it('a drifted keypoint dots the paragraph its text sits in now', () => {
    const dots = dotsFor([ann({ id: 'note.3', kind: 'keypoint', resolution: { state: 'drifted', paragraph: 4 } })], SCENES)
    expect(dots[0].key).toBe('sc.01-1:4')
  })
  it('orphaned and no-scene anchors produce no dot — never a guessed spot', () => {
    expect(dotsFor([
      ann({ id: 'note.4', kind: 'keypoint', resolution: { state: 'orphaned', paragraph: null } }),
      ann({ id: 'note.5', kind: 'keypoint', resolution: { state: 'no-scene', paragraph: null } }),
    ], SCENES)).toEqual([])
  })
  it('scenes outside the chapter do not dot this chapter', () => {
    expect(dotsFor([ann({ id: 'note.6', kind: 'keypoint', anchor: { scene: 'sc.09-1', paragraph: 0, quote: 'q' } })], SCENES)).toEqual([])
  })
  it('provenance defaults to the author', () => {
    const [d] = dotsFor([ann({ id: 'note.7', kind: 'keypoint' })], SCENES)
    expect(d.by).toBe('author')
  })
})
