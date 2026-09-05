// The attention inbox: a header chip opening the one review queue for
// everything arc discovers. Counts, never nagging — and, since A65, counting
// only what is WRONG. It used to read "26 warnings · 22 proposals · 4
// unfired payoffs · 2 unmet obligations", which is fifty-four items that
// never reach zero, with the three fixable contradictions buried in them.
// Now it counts contradictions; everything else arc knows is waiting stays
// in the panel, under what it actually is. Grouped by the registers
// (conventions §11) — all of this is proven.
import type { AttentionResponse, Canon } from '../canon'
import { nameOf } from '../canon'
import { attentionLabel, attentionTone, splitFindings, waitingCount } from '../attention-view'

export function AttentionInbox({ attention, canon, onOpen, open, onToggle }: {
  attention: AttentionResponse | null
  canon: Canon
  onOpen: (id: string) => void
  /** The header opens one panel at a time (A64-7). */
  open: boolean
  onToggle: () => void
}) {
  if (!attention) return null

  const { contradictions, housekeeping } = splitFindings(attention.findings)
  const waiting = waitingCount(attention, housekeeping)

  const jump = (id: string) => { onOpen(id); onToggle() }

  return (
    <>
      <button className={`attn-chip${attentionTone(contradictions)}`}
        title={contradictions.length
          ? 'Places the record disagrees with itself, and code can prove it. Everything else arc is holding is inside.'
          : 'Nothing in the record contradicts itself. Everything arc is holding is inside.'}
        aria-pressed={open} onClick={onToggle}>
        ⚑ {attentionLabel(contradictions)}
      </button>
      {open && (
        <div className="attn-drawer">
          {contradictions.length > 0 && (
            <div className="attn-group">
              <h3>the record disagrees with itself — proven</h3>
              {contradictions.map((f, i) => (
                <div key={i} className="attn-row">
                  <span className={`sev ${f.severity}`}>{f.severity}</span>
                  <span className="attn-msg">{f.message}</span>
                  {f.about[0] && <a className="linklike" onClick={() => jump(f.about[0])}>view</a>}
                </div>
              ))}
            </div>
          )}
          {contradictions.length === 0 && (
            <div className="attn-group"><h3>nothing in the record contradicts itself</h3></div>
          )}
          {waiting > 0 && (
            <details className="attn-waiting">
              <summary>{waiting} more that arc is holding — waiting, not wrong</summary>
          {attention.danglingPayoffs.length > 0 && (
            <div className="attn-group">
              <h3>payoffs planted, never fired</h3>
              {attention.danglingPayoffs.map(d => (
                <div key={d.from + d.to} className="attn-row">
                  <span className="attn-msg">
                    <a className="linklike" onClick={() => jump(d.from)}>{canon.events[d.from]?.title ?? d.from}</a>
                    {' plants '}
                    <a className="linklike" onClick={() => jump(d.to)}>{canon.events[d.to]?.title ?? d.to}</a>
                    , which never reaches the page
                  </span>
                </div>
              ))}
            </div>
          )}
          {attention.unmetObligations.length > 0 && (
            <div className="attn-group">
              <h3>what the story still owes</h3>
              {attention.unmetObligations.map(o => (
                <div key={o.id} className="attn-row">
                  <span className={`sev ${o.klass === 'overdue' ? 'error' : 'warning'}`}>{o.klass}</span>
                  {/* mat.* ids are not canon — nameOf would not resolve them, so
                      the obligation speaks for itself in the author's own words. */}
                  <span className="attn-msg">
                    {o.body}
                    {o.satisfiers.length > 0 && <span className="attn-sat"> — intended by {o.satisfiers.join(', ')}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          {attention.proposedRecords.length > 0 && (
            <div className="attn-group">
              <h3>proposed — awaiting your ratification</h3>
              <div className="attn-chips">
                {attention.proposedRecords.map(p => (
                  <a key={p.id} className="attn-proposal" onClick={() => jump(p.id)}
                    title={p.type}>{nameOf(canon, p.id)}</a>
                ))}
              </div>
            </div>
          )}
          {housekeeping.length > 0 && (
            <div className="attn-group">
              <h3>canon bookkeeping</h3>
              {housekeeping.map((f, i) => (
                <div key={i} className="attn-row">
                  <span className="attn-msg">{f.message}</span>
                  {f.about[0] && <a className="linklike" onClick={() => jump(f.about[0])}>view</a>}
                </div>
              ))}
            </div>
          )}
            </details>
          )}
        </div>
      )}
    </>
  )
}
