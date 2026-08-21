import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { AnalyzeResponse, AnnotationStatus, Chapter, ChatResponse, DraftSceneResponse, ProseCheckHit, ProseDraft, ProseScene, ResolvedAnnotation, ResolvedLock, SceneContract } from '../canon'
import { dateOf } from '../canon'
import { dotsFor } from '../keypoints'
import { acceptDraft, acceptParagraph, rejectParagraph, acceptSentence, rejectSentence, analyzeDraft, createLock as apiCreateLock, createNote, deleteAnnotation, deleteLock as apiDeleteLock, discardDraft, draftScene, loadChecks, loadLocks, redraftScene, suggestText, updateNote, writeScene } from '../api'
import { wikilinkClickHandler } from '../wikilinks'
import { mdToHtml } from '../md'
import { diffProse, diffStats, type ParaDiff } from '../diff'
import {
  formatReadingTime, formatWords, nextRegister, pageCount, progressLabel, totalWords, wordsByChapter,
  type ProgressRegister,
} from '../wordcount'
import { CopyProse, CopyRef } from './CopyRef'
import {
  chapterText, copyableScenes, isSingleWord, offsetOfParagraph, paragraphAtOffset, paragraphRange, sceneText,
} from '../manuscript-text'
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
/** A paragraph named the way the server names it. `side` says which version
 *  it belongs to and `paragraph` indexes that version's own list. */
interface ParaTarget { side: 'main' | 'draft'; paragraph: number }

/** The identity of a judgeable paragraph, or null when there is nothing to
 *  judge. A rewrite and an insertion are decisions about the draft's text; a
 *  deletion is a decision about main's. */
function targetOf(p: ParaDiff): ParaTarget | null {
  if (p.kind === 'del') return p.mainIndex === null ? null : { side: 'main', paragraph: p.mainIndex }
  if (p.kind === 'changed' || p.kind === 'ins') {
    return p.draftIndex === null ? null : { side: 'draft', paragraph: p.draftIndex }
  }
  return null
}

const targetKey = (t: ParaTarget): string => `${t.side}:${t.paragraph}`

function DiffBody({ d, paraKey, onAccept, onReject, onSentence, busy, flash }: {
  d: ParaDiff[]
  paraKey?: (text: string) => string | undefined
  /** Why judging one paragraph failed, shown at that paragraph. Keyed by the
   *  paragraph's identity, not its position in the diff. */
  flash?: { at: string; text: string } | null
  /** Accept just this paragraph. The whole-draft button at the top takes
   *  every change as one judgment; a chapter with four edits is four.
   *
   *  The target is an identity — which version the paragraph belongs to and
   *  its index in THAT version — because a draft that inserts a paragraph
   *  makes the two versions disagree about every index after it. */
  onAccept?: (t: ParaTarget) => void
  /** And refuse just this one. The same size of decision as accepting it —
   *  the alternative was Discard, which throws away the whole scene. */
  onReject?: (t: ParaTarget) => void
  /** Take or refuse ONE sentence of a changed paragraph (A37-3). The sentence
   *  is named by identity — which side it belongs to, and its index in that
   *  side's own split — never by its text. */
  onSentence?: (t: { paragraph: number; side: 'main' | 'draft'; sentence: number }, verb: 'accept' | 'reject') => void
  busy?: boolean
}) {
  // The sentence menu: where it is, and which sentence it is about. One at a
  // time, closed by any click elsewhere — the same manners as the lock menu.
  const [sMenu, setSMenu] = useState<
    { x: number; y: number; paragraph: number; side: 'main' | 'draft'; sentence: number; kind: 'ins' | 'del' } | null
  >(null)
  useEffect(() => {
    if (!sMenu) return
    const down = (ev: MouseEvent) => { if (!(ev.target as HTMLElement).closest('.sent-menu')) setSMenu(null) }
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setSMenu(null) }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [sMenu])
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
        // Both verbs or neither: an author offered only "accept" reads the
        // absence as "the other option is Discard the lot".
        const takeIt = (t: ParaTarget | null) => {
          if (!t) return null
          const at = targetKey(t)
          // A deletion is judged on MAIN's side and a rewrite or insertion on
          // the draft's, which is why the verbs are told the side rather than
          // guessing it from a number.
          const takes = p.kind === 'del'
            ? 'Take this deletion into the book'
            : 'Accept this change into the book'
          const puts = p.kind === 'del'
            ? 'Put this paragraph back, leaving every other pending change alone'
            : 'Put the earlier words back, leaving every other pending change alone'
          return (
            <span className="para-verdict">
              {onAccept && (
                <button className="para-accept" disabled={busy} title={takes}
                  onClick={() => onAccept(t)}>accept</button>
              )}
              {onReject && (
                <button className="para-reject" disabled={busy} title={puts}
                  onClick={() => onReject(t)}>reject</button>
              )}
              {flash?.at === at && <span className="para-why">{flash.text}</span>}
            </span>
          )
        }
        const target = targetOf(p)
        if (p.kind === 'changed') {
          const kp = keyOf(p)
          const pix = p.draftIndex ?? NaN
          // Sentence granularity when the alignment is available and the verb
          // is wired; otherwise the word-level view exactly as before. Both
          // show before and after — the sentence view just makes each half
          // something the author can point at.
          const bySentence = onSentence && p.sentences?.length && Number.isInteger(pix)
          return (
            <p key={i} data-para={kp} className="para-changed">
              {bySentence
                ? p.sentences!.map((sn, k) => {
                    if (sn.kind === 'same') return <span key={k}>{sn.text}</span>
                    const open = (ev: React.MouseEvent) => {
                      ev.preventDefault()
                      setSMenu({ x: ev.clientX, y: ev.clientY, paragraph: pix, side: sn.side, sentence: sn.index, kind: sn.kind as 'ins' | 'del' })
                    }
                    const title = sn.kind === 'ins'
                      ? 'Right-click: keep or drop this new sentence'
                      : 'Right-click: keep it deleted, or put it back'
                    return sn.kind === 'ins'
                      ? <ins key={k} className="sent" title={title} onContextMenu={open}>{sn.text}</ins>
                      : <del key={k} className="sent" title={title} onContextMenu={open}>{sn.text}</del>
                  })
                : p.pieces!.map((pc, k) =>
                    pc.kind === 'same' ? <span key={k}>{pc.text} </span>
                      : pc.kind === 'ins' ? <ins key={k}>{pc.text} </ins>
                        : <del key={k}>{pc.text} </del>)}
              {takeIt(target)}
            </p>
          )
        }
        if (p.kind === 'ins') {
          const kp = keyOf(p)
          return <p key={i} data-para={kp} className="para-changed"><ins>{p.text}</ins>{takeIt(target)}</p>
        }
        // A deleted paragraph is not in the draft body at all, so it could
        // never be found by matching text against it — which is why it had no
        // verdict at all until the identity arrived.
        if (p.kind === 'del') return <p key={i} className="para-changed"><del>{p.text}</del>{takeIt(target)}</p>
        return <p key={i} data-para={keyOf(p)}>{p.text}</p>
      })}

      {/* Named in the author's terms, not as bare accept/reject: 'accept' on
          struck-through text is ambiguous until it is spelled out. */}
      {sMenu && (
        <div className="sent-menu" style={{ left: sMenu.x, top: sMenu.y }} role="menu">
          <button disabled={busy} onClick={() => { onSentence?.(sMenu, 'accept'); setSMenu(null) }}>
            {sMenu.kind === 'ins' ? 'Keep this new sentence' : 'Keep it deleted'}
          </button>
          <button disabled={busy} onClick={() => { onSentence?.(sMenu, 'reject'); setSMenu(null) }}>
            {sMenu.kind === 'ins' ? 'Drop this new sentence' : 'Put this sentence back'}
          </button>
          <p className="sent-menu-note">The rest of the paragraph stays pending.</p>
        </div>
      )}
    </div>
  )
}


/** Paragraphs, split the way the anchor resolver splits them — the index a
 *  note records has to mean the same thing on both sides. */
const paragraphsOf = (body: string): string[] =>
  body.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)

/** The padlock's drawn height (theme.css .lock-mark), so the measurement that
 *  centres it on a line and the CSS that sizes it cannot drift apart. */
const LOCK_MARK_PX = 12

/** Locks, in the editor: what is settled, and the refusal to unsettle it.
 *
 *  Both halves live here because both need the same two facts — which
 *  paragraphs are locked, and where they are in a box that has no DOM inside
 *  it. The padlocks are measured with the mirror that lands note cards on
 *  their editor lines, re-measured whenever the text changes because every
 *  paragraph below an edit moves.
 *
 *  The refusal is a NATIVE beforeinput listener rather than React's
 *  onBeforeInput: React synthesises that one, and it does not fire for the
 *  deletes and pastes that matter most here. The native event is cancelable
 *  and fires for every way text can enter a field.
 *
 *  This is the editor agreeing with the server in advance. The lock is still
 *  the write path's 423 (A29-2); nothing here is the enforcement. */
function EditorLocks({ scene, body, lockedAt, onRefused }: {
  scene: string
  body: string
  lockedAt: Map<string, ResolvedLock>
  onRefused: (message: string) => void
}) {
  const [tops, setTops] = useState<number[]>([])
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const ta = ref.current?.parentElement?.querySelector('textarea')
    if (!ta) return
    // paragraphTopsIn measures from where the TEXT begins; the gutter is
    // positioned against the editor's box. The difference is the textarea's
    // own border and padding, and leaving it out floats every padlock above
    // the paragraph it names. Then sit the mark on the first line rather than
    // on the line's top edge — the reading view's padlock is offset half a
    // line for the same reason, and being level with its text is the entire
    // point of drawing it out here.
    const measure = () => {
      const cs = getComputedStyle(ta)
      const inset = ta.offsetTop
        + parseFloat(cs.borderTopWidth || '0')
        + parseFloat(cs.paddingTop || '0')
      const line = parseFloat(cs.lineHeight || '0') || 0
      const nudge = line > LOCK_MARK_PX ? (line - LOCK_MARK_PX) / 2 : 0
      setTops(paragraphTopsIn(ta).map(t => t + inset + nudge))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(ta)

    const guard = (ev: InputEvent) => {
      const type = ev.inputType ?? ''
      const value = ta.value
      const from = ta.selectionStart ?? 0
      const to = ta.selectionEnd ?? from

      // What is settled is the TEXT of a locked paragraph, and its standing as
      // a paragraph of its own. Everything else around it — the blank lines
      // after it, how many there are — is not settled and the author may tidy
      // it. So the question is never "does this edit come near a lock" but
      // "would this edit change what a lock protects".
      const locked = paragraphsOf(value).filter((_, i) => lockedAt.has(`${scene}:${i}`))
      if (!locked.length) return

      // A delete is fully predictable, so ask the real question: apply it and
      // see whether every locked paragraph is still there, intact and still
      // standing alone. Trimming a spare blank line survives that test;
      // merging the next paragraph up into settled prose does not, because the
      // locked text stops existing as a paragraph.
      if (type.startsWith('delete')) {
        let dFrom = from
        let dTo = to
        if (dFrom === dTo) {
          if (type.includes('Backward')) dFrom = Math.max(0, dFrom - 1)
          else if (type.includes('Forward')) dTo = Math.min(value.length, dTo + 1)
          else return   // a delete with no direction and nothing selected removes nothing
        }
        const after = paragraphsOf(value.slice(0, dFrom) + value.slice(dTo))
        const survives = (text: string) =>
          after.filter(p => p === text).length >= locked.filter(p => p === text).length
        const lost = locked.find(text => !survives(text))
        if (lost === undefined) return
        ev.preventDefault()
        onRefused(`That would change locked prose — unlock it in Notes first, or leave the blank line between them.`)
        return
      }

      // Insertions only matter where they land INSIDE settled text. Typing at
      // the head of the paragraph below a lock is not the lock's business, and
      // refusing it would be the opposite mistake.
      const hit = paragraphRange(value, from, to).find(i => lockedAt.has(`${scene}:${i}`))
      if (hit === undefined) return
      ev.preventDefault()
      onRefused(`Paragraph ${hit + 1} is locked — unlock it in Notes to edit, or work around it.`)
    }
    ta.addEventListener('beforeinput', guard)
    return () => { ro.disconnect(); ta.removeEventListener('beforeinput', guard) }
  }, [body, scene, lockedAt, onRefused])

  return (
    <div className="lock-gutter" ref={ref} aria-hidden>
      {tops.map((top, i) => (lockedAt.has(`${scene}:${i}`)
        ? <span key={i} className="lock-mark" style={{ top }}
            title={`Settled — paragraph ${i + 1} is locked. Right-click it in Notes to unlock.`} />
        : null))}
    </div>
  )
}

/** Where every paragraph sits, vertically, inside an editor.
 *
 *  A textarea has no DOM inside it — you cannot ask it where its fourth
 *  paragraph is. So measure a copy: one off-screen element set in the same
 *  type at the same width, holding the same text, with a marker at the head
 *  of each paragraph. One insertion, one layout, every position.
 *
 *  Reliable because the editor never scrolls inside itself (field-sizing:
 *  content, overflow hidden — theme.css): the box is exactly as tall as its
 *  text, so a copy of the text lays out exactly as the box does.
 *
 *  Measured against the textarea's LIVE value, never the file on disk —
 *  otherwise the position drifts by however much the author has typed. */
function paragraphTopsIn(ta: HTMLTextAreaElement): number[] {
  const text = ta.value
  const count = paragraphsOf(text).length
  if (!count) return []

  const cs = getComputedStyle(ta)
  const mirror = document.createElement('div')
  const st = mirror.style
  st.position = 'absolute'; st.top = '0'; st.left = '-99999px'
  st.visibility = 'hidden'; st.pointerEvents = 'none'
  st.whiteSpace = 'pre-wrap'; st.overflowWrap = cs.overflowWrap; st.wordBreak = cs.wordBreak
  st.font = cs.font; st.letterSpacing = cs.letterSpacing; st.lineHeight = cs.lineHeight
  st.width = `${ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`

  // The marker is the paragraph's own first character rather than an inserted
  // one, so nothing about the text being measured differs from the text in
  // the box. A zero-width space only stands in for a paragraph that is empty.
  const marks: HTMLElement[] = []
  let cursor = 0
  for (let i = 0; i < count; i++) {
    const start = offsetOfParagraph(text, i)
    if (start < cursor) continue
    mirror.append(document.createTextNode(text.slice(cursor, start)))
    const mark = document.createElement('span')
    mark.textContent = text.slice(start, start + 1) || '​'
    mirror.append(mark)
    marks.push(mark)
    cursor = start + 1
  }
  mirror.append(document.createTextNode(text.slice(cursor)))

  document.body.appendChild(mirror)
  const base = mirror.getBoundingClientRect().top
  const tops = marks.map(m => m.getBoundingClientRect().top - base)
  mirror.remove()
  return tops
}

/** The top of an editor's text in page coordinates — the box, past its padding. */
const textTopOf = (ta: HTMLTextAreaElement): number =>
  ta.getBoundingClientRect().top + parseFloat(getComputedStyle(ta).paddingTop)

/** The top of the page a reader can actually SEE: the scroll region's top,
 *  past whatever is stuck to it.
 *
 *  The chapter header is sticky, and it is a different height in each mode —
 *  taller in Notes and Edit, where the draft bar and the scene's furniture
 *  stand above the prose. A position measured against the region's own top
 *  would put the anchored paragraph behind that header, by a different amount
 *  in each mode, so changing stance would appear to lose the line even though
 *  the arithmetic was faithful. Measure against the first line instead. */
function visibleTopOf(box: HTMLElement): number {
  const top = box.getBoundingClientRect().top
  const head = box.querySelector('.ms-head')
  if (!head) return top
  const r = head.getBoundingClientRect()
  // Only while it is actually stuck there — scrolled into the page it is
  // ordinary content and covers nothing.
  return r.top <= top + 1 ? Math.max(top, r.bottom) : top
}

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
  onStatus: (id: string, status: AnnotationStatus) => void
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
          {n.anchor.quote
            ? <blockquote className="note-quote">{n.anchor.quote}</blockquote>
            /* No quote and no paragraph: the note is about the section, and
               says so instead of showing an empty rule where a passage
               would be. */
            : n.anchor.paragraph == null
              ? <div className="note-scope">about all of {n.anchor.scene}</div>
              : null}
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
export function ManuscriptView({ scenes, chapters, chapterIx, onChapter, onOpenWorld, draft, notes: anns, onRefresh, onRefreshNotes, onCanonChanged }: {
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
  // One prop, two kinds (A30): notes keep every surface they had, keypoints
  // exist only for the margin rail. The split happens once, at the door, so
  // no note surface below can accidentally treat a structural marker as a
  // thought — or count it, cluster it, or offer to resolve it.
  const notes = useMemo(() => anns.filter(a => (a.kind ?? 'note') === 'note'), [anns])
  const keypoints = useMemo(() => anns.filter(a => a.kind === 'keypoint'), [anns])

  // The initial view derives from the saved mode: Edit renders editors only
  // over 'proposed' (switchMode forces this on entry), and a refresh must
  // arrive in the same coherent stance it left — not the Edit tab lit over
  // rendered prose because `view` booted to its reading default.
  const [view, setView] = useState<'before' | 'changes' | 'proposed'>(() => readMode() === 'edit' ? 'proposed' : 'changes')
  const showChanges = view === 'changes'
  const [drawer, setDrawer] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  /** Why judging ONE paragraph failed, and which one. The draft banner's own
   *  error line sits at the top of the page, which for a control a thousand
   *  pixels down reads as nothing happening at all. */
  const [flash, setFlash] = useState<{ at: string; text: string } | null>(null)
  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), 5000)
    return () => clearTimeout(timer)
  }, [flash])
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
  // No paragraph means the composer is writing about the whole scene (§14) —
  // the shape a note about something ABSENT has to take, since an absence
  // cannot be selected.
  const [sel, setSel] = useState<{ scene: string; paragraph?: number; quote?: string; yHint?: number } | null>(null)
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

  /** The draft bar is pinned to the top of the scroll container, and the
   *  chapter header — sticky since it was written — has to sit BELOW it
   *  rather than on the same line. That offset is the bar's height, published
   *  here as a custom property and consumed by .ms-head's `top` in theme.css.
   *
   *  Measured rather than hardcoded, for the reason LOCK_MARK_PX carries its
   *  own comment: the bar is conditional (no git story, or read mode, and it
   *  does not render at all) and it wraps to two lines on a narrow window, so
   *  any fixed number is wrong in situations the author will actually hit.
   *  Absent bar means absent property, and the header pins at 0 as before. */
  const draftbarRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const bar = draftbarRef.current
    if (!bar) {
      scroll.style.removeProperty('--draftbar-h')
      return
    }
    const publish = () => scroll.style.setProperty('--draftbar-h', `${Math.round(bar.getBoundingClientRect().height)}px`)
    publish()
    // Two triggers, deliberately. ResizeObserver is the precise one — it sees
    // the bar change height for any reason. The window listener is the
    // belt-and-braces: wrapping is almost always driven by the window getting
    // narrower, and a stale offset here is not a cosmetic bug but the chapter
    // header sitting on top of the bar's buttons. Publishing twice costs a
    // rect read; publishing never costs the author the control they came for.
    const ro = new ResizeObserver(publish)
    ro.observe(bar)
    window.addEventListener('resize', publish)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', publish)
      scroll.style.removeProperty('--draftbar-h')
    }
  })

  /** The reader is at the very top of the chapter — head and furniture in
   *  view, nothing scrolled past. No colon, so it can never collide with a
   *  real `scene:index` paragraph key, and it round-trips through the
   *  positions file like any other anchor. */
  const TOP_KEY = '@top'

  /** Which paragraph the top of the page is cutting through, if any. Null
   *  means "do not overwrite what we remembered" — never "the reader is at
   *  the top". */
  const anchorNow = useCallback((): Anchor | null => {
    const box = scrollRef.current
    if (!box) return null
    // Untouched since we put them here: the reader has not moved, so their
    // place is still the one we were asked to restore — not whatever this
    // layout was tall enough to show.
    const put = restoredRef.current
    if (put && Math.abs(box.scrollTop - put.scrollTop) < 1) return put.anchor
    // The very top is a place of its own, not "paragraph one at the reading
    // line". Answering with the first paragraph here made every stance switch
    // from the top restore that paragraph to the reading line — scrolling the
    // chapter head (and everything above the first note) out of view.
    if (box.scrollTop <= 1) return { key: TOP_KEY, frac: 0 }
    const top = visibleTopOf(box)

    // Reading or annotating: the paragraphs are elements, so ask them.
    for (const el of box.querySelectorAll<HTMLElement>('[data-para]')) {
      const r = el.getBoundingClientRect()
      if (r.bottom <= top + 1) continue          // scrolled past
      const frac = r.height > 0 ? Math.min(1, Math.max(0, (top - r.top) / r.height)) : 0
      return { key: el.dataset.para!, frac }
    }

    // Writing: the paragraphs are inside a textarea, so measure a copy.
    for (const section of box.querySelectorAll<HTMLElement>('[data-scene]')) {
      const ta = section.querySelector('textarea')
      if (!ta) continue
      const r = ta.getBoundingClientRect()
      if (r.bottom <= top + 1) continue
      const scene = section.dataset.scene!
      if (r.top >= top) return { key: `${scene}:0`, frac: 0 }   // page starts above this editor
      const tops = paragraphTopsIn(ta)
      if (!tops.length) return { key: `${scene}:0`, frac: 0 }
      const y = top - textTopOf(ta)
      let i = 0
      while (i + 1 < tops.length && tops[i + 1] <= y) i++
      const end = tops[i + 1] ?? (ta.clientHeight - parseFloat(getComputedStyle(ta).paddingTop) * 2)
      const height = Math.max(1, end - tops[i])
      return { key: `${scene}:${i}`, frac: Math.min(1, Math.max(0, (y - tops[i]) / height)) }
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
    if (a.key === TOP_KEY) {
      box.scrollTop = 0
      restoredRef.current = { anchor: a, scrollTop: 0 }
      return
    }
    const scene = a.key.slice(0, a.key.lastIndexOf(':'))
    const boxTop = visibleTopOf(box)

    // Writing: the target is inside an editor, so measure a copy of its text
    // to find out where. A scene that is no longer being edited falls through
    // to the element path below.
    const ta = box.querySelector<HTMLTextAreaElement>(`[data-scene="${scene}"] textarea`)
    if (ta) {
      const tops = paragraphTopsIn(ta)
      if (!tops.length) { box.scrollTop += ta.getBoundingClientRect().top - boxTop; return }
      const i = Math.min(tops.length - 1, Math.max(0, Number(a.key.slice(scene.length + 1)) || 0))
      const end = tops[i + 1] ?? (ta.clientHeight - parseFloat(getComputedStyle(ta).paddingTop) * 2)
      box.scrollTop += (textTopOf(ta) - boxTop) + tops[i] + a.frac * Math.max(0, end - tops[i])
      restoredRef.current = { anchor: a, scrollTop: box.scrollTop }
      return
    }

    const inScene = box.querySelectorAll<HTMLElement>(`[data-para^="${scene}:"]`)
    if (!inScene.length && !box.querySelector('[data-para]')) return   // nothing rendered yet
    const el = box.querySelector<HTMLElement>(`[data-para="${a.key}"]`) ?? inScene[inScene.length - 1]
    if (!el) { box.scrollTop = box.scrollHeight; return }              // the browser clamps
    const r = el.getBoundingClientRect()
    box.scrollTop += (r.top - boxTop) + a.frac * r.height
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
   *  This exists because the stances are not the same height: the prose
   *  measure is shared now (A33), but each stance carries different
   *  furniture — draft bar, note cards, per-mode headers — so the same
   *  paragraph still sits at different offsets. A paragraph near the end of
   *  one layout can sit inside the last screenful of another, where no
   *  amount of scrolling will bring it to the top — the browser clamps, and
   *  re-reading the position from that clamped view would quietly move the
   *  reader backwards and then remember the wrong place.
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

  /* ---- locks (A29): settled prose, shown and edited here ----
   *  The truth lives in the backend's write path; this state only paints it
   *  and offers the two verbs. Re-fetched whenever the prose changes, so a
   *  lock that drifted or orphaned shows where it actually is now. */
  const [locksList, setLocksList] = useState<ResolvedLock[]>([])
  // The proven channel: mechanical facts about the prose, free to fetch and
  // refreshed with the locks — the two arrive together because a finding
  // inside settled prose names its lock.
  const [checks, setChecks] = useState<ProseCheckHit[]>([])
  const reloadLocks = useCallback(() => {
    loadLocks().then(setLocksList).catch(() => setLocksList([]))
    loadChecks().then(setChecks).catch(() => setChecks([]))
  }, [])
  useEffect(() => { reloadLocks() }, [reloadLocks, scenes])
  /** `scene:paragraph` → lock, at the paragraph each lock RESOLVES to now. */
  const lockedAt = useMemo(() => {
    const m = new Map<string, ResolvedLock>()
    for (const l of locksList) {
      if ((l.resolution.state === 'resolved' || l.resolution.state === 'drifted') && l.resolution.paragraph !== null)
        m.set(`${l.anchor.scene}:${l.resolution.paragraph}`, l)
    }
    return m
  }, [locksList])
  /** The lock/unlock menu: right-click on prose. A lock is a decision about a
   *  passage — and when the author has marked several paragraphs, the
   *  decision is about all of them. The right-clicked paragraph is the target
   *  on its own; a selection covering more makes the whole run the target,
   *  because settling three paragraphs one context menu at a time is the same
   *  decision typed three times. */
  const [lockMenu, setLockMenu] = useState<{
    scene: string; x: number; y: number
    targets: { paragraph: number; para: string; lockId: string | null }[]
  } | null>(null)

  /** Which paragraphs of this scene the document selection actually covers.
   *  The DOM says WHICH (a rendered paragraph carries its index); the scene
   *  source says WHAT, because a lock's quote is matched against the source
   *  and the rendered text has already lost its markup. */
  const selectedParagraphs = useCallback((scene: string, body: string): number[] => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return []
    const out: number[] = []
    for (const el of document.querySelectorAll<HTMLElement>('[data-para]')) {
      const key = el.getAttribute('data-para') ?? ''
      if (!key.startsWith(`${scene}:`)) continue
      // Partial containment counts: a selection that clips the end of one
      // paragraph and the start of the next has marked both.
      if (!sel.containsNode(el, true)) continue
      const ix = Number(key.slice(scene.length + 1))
      if (Number.isInteger(ix) && ix < paragraphsOf(body).length) out.push(ix)
    }
    return out.sort((a, b) => a - b)
  }, [])

  /** Open the menu for the clicked paragraph, or for the whole selected run
   *  when the click lands inside one. */
  const openLockMenu = useCallback((scene: string, body: string, clicked: number, ev: { clientX: number; clientY: number }) => {
    const paras = paragraphsOf(body)
    const covered = selectedParagraphs(scene, body)
    const idxs = covered.length > 1 && covered.includes(clicked) ? covered : [clicked]
    setLockMenu({
      scene, x: ev.clientX, y: ev.clientY,
      targets: idxs.map(i => ({ paragraph: i, para: paras[i] ?? '', lockId: lockedAt.get(`${scene}:${i}`)?.id ?? null })),
    })
  }, [selectedParagraphs, lockedAt])

  // Sequentially, never in parallel: the server names each lock by reading the
  // highest number already on disk, so two writes in flight at once would both
  // claim the same id and one would land on top of the other.
  const lockHere = useCallback(async (scene: string, targets: { paragraph: number; para: string }[]) => {
    for (const t of targets) {
      try { await apiCreateLock({ scene, paragraph: t.paragraph, quote: t.para }) }
      catch (e) { console.error(`lock refused (paragraph ${t.paragraph + 1}):`, e) }
    }
    setLockMenu(null); setSelMenu(null); reloadLocks()
  }, [reloadLocks])
  const unlockHere = useCallback(async (ids: string[]) => {
    for (const id of ids) {
      try { await apiDeleteLock(id) } catch (e) { console.error('unlock refused:', e) }
    }
    setLockMenu(null); setSelMenu(null); reloadLocks()
  }, [reloadLocks])
  // The lock menu leaves the way every menu here leaves.
  useEffect(() => {
    if (!lockMenu) return
    const down = (ev: MouseEvent) => { if (!(ev.target as HTMLElement).closest('.sel-menu')) setLockMenu(null) }
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setLockMenu(null) }
    const scroll = () => setLockMenu(null)
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', scroll, true)
    return () => {
      window.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key)
      window.removeEventListener('scroll', scroll, true)
    }
  }, [lockMenu])

  /** Why the last keystroke did not happen. Cleared on the next successful
   *  one — a refusal explains itself in passing, it does not accumulate. */
  /** The scope locks standing over a scene or chapter — active ones only,
   *  which is all the server returns. One entry does the work of many, so
   *  these are what the menu offers to lift. */
  const sectionLockOf = useCallback((scene: string) => locksList.find(l => l.anchor.scene === scene && l.anchor.paragraph == null) ?? null, [locksList])
  const chapterLockOf = useCallback((chapter: string) => locksList.find(l => l.anchor.chapter === chapter) ?? null, [locksList])

  const [lockedNote, setLockedNote] = useState<string | null>(null)
  useEffect(() => {
    if (!lockedNote) return
    const t = setTimeout(() => setLockedNote(null), 2600)
    return () => clearTimeout(t)
  }, [lockedNote])

  /** Dot right-click (A30): the one verb a dot has. */
  const [kpMenu, setKpMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  /** The statement being written for a new key point, at the click point. */
  const [kpDraft, setKpDraft] = useState<{ scene: string; paragraph: number; quote: string; x: number; y: number; text: string } | null>(null)
  const mintKeypoint = useCallback(async () => {
    if (!kpDraft || !kpDraft.text.trim()) return
    try {
      await createNote({ scene: kpDraft.scene, paragraph: kpDraft.paragraph, quote: kpDraft.quote,
        body: kpDraft.text.trim(), kind: 'keypoint', by: 'author' })
      setKpDraft(null); onRefreshNotes()
    } catch (e) { console.error('key point refused:', e) }
  }, [kpDraft, onRefreshNotes])
  const removeKeypoint = useCallback(async (id: string) => {
    try { await deleteAnnotation(id) } catch (e) { console.error('remove refused:', e) }
    setKpMenu(null); onRefreshNotes()
  }, [onRefreshNotes])
  useEffect(() => {
    if (!kpMenu && !kpDraft) return
    const down = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement
      if (t.closest('.sel-menu') || t.closest('.kp-draft')) return
      setKpMenu(null); setKpDraft(null)
    }
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setKpMenu(null); setKpDraft(null) } }
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [kpMenu, kpDraft])

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
  /** The editor's own menu. It opens with nothing selected too: most of what
   *  it offers is about the paragraph the caret is in — a note, a key point, a
   *  lock — and none of that needs a selection. The items that DO need one say
   *  so rather than vanishing, so the menu keeps its shape between clicks. */
  const onEditorContextMenu = (ev: React.MouseEvent<HTMLTextAreaElement>, s: ProseScene) => {
    const el = ev.currentTarget
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

  // Edit must not stay selected over a chapter that got locked — by this
  // session's click or anyone else's. The same follow-the-author-out the
  // view switcher does when a non-proposed view is chosen while editing.
  useEffect(() => {
    if (mode === 'edit' && cur && chapterLockOf(cur.id)) switchMode('notes')
  }, [mode, cur, chapterLockOf, switchMode])
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
  // All three modes, Edit included: reading a passage and then opening it to
  // write is the commonest reason to change stance at all, and arriving at
  // the top of the chapter is exactly the thing this is for.
  useLayoutEffect(() => {
    const box = scrollRef.current
    // Prose on screen, as paragraphs or as editors — until then there is
    // nothing to anchor to and the position must not be consumed.
    if (!box || !(box.querySelector('[data-para]') || box.querySelector('[data-scene] textarea'))) return
    const a = pendingRef.current ?? readPositions()[chapterKey]
    pendingRef.current = null
    if (a) restoreAnchor(a)
  }, [mode, chapterKey, scenes.length, view, restoreAnchor])

  /** The register the footer states position in, and the click that cycles it. */
  const [register, setRegister] = useState<ProgressRegister>(() => readRegister())
  const cycleRegister = useCallback(() => {
    setRegister(r => { const next = nextRegister(r); writeRegister(next); return next })
  }, [])

  /** Where `scene:paragraph` sits inside the cols box — the element when the
   *  paragraph is rendered, a measured copy when it lives in a textarea
   *  (A28-4's rule, shared by note cards and the margin rail's dots). Null
   *  when the key measures against nothing. */
  const lineAt = useCallback((box: HTMLElement, base: number, key: string): number | null => {
    const el = box.querySelector<HTMLElement>(`[data-para="${key}"]`)
    if (el) return el.getBoundingClientRect().top - base
    const scene = key.slice(0, key.lastIndexOf(':'))
    const pi = Number(key.slice(scene.length + 1)) || 0
    const ta = box.querySelector<HTMLTextAreaElement>(`[data-scene="${scene}"] textarea`)
    if (!ta) return null
    const paraTops = paragraphTopsIn(ta)
    if (!paraTops.length) return textTopOf(ta) - base
    return textTopOf(ta) - base + paraTops[Math.min(pi, paraTops.length - 1)]
  }, [])

  /* ---- the margin timeline (A30): dots measured, rail placed ----
   *  dotsFor() decides WHAT dots exist (pure, tested); this effect only
   *  answers where they sit, with the same measuring the note cards use. */
  const [rail, setRail] = useState<{ x: number; dots: { id: string; top: number; body: string; by: 'author' | 'agent' }[] } | null>(null)
  useLayoutEffect(() => {
    if (mode === 'read') { setRail(null); return }   // Read leaves no furniture standing
    const box = colsRef.current
    if (!box) return
    const sceneSet = new Set(curScenes.map(sc => sc.scene))
    const wanted = dotsFor(keypoints, sceneSet)
    const measure = () => {
      const rect = box.getBoundingClientRect()
      const first = box.querySelector<HTMLElement>('[data-para], [data-scene] textarea')
      if (!first) { setRail(null); return }
      const x = Math.max(6, first.getBoundingClientRect().left - rect.left - 26)
      const dots = wanted
        .map(d => ({ ...d, top: lineAt(box, rect.top, d.key) }))
        .filter((d): d is typeof d & { top: number } => d.top !== null)
        .map(d => ({ id: d.id, top: d.top + 4, body: d.body, by: d.by }))
      setRail(prev => {
        const next = { x, dots }
        if (prev && prev.x === next.x && prev.dots.length === next.dots.length &&
            prev.dots.every((v, i) => v.id === next.dots[i].id && Math.abs(v.top - next.dots[i].top) < 1 && v.body === next.dots[i].body)) return prev
        return next
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [keypoints, curScenes, mode, view, diffs, lineAt])

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
      const lineOf = (key: string | null) => (key === null ? 0 : lineAt(box, base, key) ?? 0)
      // Exactly the cards the rail renders, in render order: the composer
      // first when open, then the notes it shows.
      const keys = [
        // A scene composer measures against no paragraph, so it takes the top
        // of the column — where the note it is about to make will also sit.
        ...(sel ? [sel.paragraph == null ? null : `${sel.scene}:${sel.paragraph}`] : []),
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
  }, [openNotes, sel, view, diffs, mode, lineAt])

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
    try {
      await op()
    } catch (e) {
      setErr((e as Error).message ?? String(e))
      throw e
    } finally {
      // Refresh on failure too. A refused action usually means the browser's
      // picture of the draft is out of date — the commonest way to meet this
      // is a change that has already been ratified elsewhere, leaving a diff
      // on screen whose buttons can only ever fail. Re-reading is what makes
      // the page honest again.
      onRefresh()
      setBusy(false)
    }
  }
  const judge = (at: string, op: () => Promise<unknown>) => {
    setFlash(null)
    void run(op).catch((e: Error) => setFlash({ at, text: e.message ?? String(e) }))
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
  /** A note about the whole scene: no selection, so no paragraph and no
   *  quote. The gesture carries the scope — the author is never asked to
   *  choose one. */
  const noteOnScene = (scene: string) => {
    setSel({ scene })
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
  const noteStatus = async (id: string, status: AnnotationStatus) => {
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

  /** The redraft pass, through the drafting bar's own plumbing: same busy
   *  flag, same briefing panel, because the result is the same kind of thing
   *  — a generation landing in the draft layer for the gate to judge. The
   *  editor's pending text is flushed first; the pass reads the file. */
  const redraft = async (scene: string, file: string, range?: [number, number]) => {
    setGenBusy(true); setGenErr(null); setGen(null)
    try {
      await flushFile(file)
      const res = await redraftScene({ scene, ...(range ? { paragraphs: range } : {}) })
      setGen(res)
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
        {curScenes.length === 1 && (
          <button disabled={genBusy}
            title="A clean pass: rebuild the scene to its contract — order, images and sentence architecture are all in play. Locked paragraphs survive verbatim; the result is a draft for the gate."
            onClick={() => void redraft(curScenes[0].scene, curScenes[0].file)}>
            {genBusy ? 'Working…' : 'Redraft the scene'}
          </button>
        )}
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
        {/* The margin timeline (A30): a line that is always there, dots only
            where something is load-bearing. Sparse is a statement. */}
        {rail && mode !== 'read' && (
          <div className="kp-rail" style={{ left: rail.x }} aria-label="Margin timeline">
            <div className="kp-line" />
            {rail.dots.map(d => (
              <button key={d.id} className="kp-dot" style={{ top: d.top }}
                aria-label={`Key point: ${d.body}`}
                onContextMenu={ev => { ev.preventDefault(); ev.stopPropagation(); setKpMenu({ id: d.id, x: ev.clientX, y: ev.clientY }) }}>
                <span className="kp-pop">{d.body}{d.by === 'agent' && <em className="kp-by"> — minted by an agent</em>}</span>
              </button>
            ))}
          </div>
        )}
      <article className="ms-main">
        {draft.git && mode !== 'read' && (
          <div ref={draftbarRef} className={n ? 'draftbar' : 'draftbar clean'}>
            {n ? (
              <>
                <span className="db-sum"><b>Draft</b> — {n} scene{n === 1 ? '' : 's'} changed ·{' '}
                  <span className="ins-ct">+{totals.ins}</span> <span className="del-ct">−{totals.del}</span> words vs main</span>
                <div className="db-views" role="group" aria-label="Which version to read">
                  {([['before', 'Before'], ['changes', 'Changes'], ['proposed', 'Proposed']] as const).map(([k, label]) => (
                    <button key={k} className={view === k ? 'on' : ''}
                      aria-pressed={view === k} onClick={() => {
                        setView(k)
                        // The switchMode inverse. Edit means edit the PROPOSED
                        // text, and Before/Changes are exactly the two views
                        // the prose is not editable in — so choosing one while
                        // editing is a request to READ the diff, and the page
                        // follows into Notes honestly rather than leaving the
                        // Edit tab lit over prose that stopped being editable.
                        if (mode === 'edit' && k !== 'proposed') switchMode('notes')
                      }}>{label}</button>
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
                  : 'Nothing drafted in this chapter yet'}/>
              {/* The chapter settles from ITS header, never from a menu over
                  prose (A40-4, per the author): a chapter-sized refusal
                  stacked beside a paragraph-sized one is one mis-click from
                  settling a book. Each size lives on the thing it settles. */}
              {mode !== 'read' && curScenes.length > 0 && (() => {
                const held = chapterLockOf(cur.id)
                return held ? (
                  <a className="linklike lock-act" onClick={() => void unlockHere([held.id])}
                    title={`This chapter is locked (${held.id}). Unlocking restores any section and paragraph locks it absorbed.`}>
                    unlock chapter
                  </a>
                ) : (
                  <a className="linklike lock-act"
                    title={`Settle every scene of ${cur.id}. Section and paragraph locks beneath it are absorbed, and come back if you unlock it.`}
                    onClick={() => {
                      void (async () => {
                        try { await apiCreateLock({ chapter: cur.id }) }
                        catch (e) { console.error('chapter lock refused:', e) }
                        reloadLocks()
                      })()
                    }}>
                    lock chapter
                  </a>
                )
              })()}
            </h1>
            <div className="ms-modes" role="group" aria-label="Manuscript mode">
              {(() => {
                // A locked chapter is the author's own word for what a
                // finished chapter is for: Notes and Read, not Edit. The
                // button stays visible and says WHY — a greyed control with
                // no reason reads as a bug — and aria-disabled rather than
                // disabled so the hover can actually reach the reason.
                const chLock = chapterLockOf(cur.id)
                if (chLock) {
                  return (
                    <button className="off" aria-disabled="true" aria-pressed={false}
                      onClick={ev => ev.preventDefault()}
                      title={`This chapter is locked (${chLock.id}) — you settled it entire. Unlock it from the prose right-click menu to edit.`}>
                      Edit
                    </button>
                  )
                }
                return (
                  <button className={mode === 'edit' ? 'on' : ''} aria-pressed={mode === 'edit'}
                    disabled={!draft.git} onClick={() => switchMode('edit')}
                    title={draft.git
                      ? `Click anywhere in the prose and type — it lands in the draft layer as you go. ${MODE_CHORD} cycles the mode.`
                      : 'Editing needs the story to be a git repository — there is no draft layer without one.'}>
                    Edit
                  </button>
                )
              })()}
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
            <section key={s.scene} className="scene" data-scene={s.scene}>
              {/* The header states what the scene IS — its id, its state, what
                  it rests on. What you can DO to it arrives on hover, because
                  four actions at the same weight as the facts made a row that
                  competed with the prose underneath it. Focus reveals them
                  too, so the keyboard never loses what the pointer gains. */}
              {mode !== 'read' && <div className="scene-head">
                <code>{s.scene}</code>
                <span className={`stpill ${s.status}`}>{s.status}</span>
                {(() => {
                  // The wider settlements read from the header, once — not as
                  // a padlock drawn on every paragraph they cover (A40-4).
                  const wide = chapterLockOf(s.chapter) ?? sectionLockOf(s.scene)
                  return wide ? (
                    <span className="stpill settled"
                      title={`${wide.anchor.chapter ? 'This chapter' : 'This section'} is locked (${wide.id}) — settled entire. Unlock from the prose right-click menu.`}>
                      settled
                    </span>
                  ) : null
                })()}
                {change && <span className={`stpill ${change.status}`}>draft · {change.status}</span>}
                {mode === 'edit' && view === 'proposed' && editStatus[s.file]?.state === 'saving' && (
                  <span className="fsummary">saving…</span>
                )}
                {mode === 'edit' && view === 'proposed' && editStatus[s.file]?.state === 'error' && (
                  <span className="db-err">not saved — {editStatus[s.file]?.message}</span>
                )}
                {s.pov && <a className="linklike" onClick={() => onOpenWorld(s.pov!)}>POV {s.pov}</a>}
                {/* Separators are written here rather than drawn in CSS so
                    they sit BETWEEN the controls instead of inside one: a
                    rule painted on a button's edge grows that button's click
                    target into the gap beside it. aria-hidden because a
                    screen reader should hear four actions, not three pipes. */}
                <span className="scene-acts">
                  <CopyRef text={s.scene} />
                  <span className="sep" aria-hidden="true">|</span>
                  <CopyProse get={() => sceneText(s)} label="copy text"
                    title="Copy this scene's prose" disabled={!s.body.trim()} />
                  {s.body.trim() && (<>
                    <span className="sep" aria-hidden="true">|</span>
                    <a className="linklike" onClick={() => readFrom(s.scene)}
                      title="Read the book from this scene — no notes, no chrome, nothing to click">
                      read from here
                    </a>
                  </>)}
                  <span className="sep" aria-hidden="true">|</span>
                  {/* A note about the section rather than a sentence in it —
                      the shape needed when what you noticed is something the
                      scene does NOT say, which has no passage to select. */}
                  <a className="linklike" onClick={() => noteOnScene(s.scene)}
                    title="Leave a note about this whole scene — including what it does not say yet">
                    note on this scene
                  </a>
                  <span className="sep" aria-hidden="true">|</span>
                  {/* The section settles from ITS header, beside the scene's
                      other actions — never from the prose menu, where it
                      would sit one mis-click from a paragraph lock. */}
                  {(() => {
                    const held = sectionLockOf(s.scene)
                    return held ? (
                      <a className="linklike lock-act" onClick={() => void unlockHere([held.id])}
                        title={`This section is locked (${held.id}). Unlocking restores any paragraph locks it absorbed.`}>
                        unlock section
                      </a>
                    ) : (
                      <a className="linklike lock-act"
                        title={`Settle the whole scene ${s.scene}: every paragraph, and any it grows. Paragraph locks beneath it are absorbed, and come back if you unlock it.`}
                        onClick={() => {
                          void (async () => {
                            try { await apiCreateLock({ scene: s.scene }) }
                            catch (e) { console.error('section lock refused:', e) }
                            reloadLocks()
                          })()
                        }}>
                        lock section
                      </a>
                    )
                  })()}
                </span>
                <span className="rests">rests on{' '}
                  {[...s.facts, ...s.events].map(id => (
                    <a key={id} className="wikilink" onClick={() => onOpenWorld(id)}>{id}</a>
                  ))}
                </span>
              </div>}
              {mode !== 'read' && (() => {
                const mine = checks.filter(c => c.scene === s.scene)
                if (!mine.length) return null
                return (
                  <div className="prose-checks">
                    <span className="reg-proven" title="Decidable by reading the characters — no model, no judgment, the same answer every run. Everything else this page reads into your prose is argued; this is not.">proven</span>
                    {mine.map((c, i) => (
                      <span key={i} className="check-hit">
                        ¶{c.paragraph + 1} {c.check.replace(/-/g, ' ')} <code>{c.excerpt}</code>
                        {c.lock && <em title="This paragraph is settled. A typo inside a lock stays until you unlock it — arc reports it and never repairs it.">
                          {' '}locked ({c.lock})</em>}
                      </span>
                    ))}
                  </div>
                )
              })()}
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
                      const lk = lockedAt.get(`${s.scene}:${pi}`)
                      return (
                        <p key={pi} data-para={`${s.scene}:${pi}`}
                          className={`${anchored ? 'has-note' : ''}${lk ? ' para-locked' : ''}`}
                          title={lk ? `settled — locked (${lk.id}); right-click to unlock` : undefined}
                          onContextMenu={ev => {
                            ev.preventDefault()
                            openLockMenu(s.scene, s.body, pi, ev)
                          }}
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
                    {/* What is settled, shown where it sits. A textarea has no
                        regions to mark, so the padlocks are measured onto the
                        gutter beside it — the same measurement that puts note
                        cards level with their editor lines. */}
                    <EditorLocks scene={s.scene} body={overrides[s.file] ?? s.body}
                      lockedAt={lockedAt} onRefused={setLockedNote} />
                    {lockedNote && <p className="locked-note">{lockedNote}</p>}
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
                ? <DiffBody d={diffed} paraKey={paraKeyFor(s)} busy={busy} flash={flash}
                    onAccept={t => judge(`${t.side}:${t.paragraph}`, () => acceptParagraph(s.file, t))}
                    onReject={t => judge(`${t.side}:${t.paragraph}`, () => rejectParagraph(s.file, t))}
                    onSentence={(t, verb) => judge(t.paragraph, () => (verb === 'accept' ? acceptSentence : rejectSentence)({
                      file: s.file, paragraph: t.paragraph, side: t.side, sentence: t.sentence,
                    }))} />
                : <div className="mdbody prose" onClick={bodyClick} onMouseUp={() => captureSelection(s)}>
                  {paragraphsOf(s.body).map((p, pi) => {
                    const anchored = notes.some(n =>
                      n.anchor.scene === s.scene && n.resolution.paragraph === pi &&
                      n.status !== 'resolved' && n.status !== 'dropped')
                    const isFocus = focused === `${s.scene}:${pi}`
                    const noteHere = notes.find(n =>
                      n.anchor.scene === s.scene && n.resolution.paragraph === pi &&
                      n.status !== 'resolved' && n.status !== 'dropped')
                    const lk = lockedAt.get(`${s.scene}:${pi}`)
                    return (
                      <p key={pi} data-para={`${s.scene}:${pi}`}
                        onClick={noteHere ? () => { setActive(noteHere.id); setFocused(`${s.scene}:${pi}`) } : undefined}
                        className={`${anchored ? 'has-note' : ''}${isFocus ? ' note-focus' : ''}${lk ? ' para-locked' : ''}`}
                        title={lk ? `settled — locked (${lk.id}); right-click to unlock` : undefined}
                        onContextMenu={ev => {
                          ev.preventDefault()
                          openLockMenu(s.scene, s.body, pi, ev)
                        }}
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
            {sel.quote
              ? <blockquote className="note-quote">{sel.quote}</blockquote>
              : <div className="note-scope">about all of {sel.scene}</div>}
            <textarea ref={composerRef} value={noteText} rows={4}
              placeholder={sel.quote
                ? 'What did you notice? Write it as you would say it — arc works out the scope.'
                : 'What about this scene? Including what it does not say yet.'}
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
          {/* Copy is the one verb that is only ever about the selection, so it
              is the one item that is absent rather than unavailable without
              one — an empty clipboard is not a thing to offer. The raw slice,
              not the trimmed quote: copy gives back exactly what was
              highlighted. */}
          {selMenu.end > selMenu.start && (
            <button title="Copy the selected text"
              onClick={() => {
                void navigator.clipboard.writeText(selMenu.body.slice(selMenu.start, selMenu.end))
                setSelMenu(null)
              }}>
              Copy
            </button>
          )}
          <button onClick={noteFromMenu}>Add note</button>
          {(() => {
            /* Lock/Unlock from the editor's own menu (A29): every paragraph
               the selection covers, not only the one it starts in. Editor
               text may be ahead of disk, so the pending edit is flushed
               before the lock lands — a lock made on unsaved prose would
               anchor to a body the backend cannot see. */
            const paras = paragraphsOf(selMenu.body)
            const targets = paragraphRange(selMenu.body, selMenu.start, selMenu.end).map(i => ({
              paragraph: i, para: paras[i] ?? '', lockId: lockedAt.get(`${selMenu.scene}:${i}`)?.id ?? null,
            }))
            const unlocked = targets.filter(t => !t.lockId)
            const locked = targets.filter(t => t.lockId)
            const many = targets.length > 1 ? ` ${targets.length} paragraphs` : ' paragraph'
            const first = targets[0]
            return <>
              <button title="A structural marker on the margin timeline: what this passage must get across"
                onClick={() => {
                  void flushFile(selMenu.file).then(() =>
                    setKpDraft({ scene: selMenu.scene, paragraph: first.paragraph, quote: first.para, x: selMenu.x, y: selMenu.y, text: '' }))
                  setSelMenu(null)
                }}>
                Mark key point
              </button>
              {unlocked.length > 0 && (
                <button title="Settled prose: nothing may rewrite this — not an edit, not a revision pass — until you unlock it"
                  onClick={() => { void flushFile(selMenu.file).then(() => lockHere(selMenu.scene, unlocked)) }}>
                  Lock{locked.length ? ` the other ${unlocked.length}` : many}
                </button>
              )}
              {locked.length > 0 && (
                <button onClick={() => void unlockHere(locked.map(t => t.lockId!))}>
                  Unlock{unlocked.length ? ` the ${locked.length} locked` : many}
                </button>
              )}
            </>
          })()}
          {/* Rephrase and Synonyms both rewrite a passage the author pointed
              at, so with nothing selected there is nothing to rewrite. They
              stay in place and say why rather than disappearing: a menu whose
              items come and go teaches the author to hunt for them.

              aria-disabled, NOT disabled: a disabled button takes no pointer
              events at all in Chrome, so its title never fires — the reason
              would be written down somewhere the mouse can never reach it.
              Hence the reason inline, where it needs no hover to be read. */}
          {selMenu.quote ? (
            <button onClick={() => void askSuggest('rephrase')}>Rephrase…</button>
          ) : (
            <button className="off" aria-disabled="true" onClick={ev => ev.preventDefault()}>
              Rephrase…
              <span className="mi-why">select the passage you want rewritten</span>
            </button>
          )}
          {/* Redraft is the third verb: not alternatives for a selection
              (rephrase), not the minimal answer to notes (revise), but a
              rebuild. A selection names the paragraphs to rebuild between
              their seams; no selection means the whole scene. */}
          {(() => {
            const range = selMenu.quote
              ? (() => {
                const covered = paragraphRange(selMenu.body, selMenu.start, selMenu.end)
                return covered.length ? [covered[0], covered[covered.length - 1]] as [number, number] : undefined
              })()
              : undefined
            const label = range ? (range[0] === range[1] ? 'Redraft this paragraph…' : 'Redraft these paragraphs…') : 'Redraft the scene…'
            return (
              <button disabled={genBusy}
                title={range
                  ? 'Rebuild the selected paragraphs between their seams. Everything outside the selection is preserved to the byte.'
                  : 'A clean pass over the whole scene, rebuilt to its contract. Locked paragraphs survive verbatim.'}
                onClick={() => {
                  void redraft(selMenu.scene, selMenu.file, range)
                  setSelMenu(null)
                }}>
                {label}
              </button>
            )
          })()}
          {/* Synonyms answers with drop-in replacements — same part of speech,
              same case — which only means anything for one word. */}
          {isSingleWord(selMenu.quote) ? (
            <button onClick={() => void askSuggest('synonyms')}
              title="Alternatives for this word, with a note on what each one carries">
              Synonyms…
            </button>
          ) : (
            <button className="off" aria-disabled="true" onClick={ev => ev.preventDefault()}>
              Synonyms…
              <span className="mi-why">
                {selMenu.quote ? 'one word at a time — use Rephrase for a passage' : 'select a word'}
              </span>
            </button>
          )}
        </div>
      )}
      {/* The lock menu (A29): right-click on rendered prose. Two verbs, one
          paragraph, and the durable anchor is the paragraph's own text. */}
      {lockMenu && (() => {
        // The menu names what it is about to do to how many, because a
        // selection is easy to misjudge and a lock is a refusal the author
        // will meet later as a 423.
        const unlocked = lockMenu.targets.filter(t => !t.lockId)
        const locked = lockMenu.targets.filter(t => t.lockId)
        const n = lockMenu.targets.length
        const many = n > 1 ? ` ${n} paragraphs` : ' paragraph'
        // A key point marks one passage; with a run selected, the first is
        // the one the statement is about.
        const first = lockMenu.targets[0]
        return (
        <div className="sel-menu" style={{ left: lockMenu.x, top: lockMenu.y }}>
          <button title="A structural marker on the margin timeline: what this passage must get across"
            onClick={() => {
              setKpDraft({ scene: lockMenu.scene, paragraph: first.paragraph, quote: first.para,
                x: lockMenu.x, y: lockMenu.y, text: '' })
              setLockMenu(null)
            }}>
            Mark key point
          </button>
          {unlocked.length > 0 && (
            <button title="Settled prose: nothing may rewrite this — not an edit, not a revision pass — until you unlock it"
              onClick={() => void lockHere(lockMenu.scene, unlocked)}>
              Lock{locked.length ? ` the other ${unlocked.length}` : many}
            </button>
          )}
          {locked.length > 0 && (
            <button onClick={() => void unlockHere(locked.map(t => t.lockId!))}>
              Unlock{unlocked.length ? ` the ${locked.length} locked` : many}
            </button>
          )}
        </div>
        )
      })()}

      {/* The statement a new key point will carry — written at the click
          point, landed with Enter, abandoned with Escape or a click away. */}
      {kpDraft && (
        <div className="sel-menu kp-draft" style={{ left: kpDraft.x, top: kpDraft.y }}>
          <input autoFocus value={kpDraft.text} placeholder="What must this passage get across?"
            onChange={ev => setKpDraft({ ...kpDraft, text: ev.target.value })}
            onKeyDown={ev => { if (ev.key === 'Enter') void mintKeypoint() }} />
        </div>
      )}

      {kpMenu && (
        <div className="sel-menu" style={{ left: kpMenu.x, top: kpMenu.y }}>
          <button onClick={() => void removeKeypoint(kpMenu.id)}>Remove key point</button>
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
