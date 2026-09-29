// HOW THIS DRAFT CAME TO BE (A69-11) — the fold under a draft's pill.
//
// It reads the receipt by RUN, not from the response that made the draft:
// the author opens this whenever they get to it, which is often days after
// the pass ran, and a response is gone by then. The draft layer carries the
// run for exactly this reason, and a draft with no run was written before
// arc kept one — which the fold says rather than showing an empty frame.
//
// Everything inside is the PROVEN register: arc's own record of its own run.
// The same component renders a route's receipt, so a draft and a route
// cannot describe the same facts two different ways.
import { useEffect, useState } from 'react'
import type { RouteReceipt } from 'arc-canon-graph/api-types.ts'
import { loadRunReceipt } from '../api'
import { OLDER_ARC } from '../routes-view'
import { ReceiptFold } from './ReceiptFold'

export function DraftReceipt({ run, onAskAgain }: {
  /** the run that wrote the draft; absent for one written before arc kept
   *  a receipt, or by a pass that has not taken its row yet */
  run?: string
  /** re-run the pass that wrote it — offered only when arc has changed
   *  since, and never as a thing that happens on its own */
  onAskAgain?: () => void
}) {
  const [open, setOpen] = useState(false)
  // THE RECEIPT BELONGS TO THE RUN, and is remembered under its id. The fold
  // stays mounted when the draft under it is replaced — ask again writes a
  // new one — so a receipt kept against the COMPONENT would go on describing
  // a run that did not write what the author is now reading.
  const [got, setGot] = useState<{ run: string; receipt?: RouteReceipt; err?: string } | null>(null)
  const mine = got?.run === run ? got : null
  const receipt = mine?.receipt ?? null
  const err = mine?.err ?? null

  // Fetched when the fold opens and not before: a chapter of drafts would
  // otherwise cost one request each to show nothing anybody asked for.
  useEffect(() => {
    if (!open || !run || mine) return
    const ac = new AbortController()
    let alive = true
    loadRunReceipt(run, ac.signal)
      .then(r => { if (alive) setGot({ run, receipt: r }) })
      .catch((e: Error) => { if (alive && e.name !== 'AbortError') setGot({ run, err: e.message }) })
    return () => { alive = false; ac.abort() }
  }, [open, run, mine])

  if (!run) return null

  return (
    <details className="draft-receipt" open={open}
      onToggle={ev => setOpen((ev.currentTarget as HTMLDetailsElement).open)}>
      <summary>How this draft came to be</summary>
      {err && <p className="db-err">{err}</p>}
      {!err && !receipt && <p className="gen-note">reading what arc recorded…</p>}
      {receipt && (
        <>
          {/* ARC HAS CHANGED SINCE (Q14): a LABEL, never a staleness. The
              prose on the page is still what arc wrote; asking again is how
              the author gets what arc would write now. */}
          {receipt.older_arc && (
            <p className="gen-note">
              {OLDER_ARC} — what arc would write now is not what it wrote here.
              {onAskAgain && (
                <button className="linklike pass-act"
                  title="Take the pass again, as arc works now. It rebuilds this scene, so the draft you are reading is replaced — accept it first if you want to keep it."
                  onClick={onAskAgain}>ask again</button>
              )}
            </p>
          )}
          <ReceiptFold receipt={receipt} />
        </>
      )}
    </details>
  )
}
