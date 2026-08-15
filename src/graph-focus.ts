// Graph focus modes: which entities stay lit. Dimming over re-layout — the
// force simulation never moves; a mode only derives the kept set that
// GraphView's dimTo prop already understands (the POV toggle's mechanism).
import type { Canon, Chapter, EventDoc, ProseScene } from './canon'
import { stateAt } from './canon'

export type FocusMode = 'all' | 'chapter' | 'selection'

export const FOCUS_MODES: { mode: FocusMode; label: string; title: string }[] = [
  { mode: 'chapter', label: 'Chapter', title: 'Only what the current chapter touches — its events’ cast, its places, its POV, its scenes’ bindings' },
  { mode: 'selection', label: 'Selection', title: 'The selected node and its direct neighbors' },
  { mode: 'all', label: 'All', title: 'Everything' },
]

/** The entities an event touches — its cast, its witnesses, its stage.
 *  Shared with the selection walks (selection-walks.ts), so "who was there"
 *  means the same thing on the graph and on the timeline. */
export function eventEntities(ev: EventDoc): string[] {
  return [
    ...(ev.participants ?? []).map(p => p.entity),
    ...(ev.witnesses ?? []),
    ...(ev.where ? [ev.where] : []),
  ]
}

/** Does `loc` sit inside `place` — the place itself, or a part_of descent
 *  into it? Bounded walk, so a part_of cycle in bad data cannot hang the UI. */
export function withinPlace(loc: string, place: string, canon: Canon): boolean {
  let cur: string | undefined = loc
  for (let hops = 0; cur && hops < 16; hops++) {
    if (cur === place) return true
    cur = canon.entities[cur]?.part_of
  }
  return false
}

/** The kept set for a mode, or null for "dim nothing". Entity ids only —
 *  the graph draws entities; a selected event contributes its cast and
 *  location, a selected place its occupants at T. */
export function focusSet(
  mode: FocusMode,
  canon: Canon,
  chapter: Chapter | undefined,
  scenes: ProseScene[],
  selected: string | null,
  tEnd: number,
): Set<string> | null {
  if (mode === 'chapter') {
    if (!chapter) return null
    const keep = new Set<string>()
    const addEvent = (id: string) => {
      const ev = canon.events[id]
      if (!ev) return
      for (const e of eventEntities(ev)) keep.add(e)
    }
    if (chapter.pov) keep.add(chapter.pov)
    for (const loc of chapter.locations ?? []) keep.add(loc)
    for (const id of chapter.events ?? []) addEvent(id)
    for (const s of scenes) {
      if (s.chapter !== chapter.id) continue
      if (s.pov) keep.add(s.pov)
      for (const id of s.events) addEvent(id)
      for (const id of s.facts) if (canon.entities[id]) keep.add(id)
    }
    return keep
  }
  if (mode === 'selection') {
    if (!selected) return null
    // A selected event keeps its cast and its stage — the graph draws
    // entities, so the event answers through the people and place it touched.
    const ev = canon.events[selected]
    if (ev) {
      const keep = new Set(eventEntities(ev))
      return keep.size ? keep : null
    }
    const sel = canon.entities[selected]
    if (!sel) return null
    const keep = new Set<string>([selected])
    for (const r of canon.relationships) {
      if (r.from === selected) keep.add(r.to)
      if (r.to === selected) keep.add(r.from)
    }
    for (const e of Object.values(canon.entities)) {
      if (e.id === selected && e.part_of) keep.add(e.part_of)
      if (e.part_of === selected) keep.add(e.id)
    }
    // A place also keeps whoever is standing in it at T — the same answer the
    // map gives, so the two surfaces agree about what "the café" means now.
    if (sel.type === 'place') {
      for (const c of Object.values(canon.entities)) {
        if (c.type !== 'character') continue
        const loc = stateAt(c, tEnd, canon.timeline.eras)?.location
        if (loc && withinPlace(loc, selected, canon)) keep.add(c.id)
      }
    }
    return keep
  }
  return null
}

// ---- selection-driven focus (A23-1) --------------------------------------
// Selection becomes the graph's default once anything is clicked, with All
// demoted to exploration — that alone dissolves the hairball. The machine is
// pure so the policy is testable away from React: a deliberate mode choice is
// pinned and never overridden by the next click; clearing the selection
// restores whatever mode the auto-switch displaced and unpins.

export interface FocusState {
  mode: FocusMode
  /** The mode the auto-switch displaced — restored when the selection clears. */
  prev: FocusMode
  /** A deliberate choice from the mode buttons. Pinned wins over auto. */
  pinned: boolean
}

export function initialFocus(hasSelection: boolean): FocusState {
  // A shared URL carries a selection someone already made — honour it.
  return hasSelection
    ? { mode: 'selection', prev: 'all', pinned: false }
    : { mode: 'all', prev: 'all', pinned: false }
}

/** An entity or event was selected. */
export function focusOnSelect(s: FocusState): FocusState {
  if (s.pinned || s.mode === 'selection') return s
  return { mode: 'selection', prev: s.mode, pinned: false }
}

/** The author clicked a mode button — an explicit statement, kept. */
export function focusOnMode(s: FocusState, mode: FocusMode): FocusState {
  return { mode, prev: s.prev, pinned: true }
}

/** The selection cleared. A pinned mode is the author's and survives;
 *  an auto-switched one gives way to the mode it displaced. */
export function focusOnClear(s: FocusState): FocusState {
  return { mode: s.pinned ? s.mode : s.prev, prev: s.prev, pinned: false }
}
