// The re-entry briefing's data half (A56): when it opens, what it says, and
// where each count leads — pure functions, so the restraint rules are
// testable without a DOM. The briefing is three sections, then the prose;
// SECTIONS is the whole list, and the component renders it by mapping.
import type { BriefingResponse } from 'arc-canon-graph/api-types.ts'
import type { Chapter } from './canon'

/** Away longer than this and the manuscript opens on the briefing. */
export const BRIEFING_THRESHOLD_HOURS = 20

/** The author's word on the briefing this sitting: opened it, closed it, or
 *  said nothing yet (the threshold decides). */
export type BriefingChoice = 'open' | 'dismissed' | null

/** Whether the briefing renders. The author's word wins in both directions;
 *  the threshold speaks only when they have said nothing. A story with no
 *  accepted scene has nowhere to have left off and shows nothing. */
export function briefingVisible(b: BriefingResponse | null, now: number, choice: BriefingChoice): boolean {
  if (!b || !b.git || !b.lastAccepted) return false
  if (choice) return choice === 'open'
  const at = Date.parse(b.lastAccepted.acceptedAt)
  if (Number.isNaN(at)) return false
  return now - at > BRIEFING_THRESHOLD_HOURS * 3600 * 1000
}

export interface BriefingSection { key: 'left-off' | 'in-flight' | 'due'; title: string }

/** The three sections, in order. There is no fourth. */
export const SECTIONS: readonly BriefingSection[] = [
  { key: 'left-off', title: 'Where you left off' },
  { key: 'in-flight', title: "What's in flight" },
  { key: 'due', title: "What's due" },
]

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export interface BriefingLink {
  kind: 'draft' | 'routes' | 'notes' | 'material'
  label: string
  /** the scene the link lands on; null when the surface is another page */
  scene: string | null
  /** the note to focus, for the notes link */
  note?: string
}

/** 'Ready for you' — one entry per non-empty store, each naming where it
 *  leads: the first draft scene, the first scene with routes, the first open
 *  note. Material has no scene; it lives on the Thoughts page. */
export function readyLinks(b: BriefingResponse): BriefingLink[] {
  const out: BriefingLink[] = []
  const draft = b.draft.filter(d => d.status !== 'deleted')
  if (draft.length) out.push({ kind: 'draft', label: plural(draft.length, 'draft scene'), scene: draft[0].scene })
  const routeScenes = Object.keys(b.routes).sort()
  const routes = routeScenes.reduce((n, s) => n + b.routes[s], 0)
  if (routes) {
    out.push({
      kind: 'routes',
      label: routeScenes.length === 1 ? `${plural(routes, 'route')} on ${routeScenes[0]}` : `${plural(routes, 'route')} on ${plural(routeScenes.length, 'scene')}`,
      scene: routeScenes[0],
    })
  }
  if (b.notes.length) out.push({ kind: 'notes', label: plural(b.notes.length, 'open note'), scene: b.notes[0].scene, note: b.notes[0].id })
  if (b.unplaced) out.push({ kind: 'material', label: `${b.unplaced} unplaced`, scene: null })
  return out
}

/** How long ago, in the author's terms — a day is what matters at this
 *  scale, never a minute. */
export function awayLabel(acceptedAt: string, now: number): string {
  const at = Date.parse(acceptedAt)
  if (Number.isNaN(at)) return ''
  const days = Math.floor((now - at) / (24 * 3600 * 1000))
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

/** The chapter, as the manuscript header names it. */
export function chapterLabel(id: string, chapters: Chapter[]): string {
  const ch = chapters.find(c => c.id === id)
  if (!ch) return id
  return `${ch.order === 0 ? 'Prologue' : `Chapter ${ch.order}`} — ${ch.title}`
}

export interface DueRow { id: string; body: string; state: string }

/** Obligations in the window, with their class in words. The class is
 *  proven (the obligation report's), the words are the author's register. */
export function dueRows(due: BriefingResponse['due']): DueRow[] {
  if (!due) return []
  const words = { unowned: 'nothing claims it yet', unwritten: 'claimed, not yet written', overdue: 'overdue' } as const
  return due.map(d => ({ id: d.id, body: d.body, state: words[d.klass] }))
}

/** How many due rows the briefing shows before folding the rest into a count. */
export const DUE_SHOWN = 5

// The dismissal is session-scoped, like the mode (A16): closing the
// briefing is a stance taken on this sitting, not a standing preference.
const BRIEFING_KEY = 'arc.manuscript.briefing'

export function readBriefingDismissed(): boolean {
  try { return sessionStorage.getItem(BRIEFING_KEY) === 'dismissed' } catch { return false }
}
export function writeBriefingDismissed(): void {
  try { sessionStorage.setItem(BRIEFING_KEY, 'dismissed') } catch { /* preference is a nicety */ }
}
