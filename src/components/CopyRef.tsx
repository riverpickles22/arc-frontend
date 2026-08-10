// The viewer→agent bridge (conventions §7): copy a stable reference —
// char.carlos@ch.10-return — inspect visually, paste into a Claude session,
// and the agent retrieves the exact object at the exact moment.
//
// CopyProse is the other direction: prose out of the viewer and into wherever
// the author wants to read it. Same clipboard mechanics, same confirmation, so
// a copy button behaves identically wherever it appears.
import { useRef, useState } from 'react'

/** Write to the clipboard and confirm it briefly. The text is produced
 *  lazily — a chapter's prose is built on the click, not on every render. */
function useCopy(get: () => string) {
  const [done, setDone] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const copy = () => {
    void navigator.clipboard.writeText(get())
    setDone(true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDone(false), 1200)
  }
  return { done, copy }
}

export function CopyRef({ text }: { text: string }) {
  const { done, copy } = useCopy(() => text)
  return (
    <button className="copyref" title={`Copy reference: ${text}`} onClick={copy}>
      {done ? 'copied' : '⧉ ref'}
    </button>
  )
}

/** Copy prose — a scene, or a whole chapter. Disabled rather than hidden when
 *  there is nothing drafted, so the control does not move around as chapters
 *  fill in. */
export function CopyProse({ get, label, title, disabled }: {
  get: () => string
  label: string
  title: string
  disabled?: boolean
}) {
  const { done, copy } = useCopy(get)
  return (
    <button className="copyref" title={title} disabled={disabled} onClick={copy}>
      {done ? 'copied' : `⧉ ${label}`}
    </button>
  )
}
