// Canon data contract + time-resolution helpers.
// Mirrors arc/schema/*.schema.json; the JSON comes from tools/export-canon.py.
//
// The HTTP wire types (prose, docs, draft, chat) live in arc-canon-graph
// (graph/api-types.ts) — one source of truth shared with arc-backend.
// Imported and re-exported here so component imports stay unchanged.

import type { TimeRef, DateLike } from 'arc-canon-graph'
export type {
  TimeRef, DateLike, DocArticle, SceneContract, ProseScene, ProseChange, ProseDraft,
  ChatMessage, ChatAction, ChatResponse, DraftSceneResponse, AnalyzeResponse, StyleResponse, ResolvedAnnotation, AnnotationLike, AnchorResolution, ApiErrorResponse, AttentionResponse, MaterialItem,
} from 'arc-canon-graph'

export interface SubjRel { toward: string; stance: string }

export interface State {
  at: TimeRef
  caused_by?: string[]
  age?: number
  location?: string
  condition?: string
  psychology?: string
  beliefs?: string[]
  wants?: string[]
  fears?: string[]
  relationships?: SubjRel[]
  possessions?: string[]
  controlled_by?: string
  note?: string
}

/** What kind of fact a record is (conventions §13). Absent = fictional. */
export interface Provenance {
  register: 'fictional' | 'historical' | 'inferred'
  sources?: string[]
  confidence?: 'high' | 'medium' | 'low'
  note?: string
}

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
  provenance?: Provenance
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
  provenance?: Provenance
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

import { dk, dateOf, diffCharacter, eraSpanKeys, timeRefKey, stateAt, extantAt } from 'arc-canon-graph'
export { dk, dateOf, diffCharacter, eraSpanKeys, timeRefKey, stateAt, extantAt }
export type { CharacterDiff } from 'arc-canon-graph'

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

/** Display name for any id, falling back to the id itself. */
export const nameOf = (canon: Canon, id: string): string => canon.entities[id]?.name ?? id

/** The year of a date string, via the shared date rule — not slice(0, 4). */
export const yearOf = (date: string): number => Math.floor(dk(date) / 10000)
