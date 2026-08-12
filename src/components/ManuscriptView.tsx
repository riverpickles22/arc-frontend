import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AnalyzeResponse, Chapter, ChatResponse, DraftSceneResponse, ProseDraft, ProseScene, ResolvedAnnotation, SceneContract } from '../canon'
import { dateOf } from '../canon'
import { acceptDraft, analyzeDraft, createNote, discardDraft, draftScene, updateNote } from '../api'
import { wikilinkClickHandler } from '../wikilinks'
import { mdToHtml } from '../md'
import { diffProse, diffStats, type ParaDiff } from '../diff'
import { formatReadingTime, formatWords, totalWords, wordsByChapter } from '../wordcount'
import { CopyProse, CopyRef } from './CopyRef'
import { chapterText, copyableScenes, sceneText } from '../manuscript-text'
import { stack } from '../note-stack'

/** The scene's stated intent (conventions §10), collapsed by default —
 *  the contract the prose must satisfy, not an outline of what happens. */
function ContractPanel({ c, onOpenWorld }: { c: SceneContract; onOpenWorld: (id: string) => void }) {
  const list = (items?: string[]) => items?.length
    ? <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul> : null
  return (
    <details className="contract">
      <summary>Scene contract{c.purpose ? ` — ${c.purpose.replace(/\s+/g, ' ').trim()}` : ''}</summary>
      <div className="ct-body">
        {(c.reader_before || c.reader_after) && (
          <div className="ct-row"><span className="ct-k">reader</span>
            <span>{c.reader_before && <>{c.reader_before.trim()} </>}
              {c.reader_after && <>→ <b>{c.reader_after.replace(/\s+/g, ' ').trim()}</b></>}</span>
          </div>
        )}
        {c.wants && Object.keys(c.wants).length > 0 && (
          <div className="ct-row"><span className="ct-k">wants</span>
            <span>{Object.entries(c.wants).map(([id, want], i) => (
              <span key={id}>{i > 0 && ' · '}
                <a className="wikilink" onClick={() => onOpenWorld(id)}>{id}</a> {want.trim()}
              </span>
            ))}</span>
          </div>
        )}
        {c.must_establish?.length ? <div className="ct-row"><span className="ct-k">establish</span>{list(c.must_establish)}</div> : null}
        {c.must_withhold?.length ? <div className="ct-row"><span className="ct-k">withhold</span>{list(c.must_withhold)}</div> : null}
        {c.motifs?.length ? (
          <div className="ct-row"><span className="ct-k">motifs</span>
            <span>{c.motifs.map(m => <span key={m} className="ct-motif">{m}</span>)}</span>
          </div>
        ) : null}
        {c.constraints && <div className="ct-row"><span className="ct-k">constraints</span><span>{c.constraints.trim()}</span></div>}
      </div>
    </details>
  )
}

/** A diffed prose body: paragraphs with word-level ins/del highlighting.
 *  Carries the same data-para keys as the plain renderer — a note has to find
 *  its line whether or not the author is looking at changes. Indices come
 *  from the scene's own paragraphs, matched by text, because a diff's
 *  sequence includes deletions the body no longer has. */
function DiffBody({ d, paraKey }: { d: ParaDiff[]; paraKey?: (text: string) => string | undefined }) {
  const keyOf = (p: ParaDiff): string | undefined => {
    if (!paraKey) return undefined
    const text = p.kind === 'changed'
      ? (p.pieces ?? []).filter(x => x.kind !== 'del').map(x => x.text).join(' ')
      : p.text ?? ''
    return paraKey(text)
  }
  return (
    <div className="mdbody prose">
      {d.map((p, i) => {
        if (p.kind === 'changed') {
          return (
            <p key={i} data-para={keyOf(p)}>
              {p.pieces!.map((pc, k) =>
                pc.kind === 'same' ? <span key={k}>{pc.text} </span>
                  : pc.kind === 'ins' ? <ins key={k}>{pc.text} </ins>
                    : <del key={k}>{pc.text} </del>)}
            </p>
          )
        }
        if (p.kind === 'ins') return <p key={i} data-para={keyOf(p)}><ins>{p.text}</ins></p>
        if (p.kind === 'del') return <p key={i}><del>{p.text}</del></p>
        return <p key={i} data-para={keyOf(p)}>{p.text}</p>
      })}
    </div>
  )
}


/** Paragraphs, split the way the anchor resolver splits them — the index a
 *  note records has to mean the same thing on both sides. */
const paragraphsOf = (body: string): string[] =>
  body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)

const STATE_LABEL: Record<string, string> = {
  resolved: '', drifted: 'moved', orphaned: 'passage gone', 'no-scene': 'scene gone',
}

/** The notes rail: the author's thoughts on this chapter, anchored to the
 *  passages that provoked them (conventions §14). A note whose passage has
 *  moved says so; a note whose passage is gone keeps its quote and waits —
 *  arc never guesses where a thought now belongs. */
function NotesRail({ notes, open, closed, busy, onStatus, onFocus, composer, tops, cardRef, active }: {
  notes: ResolvedAnnotation[]
  /** The cards actually rendered, in the same order `tops` was measured for.
   *  Kept as a prop rather than recomputed here: measuring one list and
   *  rendering another is what slid every card off its paragraph. */
  open: ResolvedAnnotation[]
  closed: number
  busy: boolean
  onStatus: (id: string, status: string) => void
  onFocus: (id: string, scene: string, paragraph: number | null) => void
  /** The card holding attention — a note id, 'composer', or null for none. */
  active: string | null
  /** The note being written, rendered here rather than in the manuscript —
   *  a note is composed where it will live, and the prose never scrolls.
   *  Positioned like any other card; it holds index 0 of `tops`. */
  composer: ReactNode
  /** Final y for each card, aligned to the paragraph it annotates. The
   *  composer, when present, is first. */
  tops: number[]
  cardRef: (i: number, el: HTMLDivElement | null) => void
}) {
  return (
    <div className="notes-rail">
      <h3>Notes{notes.length > 0 && (
        <span className="chmeta">{open.length} open{closed ? ` · ${closed} closed` : ''}</span>
      )}</h3>
      {composer && (
        <div className={`note-slot${active && active !== 'composer' ? ' note-dim' : ''}`}
          ref={el => cardRef(0, el)} style={{ top: tops[0] ?? 0 }}>
          {composer}
        </div>
      )}
      {!notes.length && !composer && (
        <p className="fsummary">Select any passage to leave one. Notes stay anchored to the
          text that provoked them — and say so when the manuscript moves underneath.</p>
      )}
      {open.map((n, i) => (
        <div key={n.id} ref={el => cardRef(composer ? i + 1 : i, el)}
          onClick={() => onFocus(n.id, n.anchor.scene, n.resolution.paragraph)}
          className={`note note-${n.resolution.state}`
            + (active === n.id ? ' note-active' : active ? ' note-dim' : '')}
          style={{ top: tops[composer ? i + 1 : i] ?? 0 }}>
          <div className="note-head">
            <code>{n.id.replace('note.', '#')}</code>
            {STATE_LABEL[n.resolution.state] && <span className="note-state">{STATE_LABEL[n.resolution.state]}</span>}
          </div>
          {n.anchor.quote && (
            <blockquote className="note-quote">
              {n.anchor.quote}
            </blockquote>
          )}
          {n.resolution.note && <div className="note-why">{n.resolution.note}</div>}
          <div className="note-body">{n.body}</div>
          <div className="note-acts">
            <button disabled={busy} onClick={() => onStatus(n.id, 'resolved')}>resolve</button>
            <button disabled={busy} onClick={() => onStatus(n.id, 'dropped')}>drop</button>
          </div>
        </div>
      ))}
      {open.length === 0 && notes.length > 0 && <p className="fsummary">Nothing open on this chapter.</p>}
    </div>
  )
}

/** The running manuscript: chapters in reading order, each chapter's bound
 *  scenes (conventions §10) rendered below its canon outline. Position is
 *  the same chapter index book time uses — flipping to the world view shows
 *  the graph projected at this point in the manuscript.
 *
 *  The draft layer rides on top: main is the story repo's HEAD, the draft is
 *  the working tree. Changed scenes render with word-level highlights, the
 *  drawer carries the running change summary, and Accept ratifies the draft
 *  into main — the proposed → canon gate applied to prose, commit = ratify. */
export function ManuscriptView({ scenes, chapters, chapterIx, onChapter, onOpenWorld, draft, notes, onRefresh, onRefreshNotes, onCanonChanged }: {
  scenes: ProseScene[]
  chapters: Chapter[]          // sorted by order
  chapterIx: number
  onChapter: (ix: number) => void
  onOpenWorld: (id: string) => void
  draft: ProseDraft
  notes: ResolvedAnnotation[]
  onRefresh: () => void
  onRefreshNotes: () => void
  onCanonChanged?: () => void
}) {
  /** Which reading of the draft the author is on. A pending change is a
   *  question — keep this, or keep what I had — and answering it means being
   *  able to see both sides, not just the new prose with its markup toggled.
   *  'before' is the accepted book, 'proposed' the draft as it would read. */
  const [view, setView] = useState<'before' | 'changes' | 'proposed'>('changes')
  const showChanges = view === 'changes'
  const [drawer, setDrawer] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [armed, setArmed] = useState<string | null>(null)   // discard needs a second click
  const [capture, setCapture] = useState<ChatResponse | null>(null)   // the capture pass's briefing, post-accept

  // The drafting pass: generation into the working tree. Its own busy flag —
  // a pass runs for a minute or more and must not lock accept/discard.
  const [genBusy, setGenBusy] = useState(false)
  const [genErr, setGenErr] = useState<string | null>(null)
  const [gen, setGen] = useState<DraftSceneResponse | null>(null)
  const [guidance, setGuidance] = useState('')
  const [showGen, setShowGen] = useState(false)

  // Annotations: select prose, write the thought, keep reading. No
  // categorisation, no scope declaration — the author's only job is the note.
  const [sel, setSel] = useState<{ scene: string; paragraph: number; quote: string } | null>(null)
  const [noteText, setNoteText] = useState('')
  const [noteBusy, setNoteBusy] = useState(false)
  const [focused, setFocused] = useState<string | null>(null)
  /** Which card has the author's attention: a note id, 'composer', or none.
   *  Everything else recedes — the Google Docs convention every author
   *  already knows. Recede, never hide: a dimmed card stays readable enough
   *  to scan for the one you actually wanted. */
  const [active, setActive] = useState<string | null>(null)
  /** Step back out: the card and its passage lose attention together, so the
   *  prose is never left with a highlight pointing at nothing. */
  const clearAttention = useCallback(() => { setActive(null); setFocused(null) }, [])

  // Notes sit level with the paragraph that provoked them. Both columns
  // scroll as one region, so a card's y is measured against that region and
  // never needs re-measuring on scroll — only when the layout itself moves.
  const colsRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<(HTMLDivElement | null)[]>([])
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const [tops, setTops] = useState<number[]>([])
  const setCard = useCallback((i: number, el: HTMLDivElement | null) => { cardsRef.current[i] = el }, [])

  // The analysis pass: what would this draft do to the story? Read-only, and
  // never a gate on accepting — the author may ignore it entirely.
  const [analysis, setAnalysis] = useState<{ res: AnalyzeResponse; key: string } | null>(null)
  const [anBusy, setAnBusy] = useState(false)
  const [anErr, setAnErr] = useState<string | null>(null)

  // A half-armed discard must not survive closing the drawer or moving to
  // another chapter; a stale briefing must not survive the move either.
  const toggleDrawer = () => { setArmed(null); setDrawer(o => !o) }
  const gotoChapter = (i: number) => { setArmed(null); setGen(null); setGenErr(null); setShowGen(false); onChapter(i) }

  const byFile = useMemo(() => new Map(scenes.map(s => [s.file, s])), [scenes])
  const diffs = useMemo(() => {
    const m = new Map<string, ParaDiff[]>()
    for (const c of draft.changes) m.set(c.file, diffProse(c.main?.body ?? '', byFile.get(c.file)?.body ?? ''))
    return m
  }, [draft, byFile])
  // An analysis describes a specific set of files; when the draft set moves
  // under it the analysis is stale, so it is shown only while its key still
  // matches — derived rather than cleared, so no effect writes state.
  const draftKey = draft.changes.map(c => `${c.status}:${c.file}`).join('|')
  const shownAnalysis = analysis?.key === draftKey ? analysis.res : null

  const totals = useMemo(() => {
    let ins = 0, del = 0
    for (const d of diffs.values()) { const s = diffStats(d); ins += s.ins; del += s.del }
    return { ins, del }
  }, [diffs])

  const cur = chapters.length ? chapters[Math.min(chapterIx, chapters.length - 1)] : undefined
  const curScenes = useMemo(
    () => (cur ? scenes.filter(s => s.chapter === cur.id).sort((a, b) => a.file.localeCompare(b.file)) : []),
    [scenes, cur],
  )
  const chapterNotes = useMemo(
    () => notes.filter(x => curScenes.some(s => s.scene === x.anchor.scene))
      .filter(x => x.status !== 'resolved' && x.status !== 'dropped'),
    [notes, curScenes],
  )

  // Length in words — prose only, drafts included, because what stands in the
  // working tree is what a reader would read. Chapters with no scenes are
  // absent from the map rather than zero (wordcount.ts).
  const wordsBy = useMemo(() => wordsByChapter(scenes), [scenes])
  const bookWords = useMemo(() => totalWords(scenes), [scenes])

  // The rail renders open notes only; the measurement pass must walk the same
  // list or the tops slide off their paragraphs the moment one is closed.
  const openNotes = useMemo(
    () => chapterNotes.filter(n => n.status !== 'resolved' && n.status !== 'dropped'),
    [chapterNotes],
  )

  // Measure after paint: where each annotated paragraph sits, then stack the
  // cards so none overlaps its neighbour. Cards keep their own height, so one
  // extra pass settles it.
  useLayoutEffect(() => {
    const box = colsRef.current
    if (!box) return
    const measure = () => {
      const base = box.getBoundingClientRect().top
      const lineOf = (key: string | null) => {
        const el = key === null ? null : box.querySelector<HTMLElement>(`[data-para="${key}"]`)
        return el ? el.getBoundingClientRect().top - base : 0
      }
      // Exactly the cards the rail renders, in render order: the composer
      // first when open, then the notes it shows.
      const keys = [
        ...(sel ? [`${sel.scene}:${sel.paragraph}`] : []),
        ...openNotes.map(x => (x.resolution.paragraph === null ? null : `${x.anchor.scene}:${x.resolution.paragraph}`)),
      ]
      const desired = keys.map(lineOf)
      const heights = keys.map((_, i) => cardsRef.current[i]?.offsetHeight ?? 0)
      const next = stack(desired, heights)
      setTops(prev => (prev.length === next.length && prev.every((v, i) => Math.abs(v - next[i]) < 1) ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [openNotes, sel, view, diffs])

  // Escape steps back out of whatever holds attention, without discarding a
  // half-written note unless the composer is what is focused.
  useLayoutEffect(() => {
    if (!active) return
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') clearAttention() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, clearAttention])

  // Focus the composer only after the pass above has placed it, and never by
  // scrolling: autoFocus fires during commit, before the card has a top, so
  // the browser would scroll the whole region up to reveal it at y=0 — which
  // is exactly the jump to the top of the chapter this rail exists to avoid.
  useLayoutEffect(() => {
    if (sel) composerRef.current?.focus({ preventScroll: true })
  }, [sel])

  if (!chapters.length || !cur) return <div className="empty">No chapters in canon yet.</div>
  const curDeleted = draft.changes.filter(c => c.status === 'deleted' && c.main?.chapter === cur.id)
  const scenesOf = (id: string) => scenes.filter(s => s.chapter === id).length
  const spanText = [dateOf(cur.span.start), dateOf(cur.span.end)].filter(Boolean).join(' → ')
  const n = draft.changes.length

  // Kindle-style estimate over the chapter's drafted prose: ~250 words to a
  // page, ~230 words a minute; hidden while a chapter is outline-only.
  const words = wordsBy.get(cur.id) ?? 0
  const pages = Math.max(1, Math.round(words / 250))

  const bodyClick = wikilinkClickHandler(onOpenWorld)

  /** Text → the scene's own paragraph key, so a diffed paragraph anchors to
   *  the same index the note recorded. Matched on a prefix: word-level
   *  highlighting reassembles text with different spacing. */
  const paraKeyFor = (s: ProseScene) => {
    const paras = paragraphsOf(s.body).map(x => x.replace(/\s+/g, ' ').trim())
    return (text: string): string | undefined => {
      const needle = text.replace(/\s+/g, ' ').trim().slice(0, 60)
      if (!needle) return undefined
      const ix = paras.findIndex(x => x.startsWith(needle.slice(0, 40)))
      return ix > -1 ? `${s.scene}:${ix}` : undefined
    }
  }

  const run = async (op: () => Promise<unknown>) => {
    setBusy(true); setErr(null)
    try { await op(); onRefresh() } catch (e) { setErr((e as Error).message ?? String(e)) } finally { setBusy(false) }
  }
  const accept = () => run(async () => {
    const res = await acceptDraft(msg || undefined)
    setMsg('')
    setCapture(res.capture ?? null)
    if (res.capture?.canonChanged) onCanonChanged?.()
  })
  const analyze = async () => {
    setAnBusy(true); setAnErr(null)
    try { setAnalysis({ res: await analyzeDraft(), key: draftKey }) }
    catch (e) { setAnErr((e as Error).message ?? String(e)) }
    finally { setAnBusy(false) }
  }
  /** Capture the selection as an anchor: which scene, which paragraph, and
   *  the exact words.
   *
   *  The paragraph comes from where the selection STARTS in the DOM, not from
   *  matching the quote against a paragraph's text. Text matching cannot place
   *  a selection that spans more than one paragraph — no single paragraph
   *  contains it — and the old fallback sent every such note to index 0, the
   *  top of the scene. Selecting three paragraphs is ordinary; landing the
   *  note far from them is not.
   *
   *  Text matching survives as the fallback for a diffed body, where a
   *  paragraph the draft deleted carries no key of its own. */
  const captureSelection = (scene: ProseScene) => {
    const s = window.getSelection()
    const quote = s?.toString().trim() ?? ''
    if (!quote || !s || s.rangeCount === 0) return

    // startContainer, not anchorNode: it is the earlier point in document
    // order however the author dragged.
    const start = s.getRangeAt(0).startContainer
    const el = start.nodeType === Node.ELEMENT_NODE ? (start as Element) : start.parentElement
    const key = el?.closest('[data-para]')?.getAttribute('data-para')
    const fromDom = key?.startsWith(`${scene.scene}:`)
      ? Number(key.slice(scene.scene.length + 1))
      : NaN

    let paragraph = fromDom
    if (!Number.isInteger(paragraph)) {
      const paras = paragraphsOf(scene.body)
      const flat = quote.replace(/\s+/g, ' ')
      const ix = paras.findIndex(x => x.replace(/\s+/g, ' ').includes(flat))
      // A quote that matches nothing and has no key is anchored to the first
      // paragraph the selection touches only as a last resort.
      paragraph = ix > -1 ? ix : 0
    }
    setSel({ scene: scene.scene, paragraph, quote })
    setNoteText('')
    setActive('composer')
  }
  const saveNote = async () => {
    if (!sel || !noteText.trim()) return
    setNoteBusy(true)
    try { await createNote({ ...sel, body: noteText }); setSel(null); setActive(null); setNoteText(''); onRefreshNotes() }
    catch (e) { setErr((e as Error).message ?? String(e)) }
    finally { setNoteBusy(false) }
  }
  const noteStatus = async (id: string, status: string) => {
    setNoteBusy(true)
    try { await updateNote(id, status); onRefreshNotes() }
    catch (e) { setErr((e as Error).message ?? String(e)) }
    finally { setNoteBusy(false) }
  }

  const discard = (file: string) => {
    if (armed !== file) { setArmed(file); return }
    setArmed(null)
    void run(() => discardDraft(file))
  }

  const defaultMsg = `prose: accept draft (${n} scene${n === 1 ? '' : 's'})`



  const generate = async () => {
    setGenBusy(true); setGenErr(null); setGen(null)
    try {
      const res = await draftScene(cur.id, guidance.trim() || undefined)
      setGen(res)
      setGuidance('')
      onRefresh()
    } catch (e) {
      setGenErr((e as Error).message ?? String(e))
    } finally {
      setGenBusy(false)
    }
  }

  // The drafting-pass bar: always present on an outline-only chapter, toggled
  // from the header once scenes exist. The result is an ordinary draft — it
  // arrives in the draft layer with its pill, and accept/discard apply.
  const genBar = (
    <div className="genbar">
      <div className="genrow">
        <input value={guidance} disabled={genBusy}
          placeholder="guidance (optional) — tone, focus, what to lean into"
          onChange={ev => setGuidance(ev.target.value)} />
        <button disabled={genBusy} onClick={generate}>
          {genBusy ? 'Drafting…' : curScenes.length ? 'Draft next scene' : 'Draft this scene'}
        </button>
      </div>
      {genBusy && <p className="gen-note">arc is drafting from the chapter's context pack — style contract, cast state, payoff fence. This takes a minute or two.</p>}
      {genErr && <p className="db-err">{genErr}</p>}
      {gen && (
        <div className="db-capture">
          <h3>Drafting pass — briefing</h3>
          {gen.file
            ? <p className="gen-note">Wrote <code>{gen.file}</code> as a working-tree draft — review it below, then accept or discard.</p>
            : <p className="db-err">The pass finished without writing a scene — see the briefing.</p>}
          <div className="db-capture-reply">{gen.reply}</div>
        </div>
      )}
    </div>
  )

  return (
    <div className="ms-layout">
      <nav className="side-nav">
        <h3>Chapters</h3>
        {chapters.map((c, i) => {
          const w = wordsBy.get(c.id) ?? 0
          return (
          <button key={c.id} className={i === chapterIx ? 'navitem sel' : 'navitem'} onClick={() => gotoChapter(i)}>
            <span className="chn">{c.order === 0 ? 'P' : c.order}</span> {c.title}
            <span className="chmeta">{scenesOf(c.id) ? `${scenesOf(c.id)} scene${scenesOf(c.id) === 1 ? '' : 's'}` : 'outline'}
              {w > 0 && <>
                <span className="chwords">{formatWords(w)} words</span>
                <span className="chwords">{formatReadingTime(w)}</span>
              </>}
            </span>
          </button>
        )})}
        {bookWords > 0 && (
          <p className="nav-total">
            <span>{formatWords(bookWords)} words drafted</span>
            <span>{formatReadingTime(bookWords)} to read</span>
          </p>
        )}
      </nav>

      <div className="ms-scroll">
      <div className="ms-cols" ref={colsRef}
        onClickCapture={ev => {
          // Clicking away steps back out. An annotated paragraph and the rail
          // set their own attention; anything else in the columns clears it,
          // so the author never has to hunt for the way out.
          if (!active) return
          const t = ev.target as HTMLElement
          if (t.closest('.notes-rail') || t.closest('p.has-note')) return
          clearAttention()
        }}>
      <article className="ms-main">
        {draft.git && (
          <div className={n ? 'draftbar' : 'draftbar clean'}>
            {n ? (
              <>
                <span className="db-sum"><b>Draft</b> — {n} scene{n === 1 ? '' : 's'} changed ·{' '}
                  <span className="ins-ct">+{totals.ins}</span> <span className="del-ct">−{totals.del}</span> words vs main</span>
                <div className="db-views" role="group" aria-label="Which version to read">
                  {([['before', 'Before'], ['changes', 'Changes'], ['proposed', 'Proposed']] as const).map(([k, label]) => (
                    <button key={k} className={view === k ? 'on' : ''}
                      aria-pressed={view === k} onClick={() => setView(k)}>{label}</button>
                  ))}
                </div>
              </>
            ) : (
              <span className="db-sum">Manuscript matches main — no draft changes.</span>
            )}
            <button className="themeToggle" onClick={toggleDrawer}>{drawer ? 'Close' : 'Review'}</button>
          </div>
        )}

        {draft.git && drawer && (
          <div className="draftdrawer">
            {draft.changes.map(c => {
              const st = diffStats(diffs.get(c.file) ?? [])
              return (
                <div key={c.file} className="db-row">
                  <span className={`stpill ${c.status}`}>{c.status}</span>
                  <code>{c.file}</code>
                  <span><span className="ins-ct">+{st.ins}</span> <span className="del-ct">−{st.del}</span></span>
                  <button className="db-discard" disabled={busy} onClick={() => discard(c.file)}>
                    {armed === c.file ? 'discard — sure?' : 'discard'}
                  </button>
                </div>
              )
            })}
            {n > 0 && (
              <div className="db-analyze">
                <button disabled={anBusy} onClick={analyze}>
                  {anBusy ? 'Reading the draft…' : 'What did this scene change?'}
                </button>
                <span className="gen-note">
                  {anBusy
                    ? 'Reading the pending scenes against canon, the contract, and the style guide. Nothing is written.'
                    : 'A read-only pass before you decide — claims to weigh, not errors.'}
                </span>
              </div>
            )}
            {anErr && <p className="db-err">{anErr}</p>}
            {shownAnalysis && (
              <div className="db-analysis">
                <div className="an-head">
                  <h3>What this draft would change</h3>
                  <span className="an-register" title="Model-read claims with citations — never presented as proven (conventions §11)">
                    argued — claims to review
                  </span>
                </div>
                <div className="db-capture-reply">{shownAnalysis.briefing}</div>
                <p className="an-foot">{shownAnalysis.files.length} scene{shownAnalysis.files.length === 1 ? '' : 's'} read · {shownAnalysis.engine === 'claude-cli' ? 'claude CLI' : 'API'} · nothing was written</p>
              </div>
            )}
            {n > 0 && (
              <div className="db-accept">
                <input value={msg} placeholder={defaultMsg} onChange={ev => setMsg(ev.target.value)} />
                <button disabled={busy} onClick={accept}>Accept into main</button>
              </div>
            )}
            {err && <p className="db-err">{err}</p>}
            {capture && (
              <div className="db-capture">
                <h3>What this scene changed — capture pass</h3>
                <div className="db-capture-reply">{capture.reply}</div>
                {capture.actions.length > 0 && (
                  <div className="db-capture-actions">
                    {capture.actions.map((a, i) => (
                      <span key={i} className={`cap-action${a.ok ? '' : ' failed'}`}>
                        ✎ {a.path}{a.ok ? '' : ` — ${a.detail}`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="db-history">
              <h3>Ratified versions</h3>
              {draft.history.map(h => (
                <div key={h.hash} className="db-hrow">
                  <code>{h.hash}</code><span>{h.date}</span><span className="db-hsub">{h.subject}</span>
                </div>
              ))}
              {!draft.history.length && <p className="fsummary">No ratified prose yet — the first accept starts the history.</p>}
            </div>
          </div>
        )}

        <header className="ms-head">
          <h1>{cur.order === 0 ? 'Prologue' : `Chapter ${cur.order}`} — {cur.title}
            <CopyProse get={() => chapterText(copyableScenes(curScenes, draft.changes))} label="copy chapter"
              disabled={!curScenes.length}
              title={curScenes.length
                ? `Copy the prose of all ${curScenes.length} scene${curScenes.length === 1 ? '' : 's'} in this chapter`
                : 'Nothing drafted in this chapter yet'} />
          </h1>
          <p className="ms-meta">{spanText}{cur.part ? ` · ${cur.part}` : ''}
            {words > 0 && ` · ${formatWords(words)} words · ~${pages} page${pages === 1 ? '' : 's'} · ${formatReadingTime(words)} read`}
            {' · '}<span className={`stpill ${cur.status}`}>{cur.status}</span>
            {curScenes.length > 0 && (
              <>{' · '}<a className="linklike" onClick={() => setShowGen(o => !o)}>
                {showGen ? 'hide drafting' : 'draft next scene'}</a></>
            )}</p>
        </header>

        <blockquote className="ms-outline">
          <span className="olabel">Outline (canon)</span>
          {cur.summary}
        </blockquote>

        {curScenes.map(s => {
          const change = draft.changes.find(c => c.file === s.file)
          const diffed = change && showChanges ? diffs.get(s.file) : undefined
          // Before reads the accepted scene. A scene the draft ADDS has no
          // accepted version — say so rather than render an empty column.
          const beforeBody = view === 'before' && change ? (change.main?.body ?? null) : undefined
          const notYetInBook = view === 'before' && change?.status === 'added'
          return (
            <section key={s.scene} className="scene">
              <div className="scene-head">
                <code>{s.scene}</code>
                <CopyRef text={s.scene} />
                <CopyProse get={() => sceneText(s)} label="copy text"
                  title="Copy this scene's prose" disabled={!s.body.trim()} />
                <span className={`stpill ${s.status}`}>{s.status}</span>
                {change && <span className={`stpill ${change.status}`}>draft · {change.status}</span>}
                {s.pov && <a className="linklike" onClick={() => onOpenWorld(s.pov!)}>POV {s.pov}</a>}
                <span className="rests">rests on{' '}
                  {[...s.facts, ...s.events].map(id => (
                    <a key={id} className="wikilink" onClick={() => onOpenWorld(id)}>{id}</a>
                  ))}
                </span>
              </div>
              {s.contract && <ContractPanel c={s.contract} onOpenWorld={onOpenWorld} />}
              {notYetInBook
                ? <p className="fsummary">This scene is not in the book yet — the draft adds it. Read it under <b>Changes</b> or <b>Proposed</b>.</p>
                : beforeBody !== undefined
                ? (
                  // The accepted text, carrying no data-para keys: notes anchor
                  // to the prose being annotated, and this is different prose.
                  <div className="mdbody prose was-accepted" onClick={bodyClick}>
                    {paragraphsOf(beforeBody ?? '').map((p, pi) => (
                      <p key={pi} dangerouslySetInnerHTML={{ __html: mdToHtml(p).replace(/^<p>|<\/p>$/g, '') }} />
                    ))}
                  </div>
                )
                : diffed
                ? <DiffBody d={diffed} paraKey={paraKeyFor(s)} />
                : <div className="mdbody prose" onClick={bodyClick} onMouseUp={() => captureSelection(s)}>
                  {paragraphsOf(s.body).map((p, pi) => {
                    const anchored = notes.some(n =>
                      n.anchor.scene === s.scene && n.resolution.paragraph === pi &&
                      n.status !== 'resolved' && n.status !== 'dropped')
                    const isFocus = focused === `${s.scene}:${pi}`
                    const noteHere = notes.find(n =>
                      n.anchor.scene === s.scene && n.resolution.paragraph === pi &&
                      n.status !== 'resolved' && n.status !== 'dropped')
                    return (
                      <p key={pi} data-para={`${s.scene}:${pi}`}
                        onClick={noteHere ? () => { setActive(noteHere.id); setFocused(`${s.scene}:${pi}`) } : undefined}
                        className={`${anchored ? 'has-note' : ''}${isFocus ? ' note-focus' : ''}`}
                        dangerouslySetInnerHTML={{ __html: mdToHtml(p).replace(/^<p>|<\/p>$/g, '') }} />
                    )
                  })}
                </div>}
            </section>
          )
        })}

        {/* A scene the draft removes. In Before it is simply part of the book,
            because that is what Before means; only Changes marks it as going.
            Proposed omits it — it is meant to read as the finished book. */}
        {view !== 'proposed' && curDeleted.map(c => (
          <section key={c.file} className="scene">
            <div className="scene-head">
              <code>{c.main!.scene}</code>
              {view === 'changes' && <span className="stpill deleted">draft · deleted</span>}
            </div>
            {view === 'before'
              ? <div className="mdbody prose was-accepted" onClick={bodyClick}>
                {paragraphsOf(c.main!.body).map((p, pi) => (
                  <p key={pi} dangerouslySetInnerHTML={{ __html: mdToHtml(p).replace(/^<p>|<\/p>$/g, '') }} />
                ))}
              </div>
              : <DiffBody d={diffs.get(c.file) ?? []} />}
          </section>
        ))}

        {curScenes.length > 0 && showGen && genBar}

        {!curScenes.length && !curDeleted.length && (
          <>
            <p className="ms-empty">No scenes drafted yet — the outline above is this chapter's canon summary.
              Scenes land in <code>prose/ch-{String(cur.order).padStart(2, '0')}/</code> with frontmatter binding them to the facts they rest on.
              Write one by hand, or let arc draft it from the record's own context.</p>
            {genBar}
          </>
        )}
      </article>

      <NotesRail
        notes={chapterNotes} open={openNotes} closed={chapterNotes.length - openNotes.length}
        tops={tops} cardRef={setCard} active={active}
        busy={noteBusy} onStatus={noteStatus}
        onFocus={(id, scene, para) => {
          setActive(id)
          setFocused(para === null ? null : `${scene}:${para}`)
        }}
        composer={sel && (
          <div className="note-composer">
            <blockquote className="note-quote">{sel.quote}</blockquote>
            <textarea ref={composerRef} value={noteText} rows={4}
              placeholder="What did you notice? Write it as you would say it — arc works out the scope."
              onChange={ev => setNoteText(ev.target.value)}
              onKeyDown={ev => {
                if (ev.key === 'Escape') { setSel(null); setActive(null) }
                if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) void saveNote()
              }} />
            <div className="note-acts">
              <button disabled={noteBusy || !noteText.trim()} onClick={saveNote}>
                {noteBusy ? 'saving…' : 'Leave note'}
              </button>
              <button disabled={noteBusy} onClick={() => { setSel(null); setActive(null) }}>cancel</button>
            </div>
          </div>
        )} />
      </div>
      </div>
    </div>
  )
}
