import { useMemo, useState } from 'react'
import type { ProposedRule, StyleResponse } from '../canon'
import { ratifyRule } from '../api'
import { mdToHtml } from '../md'
import { checklistOf, ruleCount, sectionsOf, touchstonesOf } from '../style-page'

export type StyleTab = 'book' | 'author'

/** The style contract (conventions §10): the author's voice, written down.
 *  Two layers — this book's contract, and the author's own across every book,
 *  the book's winning on conflict. Read-only: the contract is the author's to
 *  write, and arc's job here is to make it legible and always at hand. */
export function StyleView({ style, tab, onTab, onRefresh }: {
  style: StyleResponse | null
  tab: StyleTab
  onTab: (t: StyleTab) => void
  onRefresh?: () => void
}) {
  const layer = tab === 'book' ? style?.story : style?.author
  const body = layer?.body ?? ''
  const sections = useMemo(() => sectionsOf(body), [body])
  const checklist = useMemo(() => checklistOf(body), [body])
  const touchstones = useMemo(() => touchstonesOf(body), [body])

  if (!style) return <div className="empty">Style contract unavailable — is arc-backend running?</div>

  return (
    <div className="wiki-layout">
      <nav className="side-nav">
        <h3>Layers</h3>
        <button className={tab === 'book' ? 'navitem sel' : 'navitem'} onClick={() => onTab('book')}>
          This book
          <span className="chmeta">{style.story ? 'docs/style.md' : 'none yet'}</span>
        </button>
        <button className={tab === 'author' ? 'navitem sel' : 'navitem'} onClick={() => onTab('author')}>
          The author
          <span className="chmeta">{style.author ? 'across every book' : 'none yet'}</span>
        </button>

        {sections.length > 0 && <h3>Contents</h3>}
        {sections.map(s => (
          <a key={s.slug} className="navitem" href={`#${s.slug}`}>{s.title}</a>
        ))}

        {style.proposed.length > 0 && (
          <>
            <h3>Proposed <span className="reg-argued">argued</span></h3>
            <a className="navitem" href="#proposed">
              {style.proposed.length} rule{style.proposed.length === 1 ? '' : 's'} awaiting you
              <span className="chmeta">from your own edits · binds nothing</span>
            </a>
          </>
        )}
      </nav>

      <article className="ms-main">
        {layer ? (
          <>
            <header className="ms-head">
              <h1>{tab === 'book' ? 'This book’s style contract' : 'Your style, across every book'}</h1>
              <p className="ms-meta">
                <code>{layer.path}</code>
                {tab === 'book'
                  ? ' · binds prose form; canon still wins on fact'
                  : ' · applies wherever this book’s contract is silent'}
              </p>
            </header>
            <div className="mdbody prose" dangerouslySetInnerHTML={{ __html: mdToHtml(body) }} />
          </>
        ) : (
          <EmptyLayer tab={tab} />
        )}
      </article>

      <aside className="wiki-aside">
        <div className="infobox">
          <div className="ib-head">The contract
            <span className="ib-type">{tab === 'book' ? 'this book' : 'the author'}</span>
          </div>
          <div className="ib-body">
            <div className="frow"><span>layers loaded</span>
              <span>{[style.story && 'book', style.author && 'author'].filter(Boolean).join(' + ') || 'none'}</span>
            </div>
            <div className="frow"><span>wins on conflict</span><span>this book</span></div>
            <div className="frow"><span>rules stated</span><span>{ruleCount(body) || '—'}</span></div>
            <div className="frow"><span>touchstones</span><span>{touchstones.length || '—'}</span></div>
            <p className="fsummary">
              Every pass that writes or judges prose loads both layers, and so does
              every new Claude session. It grows by extraction from your reactions —
              never by invention.
            </p>
          </div>
        </div>

        {style.proposed.length > 0 && (
          <div className="facts proposed-rules" id="proposed">
            <h3>Proposed rules <span className="reg-argued">argued</span></h3>
            <p className="fsummary">
              Arc compared what it drafted against what you kept, and argues these follow.
              Nothing here binds any pass until you ratify it.
            </p>
            {style.proposed.map(r => (
              <ProposalCard key={r.id} rule={r} layer={tab === 'author' ? 'author' : 'story'} onDone={onRefresh} />
            ))}
          </div>
        )}

        {checklist.length > 0 && (
          <div className="facts">
            <h3>Pre-draft checklist</h3>
            <ol className="checklist">
              {checklist.map((c, i) => <li key={i}>{c}</li>)}
            </ol>
            <p className="fsummary">Run before any drafted scene is shown to you — the gate prose has, in place of a validator.</p>
          </div>
        )}
      </aside>
    </div>
  )
}

/** One rule arc has argued for, with the evidence that produced it.
 *
 *  The evidence is the point. A rule on its own is an assertion about the
 *  author's voice that they have no way to check; shown beside the paragraph
 *  arc wrote and the one they kept instead, it is a claim they can judge in a
 *  second. Both quotes come from the backend's own diff — the model that
 *  proposed the rule never supplied them.
 *
 *  Ratifying appends the rule to whichever layer is open in the page, so the
 *  choice of layer is the tab the author is already looking at rather than a
 *  third decision to make.
 */
function ProposalCard({ rule, layer, onDone }: {
  rule: ProposedRule
  layer: 'author' | 'story'
  onDone?: () => void
}) {
  const [busy, setBusy] = useState<'ratify' | 'dismiss' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const act = async (action: 'ratify' | 'dismiss') => {
    setBusy(action)
    setError(null)
    try {
      await ratifyRule({ id: rule.id, action, layer })
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  return (
    <div className="proposal">
      {rule.section && <div className="prop-section">{rule.section}</div>}
      <p className="prop-rule">{rule.rule}</p>

      {rule.evidence.map((e, i) => (
        <div className="prop-evidence" key={i}>
          <div className="prop-scene">{e.scene}</div>
          <div className="prop-wrote"><span>arc wrote</span>{e.wrote}</div>
          <div className="prop-kept"><span>you kept</span>{e.kept || <em>you cut it</em>}</div>
        </div>
      ))}

      {error && <p className="prop-error">{error}</p>}

      <div className="prop-actions">
        <button className="btn" disabled={!!busy} onClick={() => act('ratify')}>
          {busy === 'ratify' ? 'Ratifying…' : `Ratify into ${layer === 'author' ? 'your style' : 'this book'}`}
        </button>
        <button className="btn ghost" disabled={!!busy} onClick={() => act('dismiss')}>
          {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>
    </div>
  )
}

/** A missing layer is normal, not an error — say which file would hold it. */
function EmptyLayer({ tab }: { tab: StyleTab }) {
  return (
    <div className="ms-empty">
      {tab === 'book' ? (
        <p>This story has no style contract yet. It would live at <code>docs/style.md</code> —
          start from <code>arc-core/templates/style.md</code>. Until then, drafting falls back to
          your author layer alone.</p>
      ) : (
        <p>You have no author-level style yet. It would live at <code>~/.arc/style.md</code> —
          <code>./dev.sh</code> creates one from the template on its next run. It holds what is
          true of your writing regardless of which book: the habits, and the things you never do.</p>
      )}
    </div>
  )
}
