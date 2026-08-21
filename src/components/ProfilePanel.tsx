import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { loadGraph } from 'arc-canon-graph'
import type { Canon, Chapter, Entity, EventDoc, ProseScene, Provenance, State } from '../canon'
import { dateOf, diffCharacter, dk, stateAt, timeRefKey } from '../canon'
import type { CharacterDiff } from '../canon'
import { CopyRef } from './CopyRef'

/** Provenance register (conventions §13): is this the author's invention or
 *  the world's record? Rendered wherever facts are read; absent = fictional,
 *  shown only when a record declares itself. */
function ProvenanceField({ p }: { p: Provenance }) {
  return (
    <div className="field">
      <div className="k">provenance</div>
      <div className="v">
        <span className={`badge prov-${p.register}`}>{p.register}</span>
        {p.confidence && <> · confidence {p.confidence}</>}
        {p.sources?.length ? (
          <> · sources: {p.sources.map((s, i) => <span key={s}>{i > 0 && ', '}<code>{s}</code></span>)}</>
        ) : null}
        {p.note && <div className="prov-note">{p.note}</div>}
      </div>
    </div>
  )
}

interface PovProp {
  active: boolean
  view: { seen: string[]; places: string[]; met: string[]; unseen: string[] } | null
  onToggle: () => void
}

/** Compact one-line summary of a CharacterDiff — contents named, never
 *  counted. The adjacent-snapshot "changed:" line and the full compare view
 *  both derive from the same diffCharacter; this is just its short form. */
const clip = (s: string, n = 44) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
function diffSummary(d: CharacterDiff, canon: Canon): string[] {
  const out: string[] = []
  for (const s of d.scalars) {
    if (s.field === 'location' && s.after) out.push(`→ ${canon.entities[s.after]?.name ?? s.after}`)
    else if (s.field !== 'age') out.push(s.field)
  }
  for (const l of d.lists) {
    for (const x of l.removed) out.push(`${l.field} −“${clip(x)}”`)
    for (const x of l.added) out.push(`${l.field} +“${clip(x)}”`)
  }
  for (const r of d.relationships) {
    const name = canon.entities[r.toward]?.name ?? r.toward
    out.push(r.before === undefined ? `now perceives ${name}` : r.after === undefined ? `no longer perceives ${name}` : `~ ${name}`)
  }
  return out
}

/** The full compare: any two chapters' end states, with the causes that
 *  drove the change. One implementation — diffCharacter — shared with the
 *  CLI and the adjacent-snapshot line above. */
function CompareStates({ e, canon, onSelect }: { e: Entity; canon: Canon; onSelect: (id: string) => void }) {
  const chapters = useMemo(() => [...(canon.chapters ?? [])].sort((x, y) => x.order - y.order), [canon])
  const [fromCh, setFromCh] = useState(chapters[0]?.id ?? '')
  const [toCh, setToCh] = useState(chapters.at(-1)?.id ?? '')
  const key = (id: string) => {
    const c = chapters.find(x => x.id === id)
    const end = dateOf(c?.span.end) ?? dateOf(c?.span.start)
    return end ? dk(end, true) : 99999999
  }
  const d = useMemo(
    () => diffCharacter(e, key(fromCh), key(toCh), canon.timeline.eras),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [e, fromCh, toCh, canon],
  )
  const empty = !d.scalars.length && !d.lists.length && !d.relationships.length
  const sel = (v: string, set: (x: string) => void) => (
    <select className="cmp-select" value={v} onChange={ev => set(ev.target.value)}>
      {chapters.map(c => <option key={c.id} value={c.id}>{c.order === 0 ? 'P' : c.order}. {c.title}</option>)}
    </select>
  )
  return (
    <div className="cmp">
      <div className="cmp-head">compare {sel(fromCh, setFromCh)} → {sel(toCh, setToCh)}</div>
      {empty ? <div className="cmp-empty">no change between these moments{d.from === null && d.to === null ? ' — no state exists at either' : ''}</div> : (
        <div className="cmp-body">
          {d.scalars.map(s => (
            <div key={s.field} className="row"><b>{s.field}</b> {s.field === 'location'
              ? <>{s.before ? <Ref id={s.before} canon={canon} onSelect={onSelect} /> : '—'} → {s.after ? <Ref id={s.after} canon={canon} onSelect={onSelect} /> : '—'}</>
              : <>{clip(s.before ?? '—', 90)} <span className="cmp-arrow">→</span> {clip(s.after ?? '—', 90)}</>}</div>
          ))}
          {d.lists.map(l => (
            <div key={l.field} className="row"><b>{l.field}</b>{' '}
              {l.removed.map(x => <span key={'r' + x} className="cmp-del">− {x}</span>)}
              {l.added.map(x => <span key={'a' + x} className="cmp-ins">+ {x}</span>)}
            </div>
          ))}
          {d.relationships.map(r => (
            <div key={r.toward} className="row"><b>perceives</b> <Ref id={r.toward} canon={canon} onSelect={onSelect} />{': '}
              {r.before === undefined ? <span className="cmp-ins">{r.after}</span>
                : r.after === undefined ? <span className="cmp-del">{r.before} (dropped)</span>
                  : <>{r.before} <span className="cmp-arrow">→</span> <b>{r.after}</b></>}</div>
          ))}
          {d.causes.length > 0 && (
            <div className="row"><b>because of</b> {d.causes.map((c, i) => (
              <span key={c}>{i > 0 && ' · '}<Ref id={c} canon={canon} onSelect={onSelect} /></span>
            ))}</div>
          )}
          {d.steps > 1 && <div className="cmp-steps">{d.steps} snapshots inside this window — the path, not a jump</div>}
        </div>
      )}
    </div>
  )
}

function Ref({ id, canon, onSelect }: { id: string; canon: Canon; onSelect: (id: string) => void }) {
  const chapter = (canon.chapters ?? []).find(c => c.id === id)
  const name = canon.entities[id]?.name ?? canon.events[id]?.title ?? (chapter && `${chapter.order}. ${chapter.title}`) ?? id
  const clickable = id in canon.entities || id in canon.events || !!chapter
  return clickable
    ? <a className="linklike" onClick={() => onSelect(id)}>{name}</a>
    : <span>{name}</span>
}

/** The deterministic blast radius of the selected id (conventions §11):
 *  everything below "depended on by" is register proven; the questions are
 *  register asked — surfaced because the dependency is visible, never
 *  answered. */
function ImpactSection({ canon, id, prose, onSelect }: {
  canon: Canon; id: string; prose: ProseScene[]; onSelect: (id: string) => void
}) {
  const report = useMemo(
    () => loadGraph(canon).impacts(id, prose.map(sc => ({ scene: sc.scene, facts: sc.facts, events: sc.events }))),
    [canon, id, prose],
  )
  const proven = report.events.length + report.states.length + report.relationships.length +
    report.chapters.length + report.parts.length + report.scenes.length + report.downstream.length
  if (!proven && !report.questions.length) return null
  return (
    <>
      {proven > 0 && (
        <div className="field">
          <div className="k">depended on by</div>
          <div className="v">
            {report.events.map(e => (
              <div key={'e' + e.id + e.via}><Ref id={e.id} canon={canon} onSelect={onSelect} /> <span className="badge">{e.via}</span></div>
            ))}
            {report.states.map((st, i) => (
              <div key={'s' + i}><Ref id={st.entity} canon={canon} onSelect={onSelect} /> <span className="badge">state @ {st.at} · {st.via}</span></div>
            ))}
            {report.chapters.map(c => (
              <div key={'c' + c.id + c.via}><Ref id={c.id} canon={canon} onSelect={onSelect} /> <span className="badge">{c.via}</span></div>
            ))}
            {report.relationships.map(r => <div key={r}><code>{r}</code></div>)}
            {report.parts.map(pt => (
              <div key={'p' + pt}><Ref id={pt} canon={canon} onSelect={onSelect} /> <span className="badge">part of it</span></div>
            ))}
            {report.scenes.map(sc => <div key={sc}><code>{sc}</code> <span className="badge">prose rests on it</span></div>)}
            {report.downstream.length > 0 && (
              <div className="downstream">
                downstream: {report.downstream.map((d, i) => (
                  <span key={d.id}>{i > 0 && ' → '}<Ref id={d.id} canon={canon} onSelect={onSelect} /></span>
                ))}
                {report.downstreamTruncated && ' … (walk capped — the full chain is longer)'}
              </div>
            )}
          </div>
        </div>
      )}
      {report.questions.length > 0 && (
        <div className="field">
          <div className="k">asked — yours to answer</div>
          <div className="v asked">
            {report.questions.map(q => <div key={q.question}>{q.question}</div>)}
          </div>
        </div>
      )}
    </>
  )
}

function StateCard({
  s, canon, active, onSelect,
}: { s: State; canon: Canon; active: boolean; onSelect: (id: string) => void }) {
  const eraName = canon.timeline.eras.find(e => e.id === s.at.era)?.name ?? s.at.era
  return (
    <div className={`statecard${active ? ' active' : ''}`}>
      <div className="when">
        {s.at.date ?? '—'}{s.at.approximate ? ' (approx.)' : ''}
        <span className="era">{eraName}</span>
        {active && <span className="badge">state at T</span>}
      </div>
      {s.location && <div className="row"><b>at</b> <Ref id={s.location} canon={canon} onSelect={onSelect} />{s.age != null && <> · age {s.age}</>}</div>}
      {s.condition && <div className="row"><b>condition</b> {s.condition}</div>}
      {s.psychology && <div className="row"><b>psychology</b> {s.psychology}</div>}
      {s.beliefs?.length ? <div className="row"><b>believes</b> {s.beliefs.join(' · ')}</div> : null}
      {s.wants?.length ? <div className="row"><b>wants</b> {s.wants.join(' · ')}</div> : null}
      {s.fears?.length ? <div className="row"><b>fears</b> {s.fears.join(' · ')}</div> : null}
      {s.relationships?.length ? (
        <div className="row">
          <b>perceives</b>{' '}
          {s.relationships.map((r, i) => (
            <span key={r.toward}>
              {i > 0 && ' · '}
              <Ref id={r.toward} canon={canon} onSelect={onSelect} />: {r.stance}
            </span>
          ))}
        </div>
      ) : null}
      {s.possessions?.length ? (
        <div className="row"><b>carries</b> {s.possessions.map((p, i) => (
          <span key={p}>{i > 0 && ' · '}<Ref id={p} canon={canon} onSelect={onSelect} /></span>
        ))}</div>
      ) : null}
      {s.controlled_by && <div className="row"><b>controlled by</b> <Ref id={s.controlled_by} canon={canon} onSelect={onSelect} /></div>}
      {s.caused_by?.length ? (
        <div className="row"><b>because of</b> {s.caused_by.map((c, i) => (
          <span key={c}>{i > 0 && ' · '}<Ref id={c} canon={canon} onSelect={onSelect} /></span>
        ))}</div>
      ) : null}
    </div>
  )
}

function EntityProfile({
  e, canon, tEnd, onSelect, refAnchor, pov, children,
}: { e: Entity; canon: Canon; tEnd: number; onSelect: (id: string) => void; refAnchor?: string; pov?: PovProp; children?: ReactNode }) {
  const active = stateAt(e, tEnd, canon.timeline.eras)
  const edges = canon.relationships.filter(r => r.from === e.id || r.to === e.id)
  return (
    <div className="profile">
      <h3>
        {e.name}
        {e.status !== 'canon' && <span className={`badge ${e.status}`}>{e.status}</span>}
      </h3>
      <div className="sub">{e.type}{e.species ? ` · ${e.species}` : ''}{e.kind ? ` · ${e.kind}` : ''} · {e.id}
        {' '}<CopyRef text={refAnchor ? `${e.id}@${refAnchor}` : e.id} /></div>
      <div className="summary">{e.summary}</div>
      {e.appearance && <div className="field"><div className="k">appearance</div><div className="v">{e.appearance}</div></div>}
      {e.voice && <div className="field"><div className="k">voice / signature</div><div className="v">{e.voice}</div></div>}
      {e.sensory && <div className="field"><div className="k">sensory</div><div className="v">{e.sensory}</div></div>}
      {e.significance && <div className="field"><div className="k">significance</div><div className="v">{e.significance}</div></div>}
      {e.provenance && <ProvenanceField p={e.provenance} />}
      {edges.length > 0 && (
        <div className="field">
          <div className="k">objective edges</div>
          <div className="v">
            {edges.map(r => (
              <div key={r.id}>
                <Ref id={r.from} canon={canon} onSelect={onSelect} />
                {' '}{r.directed ? '→' : '↔'} <Ref id={r.to} canon={canon} onSelect={onSelect} />
                {' '}<span className="badge">{r.kind}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {pov && (
        <div className="field">
          <div className="k">through their eyes
            <button className="copyref" style={{ marginLeft: 6 }} onClick={pov.onToggle}>
              {pov.active ? 'on — show all' : 'off'}
            </button>
          </div>
          {pov.active && pov.view && (
            <div className="v">
              has seen {pov.view.seen.length} event{pov.view.seen.length === 1 ? '' : 's'} · been {pov.view.places.length} place{pov.view.places.length === 1 ? '' : 's'} · met {pov.view.met.length}
              {pov.view.unseen.length > 0 && (
                <div className="pov-unseen">
                  <span className="k">unknown to them (the reader may know)</span>
                  {pov.view.unseen.map(id => (
                    <div key={id}><Ref id={id} canon={canon} onSelect={onSelect} /></div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {(e.states?.length ?? 0) > 0 && (
        <div className="field">
          <div className="k">versioned journey ({e.states!.length} states)</div>
          {(e.states!.length > 1) && <CompareStates e={e} canon={canon} onSelect={onSelect} />}
          {e.states!.map((s, i) => {
            const lines = i > 0
              ? diffSummary(diffCharacter(e,
                  timeRefKey(e.states![i - 1].at, canon.timeline.eras),
                  timeRefKey(s.at, canon.timeline.eras),
                  canon.timeline.eras), canon)
              : []
            return (
              <div key={i}>
                {lines.length > 0 && <div className="state-delta">changed: {lines.join(' · ')}</div>}
                <StateCard s={s} canon={canon} active={s === active} onSelect={onSelect} />
              </div>
            )
          })}
        </div>
      )}
      {e.narrative_notes && <div className="field"><div className="k">notes / open questions</div><div className="v">{e.narrative_notes}</div></div>}
      {children}
    </div>
  )
}

function EventProfile({
  ev, canon, tEnd, onSelect, onJumpTo, refAnchor, children,
}: { ev: EventDoc; canon: Canon; tEnd: number; onSelect: (id: string) => void; onJumpTo?: (k: number) => void; refAnchor?: string; children?: ReactNode }) {
  const eraName = canon.timeline.eras.find(e => e.id === ev.when.era)?.name ?? ev.when.era
  const evKey = timeRefKey(ev.when, canon.timeline.eras)
  return (
    <div className="profile">
      <h3>
        {ev.title}
        {ev.status !== 'canon' && <span className={`badge ${ev.status}`}>{ev.status}</span>}
      </h3>
      <div className="sub">event · {ev.scope} · {ev.when.date ?? eraName}{ev.when.approximate ? ' (approx.)' : ''}
        {' '}<CopyRef text={refAnchor ? `${ev.id}@${refAnchor}` : ev.id} /></div>
      {evKey > tEnd && (
        <div className="sub notyet">
          hasn't happened yet at the world's moment
          {onJumpTo && <> — <a className="linklike" onClick={() => onJumpTo(evKey)}>jump the world here</a></>}
        </div>
      )}
      <div className="summary">{ev.summary}</div>
      {ev.where && <div className="field"><div className="k">where</div><div className="v"><Ref id={ev.where} canon={canon} onSelect={onSelect} /></div></div>}
      {ev.participants?.length ? (
        <div className="field"><div className="k">participants</div><div className="v">
          {ev.participants.map(p => (
            <div key={p.entity}><Ref id={p.entity} canon={canon} onSelect={onSelect} /> <span className="badge">{p.role}</span></div>
          ))}
        </div></div>
      ) : null}
      {ev.witnesses?.length ? (
        <div className="field"><div className="k">witnesses</div><div className="v">
          {ev.witnesses.map((w, i) => <span key={w}>{i > 0 && ' · '}<Ref id={w} canon={canon} onSelect={onSelect} /></span>)}
        </div></div>
      ) : null}
      {ev.causes?.length ? (
        <div className="field"><div className="k">because of</div><div className="v">
          {ev.causes.map((c, i) => <span key={c}>{i > 0 && ' · '}<Ref id={c} canon={canon} onSelect={onSelect} /></span>)}
        </div></div>
      ) : null}
      {ev.leads_to?.length ? (
        <div className="field"><div className="k">leads to</div><div className="v">
          {ev.leads_to.map((c, i) => <span key={c}>{i > 0 && ' · '}<Ref id={c} canon={canon} onSelect={onSelect} /></span>)}
        </div></div>
      ) : null}
      {ev.provenance && <ProvenanceField p={ev.provenance} />}
      {ev.narrative_notes && <div className="field"><div className="k">notes</div><div className="v">{ev.narrative_notes}</div></div>}
      {children}
    </div>
  )
}

function ChapterProfile({
  c, canon, onSelect,
}: { c: Chapter; canon: Canon; onSelect: (id: string) => void }) {
  const s = dateOf(c.span.start)
  const e = dateOf(c.span.end)
  return (
    <div className="profile">
      <h3>
        {c.order}. {c.title}
        {c.status !== 'canon' && <span className={`badge ${c.status}`}>{c.status}</span>}
      </h3>
      <div className="sub">chapter · {c.part} · {s} → {e} <CopyRef text={c.id} /></div>
      <div className="summary">{c.summary}</div>
      {c.pov && <div className="field"><div className="k">pov</div><div className="v"><Ref id={c.pov} canon={canon} onSelect={onSelect} /></div></div>}
      {c.events?.length ? (
        <div className="field"><div className="k">events</div><div className="v">
          {c.events.map(ev => <div key={ev}><Ref id={ev} canon={canon} onSelect={onSelect} /></div>)}
        </div></div>
      ) : null}
      {c.locations?.length ? (
        <div className="field"><div className="k">locations</div><div className="v">
          {c.locations.map((p, i) => <span key={p}>{i > 0 && ' · '}<Ref id={p} canon={canon} onSelect={onSelect} /></span>)}
        </div></div>
      ) : null}
      {c.notes && <div className="field"><div className="k">notes</div><div className="v">{c.notes}</div></div>}
    </div>
  )
}

/** "Why is this here?" (A44-2): the element's narrative role, traced from
 *  edges the record already holds — introduced where, planted and paid off
 *  where, carried by which theme. The dependents half lives in
 *  ImpactSection above, which shipped first; this section adds the rest,
 *  and renders SILENCE as a finding: "the record does not say" is the
 *  orphan report's information, per element, where the author is looking. */
function WhySection({ canon, id, prose, onSelect }: {
  canon: Canon; id: string; prose: ProseScene[]; onSelect: (id: string) => void
}) {
  const why = useMemo(
    () => loadGraph(canon).whyHere(id, prose.map(sc => ({ scene: sc.scene, chapter: sc.chapter, facts: sc.facts, events: sc.events }))),
    [canon, id, prose],
  )
  const has = why.introduced || why.setup.length || why.payoffs.length || why.themes.length || why.silences.length
  if (!has) return null
  return (
    <div className="field">
      <div className="k">why this is here</div>
      <div className="v">
        {why.introduced && (
          <div>
            introduced <Ref id={why.introduced.chapter} canon={canon} onSelect={onSelect} />
            {why.introduced.scene && <> · <code>{why.introduced.scene}</code></>}
            {' '}<span className="badge">{why.introduced.via}</span>
          </div>
        )}
        {why.setup.map((x, i) => (
          <div key={'su' + i}>planted by <Ref id={x.from} canon={canon} onSelect={onSelect} /> <span className="badge">{x.via}</span></div>
        ))}
        {why.payoffs.map((x, i) => (
          <div key={'po' + i}>
            plants <Ref id={x.to} canon={canon} onSelect={onSelect} />{' '}
            <span className="badge">{x.via}</span>
            {!x.firesOnPage && <span className="badge silence" title="Nothing downstream of this payoff is on the page — planted, never fired. The dangling-payoff report flags this same edge.">never fires</span>}
          </div>
        ))}
        {why.themes.map(th => (
          <div key={th.id}>carried by <Ref id={th.id} canon={canon} onSelect={onSelect} /> ({th.name})</div>
        ))}
        {/* Silence is a finding, not an empty state: each question the walks
            cannot answer says so in words, in the proven register — an
            element the record cannot place is editorial information. */}
        {why.silences.map((line, i) => (
          <div key={'si' + i} className="silence-line">{line}</div>
        ))}
      </div>
    </div>
  )
}

export function ProfilePanel({
  canon, id, tEnd, onSelect, prose, onJumpTo, refAnchor, pov,
}: { canon: Canon; id: string | null; tEnd: number; onSelect: (id: string) => void; prose: ProseScene[]; onJumpTo?: (k: number) => void; refAnchor?: string; pov?: PovProp }) {
  if (!id) return <div className="empty">Select a character, place, or event.</div>
  const impact = <>
    <WhySection canon={canon} id={id} prose={prose} onSelect={onSelect} />
    <ImpactSection canon={canon} id={id} prose={prose} onSelect={onSelect} />
  </>
  const e = canon.entities[id]
  if (e) return <EntityProfile e={e} canon={canon} tEnd={tEnd} onSelect={onSelect} refAnchor={refAnchor} pov={pov}>{impact}</EntityProfile>
  const ev = canon.events[id]
  if (ev) return <EventProfile ev={ev} canon={canon} tEnd={tEnd} onSelect={onSelect} onJumpTo={onJumpTo} refAnchor={refAnchor}>{impact}</EventProfile>
  const ch = (canon.chapters ?? []).find(c => c.id === id)
  if (ch) return <ChapterProfile c={ch} canon={canon} onSelect={onSelect} />
  return <div className="empty">Unknown id: {id}</div>
}
