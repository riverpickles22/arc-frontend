import { useMemo, useRef, useState } from 'react'
import type { Canon, Chapter, DocArticle, Entity } from '../canon'
import { dateOf } from '../canon'
import { mdToHtml, slugOf } from '../md'

const TYPE_LABEL: Record<string, string> = {
  character: 'Characters', place: 'Places', faction: 'Factions', object: 'Objects',
}

/** First real paragraph of an article body — skips headings, blockquotes,
 *  lists, and tables. The excerpt shown on the story landing page. */
function firstParagraph(body: string): string | undefined {
  for (const block of body.split(/\n{2,}/)) {
    const t = block.trim()
    if (!t || /^[#>\-*|]/.test(t)) continue
    return t.replace(/\n/g, ' ')
  }
}

/** The themes table from a hand-written vision doc, when the story has one.
 *  Hand-written docs win over anything we could synthesize. */
function themesFrom(articles: DocArticle[]): { theme: string; carriers: string }[] {
  const vision = articles.find(a => /(^|\/)vision\.md$/.test(a.path))
  // No /m flag: $ must mean end-of-document, not end-of-line, or the lazy
  // capture stops at the first line break.
  const section = vision?.body.match(/(?:^|\n)## Themes\s*\n([\s\S]*?)(?=\n## |$)/)
  if (!section) return []
  const rows: { theme: string; carriers: string }[] = []
  for (const line of section[1].split('\n')) {
    const cells = line.split('|').map(c => c.trim())
    if (cells.length >= 3 && cells[1] && cells[1] !== 'Theme' && !/^[-: ]+$/.test(cells[1])) {
      rows.push({ theme: cells[1], carriers: cells[2] })
    }
  }
  return rows
}

/** Chapters grouped into the story's parts, reading order preserved. */
function partsOf(chapters: Chapter[]): { label: string; chapters: Chapter[] }[] {
  const out: { label: string; chapters: Chapter[] }[] = []
  for (const c of chapters) {
    const label = c.part ?? (c.order === 0 ? 'Prologue' : 'Chapters')
    const last = out[out.length - 1]
    if (last && last.label === label) last.chapters.push(c)
    else out.push({ label, chapters: [c] })
  }
  return out
}

/** The synthesized story landing article, as markdown. Every fact comes from
 *  canon or the docs; nothing here is authored twice. */
function landingMd(canon: Canon, articles: DocArticle[], byCanon: Map<string, DocArticle>): string {
  const s = canon.story
  const chapters = [...canon.chapters].sort((a, b) => a.order - b.order)
  const md: string[] = [`# ${s.title}`, '']
  md.push(`*${s.logline.replace(/\s+/g, ' ').trim()}*`, '')
  if (s.genre || s.setting) {
    md.push([s.genre && `**${s.genre}**`, s.setting && `set in ${s.setting}`].filter(Boolean).join(', ') + '.', '')
  }

  const excerptOf = (e: Entity) => {
    const a = byCanon.get(e.id)
    const p = a ? firstParagraph(a.body) : undefined
    return p ?? e.summary.replace(/\s+/g, ' ').trim()
  }
  const withArticles = (type: string) => {
    const protagonists = (s.protagonists ?? []).map(id => canon.entities[id]).filter(e => e?.type === type)
    const rest = Object.values(canon.entities)
      .filter(e => e.type === type && byCanon.has(e.id) && !protagonists.includes(e))
      .sort((a, b) => a.name.localeCompare(b.name))
    return [...protagonists, ...rest]
  }

  if (chapters.length) {
    md.push('## Plot', '')
    for (const part of partsOf(chapters)) {
      if (part.label !== 'Chapters') md.push(`### ${part.label}`, '')
      for (const c of part.chapters) {
        const label = c.order === 0 ? 'Prologue' : `${c.order}.`
        md.push(`**${label} ${c.title}** — ${c.summary.replace(/\s+/g, ' ').trim()}`, '')
      }
    }
  }

  const characters = withArticles('character')
  if (characters.length) {
    md.push('## Core characters', '')
    for (const e of characters) md.push(`**[[${e.id}|${e.name}]]** — ${excerptOf(e)}`, '')
  }

  const places = withArticles('place')
  if (places.length) {
    md.push('## Places', '')
    for (const e of places) md.push(`**[[${e.id}|${e.name}]]** — ${excerptOf(e)}`, '')
  }

  const themes = themesFrom(articles)
  md.push('## Themes & metaphors', '')
  if (themes.length) for (const t of themes) md.push(`- **${t.theme}** — ${t.carriers}`)
  else for (const t of s.themes ?? []) md.push(`- ${t}`)

  return md.join('\n')
}

/** The story encyclopedia, Wikipedia-shaped: a synthesized landing article
 *  (lead, infobox, plot by part, core characters, places, themes), entity
 *  articles with infobox + relationships, per-article TOC, search, and
 *  See also from backlinks. */
export function WikiView({ canon, articles, onOpenWorld }: {
  canon: Canon
  articles: DocArticle[]
  onOpenWorld: (id: string) => void
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

  // null = the story landing page, the wiki's front door.
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const bodyRef = useRef<HTMLElement>(null)

  const article = sel ? articles.find(a => a.path === sel) : undefined
  const entity = article?.canon ? canon.entities[article.canon] : undefined
  const home = sel === null

  const title = (a: DocArticle) =>
    a.canon ? canon.entities[a.canon]?.name ?? a.canon
      : a.path.replace(/^docs\//, '').replace(/\.md$/, '')

  const md = useMemo(
    () => (home ? landingMd(canon, articles, byCanon) : article?.body ?? ''),
    [home, canon, articles, byCanon, article],
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
  }, [q, articles]) // eslint-disable-line react-hooks/exhaustive-deps

  const goTo = (id: string) => {
    const bound = byCanon.get(id)
    if (bound) setSel(bound.path)
    else onOpenWorld(id)   // no article — show it in the world view instead
  }

  const onBodyClick = (ev: React.MouseEvent) => {
    const t = (ev.target as HTMLElement).closest('a.wikilink') as HTMLElement | null
    if (!t) return
    ev.preventDefault()
    goTo(t.dataset.id!)
  }

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
                onClick={() => setSel(a.path)}>{title(a)}</button>
            ))}
          </div>
        ) : (
          <>
            <button className={home ? 'navitem home sel' : 'navitem home'} onClick={() => setSel(null)}>
              ⌂ {canon.story.title}
            </button>
            {groups.map(([label, list]) => (
              <div key={label}>
                <h3>{label}</h3>
                {list.map(a => (
                  <button key={a.path} className={a.path === sel ? 'navitem sel' : 'navitem'}
                    onClick={() => setSel(a.path)}>
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
              <div className="frow"><span>id</span><code>{entity.id}</code></div>
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
                <button key={b.path} className="navitem" onClick={() => setSel(b.path)}>{title(b)}</button>
              ))
              : <p className="fsummary">{article?.canon ? 'No article links here yet.' : 'See also appears for entity articles.'}</p>}
          </div>
        )}
      </aside>
    </div>
  )
}
