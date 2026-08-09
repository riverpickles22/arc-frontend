// The attention inbox: a persistent header chip — "2 errors · 4 proposals" —
// opening the one review queue for everything arc discovers. Counts, never
// nagging. Grouped by the registers (conventions §11); everything today is
// proven, and argued findings join when lenses ship.
import { useState } from 'react'
import type { AttentionResponse, Canon } from '../canon'
import { nameOf } from '../canon'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function AttentionInbox({ attention, canon, onOpen }: {
  attention: AttentionResponse | null
  canon: Canon
  onOpen: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (!attention) return null

  const { errors, warnings, proposals, payoffs, obligations } = attention
  const total = errors + warnings + proposals + payoffs + obligations
  const label = total === 0 ? 'all clear' : [
    errors > 0 && plural(errors, 'error'),
    warnings > 0 && plural(warnings, 'warning'),
    proposals > 0 && plural(proposals, 'proposal'),
    payoffs > 0 && plural(payoffs, 'unfired payoff'),
    obligations > 0 && plural(obligations, 'unmet obligation'),
  ].filter(Boolean).join(' · ')

  const jump = (id: string) => { onOpen(id); setOpen(false) }

  return (
    <>
      <button className={`attn-chip${errors > 0 ? ' err' : total > 0 ? ' warn' : ''}`}
        title="Everything needing your attention — checks, proposals, unfired payoffs, unmet obligations"
        onClick={() => setOpen(o => !o)}>
        ⚑ {label}
      </button>
      {open && (
        <div className="attn-drawer">
          {attention.findings.length > 0 && (
            <div className="attn-group">
              <h3>continuity — proven</h3>
              {attention.findings.map((f, i) => (
                <div key={i} className="attn-row">
                  <span className={`sev ${f.severity}`}>{f.severity}</span>
                  <span className="attn-msg">{f.message}</span>
                  {f.about[0] && <a className="linklike" onClick={() => jump(f.about[0])}>view</a>}
                </div>
              ))}
            </div>
          )}
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
          {total === 0 && <div className="attn-group"><h3>nothing needs you</h3></div>}
        </div>
      )}
    </>
  )
}
