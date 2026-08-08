import { useMemo, useState } from 'react'
import type { Chapter, ChatResponse, DraftSceneResponse, ProseDraft, ProseScene, SceneContract } from '../canon'
import { dateOf } from '../canon'
import { acceptDraft, discardDraft, draftScene } from '../api'
import { wikilinkClickHandler } from '../wikilinks'
import { mdToHtml } from '../md'
import { diffProse, diffStats, type ParaDiff } from '../diff'
import { CopyRef } from './CopyRef'

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

/** A diffed prose body: paragraphs with word-level ins/del highlighting. */
function DiffBody({ d }: { d: ParaDiff[] }) {
  return (
    <div className="mdbody prose">
      {d.map((p, i) => {
        if (p.kind === 'changed') {
          return (
            <p key={i}>
              {p.pieces!.map((pc, k) =>
                pc.kind === 'same' ? <span key={k}>{pc.text} </span>
                  : pc.kind === 'ins' ? <ins key={k}>{pc.text} </ins>
                    : <del key={k}>{pc.text} </del>)}
            </p>
          )
        }
        if (p.kind === 'ins') return <p key={i}><ins>{p.text}</ins></p>
        if (p.kind === 'del') return <p key={i}><del>{p.text}</del></p>
        return <p key={i}>{p.text}</p>
      })}
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
export function ManuscriptView({ scenes, chapters, chapterIx, onChapter, onOpenWorld, draft, onRefresh, onCanonChanged }: {
  scenes: ProseScene[]
  chapters: Chapter[]          // sorted by order
  chapterIx: number
  onChapter: (ix: number) => void
  onOpenWorld: (id: string) => void
  draft: ProseDraft
  onRefresh: () => void
  onCanonChanged?: () => void
}) {
  const [showChanges, setShowChanges] = useState(true)
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
  const totals = useMemo(() => {
    let ins = 0, del = 0
    for (const d of diffs.values()) { const s = diffStats(d); ins += s.ins; del += s.del }
    return { ins, del }
  }, [diffs])

  if (!chapters.length) return <div className="empty">No chapters in canon yet.</div>
  const cur = chapters[Math.min(chapterIx, chapters.length - 1)]
  const curScenes = scenes.filter(s => s.chapter === cur.id).sort((a, b) => a.file.localeCompare(b.file))
  const curDeleted = draft.changes.filter(c => c.status === 'deleted' && c.main?.chapter === cur.id)
  const scenesOf = (id: string) => scenes.filter(s => s.chapter === id).length
  const spanText = [dateOf(cur.span.start), dateOf(cur.span.end)].filter(Boolean).join(' → ')
  const n = draft.changes.length

  // Kindle-style estimate over the chapter's drafted prose: ~250 words to a
  // page, ~230 words a minute; hidden while a chapter is outline-only.
  const words = curScenes.reduce((acc, s) => acc + (s.body.trim() ? s.body.trim().split(/\s+/).length : 0), 0)
  const pages = Math.max(1, Math.round(words / 250))
  const mins = Math.max(1, Math.round(words / 230))

  const bodyClick = wikilinkClickHandler(onOpenWorld)

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
        {chapters.map((c, i) => (
          <button key={c.id} className={i === chapterIx ? 'navitem sel' : 'navitem'} onClick={() => gotoChapter(i)}>
            <span className="chn">{c.order === 0 ? 'P' : c.order}</span> {c.title}
            <span className="chmeta">{scenesOf(c.id) ? `${scenesOf(c.id)} scene${scenesOf(c.id) === 1 ? '' : 's'}` : 'outline'}</span>
          </button>
        ))}
      </nav>

      <article className="ms-main">
        {draft.git && (
          <div className={n ? 'draftbar' : 'draftbar clean'}>
            {n ? (
              <>
                <span className="db-sum"><b>Draft</b> — {n} scene{n === 1 ? '' : 's'} changed ·{' '}
                  <span className="ins-ct">+{totals.ins}</span> <span className="del-ct">−{totals.del}</span> words vs main</span>
                <label className="db-toggle">
                  <input type="checkbox" checked={showChanges} onChange={ev => setShowChanges(ev.target.checked)} />
                  highlight changes
                </label>
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
          <h1>{cur.order === 0 ? 'Prologue' : `Chapter ${cur.order}`} — {cur.title}</h1>
          <p className="ms-meta">{spanText}{cur.part ? ` · ${cur.part}` : ''}
            {words > 0 && ` · ~${pages} page${pages === 1 ? '' : 's'} · ${mins} min read`}
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
          return (
            <section key={s.scene} className="scene">
              <div className="scene-head">
                <code>{s.scene}</code>
                <CopyRef text={s.scene} />
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
              {diffed
                ? <DiffBody d={diffed} />
                : <div className="mdbody prose" onClick={bodyClick}
                  dangerouslySetInnerHTML={{ __html: mdToHtml(s.body) }} />}
            </section>
          )
        })}

        {showChanges && curDeleted.map(c => (
          <section key={c.file} className="scene">
            <div className="scene-head">
              <code>{c.main!.scene}</code>
              <span className="stpill deleted">draft · deleted</span>
            </div>
            <DiffBody d={diffs.get(c.file) ?? []} />
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
    </div>
  )
}
