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
import type { Canon, DocArticle, ProseDraft, ProseScene } from '../canon'
import type { View } from '../presentation'
import { loadCanon, loadDocs, loadDraft, loadProse, loadView, NO_DRAFT } from '../api'

export interface ServerData {
  canon: Canon | null
  canonError: string | null
  retry: () => void
  view: View
  docs: DocArticle[]
  prose: ProseScene[]
  draft: ProseDraft
  degraded: string[]
  refreshCanon: () => void
  refreshProse: () => void
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function useServerData(): ServerData {
  const [canon, setCanon] = useState<Canon | null>(null)
  const [canonError, setCanonError] = useState<string | null>(null)
  const [view, setView] = useState<View>({})
  const [docs, setDocs] = useState<DocArticle[]>([])
  const [prose, setProse] = useState<ProseScene[]>([])
  const [draft, setDraft] = useState<ProseDraft>(NO_DRAFT)
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
      secondary('docs', loadDocs, setDocs),
      secondary('prose', loadProse, setProse),
      secondary('draft', loadDraft, setDraft),
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
  }, [])

  // Prose and its draft state refresh together: accept/discard change both.
  const refreshProse = useCallback(() => {
    loadProse().then(setProse).catch(() => setDegraded(d => (d.includes('prose') ? d : [...d, 'prose'])))
    loadDraft().then(setDraft).catch(() => setDegraded(d => (d.includes('draft') ? d : [...d, 'draft'])))
  }, [])

  return { canon, canonError, retry, view, docs, prose, draft, degraded, refreshCanon, refreshProse }
}
