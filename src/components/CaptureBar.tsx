import { useEffect, useRef, useState } from 'react'
import type { DumpResponse, FiledItem } from '../canon'
import { decideDump, fileDump } from '../api'
import { Working } from './Working'

/** The brain dump: one box, always there, for whatever is in the author's head.
 *
 *  It FILES rather than answers. What the author types goes into the material
 *  layer (conventions §12) — the unplaced rung of material → proposed → canon
 *  → manuscript — which asserts no story truth and binds nothing. That is what
 *  makes it safe to type into without thinking: capturing costs nothing, so a
 *  half-formed thought is never a commitment.
 *
 *  Underneath is the work graph's slice 1, unchanged: intake reads the text
 *  into an intent, the claim derived from it grants material writes and no
 *  canon writes at all, a capability-gated worker mints the mat.* ids, a judge
 *  reads the result, and nothing is settled until the author says so. This
 *  component is the door; none of that is new.
 *
 *  The author's words hit the disk before any of it runs, so a failed pass
 *  costs a retry and never a thought. The box keeps its text on failure for
 *  the same reason.
 */
export function CaptureBar({ engine, onFiled }: {
  /** null when no engine is configured — the box says so instead of dying quietly. */
  engine: 'sdk' | 'claude-cli' | null
  /** A decision landed: the material layer changed. */
  onFiled: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<DumpResponse | null>(null)
  const [deciding, setDeciding] = useState<'keep' | 'discard' | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)

  // Escape and click-away put it down — but never while a pass is running or
  // a result is waiting to be answered, because closing then would strand a
  // decision the author has not made.
  useEffect(() => {
    if (!open) return
    const stuck = () => busy || !!result
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !stuck()) setOpen(false) }
    const down = (ev: MouseEvent) => {
      if (stuck()) return
      if (root.current?.contains(ev.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('keydown', key)
    window.addEventListener('mousedown', down)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('mousedown', down)
    }
  }, [open, busy, result])

  useEffect(() => { if (open) box.current?.focus({ preventScroll: true }) }, [open])

  const file = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fileDump({ text })
      setResult(res)
      setText('')                          // only cleared once it is safely filed
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      // text deliberately left in the box — it is the author's, not ours
    } finally {
      setBusy(false)
    }
  }

  const answer = async (keep: boolean) => {
    if (!result) return
    setDeciding(keep ? 'keep' : 'discard')
    try {
      await decideDump({ run: result.run, keep })
      setResult(null)
      setOpen(false)
      onFiled()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeciding(null)
    }
  }

  return (
    <div className="capture" ref={root}>
      {/* Costs nothing until used: one small control, and the nav row keeps
          every pixel it had before capture existed. */}
      <button className={open ? 'cap-trigger on' : 'cap-trigger'}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        title={engine
          ? 'Write down whatever is on your mind — arc files it as story material'
          : 'Capture needs a generation engine — set ANTHROPIC_API_KEY, or log in to the claude CLI, and restart the backend'}>
        Add a thought{text.trim() && !open ? ' ·' : ''}
      </button>

      {/* A floating panel, not an inline field. It overlays the page rather
          than living in the layout, so nothing it does — typing, newlines, a
          long result — can resize the top bar or push the page down. */}
      {open && (
        <div className="cap-panel">
          <textarea
            ref={box}
            className="cap-box"
            rows={4}
            value={text}
            disabled={!engine || busy}
            placeholder={engine
              ? 'Anything on your mind — it gets filed, not answered'
              : 'No generation engine configured, so nothing can be filed yet.'}
            onChange={ev => setText(ev.target.value)}
            onKeyDown={ev => {
              // Cmd/Ctrl+Enter files it. Plain Enter stays a newline: a dump is
              // often several sentences, and losing one to a stray Return would
              // teach the author to distrust the box.
              if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); void file() }
            }}
          />

          <div className="cap-row">
            <span className="cap-hint">Filed as material — binds nothing until you say so</span>
            <button className="cap-file" disabled={!engine || busy || !text.trim()} onClick={() => void file()}
              title="File this into your story material (⌘/Ctrl+Enter)">
              {busy ? 'Filing…' : 'File it'}
            </button>
          </div>

          {busy && <Working label="Reading what you wrote and filing it as material" />}
          {error && <p className="cap-error">{error}</p>}
          {result && !busy && <Filed result={result} deciding={deciding} onAnswer={answer} />}
        </div>
      )}
    </div>
  )
}

/** What arc made of it — shown before anything is settled, because the author
 *  cannot judge a filing they cannot see. Every field here was read back from
 *  the file on disk, not from what the worker said it wrote. */
function Filed({ result, deciding, onAnswer }: {
  result: DumpResponse
  deciding: 'keep' | 'discard' | null
  onAnswer: (keep: boolean) => void
}) {
  return (
    <div className="cap-filed">
      <div className="cap-filed-head">
        <b>Filed {result.filed.length} item{result.filed.length === 1 ? '' : 's'}</b>
        <span className="reg-argued">unplaced · binds nothing</span>
      </div>

      {result.filed.length === 0 && (
        <p className="cap-none">Arc read this but filed nothing. Its account: {result.reply.trim().slice(0, 300)}</p>
      )}

      {result.filed.map((f: FiledItem) => (
        <div className="cap-item" key={f.path}>
          <div className="cap-item-head">
            <code>{f.id}</code><span className="cap-type">{f.type}</span>
          </div>
          {f.body && <p className="cap-body">{f.body}</p>}
        </div>
      ))}

      {/* Questions arc raised and will not answer (conventions §11: `asked`).
          These are the most useful thing a dump produces and the easiest to
          throw away, so they get their own place rather than a footnote. */}
      {result.asked.length > 0 && (
        <div className="cap-asked">
          <span className="cap-asked-label">left open</span>
          {result.asked.map((q, i) => <p key={i}>{q.question}</p>)}
        </div>
      )}

      <div className="cap-acts">
        <button disabled={!!deciding} onClick={() => onAnswer(true)}>
          {deciding === 'keep' ? 'Keeping…' : result.filed.length ? 'Keep' : 'Done'}
        </button>
        {result.filed.length > 0 && (
          <button className="ghost" disabled={!!deciding} onClick={() => onAnswer(false)}
            title="Marks these dropped rather than deleting them — intent history is story history">
            {deciding === 'discard' ? 'Discarding…' : 'Discard'}
          </button>
        )}
      </div>
    </div>
  )
}
