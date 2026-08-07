import { useMemo, useState } from 'react'
import type { Canon, DocArticle } from '../canon'
import { dateOf } from '../canon'
import { mdToHtml } from '../md'

const TYPE_LABEL: Record<string, string> = {
  character: 'Characters', place: 'Places', faction: 'Factions', object: 'Objects',
}

/** The story encyclopedia: docs/ articles rendered with working wikilinks,
 *  a canon facts panel for bound articles, and backlinks. */
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

  const [sel, setSel] = useState<string | null>(articles[0]?.path ?? null)
  const article = articles.find(a => a.path === sel) ?? articles[0]
  const entity = article?.canon ? canon.entities[article.canon] : undefined

  const backlinks = useMemo(() => {
    if (!article?.canon) return []
    const needleA = `[[${article.canon}]]`, needleB = `[[${article.canon}|`
    return articles.filter(a => a.path !== article.path && (a.body.includes(needleA) || a.body.includes(needleB)))
  }, [articles, article])

  const title = (a: DocArticle) =>
    a.canon ? canon.entities[a.canon]?.name ?? a.canon
      : a.path.replace(/^docs\//, '').replace(/\.md$/, '')

  const onBodyClick = (ev: React.MouseEvent) => {
    const t = (ev.target as HTMLElement).closest('a.wikilink') as HTMLElement | null
    if (!t) return
    ev.preventDefault()
    const id = t.dataset.id!
    const bound = byCanon.get(id)
    if (bound) setSel(bound.path)
    else onOpenWorld(id)   // no article — show it in the world view instead
  }

  if (!article) return <div className="empty">No docs articles in this story yet.</div>

  return (
    <div className="wiki-layout">
      <nav className="side-nav">
        {groups.map(([label, list]) => (
          <div key={label}>
            <h3>{label}</h3>
            {list.map(a => (
              <button key={a.path} className={a.path === article.path ? 'navitem sel' : 'navitem'}
                onClick={() => setSel(a.path)}>
                {title(a)}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <article className="mdbody" onClick={onBodyClick}
        dangerouslySetInnerHTML={{ __html: mdToHtml(article.body) }} />

      <aside className="wiki-aside">
        {entity && (
          <div className="facts">
            <h3>Canon facts</h3>
            <div className="frow"><span>id</span><code>{entity.id}</code></div>
            <div className="frow"><span>type</span>{entity.type} · {entity.status}</div>
            {(dateOf(entity.born) ?? dateOf(entity.created)) && (
              <div className="frow"><span>from</span>{dateOf(entity.born) ?? dateOf(entity.created)}</div>
            )}
            {(dateOf(entity.died) ?? dateOf(entity.destroyed)) && (
              <div className="frow"><span>until</span>{dateOf(entity.died) ?? dateOf(entity.destroyed)}</div>
            )}
            {entity.part_of && (
              <div className="frow"><span>part of</span>
                <a className="linklike" onClick={() => { const b = byCanon.get(entity.part_of!); b ? setSel(b.path) : onOpenWorld(entity.part_of!) }}>{entity.part_of}</a>
              </div>
            )}
            <p className="fsummary">{entity.summary}</p>
            <button className="themeToggle" onClick={() => onOpenWorld(entity.id)}>View in world →</button>
          </div>
        )}
        <div className="facts">
          <h3>Backlinks</h3>
          {backlinks.length
            ? backlinks.map(b => (
              <button key={b.path} className="navitem" onClick={() => setSel(b.path)}>{title(b)}</button>
            ))
            : <p className="fsummary">{article.canon ? 'No article links here yet.' : 'Backlinks appear for entity articles.'}</p>}
        </div>
      </aside>
    </div>
  )
}
