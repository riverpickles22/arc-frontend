import { useEffect, useRef, useState } from 'react'
import type { Agent, RunSummary, StreamMessage } from '../canon'
import { loadAgents, loadRuns } from '../api'

// The live view of what is working on the story.
//
// Additive by design: useServerData stays a one-shot fetch, and this sits
// beside it. A dead stream therefore degrades to exactly the app that existed
// before it — the viewer loses liveness, never content.

export interface StreamState {
  agents: Agent[]
  runs: RunSummary[]
  /** Files that changed with no run behind them (work-graph.md §10). Kept as
   *  a rolling list, newest last. */
  external: { at: string; files: string[] }[]
  connected: boolean
}

const MAX_EXTERNAL = 50

/** Backoff for a stream that drops. Capped so a backend restarted after lunch
 *  is picked up within seconds rather than never. */
const backoffMs = (attempt: number) => Math.min(1000 * 2 ** attempt, 15_000)

/** How long without a word before the stream is presumed dead.
 *
 *  Not paranoia: a proxy holds the browser's connection open after the
 *  upstream dies, so `onerror` never fires and nothing else would ever notice.
 *  The server beats every 15s, so silence past this is real. */
const SILENCE_MS = 45_000

export function useRunStream(onCanonChanged?: () => void): StreamState {
  const [agents, setAgents] = useState<Agent[]>([])
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [external, setExternal] = useState<StreamState['external']>([])
  const [connected, setConnected] = useState(false)

  // Held in a ref so a re-render never re-subscribes, and so the handler can
  // call the latest refresher without the effect depending on it. Assigned in
  // an effect rather than during render: a ref written while rendering is a
  // side effect in the middle of a pure function, and the compiler is right
  // to refuse it.
  const canonChanged = useRef(onCanonChanged)
  useEffect(() => { canonChanged.current = onCanonChanged }, [onCanonChanged])

  useEffect(() => {
    let source: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let watchdog: ReturnType<typeof setTimeout> | null = null
    let attempt = 0
    let live = true

    /** Whatever the stream says has happened, re-read the truth. The stream
     *  reports events; the API holds state, and re-reading is cheap next to
     *  keeping two copies in step. */
    const resync = () => {
      loadAgents().then(r => setAgents(r.agents)).catch(() => {})
      loadRuns().then(r => setRuns(r.runs)).catch(() => {})
    }

    const connect = () => {
      if (!live) return
      source = new EventSource('/api/runs/stream')

      /** Reset on every sign of life, including heartbeats. */
      const heard = () => {
        if (watchdog) clearTimeout(watchdog)
        watchdog = setTimeout(() => {
          // Silence past the beat interval: treat it as a drop and rebuild,
          // because nothing else is going to tell us.
          setConnected(false)
          source?.close()
          source = null
          if (live) retry = setTimeout(connect, backoffMs(attempt++))
        }, SILENCE_MS)
      }

      source.onopen = () => {
        attempt = 0
        setConnected(true)
        heard()
        resync()
      }

      source.addEventListener('ping', heard)

      source.onmessage = ev => {
        heard()
        let msg: StreamMessage
        try {
          msg = JSON.parse(ev.data) as StreamMessage
        } catch {
          return
        }

        if (msg.event === 'files.external') {
          const files = (msg.detail as { files?: string[] } | undefined)?.files ?? []
          setExternal(x => [...x, { at: msg.at, files }].slice(-MAX_EXTERNAL))
          return
        }

        // A change to the record means the world the viewer is drawing is out
        // of date — refresh it rather than waiting for the author to notice.
        if (msg.event === 'files.changed' || msg.event === 'author.decision') canonChanged.current?.()

        resync()
      }

      source.onerror = () => {
        setConnected(false)
        source?.close()
        source = null
        if (!live) return
        retry = setTimeout(connect, backoffMs(attempt++))
      }
    }

    connect()
    return () => {
      live = false
      if (retry) clearTimeout(retry)
      if (watchdog) clearTimeout(watchdog)
      source?.close()
    }
  }, [])

  return { agents, runs, external, connected }
}
