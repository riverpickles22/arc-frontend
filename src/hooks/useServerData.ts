// All server state in one hook: the canon graph plus the secondary
// resources, fetched together on mount (abortable, so StrictMode's double
// invoke doesn't double-hit the backend).
//
// Error model: canon is load-bearing — its failure surfaces as a retryable
// error screen, and the error CLEARS on a later success. The secondary
// resources degrade instead: they keep their empty fallbacks but the
// failure is recorded, so a down backend shows a banner rather than
// masquerading as an empty story.
import { useCallback, useEffect, useState } from 'react'
import type { AttentionResponse, Canon, DocArticle, MaterialItem, Note, ProseDraft, ProseScene, ResolvedAnnotation, StyleResponse } from '../canon'
import type { View } from '../presentation'
import { loadAnnotations, loadAttention, loadCanon, loadDocs, loadDraft, loadHealth, loadMaterial, loadNotes, loadProse, loadStyle, loadView, NO_DRAFT } from '../api'

export interface ServerData {
  canon: Canon | null
  canonError: string | null
  retry: () => void
  view: View
  style: StyleResponse | null
  notes: ResolvedAnnotation[]
  docs: DocArticle[]
  prose: ProseScene[]
  draft: ProseDraft
  attention: AttentionResponse | null
  material: MaterialItem[]
  degraded: string[]
  refreshCanon: () => void
  refreshNotes: () => void
  refreshProse: () => void
  refreshStyle: () => void
  refreshMaterial: () => void
  /** The author's notebook — whatever they wrote down. */
  thoughts: Note[]
  /** Which engine is live, or null when none is. */
  engine: 'sdk' | 'claude-cli' | null
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useServerData(): ServerData {
  const [canon, setCanon] = useState<Canon | null>(null)
  const [canonError, setCanonError] = useState<string | null>(null)
  const [view, setView] = useState<View>({})
  const [style, setStyle] = useState<StyleResponse | null>(null)
  const [engine, setEngine] = useState<'sdk' | 'claude-cli' | null>(null)
  const [thoughts, setThoughts] = useState<Note[]>([])
  const [notes, setNotes] = useState<ResolvedAnnotation[]>([])
  const [docs, setDocs] = useState<DocArticle[]>([])
  const [prose, setProse] = useState<ProseScene[]>([])
  const [draft, setDraft] = useState<ProseDraft>(NO_DRAFT)
  const [attn, setAttn] = useState<AttentionResponse | null>(null)
  const [material, setMaterial] = useState<MaterialItem[]>([])
  const [degraded, setDegraded] = useState<string[]>([])

  const loadAll = useCallback(async (signal?: AbortSignal) => {
    const failures: string[] = []
    const secondary = async <T,>(label: string, load: (s?: AbortSignal) => Promise<T>, set: (v: T) => void) => {
      try {
        set(await load(signal))
      } catch {
        if (!signal?.aborted) failures.push(label)
      }
    }
    await Promise.all([
      loadCanon(signal)
        .then(c => { setCanon(c); setCanonError(null) })   // error clears on success
        .catch(e => { if (!signal?.aborted) setCanonError(message(e)) }),
      secondary('view', loadView, setView),
      secondary('style', loadStyle, setStyle),
      secondary('notes', loadAnnotations, setNotes),
      secondary('docs', loadDocs, setDocs),
      secondary('prose', loadProse, setProse),
      secondary('draft', loadDraft, setDraft),
      // attention/material failing is not a degradation — the chips hide
      loadAttention(signal).then(setAttn).catch(() => {}),
      loadMaterial(signal).then(setMaterial).catch(() => {}),
      // health failing is not a degradation either — the capture box simply
      // behaves as though no engine is present, which is the safe reading
      loadHealth(signal).then(h => setEngine(h.engine)).catch(() => {}),
      loadNotes(signal).then(r => setThoughts(r.notes)).catch(() => {}),
    ])
    if (!signal?.aborted) setDegraded(failures)
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount: every setState inside loadAll happens after an await, never synchronously
    void loadAll(ac.signal)
    return () => ac.abort()
  }, [loadAll])

  const retry = useCallback(() => { void loadAll() }, [loadAll])

  const refreshCanon = useCallback(() => {
    loadCanon()
      .then(c => { setCanon(c); setCanonError(null) })
      .catch(e => setCanonError(message(e)))
    loadAttention().then(setAttn).catch(() => {})
    loadMaterial().then(setMaterial).catch(() => {})
  }, [])

  // The contract and its proposal queue: both change when a rule is ratified.
  // The material layer changed — a dump was kept or dropped. Attention counts
  // it too, so both move together.
  const refreshMaterial = useCallback(() => {
    loadMaterial().then(setMaterial).catch(() => {})
    loadAttention().then(setAttn).catch(() => {})
  }, [])

  const refreshStyle = useCallback(() => { loadStyle().then(setStyle).catch(() => {}) }, [])

  // Prose and its draft state refresh together: accept/discard change both.
  const refreshNotes = useCallback(() => {
    loadAnnotations().then(setNotes).catch(() => {})
    loadNotes().then(r => setThoughts(r.notes)).catch(() => {})
  }, [])
  const refreshProse = useCallback(() => {
    loadProse().then(setProse).catch(() => setDegraded(d => (d.includes('prose') ? d : [...d, 'prose'])))
    loadDraft().then(setDraft).catch(() => setDegraded(d => (d.includes('draft') ? d : [...d, 'draft'])))
  }, [])

  return { canon, canonError, retry, view, style, notes, docs, prose, draft, attention: attn, material, degraded, refreshCanon, refreshProse, refreshNotes, refreshStyle, refreshMaterial, engine, thoughts }
}
