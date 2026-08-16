// The HTTP client — every request the viewer makes, typed against the
// shared wire contract (arc-canon-graph/api-types.ts).
//
// Loaders are strict: they THROW on failure instead of swallowing errors
// into empty values. The decision to degrade (render an empty wiki, show a
// banner) belongs to the caller — useServerData — not here, so a down
// backend can no longer masquerade as an empty story.
import type {
  AnalyzeResponse, AnnotationsResponse, ApiErrorResponse, AttentionResponse, DocsResponse, DraftSceneResponse, LocksResponse, MaterialResponse,
  AddNoteRequest, AgentsResponse, DeleteNoteRequest, HealthResponse, NoteResponse, NotesResponse, OkResponse,
  RunsResponse, RunDetailResponse,
  UpdateMaterialRequest, UpdateMaterialResponse, UpdateNoteRequest,
  WorkDecisionRequest, WorkDecisionResponse, WorkNoteRequest, WorkResponse,
  ProseAcceptResponse, ProseResponse, RatifyRuleRequest, RatifyRuleResponse, StyleResponse,
} from 'arc-canon-graph'
import type { Canon, DocArticle, MaterialItem, ProseDraft, ProseScene, ResolvedAnnotation, ResolvedLock, SuggestRequest, SuggestResponse } from './canon'
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

/** Annotations (conventions §14): the author's notes with their anchors
 *  resolved against the prose as it stands. */
export const loadAnnotations = (signal?: AbortSignal): Promise<ResolvedAnnotation[]> =>
  getJson<AnnotationsResponse>('/api/annotations', { signal }).then(r => r.annotations)

/** Omit paragraph and quote for a note about the whole scene (§14). */
export const createNote = (n: { scene: string; paragraph?: number; quote?: string; body: string; kind?: 'note' | 'keypoint'; by?: 'author' | 'agent' }): Promise<ResolvedAnnotation> =>
  post('/api/annotations', n)

/** Keypoints only — the server refuses to delete a note. */
export const deleteAnnotation = (id: string): Promise<{ ok: true }> =>
  post('/api/annotations/delete', { id })

/** Locks (A29): settled prose. The write path enforces them; these calls
 *  only report and edit the records. */
export const loadLocks = (signal?: AbortSignal): Promise<ResolvedLock[]> =>
  getJson<LocksResponse>('/api/locks', { signal }).then(r => r.locks)

export const createLock = (l: { scene: string; paragraph: number; quote: string }): Promise<{ lock: ResolvedLock }> =>
  post('/api/locks', l)

export const deleteLock = (id: string): Promise<{ ok: true }> =>
  post('/api/locks/delete', { id })

/** Change a note's status, its body, or both. The anchor is never sent —
 *  revising a thought is not re-anchoring it. */
export const updateNote = (id: string, patch: { status?: string; body?: string }): Promise<ResolvedAnnotation> =>
  post('/api/annotations/update', { id, ...patch })

/** Accept one paragraph, leaving every other pending change alone. */
export const acceptParagraph = (file: string, paragraph: number): Promise<{ hash: string; file: string }> =>
  post('/api/prose/accept-paragraph', { file, paragraph })

/** Write a scene's body into the working tree — the draft layer. `baseline`
 *  is the body the edit started from; the server refuses if the file moved
 *  underneath, which is how a clobber is told apart from an edit. */
export const writeScene = (file: string, body: string, baseline?: string): Promise<ProseScene> =>
  post('/api/prose/scene', { file, body, baseline })

/** Selection suggestions: rephrase against the author's own contract, or
 *  synonyms with nuance. Argued register — never applied without a click. */
export const suggestText = (req: SuggestRequest): Promise<SuggestResponse> =>
  post('/api/prose/suggest', req)

/** The style contract (conventions §10): both layers as they are on disk,
 *  plus the queue of rules arc has argued for and you have not ratified. */
export const loadStyle = (signal?: AbortSignal): Promise<StyleResponse> =>
  getJson<StyleResponse>('/api/style', { signal })

/** Ratify a proposed rule into a layer, or dismiss it. The author's click is
 *  the gate: no model runs on the far side of this call. */
export const ratifyRule = (req: RatifyRuleRequest): Promise<RatifyRuleResponse> =>
  post('/api/style/proposed', req)

/** Is the story valid, and is there an engine to run passes with? */
export const loadHealth = (signal?: AbortSignal): Promise<HealthResponse> =>
  getJson<HealthResponse>('/api/health', { signal })

/** Who is working on the story right now, and the runs they opened. Both are
 *  one-shot reads; the SSE stream says WHEN to re-read them. */
export const loadAgents = (signal?: AbortSignal): Promise<AgentsResponse> =>
  getJson<AgentsResponse>('/api/agents', { signal })

export const loadRuns = (signal?: AbortSignal): Promise<RunsResponse> =>
  getJson<RunsResponse>('/api/runs', { signal })

export const loadRun = (id: string, signal?: AbortSignal): Promise<RunDetailResponse> =>
  getJson<RunDetailResponse>(`/api/runs/${encodeURIComponent(id)}`, { signal })

/** Notes: whatever you wanted written down.
 *
 *  Filing is a WRITE — no model runs, nothing waits, and no engine is needed.
 *  Turning a note into story material is a separate act you ask for. */
export const loadNotes = (signal?: AbortSignal): Promise<NotesResponse> =>
  getJson<NotesResponse>('/api/notes', { signal })

export const addNote = (req: AddNoteRequest): Promise<NoteResponse> =>
  post('/api/notes', req)

export const reviseNote = (req: UpdateNoteRequest): Promise<NoteResponse> =>
  post('/api/notes/update', req)

export const removeNote = (req: DeleteNoteRequest): Promise<OkResponse> =>
  post('/api/notes/delete', req)

/** Run the work graph over one note. A failure here leaves the note as it was. */
export const workNote = (req: WorkNoteRequest): Promise<WorkResponse> =>
  post('/api/notes/work', req)

/** Keep what the run filed, or discard it. Either answer writes a receipt. */
export const decideWork = (req: WorkDecisionRequest): Promise<WorkDecisionResponse> =>
  post('/api/notes/work/decide', req)

/** Correct a filed thought, or move it along its lifecycle. */
export const updateMaterial = (req: UpdateMaterialRequest): Promise<UpdateMaterialResponse> =>
  post('/api/material/update', req)

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

/** The analysis pass: what would the pending draft do to the story? Slow
 *  (a full model read) and read-only — findings are argued, never proven. */
export const analyzeDraft = (): Promise<AnalyzeResponse> =>
  post('/api/prose/analyze', {})

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
