// Graph focus modes: which entities stay lit. Dimming over re-layout — the
// force simulation never moves; a mode only derives the kept set that
// GraphView's dimTo prop already understands (the POV toggle's mechanism).
import type { Canon, Chapter, ProseScene } from './canon'

export type FocusMode = 'all' | 'chapter' | 'selection'

export const FOCUS_MODES: { mode: FocusMode; label: string; title: string }[] = [
  { mode: 'chapter', label: 'Chapter', title: 'Only what the current chapter touches — its events’ cast, its places, its POV, its scenes’ bindings' },
  { mode: 'selection', label: 'Selection', title: 'The selected node and its direct neighbors' },
  { mode: 'all', label: 'All', title: 'Everything' },
]

/** The kept set for a mode, or null for "dim nothing". Entity ids only —
 *  the graph draws entities; events contribute their cast and location. */
export function focusSet(
  mode: FocusMode,
  canon: Canon,
  chapter: Chapter | undefined,
  scenes: ProseScene[],
  selected: string | null,
): Set<string> | null {
  if (mode === 'chapter') {
    if (!chapter) return null
    const keep = new Set<string>()
    const addEvent = (id: string) => {
      const ev = canon.events[id]
      if (!ev) return
      for (const p of ev.participants ?? []) keep.add(p.entity)
      for (const w of ev.witnesses ?? []) keep.add(w)
      if (ev.where) keep.add(ev.where)
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
    if (!selected || !canon.entities[selected]) return null
    const keep = new Set<string>([selected])
    for (const r of canon.relationships) {
      if (r.from === selected) keep.add(r.to)
      if (r.to === selected) keep.add(r.from)
    }
    for (const e of Object.values(canon.entities)) {
      if (e.id === selected && e.part_of) keep.add(e.part_of)
      if (e.part_of === selected) keep.add(e.id)
    }
    return keep
  }
  return null
}
