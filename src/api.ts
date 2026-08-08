// The HTTP client — every request the viewer makes, typed against the
// shared wire contract (arc-canon-graph/api-types.ts).
//
// Loaders are strict: they THROW on failure instead of swallowing errors
// into empty values. The decision to degrade (render an empty wiki, show a
// banner) belongs to the caller — useServerData — not here, so a down
// backend can no longer masquerade as an empty story.
import type {
  ApiErrorResponse, AttentionResponse, DocsResponse, DraftSceneResponse, MaterialResponse,
  ProseAcceptResponse, ProseResponse,
} from 'arc-canon-graph'
import type { Canon, DocArticle, MaterialItem, ProseDraft, ProseScene } from './canon'
import type { View } from './presentation'
import type { GeoJSON } from './map-geometry'

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  if (!res.ok) {
    const body: Partial<ApiErrorResponse> = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `${path}: ${res.status}`)
  }
  return res.json()
}

// The canon graph is served by arc-backend, which generates it from the
// story's YAML on demand — it is not a build artifact in this repo.
export async function loadCanon(signal?: AbortSignal): Promise<Canon> {
  const res = await fetch('/api/canon', { signal })
  if (!res.ok) {
    const body: Partial<ApiErrorResponse> = await res.json().catch(() => ({}))
    throw new Error(
      body.error ?? `/api/canon: ${res.status}. Is arc-backend running? (cd ../arc-backend && npm run dev)`,
    )
  }
  return res.json()
}

/** The story encyclopedia: docs/ articles with their canon bindings. */
export const loadDocs = (signal?: AbortSignal): Promise<DocArticle[]> =>
  getJson<DocsResponse>('/api/docs', { signal }).then(r => r.articles)

/** The manuscript: bound prose scenes (conventions §10). */
export const loadProse = (signal?: AbortSignal): Promise<ProseScene[]> =>
  getJson<ProseResponse>('/api/prose', { signal }).then(r => r.scenes)

/** The attention inbox: checks findings, proposals, unfired payoffs. */
export const loadAttention = (signal?: AbortSignal): Promise<AttentionResponse> =>
  getJson<AttentionResponse>('/api/attention', { signal })

/** Story material: the unplaced layer (conventions §12). */
export const loadMaterial = (signal?: AbortSignal): Promise<MaterialItem[]> =>
  getJson<MaterialResponse>('/api/material', { signal }).then(r => r.items)

/** view.yaml from the story repo. A story without one renders from canon alone. */
export const loadView = (signal?: AbortSignal): Promise<View> =>
  getJson<View>('/api/view', { signal })

// ---- the draft layer ---------------------------------------------------
// Main is the story repo's HEAD; the draft is the working tree. Accept
// ratifies (a prose-scoped git commit); discard rolls a file back.

export const NO_DRAFT: ProseDraft = { git: false, changes: [], history: [] }

export const loadDraft = (signal?: AbortSignal): Promise<ProseDraft> =>
  getJson<ProseDraft>('/api/prose/draft', { signal })

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const out = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((out as Partial<ApiErrorResponse>).error ?? res.statusText)
  return out as T
}

export const acceptDraft = (message?: string): Promise<ProseAcceptResponse> =>
  post('/api/prose/accept', { message, capture: true })   // capture runs when the backend has credentials

export const discardDraft = (file: string): Promise<void> =>
  post('/api/prose/discard', { file })

/** The drafting pass: generate one scene into the working tree. Slow (a
 *  full model pass); the result arrives as an ordinary draft change. */
export const draftScene = (chapter: string, guidance?: string): Promise<DraftSceneResponse> =>
  post('/api/prose/draft-scene', { chapter, guidance })

/** A story's basemap, served from its assets/. Absent is fine — a story
 *  without one still draws its markers, so a miss stays null by design. */
export async function loadBasemap(name?: string): Promise<GeoJSON | null> {
  if (!name) return null
  try {
    const res = await fetch(`/api/assets/${encodeURIComponent(name)}`)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}
