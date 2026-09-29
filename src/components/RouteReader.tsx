import { useMemo, useState } from 'react'
import type { RouteAlternative } from 'arc-canon-graph/api-types.ts'
import { blocksAdopt, canRewrite, cancelPrompt, chainsOf, coverageRows, droppedLabel, noteLabel, notesByParagraph, overlapLabel, paragraphsOf, quoteOf, routeKey, seedLabel, staleChip, staleLabel } from '../routes-view'
import type { RouteChain } from '../routes-view'
import { ReceiptFold } from './ReceiptFold'

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
 *  so switching never moves the author to a different part of the page.
 *
 *  It is a strip of TABS and nothing else (A67-15). Adopt and cancel used to
 *  sit on each tab so a decision needed no detour through the route; in
 *  practice that put three controls of three inks beside every alternative,
 *  and the row of chips beside "The scene as it stands" read as a control
 *  panel rather than as a choice of what to read. Deciding a route is a
 *  decision about its prose, and it belongs where the prose is: the reader
 *  below carries adopt, cancel and ask again for whichever route is open.
 *  What stays here is the one thing a tab must say about a route it is not
 *  showing — that it is out of date — said inside the tab's own second line,
 *  never as a control beside it. */
export function RouteTabs(props: {
  routes: RouteAlternative[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const chains = chainsOf(props.routes)
  return (
    <div className="rr-tabs">
      <button className={'rr-tab' + (props.selectedId === null ? ' is-on' : '')}
        onClick={() => props.onSelect(null)}>
        The scene as it stands
      </button>
      {chains.map(c => (
        <button key={c.head.id}
          className={'rr-tab' + (c.head.id === props.selectedId ? ' is-on' : '') + (staleChip(c.head) ? ' is-stale' : '')}
          title={!staleChip(c.head) ? undefined : c.head.stale?.why === 'written by an older arc'
            ? 'This route predates the way arc works now, so it carries no receipt. Open it to ask again for one that does.'
            : 'The record moved under this route. Open it to ask again from where the scene stands now, or let it go.'}
          onClick={() => props.onSelect(c.head.id)}>
          {seedLabel(c.head.seed)}
          <small>{paragraphsOf(c.head.body).length} ¶
            {(c.head.notes?.length ?? 0) > 0 ? ` · ${c.head.notes!.length} note${c.head.notes!.length === 1 ? '' : 's'}` : ''}
            {c.earlier.length ? ` · v${c.earlier.length + 1}` : ''}
            {staleChip(c.head) ? <em className="rr-tab-stale"> · {staleChip(c.head)}</em> : null}</small>
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
  /** Ask again from where the record stands now — the one click a stale
   *  route offers, and the ONLY place in the viewer that offers it: it is a
   *  decision about this route, made where its prose is (A67-15). */
  onRerun?: () => void
  /** Why this scene cannot take a route, in the author's words, or null.
   *  The strip used to say this in adopt's place; adopt lives here now, so
   *  the reason does too — said before the press, never as the backend's
   *  423 after it (A67-15). */
  settled?: string | null
}

/** Why adopt would refuse, or what it will do — said before the press, and
 *  said the same way for the route and for every earlier version of it. The
 *  two stalenesses part here: the record moving closes adopt, an older arc's
 *  route is only noted, because that is exactly what the write path does. */
function adoptTitle(alt: RouteAlternative, settled: string | null): string {
  if (settled) return settled
  if (blocksAdopt(alt)) {
    return `${staleLabel(alt)}, so arc will not put it into the book. Ask again from where the scene stands now, or cancel it.`
  }
  const base = 'Replace the working-tree scene with this route. It becomes the draft — accept or discard through the ordinary gate.'
  return staleLabel(alt) ? `${base} It carries no receipt, so arc cannot say what it was written from.` : base
}

export function RouteReader(props: RouteReaderProps) {
  const { busy, error, chain } = props
  const alt = chain.head
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null)
  // Held by route id, because the earlier-versions fold offers adopt too and
  // arming one must never arm another.
  const [confirmAdopt, setConfirmAdopt] = useState<string | null>(null)

  const stale = staleLabel(alt)
  const paras = useMemo(() => paragraphsOf(alt.body), [alt])
  const marks = useMemo(() => notesByParagraph(alt), [alt])

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

      {/* A stale route is never offered as an equal, here either: the
          reader says what moved and offers the one click that helps, and the
          adopt below is closed because the write path would refuse it. */}
      {stale && (
        <p className="route-stale">
          {stale}{alt.stale?.why === 'written by an older arc'
            ? ' — it carries no receipt, so arc cannot say what it was written from.'
            : ' — arc will not write it over newer work.'}
          {props.onRerun && (
            <button className="route-rerun" disabled={busy}
              title="Ask again, from where the record stands now."
              onClick={() => props.onRerun!()}>ask again</button>
          )}
        </p>
      )}
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
        {/* Claims whose evidence did not resolve against what this pass was
            asked to reach: counted where the route is, never dropped in
            silence (A67-8). */}
        {droppedLabel(alt.dropped) && <p className="gen-note">{droppedLabel(alt.dropped)}</p>}
        <h4>Briefing (argued)</h4>
        <div className="db-capture-reply">{alt.briefing || '(none)'}</div>

        {/* THE RECEIPT (A67-11). Two interactions from the route and not one
            fewer: the author opened the route, then opened this. Nothing here
            is a model's reading — every line is a fact arc recorded about its
            own run — so it sits under one heading, below the briefing, which
            is the argued half of the same fold.

            A route written by an older arc has no run and so no receipt: the
            fold says that rather than showing an empty frame. */}
        <h4>How arc ran it (proven)</h4>
        {alt.receipt
          ? (
            // ONE FOLD FOR EVERY RUN (A69-11): the route's overlap figure is
            // the one reading only a route has, so it rides as an extra
            // rather than forking the component.
            <ReceiptFold receipt={alt.receipt}
              extra={[{ heading: 'Overlap with the scene', body: overlapLabel(alt.overlap) }]} />
          )
          : alt.run
          // A run it has, a receipt it should have: the difference matters,
          // because telling the author a route predates the governed path
          // when it does not is a lie about where their prose came from.
          ? <p className="gen-note">arc could not read this route's receipt — the run is on record as {alt.run}, and what it kept is under <code>.arc/runs/</code>.</p>
          : <p className="gen-note">no receipt — this route was written by an older arc, before arc kept one.</p>}
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
      {/* Where a route is decided (A67-15). Adopt, cancel and — above, on
          the stale line — ask again are all here, on the route whose prose
          the author is reading, rather than spread across the tabs of routes
          they are not. Each says before the press why it would refuse, and
          adopt arms first: it replaces the scene's draft, and the strip's own
          adopt armed for that reason (A59-3). Moving the gesture here must
          not cost it its second click. */}
      <div className="route-actions">
        <button disabled={busy || blocksAdopt(alt) || !!props.settled}
          title={adoptTitle(alt, props.settled ?? null)}
          onClick={() => {
            if (confirmAdopt !== alt.id) { setConfirmAdopt(alt.id); return }
            setConfirmAdopt(null); void props.onAdopt(alt.id)
          }}>
          {props.settled
            ? 'Settled — cannot be adopted'
            : confirmAdopt === alt.id
            ? 'Really adopt it? It becomes the scene’s draft.'
            : 'Adopt into the draft'}
        </button>
        <button disabled={busy}
          title="Let this route go. What you wrote about it is kept on the record; the route itself is not. Asks before it does."
          onClick={() => {
            if (confirmDrop !== alt.id) { setConfirmDrop(alt.id); return }
            setConfirmDrop(null); void props.onDrop(alt.id)
          }}>
          {confirmDrop === alt.id ? cancelPrompt(alt) : 'Cancel this route'}
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
              {/* The same gate and the same two-step as the head's adopt:
                  an earlier version writes the scene exactly as the head
                  does, so a settled scene closes it here too (A67-15). */}
              <div className="route-actions">
                <button disabled={busy || blocksAdopt(v) || !!props.settled}
                  title={adoptTitle(v, props.settled ?? null)}
                  onClick={() => {
                    if (confirmAdopt !== v.id) { setConfirmAdopt(v.id); return }
                    setConfirmAdopt(null); void props.onAdopt(v.id)
                  }}>
                  {props.settled
                    ? 'Settled — cannot be adopted'
                    : confirmAdopt === v.id
                    ? 'Really adopt this version? It becomes the scene’s draft.'
                    : 'Adopt this version'}
                </button>
              </div>
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
