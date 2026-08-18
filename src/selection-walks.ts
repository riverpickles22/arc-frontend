// Selection walks (A23-2): what the timeline says about a selected entity.
// Pure functions over canon — appearances, the events that materially
// changed an entity, an object's provenance — so the questions stay
// testable away from React. The overlay renders only what a walk returns.
import type { Canon, Entity, ProseScene, TimeRef } from './canon'
import { dateOf } from './canon'
import { eventEntities, withinPlace } from './graph-focus'

const readingOrder = (canon: Canon) =>
  [...(canon.chapters ?? [])].sort((a, b) => a.order - b.order)

/** Chapter ids, in reading order, where the entity appears: as POV, as a
 *  listed location (places, including part_of descent), through an event's
 *  cast/witnesses/stage, or bound as a scene fact. The chapter branch of
 *  focusSet inverted — same event-unpacking, asked from the entity's side. */
export function appearances(canon: Canon, id: string, scenes: ProseScene[] = []): string[] {
  const sel = canon.entities[id]
  if (!sel) return []
  const isPlace = sel.type === 'place'
  const touches = (eid: string): boolean => {
    const ev = canon.events[eid]
    if (!ev) return false
    if (eventEntities(ev).includes(id)) return true
    return isPlace && !!ev.where && withinPlace(ev.where, id, canon)
  }
  return readingOrder(canon)
    .filter(c =>
      c.pov === id
      || (isPlace && (c.locations ?? []).some(loc => withinPlace(loc, id, canon)))
      || (c.events ?? []).some(touches)
      || scenes.some(s => s.chapter === c.id
        && (s.pov === id || s.facts.includes(id) || s.events.some(touches))))
    .map(c => c.id)
}

/** The chapter (id) that holds an event, in its own events list or through
 *  one of its scenes — null when no chapter stages it. */
export function chapterOf(canon: Canon, eventId: string, scenes: ProseScene[] = []): string | null {
  for (const c of readingOrder(canon)) {
    if ((c.events ?? []).includes(eventId)) return c.id
    if (scenes.some(s => s.chapter === c.id && s.events.includes(eventId))) return c.id
  }
  return null
}

interface ChangeMark {
  event: string
  chapter: string | null
}

/** The events that materially changed the entity — every event its states
 *  name as caused_by, in state order, each resolved to the chapter that
 *  stages it. Only events canon actually holds. */
export function changedBy(canon: Canon, id: string, scenes: ProseScene[] = []): ChangeMark[] {
  const sel = canon.entities[id]
  if (!sel) return []
  const seen = new Set<string>()
  const out: ChangeMark[] = []
  for (const st of sel.states ?? []) {
    for (const eid of st.caused_by ?? []) {
      if (seen.has(eid) || !canon.events[eid]) continue
      seen.add(eid)
      out.push({ event: eid, chapter: chapterOf(canon, eid, scenes) })
    }
  }
  return out
}

interface ProvenanceStep {
  at: TimeRef
  /** Words from the state — condition, note, or holder/place — never a number. */
  label: string
  chapter: string | null
  events: string[]
}

/** An object's provenance — its states as a sequence: created, carried,
 *  hidden, rediscovered. Each step keeps the words the state offers and the
 *  chapter (via caused_by) where the change happens on the page. */
export function provenance(canon: Canon, id: string, scenes: ProseScene[] = []): ProvenanceStep[] {
  const sel = canon.entities[id]
  if (sel?.type !== 'object') return []
  return (sel.states ?? []).map(st => {
    const events = (st.caused_by ?? []).filter(e => canon.events[e])
    const holder = st.controlled_by ? canon.entities[st.controlled_by]?.name ?? st.controlled_by : null
    const place = st.location ? canon.entities[st.location]?.name ?? st.location : null
    return {
      at: st.at,
      label: st.condition ?? st.note
        ?? [holder && `held by ${holder}`, place && `at ${place}`].filter(Boolean).join(', '),
      chapter: events.map(e => chapterOf(canon, e, scenes)).find(c => c != null) ?? null,
      events,
    }
  })
}

/** Chapters between an entity's first and last appearance where it does not
 *  appear — the off-page stretches, in reading order. */
export function offPage(canon: Canon, appears: string[]): string[] {
  const chapters = readingOrder(canon)
  const ixs = appears.map(id => chapters.findIndex(c => c.id === id)).filter(i => i >= 0)
  if (ixs.length < 2) return []
  const inSet = new Set(appears)
  return chapters
    .slice(Math.min(...ixs) + 1, Math.max(...ixs))
    .filter(c => !inSet.has(c.id))
    .map(c => c.id)
}

export interface TimelineOverlay {
  id: string
  type: Entity['type']
  /** Border and style carry status (the epic's rule) — colour never does. */
  proposed: boolean
  appears: string[]
  offPage: string[]
  changed: ChangeMark[]
  /** Objects only — the provenance chain, in state order. */
  steps: ProvenanceStep[]
  /** Characters only — born/died dates for the lifespan hairline. */
  lifespan: { start?: string; end?: string } | null
}

/** Everything the timeline overlays for a selection, or null when there is
 *  nothing to say — a null overlay renders both bands exactly as today. */
export function timelineOverlay(canon: Canon, id: string | null, scenes: ProseScene[] = []): TimelineOverlay | null {
  const sel = id ? canon.entities[id] : undefined
  if (!sel || !id) return null
  const appears = appearances(canon, id, scenes)
  const changed = changedBy(canon, id, scenes)
  const steps = provenance(canon, id, scenes)
  if (!appears.length && !changed.length && !steps.length) return null
  const start = dateOf(sel.born ?? sel.span?.start) ?? undefined
  const end = dateOf(sel.died ?? sel.span?.end) ?? undefined
  return {
    id,
    type: sel.type,
    proposed: sel.status === 'proposed',
    appears,
    offPage: sel.type === 'character' ? offPage(canon, appears) : [],
    changed,
    steps,
    lifespan: sel.type === 'character' && (start || end) ? { start, end } : null,
  }
}
