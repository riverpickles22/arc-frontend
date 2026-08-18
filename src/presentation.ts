// How the story is drawn, not what is true about it. Where the answer can
// be derived from canon it is derived, so a story needs no configuration to
// render; view.yaml only carries the editorial choices canon can't imply.
import type { Canon } from './canon'
import { dk, dateOf, timeRefKey } from './canon'
import type { BBox } from './map-geometry'

/** A named face of the map for a stretch of story time (A24-2). Presentation
 *  only — the story declares its periods in view.yaml; arc knows the faces. */
interface MapPeriod {
  label: string
  /** One of the faces theme.css defines (map-face-<name>); absent = default. */
  face?: string
  /** Last year this period covers. The final period may omit it — open-ended. */
  until?: number
  /** Optional era-specific basemap asset — the seam for a scanned period map. */
  basemap?: string
}

export interface View {
  map?: {
    basemap?: string
    inset?: BBox & { label: string }
    periods?: MapPeriod[]
    /** A finer asset for one area — streets, the true shore — drawn only
     *  when the window is near it (A24-5). */
    detail?: BBox & { asset: string }
    /** Rendered on the chart. Data licences (ODbL) may require it. */
    attribution?: string
  }
}

/** The period covering a year: the first whose `until` has not passed, else
 *  the last (open-ended) one. Null when a story declares no periods. */
export function periodFor(periods: MapPeriod[] | undefined, year: number): MapPeriod | null {
  if (!periods?.length) return null
  return periods.find(p => p.until != null && year <= p.until) ?? periods.at(-1)!
}

// Character colours are derived per story, so this repo carries no story's
// cast. Entity types are the system's own vocabulary, so they stay fixed.
export const TYPE_COLORS: Record<string, string> = {
  character: 'var(--c1)',
  place: 'var(--c2)',
  faction: 'var(--c3)',
  object: 'var(--c4)',
}

/** The palette in theme.css. Assignment is positional, so it stays stable. */
const PALETTE = Array.from({ length: 8 }, (_, i) => `var(--c${i + 1})`)

/**
 * A colour per character: protagonists first in the order story.yaml lists
 * them, then everyone else by id. Deterministic, and distinct for the first
 * eight — which is why this can replace a hand-maintained map.
 */
export function charColors(canon: Canon): Record<string, string> {
  const protagonists = (canon.story.protagonists ?? []).filter(id => canon.entities[id]?.type === 'character')
  const rest = Object.values(canon.entities)
    .filter(e => e.type === 'character' && !protagonists.includes(e.id))
    .map(e => e.id)
    .sort()
  const out: Record<string, string> = {}
  ;[...protagonists, ...rest].forEach((id, i) => { out[id] = PALETTE[i % PALETTE.length] })
  return out
}

/**
 * The year to open on: the first year anyone is actually *somewhere*.
 *
 * Since a character renders only from their earliest state onward, both the
 * era floor and the first chapter can land before the cast has any state —
 * opening there shows an empty map. The earliest character state is the first
 * year the view has content, whatever the story.
 */
export function openingYear(canon: Canon, fallback: number): number {
  const stateKeys = Object.values(canon.entities)
    .filter(e => e.type === 'character')
    .flatMap(e => (e.states ?? []).map(s => timeRefKey(s.at, canon.timeline.eras)))
    .filter(k => k > 0)
  if (stateKeys.length) return Math.floor(Math.min(...stateKeys) / 10000)

  const firstChapter = [...(canon.chapters ?? [])].sort((a, b) => a.order - b.order)[0]
  const chapterStart = dateOf(firstChapter?.span.start)
  return chapterStart ? Math.floor(dk(chapterStart) / 10000) : fallback
}
