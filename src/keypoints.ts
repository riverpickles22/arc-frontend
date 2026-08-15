// The margin timeline's data half (A30): which annotations become dots, and
// where each dot anchors. Pure, so the placement rules are testable without
// a DOM — the component only measures pixels for the keys this returns.
import type { ResolvedAnnotation } from './canon'

export interface Dot {
  id: string
  /** `scene:paragraph`, at the RESOLVED position — a drifted keypoint dots
   *  the paragraph its text actually sits in now. */
  key: string
  body: string
  by: 'author' | 'agent'
}

/** Keypoints only, in the given scenes, at positions that actually resolve.
 *  Orphaned and no-scene anchors return no dot at all: a dot at a wrong or
 *  guessed spot would be the margin lying about structure — the one thing
 *  the rail exists not to do. */
export function dotsFor(anns: ResolvedAnnotation[], scenes: ReadonlySet<string>): Dot[] {
  return anns
    .filter(a => a.kind === 'keypoint')
    .filter(a => scenes.has(a.anchor.scene))
    .filter(a => (a.resolution.state === 'resolved' || a.resolution.state === 'drifted') && a.resolution.paragraph !== null)
    .map(a => ({
      id: a.id,
      key: `${a.anchor.scene}:${a.resolution.paragraph}`,
      body: a.body,
      by: a.by === 'agent' ? 'agent' as const : 'author' as const,
    }))
}
