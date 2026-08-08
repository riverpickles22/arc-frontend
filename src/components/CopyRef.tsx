// The viewer→agent bridge (conventions §7): copy a stable reference —
// char.carlos@ch.10-return — inspect visually, paste into a Claude session,
// and the agent retrieves the exact object at the exact moment.
import { useRef, useState } from 'react'

export function CopyRef({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const copy = () => {
    void navigator.clipboard.writeText(text)
    setDone(true)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setDone(false), 1200)
  }

  return (
    <button className="copyref" title={`Copy reference: ${text}`} onClick={copy}>
      {done ? 'copied' : '⧉ ref'}
    </button>
  )
}
