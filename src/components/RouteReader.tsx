import { useMemo, useState } from 'react'
import type { RouteAlternative } from 'arc-canon-graph/api-types.ts'
import { canRewrite, chainsOf, coverageRows, noteLabel, notesByParagraph, overlapLabel, paragraphsOf, quoteOf, routeKey, seedLabel } from '../routes-view'
import type { RouteChain } from '../routes-view'

/** The route reader (A59-1): one route at a time at book measure, with the
 *  author's notes in a rail BESIDE the paragraphs they are about.
 *
 *  The one structural rule, and the reason this replaced a stack of
 *  <details>: the prose column's flow contains no note furniture at all.
 *  Every card and the composer are absolutely positioned in a sibling
 *  column and placed by measuring each paragraph, so a card's height, a
 *  composer opening, or the author dragging a textarea taller can never
 *  move a line of prose. The first attempt put notes in the prose's own
 *  grid rows and a 340px composer opened a 300px hole in the middle of the
 *  scene — hence the measured placement here.
 *
 *  Notes are taken the way the manuscript takes them: highlight a phrase
 *  and let go. The composer deliberately does NOT steal focus, because
 *  focusing collapses the selection and the author loses the ability to
 *  copy what they just highlighted; the first printable keystroke claims
 *  the box instead. */


/** The tab strip that folds the routes into the scene: the scene itself is
 *  the first reading, each route is another. It sits above the reading area,
 *  so switching never moves the author to a different part of the page. */
export function RouteTabs(props: {
  routes: RouteAlternative[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  counts?: number
}) {
  const chains = chainsOf(props.routes)
  return (
    <div className="rr-tabs">
      <button className={'rr-tab' + (props.selectedId === null ? ' is-on' : '')}
        onClick={() => props.onSelect(null)}>
        The scene as it stands
      </button>
      {chains.map(c => (
        <button key={c.head.id} className={'rr-tab' + (c.head.id === props.selectedId ? ' is-on' : '')}
          onClick={() => props.onSelect(c.head.id)}>
          {seedLabel(c.head.seed)}
          <small>{paragraphsOf(c.head.body).length} ¶
            {(c.head.notes?.length ?? 0) > 0 ? ` · ${c.head.notes!.length} note${c.head.notes!.length === 1 ? '' : 's'}` : ''}
            {c.earlier.length ? ` · v${c.earlier.length + 1}` : ''}</small>
        </button>
      ))}
    </div>
  )
}

export interface RouteReaderProps {
  /** the chain being read, derived by the parent so the rail and the reader
   *  can never disagree about which route is open */
  chain: RouteChain
  busy: boolean
  /** null while nothing is wrong; shown above the reader */
  error: string | null
  /** the anchor key holding the author's eye — `route@N` while a route card
   *  or the composer is focused */
  focusedKey: string | null
  /** open the composer in the MANUSCRIPT'S rail, against this paragraph
   *  (null = the route as a whole) */
  onCompose: (alt: string, paragraph: number | null, quote: string) => void
  /** a click on an annotated paragraph brings its card forward in the rail */
  onFocusNote: (id: string, paragraph: number) => void
  onRevise: (alt: string, extra: string) => void | Promise<void>
  onAdopt: (alt: string) => void | Promise<void>
  onDrop: (alt: string) => void | Promise<void>
}

export function RouteReader(props: RouteReaderProps) {
  const { busy, error, chain } = props
  const alt = chain.head
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null)

  const paras = useMemo(() => paragraphsOf(alt.body), [alt])
  const marks = useMemo(() => notesByParagraph(alt), [alt])
  const notes = alt.notes ?? []

  // Deliberately NO scroll on mount. The reader now replaces the scene's own
  // reading area, so the author is already looking at it — and scrolling here
  // moved the scene's header 177px out from under them on the way in, while
  // switching between routes (no remount) stayed put. Swapping what is in a
  // reading area must not move the page.

  /** The note belongs to where the highlight STARTED — a drag that runs past
   *  a paragraph break is still about the paragraph it began in. */
  const onMouseUp = () => {
    const sel = window.getSelection()
    const quote = (sel?.toString() ?? '').trim()
    if (!quote || !sel?.rangeCount) return
    const start = sel.getRangeAt(0).startContainer
    const el = start.nodeType === 1 ? (start as Element) : start.parentElement
    const p = el?.closest<HTMLElement>('.rr-route [data-rpara]')
    if (!p) return
    props.onCompose(alt.id, Number(p.dataset.rpara), quote)
  }

  return (
    <div className="routes">
      {error && <p className="db-err">{error}</p>}

      <p className="route-hint">Highlight any phrase to leave a note in the margin beside it — the same margin the chapter's notes use. Your notes are what a rewrite reads.</p>

      <div className="rr-cols">
        <article className="rr-main">
          {/* data-rpara, never data-para: the reading position sweeps
              [data-para] across this whole region, and a bare number there
              would read as a scene key with no scene. ¶0 is the route
              itself — where a note about the whole of it belongs. */}
          <div className="rr-prose rr-route" data-rpara="0" onMouseUp={onMouseUp}>
            {paras.map((p, i) => {
              const n = i + 1
              const mine = marks?.byParagraph.get(n) ?? []
              return (
                <p key={i} data-rpara={n}
                  className={(mine.length ? 'has-note' : '') + (props.focusedKey === routeKey(n) ? ' note-focus' : '')}
                  onClick={() => {
                    if ((window.getSelection()?.toString() ?? '').trim()) return
                    if (mine.length) props.onFocusNote(mine[0].id, n)
                    else props.onCompose(alt.id, n, '')
                  }}>
                  <span className="rr-n">¶{n}</span>{p}
                </p>
              )
            })}
          </div>
        </article>

      </div>

      <details className="more rr-more">
        <summary>How this route came to be, and where the beats land</summary>
        {/* The machinery reads here, not over the prose: a reader who wants
            to know how the route was made can open it, and nobody else has
            to. */}
        <p className="gen-note">
          Made {new Date(alt.created_at).toLocaleString()} · {overlapLabel(alt.overlap)}
          {alt.guidance ? ` · ${alt.revises ? 'rewritten for' : 'asked for'}: ${alt.guidance}` : ''}
        </p>
        {alt.retried && <p className="gen-note">The first answer was refused and it tried again: {alt.retried}</p>}
        {alt.coverage
          ? <table className="route-coverage"><tbody>
              {coverageRows(alt.coverage).map((r, i) => <tr key={i}><td>{r.item}</td><td>{r.where}</td></tr>)}
            </tbody></table>
          : <p className="gen-note">not reported — the answer carried no readable coverage tail.</p>}
        <h4>Briefing (argued)</h4>
        <div className="db-capture-reply">{alt.briefing || '(none)'}</div>
      </details>

      <div className="route-actions route-revise">
        <input value={extra[alt.id] ?? ''} disabled={busy}
          placeholder="anything else to say before rewriting (optional)"
          onChange={ev => setExtra(prev => ({ ...prev, [alt.id]: ev.target.value }))} />
        <button disabled={busy || !canRewrite(alt, extra[alt.id] ?? '')}
          title="Send this route back through the pass, following your notes. The rewrite lands as a new version; this one stays as an earlier version."
          onClick={() => void props.onRevise(alt.id, (extra[alt.id] ?? '').trim())}>
          {busy ? 'Working…' : 'Rewrite from these notes'}
        </button>
      </div>
      <div className="route-actions">
        <button disabled={busy}
          title="Replace the working-tree scene with this route. It becomes the draft — accept or discard through the ordinary gate."
          onClick={() => void props.onAdopt(alt.id)}>Adopt into the draft</button>
        <button disabled={busy}
          onClick={() => {
            if (confirmDrop !== alt.id) { setConfirmDrop(alt.id); return }
            setConfirmDrop(null); void props.onDrop(alt.id)
          }}>
          {confirmDrop === alt.id
            ? `Really cancel this route${notes.length ? ` and its ${notes.length} note${notes.length === 1 ? '' : 's'}` : ''}?`
            : 'Cancel this route'}
        </button>
      </div>

      {chain.earlier.length > 0 && (
        <details className="route-earlier">
          <summary>Earlier {chain.earlier.length === 1 ? 'version' : 'versions'} of this route ({chain.earlier.length})</summary>
          {chain.earlier.map(v => (
            <div key={v.id} className="route-earlier-one">
              <p className="gen-note">{new Date(v.created_at).toLocaleString()}{v.guidance ? (v.revises ? ` — rewritten for: ${v.guidance}` : ` — generated with: ${v.guidance}`) : ''}</p>
              {paragraphsOf(v.body).map((p, i) => <p key={i}>{p}</p>)}
              {(v.notes ?? []).length > 0 && (
                <div className="route-notes route-notes-past">
                  <h4>What you asked for here</h4>
                  {(v.notes ?? []).map(n => (
                    <div key={n.id} className="route-note">
                      <span className="route-note-where" title={n.paragraph === null ? 'about all of this route' : quoteOf(v.body, n.paragraph)}>{noteLabel(n)}</span>
                      <span className="route-note-body">{n.body}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="route-actions">
                <button disabled={busy} onClick={() => void props.onAdopt(v.id)}>Adopt this version</button>
              </div>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
