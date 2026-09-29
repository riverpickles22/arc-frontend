// WHAT ARC RECORDED ABOUT ITS OWN RUN — one fold, one rendering, everywhere
// a run can be opened (A69-11; lifted out of RouteReader, A67-11).
//
// The whole of it is the PROVEN register (conventions §11): every line is a
// fact arc wrote about its own work, from the slice manifest, the gate
// records and the envelope. Nothing here is a model's reading, and nothing
// here is arc's vocabulary — the layer names, the statuses and the endings
// are all translated in routes-view.ts before they reach this file.
//
// It renders one way for a route and for a draft on purpose. A draft and a
// route that were given the same thing must not describe it two different
// ways, or the author has to learn two folds to check one fact.
import type { RouteReceipt } from 'arc-canon-graph/api-types.ts'
import {
  endingLabel, gateLine, intentLines, layerReadings, leanedOnLine,
  notesHandedLine, receiptReadings, tookLabel,
} from '../routes-view'

export function ReceiptFold(props: {
  receipt: RouteReceipt
  /** shown under the three readings, where a route puts its overlap figure */
  extra?: { heading: string; body: string }[]
}) {
  const r = props.receipt
  const intent = intentLines(r)
  const layers = layerReadings(r)
  const aged = leanedOnLine(r)
  const notes = notesHandedLine(r)
  return (
    <div className="route-receipt">
      {r.request && (
        <p className="gen-note">
          You asked: “{r.request.gesture}”
          {r.request.subject ? ` · about ${r.request.subject}` : ''}
        </p>
      )}

      {/* WHAT YOU SAID, AND WHAT THE PASS WAS GIVEN INSTEAD (A69-4). The two
          are different on purpose: a pass told to write dread writes about
          dread, so the effect is translated into craft and only the craft
          goes on. Showing both is how the author checks the translation. */}
      {intent.said && <p className="gen-note">{intent.said}</p>}
      {intent.plan && <p className="gen-note">{intent.plan}</p>}
      {intent.note && <p className="gen-note">{intent.note}</p>}

      {/* EVERY LAYER OF THE BRIEF, with the status the author reads. The
          three summary readings below are the same facts counted; this is
          the reading, and it is where `not shown` is told from `none`. */}
      {layers.length > 0 && (
        <div className="route-receipt-part">
          <span className="route-receipt-head">What the pass was shown</span>
          <span className="route-receipt-body">
            {layers.map(l => (
              <span key={l.layer} className="route-gate">{l.heading}: {l.detail}</span>
            ))}
          </span>
        </div>
      )}
      {aged && <p className="gen-note">{aged}</p>}
      {notes && (
        <div className="route-receipt-part">
          <span className="route-receipt-head">Your notes it was handed</span>
          <span className="route-receipt-body">{notes}</span>
        </div>
      )}

      {receiptReadings(r).map(reading => (
        <div key={reading.heading} className="route-receipt-part">
          <span className="route-receipt-head">{reading.heading}</span>
          <span className="route-receipt-body">
            {reading.items.length ? reading.items.join(' · ') : <em>{reading.empty}</em>}
          </span>
        </div>
      ))}

      {(props.extra ?? []).map(e => (
        <div key={e.heading} className="route-receipt-part">
          <span className="route-receipt-head">{e.heading}</span>
          <span className="route-receipt-body">{e.body}</span>
        </div>
      ))}

      {r.gates.length > 0 && (
        <div className="route-receipt-part">
          <span className="route-receipt-head">Checks</span>
          <span className="route-receipt-body">
            {r.gates.map(g => <span key={`${g.gate}-${g.attempt}`} className="route-gate">{gateLine(g)}</span>)}
          </span>
        </div>
      )}

      <div className="route-receipt-part">
        <span className="route-receipt-head">How it ended</span>
        <span className="route-receipt-body">
          {endingLabel(r.ending)}
          {tookLabel(r.wall_clock_ms) ? ` · took ${tookLabel(r.wall_clock_ms)}` : ''}
        </span>
      </div>
      {r.outcome && <p className="gen-note">{r.outcome}</p>}
    </div>
  )
}
