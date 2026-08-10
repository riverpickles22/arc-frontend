import { useCallback, useMemo, useRef, useState } from 'react'
import type { Canon, DocArticle, ProseScene } from '../canon'
import { dateOf } from '../canon'
import { mdToHtml, slugOf } from '../md'
import { landingMd } from '../wiki-landing'
import { wikilinkClickHandler } from '../wikilinks'
import { CopyRef } from './CopyRef'

const TYPE_LABEL: Record<string, string> = {
  character: 'Characters', place: 'Places', faction: 'Factions', object: 'Objects',
}

// Story documents are known by filename; the ones with a real role get a real
// name rather than a bare slug.
const DOC_TITLE: Record<string, string> = {
  style: 'Prose style contract', vision: 'Vision', world: 'World',
}

/** The story encyclopedia, Wikipedia-shaped: a synthesized landing article
 *  (lead, infobox, plot by part, core characters, places, themes), entity
 *  articles with infobox + relationships, per-article TOC, search, and
 *  See also from backlinks. */
export function WikiView({ canon, articles, scenes, onOpenWorld, sel, onSel }: {
  canon: Canon
  articles: DocArticle[]
  /** bound scenes — themes say where they appear on the page (§15) */
  scenes: ProseScene[]
  onOpenWorld: (id: string) => void
  /** The open article's path; null = the story landing page. Lifted so the
   *  URL route can carry it and the position survives page switches. */
  sel: string | null
  onSel: (path: string | null) => void
}) {
  const byCanon = useMemo(() => {
    const m = new Map<string, DocArticle>()
    for (const a of articles) if (a.canon) m.set(a.canon, a)
    return m
  }, [articles])

  const groups = useMemo(() => {
    const g = new Map<string, DocArticle[]>()
    for (const a of articles) {
      const type = a.canon ? canon.entities[a.canon]?.type : undefined
      const label = type ? TYPE_LABEL[type] ?? 'Entities' : 'Story documents'
      if (!g.has(label)) g.set(label, [])
      g.get(label)!.push(a)
    }
    const order = ['Story documents', 'Characters', 'Places', 'Factions', 'Objects', 'Entities']
    return [...g.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
  }, [articles, canon])

  const [q, setQ] = useState('')
  const bodyRef = useRef<HTMLElement>(null)

  const article = sel ? articles.find(a => a.path === sel) : undefined
  const entity = article?.canon ? canon.entities[article.canon] : undefined
  const home = sel === null

  const title = useCallback((a: DocArticle) => {
    if (a.canon) return canon.entities[a.canon]?.name ?? a.canon
    const slug = a.path.replace(/^docs\//, '').replace(/\.md$/, '')
    return DOC_TITLE[slug] ?? slug
  }, [canon])

  const md = useMemo(
    () => (home ? landingMd(canon, articles, byCanon, scenes.map(s => ({ scene: s.scene, motifs: s.contract?.motifs }))) : article?.body ?? ''),
    [home, canon, articles, byCanon, article, scenes],
  )

  // TOC from the article's own headings; shown when there is enough structure.
  const toc = useMemo(
    () => [...md.matchAll(/^(#{2,3}) (.*)$/gm)].map(m => ({ depth: m[1].length, text: m[2], id: slugOf(m[2]) })),
    [md],
  )

  const backlinks = useMemo(() => {
    if (!article?.canon) return []
    const needleA = `[[${article.canon}]]`, needleB = `[[${article.canon}|`
    return articles.filter(a => a.path !== article.path && (a.body.includes(needleA) || a.body.includes(needleB)))
  }, [articles, article])

  const edges = useMemo(
    () => (entity ? canon.relationships.filter(r => r.from === entity.id || r.to === entity.id) : []),
    [canon, entity],
  )

  // Search across article titles and bodies; title hits rank first.
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return null
    const inTitle = articles.filter(a => title(a).toLowerCase().includes(needle))
    const inBody = articles.filter(a => !inTitle.includes(a) && a.body.toLowerCase().includes(needle))
    return [...inTitle, ...inBody]
  }, [q, articles, title])

  const goTo = (id: string) => {
    const bound = byCanon.get(id)
    if (bound) onSel(bound.path)
    else onOpenWorld(id)   // no article — show it in the world view instead
  }

  const onBodyClick = wikilinkClickHandler(goTo)

  const jump = (id: string) =>
    bodyRef.current?.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const lifespan = entity && {
    from: dateOf(entity.born) ?? dateOf(entity.created) ?? dateOf(entity.span?.start),
    until: dateOf(entity.died) ?? dateOf(entity.destroyed) ?? dateOf(entity.span?.end),
  }

  return (
    <div className="wiki-layout">
      <nav className="side-nav">
        <input className="wiki-search" type="search" placeholder="Search the wiki…"
          value={q} onChange={ev => setQ(ev.target.value)} />
        {hits ? (
          <div>
            <h3>{hits.length ? `Results (${hits.length})` : 'No results'}</h3>
            {hits.map(a => (
              <button key={a.path} className={a.path === sel ? 'navitem sel' : 'navitem'}
                onClick={() => onSel(a.path)}>{title(a)}</button>
            ))}
          </div>
        ) : (
          <>
            <button className={home ? 'navitem home sel' : 'navitem home'} onClick={() => onSel(null)}>
              ⌂ {canon.story.title}
            </button>
            {groups.map(([label, list]) => (
              <div key={label}>
                <h3>{label}</h3>
                {list.map(a => (
                  <button key={a.path} className={a.path === sel ? 'navitem sel' : 'navitem'}
                    onClick={() => onSel(a.path)}>
                    {title(a)}
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </nav>

      <article ref={bodyRef} className="mdbody" onClick={onBodyClick}
        dangerouslySetInnerHTML={{ __html: mdToHtml(md) }} />

      <aside className="wiki-aside">
        {home && (
          <div className="infobox">
            <div className="ib-head">{canon.story.title}</div>
            <div className="ib-body">
              {canon.story.genre && <div className="frow"><span>genre</span>{canon.story.genre}</div>}
              {canon.story.setting && <div className="frow"><span>setting</span>{canon.story.setting}</div>}
              <div className="frow"><span>status</span>{canon.story.status}</div>
              <div className="frow"><span>chapters</span>{canon.chapters.length}</div>
              <div className="frow"><span>cast</span>
                <span>{(canon.story.protagonists ?? []).map((id, i) => (
                  <span key={id}>{i > 0 && ' · '}
                    <a className="linklike" onClick={() => goTo(id)}>{canon.entities[id]?.name ?? id}</a>
                  </span>
                ))}</span>
              </div>
            </div>
          </div>
        )}

        {entity && (
          <div className="infobox">
            <div className="ib-head">{entity.name}
              <span className="ib-type">{entity.type} · {entity.status}</span>
            </div>
            <div className="ib-body">
              <div className="frow"><span>id</span><span><code>{entity.id}</code> <CopyRef text={entity.id} /></span></div>
              {entity.aliases?.length ? <div className="frow"><span>aliases</span>{entity.aliases.join(', ')}</div> : null}
              {(entity.kind ?? entity.species) && <div className="frow"><span>kind</span>{entity.kind ?? entity.species}</div>}
              {lifespan?.from && <div className="frow"><span>from</span>{lifespan.from}</div>}
              {lifespan?.until && <div className="frow"><span>until</span>{lifespan.until}</div>}
              {entity.part_of && (
                <div className="frow"><span>part of</span>
                  <a className="linklike" onClick={() => goTo(entity.part_of!)}>
                    {canon.entities[entity.part_of]?.name ?? entity.part_of}
                  </a>
                </div>
              )}
              {entity.provenance && (
                <div className="frow"><span>provenance</span>
                  <span><span className={`badge prov-${entity.provenance.register}`}>{entity.provenance.register}</span>
                    {entity.provenance.sources?.length ? <> {entity.provenance.sources.map(s => <code key={s}> {s}</code>)}</> : null}
                  </span>
                </div>
              )}
              {edges.length > 0 && (
                <div className="ib-rels">
                  <h3>Relationships</h3>
                  {edges.map(r => {
                    const otherId = r.from === entity.id ? r.to : r.from
                    return (
                      <div key={r.id} className="frow">
                        <span>{r.kind.replace(/-/g, ' ')}</span>
                        <a className="linklike" onClick={() => goTo(otherId)}>
                          {canon.entities[otherId]?.name ?? otherId}
                        </a>
                      </div>
                    )
                  })}
                </div>
              )}
              <p className="fsummary">{entity.summary}</p>
              <button className="themeToggle" onClick={() => onOpenWorld(entity.id)}>View in world →</button>
            </div>
          </div>
        )}

        {toc.length >= 2 && (
          <div className="facts wiki-toc">
            <h3>Contents</h3>
            {toc.map(t => (
              <button key={t.id} className={`navitem d${t.depth}`} onClick={() => jump(t.id)}>{t.text}</button>
            ))}
          </div>
        )}

        {!home && (
          <div className="facts">
            <h3>See also</h3>
            {backlinks.length
              ? backlinks.map(b => (
                <button key={b.path} className="navitem" onClick={() => onSel(b.path)}>{title(b)}</button>
              ))
              : <p className="fsummary">{article?.canon ? 'No article links here yet.' : 'See also appears for entity articles.'}</p>}
          </div>
        )}
      </aside>
    </div>
  )
}
