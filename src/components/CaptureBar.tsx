import { useEffect, useRef, useState } from 'react'
import { addNote } from '../api'

/** Add a thought: one box, always there, for whatever is in the author's head.
 *
 *  FILING IS A WRITE. It saves the note and nothing else — no model, no wait,
 *  no engine required, and no failure mode beyond the disk. The first cut ran
 *  the whole work graph here, and when the worker came back with nothing
 *  usable the author got a 500 after eleven seconds having just written a real
 *  thought. Nothing about a notebook should be able to do that.
 *
 *  Turning a note into story material is a separate act, asked for on the
 *  Thoughts page or from a Claude Code session.
 */
export function CaptureBar({ onFiled }: { onFiled: () => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOpen(false) }
    const down = (ev: MouseEvent) => { if (!root.current?.contains(ev.target as Node)) setOpen(false) }
    window.addEventListener('keydown', key)
    window.addEventListener('mousedown', down)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('mousedown', down)
    }
  }, [open])

  useEffect(() => { if (open) box.current?.focus({ preventScroll: true }) }, [open])

  const file = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await addNote({ text })
      setText('')                    // cleared only once it is safely on disk
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
      onFiled()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      // text deliberately left in the box — it is the author's, not ours
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="capture" ref={root}>
      <button className={open ? 'cap-trigger on' : 'cap-trigger'}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        title="Write down whatever is on your mind — arc keeps it until you want to do something with it">
        Add a thought{text.trim() && !open ? ' ·' : ''}
      </button>

      {open && (
        <div className="cap-panel">
          <textarea
            ref={box}
            className="cap-box"
            rows={4}
            value={text}
            disabled={busy}
            placeholder="Anything on your mind — it gets kept, not answered"
            onChange={ev => setText(ev.target.value)}
            onKeyDown={ev => {
              if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); void file() }
            }}
          />

          <div className="cap-row">
            <span className="cap-hint">
              {saved ? 'Kept. It is on the Thoughts page.' : 'Kept as a note — nothing reads it until you ask'}
            </span>
            <button className="cap-file" disabled={busy || !text.trim()} onClick={() => void file()}
              title="Keep this note (⌘/Ctrl+Enter)">
              {busy ? 'Keeping…' : 'Keep it'}
            </button>
          </div>

          {error && <p className="cap-error">{error}</p>}
        </div>
      )}
    </div>
  )
}
