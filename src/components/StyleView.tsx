import { useMemo, useState } from 'react'
import type { ProposedRule, StyleResponse } from '../canon'
import { learnStyleNow, ratifyRule } from '../api'
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

        <h3>Proposed <span className="reg-argued">argued</span></h3>
        <a className="navitem" href="#proposed">
          {style.proposed.length
            ? `${style.proposed.length} rule${style.proposed.length === 1 ? '' : 's'} awaiting you`
            : 'Nothing awaiting you'}
          <span className="chmeta">from your own edits · binds nothing</span>
        </a>
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

        <div className="facts proposed-rules" id="proposed">
          <h3>Proposed rules <span className="reg-argued">argued</span></h3>
          <p className="fsummary">
            Arc compared what it drafted against what you kept, what you refused, and
            your own revisions, and argues these follow. Nothing here binds any pass
            until you ratify it.
          </p>
          {style.proposed.map(r => (
            <ProposalCard key={r.id} rule={r} layer={tab === 'author' ? 'author' : 'story'} onDone={onRefresh} />
          ))}
          <LearnNow empty={style.proposed.length === 0} onDone={onRefresh} />
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
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const act = async (action: 'ratify' | 'dismiss', into: 'author' | 'story') => {
    setBusy(action === 'dismiss' ? 'dismiss' : into)
    setError(null)
    try {
      const res = await ratifyRule({ id: rule.id, action, layer: into })
      // Say what actually happened, including the half that usually goes
      // unsaid: the story layer is committed and the author layer lives
      // outside the story repo, so "ratified" means different things.
      setDone(action === 'dismiss'
        ? 'Dismissed — arc will not argue this one again.'
        : `Written to ${res.path ?? 'the contract'}${res.committed ? ' and committed.' : '. Not committed — this file is not in the story repo.'}`)
      onDone?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(null)
    }
  }

  // What the evidence IS, which changes what the two halves of it mean. A
  // revision is the author against themself; a refusal is arc's prose the
  // author declined, and calling that "you kept" would say the opposite of
  // what happened.
  const source = rule.source ?? 'draft'
  const badge =
    source === 'revision' ? { label: 'from your own revisions', why: 'Argued only from your own hand revisions — no arc draft in the argument. Likely your voice, not just this book\'s.' }
      : source === 'refusal' ? { label: 'from what you refused', why: 'Argued from prose arc offered and you declined. The only decision git never records.' }
        : { label: 'from what you changed', why: "Argued from the difference between arc's draft and what you kept." }
  const [beforeLabel, afterLabel] =
    source === 'revision' ? ['you had', 'you revised to']
      : source === 'refusal' ? ['arc wrote', 'you refused it, keeping']
        : ['arc wrote', 'you kept']

  return (
    <div className="proposal">
      {rule.section && <div className="prop-section">{rule.section}</div>}
      <div className="prop-origin" title={badge.why}>{badge.label}</div>
      {rule.layer && (
        <div className="prop-origin" title={rule.layer === 'author'
          ? 'Arc thinks this holds across your books — it saw the pattern in more than one scene. You decide where it goes.'
          : "Arc thinks this is about this book. You decide where it goes."}>
          arc suggests: {rule.layer === 'author' ? 'your style' : 'this book'}
        </div>
      )}
      <p className="prop-rule">{rule.rule}</p>

      {rule.evidence.map((e, i) => (
        <div className="prop-evidence" key={i}>
          <div className="prop-scene">{e.scene}</div>
          <div className="prop-wrote"><span>{beforeLabel}</span>{e.wrote}</div>
          <div className="prop-kept"><span>{afterLabel}</span>{e.kept || <em>you cut it</em>}</div>
        </div>
      ))}

      {error && <p className="prop-error">{error}</p>}
      {done && <p className="prop-done">{done}</p>}

      {/* Both layers from one card. The open tab used to decide it, which
          made a real choice into a side effect of where the author happened
          to be standing. */}
      <div className="prop-actions">
        <button className="btn" disabled={!!busy} onClick={() => act('ratify', 'story')}>
          {busy === 'story' ? 'Ratifying…' : 'Ratify into this book'}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => act('ratify', 'author')}>
          {busy === 'author' ? 'Ratifying…' : 'Ratify into your style'}
        </button>
        <button className="btn ghost" disabled={!!busy} onClick={() => act('dismiss', layer)}>
          {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>
    </div>
  )
}

/** Run the pass now, for a review episode the author calls closed.
 *
 *  Arc's own trigger is a scene's draft draining, which is a good proxy for
 *  "finished judging this" and only a proxy. This is the author saying it —
 *  and it is also the only way to ask when nothing has drained recently. */
function LearnNow({ empty, onDone }: { empty: boolean; onDone?: () => void }) {
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  const run = async () => {
    setBusy(true); setSaid(null)
    try {
      const r = await learnStyleNow()
      setSaid(r.proposed > 0
        ? `${r.proposed} rule${r.proposed === 1 ? '' : 's'} proposed from ${r.considered} edit${r.considered === 1 ? '' : 's'}.`
        : r.skipped === 'no-edits' ? 'Nothing to learn from yet — arc has no edits of yours it has not already read.'
          : r.skipped === 'queue-full' ? 'The queue is full. Ratify or dismiss what is here first.'
            : r.skipped === 'no-engine' ? 'No engine configured, so nothing was asked of a model.'
              : `Nothing generalised from ${r.considered} edit${r.considered === 1 ? '' : 's'}. That is the common answer.`)
      onDone?.()
    } catch (e) {
      setSaid(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="learn-now">
      {empty && <p className="fsummary">Nothing proposed. Arc argues a rule only when the same pattern shows in two separate places.</p>}
      <button className="btn ghost" disabled={busy} onClick={() => void run()}
        title="Read the edits you have made since arc last looked, and argue what they imply. Proposes only — nothing is written to your contract.">
        {busy ? 'Reading your edits…' : 'Learn from my edits'}
      </button>
      {said && <p className="fsummary">{said}</p>}
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
