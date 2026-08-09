import { useMemo } from 'react'
import type { StyleResponse } from '../canon'
import { mdToHtml } from '../md'
import { checklistOf, ruleCount, sectionsOf, touchstonesOf } from '../style-page'

export type StyleTab = 'book' | 'author'

/** The style contract (conventions §10): the author's voice, written down.
 *  Two layers — this book's contract, and the author's own across every book,
 *  the book's winning on conflict. Read-only: the contract is the author's to
 *  write, and arc's job here is to make it legible and always at hand. */
export function StyleView({ style, tab, onTab }: {
  style: StyleResponse | null
  tab: StyleTab
  onTab: (t: StyleTab) => void
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
