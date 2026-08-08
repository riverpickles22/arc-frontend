import { useEffect, useRef, useState } from 'react'
import type { ApiErrorResponse, ChatAction, ChatMessage, ChatResponse } from '../canon'

const ID_RE = /\b((?:char|place|faction|obj|event|era|tp|rel|ch)\.[a-z0-9][a-z0-9.-]*[a-z0-9])\b/g

function Linkified({ text, onSelect }: { text: string; onSelect: (id: string) => void }) {
  const parts = text.split(ID_RE)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1
          ? <a key={i} className="linklike" onClick={() => onSelect(p)}>{p}</a>
          : <span key={i}>{p}</span>,
      )}
    </>
  )
}

export function ChatPanel({
  onCanonChanged, onSelect,
}: {
  onCanonChanged: () => void
  onSelect: (id: string) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [actions, setActions] = useState<Record<number, ChatAction[]>>({})
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, busy])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setError(null)
    const history = [...messages, { role: 'user' as const, content: text }]
    setMessages(history)
    setBusy(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      })
      const data: ChatResponse | ApiErrorResponse = await res.json()
      if (!res.ok || 'error' in data) throw new Error(('error' in data ? data.error : undefined) ?? `HTTP ${res.status}`)
      setMessages(m => {
        setActions(a => ({ ...a, [m.length]: data.actions ?? [] }))
        return [...m, { role: 'assistant', content: data.reply || '(no reply)' }]
      })
      if (data.canonChanged) onCanonChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-hint">
            Talk to the arc agent about your world — it reads the full canon and
            can reshape it as you converse. Changes land as{' '}
            <span className="badge proposed">proposed</span> until you ratify them.
            <div className="chat-examples">
              <em>"Give the neighbor who informs a name and a reason — make them real."</em>
              <em>"Add a state snapshot for the stray during the riot."</em>
              <em>"Merge chapters 2 and 3 — the second POV lands too early."</em>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <Linkified text={m.content} onSelect={onSelect} />
            {m.role === 'assistant' && (actions[i]?.length ?? 0) > 0 && (
              <div className="chat-actions">
                {actions[i].map((a, j) => (
                  <span key={j} className={`actionchip${a.ok ? '' : ' failed'}`}>
                    ✎ {a.path}{a.ok ? '' : ` — ${a.detail}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant thinking">shaping the world…</div>}
        {error && <div className="bubble error">{error}</div>}
      </div>
      <div className="chat-input">
        <textarea
          value={input}
          placeholder="Shape the world…"
          rows={2}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button onClick={send} disabled={busy || !input.trim()}>Send</button>
      </div>
    </div>
  )
}
