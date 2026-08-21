// One derivation of what an entity IS at the cursor's moment — deceased,
// not yet present, proposed, the chapter's POV, changed this chapter — as
// data every surface renders from.
//
// Before this, each view derived its own fragment and they disagreed: the
// graph faded everything non-extant into one state (a character dead ten
// years and one born next chapter looked identical), and the map filtered
// the dead out entirely, so a character's death showed as their marker
// silently vanishing. One module, one vocabulary, and the views become
// renderers of it.
import type { Canon, Chapter, Entity } from './canon'
import { dateOf, dk, stateAt, timeRefKey } from './canon'

export interface DisplayState {
  /** status: proposed — not yet ratified. Decoration only: no status ever
   *  changes an entity's colour, only how its own colour is worn. */
  pending: boolean
  /** Born / created / begun after T: not yet in the world. */
  notYet: boolean
  /** Died / destroyed / ended before T: was here, and is gone. The two
   *  non-living states are deliberately distinct — a death the reader has
   *  passed and an arrival still coming are different facts about T. */
  deceased: boolean
  /** POV of the chapter under the cursor. */
  pov: boolean
  /** A state snapshot of this entity sits inside the current chapter's
   *  span — the story is moving this entity right now. */
  changedThisChapter: boolean
  /** Where the entity can honestly be drawn after death: its last state's
   *  location at T, or null when the record never says. Absence is honest —
   *  a dead character with no located state has no place on a map. */
  lastLocation: string | null
}

export function displayState(canon: Canon, id: string, tEnd: number, chapter?: Chapter): DisplayState {
  const e: Entity | undefined = canon.entities[id]
  const eras = canon.timeline.eras
  if (!e) {
    return { pending: false, notYet: false, deceased: false, pov: false, changedThisChapter: false, lastLocation: null }
  }

  const start = dateOf(e.born) ?? dateOf(e.created) ?? dateOf(e.span?.start)
  const stop = dateOf(e.died) ?? dateOf(e.destroyed) ?? dateOf(e.span?.end)
  const notYet = !!start && dk(start) > tEnd
  const deceased = !notYet && !!stop && dk(stop, true) < tEnd

  let changedThisChapter = false
  if (chapter?.span) {
    const from = dateOf(chapter.span.start)
    const to = dateOf(chapter.span.end) ?? dateOf(chapter.span.start)
    if (from && to) {
      const lo = dk(from)
      const hi = dk(to, true)
      changedThisChapter = (e.states ?? []).some(s => {
        const k = timeRefKey(s.at, eras)
        return k >= lo && k <= hi
      })
    }
  }

  const s = stateAt(e, tEnd, eras)
  return {
    pending: e.status === 'proposed',
    notYet,
    deceased,
    pov: chapter?.pov === id,
    changedThisChapter,
    lastLocation: (s && 'location' in s && typeof s.location === 'string') ? s.location : null,
  }
}

/** The hover line for a non-living entity — one wording, both surfaces. */
export const livingNote = (ds: DisplayState): string | null =>
  ds.deceased ? 'no longer living at this time'
    : ds.notYet ? 'not yet present at this time'
      : null
