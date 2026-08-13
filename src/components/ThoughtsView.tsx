import { useEffect, useMemo, useState } from 'react'
import type { MaterialItem, RawDump } from '../canon'
import { deleteDump, listDumps, updateMaterial } from '../api'

/** Everything the author has thought at the story and not yet placed.
 *
 *  Two records sit here, and the difference between them is the whole point of
 *  the page. The FILED THOUGHTS are material (conventions §12) — arc's reading
 *  of what was said, structured, and the thing later passes actually consume.
 *  YOUR WORDS are the raw dumps: exactly what was typed, saved before any
 *  model ran.
 *
 *  They are also disposed of differently, and that is deliberate rather than
 *  inconsistent. A filed thought is DROPPED — the file and its id survive,
 *  because "dropped beats deletion: intent history is story history" (§12). A
 *  raw dump is DELETED, because it is transient by design: it lives under
 *  .arc/, it is gitignored, and once the thought it carried has been filed it
 *  is a duplicate the author may reasonably want gone.
 */
export function ThoughtsView({ items, onChanged }: {
  items: MaterialItem[]
  onChanged: () => void
}) {
  const [tab, setTab] = useState<'filed' | 'raw'>('filed')
  const [showDropped, setShowDropped] = useState(false)

  const live = useMemo(() => items.filter(i => i.status !== 'dropped'), [items])
  const dropped = useMemo(() => items.filter(i => i.status === 'dropped'), [items])

  return (
    <div className="wiki-layout">
      <nav className="side-nav">
        <h3>Thoughts</h3>
        <button className={tab === 'filed' ? 'navitem sel' : 'navitem'} onClick={() => setTab('filed')}>
          Filed
          <span className="chmeta">{live.length} in play{dropped.length ? ` · ${dropped.length} dropped` : ''}</span>
        </button>
        <button className={tab === 'raw' ? 'navitem sel' : 'navitem'} onClick={() => setTab('raw')}>
          Your words
          <span className="chmeta">exactly as you typed them</span>
        </button>
      </nav>

      <article className="ms-main">
        {tab === 'filed' ? (
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

            {live.map(item => <Thought key={item.id} item={item} onChanged={onChanged} />)}

            {dropped.length > 0 && (
              <div className="th-dropped">
                <button className="linklike" onClick={() => setShowDropped(o => !o)}>
                  {showDropped ? 'hide' : 'show'} {dropped.length} dropped
                </button>
                <p className="fsummary">Dropped thoughts keep their record — arc never forgets that you
                  once had them. Restore any of them at any time.</p>
                {showDropped && dropped.map(item => <Thought key={item.id} item={item} onChanged={onChanged} />)}
              </div>
            )}
          </>
        ) : (
          <RawDumps />
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

/** The raw dumps. Loaded here rather than in the app's shared fetch, because
 *  nothing outside this page needs them and they are the one thing here that
 *  can be genuinely deleted. */
function RawDumps() {
  const [dumps, setDumps] = useState<RawDump[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => { listDumps().then(r => setDumps(r.dumps)).catch(e => setError(String(e))) }
  useEffect(load, [])

  const remove = async (file: string) => {
    try {
      await deleteDump({ file })
      setDumps(d => (d ?? []).filter(x => x.file !== file))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <>
      <header className="ms-head th-head">
        <h1>Your words</h1>
        <p className="ms-meta">
          What you typed, saved before anything read it — so a failed pass costs a retry and never a
          thought. These are working notes, not the record: deleting one leaves everything it was
          filed as untouched.
        </p>
      </header>

      {error && <p className="cap-error">{error}</p>}
      {dumps === null && <p className="fsummary">Reading…</p>}
      {dumps?.length === 0 && (
        <div className="ms-empty"><p>Nothing here yet — every thought you add is saved here first.</p></div>
      )}

      {dumps?.map(d => (
        <div className="thought" key={d.file}>
          <div className="th-top">
            <code>{d.at ? new Date(d.at).toLocaleString() : d.file}</code>
          </div>
          <p className="th-body raw">{d.text}</p>
          <div className="th-acts">
            <button className="ghost" onClick={() => void remove(d.file)}
              title="Deletes this copy of what you typed. Anything it was filed as stays.">
              Delete
            </button>
          </div>
        </div>
      ))}
    </>
  )
}
