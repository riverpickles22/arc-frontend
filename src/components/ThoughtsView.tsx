import { useMemo, useState } from 'react'
import type { MaterialItem, Note, WorkResponse } from '../canon'
import { decideWork, removeNote, reviseNote, updateMaterial, workNote } from '../api'
import { Working } from './Working'

/** Everything the author has thought at the story and not yet placed.
 *
 *  Two records, in the order they happen. YOUR NOTES come first: exactly what
 *  was written, kept the moment it was written, and never read by anything
 *  until asked. STORY MATERIAL is what arc made of a note once the author
 *  asked it to — structured, and what the later passes actually consume.
 *
 *  They are disposed of differently, and that is deliberate rather than
 *  inconsistent. A note is the author's own, and DELETES. A material item is a
 *  record of intent and is DROPPED — the file and the id survive, because
 *  "dropped beats deletion: intent history is story history" (§12).
 */
export function ThoughtsView({ notes, items, onNotesChanged, onMaterialChanged }: {
  notes: Note[]
  items: MaterialItem[]
  onNotesChanged: () => void
  onMaterialChanged: () => void
}) {
  const [tab, setTab] = useState<'notes' | 'filed'>('notes')
  const [showDropped, setShowDropped] = useState(false)

  const live = useMemo(() => items.filter(i => i.status !== 'dropped'), [items])
  const dropped = useMemo(() => items.filter(i => i.status === 'dropped'), [items])
  const worked = useMemo(() => notes.filter(n => n.worked.length).length, [notes])

  return (
    <div className="wiki-layout">
      <nav className="side-nav">
        <h3>Thoughts</h3>
        <button className={tab === 'notes' ? 'navitem sel' : 'navitem'} onClick={() => setTab('notes')}>
          Your notes
          <span className="chmeta">{notes.length || 'none'} kept{worked ? ` · ${worked} worked in` : ''}</span>
        </button>
        <button className={tab === 'filed' ? 'navitem sel' : 'navitem'} onClick={() => setTab('filed')}>
          Story material
          <span className="chmeta">{live.length} in play{dropped.length ? ` · ${dropped.length} dropped` : ''}</span>
        </button>
      </nav>

      <article className="ms-main">
        {tab === 'notes' ? (
          <Notebook notes={notes} onChanged={onNotesChanged} onMaterialChanged={onMaterialChanged} />
        ) : (
          <>
            <header className="ms-head th-head">
              <h1>Filed thoughts</h1>
              <p className="ms-meta">
                Arc&rsquo;s reading of what you said, in its words — yours to correct.
                Nothing here is load-bearing: the story never depends on it until you place it.
              </p>
            </header>

            {!live.length && !dropped.length && (
              <div className="ms-empty">
                <p>Nothing filed yet. Use <b>Add a thought</b> in the top bar — anything you write there
                  lands here, and binds nothing.</p>
              </div>
            )}

            {live.map(item => <Thought key={item.id} item={item} onChanged={onMaterialChanged} />)}

            {dropped.length > 0 && (
              <div className="th-dropped">
                <button className="linklike" onClick={() => setShowDropped(o => !o)}>
                  {showDropped ? 'hide' : 'show'} {dropped.length} dropped
                </button>
                <p className="fsummary">Dropped thoughts keep their record — arc never forgets that you
                  once had them. Restore any of them at any time.</p>
                {showDropped && dropped.map(item => <Thought key={item.id} item={item} onChanged={onMaterialChanged} />)}
              </div>
            )}
          </>
        )}
      </article>
    </div>
  )
}

/** One filed thought. The body is editable in place: arc wrote it, arc can be
 *  wrong about it, and opening a YAML file to fix a sentence is exactly the
 *  errand the capture box exists to remove. */
function Thought({ item, onChanged }: { item: MaterialItem; onChanged: () => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async (patch: { body?: string; status?: MaterialItem['status'] }) => {
    setBusy(true)
    setError(null)
    try {
      await updateMaterial({ id: item.id, ...patch })
      setDraft(null)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={item.status === 'dropped' ? 'thought is-dropped' : 'thought'}>
      <div className="th-top">
        <code>{item.id}</code>
        <span className="cap-type">{item.type}</span>
        {item.status !== 'unplaced' && <span className="th-status">{item.status}</span>}
      </div>

      {draft === null ? (
        <p className="th-body" title="Click to edit" onClick={() => setDraft(item.body)}>{item.body}</p>
      ) : (
        <>
          <textarea className="th-edit" value={draft} autoFocus
            onChange={ev => setDraft(ev.target.value)}
            onKeyDown={ev => {
              if (ev.key === 'Escape') setDraft(null)
              if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) void save({ body: draft })
            }} />
          <div className="th-acts">
            <button disabled={busy || !draft.trim()} onClick={() => void save({ body: draft })}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="ghost" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </>
      )}

      {item.purpose && draft === null && <p className="th-purpose">{item.purpose}</p>}
      {error && <p className="cap-error">{error}</p>}

      {draft === null && (
        <div className="th-acts">
          {item.status === 'dropped' ? (
            <button disabled={busy} onClick={() => void save({ status: 'unplaced' })}>Restore</button>
          ) : (
            <button className="ghost" disabled={busy} onClick={() => void save({ status: 'dropped' })}
              title="Keeps the record and stops it counting — arc never deletes a thought you had">
              Drop
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** The notebook: what the author actually wrote, in their words.
 *
 *  Nothing here has been read by a model. A note sits exactly as typed until
 *  the author asks arc to work it into the story — which is the whole point of
 *  the split, and why keeping a thought can never fail or make them wait. */
function Notebook({ notes, onChanged, onMaterialChanged }: {
  notes: Note[]
  onChanged: () => void
  onMaterialChanged: () => void
}) {
  return (
    <>
      <header className="ms-head th-head">
        <h1>Your notes</h1>
        <p className="ms-meta">
          Exactly what you wrote, kept the moment you wrote it. Nothing reads these until you
          ask — from here, or from a Claude Code session with{' '}
          <code>npm run work</code>.
        </p>
      </header>

      {!notes.length && (
        <div className="ms-empty">
          <p>Nothing yet. Use <b>Add a thought</b> in the top bar — whatever you type there lands
            here immediately, and no model sees it until you say so.</p>
        </div>
      )}

      {notes.map(n => <NoteCard key={n.file} note={n} onChanged={onChanged} onMaterialChanged={onMaterialChanged} />)}
    </>
  )
}

function NoteCard({ note, onChanged, onMaterialChanged }: {
  note: Note
  onChanged: () => void
  onMaterialChanged: () => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState<'saving' | 'working' | 'deciding' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<WorkResponse | null>(null)

  const act = async (fn: () => Promise<unknown>, phase: 'saving' | 'working' | 'deciding') => {
    setBusy(phase)
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(null) }
  }

  const save = () => act(async () => {
    await reviseNote({ file: note.file, text: draft ?? '' })
    setDraft(null); onChanged()
  }, 'saving')

  const remove = () => act(async () => { await removeNote({ file: note.file }); onChanged() }, 'saving')

  const work = () => act(async () => { setResult(await workNote({ file: note.file })); onChanged() }, 'working')

  const answer = (keep: boolean) => act(async () => {
    await decideWork({ run: result!.run, keep })
    setResult(null); onMaterialChanged()
  }, 'deciding')

  return (
    <div className="thought">
      <div className="th-top">
        <code>{note.created ? new Date(note.created).toLocaleString() : note.file}</code>
        {note.worked.length > 0 && <span className="th-status">worked in</span>}
      </div>

      {draft === null ? (
        <p className="th-body raw" title="Click to edit" onClick={() => setDraft(note.text)}>{note.text}</p>
      ) : (
        <>
          <textarea className="th-edit" value={draft} autoFocus
            onChange={ev => setDraft(ev.target.value)}
            onKeyDown={ev => {
              if (ev.key === 'Escape') setDraft(null)
              if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) void save()
            }} />
          <div className="th-acts">
            <button disabled={!!busy || !draft.trim()} onClick={() => void save()}>
              {busy === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button className="ghost" disabled={!!busy} onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </>
      )}

      {busy === 'working' && <Working label="Reading your note and working it into the story" />}
      {error && <p className="cap-error">{error}</p>}

      {result && busy !== 'working' && (
        <div className="cap-filed">
          <div className="cap-filed-head">
            <b>Filed {result.filed.length} item{result.filed.length === 1 ? '' : 's'}</b>
            <span className="reg-argued">unplaced · binds nothing</span>
          </div>
          {result.filed.length === 0 && (
            <p className="cap-none">Arc read this but filed nothing. Its account: {result.reply.trim().slice(0, 300)}</p>
          )}
          {result.filed.map(f => (
            <div className="cap-item" key={f.path}>
              <div className="cap-item-head"><code>{f.id}</code><span className="cap-type">{f.type}</span></div>
              {f.body && <p className="cap-body">{f.body}</p>}
            </div>
          ))}
          {result.asked.length > 0 && (
            <div className="cap-asked">
              <span className="cap-asked-label">left open</span>
              {result.asked.map((q, i) => <p key={i}>{q.question}</p>)}
            </div>
          )}
          <div className="cap-acts">
            <button disabled={!!busy} onClick={() => void answer(true)}>
              {busy === 'deciding' ? 'Keeping…' : result.filed.length ? 'Keep' : 'Done'}
            </button>
            {result.filed.length > 0 && (
              <button className="ghost" disabled={!!busy} onClick={() => void answer(false)}
                title="Marks these dropped rather than deleting them — intent history is story history">
                Discard
              </button>
            )}
          </div>
        </div>
      )}

      {draft === null && !result && busy !== 'working' && (
        <div className="th-acts">
          <button disabled={!!busy} onClick={() => void work()}
            title="Ask arc to read this note and turn it into story material. Your note is untouched either way.">
            {note.worked.length ? 'Work in again' : 'Work this into the story'}
          </button>
          <button className="ghost" disabled={!!busy} onClick={() => void remove()}
            title="Deletes this note. Anything it was already filed as stays.">
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
