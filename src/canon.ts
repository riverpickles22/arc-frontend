// Canon data contract + time-resolution helpers.
// Mirrors arc/schema/*.schema.json; the JSON comes from tools/export-canon.py.

export interface TimeRef {
  era: string
  date?: string
  precision?: string
  approximate?: boolean
  timepoint?: string
  note?: string
}

export interface SubjRel { toward: string; stance: string }

export interface State {
  at: TimeRef
  caused_by?: string[]
  age?: number
  location?: string
  condition?: string
  psychology?: string
  beliefs?: string[]
  relationships?: SubjRel[]
  possessions?: string[]
  controlled_by?: string
  note?: string
}

export type DateLike = string | { date?: string; era?: string; note?: string; approximate?: boolean }

export interface Entity {
  id: string
  type: 'character' | 'place' | 'faction' | 'object'
  name: string
  aliases?: string[]
  kind?: string
  species?: string
  status: string
  summary: string
  appearance?: string
  voice?: string
  sensory?: string
  significance?: string
  narrative_notes?: string
  part_of?: string
  real?: boolean
  coordinates?: { lat: number; lon: number; approximate?: boolean }
  born?: DateLike
  died?: DateLike
  created?: DateLike
  destroyed?: DateLike
  span?: { start?: DateLike; end?: DateLike }
  goals?: string[]
  tags?: string[]
  grounding?: string[]
  states?: State[]
}

export interface EventDoc {
  id: string
  scope: 'story' | 'historical' | 'both'
  status: string
  title: string
  when: TimeRef
  where?: string
  participants?: { entity: string; role: string }[]
  witnesses?: string[]
  causes?: string[]
  leads_to?: string[]
  summary: string
  narrative_notes?: string
  on_page?: boolean
  grounding?: string[]
}

export interface Edge {
  id: string
  kind: string
  status: string
  from: string
  to: string
  directed: boolean
  span?: { start?: DateLike; end?: DateLike }
  summary: string
}

export interface Era {
  id: string
  name: string
  span: { start?: DateLike; end?: DateLike }
  mood?: string
  notes?: string
}

export interface Chapter {
  id: string
  type: 'chapter'
  order: number
  title: string
  part?: string
  status: string
  span: { start?: DateLike; end?: DateLike }
  era?: string
  pov?: string
  summary: string
  events?: string[]
  locations?: string[]
  notes?: string
}

export interface Canon {
  story: {
    slug: string; title: string; logline: string; themes: string[]
    protagonists: string[]; pov?: string; status: string
  }
  timeline: { eras: Era[]; anchors?: { id: string; date: string; label: string; approximate?: boolean }[] }
  entities: Record<string, Entity>
  events: Record<string, EventDoc>
  relationships: Edge[]
  chapters: Chapter[]
}

// ---- time helpers ------------------------------------------------------

export const dateOf = (v?: DateLike): string | undefined =>
  typeof v === 'string' ? v : v?.date

/** Numeric key yyyymmdd; missing parts snap to start (or end) of the period. */
export function dk(date: string, end = false): number {
  const p = date.split('-').map(Number)
  const [y, m, d] = [p[0], p[1] ?? (end ? 12 : 1), p[2] ?? (end ? 31 : 1)]
  return y * 10000 + m * 100 + d
}

export function eraSpanKeys(era: Era): [number, number] {
  const s = dateOf(era.span.start)
  const e = dateOf(era.span.end)
  return [s ? dk(s) : 0, e ? dk(e, true) : 99999999]
}

/** Effective date key of a timeref: its date, else its era's start. */
export function timeRefKey(at: TimeRef, eras: Era[]): number {
  if (at.date) return dk(at.date)
  const era = eras.find(e => e.id === at.era)
  return era ? eraSpanKeys(era)[0] : 0
}

/** Latest state whose effective time <= T (T = end-of-year key). */
export function stateAt(entity: Entity, tEnd: number, eras: Era[]): State | undefined {
  const states = (entity.states ?? [])
    .map(s => ({ s, k: timeRefKey(s.at, eras) }))
    .filter(x => x.k <= tEnd)
    .sort((a, b) => a.k - b.k)
  return states.at(-1)?.s
}

/** Is the entity extant (born/created and not yet dead/ended) at year-end T? */
export function extantAt(entity: Entity, tEnd: number): boolean {
  const start = dateOf(entity.born) ?? dateOf(entity.created) ?? dateOf(entity.span?.start)
  const stop = dateOf(entity.died) ?? dateOf(entity.destroyed) ?? dateOf(entity.span?.end)
  if (start && dk(start) > tEnd) return false
  if (stop && dk(stop, true) < tEnd) return false
  return true
}

/** Resolve a place id to coordinates, walking part_of up the hierarchy. */
export function resolveCoords(
  placeId: string | undefined,
  entities: Record<string, Entity>,
): { lat: number; lon: number } | undefined {
  let cur = placeId ? entities[placeId] : undefined
  while (cur) {
    if (cur.coordinates) return cur.coordinates
    cur = cur.part_of ? entities[cur.part_of] : undefined
  }
  return undefined
}

export function eraAt(tEnd: number, eras: Era[]): Era | undefined {
  return eras.find(e => {
    const [s, en] = eraSpanKeys(e)
    return tEnd >= s && tEnd <= en
  })
}

export function yearRange(eras: Era[]): [number, number] {
  const keys = eras.flatMap(e => eraSpanKeys(e))
  return [Math.floor(Math.min(...keys) / 10000), Math.floor(Math.max(...keys.filter(k => k < 99999999)) / 10000)]
}

// The canon graph is served by arc-backend, which generates it from the
// story's YAML on demand — it is not a build artifact in this repo.
export async function loadCanon(): Promise<Canon> {
  const res = await fetch('/api/canon')
  if (!res.ok) {
    throw new Error(
      `/api/canon: ${res.status}. Is arc-backend running? (cd ../arc-backend && npm run dev)`
    )
  }
  return res.json()
}
