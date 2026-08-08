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
    genre?: string; setting?: string
  }
  timeline: { eras: Era[]; anchors?: { id: string; date: string; label: string; approximate?: boolean }[] }
  entities: Record<string, Entity>
  events: Record<string, EventDoc>
  relationships: Edge[]
  chapters: Chapter[]
}

// ---- time helpers ------------------------------------------------------
//
// The date-ordering rule and temporal resolution live in arc-canon-graph
// (arc-core/graph) — the single implementation shared with the validator via
// graph/date-vectors.json. This file re-exports them so existing imports
// keep working; do not reimplement dk() here.

import { dk, dateOf, eraSpanKeys, timeRefKey, stateAt, extantAt } from 'arc-canon-graph'
export { dk, dateOf, eraSpanKeys, timeRefKey, stateAt, extantAt }

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

// ---- presentation ------------------------------------------------------
//
// Everything below answers "how is this story drawn", not "what is true about
// it". Where the answer can be derived from canon it is derived, so a story
// needs no configuration to render; view.yaml only carries the editorial
// choices canon can't imply.

export interface BBox { lon0: number; lon1: number; lat0: number; lat1: number }

export interface View {
  map?: {
    basemap?: string
    inset?: BBox & { label: string }
  }
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

/** Pad a bbox by a fraction of its own size so content isn't flush to the edge. */
function pad(b: BBox, frac = 0.04): BBox {
  const dx = (b.lon1 - b.lon0) * frac
  const dy = (b.lat1 - b.lat0) * frac
  return { lon0: b.lon0 - dx, lon1: b.lon1 + dx, lat0: b.lat0 - dy, lat1: b.lat1 + dy }
}

/**
 * The area the map should cover: everything being drawn — the basemap
 * geometry if there is one, plus every place that has coordinates. Fitting to
 * places alone would crop a coastline that extends past them.
 */
export function fitBBox(
  entities: Record<string, Entity>,
  coords: [number, number][] = [],
): BBox | undefined {
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  for (const e of Object.values(entities)) {
    if (e.coordinates) { lons.push(e.coordinates.lon); lats.push(e.coordinates.lat) }
  }
  if (!lons.length) return undefined
  const b = { lon0: Math.min(...lons), lon1: Math.max(...lons), lat0: Math.min(...lats), lat1: Math.max(...lats) }
  // A single point, or a perfectly flat extent, has no scale to pad — give it one.
  if (b.lon1 - b.lon0 < 0.01) { b.lon0 -= 0.25; b.lon1 += 0.25 }
  if (b.lat1 - b.lat0 < 0.01) { b.lat0 -= 0.25; b.lat1 += 0.25 }
  return reshape(pad(b))
}

// Keep the drawn map within a sane aspect range. A story with one place, or
// places strung along a single axis, otherwise yields an extreme viewport —
// and at high latitude the cos correction makes a square degree box tall.
// We widen the *area shown* rather than scaling the projection, so degrees
// stay square and nothing is distorted; you just see more sea.
const MIN_RATIO = 0.3
const MAX_RATIO = 0.85

function reshape(b: BBox): BBox {
  const cos = Math.cos((((b.lat0 + b.lat1) / 2) * Math.PI) / 180) || 1
  const dLon = b.lon1 - b.lon0
  const dLat = b.lat1 - b.lat0
  const ratio = dLat / (dLon * cos)

  if (ratio > MAX_RATIO) {
    const want = dLat / (MAX_RATIO * cos)
    const grow = (want - dLon) / 2
    return { ...b, lon0: b.lon0 - grow, lon1: b.lon1 + grow }
  }
  if (ratio < MIN_RATIO) {
    const want = MIN_RATIO * dLon * cos
    const grow = (want - dLat) / 2
    return { ...b, lat0: b.lat0 - grow, lat1: b.lat1 + grow }
  }
  return b
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

export interface DocArticle { path: string; canon: string | null; body: string }

/** The scene's stated intent (conventions §10) — what it must accomplish. */
export interface SceneContract {
  purpose?: string; reader_before?: string; reader_after?: string
  wants?: Record<string, string>
  must_establish?: string[]; must_withhold?: string[]; motifs?: string[]
  constraints?: string
}

export interface ProseScene {
  scene: string; chapter: string; status: string
  pov: string | null; events: string[]; facts: string[]
  contract: SceneContract | null
  file: string; body: string
}

/** The story encyclopedia: docs/ articles with their canon bindings. */
export async function loadDocs(): Promise<DocArticle[]> {
  try {
    const res = await fetch('/api/docs')
    return res.ok ? (await res.json()).articles : []
  } catch { return [] }
}

/** The manuscript: bound prose scenes (conventions §10). */
export async function loadProse(): Promise<ProseScene[]> {
  try {
    const res = await fetch('/api/prose')
    return res.ok ? (await res.json()).scenes : []
  } catch { return [] }
}

// ---- the draft layer ---------------------------------------------------
// Main is the story repo's HEAD; the draft is the working tree. Accept
// ratifies (a prose-scoped git commit); discard rolls a file back.

export interface ProseChange {
  file: string
  status: 'added' | 'modified' | 'deleted'
  main: ProseScene | null
}
export interface ProseDraft {
  git: boolean
  changes: ProseChange[]
  history: { hash: string; date: string; subject: string }[]
}

export const NO_DRAFT: ProseDraft = { git: false, changes: [], history: [] }

export async function loadDraft(): Promise<ProseDraft> {
  try {
    const res = await fetch('/api/prose/draft')
    return res.ok ? await res.json() : NO_DRAFT
  } catch { return NO_DRAFT }
}

async function post(path: string, body: unknown): Promise<any> {
  const res = await fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(out.error ?? res.statusText)
  return out
}

export const acceptDraft = (message?: string): Promise<{ hash: string; files: string[] }> =>
  post('/api/prose/accept', { message })

export const discardDraft = (file: string): Promise<void> =>
  post('/api/prose/discard', { file })

/** view.yaml from the story repo. A story without one renders from canon alone. */
export async function loadView(): Promise<View> {
  try {
    const res = await fetch('/api/view')
    return res.ok ? await res.json() : {}
  } catch {
    return {}
  }
}

/** A story's basemap, served from its assets/. Absent is fine — markers still draw. */
export async function loadBasemap(name?: string): Promise<GeoJSON | null> {
  if (!name) return null
  try {
    const res = await fetch(`/api/assets/${encodeURIComponent(name)}`)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

export interface GeoJSON {
  features: { geometry: { type: string; coordinates: number[][][] | number[][][][] } }[]
}

/** Every [lon, lat] in a geojson, flattened — used to fit the map to the land. */
export function geoCoords(geo: GeoJSON | null): [number, number][] {
  if (!geo) return []
  const out: [number, number][] = []
  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      out.push([c[0], c[1]])
    } else if (Array.isArray(c)) {
      for (const v of c) walk(v)
    }
  }
  for (const f of geo.features) walk(f.geometry.coordinates)
  return out
}
