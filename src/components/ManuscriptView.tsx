import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AnalyzeResponse, Chapter, ChatResponse, DraftSceneResponse, ProseDraft, ProseScene, ResolvedAnnotation, SceneContract } from '../canon'
import { dateOf } from '../canon'
import { acceptDraft, acceptParagraph, analyzeDraft, createNote, discardDraft, draftScene, suggestText, updateNote, writeScene } from '../api'
import { wikilinkClickHandler } from '../wikilinks'
import { mdToHtml } from '../md'
import { diffProse, diffStats, type ParaDiff } from '../diff'
import {
  formatReadingTime, formatWords, nextRegister, pageCount, progressLabel, totalWords, wordsByChapter,
  type ProgressRegister,
} from '../wordcount'
import { CopyProse, CopyRef } from './CopyRef'
import { chapterText, copyableScenes, isSingleWord, paragraphAtOffset, sceneText } from '../manuscript-text'
import { stack } from '../note-stack'
import { Working } from './Working'

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
function DiffBody({ d, paraKey, onAccept, busy }: {
  d: ParaDiff[]
  paraKey?: (text: string) => string | undefined
  /** Accept just this paragraph. The whole-draft button at the top takes
   *  every change as one judgment; a chapter with four edits is four. */
  onAccept?: (paragraphIndex: number) => void
  busy?: boolean
}) {
  const keyOf = (p: ParaDiff): string | undefined => {
    if (!paraKey) return undefined
    const text = p.kind === 'changed'
      ? (p.pieces ?? []).filter(x => x.kind !== 'del').map(x => x.text).join(' ')
      : p.text ?? ''
    return paraKey(text)
  }
  // A diff is two versions overlaid, so the browser's own copy takes both:
  // selecting across an edit yields "For nine eleven days", text that exists in
  // no version of the book. Copy the version the author is heading toward and
  // drop what the draft removed.
  const onCopy = (ev: React.ClipboardEvent) => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return
    const frag = selection.getRangeAt(0).cloneContents()
    frag.querySelectorAll('del').forEach(x => x.remove())
    const text = (frag.textContent ?? '').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim()
    if (!text) return
    ev.clipboardData.setData('text/plain', text)
    ev.preventDefault()
  }
  return (
    <div className="mdbody prose" onCopy={onCopy}>
      {d.map((p, i) => {
        const takeIt = (kp?: string) => {
          const ix = kp ? Number(kp.slice(kp.lastIndexOf(':') + 1)) : NaN
          return onAccept && Number.isInteger(ix)
            ? <button className="para-accept" disabled={busy} title="Accept this change into the book"
                onClick={() => onAccept(ix)}>accept</button>
            : null
        }
        if (p.kind === 'changed') {
          const kp = keyOf(p)
          return (
            <p key={i} data-para={kp} className="para-changed">
              {p.pieces!.map((pc, k) =>
                pc.kind === 'same' ? <span key={k}>{pc.text} </span>
                  : pc.kind === 'ins' ? <ins key={k}>{pc.text} </ins>
                    : <del key={k}>{pc.text} </del>)}
              {takeIt(kp)}
            </p>
          )
        }
        if (p.kind === 'ins') {
          const kp = keyOf(p)
          return <p key={i} data-para={kp} className="para-changed"><ins>{p.text}</ins>{takeIt(kp)}</p>
        }
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

/** Manuscript modes, the Claude-Code pattern: one surface, two ways to touch
 *  it, an explicit switch rather than one gesture trying to mean three
 *  things. NOTES is today's manuscript — select to compose, click a note to
 *  focus it. EDIT makes the prose itself a writing surface: click anywhere,
 *  type, and it lands in the draft layer as you go. READ is the third
 *  position: every gesture is inert — selection just selects, a click is
 *  just a click — the chrome recedes, and the prose column is the page.
 *  The mode where you meet the book the way a reader would.
 *
 *  `Shift+Tab`, not `Ctrl+Tab`: Chrome reserves Ctrl+Tab for switching
 *  browser tabs and never delivers the keystroke to the page at all. */
type Mode = 'notes' | 'edit' | 'read'
const MODE_ORDER: Mode[] = ['edit', 'notes', 'read']
const MODE_CHORD = 'Shift+Tab'
const MODE_KEY = 'arc.manuscript.mode'

/** Sticky for the tab's session, not forever — a mode is a stance the author
 *  takes on THIS visit, not a standing preference like the theme (A16). */
function readMode(): Mode {
  try {
    const v = sessionStorage.getItem(MODE_KEY)
    return v === 'edit' || v === 'read' ? v : 'notes'
  } catch { return 'notes' }
}
function writeMode(m: Mode): void {
  try { sessionStorage.setItem(MODE_KEY, m) } catch { /* preference is a nicety */ }
}

/** Which register the progress footer states position in. A Kindle asks the
 *  reader once and then remembers; a reader who thinks in minutes should not
 *  have to say so again at the top of every chapter. Session-scoped for the
 *  same reason the mode is — it belongs to this sitting. */
const PROGRESS_KEY = 'arc.manuscript.progress'

function readRegister(): ProgressRegister {
  try {
    const v = sessionStorage.getItem(PROGRESS_KEY)
    return v === 'pages' || v === 'minutes' || v === 'words' ? v : 'page'
  } catch { return 'page' }
}
function writeRegister(r: ProgressRegister): void {
  try { sessionStorage.setItem(PROGRESS_KEY, r) } catch { /* preference is a nicety */ }
}

/** Where the reader had got to, remembered per chapter for this sitting.
 *
 *  A PARAGRAPH, not a pixel. Notes mode and Read mode set the same prose at
 *  different measures, with different furniture above it, so a scroll offset
 *  taken in one means nothing in the other — the only thing the two layouts
 *  agree on is which paragraph of which scene the reader was looking at.
 *  `frac` is how far into that paragraph the top of the page had cut, which
 *  keeps a long paragraph from snapping back to its first line. */
const POS_KEY = 'arc.manuscript.pos'
interface Anchor { key: string; frac: number }

function readPositions(): Record<string, Anchor> {
  try {
    const v = JSON.parse(sessionStorage.getItem(POS_KEY) ?? '{}')
    return v && typeof v === 'object' ? v as Record<string, Anchor> : {}
  } catch { return {} }
}
function writePosition(chapter: string, a: Anchor): void {
  try {
    const all = readPositions()
    all[chapter] = a
    sessionStorage.setItem(POS_KEY, JSON.stringify(all))
  } catch { /* a remembered place is a nicety */ }
}

/** The notes rail: the author's thoughts on this chapter, anchored to the
 *  passages that provoked them (conventions §14). A note whose passage has
 *  moved says so; a note whose passage is gone keeps its quote and waits —
 *  arc never guesses where a thought now belongs. */
function NotesRail({ notes, open, closed, busy, onStatus, onFocus, composer, tops, cardRef, active, editing, onEdit, onEditCancel, onEditSave }: {
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
  /** The note being revised, and its working text. First phrasings are rough;
   *  a note the author cannot sharpen is one they drop and rewrite, losing
   *  its anchor and its place in the record. */
  editing: { id: string; text: string } | null
  onEdit: (n: ResolvedAnnotation) => void
  onEditCancel: () => void
  onEditSave: (text: string) => void
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
          {editing?.id === n.id ? (
            <>
              <textarea className="note-edit" autoFocus rows={4} value={editing.text}
                onChange={ev => onEdit({ ...n, body: ev.target.value })}
                onKeyDown={ev => {
                  if (ev.key === 'Escape') { ev.stopPropagation(); onEditCancel() }
                  if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) onEditSave(editing.text)
                }} />
              <div className="note-acts">
                <button disabled={busy || !editing.text.trim()} onClick={() => onEditSave(editing.text)}>
                  {busy ? 'saving…' : 'Save'}
                </button>
                <button disabled={busy} onClick={onEditCancel}>cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="note-body">{n.body}</div>
              <div className="note-acts">
                {/* Its own affordance: clicking the card already means focus. */}
                <button disabled={busy} onClick={() => onEdit(n)}>edit</button>
                <button disabled={busy} onClick={() => onStatus(n.id, 'resolved')}>resolve</button>
                <button disabled={busy} onClick={() => onStatus(n.id, 'dropped')}>drop</button>
              </div>
            </>
          )}
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
  // `yHint`: where the composer should sit when there is no [data-para]
  // element to measure against — Edit mode renders a textarea, not
  // paragraphs, so a note born there brings its own y (the click point).
  const [sel, setSel] = useState<{ scene: string; paragraph: number; quote: string; yHint?: number } | null>(null)
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
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)

  /** The scroll region the manuscript lives in. Declared up here rather than
   *  beside the notes-rail refs because the reading position is captured on
   *  the way OUT of a mode — before the switch, while the old layout is still
   *  on screen — so `switchMode` below has to be able to reach it. */
  const scrollRef = useRef<HTMLDivElement>(null)

  /** Which paragraph the top of the page is cutting through, if any. Returns
   *  null in Edit mode, which renders textareas and has no paragraphs to
   *  anchor to — a null is "do not overwrite what we remembered", never
   *  "the reader is at the top". */
  const anchorNow = useCallback((): Anchor | null => {
    const box = scrollRef.current
    if (!box) return null
    // Untouched since we put them here: the reader has not moved, so their
    // place is still the one we were asked to restore — not whatever this
    // layout was tall enough to show.
    const put = restoredRef.current
    if (put && Math.abs(box.scrollTop - put.scrollTop) < 1) return put.anchor
    const top = box.getBoundingClientRect().top
    for (const el of box.querySelectorAll<HTMLElement>('[data-para]')) {
      const r = el.getBoundingClientRect()
      if (r.bottom <= top + 1) continue          // scrolled past
      const frac = r.height > 0 ? Math.min(1, Math.max(0, (top - r.top) / r.height)) : 0
      return { key: el.dataset.para!, frac }
    }
    return null
  }, [])

  /** Put the reader back. A paragraph that no longer exists lands on the
   *  nearest one still in its scene, and a scene that is gone entirely lands
   *  at the end of what is left — the point is never to answer "come back to
   *  where I was" with a blank page. */
  const restoreAnchor = useCallback((a: Anchor): void => {
    const box = scrollRef.current
    if (!box) return
    const scene = a.key.slice(0, a.key.lastIndexOf(':'))
    const inScene = box.querySelectorAll<HTMLElement>(`[data-para^="${scene}:"]`)
    if (!inScene.length && !box.querySelector('[data-para]')) return   // nothing rendered yet
    const el = box.querySelector<HTMLElement>(`[data-para="${a.key}"]`) ?? inScene[inScene.length - 1]
    if (!el) { box.scrollTop = box.scrollHeight; return }              // the browser clamps
    const r = el.getBoundingClientRect()
    box.scrollTop += (r.top - box.getBoundingClientRect().top) + a.frac * r.height
    // Read back what the browser actually accepted, so we can tell later
    // whether the reader has moved from here or whether this is simply as
    // close as this layout could get.
    restoredRef.current = { anchor: a, scrollTop: box.scrollTop }
  }, [])

  /** The chapter a remembered place belongs to. Positions are per chapter:
   *  reading seven, glancing at two and coming back to seven has to land
   *  where seven was left, not where two was. */
  const chapterKey = chapters.length ? chapters[Math.min(chapterIx, chapters.length - 1)].id : ''

  /** Where "read from here" wants to start, held until the mode has actually
   *  switched and the reading layout exists to scroll. A ref, not state: it
   *  is consumed by the effect that restores position and never renders. */
  const pendingRef = useRef<Anchor | null>(null)

  /** The last place we put the reader, and the scroll offset it produced.
   *
   *  This exists because the two layouts are not the same height: Read sets
   *  the prose in a 68-character column and runs nearly twice as long as
   *  Notes. A paragraph near the end of the reading layout can sit inside the
   *  last screenful of the working layout, where no amount of scrolling will
   *  bring it to the top — the browser clamps, and re-reading the position
   *  from that clamped view would quietly move the reader backwards and then
   *  remember the wrong place.
   *
   *  So the place only changes when the reader actually moves. If the scroll
   *  offset is still exactly where we left it, we keep the anchor we put
   *  there rather than re-deriving one from a view that could not honour it. */
  const restoredRef = useRef<{ anchor: Anchor; scrollTop: number } | null>(null)

  /** Mode: which of the two things a click and a keystroke mean right now. */
  const [mode, setModeState] = useState<Mode>(() => readMode())

  /** Edit mode's working text, one entry per scene the author has typed into
   *  — everything not in here just reads `s.body` straight from props, which
   *  is also how a scene the author hasn't touched stays live if something
   *  else (a discard, another session) changes it underneath.
   *
   *  `lastSavedRef` is the baseline each write is checked against — the
   *  A17-1 guard, carried forward — kept as a ref rather than state because
   *  nothing needs to re-render when it changes; it exists purely for the
   *  next flush to read. Seeded once per file, in `onEditChange`, from the
   *  prop value at the moment the author's first keystroke lands — the only
   *  point a plain (unedited) scene body is known good. */
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  /** No entry means idle. The message is carried here rather than through
   *  the shared `err` banner (which lives inside the Review drawer, closed
   *  by default) — a refused save has to be visible without an extra click
   *  to find it. */
  const [editStatus, setEditStatus] = useState<Record<string, { state: 'saving' | 'error'; message?: string }>>({})
  const overridesRef = useRef(overrides)
  useEffect(() => { overridesRef.current = overrides }, [overrides])
  const lastSavedRef = useRef<Record<string, string>>({})
  const editTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  /** Write one file's current text, if it actually differs from its last
   *  known-saved baseline. Debounce timers and mode/chapter switches both
   *  fall through here — a save is a save regardless of what triggered it.
   *  A stale baseline (something else changed the file) is exactly what the
   *  A17-1 guard is for: writeScene refuses rather than clobbers, and the
   *  author sees why instead of losing work silently. */
  const flushFile = useCallback(async (file: string) => {
    const timer = editTimers.current[file]
    if (timer) { clearTimeout(timer); delete editTimers.current[file] }
    const text = overridesRef.current[file]
    if (text === undefined) return
    const baseline = lastSavedRef.current[file] ?? ''
    if (text === baseline) return
    setEditStatus(s => ({ ...s, [file]: { state: 'saving' } }))
    try {
      await writeScene(file, text, baseline)
      lastSavedRef.current[file] = text
      setEditStatus(s => { if (!(file in s)) return s; const next = { ...s }; delete next[file]; return next })   // idle = no entry
      onRefresh()   // the draft layer picks it up as an ordinary change
    } catch (e) {
      setEditStatus(s => ({ ...s, [file]: { state: 'error', message: (e as Error).message ?? String(e) } }))
    }
  }, [onRefresh])

  const flushAllEdits = useCallback(() => {
    const files = new Set([...Object.keys(editTimers.current), ...Object.keys(overridesRef.current)])
    files.forEach(file => { void flushFile(file) })
  }, [flushFile])

  // Never lose a keystroke to a mode switch, a chapter change, or leaving the
  // page — flush is idempotent (a clean file is a no-op), so calling it
  // liberally costs nothing.
  useEffect(() => () => flushAllEdits(), [flushAllEdits])

  /** Grow the editor to its content. `field-sizing: content` does this in
   *  CSS where supported (Chrome); this is the fallback, called from the
   *  callback ref on mount (first paint must be right, not just post-
   *  keystroke) and from onEditChange as the text moves. Cheap enough to
   *  run unconditionally rather than feature-detect. */
  const autosize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  const onEditChange = (file: string, text: string, currentBody: string, el?: HTMLTextAreaElement) => {
    if (lastSavedRef.current[file] === undefined) lastSavedRef.current[file] = currentBody
    setOverrides(prev => ({ ...prev, [file]: text }))
    if (el) autosize(el)
    const timer = editTimers.current[file]
    if (timer) clearTimeout(timer)
    editTimers.current[file] = setTimeout(() => { void flushFile(file) }, 700)
  }

  const switchMode = useCallback((next: Mode) => {
    flushAllEdits()
    // Mark the place BEFORE the layout changes under it. Notes and Read set
    // the same paragraphs at different measures with different furniture
    // above them, so the anchor is only meaningful while the layout it was
    // taken in is still the one on screen.
    const here = anchorNow()
    if (here && chapterKey) writePosition(chapterKey, here)
    setModeState(next)
    writeMode(next)
    // Edit means edit the proposed text — force the reading onto it, since
    // Before and Changes are exactly the two views the prose is NOT
    // editable in. Without this, the ordinary case (a clean scene, no draft
    // yet, `view` still at its 'changes' default) would leave the author
    // clicking Edit and finding nothing editable.
    if (next === 'edit') setView('proposed')
    // Read leaves no arc furniture standing: an open composer, a focused
    // note, a hanging menu — all of it is exactly the clutter the mode
    // exists to clear.
    if (next === 'read') {
      setSel(null); setActive(null); setFocused(null)
      setSelMenu(null); setSuggest(null); setEditing(null)
    }
  }, [flushAllEdits, anchorNow, chapterKey])

  const cycleMode = useCallback(() => {
    switchMode(MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length])
  }, [mode, switchMode])

  /** Start reading at this scene. The affordance lives on the scene head,
   *  beside "copy text" — never on the prose, whose gestures are already
   *  spent three times over, and never a right-click menu, which would cost
   *  the author the browser's own. */
  const readFrom = useCallback((scene: string) => {
    pendingRef.current = { key: `${scene}:0`, frac: 0 }
    switchMode('read')
  }, [switchMode])

  /** The mode chord belongs to the PAGE, not to one box on it.
   *
   *  It first lived on the prose columns, which meant it only answered once
   *  focus was already inside them — arriving on the manuscript, or clicking a
   *  chapter in the nav, left it dead, and a chord that works only sometimes
   *  reads as broken rather than scoped. This component mounts only on the
   *  manuscript page, so its own lifetime is exactly the right scope: the
   *  listener cannot outlive the page or reach World, Wiki, or Style.
   *
   *  Capture phase, and preventDefault: Shift+Tab is the browser's reverse
   *  focus move, and cycling the mode while focus also jumps somewhere else
   *  is two effects from one chord. */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Tab' || !ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return
      ev.preventDefault()
      ev.stopPropagation()
      cycleMode()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [cycleMode])

  /** The selection menu: right-click on selected text in the editor. Holds
   *  everything an action needs so the selection may collapse the moment the
   *  menu opens without losing anything. Coordinates are viewport-relative
   *  (the menu is position:fixed). */
  const [selMenu, setSelMenu] = useState<{
    file: string; scene: string; body: string
    start: number; end: number; quote: string
    x: number; y: number
  } | null>(null)

  /** The suggestion popover (A17-7): what was asked, and what came back.
   *  Suggestions are argued — listed, never applied without a click. */
  const [suggest, setSuggest] = useState<{
    kind: 'rephrase' | 'synonyms'
    menu: NonNullable<typeof selMenu>
    items: string[] | null      // null = in flight
    error: string | null
  } | null>(null)

  // Click-away and Escape put both down — the ordinary two ways out.
  useEffect(() => {
    if (!selMenu && !suggest) return
    const down = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement
      if (t.closest('.sel-menu') || t.closest('.suggest-pop')) return
      setSelMenu(null); setSuggest(null)
    }
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setSelMenu(null); setSuggest(null) } }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
    }
  }, [selMenu, suggest])

  // Scrolling closes the CONTEXT MENU only. A menu pinned to a point in the
  // text is wrong the moment that point moves, so it goes. The suggestion
  // popover stays: it is a result the author is reading, sometimes several
  // sentences of it, and closing it out from under them means running the
  // pass again to get it back. It leaves by click-away, Escape, or a pick.
  useEffect(() => {
    if (!selMenu) return
    const scroll = () => setSelMenu(null)
    window.addEventListener('scroll', scroll, true)
    return () => window.removeEventListener('scroll', scroll, true)
  }, [selMenu])

  /** Right-click on selected editor text: our menu. With nothing selected the
   *  browser's own menu stands — spell-check and paste live there, and a
   *  custom menu that eats them makes the editor worse at being an editor. */
  const onEditorContextMenu = (ev: React.MouseEvent<HTMLTextAreaElement>, s: ProseScene) => {
    const el = ev.currentTarget
    if (el.selectionStart === el.selectionEnd) return   // native menu
    ev.preventDefault()
    const body = overrides[s.file] ?? s.body
    setSuggest(null)
    setSelMenu({
      file: s.file, scene: s.scene, body,
      start: el.selectionStart, end: el.selectionEnd,
      quote: body.slice(el.selectionStart, el.selectionEnd).trim(),
      x: ev.clientX, y: ev.clientY,
    })
  }

  /** Menu → Add note: the same composer, anchored by offset arithmetic
   *  instead of DOM ranges, carrying its own y because Edit mode has no
   *  [data-para] lines to measure against. */
  const noteFromMenu = () => {
    if (!selMenu) return
    const box = colsRef.current
    const yHint = box ? Math.max(0, selMenu.y - box.getBoundingClientRect().top) : 0
    setSel({
      scene: selMenu.scene,
      paragraph: paragraphAtOffset(selMenu.body, selMenu.start),
      quote: selMenu.quote,
      yHint,
    })
    setNoteText('')
    setActive('composer')
    setSelMenu(null)
  }

  /** Menu → Rephrase/Synonyms: ask, list, and only ever apply on a click. */
  const askSuggest = async (kind: 'rephrase' | 'synonyms') => {
    if (!selMenu) return
    const menu = selMenu
    setSelMenu(null)
    setSuggest({ kind, menu, items: null, error: null })
    try {
      const res = await suggestText({
        kind, file: menu.file, selection: menu.quote,
        paragraph: paragraphsOf(menu.body)[paragraphAtOffset(menu.body, menu.start)] ?? '',
      })
      setSuggest(cur => (cur && cur.menu === menu ? { ...cur, items: res.suggestions } : cur))
    } catch (e) {
      setSuggest(cur => (cur && cur.menu === menu ? { ...cur, error: (e as Error).message ?? String(e) } : cur))
    }
  }

  /** Applying a suggestion is just typing: replace exactly the selection and
   *  ride the ordinary autosave path, baseline guard included. */
  const applySuggestion = (text: string) => {
    if (!suggest) return
    const { menu } = suggest
    const current = overridesRef.current[menu.file] ?? menu.body
    // The body may have moved since the menu opened (autosave round-trip);
    // re-locate the quote rather than trusting the stale offsets blindly.
    const at = current.slice(menu.start, menu.end).trim() === menu.quote
      ? menu.start
      : current.indexOf(menu.quote)
    if (at < 0) { setSuggest({ ...suggest, error: 'the passage changed under this suggestion — reselect and try again' }); return }
    const end = current.slice(menu.start, menu.end).trim() === menu.quote ? menu.end : at + menu.quote.length
    onEditChange(menu.file, current.slice(0, at) + text + current.slice(end), menu.body)
    setSuggest(null)
  }

  const saveEdit = async (text: string) => {
    if (!editing || !text.trim()) return
    setNoteBusy(true)
    try { await updateNote(editing.id, { body: text }); setEditing(null); onRefreshNotes() }
    catch (e) { setErr((e as Error).message ?? String(e)) }
    finally { setNoteBusy(false) }
  }

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
  const gotoChapter = (i: number) => {
    // Leaving a chapter is leaving off somewhere in it.
    const here = anchorNow()
    if (here && chapterKey) writePosition(chapterKey, here)
    flushAllEdits(); setArmed(null); setGen(null); setGenErr(null); setShowGen(false); onChapter(i)
  }

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

  // Where the reader is, 0 at the top of the chapter and 1 at its end.
  //
  // Measured from the scroll region rather than from the prose element,
  // because in Read mode the region IS the chapter: the rail is gone from
  // the DOM, the draft bar and the drawer do not render, and what is left
  // above the prose is a header two lines tall.
  //
  // Read mode only. Nothing else on the page states a position, and a scroll
  // listener that runs while the author is writing is a cost with no reader.
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const box = scrollRef.current
    if (!box || mode !== 'read') return
    const measure = () => {
      const max = box.scrollHeight - box.clientHeight
      // A chapter that fits on one screen is a chapter the reader has already
      // reached the end of — there is nothing further to scroll to, and
      // claiming they are at the top of it would be the false statement.
      setProgress(max > 1 ? Math.min(1, Math.max(0, box.scrollTop / max)) : 1)
    }
    measure()
    box.addEventListener('scroll', measure, { passive: true })
    // The content's height, not the window's: prose arriving, a chapter
    // changing under the same scroll position, an accepted draft shortening
    // the page — all move the end of the chapter without any scrolling.
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    if (colsRef.current) ro.observe(colsRef.current)
    return () => { box.removeEventListener('scroll', measure); ro.disconnect() }
  }, [mode, chapterIx, view])

  // Put the reader back where they were, after the layout they are going
  // into has been laid out. A layout effect, not an effect: restoring the
  // scroll after paint is a visible jump, and the whole point is that
  // changing stance does not lose your place.
  //
  // Edit mode is skipped deliberately — it renders textareas, which carry no
  // paragraphs to anchor to. Nothing is remembered on the way out of it
  // either, so a trip through Edit leaves the reading position untouched
  // rather than overwriting it with a guess.
  useLayoutEffect(() => {
    if (mode === 'edit') return
    const box = scrollRef.current
    if (!box || !box.querySelector('[data-para]')) return   // prose not on screen yet
    const a = pendingRef.current ?? readPositions()[chapterKey]
    pendingRef.current = null
    if (a) restoreAnchor(a)
  }, [mode, chapterKey, scenes.length, restoreAnchor])

  /** The register the footer states position in, and the click that cycles it. */
  const [register, setRegister] = useState<ProgressRegister>(() => readRegister())
  const cycleRegister = useCallback(() => {
    setRegister(r => { const next = nextRegister(r); writeRegister(next); return next })
  }, [])

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
      // A composer born in Edit mode measures against nothing (no [data-para]
      // in a textarea) — it carries its own line instead.
      if (sel?.yHint !== undefined && desired.length > 0 && desired[0] === 0) desired[0] = sel.yHint
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
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !editing) clearAttention() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, editing, clearAttention])

  // The composer does NOT take focus when it opens, and that is the whole
  // point: focusing an input collapses the document selection, so the passage
  // the author just highlighted stops being selected and Cmd+C copies an empty
  // textarea. Copying your own manuscript is a more basic expectation than
  // saving a keystroke.
  //
  // Typing claims focus instead. The first printable character moves into the
  // textarea and is carried with it, so leaving a note is still select-and-
  // type — the no-intermediate-prompt flow the annotation design asked for —
  // while Cmd+C, Cmd+A and the browser's own menu keep working because the
  // selection is still the document's.
  useLayoutEffect(() => {
    if (!sel) return
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement | null
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) return
      if (ev.key === 'Escape') { setSel(null); setActive(null); return }
      // Let every shortcut through — copy, select-all, find, reload.
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (ev.key.length !== 1) return
      ev.preventDefault()
      setNoteText(t => t + ev.key)
      composerRef.current?.focus({ preventScroll: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel])

  if (!chapters.length || !cur) return <div className="empty">No chapters in canon yet.</div>
  const curDeleted = draft.changes.filter(c => c.status === 'deleted' && c.main?.chapter === cur.id)
  const scenesOf = (id: string) => scenes.filter(s => s.chapter === id).length
  const spanText = [dateOf(cur.span.start), dateOf(cur.span.end)].filter(Boolean).join(' → ')
  const n = draft.changes.length

  // Kindle-style estimate over the chapter's drafted prose: ~250 words to a
  // page, ~230 words a minute; hidden while a chapter is outline-only. The
  // arithmetic lives in wordcount.ts so the header and the reading footer
  // cannot round the same chapter to different lengths.
  const words = wordsBy.get(cur.id) ?? 0
  const pages = pageCount(words)

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
    try { await updateNote(id, { status }); onRefreshNotes() }
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

      <div className="ms-scroll" ref={scrollRef}>
      <div className={mode === 'read' ? 'ms-cols reading' : 'ms-cols'} ref={colsRef}
        onClickCapture={ev => {
          // Clicking away steps back out. An annotated paragraph and the rail
          // set their own attention; anything else in the columns clears it,
          // so the author never has to hunt for the way out.
          if (!active) return
          const t = ev.target as HTMLElement
          if (t.closest('.notes-rail') || t.closest('p.has-note')) return
          if (editing) return   // a half-written revision is not clutter to clear
          clearAttention()
        }}>
      <article className="ms-main">
        {draft.git && mode !== 'read' && (
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

        {draft.git && drawer && mode !== 'read' && (
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
          <div className="ms-headrow">
            <h1>{cur.order === 0 ? 'Prologue' : `Chapter ${cur.order}`} — {cur.title}
              <CopyProse get={() => chapterText(copyableScenes(curScenes, draft.changes))} label="copy chapter"
                disabled={!curScenes.length}
                title={curScenes.length
                  ? `Copy the prose of all ${curScenes.length} scene${curScenes.length === 1 ? '' : 's'} in this chapter`
                  : 'Nothing drafted in this chapter yet'} />
            </h1>
            <div className="ms-modes" role="group" aria-label="Manuscript mode">
              <button className={mode === 'edit' ? 'on' : ''} aria-pressed={mode === 'edit'}
                disabled={!draft.git} onClick={() => switchMode('edit')}
                title={draft.git
                  ? `Click anywhere in the prose and type — it lands in the draft layer as you go. ${MODE_CHORD} cycles the mode.`
                  : 'Editing needs the story to be a git repository — there is no draft layer without one.'}>
                Edit
              </button>
              <button className={mode === 'notes' ? 'on' : ''} aria-pressed={mode === 'notes'}
                onClick={() => switchMode('notes')}
                title={`Select prose to leave a note, click a note to focus it. ${MODE_CHORD} cycles the mode.`}>
                Notes
              </button>
              <button className={mode === 'read' ? 'on' : ''} aria-pressed={mode === 'read'}
                onClick={() => switchMode('read')}
                title={`Just the book — no notes, no chrome, nothing to click. Select still copies. ${MODE_CHORD} cycles the mode.`}>
                Read
              </button>
            </div>
          </div>
          <p className="ms-meta">{spanText}{cur.part ? ` · ${cur.part}` : ''}
            {words > 0 && ` · ${formatWords(words)} words · ~${pages} page${pages === 1 ? '' : 's'} · ${formatReadingTime(words)} read`}
            {' · '}<span className={`stpill ${cur.status}`}>{cur.status}</span>
            {curScenes.length > 0 && mode !== 'read' && (
              <>{' · '}<a className="linklike" onClick={() => setShowGen(o => !o)}>
                {showGen ? 'hide drafting' : 'draft next scene'}</a></>
            )}</p>
        </header>

        {(mode !== 'read' || !curScenes.length) && (
          <blockquote className="ms-outline">
            <span className="olabel">Outline (canon)</span>
            {cur.summary}
          </blockquote>
        )}

        {curScenes.map(s => {
          const change = draft.changes.find(c => c.file === s.file)
          const diffed = change && showChanges ? diffs.get(s.file) : undefined
          // Before reads the accepted scene. A scene the draft ADDS has no
          // accepted version — say so rather than render an empty column.
          const beforeBody = view === 'before' && change ? (change.main?.body ?? null) : undefined
          const notYetInBook = view === 'before' && change?.status === 'added'
          return (
            <section key={s.scene} className="scene">
              {mode !== 'read' && <div className="scene-head">
                <code>{s.scene}</code>
                <CopyRef text={s.scene} />
                <CopyProse get={() => sceneText(s)} label="copy text"
                  title="Copy this scene's prose" disabled={!s.body.trim()} />
                {s.body.trim() && (
                  <a className="linklike" onClick={() => readFrom(s.scene)}
                    title="Read the book from this scene — no notes, no chrome, nothing to click">
                    read from here
                  </a>
                )}
                <span className={`stpill ${s.status}`}>{s.status}</span>
                {change && <span className={`stpill ${change.status}`}>draft · {change.status}</span>}
                {mode === 'edit' && view === 'proposed' && editStatus[s.file]?.state === 'saving' && (
                  <span className="fsummary">saving…</span>
                )}
                {mode === 'edit' && view === 'proposed' && editStatus[s.file]?.state === 'error' && (
                  <span className="db-err">not saved — {editStatus[s.file]?.message}</span>
                )}
                {s.pov && <a className="linklike" onClick={() => onOpenWorld(s.pov!)}>POV {s.pov}</a>}
                <span className="rests">rests on{' '}
                  {[...s.facts, ...s.events].map(id => (
                    <a key={id} className="wikilink" onClick={() => onOpenWorld(id)}>{id}</a>
                  ))}
                </span>
              </div>}
              {mode !== 'read' && s.contract && <ContractPanel c={s.contract} onOpenWorld={onOpenWorld} />}
              {mode === 'read'
                ? (
                  // The book, and only the book: the working tree's prose —
                  // what a reader would meet if the draft were accepted —
                  // with every arc gesture inert. Selection is the
                  // browser's; a click is just a click. Note marks stay as
                  // faint marginal facts, receded by the container class.
                  //
                  // It carries the same data-para keys the notes renderer
                  // does, and for the same reason it is the same prose:
                  // that key is how a reading position survives the switch
                  // between reading the book and working on it. (The
                  // was-accepted renderer still omits them — that really is
                  // different prose.)
                  <div className="mdbody prose">
                    {paragraphsOf(s.body).map((p, pi) => {
                      const anchored = notes.some(nn =>
                        nn.anchor.scene === s.scene && nn.resolution.paragraph === pi &&
                        nn.status !== 'resolved' && nn.status !== 'dropped')
                      return (
                        <p key={pi} data-para={`${s.scene}:${pi}`} className={anchored ? 'has-note' : ''}
                          dangerouslySetInnerHTML={{ __html: mdToHtml(p).replace(/^<p>|<\/p>$/g, '') }} />
                      )
                    })}
                  </div>
                )
                : mode === 'edit' && view === 'proposed'
                ? (
                  // Click anywhere, type, and it lands in the draft layer a
                  // moment later — no button, no separate save step. A plain
                  // textarea rather than contenteditable over rendered HTML:
                  // converting HTML back to markdown on every keystroke is
                  // lossy, and the thing it would lose is the prose itself.
                  // Clicking a textarea places the caret natively; there is
                  // no caret math to get right or wrong.
                  <div className="scene-edit">
                    <textarea value={overrides[s.file] ?? s.body} spellCheck ref={autosize}
                      onChange={ev => onEditChange(s.file, ev.target.value, s.body, ev.target)}
                      onContextMenu={ev => onEditorContextMenu(ev, s)} />
                  </div>
                )
                : notYetInBook
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
                ? <DiffBody d={diffed} paraKey={paraKeyFor(s)} busy={busy}
                    onAccept={ix => run(() => acceptParagraph(s.file, ix))} />
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
        {mode !== 'read' && view !== 'proposed' && curDeleted.map(c => (
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

        {curScenes.length > 0 && showGen && mode !== 'read' && genBar}

        {!curScenes.length && !curDeleted.length && (
          <>
            <p className="ms-empty">No scenes drafted yet — the outline above is this chapter's canon summary.
              Scenes land in <code>prose/ch-{String(cur.order).padStart(2, '0')}/</code> with frontmatter binding them to the facts they rest on.
              Write one by hand, or let arc draft it from the record's own context.</p>
            {mode !== 'read' && genBar}
          </>
        )}

        {/* Where you are, in the register you chose. Last in the flow and
            sticky to the foot of the column, so it pins itself over the
            prose while reading and moves no line that was already set. An
            outline-only chapter renders none: there is no position in prose
            that does not exist yet. */}
        {mode === 'read' && words > 0 && (
          <button className="ms-progress" onClick={cycleRegister}
            title="Click to count in pages, minutes or words instead">
            {progressLabel(register, progress, words)}
          </button>
        )}
      </article>

      {mode !== 'read' && <NotesRail
        notes={chapterNotes} open={openNotes} closed={chapterNotes.length - openNotes.length}
        tops={tops} cardRef={setCard} active={active}
        busy={noteBusy} onStatus={noteStatus}
        editing={editing}
        onEdit={n => { setEditing({ id: n.id, text: n.body }); setActive(n.id) }}
        onEditCancel={() => setEditing(null)}
        onEditSave={saveEdit}
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
        )} />}
      </div>
      </div>

      {selMenu && (
        <div className="sel-menu" style={{ left: selMenu.x, top: selMenu.y }}>
          <button onClick={noteFromMenu}>Add note</button>
          <button onClick={() => void askSuggest('rephrase')}>Rephrase…</button>
          {/* Synonyms answers with drop-in replacements — same part of speech,
              same case — which only means anything for one word. Unavailable
              rather than hidden, so a menu that changes shape between
              selections still accounts for itself.

              aria-disabled, NOT disabled: a disabled button takes no pointer
              events at all in Chrome, so its title never fires — the reason
              would be written down somewhere the mouse can never reach it.
              Hence the reason inline, where it needs no hover to be read. */}
          {isSingleWord(selMenu.quote) ? (
            <button onClick={() => void askSuggest('synonyms')}
              title="Alternatives for this word, with a note on what each one carries">
              Synonyms…
            </button>
          ) : (
            <button className="off" aria-disabled="true" onClick={ev => ev.preventDefault()}>
              Synonyms…
              <span className="mi-why">one word at a time — use Rephrase for a passage</span>
            </button>
          )}
        </div>
      )}
      {suggest && (
        <div className="suggest-pop" style={{ left: suggest.menu.x, top: suggest.menu.y }}>
          <div className="sp-head">
            <b>{suggest.kind === 'rephrase' ? 'Rephrase' : 'Synonyms'}</b>
            <span className="an-register" title="Model suggestions — yours to take or leave, never applied on their own (conventions §11)">
              suggestions — yours to take or leave
            </span>
          </div>
          <blockquote className="note-quote">{suggest.menu.quote.length > 120 ? suggest.menu.quote.slice(0, 120) + '…' : suggest.menu.quote}</blockquote>
          {suggest.items === null && !suggest.error && (
            <Working label={suggest.kind === 'rephrase'
              ? 'Rewriting against your own style contract'
              : 'Looking for words that keep the period and the voice'} />
          )}
          {suggest.error && <p className="db-err">{suggest.error}</p>}
          {suggest.items?.map((it, i) => (
            <button key={i} className="sp-item" onClick={() => applySuggestion(suggest.kind === 'synonyms' ? it.split(' — ')[0] : it)}>
              {it}
            </button>
          ))}
          {suggest.items?.length === 0 && <p className="fsummary">Nothing worth offering — the line may already be doing its work.</p>}
        </div>
      )}
    </div>
  )
}
