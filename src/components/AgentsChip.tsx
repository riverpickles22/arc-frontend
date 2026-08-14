import { useState } from 'react'
import type { Agent, RunSummary } from '../canon'
import type { StreamState } from '../hooks/useRunStream'

/** Who is working on the story, and what they have done.
 *
 *  THE HONESTY RULE, and nowhere is it more tempting to break: in observed
 *  mode this drawer lists what HAS happened and never a checklist of what
 *  comes next, because arc does not know. A Claude session works with its own
 *  tools and its own reasoning; arc holds the run, not the plan. A list of
 *  pending steps would look better and would be a lie (work-graph.md §10).
 *
 *  The other half is external changes. When a file moves with no run behind
 *  it — the author's own editor, a git checkout, a shell script — it says so
 *  plainly rather than being dressed up as governed work.
 */
export function AgentsChip({ stream, onOpenRun }: {
  stream: StreamState
  onOpenRun?: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const { agents, runs, external, connected } = stream

  const working = agents.filter(a => a.state === 'working')
  const externalFiles = external.flatMap(e => e.files)
  const active = runs.filter(r => r.state !== 'closed')

  // The chip earns its space only when there is something to say.
  const label = agents.length === 0 && !externalFiles.length
    ? 'No agents active'
    : [
      agents.length > 0 && `${agents.length} agent${agents.length === 1 ? '' : 's'}${working.length ? ' · working' : ''}`,
      externalFiles.length > 0 && `${externalFiles.length} file${externalFiles.length === 1 ? '' : 's'} changed outside arc`,
    ].filter(Boolean).join(' · ')

  const quiet = agents.length === 0 && !externalFiles.length

  return (
    <>
      <button className={quiet ? 'attn-chip quiet' : 'attn-chip'} onClick={() => setOpen(o => !o)}
        title={connected
          ? 'Agents working on this story, and changes made outside arc'
          : 'Not receiving live updates — the backend may be restarting. Everything else still works.'}>
        {connected ? '' : '○ '}{label}
      </button>

      {open && (
        <div className="attn-drawer">
          {!connected && (
            <p className="fsummary">
              Not receiving live updates. The rest of the viewer is unaffected — this panel will
              fill in when the stream reconnects.
            </p>
          )}

          {agents.length === 0 && (
            <p className="fsummary">
              Nothing is working on the story. A Claude Code session started in the story folder
              appears here on its own.
            </p>
          )}

          {agents.map(a => <AgentCard key={a.session} agent={a} runs={runs} onOpenRun={onOpenRun} />)}

          {active.length > 0 && (
            <div className="ag-section">
              <h3>Runs</h3>
              {active.map(r => (
                <button key={r.id} className="ag-run" onClick={() => onOpenRun?.(r.id)}>
                  <code>{r.id}</code>
                  <span className={r.state === 'awaiting' ? 'ag-state awaits' : 'ag-state'}>{r.state}</span>
                  <span className="ag-prompt">{r.prompt}</span>
                </button>
              ))}
            </div>
          )}

          {externalFiles.length > 0 && (
            <div className="ag-section">
              <h3>Changed outside arc</h3>
              <p className="fsummary">
                No run explains these. That is not a fault — an editor, a script, or a git checkout
                all look like this — but arc will not pretend they were its work.
              </p>
              <ul className="ag-files">
                {[...new Set(externalFiles)].slice(-20).reverse().map(f => <li key={f}><code>{f}</code></li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function AgentCard({ agent, runs, onOpenRun }: {
  agent: Agent
  runs: RunSummary[]
  onOpenRun?: (id: string) => void
}) {
  const run = runs.find(r => r.id === agent.run)
  return (
    <div className="ag-card">
      <div className="ag-head">
        <b>{agent.source}</b>
        <span className={agent.state === 'working' ? 'ag-state working' : 'ag-state'}>{agent.state}</span>
      </div>

      {/* The author's own words, headlined the moment they arrive — before
          intake has read them, which is the whole point of opening the run
          first and reading it afterwards. */}
      {run && (
        <button className="ag-prompt-line" onClick={() => onOpenRun?.(run.id)}>
          “{run.prompt}”
        </button>
      )}

      {agent.actions.length > 0 && (
        <>
          <div className="ag-label">what it has done</div>
          <ul className="ag-actions">
            {agent.actions.slice(-8).reverse().map((a, i) => (
              <li key={i}><Action detail={a.detail} /></li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** One observed action, read defensively: this is whatever a hook reported,
 *  and a Claude release may change its shape without warning. */
function Action({ detail }: { detail: unknown }) {
  const d = detail as { tool?: string; input?: Record<string, unknown> } | undefined
  const tool = typeof d?.tool === 'string' ? d.tool : 'action'
  const target = d?.input && typeof d.input === 'object'
    ? String(d.input.file_path ?? d.input.path ?? d.input.command ?? '')
    : ''
  return <><code>{tool}</code>{target && <span className="ag-target">{target}</span>}</>
}
