// "Work through my notes": what the manuscript can PROVE about the pending
// draft and the notes — read from the draft's own provenance, never from a
// model's reading. Pure, so it is tested here and the component stays a
// renderer.
import type { ProseChange, ResolvedAnnotation } from 'arc-canon-graph'

/** The ids of every note the pending draft was written to answer, across
 *  the changes given. A note is here because the pass was HANDED it, which
 *  is the fact the ledger records; whether it was met is the author's read. */
export function answeredInDraft(changes: ProseChange[]): Set<string> {
  const out = new Set<string>()
  for (const c of changes) for (const id of c.answers ?? []) out.add(id)
  return out
}

/** The draft pill's hover line for a modified scene: names how many notes
 *  the draft answers when the ledger says it answers any, and says nothing
 *  about notes when it does not — a hand edit answers no one. */
export function draftPillTitle(change: ProseChange): string {
  if (change.status === 'added') return 'This scene exists only in the draft layer — accept or discard it whole.'
  if (change.status === 'deleted') return 'The draft deletes this scene — accept or discard the deletion.'
  const n = change.answers?.length ?? 0
  if (!n) return 'Unaccepted edits — review them in the prose below, or through the draft bar.'
  return `Unaccepted edits, written to answer ${n} of your note${n === 1 ? '' : 's'} — review them in the prose below, then close the notes the draft met.`
}

/** Which scenes of the chapter have notes to work, in the chapter's own
 *  scene order, with how many. Key points are never notes; resolved and
 *  dropped notes are already closed. */
export function workableScenes(
  notes: ResolvedAnnotation[],
  scenes: { scene: string }[],
): { scene: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const n of notes) {
    if ((n.kind ?? 'note') !== 'note') continue
    if (n.status && n.status !== 'open') continue
    counts.set(n.anchor.scene, (counts.get(n.anchor.scene) ?? 0) + 1)
  }
  return scenes.flatMap(s => {
    const count = counts.get(s.scene) ?? 0
    return count ? [{ scene: s.scene, count }] : []
  })
}

/** The control's label: one scene reads as "these notes"; several name
 *  the scene, because the author has to know which one they are sending. */
export function workLabel(w: { scene: string; count: number }, alone: boolean): string {
  const notes = `${w.count} note${w.count === 1 ? '' : 's'}`
  if (alone) return w.count === 1 ? 'work through this note' : `work through these ${notes}`
  return `work ${notes} on ${w.scene}`
}
